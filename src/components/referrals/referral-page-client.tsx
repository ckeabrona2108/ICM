"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Gift, Send } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  nextLadderHint,
  REFERRAL_DISCOUNT_PERCENT,
  REFERRAL_LADDER,
  type ReferralFriendStatus,
  type ReferralOverview
} from "@/lib/referral-shared";

const STATUS: Record<ReferralFriendStatus, { label: (dueAt: string | null) => string; className: string }> = {
  registered: { label: () => "Ждём оплаты", className: "border-white/15 bg-white/[0.06] text-white/65" },
  paid: {
    label: (dueAt) => {
      if (!dueAt) return "Оплачено ✓ · бонус скоро";
      const days = Math.max(1, Math.ceil((new Date(dueAt).getTime() - Date.now()) / 86_400_000));
      return `Оплачено ✓ · бонус через ${days} дн.`;
    },
    className: "border-amber-300/40 bg-amber-300/15 text-amber-200"
  },
  rewarded: { label: () => "Оплачено ✓ · бонус получен", className: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300" },
  revoked: { label: () => "Не засчитан", className: "border-rose-400/30 bg-rose-500/10 text-rose-200" }
};

function shareText(): string {
  return `Выпускай музыку на ICECREAMMUSIC — по моей ссылке скидка ${REFERRAL_DISCOUNT_PERCENT}% на первую оплату.`;
}

export function ReferralPageClient({ overview }: { overview: ReferralOverview }) {
  const router = useRouter();
  const [copied, setCopied] = React.useState(false);
  const [activating, setActivating] = React.useState<number | null>(null);
  const [activationError, setActivationError] = React.useState<string | null>(null);

  const activate = async (step: number) => {
    setActivating(step);
    setActivationError(null);
    try {
      const response = await fetch("/api/referrals/ladder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setActivationError(payload?.error ?? "Не удалось активировать");
        router.refresh();
        return;
      }
      // A full reload, so the plan in the top bar shows the new month too.
      window.location.reload();
    } finally {
      setActivating(null);
    }
  };
  const earnedRewards = overview.ladder.filter((rung) => rung.state !== "locked");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(overview.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Скопируйте ссылку", overview.link);
    }
  };

  const telegramHref = `https://t.me/share/url?url=${encodeURIComponent(overview.link)}&text=${encodeURIComponent(shareText())}`;
  const vkHref = `https://vk.com/share.php?url=${encodeURIComponent(overview.link)}&title=${encodeURIComponent(shareText())}`;
  const maxStep = REFERRAL_LADDER[REFERRAL_LADDER.length - 1]?.step ?? 5;
  const steps = [{ step: 1, label: "1 друг — бесплатный релиз", reached: overview.payingFriends >= 1 }, ...overview.ladder.map((rung) => ({
    step: rung.step,
    label: `${rung.step} ${rung.step < 5 ? "друга" : "друзей"} — ${rung.label}`,
    reached: rung.reached
  }))];
  const progress = Math.min(1, Math.max(0, (overview.payingFriends - 1) / (maxStep - 1)));
  const hint = nextLadderHint(overview.payingFriends);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <section className="rounded-[22px] border border-white/[0.08] bg-[#13151d] p-5">
          <p className="text-[17px] font-bold text-white">Твоя ссылка</p>
          <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
            <div className="flex h-12 min-w-0 flex-1 items-center rounded-[14px] border border-white/10 bg-white/[0.05] px-3.5 text-[14px] text-white/85">
              <span className="truncate">{overview.link.replace(/^https?:\/\//u, "")}</span>
            </div>
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-[14px] bg-white px-5 text-[14px] font-bold text-black transition hover:bg-white/90"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Скопировано" : "Скопировать"}
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <a
              href={telegramHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/12 px-3.5 text-[13px] text-white/80 transition hover:border-white/25 hover:text-white"
            >
              <Send className="h-3.5 w-3.5" />
              Telegram
            </a>
            <a
              href={vkHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center rounded-xl border border-white/12 px-3.5 text-[13px] text-white/80 transition hover:border-white/25 hover:text-white"
            >
              VK
            </a>
          </div>
        </section>

        <section className="rounded-[22px] border border-white/[0.08] bg-[linear-gradient(135deg,rgba(123,97,255,0.28),#13151d_70%)] p-5">
          <p className="text-[12px] font-bold tracking-[0.14em] text-white/55">БЕСПЛАТНЫХ РЕЛИЗОВ</p>
          <p className="mt-1 text-[44px] font-extrabold leading-[1.1] text-white">{overview.bonusBalance}</p>
          <p className="mt-1 text-[13px] text-white/55">Выбирается на последнем шаге при отправке нового релиза</p>
        </section>
      </div>

      <section className="rounded-[22px] border border-white/[0.08] bg-[#13151d] p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[17px] font-bold text-white">Лесенка бонусов</p>
          <p className="text-[13px] font-semibold text-[#c4b5fd]">
            {Math.min(overview.payingFriends, maxStep)} из {maxStep} оплативших друзей
          </p>
        </div>
        <div className="relative mt-5">
          <div className="absolute left-[16%] right-[16%] top-[16px] h-[3px] bg-white/[0.08]" />
          <div className="absolute left-[16%] top-[16px] h-[3px] bg-[#7b61ff]" style={{ width: `${68 * progress}%` }} />
          <div className="relative flex">
            {steps.map((item, index) => {
              const current = !item.reached && (index === 0 || steps[index - 1]?.reached);
              return (
                <div key={item.step} className="flex-1 text-center">
                  <div
                    className={cn(
                      "mx-auto grid h-[34px] w-[34px] place-items-center rounded-full text-[13px] font-bold",
                      item.reached
                        ? "bg-[#7b61ff] text-white"
                        : current
                          ? "border-2 border-[#7b61ff] bg-[#1d1b33] text-[#c4b5fd]"
                          : "bg-[#1f2130] text-white/50"
                    )}
                  >
                    {item.step}
                  </div>
                  <p className={cn("mt-2 px-1 text-[12.5px] font-semibold", item.reached || current ? "text-white" : "text-white/50")}>
                    {item.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
        <p className="mt-4 text-[13px] text-white/60">
          {hint ?? "Все ступени пройдены. За каждого нового оплатившего друга — бесплатный релиз."}
        </p>
        {earnedRewards.length > 0 ? (
          <div className="mt-4 space-y-2">
            {earnedRewards.map((rung) => (
              <div
                key={rung.step}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3",
                  rung.state === "available" ? "border-[#7b61ff]/45 bg-[#7b61ff]/10" : "border-white/[0.08] bg-white/[0.02]"
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Gift className={cn("h-5 w-5 shrink-0", rung.state === "available" ? "text-[#c4b5fd]" : "text-white/40")} />
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-white">
                      {rung.state === "available" ? `${rung.label[0]?.toUpperCase()}${rung.label.slice(1)} доступен` : `${rung.label[0]?.toUpperCase()}${rung.label.slice(1)} активирован`}
                    </p>
                    <p className="text-[12.5px] text-white/55">
                      {rung.state === "available"
                        ? "Включи, когда будет удобно: месяц добавится к текущей подписке."
                        : "Месяц уже добавлен к подписке."}
                    </p>
                  </div>
                </div>
                {rung.state === "available" ? (
                  <button
                    type="button"
                    disabled={activating !== null}
                    onClick={() => void activate(rung.step)}
                    className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-[13.5px] font-bold text-black transition hover:bg-white/90 disabled:opacity-60"
                  >
                    {activating === rung.step ? "Включаем…" : "Активировать"}
                  </button>
                ) : null}
              </div>
            ))}
            {activationError ? <p className="text-[12.5px] text-rose-300">{activationError}</p> : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-[22px] border border-white/[0.08] bg-[#13151d] p-5">
        <p className="mb-1 text-[17px] font-bold text-white">Твои друзья · {overview.friends.length}</p>
        {overview.friends.length === 0 ? (
          <p className="pt-2 text-[13.5px] text-white/55">
            Пока никого. Отправь ссылку другу — бонус придёт, когда он оплатит релиз или подписку.
          </p>
        ) : (
          overview.friends.map((friend, index) => {
            const status = STATUS[friend.status];
            return (
              <div key={`${friend.joinedAt}-${index}`} className="flex items-center gap-3 border-t border-white/[0.06] py-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#2b2d3a] font-bold text-white">
                  {friend.nickname.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-white">{friend.nickname}</p>
                  <p className="text-[12px] text-white/50">С нами с {new Date(friend.joinedAt).toLocaleDateString("ru-RU")}</p>
                </div>
                <span className={cn("whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11.5px] font-bold", status.className)}>
                  {status.label(friend.rewardDueAt)}
                </span>
              </div>
            );
          })
        )}
      </section>

      <p className="text-[12px] leading-5 text-white/40">
        Бонус начисляется через 14 дней после оплаты друга. Бесплатный первый сингл друга бонус не даёт —
        только оплата релиза или подписки.
      </p>
    </div>
  );
}
