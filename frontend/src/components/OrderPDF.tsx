import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import type { Order, OrderItem } from '@/types'

// ─── Paleta de colores (espeja el email) ─────────────────────────────────────
const C = {
  bg:     '#00261B',
  bgDark: '#071a0f',
  bgMid:  '#0a1f16',
  border: '#1a3d2e',
  lime:   '#C7EA45',
  white:  '#ffffff',
  gray1:  '#d1d5db',
  gray2:  '#9ca3af',
  gray3:  '#6b7280',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatCOP(n: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// ─── Estilos ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Página
  page: {
    backgroundColor: C.bg,
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 36,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: C.gray1,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 2,
    borderBottomColor: C.lime,
    borderBottomStyle: 'solid',
    paddingBottom: 16,
    marginBottom: 20,
  },
  brandName: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: C.white,
  },
  brandSub: {
    fontSize: 9,
    color: C.gray2,
    marginTop: 3,
  },
  orderNumBox: {
    backgroundColor: C.bgMid,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'flex-end',
  },
  orderNumLabel: {
    fontSize: 8,
    color: C.gray2,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  orderNumValue: {
    fontSize: 22,
    fontFamily: 'Courier-Bold',
    color: C.lime,
  },

  // Info cards (fila de metadatos)
  infoRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  infoBox: {
    flex: 1,
    backgroundColor: C.bgMid,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  infoBoxLast: {
    flex: 1,
    backgroundColor: C.bgMid,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  infoLabel: {
    fontSize: 8,
    color: C.gray2,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  infoValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: C.white,
  },
  infoValueLime: {
    fontSize: 10,
    fontFamily: 'Courier-Bold',
    color: C.lime,
  },
  infoSub: {
    fontSize: 9,
    color: C.gray2,
    marginTop: 2,
  },

  // Tabla de productos
  tableWrap: {
    backgroundColor: C.bgMid,
    borderRadius: 6,
    marginBottom: 14,
    overflow: 'hidden',
  },
  thead: {
    flexDirection: 'row',
    backgroundColor: C.bgDark,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  th: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: C.gray2,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  trow: {
    flexDirection: 'row',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
    borderTopStyle: 'solid',
  },
  trowFirst: {
    flexDirection: 'row',
    paddingVertical: 9,
    paddingHorizontal: 12,
  },

  // Columnas tabla
  colProduct: { flex: 3 },
  colQty:     { flex: 1, textAlign: 'center' },
  colPrice:   { flex: 2, alignItems: 'flex-end' },
  colTotal:   { flex: 2, alignItems: 'flex-end' },

  productName: { fontSize: 10, color: C.white },
  productSku:  { fontSize: 8, color: C.gray3, fontFamily: 'Courier', marginTop: 2 },
  productNote: { fontSize: 8, color: C.gray2, fontStyle: 'italic', marginTop: 2 },

  priceNormal:   { fontSize: 10, color: C.gray1 },
  priceAdjusted: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.lime },
  priceOriginal: { fontSize: 8, color: C.gray3, textDecoration: 'line-through', marginTop: 1 },

  qty:       { fontSize: 10, color: C.gray1, textAlign: 'center' },
  lineTotal: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.white },

  // Totales
  totalsBox: {
    backgroundColor: C.bgMid,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  totalLabel:          { fontSize: 10, color: C.gray2 },
  totalValue:          { fontSize: 10, color: C.gray1 },
  totalDiscountLabel:  { fontSize: 10, color: C.lime },
  totalDiscountValue:  { fontSize: 10, color: C.lime },
  totalDivider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    borderTopStyle: 'solid',
    marginVertical: 6,
  },
  grandLabel: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.white },
  grandValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.lime },

  // Método de pago
  paymentBox: {
    backgroundColor: C.bgMid,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    flexDirection: 'row',
  },
  paymentLabel: { fontSize: 10, color: C.gray2, marginRight: 8 },
  paymentValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.white },

  // Notas
  notesBox: {
    backgroundColor: C.bgMid,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderLeftWidth: 3,
    borderLeftColor: C.lime,
    borderLeftStyle: 'solid',
    marginBottom: 14,
  },
  notesLabel: {
    fontSize: 8,
    color: C.gray2,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  notesValue: { fontSize: 10, color: C.gray1 },

  // Footer
  footer: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    borderTopStyle: 'solid',
    paddingTop: 12,
    marginTop: 'auto',
  },
  footerText: { fontSize: 8, color: C.gray3, textAlign: 'center' },
})

