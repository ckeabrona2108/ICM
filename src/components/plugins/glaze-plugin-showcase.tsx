import Image from "next/image";
import { ArrowUpRight, Check, ChevronDown } from "lucide-react";

import { GLAZE_PLUGINS } from "@/lib/glaze-plugins";
import { cn } from "@/lib/utils";

export function GlazePluginShowcase({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-6 lg:grid-cols-2", className)}>
      {GLAZE_PLUGINS.map((plugin, index) => (
        <article
          key={plugin.id}
          id={plugin.id}
          className="group flex flex-col overflow-hidden rounded-[30px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(17,18,28,0.94),rgba(9,11,20,0.94))] shadow-[0_30px_120px_-60px_rgba(59,130,246,0.55)] transition-colors hover:border-[#3b82f6]/30"
        >
          <div className="relative aspect-[16/10] overflow-hidden bg-[#05070d]">
            <Image
              src={plugin.image.src}
              alt={`${plugin.name} — интерфейс плагина`}
              fill
              priority={index === 0}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
            />
            <div className="absolute left-4 top-4 flex flex-wrap gap-2">
              {[...plugin.formats, ...plugin.platforms].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85 backdrop-blur-md"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-1 flex-col p-6 sm:p-8">
            <h3 className="text-[26px] font-bold tracking-tight text-white sm:text-[30px]">
              {plugin.name}
            </h3>
            <p className="mt-1 text-[15px] font-semibold text-[#7cb3ff]">{plugin.tagline}</p>
            <p className="mt-4 text-[15px] leading-relaxed text-white/62">{plugin.description}</p>

            <ul className="mt-5 space-y-2.5">
              {plugin.features.map((feature) => (
                <li key={feature} className="flex gap-3 text-[14px] leading-relaxed text-white/75">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#60a5fa]" strokeWidth={2.4} />
                  {feature}
                </li>
              ))}
            </ul>

            {plugin.sources ? (
              <details className="group mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] open:bg-white/[0.03]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[14px] text-white/75 transition-colors hover:text-white sm:px-5 [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className="font-semibold text-[#93c5fd]">Откуда качает:</span>{" "}
                    {plugin.sources[0].items.slice(0, 2).join(", ")} и ещё{" "}
                    {plugin.sources.reduce((sum, group) => sum + group.items.length, 0) - 2} площадок
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-white/50 transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-3 px-4 pb-4 sm:px-5 sm:pb-5">
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
                      {group.note ? (
                        <p className="mt-1.5 text-[11px] text-white/40">{group.note}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}

            <div className="mt-auto flex flex-col items-center pt-8 text-center">
              <a
                href={plugin.purchaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(90deg,#2563eb,#6d5dfc)] px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_14px_40px_-12px_rgba(59,130,246,0.8)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 sm:w-auto"
              >
                Купить {plugin.name}
                <ArrowUpRight className="h-4 w-4" />
              </a>
              <p className="mt-3 text-[13px] text-white/50">
                Промокод <span className="font-medium text-white/70">ICMSTUDIO</span> — скидка 25%
              </p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
