import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, Legend,
} from 'recharts'
import { TrendingUp, ShoppingCart, Package, Users, Banknote, Clock, Tag, Calendar } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import type { DateRange } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import api from '@/lib/api'
import { formatCOP } from '@/lib/utils'

// ─── tipos ────────────────────────────────────────────────────────────────────
interface Summary {
  orders:    { total: number; last30Days: number; draftPending: number }
  revenue:   { total: number; last30Days: number; salesGross: number; salesNet: number; shipping: number }
  inventory: { totalValue: number; totalUnits: number; lowStockCount: number; productsActive: number }
  clients:   { total: number }
}
interface SalesByDay  { date: string; total: number; orders: number }
interface TopProduct  { sku: string; name: string; units: number; revenue: number }
interface PayBreakdown { method: string; count: number; total: number }
interface DiscountData {
  total_amount: number
  orders_with_discount: number
  by_code: Array<{ code: string; uses: number; discount_amount: number }>
}
interface MergedDay { date: string; label: string; current: number; comp: number }
type CompareWith = 'year' | 'period' | null

// ─── constantes ───────────────────────────────────────────────────────────────
const LIME   = '#C7EA45'
const PURPLE = '#a78bfa'
const BLUE   = '#60a5fa'
const AMBER  = '#fbbf24'
const PIE_COLORS = [LIME, BLUE, PURPLE, AMBER]

// ─── helpers ──────────────────────────────────────────────────────────────────
function calcCompRange(from: Date, to: Date, type: 'year' | 'period'): { from: Date; to: Date } {
  if (type === 'year') {
    return {
      from: new Date(from.getFullYear() - 1, from.getMonth(), from.getDate(), 0, 0, 0, 0),
      to:   new Date(to.getFullYear()   - 1, to.getMonth(),   to.getDate(),  23, 59, 59, 999),
    }
  }
  // Período anterior: misma duración, inmediatamente antes
  const ms     = to.getTime() - from.getTime()
  const compTo = new Date(from.getTime() - 1); compTo.setHours(23, 59, 59, 999)
  const compFr = new Date(compTo.getTime() - ms); compFr.setHours(0, 0, 0, 0)
  return { from: compFr, to: compTo }
}

function getDelta(
  current: number,
  comp: number | undefined,
  hasComp: boolean
): { pct: number; dir: 'up' | 'down' | 'same' } | undefined {
  if (!hasComp || comp === undefined || comp === null || comp === 0) return undefined
  const pct = Math.abs(((current - comp) / comp) * 100)
  const dir  = current > comp ? 'up' : current < comp ? 'down' : 'same'
  return { pct, dir }
}

function fmtDate(d: Date) { return d.toISOString().split('T')[0] }

// ─── tooltip para LineChart (soporta dos líneas) ───────────────────────────
function LineTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { value: number; name: string; dataKey: string; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#0a1f16] border border-white/20 rounded-xl px-3 py-2 text-xs shadow-2xl min-w-[160px]">
      <p className="text-white/50 mb-2 font-medium">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4 mb-1 last:mb-0">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-5 h-0 border-t-2" style={{ borderColor: p.color, borderStyle: p.dataKey === 'comp' ? 'dashed' : 'solid' }} />
            <span className="text-white/60">{p.dataKey === 'current' ? 'Actual' : 'Comp.'}</span>
          </div>
          <span className="font-semibold" style={{ color: p.color }}>{formatCOP(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── tooltip genérico ─────────────────────────────────────────────────────────
function CopTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number; name: string }[]; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#0a1f16] border border-white/20 rounded-xl px-3 py-2 text-xs shadow-2xl">
      <p className="text-white/50 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-semibold text-brand-lime">
          {p.name === 'orders' ? `${p.value} ventas` : formatCOP(p.value)}
        </p>
      ))}
    </div>
  )
}

