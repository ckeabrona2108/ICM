import type { WizardSubmissionMode } from "@/components/release-wizard/wizard-context";
import type { ReleaseLifecycleStatus } from "@/lib/release-policy";

export function resolveDraftReleaseId(
  submissionMode: WizardSubmissionMode,
  sourceReleaseId?: string
): string | undefined {
  if (submissionMode === "new") {
    return undefined;
  }
  return sourceReleaseId;
}

export function resolveReleaseSubmitMode(
  submissionMode: WizardSubmissionMode,
  currentStatus?: ReleaseLifecycleStatus
): "new" | "edit" {
  if (submissionMode === "new") return "new";
  if (currentStatus === "draft") return "new";
  return "edit";
}
