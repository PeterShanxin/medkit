# MedKit - Build Brief for an Advanced Coding Agent

You are the lead product designer, full-stack engineer, and AI integration engineer for MedKit, a public MIT-licensed open-source project.

Your job is to produce a working, polished cross-platform application, not only a plan, specification, or clickable prototype. Inspect this repository first, preserve useful conventions, and work autonomously. Prioritize a coherent, tested end-to-end product over a wide collection of unfinished features.

## Product goal

Build an AI-native personal medicine cabinet and health timeline. The app knows what medicines the user owns, what they are currently instructed to take, what they actually took, what symptoms and illnesses they have recorded, and what information could be useful when deciding whether to seek care or discuss an OTC medicine with a pharmacist.

MedKit must remain genuinely useful without AI, without a cloud account, and without an internet connection for basic recordkeeping. Its data and domain services should also be accessible to authorized external AI clients through MCP.

This is a personal tracking and conservative informational decision-support tool, NOT a diagnostic, prescribing, or independently clinically validated system.

## Product design: non-negotiable

- Less is more. Let the layout do the explanation.
- No redundant secondary labels, decorative descriptions, excessive badges, or generic AI-dashboard styling.
- Calm, professional, premium visual language; strong hierarchy through spacing, typography, and composition.
- Excellent light/dark modes, accessibility, color-independent statuses, responsive layouts, and platform-appropriate navigation.
- Excellent empty, loading, error, offline, and permission states.
- Minimize time to log a medication dose or update symptoms.
- Preserve clinically essential names, ingredients, strengths, units, timestamps, and warnings. Minimalism must never create medication ambiguity.
- The app should look complete and intentional, not like a template.

## Research before implementation

Briefly inspect the UX of Guava, MyTherapy, Medisafe, and CareClinic; optionally review Medora, snachodog/medicine-cabinet, and FloorLamp/allos source where available. Identify practical interaction and domain-model lessons. Do not clone any proprietary UI or copy code without checking compatibility and attribution. A concise assessment is sufficient; then build.

## Main experiences

1. Today: active illness status, currently followed medication plans, recent dose events, and one clear next action. A healthy state should be calm and uncluttered.
2. Cabinet: search/add/edit medicines, batch quantities, expiry, ingredient information, storage, and available/low/expired/discarded states.
3. History: linked timeline of symptom episodes, clinician-confirmed or user-reported diagnoses, medication plans, actual dose events, symptom evolution, and recovery.
4. Advisor: user asks natural-language questions about their own records, available medicines, relevant safety information, and when to seek professional advice. Allow structured symptom intake and follow-up only when necessary.
5. Settings: data ownership, export/import, privacy, optional sync, AI provider consent, and connected AI access.

### Core data rules

Maintain separate domain entities for:
- Medicine catalog identity and its ingredients, strength, dosage form, and aliases (including English/Chinese names).
- Owned inventory item or batch (quantity, expiration, location).
- Medication regimen or instruction (scheduled/PRN, active/paused/stopped).
- Actual confirmed dose event (timestamp, quantity, units, linked episode).
- Illness/symptom episode and dated symptom observations.
- Allergies and relevant safety context, with explicit unknown/unconfirmed states.
- Medicine reference data and provenance.
- Advisor assessment and structured evidence.
- External client grants and audit events.

Ownership is not consumption; a plan is not a dose. Only confirmed dose logging should change actual-intake history. Stock deductions require confirmed consumption or a deliberate adjustment. Preserve an auditable historical record if stock, plans, or episodes later change. Handle duplicate ingredients in combination medicines. Validate units, identifiers, and chronology.

## Medication assistance: safety by architecture

Do not implement unrestricted LLM-generated medical advice.

Start with verifiable, deterministic checks: expired inventory, overlapping active ingredients, incomplete medication identification, missing safety history, and the distinction between user entries and confirmed references. Use authoritative medication sources and record provenance, region, and last verification date. Default regional context: Singapore, with HealthHub/HSA as potential sources subject to licensing and integration feasibility.

Use the following sequence: retrieve structured context -> identify unknowns and red flags -> run deterministic safety checks -> retrieve verified medicine information -> produce structured findings or abstention -> explain in natural language.

Do not invent formulations, contraindications, drug interactions, dosages, source citations, or diagnoses. Never assume unknown allergies or medical history means safe. Do not instruct users to start/stop/alter prescription regimens. Do not imply that unverified data can establish a medicine is safe. Escalate urgent or complex circumstances to medical professionals. Purchase suggestions, if feasible, should describe verified OTC categories or active ingredients for pharmacist discussion, not prescriptions or fabricated real-time stock/price.

If a sufficiently licensed, reliable clinical knowledge source is unavailable, implement safe informational fallback and clearly mark advanced suitability/interaction screening as not implemented. Do not hard-code fake real-world safety findings.

## AI: interchangeable and optional

Add a narrow provider interface, rather than tying the domain to one model vendor. Support provider adapters where credentials are available; absence of keys must not break core product flows.

