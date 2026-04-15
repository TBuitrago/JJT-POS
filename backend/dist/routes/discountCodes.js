"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const authorize_1 = require("../middleware/authorize");
const supabase_1 = require("../services/supabase");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
// ============================================================
// GET /api/discount-codes — listar todos los códigos
// ============================================================
router.get('/', async (_req, res) => {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('discount_codes')
        .select('*, assigned_client:clients(id, name, email)')
        .order('created_at', { ascending: false });
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json({ data });
});
// ============================================================
// GET /api/discount-codes/validate?code=X&client_id=Y — validar código
// ============================================================
router.get('/validate', async (req, res) => {
    const code = req.query.code?.trim().toUpperCase();
    const clientId = req.query.client_id?.trim();
    if (!code) {
        res.status(400).json({ error: 'El parámetro "code" es requerido' });
        return;
    }
    const { data, error } = await supabase_1.supabaseAdmin
        .from('discount_codes')
        .select('*')
        .eq('code', code)
        .eq('is_active', true)
        .maybeSingle();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    if (!data) {
        res.status(404).json({ error: 'Código inválido o inactivo' });
        return;
    }
    // Verificar expiración
    if (data.expires_at && new Date(data.expires_at) <= new Date()) {
        res.status(400).json({ error: 'Este código ha expirado' });
        return;
    }
    // Verificar usos disponibles
    if (data.max_uses !== null && data.uses_count >= data.max_uses) {
        res.status(400).json({ error: 'Este código ya fue utilizado' });
        return;
    }
    // Verificar asignación a cliente
    if (data.assigned_client_id) {
        if (!clientId) {
            res.status(400).json({ error: 'Este código es personal. Selecciona el cliente asignado primero.' });
            return;
        }
        if (data.assigned_client_id !== clientId) {
            res.status(400).json({ error: 'Este código pertenece a otro cliente' });
            return;
        }
    }
    res.json({ data });
});
// ============================================================
// POST /api/discount-codes — crear código de descuento
// ============================================================
router.post('/', authorize_1.requireAdmin, async (req, res) => {
    const { code, percentage } = req.body;
    if (!code?.trim()) {
        res.status(400).json({ error: 'El código es requerido' });
        return;
    }
    if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
        res.status(400).json({ error: 'El porcentaje debe ser un número entre 1 y 100' });
        return;
    }
    const normalizedCode = code.trim().toUpperCase();
    // Verificar unicidad del código
    const { data: existing } = await supabase_1.supabaseAdmin
        .from('discount_codes')
        .select('id')
        .eq('code', normalizedCode)
        .maybeSingle();
    if (existing) {
        res.status(400).json({ error: `El código "${normalizedCode}" ya existe` });
        return;
    }
    const { data: discountCode, error } = await supabase_1.supabaseAdmin
        .from('discount_codes')
        .insert({ code: normalizedCode, percentage })
        .select()
        .single();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.status(201).json({ data: discountCode });
});
// ============================================================
// PUT /api/discount-codes/:id — actualizar código
// ============================================================
router.put('/:id', authorize_1.requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { percentage, is_active } = req.body;
    if (percentage !== undefined && (isNaN(percentage) || percentage <= 0 || percentage > 100)) {
        res.status(400).json({ error: 'El porcentaje debe ser un número entre 1 y 100' });
        return;
    }
    const { data: current, error: fetchError } = await supabase_1.supabaseAdmin
        .from('discount_codes')
        .select('id')
        .eq('id', id)
        .maybeSingle();
    if (fetchError || !current) {
        res.status(404).json({ error: 'Código de descuento no encontrado' });
        return;
    }
    const updates = {};
    if (percentage !== undefined)
        updates.percentage = percentage;
    if (is_active !== undefined)
        updates.is_active = is_active;
    const { data: discountCode, error } = await supabase_1.supabaseAdmin
        .from('discount_codes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json({ data: discountCode });
});
// ============================================================
// DELETE /api/discount-codes/:id — eliminar código
// ============================================================
router.delete('/:id', authorize_1.requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { data: code, error: fetchError } = await supabase_1.supabaseAdmin
        .from('discount_codes')
        .select('id, code')
        .eq('id', id)
        .maybeSingle();
    if (fetchError || !code) {
        res.status(404).json({ error: 'Código de descuento no encontrado' });
        return;
    }
    const { error } = await supabase_1.supabaseAdmin
        .from('discount_codes')
        .delete()
        .eq('id', id);
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json({ message: `Código "${code.code}" eliminado` });
});
exports.default = router;
//# sourceMappingURL=discountCodes.js.map