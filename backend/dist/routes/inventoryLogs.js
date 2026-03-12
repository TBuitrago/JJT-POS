"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../services/supabase");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
// ============================================================
// GET /api/inventory-logs — historial de movimientos de stock
// ============================================================
router.get('/', async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const action = req.query.action;
    const productId = req.query.product_id;
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    let query = supabase_1.supabaseAdmin
        .from('inventory_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);
    if (action)
        query = query.eq('action', action);
    if (productId)
        query = query.eq('product_id', productId);
    const { data, error, count } = await query;
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json({
        data,
        meta: {
            page,
            limit,
            total: count ?? 0,
            pages: Math.ceil((count ?? 0) / limit),
        },
    });
});
exports.default = router;
//# sourceMappingURL=inventoryLogs.js.map