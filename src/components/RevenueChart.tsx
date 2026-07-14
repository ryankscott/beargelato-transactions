import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useMonthly } from '@/hooks/useApi';
import { formatCurrency, formatMonth } from '@/lib/utils';
import { TrendingUp } from 'lucide-react';

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md text-popover-foreground">
      <p className="text-sm font-semibold mb-1">{label}</p>
      <div className="space-y-1 text-xs">
        <p className="flex justify-between gap-4">
          Revenue: <span className="font-mono font-semibold text-emerald-400">{formatCurrency(d.revenue)}</span>
        </p>
        <p className="flex justify-between gap-4">
          Transactions: <span className="font-mono">{d.txn_count.toLocaleString()}</span>
        </p>
        <p className="flex justify-between gap-4">
          Avg: <span className="font-mono">{formatCurrency(d.avg_txn)}</span>
        </p>
      </div>
    </div>
  );
}

export function RevenueChart() {
  const { data, isLoading, isError } = useMonthly();

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((row) => ({
      ...row,
      displayMonth: formatMonth(row.month),
      revenueLabel: formatCurrency(row.revenue),
    }));
  }, [data]);

  const avgRevenue = useMemo(() => {
    if (!chartData.length) return 0;
    return chartData.reduce((s, d) => s + d.revenue, 0) / chartData.length;
  }, [chartData]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">Failed to load chart data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-400" />
              Monthly Revenue
            </CardTitle>
            <CardDescription>Authorised NZD sales over time</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
            <XAxis
              dataKey="displayMonth"
              tick={{ fontSize: 11, fill: '#888' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#888' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              width={50}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <ReferenceLine
              y={avgRevenue}
              stroke="#facc15"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: `Avg ${formatCurrency(avgRevenue)}`,
                position: 'insideTopRight',
                fill: '#facc15',
                fontSize: 11,
              }}
            />
            <Bar
              dataKey="revenue"
              fill="hsl(142 70% 45%)"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
