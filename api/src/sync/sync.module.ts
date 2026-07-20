import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { GmailModule } from '../gmail/gmail.module';
import { ClassifierService } from '../classifier/classifier.service';

@Module({
  imports: [GmailModule], // reuse the same GmailService
  controllers: [SyncController],
  providers: [SyncService, ClassifierService],
})
export class SyncModule {}
