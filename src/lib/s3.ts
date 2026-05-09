import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.S3_ENDPOINT;
const region = process.env.S3_REGION;
const bucket = process.env.S3_BUCKET;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

function isPlaceholderValue(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized.includes("example.com") ||
    normalized === "your_access_key" ||
    normalized === "your_secret_key"
  );
}

function getClient() {
  if (
    !endpoint ||
    !region ||
    !accessKeyId ||
    !secretAccessKey ||
    isPlaceholderValue(endpoint) ||
    isPlaceholderValue(accessKeyId) ||
    isPlaceholderValue(secretAccessKey)
  ) {
    return null;
  }

  return new S3Client({
    region,
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
}

function buildLocalObjectPath(key: string): string {
  return `/api/uploads/object/${key.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function buildLocalDownloadUrl(input: {
  key: string;
  responseContentDisposition?: string;
  responseContentType?: string;
}): string {
  const url = new URL(buildLocalObjectPath(input.key), "http://localhost");
  if (input.responseContentDisposition) {
    url.searchParams.set("contentDisposition", input.responseContentDisposition);
  }
  if (input.responseContentType) {
    url.searchParams.set("contentType", input.responseContentType);
  }
  return `${url.pathname}${url.search}`;
}

export async function createPresignedUpload(input: {
  key: string;
  contentType: string;
  expiresIn?: number;
}) {
  const client = getClient();

  if (!client || !bucket) {
    return {
      url: buildLocalObjectPath(input.key),
      method: "PUT",
      fields: {},
      mock: false
    };
  }

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    ContentType: input.contentType
  });

  const url = await getSignedUrl(client, command, {
    expiresIn: input.expiresIn ?? 600
  });

  return {
    url,
    method: "PUT",
    fields: {},
    mock: false
  };
}

export async function createPresignedDownload(input: {
  key: string;
  expiresIn?: number;
  responseContentDisposition?: string;
  responseContentType?: string;
}): Promise<{ url: string; mock: boolean }> {
  const client = getClient();

  if (!client || !bucket) {
    return {
      url: buildLocalDownloadUrl(input),
      mock: false
    };
  }

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: input.key,
    ResponseContentDisposition: input.responseContentDisposition,
    ResponseContentType: input.responseContentType
  });

  const url = await getSignedUrl(client, command, {
    expiresIn: input.expiresIn ?? 600
  });

  return {
    url,
    mock: false
  };
}
