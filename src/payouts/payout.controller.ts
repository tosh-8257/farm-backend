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
import { IsString, MinLength } from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PayoutService } from './payout.service';

@ApiTags('Suppliers')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'suppliers/fulfilments', version: '1' })
export class SupplierDeliveryController {
  constructor(private readonly payouts: PayoutService) {}

  @Post(':id/deliver')
  deliver(@CurrentUser() u: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.payouts.confirmFulfilment(u.id, id);
  }
}

@ApiTags('Delivery partners')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'partners/jobs', version: '1' })
export class PartnerDeliveryController {
  constructor(private readonly payouts: PayoutService) {}

  @Post(':id/deliver')
  deliver(@CurrentUser() u: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.payouts.confirmJob(u.id, id);
  }
}

class DisputeDto {
  @IsString() @MinLength(2) reason!: string;
}

@ApiTags('Cargo')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'cargo/shipments', version: '1' })
export class ShipmentDisputeController {
  constructor(private readonly payouts: PayoutService) {}

  @Post(':id/disputes')
  dispute(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DisputeDto,
  ) {
    return this.payouts.openShipmentDispute(u.id, id, dto.reason);
  }
}

@ApiTags('Admin - Payouts')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller({ path: 'admin/payouts', version: '1' })
export class AdminPayoutController {
  constructor(private readonly payouts: PayoutService) {}

  @Get()
  list() {
    return this.payouts.list();
  }

  @Post(':id/unfreeze')
  unfreeze(@CurrentUser() u: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.payouts.unfreeze(u.id, id);
  }

  @Post(':id/reverse')
  reverse(@CurrentUser() u: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.payouts.reverse(u.id, id);
  }
}
