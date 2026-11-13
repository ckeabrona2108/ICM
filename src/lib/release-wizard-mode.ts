import type { StepId, WizardSubmissionMode } from "@/components/release-wizard/wizard-context";
import type { ReleaseChangeArea } from "@/lib/release-copy-changes";
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

export function shouldResubmitEditedRelease(currentStatus?: ReleaseLifecycleStatus): boolean {
  return (
    currentStatus === "changes_required" ||
    currentStatus === "rejected" ||
    currentStatus === "approved" ||
    currentStatus === "distributed"
  );
}

const COPY_WIZARD_STEP_ORDER: StepId[] = [
  "changes",
  "intro",
  "cover",
  "info",
  "persons",
  "codes",
  "stores",
  "tracks",
  "lyrics",
  "extras",
  "review",
  "upload"
];

const FULL_EDIT_STEPS: StepId[] = ["intro", "info", "persons", "codes", "stores", "tracks", "extras"];

/**
 * Steps of the wizard for an edited copy of an approved release: the "what changes" question,
 * then only the screens for the marked areas, then review. "Other" opens the full release form.
 * `current` keeps a step the artist was sent to (e.g. from a review error) in the list.
 */
export function resolveCopyWizardSteps(areas: readonly ReleaseChangeArea[], current?: StepId): StepId[] {
  const steps = new Set<StepId>(["changes", "review", "upload"]);
  const marked = new Set(areas);
  if (marked.has("other")) {
    for (const step of FULL_EDIT_STEPS) steps.add(step);
  } else {
    if (marked.has("metadata")) {
      // The release info screen has the cover too.
      steps.add("info");
      steps.add("persons");
    } else if (marked.has("cover")) {
      steps.add("cover");
    }
    if (marked.has("dates")) steps.add("codes");
    if (marked.has("distribution")) steps.add("stores");
    if (marked.has("tracks")) {
      // Track forms include lyrics.
      steps.add("tracks");
    } else if (marked.has("lyrics")) {
      steps.add("lyrics");
    }
  }
  if (current) steps.add(current);
  return COPY_WIZARD_STEP_ORDER.filter((step) => steps.has(step));
}
