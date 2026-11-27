# Retention

Draft for legal review. Not an adopted retention schedule.

| Record | Suggested hold | Notes |
|---|---|---|
| `chain_deposits`, ledger, payout rows | 7 years | Financial record. Do not delete as part of a product feature. |
| Delivery OTP hash | Until verified, then keep the row without the code | The code itself is not stored. |
| Partner location points | 30 days after the job is delivered or failed | Collected only while the partner is online and assigned. |
| Partner document metadata | Life of the application plus 2 years | File bytes are not stored on these routes. |
| Idempotency keys | 1 year | Needed to refuse a replay. |

A backup restore drill has not been run.
