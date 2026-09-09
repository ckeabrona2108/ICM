import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3002';
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = path.join(process.cwd(), 'screenshots', 'ux-verification');

const accounts = {
  artist: { email: 'artist.a@local.icm', password: 'DevPass123!', name: 'Ckeabrona' },
  listener: { email: 'listener.b@local.icm', password: 'DevPass123!', name: 'Mamasita' },
  producer: { email: 'producer.c@local.icm', password: 'DevPass123!', name: 'Pulsecraft' }
};


function step(label) {
  console.log(`[STEP] ${label}`);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return res.json();
}

async function resolveTargets() {
  const feed = await fetchJson(`${BASE}/api/feed`);
  const post = feed.items.find((item) => item.kind === 'post' && item.author?.displayName === 'Ckeabrona');
  const release = feed.items.find((item) => item.kind === 'release');
  if (!post || !release) throw new Error('Missing post or release item in /api/feed');

  const artistSearch = await fetchJson(`${BASE}/api/artists/search?q=Ckeabrona`);
  const groupSearch = await fetchJson(`${BASE}/api/artists/search?q=Aurora`);
  const labelSearch = await fetchJson(`${BASE}/api/artists/search?q=Northline`);

  const artist = artistSearch.artists?.[0];
  const group = groupSearch.artists?.find((item) => item.profileType === 'group') ?? groupSearch.artists?.[0];
  const label = labelSearch.artists?.find((item) => item.profileType === 'label') ?? labelSearch.artists?.[0];

  if (!artist || !group || !label) throw new Error('Missing artist/group/label search targets');

  return {
    post,
    release,
    artist,
    group,
    label,
  };
}

async function waitForApp(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function login(page, account) {
  step(`login:start:${account.email}`);
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await page.waitForTimeout(1000);
  const form = page.locator('form').first();
  const email = page.getByLabel('Email');
  const password = page.getByLabel('Пароль');
  const submit = form.getByRole('button', { name: 'Войти' });

  await email.waitFor({ timeout: 20000 });
  await email.fill(account.email);
  await password.fill(account.password);
  await submit.waitFor({ timeout: 10000 });
  await submit.click();

  try {
    await page.waitForURL(/\/dashboard/, { timeout: 10000, waitUntil: 'domcontentloaded' });
  } catch {
    await password.press('Enter').catch(() => {});
    await page.waitForTimeout(2000);
  }

  if (!/\/dashboard/.test(page.url())) {
    const bodyText = await page.locator('body').innerText().catch(() => '');
    if (!/Выход|Новости|Сообщество/.test(bodyText)) {
      throw new Error(
        `Login did not reach dashboard for ${account.email}. Current URL: ${page.url()}. Body: ${bodyText.slice(0, 500)}`,
      );
    }
  }

  step(`login:ok:${account.email}`);
  await waitForApp(page);
}

async function openNotifications(page) {
  await page.getByRole('button', { name: 'Открыть уведомления' }).click();
  await page.getByText('Уведомления').waitFor({ timeout: 10000 });
}

async function expectNoOverflow(page, label) {
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert.equal(noOverflow, true, `horizontal overflow detected on ${label}`);
}

async function shot(page, name, opts = {}) {
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: true, ...opts });
}

async function getFirstReactionCount(scope) {
  const chip = scope.locator('button').filter({ hasText: /^❤️\s*\d+$/ }).first();
  if (await chip.count()) return (await chip.textContent())?.trim() ?? '';
  const anyChip = scope.locator('button').filter({ hasText: /\d+/ }).first();
  return (await anyChip.textContent())?.trim() ?? '';
}

