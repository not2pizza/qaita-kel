import React, { createContext, useContext, useEffect, useState } from 'react';
import { fetchBrandSettings } from '../lib/supabaseService';
import { DEFAULT_BRAND, applyTheme, type BrandSettings } from '../lib/theme';

const BrandContext = createContext<BrandSettings>(DEFAULT_BRAND);

export const useBrand = () => useContext(BrandContext);

// Loads white-label branding once at startup and applies it as CSS variables.
// Starts from DEFAULT_BRAND (which matches the CSS defaults, so no flash) and
// swaps in the DB values when they arrive.
export const BrandProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [brand, setBrand] = useState<BrandSettings>(DEFAULT_BRAND);

  useEffect(() => {
    let alive = true;
    fetchBrandSettings().then(b => {
      if (!alive) return;
      setBrand(b);
      applyTheme(b);
    });
    return () => { alive = false; };
  }, []);

  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
};
