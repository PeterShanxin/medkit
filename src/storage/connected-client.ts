import { z } from 'zod';
import {
  connectedRecordsSchema,
  type ConnectedRecords,
} from '../application/connected/contracts';
import type { Mutation } from '../domain/commands';
import type { RecordEdit, RecordStore } from '../application/service';
import { validateState } from '../domain/invariants';
import { exportSchema, type State } from '../domain/model';

export class ConnectionError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function connectionRequest(
  path: string,
  body?: unknown,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new ConnectionError(
      0,
      'Cannot reach your connected space. Check your connection and retry.',
    );
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new ConnectionError(
      response.status,
      'This address does not provide a MedKit connected service.',
    );
  }
  if (!response.ok) {
    const parsed = z.object({ error: z.string() }).safeParse(value);
    throw new ConnectionError(
      response.status,
      parsed.success
        ? parsed.data.error
        : 'The connected request failed. Try again.',
    );
  }
  return value;
}
export class ConnectedService {
  private current: ConnectedRecords | null = null;
  private versions = new WeakMap<State, number>();
  syncError = '';
  private closed = false;
  constructor(
    private cache: RecordStore,
    readonly subject: string,
  ) {}
  private async accept(raw: unknown): Promise<State> {
    if (this.closed) throw new Error('This connected session has ended.');
    const value = connectedRecordsSchema.parse(raw);
    validateState(value.state);
    if (value.state.profile.id !== this.subject)
      throw new Error(
        'The connected account does not match. Sign out and reconnect.',
      );
    this.current = value;
    this.versions.set(value.state, value.version);
    this.syncError = '';
    try {
      await this.cache.transact(() => value.state);
    } catch {
      this.syncError =
        'Saved online. An offline copy could not be stored on this device.';
    }
    return value.state;
  }
  async load(): Promise<State> {
    try {
      return await this.accept(await connectionRequest('records'));
    } catch (error) {
      this.syncError =
        error instanceof Error ? error.message : 'Refresh failed.';
      const cached = await this.cache.read();
      if (!cached) throw error;
      if (cached.profile.id !== this.subject)
        throw new Error('Cached account does not match.');
      this.current = null;
      this.syncError +=
        ' Showing the last downloaded records. Changes require a connection.';
      return validateState(cached);
    }
  }
  async execute(mutation: Mutation): Promise<State> {
    return this.send(mutation, this.current?.version);
  }
  beginEdit(operationId: string, snapshot = this.current?.state): RecordEdit {
    // Bind the form to the records it displayed, even when background reads advance.
    const version = snapshot ? this.versions.get(snapshot) : undefined;
    let pending: Mutation | undefined;
    let uncertain = false;
    return {
      execute: async (commands) => {
        if (this.closed) throw new Error('This connected session has ended.');
        if (version === undefined)
          throw new Error(
            'Refresh connected records and reopen this form before saving.',
          );
        pending ??= structuredClone({ operationId, commands });
        try {
          return await this.send(pending, version);
        } catch (error) {
          if (
            !uncertain &&
            error instanceof ConnectionError &&
            error.status >= 400 &&
            error.status < 500
          ) {
            pending = undefined;
            throw error;
          }
          uncertain = true;
          throw new Error(
            'Save status is unknown. Retry to check the original submission. Later edits will not be sent. Review your records before starting another entry.',
          );
        }
      },
    };
  }
  private async send(
    mutation: Mutation,
    version: number | undefined,
  ): Promise<State> {
    if (this.closed) throw new Error('This connected session has ended.');
    if (version === undefined)
      throw new Error('Refresh connected records before saving a change.');
    return this.accept(
      await connectionRequest('records', {
        ...mutation,
        version,
      }),
    );
  }
  async export(): Promise<string> {
    const state = await this.load();
    return JSON.stringify(
      exportSchema.parse({
        format: 'medkit',
        exportedAt: new Date().toISOString(),
        state,
      }),
      null,
      2,
    );
  }
  async erase(): Promise<State> {
    if (!this.current)
      throw new Error('Reconnect before deleting connected records.');
    return this.accept(
      await connectionRequest('erase', { version: this.current.version }),
    );
  }
  close() {
    this.closed = true;
    this.cache.close();
  }
}
