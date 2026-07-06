import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageReleases, canManageReleasesSession } from "@/lib/admin-release-service";
import {
  uploadAdminReleaseCover,
  validateAdminReleaseCoverFile,
  verifyAdminReleaseCoverUrl
} from "@/lib/admin-release-cover-upload";

function getBaseUrl(request: Request): string {
  return new URL(request.url).origin;
}

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await canManageReleasesSession({ prisma, userId: session.user.id, role: session.user.role }))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const releaseId = context.params.id?.trim();
  if (!releaseId) {
    return NextResponse.json({ error: "Release id is required" }, { status: 400 });
  }

  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: {
      id: true,
      title: true,
      preview: true,
      roles: true
    }
  });
  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const fileValue = formData.get("file");
  if (!(fileValue instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  try {
    validateAdminReleaseCoverFile(fileValue);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid file" },
      { status: 400 }
    );
  }

  try {
    const uploaded = await uploadAdminReleaseCover({
      releaseId,
      file: fileValue
    });

    const httpStatus = await verifyAdminReleaseCoverUrl(uploaded.previewUrl, getBaseUrl(request));
    if (httpStatus !== 200 && httpStatus !== 206) {
      return NextResponse.json(
        {
          error: `Upload verification failed: ${httpStatus ?? "no response"}`
        },
        { status: 502 }
      );
    }

    const nextRoles = release.roles && typeof release.roles === "object" && !Array.isArray(release.roles)
      ? structuredClone(release.roles as Record<string, unknown>)
      : {};
    const nextSubmission =
      nextRoles && typeof nextRoles === "object" && !Array.isArray(nextRoles) && nextRoles.submissionData && typeof nextRoles.submissionData === "object" && !Array.isArray(nextRoles.submissionData)
        ? structuredClone(nextRoles.submissionData as Record<string, unknown>)
        : {};
    nextSubmission.coverUpload = {
      storageKey: uploaded.key,
      url: uploaded.previewUrl,
      fileName: fileValue.name,
      contentType: fileValue.type,
      sizeBytes: fileValue.size
    };
    nextSubmission.cover = uploaded.previewUrl;
    nextRoles.submissionData = nextSubmission;

    await prisma.release.update({
      where: { id: releaseId },
      data: {
        preview: uploaded.previewUrl,
        roles: nextRoles as Prisma.InputJsonValue
      }
    });

    return NextResponse.json(
      {
        ok: true,
        releaseId: release.id,
        title: release.title,
        previewUrl: uploaded.previewUrl,
        storageKey: uploaded.key,
        httpStatus
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    const status =
      message.includes("missing") && message.includes("S3") ? 500 :
      message === "Release not found" ? 404 :
      message === "Файл не выбран." ? 400 :
      message.includes("разрешены") || message.includes("Неверный формат") ? 400 :
      500;
    return NextResponse.json({ error: message }, { status });
  }
}
