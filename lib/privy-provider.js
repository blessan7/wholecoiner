'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import { useState, useEffect } from 'react';

export default function PrivyProviderWrapper({ children }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Avoid SSR issues
  if (!isMounted) {
    return <>{children}</>;
  }

  // RPC URLs
  const solanaRpcUrl =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    'https://mainnet.helius-rpc.com/?api-key=c61b3693-90f8-46e7-b236-03871dbcdc1e';

  const solanaWsUrl =
    process.env.NEXT_PUBLIC_SOLANA_WS_URL ||
    solanaRpcUrl.replace('https://', 'wss://').replace('http://', 'ws://');

  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'google'],
        appearance: {
          theme: 'light',
          accentColor: '#F7931A',
          showWalletLoginFirst: false,
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
          requireUserPasswordOnCreate: false,
        },
        // ✅ New Solana configuration format for Privy v3
        solana: {
          rpcs: {
            'solana:mainnet': {
              rpc: createSolanaRpc(solanaRpcUrl),
              rpcSubscriptions: createSolanaRpcSubscriptions(solanaWsUrl),
            },
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

