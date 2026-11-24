// Top-of-screen wallet bar. Connects any Solana Wallet Standard wallet —
// Phantom, MetaMask (Solana), Core, Solflare, Backpack — on devnet. The
// connected wallet is shared with every on-chain mode via `game.wallet`.

const $ = (id) => document.getElementById(id);
const INSTALL = [
  ['Phantom', 'https://phantom.com/download'],
  ['MetaMask', 'https://metamask.io/download'],
  ['Core', 'https://core.app/download'],
  ['Solflare', 'https://solflare.com/download'],
];

export class WalletBar {
  constructor(game) {
    this.g = game;
    this.wallet = null;
    this.subs = new Set();
    $('wbConnect').addEventListener('click', (e) => { e.stopPropagation(); this.toggleMenu(); });
    $('wbDisconnect').addEventListener('click', () => this.disconnect());
    $('wbAirdrop').addEventListener('click', () => this.airdrop());
    addEventListener('click', (e) => { if (!$('walletBar').contains(e.target)) $('wbMenu').classList.add('hidden'); });
    this.ready = this.init();
  }

  async init() {
    this.w = await import('../duel/wallet.js');
    this.w.onWalletsChanged(() => { if (!$('wbMenu').classList.contains('hidden')) this.renderMenu(); });
    let last = null;
    try { last = localStorage.getItem('dy-wallet'); } catch { /* ignore */ }
    if (last) {
      // Wallet extensions register a moment after load.
      for (let i = 0; i < 6 && !this.wallet; i++) {
        const w = await this.w.reconnect(last);
        if (w) this.set(w); else await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  onChange(cb) { this.subs.add(cb); return () => this.subs.delete(cb); }

  set(w) {
    this.wallet = w;
    this.g.wallet = w;
    $('wbConnect').classList.toggle('hidden', !!w);
    $('wbConnected').classList.toggle('hidden', !w);
    $('wbMenu').classList.add('hidden');
    if (w) {
      const a = w.publicKey.toBase58();
      $('wbIcon').src = w.icon;
      $('wbAddr').textContent = `${a.slice(0, 4)}…${a.slice(-4)}`;
      $('wbAddr').href = `https://explorer.solana.com/address/${a}?cluster=devnet`;
      $('wbAddr').title = `${w.name} · ${a}`;
      this.refreshBalance();
      clearInterval(this.balT);
      this.balT = setInterval(() => this.refreshBalance(), 15000);
    } else clearInterval(this.balT);
    this.subs.forEach((cb) => cb(w));
  }

  async refreshBalance() {
    if (!this.wallet) return;
    try { this.balance = await this.w.devnetBalance(this.wallet.publicKey); $('wbBal').textContent = `${this.balance.toFixed(3)} SOL`; }
    catch { $('wbBal').textContent = '— SOL'; }
  }

  async toggleMenu() {
    await this.ready;
    const m = $('wbMenu');
    if (!m.classList.contains('hidden')) { m.classList.add('hidden'); return; }
    this.renderMenu();
    m.classList.remove('hidden');
  }

  renderMenu() {
    const m = $('wbMenu');
    const list = this.w.solanaWallets();
    m.innerHTML = '<div class="wb-title">Connect a Solana wallet <small>(set it to Devnet)</small></div>';
    for (const wl of list) {
      const b = document.createElement('button');
      b.className = 'wb-item';
      b.innerHTML = `<img src="${wl.icon}" alt=""> ${wl.name}`;
      b.onclick = async () => {
        b.disabled = true; b.innerHTML += ' <small>· approve in wallet…</small>';
        try {
          const w = await this.w.connectWallet(wl);
          try { localStorage.setItem('dy-wallet', wl.name); } catch { /* ignore */ }
          this.set(w);
        } catch (e) { this.g.toast?.(`${wl.name}: ${e.message || 'connection rejected'}`); this.renderMenu(); }
      };
      m.appendChild(b);
    }
    const found = new Set(list.map((w) => w.name.toLowerCase()));
    const missing = INSTALL.filter(([n]) => ![...found].some((f) => f.includes(n.toLowerCase())));
    if (missing.length) {
      const d = document.createElement('div');
      d.className = 'wb-install';
      d.innerHTML = (list.length ? 'Other wallets: ' : 'No Solana wallet detected. Install one: ') +
        missing.map(([n, u]) => `<a target="_blank" href="${u}">${n}</a>`).join(' · ') +
        '<div class="wb-hint">MetaMask and Core: enable Solana accounts in the wallet, then reload.</div>';
      m.appendChild(d);
    }
  }

  async disconnect() {
    await this.wallet?.disconnect();
    try { localStorage.removeItem('dy-wallet'); } catch { /* ignore */ }
    this.set(null);
  }

  async airdrop() {
    const btn = $('wbAirdrop');
    btn.disabled = true; btn.textContent = '…';
    try { await this.w.devnetAirdrop(this.wallet.publicKey, 1); this.g.toast?.('+1 DEVNET SOL'); }
    catch { window.open('https://faucet.solana.com', '_blank'); this.g.toast?.('Airdrop busy · opened the faucet'); }
    btn.disabled = false; btn.textContent = '+ SOL';
    this.refreshBalance();
  }
}
