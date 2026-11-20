# API contract for the existing-app fixes

For the Flutter app (`farm1`). No production env, flags, or Render settings were changed. No deposit was credited.

## Session

`GET /api/v1/auth/session-config` (existing route) now also returns:

- `access_ttl_source`: `JWT_ACCESS_EXPIRES` | `JWT_EXPIRATION` | `default`
- `refresh_ttl_source`: `JWT_REFRESH_EXPIRES` | `JWT_REFRESH_EXPIRATION` | `default` | `persistent`
- `access_expires_in` seconds, `refresh_expires_in` seconds or null, `refresh_ttl` the spec string or null

`JWT_EXPIRATION` (integer seconds, as in `render.yaml`) is an alias of `JWT_ACCESS_EXPIRES`. `JWT_REFRESH_EXPIRATION` is an alias of `JWT_REFRESH_EXPIRES`. The primary name wins. Access default remains 15 minutes. Refresh stays persistent when neither refresh name is set and long-lived sessions are off.

Error JSON from the global filter now includes:

- `code` (string)
- `session_invalid` (boolean)

Sign the user out only when `status` is 401 **and** `session_invalid` is true (codes `session_revoked`, `token_revoked`, `session_expired`, `refresh_reuse`). `code: access_expired` means refresh and retry; `session_invalid` is false. Every 403 has `code: forbidden` and `session_invalid: false`, even if an upstream message said "revoked". Upload failures are 400 with `code: upload_rejected` or `bad_request` and `session_invalid: false`.

## Payment channel

`transactions.payment_channel` is stored at creation. List and detail responses include `channel` (same value).

Values: `qr`, `payment_link`, `invoice`, `nfc`, `p2p`, `chain_deposit`, `nowpayments`, `paystack`, or null when the original source cannot be proved.

`transaction_type` is unchanged (`merchant_payment` is still used for hosted checkout). Label the row from `channel`, not from `transaction_type === merchant_payment`.

Business transaction objects (`GET /api/v1/business/transactions`) include `channel` as well.

Historical rows are backfilled only when `metadata.business_document`, `metadata.channel`, or a QR marker already proved the channel. Ambiguous rows stay null.

## Business ID

`GET /api/v1/business/profile` `data` includes `id`, `business_id` (same UUID), and `public_code` (8-character code, assigned if missing).

`GET /api/v1/business/context` `data` includes `business_id`, `public_code`, and `name`.

`GET /api/v1/agent-payments/businesses/lookup?code=` requires the caller JWT. `code` may be the UUID or the public code. Approved businesses return:

```json
{ "data": { "business_id": "<uuid>", "public_code": "AB12CD34", "name": "Trading name", "status": "approved" } }
```

Unknown or not-approved businesses return 404 `Business not found or not verified`. No owner email or phone.

`POST /api/v1/agent-payments/authorizations` `business_id` accepts the UUID or the public code. PIN is still required. The preview lookup does not create a mandate.

## Mkulima caps

`GET /api/v1/ai/permissions` adds `platform_per_tx_ceiling` and `platform_daily_ceiling`. Both are `null` when no platform ceiling is configured, which means the user may set any positive per-payment and daily limit. `AI_MAX_PER_TX_FARM` and `AI_MAX_DAILY_FARM` are optional. A positive value caps that side only. A cap above a configured ceiling is rejected and the message names the ceiling. There is no default numeric ceiling.

The user’s own `per_tx_cap` and `daily_cap` are still enforced, and `per_tx_cap` cannot exceed `daily_cap`. At confirm time the payment amount must also be within the available wallet balance (balance minus locked funds). Confirmation still requires a PIN or biometric step-up. Proposals, confirmations, failures, and permission changes are written to `ai_audit_log`. Nothing is sent until that confirmation.

## Crypto limits

NOWPayments deposit `GET /api/v1/wallet/deposit/crypto/limits/:currency` `data` always includes, when a floor is known:

`currency`, `network`, `min_amount`, `max_amount`, `min_usd`, `max_usd`, `minimumAmount`, `maximumAmount`, `minimumUsd`, `maximumUsd`, `source`, `fetched_at`, `available`.

`minimumUsd` is at least 2 when the provider is down (`available: false`, `source: farm_floor`) so the deposit screen is not blank. Null means unpublished, never zero.

`GET /api/v1/wallet/chain/limits` and `GET /api/v1/wallet/chain/limits/:asset` (`algo`, `usdc`, `farm`) use the same keys on Algorand. `minimumUsd`, `min_amount`, and `max_amount` are null. `message` says no minimum or maximum is published.

Withdrawal `GET /api/v1/withdraw/crypto/limits/:currency` uses the same keys, with `min_usd` 2 and `max_usd` from `CRYPTO_WITHDRAWAL_MAX_USD` when that value is positive.

## Draft projects

`DELETE /api/v1/business/projects/:id` discards the caller's own project only when `status` is `draft`, nothing has been raised, and there is no investment or token row. Response `{ data: { id, status: "discarded" } }`. The row is kept (`discarded_at`). Other statuses return 400. Another business's id returns 404.

## Tokenization

Still off until the flags in `docs/PHASE5_TOKENIZATION.md` are set. Mainnet requires `TOKENIZATION_NETWORK=mainnet` plus `TOKENIZATION_ENABLED=true`. `ALGORAND_NETWORK=mainnet` alone does not enable it.

`POST /api/v1/business/projects/:id/tokenization` returns 400 `Finish the project application before submitting for tokenization` with `missing` until the same application fields and documents required for submit-for-review are present. Admin approval is unchanged. No asset is minted by this release.

## Chain deposit support (no credit in this release)

Admin JWT, role admin or super admin:

- `GET /api/v1/admin/chain/deposits` query `tx_id`, `status`, `address`, `asset`, `limit`
- `GET /api/v1/admin/chain/deposits/lookup?tx_id=` indexer plus database. Does not write.
- `POST /api/v1/admin/chain/deposits/reprocess` body `{ tx_id, asset?, network?, dry? }`. **`dry` defaults to true** and writes nothing. `dry: false` credits only after the indexer confirms the tx, through the existing exactly-once path. Do not call it for the 5 USDC case until the owner supplies the tx id.
- `POST /api/v1/admin/chain/deposits/:id/note` body `{ note }` sets `resolution_note` only.

Each deposit object includes `tx_id`, `network`, `asset_id`, `asset`, `amount`, `destination`, `sender`, `detection_status`, `confirmation_round`, `ledger_status`, `ledger_transaction_id`, `resolution_note`, `error`.

`CHAIN_DEPOSIT_LOOKBACK_ROUNDS` (default 0, max 10000) applies only when a cursor is created for the first time. It is not set in `render.yaml`. `CHAIN_DEPOSIT_STUCK_MINUTES` (default 15) logs a warning and sets `alerted_at`. It does not credit.
