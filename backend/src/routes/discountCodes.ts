import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { requireAdmin } from '../middleware/authorize'
import { supabaseAdmin } from '../services/supabase'

const router = Router()
router.use(authMiddleware)

// ============================================================
// GET /api/discount-codes — listar todos los códigos
// ============================================================
router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  const { data, error } = await supabaseAdmin
    .from('discount_codes')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.json({ data })
})

// ============================================================
// GET /api/discount-codes/validate?code=X — validar código
// ============================================================
router.get('/validate', async (req: AuthRequest, res: Response): Promise<void> => {
  const code = (req.query.code as string | undefined)?.trim().toUpperCase()

  if (!code) {
    res.status(400).json({ error: 'El parámetro "code" es requerido' })
    return
  }

  const { data, error } = await supabaseAdmin
    .from('discount_codes')
    .select('*')
    .eq('code', code)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  if (!data) {
    res.status(404).json({ error: 'Código inválido o inactivo' })
    return
  }

  res.json({ data })
})

// ============================================================
// POST /api/discount-codes — crear código de descuento
// ============================================================
router.post('/', requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const { code, percentage } = req.body as {
    code: string; percentage: number
  }

  if (!code?.trim()) {
    res.status(400).json({ error: 'El código es requerido' })
    return
  }

  if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
    res.status(400).json({ error: 'El porcentaje debe ser un número entre 1 y 100' })
    return
  }

  const normalizedCode = code.trim().toUpperCase()

  // Verificar unicidad del código
  const { data: existing } = await supabaseAdmin
    .from('discount_codes')
    .select('id')
    .eq('code', normalizedCode)
    .maybeSingle()

  if (existing) {
    res.status(400).json({ error: `El código "${normalizedCode}" ya existe` })
    return
  }

  const { data: discountCode, error } = await supabaseAdmin
    .from('discount_codes')
    .insert({ code: normalizedCode, percentage })
    .select()
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.status(201).json({ data: discountCode })
})

// ============================================================
// PUT /api/discount-codes/:id — actualizar código
// ============================================================
router.put('/:id', requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params
  const { percentage, is_active } = req.body as {
    percentage?: number; is_active?: boolean
  }

  if (percentage !== undefined && (isNaN(percentage) || percentage <= 0 || percentage > 100)) {
    res.status(400).json({ error: 'El porcentaje debe ser un número entre 1 y 100' })
    return
  }

  const { data: current, error: fetchError } = await supabaseAdmin
    .from('discount_codes')
    .select('id')
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !current) {
    res.status(404).json({ error: 'Código de descuento no encontrado' })
    return
  }

  const updates: Record<string, unknown> = {}
  if (percentage !== undefined) updates.percentage = percentage
  if (is_active !== undefined) updates.is_active = is_active

  const { data: discountCode, error } = await supabaseAdmin
    .from('discount_codes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({ data: discountCode })
})

// ============================================================
// DELETE /api/discount-codes/:id — eliminar código
// ============================================================
router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params

  const { data: code, error: fetchError } = await supabaseAdmin
    .from('discount_codes')
    .select('id, code')
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !code) {
    res.status(404).json({ error: 'Código de descuento no encontrado' })
    return
  }

  const { error } = await supabaseAdmin
    .from('discount_codes')
    .delete()
    .eq('id', id)

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({ message: `Código "${code.code}" eliminado` })
})

export default router
