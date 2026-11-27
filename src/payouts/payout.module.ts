import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../common/audit/audit.module';
import {
  AdminPayoutController,
  PartnerDeliveryController,
  ShipmentDisputeController,
  SupplierDeliveryController,
} from './payout.controller';
import { PayoutService } from './payout.service';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [
    SupplierDeliveryController,
    PartnerDeliveryController,
    ShipmentDisputeController,
    AdminPayoutController,
  ],
  providers: [PayoutService],
  exports: [PayoutService],
})
export class PayoutModule {}
