# Initial milestone verification

Executed on 2026-11-09 using synthetic records only.

| Check                      | Result and scope                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `npm ci`                   | Clean lockfile installation on Windows.                                            |
| `npm run typecheck`        | Passed with strict TypeScript.                                                     |
| `npm run format:check`     | Passed.                                                                            |
| `npm test`                 | 44 tests passed across domain, persistence, provider, and MCP suites.              |
| `npm run build:web`        | Passed. Production shell includes offline asset caching.                           |
| `npm run test:e2e`         | 8 Chromium journeys passed, at 1440 × 1000 and 390 × 844.                          |
| `npm run build:native`     | iOS and Android JavaScript/Hermes exports passed. No native binary or device test. |
| `npx expo install --check` | Dependencies are up to date for the selected SDK.                                  |
| `npm audit --omit=dev`     | No reported vulnerabilities at verification time.                                  |

The browser journeys exercise medicine creation and editing, separate batch details, an episode-linked plan, confirmed stock deduction, restart persistence, recovery, consultation export, deletion, insufficient-stock rejection, offline reload and mutation, Chinese-name search, expiry filtering, advisor abstention, theme switching, and demo isolation. Browser tests fail on unexpected application errors and check the responsive navigation target size.

Domain and storage tests cover atomic rollback, concurrent writers, idempotency, historical snapshots and corrections, amount/unit validation, plan transitions, overlapping episodes, unknown schema rejection, duplicate ingredients, and safe abstention. Provider tests use test doubles, not a real provider. MCP tests use both in-memory transport and an actual SDK client/server stdio process, including permission checks and revocation.

## Visual evidence

These are captured application screens with synthetic demo data. Desktop light and mobile dark layouts were inspected after correcting the desktop navigation layout.

- [Desktop light](screenshots/today-desktop.png)
- [Mobile dark](screenshots/today-mobile-dark.png)

## Limits

Native persistence, keyboard behavior, file sharing, and accessibility still need iOS and Android device testing. Safari, Firefox, assistive-technology behavior, production hosting, live OpenClaw, and ChatGPT connections were not tested. A passing browser run is not evidence of those capabilities.

The local execution environment could not launch Chromium because it denied browser sockets. Browser tests therefore ran in an isolated temporary checkout on Windows, using an existing Chrome executable. No existing browser profile or personal MedKit records were used. The temporary checkout and browser processes were removed after evidence was collected.

## Connected records milestone

Executed on 2026-11-14 with synthetic records only:

- Strict TypeScript, formatting checks, and the production Web build passed.
- 69 unit/integration tests passed. New coverage includes real Streamable HTTP MCP, OAuth discovery, PKCE and audience checks, code replay, refresh rotation/replay, separate write consent, cross-account isolation, owner-only confirmation, stale/expired proposals, idempotent stock deductions, audit-failure rollback, database restart, deletion/revocation, offline cache behavior, lost-response retries, stale form edits, and authorization-code revocation on deletion, managed-host configuration, and the real server CLI across restart.
- Both iOS and Android JavaScript/Hermes exports passed. Connected accounts remain Web-only; this is not native device evidence.
- `npm audit --omit=dev` reported no vulnerabilities at the time of the check.
- 12 browser journeys passed at desktop and mobile sizes, including the connected flow in light and dark themes, lost-response recovery, and stale-edit rejection. Browser checks ran in an isolated Windows checkout with Chrome because this container blocks Chromium's singleton sockets. No personal browser profile or health data was used.

Visual evidence: [desktop confirmation](screenshots/connected-review-desktop.png) and [mobile dark confirmation](screenshots/connected-review-mobile.png). Both were inspected after the final browser run.

A synthetic SDK client completes authorization, prepares a dose, waits for browser confirmation, reads the saved dose, and receives a denial after revocation. It is not a live ChatGPT or OpenClaw session. Public HTTPS hosting, real-client OAuth compatibility, and ChatGPT Android behavior remain unverified.

