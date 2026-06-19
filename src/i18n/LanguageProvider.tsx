import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useBrand } from '../contexts/BrandContext';
import { TRANSLATIONS, type TransKey } from './translations';
import type { Lang } from '../lib/theme';

const STORAGE_KEY = 'kiosk_lang';
const VALID: Lang[] = ['en', 'ru', 'kk'];

type Vars = Record<string, string | number>;

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Back to the brand's default language (used on idle reset). */
  resetLang: () => void;
  /** Translate a key, interpolating {placeholders} from `vars`. */
  t: (key: TransKey, vars?: Vars) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
  resetLang: () => {},
  t: (key) => key,
});

export const useLanguage = () => useContext(LanguageContext);

function readStored(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && VALID.includes(v as Lang) ? (v as Lang) : null;
  } catch {
    return null;
  }
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`
  );
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const brand = useBrand();
  const [lang, setLangState] = useState<Lang>(() => readStored() ?? brand.defaultLanguage);

  // When the brand's default language arrives from the DB and the visitor hasn't
  // explicitly chosen one, adopt it.
  useEffect(() => {
    if (!readStored()) setLangState(brand.defaultLanguage);
  }, [brand.defaultLanguage]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);

  const resetLang = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setLangState(brand.defaultLanguage);
  }, [brand.defaultLanguage]);

  const t = useCallback(
    (key: TransKey, vars?: Vars) => {
      const dict = TRANSLATIONS[lang] ?? TRANSLATIONS.en;
      return interpolate(dict[key] ?? TRANSLATIONS.en[key] ?? key, vars);
    },
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, resetLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};
