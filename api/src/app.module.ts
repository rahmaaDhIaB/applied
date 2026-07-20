import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { GmailModule } from './gmail/gmail.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    // Nest does not read .env on its own. isGlobal saves re-importing this in
    // every module that needs a config value.
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    GmailModule,
    SyncModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
