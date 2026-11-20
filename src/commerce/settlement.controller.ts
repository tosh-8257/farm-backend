import { Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { SettlementService } from './settlement.service';

@ApiTags('Commerce AI')
@Controller({ path: 'commerce/ai', version: '1' })
export class CommerceAiController {
  @Get('authority')
  authority() {
    return {
      data: {
        autonomous_payments: false,
        pin_or_biometric_required: true,
        note: 'This phase adds no path that sends money. Mkulima still cannot pay without a user PIN or biometric confirmation on the existing assistant endpoints.',
      },
    };
  }

  @Post('execute')
  execute() {
    throw new ForbiddenException(
      'Mkulima cannot send money from this endpoint. Confirm an existing payment with your PIN or biometrics.',
    );
  }
}

@ApiTags('Admin - Settlements')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller({ path: 'admin/settlements', version: '1' })
export class SettlementController {
  constructor(private readonly settlements: SettlementService) {}

  @Post('orders/:id')
  record(@Param('id', ParseUUIDPipe) id: string) {
    return this.settlements.record(id);
  }
}