// ─── Componente principal ────────────────────────────────────────────────────
export function OrderPDFDoc({ order }: { order: Order }) {
  const items            = order.items ?? []
  const hasDiscount      = order.discount_percentage > 0
  const hasShipping      = order.shipping_cost > 0
  const discountAmount   = order.subtotal_gross - order.subtotal_net
  const clientName       = order.client?.name ?? order.guest_name ?? '—'
  const paymentLabel     = order.payment_method === 'cash' ? 'Efectivo' : 'Transferencia'
  const displayDate      = order.completed_at ?? order.created_at

  return (
    <Document
      title={`Orden ${order.order_number} — Culto Orquideas`}
      author="Culto Orquideas POS"
    >
      <Page size="A4" style={s.page}>

        {/* ─── Header ─── */}
        <View style={s.header}>
          <View>
            <Text style={s.brandName}>Culto Orquideas</Text>
            <Text style={s.brandSub}>Orden de compra</Text>
          </View>
          <View style={s.orderNumBox}>
            <Text style={s.orderNumLabel}>Numero de orden</Text>
            <Text style={s.orderNumValue}>{order.order_number}</Text>
          </View>
        </View>

        {/* ─── Info row ─── */}
        <View style={s.infoRow}>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>Cliente</Text>
            <Text style={s.infoValue}>{clientName}</Text>
            {order.client?.email
              ? <Text style={s.infoSub}>{order.client.email}</Text>
              : null}
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>Fecha</Text>
            <Text style={s.infoValue}>{formatDate(displayDate)}</Text>
          </View>
          <View style={order.discount_code ? s.infoBox : s.infoBoxLast}>
            <Text style={s.infoLabel}>Pago</Text>
            <Text style={s.infoValue}>{paymentLabel}</Text>
          </View>
          {order.discount_code ? (
            <View style={s.infoBoxLast}>
              <Text style={s.infoLabel}>Descuento</Text>
              <Text style={s.infoValueLime}>{order.discount_code.code}</Text>
              <Text style={s.infoSub}>{order.discount_percentage}%</Text>
            </View>
          ) : null}
        </View>

        {/* ─── Tabla de productos ─── */}
        <View style={s.tableWrap}>
          {/* Encabezado */}
          <View style={s.thead}>
            <Text style={[s.th, { flex: 3 }]}>Producto</Text>
            <Text style={[s.th, { flex: 1, textAlign: 'center' }]}>Cant.</Text>
            <Text style={[s.th, { flex: 2, textAlign: 'right' }]}>Precio</Text>
            <Text style={[s.th, { flex: 2, textAlign: 'right' }]}>Total</Text>
          </View>

          {/* Filas */}
          {items.map((item: OrderItem, idx: number) => (
            <View key={item.id} style={idx === 0 ? s.trowFirst : s.trow}>
              {/* Producto */}
              <View style={s.colProduct}>
                <Text style={s.productName}>{item.product_name}</Text>
                <Text style={s.productSku}>{item.product_sku}</Text>
                {item.price_note
                  ? <Text style={s.productNote}>Nota: {item.price_note}</Text>
                  : null}
              </View>

              {/* Cantidad */}
              <Text style={s.qty}>{item.quantity}</Text>

              {/* Precio (ajustado o normal) */}
              <View style={s.colPrice}>
                {item.original_price != null ? (
                  <>
                    <Text style={s.priceAdjusted}>{formatCOP(item.unit_price)}</Text>
                    <Text style={s.priceOriginal}>{formatCOP(item.original_price)}</Text>
                  </>
                ) : (
                  <Text style={s.priceNormal}>{formatCOP(item.unit_price)}</Text>
                )}
              </View>

              {/* Total línea */}
              <View style={s.colTotal}>
                <Text style={s.lineTotal}>{formatCOP(item.line_total)}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ─── Totales ─── */}
        <View style={s.totalsBox}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal bruto</Text>
            <Text style={s.totalValue}>{formatCOP(order.subtotal_gross)}</Text>
          </View>

          {hasDiscount ? (
            <View style={s.totalRow}>
              <Text style={s.totalDiscountLabel}>
                Descuento ({order.discount_percentage}%)
              </Text>
              <Text style={s.totalDiscountValue}>-{formatCOP(discountAmount)}</Text>
            </View>
          ) : null}

          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal neto</Text>
            <Text style={s.totalValue}>{formatCOP(order.subtotal_net)}</Text>
          </View>

          {hasShipping ? (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Envio</Text>
              <Text style={s.totalValue}>{formatCOP(order.shipping_cost)}</Text>
            </View>
          ) : null}

          <View style={s.totalDivider} />

          <View style={s.totalRow}>
            <Text style={s.grandLabel}>Total</Text>
            <Text style={s.grandValue}>{formatCOP(order.total)}</Text>
          </View>
        </View>

        {/* ─── Método de pago ─── */}
        <View style={s.paymentBox}>
          <Text style={s.paymentLabel}>Metodo de pago:</Text>
          <Text style={s.paymentValue}>{paymentLabel}</Text>
        </View>

        {/* ─── Notas (condicional) ─── */}
        {order.notes ? (
          <View style={s.notesBox}>
            <Text style={s.notesLabel}>Notas</Text>
            <Text style={s.notesValue}>{order.notes}</Text>
          </View>
        ) : null}

        {/* ─── Footer ─── */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            Documento generado automaticamente por el sistema POS de Culto Orquideas
            · Medellin, Colombia · {new Date().getFullYear()}
          </Text>
        </View>

      </Page>
    </Document>
  )
}
