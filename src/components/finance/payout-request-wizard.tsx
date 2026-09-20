"use client";

import * as React from "react";
import { Check, ChevronLeft, ChevronRight, Download, FileText, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PayoutRequestBody, PayoutRequestFailureResponse, PayoutRequestSuccessResponse } from "@/lib/api/contracts";
import type { FinanceReportClientItem } from "@/lib/finance-client";
import type { PayoutRequestSummary } from "@/lib/payout-request";
import type { PayoutWindowState } from "@/lib/payout-schedule";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4;
type TaxStatus = "individual" | "self_employed";
type UploadedDocument = PayoutRequestBody["documents"]["supportingDocument"];
type ReceiptDetails = NonNullable<PayoutRequestBody["documents"]["receiptDetails"]>;
type StringSetter = (value: string) => void;

type StepPaymentProps = {
  reports: FinanceReportClientItem[];
  selectedReportId: string;
  setSelectedReportId: StringSetter;
  amount: string;
  setAmount: StringSetter;
  taxStatus: TaxStatus;
  setTaxStatus: (value: TaxStatus) => void;
  available: number;
  minimum: number;
  window: PayoutWindowState;
};

type StepRequisitesProps = {
  recipientName: string;
  setRecipientName: StringSetter;
  bankChoice: string;
  setBankChoice: StringSetter;
  customBankName: string;
  setCustomBankName: StringSetter;
  accountNumber: string;
  setAccountNumber: StringSetter;
  bankBik: string;
  setBankBik: StringSetter;
  taxId: string;
  setTaxId: StringSetter;
};

type StepDocumentsProps = {
  taxStatus: TaxStatus;
  selectedReport: FinanceReportClientItem | null;
  recipientName: string;
  receiptDetails: ReceiptDetails;
  updateReceipt: (field: keyof ReceiptDetails, value: string) => void;
  receiptAcknowledged: boolean;
  setReceiptAcknowledged: (value: boolean) => void;
  supportingDocument: UploadedDocument | null;
  uploading: boolean;
  uploadDocument: (file: File | undefined) => Promise<void>;
  downloadReceipt: () => void;
  previewReceipt: () => void;
};

type StepReviewProps = {
  report: FinanceReportClientItem;
  amount: number;
  taxStatus: TaxStatus;
  recipientName: string;
  bankName: string;
  accountNumber: string;
  bankBik: string;
  taxId: string;
  document: UploadedDocument | null;
  onEdit: (step: Step) => void;
};

const steps: Array<{ id: Step; label: string }> = [
  { id: 1, label: "Выплата" },
  { id: 2, label: "Реквизиты" },
  { id: 3, label: "Документы" },
  { id: 4, label: "Проверка" }
];
const fieldClass = "mt-2 h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3.5 text-[15px] font-medium text-white outline-none transition-colors placeholder:text-white/45 focus:border-[#7b3df5]/60";

function quarterLabel(quarter: number, year: number): string {
  return `${quarter} квартал ${year}`;
}

function mask(value: string, visible = 4): string {
  if (value.length <= visible) return value;
  return `${"•".repeat(Math.max(4, value.length - visible))}${value.slice(-visible)}`;
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : "—";
}

function amountWords(value: number): string {
  const ones = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
  const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
  const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];
  const underThousand = (number: number) => {
    const parts = [hundreds[Math.floor(number / 100)]];
    const rest = number % 100;
    if (rest >= 10 && rest < 20) parts.push(teens[rest - 10]);
    else parts.push(tens[Math.floor(rest / 10)], ones[rest % 10]);
    return parts.filter(Boolean).join(" ");
  };
  const integer = Math.floor(Math.max(0, value));
  const thousands = Math.floor(integer / 1000);
  const suffix = thousands % 100 >= 11 && thousands % 100 <= 14 ? "тысяч" : ["тысяча", "тысячи", "тысяч"][thousands % 10 === 1 ? 0 : thousands % 10 >= 2 && thousands % 10 <= 4 ? 1 : 2];
  const result = [thousands ? `${underThousand(thousands)} ${suffix}` : "", underThousand(integer % 1000)].filter(Boolean).join(" ") || "ноль";
  return `${result} рублей ${Math.round((value - integer) * 100).toString().padStart(2, "0")} копеек`;
}

