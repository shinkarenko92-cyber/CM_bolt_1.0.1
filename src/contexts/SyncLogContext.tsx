import { createContext, useCallback, useContext, useState } from 'react';

type SyncLogContextValue = {
  isOpen: boolean;
  openSyncLog: () => void;
  closeSyncLog: () => void;
};

const SyncLogContext = createContext<SyncLogContextValue | null>(null);

export function SyncLogProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);

  const openSyncLog = useCallback(() => setOpen(true), []);
  const closeSyncLog = useCallback(() => setOpen(false), []);

  return (
    <SyncLogContext.Provider value={{ isOpen, openSyncLog, closeSyncLog }}>
      {children}
    </SyncLogContext.Provider>
  );
}

export function useSyncLog() {
  const ctx = useContext(SyncLogContext);
  if (!ctx) return null;
  return ctx;
}

/** Call from anywhere (e.g. link in settings) to open the sync log dialog */
export function openSyncLogGlobal() {
  window.dispatchEvent(new CustomEvent('roomi-open-sync-log'));
}
