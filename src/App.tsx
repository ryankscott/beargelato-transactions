import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCcw, Loader2, BarChart3, Instagram } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { StatsCards } from '@/components/StatsCards';
import { RevenueChart } from '@/components/RevenueChart';
import { DailyWeatherChart } from '@/components/DailyWeatherChart';
import { Checkbox } from '@/components/ui/checkbox';
import { InstagramStatsCards } from '@/components/InstagramStatsCards';
import { InstagramMediaGrid } from '@/components/InstagramMediaGrid';
import { InstagramCorrelationChart } from '@/components/InstagramCorrelationChart';
import { InstagramPostImpact } from '@/components/InstagramPostImpact';
import { Toaster, toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { useSummary } from '@/hooks/useApi';

type Tab = 'transactions' | 'instagram';

function Header({ tab, onTabChange, onSync }: {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  onSync: () => void;
}) {
  const { data } = useSummary();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    const id = toast.loading('Syncing...');
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      if (!res.ok) throw new Error('Sync failed');
      const result = await res.json();
      toast.success(`Added ${result.inserted} new transactions`, { id });
      onSync();
    } catch (err: any) {
      toast.error(`Sync failed: ${err.message}`, { id });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          🐻🍦 Bear Gelato
        </h1>
        <p className="text-muted-foreground mt-1">
          {tab === 'transactions' ? 'Transaction Dashboard' : 'Instagram Analytics'}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-3">
          {/* Tab switcher */}
          <div className="flex bg-muted rounded-lg p-0.5">
            <button
              onClick={() => onTabChange('transactions')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                tab === 'transactions'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Sales
            </button>
            <button
              onClick={() => onTabChange('instagram')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                tab === 'instagram'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Instagram className="h-3.5 w-3.5" />
              Instagram
            </button>
          </div>

          <Button
            onClick={handleSync}
            disabled={syncing}
            variant="outline"
            size="sm"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            Refresh Data
          </Button>
        </div>
        {data?.lastSyncTime && tab === 'transactions' && (
          <span className="text-xs text-muted-foreground">
            Verifone: {formatDate(data.lastSyncTime)}
          </span>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>('transactions');
  const [includeFoodTruck, setIncludeFoodTruck] = useState(false);
  const queryClient = useQueryClient();

  const handleSync = () => {
    queryClient.invalidateQueries();
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: { background: 'hsl(240 4% 16%)', color: 'hsl(0 0% 98%)', border: '1px solid hsl(240 4% 20%)' },
        }}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Header tab={tab} onTabChange={setTab} onSync={handleSync} />

        {tab === 'transactions' && (
          <div className="space-y-6">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <Checkbox
                checked={includeFoodTruck}
                onCheckedChange={(c) => setIncludeFoodTruck(c === true)}
              />
              Include Food truck data
            </label>
            <StatsCards includeFoodTruck={includeFoodTruck} />
            <RevenueChart includeFoodTruck={includeFoodTruck} />
            <DailyWeatherChart includeFoodTruck={includeFoodTruck} />
          </div>
        )}

        {tab === 'instagram' && (
          <div className="space-y-6">
            <InstagramStatsCards />
            <InstagramCorrelationChart />

            <h2 className="text-lg font-semibold pt-2 border-t border-border">📊 Correlation Analysis</h2>

            <InstagramPostImpact />
            <InstagramMediaGrid />
          </div>
        )}

        <footer className="mt-12 py-6 border-t border-border text-center text-xs text-muted-foreground">
          Bear Gelato Dashboard · Data from Verifone API & Instagram Graph API · {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}
