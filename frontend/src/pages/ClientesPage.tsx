import { useState, useEffect, useCallback, FormEvent } from 'react'
import {
  Plus, Search, Pencil, Trash2, ChevronUp, ChevronDown,
  ChevronsUpDown, Loader2, User, Mail, Phone, Eye,
  ShoppingBag, TrendingUp, DollarSign,
} from 'lucide-react'
import api from '@/lib/api'
import { formatDate, formatCOP } from '@/lib/utils'
import Modal from '@/components/ui/Modal'
import type { Client, Order } from '@/types'

type SortKey = 'name' | 'email' | 'created_at'
type SortDir = 'asc' | 'desc'
interface ClientForm { name: string; email: string; phone: string }
const EMPTY_FORM: ClientForm = { name: '', email: '', phone: '' }

export default function ClientesPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [form, setForm] = useState<ClientForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [viewClient, setViewClient] = useState<Client | null>(null)
  const [clientOrders, setClientOrders] = useState<Order[]>([])
  const [clientOrdersLoading, setClientOrdersLoading] = useState(false)

  const fetchClients = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<{ data: Client[] }>('/api/clients')
      setClients(data.data)
    } catch {
      showToast('Error al cargar clientes', 'err')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchClients() }, [fetchClients])

  function showToast(msg: string, type: 'ok' | 'err') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const filtered = clients
    .filter(c => {
      const q = search.toLowerCase()
      return (
        c.name.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.phone ?? '').includes(q)
      )
    })
    .sort((a, b) => {
      let aVal: string = (a[sortKey] ?? '').toString().toLowerCase()
      let bVal: string = (b[sortKey] ?? '').toString().toLowerCase()
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function openCreate() {
    setEditing(null); setForm(EMPTY_FORM); setFormError(null); setModalOpen(true)
  }
  function openEdit(client: Client) {
    setEditing(client)
    setForm({ name: client.name, email: client.email ?? '', phone: client.phone ?? '' })
    setFormError(null); setModalOpen(true)
  }
  function closeModal() {
    setModalOpen(false); setEditing(null); setForm(EMPTY_FORM); setFormError(null)
  }

  async function openView(client: Client) {
    setViewClient(client)
    setClientOrders([])
    setClientOrdersLoading(true)
    try {
      const { data } = await api.get<{ data: Order[] }>(
        `/api/orders?status=completed&client_id=${client.id}&limit=200`
      )
      setClientOrders(data.data)
    } catch {
      showToast('Error al cargar órdenes del cliente', 'err')
    } finally {
      setClientOrdersLoading(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setFormError(null)
    const name = form.name.trim()
    const email = form.email.trim() || undefined
    const phone = form.phone.trim() || undefined
    if (!name) { setFormError('El nombre es requerido'); return }
    setSubmitting(true)
    try {
      if (editing) {
        await api.put(`/api/clients/${editing.id}`, { name, email, phone })
        showToast(`"${name}" actualizado`, 'ok')
      } else {
        await api.post('/api/clients', { name, email, phone })
        showToast(`"${name}" creado`, 'ok')
      }
      closeModal(); fetchClients()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al guardar'
      setFormError(msg)
    } finally { setSubmitting(false) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/api/clients/${deleteTarget.id}`)
      showToast(`"${deleteTarget.name}" eliminado`, 'ok')
      setDeleteTarget(null); fetchClients()
    } catch { showToast('Error al eliminar el cliente', 'err') }
    finally { setDeleting(false) }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown size={13} className="opacity-30 ml-1 inline" />
    return sortDir === 'asc'
      ? <ChevronUp size={13} className="text-brand-lime ml-1 inline" />
      : <ChevronDown size={13} className="text-brand-lime ml-1 inline" />
  }

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
          <h1 className="text-2xl font-bold text-brand-white">Clientes</h1>
          <p className="text-white/40 text-sm mt-0.5">
            {loading ? 'Cargando...' : `${clients.length} clientes registrados`}
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 w-fit">
          <Plus size={16} />Nuevo cliente
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
        <input type="text" className="input pl-9" placeholder="Buscar por nombre, email o teléfono..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                {([
                  { key: 'name', label: 'Nombre' },
                  { key: 'email', label: 'Email' },
                ] as { key: SortKey; label: string }[]).map(col => (
                  <th key={col.key}
                    className="table-header px-4 py-3 text-left cursor-pointer select-none hover:text-white/80 transition-colors"
                    onClick={() => handleSort(col.key)}>
                    {col.label}<SortIcon col={col.key} />
                  </th>
                ))}
                <th className="table-header px-4 py-3 text-left">Teléfono</th>
                <th className="table-header px-4 py-3 text-left cursor-pointer select-none hover:text-white/80 transition-colors hidden sm:table-cell"
                  onClick={() => handleSort('created_at')}>
                  Registro<SortIcon col="created_at" />
                </th>
                <th className="table-header px-4 py-3 text-right w-24">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {[...Array(5)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-white/10 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-white/40 text-sm">
                    {search ? `Sin resultados para "${search}"` : 'No hay clientes registrados'}
                  </td>
                </tr>
              ) : (
                filtered.map(client => (
                  <tr key={client.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-brand-lime/20 flex items-center justify-center shrink-0">
                          <User size={14} className="text-brand-lime" />
                        </div>
                        <span className="font-medium text-brand-white">{client.name}</span>
                      </div>
                    </td>
                    <td className="table-cell text-white/70">
                      {client.email ? (
                        <div className="flex items-center gap-1.5">
                          <Mail size={13} className="text-white/30 shrink-0" />
                          <span className="text-sm">{client.email}</span>
                        </div>
                      ) : (
                        <span className="text-white/20 text-sm italic">—</span>
                      )}
                    </td>
                    <td className="table-cell text-white/70">
                      {client.phone ? (
                        <div className="flex items-center gap-1.5">
                          <Phone size={13} className="text-white/30 shrink-0" />
                          <span className="text-sm">{client.phone}</span>
                        </div>
                      ) : (
                        <span className="text-white/20 text-sm italic">—</span>
                      )}
                    </td>
                    <td className="table-cell text-white/50 text-sm hidden sm:table-cell">{formatDate(client.created_at)}</td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <button title="Ver detalle" onClick={() => openView(client)}
                          className="p-1.5 rounded-lg text-white/50 hover:text-brand-lime hover:bg-white/10 transition-colors">
                          <Eye size={15} />
                        </button>
                        <button title="Editar" onClick={() => openEdit(client)}
                          className="p-1.5 rounded-lg text-white/50 hover:text-brand-white hover:bg-white/10 transition-colors">
                          <Pencil size={15} />
                        </button>
                        <button title="Eliminar" onClick={() => setDeleteTarget(client)}
                          className="p-1.5 rounded-lg text-white/50 hover:text-red-400 hover:bg-white/10 transition-colors">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {!loading && filtered.length > 0 && (
              <tfoot>
                <tr className="border-t border-white/20 bg-white/5">
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-white/60">
                    {search ? `${filtered.length} de ${clients.length} clientes` : `${clients.length} clientes`}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modal crear / editar */}
      <Modal isOpen={modalOpen} onClose={closeModal}
        title={editing ? `Editar — ${editing.name}` : 'Nuevo cliente'} size="sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Nombre *</label>
            <input type="text" className="input" placeholder="María García"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <label className="label">
              Email <span className="text-white/30">(opcional)</span>
            </label>
            <input type="email" className="input" placeholder="maria@email.com"
              value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className="label">
              Teléfono <span className="text-white/30">(opcional)</span>
            </label>
            <input type="tel" className="input" placeholder="300 123 4567"
              value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          {formError && (
            <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{formError}</p>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={closeModal} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={submitting}
              className="btn-primary flex-1 flex items-center justify-center gap-2">
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {editing ? 'Guardar cambios' : 'Crear cliente'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal ver detalle del cliente */}
      {viewClient && (() => {
        const totalGastado = clientOrders.reduce((s, o) => s + o.total, 0)
        const numOrdenes = clientOrders.length
        const aov = numOrdenes > 0 ? totalGastado / numOrdenes : 0
        return (
          <Modal
            isOpen={!!viewClient}
            onClose={() => setViewClient(null)}
            title={viewClient.name}
            size="lg"
          >
            <div className="space-y-5">
              {/* Info básica */}
              <div className="flex flex-wrap gap-3 text-sm text-white/50">
                {viewClient.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail size={13} className="text-white/30" />{viewClient.email}
                  </span>
                )}
                {viewClient.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone size={13} className="text-white/30" />{viewClient.phone}
                  </span>
                )}
                <span className="text-white/30">Cliente desde {formatDate(viewClient.created_at)}</span>
              </div>

              {/* KPI cards */}
              {clientOrdersLoading ? (
                <div className="grid grid-cols-3 gap-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="bg-white/5 rounded-xl p-4 animate-pulse h-20" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white/5 rounded-xl p-4 space-y-1">
                    <div className="flex items-center gap-2 text-white/40 text-xs">
                      <ShoppingBag size={13} />Órdenes
                    </div>
                    <p className="text-2xl font-bold text-brand-white">{numOrdenes}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 space-y-1">
                    <div className="flex items-center gap-2 text-white/40 text-xs">
                      <DollarSign size={13} />Total gastado
                    </div>
                    <p className="text-xl font-bold text-brand-lime leading-tight">{formatCOP(totalGastado)}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 space-y-1">
                    <div className="flex items-center gap-2 text-white/40 text-xs">
                      <TrendingUp size={13} />AOV
                    </div>
                    <p className="text-xl font-bold text-brand-white leading-tight">{formatCOP(aov)}</p>
                  </div>
                </div>
              )}

              {/* Lista de órdenes */}
              <div>
                <h3 className="text-sm font-semibold text-white/60 mb-2">
                  Órdenes completadas
                </h3>
                {clientOrdersLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-10 bg-white/5 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : clientOrders.length === 0 ? (
                  <p className="text-white/30 text-sm py-4 text-center">
                    Este cliente aún no tiene órdenes completadas
                  </p>
                ) : (
                  <div className="rounded-xl overflow-hidden border border-white/10">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/5">
                          <th className="px-4 py-2.5 text-left text-white/40 font-medium">Orden</th>
                          <th className="px-4 py-2.5 text-left text-white/40 font-medium hidden sm:table-cell">Fecha</th>
                          <th className="px-4 py-2.5 text-center text-white/40 font-medium hidden sm:table-cell">Pago</th>
                          <th className="px-4 py-2.5 text-right text-white/40 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientOrders.map((order, idx) => (
                          <tr key={order.id}
                            className={`border-b border-white/5 last:border-0 ${idx % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                            <td className="px-4 py-2.5 font-mono text-brand-lime font-semibold">
                              {order.order_number}
                            </td>
                            <td className="px-4 py-2.5 text-white/50 hidden sm:table-cell">
                              {formatDate(order.completed_at ?? order.created_at)}
                            </td>
                            <td className="px-4 py-2.5 text-center hidden sm:table-cell">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                                ${order.payment_method === 'transfer'
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : 'bg-green-500/20 text-green-400'}`}>
                                {order.payment_method === 'transfer' ? 'Transferencia' : 'Efectivo'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-brand-white">
                              {formatCOP(order.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* Dialog eliminar */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        title="Confirmar eliminación" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-red-500/20 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
              <Trash2 size={16} className="text-red-400" />
            </div>
            <p className="text-white/70 text-sm leading-relaxed">
              ¿Eliminar al cliente{' '}
              <span className="font-semibold text-white">"{deleteTarget?.name}"</span>?{' '}
              Sus órdenes históricas se conservarán.
            </p>
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
