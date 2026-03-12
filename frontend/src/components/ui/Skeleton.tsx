import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('animate-pulse rounded-lg bg-white/10', className)} />
  )
}

/** Skeleton de una fila de tabla */
export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  )
}

/** Skeleton de una tarjeta KPI */
export function KPISkeleton() {
  return (
    <div className="card space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-3 w-20" />
    </div>
  )
}

/** Skeleton de página completa — carga inicial */
export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-brand-green flex">
      {/* Sidebar skeleton */}
      <div className="w-64 bg-black/20 p-4 space-y-2 shrink-0">
        <Skeleton className="h-10 w-full mb-6" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
      {/* Contenido skeleton */}
      <div className="flex-1 p-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <KPISkeleton key={i} />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  )
}
