# Phase 3 — Dropshipping Pro store connections

Stacked on Phase 2. Not deployed.

## What was built

A business can save a Shopify or WooCommerce shop domain. The row status is always `unverified`. No API secret is stored.

`sync` writes a `refused` job and returns 503. It does not call Shopify or WooCommerce, including when `SHOPIFY_ENABLED` or `WOOCOMMERCE_ENABLED` is `true`. The flag only changes the message. Verification has not been done.

Existing business invoices, payment links, escrow, and team tools are not modified.

## Tests actually run

`jest --testPathPatterns=external-stores.spec --forceExit`: 1 suite, 2 tests passed. `npm run build` succeeded for this phase.

## Migration

`20261128110000_phase3_external_stores` and `down.sql`.

## Env names

`SHOPIFY_ENABLED`, `WOOCOMMERCE_ENABLED`. Both default off. Turning them on does not verify a shop.

## Not verified

Shopify Admin API, WooCommerce REST, webhooks, scopes, and rate limits. No credential was present and no request was sent.
