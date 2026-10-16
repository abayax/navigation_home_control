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
    // flat disc; polygon offset keeps it from flickering against the ground or paths
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.02, 48),
      new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.position.y = 0.035;
    m.receiveShadow = true;
    g.add(m);
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

  // Kid's bike, ~1.15 m long (no training wheels - it just balances). Faces +z. Wheels spin via userData.wheels.
  bike({ color = '#2dc653' }, g) {
    const rod = (a, b, r, c) => {
      // cylinder from a = [y, z] to b = [y, z] in the bike's centre plane
      const dy = b[0] - a[0], dz = b[1] - a[1];
      const m = cyl(g, r, r, Math.hypot(dy, dz), c, 0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 8);
      m.rotation.x = Math.atan2(dz, dy);
      return m;
    };
    const wheels = [];
    for (const z of [0.4, -0.4]) {
      const tire = part(g, new THREE.TorusGeometry(0.24, 0.035, 8, 24), '#222222', 0, 0.27, z);
      tire.rotation.y = Math.PI / 2;
      for (let k = 0; k < 3; k++) {
        const spoke = part(g, new THREE.BoxGeometry(0.01, 0.46, 0.012), '#dddddd', 0, 0, 0, false);
        spoke.rotation.z = (k * Math.PI) / 3;
        tire.add(spoke);
        spoke.position.set(0, 0, 0);
      }
      wheels.push(tire);
    }
    rod([0.25, 0], [0.55, 0.3], 0.025, color); // down tube
    rod([0.52, -0.1], [0.55, 0.3], 0.025, color); // top tube
    rod([0.25, 0], [0.27, -0.4], 0.02, color); // chain stay
    rod([0.25, -0.1], [0.55, -0.1], 0.025, color); // seat post
    rod([0.52, -0.1], [0.27, -0.4], 0.018, color); // seat stay
    rod([0.55, 0.3], [0.27, 0.4], 0.022, color); // fork
    rod([0.55, 0.3], [0.72, 0.28], 0.02, '#888888'); // stem
    const bar = cyl(g, 0.018, 0.018, 0.46, '#888888', 0, 0.72, 0.28, 8);
    bar.rotation.z = Math.PI / 2;
    for (const sx of [-1, 1]) {
      const grip = cyl(g, 0.026, 0.026, 0.09, '#ff4d94', sx * 0.2, 0.72, 0.28, 8);
      grip.rotation.z = Math.PI / 2;
    }
    box(g, 0.13, 0.05, 0.22, '#ff4d94', 0, 0.58, -0.1); // seat
    box(g, 0.24, 0.14, 0.18, '#ffffff', 0, 0.62, 0.42); // front basket
    g.userData.wheels = wheels;
    return [0.5, 1.15];
  },

  tree({ kind = 'round', fruit }, g) {
    cyl(g, 0.15, 0.2, 1.6, '#8d5a3b', 0, 0.8, 0);
    if (kind === 'pine') {
      cyl(g, 0, 1.1, 1.4, '#2d6a4f', 0, 1.9, 0, 12);
      cyl(g, 0, 0.85, 1.2, '#40916c', 0, 2.6, 0, 12);
      cyl(g, 0, 0.6, 1.0, '#52b788', 0, 3.2, 0, 12);
      return { size: [0.5, 0.5], climb: { y: 3.2, reach: 1.25 } };
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
    return { size: [0.5, 0.5], climb: { y: 3.3, reach: 1.25 } }; // sit on top of the tree
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

  // ---------- playground equipment ----------
  // Builders may return { size, colliders: [{ x, z, w, d, top, spin }], terrain, climb, slides, swings }
  // (local, metres) when an item has several solid parts; `size` is then just its
  // overall footprint. `terrain(lx, lz)` gives the ground height for hills/steps;
  // `spin: true` marks a part that turns while you stand on it. `climb` = { y, reach,
  // offset }: you can climb it and sit at height y. `slides` = [{ x0, z0, y0, x1, z1, y1 }]
  // top -> bottom. `swings` = [{ x, z, top, length, pivot }]: seats you can swing on.

  // Swing frame of natural wood logs. seats: a count, or a list of
  // 'belt' | 'bucket' | 'adaptive' (high-back moulded seat with a harness)
  swingSet({ size = [6, 1.8], seats = 3, color = '#b9a58b' }, g) {
    const [w, d] = size;
    aFrame(g, w, d, 2.4, color);
    const types = Array.isArray(seats) ? seats : Array.from({ length: seats }, (_, i) => (i === seats - 1 ? 'bucket' : 'belt'));
    const swings = [];
    types.forEach((type, i) => {
      const x = -w / 2 + ((i + 0.5) * w) / types.length;
      const seatY = type === 'adaptive' ? 0.55 : 0.5;
      const L = 2.4 - seatY;
      // everything below the bar hangs from a pivot so the seat can swing
      const pivot = new THREE.Group();
      pivot.position.set(x, 2.4, 0);
      g.add(pivot);
      for (const dx of [-0.22, 0.22]) cyl(pivot, 0.012, 0.012, L, '#888888', dx, -L / 2, 0, 6);
      if (type === 'adaptive') {
        const green = '#2d6a4f';
        box(pivot, 0.46, 0.08, 0.42, green, 0, -L, 0.02); // seat
        box(pivot, 0.46, 0.6, 0.08, green, 0, -L + 0.3, -0.18); // tall back
        for (const sx of [-1, 1]) box(pivot, 0.06, 0.32, 0.36, green, sx * 0.22, -L + 0.16, 0); // side wings
        box(pivot, 0.08, 0.3, 0.05, '#adb5bd', 0, -L + 0.15, 0.2); // harness
      } else if (type === 'bucket') {
        box(pivot, 0.5, 0.25, 0.4, '#222222', 0, -L + 0.1, 0);
      } else {
        box(pivot, 0.5, 0.03, 0.18, '#222222', 0, -L, 0);
      }
      swings.push({ x, z: 0, top: 2.4, length: L, pivot });
    });
    return { size, colliders: postColliders(w, d), swings };
  },

  nestSwing({ size = [6, 2.4], nests = 2, color = '#ff9f1c' }, g) {
    const [w, d] = size;
    aFrame(g, w, d, 2.6, color);
    const swings = [];
    for (let i = 0; i < nests; i++) {
      const x = -w / 2 + ((i + 0.5) * w) / nests;
      const pivot = new THREE.Group();
      pivot.position.set(x, 2.6, 0);
      g.add(pivot);
      const ring = part(pivot, new THREE.TorusGeometry(0.55, 0.08, 10, 28), '#3a86ff', 0, -2.05, 0);
      ring.rotation.x = Math.PI / 2;
      part(pivot, new THREE.CylinderGeometry(0.52, 0.52, 0.03, 24), '#22223b', 0, -2.07, 0);
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        const rope = cyl(pivot, 0.012, 0.012, 2.1, '#888888', Math.cos(a) * 0.25, -1.0, Math.sin(a) * 0.25, 6);
        rope.rotation.z = Math.cos(a) * 0.15;
        rope.rotation.x = -Math.sin(a) * 0.15;
      }
      swings.push({ x, z: 0, top: 2.6, length: 2.0, pivot });
    }
    return { size, colliders: postColliders(w, d), swings };
  },

  // Globe spinner: a ball of curved ribs and rope net around a centre pole.
  // Step onto the base inside and it turns with you.
  spinner({ radius = 1.3, color = '#a7c957', ring = '#2a9d8f' }, g) {
    const r = radius, cy = r + 0.22, top = 2 * r + 0.3;
    cyl(g, 0.07, 0.07, top, '#3d6b74', 0, top / 2, 0, 12); // pole
    cyl(g, r * 0.8, r * 0.55, 0.14, color, 0, 0.16, 0, 28); // base bowl
    cyl(g, r * 0.78, r * 0.78, 0.05, '#333333', 0, 0.26, 0, 28); // floor disc
    const cap = part(g, new THREE.SphereGeometry(r * 0.72, 24, 8, 0, Math.PI * 2, 0, 0.55), color, 0, cy + r * 0.2, 0);
    cap.scale.y = 0.9;
    for (let k = 0; k < 4; k++) {
      // vertical ribs (each ring = two meridians)
      const rib = part(g, new THREE.TorusGeometry(r, 0.045, 6, 40), color, 0, cy, 0);
      rib.rotation.y = (k * Math.PI) / 4;
    }
    const equator = part(g, new THREE.TorusGeometry(r * 1.03, 0.06, 8, 48), ring, 0, cy, 0);
    equator.rotation.x = Math.PI / 2;
    for (const h of [-0.55, -0.25, 0.35, 0.65]) {
      // rope net rings
      const rr = Math.sqrt(Math.max(0, r * r - (h * r) ** 2));
      const rope = part(g, new THREE.TorusGeometry(rr * 0.98, 0.015, 4, 36), '#222222', 0, cy + h * r, 0);
      rope.rotation.x = Math.PI / 2;
    }
    return {
      size: [2 * r, 2 * r],
      colliders: [
        { x: 0, z: 0, w: 0.3, d: 0.3, top },
        { x: 0, z: 0, w: r * 1.4, d: r * 1.4, top: 0.28, spin: true },
      ],
    };
  },

  ropeClimber({ size = [6, 6], height = 4.5, color = '#ff9f1c' }, g) {
    const r = size[0] / 2;
    cyl(g, 0.1, 0.12, height + 0.1, '#adb5bd', 0, (height + 0.1) / 2, 0, 12);
    ball(g, 0.2, '#ff006e', 0, height + 0.15, 0);
    for (let k = 0; k < 8; k++) {
      // ropes from the top of the mast down to anchors on the ground
      const pivot = new THREE.Group();
      pivot.rotation.y = (k * Math.PI) / 4;
      g.add(pivot);
      const rope = cyl(pivot, 0.03, 0.03, Math.hypot(height, r), color, 0, height / 2, r / 2, 6);
      rope.rotation.x = -Math.atan2(r, height);
      cyl(pivot, 0.12, 0.15, 0.12, '#555555', 0, 0.06, r, 8); // anchor
    }
    for (const h of [0.9, 1.9, 2.9, 3.7]) {
      const ring = part(g, new THREE.TorusGeometry(r * (1 - h / height), 0.03, 6, 32), color, 0, h, 0);
      ring.rotation.x = Math.PI / 2;
    }
    return {
      size,
      colliders: [{ x: 0, z: 0, w: 0.4, d: 0.4, top: height + 0.1 }],
      climb: { y: height * 0.72, reach: r + 0.3, offset: 0.55 }, // climb the ropes, sit near the top beside the mast
    };
  },

  // Slide Mountain: a real grassy hill. Front (+z): grass slope to walk up and slide
  // down, with a slide on each side. East (+x), seen from the east, left to right:
  // a slide, round climbing stones, stone stairs. West (-x): steep grass. North (-z):
  // the raised "5-12" deck, level with the top. Shade sails above.
  slideMountain({ size = [16, 17], height = 2.2, color = '#74c365' }, g) {
    const Ht = height, [w, d] = size;
    const STEP_W = 0.88, STEPS = 5, EAST = 2.2 + STEP_W * STEPS;
    const STAIRS_Z = [-8, -5.65]; // north end of the east side
    const steep = (dx) => Math.max(0, Ht * (1 - dx / 3)); // too steep to walk up
    const h = (x, z) => {
      if (z >= -8 && z <= -3 && x >= -7 && x <= 2.2) return Ht; // raised deck behind the top
      if (Math.abs(x) <= 2.2 && z > -3 && z <= 1.5) return Ht; // top
      if (x > 2.2 && x <= EAST && z >= -8 && z <= 1.5) {
        if (z <= STAIRS_Z[1]) return Math.max(0, Ht - ((Math.floor((x - 2.2) / STEP_W) + 1) * Ht) / STEPS); // stairs
        return steep(x - 2.2); // climbing stones / slide
      }
      if (z > 1.5 && z <= 7.5 && Math.abs(x) <= 4) {
        // front grass slope, with steeper shoulders on both sides
        return Math.max(0, Ht * (1 - (z - 1.5) / 6) - Math.max(0, Math.abs(x) - 2.2) * 1.2);
      }
      if (x < -2.2 && x >= -5.2 && z > -3 && z <= 1.5) return steep(-x - 2.2); // west side
      return 0;
    };

    // Grass surface following the height function
    const cell = 0.25;
    const geo = new THREE.PlaneGeometry(w, d, Math.round(w / cell), Math.round(d / cell)).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, h(pos.getX(i), pos.getZ(i)) + 0.03);
    geo.computeVertexNormals();
    const turf = new THREE.Mesh(geo, mat(color));
    turf.castShadow = turf.receiveShadow = true;
    g.add(turf);

    // Stone stairs (one section wide)
    for (let k = 0; k < STEPS - 1; k++) {
      const top = Ht - ((k + 1) * Ht) / STEPS;
      box(g, STEP_W - 0.06, top + 0.04, STAIRS_Z[1] - STAIRS_Z[0] - 0.15, k % 2 ? '#d6d2c4' : '#c9c4b5',
        2.2 + STEP_W * (k + 0.5), (top + 0.04) / 2, (STAIRS_Z[0] + STAIRS_Z[1]) / 2);
    }

    // Round climbing stones up the middle section: jump from one to the next
    const colliders = [];
    [[5.5, -3.8, 0.5], [4.7, -2.75, 0.95], [3.9, -3.75, 1.45], [3.05, -2.8, 1.9], [2.45, -3.6, 2.2]].forEach(([x, z, top], i) => {
      rockMesh(g, 0.95, top, 0.95, '#bdb6a8', x, z, i + 3);
      colliders.push({ x, z, w: 0.85, d: 0.85, top });
    });

    // Slides: two down the front slope, two down the east side
    const slides = [];
    const slideAt = (x0, z0, x1, z1, c) => {
      slides.push({ x0, z0, y0: Ht, x1, z1, y1: 0.3 });
      const y0 = Ht + 0.05, y1 = 0.3;
      const run = Math.hypot(x1 - x0, z1 - z0), len = Math.hypot(run, y1 - y0);
      const pivot = new THREE.Group();
      pivot.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      pivot.rotation.y = Math.atan2(-(z1 - z0), x1 - x0); // point the slide's +x downhill
      g.add(pivot);
      const tilt = new THREE.Group();
      tilt.rotation.z = Math.atan2(y1 - y0, run);
      pivot.add(tilt);
      box(tilt, len, 0.05, 0.75, c, 0, 0, 0);
      box(tilt, len, 0.2, 0.05, c, 0, 0.1, 0.37);
      box(tilt, len, 0.2, 0.05, c, 0, 0.1, -0.37);
      for (const s2 of [-1, 1]) {
        // entry posts at the top
        const px = x0 + (s2 * 0.4 * -(z1 - z0)) / run, pz = z0 + (s2 * 0.4 * (x1 - x0)) / run;
        cyl(g, 0.05, 0.05, 1.0, '#3a86ff', px, Ht + 0.5, pz, 8);
      }
    };
    slideAt(-1.7, 1.5, -1.7, 7.9, '#a7c957');
    slideAt(1.7, 1.5, 1.7, 7.9, '#a7c957');
    slideAt(2.2, -0.1, 7.6, -0.1, '#4cc9f0');
    slideAt(2.2, -5.0, 7.6, -5.0, '#c0c4c8'); // silver, between the stairs and the climbing stones

    // Shade sails on tall posts
    const sailMat = new THREE.MeshLambertMaterial({ color: '#c8b48e', side: THREE.DoubleSide });
    const posts = [];
    const sail = (a, b, c) => {
      const geo2 = new THREE.BufferGeometry();
      geo2.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
      geo2.computeVertexNormals();
      const m = new THREE.Mesh(geo2, sailMat);
      m.castShadow = true;
      g.add(m);
      for (const [px, py, pz] of [a, b, c]) {
        if (posts.some(([qx, qz]) => Math.hypot(qx - px, qz - pz) < 0.3)) continue;
        const base = h(px, pz);
        cyl(g, 0.09, 0.09, py - base, '#e9ecef', px, (py + base) / 2, pz, 10);
        posts.push([px, pz]);
      }
    };
    sail([-3.2, 4.8, -2.5], [3.0, 4.4, 0.9], [-0.5, 5.0, 4.2]);
    sail([-7.4, 4.6, -8.2], [1.5, 4.9, -8.4], [-3.2, 4.8, -2.5]);
    sail([1.5, 4.9, -8.4], [6.4, 4.5, -5.6], [3.0, 4.4, 0.9]);

    return {
      size,
      terrain: h,
      slides,
      colliders: [...colliders, ...posts.map(([px, pz]) => ({ x: px, z: pz, w: 0.25, d: 0.25, top: 6 }))],
    };
  },

  // Forest House: tall weathered-wood A-frame on a raised deck. Stairs up the
  // +x side, a double slide down the -x side, open front (+z), climbing holds on the back.
  playHouse({ size = [3.2, 2.8], color = '#cbb89d', roof = '#b8bdc2', slide = '#a7c957' }, g) {
    const [w, d] = size;
    const deck = 1.2, sideH = 0.9, t = 0.1, open = 0.55; // half-width of the side openings
    box(g, w, deck, d, '#b5a284', 0, deck / 2, 0); // slatted base
    for (let x = -w / 2 + 0.2; x < w / 2; x += 0.3) box(g, 0.03, deck - 0.1, 0.02, '#8d7b5f', x, deck / 2, d / 2 + 0.005);
    box(g, w, 2.6, t, color, 0, deck + 1.3, -d / 2 + t / 2); // back wall
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - t / 2);
      for (const sz of [-1, 1]) {
        const len = d / 2 - open;
        box(g, t, sideH, len, color, x, deck + sideH / 2, sz * (open + len / 2)); // side walls beside the openings
      }
      box(g, 0.12, 2.0, 0.12, color, x, deck + 1.0, d / 2 - 0.06); // front corner posts
    }
    box(g, w, 0.08, 0.08, '#adb5bd', 0, deck + 1.75, d / 2 - 0.06); // bar across the front
    // A-frame roof: two planes meeting at the ridge
    const eave = deck + sideH, ridge = deck + 3.1, run = w / 2 + 0.25;
    const len = Math.hypot(run, ridge - eave), ang = Math.atan2(ridge - eave, run);
    for (const sx of [-1, 1]) {
      const plane = box(g, len, 0.08, d + 0.4, roof, (sx * run) / 2, (eave + ridge) / 2, 0);
      plane.rotation.z = -sx * ang;
    }
    // front gable slats
    for (let k = -4; k <= 4; k++) {
      const x = k * 0.32;
      const hgt = (ridge - eave) * (1 - Math.abs(x) / run); // up to the roof line
      if (hgt > 0.1) box(g, 0.06, hgt, 0.05, color, x, eave + hgt / 2, d / 2 - 0.02);
    }
    // climbing holds on the back
    const holds = ['#457b9d', '#2a9d8f', '#e9c46a', '#6c757d'];
    for (let k = 0; k < 10; k++) ball(g, 0.06, holds[k % 4], -w / 2 + 0.35 + ((k * 0.61) % (w - 0.6)), 0.35 + ((k * 0.37) % 1.6), -d / 2 - 0.02);
    // stairs up the +x side
    const steps = [0.3, 0.6, 0.9];
    steps.forEach((top, i) => box(g, 0.35, top, 1.0, '#a47148', w / 2 + 0.35 * (steps.length - i) - 0.175, top / 2, 0));
    // double slide down the -x side
    const x0 = -w / 2, x1 = -w / 2 - 2.8, y0 = deck + 0.02, y1 = 0.3;
    const sl = Math.hypot(x1 - x0, y1 - y0);
    const pivot = new THREE.Group();
    pivot.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
    pivot.rotation.z = Math.atan2(y1 - y0, x1 - x0);
    g.add(pivot);
    for (const z of [-0.3, 0.3]) {
      box(pivot, sl, 0.05, 0.55, slide, 0, 0, z);
      box(pivot, sl, 0.18, 0.04, slide, 0, 0.09, z + 0.28);
      box(pivot, sl, 0.18, 0.04, slide, 0, 0.09, z - 0.28);
    }
    const top = deck + sideH;
    const sideLen = d / 2 - open;
    return {
      size: [w + 2 * 2.8, d],
      slides: [-0.3, 0.3].map((z) => ({ x0: x0 + 0.1, z0: z, y0: deck, x1, z1: z, y1 })),
      colliders: [
        { x: 0, z: 0, w, d, top: deck },
        { x: 0, z: -d / 2 + t / 2, w, d: t, top: deck + 2.6 },
        ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: sx * (w / 2 - t / 2), z: sz * (open + sideLen / 2), w: t, d: sideLen, top }))),
        ...steps.map((top2, i) => ({ x: w / 2 + 0.35 * (steps.length - i) - 0.175, z: 0, w: 0.35, d: 1.0, top: top2 })),
      ],
    };
  },

  // Outdoor chess table: checkerboard top on a pedestal, a few pieces, four stools
  chessTable({ color = '#8d99ae' }, g) {
    const top = 0.76, sz = 0.8;
    cyl(g, 0.12, 0.2, top, color, 0, top / 2, 0, 12);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const c2 = canvas.getContext('2d');
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      c2.fillStyle = (i + j) % 2 ? '#3d3d3d' : '#f1ede4';
      c2.fillRect(i * 16, j * 16, 16, 16);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.BoxGeometry(sz, 0.05, sz),
      [mat(color), mat(color), new THREE.MeshLambertMaterial({ map: tex }), mat(color), mat(color), mat(color)]);
    board.position.y = top;
    board.castShadow = board.receiveShadow = true;
    g.add(board);
    [[-0.25, -0.3, '#ffffff'], [0.05, -0.25, '#ffffff'], [-0.15, 0.25, '#222222'], [0.25, 0.3, '#222222'], [0.15, -0.05, '#ffffff']]
      .forEach(([x, z, c]) => cyl(g, 0.025, 0.035, 0.08, c, x, top + 0.065, z, 10));
    const stools = [[0, 0.75], [0, -0.75], [0.75, 0], [-0.75, 0]];
    for (const [x, z] of stools) cyl(g, 0.18, 0.15, 0.45, color, x, 0.225, z, 14);
    return {
      size: [1.9, 1.9],
      colliders: [{ x: 0, z: 0, w: sz, d: sz, top: top + 0.025 }, ...stools.map(([x, z]) => ({ x, z, w: 0.34, d: 0.34, top: 0.45 }))],
    };
  },

  // Drinking fountain on a pedestal, with a lower basin for little kids / wheelchairs
  fountain({ color = '#adb5bd' }, g) {
    box(g, 0.28, 0.95, 0.28, color, 0, 0.475, 0);
    box(g, 0.5, 0.1, 0.36, '#ced4da', 0, 1.0, 0.05);
    box(g, 0.42, 0.1, 0.32, '#ced4da', 0.32, 0.72, 0.05);
    cyl(g, 0.015, 0.015, 0.08, '#6c757d', 0, 1.09, 0.1, 6);
    return [0.75, 0.45];
  },

  // Fold-down baby changing table on a wall (front faces +z)
  diaperStation({ color = '#e9ecef' }, g) {
    box(g, 0.9, 0.5, 0.06, color, 0, 0.95, -0.22); // wall plate
    box(g, 0.86, 0.06, 0.48, color, 0, 0.85, 0.02); // the table
    box(g, 0.5, 0.03, 0.3, '#ffadad', 0, 0.89, 0.05); // changing pad
    return [0.9, 0.5];
  },

  picnicTable({ size = [1.8, 0.8], color = '#b5835a' }, g) {
    const [w, d] = size;
    box(g, w, 0.05, d, color, 0, 0.75, 0);
    for (const sx of [-1, 1]) box(g, 0.08, 0.72, d * 0.8, '#7f5539', sx * (w / 2 - 0.2), 0.37, 0);
    return size;
  },

  bench({ size = [1.6, 0.45], color = '#b5835a' }, g) {
    const [w, d] = size;
    box(g, w, 0.05, d, color, 0, 0.45, 0);
    box(g, w, 0.35, 0.05, color, 0, 0.7, -d / 2 + 0.03); // backrest
    for (const sx of [-1, 1]) box(g, 0.06, 0.43, d * 0.9, '#555555', sx * (w / 2 - 0.12), 0.215, 0);
    return size;
  },

  boulder({ size = [1.2, 1], height = 0.6, color = '#9a9a9a', seed = 1 }, g) {
    rockMesh(g, size[0], height, size[1], color, 0, 0, seed);
    return size;
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
  trampoline: 0.92, bike: 1.2,
  spinner: 0.43, picnicTable: 0.775, fountain: 1.05, diaperStation: 0.9, bench: 0.475, boulder: (item) => item.height ?? 0.6,
  box: (item) => item.height ?? 1,
  bookshelf: (item) => item.height ?? 1.8,
};
const BOUNCY = new Set(['trampoline']);

