"use client";

import * as React from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SecurityState {
  email: string | null;
  emailVerified: boolean;
  pendingEmail: string | null;
  hasPassword: boolean;
  providers: { yandex: boolean; vk: boolean; telegram?: boolean };
}

type Notice = { tone: "success" | "error"; text: string } | null;

// Shown after the confirmation link redirects back with ?email=<status>.
const EMAIL_RESULT_NOTICES: Record<string, Notice> = {
  confirmed: { tone: "success", text: "Email подтверждён." },
  expired: { tone: "error", text: "Ссылка для подтверждения устарела. Отправьте письмо ещё раз." },
  invalid: { tone: "error", text: "Ссылка для подтверждения недействительна." },
  taken: { tone: "error", text: "Этот email уже занят другим аккаунтом." }
};

async function postJson(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "Не удалось выполнить запрос");
  }
  return payload ?? {};
}

export function AccountSecurityCard() {
  const [state, setState] = React.useState<SecurityState | null>(null);
  const [notice, setNotice] = React.useState<Notice>(null);
  const [busy, setBusy] = React.useState<"email" | "verify" | "password" | "link" | null>(null);
  const [emailFormOpen, setEmailFormOpen] = React.useState(false);
  const [emailForm, setEmailForm] = React.useState({ email: "", currentPassword: "" });
  const [passwordForm, setPasswordForm] = React.useState({ currentPassword: "", newPassword: "", confirmPassword: "" });

  const load = React.useCallback(async () => {
    const response = await fetch("/api/user/security", { cache: "no-store" });
    if (response.ok) setState((await response.json()) as SecurityState);
  }, []);

  React.useEffect(() => {
    void load();
    const url = new URL(window.location.href);
    const result = url.searchParams.get("email");
    if (result && EMAIL_RESULT_NOTICES[result]) {
      setNotice(EMAIL_RESULT_NOTICES[result]);
      url.searchParams.delete("email");
      window.history.replaceState(null, "", url.toString());
    }
  }, [load]);

  async function run(kind: NonNullable<typeof busy>, action: () => Promise<string>) {
    setBusy(kind);
    setNotice(null);
    try {
      setNotice({ tone: "success", text: await action() });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Не удалось выполнить запрос" });
    } finally {
      setBusy(null);
    }
  }

  if (!state) return null;


  return (
    <Card id="security" className="scroll-mt-28">
      <CardContent className="space-y-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c7bcff]">Безопасность</p>
          <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-white">Email и пароль</h2>
          <p className="mt-2 text-[14px] leading-6 text-white/58">
            На email приходят письма о релизах и ссылки для восстановления доступа. Пароль нужен для входа по email.
          </p>
        </div>

        {notice ? (
          <div
            className={cn(
              notice.tone === "error" ? "ux-error text-rose-100" : "ux-surface-soft border-emerald-400/24 bg-emerald-500/10 text-emerald-100",
              "rounded-[22px] px-4 py-3 text-sm font-medium"
            )}
            role={notice.tone === "error" ? "alert" : "status"}
            aria-live="polite"
          >
            {notice.text}
          </div>
        ) : null}

        <section className="ux-surface-soft space-y-4 rounded-[24px] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <h3 className="text-[18px] font-semibold text-white">Email</h3>
              <p className="break-all text-[14px] text-white/80">{state.email ?? "Не указан"}</p>
              <p className={cn("text-[13px]", state.emailVerified ? "text-emerald-300" : "text-amber-200/90")}>
                {state.email ? (state.emailVerified ? "Подтверждён" : "Не подтверждён") : "Укажите email, чтобы восстанавливать доступ"}
              </p>
              {state.pendingEmail ? (
                <p className="text-[13px] text-white/56">
                  Письмо для подтверждения отправлено на <span className="text-white/80">{state.pendingEmail}</span>
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {state.email && !state.emailVerified ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-full px-4 text-[13px] font-semibold"
                  disabled={busy !== null}
                  onClick={() =>
                    void run("verify", async () => {
                      await postJson("/api/user/security/email", { email: state.email });
                      return `Письмо для подтверждения отправлено на ${state.email}.`;
                    })
                  }
                >
                  {busy === "verify" ? "Отправляем..." : "Подтвердить"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-full px-4 text-[13px] font-semibold"
                onClick={() => setEmailFormOpen((open) => !open)}
              >
                {state.email ? "Изменить" : "Указать email"}
              </Button>
            </div>
          </div>

          {emailFormOpen ? (
            <form
              className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                void run("email", async () => {
                  await postJson("/api/user/security/email", {
                    email: emailForm.email,
                    currentPassword: state.hasPassword ? emailForm.currentPassword : undefined
                  });
                  setEmailFormOpen(false);
                  setEmailForm({ email: "", currentPassword: "" });
                  return `Мы отправили ссылку на ${emailForm.email.trim()}. Email сменится, когда вы её откроете.`;
                });
              }}
            >
              <Field label="Новый email" htmlFor="security-email">
                <Input
                  id="security-email"
                  type="email"
                  autoComplete="email"
                  value={emailForm.email}
                  onChange={(event) => setEmailForm((form) => ({ ...form, email: event.target.value }))}
                  placeholder="you@example.com"
                />
              </Field>
              {state.hasPassword ? (
                <Field label="Текущий пароль" htmlFor="security-email-password">
                  <Input
                    id="security-email-password"
                    type="password"
                    autoComplete="current-password"
                    value={emailForm.currentPassword}
                    onChange={(event) => setEmailForm((form) => ({ ...form, currentPassword: event.target.value }))}
                  />
                </Field>
              ) : (
                <div className="hidden md:block" />
              )}
              <button
                type="submit"
                disabled={busy !== null || !emailForm.email.trim()}
                className="ux-button-primary inline-flex h-11 items-center justify-center rounded-[18px] px-6 text-[14px] font-semibold text-white disabled:opacity-50"
              >
                {busy === "email" ? "Отправляем..." : "Отправить ссылку"}
              </button>
            </form>
          ) : null}
        </section>

        <section className="ux-surface-soft space-y-4 rounded-[24px] p-4 sm:p-5">
          <div className="space-y-1">
            <h3 className="text-[18px] font-semibold text-white">Пароль</h3>
            <p className="text-[14px] leading-6 text-white/56">
              {state.hasPassword
                ? "После смены пароля мы пришлём уведомление на email."
                : "Сейчас вы входите только через Яндекс, VK или Telegram. Установите пароль, чтобы входить и по email."}
            </p>
          </div>

          {state.hasPassword ? (
            <form
              className="grid gap-4 md:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                void run("password", async () => {
                  await postJson("/api/user/security/password", passwordForm);
                  setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
                  return "Пароль изменён.";
                });
              }}
            >
              <Field label="Текущий пароль" htmlFor="security-current-password">
                <Input
                  id="security-current-password"
                  type="password"
                  autoComplete="current-password"
                  value={passwordForm.currentPassword}
                  onChange={(event) => setPasswordForm((form) => ({ ...form, currentPassword: event.target.value }))}
                />
              </Field>
              <Field label="Новый пароль" htmlFor="security-new-password">
                <Input
                  id="security-new-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Минимум 8 символов"
                  value={passwordForm.newPassword}
                  onChange={(event) => setPasswordForm((form) => ({ ...form, newPassword: event.target.value }))}
                />
              </Field>
              <Field label="Повторите пароль" htmlFor="security-confirm-password">
                <Input
                  id="security-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) => setPasswordForm((form) => ({ ...form, confirmPassword: event.target.value }))}
                />
              </Field>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between md:col-span-3">
                <button
                  type="button"
                  className="text-left text-[13px] text-white/56 underline-offset-4 hover:text-white hover:underline disabled:opacity-50"
                  disabled={busy !== null || !state.email}
                  onClick={() =>
                    void run("link", async () => {
                      await postJson("/api/user/security/password-link");
                      return `Ссылка для сброса пароля отправлена на ${state.email}.`;
                    })
                  }
                >
                  Не помню текущий пароль
                </button>
                <button
                  type="submit"
                  disabled={busy !== null}
                  className="ux-button-primary inline-flex h-11 items-center justify-center rounded-[18px] px-6 text-[14px] font-semibold text-white disabled:opacity-50"
                >
                  {busy === "password" ? "Сохраняем..." : "Сменить пароль"}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[13px] text-white/48">
                {state.email
                  ? `Пришлём ссылку для установки пароля на ${state.email}.`
                  : "Сначала укажите email — ссылка придёт на него."}
              </p>
              <button
                type="button"
                disabled={busy !== null || !state.email}
                className="ux-button-primary inline-flex h-11 items-center justify-center rounded-[18px] px-6 text-[14px] font-semibold text-white disabled:opacity-50"
                onClick={() =>
                  void run("link", async () => {
                    await postJson("/api/user/security/password-link");
                    return `Ссылка для установки пароля отправлена на ${state.email}.`;
                  })
                }
              >
                {busy === "link" ? "Отправляем..." : "Установить пароль"}
              </button>
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/44">
        {label}
      </Label>
      {children}
    </div>
  );
}
