# Phase 4 — FARM Cargo core

Stacked on Phase 3. Not deployed. No courier and no map provider is connected.

## What was built

- `cargo_rates` is the only price source. A zone pair and weight with no active band is rejected as unsupported.
- Quotes return `eta: null` and `maps_verified: false`.
- Booking is idempotent per user and key. It requires a completed server transaction for the quoted amount. Pending payments are refused.
- Shipment steps are `quoted → booked → picked_up → in_transit → delivered`, with cancel only from `quoted` or `booked`. The book path records `quoted` and `booked` events. Later steps are not exposed until a partner can update them in Phase 5.

Personal, merchant, and business accounts are not given a new account type. Any signed-in user can request a quote.

## Tests actually run

`jest --testPathPatterns=cargo.spec --forceExit`: 1 suite, 4 tests passed. `npm run build` succeeded.

## Migration

`20261128120000_phase4_cargo` and `down.sql`.

## Not verified

Google Maps, Mapbox, geocoding, live tracking, and any courier. No external request was made. No chain send.
