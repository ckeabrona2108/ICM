"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { PlusSquare, Share, Smartphone, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const IOS_INSTALL_PROMPT_DISMISSED_KEY = "pwa:ios-install-prompt:dismissed";

function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;

  const ua = window.navigator.userAgent;
  const platform = window.navigator.platform;
  const maxTouchPoints = window.navigator.maxTouchPoints ?? 0;

  const isIosDevice =
    /iPhone|iPad|iPod/i.test(ua) ||
    ((platform === "MacIntel" || platform === "Macintosh") && maxTouchPoints > 1);

  if (!isIosDevice) return false;

  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo/i.test(ua);
  return isSafari;
}

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;

  const standaloneByNavigator =
    "standalone" in window.navigator &&
    typeof (window.navigator as Navigator & { standalone?: boolean }).standalone === "boolean" &&
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);

  const standaloneByMedia = window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  return standaloneByNavigator || standaloneByMedia;
}

function isDismissedForever(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(IOS_INSTALL_PROMPT_DISMISSED_KEY) === "1";
}

function dismissForever(setVisible: React.Dispatch<React.SetStateAction<boolean>>) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(IOS_INSTALL_PROMPT_DISMISSED_KEY, "1");
  }
  setVisible(false);
}

export function IosInstallPrompt() {
  const [mounted, setMounted] = React.useState(false);
  const [visible, setVisible] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);

    if (!isIosSafari()) return;
    if (isStandaloneMode()) return;
    if (isDismissedForever()) return;

    setVisible(true);
  }, []);

  if (!mounted || !visible) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-4 z-[90] px-4 sm:bottom-6 sm:px-6">
        <div className="mx-auto flex w-full max-w-[560px] items-center gap-3 rounded-[24px] border border-white/[0.08] bg-[#111521]/92 px-4 py-4 shadow-[0_18px_60px_-28px_rgba(0,0,0,0.72)] backdrop-blur-xl">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-200">
            <Smartphone className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-white">Установите ICM как приложение</div>
            <div className="mt-1 text-[13px] leading-5 text-white/62">
              Добавьте сайт на экран Домой и открывайте кабинет без адресной строки.
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-10 px-3 text-white/72 hover:bg-white/[0.06] hover:text-white"
              onClick={() => dismissForever(setVisible)}
            >
              Скрыть
            </Button>
            <Button type="button" size="sm" className="h-10 px-4" onClick={() => setOpen(true)}>
              Как добавить
            </Button>
          </div>
        </div>
      </div>

      {open
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[#05070c]/70 px-3 pb-3 pt-10 backdrop-blur-sm sm:items-center sm:p-6">
              <div className="w-full max-w-[520px] overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#0f1320] shadow-[0_24px_80px_-36px_rgba(0,0,0,0.85)]">
                <div className="flex items-start justify-between border-b border-white/[0.06] px-5 pb-4 pt-5 sm:px-6">
                  <div className="pr-4">
                    <div className="text-[20px] font-semibold text-white">Добавить на экран Домой</div>
                    <div className="mt-2 text-[14px] leading-6 text-white/62">
                      На iPhone сайт будет открываться как отдельное приложение, почти как нативный app.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-white/72 transition hover:bg-white/[0.07] hover:text-white"
                    aria-label="Закрыть инструкцию"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3 px-5 py-5 sm:px-6">
                  {[
                    {
                      icon: Share,
                      title: "1. Нажмите “Поделиться”",
                      text: "В Safari откройте меню поделиться внизу или в верхней панели браузера."
                    },
                    {
                      icon: PlusSquare,
                      title: "2. Выберите “На экран Домой”",
                      text: "Прокрутите список действий и найдите пункт добавления на экран Домой."
                    },
                    {
                      icon: Smartphone,
                      title: "3. Нажмите “Добавить”",
                      text: "После этого ICECREAMMUSIC появится на главном экране и будет открываться отдельно."
                    }
                  ].map((step) => {
                    const Icon = step.icon;
                    return (
                      <div
                        key={step.title}
                        className="flex gap-4 rounded-[22px] border border-white/[0.06] bg-white/[0.03] px-4 py-4"
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/10 text-violet-200">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[15px] font-semibold text-white">{step.title}</div>
                          <div className="mt-1 text-[13px] leading-6 text-white/60">{step.text}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-2 border-t border-white/[0.06] px-5 pb-5 pt-4 sm:flex-row sm:justify-end sm:px-6">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 text-white/72 hover:bg-white/[0.06] hover:text-white"
                    onClick={() => {
                      setOpen(false);
                      dismissForever(setVisible);
                    }}
                  >
                    Больше не показывать
                  </Button>
                  <Button type="button" className="h-11 px-5" onClick={() => setOpen(false)}>
                    Понятно
                  </Button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
