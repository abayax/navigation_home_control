import * as THREE from 'three';
import { buildHouse } from './house.js';
import { createKid } from './kid.js';
import { Input } from './input.js';
import { resolveCollisions, cameraDistance } from './collision.js';
import { stepVertical } from './physics.js';
import { Hud } from './hud.js';
import { loadLayout, setupLayoutPicker } from './layouts.js';

const WALK_SPEED = 2.4; // m/s
const BACK_SPEED = 1.5;
const RUN_FACTOR = 1.8;
const TURN_SPEED = Math.PI * 2.4; // rad/s -> a 90° turn takes ~0.2 s
const CAM_DIST = 3.4;
const CAM_HEIGHT = 1.9; // stays below door lintels (2.1 m)
const FACING = { north: Math.PI, south: 0, east: Math.PI / 2, west: -Math.PI / 2 };

const { layouts, current, data } = await loadLayout();
setupLayoutPicker(layouts, current);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#bfe6ff');
scene.fog = new THREE.Fog('#bfe6ff', 60, 160);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 300);

scene.add(new THREE.HemisphereLight('#ffffff', '#b8d8a0', 2.2));
const sun = new THREE.DirectionalLight('#fff4e0', 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

const house = buildHouse(data);
scene.add(house.group);

const kid = createKid();
scene.add(kid.group);

// ---------- player state ----------
const spawnYaw = FACING[data.spawn?.facing] ?? 0;
const player = {
  x: data.spawn?.at[0] ?? 0,
  z: data.spawn?.at[1] ?? 0,
  yaw: spawnYaw,
  targetYaw: spawnYaw,
  radius: 0.25,
  y: 0, // feet height
  vy: 0,
  grounded: true,
  support: null, // furniture box we're standing on (null = floor)
  boost: false, // jump pressed while bouncing on a trampoline
};

let mapMode = false;
let mapT = 0; // 0 = follow camera, 1 = map camera (animated)
const toggleMap = () => (mapMode = !mapMode);

const input = new Input({ onToggleMap: toggleMap });
const hud = new Hud(data, house, { onToggleMap: toggleMap });

// ---------- camera ----------
let camYaw = player.yaw;
let camDist = CAM_DIST;
let camY = 0; // smoothed player height, so bouncing doesn't shake the camera
const followPos = new THREE.Vector3();
const followTarget = new THREE.Vector3();
const mapPos = new THREE.Vector3();
const mapTarget = new THREE.Vector3();

function mapCamera() {
  const { minX, maxX, minZ, maxZ } = house.bounds;
  const w = maxX - minX + 4, d = maxZ - minZ + 4;
  const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
  const h = Math.max(d / 2 / Math.tan(vHalf), w / 2 / Math.tan(hHalf)) * 1.05;
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  mapTarget.set(cx, 0, cz);
  mapPos.set(cx, h, cz + h * 0.12);
}

function updateCamera(dt) {
  // Ease the camera's heading toward the player's heading
  camYaw += (player.yaw - camYaw) * (1 - Math.exp(-8 * dt));
  const bx = -Math.sin(camYaw), bz = -Math.cos(camYaw);

  // Snap in immediately when a wall is behind us, ease back out otherwise
  const allowed = cameraDistance(player.x, player.z, bx, bz, CAM_DIST, house.walls);
  camDist = allowed < camDist ? allowed : Math.min(allowed, camDist + dt * 3);

  camY += (player.y - camY) * (1 - Math.exp(-4 * dt));
  followPos.set(player.x + bx * camDist, CAM_HEIGHT + camY, player.z + bz * camDist);
  followTarget.set(player.x - bx * 1.2, 0.9 + camY, player.z - bz * 1.2);

  mapT += ((mapMode ? 1 : 0) - mapT) * (1 - Math.exp(-5 * dt));
  mapCamera();
  const t = mapT * mapT * (3 - 2 * mapT); // smoothstep
  camera.position.lerpVectors(followPos, mapPos, t);
  camera.lookAt(new THREE.Vector3().lerpVectors(followTarget, mapTarget, t));
  house.labels.visible = mapT > 0.5;

  // Keep the shadow-casting area centred on the player
  sun.position.set(player.x + 8, 20, player.z + 6);
  sun.target.position.set(player.x, 0, player.z);
}

// ---------- game loop ----------
function update(dt) {
  player.targetYaw += input.consumeTurns() * (Math.PI / 2);
  const diff = player.targetYaw - player.yaw;
  const step = TURN_SPEED * dt;
  player.yaw += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;

  const move = input.move;
  let speed = move > 0 ? WALK_SPEED : move < 0 ? -BACK_SPEED : 0;
  if (input.run) speed *= RUN_FACTOR;
  player.x += Math.sin(player.yaw) * speed * dt;
  player.z += Math.cos(player.yaw) * speed * dt;
  resolveCollisions(player, house.colliders);

  const groundY = stepVertical(player, house.colliders.boxes, dt, () => input.consumeJump());

  kid.update(dt, player.grounded ? speed : 0, player.x, player.z, player.yaw, player.y, groundY);
  updateCamera(dt);
  hud.update(player.x, player.z, player.yaw);
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
