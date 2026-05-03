import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";

const cookieNames = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
  "next-auth.callback-url",
  "__Secure-next-auth.callback-url"
];

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json(
      { ok: true, redirectTo: "/admin/login" },
      { status: 200 }
    );
  }

  const response = NextResponse.json(
    { ok: true, redirectTo: "/admin/login" },
    { status: 200 }
  );

  for (const cookieName of cookieNames) {
    response.cookies.set({
      name: cookieName,
      value: "",
      maxAge: 0,
      expires: new Date(0),
      path: "/"
    });
  }

  return response;
}
