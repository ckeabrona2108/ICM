import type { CabinetReleaseStatus } from "@/lib/cabinet-types";

export type ReleaseTimelineStepId =
  | "draft"
  | "unpaid"
  | "verification"
  | "moderation"
  | "changes_required"
  | "published";

export interface ReleaseTimelineStep {
  id: ReleaseTimelineStepId;
  label: string;
}

export interface ReleaseTimelineState {
  steps: ReleaseTimelineStep[];
  currentStep: ReleaseTimelineStepId;
  activeIndex: number;
  showPayButton: boolean;
}

const BASE_STEPS: ReleaseTimelineStep[] = [
  { id: "draft", label: "Черновик" },
  { id: "unpaid", label: "Не оплачен" },
  { id: "moderation", label: "На модерации" },
  { id: "published", label: "Опубликован" }
];

const CHANGES_STEPS: ReleaseTimelineStep[] = [
  { id: "draft", label: "Черновик" },
  { id: "unpaid", label: "Не оплачен" },
  { id: "moderation", label: "На модерации" },
  { id: "changes_required", label: "Требуются изменения" },
  { id: "published", label: "Опубликован" }
];

const VERIFICATION_STEPS: ReleaseTimelineStep[] = [
  { id: "draft", label: "Черновик" },
  { id: "unpaid", label: "Не оплачен" },
  { id: "verification", label: "Подпись на проверке" },
  { id: "moderation", label: "На модерации" },
  { id: "published", label: "Опубликован" }
];

function withPaymentLabel(steps: ReleaseTimelineStep[], paid: boolean): ReleaseTimelineStep[] {
  if (!paid) return steps;
  return steps.map((step) =>
    step.id === "unpaid" ? { ...step, label: "Оплачен" } : step
  );
}

function indexOfStep(steps: ReleaseTimelineStep[], id: ReleaseTimelineStepId): number {
  const idx = steps.findIndex((step) => step.id === id);
  return idx >= 0 ? idx : 0;
}

export function getReleaseTimelineState(
  releaseStatus: CabinetReleaseStatus,
  paid: boolean
): ReleaseTimelineState {
  if (releaseStatus === "draft") {
    const steps = withPaymentLabel(BASE_STEPS, paid);
    return {
      steps,
      currentStep: "draft",
      activeIndex: indexOfStep(steps, "draft"),
      showPayButton: false
    };
  }

  if (releaseStatus === "moderation" && !paid) {
    const steps = withPaymentLabel(BASE_STEPS, paid);
    return {
      steps,
      currentStep: "moderation",
      activeIndex: indexOfStep(steps, "moderation"),
      showPayButton: true
    };
  }

  if (releaseStatus === "moderation" && paid) {
    const steps = withPaymentLabel(BASE_STEPS, paid);
    return {
      steps,
      currentStep: "moderation",
      activeIndex: indexOfStep(steps, "moderation"),
      showPayButton: false
    };
  }

  if (releaseStatus === "pending_verification") {
    const steps = withPaymentLabel(VERIFICATION_STEPS, paid);
    return {
      steps,
      currentStep: "verification",
      activeIndex: indexOfStep(steps, "verification"),
      showPayButton: false
    };
  }

  if (releaseStatus === "changes_required" || releaseStatus === "rejected") {
    const steps = withPaymentLabel(CHANGES_STEPS, paid);
    return {
      steps,
      currentStep: "changes_required",
      activeIndex: indexOfStep(steps, "changes_required"),
      showPayButton: false
    };
  }

  if (
    releaseStatus === "approved" ||
    releaseStatus === "distributed" ||
    releaseStatus === "archived"
  ) {
    const steps = withPaymentLabel(BASE_STEPS, paid);
    return {
      steps,
      currentStep: "published",
      activeIndex: indexOfStep(steps, "published"),
      showPayButton: false
    };
  }

  const steps = withPaymentLabel(BASE_STEPS, paid);
  return {
    steps,
    currentStep: "draft",
    activeIndex: indexOfStep(steps, "draft"),
    showPayButton: false
  };
}
