"use client";

import * as React from "react";

// Telegram Login Widget in "JS API" mode: our own button opens Telegram's sign-in popup with
// Telegram.Login.auth and gets the signed account fields back, which the server verifies.

const WIDGET_SRC = "https://telegram.org/js/telegram-widget.js?22";

export interface TelegramWidgetConfig {
  botId: string;
  botUsername: string;
}

type TelegramAuthData = Record<string, string | number>;

declare global {
  interface Window {
    Telegram?: {
      Login?: {
        auth: (
          options: { bot_id: string; request_access?: "write"; lang?: string },
          callback: (data: TelegramAuthData | false) => void
        ) => void;
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadWidgetScript(): Promise<void> {
  if (window.Telegram?.Login) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = WIDGET_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("telegram widget failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

// Loads the config and the widget script up front: the popup must open straight from the click,
// or the browser blocks it.
export function useTelegramWidget(enabled: boolean): { config: TelegramWidgetConfig | null; ready: boolean } {
  const [config, setConfig] = React.useState<TelegramWidgetConfig | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/auth/telegram-widget")
      .then((response) => (response.ok ? response.json() : null))
      .then(async (payload: (TelegramWidgetConfig & { available?: boolean }) | null) => {
        if (cancelled || !payload?.available) return;
        setConfig({ botId: payload.botId, botUsername: payload.botUsername });
        await loadWidgetScript();
        if (!cancelled) setReady(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { config, ready };
}

// Resolves with the signed fields, or null when the artist closes the popup.
export function requestTelegramAuth(config: TelegramWidgetConfig): Promise<TelegramAuthData | null> {
  return new Promise((resolve, reject) => {
    const login = window.Telegram?.Login;
    if (!login) {
      reject(new Error("telegram widget is not loaded"));
      return;
    }
    login.auth({ bot_id: config.botId, request_access: "write", lang: "ru" }, (data) => resolve(data || null));
  });
}
