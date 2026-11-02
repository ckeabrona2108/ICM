import { NextResponse } from "next/server";

import { notifyVkMessagesAllowed } from "@/lib/account-lifecycle-notifications";
import { prisma } from "@/lib/prisma";
import { isAnyPrismaColumnMissingError, isAnyPrismaTableMissingError } from "@/lib/prisma-errors";
import { parseVkCallback } from "@/lib/vk-callback";
import { setVkMessagesAllowed } from "@/lib/vk-notification-channel";

export const dynamic = "force-dynamic";

// `docker run --env-file` keeps quotes literally, so values may arrive wrapped in them.
function readEnv(name: string): string {
  return (process.env[name]?.trim() ?? "").replace(/^(["'])(.*)\1$/u, "$2").trim();
}

function text(body: string, status = 200) {
  return new NextResponse(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

// VK Callback API of the community: VK_CALLBACK_CONFIRMATION is the string VK shows in the
// community settings, VK_CALLBACK_SECRET the "secret key" set there.
export async function POST(request: Request) {
  const groupId = readEnv("VK_GROUP_ID");
  if (!groupId) return text("not configured", 503);

  const body = await request.json().catch(() => null);
  const action = parseVkCallback(body, { groupId, secret: readEnv("VK_CALLBACK_SECRET") });

  if (action.type === "forbidden") return text("forbidden", 403);
  if (action.type === "confirmation") {
    const confirmation = readEnv("VK_CALLBACK_CONFIRMATION");
    return confirmation ? text(confirmation) : text("not configured", 503);
  }
  if (action.type === "ignored") return text("ok");

  try {
    const result = await setVkMessagesAllowed(prisma, {
      vkUserId: action.vkUserId,
      allowed: action.type === "message_allow"
    });
    if (result?.newlyAllowed) await notifyVkMessagesAllowed(prisma, result.userId);
  } catch (error) {
    if (
      !isAnyPrismaTableMissingError(error, ["vk_links", "icecream.vk_links"]) &&
      !isAnyPrismaColumnMissingError(error, ["vk_links.messages_allowed", "messages_allowed"])
    ) {
      console.error("[vk-callback] failed", { type: action.type, error });
      // Not "ok": VK retries the event later.
      return text("error", 500);
    }
  }
  return text("ok");
}
