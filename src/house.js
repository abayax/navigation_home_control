import * as THREE from 'three';
import { buildFurniture } from './furniture.js';

const WALL_T = 0.15; // wall thickness
const DOOR_H = 2.1; // height of the opening under a lintel
const OPEN_PLAN_WIDTH = 2.5; // openings this wide or wider get no lintel
const WINDOW_SILL = 0.9; // default window bottom (m above floor)
const WINDOW_TOP = 2.1; // default window top
const EXTERIOR_WALL = '#f3e6d3'; // outside of the house
const Z_GAP = 0.001; // tiny gaps that keep coplanar faces apart
const TRIM_IN = 0.005;
const WALL_TINT_WHITE = 0.45; // wall colour = room floor colour mixed with this much white
const FENCE_H = 1.0;
const FENCE_T = 0.08;
const EPS = 0.001;

// ---------- 1D interval helpers (walls are intervals along axis-aligned lines) ----------

function union(intervals) {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1] + EPS) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

function subtract(intervals, [a, b]) {
  const out = [];
  for (const [s, e] of intervals) {
    if (e <= a || s >= b) out.push([s, e]);
    else {
      if (s < a - EPS) out.push([s, a]);
      if (e > b + EPS) out.push([b, e]);
    }
  }
  return out;
}

const key = (orient, c) => `${orient}:${c.toFixed(3)}`;

function rectEdges([x0, z0, x1, z1]) {
  // orient 'h' = runs along x at fixed z; 'v' = runs along z at fixed x
  return [
    { orient: 'h', c: z0, span: [x0, x1] },
    { orient: 'h', c: z1, span: [x0, x1] },
    { orient: 'v', c: x0, span: [z0, z1] },
    { orient: 'v', c: x1, span: [z0, z1] },
  ];
}

// A room is one rectangle (`rect`) or several (`rects`, for L-shapes etc.)
export const roomRects = (room) => room.rects ?? [room.rect];

// Outline of a room: edges of all its rectangles, minus the parts where two of
// its own rectangles touch (those are not walls).
function roomEdges(room) {
  const all = roomRects(room).map(rectEdges);
  const out = [];
  all.forEach((edges, i) => {
    for (const e of edges) {
      let spans = [e.span];
      all.forEach((others, j) => {
        if (j === i) return;
        for (const o of others)
          if (o.orient === e.orient && Math.abs(o.c - e.c) < EPS) spans = subtract(spans, o.span);
      });
      for (const span of spans) out.push({ orient: e.orient, c: e.c, span });
    }
  });
  return out;
}

// ---------- procedural floor textures ----------

function floorTexture(pattern, color) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const base = new THREE.Color(color);
  const shade = (l) => base.clone().offsetHSL(0, 0, l).getStyle();
  ctx.fillStyle = base.getStyle();
  ctx.fillRect(0, 0, size, size);
  let metersPerTile = 2;

  if (pattern === 'wood') {
    const rows = 8;
    for (let i = 0; i < rows; i++) {
      ctx.fillStyle = shade(i % 2 ? -0.04 : 0.02);
      ctx.fillRect(0, (i * size) / rows, size, size / rows);
      ctx.fillStyle = shade(-0.12);
      ctx.fillRect(0, (i * size) / rows, size, 2);
      ctx.fillRect(((i * 97) % size), (i * size) / rows, 2, size / rows);
    }
  } else if (pattern === 'tile') {
    metersPerTile = 1;
    const n = 2;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = shade((i + j) % 2 ? -0.05 : 0.03);
        ctx.fillRect((i * size) / n, (j * size) / n, size / n, size / n);
      }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo((i * size) / n, 0); ctx.lineTo((i * size) / n, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (i * size) / n); ctx.lineTo(size, (i * size) / n); ctx.stroke();
    }
  } else {
    // carpet / grass / concrete: speckles
    if (pattern === 'grass') metersPerTile = 4;
    const count = pattern === 'grass' ? 900 : 500;
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = shade((Math.random() - 0.5) * (pattern === 'grass' ? 0.16 : 0.08));
      const x = Math.random() * size, y = Math.random() * size;
      if (pattern === 'grass') ctx.fillRect(x, y, 2, 6);
      else ctx.fillRect(x, y, 3, 3);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return { tex, metersPerTile };
}

