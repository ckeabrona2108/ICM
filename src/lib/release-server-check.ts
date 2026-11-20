import type { PrismaClient } from "@prisma/client";

import { getUserContractStatus } from "@/lib/contract-verification";
import { releaseSubmissionDataSchema, validateReleaseSubmission } from "@/lib/release-policy";
import { calculateReleasePrice } from "@/lib/release-pricing";
import { extrasIncludedInSubscription, getUserReleaseQuota } from "@/lib/release-quota";
import { calculateExtrasSupplement } from "@/lib/release-extras-supplement";
import { resolveTrackAudioAsset } from "@/lib/release-media-asset";
import { findPaidTwin } from "@/lib/release-payment-transfer";
import { buildTrackCreateManyInput } from "@/lib/release-submit-tracks";

/**
 * Server re-check of a release on the wizard's review step, before the artist presses "send".
 * Nothing is saved. Audio still uploading from the browser is not an issue yet.
 */

export interface ReleaseServerCheckRequest {
  data: unknown;
  /** Tracks whose audio is still a local file in the browser (uploaded on send). */
  pendingLocalAudioIndexes?: number[];
  /** Edits keep the way the release was paid, so no price is shown for them. */
  mode?: "new" | "edit";
  /** The draft being checked, so it is not taken for its own twin. */
  releaseId?: string;
}

export interface ReleaseServerCheckResult {
  ok: boolean;
  issues: string[];
  /** What sending costs, for a new release; null when unknown. */
  payment: { kind: "included" | "extras" | "release" | "transfer"; amountRub: number; note: string } | null;
  /** A paid release of the artist sent back for changes that this release looks like. */
  paidTwin: { id: string; title: string; match: "upc" | "title" } | null;
}

const AUDIO_FIELD = /^tracks\.(\d+)\.audioFile$/u;

function formatExtras(lines: Array<{ label: string; count: number }>): string {
  return lines.map((line) => (line.count > 1 ? `${line.label.toLowerCase()} × ${line.count}` : line.label.toLowerCase())).join(", ");
}

export async function checkReleaseOnServer(params: {
  prisma: PrismaClient;
  userId: string;
  request: ReleaseServerCheckRequest;
}): Promise<ReleaseServerCheckResult> {
  const parsed = releaseSubmissionDataSchema.safeParse(params.request.data);
  if (!parsed.success) {
    return { ok: false, issues: ["Некорректные данные релиза. Обновите страницу и проверьте шаги заново."], payment: null, paidTwin: null };
  }
  const data = parsed.data;
  const pendingAudio = new Set(params.request.pendingLocalAudioIndexes ?? []);

  const issues = validateReleaseSubmission(data)
    .filter((issue) => {
      const match = AUDIO_FIELD.exec(issue.field);
      return !(issue.code === "required" && match && pendingAudio.has(Number(match[1])));
    })
    .map((issue) => issue.message);

  // Audio that is already in storage must really be there.
  const missingAudio = await Promise.all(
    data.tracks.map(async (track, index) => {
      if (pendingAudio.has(index) || !track.audioFile) return null;
      try {
        const asset = await resolveTrackAudioAsset({
          trackId: `check-${index + 1}`,
          audioFile: track.audioFile,
          track: track.fileName,
          requireReachable: true
        });
        return asset.storageKey ? null : index;
      } catch {
        return index;
      }
    })
  );
  for (const index of missingAudio) {
    if (index != null) issues.push(`Аудиофайл трека №${index + 1} не найден на сервере. Загрузите его заново.`);
  }

  const contract = await getUserContractStatus({ prisma: params.prisma, userId: params.userId });
  if (contract.status !== "unavailable" && !contract.canSubmitReleases) {
    issues.push(contract.reason || "Для отправки релиза нужен подтверждённый договор.");
  }

  let payment: ReleaseServerCheckResult["payment"] = null;
  let paidTwin: ReleaseServerCheckResult["paidTwin"] = null;
  if (params.request.mode !== "edit") {
    paidTwin = await findPaidTwin(params.prisma, {
      userId: params.userId,
      releaseId: params.request.releaseId ?? "",
      title: data.title ?? null,
      upc: data.upc?.trim() || null
    });
  }
  if (paidTwin?.match === "upc") {
    payment = {
      kind: "transfer",
      amountRub: 0,
      note: `Оплата перенесётся с релиза «${paidTwin.title}», который вернули на исправление: платить повторно не нужно. Старый релиз закроется.`
    };
  } else if (params.request.mode !== "edit") {
    const quota = await getUserReleaseQuota(params.userId, params.prisma);
    const tracks = buildTrackCreateManyInput({
      releaseId: "check",
      releaseLanguage: data.language || "Russian",
      startDate: new Date(),
      tracks: data.tracks
    });
    if (quota.isActive && !quota.requiresPaymentForNextRelease) {
      const left =
        quota.remaining == null ? "без лимита" : `осталось ${quota.remaining} из ${quota.includedLimit}`;
      const extras = extrasIncludedInSubscription(quota)
        ? null
        : calculateExtrasSupplement(tracks, { lyrics: 0, karaoke: 0, video: 0 });
      payment =
        extras && extras.totalRub > 0
          ? {
              kind: "extras",
              amountRub: extras.totalRub,
              note: `Релиз войдёт в подписку ${quota.plan} (${left}). Дополнения оплачиваются отдельно: ${formatExtras(extras.lines)} — ${extras.totalRub} ₽.`
            }
          : { kind: "included", amountRub: 0, note: `Релиз войдёт в подписку ${quota.plan} (${left}).` };
    } else {
      const price = calculateReleasePrice(tracks);
      payment = {
        kind: "release",
        amountRub: price.totalRub,
        note: quota.isActive
          ? `Лимит подписки исчерпан: релиз оплачивается отдельно — ${price.totalRub} ₽.`
          : `Без подписки релиз оплачивается отдельно — ${price.totalRub} ₽, если не применится бесплатный сингл или партнёрский код.`
      };
    }
  }

  return { ok: issues.length === 0, issues: [...new Set(issues)], payment, paidTwin };
}
