import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SecurityModule } from '../security/security.module';
import { EscrowPayService } from './escrow-pay.service';

@Module({
  imports: [AuthModule, SecurityModule],
  providers: [EscrowPayService],
  exports: [EscrowPayService],
})
export class EscrowModule {}
