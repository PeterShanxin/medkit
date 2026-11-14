import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { MedkitService } from '../application/service';
import { createDemo } from '../application/demo';
import { type Command } from '../domain/commands';
import { emptyState, type State } from '../domain/model';
import { openStore } from '../storage/open';
import {
  restoreConnection,
  signInConnection,
  signOutConnection,
  watchConnection,
} from '../storage/connection';
import { ConnectedService } from '../storage/connected-client';
type RecordsService = MedkitService | ConnectedService;

export const uuid = randomUUID;
interface StoreContext {
  state: State | null;
  error: string;
  busy: boolean;
  mode: State['dataset'];
  setMode(mode: State['dataset']): void;
  refresh(): Promise<void>;
  run(commands: Command[], operationId?: string): Promise<void>;
  exportRecords(): Promise<string>;
  erase(): Promise<void>;
  connected: boolean;
  connect(key: string, upload: boolean): Promise<void>;
  disconnect(): Promise<void>;
}
const Context = createContext<StoreContext | null>(null);

export function StoreProvider({ children }: React.PropsWithChildren) {
  const [mode, setMode] = useState<State['dataset']>('personal');
  return (
    <SessionProvider key={mode} mode={mode} setMode={setMode}>
      {children}
    </SessionProvider>
  );
}

function SessionProvider({
  children,
  mode,
  setMode,
}: React.PropsWithChildren<{
  mode: State['dataset'];
  setMode(mode: State['dataset']): void;
}>) {
  const [state, setState] = useState<State | null>(null);
  const [service, setService] = useState<RecordsService | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const channel = useMemo(
    () =>
      Platform.OS === 'web' && typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel(`medkit-${mode}`)
        : null,
    [mode],
  );

  useEffect(() => {
    let active = true;
    let current: RecordsService | undefined;
    setError('');
    void (async () => {
      const connected = mode === 'personal' ? await restoreConnection() : null;
      if (connected) return connected;
      return new MedkitService(await openStore(`medkit-${mode}`), () =>
        mode === 'demo' ? createDemo(uuid) : emptyState(uuid()),
      );
    })()
      .then(async (opened) => {
        current = opened;
        const records = await current.load();
        if (active) {
          setService(current);
          setState(records);
          setError(
            current instanceof ConnectedService ? current.syncError : '',
          );
        } else current.close();
      })
      .catch(() => {
        if (active)
          setError(
            'Your records could not be opened. They have not been changed. Check device storage, close other MedKit tabs, and retry.',
          );
      });
    return () => {
      active = false;
      current?.close();
    };
  }, [mode, attempt]);

  const refresh = useCallback(async () => {
    if (!service) {
      setAttempt((value) => value + 1);
      return;
    }
    try {
      setState(await service.load());
      setError(service instanceof ConnectedService ? service.syncError : '');
    } catch {
      setError('Your records could not be refreshed. Try again.');
    }
  }, [service]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') void refresh();
    });
    if (channel) channel.onmessage = () => void refresh();
    return () => {
      subscription.remove();
      if (channel) channel.onmessage = null;
    };
  }, [refresh, channel]);
  useEffect(() => () => channel?.close(), [channel]);

  useEffect(
    () =>
      watchConnection(() => {
        setState(emptyState(uuid()));
        setService(null);
        setAttempt((value) => value + 1);
      }),
    [],
  );
  useEffect(() => {
    if (!(service instanceof ConnectedService)) return;
    const timer = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(timer);
  }, [service, refresh]);

  const run = async (commands: Command[], operationId = uuid()) => {
    if (!service)
      throw new Error('Records are still loading. Try again shortly.');
    setBusy(true);
    try {
      setState(await service.execute({ operationId, commands }));
      setError(service instanceof ConnectedService ? service.syncError : '');
      channel?.postMessage('changed');
    } finally {
      setBusy(false);
    }
  };
  const erase = async () => {
    if (!service) return;
    setBusy(true);
    try {
      setState(await service.erase());
      channel?.postMessage('changed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Context.Provider
      value={{
        state,
        error,
        busy,
        mode,
        setMode,
        refresh,
        run,
        erase,
        connected: service instanceof ConnectedService,
        connect: async (key, upload) => {
          if (!service || mode !== 'personal')
            throw new Error('Return to your own records before connecting.');
          const snapshot = upload ? await service.export() : undefined;
          await signInConnection(key, snapshot);
          setState(emptyState(uuid()));
          setService(null);
          setAttempt((value) => value + 1);
        },
        disconnect: async () => {
          await signOutConnection(() => service?.close());
          setState(emptyState(uuid()));
          setService(null);
          setAttempt((value) => value + 1);
        },
        exportRecords: async () => {
          if (!service) throw new Error('Records are still loading.');
          return service.export();
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useRecords() {
  const value = useContext(Context);
  if (!value) throw new Error('StoreProvider is missing.');
  return value;
}
