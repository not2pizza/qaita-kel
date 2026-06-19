-- ============================================================================
-- Antigravity Coffee — initial schema (single company, multiple branches)
-- Run this in the Supabase SQL editor (or `supabase db push`).
--
-- Model: ONE company, many branches. Customers + the loyalty program are
-- shared across all branches; orders and recognition logs record the branch.
--
-- SECURITY NOTE: the kiosk uses the anon key and must read face embeddings to
-- recognise customers, so RLS is left permissive for now. Lock this down in the
-- owner-panel phase (Supabase Auth + staff-only policies on customer/biometric
-- data). See the plan file.
-- ============================================================================

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Branches & staff
-- ---------------------------------------------------------------------------
create table if not exists branches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text,
  type        text default 'no_kitchen',          -- 'kitchen' | 'no_kitchen'
  open_time   time,
  close_time  time,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

create table if not exists staff (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  branch_id  uuid references branches(id) on delete set null,   -- null = all branches
  role       text not null default 'owner',                     -- owner | manager | staff
  is_active  boolean default true,
  created_at timestamptz default now(),
  unique (user_id)
);

-- ---------------------------------------------------------------------------
-- Loyalty configuration (company-wide; flexible/modular)
-- ---------------------------------------------------------------------------
create table if not exists loyalty_tiers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  min_points  int not null,
  multiplier  numeric(4,2) default 1.0,
  color       text,
  perks       jsonb default '[]',
  sort_order  int default 0
);

create table if not exists loyalty_settings (
  id                 uuid primary key default gen_random_uuid(),
  branch_id          uuid references branches(id) on delete cascade,  -- null = global
  points_enabled     boolean default true,
  tiers_enabled      boolean default true,
  stamps_enabled     boolean default false,
  points_per_dollar  numeric(6,2) default 10,
  welcome_bonus      int default 50,
  points_expiry_days int,
  settings           jsonb default '{}',
  updated_at         timestamptz default now()
);

create table if not exists stamp_cards (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  required_count int not null,
  reward_text    text not null,
  product_scope  jsonb default '{}',
  is_active      boolean default true,
  created_at     timestamptz default now()
);

create table if not exists loyalty_rules (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  trigger    text not null,            -- order_paid | birthday | first_visit | manual
  conditions jsonb default '{}',
  effect     jsonb not null,
  starts_at  timestamptz,
  ends_at    timestamptz,
  is_active  boolean default true
);

