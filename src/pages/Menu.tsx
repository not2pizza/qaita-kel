import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Star, Flame, RotateCcw } from 'lucide-react';
import { GlassCard } from '../components/ui/GlassCard';
import { ProductDetailModal } from '../components/ProductDetailModal';
import { useFaceRecognition } from '../contexts/FaceRecognitionContext';
import { useLoyaltyStore, getTierProgressInfo } from '../store/useLoyaltyStore';
import { useCartStore } from '../store/useCartStore';
import { fetchRecentOrders, type PastOrder } from '../lib/supabaseService';
import { orderToCartItems, aggregateItems } from '../lib/reorder';
import { useLanguage } from '../i18n/LanguageProvider';
import { type TransKey } from '../i18n/translations';
import { type Product } from '../data/products';
import './Menu.css';

const CATEGORIES = ['All', 'Hot', 'Cold', 'Blended'] as const;

export const Menu: React.FC = () => {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [recentOrders, setRecentOrders] = useState<PastOrder[]>([]);
  const { scanState, products } = useFaceRecognition();
  const { currentCustomer } = useLoyaltyStore();
  const addItem = useCartStore(s => s.addItem);
  const { t } = useLanguage();

  const recognized = scanState === 'recognized' && !!currentCustomer;
  const firstName = currentCustomer?.name.split(' ')[0] ?? '';

  // Render a greeting sub whose {points} slot is a bold accent span. Calling
  // t(key) with no vars leaves the literal "{points}" token, so we split on it.
  const richGreeting = (key: TransKey, points: number) => {
    const [before, after = ''] = t(key).split('{points}');
    return (
      <>
        {before}
        <strong>{points.toLocaleString()} {t('common.points')}</strong>
        {after}
      </>
    );
  };

  // Real "Order again" — the recognised member's actual past orders.
  useEffect(() => {
    if (recognized && currentCustomer) {
      fetchRecentOrders(currentCustomer.id).then(setRecentOrders);
    } else {
      setRecentOrders([]);
    }
  }, [recognized, currentCustomer?.id]);

  // Repeat a whole past order — re-add every line item with its exact options.
  const reorder = (order: PastOrder) => {
    orderToCartItems(order, products).forEach(addItem);
    navigate('/cart');
  };

  const filteredProducts = products.filter(
    (p) => activeCategory === 'All' || p.category === activeCategory
  );

  // ── Smart hero: prefer the member's most-ordered category, else the daypart
  // (mornings lean hot, later leans cold). Falls back to the second product. ──
  const hour = new Date().getHours();
  const daypartCat: Product['category'] = hour < 11 ? 'Hot' : 'Cold';

  const tasteCat = useMemo<string | undefined>(() => {
    const counts: Record<string, number> = {};
    for (const o of recentOrders) {
      for (const it of o.items) {
        const cat = products.find(p => p.id === it.productId)?.category;
        if (cat) counts[cat] = (counts[cat] ?? 0) + it.quantity;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  }, [recentOrders, products]);

  const preferredCat = tasteCat ?? daypartCat;
  const featuredProduct: Product | undefined =
    products.find(p => p.category === preferredCat) ?? products[1] ?? products[0];

  const heroLabel = tasteCat
    ? t('menu.heroFavourite')
    : hour < 11 ? t('menu.heroMorning') : t('menu.heroBarista');

  // Win-back: greet returning members who've been away for a while differently.
  const lastOrderAt = recentOrders[0]?.createdAt;
  const daysSinceLast = lastOrderAt
    ? Math.floor((Date.now() - new Date(lastOrderAt).getTime()) / 86_400_000)
    : null;
  const winBack = recognized && daysSinceLast != null && daysSinceLast >= 14;

  return (
    <div className="menu-page">
      {/* Personalized greeting (replaces the old banner pill) */}
      {recognized ? (
        <motion.div
          className="menu-greeting"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="greeting-title">
            {winBack ? t('menu.missedYou', { name: firstName }) : t('menu.welcomeBack', { name: firstName })}
          </h2>
          <p className="greeting-sub">
            {richGreeting(winBack ? 'menu.missedYouSub' : 'menu.greetingSub', currentCustomer!.points)}
          </p>
          {(() => {
            const tp = getTierProgressInfo(currentCustomer!.points);
            return tp.next ? (
              <div className="tier-progress">
                <div className="tier-progress-bar"><span style={{ width: `${tp.pct}%` }} /></div>
                <span className="tier-progress-label">
                  {(() => {
                    const [a, b = ''] = t('menu.ptsToNext', { tier: tp.next }).split('{pts}');
                    return <>{a}<strong>{tp.toNext.toLocaleString()}</strong>{b}</>;
                  })()}
                </span>
              </div>
            ) : (
              <div className="tier-progress">
                <span className="tier-progress-label">{t('menu.topTier', { tier: tp.current })}</span>
              </div>
            );
          })()}
        </motion.div>
      ) : scanState === 'not-found' ? (
        <motion.div
          className="menu-greeting"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="greeting-title">{t('menu.welcome')}</h2>
          <p className="greeting-sub">{t('menu.welcomeSub')}</p>
        </motion.div>
      ) : null}

      {/* Order again — repeat a whole past order (with size/milk/syrup) in one tap */}
      {recognized && recentOrders.length > 0 && (
        <section className="order-again">
          <h3 className="section-title">{t('menu.orderAgain')}</h3>
          <div className="order-again-row">
            {recentOrders.map((order) => (
              <button key={order.id} className="reorder-order" onClick={() => reorder(order)}>
                {(() => {
                  const agg = aggregateItems(order);
                  return (
                    <div className="reorder-thumbs">
                      {agg.slice(0, 3).map((it, idx) => {
                        const img = products.find(p => p.id === it.productId)?.image;
                        return (
                          <span className="reorder-thumb" key={idx}>
                            {img
                              ? <img src={img} alt={it.name} />
                              : <span className="reorder-thumb-fallback">{it.name.charAt(0)}</span>}
                            {it.quantity > 1 && <span className="reorder-thumb-qty">{it.quantity}×</span>}
                          </span>
                        );
                      })}
                      {agg.length > 3 && (
                        <span className="reorder-thumb reorder-thumb-more">+{agg.length - 3}</span>
                      )}
                    </div>
                  );
                })()}
                <div className="reorder-order-bottom">
                  <span className="reorder-order-total">${order.total.toFixed(2)}</span>
                  <span className="reorder-order-cta"><RotateCcw size={14} /> {t('menu.reorder')}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {featuredProduct && (
        <div className="hero-section">
          <GlassCard className="hero-card" noPadding={true}>
            <div className="hero-content">
              <span className="hero-badge">{heroLabel}</span>
              <h1 className="hero-title">{featuredProduct.name}</h1>
              <p className="hero-desc">{featuredProduct.description}</p>
              <div className="hero-actions">
                <button className="hero-btn" onClick={() => setSelectedProduct(featuredProduct)}>
                  {t('menu.orderNow')} · ${featuredProduct.price.toFixed(2)}
                </button>
                {featuredProduct.rating != null && (
                  <span className="hero-rating"><Star size={15} fill="currentColor" /> {featuredProduct.rating}</span>
                )}
              </div>
            </div>
            <div className="hero-image-container">
              <img src={featuredProduct.image} alt={featuredProduct.name} className="hero-image" />
            </div>
          </GlassCard>
        </div>
      )}

      <header className="menu-header">
        <h2>{t('menu.ourMenu')}</h2>
        <p>{t('menu.ourMenuSub')}</p>
      </header>

      <div className="category-filter">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`category-btn ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {activeCategory === cat && (
              <motion.div layoutId="active-pill" className="active-pill" transition={{ type: 'spring', stiffness: 300, damping: 30 }} />
            )}
            <span className="category-label">{t(`category.${cat}` as TransKey)}</span>
          </button>
        ))}
      </div>

      <div className="product-grid-wrap">
        <motion.div
          key={activeCategory}
          className="product-grid"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          {filteredProducts.map((product) => (
            <GlassCard
              key={product.id}
              className="product-card"
              noPadding={true}
              animateIn={false}
              onClick={() => setSelectedProduct(product)}
            >
              <div className="product-image-container">
                {product.tag && (
                  <span className={`product-tag tag-${product.tag.toLowerCase()}`}>{product.tag}</span>
                )}
                <img
                  src={product.image}
                  alt={product.name}
                  className="product-image"
                />
              </div>
              <div className="product-info">
                <h3 className="product-name">{product.name}</h3>
                <p className="product-desc">{product.description}</p>
                {(product.rating != null || product.calories != null) && (
                  <div className="product-meta">
                    {product.rating != null && (
                      <span className="product-rating"><Star size={13} fill="currentColor" /> {product.rating}</span>
                    )}
                    {product.rating != null && product.calories != null && <span className="product-dot">·</span>}
                    {product.calories != null && (
                      <span className="product-cal"><Flame size={13} /> {product.calories} cal</span>
                    )}
                  </div>
                )}
                <div className="product-footer">
                  <p className="product-price">${product.price.toFixed(2)}</p>
                  <button
                    className="add-btn"
                    aria-label="Customize and add to cart"
                    onClick={(e) => { e.stopPropagation(); setSelectedProduct(product); }}
                  >
                    +
                  </button>
                </div>
              </div>
            </GlassCard>
          ))}
        </motion.div>
      </div>
      <ProductDetailModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
    </div>
  );
};
