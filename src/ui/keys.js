// Side panel listing every key for the current mode. Press H to hide/show.

const K = (k) => k.split('/').map((x) => `<kbd>${x.trim()}</kbd>`).join('<i>/</i>');
const row = (keys, what) => `<div class="krow"><span>${K(keys)}</span><em>${what}</em></div>`;

const GUIDES = {
  yuddha: {
    title: 'YUDDHA · CONTROLS',
    html: [
      '<h4>Move</h4>', row('W A S D / ← ↑ ↓ →', 'Move (you always face the enemy)'),
      '<h4>Attack</h4>',
      row('J / Left click', 'Light attack · press 3× for a combo'),
      row('K / Right click', 'Heavy attack · breaks a guard'),
      row('U / E', 'Astra special · costs prana (Rama: hold to charge the arrow)'),
      row('I / Q', 'Ultimate · needs a full prana bar'),
      '<h4>Defend</h4>',
      row('L / Shift', 'Block (hold) · tap just before a hit to PARRY'),
      row('Space', 'Dodge roll · brief invincibility'),
      '<h4>Other</h4>', row('Esc', 'Pause'), row('M', 'Sound on/off'), row('H', 'Hide this panel'),
      '<p>Prana (blue bar) fills when you hit, get hit, or parry. Best of 3 rounds.</p>',
    ].join(''),
  },
  journey: {
    title: 'THE JOURNEY · CONTROLS',
    html: [
      '<h4>Move</h4>', row('← ↑ ↓ → / W A S D', 'Run (camera follows Rama)'),
      row('Shift', 'Sneak · crouch in a bush to become HIDDEN'), row('Space', 'Roll · brief invincibility'),
      '<h4>Fight</h4>',
      row('Enter', 'Hold to shoot arrows (auto-aim at the nearest enemy ahead)'),
      row('Q', 'Brahmastra beam · when the prana bar is full'),
      '<h4>Other</h4>', row('Esc', 'Pause'), row('M', 'Sound on/off'), row('H', 'Hide this panel'),
      '<p><b>?</b> = enemy suspicious, <b>!</b> = you are spotted. Arrows on an unaware enemy deal ×3. Clear a zone to open the golden gate. Map: you are the red dot.</p>',
    ].join(''),
  },
  dharma: {
    title: 'DHARMA YUDDHA · CONTROLS',
    html: [
      '<h4>Pick a move each beat (secret)</h4>',
      row('1', '<b>STRIKE</b> · beats Heavy and Evade'),
      row('2', '<b>HEAVY</b> · beats Guard'),
      row('3', '<b>GUARD</b> · parries Strike, halves an Astra'),
      row('4', '<b>EVADE</b> · beats Heavy and Astra'),
      row('5', '<b>ASTRA</b> · beats Strike/Heavy · costs prana'),
      '<h4>Other</h4>', row('H', 'Hide this panel'),
      '<p>Both moves are revealed together, then the clash plays out. Prana grows every beat (faster when both hold back). Reduce the enemy to 0 HP.</p>',
      '<p class="kchain">On-chain: your wallet approves the stake once; a session key signs each hidden move inside MagicBlock\'s private rollup, so the opponent can never see your move early.</p>',
    ].join(''),
  },
};

export class KeyGuide {
  constructor() {
    this.el = document.getElementById('keys');
    this.collapsed = false;
    document.getElementById('keysToggle').addEventListener('click', () => this.toggle());
    addEventListener('keydown', (e) => { if (e.code === 'KeyH' && this.mode && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) this.toggle(); });
  }
  show(mode) {
    this.mode = mode;
    const g = GUIDES[mode];
    if (!g) { this.el.classList.add('hidden'); return; }
    document.getElementById('keysTitle').textContent = g.title;
    document.getElementById('keysBody').innerHTML = g.html;
    this.el.classList.remove('hidden');
    this.el.classList.toggle('collapsed', this.collapsed);
  }
  hide() { this.mode = null; this.el.classList.add('hidden'); }
  toggle() { this.collapsed = !this.collapsed; this.el.classList.toggle('collapsed', this.collapsed); }
}
