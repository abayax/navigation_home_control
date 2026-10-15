import * as THREE from 'three';

// Simple, chunky, kid-friendly furniture built from primitives.
// Each builder adds meshes to `g` (front of the item faces +z) and returns its
// [width, depth] footprint for collision, or null if you can walk over it.

const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}

function part(g, geo, color, x, y, z, shadow = true) {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
const box = (g, w, h, d, c, x, y, z) => part(g, new THREE.BoxGeometry(w, h, d), c, x, y, z);
const cyl = (g, rt, rb, h, c, x, y, z, seg = 16) =>
  part(g, new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y, z);
const ball = (g, r, c, x, y, z) => part(g, new THREE.SphereGeometry(r, 18, 14), c, x, y, z);

const WOOD = '#c98f5a';

const builders = {
  bed({ size = [1.6, 2.1], color = '#ff8fab' }, g) {
    const [w, l] = size;
    box(g, w, 0.3, l, WOOD, 0, 0.15, 0);
    box(g, w - 0.08, 0.2, l - 0.08, '#ffffff', 0, 0.4, 0);
    box(g, w + 0.02, 0.08, l * 0.62, color, 0, 0.53, l * 0.19);
    box(g, w * 0.38, 0.12, 0.35, '#fff8e7', -w * 0.22, 0.56, -l / 2 + 0.3);
    box(g, w * 0.38, 0.12, 0.35, '#fff8e7', w * 0.22, 0.56, -l / 2 + 0.3);
    box(g, w, 0.9, 0.1, WOOD, 0, 0.45, -l / 2 + 0.05);
    return size;
  },

  sofa({ size = [2.2, 0.9], color = '#4895ef' }, g) {
    const [w, d] = size;
    const light = new THREE.Color(color).offsetHSL(0, 0, 0.1).getStyle();
    box(g, w, 0.42, d, color, 0, 0.21, 0);
    box(g, w, 0.5, 0.22, color, 0, 0.67, -d / 2 + 0.11);
    box(g, 0.22, 0.6, d, color, -(w / 2 - 0.11), 0.3, 0);
    box(g, 0.22, 0.6, d, color, w / 2 - 0.11, 0.3, 0);
    box(g, w - 0.5, 0.1, d - 0.3, light, 0, 0.47, 0.06);
    return size;
  },

  coffeeTable({ size = [1.1, 0.6] }, g) {
    const [w, d] = size;
    box(g, w, 0.06, d, WOOD, 0, 0.4, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      cyl(g, 0.03, 0.03, 0.37, '#8d5a3b', sx * (w / 2 - 0.07), 0.185, sz * (d / 2 - 0.07), 8);
    return size;
  },

  rug({ radius = 1.2, color = '#ffafcc' }, g) {
    part(g, new THREE.CylinderGeometry(radius, radius, 0.02, 40), color, 0, 0.035, 0, false);
    return null;
  },

  toyBox({ size = [0.8, 0.5], color = '#ffbe0b' }, g) {
    const [w, d] = size;
    box(g, w, 0.45, d, color, 0, 0.225, 0);
    box(g, w + 0.06, 0.06, d + 0.06, '#ffffff', 0, 0.48, 0);
    ball(g, 0.12, '#ff595e', -w * 0.2, 0.63, 0);
    box(g, 0.18, 0.18, 0.18, '#1982c4', w * 0.2, 0.6, 0);
    return size;
  },

  plant(_, g) {
    cyl(g, 0.2, 0.15, 0.4, '#e07a5f', 0, 0.2, 0);
    ball(g, 0.32, '#5cb85c', 0, 0.7, 0);
    ball(g, 0.22, '#7bd389', 0.12, 0.95, 0.05);
    return [0.5, 0.5];
  },

  desk({ size = [1.2, 0.6], color = '#ffffff' }, g) {
    const [w, d] = size;
    box(g, w, 0.05, d, color, 0, 0.72, 0);
    box(g, 0.05, 0.7, d, color, -w / 2 + 0.03, 0.35, 0);
    box(g, 0.05, 0.7, d, color, w / 2 - 0.03, 0.35, 0);
    box(g, 0.3, 0.25, 0.04, '#222222', 0, 0.9, -d / 2 + 0.1);
    return size;
  },

  counter({ size = [2, 0.65], color = '#ffffff' }, g) {
    const [w, d] = size;
    box(g, w, 0.86, d, color, 0, 0.43, 0);
    box(g, w + 0.04, 0.06, d + 0.04, '#8d99ae', 0, 0.89, 0);
    return size;
  },

  fridge({ size = [0.8, 0.75] }, g) {
    const [w, d] = size;
    box(g, w, 1.8, d, '#dfe7ee', 0, 0.9, 0);
    box(g, 0.04, 0.5, 0.04, '#8d99ae', w / 2 - 0.12, 1.2, d / 2 + 0.02);
    box(g, w - 0.02, 0.01, 0.01, '#8d99ae', 0, 1.15, d / 2 + 0.005);
    return size;
  },

  tub({ size = [1.7, 0.8] }, g) {
    const [w, d] = size;
    box(g, w, 0.55, d, '#ffffff', 0, 0.275, 0);
    box(g, w - 0.16, 0.01, d - 0.16, '#7fd3ff', 0, 0.556, 0);
    ball(g, 0.07, '#ffd60a', 0.3, 0.6, 0); // rubber duck
    return size;
  },

  toilet(_, g) {
    cyl(g, 0.2, 0.16, 0.4, '#ffffff', 0, 0.2, 0.08);
    cyl(g, 0.21, 0.21, 0.05, '#ffffff', 0, 0.42, 0.08);
    box(g, 0.42, 0.5, 0.2, '#ffffff', 0, 0.55, -0.25);
    return [0.45, 0.7];
  },

  sink({ size = [0.9, 0.55], color = '#a0c4ff' }, g) {
    const [w, d] = size;
    box(g, w, 0.8, d, color, 0, 0.4, 0);
    box(g, w, 0.05, d, '#ffffff', 0, 0.83, 0);
    cyl(g, 0.02, 0.02, 0.2, '#8d99ae', 0, 0.95, -d / 2 + 0.1, 8);
    return size;
  },

  tv({ size = [1.4, 0.45] }, g) {
    const [w, d] = size;
    box(g, w, 0.5, d, '#8d6e63', 0, 0.25, 0);
    box(g, w * 0.9, 0.7, 0.06, '#222222', 0, 0.9, 0);
    box(g, w * 0.84, 0.62, 0.01, '#3d5a80', 0, 0.9, 0.035);
    return size;
  },

  car({ color = '#e63946' }, g) {
    box(g, 1.9, 0.6, 4.4, color, 0, 0.55, 0);
    box(g, 1.6, 0.5, 2.2, '#bde0fe', 0, 1.1, -0.2);
    box(g, 1.64, 0.08, 2.1, color, 0, 1.38, -0.2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const wheel = cyl(g, 0.33, 0.33, 0.25, '#333333', sx * 0.9, 0.33, sz * 1.4, 20);
      wheel.rotation.z = Math.PI / 2;
    }
    box(g, 0.3, 0.15, 0.04, '#fff3b0', -0.6, 0.65, 2.21);
    box(g, 0.3, 0.15, 0.04, '#fff3b0', 0.6, 0.65, 2.21);
    return [1.9, 4.4];
  },

  // White crossover SUV, roughly a Tesla Model Y (4.75 x 1.92 x 1.62 m). Nose faces +z.
  // Windows are see-through so people sitting inside are visible.
  suv({ color = '#f8f9fa' }, g) {
    const glass = new THREE.MeshLambertMaterial({ color: '#2b3a4a', transparent: true, opacity: 0.3, depthWrite: false });
    const glassBox = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glass);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    box(g, 1.92, 0.62, 4.75, color, 0, 0.51, 0); // body
    box(g, 1.92, 0.08, 1.2, color, 0, 0.84, 1.75); // hood
    box(g, 1.92, 0.1, 0.4, color, 0, 0.87, -2.18); // tailgate lip
    box(g, 1.76, 0.05, 2.45, color, 0, 1.595, -0.25); // white roof
    // Pillars (front, middle, rear) on both sides
    for (const sx of [-1, 1]) {
      for (const [z, d] of [[0.95, 0.12], [-0.25, 0.14], [-1.45, 0.14]]) box(g, 0.06, 0.76, d, color, sx * 0.85, 1.2, z);
      glassBox(0.02, 0.62, 2.3, sx * 0.855, 1.2, -0.25); // side windows
      box(g, 0.16, 0.1, 0.2, color, sx * 1.0, 0.98, 0.9); // mirrors
      box(g, 0.32, 0.05, 0.03, '#ffffff', sx * 0.62, 0.74, 2.38); // headlights
      for (const sz of [-1, 1]) {
        const tire = cyl(g, 0.36, 0.36, 0.26, '#222222', sx * 0.86, 0.36, sz * 1.45, 24);
        tire.rotation.z = Math.PI / 2;
        const rim = cyl(g, 0.23, 0.23, 0.27, '#9aa0a6', sx * 0.86, 0.36, sz * 1.45, 16);
        rim.rotation.z = Math.PI / 2;
      }
      // Front seat backs (driver on the +x side) and a rear bench
      box(g, 0.5, 0.6, 0.12, '#3d3d3d', sx * 0.4, 1.12, -0.12);
    }
    box(g, 1.5, 0.5, 0.12, '#3d3d3d', 0, 1.07, -1.15);
    const windshield = glassBox(1.7, 0.02, Math.hypot(0.75, 0.74), 0, 1.21, 1.375);
    windshield.rotation.x = Math.atan2(0.74, 0.75);
    const rear = glassBox(1.7, 0.02, Math.hypot(0.5, 0.66), 0, 1.25, -1.75);
    rear.rotation.x = -Math.atan2(0.66, 0.5);
    const wheel = part(g, new THREE.TorusGeometry(0.17, 0.025, 8, 20), '#222222', 0.4, 1.05, 0.62);
    wheel.rotation.x = -0.5;
    box(g, 1.7, 0.12, 0.35, '#3d3d3d', 0, 0.88, 0.85); // dashboard
    box(g, 1.6, 0.05, 0.03, '#e63946', 0, 0.86, -2.39); // tail light bar
    box(g, 0.13, 0.025, 0.02, '#adb5bd', 0, 0.86, 2.385); // "T" logo
    box(g, 0.025, 0.1, 0.02, '#adb5bd', 0, 0.81, 2.385);
    return [1.92, 4.75];
  },

  tree({ kind = 'round', fruit }, g) {
    cyl(g, 0.15, 0.2, 1.6, '#8d5a3b', 0, 0.8, 0);
    if (kind === 'pine') {
      cyl(g, 0, 1.1, 1.4, '#2d6a4f', 0, 1.9, 0, 12);
      cyl(g, 0, 0.85, 1.2, '#40916c', 0, 2.6, 0, 12);
      cyl(g, 0, 0.6, 1.0, '#52b788', 0, 3.2, 0, 12);
      return [0.5, 0.5];
    }
    ball(g, 1.0, '#4caf50', 0, 2.2, 0);
    ball(g, 0.7, '#66bb6a', 0.5, 2.7, 0.2);
    ball(g, 0.6, '#43a047', -0.5, 2.6, -0.3);
    if (fruit) {
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4, y = 1.8 + (i % 3) * 0.4;
        ball(g, 0.09, fruit, Math.cos(a) * 0.95, y, Math.sin(a) * 0.95);
      }
    }
    return [0.5, 0.5];
  },

  // Flat things you walk over: exercise mat, gravel, a patch of lawn or concrete
  mat({ size = [2, 1], color = '#9b5de5' }, g) {
    const [w, d] = size;
    part(g, new THREE.BoxGeometry(w, 0.02, d), color, 0, 0.032, 0, false);
    return null;
  },

  flowers({ size = [2, 4] }, g) {
    const [w, d] = size;
    part(g, new THREE.BoxGeometry(w, 0.06, d), '#8d5a3b', 0, 0.03, 0, false);
    const colors = ['#ff595e', '#ffca3a', '#ff99c8', '#ffffff', '#c77dff', '#ff924c'];
    const stem = new THREE.CylinderGeometry(0.015, 0.015, 0.3, 5);
    const head = new THREE.SphereGeometry(0.08, 8, 6);
    const step = 0.55;
    let n = 0;
    for (let x = -w / 2 + step / 2; x < w / 2; x += step)
      for (let z = -d / 2 + step / 2; z < d / 2; z += step, n++) {
        const jx = ((n * 37) % 10) / 50 - 0.1, jz = ((n * 53) % 10) / 50 - 0.1;
        part(g, stem, '#2d6a4f', x + jx, 0.2, z + jz, false);
        part(g, head, colors[n % colors.length], x + jx, 0.38, z + jz, false);
      }
    return null;
  },

  trampoline({ size = [3.4, 3.4] }, g) {
    const r = size[0] / 2;
    const h = 0.9;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      cyl(g, 0.04, 0.04, h, '#adb5bd', Math.cos(a) * r * 0.95, h / 2, Math.sin(a) * r * 0.95, 8);
    }
    part(g, new THREE.CylinderGeometry(r * 0.88, r * 0.88, 0.02, 40), '#222222', 0, h, 0);
    const pad = part(g, new THREE.TorusGeometry(r * 0.94, 0.09, 8, 48), '#3a86ff', 0, h + 0.02, 0);
    pad.rotation.x = Math.PI / 2;
    return size;
  },

  piano({ size = [1.5, 0.6], color = '#3d2b1f' }, g) {
    const [w, d] = size;
    box(g, w, 1.25, d * 0.7, color, 0, 0.625, -d * 0.15);
    box(g, w * 0.95, 0.06, d * 0.3, '#ffffff', 0, 0.75, d * 0.35);
    for (let i = 0; i < 12; i++)
      box(g, 0.04, 0.02, d * 0.15, '#111111', -w * 0.42 + (i * w * 0.84) / 11, 0.79, d * 0.3);
    return size;
  },

  slide(_, g) {
    for (const sx of [-1, 1]) box(g, 0.06, 1.6, 0.06, '#ff595e', sx * 0.35, 0.8, -1.3);
    for (let i = 1; i <= 4; i++) box(g, 0.7, 0.04, 0.06, '#ffffff', 0, i * 0.32, -1.3);
    box(g, 0.8, 0.06, 0.5, '#ff595e', 0, 1.6, -1.1);
    // Ramp runs from the platform edge (z -0.85, y 1.6) down to the ground (z 1.55)
    const ramp = box(g, 0.7, 0.06, Math.hypot(2.4, 1.6), '#ffca3a', 0, 0.8, 0.35);
    ramp.rotation.x = Math.atan2(1.6, 2.4);
    return [0.8, 3.0];
  },

  // Generic block for anything without a dedicated model (cabinet, printer, pillar...)
  box({ size = [1, 1], height = 1, color = '#b8c0cc' }, g) {
    const [w, d] = size;
    box(g, w, height, d, color, 0, height / 2, 0);
    return size;
  },

  table({ size = [1.8, 0.9], color = '#e9d8a6' }, g) {
    const [w, d] = size;
    box(g, w, 0.05, d, color, 0, 0.74, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      cyl(g, 0.035, 0.035, 0.72, '#8d99ae', sx * (w / 2 - 0.1), 0.36, sz * (d / 2 - 0.1), 8);
    return size;
  },

  chair({ color = '#577590' }, g) {
    box(g, 0.48, 0.08, 0.48, color, 0, 0.46, 0);
    box(g, 0.48, 0.5, 0.06, color, 0, 0.75, -0.21);
    cyl(g, 0.03, 0.03, 0.42, '#555555', 0, 0.21, 0, 8);
    cyl(g, 0.24, 0.24, 0.04, '#555555', 0, 0.02, 0, 16);
    return [0.5, 0.5];
  },

  bookshelf({ size = [0.9, 0.35], height = 1.8, color = '#c98f5a' }, g) {
    const [w, d] = size;
    box(g, w, height, 0.03, color, 0, height / 2, -d / 2 + 0.015);
    for (const sx of [-1, 1]) box(g, 0.03, height, d, color, sx * (w / 2 - 0.015), height / 2, 0);
    const shelves = Math.max(2, Math.round(height / 0.4));
    const bookColors = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5'];
    for (let i = 0; i <= shelves; i++) {
      const y = (i * (height - 0.03)) / shelves + 0.015;
      box(g, w, 0.03, d, color, 0, y, 0);
      if (i < shelves) box(g, w * 0.8, 0.25, d * 0.7, bookColors[i % bookColors.length], 0, y + 0.14, 0);
    }
    return size;
  },

  whiteboard({ size = [1.8, 0.05] }, g) {
    const [w, d] = size;
    box(g, w, 1.1, d, '#ffffff', 0, 1.45, 0);
    box(g, w + 0.06, 0.04, d + 0.06, '#8d99ae', 0, 0.88, 0.03);
    return null; // wall-mounted, nothing to bump into
  },

  ball({ color = '#ff595e' }, g) {
    ball(g, 0.25, color, 0, 0.25, 0);
    return null;
  },
};

