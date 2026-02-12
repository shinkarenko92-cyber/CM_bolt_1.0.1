import { useEffect } from 'react';

const METRIKA_ID = 106793939;
const METRIKA_SRC = `https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_ID}`;

type YmFunction = ((...args: unknown[]) => void) & {
  a?: unknown[][];
  l?: number;
};

declare global {
  interface Window {
    ym?: YmFunction;
  }
}

export function YandexMetrika() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // Не добавляем скрипт повторно при повторных монтированиях в Dev/StrictMode.
    if (document.querySelector(`script[src="${METRIKA_SRC}"]`)) return;

    const ymStub: YmFunction =
      window.ym ??
      ((...args: unknown[]) => {
        ymStub.a = ymStub.a || [];
        ymStub.a.push(args);
      });

    ymStub.l = Date.now();
    window.ym = ymStub;

    const script = document.createElement('script');
    script.async = true;
    script.src = METRIKA_SRC;

    const firstScript = document.getElementsByTagName('script')[0];
    if (firstScript?.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.head.appendChild(script);
    }

    window.ym(METRIKA_ID, 'init', {
      ssr: true,
      webvisor: true,
      clickmap: true,
      ecommerce: 'dataLayer',
      referrer: document.referrer,
      url: location.href,
      accurateTrackBounce: true,
      trackLinks: true,
    });
  }, []);

  return null;
}
