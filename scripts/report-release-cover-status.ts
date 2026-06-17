import { prisma } from "@/lib/prisma";
import { normalizeReleaseCoverStorageKey } from "@/lib/release-cover";
import { probeStorageKeyDiagnostics } from "@/lib/s3";

type Diagnosis = "ok" | "missing_file" | "broken_db_path" | "access_denied" | "no_preview";

const RELEASE_ID_FILTER = getArgValue("--release-id");

function getArgValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  const text = String(value);
  if (!/[",\n\r]/u.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

async function main() {
  const releases = await prisma.release.findMany({
    select: {
      id: true,
      title: true,
      upc: true,
      userId: true,
      preview: true,
      roles: true
    },
    orderBy: {
      date: "asc"
    }
  });

  process.stdout.write(
    [
      "releaseId",
      "title",
      "upc",
      "userId",
      "preview",
      "publicHttpStatus",
      "sdkHeadExists",
      "appRouteHttpStatus",
      "finalDiagnosis"
    ].join(",") + "\n"
  );

  for (const release of releases) {
    const preview = release.preview?.trim() ?? "";
    let diagnosis: Diagnosis = "broken_db_path";
    let publicHttpStatus: number | null = null;
    let sdkHeadExists: boolean | null = null;
    let appRouteHttpStatus: number | null = null;

    if (!preview) {
      diagnosis = "no_preview";
    } else {
      const storageKey = normalizeReleaseCoverStorageKey(preview, release.id);
      const probe = await probeStorageKeyDiagnostics({
        storageKey,
        publicUrl: preview
      });
      publicHttpStatus = probe.publicHttpStatus;
      sdkHeadExists = probe.sdkHeadExists;
      appRouteHttpStatus = probe.appRouteHttpStatus;
      diagnosis = probe.finalDiagnosis;
    }

    if (RELEASE_ID_FILTER && release.id === RELEASE_ID_FILTER) {
      console.error(
        JSON.stringify(
          {
            releaseId: release.id,
            previewFromDb: release.preview,
            publicHttpStatus,
            sdkHeadExists,
            appRouteHttpStatus,
            diagnosis
          },
          null,
          2
        )
      );
    }

    process.stdout.write(
      [
        csvEscape(release.id),
        csvEscape(release.title),
        csvEscape(release.upc ?? ""),
        csvEscape(release.userId),
        csvEscape(release.preview ?? ""),
        csvEscape(publicHttpStatus ?? ""),
        csvEscape(sdkHeadExists ?? ""),
        csvEscape(appRouteHttpStatus ?? ""),
        csvEscape(diagnosis)
      ].join(",") + "\n"
    );
  }
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
