import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

export function submissionFingerprint(payload: unknown): string {
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonicalize(item)]));
    }
    return value;
  };
  return createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

export function validSubmissionKey(key: string | null): key is string {
  return Boolean(key && /^[A-Za-z0-9_-]{16,128}$/.test(key));
}

/** The receipt and all release/quota mutations commit together. The user lock also
 * serializes competing submissions of different releases against the same quota. */
export async function executeIdempotentSubmission(params: {
  prisma: Pick<PrismaClient, "$transaction">;
  userId: string;
  key: string;
  payload: unknown;
  execute: (tx: Prisma.TransactionClient) => Promise<Response>;
}): Promise<{ response: Response; replayed: boolean }> {
  const fingerprint = submissionFingerprint(params.payload);
  return params.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`release-submit:${params.userId}`}, 0))`;
    const existing = await tx.release_submission_requests.findUnique({
      where: { user_id_idempotency_key: { user_id: params.userId, idempotency_key: params.key } }
    });
    if (existing) {
      if (existing.request_hash !== fingerprint) {
        return { response: Response.json({ error: "Ключ отправки уже использован с другими данными." }, { status: 409 }), replayed: true };
      }
      return { response: Response.json(existing.response_body, { status: existing.response_status }), replayed: true };
    }
    const response = await params.execute(tx);
    if (response.ok) {
      await tx.release_submission_requests.create({ data: {
        user_id: params.userId,
        idempotency_key: params.key,
        request_hash: fingerprint,
        response_status: response.status,
        response_body: await response.clone().json() as Prisma.InputJsonValue
      } });
    }
    return { response, replayed: false };
  }, { maxWait: 10000, timeout: 60000 });
}
