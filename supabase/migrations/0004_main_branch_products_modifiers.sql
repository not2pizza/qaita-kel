-- ============================================================================
-- Main Branch menu + reusable modifiers
--
-- Idempotent seed for the requested product list. It creates the modifier
-- catalog if the DB does not have it yet, links every active product to the
-- Main/Main Branch row, and attaches modifier groups through the generic
-- product_modifier_groups table.
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists modifier_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  selection_type text not null check (selection_type in ('single', 'multiple')),
  min_selections integer not null default 0 check (min_selections >= 0),
  max_selections integer not null default 1 check (max_selections > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists modifier_options (
  id uuid primary key default gen_random_uuid(),
  modifier_group_id uuid not null references modifier_groups(id) on delete cascade,
  name text not null,
  price_delta numeric not null default 0,
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists product_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  modifier_group_id uuid not null references modifier_groups(id) on delete cascade,
  min_selections integer check (min_selections is null or min_selections >= 0),
  max_selections integer check (max_selections is null or max_selections > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists branch_modifier_options (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  modifier_option_id uuid not null references modifier_options(id) on delete cascade,
  price_delta numeric,
  is_available boolean not null default true,
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists order_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  modifier_group_id uuid references modifier_groups(id) on delete set null,
  modifier_option_id uuid references modifier_options(id) on delete set null,
  group_name text not null,
  option_name text not null,
  unit_price_delta numeric not null default 0,
  quantity integer not null default 1 check (quantity > 0),
  total_price_delta numeric generated always as (unit_price_delta * quantity) stored,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_modifier_options_group_name
  on modifier_options (modifier_group_id, name);

create unique index if not exists uq_product_modifier_groups_product_group
  on product_modifier_groups (product_id, modifier_group_id);

create unique index if not exists uq_branch_modifier_options_branch_option
  on branch_modifier_options (branch_id, modifier_option_id);

do $$
declare
  main_branch_id uuid;
  has_branch_slug boolean;
  p record;
  g_size uuid;
  g_milk uuid;
  g_sweetness uuid;
  g_ice uuid;
  g_syrup uuid;
  g_coffee_addons uuid;
  g_matcha_addons uuid;
  g_tea_addons uuid;
begin
  select id
    into main_branch_id
  from branches
  where lower(name) in ('main branch', 'main')
  order by case when lower(name) = 'main branch' then 0 else 1 end, created_at
  limit 1;

  if main_branch_id is null then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'branches'
        and column_name = 'slug'
    ) into has_branch_slug;

    if has_branch_slug then
      execute
        'insert into branches (name, type, open_time, close_time, slug)
         values ($1, $2, $3, $4, $5)
         returning id'
      into main_branch_id
      using 'Main Branch', 'no_kitchen', '07:00'::time, '21:00'::time, 'main-branch';
    else
      insert into branches (name, type, open_time, close_time)
      values ('Main Branch', 'no_kitchen', '07:00'::time, '21:00'::time)
      returning id into main_branch_id;
    end if;
  end if;

  -- Requested products. Prices are placeholder KZT values; edit base_price if
  -- your real menu prices differ.
  insert into products (name, description, base_price, category, image_url, tag, is_active, sort_order)
  select *
  from (
    values
      ('Айс Матча Латте', 'Холодный матча латте с молоком и льдом.', 1800::numeric, 'Cold', '/products/iced-matcha-latte.jpeg', 'Popular', true, 10),
      ('Айс Какао', 'Холодное какао на молоке со льдом.', 1600::numeric, 'Cold', '/products/iced-cocoa.jpeg', null, true, 20),
      ('Матча Тоник', 'Матча с тоником и льдом.', 1900::numeric, 'Cold', '/products/matcha-tonic.jpeg', 'New', true, 30),
      ('Айс Ти Манго-Имбирь', 'Холодный чай с манго и имбирем.', 1700::numeric, 'Cold', '/products/mango-ginger-iced-tea.jpeg', null, true, 40),
      ('Эспрессо Тоник', 'Эспрессо с тоником и льдом.', 1800::numeric, 'Cold', '/products/espresso-tonic.jpeg', 'Popular', true, 50),
      ('Бамбл Кофе', 'Холодный кофе с цитрусовой основой.', 1900::numeric, 'Cold', '/products/bumble-coffee.jpeg', null, true, 60),
      ('Лимонад Тропический', 'Освежающий тропический лимонад.', 1700::numeric, 'Cold', '/products/tropical-lemonade.jpeg', 'Seasonal', true, 70),
      ('Латте', 'Классический латте на молоке.', 1600::numeric, 'Hot', '/products/latte.jpeg', null, true, 80),
      ('Манго Латте', 'Латте с манго.', 1900::numeric, 'Hot', '/products/mango-latte.jpeg', 'New', true, 90),
      ('Раф на Кокосовом Молоке', 'Раф на кокосовом молоке.', 2100::numeric, 'Hot', '/products/coconut-raf.jpeg', 'Popular', true, 100),
      ('Ванильный Протеиновый Латте', 'Ванильный латте с протеином.', 2300::numeric, 'Hot', '/products/vanilla-protein-latte.jpeg', 'New', true, 110)
  ) as seed(name, description, base_price, category, image_url, tag, is_active, sort_order)
  where not exists (
    select 1
    from products p
    where p.name = seed.name
  );

  -- If a previous paste used category names like "cold_drinks", normalize the
  -- requested products to the app's existing menu filter categories.
  update products
  set category = case
      when name in (
        'Айс Матча Латте',
        'Айс Какао',
        'Матча Тоник',
        'Айс Ти Манго-Имбирь',
        'Эспрессо Тоник',
        'Бамбл Кофе',
        'Лимонад Тропический'
      ) then 'Cold'
      else 'Hot'
    end,
    is_active = true,
    image_url = case name
      when 'Айс Матча Латте' then '/products/iced-matcha-latte.jpeg'
      when 'Айс Какао' then '/products/iced-cocoa.jpeg'
      when 'Матча Тоник' then '/products/matcha-tonic.jpeg'
      when 'Айс Ти Манго-Имбирь' then '/products/mango-ginger-iced-tea.jpeg'
      when 'Эспрессо Тоник' then '/products/espresso-tonic.jpeg'
      when 'Бамбл Кофе' then '/products/bumble-coffee.jpeg'
      when 'Лимонад Тропический' then '/products/tropical-lemonade.jpeg'
      when 'Латте' then '/products/latte.jpeg'
      when 'Манго Латте' then '/products/mango-latte.jpeg'
      when 'Раф на Кокосовом Молоке' then '/products/coconut-raf.jpeg'
      when 'Ванильный Протеиновый Латте' then '/products/vanilla-protein-latte.jpeg'
      else image_url
    end,
    sort_order = case name
      when 'Айс Матча Латте' then 10
      when 'Айс Какао' then 20
      when 'Матча Тоник' then 30
      when 'Айс Ти Манго-Имбирь' then 40
      when 'Эспрессо Тоник' then 50
      when 'Бамбл Кофе' then 60
      when 'Лимонад Тропический' then 70
      when 'Латте' then 80
      when 'Манго Латте' then 90
      when 'Раф на Кокосовом Молоке' then 100
      when 'Ванильный Протеиновый Латте' then 110
      else sort_order
    end
  where name in (
    'Айс Матча Латте',
    'Айс Какао',
    'Матча Тоник',
    'Айс Ти Манго-Имбирь',
    'Эспрессо Тоник',
    'Бамбл Кофе',
    'Лимонад Тропический',
    'Латте',
    'Манго Латте',
    'Раф на Кокосовом Молоке',
    'Ванильный Протеиновый Латте'
  );

  -- Every active product is sold in the main branch.
  insert into branch_products (branch_id, product_id, price, is_available, sort_order)
  select main_branch_id, p.id, p.base_price, true, p.sort_order
  from products p
  where p.is_active is true
    and not exists (
      select 1
      from branch_products bp
      where bp.branch_id = main_branch_id
        and bp.product_id = p.id
    );

  update branch_products bp
  set is_available = true,
      price = coalesce(bp.price, p.base_price),
      sort_order = p.sort_order
  from products p
  where bp.branch_id = main_branch_id
    and bp.product_id = p.id
    and p.is_active is true;

  insert into modifier_groups (name, selection_type, min_selections, max_selections, sort_order)
  select 'Размер', 'single', 1, 1, 10
  where not exists (select 1 from modifier_groups where name = 'Размер');
  select id into g_size from modifier_groups where name = 'Размер' order by created_at limit 1;

  insert into modifier_groups (name, selection_type, min_selections, max_selections, sort_order)
  select 'Молоко', 'single', 1, 1, 20
  where not exists (select 1 from modifier_groups where name = 'Молоко');
  select id into g_milk from modifier_groups where name = 'Молоко' order by created_at limit 1;

  insert into modifier_groups (name, selection_type, min_selections, max_selections, sort_order)
  select 'Сладость', 'single', 1, 1, 30
  where not exists (select 1 from modifier_groups where name = 'Сладость');
  select id into g_sweetness from modifier_groups where name = 'Сладость' order by created_at limit 1;

  insert into modifier_groups (name, selection_type, min_selections, max_selections, sort_order)
  select 'Лед', 'single', 1, 1, 40
  where not exists (select 1 from modifier_groups where name = 'Лед');
  select id into g_ice from modifier_groups where name = 'Лед' order by created_at limit 1;

  insert into modifier_groups (name, selection_type, min_selections, max_selections, sort_order)
  select 'Сироп', 'multiple', 0, 3, 50
  where not exists (select 1 from modifier_groups where name = 'Сироп');
  select id into g_syrup from modifier_groups where name = 'Сироп' order by created_at limit 1;

  insert into modifier_groups (name, selection_type, min_selections, max_selections, sort_order)
  select 'Кофейные добавки', 'multiple', 0, 3, 60
  where not exists (select 1 from modifier_groups where name = 'Кофейные добавки');
  select id into g_coffee_addons from modifier_groups where name = 'Кофейные добавки' order by created_at limit 1;

  insert into modifier_groups (name, selection_type, min_selections, max_selections, sort_order)
  select 'Матча добавки', 'multiple', 0, 2, 70
  where not exists (select 1 from modifier_groups where name = 'Матча добавки');
  select id into g_matcha_addons from modifier_groups where name = 'Матча добавки' order by created_at limit 1;

  insert into modifier_groups (name, selection_type, min_selections, max_selections, sort_order)
  select 'Чайные добавки', 'multiple', 0, 3, 80
  where not exists (select 1 from modifier_groups where name = 'Чайные добавки');
  select id into g_tea_addons from modifier_groups where name = 'Чайные добавки' order by created_at limit 1;

  insert into modifier_options (modifier_group_id, name, price_delta, is_default, sort_order)
  values
    (g_size, 'S', -200, false, 10),
    (g_size, 'M', 0, true, 20),
    (g_size, 'L', 300, false, 30)
  on conflict (modifier_group_id, name) do update
    set price_delta = excluded.price_delta,
        is_default = excluded.is_default,
        sort_order = excluded.sort_order,
        is_active = true;

  insert into modifier_options (modifier_group_id, name, price_delta, is_default, sort_order)
  values
    (g_milk, 'Обычное молоко', 0, true, 10),
    (g_milk, 'Безлактозное молоко', 250, false, 20),
    (g_milk, 'Кокосовое молоко', 300, false, 30),
    (g_milk, 'Овсяное молоко', 300, false, 40),
    (g_milk, 'Миндальное молоко', 350, false, 50)
  on conflict (modifier_group_id, name) do update
    set price_delta = excluded.price_delta,
        is_default = excluded.is_default,
        sort_order = excluded.sort_order,
        is_active = true;

  insert into modifier_options (modifier_group_id, name, price_delta, is_default, sort_order)
  values
    (g_sweetness, 'Без сахара', 0, false, 10),
    (g_sweetness, '50%', 0, false, 20),
    (g_sweetness, 'Стандарт', 0, true, 30),
    (g_sweetness, 'Слаще', 0, false, 40)
  on conflict (modifier_group_id, name) do update
    set price_delta = excluded.price_delta,
        is_default = excluded.is_default,
        sort_order = excluded.sort_order,
        is_active = true;

  insert into modifier_options (modifier_group_id, name, price_delta, is_default, sort_order)
  values
    (g_ice, 'Без льда', 0, false, 10),
    (g_ice, 'Мало льда', 0, false, 20),
    (g_ice, 'Стандарт', 0, true, 30),
    (g_ice, 'Много льда', 0, false, 40)
  on conflict (modifier_group_id, name) do update
    set price_delta = excluded.price_delta,
        is_default = excluded.is_default,
        sort_order = excluded.sort_order,
        is_active = true;

  insert into modifier_options (modifier_group_id, name, price_delta, is_default, sort_order)
  values
    (g_syrup, 'Ваниль', 200, false, 10),
    (g_syrup, 'Карамель', 200, false, 20),
    (g_syrup, 'Кокос', 200, false, 30),
    (g_syrup, 'Манго', 200, false, 40)
  on conflict (modifier_group_id, name) do update
    set price_delta = excluded.price_delta,
        is_default = excluded.is_default,
        sort_order = excluded.sort_order,
        is_active = true;

  insert into modifier_options (modifier_group_id, name, price_delta, is_default, sort_order)
  values
    (g_coffee_addons, 'Дополнительный шот эспрессо', 300, false, 10),
    (g_coffee_addons, 'Без кофеина', 0, false, 20),
    (g_coffee_addons, 'Протеин', 500, false, 30)
  on conflict (modifier_group_id, name) do update
    set price_delta = excluded.price_delta,
        is_default = excluded.is_default,
        sort_order = excluded.sort_order,
        is_active = true;

  insert into modifier_options (modifier_group_id, name, price_delta, is_default, sort_order)
  values
    (g_matcha_addons, 'Дополнительная матча', 400, false, 10)
  on conflict (modifier_group_id, name) do update
    set price_delta = excluded.price_delta,
        is_default = excluded.is_default,
        sort_order = excluded.sort_order,
        is_active = true;

  insert into modifier_options (modifier_group_id, name, price_delta, is_default, sort_order)
  values
    (g_tea_addons, 'Манго', 200, false, 10),
    (g_tea_addons, 'Имбирь', 200, false, 20),
    (g_tea_addons, 'Лимон', 150, false, 30),
    (g_tea_addons, 'Тропический микс', 250, false, 40)
  on conflict (modifier_group_id, name) do update
    set price_delta = excluded.price_delta,
        is_default = excluded.is_default,
        sort_order = excluded.sort_order,
        is_active = true;

  for p in
    select id, name, category
    from products
    where is_active is true
  loop
    insert into product_modifier_groups (product_id, modifier_group_id, sort_order)
    values (p.id, g_size, 10)
    on conflict (product_id, modifier_group_id) do update
      set sort_order = excluded.sort_order;

    insert into product_modifier_groups (product_id, modifier_group_id, sort_order)
    values (p.id, g_sweetness, 30)
    on conflict (product_id, modifier_group_id) do update
      set sort_order = excluded.sort_order;

    if p.category = 'Cold' then
      insert into product_modifier_groups (product_id, modifier_group_id, sort_order)
      values (p.id, g_ice, 40)
      on conflict (product_id, modifier_group_id) do update
        set sort_order = excluded.sort_order;
    end if;

    if p.name ilike '%латте%'
      or p.name ilike '%раф%'
      or p.name ilike '%какао%'
      or p.name ilike '%matcha latte%'
      or p.name ilike '%hot cocoa%'
    then
      insert into product_modifier_groups (product_id, modifier_group_id, sort_order)
      values (p.id, g_milk, 20)
      on conflict (product_id, modifier_group_id) do update
        set sort_order = excluded.sort_order;
    end if;

    if p.name ilike '%кофе%'
      or p.name ilike '%эспрессо%'
      or p.name ilike '%латте%'
      or p.name ilike '%раф%'
      or p.name ilike '%coffee%'
      or p.name ilike '%espresso%'
    then
      insert into product_modifier_groups (product_id, modifier_group_id, sort_order)
      values (p.id, g_coffee_addons, 60)
      on conflict (product_id, modifier_group_id) do update
        set sort_order = excluded.sort_order;
    end if;

    if p.name ilike '%матча%' or p.name ilike '%matcha%' then
      insert into product_modifier_groups (product_id, modifier_group_id, sort_order)
      values (p.id, g_matcha_addons, 70)
      on conflict (product_id, modifier_group_id) do update
        set sort_order = excluded.sort_order;
    end if;

    if p.name ilike '%манго%'
      or p.name ilike '%имбир%'
      or p.name ilike '%лимонад%'
      or p.name ilike '%чай%'
      or p.name ilike '%ти %'
      or p.name ilike '%tea%'
      or p.name ilike '%lemonade%'
    then
      insert into product_modifier_groups (product_id, modifier_group_id, sort_order)
      values (p.id, g_tea_addons, 80)
      on conflict (product_id, modifier_group_id) do update
        set sort_order = excluded.sort_order;
    end if;

    if p.name ilike '%латте%' or p.name ilike '%раф%' or p.name ilike '%какао%' then
      insert into product_modifier_groups (product_id, modifier_group_id, sort_order)
      values (p.id, g_syrup, 50)
      on conflict (product_id, modifier_group_id) do update
        set sort_order = excluded.sort_order;
    end if;
  end loop;

  -- Branch-level rows make every modifier explicitly available at Main Branch.
  insert into branch_modifier_options (branch_id, modifier_option_id, price_delta, is_available)
  select main_branch_id, mo.id, null, true
  from modifier_options mo
  where mo.is_active is true
    and not exists (
      select 1
      from branch_modifier_options bmo
      where bmo.branch_id = main_branch_id
        and bmo.modifier_option_id = mo.id
    );

  update rewards
  set title = '500 ₸ off',
      config = coalesce(config, '{}'::jsonb) || '{"amount": 500}'::jsonb
  where title = '$1 off';

  update rewards
  set title = '1 000 ₸ off',
      config = coalesce(config, '{}'::jsonb) || '{"amount": 1000}'::jsonb
  where title = '$3 off';

  update rewards
  set config = coalesce(config, '{}'::jsonb) || '{"amount": 1800}'::jsonb
  where title = 'Free coffee'
    and reward_type = 'free_item'
    and coalesce((config->>'amount')::numeric, 0) < 100;
end $$;
