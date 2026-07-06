import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import type {
  ReleaseSubmitFailureResponse,
  ReleaseSubmitRequest,
  ReleaseSubmitSuccessResponse
} from "@/lib/api/contracts";
import { authOptions } from "@/lib/auth";
import { normalizeReleaseCoverUrl, resolveReleasePreviewForPersistence } from "@/lib/release-cover";
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
  releaseSubmissionDataSchema,
  type ReleaseSubmissionData,
  validateReleaseSubmission
} from "@/lib/release-policy";
import { sanitizePriorityReleaseFlag } from "@/lib/release-priority";
import {
  buildPartnerCodePaymentUsage,
  buildSubscriptionPaymentUsage,
  getUserReleaseQuota,
  mergeReleaseRolesPaymentUsage
} from "@/lib/release-quota";
import { shouldResubmitEditedRelease } from "@/lib/release-wizard-mode";
import {
  buildSubmitTrackDiagnostics,
  buildTrackCreateManyInput,
  readReleaseTypeFromSubmissionData
} from "@/lib/release-submit-tracks";
import { notifyAdminReleaseSubmitted } from "@/lib/telegram-notifier";

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

export async function POST(request: Request) {
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

  const releaseId = payload.releaseId?.trim();
  if (!releaseId) {
    return NextResponse.json({ error: "releaseId is required" }, { status: 400 });
  }

  const existing = await prisma.release.findFirst({
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

  const releaseDate = parseDate(data.releaseDate, existing.date);
  const startDate = parseDate(data.startDate, releaseDate);
  const preorderDate = parseDate(data.preorderDate, releaseDate);

  const quota = await getUserReleaseQuota(session.user.id, prisma);
  const submissionData: ReleaseSubmissionData = {
    ...rawSubmissionData,
    priorityRelease: sanitizePriorityReleaseFlag({
      requested: data.priorityRelease,
      plan: quota.plan,
      isActive: quota.isActive
    })
  };
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
    type: readReleaseTypeFromSubmissionData(data)
  };
  const trackRows = buildTrackCreateManyInput({
    releaseId: existing.id,
    releaseLanguage: baseReleaseData.language,
    startDate,
    tracks: submissionData.tracks
  });

  const updateReleaseAndSyncTracks = async (params: {
    confirmed: boolean;
    status: (typeof existing)["status"];
    roles: Prisma.InputJsonValue;
    afterSync?: (tx: Prisma.TransactionClient) => Promise<void>;
  }) => {
    try {
      const createdTracksCount = await prisma.$transaction(async (tx) => {
        await tx.release.update({
          where: { id: existing.id },
          data: {
            ...baseReleaseData,
            confirmed: params.confirmed,
            status: params.status,
            roles: params.roles
          }
        });
        await tx.track.deleteMany({
          where: { releaseId: existing.id }
        });
        if (trackRows.length > 0) {
          await tx.track.createMany({
            data: trackRows
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
      });

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

  if (payload.mode === "edit") {
    const shouldResubmit = shouldResubmitEditedRelease(payload.currentStatus);
    await updateReleaseAndSyncTracks({
      confirmed: existing.confirmed,
      status: shouldResubmit ? "moderating" : existing.status,
      roles: withReleaseLifecycleState(
        mergeSubmissionData(existing.roles, submissionData),
        shouldResubmit
          ? "moderation"
          : (getReleaseLifecycleStatus(existing.status, existing.roles) ?? payload.currentStatus ?? "draft")
      ) as Prisma.InputJsonValue,
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

    if (shouldResubmit) {
      await notifyReleaseSubmittedSafe({
        releaseId: existing.id,
        releaseTitle: baseReleaseData.title,
        artistName: baseReleaseData.performer?.trim() || "Неизвестный исполнитель"
      });
    }

    const response: ReleaseSubmitSuccessResponse = {
      ok: true,
      releaseId: existing.id,
      nextStatus: shouldResubmit ? "moderation" : (payload.currentStatus ?? "draft"),
      message: shouldResubmit
        ? "Релиз повторно отправлен на модерацию."
        : "Изменения релиза сохранены."
    };

    return NextResponse.json(response, { status: 200 });
  }

  const submittedPartnerCode = submissionData.partnerCode?.trim() || "";
  const partnerCodeCheck = submittedPartnerCode
    ? await checkPartnerCodeForRelease({
        prisma,
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

    await notifyReleaseSubmittedSafe({
      releaseId: existing.id,
      releaseTitle: baseReleaseData.title,
      artistName: baseReleaseData.performer?.trim() || "Неизвестный исполнитель"
    });

    const response: ReleaseSubmitSuccessResponse = {
      ok: true,
      releaseId: existing.id,
      nextStatus: "moderation",
      message: "Релиз отправлен на модерацию по партнёрскому коду."
    };

    return NextResponse.json(response, { status: 200 });
  }

  if (quota.requiresPaymentForNextRelease) {
    await updateReleaseAndSyncTracks({
      confirmed: false,
      status: "moderating",
      roles: withReleaseLifecycleState(
        mergeSubmissionData(existing.roles, submissionData),
        "moderation"
      ) as Prisma.InputJsonValue
    });
    await notifyReleaseSubmittedSafe({
      releaseId: existing.id,
      releaseTitle: baseReleaseData.title,
      artistName: baseReleaseData.performer?.trim() || "Неизвестный исполнитель"
    });

    const response: ReleaseSubmitSuccessResponse & {
      payment_required: true;
      paid: false;
    } = {
      ok: true,
      releaseId: existing.id,
      nextStatus: "moderation",
      payment_required: true,
      paid: false,
      message: quota.isActive
        ? "Релиз отправлен на модерацию. Лимит подписки исчерпан, релиз нужно оплатить отдельно."
        : "Релиз отправлен на модерацию. Активной подписки нет, релиз нужно оплатить отдельно."
    };

    return NextResponse.json(response, { status: 200 });
  }

  await updateReleaseAndSyncTracks({
    confirmed: true,
    status: "moderating",
    roles: withReleaseLifecycleState(
      mergeReleaseRolesPaymentUsage(
        existing.roles,
        buildSubscriptionPaymentUsage({ quota }),
        submissionData
      ),
      "moderation"
    ) as Prisma.InputJsonValue
  });
  await notifyReleaseSubmittedSafe({
    releaseId: existing.id,
    releaseTitle: baseReleaseData.title,
    artistName: baseReleaseData.performer?.trim() || "Неизвестный исполнитель"
  });

  const response: ReleaseSubmitSuccessResponse = {
    ok: true,
    releaseId: existing.id,
    nextStatus: "moderation",
    message: "Релиз отправлен на модерацию."
  };

  return NextResponse.json(response, { status: 200 });
}
