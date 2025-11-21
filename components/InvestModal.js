'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import InvestSimpleView from '@/components/invest/InvestSimpleView';

/**
 * Investment Modal
 * Opens when user clicks "Invest Now" on a goal card
 * Contains the investment flow
 */
export default function InvestModal({ isOpen, onClose, goal, walletAddress, onSuccess }) {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);
  const amountInputRef = useRef(null);
  const [currentStep, setCurrentStep] = useState('amount');

  // Store previous focus element when modal opens
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      // Reset step when modal opens
      setCurrentStep('amount');
      // Focus first input after a short delay to allow modal to render
      setTimeout(() => {
        if (amountInputRef.current) {
          amountInputRef.current.focus();
        } else if (modalRef.current) {
          // If no input ref, focus the modal itself
          const firstInput = modalRef.current.querySelector('input, button, [tabindex]:not([tabindex="-1"])');
          if (firstInput) {
            firstInput.focus();
          }
        }
      }, 100);
    } else {
      // Restore focus when modal closes
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    }
  }, [isOpen]);

  // Handle ESC key press
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        // Prevent closing during critical steps
        const criticalSteps = ['preparing', 'signing', 'executing'];
        if (!criticalSteps.includes(currentStep)) {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, currentStep]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !goal) return null;

  const handleBackdropClick = (e) => {
    // Only close if clicking the backdrop itself, not modal content
    if (e.target === e.currentTarget) {
      // Prevent closing during critical steps
      const criticalSteps = ['preparing', 'signing', 'executing'];
      if (!criticalSteps.includes(currentStep)) {
        onClose();
      }
    }
  };

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
            onClick={handleBackdropClick}
            aria-hidden="true"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              ref={modalRef}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-[#2a2016] bg-[#17110b] p-6 sm:p-8 shadow-[0_30px_100px_rgba(0,0,0,0.8)] pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="invest-modal-title"
            >
              {/* Header with close button */}
              <div className="flex items-center justify-between mb-6">
                <h2 
                  id="invest-modal-title"
                  className="text-xl font-semibold text-[var(--text-primary)]"
                >
                  Invest in this Goal
                </h2>
                <button
                  onClick={onClose}
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[#17110b] rounded p-1"
                  aria-label="Close modal"
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
              </div>

              {/* Investment flow content */}
              <div className="mt-6">
                <InvestSimpleView
                  goal={goal}
                  walletAddress={walletAddress}
                  onStepChange={setCurrentStep}
                  onSuccess={() => {
                    onSuccess?.();
                    // Keep modal open after success to show celebration
                  }}
                />
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

