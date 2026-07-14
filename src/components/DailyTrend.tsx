import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDaily } from '@/hooks/useApi';
import { formatCurrency } from '@/lib/utils';
import { CalendarDays } from 'lucide-react';

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md text-popover-foreground">
      <p className="text-sm font-semibold mb-1">{d.date}</p>
      <div className="space-y-1 text-xs">
        <p className="flex justify-between gap-4">
          Revenue: <span className="font-mono font-semibold text-emerald-400">{formatCurrency(d.revenue)}</span>
        </p>
        <p className="flex justify-between gap-4">
          Transactions: <span className="font-mono">{d.txn_count}</span>
        </p>
        <p className="flex justify-between gap-4">
          Avg: <span className="font-mono">{formatCurrency(d.avg_txn)}</span>
        </p>
      </div>
    </div>
  );
}

export function DailyTrend({ includeFoodTruck = false }: { includeFoodTruck?: boolean }) {
  const { data, isLoading, isError } = useDaily(30, includeFoodTruck);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((row) => ({
      ...row,
      displayDate: row.date.slice(5), // MM-DD
    }));
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">Failed to load daily data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-sky-400" />
          <div>
            <CardTitle>Daily Revenue (30 days)</CardTitle>
            <CardDescription>Day-by-day sales trend</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
            <XAxis
              dataKey="displayDate"
              tick={{ fontSize: 10, fill: '#888' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#888' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${v}`}
              width={45}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar dataKey="revenue" fill="hsl(142 70% 45%)" radius={[4, 4, 0, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
