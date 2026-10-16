import { roomAt } from './house.js';

// Walkable grid over the whole layout + A* path finding, for NPCs.
// A cell is walkable if it is inside a room and an NPC of `radius` standing
// there doesn't touch any wall, fence or furniture.

const SQRT2 = Math.SQRT2;

export class NavGrid {
  constructor(house, rooms, { cell, radius = 0.2 } = {}) {
    const { minX, maxX, minZ, maxZ } = house.bounds;
    // Fine cells for houses (narrow doors), coarser ones for big outdoor layouts
    cell ??= (maxX - minX) * (maxZ - minZ) > 3000 ? 0.3 : 0.15;
    this.cell = cell;
    this.x0 = minX;
    this.z0 = minZ;
    this.nx = Math.ceil((maxX - minX) / cell);
    this.nz = Math.ceil((maxZ - minZ) / cell);
    this.free = new Uint8Array(this.nx * this.nz);
    this.cellsByRoom = new Map(); // room -> [cell index]

    const { segments, boxes } = house.colliders;
    const roomOf = new Array(this.free.length);
    for (let j = 0; j < this.nz; j++)
      for (let i = 0; i < this.nx; i++) {
        const x = minX + (i + 0.5) * cell, z = minZ + (j + 0.5) * cell;
        const room = roomAt(rooms, x, z);
        if (!room || !clear(x, z, radius, segments, boxes)) continue;
        this.free[j * this.nx + i] = 1;
        roomOf[j * this.nx + i] = room;
      }

    // Keep only the biggest connected walkable area, so NPCs never pick a spot
    // in a pocket they can't reach (e.g. squeezed between a bed and a wall)
    const comp = new Int32Array(this.free.length).fill(-1);
    let best = -1, bestSize = 0, id = 0;
    for (let start = 0; start < this.free.length; start++) {
      if (!this.free[start] || comp[start] >= 0) continue;
      let size = 0;
      const stack = [start];
      comp[start] = id;
      while (stack.length) {
        const c = stack.pop();
        size++;
        const ci = c % this.nx, cj = Math.floor(c / this.nx);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
          const nb = j * this.nx + i;
          if (this.free[nb] && comp[nb] < 0) {
            comp[nb] = id;
            stack.push(nb);
          }
        }
      }
      if (size > bestSize) { bestSize = size; best = id; }
      id++;
    }
    for (let idx = 0; idx < this.free.length; idx++) {
      if (!this.free[idx]) continue;
      if (comp[idx] !== best) { this.free[idx] = 0; continue; }
      const room = roomOf[idx];
      if (!this.cellsByRoom.has(room)) this.cellsByRoom.set(room, []);
      this.cellsByRoom.get(room).push(idx);
    }
  }

  cellOf(x, z) {
    return [Math.floor((x - this.x0) / this.cell), Math.floor((z - this.z0) / this.cell)];
  }

  center(idx) {
    const i = idx % this.nx, j = Math.floor(idx / this.nx);
    return { x: this.x0 + (i + 0.5) * this.cell, z: this.z0 + (j + 0.5) * this.cell };
  }

  isFree(x, z) {
    const [i, j] = this.cellOf(x, z);
    return i >= 0 && j >= 0 && i < this.nx && j < this.nz && this.free[j * this.nx + i] === 1;
  }

  /** Nearest walkable cell index to (x, z), searching outward up to `maxRing` cells. */
  nearestFree(x, z, maxRing = 12) {
    const [ci, cj] = this.cellOf(x, z);
    for (let ring = 0; ring <= maxRing; ring++) {
      let best = -1, bestD = Infinity;
      for (let j = cj - ring; j <= cj + ring; j++)
        for (let i = ci - ring; i <= ci + ring; i++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== ring) continue;
          if (i < 0 || j < 0 || i >= this.nx || j >= this.nz || !this.free[j * this.nx + i]) continue;
          const d = (i - ci) ** 2 + (j - cj) ** 2;
          if (d < bestD) { bestD = d; best = j * this.nx + i; }
        }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** A random walkable point in `room` (or anywhere if room is null). */
  randomPoint(room = null) {
    const cells = room ? this.cellsByRoom.get(room) : null;
    if (room && !cells?.length) return null;
    if (cells) return this.center(cells[Math.floor(Math.random() * cells.length)]);
    for (let tries = 0; tries < 200; tries++) {
      const idx = Math.floor(Math.random() * this.free.length);
      if (this.free[idx]) return this.center(idx);
    }
    return null;
  }

  /** Straight walk from a to b stays on walkable cells. */
  lineFree(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(d / (this.cell * 0.5));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (!this.isFree(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  /** Smoothed path [{x, z}, ...] from (ax, az) to (bx, bz), or null if unreachable. */
  findPath(ax, az, bx, bz) {
    const start = this.nearestFree(ax, az), goal = this.nearestFree(bx, bz);
    if (start < 0 || goal < 0) return null;
    const { nx, nz, free } = this;
    const n = free.length;
    const g = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const gi = goal % nx, gj = Math.floor(goal / nx);
    const h = (idx) => {
      const dx = Math.abs((idx % nx) - gi), dz = Math.abs(Math.floor(idx / nx) - gj);
      return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz);
    };
    const heap = new MinHeap();
    g[start] = 0;
    heap.push(start, h(start));
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % nx, cj = Math.floor(cur / nx);
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
          const nb = j * nx + i;
          if (!free[nb] || closed[nb]) continue;
          // no cutting corners diagonally
          if (di && dj && (!free[cj * nx + i] || !free[j * nx + ci])) continue;
          const cost = g[cur] + (di && dj ? SQRT2 : 1);
          if (cost < g[nb]) {
            g[nb] = cost;
            came[nb] = cur;
            heap.push(nb, cost + h(nb));
          }
        }
    }
    if (start !== goal && came[goal] < 0) return null;

    const cells = [];
    for (let c = goal; c >= 0; c = c === start ? -1 : came[c]) cells.push(this.center(c));
    cells.reverse();
    cells[cells.length - 1] = this.isFree(bx, bz) ? { x: bx, z: bz } : cells[cells.length - 1];

    // String-pulling: skip waypoints we can walk straight past
    const path = [];
    let anchor = { x: ax, z: az };
    let k = 0;
    while (k < cells.length) {
      let far = k;
      for (let m = cells.length - 1; m > k; m--)
        if (this.lineFree(anchor, cells[m])) { far = m; break; }
      path.push(cells[far]);
      anchor = cells[far];
      k = far + 1;
    }
    return path;
  }
}

function clear(x, z, r, segments, boxes) {
  for (const s of segments) {
    const dx = s.bx - s.ax, dz = s.bz - s.az;
    const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t)) < r + s.r) return false;
  }
  for (const b of boxes) {
    const cx = Math.max(b.minX, Math.min(b.maxX, x)), cz = Math.max(b.minZ, Math.min(b.maxZ, z));
    if (Math.hypot(x - cx, z - cz) < r) return false;
  }
  return true;
}

class MinHeap {
  constructor() {
    this.items = [];
    this.keys = [];
  }
  get size() {
    return this.items.length;
  }
  push(item, key) {
    const a = this.items, k = this.keys;
    let i = a.length;
    a.push(item);
    k.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [a[p], a[i]] = [a[i], a[p]];
      [k[p], k[i]] = [k[i], k[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items, k = this.keys;
    const top = a[0];
    const lastItem = a.pop(), lastKey = k.pop();
    if (a.length) {
      a[0] = lastItem;
      k[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && k[l] < k[m]) m = l;
        if (r < a.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        [k[m], k[i]] = [k[i], k[m]];
        i = m;
      }
    }
    return top;
  }
}
