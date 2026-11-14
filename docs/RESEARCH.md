# Product and reference research

Reviewed on 2026-11-09. This was a focused product and source inspection, not a full security audit. No competitor code, assets, or distinctive screens were copied.

| Product                                                           | Useful pattern and MedKit decision                                                                                                                          |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Guava](https://guavahealth.com/)                                 | Connect symptoms, medicines, and consultation preparation. MedKit uses one timeline and a readable export.                                                  |
| [MyTherapy](https://www.mytherapyapp.com/)                        | Make recording actual outcomes quick. MedKit separates plans from confirmed consumption.                                                                    |
| [Medisafe](https://medisafe.com/download-the-app)                 | Keep medicine and dose actions discoverable. Reminders are deferred until native behavior can be tested.                                                    |
| [CareClinic](https://careclinic.io/)                              | Link symptom observations with medication records. MedKit avoids turning correlations into medical conclusions.                                             |
| [Medora](https://github.com/13/medora)                            | Flutter domain entities and repositories show useful treatment/batch separation. Reuse rights were not established in the inspected tree; no source reused. |
| [medicine-cabinet](https://github.com/snachodog/medicine-cabinet) | MIT-licensed source separates identities, prescriptions, fills, and access. MedKit uses independent models and code.                                        |
| [allos](https://github.com/FloorLamp/allos)                       | AGPL-3.0 source separates medication lifecycle logic from database queries. MedKit also keeps transitions pure, with its own implementation.                |

## Framework and client sources

- [Expo SDK documentation](https://docs.expo.dev/versions/latest/) and [Router installation](https://docs.expo.dev/router/installation/): SDK-compatible shared navigation and native persistence. IndexedDB avoids Expo SQLite Web's additional WASM/header requirements.
- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk): the installed stable SDK supplies stdio transport, typed tools, and the integration-test client.
- [OpenClaw MCP](https://docs.openclaw.ai/tools/mcp) and [OpenAI Sign in with ChatGPT](https://developers.openai.com/siwc): integration boundaries and current eligibility. See [actual integration status](INTEGRATIONS.md).

## Medical and regional sources

- [HealthHub: oral paracetamol](https://www.healthhub.sg/medication-devices-and-treatment/medications/paracetamol-oral): terminology for paracetamol/acetaminophen and the need to check combination ingredients. The small alias map is not a medicine database.
- [HealthHub terms](https://www.healthhub.sg/terms-and-conditions): public access does not establish permission to redistribute a pharmaceutical reference corpus. MedKit links to sources; it does not mirror their content.
- [SCDF emergency medical services](https://www.scdf.gov.sg/home/about-scdf/emergency-medical-services): Singapore emergency number 995. The UI offers urgent guidance when the user explicitly reports severe symptoms; it does not perform reliable automated triage.
- [HSA digital health](https://www.hsa.gov.sg/medical-devices/digital-health/) and [guidance documents](https://www.hsa.gov.sg/medical-devices/guidance-documents/): software and clinical decision-support qualification require review against actual intended use and functionality.
- [MOH emerging regulatory policy](https://www.moh.gov.sg/others/health-regulation/emerging-regulatory-policy-issues/): AI healthcare guidance informs conservative positioning and human review.

This review does not establish a regulatory exemption, approval, clinical validation, or comprehensive safety coverage. MedKit remains a recordkeeping and informational application. No drug-interaction, contraindication, or dosage rules were invented or extracted into an unlicensed database.
