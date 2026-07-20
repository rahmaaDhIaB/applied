import { Injectable, NotFoundException } from '@nestjs/common';
import { google } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';

/**
 * One parsed email, flattened into just the fields we care about. Gmail's raw
 * response is deeply nested; we pull the useful bits out here so the rest of the
 * app never has to know Gmail's shape.
 */
export interface ParsedEmail {
  gmailId: string;
  threadId: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  snippet: string;
  receivedAt: Date;
}

@Injectable()
export class GmailService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build a Gmail client authenticated as a specific user, using the tokens we
   * stored during OAuth. Passing the refresh_token means googleapis will
   * silently mint a new access token when the old one expires — we don't have
   * to handle expiry by hand.
   */
  private async getClientForUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    auth.setCredentials({
      access_token: user.accessToken,
      refresh_token: user.refreshToken,
    });

    return google.gmail({ version: 'v1', auth });
  }

  /**
   * Fetch recent emails for a user.
   *
   * Two Gmail calls per run + one per message: `messages.list` returns only ids,
   * then `messages.get` fills in each one. That N+1 is just how Gmail's API
   * works — there's no "give me the full list with bodies" endpoint.
   *
   * @param maxResults keep it small while developing so we don't hammer the API
   *                   or wait forever on a big inbox.
   */
  async fetchRecent(
    userId: string,
    maxResults = 25,
    query = 'newer_than:90d',
  ): Promise<ParsedEmail[]> {
    const gmail = await this.getClientForUser(userId);

    // `q` is Gmail's own search syntax — the same box you type in on gmail.com.
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
    });

    const messages = list.data.messages ?? [];
    const parsed: ParsedEmail[] = [];

    for (const { id } of messages) {
      if (!id) continue;

      const full = await gmail.users.messages.get({
        userId: 'me',
        id,
        // 'metadata' skips the body and attachments — we only need headers and
        // the snippet for now, and it's much lighter than pulling full bodies.
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });

      parsed.push(this.parseMessage(full.data));
    }

    return parsed;
  }

  /**
   * Turn Gmail's nested message object into our flat ParsedEmail.
   * Kept pure and separate so it's easy to unit-test against saved fixtures
   * later, without hitting the network.
   */
  private parseMessage(msg: {
    id?: string | null;
    threadId?: string | null;
    snippet?: string | null;
    internalDate?: string | null;
    payload?: { headers?: Array<{ name?: string | null; value?: string | null }> };
  }): ParsedEmail {
    const headers = msg.payload?.headers ?? [];
    const header = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ??
      '';

    const from = header('From'); // e.g. `Acme Careers <careers@acme.com>`
    const { fromName, fromEmail } = this.splitFrom(from);

    return {
      gmailId: msg.id ?? '',
      threadId: msg.threadId ?? '',
      fromEmail,
      fromName,
      subject: header('Subject'),
      snippet: msg.snippet ?? '',
      // internalDate is a string of epoch milliseconds. It's Gmail's own
      // received timestamp, which we trust over the Date header (senders lie).
      receivedAt: msg.internalDate
        ? new Date(Number(msg.internalDate))
        : new Date(),
    };
  }

  /**
   * Split `Acme Careers <careers@acme.com>` into name and email.
   * Some senders send just the bare address with no name.
   */
  private splitFrom(from: string): { fromName: string | null; fromEmail: string } {
    const match = from.match(/^\s*"?(.*?)"?\s*<(.+?)>\s*$/);
    if (match) {
      const name = match[1].trim();
      return { fromName: name || null, fromEmail: match[2].trim().toLowerCase() };
    }
    // No angle brackets: the whole thing is the address.
    return { fromName: null, fromEmail: from.trim().toLowerCase() };
  }
}
