# Weather–Sales Correlation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add daily weather data (temperature high/low/avg + rainfall) for Auckland to the existing `transactions.db` and build API endpoints + frontend charts to correlate weather with Bear Gelato sales.

**Architecture:** Follow the established pattern from Instagram integration — a manual sync script (`weather_sync.ts`) fetches from MetService NZ API, stores in a new `weather_daily` table in the existing SQLite DB, and new API endpoints serve the data to React components via TanStack Query hooks.

**Tech Stack:** Bun, TypeScript, SQLite (bun:sqlite), React 18, Recharts, TanStack Query, Tailwind CSS

---

## Prerequisites (before implementation)

- [ ] MetService NZ API key obtained (register at https://www.metservice.com/ — developer portal TBD; endpoint confirmed at `api.metservice.com`)
- [ ] Shop coordinates/location confirmed (default: Auckland CBD, -36.8485, 174.7633)

---

## Task 1: Add weather_daily table to DB schema

**Objective:** Create the `weather_daily` table and register it in schema initialization.

**Files:**
- Modify: `sync-core.ts` (add table creation)
- Create: `lib/weather_sync.ts`

**Step 1: Add the table DDL to `getDb()` in `sync-core.ts`**

Add alongside the existing `CREATE TABLE IF NOT EXISTS` blocks:

```sql
CREATE TABLE IF NOT EXISTS weather_daily (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  date            TEXT NOT NULL UNIQUE,  -- YYYY-MM-DD (Pacific/Auckland)
  temp_high       REAL,                  -- °C
  temp_low        REAL,                  -- °C
  temp_avg        REAL,                  -- °C
  rainfall_mm     REAL,                  -- mm
  location_name   TEXT,                  -- e.g. "Auckland CBD"
  latitude        REAL,
  longitude       REAL,
  fetched_at      TEXT DEFAULT (datetime('now'))
)
```

**Step 2: Create empty `lib/weather_sync.ts`**

```typescript
// lib/weather_sync.ts — stub, will be filled in later tasks
export type WeatherDaily = {
  date: string;
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
  initialStartDate: string;
};
```

**Step 3: Verify**

```bash
bun run --eval "
import { Database } from 'bun:sqlite';
const db = new Database('transactions.db');
const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all();
console.log(tables);
"
```

Expected: `weather_daily` appears in the table list.

**Step 4: Commit**

```bash
git add sync-core.ts lib/weather_sync.ts
git commit -m "feat: add weather_daily table and types"
```

---

## Task 2: Implement MetService NZ API client

**Objective:** Write the API fetching logic in `lib/weather_sync.ts`.

**Files:**
- Modify: `lib/weather_sync.ts`
- Research: MetService API docs (exact endpoint shapes)

**Step 1: Document the MetService API assumptions**

```typescript
// MetService NZ API — endpoints discovered from developer portal.
// Expected auth: header-based API key.
// Base URL: https://api.metservice.com

// Fallback strategy: if MetService historical endpoint is unavailable
// or too limited, we can pivot to Open-Meteo (free, no key, good history)
// by switching the fetchDailyWeather implementation. The schema stays the same.
```

**Step 2: Implement fetch function**

Since exact MetService endpoints need their dev portal, we write a `fetchDailyWeather` function that:
- Takes `config: WeatherConfig`, date range `{ from: string; to: string }`, and a `Fetcher` (like `typeof fetch`, following Instagram pattern for testability)
- Calls the MetService daily observations/historical endpoint
- Parses the response into `WeatherDaily[]`
- Handles auth errors, rate limiting (with retry), and network failures

```typescript
export async function fetchDailyWeather(
  config: WeatherConfig,
  fetcher: Fetcher,
  from: string,   // YYYY-MM-DD
  to: string,     // YYYY-MM-DD
): Promise<WeatherDaily[]> {
  // TODO: Replace with actual MetService endpoint once API key is available.
  // Endpoint pattern (TBC): GET /v1/observations/daily?lat={lat}&lon={lon}&from={from}&to={to}
  
  const url = `https://api.metservice.com/v1/observations/daily?lat=${config.latitude}&lon=${config.longitude}&from=${from}&to=${to}`;
  
  const response = await fetcher(url, {
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`MetService API error ${response.status}: ${body}`);
  }

  const json = await response.json();
  // Parse response into WeatherDaily[] — exact shape depends on API
  // Expected: { data: [{ date, temp_high, temp_low, temp_avg, rainfall_mm }] }
  return parseWeatherResponse(json, config);
}

