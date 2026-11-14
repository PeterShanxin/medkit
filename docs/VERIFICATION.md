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
- 65 unit/integration tests passed. New coverage includes real Streamable HTTP MCP, OAuth discovery, PKCE and audience checks, code replay, refresh rotation/replay, separate write consent, cross-account isolation, owner-only confirmation, stale/expired proposals, idempotent stock deductions, audit-failure rollback, database restart, deletion/revocation, offline cache behavior, lost-response retries, stale form edits, and authorization-code revocation on deletion.
- Both iOS and Android JavaScript/Hermes exports passed. Connected accounts remain Web-only; this is not native device evidence.
- `npm audit --omit=dev` reported no vulnerabilities at the time of the check.
- 10 browser journeys passed at desktop and mobile sizes, including the connected flow in light and dark themes. Browser checks ran in an isolated Windows checkout with Chrome because this container blocks Chromium's singleton sockets. No personal browser profile or health data was used.

Visual evidence: [desktop confirmation](screenshots/connected-review-desktop.png) and [mobile dark confirmation](screenshots/connected-review-mobile.png). Both were inspected after the final browser run.

A synthetic SDK client completes authorization, prepares a dose, waits for browser confirmation, reads the saved dose, and receives a denial after revocation. It is not a live ChatGPT or OpenClaw session. Public HTTPS hosting, real-client OAuth compatibility, and ChatGPT Android behavior remain unverified.
