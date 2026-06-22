import { supabase } from './supabase';

// Per-device fleet identity. Each iPad self-registers once and keeps a stable
// device id in localStorage; the admin later binds it to a branch.
export interface Kiosk {
  id: string;            // kiosks.id ('' for the DB-less fallback)
  deviceId: string;
  code: string;          // shown on screen, e.g. "K-7F3K"
  label: string | null;  // friendly name set by admin
  branchId: string | null;
  local?: boolean;       // true when the kiosks table is missing/offline
}

const DEVICE_KEY = 'kiosk_device_id';
// Unambiguous alphabet (no 0/O, 1/I/L) so a manager can read the code aloud.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Stable identifier for this physical device. Survives reloads; lost only if the
// kiosk's storage is cleared (then it re-registers as a new kiosk).
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) { id = uuid(); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  } catch {
    return uuid(); // private mode — ephemeral, but never crash
  }
}

function randomCode(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return `K-${s}`;
}

function fallbackKiosk(deviceId: string, branchId: string | null): Kiosk {
  return {
    id: '', deviceId, branchId, label: null, local: true,
    code: `K-${deviceId.replace(/-/g, '').slice(0, 4).toUpperCase()}`,
  };
}

function mapKiosk(d: {
  id: string; device_id: string; code: string; label: string | null; branch_id: string | null;
}): Kiosk {
  return { id: d.id, deviceId: d.device_id, code: d.code, label: d.label ?? null, branchId: d.branch_id ?? null };
}

const SELECT = 'id, device_id, code, label, branch_id';

// Identify or self-register this device. On first boot it inserts a kiosks row
// with a generated code, assigned to `defaultBranchId`. Returns a local fallback
// (so the kiosk still runs) if the kiosks table is missing or unreachable.
export async function registerKiosk(defaultBranchId: string | null): Promise<Kiosk> {
  const deviceId = getDeviceId();

  const { data: existing, error: selErr } = await supabase
    .from('kiosks').select(SELECT).eq('device_id', deviceId).maybeSingle();

  if (selErr) return fallbackKiosk(deviceId, defaultBranchId); // table missing/offline

  if (existing) {
    // Heartbeat — fire-and-forget so a slow update never blocks startup.
    supabase.from('kiosks')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', existing.id)
      .then(() => {}, () => {});
    return mapKiosk(existing);
  }

  // First boot for this device — create it, retrying on a code collision.
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await supabase
      .from('kiosks')
      .insert({ device_id: deviceId, code: randomCode(), branch_id: defaultBranchId })
      .select(SELECT).single();
    if (!error && data) return mapKiosk(data);

    // Lost a race on device_id — another tab/boot created it first; re-read.
    if (error && /device_id/i.test(error.message)) {
      const { data: again } = await supabase
        .from('kiosks').select(SELECT).eq('device_id', deviceId).maybeSingle();
      if (again) return mapKiosk(again);
    }
    // Otherwise it was likely a code collision → loop and try a fresh code.
  }
  return fallbackKiosk(deviceId, defaultBranchId);
}

// Admin binding: assign this kiosk to a branch and/or set its friendly label.
export async function updateKiosk(
  id: string,
  patch: { branchId?: string | null; label?: string | null },
): Promise<boolean> {
  if (!id) return false;
  const row: Record<string, unknown> = {};
  if ('branchId' in patch) row.branch_id = patch.branchId;
  if ('label' in patch) row.label = patch.label;
  const { error } = await supabase.from('kiosks').update(row).eq('id', id);
  return !error;
}
