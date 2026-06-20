export type CabinetReleaseStatus =
  | "draft"
  | "pending_verification"
  | "moderation"
  | "changes_required"
  | "rejected"
  | "approved"
  | "distributed"
  | "archived";

export interface CabinetTrack {
  num: number;
  title: string;
  duration: string;
}

export interface ModerationRemark {
  field: string;
  message: string;
  section?: string;
}

export interface CabinetRelease {
  id: string;
  number: number;
  coverUrl: string;
  coverUrlCandidates?: string[];
  cover?: string;
  title?: string;
  artist?: string;
  upc: string;
  isrc?: string;
  label: string;
  createdAt?: string;
  preorderDate: string;
  releaseDate: string;
  startDate: string;
  territories: string;
  territoriesCount?: number;
  platforms: string;
  platformsCount?: number;
  genre: string;
  status: CabinetReleaseStatus;
  paid: boolean;
  paymentKind?: "paid" | "subscription" | "unpaid" | "partner_code";
  paymentLabel?: string;
  paymentUsage?: string | null;
  paymentPlan?: "STANDARD" | "PRO" | "ENTERPRISE" | null;
  tracks: CabinetTrack[];
  moderationStep?: 1 | 2 | 3 | 4;
  releaseCatalogId?: string;
  moderationStatusTag?: string;
  moderationStarted?: boolean;
  moderationRemarks?: ModerationRemark[];
  moderationReturnedAt?: string;
  rejectionReason?: string;
  priority?: boolean;
  submissionData?: unknown;
}
