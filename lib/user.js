'use strict';

/**
 * Extract a Solana wallet address from the Privy user object.
 * Prefers the primary wallet, falling back to linked accounts.
 *
 * @param {import('@privy-io/react-auth').PrivyUser | any} user
 * @returns {string|null}
 */
export function getWalletAddressFromPrivy(user) {
  if (!user) return null;

  if (user.wallet?.address) return user.wallet.address;

  if (Array.isArray(user.linkedAccounts)) {
    const privyWallet = user.linkedAccounts.find(
      (account) =>
        account?.type === 'wallet' &&
        account?.walletClient === 'privy' &&
        typeof account.address === 'string' &&
        account.address.length > 0
    );
    if (privyWallet?.address) return privyWallet.address;

    const anyWallet = user.linkedAccounts.find(
      (account) =>
        account?.type === 'wallet' &&
        typeof account.address === 'string' &&
        account.address.length > 0
    );
    if (anyWallet?.address) return anyWallet.address;
  }

  return null;
}

/**
 * Shorten a long address for UI presentation.
 *
 * @param {string} address
 * @param {number} visible
 * @returns {string}
 */
export function shortenAddress(address, visible = 4) {
  if (!address) return '';
  if (address.length <= visible * 2) return address;
  return `${address.slice(0, visible)}...${address.slice(-visible)}`;
}