// Mix a #rrggbb colour with white in screen (sRGB) space, so the result looks as expected
function mixWithWhite(hex, t) {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = (shift) => Math.round(((n >> shift) & 255) + (255 - ((n >> shift) & 255)) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

// Wall paint: room colour with a white baseboard and a soft shade under the ceiling
function wallTexture(color, wallHeight) {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const px = (m) => Math.round((m / wallHeight) * canvas.height);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 8, 256);
  ctx.fillStyle = new THREE.Color(color).offsetHSL(0, 0, -0.04).getStyle();
  ctx.fillRect(0, 0, 8, px(0.06)); // soft shade at the top
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 256 - px(0.12), 8, px(0.12)); // baseboard
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 256 - px(0.12) - 2, 8, 2); // its top edge
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- main builder ----------

export function buildHouse(data) {
  const H = data.wallHeight ?? 2.6;
  const group = new THREE.Group();
  const walls = []; // { ax, az, bx, bz, r }  (2D centre-lines, used for collision + camera)
  const fences = [];
  const boxes = []; // furniture AABBs { minX, maxX, minZ, maxZ }
  const bikes = []; // rideable bikes { object, box, x, z, yaw }

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: '#7cc45f' }),
  );
  ground.receiveShadow = true;
  group.add(ground);

  // Floors
  for (const room of data.rooms) {
    const { tex, metersPerTile } = floorTexture(room.pattern, room.floor);
    const material = new THREE.MeshLambertMaterial({ map: tex });
    for (const [x0, z0, x1, z1] of roomRects(room)) {
      const w = x1 - x0, d = z1 - z0;
      // Map UVs to world meters so the pattern lines up across a room's rectangles
      const geo = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++)
        uv.setXY(i, (x0 + uv.getX(i) * w) / metersPerTile, (z1 - uv.getY(i) * d) / metersPerTile);
      const floor = new THREE.Mesh(geo, material);
      floor.position.set((x0 + x1) / 2, room.outdoor ? 0.01 : 0.02, (z0 + z1) / 2);
      floor.receiveShadow = true;
      group.add(floor);
    }
  }

  // Collect wall intervals per line. Indoor room edges become walls.
  // Outdoor edges become fence, except where they meet a wall or another
  // outdoor area (a lawn next to a driveway stays open). Extra fences can be
  // listed in data.fences as { from: [x, z], to: [x, z] } (axis-aligned).
  const wallLines = new Map();
  const fenceLines = new Map();
  const lineOf = (map, orient, c) => {
    const k = key(orient, c);
    if (!map.has(k)) map.set(k, { orient, c, intervals: [], owners: [] });
    return map.get(k);
  };
  data.rooms.forEach((room, roomIndex) => {
    for (const e of roomEdges(room)) {
      const line = lineOf(room.outdoor ? fenceLines : wallLines, e.orient, e.c);
      line.intervals.push([...e.span]);
      line.owners.push(roomIndex);
    }
  });

  for (const line of wallLines.values()) line.intervals = union(line.intervals);
  for (const [k, line] of fenceLines) {
    let iv = union(line.intervals);
    // Open up spans where two different outdoor areas meet
    for (let i = 0; i < line.owners.length; i++)
      for (let j = i + 1; j < line.owners.length; j++) {
        if (line.owners[i] === line.owners[j]) continue;
        const s = Math.max(line.intervals[i][0], line.intervals[j][0]);
        const e = Math.min(line.intervals[i][1], line.intervals[j][1]);
        if (e > s + EPS) iv = subtract(iv, [s, e]);
      }
    for (const w of wallLines.get(k)?.intervals ?? []) iv = subtract(iv, w);
    line.intervals = iv;
  }
  for (const f of data.fences ?? []) {
    const [ax, az] = f.from, [bx, bz] = f.to;
    const line = Math.abs(az - bz) < EPS
      ? lineOf(fenceLines, 'h', az)
      : lineOf(fenceLines, 'v', ax);
    const span = Math.abs(az - bz) < EPS ? [Math.min(ax, bx), Math.max(ax, bx)] : [Math.min(az, bz), Math.max(az, bz)];
    line.intervals = union([...line.intervals, span]);
  }

  // Cut doors out of whichever line they sit on
  const lintels = [];
  for (const door of data.doors ?? []) {
    const [x, z] = door.at;
    const half = door.width / 2;
    let placed = false;
    for (const map of [wallLines, fenceLines]) {
      for (const [orient, c, along] of [['h', z, x], ['v', x, z]]) {
        const line = map.get(key(orient, c));
        if (!line || !line.intervals.some(([s, e]) => along >= s - EPS && along <= e + EPS)) continue;
        // widen by the wall thickness so the visible opening equals door.width
        line.intervals = subtract(line.intervals, [along - half - WALL_T / 2, along + half + WALL_T / 2]);
        if (map === wallLines && door.width < OPEN_PLAN_WIDTH) lintels.push({ orient, c, along, width: door.width });
        placed = true;
        break;
      }
      if (placed) break;
    }
    if (!placed) console.warn('Door is not on any wall:', door);
  }

  // Windows: holes in the wall (visual only - the wall is still solid to walk into)
  const windowSegs = [];
  for (const win of data.windows ?? []) {
    const [x, z] = win.at;
    let placed = false;
    for (const [orient, c, along] of [['h', z, x], ['v', x, z]]) {
      const line = wallLines.get(key(orient, c));
      if (!line || !line.intervals.some(([s, e]) => along >= s - EPS && along <= e + EPS)) continue;
      const a = along - win.width / 2, b = along + win.width / 2;
      (line.windows ??= []).push({ a, b, sill: win.sill ?? WINDOW_SILL, top: win.top ?? WINDOW_TOP });
      windowSegs.push(orient === 'h' ? { ax: a, az: c, bx: b, bz: c } : { ax: c, az: a, bx: c, bz: b });
      placed = true;
      break;
    }
    if (!placed) console.warn('Window is not on any wall:', win);
  }

  // Build meshes
  const fenceMat = new THREE.MeshLambertMaterial({ color: '#c08552' });
  const frameMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const wallTopMat = new THREE.MeshLambertMaterial({ color: '#f5efe6' });

  // Each side of a wall is painted in the colour of the room it faces (a light
  // tint of the room's floor colour unless the room sets "wall"), with a white
  // baseboard. Outside faces get the exterior colour.
  const wallMats = new Map();
  const wallMaterial = (color) => {
    if (!wallMats.has(color)) wallMats.set(color, new THREE.MeshLambertMaterial({ map: wallTexture(color, H) }));
    return wallMats.get(color);
  };
  const sideMaterial = (x, z) => {
    const room = roomAt(data.rooms, x, z);
    if (!room || room.outdoor) return wallMaterial(data.exteriorWall ?? EXTERIOR_WALL);
    return wallMaterial(room.wall ?? mixWithWhite(room.floor, WALL_TINT_WHITE));
  };
  // Materials for a box along a line: [+x, -x, +y, -y, +z, -z] faces
  const sideMats = (orient, c, mid) => orient === 'h'
    ? [wallTopMat, wallTopMat, wallTopMat, wallTopMat, sideMaterial(mid, c + 0.2), sideMaterial(mid, c - 0.2)]
    : [sideMaterial(c + 0.2, mid), sideMaterial(c - 0.2, mid), wallTopMat, wallTopMat, wallTopMat, wallTopMat];

  // A box along a line, from `from` to `to`, between heights y0 and y1.
  // Wall boxes get texture v = height / wall height, so baseboards line up.
  function lineBox(orient, c, from, to, y0, y1, thick, material) {
    const len = to - from, h = y1 - y0;
    if (len < 0.005 || h < 0.005) return;
    const geo = orient === 'h' ? new THREE.BoxGeometry(len, h, thick) : new THREE.BoxGeometry(thick, h, len);
    const mid = (from + to) / 2, y = (y0 + y1) / 2;
    if (Array.isArray(material)) {
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), (pos.getY(i) + y) / H);
    }
    const mesh = new THREE.Mesh(geo, material);
    if (orient === 'h') mesh.position.set(mid, y, c);
    else mesh.position.set(c, y, mid);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // One visual piece of wall from a to b, with window holes cut out
  function wallPiece(orient, c, a, b, windows) {
    const mats = sideMats(orient, c, (a + b) / 2);
    let cursor = a;
    for (const w of windows.filter((w) => w.b > a && w.a < b).sort((p, q) => p.a - q.a)) {
      const wa = Math.max(w.a, cursor), wb = Math.min(w.b, b);
      lineBox(orient, c, cursor, wa, 0, H, WALL_T, mats);
      lineBox(orient, c, wa, wb, 0, w.sill, WALL_T, mats); // below the window
      lineBox(orient, c, wa, wb, w.top, H, WALL_T, mats); // above the window
      // Trim pokes 5 mm into the hole so its faces never coincide with the wall's (flicker)
      lineBox(orient, c, wa - 0.04, wb + 0.04, w.sill - 0.04, w.sill + TRIM_IN, WALL_T + 0.08, frameMat); // sill
      lineBox(orient, c, wa, wb, w.top - TRIM_IN, w.top + 0.04, WALL_T + 0.04, frameMat); // head
      lineBox(orient, c, wa - 0.04, wa + TRIM_IN, w.sill, w.top, WALL_T + 0.04, frameMat); // jambs
      lineBox(orient, c, wb - TRIM_IN, wb + 0.04, w.sill, w.top, WALL_T + 0.04, frameMat);
      cursor = wb;
    }
    lineBox(orient, c, cursor, b, 0, H, WALL_T, mats);
  }

  const segmentOf = (orient, c, a, b, r) => (orient === 'h'
    ? { ax: a, az: c, bx: b, bz: c, r }
    : { ax: c, az: a, bx: c, bz: b, r });

  // Where rooms start/end along a line, so each wall piece faces one room per side
  const allRects = data.rooms.flatMap(roomRects);
  const breaksOn = (orient, c) => allRects.flatMap(([x0, z0, x1, z1]) => (orient === 'h'
    ? (Math.abs(z0 - c) < EPS || Math.abs(z1 - c) < EPS ? [x0, x1] : [])
    : (Math.abs(x0 - c) < EPS || Math.abs(x1 - c) < EPS ? [z0, z1] : [])));

  for (const line of wallLines.values()) {
    const breaks = breaksOn(line.orient, line.c);
    for (const [s, e] of line.intervals) {
      if (e - s <= 0.02) continue;
      const a = s - WALL_T / 2, b = e + WALL_T / 2; // extend so corners meet
      walls.push(segmentOf(line.orient, line.c, a, b, WALL_T / 2));
      const cuts = [...new Set(breaks.filter((p) => p > s + EPS && p < e - EPS))].sort((p, q) => p - q);
      // Visually stop 1 mm short so an end never sits exactly on another wall's face (flicker)
      const points = [a + Z_GAP, ...cuts, b - Z_GAP];
      for (let i = 0; i < points.length - 1; i++) wallPiece(line.orient, line.c, points[i], points[i + 1], line.windows ?? []);
    }
  }
  for (const line of fenceLines.values())
    for (const [s, e] of line.intervals) {
      if (e - s <= 0.02) continue;
      const a = s - FENCE_T / 2, b = e + FENCE_T / 2;
      lineBox(line.orient, line.c, a, b, 0, FENCE_H, FENCE_T, fenceMat);
      fences.push(segmentOf(line.orient, line.c, a, b, FENCE_T / 2));
    }

  for (const l of lintels)
    lineBox(l.orient, l.c, l.along - l.width / 2 - Z_GAP, l.along + l.width / 2 + Z_GAP, DOOR_H, H, WALL_T, sideMats(l.orient, l.c, l.along));

  // Furniture
  for (const item of data.furniture ?? []) {
    const f = buildFurniture(item);
    if (!f) continue;
    const [x, z] = item.at;
    const rot = ((item.rot ?? 0) * Math.PI) / 180;
    f.object.position.set(x, 0, z);
    f.object.rotation.y = rot;
    group.add(f.object);
    if (f.size) {
      const swap = Math.abs(Math.sin(rot)) > 0.5;
      const [w, d] = swap ? [f.size[1], f.size[0]] : f.size;
      const box = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top: f.top, bouncy: f.bouncy, item, rot, size: f.size };
      boxes.push(box);
      if (item.type === 'bike') bikes.push({ object: f.object, box, x, z, yaw: rot });
    }
  }

  // Bounds of everything (for the map camera + minimap)
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const [x0, z0, x1, z1] of data.rooms.flatMap(roomRects)) {
    bounds.minX = Math.min(bounds.minX, x0);
    bounds.maxX = Math.max(bounds.maxX, x1);
    bounds.minZ = Math.min(bounds.minZ, z0);
    bounds.maxZ = Math.max(bounds.maxZ, z1);
  }

  return {
    group,
    walls,
    fences,
    windows: windowSegs,
    bikes,
    bounds,
    colliders: { segments: [...walls, ...fences], boxes },
  };
}

// Indoor rooms win over outdoor areas when they overlap.
export function roomAt(rooms, x, z) {
  const inside = (r) => roomRects(r).some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
  return rooms.find((r) => !r.outdoor && inside(r)) ?? rooms.find((r) => r.outdoor && inside(r)) ?? null;
}
