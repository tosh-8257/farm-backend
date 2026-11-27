# Spec gap matrix

## Current state (27 Nov 2026)

This file was first written against `main` `6f0717e4`. The ecosystem stack and the deposit fix moved after that.

- The 5 USDC case in the original audit is the separate auto-credit pull request https://github.com/tosh-8257/farm-backend/pull/58. It is not merged. A later 4.999039 USDC transfer is the example the sweep is built to pick up after deploy. Neither transfer was credited by this documentation change.
- Tokenization is already live (`TOKENIZATION_ENABLED=true`, `TOKENIZATION_NETWORK=mainnet`). It is not a pending go-live.
- x402 stays off.
- Group A backend work is PRs #48 through #57, then money-safety #59 and operations #60, stacked in that order. #58 is independent, based on `main`.
- P0 payment binding, escrow-only payouts, recipient OTP, and the payout kill switch are in #59. They are not on `main` until that stack is merged.
- Fraud and retention notes in #60 are drafts for legal review, not adopted policy.
- Staging end-to-end verification is still not done. A module is not production-ready under the spec’s Definition of Done.

The tables below describe `6f0717e4` and farm1 `541ab5b0`. Read them as the baseline, then apply this section.

Reviewed against the FARM master engineering spec. Sources of truth:

- farm-backend `main` at `6f0717e4` (merge of PR #46).
- farm1 `main` at `541ab5b0` (https://github.com/tosh-8257/farm1, PR #9).

This is a read of the repositories. No staging walkthrough, sandbox provider call, or production check was run for this document.

## How status is used

The spec’s Definition of Done says a module is not complete because screens exist or code compiles. A row is **done and verified** only when the requirement itself is implemented and a recorded test or the live production path covers that requirement. Unit tests of a slice do not make the parent module done.

| Status | Meaning |
|---|---|
| done and verified | The requirement is in the reviewed SHA and the cited test or production path covers it. |
| partly done | Some of the requirement is in code or docs. The rest is missing, or only a unit test exists. |
| not started | No implementation of that requirement on these SHAs. |
| blocked on external account or owner input | Cannot be finished without a credential, a transaction id, a provider choice, or an owner decision. |

Nothing in Modules 1–14 meets the full Definition of Done. Staging verification is not documented for any of them.

## Account rules

| Spec item | Status | Evidence | What is missing |
|---|---|---|---|
| Exactly three customer types: Personal, Merchant, Business. Supplier and partner are operational, not a fourth type. | done and verified | `user_role` unchanged. `src/platform/permissions.ts`, `operational_grants`, `platform.spec.ts` (“does not invent a fourth customer role”). farm1 partner copy in `lib/pages/ecosystem/ecosystem_logic.dart`. | No partner self-registration product, so the rule is held by not adding a role, not by a finished partner portal. |
| Do not rebuild existing Business tools. Add Pro and Cargo beside them. | partly done | Business hub still loads existing ops, then `EcosystemTools` in `farm1/lib/pages/business/ops/business_hub.dart`. | Pro is a domain save plus a refused sync, not Dropshipping Pro. |
| Do not replace working QR, wallet, or merchant settlement. | partly done | Existing QR and wallet code remains. New commerce code does not call `wallets.update`. `docs/PHASE6_SETTLEMENT.md`. | No new end-to-end payment was re-run for this review. |
| Frontend is the GitHub Flutter app, not an inaccessible FlutterFlow project. | done and verified | farm1 `lib/`, Android, and iOS at `541ab5b0`. Spec rule 12 asked to identify the real source. | Later FlutterFlow-only edits are not required. The app source is in git. |

## Module 1 — Merchant Portal rebuild

| Spec item | Status | Evidence | What is missing |
|---|---|---|---|
| Audit current Merchant Portal functions before changing them. | not started | No merchant-portal audit file on farm-backend `main`. `docs/audit/` is absent. | A written inventory of current merchant screens and APIs. |
| Dashboard, sales overview, profile, verification, QR, history, settlement, receipts, settings. | partly done | Pre-existing merchant dashboard and QR flow. `farm1/lib/pages/merchant_dashboard/merchant_dashboard_widget.dart` now also mounts `EcosystemTools`. | Not rebuilt. No new sales overview for dropshipping. Receipts and settings were not reworked. |
| Mini-Store, product catalogue, product publishing. | not started | No catalogue list or publish API. `store_listings` can be created only with a known variant id (`POST /api/v1/merchant/dropship/listings`). | Browse, search, images, descriptions, and a storefront. |
| Dropshipping Lite inside the portal. | partly done | Tile and form in `farm1/lib/pages/ecosystem/ecosystem_pages.dart` (`DropshipPage`). Backend order routes in `src/commerce/commerce.controller.ts`. | The screen asks for a variant id. It is not a seller workflow. |
| Cargo requests, tracking, and returns in the portal. | partly done | `CargoPage` posts a zone quote and a booking. | No addresses, timeline, returns, or link from a dropshipping order. |
| Responsive, accessible, existing design system. No silent fee changes. | partly done | New screens reuse business UI widgets. Commission is null unless `DROPSHIP_COMMISSION_BPS` is set (`src/commerce/order-rules.ts`). | No accessibility pass. No device review. |

## Module 2 — Shared dropshipping engine

| Spec item | Status | Evidence | What is missing |
|---|---|---|---|
| One shared backend for Merchant and Business, not two engines. | partly done | `CommerceModule` serves merchant dropship routes and business store routes. | Business has no order/catalogue API of its own. Sharing is only the schema. |
| Catalogue: variants, images, descriptions, SKU, categories, wholesale, stock. | partly done | Tables `supplier_products`, `product_variants` in `prisma/schema.prisma`. | No create, list, image, MOQ, or availability API. Nothing writes products. |
| Import, markup, margin, fees, delivery cost, net profit. | partly done | `importListing` stores a retail price. `margin()` in `order-rules.ts`. | No delivery cost. No fee breakdown before publish. No listing management. |
| Order state machine, stock reservation, server-side paid check, idempotency. | partly done | `ORDER_NEXT` in `order-rules.ts`. `placeOrder` reserves with compare-and-set. `markPaid` requires a completed `transactions` row. `commerce.spec.ts`. | No customer checkout. No webhook path into these orders. No timeout or dead-letter for supplier silence. |
| Forward to supplier; supplier accept/reject. | partly done | `POST /merchant/dropship/orders/:id/forward`, `POST /suppliers/fulfilments/:id/decision`. | No tracking, dispatch data, or customer status updates. |
| Returns, cancellations, disputes. | not started | Order statuses include `cancelled` and `rejected` only as transition names. | No return or dispute models, routes, or screens. |
| Commission configurable, base defined, shown before publish. Default is not a silent 10%. | partly done | `commissionBps()` returns null when unset. Test in `commerce.spec.ts`. | No admin setting. No displayed base. Owner has not set a rate. |
| Wallet settlement of supplier cost, seller net, and commission. | blocked on external account or owner input | `commerce_settlements` records a split and does not move wallets. `POST /api/v1/admin/settlements/orders/:id`. | Owner must approve any later payout that changes balances. |
| Notifications and sales reports. | not started | No `NotificationsService` use under `src/commerce`. | Order, stock, dispatch, and delivery notifications. Seller earnings report. |
| Admin supplier suspend and audit. | partly done | `POST /api/v1/admin/suppliers/:id/decision` and status list in `SUPPLIER_STATUSES`. | No product suspend. No admin UI. |
| Dropshipping Lite seller flows (browse, import, orders, fulfilment, support). | partly done | App `DropshipPage` and `SupplierPage`. | Browse, product edit, order list, tracking, cancellations, reports. |
| Dropshipping Pro: Shopify, WooCommerce, bulk import, inventory sync, preferred suppliers, analytics, scoped API keys. | blocked on external account or owner input | `POST /api/v1/business/stores` saves a domain as `unverified`. `sync` writes `refused` and returns 503 even if `SHOPIFY_ENABLED` or `WOOCOMMERCE_ENABLED` is `true`. `src/commerce/external-stores.service.ts`. `docs/PHASE3_DROPSHIPPING_PRO.md`. | Official API clients, webhooks, credentials, and a recorded sandbox call. |
| Supplier portal: registration, documents, catalogue tools, regions, orders, payouts, ratings. | partly done | `POST /api/v1/suppliers/apply`, `GET /suppliers/me`. Status enum matches the spec. App `SupplierPage`. | No documents, catalogue upload, regions, ratings, or supplier payments. |
| Only approved suppliers fulfil live orders. | partly done | Import, order placement, and supplier decision reject a supplier who is not `approved` (`src/commerce/commerce.service.ts`). | There is still no live fulfilment portal, tracking, or customer order. The check is unit-level, not a staged order. |

## Module 3 — FARM Cargo

| Spec item | Status | Evidence | What is missing |
|---|---|---|---|
| Standalone Cargo for Personal, Merchant, and Business, not a hidden dropship feature. | partly done | `POST /api/v1/cargo/quotes` and `POST /api/v1/cargo/shipments`. App tile on merchant dashboard and business hub. | No Personal Account entry was found. No bulk, freight, or analytics. |
| Addresses, parcel details, restricted-goods check, coverage check. | not started | Quote takes `fromZone`, `toZone`, and `weightKg` only. `src/cargo/cargo.service.ts`. | Street addresses, dimensions, restricted-goods policy, and real coverage. |
| Quote from configured rates. Do not invent ETA or a map. | partly done | Price comes only from `cargo_rates`. Response sets `eta` null and `maps_verified` false. `cargo.spec.ts`. App `cargoQuoteSummary`. | No rate rows are seeded. An empty table means the route is not a live service. |
| Book and pay with idempotency, against a completed transaction. | partly done | `book()` replays the idempotency key and requires a matching completed transaction. | No saved addresses, receipts list, or history API. |
| Tracking timeline, notifications, OTP or signature proof, disputes. | not started | `cargo_shipment_events` stores `quoted` and `booked` only. | Later states, customer tracking, proof of delivery, and disputes. |
| Dashboard areas: overview, my shipments, partners, pickup, freight, returns, invoices, analytics. | not started | One quote/book form. | Every other dashboard area. |
| Service categories and honest “planned vs live” labelling. | partly done | Phase 4 doc says maps and couriers are not verified. | No live-versus-planned catalogue in the product. |
| Cancellation, reassignment, failed pickup, damage, returns, refunds. | not started | Transitions stop at `quoted → booked → picked_up → in_transit → delivered` in code, and the API does not expose the later steps to customers. | Those operations and who may perform them. |

## Module 4 — Delivery partner registration and portal

| Spec item | Status | Evidence | What is missing |
|---|---|---|---|
| Entry points: Merchant “Become a Delivery Partner” and Business “Register Logistics Company”, one backend. | not started | App `PartnerPage` says there is no self-serve application. `partnerRegistrationNote` in `ecosystem_logic.dart`. | Both application paths. |
| Partner types, vehicles, documents, service areas, payout details. | not started | `delivery_partner_profiles` has kind, legal name, status, and `document_expires_at` only. | Documents, vehicles, areas, hours, and payout details. Secure document storage for this flow. |
| Statuses and automatic exclusion of suspended, expired, or unapproved partners. | partly done | `assign()` requires `approved` and rejects `document_expires_at <= now`. `dispatch.spec.ts`. | No application status machine. No self-serve draft. |
| Partner portal: availability, job offers, expiry, navigation, POD, earnings, ratings, incidents. | not started | No partner routes except admin assign. | The whole portal. |
| Company fleet, drivers, and company assignment. | not started | No fleet or driver tables. | All company tools. |
| Real riders and companies recruited. | blocked on external account or owner input | Software does not create a fleet. `docs/PHASE5_DISPATCH.md`. | Owner recruits and verifies partners outside the repo. |

## Module 5 — Dispatch engine, maps, and proof

| Spec item | Status | Evidence | What is missing |
|---|---|---|---|
| FARM-owned dispatch, not a mandatory Shipday dependency. | partly done | `POST /api/v1/admin/dispatch/shipments/:id/job` and `POST /jobs/:id/assign`. | Availability, queue, auto-assign, distance, vehicle fit, workload, offer expiry, reassignment. |
| One job cannot be assigned twice. | done and verified | `updateMany` where status is `open`, then one assignment. Unique `job_id`. `dispatch.spec.ts`. | This lock is real. The surrounding engine is not. |
| Maps, geocoding, ETA, navigation handoff, GPS with consent. | blocked on external account or owner input | `integrationConfig()` reports `maps` unverified. `MAPS_ENABLED` does not call a provider. | Owner must choose a provider and supply a key. No live tracking may be claimed. |
| Proof of pickup and proof of delivery (OTP, signature, photo). | not started | No proof table or route. | All proof methods. |
| Partner earnings calculation. | not started | No earnings model. | Rules and ledger entries. |
| Location privacy: no continuous location when offline. | not started | No location updates are stored, so privacy rules are untested because the feature is absent. | The feature, then the privacy limits. |

## Module 6 — Cargo admin console

| Spec item | Status | Evidence | What is missing |
|---|---|---|---|
| Admin inside existing admin auth, not a second login. | partly done | Dispatch and supplier decisions use `JwtGuard` and `RolesGuard` for admin roles. | No Cargo admin screens. |
| Review partner applications and documents. | not started | No application API. | Review queue and document access. |
| View shipments, assign and reassign, queues, timelines, zones, pricing, commissions, payouts, refunds, fraud, exports. | partly done | Admin can open a job and assign one partner. Cargo price is a raw `cargo_rates` row with no admin API. | Reassignment, queues, zone admin, pricing UI, payout status, disputes, exports. |
| Audit logs for sensitive admin actions. | partly done | Supplier admin decision writes an audit via the commerce service. | Cargo and dispatch admin actions are not covered by that same audit story. |
| Admins cannot silently edit financial history. | partly done | Settlement insert does not update past wallet rows. | No general immutability control or admin UI to prove it. |

## Module 7 — Wallet, ledger, reconciliation

| Spec item | Status | Evidence | What is missing |
|---|---|---|---|
| Audit current ledger before new money movement. | partly done | Phase 6 doc states wallet balance stays authoritative and settlement rows do not move it. | No new architecture diagram of the current ledger on `main`. |
| Separate ledger lines for collection, supplier payable, seller net, commission, delivery, partner earnings, refunds, adjustments, provider fees. | partly done | `commerce_settlements.lines` JSON for collection, supplier payable, commission, and seller net. | Delivery charge, partner earnings, refunds, adjustments, and provider fees are absent. Lines are not `ledger_entries`. |
| Idempotent financial operations. Do not trust a client paid flag. | partly done | Order pay and cargo book require a completed transaction. Settlement unique on `order_id`. | New modules do not run provider webhooks themselves. |
| Double-entry or equivalent auditable accounting, pending versus available, no silent negative balance. | partly done | Existing wallet ledger remains. New settlement is a record, not a posting. | Reconciliation of the new record to wallet balances. |
| Supplier and partner payouts, retries, no duplicate pay. | blocked on external account or owner input | Not implemented. | Owner approval of the payout model, then an idempotent payout implementation. |
| Statements, receipts, and a fee breakdown before confirm. | not started | App confirms with PIN that booking or settlement “does not pay anyone”. | A real breakdown of product, supplier, shipping, fee, and net before the seller publishes. |
| Configurable Cargo prices and partner split, approved before launch. | blocked on external account or owner input | `cargo_rates` and no partner-split field. | Owner-approved rates and split. |

## Module 8 — AI commerce and x402

| Spec item | Status | Evidence | What is missing |
|---|---|---|---|
| AI must not send money without PIN or biometrics. | done and verified | `POST /api/v1/commerce/ai/execute` throws. `GET /commerce/ai/authority` returns `autonomous_payments: false`. `readiness.spec.ts`. Existing Mkulima confirm still requires PIN or biometrics. | This does not re-test every older assistant tool in staging. |
| Scoped agent permissions, caps, revocation, previews, logs. | partly done | Existing agent-payment mandates and optional `AI_MAX_*` ceilings. Platform ceiling is null when unset (`src/ai-assistant/ai-limits.ts`). | No new commerce-agent policy. No product-research assistant for Pro. |
| x402 only after current protocol review. Do not claim escrow or chargebacks. | blocked on external account or owner input | Existing `src/x402` and `docs/PHASE10_X402.md`. `integrationConfig()` keeps `verified: false`. Phase 6 did not re-test it. | A current-doc review and an owner go/no-go. |

## Module 9 — Notifications

| Spec item | Status | Evidence | What is missing |
|---|---|---|---|
| Reuse existing in-app, push, and email/SMS channels. | partly done | Existing notifications module is unchanged. | No new event publisher. |
| Order, supplier, stock, shipment, partner, payout, and document-expiry events, idempotent, no sensitive preview text. | not started | No calls from commerce, cargo, or dispatch into notifications. | The event list, idempotency keys, and copy review. |

## Module 10 — Data model and API

| Spec item | Status | Evidence | What is missing |
|---|---|---|---|
| Incremental migrations for the entities that were built. | partly done | `prisma/migrations/20261128090000_phase1_foundation` through `20261128140000_phase6_settlements`, each with `down.sql`. `start.sh` runs `prisma migrate deploy`. | Many spec entities were not added: documents, inventory as its own table, vehicles, fleets, drivers, location updates, proof of delivery, disputes, returns, partner earnings, payout records. |
| Auth, ownership, validation, idempotency on the new routes. | partly done | JWT on merchant, supplier, cargo, and business routes. Admin role checks on assign and settlement. | No list pagination. Public status is intentionally unauthenticated. |
| Redis only for short-lived locks. Postgres is source of truth. | partly done | `docs/PHASE1_FOUNDATION.md`. Idempotency records are in Postgres. | Not re-tested with Redis down in this review. |

## Module 11 — Security, privacy, fraud

| Spec item | Status | Evidence | What is missing |
|---|---|---|---|
| Threat model before launch. | not started | No threat-model document on `main`. | The model for orders, shipments, documents, and payouts. |
| Least privilege, ownership checks, audit of admin and money actions. | partly done | Existing auth plus new role checks. Phase 7 table in `docs/PHASE7_STAGING_READINESS.md`. | That document says it is not a penetration test. |
| Upload type and size checks, malware scanning, private files. | partly done | Existing upload validation. New partner documents were not added. | Malware scanning. Document retention for future partner IDs. |
| Webhook signatures and replay protection on existing providers. | partly done | Existing Paystack and NOWPayments webhook code. | New modules do not receive those webhooks. No new replay test was added for them. |
| Rate limits, secrets out of git, monitoring, backup restore test. | partly done | `UserThrottlerGuard`. Env names in `docs/ENV_VARS.md` and Phase 7. Render holds secrets. | No backup restore drill. No new pager. |
| Kenyan legal, insurance, tax, and transport review. Terms and policies. | blocked on external account or owner input | Phase 7 says this was not a legal opinion. | Qualified local advice and the policy texts. |
| Fraud controls: fake POD, collusion, payout-change alerts, prohibited goods. | not started | Not present in the new modules. | Those controls. |

## Module 12 — Brand and UX

| Spec item | Status | Evidence | What is missing |
|---|---|---|---|
| Black, white, and gold. Official logo. No fake suppliers, prices, or live tracking. | partly done | `farm1/lib/core/app_theme.dart` `kBrandAccent` `0xFFD4AF37`. Ecosystem copy says quotes have no map and shops are unverified. | No review that every new screen avoids fake data in empty states beyond that copy. |
| Empty, loading, error, and offline states on the new flows. | partly done | Business widgets used by the new pages. | No offline test of dropship or cargo. |

## Module 13 — Tests

| Spec item | Status | Evidence | What is missing |
|---|---|---|---|
| Unit tests for the slices that were built. | partly done | Backend Jest on the #46 branch: 141 suites, 1015 tests, CI green. Specs include `commerce.spec.ts`, `cargo.spec.ts`, `dispatch.spec.ts`, `settlement.spec.ts`, `external-stores.spec.ts`, `readiness.spec.ts`. farm1 `test/ecosystem_screens_test.dart` and `test/module15_app_fixes_test.dart`. | Those tests do not cover the spec’s end-to-end list. |
| Account permission, dropshipping, cargo, financial, and security scenarios in the spec. | not started | A few of the rules have unit tests (unapproved partner excluded, duplicate job assignment, fake client payment not accepted because pay requires a completed transaction). | Import/publish, oversell concurrency beyond the reservation update, Shopify failure recovery, OTP, GPS privacy, payout retry, backup restore, and load tests. |
| Distinguish unit, integration, staging, and production. | partly done | Phase docs say what was not run. | No staging column with a pass. |

## Module 14 — Phases and gates

| Spec item | Status | Evidence | What is missing |
|---|---|---|---|
| Phase 0 audit before build. | partly done | Not on `main`. The build proceeded from later phase PRs #38, #39, #41–#46. | The audit file is not in the reviewed SHA. |
| Phases 1–7 written reports. | partly done | `docs/PHASE1_FOUNDATION.md` through `docs/PHASE7_STAGING_READINESS.md`. | Reports describe slices. They do not match the spec’s phase contents (portal rebuild, fleet, maps, payouts). |
| Staging acceptance: full suite, security review, sandbox callbacks, load, backups, owner approval before production. | blocked on external account or owner input | `docs/PHASE7_STAGING_READINESS.md` leaves the checklist unchecked and says staging was not run. | A staging environment run and explicit production approval. |
| Do not deploy without approval. | done and verified | Phase PRs were merged by the owner. This gap document does not deploy. | Future financial changes still need a fresh approval. |

## Definition of Done

| Spec item | Status | Evidence | What is missing |
|---|---|---|---|
| Backend logic and permissions work for each module. | partly done | Routes listed in the module rows. | Modules 1 and 3–6 and 9 are not complete workflows. |
| Data persisted correctly. | partly done | Migrations above. | Unbuilt entities. No staging migration evidence in this review. |
| Critical workflows end to end. | not started | No recorded buyer → pay → supplier → cargo → deliver → settle path. | That path. |
| Financial actions ledgered and reconciled. | partly done | Settlement row only. | Wallet reconciliation and payouts. |
| Webhooks and retries safe for the new flows. | not started | New flows do not take webhooks. | Wiring and tests. |
| Relevant tests pass. | partly done | Unit tests cited above. | Spec scenario list. |
| Error, offline, and failure paths. | not started | Not built for the new portals. | Those paths. |
| Admin and support operations. | partly done | A few admin POSTs. | Consoles for catalogue, cargo, partners, and disputes. |
| Security and privacy checks complete. | not started | Phase 7 is a limit statement, not a completed review. | Threat model and the control list in Module 11. |
| Staging verification documented. | not started | Phase 7 checklist is unchecked. | The run. |
| External dependencies verified or explicitly unavailable. | partly done | Shopify, WooCommerce, maps, couriers, and x402 are marked unverified in code (`verified: false`). | They stay unavailable until credentials and a recorded check exist. |

## Final deliverables 1–23

| Spec item | Status | Evidence | What is missing |
|---|---|---|---|
| 1. Repository and architecture audit. | partly done | Older `docs/GAP_AUDIT_PHASES_1_10.md` is a different phase series. The ecosystem audit is not on this SHA. | `docs/audit/PHASE0_ECOSYSTEM_AUDIT.md` is not in `main`. |
| 2. Gap analysis and implementation plan. | partly done | Phase docs plus this file. | This file is the gap analysis. It is not an approved build plan. |
| 3. Updated architecture and data-flow diagrams. | not started | No Mermaid or other diagram files under `docs/` on `main`. | Diagrams for account types, order flow, cargo, dispatch, and ledger. |
| 4. Schema changes and migrations. | partly done | Six phase migrations and `down.sql`. | The unbuilt tables in Module 10. |
| 5. Backend implementation and API documentation. | partly done | Controllers in `src/commerce`, `src/cargo`, `src/dispatch`, `src/platform`. `docs/API_EXISTING_APP_FIXES.md` covers the older bugfix API, not the new portals. | Request and response docs for dropship, cargo, dispatch, and settlement. |
| 6. Frontend implementation. | partly done | farm1 `lib/pages/ecosystem/`. | Real portal screens. FlutterFlow is not the source. |
| 7. Supplier Portal. | partly done | Apply and fulfilment decision only. | Catalogue, documents, payouts. |
| 8. Dropshipping Lite in Merchant Portal. | partly done | Tile plus variant-id form. | Catalogue and seller operations. |
| 9. Dropshipping Pro in Business Account. | blocked on external account or owner input | Unverified domain save. Sync refused. | Shopify and WooCommerce accounts and a sandbox test. |
| 10. FARM Cargo customer interfaces. | partly done | One quote and book form. | Tracking, history, Personal Account, receipts. |
| 11. Delivery Partner Portal and fleet management. | not started | Admin assign only. Copy says there is no self-serve application. | Portal and fleet. |
| 12. FARM-owned dispatch engine. | partly done | Open job and single assignment. | Matching, expiry, reassignment, location. |
| 13. Cargo and supplier admin. | partly done | Admin supplier decision and job assign. | The console in Module 6. |
| 14. Wallet, ledger, commission, reconciliation. | partly done | Settlement record. Commission null until configured. | Posting to the wallet ledger and reconciliation. |
| 15. Maps and routing, if approved. | blocked on external account or owner input | Flag only. | Provider choice, key, and a real call. |
| 16. AI commerce and x402, only if verified. | blocked on external account or owner input | Execute is forbidden. x402 `verified: false`. | Protocol review and owner approval before any claim that it is live. |
| 17. Automated tests and actual results. | partly done | Jest 141 suites / 1015 tests on the #46 head that `main` merged. farm1 unit tests for ecosystem copy and app fixes. | Staging and the spec scenario list. |
| 18. Security and privacy review and open risks. | partly done | `docs/PHASE7_STAGING_READINESS.md` security table. | Threat model. Unresolved: no malware scan, no restore drill, 5 USDC unresolved, external providers unverified. |
| 19. Env template, names only. | done and verified | `docs/ENV_VARS.md` and the names list in Phase 7. No secret values in those docs. | Operators still set real values in Render. This repo does not. |
| 20. Deployment and rollback instructions. | partly done | `start.sh` runs `prisma migrate deploy`. Phase 7 lists `down.sql` order. | Not executed. `down.sql` is not run by `migrate deploy`. |
| 21. Monitoring, backup, and incident response. | partly done | Existing Render service and Nest logs. Phase 7 names the gap. | No new alert route for cargo or dropship. No tested restore. |
| 22. Not implemented, not verified, credentials, operational dependencies. | partly done | Phase 7 sections 22 and 23, updated by this matrix. | This matrix is the current list. |
| 23. Ready for staging, ready for production approval, blocked. | partly done | Phase 7. Staging checklist unchecked. | Nothing in the new ecosystem is production-ready under the Definition of Done. |

## Module 15 — Existing app bug fixes

| Spec item | Status | Evidence | What is missing |
|---|---|---|---|
| P1 Tokenization workflow, flags, and no pretend-live. | partly done | `src/tokenization/algorand-config.ts`. Mainnet only when `TOKENIZATION_ENABLED=true` and `TOKENIZATION_NETWORK=mainnet`. Admin mint stays unavailable when disabled. `docs/PHASE5_TOKENIZATION.md`. App `project_pages.dart` keeps the action at the end. | Not enabled in production by this work. No ASA was created. No staging tokenization test. |
| P2 Owner can discard only their own draft. | partly done | `DELETE` draft path and `project_logic.dart` / discard button. | Not re-tested against a live project in this review. |
| P3 Remove `_AP2` from the launcher name. Do not change applicationId. | partly done | Android `strings.xml` `app_name` is `FΛЯM`. iOS `CFBundleDisplayName` is `FΛЯM`. `farm1/test/module15_app_fixes_test.dart`. | No installed-build check. The spec asked to verify a test build’s launcher. |
| P4 Submit for tokenization only after a complete application. | partly done | `projectApplicationGaps` on the backend. App hides the final action until the application is complete. | No full multi-step staging run. |
| P5 Uploads and 403 must not sign the user out. | partly done | `session_invalid` false for 403 and upload failures. `http-exception.filter.ts`. App `push_session_policy.dart`. | No device test of a cover-photo upload or Mkulima payment return. |
| P6 Persistent session and fewer SMS logins. | partly done | Access and refresh TTL aliases in `src/auth/token-ttl.ts`. Refresh reuse is terminal. | No measurement of real session length on devices. |
| P7 Payment links and invoices keep their own channel. QR stays QR. | partly done | `payment_channel` on transactions. App `personal_activity.dart` `isMerchantQr` is true only for channel `qr`. | Historical rows without a reliable source were not guessed. No staging payment of each channel. |
| P8 Per-coin deposit and withdrawal limits, including honest nulls. | partly done | `src/crypto/limits-payload.ts`. On-chain `GET /api/v1/wallet/chain/limits`. App `crypto_coin_limit.dart`. | Provider limits were not refreshed against NOWPayments during this review. Null means unpublished, which matches the spec’s “do not invent a maximum”. |

## Module 16 — Triage reporting

| Spec item | Status | Evidence | What is missing |
|---|---|---|---|
| Reproduction, root cause, severity, tests, and readiness for each of the eight issues. | partly done | `docs/API_EXISTING_APP_FIXES.md`. | The doc is an API contract and fix note, not a full reproduction log with staging results. |

## Module 17 — Additional owner fixes

| Spec item | Status | Evidence | What is missing |
|---|---|---|---|
| P9 Business ID, show name before allow, copy control, no owner PII on lookup. | partly done | `businesses.public_code`, lookup `GET /api/v1/agent-payments/businesses/lookup`. App profile copy in `team_pages.dart` and allow-flow in `agent_payments_pages.dart`. | Lookup is exact id or code, not search. Staging of unverified and revoked cases was not re-run here. |
| P10 Remove unexplained 100,000 FARM cap. User limits. PIN still required. | partly done | `aiPlatformCeiling()` is null when `AI_MAX_*` is unset. Confirm checks user caps, then balance, and still requires PIN or biometrics. App `mkulima_limits.dart`. | No device test. “Whatever they want” is still limited by wallet balance. |
| P11 Hey Mkulima without a second tap, compact UI, no payment from speech. | partly done | `hands_free.dart` parses the wake phrase. `assistant_pages.dart` runs a foreground loop and a headset channel. Copy says background and lock-screen listening do not work. Payments are not confirmed in that file. | No before/after of the obstructing UI. No device test of wake, calls, or permission revoke. Spec forbids claiming system-wide listening. The app does not claim it. |
| P12 Missing 5 USDC. Do not credit from a screenshot. Admin reconcile, lookup, dry reprocess, stuck alert. | blocked on external account or owner input | `src/chain-wallet/deposit-admin.service.ts`. Reprocess defaults to dry. `docs/CHAIN_DEPOSITS.md`. | The 5 USDC transaction id, network, ASA id, and destination are still absent, so the case is unresolved. Do not credit. |
| P13 Subtle gold on fine lines in both themes, plus a before/after review. | partly done | `AppTheme.hairline` is `kBrandAccent`, used for focus borders, dividers, and progress in `app_theme.dart`. `brand_accent_test.dart` and `module15_app_fixes_test.dart`. | No before/after screen review for light and dark across Personal, Merchant, Business, wallet, QR, Mkulima, projects, Cargo, and Dropshipping. Primary buttons remain gold fills, which the spec allows only as the existing identity, not as a new gold wash. |

## Module 18 — Acceptance of the five V4 items

| Spec item | Status | Evidence | What is missing |
|---|---|---|---|
| Document root cause, tests, external information, and readiness for P9–P13. | partly done | `docs/API_EXISTING_APP_FIXES.md` and the rows above. | P11 and P13 have no visual acceptance record. P12 is blocked on the transaction id. None are marked production-verified here. |

## Gap groups

### A — Can be built from the current code, with no new external account

- Merchant Portal information architecture on top of existing QR, wallet, and transaction APIs, including a real dropshipping catalogue UI once the catalogue API exists.
- Supplier product and variant CRUD, images through the existing upload path, stock, SKU, category, and a browse/search API.
- Seller listing edit, order list, cancellation states, and a returns/disputes model that does not call Shopify or a courier.
- Link a paid dropshipping order to a cargo shipment id.
- Cargo address fields, shipment history, receipts, and a status timeline using events already stored. No ETA.
- Personal Account entry to the same cargo quote and book API.
- Partner application forms, status machine, and document metadata. Malware scanning stays out of this group.
- Fleet, vehicle, and driver records and company assignment of an already open job.
- Proof-of-delivery records (OTP, signature, photo metadata) and admin reassignment.
- Cargo admin for zones and `cargo_rates`, shipment lists, and audit on assign.
- Notification events for the new order and shipment states, using the existing notification module.
- Architecture and data-flow diagrams, a threat model, and API docs for the routes that exist.
- The spec’s unit and API tests that do not need a live provider.
- A recorded before/after gold review. The token is already in the app.
- Hey Mkulima foreground behaviour and a compact listening indicator. Device proof still has to be done by someone with a phone. No new vendor is required.

### B — Needs an outside account or credential

- Shopify Admin API: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, and a sandbox shop. `SHOPIFY_ENABLED=true` does not turn sync on today.
- WooCommerce REST: `WOOCOMMERCE_CONSUMER_KEY`, `WOOCOMMERCE_CONSUMER_SECRET`. `WOOCOMMERCE_ENABLED=true` does not turn sync on today.
- A maps provider and `MAPS_API_KEY`, after `MAPS_PROVIDER` is chosen. Geocoding, ETA, and navigation stay unavailable until a real call is recorded.
- x402 only after a current protocol review. The flag `X402_ENABLED` does not verify it.
- Malware scanning for identity documents, if a scanner is required before partner files are accepted.
- Paystack or NOWPayments sandbox keys if the new order and cargo pay paths must be verified against a provider rather than a fixture.
- Algorand issuer material already used by tokenization (`ALGORAND_ISSUER_MNEMONIC`) if the owner later enables minting. No mint was performed.

### C — Needs an owner decision or owner-supplied fact

- Dropshipping commission rate and the base it applies to. `DROPSHIP_COMMISSION_BPS` unset means no commission is assumed. Do not silently use 10%.
- Cargo rate rows and the FARM versus partner revenue split.
- Whether supplier and partner settlements may move wallet balances. Today they must not.
- Tokenization go-live: `TOKENIZATION_ENABLED=true` and `TOKENIZATION_NETWORK=mainnet`. Leave them unset until legal and owner approval.
- Maps vendor choice.
- x402 go or no-go.
- The 5 USDC transaction id, network, asset id, and destination. Do not credit from a screenshot.
- Recruiting real delivery partners. The software cannot invent them.
- Kenyan data-protection, payments, transport, insurance, and tax review, plus the terms and policies those reviews must approve.
- A staging run and explicit approval before any production deploy of the remaining financial work.
- Acceptance of the gold treatment after a before/after review, and acceptance of foreground-only Hey Mkulima.

## What this review did not do

No merge, no deploy, no migration, no on-chain send, and no credit of the unresolved USDC deposit.
