"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

function GuidelinesBody({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-2.5 text-[10px] leading-snug text-white/50", className)}>
      <section>
        <p className="mb-1 font-medium text-white/70">Точность</p>
        <ul className="list-disc space-y-0.5 pl-3.5">
          <li>Дословно, как поёт; орфография; имена с заглавной; одна строка = одно предложение.</li>
          <li>Строфа — двойной интервал между блоками строк.</li>
        </ul>
      </section>
      <section>
        <p className="mb-1 font-medium text-white/70">Пунктуация</p>
        <ul className="list-disc space-y-0.5 pl-3.5">
          <li>Без точки и запятой в конце строки; в конце допустимы ! ? « ».</li>
        </ul>
      </section>
      <section>
        <p className="mb-1 font-medium text-white/70">Не использовать</p>
        <ul className="list-disc space-y-0.5 pl-3.5">
          <li>Метки «Припев», «Хор», «Вступление»; лишние пробелы между куплетом и припевом.</li>
          <li>Символ «&» (в XML — &amp;); звуковые эффекты без слов.</li>
        </ul>
      </section>
      <section>
        <p className="mb-1 font-medium text-white/70">Бэк и числа</p>
        <ul className="list-disc space-y-0.5 pl-3.5">
          <li>Бэк в скобках в конце строки с заглавной; междометия текстом.</li>
          <li>Числа до десяти словами, больше 10 и годы — цифрами.</li>
        </ul>
      </section>
      <p className="border-t border-white/[0.06] pt-1.5 text-[9px] text-white/35">
        Исполнитель и название — как в ЛКПО. После выгрузки при доработке укажите модератору про синхронный текст.
      </p>
    </div>
  );
}

/** Свернутая справка по тексту (для компактной панели). */
export function KaraokeLyricsGuidelines({ compact }: { compact?: boolean }) {
  const [open, setOpen] = React.useState(false);

  if (compact) {
    return <GuidelinesBody className="py-1" />;
  }

  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] text-white/75 transition-colors hover:bg-white/[0.04]"
      >
        <span>Рекомендации по тексту для караоке</span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 opacity-60" /> : <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />}
      </button>
      {open ? (
        <div className="max-h-[min(50vh,320px)] overflow-y-auto border-t border-white/[0.06] px-3 py-2 text-[11px] leading-relaxed text-white/55">
          <GuidelinesBody className="space-y-4 text-[11px] leading-relaxed [&_section]:space-y-1 [&_ul]:space-y-1" />
        </div>
      ) : null}
    </div>
  );
}
