import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { farmRuntime } from './runtime';
import { integrationConfig } from './integration-config';

@ApiTags('Platform')
@Controller({ path: 'platform', version: '1' })
export class PlatformController {
  @Get('status')
  status() {
    return {
      data: {
        runtime: farmRuntime(),
        integrations: integrationConfig(),
      },
    };
  }
}

@ApiTags('Admin - Platform')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller({ path: 'admin/platform', version: '1' })
export class AdminPlatformController {
  @Get('integrations')
  integrations() {
    return { data: integrationConfig() };
  }
}
