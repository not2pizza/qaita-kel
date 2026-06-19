import React from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '../i18n/LanguageProvider';
import { LANGUAGES } from '../i18n/translations';
import { sound } from '../lib/sound';
import './LanguageToggle.css';

interface Props {
  /** 'light' for dark backgrounds (attract screen), 'dark' for light UI. */
  variant?: 'light' | 'dark';
  className?: string;
}

export const LanguageToggle: React.FC<Props> = ({ variant = 'dark', className = '' }) => {
  const { lang, setLang } = useLanguage();

  return (
    <div className={`lang-toggle lang-toggle-${variant} ${className}`} role="group" aria-label="Language">
      {LANGUAGES.map(({ code, label }) => {
        const active = lang === code;
        return (
          <button
            key={code}
            className={`lang-opt ${active ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); sound.tap(); setLang(code); }}
            aria-pressed={active}
          >
            {active && <motion.span layoutId="lang-active-pill" className="lang-active-pill" transition={{ type: 'spring', stiffness: 320, damping: 28 }} />}
            <span className="lang-opt-label">{label}</span>
          </button>
        );
      })}
    </div>
  );
};
