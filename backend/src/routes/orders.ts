import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { requireAdmin } from '../middleware/authorize'
import { supabaseAdmin } from '../services/supabase'
import { sendOrderConfirmation } from '../services/email'
import { checkAndEmitReward } from '../services/rewards'

const router = Router()
router.use(authMiddleware)

// ─── Helper: consumir código de uso limitado + verificar recompensa ──────────
async function handlePostCompletion(orderId: string, discountCodeId: string | null, clientId: string | null): Promise<void> {
  // 1. Si la orden usó un código con límite de usos → consumirlo atómicamente
  if (discountCodeId) {
    const { data: dc } = await supabaseAdmin
      .from('discount_codes')
      .select('max_uses, uses_count')
      .eq('id', discountCodeId)
      .single()

    if (dc && dc.max_uses !== null) {
      // UPDATE atómico: los filtros eq + lt garantizan que solo un request concurrente tenga efecto
      const { data: consumed } = await supabaseAdmin
        .from('discount_codes')
        .update({
          uses_count: dc.uses_count + 1,
          is_active: (dc.uses_count + 1 >= dc.max_uses) ? false : true,
          redeemed_in_order_id: orderId,
        })
        .eq('id', discountCodeId)
        .eq('is_active', true)
        .lt('uses_count', dc.max_uses)
        .select('id')

      if (!consumed || consumed.length === 0) {
        console.warn(`[Orders] Código ${discountCodeId} ya fue consumido (concurrencia)`)
      }
    }
  }

  // 2. Si la orden tiene cliente registrado → verificar recompensa
  if (clientId) {
    checkAndEmitReward(clientId, orderId)
      .catch(err => console.error('[Orders] Error al verificar recompensa:', err.message))
  }
}