// ─── KPI Card (con delta opcional) ───────────────────────────────────────────
function KPICard({
  label, value, sub, Icon, color = 'text-brand-lime', delta,
}: {
  label: string; value: string; sub?: string; Icon: React.ElementType; color?: string
  delta?: { pct: number; dir: 'up' | 'down' | 'same' }
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs text-white/40 font-medium uppercase tracking-wider">{label}</p>
        <div className="w-8 h-8 rounded-lg bg-brand-lime/10 flex items-center justify-center shrink-0">
          <Icon size={16} className="text-brand-lime" />
        </div>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {delta && delta.dir !== 'same' && (
        <p className={`text-xs mt-0.5 font-semibold ${delta.dir === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
          {delta.dir === 'up' ? '+' : '-'}{delta.pct.toFixed(1)}%{delta.dir === 'up' ? ' ↑' : ' ↓'} vs comp.
        </p>
      )}
      {sub && <p className="text-xs text-white/40 mt-1">{sub}</p>}
    </div>
  )
}

// ─── componente principal ─────────────────────────────────────────────────────
export default function AnalisisPage() {
  // ── estado fechas ──────────────────────────────────────────────────────────
  const [dateFrom, setDateFrom] = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0, 0, 0, 0); return d
  })
  const [dateTo, setDateTo] = useState<Date>(() => {
    const d = new Date(); d.setHours(23, 59, 59, 999); return d
  })
  const [activePreset, setActivePreset] = useState<number | null>(30)
  const [calOpen,      setCalOpen]      = useState(false)
  const [pickerRange,  setPickerRange]  = useState<DateRange | undefined>({
    from: dateFrom, to: dateTo,
  })
  const calRef = useRef<HTMLDivElement>(null)

  // ── cerrar calendario al click fuera ──────────────────────────────────────
  useEffect(() => {
    if (!calOpen) return
    function handleDown(e: MouseEvent) {
      if (calRef.current && !calRef.current.contains(e.target as Node)) {
        setCalOpen(false)
      }
    }
    document.addEventListener('mousedown', handleDown)
    return () => document.removeEventListener('mousedown', handleDown)
  }, [calOpen])

  // ── estado comparativo ─────────────────────────────────────────────────────
  const [compareWith, setCompareWith] = useState<CompareWith>('year')

  // ── datos principales ──────────────────────────────────────────────────────
  const [summary,      setSummary]      = useState<Summary | null>(null)
  const [salesByDay,   setSalesByDay]   = useState<SalesByDay[]>([])
  const [topProducts,  setTopProducts]  = useState<TopProduct[]>([])
  const [payBreakdown, setPayBreakdown] = useState<PayBreakdown[]>([])
  const [discounts,    setDiscounts]    = useState<DiscountData | null>(null)

  // ── datos comparativo ──────────────────────────────────────────────────────
  const [compSummary,   setCompSummary]   = useState<Summary | null>(null)
  const [compSales,     setCompSales]     = useState<SalesByDay[]>([])
  const [compDiscounts, setCompDiscounts] = useState<DiscountData | null>(null)

  const [loading, setLoading] = useState(true)

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async (from: Date, to: Date, cmp: CompareWith) => {
    setLoading(true)
    const params    = `from=${fmtDate(from)}&to=${fmtDate(to)}`
    const compRange = cmp ? calcCompRange(from, to, cmp) : null
    const cmpP      = compRange ? `from=${fmtDate(compRange.from)}&to=${fmtDate(compRange.to)}` : null

    try {
      const mainPromise = Promise.all([
        api.get<{ data: Summary }>(`/api/analytics/summary?${params}`),
        api.get<{ data: SalesByDay[] }>(`/api/analytics/sales-by-day?${params}`),
        api.get<{ data: TopProduct[] }>('/api/analytics/top-products'),
        api.get<{ data: PayBreakdown[] }>('/api/analytics/payment-breakdown'),
        api.get<{ data: DiscountData }>(`/api/analytics/discounts?${params}`),
      ])
      const compPromise = cmpP ? Promise.all([
        api.get<{ data: Summary }>(`/api/analytics/summary?${cmpP}`),
        api.get<{ data: SalesByDay[] }>(`/api/analytics/sales-by-day?${cmpP}`),
        api.get<{ data: DiscountData }>(`/api/analytics/discounts?${cmpP}`),
      ]) : Promise.resolve(null)

      const [[sumRes, salesRes, topRes, payRes, discRes], compResults] =
        await Promise.all([mainPromise, compPromise])

      setSummary(sumRes.data.data)
      setSalesByDay(salesRes.data.data)
      setTopProducts(topRes.data.data)
      setPayBreakdown(payRes.data.data)
      setDiscounts(discRes.data.data)

      if (compResults) {
        const [cSumRes, cSalesRes, cDiscRes] = compResults
        setCompSummary(cSumRes.data.data)
        setCompSales(cSalesRes.data.data)
        setCompDiscounts(cDiscRes.data.data)
      } else {
        setCompSummary(null)
        setCompSales([])
        setCompDiscounts(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll(dateFrom, dateTo, compareWith) }, [dateFrom, dateTo, compareWith, fetchAll])

  // ── handlers ───────────────────────────────────────────────────────────────
  function handlePreset(days: number) {
    const to   = new Date(); to.setHours(23, 59, 59, 999)
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000); from.setHours(0, 0, 0, 0)
    setDateFrom(from); setDateTo(to); setActivePreset(days)
    setPickerRange({ from, to }); setCalOpen(false)
  }

  function handleRangeSelect(range: DateRange | undefined) {
    // Solo actualiza el estado visual del picker.
    // Los datos solo se recargan al presionar "Aplicar" (applyPickerRange).
    setPickerRange(range)
  }

  function applyPickerRange() {
    if (!pickerRange?.from || !pickerRange?.to) return
    const from = new Date(pickerRange.from); from.setHours(0, 0, 0, 0)
    const to   = new Date(pickerRange.to);   to.setHours(23, 59, 59, 999)
    setDateFrom(from); setDateTo(to); setActivePreset(null); setCalOpen(false)
  }

  // ── datos derivados ────────────────────────────────────────────────────────
  const mergedChart: MergedDay[] = useMemo(() =>
    salesByDay.map((d, i) => ({
      date:    d.date,
      label:   d.date.slice(5),
      current: d.total,
      comp:    compSales[i]?.total ?? 0,
    }))
  , [salesByDay, compSales])

  const hasCmp = !!compareWith && !!compSummary

  const periodLabel = activePreset !== null
    ? `Últimos ${activePreset} días`
    : `${format(dateFrom, 'd MMM', { locale: es })} – ${format(dateTo, 'd MMM yyyy', { locale: es })}`

  const activeCompRange = compareWith ? calcCompRange(dateFrom, dateTo, compareWith) : null
  const compLabel = activeCompRange
    ? `${format(activeCompRange.from, 'd MMM', { locale: es })} – ${format(activeCompRange.to, 'd MMM yyyy', { locale: es })}`
    : ''

  // ── loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-brand-white">Análisis</h1>
          <p className="text-white/40 text-sm mt-0.5">Cargando datos...</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-3 bg-white/10 rounded w-2/3 mb-4" />
              <div className="h-8 bg-white/10 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!summary) return null

  const revenueBreakdown = [
    { name: 'Descuento',    value: summary.revenue.salesGross - summary.revenue.salesNet },
    { name: 'Ventas netas', value: summary.revenue.salesNet },
    { name: 'Envíos',       value: summary.revenue.shipping },
  ].filter(d => d.value > 0)

  return (
    <div className="space-y-6">

      {/* ── Header: título + controles ──────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Fila 1: título + presets + calendario */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-brand-white">Análisis</h1>
            <p className="text-white/40 text-sm mt-0.5">Vista general del negocio</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Presets */}
            <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1">
              {[7, 30, 60, 90].map(d => (
                <button
                  key={d}
                  onClick={() => handlePreset(d)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                    ${activePreset === d ? 'bg-brand-lime text-brand-black' : 'text-white/50 hover:text-white'}`}
                >
                  {d}d
                </button>
              ))}
            </div>

            {/* Calendar picker */}
            <div className="relative" ref={calRef}>
              <button
                onClick={() => setCalOpen(o => !o)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors
                  ${activePreset === null
                    ? 'bg-brand-lime text-brand-black border-brand-lime'
                    : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}
              >
                <Calendar size={14} />
                {activePreset === null
                  ? `${format(dateFrom, 'd MMM', { locale: es })} – ${format(dateTo, 'd MMM yy', { locale: es })}`
                  : 'Personalizar'}
              </button>

              {calOpen && (
                <div className="absolute right-0 top-full mt-2 z-40 shadow-2xl
                                bg-[#0a1f16] border border-white/10 rounded-xl overflow-hidden">
                  <DayPicker
                    mode="range"
                    selected={pickerRange}
                    onSelect={handleRangeSelect}
                    locale={es}
                    numberOfMonths={2}
                    toDate={new Date()}
                    className="rdp-custom"
                  />
                  {/* Footer: hint + botón Aplicar */}
                  <div className="px-4 pb-3 pt-2 flex items-center justify-between gap-4 border-t border-white/10">
                    <span className="text-xs text-white/40">
                      {!pickerRange?.from
                        ? 'Selecciona fecha inicio'
                        : !pickerRange?.to
                        ? 'Selecciona la fecha final'
                        : `${format(pickerRange.from, 'd MMM', { locale: es })} → ${format(pickerRange.to, 'd MMM yyyy', { locale: es })}`}
                    </span>
                    <button
                      onClick={applyPickerRange}
                      disabled={!pickerRange?.from || !pickerRange?.to}
                      className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-brand-lime
                                 text-brand-black disabled:opacity-30 disabled:cursor-not-allowed
                                 hover:opacity-90 transition-opacity shrink-0"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Fila 2: comparativo */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-white/40">Comparar con:</span>
          {([
            { key: 'year'   as CompareWith, label: 'Año anterior' },
            { key: 'period' as CompareWith, label: 'Período anterior' },
          ] as { key: CompareWith; label: string }[]).map(({ key, label }) => (
            <button
              key={key!}
              onClick={() => setCompareWith(prev => prev === key ? null : key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
                ${compareWith === key
                  ? 'bg-white/15 border-white/30 text-white'
                  : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'}`}
            >
              {label}
            </button>
          ))}
          {hasCmp && (
            <span className="text-xs text-white/30">vs {compLabel}</span>
          )}
        </div>
      </div>

      {/* ── KPIs principales (fila 1) ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Ingresos totales"
          value={formatCOP(summary.revenue.total)}
          sub={periodLabel}
          Icon={TrendingUp}
          delta={getDelta(summary.revenue.total, compSummary?.revenue.total, hasCmp)}
        />
        <KPICard
          label="Órdenes completadas"
          value={String(summary.orders.total)}
          sub={`${summary.orders.draftPending} borradores pendientes`}
          Icon={ShoppingCart}
          delta={getDelta(summary.orders.total, compSummary?.orders.total, hasCmp)}
        />
        <KPICard
          label="Valor inventario"
          value={formatCOP(summary.inventory.totalValue)}
          sub={`${summary.inventory.totalUnits} uds · ${summary.inventory.productsActive} productos`}
          Icon={Package}
        />
        <KPICard
          label="Clientes"
          value={String(summary.clients.total)}
          sub="Total registrados"
          Icon={Users}
        />
      </div>

      {/* ── KPIs secundarios (fila 2) ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Ventas brutas"
          value={formatCOP(summary.revenue.salesGross)}
          sub={`Antes de descuentos · ${periodLabel}`}
          Icon={Banknote}
          color="text-brand-white"
          delta={getDelta(summary.revenue.salesGross, compSummary?.revenue.salesGross, hasCmp)}
        />
        <KPICard
          label="Ventas netas"
          value={formatCOP(summary.revenue.salesNet)}
          sub={`Después de descuentos · ${periodLabel}`}
          Icon={Banknote}
          color="text-brand-lime"
          delta={getDelta(summary.revenue.salesNet, compSummary?.revenue.salesNet, hasCmp)}
        />
        <KPICard
          label="Descuentos aplicados"
          value={formatCOP(discounts?.total_amount ?? 0)}
          sub={`${discounts?.orders_with_discount ?? 0} órdenes con descuento · ${periodLabel}`}
          Icon={Tag}
          color="text-amber-400"
          delta={getDelta(discounts?.total_amount ?? 0, compDiscounts?.total_amount, hasCmp)}
        />
        <KPICard
          label="Productos bajo stock"
          value={String(summary.inventory.lowStockCount)}
          sub="Menos de 5 unidades"
          Icon={Clock}
          color={summary.inventory.lowStockCount > 0 ? 'text-amber-400' : 'text-brand-lime'}
        />
      </div>

      {/* ── Gráfico de ventas por día ────────────────────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
          <h2 className="text-base font-semibold text-brand-white">
            Ventas por día — {periodLabel}
          </h2>
          {hasCmp && (
            <div className="flex items-center gap-4 text-xs text-white/50">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-6 border-t-2 border-brand-lime" />
                Actual
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-6 border-t-2 border-dashed border-white/40" />
                {compareWith === 'year' ? 'Año anterior' : 'Período anterior'}
              </span>
            </div>
          )}
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={mergedChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="label"
              tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval={Math.max(0, Math.floor(mergedChart.length / 8) - 1)}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => formatCOP(v).replace('$ ', '$').slice(0, 8)}
              width={80}
            />
            <Tooltip content={<LineTooltip />} />
            {hasCmp && <Legend
              formatter={(value) => <span className="text-xs text-white/50">{value}</span>}
              wrapperStyle={{ paddingTop: 8 }}
            />}
            <Line
              type="monotone"
              dataKey="current"
              stroke={LIME}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: LIME }}
              name="Período actual"
            />
            {hasCmp && (
              <Line
                type="monotone"
                dataKey="comp"
                stroke="rgba(255,255,255,0.4)"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="4 3"
                name={compareWith === 'year' ? 'Año anterior' : 'Período anterior'}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Top productos + Métodos de pago ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top 10 productos */}
        <div className="card p-5">
          <h2 className="text-base font-semibold text-brand-white mb-4">
            Top 10 — productos más vendidos
          </h2>
          {topProducts.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-8">Sin datos de ventas aún</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={topProducts.slice(0, 8)}
                layout="vertical"
                margin={{ left: 0, right: 20 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={90}
                  tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                  tickFormatter={v => v.length > 12 ? v.slice(0, 11) + '…' : v}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: number, name: string) =>
                    name === 'units' ? [`${v} uds`, 'Unidades'] : [formatCOP(v), 'Ingresos']
                  }
                  contentStyle={{
                    background: '#0a1f16', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px', fontSize: 12,
                  }}
                  labelStyle={{ color: 'rgba(255,255,255,0.5)' }}
                />
                <Bar dataKey="units" fill={LIME} radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Métodos de pago */}
        <div className="card p-5">
          <h2 className="text-base font-semibold text-brand-white mb-4">
            Distribución por método de pago
          </h2>
          {payBreakdown.every(p => p.count === 0) ? (
            <p className="text-white/30 text-sm text-center py-8">Sin datos de ventas aún</p>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-full sm:w-1/2">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={payBreakdown.filter(p => p.count > 0)}
                      dataKey="count"
                      nameKey="method"
                      cx="50%"
                      cy="50%"
                      outerRadius={75}
                      innerRadius={45}
                      paddingAngle={3}
                    >
                      {payBreakdown.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number, name: string) => [`${v} órdenes`, name]}
                      contentStyle={{
                        background: '#0a1f16', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px', fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3 w-full sm:flex-1">
                {payBreakdown.map((p, i) => (
                  <div key={p.method}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i] }} />
                        <span className="text-sm text-white/70">{p.method}</span>
                      </div>
                      <span className="text-sm font-semibold text-brand-white">{p.count}</span>
                    </div>
                    <p className="text-xs text-white/40 pl-4">{formatCOP(p.total)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Desglose de ingresos */}
        {revenueBreakdown.length > 0 && (
          <div className="card p-5 lg:col-span-2">
            <h2 className="text-base font-semibold text-brand-white mb-4">
              Desglose de ingresos totales
            </h2>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={revenueBreakdown}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => `$${(v / 1000000).toFixed(1)}M`}
                />
                <Tooltip content={<CopTooltip />} />
                <Bar dataKey="value" fill={LIME} radius={[4, 4, 0, 0]}>
                  {revenueBreakdown.map((_, i) => (
                    <Cell key={i} fill={[LIME, BLUE, AMBER][i % 3]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Sección de Descuentos ────────────────────────────────────────────── */}
      {discounts && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              label="Ingresos por envíos"
              value={formatCOP(summary.revenue.shipping)}
              sub="No incluido en ingresos totales"
              Icon={TrendingUp}
              color="text-blue-400"
              delta={getDelta(summary.revenue.shipping, compSummary?.revenue.shipping, hasCmp)}
            />
          </div>

          <div className="card p-5">
            <h2 className="text-base font-semibold text-brand-white mb-4">
              Descuentos por código — {periodLabel}
            </h2>
            {discounts.by_code.length === 0 ? (
              <p className="text-white/30 text-sm text-center py-6">
                No se usaron códigos de descuento en este período
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left text-xs text-white/40 font-medium uppercase tracking-wider pb-3">Código</th>
                      <th className="text-center text-xs text-white/40 font-medium uppercase tracking-wider pb-3">Usos</th>
                      <th className="text-right text-xs text-white/40 font-medium uppercase tracking-wider pb-3">Descuento total</th>
                      {hasCmp && (
                        <>
                          <th className="text-right text-xs text-white/40 font-medium uppercase tracking-wider pb-3 pl-4">Comp.</th>
                          <th className="text-right text-xs text-white/40 font-medium uppercase tracking-wider pb-3 pl-2">Δ%</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {discounts.by_code.map(entry => {
                      const compEntry = compDiscounts?.by_code.find(c => c.code === entry.code)
                      const delta = getDelta(entry.discount_amount, compEntry?.discount_amount, hasCmp)
                      return (
                        <tr key={entry.code} className="hover:bg-white/5 transition-colors">
                          <td className="py-3 font-mono font-bold text-brand-lime">{entry.code}</td>
                          <td className="py-3 text-center text-white/70">{entry.uses}</td>
                          <td className="py-3 text-right font-semibold text-brand-white">{formatCOP(entry.discount_amount)}</td>
                          {hasCmp && (
                            <>
                              <td className="py-3 text-right text-white/40 pl-4">
                                {compEntry ? formatCOP(compEntry.discount_amount) : '—'}
                              </td>
                              <td className={`py-3 text-right text-xs font-semibold pl-2
                                ${delta?.dir === 'up' ? 'text-emerald-400' : delta?.dir === 'down' ? 'text-red-400' : 'text-white/30'}`}>
                                {delta && delta.dir !== 'same'
                                  ? `${delta.dir === 'up' ? '+' : '-'}${delta.pct.toFixed(1)}%`
                                  : '—'}
                              </td>
                            </>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
