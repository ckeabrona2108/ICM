"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import { Check, KeyRound, Loader2, Lock, Mail, Plus, Smartphone } from "lucide-react";

import { TelegramIcon, VkIcon, YandexIcon } from "@/components/auth/social-login-buttons";
import { requestTelegramAuth, useTelegramWidget } from "@/components/auth/telegram-widget";
import { Card, CardContent } from "@/components/ui/card";
import type { LinkedAccountsState, LoginMethodId } from "@/lib/linked-accounts";
import { cn } from "@/lib/utils";

const VK_COMMUNITY_CHAT_URL = "https://vk.me/icecreammusicru";

type Notice = { tone: "success" | "error"; text: string; scope?: NoticeScope } | null;
type NoticeScope = "accounts" | "notifications";

const METHOD_LABELS: Record<LoginMethodId, string> = {
  password: "Пароль",
  yandex: "Яндекс ID",
  vk: "VK ID",
  telegram: "Telegram"
};

// Confirmations before disconnecting: what else stops working along with the sign-in.
const DISCONNECT_WARNINGS: Record<LoginMethodId, string> = {
  password: "Удалить пароль? Входить по email и паролю станет нельзя, пока вы не установите его снова.",
  yandex: "Отключить Яндекс ID? Входить через Яндекс станет нельзя.",
  vk: "Отключить VK ID? Пропадут вход через VK и уведомления в сообщениях от сообщества.",
  telegram: "Отключить Telegram? Пропадут вход через Telegram и уведомления от бота."
};

// Results the provider flows bring back in the query string.
const QUERY_NOTICES: Record<string, Record<string, Notice>> = {
  linked: {
    yandex: { tone: "success", text: "Яндекс ID подключён." },
    vk: { tone: "success", text: "VK ID подключён." }
  },
  link_error: {
    admin: { tone: "error", text: "Для этого аккаунта вход только по email и паролю." },
    taken: { tone: "error", text: "Этот аккаунт уже подключён к другому кабинету." },
    already_linked: { tone: "error", text: "К кабинету уже подключён другой аккаунт этого сервиса. Сначала отключите его." },
    expired: { tone: "error", text: "Подключение не завершилось. Попробуйте ещё раз." },
    unavailable: { tone: "error", text: "Подключение временно недоступно." }
  },
  vk: {
    linked: { tone: "success", text: "VK ID подключён." },
    linked_not_member: { tone: "success", text: "VK ID подключён." }
  },
  vk_error: {
    taken: { tone: "error", text: "Этот аккаунт ВКонтакте уже подключён к другому кабинету." },
    cancelled: { tone: "error", text: "Подключение ВКонтакте отменено." },
    expired: { tone: "error", text: "Подключение ВКонтакте устарело. Попробуйте ещё раз." },
    failed: { tone: "error", text: "ВКонтакте не подтвердил вход. Попробуйте ещё раз." },
    unavailable: { tone: "error", text: "Подключение ВКонтакте временно недоступно." }
  }
};

