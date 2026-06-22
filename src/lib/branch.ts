import { supabase } from './supabase';

// The kiosk belongs to one branch. Default resolution: VITE_BRANCH_ID if set,
// else the first active branch. A kiosk's own assignment (kiosks.branch_id) can
// override this — see loadBranchById, which updates the active-branch cache.

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  type: string | null;
}

const BRANCH_ID = (import.meta.env.VITE_BRANCH_ID as string) || '';

const SELECT = 'id, name, address, type';

// Holds the ACTIVE branch (the one orders/logs are attributed to).
let cachedBranch: Branch | null = null;

function mapBranch(d: { id: string; name: string; address: string | null; type: string | null }): Branch {
  return { id: d.id, name: d.name, address: d.address ?? null, type: d.type ?? null };
}

export async function loadBranch(): Promise<Branch | null> {
  if (cachedBranch) return cachedBranch;

  let query = supabase.from('branches').select(SELECT).eq('is_active', true);
  query = BRANCH_ID
    ? query.eq('id', BRANCH_ID)
    : query.order('created_at', { ascending: true });

  const { data, error } = await query.limit(1).maybeSingle();

  if (error || !data) {
    console.error('Failed to resolve branch:', error?.message ?? 'no active branch found');
    return null;
  }

  cachedBranch = mapBranch(data);
  return cachedBranch;
}

// Load a specific branch by id (used when a kiosk is bound to a branch other
// than the default). Updates the active-branch cache so getBranchId() follows it.
export async function loadBranchById(id: string): Promise<Branch | null> {
  const { data, error } = await supabase.from('branches').select(SELECT).eq('id', id).maybeSingle();
  if (error || !data) return null;
  cachedBranch = mapBranch(data);
  return cachedBranch;
}

// All active branches — for the admin "assign this kiosk to a branch" picker.
export async function fetchBranches(): Promise<Branch[]> {
  const { data, error } = await supabase
    .from('branches').select(SELECT).eq('is_active', true).order('name');
  if (error || !data) return [];
  return data.map(mapBranch);
}

// Synchronous accessor for code paths that run after the branch is resolved
// (orders, recognition logging). Returns null until then.
export function getBranchId(): string | null {
  return cachedBranch?.id ?? null;
}

export function getBranch(): Branch | null {
  return cachedBranch;
}
