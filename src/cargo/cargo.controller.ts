import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CargoService } from './cargo.service';
import { EscrowPayService } from '../commerce/escrow-pay.service';

class QuoteDto {
  @IsString() fromZone!: string;
  @IsString() toZone!: string;
  @IsNumber() @Min(0.01) weightKg!: number;
}
class BookDto extends QuoteDto {
  @IsString() @MinLength(8) idempotencyKey!: string;
  @IsOptional() @IsString() pickupAddress?: string;
  @IsOptional() @IsString() deliveryAddress?: string;
  @IsOptional() @IsString() orderId?: string;
  @IsOptional() @IsString() @MinLength(4) pin?: string;
  @IsOptional() @IsBoolean() biometric_auth?: boolean;
  @IsOptional() @IsString() device_fingerprint?: string;
}

@ApiTags('Cargo')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'cargo', version: '1' })
export class CargoController {
  constructor(
    private readonly cargo: CargoService,
    private readonly escrow: EscrowPayService,
  ) {}

  @Post('quotes')
  quote(@Body() dto: QuoteDto) {
    return this.cargo.quote(dto.fromZone, dto.toZone, dto.weightKg);
  }

  @Post('shipments')
  async book(@CurrentUser() u: any, @Body() dto: BookDto) {
    const quote = await this.cargo.quote(dto.fromZone, dto.toZone, dto.weightKg);
    const charge = await this.escrow.charge(u.id, {
      amount: quote.price_farm,
      idempotencyKey: `cargo-${dto.idempotencyKey}`,
      description: 'Cargo booking',
      pin: dto.pin,
      biometric_auth: dto.biometric_auth,
      device_fingerprint: dto.device_fingerprint,
    });
    return this.cargo.book(u.id, { ...dto, transactionId: charge.transactionId });
  }

  @Get('shipments')
  list(
    @CurrentUser() u: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
    @Query('status') status?: string,
  ) {
    return this.cargo.listMine(u.id, { page, limit, sort, status });
  }

  @Get('shipments/:id')
  one(@CurrentUser() u: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.cargo.getMine(u.id, id);
  }

  @Get('shipments/:id/receipt')
  receipt(@CurrentUser() u: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.cargo.receipt(u.id, id);
  }
}
