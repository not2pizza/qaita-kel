import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Flame, RotateCcw } from 'lucide-react';
import { GlassCard } from '../components/ui/GlassCard';
import { ProductDetailModal } from '../components/ProductDetailModal';
import { useFaceRecognition } from '../contexts/FaceRecognitionContext';
import { useLoyaltyStore } from '../store/useLoyaltyStore';
import { useCartStore } from '../store/useCartStore';
import { fetchRecentOrders, type PastOrder } from '../lib/supabaseService';
import { orderToCartItems, aggregateItems } from '../lib/reorder';
import { useLanguage } from '../i18n/LanguageProvider';
import { type TransKey } from '../i18n/translations';
import { type Product } from '../data/products';
import { formatTenge } from '../lib/currency';
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
      {recognized ? (
        <motion.div
          className="menu-greeting"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="greeting-title">
            {winBack ? t('menu.missedYou', { name: firstName }) : t('menu.welcomeBack', { name: firstName })}
          </h2>
        </motion.div>
      ) : scanState === 'not-found' ? (
        <motion.div
          className="menu-greeting"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="greeting-title">{t('menu.welcome')}</h2>
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
                  <span className="reorder-order-total">{formatTenge(order.total)}</span>
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
                  {t('menu.orderNow')} · {formatTenge(featuredProduct.price)}
                </button>
                {featuredProduct.rating != null && (
                  <span className="hero-rating"><Star size={15} fill="currentColor" /> {featuredProduct.rating}</span>
                )}
              </div>
            </div>
            <div className="hero-image-container">
              <img src={featuredProduct.image || undefined} alt={featuredProduct.name} className="hero-image" />
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
        <div key={activeCategory} className="product-grid">
          {filteredProducts.map((product, i) => (
            <GlassCard
              key={product.id}
              className="product-card"
              noPadding={true}
              animateIn={true}
              delay={Math.min(i * 0.04, 0.4)}
              onClick={() => setSelectedProduct(product)}
            >
              <div className="product-image-container">
                {product.tag && (
                  <span className={`product-tag tag-${product.tag.toLowerCase()}`}>{product.tag}</span>
                )}
                <img
                  src={product.image || undefined}
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
                  <p className="product-price">{formatTenge(product.price)}</p>
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
        </div>
      </div>
      <AnimatePresence>
        {selectedProduct && (
          <ProductDetailModal
            key={selectedProduct.id}
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
