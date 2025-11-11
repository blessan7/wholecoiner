'use client';

import { useState, useEffect } from 'react';

/**
 * InvestmentStatus component
 * Polls investment status and displays state progression
 */
export default function InvestmentStatus({ batchId, onCancel, onReQuote }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!batchId) return;

    fetchStatus();
    
    // Poll every 2-4 seconds if in pending state
    const interval = setInterval(() => {
      const shouldPoll = status && (
        status.state === 'SWAP_SUBMITTED' ||
        status.state === 'PENDING_ONRAMP' ||
        status.state === 'ONRAMP_CONFIRMED' ||
        status.state === 'QUOTED'
      );
      
      if (shouldPoll && !polling) {
        fetchStatus();
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [batchId, status?.state, polling]);

  const fetchStatus = async () => {
    if (polling) return;
    
    setPolling(true);
    try {
      const response = await fetch(`/api/investments/${batchId}/status`, {
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        setStatus(data);
        setError('');
        
        // Stop polling if confirmed or canceled
        if (data.state === 'SWAP_CONFIRMED' || data.state === 'CANCELED' || data.state === 'FAILED') {
          setPolling(false);
        }
      } else {
        setError(data.error?.message || 'Failed to fetch status');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Status fetch error:', err);
    } finally {
      setLoading(false);
      // Reset polling flag after a delay
      setTimeout(() => setPolling(false), 1000);
    }
  };

  const getStateDisplay = (state) => {
    const states = {
      'PENDING_ONRAMP': { label: 'Funding wallet...', color: 'blue' },
      'ONRAMP_CONFIRMED': { label: 'Funds received', color: 'green' },
      'QUOTED': { label: 'Quote ready', color: 'blue' },
      'SWAP_SIGNED': { label: 'Signed', color: 'blue' },
      'SWAP_SUBMITTED': { label: 'Finalizing on Solana...', color: 'yellow' },
      'SWAP_CONFIRMED': { label: 'Complete!', color: 'green' },
      'EXPIRED': { label: 'Quote expired', color: 'red' },
      'FAILED': { label: 'Failed', color: 'red' },
      'CANCELED': { label: 'Canceled', color: 'gray' },
    };
    return states[state] || { label: state, color: 'gray' };
  };

  const getStateSteps = () => {
    return [
      { id: 'ONRAMP_CONFIRMED', label: 'Funds Received' },
      { id: 'QUOTED', label: 'Quote Ready' },
      { id: 'SWAP_SUBMITTED', label: 'Submitted' },
      { id: 'SWAP_CONFIRMED', label: 'Confirmed' },
    ];
  };

  const getCurrentStepIndex = () => {
    const steps = getStateSteps();
    const currentState = status?.state || '';
    
    if (currentState === 'SWAP_CONFIRMED') return 3;
    if (currentState === 'SWAP_SUBMITTED') return 2;
    if (currentState === 'QUOTED' || currentState === 'SWAP_SIGNED') return 1;
    if (currentState === 'ONRAMP_CONFIRMED') return 0;
    return -1;
  };

  if (loading && !status) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <div className="flex items-center">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
          <span className="text-blue-700">Loading investment status...</span>
        </div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
        <p className="text-red-700 text-sm">{error}</p>
        <button
          onClick={fetchStatus}
          className="mt-2 text-xs text-red-600 hover:text-red-800 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!status) return null;

  const stateDisplay = getStateDisplay(status.state);
  const currentStep = getCurrentStepIndex();
  const steps = getStateSteps();
  const isExpired = status.state === 'EXPIRED';
  const isPending = status.state === 'SWAP_SUBMITTED';
  const isComplete = status.state === 'SWAP_CONFIRMED';
  const isCanceled = status.state === 'CANCELED';
  const isFailed = status.state === 'FAILED';

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
      {/* Status Banner */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          {isPending && (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-600 mr-3"></div>
          )}
          {isComplete && (
            <span className="text-green-600 mr-3">✓</span>
          )}
          {isFailed && (
            <span className="text-red-600 mr-3">✗</span>
          )}
          {isCanceled && (
            <span className="text-black mr-3">—</span>
          )}
          <div>
            <h3 className="font-semibold text-black">{stateDisplay.label}</h3>
            {isPending && (
              <p className="text-xs text-black mt-1">
                You can keep using the app; we'll notify you when it lands.
              </p>
            )}
          </div>
        </div>
        {status.canCancel && onCancel && (
          <button
            onClick={onCancel}
            className="text-xs text-red-600 hover:text-red-800 underline"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Progress Steps */}
      {currentStep >= 0 && !isExpired && !isCanceled && !isFailed && (
        <div className="mb-4">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const isActive = index <= currentStep;
              const isCurrent = index === currentStep;
              
              return (
                <div key={step.id} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-500'
                      } ${isCurrent ? 'ring-2 ring-blue-300' : ''}`}
                    >
                      {isActive && index < currentStep ? '✓' : index + 1}
                    </div>
                    <span
                      className={`text-xs mt-1 text-center ${
                        isActive ? 'text-black' : 'text-black'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`h-0.5 flex-1 mx-2 ${
                        index < currentStep ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Expired Quote Message */}
      {isExpired && onReQuote && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-3">
          <p className="text-sm text-black mb-2">
            That price expired (fast market). Re-quote to get a fresh price.
          </p>
          <button
            onClick={onReQuote}
            className="text-sm bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700"
          >
            Re-quote
          </button>
        </div>
      )}

      {/* Transaction Link */}
      {status.lastSignature && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <a
            href={status.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            View on Solana Explorer →
          </a>
        </div>
      )}
    </div>
  );
}

