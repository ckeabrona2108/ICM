export const CONTRACT_VERSION = "2026-01";
export const CONTRACT_FILE_NAME = "contract-2026-01.pdf";
export const CONTRACT_FILE_URL = "/docs/contract-2026-01.pdf";

export type ContractSignatureStatus =
  | "not_signed"
  | "pending"
  | "approved"
  | "rejected"
  | "invalid_signature";

export interface ContractStatusPayload {
  status: ContractSignatureStatus;
  signed: boolean;
  isVerified: boolean;
  canSubmitReleases: boolean;
  canCreateRelease: boolean;
  signedAt: string | null;
  contractVersion: string | null;
  reason: string;
  rejectionReason: string | null;
  rejectionKind: "rejected" | "cancelled" | null;
  verificationId: string | null;
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
