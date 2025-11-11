'use client';

import { useState, useEffect, useRef } from 'react';
import NumericKeypad from './NumericKeypad';

/**
 * TwoFASetup - Component for setting up 2FA PIN
 * Used for first-time users to enable 2FA
 */
export default function TwoFASetup({ onSuccess }) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1); // 1 = enter PIN, 2 = confirm PIN
  const hiddenInputRef = useRef(null);

  const validatePin = (value) => {
    if (!value) return 'PIN is required';
    if (!/^\d{6}$/.test(value)) return 'PIN must be exactly 6 digits';
    return '';
  };

  const handlePinComplete = () => {
    const pinError = validatePin(pin);
    if (pinError) {
      setError(pinError);
      return;
    }
    setError('');
    setStep(2);
  };

  // Auto-advance to step 2 when PIN is complete
  useEffect(() => {
    if (step === 1 && pin.length === 6 && !error) {
      handlePinComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, step]);

  // Auto-submit when confirmation PIN is complete
  useEffect(() => {
    if (step === 2 && confirmPin.length === 6 && !loading && !error) {
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmPin, step]);

  const handleSubmit = async () => {
    setError('');

    // Validate PIN
    const pinError = validatePin(pin);
    if (pinError) {
      setError(pinError);
      return;
    }

    // Validate confirmation
    if (pin !== confirmPin) {
      setError('PINs do not match');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pin }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to set up 2FA');
      }

      // Success!
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep(1);
    setConfirmPin('');
    setError('');
  };

  const handleDigit = (digit) => {
    if (step === 1) {
      if (pin.length < 6 && !loading) {
        setPin(pin + digit);
      }
    } else {
      if (confirmPin.length < 6 && !loading) {
        setConfirmPin(confirmPin + digit);
      }
    }
  };

  const handleBackspace = () => {
    if (step === 1) {
      if (pin.length > 0 && !loading) {
        setPin(pin.slice(0, -1));
      }
    } else {
      if (confirmPin.length > 0 && !loading) {
        setConfirmPin(confirmPin.slice(0, -1));
      }
    }
  };

  const handleKeyDown = (e) => {
    if (loading) return;
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      handleDigit(e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      handleBackspace();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    hiddenInputRef.current?.focus();
  }, [step]);

  const currentPin = step === 1 ? pin : confirmPin;

  return (
    <div className="bg-[#17110b]/95 border border-[#292018] rounded-3xl px-6 py-7 shadow-[0_32px_120px_rgba(0,0,0,0.85)] backdrop-blur-sm">
      <div className="flex flex-col items-center text-center gap-2">
        <p className="text-[10px] tracking-[0.2em] uppercase text-[var(--text-secondary)]">
          Security Checkpoint
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)]">
          {step === 1 ? 'Create your 2FA PIN' : 'Confirm your 2FA PIN'}
        </h1>
        <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-sm">
          {step === 1
            ? 'Choose a secure 6-digit PIN to protect your Wholecoiner account.'
            : 'Re-enter the same PIN so we can double check it matches.'}
        </p>
      </div>

      <div className="mt-6 flex justify-center gap-3">
        {Array.from({ length: 6 }).map((_, i) => {
          const filled = i < currentPin.length;
          return (
            <div
              key={i}
              className={[
                'w-8 h-8 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center transition-all duration-200',
                filled
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'border-[var(--border-subtle)] bg-transparent text-[#4a3d30]',
              ].join(' ')}
              aria-hidden="true"
            >
              {filled ? '•' : ''}
            </div>
          );
        })}
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-400 shake">
          {error}
        </p>
      )}
      {!error && (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">
          {step === 1
            ? 'Use only numbers. You’ll type this anytime you sign in.'
            : 'Double check—you’ll need this to unlock your dashboard.'}
        </p>
      )}

      <NumericKeypad
        onDigit={handleDigit}
        onBackspace={handleBackspace}
        disabled={loading}
      />

      <input
        ref={hiddenInputRef}
        value={currentPin}
        onChange={() => {}}
        onKeyDown={handleKeyDown}
        inputMode="numeric"
        autoComplete="one-time-code"
        className="opacity-0 pointer-events-none h-0 w-0"
      />

      <div className="mt-6 flex items-center justify-between text-xs text-[var(--text-secondary)]">
        {step === 2 ? (
          <button
            onClick={handleBack}
            disabled={loading}
            className="text-[var(--accent)] hover:underline disabled:opacity-40"
          >
            Edit PIN
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="text-[var(--accent)] hover:underline disabled:opacity-40"
        >
          {loading ? 'Saving…' : 'Save PIN'}
        </button>
      </div>

      <div className="mt-5 text-center text-[10px] text-[#7f7364]">
        Bank-level encryption • Device-aware verification
      </div>
    </div>
  );
}
