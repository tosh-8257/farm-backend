import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CommerceService } from './commerce.service';
import { BusinessOpsModule } from '../business-ops/business-ops.module';
import { ExternalStoresService } from './external-stores.service';
import { ExternalStoresController } from './external-stores.controller';
import { CommerceAiController, SettlementController } from './settlement.controller';
import { SettlementService } from './settlement.service';
import {
  AdminSuppliersController,
  MerchantDropshipController,
  SupplierController,
} from './commerce.controller';

@Module({
  imports: [AuditModule, AuthModule, BusinessOpsModule],
  controllers: [
    SupplierController,
    MerchantDropshipController,
    AdminSuppliersController,
    ExternalStoresController,
    CommerceAiController,
    SettlementController,
  ],
  providers: [CommerceService, ExternalStoresService, SettlementService],
  exports: [CommerceService, ExternalStoresService, SettlementService],
})
export class CommerceModule {}
