import { z } from 'zod';
import { idSchema } from '../domain/model';
import { ConnectedService, connectionRequest } from './connected-client';
import { openIndexedDb } from './indexeddb';
const storageKey = 'medkit-connected-account';
function subject() {
  const value = idSchema.nullable().safeParse(localStorage.getItem(storageKey));
  return value.success ? value.data : null;
}
function notify() {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel('medkit-connection');
  channel.postMessage('changed');
  channel.close();
}
export function hasConnection() {
  return !!subject();
}
export async function restoreConnection() {
  let id = subject();
  const url = new URL(window.location.href);
  // Only the connection page adopts an OAuth cookie; local/offline startup stays local.
  if (
    url.pathname === '/connections' &&
    (!id || url.searchParams.get('signin') === 'github')
  ) {
    try {
      const session = z
        .object({ subject: idSchema })
        .parse(await connectionRequest('session'));
      if (id && id !== session.subject) {
        const previous = await openIndexedDb(`medkit-connected-${id}`);
        await previous.clear();
        previous.close();
      }
      id = session.subject;
      localStorage.setItem(storageKey, id);
      url.searchParams.delete('signin');
      window.history.replaceState(null, '', url.pathname + url.search);
      notify();
    } catch {
      if (url.searchParams.get('signin') === 'github')
        throw new Error(
          'GitHub sign-in could not be opened. Try signing in again.',
        );
    }
  }
  return id
    ? new ConnectedService(await openIndexedDb(`medkit-connected-${id}`), id)
    : null;
}
export async function startGitHubSignIn(returnTo = '/connections') {
  const result = z
    .object({ authorizationUrl: z.string().url() })
    .parse(await connectionRequest('login/github', { returnTo }));
  const url = new URL(result.authorizationUrl);
  if (
    url.origin !== 'https://github.com' ||
    url.pathname !== '/login/oauth/authorize'
  )
    throw new Error('The sign-in address is invalid.');
  window.location.assign(url.href);
}
export async function signInConnection(key: string, snapshot?: string) {
  const session = z
    .object({ subject: idSchema })
    .parse(await connectionRequest('login', { key }));
  try {
    if (snapshot)
      await connectionRequest('import', JSON.parse(snapshot), session.subject);
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
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel('medkit-connection');
  channel.onmessage = changed;
  return () => channel.close();
}
