WITH daily AS (
  SELECT
    created_at_date,
    substr(created_at_date, 1, 7) AS month,
    CASE
      WHEN CAST(strftime('%m', created_at_date) AS INTEGER) IN (12, 1, 2) THEN 'Summer'
      WHEN CAST(strftime('%m', created_at_date) AS INTEGER) IN (3, 4, 5) THEN 'Autumn'
      WHEN CAST(strftime('%m', created_at_date) AS INTEGER) IN (6, 7, 8) THEN 'Winter'
      WHEN CAST(strftime('%m', created_at_date) AS INTEGER) IN (9, 10, 11) THEN 'Spring'
      ELSE 'Unknown'
    END AS season,
    SUM(curr_amount) AS total_sales,
    SUM(
      CASE
        WHEN time(created_at_time) >= '21:30:00' THEN curr_amount
        ELSE 0
      END
    ) AS late_sales
  FROM transactions
  WHERE LOWER(type) = 'sale'
    AND LOWER(status) IN ('authorised', 'authorized')
    AND strftime('%w', created_at_date) IN ('2', '3', '4')
    AND time(created_at_time) >= '18:00:00'
  GROUP BY created_at_date
),

half_hour_revenue AS (
  SELECT
    CASE
      WHEN CAST(strftime('%m', created_at_date) AS INTEGER) IN (12, 1, 2) THEN 'Summer'
      WHEN CAST(strftime('%m', created_at_date) AS INTEGER) IN (3, 4, 5) THEN 'Autumn'
      WHEN CAST(strftime('%m', created_at_date) AS INTEGER) IN (6, 7, 8) THEN 'Winter'
      WHEN CAST(strftime('%m', created_at_date) AS INTEGER) IN (9, 10, 11) THEN 'Spring'
      ELSE 'Unknown'
    END AS season,
    printf('%02d:%02d',
      CAST(strftime('%H', created_at_time) AS INTEGER),
      CASE
        WHEN CAST(strftime('%M', created_at_time) AS INTEGER) < 30 THEN 0
        ELSE 30
      END
    ) AS half_hour,
    SUM(curr_amount) AS half_hour_sales
  FROM transactions
  WHERE LOWER(type) = 'sale'
    AND LOWER(status) IN ('authorised', 'authorized')
    AND strftime('%w', created_at_date) IN ('2', '3', '4')
    AND time(created_at_time) >= '18:00:00'
  GROUP BY season, half_hour
),

monthly as (SELECT
  month,
  season,
  COUNT(*) AS days_in_month,
  ROUND(AVG(
    CASE
      WHEN total_sales > 0 THEN 100.0 * late_sales / total_sales
      ELSE 0
    END
  ), 2) AS avg_daily_late_pct,
  ROUND(AVG(late_sales), 2) AS avg_daily_late_amount,
  ROUND(AVG(total_sales), 2) AS avg_daily_sales_amount
FROM daily
GROUP BY month, season
ORDER BY month, season),

season as (SELECT
  season,
  COUNT(*) AS days_in_season,
  ROUND(AVG(
    CASE
      WHEN total_sales > 0 THEN 100.0 * late_sales / total_sales
      ELSE 0
    END
  ), 2) AS avg_daily_late_pct,
  ROUND(AVG(late_sales), 2) AS avg_daily_late_amount,
  ROUND(AVG(total_sales), 2) AS avg_daily_sales_amount
FROM daily
GROUP BY season
ORDER BY season),

season_totals AS (
  SELECT
    season,
    SUM(half_hour_sales) AS season_sales
  FROM half_hour_revenue
  GROUP BY season
)

SELECT
  h.season,
  h.half_hour,
  h.half_hour_sales,
  ROUND(100.0 * h.half_hour_sales / st.season_sales, 2) AS pct_of_season_sales
FROM half_hour_revenue h
JOIN season_totals st USING(season)
ORDER BY h.season, h.half_hour;
