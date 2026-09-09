"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function ProfileBackButton() {
  const router = useRouter();

  const handleBack = React.useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/feed");
  }, [router]);

  return (
    <button
      type="button"
      onClick={handleBack}
      className="ux-control-compact inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white/76 transition hover:text-white"
    >
      <ArrowLeft className="h-4 w-4" />
      Назад
    </button>
  );
}
