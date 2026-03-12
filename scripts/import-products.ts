/**
 * Script de importación de productos desde WooCommerce CSV
 *
 * CSV esperado (separado por comas o tabs):
 *   sku,name,stock,price
 *   665,Aeragnis luteoalba var rhodostipta,1,90000
 *   ...
 *
 * Uso:
 *   npx ts-node scripts/import-products.ts <ruta-del-csv> [--dry-run]
 *
 * Opciones:
 *   --dry-run   Solo valida y muestra los registros, no inserta en DB
 *
 * Requiere:
 *   - El backend corriendo en http://localhost:3001  O
 *   - Variables de entorno SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createClient } = require('@supabase/supabase-js')

// ─── Configuración ───────────────────────────────────────────────────────────
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001'
const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

// Si hay credenciales de Supabase, inserta directo. Si no, usa la API del backend.
const USE_SUPABASE_DIRECT = !!(SUPABASE_URL && SUPABASE_KEY)

const isDryRun = process.argv.includes('--dry-run')
const csvPath = process.argv.find(a => !a.startsWith('--') && a.endsWith('.csv'))

if (!csvPath) {
  console.error('Uso: npx ts-node scripts/import-products.ts <ruta.csv> [--dry-run]')
  process.exit(1)
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface ProductRow {
  sku: string
  name: string
  stock: number
  price: number
}

// ─── Parsear CSV ─────────────────────────────────────────────────────────────
function parseCsv(filePath: string): ProductRow[] {
  const content = fs.readFileSync(path.resolve(filePath), 'utf-8')
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)

  // Detectar delimitador (coma o tab)
  const firstLine = lines[0]
  const delimiter = firstLine.includes('\t') ? '\t' : ','

  // Detectar si hay encabezado
  const hasHeader = /^(sku|name|stock|price)/i.test(firstLine)
  const dataLines = hasHeader ? lines.slice(1) : lines

  const rows: ProductRow[] = []
  const errors: string[] = []

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i]
    if (!line) continue

    const parts = line.split(delimiter).map(p => p.trim().replace(/^"|"$/g, ''))
    if (parts.length < 4) {
      errors.push(`Línea ${i + 1}: columnas insuficientes (${parts.length}) → "${line}"`)
      continue
    }

    const [rawSku, rawName, rawStock, rawPrice] = parts

    // Validar y zero-padear SKU a 4 dígitos
    const skuNum = rawSku.replace(/\D/g, '')
    if (!skuNum || skuNum.length > 4) {
      errors.push(`Línea ${i + 1}: SKU inválido "${rawSku}"`)
      continue
    }
    const sku = skuNum.padStart(4, '0')

    let stock = parseInt(rawStock, 10)
    const price = parseFloat(rawPrice.replace(/[^0-9.]/g, ''))

    if (!rawName.trim()) {
      errors.push(`Línea ${i + 1}: nombre vacío`)
      continue
    }
    if (isNaN(stock) || stock < 0) {
      errors.push(`Línea ${i + 1}: stock "${rawStock}" → se usará 0`)
      stock = 0
    }
    if (isNaN(price) || price < 0) {
      errors.push(`Línea ${i + 1}: precio inválido "${rawPrice}"`)
      continue
    }

    rows.push({ sku, name: rawName.trim(), stock, price })
  }

  if (errors.length > 0) {
    console.warn('\n⚠️  Advertencias en el CSV:')
    errors.forEach(e => console.warn('  •', e))
  }

  return rows
}

// ─── Insertar vía Supabase directo (en lotes) ────────────────────────────────
async function insertViaSupabase(rows: ProductRow[]): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  const BATCH = 50
  let ok = 0
  let skipped = 0
  let failed = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const payload = batch.map(r => ({ ...r, is_active: true }))

    const { error, data } = await supabase
      .from('products')
      .upsert(payload, { onConflict: 'sku', ignoreDuplicates: true })
      .select('sku')

    if (error) {
      // Si falla el lote completo, intentar fila a fila para identificar el problema
      console.warn(`  ⚠  Lote ${i / BATCH + 1} falló (${error.message}), reintentando fila a fila...`)
      for (const row of batch) {
        const { error: e2 } = await supabase
          .from('products')
          .insert({ ...row, is_active: true })
        if (e2) {
          if (e2.code === '23505') { skipped++ }
          else { console.error(`  ✗  SKU ${row.sku}: ${e2.message}`); failed++ }
        } else { ok++ }
      }
    } else {
      const inserted = data?.length ?? batch.length
      ok += inserted
      skipped += batch.length - inserted
      process.stdout.write(`  ✓  Lote ${i / BATCH + 1}: ${inserted} insertados (${i + batch.length}/${rows.length} total)\n`)
    }
  }

  console.log(`\nResumen: ${ok} insertados, ${skipped} omitidos (duplicados), ${failed} errores`)
}

// ─── Insertar vía API backend ─────────────────────────────────────────────────
async function insertViaApi(rows: ProductRow[]): Promise<void> {
  console.warn('\n⚠️  No hay credenciales de Supabase. Inserta vía API del backend.')
  console.warn(`   Asegúrate de que el backend esté corriendo en ${BACKEND_URL}`)
  console.warn('   y exporta un JWT válido en la variable BACKEND_JWT.\n')

  const jwt = process.env.BACKEND_JWT
  if (!jwt) {
    console.error('❌ Falta BACKEND_JWT. Exporta el token de sesión del administrador.')
    console.error('   Puedes obtenerlo desde DevTools → Application → localStorage → sb-...-auth-token → access_token')
    process.exit(1)
  }

  let ok = 0
  let skipped = 0
  let failed = 0

  for (const row of rows) {
    try {
      const body = JSON.stringify({ ...row, is_active: true })
      const url = new URL(`${BACKEND_URL}/api/products`)

      const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const lib = url.protocol === 'https:' ? https : http
        const req = lib.request(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwt}`,
            'Content-Length': Buffer.byteLength(body),
          },
        }, (resp) => {
          let data = ''
          resp.on('data', d => data += d)
          resp.on('end', () => resolve({ status: resp.statusCode ?? 0, body: data }))
        })
        req.on('error', reject)
        req.write(body)
        req.end()
      })

      if (res.status === 201 || res.status === 200) {
        console.log(`  ✓  ${row.sku} — ${row.name}`)
        ok++
      } else if (res.status === 409 || res.body.includes('unique')) {
        console.warn(`  ⚠  SKU ${row.sku} ya existe — omitido`)
        skipped++
      } else {
        const parsed = JSON.parse(res.body).error ?? res.body
        console.error(`  ✗  SKU ${row.sku}: ${parsed}`)
        failed++
      }
    } catch (err) {
      console.error(`  ✗  SKU ${row.sku}: ${(err as Error).message}`)
      failed++
    }
  }

  console.log(`\nResumen: ${ok} insertados, ${skipped} omitidos (duplicados), ${failed} errores`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n📂 Leyendo CSV: ${csvPath}`)
  const rows = parseCsv(csvPath!)

  if (rows.length === 0) {
    console.error('❌ No se encontraron filas válidas en el CSV.')
    process.exit(1)
  }

  console.log(`\n✅ ${rows.length} producto(s) detectados:`)
  console.log(`${'SKU'.padEnd(6)} ${'Precio'.padStart(10)} ${'Stock'.padStart(5)}  Nombre`)
  console.log('─'.repeat(70))
  for (const r of rows) {
    console.log(`${r.sku.padEnd(6)} ${String(r.price).padStart(10)} ${String(r.stock).padStart(5)}  ${r.name}`)
  }

  if (isDryRun) {
    console.log('\n🔍 Modo --dry-run: no se insertó nada.')
    return
  }

  console.log('\n⏳ Insertando en Supabase...\n')

  if (USE_SUPABASE_DIRECT) {
    await insertViaSupabase(rows)
  } else {
    await insertViaApi(rows)
  }
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message)
  process.exit(1)
})
