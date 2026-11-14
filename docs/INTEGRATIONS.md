# External AI access

## Implemented: local read-only MCP

The adapter runs over stdio on the same computer as an MCP client. It reads a validated snapshot that the user explicitly exports. It cannot read a phone's private database, synchronize records, or write doses.

1. In MedKit Settings, choose **Export all records**.
2. Store the JSON export in a private directory outside the repository.
3. From the repository directory, issue an expiring grant. Replace the absolute paths for your OS:

```sh
npm run mcp:grant -- --input /absolute/private/medkit-records.json --output /absolute/private/medkit.grant.json --scopes cabinet:read,medication:read,history:read,safety:read --hours 24
```

The command prints a secret token once. Store it in the client's private environment settings. The grant stores a token hash, but also contains the full sensitive snapshot. Scopes limit returned tool data; they do not redact the grant file itself. Do not commit the file, export, or token. Unix file mode is restricted; on Windows, use a directory with appropriate account permissions.

Configure a stdio-capable client with these settings:

```json
{
  "command": "node",
  "args": ["--import", "tsx", "integrations/mcp/stdio.ts"],
  "cwd": "/absolute/path/to/medkit",
  "env": {
    "MEDKIT_GRANT_FILE": "/absolute/private/medkit.grant.json",
    "MEDKIT_GRANT_TOKEN": "REPLACE_WITH_YOUR_PRIVATE_TOKEN"
  }
}
```

The adapter checks token, expiry, subject, and scopes on every call. It re-reads the grant so deletion or revocation takes effect without a restart. Allowed and denied calls produce metadata-only audit records next to the grant. If an allowed call cannot be audited, it is denied. The local OS account remains a trust boundary: software that can read or change the grant file is outside this token protection.

| Tools                                                                                       | Required scopes                   |
| ------------------------------------------------------------------------------------------- | --------------------------------- |
| `list_medicines`, `search_medicines`, `get_inventory_alerts`, `check_duplicate_ingredients` | `cabinet:read`                    |
| `get_active_medications`, `get_recent_doses`                                                | `medication:read`                 |
| `get_active_episodes`                                                                       | `history:read`                    |
| `get_health_timeline`                                                                       | `history:read`, `medication:read` |
| `get_medication_context_summary`                                                            | All four read scopes              |

Every result includes the snapshot export time and limitations. Update access by exporting again and issuing a new grant, then revoking the old one. There are no write tools or arbitrary database queries.

```sh
npm run mcp:revoke -- --grant /absolute/private/medkit.grant.json
```

Revocation cannot recall responses already returned. Deleting records in the app does not revoke a separate exported grant. Remove sensitive copies when no longer needed. A client may send tool results to a third-party model under that client's settings; configure it only if you consent to that disclosure.

## Client compatibility

- **Tested:** the official TypeScript MCP SDK client starts the real stdio process, searches synthetic records, and receives a denial after revocation. Scope and cross-user token tests also run in `npm test`.
- **OpenClaw:** its [MCP documentation](https://docs.openclaw.ai/tools/mcp) supports stdio entries under `mcp.servers`. Use the process settings above and its connection probe. This application has not been connected to a live OpenClaw instance.
- **ChatGPT custom MCP connections:** no remote server is deployed. The stdio adapter is not a ChatGPT remote connector. A working connection needs an explicitly authorized data path plus HTTPS transport, standards-compatible OAuth, identity isolation, scope enforcement, revocation, and remote audit coverage. Do not publish the local grant adapter as an unauthenticated HTTP endpoint.

## Built-in AI and Sign in with ChatGPT

`integrations/ai/provider.ts` defines a provider-neutral boundary with scoped consent and safe fallback. Test providers verify this contract; no OpenAI, Anthropic, compatible API, or local-model adapter is connected. There is no API-key input or nonfunctional login button.

Official [Sign in with ChatGPT documentation](https://developers.openai.com/siwc) and the [quickstart](https://developers.openai.com/siwc/quickstart) were reviewed on 2026-11-09. Eligible client integrations can request supported ChatGPT-powered access, subject to registration and current eligibility. Identity, inference authorization, and MCP access are separate. Sign-in does not imply access to conversation history, memories, or unrestricted API usage.

MedKit has no registered OAuth client, tested sign-in flow, or model inference integration. Those capabilities remain unimplemented. Any future adapter must keep secrets off distributed clients and obtain explicit consent before transmitting the minimum necessary health context.
