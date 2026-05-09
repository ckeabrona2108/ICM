"use client";

import * as React from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ContractViewer } from "@/components/verification/contract-viewer";

export function ContractReadOnlyModal({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  React.useEffect(() => {
    if (!open) return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-[#04050b]/82 p-3 backdrop-blur-md">
      <div className="flex h-[74vh] w-full max-w-4xl flex-col rounded-2xl border border-white/12 bg-[#11131b] p-2.5 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.95)] sm:p-3">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-white sm:text-[18px]">Договор</h2>
            <p className="mt-0.5 text-[11px] text-white/60">
              Режим просмотра
            </p>
          </div>
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

        <ContractViewer
          className="min-h-0 flex-1"
          readOnly
          allowExternalOpen={false}
        />
      </div>
    </div>
  );
}
