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
  provision() {
    const subject = randomUUID(),
      key = secret();
    this.db.atomic(() => {
      this.db.put('owners', hash(key), { subject });
      this.db.initialize(subject);
    });
    return { subject, key };
  }
  login(key: string) {
    const owner = this.db.get('owners', hash(key), ownerSchema);
    if (!owner) throw new RequestError(401, 'The access key is invalid.');
    this.db.removeWhere(
      'sessions',
      (value) => sessionSchema.parse(value).expiresAt <= this.now(),
    );
    const token = secret();
    this.db.put('sessions', hash(token), {
      subject: owner.subject,
      expiresAt: this.now() + 8 * 60 * 60_000,
    });
    return { subject: owner.subject, token };
  }
  owner(key: string) {
    const owner = this.db.get('owners', hash(key), ownerSchema);
    if (!owner) throw new RequestError(401, 'The access key is invalid.');
    return owner.subject;
  }
  session(token: string) {
    const session = this.db.get('sessions', hash(token), sessionSchema);
    if (!session || session.expiresAt <= this.now())
      throw new RequestError(401, 'Sign in again to access this space.');
    return session.subject;
  }
  logout(token: string) {
    this.db.delete('sessions', hash(token));
  }
}
