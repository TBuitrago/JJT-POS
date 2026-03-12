/**
 * update-orders.ts
 * Actualiza órdenes previamente importadas con datos detallados de WooCommerce.
 *
 * Uso:
 *   cd backend
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx ts-node --transpile-only src/_update-orders.ts /ruta/ordenes-detalle.csv [--dry-run]
 *
 * Formato CSV esperado (WooCommerce Orders export completo):
 *   record_id, Status, Billing Email, Payment method,
 *   Shipping Total Amount, Discount Total Amount, Subtotal, Total Amount, ...
 *
 * Qué actualiza por orden (match por WC record_id → notes='WC #XXXX'):
 *   - payment_method   : Transferencia → transfer | Efectivo/otros → cash
 *   - shipping_cost    : Shipping Total Amount
 *   - subtotal_gross   : Subtotal
 *   - subtotal_net     : Subtotal − Discount Total Amount
 *   - discount_percentage: (Discount / Subtotal) × 100  [0 si no hay descuento]
 *   - total            : Total Amount
 *   - client_id        : si hay Billing Email y coincide con un cliente en Supabase
 *                        (reemplaza el match por nombre de la importación original)
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aisjzorranmtnitjzban.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const DRY_RUN = process.argv.includes('--dry-run')
const CSV_PATH = process.argv.find((a: string) => !a.startsWith('--') && a.endsWith('.csv'))

if (!CSV_PATH) {
  console.error('❌ Debes pasar la ruta del CSV como argumento')
  process.exit(1)
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Falta SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ── Parsear CSV ───────────────────────────────────────────────────────────────
function parseCSV(filePath: string): Record<string, string>[] {
  const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '') // strip BOM
  const lines = content.split(/\r?\n/).filter((l: string) => l.trim())
  if (lines.length < 2) { console.error('❌ CSV vacío'); process.exit(1) }

  const delimiter = ','

  function parseLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim()); current = ''
      } else {
        current += ch
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseLine(lines[0]).map((h: string) => h.trim())
  return lines.slice(1).map((line: string) => {
    const values = parseLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h: string, i: number) => { row[h] = (values[i] ?? '').trim() })
    return row
  })
}

// ── Mapear método de pago ─────────────────────────────────────────────────────
function mapPaymentMethod(wc: string): 'cash' | 'transfer' {
  const lower = wc.toLowerCase()
  if (lower.includes('transfer') || lower.includes('bancari') ||
      lower.includes('nequi') || lower.includes('daviplata') ||
      lower.includes('pse') || lower.includes('bacs')) {
    return 'transfer'
  }
  return 'cash'
}

// ── Cargar clientes de Supabase (map email → id) ──────────────────────────────
async function loadClientEmailMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('clients').select('id, email').range(from, from + 999)
    if (error || !data || data.length === 0) break
    data.forEach((c: { id: string; email: string }) => map.set(c.email.toLowerCase(), c.id))
    if (data.length < 1000) break
    from += 1000
  }
  return map
}

// ── Cargar órdenes importadas (map WC_id → {id, guest_name, client_id}) ──────
async function loadImportedOrders(): Promise<Map<string, { id: string; guest_name: string | null; client_id: string | null }>> {
  const map = new Map<string, { id: string; guest_name: string | null; client_id: string | null }>()
  const { data, error } = await supabase
    .from('orders')
    .select('id, notes, guest_name, client_id')
    .like('notes', 'WC #%')
  if (error) { console.error('Error cargando órdenes:', error.message); return map }
  data?.forEach((o: { id: string; notes: string; guest_name: string | null; client_id: string | null }) => {
    const match = o.notes?.match(/WC #(\d+)/)
    if (match) map.set(match[1], { id: o.id, guest_name: o.guest_name, client_id: o.client_id })
  })
  return map
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🌿 Actualizador de órdenes — Culto Orquídeas`)
  console.log(`   Archivo: ${path.basename(CSV_PATH!)}`)
  console.log(`   Modo: ${DRY_RUN ? '🔍 DRY-RUN (sin cambios)' : '⚡ REAL (update en Supabase)'}\n`)

  const rows = parseCSV(CSV_PATH!)
  console.log(`📋 Filas en CSV: ${rows.length}`)

  // Filtrar solo completadas
  const completed = rows.filter(r => r['Status']?.toLowerCase().includes('completed'))
  console.log(`   ✅ Completadas: ${completed.length}\n`)

  console.log('⏳ Cargando datos de Supabase...')
  const clientMap     = await loadClientEmailMap()
  const importedOrders = await loadImportedOrders()
  console.log(`   ✓ ${clientMap.size} clientes cargados`)
  console.log(`   ✓ ${importedOrders.size} órdenes WC importadas en Supabase\n`)

  // Analizar qué va a actualizarse
  let willUpdate = 0, willSkip = 0
  let clientUpgrades = 0  // nombre → email match
  let paymentFixes = 0, shippingFixes = 0, discountFixes = 0

  for (const row of completed) {
    const wcId = row['record_id'] || ''
    if (!importedOrders.has(wcId)) { willSkip++; continue }
    willUpdate++

    const email = (row['Billing Email'] || '').toLowerCase().trim()
    const existing = importedOrders.get(wcId)!

    if (email && clientMap.has(email) && !existing.client_id) clientUpgrades++
    if (row['Payment method']) paymentFixes++
    const ship = parseFloat(row['Shipping Total Amount'] || '0') || 0
    if (ship > 0) shippingFixes++
    const disc = parseFloat(row['Discount Total Amount'] || '0') || 0
    if (disc > 0) discountFixes++
  }

  console.log(`📊 Resumen del update:`)
  console.log(`   ✅ Órdenes que se actualizarán: ${willUpdate}`)
  console.log(`   ⏭️  Sin match en Supabase (saltadas): ${willSkip}`)
  console.log(`   💳 Con método de pago a actualizar: ${paymentFixes}`)
  console.log(`   🚚 Con envío > 0: ${shippingFixes}`)
  console.log(`   🏷️  Con descuento a aplicar: ${discountFixes}`)
  console.log(`   👥 Clientes a vincular (nombre→email): ${clientUpgrades}\n`)

  // Preview primeras 10
  console.log('┌─ Vista previa (primeras 10) ───────────────────────────────────────────')
  let previewCount = 0
  for (const row of completed) {
    if (previewCount >= 10) break
    const wcId = row['record_id'] || ''
    if (!importedOrders.has(wcId)) continue

    const sub    = parseFloat(row['Subtotal'] || '0') || 0
    const disc   = parseFloat(row['Discount Total Amount'] || '0') || 0
    const ship   = parseFloat(row['Shipping Total Amount'] || '0') || 0
    const total  = parseFloat(row['Total Amount'] || '0') || 0
    const method = mapPaymentMethod(row['Payment method'] || '')
    const email  = (row['Billing Email'] || '').toLowerCase().trim()
    const clientLabel = (email && clientMap.has(email)) ? `✓ ${email}` : '👤 visitante'

    console.log(`│ WC#${wcId.padEnd(5)} ${method.padEnd(9)} envío=${String(ship).padStart(6)} sub=${String(sub).padStart(7)} disc=${String(disc).padStart(6)} total=${String(total).padStart(8)}  ${clientLabel}`)
    previewCount++
  }
  console.log('└────────────────────────────────────────────────────────────────────────\n')

  if (DRY_RUN) {
    console.log('🔍 DRY-RUN: no se realizaron cambios en Supabase.')
    return
  }

  // ── Update real ────────────────────────────────────────────────────────────
  console.log('⏳ Actualizando órdenes...')
  let updated = 0, skipped = 0, errors = 0

  for (const row of completed) {
    const wcId = row['record_id'] || ''
    const existing = importedOrders.get(wcId)
    if (!existing) { skipped++; continue }

    const sub    = parseFloat(row['Subtotal'] || '0') || 0
    const disc   = parseFloat(row['Discount Total Amount'] || '0') || 0
    const ship   = parseFloat(row['Shipping Total Amount'] || '0') || 0
    const total  = parseFloat(row['Total Amount'] || '0') || 0
    const method = mapPaymentMethod(row['Payment method'] || '')
    const discPct = (sub > 0 && disc > 0) ? Math.round((disc / sub) * 10000) / 100 : 0

    // Resolver client_id: priorizar email (más confiable que nombre)
    const email = (row['Billing Email'] || '').toLowerCase().trim()
    let client_id = existing.client_id  // mantener si ya estaba vinculado
    let guest_name = existing.guest_name

    if (email && clientMap.has(email)) {
      client_id = clientMap.get(email)!
      guest_name = null  // tiene cliente → limpiar guest_name
    }

    const updatePayload: Record<string, unknown> = {
      payment_method:      method,
      shipping_cost:       ship,
      subtotal_gross:      sub,
      subtotal_net:        sub - disc,
      discount_percentage: discPct,
      total:               total,
      client_id:           client_id || null,
      guest_name:          guest_name || null,
    }

    const { error } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', existing.id)

    if (error) {
      console.error(`  ❌ WC#${wcId}: ${error.message}`)
      errors++
      continue
    }

    const clientLabel = client_id
      ? (email ? `✓ ${email}` : '✓ cliente (por nombre)')
      : (guest_name ? guest_name : 'visitante')
    console.log(`  ✓  WC#${wcId.padEnd(5)} ${method.padEnd(9)} envío=${String(ship).padStart(6)} sub=${String(sub - disc).padStart(7)} total=${String(total).padStart(8)}  ${clientLabel}`)
    updated++
  }

  console.log(`\n✅ Resumen: ${updated} órdenes actualizadas, ${skipped} sin match, ${errors} errores`)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
