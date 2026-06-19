import { supabase } from './supabase';

// The kiosk belongs to one branch. Single-company setup: by default we use the
// only active branch. For multi-branch later, set VITE_BRANCH_ID to a specific
// branches.id. (The branches table has no slug, per the schema.)

export interface Branch {
  id: string;
  name: string;
  type: string | null;
}

const BRANCH_ID = (import.meta.env.VITE_BRANCH_ID as string) || '';

let cachedBranch: Branch | null = null;

export async function loadBranch(): Promise<Branch | null> {
  if (cachedBranch) return cachedBranch;

  let query = supabase
    .from('branches')
    .select('id, name, type')
    .eq('is_active', true);

  query = BRANCH_ID
    ? query.eq('id', BRANCH_ID)
    : query.order('created_at', { ascending: true });

  const { data, error } = await query.limit(1).maybeSingle();

  if (error || !data) {
    console.error('Failed to resolve branch:', error?.message ?? 'no active branch found');
    return null;
  }

  cachedBranch = data as Branch;
  return cachedBranch;
}

// Synchronous accessor for code paths that run after loadBranch() has resolved
// (orders, recognition logging). Returns null until the branch is loaded.
export function getBranchId(): string | null {
  return cachedBranch?.id ?? null;
}

export function getBranch(): Branch | null {
  return cachedBranch;
}
