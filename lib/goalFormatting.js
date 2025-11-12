export const STATUS_META = {
  ACTIVE: {
    label: 'On Track',
    dotClass: 'bg-green-500',
    glowClass: 'shadow-[0_0_0_1px_rgba(34,197,94,0.25)]',
  },
  PAUSED: {
    label: 'Paused',
    dotClass: 'bg-yellow-400',
    glowClass: 'shadow-[0_0_0_1px_rgba(250,204,21,0.25)]',
  },
  COMPLETED: {
    label: 'Achieved',
    dotClass: 'bg-[var(--accent)]',
    glowClass: 'shadow-[0_0_0_1px_rgba(255,159,28,0.25)]',
  },
  CANCELLED: {
    label: 'Closed',
    dotClass: 'bg-slate-500',
    glowClass: 'shadow-[0_0_0_1px_rgba(148,163,184,0.25)]',
  },
};

export const STATUS_ORDER = ['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'];

export const FREQUENCY_LABELS = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
};

export const formatDate = (isoString, options = { month: 'long', year: 'numeric' }) => {
  if (!isoString) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', options).format(new Date(isoString));
  } catch {
    return '—';
  }
};

export const formatNumber = (value, maximumFractionDigits = 6) => {
  const numericValue = Number(value ?? 0);
  if (Number.isNaN(numericValue)) return '—';
  return numericValue.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
};

export const formatCurrencyUSD = (value) => {
  const numericValue = Number(value ?? 0);
  if (!numericValue) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: numericValue >= 1000 ? 0 : 2,
  }).format(numericValue);
};

export const deriveProgress = (goal) => {
  const explicit = Number(goal?.progressPercentage);
  if (!Number.isNaN(explicit) && Number.isFinite(explicit)) {
    return Math.min(100, Math.max(0, explicit));
  }

  const invested = Number(goal?.investedAmount ?? 0);
  const target = Number(goal?.targetAmount ?? 0);
  if (!target) return 0;
  return Math.min(100, Math.max(0, (invested / target) * 100));
};

