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
