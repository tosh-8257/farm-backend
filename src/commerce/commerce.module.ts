import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module';
import { PayoutModule } from '../payouts/payout.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';
import { CommerceService } from './commerce.service';
import { BusinessOpsModule } from '../business-ops/business-ops.module';
import { ExternalStoresService } from './external-stores.service';
import { ExternalStoresController } from './external-stores.controller';
import {
  CommerceAiController,
  SettlementController,
} from './settlement.controller';
import { SettlementService } from './settlement.service';
import {
  AdminSuppliersController,
  MerchantDropshipController,
  SupplierController,
} from './commerce.controller';
import { CatalogueService } from './catalogue.service';
import {
  MerchantCatalogueController,
  SupplierCatalogueController,
} from './catalogue.controller';
import { OrderCasesService } from './order-cases.service';
import {
  MerchantOrderCasesController,
  SupplierOrdersController,
} from './order-cases.controller';

@Module({
  imports: [
    AuditModule,
    AuthModule,
    BusinessOpsModule,
    PayoutModule,
    NotificationsModule,
  ],
  controllers: [
    SupplierController,
    MerchantDropshipController,
    AdminSuppliersController,
    ExternalStoresController,
    CommerceAiController,
    SettlementController,
    SupplierCatalogueController,
    MerchantCatalogueController,
    MerchantOrderCasesController,
    SupplierOrdersController,
  ],
  providers: [
    CommerceService,
    ExternalStoresService,
    SettlementService,
    CatalogueService,
    OrderCasesService,
  ],
  exports: [CommerceService, ExternalStoresService, SettlementService],
})
export class CommerceModule {}
