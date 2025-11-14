'use client';

import { useMemo } from 'react';

const NETWORK_CLUSTER = {
  DEVNET: 'devnet',
  MAINNET: 'mainnet-beta',
};

export default function HoldingsDetailModal({ holding, onClose }) {
  const explorerRows = useMemo(() => {
    if (!holding?.swaps) return [];
    return holding.swaps.map((swap) => {
      const cluster = NETWORK_CLUSTER[swap.network] || 'mainnet-beta';
      return {
        ...swap,
        explorerUrl: swap.txnHash
          ? `https://explorer.solana.com/tx/${swap.txnHash}?cluster=${cluster}`
          : null,
      };
    });
  }, [holding?.swaps]);

  if (!holding) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8 backdrop-blur">
      <div className="relative w-full max-w-3xl rounded-3xl border border-[#292018] bg-[#150e08] p-6 text-[var(--text-primary)] shadow-[0_36px_120px_rgba(0,0,0,0.75)]">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-[#3a2b1f] px-3 py-1 text-xs uppercase tracking-[0.18em] text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
        >
          Close
        </button>

        <header className="mb-6 space-y-2 text-left">
          <p className="text-[0.65rem] uppercase tracking-[0.28em] text-[var(--text-secondary)]">
            Holding details
          </p>
          <h2 className="text-2xl font-semibold">
            {holding.coin} &bull; {holding.goals?.length || 0} goal
            {holding.goals?.length === 1 ? '' : 's'}
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Total accumulated: {holding.totalAmount?.toFixed(6) ?? '0'} {holding.coin}
          </p>
        </header>

        <section className="space-y-5">
          <div className="rounded-2xl border border-[#2f2117] bg-[#1b120a] p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
              Recent swaps
            </h3>
            {explorerRows.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                No confirmed swaps yet. Once a swap is executed on-chain it will appear here.
              </p>
            ) : (
              <div className="mt-4 max-h-80 overflow-y-auto pr-1 text-sm">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-xs uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                      <th className="pb-2 text-left font-medium">When</th>
                      <th className="pb-2 text-left font-medium">Amount</th>
                      <th className="pb-2 text-left font-medium">USD</th>
                      <th className="pb-2 text-left font-medium">Status</th>
                      <th className="pb-2 text-left font-medium">Explorer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {explorerRows.map((swap) => (
                      <tr key={swap.id} className="border-t border-[#2f2117]">
                        <td className="py-3 align-top text-[var(--text-secondary)]">
                          {new Date(swap.timestamp).toLocaleString()}
                        </td>
                        <td className="py-3 align-top">
                          {Number(swap.amountCrypto || 0).toFixed(6)} {holding.coin}
                        </td>
                        <td className="py-3 align-top text-[var(--text-secondary)]">
                          {swap.amountUsd ? `$${swap.amountUsd.toFixed(2)}` : '—'}
                        </td>
                        <td className="py-3 align-top">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${
                              swap.simulated
                                ? 'bg-yellow-900/40 text-yellow-300'
                                : 'bg-emerald-900/40 text-emerald-200'
                            }`}
                          >
                            {swap.simulated ? 'Simulated' : 'On-chain'}
                            {swap.state ? ` • ${swap.state}` : ''}
                          </span>
                        </td>
                        <td className="py-3 align-top">
                          {swap.explorerUrl ? (
                            <a
                              href={swap.explorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-full border border-[#3a2b1f] px-3 py-1 text-xs uppercase tracking-[0.16em] text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10"
                            >
                              View
                            </a>
                          ) : (
                            <span className="text-[var(--text-secondary)]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#2f2117] bg-[#1b120a] p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
              Linked goals
            </h3>
            {holding.goals?.length ? (
              <ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                {holding.goals.map((goal) => (
                  <li key={goal.id} className="flex items-center justify-between rounded-xl border border-[#2f2117] bg-[#1f150d] px-3 py-2">
                    <span>
                      Goal #{goal.id.slice(0, 6)} • {goal.amount.toFixed(6)} {holding.coin}
                    </span>
                    <span className="uppercase tracking-[0.18em] text-xs">
                      {goal.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                No goals associated with this holding yet.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

