/**
 * import-orders.ts
 * Importa órdenes históricas desde un CSV de WooCommerce Analytics a Supabase.
 *
 * Uso:
 *   cd backend
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx ts-node --transpile-only src/_import-orders.ts /ruta/ordenes.csv [--dry-run] [--year=2026]
 *
 * Formato CSV soportado (WooCommerce Analytics / Google Sheets export):
 *   Date, Order #, Status, Customer, Customer type, Product(s), Items sold, Coupon(s), N. Revenue
 *
 * Comportamiento:
 *   - Solo importa órdenes con status "completed" del año indicado (default: 2026)
 *   - Inserta DIRECTAMENTE en Supabase (sin pasar por /api/orders)
 *     → No deduce stock, no envía emails, no genera inventory_logs
 *   - Guarda el Order # de WooCommerce en el campo `notes` para trazabilidad
 *   - Genera order_number CO-XXXX automáticamente vía la SEQUENCE de PostgreSQL
 *   - Detecta y salta duplicados (WC# ya importados) — seguro de re-ejecutar
 *   - Intenta hacer match de cliente por nombre exacto; si no → guest_name
 *   - Productos con doble-comilla ""Cultivar"" en DB hacen match con "Cultivar" del CSV
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aisjzorranmtnitjzban.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const DRY_RUN = process.argv.includes('--dry-run')
const YEAR_ARG = process.argv.find((a: string) => a.startsWith('--year='))
const TARGET_YEAR = YEAR_ARG ? parseInt(YEAR_ARG.split('=')[1]) : 2026
const CSV_PATH = process.argv.find((a: string) => !a.startsWith('--') && a.endsWith('.csv'))

if (!CSV_PATH) {
  console.error('❌ Debes pasar la ruta del CSV como argumento')
  console.error('   Ejemplo: npx ts-node src/_import-orders.ts /ruta/ordenes.csv [--dry-run] [--year=2026]')
  process.exit(1)
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface OrderRow {
  wc_order_id: string
  order_date: Date
  customer_name: string
  total: number
  line_items: LineItem[]
}

interface LineItem {
  name: string
  qty: number
}

interface ProductRecord {
  id: string
  sku: string
  name: string
  price: number
}

// ── Parsear CSV ───────────────────────────────────────────────────────────────
function parseCSV(filePath: string): Record<string, string>[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split(/\r?\n/).filter((l: string) => l.trim())
  if (lines.length < 2) { console.error('❌ CSV vacío'); process.exit(1) }

  const first = lines[0]
  const delimiter = first.split('\t').length > first.split(',').length ? '\t' : ','

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

  // Normalizar headers: lowercase, espacios → _
  const headers = parseLine(lines[0]).map((h: string) =>
    h.toLowerCase().trim().replace(/\s+/g, '_')
  )

  return lines.slice(1).map((line: string) => {
    const values = parseLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h: string, i: number) => { row[h] = (values[i] ?? '').trim() })
    return row
  })
}

// ── Parsear "1× ProductName, 2× OtroProducto" ────────────────────────────────
function parseProducts(raw: string): LineItem[] {
  if (!raw || !raw.trim()) return []
  const items: LineItem[] = []

  // Dividir por coma seguida de dígito(s) + × para no romper nombres con coma
  const segments = raw.split(/,\s*(?=\d+\s*[×x])/i)

  for (const seg of segments) {
    const s = seg.trim()
    if (!s) continue

    // Formato: "qty× Nombre" — × puede ser U+00D7 o 'x'
    const match = s.match(/^(\d+)\s*[×x]\s*(.+)$/i)
    if (match) {
      const qty = parseInt(match[1]) || 1
      const name = match[2].trim()
      if (name) items.push({ name, qty })
    } else {
      items.push({ name: s, qty: 1 })
    }
  }
  return items
}

// ── Mapear fila CSV → OrderRow ────────────────────────────────────────────────
function mapRowToOrder(row: Record<string, string>): OrderRow | null {
  const status = (row['status'] || '').toLowerCase()
  if (!status.includes('complet')) return null

  const dateStr = row['date'] || ''
  if (!dateStr) return null
  const order_date = new Date(dateStr)
  if (isNaN(order_date.getTime())) return null
  if (order_date.getFullYear() !== TARGET_YEAR) return null

  // "Order #" normaliza a "order_#" después del replace de espacios → _
  const wc_order_id = row['order_#'] || row['order_number'] || row['id'] || ''

  const customer_name = (row['customer'] || 'Visitante').trim()

  // "N. Revenue" normaliza a "n._revenue"
  const totalRaw = row['n._revenue'] || row['total'] || row['order_total'] || '0'
  const total = parseFloat(totalRaw.replace(/[^0-9.]/g, '')) || 0

  // "Product(s)" normaliza a "product(s)"
  const productsRaw = row['product(s)'] || row['products'] || row['line_items'] || ''
  const line_items = parseProducts(productsRaw)

  return { wc_order_id, order_date, customer_name, total, line_items }
}

// ── Cargar clientes (por email y por nombre) ───────────────────────────────────
async function loadClientMaps(): Promise<{ byEmail: Map<string, string>; byName: Map<string, string> }> {
  const byEmail = new Map<string, string>()
  const byName  = new Map<string, string>()
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('clients')
      .select('id, email, name')
      .range(from, from + 999)
    if (error) { console.error('  ⚠️  Error cargando clientes:', error.message); break }
    if (!data || data.length === 0) break
    data.forEach((c: { id: string; email: string; name: string }) => {
      byEmail.set(c.email.toLowerCase(), c.id)
      byName.set(c.name.toLowerCase().trim(), c.id)
    })
    if (data.length < 1000) break
    from += 1000
  }
  return { byEmail, byName }
}

// ── Cargar productos ───────────────────────────────────────────────────────────
// Los nombres en Supabase usan doble-comilla ""Cultivar"" pero el CSV exporta
// con comilla simple "Cultivar". Indexamos ambas variantes para garantizar match.
function normalizeQuotes(name: string): string {
  return name.replace(/""/g, '"')
}

async function loadProductMaps(): Promise<{ byName: Map<string, ProductRecord> }> {
  const byName = new Map<string, ProductRecord>()
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, sku, name, price')
      .eq('is_active', true)
      .range(from, from + 999)
    if (error) { console.error('  ⚠️  Error cargando productos:', error.message); break }
    if (!data || data.length === 0) break
    data.forEach((p: ProductRecord) => {
      const original   = p.name.toLowerCase().trim()
      const normalized = normalizeQuotes(original)  // ""X"" → "X"
      byName.set(original, p)
      if (normalized !== original) byName.set(normalized, p)
    })
    if (data.length < 1000) break
    from += 1000
  }
  return { byName }
}

// ── Resolver producto (exacto, luego prefijo) ─────────────────────────────────
function resolveProduct(itemName: string, byName: Map<string, ProductRecord>): ProductRecord | null {
  const lower = itemName.toLowerCase().trim()
  if (byName.has(lower)) return byName.get(lower)!
  // Prefijo: el nombre del CSV empieza igual que el DB (o viceversa)
  for (const [dbName, product] of byName) {
    if (dbName.startsWith(lower) || lower.startsWith(dbName)) return product
  }
  return null
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🌿 Importador de órdenes — Culto Orquídeas`)
  console.log(`   Archivo: ${path.basename(CSV_PATH!)}`)
  console.log(`   Año objetivo: ${TARGET_YEAR}`)
  console.log(`   Modo: ${DRY_RUN ? '🔍 DRY-RUN (sin cambios)' : '⚡ REAL (inserción en Supabase)'}\n`)

  const rows = parseCSV(CSV_PATH!)
  console.log(`📋 Filas en CSV: ${rows.length}`)

  console.log('⏳ Cargando datos de referencia desde Supabase...')
  const { byEmail: clientByEmail, byName: clientByName } = await loadClientMaps()
  const { byName: productByName } = await loadProductMaps()
  console.log(`   ✓ ${clientByEmail.size} clientes cargados`)
  console.log(`   ✓ ${productByName.size} productos cargados\n`)

  // Filtrar órdenes
  const orders: OrderRow[] = []
  let skippedStatus = 0, skippedYear = 0, skippedInvalid = 0

  rows.forEach((row) => {
    const status  = (row['status'] || '').toLowerCase()
    const dateStr = row['date'] || ''
    const dateObj = dateStr ? new Date(dateStr) : null

    if (!dateObj || isNaN(dateObj.getTime())) { skippedInvalid++; return }
    if (dateObj.getFullYear() !== TARGET_YEAR) { skippedYear++; return }
    if (!status.includes('complet')) { skippedStatus++; return }

    const order = mapRowToOrder(row)
    if (order) orders.push(order)
    else skippedInvalid++
  })

  console.log(`📊 Resultados del filtro:`)
  console.log(`   ✅ Órdenes válidas (año ${TARGET_YEAR}, completadas): ${orders.length}`)
  console.log(`   ⏭️  Omitidas por año distinto: ${skippedYear}`)
  console.log(`   ⏭️  Omitidas por estado (no completadas): ${skippedStatus}`)
  console.log(`   ⚠️  Omitidas por datos inválidos: ${skippedInvalid}\n`)

  if (orders.length === 0) { console.log('ℹ️  No hay órdenes para importar.'); return }

  // Análisis
  const unmatchedProducts = new Map<string, number>()
  let clientMatched = 0, guestFallback = 0
  let totalItems = 0, matchedItems = 0

  orders.forEach(order => {
    const custLower = order.customer_name.toLowerCase().trim()
    const isGuest = custLower === 'invitado' || custLower === 'guest' || custLower === ''
    if (!isGuest && clientByName.has(custLower)) clientMatched++
    else guestFallback++

    order.line_items.forEach(item => {
      totalItems++
      const p = resolveProduct(item.name, productByName)
      if (p) matchedItems++
      else unmatchedProducts.set(item.name, (unmatchedProducts.get(item.name) || 0) + 1)
    })
  })

  console.log(`👥 Clientes:`)
  console.log(`   ✓ Encontrados en Supabase (por nombre exacto): ${clientMatched}`)
  console.log(`   ℹ️  Importar como visitante/invitado: ${guestFallback}\n`)

  console.log(`📦 Productos en line items: ${matchedItems} matcheados / ${totalItems} total`)
  if (unmatchedProducts.size > 0) {
    console.log(`   ⚠️  NO matcheados (${unmatchedProducts.size} únicos — se omitirán esos items):`)
    const sorted = Array.from(unmatchedProducts.entries()).sort((a, b) => b[1] - a[1])
    sorted.slice(0, 25).forEach(([name, count]) => console.log(`      - "${name}" (×${count})`))
    if (sorted.length > 25) console.log(`      ... y ${sorted.length - 25} más`)
  }

  // Preview
  console.log('\n┌─ Vista previa (primeras 10 órdenes) ──────────────────────────────────')
  orders.slice(0, 10).forEach(o => {
    const custLabel = ['invitado','guest',''].includes(o.customer_name.toLowerCase().trim())
      ? '👤 Visitante' : o.customer_name
    console.log(`│ WC#${String(o.wc_order_id).padEnd(5)} ${o.order_date.toISOString().slice(0, 10)} ${String(o.total).padStart(9)} COP  ${o.line_items.length} items  ${custLabel}`)
  })
  if (orders.length > 10) console.log(`│ ... y ${orders.length - 10} más`)
  console.log('└────────────────────────────────────────────────────────────────────────\n')

  if (DRY_RUN) {
    console.log('🔍 DRY-RUN: no se realizaron cambios en Supabase.')
    console.log(`   Ejecuta sin --dry-run para insertar ${orders.length} órdenes.`)
    return
  }

  // ── Cargar WC IDs ya importados (evitar duplicados en re-ejecuciones) ────
  const existingWcIds = new Set<string>()
  {
    const { data: existingOrders } = await supabase
      .from('orders')
      .select('notes')
      .like('notes', 'WC #%')
    existingOrders?.forEach((o: { notes: string }) => {
      const match = o.notes?.match(/WC #(\d+)/)
      if (match) existingWcIds.add(match[1])
    })
    if (existingWcIds.size > 0) {
      console.log(`ℹ️  ${existingWcIds.size} órdenes WC ya importadas → se saltarán duplicados\n`)
    }
  }

  // ── Inserción real ────────────────────────────────────────────────────────
  console.log('⏳ Insertando órdenes en Supabase...')
  let inserted = 0, skippedDup = 0, errors = 0

  for (const order of orders) {
    // Saltar si ya fue importada
    if (existingWcIds.has(order.wc_order_id)) {
      skippedDup++
      continue
    }

    const custLower = order.customer_name.toLowerCase().trim()
    const isGuest = custLower === 'invitado' || custLower === 'guest' || custLower === ''
    const client_id = (!isGuest && clientByName.has(custLower)) ? clientByName.get(custLower)! : null
    // La DB requiere client_id OR guest_name (check constraint valid_guest_or_client)
    const guest_name = !client_id ? (isGuest ? 'Visitante' : order.customer_name) : null

    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert({
        status:              'completed',
        client_id:           client_id || null,
        guest_name:          guest_name || null,
        payment_method:      'cash',         // no hay info de método de pago en este formato CSV
        discount_code_id:    null,
        discount_percentage: 0,
        subtotal_gross:      order.total,
        subtotal_net:        order.total,
        shipping_cost:       0,
        total:               order.total,
        notes:               `WC #${order.wc_order_id}`,
        created_at:          order.order_date.toISOString(),
        completed_at:        order.order_date.toISOString(),
      })
      .select('id, order_number')
      .single()

    if (orderError || !orderData) {
      console.error(`  ❌ WC#${order.wc_order_id}: ${orderError?.message ?? 'Error desconocido'}`)
      errors++
      continue
    }

    // Line items
    const itemsPayload: Record<string, unknown>[] = []
    for (const item of order.line_items) {
      const product = resolveProduct(item.name, productByName)
      if (!product) continue

      itemsPayload.push({
        order_id:     orderData.id,
        product_id:   product.id,
        product_name: item.name,
        product_sku:  product.sku,
        unit_price:   product.price,
        quantity:     item.qty,
        line_total:   product.price * item.qty,
      })
    }

    if (itemsPayload.length > 0) {
      const { error: itemsError } = await supabase.from('order_items').insert(itemsPayload)
      if (itemsError) {
        console.error(`  ⚠️  ${orderData.order_number} items error: ${itemsError.message}`)
      }
    }

    const clientLabel = client_id ? `✓ ${order.customer_name}` : (guest_name === 'Visitante' ? 'visitante' : guest_name)
    console.log(`  ✓  ${orderData.order_number} ← WC#${order.wc_order_id}  ${itemsPayload.length}/${order.line_items.length} items  ${order.total.toLocaleString('es-CO')} COP  ${clientLabel}`)
    inserted++
  }

  console.log(`\n✅ Resumen final: ${inserted} órdenes insertadas, ${skippedDup} ya existían (saltadas), ${errors} errores`)
  if (unmatchedProducts.size > 0) {
    console.log(`⚠️  ${unmatchedProducts.size} productos no matcheados (sus items fueron omitidos, las órdenes sí se insertaron).`)
  }
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
