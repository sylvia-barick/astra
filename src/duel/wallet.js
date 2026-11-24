import './polyfill.js';
import { getWallets } from '@wallet-standard/app';
import { PublicKey, Transaction } from '@solana/web3.js';

// Real browser wallets through the Wallet Standard: Phantom, MetaMask (Solana),
// Solflare, Backpack… anything that registers a Solana account with
// `solana:signTransaction`. The wallet approves every base-layer transaction
// (stake, bets, payouts) in its own popup.

const CONNECT = 'standard:connect';
const DISCONNECT = 'standard:disconnect';
const SIGN_TX = 'solana:signTransaction';
export const CHAIN = 'solana:devnet';

export function solanaWallets() {
  return getWallets().get().filter((w) =>
    w.chains.some((c) => c.startsWith('solana:')) && CONNECT in w.features && SIGN_TX in w.features);
}

export function onWalletsChanged(cb) {
  const api = getWallets();
  const a = api.on('register', cb), b = api.on('unregister', cb);
  return () => { a(); b(); };
}

export class WalletSigner {
  constructor(wallet, account) {
    this.wallet = wallet;
    this.account = account;
    this.publicKey = new PublicKey(account.address);
    this.name = wallet.name;
    this.icon = wallet.icon;
  }

  async signTransaction(tx) {
    const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const [out] = await this.wallet.features[SIGN_TX].signTransaction({ account: this.account, transaction: bytes, chain: CHAIN });
    return Transaction.from(out.signedTransaction);
  }

  async disconnect() { await this.wallet.features[DISCONNECT]?.disconnect().catch(() => {}); }
}

export async function connectWallet(wallet) {
  const { accounts } = await wallet.features[CONNECT].connect();
  const acc = accounts.find((a) => a.chains?.some((c) => c.startsWith('solana:'))) ?? accounts[0];
  if (!acc) throw new Error(`${wallet.name} did not share a Solana account.`);
  return new WalletSigner(wallet, acc);
}

/** Reconnect silently if the user already approved this site before. */
export async function reconnect(name) {
  const w = solanaWallets().find((x) => x.name === name);
  if (!w) return null;
  try {
    const { accounts } = await w.features[CONNECT].connect({ silent: true });
    const acc = accounts.find((a) => a.chains?.some((c) => c.startsWith('solana:'))) ?? accounts[0];
    return acc ? new WalletSigner(w, acc) : null;
  } catch { return null; }
}

export const DEVNET_RPC = import.meta.env.VITE_BASE_ENDPOINT || 'https://api.devnet.solana.com';
let conn = null;
export async function devnetBalance(pk) {
  const { Connection } = await import('@solana/web3.js');
  conn ??= new Connection(DEVNET_RPC, 'confirmed');
  return (await conn.getBalance(pk)) / 1e9;
}
export async function devnetAirdrop(pk, sol = 1) {
  const { Connection } = await import('@solana/web3.js');
  conn ??= new Connection(DEVNET_RPC, 'confirmed');
  const sig = await conn.requestAirdrop(pk, sol * 1e9);
  await conn.confirmTransaction(sig, 'confirmed');
  return sig;
}
