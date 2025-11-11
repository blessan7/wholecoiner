'use client';

import { useRouter } from 'next/navigation';

/**
 * GoalCard - Reusable goal card component
 * Displays goal title, status, amounts, progress bar, and completion percentage
 */
export default function GoalCard({ goal }) {
  const router = useRouter();
  
  const progressPercentage = goal.progressPercentage || 0;
  const status = goal.status || 'ACTIVE';
  const isCompleted = status === 'COMPLETED';
  
  // Format invested amount (in USD equivalent - simplified for now)
  const formatAmount = (amount, coin) => {
    if (!amount) return '$0';
    // For now, show the crypto amount - in real implementation, convert to USD
    return `${parseFloat(amount).toFixed(6)} ${coin}`;
  };

  const formatTargetAmount = (amount, coin) => {
    return `${parseFloat(amount).toFixed(6)} ${coin}`;
  };

  const handleClick = () => {
    router.push(`/goals/${goal.id}`);
  };

  return (
    <div
      onClick={handleClick}
      className="flex flex-col gap-4 rounded-lg border border-border-light bg-card-light p-6 shadow-soft transition-shadow hover:shadow-soft-md cursor-pointer dark:border-border-dark dark:bg-card-dark dark:shadow-none"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-text-primary-light dark:text-text-primary-dark">
          {goal.coin} Wholecoin
        </h3>
        <div className={`rounded-full px-3 py-1 text-xs font-medium ${
          isCompleted 
            ? 'bg-positive/10 text-positive dark:bg-positive/20'
            : 'bg-primary/10 text-primary dark:bg-primary/20'
        }`}>
          {status === 'ACTIVE' ? 'Active' : status === 'PAUSED' ? 'Paused' : 'Completed'}
        </div>
      </div>
      <div className="flex items-end justify-between">
        <p className={`text-2xl font-bold ${
          isCompleted 
            ? 'text-positive' 
            : 'text-text-primary-light dark:text-text-primary-dark'
        }`}>
          {formatAmount(goal.investedAmount, goal.coin)}
        </p>
        <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark">
          of {formatTargetAmount(goal.targetAmount, goal.coin)}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-2 w-full rounded-full bg-background-light dark:bg-background-dark">
          <div
            className={`h-2 rounded-full ${
              isCompleted ? 'bg-positive' : 'bg-primary'
            }`}
            style={{ width: `${Math.min(progressPercentage, 100)}%` }}
          />
        </div>
        <p className="text-right text-xs text-text-secondary-light dark:text-text-secondary-dark">
          {progressPercentage.toFixed(1)}% Complete
        </p>
      </div>
    </div>
  );
}

