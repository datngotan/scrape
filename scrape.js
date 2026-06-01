import "dotenv/config";

import { runScrapeJob } from "./src/index.js";

async function executeJob() {
  try {
    const { httpStatus, summary } = await runScrapeJob();

    console.log(
      `[${new Date().toISOString()}]`,
      JSON.stringify(summary, null, 2)
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
setInterval(
  () => {
    executeJob();
  },
  5 * 60 * 1000
);