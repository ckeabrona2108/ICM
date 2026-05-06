"use client";

import * as React from "react";
import { CheckCircle2, Loader2, PenLine, X } from "lucide-react";

import {
  CONTRACT_VERSION,
  type ContractSignatureStatus,
  type ContractSignerFormData,
  type ContractSignerValidationIssue
} from "@/lib/contract-verification-shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ContractViewer } from "@/components/verification/contract-viewer";
import { ContractCheckbox } from "@/components/verification/contract-checkbox";
import { ContractControls } from "@/components/verification/contract-controls";

type FlowStep = "intro" | "document" | "sign" | "success";
type PenColor = "#101114" | "#b2282f" | "#2457d6";

const DEFAULT_FORM: ContractSignerFormData = {
  fullName: "",
  birthDate: "",
  passportNumber: "",
  passportIssuedBy: "",
  passportCode: "",
  passportIssueDate: "",
  address: "",
  ogrnip: "",
  inn: "",
  snils: "",
  confirmationAccepted: false
};

function normalizePassportInput(value: string): string {
  const digits = value.replace(/\D/gu, "").slice(0, 10);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)} ${digits.slice(4)}`;
}

function normalizePassportCodeInput(value: string): string {
  const digits = value.replace(/\D/gu, "").slice(0, 6);
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

function normalizeInnInput(value: string): string {
  return value.replace(/\D/gu, "").slice(0, 12);
}

function normalizeSnilsInput(value: string): string {
  const digits = value.replace(/\D/gu, "").slice(0, 11);
  const first = digits.slice(0, 3);
  const second = digits.slice(3, 6);
  const third = digits.slice(6, 9);
  const last = digits.slice(9, 11);
  const parts = [first, second, third].filter(Boolean).join("-");
  if (!last) return parts;
  return `${parts} ${last}`;
}

function validateForm(form: ContractSignerFormData): ContractSignerValidationIssue[] {
  const issues: ContractSignerValidationIssue[] = [];
  const fullName = form.fullName.trim();
  if (!/^\S+\s+\S+/u.test(fullName)) {
    issues.push({ field: "fullName", message: "Укажите ФИО (минимум имя и фамилия)." });
  }

  if (!form.birthDate?.trim()) {
    issues.push({ field: "birthDate", message: "Укажите дату рождения." });
  }

  if (!form.passportNumber?.trim()) {
    issues.push({ field: "passportNumber", message: "Укажите паспорт." });
  } else if (!/^\d{4}\s\d{6}$/u.test(form.passportNumber.trim())) {
    issues.push({ field: "passportNumber", message: "Паспорт: формат XXXX XXXXXX." });
  }

  if (!form.passportIssuedBy?.trim()) {
    issues.push({ field: "passportIssuedBy", message: "Укажите, кем выдан паспорт." });
  }

  if (!form.passportCode?.trim()) {
    issues.push({ field: "passportCode", message: "Укажите код подразделения." });
  }

  if (!form.passportIssueDate?.trim()) {
    issues.push({ field: "passportIssueDate", message: "Укажите дату выдачи паспорта." });
  }

  if (!form.address?.trim()) {
    issues.push({ field: "address", message: "Укажите адрес регистрации." });
  }

  if (form.inn?.trim() && !/^(\d{10}|\d{12})$/u.test(form.inn.trim())) {
    issues.push({ field: "inn", message: "ИНН должен содержать 10 или 12 цифр." });
  }

  if (form.snils?.trim() && !/^\d{3}-\d{3}-\d{3}\s\d{2}$/u.test(form.snils.trim())) {
    issues.push({ field: "snils", message: "СНИЛС: формат XXX-XXX-XXX XX." });
  }

  if (!form.confirmationAccepted) {
    issues.push({
      field: "confirmationAccepted",
      message: "Подтвердите согласие с условиями договора."
    });
  }

  return issues;
}

function fieldError(
  issues: ContractSignerValidationIssue[],
  field: keyof ContractSignerFormData
): string | null {
  const issue = issues.find((item) => item.field === field);
  return issue?.message ?? null;
}

export function ContractVerificationModal({
  open,
  mode = "gate",
  onLater,
  onSigned
}: {
  open: boolean;
  mode?: "gate" | "submit";
  onLater: () => void;
  onSigned: () => void;
}) {
  const [step, setStep] = React.useState<FlowStep>("intro");
  const [form, setForm] = React.useState<ContractSignerFormData>(DEFAULT_FORM);
  const [issues, setIssues] = React.useState<ContractSignerValidationIssue[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [signedStatus, setSignedStatus] = React.useState<ContractSignatureStatus | null>(null);
  const [scrolledToEnd, setScrolledToEnd] = React.useState(false);
  const [documentAgreed, setDocumentAgreed] = React.useState(false);
  const [penColor, setPenColor] = React.useState<PenColor>("#101114");
  const [hasInk, setHasInk] = React.useState(false);

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const canvasWrapRef = React.useRef<HTMLDivElement | null>(null);
  const drawingRef = React.useRef(false);
  const lastPointRef = React.useRef<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setStep("intro");
    setIssues([]);
    setError(null);
    setSaving(false);
    setSignedStatus(null);
    setScrolledToEnd(false);
    setDocumentAgreed(false);
    setPenColor("#101114");
    setHasInk(false);
    setForm(DEFAULT_FORM);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    if (step !== "sign") return;
    const wrap = canvasWrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const width = Math.max(320, Math.floor(rect.width));
      const height = Math.max(180, Math.floor(Math.min(280, rect.width * 0.28)));
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);

      const nextW = Math.floor(width * dpr);
      const nextH = Math.floor(height * dpr);

      if (canvas.width === nextW && canvas.height === nextH) return;

      const prev = document.createElement("canvas");
      prev.width = canvas.width;
      prev.height = canvas.height;
      const prevCtx = prev.getContext("2d");
      if (prevCtx) prevCtx.drawImage(canvas, 0, 0);

      canvas.width = nextW;
      canvas.height = nextH;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;

      if (prev.width > 0 && prev.height > 0) {
        ctx.drawImage(prev, 0, 0, prev.width, prev.height, 0, 0, width, height);
      }
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });
    return () => window.removeEventListener("resize", resize);
  }, [open, step]);

  const toCanvasPoint = React.useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      // Coordinates must stay in CSS pixels because context is already scaled
      // via setTransform(dpr, ...).
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }, []);

  const drawLine = React.useCallback(
    (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.strokeStyle = penColor;
      context.lineWidth = 3;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    },
    [penColor]
  );

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const point = toCanvasPoint(event);
      if (!point) return;
      drawingRef.current = true;
      lastPointRef.current = point;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [toCanvasPoint]
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      const point = toCanvasPoint(event);
      const previous = lastPointRef.current;
      if (!point || !previous) return;
      drawLine(previous, point);
      lastPointRef.current = point;
      if (!hasInk) setHasInk(true);
    },
    [drawLine, hasInk, toCanvasPoint]
  );

  const finishDrawing = React.useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const clearSignature = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }, []);

  const submitSignature = React.useCallback(async () => {
    setError(null);
    const currentIssues = validateForm(form);
    setIssues(currentIssues);
    if (currentIssues.length > 0) {
      setError(currentIssues[0]?.message ?? "Проверьте форму договора.");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || !hasInk) {
      setError("Подпись обязательна. Поставьте подпись и повторите отправку.");
      return;
    }

    setSaving(true);
    try {
      const signatureImage = canvas.toDataURL("image/png");
      const response = await fetch("/api/verification/contract/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signatureImage,
          contractVersion: CONTRACT_VERSION,
          signerData: form
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; status?: ContractSignatureStatus }
        | { error?: string }
        | null;

      if (!response.ok || !payload || !("success" in payload)) {
        const backendError =
          payload && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Не удалось подписать договор.";
        setError(backendError);
        return;
      }

      setSignedStatus(payload.status ?? "pending");
      setStep("success");
    } catch {
      setError("Не удалось отправить подпись. Проверьте соединение и попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  }, [form, hasInk]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-[#02030a]/88 p-3 backdrop-blur-xl sm:p-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(125,95,255,0.18),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(56,189,248,0.10),transparent_52%)]" />
      <Card className="relative w-full max-w-5xl overflow-hidden border border-white/15 bg-[#090d18] p-0 shadow-[0_55px_140px_-80px_rgba(0,0,0,0.98)]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">Верификация договора</p>
          </div>
          <Button type="button" variant="ghost" className="h-9 w-9 rounded-full p-0" onClick={onLater}>
            <X className="h-4 w-4 text-white/70" />
          </Button>
        </div>

        <div className="max-h-[92vh] overflow-y-auto p-5 sm:p-7">
          {step === "intro" ? (
            <div className="space-y-5 text-center">
              <div className="mx-auto max-w-4xl">
                <h2 className="mt-2 text-[28px] font-semibold leading-tight text-white">
                  Перед выпуском релиза необходимо подписать договор
                </h2>
                <p className="mt-3 text-[15px] leading-relaxed text-white/70">
                  Для размещения музыки на площадках необходимо ознакомиться с договором и подтвердить согласие
                  электронной подписью.
                </p>
              </div>

              <div className="mx-auto inline-flex w-auto max-w-4xl items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-6 py-2.5 text-center text-[13px] text-white/70">
                Это займёт ~1–2 минуты. После подписания Вы сможете выпускать релизы без повторной проверки.
              </div>

              <div className="flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
                <Button
                  type="button"
                  onClick={() => setStep("document")}
                  className="w-full min-w-0 px-6 sm:w-auto sm:min-w-[280px]"
                >
                  Перейти к договору
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onLater}
                  className="w-full min-w-0 px-6 sm:w-auto sm:min-w-[128px]"
                >
                  Позже
                </Button>
              </div>
            </div>
          ) : null}

          {step === "document" ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-[24px] font-semibold leading-tight text-white [overflow-wrap:anywhere]">Просмотр договора</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-white/70 [overflow-wrap:anywhere]">
                  Пролистайте договор до конца. Кнопка «Далее» станет активна после полного просмотра.
                </p>
              </div>

              <ContractViewer onReadStateChange={setScrolledToEnd} />
              <ContractCheckbox
                checked={documentAgreed}
                disabled={!scrolledToEnd}
                onChange={setDocumentAgreed}
              />
              <ContractControls
                onBack={() => setStep("intro")}
                onNext={() => setStep("sign")}
                nextDisabled={!(scrolledToEnd && documentAgreed)}
              />
            </div>
          ) : null}

          {step === "sign" ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-[24px] font-semibold text-white">Данные для договора</h2>
                <p className="mt-2 text-[14px] text-white/70">
                  Заполните данные и подпишите договор электронной подписью.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="ФИО" required error={fieldError(issues, "fullName")}>
                  <Input
                    value={form.fullName}
                    onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
                    placeholder="Фамилия Имя Отчество"
                  />
                </Field>

                <Field label="Дата рождения" required error={fieldError(issues, "birthDate")}>
                  <Input
                    type="date"
                    value={form.birthDate ?? ""}
                    onChange={(event) => setForm((prev) => ({ ...prev, birthDate: event.target.value }))}
                  />
                </Field>

                <Field label="Паспорт" required error={fieldError(issues, "passportNumber")}>
                  <Input
                    value={form.passportNumber ?? ""}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, passportNumber: normalizePassportInput(event.target.value) }))
                    }
                    placeholder="1234 567890"
                  />
                </Field>

                <Field label="Кем выдан" required error={fieldError(issues, "passportIssuedBy")}>
                  <Input
                    value={form.passportIssuedBy ?? ""}
                    onChange={(event) => setForm((prev) => ({ ...prev, passportIssuedBy: event.target.value }))}
                    placeholder="Орган, выдавший паспорт"
                  />
                </Field>

                <Field label="Код подразделения" required error={fieldError(issues, "passportCode")}>
                  <Input
                    value={form.passportCode ?? ""}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, passportCode: normalizePassportCodeInput(event.target.value) }))
                    }
                    placeholder="000-000"
                  />
                </Field>

                <Field label="Дата выдачи" required error={fieldError(issues, "passportIssueDate")}>
                  <Input
                    type="date"
                    value={form.passportIssueDate ?? ""}
                    onChange={(event) => setForm((prev) => ({ ...prev, passportIssueDate: event.target.value }))}
                  />
                </Field>

                <Field label="Адрес регистрации" required className="md:col-span-2" error={fieldError(issues, "address")}>
                  <Textarea
                    value={form.address ?? ""}
                    onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                    rows={3}
                    placeholder="Город, улица, дом, квартира"
                  />
                </Field>

                <Field label="ОГРНИП" error={fieldError(issues, "ogrnip")}>
                  <Input
                    value={form.ogrnip ?? ""}
                    onChange={(event) => setForm((prev) => ({ ...prev, ogrnip: event.target.value }))}
                    placeholder="ОГРНИП"
                  />
                </Field>

                <Field label="ИНН" error={fieldError(issues, "inn")}>
                  <Input
                    value={form.inn ?? ""}
                    onChange={(event) => setForm((prev) => ({ ...prev, inn: normalizeInnInput(event.target.value) }))}
                    placeholder="10 или 12 цифр"
                  />
                </Field>

                <Field label="СНИЛС" error={fieldError(issues, "snils")}>
                  <Input
                    value={form.snils ?? ""}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, snils: normalizeSnilsInput(event.target.value) }))
                    }
                    placeholder="000-000-000 00"
                  />
                </Field>
              </div>

              <div className="space-y-3 rounded-2xl border border-white/12 bg-white/[0.03] p-4">
                <Label className="flex items-start gap-3 text-[14px] leading-snug text-white/82">
                  <Checkbox
                    checked={form.confirmationAccepted}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setForm((prev) => ({ ...prev, confirmationAccepted: checked }));
                    }}
                  />
                  <span>
                    Я внимательно ознакомился с условиями договора, принимаю их и подтверждаю согласие электронной
                    подписью.
                  </span>
                </Label>
                {fieldError(issues, "confirmationAccepted") ? (
                  <p className="text-[12px] text-rose-200">{fieldError(issues, "confirmationAccepted")}</p>
                ) : null}
              </div>

              <div className="space-y-3 rounded-2xl border border-white/12 bg-[#070a13] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[14px] font-medium text-white/88">Электронная подпись</p>
                  <div className="flex items-center gap-2">
                    {([
                      ["#101114", "Чёрный"],
                      ["#b2282f", "Красный"],
                      ["#2457d6", "Синий"]
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setPenColor(value)}
                        className={cn(
                          "inline-flex h-8 items-center gap-2 rounded-full border px-2.5 text-[12px]",
                          penColor === value
                            ? "border-white/45 bg-white/15 text-white"
                            : "border-white/20 bg-white/5 text-white/65"
                        )}
                      >
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: value }} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div ref={canvasWrapRef} className="rounded-xl border border-white/15 bg-white p-2 sm:p-3">
                  <canvas
                    ref={canvasRef}
                    width={1200}
                    height={260}
                    className="w-full touch-none rounded-lg"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={finishDrawing}
                    onPointerCancel={finishDrawing}
                  />
                </div>
                {!hasInk ? (
                  <p className="text-[12px] text-white/58">Поставьте подпись в области выше (мышь и touch).</p>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={clearSignature}
                      className="h-11 min-w-[150px] rounded-full px-6"
                    >
                      Очистить
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onLater}
                      className="h-11 min-w-[150px] rounded-full px-6"
                    >
                      Отменить
                    </Button>
                  </div>
                  <Button
                    type="button"
                    disabled={saving}
                    onClick={() => void submitSignature()}
                    className="h-11 min-w-[230px] rounded-full px-7 sm:ml-auto"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                    Подписать договор
                  </Button>
                </div>
              </div>

              {error ? (
                <div className="rounded-xl border border-rose-300/35 bg-rose-500/15 px-3 py-2 text-[13px] text-rose-100">
                  {error}
                </div>
              ) : null}
            </div>
          ) : null}

          {step === "success" ? (
            <div className="space-y-5 py-3">
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-200">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-[25px] font-semibold text-white">Договор подписан!</h2>
                  <p className="mt-2 text-[15px] text-white/75">
                    {signedStatus === "approved"
                      ? "Теперь Вы можете выпускать релизы."
                      : "Договор подписан. Верификация ожидает проверки администратора."}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button type="button" onClick={onSigned} className="h-11 min-w-[190px] rounded-full px-8">
                  {mode === "submit" ? "Продолжить отправку" : "Продолжить"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function Field({
  label,
  required = false,
  children,
  error,
  className
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  error?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[13px] text-white/78">
        {label}
        {required ? <span className="ml-1 text-rose-300">*</span> : null}
      </Label>
      {children}
      {error ? <p className="text-[12px] text-rose-200">{error}</p> : null}
    </div>
  );
}
