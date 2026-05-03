import type { WizardSubmissionMode } from "@/components/release-wizard/wizard-context";

export function resolveDraftReleaseId(
  submissionMode: WizardSubmissionMode,
  sourceReleaseId?: string
): string | undefined {
  if (submissionMode === "new") {
    return undefined;
  }
  return sourceReleaseId;
}
