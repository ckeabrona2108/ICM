import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { canManageUsers } from "@/lib/admin-user-service";
import { getContractDocumentDownloadAsset } from "@/lib/contract-verification";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
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

  const asset = await getContractDocumentDownloadAsset({
    prisma,
    id: verificationId
  });
  if (!asset?.body) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(asset.body), {
    status: 200,
    headers: {
      "Content-Type": asset.contentType,
      "Content-Disposition": `attachment; filename="${asset.fileName}"`,
      "Cache-Control": "private, no-store"
    }
  });
}
