import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTransactions } from '@/hooks/useApi';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 50;

type SortField = 'created_at_utc' | 'orig_amount' | 'type' | 'status';
type SortDir = 'asc' | 'desc';

const STATUS_OPTIONS = ['', 'AUTHORISED', 'DECLINED', 'FAILED', 'REFUNDED', 'PENDING'];
const TYPE_OPTIONS = ['', 'SALE', 'REFUND', 'VOID'];

function getStatusVariant(status: string) {
  switch (status) {
    case 'AUTHORISED': return 'success' as const;
    case 'DECLINED': return 'destructive' as const;
    case 'FAILED': return 'warning' as const;
    default: return 'secondary' as const;
  }
}

export function TransactionTable() {
  const [page, setPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('created_at_utc');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const offset = page * PAGE_SIZE;
  const { data, isLoading, isError } = useTransactions(PAGE_SIZE, offset, false, typeFilter || undefined, statusFilter || undefined, sortField, sortDir);

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const showingFrom = data ? offset + 1 : 0;
  const showingTo = data ? Math.min(offset + PAGE_SIZE, data.total) : 0;

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(0);
  };

  const handleTypeFilter = (val: string) => {
    setTypeFilter(val);
    setPage(0);
  };

  const handleStatusFilter = (val: string) => {
    setStatusFilter(val);
    setPage(0);
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
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Transactions</CardTitle>
            <CardDescription>{data?.total.toLocaleString()} total records</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => handleStatusFilter(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All Status</option>
              {STATUS_OPTIONS.filter(Boolean).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => handleTypeFilter(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All Types</option>
              {TYPE_OPTIONS.filter(Boolean).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
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
                        <ArrowUpDown className={`h-3 w-3 transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`} />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((txn) => (
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
                  <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground whitespace-nowrap max-w-[200px] truncate">
                    {txn.reference}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Showing {showingFrom}–{showingTo} of {data?.total.toLocaleString()}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-input bg-background text-xs hover:bg-accent disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const start = Math.max(0, Math.min(page - 3, totalPages - 7));
                const pageNum = start + i;
                if (pageNum >= totalPages) return null;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`h-8 w-8 inline-flex items-center justify-center rounded-md text-xs font-medium transition-colors ${
                      pageNum === page
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-input bg-background hover:bg-accent'
                    }`}
                  >
                    {pageNum + 1}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-input bg-background text-xs hover:bg-accent disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
