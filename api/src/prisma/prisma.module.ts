import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * @Global means any module can inject PrismaService without importing this
 * module first. Database access is needed almost everywhere, so the alternative
 * is repeating the same import in every feature module.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
