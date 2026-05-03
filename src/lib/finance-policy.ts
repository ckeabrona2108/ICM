import { z } from "zod";

export const financeReportStatusSchema = z.enum(["ready_to_confirm", "agreed"]);
export type FinanceReportStatus = z.infer<typeof financeReportStatusSchema>;

const payoutMethodSchema = z.enum(["bank_transfer", "paypal", "other"]);
export type PayoutMethod = z.infer<typeof payoutMethodSchema>;

export interface PayoutValidationIssue {
  code: string;
  field: string;
  message: string;
}

export const payoutRequestSchema = z.object({
  amount: z.number(),
  availableBalance: z.number(),
  pendingReportsCount: z.number().int().min(0),
  minimumPayoutAmount: z.number().min(0).optional().default(0),
  reportStatuses: z.array(financeReportStatusSchema).optional().default([]),
  requisites: z.object({
    recipientName: z.string().trim(),
    payoutMethod: payoutMethodSchema,
    accountNumber: z.string().trim().optional().default(""),
    bankName: z.string().trim().optional().default(""),
    paypalEmail: z.string().trim().optional().default(""),
    taxId: z.string().trim().optional().default("")
  })
});

export type PayoutRequestInput = z.infer<typeof payoutRequestSchema>;

function pushIssue(
  issues: PayoutValidationIssue[],
  code: string,
  field: string,
  message: string
) {
  issues.push({ code, field, message });
}

export function validatePayoutRequest(input: PayoutRequestInput): PayoutValidationIssue[] {
  const issues: PayoutValidationIssue[] = [];

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    pushIssue(
      issues,
      "invalid",
      "amount",
      "Сумма выплаты должна быть больше нуля."
    );
  }

  if (!Number.isFinite(input.availableBalance) || input.availableBalance <= 0) {
    pushIssue(
      issues,
      "invalid",
      "availableBalance",
      "Недостаточно доступных средств для выплаты."
    );
  }

  if (input.amount > input.availableBalance) {
    pushIssue(
      issues,
      "invalid",
      "amount",
      "Сумма выплаты превышает доступный баланс по согласованным отчетам."
    );
  }

  if (input.minimumPayoutAmount > 0 && input.amount < input.minimumPayoutAmount) {
    pushIssue(
      issues,
      "invalid",
      "amount",
      `Минимальная сумма выплаты — ${input.minimumPayoutAmount.toFixed(2)}.`
    );
  }

  if (input.pendingReportsCount > 0) {
    pushIssue(
      issues,
      "forbidden",
      "pendingReportsCount",
      "Выплата недоступна: сначала согласуйте все отчеты в разделе «Финансы и отчеты»."
    );
  }

  if (input.reportStatuses.some((status) => status === "ready_to_confirm")) {
    pushIssue(
      issues,
      "forbidden",
      "reportStatuses",
      "Выплата недоступна: есть отчеты со статусом «Согласовать»."
    );
  }

  if (!input.requisites.recipientName.trim()) {
    pushIssue(
      issues,
      "required",
      "requisites.recipientName",
      "Укажите получателя выплаты."
    );
  }

  if (input.requisites.payoutMethod === "bank_transfer") {
    if (!input.requisites.accountNumber.trim()) {
      pushIssue(
        issues,
        "required",
        "requisites.accountNumber",
        "Укажите номер банковского счета или IBAN."
      );
    } else if (input.requisites.accountNumber.trim().length < 8) {
      pushIssue(
        issues,
        "invalid",
        "requisites.accountNumber",
        "Номер счета выглядит слишком коротким."
      );
    }

    if (!input.requisites.bankName.trim()) {
      pushIssue(
        issues,
        "required",
        "requisites.bankName",
        "Укажите название банка."
      );
    }

    if (!input.requisites.taxId.trim()) {
      pushIssue(
        issues,
        "required",
        "requisites.taxId",
        "Укажите ИНН/налоговый идентификатор получателя."
      );
    }
  }

  if (input.requisites.payoutMethod === "paypal") {
    if (!input.requisites.paypalEmail.trim()) {
      pushIssue(
        issues,
        "required",
        "requisites.paypalEmail",
        "Укажите PayPal e-mail для выплаты."
      );
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(input.requisites.paypalEmail.trim())) {
      pushIssue(
        issues,
        "invalid",
        "requisites.paypalEmail",
        "Укажите корректный PayPal e-mail."
      );
    }
  }

  if (input.requisites.payoutMethod === "other" && !input.requisites.accountNumber.trim()) {
    pushIssue(
      issues,
      "required",
      "requisites.accountNumber",
      "Укажите реквизиты для выбранного способа выплаты."
    );
  }

  return issues;
}
