"use client";

import * as React from "react";
import { Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ContractViewer } from "@/components/verification/contract-viewer";

export function ContractReadOnlyModal({
  open,
  onClose,
  downloadHref,
  previewHref
}: {
  open: boolean;
  onClose: () => void;
  downloadHref?: string | null;
  previewHref?: string | null;
}) {
  React.useEffect(() => {
    if (!open) return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onClose, open]);

  const [previewHtml, setPreviewHtml] = React.useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = React.useState(false);

  React.useEffect(() => {
    if (!open || !previewHref) return;

    const controller = new AbortController();
    setPreviewHtml(null);
    setPreviewFailed(false);
    void fetch(previewHref, { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("contract_preview_failed");
        const html = await response.text();
        if (!html.trim()) throw new Error("contract_preview_empty");
        setPreviewHtml(html);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPreviewFailed(true);
      });

    return () => controller.abort();
  }, [open, previewHref]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-[#04050b]/82 p-3 backdrop-blur-md">
      <div className="flex h-[88dvh] w-[96vw] max-w-[1440px] flex-col rounded-2xl border border-white/12 bg-[#11131b] p-2.5 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.95)] sm:p-3">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-white sm:text-[18px]">Договор</h2>
            <p className="mt-0.5 text-[11px] text-white/60">
              Режим просмотра
            </p>
          </div>
          <div className="flex items-center gap-2">
            {downloadHref ? (
              <Button
                asChild
                type="button"
                variant="outline"
                className="h-9 rounded-lg px-3 text-[12px] font-semibold"
              >
                <a href={downloadHref}>Скачать</a>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-9 rounded-lg px-2.5"
              aria-label="Закрыть просмотр договора"
              title="Закрыть"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {previewHtml ? (
          <iframe
            title="Подписанный договор"
            srcDoc={previewHtml}
            sandbox=""
            className="min-h-0 flex-1 rounded-2xl border border-white/12 bg-white"
          />
        ) : previewFailed || !previewHref ? (
          <ContractViewer
            className="min-h-0 flex-1"
            readOnly
            allowExternalOpen={false}
          />
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center rounded-2xl border border-white/12 bg-white/[0.03] text-[14px] text-white/65">
            <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Загружаем договор…</span>
          </div>
        )}
      </div>
    </div>
  );
}
