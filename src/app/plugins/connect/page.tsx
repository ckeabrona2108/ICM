"use client";

import * as React from "react";
import { signOut } from "next-auth/react";
import { CheckCircle2, Loader2, MonitorSmartphone } from "lucide-react";

import { Button } from "@/components/ui/button";

type LinkInfo = { code: string; deviceName: string; product: string; confirmed: boolean };
type ViewState =
  | { kind: "loading" }
  | { kind: "ready"; link: LinkInfo }
  | { kind: "done" }
  | { kind: "error"; message: string };

function readCode() {
  return new URLSearchParams(window.location.search).get("code") ?? "";
}

/** Подтверждение входа в плагин GLAZE для пользователя, вошедшего на сайте (VK, Telegram, Яндекс, почта). */
export default function PluginConnectPage() {
  const [state, setState] = React.useState<ViewState>({ kind: "loading" });
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const code = readCode();
    if (!code) {
      setState({ kind: "error", message: "Ссылка неполная. Нажмите «Continue in browser» в плагине ещё раз." });
      return;
    }
    fetch(`/api/plugins/link/confirm?code=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          const back = `/plugins/connect?code=${encodeURIComponent(code)}`;
          window.location.href = `/login?callbackUrl=${encodeURIComponent(back)}`;
          return;
        }
        const data = await response.json();
        if (!response.ok) setState({ kind: "error", message: data.error ?? "Не удалось открыть заявку" });
        else setState(data.confirmed ? { kind: "done" } : { kind: "ready", link: data });
      })
      .catch(() => setState({ kind: "error", message: "Нет связи с сервером" }));
  }, []);

  async function confirm(code: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/plugins/link/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      const data = await response.json().catch(() => ({}));
      setState(response.ok ? { kind: "done" } : { kind: "error", message: data.error ?? "Не удалось подтвердить" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_50%_0%,rgba(37,99,235,0.22),transparent_35%),#080a10] px-4 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
        <span className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#93c5fd]">GLAZE Plugins</span>

        {state.kind === "loading" && <Loader2 className="mx-auto mt-8 h-8 w-8 animate-spin text-white/50" />}

        {state.kind === "ready" && (
          <>
            <MonitorSmartphone className="mx-auto mt-6 h-10 w-10 text-[#93c5fd]" />
            <h1 className="mt-4 text-2xl font-bold">Войти в плагин?</h1>
            <p className="mt-3 text-[15px] text-white/65">
              {state.link.product || "Плагин GLAZE"}
              {state.link.deviceName ? ` на устройстве «${state.link.deviceName}»` : ""} просит доступ к вашему аккаунту.
            </p>
            <p className="mt-5 text-[13px] text-white/50">Проверьте, что в окне плагина тот же код:</p>
            <p className="mt-1 font-mono text-3xl font-bold tracking-[0.2em]">{state.link.code}</p>
            <Button className="mt-7 h-12 w-full rounded-2xl text-[15px]" disabled={busy} onClick={() => confirm(state.link.code)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Подключить"}
            </Button>
            <button
              className="mt-4 text-[13px] text-white/45 underline-offset-4 hover:underline"
              onClick={() => signOut({ callbackUrl: `/login?callbackUrl=${encodeURIComponent(window.location.pathname + window.location.search)}` })}
            >
              Это не мой аккаунт
            </button>
          </>
        )}

        {state.kind === "done" && (
          <>
            <CheckCircle2 className="mx-auto mt-6 h-12 w-12 text-emerald-400" />
            <h1 className="mt-4 text-2xl font-bold">Готово</h1>
            <p className="mt-3 text-[15px] text-white/65">Вернитесь в плагин — он подключится сам через пару секунд. Эту вкладку можно закрыть.</p>
          </>
        )}

        {state.kind === "error" && (
          <>
            <h1 className="mt-6 text-xl font-bold">Не получилось</h1>
            <p className="mt-3 text-[15px] text-white/65">{state.message}</p>
          </>
        )}
      </div>
    </main>
  );
}
