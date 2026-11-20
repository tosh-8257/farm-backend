import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, MinLength } from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BusinessAccessService } from '../business-ops/business-access.service';
import { ExternalStoresService } from './external-stores.service';

class ConnectStoreDto {
  @IsIn(['shopify', 'woocommerce']) platform!: 'shopify' | 'woocommerce';
  @IsString() @MinLength(3) shopDomain!: string;
}

@ApiTags('Business stores')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'business/stores', version: '1' })
export class ExternalStoresController {
  constructor(
    private readonly access: BusinessAccessService,
    private readonly stores: ExternalStoresService,
  ) {}

  @Post()
  async connect(@CurrentUser() u: any, @Body() dto: ConnectStoreDto) {
    const actor = await this.access.resolve(u.id, 'developers:manage');
    return this.stores.connect(actor.business.id, dto.platform, dto.shopDomain);
  }

  @Post(':id/sync')
  async sync(@CurrentUser() u: any, @Param('id', ParseUUIDPipe) id: string) {
    const actor = await this.access.resolve(u.id, 'developers:manage');
    return this.stores.sync(actor.business.id, id);
  }
}
