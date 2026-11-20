# Phase 2 — Merchant dropshipping Lite and supplier portal

Stacked on Phase 1. Not deployed. Existing merchant QR settlement is not changed.

## What was built

- Supplier applications (`draft` through `approved` / `suspended`) on the same user account. Not a new customer type.
- Supplier catalogue: products, variants, stock and reserved counts.
- Merchant import of an approved supplier variant into a listing, with a price breakdown. Commission is included only when `DROPSHIP_COMMISSION_BPS` is set. Unset does not silently apply 10%.
- Orders start `placed`. Stock is reserved with a compare-and-set update. The same merchant idempotency key returns the first order.
- `POST /api/v1/merchant/dropship/orders/:id/pay` requires a **completed** `transactions` row whose amount matches the order. A client paid flag is not accepted because the body has no such field.
- Paid orders can be forwarded. The supplier accepts or rejects. Rejection releases the reservation.
- Admin `POST /api/v1/admin/suppliers/:id/decision` writes an audit log. Only legal status moves are allowed.

Merchant QR, payouts, and the merchant dashboard routes are untouched.

## Tests actually run

`jest --testPathPatterns=commerce.spec --forceExit`: 1 suite, 5 tests passed. `npm run build` succeeded. No provider sandbox was called.

## Migration

`20261128100000_phase2_dropshipping`. `down.sql` drops the new tables only.

## Env names

`DROPSHIP_COMMISSION_BPS` optional integer 0–10000. Example meaning of 1000 is 10%. Leave unset until the owner confirms the base and the rate.

## Not in this phase

Shopify, WooCommerce, cargo, dispatch, wallet settlement of supplier payables. No chain send. No live supplier exists because none was recruited.
