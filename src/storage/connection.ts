import type { ConnectedService } from './connected-client';
// The native app remains local. Connected accounts are currently supported in the hosted Web app.
export async function restoreConnection(): Promise<ConnectedService | null> {
  return null;
}
export function hasConnection(): boolean {
  return false;
}
export async function signInConnection(
  _key: string,
  _snapshot?: string,
): Promise<void> {
  throw new Error('Open the hosted MedKit Web app to connect.');
}
export async function signOutConnection(
  beforeClear: () => void = () => {},
): Promise<void> {
  beforeClear();
}
export function watchConnection(_changed: () => void): () => void {
  return () => {};
}
