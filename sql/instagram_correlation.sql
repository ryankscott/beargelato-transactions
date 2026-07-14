-- ---------------------------------------------------------------------------
-- Helper view: daily sales
-- ---------------------------------------------------------------------------
CREATE VIEW IF NOT EXISTS daily_sales AS
SELECT
  created_at_date AS date,
  SUM(
    CASE
      WHEN LOWER(type) = 'sale' AND LOWER(status) IN ('authorised', 'authorized')
      THEN curr_amount
      ELSE 0
    END
  ) AS total_sales,
  COUNT(
    CASE
      WHEN LOWER(type) = 'sale' AND LOWER(status) IN ('authorised', 'authorized')
      THEN 1
    END
  ) AS sale_count
FROM transactions
GROUP BY created_at_date;

-- ---------------------------------------------------------------------------
-- Lagged effect: Instagram activity yesterday vs sales today
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Same-day correlation: sales vs Instagram activity
-- ---------------------------------------------------------------------------
SELECT
  s.date AS sales_date,
  s.total_sales,
  ig.impressions,
  ig.reach,
  ig.profile_views
FROM daily_sales s
LEFT JOIN (
  SELECT
    measured_at AS date,
    SUM(CASE WHEN metric_name = 'impressions' THEN metric_value END) AS impressions,
    SUM(CASE WHEN metric_name = 'reach' THEN metric_value END) AS reach,
    SUM(CASE WHEN metric_name = 'profile_views' THEN metric_value END) AS profile_views
  FROM instagram_account_metrics
  GROUP BY measured_at
) ig ON s.date = ig.date
ORDER BY s.date;

-- ---------------------------------------------------------------------------
-- Per-post impact: sales in the 48 hours after a post
-- ---------------------------------------------------------------------------
SELECT
  m.media_id,
  m.media_type,
  m.timestamp_local_date AS posted_date,
  SUBSTR(m.caption, 1, 80) AS caption_preview,
  mm.likes,
  mm.views,
  mm.impressions,
  mm.reach,
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
    SUM(CASE WHEN metric_name = 'views' THEN metric_value END) AS views,
    SUM(CASE WHEN metric_name = 'impressions' THEN metric_value END) AS impressions,
    SUM(CASE WHEN metric_name = 'reach' THEN metric_value END) AS reach
  FROM instagram_media_metrics
  GROUP BY media_id
) mm ON m.media_id = mm.media_id
ORDER BY m.timestamp DESC;

-- ---------------------------------------------------------------------------
-- Daily post count and total engagement vs sales
-- ---------------------------------------------------------------------------
WITH daily_ig AS (
  SELECT
    m.timestamp_local_date AS date,
    COUNT(DISTINCT m.media_id) AS post_count,
    SUM(CASE WHEN mm.metric_name = 'likes' THEN mm.metric_value ELSE 0 END) AS likes,
    SUM(CASE WHEN mm.metric_name = 'views' THEN mm.metric_value ELSE 0 END) AS views,
    SUM(CASE WHEN mm.metric_name = 'impressions' THEN mm.metric_value ELSE 0 END) AS impressions
  FROM instagram_media m
  LEFT JOIN instagram_media_metrics mm ON m.media_id = mm.media_id
  GROUP BY m.timestamp_local_date
)
SELECT
  s.date AS sales_date,
  s.total_sales,
  COALESCE(d.post_count, 0) AS posts_that_day,
  COALESCE(d.likes, 0) AS likes_that_day,
  COALESCE(d.views, 0) AS views_that_day,
  COALESCE(d.impressions, 0) AS impressions_that_day
FROM daily_sales s
LEFT JOIN daily_ig d ON s.date = d.date
ORDER BY s.date;
