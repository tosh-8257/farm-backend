import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../common/audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { AdminPartnerController, PartnerController } from './partner.controller';
import { PartnerService } from './partner.service';

@Module({
  imports: [AuthModule, AuditModule, NotificationsModule],
  controllers: [DispatchController, PartnerController, AdminPartnerController],
  providers: [DispatchService, PartnerService],
  exports: [DispatchService, PartnerService],
})
export class DispatchModule {}
