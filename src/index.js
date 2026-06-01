import { createClient } from "@supabase/supabase-js";

import { GOLD_TABLE, SOURCES, tableForSourceId } from "./config.js";
import { fetchHtml } from "./fetch.js";
import { buildRowOrNull } from "./row.js";

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

function buildUpsertedIdsForTable(succeeded, tableName) {
  return succeeded
    .filter((item) => tableForSourceId(item.id) === tableName)
    .map((item) => `${item.id}:${item.row.unit}`);
}

function dedupeRowsByUpsertKey(rows) {
  if (rows.length === 0) return rows;

  const hasUnit = "unit" in rows[0];
  const keyFor = (row) =>
    hasUnit && row.unit != null ? `${row.id}:${row.unit}` : row.id;

  // Keep the latest row for each logical key within this request.
  const byKey = new Map();
  for (const row of rows) {
    byKey.set(keyFor(row), row);
  }

  return [...byKey.values()];
}

function endpointForTable(tableName) {
  if (tableName === GOLD_TABLE) return "gold_prices";
  return "silver_prices";
}

function toRestPayload(row) {
  return row;
}

async function patchRowsToRestApi(tableName, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { attempted: 0, patched: 0, failed: [] };
  }

  const restBaseUrl = (process.env.REST_SYNC_BASE_URL || "").trim();
  const restToken = (process.env.REST_SYNC_BEARER_TOKEN || "").trim();

  if (!restBaseUrl || !restToken) {
    return {
      attempted: rows.length,
      patched: 0,
      failed: rows.map((row) => ({
        id: row.id,
        error: "Missing REST_SYNC_BASE_URL or REST_SYNC_BEARER_TOKEN",
      })),
    };
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
      return {
        attempted: rows.length,
        patched: 0,
        failed: rows.map((row) => ({
          id: row.id,
          error: `HTTP ${response.status}${bodyText ? `: ${bodyText}` : ""}`,
        })),
      };
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
    return {
      attempted: rows.length,
      patched: 0,
      failed: rows.map((row) => ({ id: row.id, error: message })),
    };
  }
}

async function addPriceChanges(supabase, table, rows) {
  if (rows.length === 0) return rows;

  const ids = [...new Set(rows.map((r) => r.id))];
  const hasUnit = "unit" in rows[0];

  const selectCols =
    "id, buy_price, sell_price, buy_change, sell_change" +
    (hasUnit ? ", unit" : "");
  const { data: existing, error } = await supabase
    .from(table)
    .select(selectCols)
    .in("id", ids);

  if (error || !existing) return rows;

  const makeKey = (r) =>
    hasUnit && r.unit != null ? `${r.id}:${r.unit}` : r.id;
  const existingMap = new Map(existing.map((r) => [makeKey(r), r]));

  return rows.map((row) => {
    const old = existingMap.get(makeKey(row));
    if (!old) {
      return { ...row, buy_change: null, sell_change: null };
    }

    const buyChanged = row.buy_price !== old.buy_price;
    const sellChanged = row.sell_price !== old.sell_price;

    return {
      ...row,
      buy_change: buyChanged
        ? row.buy_price - old.buy_price
        : (old.buy_change ?? null),
      sell_change: sellChanged
        ? row.sell_price - old.sell_price
        : (old.sell_change ?? null),
    };
  });
}