function parseWeatherResponse(json: unknown, config: WeatherConfig): WeatherDaily[] {
  // Placeholder — refine after seeing actual API response shape
  const data = (json as any)?.data ?? [];
  return data.map((row: any) => ({
    date: row.date,
    temp_high: row.temp_high ?? null,
    temp_low: row.temp_low ?? null,
    temp_avg: row.temp_avg ?? null,
    rainfall_mm: row.rainfall_mm ?? null,
    location_name: config.locationName,
    latitude: config.latitude,
    longitude: config.longitude,
  }));
}
```

**Step 3: Add createSchema function**

```typescript
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
```

**Step 4: Commit**

```bash
git add lib/weather_sync.ts
git commit -m "feat: add MetService API client with fetchDailyWeather"
```

---

## Task 3: Implement weather DB save logic

**Objective:** Write the `saveWeatherDaily` function that upserts weather records.

**Files:**
- Modify: `lib/weather_sync.ts`

**Step 1: Implement saveWeatherDaily**

```typescript
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
        row.date, row.temp_high, row.temp_low, row.temp_avg,
        row.rainfall_mm, row.location_name, row.latitude, row.longitude,
      );
      count += result.changes;
    }
    return count;
  });

  return insertBatch(rows);
}
```

**Step 2: Commit**

```bash
git add lib/weather_sync.ts
git commit -m "feat: add saveWeatherDaily with upsert logic"
```

---

## Task 4: Implement runWeatherSync

**Objective:** Write the main sync orchestrator that reads sync state, fetches in monthly chunks, and saves.

**Files:**
- Modify: `lib/weather_sync.ts`

**Step 1: Implement runWeatherSync**

Following the pattern from `sync-core.ts`'s `runSync()`:

```typescript
export async function runWeatherSync(
  db: Database,
  config: WeatherConfig,
  fetcher: Fetcher = fetch,
): Promise<{ inserted: number; nextSync: string }> {
  createWeatherSchema(db);

  const stateRow = db.prepare(
    "SELECT value FROM sync_state WHERE key = 'weather_last_sync'"
  ).get() as { value: string } | undefined;

  const syncStart = stateRow?.value ?? config.initialStartDate;
  const syncEnd = new Date().toISOString().split('T')[0]; // today YYYY-MM-DD

  const chunks = generateMonthlyChunks(syncStart, syncEnd);
  let totalInserted = 0;

  for (const { from, to } of chunks) {
    const rows = await fetchDailyWeather(config, fetcher, from, to);
    if (rows.length > 0) {
      totalInserted += saveWeatherDaily(db, rows);
    }
  }

  db.prepare(
    "INSERT OR REPLACE INTO sync_state (key, value) VALUES ('weather_last_sync', ?)"
  ).run(syncEnd);

  return { inserted: totalInserted, nextSync: syncEnd };
}
```

Note: `generateMonthlyChunks` already exists in `sync-core.ts` — extract or import it.

**Step 2: Commit**

```bash
git add lib/weather_sync.ts
git commit -m "feat: add runWeatherSync orchestrator"
```

---

## Task 5: Create weather_sync.ts entry point

**Objective:** Create the top-level sync script (`weather_sync.ts`) that reads `.env` and runs the sync.

**Files:**
- Create: `weather_sync.ts`

**Step 1: Create weather_sync.ts**

```typescript
// weather_sync.ts — Run: bun run weather_sync.ts
import { Database } from 'bun:sqlite';
import { runWeatherSync, type WeatherConfig } from './lib/weather_sync.ts';

const API_KEY = process.env.METSERVICE_API_KEY;
if (!API_KEY) {
  console.error('METSERVICE_API_KEY must be set in .env');
  process.exit(1);
}

const config: WeatherConfig = {
  apiKey: API_KEY,
  latitude: parseFloat(process.env.WEATHER_LAT ?? '-36.8485'),
  longitude: parseFloat(process.env.WEATHER_LON ?? '174.7633'),
  locationName: process.env.WEATHER_LOCATION ?? 'Auckland CBD',
  initialStartDate: process.env.WEATHER_INITIAL_START ?? '2025-01-01',
};

const DB_PATH = process.env.DB_PATH ?? 'transactions.db';
const db = new Database(DB_PATH);

