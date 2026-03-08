/**
 * Backward-compatible re-export from Zustand syncLogStore.
 * SyncLogProvider is kept as passthrough.
 */
import type { ReactNode } from 'react';

export { useSyncLog } from '@/stores/syncLogStore';

export function SyncLogProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
