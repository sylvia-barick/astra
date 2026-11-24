// Keyboard + mouse input, converted into a fighter command each frame.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('mousedown', (e) => {
      if (e.target.tagName !== 'CANVAS') return;
      const k = 'Mouse' + e.button;
      this.keys.add(k);
      this.pressed.add(k);
    });
    addEventListener('mouseup', (e) => this.keys.delete('Mouse' + e.button));
    addEventListener('contextmenu', (e) => { if (e.target.tagName === 'CANVAS') e.preventDefault(); });
    addEventListener('blur', () => this.keys.clear());
  }
  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }
  endFrame() { this.pressed.clear(); }

  // Player command: moveZ = toward enemy, moveX = strafe right.
  playerCommand() {
    return {
      moveX: (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0),
      moveZ: (this.down('KeyW', 'ArrowUp') ? 1 : 0) - (this.down('KeyS', 'ArrowDown') ? 1 : 0),
      light: this.hit('KeyJ', 'Mouse0'),
      heavy: this.hit('KeyK', 'Mouse2'),
      block: this.down('KeyL', 'ShiftLeft', 'ShiftRight'),
      dodge: this.hit('Space'),
      special: this.hit('KeyU', 'KeyE'),
      specialHeld: this.down('KeyU', 'KeyE'),
      ultimate: this.hit('KeyI', 'KeyQ'),
    };
  }
}

export const emptyCommand = () => ({
  moveX: 0, moveZ: 0, light: false, heavy: false, block: false, dodge: false,
  special: false, specialHeld: false, ultimate: false,
});
