import { chromium } from "playwright";

function isTimeoutError(error) {
  const msg = String(error || "");
  return (
    error?.name === "TimeoutError" ||
    msg.includes("Timeout") ||
    msg.includes("timed out")
  );
}

async function gotoWithFallback(page, url, timeoutMs, waitUntil) {
  try {
    await page.goto(url, {
      waitUntil,
      timeout: timeoutMs,
    });
    return;
  } catch (error) {
    if (!isTimeoutError(error) || waitUntil === "commit") {
      throw error;
    }

    // Fallback for sites that keep network activity busy and never reach domcontentloaded.
    await page.goto(url, {
      waitUntil: "commit",
      timeout: Math.max(15_000, Math.round(timeoutMs * 0.5)),
    });
  }
}

function hasExpectedPriceContent(html, url) {
  if (!String(url || "").includes("bacmattrang.com")) {
    return true;
  }

  const text = String(html || "");
  return (
    text.includes("top-table-chart") &&
    text.includes("1 Lượng") &&
    text.includes("1 Kg")
  );
}

function resolveHeadlessMode(options) {
  let headless =
    typeof options.headless === "boolean"
      ? options.headless
      : process.env.PLAYWRIGHT_HEADLESS !== "false";

  const noDisplayOnLinux =
    process.platform === "linux" &&
    !process.env.DISPLAY &&
    !process.env.WAYLAND_DISPLAY;

  // CI Linux runners usually have no X server; force headless to prevent launch crash.
  if (headless === false && noDisplayOnLinux) {
    headless = true;
  }

  return headless;
}

export async function fetchHtml(url, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? options.timeoutMs
    : 60_000;
  const waitMs = Number.isFinite(options.waitMs) ? options.waitMs : 2_500;
  const maxAttempts = Number.isFinite(options.maxAttempts)
    ? options.maxAttempts
    : 3;
  const waitUntil =
    typeof options.waitUntil === "string"
      ? options.waitUntil
      : "domcontentloaded";
  const headless = resolveHeadlessMode(options);

  const viewport =
    options.viewport &&
    Number.isFinite(options.viewport.width) &&
    Number.isFinite(options.viewport.height)
      ? options.viewport
      : { width: 1366, height: 900 };

  const browser = await chromium.launch({
    headless,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-default-browser-check",
      "--disable-dev-shm-usage",
    ],
  });
  try {
    let lastHtml = "";
    const context = await browser.newContext({
      viewport,
      locale: "vi-VN",
      timezoneId: "Asia/Ho_Chi_Minh",
      ignoreHTTPSErrors: options.ignoreHTTPSErrors === true,
      userAgent:
        options.userAgent ||
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      extraHTTPHeaders: {
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const page = await context.newPage();
        try {
          await gotoWithFallback(page, url, timeoutMs, waitUntil);

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

          if (hasExpectedPriceContent(html, url) || attempt === maxAttempts) {
            return html;
          }
        } catch (error) {
          if (attempt === maxAttempts) {
            throw error;
          }
        } finally {
          await page.close();
        }

        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }

      return lastHtml;
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
