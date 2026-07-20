import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * A single PrismaClient shared by the whole application.
 *
 * Why a service instead of `new PrismaClient()` wherever we need it: each client
 * opens its own connection pool. Several clients means several pools, and a free
 * Postgres tier runs out of connections quickly. One service, one pool.
 *
 * Prisma 7 no longer ships its own query engine, so we hand it the standard `pg`
 * driver through an adapter.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      // Fail loudly at startup rather than on the first query.
      throw new Error('DATABASE_URL is not set — check api/.env');
    }

    super({ adapter: new PrismaPg({ connectionString }) });
  }

  // Nest calls this once while booting, so we connect at startup instead of
  // paying the connection cost on the first request.
  async onModuleInit() {
    await this.$connect();
  }

  // And this on shutdown, so connections are released cleanly.
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
