import { createContext } from 'react';

export type SyncLogContextValue = {
  isOpen: boolean;
  openSyncLog: () => void;
  closeSyncLog: () => void;
};

export const SyncLogContext = createContext<SyncLogContextValue | null>(null);
