# MedKit

**AI-native personal medicine cabinet and health timeline.**

MedKit is an independently developed, open-source cross-platform project to manage the medicines you own, medication plans versus doses actually taken, symptom/illness history, and secure interoperability with external AI agents through MCP.

**Status:** Early development. The app is not implemented yet.

## Product

- **Today** - current health status, active medications, and recent dose events.
- **Cabinet** - medicine inventory, ingredients, quantities, and expiry.
- **History** - linked symptoms, illness episodes, and medication use.
- **Advisor** - conservative, evidence-grounded informational assistance, with clear uncertainty.
- **Interoperability** - optional AI providers and permissioned MCP access for compatible clients.

**Design:** Less is more. Let the layout do the explanation. Make the UI professional, minimal, and accessible.

## Roadmap

1. Local-first iOS, Android, and Web tracking, working without AI or mandatory cloud login.
2. Structured medication checks, AI provider abstraction, and authenticated read-only MCP capabilities.
3. Opt-in sync, verified medicine references, reminders, optional sign-in integrations, and carefully controlled write tools.

## License and attribution

Released under the **GNU Affero General Public License v3.0**. See [LICENSE](LICENSE). Third-party components retain their respective licenses.

## Privacy and security

The repository is **public**, but personal medical records are **private**. Never commit real health information, API keys, exports, database files, or credentials. Demo and test data must be synthetic. See [SECURITY.md](SECURITY.md).

## Medical limitations

MedKit is not a substitute for medical care and is not clinically validated as a diagnosis, prescribing, or drug-interaction service. Decisions about treatment or medicine safety require appropriate verified information and professional guidance.
