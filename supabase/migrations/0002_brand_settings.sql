-- Antigravity Coffee — brand_settings (white-label theming)
-- =====================================================================
-- Single-row, company-wide branding the owner panel edits. The kiosk reads
-- this at startup and applies it as CSS variables + brand copy, so the same
-- build can be re-skinned per coffee shop without a code change.
-- Mirrors the single-row pattern of loyalty_settings.

create table if not exists brand_settings (
  id               int primary key default 1 check (id = 1),
  brand_name       text default 'Antigravity Coffee Co.',
  tagline          text default 'Experience gravity-defying flavor.',
  logo_emoji       text default '☕',           -- fallback mark when no logo image
  logo_url         text,                        -- optional uploaded logo
  accent_color     text default '#f87b32',      -- --primary-accent
  accent_hover     text default '#e56820',      -- --primary-hover
  bg_color         text default '#f7f9fa',      -- --bg-color
  hero_image_url   text,                        -- attract-screen background
  default_language text default 'en',           -- 'en' | 'ru' | 'kk'
  settings         jsonb default '{}',          -- extensible (fonts, blob colors, …)
  updated_at       timestamptz default now()
);

insert into brand_settings (id) values (1) on conflict do nothing;
