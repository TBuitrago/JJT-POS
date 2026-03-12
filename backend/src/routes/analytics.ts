import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { supabaseAdmin } from '../services/supabase'

const router = Router()
router.use(authMiddleware)

// ─── helper: parse ?from=YYYY-MM-DD&to=YYYY-MM-DD or ?days=N ─────────────────
// Returns { from, to } when a date range is provided or days > 0.
// Returns null when no params or days=0 → caller skips date filter (all-time).
// This preserves DashboardPage behavior: it calls /summary without params and
// expects all-time data.
function parseDateRange(
  query: Record<string, unknown>
): { from: Date; to: Date } | null {
  if (query.from && query.to) {
    const from = new Date(query.from as string)
    const to   = new Date(query.to   as string)
    from.setHours(0, 0, 0, 0)
    to.setHours(23, 59, 59, 999)
    return { from, to }
  }
  const days = parseInt(query.days as string)
  if (!days || days <= 0) return null   // null = all-time
  const to   = new Date(); to.setHours(23, 59, 59, 999)
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  from.setHours(0, 0, 0, 0)
  return { from, to }
}

// ============================================================
// GET /api/analytics/summary — KPIs principales
// ============================================================
router.get('/summary', async (req: AuthRequest, res: Response): Promise<void> => {
  const range = parseDateRange(req.query as Record<string, unknown>)

  // Órdenes completadas (filtradas por rango si se indica)
  let ordersQuery = supabaseAdmin
    .from('orders')
    .select('total, subtotal_gross, subtotal_net, shipping_cost, discount_percentage, created_at')
    .eq('status', 'completed')
    .is('deleted_at', null)

  if (range) {
    ordersQuery = ordersQuery
      .gte('created_at', range.from.toISOString())
      .lte('created_at', range.to.toISOString())
  }

  const { data: ordersData, error: ordersError } = await ordersQuery

  if (ordersError) { res.status(500).json({ error: ordersError.message }); return }

  // Productos activos — paginación para superar el límite de 1000 filas de PostgREST
  const PAGE_SIZE = 1000
  const allProducts: { stock: number; price: number }[] = []
  let fromIdx = 0
  while (true) {
    const { data: page, error: pageErr } = await supabaseAdmin
      .from('products')
      .select('stock, price')
      .eq('is_active', true)
      .range(fromIdx, fromIdx + PAGE_SIZE - 1)
    if (pageErr || !page || page.length === 0) break
    allProducts.push(...page)
    if (page.length < PAGE_SIZE) break
    fromIdx += PAGE_SIZE
  }
  const productsData = allProducts

  // Clientes registrados
  const { count: clientCount } = await supabaseAdmin
    .from('clients')
    .select('*', { count: 'exact', head: true })

  // Borradores pendientes
  const { count: draftCount } = await supabaseAdmin
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'draft')
    .is('deleted_at', null)

  const orders   = ordersData ?? []
  const products = productsData ?? []

  // Ingresos Totales = ventas netas (excluye envíos — los envíos se muestran como KPI independiente)
  const totalRevenue      = orders.reduce((s, o) => s + o.subtotal_net, 0)
  const totalSalesGross   = orders.reduce((s, o) => s + o.subtotal_gross, 0)
  const totalSalesNet     = orders.reduce((s, o) => s + o.subtotal_net, 0)
  const totalShipping     = orders.reduce((s, o) => s + o.shipping_cost, 0)
  const totalInventoryValue = products.reduce((s, p) => s + p.stock * p.price, 0)
  const totalUnits          = products.reduce((s, p) => s + p.stock, 0)
  const lowStockCount       = products.filter(p => p.stock < 5).length

  // last30Days — siempre calculado sobre el conjunto de órdenes retornado
  // (DashboardPage lo usa en sus KPI cards)
  const now          = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const ordersLast30 = orders.filter(o => new Date(o.created_at) >= thirtyDaysAgo)
  const revenueLast30 = ordersLast30.reduce((s, o) => s + o.subtotal_net, 0)

  res.json({
    data: {
      orders: {
        total:        orders.length,
        last30Days:   ordersLast30.length,
        draftPending: draftCount ?? 0,
      },
      revenue: {
        total:      totalRevenue,
        last30Days: revenueLast30,
        salesGross: totalSalesGross,
        salesNet:   totalSalesNet,
        shipping:   totalShipping,
      },
      inventory: {
        totalValue:     totalInventoryValue,
        totalUnits,
        lowStockCount,
        productsActive: products.length,
      },
      clients: {
        total: clientCount ?? 0,
      },
    },
  })
})

