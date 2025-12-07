interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div 
      className={`animate-pulse bg-slate-700 rounded ${className}`}
    />
  );
}

export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton 
          key={i} 
          className={`h-4 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`} 
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = '' }: SkeletonProps) {
  return (
    <div className={`bg-slate-800 rounded-lg p-4 ${className}`}>
      <Skeleton className="h-6 w-1/3 mb-4" />
      <SkeletonText lines={2} />
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="bg-slate-800 rounded-lg overflow-hidden">
      <div className="bg-slate-700 px-6 py-3">
        <div className="flex gap-4">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-slate-700">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="px-6 py-4">
            <div className="flex gap-4">
              {Array.from({ length: columns }).map((_, colIndex) => (
                <Skeleton key={colIndex} className="h-4 flex-1" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonCalendar() {
  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-20 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        </div>
      </div>
      
      {/* Calendar grid */}
      <div className="flex-1 p-4">
        {/* Days header */}
        <div className="flex border-b border-slate-700 pb-2 mb-4">
          <div className="w-48 flex-shrink-0" />
          <div className="flex-1 flex gap-1">
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} className="flex-1 text-center">
                <Skeleton className="h-4 w-8 mx-auto mb-1" />
                <Skeleton className="h-3 w-6 mx-auto" />
              </div>
            ))}
          </div>
        </div>
        
        {/* Property rows */}
        {Array.from({ length: 4 }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex border-b border-slate-700/50 py-2">
            <div className="w-48 flex-shrink-0 pr-4">
              <Skeleton className="h-5 w-32 mb-1" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="flex-1 flex gap-1">
              {Array.from({ length: 14 }).map((_, i) => (
                <Skeleton key={i} className="flex-1 h-12 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonStats() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-slate-800 rounded-lg p-4">
          <Skeleton className="h-4 w-20 mb-2" />
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  );
}

