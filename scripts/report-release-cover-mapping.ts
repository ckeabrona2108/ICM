import { writeFile } from "node:fs/promises";

import { prisma } from "@/lib/prisma";

import {
  csvEscape,
  getArgValue,
  hasFlag,
  readShellHistoryCoverSources,
  resolveReleaseCoverMapping,
  type ReleaseCoverSourceRow
} from "./release-cover-mapping.shared";

const RELEASE_ID_FILTER = getArgValue("--release-id");
const LIMIT_RAW = getArgValue("--limit");
const OUTPUT_PATH = getArgValue("--output");
const NO_S3_PROBE = hasFlag("--no-s3-probe");
const LIMIT = LIMIT_RAW ? Number(LIMIT_RAW) : null;

async function main() {
  const releases = await prisma.release.findMany({
    select: {
      id: true,
      preview: true,
      title: true,
      userId: true,
      roles: true
    },
    orderBy: { date: "asc" }
  });

  const filtered = RELEASE_ID_FILTER ? releases.filter((release) => release.id === RELEASE_ID_FILTER) : releases;
  const limited = Number.isFinite(LIMIT ?? Number.NaN) && (LIMIT ?? 0) > 0 ? filtered.slice(0, LIMIT ?? 0) : filtered;
  const shellHistory = await readShellHistoryCoverSources();
  const shellHistoryByReleaseId = new Map(shellHistory.map((entry) => [entry.releaseId, entry]));

  const rows: string[] = [];
  rows.push([
    "releaseId",
    "currentPreview",
    "sourceKey",
    "targetKey",
    "sourceExists",
    "targetExists",
    "canCopy",
    "confidence",
    "sourceReason"
  ].join(","));

  let checked = 0;
  let copyable = 0;
  let highConfidence = 0;
  let sourceKnown = 0;
  let sourceMissing = 0;
  let targetKnown = 0;

  for (const release of limited as ReleaseCoverSourceRow[]) {
    const mapping = await resolveReleaseCoverMapping({
      release,
      shellHistoryByReleaseId,
      noS3Probe: NO_S3_PROBE
    });

    checked += 1;
    if (mapping.canCopy) copyable += 1;
    if (mapping.confidence === "high") highConfidence += 1;
    if (mapping.sourceKey) sourceKnown += 1;
    else sourceMissing += 1;
    if (mapping.targetKey) targetKnown += 1;

    process.stderr.write(`checked ${checked}/${limited.length}\n`);

    rows.push(
      [
        csvEscape(mapping.releaseId),
        csvEscape(mapping.currentPreview),
        csvEscape(mapping.sourceKey),
        csvEscape(mapping.targetKey),
        csvEscape(mapping.sourceExists),
        csvEscape(mapping.targetExists),
        csvEscape(mapping.canCopy),
        csvEscape(mapping.confidence),
        csvEscape(mapping.sourceReason)
      ].join(",")
    );
  }

  const output = `${rows.join("\n")}\n`;
  if (OUTPUT_PATH) {
    await writeFile(OUTPUT_PATH, output, "utf8");
  } else {
    process.stdout.write(output);
  }

  process.stderr.write(
    [
      `summary checked=${checked}`,
      `canCopy=${copyable}`,
      `confidenceHigh=${highConfidence}`,
      `sourceKnown=${sourceKnown}`,
      `sourceMissing=${sourceMissing}`,
      `targetKnown=${targetKnown}`,
      `noS3Probe=${NO_S3_PROBE}`
    ].join(" ") + "\n"
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
