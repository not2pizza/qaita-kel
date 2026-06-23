import { supabase } from './supabase';
import { getTier, WELCOME_DEALS, setLoyaltyTiers, type Tier } from '../store/useLoyaltyStore';
import type { LoyaltyCustomer } from '../store/useLoyaltyStore';
import type { SelectedModifier } from '../store/useCartStore';
import type { Product } from '../data/products';
import { DEFAULT_BRAND, type BrandSettings, type Lang } from './theme';

// Brand / white-label config (single row). Falls back to DEFAULT_BRAND if the
// table is missing or empty, so the kiosk always renders the Antigravity look.
export async function fetchBrandSettings(): Promise<BrandSettings> {
  const { data, error } = await supabase
    .from('brand_settings')
    .select('brand_name, tagline, logo_emoji, logo_url, accent_color, accent_hover, bg_color, hero_image_url, default_language')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) {
    if (error) console.warn('brand_settings unavailable, using defaults:', error.message);
    return DEFAULT_BRAND;
  }

  const lang = (['en', 'ru', 'kk'].includes(data.default_language) ? data.default_language : 'en') as Lang;
  return {
    brandName: data.brand_name ?? DEFAULT_BRAND.brandName,
    tagline: data.tagline ?? DEFAULT_BRAND.tagline,
    logoEmoji: data.logo_emoji ?? DEFAULT_BRAND.logoEmoji,
    logoUrl: data.logo_url ?? null,
    accentColor: data.accent_color ?? DEFAULT_BRAND.accentColor,
    accentHover: data.accent_hover ?? DEFAULT_BRAND.accentHover,
    bgColor: data.bg_color ?? DEFAULT_BRAND.bgColor,
    heroImageUrl: data.hero_image_url ?? null,
    defaultLanguage: lang,
  };
}

interface FaceProfileRow {
  id: string;
  face_embedding: unknown; // JSONB — actual shape validated at runtime
  is_active: boolean;
}

// Normalises whatever Supabase returns for a JSONB embedding field into number[][]
// Handles two cases:
//   • Already nested: [[...128 nums...], [...], ...]  → pass through
//   • Accidentally flat: [...640 nums...]              → chunk into 128-element pieces
function toDescriptors(raw: unknown): number[][] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  if (Array.isArray(raw[0])) return raw as number[][];
  // flat array — chunk by 128
  const flat = raw as number[];
  const chunks: number[][] = [];
  for (let i = 0; i + 128 <= flat.length; i += 128) {
    chunks.push(flat.slice(i, i + 128));
  }
  return chunks;
}

interface CustomerRow {
  id: string;
  full_name: string;
  bonus_points: number;
  created_at: string;
  face_profiles: FaceProfileRow[];
}

