import { chromium } from "@playwright/test";
const browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
for (const account of [
  { login: "listener.b@local.icm", password: "DevPass123!" },
  { login: "Mamasita", password: "DevPass123!" },
  { login: "producer.c@local.icm", password: "DevPass123!" },
  { login: "Pulsecraft", password: "DevPass123!" }
]) {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3002/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.getByLabel('Email').fill(account.login);
  await page.getByLabel('Пароль').fill(account.password);
  await page.getByLabel('Пароль').press('Enter');
  await page.waitForTimeout(5000);
  console.log('LOGIN', account.login, 'URL', page.url());
  console.log('TEXT', (await page.locator('body').innerText()).slice(0, 500));
  await page.close();
}
await browser.close();
