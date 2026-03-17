import { chromium } from "playwright";

export async function fetchHtml(url, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? options.timeoutMs
    : 60_000;
  const waitMs = Number.isFinite(options.waitMs) ? options.waitMs : 2_500;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    if (waitMs > 0) {
      await page.waitForTimeout(waitMs);
    }

    return await page.content();
  } finally {
    await browser.close();
  }
}
