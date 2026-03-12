/**
 * import-clients.ts
 * Importa clientes desde un CSV exportado de WooCommerce/WordPress a Supabase.
 *
 * Uso:
 *   cd backend
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx ts-node --transpile-only src/_import-clients.ts /ruta/clientes.csv [--dry-run]
 *
 * Formatos CSV soportados:
 *   - WooCommerce Customers export: customer_id, first_name, last_name, email, phone
 *   - WordPress Users export:       ID, user_email, first_name, last_name, billing_phone
 *   - Formato genérico:             name, email, phone (columna name directa)
 */

// Copiar a backend/src/_import-clients.ts antes de ejecutar
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aisjzorranmtnitjzban.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const BATCH_SIZE = 50
const DRY_RUN = process.argv.includes('--dry-run')
const CSV_PATH = process.argv.find(a => !a.startsWith('--') && a.endsWith('.csv'))

if (!CSV_PATH) {
  console.error('❌ Debes pasar la ruta del CSV como argumento')
  console.error('   Ejemplo: npx ts-node src/_import-clients.ts /ruta/clientes.csv [--dry-run]')
  process.exit(1)
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ── Parsear CSV ───────────────────────────────────────────────────────────────
function parseCSV(filePath: string): Record<string, string>[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split(/\r?\n/).filter((l: string) => l.trim())
  if (lines.length < 2) { console.error('❌ CSV vacío o sin datos'); process.exit(1) }

  // Detectar delimitador
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

  const headers = parseLine(lines[0]).map((h: string) => h.toLowerCase().replace(/\s+/g, '_'))
  return lines.slice(1).map((line: string) => {
    const values = parseLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h: string, i: number) => { row[h] = values[i] ?? '' })
    return row
  })
}

// ── Resolver columnas con variantes de nombre ─────────────────────────────────
function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const val = row[k] ?? row[k.replace(/_/g, '')] ?? ''
    if (val.trim()) return val.trim()
  }
  return ''
}

function mapRowToClient(row: Record<string, string>): { name: string; email: string; phone: string; created_at?: string } | null {
  // Nombre: soportar "name" directa, o first+last, o billing_first+billing_last
  let name = pick(row, 'name', 'display_name')
  if (!name) {
    const first = pick(row, 'first_name', 'billing_first_name', 'user_firstname')
    const last  = pick(row, 'last_name',  'billing_last_name',  'user_lastname')
    name = [first, last].filter(Boolean).join(' ')
  }

  // Email
  const email = pick(row, 'email', 'user_email', 'billing_email', 'customer_email')

  // Teléfono
  const phone = pick(row, 'phone', 'billing_phone', 'user_phone', 'mobile')

  // Fecha de registro (Sign Up) → created_at
  const signUpRaw = pick(row, 'sign_up', 'signup', 'registered', 'date_registered', 'created_at', 'user_registered')
  let created_at: string | undefined
  if (signUpRaw) {
    const d = new Date(signUpRaw)
    if (!isNaN(d.getTime())) created_at = d.toISOString()
  }

  if (!email) return null  // email es requerido y único
  if (!name) name = email  // fallback: usar email como nombre

  return { name, email: email.toLowerCase(), phone, ...(created_at ? { created_at } : {}) }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🌿 Importador de clientes — Culto Orquídeas`)
  console.log(`   Archivo: ${path.basename(CSV_PATH!)}`)
  console.log(`   Modo: ${DRY_RUN ? '🔍 DRY-RUN (sin cambios)' : '⚡ REAL (inserción en Supabase)'}\n`)

  const rows = parseCSV(CSV_PATH!)
  console.log(`📋 Filas en CSV: ${rows.length}`)

  const clients: { name: string; email: string; phone: string; created_at?: string }[] = []
  const skipped: { row: number; reason: string }[] = []

  rows.forEach((row, idx) => {
    const client = mapRowToClient(row)
    if (!client) {
      skipped.push({ row: idx + 2, reason: 'Sin email' })
    } else {
      clients.push(client)
    }
  })

  console.log(`✅ Clientes válidos: ${clients.length}`)
  if (skipped.length > 0) {
    console.log(`⚠️  Filas omitidas: ${skipped.length}`)
    skipped.forEach(s => console.log(`   Fila ${s.row}: ${s.reason}`))
  }

  // Preview tabla
  console.log('\n┌─ Vista previa (primeros 10) ──────────────────────────────────────────')
  clients.slice(0, 10).forEach(c => {
    const date = c.created_at ? c.created_at.slice(0, 10) : 'sin fecha'
    console.log(`│ ${c.email.padEnd(35)} ${c.name.padEnd(25)} ${date}`)
  })
  if (clients.length > 10) console.log(`│ ... y ${clients.length - 10} más`)
  console.log('└────────────────────────────────────────────────────────────────────────\n')

  if (DRY_RUN) {
    console.log('🔍 DRY-RUN: no se realizaron cambios en Supabase.')
    console.log(`   Ejecuta sin --dry-run para insertar ${clients.length} clientes.`)
    return
  }

  // Insertar en lotes
  console.log('⏳ Insertando en Supabase...')
  let inserted = 0; let skippedDup = 0; let errors = 0

  for (let i = 0; i < clients.length; i += BATCH_SIZE) {
    const batch = clients.slice(i, i + BATCH_SIZE)
    const { data, error } = await supabase
      .from('clients')
      .upsert(batch, { onConflict: 'email', ignoreDuplicates: true })
      .select('id')

    if (error) {
      console.error(`  ❌ Lote ${Math.floor(i / BATCH_SIZE) + 1} error:`, error.message)
      errors += batch.length
    } else {
      const ins = (data?.length ?? 0)
      const dup = batch.length - ins
      inserted += ins; skippedDup += dup
      console.log(`  ✓  Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${ins} insertados, ${dup} ya existían (${Math.min(i + BATCH_SIZE, clients.length)}/${clients.length} total)`)
    }
  }

  console.log(`\n✅ Resumen: ${inserted} insertados, ${skippedDup} ya existían (duplicados), ${errors} errores`)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
