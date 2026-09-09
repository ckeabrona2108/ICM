import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page
} from "@playwright/test";

import {
  communityActorCredentials,
  communityAuthStatePath,
  communityE2EBaseUrl,
  type CommunityActorName
} from "../support/environment";

export type CommunityActor = {
  actor: CommunityActorName;
  context: BrowserContext;
  page: Page;
  email: string;
  userId: string;
};

type CommunityFixtures = {
  userA: CommunityActor;
  userB: CommunityActor;
  userBSecond: CommunityActor;
  userC: CommunityActor;
};

async function openActor(browser: Browser, actor: CommunityActorName): Promise<CommunityActor> {
  const credentials = communityActorCredentials(actor);
  const context = await browser.newContext({
    baseURL: communityE2EBaseUrl(),
    storageState: communityAuthStatePath(actor)
  });
  const page = await context.newPage();
  const response = await context.request.get("/api/auth/session");
  expect(response.ok(), `session endpoint failed for user ${actor}`).toBeTruthy();
  const session = (await response.json()) as { user?: { id?: string; email?: string } };
  expect(session.user?.email?.toLowerCase()).toBe(credentials.email);
  expect(session.user?.id, `user ${actor} has no session id`).toBeTruthy();
  return {
    actor,
    context,
    page,
    email: credentials.email,
    userId: session.user!.id!
  };
}

export const test = base.extend<CommunityFixtures>({
  userA: async ({ browser }, use) => {
    const actor = await openActor(browser, "A");
    await use(actor);
    await actor.context.close();
  },
  userB: async ({ browser }, use) => {
    const actor = await openActor(browser, "B");
    await use(actor);
    await actor.context.close();
  },
  userBSecond: async ({ browser }, use) => {
    const actor = await openActor(browser, "B");
    await use(actor);
    await actor.context.close();
  },
  userC: async ({ browser }, use) => {
    const actor = await openActor(browser, "C");
    await use(actor);
    await actor.context.close();
  }
});

export { expect };
