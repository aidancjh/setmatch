function Pulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-100 ${className ?? ""}`} />;
}

export function GameCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <Pulse className="h-5 w-40" />
        <Pulse className="h-5 w-16" />
      </div>
      <div className="mb-3 flex gap-1.5">
        <Pulse className="h-5 w-14" />
        <Pulse className="h-5 w-20" />
      </div>
      <div className="space-y-1.5">
        <Pulse className="h-4 w-48" />
        <Pulse className="h-4 w-36" />
      </div>
      <div className="mt-3">
        <Pulse className="h-1.5 w-full rounded-full" />
      </div>
    </div>
  );
}

export function HighlightCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <Pulse className="aspect-video w-full rounded-none" />
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <Pulse className="h-8 w-8 rounded-full" />
          <Pulse className="h-4 w-24" />
        </div>
        <Pulse className="h-4 w-3/4" />
      </div>
    </div>
  );
}
