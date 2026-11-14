# Cloudflare Workers + D1

The Worker serves the Web app, OAuth, and HTTP MCP. D1 stores connected accounts. The local-first app still works without this deployment. No personal records are uploaded during setup.

## Local verification

Use the Node version in `package.json`. Run from the repository root:

```sh
npm ci
npm run build:web
npm run worker:migrate
npm run worker:account -- --output /absolute/private/medkit-local-owner.json
npm run worker:dev
```

Create the private output directory first. The account command creates a new account each time. It saves the owner key to the requested file and never prints it. Unix mode 0600 does not set Windows ACLs; protect that directory with your OS account permissions. Open `http://127.0.0.1:8787`, then **Settings → Manage connections**. Enter the key yourself. Never give it to an AI client.

Local D1 lives in the ignored `.wrangler/` directory. Use synthetic records there. `npm run test:workers` runs the compiled Worker and D1 in workerd through Miniflare; build the Web app first. `npm run verify` includes that build and test sequence. These tests need no Cloudflare login.

## Deploy to your account

1. Run `npx wrangler login`, then `npx wrangler whoami`. Use your own Cloudflare account. Do not paste an API token into a conversation.
2. In that account, enable Workers Free and choose your `workers.dev` subdomain. Create D1 with `npx wrangler d1 create medkit --location apac`. The location hint is not a Singapore data-residency guarantee.
3. Copy `wrangler.jsonc` to the ignored `wrangler.production.jsonc`. Keep it valid JSON. Replace the zero `database_id` with the returned D1 ID. Set `MEDKIT_BASE_URL` to the exact `https://medkit.YOUR-SUBDOMAIN.workers.dev` origin. Change the Worker name if needed. Leave `MEDKIT_OAUTH_CLIENTS_JSON` as `[]` until you have a verified client callback. Ensure the two rate-limit namespace IDs do not overlap another application in your account.
4. Run `npm run verify` and `npm run worker:deploy -- --config wrangler.production.jsonc`. This applies versioned D1 migrations before deploying. It does not change your account plan. The checked-in local configuration cannot be used by this deployment command.
5. Run `npm run worker:account -- --remote --config wrangler.production.jsonc --output /absolute/private/medkit-owner.json` once. Store that credential file privately. If the command reports an uncertain failure, keep the file and check whether that subject exists before creating another account. D1 receives only the key hash.
6. Open the public URL and sign in through **Manage connections**. Keep local records separate for testing. Uploading actual records is an independent, explicit action in MedKit.

No paid plan, custom domain, CI deployment credential, public signup endpoint, or automatic upload is required. Deployment is manual. After later changes, run verification and the same deployment command. Do not delete or recreate the D1 database to fix an application deployment.

## Connect ChatGPT or another MCP client

The endpoint is `https://YOUR-WORKER.workers.dev/mcp`. Follow the [integration guide](INTEGRATIONS.md#authorize-an-ai-client) for permissions and client limitations. The server supports pre-registered public clients with PKCE S256. It does not implement dynamic registration or client-secret authentication.

Obtain the exact callback from the intended client's connection setup. Set `MEDKIT_OAUTH_CLIENTS_JSON` in the private production config to a JSON-encoded array of `{ "client_id", "client_name", "redirect_uris" }`, then redeploy. Do not assume a universal ChatGPT callback. Registering a client alone does not grant access to any account; the owner must approve OAuth consent.

Before real records, verify with synthetic data: authorize read and write scopes, ask for a medicine or dose entry, open the returned review link, confirm the fields in MedKit, read back the saved record, and revoke the connection. Suggestions never count as consumption. An MCP token cannot approve its own change. ChatGPT account eligibility, Android behavior, and live client compatibility require separate testing.

## Cost and operating limits

Official [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) were checked on 2026-11-14. Workers Free allows 100,000 requests per day and 10 ms CPU per request. D1 Free includes 5 million rows read and 100,000 rows written per day, with 5 GB total storage; the [per-database Free limit](https://developers.cloudflare.com/d1/platform/limits/) is 500 MB. Indexes, audit writes, and transaction guards consume database operations too. This adapter runs the Worker for static assets as well, so their requests count toward its request quota.

Free limits are not a promise of capacity for a particular number of users. Exhausted quotas can make requests fail. This repository does not enable paid overages. A later paid upgrade currently starts at US$5/month plus usage above included allowances. Monitor actual requests, CPU, D1 row operations, and storage before deciding. Local workerd tests do not establish production CPU consumption or Free-tier suitability under load.

Connected records currently use one JSON aggregate per account. Writes above 1,000,000 UTF-8 bytes per stored value fail before commit, leaving room under D1's row limit. This is an explicit initial storage limit, not unlimited health-history storage. Export remains available. Larger histories need a tested storage migration. Personal local-mode storage is separate from this server limit.

## Operations and recovery

The Worker disables application observability logs and preview URLs. Do not enable request-body, Authorization, cookie, OAuth-code, or consent-URL logging. Cloudflare still operates the infrastructure; this is not end-to-end encryption. Rate limiting is per Cloudflare location and eventually consistent, not an exact global quota or a substitute for authentication.

D1 batches validate observed row and namespace revisions before committing records, stock changes, authorization state, and audit metadata together. Conflicts retry the transaction using the original expected record version. A stale intention still fails with HTTP 409. Hourly bounded cleanup removes expired OAuth requests, codes, access/refresh tokens, and owner sessions. Used refresh tokens remain until their expiry to detect replay.

D1's [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) and private exports are recovery options, not proof of a tested backup process. Review the retention available on your plan and test restoration with synthetic data first. Restoring an old database can restore old sessions and grants; isolate access and revoke them before reopening a restored deployment. Application deletion does not erase provider backups or recall external-client responses. Native device synchronization and account recovery remain unimplemented.
