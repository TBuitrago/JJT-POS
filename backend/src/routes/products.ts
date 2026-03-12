import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { supabaseAdmin } from '../services/supabase'

const router = Router()
router.use(authMiddleware)

// ============================================================
// GET /api/products — listar productos activos
// ============================================================
router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  // Supabase PostgREST tiene un límite de 1000 filas por request.
  // Paginamos en lotes de 1000 hasta obtener todos los productos.
  const PAGE = 1000
  const all: unknown[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('name')
      .range(from, from + PAGE - 1)

    if (error) { res.status(500).json({ error: error.message }); return }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  res.json({ data: all })
})

// ============================================================
// POST /api/products — crear nueva planta (SKU auto-incremental)
// ============================================================
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, price, stock } = req.body as {
    name: string; price: number; stock: number
  }

  if (!name?.trim()) {
    res.status(400).json({ error: 'El nombre es requerido' })
    return
  }
  if (price < 0) {
    res.status(400).json({ error: 'El precio no puede ser negativo' })
    return
  }
  if (stock < 0) {
    res.status(400).json({ error: 'El stock no puede ser negativo' })
    return
  }

  // Calcular SKU: máximo actual (incluyendo inactivos) + 1, relleno a 4 dígitos
  const { data: lastProduct } = await supabaseAdmin
    .from('products')
    .select('sku')
    .order('sku', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextNum = lastProduct ? parseInt(lastProduct.sku, 10) + 1 : 1
  const sku = String(nextNum).padStart(4, '0')

  // Crear producto
  const { data: product, error } = await supabaseAdmin
    .from('products')
    .insert({ sku, name: name.trim(), price, stock })
    .select()
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  // Log de creación en inventory_logs
  await supabaseAdmin.from('inventory_logs').insert({
    product_id: product.id,
    product_name: product.name,
    action: 'create',
    quantity_change: stock,
    quantity_before: 0,
    quantity_after: stock,
    performed_by: req.userEmail,
  })

  res.status(201).json({ data: product })
})

// ============================================================
// PUT /api/products/:id — editar planta
// ============================================================
router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params
  const { name, price, stock } = req.body as {
    name: string; price: number; stock: number
  }

  if (!name?.trim()) {
    res.status(400).json({ error: 'El nombre es requerido' })
    return
  }
  if (price < 0) {
    res.status(400).json({ error: 'El precio no puede ser negativo' })
    return
  }
  if (stock < 0) {
    res.status(400).json({ error: 'El stock no puede ser negativo' })
    return
  }

  // Obtener producto actual
  const { data: current, error: fetchError } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle()

  if (fetchError || !current) {
    res.status(404).json({ error: 'Producto no encontrado' })
    return
  }

  // Actualizar producto
  const { data: product, error } = await supabaseAdmin
    .from('products')
    .update({ name: name.trim(), price, stock })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  // Log de cambio de stock (solo si cambió)
  const stockDiff = stock - current.stock
  if (stockDiff !== 0) {
    await supabaseAdmin.from('inventory_logs').insert({
      product_id: id,
      product_name: name.trim(),
      action: stockDiff > 0 ? 'add' : 'remove',
      quantity_change: stockDiff,
      quantity_before: current.stock,
      quantity_after: stock,
      performed_by: req.userEmail,
    })
  }

  res.json({ data: product })
})

// ============================================================
// DELETE /api/products/:id — soft delete de planta
// ============================================================
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params

  // Obtener producto actual
  const { data: product, error: fetchError } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle()

  if (fetchError || !product) {
    res.status(404).json({ error: 'Producto no encontrado' })
    return
  }

  // Soft delete
  const { error } = await supabaseAdmin
    .from('products')
    .update({ is_active: false })
    .eq('id', id)

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  // Log de eliminación
  await supabaseAdmin.from('inventory_logs').insert({
    product_id: id,
    product_name: product.name,
    action: 'delete',
    quantity_change: -product.stock,
    quantity_before: product.stock,
    quantity_after: 0,
    performed_by: req.userEmail,
  })

  res.json({ message: `Producto "${product.name}" eliminado` })
})

export default router
