import { createClient } from "@supabase/supabase-js";

import { GOLD_TABLE, SOURCES, tableForSourceId } from "./config.js";
import { fetchHtml } from "./fetch.js";
import { buildRowOrNull } from "./row.js";

// ---------------------------------------------------------------------------
// Row / table grouping helpers
// ---------------------------------------------------------------------------

const TABLE_ROW_TRANSFORMERS = new Map([
  [
    GOLD_TABLE,
    (row) => {
      const { unit, ...rest } = row;
      return rest;
    },
  ],
]);

function transformRowForTable(tableName, row) {
  const transformer = TABLE_ROW_TRANSFORMERS.get(tableName);
  return transformer ? transformer(row) : row;
}

function groupSucceededRowsByTable(succeeded) {
  const tableToRows = new Map();

  for (const item of succeeded) {
    const tableName = tableForSourceId(item.id);
    const bucket = tableToRows.get(tableName) ?? [];
    bucket.push(transformRowForTable(tableName, item.row));
    tableToRows.set(tableName, bucket);
  }

  return tableToRows;
}

// Only the rows whose key is present in `changedKeys` were actually written
// to the DB, so the summary should reflect exactly those, not every
// succeeded source.
function buildUpsertedIdsForTable(succeeded, tableName, changedKeys, hasUnit) {
  return succeeded
    .filter((item) => tableForSourceId(item.id) === tableName)
    .filter((item) => changedKeys.has(makeRowKey(item.row, hasUnit)))
    .map((item) => `${item.id}:${item.row.unit}`);
}

function makeRowKey(row, hasUnit) {
  return hasUnit && row.unit != null ? `${row.id}:${row.unit}` : row.id;
}

function dedupeRowsByUpsertKey(rows) {
  if (rows.length === 0) return rows;

  const hasUnit = rows.some((row) => "unit" in row);

  // Keep the latest row for each logical key within this request.
  const byKey = new Map();
  for (const row of rows) {
    byKey.set(makeRowKey(row, hasUnit), row);
  }

  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// REST sync (patches upserted rows to an external REST API)
// ---------------------------------------------------------------------------

function endpointForTable(tableName) {
  if (tableName === GOLD_TABLE) return "gold_prices";
  return "silver_prices";
}

function toRestPayload(row) {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== undefined),
  );
}

function emptyRestSyncResult() {
  return { attempted: 0, patched: 0, failed: [] };
}

function buildAllFailedRestSyncResult(rows, errorMessage) {
  return {
    attempted: rows.length,
    patched: 0,
    failed: rows.map((row) => ({ id: row.id, error: errorMessage })),
  };
}

async function patchRowsToRestApi(tableName, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return emptyRestSyncResult();
  }

  const restBaseUrl = (process.env.REST_SYNC_BASE_URL || "").trim();
  const restToken = (process.env.REST_SYNC_BEARER_TOKEN || "").trim();

  if (!restBaseUrl || !restToken) {
    return buildAllFailedRestSyncResult(
      rows,
      "Missing REST_SYNC_BASE_URL or REST_SYNC_BEARER_TOKEN",
    );
  }

  const endpoint = endpointForTable(tableName);
  const base = restBaseUrl.replace(/\/+$/, "");

  const url = `${base}/rest/${endpoint}`;
  const payload = rows.map((row) => toRestPayload(row));

  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${restToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      return buildAllFailedRestSyncResult(
        rows,
        `HTTP ${response.status}${bodyText ? `: ${bodyText}` : ""}`,
      );
    }

    const responseBody = await response.json().catch(() => null);
    const failed = Array.isArray(responseBody?.failed)
      ? responseBody.failed
          .filter((item) => item && item.id)
          .map((item) => ({
            id: item.id,
            error: item.error ? String(item.error) : "Unknown error",
          }))
      : [];

    const patched =
      typeof responseBody?.patched === "number"
        ? responseBody.patched
        : rows.length - failed.length;

    return {
      attempted: rows.length,
      patched,
      failed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return buildAllFailedRestSyncResult(rows, message);
  }
}

// ---------------------------------------------------------------------------
// Supabase persistence
// ---------------------------------------------------------------------------

// Fields that represent the actual scraped data. A row is only considered
// "changed" (and therefore worth writing) when one of these differs from
// what's already stored. `updated_at` is deliberately excluded because it is
// always the current timestamp and would otherwise make every row look
// changed on every run.
const COMPARABLE_ROW_FIELDS = [
  "buy_price",
  "sell_price",
  "store_name",
  "source_name",
  "source_url",
  "location",
];

function diffRowFields(row, old) {
  const changes = [];
  for (const field of COMPARABLE_ROW_FIELDS) {
    if (row[field] !== old[field]) {
      changes.push({ field, oldValue: old[field], newValue: row[field] });
    }
  }
  return changes;
}

