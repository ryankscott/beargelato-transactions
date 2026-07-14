import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Thermometer, CloudRain } from 'lucide-react';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

interface WeatherSummary {
  today: {
    date: string;
    temp_high: number | null;
    temp_low: number | null;
    temp_avg: number | null;
    rainfall_mm: number | null;
    location_name: string;
  } | null;
  lastSync: string | null;
}

export function WeatherStatsCard() {
  const { data, isLoading } = useQuery<WeatherSummary>({
    queryKey: ['weather-summary'],
    queryFn: () => fetchJson('/api/weather/summary'),
    refetchInterval: 60 * 60_000, // hourly
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const today = data?.today;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <Thermometer className="h-4 w-4 text-amber-400" />
          Today's Weather — Auckland
        </CardTitle>
      </CardHeader>
      <CardContent>
        {today ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">High</p>
              <p className="text-xl font-bold">{today.temp_high ?? '—'}°C</p>
            </div>
            <div>
              <p className="text-muted-foreground">Low</p>
              <p className="text-xl font-bold">{today.temp_low ?? '—'}°C</p>
            </div>
            <div className="col-span-2">
              <p className="text-muted-foreground flex items-center gap-1">
                <CloudRain className="h-3 w-3" /> Rainfall
              </p>
              <p className="text-lg font-semibold">{today.rainfall_mm ?? 0} mm</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No weather data for today</p>
        )}
      </CardContent>
    </Card>
  );
}
