import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

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

  // On mount: check if already subscribed
  useEffect(() => {
    if (!supported || !user) return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setStatus(sub ? 'subscribed' : 'idle');
      });
    });
  }, [supported, user]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported || !user) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const json = sub.toJSON();
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: user.id,
          endpoint: json.endpoint!,
          p256dh: (json.keys as { p256dh: string; auth: string }).p256dh,
          auth: (json.keys as { p256dh: string; auth: string }).auth,
        },
        { onConflict: 'user_id,endpoint' }
      );
      if (error) throw error;
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
