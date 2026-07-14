import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSummary } from '@/hooks/useApi';
import { formatCurrency } from '@/lib/utils';
import { DollarSign, ShoppingCart, Calendar, CalendarDays } from 'lucide-react';

export function StatsCards({ includeFoodTruck = false }: { includeFoodTruck?: boolean }) {
  const { data, isLoading, isError } = useSummary(includeFoodTruck);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                <Skeleton className="h-4 w-24" />
              </CardTitle>
              <Skeleton className="h-4 w-4 rounded-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-28 mb-1" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-destructive/50">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">Failed to load stats</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stats = [
    {
      title: 'This Year',
      value: formatCurrency(data.currentYearRevenue),
      sub: `${data.totalTransactions.toLocaleString()} transactions · ${new Date().getFullYear()}`,
      icon: ShoppingCart,
      accent: 'text-sky-400',
    },
    {
      title: 'This Month',
      value: formatCurrency(data.currentMonthRevenue),
      sub: new Date().toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' }),
      icon: Calendar,
      accent: 'text-indigo-400',
    },
    {
      title: 'This Week',
      value: formatCurrency(data.weekRevenue),
      sub: `Week ${Math.ceil(new Date().getDate() / 7)} of ${new Date().toLocaleDateString('en-NZ', { month: 'long' })}`,
      icon: CalendarDays,
      accent: 'text-cyan-400',
    },
    {
      title: 'Average Transaction',
      value: formatCurrency(data.averageTransaction),
      sub: 'Per sale',
      icon: DollarSign,
      accent: 'text-violet-400',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
  );
}
