import { ReleaseStatus, type ReleaseStatus as ReleaseStatusValue } from "@/lib/legacy-business-enums";

export function isInitialReleaseSubmission(status: ReleaseStatusValue | null | undefined): boolean {
  return (status ?? ReleaseStatus.DRAFT) === ReleaseStatus.DRAFT;
}
