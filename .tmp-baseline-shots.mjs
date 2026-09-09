import { chromium } from "@playwright/test";
import fs from "node:fs/promises";

const BASE = "http://127.0.0.1:3002";
const SHOTS = "screenshots/ux-baseline";
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const accounts = {
  artist: { email: "artist.a@local.icm", password: "DevPass123!" },
  producer: { email: "producer.c@local.icm", password: "DevPass123!" }
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
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
  await waitForApp(page);
}

async function shot(page, name, fullPage = false) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
}

const browser = await chromium.launch({ headless: true, executablePath: chromePath });
await fs.mkdir(SHOTS, { recursive: true });

const desktop = await browser.newContext({ viewport: { width: 1512, height: 982 } });
const desktopPage = await desktop.newPage();
await desktopPage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await waitForApp(desktopPage);
await shot(desktopPage, 'desktop-home');

await desktopPage.goto(`${BASE}/feed`, { waitUntil: 'domcontentloaded' });
await waitForApp(desktopPage);
await shot(desktopPage, 'desktop-feed');
await desktopPage.getByLabel('Глобальный поиск').fill('Cke');
await desktopPage.getByText('Артисты').waitFor({ timeout: 10000 });
await shot(desktopPage, 'desktop-search-dropdown');
await desktopPage.locator("a[href^='/artists/']").first().click({ force: true });
await desktopPage.waitForURL(/\/artists\//, { timeout: 15000 });
await waitForApp(desktopPage);
await shot(desktopPage, 'desktop-artist-profile', true);

await desktopPage.goto(`${BASE}/feed`, { waitUntil: 'domcontentloaded' });
await waitForApp(desktopPage);
const releaseArticle = desktopPage.locator('article').filter({ hasText: 'РЕЛИЗ' }).first();
await releaseArticle.getByRole('link', { name: 'Открыть' }).click();
await desktopPage.waitForURL(/\/feed\//, { timeout: 15000 });
await waitForApp(desktopPage);
await shot(desktopPage, 'desktop-release-detail', true);

await desktopPage.goto(`${BASE}/feed`, { waitUntil: 'domcontentloaded' });
await waitForApp(desktopPage);
const postArticle = desktopPage.locator('article').filter({ hasNotText: 'РЕЛИЗ' }).first();
await postArticle.getByRole('link', { name: 'Открыть' }).click();
await desktopPage.waitForURL(/\/feed\//, { timeout: 15000 });
await waitForApp(desktopPage);
await shot(desktopPage, 'desktop-post-detail', true);

const producerContext = await browser.newContext({ viewport: { width: 1512, height: 982 } });
const producerPage = await producerContext.newPage();
await login(producerPage, accounts.producer);
await producerPage.goto(`${BASE}/dashboard/messages`, { waitUntil: 'domcontentloaded' });
await waitForApp(producerPage);
await shot(producerPage, 'desktop-messages');

const artistContext = await browser.newContext({ viewport: { width: 1512, height: 982 } });
const artistPage = await artistContext.newPage();
await login(artistPage, accounts.artist);
await artistPage.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
await waitForApp(artistPage);
await artistPage.getByRole('button', { name: 'Открыть уведомления' }).click();
await artistPage.getByText('Уведомления').waitFor({ timeout: 10000 });
await shot(artistPage, 'desktop-notifications');

const mobile = await browser.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true });
const mobilePage = await mobile.newPage();
await mobilePage.goto(`${BASE}/feed`, { waitUntil: 'domcontentloaded' });
await waitForApp(mobilePage);
await shot(mobilePage, 'mobile-feed', true);
await mobilePage.getByLabel('Глобальный поиск').fill('Cke');
await mobilePage.getByText('Артисты').waitFor({ timeout: 10000 });
await shot(mobilePage, 'mobile-search', true);
await mobilePage.locator("a[href^='/artists/']").first().click({ force: true });
await mobilePage.waitForURL(/\/artists\//, { timeout: 15000 });
await waitForApp(mobilePage);
await shot(mobilePage, 'mobile-profile', true);

const mobileProducer = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mobileProducerPage = await mobileProducer.newPage();
await login(mobileProducerPage, accounts.producer);
await mobileProducerPage.goto(`${BASE}/dashboard/messages`, { waitUntil: 'domcontentloaded' });
await waitForApp(mobileProducerPage);
await shot(mobileProducerPage, 'mobile-messages', true);

await browser.close();
