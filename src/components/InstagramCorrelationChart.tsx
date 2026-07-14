import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useInstagramCorrelation } from '@/hooks/useApi';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp, Activity } from 'lucide-react';

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md text-popover-foreground text-xs">
      <p className="text-sm font-semibold mb-1">{d.date}</p>
      <div className="space-y-1">
        <p className="flex justify-between gap-3">
          Revenue: <span className="font-mono font-semibold text-emerald-400">{formatCurrency(d.revenue)}</span>
        </p>
        <p className="flex justify-between gap-3">
          Reach: <span className="font-mono font-semibold text-sky-400">{d.reach?.toLocaleString() ?? '—'}</span>
        </p>
      </div>
    </div>
  );
}

export function InstagramCorrelationChart() {
  const { data, isLoading, isError } = useInstagramCorrelation(30);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((row) => ({
      ...row,
      displayDate: row.date.slice(5),
    }));
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-36" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[220px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !chartData.length) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Not enough data for correlation yet</p>
        </CardContent>
      </Card>
    );
  }

  // Only show days where we have both revenue and reach
  const hasCorrelation = chartData.some((d) => d.reach != null && d.revenue > 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-pink-400" />
          <div>
            <CardTitle>Sales vs Instagram Reach</CardTitle>
            <CardDescription>
              {hasCorrelation
                ? 'Revenue (bars) overlayed with daily reach (line) — last 30 days'
                : 'Sync Instagram data first to see correlation'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
            <XAxis
              dataKey="displayDate"
              tick={{ fontSize: 10, fill: '#888' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="revenue"
              tick={{ fontSize: 10, fill: '#888' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${v}`}
              width={45}
            />
            <YAxis
              yAxisId="reach"
              orientation="right"
              tick={{ fontSize: 10, fill: '#888' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              yAxisId="revenue"
              dataKey="revenue"
              fill="hsl(142 70% 45%)"
              radius={[3, 3, 0, 0]}
              maxBarSize={16}
              opacity={0.6}
            />
            <Line
              yAxisId="reach"
              type="monotone"
              dataKey="reach"
              stroke="#38bdf8"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: '#38bdf8', stroke: '#fff', strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
