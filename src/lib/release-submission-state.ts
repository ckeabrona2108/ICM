import { ReleaseStatus } from "@prisma/client";

export function isInitialReleaseSubmission(status: ReleaseStatus | null | undefined): boolean {
  return (status ?? ReleaseStatus.DRAFT) === ReleaseStatus.DRAFT;
}
