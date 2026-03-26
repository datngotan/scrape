import "dotenv/config";

import { runScrapeJob } from "./src/index.js";

async function main() {
  const { httpStatus, summary } = await runScrapeJob();
  console.log(JSON.stringify(summary, null, 2));

  if (httpStatus >= 400) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Fatal scrape error:", error);
  process.exit(1);
});
