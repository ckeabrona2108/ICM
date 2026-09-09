import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3002';
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const account = { email: 'artist.a@local.icm', password: 'DevPass123!' };

async function waitForApp(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  const badResponses = [];

  page.on('pageerror', (error) => {
    pageErrors.push(String(error));
  });

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    consoleErrors.push(text);
  });

  page.on('response', async (response) => {
    const status = response.status();
    if (status < 400) return;
    const request = response.request();
    const resourceType = request.resourceType();
    const url = response.url();
    if (url.includes('/favicon.ico')) return;
    badResponses.push({ url, status, resourceType, method: request.method() });
  });

  const feedResponse = await page.request.get(`${BASE}/api/feed?scope=all&limit=5`);
  const feedData = await feedResponse.json();
  const firstItem = feedData.items?.[0];
  if (!firstItem?.id || !firstItem?.author?.slug || !firstItem?.linkedRelease?.id) {
    throw new Error('Feed fixture item is incomplete');
  }

  const searchResponse = await page.request.get(`${BASE}/api/search?q=ckea`);
  const searchStatus = searchResponse.status();
  const artistsSearchResponse = await page.request.get(`${BASE}/api/artists/search?q=blue`);
  const artistsSearchStatus = artistsSearchResponse.status();

  const publicRoutes = [
    `${BASE}/`,
    `${BASE}/feed`,
    `${BASE}${firstItem.permalink}`,
    `${BASE}/artists/${firstItem.author.slug}`,
    `${BASE}/scene?releaseId=${firstItem.linkedRelease.id}`,
    `${BASE}/login`,
  ];

  for (const url of publicRoutes) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForApp(page);
  }

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').waitFor({ timeout: 15000 });
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Пароль').fill(account.password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
  await waitForApp(page);

  const authedRoutes = [
    `${BASE}/dashboard`,
    `${BASE}/dashboard/profile`,
    `${BASE}/dashboard/playlists`,
    `${BASE}/dashboard/releases`,
    `${BASE}/dashboard/messages`,
  ];

  for (const url of authedRoutes) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForApp(page);
  }

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await page.getByRole('button', { name: 'Открыть уведомления' }).click();
  await page.getByText('Уведомления').waitFor({ timeout: 10000 });

  const apiSnapshot = await page.evaluate(async () => {
    const [playlists, notifications, messages] = await Promise.all([
      fetch('/api/playlists'),
      fetch('/api/dashboard/notifications'),
      fetch('/api/messages'),
    ]);
    return {
      playlists: { status: playlists.status, ok: playlists.ok },
      notifications: { status: notifications.status, ok: notifications.ok },
      messages: { status: messages.status, ok: messages.ok },
    };
  });

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await page.getByRole('button', { name: 'Выход' }).first().click();
  await page.waitForURL(/\/login$|127\.0\.0\.1:3002\/|localhost:3002\//, { timeout: 20000 });
  await waitForApp(page);
  await page.getByRole('link', { name: 'Войти' }).waitFor({ timeout: 10000 });

  console.log(JSON.stringify({
    publicItemId: firstItem.id,
    releaseId: firstItem.linkedRelease.id,
    artistSlug: firstItem.author.slug,
    searchStatus,
    artistsSearchStatus,
    apiSnapshot,
    pageErrors,
    consoleErrors,
    badResponses,
  }, null, 2));

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
