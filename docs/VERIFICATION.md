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

## GitHub sign-in verification

Executed locally on Windows on 2026-11-15 with synthetic data:

- `npm run verify` passed: strict TypeScript, formatting, 80 unit/integration tests, the production Web build, Wrangler dry run, and ten compiled Worker/D1 tests.
- New checks cover two independent sessions for one existing account, PKCE, browser-bound state, expiry, denial, replay/concurrent callbacks, unmapped identities, provider failures and redirects, safe local return URLs, and the Node schema 2-to-3 migration without replacing records. The Worker check exercises the compiled login flow and callback replay with a controlled outbound GitHub service.
- All 14 desktop/mobile browser journeys passed, including GitHub login, same-account record readback in two isolated browser contexts, refresh, logout, and return to separate local records.
- iOS and Android JavaScript/Hermes exports passed. This does not add native account synchronization or establish native device behavior.

GitHub responses in these automated checks are synthetic. Earlier public ChatGPT acceptance above used owner-key login and does not prove the GitHub flow.

Live acceptance on 2026-11-15 used Microsoft Edge and the same personal Workers Free/D1 deployment. Source `ceb9763` was deployed after applying additive migration `0002_github_login.sql`. The operator configured a user-created OAuth App with an exact callback, no wildcard matching or device flow, and a client secret in Cloudflare Worker secrets.

- GitHub displayed **Public data only**. Actual authorization returned to MedKit with a connected session without entering the owner key.
- Database metadata confirmed one existing owner, one record aggregate, a session for the original owner subject, zero medicines, and no remaining login intent. No second MedKit account was created.
- Refresh retained the connected account. Sign-out returned to local mode. A second complete GitHub login succeeded without an access key, followed by final sign-out. The final database check found zero active owner sessions, zero medicines and zero pending login intents.
- No health data was entered. No AI client was reauthorized. The temporary local copy of the application secret was removed after successful configuration; the original private owner backup was retained.

This was two sequential live sessions in one Edge profile, not a second physical device test. Independent browser contexts are covered by the automated journeys. ChatGPT's full write/confirmation flow was not repeated with GitHub sign-in; the previous live owner-key acceptance remains a separate result. Native synchronization, account recovery and production CPU capacity remain outside this verification.

## Invited users and connection guide

Local checks on 2026-11-15 used synthetic GitHub identities and records. `npm run verify` passed strict types, formatting, 86 unit/integration tests, the Web build and eleven compiled Worker/D1 tests. iOS and Android JavaScript/Hermes exports also passed; this does not establish native device behavior.

New coverage exercises concurrent first sign-ins creating one account, separate users' records, denial of host operations to guests, verified username-to-ID lookup, stale browser writes and consent after cookie/account switching, actual OAuth token revocation, pending-review rejection, login/revocation races, and re-invitation restoring the original account without reviving tokens. The compiled Worker test performs invitation, GitHub login, authorization denial and revocation against D1.

All 16 desktop/mobile browser journeys passed. New coverage includes the in-app connection guide, host profile lookup and invitation, two isolated guest browser contexts, private-cabinet readback, absent guest invitation controls, and revocation without affecting another user. All identities and provider responses in these checks are synthetic. Live onboarding of a second human, plugin installation in another ChatGPT account/workspace, and public plugin-directory publication remain unverified.

Live acceptance on 2026-11-15 deployed source `5b3fea4` to the existing Workers Free/D1 environment. The original owner was explicitly configured as the invitation administrator. Edge verified GitHub sign-in, the Settings connection-guide entry, and host-only invitation controls. An initial unauthenticated GitHub profile lookup failed upstream; app-authenticated lookup then returned the correct public profile. The initial upstream failure's cause was not established. Regression checks cover fixed-origin credential handling, rejected redirects and rate-limit errors; both invitation browser journeys passed again after this fix.

No production invitations or guest accounts were created. After sign-out, database metadata showed one existing owner, one account, zero medicines, zero invitations, zero active sessions and zero pending GitHub login intents. The guide remained open in Edge. No AI client was reauthorized and no health records were added. This verifies the live host entry and lookup, while guest creation, cabinet isolation and revocation remain automated synthetic evidence. The prior real ChatGPT acceptance remains separate; this change does not publish the private plugin or establish another user's ChatGPT access.

The same day's navigation follow-up moved invitation management to the first panel in **Settings**, labeled **Invite people**, and removed the redundant signed-in connection-management link from the guide. Source `5bf04ed` was deployed and checked in Edge: the existing host session saw the invitation form in Settings and a single connection-management navigation link on the guide. No invitation or record was created. The existing session was preserved. Verification passed 86 unit/integration and eleven Worker tests, followed by final type/Web-build checks and all sixteen desktop/mobile browser journeys. Browser coverage now exercises invitations from Settings and absence of guest controls there.

The PR follow-up security review identified two additional boundaries: invalid MCP bearer requests created unbounded anonymous audit rows, and a signed-out consent form could adopt another tab's newly signed-in account. Both were reproduced before correction. The HTTP adapter now leaves rejected requests out of persistent anonymous auditing, and approvals require the displayed session or explicit signed-out state to remain unchanged. Verification passed 88 unit/integration and twelve compiled Worker/D1 tests, including invalid-token rejection without audit growth, stale signed-out/session forms, and a real PKCE token exchange bound to the intended key owner. All sixteen desktop/mobile browser journeys also passed after the fixes. No historical records or audit rows were deleted by these fixes.
