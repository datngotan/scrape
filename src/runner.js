import { fetchHtml } from "./fetch.js";
import { runScrapeJob } from "./index.js";

export async function scrapeSources(sources, options = {}) {
  const sourceIds = options.sourceIds;
  const selected =
    Array.isArray(sourceIds) && sourceIds.length > 0
      ? sources.filter((source) => sourceIds.includes(source.id))
      : sources;

  const { results } = await runScrapeJob({ sources: selected, persist: false });
  return results;
}

export async function fetchHtmlFromUrl(url) {
  return fetchHtml(url);
}
