'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';

export default function LoginButton({ variant = 'hero' }) {
  const router = useRouter();
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [shouldSync, setShouldSync] = useState(false);

  const handleUserSync = useCallback(async () => {
    if (!authenticated || !user) return;

    try {
      setIsLoading(true);
      setError(null);

      // Debug: Log the full user object
      console.log('Full Privy user object:', JSON.stringify(user, null, 2));

      // Get Privy access token from the hook
      const accessToken = await getAccessToken();
      
      if (!accessToken) {
        console.error('No access token available');
        setError('Failed to get access token');
        return;
      }

      // Extract Privy ID (it's user.id, not user.privyId)
      const privyId = user.id;

      // Extract email from linkedAccounts or google object
      let email = '';
      
      // Method 1: Check linkedAccounts array
      if (user.linkedAccounts && Array.isArray(user.linkedAccounts)) {
        const googleAccount = user.linkedAccounts.find(
          account => account.type === 'google_oauth'
        );
        if (googleAccount && googleAccount.email) {
          email = googleAccount.email;
        }
        
        // Fallback to email account
        if (!email) {
          const emailAccount = user.linkedAccounts.find(
            account => account.type === 'email'
          );
          if (emailAccount && emailAccount.address) {
            email = emailAccount.address;
          }
        }
      }
      
      // Method 2: Check google object directly
      if (!email && user.google?.email) {
        email = user.google.email;
      }
      
      // Method 3: Check email object
      if (!email && user.email) {
        if (typeof user.email === 'object' && user.email.address) {
          email = user.email.address;
        } else if (typeof user.email === 'string') {
          email = user.email;
        }
      }

      // Extract wallet address (Solana wallet)
      let walletAddress = null;
      if (user.wallet?.address) {
        walletAddress = user.wallet.address;
      } else if (user.linkedAccounts) {
        const solanaWallet = user.linkedAccounts.find(
          account => account.type === 'wallet' && account.walletClient === 'privy'
        );
        if (solanaWallet && solanaWallet.address) {
          walletAddress = solanaWallet.address;
        }
      }

      // Validate required fields
      if (!privyId) {
        console.error('Missing privyId (user.id)');
        setError('User ID is missing');
        return;
      }
      
      if (!email) {
        console.error('Missing email. User object:', user);
        setError('Email is missing from user profile');
        return;
      }

      console.log('Sending to backend:', {
        privyId,
        email,
        walletAddress
      });
      
      // Call our backend API to create/update user
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          privyId,
          email,
          walletAddress,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to sync user');
      }

      const data = await response.json();
      console.log('User synced successfully:', data);

      const targetRoute = data?.user?.twoFaEnabled ? '/auth/2fa/verify' : '/auth/2fa/setup';
      console.log('Redirecting to', targetRoute);
      await router.push(targetRoute);
    } catch (err) {
      console.error('Error syncing user:', err);
      setError(err.message);
      setIsLoading(false);
      setShouldSync(false);
    } finally {
      // When router.push resolves we’re on the next screen; spinner will be cleared there.
    }
  }, [authenticated, user, getAccessToken, router]);

  // Redirect to dashboard if authenticated
  useEffect(() => {
    if (shouldSync && authenticated && user) {
      handleUserSync();
    }
  }, [shouldSync, authenticated, user, handleUserSync]);

  useEffect(() => {
    if (variant === 'hero' && authenticated && user && !shouldSync && !isLoading) {
      setShouldSync(true);
    }
  }, [variant, authenticated, user, shouldSync, isLoading]);

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await login();
      setShouldSync(true);
    } catch (err) {
      console.error('Login error:', err);
      setError('Failed to login. Please try again.');
      setIsLoading(false);
      setShouldSync(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setError(null);
    } catch (err) {
      console.error('Logout error:', err);
      setError('Failed to logout. Please try again.');
    }
  };

  const handleContinue = () => {
    setError(null);
    setIsLoading(true);
    setShouldSync(true);
  };

  // Show loading state while Privy initializes (minimal, calm)
  if (!ready) {
    if (variant === 'header') {
      return (
        <div className="animate-pulse rounded-full bg-gray-200 dark:bg-gray-700 w-24 h-10"></div>
      );
    }
    return (
      <div className="flex items-center justify-center">
        <div className="animate-pulse rounded-full bg-gray-200 dark:bg-gray-700 w-48 h-12"></div>
      </div>
    );
  }

  // Show authenticated state
  if (authenticated && user) {
    if (variant === 'header') {
      // Minimal logout button in header
      return (
        <button
          onClick={handleLogout}
          className="flex h-10 min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-full border border-[var(--border-subtle)] bg-transparent px-5 text-sm font-medium text-[var(--text-primary)] transition-all hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
        >
          <span className="truncate">Logout</span>
        </button>
      );
    }
    
    // Hero section authenticated state (for account setup)
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Setting up your account…</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
        >
          Log out
        </button>
      </div>
    );
  }

  // Show login button - different styles for header vs hero
  if (variant === 'header') {
    // Header login button - minimal, rounded-full
    return (
      <button
        onClick={handleLogin}
        disabled={isLoading}
        className="flex h-10 min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-full bg-primary px-5 text-sm font-bold text-background-dark shadow-sm transition-all hover:shadow-md hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="truncate">{isLoading ? 'Connecting...' : 'Login'}</span>
      </button>
    );
  }

  // Hero CTA button - large, prominent
  return (
    <div className="flex w-full flex-col items-center gap-4 lg:items-stretch">
      {error && (
        <div className="w-full rounded-full bg-red-900/30 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}
      <button
        onClick={handleLogin}
        disabled={isLoading}
        className="btn-primary flex h-12 w-full min-w-[84px] items-center justify-center text-base disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? (
          <span className="truncate">Connecting...</span>
        ) : (
          <span className="truncate">Login & Start Tracking</span>
        )}
      </button>
    </div>
  );
}