function readQueryNotice(): Notice {
  const url = new URL(window.location.href);
  let notice: Notice = null;
  for (const [param, notices] of Object.entries(QUERY_NOTICES)) {
    const value = url.searchParams.get(param);
    if (!value) continue;
    notice = notices[value] ?? notice;
    url.searchParams.delete(param);
  }
  if (notice) window.history.replaceState(null, "", url.toString());
  return notice;
}

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "Не удалось выполнить запрос");
  }
  return payload ?? {};
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`.replace(/-/gu, "+").replace(/_/gu, "/");
  const raw = window.atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes.buffer;
}

function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

type ChannelId = "email" | "vk" | "telegram";

export function LinkedAccountsCard() {
  const [state, setState] = React.useState<LinkedAccountsState | null>(null);
  const [notice, setNotice] = React.useState<Notice>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [devicePush, setDevicePush] = React.useState<boolean | null>(null);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const telegram = useTelegramWidget(Boolean(state?.telegramBot));

  const load = React.useCallback(async () => {
    const response = await fetch("/api/user/linked-accounts", { cache: "no-store" }).catch(() => null);
    if (response?.ok) {
      setState((await response.json()) as LinkedAccountsState);
      setLoadFailed(false);
    } else {
      setLoadFailed(true);
    }
  }, []);

  React.useEffect(() => {
    void load();
    setNotice(readQueryNotice());
    void currentPushSubscription()
      .then((subscription) => setDevicePush(pushSupported() ? Boolean(subscription) : null))
      .catch(() => setDevicePush(null));
  }, [load]);

  // Notices show in the card where the button was pressed.
  async function run(key: string, action: () => Promise<string | null>, scope: NoticeScope = "accounts") {
    setBusy(key);
    setNotice(null);
    try {
      const text = await action();
      if (text) setNotice({ tone: "success", text, scope });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Не удалось выполнить запрос", scope });
    } finally {
      setBusy(null);
    }
  }

  async function connectTelegram(): Promise<string | null> {
    if (!telegram.config) throw new Error("Telegram ещё загружается. Попробуйте через пару секунд.");
    const data = await requestTelegramAuth(telegram.config);
    if (!data) return null;
    const result = await request("/api/user/linked-accounts/telegram", {
      method: "POST",
      body: JSON.stringify({ payload: data })
    });
    return result.messages === "blocked"
      ? "Telegram подключён. Чтобы получать уведомления, откройте бота и нажмите «Start»."
      : "Telegram подключён. Уведомления будут приходить от бота.";
  }

  function connect(method: LoginMethodId, scope: NoticeScope = "accounts") {
    if (method === "vk") {
      window.location.assign("/api/vk/link/start?return=profile");
      return;
    }
    if (method === "yandex") {
      void run(
        "connect:yandex",
        async () => {
          await request("/api/user/linked-accounts/link", { method: "POST", body: JSON.stringify({ provider: "yandex" }) });
          // Yandex skips its consent screen for an app it already trusts, so linking would happen
          // without a single question; force_confirm makes it show the account and ask every time.
          await signIn("yandex", { callbackUrl: "/dashboard/profile" }, { force_confirm: "yes" });
          return null;
        },
        scope
      );
      return;
    }
    if (method === "telegram") {
      void run("connect:telegram", connectTelegram, scope);
      return;
    }
    void run("connect:password", async () => {
      await request("/api/user/security/password-link", { method: "POST" });
      return `Ссылка для установки пароля отправлена на ${state?.notifications.email.address ?? "ваш email"}.`;
    });
  }

  function disconnect(method: LoginMethodId) {
    if (!window.confirm(DISCONNECT_WARNINGS[method])) return;
    void run(`disconnect:${method}`, async () => {
      await request(`/api/user/linked-accounts?method=${method}`, { method: "DELETE" });
      return `${METHOD_LABELS[method]}: отключено.`;
    });
  }

  function toggleChannel(channel: ChannelId, enabled: boolean) {
    // Optimistic: the switch moves at once and rolls back if the server refuses.
    setState((current) =>
      current
        ? { ...current, notifications: { ...current.notifications, [channel]: { ...current.notifications[channel], enabled } } }
        : current
    );
    void run(
      `toggle:${channel}`,
      async () => {
        await request("/api/user/notification-settings", { method: "PATCH", body: JSON.stringify({ channel, enabled }) });
        return null;
      },
      "notifications"
    );
  }

  async function enablePush(): Promise<string> {
    const key = state?.notifications.push.publicKey;
    if (!key || !pushSupported()) throw new Error("Этот браузер не поддерживает push-уведомления.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Разрешите уведомления для сайта в настройках браузера.");
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToArrayBuffer(key) }));
    await request("/api/dashboard/notifications/push-subscription", { method: "POST", body: JSON.stringify(subscription.toJSON()) });
    setDevicePush(true);
    return "Push-уведомления включены на этом устройстве.";
  }

  async function disablePush(): Promise<string> {
    const subscription = await currentPushSubscription();
    if (subscription) {
      await request("/api/dashboard/notifications/push-subscription", {
        method: "DELETE",
        body: JSON.stringify({ endpoint: subscription.endpoint })
      });
      await subscription.unsubscribe().catch(() => false);
    }
    setDevicePush(false);
    return "Push-уведомления выключены на этом устройстве.";
  }

  // The section never silently disappears: while loading or after an error it says so.
  if (!state) {
    return (
      <Card id="linked-accounts" className="scroll-mt-28">
        <CardContent className="space-y-4">
          <SectionHeader
            eyebrow="Связанные аккаунты"
            title="Способы входа и уведомления"
            description={
              loadFailed
                ? "Не удалось загрузить настройки. Обновите страницу через минуту."
                : "Загружаем подключённые аккаунты и каналы уведомлений…"
            }
            aside={
              loadFailed ? (
                <ActionButton onClick={() => void load()}>Повторить</ActionButton>
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-white/40" />
              )
            }
          />
          <span id="notifications" className="block scroll-mt-28" />
        </CardContent>
      </Card>
    );
  }

  const emailAddress = state.notifications.email.address;
  const methods: Array<{ id: LoginMethodId; icon: React.ReactNode; detail: string }> = [
    {
      id: "password",
      icon: (
        <BrandTile className="bg-white/[0.07] text-white/80">
          <KeyRound className="h-[18px] w-[18px]" />
        </BrandTile>
      ),
      detail: state.methods.password.connected
        ? `Email ${emailAddress ?? ""} и пароль`.replace("  ", " ")
        : emailAddress
          ? "Пароль не установлен — пришлём ссылку для установки"
          : "Сначала укажите email в разделе «Email и пароль»"
    },
    {
      id: "yandex",
      icon: <BrandTile className="bg-[#FC3F1D]/12"><YandexIcon /></BrandTile>,
      detail: state.methods.yandex.connected ? "Вход через аккаунт Яндекса" : "Вход через Яндекс без пароля"
    },
    {
      id: "vk",
      icon: <BrandTile className="bg-[#0077FF]/14"><VkIcon /></BrandTile>,
      detail: state.methods.vk.connected
        ? "Вход через VK и сообщения от сообщества"
        : "Вход через VK, бесплатный сингл и уведомления в сообщениях"
    },
    {
      id: "telegram",
      icon: <BrandTile className="bg-[#2AABEE]/14"><TelegramIcon /></BrandTile>,
      detail: state.methods.telegram.connected
        ? `Вход через Telegram и уведомления от бота${state.telegramBot ? ` @${state.telegramBot.username}` : ""}`
        : "Вход в один клик и уведомления от бота"
    }
  ];
  const connectedCount = methods.filter(({ id }) => state.methods[id].connected).length;

  const { email, vk, telegram: tg, push } = state.notifications;
  const botUrl = tg.botUsername ? `https://t.me/${tg.botUsername}` : null;

  return (
    <>
      <Card id="linked-accounts" className="scroll-mt-28">
        <CardContent className="space-y-5">
          <SectionHeader
            eyebrow="Связанные аккаунты"
            title="Способы входа"
            description="Чем можно войти в этот кабинет. Подключите несколько — если один сервис недоступен, войдёте через другой."
            aside={
              <span className="inline-flex h-8 items-center rounded-full border border-white/[0.1] bg-white/[0.04] px-3 text-[12.5px] font-semibold text-white/70">
                Подключено {connectedCount} из {methods.length}
              </span>
            }
          />

          <NoticeBox notice={notice?.scope === "notifications" ? null : notice} />

          <ul className="space-y-2.5">
            {methods.map(({ id, icon, detail }) => {
              const method = state.methods[id];
              const pending = busy === `connect:${id}` || busy === `disconnect:${id}`;
              const onlyMethod = method.connected && !method.canDisconnect;
              return (
                <li key={id} className={ROW}>
                  <div className="flex min-w-0 flex-1 items-center gap-3.5">
                    {icon}
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[15px] font-semibold text-white">
                        {METHOD_LABELS[id]}
                        {method.connected ? <ConnectedBadge /> : null}
                      </p>
                      <p className="mt-0.5 break-words text-[13px] text-white/52">{detail}</p>
                      {onlyMethod ? (
                        <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-amber-200/85">
                          <Lock className="mt-[2px] h-3.5 w-3.5 shrink-0" />
                          Единственный способ входа — отключить нельзя. Сначала подключите другой или установите пароль.
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:justify-end">
                    {method.connected ? (
                      <ActionButton variant="ghost" disabled={busy !== null || onlyMethod} onClick={() => disconnect(id)}>
                        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Отключить
                      </ActionButton>
                    ) : method.available ? (
                      <ActionButton
                        variant="primary"
                        disabled={busy !== null || (id === "telegram" && !telegram.ready)}
                        onClick={() => connect(id)}
                      >
                        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        {id === "password" ? "Установить пароль" : "Подключить"}
                      </ActionButton>
                    ) : (
                      <span className="text-[12.5px] text-white/40">
                        {state.isAdmin && id !== "password" ? "Только вход по паролю" : "Недоступно"}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card id="notifications" className="scroll-mt-28">
        <CardContent className="space-y-5">
          <SectionHeader
            eyebrow="Уведомления"
            title="Куда приходят уведомления"
            description="Статусы релизов, отчёты, начисления и ответы поддержки. Включите удобные каналы — в колокольчике кабинета уведомления видны всегда."
          />

          <NoticeBox notice={notice?.scope === "notifications" ? notice : null} />

          <ul className="space-y-2.5">
            <ChannelRow
              icon={<BrandTile className="bg-white/[0.07] text-white/80"><Mail className="h-[18px] w-[18px]" /></BrandTile>}
              title="Email"
              detail={
                email.status === "missing"
                  ? "Email не указан — укажите его, чтобы получать письма."
                  : !email.enabled
                    ? `Выключено. Письма на ${email.address} не приходят.`
                    : email.status === "unverified"
                      ? `Приходят на ${email.address}. Адрес не подтверждён.`
                      : `Приходят на ${email.address}.`
              }
              tone={email.status === "missing" ? "off" : !email.enabled ? "off" : email.status === "unverified" ? "warn" : "ok"}
              toggle={
                email.status === "missing"
                  ? null
                  : { checked: email.enabled, onChange: (value) => toggleChannel("email", value), disabled: busy !== null }
              }
            >
              {email.status !== "active" ? (
                <ActionLink href="#security">{email.status === "missing" ? "Указать email" : "Подтвердить"}</ActionLink>
              ) : null}
            </ChannelRow>

            <ChannelRow
              icon={<BrandTile className="bg-[#0077FF]/14"><VkIcon /></BrandTile>}
              title="Сообщения ВКонтакте"
              detail={
                vk.status === "unavailable"
                  ? "Канал временно недоступен."
                  : vk.status === "not_linked"
                    ? "Подключите VK ID, чтобы получать сообщения от сообщества ICE CREAM MUSIC."
                    : !vk.enabled
                      ? "Выключено. Сообщения от сообщества не приходят."
                      : vk.status === "not_allowed"
                        ? "Разрешите сообщения от сообщества в чате VK, затем нажмите «Проверить»."
                        : "Приходят в личные сообщения от сообщества ICE CREAM MUSIC."
              }
              tone={vk.status === "active" && vk.enabled ? "ok" : vk.status === "not_allowed" && vk.enabled ? "warn" : "off"}
              toggle={
                vk.status === "active" || vk.status === "not_allowed"
                  ? { checked: vk.enabled, onChange: (value) => toggleChannel("vk", value), disabled: busy !== null }
                  : null
              }
            >
              {vk.status === "not_allowed" && vk.enabled ? (
                <>
                  <ActionLink href={VK_COMMUNITY_CHAT_URL} external>Разрешить</ActionLink>
                  <ActionButton
                    disabled={busy !== null}
                    onClick={() =>
                      void run(
                        "check:vk",
                        async () => {
                          const result = await request("/api/vk/messages", { method: "POST" });
                          return result.allowed ? "Сообщения от сообщества разрешены." : "Сообщения пока не разрешены.";
                        },
                        "notifications"
                      )
                    }
                  >
                    {busy === "check:vk" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Проверить
                  </ActionButton>
                </>
              ) : vk.status === "not_linked" && state.methods.vk.available ? (
                <ActionButton variant="primary" disabled={busy !== null} onClick={() => connect("vk", "notifications")}>
                  <Plus className="h-3.5 w-3.5" />
                  Подключить VK
                </ActionButton>
              ) : null}
            </ChannelRow>

            <ChannelRow
              icon={<BrandTile className="bg-[#2AABEE]/14"><TelegramIcon /></BrandTile>}
              title="Telegram"
              detail={
                tg.status === "unavailable"
                  ? "Канал временно недоступен."
                  : tg.status === "not_linked"
                    ? "Подключите Telegram, чтобы бот присылал новости вашего кабинета."
                    : !tg.enabled
                      ? "Выключено. Бот не присылает уведомления."
                      : tg.status === "not_allowed"
                        ? "Бот не может вам написать: откройте его, нажмите «Start» и проверьте."
                        : `Приходят от бота${tg.botUsername ? ` @${tg.botUsername}` : ""}.`
              }
              tone={tg.status === "active" && tg.enabled ? "ok" : tg.status === "not_allowed" && tg.enabled ? "warn" : "off"}
              toggle={
                tg.status === "active" || tg.status === "not_allowed"
                  ? { checked: tg.enabled, onChange: (value) => toggleChannel("telegram", value), disabled: busy !== null }
                  : null
              }
            >
              {tg.status === "not_allowed" && tg.enabled ? (
                <>
                  {botUrl ? <ActionLink href={botUrl} external>Открыть бота</ActionLink> : null}
                  <ActionButton
                    disabled={busy !== null}
                    onClick={() =>
                      void run(
                        "check:telegram",
                        async () => {
                          const result = await request("/api/user/linked-accounts/telegram", { method: "PATCH" });
                          return result.allowed
                            ? "Бот может писать вам. Мы отправили проверочное сообщение."
                            : "Бот пока не может написать.";
                        },
                        "notifications"
                      )
                    }
                  >
                    {busy === "check:telegram" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Проверить
                  </ActionButton>
                </>
              ) : tg.status === "not_linked" && state.methods.telegram.available ? (
                <ActionButton
                  variant="primary"
                  disabled={busy !== null || !telegram.ready}
                  onClick={() => connect("telegram", "notifications")}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Подключить Telegram
                </ActionButton>
              ) : null}
            </ChannelRow>

            <ChannelRow
              icon={<BrandTile className="bg-[#7c6cff]/14 text-[#c7bcff]"><Smartphone className="h-[18px] w-[18px]" /></BrandTile>}
              title="Push-уведомления"
              detail={
                push.status === "unavailable"
                  ? "Push-уведомления временно недоступны."
                  : devicePush === null
                    ? "Этот браузер не поддерживает push-уведомления."
                    : devicePush
                      ? `Включены на этом устройстве${push.devices > 1 ? ` и ещё на ${push.devices - 1}` : ""}.`
                      : push.devices > 0
                        ? `На этом устройстве выключены. Включены на других: ${push.devices}.`
                        : "Всплывающие уведомления в браузере на компьютере или телефоне."
              }
              tone={devicePush ? "ok" : "off"}
              toggle={
                push.status !== "unavailable" && devicePush !== null
                  ? {
                      checked: devicePush,
                      onChange: (value) => void run("push", value ? enablePush : disablePush, "notifications"),
                      disabled: busy !== null
                    }
                  : null
              }
            />
          </ul>

          <p className="text-[12.5px] leading-5 text-white/40">
            Письма о безопасности — ссылки для восстановления пароля и подтверждения email — приходят всегда, даже если email-уведомления выключены.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  aside
}: {
  eyebrow: string;
  title: string;
  description: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c7bcff]">{eyebrow}</p>
        <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-white">{title}</h2>
        <p className="mt-2 max-w-[640px] text-[14px] leading-6 text-white/58">{description}</p>
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

function NoticeBox({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <div
      className={cn(
        notice.tone === "error"
          ? "border-rose-400/25 bg-rose-500/10 text-rose-100"
          : "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",
        "rounded-[16px] border px-4 py-3 text-[13.5px] font-medium"
      )}
      role={notice.tone === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {notice.text}
    </div>
  );
}

const ROW =
  "flex flex-col gap-3 rounded-[20px] border border-white/[0.08] bg-white/[0.03] px-4 py-3.5 transition-colors hover:border-white/[0.12] sm:flex-row sm:items-center sm:gap-4 sm:px-5";

function ChannelRow({
  icon,
  title,
  detail,
  tone,
  toggle,
  children
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  tone: "ok" | "warn" | "off";
  toggle: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean } | null;
  children?: React.ReactNode;
}) {
  return (
    <li className={ROW}>
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        {icon}
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-white">{title}</p>
          <p
            className={cn(
              "mt-0.5 flex items-start gap-1.5 break-words text-[13px]",
              tone === "ok" && "text-emerald-300/90",
              tone === "warn" && "text-amber-200/90",
              tone === "off" && "text-white/50"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full",
                tone === "ok" && "bg-emerald-400",
                tone === "warn" && "bg-amber-300",
                tone === "off" && "bg-white/25"
              )}
            />
            {detail}
          </p>
        </div>
      </div>
      {children || toggle ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {children}
          {toggle ? <Switch label={title} {...toggle} /> : null}
        </div>
      ) : null}
    </li>
  );
}

function Switch({
  checked,
  onChange,
  label,
  disabled
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label}: ${checked ? "включено" : "выключено"}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative ml-1 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "bg-emerald-500" : "bg-white/[0.14]"
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] h-[18px] w-[18px] rounded-full shadow transition-all",
          checked ? "left-[23px] bg-white" : "left-[3px] bg-white/70"
        )}
      />
    </button>
  );
}

function BrandTile({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] ring-1 ring-white/[0.08]", className)}>
      {children}
    </span>
  );
}

function ConnectedBadge() {
  return (
    <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-emerald-500/12 px-2 text-[11.5px] font-semibold text-emerald-300 ring-1 ring-emerald-400/20">
      <Check className="h-3 w-3" />
      Подключён
    </span>
  );
}

const ACTION_BASE =
  "inline-flex h-9 items-center gap-1.5 rounded-[12px] px-3.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-45";
const ACTION_VARIANTS = {
  default: "border border-white/[0.12] bg-white/[0.06] text-white hover:border-white/[0.24] hover:bg-white/[0.1]",
  primary: "bg-white text-[#14121f] hover:bg-white/90",
  ghost: "border border-white/[0.1] text-white/70 hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-100"
} as const;

function ActionButton({
  children,
  variant = "default",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode; variant?: keyof typeof ACTION_VARIANTS }) {
  return (
    <button type="button" className={cn(ACTION_BASE, ACTION_VARIANTS[variant], className)} {...props}>
      {children}
    </button>
  );
}

function ActionLink({ href, external, children }: { href: string; external?: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className={cn(ACTION_BASE, ACTION_VARIANTS.default)}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {children}
    </a>
  );
}