// Where people sit inside an SUV, in the car's local frame (driver on the +x side)
export const BIKE_SEAT = { y: 0.6, z: -0.1 }; // rider's hips, in the bike's local frame

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
  let size = builder(item, object);
  let colliders = null, terrain = null, climb = null, slides = null, swings = null;
  if (size && !Array.isArray(size)) ({ size, colliders = null, terrain = null, climb = null, slides = null, swings = null } = size);
  const top = typeof TOPS[item.type] === 'function' ? TOPS[item.type](item) : TOPS[item.type] ?? 1;
  return { object, size, colliders, terrain, climb, slides, swings, top, bouncy: BOUNCY.has(item.type) };
}

// A round, irregular rock from y = 0 to `height` (bumpy sphere, same shape for the same seed)
function rockMesh(g, w, height, d, color, x, z, seed = 1) {
  const geo = new THREE.SphereGeometry(0.5, 9, 7);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    // bump depends on the vertex position (not its index) so the sphere's seam stays closed
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    const n = Math.sin(Math.round(px * 100) * 12.9898 + Math.round(py * 100) * 78.233 + Math.round(pz * 100) * 37.719 + seed * 11.1) * 43758.5453;
    const k = 1 + (n - Math.floor(n) - 0.5) * 0.28;
    pos.setXYZ(i, px * k, py * k, pz * k);
  }
  geo.computeVertexNormals();
  const rock = part(g, geo, color, x, height / 2, z);
  rock.scale.set(w, height, d);
  return rock;
}

// Two A-frames (legs splayed front/back) joined by a top bar, centred, spanning x
function aFrame(g, w, d, h, color) {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const len = Math.hypot(h, d / 2);
      const leg = cyl(g, 0.05, 0.05, len, color, sx * w / 2, h / 2, (sz * d) / 4, 8);
      leg.rotation.x = -sz * Math.atan2(d / 2, h); // tilt the leg out to (x, 0, sz·d/2)
    }
  }
  const bar = cyl(g, 0.06, 0.06, w + 0.2, color, 0, h, 0, 10);
  bar.rotation.z = Math.PI / 2;
}

const postColliders = (w, d) => [-1, 1].map((sx) => ({ x: (sx * w) / 2, z: 0, w: 0.3, d, top: 2.4 }));
