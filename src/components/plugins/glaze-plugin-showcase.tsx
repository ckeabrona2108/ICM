import Image from "next/image";
import { ArrowUpRight, Check, ChevronDown } from "lucide-react";

import { SpotlightCard } from "@/components/plugins/spotlight-card";
import { GLAZE_PLUGINS } from "@/lib/glaze-plugins";
import { cn } from "@/lib/utils";

export function GlazePluginShowcase({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-6", className)}>
      {GLAZE_PLUGINS.map((plugin, index) => {
        const reversed = index % 2 === 1;
        const sourcesCount = plugin.sources?.reduce((sum, group) => sum + group.items.length, 0) ?? 0;

        return (
          <SpotlightCard
            key={plugin.id}
            className="rounded-[30px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(17,19,30,0.96),rgba(10,12,20,0.96))] shadow-[0_30px_100px_-60px_rgba(59,130,246,0.6)] transition-colors hover:border-[#3b82f6]/25"
          >
            <article id={plugin.id} className="grid items-center gap-6 p-4 sm:p-5 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:p-6">
              <div className={cn("relative", reversed && "lg:order-2")}>
                <div className="relative aspect-[16/10] overflow-hidden rounded-[22px] border border-white/[0.06] bg-[#05070d]">
                  <Image
                    src={plugin.image.src}
                    alt={`${plugin.name} — интерфейс плагина`}
                    fill
                    priority={index === 0}
                    sizes="(min-width: 1024px) 45vw, 100vw"
                    className="object-cover transition-transform duration-700 ease-out group-hover/spot:scale-[1.04]"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(5,7,13,0.55))]" />
                </div>
                <div
                  aria-hidden
                  className="pointer-events-none absolute -inset-6 -z-10 rounded-[40px] bg-[#2563eb]/20 opacity-60 blur-3xl"
                />
              </div>

              <div className={cn("flex flex-col px-1 pb-2 sm:px-2 lg:py-4", reversed && "lg:order-1 lg:pl-4")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#93c5fd]">
                    {plugin.category}
                  </span>
                  <span className="h-1 w-1 rounded-full bg-white/25" />
                  <span className="text-[12px] font-medium text-white/45">
                    {[...plugin.formats, ...plugin.platforms].join(" · ")}
                  </span>
                </div>

                <h3 className="mt-3 text-[30px] font-bold tracking-[-0.03em] text-white sm:text-[34px]">{plugin.name}</h3>
                <p className="mt-1 text-[15px] font-semibold text-[#7cb3ff]">{plugin.tagline}</p>
                <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/60">{plugin.description}</p>

                <ul className="mt-5 grid gap-x-5 gap-y-2.5 sm:grid-cols-2">
                  {plugin.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-[14px] leading-snug text-white/80">
                      <span className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[#2563eb]/20 text-[#93c5fd]">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>

                {plugin.sources ? (
                  <details className="group/src mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] open:bg-white/[0.03]">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[14px] text-white/75 transition-colors hover:text-white [&::-webkit-details-marker]:hidden">
                      <span>
                        <span className="font-semibold text-[#93c5fd]">Откуда качает:</span>{" "}
                        {plugin.sources[0].items.slice(0, 2).join(", ")} и ещё {sourcesCount - 2} площадок
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-white/50 transition-transform group-open/src:rotate-180" />
                    </summary>
                    <div className="space-y-3 px-4 pb-4">
                      {plugin.sources.map((group) => (
                        <div key={group.title}>
                          <p className="text-[12px] font-medium text-white/45">{group.title}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {group.items.map((item) => (
                              <span
                                key={item}
                                className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[12px] text-white/75"
                              >
                                {item}
                              </span>
                            ))}
                          </div>
                          {group.note ? <p className="mt-1.5 text-[11px] text-white/40">{group.note}</p> : null}
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}

                <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <a
                    href={plugin.purchaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-[linear-gradient(90deg,#2563eb,#6d5dfc)] px-6 py-3 text-[15px] font-semibold text-white shadow-[0_14px_40px_-12px_rgba(59,130,246,0.8)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110"
                  >
                    Купить {plugin.name}
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                  <p className="text-[13px] text-white/50">
                    Промокод <span className="font-medium text-white/70">ICMSTUDIO</span> — скидка 25%
                  </p>
                </div>
              </div>
            </article>
          </SpotlightCard>
        );
      })}
    </div>
  );
}
