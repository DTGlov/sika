import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div className="max-w-2xl mx-auto pb-8 px-4 md:px-8 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pt-6">
        <div className="flex items-center gap-3">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <Skeleton className="w-9 h-9 rounded-xl" />
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Skeleton className="w-8 h-8 rounded-lg" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="w-8 h-8 rounded-lg" />
      </div>

      {/* Cycle card placeholder */}
      <div className="w-full max-w-[440px] md:mx-auto">
        <div
          className="bg-card border border-border rounded-3xl"
          style={{ aspectRatio: '85.6 / 54' }}
        />
      </div>

      {/* Stat row */}
      <Skeleton className="h-3 w-full max-w-xs" />

      {/* Should I Buy It button */}
      <Skeleton className="h-14 w-full rounded-2xl" />

      {/* Sika score */}
      <Skeleton className="h-14 w-full rounded-2xl" />

      {/* Today / This month grid */}
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
    </div>
  );
}
