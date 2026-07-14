import { Database } from "bun:sqlite";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WeatherDaily = {
  date: string; // YYYY-MM-DD (Pacific/Auckland)
  temp_high: number | null;
  temp_low: number | null;
  temp_avg: number | null;
  rainfall_mm: number | null;
  location_name: string;
  latitude: number;
  longitude: number;
};

export type WeatherConfig = {
  apiKey: string;
  latitude: number;
  longitude: number;
  locationName: string;
  initialStartDate: string; // YYYY-MM-DD
};

export type Fetcher = typeof fetch;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export function createWeatherSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS weather_daily (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      date            TEXT NOT NULL UNIQUE,
      temp_high       REAL,
      temp_low        REAL,
      temp_avg        REAL,
      rainfall_mm     REAL,
      location_name   TEXT,
      latitude        REAL,
      longitude       REAL,
      fetched_at      TEXT DEFAULT (datetime('now'))
    )
  `);
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function buildHeaders(config: WeatherConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    Accept: "application/json",
  };
}

// ---------------------------------------------------------------------------
// MetService NZ API client
// ---------------------------------------------------------------------------

/**
 * Fetch daily weather observations from MetService NZ API.
 *
 * Endpoint (TBC — depends on MetService developer portal):
 *   GET /v1/climate/daily?lat={lat}&lon={lon}&from={date}&to={date}
 *
 * Falls back to Open-Meteo (no API key needed) if MetService is unavailable:
 *   https://archive-api.open-meteo.com/v1/archive
 *   ?latitude=...&longitude=...
 *   &start_date=...&end_date=...
 *   &daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum
 *   &timezone=Pacific/Auckland
 */
export async function fetchDailyWeather(
  config: WeatherConfig,
  fetcher: Fetcher,
  from: string, // YYYY-MM-DD
  to: string, // YYYY-MM-DD
): Promise<WeatherDaily[]> {
  // --- ATTEMPT: MetService NZ API ---
  // Try the MetService endpoint. If it fails with 401/403/404, fall through
  // to the Open-Meteo fallback.
  try {
    const url = `https://api.metservice.com/v1/climate/daily?lat=${config.latitude}&lon=${config.longitude}&from=${from}&to=${to}`;

    const response = await fetcher(url, {
      headers: buildHeaders(config),
    });

    if (response.ok) {
      const json = await response.json();
      return parseMetserviceResponse(json, config);
    }

    // If auth error (no key / wrong key), don't fallback — fail fast
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `MetService API returned ${response.status}: check METSERVICE_API_KEY`,
      );
    }

    // For 404 / 5xx, fall through to Open-Meteo
    console.warn(
      `MetService API returned ${response.status}, falling back to Open-Meteo`,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Network errors (connection refused, DNS, timeout) fall through
    if (
      !message.includes("fetch") &&
      !message.includes("network") &&
      !message.includes("ECONNRESET") &&
      !message.includes("check METSERVICE_API_KEY")
    ) {
      console.warn(`MetService fetch failed: ${message}, falling back to Open-Meteo`);
    } else if (message.includes("check METSERVICE_API_KEY")) {
      throw err; // don't fallback on auth errors
    } else {
      console.warn(`MetService network error: ${message}, falling back to Open-Meteo`);
    }
  }

  // --- FALLBACK: Open-Meteo (free, no API key) ---
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${config.latitude}&longitude=${config.longitude}&start_date=${from}&end_date=${to}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum&timezone=Pacific/Auckland`;

  const response = await fetcher(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Open-Meteo API error ${response.status}: ${text}`);
  }

  const json = await response.json();

  const om = json as {
    daily?: {
      time: string[];
      temperature_2m_max: (number | null)[];
      temperature_2m_min: (number | null)[];
      temperature_2m_mean: (number | null)[];
      precipitation_sum: (number | null)[];
    };
  };

  if (!om.daily) return [];

  const rows: WeatherDaily[] = [];
  for (let i = 0; i < (om.daily.time ?? []).length; i++) {
    rows.push({
      date: om.daily.time[i],
      temp_high: om.daily.temperature_2m_max[i] ?? null,
      temp_low: om.daily.temperature_2m_min[i] ?? null,
      temp_avg: om.daily.temperature_2m_mean[i] ?? null,
      rainfall_mm: om.daily.precipitation_sum[i] ?? null,
      location_name: config.locationName,
      latitude: config.latitude,
      longitude: config.longitude,
    });
  }

  return rows;
}

