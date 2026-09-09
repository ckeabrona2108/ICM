import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('response', async (response) => {
  const url = response.url();
  if (url.includes('/api/auth/callback/credentials') || url.includes('/api/auth/session')) {
    let body = '';
    try { body = await response.text(); } catch {}
    console.log(JSON.stringify({ url, status: response.status(), body: body.slice(0, 400) }));
  }
});
await page.goto('http://127.0.0.1:3002/login', { waitUntil: 'domcontentloaded' });
await page.getByLabel('Email').fill('listener.b@local.icm');
await page.getByLabel('Пароль').fill('DevPass123!');
await page.getByRole('button', { name: /Войти/ }).click();
await page.waitForTimeout(5000);
console.log(JSON.stringify({ url: page.url() }, null, 2));
await browser.close();