// ============================================================
// GET /api/analytics/sales-by-day — ventas por día
// ============================================================
router.get('/sales-by-day', async (req: AuthRequest, res: Response): Promise<void> => {
  const range = parseDateRange(req.query as Record<string, unknown>)

  // Default: últimos 30 días si no se especifica rango
  const to   = range ? new Date(range.to)   : new Date()
  const from = range ? new Date(range.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  to.setHours(23, 59, 59, 999)
  from.setHours(0, 0, 0, 0)

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('total, subtotal_net, created_at')
    .eq('status', 'completed')
    .is('deleted_at', null)
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString())
    .order('created_at')

  if (error) { res.status(500).json({ error: error.message }); return }

  // Pre-llenar TODOS los días del rango (sin límite de 90 días)
  const byDay: Record<string, { date: string; total: number; orders: number }> = {}
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)
  const endDay = new Date(to)
  endDay.setHours(0, 0, 0, 0)

  while (cursor <= endDay) {
    const key = cursor.toISOString().split('T')[0]
    byDay[key] = { date: key, total: 0, orders: 0 }
    cursor.setDate(cursor.getDate() + 1)
  }

  for (const order of data ?? []) {
    const key = order.created_at.split('T')[0]
    if (byDay[key]) {
      byDay[key].total += order.total
      byDay[key].orders += 1
    }
  }

  res.json({ data: Object.values(byDay) })
})

// ============================================================
// GET /api/analytics/top-products — productos más vendidos
// ============================================================
router.get('/top-products', async (_req: AuthRequest, res: Response): Promise<void> => {
  const { data, error } = await supabaseAdmin
    .from('order_items')
    .select('product_name, product_sku, quantity, line_total, order:orders!inner(status, deleted_at)')
    .eq('order.status', 'completed')
    .is('order.deleted_at', null)

  if (error) { res.status(500).json({ error: error.message }); return }

  // Agrupar por SKU
  const map: Record<string, { sku: string; name: string; units: number; revenue: number }> = {}
  for (const item of data ?? []) {
    if (!map[item.product_sku]) {
      map[item.product_sku] = { sku: item.product_sku, name: item.product_name, units: 0, revenue: 0 }
    }
    map[item.product_sku].units   += item.quantity
    map[item.product_sku].revenue += item.line_total
  }

  const sorted = Object.values(map).sort((a, b) => b.units - a.units).slice(0, 10)
  res.json({ data: sorted })
})

// ============================================================
// GET /api/analytics/payment-breakdown — distribución por método de pago
// ============================================================
router.get('/payment-breakdown', async (_req: AuthRequest, res: Response): Promise<void> => {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('payment_method, total')
    .eq('status', 'completed')
    .is('deleted_at', null)

  if (error) { res.status(500).json({ error: error.message }); return }

  const breakdown: Record<string, { method: string; count: number; total: number }> = {
    cash:     { method: 'Efectivo',      count: 0, total: 0 },
    transfer: { method: 'Transferencia', count: 0, total: 0 },
  }

  for (const o of data ?? []) {
    if (breakdown[o.payment_method]) {
      breakdown[o.payment_method].count += 1
      breakdown[o.payment_method].total += o.total
    }
  }

  res.json({ data: Object.values(breakdown) })
})

// ============================================================
// GET /api/analytics/discounts — total descuentos + desglose por código
// ============================================================
router.get('/discounts', async (req: AuthRequest, res: Response): Promise<void> => {
  const range = parseDateRange(req.query as Record<string, unknown>)

  let query = supabaseAdmin
    .from('orders')
    .select('subtotal_gross, subtotal_net, discount_percentage, discount_code_id, discount_code:discount_codes(id, code)')
    .eq('status', 'completed')
    .is('deleted_at', null)
    .gt('discount_percentage', 0)

  if (range) {
    query = query
      .gte('created_at', range.from.toISOString())
      .lte('created_at', range.to.toISOString())
  }

  const { data, error } = await query

  if (error) { res.status(500).json({ error: error.message }); return }

  const orders = (data ?? []) as unknown as Array<{
    subtotal_gross: number
    subtotal_net: number
    discount_percentage: number
    discount_code_id: string | null
    discount_code: { id: string; code: string } | null
  }>

  const total_amount        = orders.reduce((s, o) => s + (o.subtotal_gross - o.subtotal_net), 0)
  const orders_with_discount = orders.length

  // Agrupar por código (solo órdenes con código asociado)
  const codeMap: Record<string, { code: string; uses: number; discount_amount: number }> = {}

  for (const o of orders) {
    if (o.discount_code_id && o.discount_code) {
      const dcId = o.discount_code_id
      if (!codeMap[dcId]) {
        codeMap[dcId] = { code: o.discount_code.code, uses: 0, discount_amount: 0 }
      }
      codeMap[dcId].uses           += 1
      codeMap[dcId].discount_amount += (o.subtotal_gross - o.subtotal_net)
    }
  }

  const by_code = Object.values(codeMap).sort((a, b) => b.discount_amount - a.discount_amount)

  res.json({ data: { total_amount, orders_with_discount, by_code } })
})

export default router
