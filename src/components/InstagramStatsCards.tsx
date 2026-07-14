import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useInstagramSummary } from '@/hooks/useApi';
import { formatCurrency } from '@/lib/utils';
import { Image, Eye, BarChart3, Heart, Instagram } from 'lucide-react';

export function InstagramStatsCards() {
  const { data, isLoading, isError } = useInstagramSummary();

  if (isLoading) {
    return (
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium"><Skeleton className="h-4 w-20" /></CardTitle>
              <Skeleton className="h-4 w-4 rounded-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-24 mb-1" />
              <Skeleton className="h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">No Instagram data yet — run a sync first</p>
        </CardContent>
      </Card>
    );
  }

  const stats = [
    {
      title: 'Total Posts',
      value: data.totalMedia.toLocaleString(),
      sub: 'Since Jan 2025',
      icon: Image,
      accent: 'text-pink-400',
    },
    {
      title: "Today's Reach",
      value: data.todayReach.toLocaleString(),
      sub: 'Unique accounts',
      icon: Eye,
      accent: 'text-sky-400',
    },
    {
      title: 'Engagement Metrics',
      value: data.totalMetrics.toLocaleString(),
      sub: 'Collected',
      icon: Heart,
      accent: 'text-red-400',
    },
    {
      title: 'Best Post',
      value: data.topPost?.likes
        ? `${data.topPost.likes.toLocaleString()} likes`
        : 'N/A',
      sub: data.topPost?.media_type ?? '',
      icon: BarChart3,
      accent: 'text-amber-400',
    },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Instagram className="h-5 w-5 text-pink-400" />
        <h2 className="text-lg font-semibold">Instagram</h2>
        {data.lastSync && (
          <span className="text-xs text-muted-foreground">
            Synced: {new Date(data.lastSync).toLocaleDateString('en-NZ', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {s.title}
              </CardTitle>
              <s.icon className={`h-4 w-4 ${s.accent}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
