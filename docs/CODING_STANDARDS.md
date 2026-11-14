# Coding standards

## Ownership and data

Use strict TypeScript. Validate external input and stored data. Domain transitions own inventory, dose, and lifecycle changes. UI and integration code call application services; they do not mutate records independently.

Keep medicine identity, inventory batches, plans, and actual doses separate. A schedule never proves consumption. Preserve a medicine snapshot in historical events. A correction must remain visible. Reject invalid quantities, units, dates, and references before a transaction commits. Make retryable mutations idempotent.

Persist changes atomically before showing success. A storage failure must leave prior data intact and offer recovery. Never replace unreadable data with an empty database. Do not implement synchronization without versioned migrations and explicit conflict handling.

## Safety and privacy

Treat unknown information as unknown. Do not infer diagnoses, drug classifications, allergy absence, safe doses, or interactions. Deterministic findings describe recorded facts and their limits. Provider output cannot create dose events or change treatment. Consent is required before sensitive information leaves the device.

Do not log record payloads, tokens, or provider prompts. Keep secrets outside client bundles. Keep integrations opt-in. Document the actual storage protection; do not claim encryption or clinical validation without evidence.

## Maintainability and verification

Use cohesive modules, explicit contracts, and small components. Extract repeated domain logic into its owner. Avoid generic infrastructure before a second real use needs it. Keep dependencies justified.

Test failure paths and important behavior: atomic stock deductions, historical integrity, persistence, invalid inputs, permission boundaries, and safe abstention. Regression tests should describe behavior, not private implementation. Verify responsive layouts, keyboard controls, error recovery, and meaningful empty states.

Preserve or improve maintainability in each change. Set numeric budgets only after measuring actual code. Do not invent coverage or complexity baselines. Keep verification claims specific to checks that ran.
