'use client';

import InvestFlow from '@/components/InvestFlow';

/**
 * Debug view wrapper for investment flow
 * Wraps existing InvestFlow component with debug header
 */
export default function InvestDebugView({ goalId, goalCoin, onSuccess }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
        <h3 className="text-sm font-semibold text-yellow-200 mb-1">
          Debug Tools (Developer Only)
        </h3>
        <p className="text-xs text-yellow-200/70">
          This view contains technical debugging tools and raw transaction data. 
          Use this to validate individual steps without touching live funds.
        </p>
      </div>
      
      <InvestFlow
        goalId={goalId}
        goalCoin={goalCoin}
        onSuccess={onSuccess}
      />
    </div>
  );
}

