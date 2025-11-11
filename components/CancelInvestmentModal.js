'use client';

import { useState, useEffect } from 'react';

/**
 * CancelInvestmentModal component
 * Modal for canceling an investment with cooldown and type-to-confirm
 */
export default function CancelInvestmentModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  batchId,
  goalInfo,
  progressInfo 
}) {
  const [confirmText, setConfirmText] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(10);
  const [canConfirm, setCanConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const REQUIRED_TEXT = 'PAUSE';

  useEffect(() => {
    if (!isOpen) {
      // Reset state when modal closes
      setConfirmText('');
      setCooldownSeconds(10);
      setCanConfirm(false);
      setLoading(false);
      return;
    }

    // Start cooldown timer
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  useEffect(() => {
    const textMatches = confirmText.toUpperCase().trim() === REQUIRED_TEXT;
    setCanConfirm(cooldownSeconds === 0 && textMatches);
  }, [confirmText, cooldownSeconds]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!canConfirm || loading) return;

    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error('Cancel failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const progressPercentage = progressInfo?.progressPercentage || 0;
  const investedAmount = progressInfo?.investedAmount || 0;
  const goalCoin = goalInfo?.coin || 'token';
  const targetAmount = goalInfo?.targetAmount || 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4 text-black">Pause this goal?</h2>
        
        {/* Progress Summary */}
        {progressInfo && (
          <div className="bg-gray-50 rounded p-4 mb-4">
            <p className="text-sm text-black mb-2">
              You&apos;re <span className="font-semibold">{progressPercentage.toFixed(1)}%</span> complete and 
              have accumulated <span className="font-semibold">{investedAmount.toFixed(6)} {goalCoin}</span> 
              {targetAmount > 0 && (
                <> towards your goal of <span className="font-semibold">{targetAmount} {goalCoin}</span>.</>
              )}
            </p>
            <p className="text-xs text-black">
              Pausing stops new purchases; your existing holdings remain yours.
            </p>
          </div>
        )}

        {/* Warning */}
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
          <p className="text-sm text-black">
            <strong>Note:</strong> Cancel stops new buys. Your existing {investedAmount.toFixed(6)} {goalCoin} remains yours.
          </p>
        </div>

        {/* Type to confirm */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-black mb-2">
            Type <strong>{REQUIRED_TEXT}</strong> to confirm:
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={REQUIRED_TEXT}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={cooldownSeconds > 0}
          />
        </div>

        {/* Cooldown message */}
        {cooldownSeconds > 0 && (
          <p className="text-xs text-black mb-4">
            Please wait {cooldownSeconds} second{cooldownSeconds !== 1 ? 's' : ''} before confirming...
          </p>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || loading}
            className={`flex-1 px-4 py-2 rounded-md font-medium ${
              canConfirm && !loading
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {loading ? 'Canceling...' : 'Confirm Cancel'}
          </button>
          
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-md font-medium bg-gray-200 text-gray-700 hover:bg-gray-300"
            disabled={loading}
          >
            Keep Investing
          </button>
        </div>

        {/* Alternative: Reduce amount */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <button
            onClick={() => {
              onClose();
              // This would trigger a different flow - for now just close
              // Could emit an event or call a callback
            }}
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Lower monthly amount instead
          </button>
        </div>
      </div>
    </div>
  );
}

