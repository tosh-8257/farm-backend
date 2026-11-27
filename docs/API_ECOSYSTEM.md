# Ecosystem API contract

For the farm1 app agent. All paths are under `/api/v1`. Send `Authorization: Bearer <access token>` except `GET /platform/status`.

JSON field names are camelCase in request bodies and snake_case in responses, matching the existing commerce routes. Amounts are FARM numbers. `eta` is always `null`. `maps_verified` is always `false`.

Tokenization is already live in production (`TOKENIZATION_ENABLED=true`, `TOKENIZATION_NETWORK=mainnet`). These routes do not mint or send anything on-chain. x402 stays off (`X402_ENABLED=false`).

## Money rules

- Dropshipping commission is `DROPSHIP_COMMISSION_BPS` of the supplier item price (wholesale). It excludes retail markup, shipping, and other fees. Production uses `1000` (10%). If the variable is unset, commission is `null`, not an assumed 10%.
- Seller net shown by the quote is retail minus wholesale minus that commission.
- Cargo price for a new zone rate is `base_fee_farm + per_kg_farm * weight_kg`. Older rows that only have `price_farm` and a weight band still quote that flat price.
- Delivery fee split defaults to FARM 20% (`2000` bps) and partner 80% (`8000` bps). Admins can change it. The shipment stores the split used at booking.
- Supplier and partner payouts move FARM wallet balances. They do not start until delivery is confirmed and 24 hours have passed. An open dispute in that window freezes the payout. The debit comes from the original payment's `receiver_wallet_id`. If that wallet is missing, the row stays `blocked` and nothing is credited. External withdrawals still use the existing PIN or biometric rules.

## Catalogue

`POST /suppliers/products` body `{ name, category?, description? }`. Supplier must not be rejected or suspended. Creates a draft.

`GET /suppliers/products` returns `{ data: products }` including variants.

`POST /suppliers/products/:id/variants` body `{ sku, wholesalePrice, stock, imageUrl? }`. `imageUrl` must be `https` or omitted. Duplicate SKU on the same product is 409.

`POST /suppliers/products/:id/publish` only for an approved supplier with at least one variant. Sets the product `active`.

`POST /suppliers/products/variants/:variantId/stock` body `{ idempotencyKey, stock }`. Sets on-hand stock. The same key replays and does not write again. Stock below reserved units is 409.

`GET /merchant/dropship/catalogue?q=&category=` for an approved merchant. Active products from approved suppliers only. Response `{ data, meta: { eta: null, maps_verified: false } }`.

## Orders, cases, delivery

Existing place, pay, and forward routes are unchanged.

`GET /merchant/dropship/orders` lists the merchant's orders and lines.

`GET /suppliers/orders` lists that supplier's fulfilments.

`POST /merchant/dropship/orders/:id/cancel` body `{ idempotencyKey, reason }`. Only a `placed` order. Releases reserved stock. Does not move a wallet.

`POST /merchant/dropship/orders/:id/returns` and `POST /merchant/dropship/orders/:id/disputes` body `{ idempotencyKey, reason }`. The order must already be paid, forwarded, accepted, or fulfilled. A dispute also freezes scheduled payouts for that order. The same key replays. Wallet balances are not moved by opening the case. A ledger memo is written.

`POST /suppliers/fulfilments/:id/deliver` confirms delivery of an accepted fulfilment. When every fulfilment on the order is fulfilled or rejected, the order becomes `fulfilled` and supplier plus commission payouts are scheduled for 24 hours later.

## Cargo

`POST /cargo/quotes` body `{ fromZone, toZone, weightKg }`. Any signed-in user. No address is required to price. Response includes `price_farm`, `pricing` (`base_plus_kg` or `legacy_band`), `farm_share_bps`, `partner_share_bps`, `eta: null`, `maps_verified: false`.

`POST /cargo/shipments` body adds optional `pickupAddress` and `deliveryAddress` (3 to 300 characters). Existing clients that omit them still book. Payment must be a completed server transaction for the quoted amount.

`GET /cargo/shipments` and `GET /cargo/shipments/:id` return only the caller's rows. `:id` includes `timeline` of events. No ETA.

`GET /cargo/shipments/:id/receipt` returns the price, zones, addresses, payment id, status, `eta: null`, and `maps_verified: false`.

`POST /cargo/shipments/:id/disputes` body `{ reason }`. The shipment owner freezes scheduled partner and FARM cargo payouts.

## Partners and dispatch

`POST /partners/apply` body `{ kind, legalName, phone?, serviceArea?, companyRegistration? }`. `kind` is `individual_rider`, `individual_vehicle`, or `logistics_company`. A company requires `companyRegistration`. This is not a new customer account type.

`GET /partners/me` includes vehicles and drivers.

`POST /partners/vehicles` body `{ category, makeModel, registration, capacityKg }`.

`POST /partners/drivers` body `{ legalName, licenceRef }`. Logistics companies only.

`POST /admin/partners/:id/decision` body `{ status, notes? }`. Same status machine as suppliers. Admin only.

`POST /admin/dispatch/shipments/:id/job` and `POST /admin/dispatch/jobs/:id/assign` body `{ partnerId }` are unchanged. Assign still requires an approved partner whose documents are not expired, and it cannot assign one open job twice.

`POST /admin/dispatch/jobs/:id/reassign` body `{ partnerId }`. Only an assigned job. The same partner replays.

`POST /admin/dispatch/jobs/:id/fail` body `{ reason }`. Sets the job failed and, when the shipment allows it, the shipment failed. A second call replays.

`POST /partners/jobs/:id/proof` body `{ method, reference? }`. Assigned partner only. `method` is `otp`, `signature`, or `photo`. OTP returns `{ data: { method: "otp", otp, verified: false } }` once. The stored value is a hash. Photo `reference` must be `https`. A second record is 409.

`POST /partners/jobs/:id/proof/verify` body `{ code }`. Wrong code is 400. A second success replays.

`POST /partners/jobs/:id/deliver` confirms delivery and schedules the 80/20 cargo payout for 24 hours later.

## Cargo admin

Admin only.

`GET /admin/cargo/rates`

`GET /admin/cargo/zones` distinct zone names on active rates.

`POST /admin/cargo/rates` body `{ fromZone, toZone, baseFeeFarm, perKgFarm }`. One active rate per zone pair. Both numbers are zero is 400. A second active pair is 409.

`PATCH /admin/cargo/rates/:id` body `{ active }`.

`PATCH /admin/cargo/split` body `{ farmShareBps, partnerShareBps }`. They must be integers that sum to 10000.

## Payouts

Admin only.

`GET /admin/payouts` latest 100 rows. Status is `scheduled`, `frozen`, `blocked`, `paid`, or `reversed`.

`POST /admin/payouts/:id/unfreeze` puts a frozen row back to `scheduled`. It does not pay immediately.

`POST /admin/payouts/:id/reverse` debits the payee and credits the source wallet once. A second call replays. This is not an on-chain send and not a withdrawal.

## Notices

Order cancel, return, dispute, shipment booking, and job assignment create one in-app notification per event key. The title is generic. The body does not include an amount. Push and SMS are not added for these events.

## Errors

400 validation or an illegal status change. 401 missing or invalid session. 403 role or ownership. 404 missing row. 409 conflict, including idempotency reuse and stock races. Wallet payout that cannot debit leaves the row `scheduled` with `last_error` and retries later.
