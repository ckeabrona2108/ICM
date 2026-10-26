"use client";

import * as React from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Loader2,
  MessageSquareWarning,
  Receipt,
  Upload,
  UserRound,
  X
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PayoutRequestBody, PayoutRequestFailureResponse, PayoutRequestSuccessResponse } from "@/lib/api/contracts";
import type { FinanceReportClientItem } from "@/lib/finance-client";
import type { PayoutRequestSummary } from "@/lib/payout-request";
import type { PayoutWindowState } from "@/lib/payout-schedule";
import { formatRubCurrency } from "@/lib/currency-format";
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
  maxAmount: number;
  taxStatus: TaxStatus;
  setTaxStatus: (value: TaxStatus) => void;
  available: number;
  minimum: number;
  window: PayoutWindowState;
  contractNumber: number | null;
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
  contractNumber: number;
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
  contractNumber: number;
}): string {
  const escape = (value: string) => value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Расписка ICECREAMMUSIC</title><style>body{font:16px Georgia,serif;line-height:1.55;margin:55px;color:#111}h1{text-align:center;font:700 22px Arial;margin:0 0 36px}.sign{margin-top:40px}</style><h1>РАСПИСКА</h1><p>Я, ${escape(input.recipientName)}, действующий на основании паспорта: серия ${escape(input.passportSeries)}, номер ${escape(input.passportNumber)}, выдан ${escape(input.passportIssuedBy)}, дата выдачи ${formatDate(input.passportIssueDate)}, дата рождения ${formatDate(input.birthDate)}, зарегистрированный по адресу ${escape(input.registrationAddress)}, по лицензионному договору № ${input.contractNumber},</p><p>получил вознаграждение (royalty) от ICECREAMMUSIC в размере:</p><p><strong>${formatRubCurrency(input.amount)}</strong><br>${escape(amountWords(input.amount))}</p><p>за отчетный период: <strong>${escape(input.quarterLabel)}</strong>.</p><p>Выплата производится по следующим реквизитам: ${escape(input.bankName)}, счет ${escape(input.accountNumber)}, БИК ${escape(input.bankBik)}, получатель ${escape(input.recipientName)}.</p><p>Претензий не имею.</p><p class="sign">Подпись: __________<br>Фамилия и инициалы: __________<br><br>Дата расписки: __________</p></html>`;
}

export function PayoutRequestWizard({ reports, availableToWithdraw, minimumPayoutAmount, payoutWindow, initialPayoutRequests, contractNumber }: {
  reports: FinanceReportClientItem[];
  availableToWithdraw: number;
  minimumPayoutAmount: number;
  payoutWindow: PayoutWindowState;
  initialPayoutRequests: PayoutRequestSummary[];
  contractNumber: number | null;
}) {
  const [payoutRequests, setPayoutRequests] = React.useState(initialPayoutRequests);
  const lockedPeriods = new Set(
    payoutRequests
      .filter((request) => request.status !== "REJECTED" && request.quarter && request.year)
      .map((request) => `${request.year}-${request.quarter}`)
  );
  const agreedReports = reports.filter(
    (report) => report.status === "agreed" && report.quarter && report.year &&
      !lockedPeriods.has(`${report.year}-${report.quarter}`)
  );
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

  React.useEffect(() => {
    if (!agreedReports.some((report) => report.id === selectedReportId)) {
      setSelectedReportId(agreedReports[0]?.id ?? "");
    }
  }, [agreedReports, selectedReportId]);

  const selectedReport = agreedReports.find((report) => report.id === selectedReportId) ?? null;
  const parsedAmount = Number(amount.replace(",", "."));
  const bankName = bankChoice === "Другой банк" ? customBankName : bankChoice;
  const quarterAmount = selectedReport?.amount ?? 0;
  const canStart = Boolean(contractNumber && selectedReport) && Number.isFinite(parsedAmount) && parsedAmount >= minimumPayoutAmount && parsedAmount <= Math.min(availableToWithdraw, quarterAmount) && payoutWindow.isOpen;

  const updateReceipt = (field: keyof typeof receiptDetails, value: string) => setReceiptDetails((current) => ({ ...current, [field]: value }));

  function validateCurrentStep(): boolean {
    setNotice(null);
    if (step === 1 && !canStart) {
      setNotice(!contractNumber
        ? "Для заявки на выплату подпишите действующую версию лицензионного договора."
        : parsedAmount > 0 && parsedAmount < minimumPayoutAmount
        ? `Минимальная сумма выплаты — ${formatRubCurrency(minimumPayoutAmount)}.`
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
    if (!contractNumber) return;
    const html = receiptHtml({ recipientName, ...receiptDetails, amount: parsedAmount, quarterLabel: selectedReport.quarterLabel, bankName, accountNumber, bankBik, contractNumber });
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `receipt-${selectedReport.quarterLabel.replace(/\s+/gu, "-")}.html`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function previewReceipt() {
    if (!selectedReport || taxStatus !== "individual") return;
    if (!contractNumber) return;
    const html = receiptHtml({ recipientName, ...receiptDetails, amount: parsedAmount, quarterLabel: selectedReport.quarterLabel, bankName, accountNumber, bankBik, contractNumber });
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
      const createdPayout = {
        id: success.payoutRequestId,
        amount: parsedAmount,
        status: "REQUESTED" as const,
        createdAt: new Date().toISOString(),
        quarter: selectedReport.quarter,
        year: selectedReport.year,
        rejectionReason: null,
        recipientName: recipientName.trim() || null,
        bankName: bankName.trim() || null,
        accountDetails: accountNumber.trim() || null,
        bankBik: bankBik.trim() || null,
        taxId: taxId.trim() || null,
        contractNumber,
        supportingDocument: supportingDocument ? { key: supportingDocument.key, name: supportingDocument.name } : null
      };
      setPayoutRequests((current) => [createdPayout, ...current]);
      setAmount("");
      setSupportingDocument(null);
      setReceiptAcknowledged(false);
      setStep(1);
      setNotice("Заявка отправлена. Можно создать следующую заявку за другой квартал.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Не удалось отправить заявку."); }
    finally { setSubmitting(false); }
  }

  return <div className="space-y-4">
    <PayoutRequestHistory requests={payoutRequests} />
    <section className="rounded-[24px] border border-white/[0.09] bg-[#13151d] p-5 sm:p-7">
    <ol className="mb-7 flex items-center" aria-label="Этапы создания заявки">
      {steps.map((item, index) => <li key={item.id} className={cn("flex min-w-0 items-center", index < steps.length - 1 && "flex-1")}>
        <button type="button" disabled={item.id > step} onClick={() => setStep(item.id)} className="flex shrink-0 items-center gap-2 disabled:cursor-default">
          <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold transition-colors", item.id < step ? "bg-[#7b61ff] text-white" : item.id === step ? "bg-[#7b61ff] text-white ring-4 ring-[#7b61ff]/25" : "border border-white/12 bg-white/[0.03] text-white/40")}>{item.id < step ? <Check className="h-4 w-4" /> : item.id}</span>
          <span className={cn("hidden text-[13px] font-semibold sm:inline", item.id <= step ? "text-white" : "text-white/40")}>{item.label}</span>
        </button>
        {index < steps.length - 1 ? <span className={cn("mx-3 h-0.5 flex-1 rounded-full", item.id < step ? "bg-[#7b61ff]" : "bg-white/[0.08]")} /> : null}
      </li>)}
    </ol>
    {step === 1 ? <StepPayment reports={agreedReports} selectedReportId={selectedReportId} setSelectedReportId={setSelectedReportId} amount={amount} setAmount={setAmount} maxAmount={Math.min(availableToWithdraw, quarterAmount)} taxStatus={taxStatus} setTaxStatus={setTaxStatus} available={availableToWithdraw} minimum={minimumPayoutAmount} window={payoutWindow} contractNumber={contractNumber} /> : null}
    {step === 2 ? <StepRequisites recipientName={recipientName} setRecipientName={setRecipientName} bankChoice={bankChoice} setBankChoice={setBankChoice} customBankName={customBankName} setCustomBankName={setCustomBankName} accountNumber={accountNumber} setAccountNumber={setAccountNumber} bankBik={bankBik} setBankBik={setBankBik} taxId={taxId} setTaxId={setTaxId} /> : null}
    {step === 3 ? <StepDocuments taxStatus={taxStatus} selectedReport={selectedReport} recipientName={recipientName} receiptDetails={receiptDetails} updateReceipt={updateReceipt} receiptAcknowledged={receiptAcknowledged} setReceiptAcknowledged={setReceiptAcknowledged} supportingDocument={supportingDocument} uploading={uploading} uploadDocument={uploadDocument} downloadReceipt={downloadReceipt} previewReceipt={previewReceipt} /> : null}
    {step === 4 && selectedReport && contractNumber ? <StepReview report={selectedReport} amount={parsedAmount} taxStatus={taxStatus} recipientName={recipientName} bankName={bankName} accountNumber={accountNumber} bankBik={bankBik} taxId={taxId} document={supportingDocument} contractNumber={contractNumber} onEdit={setStep} /> : null}
    {notice ? <p className={cn("mt-5 rounded-xl border px-3.5 py-3 text-[13px] font-medium", notice.startsWith("Заявка отправлена") ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100" : "border-rose-400/25 bg-rose-500/10 text-rose-100")}>{notice}</p> : null}
    <div className="mt-7 flex flex-wrap justify-between gap-3 border-t border-white/[0.08] pt-5">
      {step > 1 ? <Button type="button" variant="outline" onClick={() => setStep((step - 1) as Step)} className="border-white/15 bg-white/[0.03]"><ChevronLeft className="mr-1 h-4 w-4" />Назад</Button> : <span />}
      {step < 4 ? <Button type="button" onClick={() => validateCurrentStep() && setStep((step + 1) as Step)} className="btn-shine"><span>Продолжить</span><ChevronRight className="ml-1 h-4 w-4" /></Button> : <Button type="button" onClick={() => void submit()} disabled={submitting} className="btn-shine">{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Отправить заявку</Button>}
    </div>
    </section>
  </div>;
}

function StepPayment({ reports, selectedReportId, setSelectedReportId, amount, setAmount, maxAmount, taxStatus, setTaxStatus, available, minimum, window, contractNumber }: StepPaymentProps) {
  const selected = reports.find((report: FinanceReportClientItem) => report.id === selectedReportId);
  const taxOptions: Array<{ id: TaxStatus; title: string; description: string; icon: React.ReactNode }> = [
    { id: "individual", title: "Физическое лицо", description: "Понадобится расписка — сформируем её на шаге «Документы».", icon: <UserRound className="h-5 w-5" /> },
    { id: "self_employed", title: "Самозанятый", description: "Понадобится чек из приложения «Мой налог».", icon: <Receipt className="h-5 w-5" /> }
  ];
  return <div>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-[22px] font-semibold text-white">Новая заявка на выплату</h2><p className="mt-1 text-[13.5px] text-white/50">Доступно {formatRubCurrency(available)} · минимум {formatRubCurrency(minimum)}</p></div>
      {contractNumber ? <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1.5 text-[12.5px] font-medium text-white/60"><FileText className="h-3.5 w-3.5" />Договор № {contractNumber}</span> : null}
    </div>
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <label className="text-[13px] font-semibold text-white/70">Отчётный период<select value={selectedReportId} onChange={(event) => setSelectedReportId(event.target.value)} className={fieldClass}><option value="">Выберите квартал</option>{reports.map((report: FinanceReportClientItem) => <option value={report.id} key={report.id}>{report.quarterLabel} · {formatRubCurrency(report.amount)}</option>)}</select></label>
      <label className="text-[13px] font-semibold text-white/70">Сумма выплаты<div className="relative"><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" className={cn(fieldClass, "pr-28")} /><button type="button" disabled={!selected || maxAmount <= 0} onClick={() => setAmount(String(maxAmount))} className="absolute right-2 top-1/2 mt-1 -translate-y-1/2 rounded-lg bg-[#7b61ff]/20 px-2.5 py-1.5 text-[12px] font-semibold text-[#c4b5fd] transition hover:bg-[#7b61ff]/30 disabled:opacity-40">Вся сумма</button></div></label>
    </div>
    {selected ? <p className="mt-3 text-[13px] text-white/50">По кварталу «{selected.quarterLabel}» доступно {formatRubCurrency(selected.amount)}. Одна заявка — один квартал.</p> : <p className="mt-3 text-[13px] text-amber-200">Нет согласованных отчётов, доступных для выплаты.</p>}
    <fieldset className="mt-6"><legend className="text-[13px] font-semibold text-white/70">Налоговый статус</legend><div className="mt-2 grid gap-3 sm:grid-cols-2">{taxOptions.map((option) => <label key={option.id} className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors", taxStatus === option.id ? "border-[#7b61ff]/60 bg-[#7b61ff]/12" : "border-white/[0.09] bg-white/[0.02] hover:border-white/[0.16]")}><input className="sr-only" type="radio" checked={taxStatus === option.id} onChange={() => setTaxStatus(option.id)} /><span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", taxStatus === option.id ? "bg-[#7b61ff] text-white" : "bg-white/[0.06] text-white/60")}>{option.icon}</span><span><span className="block font-semibold text-white">{option.title}</span><span className="mt-1 block text-[13px] leading-relaxed text-white/55">{option.description}</span></span></label>)}</div></fieldset>
    {!window.isOpen ? <p className="mt-5 flex items-center gap-2 rounded-xl border border-[#7b61ff]/25 bg-[#7b61ff]/10 px-3.5 py-3 text-[13px] text-[#ddd3ff]"><CalendarDays className="h-4 w-4 shrink-0" />{window.message} Создать заявку можно, когда окно выплат откроется.</p> : null}
  </div>;
}

function StepRequisites(props: StepRequisitesProps) { const banks = ["Т-Банк", "Сбербанк", "Альфа-Банк", "Газпромбанк", "Другой банк"]; return <div><h2 className="text-[22px] font-semibold text-white">Реквизиты получателя</h2><p className="mt-2 text-[14px] text-white/55">Выплата выполняется банковским переводом.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-[13px] font-semibold text-white/70 sm:col-span-2">ФИО / Получатель<input value={props.recipientName} onChange={(e) => props.setRecipientName(e.target.value)} className={fieldClass} /></label><label className="text-[13px] font-semibold text-white/70">Банк<select value={props.bankChoice} onChange={(e) => props.setBankChoice(e.target.value)} className={fieldClass}>{banks.map((bank) => <option key={bank}>{bank}</option>)}</select></label>{props.bankChoice === "Другой банк" ? <label className="text-[13px] font-semibold text-white/70">Название банка<input value={props.customBankName} onChange={(e) => props.setCustomBankName(e.target.value)} className={fieldClass} /></label> : <div /> }<label className="text-[13px] font-semibold text-white/70">Номер счета<input inputMode="numeric" value={props.accountNumber} onChange={(e) => props.setAccountNumber(e.target.value)} className={fieldClass} /></label><label className="text-[13px] font-semibold text-white/70">БИК банка<input inputMode="numeric" maxLength={9} value={props.bankBik} onChange={(e) => props.setBankBik(e.target.value.replace(/\D/gu, ""))} className={fieldClass} /></label><label className="text-[13px] font-semibold text-white/70 sm:col-span-2">ИНН / Налоговый ID<input value={props.taxId} onChange={(e) => props.setTaxId(e.target.value)} className={fieldClass} /></label></div></div>; }

function StepDocuments({ taxStatus, selectedReport, recipientName, receiptDetails, updateReceipt, receiptAcknowledged, setReceiptAcknowledged, supportingDocument, uploading, uploadDocument, downloadReceipt, previewReceipt }: StepDocumentsProps) { const receiptReady = Object.values(receiptDetails).every(Boolean); return <div><h2 className="text-[22px] font-semibold text-white">Документы</h2>{selectedReport ? <a className="mt-4 flex items-center justify-between rounded-2xl border border-white/[0.1] bg-white/[0.03] p-4 text-white hover:border-[#7b3df5]/45" href={`/api/finance/reports/${encodeURIComponent(selectedReport.id)}/statement`} target="_blank" rel="noreferrer"><span><strong className="block">Отчетная ведомость</strong><span className="mt-1 block text-[13px] text-white/55">{selectedReport.quarterLabel}</span></span><span className="flex items-center gap-2 text-[13px] font-semibold"><Download className="h-4 w-4" />Скачать</span></a> : null}{taxStatus === "individual" ? <><div className="mt-5 rounded-2xl border border-white/[0.1] bg-white/[0.02] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-white">Расписка о получении вознаграждения</h3><p className="mt-1 text-[13px] text-white/55">Сформируйте, перепишите от руки, подпишите и прикрепите скан или PDF.</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={previewReceipt} disabled={!recipientName.trim() || !receiptReady}>Просмотреть</Button><Button type="button" variant="outline" onClick={downloadReceipt} disabled={!recipientName.trim() || !receiptReady}><Download className="mr-2 h-4 w-4" />Скачать расписку</Button></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-[13px] font-semibold text-white/70">Серия паспорта<input maxLength={4} value={receiptDetails.passportSeries} onChange={(e) => updateReceipt("passportSeries", e.target.value.replace(/\D/gu, ""))} className={fieldClass} /></label><label className="text-[13px] font-semibold text-white/70">Номер паспорта<input maxLength={6} value={receiptDetails.passportNumber} onChange={(e) => updateReceipt("passportNumber", e.target.value.replace(/\D/gu, ""))} className={fieldClass} /></label><label className="text-[13px] font-semibold text-white/70 sm:col-span-2">Кем выдан<input value={receiptDetails.passportIssuedBy} onChange={(e) => updateReceipt("passportIssuedBy", e.target.value)} className={fieldClass} /></label><label className="text-[13px] font-semibold text-white/70">Дата выдачи<input type="date" value={receiptDetails.passportIssueDate} onChange={(e) => updateReceipt("passportIssueDate", e.target.value)} className={fieldClass} /></label><label className="text-[13px] font-semibold text-white/70">Дата рождения<input type="date" value={receiptDetails.birthDate} onChange={(e) => updateReceipt("birthDate", e.target.value)} className={fieldClass} /></label><label className="text-[13px] font-semibold text-white/70 sm:col-span-2">Адрес регистрации<input value={receiptDetails.registrationAddress} onChange={(e) => updateReceipt("registrationAddress", e.target.value)} className={fieldClass} /></label></div><label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300/20 bg-amber-400/[0.06] p-3 text-[13px] leading-relaxed text-amber-50"><input type="checkbox" checked={receiptAcknowledged} onChange={(event) => setReceiptAcknowledged(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#8b5cf6]" /><span>Подтверждаю: сформированная расписка является примером. Я перепишу ее от руки, подпишу и загружу подписанный скан или PDF.</span></label></div></> : <div className="mt-5 rounded-2xl border border-white/[0.1] bg-white/[0.02] p-4"><h3 className="font-semibold text-white">Чек «Мой налог»</h3><p className="mt-1 text-[13px] text-white/55">Прикрепите чек на сумму текущей выплаты, сформированный в приложении «Мой налог».</p></div>}<label className="mt-5 flex cursor-pointer items-center justify-center gap-3 rounded-2xl border border-dashed border-[#8b5cf6]/45 bg-[#7b3df5]/[0.06] px-5 py-8 text-center"><input className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => void uploadDocument(event.target.files?.[0])} /><Upload className="h-5 w-5 text-[#b9a0ff]" /><span><strong className="block text-white">{supportingDocument ? "Заменить документ" : "Перетащите файл сюда или выберите файл"}</strong><span className="mt-1 block text-[13px] text-white/55">PDF, JPG или PNG до 10 МБ</span></span></label>{uploading ? <p className="mt-3 flex items-center gap-2 text-[13px] text-white/65"><Loader2 className="h-4 w-4 animate-spin" />Загрузка…</p> : null}{supportingDocument ? <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3.5 py-3 text-[13px] text-emerald-100"><span className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0" /><span className="truncate">{supportingDocument.name} · {(supportingDocument.size / 1024 / 1024).toFixed(2)} МБ</span></span><button type="button" className="ml-3 underline" onClick={() => supportingDocument && (window.open(`/api/finance/payouts/document?key=${encodeURIComponent(supportingDocument.key)}`, "_blank"))}>Открыть</button></div> : null}</div>; }

function StepReview({ report, amount, taxStatus, recipientName, bankName, accountNumber, bankBik, taxId, document, contractNumber, onEdit }: StepReviewProps) { return <div><h2 className="text-[22px] font-semibold text-white">Проверьте заявку</h2><div className="mt-5 rounded-2xl border border-[#8b5cf6]/35 bg-gradient-to-br from-[#7b3df5]/20 to-transparent p-5"><p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#c7b5ff]">К выплате</p><p className="mt-1 text-[34px] font-semibold text-white">{formatRubCurrency(amount)}</p></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><Summary title="Выплата" edit={() => onEdit(1)} lines={[report.quarterLabel, formatRubCurrency(amount), `Договор № ${contractNumber}`, taxStatus === "individual" ? "Физическое лицо" : "Самозанятый"]} /><Summary title="Получатель" edit={() => onEdit(2)} lines={[recipientName, bankName, `Счет ${mask(accountNumber)}`, `БИК ${bankBik}`, `ИНН ${mask(taxId)}`]} /><Summary title="Документы" edit={() => onEdit(3)} lines={["✓ Отчетная ведомость", `✓ ${taxStatus === "individual" ? "Расписка" : "Чек «Мой налог»"}`, document?.name ?? "—"]} /></div></div>; }

function Summary({ title, lines, edit }: { title: string; lines: string[]; edit: () => void }) { return <section className="rounded-2xl border border-white/[0.09] bg-white/[0.025] p-4"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-white">{title}</h3><button type="button" onClick={edit} className="text-[12px] font-semibold text-[#c5b3ff] hover:text-white">Изменить</button></div><div className="mt-3 space-y-1 text-[13px] leading-relaxed text-white/62">{lines.map((line) => <p key={line}>{line}</p>)}</div></section>; }

function PayoutRequestHistory({ requests }: { requests: PayoutRequestSummary[] }) {
  const [openedRequest, setOpenedRequest] = React.useState<PayoutRequestSummary | null>(null);
  const [showArchived, setShowArchived] = React.useState(false);
  // Старые отклонённые заявки на 0 ₽ только мешают — прячем их под «Показать ещё».
  const isArchived = (request: PayoutRequestSummary) => request.status === "REJECTED" && request.amount <= 0;
  const archivedCount = requests.filter(isArchived).length;
  const visibleRequests = showArchived ? requests : requests.filter((request) => !isArchived(request));
  const status = (value: PayoutRequestSummary["status"]) => {
    if (value === "PROCESSING") return { label: "В обработке", tone: "border-sky-400/25 bg-sky-500/10 text-sky-100" };
    if (value === "PAID") return { label: "Выплачена", tone: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100" };
    if (value === "REJECTED") return { label: "Отклонена", tone: "border-rose-400/25 bg-rose-500/10 text-rose-100" };
    return { label: "На проверке", tone: "border-amber-400/25 bg-amber-500/10 text-amber-100" };
  };

  const groups = visibleRequests.reduce<Array<{ key: string; label: string; requests: PayoutRequestSummary[] }>>((result, request) => {
    const hasPeriod = Boolean(request.quarter && request.year);
    const key = hasPeriod ? `${request.year}-${request.quarter}` : "legacy";
    const label = hasPeriod ? quarterLabel(request.quarter!, request.year!) : "Без привязки к кварталу";
    const current = result.find((group) => group.key === key);
    if (current) current.requests.push(request);
    else result.push({ key, label, requests: [request] });
    return result;
  }, []);
  const requestCountLabel = (count: number) => {
    if (count % 10 === 1 && count % 100 !== 11) return "заявка";
    if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)) return "заявки";
    return "заявок";
  };

  const statusIcon = (value: PayoutRequestSummary["status"]) => {
    if (value === "PAID") return { icon: <Check className="h-[18px] w-[18px]" />, tone: "bg-emerald-500/12 text-emerald-300" };
    if (value === "REJECTED") return { icon: <X className="h-[18px] w-[18px]" />, tone: "bg-rose-500/12 text-rose-300" };
    if (value === "PROCESSING") return { icon: <Loader2 className="h-[18px] w-[18px]" />, tone: "bg-sky-500/12 text-sky-300" };
    return { icon: <Clock3 className="h-[18px] w-[18px]" />, tone: "bg-amber-400/12 text-amber-300" };
  };

  return <section className="rounded-[24px] border border-white/[0.09] bg-[#13151d] p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className="text-[18px] font-semibold text-white">Заявки на выплату</h2>
        <p className="mt-1 text-[13px] text-white/50">Каждая заявка привязана к своему квартальному отчёту.</p>
      </div>
      <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[12px] font-semibold text-white/60">{requests.length} {requestCountLabel(requests.length)}</span>
    </div>
    {groups.length ? <div className="mt-5 space-y-5">{groups.map((group) => <div key={group.key}>
      <div className="flex items-center justify-between gap-2 pb-2"><h3 className="text-[15px] font-semibold text-white">{group.label}</h3><span className="text-[12px] text-white/45">{group.requests.length} {requestCountLabel(group.requests.length)}</span></div>
      <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">{group.requests.map((request) => { const current = status(request.status); const mark = statusIcon(request.status); return <div key={request.id} className="flex gap-3.5 py-3.5">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", mark.tone)}>{mark.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-0"><p className="truncate text-[14.5px] font-semibold text-white">Заявка №{request.id.slice(0, 8)}</p><p className="mt-0.5 text-[12.5px] text-white/45">{new Date(request.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</p></div>
            <div className="text-right"><p className="text-[16px] font-bold tabular-nums text-white">{formatRubCurrency(request.amount)}</p><div className="mt-1 flex items-center justify-end gap-2"><span className={cn("rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold", current.tone)}>{current.label}</span><button type="button" onClick={() => setOpenedRequest(request)} className="text-[12px] font-semibold text-white/55 hover:text-white">Подробнее</button></div></div>
          </div>
          {request.status === "REJECTED" && request.rejectionReason ? <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-500/[0.07] px-3 py-2 text-[13px] leading-relaxed text-rose-100"><MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" /><span><span className="font-semibold">Причина:</span> {request.rejectionReason}</span></div> : null}
        </div>
      </div>; })}</div>
    </div>)}</div> : <p className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-4 text-[13px] text-white/55">Заявок пока нет. Создайте первую заявку ниже.</p>}
    {archivedCount > 0 ? <button type="button" onClick={() => setShowArchived((value) => !value)} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/50 hover:text-white"><ChevronDown className={cn("h-4 w-4 transition-transform", showArchived && "rotate-180")} />{showArchived ? "Скрыть старые заявки" : `Показать ещё ${archivedCount} ${requestCountLabel(archivedCount)} на 0 ₽`}</button> : null}
    {openedRequest ? <PayoutRequestDetailsModal request={openedRequest} onClose={() => setOpenedRequest(null)} /> : null}
  </section>;
}

function PayoutRequestDetailsModal({ request, onClose }: { request: PayoutRequestSummary; onClose: () => void }) {
  const period = request.quarter && request.year ? quarterLabel(request.quarter, request.year) : "Период не указан";
  const rows = [["Сумма", formatRubCurrency(request.amount)], ["Период", period], ["Лицензионный договор", request.contractNumber ? `№ ${request.contractNumber}` : "Не указан"], ["Дата заявки", new Date(request.createdAt).toLocaleDateString("ru-RU")], ["Получатель", request.recipientName || "Не указан"], ["Банк", request.bankName || "Не указан"], ["Счёт", request.accountDetails || "Не указан"], ["БИК", request.bankBik || "Не указан"], ["ИНН", request.taxId || "Не указан"]];
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Заявка на выплату"><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/[0.12] bg-[#161720] p-5 shadow-2xl"><div className="flex items-center justify-between gap-3"><div><h2 className="text-[20px] font-semibold text-white">Заявка на выплату</h2><p className="mt-1 text-[13px] text-white/50">№{request.id}</p></div><button type="button" onClick={onClose} className="rounded-lg border border-white/[0.1] px-2.5 py-1 text-[13px] text-white/70 hover:bg-white/[0.06]">Закрыть</button></div><dl className="mt-5 grid gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 text-[13px] sm:grid-cols-2">{rows.map(([label, value]) => <div key={label}><dt className="text-white/45">{label}</dt><dd className="mt-1 break-words text-white/90">{value}</dd></div>)}</dl>{request.supportingDocument ? <a className="mt-4 inline-flex rounded-lg border border-[#9f7aea]/40 bg-[#7b3df5]/15 px-3 py-2 text-[13px] font-medium text-[#dfd4ff] hover:bg-[#7b3df5]/25" href={`/api/finance/payouts/document?key=${encodeURIComponent(request.supportingDocument.key)}`} target="_blank" rel="noreferrer">Открыть документ: {request.supportingDocument.name}</a> : null}{request.rejectionReason ? <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/[0.07] px-3 py-3 text-[13px] leading-relaxed text-rose-100"><p className="font-semibold">Причина отклонения</p><p className="mt-1">{request.rejectionReason}</p></div> : null}</div></div>;
}
