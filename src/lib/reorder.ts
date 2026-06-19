import type { CartItem } from '../store/useCartStore';
import type { PastOrder } from './supabaseService';
import type { Product } from '../data/products';

// Turn a past order into cart items, re-resolving each product's image from the
// live menu and preserving the exact customisation (size / milk / syrup / qty).
export function orderToCartItems(order: PastOrder, products: Product[]): CartItem[] {
  return order.items.map(it => {
    const size = (it.size as 'S' | 'M' | 'L') ?? 'M';
    return {
      cartItemId: `${it.productId ?? it.name}-${size}-${it.milk ?? ''}-${it.syrup ?? ''}`,
      productId: it.productId ?? `past-${it.name}`,
      name: it.name,
      price: it.unitPrice,
      image: products.find(p => p.id === it.productId)?.image ?? '',
      size,
      milk: it.milk ?? '',
      syrup: it.syrup ?? '',
      quantity: it.quantity,
    };
  });
}

export interface AggItem { productId: string | null; name: string; quantity: number; }

// Merge line items of the same product (summing quantities) for compact display.
// Reordering itself still uses the original items (to preserve per-line options).
export function aggregateItems(order: PastOrder): AggItem[] {
  const map = new Map<string, AggItem>();
  for (const it of order.items) {
    const key = it.productId ?? it.name;
    const e = map.get(key);
    if (e) e.quantity += it.quantity;
    else map.set(key, { productId: it.productId, name: it.name, quantity: it.quantity });
  }
  return [...map.values()];
}

// Short summary, e.g. "2× Iced Coffee, Matcha Latte +2 more".
export function orderSummaryText(order: PastOrder, maxNames = 2): string {
  const agg = aggregateItems(order);
  const parts = agg
    .slice(0, maxNames)
    .map(i => (i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name));
  if (agg.length > maxNames) parts.push(`+${agg.length - maxNames} more`);
  return parts.join(', ');
}
