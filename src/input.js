// Keyboard + touch input.
//   ↑ / W        walk forward (hold); double-tap and hold to run
//   ↓ / S        walk backward (hold)
//   ← / A        turn 90° left  (each tap; taps queue up)
//   → / D        turn 90° right (each tap)
//   Space        jump
//   Shift        run (also: double-tap forward)
//   M            toggle map view
// Touch: on-screen buttons for the same actions (double-tap ▲ to run), or drag
// on the 3D view like a joystick (up/down walk, left/right steer); tap then
// touch-and-drag again to run. Mouse dragging works the same on a computer.

const DRAG_DEAD_PX = 14; // drags smaller than this do nothing
const DRAG_MAX_PX = 90; // full steering at this distance
const JUMP_BUFFER_MS = 150; // a jump pressed just before landing still counts
const DOUBLE_TAP_MS = 300; // two forward presses this close together = run

export class Input {
  constructor({ onToggleMap }) {
    this.keys = new Set();
    this.touchFwd = false;
    this.touchBack = false;
    this.pendingTurns = 0; // +1 per left turn, -1 per right turn
    this.jumpAt = -Infinity; // time of the last jump press
    this.lastForwardAt = -Infinity; // time of the last forward press
    this.dash = false; // running because forward was double-tapped
    this.dragMove = 0; // from dragging the 3D view: +1 forward, -1 back
    this.steer = 0; // from dragging: -1..1, positive = turn left
    this.dragRun = false; // this drag started with a double tap
    this.onToggleMap = onToggleMap;

    this.#bindKeyboard();
    this.#bindTouchButtons();
    this.#bindDrag();
  }

  /** +1 forward, -1 backward, 0 standing still */
  get move() {
    const fwd = this.keys.has('ArrowUp') || this.keys.has('KeyW') || this.touchFwd;
    const back = this.keys.has('ArrowDown') || this.keys.has('KeyS') || this.touchBack;
    return Math.sign((fwd ? 1 : 0) - (back ? 1 : 0) + this.dragMove);
  }

  get run() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || ((this.dash || this.dragRun) && this.move > 0);
  }

  /** Forward was pressed: a second press soon after the first starts running. */
  #forwardPressed() {
    const now = performance.now();
    this.dash = now - this.lastForwardAt < DOUBLE_TAP_MS;
    this.lastForwardAt = now;
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
      if (e.code === 'ArrowUp' || e.code === 'KeyW') this.#forwardPressed();
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
    hold('btn-fwd', (v) => {
      this.touchFwd = v;
      if (v) this.#forwardPressed();
    });
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

  #bindDrag() {
    // Drag on the 3D view (touch or mouse) like a joystick: up = walk forward,
    // down = walk back, left/right = steer. Tap then quickly touch again and
    // drag = run for that drag.
    const host = document.getElementById('app');
    const ring = document.getElementById('drag-ring');
    const knob = ring.querySelector('.knob');
    let active = null; // { id, x, y, t }
    let lastTapAt = -Infinity;

    host.addEventListener('pointerdown', (e) => {
      if (active) return; // one finger steers
      e.preventDefault();
      host.setPointerCapture(e.pointerId);
      const now = performance.now();
      active = { id: e.pointerId, x: e.clientX, y: e.clientY, t: now, moved: false };
      this.dragRun = now - lastTapAt < DOUBLE_TAP_MS;
      ring.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      knob.style.transform = 'translate(0px, 0px)';
      ring.classList.add('show');
      ring.classList.toggle('run', this.dragRun);
    });
    host.addEventListener('pointermove', (e) => {
      if (!active || e.pointerId !== active.id) return;
      let dx = e.clientX - active.x, dy = e.clientY - active.y;
      const len = Math.hypot(dx, dy);
      if (len > DRAG_DEAD_PX) active.moved = true;
      if (len > DRAG_MAX_PX) { dx *= DRAG_MAX_PX / len; dy *= DRAG_MAX_PX / len; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.dragMove = dy < -DRAG_DEAD_PX ? 1 : dy > DRAG_DEAD_PX ? -1 : 0;
      const side = Math.abs(dx) > DRAG_DEAD_PX ? (dx - Math.sign(dx) * DRAG_DEAD_PX) / (DRAG_MAX_PX - DRAG_DEAD_PX) : 0;
      this.steer = -side; // drag right = turn right (negative yaw)
    });
    const end = (e) => {
      if (!active || e.pointerId !== active.id) return;
      const wasTap = !active.moved && performance.now() - active.t < 250;
      lastTapAt = wasTap ? performance.now() : -Infinity;
      active = null;
      this.dragMove = 0;
      this.steer = 0;
      this.dragRun = false;
      ring.classList.remove('show');
    };
    host.addEventListener('pointerup', end);
    host.addEventListener('pointercancel', end);
  }

}
