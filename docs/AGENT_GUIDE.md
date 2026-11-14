# Agent guide

Read [coding standards](CODING_STANDARDS.md), [writing guidance](WRITING_GUIDE.md), and [security policy](../SECURITY.md) before changes. The user's task determines scope. This guide is the single authority for agent workflow.

## Repository map

- `app/`: Expo Router routes, with shared responsive navigation.
- `src/domain/`: validated records and pure state transitions.
- `src/application/`: persistence orchestration, queries, and advisor services.
- `src/storage/`: IndexedDB on Web; SQLite on iOS and Android.
- `src/ui/`: reusable controls, forms, and feature screens.
- `integrations/`: optional provider, read-only stdio MCP, and connected HTTP server. Read [integration boundaries](INTEGRATIONS.md) before changing authorization or write tools.
- `src/application/connected/`: change requests and human review contracts. Server and UI must reuse domain transitions. The optional `render.yaml` template and [deployment guide](DEPLOYMENT.md) describe hosting setup; no live environment is implied.
- `tests/` and `e2e/`: domain, integration, and browser verification.

## Working method

Inspect the working tree first. Preserve unrelated changes. Make focused commits. Keep the license intact. Do not commit health records, credentials, exports, or private databases. Use synthetic fixtures.

Use the scripts in `package.json` as the command authority. Keep `npm run verify` aligned with CI. Run browser journeys with `npm run test:e2e`. Report native build and device checks separately from browser checks. An adapter test is not proof of a real external client connection.

Update the README when supported behavior or setup changes. Update architecture documentation when boundaries change. Keep root agent entry files pointer-only. Link to existing policies instead of duplicating them. Do not save task prompts or session notes as project guidance.

Before handoff, inspect the full diff, verify referenced paths, remove task-owned scratch files and unused dependencies, and report executed checks, limitations, and Git status. Do not merge, release, deploy, or change repository administration without task authorization.
