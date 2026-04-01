import { fetchHtml } from '../src/fetch.js';
import { CHIEN_MINH_SOURCES } from '../src/sources/gold/chien_minh.js';

const payload = await fetchHtml('https://www.vangchienminh.vn/', {
  timeoutMs: 90_000,
  waitMs: 8_000,
  maxAttempts: 3,
  waitUntil: 'commit',
});

for (const source of CHIEN_MINH_SOURCES) {
  const out = await source.parse(payload);
  console.log(`${source.id}|${out.buy}|${out.sell}|${source.unit}|${out.lastUpdateText}`);
}
