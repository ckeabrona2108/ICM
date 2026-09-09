import { mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { parseHttpByteRange } from "@/lib/http-byte-range";
import { isPublicStreamableStorageKey } from "@/lib/storage-object-access";
import {
  authorizeStorageReadRequest,
  handleAuthorizedStorageUpload
} from "@/lib/storage-route-handlers";
import {
  ALLOWED_S3_IMAGE_PREFIXES,
  createPresignedDownload,
  findExistingS3ObjectKeyFallback,
  headStorageObjectDebug,
  isAllowedAudioFile,
  isAllowedImageFile,
  objectExists,
  resolveExistingImageStorageKeyWithFallback,
  resolvePublicStorageUrlFromKey,
  streamStoredObject
} from "@/lib/s3";

const LOCAL_STORAGE_ROOT =
  process.env.NODE_ENV !== "production" && process.env.E2E_DISPOSABLE_STORAGE === "1" && process.env.E2E_STORAGE_ROOT
    ? path.resolve(process.env.E2E_STORAGE_ROOT)
    : path.join(process.cwd(), ".tmp", "local-object-storage");

function resolveObjectPaths(segments: string[]) {
  const relativePath = path.join(...segments);
  const filePath = path.join(LOCAL_STORAGE_ROOT, relativePath);
  const metaPath = `${filePath}.meta.json`;
  return { filePath, metaPath };
}

function inferContentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg" || extension === ".jpe" || extension === ".jfif") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".wav") return "audio/wav";
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".flac") return "audio/flac";
  if (extension === ".pdf") return "application/pdf";
  return "application/octet-stream";
}

function resolveStreamContentType(key: string, contentType: string | null): string {
  if (contentType && contentType !== "application/octet-stream" && contentType !== "binary/octet-stream") {
    return contentType;
  }
  return inferContentType(key);
}

async function probeHttpHeadStatus(url: string): Promise<number | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store"
    });
    return response.status;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPublicRootUrl(key: string): string {
  return (
    resolvePublicStorageUrlFromKey(key) ??
    `https://s3.icecreammusic.net/${key.split("/").map(encodeURIComponent).join("/")}`
  );
}

function shouldTryPublicImageFallback(key: string): boolean {
  return isAllowedImageFile(key);
}

const SHOULD_DEBUG_STORAGE_OBJECT_ROUTE = process.env.NODE_ENV !== "production";

export async function PUT(
  request: Request,
  context: { params: { key?: string[] } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return handleAuthorizedStorageUpload({
    request,
    rawKey: (context.params.key ?? []).join("/"),
    principalId: session.user.id,
    upload: async ({ key, bytes, contentType }) => {
      const { filePath, metaPath } = resolveObjectPaths(key.split("/"));
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, bytes);
      await writeFile(metaPath, JSON.stringify({ contentType }, null, 2), "utf8");
      return { key };
    },
    success: () => new NextResponse(null, { status: 200 })
  });
}

