import { useEffect, useRef, useCallback } from 'react';

const BOTPRESS_INJECT_URL = 'https://cdn.botpress.cloud/webchat/v3.6/inject.js';
const BOTPRESS_CONFIG_URL = 'https://files.bpcontent.cloud/2026/02/20/19/20260220194752-EAJ8MKI6.js';

export type PlanType = 'free' | 'pro' | 'business' | 'enterprise';

export interface BoltChatProps {
  userId?: string;
  userToken?: string;
  plan?: PlanType;
}

declare global {
  interface Window {
    botpress?: {
      open: () => void;
      close: () => void;
      toggle: () => void;
      updateUser: (params: {
        name?: string;
        pictureUrl?: string;
        data?: Record<string, unknown>;
        userKey?: string;
      }) => Promise<void>;
      config: (params: { configuration?: Record<string, unknown>; user?: Record<string, unknown> }) => void;
      on: (event: string, cb: (e?: unknown) => void) => () => void;
    };
  }
}

function loadScript(src: string, defer = false): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = !defer;
    script.defer = defer;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

function applyUserData() {
  // Данные передаём через data-атрибуты контейнера, т.к. они задаются при монтировании
  const container = document.getElementById('bolt-chat-user-data');
  const userId = container?.getAttribute('data-user-id') || undefined;
  const userToken = container?.getAttribute('data-user-token') || undefined;
  const plan = container?.getAttribute('data-plan') || undefined;

  if (!window.botpress) return;
  if (!userId) {
    if (import.meta.env.DEV) console.log('[BoltChat] Анонимный режим — userId не передан');
    return;
  }

  window.botpress.updateUser({
    userKey: userId,
    data: {
      ...(userToken && { userToken }),
      ...(plan && { plan }),
    },
  }).then(() => {
    if (import.meta.env.DEV) console.log('[BoltChat] updateUser выполнен', { userId, plan: plan || '—' });
  }).catch((err) => {
    if (import.meta.env.DEV) console.warn('[BoltChat] updateUser ошибка', err);
  });
}

export default function BoltChat({ userId, userToken, plan }: BoltChatProps) {
  const initialized = useRef(false);

  const initBotpress = useCallback(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (import.meta.env.DEV) console.log('[BoltChat] Загрузка скриптов Botpress...');

    loadScript(BOTPRESS_INJECT_URL)
      .then(() => loadScript(BOTPRESS_CONFIG_URL, true))
      .then(() => {
        const checkBotpress = () => {
          if (typeof window.botpress !== 'undefined') {
            if (import.meta.env.DEV) console.log('[BoltChat] window.botpress доступен');

            window.botpress.on('webchat:initialized', () => {
              applyUserData();
            });

            return;
          }
          setTimeout(checkBotpress, 100);
        };
        checkBotpress();
      })
      .catch((err) => {
        console.error('[BoltChat] Ошибка инициализации', err);
        initialized.current = false;
      });
  }, []);

  useEffect(() => {
    initBotpress();
  }, [initBotpress]);

  // Обновляем data-атрибуты для applyUserData (вызывается при инициализации и при смене user)
  useEffect(() => {
    let el = document.getElementById('bolt-chat-user-data');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bolt-chat-user-data';
      el.setAttribute('aria-hidden', 'true');
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    el.setAttribute('data-user-id', userId ?? '');
    el.setAttribute('data-user-token', userToken ?? '');
    el.setAttribute('data-plan', plan ?? '');
    if (window.botpress) applyUserData();
  }, [userId, userToken, plan]);

  return null;
}
