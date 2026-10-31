// Types and rules of the free first single shared by the server and the release wizard.

export type FreeReleaseState =
  // Every step is done; the next single can be released for free.
  | "available"
  // Still a new artist, but a step (contract, VK, group) is missing.
  | "locked"
  // A release holds the claim and is not approved yet.
  | "reserved"
  // The free release was approved.
  | "used"
  // Already released before, or the passport belongs to another cabinet.
  | "not_eligible"
  // Storage or configuration is missing; the offer is hidden.
  | "unavailable";

export interface FreeReleaseSteps {
  contract: boolean;
  // Signed and waiting for the moderator.
  contractPending: boolean;
  vkLinked: boolean;
  groupMember: boolean;
}

export interface FreeReleaseStatus {
  state: FreeReleaseState;
  reason: string | null;
  steps: FreeReleaseSteps;
  releaseId: string | null;
}

export const FREE_RELEASE_TRACK_LIMIT = 1;

export function isFreeReleaseSubmissionAllowed(params: {
  releaseType: string | null | undefined;
  releaseKind: string | null | undefined;
  trackCount: number;
}): { ok: true } | { ok: false; message: string } {
  if (params.releaseType !== "single") {
    return { ok: false, message: "Бесплатно можно выпустить только сингл." };
  }
  if (params.releaseKind && params.releaseKind !== "standard") {
    return { ok: false, message: "Бесплатный релиз — обычный сингл, без макси-сингла, микстейпа и аудиокниги." };
  }
  if (params.trackCount !== FREE_RELEASE_TRACK_LIMIT) {
    return { ok: false, message: "В бесплатном сингле должен быть ровно один трек." };
  }
  return { ok: true };
}
