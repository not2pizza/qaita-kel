import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, Star } from 'lucide-react';
import { useLoyaltyStore } from '../store/useLoyaltyStore';
import { useLanguage } from '../i18n/LanguageProvider';
import { sound } from '../lib/sound';

interface SuccessState {
  pointsEarned?: number;
  customerName?: string;
}

export const CheckoutSuccess: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const clearCurrentCustomer = useLoyaltyStore(s => s.clearCurrentCustomer);
  const { t } = useLanguage();

  const { pointsEarned, customerName } = (location.state ?? {}) as SuccessState;
  const earnedPoints = pointsEarned && pointsEarned > 0;

  useEffect(() => {
    sound.success();
    const timer = setTimeout(() => {
      clearCurrentCustomer(); // reset session for next customer
      navigate('/');
    }, 5500);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', textAlign: 'center', padding: '24px' }}>
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 15 }}
      >
        <CheckCircle size={100} color="var(--primary-accent)" style={{ marginBottom: 20 }} />
      </motion.div>

      <motion.h1
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        style={{ fontSize: '3rem', marginBottom: 10 }}
      >
        {customerName ? t('success.thanks', { name: customerName.split(' ')[0] }) : t('success.confirmed')}
      </motion.h1>

      {earnedPoints && (
        <motion.div
          initial={{ scale: 0.6, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ delay: 0.45, type: 'spring', stiffness: 220, damping: 16 }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '12px 24px', marginBottom: 20,
            borderRadius: '9999px',
            background: 'linear-gradient(135deg, rgba(248,123,50,0.16), rgba(255,94,98,0.16))',
            border: '1px solid rgba(248,123,50,0.35)',
            color: 'var(--primary-accent)', fontWeight: 800, fontSize: '1.5rem',
          }}
        >
          <Star size={22} fill="currentColor" />
          {t('success.pointsEarned', { n: pointsEarned ?? 0 })}
        </motion.div>
      )}

      <motion.p
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}
      >
        {t('success.grabReceipt')}<br />
        {t('success.returningHome')}
      </motion.p>
    </div>
  );
};
