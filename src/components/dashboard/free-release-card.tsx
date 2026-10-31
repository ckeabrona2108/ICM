"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, ChevronDown, Clock3, Gift, Loader2 } from "lucide-react";

import { VerificationAccessModal } from "@/components/verification/verification-access-modal";
import type { ContractStatusPayload } from "@/lib/contract-verification-shared";
import type { FreeReleaseStatus } from "@/lib/free-release-shared";
import { cn } from "@/lib/utils";

const VK_GROUP_URL = "https://vk.ru/icecreammusicru";

const VK_RESULT_MESSAGES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  linked: { tone: "ok", text: "ВКонтакте привязан, подписка на группу подтверждена." },
  linked_not_member: { tone: "warn", text: "ВКонтакте привязан. Подпишитесь на группу и нажмите «Проверить»." },
  cancelled: { tone: "warn", text: "Привязка ВКонтакте отменена." },
  expired: { tone: "warn", text: "Ссылка привязки устарела. Попробуйте ещё раз." },
  taken: { tone: "warn", text: "Этот аккаунт ВКонтакте уже привязан к другому кабинету." },
  failed: { tone: "warn", text: "ВКонтакте не подтвердил вход. Попробуйте ещё раз." },
  unavailable: { tone: "warn", text: "Привязка ВКонтакте временно недоступна." }
};

