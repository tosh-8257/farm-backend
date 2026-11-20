import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { IdempotencyService } from './idempotency.service';
import { PlatformJobsService } from './platform-jobs.service';
import { OperationalGrantsService } from './grants.service';
import {
  AdminPlatformController,
  PlatformController,
} from './platform.controller';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [PlatformController, AdminPlatformController],
  providers: [
    IdempotencyService,
    PlatformJobsService,
    OperationalGrantsService,
  ],
  exports: [IdempotencyService, PlatformJobsService, OperationalGrantsService],
})
export class PlatformModule {}
