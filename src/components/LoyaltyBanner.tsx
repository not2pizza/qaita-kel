import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, X, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { LoyaltyCustomer } from '../store/useLoyaltyStore';
import './LoyaltyBanner.css';

export type ScanState = 'scanning' | 'recognized' | 'not-found';

interface Props {
  scanState: ScanState;
  customer: LoyaltyCustomer | null;
}

export const LoyaltyBanner: React.FC<Props> = ({ scanState, customer }) => {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(false);
    if (scanState === 'recognized') {
      const t = setTimeout(() => setDismissed(true), 6000);
      return () => clearTimeout(t);
    }
  }, [scanState, customer?.id]);

  const visible = !dismissed && scanState !== 'scanning';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={`loyalty-banner loyalty-banner--${scanState}`}
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        >
          {scanState === 'recognized' && customer && (
            <>
              <Star size={15} className="banner-icon" />
              <span className="banner-text">
                Welcome back, <strong>{customer.name.split(' ')[0]}</strong>!
                <span className="banner-pts"> · {customer.points} pts</span>
              </span>
              <button className="banner-dismiss" onClick={() => setDismissed(true)}>
                <X size={13} />
              </button>
            </>
          )}

          {scanState === 'not-found' && (
            <>
              <UserPlus size={15} className="banner-icon" />
              <span className="banner-text">Earn points on every order — join Loyalty</span>
              <button className="banner-action" onClick={() => navigate('/enroll?from=banner')}>
                Sign up
              </button>
              <button className="banner-dismiss" onClick={() => setDismissed(true)}>
                <X size={13} />
              </button>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
