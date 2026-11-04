import { createHash, randomBytes } from "node:crypto";

// VK ID (OAuth 2.1 + PKCE) for linking a VK account to a cabinet and for signing in
// with VK, plus the group membership check. The group hides its member list, so membership is checked with
// a community access key rather than the app's service key.

const VK_ID_BASE_URL = "https://id.vk.ru";
const VK_API_BASE_URL = "https://api.vk.ru/method";
const VK_API_VERSION = "5.199";
const VK_REQUEST_TIMEOUT_MS = 10_000;

export const VK_LINK_COOKIE = "icm_vk_link";
export const VK_LINK_COOKIE_MAX_AGE_SECONDS = 10 * 60;
export const VK_LINK_CALLBACK_PATH = "/api/auth/link/vk";
// Where the link flow returns: the cabinet home by default, the profile when started there.
export const VK_LINK_RETURN_COOKIE = "icm_vk_link_return";

export function resolveVkLinkReturnPath(value: string | null | undefined): string {
  return value === "profile" ? "/dashboard/profile" : "/dashboard";
}

export interface VkIdConfig {
  clientId: string;
  groupId: string;
  groupToken: string;
}

export interface VkLinkCookiePayload {
  state: string;
  codeVerifier: string;
  userId: string;
}

type FetchLike = typeof fetch;

// `docker run --env-file` keeps quotes literally, so `AUTH_VK_ID="531…"` arrives with them.
function readEnv(name: string): string {
  return (process.env[name]?.trim() ?? "").replace(/^(["'])(.*)\1$/u, "$2").trim();
}

export function getVkIdConfig(): VkIdConfig | null {
  const clientId = readEnv("AUTH_VK_ID");
  const groupId = readEnv("VK_GROUP_ID");
  const groupToken = readEnv("VK_GROUP_TOKEN");
  if (!clientId || !groupId || !groupToken) return null;
  return { clientId, groupId, groupToken };
}

// Signing in needs only the app id; the group settings matter just for the membership check.
export function getVkIdClientId(): string | null {
  return readEnv("AUTH_VK_ID") || null;
}

export function getVkLinkRedirectUri(appBaseUrl: string): string {
  return `${appBaseUrl.replace(/\/+$/u, "")}${VK_LINK_CALLBACK_PATH}`;
}

function base64Url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export function createVkLinkCookiePayload(userId: string): VkLinkCookiePayload {
  return {
    state: base64Url(randomBytes(24)),
    codeVerifier: base64Url(randomBytes(48)),
    userId
  };
}

export function encodeVkLinkCookie(payload: VkLinkCookiePayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeVkLinkCookie(value: string | null | undefined): VkLinkCookiePayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    const { state, codeVerifier, userId } = parsed;
    if (typeof state !== "string" || typeof codeVerifier !== "string" || typeof userId !== "string") return null;
    if (!state || !codeVerifier || !userId) return null;
    return { state, codeVerifier, userId };
  } catch {
    return null;
  }
}

export function buildVkIdAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeVerifier: string;
}): string {
  const codeChallenge = base64Url(createHash("sha256").update(params.codeVerifier).digest());
  const url = new URL(`${VK_ID_BASE_URL}/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function fetchWithTimeout(fetchImpl: FetchLike, input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VK_REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

// Exchanges the authorization code for tokens. The access token is only used right away
// to read the profile on sign-in; it is never stored.
export async function exchangeVkIdCode(params: {
  clientId: string;
  code: string;
  codeVerifier: string;
  deviceId: string;
  redirectUri: string;
  state: string;
  fetchImpl?: FetchLike;
}): Promise<{ vkUserId: string; accessToken: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    code_verifier: params.codeVerifier,
    device_id: params.deviceId,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    state: params.state
  });
  const response = await fetchWithTimeout(params.fetchImpl ?? fetch, `${VK_ID_BASE_URL}/oauth2/auth`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !payload || payload.error) {
    const reason = typeof payload?.error_description === "string" ? payload.error_description : payload?.error;
    throw new Error(`vk_id_exchange_failed:${String(reason ?? response.status)}`);
  }
  if (payload.state !== undefined && payload.state !== params.state) {
    throw new Error("vk_id_state_mismatch");
  }
  const userId = payload.user_id;
  const vkUserId = typeof userId === "number" || typeof userId === "string" ? String(userId) : "";
  if (!/^\d+$/u.test(vkUserId)) throw new Error("vk_id_missing_user_id");
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  return { vkUserId, accessToken };
}

export interface VkIdUserInfo {
  vkUserId: string;
  name: string;
  email: string | null;
}

export async function fetchVkIdUserInfo(params: {
  clientId: string;
  accessToken: string;
  fetchImpl?: FetchLike;
}): Promise<VkIdUserInfo> {
  const body = new URLSearchParams({ client_id: params.clientId, access_token: params.accessToken });
  const response = await fetchWithTimeout(params.fetchImpl ?? fetch, `${VK_ID_BASE_URL}/oauth2/user_info`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = (await response.json().catch(() => null)) as
    | { user?: Record<string, unknown>; error?: unknown; error_description?: unknown }
    | null;
  if (!response.ok || !payload?.user || payload.error) {
    const reason = typeof payload?.error_description === "string" ? payload.error_description : payload?.error;
    throw new Error(`vk_id_user_info_failed:${String(reason ?? response.status)}`);
  }
  const { user_id: userId, first_name: firstName, last_name: lastName, email } = payload.user;
  const vkUserId = typeof userId === "number" || typeof userId === "string" ? String(userId) : "";
  if (!/^\d+$/u.test(vkUserId)) throw new Error("vk_id_missing_user_id");
  const name = [firstName, lastName]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim())
    .join(" ");
  return {
    vkUserId,
    name,
    email: typeof email === "string" && email.includes("@") ? email.trim().toLowerCase() : null
  };
}

export async function checkVkGroupMembership(params: {
  config: Pick<VkIdConfig, "groupId" | "groupToken">;
  vkUserId: string;
  fetchImpl?: FetchLike;
}): Promise<boolean> {
  const body = new URLSearchParams({
    group_id: params.config.groupId,
    user_id: params.vkUserId,
    access_token: params.config.groupToken,
    v: VK_API_VERSION
  });
  const response = await fetchWithTimeout(params.fetchImpl ?? fetch, `${VK_API_BASE_URL}/groups.isMember`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = (await response.json().catch(() => null)) as
    | { response?: unknown; error?: { error_code?: number; error_msg?: string } }
    | null;
  if (!response.ok || !payload || payload.error) {
    throw new Error(`vk_is_member_failed:${payload?.error?.error_code ?? response.status}`);
  }
  return payload.response === 1 || payload.response === true;
}
