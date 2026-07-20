import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GmailService, ParsedEmail } from '../gmail/gmail.service';
import { ClassifierService } from '../classifier/classifier.service';
import {
  companyKeyFromName,
  companyKeyFromEmail,
} from '../matching/company-key';
import { nextStatus } from './status-machine';
import { buildJobSearchQuery } from '../classifier/ats-domains';
import type { ApplicationStatus } from '../../generated/prisma/enums';

export interface SyncResult {
  fetched: number;
  jobRelated: number;
  applicationsTouched: number;
  transitions: number;
}

/**
 * Ties everything together: fetch mail -> classify -> match to an application ->
 * store the message and any status change. This is the orchestration layer; all
 * the real decisions live in the pure, tested modules it calls.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gmail: GmailService,
    private readonly classifier: ClassifierService,
  ) {}

  async syncUser(userId: string, max = 100): Promise<SyncResult> {
    // Let Gmail pre-filter to likely job mail so we don't fetch (and discard)
    // hundreds of newsletters. The classifier still vets each result locally.
    const emails = await this.gmail.fetchRecent(
      userId,
      max,
      buildJobSearchQuery(365),
    );

    const result: SyncResult = {
      fetched: emails.length,
      jobRelated: 0,
      applicationsTouched: 0,
      transitions: 0,
    };

    for (const email of emails) {
      const handled = await this.handleEmail(userId, email);
      if (handled.jobRelated) result.jobRelated++;
      if (handled.touchedApplication) result.applicationsTouched++;
      if (handled.transitioned) result.transitions++;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { lastSyncedAt: new Date() },
    });

    return result;
  }

  private async handleEmail(userId: string, email: ParsedEmail) {
    const outcome = {
      jobRelated: false,
      touchedApplication: false,
      transitioned: false,
    };

    const classification = this.classifier.classify(email);

    // Always store the raw message so a re-run is idempotent and we keep an
    // audit trail even of noise. gmailId is unique -> upsert can't duplicate.
    const stored = await this.prisma.emailMessage.upsert({
      where: { gmailId: email.gmailId },
      create: {
        userId,
        gmailId: email.gmailId,
        threadId: email.threadId,
        fromEmail: email.fromEmail,
        fromName: email.fromName,
        subject: email.subject,
        snippet: email.snippet,
        receivedAt: email.receivedAt,
        classification: classification.status,
        confidence: classification.confidence,
      },
      update: {
        classification: classification.status,
        confidence: classification.confidence,
      },
    });

    if (!classification.isJobRelated) return outcome;
    outcome.jobRelated = true;

    // Resolve which company this belongs to. Prefer the name pulled from the
    // subject; else the sender's own domain (only if it's a company domain, not
    // an ATS). We deliberately do NOT fall back to the sender's display name —
    // that's usually the ATS ("SmartRecruiters"), which would create a bogus
    // application. Better to leave the email job-related-but-unmatched.
    let companyName = classification.company;
    let companyKey = companyName ? companyKeyFromName(companyName) : null;

    if (!companyKey) {
      const fromDomain = companyKeyFromEmail(email.fromEmail);
      if (fromDomain) {
        companyKey = fromDomain;
        companyName = fromDomain;
      }
    }

    if (!companyKey || !companyName) return outcome;

    const application = await this.findOrCreateApplication(
      userId,
      companyKey,
      companyName,
      email.receivedAt,
    );
    outcome.touchedApplication = true;

    // Link the message to its application.
    await this.prisma.emailMessage.update({
      where: { id: stored.id },
      data: { applicationId: application.id },
    });

    // Apply the state machine.
    const target = nextStatus(
      application.status,
      classification.status as ApplicationStatus,
    );
    if (target !== application.status) {
      await this.applyTransition(
        application.id,
        application.status,
        target,
        classification.reason,
        email.receivedAt,
      );
      outcome.transitioned = true;
    } else {
      // No status change, but the application saw activity — push lastEventAt
      // forward if this email is newer, so ghosting is measured correctly.
      if (email.receivedAt > application.lastEventAt) {
        await this.prisma.application.update({
          where: { id: application.id },
          data: { lastEventAt: email.receivedAt },
        });
      }
    }

    return outcome;
  }

  private async findOrCreateApplication(
    userId: string,
    companyKey: string,
    companyName: string,
    receivedAt: Date,
  ) {
    const existing = await this.prisma.application.findFirst({
      where: { userId, companyKey },
    });
    if (existing) return existing;

    return this.prisma.application.create({
      data: {
        userId,
        company: companyName,
        companyKey,
        status: 'APPLIED',
        appliedAt: receivedAt,
        lastEventAt: receivedAt,
      },
    });
  }

  private async applyTransition(
    applicationId: string,
    from: ApplicationStatus,
    to: ApplicationStatus,
    reason: string,
    at: Date,
  ) {
    // Update current status + record the transition in one transaction, so the
    // history and the current state can never disagree.
    await this.prisma.$transaction([
      this.prisma.application.update({
        where: { id: applicationId },
        data: { status: to, lastEventAt: at },
      }),
      this.prisma.statusEvent.create({
        data: { applicationId, from, to, reason },
      }),
    ]);
    this.logger.log(`Application ${applicationId}: ${from} -> ${to}`);
  }
}
