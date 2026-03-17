import { chromium } from "playwright";

function hasExpectedPriceContent(html) {
  const text = String(html || "");
  return (
    text.includes("top-table-chart") &&
    text.includes("1 Lượng") &&
    text.includes("1 Kg")
  );
}

export async function fetchHtml(url, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? options.timeoutMs
    : 60_000;
  const waitMs = Number.isFinite(options.waitMs) ? options.waitMs : 2_500;
  const maxAttempts = Number.isFinite(options.maxAttempts)
    ? options.maxAttempts
    : 3;

  const browser = await chromium.launch({ headless: true });
  try {
    let lastHtml = "";

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const page = await browser.newPage();
      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: timeoutMs,
        });

        // Prefer waiting for the price table; continue with timeout fallback.
        try {
          await page.waitForSelector("#top-table-chart table tbody tr", {
            timeout: 10_000,
          });
        } catch {
          // Fallback below still returns page HTML for parser-level retries/handling.
        }

        if (waitMs > 0) {
          await page.waitForTimeout(waitMs);
        }

        const html = await page.content();
        lastHtml = html;

        if (hasExpectedPriceContent(html) || attempt === maxAttempts) {
          return html;
        }
      } finally {
        await page.close();
      }

      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }

    return lastHtml;
  } finally {
    await browser.close();
  }
}
