import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { supabaseAdmin } from '../services/supabase'

const router = Router()
router.use(authMiddleware)

// ============================================================
// GET /api/clients — listar clientes (búsqueda opcional)
// ============================================================
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const q = (req.query.q as string | undefined)?.trim().toLowerCase() ?? ''

  let query = supabaseAdmin
    .from('clients')
    .select('*')
    .order('name')

  if (q) {
    query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
  }

  const { data, error } = await query

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.json({ data })
})

// ============================================================
// GET /api/clients/:id — obtener cliente por ID
// ============================================================
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params

  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) {
    res.status(404).json({ error: 'Cliente no encontrado' })
    return
  }
  res.json({ data })
})

// ============================================================
// POST /api/clients — crear cliente
// ============================================================
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, email, phone } = req.body as {
    name: string; email?: string; phone?: string
  }

  if (!name?.trim()) {
    res.status(400).json({ error: 'El nombre es requerido' })
    return
  }

  // Verificar unicidad de email (si se proporcionó)
  if (email?.trim()) {
    const { data: existing } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (existing) {
      res.status(400).json({ error: `Ya existe un cliente con el email ${email}` })
      return
    }
  }

  const { data: client, error } = await supabaseAdmin
    .from('clients')
    .insert({
      name: name.trim(),
      email: email?.trim().toLowerCase() || null,
      phone: phone?.trim() || null,
    })
    .select()
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.status(201).json({ data: client })
})

// ============================================================
// PUT /api/clients/:id — actualizar cliente
// ============================================================
router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params
  const { name, email, phone } = req.body as {
    name: string; email?: string; phone?: string
  }

  if (!name?.trim()) {
    res.status(400).json({ error: 'El nombre es requerido' })
    return
  }

  // Verificar que el cliente existe
  const { data: current, error: fetchError } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !current) {
    res.status(404).json({ error: 'Cliente no encontrado' })
    return
  }

  // Verificar unicidad de email (si cambió)
  if (email?.trim()) {
    const { data: existing } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .neq('id', id)
      .maybeSingle()

    if (existing) {
      res.status(400).json({ error: `Ya existe un cliente con el email ${email}` })
      return
    }
  }

  const { data: client, error } = await supabaseAdmin
    .from('clients')
    .update({
      name: name.trim(),
      email: email?.trim().toLowerCase() || null,
      phone: phone?.trim() || null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({ data: client })
})

// ============================================================
// DELETE /api/clients/:id — eliminar cliente
// ============================================================
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params

  const { data: client, error: fetchError } = await supabaseAdmin
    .from('clients')
    .select('id, name')
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !client) {
    res.status(404).json({ error: 'Cliente no encontrado' })
    return
  }

  const { error } = await supabaseAdmin
    .from('clients')
    .delete()
    .eq('id', id)

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({ message: `Cliente "${client.name}" eliminado` })
})

export default router
