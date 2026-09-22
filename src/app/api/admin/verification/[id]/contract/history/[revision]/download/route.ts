import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { canManageUsers } from "@/lib/admin-user-service";
import { authOptions } from "@/lib/auth";
import { getContractRevisionDocumentDownloadAsset } from "@/lib/contract-verification";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, context: { params: { id: string; revision: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageUsers(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const revisionIndex = Number(context.params.revision);
  if (!context.params.id?.trim() || !Number.isInteger(revisionIndex) || revisionIndex < 0) {
    return NextResponse.json({ error: "Invalid contract revision" }, { status: 400 });
  }

  const inline = new URL(request.url).searchParams.get("inline") === "1";
  const asset = await getContractRevisionDocumentDownloadAsset({ prisma, id: context.params.id, revisionIndex, inline });
  if (!asset) return NextResponse.json({ error: "Contract revision not found" }, { status: 404 });
  if (asset.redirectUrl) return NextResponse.redirect(new URL(asset.redirectUrl, request.url), { status: 302 });

  return new NextResponse(asset.body ? new Uint8Array(asset.body) : null, {
    headers: {
      "Content-Type": asset.contentType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asset.fileName}"`,
      "Cache-Control": "private, no-store"
    }
  });
}
