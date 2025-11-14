'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSolanaWallet, signSolanaTransaction } from '@/lib/solana-wallet';

const ADMIN_ALLOWLIST = (process.env.NEXT_PUBLIC_ADMIN_EMAIL_ALLOWLIST || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

function generateBatchId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export default function InternalSolanaTransferPage() {
  const router = useRouter();
  const solanaWallet = useSolanaWallet();

  const [adminStatus, setAdminStatus] = useState('loading'); // loading | allowed | denied | error
  const [profile, setProfile] = useState(null);
  const [batchId, setBatchId] = useState(generateBatchId);
  const [form, setForm] = useState({
    fromUserId: '',
    fromAddress: '',
    toAddress: '',
    amountSol: '',
    memo: '',
  });
  const [prepareResult, setPrepareResult] = useState(null);
  const [submitResult, setSubmitResult] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [errors, setErrors] = useState({
    admin: '',
    prepare: '',
    submit: '',
  });
  const [loading, setLoading] = useState({
    prepare: false,
    submit: false,
  });

  const isWalletConnected = useMemo(() => Boolean(solanaWallet), [solanaWallet]);

  useEffect(() => {
    async function verifyAdmin() {
      try {
        setAdminStatus('loading');
        const response = await fetch('/api/user', {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          if (response.status === 401) {
            router.push('/');
            return;
          }
          if (response.status === 403) {
            setAdminStatus('denied');
            setErrors((prev) => ({
              ...prev,
              admin: 'Two-factor verification required before accessing admin tools.',
            }));
            return;
          }

          const errorBody = await safeJson(response);
          throw new Error(errorBody?.error?.message || 'Failed to load user profile');
        }

        const data = await response.json();
        const email = data?.user?.email?.toLowerCase();

        if (!email) {
          setAdminStatus('denied');
          setErrors((prev) => ({
            ...prev,
            admin: 'Current account has no email on record. Admin access denied.',
          }));
          return;
        }

        const isAllowlisted =
          ADMIN_ALLOWLIST.length === 0 || ADMIN_ALLOWLIST.includes(email);

        if (!isAllowlisted) {
          setAdminStatus('denied');
          setErrors((prev) => ({
            ...prev,
            admin: 'You are not on the admin allowlist for internal transfers.',
          }));
          return;
        }

        setProfile(data.user);
        setAdminStatus('allowed');
      } catch (error) {
        setAdminStatus('error');
        setErrors((prev) => ({
          ...prev,
          admin: error.message || 'Failed to verify admin access.',
        }));
      }
    }

    verifyAdmin();
  }, [router]);

  const handleFieldChange = (field) => (event) => {
    setForm((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const resetFlow = () => {
    setPrepareResult(null);
    setSubmitResult(null);
    setStatusMessage('');
    setErrors((prev) => ({ ...prev, prepare: '', submit: '' }));
    setBatchId(generateBatchId());
  };

  const handlePrepare = async () => {
    setLoading((prev) => ({ ...prev, prepare: true }));
    setErrors((prev) => ({ ...prev, prepare: '' }));
    setStatusMessage('');
    setSubmitResult(null);

    try {
      if (!form.toAddress || !form.amountSol) {
        throw new Error('Destination address and amount in SOL are required.');
      }

      const payload = {
        mode: 'prepare',
        batchId,
        fromUserId: form.fromUserId || undefined,
        fromAddress: form.fromAddress || undefined,
        toAddress: form.toAddress,
        amountSol: Number(form.amountSol),
        memo: form.memo || undefined,
      };

      const response = await fetch('/api/internal/solana/transfer', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = await safeJson(response);
      if (!response.ok || !body?.success) {
        throw new Error(body?.error?.message || 'Failed to prepare transfer.');
      }

      setPrepareResult(body.transfer);
      setStatusMessage('Unsigned transaction ready. Review details before signing.');
    } catch (error) {
      setErrors((prev) => ({
        ...prev,
        prepare: error.message || 'Failed to prepare transfer.',
      }));
    } finally {
      setLoading((prev) => ({ ...prev, prepare: false }));
    }
  };

  const handleSignAndSubmit = async () => {
    if (!prepareResult) {
      setErrors((prev) => ({
        ...prev,
        submit: 'Prepare a transfer before signing.',
      }));
      return;
    }

    if (!isWalletConnected) {
      setErrors((prev) => ({
        ...prev,
        submit: 'Connect your Privy Solana wallet to sign the transfer.',
      }));
      return;
    }

    setLoading((prev) => ({ ...prev, submit: true }));
    setErrors((prev) => ({ ...prev, submit: '' }));
    setStatusMessage('Prompting wallet for signature…');

    try {
      const signed = await signSolanaTransaction(
        solanaWallet,
        prepareResult.unsignedTransaction
      );

      setStatusMessage('Submitting signed transaction...');

      const response = await fetch('/api/internal/solana/transfer', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'submit',
          batchId,
          signedTransaction: signed,
          expectedFromAddress: prepareResult.fromAddress,
        }),
      });

      const body = await safeJson(response);
      if (body?.retryable && body?.transfer) {
        setPrepareResult(body.transfer);
        setSubmitResult(null);
        setStatusMessage(
          body?.error?.message ||
            'Transaction payload refreshed with a new blockhash. Please sign again promptly.'
        );
        setErrors((prev) => ({ ...prev, submit: '' }));
        return;
      }

      if (!response.ok || !body?.success) {
        throw new Error(body?.error?.message || 'Failed to submit transfer.');
      }

      setSubmitResult(body);
      setErrors((prev) => ({ ...prev, submit: '' }));
      setStatusMessage('Transfer submitted to Solana. Await confirmation.');
    } catch (error) {
      setErrors((prev) => ({
        ...prev,
        submit: error.message || 'Failed to sign or submit transfer.',
      }));
      setStatusMessage('');
    } finally {
      setLoading((prev) => ({ ...prev, submit: false }));
    }
  };

  if (adminStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0c0805] text-[var(--text-primary)]">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          <p className="text-sm text-[var(--text-secondary)]">
            Verifying admin access…
          </p>
        </div>
      </div>
    );
  }

  if (adminStatus !== 'allowed') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0c0805] text-[var(--text-primary)]">
        <div className="max-w-md rounded-2xl border border-[#2a2018] bg-[#15100a] p-6 shadow-xl">
          <h1 className="text-lg font-semibold text-red-400">Access restricted</h1>
          <p className="mt-3 text-sm text-[var(--text-secondary)]">
            {errors.admin ||
              'You do not have permission to access the internal transfer console.'}
          </p>
          <button
            type="button"
            className="mt-6 w-full rounded-lg border border-[#2a2018] px-4 py-2 text-sm text-[var(--text-secondary)] transition hover:text-[var(--accent)]"
            onClick={() => router.push('/dashboard')}
          >
            Return to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0805] p-6 text-[var(--text-primary)]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <div className="text-xs uppercase tracking-[0.28em] text-[var(--text-secondary)]">
            Internal Tools • Solana
          </div>
          <h1 className="text-2xl font-semibold">Admin Transfer Console</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Prepare, sign, and submit SOL transfers using Privy embedded wallets. All
            actions are logged under batch ID <span className="font-mono">{batchId}</span>.
          </p>
          <div className="mt-2 text-xs text-[var(--text-secondary)]">
            Signed in as <span className="font-semibold">{profile?.email}</span>
          </div>
        </header>

        <section className="rounded-2xl border border-[#2a2018] bg-[#15100a] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Transfer details</h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Provide the source user (ID or wallet), destination address, and amount.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setBatchId(generateBatchId());
                setStatusMessage('New batch ID generated.');
              }}
              className="rounded-lg border border-[#2a2018] px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:text-[var(--accent)]"
            >
              Regenerate batch
            </button>
          </div>

          <div className="mt-4 grid gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span>Source user ID (optional)</span>
              <input
                type="text"
                value={form.fromUserId}
                onChange={handleFieldChange('fromUserId')}
                placeholder="cuid of source user"
                className="rounded-lg border border-[#302419] bg-[#120b07] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span>Source wallet address (optional override)</span>
              <input
                type="text"
                value={form.fromAddress}
                onChange={handleFieldChange('fromAddress')}
                placeholder="Defaults to user's wallet if blank"
                className="rounded-lg border border-[#302419] bg-[#120b07] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span>Destination wallet address</span>
              <input
                type="text"
                value={form.toAddress}
                onChange={handleFieldChange('toAddress')}
                placeholder="Recipient Solana address"
                className="rounded-lg border border-[#302419] bg-[#120b07] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span>Amount (SOL)</span>
              <input
                type="number"
                min="0"
                step="0.000000001"
                value={form.amountSol}
                onChange={handleFieldChange('amountSol')}
                placeholder="0.00"
                className="rounded-lg border border-[#302419] bg-[#120b07] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span>Memo (optional)</span>
              <input
                type="text"
                value={form.memo}
                onChange={handleFieldChange('memo')}
                placeholder="Internal reference only"
                className="rounded-lg border border-[#302419] bg-[#120b07] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
            </label>
          </div>

          {errors.prepare && (
            <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {errors.prepare}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={handlePrepare}
              disabled={loading.prepare}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#0f0805] shadow-[0_16px_40px_rgba(255,159,28,0.35)] transition disabled:cursor-not-allowed disabled:bg-[#8b6b45]"
            >
              {loading.prepare ? 'Preparing…' : 'Prepare transfer'}
            </button>
            <button
              type="button"
              onClick={resetFlow}
              className="rounded-lg border border-[#2a2018] px-4 py-2 text-sm text-[var(--text-secondary)] transition hover:text-[var(--accent)]"
            >
              Reset
            </button>
          </div>
        </section>

        {prepareResult && (
          <section className="rounded-2xl border border-[#2a2018] bg-[#15100a] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Prepared transaction</h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Review details, then sign with the connected Privy wallet.
                </p>
              </div>
              <span className="rounded-full border border-[#2a2018] px-3 py-1 text-xs text-[var(--text-secondary)]">
                Wallet {isWalletConnected ? 'connected' : 'not connected'}
              </span>
            </div>

            <dl className="mt-4 grid gap-2 text-sm text-[var(--text-secondary)]">
              <Detail label="From">{prepareResult.fromAddress}</Detail>
              <Detail label="To">{prepareResult.toAddress}</Detail>
              <Detail label="Amount (SOL)">
                {prepareResult.amountSol} ({prepareResult.lamports} lamports)
              </Detail>
              <Detail label="Recent blockhash">{prepareResult.recentBlockhash}</Detail>
              <Detail label="Fee estimate (lamports)">
                {prepareResult.feeEstimateLamports ?? 'n/a'}
              </Detail>
              <Detail label="Memo">{prepareResult.memo ?? '—'}</Detail>
            </dl>

            <div className="mt-4">
              <textarea
                readOnly
                value={prepareResult.unsignedTransaction}
                className="h-40 w-full resize-none rounded-lg border border-[#302419] bg-[#120b07] px-3 py-2 text-xs font-mono text-[var(--text-secondary)]"
              />
            </div>

            {errors.submit && (
              <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {errors.submit}
              </div>
            )}

            <button
              type="button"
              onClick={handleSignAndSubmit}
              disabled={loading.submit}
              className="mt-4 w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#04100a] shadow-[0_16px_40px_rgba(16,185,129,0.35)] transition disabled:cursor-not-allowed disabled:bg-emerald-800/50"
            >
              {loading.submit ? 'Signing & submitting…' : 'Sign with Privy & submit'}
            </button>
          </section>
        )}

        {(statusMessage || submitResult) && (
          <section className="rounded-2xl border border-[#2a2018] bg-[#15100a] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
            <h2 className="text-lg font-semibold">Status</h2>
            {statusMessage && (
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{statusMessage}</p>
            )}
            {submitResult?.signature && (
              <div className="mt-4 space-y-2 text-sm text-[var(--text-secondary)]">
                <Detail label="Signature">{submitResult.signature}</Detail>
                {submitResult.explorerUrl && (
                  <Detail label="Explorer">
                    <a
                      href={submitResult.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent)] underline"
                    >
                      View on Solscan
                    </a>
                  </Detail>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Detail({ label, children }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-[#120b07] px-3 py-2 text-xs">
      <span className="uppercase tracking-[0.22em] text-[var(--text-secondary)]">
        {label}
      </span>
      <span className="break-all text-[var(--text-primary)]">{children}</span>
    </div>
  );
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

