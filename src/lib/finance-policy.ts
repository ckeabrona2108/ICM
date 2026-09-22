import { z } from "zod";

export const financeReportStatusSchema = z.enum(["ready_to_confirm", "changes_requested", "agreed"]);
export type FinanceReportStatus = z.infer<typeof financeReportStatusSchema>;

const payoutMethodSchema = z.literal("bank_transfer");
export type PayoutMethod = z.infer<typeof payoutMethodSchema>;

export const payoutTaxStatusSchema = z.enum(["individual", "self_employed"]);
export type PayoutTaxStatus = z.infer<typeof payoutTaxStatusSchema>;

const payoutDocumentSchema = z.object({
  key: z.string().trim().regex(/^private\/payout-documents\/[a-zA-Z0-9-]+\/[a-zA-Z0-9._-]+$/u),
  name: z.string().trim().min(1).max(180),
  size: z.number().int().positive().max(10 * 1024 * 1024),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png"])
});

export interface PayoutValidationIssue {
  code: string;
  field: string;
  message: string;
}

export const payoutRequestSchema = z.object({
  amount: z.number().finite(),
  quarter: z.number().int().min(1).max(4),
  year: z.number().int().min(2020).max(2100),
  taxStatus: payoutTaxStatusSchema,
  requisites: z.object({
    recipientName: z.string().trim(),
    payoutMethod: payoutMethodSchema,
    accountNumber: z.string().trim().optional().default(""),
    bankName: z.string().trim().optional().default(""),
    bankBik: z.string().trim().optional().default(""),
    taxId: z.string().trim().optional().default("")
  }),
  documents: z.object({
    reportId: z.string().uuid(),
    supportingDocument: payoutDocumentSchema,
    receiptDetails: z.object({
      passportSeries: z.string().trim().min(4).max(4),
      passportNumber: z.string().trim().min(6).max(6),
      passportIssuedBy: z.string().trim().min(2).max(500),
      passportIssueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
      birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
      registrationAddress: z.string().trim().min(5).max(500)
    }).optional(),
    receiptAcknowledged: z.literal(true).optional()
  })
});

export type PayoutRequestInput = z.infer<typeof payoutRequestSchema>;

export interface PayoutServerContext {
  availableBalance: number;
  pendingReportsCount: number;
  minimumPayoutAmount: number;
  reportStatuses: FinanceReportStatus[];
  payoutWindowOpen?: boolean;
  payoutWindowMessage?: string;
  selectedQuarterBalance?: number;
  duplicateQuarterRequest?: boolean;
}

function pushIssue(
  issues: PayoutValidationIssue[],
  code: string,
  field: string,
  message: string
) {
  issues.push({ code, field, message });
}

export function validatePayoutRequest(
  input: PayoutRequestInput,
  context: PayoutServerContext
): PayoutValidationIssue[] {
  const issues: PayoutValidationIssue[] = [];

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    pushIssue(
      issues,
      "invalid",
      "amount",
      "Сумма выплаты должна быть больше нуля."
    );
  }

  if (!Number.isFinite(context.availableBalance) || context.availableBalance <= 0) {
    pushIssue(
      issues,
      "invalid",
      "availableBalance",
      "Недостаточно доступных средств для выплаты."
    );
  }

  if (input.amount > context.availableBalance) {
    pushIssue(
      issues,
      "invalid",
      "amount",
      "Сумма выплаты превышает доступный баланс по согласованным отчетам."
    );
  }

  if (!Number.isFinite(context.selectedQuarterBalance) || (context.selectedQuarterBalance ?? 0) <= 0) {
    pushIssue(
      issues,
      "invalid",
      "quarter",
      "За выбранный квартал нет согласованного отчета с доступными средствами."
    );
  } else if (input.amount > (context.selectedQuarterBalance ?? 0)) {
    pushIssue(
      issues,
      "invalid",
      "amount",
      "Сумма выплаты превышает доступную сумму по выбранному кварталу."
    );
  }

  if (context.duplicateQuarterRequest) {
    pushIssue(
      issues,
      "forbidden",
      "quarter",
      "По выбранному кварталу уже создана заявка на выплату."
    );
  }

  if (context.minimumPayoutAmount > 0 && input.amount < context.minimumPayoutAmount) {
    pushIssue(
      issues,
      "invalid",
      "amount",
      `Минимальная сумма выплаты — ${context.minimumPayoutAmount.toFixed(2)}.`
    );
  }

  if (context.pendingReportsCount > 0) {
    pushIssue(
      issues,
      "forbidden",
      "pendingReportsCount",
      "Выплата недоступна: сначала согласуйте все отчеты в разделе «Финансы и отчеты»."
    );
  }

  if (context.reportStatuses.some((status) => status === "ready_to_confirm")) {
    pushIssue(
      issues,
      "forbidden",
      "reportStatuses",
      "Выплата недоступна: есть отчеты со статусом «Согласовать»."
    );
  }

  if (context.payoutWindowOpen === false) {
    pushIssue(
      issues,
      "forbidden",
      "payoutWindow",
      context.payoutWindowMessage || "Заявку на выплату можно создать только в период выплат."
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

    if (!input.requisites.bankBik.trim()) {
      pushIssue(
        issues,
        "required",
        "requisites.bankBik",
        "Укажите БИК банка."
      );
    } else if (!/^\d{9}$/u.test(input.requisites.bankBik.trim())) {
      pushIssue(
        issues,
        "invalid",
        "requisites.bankBik",
        "БИК должен состоять из 9 цифр."
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

  if (input.taxStatus === "individual" && !input.documents.receiptDetails) {
    pushIssue(
      issues,
      "required",
      "documents.receiptDetails",
      "Заполните данные для расписки."
    );
  }

  if (input.taxStatus === "individual" && input.documents.receiptAcknowledged !== true) {
    pushIssue(
      issues,
      "required",
      "documents.receiptAcknowledged",
      "Подтвердите, что расписку нужно переписать от руки, подписать и загрузить."
    );
  }

  return issues;
}
