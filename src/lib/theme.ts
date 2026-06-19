// White-label theming. The kiosk loads brand_settings at startup and applies it
// as CSS variables + brand copy, so the same build re-skins per coffee shop.

export type Lang = 'en' | 'ru' | 'kk';

export interface BrandSettings {
  brandName: string;
  tagline: string;
  logoEmoji: string;
  logoUrl: string | null;
  accentColor: string;
  accentHover: string;
  bgColor: string;
  heroImageUrl: string | null;
  defaultLanguage: Lang;
}

// Matches the current hardcoded Antigravity look — used until (and if) the DB
// provides overrides, so nothing flashes or breaks when brand_settings is empty.
export const DEFAULT_BRAND: BrandSettings = {
  brandName: 'Antigravity Coffee Co.',
  tagline: 'Experience gravity-defying flavor.',
  logoEmoji: '☕',
  logoUrl: null,
  accentColor: '#f87b32',
  accentHover: '#e56820',
  bgColor: '#f7f9fa',
  heroImageUrl: null,
  defaultLanguage: 'en',
};

// "#f87b32" → "248, 123, 50" (for rgba(var(--accent-rgb), a) in CSS). Returns
// the brand's default rgb if the string isn't a valid 6-digit hex.
function hexToRgb(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '248, 123, 50';
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

// Push the brand onto :root as CSS variables. Component styles already read these
// tokens, so colors update app-wide with no per-component work.
export function applyTheme(brand: BrandSettings) {
  const root = document.documentElement.style;
  root.setProperty('--primary-accent', brand.accentColor);
  root.setProperty('--primary-hover', brand.accentHover);
  root.setProperty('--bg-color', brand.bgColor);
  root.setProperty('--accent-rgb', hexToRgb(brand.accentColor));
}
