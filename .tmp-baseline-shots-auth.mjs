import { chromium } from "@playwright/test";

const BASE = "http://localhost:3002";
const SHOTS = "screenshots/ux-baseline";
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const accounts = {
  artist: { email: "Ckeabrona", password: "DevPass123!" },
  producer: { email: "Pulsecraft", password: "DevPass123!" }
};

async function waitForApp(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function login(page, account) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Пароль').fill(account.password);
  await page.getByLabel('Пароль').press('Enter');
  await page.waitForTimeout(1000);
  if (!/\/dashboard/.test(page.url())) {
    await page.waitForURL(/\/dashboard/, { timeout: 20000 });
  }
  await waitForApp(page);
}

const browser = await chromium.launch({ headless: true, executablePath: chromePath });

const producer = await browser.newContext({ viewport: { width: 1512, height: 982 } });
const producerPage = await producer.newPage();
await login(producerPage, accounts.producer);
await producerPage.goto(`${BASE}/dashboard/messages`, { waitUntil: 'domcontentloaded' });
await waitForApp(producerPage);
await producerPage.screenshot({ path: `${SHOTS}/desktop-messages.png`, fullPage: true });

const artist = await browser.newContext({ viewport: { width: 1512, height: 982 } });
const artistPage = await artist.newPage();
await login(artistPage, accounts.artist);
await artistPage.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
await waitForApp(artistPage);
await artistPage.getByRole('button', { name: 'Открыть уведомления' }).click();
await artistPage.getByText('Уведомления').waitFor({ timeout: 10000 });
await artistPage.screenshot({ path: `${SHOTS}/desktop-notifications.png`, fullPage: true });

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mobilePage = await mobile.newPage();
await login(mobilePage, accounts.producer);
await mobilePage.goto(`${BASE}/dashboard/messages`, { waitUntil: 'domcontentloaded' });
await waitForApp(mobilePage);
await mobilePage.screenshot({ path: `${SHOTS}/mobile-messages.png`, fullPage: true });

await browser.close();
