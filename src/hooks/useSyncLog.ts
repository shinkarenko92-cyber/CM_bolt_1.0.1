import { useContext } from 'react';
import { SyncLogContext } from '@/contexts/syncLogContextBase';

export function useSyncLog() {
  const ctx = useContext(SyncLogContext);
  if (!ctx) return null;
  return ctx;
}
