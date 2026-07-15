import { useQuery } from '@tanstack/react-query';

const BASE = '/api';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// --- Types ---

export interface Transaction {
  id: number;
  organisation: string;
  created_at_date: string;
  created_at_time: string;
  created_at_timezone: string;
  created_at_utc: string;
  reference: string;
  product: string;
  orig_amount: number;
  orig_amount_currency: string;
  curr_amount: number;
  curr_amount_currency: string;
  type: string;
  status: string;
  merchant_reference: string;
  terminal_id: string | null;
}

export interface SummaryStats {
  totalTransactions: number;
  totalRevenue: number;
  averageTransaction: number;
  lastSyncTime: string | null;
  lastTransactionTime: string | null;
  currentMonthRevenue: number;
  currentYearRevenue: number;
  todayRevenue: number;
  weekRevenue: number;
}

export interface MonthlyRow {
  month: string;
  txn_count: number;
  revenue: number;
  avg_txn: number;
}

export interface DailyRow {
  date: string;
  txn_count: number;
  revenue: number;
  avg_txn: number;
}

export interface WeeklyRow {
  week: string;
  txn_count: number;
  revenue: number;
}

// --- Hooks ---

export function useSummary(includeFoodTruck = false) {
  return useQuery<SummaryStats>({
    queryKey: ['summary', includeFoodTruck],
    queryFn: () => fetchJson(`${BASE}/stats/summary?include_food_truck=${includeFoodTruck}`),
    refetchInterval: 60_000,
  });
}

export function useMonthly(includeFoodTruck = false) {
  return useQuery<MonthlyRow[]>({
    queryKey: ['monthly', includeFoodTruck],
    queryFn: () => fetchJson(`${BASE}/stats/monthly?include_food_truck=${includeFoodTruck}`),
    staleTime: 5 * 60_000,
  });
}

export interface DailyBySourceRow {
  date: string;
  shop_revenue: number;
  food_truck_revenue: number;
  shop_txns: number;
  food_truck_txns: number;
}

export interface MonthlyBySourceRow {
  month: string;
  shop_revenue: number;
  food_truck_revenue: number;
  shop_txns: number;
  food_truck_txns: number;
}

export function useMonthlyBySource() {
  return useQuery<MonthlyBySourceRow[]>({
    queryKey: ['monthly-by-source'],
    queryFn: () => fetchJson(`${BASE}/stats/monthly-by-source`),
    staleTime: 5 * 60_000,
  });
}

export function useDailyBySource(days = 30) {
  return useQuery<DailyBySourceRow[]>({
    queryKey: ['daily-by-source', days],
    queryFn: () => fetchJson(`${BASE}/stats/daily-by-source?days=${days}`),
    staleTime: 5 * 60_000,
  });
}

export function useDaily(days = 30, includeFoodTruck = false) {
  return useQuery<DailyRow[]>({
    queryKey: ['daily', days, includeFoodTruck],
    queryFn: () => fetchJson(`${BASE}/stats/daily?days=${days}&include_food_truck=${includeFoodTruck}`),
    staleTime: 5 * 60_000,
  });
}

export function useWeekly(weeks = 12, includeFoodTruck = false) {
  return useQuery<WeeklyRow[]>({
    queryKey: ['weekly', weeks, includeFoodTruck],
    queryFn: () => fetchJson(`${BASE}/stats/weekly?weeks=${weeks}&include_food_truck=${includeFoodTruck}`),
    staleTime: 5 * 60_000,
  });
}

export interface TransactionPage {
  rows: Transaction[];
  total: number;
}

export function useTransactions(limit = 50, offset = 0, includeFoodTruck = false, type?: string, status?: string, sort?: string, dir?: string) {
  return useQuery<TransactionPage>({
    queryKey: ['transactions', limit, offset, includeFoodTruck, type, status, sort, dir],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset), include_food_truck: String(includeFoodTruck) });
      if (type) params.set('type', type);
      if (status) params.set('status', status);
      if (sort) params.set('sort', sort);
      if (dir) params.set('dir', dir);
      return fetchJson(`${BASE}/transactions?${params}`);
    },
    staleTime: 60_000,
  });
}

// --- Instagram Types ---

