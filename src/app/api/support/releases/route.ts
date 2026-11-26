import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import type { SupportReleaseOptionsResponse } from "@/lib/api/contracts";
import { listSupportReleaseOptions } from "@/lib/support-release-options";

/** The artist's releases a support request can be about: accepted first, then those on moderation. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response: SupportReleaseOptionsResponse = {
    releases: await listSupportReleaseOptions(session.user.id)
  };
  return NextResponse.json(response, { status: 200 });
}
