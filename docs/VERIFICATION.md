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
