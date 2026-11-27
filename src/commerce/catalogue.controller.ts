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
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CatalogueService } from './catalogue.service';

class ProductDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() description?: string;
}
class VariantDto {
  @IsString() @MinLength(1) sku!: string;
  @IsNumber() @Min(0.01) wholesalePrice!: number;
  @IsInt() @Min(0) stock!: number;
  @IsOptional() @IsString() imageUrl?: string;
}
class StockDto {
  @IsString() @MinLength(8) idempotencyKey!: string;
  @IsInt() @Min(0) stock!: number;
}

@ApiTags('Supplier catalogue')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'suppliers/products', version: '1' })
export class SupplierCatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  @Post()
  create(@CurrentUser() u: any, @Body() dto: ProductDto) {
    return this.catalogue.createProduct(u.id, dto);
  }

  @Get()
  list(
    @CurrentUser() u: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
    @Query('status') status?: string,
  ) {
    return this.catalogue.listOwn(u.id, { page, limit, sort, status });
  }

  @Post(':id/variants')
  variant(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VariantDto,
  ) {
    return this.catalogue.addVariant(u.id, id, dto);
  }

  @Post(':id/publish')
  publish(@CurrentUser() u: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalogue.publish(u.id, id);
  }

  @Post('variants/:variantId/stock')
  stock(
    @CurrentUser() u: any,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: StockDto,
  ) {
    return this.catalogue.setStock(u.id, variantId, dto);
  }
}

@ApiTags('Merchant dropshipping')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'merchant/dropship/catalogue', version: '1' })
export class MerchantCatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  @Get()
  search(
    @CurrentUser() u: any,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
  ) {
    return this.catalogue.search(u.id, { q, category, page, limit, sort });
  }
}
