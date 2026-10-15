import * as THREE from 'three';

// Chunky cartoon people built from primitives. Faces +z.
// The kid is about 1.35 m tall with a big head so it reads well from the follow
// camera; adults are the same model scaled up with a relatively smaller head.

const KID_COLORS = {
  skin: '#ffd2b0',
  hair: '#5a3825',
  shirt: '#ff7a59',
  pants: '#3f6fd8',
  shoes: '#ffffff',
  cap: '#ffd60a',
};

export const HIP_HEIGHT = 0.5; // unscaled hip pivot height (for sitting)

export function createKid(colors = {}) {
  return createPerson({ colors: { ...KID_COLORS, ...colors }, hair: 'cap' });
}

/**
 * options: colors {skin, hair, shirt, pants, shoes, cap}, scale (overall size),
 * headScale, hair: 'cap' | 'short' | 'long', glasses: boolean
 */
export function createPerson({ colors = {}, scale = 1, headScale = 1, hair = 'short', glasses = false } = {}) {
  const c = { ...KID_COLORS, ...colors };
  const mat = (color) => new THREE.MeshLambertMaterial({ color });
  const group = new THREE.Group();
  const figure = new THREE.Group(); // everything except the blob shadow; scaled
  figure.scale.setScalar(scale);
  group.add(figure);
  const body = new THREE.Group(); // bobs while walking
  figure.add(body);

  const mesh = (geo, color, x, y, z, parent = body) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // Limb = pivot at the joint, geometry hanging down from it
  const limb = (len, radius, color, x, y, z) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    body.add(pivot);
    mesh(new THREE.CapsuleGeometry(radius, len - radius * 2, 4, 10), color, 0, -len / 2, 0, pivot);
    return pivot;
  };

  const legL = limb(0.48, 0.075, c.pants, -0.09, HIP_HEIGHT, 0);
  const legR = limb(0.48, 0.075, c.pants, 0.09, HIP_HEIGHT, 0);
  for (const leg of [legL, legR]) mesh(new THREE.BoxGeometry(0.14, 0.08, 0.22), c.shoes, 0, -0.46, 0.04, leg);

  mesh(new THREE.CapsuleGeometry(0.18, 0.22, 4, 12), c.shirt, 0, 0.72, 0);

  const armL = limb(0.4, 0.055, c.shirt, -0.235, 0.88, 0);
  const armR = limb(0.4, 0.055, c.shirt, 0.235, 0.88, 0);
  for (const arm of [armL, armR]) mesh(new THREE.SphereGeometry(0.06, 10, 8), c.skin, 0, -0.4, 0, arm);

  // Head (its own group so adults can have a relatively smaller head)
  const head = new THREE.Group();
  head.position.y = 0.92 + 0.21 * headScale;
  head.scale.setScalar(headScale);
  body.add(head);
  const h = (geo, color, x, y, z) => mesh(geo, color, x, y, z, head);

  h(new THREE.SphereGeometry(0.21, 24, 18), c.skin, 0, 0, 0);
  const hairCap = h(new THREE.SphereGeometry(0.215, 24, 18), c.hair, 0, 0.035, -0.04);
  hairCap.scale.set(1, 0.95, 1);
  if (hair === 'cap') {
    const cap = h(new THREE.SphereGeometry(0.225, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), c.cap, 0, 0.05, 0);
    cap.scale.set(1, 0.8, 1);
    h(new THREE.CylinderGeometry(0.16, 0.16, 0.025, 20, 1, false, -Math.PI / 2, Math.PI), c.cap, 0, 0.06, 0.15);
  } else if (hair === 'long') {
    h(new THREE.BoxGeometry(0.4, 0.42, 0.16), c.hair, 0, -0.12, -0.12);
    h(new THREE.SphereGeometry(0.09, 12, 10), c.hair, 0, 0.12, -0.25); // bun
  }

  for (const sx of [-1, 1]) {
    h(new THREE.SphereGeometry(0.03, 10, 8), '#222222', sx * 0.075, 0.01, 0.19);
    h(new THREE.SphereGeometry(0.035, 10, 8), '#ff9aa2', sx * 0.12, -0.06, 0.16);
    if (glasses) h(new THREE.TorusGeometry(0.048, 0.009, 6, 16), '#222222', sx * 0.075, 0.01, 0.205);
  }
  if (glasses) h(new THREE.BoxGeometry(0.05, 0.01, 0.01), '#222222', 0, 0.015, 0.21);
  const smile = h(new THREE.TorusGeometry(0.05, 0.012, 6, 16, Math.PI), '#c0392b', 0, -0.06, 0.195);
  smile.rotation.z = Math.PI;

  // Soft blob shadow so the person is grounded even outside the sun's shadow area
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.3 * scale, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false }),
  );
  blob.position.y = 0.04;
  group.add(blob);

  let phase = 0;
  let swing = 0;
  let air = 0; // 0 = on the ground, 1 = in the air

  return {
    group,
    scale,
    /** Height of the top of the head when standing (m). */
    height: (0.92 + 0.42 * headScale) * scale,
    // speed: signed m/s (negative = walking backwards)
    // y: feet height, groundY: height of the surface below (for the blob shadow)
    // sit: 0 = standing, 1 = sitting (legs forward); y is then the group height
    update(dt, speed, x, z, yaw, y = 0, groundY = 0, sit = 0) {
      group.position.set(x, y, z);
      group.rotation.y = yaw;

      const moving = Math.abs(speed) > 0.01;
      swing += ((moving ? Math.min(0.8, 0.35 + Math.abs(speed) * 0.12) : 0) - swing) * Math.min(1, dt * 10);
      phase += (dt * speed * 4.2) / scale;

      // Airborne pose: arms up, knees tucked
      const height = y - groundY;
      air += ((height > 0.05 && sit === 0 ? 1 : 0) - air) * Math.min(1, dt * 12);

      const s = Math.sin(phase) * swing * (1 - air) * (1 - sit);
      legL.rotation.x = s + air * 0.5 - sit * 1.45;
      legR.rotation.x = -s - air * 0.3 - sit * 1.45;
      armL.rotation.x = -s * 0.9 - air * 2.6 - sit * 0.5;
      armR.rotation.x = s * 0.9 - air * 2.6 - sit * 0.5;
      armL.rotation.z = -air * 0.35;
      armR.rotation.z = air * 0.35;
      body.position.y = moving ? Math.abs(Math.cos(phase)) * 0.04 * (swing / 0.8) : Math.sin(performance.now() / 600) * 0.005;

      blob.visible = sit < 0.5;
      blob.position.y = groundY - y + 0.04;
      blob.scale.setScalar(1 / (1 + height * 0.6));
    },
  };
}
