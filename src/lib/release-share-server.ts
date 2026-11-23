import type { PrismaClient } from "@prisma/client";

import { readGlobalCommissionRate } from "@/lib/commission-settings";
import { describeReleaseShare, type ReleaseShare } from "@/lib/release-share";
import { readGlobalCommissionPayment, resolveReleaseTariffCommission } from "@/lib/tariff-commission";

/**
 * "Ваша доля" for an artist's releases, by the same order the financial import uses to pick the
 * commission (resolvePlatformCommission in smart-catalog-sync-service): contract > individual >
 * label > the release's own tariff > global rate. Contract, individual and label rates are never
 * shown, so those releases get no share.
 */
export async function resolveReleaseSharesForUser(
  prisma: PrismaClient,
  userId: string,
  releases: Array<{ id: string; labelName?: string | null; roles?: unknown }>
): Promise<Map<string, ReleaseShare>> {
  const shares = new Map<string, ReleaseShare>();
  if (releases.length === 0) return shares;

  const [contractRate, userRate] = await Promise.all([
    prisma.contract_commission_rates.findFirst({ where: { user_id: userId, active: true }, select: { id: true } }),
    prisma.user_commission_rates.findFirst({ where: { user_id: userId, active: true }, select: { id: true } })
  ]);
  if (contractRate || userRate) return shares;

  const labelNames = Array.from(
    new Set(releases.map((release) => release.labelName).filter((name): name is string => Boolean(name)))
  );
  const labelRates =
    labelNames.length > 0
      ? await prisma.label_commission_rates.findMany({
          where: { label_name: { in: labelNames }, active: true },
          select: { label_name: true }
        })
      : [];
  const labelsWithRate = new Set(labelRates.map((row) => row.label_name));
  const globalRate = await readGlobalCommissionRate(prisma);

  for (const release of releases) {
    if (release.labelName && labelsWithRate.has(release.labelName)) continue;
    const tariff = resolveReleaseTariffCommission(release.roles);
    const share = tariff
      ? describeReleaseShare(tariff.basis, tariff.rate)
      : describeReleaseShare({ kind: "global", payment: readGlobalCommissionPayment(release.roles, true) }, globalRate);
    if (share) shares.set(release.id, share);
  }
  return shares;
}
