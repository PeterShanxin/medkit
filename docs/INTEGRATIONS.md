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
- **ChatGPT custom MCP connections:** no remote server is deployed. The stdio adapter is not a ChatGPT remote connector. The optional [connected server](#connected-web-and-http-mcp) implements the shared data path, OAuth, permission checks, and confirmed changes. It still needs HTTPS hosting and validation with the intended client. Do not publish the local grant adapter as an unauthenticated HTTP endpoint.

## Built-in AI and Sign in with ChatGPT

`integrations/ai/provider.ts` defines a provider-neutral boundary with scoped consent and safe fallback. Test providers verify this contract; no OpenAI, Anthropic, compatible API, or local-model adapter is connected. There is no API-key input or nonfunctional login button.

Official [Sign in with ChatGPT documentation](https://developers.openai.com/siwc) and the [quickstart](https://developers.openai.com/siwc/quickstart) were reviewed on 2026-11-09. Eligible client integrations can request supported ChatGPT-powered access, subject to registration and current eligibility. Identity, inference authorization, and MCP access are separate. Sign-in does not imply access to conversation history, memories, or unrestricted API usage.

MedKit has no registered OAuth client, tested sign-in flow, or model inference integration. Those capabilities remain unimplemented. Any future adapter must keep secrets off distributed clients and obtain explicit consent before transmitting the minimum necessary health context.

## Connected Web and HTTP MCP

The optional Node server or Cloudflare Worker hosts the Web app and a Streamable HTTP MCP endpoint at `/mcp`. Connected Web sessions and MCP read the same server records. It adds `prepare_record_change` and `get_record_change_status` to the nine read tools. The local stdio adapter remains read-only.

A prepared change is **not a saved medical record**. The server returns a review URL. The owner opens that URL in MedKit, checks every field, and selects **Confirm and save**. MCP tokens cannot call the owner confirmation API. Connected forms retain the displayed record version. A background refresh cannot silently rebase an open edit. If a save response is lost, retry checks the original submission without creating new record IDs; the error explains that later edits are not sent. Requests expire after ten minutes and require a fresh review after any intervening record change. A stable request ID prevents duplicate preparations; repeated approval does not apply a second stock deduction. Corrections preserve the original dose and return stock only when explicitly requested.

Supported changes: add medicine with its first batch, add another batch, record an actual dose, start an episode with symptoms, add a symptom, record recovery, adjust counted stock, and void an incorrect dose. No tool creates diagnoses or changes prescription plans. Extracted medicine labels and classifications remain unverified. Photo extraction itself is not implemented.

### Run a private connected server

Use Node.js 24.22 or later in the Node 24 line, a private persistent disk, and one server process. Node SQLite needs a persistent filesystem. For serverless hosting, use the [Workers + D1 adapter](DEPLOYMENT.md). No hosting service, public endpoint, backups, or live ChatGPT connection is provisioned by this repository.

1. Build with `npm ci` and `npm run build:web`.
2. Set `MEDKIT_DATABASE` to an absolute file path **outside the checkout**, in an owner-only directory. On Windows, protect the directory with account ACLs; Unix mode bits do not configure Windows ACLs.
3. Run `npm run server:account`. Store the printed access key privately. This is an owner credential, not an MCP token. Never paste it into an AI conversation or commit it. Each invocation creates a separate account.
4. Create a private OAuth client configuration file outside the checkout. Register only clients you intend to use. Use the exact callback shown by that client's connection setup:

```json
[
  {
    "client_id": "medkit-personal-client",
    "client_name": "My AI client",
    "redirect_uris": ["https://REPLACE-WITH-EXACT-CLIENT-CALLBACK"]
  }
]
```

5. Set `MEDKIT_OAUTH_CLIENTS` to that file, or set `MEDKIT_OAUTH_CLIENTS_JSON` to its JSON content. Set exactly one. An empty array permits initial Web setup without authorizing any OAuth client. Set `MEDKIT_BASE_URL` to the public HTTPS origin with no path, query, or fragment. Set `PORT` to the internal port (default `4174`). Run `npm run server`.
6. Terminate HTTPS at a trusted reverse proxy and forward to `127.0.0.1:4174`. Preserve the public `Host` header. Do not expose the backend port directly. Do not log cookies, Authorization headers, request bodies, OAuth codes, or consent URLs. The app deliberately does not trust forwarded IP headers; its rate limits apply to the proxy address as an aggregate.
7. Open the hosted Web app, go to **Settings → Manage connections**, and enter the owner access key. Choose **Keep separate** unless you intend to upload this browser's local records. Upload is explicit, limited to an empty connected account, and cannot overwrite existing server records. The native app is not synchronized.

For local synthetic testing only, `MEDKIT_BASE_URL=http://127.0.0.1:4174` permits HTTP on loopback. Exact loopback OAuth callbacks are allowed in this mode. Public HTTP origins and wildcard callbacks are rejected.

The server has no account recovery UI or key-rotation command. Protect the owner key and database together. Stop the server and back up the private database directory, including any SQLite WAL files, before upgrades. Test restoration privately. Unknown database schema versions fail closed. Do not store this database on a shared network filesystem.

### Authorize an AI client

Use the server's HTTPS `/mcp` URL, OAuth, and the configured client ID. This server supports **pre-registered public OAuth clients with PKCE S256**. It does not offer dynamic registration, CIMD, or client-secret authentication. A client that requires those methods needs a separate tested adapter.

Discovery is provided at `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-authorization-server`. The exact `/mcp` URL is the required OAuth `resource` at authorization and token exchange. Callback URLs match the configured allowlist exactly. The server does not advertise RFC 9207 issuer-response support; use the callback supplied for that configuration rather than assuming a universal ChatGPT callback.

The consent screen lists read permissions and leaves write permission unchecked. All four read scopes plus `records:write` are currently required to prepare a change or read its review status, because its review can include related medicine, dose, and episode context. Only explicitly requested scopes can be granted. Access tokens expire after 15 minutes. Refresh tokens rotate; replay revokes the whole connection. Connections expire after 30 days. Owner browser sessions expire after eight hours and use HttpOnly, SameSite cookies with Secure enabled for HTTPS. Reconnect from Connections when a session expires.

Revoke a client in **Connections** to deny subsequent calls and reject its pending requests. Deleting connected records revokes every client and clears pending requests. Signing out clears this browser's downloaded copy but retains server records and authorized clients. It does not sign out other browser sessions. Revocation cannot recall data already returned to a model provider.

Current official references checked on 2026-11-14: [OpenAI MCP authentication](https://developers.openai.com/plugins/build/auth) and [custom MCP connections](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt). Account eligibility and client surfaces vary. A synthetic SDK test does not prove ChatGPT or OpenClaw compatibility. Before using real records, test the full authorization, prepare, owner confirmation, readback, expiry, and revocation flow in the intended client. ChatGPT Android behavior remains unverified.
