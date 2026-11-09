# MedKit

**An open-source, AI-native personal medicine cabinet and health timeline.**

MedKit is a work-in-progress cross-platform app for keeping track of the medicines you own, medication instructions versus doses actually taken, symptoms and illness history, and useful contextual information for medication discussions. It is designed to work independently as a personal recordkeeper and, with explicit authorization, expose selected capabilities to external AI clients via MCP.

**Status:** Pre-implementation. This repository currently contains the project brief and open-source foundations, not a functioning app.

## Product goals

- **Today** - see active symptom episodes, medication plans, and recent actual doses.
- **Cabinet** - manage medicine batches, active ingredients, quantities, and expiry.
- **History** - follow a linked illness, symptom, and medication timeline.
- **Advisor** - ask questions grounded in personal records and verified medication information, with clear uncertainty and professional-care escalation.
- **Interoperability** - optional in-app AI and scoped, authenticated MCP access for ChatGPT, OpenClaw, and other compatible clients.

## Design philosophy

**Less is more. Let the layout do the explanation.** Calm, premium, responsive interfaces with accessible information hierarchy and no redundant secondary labels.

## Implementation brief

The authoritative coding-agent brief is [docs/BUILD_PROMPT.md](docs/BUILD_PROMPT.md). It covers product journeys, domain modeling, safety, architecture, MCP, privacy, and phased acceptance criteria.

## Roadmap

1. Local-first iOS/Android/Web medicine cabinet, confirmed dose tracking, health timeline, demo data, and exports.
2. Conservative medication checks, provider-independent AI adapter, authenticated read-only MCP tools.
3. Optional sync, supported ChatGPT sign-in, reminders/OCR, richer verified medicine references, and controlled MCP writes.

## Open source

Licensed under the [MIT License](LICENSE). This repo welcomes useful ideas and responsibly licensed inspiration from existing projects. It is independently designed, not a fork.

## Security & privacy

**The repository is public, but user health records must never be public.** Do not commit actual medication/illness records, local databases, credentials, exports, or API tokens. Use synthetic data for tests and demos. See [SECURITY.md](SECURITY.md) for vulnerability disclosure guidance.

## Medical limitations

MedKit is not an emergency service, doctor, pharmacist, medical diagnosis system, or validated clinical decision-support product. Do not rely on it to prescribe medicines or independently determine whether a medicine is safe. Any future guidance must be grounded in verified references and make uncertainty explicit.
