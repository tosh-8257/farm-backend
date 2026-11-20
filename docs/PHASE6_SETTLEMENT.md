# Phase 6 — Settlement record, AI authority, x402 assessment

Stacked on Phase 5. Not deployed. No wallet balance is changed and no chain transaction is sent.

## Settlement

`commerce_settlements` stores one row per paid dropshipping order: collection, supplier payable, FARM commission, and seller net. A second call returns the same row and does not insert another. `wallets.update` is not called. Supplier and partner payout destinations are not configured, so this is a reconciliation record, not a payout.

Admin: `POST /api/v1/admin/settlements/orders/:id`.

## AI commerce

`GET /api/v1/commerce/ai/authority` returns `autonomous_payments: false`.

`POST /api/v1/commerce/ai/execute` returns 403 and does not send money. Existing Mkulima confirmation still requires a PIN or biometrics. This phase does not add a new execution path. There is no platform spending ceiling unless `AI_MAX_DAILY_FARM` or `AI_MAX_PER_TX_FARM` is set.

## x402 assessment

The existing `src/x402` module was not re-tested against current x402 or Algorand documentation in this phase. `integrationConfig()` still reports `verified: false`. Do not treat x402 as escrow, chargeback, or consumer protection. No new x402 payment was created.

## Tests actually run

`jest --testPathPatterns=settlement.spec --forceExit`: 1 suite, 2 tests passed. `npm run build` succeeded.

## Migration

`20261128140000_phase6_settlements` and `down.sql`.

## Not verified

Payout providers, partner bank accounts, maps, Shopify, WooCommerce, couriers, and x402. No chain send.
