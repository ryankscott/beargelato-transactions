import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePostImpact } from '@/hooks/useApi';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 20;
const MEDIA_TYPE_ICONS: Record<string, string> = {
  IMAGE: '📷', VIDEO: '🎬', CAROUSEL_ALBUM: '📱', REELS: '🎥', STORY: '📖',
};
const MEDIA_TYPE_OPTIONS = ['', 'IMAGE', 'VIDEO', 'CAROUSEL_ALBUM', 'REELS'];

type SortField = 'post_date' | 'uplift' | 'likes' | 'reach' | 'sales_before' | 'sales_after';
type SortDir = 'asc' | 'desc';

export function InstagramPostImpact() {
  const [window, setWindow] = useState(7);
  const [page, setPage] = useState(0);
  const [mediaType, setMediaType] = useState('');
  const [sortField, setSortField] = useState<SortField>('post_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const offset = page * PAGE_SIZE;
  const { data, isLoading, isError } = usePostImpact(window, PAGE_SIZE, offset, sortField, sortDir, mediaType || undefined);

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const showingFrom = data ? offset + 1 : 0;
  const showingTo = data ? Math.min(offset + PAGE_SIZE, data.total) : 0;

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(0);
  };

  const handleFilterChange = (val: string) => {
    setMediaType(val);
    setPage(0);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-400" />
              Post Impact Analysis
            </CardTitle>
            <CardDescription>
              Sales uplift in the {window}-day window after each post vs the {window}-day window before
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={mediaType}
              onChange={(e) => handleFilterChange(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All Types</option>
              {MEDIA_TYPE_OPTIONS.filter(Boolean).map((t) => (
                <option key={t} value={t}>{MEDIA_TYPE_ICONS[t] ?? t} {t}</option>
              ))}
            </select>
            <div className="flex bg-muted rounded-lg p-0.5 gap-0.5">
              {[3, 7, 14].map((d) => (
                <button
                  key={d}
                  onClick={() => { setWindow(d); setPage(0); }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    window === d ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">Failed to load post impact data</p>
        ) : !data?.rows.length ? (
          <p className="text-sm text-muted-foreground">No posts match the current filters</p>
        ) : (
          <>
            <div className="overflow-x-auto mb-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 text-left font-medium text-muted-foreground w-8" />
                    <th className="py-2 text-left font-medium text-muted-foreground">Post</th>
                    {[
                      { label: 'Date', field: 'post_date' as SortField },
                      { label: 'Likes', field: 'likes' as SortField },
                      { label: 'Reach', field: 'reach' as SortField },
                      { label: 'Before', field: 'sales_before' as SortField },
                      { label: 'After', field: 'sales_after' as SortField },
                      { label: 'Uplift', field: 'uplift' as SortField },
                    ].map((col) => (
                      <th
                        key={col.label}
                        className={`py-2 text-right font-medium text-muted-foreground whitespace-nowrap ${col.field ? 'cursor-pointer hover:text-foreground select-none' : ''}`}
                        onClick={() => toggleSort(col.field)}
                      >
                        <span className="inline-flex items-center gap-1 justify-end">
                          {col.label}
                          {sortField === col.field && (
                            <ArrowUpDown className={`h-3 w-3 transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`} />
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((post) => {
                    const uplift = post.uplift ?? 0;
                    const Icon = uplift > 0 ? TrendingUp : uplift < 0 ? TrendingDown : Minus;
                    const color = uplift > 0 ? 'text-emerald-400' : uplift < 0 ? 'text-red-400' : 'text-muted-foreground';
                    return (
                      <tr key={post.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 pr-2 text-base">{MEDIA_TYPE_ICONS[post.media_type] ?? '📄'}</td>
                        <td className="py-2.5 pr-4 max-w-[200px]">
                          <p className="text-xs text-muted-foreground truncate">{post.caption_preview ?? '(no caption)'}</p>
                        </td>
                        <td className="py-2.5 pr-4 text-right text-xs text-muted-foreground whitespace-nowrap">{post.post_date}</td>
                        <td className="py-2.5 pr-4 text-right text-xs font-mono">{post.likes?.toLocaleString() ?? '—'}</td>
                        <td className="py-2.5 pr-4 text-right text-xs font-mono">{post.reach?.toLocaleString() ?? '—'}</td>
                        <td className="py-2.5 pr-4 text-right text-xs font-mono">{formatCurrency(post.sales_before ?? 0)}</td>
                        <td className="py-2.5 pr-4 text-right text-xs font-mono">{formatCurrency(post.sales_after ?? 0)}</td>
                        <td className="py-2.5 text-right whitespace-nowrap">
                          <div className={`flex items-center gap-1 justify-end font-semibold ${color}`}>
                            <Icon className="h-3.5 w-3.5" />
                            <span className="text-sm">{uplift > 0 ? '+' : ''}{formatCurrency(uplift)}</span>
                          </div>
                          {post.uplift_pct != null && (
                            <p className={`text-[10px] ${color}`}>{post.uplift_pct > 0 ? '+' : ''}{post.uplift_pct}%</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Showing {showingFrom}–{showingTo} of {data.total.toLocaleString()}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-input bg-background text-xs hover:bg-accent disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    const start = Math.max(0, Math.min(page - 3, totalPages - 7));
                    const pageNum = start + i;
                    if (pageNum >= totalPages) return null;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`h-8 w-8 inline-flex items-center justify-center rounded-md text-xs font-medium transition-colors ${
                          pageNum === page
                            ? 'bg-primary text-primary-foreground'
                            : 'border border-input bg-background hover:bg-accent'
                        }`}
                      >
                        {pageNum + 1}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-input bg-background text-xs hover:bg-accent disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
