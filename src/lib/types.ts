export type ReleaseStatus =
  | "draft"
  | "moderation"
  | "changes_required"
  | "rejected"
  | "approved"
  | "distributed"
  | "archived";

export type ReleaseType = "single" | "ep" | "album";

export interface ReleaseItem {
  id: string;
  title: string;
  artist: string;
  genre: string;
  language: string;
  type: ReleaseType;
  releaseDate: string;
  status: ReleaseStatus;
  platforms: Array<{ name: string; status: "pending" | "review" | "live" | "failed" }>;
  streams: number;
  earnings: number;
}

export interface StatPoint {
  date: string;
  streams: number;
  listeners: number;
  saves: number;
}

export interface FinanceSnapshot {
  currentBalance: number;
  pendingPayout: number;
  monthlyRevenue: number;
  platformFeePercent: number;
  accruals: number;
  deductions: number;
  commissionAmount: number;
  pendingReportsCount: number;
}

export interface TransactionItem {
  id: string;
  date: string;
  type: "Royalty" | "Payout" | "Fee";
  amount: number;
  status: "Completed" | "Pending" | "Failed";
  description: string;
}

export interface FinanceReportItem {
  id: string;
  period: string;
  amount: number;
  status: "Согласовать" | "Согласован";
}

export interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  type: "moderation" | "finance" | "ai" | "support";
  createdAt: string;
}

export interface AiToolCard {
  id: string;
  title: string;
  description: string;
  promptPlaceholder: string;
  usageLeft: number;
}

export interface CampaignItem {
  id: string;
  name: string;
  channel: string;
  budget: number;
  spent: number;
  clicks: number;
  conversions: number;
  status: "Draft" | "Active" | "Paused" | "Completed";
}

export interface SupportThread {
  id: string;
  subject: string;
  lastMessage: string;
  unread: number;
  status: "Open" | "In progress" | "Resolved";
  updatedAt: string;
}

export interface UserProfileData {
  name: string;
  stageName: string;
  email: string;
  country: string;
  genres: string[];
  bio: string;
  socialLinks: {
    instagram: string;
    tiktok: string;
    youtube: string;
  };
}