## Cloudflare adapter milestone

Executed on 2026-11-14 with synthetic data:

- TypeScript checks passed for the app/Node code and the separate Worker runtime types.
- 71 unit/integration tests passed, including migration of existing Node databases and rollback of oversized writes.
- Nine compiled Worker/D1 tests passed in workerd through Miniflare. They exercise static/API routing, OAuth consent and PKCE, the actual MCP SDK client, concurrent dose confirmation, cross-account isolation, grant revocation, authorization-code and refresh-token races, transaction rollback, authorization changes during commit, deletion of a long history, and account/session/dose persistence across a Worker restart, query-bounded revocation of 60 historical grants, and shared login throttling for path variants.
- Wrangler's deployment dry run passed. The Worker bundle was approximately 613 KiB gzip, below the published Free bundle-size limit. This does not establish production CPU usage.

The local D1 migration and private-file account provisioning commands completed successfully. iOS and Android JavaScript/Hermes exports passed; no native device test was performed.

No Cloudflare account was authenticated during these checks. No production D1 database, public Worker deployment, live ChatGPT session, or real health-data upload was tested. The restricted Linux environment cannot run `wrangler dev` because network-interface enumeration is blocked; the programmatic Miniflare tests explicitly bind loopback and ran successfully. Normal local setup remains documented for environments that permit interface enumeration.

## Public Cloudflare and ChatGPT acceptance

Executed on 2026-11-14 from Windows with Node 24.22.0 and Microsoft Edge, using synthetic records only. Source commit `2c4b4101c7a8ae4599327726f15296c01d9a19be` was deployed to a Workers Free account with D1. This was a separately provisioned personal deployment, not an automatically provisioned service for repository users.

- `npm ci`, `npm run verify` (71 unit/integration tests and nine Worker tests), `npm run build:native`, and 12 browser journeys passed locally. `npm audit --omit=dev` reported no vulnerabilities.
- Public pages and OAuth discovery returned 200. Unauthenticated record access and MCP initialization returned 401; an incorrect API origin returned 403.
- Owner login with separate local records, synthetic medicine creation, refresh persistence, and JSON export passed. The downloaded synthetic export was checked and removed.
- Real ChatGPT connected with a pre-registered public client, its exact callback, token authentication `none`, and PKCE. Read-only consent allowed `list_medicines`. A write proposal under that grant failed without creating a review; its generic error did not distinguish permissions from invalid record details.
- After separate write consent, ChatGPT prepared a synthetic medicine and first batch. It remained absent from the cabinet until confirmation through the owner Web session. Both Web and ChatGPT then read back eight tablets and the correct expiry; the request status was `applied`.
- ChatGPT prepared a synthetic taken-dose event. Inventory remained eight before owner confirmation. Confirmation created one dose and reduced the batch to seven; Web history and ChatGPT readback agreed. The operator performed confirmation through the owner UI with the user's explicit authorization for disposable synthetic testing.
- Retrying that dose proposal from ChatGPT with the same request ID and identical input returned the original applied review. A fresh read still showed one dose and seven tablets.
- Insufficient-stock and mismatched-unit proposals failed without changing inventory. Their errors were generic; the client did not receive distinct validation codes.
- Revoking the connection rejected its pending stock adjustment. Submitting the previously opened owner confirmation form then failed with “This request has already been reviewed.” Both subsequent ChatGPT reads failed with a generic client error rather than returning records; the UI did not expose an HTTP status.
- Cleanup deleted all synthetic connected records and reviews and revoked both test grants. The connected cabinet showed zero medicines and batches, history was empty, and no clients or pending requests remained. Owner sign-out returned to an empty local home screen. The ChatGPT account connection and synthetic test chat were removed; the reusable app registration and private owner credential were retained.

Native devices, ChatGPT Android, OpenClaw, production CPU/capacity, and backup restoration remain unverified. This acceptance does not establish clinical safety, end-to-end encryption, or native synchronization.
