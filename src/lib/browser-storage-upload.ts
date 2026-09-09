"use client";

export type BrowserUploadKind = "audio" | "cover" | "social";

export interface BrowserUploadTarget {
  key: string;
  url: string;
  publicUrl?: string;
  bucket?: string;
  method?: string;
  fields?: Record<string, string>;
  mock?: boolean;
}

interface RelayUploadResponse {
  key: string;
  bucket: string;
  publicUrl: string;
  url: string;
}

function sanitizeFileName(name: string): string {
  return (
    name
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/gu, "_")
      .replace(/_+/gu, "_")
      .slice(0, 120) || "file.bin"
  );
}

async function requestUploadTarget(input: {
  fileName: string;
  contentType: string;
  kind: BrowserUploadKind;
}): Promise<BrowserUploadTarget> {
  const targetResponse = await fetch("/api/uploads/presigned", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: sanitizeFileName(input.fileName),
      contentType: input.contentType,
      kind: input.kind
    })
  });

  const target = (await targetResponse.json().catch(() => null)) as
    | BrowserUploadTarget
    | { error?: string }
    | null;

  if (!targetResponse.ok || !target || !("url" in target) || !target.url || !target.key) {
    const fallback =
      target && "error" in target && typeof target.error === "string"
        ? target.error
        : "Не удалось получить ссылку для загрузки.";
    throw new Error(fallback);
  }

  if (target.mock) {
    throw new Error("Хранилище файлов не настроено. Проверьте S3 параметры окружения.");
  }

  return target;
}

async function uploadViaRelay(input: {
  key: string;
  blob: Blob;
  contentType: string;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<RelayUploadResponse> {
  return await new Promise<RelayUploadResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/uploads/relay?key=${encodeURIComponent(input.key)}`);
    xhr.responseType = "json";
    xhr.setRequestHeader("Content-Type", input.contentType);
    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      input.onProgress?.(event.loaded, event.total);
    });
    xhr.addEventListener("load", () => {
      const payload = (xhr.response ?? null) as
        | RelayUploadResponse
        | { error?: string }
        | null;

      if (xhr.status >= 200 && xhr.status < 300 && payload && "key" in payload && payload.key) {
        resolve(payload);
        return;
      }

      const fallback =
        payload && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Не удалось загрузить файл через сервер.";
      reject(new Error(fallback));
    });
    xhr.addEventListener("error", () => {
      reject(new Error("Не удалось загрузить файл через сервер."));
    });
    xhr.send(input.blob);
  });
}

async function uploadWithXhr(input: {
  url: string;
  method: string;
  contentType: string;
  blob: Blob;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(input.method, input.url);
    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      input.onProgress?.(event.loaded, event.total);
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`storage_http_${xhr.status}`));
    });
    xhr.addEventListener("error", () => {
      reject(new Error("direct_upload_failed"));
    });
    xhr.setRequestHeader("Content-Type", input.contentType);
    xhr.send(input.blob);
  });
}

export async function uploadBrowserBlobToStorage(input: {
  fileName: string;
  contentType: string;
  kind: BrowserUploadKind;
  blob: Blob;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<{
  key: string;
  bucket?: string;
  publicUrl?: string;
  uploadUrl: string;
  fallbackUsed: boolean;
}> {
  const target = await requestUploadTarget({
    fileName: input.fileName,
    contentType: input.contentType,
    kind: input.kind
  });

  try {
    await uploadWithXhr({
      url: target.url,
      method: target.method ?? "PUT",
      contentType: input.contentType,
      blob: input.blob,
      onProgress: input.onProgress
    });

    return {
      key: target.key,
      bucket: target.bucket,
      publicUrl: target.publicUrl,
      uploadUrl: target.url,
      fallbackUsed: false
    };
  } catch (error) {
    const directMessage = error instanceof Error ? error.message : "direct_upload_failed";

    try {
      const relay = await uploadViaRelay({
        key: target.key,
        blob: input.blob,
        contentType: input.contentType,
        onProgress: input.onProgress
      });

      return {
        key: relay.key,
        bucket: relay.bucket,
        publicUrl: relay.publicUrl,
        uploadUrl: relay.url,
        fallbackUsed: true
      };
    } catch (relayError) {
      const relayMessage =
        relayError instanceof Error && relayError.message
          ? relayError.message
          : directMessage;
      throw new Error(relayMessage);
    }
  }
}
