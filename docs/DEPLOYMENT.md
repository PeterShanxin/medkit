# Connected Web hosting

The [Render Blueprint](../render.yaml) prepares one Node service in Singapore with a 1 GB persistent disk. Applying it creates paid resources. No service is created by committing this file. Public hosting and live ChatGPT authorization have not been verified.

## Create the service

1. In your own Render account, create a Blueprint from `PeterShanxin/medkit`, branch `main`, file `render.yaml`.
2. Review the selected compute plan and disk price before applying. The template uses `0.5c-512mb` and a 1 GB disk. [Current pricing](https://render.com/pricing) determines the bill.
3. Enter `[]` for `MEDKIT_OAUTH_CLIENTS_JSON` initially. This allows the Web app to start without accepting any OAuth clients. Do not put an owner access key in this field.
4. Apply the Blueprint. The build installs dependencies and exports the Web app. Render supplies HTTPS and `RENDER_EXTERNAL_URL`; the server uses that exact origin. Do not add a custom domain during initial setup.
5. In the service's **Shell**, run `npm run server:account` once. Save the printed owner access key in your password manager. This command creates an account each time. Do not run it in a build command, deployment hook, or conversation with an AI.
6. Open the service URL, go to **Settings → Manage connections**, and enter the key. Keep local records separate during synthetic testing.

The service listens on `0.0.0.0` only because Render's HTTPS proxy must reach it. Outside a managed proxy network, keep the default loopback binding or restrict the backend port with a firewall. Application Host/Origin validation, Secure cookies, and OAuth authentication still apply. No public account-creation API exists.

Commit-triggered service deployments and previews are disabled. In the Blueprint Settings, also set **Auto Sync → No**; Blueprint synchronization is a separate setting. Deploy reviewed commits manually after CI passes. Run one instance: the SQLite database and its WAL files live under `/var/data/medkit`, outside the checkout. Never remove or replace this disk to resolve a failed deployment. A disk-backed deployment has a brief outage during replacement.

## Connect ChatGPT

Use a ChatGPT surface that supports a custom remote MCP connection and pre-registered public OAuth clients. Availability depends on the account and surface; Android has not been verified. Follow the [official authentication guide](https://developers.openai.com/plugins/build/auth).

1. Start custom connection setup with `https://YOUR-SERVICE.onrender.com/mcp` and OAuth. Obtain the **exact callback URL shown for this connection**. This server does not advertise issuer-response support; do not substitute an assumed universal callback.
2. In Render, update `MEDKIT_OAUTH_CLIENTS_JSON` with one public client:

   ```json
   [
     {
       "client_id": "medkit-chatgpt",
       "client_name": "ChatGPT",
       "redirect_uris": ["EXACT_CALLBACK_FROM_CHATGPT"]
     }
   ]
   ```

3. Save and redeploy. Use `medkit-chatgpt` as the client ID in ChatGPT, with no client secret. The client must use PKCE S256 and the exact `/mcp` resource. If the available ChatGPT surface requires dynamic registration or client-secret authentication, stop: this adapter does not support those modes.
4. Complete consent in MedKit. Read permissions are listed; enable **Prepare record changes** only if you want write proposals. Enter the owner key only on your MedKit origin.
5. Use synthetic records to test a medicine addition, an actual dose, owner confirmation through the returned review link, and readback. Revoke access in MedKit and verify the client can no longer read.

The app and MCP use the same connected records. A proposal is saved only after owner confirmation in MedKit. Native iOS/Android databases are not synchronized. See [integration boundaries](INTEGRATIONS.md) for scope, expiry, and deletion behavior.

## Backups and maintenance

Export records through MedKit before an upgrade and store the export privately. An app export contains health records; it is not a full server backup with accounts, sessions, and grants. Protect the owner key separately. Full database backups must preserve SQLite consistency; do not copy only the main file while WAL writes are active. Test restoration before relying on backups.

Render provides disk snapshots, but their existence is not evidence that MedKit restoration has been tested. Restoring an old server backup can restore old grants or sessions; stop client access and review authorization state before reopening a restored service. MedKit has no account recovery or key-rotation command.

Only the mounted disk persists across restarts and redeploys. Do not switch this template to a free service or an ephemeral filesystem. MedKit does not encrypt records at the application layer. Review the hosting provider's access controls and storage protections before using real health data. Do not enable request-body, cookie, Authorization-header, OAuth-query, or health-record logging.

## Configuration

| Variable                    | Purpose                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `MEDKIT_DATABASE`           | Absolute path to the database outside the checkout.                                               |
| `MEDKIT_BASE_URL`           | Explicit public origin. Overrides `RENDER_EXTERNAL_URL`; use when configuring a custom domain.    |
| `MEDKIT_OAUTH_CLIENTS_JSON` | Client allowlist as JSON. `[]` disables OAuth client registration during bootstrap.               |
| `MEDKIT_OAUTH_CLIENTS`      | Alternative path to a private JSON allowlist file. Set exactly one client configuration variable. |
| `MEDKIT_BIND_HOST`          | `127.0.0.1` by default. Use `0.0.0.0` only behind a trusted proxy or firewall.                    |
| `PORT`                      | Listener port. Defaults to 4174; Render supplies its own port.                                    |

The readiness probe uses OAuth resource discovery and does not return records. Changing the public origin requires matching OAuth resource and callback configuration. Do not trust arbitrary forwarded Host or Origin headers.

Provider references checked on 2026-11-14: [Blueprint fields](https://render.com/docs/blueprint-spec), [persistent disks](https://render.com/docs/disks), [regions](https://render.com/docs/regions), and [Node version selection](https://render.com/docs/node-version).
