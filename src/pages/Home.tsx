import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Star, RotateCcw, MapPin, UserX } from 'lucide-react';
import { useFaceRecognition } from '../contexts/FaceRecognitionContext';
import { useLoyaltyStore } from '../store/useLoyaltyStore';
import { getTier } from '../store/useLoyaltyStore';
import { useCartStore } from '../store/useCartStore';
import { fetchUsualOrder, type PastOrder } from '../lib/supabaseService';
import { orderToCartItems, orderSummaryText } from '../lib/reorder';
import { useBrand } from '../contexts/BrandContext';
import { useLanguage } from '../i18n/LanguageProvider';
import { LanguageToggle } from '../components/LanguageToggle';
import { sound } from '../lib/sound';
import { formatTenge } from '../lib/currency';
import './Home.css';

const TIER_EMOJI: Record<string, string> = { Bronze: '🥉', Silver: '🥈', Gold: '🥇' };

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { scanState, products, branch, kiosk, clearCapturedFace } = useFaceRecognition();
  const { currentCustomer, clearCurrentCustomer } = useLoyaltyStore();
  const addItem = useCartStore(s => s.addItem);
  const clearCart = useCartStore(s => s.clearCart);
  const brand = useBrand();
  const { t } = useLanguage();
  const [usual, setUsual] = useState<PastOrder | null>(null);

  const recognized = scanState === 'recognized' && !!currentCustomer;

  // Load the recognised member's "usual" so they can repeat it in one tap.
  useEffect(() => {
    if (recognized && currentCustomer) {
      fetchUsualOrder(currentCustomer.id).then(setUsual);
    } else {
      setUsual(null);
    }
  }, [recognized, currentCustomer?.id]);

  const orderUsual = (e: React.MouseEvent) => {
    e.stopPropagation();   // don't trigger the container's "go to menu"
    if (!usual) return;
    orderToCartItems(usual, products).forEach(addItem);
    sound.tap();
    navigate('/cart');
  };

  const handleNotMe = (e: React.MouseEvent) => {
    e.stopPropagation();
    sound.tap();
    clearCurrentCustomer();
    clearCapturedFace();
    clearCart();
  };
  const firstName = currentCustomer?.name.split(' ')[0] ?? '';
  const initials = currentCustomer
    ? currentCustomer.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '';
  const tier = currentCustomer ? getTier(currentCustomer.points) : 'Bronze';
  const featuredDeal = currentCustomer?.deals?.[0];

  // Pre-compute scatter offsets so each letter "assembles" from a random
  // position. Memoized per name so it doesn't re-randomize on re-render.
  const letters = useMemo(
    () =>
      firstName.split('').map((ch) => ({
        ch,
        x: Math.random() * 160 - 80,
        y: Math.random() * 120 - 60,
        rot: Math.random() * 80 - 40,
      })),
    [firstName]
  );

  // A ring of particles that burst outward around the avatar.
  const particles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const angle = (i / 14) * Math.PI * 2;
        const dist = 90 + Math.random() * 50;
        return {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          delay: 0.1 + Math.random() * 0.3,
          size: 4 + Math.random() * 6,
        };
      }),
    [currentCustomer?.id]
  );

  return (
    <div className="home-container" onClick={() => { sound.tap(); navigate('/menu'); }}>
      <AnimatePresence>
        {recognized && (
          <motion.div
            className="home-not-me"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <div className="not-me-container">
              <button className="not-me-btn" onClick={handleNotMe}>
                <UserX size={15} />
                <span>{t('home.notMe')}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="home-lang">
        <LanguageToggle variant="light" />
      </div>
      <div className="home-content">
        <AnimatePresence mode="wait">
          {recognized ? (
            /* ───────── Recognized: the magic greeting ───────── */
            <motion.div
              key="recognized"
              className="brand-welcome"
              initial={{ opacity: 0, scale: 0.92, filter: 'blur(12px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 1.04, filter: 'blur(12px)' }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="welcome-avatar-stage">
                {/* particle burst */}
                {particles.map((p, i) => (
                  <motion.span
                    key={i}
                    className="welcome-particle"
                    style={{ width: p.size, height: p.size }}
                    initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                    animate={{ x: p.x, y: p.y, opacity: [0, 1, 0], scale: [0, 1, 0.6] }}
                    transition={{ delay: p.delay, duration: 1.1, ease: 'easeOut' }}
                  />
                ))}

                {/* glow burst */}
                <motion.span
                  className="welcome-glow"
                  initial={{ scale: 0, opacity: 0.8 }}
                  animate={{ scale: 2.2, opacity: 0 }}
                  transition={{ duration: 0.9, ease: 'easeOut' }}
                />

                <motion.div
                  className="welcome-avatar"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 14 }}
                >
                  <span className="welcome-avatar-initials">{initials}</span>
                  <span className="welcome-avatar-ring" />
                </motion.div>
              </div>

              <motion.p
                className="welcome-eyebrow"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                {t('home.welcomeBack')}
              </motion.p>

              <h1 className="welcome-title welcome-name" aria-label={firstName}>
                {letters.map((l, i) => (
                  <motion.span
                    key={i}
                    className="reveal-letter"
                    aria-hidden="true"
                    initial={{ opacity: 0, x: l.x, y: l.y, rotate: l.rot, filter: 'blur(10px)' }}
                    animate={{ opacity: 1, x: 0, y: 0, rotate: 0, filter: 'blur(0px)' }}
                    transition={{ delay: 0.35 + i * 0.06, type: 'spring', stiffness: 180, damping: 14 }}
                  >
                    {l.ch === ' ' ? ' ' : l.ch}
                  </motion.span>
                ))}
              </h1>

              <motion.div
                className="welcome-stats"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
              >
                <span className="welcome-points">
                  <Star size={18} fill="currentColor" />
                  {currentCustomer!.points.toLocaleString()} {t('common.pts')}
                </span>
                <span className="welcome-tier">{TIER_EMOJI[tier]} {tier}</span>
              </motion.div>

              {featuredDeal && (
                <motion.div
                  className="welcome-deal"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                >
                  <span className="welcome-deal-emoji">{featuredDeal.emoji}</span>
                  {featuredDeal.title}
                </motion.div>
              )}
            </motion.div>
          ) : (
            /* ───────── Default attract screen ───────── */
            <motion.div
              key="default"
              className="brand-welcome"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, filter: 'blur(8px)' }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            >
              <motion.div
                className="brand-icon"
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              >
                {brand.logoUrl
                  ? <img src={brand.logoUrl} alt={brand.brandName} className="brand-logo-img" />
                  : brand.logoEmoji}
              </motion.div>
              <h1 className="welcome-title">{brand.brandName}</h1>
              <p className="welcome-subtitle">{brand.tagline}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="tap-to-start"
        >
          <motion.button
            className="start-btn glass-panel"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <span className="text-gradient">
              {recognized ? t('home.startOrder', { name: firstName }) : t('home.tapToOrder')}
            </span>
            <ChevronRight className="start-icon" />
          </motion.button>

          {recognized && usual && (
            <motion.button
              className="usual-btn"
              onClick={orderUsual}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              whileTap={{ scale: 0.96 }}
            >
              <RotateCcw size={18} />
              <span className="usual-btn-text">
                <span className="usual-btn-label">{t('home.reorderUsual')}</span>
                <span className="usual-btn-sub">{orderSummaryText(usual)} · {formatTenge(usual.total)}</span>
              </span>
            </motion.button>
          )}
        </motion.div>
      </div>

      {(branch?.name || kiosk?.code) && (
        <motion.div
          className="home-location"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
        >
          {branch?.name && (
            <span className="home-location-place">
              <MapPin size={16} strokeWidth={2.4} />
              {branch.name}{branch.address ? <span className="home-location-addr"> · {branch.address}</span> : null}
            </span>
          )}
          {kiosk?.code && (
            <span className="home-location-code">{kiosk.label ? `${kiosk.label} · ` : ''}{kiosk.code}</span>
          )}
        </motion.div>
      )}
    </div>
  );
};