function receiptHtml(input: {
  recipientName: string; passportSeries: string; passportNumber: string; passportIssuedBy: string;
  passportIssueDate: string; birthDate: string; registrationAddress: string; amount: number;
  quarterLabel: string; bankName: string; accountNumber: string; bankBik: string;
}): string {
  const escape = (value: string) => value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Расписка ICECREAMMUSIC</title><style>body{font:16px Georgia,serif;line-height:1.55;margin:55px;color:#111}h1{text-align:center;font:700 22px Arial;margin:0 0 36px}.sign{margin-top:40px}</style><h1>РАСПИСКА</h1><p>Я, ${escape(input.recipientName)}, действующий на основании паспорта: серия ${escape(input.passportSeries)}, номер ${escape(input.passportNumber)}, выдан ${escape(input.passportIssuedBy)}, дата выдачи ${formatDate(input.passportIssueDate)}, дата рождения ${formatDate(input.birthDate)}, зарегистрированный по адресу ${escape(input.registrationAddress)},</p><p>получил вознаграждение (royalty) от ICECREAMMUSIC в размере:</p><p><strong>${formatCurrency(input.amount, "RUB")}</strong><br>${escape(amountWords(input.amount))}</p><p>за отчетный период: <strong>${escape(input.quarterLabel)}</strong>.</p><p>Выплата производится по следующим реквизитам: ${escape(input.bankName)}, счет ${escape(input.accountNumber)}, БИК ${escape(input.bankBik)}, получатель ${escape(input.recipientName)}.</p><p>Претензий не имею.</p><p class="sign">Подпись: __________<br>Фамилия и инициалы: __________<br><br>Дата расписки: __________</p></html>`;
}

export function PayoutRequestWizard({ reports, availableToWithdraw, minimumPayoutAmount, payoutWindow, initialPayoutRequests }: {
  reports: FinanceReportClientItem[];
  availableToWithdraw: number;
  minimumPayoutAmount: number;
  payoutWindow: PayoutWindowState;
  initialPayoutRequests: PayoutRequestSummary[];
}) {
  const agreedReports = reports.filter((report) => report.status === "agreed" && report.quarter && report.year);
  const [step, setStep] = React.useState<Step>(1);
  const [amount, setAmount] = React.useState("");
  const [selectedReportId, setSelectedReportId] = React.useState(agreedReports[0]?.id ?? "");
  const [taxStatus, setTaxStatus] = React.useState<TaxStatus>("individual");
  const [recipientName, setRecipientName] = React.useState("");
  const [bankChoice, setBankChoice] = React.useState("Т-Банк");
  const [customBankName, setCustomBankName] = React.useState("");
  const [accountNumber, setAccountNumber] = React.useState("");
  const [bankBik, setBankBik] = React.useState("");
  const [taxId, setTaxId] = React.useState("");
  const [receiptDetails, setReceiptDetails] = React.useState({ passportSeries: "", passportNumber: "", passportIssuedBy: "", passportIssueDate: "", birthDate: "", registrationAddress: "" });
  const [receiptAcknowledged, setReceiptAcknowledged] = React.useState(false);
  const [supportingDocument, setSupportingDocument] = React.useState<UploadedDocument | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [createdPayout, setCreatedPayout] = React.useState<PayoutRequestSummary | null>(null);

  const selectedReport = agreedReports.find((report) => report.id === selectedReportId) ?? null;
  const parsedAmount = Number(amount.replace(",", "."));
  const bankName = bankChoice === "Другой банк" ? customBankName : bankChoice;
  const quarterAmount = selectedReport?.amount ?? 0;
  const canStart = Boolean(selectedReport) && Number.isFinite(parsedAmount) && parsedAmount >= minimumPayoutAmount && parsedAmount <= Math.min(availableToWithdraw, quarterAmount) && payoutWindow.isOpen;

  const updateReceipt = (field: keyof typeof receiptDetails, value: string) => setReceiptDetails((current) => ({ ...current, [field]: value }));

  function validateCurrentStep(): boolean {
    setNotice(null);
    if (step === 1 && !canStart) {
      setNotice(parsedAmount > 0 && parsedAmount < minimumPayoutAmount
        ? `Минимальная сумма выплаты — ${formatCurrency(minimumPayoutAmount, "RUB")}.`
        : "Проверьте сумму, выбранный согласованный отчет и окно выплат.");
      return false;
    }
    if (step === 2 && (!recipientName.trim() || !bankName.trim() || accountNumber.trim().length < 8 || !/^\d{9}$/u.test(bankBik.trim()) || !taxId.trim())) { setNotice("Заполните ФИО, банк, счет, БИК из 9 цифр и ИНН."); return false; }
    if (step === 3) {
      const completeReceipt = Object.values(receiptDetails).every(Boolean);
      if (!supportingDocument) { setNotice(taxStatus === "self_employed" ? "Прикрепите чек «Мой налог»." : "Сформируйте расписку и прикрепите подписанный вариант."); return false; }
      if (taxStatus === "individual" && !completeReceipt) { setNotice("Заполните все данные для формирования расписки."); return false; }
      if (taxStatus === "individual" && !receiptAcknowledged) { setNotice("Подтвердите, что перепишете расписку от руки, подпишете и загрузите ее."); return false; }
    }
    return true;
  }

  async function uploadDocument(file: File | undefined) {
    if (!file) return;
    setNotice(null);
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type) || file.size > 10 * 1024 * 1024) { setNotice("Поддерживаются PDF, JPG и PNG до 10 МБ."); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/finance/payouts/document", { method: "POST", body: formData });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Не удалось загрузить документ.");
      setSupportingDocument(data as UploadedDocument);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось загрузить документ.");
    } finally { setUploading(false); }
  }

  function downloadReceipt() {
    if (!selectedReport || taxStatus !== "individual") return;
    const html = receiptHtml({ recipientName, ...receiptDetails, amount: parsedAmount, quarterLabel: selectedReport.quarterLabel, bankName, accountNumber, bankBik });
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `receipt-${selectedReport.quarterLabel.replace(/\s+/gu, "-")}.html`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function previewReceipt() {
    if (!selectedReport || taxStatus !== "individual") return;
    const html = receiptHtml({ recipientName, ...receiptDetails, amount: parsedAmount, quarterLabel: selectedReport.quarterLabel, bankName, accountNumber, bankBik });
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function submit() {
    if (!selectedReport || !supportingDocument || !validateCurrentStep()) return;
    setSubmitting(true); setNotice(null);
    const payload: PayoutRequestBody = {
      amount: parsedAmount,
      quarter: selectedReport.quarter!,
      year: selectedReport.year!,
      taxStatus,
      requisites: { recipientName, payoutMethod: "bank_transfer", accountNumber, bankName, bankBik, taxId },
      documents: { reportId: selectedReport.id, supportingDocument, receiptDetails: taxStatus === "individual" ? receiptDetails : undefined, receiptAcknowledged: taxStatus === "individual" ? true : undefined }
    };
    try {
      const response = await fetch("/api/finance/payouts/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => null) as PayoutRequestSuccessResponse | PayoutRequestFailureResponse | { error?: string } | null;
      if (!response.ok) {
        const message = data && "errors" in data ? data.errors.map((error) => error.message).join(" ") : data && "error" in data ? data.error : "Не удалось отправить заявку.";
        throw new Error(message);
      }
      const success = data as PayoutRequestSuccessResponse;
      setCreatedPayout({ id: success.payoutRequestId, amount: parsedAmount, status: "REQUESTED", createdAt: new Date().toISOString(), quarter: selectedReport.quarter, year: selectedReport.year });
    } catch (error) { setNotice(error instanceof Error ? error.message : "Не удалось отправить заявку."); }
    finally { setSubmitting(false); }
  }

  const knownPayout = createdPayout ?? initialPayoutRequests.find((item) => item.status === "REQUESTED" || item.status === "PROCESSING") ?? null;
  if (knownPayout) return <PayoutCreatedCard payout={knownPayout} />;

  return <section className="mx-auto max-w-4xl rounded-[26px] border border-white/[0.10] bg-[#11131d]/95 p-4 shadow-[0_24px_80px_-48px_rgba(91,46,229,0.75)] sm:p-7">
    <ol className="mb-8 grid grid-cols-4 gap-1" aria-label="Этапы создания заявки">
      {steps.map((item) => <li key={item.id} className="min-w-0">
        <button type="button" disabled={item.id > step} onClick={() => setStep(item.id)} className="flex w-full items-center gap-2 text-left disabled:cursor-default">
          <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[12px] font-bold", item.id < step ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100" : item.id === step ? "border-[#9b6bff] bg-[#7b3df5]/20 text-white" : "border-white/10 bg-white/[0.03] text-white/35")}>{item.id < step ? <Check className="h-4 w-4" /> : item.id}</span>
          <span className={cn("hidden truncate text-[12px] font-semibold sm:inline", item.id <= step ? "text-white" : "text-white/35")}>{item.label}</span>
        </button>
      </li>)}
    </ol>
    {step === 1 ? <StepPayment reports={agreedReports} selectedReportId={selectedReportId} setSelectedReportId={setSelectedReportId} amount={amount} setAmount={setAmount} taxStatus={taxStatus} setTaxStatus={setTaxStatus} available={availableToWithdraw} minimum={minimumPayoutAmount} window={payoutWindow} /> : null}
    {step === 2 ? <StepRequisites recipientName={recipientName} setRecipientName={setRecipientName} bankChoice={bankChoice} setBankChoice={setBankChoice} customBankName={customBankName} setCustomBankName={setCustomBankName} accountNumber={accountNumber} setAccountNumber={setAccountNumber} bankBik={bankBik} setBankBik={setBankBik} taxId={taxId} setTaxId={setTaxId} /> : null}
    {step === 3 ? <StepDocuments taxStatus={taxStatus} selectedReport={selectedReport} recipientName={recipientName} receiptDetails={receiptDetails} updateReceipt={updateReceipt} receiptAcknowledged={receiptAcknowledged} setReceiptAcknowledged={setReceiptAcknowledged} supportingDocument={supportingDocument} uploading={uploading} uploadDocument={uploadDocument} downloadReceipt={downloadReceipt} previewReceipt={previewReceipt} /> : null}
    {step === 4 && selectedReport ? <StepReview report={selectedReport} amount={parsedAmount} taxStatus={taxStatus} recipientName={recipientName} bankName={bankName} accountNumber={accountNumber} bankBik={bankBik} taxId={taxId} document={supportingDocument} onEdit={setStep} /> : null}
    {notice ? <p className="mt-5 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3.5 py-3 text-[13px] font-medium text-rose-100">{notice}</p> : null}
    <div className="mt-7 flex flex-wrap justify-between gap-3 border-t border-white/[0.08] pt-5">
      {step > 1 ? <Button type="button" variant="outline" onClick={() => setStep((step - 1) as Step)} className="border-white/15 bg-white/[0.03]"><ChevronLeft className="mr-1 h-4 w-4" />Назад</Button> : <span />}
      {step < 4 ? <Button type="button" onClick={() => validateCurrentStep() && setStep((step + 1) as Step)} className="btn-shine"><span>Продолжить</span><ChevronRight className="ml-1 h-4 w-4" /></Button> : <Button type="button" onClick={() => void submit()} disabled={submitting} className="btn-shine">{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Отправить заявку</Button>}
    </div>
  </section>;
}

function StepPayment({ reports, selectedReportId, setSelectedReportId, amount, setAmount, taxStatus, setTaxStatus, available, minimum, window }: StepPaymentProps) {
  const selected = reports.find((report: FinanceReportClientItem) => report.id === selectedReportId);
  return <div><h2 className="text-[22px] font-semibold text-white">Создание запроса на выплату</h2><div className="mt-5 rounded-2xl border border-[#7b3df5]/25 bg-[#7b3df5]/10 p-4"><p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#c7b5ff]">Доступно к выплате</p><p className="mt-1 text-[28px] font-semibold text-white">{formatCurrency(available, "RUB")}</p><p className="mt-1 text-[13px] text-white/55">Минимальная сумма: {formatCurrency(minimum, "RUB")}</p></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-[13px] font-semibold text-white/70">Сумма выплаты<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" className={fieldClass} /></label><label className="text-[13px] font-semibold text-white/70">Отчетный период<select value={selectedReportId} onChange={(event) => setSelectedReportId(event.target.value)} className={fieldClass}><option value="">Выберите квартал</option>{reports.map((report: FinanceReportClientItem) => <option value={report.id} key={report.id}>{report.quarterLabel} · {formatCurrency(report.amount, "RUB")}</option>)}</select></label></div>{selected ? <p className="mt-3 text-[13px] text-white/55">По выбранному кварталу доступно: {formatCurrency(selected.amount, "RUB")}. Одна заявка создается только для одного квартала.</p> : <p className="mt-3 text-[13px] text-amber-200">Нет согласованных отчетов, доступных для выплаты.</p>}<fieldset className="mt-6"><legend className="text-[13px] font-semibold text-white/70">Налоговый статус</legend><div className="mt-2 grid gap-3 sm:grid-cols-2">{[["individual", "Физическое лицо", "Для выплаты потребуется заполненная расписка."], ["self_employed", "Самозанятый", "Для выплаты потребуется чек из приложения «Мой налог»." ]].map(([id, title, description]) => <label key={id} className={cn("cursor-pointer rounded-2xl border p-4", taxStatus === id ? "border-[#8b5cf6]/55 bg-[#7b3df5]/12" : "border-white/[0.09] bg-white/[0.02]")}><input className="sr-only" type="radio" checked={taxStatus === id} onChange={() => setTaxStatus(id as TaxStatus)} /><span className="block font-semibold text-white">{title}</span><span className="mt-1 block text-[13px] leading-relaxed text-white/55">{description}</span></label>)}</div></fieldset>{!window.isOpen ? <p className="mt-5 rounded-xl border border-sky-400/25 bg-sky-500/10 px-3.5 py-3 text-[13px] text-sky-100">{window.message}</p> : null}</div>;
}

function StepRequisites(props: StepRequisitesProps) { const banks = ["Т-Банк", "Сбербанк", "Альфа-Банк", "Газпромбанк", "Другой банк"]; return <div><h2 className="text-[22px] font-semibold text-white">Реквизиты получателя</h2><p className="mt-2 text-[14px] text-white/55">Выплата выполняется банковским переводом.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-[13px] font-semibold text-white/70 sm:col-span-2">ФИО / Получатель<input value={props.recipientName} onChange={(e) => props.setRecipientName(e.target.value)} className={fieldClass} /></label><label className="text-[13px] font-semibold text-white/70">Банк<select value={props.bankChoice} onChange={(e) => props.setBankChoice(e.target.value)} className={fieldClass}>{banks.map((bank) => <option key={bank}>{bank}</option>)}</select></label>{props.bankChoice === "Другой банк" ? <label className="text-[13px] font-semibold text-white/70">Название банка<input value={props.customBankName} onChange={(e) => props.setCustomBankName(e.target.value)} className={fieldClass} /></label> : <div /> }<label className="text-[13px] font-semibold text-white/70">Номер счета<input inputMode="numeric" value={props.accountNumber} onChange={(e) => props.setAccountNumber(e.target.value)} className={fieldClass} /></label><label className="text-[13px] font-semibold text-white/70">БИК банка<input inputMode="numeric" maxLength={9} value={props.bankBik} onChange={(e) => props.setBankBik(e.target.value.replace(/\D/gu, ""))} className={fieldClass} /></label><label className="text-[13px] font-semibold text-white/70 sm:col-span-2">ИНН / Налоговый ID<input value={props.taxId} onChange={(e) => props.setTaxId(e.target.value)} className={fieldClass} /></label></div></div>; }

function StepDocuments({ taxStatus, selectedReport, recipientName, receiptDetails, updateReceipt, receiptAcknowledged, setReceiptAcknowledged, supportingDocument, uploading, uploadDocument, downloadReceipt, previewReceipt }: StepDocumentsProps) { const receiptReady = Object.values(receiptDetails).every(Boolean); return <div><h2 className="text-[22px] font-semibold text-white">Документы</h2>{selectedReport ? <a className="mt-4 flex items-center justify-between rounded-2xl border border-white/[0.1] bg-white/[0.03] p-4 text-white hover:border-[#7b3df5]/45" href={`/api/finance/reports/${encodeURIComponent(selectedReport.id)}/statement`} target="_blank" rel="noreferrer"><span><strong className="block">Отчетная ведомость</strong><span className="mt-1 block text-[13px] text-white/55">{selectedReport.quarterLabel}</span></span><span className="flex items-center gap-2 text-[13px] font-semibold"><Download className="h-4 w-4" />Скачать</span></a> : null}{taxStatus === "individual" ? <><div className="mt-5 rounded-2xl border border-white/[0.1] bg-white/[0.02] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-white">Расписка о получении вознаграждения</h3><p className="mt-1 text-[13px] text-white/55">Сформируйте, перепишите от руки, подпишите и прикрепите скан или PDF.</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={previewReceipt} disabled={!recipientName.trim() || !receiptReady}>Просмотреть</Button><Button type="button" variant="outline" onClick={downloadReceipt} disabled={!recipientName.trim() || !receiptReady}><Download className="mr-2 h-4 w-4" />Скачать расписку</Button></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-[13px] font-semibold text-white/70">Серия паспорта<input maxLength={4} value={receiptDetails.passportSeries} onChange={(e) => updateReceipt("passportSeries", e.target.value.replace(/\D/gu, ""))} className={fieldClass} /></label><label className="text-[13px] font-semibold text-white/70">Номер паспорта<input maxLength={6} value={receiptDetails.passportNumber} onChange={(e) => updateReceipt("passportNumber", e.target.value.replace(/\D/gu, ""))} className={fieldClass} /></label><label className="text-[13px] font-semibold text-white/70 sm:col-span-2">Кем выдан<input value={receiptDetails.passportIssuedBy} onChange={(e) => updateReceipt("passportIssuedBy", e.target.value)} className={fieldClass} /></label><label className="text-[13px] font-semibold text-white/70">Дата выдачи<input type="date" value={receiptDetails.passportIssueDate} onChange={(e) => updateReceipt("passportIssueDate", e.target.value)} className={fieldClass} /></label><label className="text-[13px] font-semibold text-white/70">Дата рождения<input type="date" value={receiptDetails.birthDate} onChange={(e) => updateReceipt("birthDate", e.target.value)} className={fieldClass} /></label><label className="text-[13px] font-semibold text-white/70 sm:col-span-2">Адрес регистрации<input value={receiptDetails.registrationAddress} onChange={(e) => updateReceipt("registrationAddress", e.target.value)} className={fieldClass} /></label></div><label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300/20 bg-amber-400/[0.06] p-3 text-[13px] leading-relaxed text-amber-50"><input type="checkbox" checked={receiptAcknowledged} onChange={(event) => setReceiptAcknowledged(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#8b5cf6]" /><span>Подтверждаю: сформированная расписка является примером. Я перепишу ее от руки, подпишу и загружу подписанный скан или PDF.</span></label></div></> : <div className="mt-5 rounded-2xl border border-white/[0.1] bg-white/[0.02] p-4"><h3 className="font-semibold text-white">Чек «Мой налог»</h3><p className="mt-1 text-[13px] text-white/55">Прикрепите чек на сумму текущей выплаты, сформированный в приложении «Мой налог».</p></div>}<label className="mt-5 flex cursor-pointer items-center justify-center gap-3 rounded-2xl border border-dashed border-[#8b5cf6]/45 bg-[#7b3df5]/[0.06] px-5 py-8 text-center"><input className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => void uploadDocument(event.target.files?.[0])} /><Upload className="h-5 w-5 text-[#b9a0ff]" /><span><strong className="block text-white">{supportingDocument ? "Заменить документ" : "Перетащите файл сюда или выберите файл"}</strong><span className="mt-1 block text-[13px] text-white/55">PDF, JPG или PNG до 10 МБ</span></span></label>{uploading ? <p className="mt-3 flex items-center gap-2 text-[13px] text-white/65"><Loader2 className="h-4 w-4 animate-spin" />Загрузка…</p> : null}{supportingDocument ? <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3.5 py-3 text-[13px] text-emerald-100"><span className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0" /><span className="truncate">{supportingDocument.name} · {(supportingDocument.size / 1024 / 1024).toFixed(2)} МБ</span></span><button type="button" className="ml-3 underline" onClick={() => supportingDocument && (window.open(`/api/finance/payouts/document?key=${encodeURIComponent(supportingDocument.key)}`, "_blank"))}>Открыть</button></div> : null}</div>; }

function StepReview({ report, amount, taxStatus, recipientName, bankName, accountNumber, bankBik, taxId, document, onEdit }: StepReviewProps) { return <div><h2 className="text-[22px] font-semibold text-white">Проверьте заявку</h2><div className="mt-5 rounded-2xl border border-[#8b5cf6]/35 bg-gradient-to-br from-[#7b3df5]/20 to-transparent p-5"><p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#c7b5ff]">К выплате</p><p className="mt-1 text-[34px] font-semibold text-white">{formatCurrency(amount, "RUB")}</p></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><Summary title="Выплата" edit={() => onEdit(1)} lines={[report.quarterLabel, formatCurrency(amount, "RUB"), taxStatus === "individual" ? "Физическое лицо" : "Самозанятый"]} /><Summary title="Получатель" edit={() => onEdit(2)} lines={[recipientName, bankName, `Счет ${mask(accountNumber)}`, `БИК ${bankBik}`, `ИНН ${mask(taxId)}`]} /><Summary title="Документы" edit={() => onEdit(3)} lines={["✓ Отчетная ведомость", `✓ ${taxStatus === "individual" ? "Расписка" : "Чек «Мой налог»"}`, document?.name ?? "—"]} /></div></div>; }

function Summary({ title, lines, edit }: { title: string; lines: string[]; edit: () => void }) { return <section className="rounded-2xl border border-white/[0.09] bg-white/[0.025] p-4"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-white">{title}</h3><button type="button" onClick={edit} className="text-[12px] font-semibold text-[#c5b3ff] hover:text-white">Изменить</button></div><div className="mt-3 space-y-1 text-[13px] leading-relaxed text-white/62">{lines.map((line) => <p key={line}>{line}</p>)}</div></section>; }

function PayoutCreatedCard({ payout }: { payout: PayoutRequestSummary }) { const status = payout.status === "PROCESSING" ? "В обработке" : payout.status === "PAID" ? "Выплачена" : payout.status === "REJECTED" ? "Отклонена" : "На проверке"; return <section className="mx-auto max-w-2xl rounded-[26px] border border-emerald-400/25 bg-emerald-500/[0.06] p-6"><span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-500/15 text-emerald-200"><Check className="h-5 w-5" /></span><h2 className="mt-4 text-[22px] font-semibold text-white">Заявка №{payout.id.slice(0, 8)}</h2><p className="mt-1 text-white/60">{payout.quarter && payout.year ? quarterLabel(payout.quarter, payout.year) : "Период выплаты"}</p><p className="mt-5 text-[32px] font-semibold text-white">{formatCurrency(payout.amount, "RUB")}</p><p className="mt-4 text-[14px] text-emerald-100">● {status}</p><p className="mt-2 text-[13px] text-white/55">Создана: {new Date(payout.createdAt).toLocaleDateString("ru-RU")}</p></section>; }
