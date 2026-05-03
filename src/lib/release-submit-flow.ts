export interface ReleaseDraftSnapshot {
  releaseId: string;
  draftsCount: number;
}

export async function submitReleaseWithLatestDraft(params: {
  saveLatestDraft: () => Promise<ReleaseDraftSnapshot>;
  submitForModeration: (releaseId: string) => Promise<void>;
}): Promise<ReleaseDraftSnapshot> {
  const snapshot = await params.saveLatestDraft();
  await params.submitForModeration(snapshot.releaseId);
  return snapshot;
}
