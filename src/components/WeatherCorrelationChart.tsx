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
import { useWeatherCorrelation } from '@/hooks/useApi';
import { CloudSun } from 'lucide-react';

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md text-popover-foreground">
      <p className="text-sm font-semibold mb-1">{label}</p>
      <div className="space-y-1 text-xs">
        {payload.map((p: any, i: number) => (
          <p key={i} className="flex justify-between gap-4">
            {p.name}: <span className="font-mono" style={{ color: p.color }}>{p.value}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

export function WeatherCorrelationChart() {
  const { data, isLoading, isError } = useWeatherCorrelation(30);

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
        <CardHeader><Skeleton className="h-5 w-64" /></CardHeader>
        <CardContent><Skeleton className="h-[300px] w-full" /></CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">Failed to load weather data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CloudSun className="h-5 w-5 text-amber-400" />
          <div>
            <CardTitle>Weather vs Revenue (30 days)</CardTitle>
            <CardDescription>Temperature, rainfall, and daily sales</CardDescription>
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
            <Bar
              yAxisId="left"
              dataKey="revenue"
              name="Revenue"
              fill="hsl(142 70% 45%)"
              radius={[4, 4, 0, 0]}
              maxBarSize={16}
            />
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
