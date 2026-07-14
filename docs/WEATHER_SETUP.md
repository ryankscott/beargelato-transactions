# Weather Data Setup

This document explains how the weather–sales correlation feature works and how to set it up.

## Overview

The dashboard now includes:
- A `weather_daily` table in the SQLite database storing daily weather observations
- A `bun run sync:weather` script that fetches historical and recent weather data
- `/api/weather/daily` and `/api/weather/correlation` API endpoints
- A **Weather vs Revenue** chart (temp + rain overlaid on daily sales) on the Sales tab
- A **Today's Weather** card showing current temperature range and rainfall

## Data Source

### Primary: MetService NZ API

The sync script first tries [MetService](https://www.metservice.com/)'s API, which requires an API key:

```bash
METSERVICE_API_KEY=your_key_here
```

> **Note:** The exact API endpoint path depends on MetService's developer portal. If unavailable, see the **Sources** section below.

### Fallback: Open-Meteo (free, no key required)

If the MetService endpoint is unreachable or returns a 404/5xx error, the script automatically falls back to [Open-Meteo's Archive API](https://open-meteo.com/en/docs/historical-weather-api) — a free, no-key-required service providing historical weather data:

- Temperature (max, min, mean) in °C
- Precipitation sum in mm
- Daily granularity
- Pacific/Auckland timezone

**This means the feature works without any API key.** MetService is attempted first; Open-Meteo is the silent fallback.

## Running the Sync

### First sync (backfill from Jan 2025)

```bash
# Option A: With MetService key set
METSERVICE_API_KEY=your_key bun run sync:weather

# Option B: No key — falls back to Open-Meteo automatically
bun run sync:weather
```

This fetches weather data in monthly chunks from `WEATHER_INITIAL_START` (default `2025-01-01`) through today.

### Regular updates

To keep weather data current, run periodically:

```bash
bun run sync:weather
```

The script reads the `weather_last_sync` value from `sync_state` and only fetches data newer than that, so subsequent runs are fast.

### Cron job (optional)

Add a cron job to sync daily weather automatically:

```bash
# Every morning at 7am
0 7 * * * cd /home/ryan/Code/beargelato-transactions && /home/ryan/.bun/bin/bun run sync:weather >> /tmp/weather-sync.log 2>&1
```

Or use Hermes' cron system:

```bash
cronjob action=create schedule="0 7 * * *" prompt="Run weather sync for Bear Gelato" workdir=/home/ryan/Code/beargelato-transactions
```

## Configuration

All settings are in `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `METSERVICE_API_KEY` | — | MetService API key (optional, falls back to Open-Meteo) |
| `WEATHER_LAT` | `-36.8485` | Shop latitude (Auckland CBD default) |
| `WEATHER_LON` | `174.7633` | Shop longitude (Auckland CBD default) |
| `WEATHER_LOCATION` | `Auckland CBD` | Display name for location |
| `WEATHER_INITIAL_START` | `2025-01-01` | Date to start backfilling from |

Update `WEATHER_LAT`/`WEATHER_LON` to your actual Bear Gelato shop coordinates for accurate local weather data.

## Database Schema

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
);
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/weather/daily?days=30` | Daily weather data (temp high/low/avg, rainfall) |
| `GET /api/weather/summary` | Today's weather + last sync time |
| `GET /api/weather/correlation?days=30` | JOIN of daily sales × weather |

## Frontend

Two components added to the Sales tab:

1. **Today's Weather** — Card showing current day's high/low temp and rainfall
2. **Weather vs Revenue (30 days)** — Composed chart with:
   - Green bars — daily revenue
   - Orange line — average temperature
   - Blue dashed line — rainfall in mm

## Example Correlation Query

```sql
SELECT
  s.date,
  s.revenue,
  w.temp_avg,
  w.temp_high,
  w.rainfall_mm
FROM (
  SELECT created_at_date as date, SUM(curr_amount) as revenue
  FROM transactions
  WHERE type = 'SALE' AND status = 'AUTHORISED'
  GROUP BY created_at_date
) s
LEFT JOIN weather_daily w ON s.date = w.date
WHERE w.temp_avg IS NOT NULL
ORDER BY w.temp_avg DESC
LIMIT 10;
```

This shows your highest-revenue days alongside the temperature and rainfall for those days — handy for spotting weather patterns in your best sales days.
