import * as THREE from 'three';
import { buildHouse, roomAt } from './house.js';
import { createKid, HIP_HEIGHT } from './person.js';
import { BIKE_SEAT } from './furniture.js';
import { Input } from './input.js';
import { resolveCollisions, cameraDistance, lineBlocked } from './collision.js';
import { stepVertical } from './physics.js';
import { Hud } from './hud.js';
import { loadLayout, setupLayoutPicker } from './layouts.js';
import { NavGrid } from './nav.js';
import { Npc, findSpots, loadNpcDefs } from './npc.js';

const WALK_SPEED = 2.4; // m/s
const BACK_SPEED = 1.5;
const RUN_FACTOR = 1.8;
const TURN_SPEED = Math.PI * 2.4; // rad/s -> a 90° turn takes ~0.2 s
const CAM_DIST = 3.4;
const CAM_HEIGHT = 1.9; // stays below door lintels (2.1 m)
const BIKE_SPEED = 3.6;
const BIKE_BACK_SPEED = 1.2;
const BIKE_RADIUS = 0.3;
const MOUNT_DISTANCE = 1.1; // how close to a bike you must be to hop on
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

// ---------- family NPCs ----------
const nav = new NavGrid(house, data.rooms);
const spots = findSpots(house, nav);
const takenSpots = new Set();
let npcs = [];
try {
  const defs = await loadNpcDefs();
  const hudEl = document.getElementById('hud');
  npcs = defs.map((def) => new Npc(def, { nav, spots, taken: takenSpots, rooms: data.rooms, walls: house.walls, scene, hudEl }));
} catch (e) {
  console.warn('No NPCs:', e);
}

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

let bodyYaw = player.yaw; // which way the kid's body faces (turns toward the camera when walking back)
let faceBack = false;

// ---------- bikes ----------
// Bikes may only go in outdoor areas and rooms marked "allowBike" (the garage).
let riding = null; // the bike being ridden
let promptUntil = 0;
const boxes = house.colliders.boxes;
const promptEl = document.getElementById('prompt');
const bikeAllowed = (x, z) => {
  const room = roomAt(data.rooms, x, z);
  return !!room && (room.outdoor || room.allowBike === true);
};

function nearestBike() {
  let best = null, bestD = MOUNT_DISTANCE;
  for (const b of house.bikes) {
    const d = Math.hypot(b.x - player.x, b.z - player.z);
    if (d < bestD && !lineBlocked(player.x, player.z, b.x, b.z, house.colliders.segments)) { best = b; bestD = d; }
  }
  return best;
}

function mount(bike) {
  riding = bike;
  boxes.splice(boxes.indexOf(bike.box), 1); // the bike moves with us now
  player.x = bike.x;
  player.z = bike.z;
  player.yaw = player.targetYaw = bike.yaw;
  player.radius = BIKE_RADIUS;
  player.y = player.vy = 0;
  player.grounded = true;
  player.support = null;
  faceBack = false;
}

function dismount() {
  const bike = riding;
  riding = null;
  bike.x = player.x;
  bike.z = player.z;
  bike.yaw = player.targetYaw;
  bike.object.rotation.y = bike.yaw;
  const swap = Math.abs(Math.sin(bike.yaw)) > 0.5;
  const [w, d] = swap ? [bike.box.size[1], bike.box.size[0]] : bike.box.size;
  Object.assign(bike.box, { minX: bike.x - w / 2, maxX: bike.x + w / 2, minZ: bike.z - d / 2, maxZ: bike.z + d / 2, rot: bike.yaw });
  boxes.push(bike.box);
  // Step off to the side (or behind / in front) wherever there's room
  player.radius = 0.25;
  const c = Math.cos(bike.yaw), sn = Math.sin(bike.yaw);
  for (const [lx, lz] of [[0.65, 0], [-0.65, 0], [0, -1.0], [0, 1.0]]) {
    const test = { x: bike.x + lx * c + lz * sn, z: bike.z - lx * sn + lz * c, y: 0, radius: player.radius };
    const { x, z } = test;
    resolveCollisions(test, house.colliders);
    const clear = Math.hypot(test.x - x, test.z - z) < 1e-3 && !lineBlocked(bike.x, bike.z, x, z, house.colliders.segments);
    if (clear && roomAt(data.rooms, x, z)) {
      player.x = x;
      player.z = z;
      break;
    }
  }
}

