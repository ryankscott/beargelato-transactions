import { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDaily, useDailyBySource, useWeatherCorrelation } from '@/hooks/useApi';
import { formatCurrency } from '@/lib/utils';
import { CloudSun } from 'lucide-react';

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md text-popover-foreground">
      <p className="text-sm font-semibold mb-1">{d.date}</p>
      <div className="space-y-1 text-xs">
        {d.shop_revenue != null ? (
          <>
            <p className="flex justify-between gap-4">
              Shop: <span className="font-mono font-semibold text-emerald-400">{formatCurrency(d.shop_revenue)}</span>
            </p>
            {d.food_truck_revenue > 0 && (
              <p className="flex justify-between gap-4">
                Food Truck: <span className="font-mono font-semibold text-amber-400">{formatCurrency(d.food_truck_revenue)}</span>
              </p>
            )}
            <p className="flex justify-between gap-4 border-t border-border pt-1 mt-1">
              Total: <span className="font-mono font-semibold text-emerald-400">{formatCurrency(d.shop_revenue + d.food_truck_revenue)}</span>
            </p>
            <p className="flex justify-between gap-4">
              Shop Txns: <span className="font-mono">{d.shop_txns}</span>
            </p>
            <p className="flex justify-between gap-4">
              Truck Txns: <span className="font-mono">{d.food_truck_txns}</span>
            </p>
          </>
        ) : (
          <>
            <p className="flex justify-between gap-4">
              Revenue: <span className="font-mono font-semibold text-emerald-400">{formatCurrency(d.revenue)}</span>
            </p>
            <p className="flex justify-between gap-4">
              Transactions: <span className="font-mono">{d.txn_count}</span>
            </p>
            <p className="flex justify-between gap-4">
              Avg: <span className="font-mono">{formatCurrency(d.avg_txn)}</span>
            </p>
          </>
        )}
        <p className="flex justify-between gap-4">
          Avg Temp: <span className="font-mono">{d.temp_avg != null ? `${d.temp_avg}°C` : '—'}</span>
        </p>
        <p className="flex justify-between gap-4">
          Rain: <span className="font-mono">{d.rainfall_mm != null ? `${d.rainfall_mm}mm` : '—'}</span>
        </p>
      </div>
    </div>
  );
}

export function DailyWeatherChart({ includeFoodTruck = false }: { includeFoodTruck?: boolean }) {
  const daily = useDaily(30, false);
  const dailyBySource = useDailyBySource(30);
  const weather = useWeatherCorrelation(30);

  const chartData = useMemo(() => {
    if (!weather.data) return [];

    if (includeFoodTruck) {
      if (!dailyBySource.data) return [];
      const sourceMap = new Map(dailyBySource.data.map((r) => [r.date, r]));
      return weather.data.map((w) => {
        const s = sourceMap.get(w.date);
        return {
          date: w.date,
          displayDate: w.date.slice(5),
          shop_revenue: s?.shop_revenue ?? 0,
          food_truck_revenue: s?.food_truck_revenue ?? 0,
          shop_txns: s?.shop_txns ?? 0,
          food_truck_txns: s?.food_truck_txns ?? 0,
          temp_avg: w.temp_avg,
          rainfall_mm: w.rainfall_mm,
        };
      });
    }

    if (!daily.data) return [];
    const dailyMap = new Map(daily.data.map((r) => [r.date, r]));
    return weather.data.map((w) => {
      const d = dailyMap.get(w.date);
      return {
        ...w,
        displayDate: w.date.slice(5),
        revenue: d?.revenue ?? w.revenue,
        txn_count: d?.txn_count ?? w.txn_count,
        avg_txn: d?.avg_txn ?? (w.txn_count > 0 ? w.revenue / w.txn_count : 0),
      };
    });
  }, [daily.data, dailyBySource.data, weather.data, includeFoodTruck]);

  const loading = includeFoodTruck ? dailyBySource.isLoading : daily.isLoading;
  const error = includeFoodTruck ? dailyBySource.isError : daily.isError;

  if (loading || weather.isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || weather.isError) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">Failed to load daily revenue or weather data</p>
        </CardContent>
      </Card>
    );
  }

  if (chartData.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CloudSun className="h-5 w-5 text-amber-400" />
          <div>
            <CardTitle>Daily Revenue & Weather (30 days)</CardTitle>
            <CardDescription>
              {includeFoodTruck ? 'Shop vs Food truck revenue with temperature and rainfall' : 'Temperature, rainfall, and daily sales'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
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
              yAxisId="left"
              tick={{ fontSize: 10, fill: '#888' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${v}`}
              width={45}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: '#888' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}°C`}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Legend />
            {includeFoodTruck ? (
              <>
                <Bar
                  yAxisId="left"
                  dataKey="shop_revenue"
                  name="Shop"
                  stackId="revenue"
                  fill="hsl(142 70% 45%)"
                  radius={[0, 0, 0, 0]}
                  maxBarSize={16}
                />
                <Bar
                  yAxisId="left"
                  dataKey="food_truck_revenue"
                  name="Food Truck"
                  stackId="revenue"
                  fill="hsl(39 100% 50%)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={16}
                />
              </>
            ) : (
              <Bar
                yAxisId="left"
                dataKey="revenue"
                name="Revenue"
                fill="hsl(142 70% 45%)"
                radius={[4, 4, 0, 0]}
                maxBarSize={16}
              />
            )}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="temp_avg"
              name="Avg Temp °C"
              stroke="hsl(30 95% 55%)"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="rainfall_mm"
              name="Rain mm"
              stroke="hsl(200 80% 55%)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
