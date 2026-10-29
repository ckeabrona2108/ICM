import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { resolveVideoSnippetTrackAudioUrl } from "@/lib/video-snippet-sources";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: { releaseId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const trackIndex = Number(new URL(request.url).searchParams.get("track") ?? "1");
  if (!Number.isInteger(trackIndex) || trackIndex < 0) {
    return NextResponse.json({ error: "Неверный номер трека." }, { status: 400 });
  }

  const audioUrl = await resolveVideoSnippetTrackAudioUrl({
    userId: session.user.id,
    releaseId: context.params.releaseId,
    trackIndex
  });
  if (!audioUrl) return NextResponse.json({ error: "Аудио трека не найдено." }, { status: 404 });
  return NextResponse.json({ audioUrl });
}
