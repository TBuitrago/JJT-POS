import nodemailer from 'nodemailer'

// ─── Transporter (Hostinger SMTP, puerto 465 SSL) ────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 465),
  secure: true, // SSL obligatorio en puerto 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface OrderEmailData {
  orderNumber: string
  clientName: string
  clientEmail: string
  items: Array<{
    product_name: string
    product_sku: string
    quantity: number
    unit_price: number
    original_price?: number | null  // precio de inventario original (null si no fue ajustado)
    price_note?: string | null       // motivo del ajuste de precio (opcional)
    line_total: number
  }>
  subtotalGross: number
  discountPercentage: number
  subtotalNet: number
  shippingCost: number
  total: number
  paymentMethod: 'cash' | 'transfer'
  notes?: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// ─── Template HTML ────────────────────────────────────────────────────────────
function buildOrderHtml(data: OrderEmailData): string {
  const paymentLabel = data.paymentMethod === 'cash' ? 'Efectivo' : 'Transferencia'
  const hasDiscount = data.discountPercentage > 0
  const hasShipping = data.shippingCost > 0
  const discountAmount = data.subtotalGross - data.subtotalNet

  const itemRows = data.items.map(item => {
    const priceAdjusted = item.original_price != null

    // Celda de precio: si fue ajustado, mostrar precio ajustado en lima + original tachado
    const priceCell = priceAdjusted
      ? `<span style="color:#C7EA45;font-weight:600;">${formatCOP(item.unit_price)}</span>
         <br/><span style="font-size:11px;color:#6b7280;text-decoration:line-through;">${formatCOP(item.original_price!)}</span>`
      : formatCOP(item.unit_price)

    // Nota del ajuste debajo del nombre del producto
    const noteHtml = priceAdjusted && item.price_note
      ? `<br/><span style="font-size:11px;color:#9ca3af;font-style:italic;">📝 ${item.price_note}</span>`
      : ''

    return `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #1a3d2e;font-size:14px;color:#d1d5db;">
        <span style="font-family:monospace;font-size:11px;color:#C7EA45;">${item.product_sku}</span><br/>
        ${item.product_name}${noteHtml}
      </td>
      <td style="padding:10px 16px;border-bottom:1px solid #1a3d2e;text-align:center;font-size:14px;color:#d1d5db;">${item.quantity}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #1a3d2e;text-align:right;font-size:14px;color:#d1d5db;">${priceCell}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #1a3d2e;text-align:right;font-size:14px;font-weight:600;color:#ffffff;">${formatCOP(item.line_total)}</td>
    </tr>
  `}).join('')

  const discountRow = hasDiscount ? `
    <tr>
      <td colspan="2" style="padding:6px 16px;text-align:right;font-size:13px;color:#9ca3af;">Descuento (${data.discountPercentage}%)</td>
      <td style="padding:6px 16px;text-align:right;font-size:13px;color:#C7EA45;">−${formatCOP(discountAmount)}</td>
    </tr>
  ` : ''

  const shippingRow = hasShipping ? `
    <tr>
      <td colspan="2" style="padding:6px 16px;text-align:right;font-size:13px;color:#9ca3af;">Envío</td>
      <td style="padding:6px 16px;text-align:right;font-size:13px;color:#d1d5db;">${formatCOP(data.shippingCost)}</td>
    </tr>
  ` : ''

  const notesSection = data.notes ? `
    <div style="margin:24px 0;padding:14px 16px;background:#0a1f16;border-left:3px solid #C7EA45;border-radius:4px;">
      <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;">Notas</p>
      <p style="margin:0;font-size:14px;color:#d1d5db;">${data.notes}</p>
    </div>
  ` : ''

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirmación de orden ${data.orderNumber}</title>
</head>
<body style="margin:0;padding:0;background:#011208;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#011208;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#00261B;border-radius:16px 16px 0 0;padding:32px 32px 24px;text-align:center;border-bottom:2px solid #C7EA45;">
              <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">🌿 Culto Orquídeas</p>
              <p style="margin:0;font-size:13px;color:#9ca3af;">Confirmación de orden</p>
            </td>
          </tr>

          <!-- Saludo + número de orden -->
          <tr>
            <td style="background:#00261B;padding:28px 32px 20px;">
              <p style="margin:0 0 16px;font-size:16px;color:#d1d5db;">
                Hola <strong style="color:#ffffff;">${data.clientName}</strong>, ¡gracias por tu compra!
              </p>
              <div style="display:inline-block;background:#0a1f16;border:1px solid #1a3d2e;border-radius:10px;padding:12px 20px;">
                <p style="margin:0 0 2px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;">Número de orden</p>
                <p style="margin:0;font-size:26px;font-weight:700;font-family:monospace;color:#C7EA45;">${data.orderNumber}</p>
              </div>
            </td>
          </tr>

          <!-- Tabla de productos -->
          <tr>
            <td style="background:#00261B;padding:0 32px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a1f16;border-radius:10px;overflow:hidden;">
                <thead>
                  <tr style="background:#071a0f;">
                    <th style="padding:10px 16px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:600;">Producto</th>
                    <th style="padding:10px 16px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:600;">Cant.</th>
                    <th style="padding:10px 16px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:600;">Precio</th>
                    <th style="padding:10px 16px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:600;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemRows}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Totales -->
          <tr>
            <td style="background:#00261B;padding:8px 32px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td colspan="2" style="padding:6px 16px;text-align:right;font-size:13px;color:#9ca3af;">Subtotal</td>
                  <td style="padding:6px 16px;text-align:right;font-size:13px;color:#d1d5db;">${formatCOP(data.subtotalGross)}</td>
                </tr>
                ${discountRow}
                ${shippingRow}
                <tr>
                  <td colspan="2" style="padding:12px 16px 8px;text-align:right;font-size:15px;font-weight:700;color:#ffffff;border-top:1px solid #1a3d2e;">Total</td>
                  <td style="padding:12px 16px 8px;text-align:right;font-size:18px;font-weight:700;color:#C7EA45;border-top:1px solid #1a3d2e;">${formatCOP(data.total)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Pago -->
          <tr>
            <td style="background:#00261B;padding:0 32px 24px;">
              <div style="background:#0a1f16;border:1px solid #1a3d2e;border-radius:10px;padding:14px 16px;display:flex;gap:16px;">
                <span style="font-size:13px;color:#9ca3af;">Método de pago:</span>
                <strong style="font-size:13px;color:#ffffff;">${paymentLabel}</strong>
              </div>
            </td>
          </tr>

          <!-- Notas (condicional) -->
          ${data.notes ? `
          <tr>
            <td style="background:#00261B;padding:0 32px 24px;">
              ${notesSection}
            </td>
          </tr>
          ` : ''}

          <!-- Footer -->
          <tr>
            <td style="background:#071a0f;border-radius:0 0 16px 16px;padding:24px 32px;text-align:center;border-top:1px solid #1a3d2e;">
              <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">Este correo fue generado automáticamente por el sistema POS de Culto Orquídeas.</p>
              <p style="margin:0;font-size:12px;color:#4b5563;">© ${new Date().getFullYear()} Culto Orquídeas · Medellín, Colombia</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
  `.trim()
}

// ─── Función principal exportada ──────────────────────────────────────────────
export async function sendOrderConfirmation(data: OrderEmailData): Promise<void> {
  const html = buildOrderHtml(data)

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: data.clientEmail,
    subject: `✅ Orden ${data.orderNumber} confirmada — Culto Orquídeas`,
    html,
    text: [
      `Hola ${data.clientName}, gracias por tu compra en Culto Orquídeas.`,
      ``,
      `Orden: ${data.orderNumber}`,
      `Productos:`,
      ...data.items.map(i => {
        const priceInfo = i.original_price != null
          ? `${formatCOP(i.unit_price)} (ajustado de ${formatCOP(i.original_price)})`
          : formatCOP(i.unit_price)
        const noteLine = i.original_price != null && i.price_note ? `\n      📝 ${i.price_note}` : ''
        return `  - ${i.product_name} × ${i.quantity}  ${priceInfo}  →  ${formatCOP(i.line_total)}${noteLine}`
      }),
      ``,
      data.discountPercentage > 0 ? `Descuento (${data.discountPercentage}%): −${formatCOP(data.subtotalGross - data.subtotalNet)}` : '',
      data.shippingCost > 0 ? `Envío: ${formatCOP(data.shippingCost)}` : '',
      `Total: ${formatCOP(data.total)}`,
      `Pago: ${data.paymentMethod === 'cash' ? 'Efectivo' : 'Transferencia'}`,
      data.notes ? `\nNotas: ${data.notes}` : '',
    ].filter(Boolean).join('\n'),
  })
}
