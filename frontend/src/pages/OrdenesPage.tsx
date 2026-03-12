import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronUp, ChevronDown, ChevronsUpDown, Loader2, CheckCircle2,
  Clock, Trash2, Eye, ChevronLeft, ChevronRight, Banknote,
  CreditCard, Tag, Truck, AlertTriangle, Pencil, Download,
  Search, X,
} from 'lucide-react'
import { pdf } from '@react-pdf/renderer'
import { OrderPDFDoc } from '@/components/OrderPDF'
import api from '@/lib/api'
import { formatCOP, formatDate } from '@/lib/utils'
import Modal from '@/components/ui/Modal'
import type { Order, OrderItem } from '@/types'

type StatusFilter = 'all' | 'draft' | 'completed' | 'deleted'
type SortKey = 'order_number' | 'created_at' | 'total'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 15

interface OrdersResponse {
  data: Order[]
  meta: { page: number; limit: number; total: number; pages: number }
}

export default function OrdenesPage() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<Order[]>([])
  const [meta, setMeta] = useState({ page: 1, total: 0, pages: 1 })
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)

  const [searchQuery, setSearchQuery]       = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [detailOrder, setDetailOrder] = useState<Order | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [completing, setCompleting] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [downloadingPDF, setDownloadingPDF] = useState(false)

  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  function showToast(msg: string, type: 'ok' | 'err') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchOrders = useCallback(async (
    p      = page,
    status = statusFilter,
    search = debouncedSearch,
  ) => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page: p, limit: PAGE_SIZE }
      if (status !== 'all') params.status = status
      if (search)           params.search = search
      const { data } = await api.get<OrdersResponse>('/api/orders', { params })
      setOrders(data.data)
      setMeta(data.meta)
    } catch {
      showToast('Error al cargar las órdenes', 'err')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, debouncedSearch])

  useEffect(() => { fetchOrders(page, statusFilter, debouncedSearch) }, [page, statusFilter, debouncedSearch, fetchOrders])

  // Debounce: espera 400ms antes de aplicar la búsqueda y vuelve a página 1
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(1)
    }, 400)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Ordenar en cliente (la API ya pagina, ordenamos la página actual)
  const sorted = [...orders].sort((a, b) => {
    let aVal: string | number = sortKey === 'total' ? a.total : (a[sortKey] ?? '').toString()
    let bVal: string | number = sortKey === 'total' ? b.total : (b[sortKey] ?? '').toString()
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function handleStatusFilter(s: StatusFilter) {
    setStatusFilter(s)
    setPage(1)
  }

  // ── Ver detalle ────────────────────────────────────────────────────────────
  async function openDetail(order: Order) {
    setLoadingDetail(true)
    setDetailOrder(order) // abre modal inmediatamente con datos básicos
    try {
      const { data } = await api.get<{ data: Order }>(`/api/orders/${order.id}`)
      setDetailOrder(data.data)
    } catch {
      showToast('Error al cargar el detalle', 'err')
    } finally {
      setLoadingDetail(false)
    }
  }

  // ── Completar borrador ─────────────────────────────────────────────────────
  async function handleComplete(order: Order) {
    setCompleting(order.id)
    try {
      await api.patch(`/api/orders/${order.id}/complete`)
      showToast(`Orden ${order.order_number} completada`, 'ok')
      // Si está abierta en el detalle, actualizarla
      if (detailOrder?.id === order.id) {
        const { data } = await api.get<{ data: Order }>(`/api/orders/${order.id}`)
        setDetailOrder(data.data)
      }
      fetchOrders(page, statusFilter)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Error al completar la orden'
      showToast(msg, 'err')
    } finally {
      setCompleting(null) }
  }

  // ── Eliminar borrador ──────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/api/orders/${deleteTarget.id}`)
      showToast(`Orden ${deleteTarget.order_number} eliminada`, 'ok')
      setDeleteTarget(null)
      if (detailOrder?.id === deleteTarget.id) setDetailOrder(null)
      fetchOrders(page, statusFilter)
    } catch { showToast('Error al eliminar la orden', 'err') }
    finally { setDeleting(false) }
  }

  // ── Descargar PDF ──────────────────────────────────────────────────────────
  async function handleDownloadPDF() {
    if (!detailOrder) return
    setDownloadingPDF(true)
    try {
      const blob = await pdf(<OrderPDFDoc order={detailOrder} />).toBlob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${detailOrder.order_number}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      showToast('Error al generar el PDF', 'err')
    } finally {
      setDownloadingPDF(false)
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown size={13} className="opacity-30 ml-1 inline" />
    return sortDir === 'asc'
      ? <ChevronUp size={13} className="text-brand-lime ml-1 inline" />
      : <ChevronDown size={13} className="text-brand-lime ml-1 inline" />
  }

  const draftCount = orders.filter(o => o.status === 'draft').length
  const completedTotal = orders.filter(o => o.status === 'completed').reduce((s, o) => s + o.total, 0)
  const isDeletedView = statusFilter === 'deleted'

  return (
    <div className="space-y-5">
      {toast && (
        <div className={`fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-auto z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl
          ${toast.type === 'ok' ? 'bg-brand-lime text-brand-black' : 'bg-red-500 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-white">Órdenes</h1>
          <p className="text-white/40 text-sm mt-0.5">
            {loading
              ? 'Cargando...'
              : debouncedSearch
                ? `${meta.total} resultado${meta.total !== 1 ? 's' : ''} para "${debouncedSearch}"`
                : `${meta.total} órdenes en total`}
          </p>
        </div>

        {/* Barra de búsqueda */}
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          <input
            type="search"
            autoComplete="off"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar por cliente, email o nº de orden…"
            className="input pl-9 pr-8 w-full text-sm placeholder:text-white/25"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setDebouncedSearch(''); setPage(1) }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors"
              title="Limpiar búsqueda"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Stats rápidas de la página actual */}
      {!loading && orders.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="card p-4">
            <p className="text-xs text-white/40 mb-1">En esta página</p>
            <p className="text-2xl font-bold text-brand-white">{orders.length}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-white/40 mb-1">Borradores</p>
            <p className="text-2xl font-bold text-amber-400">{draftCount}</p>
          </div>
          <div className="card p-4 sm:col-span-1 col-span-2 sm:col-auto">
            <p className="text-xs text-white/40 mb-1">Ventas completadas (página)</p>
            <p className="text-xl font-bold text-brand-lime">{formatCOP(completedTotal)}</p>
          </div>
        </div>
      )}

      {/* Filtros de estado */}
      <div className="flex flex-wrap items-center gap-1 bg-white/5 rounded-xl p-1 w-fit">
        {([
          { value: 'all', label: 'Todas' },
          { value: 'completed', label: 'Completadas' },
          { value: 'draft', label: 'Borradores' },
          { value: 'deleted', label: 'Eliminadas' },
        ] as { value: StatusFilter; label: string }[]).map(f => (
          <button
            key={f.value}
            onClick={() => handleStatusFilter(f.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${statusFilter === f.value
                ? f.value === 'deleted' ? 'bg-red-500 text-white' : 'bg-brand-lime text-brand-black'
                : 'text-white/50 hover:text-white'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="table-header px-4 py-3 text-left cursor-pointer select-none hover:text-white/80 transition-colors"
                  onClick={() => handleSort('order_number')}>
                  Orden<SortIcon col="order_number" />
                </th>
                <th className="table-header px-4 py-3 text-left">Cliente</th>
                <th className="table-header px-4 py-3 text-center">Estado</th>
                <th className="table-header px-4 py-3 text-center hidden md:table-cell">Pago</th>
                <th className="table-header px-4 py-3 text-right cursor-pointer select-none hover:text-white/80 transition-colors"
                  onClick={() => handleSort('total')}>
                  Total<SortIcon col="total" />
                </th>
                <th className="table-header px-4 py-3 text-left cursor-pointer select-none hover:text-white/80 transition-colors hidden md:table-cell"
                  onClick={() => handleSort('created_at')}>
                  Fecha<SortIcon col="created_at" />
                </th>
                <th className="table-header px-4 py-3 text-right w-32">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className={`px-4 py-3 ${j === 3 || j === 5 ? 'hidden md:table-cell' : ''}`}>
                        <div className="h-4 bg-white/10 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-white/40 text-sm">
                    {debouncedSearch
                      ? `Sin resultados para "${debouncedSearch}"`
                      : statusFilter === 'deleted'
                      ? 'No hay órdenes eliminadas'
                      : statusFilter === 'draft'
                      ? 'No hay órdenes en borrador'
                      : statusFilter === 'completed'
                      ? 'No hay órdenes completadas'
                      : 'No hay órdenes registradas'}
                  </td>
                </tr>
              ) : (
                sorted.map(order => (
                  <tr key={order.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                    <td className="table-cell font-mono font-bold text-brand-lime text-sm">
                      {order.order_number}
                    </td>
                    <td className="table-cell text-sm text-white/80 max-w-[160px] truncate">
                      {order.client?.name ?? order.guest_name ?? '—'}
                    </td>
                    <td className="table-cell text-center">
                      {order.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-lime/15 text-brand-lime text-xs font-medium">
                          <CheckCircle2 size={11} /> Completada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-400 text-xs font-medium">
                          <Clock size={11} /> Borrador
                        </span>
                      )}
                    </td>
                    <td className="table-cell text-center hidden md:table-cell">
                      {order.payment_method === 'cash' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-white/50">
                          <Banknote size={13} /> Efectivo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-white/50">
                          <CreditCard size={13} /> Transferencia
                        </span>
                      )}
                    </td>
                    <td className="table-cell text-right font-semibold text-brand-white text-sm">
                      {formatCOP(order.total)}
                    </td>
                    <td className="table-cell text-white/50 text-sm hidden md:table-cell">{formatDate(order.created_at)}</td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <button title="Ver detalle" onClick={() => openDetail(order)}
                          className="p-1.5 rounded-lg text-white/50 hover:text-brand-lime hover:bg-white/10 transition-colors">
                          <Eye size={15} />
                        </button>
                        {!isDeletedView && (
                          <>
                            {order.status === 'draft' && (
                              <button
                                title="Editar borrador"
                                onClick={() => navigate(`/pos?draft=${order.id}`)}
                                className="p-1.5 rounded-lg text-white/50 hover:text-brand-lime hover:bg-white/10 transition-colors"
                              >
                                <Pencil size={15} />
                              </button>
                            )}
                            {order.status === 'draft' && (
                              <button
                                title="Completar orden"
                                onClick={() => handleComplete(order)}
                                disabled={completing === order.id}
                                className="p-1.5 rounded-lg text-white/50 hover:text-brand-lime hover:bg-white/10 transition-colors disabled:opacity-40"
                              >
                                {completing === order.id
                                  ? <Loader2 size={15} className="animate-spin" />
                                  : <CheckCircle2 size={15} />
                                }
                              </button>
                            )}
                            <button title="Eliminar orden" onClick={() => setDeleteTarget(order)}
                              className="p-1.5 rounded-lg text-white/50 hover:text-red-400 hover:bg-white/10 transition-colors">
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      {meta.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-white/40">
            Página {meta.page} de {meta.pages} · {meta.total} órdenes
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

      {/* ──────────── Modal: Detalle de orden ──────────── */}
      <Modal
        isOpen={!!detailOrder}
        onClose={() => setDetailOrder(null)}
        title={detailOrder ? `Orden ${detailOrder.order_number}` : ''}
        size="lg"
      >
        {detailOrder && (
          <div className="space-y-5">
            {/* Estado + acciones */}
            <div className="flex items-center justify-between">
              {detailOrder.status === 'completed' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-lime/15 text-brand-lime text-sm font-medium">
                  <CheckCircle2 size={13} /> Completada
                  {detailOrder.completed_at && (
                    <span className="text-brand-lime/60 text-xs ml-1">{formatDate(detailOrder.completed_at)}</span>
                  )}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/15 text-amber-400 text-sm font-medium">
                  <Clock size={13} /> Borrador
                </span>
              )}
              {!isDeletedView && (
                <div className="flex gap-2 flex-wrap justify-end">
                  {detailOrder.status === 'draft' && (
                    <button
                      onClick={() => { setDetailOrder(null); navigate(`/pos?draft=${detailOrder.id}`) }}
                      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-brand-lime/40 text-brand-lime hover:bg-brand-lime/10 transition-colors"
                    >
                      <Pencil size={13} /> Editar
                    </button>
                  )}
                  {detailOrder.status === 'draft' && (
                    <button
                      onClick={() => handleComplete(detailOrder)}
                      disabled={completing === detailOrder.id}
                      className="btn-primary flex items-center gap-1.5 text-sm px-3 py-1.5"
                    >
                      {completing === detailOrder.id
                        ? <Loader2 size={13} className="animate-spin" />
                        : <CheckCircle2 size={13} />
                      }
                      Completar
                    </button>
                  )}
                  {detailOrder.status === 'completed' && (
                    <button
                      onClick={handleDownloadPDF}
                      disabled={downloadingPDF || loadingDetail}
                      title="Descargar PDF de la orden"
                      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-white/20 text-white/70 hover:text-brand-lime hover:border-brand-lime/40 transition-colors disabled:opacity-40"
                    >
                      {downloadingPDF
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Download size={13} />
                      }
                      PDF
                    </button>
                  )}
                  <button
                    onClick={() => { setDeleteTarget(detailOrder); setDetailOrder(null) }}
                    className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 size={13} /> Eliminar
                  </button>
                </div>
              )}
            </div>

            {/* Info del pedido */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div>
                  <p className="text-white/40 text-xs mb-0.5">Cliente</p>
                  <p className="text-brand-white font-medium">
                    {detailOrder.client?.name ?? detailOrder.guest_name ?? '—'}
                  </p>
                  {detailOrder.client?.email && (
                    <p className="text-white/50 text-xs">{detailOrder.client.email}</p>
                  )}
                </div>
                <div>
                  <p className="text-white/40 text-xs mb-0.5">Método de pago</p>
                  <p className="text-brand-white flex items-center gap-1.5">
                    {detailOrder.payment_method === 'cash'
                      ? <><Banknote size={14} className="text-brand-lime" /> Efectivo</>
                      : <><CreditCard size={14} className="text-brand-lime" /> Transferencia</>}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-white/40 text-xs mb-0.5">Creado</p>
                  <p className="text-brand-white">{formatDate(detailOrder.created_at)}</p>
                </div>
                {detailOrder.discount_code && (
                  <div>
                    <p className="text-white/40 text-xs mb-0.5">Código de descuento</p>
                    <p className="text-brand-lime flex items-center gap-1.5">
                      <Tag size={13} />
                      <span className="font-mono font-bold">{detailOrder.discount_code.code}</span>
                      <span className="text-white/50">({detailOrder.discount_percentage}%)</span>
                    </p>
                  </div>
                )}
                {detailOrder.notes && (
                  <div>
                    <p className="text-white/40 text-xs mb-0.5">Notas</p>
                    <p className="text-white/70">{detailOrder.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Items */}
            <div>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Productos</p>
              {loadingDetail ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-10 bg-white/5 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-white/5 rounded-xl overflow-hidden border border-white/10">
                  {(detailOrder.items ?? []).map((item: OrderItem) => (
                    <div key={item.id} className="flex items-start justify-between px-4 py-2.5 hover:bg-white/5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-brand-white font-medium">{item.product_name}</p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-mono text-white/40">{item.product_sku}</p>
                          <span className="text-white/20 text-xs">·</span>
                          {item.original_price != null ? (
                            /* Precio fue ajustado por el admin */
                            <>
                              <span className="text-xs text-brand-lime font-semibold">{formatCOP(item.unit_price)} c/u</span>
                              <span className="text-xs text-white/25 line-through">{formatCOP(item.original_price)}</span>
                            </>
                          ) : (
                            <span className="text-xs text-white/40">{formatCOP(item.unit_price)} c/u</span>
                          )}
                        </div>
                        {item.price_note && (
                          <p className="text-xs text-white/30 italic mt-0.5">📝 {item.price_note}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <p className="text-sm font-semibold text-brand-white">{formatCOP(item.line_total)}</p>
                        <p className="text-xs text-white/40">× {item.quantity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Totales */}
            <div className="bg-white/5 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between text-white/70">
                <span>Subtotal bruto</span>
                <span>{formatCOP(detailOrder.subtotal_gross)}</span>
              </div>
              {detailOrder.discount_percentage > 0 && (
                <div className="flex justify-between text-brand-lime">
                  <span>Descuento ({detailOrder.discount_percentage}%)</span>
                  <span>−{formatCOP(detailOrder.subtotal_gross - detailOrder.subtotal_net)}</span>
                </div>
              )}
              <div className="flex justify-between text-white/70">
                <span>Subtotal neto</span>
                <span>{formatCOP(detailOrder.subtotal_net)}</span>
              </div>
              {detailOrder.shipping_cost > 0 && (
                <div className="flex justify-between text-white/70">
                  <span className="flex items-center gap-1.5"><Truck size={13} /> Envío</span>
                  <span>{formatCOP(detailOrder.shipping_cost)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-brand-white border-t border-white/10 pt-2">
                <span>Total</span>
                <span className="text-brand-lime">{formatCOP(detailOrder.total)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ──────────── Modal: Confirmar eliminar orden ──────────── */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        title="Eliminar orden" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-red-500/20 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
              <Trash2 size={16} className="text-red-400" />
            </div>
            <div className="text-white/70 text-sm leading-relaxed space-y-1.5">
              <p>
                ¿Eliminar la orden{' '}
                <span className="font-mono font-bold text-brand-lime">{deleteTarget?.order_number}</span>?
              </p>
              {deleteTarget?.status === 'completed' && (
                <div className="flex items-start gap-2 bg-amber-400/10 text-amber-400 rounded-lg px-3 py-2 text-xs">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span>Esta orden está completada. El stock de los productos será devuelto al inventario y se registrará en el historial.</span>
                </div>
              )}
              <p className="text-white/40 text-xs">Esta acción no se puede deshacer.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={handleDelete} disabled={deleting}
              className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white font-semibold px-4 py-2 rounded-lg transition-colors">
              {deleting && <Loader2 size={14} className="animate-spin" />}
              Eliminar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
