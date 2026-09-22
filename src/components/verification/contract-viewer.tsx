"use client";

import * as React from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import type { ContractSignerFormData } from "@/lib/contract-verification-shared";
import { cn } from "@/lib/utils";
import { ContractSigningPage } from "@/components/verification/contract-signing-page";

const DOCUMENT_VIEW_URL = "/api/verification/contract/document";

type ContractTextPage = {
  number: number;
  text: string;
};

function splitContractParagraphs(text: string): string[] {
  return text
    .split(/(?<![\d.])(?=\d{1,2}\.(?:\d{1,2}\.)?\s)/gu)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function isSectionHeading(paragraph: string): boolean {
  return /^\d{1,2}\.\s+[А-ЯЁ0-9 ,;:«»"'()\-–—]+$/u.test(paragraph);
}

function ContractPage({
  page,
  contractNumber
}: {
  page: ContractTextPage;
  contractNumber: number | null;
}) {
  return (
    <section className="mx-auto w-full max-w-[860px] rounded-sm border border-slate-200 bg-white px-[20mm] py-[25mm] font-['Iowan_Old_Style','Baskerville','Times_New_Roman',serif] text-[15px] font-normal leading-[1.62] text-slate-900 antialiased shadow-[0_24px_70px_-42px_rgba(0,0,0,0.8)]">
      {page.number === 1 ? (
        <header className="mb-8 text-center">
          <p className="text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">ICECREAMMUSIC | Лицензионный договор</p>
          <h2 className="mt-8 text-[22px] font-bold uppercase tracking-[0.015em]">Лицензионный договор {contractNumber ? `№ ${contractNumber}` : "— номер будет присвоен после подписания"}</h2>
          <p className="mt-2 text-[13px] leading-relaxed">на использование объектов авторских и смежных прав и их цифровую дистрибуцию</p>
          <div className="mt-7 flex justify-between text-[14px] font-semibold"><span>г. Калининград</span><span>Дата появится после подписания</span></div>
        </header>
      ) : null}
      <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Страница {page.number}</p>
      {splitContractParagraphs(page.text).map((paragraph, index) => (
        <p
          key={`${page.number}-${index}`}
          className={cn(
            "mb-4 whitespace-pre-wrap text-justify font-normal tracking-[0.003em] [overflow-wrap:anywhere] last:mb-0",
            isSectionHeading(paragraph) ? "mt-7 font-bold uppercase tracking-[0.01em] [text-indent:0]" : "[text-indent:1.25cm]"
          )}
        >
          {paragraph}
        </p>
      ))}
    </section>
  );
}

export function ContractViewer({
  className,
  onReadStateChange,
  readOnly = false,
  allowExternalOpen = true,
  signerData,
  signatureDataUrl
}: {
  className?: string;
  onReadStateChange?: (readToEnd: boolean) => void;
  readOnly?: boolean;
  allowExternalOpen?: boolean;
  signerData?: Partial<ContractSignerFormData> | null;
  signatureDataUrl?: string | null;
}) {
  const [ready, setReady] = React.useState(false);
  const [loadError, setLoadError] = React.useState(false);
  const [pages, setPages] = React.useState<ContractTextPage[]>([]);
  const [contractNumber, setContractNumber] = React.useState<number | null>(null);
  const [pseudonym, setPseudonym] = React.useState<string | null>(null);
  const [isReadToEnd, setIsReadToEnd] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const response = await fetch(`${DOCUMENT_VIEW_URL}?format=json`, { method: "GET", cache: "no-store" });
        if (!response.ok) {
          throw new Error("document_load_failed");
        }
        const data = (await response.json()) as { pages?: ContractTextPage[]; contractNumber?: number | null; pseudonym?: string | null };
        if (!Array.isArray(data.pages) || data.pages.length === 0) {
          throw new Error("document_empty");
        }

        if (mounted) {
          setPages(data.pages);
          if (Number.isInteger(data.contractNumber) && (data.contractNumber ?? 0) >= 1534) {
            setContractNumber(data.contractNumber as number);
          }
          setPseudonym(data.pseudonym?.trim() || null);
          setLoadError(false);
        }
        if (mounted) setReady(true);
      } catch {
        if (mounted) {
          setLoadError(true);
          setReady(true);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleScroll = React.useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const reachedBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 5;
    setIsReadToEnd(reachedBottom);
    onReadStateChange?.(reachedBottom);
  }, [onReadStateChange]);

  React.useEffect(() => {
    handleScroll();
  }, [handleScroll, pages.length]);

  const preventCopy = (event: React.ClipboardEvent | React.DragEvent | React.MouseEvent) => {
    event.preventDefault();
  };

  const preventCopyShortcut = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
      event.preventDefault();
    }
  };

  return (
      <div className={cn("space-y-3", className)}>
      {!readOnly ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-5 py-3 text-[14px] leading-relaxed text-white/70">
          <span className="inline-flex items-center gap-1.5 [overflow-wrap:anywhere]">
            <ChevronDown className="h-3.5 w-3.5" />
            Прокрутите документ до конца
          </span>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onCopy={preventCopy}
        onCut={preventCopy}
        onDragStart={preventCopy}
        onContextMenu={preventCopy}
        onKeyDown={preventCopyShortcut}
        className={cn(
          "select-none overflow-y-auto rounded-2xl border border-white/12 bg-[#0a0f1c] [scroll-behavior:smooth]",
          readOnly ? "h-[50vh] p-2.5 sm:h-[52vh] sm:p-3" : "h-[68vh] p-4 sm:p-5"
        )}
      >
        <div className="mx-auto w-full max-w-[1120px] space-y-6 px-2 py-2 [overflow-wrap:anywhere] sm:px-4 sm:py-4">
          {!ready ? (
            <div className="grid min-h-[50vh] place-items-center rounded-2xl border border-white/10 bg-white/[0.03]">
              <div className="flex items-center gap-2 text-[14px] text-white/70">
                <Loader2 className="h-4 w-4 animate-spin" />
                Загружаем документ…
              </div>
            </div>
          ) : null}

          {ready && !loadError ? (
            <>
              {pages.filter((page) => page.number !== 10).map((page) => <ContractPage key={`contract-page-${page.number}`} page={page} contractNumber={contractNumber} />)}
              <ContractSigningPage signerData={signerData} signatureDataUrl={signatureDataUrl} pseudonym={pseudonym} />
            </>
          ) : null}

          {loadError ? (
            <div className="mx-auto w-full max-w-[1060px] rounded-2xl border border-rose-300/30 bg-rose-500/12 px-6 py-5">
              <p className="text-[15px] leading-relaxed text-rose-100 [overflow-wrap:anywhere]">
                {allowExternalOpen
                  ? "Не удалось загрузить документ. Попробуйте открыть его отдельно."
                  : "Не удалось загрузить документ. Попробуйте позже."}
              </p>
              {allowExternalOpen ? (
                <a
                  href={DOCUMENT_VIEW_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex rounded-xl border border-sky-200/35 bg-sky-400/10 px-4 py-2 text-[13px] font-medium text-sky-100 transition-colors hover:bg-sky-400/20"
                >
                  Открыть документ
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {!readOnly && !isReadToEnd ? (
        <p className="text-[14px] leading-relaxed text-amber-200/90 [overflow-wrap:anywhere]">Прокрутите документ до конца</p>
      ) : null}
    </div>
  );
}
