'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * TwoFALocked - Component shown when user is locked out
 * Displays countdown timer and warning message
 */
export default function TwoFALocked({ lockoutMinutes = 10, onUnlock }) {
  const router = useRouter();
  const [timeRemaining, setTimeRemaining] = useState(lockoutMinutes * 60); // Convert to seconds

  useEffect(() => {
    // Countdown timer
    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // Redirect or callback when unlocked
          if (onUnlock) {
            onUnlock();
          } else {
            router.push('/auth/2fa/verify');
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [onUnlock, router]);

  // Format time as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex w-full max-w-sm flex-col items-center rounded-lg p-4 text-center">
      {/* Header Text */}
      <h1 className="text-3xl font-bold tracking-tight text-white">
        Account Temporarily Locked
      </h1>
      <p className="mt-2 text-base text-white">
        Too many failed PIN attempts
      </p>

      {/* Countdown Timer */}
      <div className="mt-8">
        <div className="text-center">
          <div className="text-5xl font-bold text-white font-mono">
            {formatTime(timeRemaining)}
          </div>
          <p className="mt-3 text-sm text-white">
            Try again after the countdown ends
          </p>
        </div>
      </div>

      {/* Explanation */}
      <div className="mt-8 space-y-4 text-sm text-white text-left max-w-md">
        <p>
          For your security, we&apos;ve temporarily locked your account after 5 failed PIN attempts. After the countdown ends, you&apos;ll be able to try entering your PIN again.
        </p>
        <p>
          If you&apos;ve forgotten your PIN, please contact support for assistance.
        </p>
      </div>

      {/* Contact Support Button */}
      <div className="mt-8">
        <button
          onClick={() => router.push('/support')}
          className="flex h-10 min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-full bg-keypad-light px-5 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md hover:-translate-y-px dark:bg-keypad-dark"
        >
          <span className="truncate">Contact Support</span>
        </button>
      </div>

      {/* Auto-refresh notice */}
      <div className="mt-6 text-center">
        <p className="text-xs text-white">
          This page will automatically redirect when the lockout period ends
        </p>
      </div>
    </div>
  );
}
