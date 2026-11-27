import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EcosystemOpsService } from './ecosystem-ops.service';

class StatusDto {
  @IsIn(['picked_up', 'in_transit', 'cancelled']) status!: string;
}
class DecisionDto {
  @IsIn(['accepted', 'rejected']) decision!: 'accepted' | 'rejected';
}
class OnlineDto {
  @IsBoolean() online!: boolean;
}
class DocDto {
  @IsString() @MinLength(2) kind!: string;
  @IsOptional() @IsString() expiresAt?: string;
}
class LocDto {
  @IsNumber() lat!: number;
  @IsNumber() lng!: number;
}
class CommissionDto {
  @IsNumber() bps!: number;
}
class TrackDto {
  @IsString() @MinLength(2) tracking!: string;
}
class RateDto {
  @IsOptional() @IsString() partnerId?: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsNumber() score!: number;
}
class RegionsDto {
  @IsString() @MinLength(2) regions!: string;
}

@ApiTags('Cargo')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'cargo/shipments', version: '1' })
export class CargoOpsController {
  constructor(private readonly ops: EcosystemOpsService) {}

  @Post(':id/events')
  event(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StatusDto,
  ) {
    return this.ops.shipmentEvent(u.id, id, dto.status);
  }
}

@ApiTags('Delivery partners')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'partners', version: '1' })
export class PartnerOpsController {
  constructor(private readonly ops: EcosystemOpsService) {}

  @Get('jobs')
  jobs(@CurrentUser() u: any, @Query('page') page?: string) {
    return this.ops.partnerJobs(u.id, Number(page) || 1);
  }

  @Post('jobs/:id/decision')
  decide(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecisionDto,
  ) {
    return this.ops.decideOffer(u.id, id, dto.decision);
  }

  @Post('availability')
  online(@CurrentUser() u: any, @Body() dto: OnlineDto) {
    return this.ops.availability(u.id, dto.online);
  }

  @Get('earnings')
  earnings(@CurrentUser() u: any) {
    return this.ops.earnings(u.id);
  }

  @Post('documents')
  document(@CurrentUser() u: any, @Body() dto: DocDto) {
    return this.ops.addDocument(u.id, dto.kind, dto.expiresAt);
  }

  @Post('ratings')
  ratePartner(@CurrentUser() u: any, @Body() dto: RateDto) {
    return this.ops.ratePartner(u.id, dto.partnerId ?? '', dto.score);
  }

  @Post('location')
  location(@CurrentUser() u: any, @Body() dto: LocDto) {
    return this.ops.locate(u.id, dto.lat, dto.lng);
  }
}

@ApiTags('Admin - Commerce')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller({ path: 'admin', version: '1' })
export class AdminOpsController {
  constructor(private readonly ops: EcosystemOpsService) {}

  @Post('dispatch/shipments/:id/auto')
  auto(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.autoDispatch(id);
  }

  @Post('commerce/commission')
  commission(@Body() dto: CommissionDto) {
    return this.ops.setCommission(dto.bps);
  }

  @Post('suppliers/products/:id/suspend')
  suspend(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.suspendProduct(id);
  }

  @Get('partners/documents/expiring')
  expiring() {
    return this.ops.expiringDocuments();
  }
}

@ApiTags('Merchant dropshipping')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'merchant/dropship', version: '1' })
export class SellerOpsController {
  constructor(private readonly ops: EcosystemOpsService) {}

  @Get('earnings')
  earnings(@CurrentUser() u: any) {
    return this.ops.sellerEarnings(u.id);
  }
}

@ApiTags('Suppliers')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'suppliers/fulfilments', version: '1' })
export class SupplierOpsController {
  constructor(private readonly ops: EcosystemOpsService) {}

  @Post('documents')
  document(@CurrentUser() u: any, @Body() dto: DocDto) {
    return this.ops.supplierDocument(u.id, dto.kind, dto.expiresAt);
  }

  @Post('regions')
  regions(@CurrentUser() u: any, @Body() dto: RegionsDto) {
    return this.ops.setRegions(u.id, dto.regions);
  }

  @Post('ratings')
  rate(@CurrentUser() u: any, @Body() dto: RateDto) {
    return this.ops.rateSupplier(u.id, dto.supplierId ?? '', dto.score);
  }

  @Post(':id/tracking')
  tracking(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TrackDto,
  ) {
    return this.ops.setTracking(u.id, id, dto.tracking);
  }
}
