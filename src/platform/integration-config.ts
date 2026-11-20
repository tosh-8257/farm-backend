export interface IntegrationView {
  provider: string;
  enabled: boolean;
  /** True only after a live credential check. This phase never sets it. */
  verified: false;
  note: string;
}

/**
 * Feature flags only. No network calls. Shopify, WooCommerce, maps, and x402
 * stay unverified until a later phase actually checks a sandbox.
 */
export function integrationConfig(
  env: Record<string, string | undefined> = process.env,
): IntegrationView[] {
  const flag = (name: string) => env[name] === 'true';
  return [
    {
      provider: 'shopify',
      enabled: flag('SHOPIFY_ENABLED'),
      verified: false,
      note: 'Not verified. No Shopify credentials are checked in this build.',
    },
    {
      provider: 'woocommerce',
      enabled: flag('WOOCOMMERCE_ENABLED'),
      verified: false,
      note: 'Not verified. No WooCommerce credentials are checked in this build.',
    },
    {
      provider: 'maps',
      enabled: flag('MAPS_ENABLED'),
      verified: false,
      note: env.MAPS_PROVIDER?.trim()
        ? `Provider name ${env.MAPS_PROVIDER.trim()} is configured but not verified.`
        : 'No maps provider is selected. MAPS_PROVIDER is unset.',
    },
    {
      provider: 'x402',
      enabled: flag('X402_ENABLED'),
      verified: false,
      note: 'Existing x402 code is not re-verified by this phase.',
    },
  ];
}
