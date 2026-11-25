import type { Prisma, PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import type {
  ReleaseSubmitFailureResponse,
  ReleaseSubmitRequest,
  ReleaseSubmitSuccessResponse
} from "@/lib/api/contracts";
import { authOptions } from "@/lib/auth";
import { getUserContractStatus } from "@/lib/contract-verification";
import { normalizeReleaseCoverUrl, resolveReleasePreviewForPersistence } from "@/lib/release-cover";
import { resolveTrackAudioAsset } from "@/lib/release-media-asset";
import { prisma } from "@/lib/prisma";
import {
  getReleaseLifecycleStatus,
  withReleaseLifecycleState
} from "@/lib/release-counts";
import {
  checkPartnerCodeForRelease,
  consumePartnerCodeForRelease
} from "@/lib/partner-codes";
import {
  groupReleaseValidationIssuesByStep,
  canEditRelease,
  releaseSubmissionDataSchema,
  type ReleaseSubmissionData,
  validateReleaseSubmission
} from "@/lib/release-policy";
import { sanitizePriorityReleaseFlag } from "@/lib/release-priority";
import { isReleaseClaimedByModerator } from "@/lib/release-moderation-claim";
import {
  isFreeReleaseClaimedBy,
  isFreeReleaseSubmissionAllowed,
  tryClaimFreeRelease
} from "@/lib/free-release";
import {
  buildFreeFirstReleasePaymentUsage,
  buildReferralBonusPaymentUsage,
  buildPartnerCodePaymentUsage,
  buildSubscriptionPaymentUsage,
  extrasIncludedInSubscription,
  getUserReleaseQuota,
  mergeReleaseRolesPaymentUsage
} from "@/lib/release-quota";
import { shouldResubmitEditedRelease } from "@/lib/release-wizard-mode";
import {
  describeReleaseCopySubmitBlock,
  findPaidPredecessorRelease,
  readReleaseCopySourceId,
  RELEASE_COPY_SOURCE_KEY,
  withoutModerationDecision,
  withReleaseResubmission
} from "@/lib/release-resubmission";
import { withReleasePaymentWaitingSince } from "@/lib/release-payment-followup";
import { findPaidTwin, transferReleasePayment } from "@/lib/release-payment-transfer";
import {
  calculateExtrasSupplement,
  planExtrasSupplement,
  readPendingExtrasSupplement,
  withExtrasSupplement,
  withoutExtrasSupplement
} from "@/lib/release-extras-supplement";
import { RELEASE_PRICING_TRACK_SELECT, type ReleasePrice } from "@/lib/release-pricing";
import { withReleaseTimelineStamp } from "@/lib/release-timeline";
import {
  buildSubmitTrackDiagnostics,
  buildTrackCreateManyInput,
  planTrackSync,
  readReleaseTypeFromSubmissionData
} from "@/lib/release-submit-tracks";
import { notifyAdminReleaseSubmitted } from "@/lib/telegram-notifier";
import {
  changedReleaseAreas,
  diffReleaseSubmissions,
  readReleaseChangeRequest,
  unmarkedReleaseChangeAreas,
  validateReleaseChangeRequest
} from "@/lib/release-copy-changes";

import { rememberReleaseArtistProfiles } from "@/lib/platform-link-discovery-service";
import { executeIdempotentSubmission, validSubmissionKey } from "@/lib/release-submission-idempotency";
import { settleOpenReleaseOrders } from "@/lib/release-payment-guard";
import { claimReferralBonusForRelease } from "@/lib/referrals";

export const dynamic = "force-dynamic";

function parseDate(value: unknown, fallback: Date): Date {
  if (typeof value !== "string") return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date;
}

function mergeSubmissionData(roles: unknown, submissionData: Record<string, unknown>): Record<string, unknown> {
  const root =
    roles && typeof roles === "object" && !Array.isArray(roles)
      ? (roles as Record<string, unknown>)
      : {};
  return {
    ...root,
    submissionData
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readCoverUploadUrl(data: Record<string, unknown>): string | null {
  const coverUpload = asRecord(data.coverUpload);
  return normalizeReleaseCoverUrl(coverUpload, null);
}

function readPerformer(data: Record<string, unknown>): string | null {
  const explicit = typeof data.artist === "string" ? data.artist.trim() : "";
  if (explicit) return explicit;

  const persons = Array.isArray(data.persons) ? data.persons : [];
  const performerNames = persons
    .map((item) => (item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : null))
    .filter(Boolean)
    .filter((item) => {
      const role = typeof item?.role === "string" ? item.role.trim().toLowerCase() : "";
      return role === "исполнитель";
    })
    .map((item) => (typeof item?.name === "string" ? item.name.trim() : ""))
    .filter(Boolean);

  return performerNames.join(", ") || null;
}

function readSubmissionDataCover(data: Record<string, unknown>): string | null {
  return readCoverUploadUrl(data) ?? normalizeReleaseCoverUrl(data.cover, null);
}

function pricingFailure(code: string, message: string) {
  const issue = { code, field: "freeRelease", message };
  const response: ReleaseSubmitFailureResponse = {
    ok: false,
    errors: [issue],
    errors_by_step: { release_info: [], tracks: [], stores: [], pricing: [issue] }
  };
  return NextResponse.json(response, { status: 400 });
}

async function notifyReleaseSubmittedSafe(params: {
  releaseTitle: string;
  artistName: string;
  releaseId: string;
}): Promise<void> {
  try {
    await notifyAdminReleaseSubmitted({
      releaseTitle: params.releaseTitle,
      artistName: params.artistName
    });
  } catch (error) {
    console.error("[telegram] release notification failed", {
      releaseId: params.releaseId,
      error
    });
  }
}

async function settleOpenInvoicesBeforeSubmit(userId: string, releaseId: string): Promise<Response | null> {
  const release = await prisma.release.findFirst({ where: { id: releaseId, userId }, select: { confirmed: true } });
  if (!release || release.confirmed) return null;
  try {
    const open = await settleOpenReleaseOrders({ prisma, userId, releaseId });
    if (open.state !== "processing") return null;
  } catch (error) {
    // YooKassa unreachable: a payment made meanwhile is still caught as a surplus payment.
    console.error("[release-submit] open invoices check failed", { releaseId, error });
    return null;
  }
  const issue = {
    code: "payment_processing",
    field: "payment",
    message: "Оплата этого релиза сейчас обрабатывается банком. Подождите пару минут и отправьте снова — второй раз платить не придётся."
  };
  const response: ReleaseSubmitFailureResponse = {
    ok: false,
    errors: [issue],
    errors_by_step: { release_info: [], tracks: [], stores: [], pricing: [issue] }
  };
  return NextResponse.json(response, { status: 409 });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = request.headers.get("Idempotency-Key");
  if (!validSubmissionKey(key)) return NextResponse.json({ error: "Требуется корректный Idempotency-Key." }, { status: 400 });
  let payload: unknown;
  try { payload = await request.clone().json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  // An unpaid release may have an invoice the artist already paid (or is paying right now). It is
  // settled before the submission picks a partner code, subscription slot, free single or bonus:
  // otherwise the release would be covered twice and the card payment would come on top.
  const submitReleaseId = asRecord(payload)?.releaseId;
  if (typeof submitReleaseId === "string" && submitReleaseId.trim()) {
    const blocked = await settleOpenInvoicesBeforeSubmit(session.user.id, submitReleaseId.trim());
    if (blocked) return blocked;
  }
  const notifications: Array<Parameters<typeof notifyReleaseSubmittedSafe>[0]> = [];
  const result = await executeIdempotentSubmission({
    prisma, userId: session.user.id, key, payload,
    execute: (tx) => executeSubmission(request, tx, notifications)
  });
  if (!result.replayed && result.response.ok) {
    // Telegram retries can take a while; the artist should not wait for them.
    void (async () => {
      for (const notification of notifications) await notifyReleaseSubmittedSafe(notification);
    })();
  }
  return result.response;
}

async function executeSubmission(request: Request, db: Prisma.TransactionClient, notifications: Array<Parameters<typeof notifyReleaseSubmittedSafe>[0]>) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: ReleaseSubmitRequest;
  try {
    payload = (await request.json()) as ReleaseSubmitRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload?.data || typeof payload.data !== "object") {
    return NextResponse.json({ error: "Submission payload is required" }, { status: 400 });
  }

  const parsedSubmission = releaseSubmissionDataSchema.safeParse(payload.data);
  if (!parsedSubmission.success) {
    const response: ReleaseSubmitFailureResponse = {
      ok: false,
      errors: [
        {
          code: "invalid_payload",
          field: "data",
          message: "Некорректные данные релиза. Обновите страницу и повторите отправку."
        }
      ],
      errors_by_step: {
        release_info: [
          {
            code: "invalid_payload",
            field: "data",
            message: "Некорректные данные релиза. Обновите страницу и повторите отправку."
          }
        ],
        tracks: [],
        stores: [],
        pricing: []
      }
    };
    return NextResponse.json(response, { status: 400 });
  }

  const data = payload.data as Record<string, unknown>;
  const rawSubmissionData = parsedSubmission.data;
  const validationIssues = validateReleaseSubmission(rawSubmissionData);
  if (validationIssues.length > 0) {
    const response: ReleaseSubmitFailureResponse = {
      ok: false,
      errors: validationIssues,
      errors_by_step: groupReleaseValidationIssuesByStep(validationIssues)
    };
    return NextResponse.json(response, { status: 400 });
  }

  const missingAudio = (await Promise.all(
    rawSubmissionData.tracks.map(async (track, index) => {
      try {
        const asset = await resolveTrackAudioAsset({
          trackId: `submit-${index + 1}`,
          trackTitle: track.title,
          audioFile: track.audioFile,
          track: track.fileName,
          requireReachable: true
        });
        return asset.storageKey ? null : index;
      } catch {
        return index;
      }
    })
  )).filter((index): index is number => index !== null);
  if (missingAudio.length > 0) {
    const errors = missingAudio.map((index) => ({
      code: "audio_not_uploaded",
      field: `tracks.${index}.audioFile`,
      message: `Аудиофайл трека №${index + 1} не найден в хранилище. Загрузите его заново.`
    }));
    const response: ReleaseSubmitFailureResponse = {
      ok: false,
      errors,
      errors_by_step: groupReleaseValidationIssuesByStep(errors)
    };
    return NextResponse.json(response, { status: 400 });
  }

  const releaseId = payload.releaseId?.trim();
  if (!releaseId) {
    return NextResponse.json({ error: "releaseId is required" }, { status: 400 });
  }

  await db.$queryRaw`SELECT id FROM "icecream"."release" WHERE id::text = ${releaseId} AND "userId"::text = ${session.user.id} FOR UPDATE`;
  const existing = await db.release.findFirst({
    where: { id: releaseId, userId: session.user.id },
    select: {
      id: true,
      date: true,
      confirmed: true,
      status: true,
      roles: true
    }
  });

  if (!existing) {
    return NextResponse.json({ error: "Релиз не найден" }, { status: 404 });
  }

  const lifecycle = getReleaseLifecycleStatus(existing.status, existing.roles) ?? "draft";
  if (payload.mode !== "edit" && lifecycle === "moderation") {
    const response: ReleaseSubmitSuccessResponse = {
      ok: true,
      releaseId: existing.id,
      nextStatus: "moderation",
      message: "Релиз уже отправлен на модерацию."
    };
    return NextResponse.json(response, { status: 200 });
  }
  const editPermission = canEditRelease({
    status: lifecycle,
    moderationStarted: Boolean(existing.status === "moderating"),
    claimedByModerator: isReleaseClaimedByModerator(existing.status, existing.roles),
    awaitingPayment: !existing.confirmed
  });
  if (!editPermission.allowed) {
    return NextResponse.json({ error: editPermission.message }, { status: 409 });
  }
  // An approved release is never changed in place: "Редактировать" makes a copy that goes
  // through moderation (and the extras check below) and is merged back on approval.
  if (editPermission.createsModerationCopy) {
    return NextResponse.json(
      { error: "Принятый релиз меняется через «Редактировать»: изменения уходят на проверку отдельной заявкой." },
      { status: 409 }
    );
  }

  // Sending a returned / rejected release again: the old moderator decision is not part of the
  // new submission (it would show as a stale reason, or come back as the artist's comment).
  // Lifecycle is read from `lifecycleRoles`, which still has the legacy decision flags.
  const lifecycleRoles = existing.roles;
  // A rejected release reads as "changes_required" here too.
  const leavesModerationDecision = lifecycle === "changes_required";
  if (leavesModerationDecision) {
    existing.roles = withoutModerationDecision(asRecord(existing.roles) ?? {}) as Prisma.JsonValue;
  }

  const contract = await getUserContractStatus({ prisma: db as PrismaClient, userId: session.user.id });
  if (contract.status === "unavailable") return NextResponse.json({ error: contract.reason }, { status: 503 });
  if (!contract.canSubmitReleases) {
    return NextResponse.json(
      { error: contract.reason || "Для отправки релиза требуется подтвержденный договор." },
      { status: 403 }
    );
  }

  const releaseDate = parseDate(data.releaseDate, existing.date);
  const startDate = parseDate(data.startDate, releaseDate);
  const preorderDate = parseDate(data.preorderDate, releaseDate);

  const quota = await getUserReleaseQuota(session.user.id, db);
  const submissionData: ReleaseSubmissionData = {
    ...rawSubmissionData,
    priorityRelease: sanitizePriorityReleaseFlag({
      requested: data.priorityRelease,
      plan: quota.plan,
      isActive: quota.isActive
    })
  };
  // "Это он" picked in the wizard: the artist confirmed these profiles, keep them on the artist card
  // even if saving the release fails further down.
  await rememberReleaseArtistProfiles(session.user.id, submissionData.persons).catch((error) => {
    console.error("[release-submit] could not remember artist profiles", error);
  });
  const preview = await resolveReleasePreviewForPersistence({
    id: existing.id,
    preview: normalizeReleaseCoverUrl(data.cover, null),
    submissionData,
    coverUpload: data.coverUpload,
    cover: data.cover,
    roles: mergeSubmissionData(existing.roles, submissionData),
    userId: session.user.id,
    title: typeof data.title === "string" && data.title.trim() ? data.title.trim() : "Новый релиз"
  });
  const baseReleaseData = {
    title: typeof data.title === "string" && data.title.trim() ? data.title.trim() : "Новый релиз",
    subtitle: typeof data.subtitle === "string" ? data.subtitle : null,
    performer: readPerformer(data),
    genre: typeof data.genre === "string" && data.genre.trim() ? data.genre.trim() : "Не указан",
    preview,
    language: typeof data.language === "string" && data.language.trim() ? data.language.trim() : "Russian",
    date: releaseDate,
    startDate,
    preorderDate,
    type: readReleaseTypeFromSubmissionData(data),
    earlyStartInRussia: submissionData.earlyRussiaStart,
    realTimeDelivery: submissionData.realTimeDelivery,
    yandexSoonNewRelease: parseDate(submissionData.yandexPreReleaseDate, releaseDate)
  };
  const trackRows = buildTrackCreateManyInput({
    releaseId: existing.id,
    releaseLanguage: baseReleaseData.language,
    startDate,
    tracks: submissionData.tracks
  });

  // A paid release re-sent with more lyrics / karaoke / video than was paid for waits for a
  // supplement payment before moderation. Active PRO / ENTERPRISE subscribers have extras included.
  // Once confirmed (paid, or marked paid / approved by an admin), the release's tracks are the baseline.
  const pendingSupplement = existing.confirmed ? null : readPendingExtrasSupplement(existing.roles);
  const resolvePaidResend = async (params: {
    roles: Record<string, unknown>;
    paidReleaseId: string;
    sourceReleaseId?: string | null;
  }): Promise<{ confirmed: boolean; roles: Record<string, unknown>; supplement: ReleasePrice | null }> => {
    const paidTracks = await db.track.findMany({
      where: { releaseId: params.paidReleaseId },
      select: RELEASE_PRICING_TRACK_SELECT
    });
    const plan = planExtrasSupplement({
      paidTracks,
      nextTracks: trackRows,
      pending: pendingSupplement,
      extrasIncluded: extrasIncludedInSubscription(quota)
    });
    const roles = withoutExtrasSupplement(params.roles);
    if (!plan) return { confirmed: true, roles, supplement: null };
    return {
      confirmed: false,
      roles: withReleasePaymentWaitingSince(
        withExtrasSupplement(roles, {
          paid: plan.paid,
          amountRub: plan.price.totalRub,
          sourceReleaseId: params.sourceReleaseId
        })
      ),
      supplement: plan.price
    };
  };
  const supplementMessage = (price: ReleasePrice) =>
    `Изменения отправлены. Добавленные дополнения (${price.lines
      .map((line) => (line.count > 1 ? `${line.label.toLowerCase()} × ${line.count}` : line.label.toLowerCase()))
      .join(", ")}) нужно доплатить: ${price.totalRub} ₽. Изменения ждут оплаты, проверка начнётся сразу после неё.`;

  const updateReleaseAndSyncTracks = async (params: {
    confirmed: boolean;
    status: (typeof existing)["status"];
    roles: Prisma.InputJsonValue;
    afterSync?: (tx: Prisma.TransactionClient) => Promise<void>;
  }) => {
    try {
      const createdTracksCount = await (async (tx: Prisma.TransactionClient) => {
        await tx.release.update({
          where: { id: existing.id },
          data: {
            ...baseReleaseData,
            confirmed: params.confirmed,
            status: params.status,
            roles: withReleaseTimelineStamp(params.roles, "submittedAt") as Prisma.InputJsonValue,
            ...(leavesModerationDecision && params.status === "moderating"
              ? { rejectReason: null, moderatorComment: null }
              : {})
          }
        });
        // Edit tracks in place instead of delete + create: track ids are kept, so royalty
        // and analytics rows linked to a track stay linked after the artist edits the release.
        const existingTracks = await tx.track.findMany({
          where: { releaseId: existing.id },
          select: { id: true, title: true, isrc: true, index: true, roles: true }
        });
        const syncPlan = planTrackSync(existingTracks, trackRows);
        if (syncPlan.deleteIds.length > 0) {
          await tx.track.deleteMany({
            where: { releaseId: existing.id, id: { in: syncPlan.deleteIds } }
          });
        }
        for (const update of syncPlan.updates) {
          const data: Prisma.trackUncheckedUpdateInput = { ...update.data };
          delete data.releaseId;
          await tx.track.update({
            where: { id: update.id },
            data
          });
        }
        if (syncPlan.creates.length > 0) {
          await tx.track.createMany({
            data: syncPlan.creates
          });
        }
        const persistedCount = await tx.track.count({
          where: { releaseId: existing.id }
        });
        if (persistedCount !== trackRows.length) {
          throw new Error("release_track_sync_mismatch");
        }
        if (params.afterSync) {
          await params.afterSync(tx);
        }
        return persistedCount;
      })(db);

      console.info(
        "[release-submit-track-sync]",
        buildSubmitTrackDiagnostics({
          releaseId: existing.id,
          payloadData: data,
          submissionData,
          createdTracksCount
        })
      );

      return createdTracksCount;
    } catch (error) {
      console.error(
        "[release-submit-track-sync-failed]",
        {
          ...buildSubmitTrackDiagnostics({
            releaseId: existing.id,
            payloadData: data,
            submissionData,
            createdTracksCount: 0
          }),
          error
        }
      );
      throw error;
    }
  };
  console.log("[release-cover-save]", {
    releaseId: existing.id,
    preview: baseReleaseData.preview,
    submissionDataCover: readSubmissionDataCover(data)
  });

  const freeReleaseShape = isFreeReleaseSubmissionAllowed({
    releaseType: baseReleaseData.type,
    releaseKind: submissionData.releaseKind,
    trackCount: submissionData.tracks.length
  });

  // One round of changes to an approved release is reviewed at a time, and a copy started before
  // the original last changed must not undo the changes approved since. Submissions of one artist
  // are serialized by the user lock, so two copies cannot both pass this check.
  const copySubmitBlock = async (sourceId: string, sourceRoles: unknown) => {
    const otherCopies = await db.release.findMany({
      where: {
        userId: session.user.id,
        id: { not: existing.id },
        roles: { path: [RELEASE_COPY_SOURCE_KEY], equals: sourceId }
      },
      select: { status: true, roles: true }
    });
    const message = describeReleaseCopySubmitBlock({
      copyRoles: existing.roles,
      sourceRoles,
      otherCopies: otherCopies.map((copy) => ({
        lifecycle: getReleaseLifecycleStatus(copy.status, copy.roles),
        roles: copy.roles
      }))
    });
    if (!message) return null;
    const issue = { code: "change_request_blocked", field: "changeRequest", message };
    const response: ReleaseSubmitFailureResponse = {
      ok: false,
      errors: [issue],
      errors_by_step: { release_info: [issue], tracks: [], stores: [], pricing: [] }
    };
    return NextResponse.json(response, { status: 409 });
  };

  // An unpaid release edited after it was sent (still «Ожидает оплаты», or returned / rejected
  // before payment) is paid for like a new send: partner code, free single, bonus, subscription
  // or invoice. The in-place edit below would keep it unpaid and ignore the partner code.
  const unpaidEditedSend =
    payload.mode === "edit" &&
    !existing.confirmed &&
    !pendingSupplement &&
    !readReleaseCopySourceId(existing.roles) &&
    (lifecycle === "moderation" || shouldResubmitEditedRelease(lifecycle));

  if (payload.mode === "edit" && !unpaidEditedSend) {
    // A free single stays a one-track single after edits too.
    if (!freeReleaseShape.ok && (await isFreeReleaseClaimedBy(db, existing.id))) {
      return pricingFailure("free_release_shape", freeReleaseShape.message);
    }
    const editedCopySourceId = readReleaseCopySourceId(existing.roles);
    if (editedCopySourceId) {
      const source = await db.release.findFirst({
        where: { id: editedCopySourceId, userId: session.user.id },
        select: { roles: true }
      });
      const copyBlock = await copySubmitBlock(editedCopySourceId, source?.roles);
      if (copyBlock) return copyBlock;
      // A copy returned for changes and sent again: the moderator sees what differs now, not the
      // list from the first round.
      const sourceSubmission = asRecord(source?.roles)?.submissionData;
      if (sourceSubmission) {
        const changes = diffReleaseSubmissions(sourceSubmission, submissionData);
        existing.roles = {
          ...(asRecord(existing.roles) ?? {}),
          copyChanges: {
            areas: changedReleaseAreas(changes),
            unmarkedAreas: unmarkedReleaseChangeAreas(changes, readReleaseChangeRequest(submissionData)),
            computedAt: new Date().toISOString()
          }
        } as Prisma.JsonValue;
      }
    }
    const currentLifecycle =
      getReleaseLifecycleStatus(existing.status, lifecycleRoles) ?? payload.currentStatus;
    // Resubmission keeps the existing payment: the base fee is not charged again, only
    // lyrics / karaoke / video added beyond what was paid (see resolvePaidResend).
    const paidResend =
      existing.confirmed || pendingSupplement
        ? await resolvePaidResend({
            roles: mergeSubmissionData(existing.roles, submissionData),
            paidReleaseId: existing.id
          })
        : null;
    // Added extras always wait for payment and moderation, whatever the release status was.
    const shouldResubmit = shouldResubmitEditedRelease(currentLifecycle) || Boolean(paidResend?.supplement);
    const editedRoles = withReleaseLifecycleState(
      paidResend?.roles ?? mergeSubmissionData(existing.roles, submissionData),
      shouldResubmit
        ? "moderation"
        : (getReleaseLifecycleStatus(existing.status, lifecycleRoles) ?? payload.currentStatus ?? "draft")
    );
    await updateReleaseAndSyncTracks({
      confirmed: paidResend ? paidResend.confirmed : existing.confirmed,
      status: shouldResubmit ? "moderating" : existing.status,
      roles: editedRoles as Prisma.InputJsonValue,
      afterSync: shouldResubmit
        ? async (tx) => {
            await tx.release.update({
              where: { id: existing.id },
              data: {
                rejectReason: null,
                moderatorComment: null
              }
            });
          }
        : undefined
    });

    // A release waiting for a supplement payment is not in the queue yet: the admin hears
    // about it once it is paid (see payment-order-service).
    if (shouldResubmit && !paidResend?.supplement) {
      notifications.push({
        releaseId: existing.id,
        releaseTitle: baseReleaseData.title,
        artistName: baseReleaseData.performer?.trim() || "Неизвестный исполнитель"
      });
    }

    const response: ReleaseSubmitSuccessResponse & { payment_required?: true; paid?: false } = {
      ok: true,
      releaseId: existing.id,
      nextStatus: shouldResubmit ? "moderation" : (currentLifecycle ?? "draft"),
      ...(paidResend?.supplement ? { payment_required: true as const, paid: false as const } : {}),
      message: paidResend?.supplement
        ? supplementMessage(paidResend.supplement)
        : shouldResubmit
          ? "Релиз повторно отправлен на модерацию."
          : "Изменения релиза сохранены."
    };

    return NextResponse.json(response, { status: 200 });
  }

  // An edited copy of an approved release says what changes; the actual difference is kept for moderation.
  const copySourceId = readReleaseCopySourceId(existing.roles);
  if (copySourceId) {
    const changeRequest = readReleaseChangeRequest(submissionData);
    const changeRequestMessage = validateReleaseChangeRequest(changeRequest);
    if (changeRequestMessage) {
      const issue = { code: "change_request_required", field: "changeRequest", message: changeRequestMessage };
      const response: ReleaseSubmitFailureResponse = {
        ok: false,
        errors: [issue],
        errors_by_step: { release_info: [issue], tracks: [], stores: [], pricing: [] }
      };
      return NextResponse.json(response, { status: 400 });
    }
    const source = await db.release.findFirst({
      where: { id: copySourceId, userId: session.user.id },
      select: { roles: true }
    });
    const copyBlock = await copySubmitBlock(copySourceId, source?.roles);
    if (copyBlock) return copyBlock;
    const sourceSubmission = asRecord(source?.roles)?.submissionData;
    if (sourceSubmission) {
      const changes = diffReleaseSubmissions(sourceSubmission, submissionData);
      existing.roles = {
        ...(asRecord(existing.roles) ?? {}),
        copyChanges: {
          areas: changedReleaseAreas(changes),
          unmarkedAreas: unmarkedReleaseChangeAreas(changes, changeRequest),
          computedAt: new Date().toISOString()
        }
      } as Prisma.JsonValue;
    }
  }

  // An already paid release (returned for changes, rejected, re-sent) goes back to moderation
  // as paid: no new invoice, no subscription slot, no partner code or free release spent again.
  // Only extras added beyond the paid ones are charged (a pending supplement keeps its baseline).
  if (existing.confirmed || (pendingSupplement && !pendingSupplement.sourceReleaseId)) {
    const paidResend = await resolvePaidResend({
      roles: mergeSubmissionData(existing.roles, submissionData),
      paidReleaseId: existing.id
    });
    await updateReleaseAndSyncTracks({
      confirmed: paidResend.confirmed,
      status: "moderating",
      roles: withReleaseResubmission(
        withReleaseLifecycleState(paidResend.roles, "moderation"),
        { previousStatus: lifecycle }
      ) as Prisma.InputJsonValue,
      afterSync: async (tx) => {
        await tx.release.update({
          where: { id: existing.id },
          data: { rejectReason: null, moderatorComment: null }
        });
      }
    });
    if (!paidResend.supplement) {
      notifications.push({
        releaseId: existing.id,
        releaseTitle: baseReleaseData.title,
        artistName: baseReleaseData.performer?.trim() || "Неизвестный исполнитель"
      });
    }

    const response: ReleaseSubmitSuccessResponse & { payment_required?: true; paid?: false } = {
      ok: true,
      releaseId: existing.id,
      nextStatus: "moderation",
      ...(paidResend.supplement ? { payment_required: true as const, paid: false as const } : {}),
      message: paidResend.supplement
        ? supplementMessage(paidResend.supplement)
        : "Релиз повторно отправлен на модерацию. Повторная оплата не требуется."
    };

    return NextResponse.json(response, { status: 200 });
  }

  // A copy made by editing an approved release, or a release re-sent with the UPC of a paid one.
  const paidPredecessor = existing.confirmed
    ? null
    : await findPaidPredecessorRelease(db, {
        userId: session.user.id,
        releaseId: existing.id,
        // Only an explicit copy of an approved release is "already paid". A UPC typed by the artist
        // is not proof: reusing an old UPC must not make a new release free or overwrite the old one.
        upc: null,
        sourceReleaseId: readReleaseCopySourceId(existing.roles)
      });
  if (paidPredecessor) {
    // The approved original's tracks are what was paid for; extras added in the copy are charged.
    const paidResend = await resolvePaidResend({
      roles: mergeSubmissionData(existing.roles, submissionData),
      paidReleaseId: paidPredecessor.id,
      sourceReleaseId: paidPredecessor.id
    });
    await updateReleaseAndSyncTracks({
      confirmed: paidResend.confirmed,
      status: "moderating",
      roles: withReleaseResubmission(
        withReleaseLifecycleState(paidResend.roles, "moderation"),
        { sourceReleaseId: paidPredecessor.id }
      ) as Prisma.InputJsonValue
    });
    if (!paidResend.supplement) {
      notifications.push({
        releaseId: existing.id,
        releaseTitle: baseReleaseData.title,
        artistName: baseReleaseData.performer?.trim() || "Неизвестный исполнитель"
      });
    }

    const response: ReleaseSubmitSuccessResponse & { payment_required?: true; paid?: false } = {
      ok: true,
      releaseId: existing.id,
      nextStatus: "moderation",
      ...(paidResend.supplement ? { payment_required: true as const, paid: false as const } : {}),
      message: paidResend.supplement
        ? supplementMessage(paidResend.supplement)
        : copySourceId
          ? "Изменения релиза отправлены на проверку. Повторная оплата не требуется."
          : "Релиз повторно отправлен на модерацию. Повторная оплата не требуется."
    };

    return NextResponse.json(response, { status: 200 });
  }

  // Not a re-sent paid release any more: an old supplement no longer prices it.
  existing.roles = withoutExtrasSupplement(asRecord(existing.roles) ?? {}) as Prisma.JsonValue;

  // A new release made instead of fixing a paid one sent back for changes (same UPC): the old
  // payment moves here and the old release is closed, so the artist does not pay twice.
  if (!copySourceId) {
    const paidTwin = await findPaidTwin(db, {
      userId: session.user.id,
      releaseId: existing.id,
      title: baseReleaseData.title,
      upc: submissionData.upc?.trim() || null
    });
    const moved =
      paidTwin?.match === "upc"
        ? await transferReleasePayment(db, { fromReleaseId: paidTwin.id, toReleaseId: existing.id, adminId: null })
        : null;
    if (paidTwin && moved) {
      const transferred = await db.release.findUnique({ where: { id: existing.id }, select: { roles: true } });
      const paidResend = await resolvePaidResend({
        roles: mergeSubmissionData(withoutExtrasSupplement(asRecord(transferred?.roles) ?? {}), submissionData),
        paidReleaseId: paidTwin.id
      });
      await updateReleaseAndSyncTracks({
        confirmed: paidResend.confirmed,
        status: "moderating",
        roles: withReleaseLifecycleState(paidResend.roles, "moderation") as Prisma.InputJsonValue
      });
      if (!paidResend.supplement) {
        notifications.push({
          releaseId: existing.id,
          releaseTitle: baseReleaseData.title,
          artistName: baseReleaseData.performer?.trim() || "Неизвестный исполнитель"
        });
      }
      const transferNote = `Оплата перенесена с релиза «${moved.fromTitle}», который был возвращён на исправление: платить повторно не нужно.`;
      const response: ReleaseSubmitSuccessResponse & { payment_required?: true; paid?: false } = {
        ok: true,
        releaseId: existing.id,
        nextStatus: "moderation",
        ...(paidResend.supplement ? { payment_required: true as const, paid: false as const } : {}),
        message: paidResend.supplement
          ? `${transferNote} ${supplementMessage(paidResend.supplement)}`
          : `${transferNote} Релиз отправлен на модерацию.`
      };
      return NextResponse.json(response, { status: 200 });
    }
  }

  // If the free release does not apply for any reason, the release still goes out the usual
  // way (subscription or payment); the artist is told why and the reason is kept for admins.
  let freeReleaseFallback: { code: string; message: string } | null = null;
  const freeClaim = !payload.useFreeRelease
    ? null
    : freeReleaseShape.ok
      ? await tryClaimFreeRelease(db, { userId: session.user.id, releaseId: existing.id })
      : { ok: false as const, code: "free_release_shape", message: freeReleaseShape.message };
  if (freeClaim && !freeClaim.ok) {
    freeReleaseFallback = { code: freeClaim.code, message: freeClaim.message };
    existing.roles = {
      ...((existing.roles && typeof existing.roles === "object" && !Array.isArray(existing.roles)
        ? existing.roles
        : {}) as Record<string, unknown>),
      freeReleaseFallback: { ...freeReleaseFallback, at: new Date().toISOString() }
    } as Prisma.JsonValue;
  }
  const fallbackNote = freeReleaseFallback
    ? `Бесплатный релиз не применился: ${freeReleaseFallback.message.replace(/\.$/u, "")}. Релиз отправлен как обычный. `
    : "";

  if (freeClaim?.ok) {

    await updateReleaseAndSyncTracks({
      confirmed: true,
      status: "moderating",
      roles: withReleaseLifecycleState(
        mergeReleaseRolesPaymentUsage(existing.roles, buildFreeFirstReleasePaymentUsage(), submissionData),
        "moderation"
      ) as Prisma.InputJsonValue
    });
    notifications.push({
      releaseId: existing.id,
      releaseTitle: baseReleaseData.title,
      artistName: baseReleaseData.performer?.trim() || "Неизвестный исполнитель"
    });

    const response: ReleaseSubmitSuccessResponse = {
      ok: true,
      releaseId: existing.id,
      nextStatus: "moderation",
      message: "Бесплатный релиз отправлен на модерацию."
    };
    return NextResponse.json(response, { status: 200 });
  }

  // A bonus release earned for paying friends covers the release itself, like a subscription
  // slot on STANDARD: lyrics, karaoke and video on it are still paid separately.
  if (payload.useReferralBonus && !freeClaim?.ok) {
    const bonusClaimed = await claimReferralBonusForRelease(db, { userId: session.user.id, releaseId: existing.id });
    if (bonusClaimed) {
      const bonusRoles = mergeReleaseRolesPaymentUsage(
        existing.roles,
        buildReferralBonusPaymentUsage(),
        submissionData
      ) as Record<string, unknown>;
      const bonusExtras = calculateExtrasSupplement(trackRows, { lyrics: 0, karaoke: 0, video: 0 });
      if (bonusExtras.totalRub > 0) {
        await updateReleaseAndSyncTracks({
          confirmed: false,
          status: "moderating",
          roles: withReleasePaymentWaitingSince(
            withReleaseLifecycleState(
              withExtrasSupplement(bonusRoles, {
                paid: { lyrics: 0, karaoke: 0, video: 0 },
                amountRub: bonusExtras.totalRub
              }),
              "moderation"
            )
          ) as Prisma.InputJsonValue
        });
        const response: ReleaseSubmitSuccessResponse & { payment_required: true; paid: false } = {
          ok: true,
          releaseId: existing.id,
          nextStatus: "moderation",
          payment_required: true,
          paid: false,
          message: `${fallbackNote}Релиз отправлен за бонус, а дополнения оплачиваются отдельно: ${bonusExtras.totalRub} ₽. Модерация начнётся сразу после оплаты.`
        };
        return NextResponse.json(response, { status: 200 });
      }
      await updateReleaseAndSyncTracks({
        confirmed: true,
        status: "moderating",
        roles: withReleaseLifecycleState(bonusRoles, "moderation") as Prisma.InputJsonValue
      });
      notifications.push({
        releaseId: existing.id,
        releaseTitle: baseReleaseData.title,
        artistName: baseReleaseData.performer?.trim() || "Неизвестный исполнитель"
      });
      const response: ReleaseSubmitSuccessResponse = {
        ok: true,
        releaseId: existing.id,
        nextStatus: "moderation",
        message: `${fallbackNote}Релиз отправлен на модерацию за бонус за друзей.`
      };
      return NextResponse.json(response, { status: 200 });
    }
  }

  const submittedPartnerCode = submissionData.partnerCode?.trim() || "";
  const partnerCodeCheck = submittedPartnerCode
    ? await checkPartnerCodeForRelease({
        prisma: db,
        code: submittedPartnerCode,
        userId: session.user.id,
        userEmail: session.user.email ?? "",
        releaseId: existing.id
      })
    : null;

  if (submittedPartnerCode && partnerCodeCheck && !partnerCodeCheck.ok) {
    const issue = {
      code: `partner_code_${partnerCodeCheck.reason}`,
      field: "partnerCode",
      message: partnerCodeCheck.message
    };

    const response: ReleaseSubmitFailureResponse = {
      ok: false,
      errors: [issue],
      errors_by_step: {
        release_info: [issue],
        tracks: [],
        stores: [],
        pricing: []
      }
    };

    return NextResponse.json(response, { status: 400 });
  }

  if (partnerCodeCheck?.ok) {
    let partnerCodeResult:
      | Awaited<ReturnType<typeof consumePartnerCodeForRelease>>
      | null = null;

    await updateReleaseAndSyncTracks({
      confirmed: true,
      status: "moderating",
      roles: withReleaseLifecycleState(
        mergeReleaseRolesPaymentUsage(
          existing.roles,
          buildPartnerCodePaymentUsage({
            partnerCode: submittedPartnerCode
          }),
          submissionData
        ),
        "moderation"
      ) as Prisma.InputJsonValue,
      afterSync: async (tx) => {
        partnerCodeResult = await consumePartnerCodeForRelease({
          prisma: tx,
          code: submittedPartnerCode,
          userId: session.user.id,
          userEmail: session.user.email ?? "",
          releaseId: existing.id
        });

        if (!partnerCodeResult.ok) {
          throw new Error(`partner_code:${partnerCodeResult.reason}:${partnerCodeResult.message}`);
        }

        await tx.release.update({
          where: { id: existing.id },
          data: {
            roles: withReleaseLifecycleState(
              mergeReleaseRolesPaymentUsage(
                existing.roles,
                buildPartnerCodePaymentUsage({
                  partnerCode: partnerCodeResult.code,
                  partnerCodeId: partnerCodeResult.partnerCodeId
                }),
                submissionData
              ),
              "moderation"
            ) as Prisma.InputJsonValue
          }
        });
      }
    });

    notifications.push({
      releaseId: existing.id,
      releaseTitle: baseReleaseData.title,
      artistName: baseReleaseData.performer?.trim() || "Неизвестный исполнитель"
    });

    const response: ReleaseSubmitSuccessResponse = {
      ok: true,
      releaseId: existing.id,
      nextStatus: "moderation",
      message: `${fallbackNote}Релиз отправлен на модерацию по партнёрскому коду.`,
      ...(freeReleaseFallback ? { freeReleaseFallback: freeReleaseFallback.message } : {})
    };

    return NextResponse.json(response, { status: 200 });
  }

  if (quota.requiresPaymentForNextRelease) {
    const waitingRoles = withReleaseLifecycleState(mergeSubmissionData(existing.roles, submissionData), "moderation");
    // Editing a release that already waits for payment keeps its reminder schedule.
    const alreadyWaiting = lifecycle === "moderation" && Boolean(asRecord(waitingRoles.paymentReminders));
    await updateReleaseAndSyncTracks({
      confirmed: false,
      status: "moderating",
      // Payment reminders (1h / 24h / 3d) count from this moment.
      roles: (alreadyWaiting ? waitingRoles : withReleasePaymentWaitingSince(waitingRoles)) as Prisma.InputJsonValue
    });
    // Not paid yet: it waits for payment, and the admin is told once it is paid.

    const response: ReleaseSubmitSuccessResponse & {
      payment_required: true;
      paid: false;
    } = {
      ok: true,
      releaseId: existing.id,
      nextStatus: "moderation",
      payment_required: true,
      paid: false,
      ...(freeReleaseFallback ? { freeReleaseFallback: freeReleaseFallback.message } : {}),
      message: fallbackNote + (quota.isActive
        ? "Релиз сохранён и ждёт оплаты: лимит подписки исчерпан. Модерация начнётся сразу после оплаты."
        : "Релиз сохранён и ждёт оплаты: активной подписки нет. Модерация начнётся сразу после оплаты.")
    };

    return NextResponse.json(response, { status: 200 });
  }

  const subscriptionRoles = mergeReleaseRolesPaymentUsage(
    existing.roles,
    buildSubscriptionPaymentUsage({ quota }),
    submissionData
  ) as Record<string, unknown>;

  // STANDARD covers the release itself: lyrics, karaoke and video on it are paid separately.
  // The release takes its subscription slot now and waits only for the extras payment.
  const standardExtras = extrasIncludedInSubscription(quota)
    ? null
    : calculateExtrasSupplement(trackRows, { lyrics: 0, karaoke: 0, video: 0 });
  if (standardExtras && standardExtras.totalRub > 0) {
    await updateReleaseAndSyncTracks({
      confirmed: false,
      status: "moderating",
      roles: withReleasePaymentWaitingSince(
        withReleaseLifecycleState(
          withExtrasSupplement(subscriptionRoles, {
            paid: { lyrics: 0, karaoke: 0, video: 0 },
            amountRub: standardExtras.totalRub
          }),
          "moderation"
        )
      ) as Prisma.InputJsonValue
    });

    const response: ReleaseSubmitSuccessResponse & { payment_required: true; paid: false } = {
      ok: true,
      releaseId: existing.id,
      nextStatus: "moderation",
      payment_required: true,
      paid: false,
      ...(freeReleaseFallback ? { freeReleaseFallback: freeReleaseFallback.message } : {}),
      message: `${fallbackNote}Релиз входит в подписку STANDARD, а дополнения (${standardExtras.lines
        .map((line) => (line.count > 1 ? `${line.label.toLowerCase()} × ${line.count}` : line.label.toLowerCase()))
        .join(", ")}) оплачиваются отдельно: ${standardExtras.totalRub} ₽. Модерация начнётся сразу после оплаты.`
    };
    return NextResponse.json(response, { status: 200 });
  }

  await updateReleaseAndSyncTracks({
    confirmed: true,
    status: "moderating",
    roles: withReleaseLifecycleState(subscriptionRoles, "moderation") as Prisma.InputJsonValue
  });
  notifications.push({
    releaseId: existing.id,
    releaseTitle: baseReleaseData.title,
    artistName: baseReleaseData.performer?.trim() || "Неизвестный исполнитель"
  });

  const response: ReleaseSubmitSuccessResponse = {
    ok: true,
    releaseId: existing.id,
    nextStatus: "moderation",
    message: `${fallbackNote}Релиз отправлен на модерацию.`,
    ...(freeReleaseFallback ? { freeReleaseFallback: freeReleaseFallback.message } : {})
  };

  return NextResponse.json(response, { status: 200 });
}
