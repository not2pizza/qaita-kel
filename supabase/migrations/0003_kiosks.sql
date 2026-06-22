-- Antigravity Coffee — kiosks (device fleet identity)
-- =====================================================================
-- Each physical iPad is a "kiosk". One branch can have many kiosks. A kiosk
-- self-registers on first boot (persistent device_id from localStorage) with a
-- generated human-readable `code` shown subtly on screen for managers/devs.
-- The owner/admin panel assigns each kiosk to a branch (sets branch_id) and an
-- optional friendly label ("Front counter", "Drive-thru").

create table if not exists kiosks (
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid references branches(id) on delete set null,  -- assigned by admin; null = unclaimed
  device_id    text unique not null,        -- stable per device (localStorage)
  code         text unique not null,        -- shown on screen, e.g. "K-7F3K"
  label        text,                        -- optional friendly name set by admin
  is_active    boolean default true,
  last_seen_at timestamptz default now(),   -- heartbeat (updated on each boot)
  created_at   timestamptz default now()
);

create index if not exists idx_kiosks_branch on kiosks (branch_id);
