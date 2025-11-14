'use client';

import { motion, AnimatePresence } from 'framer-motion';

/**
 * Floating badge component that shows "+X COIN Added" and floats upward
 * Used to celebrate investment success
 * 
 * @param {string} text - Text to display (e.g., "+0.000023 BTC Added")
 * @param {boolean} show - Whether to show the badge
 * @param {Function} onComplete - Callback when animation completes
 */
export default function FloatingBadge({ text, show, onComplete }) {
  return (
    <AnimatePresence onExitComplete={onComplete}>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.9 }}
          animate={{ opacity: 1, y: -30, scale: 1 }}
          exit={{ opacity: 0, y: -50, scale: 0.8 }}
          transition={{ 
            duration: 1.2,
            ease: [0.16, 1, 0.3, 1] // Custom easing for smooth feel
          }}
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 pointer-events-none"
        >
          <div className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 backdrop-blur-md px-6 py-3 shadow-[0_20px_60px_rgba(255,159,28,0.3)]">
            <p className="text-sm font-semibold text-[var(--accent)] whitespace-nowrap">
              {text}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

