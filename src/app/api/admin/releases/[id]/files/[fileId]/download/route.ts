import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getAdminReleaseDownloadTarget } from "@/lib/admin-release-details";
import { canManageReleases } from "@/lib/admin-release-service";
import { createPresignedDownload } from "@/lib/s3";

export async function GET(
  _request: Request,
  context: { params: { id: string; fileId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageReleases(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const releaseId = context.params.id?.trim();
  const fileId = context.params.fileId?.trim();
  if (!releaseId || !fileId) {
    return NextResponse.json({ error: "Release id and file id are required" }, { status: 400 });
  }

  const target = await getAdminReleaseDownloadTarget({
    releaseId,
    fileId
  });
  if (!target) {
    return NextResponse.json({ error: "File not found for this release" }, { status: 404 });
  }

  if (target.storageKey) {
    const signed = await createPresignedDownload({
      key: target.storageKey,
      expiresIn: 600
    });
    return NextResponse.redirect(signed.url, { status: 302 });
  }

  if (target.url) {
    return NextResponse.redirect(target.url, { status: 302 });
  }

  return NextResponse.json({ error: "File URL is unavailable" }, { status: 404 });
}
