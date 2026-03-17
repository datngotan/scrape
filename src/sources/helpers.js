import * as cheerio from "cheerio";

export function parseBySelectors(selectors) {
  return (html) => {
    const $ = cheerio.load(html);
    const values = [];

    for (const selector of selectors) {
      $(selector).each((_, el) => {
        const text = $(el).text().trim();
        if (text) values.push(text);
      });

      if (values.length > 0) break;
    }

    return { prices: values };
  };
}
