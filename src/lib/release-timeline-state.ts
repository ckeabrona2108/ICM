import type { CabinetReleaseStatus } from "@/lib/cabinet-types";

export type ReleaseTimelineStepId =
  | "draft"
  | "unpaid"
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

function indexOfStep(steps: ReleaseTimelineStep[], id: ReleaseTimelineStepId): number {
  const idx = steps.findIndex((step) => step.id === id);
  return idx >= 0 ? idx : 0;
}

export function getReleaseTimelineState(
  releaseStatus: CabinetReleaseStatus,
  paid: boolean
): ReleaseTimelineState {
  if (releaseStatus === "draft") {
    return {
      steps: BASE_STEPS,
      currentStep: "draft",
      activeIndex: indexOfStep(BASE_STEPS, "draft"),
      showPayButton: false
    };
  }

  if (releaseStatus === "moderation" && !paid) {
    return {
      steps: BASE_STEPS,
      currentStep: "unpaid",
      activeIndex: indexOfStep(BASE_STEPS, "unpaid"),
      showPayButton: true
    };
  }

  if (releaseStatus === "moderation" && paid) {
    return {
      steps: BASE_STEPS,
      currentStep: "moderation",
      activeIndex: indexOfStep(BASE_STEPS, "moderation"),
      showPayButton: false
    };
  }

  if (releaseStatus === "changes_required" || releaseStatus === "rejected") {
    return {
      steps: CHANGES_STEPS,
      currentStep: "changes_required",
      activeIndex: indexOfStep(CHANGES_STEPS, "changes_required"),
      showPayButton: false
    };
  }

  if (
    releaseStatus === "approved" ||
    releaseStatus === "distributed" ||
    releaseStatus === "archived"
  ) {
    return {
      steps: BASE_STEPS,
      currentStep: "published",
      activeIndex: indexOfStep(BASE_STEPS, "published"),
      showPayButton: false
    };
  }

  return {
    steps: BASE_STEPS,
    currentStep: "draft",
    activeIndex: indexOfStep(BASE_STEPS, "draft"),
    showPayButton: false
  };
}
