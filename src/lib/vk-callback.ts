import { timingSafeEqual } from "node:crypto";

// VK Callback API events of the community. VK repeats an event until it gets the plain text
// "ok", and confirms the server once with the `confirmation` event.

export type VkCallbackAction =
  | { type: "confirmation" }
  | { type: "message_allow"; vkUserId: string }
  | { type: "message_deny"; vkUserId: string }
  | { type: "ignored" }
  | { type: "forbidden" };

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function readVkUserId(object: unknown): string | null {
  const value = (object as { user_id?: unknown } | null)?.user_id;
  const id = typeof value === "number" || typeof value === "string" ? String(value) : "";
  return /^\d+$/u.test(id) ? id : null;
}

export function parseVkCallback(
  body: unknown,
  config: { groupId: string; secret: string }
): VkCallbackAction {
  const payload = body as { type?: unknown; group_id?: unknown; secret?: unknown; object?: unknown } | null;
  if (!payload || typeof payload.type !== "string") return { type: "forbidden" };
  if (String(payload.group_id ?? "") !== config.groupId) return { type: "forbidden" };
  if (payload.type === "confirmation") return { type: "confirmation" };
  // The confirmation request carries no secret; every event after it does.
  if (!config.secret || typeof payload.secret !== "string" || !safeEqual(payload.secret, config.secret)) {
    return { type: "forbidden" };
  }
  if (payload.type === "message_allow" || payload.type === "message_deny") {
    const vkUserId = readVkUserId(payload.object);
    return vkUserId ? { type: payload.type, vkUserId } : { type: "ignored" };
  }
  return { type: "ignored" };
}
