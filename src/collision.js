// 2D collision in the floor plane (x, z). Walls are thick line segments,
// furniture is axis-aligned boxes, the player is a circle.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function resolveCollisions(p, { segments, boxes }) {
  for (let iter = 0; iter < 3; iter++) {
    for (const s of segments) {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const t = clamp(((p.x - s.ax) * dx + (p.z - s.az) * dz) / (dx * dx + dz * dz), 0, 1);
      const cx = s.ax + dx * t, cz = s.az + dz * t;
      pushOut(p, cx, cz, p.radius + s.r, -dz, dx);
    }
    for (const b of boxes) {
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
