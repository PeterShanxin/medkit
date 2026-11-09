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
  const [service, setService] = useState<MedkitService | null>(null);
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
    let current: MedkitService | undefined;
    setError('');
    void openStore(`medkit-${mode}`)
      .then(async (store) => {
        current = new MedkitService(store, () =>
          mode === 'demo' ? createDemo(uuid) : emptyState(uuid()),
        );
        const records = await current.load();
        if (active) {
          setService(current);
          setState(records);
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
      setError('');
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

  const run = async (commands: Command[], operationId = uuid()) => {
    if (!service)
      throw new Error('Records are still loading. Try again shortly.');
    setBusy(true);
    try {
      setState(await service.execute({ operationId, commands }));
      setError('');
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
