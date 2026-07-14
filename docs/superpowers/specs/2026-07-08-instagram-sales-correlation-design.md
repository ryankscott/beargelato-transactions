# Instagram–Sales Correlation Design

## Goal
Add Instagram data (posts, reels, stories, and account-level metrics) to the existing `transactions.db` SQLite database so it can be correlated with Verifone sales data. The primary analysis is a **lagged daily effect** (e.g. Instagram activity yesterday vs sales today). A secondary analysis is **per-post impact** (sales within a window after a post).

## Context
The existing project is a small Bun/TypeScript utility that syncs Verifone transaction reports into `transactions.db` via `sync.ts`. Analysis is currently done with ad-hoc SQL files. This feature follows the same manual-sync pattern and stores Instagram data in the same database for external analysis tools.

## Approach
**Option 2: Media + daily metric snapshots.**
Store media metadata once, capture metric values as daily snapshots, and store account-level daily metrics. This preserves metric history, which is essential for true time-series / lagged correlation analysis.

## Architecture

### New files
- `instagram_sync.ts` — manual sync script, analogous to `sync.ts`.
- `.env.example` — extended with Instagram Graph API credentials.
- `docs/INSTAGRAM_SETUP.md` — Facebook app and token setup instructions.
- `sql/instagram_correlation.sql` — example correlation queries.
- `instagram_sync.test.ts` — tests using `bun:test` and mocked API responses.

### Database schema additions
All tables live in the existing `transactions.db`.

```sql
CREATE TABLE IF NOT EXISTS instagram_media (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id            TEXT UNIQUE NOT NULL,
  media_type          TEXT NOT NULL,  -- IMAGE, VIDEO, CAROUSEL_ALBUM, REELS, STORY
  caption             TEXT,
  permalink           TEXT,
  thumbnail_url       TEXT,
  timestamp           TEXT NOT NULL,  -- ISO 8601 UTC from Instagram
  timestamp_local_date TEXT NOT NULL, -- YYYY-MM-DD in Pacific/Auckland
  username            TEXT,
  fetched_at          TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS instagram_media_metrics (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id      TEXT NOT NULL,
  metric_name   TEXT NOT NULL,  -- likes, comments, shares, saves, impressions, reach, plays, views, etc.
  metric_value  INTEGER NOT NULL,
  measured_at   TEXT NOT NULL,  -- YYYY-MM-DD in Pacific/Auckland
  fetched_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(media_id, metric_name, measured_at)
);

CREATE TABLE IF NOT EXISTS instagram_account_metrics (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_name   TEXT NOT NULL,  -- impressions, reach, profile_views, etc.
  metric_value  INTEGER NOT NULL,
  measured_at   TEXT NOT NULL,  -- YYYY-MM-DD in Pacific/Auckland
  fetched_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(metric_name, measured_at)
);
```

The existing `sync_state` table is reused for incremental tracking:
- `instagram_last_media_sync` — ISO timestamp of the most recent media fetch.
- `instagram_last_account_sync` — ISO date of the most recent account-level metrics fetch.

No existing tables are modified. The `instagram_media` table is new, so `timestamp_local_date` is included in the initial schema.

## Data Flow

1. Read credentials from `.env`:
   - `INSTAGRAM_APP_ID`
   - `INSTAGRAM_APP_SECRET`
   - `INSTAGRAM_ACCESS_TOKEN`
   - `INSTAGRAM_PAGE_ID`
   - `INSTAGRAM_USER_ID`
   - `INSTAGRAM_INITIAL_START_DATE` (default `2025-01-01`)

2. Connect to `transactions.db`.

3. Read `instagram_last_media_sync` from `sync_state`; default to `INSTAGRAM_INITIAL_START_DATE`.

4. Fetch media list:
   - `GET /{ig-user-id}/media?since={last_sync}&fields=id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username`
   - Paginate through all results.

5. For each media item:
   - Upsert metadata into `instagram_media`.
   - Call `GET /{media-id}/insights?metric=...` with metrics valid for that `media_type`.
   - Insert one row per metric into `instagram_media_metrics` with `measured_at = current Pacific/Auckland date`.

6. Fetch account-level daily insights from `instagram_last_account_sync` through today:
   - `GET /{ig-user-id}/insights?metric=impressions,reach,profile_views&period=day&since=...&until=...`
   - Convert each returned UTC day to a Pacific/Auckland date and upsert into `instagram_account_metrics`.

7. Update `sync_state` with the new sync timestamps.

## Instagram Graph API Details

### Required permissions
- `instagram_basic`
- `instagram_manage_insights`
- `pages_read_engagement`

### Media-specific metrics
The script maps `media_type` to the correct insights metrics:

