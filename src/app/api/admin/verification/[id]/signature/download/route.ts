import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { canManageUsers } from "@/lib/admin-user-service";
import { getContractSignatureDownloadAsset } from "@/lib/contract-verification";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const verificationId = context.params.id?.trim();
  if (!verificationId) {
    return NextResponse.json({ error: "Verification id is required" }, { status: 400 });
  }

  const url = new URL(request.url);
  const inline = url.searchParams.get("inline") === "1";
  const asset = await getContractSignatureDownloadAsset({
    prisma,
    id: verificationId,
    inline
  });
  if (!asset) {
    return NextResponse.json({ error: "Signature not found" }, { status: 404 });
  }

  if (asset.redirectUrl) {
    return NextResponse.redirect(new URL(asset.redirectUrl, request.url), { status: 302 });
  }
  const body = asset.body ? new Uint8Array(asset.body) : null;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": asset.contentType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asset.fileName}"`,
      "Cache-Control": "private, no-store"
    }
  });
}
