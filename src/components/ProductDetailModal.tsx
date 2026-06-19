import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Star } from 'lucide-react';
import { useCartStore } from '../store/useCartStore';
import { sound } from '../lib/sound';
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
  product: Product | null;
  onClose: () => void;
}

const SIZES = [
  { id: 'S', label: 'Small', priceModifier: 0 },
  { id: 'M', label: 'Medium', priceModifier: 0.5 },
  { id: 'L', label: 'Large', priceModifier: 1.0 },
];

const MILKS = [
  { id: 'whole', label: 'Whole Milk', price: 0 },
  { id: 'oat', label: 'Oat Milk', price: 0.5 },
  { id: 'almond', label: 'Almond Milk', price: 0.5 },
  { id: 'soy', label: 'Soy Milk', price: 0 },
];

const SYRUPS = [
  { id: 'none', label: 'None', price: 0 },
  { id: 'vanilla', label: 'Vanilla', price: 0.25 },
  { id: 'caramel', label: 'Caramel', price: 0.25 },
  { id: 'hazelnut', label: 'Hazelnut', price: 0.25 },
];

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ product, onClose }) => {
  const [size, setSize] = useState<'S'|'M'|'L'>('M');
  const [milk, setMilk] = useState(MILKS[0]);
  const [syrup, setSyrup] = useState(SYRUPS[0]);
  const [added, setAdded] = useState(false);

  const addItem = useCartStore(state => state.addItem);

  // Lock body scroll while the modal is open (prevents background scroll on touch).
  useEffect(() => {
    if (!product) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [!!product]);

  if (!product) return null;

  const sizeMod = SIZES.find(s => s.id === size)?.priceModifier || 0;
  
  const finalPrice = product.price + sizeMod + milk.price + syrup.price;

  const handleAddToCart = () => {
    const cartItemId = `${product.id}-${size}-${milk.id}-${syrup.id}`;
    addItem({
      cartItemId,
      productId: product.id,
      name: product.name,
      price: finalPrice,
      image: product.image,
      size,
      milk: milk.label,
      syrup: syrup.label,
      quantity: 1
    });
    
    sound.add();
    setAdded(true);
    setTimeout(() => {
      onClose();
      setAdded(false);
    }, 800);
  };

  return (
    <AnimatePresence>
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
                  src={product.image}
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
                <p className="modal-price">${finalPrice.toFixed(2)}</p>

                <div className="customization-section">
                  <h3>Size</h3>
                  <div className="options-row">
                    {SIZES.map(s => (
                      <button
                        key={s.id}
                        className={`option-btn ${size === s.id ? 'active' : ''}`}
                        onClick={() => setSize(s.id as 'S'|'M'|'L')}
                      >
                        {size === s.id && <motion.div layoutId="size-active" className="option-active-bg" />}
                        <span>{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="customization-section">
                  <h3>Milk</h3>
                  <div className="options-grid">
                    {MILKS.map(m => (
                      <button
                        key={m.id}
                        className={`option-btn ${milk.id === m.id ? 'active' : ''}`}
                        onClick={() => setMilk(m)}
                      >
                        {milk.id === m.id && <motion.div layoutId="milk-active" className="option-active-bg" />}
                        <span>{m.label} {m.price > 0 && `(+$${m.price.toFixed(2)})`}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="customization-section">
                  <h3>Syrup</h3>
                  <div className="options-grid">
                    {SYRUPS.map(s => (
                      <button
                        key={s.id}
                        className={`option-btn ${syrup.id === s.id ? 'active' : ''}`}
                        onClick={() => setSyrup(s)}
                      >
                        {syrup.id === s.id && <motion.div layoutId="syrup-active" className="option-active-bg" />}
                        <span>{s.label} {s.price > 0 && `(+$${s.price.toFixed(2)})`}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <div className="add-to-cart-wrapper">
                  <motion.button
                    className={`add-to-cart-btn ${added ? 'added' : ''}`}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleAddToCart}
                  >
                    {added ? (
                      <><Check size={20} /> Added to Cart</>
                    ) : (
                      `Add to Cart - $${finalPrice.toFixed(2)}`
                    )}
                  </motion.button>
                  <div className="add-to-cart-glow" />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
