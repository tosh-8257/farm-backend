import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CargoService } from './cargo.service';

class QuoteDto {
  @IsString() fromZone!: string;
  @IsString() toZone!: string;
  @IsNumber() @Min(0.01) weightKg!: number;
}
class BookDto extends QuoteDto {
  @IsString() @MinLength(8) idempotencyKey!: string;
  @IsUUID() transactionId!: string;
  @IsOptional() @IsString() pickupAddress?: string;
  @IsOptional() @IsString() deliveryAddress?: string;
}

@ApiTags('Cargo')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'cargo', version: '1' })
export class CargoController {
  constructor(private readonly cargo: CargoService) {}

  @Post('quotes')
  quote(@Body() dto: QuoteDto) {
    return this.cargo.quote(dto.fromZone, dto.toZone, dto.weightKg);
  }

  @Post('shipments')
  book(@CurrentUser() u: any, @Body() dto: BookDto) {
    return this.cargo.book(u.id, dto);
  }

  @Get('shipments')
  list(@CurrentUser() u: any) {
    return this.cargo.listMine(u.id);
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
