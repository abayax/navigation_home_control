#!/usr/bin/env node
// Validate one or all layouts using the game's own house + collision code.
//
//   node tools/validate-layout.mjs                      # every layout in layouts/index.json
//   node tools/validate-layout.mjs layouts/office/layout.json
//
// Checks: room shapes, overlapping rooms, doors that miss walls, unknown furniture,
// furniture stuck in walls, spawn point, every room reachable on foot, no gaps to the outside.
// Exits with code 1 if any layout has errors.

import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stubUrl = pathToFileURL(resolve(root, 'tools/three-stub.js')).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'three') return { url: stubUrl, shortCircuit: true };
    return next(specifier, context);
  },
});

// Canvas stand-in for floor textures and labels
const ctx2d = new Proxy({}, {
  get: (_, k) => (k === 'measureText' ? () => ({ width: 100 }) : () => {}),
  set: () => true,
});
globalThis.document = { createElement: () => ({ getContext: () => ctx2d }) };

const { buildHouse, roomAt, roomRects } = await import(pathToFileURL(resolve(root, 'src/house.js')).href);
const { resolveCollisions } = await import(pathToFileURL(resolve(root, 'src/collision.js')).href);

const PLAYER_R = 0.25; // keep in sync with player.radius in src/main.js
const GRID = 0.1;
const PATTERNS = ['wood', 'tile', 'carpet', 'concrete', 'grass', 'rubber', 'sand'];
const SQFT_PER_M2 = 10.7639;

function validate(file) {
  const errors = [];
  const warnings = [];
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return { errors: [`Cannot read JSON: ${e.message}`], warnings, summary: [] };
  }

  // --- rooms ---
  if (!Array.isArray(data.rooms) || data.rooms.length === 0) errors.push('No rooms defined');
  const rooms = data.rooms ?? [];
  const names = new Set();
  for (const r of rooms) {
    if (!r.name) errors.push('A room has no name');
    if (names.has(r.name)) errors.push(`Duplicate room name "${r.name}"`);
    names.add(r.name);
    const rects = r.rects ?? (r.rect ? [r.rect] : null);
    if (!rects) { errors.push(`"${r.name}" has no rect/rects`); continue; }
    for (const rc of rects)
      if (!Array.isArray(rc) || rc.length !== 4 || !(rc[2] > rc[0] && rc[3] > rc[1]))
        errors.push(`"${r.name}" has a bad rect ${JSON.stringify(rc)} (need [x0, z0, x1, z1] with x1>x0, z1>z0)`);
    if (!r.floor) warnings.push(`"${r.name}" has no floor color`);
    if (r.pattern && !PATTERNS.includes(r.pattern)) warnings.push(`"${r.name}" pattern "${r.pattern}" unknown (use ${PATTERNS.join(', ')})`);
  }
  if (errors.length) return { errors, warnings, summary: [] };

  const all = rooms.flatMap((r) => roomRects(r).map((rc) => ({ room: r.name, rc })));
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i].rc, b = all[j].rc;
      const ox = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
      const oz = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
      if (ox > 0.01 && oz > 0.01) errors.push(`"${all[i].room}" and "${all[j].room}" overlap by ${ox.toFixed(2)} x ${oz.toFixed(2)} m`);
    }

  // --- build with the real code, capturing its warnings ---
  const origWarn = console.warn;
  console.warn = (...args) => errors.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  let house;
  try {
    house = buildHouse(data);
  } finally {
    console.warn = origWarn;
  }

  // --- furniture inside a room and not stuck in a wall ---
  for (const item of data.furniture ?? []) {
    const [x, z] = item.at ?? [];
    if (!roomAt(rooms, x, z)) warnings.push(`${item.type} at [${x}, ${z}] is outside every room`);
  }
  for (const b of house.colliders.boxes) {
    for (const s of house.walls) {
      const minX = Math.min(s.ax, s.bx) - s.r, maxX = Math.max(s.ax, s.bx) + s.r;
      const minZ = Math.min(s.az, s.bz) - s.r, maxZ = Math.max(s.az, s.bz) + s.r;
      const ox = Math.min(b.maxX, maxX) - Math.max(b.minX, minX);
      const oz = Math.min(b.maxZ, maxZ) - Math.max(b.minZ, minZ);
      if (ox > 0.02 && oz > 0.02) {
        warnings.push(`Furniture at [${((b.minX + b.maxX) / 2).toFixed(2)}, ${((b.minZ + b.maxZ) / 2).toFixed(2)}] pokes into a wall`);
        break;
      }
    }
  }

  // --- walkability: flood fill from spawn ---
  const free = (x, z) => {
    const p = { x, z, radius: PLAYER_R };
    resolveCollisions(p, house.colliders);
    return Math.hypot(p.x - x, p.z - z) < 1e-6;
  };
  const spawn = data.spawn?.at;
  if (!spawn) errors.push('No spawn point ("spawn": { "at": [x, z], "facing": "north" })');
  else if (!roomAt(rooms, spawn[0], spawn[1])) errors.push(`Spawn [${spawn}] is not inside a room`);
  else if (!free(spawn[0], spawn[1])) errors.push(`Spawn [${spawn}] is inside a wall or furniture`);
  else {
    const pad = 2;
    const { minX, maxX, minZ, maxZ } = house.bounds;
    const x0 = minX - pad, z0 = minZ - pad;
    const nx = Math.ceil((maxX - minX + pad * 2) / GRID), nz = Math.ceil((maxZ - minZ + pad * 2) / GRID);
    const start = [Math.round((spawn[0] - x0) / GRID), Math.round((spawn[1] - z0) / GRID)];
    const seen = new Set([start.join()]);
    const stack = [start];
    const reached = new Set();
    let leaks = 0;
    while (stack.length) {
      const [i, j] = stack.pop();
      const room = roomAt(rooms, x0 + i * GRID, z0 + j * GRID);
      if (room) reached.add(room.name);
      else leaks++;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, c = j + dj;
        if (a < 0 || c < 0 || a > nx || c > nz) continue;
        const k = `${a},${c}`;
        if (seen.has(k) || !free(x0 + a * GRID, z0 + c * GRID)) continue;
        seen.add(k);
        stack.push([a, c]);
      }
    }
    for (const r of rooms) if (!reached.has(r.name)) errors.push(`"${r.name}" cannot be reached from the spawn point (missing door?)`);
    if (leaks > 0) errors.push(`The player can walk outside the rooms (${leaks} spots) - an outer wall has a gap or a door leads outside`);
  }

  // --- summary ---
  const summary = rooms.map((r) => {
    const area = roomRects(r).reduce((s, [a, b, c, d]) => s + (c - a) * (d - b), 0);
    return { name: r.name, area, outdoor: !!r.outdoor };
  });
  return { errors, warnings, summary };
}

