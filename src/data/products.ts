// Product catalog types + a bundled fallback. The live menu comes from Supabase
// (products + branch_products) via fetchProducts() in supabaseService.ts; this
// fallback only renders if the DB hasn't been seeded yet, so the kiosk is never
// blank during setup. IDs are strings (uuid in the DB; "seed-*" in the fallback).

export interface Product {
  id: string;
  name: string;
  price: number;            // resolved price for this branch
  category: 'Hot' | 'Cold' | 'Blended';
  image: string;
  description: string;
  rating?: number;     // not stored in DB; present only on bundled fallback items
  calories?: number;   // not stored in DB; present only on bundled fallback items
  tag?: 'Popular' | 'New' | 'Seasonal';
  video?: string;
}

// Fallback only — kept in sync with the seed rows in 0001_init.sql.
export const FALLBACK_PRODUCTS: Product[] = [
  { id: 'seed-1', name: 'Signature Iced Coffee', price: 4.50, category: 'Cold', image: '/ice_coffee_1781694763159.png', description: 'Cold-pressed espresso over crystal-clear ice.', rating: 4.8, calories: 120, tag: 'Popular', video: '/Create_cyclic_video_for_UGC_202606171711.mp4' },
  { id: 'seed-2', name: 'Zen Matcha Latte', price: 5.00, category: 'Cold', image: '/matcha_latte_1781694772930.png', description: 'Stone-ground ceremonial matcha, hand-whisked.', rating: 4.9, calories: 180, tag: 'Popular' },
  { id: 'seed-3', name: 'Cozy Hot Cocoa', price: 4.00, category: 'Hot', image: '/hot_cocoa_1781694781658.png', description: 'Belgian dark chocolate, slow-steamed milk.', rating: 4.7, calories: 320 },
  { id: 'seed-4', name: 'Nitro Cold Brew', price: 5.50, category: 'Cold', image: '/hero_coffee.png', description: 'Nitrogen-infused for a velvety cascade.', rating: 4.8, calories: 90, tag: 'New' },
  { id: 'seed-5', name: 'Vanilla Bean Frappe', price: 6.00, category: 'Blended', image: '/ice_coffee_1781694763159.png', description: 'Blended with real vanilla bean & cream.', rating: 4.6, calories: 410, tag: 'Seasonal' },
];

// Real "Order again" comes from order history — see fetchRecentProducts() in supabaseService.
