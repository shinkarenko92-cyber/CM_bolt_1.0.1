/* eslint-disable react-refresh/only-export-components */
/**
 * Backward-compatible re-export from Zustand authStore.
 * AuthProvider is kept as a passthrough so existing <AuthProvider> wrappers
 * don't break, but the actual state lives in Zustand.
 */
import { useEffect, type ReactNode } from 'react';
import { useAuthStore, useAuth, type SignUpParams } from '@/stores/authStore';

export type { SignUpParams };
export { useAuth };

export function AuthProvider({ children }: { children: ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    const unsubscribe = initialize();
    return unsubscribe;
  }, [initialize]);

  return <>{children}</>;
}
