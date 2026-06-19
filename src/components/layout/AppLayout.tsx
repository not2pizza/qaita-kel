import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Star, ArrowRight } from 'lucide-react';
import { useCartStore } from '../../store/useCartStore';
import { useLoyaltyStore } from '../../store/useLoyaltyStore';
import { useFaceRecognition } from '../../contexts/FaceRecognitionContext';
import { useBrand } from '../../contexts/BrandContext';
import { useLanguage } from '../../i18n/LanguageProvider';
import { LanguageToggle } from '../LanguageToggle';
import './AppLayout.css';

export const AppLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const cartCount = useCartStore(state => state.getCartCount());
  const cartTotal = useCartStore(state => state.getCartTotal());
  const { currentCustomer } = useLoyaltyStore();
  const { scanState } = useFaceRecognition();
  const brand = useBrand();
  const { t } = useLanguage();

  const pressTimerRef = React.useRef<number | null>(null);
  const [isPressingLogo, setIsPressingLogo] = React.useState(false);

  // Hidden admin: press-and-hold the brand mark for 1s.
  const handleLogoPressStart = () => {
    setIsPressingLogo(true);
    pressTimerRef.current = window.setTimeout(() => {
      setIsPressingLogo(false);
      navigate('/admin');
    }, 1000);
  };
  const handleLogoPressEnd = () => {
    setIsPressingLogo(false);
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
  };

  const recognized = scanState === 'recognized' && !!currentCustomer;
  const onCart = location.pathname === '/cart';

  return (
    <div className="app-layout">
      <main className="main-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, scale: 0.97, filter: 'blur(8px)', y: 10 }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', y: 0 }}
            exit={{ opacity: 0, scale: 1.02, filter: 'blur(8px)', y: -10 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="page-wrapper"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating bottom island — replaces the old left rail. */}
      {!onCart && (
        <motion.div
          className="floating-dock"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26, delay: 0.15 }}
        >
          <motion.button
            className="dock-brand"
            onPointerDown={handleLogoPressStart}
            onPointerUp={handleLogoPressEnd}
            onPointerLeave={handleLogoPressEnd}
            animate={{ scale: isPressingLogo ? 0.82 : 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            title="Hold to open admin"
          >
            {brand.logoUrl
              ? <img src={brand.logoUrl} alt={brand.brandName} className="dock-brand-img" />
              : brand.logoEmoji}
          </motion.button>

          {recognized && (
            <div className="dock-points" title="Your points balance">
              <Star size={14} fill="currentColor" />
              <span className="dock-points-value">{currentCustomer!.points.toLocaleString()}</span>
              <span className="dock-points-label">{t('common.pts')}</span>
            </div>
          )}

          <LanguageToggle variant="dark" className="dock-lang" />

          <div className="dock-spacer" />

          {cartCount > 0 ? (
            <motion.button
              className="dock-cart"
              onClick={() => navigate('/cart')}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              whileTap={{ scale: 0.96 }}
            >
              <span className="dock-cart-icon">
                <ShoppingBag size={20} />
                <span className="dock-cart-badge">{cartCount}</span>
              </span>
              <span className="dock-cart-text">{t('dock.viewOrder')}</span>
              <span className="dock-cart-total">${cartTotal.toFixed(2)}</span>
              <ArrowRight size={18} />
            </motion.button>
          ) : (
            <span className="dock-hint">{t('dock.cartEmpty')}</span>
          )}
        </motion.div>
      )}
    </div>
  );
};
