"use client";

import * as React from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const DOCUMENT_VIEW_URL = "/api/verification/contract/document";
const PAGE_TEN_BACKGROUND_URL = "/docs/contract-page-10-source.png";
const PAGE_TEN_WIDTH = 1874;
const PAGE_TEN_HEIGHT = 1032;

type ContractImagePage = {
  pageNumber: number;
  imageUrl: string;
  ratio: number;
};

function ContractPage({
  imageUrl,
  ratio
}: {
  imageUrl: string;
  ratio: number;
}) {
  return (
    <div className="mx-auto w-full max-w-[1100px] overflow-hidden rounded-[2px] bg-white shadow-[0_24px_70px_-42px_rgba(0,0,0,0.8)]">
      <div
        aria-hidden
        className="w-full select-none bg-cover bg-top bg-no-repeat [image-rendering:auto] [pointer-events:none] [-webkit-user-drag:none] [-webkit-user-select:none]"
        style={{
          aspectRatio: `1 / ${ratio}`,
          backgroundImage: `url("${imageUrl}")`
        }}
      />
    </div>
  );
}

export function ContractViewer({
  className,
  onReadStateChange,
  readOnly = false,
  allowExternalOpen = true
}: {
  className?: string;
  onReadStateChange?: (readToEnd: boolean) => void;
  readOnly?: boolean;
  allowExternalOpen?: boolean;
}) {
  const [ready, setReady] = React.useState(false);
  const [loadError, setLoadError] = React.useState(false);
  const [pages, setPages] = React.useState<ContractImagePage[]>([]);
  const [isReadToEnd, setIsReadToEnd] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const response = await fetch(DOCUMENT_VIEW_URL, { method: "GET", cache: "no-store" });
        if (!response.ok) {
          throw new Error("document_load_failed");
        }
        const data = await response.arrayBuffer();
        if (!data.byteLength) {
          throw new Error("document_empty");
        }

        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        const loadingTask = pdfjs.getDocument({ data });
        const pdf = await loadingTask.promise;
        const parsedPages: ContractImagePage[] = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (pageNumber === 10) {
            parsedPages.push({
              pageNumber,
              imageUrl: PAGE_TEN_BACKGROUND_URL,
              ratio: PAGE_TEN_HEIGHT / PAGE_TEN_WIDTH
            });
            continue;
          }

          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.8 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) {
            throw new Error("canvas_context_unavailable");
          }

          await page
            .render({
              canvasContext: context,
              viewport
            })
            .promise;

          parsedPages.push({
            pageNumber,
            imageUrl: canvas.toDataURL("image/png"),
            ratio: viewport.height / viewport.width
          });
        }

        if (mounted) {
          setPages(parsedPages);
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
        className={cn(
          "overflow-y-auto rounded-2xl border border-white/12 bg-[#0a0f1c] [scroll-behavior:smooth]",
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
              {pages.map((page) => (
                <ContractPage
                  key={`contract-page-${page.pageNumber}`}
                  imageUrl={page.imageUrl}
                  ratio={page.ratio}
                />
              ))}
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
