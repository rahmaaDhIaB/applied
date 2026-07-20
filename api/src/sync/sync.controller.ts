import { Controller, Post, Get, Query, BadRequestException } from '@nestjs/common';
import { SyncService } from './sync.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('sync')
export class SyncController {
  constructor(
    private readonly sync: SyncService,
    private readonly prisma: PrismaService,
  ) {}

  /** Kick a sync for a user. POST /sync?userId=xxx */
  @Post()
  async run(@Query('userId') userId: string) {
    if (!userId) throw new BadRequestException('userId query param required');
    return this.sync.syncUser(userId);
  }

  /** Read back what the sync produced. GET /sync/applications?userId=xxx */
  @Get('applications')
  async applications(@Query('userId') userId: string) {
    if (!userId) throw new BadRequestException('userId query param required');
    return this.prisma.application.findMany({
      where: { userId },
      orderBy: { lastEventAt: 'desc' },
      include: {
        events: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    });
  }
}
