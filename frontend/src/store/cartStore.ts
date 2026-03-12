import { create } from 'zustand'
import type { CartItem, Product } from '@/types'

interface CartStore {
  items: CartItem[]
  addItem: (product: Product) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  updateItemPrice: (productId: string, customPrice: number | null, priceNote: string | null) => void
  clearCart: () => void
  subtotalGross: () => number
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],

  addItem: (product) => {
    set((state) => {
      const existing = state.items.find((i) => i.id === product.id)
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
          ),
        }
      }
      return { items: [...state.items, { ...product, quantity: 1 }] }
    })
  },

  removeItem: (productId) => {
    set((state) => ({
      items: state.items.filter((i) => i.id !== productId),
    }))
  },

  updateQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(productId)
      return
    }
    set((state) => ({
      items: state.items.map((i) =>
        i.id === productId ? { ...i, quantity } : i
      ),
    }))
  },

  updateItemPrice: (productId, customPrice, priceNote) => {
    set((state) => ({
      items: state.items.map((i) =>
        i.id === productId
          ? {
              ...i,
              customPrice: customPrice !== null ? customPrice : undefined,
              priceNote: priceNote?.trim() || undefined,
            }
          : i
      ),
    }))
  },

  clearCart: () => set({ items: [] }),

  // subtotalGross usa customPrice si fue ajustado, de lo contrario el precio de inventario
  subtotalGross: () =>
    get().items.reduce((sum, item) => sum + (item.customPrice ?? item.price) * item.quantity, 0),
}))
