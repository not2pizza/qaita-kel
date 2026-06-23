import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { X, Check, Star } from 'lucide-react';
import { useCartStore, type SelectedModifier } from '../store/useCartStore';
import { useFaceRecognition } from '../contexts/FaceRecognitionContext';
import { fetchProductModifiers, type ModifierGroup } from '../lib/supabaseService';
import { sound } from '../lib/sound';
import { formatTenge } from '../lib/currency';
import './ProductDetailModal.css';

interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
  video?: string;
  description?: string;
  rating?: number;
  calories?: number;
}

interface ProductDetailModalProps {
  // Mounted only while open (parent gates with AnimatePresence) → always defined.
  product: Product;
  onClose: () => void;
}

// Hardcoded fallback used only when a product has no DB modifiers yet (tables
// unseeded). Mirrors the original Size / Milk / Syrup options. DB ids are null.
const FALLBACK_MODIFIERS: ModifierGroup[] = [
  {
    id: 'fb-size', dbId: null, name: 'Size', selectionType: 'single', minSelections: 1, maxSelections: 1,
    options: [
      { id: 'fb-s', dbId: null, name: 'Small', priceDelta: -200, isDefault: false },
      { id: 'fb-m', dbId: null, name: 'Medium', priceDelta: 0, isDefault: true },
      { id: 'fb-l', dbId: null, name: 'Large', priceDelta: 300, isDefault: false },
    ],
  },
  {
    id: 'fb-milk', dbId: null, name: 'Milk', selectionType: 'single', minSelections: 1, maxSelections: 1,
    options: [
      { id: 'fb-whole', dbId: null, name: 'Whole Milk', priceDelta: 0, isDefault: true },
      { id: 'fb-oat', dbId: null, name: 'Oat Milk', priceDelta: 300, isDefault: false },
      { id: 'fb-almond', dbId: null, name: 'Almond Milk', priceDelta: 350, isDefault: false },
      { id: 'fb-soy', dbId: null, name: 'Soy Milk', priceDelta: 0, isDefault: false },
    ],
  },
  {
    id: 'fb-syrup', dbId: null, name: 'Syrup', selectionType: 'single', minSelections: 1, maxSelections: 1,
    options: [
      { id: 'fb-none', dbId: null, name: 'None', priceDelta: 0, isDefault: true },
      { id: 'fb-vanilla', dbId: null, name: 'Vanilla', priceDelta: 200, isDefault: false },
      { id: 'fb-caramel', dbId: null, name: 'Caramel', priceDelta: 200, isDefault: false },
      { id: 'fb-hazelnut', dbId: null, name: 'Hazelnut', priceDelta: 200, isDefault: false },
    ],
  },
];

