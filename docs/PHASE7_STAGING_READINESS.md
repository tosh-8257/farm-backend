# Phase 7 — Staging acceptance and production readiness

Stacked on Phase 6. This phase is a review record. It does not deploy, does not merge, does not change production environment variables, and does not send an on-chain transaction.

The suite below was run on branch `cursor/phase7-readiness-cba5`, which contains Phases 1–6.

## Test results actually run

Command: `./node_modules/.bin/jest --no-coverage --forceExit`

Result on `cursor/phase7-readiness-cba5` before this pull request was opened:

- 141 suites passed, 1009 tests passed, 0 failed.
- `npm run build` succeeded on this branch.

Provider sandboxes were not called. Paystack, NOWPayments, Shopify, WooCommerce, maps, and Algorand were not exercised against live or sandbox accounts in this phase.

## Security and privacy review

This is a code review of the new modules, not a penetration test and not a legal opinion.

| Control | What the code does | Limit |
|---|---|---|
| Customer account types | Personal, Merchant, and Business are unchanged. Supplier and partner access uses profiles or `operational_grants`, not a new `user_role`. | A full partner portal with document storage is not built. |
| Payment truth | Dropshipping pay and cargo book require a completed `transactions` row and a matching amount. | Historical QR versus invoice labelling was fixed in the merged app-fix PR. This phase did not re-test Paystack webhooks. |
| Idempotency | `idempotency_records` replays a completed key and rejects a different body. Orders and cargo bookings also use their own unique keys. Settlements are unique per order. | The Redis HTTP lock and the Postgres record are separate. A handler must call `IdempotencyService` to get the durable replay. |
| Assignment | A job moves from `open` to `assigned` with `updateMany`. A lost claim does not insert a second assignment. | No GPS, no offer expiry worker, no partner app. |
| AI money | `POST /api/v1/commerce/ai/execute` returns 403. Existing Mkulima confirm still requires a PIN or biometrics. Platform ceilings are null unless `AI_MAX_*` is set. | This does not re-audit every older assistant tool. |
| External stores | Sync is refused. No shop secret is stored. | A future implementation must add signature checks before it calls Shopify or WooCommerce. |
| Secrets | New docs list names only. | Render still holds production secrets. This review did not read them. |
| Data | Supplier legal name and partner name are new personal data. There is no document-upload bucket in these phases. | Retention and access rules for future ID documents are not implemented. |
| Chain | No new send path. Tokenization still requires `TOKENIZATION_ENABLED` and explicit `TOKENIZATION_NETWORK`. Deposit credit is unchanged. | The 5 USDC case is still blocked without a transaction id. |

Not done: malware scanning, a new error-reporting vendor, a backup restore drill, load tests, or a Kenyan legal review.

## Release checklist

Do not check these off until a human does them. This list is the gate, not a claim that they passed.

- [ ] Owner merges Phases 1–7 in order: #38, #39, #41, #42, #43, #44, then this phase.
- [ ] Staging database backup taken and restore point noted.
- [ ] Staging migrations applied from `20261128090000_phase1_foundation` through `20261128140000_phase6_settlements`. Phase 7 adds no migration.
- [ ] `FARM_RUNTIME=staging` set on the staging service only.
- [ ] Confirm merchant QR still credits the owner personal wallet on staging with a sandbox payment.
- [ ] Confirm a business still has its own Algorand account path and this release did not send from it.
- [ ] Confirm Mkulima still refuses to pay without PIN or biometrics.
- [ ] Leave `SHOPIFY_ENABLED`, `WOOCOMMERCE_ENABLED`, and `MAPS_ENABLED` unset or `false`.
- [ ] Leave `TOKENIZATION_ENABLED` unset unless a separate tokenization go-live is approved.
- [ ] Leave `DROPSHIP_COMMISSION_BPS` unset until the owner confirms the rate and the base.
- [ ] Health check `GET /health` returns success after deploy.
- [ ] No production DNS, credential, or app-store change.

## Rollback

Phase 7 has no migration. Rolling back the code is a revert of the stacked merges, newest first.

If the schema migrations were applied and must be removed, run the matching `down.sql` files newest first, only after a backup:

