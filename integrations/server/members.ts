import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { idSchema } from '../../src/domain/model';
import {
  githubIdSchema,
  githubUsernameSchema,
  memberProfileSchema,
  memberSummarySchema,
} from '../../src/application/connected/members';
import { Database, RequestError } from './database';
import type { GitHubConfig } from './github-login';
import { Identity } from './identity';
import { OAuth } from './oauth';
import { Records } from './records';

const memberSchema = memberSummarySchema.extend({
  subject: idSchema.optional(),
});
export class Members {
  constructor(
    private db: Database,
    private config: GitHubConfig,
  ) {}
  isAdmin(subject: string) {
    return this.config.accounts.some(
      (a) => a.subject === subject && a.admin === true,
    );
  }
  requireAdmin(subject: string) {
    if (!this.isAdmin(subject))
      throw new RequestError(403, 'Only the host can manage invitations.');
  }
  async list(admin: string) {
    this.requireAdmin(admin);
    return (await this.db.list('github-members', memberSchema)).map((value) =>
      memberSummarySchema.parse(value),
    );
  }
  async invite(admin: string, profile: z.infer<typeof memberProfileSchema>) {
    this.requireAdmin(admin);
    return this.db.atomic(async () => {
      if (this.config.accounts.some((a) => a.githubId === profile.githubId))
        throw new RequestError(
          409,
          'This account is already configured by the host.',
        );
      const existing = await this.db.get(
        'github-members',
        profile.githubId,
        memberSchema,
      );
      if (
        !existing &&
        (await this.db.list('github-members', memberSchema)).length >= 100
      )
        throw new RequestError(
          409,
          'This deployment has reached its invitation limit.',
        );
      const member = {
        ...profile,
        ...(existing?.subject ? { subject: existing.subject } : {}),
        status: existing?.subject ? ('active' as const) : ('invited' as const),
      };
      await this.db.put('github-members', profile.githubId, member);
      await this.db.audit(admin, 'member.invite', 'owner', 'allowed');
      return memberSummarySchema.parse(member);
    });
  }
  async login(githubId: string, identity: Identity) {
    return this.db.atomic(async () => {
      const configured = this.config.accounts.find(
        (a) => a.githubId === githubId,
      );
      if (configured) return identity.loginSubject(configured.subject);
      const member = await this.db.get(
        'github-members',
        githubId,
        memberSchema,
      );
      if (!member || member.status === 'revoked')
        throw new RequestError(
          403,
          'This GitHub account needs an invitation from the MedKit host.',
        );
      const subject = member.subject ?? randomUUID();
      if (!member.subject) await this.db.initialize(subject);
      await this.db.put('github-members', githubId, {
        ...member,
        subject,
        status: 'active',
      });
      return identity.loginSubject(subject);
    });
  }
  async revoke(
    admin: string,
    githubId: string,
    oauth: OAuth,
    records: Records,
  ) {
    this.requireAdmin(admin);
    githubIdSchema.parse(githubId);
    await this.db.atomic(async () => {
      const member = await this.db.get(
        'github-members',
        githubId,
        memberSchema,
      );
      if (!member)
        throw new RequestError(404, 'This invitation is unavailable.');
      await this.db.put('github-members', githubId, {
        ...member,
        status: 'revoked',
      });
      if (member.subject) {
        const subject = member.subject;
        await this.db.removeWhere(
          'sessions',
          (value) =>
            z.object({ subject: idSchema }).parse(value).subject === subject,
        );
        await oauth.revokeAll(subject);
        await records.cancelGrant(subject);
      }
      await this.db.audit(admin, 'member.revoke', 'owner', 'revoked');
    });
  }
}

export async function lookupGitHubUser(
  username: string,
  fetcher: typeof fetch = (...args) => fetch(...args),
) {
  githubUsernameSchema.parse(username);
  const response = await fetcher(
    `https://api.github.com/users/${encodeURIComponent(username)}`,
    {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'MedKit',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );
  if (response.status === 404)
    throw new RequestError(404, 'No GitHub user was found with that username.');
  if (!response.ok)
    throw new RequestError(
      502,
      'GitHub could not be checked. Try again later.',
    );
  const user = z
    .object({
      id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      login: githubUsernameSchema,
      type: z.literal('User'),
    })
    .parse(await response.json());
  return memberProfileSchema.parse({
    githubId: String(user.id),
    login: user.login,
  });
}
