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
import { OAuth, configuredClientSchema } from './oauth';
import { Records } from './records';
import { consentPage } from './consent';

export interface ServerOptions {
  db: Database;
  baseUrl: string;
  clients: z.infer<typeof configuredClientSchema>[];
  webRoot?: string;
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
      req.headers.host !== base.host ||
      (req.headers.origin && req.headers.origin !== base.origin)
    ) {
      res.status(403).json({ error: 'This request origin is not allowed.' });
      return;
    }
    next();
  });
  app.use(rateLimit(300));
  app.use((req, res, next) => {
    if (req.path === '/mcp')
      res.on('finish', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          try {
            db.audit('unauthenticated', 'mcp.access', 'unknown', 'denied');
          } catch {
            /* No sensitive request details are logged. */
          }
        }
      });
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false, limit: '8kb' }));
  const sameOrigin: RequestHandler = (req, res, next) => {
    if (req.headers.origin !== base.origin) {
      res.status(403).json({ error: 'Open MedKit to confirm this action.' });
      return;
    }
    next();
  };
  const owner = (req: Request) => identity.session(sessionToken(req));
  app.get('/api/capabilities', (_req, res) => res.json({ connected: true }));
  app.post('/api/login', sameOrigin, rateLimit(10), (req, res) => {
    const { key } = z
      .object({ key: z.string().min(30).max(100) })
      .strict()
      .parse(req.body);
    const session = identity.login(key);
    res.cookie(cookieName, session.token, {
      httpOnly: true,
      secure: base.protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60_000,
    });
    res.json({ subject: session.subject });
  });
  app.post('/api/logout', sameOrigin, (req, res) => {
    identity.logout(sessionToken(req));
    res.clearCookie(cookieName, { path: '/' });
    res.json({ ok: true });
  });
  app.get('/api/session', (req, res) => res.json({ subject: owner(req) }));
  app.get('/api/records', (req, res) => res.json(db.records(owner(req))));
  app.post('/api/records', sameOrigin, (req, res) =>
    res.json(records.execute(owner(req), req.body)),
  );
  app.post('/api/import', sameOrigin, (req, res) =>
    res.json(records.import(owner(req), req.body)),
  );
  app.post('/api/erase', sameOrigin, (req, res) => {
    const subject = owner(req),
      { version } = z
        .object({ version: z.number().int().nonnegative() })
        .strict()
        .parse(req.body);
    const result = db.atomic(() => {
      const result = records.erase(subject, version);
      oauth.revokeAll(subject);
      return result;
    });
    res.json(result);
  });
  app.get('/api/connections', (req, res) => res.json(oauth.list(owner(req))));
  app.post('/api/connections/:id/revoke', sameOrigin, (req, res) => {
    const subject = owner(req);
    db.atomic(() => {
      const id = idSchema.parse(req.params.id);
      oauth.revoke(id, subject);
      records.cancelGrant(subject, id);
      db.audit(subject, 'connection.revoke', 'owner', 'revoked');
    });
    res.json({ ok: true });
  });
  app.get('/api/reviews', (req, res) => res.json(records.list(owner(req))));
  app.post('/api/reviews/:id', sameOrigin, (req, res) => {
    const subject = owner(req),
      { approve } = z.object({ approve: z.boolean() }).strict().parse(req.body);
    res.json(
      records.decide(subject, idSchema.parse(req.params.id), approve, (id) => {
        let grant;
        try {
          grant = oauth.grant(id);
        } catch {
          throw new RequestError(403, 'Write access expired or was revoked.');
        }
        if (
          grant.subject !== subject ||
          !grant.scopes.includes('records:write')
        )
          throw new RequestError(403, 'Write access was revoked.');
      }),
    );
  });
  app.get('/connect/consent', (req, res) => {
    let signedIn = false;
    try {
      owner(req);
      signedIn = true;
    } catch {
      /* The consent form requests an owner key. */
    }
    res
      .type('html')
      .send(
        consentPage(
          oauth,
          z.string().max(100).parse(req.query.request),
          signedIn,
        ),
      );
  });
  app.post('/connect/approve', sameOrigin, rateLimit(10), (req, res) => {
    const input = z
      .object({
        request: z.string().max(100),
        key: z.string().max(100).optional(),
        allowWrite: z.literal('yes').optional(),
        decision: z.enum(['allow', 'deny']),
      })
      .strict()
      .parse(req.body);
    let subject = '';
    if (input.decision === 'allow') {
      try {
        subject = owner(req);
      } catch {
        subject = identity.owner(input.key ?? '');
      }
    }
    res.redirect(
      303,
      oauth.consent(
        input.request,
        subject,
        input.allowWrite === 'yes',
        input.decision === 'deny',
      ),
    );
  });
  app.use(
    mcpAuthRouter({
      provider: oauth,
      issuerUrl: base,
      resourceServerUrl: oauth.resource,
      scopesSupported: [...connectionScopes],
      resourceName: 'MedKit personal records',
    }),
  );
  app.post(
    '/mcp',
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
      const authorize = (
        scopes: (typeof connectionScopes)[number][],
        tool: string,
      ) => {
        let grant;
        try {
          grant = oauth.access(token, scopes);
        } catch (error) {
          db.audit('unauthenticated', tool, 'unknown', 'denied');
          throw error;
        }
        db.audit(grant.subject, tool, grant.id, 'allowed');
        return grant;
      };
      const writer = {
        reviewUrl: new URL('/connections', base).href,
        prepare: async (input: Parameters<Records['propose']>[3]) => {
          const grant = authorize([...connectionScopes], 'change.prepare');
          return records.propose(
            grant.subject,
            grant.id,
            grant.clientName,
            input,
          );
        },
        status: async (id: string) => {
          const grant = authorize(['records:write'], 'change.status');
          return records.get(grant.subject, grant.id, id);
        },
      };
      const server = createMcpServer(
        async (scopes, tool) => {
          const grant = authorize(scopes, tool);
          return {
            state: db.records(grant.subject).state,
            snapshotAt: new Date().toISOString(),
          };
        },
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
