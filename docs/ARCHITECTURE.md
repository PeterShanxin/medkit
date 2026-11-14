# Architecture

## Boundaries

`src/domain` owns validated records and pure transitions. `src/application` owns transactions, queries, summaries, and deterministic checks. UI, provider, and MCP adapters use these services. Integration code does not create a parallel medication model.

Medicine identity is separate from physical batches. Plans contain instructions; doses contain actual outcomes. Historical plans and doses preserve the medicine identity and formulation at recording time. Archive and correction operations retain history. Creating a plan never records consumption.

Quantities use the medicine's explicit stock unit and at most three decimal places. There is no implicit unit conversion. A confirmed deduction and its dose event commit in one transaction. A stable operation UUID prevents duplicate mutations. Manual adjustments record their reason and before/after quantities. A voided dose stays visible, and returning stock requires explicit confirmation.

Symptoms are observations, not diagnoses. Consultation records distinguish user-reported from clinician-confirmed diagnoses; these labels remain user-maintained. Recovery does not automatically stop a medication plan. A recurrence starts a new episode.

## Storage and offline behavior

Both stores implement `RecordStore`. IndexedDB serializes read/write transactions on Web. Native SQLite uses an exclusive transaction and a single validated JSON aggregate. This keeps related changes atomic and allows the same application service on both platforms. The aggregate is intended for personal records, not a large clinical dataset.

Personal and demo data use separate database names. Each write re-reads current state inside its transaction, avoiding lost updates from concurrent browser tabs. BroadcastChannel refreshes other tabs; native foregrounding refreshes the store. Storage failures do not report success or replace unreadable records.

Schema version 1 is the only supported data format. Unknown versions and invalid references fail closed. A future migration must transform a copy, validate it, and commit atomically with rollback tests. Local stores do not synchronize with each other. The optional connected Web mode uses the server as the authority, as described below. Before adding automatic synchronization between local stores, define identities, deletion propagation, idempotency, per-user access rules, and conflict handling for both stock and historical corrections. Do not merge dose arrays or stock counters independently.

The production service worker caches only application assets. Health records stay in the database. A first successful online load is required. The preview server supplies restrictive headers; another host must supply equivalent headers, HTTPS, and SPA fallback routing. No deployment is configured. The optional server supplies the Web shell and equivalent headers.

## Advisor boundary

The local advisor reads structured records, checks for missing context and explicit urgency, and reports supported deterministic findings. It checks expired or unknown-expiry inventory, unconfirmed labels, shared recorded ingredient names, formulation changes, and recent recorded overlap. A 24-hour overlap window is a record review aid, not a medically validated dosing interval.

The advisor never clears a medicine as safe, selects treatment, calculates dosing limits, or infers interactions. A label check means the user checked the package, not that a clinician or reference database verified it. No licensed pharmaceutical knowledge base has been integrated. Source links and verification dates are in [research](RESEARCH.md).

The provider interface accepts checked facts and permits only their ordering. It cannot introduce treatment text, omit findings, or write records. Missing consent, invalid output, timeout, and unavailability return the local explanation. The current UI uses local checks only.

## Dependencies

Expo SDK 58, React Native 0.88, React 19.3, and Expo Router provide the shared app. Zod validates boundaries; SQLite and IndexedDB provide native and Web persistence. The MCP SDK and Express are isolated from client bundles. The optional server uses Node’s built-in SQLite module. Font files ship with the application. Vitest, fake-indexeddb, and Playwright cover domain, storage, and browser behavior.

Scoped npm overrides pin Expo's build-tool dependencies to `glob` 14.0.2 and `minimatch` 11.0.1 to address GHSA-3g3m-2fjr-6pw4 and GHSA-g3hv-75wg-m249. These are deliberate major-version overrides, verified with the project checks and bundle exports. Remove them when upstream dependency ranges include patched versions. Re-run build and compatibility checks when changing them.

## Connected record authority

`integrations/server` provides an optional single-process Node/SQLite service. `src/application/connected` owns validated change contracts, review descriptions, and mapping into existing domain commands. Both local services and server transactions call `applyRecordMutation`; MCP never duplicates inventory or dose logic.

Server schema version 1 uses a private SQLite database. Each account has an independent validated aggregate and a monotonically increasing server version, including after deletion. Owner writes carry the expected version. Conflicts return HTTP 409 without merging or silently retrying a changed intention. Request IDs bind to command payloads. A lost response can be retried with the same request ID.

Connected Web mode stores only the selected account ID in localStorage, a separate downloaded state in IndexedDB, and an HttpOnly server session cookie. Network failure permits reading the last downloaded records and clearly labels them. It does not queue offline writes. The next successful refresh restores current records. Sign-out removes the downloaded copy; separate local and demo databases remain unchanged. Native builds continue using local stores.

A one-time upload can initialize an empty connected account. It validates the snapshot and assigns the server account identity. It never overwrites populated records. This is an explicit transfer, not bidirectional synchronization. Deletion clears server records, pending proposals, and account audit/history, increments the server version, and revokes external grants. Other offline/downloaded/exported copies cannot be recalled.

OAuth access is separate from owner browser sessions. Pre-registered public clients use PKCE, an exact resource audience, scoped expiring tokens, rotating refresh tokens, and per-call revocation checks. The SDK owns protocol routing and PKCE validation. MedKit owns consent, opaque token storage, scope checks, and account isolation. Credentials are hashed at rest; medical records are not encrypted by the application.

External writes create a ten-minute proposal bound to account, grant, payload, server version, and generated operation ID. A prepared proposal has no effect on records. The owner confirmation API accepts only an owner session from the same origin. It rechecks grant validity, expiry, version, and domain constraints, then commits the change, proposal outcome, and audit metadata in one SQLite transaction. Retrying an approved proposal cannot deduct stock again.

The trust boundary includes the server operator, OS account, database backups, owner access key, and the authorized AI provider. See [integration setup and limits](INTEGRATIONS.md#connected-web-and-http-mcp). No remote provider is called directly by the app.
