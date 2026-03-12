import { useState, useEffect, useCallback, FormEvent } from 'react'
import {
  Plus, Search, Pencil, Trash2, ChevronUp, ChevronDown,
  ChevronsUpDown, Loader2, AlertTriangle, ShoppingCart, ChevronLeft, ChevronRight,
} from 'lucide-react'
import api from '@/lib/api'
import { formatCOP } from '@/lib/utils'
import { useCartStore } from '@/store/cartStore'
import Modal from '@/components/ui/Modal'
import type { Product } from '@/types'

type SortKey = 'sku' | 'name' | 'price' | 'stock'
type SortDir = 'asc' | 'desc'
interface ProductForm { name: string; price: string; stock: string }
const EMPTY_FORM: ProductForm = { name: '', price: '', stock: '' }

export default function InventarioPage() {
  const { addItem } = useCartStore()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 25

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<{ data: Product[] }>('/api/products')
      setProducts(data.data)
    } catch {
      showToast('Error al cargar productos', 'err')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  function showToast(msg: string, type: 'ok' | 'err') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const filtered = products
    .filter(p => {
      const q = search.toLowerCase()
      return p.name.toLowerCase().includes(q) || p.sku.includes(q)
    })
    .sort((a, b) => {
      let aVal: string | number = a[sortKey]
      let bVal: string | number = b[sortKey]
      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  useEffect(() => { setPage(1) }, [search])

  const totalUnits = filtered.reduce((s, p) => s + p.stock, 0)
  const totalValue = filtered.reduce((s, p) => s + p.price * p.stock, 0)

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function openCreate() {
    setEditing(null); setForm(EMPTY_FORM); setFormError(null); setModalOpen(true)
  }
  function openEdit(product: Product) {
    setEditing(product)
    setForm({ name: product.name, price: String(product.price), stock: String(product.stock) })
    setFormError(null); setModalOpen(true)
  }
  function closeModal() {
    setModalOpen(false); setEditing(null); setForm(EMPTY_FORM); setFormError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setFormError(null)
    const name = form.name.trim()
    const price = Number(form.price); const stock = Number(form.stock)
    if (!name) { setFormError('El nombre es requerido'); return }
    if (isNaN(price) || price < 0) { setFormError('El precio debe ser un número positivo'); return }
    if (isNaN(stock) || stock < 0 || !Number.isInteger(stock)) { setFormError('El stock debe ser un número entero positivo'); return }
    setSubmitting(true)
    try {
      if (editing) {
        await api.put(`/api/products/${editing.id}`, { name, price, stock })
        showToast(`"${name}" actualizado`, 'ok')
      } else {
        const { data: res } = await api.post<{ data: Product }>('/api/products', { name, price, stock })
        showToast(`"${name}" creado — SKU ${res.data.sku}`, 'ok')
      }
      closeModal(); fetchProducts()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al guardar'
      setFormError(msg)
    } finally { setSubmitting(false) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/api/products/${deleteTarget.id}`)
      showToast(`"${deleteTarget.name}" eliminado`, 'ok')
      setDeleteTarget(null); fetchProducts()
    } catch { showToast('Error al eliminar el producto', 'err') }
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

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-white">Inventario</h1>
          <p className="text-white/40 text-sm mt-0.5">
            {loading ? 'Cargando...' : `${products.length} plantas registradas`}
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 w-fit">
          <Plus size={16} />Nueva planta
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
        <input type="text" className="input pl-9" placeholder="Buscar por nombre o SKU..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                {([
                  { key: 'sku', label: 'SKU' },
                  { key: 'name', label: 'Nombre' },
                  { key: 'price', label: 'Precio' },
                  { key: 'stock', label: 'Stock' },
                ] as { key: SortKey; label: string }[]).map(col => (
                  <th key={col.key}
                    className={`table-header px-4 py-3 text-left cursor-pointer select-none hover:text-white/80 transition-colors
                      ${col.key === 'price' || col.key === 'stock' ? 'text-right' : ''}`}
                    onClick={() => handleSort(col.key)}>
                    {col.label}<SortIcon col={col.key} />
                  </th>
                ))}
                <th className="table-header px-4 py-3 text-right w-28">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {[...Array(5)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-white/10 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-white/40 text-sm">
                  {search ? `Sin resultados para "${search}"` : 'No hay plantas registradas'}
                </td></tr>
              ) : (
                paginated.map(product => (
                  <tr key={product.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                    <td className="table-cell font-mono text-brand-lime">{product.sku}</td>
                    <td className="table-cell font-medium text-white">{product.name}</td>
                    <td className="table-cell text-right">{formatCOP(product.price)}</td>
                    <td className="table-cell text-right">
                      <span className={product.stock < 5 ? 'text-amber-400 font-semibold' : ''}>{product.stock}</span>
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <button title="Agregar al carrito"
                          onClick={() => { addItem(product); showToast(`${product.name} agregado al carrito`, 'ok') }}
                          className="p-1.5 rounded-lg text-white/50 hover:text-brand-lime hover:bg-white/10 transition-colors">
                          <ShoppingCart size={15} />
                        </button>
                        <button title="Editar" onClick={() => openEdit(product)}
                          className="p-1.5 rounded-lg text-white/50 hover:text-brand-white hover:bg-white/10 transition-colors">
                          <Pencil size={15} />
                        </button>
                        <button title="Eliminar" onClick={() => setDeleteTarget(product)}
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
                  <td colSpan={2} className="px-4 py-3 text-sm font-semibold text-white/60">
                    {search ? `${filtered.length} de ${products.length} plantas` : `${products.length} plantas`}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-brand-white">{formatCOP(totalValue)}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-brand-white">{totalUnits} uds</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/40">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length} plantas
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
              .reduce<(number | '…')[]>((acc, n, idx, arr) => {
                if (idx > 0 && n - (arr[idx - 1] as number) > 1) acc.push('…')
                acc.push(n)
                return acc
              }, [])
              .map((n, idx) =>
                n === '…' ? (
                  <span key={`e${idx}`} className="px-1 text-white/30">…</span>
                ) : (
                  <button key={n}
                    onClick={() => setPage(n as number)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors
                      ${page === n ? 'bg-brand-lime text-brand-black' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                  >
                    {n}
                  </button>
                )
              )}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {!loading && products.some(p => p.stock < 5) && (
        <div className="flex items-center gap-2 text-amber-400 text-sm bg-amber-400/10 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{products.filter(p => p.stock < 5).length} planta(s) con stock bajo (menos de 5 unidades)</span>
        </div>
      )}

      {/* Modal crear / editar */}
      <Modal isOpen={modalOpen} onClose={closeModal} title={editing ? `Editar — ${editing.name}` : 'Nueva planta'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {editing && (
            <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg">
              <span className="text-xs text-white/40">SKU</span>
              <span className="font-mono text-sm font-bold text-brand-lime">{editing.sku}</span>
              <span className="text-xs text-white/30 ml-auto">Solo lectura</span>
            </div>
          )}
          <div>
            <label className="label">Nombre</label>
            <input type="text" className="input" placeholder="Phalaenopsis Amabilis"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Precio (COP)</label>
              <input type="number" className="input" placeholder="45000" min={0} step={100}
                value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Stock</label>
              <input type="number" className="input" placeholder="10" min={0} step={1}
                value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} required />
            </div>
          </div>
          {formError && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{formError}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={closeModal} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {editing ? 'Guardar cambios' : 'Crear planta'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Dialog eliminar */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirmar eliminación" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-red-500/20 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
              <Trash2 size={16} className="text-red-400" />
            </div>
            <p className="text-white/70 text-sm leading-relaxed">
              ¿Eliminar <span className="font-semibold text-white">"{deleteTarget?.name}"</span>?{' '}
              Esta acción quedará registrada en el historial de inventario.
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
