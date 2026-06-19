import { create } from 'zustand';

export interface CartItem {
  cartItemId: string; // unique ID to distinguish same products with different customizations
  productId: string;
  name: string;
  price: number;
  image: string;
  size: 'S' | 'M' | 'L';
  milk: string;
  syrup: string;
  quantity: number;
}

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  getCartCount: () => number;
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  addItem: (newItem) => {
    set((state) => {
      const existingItem = state.items.find(item => item.cartItemId === newItem.cartItemId);
      if (existingItem) {
        return {
          items: state.items.map(item =>
            item.cartItemId === newItem.cartItemId
              ? { ...item, quantity: item.quantity + newItem.quantity }
              : item
          )
        };
      }
      return { items: [...state.items, newItem] };
    });
  },
  removeItem: (id) => {
    set((state) => ({
      items: state.items.filter(item => item.cartItemId !== id)
    }));
  },
  updateQuantity: (id, quantity) => {
    set((state) => ({
      items: state.items.map(item =>
        item.cartItemId === id ? { ...item, quantity } : item
      ).filter(item => item.quantity > 0)
    }));
  },
  clearCart: () => set({ items: [] }),
  getCartTotal: () => {
    return get().items.reduce((total, item) => total + (item.price * item.quantity), 0);
  },
  getCartCount: () => {
    return get().items.reduce((count, item) => count + item.quantity, 0);
  }
}));
