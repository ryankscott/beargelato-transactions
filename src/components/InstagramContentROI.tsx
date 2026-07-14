import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useContentTypeROI } from '@/hooks/useApi';
import { formatCurrency } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { DollarSign } from 'lucide-react';

const MEDIA_EMOJI: Record<string, string> = {
  IMAGE: '📷', VIDEO: '🎬', CAROUSEL_ALBUM: '📱', REELS: '🎥',
};

const COLORS = ['#f472b6', '#38bdf8', '#a78bfa', '#facc15', '#4ade80'];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md text-popover-foreground text-xs max-w-[200px]">
      <p className="text-sm font-semibold mb-2">{MEDIA_EMOJI[d.media_type] ?? ''} {d.media_type}</p>
      <div className="space-y-1">
        <p className="flex justify-between gap-3">{d.post_count} posts</p>
        <p className="flex justify-between gap-3">
          Avg revenue 72h: <span className="font-semibold text-emerald-400">{formatCurrency(d.avg_sales_72h)}</span>
        </p>
        <p className="flex justify-between gap-3">
          Revenue/post: <span className="font-semibold">{formatCurrency(d.revenue_per_post)}</span>
        </p>
        <p className="flex justify-between gap-3">
          Avg reach: <span className="font-semibold text-sky-400">{d.avg_reach.toLocaleString()}</span>
        </p>
        <p className="flex justify-between gap-3">
          Avg likes: <span className="font-semibold text-red-400">{d.avg_likes.toLocaleString()}</span>
        </p>
      </div>
    </div>
  );
}

export function InstagramContentROI() {
  const { data, isLoading, isError } = useContentTypeROI();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data?.length) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Not enough data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-emerald-400" />
          <div>
            <CardTitle>Content Type ROI</CardTitle>
            <CardDescription>Average revenue per post type over 72 hours after posting</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Chart */}
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis
                  dataKey="media_type"
                  tick={{ fontSize: 10, fill: '#888' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#888' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v}`}
                  width={40}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="avg_sales_72h" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Stats table */}
          <div className="space-y-2">
            {data.map((row, i) => (
              <div key={row.media_type} className="flex items-center justify-between p-2 rounded-lg border border-border/50">
                <div className="flex items-center gap-2">
                  <span className="text-base">{MEDIA_EMOJI[row.media_type] ?? '📄'}</span>
                  <div>
                    <p className="text-sm font-medium">{row.media_type}</p>
                    <p className="text-[10px] text-muted-foreground">{row.post_count} posts · avg {row.avg_reach.toLocaleString()} reach</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-emerald-400">{formatCurrency(row.revenue_per_post)}</p>
                  <p className="text-[10px] text-muted-foreground">/ post</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
