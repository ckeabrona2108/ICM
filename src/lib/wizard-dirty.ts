export function shouldGuardUnsavedChanges(params: {
  initialSnapshot: string;
  currentSnapshot: string;
  hasSubmittedToModeration: boolean;
}): boolean {
  if (params.hasSubmittedToModeration) {
    return false;
  }
  return params.initialSnapshot !== params.currentSnapshot;
}
