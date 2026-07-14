import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { usePostImpact } from '@/hooks/useApi';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const MEDIA_TYPE_ICONS: Record<string, string> = {
  IMAGE: '📷', VIDEO: '🎬', CAROUSEL_ALBUM: '📱', REELS: '🎥', STORY: '📖',
};

export function InstagramPostImpact() {
  const [window, setWindow] = useState(7);
  const { data, isLoading, isError } = usePostImpact(window);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-400" />
              Post Impact Analysis
            </CardTitle>
            <CardDescription>
              Sales uplift in the {window}-day window after each post vs the {window}-day window before
            </CardDescription>
          </div>
          <div className="flex bg-muted rounded-lg p-0.5 gap-0.5">
            {[3, 7, 14].map((d) => (
              <button
                key={d}
                onClick={() => setWindow(d)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  window === d ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : isError || !data?.length ? (
          <p className="text-sm text-muted-foreground">Not enough data</p>
        ) : (
          <div className="space-y-1.5">
            {data.map((post) => {
              const uplift = post.uplift ?? 0;
              const Icon = uplift > 0 ? TrendingUp : uplift < 0 ? TrendingDown : Minus;
              const color = uplift > 0 ? 'text-emerald-400' : uplift < 0 ? 'text-red-400' : 'text-muted-foreground';
              return (
                <div key={post.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border/50 hover:bg-muted/20 transition-colors text-xs">
                  <span className="text-base">{MEDIA_TYPE_ICONS[post.media_type] ?? '📄'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground truncate">
                      {post.caption_preview ?? '(no caption)'}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {post.post_date} · {post.likes?.toLocaleString() ?? '?'} likes · {post.reach?.toLocaleString() ?? '?'} reach
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Before</p>
                      <p className="text-xs font-mono">{formatCurrency(post.sales_before ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">After</p>
                      <p className="text-xs font-mono">{formatCurrency(post.sales_after ?? 0)}</p>
                    </div>
                    <div className="min-w-[80px]">
                      <div className={`flex items-center gap-1 justify-end font-semibold ${color}`}>
                        <Icon className="h-3.5 w-3.5" />
                        <span className="text-sm">{uplift > 0 ? '+' : ''}{formatCurrency(uplift)}</span>
                      </div>
                      {post.uplift_pct != null && (
                        <p className={`text-[10px] ${color}`}>
                          {post.uplift_pct > 0 ? '+' : ''}{post.uplift_pct}%
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
