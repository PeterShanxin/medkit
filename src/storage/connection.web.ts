import { z } from 'zod';
import { idSchema } from '../domain/model';
import { ConnectedService, connectionRequest } from './connected-client';
import { openIndexedDb } from './indexeddb';
const storageKey = 'medkit-connected-account';
function subject() {
  return idSchema.nullable().parse(localStorage.getItem(storageKey));
}
function notify() {
  const channel = new BroadcastChannel('medkit-connection');
  channel.postMessage('changed');
  channel.close();
}
export function hasConnection() {
  return !!subject();
}
export async function restoreConnection() {
  const id = subject();
  return id
    ? new ConnectedService(await openIndexedDb(`medkit-connected-${id}`), id)
    : null;
}
export async function signInConnection(key: string, snapshot?: string) {
  const session = z
    .object({ subject: idSchema })
    .parse(await connectionRequest('login', { key }));
  try {
    if (snapshot) await connectionRequest('import', JSON.parse(snapshot));
    localStorage.setItem(storageKey, session.subject);
    notify();
  } catch (error) {
    await connectionRequest('logout', {}).catch(() => {});
    throw error;
  }
}
export async function signOutConnection(beforeClear: () => void = () => {}) {
  // Do not claim that the server session ended if logout could not reach it.
  await connectionRequest('logout', {});
  beforeClear();
  const id = subject();
  if (id) {
    const cache = await openIndexedDb(`medkit-connected-${id}`);
    await cache.clear();
    cache.close();
  }
  localStorage.removeItem(storageKey);
  notify();
}
export function watchConnection(changed: () => void) {
  const channel = new BroadcastChannel('medkit-connection');
  channel.onmessage = changed;
  return () => channel.close();
}
