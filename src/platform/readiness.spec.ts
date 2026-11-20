import { ForbiddenException } from '@nestjs/common';
import { integrationConfig } from '../platform/integration-config';
import { CommerceAiController } from '../commerce/settlement.controller';

describe('staging readiness invariants', () => {
  it('does not mark external commerce providers as verified', () => {
    const rows = integrationConfig({});
    expect(rows.map((row) => row.provider).sort()).toEqual([
      'maps',
      'shopify',
      'woocommerce',
      'x402',
    ]);
    expect(rows.every((row) => row.verified === false && row.enabled === false)).toBe(
      true,
    );
  });

  it('refuses autonomous AI execution', () => {
    const controller = new CommerceAiController();
    expect(controller.authority().data.autonomous_payments).toBe(false);
    expect(() => controller.execute()).toThrow(ForbiddenException);
  });
});
