import type { ReleaseValidationIssue } from "@/lib/release-policy";

export type UploadProgressListener = (loaded: number, total: number) => void;

interface InflightUpload<T> {
  source: unknown;
  promise: Promise<T>;
  listeners: Set<UploadProgressListener>;
  last: [number, number] | null;
}

/**
 * Runs at most one upload per track at a time. Autosave and submit both ask for
 * the same track; the second caller joins the running upload instead of sending
 * the file again. A new source (replaced audio) starts a fresh upload.
 */
export class TrackUploadQueue<T> {
  private readonly inflight = new Map<string, InflightUpload<T>>();

  run(
    trackId: string,
    source: unknown,
    start: (onProgress: UploadProgressListener) => Promise<T>,
    onProgress?: UploadProgressListener
  ): Promise<T> {
    let entry = this.inflight.get(trackId);

    if (!entry || entry.source !== source) {
      const listeners = new Set<UploadProgressListener>();
      const created: InflightUpload<T> = {
        source,
        listeners,
        last: null,
        promise: Promise.resolve() as Promise<never>
      };
      created.promise = start((loaded, total) => {
        created.last = [loaded, total];
        for (const listener of listeners) listener(loaded, total);
      });
      const cleanup = () => {
        if (this.inflight.get(trackId) === created) this.inflight.delete(trackId);
      };
      created.promise.then(cleanup, cleanup);
      this.inflight.set(trackId, created);
      entry = created;
    }

    if (onProgress) {
      entry.listeners.add(onProgress);
      if (entry.last) onProgress(entry.last[0], entry.last[1]);
    }

    return entry.promise;
  }

  isRunning(trackId: string): boolean {
    return this.inflight.has(trackId);
  }
}

/**
 * "Upload the audio file" issues for tracks whose file is attached locally and
 * will be uploaded during submit. They must not block navigation or submit.
 */
export function isPendingLocalAudioIssue(
  issue: ReleaseValidationIssue,
  tracks: ReadonlyArray<{ localAudioFile?: Blob | null } | undefined>
): boolean {
  if (issue.code !== "required") return false;
  const match = /^tracks\.(\d+)\.audioFile$/u.exec(issue.field);
  if (!match) return false;
  return Boolean(tracks[Number(match[1])]?.localAudioFile);
}
