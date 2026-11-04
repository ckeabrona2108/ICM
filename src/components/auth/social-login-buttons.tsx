"use client";

import * as React from "react";
import { getProviders, signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";

import { requestTelegramAuth, useTelegramWidget } from "@/components/auth/telegram-widget";

type SocialProviderId = "yandex" | "vk" | "telegram";

const SOCIAL_PROVIDERS: Array<{ id: SocialProviderId; label: string }> = [
  { id: "yandex", label: "Яндекс ID" },
  { id: "vk", label: "VK ID" },
  { id: "telegram", label: "Telegram" }
];

export const SOCIAL_LOGIN_ERRORS: Record<string, string> = {
  OAuthAdminAccount: "Для этого аккаунта вход только по email и паролю",
  OAuthAccountTaken: "К этому кабинету уже привязан другой аккаунт. Войдите по email и паролю",
  OAuthEmailUnverified:
    "Аккаунт с этим email уже есть, но адрес не подтверждён. Войдите по паролю или восстановите его — после этого вход через сервис заработает",
  OAuthUnavailable: "Быстрый вход сейчас недоступен. Войдите по email и паролю",
  TelegramLoginInvalid: "Telegram не подтвердил вход. Попробуйте ещё раз",
  OAuthSignin: "Не удалось начать вход через сервис. Попробуйте ещё раз",
  OAuthCallback: "Не удалось завершить вход через сервис. Попробуйте ещё раз",
  AccessDenied: "Вход отменён",
  Callback: "Не удалось завершить вход через сервис. Попробуйте ещё раз"
};

export function YandexIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#FC3F1D" />
      <path
        fill="#fff"
        d="M13.32 6.5h-1.1c-2 0-3.06 1.02-3.06 2.52 0 1.7.73 2.5 2.23 3.5l1.24.84-3.56 5.14H6.9l3.2-4.6c-1.84-1.32-2.87-2.6-2.87-4.77 0-2.72 1.9-4.58 4.98-4.58h3.06v13.95h-1.95V6.5Z"
      />
    </svg>
  );
}

export function VkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <rect width="24" height="24" rx="7" fill="#0077FF" />
      <path
        fill="#fff"
        d="M12.77 17.1c-5.13 0-8.06-3.52-8.18-9.37h2.57c.08 4.3 1.98 6.12 3.48 6.5v-6.5h2.42v3.71c1.48-.16 3.04-1.85 3.56-3.71h2.42a7.15 7.15 0 0 1-3.29 4.67 7.4 7.4 0 0 1 3.85 4.7h-2.66c-.57-1.78-2-3.16-3.88-3.35v3.35h-.29Z"
      />
    </svg>
  );
}

export function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#2AABEE" />
      <path
        fill="#fff"
        d="M5.43 11.87c3.5-1.52 5.83-2.53 7-3.02 3.33-1.39 4.02-1.63 4.47-1.64.1 0 .32.02.47.14.12.1.15.23.17.33.02.1.04.31.02.48-.18 1.9-.96 6.5-1.36 8.63-.17.9-.5 1.2-.82 1.23-.7.06-1.22-.46-1.9-.9-1.05-.7-1.65-1.13-2.67-1.8-1.18-.78-.42-1.2.26-1.9.18-.19 3.24-2.97 3.3-3.22 0-.03.01-.15-.06-.21-.07-.06-.17-.04-.25-.02-.1.02-1.79 1.14-5.06 3.35-.48.33-.91.49-1.3.48-.43-.01-1.26-.24-1.87-.44-.75-.25-1.35-.38-1.3-.8.03-.22.33-.44.9-.67Z"
      />
    </svg>
  );
}

const ICONS: Record<SocialProviderId, () => React.JSX.Element> = { yandex: YandexIcon, vk: VkIcon, telegram: TelegramIcon };

export function SocialLoginButtons({
  callbackUrl,
  disabled = false
}: {
  callbackUrl: string | null;
  disabled?: boolean;
}) {
  const [available, setAvailable] = React.useState<SocialProviderId[]>([]);
  const [pending, setPending] = React.useState<SocialProviderId | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    getProviders()
      .then((providers) => {
        if (cancelled || !providers) return;
        setAvailable(SOCIAL_PROVIDERS.map((provider) => provider.id).filter((id) => id in providers));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const telegram = useTelegramWidget(available.includes("telegram"));
  const shown = SOCIAL_PROVIDERS.filter(
    (provider) => available.includes(provider.id) && (provider.id !== "telegram" || telegram.config)
  );

  async function start(id: SocialProviderId) {
    const target = callbackUrl ?? "/dashboard";
    if (id !== "telegram") {
      setPending(id);
      void signIn(id, { callbackUrl: target });
      return;
    }
    if (!telegram.config) return;
    setPending(id);
    try {
      const data = await requestTelegramAuth(telegram.config);
      if (!data) {
        setPending(null);
        return;
      }
      // NextAuth's credentials flow; failures come back as /login?error=<code> like the OAuth ones.
      await signIn("telegram", { payload: JSON.stringify(data), callbackUrl: target });
    } catch {
      setPending(null);
    }
  }

  if (shown.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-4 text-[12px] uppercase tracking-[0.16em] text-white/35">
        <span className="h-px flex-1 bg-white/10" />
        или
        <span className="h-px flex-1 bg-white/10" />
      </div>
      <div className={shown.length === 3 ? "mt-6 grid gap-3 sm:grid-cols-3" : "mt-6 grid gap-3 sm:grid-cols-2"}>
        {shown.map((provider) => {
          const Icon = ICONS[provider.id];
          return (
            <button
              key={provider.id}
              type="button"
              disabled={disabled || pending !== null || (provider.id === "telegram" && !telegram.ready)}
              onClick={() => void start(provider.id)}
              className="inline-flex h-14 items-center justify-center gap-3 rounded-2xl bg-white/[0.06] px-5 text-[15px] font-medium text-white transition-colors hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending === provider.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon />}
              {provider.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