// Height you stand at on top of each item (m). Items taller than a jump
// (~1.05 m) can't be climbed. Bouncy items launch you back up.
const TOPS = {
  bed: 0.57, sofa: 0.47, coffeeTable: 0.43, toyBox: 0.51, plant: 1.0, desk: 0.745,
  counter: 0.92, fridge: 1.8, tub: 0.55, toilet: 0.445, sink: 0.855, tv: 1.25,
  car: 1.42, suv: 1.62, tree: 4, slide: 1.6, table: 0.765, chair: 0.5, piano: 1.25,
  trampoline: 0.92,
  box: (item) => item.height ?? 1,
  bookshelf: (item) => item.height ?? 1.8,
};
const BOUNCY = new Set(['trampoline']);

// Where people sit inside an SUV, in the car's local frame (driver on the +x side)
export const SUV_SEATS = [
  { x: 0.4, z: 0.12, door: { x: 1.45, z: 0.12 } },
  { x: -0.4, z: 0.12, door: { x: -1.45, z: 0.12 } },
];

export function buildFurniture(item) {
  const builder = builders[item.type];
  if (!builder) {
    console.warn(`Unknown furniture type: ${item.type}`);
    return null;
  }
  const object = new THREE.Group();
  const size = builder(item, object);
  const top = typeof TOPS[item.type] === 'function' ? TOPS[item.type](item) : TOPS[item.type] ?? 1;
  return { object, size, top, bouncy: BOUNCY.has(item.type) };
}
