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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrderCasesService } from './order-cases.service';

class CaseDto {
  @IsString() @MinLength(8) idempotencyKey!: string;
  @IsString() @MinLength(2) reason!: string;
}

@ApiTags('Merchant dropshipping')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'merchant/dropship', version: '1' })
export class MerchantOrderCasesController {
  constructor(private readonly cases: OrderCasesService) {}

  @Get('orders')
  list(@CurrentUser() u: any) {
    return this.cases.listForMerchant(u.id);
  }

  @Post('orders/:id/cancel')
  cancel(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CaseDto,
  ) {
    return this.cases.cancel(u.id, id, dto);
  }

  @Post('orders/:id/returns')
  returns(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CaseDto,
  ) {
    return this.cases.openCase(u.id, id, 'return', dto);
  }

  @Post('orders/:id/disputes')
  disputes(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CaseDto,
  ) {
    return this.cases.openCase(u.id, id, 'dispute', dto);
  }
}

@ApiTags('Suppliers')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'suppliers', version: '1' })
export class SupplierOrdersController {
  constructor(private readonly cases: OrderCasesService) {}

  @Get('orders')
  list(@CurrentUser() u: any) {
    return this.cases.listForSupplier(u.id);
  }
}
