import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { canManageUsers } from "@/lib/admin-user-service";
import { setAdminArtistProfileVisibility } from "@/lib/artist-profile-service";
import { prisma } from "@/lib/prisma";

const visibilitySchema = z.object({
  artistKey: z.string().trim().min(1),
  hidden: z.boolean()
});

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = visibilitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные настройки видимости." }, { status: 400 });
  }

  try {
    return NextResponse.json(await setAdminArtistProfileVisibility(
      prisma,
      context.params.id,
      parsed.data.artistKey,
      parsed.data.hidden
    ));
  } catch (error) {
    if (error instanceof Error && error.message === "ARTIST_PROFILE_RELEASE_REQUIRED") {
      return NextResponse.json({ error: "Профиль артиста не найден." }, { status: 404 });
    }
    throw error;
  }
}
