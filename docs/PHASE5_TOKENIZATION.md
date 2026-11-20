# Project tokenization on Algorand

Disabled until `TOKENIZATION_ENABLED=true` and the rest of the required variables are set. `GET /api/v1/tokenization/status` reports `enabled`, `network`, `network_source`, and the *names* of missing variables (never values). This change does not mint an asset and does not change production environment variables.

## Turning it on

| Variable | Required | Notes |
|---|---|---|
| `TOKENIZATION_ENABLED` | yes | must be the string `true`. Anything else leaves tokenization off. |
| `TOKENIZATION_NETWORK` | yes for Mainnet | `testnet` or `mainnet`. Mainnet is **not** inherited from `ALGORAND_NETWORK`. Set `TOKENIZATION_NETWORK=mainnet` explicitly. |
| `ALGORAND_NETWORK` | testnet fallback | If `TOKENIZATION_NETWORK` is unset, `ALGORAND_NETWORK=testnet` is accepted. `ALGORAND_NETWORK=mainnet` alone stays off. When both are set they must match. |
| `ALGORAND_NODE_URL` | yes | https algod URL for the same network as `TOKENIZATION_NETWORK`. |
| `ALGORAND_TOKEN` | if the node needs it | algod API token. Secret. |
| `ALGORAND_ISSUER_MNEMONIC` | yes | issuer account on that network. Secret. Render env only. |
| `ALGORAND_ISSUER_KEY_SCHEME` / `ALGORAND_KEY_SCHEME` | no | signing scheme, same as the chain wallet. |
| `TOKENIZE_ON_INVEST_ENABLED` | only for tokenize-as-you-invest | must be `true` **and** tokenization itself enabled. Delivery also needs custodial chain wallets on the same network (`CHAIN_WALLETS_ENABLED` and the chain-wallet variables). |

Do not set these in production until the owner approves go-live. Admin approval is still required before an ASA is created. Requests are audit-logged (`project_reviews.action = tokenization_requested`).

A business can request tokenization only after the project application is complete (the same fields, milestones, and required documents as submit-for-review). Post-funding mode still requires status `funded` or `closed`. On-invest mode still requires `TOKENIZE_ON_INVEST_ENABLED` and a pre-listing status.

Flow: complete application → business requests → admin approves → one ASA is created (decimals 0, 1 unit = 1 FARM) on the configured network → allocations recorded. Only confirmed algod results are stored.
