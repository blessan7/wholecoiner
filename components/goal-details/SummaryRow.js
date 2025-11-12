import { motion } from 'framer-motion';

import ProgressBar from '@/components/ProgressBar';
import { fadeInUp } from '@/lib/motion';
import { formatCurrencyUSD, formatDate, formatNumber } from '@/lib/goalFormatting';

const SummaryCard = ({ title, children, delay = 0 }) => (
  <motion.div
    variants={fadeInUp}
    initial="hidden"
    animate="visible"
    transition={{ delay }}
    className="rounded-3xl border border-[var(--border-subtle)] bg-[#17110b]/85 p-6 sm:p-7 shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
  >
    <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
    <div className="mt-5 flex flex-col gap-4">{children}</div>
  </motion.div>
);

export function ProgressOverviewCard({ progressPct, investedAmount, targetAmount, asset, estimatedCompletion }) {
  return (
    <SummaryCard title="Progress Overview">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <span className="text-[0.7rem] uppercase tracking-[0.28em] text-[var(--text-secondary)]">Completion</span>
          <span className="font-headline text-4xl font-semibold text-[var(--text-primary)] tabular-nums">
            {progressPct.toFixed(1)}%
          </span>
          <span className="text-xs text-[var(--text-secondary)]">
            {formatNumber(investedAmount, 6)} {asset} stacked
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[0.7rem] uppercase tracking-[0.28em] text-[var(--text-secondary)]">Time Remaining</span>
          <span className="font-headline text-2xl text-[var(--text-primary)]">
            {estimatedCompletion ?? '—'}
          </span>
          <span className="text-xs text-[var(--text-secondary)]">Based on your current cadence</span>
        </div>
      </div>
      <div className="mt-4">
        <ProgressBar
          value={progressPct}
          label={`${progressPct.toFixed(1)}%`}
          ariaLabel={`Goal progress ${progressPct.toFixed(1)} percent`}
        />
        <div className="mt-2 flex justify-between text-xs uppercase tracking-[0.22em] text-[var(--text-secondary)]">
          <span>{formatNumber(0, 0)}</span>
          <span>{formatNumber(targetAmount, 6)} {asset}</span>
        </div>
      </div>
    </SummaryCard>
  );
}

export function FinancialSummaryCard({ currentPrice, currentValue, targetValue, remainingValue, remainingAsset, asset }) {
  return (
    <SummaryCard title="Financial Summary" delay={0.05}>
      <dl className="grid grid-cols-1 gap-3 text-sm text-[var(--text-secondary)]">
        <div className="flex items-center justify-between">
          <dt>Current Price</dt>
          <dd className="font-semibold text-[var(--text-primary)] tabular-nums">{formatCurrencyUSD(currentPrice)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt>Current Value</dt>
          <dd className="font-semibold text-[var(--text-primary)] tabular-nums">{formatCurrencyUSD(currentValue)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt>Target Value</dt>
          <dd className="font-semibold text-[var(--text-primary)] tabular-nums">{formatCurrencyUSD(targetValue)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt>Remaining</dt>
          <dd className="font-semibold text-[var(--text-primary)] tabular-nums">
            {formatCurrencyUSD(remainingValue)} · {formatNumber(remainingAsset, 6)} {asset}
          </dd>
        </div>
      </dl>
    </SummaryCard>
  );
}

export function InvestmentPlanCard({ frequency, amountPerIntervalUSD, nextInvestmentAt, estimatedCompletionAt }) {
  return (
    <SummaryCard title="Investment Plan" delay={0.1}>
      <dl className="grid grid-cols-1 gap-3 text-sm text-[var(--text-secondary)]">
        <div className="flex items-center justify-between">
          <dt>Frequency</dt>
          <dd className="font-semibold text-[var(--text-primary)] uppercase tracking-[0.18em]">{frequency ?? '—'}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt>Amount per Interval</dt>
          <dd className="font-semibold text-[var(--text-primary)] tabular-nums">{formatCurrencyUSD(amountPerIntervalUSD)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt>Next Investment</dt>
          <dd className="font-semibold text-[var(--text-primary)]">
            {nextInvestmentAt ? formatDate(nextInvestmentAt, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt>Est. Completion</dt>
          <dd className="font-semibold text-[var(--text-primary)]">
            {estimatedCompletionAt
              ? formatDate(estimatedCompletionAt, { day: 'numeric', month: 'short', year: 'numeric' })
              : '—'}
          </dd>
        </div>
      </dl>
    </SummaryCard>
  );
}

export default function SummaryRow(props) {
  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <ProgressOverviewCard {...props.progress} />
      <FinancialSummaryCard {...props.financial} />
      <InvestmentPlanCard {...props.plan} />
    </section>
  );
}

