import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, ShoppingCart, Package, Users, AlertTriangle,
  Clock, ArrowRight, CheckCircle2,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import api from '@/lib/api'
import { formatCOP, formatDate } from '@/lib/utils'
import type { Order, Product } from '@/types'

interface Summary {
  orders: { total: number; last30Days: number; draftPending: number }
  revenue: { total: number; last30Days: number; salesGross: number; salesNet: number; shipping: number }
  inventory: { totalValue: number; totalUnits: number; lowStockCount: number; productsActive: number }
  clients: { total: number }
}
interface SalesByDay { date: string; total: number; orders: number }

function StatCard({
  label, value, sub, Icon, accent = false, onClick,
}: {
  label: string; value: string; sub?: string; Icon: React.ElementType; accent?: boolean; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`card p-5 ${onClick ? 'cursor-pointer hover:border-brand-lime/30 transition-colors' : ''}`}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs text-white/40 font-medium uppercase tracking-wider">{label}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0
          ${accent ? 'bg-amber-400/10' : 'bg-brand-lime/10'}`}>
          <Icon size={15} className={accent ? 'text-amber-400' : 'text-brand-lime'} />
        </div>
      </div>
      <p className={`text-2xl font-bold ${accent ? 'text-amber-400' : 'text-brand-white'}`}>{value}</p>
      {sub && <p className="text-xs text-white/40 mt-1">{sub}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [salesByDay, setSalesByDay] = useState<SalesByDay[]>([])
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAll() {
      setLoading(true)
      try {
        const [sumRes, salesRes, ordersRes, productsRes] = await Promise.all([
          api.get<{ data: Summary }>('/api/analytics/summary'),
          api.get<{ data: SalesByDay[] }>('/api/analytics/sales-by-day?days=14'),
          api.get<{ data: Order[] }>('/api/orders?limit=5&page=1'),
          api.get<{ data: Product[] }>('/api/products'),
        ])
        setSummary(sumRes.data.data)
        setSalesByDay(salesRes.data.data)
        setRecentOrders((ordersRes.data as unknown as { data: Order[]; meta: unknown }).data)
        setLowStockProducts(
          productsRes.data.data.filter((p: Product) => p.stock < 5).slice(0, 6)
        )
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  if (loading) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-brand-white">Dashboard</h1>
          <p className="text-white/40 text-sm mt-0.5">Cargando resumen...</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
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

  const chartData = salesByDay.map(d => ({ ...d, label: d.date.slice(5) }))
  const today = new Date().toISOString().split('T')[0]
  const todayData = salesByDay.find(d => d.date === today)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-brand-white">Dashboard</h1>
        <p className="text-white/40 text-sm mt-0.5">
          Hoy: {todayData?.orders ?? 0} ventas · {formatCOP(todayData?.total ?? 0)}
        </p>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Ingresos últimos 30d"
          value={formatCOP(summary.revenue.last30Days)}
          sub={`Total histórico: ${formatCOP(summary.revenue.total)}`}
          Icon={TrendingUp}
          onClick={() => navigate('/analisis')}
        />
        <StatCard
          label="Órdenes completadas"
          value={String(summary.orders.total)}
          sub={`${summary.orders.last30Days} en últimos 30 días`}
          Icon={ShoppingCart}
          onClick={() => navigate('/ordenes')}
        />
        <StatCard
          label="Valor del inventario"
          value={formatCOP(summary.inventory.totalValue)}
          sub={`${summary.inventory.productsActive} productos activos`}
          Icon={Package}
          onClick={() => navigate('/inventario')}
        />
        <StatCard
          label="Clientes registrados"
          value={String(summary.clients.total)}
          sub={`${summary.orders.draftPending} borradores pendientes`}
          Icon={Users}
          onClick={() => navigate('/clientes')}
        />
      </div>

      {/* Alertas */}
      <div className="flex flex-col sm:flex-row gap-4">
        {summary.orders.draftPending > 0 && (
          <button
            onClick={() => navigate('/ordenes')}
            className="flex-1 flex items-center justify-between bg-amber-400/10 border border-amber-400/20 rounded-xl px-4 py-3 hover:bg-amber-400/15 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Clock size={16} className="text-amber-400 shrink-0" />
              <span className="text-sm font-medium text-amber-300">
                {summary.orders.draftPending} orden(es) en borrador sin completar
              </span>
            </div>
            <ArrowRight size={15} className="text-amber-400 shrink-0" />
          </button>
        )}
        {summary.inventory.lowStockCount > 0 && (
          <button
            onClick={() => navigate('/inventario')}
            className="flex-1 flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 hover:bg-red-500/15 transition-colors"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle size={16} className="text-red-400 shrink-0" />
              <span className="text-sm font-medium text-red-300">
                {summary.inventory.lowStockCount} producto(s) con stock bajo (&lt;5 uds)
              </span>
            </div>
            <ArrowRight size={15} className="text-red-400 shrink-0" />
          </button>
        )}
        {summary.orders.draftPending === 0 && summary.inventory.lowStockCount === 0 && (
          <div className="flex-1 flex items-center gap-3 bg-brand-lime/10 border border-brand-lime/20 rounded-xl px-4 py-3">
            <CheckCircle2 size={16} className="text-brand-lime shrink-0" />
            <span className="text-sm font-medium text-brand-lime">Todo en orden — sin alertas pendientes</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Gráfico ventas 14 días */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-brand-white">Ventas — últimos 14 días</h2>
            <button onClick={() => navigate('/analisis')}
              className="text-xs text-brand-lime hover:underline flex items-center gap-1">
              Ver análisis completo <ArrowRight size={12} />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"   stopColor="#C7EA45" stopOpacity={0.25} />
                  <stop offset="95%"  stopColor="#C7EA45" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="label"
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                axisLine={false} tickLine={false}
                interval={1}
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                axisLine={false} tickLine={false}
                tickFormatter={v => v === 0 ? '0' : `$${(v / 1000).toFixed(0)}k`}
                width={52}
              />
              <Tooltip
                formatter={(v: number) => [formatCOP(v), 'Ventas']}
                contentStyle={{
                  background: '#0a1f16', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px', fontSize: 12,
                }}
                labelStyle={{ color: 'rgba(255,255,255,0.5)' }}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#C7EA45"
                strokeWidth={2}
                fill="url(#areaGrad)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Últimas órdenes */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-brand-white">Últimas órdenes</h2>
            <button onClick={() => navigate('/ordenes')}
              className="text-xs text-brand-lime hover:underline flex items-center gap-1">
              Ver todas <ArrowRight size={12} />
            </button>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-6">Sin órdenes aún</p>
          ) : (
            <div className="space-y-2">
              {recentOrders.slice(0, 5).map(order => (
                <div key={order.id} className="flex items-center justify-between py-1.5">
                  <div>
                    <p className="text-xs font-mono font-bold text-brand-lime">{order.order_number}</p>
                    <p className="text-xs text-white/40">{formatDate(order.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-brand-white">{formatCOP(order.total)}</p>
                    {order.status === 'draft' && (
                      <span className="text-xs text-amber-400">Borrador</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Productos con stock bajo */}
      {lowStockProducts.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-brand-white flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-400" />
              Plantas con stock bajo
            </h2>
            <button onClick={() => navigate('/inventario')}
              className="text-xs text-brand-lime hover:underline flex items-center gap-1">
              Gestionar inventario <ArrowRight size={12} />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {lowStockProducts.map(p => (
              <div key={p.id} className="bg-amber-400/5 border border-amber-400/20 rounded-xl p-3">
                <p className="font-mono text-xs text-brand-lime mb-1">{p.sku}</p>
                <p className="text-xs text-brand-white font-medium leading-tight line-clamp-2">{p.name}</p>
                <p className="text-lg font-bold text-amber-400 mt-1">{p.stock}</p>
                <p className="text-xs text-white/30">uds.</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
