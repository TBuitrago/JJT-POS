import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { supabaseAdmin } from '../services/supabase'

const router = Router()
router.use(authMiddleware)

// ============================================================
// GET /api/inventory-logs — historial de movimientos de stock
// ============================================================
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 30))
  const action = req.query.action as string | undefined
  const productId = req.query.product_id as string | undefined
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabaseAdmin
    .from('inventory_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (action) query = query.eq('action', action)
  if (productId) query = query.eq('product_id', productId)

  const { data, error, count } = await query

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({
    data,
    meta: {
      page,
      limit,
      total: count ?? 0,
      pages: Math.ceil((count ?? 0) / limit),
    },
  })
})

export default router