create table if not exists rewards (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  reward_type text default 'points',   -- discount | free_item | points | custom
  cost_points int not null,
  config      jsonb default '{}',
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Customers, faces, loyalty progress (shared across branches)
-- ---------------------------------------------------------------------------
create table if not exists customers (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  phone           text,
  bonus_points    int default 0,
  current_tier_id uuid references loyalty_tiers(id) on delete set null,
  birthday        date,
  is_active       boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create table if not exists face_profiles (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references customers(id) on delete cascade,
  face_embedding  jsonb not null,                  -- number[][] (128-dim descriptors)
  embedding_model text default 'face-api/tinyface-128',
  consent_given   boolean default false,
  is_active       boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create table if not exists customer_stamps (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers(id) on delete cascade,
  stamp_card_id uuid not null references stamp_cards(id) on delete cascade,
  count         int default 0,
  redeemed_at   timestamptz,
  updated_at    timestamptz default now(),
  unique (customer_id, stamp_card_id)
);

-- ---------------------------------------------------------------------------
-- Menu (company catalog + per-branch price/availability)
-- ---------------------------------------------------------------------------
create table if not exists products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  base_price  numeric(10,2) not null,
  category    text not null,                       -- Hot | Cold | Blended
  image_url   text,
  video_url   text,
  tag         text,                                -- Popular | New | Seasonal | null
  is_active   boolean default true,
  sort_order  int default 0,
  created_at  timestamptz default now()
);

create table if not exists branch_products (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references branches(id) on delete cascade,
  product_id     uuid not null references products(id) on delete cascade,
  price          numeric(10,2),                    -- null = use products.base_price
  is_available   boolean default true,
  stock_quantity int,                              -- null = unlimited
  sort_order     int default 0,
  unique (branch_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table if not exists orders (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references branches(id),
  customer_id    uuid references customers(id) on delete set null,  -- null = walk-in
  customer_name  text,
  subtotal       numeric(10,2) not null,
  discount_total numeric(10,2) default 0,
  total          numeric(10,2) not null,
  points_earned  int default 0,
  points_redeemed int default 0,
  status         boolean default true,             -- true = completed/paid
  payment_method text,
  created_at     timestamptz default now()
);

create table if not exists order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  name       text not null,                        -- snapshot
  unit_price numeric(10,2) not null,
  quantity   int not null default 1,
  options    jsonb,
  line_total numeric(10,2) not null
);

create table if not exists bonus_transactions (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  order_id    uuid references orders(id) on delete set null,
  type        text not null,                        -- earned|redeemed|adjusted|expired|refunded
  points      int not null,
  reason      text,
  expires_at  timestamptz,
  created_at  timestamptz default now()
);

create table if not exists face_recognition_logs (
  id               uuid primary key default gen_random_uuid(),
  branch_id        uuid references branches(id) on delete set null,
  customer_id      uuid references customers(id) on delete set null,
  similarity_score numeric,
  result           text,                            -- matched|unknown|low_confidence|error
  created_at       timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_orders_branch_created on orders (branch_id, created_at);
create index if not exists idx_orders_customer on orders (customer_id);
create index if not exists idx_order_items_order on order_items (order_id);
create index if not exists idx_bonus_tx_customer on bonus_transactions (customer_id, created_at);
create index if not exists idx_reclogs_branch_created on face_recognition_logs (branch_id, created_at);
create index if not exists idx_branch_products_branch on branch_products (branch_id);
create index if not exists idx_face_profiles_customer on face_profiles (customer_id);

-- ============================================================================
-- SEED DATA
-- ============================================================================
insert into branches (name, type, open_time, close_time)
select 'Main', 'no_kitchen', '07:00', '21:00'
where not exists (select 1 from branches where name = 'Main');

insert into loyalty_tiers (name, min_points, multiplier, color, sort_order) values
  ('Bronze', 0,    1.0, '#cd7f32', 0),
  ('Silver', 500,  1.2, '#a8a9ad', 1),
  ('Gold',   1000, 1.5, '#ffd700', 2)
on conflict do nothing;

insert into loyalty_settings (branch_id, points_enabled, tiers_enabled, stamps_enabled, points_per_dollar, welcome_bonus)
select null, true, true, true, 10, 50
where not exists (select 1 from loyalty_settings where branch_id is null);

insert into stamp_cards (name, required_count, reward_text, product_scope)
select 'Coffee Club 5+1', 5, '1 free coffee', '{"scope":"all"}'::jsonb
where not exists (select 1 from stamp_cards where name = 'Coffee Club 5+1');

-- Products + branch_products for the main branch
with b as (select id from branches where name = 'Main' limit 1),
ins as (
  insert into products (name, description, base_price, category, image_url, tag, sort_order)
  values
    ('Signature Iced Coffee', 'Cold-pressed espresso over crystal-clear ice.', 4.50, 'Cold',    '/ice_coffee_1781694763159.png', 'Popular',  0),
    ('Zen Matcha Latte',      'Stone-ground ceremonial matcha, hand-whisked.', 5.00, 'Cold',    '/matcha_latte_1781694772930.png', 'Popular', 1),
    ('Cozy Hot Cocoa',        'Belgian dark chocolate, slow-steamed milk.',    4.00, 'Hot',     '/hot_cocoa_1781694781658.png',   null,      2),
    ('Nitro Cold Brew',       'Nitrogen-infused for a velvety cascade.',       5.50, 'Cold',    '/hero_coffee.png',               'New',     3),
    ('Vanilla Bean Frappe',   'Blended with real vanilla bean & cream.',       6.00, 'Blended', '/ice_coffee_1781694763159.png',  'Seasonal',4)
  returning id, base_price, sort_order
)
insert into branch_products (branch_id, product_id, price, is_available, sort_order)
select b.id, ins.id, ins.base_price, true, ins.sort_order
from ins cross join b
where not exists (select 1 from branch_products bp where bp.product_id = ins.id);
