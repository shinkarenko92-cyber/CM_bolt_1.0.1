import { create } from 'zustand';

interface SyncLogState {
  isOpen: boolean;
}

interface SyncLogActions {
  openSyncLog: () => void;
  closeSyncLog: () => void;
}

type SyncLogStore = SyncLogState & SyncLogActions;

export const useSyncLogStore = create<SyncLogStore>((set) => ({
  isOpen: false,
  openSyncLog: () => set({ isOpen: true }),
  closeSyncLog: () => set({ isOpen: false }),
}));

export function useSyncLog() {
  return useSyncLogStore();
}
