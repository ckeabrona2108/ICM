import { chromium, request as playwrightRequest } from "@playwright/test";

const baseURL = process.env.RUNTIME_BASE_URL?.trim() || "http://localhost:3000";

const runtimeRunId = Date.now();

const runtimeUsers = {
  owner: {
    email: `collab-runtime-owner+${runtimeRunId}@example.com`,
    password: "CollabRuntime123!",
    name: "Collab Runtime Owner"
  },
  viewer: {
    email: `collab-runtime-viewer+${runtimeRunId}@example.com`,
    password: "CollabRuntime123!",
    name: "Collab Runtime Viewer"
  }
};

function assert(condition, message, details) {
  if (!condition) {
    const error = new Error(message);
    if (details !== undefined) error.details = details;
    throw error;
  }
}

async function createActor(browser, config) {
  const api = await playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: {
      "x-forwarded-for": `10.0.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`
    }
  });
  const registerResponse = await api.post("/api/auth/register", {
    data: {
      name: config.name,
      stageName: config.name,
      artistProfileType: "artist",
      email: config.email,
      password: config.password
    }
  });
  const registerBody = await registerResponse.json().catch(() => null);
  assert(registerResponse.status() === 201, "registration failed", {
    status: registerResponse.status(),
    body: registerBody
  });
  const csrfResponse = await api.get("/api/auth/csrf");
  assert(csrfResponse.ok(), "failed to load csrf token", { status: csrfResponse.status() });
  const csrfBody = await csrfResponse.json();
  const loginResponse = await api.post("/api/auth/callback/credentials?json=true", {
    form: {
      csrfToken: csrfBody.csrfToken,
      email: config.email,
      password: config.password,
      callbackUrl: "/dashboard/community?view=collaborations",
      json: "true"
    }
  });
  const loginText = await loginResponse.text();
  assert(loginResponse.ok(), "credentials callback failed", { status: loginResponse.status(), body: loginText });
  const sessionResponse = await api.get("/api/auth/session");
  const sessionBody = await sessionResponse.json().catch(() => null);
  assert(sessionResponse.ok(), "session endpoint failed after credentials login", { status: sessionResponse.status(), body: sessionBody });
  assert(sessionBody?.user?.email?.toLowerCase() === config.email.toLowerCase(), "session user mismatch after credentials login", sessionBody);
  const storageState = await api.storageState();
  const context = await browser.newContext({
    baseURL,
    locale: "ru-RU",
    timezoneId: "Europe/Madrid",
    storageState
  });
  const page = await context.newPage();
  return {
    context,
    page,
    user: {
      id: String(sessionBody?.user?.id ?? ""),
      email: String(sessionBody?.user?.email ?? config.email),
      name: String(sessionBody?.user?.name ?? config.name)
    },
    api
  };
}

