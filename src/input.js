// Keyboard + touch input.
//   ↑ / W        walk forward (hold); double-tap and hold to run
//   ↓ / S        walk backward (hold)
//   ← / A        turn 30° left  (each tap; taps queue up)
//   → / D        turn 30° right (each tap)
//   Space        jump
//   Shift        run (also: double-tap forward)
//   M            toggle map view (in the map view the arrows move up/down/left/right on the map)
//   N            toggle day / night
// Touch: on-screen buttons for the same actions (double-tap ▲ to run), or drag
// on the 3D view like a joystick (up/down walk, left/right steer); tap then
// touch-and-drag again to run. Mouse dragging works the same on a computer.

const DRAG_DEAD_PX = 14; // drags smaller than this do nothing
const DRAG_MAX_PX = 90; // full steering at this distance
const JUMP_BUFFER_MS = 150; // a jump pressed just before landing still counts
const DOUBLE_TAP_MS = 300; // two forward presses this close together = run

export class Input {
  constructor({ onToggleMap, onToggleNight }) {
    this.keys = new Set();
    this.touchFwd = false;
    this.touchBack = false;
    this.touchLeft = false; // turn buttons held (used as left/right in map view)
    this.touchRight = false;
    this.pendingTurns = 0; // +1 per left turn, -1 per right turn
    this.jumpAt = -Infinity; // time of the last jump press
    this.lastPress = { dir: null, at: -Infinity }; // last direction key/button press
    this.dash = null; // direction that was double-tapped (run while it's held)
    this.dragMove = 0; // from dragging the 3D view: +1 forward, -1 back
    this.steer = 0; // from dragging: -1..1, positive = turn left
    this.dragVec = { x: 0, z: 0 }; // from dragging, in screen terms (x right, z down), -1..1
    this.dragRun = false; // this drag started with a double tap
    this.onToggleMap = onToggleMap;
    this.onToggleNight = onToggleNight;

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

  /** Is a direction ('up' | 'down' | 'left' | 'right') held on keys or buttons? */
  held(dir) {
    const k = this.keys;
    if (dir === 'up') return k.has('ArrowUp') || k.has('KeyW') || this.touchFwd;
    if (dir === 'down') return k.has('ArrowDown') || k.has('KeyS') || this.touchBack;
    if (dir === 'left') return k.has('ArrowLeft') || k.has('KeyA') || this.touchLeft;
    return k.has('ArrowRight') || k.has('KeyD') || this.touchRight;
  }

  /** Screen-relative direction for the map view: x = right, z = down (not normalised). */
  get mapDir() {
    const x = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0) + this.dragVec.x;
    const z = (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0) + this.dragVec.z;
    return { x, z };
  }

  get run() {
    const dragging = this.dragVec.x !== 0 || this.dragVec.z !== 0;
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ||
      (this.dragRun && dragging) || (this.dash !== null && this.held(this.dash));
  }

  /** A direction was pressed: pressing the same one twice quickly starts running. */
  #dirPressed(dir) {
    const now = performance.now();
    this.dash = this.lastPress.dir === dir && now - this.lastPress.at < DOUBLE_TAP_MS ? dir : null;
    this.lastPress = { dir, at: now };
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
      if (e.code === 'KeyN') this.onToggleNight?.();
      if (e.code === 'Space') this.jump();
      const dir = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' }[e.code];
      if (dir) this.#dirPressed(dir);
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
      if (v) this.#dirPressed('up');
    });
    hold('btn-back', (v) => {
      this.touchBack = v;
      if (v) this.#dirPressed('down');
    });
    // Turn buttons: each press = one 30° turn; held = left/right in the map view
    hold('btn-left', (v) => {
      this.touchLeft = v;
      if (v) { this.pendingTurns += 1; this.#dirPressed('left'); }
    });
    hold('btn-right', (v) => {
      this.touchRight = v;
      if (v) { this.pendingTurns -= 1; this.#dirPressed('right'); }
    });
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
      this.dragVec = len > DRAG_DEAD_PX ? { x: dx / DRAG_MAX_PX, z: dy / DRAG_MAX_PX } : { x: 0, z: 0 };
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
      this.dragVec = { x: 0, z: 0 };
      this.dragRun = false;
      ring.classList.remove('show');
    };
    host.addEventListener('pointerup', end);
    host.addEventListener('pointercancel', end);
  }

}
