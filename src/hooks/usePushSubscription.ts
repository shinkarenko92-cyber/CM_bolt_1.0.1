import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export type PushSubscriptionStatus = 'unsupported' | 'idle' | 'subscribed' | 'error';

export function usePushSubscription() {
  const { user } = useAuth();
  const [status, setStatus] = useState<PushSubscriptionStatus>('idle');

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    !!VAPID_PUBLIC_KEY;

  // On mount: check if already subscribed in browser, and ensure DB row exists
  useEffect(() => {
    if (!supported || !user) return;
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setStatus('idle');
        return;
      }
      setStatus('subscribed');
      // Ensure subscription is persisted in DB (may have been lost)
      const json = sub.toJSON();
      const keys = json.keys as Record<string, string> | undefined;
      if (json.endpoint && keys?.p256dh && keys?.auth) {
        const { error } = await supabase.from('push_subscriptions').upsert(
          {
            user_id: user.id,
            endpoint: json.endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth,
          },
          { onConflict: 'user_id,endpoint' }
        );
        if (error) {
          console.error('[push] DB re-sync failed:', error.message, error.details);
        } else {
          console.log('[push] subscription synced to DB');
        }
      }
    });
  }, [supported, user]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported || !user || !VAPID_PUBLIC_KEY) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey.buffer as ArrayBuffer,
      });
      const json = sub.toJSON();
      const keys = json.keys as Record<string, string> | undefined;
      if (!json.endpoint || !keys?.p256dh || !keys?.auth) {
        throw new Error('Invalid push subscription response');
      }
      const payload = {
        user_id: user.id,
        endpoint: json.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      };
      console.log('[push] saving subscription to DB...', { endpoint: json.endpoint.slice(0, 50) });
      const { error } = await supabase.from('push_subscriptions').upsert(
        payload,
        { onConflict: 'user_id,endpoint' }
      );
      if (error) {
        console.error('[push] DB upsert failed:', error.message, error.details, error.hint);
        throw error;
      }
      console.log('[push] subscription saved successfully');
      setStatus('subscribed');
      return true;
    } catch (err) {
      console.error('Push subscription failed:', err);
      setStatus('error');
      return false;
    }
  }, [supported, user]);

  const unsubscribe = useCallback(async () => {
    if (!supported || !user) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
    setStatus('idle');
  }, [supported, user]);

  return { supported, status, subscribe, unsubscribe };
}
