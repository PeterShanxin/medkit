import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { idSchema } from '../../src/domain/model';
import { Database, hash, RequestError, secret } from './database';

const ownerSchema = z.object({ subject: idSchema });
const sessionSchema = z.object({ subject: idSchema, expiresAt: z.number() });
export class Identity {
  constructor(
    private db: Database,
    private now = Date.now,
  ) {}
  async provision() {
    const subject = randomUUID(),
      key = secret();
    await this.db.atomic(async () => {
      await this.db.put('owners', hash(key), { subject });
      await this.db.initialize(subject);
    });
    return { subject, key };
  }
  async login(key: string) {
    const owner = await this.db.get('owners', hash(key), ownerSchema);
    if (!owner) throw new RequestError(401, 'The access key is invalid.');
    const token = secret();
    await this.db.put('sessions', hash(token), {
      subject: owner.subject,
      expiresAt: this.now() + 8 * 60 * 60_000,
    });
    return { subject: owner.subject, token };
  }
  async owner(key: string) {
    const owner = await this.db.get('owners', hash(key), ownerSchema);
    if (!owner) throw new RequestError(401, 'The access key is invalid.');
    return owner.subject;
  }
  async session(token: string) {
    const session = await this.db.get('sessions', hash(token), sessionSchema);
    if (!session || session.expiresAt <= this.now())
      throw new RequestError(401, 'Sign in again to access this space.');
    return session.subject;
  }
  async logout(token: string) {
    await this.db.delete('sessions', hash(token));
  }
}
