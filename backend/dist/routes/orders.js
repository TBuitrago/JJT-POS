"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../services/supabase");
const email_1 = require("../services/email");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
// ============================================================
// GET /api/orders — listar órdenes (paginado)
// ============================================================
router.get('/', async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 20));
    const status = req.query.status;
    const client_id = req.query.client_id;
    let search = req.query.search?.trim();
    if (search && search.length > 100)
        search = search.slice(0, 100);
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    let query = supabase_1.supabaseAdmin
        .from('orders')
        .select(`
      *,
      client:clients(id, name, email, phone),
      discount_code:discount_codes(id, code, percentage),
      items:order_items(*)
    `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);
    if (status === 'deleted') {
        query = query.not('deleted_at', 'is', null);
    }
    else {
        query = query.is('deleted_at', null);
        if (status)
            query = query.eq('status', status);
    }
    if (client_id)
        query = query.eq('client_id', client_id);
    // ── Búsqueda por nombre de cliente, email o número de orden ─────────────
    if (search) {
        // 1. Buscar clientes registrados que coincidan con nombre o email
        const { data: matchingClients } = await supabase_1.supabaseAdmin
            .from('clients')
            .select('id')
            .or(`name.ilike.%${search}%,email.ilike.%${search}%`);
        const clientIds = (matchingClients ?? []).map((c) => c.id);
        // 2. Filtrar órdenes: número de orden coincide, guest_name coincide
        //    O client_id está en los IDs de clientes encontrados
        if (clientIds.length > 0) {
            query = query.or(`order_number.ilike.%${search}%,guest_name.ilike.%${search}%,client_id.in.(${clientIds.join(',')})`);
        }
        else {
            query = query.or(`order_number.ilike.%${search}%,guest_name.ilike.%${search}%`);
        }
    }
    const { data, error, count } = await query;
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json({
        data,
        meta: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
    });
});
// ============================================================
// GET /api/orders/:id — detalle de orden
// ============================================================
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('orders')
        .select(`
      *,
      client:clients(id, name, email, phone),
      discount_code:discount_codes(id, code, percentage),
      items:order_items(*)
    `)
        .eq('id', id)
        .maybeSingle();
    if (error || !data) {
        res.status(404).json({ error: 'Orden no encontrada' });
        return;
    }
    res.json({ data });
});
// ============================================================
// POST /api/orders — crear orden (borrador o completada)
// ============================================================
router.post('/', async (req, res) => {
    const { client_id, guest_name, payment_method, discount_code_id, discount_percentage, subtotal_gross, subtotal_net, shipping_cost, total, notes, status, items, } = req.body;
    // Validaciones básicas
    if (!client_id && !guest_name?.trim()) {
        res.status(400).json({ error: 'Se requiere cliente registrado o nombre de cliente' });
        return;
    }
    if (!payment_method || !['cash', 'transfer'].includes(payment_method)) {
        res.status(400).json({ error: 'Método de pago inválido (cash | transfer)' });
        return;
    }
    if (!items || items.length === 0) {
        res.status(400).json({ error: 'La orden debe tener al menos un producto' });
        return;
    }
    if (!['draft', 'completed'].includes(status)) {
        res.status(400).json({ error: 'Estado de orden inválido (draft | completed)' });
        return;
    }
    // Si hay código de descuento, verificar que es activo
    if (discount_code_id) {
        const { data: dc } = await supabase_1.supabaseAdmin
            .from('discount_codes')
            .select('id')
            .eq('id', discount_code_id)
            .eq('is_active', true)
            .maybeSingle();
        if (!dc) {
            res.status(400).json({ error: 'El código de descuento no es válido o está inactivo' });
            return;
        }
    }
    // Si el pedido está completo: verificar stock suficiente
    if (status === 'completed') {
        for (const item of items) {
            const { data: product } = await supabase_1.supabaseAdmin
                .from('products')
                .select('id, name, stock')
                .eq('id', item.product_id)
                .eq('is_active', true)
                .maybeSingle();
            if (!product) {
                res.status(400).json({ error: `Producto "${item.product_name}" no encontrado o inactivo` });
                return;
            }
            if (product.stock < item.quantity) {
                res.status(400).json({
                    error: `Stock insuficiente para "${product.name}": disponible ${product.stock}, solicitado ${item.quantity}`,
                });
                return;
            }
        }
    }
    // Crear orden
    const { data: order, error: orderError } = await supabase_1.supabaseAdmin
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
    })
        .select()
        .single();
    if (orderError) {
        res.status(500).json({ error: orderError.message });
        return;
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
    }));
    const { error: itemsError } = await supabase_1.supabaseAdmin
        .from('order_items')
        .insert(orderItems);
    if (itemsError) {
        // Rollback manual: eliminar la orden si fallan los items
        await supabase_1.supabaseAdmin.from('orders').delete().eq('id', order.id);
        res.status(500).json({ error: itemsError.message });
        return;
    }
    // Si está completada: descontar stock y registrar en inventory_logs
    if (status === 'completed') {
        for (const item of items) {
            // Obtener stock actual
            const { data: product } = await supabase_1.supabaseAdmin
                .from('products')
                .select('stock')
                .eq('id', item.product_id)
                .single();
            if (!product)
                continue;
            const newStock = product.stock - item.quantity;
            // Actualizar stock
            await supabase_1.supabaseAdmin
                .from('products')
                .update({ stock: newStock })
                .eq('id', item.product_id);
            // Registrar en inventory_logs
            await supabase_1.supabaseAdmin.from('inventory_logs').insert({
                product_id: item.product_id,
                product_name: item.product_name,
                action: 'sale',
                quantity_change: -item.quantity,
                quantity_before: product.stock,
                quantity_after: newStock,
                performed_by: req.userEmail,
                order_id: order.id,
                notes: `Venta — Orden ${order.order_number}`,
            });
        }
    }
    // Retornar orden completa con items
    const { data: fullOrder } = await supabase_1.supabaseAdmin
        .from('orders')
        .select(`
      *,
      client:clients(id, name, email, phone),
      discount_code:discount_codes(id, code, percentage),
      items:order_items(*)
    `)
        .eq('id', order.id)
        .single();
    // Enviar email de confirmación si el cliente tiene email (no bloqueante)
    if (status === 'completed' && fullOrder?.client?.email) {
        (0, email_1.sendOrderConfirmation)({
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
        }).catch(err => console.error('[Email] Error al enviar confirmación de orden:', err.message));
    }
    res.status(201).json({ data: fullOrder });
});
// ============================================================
// PUT /api/orders/:id — actualizar borrador (reemplaza items)
// ============================================================
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { client_id, guest_name, payment_method, discount_code_id, discount_percentage, subtotal_gross, subtotal_net, shipping_cost, total, notes, items, } = req.body;
    // Verificar que la orden existe, es borrador y no está eliminada
    const { data: order, error: fetchError } = await supabase_1.supabaseAdmin
        .from('orders')
        .select('id, status')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();
    if (fetchError || !order) {
        res.status(404).json({ error: 'Orden no encontrada' });
        return;
    }
    if (order.status !== 'draft') {
        res.status(400).json({ error: 'Solo se pueden editar órdenes en borrador' });
        return;
    }
    // Validaciones básicas
    if (!client_id && !guest_name?.trim()) {
        res.status(400).json({ error: 'Se requiere cliente registrado o nombre de cliente' });
        return;
    }
    if (!payment_method || !['cash', 'transfer'].includes(payment_method)) {
        res.status(400).json({ error: 'Método de pago inválido (cash | transfer)' });
        return;
    }
    if (!items || items.length === 0) {
        res.status(400).json({ error: 'La orden debe tener al menos un producto' });
        return;
    }
    // Actualizar header de la orden
    const { error: updateError } = await supabase_1.supabaseAdmin
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
        .eq('id', id);
    if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
    }
    // Eliminar items anteriores
    const { error: deleteError } = await supabase_1.supabaseAdmin
        .from('order_items')
        .delete()
        .eq('order_id', id);
    if (deleteError) {
        res.status(500).json({ error: deleteError.message });
        return;
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
    }));
    const { error: itemsError } = await supabase_1.supabaseAdmin
        .from('order_items')
        .insert(newItems);
    if (itemsError) {
        res.status(500).json({ error: itemsError.message });
        return;
    }
    // Retornar orden actualizada
    const { data: fullOrder } = await supabase_1.supabaseAdmin
        .from('orders')
        .select(`
      *,
      client:clients(id, name, email, phone),
      discount_code:discount_codes(id, code, percentage),
      items:order_items(*)
    `)
        .eq('id', id)
        .single();
    res.json({ data: fullOrder });
});
// ============================================================
// PATCH /api/orders/:id/complete — completar borrador
// ============================================================
router.patch('/:id/complete', async (req, res) => {
    const { id } = req.params;
    // Obtener orden con items
    const { data: order, error: fetchError } = await supabase_1.supabaseAdmin
        .from('orders')
        .select('*, items:order_items(*)')
        .eq('id', id)
        .maybeSingle();
    if (fetchError || !order) {
        res.status(404).json({ error: 'Orden no encontrada' });
        return;
    }
    if (order.status === 'completed') {
        res.status(400).json({ error: 'La orden ya está completada' });
        return;
    }
    // Verificar stock para cada item
    const items = order.items;
    for (const item of items) {
        const { data: product } = await supabase_1.supabaseAdmin
            .from('products')
            .select('id, name, stock')
            .eq('id', item.product_id)
            .eq('is_active', true)
            .maybeSingle();
        if (!product) {
            res.status(400).json({ error: `Producto "${item.product_name}" no encontrado o inactivo` });
            return;
        }
        if (product.stock < item.quantity) {
            res.status(400).json({
                error: `Stock insuficiente para "${product.name}": disponible ${product.stock}, solicitado ${item.quantity}`,
            });
            return;
        }
    }
    // Marcar como completada
    const { error: updateError } = await supabase_1.supabaseAdmin
        .from('orders')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', id);
    if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
    }
    // Descontar stock y registrar logs
    for (const item of items) {
        const { data: product } = await supabase_1.supabaseAdmin
            .from('products')
            .select('stock')
            .eq('id', item.product_id)
            .single();
        if (!product)
            continue;
        const newStock = product.stock - item.quantity;
        await supabase_1.supabaseAdmin
            .from('products')
            .update({ stock: newStock })
            .eq('id', item.product_id);
        await supabase_1.supabaseAdmin.from('inventory_logs').insert({
            product_id: item.product_id,
            product_name: item.product_name,
            action: 'sale',
            quantity_change: -item.quantity,
            quantity_before: product.stock,
            quantity_after: newStock,
            performed_by: req.userEmail,
            order_id: id,
            notes: `Venta — Orden ${order.order_number}`,
        });
    }
    const { data: fullOrder } = await supabase_1.supabaseAdmin
        .from('orders')
        .select(`
      *,
      client:clients(id, name, email, phone),
      discount_code:discount_codes(id, code, percentage),
      items:order_items(*)
    `)
        .eq('id', id)
        .single();
    // Enviar email de confirmación si el cliente tiene email (no bloqueante)
    if (fullOrder?.client?.email) {
        (0, email_1.sendOrderConfirmation)({
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
        }).catch(err => console.error('[Email] Error al enviar confirmación de orden:', err.message));
    }
    res.json({ data: fullOrder });
});
// ============================================================
// DELETE /api/orders/:id — soft-delete (cualquier estado)
// Si completada: revierte stock y crea inventory_logs
// ============================================================
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const { data: order, error: fetchError } = await supabase_1.supabaseAdmin
        .from('orders')
        .select('id, order_number, status, items:order_items(*)')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();
    if (fetchError || !order) {
        res.status(404).json({ error: 'Orden no encontrada' });
        return;
    }
    // Si estaba completada: revertir stock
    if (order.status === 'completed') {
        const items = order.items;
        for (const item of items) {
            const { data: product } = await supabase_1.supabaseAdmin
                .from('products')
                .select('stock')
                .eq('id', item.product_id)
                .single();
            if (!product)
                continue;
            const newStock = product.stock + item.quantity;
            await supabase_1.supabaseAdmin
                .from('products')
                .update({ stock: newStock })
                .eq('id', item.product_id);
            await supabase_1.supabaseAdmin.from('inventory_logs').insert({
                product_id: item.product_id,
                product_name: item.product_name,
                action: 'add',
                quantity_change: item.quantity,
                quantity_before: product.stock,
                quantity_after: newStock,
                performed_by: req.userEmail,
                order_id: id,
                notes: `Reversión — Orden ${order.order_number} eliminada`,
            });
        }
    }
    // Soft-delete
    const { error } = await supabase_1.supabaseAdmin
        .from('orders')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json({ message: `Orden "${order.order_number}" eliminada` });
});
exports.default = router;
//# sourceMappingURL=orders.js.map