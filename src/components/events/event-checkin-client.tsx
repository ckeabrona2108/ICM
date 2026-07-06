"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CheckinResult {
  result: "valid" | "already_used" | "invalid" | "not_found";
  label: string;
  ticket: null | {
    id: string;
    ticketCode: string;
    eventTitle: string;
    ticketTypeName: string;
    paymentStatusLabel: string;
    orderNumber: string;
    checkedInAt: string | null;
    status: string;
    statusLabel: string;
  };
  canMarkUsed: boolean;
  accessType?: string;
  checkinMode?: "manual_confirm" | "auto_check_in";
}

function readReferenceFromPayload(value: string) {
  return value.trim();
}

export function EventCheckinClient(props: {
  eventId: string;
  accessToken?: string;
  eventTitle: string;
  startsAt: string;
  venueName: string;
  address: string;
  checkinMode: "manual_confirm" | "auto_check_in";
  stats: { total: number; checkedIn: number; remaining: number };
  recent: Array<{ id: string; ticketCode: string; checkedInAt: string; gateName: string; method: string }>;
  canManageLinks: boolean;
}) {
  const [ticketReference, setTicketReference] = React.useState("");
  const [result, setResult] = React.useState<CheckinResult | null>(null);
  const [error, setError] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [staffLink, setStaffLink] = React.useState<string | null>(null);
  const [isCreatingLink, setIsCreatingLink] = React.useState(false);
  const [scannerOpen, setScannerOpen] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const submit = React.useCallback(
    async (action: "preview" | "confirm", overrideReference?: string) => {
      const currentReference = readReferenceFromPayload(overrideReference ?? ticketReference);
      if (!currentReference) {
        setError("Введите ticket code, public token или URL из QR.");
        return;
      }

      setIsSubmitting(true);
      setError("");

      try {
        const response = await fetch(`/api/events/${props.eventId}/check-in/staff`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            access: props.accessToken,
            ticketReference: currentReference,
            method: scannerOpen ? "camera" : "manual"
          })
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error || "Не удалось проверить билет.");
        }
        setResult(json);
        if (action === "confirm") {
          setTicketReference("");
        }
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Не удалось проверить билет.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [props.accessToken, props.eventId, scannerOpen, ticketReference]
  );

  const stopScanner = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScannerOpen(false);
  }, []);

  React.useEffect(() => stopScanner, [stopScanner]);

  const openScanner = React.useCallback(async () => {
    if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) {
      setError("Камера или BarcodeDetector API недоступны в этом браузере. Используйте ручной ввод.");
      return;
    }

    setError("");
    setScannerOpen(true);
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }

    const Detector = (window as typeof window & { BarcodeDetector: new (args: { formats: string[] }) => { detect: (input: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
    const detector = new Detector({ formats: ["qr_code"] });

    const tick = async () => {
      if (!videoRef.current || !scannerOpen) return;
      try {
        const codes = await detector.detect(videoRef.current);
        const rawValue = codes[0]?.rawValue?.trim();
        if (rawValue) {
          setTicketReference(rawValue);
          stopScanner();
          await submit("preview", rawValue);
          return;
        }
      } catch {}
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [scannerOpen, stopScanner, submit]);

  async function createLink() {
    setIsCreatingLink(true);
    setError("");
    try {
      const response = await fetch(`/api/events/${props.eventId}/staff-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Не удалось создать staff-ссылку.");
      }
      setStaffLink(json.url);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось создать staff-ссылку.");
    } finally {
      setIsCreatingLink(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
      <section className="rounded-[28px] border border-white/[0.08] bg-[#0d1622]/88 p-5 shadow-[0_24px_72px_-48px_rgba(0,0,0,0.92)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-2xl font-semibold text-white">{props.eventTitle}</p>
            <p className="mt-2 text-sm leading-6 text-white/62">
              {new Date(props.startsAt).toLocaleString()} {props.venueName ? `· ${props.venueName}` : ""}
            </p>
            {props.address ? <p className="text-sm text-white/46">{props.address}</p> : null}
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-right text-sm text-white/70">
            <p>Mode: {props.checkinMode === "auto_check_in" ? "Auto check-in" : "Manual confirm"}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/42">Total</p>
            <p className="mt-2 text-2xl font-semibold text-white">{props.stats.total}</p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/42">Checked-in</p>
            <p className="mt-2 text-2xl font-semibold text-white">{props.stats.checkedIn}</p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/42">Remaining</p>
            <p className="mt-2 text-2xl font-semibold text-white">{props.stats.remaining}</p>
          </div>
        </div>

        <div className="mt-6 space-y-4 rounded-3xl border border-white/[0.08] bg-black/20 p-5">
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={openScanner} disabled={scannerOpen || isSubmitting}>
              Сканировать билет
            </Button>
            {scannerOpen ? (
              <Button type="button" variant="outline" onClick={stopScanner}>
                Остановить камеру
              </Button>
            ) : null}
            {props.canManageLinks ? (
              <Button type="button" variant="outline" onClick={createLink} disabled={isCreatingLink}>
                {isCreatingLink ? "Создаём ссылку..." : "Создать staff-ссылку"}
              </Button>
            ) : null}
            <a href={`/api/events/${props.eventId}/guest-list.xlsx`}>
              <Button type="button" variant="outline">Скачать Excel</Button>
            </a>
          </div>

          {staffLink ? (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-50 break-all">
              {staffLink}
            </div>
          ) : null}

          {scannerOpen ? (
            <video ref={videoRef} className="aspect-video w-full rounded-2xl border border-white/[0.08] bg-black" muted playsInline />
          ) : null}

          <div className="grid gap-3 md:grid-cols-[1fr,auto,auto]">
            <Input
              value={ticketReference}
              onChange={(event) => setTicketReference(event.target.value)}
              placeholder="ICM-... / public token / https://..."
            />
            <Button type="button" variant="outline" onClick={() => submit("preview")} disabled={isSubmitting}>
              Проверить
            </Button>
            <Button
              type="button"
              onClick={() => submit("confirm")}
              disabled={isSubmitting || !result?.canMarkUsed}
            >
              Отметить как использован
            </Button>
          </div>

          {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}

          {result ? (
            <div className="rounded-2xl border border-white/[0.08] bg-[#111c2b] p-4 text-sm text-white/72">
              <p className="text-lg font-semibold text-white">{result.label}</p>
              {result.ticket ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/42">Мероприятие</p>
                    <p className="mt-2 text-white">{result.ticket.eventTitle}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/42">Тип билета</p>
                    <p className="mt-2 text-white">{result.ticket.ticketTypeName}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/42">Статус</p>
                    <p className="mt-2 text-white">{result.ticket.paymentStatusLabel}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/42">Заказ</p>
                    <p className="mt-2 text-white">{result.ticket.orderNumber || "Скрыт"}</p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <aside className="rounded-[28px] border border-white/[0.08] bg-[#0d1622]/88 p-5 shadow-[0_24px_72px_-48px_rgba(0,0,0,0.92)] sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/42">Последние проверки</p>
        <div className="mt-4 space-y-3">
          {props.recent.length ? (
            props.recent.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm text-white/70">
                <p className="font-mono text-white">{item.ticketCode}</p>
                <p className="mt-1">{new Date(item.checkedInAt).toLocaleString()}</p>
                <p className="mt-1 text-white/46">{item.method}{item.gateName ? ` · ${item.gateName}` : ""}</p>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm text-white/52">
              История check-in пока пуста.
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
