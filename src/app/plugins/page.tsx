import type { Metadata } from "next";

import { IcmHeader } from "@/components/landing/icm-header";
import { LandingScrollUnlock } from "@/components/landing/landing-scroll-unlock";
import { GlazePluginShowcase } from "@/components/plugins/glaze-plugin-showcase";

const DESCRIPTION =
  "GLAZE Vocal и GLAZE Downloader — плагины для артистов и битмейкеров. VST3/AU для macOS и Windows. Покупка без регистрации.";

export const metadata: Metadata = {
  title: "Плагины GLAZE",
  description: DESCRIPTION,
  alternates: {
    canonical: "/plugins"
  },
  openGraph: {
    type: "website",
    url: "/plugins",
    title: "Плагины GLAZE",
    description: DESCRIPTION,
    images: [{ url: "/plugins/glaze-vocal.webp", width: 1536, height: 1024 }]
  }
};

export default function PluginsPage() {
  return (
    <main className="relative min-h-screen w-full max-w-full overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(37,99,235,0.22),transparent_30%),linear-gradient(180deg,#070910_0%,#0a0b12_60%,#090a10_100%)] text-white">
      <LandingScrollUnlock />
      <IcmHeader />

      <section className="mx-auto max-w-7xl px-4 pb-20 pt-28 sm:px-8 sm:pt-36">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full border border-[#3b82f6]/30 bg-[#3b82f6]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#93c5fd]">
            GLAZE Audio Plugins
          </span>
          <h1 className="mt-5 text-balance text-[40px] font-bold leading-[1.04] tracking-[-0.02em] sm:text-[56px] lg:text-[64px]">
            Плагины, которые{" "}
            <span className="bg-gradient-to-r from-[#93c5fd] via-[#3b82f6] to-[#7b61ff] bg-clip-text text-transparent">
              экономят часы в студии
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-white/62 sm:text-[17px]">
            Чистый вокал одной ручкой и любой бит с YouTube прямо в проекте. Работают в FL Studio,
            Ableton, Logic и других DAW.
          </p>
        </div>

        <GlazePluginShowcase className="mt-14" />
      </section>
    </main>
  );
}
