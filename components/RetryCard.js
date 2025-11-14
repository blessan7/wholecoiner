'use client';

/**
 * RetryCard - Shows actionable guidance for common errors
 */
export default function RetryCard({ error, onRetry, onCancel }) {
  // Parse error to provide specific guidance
  const getErrorGuidance = (errorMessage) => {
    const msg = errorMessage?.toLowerCase() || '';
    
    if (msg.includes('insufficient sol') || msg.includes('low sol')) {
      return {
        title: 'Insufficient SOL Balance',
        description: 'You need SOL in your wallet to pay for transaction fees.',
        actions: [
          { label: 'Add SOL to Wallet', action: 'fund', primary: true },
          { label: 'Cancel', action: 'cancel', primary: false },
        ],
      };
    }
    
    if (msg.includes('quote expired') || msg.includes('blockhash')) {
      return {
        title: 'Quote Expired',
        description: 'The swap quote has expired. Please try again with a fresh quote.',
        actions: [
          { label: 'Get New Quote', action: 'retry', primary: true },
          { label: 'Cancel', action: 'cancel', primary: false },
        ],
      };
    }
    
    if (msg.includes('slippage')) {
      return {
        title: 'Slippage Exceeded',
        description: 'The price moved too much. Try again or increase slippage tolerance.',
        actions: [
          { label: 'Retry Swap', action: 'retry', primary: true },
          { label: 'Cancel', action: 'cancel', primary: false },
        ],
      };
    }
    
    if (msg.includes('ata') || msg.includes('token account')) {
      return {
        title: 'Token Account Issue',
        description: 'There was an issue with your token account. Please try again.',
        actions: [
          { label: 'Retry', action: 'retry', primary: true },
          { label: 'Cancel', action: 'cancel', primary: false },
        ],
      };
    }
    
    // Generic error
    return {
      title: 'Transaction Failed',
      description: errorMessage || 'An unexpected error occurred. Please try again.',
      actions: [
        { label: 'Retry', action: 'retry', primary: true },
        { label: 'Cancel', action: 'cancel', primary: false },
      ],
    };
  };

  const guidance = getErrorGuidance(error);

  const handleAction = (action) => {
    if (action === 'retry') {
      onRetry?.();
    } else if (action === 'cancel') {
      onCancel?.();
    } else if (action === 'fund') {
      // Open wallet funding guidance
      window.open('https://solana.com/ecosystem/wallets', '_blank');
    }
  };

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
          <span className="text-red-600 text-lg">⚠</span>
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-red-900">{guidance.title}</h4>
          <p className="text-sm text-red-700 mt-1">{guidance.description}</p>
        </div>
      </div>
      
      <div className="flex gap-2">
        {guidance.actions.map((action, index) => (
          <button
            key={index}
            onClick={() => handleAction(action.action)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              action.primary
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-white border border-red-300 text-red-700 hover:bg-red-50'
            }`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

