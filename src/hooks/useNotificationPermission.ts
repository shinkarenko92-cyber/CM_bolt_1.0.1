import { useState, useEffect, useCallback } from 'react';

const supported = typeof Notification !== 'undefined';

export function useNotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : 'denied'
  );

  useEffect(() => {
    if (!supported) return;
    setPermission(Notification.permission);
  }, []);

  const requestPermission = useCallback(async () => {
    if (!supported) return 'denied' as NotificationPermission;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  return { permission, requestPermission, supported };
}

/**
 * Show a browser notification if permission is granted.
 * Uses `tag` to avoid stacking multiple notifications from the same chat.
 */
export function showBrowserNotification(title: string, body: string, chatId: string) {
  if (!supported || Notification.permission !== 'granted') return;
  new Notification(title, {
    body,
    icon: '/icon-192x192.png',
    tag: `avito-msg-${chatId}`,
    renotify: true,
  });
}
