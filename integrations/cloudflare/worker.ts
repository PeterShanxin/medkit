import { env } from 'cloudflare:workers';
import { httpServerHandler } from 'cloudflare:node';
import { z } from 'zod';
import { createServerApp } from '../server/app';
import { configuredClientSchema } from '../server/oauth';
import { hash } from '../server/database';
import { openD1 } from './d1';

interface Bindings {
  DB: D1Database;
  ASSETS: Fetcher;
  REQUEST_LIMIT: RateLimit;
  LOGIN_LIMIT: RateLimit;
  MEDKIT_BASE_URL: string;
  MEDKIT_OAUTH_CLIENTS_JSON: string;
}
const bindings = env as unknown as Bindings;
const base = new URL(bindings.MEDKIT_BASE_URL);
const { app } = createServerApp({
  db: openD1(bindings.DB),
  baseUrl: base.href,
  clients: z
    .array(configuredClientSchema)
    .parse(JSON.parse(bindings.MEDKIT_OAUTH_CLIENTS_JSON)),
  // Cloudflare applies its edge limiter before dispatch; Node's in-memory limiter is not global.
  externalRateLimit: true,
  originValidated: true,
});
app.listen(3000);
const bridge = httpServerHandler({ port: 3000 });
const dynamic =
  /^(?:\/api(?:\/|$)|\/connect(?:\/|$)|\/mcp(?:\/|$)|\/(?:authorize|token|revoke)(?:\/|$)|\/\.well-known(?:\/|$))/;
const appRoute =
  /^(?:\/|\/(?:cabinet|plans|history|advisor|settings|connections)\/?|\/medicine\/[^/]+)$/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (
      url.origin !== base.origin ||
      (request.headers.has('Origin') &&
        request.headers.get('Origin') !== base.origin)
    )
      return Response.json(
        { error: 'This request origin is not allowed.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    if (!dynamic.test(url.pathname)) {
      const target = appRoute.test(url.pathname)
        ? new Request(new URL('/index.html', url), request)
        : request;
      const response = await env.ASSETS.fetch(target);
      const headers = new Headers(response.headers);
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Referrer-Policy', 'no-referrer');
      headers.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      );
      headers.set(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=()',
      );
      if (base.protocol === 'https:')
        headers.set('Strict-Transport-Security', 'max-age=31536000');
      return new Response(response.body, { status: response.status, headers });
    }
    // Cloudflare supplies this header. Do not trust X-Forwarded-For from callers.
    const key = hash(request.headers.get('CF-Connecting-IP') ?? 'local');
    const allowed = await env.REQUEST_LIMIT.limit({ key });
    const login = ['/api/login', '/connect/approve'].includes(url.pathname);
    if (
      !allowed.success ||
      (login && !(await env.LOGIN_LIMIT.limit({ key })).success)
    )
      return Response.json(
        { error: 'Too many requests. Try again in a minute.' },
        {
          status: 429,
          headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' },
        },
      );
    return bridge.fetch!(request, env, ctx);
  },
  async scheduled(_event, env) {
    // Bounded, indexed cleanup. Used refresh tokens remain until grant expiry to detect replay.
    await env.DB.prepare(
      `DELETE FROM entries WHERE rowid IN (
      SELECT rowid FROM entries WHERE namespace IN ('sessions','oauth-pending','oauth-codes','oauth-access','oauth-refresh')
      AND json_extract(value,'$.expiresAt') <= ? ORDER BY json_extract(value,'$.expiresAt') LIMIT 500
    )`,
    )
      .bind(Date.now())
      .run();
  },
} satisfies ExportedHandler<Bindings>;
