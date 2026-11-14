import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { applyRecordMutation } from '../../src/application/service';
import {
  changeCommands,
  describeChange,
} from '../../src/application/connected/changes';
import {
  proposalInputSchema,
  reviewSchema,
  type ProposalInput,
  type Review,
} from '../../src/application/connected/contracts';
import { commandSchema, type Mutation } from '../../src/domain/commands';
import {
  emptyState,
  exportSchema,
  idSchema,
  type State,
} from '../../src/domain/model';
import { validateState } from '../../src/domain/invariants';
import { Database, hash, RequestError } from './database';

export const mutationSchema = z
  .object({
    operationId: idSchema,
    commands: z.array(commandSchema).min(1).max(20),
    version: z.number().int().nonnegative(),
  })
  .strict();
const savedProposal = reviewSchema.extend({
  grantId: idSchema,
  operationId: idSchema,
  version: z.number().int(),
  commands: z.array(commandSchema),
  requestHash: z.string(),
  requestKey: z.string(),
});
const operationSchema = z.object({ hash: z.string() });
export class Records {
  constructor(
    private db: Database,
    private clock = () => new Date().toISOString(),
  ) {}
  private async assertVersion(subject: string, version: number) {
    const current = await this.db.records(subject);
    if (current.version !== version)
      throw new RequestError(
        409,
        'Records changed. Refresh and review the change again.',
      );
    return current;
  }
  async execute(subject: string, raw: unknown) {
    const input = mutationSchema.parse(raw);
    return await this.db.atomic(async () => {
      const payloadHash = hash(JSON.stringify(input.commands));
      const prior = await this.db.get(
        `operations:${subject}`,
        input.operationId,
        operationSchema,
      );
      if (prior) {
        if (prior.hash !== payloadHash)
          throw new RequestError(
            409,
            'This request ID was already used for a different change.',
          );
        return await this.db.records(subject);
      }
      const current = await this.assertVersion(subject, input.version);
      const state = applyRecordMutation(current.state, input, this.clock());
      await this.db.save(subject, state, current.version + 1);
      await this.db.put(`operations:${subject}`, input.operationId, {
        hash: payloadHash,
      });
      await this.db.audit(subject, 'records.change', 'owner', 'applied');
      return await this.db.records(subject);
    });
  }
  async import(subject: string, snapshot: unknown) {
    const incoming = validateState(exportSchema.parse(snapshot).state);
    if (incoming.dataset !== 'personal')
      throw new RequestError(
        400,
        'Sample data cannot be uploaded to personal records.',
      );
    return await this.db.atomic(async () => {
      const current = await this.db.records(subject);
      if (current.version !== 0)
        throw new RequestError(
          409,
          'This space already has records. Import cannot overwrite it.',
        );
      // A one-time transfer assigns the provisioned identity; no remote client supplies another user's subject.
      const state: State = {
        ...incoming,
        profile: { ...incoming.profile, id: subject },
      };
      await this.db.save(subject, state, 1);
      await this.db.audit(subject, 'records.import', 'owner', 'applied');
      return await this.db.records(subject);
    });
  }
  async erase(subject: string, version: number) {
    return await this.db.atomic(async () => {
      const current = await this.assertVersion(subject, version);
      await this.db.save(subject, emptyState(subject), current.version + 1);
      for (const namespace of ['proposals', 'operations', 'audit'])
        await this.db.delete(`${namespace}:${subject}`);
      // The caller revokes all external grants in this same transaction.
      return await this.db.records(subject);
    });
  }
  async propose(
    subject: string,
    grantId: string,
    clientName: string,
    raw: ProposalInput,
  ): Promise<Review> {
    const input = proposalInputSchema.parse(raw);
    return await this.db.atomic(async () => {
      const namespace = `proposals:${subject}`;
      const requestKey = `${grantId}:${input.requestId}`;
      const requestHash = hash(JSON.stringify(input));
      const previous = (await this.db.list(namespace, savedProposal)).find(
        (p) => p.requestKey === requestKey,
      );
      if (previous) {
        if (previous.requestHash !== requestHash)
          throw new RequestError(
            409,
            'Use a new request ID for a different change.',
          );
        return await this.visible(subject, previous);
      }
      if (
        (await this.list(subject)).filter((p) => p.status === 'pending')
          .length >= 20
      )
        throw new RequestError(
          429,
          'Review existing requests before adding more.',
        );
      const current = await this.db.records(subject);
      const commands = changeCommands(input.change, randomUUID);
      const mutation: Mutation = { operationId: randomUUID(), commands };
      // Preview uses exactly the same validated application transition as owner writes.
      applyRecordMutation(current.state, mutation, this.clock());
      const proposal = savedProposal.parse({
        id: randomUUID(),
        ...describeChange(input.change, current.state),
        userStatement: input.userStatement,
        status: 'pending',
        createdAt: this.clock(),
        expiresAt: new Date(
          Date.parse(this.clock()) + 10 * 60_000,
        ).toISOString(),
        clientName,
        grantId,
        ...mutation,
        version: current.version,
        requestHash,
        requestKey,
      });
      await this.db.put(namespace, proposal.id, proposal);
      await this.db.audit(subject, 'change.prepare', grantId, 'pending');
      return reviewSchema.parse(proposal);
    });
  }
  private async visible(
    subject: string,
    p: z.infer<typeof savedProposal>,
  ): Promise<Review> {
    const status =
      p.status !== 'pending'
        ? p.status
        : Date.parse(p.expiresAt) <= Date.parse(this.clock())
          ? 'expired'
          : (await this.db.records(subject)).version !== p.version
            ? 'stale'
            : 'pending';
    return reviewSchema.parse({ ...p, status });
  }
  async list(subject: string): Promise<Review[]> {
    const reviews: Review[] = [];
    for (const p of await this.db.list(`proposals:${subject}`, savedProposal))
      reviews.push(await this.visible(subject, p));
    return reviews.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async cancelGrant(subject: string, grantId: string) {
    for (const proposal of await this.db.list(
      `proposals:${subject}`,
      savedProposal,
    )) {
      if (proposal.grantId === grantId && proposal.status === 'pending') {
        await this.db.put(`proposals:${subject}`, proposal.id, {
          ...proposal,
          status: 'rejected',
        });
      }
    }
  }
  async get(subject: string, grantId: string, id: string): Promise<Review> {
    const p = await this.db.get(`proposals:${subject}`, id, savedProposal);
    if (!p || p.grantId !== grantId)
      throw new RequestError(404, 'This request is unavailable.');
    return await this.visible(subject, p);
  }
  async decide(
    subject: string,
    id: string,
    approve: boolean,
    authorizeGrant: (grantId: string) => void | Promise<void>,
  ): Promise<Review> {
    return await this.db.atomic(async () => {
      const namespace = `proposals:${subject}`;
      const p = await this.db.get(namespace, id, savedProposal);
      if (!p) throw new RequestError(404, 'This request is unavailable.');
      if (
        (p.status === 'applied' && approve) ||
        (p.status === 'rejected' && !approve)
      )
        return reviewSchema.parse(p);
      if (p.status !== 'pending')
        throw new RequestError(409, 'This request has already been reviewed.');
      if (approve) {
        await authorizeGrant(p.grantId);
        if ((await this.visible(subject, p)).status !== 'pending')
          throw new RequestError(
            409,
            'This request expired or records changed. Ask for a new request.',
          );
        const current = await this.assertVersion(subject, p.version);
        const state = applyRecordMutation(current.state, p, this.clock());
        await this.db.save(subject, state, current.version + 1);
      }
      p.status = approve ? 'applied' : 'rejected';
      await this.db.put(namespace, id, p);
      await this.db.audit(subject, 'change.review', p.grantId, p.status);
      return reviewSchema.parse(p);
    });
  }
}