1. `prisma/migrations/20261128140000_phase6_settlements/down.sql`
2. `prisma/migrations/20261128130000_phase5_dispatch/down.sql`
3. `prisma/migrations/20261128120000_phase4_cargo/down.sql`
4. `prisma/migrations/20261128110000_phase3_external_stores/down.sql`
5. `prisma/migrations/20261128100000_phase2_dropshipping/down.sql`
6. `prisma/migrations/20261128090000_phase1_foundation/down.sql`

`prisma migrate deploy` does not run `down.sql`. Someone has to apply those statements on purpose. Do not drop the tables if staging already has supplier, order, cargo, or settlement rows the owner wants to keep. Code rollback without down migrations is safe: old app versions ignore the new tables.

Wallet balances, QR payments, chain wallets, and the merged app-fix migration `20261127090000_existing_app_backend_fixes` are not part of this rollback.

## Env template (names only)

No values belong in git.

Staging label:

- `FARM_RUNTIME`

Commerce flags, all optional and off unless set to the string `true` or a number:

- `SHOPIFY_ENABLED`
- `WOOCOMMERCE_ENABLED`
- `MAPS_ENABLED`
- `MAPS_PROVIDER`
- `DROPSHIP_COMMISSION_BPS`
- `X402_ENABLED`
- `AI_MAX_DAILY_FARM`
- `AI_MAX_PER_TX_FARM`
- `TOKENIZATION_ENABLED`
- `TOKENIZATION_NETWORK`
- `CHAIN_DEPOSIT_LOOKBACK_ROUNDS`
- `CHAIN_DEPOSIT_STUCK_MINUTES`

Secrets that would be required later, still not set by these PRs:

- `SHOPIFY_API_KEY` (not read yet; do not invent a value)
- `SHOPIFY_API_SECRET`
- `WOOCOMMERCE_CONSUMER_KEY`
- `WOOCOMMERCE_CONSUMER_SECRET`
- `MAPS_API_KEY`

Existing production names stay in `docs/ENV_VARS.md`. This list does not repeat secret values.

## Final deliverables 22 and 23

### 22. Not implemented, not verified, and external dependencies

Not implemented to the spec's definition of done:

- Flutter screens for dropshipping, cargo, supplier, and partner portals. Backend routes exist. The app repo was not changed here.
- Shopify and WooCommerce product or order sync.
- Maps, geocoding, live GPS, and navigation handoff.
- A recruited courier network, fleet tools, proof of delivery, and OTP delivery.
- Supplier and partner payouts that move wallet balances.
- A configurable launched 10% commission. The env var exists. Unset means no commission is assumed.
- x402 re-validation against current protocol docs.
- Malware scanning, paging, and a tested backup restore.

Not verified: Paystack sandbox on these new routes, NOWPayments, Shopify, WooCommerce, any maps provider, any courier, Algorand sends, and x402.

### 23. Staging, approval, and blocked

Ready for a staging deploy only after the owner merges and applies migrations:

- Foundation idempotency, jobs, and grants.
- Dropshipping Lite order, stock reservation, and supplier admin transitions.
- Saving an unverified shop domain.
- Cargo quotes from rows in `cargo_rates`.
- Single job assignment for an approved partner.
- One settlement record per paid order, without moving funds.

Needs explicit owner approval before production:

- Every merge in the stack.
- The staging migration apply.
- Any value of `DROPSHIP_COMMISSION_BPS`.
- Turning tokenization on (`TOKENIZATION_ENABLED` and `TOKENIZATION_NETWORK=mainnet`).
- Any later change that moves supplier or partner funds.
- Calling deposit reprocess with `dry: false`.

Blocked:

- Live Shopify or WooCommerce sync, until credentials exist and a sandbox call is recorded.
- Map ETA and live tracking, until a provider is chosen and checked.
- Real delivery, until partners are recruited and verified outside this codebase.
- The missing 5 USDC credit, until the transaction id, network, asset id, and destination are supplied. Do not credit from a screenshot.
- Calling this stack production-ready. Staging acceptance in a live staging environment has not been run.
