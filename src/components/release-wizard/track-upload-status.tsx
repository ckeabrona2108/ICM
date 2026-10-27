"use client";

import * as React from "react";

export type TrackUploadStatus =
  | { state: "uploading"; percent: number }
  | { state: "error"; message: string };

interface TrackUploadStatusCtx {
  statuses: Record<string, TrackUploadStatus>;
  retry: (trackId: string) => void;
}

export const TrackUploadStatusContext = React.createContext<TrackUploadStatusCtx>({
  statuses: {},
  retry: () => undefined
});

export function useTrackUploadStatus() {
  return React.useContext(TrackUploadStatusContext);
}
