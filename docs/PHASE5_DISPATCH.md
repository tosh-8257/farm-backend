# Phase 5 — Partner eligibility and dispatch lock

Stacked on Phase 4. Not deployed. This does not recruit riders and does not track GPS.

## What was built

- `delivery_partner_profiles` on an existing user. Status `approved` is required before a job can be assigned. An expired `document_expires_at` is excluded.
- `delivery_jobs` start `open`. Assignment uses `updateMany` where `status = open`. If another worker already claimed it, the second call gets a conflict and does not insert a second assignment. `delivery_assignments.job_id` is unique.
- Admin routes: open a job for a shipment, assign a partner. There is no maps handoff and no live location table.

Partner onboarding beyond the profile row (document upload review UI, fleet management) is not a full portal. The eligibility gate and the single-assignment lock are what this phase proves.

## Tests actually run

`jest --testPathPatterns=dispatch.spec --forceExit`: 1 suite, 3 tests passed. `npm run build` succeeded.

## Migration

`20261128130000_phase5_dispatch` and `down.sql`.

## Not verified

No courier company, no rider, no maps SDK, no GPS. No chain send.
