import { Database } from 'bun:sqlite';
import { runSync } from './sync-core.ts';
import { existsSync } from 'fs';
import path from 'path';

const DB_PATH = process.env.DB_PATH ?? 'transactions.db';
const PORT = parseInt(process.env.PORT ?? '3001') || 3001;

const db = new Database(DB_PATH);

// Serve built frontend from dist/ in production
const DIST_DIR = path.join(import.meta.dir, 'dist');
const hasStaticFiles = existsSync(DIST_DIR);
if (hasStaticFiles) {
  console.log(`📦 Serving frontend from ${DIST_DIR}`);
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // API routes
    if (url.pathname.startsWith('/api/')) {
      // CORS preflight
      if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      try {
      // GET /api/stats/summary
      if (url.pathname === '/api/stats/summary') {
        const total = db.prepare(`
          SELECT COUNT(*) as count, ROUND(SUM(orig_amount), 2) as revenue
          FROM transactions WHERE type = 'SALE' AND status = 'AUTHORISED'
        `).get() as { count: number; revenue: number };

        const lastSync = db.prepare(
          "SELECT value FROM sync_state WHERE key = 'last_sync_time'"
        ).get() as { value: string } | undefined;

        const lastTxn = db.prepare(
          "SELECT MAX(created_at_utc) as last FROM transactions"
        ).get() as { last: string };

        const avgTxn = db.prepare(`
          SELECT ROUND(AVG(orig_amount), 2) as avg
          FROM transactions WHERE type = 'SALE' AND status = 'AUTHORISED'
        `).get() as { avg: number };

        const thisMonth = new Date().toISOString().slice(0, 7);
        const monthRevenue = db.prepare(`
          SELECT ROUND(SUM(orig_amount), 2) as revenue
          FROM transactions
          WHERE type = 'SALE' AND status = 'AUTHORISED'
          AND strftime('%Y-%m', created_at_utc) = ?
        `).get(thisMonth) as { revenue: number };

        const thisYear = new Date().getFullYear().toString();
        const yearRevenue = db.prepare(`
          SELECT ROUND(SUM(orig_amount), 2) as revenue
          FROM transactions
          WHERE type = 'SALE' AND status = 'AUTHORISED'
          AND strftime('%Y', created_at_utc) = ?
        `).get(thisYear) as { revenue: number };

        const todayRevenue = db.prepare(`
          SELECT ROUND(SUM(orig_amount), 2) as revenue
          FROM transactions
          WHERE type = 'SALE' AND status = 'AUTHORISED'
          AND date(created_at_utc) = date('now')
        `).get() as { revenue: number };

        const weekRevenue = db.prepare(`
          SELECT ROUND(SUM(orig_amount), 2) as revenue
          FROM transactions
          WHERE type = 'SALE' AND status = 'AUTHORISED'
          AND strftime('%Y-%W', created_at_utc) = strftime('%Y-%W', 'now')
        `).get() as { revenue: number };

        return json({
          totalTransactions: total.count,
          totalRevenue: total.revenue,
          averageTransaction: avgTxn.avg,
          lastSyncTime: lastSync?.value ?? null,
          lastTransactionTime: lastTxn.last,
          currentMonthRevenue: monthRevenue?.revenue ?? 0,
          currentYearRevenue: yearRevenue?.revenue ?? 0,
          todayRevenue: todayRevenue?.revenue ?? 0,
          weekRevenue: weekRevenue?.revenue ?? 0,
        });
      }

      // GET /api/stats/monthly
      if (url.pathname === '/api/stats/monthly') {
        const rows = db.prepare(`
          SELECT
            strftime('%Y-%m', created_at_utc) as month,
            COUNT(*) as txn_count,
            ROUND(SUM(orig_amount), 2) as revenue,
            ROUND(AVG(orig_amount), 2) as avg_txn
          FROM transactions
          WHERE type = 'SALE' AND status = 'AUTHORISED'
          GROUP BY month
          ORDER BY month ASC
        `).all();
        return json(rows);
      }

      // GET /api/transactions?limit=50&offset=0
      if (url.pathname === '/api/transactions') {
        const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 200);
        const offset = parseInt(url.searchParams.get('offset') ?? '0');
        const rows = db.prepare(`
          SELECT * FROM transactions
          ORDER BY created_at_utc DESC
          LIMIT ? OFFSET ?
        `).all(limit, offset);
        return json(rows);
      }

      // GET /api/stats/weekly
      if (url.pathname === '/api/stats/weekly') {
        const weeks = parseInt(url.searchParams.get('weeks') ?? '12');
        const rows = db.prepare(`
          SELECT
            strftime('%Y-%W', created_at_utc) as week,
            COUNT(*) as txn_count,
            ROUND(SUM(orig_amount), 2) as revenue
          FROM transactions
          WHERE type = 'SALE' AND status = 'AUTHORISED'
          GROUP BY week
          ORDER BY week DESC
          LIMIT ?
        `).all(weeks);
        return json(rows.reverse());
      }

      // GET /api/stats/daily?days=30
      if (url.pathname === '/api/stats/daily') {
        const days = parseInt(url.searchParams.get('days') ?? '30');
        const rows = db.prepare(`
          SELECT
            created_at_date as date,
            COUNT(*) as txn_count,
            ROUND(SUM(orig_amount), 2) as revenue,
            ROUND(AVG(orig_amount), 2) as avg_txn
          FROM transactions
          WHERE type = 'SALE' AND status = 'AUTHORISED'
          GROUP BY created_at_date
          ORDER BY created_at_date DESC
          LIMIT ?
        `).all(days);
        return json(rows.reverse());
      }

      // POST /api/sync
      if (url.pathname === '/api/sync' && req.method === 'POST') {
        try {
          const result = await runSync();
          return json(result);
        } catch (err: any) {
          return json({ error: err.message ?? 'Sync failed' }, 500);
        }
      }

      // ----- Instagram -----

      // GET /api/instagram/summary
      if (url.pathname === '/api/instagram/summary') {
        const mediaCount = db.prepare('SELECT COUNT(*) as cnt FROM instagram_media').get() as { cnt: number };
        const mediaMetrics = db.prepare('SELECT COUNT(*) as cnt FROM instagram_media_metrics').get() as { cnt: number };
        const acctMetrics = db.prepare('SELECT COUNT(*) as cnt FROM instagram_account_metrics').get() as { cnt: number };

        const topPost = db.prepare(`
          SELECT m.media_id, m.caption, m.media_type, m.timestamp, mm.likes
          FROM instagram_media m
          LEFT JOIN (
            SELECT media_id, SUM(CASE WHEN metric_name='likes' THEN metric_value END) as likes
            FROM instagram_media_metrics GROUP BY media_id
          ) mm ON m.media_id = mm.media_id
          ORDER BY mm.likes DESC LIMIT 1
        `).get() as any;

        const lastDayReach = db.prepare(`
          SELECT SUM(metric_value) as total FROM instagram_account_metrics
          WHERE metric_name='reach' AND measured_at = date('now')
        `).get() as { total: number } | undefined;

        const lastSync = db.prepare(
          "SELECT value FROM sync_state WHERE key = 'instagram_last_media_sync'"
        ).get() as { value: string } | undefined;

        return json({
          totalMedia: mediaCount.cnt,
          totalMetrics: mediaMetrics.cnt,
          totalAccountMetrics: acctMetrics.cnt,
          todayReach: lastDayReach?.total ?? 0,
          topPost: topPost ?? null,
          lastSync: lastSync?.value ?? null,
        });
      }

      // GET /api/instagram/media?limit=20
      if (url.pathname === '/api/instagram/media') {
        const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 50);
        const rows = db.prepare(`
          SELECT
            m.id, m.media_id, m.media_type, m.caption, m.permalink,
            m.thumbnail_url, m.timestamp, m.timestamp_local_date,
            mm.reach, mm.likes, mm.comments, mm.shares, mm.saved, mm.total_interactions
          FROM instagram_media m
          LEFT JOIN (
            SELECT media_id,
              SUM(CASE WHEN metric_name='reach' THEN metric_value END) as reach,
              SUM(CASE WHEN metric_name='likes' THEN metric_value END) as likes,
              SUM(CASE WHEN metric_name='comments' THEN metric_value END) as comments,
              SUM(CASE WHEN metric_name='shares' THEN metric_value END) as shares,
              SUM(CASE WHEN metric_name='saved' THEN metric_value END) as saved,
              SUM(CASE WHEN metric_name='total_interactions' THEN metric_value END) as total_interactions
            FROM instagram_media_metrics GROUP BY media_id
          ) mm ON m.media_id = mm.media_id
          ORDER BY m.timestamp DESC
          LIMIT ?
        `).all(limit);
        return json(rows);
      }

      // GET /api/instagram/daily?days=30
      if (url.pathname === '/api/instagram/daily') {
        const days = parseInt(url.searchParams.get('days') ?? '30');
        const rows = db.prepare(`
          SELECT measured_at as date, metric_name, SUM(metric_value) as value
          FROM instagram_account_metrics
          WHERE measured_at >= date('now', '-' || ? || ' days')
          GROUP BY measured_at, metric_name
          ORDER BY measured_at ASC
        `).all(days);
        return json(rows);
      }

      // GET /api/instagram/post-impact?days=7
      if (url.pathname === '/api/instagram/post-impact') {
        const windowDays = parseInt(url.searchParams.get('days') ?? '7');
        const rows = db.prepare(`
          WITH post_sales AS (
            SELECT
              m.id,
              m.media_id,
              m.media_type,
              m.timestamp_local_date AS post_date,
              SUBSTR(m.caption, 1, 100) AS caption_preview,
              mm.likes,
              mm.reach,
              mm.saved,
              mm.shares,
              mm.comments,
              -- Sales in window BEFORE post
              (
                SELECT ROUND(SUM(curr_amount), 2) FROM transactions
                WHERE type='SALE' AND status='AUTHORISED'
                  AND created_at_date >= date(m.timestamp_local_date, '-' || ? || ' days')
                  AND created_at_date < m.timestamp_local_date
              ) AS sales_before,
              -- Sales in window AFTER post
              (
                SELECT ROUND(SUM(curr_amount), 2) FROM transactions
                WHERE type='SALE' AND status='AUTHORISED'
                  AND created_at_date > m.timestamp_local_date
                  AND created_at_date <= date(m.timestamp_local_date, '+' || ? || ' days')
              ) AS sales_after
            FROM instagram_media m
            LEFT JOIN (
              SELECT media_id,
                SUM(CASE WHEN metric_name='likes' THEN metric_value END) as likes,
                SUM(CASE WHEN metric_name='reach' THEN metric_value END) as reach,
                SUM(CASE WHEN metric_name='saved' THEN metric_value END) as saved,
                SUM(CASE WHEN metric_name='shares' THEN metric_value END) as shares,
                SUM(CASE WHEN metric_name='comments' THEN metric_value END) as comments
              FROM instagram_media_metrics GROUP BY media_id
            ) mm ON m.media_id = mm.media_id
          )
          SELECT *,
            ROUND(COALESCE(sales_after, 0) - COALESCE(sales_before, 0), 2) AS uplift,
            CASE WHEN COALESCE(sales_before, 0) > 0
              THEN ROUND(((COALESCE(sales_after, 0) - COALESCE(sales_before, 0)) / sales_before) * 100, 1)
              ELSE NULL
            END AS uplift_pct
          FROM post_sales
          ORDER BY post_date DESC
          LIMIT 50
        `).all(windowDays, windowDays);
        return json(rows);
      }

      // GET /api/instagram/content-type-roi
      if (url.pathname === '/api/instagram/content-type-roi') {
        const rows = db.prepare(`
          WITH post_sales AS (
            SELECT
              m.media_type,
              m.id,
              COALESCE(mm.likes, 0) AS likes,
              COALESCE(mm.reach, 0) AS reach,
              COALESCE(mm.saved, 0) AS saved,
              COALESCE(mm.shares, 0) AS shares,
              (
                SELECT ROUND(SUM(curr_amount), 2) FROM transactions
                WHERE type='SALE' AND status='AUTHORISED'
                  AND created_at_date >= m.timestamp_local_date
                  AND created_at_date <= date(m.timestamp_local_date, '+3 days')
              ) AS sales_72h
            FROM instagram_media m
            LEFT JOIN (
              SELECT media_id,
                SUM(CASE WHEN metric_name='likes' THEN metric_value END) as likes,
                SUM(CASE WHEN metric_name='reach' THEN metric_value END) as reach,
                SUM(CASE WHEN metric_name='saved' THEN metric_value END) as saved,
                SUM(CASE WHEN metric_name='shares' THEN metric_value END) as shares
              FROM instagram_media_metrics GROUP BY media_id
            ) mm ON m.media_id = mm.media_id
          )
          SELECT
            media_type,
            COUNT(*) AS post_count,
            ROUND(AVG(likes)) AS avg_likes,
            ROUND(AVG(reach)) AS avg_reach,
            ROUND(AVG(saved)) AS avg_saved,
            ROUND(AVG(shares)) AS avg_shares,
            ROUND(AVG(COALESCE(sales_72h, 0)), 2) AS avg_sales_72h,
            ROUND(SUM(COALESCE(sales_72h, 0)), 2) AS total_sales_72h,
            ROUND(SUM(COALESCE(sales_72h, 0)) / COUNT(*), 2) AS revenue_per_post
          FROM post_sales
          GROUP BY media_type
          ORDER BY revenue_per_post DESC
        `).all();
        return json(rows);
      }

      // GET /api/instagram/correlation?days=30
      if (url.pathname === '/api/instagram/correlation') {
        const days = parseInt(url.searchParams.get('days') ?? '30');
        const rows = db.prepare(`
          SELECT
            s.date,
            s.total_sales as revenue,
            ig.reach,
            ig.profile_views
          FROM (
            SELECT created_at_date as date,
              ROUND(SUM(curr_amount), 2) as total_sales
            FROM transactions
            WHERE type='SALE' AND status='AUTHORISED'
              AND created_at_date >= date('now', '-' || ? || ' days')
            GROUP BY created_at_date
          ) s
          LEFT JOIN (
            SELECT
              measured_at as date,
              SUM(CASE WHEN metric_name='reach' THEN metric_value END) as reach,
              SUM(CASE WHEN metric_name='profile_views' THEN metric_value END) as profile_views
            FROM instagram_account_metrics
            GROUP BY measured_at
          ) ig ON s.date = ig.date
          ORDER BY s.date ASC
        `).all(days);
        return json(rows);
      }

      // ----- Weather -----

      // GET /api/weather/daily?days=30
      if (url.pathname === '/api/weather/daily') {
        const days = Math.min(parseInt(url.searchParams.get('days') ?? '30'), 365);
        const rows = db.prepare(`
          SELECT date, temp_high, temp_low, temp_avg, rainfall_mm
          FROM weather_daily
          WHERE date >= date('now', '-' || ? || ' days')
          ORDER BY date ASC
        `).all(days);
        return json(rows);
      }

      // GET /api/weather/summary
      if (url.pathname === '/api/weather/summary') {
        const today = db.prepare(`
          SELECT * FROM weather_daily WHERE date = date('now')
        `).get();

        const lastSync = db.prepare(
          "SELECT value FROM sync_state WHERE key = 'weather_last_sync'"
        ).get() as { value: string } | undefined;

        return json({
          today: today ?? null,
          lastSync: lastSync?.value ?? null,
        });
      }

      // GET /api/weather/correlation?days=30
      if (url.pathname === '/api/weather/correlation') {
        const days = Math.min(parseInt(url.searchParams.get('days') ?? '30'), 365);
        const rows = db.prepare(`
          SELECT
            s.date,
            ROUND(s.revenue, 2) as revenue,
            s.txn_count,
            w.temp_avg,
            w.temp_high,
            w.temp_low,
            w.rainfall_mm
          FROM (
            SELECT
              created_at_date as date,
              SUM(curr_amount) as revenue,
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

      return json({ error: 'Not found' }, 404);
    } catch (err: any) {
      console.error(`API error:`, err);
      return json({ error: err.message ?? 'Internal error' }, 500);
    }
  }

  // ----- Static files -----
    if (!hasStaticFiles) {
      return new Response('Dashboard not built. Run: bunx vite build', { status: 200 });
    }

    // SPA: serve index.html for root and non-file routes
    const filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const fullPath = path.join(DIST_DIR, filePath);

    if (existsSync(fullPath)) {
      const ext = path.extname(fullPath);
      const mime = MIME_TYPES[ext] ?? 'application/octet-stream';
      const file = Bun.file(fullPath);
      return new Response(file, {
        headers: { 'Content-Type': mime },
      });
    }

    // SPA fallback: serve index.html for any unmatched path
    const indexFile = Bun.file(path.join(DIST_DIR, 'index.html'));
    return new Response(indexFile, {
      headers: { 'Content-Type': 'text/html' },
    });
  },
});

console.log(`🐻🍦 Bear Gelato API server running on http://localhost:${PORT}`);
