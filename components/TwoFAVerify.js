'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import NumericKeypad from './NumericKeypad';

/**
 * TwoFAVerify - Component for verifying 2FA PIN
 * Used for returning users to verify their PIN
 */
export default function TwoFAVerify({ onSuccess, onLocked }) {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remainingAttempts, setRemainingAttempts] = useState(5);
  const hiddenInputRef = useRef(null);

  const handleSubmit = async () => {
    setError('');

    // Validate PIN format
    if (!/^\d{6}$/.test(pin)) {
      setError('PIN must be exactly 6 digits');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pin }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle different error scenarios
        if (response.status === 423) {
          // Account locked
          if (onLocked) {
            onLocked(data.error?.retryAfterMinutes || 10);
          } else {
            router.push('/auth/2fa/locked');
          }
          return;
        }

        if (response.status === 403) {
          // Invalid PIN
          setError(data.error?.message || 'Incorrect code. ' + (data.error?.remainingAttempts || remainingAttempts - 1) + ' attempts remaining.');
          if (data.error?.remainingAttempts !== undefined) {
            setRemainingAttempts(data.error.remainingAttempts);
          } else {
            // Decrement attempts locally if not provided
            setRemainingAttempts(prev => Math.max(0, prev - 1));
          }
          setPin(''); // Clear PIN for retry
          setLoading(false);
          return;
        }

        throw new Error(data.error?.message || 'Verification failed');
      }

      // Success!
      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (pin.length === 6 && !loading) {
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const handleDigit = (digit) => {
    if (pin.length < 6 && !loading) {
      setPin(pin + digit);
    }
  };

  const handleBackspace = () => {
    if (pin.length > 0 && !loading) {
      setPin(pin.slice(0, -1));
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
  }, []);

  return (
    <div className="bg-[#17110b]/95 border border-[#292018] rounded-3xl px-6 py-7 shadow-[0_32px_120px_rgba(0,0,0,0.85)] backdrop-blur-sm">
      <div className="flex flex-col items-center text-center gap-2">
        <p className="text-[10px] tracking-[0.2em] uppercase text-[var(--text-secondary)]">
          Security Checkpoint
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)]">
          Enter your pin
        </h1>
        <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-sm">
          Because your progress deserves real protection.
        </p>
      </div>

      <div className="mt-6 flex justify-center gap-3">
        {Array.from({ length: 6 }).map((_, i) => {
          const filled = i < pin.length;
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
        <p className="mt-4 text-sm text-red-400 animate-[shake_0.25s_ease-in-out]">
          {error}
        </p>
      )}
      {!error && remainingAttempts < 5 && remainingAttempts > 0 && (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">
          {remainingAttempts} {remainingAttempts === 1 ? 'attempt' : 'attempts'} remaining
        </p>
      )}
      {!error && remainingAttempts === 5 && (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">
          Didn&apos;t receive a code?{' '}
          <button type="button" className="text-[var(--accent)] hover:underline">
            Resend
          </button>
        </p>
      )}

      <NumericKeypad
        onDigit={handleDigit}
        onBackspace={handleBackspace}
        disabled={loading}
      />

      <input
        ref={hiddenInputRef}
        value={pin}
        onChange={() => {}}
        onKeyDown={handleKeyDown}
        inputMode="numeric"
        autoComplete="one-time-code"
        className="opacity-0 pointer-events-none h-0 w-0"
      />
    </div>
  );
}