// Default selection for a group: marked defaults, else the first option for a
// required single-select (so price/labels are always valid on open).
function defaultSelection(g: ModifierGroup): string[] {
  const defaults = g.options.filter(o => o.isDefault).map(o => o.id);
  if (g.selectionType === 'single') {
    const pick = defaults[0] ?? (g.minSelections > 0 ? g.options[0]?.id : undefined);
    return pick ? [pick] : [];
  }
  return defaults.slice(0, g.maxSelections);
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ product, onClose }) => {
  const addItem = useCartStore(state => state.addItem);
  const { branchId } = useFaceRecognition();

  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const [added, setAdded] = useState(false);

  // Lock body scroll while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Load this product's modifier groups (branch-aware). The hardcoded modifier
  // set is only for bundled fallback products, not live DB products.
  useEffect(() => {
    let alive = true;
    (async () => {
      let g: ModifierGroup[] = [];
      if (branchId) {
        try { g = await fetchProductModifiers(product.id, branchId); } catch { g = []; }
      }
      if (!alive) return;
      if (g.length === 0 && product.id.startsWith('seed-')) g = FALLBACK_MODIFIERS;
      setGroups(g);
      const init: Record<string, string[]> = {};
      for (const grp of g) init[grp.id] = defaultSelection(grp);
      setSel(init);
    })();
    return () => { alive = false; };
  }, [product.id, branchId]);

  const choose = (g: ModifierGroup, optionId: string) => {
    sound.tap();
    setSel(prev => {
      const cur = prev[g.id] ?? [];
      if (g.selectionType === 'single') return { ...prev, [g.id]: [optionId] };
      if (cur.includes(optionId)) return { ...prev, [g.id]: cur.filter(x => x !== optionId) };
      if (cur.length >= g.maxSelections) return prev; // at max — ignore extra picks
      return { ...prev, [g.id]: [...cur, optionId] };
    });
  };

  const selectedModifiers = useMemo<SelectedModifier[]>(() => {
    return groups.flatMap(g =>
      (sel[g.id] ?? []).map(id => {
        const o = g.options.find(opt => opt.id === id)!;
        return { groupId: g.dbId, groupName: g.name, optionId: o.dbId, optionName: o.name, priceDelta: o.priceDelta };
      })
    );
  }, [groups, sel]);

  const finalPrice = product.price + selectedModifiers.reduce((s, m) => s + m.priceDelta, 0);
  const canAdd = groups.every(g => (sel[g.id]?.length ?? 0) >= g.minSelections);

  const handleAddToCart = () => {
    if (!canAdd || added) return;   // guard against double-tap within the confirm window
    const sig = groups.flatMap(g => sel[g.id] ?? []).sort().join(',');
    addItem({
      cartItemId: `${product.id}::${sig}`,
      productId: product.id,
      name: product.name,
      price: finalPrice,
      image: product.image,
      modifiers: selectedModifiers,
      quantity: 1,
    });

    sound.add();
    setAdded(true);
    setTimeout(() => { onClose(); setAdded(false); }, 800);
  };

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal-content liquid-glass cinematic-modal"
        initial={{ y: 100, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 100, opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-inner-wrap cinematic-split">
          <button className="close-btn" onClick={onClose} aria-label="Close modal">
            <X size={24} />
          </button>

          <div className="cinematic-media">
            {product.video ? (
              <video src={product.video} autoPlay loop muted playsInline className="media-asset video-asset" />
            ) : (
              <img
                src={product.image || undefined}
                alt={product.name}
                className="media-asset image-asset"
              />
            )}
            <div className="cinematic-overlay" />
          </div>

            <div className="cinematic-content">
              <div className="modal-scroll">
                <h2>{product.name}</h2>
                {(product.rating || product.calories) && (
                  <div className="modal-meta">
                    {product.rating != null && (
                      <span className="modal-rating"><Star size={14} fill="currentColor" /> {product.rating}</span>
                    )}
                    {product.calories != null && <span>{product.calories} cal</span>}
                  </div>
                )}
                {product.description && <p className="modal-desc">{product.description}</p>}
                <p className="modal-price">{formatTenge(finalPrice)}</p>

                {groups.map(g => {
                  const selected = sel[g.id] ?? [];
                  const useGrid = g.options.length > 3;
                  return (
                    <div className="customization-section" key={g.id}>
                      <h3>
                        {g.name}
                        {g.selectionType === 'multiple' && (
                          <span className="section-hint">
                            {' '}· choose up to {g.maxSelections}
                          </span>
                        )}
                      </h3>
                      <div className={useGrid ? 'options-grid' : 'options-row'}>
                        {g.options.map(o => {
                          const active = selected.includes(o.id);
                          // Multiple-select at its limit: lock the unselected ones
                          // (dim + un-tappable) so a tap that does nothing isn't
                          // mistaken for a bug.
                          const locked = g.selectionType === 'multiple'
                            && !active && selected.length >= g.maxSelections;
                          return (
                            <button
                              key={o.id}
                              className={`option-btn ${active ? 'active' : ''} ${locked ? 'locked' : ''}`}
                              disabled={locked}
                              onClick={() => choose(g, o.id)}
                            >
                              {active && g.selectionType === 'single' && (
                                <motion.div layoutId={`mod-bg-${g.id}`} className="option-active-bg" />
                              )}
                              {active && g.selectionType === 'multiple' && (
                                <div className="option-active-bg option-active-static" />
                              )}
                              <span>
                                {o.name}{o.priceDelta > 0 && ` (+${formatTenge(o.priceDelta)})`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="modal-footer">
                <div className="add-to-cart-wrapper">
                  <motion.button
                    className={`add-to-cart-btn ${added ? 'added' : ''}`}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleAddToCart}
                    disabled={!canAdd}
                  >
                    {added ? (
                      <><Check size={20} /> Added to Cart</>
                    ) : (
                      `Add to Cart - ${formatTenge(finalPrice)}`
                    )}
                  </motion.button>
                  <div className="add-to-cart-glow" />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
  );
};
