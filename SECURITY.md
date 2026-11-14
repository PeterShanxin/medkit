# Security Policy

MedKit handles sensitive personal health information. Please **do not** report security vulnerabilities or include real medical records, tokens, patient details, or private logs in public GitHub issues.

For sensitive findings, use GitHub's private vulnerability reporting if it is enabled for this repository, or contact the maintainer privately through a channel the maintainer explicitly publishes. Do not publish proof-of-concept exploits containing personal information.

This repository is an early-stage personal health tracking project, not validated medical software. Do not rely on it for emergency assessment, diagnosis, prescribing, or independent medication safety decisions.

## Implemented boundaries

- Personal and synthetic demo records use separate local databases. Connected Web mode is opt-in and uses a separate downloaded cache. Uploading existing local records requires explicit consent. There is no analytics or live built-in AI provider.
- Local databases and exported files are not encrypted by MedKit. Device locks, OS permissions, browser-profile isolation, and secure backups remain necessary.
- Local deletion is logical deletion, not guaranteed forensic erasure. Previously shared exports, MCP grants, and client responses remain outside the app's control.
- The optional connected server stores unencrypted medical records on its configured private disk. OAuth credentials are hashed; this does not encrypt records. Owner access keys must never be given to an AI client. Each external change needs independent owner confirmation in MedKit. Connected hosting and live ChatGPT access are not provisioned or verified.
- The optional stdio MCP adapter uses a scoped, expiring local grant. It is not a remote OAuth server. Anyone with access to the local OS account or grant file is inside its trust boundary. See [integration instructions](docs/INTEGRATIONS.md).
- User notes and external tool inputs are untrusted data. They cannot override domain validation or authorization. Avoid adding raw record logging, unrestricted queries, or remote access without authentication.

Use only synthetic data in tests, screenshots, issues, and review evidence. Keep health exports, databases, model credentials, and MCP grants outside source control. Do not treat a passing dependency audit as proof that the application is secure.