function formatChangeValue(value) {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

function logRowChanges(table, changeLogs) {
  for (const entry of changeLogs) {
    if (entry.isNew) {
      console.log(`=== NEW ROW [Table: ${table}, Key: ${entry.key}] ===`);
      continue;
    }

    console.log(`=== CHANGE DETECTED [Table: ${table}, Key: ${entry.key}] ===`);
    for (const { field, oldValue, newValue } of entry.fields) {
      console.log(
        `  ${field}: ${formatChangeValue(oldValue)} -> ${formatChangeValue(newValue)}`,
      );
    }
  }
}

// Compares incoming rows against what's currently stored and returns only the
// rows that actually need to be written (new rows, or rows with at least one
// changed field from COMPARABLE_ROW_FIELDS). Also computes buy_change/
// sell_change and collects human-readable change logs for auditing.
async function analyzeRowChanges(supabase, table, rows, hasUnit) {
  if (rows.length === 0) {
    return { rowsToUpsert: [], changedKeys: new Set(), changeLogs: [] };
  }

  const ids = [...new Set(rows.map((r) => r.id))];
  const selectCols =
    "id, buy_price, sell_price, buy_change, sell_change, store_name, source_name, source_url, location" +
    (hasUnit ? ", unit" : "");
  const { data: existing, error } = await supabase
    .from(table)
    .select(selectCols)
    .in("id", ids);

  if (error || !existing) {
    // Unknown prior state: treat every row as changed so nothing is silently
    // dropped.
    const changedKeys = new Set(rows.map((row) => makeRowKey(row, hasUnit)));
    const rowsToUpsert = rows.map((row) => ({
      ...row,
      buy_change: null,
      sell_change: null,
    }));
    return { rowsToUpsert, changedKeys, changeLogs: [] };
  }

  const existingMap = new Map(existing.map((r) => [makeRowKey(r, hasUnit), r]));

  const changedKeys = new Set();
  const changeLogs = [];
  const rowsToUpsert = [];

  for (const row of rows) {
    const key = makeRowKey(row, hasUnit);
    const old = existingMap.get(key);

    if (!old) {
      changedKeys.add(key);
      changeLogs.push({ key, isNew: true, fields: [] });
      rowsToUpsert.push({ ...row, buy_change: null, sell_change: null });
      continue;
    }

    const fieldChanges = diffRowFields(row, old);
    if (fieldChanges.length === 0) {
      // Identical to what's stored: skip this row entirely (no DB write, no
      // REST sync).
      continue;
    }

    changedKeys.add(key);
    changeLogs.push({ key, isNew: false, fields: fieldChanges });

    const buyChanged = row.buy_price !== old.buy_price;
    const sellChanged = row.sell_price !== old.sell_price;

    rowsToUpsert.push({
      ...row,
      buy_change: buyChanged
        ? row.buy_price - old.buy_price
        : (old.buy_change ?? null),
      sell_change: sellChanged
        ? row.sell_price - old.sell_price
        : (old.sell_change ?? null),
    });
  }

  return { rowsToUpsert, changedKeys, changeLogs };
}

async function persistRowsByTable(supabase, succeeded) {
  const tableToRows = groupSucceededRowsByTable(succeeded);
  const upsertedIds = [];
  const dbErrors = [];
  const restSync = {
    gold: emptyRestSyncResult(),
    silver: emptyRestSyncResult(),
  };
  const changeSummary = { changed: 0, unchanged: 0 };

  for (const [table, tableRows] of tableToRows.entries()) {
    const dedupedRows = dedupeRowsByUpsertKey(tableRows);
    // Check every row, not just the first: a table whose rows are ever a mix
    // of "has unit" / "no unit" would otherwise get inconsistent row keys,
    // which can cause a real change to miss its prior row in `existingMap`
    // (it still gets written, but is silently misclassified as "new" instead
    // of "changed", losing the diff log and buy_change/sell_change delta).
    const hasUnit = dedupedRows.some((row) => "unit" in row);

    const { rowsToUpsert, changedKeys, changeLogs } = await analyzeRowChanges(
      supabase,
      table,
      dedupedRows,
      hasUnit,
    );

    logRowChanges(table, changeLogs);

    changeSummary.changed += rowsToUpsert.length;
    changeSummary.unchanged += dedupedRows.length - rowsToUpsert.length;

    if (rowsToUpsert.length === 0) {
      console.log(
        `=== SUPABASE UPSERT SKIPPED [Table: ${table}] no changes detected (${dedupedRows.length} row(s) unchanged) ===`,
      );
      continue;
    }

    const { error } = await supabase.from(table).upsert(rowsToUpsert);
    if (error) {
      dbErrors.push(`${table}: ${error.message}`);
      console.error(
        `=== SUPABASE UPSERT ERROR [Table: ${table}] ===`,
        error.message,
      );
      continue;
    }

    upsertedIds.push(
      ...buildUpsertedIdsForTable(succeeded, table, changedKeys, hasUnit),
    );

    // Only the rows we just upserted (i.e. rows that actually changed) need
    // to be synced to the REST API — no separate filtering needed.
    let syncResult;
    try {
      syncResult = await patchRowsToRestApi(table, rowsToUpsert);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      syncResult = buildAllFailedRestSyncResult(rowsToUpsert, message);
    }

    if (table === GOLD_TABLE) {
      restSync.gold = syncResult;
    } else {
      restSync.silver = syncResult;
    }

    if (syncResult.failed.length > 0) {
      console.error(
        `=== REST API PATCH ERROR [Table: ${table}, Endpoint: ${endpointForTable(table)}] ===`,
        JSON.stringify(syncResult.failed, null, 2),
      );
    } else if (syncResult.attempted > 0) {
      console.log(
        `=== REST API PATCH OK [Table: ${table}, Endpoint: ${endpointForTable(table)}] ${syncResult.patched}/${syncResult.attempted}`,
      );
    }
  }

  console.log(
    `=== CHANGE SUMMARY === changed=${changeSummary.changed} unchanged=${changeSummary.unchanged}`,
  );

  return {
    upsertedIds,
    restSync,
    changeSummary,
    dbError: dbErrors.length > 0 ? dbErrors.join(" | ") : null,
  };
}

// ---------------------------------------------------------------------------
// Source fetching / parsing
// ---------------------------------------------------------------------------

function normalizeUrlForCache(rawUrl) {
  const trimmed = String(rawUrl || "").trim();
  try {
    const u = new URL(trimmed);

    u.hash = "";

    const params = [...u.searchParams.entries()].sort(
      (a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]),
    );
    u.search = "";
    for (const [k, v] of params) u.searchParams.append(k, v);

    return u.toString();
  } catch {
    return trimmed;
  }
}

