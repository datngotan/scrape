import "dotenv/config";

import { runScrapeJob } from "./src/index.js";

async function executeJob() {
  try {
    const { httpStatus, summary } = await runScrapeJob();

    // Printed as a single greppable line (marker prefix, JSON on one line)
    // so the cron wrapper can reliably locate and parse it, regardless of
    // any other braces that may appear elsewhere in the log output.
    console.log(`SCRAPE_SUMMARY_JSON: ${JSON.stringify(summary)}`);

    console.log(
      `[${new Date().toISOString()}]`,
      JSON.stringify(summary, null, 2),
    );

    if (httpStatus >= 400) {
      console.error("Job failed with status:", httpStatus);
    }
  } catch (error) {
    console.error("Fatal scrape error:", error);
  }
}

// Run immediately
executeJob();

// Run every 5 minutes
// setInterval(
//   () => {
//     executeJob();
//   },
//   5 * 60 * 1000
// );