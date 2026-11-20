import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CommerceService } from './commerce.service';
import { BusinessOpsModule } from '../business-ops/business-ops.module';
import { ExternalStoresService } from './external-stores.service';
import { ExternalStoresController } from './external-stores.controller';
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
  ],
  providers: [CommerceService, ExternalStoresService],
  exports: [CommerceService, ExternalStoresService],
})
export class CommerceModule {}
