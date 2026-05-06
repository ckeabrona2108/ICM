"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";

export function ContractControls({
  onBack,
  onNext,
  nextDisabled
}: {
  onBack: () => void;
  onNext: () => void;
  nextDisabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[14px] leading-relaxed text-white/70 [overflow-wrap:anywhere]">
        Чтобы продолжить, необходимо пролистать договор до конца и подтвердить ознакомление.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="w-full min-w-0 px-5 sm:w-auto sm:min-w-[132px]"
        >
          Назад
        </Button>
        <Button
          type="button"
          disabled={nextDisabled}
          onClick={onNext}
          className="w-full min-w-0 px-6 sm:ml-auto sm:w-auto sm:min-w-[156px]"
        >
          Далее
        </Button>
      </div>
    </div>
  );
}
