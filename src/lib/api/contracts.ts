import type {
  FinanceReportStatus,
  PayoutRequestInput,
  PayoutValidationIssue
} from "@/lib/finance-policy";
import type {
  ReleaseLifecycleStatus,
  ReleaseSubmissionData,
  ReleaseValidationIssue
} from "@/lib/release-policy";
import type { AdminReleaseDetails } from "@/lib/admin-data";
import type {
  AdminUserProfileDetails,
  AdminUsersListResult
} from "@/lib/admin-user-service";
import type { UserFinanceView } from "@/lib/finance-service";
import type { UserReportItem } from "@/lib/report-service";
import type { UserSubscriptionView } from "@/lib/subscription-service";

export interface ApiErrorResponse {
  error: string;
}

export type SupportTicketStatusValue = "OPEN" | "IN_PROGRESS" | "WAITING_USER" | "CLOSED";
export type SupportMessageSenderType = "USER" | "ADMIN";

export interface SupportTicketMessageResponse {
  id: string;
  ticketId: string;
  senderType: SupportMessageSenderType;
  body: string;
  createdAt: string;
}

export interface SupportTicketResponse {
  id: string;
  subject: string;
  status: SupportTicketStatusValue;
  userId: string;
  userName: string;
  userEmail: string;
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
  messages?: SupportTicketMessageResponse[];
}

export interface CreateSupportTicketRequest {
  subject: string;
  body: string;
}

export interface AddSupportTicketMessageRequest {
  body: string;
}

export interface UpdateSupportTicketStatusRequest {
  status: SupportTicketStatusValue;
}

export interface SupportTicketListResponse {
  tickets: SupportTicketResponse[];
}

export interface SupportTicketMutationResponse {
  ok: true;
  ticket: SupportTicketResponse;
}

export interface SupportUnreadCountResponse {
  count: number;
}

export interface ModerationRemark {
  field: string;
  message: string;
  section?: string;
}

export interface ReleaseSubmitRequest {
  mode: "new" | "edit";
  releaseId?: string;
  currentStatus?: ReleaseLifecycleStatus;
  moderationStarted?: boolean;
  data: ReleaseSubmissionData;
}

export interface ReleaseSubmitSuccessResponse {
  ok: true;
  releaseId?: string;
  nextStatus: ReleaseLifecycleStatus;
  message: string;
}

export interface ReleaseSubmitFailureResponse {
  ok: false;
  errors: ReleaseValidationIssue[];
  errors_by_step?: {
    release_info?: ReleaseValidationIssue[];
    tracks?: ReleaseValidationIssue[];
    stores?: ReleaseValidationIssue[];
    pricing?: ReleaseValidationIssue[];
  };
}

export interface ReleaseDraftSaveRequest {
  releaseId?: string;
  data: ReleaseSubmissionData;
}

export interface ReleaseDraftSaveResponse {
  ok: true;
  releaseId: string;
  draftsCount: number;
  message: string;
}

export interface ReleaseDraftSaveFailureResponse {
  ok: false;
  errors: Array<{
    code: string;
    field: string;
    message: string;
  }>;
}

export interface ReleaseDraftDeleteResponse {
  ok: true;
  releaseId: string;
  draftsCount: number;
  message: string;
}

export interface ReleaseDraftDeleteFailureResponse {
  ok: false;
  errors: Array<{
    code: string;
    field: string;
    message: string;
  }>;
}

