import { expect, type Page } from "@playwright/test";

import type { CommunityActorCredentials } from "./environment";

type SessionPayload = {
  user?: {
    id?: string;
    email?: string;
  };
};

export async function loginCommunityActor(page: Page, credentials: CommunityActorCredentials): Promise<SessionPayload> {
  const loginPath = "/login?callbackUrl=%2Ffeed";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(loginPath);
    await page.getByLabel(/Email/u).fill(credentials.email);
    await page.getByLabel("Пароль").fill(credentials.password);
    await page.getByRole("button", { name: "Войти" }).click();
    try {
      // The first credentials callback can be lost while the disposable Next.js
      // server compiles the auth route. One bounded retry keeps the fixture
      // deterministic without masking a persistent authentication failure.
      await page.waitForURL((url) => url.pathname === "/feed", { timeout: attempt === 0 ? 25_000 : 60_000 });
      break;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }

  const response = await page.request.get("/api/auth/session");
  expect(response.ok(), `session endpoint failed for ${credentials.email}`).toBeTruthy();
  const session = (await response.json()) as SessionPayload;
  expect(session.user?.id, `missing session user id for ${credentials.email}`).toBeTruthy();
  expect(session.user?.email?.toLowerCase()).toBe(credentials.email);
  return session;
}
