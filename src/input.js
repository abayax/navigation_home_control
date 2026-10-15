// Keyboard + touch input.
//   ↑ / W        walk forward (hold)
//   ↓ / S        walk backward (hold)
//   ← / A        turn 90° left  (each tap; taps queue up)
//   → / D        turn 90° right (each tap)
//   Space        jump
//   Shift        run
//   M            toggle map view
// Touch: on-screen buttons for the same actions, plus swipe left/right to turn
// and swipe up to jump.

const SWIPE_MIN_PX = 50;
const JUMP_BUFFER_MS = 150; // a jump pressed just before landing still counts

export class Input {
  constructor({ onToggleMap }) {
    this.keys = new Set();
    this.touchFwd = false;
    this.touchBack = false;
    this.pendingTurns = 0; // +1 per left turn, -1 per right turn
    this.jumpAt = -Infinity; // time of the last jump press
    this.onToggleMap = onToggleMap;

    this.#bindKeyboard();
    this.#bindTouchButtons();
    this.#bindSwipe();
  }

  /** +1 forward, -1 backward, 0 standing still */
  get move() {
    const fwd = this.keys.has('ArrowUp') || this.keys.has('KeyW') || this.touchFwd;
    const back = this.keys.has('ArrowDown') || this.keys.has('KeyS') || this.touchBack;
    return (fwd ? 1 : 0) - (back ? 1 : 0);
  }

  get run() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  /** Returns and clears the queued turns since the last call. */
  consumeTurns() {
    const t = this.pendingTurns;
    this.pendingTurns = 0;
    return t;
  }

  /** True if jump was pressed recently; clears it. */
  consumeJump() {
    if (performance.now() - this.jumpAt > JUMP_BUFFER_MS) return false;
    this.jumpAt = -Infinity;
    return true;
  }

  /** True if jump was pressed recently, without clearing it. */
  get jumpQueued() {
    return performance.now() - this.jumpAt <= JUMP_BUFFER_MS;
  }

  jump() {
    this.jumpAt = performance.now();
  }

  #bindKeyboard() {
    const handled = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
    addEventListener('keydown', (e) => {
      if (handled.includes(e.code)) e.preventDefault();
      if (e.repeat) return; // one turn per physical tap
      this.keys.add(e.code);
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.pendingTurns += 1;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.pendingTurns -= 1;
      if (e.code === 'KeyM') this.onToggleMap();
      if (e.code === 'Space') this.jump();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  #bindTouchButtons() {
    const hold = (id, set) => {
      const el = document.getElementById(id);
      const on = (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        el.classList.add('pressed');
        set(true);
      };
      const off = () => {
        el.classList.remove('pressed');
        set(false);
      };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('lostpointercapture', off);
    };
    hold('btn-fwd', (v) => (this.touchFwd = v));
    hold('btn-back', (v) => (this.touchBack = v));

    const tap = (id, turns) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.pendingTurns += turns;
        el.classList.add('pressed');
        setTimeout(() => el.classList.remove('pressed'), 120);
      });
    };
    tap('btn-left', 1);
    tap('btn-right', -1);
    const jumpBtn = document.getElementById('btn-jump');
    jumpBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.jump();
      jumpBtn.classList.add('pressed');
      setTimeout(() => jumpBtn.classList.remove('pressed'), 120);
    });

    // Show touch UI on touch devices
    if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
      document.body.classList.add('touch');
    }

    // iOS Safari: block pinch-zoom and double-tap zoom
    for (const type of ['gesturestart', 'gesturechange', 'dblclick']) {
      document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
    }
    document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  #bindSwipe() {
    // Swipe on the 3D view (not on buttons): swipe left = turn left, swipe right = turn right,
    // swipe up = jump
    const starts = new Map();
    const canvasHost = document.getElementById('app');
    canvasHost.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') starts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    const end = (e) => {
      const s = starts.get(e.pointerId);
      starts.delete(e.pointerId);
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) > SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
        this.pendingTurns += dx < 0 ? 1 : -1;
      } else if (-dy > SWIPE_MIN_PX && -dy > Math.abs(dx) * 1.5) {
        this.jump();
      }
    };
    canvasHost.addEventListener('pointerup', end);
    canvasHost.addEventListener('pointercancel', (e) => starts.delete(e.pointerId));
  }
}
