import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  getContractSignatureDownloadAsset,
  getUserContractStatus
} from "@/lib/contract-verification";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getUserContractStatus({
    prisma,
    userId: session.user.id
  });

  if (!status.verificationId || status.status === "not_signed" || status.status === "unavailable") {
    return NextResponse.json({ error: "Signature not found" }, { status: 404 });
  }

  const inline = new URL(request.url).searchParams.get("inline") === "1";
  const asset = await getContractSignatureDownloadAsset({
    prisma,
    id: status.verificationId,
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
