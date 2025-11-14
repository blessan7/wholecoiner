'use client';

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { fadeInUp } from '@/lib/motion';
import InvestSimpleView from './InvestSimpleView';
import InvestDebugView from './InvestDebugView';
import TransactionsSection from '@/components/goal-details/TransactionsSection';

/**
 * Main shell component for investment flow
 * Manages tabs (Invest/Debug) and renders appropriate view
 */
export default function InvestNowShell({ goal, walletAddress, showDebug, onSuccess }) {
  const [activeTab, setActiveTab] = useState('invest');
  const transactionHistoryRef = useRef(null);

  return (
    <motion.section
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      className="rounded-3xl border border-[var(--border-subtle)] bg-[#17110b]/90 p-6 sm:p-7 shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Invest in this Goal</h2>
        <div className="inline-flex rounded-full border border-[#292018] bg-[#1b120a] p-1 text-xs uppercase tracking-[0.18em] text-[var(--text-secondary)]">
          <button
            type="button"
            onClick={() => setActiveTab('invest')}
            className={`rounded-full px-3 py-1 transition ${
              activeTab === 'invest' ? 'bg-[var(--accent)] text-[#0d0804]' : 'hover:text-[var(--accent)]'
            }`}
          >
            Invest
          </button>
          {showDebug && (
            <button
              type="button"
              onClick={() => setActiveTab('debug')}
              className={`rounded-full px-3 py-1 transition ${
                activeTab === 'debug' ? 'bg-[var(--accent)] text-[#0d0804]' : 'hover:text-[var(--accent)]'
              }`}
            >
              Debug
            </button>
          )}
        </div>
      </div>

      <div className="mt-6">
        {activeTab === 'invest' ? (
          <InvestSimpleView
            goal={goal}
            walletAddress={walletAddress}
            onSuccess={() => {
              onSuccess?.();
              transactionHistoryRef.current?.refresh();
            }}
          />
        ) : (
          <InvestDebugView
            goalId={goal?.id}
            goalCoin={goal?.coin}
            onSuccess={() => {
              onSuccess?.();
              transactionHistoryRef.current?.refresh();
            }}
          />
        )}
      </div>

      {/* Transaction History at the bottom */}
      <div className="mt-8">
        <TransactionsSection
          goalId={goal?.id}
          onRefresh={() => transactionHistoryRef.current?.refresh()}
          transactionsRef={transactionHistoryRef}
        />
      </div>
    </motion.section>
  );
}

