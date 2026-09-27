/**
 * Loading placeholders shaped like the content that is about to arrive, so
 * the page doesn't jump when data lands. Announced to screen readers as
 * "กำลังโหลด…"; the pulse stops under prefers-reduced-motion (global rule in
 * index.css).
 */
function Bar({ className }: { className: string }) {
  return <span className={'block animate-pulse rounded-md bg-line/80 ' + className} />
}

/** A card of list rows -- stands in for a table or card list. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="card flex flex-col gap-4" role="status">
      <span className="sr-only">กำลังโหลด…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3" aria-hidden="true">
          <Bar className="h-4 w-24 shrink-0" />
          <Bar className={'h-4 ' + (i % 2 ? 'w-2/5' : 'w-3/5')} />
          <Bar className="ml-auto hidden h-4 w-16 sm:block" />
        </div>
      ))}
    </div>
  )
}

/** Whole-page placeholder: a title bar, then a list card. */
export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 border-b border-line pb-4" aria-hidden="true">
        <Bar className="h-7 w-56 max-w-full" />
      </div>
      <SkeletonRows rows={rows} />
    </div>
  )
}