export interface InstagramSummary {
  totalMedia: number;
  totalMetrics: number;
  totalAccountMetrics: number;
  todayReach: number;
  topPost: {
    media_id: string;
    caption: string;
    media_type: string;
    timestamp: string;
    likes: number;
  } | null;
  lastSync: string | null;
}

export interface InstagramMedia {
  id: number;
  media_id: string;
  media_type: string;
  caption: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  timestamp: string;
  timestamp_local_date: string;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saved: number | null;
  total_interactions: number | null;
}

export interface InstagramDailyRow {
  date: string;
  metric_name: string;
  value: number;
}

export interface InstagramCorrelationRow {
  date: string;
  revenue: number;
  reach: number | null;
  profile_views: number | null;
}

// --- Instagram Hooks ---

export function useInstagramSummary() {
  return useQuery<InstagramSummary>({
    queryKey: ['instagram-summary'],
    queryFn: () => fetchJson(`${BASE}/instagram/summary`),
    refetchInterval: 60_000,
  });
}

export function useInstagramMedia(limit = 20) {
  return useQuery<InstagramMedia[]>({
    queryKey: ['instagram-media', limit],
    queryFn: () => fetchJson(`${BASE}/instagram/media?limit=${limit}`),
    staleTime: 5 * 60_000,
  });
}

export function useInstagramDaily(days = 30) {
  return useQuery<InstagramDailyRow[]>({
    queryKey: ['instagram-daily', days],
    queryFn: () => fetchJson(`${BASE}/instagram/daily?days=${days}`),
    staleTime: 5 * 60_000,
  });
}

export function useInstagramCorrelation(days = 30) {
  return useQuery<InstagramCorrelationRow[]>({
    queryKey: ['instagram-correlation', days],
    queryFn: () => fetchJson(`${BASE}/instagram/correlation?days=${days}`),
    staleTime: 5 * 60_000,
  });
}

// --- Correlation Analysis Types ---

export interface PostImpact {
  id: number;
  media_id: string;
  media_type: string;
  post_date: string;
  caption_preview: string | null;
  likes: number | null;
  reach: number | null;
  saved: number | null;
  shares: number | null;
  comments: number | null;
  sales_before: number | null;
  sales_after: number | null;
  uplift: number | null;
  uplift_pct: number | null;
}

export interface ContentTypeROI {
  media_type: string;
  post_count: number;
  avg_likes: number;
  avg_reach: number;
  avg_saved: number;
  avg_shares: number;
  avg_sales_72h: number;
  total_sales_72h: number;
  revenue_per_post: number;
}

// --- Analysis Hooks ---

export interface PostImpactPage {
  rows: PostImpact[];
  total: number;
}

export function usePostImpact(days = 7, limit = 20, offset = 0, sort?: string, dir?: string, mediaType?: string) {
  return useQuery<PostImpactPage>({
    queryKey: ['instagram-post-impact', days, limit, offset, sort, dir, mediaType],
    queryFn: () => {
      const params = new URLSearchParams({ days: String(days), limit: String(limit), offset: String(offset) });
      if (sort) params.set('sort', sort);
      if (dir) params.set('dir', dir);
      if (mediaType) params.set('media_type', mediaType);
      return fetchJson(`${BASE}/instagram/post-impact?${params}`);
    },
    staleTime: 5 * 60_000,
  });
}

export function useContentTypeROI() {
  return useQuery<ContentTypeROI[]>({
    queryKey: ['instagram-content-type-roi'],
    queryFn: () => fetchJson(`${BASE}/instagram/content-type-roi`),
    staleTime: 5 * 60_000,
  });
}

// --- Weather Types ---

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
  temp_low: number | null;
  rainfall_mm: number | null;
}

// --- Weather Hooks ---

export function useWeatherDaily(days = 30) {
  return useQuery<WeatherDailyRow[]>({
    queryKey: ['weather-daily', days],
    queryFn: () => fetchJson(`${BASE}/weather/daily?days=${days}`),
    staleTime: 30 * 60_000,
  });
}

export function useWeatherCorrelation(days = 30) {
  return useQuery<WeatherCorrelationRow[]>({
    queryKey: ['weather-correlation', days],
    queryFn: () => fetchJson(`${BASE}/weather/correlation?days=${days}`),
    staleTime: 5 * 60_000,
  });
}