export interface CurrentUserProfileResponse {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface UpdateCurrentUserProfileRequest {
  name: string;
  email?: string;
}

export interface UpdateCurrentUserAvatarRequest {
  imageDataUrl: string;
}

export interface CancelModerationRequest {
  releaseId: string;
  currentStatus: ReleaseLifecycleStatus;
  moderationStarted?: boolean;
}

export interface CancelModerationSuccessResponse {
  ok: true;
  releaseId: string;
  nextStatus: "changes_required";
  message: string;
}

export interface CancelModerationFailureResponse {
  ok: false;
  errors: Array<{
    code: string;
    field: string;
    message: string;
  }>;
}

export interface AdminReleaseDecisionRequest {
  releaseId: string;
  action: "approve" | "request_changes" | "reject";
  upc?: string;
  comment?: string;
  remarks?: ModerationRemark[];
}

export interface AdminReleaseDecisionResponse {
  ok: true;
  releaseId: string;
  status: "approved" | "changes_required" | "rejected";
  message: string;
  remarks?: ModerationRemark[];
}

export interface AdminReleaseListResponse {
  releases: AdminReleaseDetails[];
}

export interface AdminReleaseFileDownloadResponse {
  ok: true;
  fileId: string;
  downloadUrl: string;
}

export interface AdminReleaseDetailsResponse {
  id: string;
  status: string;
  payment_status: string;
  priority: boolean;
  cover: {
    url: string;
    download_url: string | null;
  };
  release: {
    metadata_language: string;
    title: string;
    subtitle: string;
    genre: string;
    release_type: string;
    label: string;
    upc: string;
    dates: {
      preorder_date: string;
      start_date: string;
      release_date: string;
    };
    territories: {
      mode: string;
      label: string;
      count: number;
      countries: string[];
    };
    platforms: {
      count: number;
      selected_codes: string[];
      names: string[];
    };
    roles: {
      performers: string[];
      feats: string[];
      remixers: string[];
      coPerformers: string[];
      producers: string[];
      musicAuthors: string[];
      lyricsAuthors: string[];
    };
    settings: {
      early_russia_start: boolean;
      real_time_delivery: boolean;
      yandex_pre_release_date: string;
    };
  };
  tracks: Array<{
    id: string;
    title: string;
    subtitle: string;
    identification: {
      isrc: string;
      partner_code: string;
    };
    track_roles: {
      performers: string[];
      feats: string[];
      remixers: string[];
      coPerformers: string[];
      producers: string[];
      musicAuthors: string[];
      lyricsAuthors: string[];
    };
    rights: {
      copyright_pct: string | number | null;
      related_rights_pct: string | number | null;
    };
    additional: {
      preview_start: string;
      instant_gratification: boolean;
      focus_track: boolean;
    };
    version: {
      explicit: boolean;
      live: boolean;
      cover: boolean;
      remix: boolean;
      instrumental: boolean;
    };
    usage: {
      metadata_language: string;
    };
    duration_sec: number;
    files: {
      audio: {
        file_name: string | null;
        url: string | null;
        download_url: string | null;
      };
      text: {
        file_name: string | null;
        url: string | null;
        download_url: string | null;
      };
      karaoke: {
        file_name: string | null;
        url: string | null;
        download_url: string | null;
      };
      video_shot: {
        file_name: string | null;
        url: string | null;
        download_url: string | null;
      };
      video_clip: {
        file_name: string | null;
        url: string | null;
        download_url: string | null;
      };
    };
    raw_commentary: {
      lyrics: string;
    };
  }>;
  comment: string;
  extras: {
    lyrics: string | null;
    karaoke: string | null;
    video_shot: Record<string, unknown> | null;
    video_clip: Record<string, unknown> | null;
    additional: Record<string, unknown> | null;
  };
  created_at: string;
  submitted_to_moderation_at: string;
}

export type AdminUsersListResponse = AdminUsersListResult;

export interface AdminUserProfileResponse {
  user: AdminUserProfileDetails;
}

export type AdminUserFinanceResponse = UserFinanceView;

export interface AdminUserReportsResponse {
  reports: UserReportItem[];
}

export interface AdminUserSubscriptionResponse {
  subscription: UserSubscriptionView | null;
}

export type PayoutRequestBody = PayoutRequestInput;

export interface PayoutRequestSuccessResponse {
  ok: true;
  payoutRequestId: string;
  message: string;
}

export interface PayoutRequestFailureResponse {
  ok: false;
  errors: PayoutValidationIssue[];
}

export interface FinanceReportAgreementRequest {
  reportId: string;
}

export interface FinanceReportAgreementResponse {
  ok: true;
  reportId: string;
  nextStatus: FinanceReportStatus;
}

export interface SubscriptionCheckoutRequest {
  tariffId: "standard" | "pro" | "enterprise";
  returnUrl?: string;
}

export interface SubscriptionCheckoutResponse {
  ok: true;
  paymentId: string;
  providerPaymentId: string;
  confirmationUrl: string;
}

export interface SubscriptionLimitsResponse {
  releasesLimit: number | null;
  aiDayLimit: number | null;
  aiMonthLimit: number | null;
  aiEnabled: boolean;
}

export interface SubscriptionUsageCountersResponse {
  periodStart: string | null;
  periodEnd: string | null;
  releasesUsed: number;
  aiDayUsed: number;
  aiMonthUsed: number;
  lastAiResetDay: string | null;
}

export interface SubscriptionOverviewResponse {
  plan: "STANDARD" | "PRO" | "ENTERPRISE";
  currentPlan: "STANDARD" | "PRO" | "ENTERPRISE" | null;
  hasActiveSubscription: boolean;
  status: "active" | "none";
  startedAt: string | null;
  endsAt: string | null;
  countdownDays: number | null;
  shouldNotifyExpiry: boolean;
  limits: SubscriptionLimitsResponse;
  usage: SubscriptionUsageCountersResponse;
}

export interface SubscriptionStateResponse {
  has_active_subscription: boolean;
  current_plan: "standard" | "pro" | "enterprise" | null;
  status: "active" | "none";
  ends_at: string | null;
  days_left: number | null;
  features: {
    releases_limit: number | null;
    ai_day_limit: number | null;
    ai_month_limit: number | null;
    ai_enabled: boolean;
  };
  subscription: SubscriptionOverviewResponse;
}

export interface AnalyticsImportResponse {
  ok: true;
  result: {
    sourceFileName: string;
    reportDate: string;
    totalCsvRows: number;
    groupedRows: number;
    matchedRows: number;
    unmatchedRows: number;
    touchedUsersCount: number;
    touchedReleasesCount: number;
    platformsCount: number;
    rowsWithUnknownPlatform: number;
    topPlatform: string | null;
  };
}

export interface AnalyticsOverviewChartPointResponse {
  date: string;
  streams: number;
  pay_streams: number;
}

export interface AnalyticsOverviewResponse {
  total_streams: number;
  total_pay_streams: number;
  streams_change_percent: number | null;
  pay_streams_change_percent: number | null;
  latest_report_date: string | null;
  top_platform: string | null;
  platforms_count: number;
  platforms_breakdown: Array<{
    platform: string;
    streams: number;
    pay_streams: number;
    share_percent: number;
    change_percent: number | null;
  }>;
  chart: AnalyticsOverviewChartPointResponse[];
}

export interface AnalyticsReleaseListItemResponse {
  release_id: string;
  title: string;
  artist: string;
  upc: string;
  streams: number;
  pay_streams: number;
  change_percent: number | null;
  trend: "up" | "down" | "flat" | "new";
}

export interface AnalyticsReleaseDetailsResponse {
  release_id: string;
  title: string;
  artist: string;
  upc: string;
  total_streams: number;
  total_pay_streams: number;
  streams_change_percent: number | null;
  pay_streams_change_percent: number | null;
  latest_report_date: string | null;
  countries_breakdown: Array<{
    country: string;
    streams: number;
    pay_streams: number;
  }>;
  chart: AnalyticsOverviewChartPointResponse[];
}

export interface AnalyticsAiFindingResponse {
  title: string;
  details: string;
  based_on: string;
}

export interface AnalyticsAiRecommendationResponse {
  title: string;
  details: string;
  priority: "high" | "medium" | "low";
}

export interface AnalyticsAiRiskResponse {
  title: string;
  details: string;
}

export interface AnalyticsAiBestPerformingResponse {
  release: string | null;
  track: string | null;
  country: string | null;
  platform: string | null;
  genre: string | null;
}

export interface AnalyticsAiResponsePayload {
  summary: string;
  key_findings: AnalyticsAiFindingResponse[];
  recommendations: AnalyticsAiRecommendationResponse[];
  risks: AnalyticsAiRiskResponse[];
  next_steps: string[];
  best_performing: AnalyticsAiBestPerformingResponse;
}

export interface AnalyticsAiInsightResponse {
  id: string;
  status: "processing" | "success" | "failed";
  period_days: number;
  filters_hash: string;
  question: string | null;
  created_at: string;
  updated_at: string;
  error_message: string | null;
  response: AnalyticsAiResponsePayload | null;
}

export interface AnalyticsAiAnalyzeResponse {
  status: "processing" | "success" | "failed" | "cached" | "rate_limited";
  insight: AnalyticsAiInsightResponse | null;
  retry_after_seconds?: number;
}

export interface NewsPostResponse {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  cover_image: string | null;
  status: "draft" | "published" | "archived";
  category: string | null;
  is_pinned: boolean;
  published_at: string | null;
  created_by_admin_id: string;
  created_at: string;
  updated_at: string;
}

export interface PublicNewsCardResponse {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image: string | null;
  category: string | null;
  is_pinned: boolean;
  published_at: string;
  is_new: boolean;
}

export interface PublicNewsPostResponse extends PublicNewsCardResponse {
  content: string;
}
