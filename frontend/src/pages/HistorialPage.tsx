import { useState, useEffect, useCallback } from 'react'
import {
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown,
  ShoppingCart, Plus, Trash2, PackagePlus,
} from 'lucide-react'
import api from '@/lib/api'
import { formatDate } from '@/lib/utils'
import type { InventoryLog, InventoryAction } from '@/types'

type ActionFilter = 'all' | InventoryAction

const PAGE_SIZE = 30

interface LogsResponse {
  data: InventoryLog[]
  meta: { page: number; limit: number; total: number; pages: number }
}

// Mapa de acción → UI
const ACTION_CONFIG: Record<InventoryAction, { label: string; color: string; Icon: React.ElementType }> = {
  create:  { label: 'Creación',    color: 'text-brand-lime bg-brand-lime/10',   Icon: Plus },
  add:     { label: 'Ingreso',     color: 'text-blue-400 bg-blue-400/10',       Icon: TrendingUp },
  remove:  { label: 'Ajuste',      color: 'text-amber-400 bg-amber-400/10',     Icon: TrendingDown },
  sale:    { label: 'Venta',       color: 'text-purple-400 bg-purple-400/10',   Icon: ShoppingCart },
  delete:  { label: 'Eliminación', color: 'text-red-400 bg-red-400/10',         Icon: Trash2 },
}

const FILTERS: { value: ActionFilter; label: string }[] = [
  { value: 'all',    label: 'Todos' },
  { value: 'create', label: 'Creaciones' },
  { value: 'add',    label: 'Ingresos' },
  { value: 'remove', label: 'Ajustes' },
  { value: 'sale',   label: 'Ventas' },
  { value: 'delete', label: 'Eliminaciones' },
]

export default function HistorialPage() {
  const [logs, setLogs] = useState<InventoryLog[]>([])
  const [meta, setMeta] = useState({ page: 1, total: 0, pages: 1 })
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all')
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)

  const fetchLogs = useCallback(async (p = page, action = actionFilter) => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string | number> = { page: p, limit: PAGE_SIZE }
      if (action !== 'all') params.action = action
      const { data } = await api.get<LogsResponse>('/api/inventory-logs', { params })
      setLogs(data.data)
      setMeta(data.meta)
    } catch {
      setError('Error al cargar el historial')
    } finally {
      setLoading(false)
    }
  }, [page, actionFilter])

  useEffect(() => { fetchLogs(page, actionFilter) }, [page, actionFilter, fetchLogs])

  function handleFilterChange(f: ActionFilter) {
    setActionFilter(f)
    setPage(1)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-brand-white">Historial de inventario</h1>
        <p className="text-white/40 text-sm mt-0.5">
          {loading ? 'Cargando...' : `${meta.total} movimientos registrados`}
        </p>
      </div>

      {/* Filtros por acción */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => handleFilterChange(f.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${actionFilter === f.value
                ? 'bg-brand-lime text-brand-black'
                : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="table-header px-4 py-3 text-left">Producto</th>
                <th className="table-header px-4 py-3 text-center w-32">Acción</th>
                <th className="table-header px-4 py-3 text-right hidden sm:table-cell">Antes</th>
                <th className="table-header px-4 py-3 text-right">Cambio</th>
                <th className="table-header px-4 py-3 text-right hidden sm:table-cell">Después</th>
                <th className="table-header px-4 py-3 text-left hidden md:table-cell">Orden</th>
                <th className="table-header px-4 py-3 text-left hidden md:table-cell">Realizado por</th>
                <th className="table-header px-4 py-3 text-left hidden sm:table-cell">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className={`px-4 py-3 ${
                        j === 2 || j === 4 || j === 7 ? 'hidden sm:table-cell' :
                        j === 5 || j === 6 ? 'hidden md:table-cell' : ''
                      }`}>
                        <div className="h-4 bg-white/10 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-white/40 text-sm">
                    No hay movimientos registrados
                  </td>
                </tr>
              ) : (
                logs.map(log => {
                  const cfg = ACTION_CONFIG[log.action]
                  const Icon = cfg.Icon
                  const isPositive = log.quantity_change > 0
                  return (
                    <tr key={log.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="table-cell">
                        <p className="text-sm font-medium text-brand-white">{log.product_name}</p>
                        {log.notes && (
                          <p className="text-xs text-white/40 mt-0.5">{log.notes}</p>
                        )}
                      </td>
                      <td className="table-cell text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                          <Icon size={11} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="table-cell text-right text-sm text-white/60 hidden sm:table-cell">
                        {log.quantity_before}
                      </td>
                      <td className={`table-cell text-right text-sm font-bold
                        ${isPositive ? 'text-brand-lime' : 'text-red-400'}`}>
                        {isPositive ? '+' : ''}{log.quantity_change}
                      </td>
                      <td className="table-cell text-right text-sm font-semibold text-brand-white hidden sm:table-cell">
                        {log.quantity_after}
                      </td>
                      <td className="table-cell text-sm hidden md:table-cell">
                        {log.order_id ? (
                          <span className="font-mono text-xs text-purple-400">—</span>
                        ) : (
                          <span className="text-white/20 text-xs">—</span>
                        )}
                      </td>
                      <td className="table-cell text-sm text-white/60 hidden md:table-cell">
                        {log.performed_by}
                      </td>
                      <td className="table-cell text-sm text-white/50 hidden sm:table-cell">
                        {formatDate(log.created_at)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leyenda de acciones */}
      {!loading && logs.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {(Object.entries(ACTION_CONFIG) as [InventoryAction, typeof ACTION_CONFIG[InventoryAction]][]).map(([key, cfg]) => {
            const Icon = cfg.Icon
            return (
              <span key={key} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                <Icon size={11} /> {cfg.label}
              </span>
            )
          })}
        </div>
      )}

      {/* Paginación */}
      {meta.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-white/40">
            Página {meta.page} de {meta.pages} · {meta.total} registros
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-30"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              onClick={() => setPage(p => Math.min(meta.pages, p + 1))}
              disabled={page >= meta.pages}
              className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-30"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Info de columna Orden — nota temporal hasta que tengamos joins */}
      <div className="flex items-start gap-2 bg-white/5 rounded-xl px-4 py-3">
        <PackagePlus size={15} className="text-brand-lime shrink-0 mt-0.5" />
        <p className="text-xs text-white/50">
          Los movimientos con acción <span className="text-purple-400 font-medium">Venta</span> están
          vinculados a una orden. El número CO-XXXX se puede consultar en el módulo de Órdenes.
        </p>
      </div>
    </div>
  )
}