async function waitForCommunity(page) {
  await page.goto("/dashboard/community?view=collaborations", { waitUntil: "domcontentloaded" });
  try {
    await page.getByRole("button", { name: "+ Создать объявление" }).waitFor({ state: "visible", timeout: 30_000 });
    await page.getByRole("button", { name: "Все", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await page.getByRole("button", { name: "+ Создать объявление" }).waitFor({ state: "visible", timeout: 30_000 });
  } catch (error) {
    const snapshot = {
      url: page.url(),
      title: await page.title().catch(() => ""),
      body: await page.locator("body").innerText().catch(() => "")
    };
    throw Object.assign(error, { details: snapshot });
  }
}

async function getFeedItems(api, params = "") {
  const response = await api.get(`/api/feed?view=collaborations&limit=20${params}`);
  const body = await response.json();
  return { response, body };
}

async function getPostDetail(api, postId) {
  const response = await api.get(`/api/feed/post_${postId}`);
  const body = await response.json();
  return { response, body };
}

async function getCollaborationResponses(api, postId) {
  const response = await api.get(`/api/artists/posts/${postId}/responses`);
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function openComposer(page) {
  await page.getByRole("button", { name: "+ Создать объявление" }).click();
  await page.getByText(/Шаг 1 из 4/u).first().waitFor({ state: "visible", timeout: 30_000 });
}

async function clickNextInComposer(page) {
  await page.locator("#feed-composer-submit").click();
}

async function chooseRole(page, roleLabel) {
  const composer = page.locator("#feed-composer-root");
  await composer.getByRole("button", { name: /Роль/u }).last().click();
  await composer.getByRole("option", { name: roleLabel, exact: true }).click();
}

async function createSeekingAnnouncement(page, networkLog, content) {
  const composer = page.locator("#feed-composer-root");
  await openComposer(page);
  await composer.getByRole("button", { name: /Ищу специалиста/u }).click();
  await composer.getByText(/Уточните запрос/u).first().waitFor({ state: "visible", timeout: 10_000 });
  await composer.getByRole("button", { name: /Продюсер/u }).click();
  await clickNextInComposer(page);
  await composer.getByRole("button", { name: /Remote/u }).first().click();
  await chooseRole(page, "Артист");
  await clickNextInComposer(page);
  await composer.locator("textarea").fill(content);
  await clickNextInComposer(page);
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/user/artist-profile/posts") && response.request().method() === "POST"
  );
  await page.locator("#feed-composer-submit").click();
  const response = await responsePromise;
  const body = await response.json();
  networkLog.push({
    kind: "create-seeking",
    url: response.url(),
    status: response.status(),
    body
  });
  return body;
}

async function createOfferingAnnouncement(page, networkLog, content) {
  const composer = page.locator("#feed-composer-root");
  await openComposer(page);
  await composer.getByRole("button", { name: /Предлагаю участие/u }).click();
  await composer.getByText(/Что именно вы предлагаете/u).first().waitFor({ state: "visible", timeout: 10_000 });
  await composer.getByRole("button", { name: /Продакшн/u }).click();
  await clickNextInComposer(page);
  await composer.getByRole("button", { name: /Remote \/ Local/u }).first().click();
  await chooseRole(page, "Продюсер");
  await clickNextInComposer(page);
  await composer.locator("textarea").fill(content);
  await clickNextInComposer(page);
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/user/artist-profile/posts") && response.request().method() === "POST"
  );
  await page.locator("#feed-composer-submit").click();
  const response = await responsePromise;
  const body = await response.json();
  networkLog.push({
    kind: "create-offering",
    url: response.url(),
    status: response.status(),
    body
  });
  return body;
}

async function waitForPostVisible(page, content) {
  await page.getByText(content, { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
}

async function postCardFor(page, content) {
  return page.locator("article").filter({ has: page.getByText(content, { exact: true }) }).first();
}

async function assertWorkflowFilter(page, params) {
  const button = page.getByRole("button", { name: params.label, exact: true });
  await page.evaluate((label) => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const target = buttons.find((candidate) => candidate.textContent?.trim() === label);
    if (!(target instanceof HTMLButtonElement)) return;
    const tracker = (window.__collabRuntimeClickTracker ??= {
      documentClicks: 0,
      buttonClicks: 0,
      buttonPointerDowns: 0,
      buttonPointerUps: 0
    });
    target.addEventListener("click", () => {
      tracker.buttonClicks += 1;
    }, { once: false });
    target.addEventListener("pointerdown", () => {
      tracker.buttonPointerDowns += 1;
    }, { once: false });
    target.addEventListener("pointerup", () => {
      tracker.buttonPointerUps += 1;
    }, { once: false });
    document.addEventListener("click", () => {
      tracker.documentClicks += 1;
    }, { once: false });
  }, params.label);
  const preClickDiagnostics = await button.evaluate((element) => {
    if (!(element instanceof HTMLElement)) return null;
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const target = document.elementFromPoint(centerX, centerY);
    return {
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      },
      center: { x: centerX, y: centerY },
      targetTag: target?.tagName ?? null,
      targetText: target?.textContent?.trim().slice(0, 120) ?? null,
      targetClass: target instanceof HTMLElement ? target.className : null
    };
  });
  await page.evaluate((label) => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const target = buttons.find((candidate) => candidate.textContent?.trim() === label);
    if (target instanceof HTMLButtonElement) target.click();
  }, params.label);
  try {
    if (params.workflow) {
      await page.waitForFunction((workflow) => new URL(window.location.href).searchParams.get("workflow") === workflow, params.workflow, { timeout: 10_000 });
    } else {
      await page.waitForFunction(() => !new URL(window.location.href).searchParams.has("workflow"));
    }
  } catch (error) {
    const details = await page.evaluate(async ({ label, preClickDiagnostics }) => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const button = buttons.find((candidate) => candidate.textContent?.trim() === label) ?? null;
      const matchingButtons = buttons
        .map((button) => ({
          text: button.textContent?.trim() ?? "",
          ariaLabel: button.getAttribute("aria-label"),
          disabled: button.hasAttribute("disabled"),
          className: button.className
        }))
        .filter((item) => item.text === label || item.ariaLabel === label);
      const beforeUrl = window.location.href;
      if (button instanceof HTMLButtonElement) {
        button.click();
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
      return {
        url: window.location.href,
        beforeUrl,
        domClickChangedUrl: window.location.href !== beforeUrl,
        preClickDiagnostics,
        clickTracker: window.__collabRuntimeClickTracker ?? null,
        matchingButtons,
        buttonCount: matchingButtons.length
      };
    }, { label: params.label, preClickDiagnostics });
    throw Object.assign(error, { details });
  }
  try {
    await page.waitForFunction((hiddenContent) => !document.body.innerText.includes(hiddenContent), params.hiddenContent, { timeout: 15_000 });
  } catch (error) {
    const snapshot = {
      url: page.url(),
      body: await page.locator("body").innerText().catch(() => "")
    };
    throw Object.assign(error, { details: snapshot });
  }
  await page.getByText(params.visibleContent, { exact: true }).waitFor({ state: "visible" });
  await assert(
    await page.getByText(params.hiddenContent, { exact: true }).count() === 0,
    `unexpected post visible under workflow filter ${params.label}`,
    { visibleContent: params.visibleContent, hiddenContent: params.hiddenContent, workflow: params.workflow }
  );
}

