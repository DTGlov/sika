import { Skeleton } from '@/components/ui/skeleton';

export default function RecurringLoading() {
  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>

      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-5 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