export async function GET(
  request: Request,
  context: { params: { key?: string[] } }
) {
  const session = await getServerSession(authOptions);
  const requestedAccess = authorizeStorageReadRequest(context.params.key, session?.user?.id ?? null);
  if (!requestedAccess.allowed) return requestedAccess.response;
  const segments = requestedAccess.segments;
  const requestedKey = requestedAccess.key;
  const exactResolvedImageKey = shouldTryPublicImageFallback(requestedKey)
    ? await resolveExistingImageStorageKeyWithFallback(requestedKey)
    : null;
  const exactHead = await headStorageObjectDebug(requestedKey);
  const exactKeyFound = exactResolvedImageKey ? true : exactHead.exists ?? await objectExists(requestedKey);
  const fallbackFoundKey =
    exactKeyFound !== true ? await findExistingS3ObjectKeyFallback(requestedKey) : null;
  const resolvedStorageKey = exactResolvedImageKey ?? (exactKeyFound === true ? requestedKey : fallbackFoundKey);
  const resolvedSegments = resolvedStorageKey?.split("/").filter(Boolean) ?? segments;
  const resolvedAccess = authorizeStorageReadRequest(resolvedSegments, session?.user?.id ?? null);
  if (!resolvedAccess.allowed) return resolvedAccess.response;
  const { filePath: resolvedFilePath, metaPath: resolvedMetaPath } = resolveObjectPaths(resolvedSegments);
  const publicRootCandidate = resolvedStorageKey ? isPublicStreamableStorageKey(resolvedSegments) : false;
  const publicRootUrl = publicRootCandidate && resolvedStorageKey ? buildPublicRootUrl(resolvedStorageKey) : null;
  const checkedPrefixes = exactKeyFound !== true ? [...ALLOWED_S3_IMAGE_PREFIXES] : [];

  if (resolvedStorageKey && isAllowedAudioFile(resolvedStorageKey)) {
    try {
      const storedObject = await streamStoredObject({
        key: resolvedStorageKey,
        range: request.headers.get("range") ?? undefined
      });
      if (storedObject) {
        return new NextResponse(storedObject.body, {
          status: storedObject.contentRange ? 206 : 200,
          headers: {
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, max-age=60",
            "Content-Type": resolveStreamContentType(resolvedStorageKey, storedObject.contentType),
            ...(storedObject.contentLength !== null
              ? { "Content-Length": String(storedObject.contentLength) }
              : {}),
            ...(storedObject.contentRange
              ? { "Content-Range": storedObject.contentRange }
              : {}),
            ...(storedObject.etag ? { ETag: storedObject.etag } : {}),
            ...(storedObject.lastModified
              ? { "Last-Modified": storedObject.lastModified }
              : {})
          }
        });
      }
    } catch (error) {
      const status =
        typeof error === "object" && error && "$metadata" in error
          ? Number((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode)
          : 0;
      if (status === 416) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Accept-Ranges": "bytes" }
        });
      }
      if (SHOULD_DEBUG_STORAGE_OBJECT_ROUTE) {
        console.error("[storage-debug:audio-stream-error]", {
          key: resolvedStorageKey,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  if (resolvedStorageKey && isAllowedImageFile(resolvedStorageKey)) {
    try {
      const storedObject = await streamStoredObject({
        key: resolvedStorageKey
      });
      if (storedObject) {
        return new NextResponse(storedObject.body, {
          status: 200,
          headers: {
            "Cache-Control": "private, max-age=60",
            "Content-Type": resolveStreamContentType(resolvedStorageKey, storedObject.contentType),
            ...(storedObject.contentLength !== null
              ? { "Content-Length": String(storedObject.contentLength) }
              : {}),
            ...(storedObject.etag ? { ETag: storedObject.etag } : {}),
            ...(storedObject.lastModified
              ? { "Last-Modified": storedObject.lastModified }
              : {})
          }
        });
      }
    } catch (error) {
      if (SHOULD_DEBUG_STORAGE_OBJECT_ROUTE) {
        console.error("[storage-debug:image-stream-error]", {
          key: resolvedStorageKey,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  if (SHOULD_DEBUG_STORAGE_OBJECT_ROUTE) {
    console.log("[storage-debug:object-lookup]", {
      requestedKey,
      exactResolvedImageKey,
      exactKeyFound,
      fallbackFoundKey,
      checkedPrefixes,
      requestUrl: request.url
    });
    if (exactHead.exists !== true && exactHead.errorName) {
      console.log("[storage-debug:head-object-error]", {
        bucket: exactHead.bucket,
        endpoint: exactHead.endpoint,
        region: exactHead.region,
        forcePathStyle: exactHead.forcePathStyle,
        requestedKey: exactHead.key,
        errorName: exactHead.errorName,
        errorCode: exactHead.errorCode,
        httpStatusCode: exactHead.httpStatusCode,
        message: exactHead.message
      });
    }
  }

  if (
    exactKeyFound !== true &&
    shouldTryPublicImageFallback(requestedKey) &&
    (exactHead.httpStatusCode === 404 ||
      /NoSuchKey|NotFound/i.test(exactHead.errorCode ?? "") ||
      /not found/i.test(exactHead.message ?? ""))
  ) {
    const exactPublicUrl = buildPublicRootUrl(requestedKey);
    const publicStatus = await probeHttpHeadStatus(exactPublicUrl);
    if (SHOULD_DEBUG_STORAGE_OBJECT_ROUTE) {
      console.log("[storage-debug:public-head]", {
        requestedKey,
        publicUrl: exactPublicUrl,
        status: publicStatus
      });
    }
    if (publicStatus === 200) {
      return NextResponse.redirect(exactPublicUrl, { status: 302 });
    }
  }

  if (publicRootUrl && resolvedStorageKey) {
    const publicStatus = await probeHttpHeadStatus(publicRootUrl);
    if (SHOULD_DEBUG_STORAGE_OBJECT_ROUTE && shouldTryPublicImageFallback(resolvedStorageKey)) {
      console.log("[storage-debug:public-head]", {
        requestedKey: resolvedStorageKey,
        publicUrl: publicRootUrl,
        status: publicStatus
      });
    }
    if (publicStatus === 200) {
      return NextResponse.redirect(publicRootUrl, { status: 302 });
    }
  }

  if (resolvedStorageKey) {
    const signed = await createPresignedDownload({
      key: resolvedStorageKey,
      expiresIn: 600
    });
    const signedUrl = new URL(signed.url, request.url);
    const requestUrl = new URL(request.url);
    if (signedUrl.pathname !== requestUrl.pathname) {
      return NextResponse.redirect(signedUrl, { status: 302 });
    }
  }

  let fileSize = 0;
  try {
    fileSize = (await stat(resolvedFilePath)).size;
    if (process.env.STORAGE_DEBUG === "1") {
      console.log("[storage-debug:object-hit]", {
        key: resolvedStorageKey ?? requestedKey,
        filePath: resolvedFilePath,
        requestUrl: request.url
      });
    }
  } catch {
    if (SHOULD_DEBUG_STORAGE_OBJECT_ROUTE) {
      console.log("[storage-debug:object-miss]", {
        requestedKey,
        exactKeyFound,
        fallbackFoundKey,
        checkedPrefixes,
        publicRootUrl,
        requestUrl: request.url
      });
    }
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const body = await readFile(resolvedFilePath);
  let contentType = inferContentType(resolvedFilePath);

  try {
    const metaRaw = await readFile(resolvedMetaPath, "utf8");
    const meta = JSON.parse(metaRaw) as { contentType?: string };
    if (typeof meta.contentType === "string" && meta.contentType.trim()) {
      contentType = meta.contentType.trim();
    }
  } catch {
    // Metadata is optional for local debug storage.
  }

  const url = new URL(request.url);
  const rangeHeader = request.headers.get("range");
  const byteRange = parseHttpByteRange(rangeHeader, fileSize);
  if (rangeHeader && !byteRange) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes */${fileSize}`
      }
    });
  }
  const responseBody = byteRange ? body.subarray(byteRange.start, byteRange.end + 1) : body;
  const response = new NextResponse(responseBody, {
    status: byteRange ? 206 : 200,
    headers: {
      "Content-Type": url.searchParams.get("contentType") || contentType,
      "Cache-Control": "private, max-age=60",
      "Accept-Ranges": "bytes",
      "Content-Length": String(responseBody.byteLength),
      ...(byteRange
        ? { "Content-Range": `bytes ${byteRange.start}-${byteRange.end}/${fileSize}` }
        : {})
    }
  });

  const contentDisposition = url.searchParams.get("contentDisposition");
  if (contentDisposition) {
    response.headers.set("Content-Disposition", contentDisposition);
  }

  return response;
}
