import express, {
  type Request,
  type RequestHandler,
  type ErrorRequestHandler,
} from 'express';
import path from 'node:path';
import { z } from 'zod';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { connectionScopes } from '../../src/application/connected/contracts';
import { idSchema } from '../../src/domain/model';
import { DomainError } from '../../src/domain/commands';
import { createMcpServer } from '../mcp/server';
import { Database, RequestError } from './database';
import { Identity } from './identity';
import { OAuth, configuredClientSchema, type RemoteGrant } from './oauth';
import { Records } from './records';
import { consentPage } from './consent';

export interface ServerOptions {
  db: Database;
  baseUrl: string;
  clients: z.infer<typeof configuredClientSchema>[];
  webRoot?: string;
  externalRateLimit?: boolean;
  originValidated?: boolean;
}
const cookieName = 'medkit_session';
function sessionToken(req: Request) {
  return (
    req.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) ?? ''
  );
}
function rateLimit(limit: number): RequestHandler {
  const entries = new Map<string, { count: number; until: number }>();
  return (req, res, next) => {
    const now = Date.now(),
      ip = req.ip ?? 'unknown';
    for (const [key, value] of entries)
      if (value.until <= now) entries.delete(key);
    const entry = entries.get(ip) ?? { count: 0, until: now + 60_000 };
    if (entries.size >= 10_000 || ++entry.count > limit) {
      res
        .status(429)
        .json({ error: 'Too many requests. Try again in a minute.' });
      return;
    }
    entries.set(ip, entry);
    next();
  };
}
export function createServerApp(options: ServerOptions) {
  const base = new URL(options.baseUrl);
  if (
    base.pathname !== '/' ||
    base.search ||
    base.hash ||
    base.username ||
    base.password ||
    (base.protocol !== 'https:' &&
      !(
        base.protocol === 'http:' &&
        ['127.0.0.1', 'localhost'].includes(base.hostname)
      ))
  )
    throw new Error(
      'Use an HTTPS origin, or HTTP loopback for local development.',
    );
  const { db } = options;
  const identity = new Identity(db),
    oauth = new OAuth(db, base, options.clients),
    records = new Records(db);
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    if (base.protocol === 'https:')
      res.set('Strict-Transport-Security', 'max-age=31536000');
    if (
      (!options.originValidated && req.headers.host !== base.host) ||
      (req.headers.origin && req.headers.origin !== base.origin)
    ) {
      res.status(403).json({ error: 'This request origin is not allowed.' });
      return;
    }
    next();
  });
  if (!options.externalRateLimit) app.use(rateLimit(300));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false, limit: '8kb' }));
  const sameOrigin: RequestHandler = (req, res, next) => {
    if (req.headers.origin !== base.origin) {
      res.status(403).json({ error: 'Open MedKit to confirm this action.' });
      return;
    }
    next();
  };
  const owner = async (req: Request) =>
    await identity.session(sessionToken(req));
  app.get('/api/capabilities', (_req, res) => res.json({ connected: true }));
  app.post(
    '/api/login',
    sameOrigin,
    options.externalRateLimit ? (_req, _res, next) => next() : rateLimit(10),
    async (req, res) => {
      const { key } = z
        .object({ key: z.string().min(30).max(100) })
        .strict()
        .parse(req.body);
      const session = await identity.login(key);
      res.cookie(cookieName, session.token, {
        httpOnly: true,
        secure: base.protocol === 'https:',
        sameSite: 'lax',
        path: '/',
        maxAge: 8 * 60 * 60_000,
      });
      res.json({ subject: session.subject });
    },
  );
  app.post('/api/logout', sameOrigin, async (req, res) => {
    await identity.logout(sessionToken(req));
    res.clearCookie(cookieName, { path: '/' });
    res.json({ ok: true });
  });
  const ownerJson =
    (
      action: (subject: string, req: Request) => unknown | Promise<unknown>,
    ): RequestHandler =>
    async (req, res) => {
      const result = await db.atomic(async () => action(await owner(req), req));
      res.json(result);
    };
  app.get(
    '/api/session',
    ownerJson((subject) => ({ subject })),
  );
  app.get(
    '/api/records',
    ownerJson((subject) => db.records(subject)),
  );
  app.post(
    '/api/records',
    sameOrigin,
    ownerJson((subject, req) => records.execute(subject, req.body)),
  );
  app.post(
    '/api/import',
    sameOrigin,
    ownerJson((subject, req) => records.import(subject, req.body)),
  );
  app.post(
    '/api/erase',
    sameOrigin,
    ownerJson(async (subject, req) => {
      const { version } = z
        .object({ version: z.number().int().nonnegative() })
        .strict()
        .parse(req.body);
      const result = await records.erase(subject, version);
      await oauth.revokeAll(subject);
      return result;
    }),
  );
  app.get(
    '/api/connections',
    ownerJson((subject) => oauth.list(subject)),
  );
  app.post(
    '/api/connections/:id/revoke',
    sameOrigin,
    ownerJson(async (subject, req) => {
      const id = idSchema.parse(req.params.id);
      await oauth.revoke(id, subject);
      await records.cancelGrant(subject, id);
      await db.audit(subject, 'connection.revoke', 'owner', 'revoked');
      return { ok: true };
    }),
  );
  app.get(
    '/api/reviews',
    ownerJson((subject) => records.list(subject)),
  );
  app.post(
    '/api/reviews/:id',
    sameOrigin,
    ownerJson(async (subject, req) => {
      const { approve } = z
        .object({ approve: z.boolean() })
        .strict()
        .parse(req.body);
      return records.decide(
        subject,
        idSchema.parse(req.params.id),
        approve,
        async (id) => {
          let grant;
          try {
            grant = await oauth.grant(id);
          } catch {
            throw new RequestError(403, 'Write access expired or was revoked.');
          }
          if (
            grant.subject !== subject ||
            !grant.scopes.includes('records:write')
          )
            throw new RequestError(403, 'Write access was revoked.');
        },
      );
    }),
  );
  app.get('/connect/consent', async (req, res) => {
    let signedIn = false;
    try {
      await owner(req);
      signedIn = true;
    } catch {
      /* The consent form requests an owner key. */
    }
    // Keep same-origin form POSTs identifiable; suppress referrers on the external OAuth redirect.
    res.set('Referrer-Policy', 'same-origin');
    const callbackOrigin = new URL(
      (await oauth.pending(z.string().max(100).parse(req.query.request)))
        .redirectUri,
    ).origin;
    res.set(
      'Content-Security-Policy',
      String(res.getHeader('Content-Security-Policy')).replace(
        "form-action 'self'",
        `form-action 'self' ${callbackOrigin}`,
      ),
    );
    res
      .type('html')
      .send(
        await consentPage(
          oauth,
          z.string().max(100).parse(req.query.request),
          signedIn,
        ),
      );
  });
  app.post(
    '/connect/approve',
    sameOrigin,
    options.externalRateLimit ? (_req, _res, next) => next() : rateLimit(10),
    async (req, res) => {
      const input = z
        .object({
          request: z.string().max(100),
          key: z.string().max(100).optional(),
          allowWrite: z.literal('yes').optional(),
          decision: z.enum(['allow', 'deny']),
        })
        .strict()
        .parse(req.body);
      const redirect = await db.atomic(async () => {
        let subject = '';
        if (input.decision === 'allow') {
          try {
            subject = await owner(req);
          } catch {
            subject = await identity.owner(input.key ?? '');
          }
        }
        return oauth.consent(
          input.request,
          subject,
          input.allowWrite === 'yes',
          input.decision === 'deny',
        );
      });
      res.redirect(303, redirect);
    },
  );
  app.use(
    mcpAuthRouter({
      provider: oauth,
      ...(options.externalRateLimit
        ? {
            authorizationOptions: { rateLimit: false as const },
            tokenOptions: { rateLimit: false as const },
            revocationOptions: { rateLimit: false as const },
          }
        : {}),
      issuerUrl: base,
      resourceServerUrl: oauth.resource,
      scopesSupported: [...connectionScopes],
      resourceName: 'MedKit personal records',
    }),
  );
  app.post(
    '/mcp',
    async (req, _res, next) => {
      try {
        await oauth.verifyAccessToken(
          req.headers.authorization?.replace(/^Bearer /i, '') ?? '',
        );
      } catch {
        await db.audit('unauthenticated', 'mcp.access', 'unknown', 'denied');
      }
      next();
    },
    requireBearerAuth({
      verifier: oauth,
      expectedResource: oauth.resource,
      resourceMetadataUrl: new URL(
        '/.well-known/oauth-protected-resource/mcp',
        base,
      ).href,
    }),
    async (req, res) => {
      const token = req.auth!.token;
      const authorized = async <T>(
        scopes: (typeof connectionScopes)[number][],
        tool: string,
        action: (grant: RemoteGrant) => Promise<T>,
      ): Promise<T> => {
        try {
          return await db.atomic(async () => {
            const grant = await oauth.access(token, scopes);
            await db.audit(grant.subject, tool, grant.id, 'allowed');
            return action(grant);
          });
        } catch (error) {
          await db.audit('unauthenticated', tool, 'unknown', 'denied');
          throw error;
        }
      };
      const writer = {
        reviewUrl: new URL('/connections', base).href,
        prepare: (input: Parameters<Records['propose']>[3]) =>
          authorized([...connectionScopes], 'change.prepare', (grant) =>
            records.propose(grant.subject, grant.id, grant.clientName, input),
          ),
        status: (id: string) =>
          authorized([...connectionScopes], 'change.status', (grant) =>
            records.get(grant.subject, grant.id, id),
          ),
      };
      const server = createMcpServer(
        (scopes, tool) =>
          authorized(scopes, tool, async (grant) => ({
            state: (await db.records(grant.subject)).state,
            snapshotAt: new Date().toISOString(),
          })),
        { writer, live: true },
      );
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    },
  );
  app.all('/mcp', (_req, res) => res.status(405).end());
  app.use('/api', (_req, res) =>
    res.status(404).json({ error: 'Unknown API route.' }),
  );
  if (options.webRoot) {
    const root = path.resolve(options.webRoot);
    app.use(express.static(root, { index: false, dotfiles: 'deny' }));
    app.get(
      [
        '/',
        '/cabinet',
        '/plans',
        '/history',
        '/advisor',
        '/settings',
        '/connections',
        '/medicine/:id',
      ],
      (_req, res) => res.sendFile(path.join(root, 'index.html')),
    );
  }
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.headersSent) return;
    const status =
      error instanceof RequestError
        ? error.status
        : error instanceof z.ZodError || error instanceof DomainError
          ? 400
          : 500;
    res.status(status).json({
      error:
        error instanceof RequestError || error instanceof DomainError
          ? error.message
          : status === 400
            ? 'Check the supplied fields and try again.'
            : 'The request could not be completed. No success has been confirmed.',
    });
  };
  app.use(errors);
  return { app, identity, oauth, records };
}
