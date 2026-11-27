import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../common/audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EscrowModule } from '../commerce/escrow.module';
import { CargoController } from './cargo.controller';
import { CargoService } from './cargo.service';
import { CargoAdminController } from './cargo-admin.controller';
import { CargoAdminService } from './cargo-admin.service';

@Module({
  imports: [AuthModule, AuditModule, NotificationsModule, EscrowModule],
  controllers: [CargoController, CargoAdminController],
  providers: [CargoService, CargoAdminService],
  exports: [CargoService],
})
export class CargoModule {}
