"use client";

import { uploadBrowserBlobToStorage } from "@/lib/browser-storage-upload";

/** Storage key → the same-origin path the smart link page plays from. */
function objectPath(key: string) {
  return `/api/uploads/object/${key.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
}

export type SmartLinkVideoSlot = "mobile" | "web";

async function patchSmartLinkVideo(releaseId: string, slot: SmartLinkVideoSlot, url: string) {
  const response = await fetch(`/api/releases/${releaseId}/smart-link`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(slot === "web" ? { snippetVideoWideUrl: url } : { snippetVideoUrl: url })
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Не удалось обновить смарт-линк");
  }
}

/**
 * Uploads a finished MP4 and makes it the smart link header: vertical clips fill the
 * phone screen, 16:9 clips replace the cover on wide screens. Returns the path it plays from.
 */
export async function uploadSnippetToSmartLink(params: {
  releaseId: string;
  slot: SmartLinkVideoSlot;
  blob: Blob;
  fileName: string;
  onProgress?: (fraction: number) => void;
}) {
  const uploaded = await uploadBrowserBlobToStorage({
    fileName: params.fileName,
    contentType: "video/mp4",
    kind: "audio",
    blob: params.blob,
    onProgress: (loaded, total) => params.onProgress?.(loaded / Math.max(1, total))
  });
  const path = objectPath(uploaded.key);
  await patchSmartLinkVideo(params.releaseId, params.slot, path);
  return path;
}
