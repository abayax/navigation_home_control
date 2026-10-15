import * as THREE from 'three';

// A chunky little kid built from primitives. Faces +z.
// About 1.35 m tall, with a big head so it reads well from the follow camera.

const COLORS = {
  skin: '#ffd2b0',
  hair: '#5a3825',
  shirt: '#ff7a59',
  pants: '#3f6fd8',
  shoes: '#ffffff',
  cap: '#ffd60a',
};

export function createKid(colors = {}) {
  const c = { ...COLORS, ...colors };
  const mat = (color) => new THREE.MeshLambertMaterial({ color });
  const group = new THREE.Group();
  const body = new THREE.Group(); // bobs while walking
  group.add(body);

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

  const legL = limb(0.48, 0.075, c.pants, -0.09, 0.5, 0);
  const legR = limb(0.48, 0.075, c.pants, 0.09, 0.5, 0);
  for (const leg of [legL, legR]) mesh(new THREE.BoxGeometry(0.14, 0.08, 0.22), c.shoes, 0, -0.46, 0.04, leg);

  mesh(new THREE.CapsuleGeometry(0.18, 0.22, 4, 12), c.shirt, 0, 0.72, 0);

  const armL = limb(0.4, 0.055, c.shirt, -0.235, 0.88, 0);
  const armR = limb(0.4, 0.055, c.shirt, 0.235, 0.88, 0);
  for (const arm of [armL, armR]) mesh(new THREE.SphereGeometry(0.06, 10, 8), c.skin, 0, -0.4, 0, arm);

  // Head
  const headY = 1.13;
  mesh(new THREE.SphereGeometry(0.21, 24, 18), c.skin, 0, headY, 0);
  const hair = mesh(new THREE.SphereGeometry(0.215, 24, 18), c.hair, 0, headY + 0.035, -0.04);
  hair.scale.set(1, 0.95, 1);
  // Cap with a brim pointing forward
  const cap = mesh(
    new THREE.SphereGeometry(0.225, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    c.cap, 0, headY + 0.05, 0,
  );
  cap.scale.set(1, 0.8, 1);
  mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.025, 20, 1, false, -Math.PI / 2, Math.PI), c.cap, 0, headY + 0.06, 0.15);

  for (const sx of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.03, 10, 8), '#222222', sx * 0.075, headY + 0.01, 0.19);
    mesh(new THREE.SphereGeometry(0.035, 10, 8), '#ff9aa2', sx * 0.12, headY - 0.06, 0.16);
  }
  const smile = mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 16, Math.PI), '#c0392b', 0, headY - 0.06, 0.195);
  smile.rotation.z = Math.PI;

  // Soft blob shadow so the kid is grounded even outside the sun's shadow area
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.3, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false }),
  );
  blob.position.y = 0.04;
  group.add(blob);

  let phase = 0;
  let swing = 0;

  return {
    group,
    // speed: signed m/s (negative = walking backwards)
    update(dt, speed, x, z, yaw) {
      group.position.set(x, 0, z);
      group.rotation.y = yaw;

      const moving = Math.abs(speed) > 0.01;
      swing += ((moving ? Math.min(0.8, 0.35 + Math.abs(speed) * 0.12) : 0) - swing) * Math.min(1, dt * 10);
      phase += dt * speed * 4.2;

      const s = Math.sin(phase) * swing;
      legL.rotation.x = s;
      legR.rotation.x = -s;
      armL.rotation.x = -s * 0.9;
      armR.rotation.x = s * 0.9;
      body.position.y = moving ? Math.abs(Math.cos(phase)) * 0.04 * (swing / 0.8) : Math.sin(performance.now() / 600) * 0.005;
    },
  };
}
