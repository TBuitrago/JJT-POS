"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../services/supabase");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
// ============================================================
// GET /api/clients — listar clientes (búsqueda opcional)
// ============================================================
router.get('/', async (req, res) => {
    const q = req.query.q?.trim().toLowerCase() ?? '';
    let query = supabase_1.supabaseAdmin
        .from('clients')
        .select('*')
        .order('name');
    if (q) {
        query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
    }
    const { data, error } = await query;
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json({ data });
});
// ============================================================
// GET /api/clients/:id — obtener cliente por ID
// ============================================================
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('clients')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    if (error || !data) {
        res.status(404).json({ error: 'Cliente no encontrado' });
        return;
    }
    res.json({ data });
});
// ============================================================
// POST /api/clients — crear cliente
// ============================================================
router.post('/', async (req, res) => {
    const { name, email, phone } = req.body;
    if (!name?.trim()) {
        res.status(400).json({ error: 'El nombre es requerido' });
        return;
    }
    // Verificar unicidad de email (si se proporcionó)
    if (email?.trim()) {
        const { data: existing } = await supabase_1.supabaseAdmin
            .from('clients')
            .select('id')
            .eq('email', email.trim().toLowerCase())
            .maybeSingle();
        if (existing) {
            res.status(400).json({ error: `Ya existe un cliente con el email ${email}` });
            return;
        }
    }
    const { data: client, error } = await supabase_1.supabaseAdmin
        .from('clients')
        .insert({
        name: name.trim(),
        email: email?.trim().toLowerCase() || null,
        phone: phone?.trim() || null,
    })
        .select()
        .single();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.status(201).json({ data: client });
});
// ============================================================
// PUT /api/clients/:id — actualizar cliente
// ============================================================
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, email, phone } = req.body;
    if (!name?.trim()) {
        res.status(400).json({ error: 'El nombre es requerido' });
        return;
    }
    // Verificar que el cliente existe
    const { data: current, error: fetchError } = await supabase_1.supabaseAdmin
        .from('clients')
        .select('id')
        .eq('id', id)
        .maybeSingle();
    if (fetchError || !current) {
        res.status(404).json({ error: 'Cliente no encontrado' });
        return;
    }
    // Verificar unicidad de email (si cambió)
    if (email?.trim()) {
        const { data: existing } = await supabase_1.supabaseAdmin
            .from('clients')
            .select('id')
            .eq('email', email.trim().toLowerCase())
            .neq('id', id)
            .maybeSingle();
        if (existing) {
            res.status(400).json({ error: `Ya existe un cliente con el email ${email}` });
            return;
        }
    }
    const { data: client, error } = await supabase_1.supabaseAdmin
        .from('clients')
        .update({
        name: name.trim(),
        email: email?.trim().toLowerCase() || null,
        phone: phone?.trim() || null,
    })
        .eq('id', id)
        .select()
        .single();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json({ data: client });
});
// ============================================================
// DELETE /api/clients/:id — eliminar cliente
// ============================================================
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const { data: client, error: fetchError } = await supabase_1.supabaseAdmin
        .from('clients')
        .select('id, name')
        .eq('id', id)
        .maybeSingle();
    if (fetchError || !client) {
        res.status(404).json({ error: 'Cliente no encontrado' });
        return;
    }
    const { error } = await supabase_1.supabaseAdmin
        .from('clients')
        .delete()
        .eq('id', id);
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json({ message: `Cliente "${client.name}" eliminado` });
});
exports.default = router;
//# sourceMappingURL=clients.js.map