// A slim banner for the free first single on the cabinet overview: the offer and the progress
// in one line, the steps unfold below. Hidden once the offer no longer applies.
export function FreeReleaseCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = React.useState<FreeReleaseStatus | null>(null);
  const [open, setOpen] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [checkError, setCheckError] = React.useState<string | null>(null);
  const [contractStatus, setContractStatus] = React.useState<ContractStatusPayload | null>(null);

  const vkResultKey = searchParams.get("vk") ?? searchParams.get("vk_error");
  const vkResult = vkResultKey ? VK_RESULT_MESSAGES[vkResultKey] : undefined;

  const load = React.useCallback(async () => {
    const response = await fetch("/api/free-release", { cache: "no-store" }).catch(() => null);
    setStatus(response?.ok ? ((await response.json()) as FreeReleaseStatus) : null);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Someone who subscribed and came back without pressing "Проверить" still gets the step:
  // the subscription is re-checked quietly once per visit.
  const autoCheckedRef = React.useRef(false);
  React.useEffect(() => {
    if (autoCheckedRef.current || status?.state !== "locked") return;
    if (!status.steps.vkLinked || status.steps.groupMember) return;
    autoCheckedRef.current = true;
    void fetch("/api/vk/membership", { method: "POST" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { isMember?: boolean } | null) => {
        if (payload?.isMember) void load();
      })
      .catch(() => undefined);
  }, [status, load]);

  React.useEffect(() => {
    if (vkResult) setOpen(true);
  }, [vkResult]);

  const openContract = React.useCallback(async () => {
    const response = await fetch("/api/verification/contract/status", { cache: "no-store" }).catch(() => null);
    if (response?.ok) setContractStatus((await response.json()) as ContractStatusPayload);
  }, []);

  const checkMembership = React.useCallback(async () => {
    setChecking(true);
    setCheckError(null);
    try {
      const response = await fetch("/api/vk/membership", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { isMember?: boolean; error?: string } | null;
      if (!response.ok) setCheckError(payload?.error ?? "Не удалось проверить подписку.");
      else if (!payload?.isMember) setCheckError("Подписка пока не найдена. Подпишитесь на группу и проверьте ещё раз.");
      await load();
    } finally {
      setChecking(false);
    }
  }, [load]);

  if (!status) return null;
  if (status.state !== "available" && status.state !== "locked" && status.state !== "reserved") return null;

  const { steps } = status;
  const items = [
    {
      done: steps.contract,
      pending: steps.contractPending,
      title: "Договор",
      hint: steps.contractPending
        ? "Договор отправлен. Модератор проверит его, обычно в течение дня."
        : "Подпишите договор — модератор проверит его, обычно в течение дня.",
      action: (
        <button type="button" onClick={openContract} className={ACTION}>
          Подписать договор
        </button>
      )
    },
    {
      done: steps.vkLinked,
      pending: false,
      title: "ВКонтакте",
      hint: "Привяжите свой аккаунт ВКонтакте. Один аккаунт — один кабинет.",
      action: (
        <a href="/api/vk/link/start" className={ACTION}>
          Привязать ВКонтакте
        </a>
      )
    },
    {
      done: steps.groupMember,
      pending: false,
      title: "Подписка на группу",
      hint: "Подпишитесь на группу ICE CREAM MUSIC и нажмите «Проверить».",
      action: steps.vkLinked ? (
        <span className="flex flex-wrap gap-2">
          <a href={VK_GROUP_URL} target="_blank" rel="noreferrer" className={ACTION}>
            Открыть группу
          </a>
          <button type="button" onClick={checkMembership} disabled={checking} className={ACTION}>
            {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Проверить
          </button>
        </span>
      ) : (
        <span className="text-[12px] text-white/40">Сначала привяжите ВКонтакте</span>
      )
    }
  ];
  const doneCount = items.filter((item) => item.done).length;
  const reserved = status.state === "reserved";
  const available = status.state === "available";

  return (
    <section className="relative overflow-hidden rounded-[20px] border border-[#7b61ff]/30 bg-[linear-gradient(100deg,rgba(123,97,255,0.20),rgba(167,139,250,0.08)_55%,rgba(19,21,29,0.6))]">
      <div className="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full bg-[#7b61ff]/30 blur-3xl" />

      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-5">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#7b61ff]/20 text-[#c4b5fd] ring-1 ring-[#a78bfa]/25">
          <Gift className="h-[18px] w-[18px]" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold tracking-[-0.01em] text-white">
            Первый релиз — бесплатно
          </p>
          <p className="text-[12.5px] text-white/55">
            {reserved
              ? "Ваш бесплатный сингл на модерации."
              : available
                ? "Всё готово: выпустите сингл с одним треком без оплаты."
                : "Пройдите 3 шага и выпустите сингл без подписки и оплаты."}
          </p>
        </div>

        {reserved ? (
          status.releaseId ? (
            <Link href={`/dashboard/releases/${status.releaseId}`} className={PRIMARY}>
              Открыть релиз <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : null
        ) : available ? (
          <Link href="/dashboard/releases/new" className={PRIMARY}>
            Выпустить сингл <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <>
            <div className="flex items-center gap-1.5" aria-label={`Выполнено ${doneCount} из 3`}>
              {items.map((item) => (
                <span
                  key={item.title}
                  title={item.title}
                  className={cn(
                    "h-1.5 w-7 rounded-full",
                    item.done ? "bg-[#a78bfa]" : item.pending ? "bg-[#a78bfa]/45" : "bg-white/15"
                  )}
                />
              ))}
              <span className="ml-1 text-[12px] font-medium text-white/55">{doneCount}/3</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              className={PRIMARY}
            >
              {open ? "Свернуть" : "Пройти шаги"}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
            </button>
          </>
        )}
      </div>

      {vkResult ? (
        <p
          className={cn(
            "relative mx-4 mb-3 rounded-[12px] border px-3 py-2 text-[12.5px] sm:mx-5",
            vkResult.tone === "ok"
              ? "border-[#a78bfa]/30 bg-[#7b61ff]/12 text-[#e4dcff]"
              : "border-amber-400/25 bg-amber-500/10 text-amber-100"
          )}
        >
          {vkResult.text}
        </p>
      ) : null}

      {open && status.state === "locked" ? (
        <div className="relative border-t border-white/[0.06] px-4 pb-4 pt-3 sm:px-5">
          <ol className="grid gap-2 md:grid-cols-3">
            {items.map((item, index) => (
              <li
                key={item.title}
                className={cn(
                  "flex flex-col gap-2.5 rounded-[14px] border px-3.5 py-3",
                  item.done || item.pending ? "border-[#a78bfa]/25 bg-[#7b61ff]/[0.08]" : "border-white/[0.08] bg-black/25"
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      item.done ? "bg-[#a78bfa] text-[#140d2e]" : "border border-white/25 text-white/60"
                    )}
                  >
                    {item.done ? <Check className="h-3 w-3" strokeWidth={3} /> : index + 1}
                  </span>
                  <p className="text-[13.5px] font-semibold text-white">{item.title}</p>
                  {item.done ? <span className="ml-auto text-[11.5px] text-[#c4b5fd]">Готово</span> : null}
                  {item.pending ? (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-400/12 px-2 py-0.5 text-[11.5px] font-medium text-amber-200">
                      <Clock3 className="h-3 w-3" /> На проверке
                    </span>
                  ) : null}
                </div>
                {!item.done ? (
                  <>
                    <p className="text-[12.5px] leading-5 text-white/50">{item.hint}</p>
                    {!item.pending ? <div>{item.action}</div> : null}
                  </>
                ) : null}
              </li>
            ))}
          </ol>
          {checkError ? <p className="mt-2.5 text-[12.5px] text-amber-200">{checkError}</p> : null}
          {status.reason ? <p className="mt-2.5 text-[12.5px] text-amber-200">{status.reason}</p> : null}
        </div>
      ) : null}

      {contractStatus ? (
        <VerificationAccessModal
          open
          status={contractStatus}
          forceOpenContract
          onClose={() => {
            setContractStatus(null);
            router.refresh();
            void load();
          }}
        />
      ) : null}
    </section>
  );
}

const PRIMARY =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[12px] bg-[var(--ux-accent)] px-3.5 text-[13px] font-semibold text-white shadow-[0_8px_24px_-10px_rgba(123,97,255,0.8)] transition-colors hover:bg-[var(--ux-accent-strong)]";

const ACTION =
  "inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-white/[0.12] bg-white/[0.06] px-3 text-[12.5px] font-semibold text-white transition-colors hover:border-white/[0.24] hover:bg-white/[0.1] disabled:opacity-60";
