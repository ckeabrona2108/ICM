import { chromium } from "@playwright/test";
const browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const page = await browser.newPage();
page.on("response", async (response) => {
  const url = response.url();
  if (url.includes("/api/auth") || url.includes("/login")) {
    let body = "";
    try { body = await response.text(); } catch {}
    console.log("RESPONSE", response.status(), url, body.slice(0, 300));
  }
});
page.on("console", (msg) => console.log("CONSOLE", msg.type(), msg.text()));
await page.goto("http://127.0.0.1:3002/login", { waitUntil: "domcontentloaded" });
await page.getByLabel("Email").fill("listener.b@local.icm");
await page.getByLabel("Пароль").fill("WrongPass123!");
await page.getByRole("button", { name: "Войти" }).click();
await page.waitForTimeout(5000);
console.log("URL", page.url());
console.log("BODY", (await page.locator("body").innerText()).slice(0, 1200));
await browser.close();
