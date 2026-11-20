import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { DispatchService } from './dispatch.service';

class AssignDto {
  @IsUUID() partnerId!: string;
}

@ApiTags('Admin - Dispatch')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller({ path: 'admin/dispatch', version: '1' })
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Post('shipments/:id/job')
  open(@Param('id', ParseUUIDPipe) id: string) {
    return this.dispatch.openJob(id);
  }

  @Post('jobs/:id/assign')
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDto) {
    return this.dispatch.assign(id, dto.partnerId);
  }
}