// ============================================================
// GET /api/orders — listar órdenes (paginado)
// ============================================================
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const page      = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit     = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 20))
  const status    = req.query.status as string | undefined
  const client_id = req.query.client_id as string | undefined
  let search      = (req.query.search as string | undefined)?.trim()
  if (search && search.length > 100) search = search.slice(0, 100)
  const from      = (page - 1) * limit
  const to        = from + limit - 1

  let query = supabaseAdmin
    .from('orders')
    .select(`
      *,
      client:clients(id, name, email, phone),
      discount_code:discount_codes(id, code, percentage),
      items:order_items(*)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (status === 'deleted') {
    query = query.not('deleted_at', 'is', null)
  } else {
    query = query.is('deleted_at', null)
    if (status) query = query.eq('status', status)
  }

  if (client_id) query = query.eq('client_id', client_id)

  // ── Búsqueda por nombre de cliente, email o número de orden ─────────────
  if (search) {
    // 1. Buscar clientes registrados que coincidan con nombre o email
    const { data: matchingClients } = await supabaseAdmin
      .from('clients')
      .select('id')
      .or(`name.ilike.%${search}%,email.ilike.%${search}%`)

    const clientIds = (matchingClients ?? []).map((c: { id: string }) => c.id)

    // 2. Filtrar órdenes: número de orden coincide, guest_name coincide
    //    O client_id está en los IDs de clientes encontrados
    if (clientIds.length > 0) {
      query = query.or(
        `order_number.ilike.%${search}%,guest_name.ilike.%${search}%,client_id.in.(${clientIds.join(',')})`
      )
    } else {
      query = query.or(`order_number.ilike.%${search}%,guest_name.ilike.%${search}%`)
    }
  }

  const { data, error, count } = await query

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({
    data,
    meta: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
  })
})

// ============================================================
// GET /api/orders/:id — detalle de orden
// ============================================================
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select(`
      *,
      client:clients(id, name, email, phone),
      discount_code:discount_codes(id, code, percentage),
      items:order_items(*)
    `)
    .eq('id', id)
    .maybeSingle()

  if (error || !data) {
    res.status(404).json({ error: 'Orden no encontrada' })
    return
  }

  res.json({ data })
})

// ============================================================
// POST /api/orders — crear orden (borrador o completada)
// ============================================================
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const {
    client_id,
    guest_name,
    payment_method,
    discount_code_id,
    discount_percentage,
    subtotal_gross,
    subtotal_net,
    shipping_cost,
    total,
    notes,
    status,
    items,
  } = req.body as {
    client_id?: string
    guest_name?: string
    payment_method: 'cash' | 'transfer'
    discount_code_id?: string
    discount_percentage: number
    subtotal_gross: number
    subtotal_net: number
    shipping_cost: number
    total: number
    notes?: string
    status: 'draft' | 'completed'
    items: Array<{
      product_id: string
      product_name: string
      product_sku: string
      unit_price: number
      original_price?: number | null  // precio de inventario original (null si no fue ajustado)
      price_note?: string | null       // motivo del ajuste de precio (opcional)
      quantity: number
      line_total: number
    }>
  }

  // Validaciones básicas
  if (!client_id && !guest_name?.trim()) {
    res.status(400).json({ error: 'Se requiere cliente registrado o nombre de cliente' })
    return
  }
  if (!payment_method || !['cash', 'transfer'].includes(payment_method)) {
    res.status(400).json({ error: 'Método de pago inválido (cash | transfer)' })
    return
  }
  if (!items || items.length === 0) {
    res.status(400).json({ error: 'La orden debe tener al menos un producto' })
    return
  }
  if (!['draft', 'completed'].includes(status)) {
    res.status(400).json({ error: 'Estado de orden inválido (draft | completed)' })
    return
  }

  // Si hay código de descuento, verificar que es activo
  if (discount_code_id) {
    const { data: dc } = await supabaseAdmin
      .from('discount_codes')
      .select('id')
      .eq('id', discount_code_id)
      .eq('is_active', true)
      .maybeSingle()

    if (!dc) {
      res.status(400).json({ error: 'El código de descuento no es válido o está inactivo' })
      return
    }
  }

  // Si el pedido está completo: verificar stock suficiente
  if (status === 'completed') {
    for (const item of items) {
      const { data: product } = await supabaseAdmin
        .from('products')
        .select('id, name, stock')
        .eq('id', item.product_id)
        .eq('is_active', true)
        .maybeSingle()

      if (!product) {
        res.status(400).json({ error: `Producto "${item.product_name}" no encontrado o inactivo` })
        return
      }
      if (product.stock < item.quantity) {
        res.status(400).json({
          error: `Stock insuficiente para "${product.name}": disponible ${product.stock}, solicitado ${item.quantity}`,
        })
        return
      }
    }
  }

  // Crear orden
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert({
      client_id: client_id || null,
      guest_name: guest_name?.trim() || null,
      payment_method,
      discount_code_id: discount_code_id || null,
      discount_percentage: discount_percentage ?? 0,
      subtotal_gross,
      subtotal_net,
      shipping_cost: shipping_cost ?? 0,
      total,
      notes: notes?.trim() || null,
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
      created_by: req.userId,
    })
    .select()
    .single()

  if (orderError) {
    res.status(500).json({ error: orderError.message })
    return
  }

  // Crear items de la orden
  const orderItems = items.map(item => ({
    order_id: order.id,
    product_id: item.product_id,
    product_name: item.product_name,
    product_sku: item.product_sku,
    unit_price: item.unit_price,
    original_price: item.original_price ?? null,
    price_note: item.price_note ?? null,
    quantity: item.quantity,
    line_total: item.line_total,
  }))

  const { error: itemsError } = await supabaseAdmin
    .from('order_items')
    .insert(orderItems)

  if (itemsError) {
    // Rollback manual: eliminar la orden si fallan los items
    await supabaseAdmin.from('orders').delete().eq('id', order.id)
    res.status(500).json({ error: itemsError.message })
    return
  }

  // Si está completada: descontar stock y registrar en inventory_logs
  if (status === 'completed') {
    for (const item of items) {
      // Obtener stock actual
      const { data: product } = await supabaseAdmin
        .from('products')
        .select('stock')
        .eq('id', item.product_id)
        .single()

      if (!product) continue

      const newStock = product.stock - item.quantity

      // Actualizar stock
      await supabaseAdmin
        .from('products')
        .update({ stock: newStock })
        .eq('id', item.product_id)

      // Registrar en inventory_logs
      await supabaseAdmin.from('inventory_logs').insert({
        product_id: item.product_id,
        product_name: item.product_name,
        action: 'sale',
        quantity_change: -item.quantity,
        quantity_before: product.stock,
        quantity_after: newStock,
        performed_by: req.userEmail,
        order_id: order.id,
        notes: `Venta — Orden ${order.order_number}`,
      })
    }
  }

  // Retornar orden completa con items
  const { data: fullOrder } = await supabaseAdmin
    .from('orders')
    .select(`
      *,
      client:clients(id, name, email, phone),
      discount_code:discount_codes(id, code, percentage),
      items:order_items(*)
    `)
    .eq('id', order.id)
    .single()

  // Enviar email de confirmación si el cliente tiene email (no bloqueante)
  if (status === 'completed' && fullOrder?.client?.email) {
    sendOrderConfirmation({
      orderNumber: fullOrder.order_number,
      clientName: fullOrder.client.name,
      clientEmail: fullOrder.client.email,
      items: fullOrder.items,
      subtotalGross: fullOrder.subtotal_gross,
      discountPercentage: fullOrder.discount_percentage,
      subtotalNet: fullOrder.subtotal_net,
      shippingCost: fullOrder.shipping_cost,
      total: fullOrder.total,
      paymentMethod: fullOrder.payment_method,
      notes: fullOrder.notes,
    }).catch(err => console.error('[Email] Error al enviar confirmación de orden:', err.message))
  }

  // Consumir código de uso limitado + verificar recompensa (no bloqueante)
  if (status === 'completed') {
    handlePostCompletion(order.id, discount_code_id || null, client_id || null)
  }

  res.status(201).json({ data: fullOrder })
})

// ============================================================
// PUT /api/orders/:id — actualizar borrador (reemplaza items)
// ============================================================
router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params
  const {
    client_id,
    guest_name,
    payment_method,
    discount_code_id,
    discount_percentage,
    subtotal_gross,
    subtotal_net,
    shipping_cost,
    total,
    notes,
    items,
  } = req.body as {
    client_id?: string
    guest_name?: string
    payment_method: 'cash' | 'transfer'
    discount_code_id?: string
    discount_percentage: number
    subtotal_gross: number
    subtotal_net: number
    shipping_cost: number
    total: number
    notes?: string
    items: Array<{
      product_id: string
      product_name: string
      product_sku: string
      unit_price: number
      original_price?: number | null  // precio de inventario original (null si no fue ajustado)
      price_note?: string | null       // motivo del ajuste de precio (opcional)
      quantity: number
      line_total: number
    }>
  }

  // Verificar que la orden existe, es borrador y no está eliminada
  const { data: order, error: fetchError } = await supabaseAdmin
    .from('orders')
    .select('id, status, created_by')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (fetchError || !order) {
    res.status(404).json({ error: 'Orden no encontrada' })
    return
  }

  if (order.status !== 'draft') {
    res.status(400).json({ error: 'Solo se pueden editar órdenes en borrador' })
    return
  }

  // Vendedores solo pueden editar órdenes que ellos crearon
  if (req.userRole === 'vendedor' && order.created_by !== req.userId) {
    res.status(403).json({ error: 'Solo puedes editar órdenes que hayas creado' })
    return
  }

  // Validaciones básicas
  if (!client_id && !guest_name?.trim()) {
    res.status(400).json({ error: 'Se requiere cliente registrado o nombre de cliente' })
    return
  }
  if (!payment_method || !['cash', 'transfer'].includes(payment_method)) {
    res.status(400).json({ error: 'Método de pago inválido (cash | transfer)' })
    return
  }
  if (!items || items.length === 0) {
    res.status(400).json({ error: 'La orden debe tener al menos un producto' })
    return
  }

  // Actualizar header de la orden
  const { error: updateError } = await supabaseAdmin
    .from('orders')
    .update({
      client_id: client_id || null,
      guest_name: guest_name?.trim() || null,
      payment_method,
      discount_code_id: discount_code_id || null,
      discount_percentage: discount_percentage ?? 0,
      subtotal_gross,
      subtotal_net,
      shipping_cost: shipping_cost ?? 0,
      total,
      notes: notes?.trim() || null,
    })
    .eq('id', id)

  if (updateError) {
    res.status(500).json({ error: updateError.message })
    return
  }

  // Eliminar items anteriores
  const { error: deleteError } = await supabaseAdmin
    .from('order_items')
    .delete()
    .eq('order_id', id)

  if (deleteError) {
    res.status(500).json({ error: deleteError.message })
    return
  }

  // Insertar nuevos items
  const newItems = items.map(item => ({
    order_id: id,
    product_id: item.product_id,
    product_name: item.product_name,
    product_sku: item.product_sku,
    unit_price: item.unit_price,
    original_price: item.original_price ?? null,
    price_note: item.price_note ?? null,
    quantity: item.quantity,
    line_total: item.line_total,
  }))

  const { error: itemsError } = await supabaseAdmin
    .from('order_items')
    .insert(newItems)

  if (itemsError) {
    res.status(500).json({ error: itemsError.message })
    return
  }

  // Retornar orden actualizada
  const { data: fullOrder } = await supabaseAdmin
    .from('orders')
    .select(`
      *,
      client:clients(id, name, email, phone),
      discount_code:discount_codes(id, code, percentage),
      items:order_items(*)
    `)
    .eq('id', id)
    .single()

  res.json({ data: fullOrder })
})

// ============================================================
// PATCH /api/orders/:id/complete — completar borrador
// ============================================================
router.patch('/:id/complete', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params

  // Obtener orden con items
  const { data: order, error: fetchError } = await supabaseAdmin
    .from('orders')
    .select('*, items:order_items(*)')
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !order) {
    res.status(404).json({ error: 'Orden no encontrada' })
    return
  }

  if (order.status === 'completed') {
    res.status(400).json({ error: 'La orden ya está completada' })
    return
  }

  // Vendedores solo pueden completar órdenes que ellos crearon
  if (req.userRole === 'vendedor' && order.created_by !== req.userId) {
    res.status(403).json({ error: 'Solo puedes completar órdenes que hayas creado' })
    return
  }

  // Verificar stock para cada item
  const items = order.items as Array<{
    product_id: string; product_name: string; quantity: number
  }>

  for (const item of items) {
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('id, name, stock')
      .eq('id', item.product_id)
      .eq('is_active', true)
      .maybeSingle()

    if (!product) {
      res.status(400).json({ error: `Producto "${item.product_name}" no encontrado o inactivo` })
      return
    }
    if (product.stock < item.quantity) {
      res.status(400).json({
        error: `Stock insuficiente para "${product.name}": disponible ${product.stock}, solicitado ${item.quantity}`,
      })
      return
    }
  }

  // Marcar como completada
  const { error: updateError } = await supabaseAdmin
    .from('orders')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', id)

  if (updateError) {
    res.status(500).json({ error: updateError.message })
    return
  }

  // Descontar stock y registrar logs
  for (const item of items) {
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('stock')
      .eq('id', item.product_id)
      .single()

    if (!product) continue

    const newStock = product.stock - item.quantity

    await supabaseAdmin
      .from('products')
      .update({ stock: newStock })
      .eq('id', item.product_id)

    await supabaseAdmin.from('inventory_logs').insert({
      product_id: item.product_id,
      product_name: item.product_name,
      action: 'sale',
      quantity_change: -item.quantity,
      quantity_before: product.stock,
      quantity_after: newStock,
      performed_by: req.userEmail,
      order_id: id,
      notes: `Venta — Orden ${order.order_number}`,
    })
  }

  const { data: fullOrder } = await supabaseAdmin
    .from('orders')
    .select(`
      *,
      client:clients(id, name, email, phone),
      discount_code:discount_codes(id, code, percentage),
      items:order_items(*)
    `)
    .eq('id', id)
    .single()

  // Enviar email de confirmación si el cliente tiene email (no bloqueante)
  if (fullOrder?.client?.email) {
    sendOrderConfirmation({
      orderNumber: fullOrder.order_number,
      clientName: fullOrder.client.name,
      clientEmail: fullOrder.client.email,
      items: fullOrder.items,
      subtotalGross: fullOrder.subtotal_gross,
      discountPercentage: fullOrder.discount_percentage,
      subtotalNet: fullOrder.subtotal_net,
      shippingCost: fullOrder.shipping_cost,
      total: fullOrder.total,
      paymentMethod: fullOrder.payment_method,
      notes: fullOrder.notes,
    }).catch(err => console.error('[Email] Error al enviar confirmación de orden:', err.message))
  }

  // Consumir código de uso limitado + verificar recompensa (no bloqueante)
  handlePostCompletion(
    id as string,
    (order.discount_code_id as string) || null,
    (order.client_id as string) || null,
  )

  res.json({ data: fullOrder })
})

// ============================================================
// DELETE /api/orders/:id — soft-delete (cualquier estado)
// Si completada: revierte stock y crea inventory_logs
// ============================================================
router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params

  const { data: order, error: fetchError } = await supabaseAdmin
    .from('orders')
    .select('id, order_number, status, items:order_items(*)')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (fetchError || !order) {
    res.status(404).json({ error: 'Orden no encontrada' })
    return
  }

  // Si estaba completada: revertir stock
  if (order.status === 'completed') {
    const items = order.items as Array<{
      product_id: string; product_name: string; quantity: number
    }>

    for (const item of items) {
      const { data: product } = await supabaseAdmin
        .from('products')
        .select('stock')
        .eq('id', item.product_id)
        .single()

      if (!product) continue

      const newStock = product.stock + item.quantity

      await supabaseAdmin
        .from('products')
        .update({ stock: newStock })
        .eq('id', item.product_id)

      await supabaseAdmin.from('inventory_logs').insert({
        product_id: item.product_id,
        product_name: item.product_name,
        action: 'add',
        quantity_change: item.quantity,
        quantity_before: product.stock,
        quantity_after: newStock,
        performed_by: req.userEmail,
        order_id: id,
        notes: `Reversión — Orden ${order.order_number} eliminada`,
      })
    }
  }

  // Soft-delete
  const { error } = await supabaseAdmin
    .from('orders')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({ message: `Orden "${order.order_number}" eliminada` })
})

export default router
