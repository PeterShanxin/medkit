import { type Mutation } from '../domain/commands';
import { validateState } from '../domain/invariants';
import { exportSchema, type State } from '../domain/model';
import { transition } from '../domain/transition';

export interface RecordStore {
  read(): Promise<State | null>;
  transact(update: (current: State | null) => State): Promise<State>;
  clear(): Promise<void>;
  close(): void;
}

export function applyRecordMutation(
  current: State,
  mutation: Mutation,
  now: string,
): State {
  return transition(validateState(current), mutation, now);
}

export class MedkitService {
  constructor(
    private store: RecordStore,
    private initial: () => State,
    private clock = () => new Date().toISOString(),
  ) {}
  async load(): Promise<State> {
    const current = await this.store.read();
    return current
      ? validateState(current)
      : this.store.transact((value) => value ?? this.initial());
  }
  execute(mutation: Mutation): Promise<State> {
    return this.store.transact((value) =>
      applyRecordMutation(value ?? this.initial(), mutation, this.clock()),
    );
  }
  async export(): Promise<string> {
    return JSON.stringify(
      exportSchema.parse({
        format: 'medkit',
        exportedAt: this.clock(),
        state: await this.load(),
      }),
      null,
      2,
    );
  }
  async erase(): Promise<State> {
    // Replace the single aggregate atomically; audit and idempotency records are erased too.
    return this.store.transact(() => this.initial());
  }
  close() {
    this.store.close();
  }
}
