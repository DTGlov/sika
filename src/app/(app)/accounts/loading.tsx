import { Skeleton } from '@/components/ui/skeleton';

export default function AccountsLoading() {
  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-20 rounded-full" />
      </div>

      {/* Total balance card */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-56" />
      </div>

      {/* Account rows */}
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="bg-card border border-border rounded-2xl p-4"
          style={{ borderLeftWidth: '3px', borderLeftColor: 'var(--muted)' }}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <div className="flex gap-1">
              <Skeleton className="w-8 h-8 rounded-lg" />
              <Skeleton className="w-8 h-8 rounded-lg" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border">
            <Skeleton className="h-7 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}