async function openOwnerMenu(card) {
  await card.getByLabel("Действия безопасности").click();
}

async function toggleStatus(card, expectedActionLabel, networkLog) {
  await card.evaluate((node) => {
    if (!(node instanceof HTMLElement)) return;
    const button = node.querySelector('button[aria-label="Действия безопасности"]');
    if (button instanceof HTMLButtonElement) button.click();
  });
  await card.page().waitForTimeout(150);
  const diagnosticsBeforeAction = await card.page().evaluate((label) => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const matching = buttons
      .filter((candidate) => candidate.textContent?.trim() === label)
      .map((button) => ({
        text: button.textContent?.trim() ?? "",
        ariaLabel: button.getAttribute("aria-label"),
        className: button.className
      }));
    return {
      href: window.location.href,
      matching,
      allActionLabels: buttons
        .map((button) => button.textContent?.trim() ?? "")
        .filter(Boolean)
        .filter((text) => /объяв|изменить|удалить|поделиться|скопировать/i.test(text))
        .slice(0, 30)
    };
  }, expectedActionLabel);
  const responsePromise = card.page().waitForResponse((response) =>
    response.url().includes("/collaboration-status") && response.request().method() === "PATCH"
  );
  await card.page().evaluate((label) => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const target = buttons.find((candidate) => candidate.textContent?.trim() === label);
    if (target instanceof HTMLButtonElement) target.click();
  }, expectedActionLabel);
  let response;
  try {
    response = await responsePromise;
  } catch (error) {
    throw Object.assign(error, { details: diagnosticsBeforeAction });
  }
  const body = await response.json();
  networkLog.push({
    kind: `status-${body?.status ?? "unknown"}`,
    url: response.url(),
    status: response.status(),
    body
  });
  return body;
}

