import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CommerceService } from './commerce.service';
import {
  AdminSuppliersController,
  MerchantDropshipController,
  SupplierController,
} from './commerce.controller';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [
    SupplierController,
    MerchantDropshipController,
    AdminSuppliersController,
  ],
  providers: [CommerceService],
  exports: [CommerceService],
})
export class CommerceModule {}
