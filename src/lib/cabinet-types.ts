export type CabinetReleaseStatus =
  | "draft"
  | "pending_verification"
  | "moderation"
  | "changes_required"
  | "rejected"
  | "approved"
  | "distributed"
  | "dsp_confirmed"
  | "archived";

export interface CabinetTrackPerson {
  name: string;
  role: string;
}

export interface CabinetTrack {
  num: number;
  title: string;
  duration: string;
  subtitle?: string;
  audioUrl?: string | null;
  isrc?: string | null;
  partnerCode?: string | null;
  trackPersons?: CabinetTrackPerson[];
  contributors?: unknown;
  copyrightPct?: string | null;
  relatedRightsPct?: string | null;
  previewStart?: string | null;
  focusTrack?: boolean;
  versionExplicit?: boolean;
  metadataLanguage?: string | null;
  durationSec?: number | null;
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
  paymentKind?: "paid" | "subscription" | "unpaid" | "partner_code" | "free_first_release";
  paymentLabel?: string;
  paymentUsage?: string | null;
  paymentPlan?: "STANDARD" | "PRO" | "ENTERPRISE" | null;
  /** "Ваша доля 90 / 95 / 100%"; absent for contract, individual and label rates. */
  share?: import("@/lib/release-share").ReleaseShare | null;
  tracks: CabinetTrack[];
  moderationStep?: 1 | 2 | 3 | 4;
  releaseCatalogId?: string;
  moderationStatusTag?: string;
  moderationStarted?: boolean;
  /** A moderator took the release in work: it cannot be changed or withdrawn until their decision. */
  moderationClaimed?: boolean;
  moderationRemarks?: ModerationRemark[];
  moderationReturnedAt?: string;
  /** ISO time the moderators got the current version (sent, or paid later): late moderation counts from it. */
  moderationSentAt?: string;
  rejectionReason?: string;
  priority?: boolean;
  deletionStatus?: "requested" | "deleted" | "restored";
  deletionRequestedAt?: string;
  earlyRussiaStart?: boolean;
  submissionData?: unknown;
  sceneShowcase?: import("@/lib/scene-showcase-state").SceneShowcaseState;
}
