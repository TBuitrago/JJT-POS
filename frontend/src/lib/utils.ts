/**
 * Formatea un número como precio en COP
 * Ejemplo: 15000 → "$15.000"
 */
export function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Formatea una fecha ISO a formato legible en español
 * Ejemplo: "2025-03-09T14:30:00Z" → "09 de marzo de 2025, 2:30 PM"
 */
export function formatDate(isoString: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoString))
}

/**
 * Formatea fecha corta
 * Ejemplo: "2025-03-09" → "09/03/2025"
 */
export function formatDateShort(isoString: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(isoString))
}

/**
 * Calcula el total de una orden
 * Fórmula: (subtotal_bruto × (1 - descuento%)) + envío
 */
export function calcOrderTotal(
  subtotalGross: number,
  discountPercentage: number,
  shippingCost: number
): { subtotalNet: number; total: number } {
  const subtotalNet = subtotalGross * (1 - discountPercentage / 100)
  const total = subtotalNet + shippingCost
  return { subtotalNet, total }
}

/**
 * Valida que un SKU sea exactamente 4 dígitos numéricos
 */
export function isValidSKU(sku: string): boolean {
  return /^\d{4}$/.test(sku)
}

/**
 * Combina clases CSS condicionalmente (similar a clsx)
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}
