import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { DispatchService } from './dispatch.service';

class AssignDto {
  @IsUUID() partnerId!: string;
}
class FailDto {
  @IsString() @MinLength(2) reason!: string;
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

  @Post('jobs/:id/reassign')
  reassign(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignDto,
  ) {
    return this.dispatch.reassign(id, dto.partnerId, u.id);
  }

  @Post('jobs/:id/fail')
  fail(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FailDto,
  ) {
    return this.dispatch.fail(id, dto.reason, u.id);
  }
}
