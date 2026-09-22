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
