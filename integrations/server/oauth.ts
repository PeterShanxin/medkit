import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Response } from 'express';
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import {
  InvalidGrantError,
  InvalidScopeError,
  InvalidTokenError,
  InvalidRequestError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import {
  connectionScopeSchema,
  type ConnectionScope,
} from '../../src/application/connected/contracts';
import { Database, hash, secret, RequestError } from './database';

export const configuredClientSchema = z
  .object({
    client_id: z.string().min(1).max(200),
    client_name: z.string().min(1).max(100),
    redirect_uris: z.array(z.string().url()).min(1).max(5),
  })
  .strict();
const pendingSchema = z.object({
  clientId: z.string(),
  redirectUri: z.string(),
  state: z.string().optional(),
  codeChallenge: z.string(),
  scopes: z.array(connectionScopeSchema),
  expiresAt: z.number(),
});
const codeSchema = pendingSchema.extend({ subject: z.string() });
const grantSchema = z.object({
  id: z.string().uuid(),
  subject: z.string().uuid(),
  clientId: z.string(),
  clientName: z.string(),
  scopes: z.array(connectionScopeSchema),
  expiresAt: z.number(),
  revoked: z.boolean(),
});
const tokenSchema = z.object({
  grantId: z.string(),
  clientId: z.string(),
  resource: z.string(),
  expiresAt: z.number(),
  used: z.boolean(),
  scopes: z.array(connectionScopeSchema),
});
export type RemoteGrant = z.infer<typeof grantSchema>;
export class OAuth implements OAuthServerProvider {
  readonly clientsStore;
  readonly resource: URL;
  constructor(
    private db: Database,
    readonly base: URL,
    clients: z.infer<typeof configuredClientSchema>[],
    private now = Date.now,
  ) {
    this.resource = new URL('/mcp', base);
    const configured = new Map<string, OAuthClientInformationFull>();
    for (const raw of clients) {
      const client = configuredClientSchema.parse(raw);
      for (const redirect of client.redirect_uris) {
        const u = new URL(redirect);
        if (
          u.hash ||
          u.username ||
          u.password ||
          (u.protocol !== 'https:' &&
            !(
              base.protocol === 'http:' &&
              u.protocol === 'http:' &&
              ['localhost', '127.0.0.1'].includes(u.hostname)
            ))
        )
          throw new Error(
            'OAuth redirects must be exact HTTPS URLs (loopback allowed only in local development).',
          );
      }
      if (configured.has(client.client_id))
        throw new Error('Duplicate OAuth client ID.');
      configured.set(client.client_id, {
        ...client,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      });
    }
    this.clientsStore = { getClient: (id: string) => configured.get(id) };
  }
  private checkResource(resource?: URL) {
    if (resource?.href !== this.resource.href)
      throw new InvalidRequestError(
        'The resource must match this MedKit MCP endpoint.',
      );
  }
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ) {
    this.checkResource(params.resource);
    const requested = params.scopes?.length
      ? params.scopes
      : ['cabinet:read', 'medication:read', 'history:read', 'safety:read'];
    const parsed = z.array(connectionScopeSchema).safeParse(requested);
    if (!parsed.success)
      throw new InvalidScopeError('Unsupported MedKit permission.');
    if (!client.redirect_uris.includes(params.redirectUri))
      throw new InvalidRequestError('Unregistered callback.');
    this.db.removeWhere(
      'oauth-pending',
      (value) => pendingSchema.parse(value).expiresAt <= this.now(),
    );
    this.db.removeWhere(
      'oauth-codes',
      (value) => codeSchema.parse(value).expiresAt <= this.now(),
    );
    const request = secret();
    this.db.put(
      'oauth-pending',
      hash(request),
      pendingSchema.parse({
        clientId: client.client_id,
        ...params,
        scopes: [...new Set(parsed.data)],
        expiresAt: this.now() + 5 * 60_000,
      }),
    );
    res.redirect(`/connect/consent?request=${encodeURIComponent(request)}`);
  }
  pending(request: string) {
    const pending = this.db.get('oauth-pending', hash(request), pendingSchema);
    if (!pending || pending.expiresAt <= this.now())
      throw new RequestError(
        400,
        'This connection request expired. Start again from your AI client.',
      );
    return {
      ...pending,
      clientName:
        this.clientsStore.getClient(pending.clientId)?.client_name ??
        pending.clientId,
    };
  }
  consent(request: string, subject: string, allowWrite: boolean, deny = false) {
    return this.db.atomic(() => {
      const pending = this.pending(request);
      const callback = new URL(pending.redirectUri);
      if (pending.state) callback.searchParams.set('state', pending.state);
      if (deny) callback.searchParams.set('error', 'access_denied');
      else {
        const code = secret();
        const scopes = pending.scopes.filter(
          (s) => s !== 'records:write' || allowWrite,
        );
        if (!scopes.length)
          throw new RequestError(
            400,
            'Select an available permission or deny access.',
          );
        this.db.put(
          'oauth-codes',
          hash(code),
          codeSchema.parse({
            ...pending,
            subject,
            scopes,
            expiresAt: this.now() + 60_000,
          }),
        );
        callback.searchParams.set('code', code);
      }
      this.db.delete('oauth-pending', hash(request));
      return callback.href;
    });
  }
  private code(client: OAuthClientInformationFull, code: string) {
    const value = this.db.get('oauth-codes', hash(code), codeSchema);
    if (
      !value ||
      value.clientId !== client.client_id ||
      value.expiresAt <= this.now()
    )
      throw new InvalidGrantError('Invalid or expired authorization code.');
    return value;
  }
  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
  ) {
    return this.code(client, code).codeChallenge;
  }
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    verifier?: string,
    redirect?: string,
    resource?: URL,
  ) {
    this.checkResource(resource);
    return this.db.atomic(() => {
      const value = this.code(client, code);
      // The SDK validates PKCE before calling this method and omits the verifier after success.
      if (
        (verifier !== undefined &&
          createHash('sha256').update(verifier).digest('base64url') !==
            value.codeChallenge) ||
        redirect !== value.redirectUri
      )
        throw new InvalidGrantError('The verifier or callback does not match.');
      const grant: RemoteGrant = {
        id: randomUUID(),
        subject: value.subject,
        clientId: client.client_id,
        clientName: client.client_name ?? client.client_id,
        scopes: value.scopes,
        expiresAt: this.now() + 30 * 24 * 60 * 60_000,
        revoked: false,
      };
      this.db.put('oauth-grants', grant.id, grant);
      this.db.delete('oauth-codes', hash(code));
      this.db.audit(grant.subject, 'connection.authorize', grant.id, 'allowed');
      return this.tokens(grant, grant.scopes);
    });
  }
  grant(id: string): RemoteGrant {
    const value = this.db.get('oauth-grants', id, grantSchema);
    if (
      !value ||
      value.revoked ||
      value.expiresAt <= this.now() ||
      !this.clientsStore.getClient(value.clientId)
    )
      throw new InvalidTokenError('Connection expired or revoked.');
    return value;
  }
  private tokens(grant: RemoteGrant, scopes: ConnectionScope[]) {
    this.db.removeWhere(
      'oauth-access',
      (value) => tokenSchema.parse(value).expiresAt <= this.now(),
    );
    this.db.removeWhere(
      'oauth-refresh',
      (value) => tokenSchema.parse(value).expiresAt <= this.now(),
    );
    const access = secret(),
      refresh = secret();
    const common = {
      grantId: grant.id,
      clientId: grant.clientId,
      resource: this.resource.href,
      scopes,
      used: false,
    };
    this.db.put('oauth-access', hash(access), {
      ...common,
      expiresAt: Math.min(grant.expiresAt, this.now() + 15 * 60_000),
    });
    this.db.put('oauth-refresh', hash(refresh), {
      ...common,
      expiresAt: grant.expiresAt,
    });
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: 'Bearer',
      expires_in: Math.floor(
        (Math.min(grant.expiresAt, this.now() + 15 * 60_000) - this.now()) /
          1000,
      ),
      scope: scopes.join(' '),
    };
  }
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    token: string,
    scopes?: string[],
    resource?: URL,
  ) {
    this.checkResource(resource);
    // Persist replay revocation even when the exchange returns an error.
    const previous = this.db.get('oauth-refresh', hash(token), tokenSchema);
    if (
      !previous ||
      previous.clientId !== client.client_id ||
      previous.expiresAt <= this.now()
    )
      throw new InvalidGrantError('Invalid refresh token.');
    if (previous.used) {
      this.revoke(previous.grantId);
      throw new InvalidGrantError('Refresh token was already used. Reconnect.');
    }
    return this.db.atomic(() => {
      const grant = this.grant(previous.grantId);
      const requested = scopes?.length ? scopes : previous.scopes;
      if (
        requested.some((s) => !previous.scopes.includes(s as ConnectionScope))
      )
        throw new InvalidScopeError('Refresh cannot add permissions.');
      this.db.put('oauth-refresh', hash(token), { ...previous, used: true });
      return this.tokens(grant, requested as ConnectionScope[]);
    });
  }
  access(token: string, required: ConnectionScope[] = []) {
    const value = this.db.get('oauth-access', hash(token), tokenSchema);
    if (
      !value ||
      value.expiresAt <= this.now() ||
      value.resource !== this.resource.href
    )
      throw new InvalidTokenError('Invalid access token.');
    const grant = this.grant(value.grantId);
    if (required.some((s) => !value.scopes.includes(s)))
      throw new InvalidScopeError(
        'This connection does not have the required permission.',
      );
    return { ...grant, scopes: value.scopes, tokenExpiresAt: value.expiresAt };
  }
  async verifyAccessToken(token: string) {
    const grant = this.access(token);
    return {
      token,
      clientId: grant.clientId,
      scopes: grant.scopes,
      expiresAt: Math.floor(grant.tokenExpiresAt / 1000),
      resource: this.resource,
      extra: { subject: grant.subject, grantId: grant.id },
    };
  }
  revoke(id: string, subject?: string) {
    const grant = this.db.get('oauth-grants', id, grantSchema);
    if (!grant || (subject && grant.subject !== subject))
      throw new RequestError(404, 'This connection is unavailable.');
    this.db.put('oauth-grants', id, { ...grant, revoked: true });
  }
  revokeAll(subject: string) {
    for (const g of this.db.list('oauth-grants', grantSchema))
      if (g.subject === subject) this.revoke(g.id, subject);
  }
  list(subject: string) {
    return this.db
      .list('oauth-grants', grantSchema)
      .filter(
        (g) => g.subject === subject && !g.revoked && g.expiresAt > this.now(),
      )
      .map((g) => ({
        id: g.id,
        clientName: g.clientName,
        scopes: g.scopes,
        expiresAt: new Date(g.expiresAt).toISOString(),
      }));
  }
  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ) {
    const token =
      this.db.get('oauth-access', hash(request.token), tokenSchema) ??
      this.db.get('oauth-refresh', hash(request.token), tokenSchema);
    if (token?.clientId === client.client_id) this.revoke(token.grantId);
  }
}
