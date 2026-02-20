import { useEffect, useRef, useCallback } from 'react';

const BOTPRESS_INJECT_URL = 'https://cdn.botpress.cloud/webchat/v3.6/inject.js';
const BOTPRESS_CONFIG_URL = 'https://files.bpcontent.cloud/2026/02/20/19/20260220194752-EAJ8MKI6.js';

export type PlanType = 'free' | 'pro' | 'enterprise';

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
    console.log('[BoltChat] Анонимный режим — userId не передан');
    return;
  }

  window.botpress.updateUser({
    userKey: userId,
    data: {
      ...(userToken && { userToken }),
      ...(plan && { plan }),
    },
  }).then(() => {
    console.log('[BoltChat] updateUser выполнен', { userId, plan: plan || '—' });
  }).catch((err) => {
    console.warn('[BoltChat] updateUser ошибка', err);
  });
}

export default function BoltChat({ userId, userToken, plan }: BoltChatProps) {
  const initialized = useRef(false);

  const initBotpress = useCallback(() => {
    if (initialized.current) return;
    initialized.current = true;

    console.log('[BoltChat] Загрузка скриптов Botpress...');

    loadScript(BOTPRESS_INJECT_URL)
      .then(() => loadScript(BOTPRESS_CONFIG_URL, true))
      .then(() => {
        const checkBotpress = () => {
          if (typeof window.botpress !== 'undefined') {
            console.log('[BoltChat] window.botpress доступен');

            // Скрываем стандартный виджет, показываем только нашу кнопку
            window.botpress.on('webchat:initialized', () => {
              try {
                window.botpress!.config({
                  configuration: { hideWidget: true },
                });
              } catch {
                // hideWidget может не поддерживаться в этой версии
              }
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

  const handleOpenChat = useCallback(() => {
    if (window.botpress) {
      window.botpress.toggle();
    } else {
      console.warn('[BoltChat] botpress ещё не инициализирован');
    }
  }, []);

  return (
    <>
      <button
        type="button"
        aria-label="Открыть чат"
        onClick={handleOpenChat}
        className="fixed bottom-6 right-6 z-[9999] flex h-14 w-14 items-center justify-center rounded-full bg-[#007bff] text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[#007bff] focus:ring-offset-2"
      >
        <span className="text-[1.5rem]" aria-hidden>💬</span>
      </button>
    </>
  );
}