export async function fetchCustomers(): Promise<LoyaltyCustomer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select(`
      id, full_name, bonus_points, created_at,
      face_profiles (id, face_embedding, is_active)
    `)
    .eq('is_active', true);

  if (error || !data) {
    console.error('Failed to fetch customers:', error?.message);
    return [];
  }

  return (data as CustomerRow[]).map(c => ({
    id: c.id,
    name: c.full_name,
    points: c.bonus_points,
    tier: getTier(c.bonus_points),
    deals: WELCOME_DEALS,
    faceDescriptors: c.face_profiles
      .filter(fp => fp.is_active)
      .flatMap(fp => toDescriptors(fp.face_embedding)),
    joinedAt: c.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Loyalty configuration (settings + tiers) — replaces hardcoded rates/thresholds.
// ---------------------------------------------------------------------------
export interface LoyaltyConfig {
  pointsEnabled: boolean;
  tiersEnabled: boolean;
  stampsEnabled: boolean;
  pointsPerDollar: number;
  welcomeBonus: number;
}

const DEFAULT_CONFIG: LoyaltyConfig = {
  pointsEnabled: true,
  tiersEnabled: true,
  stampsEnabled: false,
  pointsPerDollar: 10,
  welcomeBonus: 50,
};

// Loads the global loyalty settings + tier table. Side effect: pushes tiers into
// the store so getTier() everywhere reflects the DB. Falls back to sane defaults
// if the tables aren't seeded yet.
export async function fetchLoyaltyConfig(): Promise<LoyaltyConfig> {
  const [{ data: settings }, { data: tiers }] = await Promise.all([
    supabase
      .from('loyalty_settings')
      .select('points_enabled, tiers_enabled, stamps_enabled, points_per_dollar, welcome_bonus')
      .is('branch_id', null)
      .maybeSingle(),
    supabase
      .from('loyalty_tiers')
      .select('name, min_points')
      .order('min_points', { ascending: true }),
  ]);

  if (tiers && tiers.length > 0) {
    setLoyaltyTiers(tiers.map(t => ({ name: t.name as Tier, minPoints: t.min_points })));
  }

  if (!settings) return DEFAULT_CONFIG;
  return {
    pointsEnabled: settings.points_enabled ?? true,
    tiersEnabled: settings.tiers_enabled ?? true,
    stampsEnabled: settings.stamps_enabled ?? false,
    pointsPerDollar: Number(settings.points_per_dollar ?? 10),
    welcomeBonus: settings.welcome_bonus ?? 50,
  };
}

// ---------------------------------------------------------------------------
// Menu — products joined with per-branch price/availability.
// ---------------------------------------------------------------------------
interface BranchProductRow {
  price: number | null;
  is_available: boolean;
  sort_order: number;
  products: {
    id: string;
    name: string;
    description: string | null;
    base_price: number;
    category: string;
    image_url: string | null;
    video_url: string | null;
    tag: string | null;
    is_active: boolean;
  } | null;
}

export async function fetchProducts(branchId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('branch_products')
    .select(`
      price, is_available, sort_order,
      products (id, name, description, base_price, category, image_url, video_url, tag, is_active)
    `)
    .eq('branch_id', branchId)
    .eq('is_available', true)
    .order('sort_order', { ascending: true });

  if (error || !data) {
    console.error('Failed to fetch products:', error?.message);
    return [];
  }

  return (data as unknown as BranchProductRow[])
    .filter(bp => bp.products && bp.products.is_active)
    .map(bp => {
      const p = bp.products!;
      return {
        id: p.id,
        name: p.name,
        price: Number(bp.price ?? p.base_price),
        category: (p.category as Product['category']),
        image: p.image_url ?? '',
        description: p.description ?? '',
        // rating/calories are not in the DB schema — left undefined (UI hides them)
        tag: (p.tag as Product['tag']) ?? undefined,
        video: p.video_url ?? undefined,
      };
    });
}

// ---------------------------------------------------------------------------
// Product modifiers (data-driven add-ons: Size, Milk, Syrup, Extras, …)
// ---------------------------------------------------------------------------
export interface ModifierOption {
  id: string;            // UI key (= dbId for DB rows)
  dbId: string | null;   // modifier_options.id (null for the hardcoded fallback)
  name: string;
  priceDelta: number;
  isDefault: boolean;
}
export interface ModifierGroup {
  id: string;
  dbId: string | null;   // modifier_groups.id
  name: string;
  selectionType: 'single' | 'multiple';
  minSelections: number;
  maxSelections: number;
  options: ModifierOption[];
}

// Modifier groups + options attached to a product, with per-branch price/
// availability overrides applied. Returns [] if the product has none or the
// modifier tables aren't seeded yet (caller falls back to a hardcoded set).
export async function fetchProductModifiers(productId: string, branchId: string): Promise<ModifierGroup[]> {
  const { data, error } = await supabase
    .from('product_modifier_groups')
    .select(`
      sort_order, min_selections, max_selections,
      modifier_groups (
        id, name, selection_type, min_selections, max_selections, is_active, sort_order,
        modifier_options ( id, name, price_delta, is_default, is_active, sort_order )
      )
    `)
    .eq('product_id', productId)
    .order('sort_order', { ascending: true });

  if (error || !data) return [];

  // Branch-level overrides (price + availability) keyed by option id.
  const overrides = new Map<string, { priceDelta: number | null; available: boolean }>();
  const { data: bmo } = await supabase
    .from('branch_modifier_options')
    .select('modifier_option_id, price_delta, is_available')
    .eq('branch_id', branchId);
  for (const o of (bmo ?? []) as Array<{ modifier_option_id: string; price_delta: number | null; is_available: boolean }>) {
    overrides.set(o.modifier_option_id, { priceDelta: o.price_delta, available: o.is_available });
  }

  type GRow = {
    id: string; name: string; selection_type: 'single' | 'multiple';
    min_selections: number; max_selections: number; is_active: boolean; sort_order: number;
    modifier_options: Array<{ id: string; name: string; price_delta: number; is_default: boolean; is_active: boolean; sort_order: number }>;
  };
  type PMG = { sort_order: number; min_selections: number | null; max_selections: number | null; modifier_groups: GRow | null };

  const groups: ModifierGroup[] = [];
  for (const row of data as unknown as PMG[]) {
    const g = row.modifier_groups;
    if (!g || !g.is_active) continue;
    const options = (g.modifier_options ?? [])
      .filter(o => o.is_active)
      .map(o => ({ o, ov: overrides.get(o.id) }))
      .filter(({ ov }) => !ov || ov.available)            // drop branch-disabled options
      .sort((a, b) => a.o.sort_order - b.o.sort_order)
      .map(({ o, ov }) => ({
        id: o.id, dbId: o.id, name: o.name,
        priceDelta: Number(ov?.priceDelta ?? o.price_delta),
        isDefault: o.is_default,
      }));
    if (options.length === 0) continue;
    groups.push({
      id: g.id, dbId: g.id, name: g.name,
      selectionType: g.selection_type,
      minSelections: row.min_selections ?? g.min_selections,
      maxSelections: row.max_selections ?? g.max_selections,
      options,
    });
  }
  return groups;
}

// Real "Order again": the customer's most recent full orders, with each line
// item's chosen modifiers, so the whole order can be repeated in one tap.
export interface PastOrderItem {
  productId: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
  modifiers: SelectedModifier[];
}
export interface PastOrder {
  id: string;
  createdAt: string;
  total: number;
  items: PastOrderItem[];
}

// Stable signature of an order's contents (ignores id/date) — two orders with
// the same items+modifiers+quantities share a signature.
function orderSignature(o: PastOrder): string {
  return o.items
    .map(i => `${i.productId ?? i.name}|${i.modifiers.map(m => m.optionId ?? m.optionName).sort().join('+')}|${i.quantity}`)
    .sort()
    .join('~');
}

// Rebuild chosen modifiers from an order_item's options jsonb. New orders store
// { modifiers: [...] }; legacy orders stored { size, milk, syrup }.
function extractModifiers(
  options: { modifiers?: SelectedModifier[]; size?: string; milk?: string; syrup?: string } | null
): SelectedModifier[] {
  if (!options) return [];
  if (Array.isArray(options.modifiers)) return options.modifiers;
  const legacy: SelectedModifier[] = [];
  const push = (groupName: string, optionName?: string) => {
    if (optionName && optionName.toLowerCase() !== 'none')
      legacy.push({ groupId: null, groupName, optionId: null, optionName, priceDelta: 0 });
  };
  push('Size', options.size);
  push('Milk', options.milk);
  push('Syrup', options.syrup);
  return legacy;
}

// Raw fetch (keeps repeats — needed for frequency analysis).
async function fetchOrdersRaw(customerId: string, limit: number): Promise<PastOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, created_at, total, order_items (product_id, name, unit_price, quantity, options)')
    .eq('customer_id', customerId)
    .eq('status', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as unknown as Array<{
    id: string;
    created_at: string;
    total: number;
    order_items: Array<{
      product_id: string | null;
      name: string;
      unit_price: number;
      quantity: number;
      options: { modifiers?: SelectedModifier[]; size?: string; milk?: string; syrup?: string } | null;
    }>;
  }>)
    .map(o => ({
      id: o.id,
      createdAt: o.created_at,
      total: Number(o.total),
      items: (o.order_items ?? []).map(it => ({
        productId: it.product_id,
        name: it.name,
        unitPrice: Number(it.unit_price),
        quantity: it.quantity,
        modifiers: extractModifiers(it.options),
      })),
    }))
    .filter(o => o.items.length > 0);
}

// The customer's "usual": the most frequently repeated order (tie → most recent).
export async function fetchUsualOrder(customerId: string): Promise<PastOrder | null> {
  const orders = await fetchOrdersRaw(customerId, 20);
  if (orders.length === 0) return null;

  const counts = new Map<string, number>();
  let best = orders[0];          // orders are newest-first → natural tiebreak
  let bestCount = 0;
  for (const o of orders) {
    const s = orderSignature(o);
    const c = (counts.get(s) ?? 0) + 1;
    counts.set(s, c);
    if (c > bestCount) { bestCount = c; best = o; }
  }
  return best;
}

// "Order again": recent DISTINCT orders (identical repeated orders collapse to one).
export async function fetchRecentOrders(customerId: string, max = 3): Promise<PastOrder[]> {
  const orders = await fetchOrdersRaw(customerId, 20);
  const seen = new Set<string>();
  const distinct: PastOrder[] = [];
  for (const o of orders) {            // newest-first → keeps the most recent copy
    const s = orderSignature(o);
    if (seen.has(s)) continue;
    seen.add(s);
    distinct.push(o);
    if (distinct.length >= max) break;
  }
  return distinct;
}

// ---------------------------------------------------------------------------
// Enrollment
// ---------------------------------------------------------------------------
// Exposes the reason the last enrollment failed (shown in the UI for diagnosis).
let lastEnrollError = '';
export function getLastEnrollError(): string { return lastEnrollError; }

export async function enrollCustomer(
  name: string,
  faceDescriptors: number[][],
  opts: { phone?: string; welcomeBonus?: number } = {}
): Promise<LoyaltyCustomer | null> {
  const welcomeBonus = opts.welcomeBonus ?? 50;
  lastEnrollError = '';

  // Retry the insert a few times — a flaky connection can fail transiently.
  let customer: { id: string; full_name: string; bonus_points: number; created_at: string } | null = null;
  let lastErr: string | undefined;
  let lastCode: string | undefined;
  for (let attempt = 0; attempt < 4 && !customer; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 500));
    try {
      const { data, error } = await supabase
        .from('customers')
        .insert({
          full_name: name,
          phone: opts.phone || null,
          bonus_points: welcomeBonus,
          is_active: true,
        })
        .select('id, full_name, bonus_points, created_at')
        .single();
      if (data) customer = data;
      else { lastErr = error?.message ?? error?.code ?? 'no data returned'; lastCode = error?.code; }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    // Duplicate phone → this number already belongs to someone. Don't fail —
    // link to that existing account instead (returning member).
    if (!customer && (lastCode === '23505' || /duplicate key|customers_phone_key/i.test(lastErr ?? ''))) {
      const existing = opts.phone ? await findCustomerByPhone(opts.phone) : null;
      if (existing) {
        if (faceDescriptors.length > 0) await addFaceProfile(existing.id, faceDescriptors);
        return existing;
      }
      break; // duplicate but couldn't fetch — stop retrying
    }
  }

  if (!customer) {
    lastEnrollError = lastErr ?? 'unknown error';
    console.error('Failed to create customer after retries:', lastErr);
    return null;
  }

  const { error: fpErr } = await supabase.from('face_profiles').insert({
    customer_id: customer.id,
    face_embedding: faceDescriptors,
    embedding_model: 'face-api/tinyface-128',
    consent_given: true,
    is_active: true,
  });

  if (fpErr) console.error('Failed to save face profile:', fpErr.message);

  // Log welcome bonus
  await supabase.from('bonus_transactions').insert({
    customer_id: customer.id,
    type: 'earned',
    points: welcomeBonus,
    reason: 'Welcome bonus',
  });

  return {
    id: customer.id,
    name: customer.full_name,
    points: customer.bonus_points,
    tier: getTier(customer.bonus_points),
    deals: WELCOME_DEALS,
    faceDescriptors,
    joinedAt: customer.created_at,
  };
}

// Looks up a member by phone (the phone is unique). Finds them regardless of
// is_active so a re-registration with the same number links to the existing
// account instead of hitting the unique constraint; reactivates if needed.
export async function findCustomerByPhone(phone: string): Promise<LoyaltyCustomer | null> {
  const p = phone.trim();
  if (!p) return null;

  const { data, error } = await supabase
    .from('customers')
    .select(`
      id, full_name, bonus_points, created_at, is_active,
      face_profiles (id, face_embedding, is_active)
    `)
    .eq('phone', p)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const c = data as unknown as CustomerRow & { is_active: boolean };

  // Returning member who was previously deactivated → bring them back.
  if (!c.is_active) {
    await supabase.from('customers').update({ is_active: true }).eq('id', c.id);
  }

  return {
    id: c.id,
    name: c.full_name,
    points: c.bonus_points,
    tier: getTier(c.bonus_points),
    deals: WELCOME_DEALS,
    faceDescriptors: c.face_profiles
      .filter(fp => fp.is_active)
      .flatMap(fp => toDescriptors(fp.face_embedding)),
    joinedAt: c.created_at,
  };
}

// Attaches an additional face sample to an existing customer (improves future
// recognition; used when a returning member signs in by phone).
export async function addFaceProfile(
  customerId: string,
  faceDescriptors: number[][]
): Promise<boolean> {
  if (faceDescriptors.length === 0) return false;
  const { error } = await supabase.from('face_profiles').insert({
    customer_id: customerId,
    face_embedding: faceDescriptors,
    embedding_model: 'face-api/tinyface-128',
    consent_given: true,
    is_active: true,
  });
  if (error) {
    console.error('Failed to add face profile:', error.message);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Orders — persist a completed checkout (orders + order_items + points).
// ---------------------------------------------------------------------------
export interface NewOrderItem {
  productId: string | null;       // null for fallback/seed items not in the DB
  name: string;
  unitPrice: number;
  quantity: number;
  options?: Record<string, unknown>;
  modifiers?: SelectedModifier[]; // written to order_item_modifiers (+ options.modifiers)
}

export async function createOrder(params: {
  branchId: string;
  customerId: string | null;
  customerName: string | null;
  items: NewOrderItem[];
  subtotal: number;
  discountTotal?: number;
  total: number;
  pointsPerDollar: number;
  pointsRedeemed?: number;        // points spent on a reward at checkout
  paymentMethod?: string;
}): Promise<{ orderId: string; pointsEarned: number; newBalance: number | null } | null> {
  const pointsEarned = params.customerId
    ? Math.round(params.subtotal * params.pointsPerDollar)
    : 0;
  const pointsRedeemed = params.customerId ? (params.pointsRedeemed ?? 0) : 0;

  const { data: order, error: oErr } = await supabase
    .from('orders')
    .insert({
      branch_id: params.branchId,
      customer_id: params.customerId,
      customer_name: params.customerName,
      subtotal: params.subtotal,
      discount_total: params.discountTotal ?? 0,
      total: params.total,
      points_earned: pointsEarned,
      points_redeemed: pointsRedeemed,
      status: true,
      payment_method: params.paymentMethod ?? 'card',
    })
    .select('id')
    .single();

  if (oErr || !order) {
    console.error('Failed to create order:', oErr?.message);
    return null;
  }

  const itemRows = params.items.map(it => ({
    order_id: order.id,
    product_id: it.productId,
    name: it.name,
    unit_price: it.unitPrice,
    quantity: it.quantity,
    // Keep a denormalized copy of modifiers in options so "Order again" can
    // rebuild the exact line without a join (resilient to schema differences).
    options: it.options ?? (it.modifiers ? { modifiers: it.modifiers } : null),
    line_total: Number((it.unitPrice * it.quantity).toFixed(2)),
  }));

  const { data: insertedItems, error: iErr } = await supabase
    .from('order_items').insert(itemRows).select('id');
  if (iErr) console.error('Failed to save order items:', iErr.message);

  // Normalized modifier records (for the owner panel / reporting). Best-effort —
  // a missing order_item_modifiers table must not fail the order.
  if (insertedItems && insertedItems.length === params.items.length) {
    const modRows: Array<Record<string, unknown>> = [];
    params.items.forEach((it, idx) => {
      for (const m of it.modifiers ?? []) {
        modRows.push({
          order_item_id: (insertedItems[idx] as { id: string }).id,
          modifier_group_id: m.groupId,
          modifier_option_id: m.optionId,
          group_name: m.groupName,
          option_name: m.optionName,
          unit_price_delta: m.priceDelta,
          quantity: 1,
        });
      }
    });
    if (modRows.length) {
      const { error: mErr } = await supabase.from('order_item_modifiers').insert(modRows);
      if (mErr) console.warn('order_item_modifiers not saved:', mErr.message);
    }
  }

  // Settle the balance in one update: + earned, − redeemed.
  let newBalance: number | null = null;
  if (params.customerId && (pointsEarned > 0 || pointsRedeemed > 0)) {
    const { data: cur } = await supabase
      .from('customers')
      .select('bonus_points')
      .eq('id', params.customerId)
      .single();
    if (cur) {
      newBalance = Math.max(0, cur.bonus_points + pointsEarned - pointsRedeemed);
      await supabase
        .from('customers')
        .update({ bonus_points: newBalance, updated_at: new Date().toISOString() })
        .eq('id', params.customerId);
      const txs = [];
      if (pointsEarned > 0) txs.push({ customer_id: params.customerId, order_id: order.id, type: 'earned', points: pointsEarned, reason: 'Order' });
      if (pointsRedeemed > 0) txs.push({ customer_id: params.customerId, order_id: order.id, type: 'redeemed', points: pointsRedeemed, reason: 'Reward redemption' });
      if (txs.length) await supabase.from('bonus_transactions').insert(txs);
    }
  }

  return { orderId: order.id, pointsEarned, newBalance };
}

// ---------------------------------------------------------------------------
// Rewards catalog (redeemable at checkout).
// ---------------------------------------------------------------------------
export interface Reward {
  id: string;
  title: string;
  rewardType: string;             // 'discount' | 'free_item' | 'points' | 'custom'
  costPoints: number;
  amount: number;                 // currency discount applied (from config.amount)
}

export async function fetchRewards(): Promise<Reward[]> {
  const { data, error } = await supabase
    .from('rewards')
    .select('id, title, reward_type, cost_points, config')
    .eq('is_active', true)
    .order('cost_points', { ascending: true });

  if (error || !data) return [];
  return (data as Array<{ id: string; title: string; reward_type: string; cost_points: number; config: { amount?: number } | null }>)
    .map(r => ({
      id: r.id,
      title: r.title,
      rewardType: r.reward_type,
      costPoints: r.cost_points,
      amount: Number(r.config?.amount ?? 0),
    }));
}

// Awards points: updates the running balance and logs the transaction.
// Returns the new total, or null on failure.
export async function awardPoints(
  customerId: string,
  points: number,
  orderId?: string,
  reason?: string
): Promise<number | null> {
  const { data: current, error: fErr } = await supabase
    .from('customers')
    .select('bonus_points')
    .eq('id', customerId)
    .single();

  if (fErr || !current) {
    console.error('Failed to read points balance:', fErr?.message);
    return null;
  }

  const newTotal = current.bonus_points + points;

  const { error: uErr } = await supabase
    .from('customers')
    .update({ bonus_points: newTotal, updated_at: new Date().toISOString() })
    .eq('id', customerId);

  if (uErr) {
    console.error('Failed to update points balance:', uErr.message);
    return null;
  }

  await supabase.from('bonus_transactions').insert({
    customer_id: customerId,
    order_id: orderId ?? null,
    type: 'earned',
    points,
    reason: reason ?? null,
  });

  return newTotal;
}

// Manual point adjustment from the admin console (+/-).
export async function adjustPoints(
  customerId: string,
  delta: number
): Promise<number | null> {
  const { data: current, error: fErr } = await supabase
    .from('customers')
    .select('bonus_points')
    .eq('id', customerId)
    .single();

  if (fErr || !current) {
    console.error('Failed to read points balance:', fErr?.message);
    return null;
  }

  const newTotal = Math.max(0, current.bonus_points + delta);

  const { error: uErr } = await supabase
    .from('customers')
    .update({ bonus_points: newTotal, updated_at: new Date().toISOString() })
    .eq('id', customerId);

  if (uErr) {
    console.error('Failed to adjust points:', uErr.message);
    return null;
  }

  await supabase.from('bonus_transactions').insert({
    customer_id: customerId,
    type: 'adjusted',
    points: Math.abs(delta),
    reason: 'Manual admin adjustment',
  });

  return newTotal;
}

// Soft-delete a member (they disappear from recognition until re-enrolled).
export async function deactivateCustomer(customerId: string): Promise<boolean> {
  const { error } = await supabase
    .from('customers')
    .update({ is_active: false })
    .eq('id', customerId);

  if (error) {
    console.error('Failed to deactivate customer:', error.message);
    return false;
  }
  return true;
}

export async function logRecognition(params: {
  branchId: string | null;
  customerId: string | null;
  similarityScore: number;
  result: 'recognized' | 'not_found' | 'low_confidence' | 'error';
}) {
  // Map app-side result values to the DB enum-style strings.
  const dbResult =
    params.result === 'recognized' ? 'matched'
    : params.result === 'not_found' ? 'unknown'
    : params.result;

  await supabase.from('face_recognition_logs').insert({
    branch_id: params.branchId,
    customer_id: params.customerId,
    similarity_score: params.similarityScore,
    result: dbResult,
  });
}