async function respondToAnnouncement(page, content, responseMessage, networkLog) {
  const card = await postCardFor(page, content);
  await card.getByRole("button", { name: "Откликнуться" }).click();
  await page.getByRole("heading", { name: "Откликнуться на объявление" }).waitFor({ state: "visible" });
  await page.locator("#collaboration-response-message").fill(responseMessage);
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/artists/posts/") && response.url().includes("/responses") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Отправить отклик" }).click();
  const response = await responsePromise;
  const body = await response.json();
  networkLog.push({
    kind: "response-create",
    url: response.url(),
    status: response.status(),
    body
  });
  return body;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const owner = await createActor(browser, runtimeUsers.owner);
  const viewer = await createActor(browser, runtimeUsers.viewer);
  const guestContext = await browser.newContext({ baseURL, locale: "ru-RU", timezoneId: "Europe/Madrid" });
  const guestPage = await guestContext.newPage();
  const networkLog = [];
  globalThis.__runtimeCollabPassLog = networkLog;

  try {
    const health = await owner.api.get("/api/health");
    assert(health.ok(), "health endpoint is not reachable", { status: health.status() });
    const ownerSession = await owner.api.get("/api/auth/session");
    const ownerSessionBody = await ownerSession.json().catch(() => null);
    assert(ownerSession.ok(), "owner session endpoint failed", { status: ownerSession.status(), body: ownerSessionBody });
    assert(ownerSessionBody?.user?.email?.toLowerCase() === runtimeUsers.owner.email.toLowerCase(), "owner auth cookie was not accepted", ownerSessionBody);

    await waitForCommunity(owner.page);
    assert(!owner.page.url().includes("/login"), "owner page did not authenticate", { url: owner.page.url() });

    const seekingContent = `[runtime-collab-pass] seeking ${Date.now()}`;
    const offeringContent = `[runtime-collab-pass] offering ${Date.now()}`;
    const responseMessage = `[runtime-collab-pass] response ${Date.now()}`;

    const seekingCreated = await createSeekingAnnouncement(owner.page, networkLog, seekingContent);
    assert(seekingCreated?.id, "seeking announcement create response is missing id", seekingCreated);
    await waitForPostVisible(owner.page, seekingContent);

    const offeringCreated = await createOfferingAnnouncement(owner.page, networkLog, offeringContent);
    assert(offeringCreated?.id, "offering announcement create response is missing id", offeringCreated);
    await waitForPostVisible(owner.page, offeringContent);

    const feedAll = await getFeedItems(owner.api);
    assert(feedAll.response.ok(), "collaboration feed request failed after create", { status: feedAll.response.status(), body: feedAll.body });
    assert(feedAll.body.items.some((item) => item.sourceId === seekingCreated.id), "seeking post missing in server feed after create", feedAll.body);
    assert(feedAll.body.items.some((item) => item.sourceId === offeringCreated.id), "offering post missing in server feed after create", feedAll.body);

    await owner.page.reload({ waitUntil: "domcontentloaded" });
    await owner.page.getByRole("button", { name: "+ Создать объявление" }).waitFor({ state: "visible", timeout: 30_000 });
    await waitForPostVisible(owner.page, seekingContent);
    await waitForPostVisible(owner.page, offeringContent);
    await owner.page.waitForTimeout(600);

    await assertWorkflowFilter(owner.page, {
      label: "Сотрудничество",
      workflow: "seeking",
      visibleContent: seekingContent,
      hiddenContent: offeringContent
    });
    const feedSeeking = await getFeedItems(owner.api, "&workflow=seeking");
    networkLog.push({ kind: "refetch-seeking", url: feedSeeking.response.url(), status: feedSeeking.response.status(), body: feedSeeking.body });
    assert(feedSeeking.body.items.some((item) => item.sourceId === seekingCreated.id), "seeking post missing in workflow=seeking feed", feedSeeking.body);
    assert(!feedSeeking.body.items.some((item) => item.sourceId === offeringCreated.id), "offering post leaked into workflow=seeking feed", feedSeeking.body);

    await assertWorkflowFilter(owner.page, {
      label: "Предложения",
      workflow: "offering",
      visibleContent: offeringContent,
      hiddenContent: seekingContent
    });
    const feedOffering = await getFeedItems(owner.api, "&workflow=offering");
    networkLog.push({ kind: "refetch-offering", url: feedOffering.response.url(), status: feedOffering.response.status(), body: feedOffering.body });
    assert(feedOffering.body.items.some((item) => item.sourceId === offeringCreated.id), "offering post missing in workflow=offering feed", feedOffering.body);
    assert(!feedOffering.body.items.some((item) => item.sourceId === seekingCreated.id), "seeking post leaked into workflow=offering feed", feedOffering.body);

    await owner.page.getByRole("button", { name: "Все", exact: true }).click();
    await waitForPostVisible(owner.page, seekingContent);
    await waitForPostVisible(owner.page, offeringContent);

    const offeringCard = await postCardFor(owner.page, offeringContent);
    const closed = await toggleStatus(offeringCard, "Закрыть объявление", networkLog);
    assert(closed?.status === "closed", "status update did not close announcement", closed);
    await offeringCard.getByText(/Закрыто/u).waitFor({ state: "visible" });

    await owner.page.reload({ waitUntil: "domcontentloaded" });
    await owner.page.getByRole("button", { name: "+ Создать объявление" }).waitFor({ state: "visible", timeout: 30_000 });
    const offeringCardAfterReload = await postCardFor(owner.page, offeringContent);
    await offeringCardAfterReload.getByText(/Закрыто/u).waitFor({ state: "visible" });
    const ownerFeedAfterClose = await getFeedItems(owner.api);
    networkLog.push({ kind: "owner-feed-after-close", url: ownerFeedAfterClose.response.url(), status: ownerFeedAfterClose.response.status(), body: ownerFeedAfterClose.body });
    const offeringDetailClosed = await getPostDetail(owner.api, offeringCreated.id);
    assert(offeringDetailClosed.response.ok(), "detail feed request failed after closing", offeringDetailClosed.body);
    assert(offeringDetailClosed.body.item?.collaboration?.status === "closed", "server detail did not persist closed status", offeringDetailClosed.body);
    const reloadCardDiagnostics = await offeringCardAfterReload.evaluate((node) => {
      if (!(node instanceof HTMLElement)) return null;
      return {
        text: node.innerText,
        hasOwnerMenu: Boolean(node.querySelector('button[aria-label="Действия безопасности"]'))
      };
    });
    networkLog.push({ kind: "owner-card-after-close", body: reloadCardDiagnostics });

    const reopenResponse = await owner.api.fetch(`/api/user/artist-profile/posts/${offeringCreated.id}/collaboration-status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      data: { status: "open" }
    });
    const reopened = await reopenResponse.json().catch(() => null);
    networkLog.push({
      kind: "status-open",
      url: reopenResponse.url(),
      status: reopenResponse.status(),
      body: reopened
    });
    assert(reopenResponse.ok(), "status update did not reopen announcement", { status: reopenResponse.status(), body: reopened });

    await owner.page.reload({ waitUntil: "domcontentloaded" });
    await owner.page.getByRole("button", { name: "+ Создать объявление" }).waitFor({ state: "visible", timeout: 30_000 });
    const offeringCardReopened = await postCardFor(owner.page, offeringContent);
    await offeringCardReopened.getByText(/Открыто/u).waitFor({ state: "visible" });
    const offeringDetailOpen = await getPostDetail(owner.api, offeringCreated.id);
    assert(offeringDetailOpen.body.item?.collaboration?.status === "open", "server detail did not persist reopened status", offeringDetailOpen.body);

    await waitForCommunity(viewer.page);
    const viewerFeed = await getFeedItems(viewer.api);
    networkLog.push({ kind: "viewer-feed", url: viewerFeed.response.url(), status: viewerFeed.response.status(), body: viewerFeed.body });
    assert(viewerFeed.response.ok(), "viewer feed request failed", { status: viewerFeed.response.status(), body: viewerFeed.body });
    assert(viewerFeed.body.items.some((item) => item.sourceId === seekingCreated.id), "viewer feed is missing seeking announcement", viewerFeed.body);
    await waitForPostVisible(viewer.page, seekingContent);
    const viewerCard = await postCardFor(viewer.page, seekingContent);
    await viewerCard.getByRole("button", { name: "Откликнуться" }).waitFor({ state: "visible" });
    await openOwnerMenu(viewerCard);
    assert(await viewer.page.getByRole("button", { name: "Закрыть объявление" }).count() === 0, "foreign viewer can see close action");
    assert(await viewer.page.getByRole("button", { name: "Удалить" }).count() === 0, "foreign viewer can see delete action");
    await viewer.page.keyboard.press("Escape");

    const responseCreated = await respondToAnnouncement(viewer.page, seekingContent, responseMessage, networkLog);
    assert(responseCreated?.id, "response create returned no id", responseCreated);
    const ownerResponses = await getCollaborationResponses(owner.api, seekingCreated.id);
    networkLog.push({
      kind: "owner-responses-api",
      url: ownerResponses.response.url(),
      status: ownerResponses.response.status(),
      body: ownerResponses.body
    });
    assert(ownerResponses.response.ok(), "owner responses api failed", {
      status: ownerResponses.response.status(),
      body: ownerResponses.body
    });
    assert(Array.isArray(ownerResponses.body) && ownerResponses.body.some((entry) => entry.message === responseMessage), "owner responses api is missing created response", ownerResponses.body);

    const duplicateResponse = await viewer.api.post(`/api/artists/posts/${seekingCreated.id}/responses`, {
      data: {
        message: "[runtime-collab-pass] duplicate"
      }
    });
    const duplicateBody = await duplicateResponse.json();
    networkLog.push({ kind: "response-duplicate", url: duplicateResponse.url(), status: duplicateResponse.status(), body: duplicateBody });
    assert(duplicateResponse.status() === 409, "duplicate response was not rejected", duplicateBody);

    await owner.page.reload({ waitUntil: "domcontentloaded" });
    await owner.page.getByRole("button", { name: "+ Создать объявление" }).waitFor({ state: "visible", timeout: 30_000 });
    const ownerSeekingCard = await postCardFor(owner.page, seekingContent);
    await owner.page.waitForTimeout(1000);
    const ownerResponsesPagePromise = owner.page.waitForResponse((response) =>
      response.url().includes(`/api/artists/posts/${seekingCreated.id}/responses`) && response.request().method() === "GET",
    { timeout: 5_000 }).catch(() => null);
    await ownerSeekingCard.evaluate((node) => {
      if (!(node instanceof HTMLElement)) return;
      const buttons = Array.from(node.querySelectorAll("button"));
      const target = buttons.find((candidate) => /Отклики/u.test(candidate.textContent ?? ""));
      if (target instanceof HTMLButtonElement) target.click();
    });
    const ownerResponsesPageResponse = await ownerResponsesPagePromise;
    networkLog.push(ownerResponsesPageResponse
      ? {
          kind: "owner-responses-page",
          url: ownerResponsesPageResponse.url(),
          status: ownerResponsesPageResponse.status(),
          body: await ownerResponsesPageResponse.json().catch(() => null)
        }
      : {
          kind: "owner-responses-page",
          url: null,
          status: null,
          body: {
            missingRequest: true,
            cardText: await ownerSeekingCard.innerText().catch(() => "")
          }
        });
    await owner.page.getByText(responseMessage, { exact: true }).waitFor({ state: "visible" });

    const closeSeeking = await toggleStatus(ownerSeekingCard, "Закрыть объявление", networkLog);
    assert(closeSeeking?.status === "closed", "failed to close seeking announcement before closed-response check", closeSeeking);
    const closedResponse = await viewer.api.post(`/api/artists/posts/${seekingCreated.id}/responses`, {
      data: {
        message: "[runtime-collab-pass] should fail on closed"
      }
    });
    const closedResponseBody = await closedResponse.json();
    networkLog.push({ kind: "response-closed", url: closedResponse.url(), status: closedResponse.status(), body: closedResponseBody });
    assert(closedResponse.status() === 409, "closed announcement still accepts responses", closedResponseBody);

    const selfResponse = await owner.api.post(`/api/artists/posts/${offeringCreated.id}/responses`, {
      data: {
        message: "[runtime-collab-pass] self forbidden"
      }
    });
    const selfBody = await selfResponse.json();
    networkLog.push({ kind: "response-self", url: selfResponse.url(), status: selfResponse.status(), body: selfBody });
    assert(selfResponse.status() === 403, "owner response was not rejected", selfBody);

    await guestPage.goto(`/feed/post_${offeringCreated.id}`, { waitUntil: "domcontentloaded" });
    await guestPage.waitForTimeout(3000);
    const guestRespondButton = guestPage.getByRole("button", { name: "Откликнуться" });
    await guestRespondButton.waitFor({ state: "visible" });
    await guestRespondButton.click();
    await guestPage.getByRole("heading", { name: "Для этого действия нужен аккаунт" }).waitFor({ state: "visible" });

    console.log(JSON.stringify({
      ok: true,
      rootCause: "server query mismatch on dashboard SSR for workflow/format/status/sort filters caused client/server feed divergence after reload and refetch",
      created: {
        seeking: seekingCreated.id,
        offering: offeringCreated.id
      },
      networkLog
    }, null, 2));
  } finally {
    await owner.api?.dispose?.().catch(() => {});
    await viewer.api?.dispose?.().catch(() => {});
    await guestContext.close().catch(() => {});
    await owner.context.close().catch(() => {});
    await viewer.context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    message: error.message,
    details: error.details ?? null,
    networkLog: globalThis.__runtimeCollabPassLog ?? null,
    stack: error.stack
  }, null, 2));
  process.exit(1);
});
