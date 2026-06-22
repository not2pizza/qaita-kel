import React, { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FaceRecognitionProvider, useFaceRecognition } from './contexts/FaceRecognitionContext';
import { BrandProvider } from './contexts/BrandContext';
import { LanguageProvider, useLanguage } from './i18n/LanguageProvider';
import { useCartStore } from './store/useCartStore';
import { useLoyaltyStore } from './store/useLoyaltyStore';
import { AppLayout } from './components/layout/AppLayout';
import { Home } from './pages/Home';
import { Menu } from './pages/Menu';
import { Cart } from './pages/Cart';
import { CheckoutSuccess } from './pages/CheckoutSuccess';
import { FaceAuth } from './pages/FaceAuth';
import { Enroll } from './pages/Enroll';
import { Admin } from './pages/Admin';

// After a stretch of inactivity, abandon the session and return to the
// attract screen so the next person starts fresh (no inherited cart/identity).
const IDLE_TIMEOUT_MS = 90_000;

const IdleReset: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const clearCart = useCartStore(s => s.clearCart);
  const clearCurrentCustomer = useLoyaltyStore(s => s.clearCurrentCustomer);
  const { clearCapturedFace } = useFaceRecognition();
  const { resetLang } = useLanguage();
  const timerRef = useRef<number | undefined>(undefined);
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;

  useEffect(() => {
    const reset = () => {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        // Already idling on the attract screen — nothing to abandon.
        if (locationRef.current === '/') return;
        clearCart();
        clearCurrentCustomer();
        clearCapturedFace();              // forget the unknown visitor's buffered face
        resetLang();                      // next person starts in the default language
        navigate('/');
      }, IDLE_TIMEOUT_MS);
    };

    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      window.clearTimeout(timerRef.current);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, [navigate, clearCart, clearCurrentCustomer, resetLang]);

  return null;
};

const AnimatedRoutes = () => {
  const location = useLocation();

  const getKey = () => {
    if (location.pathname === '/') return 'home';
    if (location.pathname === '/checkout-success') return 'checkout';
    if (location.pathname === '/face-auth') return 'face-auth';
    if (location.pathname === '/enroll') return 'enroll';
    if (location.pathname === '/admin') return 'admin';
    return 'app';
  };

  return (
    <>
      <IdleReset />
      <div className="ambient-blob blob-1" />
      <div className="ambient-blob blob-2" />
      <AnimatePresence mode="wait">
        <Routes location={location} key={getKey()}>
          <Route path="/" element={<Home />} />
          <Route path="/checkout-success" element={<CheckoutSuccess />} />
          <Route path="/face-auth" element={<FaceAuth />} />
          <Route path="/enroll" element={<Enroll />} />
          <Route path="/admin" element={<Admin />} />

          <Route element={
            <motion.div
              initial={{ opacity: 0, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.99 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              style={{ width: '100%', height: '100%' }}
            >
              <AppLayout />
            </motion.div>
          }>
            <Route path="/menu" element={<Menu />} />
            <Route path="/cart" element={<Cart />} />
          </Route>
        </Routes>
      </AnimatePresence>
    </>
  );
};

function App() {
  return (
    <BrowserRouter>
      <BrandProvider>
        <LanguageProvider>
          <FaceRecognitionProvider>
            <AnimatedRoutes />
          </FaceRecognitionProvider>
        </LanguageProvider>
      </BrandProvider>
    </BrowserRouter>
  );
}

export default App;
