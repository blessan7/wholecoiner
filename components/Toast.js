'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';

/**
 * Toast notification component
 * Shows temporary notifications with different types (success, error, warning, info)
 */
export default function Toast({ message, type = 'info', onClose, duration = 5000 }) {
  useEffect(() => {
    if (duration && duration > 0) {
      const timer = setTimeout(() => {
        onClose?.();
      }, duration);
      
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const typeStyles = {
    success: 'bg-[var(--accent)]/10 border-[var(--accent)]/40 backdrop-blur-md shadow-[0_20px_60px_rgba(255,159,28,0.2)]',
    error: 'bg-red-500/90 border-red-400',
    warning: 'bg-yellow-500/90 border-yellow-400',
    info: 'bg-blue-500/90 border-blue-400',
  };

  const icons = {
    success: (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)]/20 border border-[var(--accent)]/40">
        <span className="text-sm text-[var(--accent)]">✓</span>
      </div>
    ),
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };

  const iconElement = typeof icons[type] === 'string' ? (
    <span className="text-xl text-white">{icons[type]}</span>
  ) : (
    icons[type]
  );

  const textColor = type === 'success' 
    ? 'text-[var(--text-primary)]' 
    : 'text-white';

  return (
    <motion.div
      initial={{ opacity: 0, x: 100, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-lg ${
        typeStyles[type] || typeStyles.info
      }`}
      role="alert"
    >
      {iconElement}
      <p className={`text-sm font-semibold ${textColor}`}>{message}</p>
      {onClose && (
        <button
          onClick={onClose}
          className={`ml-2 ${textColor} hover:opacity-70 transition-opacity`}
          aria-label="Close"
        >
          ✕
        </button>
      )}
    </motion.div>
  );
}

