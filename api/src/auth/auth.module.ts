import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleService } from './google.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, GoogleService],
})
export class AuthModule {}
