// One-off idempotent seed for the Antigravity Supabase DB.
// Run: node scripts/seed.mjs   (reads .env for URL + anon key)
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);

const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const log = (...a) => console.log(...a);

// 1) Branch (schema has no slug — identify by name)
let { data: branch } = await sb.from('branches').select('id').eq('name', 'Main').maybeSingle();
if (!branch) {
  const { data, error } = await sb.from('branches')
    .insert({ name: 'Main', type: 'no_kitchen', open_time: '07:00', close_time: '21:00' })
    .select('id').single();
  if (error) throw new Error('branches: ' + error.message);
  branch = data;
  log('✓ branch created', branch.id);
} else log('• branch exists', branch.id);

// 2) Loyalty settings (global row)
{
  const { data } = await sb.from('loyalty_settings').select('id').is('branch_id', null).maybeSingle();
  if (!data) {
    const { error } = await sb.from('loyalty_settings').insert({
      branch_id: null, points_enabled: true, tiers_enabled: true, stamps_enabled: true,
      points_per_dollar: 10, welcome_bonus: 50,
    });
    if (error) throw new Error('loyalty_settings: ' + error.message);
    log('✓ loyalty_settings created');
  } else log('• loyalty_settings exists');
}

// 3) Tiers
{
  const { count } = await sb.from('loyalty_tiers').select('id', { count: 'exact', head: true });
  if (!count) {
    const { error } = await sb.from('loyalty_tiers').insert([
      { name: 'Bronze', min_points: 0, multiplier: 1.0, color: '#cd7f32', sort_order: 0 },
      { name: 'Silver', min_points: 500, multiplier: 1.2, color: '#a8a9ad', sort_order: 1 },
      { name: 'Gold', min_points: 1000, multiplier: 1.5, color: '#ffd700', sort_order: 2 },
    ]);
    if (error) throw new Error('loyalty_tiers: ' + error.message);
    log('✓ tiers created');
  } else log('• tiers exist', count);
}

// 4) Stamp card
{
  const { data } = await sb.from('stamp_cards').select('id').eq('name', 'Coffee Club 5+1').maybeSingle();
  if (!data) {
    const { error } = await sb.from('stamp_cards').insert({
      name: 'Coffee Club 5+1', required_count: 5, reward_text: '1 free coffee',
      product_scope: { scope: 'all' }, is_active: true,
    });
    if (error) throw new Error('stamp_cards: ' + error.message);
    log('✓ stamp card created');
  } else log('• stamp card exists');
}

// 4b) Rewards (redeemable at checkout)
{
  const { count } = await sb.from('rewards').select('id', { count: 'exact', head: true });
  if (!count) {
    const { error } = await sb.from('rewards').insert([
      { title: '$1 off',       reward_type: 'discount',  cost_points: 100, config: { amount: 1 },   is_active: true },
      { title: '$3 off',       reward_type: 'discount',  cost_points: 250, config: { amount: 3 },   is_active: true },
      { title: 'Free coffee',  reward_type: 'free_item', cost_points: 400, config: { amount: 4.5 }, is_active: true },
    ]);
    if (error) throw new Error('rewards: ' + error.message);
    log('✓ rewards created');
  } else log('• rewards exist');
}

// 4c) Brand settings (single row, white-label theming)
{
  const { data } = await sb.from('brand_settings').select('id').eq('id', 1).maybeSingle();
  if (!data) {
    const { error } = await sb.from('brand_settings').insert({
      id: 1,
      brand_name: 'Antigravity Coffee Co.',
      tagline: 'Experience gravity-defying flavor.',
      logo_emoji: '☕',
      accent_color: '#f87b32',
      accent_hover: '#e56820',
      bg_color: '#f7f9fa',
      default_language: 'en',
    });
    if (error) throw new Error('brand_settings: ' + error.message);
    log('✓ brand_settings created');
  } else log('• brand_settings exists');
}

// 5) Products + 6) branch_products
{
  const { count } = await sb.from('products').select('id', { count: 'exact', head: true });
  if (!count) {
    const seed = [
      { name: 'Signature Iced Coffee', description: 'Cold-pressed espresso over crystal-clear ice.', base_price: 4.50, category: 'Cold', image_url: '/ice_coffee_1781694763159.png', tag: 'Popular', sort_order: 0 },
      { name: 'Zen Matcha Latte', description: 'Stone-ground ceremonial matcha, hand-whisked.', base_price: 5.00, category: 'Cold', image_url: '/matcha_latte_1781694772930.png', tag: 'Popular', sort_order: 1 },
      { name: 'Cozy Hot Cocoa', description: 'Belgian dark chocolate, slow-steamed milk.', base_price: 4.00, category: 'Hot', image_url: '/hot_cocoa_1781694781658.png', tag: null, sort_order: 2 },
      { name: 'Nitro Cold Brew', description: 'Nitrogen-infused for a velvety cascade.', base_price: 5.50, category: 'Cold', image_url: '/hero_coffee.png', tag: 'New', sort_order: 3 },
      { name: 'Vanilla Bean Frappe', description: 'Blended with real vanilla bean & cream.', base_price: 6.00, category: 'Blended', image_url: '/ice_coffee_1781694763159.png', tag: 'Seasonal', sort_order: 4 },
    ];
    const { data: prods, error } = await sb.from('products').insert(seed).select('id, base_price, sort_order');
    if (error) throw new Error('products: ' + error.message);
    log('✓ products created', prods.length);

    const bp = prods.map(p => ({
      branch_id: branch.id, product_id: p.id, price: p.base_price, is_available: true, sort_order: p.sort_order,
    }));
    const { error: bpErr } = await sb.from('branch_products').insert(bp);
    if (bpErr) throw new Error('branch_products: ' + bpErr.message);
    log('✓ branch_products created', bp.length);
  } else log('• products exist', count);
}

log('\nSeed complete.');
