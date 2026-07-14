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

export function useSummary() {
  return useQuery<SummaryStats>({
    queryKey: ['summary'],
    queryFn: () => fetchJson(`${BASE}/stats/summary`),
    refetchInterval: 60_000,
  });
}

export function useMonthly() {
  return useQuery<MonthlyRow[]>({
    queryKey: ['monthly'],
    queryFn: () => fetchJson(`${BASE}/stats/monthly`),
    staleTime: 5 * 60_000,
  });
}

export function useDaily(days = 30) {
  return useQuery<DailyRow[]>({
    queryKey: ['daily', days],
    queryFn: () => fetchJson(`${BASE}/stats/daily?days=${days}`),
    staleTime: 5 * 60_000,
  });
}

export function useWeekly(weeks = 12) {
  return useQuery<WeeklyRow[]>({
    queryKey: ['weekly', weeks],
    queryFn: () => fetchJson(`${BASE}/stats/weekly?weeks=${weeks}`),
    staleTime: 5 * 60_000,
  });
}

export function useTransactions(limit = 50, offset = 0) {
  return useQuery<Transaction[]>({
    queryKey: ['transactions', limit, offset],
    queryFn: () => fetchJson(`${BASE}/transactions?limit=${limit}&offset=${offset}`),
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

export function usePostImpact(days = 7) {
  return useQuery<PostImpact[]>({
    queryKey: ['instagram-post-impact', days],
    queryFn: () => fetchJson(`${BASE}/instagram/post-impact?days=${days}`),
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
