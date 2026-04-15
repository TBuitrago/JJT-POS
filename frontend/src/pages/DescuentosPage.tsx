import { useState, useEffect, useCallback, FormEvent } from 'react'
import {
  Plus, Pencil, Trash2, ChevronUp, ChevronDown,
  ChevronsUpDown, Loader2, Tag, ToggleLeft, ToggleRight, Gift,
} from 'lucide-react'
import api from '@/lib/api'
import { formatDate, formatDateShort } from '@/lib/utils'
import { useIsAdmin } from '@/hooks/useRole'
import Modal from '@/components/ui/Modal'
import type { DiscountCode } from '@/types'

type SortKey = 'code' | 'percentage' | 'created_at'
type SortDir = 'asc' | 'desc'
interface DiscountForm { code: string; percentage: string }
const EMPTY_FORM: DiscountForm = { code: '', percentage: '' }

export default function DescuentosPage() {
  const isAdmin = useIsAdmin()
  const [codes, setCodes] = useState<DiscountCode[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<DiscountCode | null>(null)
  const [form, setForm] = useState<DiscountForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DiscountCode | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  const fetchCodes = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<{ data: DiscountCode[] }>('/api/discount-codes')
      setCodes(data.data)
    } catch {
      showToast('Error al cargar los códigos', 'err')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCodes() }, [fetchCodes])

  function showToast(msg: string, type: 'ok' | 'err') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const sorted = [...codes].sort((a, b) => {
    let aVal: string | number = (a[sortKey] ?? '').toString().toLowerCase()
    let bVal: string | number = (b[sortKey] ?? '').toString().toLowerCase()
    if (sortKey === 'percentage') { aVal = a.percentage; bVal = b.percentage }
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const active = codes.filter(c => c.is_active).length
  const rewardCodes = codes.filter(c => c.reward_tier != null)
  const manualCodes = codes.filter(c => c.reward_tier == null)

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function openCreate() {
    setEditing(null); setForm(EMPTY_FORM); setFormError(null); setModalOpen(true)
  }
  function openEdit(code: DiscountCode) {
    setEditing(code)
    setForm({ code: code.code, percentage: String(code.percentage) })
    setFormError(null); setModalOpen(true)
  }
  function closeModal() {
    setModalOpen(false); setEditing(null); setForm(EMPTY_FORM); setFormError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setFormError(null)
    const code = form.code.trim().toUpperCase()
    const percentage = Number(form.percentage)
    if (!editing && !code) { setFormError('El código es requerido'); return }
    if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
      setFormError('El porcentaje debe estar entre 1 y 100'); return
    }
    setSubmitting(true)
    try {
      if (editing) {
        await api.put(`/api/discount-codes/${editing.id}`, { percentage })
        showToast(`Código "${editing.code}" actualizado`, 'ok')
      } else {
        await api.post('/api/discount-codes', { code, percentage })
        showToast(`Código "${code}" creado`, 'ok')
      }
      closeModal(); fetchCodes()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al guardar'
      setFormError(msg)
    } finally { setSubmitting(false) }
  }

  async function toggleActive(dc: DiscountCode) {
    setTogglingId(dc.id)
    try {
      await api.put(`/api/discount-codes/${dc.id}`, { is_active: !dc.is_active })
      showToast(
        `"${dc.code}" ${!dc.is_active ? 'activado' : 'desactivado'}`,
        'ok'
      )
      fetchCodes()
    } catch {
      showToast('Error al cambiar el estado', 'err')
    } finally { setTogglingId(null) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/api/discount-codes/${deleteTarget.id}`)
      showToast(`Código "${deleteTarget.code}" eliminado`, 'ok')
      setDeleteTarget(null); fetchCodes()
    } catch { showToast('Error al eliminar el código', 'err') }
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
          <h1 className="text-2xl font-bold text-brand-white">Códigos de descuento</h1>
          <p className="text-white/40 text-sm mt-0.5">
            {loading ? 'Cargando...' : `${active} activos de ${codes.length} total`}
          </p>
        </div>
        {isAdmin && (
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 w-fit">
            <Plus size={16} />Nuevo código
          </button>
        )}
      </div>

      {/* Stats rápidas */}
      {!loading && codes.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card p-4">
            <p className="text-xs text-white/40 mb-1">Manuales</p>
            <p className="text-2xl font-bold text-brand-white">{manualCodes.length}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-white/40 mb-1">Recompensas</p>
            <p className="text-2xl font-bold text-amber-400">{rewardCodes.length}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-white/40 mb-1">Activos</p>
            <p className="text-2xl font-bold text-brand-lime">{active}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-white/40 mb-1">Inactivos</p>
            <p className="text-2xl font-bold text-white/60">{codes.length - active}</p>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="table-header px-4 py-3 text-left cursor-pointer select-none hover:text-white/80 transition-colors"
                  onClick={() => handleSort('code')}>
                  Código<SortIcon col="code" />
                </th>
                <th className="table-header px-4 py-3 text-center hidden sm:table-cell">Tipo</th>
                <th className="table-header px-4 py-3 text-right cursor-pointer select-none hover:text-white/80 transition-colors"
                  onClick={() => handleSort('percentage')}>
                  Descuento<SortIcon col="percentage" />
                </th>
                <th className="table-header px-4 py-3 text-center">Estado</th>
                <th className="table-header px-4 py-3 text-left cursor-pointer select-none hover:text-white/80 transition-colors hidden sm:table-cell"
                  onClick={() => handleSort('created_at')}>
                  Info<SortIcon col="created_at" />
                </th>
                <th className="table-header px-4 py-3 text-right w-28">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-white/10 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-white/40 text-sm">
                    No hay códigos de descuento registrados
                  </td>
                </tr>
              ) : (
                sorted.map(dc => {
                  const isReward = dc.reward_tier != null
                  const isExpired = dc.expires_at ? new Date(dc.expires_at) <= new Date() : false
                  const isUsed = dc.max_uses !== null && dc.uses_count >= dc.max_uses

                  return (
                  <tr key={dc.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        {isReward
                          ? <Gift size={14} className="text-amber-400 shrink-0" />
                          : <Tag size={14} className="text-brand-lime shrink-0" />}
                        <span className="font-mono font-bold text-brand-white tracking-wide">{dc.code}</span>
                      </div>
                    </td>
                    <td className="table-cell text-center hidden sm:table-cell">
                      {isReward ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-semibold">
                          <Gift size={10} /> Recompensa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 text-white/50 text-[10px] font-semibold">
                          Manual
                        </span>
                      )}
                    </td>
                    <td className="table-cell text-right">
                      <span className="inline-flex items-center justify-center w-14 h-7 rounded-full bg-brand-lime/15 text-brand-lime text-sm font-bold">
                        {dc.percentage}%
                      </span>
                    </td>
                    <td className="table-cell text-center">
                      {isAdmin ? (
                        <button
                          onClick={() => toggleActive(dc)}
                          disabled={togglingId === dc.id}
                          title={dc.is_active ? 'Desactivar' : 'Activar'}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors
                            disabled:opacity-50"
                        >
                          {togglingId === dc.id ? (
                            <Loader2 size={13} className="animate-spin text-white/40" />
                          ) : dc.is_active ? (
                            <>
                              <ToggleRight size={16} className="text-brand-lime" />
                              <span className="text-brand-lime">Activo</span>
                            </>
                          ) : (
                            <>
                              <ToggleLeft size={16} className="text-white/30" />
                              <span className="text-white/30">{isUsed ? 'Usado' : isExpired ? 'Vencido' : 'Inactivo'}</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${dc.is_active ? 'text-brand-lime' : 'text-white/30'}`}>
                          {dc.is_active ? (
                            <><ToggleRight size={16} /> Activo</>
                          ) : (
                            <><ToggleLeft size={16} /> {isUsed ? 'Usado' : isExpired ? 'Vencido' : 'Inactivo'}</>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="table-cell text-white/50 text-sm hidden sm:table-cell">
                      {isReward ? (
                        <div className="space-y-0.5">
                          {dc.assigned_client && (
                            <p className="text-[11px] text-white/40 truncate max-w-[160px]" title={dc.assigned_client.name}>
                              {dc.assigned_client.name}
                            </p>
                          )}
                          {dc.expires_at && (
                            <p className={`text-[11px] ${isExpired ? 'text-red-400' : 'text-white/30'}`}>
                              {isExpired ? 'Venció' : 'Vence'}: {formatDateShort(dc.expires_at)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm">{formatDate(dc.created_at)}</span>
                      )}
                    </td>
                    <td className="table-cell text-right">
                      {isAdmin && !isReward && (
                        <div className="flex items-center justify-end gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                          <button title="Editar porcentaje" onClick={() => openEdit(dc)}
                            className="p-1.5 rounded-lg text-white/50 hover:text-brand-white hover:bg-white/10 transition-colors">
                            <Pencil size={15} />
                          </button>
                          <button title="Eliminar" onClick={() => setDeleteTarget(dc)}
                            className="p-1.5 rounded-lg text-white/50 hover:text-red-400 hover:bg-white/10 transition-colors">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                      {isAdmin && isReward && (
                        <div className="flex items-center justify-end gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                          <button title="Eliminar" onClick={() => setDeleteTarget(dc)}
                            className="p-1.5 rounded-lg text-white/50 hover:text-red-400 hover:bg-white/10 transition-colors">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal crear / editar */}
      <Modal isOpen={modalOpen} onClose={closeModal}
        title={editing ? `Editar — ${editing.code}` : 'Nuevo código de descuento'} size="sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editing && (
            <div>
              <label className="label">
                Código <span className="text-white/30">(se convertirá a mayúsculas)</span>
              </label>
              <input type="text" className="input font-mono uppercase" placeholder="ORQUIDEA20"
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, '') }))}
                required />
            </div>
          )}
          <div>
            <label className="label">
              Porcentaje de descuento <span className="text-white/30">(sobre subtotal de productos)</span>
            </label>
            <div className="relative">
              <input type="number" className="input pr-8" placeholder="20" min={1} max={100} step={1}
                value={form.percentage}
                onChange={e => setForm(f => ({ ...f, percentage: e.target.value }))} required />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 text-sm font-bold">%</span>
            </div>
          </div>
          {formError && (
            <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{formError}</p>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={closeModal} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={submitting}
              className="btn-primary flex-1 flex items-center justify-center gap-2">
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {editing ? 'Guardar cambios' : 'Crear código'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Dialog eliminar */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        title="Confirmar eliminación" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-red-500/20 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
              <Trash2 size={16} className="text-red-400" />
            </div>
            <p className="text-white/70 text-sm leading-relaxed">
              ¿Eliminar el código{' '}
              <span className="font-mono font-bold text-brand-lime">"{deleteTarget?.code}"</span>?{' '}
              Las órdenes que ya lo usaron no se verán afectadas.
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
