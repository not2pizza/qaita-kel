import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trash2, Plus, Minus, CreditCard, ArrowLeft, Gift, Check } from 'lucide-react';
import { useCartStore } from '../store/useCartStore';
import { useLoyaltyStore, type LoyaltyCustomer } from '../store/useLoyaltyStore';
import { useFaceRecognition } from '../contexts/FaceRecognitionContext';
import { useLanguage } from '../i18n/LanguageProvider';
import { createOrder, awardPoints, fetchRewards, type NewOrderItem, type Reward } from '../lib/supabaseService';
import { GlassCard } from '../components/ui/GlassCard';
import { RegistrationModal } from '../components/RegistrationModal';
import { formatTenge, replaceDollarAmounts } from '../lib/currency';
import './Cart.css';

export const Cart: React.FC = () => {
  const navigate = useNavigate();
  const { items, updateQuantity, removeItem, getCartTotal, clearCart } = useCartStore();
  const { currentCustomer, updateCustomerPoints, setCurrentCustomer, addCustomer } = useLoyaltyStore();
  const { branchId, loyaltyConfig, capturedFace, clearCapturedFace, captureNow } = useFaceRecognition();
  const { t } = useLanguage();
  const [showRegistration, setShowRegistration] = useState(false);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [appliedReward, setAppliedReward] = useState<Reward | null>(null);
  const [processing, setProcessing] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const submittingRef = useRef(false);   // blocks double-tap → no duplicate orders

  // Load redeemable rewards the member can afford.
  useEffect(() => {
    if (currentCustomer) {
      fetchRewards().then(rs => setRewards(rs.filter(r => r.costPoints <= currentCustomer.points)));
    } else {
      setRewards([]);
      setAppliedReward(null);
    }
  }, [currentCustomer?.id, currentCustomer?.points]);

  const subtotal = getCartTotal();
  const discount = appliedReward ? Math.min(appliedReward.amount, subtotal) : 0;
  const taxed = (subtotal - discount) * 1.08;
  const rewardTitle = (reward: Reward) => replaceDollarAmounts(reward.title);

  // Persist the order (+ points), and only THEN clear the cart and show success.
  // Previously we navigated optimistically before the save — a failed save left
  // the customer happy but the barista with no order. Now a failure keeps the
  // cart and surfaces a retry.
  const finalizeOrder = async (customer: LoyaltyCustomer | null) => {
    if (submittingRef.current) return;   // already checking out — ignore repeat taps
    submittingRef.current = true;
    setProcessing(true);
    setCheckoutError('');

    const sub = getCartTotal();
    const disc = customer && appliedReward ? Math.min(appliedReward.amount, sub) : 0;
    const total = Number(((sub - disc) * 1.08).toFixed(2));
    const earned = customer ? Math.round(sub * loyaltyConfig.pointsPerDollar) : 0;
    const redeemed = customer && appliedReward ? appliedReward.costPoints : 0;

    // Build order line items. Fallback ("seed-*"/"past-*") products have no DB id → null.
    const orderItems: NewOrderItem[] = items.map(it => ({
      productId: (it.productId.startsWith('seed-') || it.productId.startsWith('past-')) ? null : it.productId,
      name: it.name,
      unitPrice: it.price,
      quantity: it.quantity,
      options: { modifiers: it.modifiers },
      modifiers: it.modifiers,
    }));

    let ok = true;
    try {
      if (branchId) {
        const res = await createOrder({
          branchId,
          customerId: customer?.id ?? null,
          customerName: customer?.name ?? null,
          items: orderItems,
          subtotal: sub,
          discountTotal: disc,
          total,
          pointsPerDollar: loyaltyConfig.pointsPerDollar,
          pointsRedeemed: redeemed,
        });
        if (!res) ok = false;
        else if (customer && res.newBalance != null) updateCustomerPoints(customer.id, res.newBalance);
      } else if (customer) {
        // Branch not resolved (DB unseeded) — at least keep loyalty points working.
        const newTotal = await awardPoints(customer.id, earned);
        if (newTotal != null) updateCustomerPoints(customer.id, newTotal);
      }
    } catch {
      ok = false;
    }

    if (!ok) {
      submittingRef.current = false;   // allow a retry; cart kept intact
      setProcessing(false);
      setCheckoutError(t('cart.orderFailed'));
      return;
    }

    clearCart();
    navigate('/checkout-success', customer
      ? { state: { pointsEarned: earned, customerName: customer.name } }
      : undefined);
  };

  const handleCheckout = () => {
    if (currentCustomer) {
      finalizeOrder(currentCustomer);     // already a known member
    } else {
      setShowRegistration(true);          // walk-in → offer sign-up by face + phone
    }
  };

  const handleRegistered = (customer: LoyaltyCustomer) => {
    setShowRegistration(false);
    addCustomer(customer);        // load their face into the recogniser immediately
    setCurrentCustomer(customer);
    clearCapturedFace();
    finalizeOrder(customer);
  };

  const handleSkipRegistration = () => {
    setShowRegistration(false);
    clearCapturedFace();
    finalizeOrder(null);                   // anonymous order, face discarded
  };

  if (items.length === 0) {
    return (
      <div className="cart-page empty">
        <div className="empty-state">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <h2>{t('cart.empty')}</h2>
            <p>{t('cart.emptySub')}</p>
            <button className="browse-btn" onClick={() => navigate('/menu')}>
              {t('cart.browseMenu')}
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <header className="cart-header">
        <button className="cart-back" onClick={() => navigate('/menu')}>
          <ArrowLeft size={18} /> {t('cart.menu')}
        </button>
        <h2>{t('cart.yourOrder')}</h2>
        <button className="clear-btn" onClick={clearCart}>{t('cart.clearAll')}</button>
      </header>

      <div className="cart-content">
        <div className="cart-items">
          {items.map((item, i) => (
            <motion.div
              key={item.cartItemId}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: i * 0.05 }}
            >
              <GlassCard className="cart-item">
                <img src={item.image || undefined} alt={item.name} className="cart-item-image" />
                <div className="cart-item-info">
                  <h3>{item.name}</h3>
                  {item.modifiers.length > 0 && (
                    <p className="cart-item-details">
                      {item.modifiers
                        .filter(m => m.optionName.toLowerCase() !== 'none')
                        .map(m => m.optionName)
                        .join(' · ')}
                    </p>
                  )}
                  <p className="cart-item-price">{formatTenge(item.price * item.quantity)}</p>
                </div>
                <div className="cart-item-actions">
                  <div className="quantity-controls">
                    <button onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}>
                      <Minus size={16} />
                    </button>
                    <span>{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}>
                      <Plus size={16} />
                    </button>
                  </div>
                  <button className="remove-btn" onClick={() => removeItem(item.cartItemId)}>
                    <Trash2 size={18} />
                  </button>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>

        <div className="cart-summary-wrapper">
          <GlassCard className="cart-summary">
            <h3>{t('cart.orderSummary')}</h3>

            {currentCustomer && rewards.length > 0 && (
              <div className="rewards-section">
                <span className="rewards-title"><Gift size={15} /> {t('cart.redeemPoints')}</span>
                <div className="rewards-list">
                  {rewards.map(r => {
                    const active = appliedReward?.id === r.id;
                    return (
                      <button
                        key={r.id}
                        className={`reward-chip ${active ? 'active' : ''}`}
                        onClick={() => setAppliedReward(active ? null : r)}
                      >
                        {active && <Check size={13} />}
                        <span>{rewardTitle(r)}</span>
                        <span className="reward-cost">{r.costPoints} pts</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="summary-row">
              <span>{t('cart.subtotal')}</span>
              <span>{formatTenge(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="summary-row discount">
                <span>{t('cart.reward')}{appliedReward ? ` · ${rewardTitle(appliedReward)}` : ''}</span>
                <span>−{formatTenge(discount)}</span>
              </div>
            )}
            <div className="summary-row">
              <span>{t('cart.tax')}</span>
              <span>{formatTenge((subtotal - discount) * 0.08)}</span>
            </div>
            <div className="summary-divider" />
            <div className="summary-row total">
              <span>{t('cart.total')}</span>
              <span>{formatTenge(taxed)}</span>
            </div>
            <button className="checkout-btn" onClick={handleCheckout} disabled={processing}>
              <CreditCard size={20} /> {processing ? t('cart.processing') : t('cart.checkout')}
            </button>
            {checkoutError && <p className="checkout-error">{checkoutError}</p>}
          </GlassCard>
        </div>
      </div>

      <RegistrationModal
        open={showRegistration}
        capturedFace={capturedFace}
        captureNow={captureNow}
        welcomeBonus={loyaltyConfig.welcomeBonus}
        onComplete={handleRegistered}
        onSkip={handleSkipRegistration}
      />
    </div>
  );
};
