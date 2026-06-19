import React from 'react';
import { motion } from 'framer-motion';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  delay?: number;
  noPadding?: boolean;
  layout?: boolean | "position" | "x" | "y" | "size" | "preserve-aspect";
  animateIn?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, className = '', onClick, delay = 0, noPadding = false, layout = false, animateIn = true }) => {
  return (
    <motion.div
      layout={layout}
      initial={animateIn ? { opacity: 0, y: 20 } : false}
      animate={animateIn ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.5, delay, ease: [0.25, 0.1, 0.25, 1] }}
      whileHover={{ scale: onClick ? 1.02 : 1, y: onClick ? -4 : 0 }}
      whileTap={{ scale: onClick ? 0.98 : 1 }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`glass-panel ${className}`}
      style={{ cursor: onClick ? 'pointer' : 'default', padding: noPadding ? 0 : 'var(--spacing-md)' }}
    >
      {children}
    </motion.div>
  );
};
