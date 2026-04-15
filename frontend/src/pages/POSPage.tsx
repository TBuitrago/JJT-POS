import { useState, useEffect, useCallback, useRef, FormEvent } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Search, ShoppingCart, Trash2, Plus, Minus, User, Tag,
  Truck, FileText, CreditCard, Banknote, Loader2, CheckCircle2,
  AlertTriangle, X, UserPlus, Pencil, Gift,
} from 'lucide-react'
import api from '@/lib/api'
import { formatCOP, calcOrderTotal, isValidSKU, cn } from '@/lib/utils'
import { useCartStore } from '@/store/cartStore'
import Modal from '@/components/ui/Modal'
import type { Product, Client, DiscountCode } from '@/types'

// ─── tipos locales ────────────────────────────────────────────────────────────
type PaymentMethod = 'cash' | 'transfer'

interface NewClientForm { name: string; email: string; phone: string }
const EMPTY_CLIENT_FORM: NewClientForm = { name: '', email: '', phone: '' }

// ─── componente principal ─────────────────────────────────────────────────────
export default function POSPage() {
  const { items, addItem, removeItem, updateQuantity, updateItemPrice, clearCart, subtotalGross } = useCartStore()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const draftOrderId = searchParams.get('draft')

  // ── modo edición de borrador ──────────────────────────────────────────────
  const [draftOrderNumber, setDraftOrderNumber] = useState<string | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)

  // Refs
  const clientSearchRef  = useRef<HTMLInputElement>(null)
  const clientDropdownRef = useRef<HTMLDivElement>(null)

  // ── productos ──────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [productSearch, setProductSearch] = useState('')

  // ── cliente ────────────────────────────────────────────────────────────────
  const [clientMode, setClientMode] = useState<'guest' | 'registered'>('guest')
  const [guestName, setGuestName] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false)
  const [searchingClients, setSearchingClients] = useState(false)
  const [newClientModal, setNewClientModal] = useState(false)
  const [newClientForm, setNewClientForm] = useState<NewClientForm>(EMPTY_CLIENT_FORM)
  const [newClientError, setNewClientError] = useState<string | null>(null)
  const [creatingClient, setCreatingClient] = useState(false)

  // ── editor de precio por ítem ──────────────────────────────────────────────
  const [editingPriceId, setEditingPriceId]   = useState<string | null>(null)
  const [editPriceValue, setEditPriceValue]   = useState('')
  const [editPriceNote,  setEditPriceNote]    = useState('')

  function openPriceEdit(item: { id: string; price: number; customPrice?: number; priceNote?: string }) {
    setEditingPriceId(item.id)
    setEditPriceValue(String(item.customPrice ?? item.price))
    setEditPriceNote(item.priceNote ?? '')
  }

  function confirmPriceEdit(productId: string, originalPrice: number) {
    const parsed = parseFloat(editPriceValue.replace(/[^0-9.]/g, ''))
    if (isNaN(parsed) || parsed < 0) { setEditingPriceId(null); return }
    if (parsed === originalPrice) {
      // Revertir al precio original
      updateItemPrice(productId, null, null)
    } else {
      updateItemPrice(productId, parsed, editPriceNote.trim() || null)
    }
    setEditingPriceId(null)
  }

  // ── descuento ──────────────────────────────────────────────────────────────
  const [discountInput, setDiscountInput] = useState('')
  const [discount, setDiscount] = useState<DiscountCode | null>(null)
  const [validatingDiscount, setValidatingDiscount] = useState(false)
  const [discountError, setDiscountError] = useState<string | null>(null)

  // ── envío / notas / pago ───────────────────────────────────────────────────
  const [shippingCost, setShippingCost] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')

  // ── vista mobile (tab switcher) ────────────────────────────────────────────
  const [mobileView, setMobileView] = useState<'catalog' | 'cart'>('catalog')

  // ── confirmación / envío ───────────────────────────────────────────────────
  const [confirmModal, setConfirmModal] = useState<'draft' | 'completed' | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [successModal, setSuccessModal] = useState<{
    orderNumber: string; total: number; status: 'draft' | 'completed'
  } | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // ─────────────────────────────────────────────────────────────────────────────
  // Cargar productos
  // ─────────────────────────────────────────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true)
    try {
      const { data } = await api.get<{ data: Product[] }>('/api/products')
      setProducts(data.data)
    } finally {
      setLoadingProducts(false)
    }
  }, [])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  // ─────────────────────────────────────────────────────────────────────────────
  // Cargar borrador cuando se abre el POS en modo edición (?draft=<id>)
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!draftOrderId || products.length === 0) return
    let cancelled = false
    setDraftLoading(true)

    async function loadDraft() {
      try {
        const { data } = await api.get<{ data: {
          id: string; order_number: string; status: string
          client_id: string | null; guest_name: string | null
          payment_method: 'cash' | 'transfer'
          shipping_cost: number; notes: string | null
          discount_code_id: string | null
          client: Client | null
          discount_code: DiscountCode | null
          items: Array<{ product_id: string; quantity: number; unit_price: number; price_note: string | null }>
        } }>(`/api/orders/${draftOrderId}`)
        if (cancelled) return
        const order = data.data

        // Poblar carrito
        clearCart()
        for (const item of order.items ?? []) {
          const product = products.find(p => p.id === item.product_id)
          if (product) {
            addItem(product)
            if (item.quantity > 1) updateQuantity(product.id, item.quantity)
            // Restaurar precio ajustado si difiere del precio actual de inventario
            if (item.unit_price !== product.price || item.price_note) {
              updateItemPrice(product.id, item.unit_price, item.price_note ?? null)
            }
          }
        }

        // Poblar cliente
        if (order.client_id && order.client) {
          setClientMode('registered')
          setSelectedClient(order.client)
        } else if (order.guest_name) {
          setClientMode('guest')
          setGuestName(order.guest_name)
        }

        // Poblar campos de pago y extras
        setPaymentMethod(order.payment_method)
        setShippingCost(order.shipping_cost > 0 ? String(order.shipping_cost) : '')
        setNotes(order.notes ?? '')

        // Poblar descuento
        if (order.discount_code) {
          setDiscountInput(order.discount_code.code)
          setDiscount(order.discount_code)
        }

        setDraftOrderNumber(order.order_number)
      } catch {
        // ignorar errores al cargar borrador
      } finally {
        if (!cancelled) setDraftLoading(false)
      }
    }

    loadDraft()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftOrderId, products.length])

  // ─────────────────────────────────────────────────────────────────────────────
  // Buscar clientes (debounce manual) — solo cuando no hay cliente ya seleccionado
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (clientMode !== 'registered' || selectedClient || !clientSearch.trim()) {
      setClientResults([])
      setClientDropdownOpen(false)
      return
    }
    const t = setTimeout(async () => {
      setSearchingClients(true)
      try {
        const { data } = await api.get<{ data: Client[] }>('/api/clients', {
          params: { q: clientSearch.trim() },
        })
        setClientResults(data.data)
        if (data.data.length > 0) setClientDropdownOpen(true)
      } finally {
        setSearchingClients(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [clientSearch, clientMode, selectedClient])

  // Cerrar dropdown al hacer clic fuera de la sección de cliente
  useEffect(() => {
    if (!clientDropdownOpen) return
    function handleOutside(e: MouseEvent) {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [clientDropdownOpen])

  // ─────────────────────────────────────────────────────────────────────────────
  // Filtrar productos por búsqueda
  // ─────────────────────────────────────────────────────────────────────────────
  const filteredProducts = products.filter(p => {
    const q = productSearch.toLowerCase()
    return p.name.toLowerCase().includes(q) || p.sku.includes(q)
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // Cálculos del pedido
  // ─────────────────────────────────────────────────────────────────────────────
  const gross = subtotalGross()
  const discountPct = discount?.percentage ?? 0
  const shipping = parseFloat(shippingCost) || 0
  const { subtotalNet, total } = calcOrderTotal(gross, discountPct, shipping)

  // ─────────────────────────────────────────────────────────────────────────────
  // Limpiar orden completa (carrito + cliente + descuento + extras)
  // ─────────────────────────────────────────────────────────────────────────────
  function clearOrder() {
    clearCart()
    setGuestName('')
    setSelectedClient(null)
    setClientSearch('')
    setClientResults([])
    setClientDropdownOpen(false)
    setDiscount(null)
    setDiscountInput('')
    setDiscountError(null)
    setShippingCost('')
    setNotes('')
    setPaymentMethod('cash')
    setSubmitError(null)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Validar código de descuento
  // ─────────────────────────────────────────────────────────────────────────────
  async function validateDiscount() {
    if (!discountInput.trim()) return
    setValidatingDiscount(true)
    setDiscountError(null)
    try {
      const params: Record<string, string> = { code: discountInput.trim().toUpperCase() }
      if (clientMode === 'registered' && selectedClient) {
        params.client_id = selectedClient.id
      }
      const { data } = await api.get<{ data: DiscountCode }>('/api/discount-codes/validate', { params })
      setDiscount(data.data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Código inválido o inactivo'
      setDiscountError(msg)
      setDiscount(null)
    } finally {
      setValidatingDiscount(false)
    }
  }

  function removeDiscount() {
    setDiscount(null); setDiscountInput(''); setDiscountError(null)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Crear cliente rápido
  // ─────────────────────────────────────────────────────────────────────────────
  async function handleCreateClient(e: FormEvent) {
    e.preventDefault()
    setNewClientError(null)
    if (!newClientForm.name.trim()) { setNewClientError('El nombre es requerido'); return }
    setCreatingClient(true)
    try {
      const { data } = await api.post<{ data: Client }>('/api/clients', {
        name: newClientForm.name.trim(),
        email: newClientForm.email.trim() || undefined,
        phone: newClientForm.phone.trim() || undefined,
      })
      setSelectedClient(data.data)
      setClientSearch('')
      setClientResults([])
      setNewClientModal(false)
      setNewClientForm(EMPTY_CLIENT_FORM)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Error al crear cliente'
      setNewClientError(msg)
    } finally {
      setCreatingClient(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Validación antes de confirmar
  // ─────────────────────────────────────────────────────────────────────────────
  const canSubmit =
    items.length > 0 &&
    (clientMode === 'guest' ? guestName.trim().length > 0 : selectedClient !== null)

  // ─────────────────────────────────────────────────────────────────────────────
  // Enviar orden
  // ─────────────────────────────────────────────────────────────────────────────
  async function handleSubmitOrder(status: 'draft' | 'completed') {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const payload = {
        client_id: clientMode === 'registered' ? selectedClient?.id : undefined,
        guest_name: clientMode === 'guest' ? guestName.trim() : undefined,
        payment_method: paymentMethod,
        discount_code_id: discount?.id ?? undefined,
        discount_percentage: discountPct,
        subtotal_gross: gross,
        subtotal_net: subtotalNet,
        shipping_cost: shipping,
        total,
        notes: notes.trim() || undefined,
        items: items.map(item => {
          const effectivePrice = item.customPrice ?? item.price
          return {
            product_id: item.id,
            product_name: item.name,
            product_sku: item.sku,
            unit_price: effectivePrice,
            original_price: item.customPrice !== undefined ? item.price : null,
            price_note: item.priceNote ?? null,
            quantity: item.quantity,
            line_total: effectivePrice * item.quantity,
          }
        }),
      }

      if (draftOrderId) {
        // Modo edición: PUT para actualizar el borrador
        await api.put(`/api/orders/${draftOrderId}`, payload)

        if (status === 'completed') {
          // Completar: PATCH /:id/complete después del PUT
          await api.patch(`/api/orders/${draftOrderId}/complete`)
        }

        setConfirmModal(null)
        clearOrder()
        navigate('/ordenes')
      } else {
        // Modo normal: POST
        const { data } = await api.post<{ data: { order_number: string; total: number } }>('/api/orders', {
          ...payload,
          status,
        })
        setSuccessModal({ orderNumber: data.data.order_number, total: data.data.total, status })
        setConfirmModal(null)
        clearOrder()
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Error al guardar la orden'
      setSubmitError(msg)
      setConfirmModal(null)
    } finally {
      setSubmitting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SKU-search rápido: Enter con SKU exacto agrega directamente
  // ─────────────────────────────────────────────────────────────────────────────
  function handleProductSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && isValidSKU(productSearch.trim())) {
      const match = products.find(p => p.sku === productSearch.trim())
      if (match) { addItem(match); setProductSearch('') }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  const cartCount = items.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-5rem)]">

      {/* ── Banner: modo edición de borrador ──────────────────────────────── */}
      {draftOrderId && (
        <div className="bg-brand-lime/15 border border-brand-lime/40 text-brand-lime px-4 py-2.5 rounded-xl text-sm shrink-0 flex items-center gap-2">
          <Pencil size={14} className="shrink-0" />
          <span>Editando borrador</span>
          {draftOrderNumber && <span className="font-bold font-mono">{draftOrderNumber}</span>}
          {draftLoading && <Loader2 size={13} className="animate-spin ml-auto" />}
        </div>
      )}

      {/* ── Tab bar — solo mobile ──────────────────────────────────────────── */}
      <div className="flex lg:hidden rounded-xl overflow-hidden bg-white/5 p-0.5 gap-0.5 shrink-0">
        <button
          onClick={() => setMobileView('catalog')}
          className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors
            ${mobileView === 'catalog' ? 'bg-brand-lime text-brand-black' : 'text-white/50 hover:text-white'}`}
        >
          Catálogo
        </button>
        <button
          onClick={() => setMobileView('cart')}
          className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2
            ${mobileView === 'cart' ? 'bg-brand-lime text-brand-black' : 'text-white/50 hover:text-white'}`}
        >
          Carrito
          {cartCount > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold
              ${mobileView === 'cart' ? 'bg-black/20 text-brand-black' : 'bg-brand-lime text-brand-black'}`}>
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Contenedor de paneles ──────────────────────────────────────────── */}
      <div className="flex-1 flex gap-5 overflow-hidden min-h-0">

      {/* ──────────── PANEL IZQUIERDO: Catálogo ──────────── */}
      <div className={cn(
        'flex-1 flex flex-col min-w-0 overflow-hidden',
        mobileView === 'cart' ? 'hidden lg:flex' : 'flex'
      )}>
        <div className="mb-3">
          <h1 className="text-2xl font-bold text-brand-white mb-1">Punto de Venta</h1>
          <p className="text-white/40 text-sm">Busca por nombre o SKU · Enter para agregar por SKU exacto</p>
        </div>

        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
          <input
            type="text"
            className="input pl-9"
            placeholder="Buscar producto por nombre o SKU..."
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
            onKeyDown={handleProductSearchKey}
          />
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {loadingProducts ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="card p-4 animate-pulse space-y-2">
                  <div className="h-3 bg-white/10 rounded w-1/2" />
                  <div className="h-4 bg-white/10 rounded w-full" />
                  <div className="h-3 bg-white/10 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-white/40 text-sm">
              {productSearch ? `Sin resultados para "${productSearch}"` : 'No hay plantas registradas'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredProducts.map(product => {
                const cartItem = items.find(i => i.id === product.id)
                const inCart = !!cartItem
                const outOfStock = product.stock === 0
                return (
                  <button
                    key={product.id}
                    onClick={() => !outOfStock && addItem(product)}
                    disabled={outOfStock}
                    className={`card p-4 text-left transition-all cursor-pointer
                      ${outOfStock ? 'opacity-40 cursor-not-allowed' : 'hover:border-brand-lime/40 hover:bg-white/5'}
                      ${inCart ? 'border-brand-lime/60 bg-brand-lime/5' : ''}`}
                  >
                    <p className="font-mono text-xs text-brand-lime mb-1">{product.sku}</p>
                    <p className="text-sm font-medium text-brand-white leading-tight line-clamp-2">{product.name}</p>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs font-semibold text-white/80">{formatCOP(product.price)}</p>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs ${product.stock < 5 ? 'text-amber-400' : 'text-white/40'}`}>
                          {product.stock} uds
                        </span>
                        {inCart && (
                          <span className="w-5 h-5 rounded-full bg-brand-lime text-brand-black text-xs font-bold flex items-center justify-center">
                            {cartItem!.quantity}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ──────────── PANEL DERECHO: Carrito + Formulario ──────────── */}
      <div className={cn(
        'flex flex-col gap-3 overflow-y-auto',
        'lg:w-[380px] lg:shrink-0',
        mobileView === 'catalog' ? 'hidden lg:flex' : 'flex flex-1 lg:flex-none'
      )}>

        {/* ── Carrito de productos ──────────────────────────────────── */}
        <div className="card p-0 overflow-hidden shrink-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <ShoppingCart size={15} className="text-brand-lime" />
              <span className="text-sm font-semibold text-brand-white">Productos</span>
              {items.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-brand-lime text-brand-black text-xs font-bold">
                  {items.reduce((s, i) => s + i.quantity, 0)}
                </span>
              )}
            </div>
            {items.length > 0 && (
              <button
                onClick={() => clearCart()}
                className="text-xs text-white/30 hover:text-red-400 transition-colors"
              >
                Vaciar
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-white/30 text-sm">
              Haz clic en un producto para agregarlo
            </div>
          ) : (
            /* Sin max-height: todos los productos se ven, el panel derecho hace scroll */
            <div className="divide-y divide-white/5">
              {items.map(item => {
                const maxStock      = products.find(p => p.id === item.id)?.stock ?? 0
                const effectivePrice = item.customPrice ?? item.price
                const priceModified  = item.customPrice !== undefined
                const isEditingThis  = editingPriceId === item.id
                return (
                  <div
                    key={item.id}
                    className={`flex items-start gap-2 px-4 py-2.5 transition-colors
                      ${isEditingThis ? 'bg-brand-lime/5 border-l-2 border-brand-lime' : 'border-l-2 border-transparent'}`}
                  >
                    {/* Nombre y precio */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-brand-white truncate">{item.name}</p>

                      {/* Vista del precio con ícono de edición */}
                      <div className="flex items-center gap-1 flex-wrap">
                        <p className={`text-xs ${priceModified ? 'text-brand-lime font-semibold' : 'text-white/40'}`}>
                          {formatCOP(effectivePrice)} c/u
                        </p>
                        {priceModified && (
                          <p className="text-xs text-white/25 line-through">{formatCOP(item.price)}</p>
                        )}
                        <button
                          onClick={() => openPriceEdit(item)}
                          className={`transition-colors ${isEditingThis ? 'text-brand-lime' : 'text-white/25 hover:text-brand-lime'}`}
                          title="Ajustar precio"
                        >
                          <Pencil size={10} />
                        </button>
                      </div>

                      {/* Nota del ajuste */}
                      {priceModified && item.priceNote && (
                        <p className="text-xs text-white/30 italic truncate mt-0.5">
                          📝 {item.priceNote}
                        </p>
                      )}
                    </div>

                    {/* Controles +/- */}
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      <button
                        onClick={() =>
                          item.quantity > 1
                            ? updateQuantity(item.id, item.quantity - 1)
                            : removeItem(item.id)
                        }
                        className="w-7 h-7 rounded-md border border-white/20 bg-white/10 hover:bg-brand-lime/20 hover:border-brand-lime/50 hover:text-brand-lime flex items-center justify-center transition-colors text-white/70"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-7 text-center text-sm font-bold text-brand-white">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        disabled={item.quantity >= maxStock}
                        className="w-7 h-7 rounded-md border border-white/20 bg-white/10 hover:bg-brand-lime/20 hover:border-brand-lime/50 hover:text-brand-lime flex items-center justify-center transition-colors text-white/70 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Plus size={12} />
                      </button>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="w-7 h-7 rounded-md border border-white/10 bg-white/5 hover:bg-red-500/20 hover:border-red-500/30 flex items-center justify-center text-white/30 hover:text-red-400 transition-colors ml-0.5"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    {/* Subtotal línea */}
                    <p className="text-xs font-semibold text-brand-white w-16 text-right shrink-0 mt-0.5">
                      {formatCOP(effectivePrice * item.quantity)}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Tarjeta: editor de precio ─────────────────────────────── */}
        {editingPriceId && (() => {
          const editingItem = items.find(i => i.id === editingPriceId)
          if (!editingItem) return null
          const parsedNew = parseFloat(editPriceValue)
          const priceChanged = !isNaN(parsedNew) && parsedNew !== editingItem.price
          return (
            <div className="card p-4 space-y-3 border-brand-lime/30 bg-brand-lime/[0.04]">
              {/* Encabezado */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Pencil size={14} className="text-brand-lime" />
                  <span className="text-sm font-semibold text-brand-white">Ajustar precio</span>
                </div>
                <button
                  onClick={() => setEditingPriceId(null)}
                  className="text-white/30 hover:text-white/70 transition-colors"
                  title="Cancelar"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Nombre del producto */}
              <p className="text-xs text-white/50 truncate -mt-1">{editingItem.name}</p>

              {/* Campo de precio */}
              <div>
                <label className="label">Precio de venta (COP)</label>
                <input
                  type="number"
                  min="0"
                  value={editPriceValue}
                  onChange={e => setEditPriceValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') confirmPriceEdit(editingItem.id, editingItem.price)
                    if (e.key === 'Escape') setEditingPriceId(null)
                  }}
                  className="input text-sm"
                  autoFocus
                  placeholder={String(editingItem.price)}
                />
                {priceChanged && (
                  <p className="text-xs text-white/40 mt-1">
                    Precio original de inventario: {formatCOP(editingItem.price)}
                  </p>
                )}
              </div>

              {/* Campo de nota */}
              <div>
                <label className="label">
                  Motivo del ajuste <span className="text-white/30 font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Ej: Planta más pequeña de lo normal"
                  value={editPriceNote}
                  onChange={e => setEditPriceNote(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') confirmPriceEdit(editingItem.id, editingItem.price)
                    if (e.key === 'Escape') setEditingPriceId(null)
                  }}
                  className="input text-sm"
                />
              </div>

              {/* Botones */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setEditingPriceId(null)}
                  className="btn-secondary flex-1 text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => confirmPriceEdit(editingItem.id, editingItem.price)}
                  className="btn-primary flex-1 text-sm"
                >
                  Aplicar precio
                </button>
              </div>
            </div>
          )
        })()}

        {/* ── Cliente ───────────────────────────────────────────────── */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <User size={14} className="text-brand-lime" />
            <span className="text-sm font-semibold text-brand-white">Cliente</span>
          </div>

          {/* Toggle visitante / registrado */}
          <div className="flex rounded-lg overflow-hidden bg-white/5 p-0.5 gap-0.5">
            {(['guest', 'registered'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => {
                  setClientMode(mode)
                  setSelectedClient(null)
                  setClientSearch('')
                  setClientResults([])
                  setGuestName('')
                }}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors
                  ${clientMode === mode ? 'bg-brand-lime text-brand-black' : 'text-white/50 hover:text-white'}`}
              >
                {mode === 'guest' ? 'Visitante' : 'Registrado'}
              </button>
            ))}
          </div>

          {clientMode === 'guest' ? (
            <input
              type="text"
              className="input text-sm"
              placeholder="Nombre del cliente *"
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
            />
          ) : (
            /* ── Modo registrado ── */
            <div ref={clientDropdownRef} className="space-y-2">
              {selectedClient ? (
                /* Cliente ya seleccionado: mostrar card con opción a cambiar */
                <div className="flex items-center gap-2.5 px-3 py-2.5 bg-brand-lime/10 border border-brand-lime/30 rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-brand-lime/20 flex items-center justify-center shrink-0">
                    <User size={14} className="text-brand-lime" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-brand-lime truncate">{selectedClient.name}</p>
                    {selectedClient.email && (
                      <p className="text-xs text-white/40 truncate">{selectedClient.email}</p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setSelectedClient(null)
                      setClientSearch('')
                      setClientResults([])
                      // Re-enfoca el buscador para editar inmediatamente
                      setTimeout(() => clientSearchRef.current?.focus(), 50)
                    }}
                    title="Cambiar cliente"
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-white/40 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                  >
                    <X size={12} /> Cambiar
                  </button>
                </div>
              ) : (
                /* Buscar cliente */
                <>
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                    <input
                      ref={clientSearchRef}
                      type="text"
                      className="input pl-8 pr-8 text-sm"
                      placeholder="Buscar cliente por nombre..."
                      value={clientSearch}
                      onChange={e => setClientSearch(e.target.value)}
                      onFocus={() => clientResults.length > 0 && setClientDropdownOpen(true)}
                    />
                    {searchingClients ? (
                      <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 animate-spin" />
                    ) : clientSearch ? (
                      <button
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => {
                          setClientSearch('')
                          setClientResults([])
                          setClientDropdownOpen(false)
                          clientSearchRef.current?.focus()
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                      >
                        <X size={13} />
                      </button>
                    ) : null}

                    {/* Dropdown de resultados */}
                    {clientDropdownOpen && clientResults.length > 0 && (
                      <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-[#0a1f16] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                        {clientResults.map(c => (
                          <button
                            key={c.id}
                            className="w-full text-left px-3 py-2.5 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                            onMouseDown={e => e.preventDefault()} // evita que el blur cierre el dropdown antes del click
                            onClick={() => {
                              setSelectedClient(c)
                              setClientSearch('')
                              setClientResults([])
                              setClientDropdownOpen(false)
                            }}
                          >
                            <p className="text-sm font-medium text-brand-white">{c.name}</p>
                            {c.email && <p className="text-xs text-white/40">{c.email}</p>}
                            {c.phone && <p className="text-xs text-white/40">{c.phone}</p>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setNewClientModal(true)}
                    className="flex items-center gap-1.5 text-xs text-brand-lime hover:underline"
                  >
                    <UserPlus size={12} /> Crear nuevo cliente
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Código de descuento ───────────────────────────────────── */}
        <div className="card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Tag size={14} className="text-brand-lime" />
            <span className="text-sm font-semibold text-brand-white">Código de descuento</span>
          </div>
          {discount ? (
            <div className="flex items-center justify-between px-3 py-2 bg-brand-lime/10 border border-brand-lime/20 rounded-lg">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-brand-lime">{discount.code}</p>
                  {discount.reward_tier != null && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-semibold">
                      <Gift size={9} /> Recompensa
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/50">{discount.percentage}% sobre subtotal de productos</p>
                {discount.expires_at && (
                  <p className="text-[10px] text-white/30 mt-0.5">
                    Vence: {new Date(discount.expires_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
              <button onClick={removeDiscount} className="text-white/40 hover:text-red-400 transition-colors">
                <X size={13} />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                className="input text-sm uppercase flex-1"
                placeholder="ORQUIDEA20"
                value={discountInput}
                onChange={e => { setDiscountInput(e.target.value.toUpperCase()); setDiscountError(null) }}
                onKeyDown={e => e.key === 'Enter' && validateDiscount()}
              />
              <button
                onClick={validateDiscount}
                disabled={validatingDiscount || !discountInput.trim()}
                className="btn-secondary px-3 text-xs shrink-0"
              >
                {validatingDiscount ? <Loader2 size={13} className="animate-spin" /> : 'Aplicar'}
              </button>
            </div>
          )}
          {discountError && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <AlertTriangle size={11} /> {discountError}
            </p>
          )}
        </div>

        {/* ── Envío / Notas / Pago ──────────────────────────────────── */}
        <div className="card p-4 space-y-3">
          <div>
            <label className="label flex items-center gap-1.5">
              <Truck size={13} className="text-brand-lime" /> Envío (COP)
            </label>
            <input
              type="number"
              className="input text-sm"
              placeholder="0"
              min={0}
              step={1000}
              value={shippingCost}
              onChange={e => setShippingCost(e.target.value)}
            />
          </div>
          <div>
            <label className="label flex items-center gap-1.5">
              <FileText size={13} className="text-brand-lime" /> Notas
            </label>
            <textarea
              className="input text-sm resize-none"
              rows={2}
              placeholder="Instrucciones especiales, dirección de envío..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
          <div>
            <label className="label flex items-center gap-1.5">
              <CreditCard size={13} className="text-brand-lime" /> Método de pago
            </label>
            <div className="flex rounded-lg overflow-hidden bg-white/5 p-0.5 gap-0.5">
              <button
                onClick={() => setPaymentMethod('cash')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-md transition-colors
                  ${paymentMethod === 'cash' ? 'bg-brand-lime text-brand-black' : 'text-white/50 hover:text-white'}`}
              >
                <Banknote size={13} /> Efectivo
              </button>
              <button
                onClick={() => setPaymentMethod('transfer')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-md transition-colors
                  ${paymentMethod === 'transfer' ? 'bg-brand-lime text-brand-black' : 'text-white/50 hover:text-white'}`}
              >
                <CreditCard size={13} /> Transferencia
              </button>
            </div>
          </div>
        </div>

        {/* ── Resumen del pedido ────────────────────────────────────── */}
        <div className="card p-4 space-y-2">
          {/* Header del resumen con botón Limpiar orden */}
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Resumen</p>
            {(items.length > 0 || guestName || selectedClient || discount || shipping > 0 || notes) && (
              <button
                onClick={clearOrder}
                className="flex items-center gap-1 text-xs text-white/30 hover:text-red-400 transition-colors"
              >
                <Trash2 size={11} /> Limpiar orden
              </button>
            )}
          </div>

          <div className="flex justify-between text-sm text-white/70">
            <span>Subtotal bruto</span>
            <span>{formatCOP(gross)}</span>
          </div>
          {discountPct > 0 && (
            <div className="flex justify-between text-sm text-brand-lime">
              <span>Descuento ({discountPct}%)</span>
              <span>−{formatCOP(gross - subtotalNet)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm text-white/70">
            <span>Subtotal neto</span>
            <span>{formatCOP(subtotalNet)}</span>
          </div>
          {shipping > 0 && (
            <div className="flex justify-between text-sm text-white/70">
              <span>Envío</span>
              <span>{formatCOP(shipping)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-brand-white border-t border-white/10 pt-2 mt-1">
            <span>Total</span>
            <span className="text-brand-lime">{formatCOP(total)}</span>
          </div>
        </div>

        {/* Error */}
        {submitError && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Aviso cuando falta el cliente */}
        {!canSubmit && items.length > 0 && (
          <p className="text-xs text-amber-400 text-center">
            {clientMode === 'guest'
              ? 'Ingresa el nombre del cliente para continuar'
              : 'Selecciona un cliente registrado para continuar'}
          </p>
        )}

        {/* Botones de acción */}
        <div className="flex flex-col gap-2 pb-4">
          <button
            onClick={() => setConfirmModal('completed')}
            disabled={!canSubmit || submitting}
            className="btn-primary flex items-center justify-center gap-2 w-full disabled:opacity-40"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            Completar orden
          </button>
          <button
            onClick={() => setConfirmModal('draft')}
            disabled={!canSubmit || submitting}
            className="btn-secondary flex items-center justify-center gap-2 w-full disabled:opacity-40"
          >
            <FileText size={15} />
            {draftOrderId ? 'Actualizar borrador' : 'Guardar borrador'}
          </button>
        </div>
      </div>
      </div>{/* /panels wrapper */}

      {/* ──────────── Modal: Crear cliente nuevo ──────────── */}
      <Modal
        isOpen={newClientModal}
        onClose={() => { setNewClientModal(false); setNewClientForm(EMPTY_CLIENT_FORM); setNewClientError(null) }}
        title="Nuevo cliente"
        size="sm"
      >
        <form onSubmit={handleCreateClient} className="space-y-4">
          <div>
            <label className="label">Nombre *</label>
            <input type="text" className="input" placeholder="María García"
              value={newClientForm.name}
              onChange={e => setNewClientForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" placeholder="maria@email.com"
              value={newClientForm.email}
              onChange={e => setNewClientForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className="label">Teléfono</label>
            <input type="tel" className="input" placeholder="300 123 4567"
              value={newClientForm.phone}
              onChange={e => setNewClientForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          {newClientError && (
            <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{newClientError}</p>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button"
              onClick={() => { setNewClientModal(false); setNewClientForm(EMPTY_CLIENT_FORM); setNewClientError(null) }}
              className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={creatingClient}
              className="btn-primary flex-1 flex items-center justify-center gap-2">
              {creatingClient && <Loader2 size={14} className="animate-spin" />}
              Crear cliente
            </button>
          </div>
        </form>
      </Modal>

      {/* ──────────── Modal: Confirmar orden ──────────── */}
      <Modal
        isOpen={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        title={confirmModal === 'completed' ? (draftOrderId ? 'Completar borrador' : 'Confirmar venta') : (draftOrderId ? 'Actualizar borrador' : 'Guardar borrador')}
        size="sm"
      >
        <div className="space-y-4">
          {/* Listado de productos en la confirmación */}
          {items.length > 0 && (
            <div className="bg-white/5 rounded-xl overflow-hidden divide-y divide-white/5 mb-1">
              {items.map(item => {
                const ep = item.customPrice ?? item.price
                return (
                  <div key={item.id} className="flex justify-between items-center px-3 py-2">
                    <span className="text-xs text-white/70 truncate flex-1">{item.name}</span>
                    <span className="text-xs text-white/40 mx-3 shrink-0">× {item.quantity}</span>
                    <span className={`text-xs font-semibold shrink-0 ${item.customPrice !== undefined ? 'text-brand-lime' : 'text-brand-white'}`}>
                      {formatCOP(ep * item.quantity)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          <div className="space-y-2 text-sm text-white/70">
            <div className="flex justify-between">
              <span>Cliente</span>
              <span className="text-brand-white font-medium">
                {clientMode === 'guest' ? guestName : selectedClient?.name}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Pago</span>
              <span className="text-brand-white">
                {paymentMethod === 'cash' ? 'Efectivo' : 'Transferencia'}
              </span>
            </div>
            {discountPct > 0 && (
              <div className="flex justify-between text-brand-lime">
                <span>Descuento ({discount?.code})</span>
                <span>−{discountPct}%</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-brand-white border-t border-white/10 pt-2">
              <span>Total</span>
              <span className="text-brand-lime">{formatCOP(total)}</span>
            </div>
          </div>

          {confirmModal === 'completed' && (
            <p className="text-xs text-white/50 bg-white/5 rounded-lg px-3 py-2">
              Al completar, el stock de los productos se actualizará automáticamente.
            </p>
          )}

          <div className="flex gap-3">
            <button onClick={() => setConfirmModal(null)} className="btn-secondary flex-1">Cancelar</button>
            <button
              onClick={() => handleSubmitOrder(confirmModal!)}
              disabled={submitting}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {confirmModal === 'completed' ? 'Confirmar' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ──────────── Modal: Éxito ──────────── */}
      <Modal
        isOpen={!!successModal}
        onClose={() => setSuccessModal(null)}
        title={successModal?.status === 'completed' ? '¡Venta completada! 🌿' : 'Borrador guardado'}
        size="sm"
      >
        {successModal && (
          <div className="space-y-4 text-center">
            <div className="w-16 h-16 mx-auto bg-brand-lime/20 rounded-full flex items-center justify-center">
              <CheckCircle2 size={32} className="text-brand-lime" />
            </div>
            <div>
              <p className="text-lg font-bold text-brand-white">{successModal.orderNumber}</p>
              <p className="text-2xl font-bold text-brand-lime mt-1">{formatCOP(successModal.total)}</p>
              {successModal.status === 'draft' && (
                <p className="text-xs text-white/50 mt-2">
                  Puedes completarla desde la sección Órdenes
                </p>
              )}
            </div>
            <button onClick={() => setSuccessModal(null)} className="btn-primary w-full">
              Nueva venta
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}
