import { Database } from "bun:sqlite";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InstagramConfig = {
  accessToken: string;
  userId: string;
  appId?: string;
  appSecret?: string;
  pageId?: string;
  initialStartDate: string;
};

export type MediaItem = {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  permalink?: string;
  thumbnail_url?: string;
  timestamp: string;
  username?: string;
};

export type MediaInsight = {
  name: string;
  values: Array<{ value: number }>;
};

export type Fetcher = typeof fetch;

// ---------------------------------------------------------------------------
// Timezone helpers
// ---------------------------------------------------------------------------

export function toPacificAucklandDate(isoString: string): string {
  const d = new Date(isoString);
  const fmt = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function toISODateTime(dateStr: string): string {
  return `${dateStr}T00:00:00.000Z`;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export function createSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS instagram_media (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      media_id             TEXT UNIQUE NOT NULL,
      media_type           TEXT NOT NULL,
      caption              TEXT,
      permalink            TEXT,
      thumbnail_url        TEXT,
      timestamp            TEXT NOT NULL,
      timestamp_local_date TEXT NOT NULL,
      username             TEXT,
      fetched_at           TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS instagram_media_metrics (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      media_id     TEXT NOT NULL,
      metric_name  TEXT NOT NULL,
      metric_value INTEGER NOT NULL,
      measured_at  TEXT NOT NULL,
      fetched_at   TEXT DEFAULT (datetime('now')),
      UNIQUE(media_id, metric_name, measured_at)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS instagram_account_metrics (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      metric_name  TEXT NOT NULL,
      metric_value INTEGER NOT NULL,
      measured_at  TEXT NOT NULL,
      fetched_at   TEXT DEFAULT (datetime('now')),
      UNIQUE(metric_name, measured_at)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sync_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

// ---------------------------------------------------------------------------
// Sync state helpers
// ---------------------------------------------------------------------------

export function getSyncState(db: Database, key: string): string | undefined {
  const row = db
    .prepare("SELECT value FROM sync_state WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSyncState(db: Database, key: string, value: string): void {
  db.prepare(
    "INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)",
  ).run(key, value);
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function buildUrl(
  config: InstagramConfig,
  path: string,
  params: Record<string, string>,
): string {
  const url = new URL(`https://graph.facebook.com/v22.0${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  url.searchParams.set("access_token", config.accessToken);
  return url.toString();
}

function parseUsage(header: string | null): number {
  if (!header) return 0;
  try {
    const parsed = JSON.parse(header);
    if (typeof parsed.call_count === "number") return parsed.call_count;
    const first = Object.values(parsed)[0] as
      | Record<string, number>
      | undefined;
    return first?.call_count ?? 0;
  } catch {
    return 0;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  fetcher: Fetcher,
  url: string,
  retries = 3,
): Promise<{ data: unknown; headers: Headers }> {
  let lastErr: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetcher(url);

      const appUsage = parseUsage(response.headers.get("x-app-usage"));
      const businessUsage = parseUsage(
        response.headers.get("x-business-use-case-usage"),
      );
      const usage = Math.max(appUsage, businessUsage);

      if (usage >= 80) {
        const waitMs = Math.min(60_000, 10_000 * (attempt + 1));
        console.warn(`  API usage at ${usage}%, sleeping ${waitMs}ms...`);
        await sleep(waitMs);
        if (attempt === retries) {
          throw new Error(
            `Instagram API usage too high (${usage}%). Retry later.`,
          );
        }
        continue;
      }

      const text = await response.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }

      if (!response.ok) {
        const err = (data as { error?: { message?: string } })?.error?.message;
        throw new Error(
          `Instagram API error ${response.status}: ${err ?? text}`,
        );
      }

      const graphError = (data as { error?: { message?: string } })?.error;
      if (graphError?.message) {
        throw new Error(`Instagram Graph API error: ${graphError.message}`);
      }

      return { data, headers: response.headers };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const isNetworkError =
        lastErr.message.includes("fetch") ||
        lastErr.message.includes("network") ||
        lastErr.message.includes("ECONNRESET");
      const isRetryable =
        isNetworkError || lastErr.message.includes("too high");
      if (!isRetryable || attempt === retries) throw lastErr;
      const waitMs = 1000 * 2 ** attempt;
      console.warn(
        `  Retry ${attempt + 1}/${retries} after ${waitMs}ms: ${lastErr.message}`,
      );
      await sleep(waitMs);
    }
  }

  throw lastErr ?? new Error("Unknown fetch error");
}

// ---------------------------------------------------------------------------
// Metric mapping
// ---------------------------------------------------------------------------

export const METRICS_BY_MEDIA_TYPE: Record<string, string[]> = {
  IMAGE: ["reach", "likes", "comments", "shares", "saved", "total_interactions"],
  VIDEO: [
    "reach",
    "likes",
    "comments",
    "shares",
    "saved",
    "total_interactions",
  ],
  CAROUSEL_ALBUM: [
    "reach",
    "likes",
    "comments",
    "shares",
    "saved",
    "total_interactions",
  ],
  REELS: [
    "reach",
    "likes",
    "comments",
    "plays",
    "saved",
    "shares",
    "total_interactions",
  ],
  STORY: ["replies", "exits", "reach", "taps_forward", "taps_back"],
};

export function metricsFor(mediaType: string): string[] {
  return METRICS_BY_MEDIA_TYPE[mediaType] ?? [];
}

// ---------------------------------------------------------------------------
// Media fetching
// ---------------------------------------------------------------------------

export async function fetchMediaPage(
  config: InstagramConfig,
  fetcher: Fetcher,
  since: string,
  until: string,
  after?: string,
): Promise<{ data: MediaItem[]; next?: string }> {
  const params: Record<string, string> = {
    fields:
      "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username",
    since: new Date(since).toISOString(),
    until: new Date(until).toISOString(),
    limit: "100",
  };
  if (after) params.after = after;

  const { data } = await fetchWithRetry(
    fetcher,
    buildUrl(config, `/${config.userId}/media`, params),
  );
  const payload = data as {
    data: MediaItem[];
    paging?: { cursors?: { after?: string }; next?: string };
  };
  return {
    data: payload.data ?? [],
    next: payload.paging?.cursors?.after,
  };
}

export async function fetchAllMedia(
  config: InstagramConfig,
  fetcher: Fetcher,
  since: string,
  until: string,
): Promise<MediaItem[]> {
  const results: MediaItem[] = [];
  let after: string | undefined;
  do {
    const page = await fetchMediaPage(config, fetcher, since, until, after);
    results.push(...page.data);
    after = page.next;
  } while (after);
  return results;
}

export async function fetchStories(
  config: InstagramConfig,
  fetcher: Fetcher,
): Promise<MediaItem[]> {
  const params: Record<string, string> = {
    fields:
      "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username",
  };
  try {
    const { data } = await fetchWithRetry(
      fetcher,
      buildUrl(config, `/${config.userId}/stories`, params),
    );
    const payload = data as { data: MediaItem[] };
    return payload.data ?? [];
  } catch (err) {
    console.warn(`  Could not fetch stories: ${err}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Insights fetching
// ---------------------------------------------------------------------------

export async function fetchMediaInsights(
  config: InstagramConfig,
  fetcher: Fetcher,
  mediaId: string,
  mediaType: string,
): Promise<MediaInsight[]> {
  const metrics = metricsFor(mediaType);
  if (metrics.length === 0) return [];

  const params: Record<string, string> = {
    metric: metrics.join(","),
  };

  try {
    const { data } = await fetchWithRetry(
      fetcher,
      buildUrl(config, `/${mediaId}/insights`, params),
    );
    return ((data as { data: MediaInsight[] }).data ?? []).filter(
      (insight): insight is MediaInsight & { name: string } =>
        typeof insight.name === "string" &&
        Array.isArray(insight.values) &&
        insight.values.length > 0 &&
        typeof insight.values[0].value === "number",
    );
  } catch (err) {
    console.warn(`  Could not fetch insights for ${mediaId}: ${err}`);
    return [];
  }
}

export async function fetchAccountInsights(
  config: InstagramConfig,
  fetcher: Fetcher,
  since: string,
  until: string,
): Promise<{ name: string; value: number; endTime: string }[]> {
  const results: { name: string; value: number; endTime: string }[] = [];

  // Reach: daily breakdown, no metric_type needed
  try {
    const paramsA: Record<string, string> = {
      metric: "reach",
      period: "day",
      since: new Date(since).toISOString(),
      until: new Date(until).toISOString(),
    };
    const { data: dataA } = await fetchWithRetry(
      fetcher,
      buildUrl(config, `/${config.userId}/insights`, paramsA),
    );
    const payloadA = dataA as {
      data: Array<{
        name: string;
        period: string;
        values: Array<{ value: number; end_time: string }>;
      }>;
    };
    for (const metric of payloadA.data ?? []) {
      for (const v of metric.values ?? []) {
        results.push({ name: metric.name, value: v.value, endTime: v.end_time });
      }
    }
  } catch (err) {
    console.warn(`  Account reach fetch failed: ${err}`);
  }

  // Profile views: needs metric_type=total_value
  try {
    const paramsB: Record<string, string> = {
      metric: "profile_views",
      metric_type: "total_value",
      period: "day",
      since: new Date(since).toISOString(),
      until: new Date(until).toISOString(),
    };
    const { data: dataB } = await fetchWithRetry(
      fetcher,
      buildUrl(config, `/${config.userId}/insights`, paramsB),
    );
    const payloadB = dataB as {
      data: Array<{
        name: string;
        total_value: { value: number };
      }>;
    };
    for (const metric of payloadB.data ?? []) {
      if (metric.total_value?.value != null) {
        results.push({
          name: metric.name,
          value: metric.total_value.value,
          endTime: until,
        });
      }
    }
  } catch (err) {
    console.warn(`  Account profile_views fetch failed: ${err}`);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Database writes
// ---------------------------------------------------------------------------

export function saveMedia(
  db: Database,
  item: MediaItem,
  overrideType?: string,
): void {
  const stmt = db.prepare(`
    INSERT INTO instagram_media (
      media_id, media_type, caption, permalink, thumbnail_url,
      timestamp, timestamp_local_date, username
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(media_id) DO UPDATE SET
      media_type = excluded.media_type,
      caption = excluded.caption,
      permalink = excluded.permalink,
      thumbnail_url = excluded.thumbnail_url,
      timestamp = excluded.timestamp,
      timestamp_local_date = excluded.timestamp_local_date,
      username = excluded.username,
      fetched_at = datetime('now')
  `);

  const localDate = toPacificAucklandDate(item.timestamp);
  stmt.run(
    item.id,
    overrideType ?? item.media_type,
    item.caption ?? null,
    item.permalink ?? null,
    item.thumbnail_url ?? item.media_url ?? null,
    item.timestamp,
    localDate,
    item.username ?? null,
  );
}

export function saveMediaMetrics(
  db: Database,
  mediaId: string,
  insights: MediaInsight[],
  measuredAt: string,
): void {
  const stmt = db.prepare(`
    INSERT INTO instagram_media_metrics (
      media_id, metric_name, metric_value, measured_at
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(media_id, metric_name, measured_at) DO UPDATE SET
      metric_value = excluded.metric_value,
      fetched_at = datetime('now')
  `);

  const insertBatch = db.transaction((rows: MediaInsight[]) => {
    for (const insight of rows) {
      stmt.run(mediaId, insight.name, insight.values[0].value, measuredAt);
    }
  });
  insertBatch(insights);
}

export function saveAccountMetrics(
  db: Database,
  metrics: { name: string; value: number; endTime: string }[],
): void {
  const stmt = db.prepare(`
    INSERT INTO instagram_account_metrics (
      metric_name, metric_value, measured_at
    ) VALUES (?, ?, ?)
    ON CONFLICT(metric_name, measured_at) DO UPDATE SET
      metric_value = excluded.metric_value,
      fetched_at = datetime('now')
  `);

  const insertBatch = db.transaction(
    (rows: { name: string; value: number; endTime: string }[]) => {
      for (const row of rows) {
        const localDate = toPacificAucklandDate(row.endTime);
        stmt.run(row.name, row.value, localDate);
      }
    },
  );
  insertBatch(metrics);
}

// ---------------------------------------------------------------------------
// Main sync
// ---------------------------------------------------------------------------

export async function runSync(
  db: Database,
  config: InstagramConfig,
  fetcher: Fetcher = fetch,
): Promise<void> {
  createSchema(db);

  const lastMediaSync =
    getSyncState(db, "instagram_last_media_sync") ?? config.initialStartDate;
  const lastAccountSync =
    getSyncState(db, "instagram_last_account_sync") ??
    toPacificAucklandDate(config.initialStartDate);

  const now = new Date();
  const nowIso = now.toISOString();
  const todayLocal = toPacificAucklandDate(nowIso);

  console.log(`Instagram sync starting...`);
  console.log(`  Media since: ${lastMediaSync}`);
  console.log(`  Account metrics since: ${lastAccountSync}`);

  // 1. Posts / reels / carousels
  console.log("\nFetching media...");
  const mediaItems = await fetchAllMedia(
    config,
    fetcher,
    lastMediaSync,
    nowIso,
  );
  console.log(`  Found ${mediaItems.length} media item(s)`);

  const measuredAt = todayLocal;
  for (let i = 0; i < mediaItems.length; i++) {
    const item = mediaItems[i];
    process.stdout.write(`  [${i + 1}/${mediaItems.length}] ${item.id} ... `);
    saveMedia(db, item);
    const insights = await fetchMediaInsights(
      config,
      fetcher,
      item.id,
      item.media_type,
    );
    saveMediaMetrics(db, item.id, insights, measuredAt);
    console.log(`${insights.length} metric(s)`);
  }

  // 2. Stories (expire quickly, fetch fresh each run)
  console.log("\nFetching stories...");
  const stories = await fetchStories(config, fetcher);
  console.log(`  Found ${stories.length} story item(s)`);
  for (let i = 0; i < stories.length; i++) {
    const item = stories[i];
    process.stdout.write(
      `  [${i + 1}/${stories.length}] ${item.id} (story) ... `,
    );
    saveMedia(db, item, "STORY");
    const insights = await fetchMediaInsights(
      config,
      fetcher,
      item.id,
      "STORY",
    );
    saveMediaMetrics(db, item.id, insights, measuredAt);
    console.log(`${insights.length} metric(s)`);
  }

  // 3. Account-level daily metrics (chunked into 30-day windows per API limit)
  console.log("\nFetching account insights...");
  let totalAccountMetrics = 0;
  const chunkStart = new Date(toISODateTime(lastAccountSync));
  const chunkEnd = new Date(nowIso);
  let acctCursor = new Date(chunkStart);
  while (acctCursor < chunkEnd) {
    const blockStart = acctCursor.toISOString();
    const blockEnd = new Date(acctCursor);
    blockEnd.setUTCDate(blockEnd.getUTCDate() + 30);
    const cappedEnd = blockEnd >= chunkEnd ? chunkEnd : blockEnd;
    const accountMetrics = await fetchAccountInsights(
      config,
      fetcher,
      blockStart,
      cappedEnd.toISOString(),
    );
    saveAccountMetrics(db, accountMetrics);
    totalAccountMetrics += accountMetrics.length;
    acctCursor = cappedEnd;
  }
  console.log(`  Saved ${totalAccountMetrics} account metric row(s)`);

  // 4. Update sync state
  setSyncState(db, "instagram_last_media_sync", nowIso);
  setSyncState(db, "instagram_last_account_sync", todayLocal);

  console.log("\nInstagram sync complete.");
  console.log(`  Next media sync will start from: ${nowIso}`);
  console.log(`  Next account sync will start from: ${todayLocal}`);
}