async function persistRowsByTable(supabase, succeeded) {
  const tableToRows = groupSucceededRowsByTable(succeeded);
  const upsertedIds = [];
  const dbErrors = [];
  const restSync = {
    gold: { attempted: 0, patched: 0, failed: [] },
    silver: { attempted: 0, patched: 0, failed: [] },
  };

  for (const [table, tableRows] of tableToRows.entries()) {
    const dedupedRows = dedupeRowsByUpsertKey(tableRows);
    const rowsWithChanges = await addPriceChanges(supabase, table, dedupedRows);

    const { error } = await supabase.from(table).upsert(rowsWithChanges);
    if (error) {
      dbErrors.push(`${table}: ${error.message}`);
      console.error("=== DB UPSERT ERROR ===", table, error.message);
      continue;
    }

    upsertedIds.push(...buildUpsertedIdsForTable(succeeded, table));

    const syncResult = await patchRowsToRestApi(table, dedupedRows);
    if (table === GOLD_TABLE) {
      restSync.gold = syncResult;
    } else {
      restSync.silver = syncResult;
    }

    if (syncResult.failed.length > 0) {
      console.error(
        `=== REST PATCH ERROR (${endpointForTable(table)}) ===`,
        JSON.stringify(syncResult.failed),
      );
    } else if (syncResult.attempted > 0) {
      console.log(
        `=== REST PATCH OK (${endpointForTable(table)}) ${syncResult.patched}/${syncResult.attempted}`,
      );
    }
  }

  return {
    upsertedIds,
    restSync,
    dbError: dbErrors.length > 0 ? dbErrors.join(" | ") : null,
  };
}

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
          const displayUrl = source.webUrl ?? source.url;
          return {
            status: "failed",
            id: source.id,
            url: displayUrl,
            stage: "fetch",
            error: String(error),
          };
        }

        let parsed;
        try {
          parsed = await source.parse(payload);
        } catch (error) {
          const displayUrl = source.webUrl ?? source.url;
          return {
            status: "failed",
            id: source.id,
            url: displayUrl,
            stage: "parse",
            error: String(error),
          };
        }

        let row;
        try {
          row = buildRowOrNull(source, parsed);
        } catch (error) {
          const displayUrl = source.webUrl ?? source.url;
          return {
            status: "failed",
            id: source.id,
            url: displayUrl,
            stage: "build",
            error: String(error),
          };
        }

        if (!row) {
          const displayUrl = source.webUrl ?? source.url;
          return {
            status: "skipped",
            id: source.id,
            url: displayUrl,
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
          row,
        };
      })(),
      timeoutPromise,
    ]);

    return result;
  } catch (error) {
    const displayUrl = source.webUrl ?? source.url;
    return {
      status: "failed",
      id: source.id,
      url: displayUrl,
      stage: "timeout",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

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

  if (failed.length > 0) {
    console.error("=== FAILED SOURCES ===");
    for (const item of failed) {
      console.error(`[${item.id}] stage=${item.stage} url=${item.url}`);
      console.error(`  error: ${item.error}`);
    }
  }

  if (skipped.length > 0) {
    console.warn("=== SKIPPED SOURCES (null prices) ===");
    for (const item of skipped) {
      console.warn(`[${item.id}] url=${item.url}`);
      console.warn(
        `  parsed: buy=${item.parsed.buy} sell=${item.parsed.sell} unit=${item.parsed.unit} updated=\"${item.parsed.lastUpdateText}\"`,
      );
    }
  }

  if (succeeded.length > 0) {
    console.log(`=== OK (${succeeded.length}) ===`);
    for (const item of succeeded) {
      console.log(
        `[${item.id}] buy=${item.row.buy_price} sell=${item.row.sell_price} unit=${item.row.unit} updated="${item.row.last_update_at}"`,
      );
    }
  }

  let dbError = null;
  const upsertedIds = [];
  const restSync = {
    gold: { attempted: 0, patched: 0, failed: [] },
    silver: { attempted: 0, patched: 0, failed: [] },
  };
  let sourceUrlCheck = {
    totalRows: 0,
    missingCount: 0,
    missingIds: [],
  };

  if (succeeded.length > 0 && persist) {
    const rows = succeeded.map((s) => s.row);

    const missingSourceUrlIds = rows
      .filter((row) => !row.source_url || !row.source_url.trim())
      .map((row) => `${row.id}:${row.unit}`);

    sourceUrlCheck = {
      totalRows: rows.length,
      missingCount: missingSourceUrlIds.length,
      missingIds: missingSourceUrlIds,
    };

    if (missingSourceUrlIds.length > 0) {
      console.error(
        `=== MISSING source_url: ${missingSourceUrlIds.join(", ")}`,
      );
    } else {
      console.log(
        `=== source_url check passed (${rows.length}/${rows.length})`,
      );
    }

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
      dbError = persisted.dbError;
    }
  }

  const summary = {
    ok: dbError === null,
    upserted: upsertedIds,
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

  return { httpStatus, summary, results };
}