- `IMAGE`: impressions, reach, saved, likes, comments, shares
- `VIDEO`: impressions, reach, saved, likes, comments, shares, video_views, plays
- `CAROUSEL_ALBUM`: carousel_album_impressions, carousel_album_reach, carousel_album_saved, carousel_album_engagement, carousel_album_video_views
- `REELS`: comments, likes, plays, reach, saved, shares, total_interactions, views
- `STORY`: replies, exits, impressions, reach, taps_forward, taps_back

### Rate limiting
The script inspects `x-app-usage` / `x-business-use-case-usage` headers. If reported usage is high, the script sleeps and retries up to 3 times with exponential backoff before exiting with a clear message.

### Stories limitation
Stories expire after 24 hours and their insights are only available while live or shortly after. Historical stories cannot be backfilled. Going forward, regular manual runs will capture recent stories.

## Error Handling
- **Credential / permission errors:** Print the API error and reference `docs/INSTAGRAM_SETUP.md`.
- **Rate limiting / throttling:** Sleep and retry up to 3 times; exit cleanly if still throttled.
- **Network failures:** Retry up to 3 times with exponential backoff.
- **Expired stories:** Skip gracefully with a warning.
- **Media with no insights:** Log a warning and continue.
- **Duplicate metric rows:** Handled by `INSERT OR REPLACE` on the unique keys.

## Example Analysis Queries

### Daily sales view
```sql
CREATE VIEW IF NOT EXISTS daily_sales AS
SELECT
  created_at_date AS date,
  SUM(CASE WHEN LOWER(type) = 'sale' AND LOWER(status) IN ('authorised', 'authorized') THEN curr_amount ELSE 0 END) AS total_sales,
  COUNT(CASE WHEN LOWER(type) = 'sale' AND LOWER(status) IN ('authorised', 'authorized') THEN 1 END) AS sale_count
FROM transactions
GROUP BY created_at_date;
```

### Lagged effect: Instagram yesterday → sales today
```sql
SELECT
  s.date AS sales_date,
  s.total_sales,
  ig.impressions AS ig_impressions_yesterday,
  ig.reach AS ig_reach_yesterday,
  ig.profile_views AS ig_profile_views_yesterday
FROM daily_sales s
LEFT JOIN (
  SELECT
    measured_at AS date,
    SUM(CASE WHEN metric_name = 'impressions' THEN metric_value END) AS impressions,
    SUM(CASE WHEN metric_name = 'reach' THEN metric_value END) AS reach,
    SUM(CASE WHEN metric_name = 'profile_views' THEN metric_value END) AS profile_views
  FROM instagram_account_metrics
  GROUP BY measured_at
) ig ON date(s.date, '-1 day') = ig.date
ORDER BY s.date;
```

### Per-post impact: sales in the 48 hours after a post
```sql
SELECT
  m.media_id,
  m.media_type,
  m.timestamp_local_date AS posted_date,
  SUBSTR(m.caption, 1, 80) AS caption_preview,
  mm.likes,
  mm.views,
  (
    SELECT SUM(t.curr_amount)
    FROM transactions t
    WHERE t.created_at_date BETWEEN m.timestamp_local_date AND date(m.timestamp_local_date, '+2 days')
      AND LOWER(t.type) = 'sale'
      AND LOWER(t.status) IN ('authorised', 'authorized')
  ) AS sales_48h_after_post
FROM instagram_media m
LEFT JOIN (
  SELECT
    media_id,
    SUM(CASE WHEN metric_name = 'likes' THEN metric_value END) AS likes,
    SUM(CASE WHEN metric_name = 'views' THEN metric_value END) AS views
  FROM instagram_media_metrics
  GROUP BY media_id
) mm ON m.media_id = mm.media_id
ORDER BY m.timestamp DESC;
```

## Testing
Use `bun:test`, which is built into Bun.

### Test coverage
- Media metadata upsert works correctly.
- Metric snapshots are inserted with the correct `measured_at` date.
- Running the sync twice on the same day updates metrics without duplication.
- Pacific/Auckland date conversion is correct for Instagram UTC timestamps.
- Example correlation SQL queries execute without errors and return expected shapes.

### Test data
Mock `fetch` responses representing one image post, one reel, and one story with insights payloads. Include a few mock transactions in the test database for join verification.

### Run tests
```bash
bun test
```

## Open Questions / Assumptions
1. The business Instagram account is a **Business** or **Creator** account, required for Graph API access.
2. The Facebook app and long-lived access token will be set up before implementation; `docs/INSTAGRAM_SETUP.md` will document the steps.
3. `Pacific/Auckland` is the canonical timezone for sales dates and therefore for Instagram `measured_at` dates. Daylight saving time transitions are handled by the timezone conversion logic in the script.
4. Manual sync is sufficient; no scheduler or daemon is included in this design.
5. External analysis tools (Python, Tableau, Metabase, etc.) will connect directly to `transactions.db`.
