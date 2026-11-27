import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsString, Min, MinLength } from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CargoAdminService } from './cargo-admin.service';

class RateDto {
  @IsString() @MinLength(1) fromZone!: string;
  @IsString() @MinLength(1) toZone!: string;
  @IsNumber() @Min(0) baseFeeFarm!: number;
  @IsNumber() @Min(0) perKgFarm!: number;
}
class SplitDto {
  @IsNumber() farmShareBps!: number;
  @IsNumber() partnerShareBps!: number;
}
class ActiveDto {
  @IsBoolean() active!: boolean;
}

@ApiTags('Admin - Cargo')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller({ path: 'admin/cargo', version: '1' })
export class CargoAdminController {
  constructor(private readonly admin: CargoAdminService) {}

  @Get('rates')
  rates() {
    return this.admin.list();
  }

  @Get('zones')
  zones() {
    return this.admin.zones();
  }

  @Post('rates')
  create(@CurrentUser() u: any, @Body() dto: RateDto) {
    return this.admin.create(u.id, dto);
  }

  @Patch('split')
  split(@CurrentUser() u: any, @Body() dto: SplitDto) {
    return this.admin.setSplit(u.id, dto);
  }

  @Patch('rates/:id')
  active(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActiveDto,
  ) {
    return this.admin.setActive(u.id, id, dto.active);
  }
}
