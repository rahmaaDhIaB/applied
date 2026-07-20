import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { GmailService } from './gmail.service';

@Controller('gmail')
export class GmailController {
  constructor(private readonly gmail: GmailService) {}

  /**
   * Temporary inspection endpoint. Before writing any classifier we want to see
   * what real emails actually look like, so this just fetches and returns them
   * raw. It will be replaced by a proper sync that stores and classifies.
   *
   * GET /gmail/peek?userId=xxx
   */
  @Get('peek')
  async peek(
    @Query('userId') userId: string,
    @Query('q') q?: string,
    @Query('max') max?: string,
  ) {
    if (!userId) throw new BadRequestException('userId query param required');

    const emails = await this.gmail.fetchRecent(
      userId,
      max ? Number(max) : 25,
      q || 'newer_than:90d',
    );
    return {
      count: emails.length,
      emails: emails.map((e) => ({
        from: e.fromEmail,
        name: e.fromName,
        subject: e.subject,
        snippet: e.snippet,
        receivedAt: e.receivedAt,
      })),
    };
  }
}
