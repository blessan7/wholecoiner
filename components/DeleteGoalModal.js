'use client';

import { motion, AnimatePresence } from 'framer-motion';

/**
 * Delete Goal Confirmation Modal
 * Uses loss-aversion psychology to reduce goal deletions
 */
export default function DeleteGoalModal({ isOpen, onClose, onConfirm, goalName }) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-md rounded-3xl border border-[#2a2016] bg-[#17110b] p-8 shadow-[0_30px_100px_rgba(0,0,0,0.8)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute right-4 top-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                aria-label="Close"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>

              {/* Content */}
              <div className="space-y-6">
                {/* Title */}
                <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                  Are you sure you want to delete this goal?
                </h2>

                {/* Body text with loss-aversion psychology */}
                <div className="space-y-3 text-sm text-[var(--text-secondary)] leading-relaxed">
                  <p>
                    You're making real progress toward your target.
                  </p>
                  <p>
                    Deleting this goal will remove all history, progress, and momentum.
                  </p>
                  <p>
                    Most users keep their goals and continue stacking — it's the best way to reach long-term milestones.
                  </p>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 pt-2">
                  {/* Keep Goal - Primary */}
                  <button
                    onClick={onClose}
                    className="flex-1 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[#0d0804] shadow-[0_12px_40px_rgba(255,159,28,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(255,159,28,0.35)]"
                  >
                    Keep Goal
                  </button>

                  {/* Delete Anyway - Ghost, red text */}
                  <button
                    onClick={onConfirm}
                    className="flex-1 rounded-full border border-[#2a2016] bg-transparent px-6 py-3 text-sm font-semibold text-red-400 transition-all hover:border-red-500/30 hover:bg-red-500/5"
                  >
                    Delete Anyway
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