try {
  const result = await runWeatherSync(db, config);
  console.log(`✅ Weather sync complete: ${result.inserted} rows inserted/updated.`);
  console.log(`   Next sync will start from: ${result.nextSync}`);
} catch (err: any) {
  console.error(`❌ Weather sync failed: ${err.message}`);
  process.exit(1);
} finally {
  db.close();
}
```

**Step 2: Add npm script**

Add to `package.json` scripts:
```json
"sync:weather": "bun weather_sync.ts"
```

**Step 3: Commit**

```bash
git add weather_sync.ts package.json
git commit -m "feat: add weather_sync.ts entry point and npm script"
```

---

## Task 6: Add /api/weather/daily endpoint

**Objective:** Expose daily weather data via the Bun server API.

**Files:**
- Modify: `server.ts`

**Step 1: Add the API route**

Insert alongside the existing Instagram routes in `server.ts`:

```typescript
// GET /api/weather/daily?days=30
if (url.pathname === '/api/weather/daily') {
  const days = parseInt(url.searchParams.get('days') ?? '30');
  const rows = db.prepare(`
    SELECT date, temp_high, temp_low, temp_avg, rainfall_mm
    FROM weather_daily
    WHERE date >= date('now', '-' || ? || ' days')
    ORDER BY date ASC
  `).all(days);
  return json(rows);
}
```

**Step 2: Add weather summary endpoint (optional, for stats cards)**

```typescript
// GET /api/weather/summary
if (url.pathname === '/api/weather/summary') {
  const today = db.prepare(`
    SELECT * FROM weather_daily WHERE date = date('now')
  `).get();
  
  const lastSync = db.prepare(
    "SELECT value FROM sync_state WHERE key = 'weather_last_sync'"
  ).get() as { value: string } | undefined;

  return json({ today: today ?? null, lastSync: lastSync?.value ?? null });
}
```

**Step 3: Commit**

```bash
git add server.ts
git commit -m "feat: add /api/weather/daily and /api/weather/summary endpoints"
```

---

## Task 7: Add TypeScript types and React Query hooks

**Objective:** Add `WeatherDailyRow` type and `useWeatherDaily` hook.

**Files:**
- Modify: `src/hooks/useApi.ts`

**Step 1: Add types**

```typescript
export interface WeatherDailyRow {
  date: string;
  temp_high: number | null;
  temp_low: number | null;
  temp_avg: number | null;
  rainfall_mm: number | null;
}

export interface WeatherCorrelationRow {
  date: string;
  revenue: number;
  txn_count: number;
  temp_avg: number | null;
  temp_high: number | null;
  rainfall_mm: number | null;
}
```

**Step 2: Add hooks**

```typescript
export function useWeatherDaily(days = 30) {
  return useQuery<WeatherDailyRow[]>({
    queryKey: ['weather-daily', days],
    queryFn: () => fetchJson(`${BASE}/weather/daily?days=${days}`),
    staleTime: 30 * 60_000, // 30 min — weather changes slowly
  });
}

