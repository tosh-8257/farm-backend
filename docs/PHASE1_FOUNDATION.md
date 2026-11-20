# Phase 1 — Foundation

Built on `main` after the existing-app fixes. Not deployed. Not merged by this change.

## What was built

- Durable idempotency records (`idempotency_records`). A completed key returns the stored response. A different body on the same key returns 409. The existing Redis middleware still only locks in-flight HTTP retries.
- `platform_jobs` with idempotent enqueue and a claim so two workers cannot run the same job. Failed jobs retry until `max_attempts`, then `dead`. The 30s tick calls `processDue`. Redis is not required for correctness.
- `operational_grants` for supplier, cargo, and partner permissions. These are not a fourth customer account type. Personal, Merchant, and Business are unchanged.
- Integration flags for Shopify, WooCommerce, maps, and x402. Every one is `verified: false`. Enabling a flag does not call the provider.
- `FARM_RUNTIME=staging|production|development`. Staging does not by itself switch payment or chain networks.
- `GET /api/v1/platform/status` and `GET /api/v1/admin/platform/integrations`.

## Tests actually run

Command: `./node_modules/.bin/jest --testPathPatterns=platform.spec --forceExit`

Result: 1 suite, 8 tests passed. This does not re-run the full application suite. No provider sandbox was called.

## Migration

`prisma/migrations/20261128090000_phase1_foundation` adds three tables. `down.sql` drops them. Do not apply it to production until the owner approves the deploy. It does not change wallets, QR settlement, or chain accounts.

## Env names (no values)

`FARM_RUNTIME`, `SHOPIFY_ENABLED`, `WOOCOMMERCE_ENABLED`, `MAPS_ENABLED`, `MAPS_PROVIDER`, `X402_ENABLED`.

Existing required boot variables are unchanged (`DATABASE_URL`, `REDIS_URL`, JWT secrets, and the others in `docs/ENV_VARS.md`).

## Observability, errors, backups

- Liveness stays `GET /health`. This phase does not add a new error-reporting vendor. Nest logs remain the error channel. Do not log secrets or request bodies that contain PINs.
- Platform job failures are stored on `platform_jobs.last_error`. A dead job is visible by `status = dead`. There is no paging integration.
- Postgres backups are a Render dashboard setting. This repository cannot confirm that backups or a restore drill have been run. Recovery for these new tables is: restore the database backup, then re-run failed `platform_jobs` that are still `failed` (not `dead`) by waiting for the tick, or mark a reviewed dead job back to `queued` in a later admin tool. Idempotency records prevent a replay from applying a second financial effect once later phases use `IdempotencyService`.
- This phase does not move money and does not send chain transactions.

## Not verified

Shopify, WooCommerce, maps, couriers, and x402. No sandbox call was made.