function buildFailedSourceResult(source, stage, errorMessage) {
  return {
    status: "failed",
    id: source.id,
    name: source.name,
    storeName: source.storeName,
    url: source.webUrl ?? source.url,
    stage,
    error: errorMessage,
  };
}

async function processSource(source, getSharedPayload) {
  const TIMEOUT_MS = 100_000;

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error("Processing timeout after 100s")),
      TIMEOUT_MS,
    ),
  );

  try {
    const result = await Promise.race([
      (async () => {
        let payload;

        try {
          payload = await getSharedPayload(source);
        } catch (error) {
          return buildFailedSourceResult(source, "fetch", String(error));
        }

        let parsed;
        try {
          parsed = await source.parse(payload);
        } catch (error) {
          return buildFailedSourceResult(source, "parse", String(error));
        }

        let row;
        try {
          row = buildRowOrNull(source, parsed);
        } catch (error) {
          return buildFailedSourceResult(source, "build", String(error));
        }

        if (!row) {
          return {
            status: "skipped",
            id: source.id,
            name: source.name,
            storeName: source.storeName,
            url: source.webUrl ?? source.url,
            reason: "null_prices",
            parsed: {
              buy: parsed.buy ?? null,
              sell: parsed.sell ?? null,
              lastUpdateText: String(parsed.lastUpdateText ?? ""),
              unit: parsed.unit ?? source.unit,
            },
          };
        }

        return {
          status: "ok",
          id: source.id,
          name: source.name,
          row,
        };
      })(),
      timeoutPromise,
    ]);

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return buildFailedSourceResult(source, "timeout", message);
  }
}

// ---------------------------------------------------------------------------
// Run summary logging / checks
// ---------------------------------------------------------------------------

// Groups every result by store and reports, at the store level, how many
// stores are fully OK vs. how many have at least one failed product. Each
// failed store is logged as a single line listing its failed products, so
// the failure surface is scannable at a glance instead of two log lines per
// failed product.
function summarizeByStore(succeeded, skipped, failed) {
  const storeNames = new Set();
  const failedProductsByStore = new Map();

  for (const item of succeeded) storeNames.add(item.row.store_name);
  for (const item of skipped) storeNames.add(item.storeName);
  for (const item of failed) {
    storeNames.add(item.storeName);
    const products = failedProductsByStore.get(item.storeName) ?? [];
    products.push(item);
    failedProductsByStore.set(item.storeName, products);
  }

  return {
    totalStores: storeNames.size,
    failedStoreCount: failedProductsByStore.size,
    successStoreCount: storeNames.size - failedProductsByStore.size,
    failedProductsByStore,
  };
}

