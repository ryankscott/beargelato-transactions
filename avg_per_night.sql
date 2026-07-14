WITH late_by_day AS (
  SELECT
    created_at_date,
    SUM(CASE WHEN time(created_at_time) >= '21:30:00' THEN curr_amount ELSE 0 END) AS late_sales
  FROM transactions
  WHERE LOWER(type) = 'sale'
    AND LOWER(status) IN ('authorised', 'authorized')
    AND strftime('%w', created_at_date) IN ('2', '3', '4')
    AND created_at_date >= '2026-01-01'
  GROUP BY created_at_date
),
ordered AS (
  SELECT
    late_sales,
    ROW_NUMBER() OVER (ORDER BY late_sales) AS rn,
    COUNT(*) OVER () AS n
  FROM late_by_day
)
SELECT
  n AS nights,
  ROUND(SUM(late_sales), 2) AS total_late_sales,
  ROUND(AVG(late_sales), 2) AS avg_per_night_after_930,
  ROUND(
    CASE
      WHEN n % 2 = 1 THEN
        MAX(CASE WHEN rn = (n + 1) / 2 THEN late_sales END)
      ELSE
        (MAX(CASE WHEN rn = n / 2 THEN late_sales END) +
         MAX(CASE WHEN rn = n / 2 + 1 THEN late_sales END)) / 2.0
    END
  , 2) AS median_per_night_after_930
FROM ordered;
