import { randomUUID } from "node:crypto";

import { test, expect } from "./fixtures/community";

type FeedItem = {
  kind?: "post" | "release" | "news";
  sourceId?: string;
  releaseId?: string;
  permalink?: string;
  author?: {
    id?: string;
    displayName?: string;
    slug?: string | null;
  };
};

type FeedPayload = {
  items?: FeedItem[];
};

type ErrorPayload = {
  error?: string;
};

type SocialReportPayload = {
  ok?: boolean;
  report?: {
    id?: string;
    status?: string;
  };
};

const FIXTURES = {
  postA: "a2000000-0000-4000-8000-000000000021",
  releaseB: "b1000000-0000-4000-8000-000000000012",
  unknownUser: "d0000000-0000-4000-8000-000000000099"
} as const;

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

test.describe("Community Phase 0 release gate", () => {
  test("guest can open feed, canonical detail and author profile without an auth redirect", async ({ page, request }) => {
    const feedResponse = await request.get("/api/feed?scope=all&limit=20");
    expect(feedResponse.ok()).toBeTruthy();
    const payload = (await feedResponse.json()) as FeedPayload;
    const navigableItem = payload.items?.find(
      (item) => item.permalink?.startsWith("/feed/") && item.author?.slug
    );
    expect(navigableItem, "seed must provide a feed item with a canonical detail and author profile").toBeTruthy();

    await page.goto("/feed");
    await expect(page.getByRole("heading", { level: 1, name: "Сообщество" })).toBeVisible();
    await expect(page).toHaveURL(/\/feed(?:\?|$)/u);

    await page.goto(navigableItem!.permalink!);
    await expect(page.getByRole("heading", { level: 1, name: "Публикация сообщества" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${navigableItem!.permalink!.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "u"));

    await page.goto(`/artists/${encodeURIComponent(navigableItem!.author!.slug!)}`);
    await expect(page.getByRole("heading", { level: 1, name: navigableItem!.author!.displayName })).toBeVisible();
    await expect(page).toHaveURL(/\/artists\//u);
    await expect(page).not.toHaveURL(/\/login|\/dashboard/u);
  });

  test("public showcase CTA stays on a canonical public social route", async ({ page }) => {
    await page.goto("/feed");
    const publicCta = page.getByText(/Открыть (?:публикацию|релиз|в community)/u).first();
    await expect(publicCta).toBeVisible();
    await publicCta.click();
    await expect(page).toHaveURL(/\/(?:feed|artists)\//u);
    await expect(page).not.toHaveURL(/\/login|\/dashboard/u);
  });

  test("A, B and C use isolated authenticated browser contexts", async ({ userA, userB, userC }) => {
    expect(new Set([userA.email, userB.email, userC.email]).size).toBe(3);
    expect(new Set([userA.userId, userB.userId, userC.userId]).size).toBe(3);

    await Promise.all([userA.page.goto("/feed"), userB.page.goto("/feed"), userC.page.goto("/feed")]);
    for (const actor of [userA, userB, userC]) {
      const sessionResponse = await actor.context.request.get("/api/auth/session");
      const session = (await sessionResponse.json()) as { user?: { id?: string; email?: string } };
      expect(session.user?.id).toBe(actor.userId);
      expect(session.user?.email?.toLowerCase()).toBe(actor.email);
    }
  });

  test("guest mutation controls open contextual auth prompts without issuing the mutation", async ({ page }) => {
    const attemptedMutations: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET" && request.method() !== "HEAD") attemptedMutations.push(request.url());
    });

    const detailPath = `/feed/post_${FIXTURES.postA}`;
    await page.goto(detailPath);

    await page.getByRole("button", { name: "Открыть реакции" }).click();
    const authNotice = page.getByRole("heading", { name: "Для этого действия нужен аккаунт" }).locator("..");
    await expect(page.getByText("Войдите, чтобы ставить реакции")).toBeVisible();
    const loginHref = await authNotice.getByRole("link", { name: "Войти" }).getAttribute("href");
    expect(loginHref).toMatch(/^\/login\?callbackUrl=/u);
    expect(new URL(loginHref!, "http://localhost").searchParams.get("callbackUrl")).toContain(detailPath);

    await page.goto(detailPath);
    const commentInput = page.getByPlaceholder("Напишите комментарий");
    await expect(commentInput).toBeVisible();
    await commentInput.fill("guest draft must stay local");
    await commentInput.press("Enter");
    await expect(page.getByText("Войдите, чтобы оставлять комментарии")).toBeVisible();
    const commentAuthNotice = page.getByRole("heading", { name: "Для этого действия нужен аккаунт" }).locator("..");
    await expect(commentAuthNotice.getByRole("link", { name: "Создать аккаунт" })).toHaveAttribute("href", "/register");

    expect(attemptedMutations.filter((url) => /\/api\/(?:artists\/posts|scene\/releases)\//u.test(url))).toEqual([]);
  });

  test("social reports require auth, reject invalid targets and upsert one pending report", async ({ request, userA, userB }) => {
    const reportPath = "/api/social/reports";
    const report = {
      targetType: "post",
      targetId: FIXTURES.postA,
      reason: "spam",
      details: "deterministic E2E report"
    };

    expect((await request.post(reportPath, { data: report })).status()).toBe(401);
    expect((await userB.context.request.post(reportPath, {
      data: { ...report, targetType: "unsupported" }
    })).status()).toBe(400);
    expect((await userB.context.request.post(reportPath, {
      data: { ...report, targetId: FIXTURES.unknownUser }
    })).status()).toBe(404);
    expect((await userA.context.request.post(reportPath, { data: report })).status()).toBe(409);

    const firstResponse = await userB.context.request.post(reportPath, { data: report });
    expect(firstResponse.status()).toBe(201);
    const first = (await firstResponse.json()) as SocialReportPayload;
    expect(first.ok).toBe(true);
    expect(first.report?.id).toBeTruthy();
    expect(first.report?.status).toBe("pending");

    const secondResponse = await userB.context.request.post(reportPath, {
      data: { ...report, reason: "privacy", details: "updated deterministic E2E report" }
    });
    expect(secondResponse.status()).toBe(201);
    const second = (await secondResponse.json()) as SocialReportPayload;
    expect(second.report?.id).toBe(first.report?.id);
    expect(second.report?.status).toBe("pending");
  });

  test("authenticated safety menu submits a report and keeps the reported item visible", async ({ userA }) => {
    await userA.page.goto("/feed");
    const releaseCard = userA.page.locator(`#feed-item-${FIXTURES.releaseB}`);
    await expect(releaseCard).toBeVisible();
    await releaseCard.getByRole("button", { name: "Действия безопасности" }).click();
    await userA.page.evaluate(() => {
      window.confirm = () => true;
      window.prompt = () => "deterministic UI report";
    });
    const reportResponse = userA.page.waitForResponse((response) =>
      response.request().method() === "POST" && response.url().endsWith("/api/social/reports")
    );
    await releaseCard.getByRole("button", { name: "Пожаловаться на публикацию" }).click();

    expect((await reportResponse).status()).toBe(201);
    await expect(releaseCard).toBeVisible();
  });

  test("hide and mute preferences are authenticated, idempotent and reversible", async ({ request, userA, userB }) => {
    const preferencePath = "/api/social/feed-preferences";
    const hiddenPost = { action: "hide", targetType: "post", targetId: FIXTURES.postA };
    const mutedAuthor = { action: "mute", targetType: "user", targetId: userA.userId };

    expect((await request.post(preferencePath, { data: hiddenPost })).status()).toBe(401);
    expect((await userB.context.request.post(preferencePath, {
      data: { action: "hide", targetType: "user", targetId: userA.userId }
    })).status()).toBe(400);

    await userB.context.request.delete(preferencePath, { data: hiddenPost });
    await userB.context.request.delete(preferencePath, { data: mutedAuthor });
    try {
      const firstHide = await userB.context.request.post(preferencePath, { data: hiddenPost });
      expect(firstHide.status()).toBe(200);
      expect(await firstHide.json()).toEqual({ active: true });
      const secondHide = await userB.context.request.post(preferencePath, { data: hiddenPost });
      expect(secondHide.status()).toBe(200);
      expect(await secondHide.json()).toEqual({ active: true });

      const hiddenFeedResponse = await userB.context.request.get("/api/feed?scope=all&limit=50");
      expect(hiddenFeedResponse.ok()).toBeTruthy();
      const hiddenFeed = (await hiddenFeedResponse.json()) as FeedPayload;
      expect(hiddenFeed.items?.some((item) => item.kind === "post" && item.sourceId === FIXTURES.postA)).toBe(false);

      const muteResponse = await userB.context.request.post(preferencePath, { data: mutedAuthor });
      expect(muteResponse.status()).toBe(200);
      expect(await muteResponse.json()).toEqual({ active: true });
      const mutedFeedResponse = await userB.context.request.get("/api/feed?scope=all&limit=50");
      expect(mutedFeedResponse.ok()).toBeTruthy();
      const mutedFeed = (await mutedFeedResponse.json()) as FeedPayload;
      expect(mutedFeed.items?.some((item) => item.author?.id === userA.userId)).toBe(false);
    } finally {
      const unhide = await userB.context.request.delete(preferencePath, { data: hiddenPost });
      const unmute = await userB.context.request.delete(preferencePath, { data: mutedAuthor });
      expect(unhide.status()).toBe(200);
      expect(await unhide.json()).toEqual({ active: false });
      expect(unmute.status()).toBe(200);
      expect(await unmute.json()).toEqual({ active: false });
    }
  });

  test("a block is bilateral for social mutations and can be reversed", async ({ request, userA, userB }) => {
    const blockPath = `/api/social/blocks/${userA.userId}`;
    const reverseInteractionPath = `/api/scene/releases/${FIXTURES.releaseB}/like`;
    const forwardInteractionPath = `/api/artists/posts/${FIXTURES.postA}/comments`;

    expect((await request.post(blockPath)).status()).toBe(401);
    expect((await userB.context.request.post("/api/social/blocks/not-a-user-id")).status()).toBe(400);
    expect((await userB.context.request.post(`/api/social/blocks/${FIXTURES.unknownUser}`)).status()).toBe(404);
    expect((await userB.context.request.post(`/api/social/blocks/${userB.userId}`)).status()).toBe(409);

    await userB.context.request.delete(blockPath);
    try {
      const blockResponse = await userB.context.request.post(blockPath);
      expect(blockResponse.status()).toBe(200);
      expect(await blockResponse.json()).toEqual({ blocked: true });

      const blockedComment = await userB.context.request.post(forwardInteractionPath, {
        data: { content: "this blocked comment must never be created" }
      });
      expect(blockedComment.status()).toBe(403);
      expect(((await blockedComment.json()) as ErrorPayload).error).toBe("SOCIAL_INTERACTION_BLOCKED");

      const blockedReverseReaction = await userA.context.request.post(reverseInteractionPath, {
        data: { reaction: "heart" }
      });
      expect(blockedReverseReaction.status()).toBe(403);
      expect(((await blockedReverseReaction.json()) as ErrorPayload).error).toBe("SOCIAL_INTERACTION_BLOCKED");
    } finally {
      const unblockResponse = await userB.context.request.delete(blockPath);
      expect(unblockResponse.status()).toBe(200);
      expect(await unblockResponse.json()).toEqual({ blocked: false });
    }

    const restoredReaction = await userA.context.request.post(reverseInteractionPath, {
      data: { reaction: "heart" }
    });
    expect(restoredReaction.status()).toBe(200);
  });

  test("private object writes and reads enforce owner boundaries", async ({ request, userA, userB }) => {
    const marker = randomUUID();
    const privateKey = `private/${userA.userId}/ai/e2e-${marker}.png`;
    const objectPath = `/api/uploads/object/${privateKey}`;

    const anonymousWrite = await request.put(objectPath, {
      data: onePixelPng,
      headers: { "content-type": "image/png" }
    });
    expect(anonymousWrite.status()).toBe(401);

    const ownerWrite = await userA.context.request.put(objectPath, {
      data: onePixelPng,
      headers: { "content-type": "image/png" }
    });
    expect(ownerWrite.status()).toBe(200);

    const crossUserOverwrite = await userB.context.request.put(objectPath, {
      data: onePixelPng,
      headers: { "content-type": "image/png" }
    });
    expect(crossUserOverwrite.status()).toBe(403);

    const anonymousRead = await request.get(objectPath);
    expect([401, 403]).toContain(anonymousRead.status());

    const crossUserRead = await userB.context.request.get(objectPath);
    expect(crossUserRead.status()).toBe(403);

    const ownerRead = await userA.context.request.get(objectPath);
    expect(ownerRead.status()).toBe(200);
    expect(Buffer.from(await ownerRead.body())).toEqual(onePixelPng);
  });

  test("public media is readable but remains writable only by its owner", async ({ request, userA, userB }) => {
    const marker = randomUUID();
    const publicKey = `previews/${userA.userId}/e2e-${marker}.png`;
    const objectPath = `/api/uploads/object/${publicKey}`;

    const ownerWrite = await userA.context.request.put(objectPath, {
      data: onePixelPng,
      headers: { "content-type": "image/png" }
    });
    expect(ownerWrite.status()).toBe(200);

    const publicRead = await request.get(objectPath);
    expect(publicRead.status()).toBe(200);
    expect(Buffer.from(await publicRead.body())).toEqual(onePixelPng);

    const crossUserOverwrite = await userB.context.request.put(objectPath, {
      data: Buffer.concat([onePixelPng, Buffer.from("cross-user-overwrite")]),
      headers: { "content-type": "image/png" }
    });
    expect(crossUserOverwrite.status()).toBe(403);

    const unchangedRead = await request.get(objectPath);
    expect(Buffer.from(await unchangedRead.body())).toEqual(onePixelPng);
  });

  test("storage keys reject traversal and foreign-owner identity confusion", async ({ userA, userB }) => {
    const encodedTraversalPaths = [
      `/api/uploads/object/private/${userA.userId}/%252e%252e/${userB.userId}/escape.png`,
      `/api/uploads/object/private/${userA.userId}/%252f${userB.userId}/escape.png`,
      `/api/uploads/object/private/${userA.userId}/%255c${userB.userId}/escape.png`
    ];

    for (const objectPath of encodedTraversalPaths) {
      const response = await userA.context.request.put(objectPath, {
        data: onePixelPng,
        headers: { "content-type": "image/png" }
      });
      expect(response.status(), objectPath).toBe(400);
    }

    const foreignOwnerCandidates = [
      `/api/uploads/object/private/${userB.userId}/foreign.png`,
      `/api/uploads/object/private/${userA.userId}-suffix/confused.png`,
      `/api/uploads/object/avatars/${userB.userId}.png`,
      `/api/uploads/object/contracts/previews/${userA.userId}/system.png`
    ];

    for (const objectPath of foreignOwnerCandidates) {
      const response = await userA.context.request.put(objectPath, {
        data: onePixelPng,
        headers: { "content-type": "image/png" }
      });
      expect(response.status(), objectPath).toBe(403);
    }
  });
});