// --- which files ---
let files = process.argv.slice(2);
if (files.length === 0) {
  const indexFile = resolve(root, 'layouts/index.json');
  const { layouts } = JSON.parse(readFileSync(indexFile, 'utf8'));
  files = layouts.map((l) => resolve(root, 'layouts', l.id, 'layout.json'));
  for (const f of files) if (!existsSync(f)) console.log(`✗ index.json lists ${relative(root, f)} but it does not exist`);
  files = files.filter(existsSync);
} else {
  const { layouts } = JSON.parse(readFileSync(resolve(root, 'layouts/index.json'), 'utf8'));
  for (const f of files) {
    const id = relative(resolve(root, 'layouts'), dirname(resolve(f)));
    if (!layouts.some((l) => l.id === id)) console.log(`⚠ ${f} is not listed in layouts/index.json (it won't appear in the game)`);
  }
}

let failed = false;
for (const file of files) {
  const { errors, warnings, summary } = validate(file);
  console.log(`\n${errors.length ? '✗' : '✓'} ${relative(root, resolve(file))}`);
  for (const s of summary)
    console.log(`    ${s.name.padEnd(22)} ${s.area.toFixed(1).padStart(7)} m²  ${(s.area * SQFT_PER_M2).toFixed(0).padStart(6)} sqft${s.outdoor ? '  (outdoor)' : ''}`);
  const indoor = summary.filter((s) => !s.outdoor).reduce((t, s) => t + s.area, 0);
  if (summary.length) console.log(`    ${'Indoor total'.padEnd(22)} ${indoor.toFixed(1).padStart(7)} m²  ${(indoor * SQFT_PER_M2).toFixed(0).padStart(6)} sqft`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  if (errors.length) failed = true;
}
// --- NPCs: npcs/npcs.json and their phrase files ---
{
  const npcFile = resolve(root, 'npcs/npcs.json');
  const errs = [];
  let lines = [];
  if (existsSync(npcFile)) {
    try {
      const { npcs } = JSON.parse(readFileSync(npcFile, 'utf8'));
      if (!Array.isArray(npcs)) errs.push('"npcs" must be a list');
      for (const n of npcs ?? []) {
        if (!n.name) errs.push('An NPC has no name');
        const pf = resolve(root, 'npcs', n.phrases ?? '');
        if (!n.phrases || !existsSync(pf)) { errs.push(`${n.name}: phrase file "${n.phrases}" not found in npcs/`); continue; }
        const count = readFileSync(pf, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).length;
        if (!count) errs.push(`${n.name}: ${n.phrases} has no phrases`);
        lines.push(`    ${n.name.padEnd(22)} ${String(count).padStart(4)} phrases (${n.phrases})`);
      }
    } catch (e) {
      errs.push(`npcs.json is not valid JSON: ${e.message}`);
    }
    console.log(`\n${errs.length ? '✗' : '✓'} npcs/npcs.json`);
    for (const l of lines) console.log(l);
    for (const e of errs) console.log(`  ✗ ${e}`);
    if (errs.length) failed = true;
  }
}

process.exit(failed ? 1 : 0);