function logStoreSummary(succeeded, skipped, failed) {
  const {
    totalStores,
    successStoreCount,
    failedStoreCount,
    failedProductsByStore,
  } = summarizeByStore(succeeded, skipped, failed);

  console.log(
    `=== STORE SUMMARY === success=${successStoreCount} failed=${failedStoreCount} total=${totalStores}`,
  );

  for (const [storeName, items] of failedProductsByStore.entries()) {
    const products = items
      .map((item) => `${item.name ?? item.id} (${item.stage}: ${item.error})`)
      .join(", ");
    console.error(`=== FAILED STORE [${storeName}] === ${products}`);
  }
}

function logSkippedSources(skipped) {
  if (skipped.length === 0) return;
  console.warn("=== SKIPPED SOURCES (null prices) ===");
  for (const item of skipped) {
    console.warn(`[${item.id}] url=${item.url}`);
    console.warn(
      `  parsed: buy=${item.parsed.buy} sell=${item.parsed.sell} unit=${item.parsed.unit} updated="${item.parsed.lastUpdateText}"`,
    );
  }
}

function logSucceededSources(succeeded) {
  if (succeeded.length === 0) return;
  console.log(`=== OK (${succeeded.length}) ===`);
  for (const item of succeeded) {
    console.log(
      `[${item.id}] buy=${item.row.buy_price} sell=${item.row.sell_price} unit=${item.row.unit} updated="${item.row.last_update_at}"`,
    );
  }
}

function checkSourceUrls(rows) {
  const missingIds = rows
    .filter((row) => !row.source_url || !row.source_url.trim())
    .map((row) => `${row.id}:${row.unit}`);

  if (missingIds.length > 0) {
    console.error(`=== MISSING source_url: ${missingIds.join(", ")}`);
  } else {
    console.log(`=== source_url check passed (${rows.length}/${rows.length})`);
  }

  return {
    totalRows: rows.length,
    missingCount: missingIds.length,
    missingIds,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runScrapeJob(options = {}) {
  const sourceList = Array.isArray(options.sources) ? options.sources : SOURCES;
  const persist = options.persist !== false;

  if (sourceList.length === 0) {
    return {
      httpStatus: 200,
      summary: {
        ok: true,
        message: "No sources configured",
        upserted: [],
      },
    };
  }

  const payloadCache = new Map();
  const getSharedPayload = (source) => {
    const requestUrl = source.url.trim();
    const key = normalizeUrlForCache(requestUrl);
    const cached = payloadCache.get(key);
    if (cached) return cached;

    const requestPromise = fetchHtml(requestUrl, source.fetchOptions ?? {});

    payloadCache.set(key, requestPromise);
    return requestPromise;
  };

  const results = await Promise.all(
    sourceList.map((source) => processSource(source, getSharedPayload)),
  );

  const succeeded = results.filter((r) => r.status === "ok");
  const skipped = results.filter((r) => r.status === "skipped");
  const failed = results.filter((r) => r.status === "failed");

  logStoreSummary(succeeded, skipped, failed);
  logSkippedSources(skipped);
  logSucceededSources(succeeded);

  let dbError = null;
  const upsertedIds = [];
  const restSync = {
    gold: emptyRestSyncResult(),
    silver: emptyRestSyncResult(),
  };
  let sourceUrlCheck = {
    totalRows: 0,
    missingCount: 0,
    missingIds: [],
  };
  let changeSummary = { changed: 0, unchanged: 0 };

  if (succeeded.length > 0 && persist) {
    const rows = succeeded.map((s) => s.row);

    sourceUrlCheck = checkSourceUrls(rows);

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRole) {
      dbError =
        "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY";
      console.error("=== DB CONFIG ERROR ===", dbError);
    } else {
      const supabase = createClient(supabaseUrl, serviceRole);
      const persisted = await persistRowsByTable(supabase, succeeded);
      upsertedIds.push(...persisted.upsertedIds);
      restSync.gold = persisted.restSync.gold;
      restSync.silver = persisted.restSync.silver;
      changeSummary = persisted.changeSummary;
      dbError = persisted.dbError;
    }
  }

  const summary = {
    ok: dbError === null,
    upserted: upsertedIds,
    changeSummary,
    skipped: skipped.map((item) => ({
      id: item.id,
      url: item.url,
      reason: item.reason,
      parsed: item.parsed,
    })),
    failed: failed.map((item) => ({
      id: item.id,
      url: item.url,
      stage: item.stage,
      error: item.error,
    })),
    sourceUrlCheck,
    restSync,
    ...(dbError ? { dbError } : {}),
  };

  const httpStatus =
    upsertedIds.length > 0 ? 200 : failed.length > 0 ? 207 : 422;

  console.log(
    `=== RUN SUMMARY === upserted=${upsertedIds.length} changed=${changeSummary.changed} unchanged=${changeSummary.unchanged} skipped=${skipped.length} failed=${failed.length}`,
  );

  return { httpStatus, summary, results };
}