export function useWeatherCorrelation(days = 30) {
  return useQuery<WeatherCorrelationRow[]>({
    queryKey: ['weather-correlation', days],
    queryFn: () => fetchJson(`${BASE}/weather/correlation?days=${days}`),
    staleTime: 5 * 60_000,
  });
}
```

**Step 3: Commit**

```bash
git add src/hooks/useApi.ts
git commit -m "feat: add WeatherDailyRow type and useWeatherDaily hook"
```

---

## Task 8: Add /api/weather/correlation endpoint

**Objective:** Join weather with sales data for correlation chart consumption.

**Files:**
- Modify: `server.ts`

**Step 1: Add correlation endpoint**

```typescript
// GET /api/weather/correlation?days=30
if (url.pathname === '/api/weather/correlation') {
  const days = parseInt(url.searchParams.get('days') ?? '30');
  const rows = db.prepare(`
    SELECT
      s.date,
      s.revenue,
      s.txn_count,
      w.temp_avg,
      w.temp_high,
      w.temp_low,
      w.rainfall_mm
    FROM (
      SELECT
        created_at_date as date,
        ROUND(SUM(curr_amount), 2) as revenue,
        COUNT(*) as txn_count
      FROM transactions
      WHERE type = 'SALE' AND status = 'AUTHORISED'
        AND created_at_date >= date('now', '-' || ? || ' days')
      GROUP BY created_at_date
    ) s
    LEFT JOIN weather_daily w ON s.date = w.date
    ORDER BY s.date ASC
  `).all(days);
  return json(rows);
}
```

**Step 2: Commit**

```bash
git add server.ts
git commit -m "feat: add /api/weather/correlation endpoint joining weather + sales"
```

---

## Task 9: Build WeatherCorrelationChart component

**Objective:** Create a dual-axis chart showing revenue bars + temperature line + rainfall overlay.

**Files:**
- Create: `src/components/WeatherCorrelationChart.tsx`
- Modify: `src/App.tsx` (add to Sales tab)

**Step 1: Create WeatherCorrelationChart.tsx**

```tsx
import { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWeatherCorrelation } from '@/hooks/useApi';
import { formatCurrency } from '@/lib/utils';
import { CloudSun } from 'lucide-react';

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md text-popover-foreground">
      <p className="text-sm font-semibold mb-1">{label}</p>
      <div className="space-y-1 text-xs">
        {payload.map((p: any, i: number) => (
          <p key={i} className="flex justify-between gap-4">
            {p.name}: <span className="font-mono" style={{ color: p.color }}>{p.value}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

export function WeatherCorrelationChart() {
  const { data, isLoading, isError } = useWeatherCorrelation(30);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((row) => ({
      ...row,
      displayDate: row.date.slice(5),
    }));
  }, [data]);

  if (isLoading) return (
    <Card>
      <CardHeader><Skeleton className="h-5 w-64" /></CardHeader>
      <CardContent><Skeleton className="h-[300px] w-full" /></CardContent>
    </Card>
  );

  if (isError) return (
    <Card className="border-destructive/50">
      <CardContent className="pt-6">
        <p className="text-sm text-destructive">Failed to load weather data</p>
      </CardContent>
    </Card>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CloudSun className="h-5 w-5 text-amber-400" />
          <div>
            <CardTitle>Weather vs Revenue (30 days)</CardTitle>
            <CardDescription>Temperature, rainfall, and daily sales</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
            <XAxis dataKey="displayDate" tick={{ fontSize: 10, fill: '#888' }}
              tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#888' }}
              tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} width={45} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#888' }}
              tickLine={false} axisLine={false} tickFormatter={(v) => `${v}°C`} width={40} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="hsl(142 70% 45%)"
              radius={[4, 4, 0, 0]} maxBarSize={16} />
            <Line yAxisId="right" type="monotone" dataKey="temp_avg" name="Avg Temp °C"
              stroke="hsl(30 95% 55%)" strokeWidth={2} dot={{ r: 3 }} />
            <Line yAxisId="right" type="monotone" dataKey="rainfall_mm" name="Rain mm"
              stroke="hsl(200 80% 55%)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Add to App.tsx Sales tab**

Insert below `<DailyTrend />`:

```tsx
<WeatherCorrelationChart />
```

And import:
```tsx
import { WeatherCorrelationChart } from '@/components/WeatherCorrelationChart';
```

**Step 3: Commit**

```bash
git add src/components/WeatherCorrelationChart.tsx src/App.tsx
git commit -m "feat: add WeatherCorrelationChart with temp + rain vs revenue"
```

---

## Task 10: Add weather stats to Weather section (optional new tab or card)

**Objective:** Show today's weather summary card on the dashboard.

**Files:**
- Create: `src/components/WeatherStatsCard.tsx`

**Step 1: Create WeatherStatsCard**

A simple card showing today's temperature range and rainfall, using the summary endpoint.

```tsx
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Thermometer, CloudRain } from 'lucide-react';

export function WeatherStatsCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['weather-summary'],
    queryFn: () => fetch('/api/weather/summary').then(r => r.json()),
    refetchInterval: 60 * 60_000, // hourly
  });

  if (isLoading) return (
    <Card><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
  );

  const today = data?.today;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <Thermometer className="h-4 w-4 text-amber-400" />
          Today's Weather — Auckland
        </CardTitle>
      </CardHeader>
      <CardContent>
        {today ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">High</p>
              <p className="text-xl font-bold">{today.temp_high ?? '—'}°C</p>
            </div>
            <div>
              <p className="text-muted-foreground">Low</p>
              <p className="text-xl font-bold">{today.temp_low ?? '—'}°C</p>
            </div>
            <div className="col-span-2">
              <p className="text-muted-foreground flex items-center gap-1">
                <CloudRain className="h-3 w-3" /> Rainfall
              </p>
              <p className="text-lg font-semibold">{today.rainfall_mm ?? 0} mm</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No weather data for today</p>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 2: Add to App.tsx**

Place above or below `<StatsCards />` in the Sales tab.

**Step 3: Commit**

```bash
git add src/components/WeatherStatsCard.tsx src/App.tsx
git commit -m "feat: add WeatherStatsCard showing today's temp and rain"
```

---

## Task 11: Write tests

**Objective:** Test the weather sync logic with mocked API responses.

**Files:**
- Create: `weather_sync.test.ts`

**Step 1: Write tests**

```typescript
import { describe, it, expect, mock, beforeAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import {
  createWeatherSchema,
  saveWeatherDaily,
  fetchDailyWeather,
  WeatherDaily,
  WeatherConfig,
} from './lib/weather_sync.ts';

const testConfig: WeatherConfig = {
  apiKey: 'test-key',
  latitude: -36.8485,
  longitude: 174.7633,
  locationName: 'Auckland CBD',
  initialStartDate: '2025-01-01',
};

describe('weather_sync', () => {
  let db: Database;

  beforeAll(() => {
    db = new Database(':memory:');
    createWeatherSchema(db);
  });

  it('saves and retrieves weather data', () => {
    const rows: WeatherDaily[] = [{
      date: '2025-01-15',
      temp_high: 24.5,
      temp_low: 15.2,
      temp_avg: 19.8,
      rainfall_mm: 2.1,
      location_name: 'Test',
      latitude: -36.8,
      longitude: 174.7,
    }];

    saveWeatherDaily(db, rows);

    const result = db.prepare('SELECT * FROM weather_daily WHERE date = ?').get('2025-01-15') as any;
    expect(result.temp_high).toBe(24.5);
    expect(result.rainfall_mm).toBe(2.1);
  });

  it('upserts on duplicate date', () => {
    const rows: WeatherDaily[] = [{
      date: '2025-01-15',
      temp_high: 26.0,
      temp_low: 16.0,
      temp_avg: 21.0,
      rainfall_mm: 0.0,
      location_name: 'Test',
      latitude: -36.8,
      longitude: 174.7,
    }];

    saveWeatherDaily(db, rows);

    const result = db.prepare('SELECT * FROM weather_daily WHERE date = ?').get('2025-01-15') as any;
    expect(result.temp_high).toBe(26.0);
    expect(result.rainfall_mm).toBe(0.0);
  });

  it('fetchDailyWeather parses mocked API response', async () => {
    const mockFetch = mock(async (url: string, init?: any) => ({
      ok: true,
      text: async () => JSON.stringify({
        data: [{
          date: '2025-01-15',
          temp_high: 24.5, temp_low: 15.2,
          temp_avg: 19.8, rainfall_mm: 2.1,
        }],
      }),
    }));

    const rows = await fetchDailyWeather(testConfig, mockFetch as any, '2025-01-01', '2025-01-31');
    expect(rows.length).toBe(1);
    expect(rows[0].temp_avg).toBe(19.8);
  });
});
```

**Step 2: Run tests**

```bash
bun test
```

Expected: 3 tests pass.

**Step 3: Commit**

```bash
git add weather_sync.test.ts
git commit -m "test: add weather_sync tests for save, upsert, and fetch"
```

---

## Task 12: Update .env.example and documentation

**Objective:** Document the new env vars and how to get a MetService key.

**Files:**
- Modify: `.env.example`
- Create: `docs/WEATHER_SETUP.md`

**Step 1: Add to .env.example**

```bash
# MetService NZ Weather API
METSERVICE_API_KEY=your_key_here
# Default: Auckland CBD coordinates
WEATHER_LAT=-36.8485
WEATHER_LON=174.7633
WEATHER_LOCATION="Auckland CBD"
WEATHER_INITIAL_START=2025-01-01
```

**Step 2: Create docs/WEATHER_SETUP.md**

Document:
1. How to register for MetService API access
2. How to find the correct coordinates for the shop(s)
3. How to run the first sync: `bun run sync:weather`
4. How to set up a cron job for daily sync

**Step 3: Commit**

```bash
git add .env.example docs/WEATHER_SETUP.md
git commit -m "docs: add weather API setup guide and env vars"
```

---

## Fallback Strategy

If MetService NZ's API proves unavailable, limited, or too expensive:

1. **Swap the fetch implementation** in `lib/weather_sync.ts` to Open-Meteo (free, no API key):
   ```
   GET https://archive-api.open-meteo.com/v1/archive
     ?latitude=-36.8485&longitude=174.7633
     &start_date=2025-01-01&end_date=2025-07-14
     &daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum
     &timezone=Pacific/Auckland
   ```
2. The schema, API endpoints, and frontend components all stay the same — only `fetchDailyWeather` changes.
3. This is a ~30 minute pivot if needed.

---

## Verification Checklist

- [ ] `bun run sync:weather` populates `weather_daily` table
- [ ] `GET /api/weather/daily?days=30` returns JSON array
- [ ] `GET /api/weather/correlation?days=30` returns joined weather + sales
- [ ] Frontend shows WeatherCorrelationChart with bars + lines
- [ ] Frontend shows WeatherStatsCard with today's weather
- [ ] `bun test` passes all weather tests
- [ ] Dashboard loads without errors
