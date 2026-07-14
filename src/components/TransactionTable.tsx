import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTransactions } from '@/hooks/useApi';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ArrowUpDown, ExternalLink } from 'lucide-react';

type SortField = 'created_at_utc' | 'orig_amount' | 'type' | 'status';
type SortDir = 'asc' | 'desc';

export function TransactionTable() {
  const { data, isLoading, isError } = useTransactions(50);
  const [sortField, setSortField] = useState<SortField>('created_at_utc');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = [...(data ?? [])].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    }
    const sa = String(aVal ?? '');
    const sb = String(bVal ?? '');
    return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'AUTHORISED': return 'success' as const;
      case 'DECLINED': return 'destructive' as const;
      case 'FAILED': return 'warning' as const;
      default: return 'secondary' as const;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-28" />
        </CardHeader>
        <CardContent>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full mb-1" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">Failed to load transactions</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Transactions</CardTitle>
        <CardDescription>{sorted.length} most recent records</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {[
                  { label: 'Date', field: 'created_at_utc' as SortField },
                  { label: 'Amount', field: 'orig_amount' as SortField },
                  { label: 'Type', field: 'type' as SortField },
                  { label: 'Status', field: 'status' as SortField },
                  { label: 'Reference', field: null },
                ].map((col) => (
                  <th
                    key={col.label}
                    className={`py-2 text-left font-medium text-muted-foreground ${col.field ? 'cursor-pointer hover:text-foreground select-none' : ''}`}
                    onClick={() => col.field && toggleSort(col.field)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {col.field && sortField === col.field && (
                        <ArrowUpDown className="h-3 w-3" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((txn) => (
                <tr
                  key={txn.id}
                  className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground">
                    {formatDate(txn.created_at_utc)}
                  </td>
                  <td className="py-2.5 pr-4 font-mono font-semibold whitespace-nowrap">
                    {formatCurrency(txn.orig_amount)}
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">
                    <Badge variant={txn.type === 'SALE' ? 'default' : 'outline'}>
                      {txn.type}
                    </Badge>
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">
                    <Badge variant={getStatusVariant(txn.status)}>
                      {txn.status}
                    </Badge>
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {txn.reference}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
