import type { Metadata } from "next";

import { IcmHeader } from "@/components/landing/icm-header";
import { LandingScrollUnlock } from "@/components/landing/landing-scroll-unlock";
import { ReferralRulesContent } from "@/components/referrals/referral-rules-content";
import { REFERRAL_RULES_EDITION } from "@/lib/referral-rules";

export const metadata: Metadata = {
  title: "Правила программы «Пригласи друга»",
  description: "Условия реферальной программы ICECREAMMUSIC: скидка другу, бонусные релизы, что разрешено и что запрещено.",
  alternates: { canonical: "/referral-rules" },
  robots: { index: false, follow: true }
};

export default function ReferralRulesPage() {
  return (
    <main className="relative min-h-screen w-full max-w-full overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(94,76,255,0.16),transparent_30%),linear-gradient(180deg,#0a0b12_0%,#0a0b12_60%,#090a10_100%)] text-white">
      <LandingScrollUnlock />
      <IcmHeader />
      <article className="mx-auto max-w-3xl px-4 pb-20 pt-28 sm:px-8 sm:pt-36">
        <h1 className="text-balance text-center text-[24px] font-semibold leading-tight tracking-[-0.02em] sm:text-[30px]">
          Правила реферальной программы «Пригласи друга»
        </h1>
        <p className="mb-10 mt-2 text-center text-[13.5px] text-white/50">{REFERRAL_RULES_EDITION}</p>
        <ReferralRulesContent />
      </article>
    </main>
  );
}
