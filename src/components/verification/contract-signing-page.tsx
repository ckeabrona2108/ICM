"use client";

import type { ContractSignerFormData } from "@/lib/contract-verification-shared";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function valueOrDash(value: string | null | undefined): string {
  return value?.trim() || "—";
}

function formatShortName(value: string | null | undefined): string {
  const parts = value?.trim().split(/\s+/u).filter(Boolean) ?? [];
  if (parts.length === 0) return "—";
  const initials = parts.slice(1, 3).map((part) => `${part[0]}.`).join(" ");
  return [parts[0], initials].filter(Boolean).join(" ");
}

export function ContractSigningPage({
  signerData,
  signatureDataUrl,
  signedAt,
  pseudonym
}: {
  signerData?: Partial<ContractSignerFormData> | null;
  signatureDataUrl?: string | null;
  signedAt?: string | null;
  pseudonym?: string | null;
}) {
  return (
    <section className="rounded-sm border border-slate-200 bg-white px-5 py-7 text-slate-900 shadow-[0_24px_70px_-42px_rgba(0,0,0,0.8)] sm:px-9">
      <p className="text-center text-[15px] font-bold uppercase tracking-[0.08em]">12. Адреса, банковские реквизиты и подписи сторон</p>
      <div className="mt-7 grid gap-8 border-t border-slate-300 pt-6 md:grid-cols-2">
        <div className="space-y-2 text-[13px] leading-relaxed">
          <p className="font-bold">Лицензиар</p>
          <p>Гражданин Российской Федерации</p>
          <p>{valueOrDash(signerData?.fullName)}</p>
          {pseudonym?.trim() ? <p>Псевдоним: {pseudonym.trim()}</p> : null}
          <p>Дата рождения: {formatDate(signerData?.birthDate)}</p>
          <p>Паспорт: {valueOrDash(signerData?.passportNumber)}</p>
          <p>Выдан: {valueOrDash(signerData?.passportIssuedBy)}</p>
          <p>Код подразделения: {valueOrDash(signerData?.passportCode)}</p>
          <p>Дата выдачи: {formatDate(signerData?.passportIssueDate)}</p>
          <p>Адрес места регистрации: {valueOrDash(signerData?.address)}</p>
          <p>ОГРНИП: {valueOrDash(signerData?.ogrnip)}</p>
          <p>ИНН: {valueOrDash(signerData?.inn)}</p>
          <p>СНИЛС: {valueOrDash(signerData?.snils)}</p>
          <div className="mt-6 border-t border-slate-300 pt-3">
            <p className="text-[12px] text-slate-600">Подпись Лицензиара</p>
            <div className="mt-2 flex items-center gap-4">
              <div className="flex min-h-24 min-w-52 items-center rounded border border-dashed border-slate-400 bg-slate-50 px-3">
                {signatureDataUrl ? (
                  <img src={signatureDataUrl} alt="Подпись Лицензиара" className="max-h-20 max-w-full object-contain" />
                ) : (
                  <span className="text-[12px] text-slate-500">Подпись появится здесь после подписания</span>
                )}
              </div>
              <p className="whitespace-nowrap text-[15px] italic">/{formatShortName(signerData?.fullName)}/</p>
            </div>
            {signedAt ? <p className="mt-2 text-[11px] text-slate-500">Подписано: {signedAt}</p> : null}
          </div>
        </div>
        <div className="space-y-2 text-[13px] leading-relaxed">
          <p className="font-bold">Лицензиат</p>
          <p>Индивидуальный предприниматель</p>
          <p>Шманцарь Вячеслав Васильевич</p>
          <p>ИНН: 391301950740</p>
          <p>ОГРН: 324390000034601</p>
          <p>Расчетный счет: 40802810400006347247</p>
          <p>Банк: АО «ТБанк», г. Москва</p>
          <p>БИК: 044525974</p>
          <p>Корр. счет: 30101810145250000974</p>
          <div className="mt-6 border-t border-slate-300 pt-3">
            <p className="text-[12px] text-slate-600">Подпись Лицензиата</p>
            <div className="mt-2 flex min-h-24 items-center gap-4">
              <img
                src="/docs/licensee-signature.png"
                alt="Подпись Лицензиата"
                className="max-h-20 w-52 object-contain"
              />
              <p className="whitespace-nowrap text-[15px] italic">/Шманцарь В. В./</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
