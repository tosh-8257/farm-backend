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
import { IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PartnerService } from './partner.service';
import { DispatchService } from './dispatch.service';

class ApplyDto {
  @IsIn(['individual_rider', 'individual_vehicle', 'logistics_company'])
  kind!: string;
  @IsString() @MinLength(2) legalName!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() serviceArea?: string;
  @IsOptional() @IsString() companyRegistration?: string;
}
class VehicleDto {
  @IsString() @MinLength(2) category!: string;
  @IsString() @MinLength(2) makeModel!: string;
  @IsString() @MinLength(2) registration!: string;
  @IsNumber() @Min(0.01) capacityKg!: number;
}
class DriverDto {
  @IsString() @MinLength(2) legalName!: string;
  @IsString() @MinLength(2) licenceRef!: string;
}
class ProofDto {
  @IsIn(['otp', 'signature', 'photo']) method!: 'otp' | 'signature' | 'photo';
  @IsOptional() @IsString() reference?: string;
}
class VerifyDto {
  @IsString() @MinLength(4) code!: string;
}
class AdminPartnerDto {
  @IsString() status!: string;
  @IsOptional() @IsString() notes?: string;
}

@ApiTags('Delivery partners')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'partners', version: '1' })
export class PartnerController {
  constructor(
    private readonly partners: PartnerService,
    private readonly dispatch: DispatchService,
  ) {}

  @Post('apply')
  apply(@CurrentUser() u: any, @Body() dto: ApplyDto) {
    return this.partners.apply(u.id, dto);
  }

  @Get('me')
  me(@CurrentUser() u: any) {
    return this.partners.me(u.id);
  }

  @Post('vehicles')
  vehicle(@CurrentUser() u: any, @Body() dto: VehicleDto) {
    return this.partners.addVehicle(u.id, dto);
  }

  @Post('drivers')
  driver(@CurrentUser() u: any, @Body() dto: DriverDto) {
    return this.partners.addDriver(u.id, dto);
  }

  @Post('jobs/:id/proof')
  proof(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProofDto,
  ) {
    return this.dispatch.recordProof(u.id, id, dto);
  }

  @Post('jobs/:id/proof/verify')
  verify(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyDto,
  ) {
    return this.dispatch.verifyProof(u.id, id, dto.code);
  }
}

@ApiTags('Admin - Partners')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller({ path: 'admin/partners', version: '1' })
export class AdminPartnerController {
  constructor(private readonly partners: PartnerService) {}

  @Post(':id/decision')
  decide(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminPartnerDto,
  ) {
    return this.partners.adminDecision(u.id, id, dto.status, dto.notes);
  }
}
