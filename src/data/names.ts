// Neutral, gently-interesting names offered as a one-tap "Surprise me" pick at
// sign-up, for people who don't want to type a name. Placeholder list — the
// owner will supply the real curated list later.
export const RANDOM_NAMES = [
  'Nova', 'Sage', 'River', 'Phoenix', 'Rowan',
  'Wren', 'Onyx', 'Indigo', 'Juniper', 'Marlowe',
];

export function pickRandomName(exclude?: string): string {
  const pool = exclude ? RANDOM_NAMES.filter(n => n !== exclude) : RANDOM_NAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}
