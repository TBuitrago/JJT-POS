"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAndEmitReward = checkAndEmitReward;
const supabase_1 = require("./supabase");
const email_1 = require("./email");
// ─── Configuración del programa de recompensas ──────────────────────────────
const REWARD_TIER = 500000; // COP acumulados para activar recompensa
const REWARD_PERCENTAGE = 20; // % de descuento
const REWARD_EXPIRY_DAYS = 30; // Vigencia del código en días
const REWARD_MAX_USES = 1; // Un solo uso
// ─── Generar código único formato ORQ-XXXXXX ────────────────────────────────
function generateRewardCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin I/O/0/1 para evitar confusión
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return `ORQ-${code}`;
}
// ─── Verificar y emitir recompensa si el cliente cruzó el umbral ────────────
async function checkAndEmitReward(clientId, completedOrderId) {
    // 1. Calcular gasto histórico del cliente (solo órdenes completadas y no eliminadas)
    const { data: spendData, error: spendError } = await supabase_1.supabaseAdmin
        .from('orders')
        .select('total')
        .eq('client_id', clientId)
        .eq('status', 'completed')
        .is('deleted_at', null);
    if (spendError || !spendData) {
        console.error('[Rewards] Error al calcular gasto del cliente:', spendError?.message);
        return;
    }
    const totalSpend = spendData.reduce((sum, order) => sum + Number(order.total), 0);
    // 2. ¿Cruzó el umbral?
    if (totalSpend < REWARD_TIER)
        return;
    // 3. ¿Ya existe una recompensa para este cliente y umbral?
    const { data: existing } = await supabase_1.supabaseAdmin
        .from('discount_codes')
        .select('id')
        .eq('assigned_client_id', clientId)
        .eq('reward_tier', REWARD_TIER)
        .maybeSingle();
    if (existing)
        return; // Ya fue recompensado por este umbral
    // 4. Generar código y fecha de expiración
    const code = generateRewardCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REWARD_EXPIRY_DAYS);
    // 5. Insertar código de recompensa
    const { data: rewardCode, error: insertError } = await supabase_1.supabaseAdmin
        .from('discount_codes')
        .insert({
        code,
        percentage: REWARD_PERCENTAGE,
        is_active: true,
        max_uses: REWARD_MAX_USES,
        uses_count: 0,
        assigned_client_id: clientId,
        expires_at: expiresAt.toISOString(),
        reward_tier: REWARD_TIER,
    })
        .select()
        .single();
    // Si falla por índice único → el código ya fue emitido (idempotencia)
    if (insertError) {
        if (insertError.code === '23505')
            return; // Unique constraint violation
        console.error('[Rewards] Error al crear código de recompensa:', insertError.message);
        return;
    }
    // 6. Obtener datos del cliente para el email
    const { data: client } = await supabase_1.supabaseAdmin
        .from('clients')
        .select('name, email')
        .eq('id', clientId)
        .single();
    if (!client?.email) {
        console.warn('[Rewards] Cliente sin email, código creado pero no enviado:', rewardCode.code);
        return;
    }
    // 7. Enviar email de recompensa (no bloqueante)
    (0, email_1.sendRewardEmail)({
        clientName: client.name,
        clientEmail: client.email,
        code: rewardCode.code,
        percentage: REWARD_PERCENTAGE,
        expiresAt: expiresAt.toISOString(),
    }).catch(err => console.error('[Rewards] Error al enviar email de recompensa:', err.message));
    console.log(`[Rewards] Código ${rewardCode.code} emitido para cliente ${client.name} (${client.email})`);
}
//# sourceMappingURL=rewards.js.map