async function main() {
  await ensureDir(SHOTS);
  const targets = await resolveTargets();
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });

  const desktop = { width: 1440, height: 900 };
  const mobile390 = { width: 390, height: 844 };
  const mobile360 = { width: 360, height: 800 };

  const guestContext = await browser.newContext({ viewport: desktop });
  const guestPage = await guestContext.newPage();

  step('guest post detail');
  await guestPage.goto(`${BASE}${targets.post.permalink}`, { waitUntil: 'domcontentloaded' });
  await waitForApp(guestPage);
  await expectNoOverflow(guestPage, 'guest post detail desktop');
  const postDetail = guestPage.locator('article').first();
  const postReactionBefore = await getFirstReactionCount(postDetail);
  await postDetail.locator('button').filter({ hasText: /\d+/ }).first().click();
  await guestPage.getByText('Для этого действия нужен аккаунт').waitFor({ timeout: 10000 });
  const postReactionAfter = await getFirstReactionCount(postDetail);
  assert.equal(postReactionBefore, postReactionAfter, 'guest reaction changed count on post detail');
  await postDetail.getByRole('button', { name: /Комментарии/ }).first().click();
  await guestPage.getByText('Для этого действия нужен аккаунт').waitFor({ timeout: 10000 });
  await shot(guestPage, 'desktop-post-detail.png');

  step('guest release detail');
  await guestPage.goto(`${BASE}${targets.release.permalink}`, { waitUntil: 'domcontentloaded' });
  await waitForApp(guestPage);
  await expectNoOverflow(guestPage, 'guest release detail desktop');
  const releaseDetail = guestPage.locator('article').first();
  const releaseReactionBefore = await getFirstReactionCount(releaseDetail);
  await releaseDetail.locator('button').filter({ hasText: /\d+/ }).first().click();
  await guestPage.getByText('Для этого действия нужен аккаунт').waitFor({ timeout: 10000 });
  const releaseReactionAfter = await getFirstReactionCount(releaseDetail);
  assert.equal(releaseReactionBefore, releaseReactionAfter, 'guest reaction changed count on release detail');
  await releaseDetail.getByRole('button', { name: /Комментарии/ }).first().click();
  await guestPage.getByText('Для этого действия нужен аккаунт').waitFor({ timeout: 10000 });
  await shot(guestPage, 'desktop-release-detail.png');

  step('guest artist profile');
  await guestPage.goto(`${BASE}/artists/${targets.artist.slug}`, { waitUntil: 'domcontentloaded' });
  await waitForApp(guestPage);
  await guestPage.getByRole('button', { name: /Войти, чтобы подписаться|Войти, чтобы связаться/ }).first().click();
  await guestPage.getByText('Для этого действия нужен аккаунт').waitFor({ timeout: 10000 });
  await shot(guestPage, 'desktop-artist-profile.png');

  await guestPage.goto(`${BASE}/artists/${targets.group.slug}`, { waitUntil: 'domcontentloaded' });
  await waitForApp(guestPage);
  await shot(guestPage, 'desktop-group-profile.png');

  await guestPage.goto(`${BASE}/artists/${targets.label.slug}`, { waitUntil: 'domcontentloaded' });
  await waitForApp(guestPage);
  await shot(guestPage, 'desktop-label-profile.png');

  step('listener login');
  const listenerContext = await browser.newContext({ viewport: desktop });
  const listenerPage = await listenerContext.newPage();
  await login(listenerPage, accounts.listener);
  step('listener feed');
  await listenerPage.goto(`${BASE}/feed`, { waitUntil: 'domcontentloaded' });
  await waitForApp(listenerPage);
  const searchInput = listenerPage.getByLabel('Глобальный поиск');
  await searchInput.fill('COLLAB LOOP');
  const searchDropdown = listenerPage.locator('[data-search-dropdown="true"]');
  await searchDropdown.waitFor({ timeout: 10000 });
  const postLink = searchDropdown.locator('a[href*="/feed/post_"]').first();
  await postLink.click();
  await listenerPage.waitForURL(/\/feed\/post_/, { timeout: 15000 });
  await waitForApp(listenerPage);

  const listenerDetail = listenerPage.locator('article').first();
  await listenerDetail.getByRole('button', { name: 'Открыть реакции' }).click();
  const reactionMenu = listenerPage.getByRole('menu', { name: 'Выбор реакции' });
  await reactionMenu.waitFor({ timeout: 10000 });
  await reactionMenu.locator('button').nth(1).click();
  await listenerDetail.getByRole('button', { name: 'Открыть реакции' }).click();
  await reactionMenu.waitFor({ timeout: 10000 });
  await reactionMenu.locator('button').nth(3).click();
  await listenerDetail.getByRole('button', { name: 'Открыть реакции' }).click();
  await reactionMenu.waitFor({ timeout: 10000 });
  await listenerPage.waitForFunction(() => {
    const menu = document.querySelector('[role="menu"][aria-label="Выбор реакции"]');
    const selected = menu?.querySelector('button[aria-pressed="true"]');
    return selected?.textContent?.trim() === '😮';
  }, { timeout: 10000 });

  const listenerComment = `UX verify comment ${Date.now()}`;
  const commentForm = listenerPage.locator('#feed-detail-comment-form').first();
  await commentForm.locator('input').fill(listenerComment);
  await commentForm.locator('button[type="submit"]').click();
  await listenerPage.getByText(listenerComment).waitFor({ timeout: 15000 });
  await shot(listenerPage, 'desktop-comments-thread.png');

  const authorName = targets.post.author.displayName;
  await listenerPage.getByRole('link', { name: new RegExp(authorName, 'i') }).first().click();
  await listenerPage.waitForURL(/\/artists\//, { timeout: 15000 });
  await waitForApp(listenerPage);
  const followButton = listenerPage.getByRole('button', { name: /Подписаться|Вы подписаны/ }).first();
  if (/Подписаться/i.test((await followButton.textContent()) ?? '')) {
    await followButton.click();
    await listenerPage.getByRole('button', { name: /Вы подписаны/ }).first().waitFor({ timeout: 10000 });
  }
  await shot(listenerPage, 'desktop-contact-cta-state.png');
  await listenerPage.getByRole('link', { name: 'Связаться' }).click();
  await listenerPage.waitForURL(/\/dashboard\/messages/, { timeout: 15000 });
  await waitForApp(listenerPage);
  await listenerPage.getByText(authorName).first().waitFor({ timeout: 15000 });

  await listenerPage.reload({ waitUntil: 'domcontentloaded' });
  await waitForApp(listenerPage);
  await listenerPage.goto(`${BASE}${targets.post.permalink}`, { waitUntil: 'domcontentloaded' });
  await waitForApp(listenerPage);
  await listenerPage.getByText(listenerComment).waitFor({ timeout: 10000 });
  await listenerDetail.getByRole('button', { name: 'Открыть реакции' }).click();
  await reactionMenu.waitFor({ timeout: 10000 });
  await listenerPage.waitForFunction(() => {
    const menu = document.querySelector('[role="menu"][aria-label="Выбор реакции"]');
    const selected = menu?.querySelector('button[aria-pressed="true"]');
    return selected?.textContent?.trim() === '😮';
  }, { timeout: 10000 });

  step('artist login');
  const artistContext = await browser.newContext({ viewport: desktop });
  const artistPage = await artistContext.newPage();
  await login(artistPage, accounts.artist);
  await artistPage.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await waitForApp(artistPage);
  await openNotifications(artistPage);
  const feedNotification = artistPage.locator('a[href*="/feed/"]').first();
  await feedNotification.waitFor({ timeout: 15000 });
  await feedNotification.click();
  await artistPage.waitForURL(/\/feed\//, { timeout: 15000 });
  await waitForApp(artistPage);
  await artistPage.getByText(listenerComment).waitFor({ timeout: 10000 });
  await artistPage.getByRole('button', { name: 'Ответить' }).first().click();
  const artistReply = `UX verify reply ${Date.now()}`;
  const replyInput = artistPage.getByPlaceholder('Ответить на комментарий').first();
  await replyInput.fill(artistReply);
  await replyInput.press('Enter');
  await artistPage.getByText(artistReply).waitFor({ timeout: 15000 });

  await artistPage.goto(`${BASE}${targets.release.permalink}`, { waitUntil: 'domcontentloaded' });
  await waitForApp(artistPage);
  await artistPage.getByText('Метрики автора').waitFor({ timeout: 10000 });
  await shot(artistPage, 'desktop-author-metrics.png');

  step('producer login');
  const producerContext = await browser.newContext({ viewport: desktop });
  const producerPage = await producerContext.newPage();
  await login(producerPage, accounts.producer);
  await producerPage.goto(`${BASE}/feed`, { waitUntil: 'domcontentloaded' });
  await waitForApp(producerPage);
  const producerSearch = producerPage.getByLabel('Глобальный поиск');
  await producerSearch.fill('Ckeabrona');
  const producerDropdown = producerPage.locator('[data-search-dropdown="true"]');
  await producerDropdown.waitFor({ timeout: 10000 });
  await producerDropdown.locator(`a[href="/artists/${targets.artist.slug}"]`).first().click();
  await producerPage.waitForURL(new RegExp(`/artists/${targets.artist.slug}`), { timeout: 15000 });
  await waitForApp(producerPage);
  const producerFollow = producerPage.getByRole('button', { name: /Подписаться|Вы подписаны/ }).first();
  if (/Подписаться/i.test((await producerFollow.textContent()) ?? '')) {
    await producerFollow.click();
    await producerPage.getByRole('button', { name: /Вы подписаны/ }).first().waitFor({ timeout: 10000 });
  }
  await producerPage.getByRole('link', { name: 'Связаться' }).click();
  await producerPage.waitForURL(/\/dashboard\/messages/, { timeout: 15000 });
  await waitForApp(producerPage);
  await producerPage.getByText('Ckeabrona').first().waitFor({ timeout: 15000 });
  await producerPage.goBack({ waitUntil: 'domcontentloaded' });
  await waitForApp(producerPage);
  await producerPage.getByText('Ckeabrona').first().waitFor({ timeout: 15000 });
  await expectNoOverflow(producerPage, 'producer artist profile desktop');

  step('mobile guest 390');
  const mobileGuest390 = await browser.newContext({ viewport: mobile390, isMobile: true, hasTouch: true });
  const mobilePost = await mobileGuest390.newPage();
  await mobilePost.goto(`${BASE}${targets.post.permalink}`, { waitUntil: 'domcontentloaded' });
  await waitForApp(mobilePost);
  await expectNoOverflow(mobilePost, 'mobile post detail 390');
  await shot(mobilePost, 'mobile-post-detail-390x844.png');
  await mobilePost.getByRole('button', { name: /Комментарии/ }).first().click();
  await mobilePost.getByText('Для этого действия нужен аккаунт').waitFor({ timeout: 10000 });
  await shot(mobilePost, 'mobile-comments-390x844.png');

  const mobileRelease = await mobileGuest390.newPage();
  await mobileRelease.goto(`${BASE}${targets.release.permalink}`, { waitUntil: 'domcontentloaded' });
  await waitForApp(mobileRelease);
  await expectNoOverflow(mobileRelease, 'mobile release detail 390');
  await shot(mobileRelease, 'mobile-release-detail-390x844.png');
  await shot(mobileRelease, 'mobile-release-player-390x844.png');

  const mobileProfile = await mobileGuest390.newPage();
  await mobileProfile.goto(`${BASE}/artists/${targets.artist.slug}`, { waitUntil: 'domcontentloaded' });
  await waitForApp(mobileProfile);
  await expectNoOverflow(mobileProfile, 'mobile artist profile 390');
  await shot(mobileProfile, 'mobile-artist-profile-390x844.png');
  await mobileProfile.getByRole('button', { name: /Войти, чтобы подписаться|Войти, чтобы связаться/ }).first().click();
  await mobileProfile.getByText('Для этого действия нужен аккаунт').waitFor({ timeout: 10000 });
  await shot(mobileProfile, 'mobile-contact-cta-390x844.png');

  step('mobile guest 360');
  const mobileGuest360 = await browser.newContext({ viewport: mobile360, isMobile: true, hasTouch: true });
  const mobile360Page = await mobileGuest360.newPage();
  await mobile360Page.goto(`${BASE}${targets.release.permalink}`, { waitUntil: 'domcontentloaded' });
  await waitForApp(mobile360Page);
  await expectNoOverflow(mobile360Page, 'mobile release detail 360');
  await shot(mobile360Page, 'mobile-release-detail-360x800.png');

  const summary = {
    ok: true,
    postPermalink: targets.post.permalink,
    releasePermalink: targets.release.permalink,
    artistSlug: targets.artist.slug,
    groupSlug: targets.group.slug,
    labelSlug: targets.label.slug,
    listenerComment,
    artistReply,
    screenshotsDir: SHOTS,
  };

  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
