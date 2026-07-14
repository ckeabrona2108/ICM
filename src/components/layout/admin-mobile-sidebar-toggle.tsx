"use client";

import { PanelLeft } from "lucide-react";

export function AdminMobileSidebarToggle() {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("admin:toggle-mobile-sidebar"));
      }}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.04] text-white/82 transition-colors hover:bg-white/[0.08] lg:hidden"
      aria-label="Открыть меню администратора"
    >
      <PanelLeft className="h-4.5 w-4.5" />
    </button>
  );
}
