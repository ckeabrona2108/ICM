import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3002';
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const accounts = {
  artist: { email: 'artist.a@local.icm', password: 'DevPass123!', name: 'Ckeabrona' },
  listener: { email: 'listener.b@local.icm', password: 'DevPass123!', name: 'Mamasita' },
  producer: { email: 'producer.c@local.icm', password: 'DevPass123!', name: 'Pulsecraft' }
};

async function waitForApp(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function login(page, account) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Пароль').fill(account.password);
  await page.getByLabel('Пароль').press('Enter');
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
  await waitForApp(page);
}

async function logout(page) {
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await page.getByRole('button', { name: 'Выход' }).click();
  await page.waitForURL(/\/login/, { timeout: 15000 });
  await waitForApp(page);
  await page.goto(`${BASE}/feed`, { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
}

async function expectInvalidPasswordFeedback(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.getByLabel('Email').fill(accounts.listener.email);
  await page.getByLabel('Пароль').fill('WrongPass123!');
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByText('Неверный email или пароль').waitFor({ timeout: 15000 });
}

async function openNotifications(page) {
  const bell = page.getByRole('button', { name: 'Открыть уведомления' });
  await bell.click();
  await page.getByText('Уведомления').waitFor({ timeout: 10000 });
}

function directMessagesPanel(page) {
  return page.locator('section').filter({ hasText: 'Личные сообщения' }).first();
}

async function sendDirectMessageInPanel(page, body) {
  const panel = directMessagesPanel(page);
  const input = panel.getByPlaceholder('Введите сообщение');
  await input.waitFor({ timeout: 15000 });
  await input.fill(body);
  await input.press('Enter');
  await panel.locator('p').filter({ hasText: body }).last().waitFor({ timeout: 10000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });

  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const guestPage = await guestContext.newPage();
  await guestPage.goto(`${BASE}/feed`, { waitUntil: 'domcontentloaded' });
  await waitForApp(guestPage);
  await guestPage.getByRole('button', { name: 'Подписаться' }).first().click();
  await guestPage.getByText('Публичная лента открыта для чтения').waitFor({ timeout: 10000 });
  await expectInvalidPasswordFeedback(guestPage);

  const listenerContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const listenerPage = await listenerContext.newPage();
  await login(listenerPage, accounts.listener);
  await listenerPage.goto(`${BASE}/feed`, { waitUntil: 'domcontentloaded' });
  await waitForApp(listenerPage);
  await listenerPage.getByLabel('Глобальный поиск').fill('Aurora');
  await listenerPage.getByText('Группы').waitFor({ timeout: 10000 });
  await listenerPage.getByRole('link', { name: /Aurora Signals/i }).first().waitFor({ timeout: 10000 });
  await listenerPage.getByLabel('Глобальный поиск').fill('');

  const feedArticle = listenerPage.locator('article').filter({ hasText: 'Последний танец' }).first();
  await feedArticle.getByRole('button', { name: 'Комментарии' }).click();
  const commentText = `Smoke comment ${Date.now()}`;
  await feedArticle.getByPlaceholder('Напишите комментарий').fill(commentText);
  await feedArticle.locator('form button[type="submit"]').last().click();
  await feedArticle.getByText(commentText).waitFor({ timeout: 10000 });

  const followButton = feedArticle.getByRole('button', { name: /Подписаться|Вы подписаны/ }).first();
  const beforeFollowText = await followButton.textContent();
  if (/Вы подписаны/.test(beforeFollowText ?? '')) {
    await followButton.click();
    await listenerPage.waitForTimeout(400);
  }
  await feedArticle.getByRole('button', { name: /Подписаться|Вы подписаны/ }).first().click();
  await feedArticle.getByRole('button', { name: /Вы подписаны/ }).waitFor({ timeout: 10000 });

  await feedArticle.getByRole('button', { name: 'Открыть реакции' }).click();
  const reactionMenu = listenerPage.getByRole('menu', { name: 'Выбор реакции' });
  await reactionMenu.waitFor({ timeout: 10000 });
  await reactionMenu.locator('button').nth(1).click();
  await feedArticle.getByRole('button', { name: 'Открыть реакции' }).click();
  await reactionMenu.waitFor({ timeout: 10000 });
  await reactionMenu.locator('button').nth(3).click();
  await feedArticle.getByRole('button', { name: 'Открыть реакции' }).click();
  await reactionMenu.waitFor({ timeout: 10000 });
  const reactionPressedAfterChange = await reactionMenu.locator('button').nth(3).getAttribute('aria-pressed');
  console.log('reactionPressedAfterChange', reactionPressedAfterChange);

  await listenerPage.reload({ waitUntil: 'domcontentloaded' });
  await waitForApp(listenerPage);
  const reloadedArticle = listenerPage.locator('article').filter({ hasText: 'Последний танец' }).first();
  await reloadedArticle.getByRole('button', { name: 'Комментарии' }).click();
  await reloadedArticle.getByText(commentText).waitFor({ timeout: 10000 });
  await reloadedArticle.getByRole('button', { name: /Вы подписаны/ }).waitFor({ timeout: 10000 });
  await reloadedArticle.getByRole('button', { name: 'Открыть реакции' }).click();
  const reloadedReactionMenu = listenerPage.getByRole('menu', { name: 'Выбор реакции' });
  await reloadedReactionMenu.waitFor({ timeout: 10000 });
  const reactionPressedAfterReload = await reloadedReactionMenu.locator('button').nth(3).getAttribute('aria-pressed');
  console.log('reactionPressedAfterReload', reactionPressedAfterReload);

  const listenerTab = await listenerContext.newPage();
  await listenerTab.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await waitForApp(listenerTab);
  await listenerTab.waitForURL(/\/dashboard/, { timeout: 10000 });
  await assert.equal(await listenerTab.getByRole('link', { name: 'Войти' }).count(), 0);
  await logout(listenerPage);
  await listenerPage.getByRole('link', { name: 'Войти' }).waitFor({ timeout: 10000 });
  await listenerPage.getByRole('link', { name: 'Создать аккаунт' }).waitFor({ timeout: 10000 });

  const producerContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const producerPage = await producerContext.newPage();
  await login(producerPage, accounts.producer);
  await producerPage.goto(`${BASE}/feed`, { waitUntil: 'domcontentloaded' });
  await waitForApp(producerPage);
  await producerPage.getByLabel('Глобальный поиск').fill('Ckeabrona');
  await producerPage.getByText('Артисты').waitFor({ timeout: 10000 });
  await producerPage.getByRole('link', { name: /Ckeabrona/i }).first().click();
  await producerPage.waitForURL(/\/artists\//, { timeout: 15000 });
  await waitForApp(producerPage);
  await producerPage.getByRole('link', { name: 'Связаться' }).click();
  await producerPage.waitForURL(/\/dashboard\/messages/, { timeout: 15000 });
  await waitForApp(producerPage);
  await directMessagesPanel(producerPage).getByText('Ckeabrona').first().waitFor({ timeout: 15000 });
  const producerMessage = `Producer ping ${Date.now()}`;
  await sendDirectMessageInPanel(producerPage, producerMessage);
  await producerPage.reload({ waitUntil: 'domcontentloaded' });
  await waitForApp(producerPage);
  await directMessagesPanel(producerPage).locator('p').filter({ hasText: producerMessage }).last().waitFor({ timeout: 10000 });

  const artistContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const artistPage = await artistContext.newPage();
  await login(artistPage, accounts.artist);
  await artistPage.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await waitForApp(artistPage);
  await openNotifications(artistPage);
  const artistNotification = artistPage.getByRole('link', { name: /Новое личное сообщение/i }).first();
  await artistNotification.waitFor({ timeout: 10000 });
  await artistNotification.click();
  await artistPage.waitForURL(/\/dashboard\/messages\?conversationId=/, { timeout: 15000 });
  await waitForApp(artistPage);
  await directMessagesPanel(artistPage).locator('p').filter({ hasText: producerMessage }).last().waitFor({ timeout: 10000 });
  await openNotifications(artistPage);
  const artistReadNotification = artistPage.locator('a').filter({ hasText: producerMessage }).first();
  await artistReadNotification.waitFor({ timeout: 10000 });
  assert.equal(await artistReadNotification.locator('.bg-emerald-400').count(), 0);
  await artistPage.goto(artistPage.url(), { waitUntil: 'domcontentloaded' });
  await waitForApp(artistPage);
  await directMessagesPanel(artistPage).getByRole('button', { name: /Pulsecraft/i }).first().waitFor({ timeout: 10000 });
  const artistReply = `Artist reply ${Date.now()}`;
  await sendDirectMessageInPanel(artistPage, artistReply);

  await producerPage.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await waitForApp(producerPage);
  await openNotifications(producerPage);
  const producerNotification = producerPage.getByRole('link', { name: /Новое личное сообщение/i }).first();
  await producerNotification.waitFor({ timeout: 10000 });
  await producerNotification.click();
  await producerPage.waitForURL(/\/dashboard\/messages\?conversationId=/, { timeout: 15000 });
  await waitForApp(producerPage);
  await directMessagesPanel(producerPage).locator('p').filter({ hasText: artistReply }).last().waitFor({ timeout: 10000 });

  console.log(JSON.stringify({ ok: true, commentText, producerMessage, artistReply, reactionPressedAfterChange, reactionPressedAfterReload }, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
