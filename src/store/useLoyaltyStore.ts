import { create } from 'zustand';

export interface Deal {
  id: string;
  title: string;
  description: string;
  emoji: string;
}

export type Tier = 'Bronze' | 'Silver' | 'Gold';

export interface LoyaltyCustomer {
  id: string;
  name: string;
  points: number;
  tier: Tier;
  deals: Deal[];
  faceDescriptors: number[][];
  joinedAt: string;
}

interface LoyaltyStore {
  customers: LoyaltyCustomer[];
  currentCustomer: LoyaltyCustomer | null;
  setCustomers: (customers: LoyaltyCustomer[]) => void;
  addCustomer: (customer: LoyaltyCustomer) => void;
  setCurrentCustomer: (customer: LoyaltyCustomer | null) => void;
  clearCurrentCustomer: () => void;
  updateCustomerPoints: (id: string, points: number) => void;
  removeCustomer: (id: string) => void;
}

// Tier thresholds. Default mirrors the seed in 0001_init.sql but is overwritten
// at startup by setLoyaltyTiers() once loyalty_tiers is loaded from Supabase, so
// getTier() reflects whatever the owner configured.
interface TierThreshold { name: Tier; minPoints: number; }

let LOYALTY_TIERS: TierThreshold[] = [
  { name: 'Bronze', minPoints: 0 },
  { name: 'Silver', minPoints: 500 },
  { name: 'Gold', minPoints: 1000 },
];

export function setLoyaltyTiers(tiers: TierThreshold[]) {
  if (tiers.length > 0) {
    LOYALTY_TIERS = [...tiers].sort((a, b) => a.minPoints - b.minPoints);
  }
}

export function getTier(points: number): Tier {
  let result: Tier = LOYALTY_TIERS[0]?.name ?? 'Bronze';
  for (const t of LOYALTY_TIERS) {
    if (points >= t.minPoints) result = t.name;
  }
  return result;
}

// Progress toward the next tier (uses the DB-loaded tier thresholds).
export function getTierProgressInfo(points: number): {
  current: Tier; next: Tier | null; toNext: number; pct: number;
} {
  const tiers = LOYALTY_TIERS;
  let idx = 0;
  for (let i = 0; i < tiers.length; i++) if (points >= tiers[i].minPoints) idx = i;
  const current = tiers[idx]?.name ?? 'Bronze';
  const next = tiers[idx + 1];
  if (!next) return { current, next: null, toNext: 0, pct: 100 };
  const prevMin = tiers[idx].minPoints;
  const span = Math.max(1, next.minPoints - prevMin);
  const pct = Math.min(100, Math.max(0, Math.round(((points - prevMin) / span) * 100)));
  return { current, next: next.name, toNext: Math.max(0, next.minPoints - points), pct };
}

export function getNextTierThreshold(tier: Tier): number {
  if (tier === 'Bronze') return 500;
  if (tier === 'Silver') return 1000;
  return 1000;
}

export function getTierProgress(points: number, tier: Tier): number {
  if (tier === 'Gold') return 100;
  const prev = tier === 'Silver' ? 500 : 0;
  const next = tier === 'Silver' ? 1000 : 500;
  return Math.min(((points - prev) / (next - prev)) * 100, 100);
}

export const WELCOME_DEALS: Deal[] = [
  { id: 'w1', title: '2× Points Today', description: 'Earn double on any order', emoji: '⚡' },
  { id: 'w2', title: 'Free Size Upgrade', description: 'Upsize any drink for free', emoji: '☕' },
  { id: 'w3', title: '10% Off Matcha', description: 'On your next matcha order', emoji: '🍵' },
];

export const useLoyaltyStore = create<LoyaltyStore>((set) => ({
  customers: [],
  currentCustomer: null,
  setCustomers: (customers) => set({ customers }),
  addCustomer: (customer) => set((state) => ({
    // Upsert by id so re-adding an existing member (e.g. phone sign-in) can't
    // create a duplicate row in the in-memory list.
    customers: [...state.customers.filter(c => c.id !== customer.id), customer],
  })),
  setCurrentCustomer: (customer) => set({ currentCustomer: customer }),
  clearCurrentCustomer: () => set({ currentCustomer: null }),
  updateCustomerPoints: (id, points) => set((state) => ({
    customers: state.customers.map(c =>
      c.id === id ? { ...c, points, tier: getTier(points) } : c
    ),
    currentCustomer: state.currentCustomer?.id === id
      ? { ...state.currentCustomer, points, tier: getTier(points) }
      : state.currentCustomer,
  })),
  removeCustomer: (id) => set((state) => ({
    customers: state.customers.filter(c => c.id !== id),
    currentCustomer: state.currentCustomer?.id === id ? null : state.currentCustomer,
  })),
}));