Use AI for record summarization, natural-language intake, and explanation of verified findings, with structured outputs and user review before persisting extracted health data. Request explicit consent before sharing medical context with third-party model providers. Minimize the data sent, redact unnecessary details, and never treat model memory as the health source of truth.

Evaluate Sign in with ChatGPT against current official availability for open-source clients. Distinguish identity, eligible plan-powered inference, and authorization of this app's MCP server. Implement only if applicable and verifiable; otherwise provide an optional integration seam. Never make it the only login method.

## MCP: a first-class boundary

Design a shared application service layer used by app UI, built-in AI, and MCP. Do not duplicate business logic inside MCP tools.

Implement an MCP foundation with typed schemas and focused, authorized read-only tools such as:
- list_medicines
- get_active_medications
- get_recent_doses
- get_active_episodes
- get_health_timeline
- get_inventory_alerts
- check_duplicate_ingredients
- get_medication_context_summary

Use Streamable HTTP for remote clients and the current official MCP SDK. For any remotely accessible private health data, require supported OAuth authorization, HTTPS, per-user access isolation, short-lived scoped tokens, revocation, and audit logging. Reject requests with missing/invalid audience, scope, or identity. Do not expose arbitrary SQL or a blanket records dump. Read-only by default.

Later, add user-confirmed, individually scoped mutations (for example log_taken_dose, add_inventory_item, record_symptom). Enforce confirmation and idempotency server-side; an agent cannot assert that a suggested dose was actually taken. A remote MCP server must never silently expose local-only records: define an explicit opt-in sync/secure access model before enabling it.

Provide test steps for ChatGPT custom MCP plugins and OpenClaw. Do not confuse 'OpenClaw consuming MedKit MCP' with 'OpenClaw itself serving MCP'.

## Architecture

Preferred starting stack: Expo + React Native + TypeScript + Expo Router for iOS, Android, and responsive Web. Validate current SDK/library compatibility. Prefer a maintainable monorepo only if shared app/backend packages justify it.

Use local-first storage for personal records and a clean repository/service abstraction. Optional account sync can use Supabase/PostgreSQL with RLS after local flows work; explicitly address conflict resolution, backups, and migration/versioning. MCP-backed remote access requires a reachable authenticated service, not a fictitious direct connection to on-device SQLite.

Keep separate layers for presentation, domain rules, data repositories, medication reference knowledge, AI adapters, and MCP/API adapters. Use realistic synthetic demo data exclusively in the public repository. Never commit real health records, API keys, database exports, image uploads, or auth tokens.

## Open-source project standards

- MIT license is already present; preserve it and respect upstream licenses.
- Keep the README concise and useful: project purpose, status, setup, commands, architecture sketch, privacy/safety caveat, and roadmap.
- Add an appropriate .gitignore, .env.example without secrets, and a lightweight security disclosure policy.
- Add focused CI for formatting/linting, type checking, tests, and builds when the project is scaffolded.
- Prefer small logical commits and maintainable code. No CLA, extensive bureaucracy, or contributor process unless genuinely needed.
- Document meaningful architectural decisions, not routine implementation details.
- Treat published package metadata, screenshots, and sample data as public; sanitize all examples.

## Execution order

Phase 1 (must work): visual design system, responsive navigation, local persistence, cabinet CRUD, medication plans, confirmed dose logging, episode/symptom timeline, export/delete, synthetic demo data, and relevant automated tests.

Phase 2 (after Phase 1 works): structured safety checks with abstention, built-in AI provider interface and grounded summaries, shared app service layer, initial read-only MCP tools and authorization boundary, connection tests.

Phase 3 (optional): properly authorized remote sync, ChatGPT sign-in where eligible, OCR, reminders, controlled MCP writes, enhanced verified medicine knowledge, multilingual support.

Build the first meaningful vertical slice as soon as possible, then iterate to improve UX. Do not waste the first session writing an elaborate plan. Do not claim unimplemented Phase 2/3 functionality works.

## Acceptance criteria

Demonstrate that a user can: open the app on mobile-sized and desktop-sized layouts; enter and find medicines; see expired/low stock; create and resolve symptom episodes; create and stop medication plans; record real dose events; see an accurate combined timeline; close and reopen the app without losing data; export and delete records; and use the app without any AI account or key.

Test duplicated ingredients, uncertain medicine identification, expiry, invalid quantities/units, plan-vs-actual-dose separation, offline/restart persistence, data isolation, and safe advisor abstention.

For any implemented MCP integration, test authenticated read access, denied unauthorized access, limited scopes, malformed arguments, revocation, and absence of data leakage.

Finish by running the relevant tests/builds, inspecting the actual UI, and reporting exactly what is implemented, tested, still simulated, blocked, or intentionally deferred.

You may decide ordinary technical details independently. Optimize for simplicity, integrity, reliability, and polish. **Build something useful, not something merely ambitious.**
