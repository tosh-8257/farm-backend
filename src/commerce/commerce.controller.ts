import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CommerceService } from './commerce.service';

class ApplySupplierDto {
  @IsIn(['individual', 'business']) kind!: 'individual' | 'business';
  @IsString() @MinLength(2) legalName!: string;
  @IsOptional() @IsString() region?: string;
}
class ListingDto {
  @IsUUID() variantId!: string;
  @IsNumber() @Min(0.01) retailPrice!: number;
}
class OrderLineDto {
  @IsUUID() variantId!: string;
  @IsInt() @Min(1) qty!: number;
  @IsNumber() @Min(0.01) retail!: number;
}
class PlaceOrderDto {
  @IsString() @MinLength(8) idempotencyKey!: string;
  @IsOptional() @IsUUID() buyerUserId?: string;
  lines!: OrderLineDto[];
}
class PayOrderDto {
  @IsUUID() transactionId!: string;
}
class DecisionDto {
  @IsIn(['accepted', 'rejected']) decision!: 'accepted' | 'rejected';
}
class AdminDecisionDto {
  @IsString() status!: string;
  @IsOptional() @IsString() notes?: string;
}

@ApiTags('Suppliers')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'suppliers', version: '1' })
export class SupplierController {
  constructor(private readonly commerce: CommerceService) {}

  @Post('apply')
  apply(@CurrentUser() u: any, @Body() dto: ApplySupplierDto) {
    return this.commerce.applySupplier(u.id, dto);
  }

  @Get('me')
  me(@CurrentUser() u: any) {
    return this.commerce.ownSupplier(u.id);
  }

  @Post('fulfilments/:id/decision')
  decide(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecisionDto,
  ) {
    return this.commerce.supplierDecision(u.id, id, dto.decision);
  }
}

@ApiTags('Merchant dropshipping')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'merchant/dropship', version: '1' })
export class MerchantDropshipController {
  constructor(private readonly commerce: CommerceService) {}

  @Post('listings')
  list(@CurrentUser() u: any, @Body() dto: ListingDto) {
    return this.commerce.importListing(u.id, dto.variantId, dto.retailPrice);
  }

  @Post('orders')
  place(@CurrentUser() u: any, @Body() dto: PlaceOrderDto) {
    return this.commerce.placeOrder(u.id, dto);
  }

  @Post('orders/:id/pay')
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayOrderDto) {
    return this.commerce.markPaid(id, dto.transactionId);
  }

  @Post('orders/:id/forward')
  forward(@CurrentUser() u: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.forward(u.id, id);
  }
}

@ApiTags('Admin - Suppliers')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller({ path: 'admin/suppliers', version: '1' })
export class AdminSuppliersController {
  constructor(private readonly commerce: CommerceService) {}

  @Post(':id/decision')
  decide(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminDecisionDto,
  ) {
    return this.commerce.adminSupplierDecision(u.id, id, dto.status, dto.notes);
  }
}
