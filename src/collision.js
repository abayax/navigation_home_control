// 2D collision in the floor plane (x, z). Walls are thick line segments,
// furniture is axis-aligned boxes, the player is a circle.
// Walls and fences always block. Furniture has a `top` height: it only blocks
// while the player's feet (p.y) are below that top, so you can jump onto it.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const STEP_UP = 0.32; // things this much higher than your feet you just step onto (stairs)
const MAX_SLOPE = 0.6; // steeper ground than this can't be walked up (jump instead)

export function resolveCollisions(p, { segments, boxes }) {
  for (let iter = 0; iter < 3; iter++) {
    for (const s of segments) {
      if (s.top !== undefined && (p.y ?? 0) > s.top - 0.35) continue; // jumping over a low fence
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const t = clamp(((p.x - s.ax) * dx + (p.z - s.az) * dz) / (dx * dx + dz * dz), 0, 1);
      const cx = s.ax + dx * t, cz = s.az + dz * t;
      pushOut(p, cx, cz, p.radius + s.r, -dz, dx);
    }
    for (const b of boxes) {
      if (b.terrain) continue; // shaped ground never pushes; see terrainBlocks()
      if ((p.y ?? 0) >= b.top - STEP_UP) continue; // above it (or a low step): no sideways bump
      const cx = clamp(p.x, b.minX, b.maxX);
      const cz = clamp(p.z, b.minZ, b.maxZ);
      if (cx === p.x && cz === p.z) {
        // Centre is inside the box: push out through the nearest side
        const exits = [
          [p.x - b.minX, b.minX - p.radius, p.z],
          [b.maxX - p.x, b.maxX + p.radius, p.z],
          [p.z - b.minZ, p.x, b.minZ - p.radius],
          [b.maxZ - p.z, p.x, b.maxZ + p.radius],
        ].sort((a, c) => a[0] - c[0]);
        p.x = exits[0][1];
        p.z = exits[0][2];
      } else {
        pushOut(p, cx, cz, p.radius, 1, 0);
      }
    }
  }
}

function pushOut(p, cx, cz, minDist, fallbackX, fallbackZ) {
  let ox = p.x - cx, oz = p.z - cz;
  let d = Math.hypot(ox, oz);
  if (d >= minDist) return;
  if (d < 1e-6) {
    ox = fallbackX; oz = fallbackZ;
    d = Math.hypot(ox, oz);
  }
  p.x = cx + (ox / d) * minDist;
  p.z = cz + (oz / d) * minDist;
}

/**
 * How far the camera can sit from (px, pz) along direction (dx, dz) before a wall gets in
 * the way. Keeps the follow camera inside the room instead of behind a wall.
 */
export function cameraDistance(px, pz, dx, dz, maxDist, walls, margin = 0.3) {
  let best = maxDist;
  for (const s of walls) {
    const ex = s.bx - s.ax, ez = s.bz - s.az;
    const denom = dx * ez - dz * ex;
    if (Math.abs(denom) < 1e-9) continue;
    const wx = s.ax - px, wz = s.az - pz;
    const t = (wx * ez - wz * ex) / denom;
    const u = (wx * dz - wz * dx) / denom;
    if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t - margin - s.r);
  }
  return Math.max(0.35, best);
}

/**
 * Height of the surface under (x, z): the highest furniture top the player's
 * centre is over, ignoring tops above `maxTop` (things you're not up on yet).
 * Returns { height, box } (box is null for the floor).
 */
export function supportAt(boxes, x, z, maxTop) {
  let height = 0, box = null;
  for (const b of boxes) {
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    const h = b.terrain ? terrainHeight(b, x, z) : b.top;
    if (h > maxTop || h <= height) continue;
    height = h;
    box = b;
  }
  return { height, box };
}

/** Height of a shaped-ground box (hills, steps) at (x, z), bilinear from its height grid. */
export function terrainHeight(b, x, z) {
  const t = b.terrain;
  const fx = clamp((x - t.x0) / t.cell, 0, t.nx - 1.001), fz = clamp((z - t.z0) / t.cell, 0, t.nz - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const at = (a, c) => t.data[c * t.nx + a];
  return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
}

/** Height of shaped ground at (x, z) (0 if there is none). */
export function terrainHeightAt(boxes, x, z) {
  let h = 0;
  for (const b of boxes)
    if (b.terrain && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) h = Math.max(h, terrainHeight(b, x, z));
  return h;
}

/** Ground slope at (x, z) on shaped ground: { gx, gz } (height change per metre), or null. */
export function terrainSlope(boxes, x, z) {
  for (const b of boxes) {
    if (!b.terrain || x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    const e = 0.15;
    return {
      gx: (terrainHeight(b, x + e, z) - terrainHeight(b, x - e, z)) / (2 * e),
      gz: (terrainHeight(b, x, z + e) - terrainHeight(b, x, z - e)) / (2 * e),
    };
  }
  return null;
}

/**
 * True if moving from (fromX, fromZ) to (toX, toZ) with feet at height y would walk
 * into shaped ground that is too steep or too high (a hillside, a big step).
 */
export function terrainBlocks(boxes, fromX, fromZ, toX, toZ, y) {
  const dist = Math.hypot(toX - fromX, toZ - fromZ);
  for (const b of boxes) {
    if (!b.terrain || toX < b.minX || toX > b.maxX || toZ < b.minZ || toZ > b.maxZ) continue;
    const rise = terrainHeight(b, toX, toZ) - y;
    if (rise > 0.01 && rise / Math.max(dist, 1e-4) > MAX_SLOPE) return true;
  }
  return false;
}

/** True if the straight line a -> b crosses a wall. */
export function lineBlocked(ax, az, bx, bz, walls) {
  const dx = bx - ax, dz = bz - az;
  for (const s of walls) {
    const ex = s.bx - s.ax, ez = s.bz - s.az;
    const denom = dx * ez - dz * ex;
    if (Math.abs(denom) < 1e-9) continue;
    const wx = s.ax - ax, wz = s.az - az;
    const t = (wx * ez - wz * ex) / denom;
    const u = (wx * dz - wz * dx) / denom;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) return true;
  }
  return false;
}
