function stringEnum<const T extends Record<string, string>>(value: T): T {
  return value;
}

export const ReleaseStatus = stringEnum({
  DRAFT: "draft",
  MODERATION: "moderating",
  PENDING_VERIFICATION: "pending_verification",
  CHANGES_REQUIRED: "changes_required",
  APPROVED: "approved",
  REJECTED: "rejected"
});
export type ReleaseStatus = (typeof ReleaseStatus)[keyof typeof ReleaseStatus];

export const SubscriptionPlan = stringEnum({
  FREE: "FREE",
  STANDARD: "STANDARD",
  PRO: "PRO",
  ENTERPRISE: "ENTERPRISE",
  LABEL: "LABEL"
});
export type SubscriptionPlan = (typeof SubscriptionPlan)[keyof typeof SubscriptionPlan];

export const SubscriptionStatus = stringEnum({
  ACTIVE: "ACTIVE",
  CANCELED: "CANCELED",
  EXPIRED: "EXPIRED"
});
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const SubscriptionSource = stringEnum({
  ADMIN_GRANT: "ADMIN_GRANT",
  PAYMENT: "PAYMENT"
});
export type SubscriptionSource = (typeof SubscriptionSource)[keyof typeof SubscriptionSource];

export const BalanceAdminAdjustmentType = stringEnum({ CREDIT: "CREDIT", DEBIT: "DEBIT" });
export type BalanceAdminAdjustmentType =
  (typeof BalanceAdminAdjustmentType)[keyof typeof BalanceAdminAdjustmentType];

export const Role = stringEnum({ USER: "USER", ADMIN: "ADMIN" });
export type Role = (typeof Role)[keyof typeof Role];
