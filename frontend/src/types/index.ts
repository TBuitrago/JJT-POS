// ============================================================
// Tipos base del sistema Culto Orquídeas POS
// ============================================================

export type UserRole = 'admin' | 'vendedor'

export interface Product {
  id: string
  sku: string          // 4 dígitos numéricos únicos (ej. '0001')
  name: string
  price: number        // Precio en COP
  stock: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  name: string
  email: string        // Único en el sistema
  phone: string
  created_by?: string | null
  created_at: string
}

export interface DiscountCode {
  id: string
  code: string         // Alfanumérico único (ej. 'ORQUIDEA20')
  percentage: number   // ej. 15.00 = 15%
  is_active: boolean
  max_uses: number | null         // NULL = ilimitado (códigos normales), 1 = recompensa
  uses_count: number              // Veces que ha sido utilizado
  assigned_client_id: string | null  // Cliente asignado (null = cualquiera)
  expires_at: string | null       // Fecha de expiración ISO 8601
  reward_tier: number | null      // Umbral de gasto que generó la recompensa
  redeemed_in_order_id: string | null  // Orden donde fue canjeado
  created_at: string
  // Relaciones opcionales
  assigned_client?: Client
}

export type OrderStatus = 'draft' | 'completed'
export type PaymentMethod = 'cash' | 'transfer'

export interface Order {
  id: string
  order_number: string         // Formato CO-XXXX
  status: OrderStatus
  client_id: string | null     // NULL si es invitado
  guest_name: string | null    // Nombre del invitado
  payment_method: PaymentMethod
  discount_code_id: string | null
  discount_percentage: number  // Snapshot del % de descuento
  subtotal_gross: number       // Antes de descuento
  subtotal_net: number         // Después de descuento
  shipping_cost: number        // No recibe descuento
  total: number                // subtotal_net + shipping_cost
  notes: string | null
  created_by?: string | null
  created_at: string
  completed_at: string | null
  // Relaciones opcionales (joins)
  client?: Client
  discount_code?: DiscountCode
  items?: OrderItem[]
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  product_name: string        // Snapshot del nombre al momento de venta
  product_sku: string         // Snapshot del SKU
  unit_price: number          // Precio efectivo cobrado (puede ser ajustado por el admin)
  original_price: number | null  // Precio de inventario original (null si no se ajustó)
  price_note: string | null      // Motivo del ajuste de precio (opcional)
  quantity: number
  line_total: number          // unit_price * quantity
}

export type InventoryAction = 'add' | 'remove' | 'sale' | 'create' | 'delete'

export interface InventoryLog {
  id: string
  product_id: string
  product_name: string      // Snapshot
  action: InventoryAction
  quantity_change: number   // Positivo = ingreso, negativo = salida
  quantity_before: number
  quantity_after: number
  performed_by: string      // Nombre del administrador
  order_id: string | null   // Si el log viene de una venta
  notes: string | null
  created_at: string
  // Relaciones opcionales
  product?: Product
}

// ============================================================
// Tipos de UI / estado
// ============================================================

// CartItem es un Product aplanado con cantidad y precio opcional ajustado por el admin.
// customPrice: si está definido, reemplaza item.price solo en esta orden (inventario sin cambios).
// priceNote:   motivo del ajuste (opcional, solo visible si customPrice está definido).
export type CartItem = Product & {
  quantity: number
  customPrice?: number   // Precio ajustado por el admin para esta orden (sin tocar inventario)
  priceNote?: string     // Motivo del ajuste de precio (opcional)
}

export interface ApiResponse<T> {
  data: T
  error?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}
