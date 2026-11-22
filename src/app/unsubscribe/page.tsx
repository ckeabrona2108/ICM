import type { Metadata } from "next";

import { findUnsubscribeUser } from "@/lib/marketing-optout";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Отписка от писем",
  robots: { index: false, follow: false }
};

// Opened from "Отписаться" in a campaign letter. Unsubscribing takes a button press, so mail
// scanners that open every link do not unsubscribe anyone by themselves.
export default async function UnsubscribePage({ searchParams }: { searchParams: { t?: string; done?: string } }) {
  const done = searchParams.done === "1";
  const userId = done ? null : await findUnsubscribeUser(prisma, searchParams.t);
  const action = userId ? `/api/unsubscribe?t=${encodeURIComponent(searchParams.t ?? "")}` : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0c12] px-4 py-16 text-white">
      <div className="w-full max-w-[420px] rounded-[24px] border border-white/[0.08] bg-[#15161d] p-7 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[#c7bcff]">ICECREAMMUSIC</p>
        {done ? (
          <>
            <h1 className="mt-4 text-[22px] font-semibold">Вы отписались</h1>
            <p className="mt-3 text-[15px] leading-6 text-white/65">
              Такие письма больше не придут. Письма о ваших релизах, выплатах и коды подтверждения будут приходить как раньше.
            </p>
          </>
        ) : action ? (
          <>
            <h1 className="mt-4 text-[22px] font-semibold">Отписаться от писем?</h1>
            <p className="mt-3 text-[15px] leading-6 text-white/65">
              Мы перестанем присылать новости и напоминания. Письма о ваших релизах, выплатах и коды подтверждения останутся.
            </p>
            <form method="post" action={action} className="mt-6">
              <button
                type="submit"
                className="w-full rounded-xl bg-[#7b61ff] px-4 py-3 text-[15px] font-semibold text-white transition hover:bg-[#8b74ff]"
              >
                Отписаться
              </button>
            </form>
            <a href="/" className="mt-3 inline-block text-[13px] text-white/50 hover:text-white/80">
              Нет, оставить
            </a>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-[22px] font-semibold">Ссылка недействительна</h1>
            <p className="mt-3 text-[15px] leading-6 text-white/65">
              Откройте ссылку «Отписаться» из письма ещё раз или напишите нам в поддержку.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
