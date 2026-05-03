import { Prisma, ReleaseStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import type {
  ReleaseDraftDeleteFailureResponse,
  ReleaseDraftDeleteResponse
} from "@/lib/api/contracts";
import { canDeleteDraft } from "@/lib/draft-policy";
import { prisma } from "@/lib/prisma";

function isSkippableCleanupError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2021" || error.code === "P2010" || error.code === "P2022";
  }
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("cannot read properties of undefined") ||
    message.includes("does not exist") ||
    message.includes("relation") && message.includes("does not exist")
  );
}

async function runBestEffortCleanup(task: () => Promise<unknown>) {
  try {
    await task();
  } catch (error) {
    if (!isSkippableCleanupError(error)) {
      throw error;
    }
  }
}

async function cleanupReleaseRelationsBestEffort(releaseId: string) {
  await runBestEffortCleanup(async () => {
    await prisma.distributionStatus.deleteMany({ where: { releaseId } });
  });
  await runBestEffortCleanup(async () => {
    await prisma.track.deleteMany({ where: { releaseId } });
  });
  await runBestEffortCleanup(async () => {
    await prisma.releaseFile.deleteMany({ where: { releaseId } });
  });
  await runBestEffortCleanup(async () => {
    await prisma.coverImage.deleteMany({ where: { releaseId } });
  });
  await runBestEffortCleanup(async () => {
    await prisma.royalty.deleteMany({ where: { releaseId } });
  });
  await runBestEffortCleanup(async () => {
    await prisma.analyticsReportSnapshot.deleteMany({ where: { releaseId } });
  });
  await runBestEffortCleanup(async () => {
    await prisma.analyticsDailySummary.deleteMany({ where: { releaseId } });
  });
  await runBestEffortCleanup(async () => {
    await prisma.marketingCampaign.updateMany({
      where: { releaseId },
      data: { releaseId: null }
    });
  });
  await runBestEffortCleanup(async () => {
    await prisma.unmatchedAnalyticsImport.updateMany({
      where: { resolvedReleaseId: releaseId },
      data: { resolvedReleaseId: null }
    });
  });
  await runBestEffortCleanup(async () => {
    const delegate = (
      prisma as unknown as {
        analyticsAiInsight?: {
          updateMany: (args: {
            where: { releaseId: string };
            data: { releaseId: null };
          }) => Promise<unknown>;
        };
      }
    ).analyticsAiInsight;
    if (!delegate?.updateMany) return;
    await delegate.updateMany({
      where: { releaseId },
      data: { releaseId: null }
    });
  });
}

async function deleteReleaseById(releaseId: string) {
  const result = await prisma.release.deleteMany({
    where: { id: releaseId }
  });
  return result.count > 0;
}

export async function DELETE(
  _request: Request,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const releaseId = context.params.id?.trim();
  if (!releaseId) {
    return NextResponse.json({ error: "Release id is required" }, { status: 400 });
  }

  const existing = await prisma.release.findFirst({
    where: { id: releaseId },
    select: { id: true, status: true, userId: true }
  });

  if (!existing) {
    const response: ReleaseDraftDeleteFailureResponse = {
      ok: false,
      errors: [
        {
          code: "not_found",
          field: "releaseId",
          message: "Черновик не найден или уже удален."
        }
      ]
    };
    return NextResponse.json(response, { status: 404 });
  }

  const permission = canDeleteDraft({
    status: existing.status,
    isOwner: existing.userId === session.user.id
  });

  if (!permission.allowed) {
    const response: ReleaseDraftDeleteFailureResponse = {
      ok: false,
      errors: [
        {
          code: "forbidden",
          field: permission.reason === "forbidden_owner" ? "releaseId" : "status",
          message:
            permission.reason === "forbidden_owner"
              ? "Недостаточно прав для удаления этого черновика."
              : "Удалить можно только релиз в статусе «Черновик»."
        }
      ]
    };
    return NextResponse.json(response, { status: 403 });
  }

  try {
    await cleanupReleaseRelationsBestEffort(existing.id);
    const deleted = await deleteReleaseById(existing.id);
    if (!deleted) {
      const response: ReleaseDraftDeleteFailureResponse = {
        ok: false,
        errors: [
          {
            code: "not_found",
            field: "releaseId",
            message: "Черновик не найден или уже удален."
          }
        ]
      };
      return NextResponse.json(response, { status: 404 });
    }
  } catch (error) {
    let recoveredAfterRetry = false;

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      try {
        // Retry once after explicit cleanup for legacy FK setups.
        await cleanupReleaseRelationsBestEffort(existing.id);
        const deleted = await deleteReleaseById(existing.id);
        recoveredAfterRetry = deleted;
      } catch (retryError) {
        console.error("[draft-delete] failed after retry", {
          releaseId: existing.id,
          userId: session.user.id,
          error:
            retryError instanceof Error
              ? {
                  name: retryError.name,
                  message: retryError.message
                }
              : String(retryError)
        });
        return NextResponse.json(
          {
            error: "Черновик пока нельзя удалить: есть связанные данные в базе."
          },
          { status: 409 }
        );
      }
    } else {
      console.error("[draft-delete] failed", {
        releaseId: existing.id,
        userId: session.user.id,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message
              }
            : String(error)
      });
    }

    if (recoveredAfterRetry) {
      // Deletion succeeded on retry, continue to success response.
    } else {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      const response: ReleaseDraftDeleteFailureResponse = {
        ok: false,
        errors: [
          {
            code: "not_found",
            field: "releaseId",
            message: "Черновик не найден или уже удален."
          }
        ]
      };
      return NextResponse.json(response, { status: 404 });
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      // already retried above, so keep consistent response
      return NextResponse.json(
        { error: "Черновик пока нельзя удалить: есть связанные данные в базе." },
        { status: 409 }
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2010")
    ) {
      return NextResponse.json(
        {
          error:
            "Не удалось удалить черновик из-за рассинхрона схемы БД. Нужна синхронизация миграций."
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Не удалось удалить черновик." },
      { status: 500 }
    );
    }
  }

  const draftsCount = await prisma.release.count({
    where: {
      userId: session.user.id,
      status: ReleaseStatus.DRAFT
    }
  });

  const response: ReleaseDraftDeleteResponse = {
    ok: true,
    releaseId: existing.id,
    draftsCount,
    message: "Черновик удален."
  };

  return NextResponse.json(response, { status: 200 });
}
