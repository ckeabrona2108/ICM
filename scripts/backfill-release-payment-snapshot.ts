// @ts-nocheck
import { PaymentStatus, Prisma } from "@prisma/client";

import { prisma } from "../src/lib/prisma";
import {
  buildReleasePaymentBackfill,
  mergeSubmissionDataWithSnapshot
} from "../src/lib/release-payment-backfill";

function readReleaseIdFromPaymentMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  const kind = typeof record.kind === "string" ? record.kind.trim().toLowerCase() : "";
  const releaseId =
    typeof record.releaseId === "string" ? record.releaseId.trim() : "";
  if (!releaseId) return null;
  if (!kind || kind === "release") return releaseId;
  return null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const userArgIndex = process.argv.findIndex((arg) => arg === "--user");
  const userId =
    userArgIndex >= 0 && process.argv[userArgIndex + 1]
      ? process.argv[userArgIndex + 1]?.trim()
      : null;
  const emailArgIndex = process.argv.findIndex((arg) => arg === "--email");
  const userEmail =
    emailArgIndex >= 0 && process.argv[emailArgIndex + 1]
      ? process.argv[emailArgIndex + 1]?.trim().toLowerCase()
      : null;
  const releaseArgIndex = process.argv.findIndex((arg) => arg === "--release");
  const releaseId =
    releaseArgIndex >= 0 && process.argv[releaseArgIndex + 1]
      ? process.argv[releaseArgIndex + 1]?.trim()
      : null;

  if (releaseId && !releaseId.trim()) {
    throw new Error("Пустой --release. Укажите releaseId.");
  }

  let scopedUserId = userId;
  if (userEmail) {
    const userByEmail = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true, email: true }
    });
    if (!userByEmail) {
      throw new Error(`Пользователь с email ${userEmail} не найден.`);
    }
    if (scopedUserId && scopedUserId !== userByEmail.id) {
      throw new Error(
        `Конфликт параметров: --user=${scopedUserId}, но email ${userEmail} принадлежит userId=${userByEmail.id}`
      );
    }
    scopedUserId = userByEmail.id;
  }
  if (releaseId) {
    const targetRelease = await prisma.release.findUnique({
      where: { id: releaseId },
      select: { id: true, userId: true }
    });
    if (!targetRelease) {
      throw new Error(`Релиз не найден: ${releaseId}`);
    }
    if (scopedUserId && scopedUserId !== targetRelease.userId) {
      throw new Error(
        `Релиз ${releaseId} принадлежит другому userId (${targetRelease.userId}), а не ${scopedUserId}`
      );
    }
    scopedUserId = targetRelease.userId;
  }

  const releaseWhere = scopedUserId ? { userId: scopedUserId } : undefined;
  const paymentWhere = scopedUserId ? { userId: scopedUserId } : undefined;

  const [releases, payments] = await Promise.all([
    prisma.release.findMany({
      where: releaseWhere,
      select: {
        id: true,
        userId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        moderationStartedAt: true,
        submissionData: true
      }
    }),
    prisma.subscriptionPayment.findMany({
      where: {
        ...(paymentWhere ?? {}),
        status: PaymentStatus.SUCCEEDED
      },
      select: {
        userId: true,
        tariffId: true,
        paidAt: true,
        createdAt: true,
        metadata: true
      },
      orderBy: {
        createdAt: "asc"
      }
    })
  ]);

  const oneTimePaidReleaseIds = new Set<string>();
  const subscriptionPayments = [];
  for (const payment of payments) {
    const releaseId = readReleaseIdFromPaymentMetadata(payment.metadata);
    if (releaseId) {
      oneTimePaidReleaseIds.add(releaseId);
      continue;
    }
    subscriptionPayments.push({
      userId: payment.userId,
      tariffId: payment.tariffId,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt
    });
  }

  const updates = buildReleasePaymentBackfill({
    releases: releases.map((release) => ({
      id: release.id,
      userId: release.userId,
      status: release.status,
      createdAt: release.createdAt,
      updatedAt: release.updatedAt,
      moderationStartedAt: release.moderationStartedAt,
      submissionData: release.submissionData
    })),
    successfulSubscriptionPayments: subscriptionPayments,
    oneTimePaidReleaseIds
  });
  const targetedUpdates = releaseId
    ? updates.filter((item) => item.releaseId === releaseId)
    : updates;

  if (targetedUpdates.length === 0) {
    if (releaseId) {
      console.log(`[backfill] Для релиза ${releaseId} не найден snapshot-кандидат.`);
    } else {
      console.log("[backfill] Нет релизов для обновления.");
    }
    await prisma.$disconnect();
    return;
  }

  if (releaseId) {
    console.log(
      `[backfill] Найден точечный snapshot для релиза ${releaseId}. Режим: ${
        apply ? "apply" : "dry-run"
      }`
    );
  } else {
    console.log(
      `[backfill] Найдено релизов для snapshot: ${targetedUpdates.length}. Режим: ${
        apply ? "apply" : "dry-run"
      }`
    );
  }

  if (!apply) {
    console.log(
      "[backfill] Пример:",
      targetedUpdates.slice(0, 5).map((item) => ({
        releaseId: item.releaseId,
        snapshot: item.snapshot
      }))
    );
    await prisma.$disconnect();
    return;
  }

  const releaseMap = new Map(releases.map((release) => [release.id, release]));
  let applied = 0;
  await prisma.$transaction(async (tx) => {
    for (const item of targetedUpdates) {
      const current = releaseMap.get(item.releaseId);
      if (!current) continue;

      const merged = mergeSubmissionDataWithSnapshot(
        current.submissionData,
        item.snapshot
      );

      await tx.release.update({
        where: { id: item.releaseId },
        data: {
          submissionData: merged as Prisma.InputJsonValue
        }
      });
      applied += 1;
    }
  });

  console.log(`[backfill] Обновлено релизов: ${applied}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("[backfill] Ошибка:", error);
  await prisma.$disconnect();
  process.exit(1);
});
