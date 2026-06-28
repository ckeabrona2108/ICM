"use client";

export type BrowserUploadKind = "audio" | "cover";

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
}): Promise<RelayUploadResponse> {
  const relayResponse = await fetch(`/api/uploads/relay?key=${encodeURIComponent(input.key)}`, {
    method: "POST",
    headers: {
      "Content-Type": input.contentType
    },
    body: input.blob
  });

  const payload = (await relayResponse.json().catch(() => null)) as
    | RelayUploadResponse
    | { error?: string }
    | null;

  if (!relayResponse.ok || !payload || !("key" in payload) || !payload.key) {
    const fallback =
      payload && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "Не удалось загрузить файл через сервер.";
    throw new Error(fallback);
  }

  return payload;
}

export async function uploadBrowserBlobToStorage(input: {
  fileName: string;
  contentType: string;
  kind: BrowserUploadKind;
  blob: Blob;
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
    const uploadResponse = await fetch(target.url, {
      method: target.method ?? "PUT",
      headers: {
        "Content-Type": input.contentType
      },
      body: input.blob
    });

    if (!uploadResponse.ok) {
      throw new Error(`storage_http_${uploadResponse.status}`);
    }

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
        contentType: input.contentType
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
