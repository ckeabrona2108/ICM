import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  buildVkIdAuthorizeUrl,
  checkVkGroupMembership,
  createVkLinkCookiePayload,
  decodeVkLinkCookie,
  encodeVkLinkCookie,
  exchangeVkIdCode,
  fetchVkIdUserInfo,
  getVkIdConfig,
  getVkLinkRedirectUri
} from "@/lib/vk-id";

function jsonFetch(body: unknown, status = 200) {
  const calls: Array<{ url: string; body: string }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: String(init?.body ?? "") });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

test("link cookie round-trips and rejects garbage", () => {
  const payload = createVkLinkCookiePayload("user-1");
  assert.deepEqual(decodeVkLinkCookie(encodeVkLinkCookie(payload)), payload);
  assert.equal(decodeVkLinkCookie("not-base64-json"), null);
  assert.equal(decodeVkLinkCookie(undefined), null);
});

test("authorize URL carries the PKCE challenge of the verifier", () => {
  const url = new URL(
    buildVkIdAuthorizeUrl({
      clientId: "53141522",
      redirectUri: getVkLinkRedirectUri("https://www.icecreammusic.net/"),
      state: "state-1",
      codeVerifier: "verifier-1"
    })
  );
  assert.equal(url.searchParams.get("redirect_uri"), "https://www.icecreammusic.net/api/auth/link/vk");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    url.searchParams.get("code_challenge"),
    createHash("sha256").update("verifier-1").digest("base64url")
  );
});

test("code exchange returns the VK user id and checks the state", async () => {
  const ok = jsonFetch({ access_token: "t", user_id: 42, state: "s" });
  const result = await exchangeVkIdCode({
    clientId: "1", code: "c", codeVerifier: "v", deviceId: "d", redirectUri: "https://x/cb", state: "s", fetchImpl: ok.fetchImpl
  });
  assert.equal(result.vkUserId, "42");
  assert.equal(result.accessToken, "t");
  assert.match(ok.calls[0]!.body, /code_verifier=v/u);

  const mismatch = jsonFetch({ access_token: "t", user_id: 42, state: "other" });
  await assert.rejects(
    exchangeVkIdCode({ clientId: "1", code: "c", codeVerifier: "v", deviceId: "d", redirectUri: "https://x/cb", state: "s", fetchImpl: mismatch.fetchImpl }),
    /state_mismatch/u
  );

  const failed = jsonFetch({ error: "invalid_grant", error_description: "bad code" }, 400);
  await assert.rejects(
    exchangeVkIdCode({ clientId: "1", code: "c", codeVerifier: "v", deviceId: "d", redirectUri: "https://x/cb", state: "s", fetchImpl: failed.fetchImpl }),
    /bad code/u
  );
});

test("user info builds the name and keeps only a real email", async () => {
  const full = jsonFetch({ user: { user_id: "42", first_name: " Иван ", last_name: "Петров", email: "Ivan@Mail.ru" } });
  const info = await fetchVkIdUserInfo({ clientId: "1", accessToken: "t", fetchImpl: full.fetchImpl });
  assert.deepEqual(info, { vkUserId: "42", name: "Иван Петров", email: "ivan@mail.ru" });
  assert.match(full.calls[0]!.url, /oauth2\/user_info$/u);
  assert.match(full.calls[0]!.body, /access_token=t/u);

  const noEmail = jsonFetch({ user: { user_id: 7, first_name: "Аня", email: "" } });
  assert.equal((await fetchVkIdUserInfo({ clientId: "1", accessToken: "t", fetchImpl: noEmail.fetchImpl })).email, null);

  const failed = jsonFetch({ error: "invalid_token", error_description: "expired" }, 401);
  await assert.rejects(fetchVkIdUserInfo({ clientId: "1", accessToken: "t", fetchImpl: failed.fetchImpl }), /expired/u);
});

test("group membership reads 1/0 and surfaces API errors", async () => {
  const config = { groupId: "197191118", groupToken: "token" };
  assert.equal(await checkVkGroupMembership({ config, vkUserId: "1", fetchImpl: jsonFetch({ response: 1 }).fetchImpl }), true);
  assert.equal(await checkVkGroupMembership({ config, vkUserId: "1", fetchImpl: jsonFetch({ response: 0 }).fetchImpl }), false);
  await assert.rejects(
    checkVkGroupMembership({ config, vkUserId: "1", fetchImpl: jsonFetch({ error: { error_code: 203 } }).fetchImpl }),
    /203/u
  );
});

test("config ignores quotes that docker --env-file leaves around values", () => {
  process.env.AUTH_VK_ID = '"53141522"';
  process.env.VK_GROUP_ID = "'197191118'";
  process.env.VK_GROUP_TOKEN = "token";
  assert.deepEqual(getVkIdConfig(), { clientId: "53141522", groupId: "197191118", groupToken: "token" });
});