function showPrompt(text, seconds = 0) {
  if (seconds) promptUntil = performance.now() + seconds * 1000;
  else if (performance.now() < promptUntil) return; // a timed message is showing
  promptEl.textContent = text;
  promptEl.classList.toggle('show', !!text);
}

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

  // Hop on / off a bike with jump
  const touch = document.body.classList.contains('touch');
  if (riding) {
    if (input.consumeJump()) dismount();
  } else if (player.grounded && player.y < 0.05 && input.jumpQueued && nearestBike()) {
    input.consumeJump();
    mount(nearestBike());
  }

  const move = input.move;
  let speed = riding
    ? move > 0 ? BIKE_SPEED : move < 0 ? -BIKE_BACK_SPEED : 0
    : move > 0 ? WALK_SPEED : move < 0 ? -BACK_SPEED : 0;
  if (input.run) speed *= riding ? 1.4 : RUN_FACTOR;
  const prevX = player.x, prevZ = player.z;
  player.x += Math.sin(player.yaw) * speed * dt;
  player.z += Math.cos(player.yaw) * speed * dt;
  for (const npc of npcs) npc.pushAway(player);
  resolveCollisions(player, house.colliders);
  if (riding) {
    // Keep the bike out of the house: check where we are and just ahead of the front wheel
    const dir = speed < 0 ? -1 : 1;
    const aheadX = player.x + Math.sin(player.yaw) * 0.55 * dir, aheadZ = player.z + Math.cos(player.yaw) * 0.55 * dir;
    if (!bikeAllowed(player.x, player.z) || !bikeAllowed(aheadX, aheadZ)) {
      if (speed !== 0) showPrompt('🚲 No bikes in the house!', 2);
      player.x = prevX;
      player.z = prevZ;
    }
  }

  // Walking backwards turns the kid to face the camera (so you can see her face);
  // walking forwards turns her back around
  if (riding) faceBack = false;
  else if (move < 0) faceBack = true;
  else if (move > 0) faceBack = false;
  const targetBody = player.yaw + (faceBack ? Math.PI : 0);
  bodyYaw += Math.atan2(Math.sin(targetBody - bodyYaw), Math.cos(targetBody - bodyYaw)) * Math.min(1, dt * 10);

  if (riding) {
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    riding.object.position.set(player.x, 0, player.z);
    riding.object.rotation.y = player.yaw;
    for (const wheel of riding.object.userData.wheels ?? []) wheel.rotation.z -= (speed * dt) / 0.24;
    const seatX = player.x + fx * BIKE_SEAT.z, seatZ = player.z + fz * BIKE_SEAT.z;
    kid.update(dt, Math.abs(speed), seatX, seatZ, player.yaw, BIKE_SEAT.y - HIP_HEIGHT, 0, 0, 1);
    showPrompt(touch ? 'Tap ⤒ to get off' : 'Press Space to get off');
  } else {
    const groundY = stepVertical(player, boxes, dt, () => input.consumeJump());
    const animSpeed = player.grounded ? (faceBack ? Math.abs(speed) : speed) : 0;
    kid.update(dt, animSpeed, player.x, player.z, bodyYaw, player.y, groundY);
    showPrompt(player.grounded && player.y < 0.05 && nearestBike() ? (touch ? '🚲 Tap ⤒ to ride' : '🚲 Press Space to ride') : '');
  }

  for (const npc of npcs) npc.update(dt, player, npcs.filter((o) => o !== npc));
  updateCamera(dt);
  hud.update(player.x, player.z, player.yaw, npcs);
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  renderer.render(scene, camera);
  for (const npc of npcs) npc.placeBubble(camera, innerWidth, innerHeight);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
