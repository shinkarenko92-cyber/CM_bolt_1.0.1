import { useCallback, useState } from 'react';
import { SyncLogContext } from '@/contexts/syncLogContextBase';

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
