export const CONTRACT_VERSION = "2026-05";
export const CONTRACT_FILE_NAME = "contract-2026-05.pdf";
export const CONTRACT_FILE_URL = "/docs/contract-2026-05.pdf";
export const CONTRACT_NUMBER_START = 1534;

export type ContractSignatureStatus =
  | "unavailable"
  | "not_signed"
  | "pending"
  | "approved"
  | "rejected"
  | "invalid_signature"
  | "update_required";

export interface ContractStatusPayload {
  status: ContractSignatureStatus;
  signed: boolean;
  isVerified: boolean;
  canSubmitReleases: boolean;
  canCreateRelease: boolean;
  signedAt: string | null;
  contractVersion: string | null;
  contractNumber: number | null;
  reason: string;
  rejectionReason: string | null;
  rejectionKind: "rejected" | "cancelled" | null;
  verificationId: string | null;
  signerData?: ContractSignerFormData | null;
}

export interface ContractSignerFormData {
  fullName: string;
  birthDate?: string | null;
  passportNumber?: string | null;
  passportIssuedBy?: string | null;
  passportCode?: string | null;
  passportIssueDate?: string | null;
  address?: string | null;
  ogrnip?: string | null;
  inn?: string | null;
  snils?: string | null;
  confirmationAccepted: boolean;
}

export interface ContractSignerValidationIssue {
  field: keyof ContractSignerFormData;
  message: string;
}

export const CONTRACT_SIGNER_MIN_AGE = 14;
export const CONTRACT_SIGNER_MAX_AGE = 110;

function parseSignerDate(value: string): { year: number; month: number; day: number } | null {
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(trimmed);
  const ru = /^(\d{2})\.(\d{2})\.(\d{4})$/u.exec(trimmed);
  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : ru
      ? { year: Number(ru[3]), month: Number(ru[2]), day: Number(ru[1]) }
      : null;
  if (!parts) return null;
  const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    check.getUTCFullYear() !== parts.year ||
    check.getUTCMonth() !== parts.month - 1 ||
    check.getUTCDate() !== parts.day
  ) {
    return null;
  }
  return parts;
}

/**
 * Returns an error message when the birth date is missing, malformed, in the future
 * or gives an age outside what a passport holder can have; otherwise null.
 */
export function getContractBirthDateIssue(value: string | null | undefined, now: Date = new Date()): string | null {
  if (!value?.trim()) return "Укажите дату рождения.";
  const parts = parseSignerDate(value);
  if (!parts) return "Укажите дату рождения в формате ДД.ММ.ГГГГ.";

  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();
  let age = todayYear - parts.year;
  if (todayMonth < parts.month || (todayMonth === parts.month && todayDay < parts.day)) age -= 1;

  if (age < 0) return "Дата рождения не может быть в будущем. Проверьте год.";
  if (age < CONTRACT_SIGNER_MIN_AGE) {
    return `Проверьте год рождения: договор подписывает владелец паспорта старше ${CONTRACT_SIGNER_MIN_AGE} лет.`;
  }
  if (age > CONTRACT_SIGNER_MAX_AGE) return "Проверьте год рождения.";
  return null;
}