/**
 * Parse MetService API response into WeatherDaily[]
 *
 * Exact shape depends on their API — update this once we confirm the endpoint.
 * Expected: { data: [{ date, temp_high, temp_low, temp_avg, rainfall_mm }] }
 */
function parseMetserviceResponse(
  json: unknown,
  config: WeatherConfig,
): WeatherDaily[] {
  const data = (json as { data?: Record<string, unknown>[] })?.data ?? [];

  return data.map((row: Record<string, unknown>) => ({
    date: String(row.date ?? ""),
    temp_high: toNum(row.temp_high),
    temp_low: toNum(row.temp_low),
    temp_avg: toNum(row.temp_avg),
    rainfall_mm: toNum(row.rainfall_mm ?? row.precipitation_sum),
    location_name: config.locationName,
    latitude: config.latitude,
    longitude: config.longitude,
  }));
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Database writes
// ---------------------------------------------------------------------------

export function saveWeatherDaily(db: Database, rows: WeatherDaily[]): number {
  const stmt = db.prepare(`
    INSERT INTO weather_daily (date, temp_high, temp_low, temp_avg, rainfall_mm, location_name, latitude, longitude)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      temp_high = excluded.temp_high,
      temp_low = excluded.temp_low,
      temp_avg = excluded.temp_avg,
      rainfall_mm = excluded.rainfall_mm,
      location_name = excluded.location_name,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      fetched_at = datetime('now')
  `);

  const insertBatch = db.transaction((items: WeatherDaily[]) => {
    let count = 0;
    for (const row of items) {
      const result = stmt.run(
        row.date,
        row.temp_high,
        row.temp_low,
        row.temp_avg,
        row.rainfall_mm,
        row.location_name,
        row.latitude,
        row.longitude,
      );
      count += result.changes;
    }
    return count;
  });

  return insertBatch(rows);
}

// ---------------------------------------------------------------------------
// Sync state helpers
// ---------------------------------------------------------------------------

function getSyncState(db: Database, key: string): string | undefined {
  const row = db
    .prepare("SELECT value FROM sync_state WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value;
}

function setSyncState(db: Database, key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)").run(
    key,
    value,
  );
}

// ---------------------------------------------------------------------------
// Monthly chunking
// ---------------------------------------------------------------------------

function generateMonthlyChunks(
  start: string,
  end: string,
): Array<{ from: string; to: string }> {
  const chunks: Array<{ from: string; to: string }> = [];
  let current = new Date(start + "T00:00:00Z");
  const endDate = new Date(end + "T00:00:00Z");

  while (current < endDate) {
    const chunkStart = current.toISOString().split("T")[0];
    const next = new Date(current);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const chunkEnd =
      next >= endDate ? end : next.toISOString().split("T")[0];
    chunks.push({ from: chunkStart, to: chunkEnd });
    current = next;
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Sync orchestrator
// ---------------------------------------------------------------------------

export async function runWeatherSync(
  db: Database,
  config: WeatherConfig,
  fetcher: Fetcher = fetch,
): Promise<{ inserted: number; nextSync: string }> {
  createWeatherSchema(db);

  const stateValue = getSyncState(db, "weather_last_sync");
  const syncStart = stateValue ?? config.initialStartDate;
  const syncEnd = new Date().toISOString().split("T")[0];

  const chunks = generateMonthlyChunks(syncStart, syncEnd);
  let totalInserted = 0;

  for (const { from, to } of chunks) {
    const rows = await fetchDailyWeather(config, fetcher, from, to);
    if (rows.length > 0) {
      totalInserted += saveWeatherDaily(db, rows);
    }
  }

  setSyncState(db, "weather_last_sync", syncEnd);

  return { inserted: totalInserted, nextSync: syncEnd };
}
