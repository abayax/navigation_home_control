import * as THREE from 'three';
import { buildHouse, roomAt } from './house.js';
import { createKid, HIP_HEIGHT } from './person.js';
import { BIKE_SEAT } from './furniture.js';
import { Input } from './input.js';
import { resolveCollisions, cameraDistance, lineBlocked, terrainBlocks, terrainHeightAt, terrainSlope } from './collision.js';
import { stepVertical } from './physics.js';
import { Hud } from './hud.js';
import { loadLayout, setupLayoutPicker } from './layouts.js';
import { NavGrid } from './nav.js';
import { Environment } from './sky.js';
import { Npc, findSpots, loadNpcDefs } from './npc.js';

const WALK_SPEED = 2.4; // m/s
const BACK_SPEED = 1.5;
const RUN_FACTOR = 2.6;
const RUN_ANIM_SPEED = WALK_SPEED * 1.15; // running: same leg rhythm as walking, longer stride
const TURN_STEP = Math.PI / 6; // one tap of left/right turns 30° (taps add up)
const TURN_SPEED = Math.PI * 1.2; // rad/s -> a 30° turn takes ~0.14 s
const STEER_RATE = 2.4; // rad/s at full drag sideways
const CAM_DIST = 3.4;
const CAM_HEIGHT = 1.9; // stays below door lintels (2.1 m)
const BIKE_SPEED = 3.6;
const BIKE_BACK_SPEED = 1.2;
const BIKE_RADIUS = 0.3;
const MOUNT_DISTANCE = 1.1; // how close to a bike you must be to hop on
const CLIMB_TIME = 0.9; // seconds to climb up or down
const SLIDE_MAX = 3.2; // m/s sliding down a grass slope
const SLIDE_DELAY = 0.25; // stand still this long on a slope before sliding
const SPIN_MAX = 1.6; // rad/s for a spinner you stand on
const SLIDE_RIDE_SPEED = 3.4; // m/s going down a slide
const SWING_RATE = 2.4; // rad/s of the swing's back-and-forth (a bit faster when swinging high)
const SWING_EASY = 0.3; // how high a swing goes by itself (rad)
const SWING_MAX = Math.PI / 2; // hold forward to pump all the way up to horizontal
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

const hemi = new THREE.HemisphereLight('#ffffff', '#b8d8a0', 2.2);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff4e0', 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02; // stops "shadow acne" stripes on walls
scene.add(sun, sun.target);

const house = buildHouse(data);
scene.add(house.group);

const kid = createKid();
kid.group.rotation.order = 'YXZ'; // so leaning on a swing tilts around her own left-right axis
scene.add(kid.group);

// ---------- family NPCs ----------
const nav = new NavGrid(house, data.rooms);
const spots = findSpots(house, nav);
const takenSpots = new Set();
let npcs = [];
try {
  // each NPC can list the layouts it appears in (e.g. the other kids only at the playground)
  const defs = (await loadNpcDefs()).filter((d) => !d.layouts || d.layouts.includes(current.id));
  const hudEl = document.getElementById('hud');
  npcs = defs.map((def) => new Npc(def, { nav, spots, taken: takenSpots, rooms: data.rooms, walls: house.walls, scene, hudEl, house }));
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

let slideSpeed = 0, stillOnSlope = 0;
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

// ---------- climbing (trees, rope climber) ----------
let climb = null; // { spot, phase: 'up' | 'top' | 'down', t, from, top }

function nearestClimb() {
  let best = null, bestD = Infinity;
  for (const c of house.climbs) {
    const d = Math.hypot(c.x - player.x, c.z - player.z);
    if (d < c.reach + player.radius && d >= c.minDist && d < bestD && !lineBlocked(player.x, player.z, c.x, c.z, house.colliders.segments)) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

function startClimb(spot) {
  // sit on top (trees), or beside the mast on the side you climbed from (rope climber)
  const dx = player.x - spot.x, dz = player.z - spot.z, d = Math.hypot(dx, dz) || 1;
  const top = { x: spot.x + (dx / d) * spot.offset, z: spot.z + (dz / d) * spot.offset, y: spot.y };
  climb = { spot, phase: 'up', t: 0, from: { x: player.x, z: player.z }, top };
  player.vy = 0;
  faceBack = false;
  if (spot.pose === 'hang') player.yaw = player.targetYaw = Math.atan2(spot.x - player.x, spot.z - player.z); // face it
}

// ---------- slides and swings ----------
let ride = null; // { kind: 'slide', s, t, len } | { kind: 'swing', s, t }

function nearestSlide() {
  let best = null, bestD = 0.9;
  for (const sl of house.slides) {
    const d = Math.hypot(sl.x0 - player.x, sl.z0 - player.z);
    if (d < bestD && Math.abs(player.y - sl.y0) < 0.45 && !sl.rider) { best = sl; bestD = d; }
  }
  return best;
}

function nearestSwing() {
  let best = null, bestD = 0.9;
  for (const sw of house.swings) {
    const d = Math.hypot(sw.x - player.x, sw.z - player.z);
    if (d < bestD && player.y < 0.1 && !sw.rider) { best = sw; bestD = d; }
  }
  return best;
}

// Runs a slide or swing ride for this frame (the kid is carried, not walking)
function updateRide(dt) {
  if (ride.kind === 'slide') {
    const sl = ride.s;
    ride.t = Math.min(1, ride.t + (dt * SLIDE_RIDE_SPEED) / ride.len);
    const k = ride.t;
    player.x = sl.x0 + (sl.x1 - sl.x0) * k;
    player.z = sl.z0 + (sl.z1 - sl.z0) * k;
    player.y = sl.y0 + (sl.y1 - sl.y0) * k;
    const yaw = Math.atan2(sl.x1 - sl.x0, sl.z1 - sl.z0);
    const y = player.y + 0.06 - HIP_HEIGHT;
    kid.update(dt, 0, player.x, player.z, yaw, y, y, 1);
    if (k >= 1) {
      // shoot off the end and land
      player.x += Math.sin(yaw) * 0.55;
      player.z += Math.cos(yaw) * 0.55;
      player.yaw = player.targetYaw = bodyYaw = yaw;
      player.vy = 0;
      player.grounded = false;
      player.support = null;
      ride = null;
    }
    return;
  }
  // swing
  const sw = ride.s;
  const fx = Math.sin(sw.yaw), fz = Math.cos(sw.yaw);
  if (input.consumeJump()) {
    sw.pivot.rotation.x = 0;
    kid.group.rotation.x = 0;
    player.x = sw.x + fx * 0.75;
    player.z = sw.z + fz * 0.75;
    player.y = 0;
    player.vy = 0;
    player.grounded = true;
    player.yaw = player.targetYaw = bodyYaw = sw.yaw;
    resolveCollisions(player, house.colliders);
    sw.rider = null;
    ride = null;
    return;
  }
  // Hold forward to pump higher, back to slow down; otherwise it settles to an easy swing
  ride.t += dt;
  if (input.held('up')) ride.amp = Math.min(SWING_MAX, ride.amp + 0.35 * dt);
  else if (input.held('down')) ride.amp = Math.max(0, ride.amp - 0.5 * dt);
  else ride.amp += (Math.min(SWING_EASY, ride.t * 0.15) - ride.amp) * Math.min(1, dt * (ride.amp > SWING_EASY ? 0.15 : 2));
  ride.phase += (SWING_RATE + ride.amp * 0.8) * dt;
  const a = ride.amp * Math.sin(ride.phase);
  sw.pivot.rotation.x = -a;
  player.x = sw.x + fx * sw.length * Math.sin(a);
  player.z = sw.z + fz * sw.length * Math.sin(a);
  player.y = sw.top - sw.length * Math.cos(a);
  const y = player.y + 0.04 - HIP_HEIGHT;
  kid.update(dt, 0, player.x, player.z, sw.yaw, y, y, 1);
  kid.group.rotation.x = -a; // lean with the swing
}

// Moves the kid along the climb; returns the kid's pose for this frame
function updateClimb(dt) {
  if (climb.phase === 'top') {
    if (input.consumeJump()) {
      climb.phase = 'down';
      climb.t = 0;
    }
  } else {
    climb.t = Math.min(1, climb.t + dt / CLIMB_TIME);
  }
  const { from, top } = climb;
  const k = climb.phase === 'up' ? climb.t : climb.phase === 'down' ? 1 - climb.t : 1;
  const ease = k * k * (3 - 2 * k);
  // move to the trunk quickly, then up
  const h = Math.min(1, k * 2.5);
  player.x = from.x + (top.x - from.x) * h;
  player.z = from.z + (top.z - from.z) * h;
  player.y = top.y * ease;
  if (climb.phase === 'up' && climb.t >= 1) climb.phase = 'top';
  // Hanging on a spinner: it carries you around
  const sp = climb.spot.spinner;
  if (climb.phase === 'top' && sp?.speed) {
    const a = sp.speed * dt, dx = top.x - sp.x, dz = top.z - sp.z;
    top.x = sp.x + dx * Math.cos(a) + dz * Math.sin(a);
    top.z = sp.z - dx * Math.sin(a) + dz * Math.cos(a);
    player.x = top.x;
    player.z = top.z;
    player.yaw += a;
    player.targetYaw += a;
  }
  if (climb.phase === 'down' && climb.t >= 1) {
    climb = null;
    player.y = 0;
    player.grounded = true;
    player.support = null;
    return { sit: 0 };
  }
  return { sit: climb.phase === 'top' && climb.spot.pose !== 'hang' ? 1 : 0 };
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

const env = new Environment(scene, { hemi, sun });
const input = new Input({ onToggleMap: toggleMap, onToggleNight: () => env.toggle() });
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

  // Keep the shadow-casting area centred on the player, snapped to whole shadow-map
  // texels so shadows don't shimmer as she moves
  const texel = (sun.shadow.camera.right - sun.shadow.camera.left) / sun.shadow.mapSize.x;
  const sx = Math.round(player.x / texel) * texel, sz = Math.round(player.z / texel) * texel;
  sun.position.set(sx + 8, 20, sz + 6);
  sun.target.position.set(sx, 0, sz);
}

// ---------- game loop ----------
// Spinners turn while someone rides them (kid standing inside or hanging on, or an
// NPC), and slow down after everyone hops off. Runs every frame.
function updateSpinners(dt) {
  for (const sp of house.spinners) {
    const onIt = !ride && !climb && !riding && player.grounded && player.support === sp.box;
    const hanging = climb?.phase === 'top' && climb.spot.spinner === sp;
    const ridden = onIt || hanging || npcs.some((n) => n.spinner === sp);
    sp.speed = ridden ? Math.min(SPIN_MAX, (sp.speed ?? 0) + 1.2 * dt) : Math.max(0, (sp.speed ?? 0) - 0.6 * dt);
    if (!sp.speed) continue;
    const a = sp.speed * dt;
    sp.object.rotation.y += a;
    if (onIt) {
      const dx = player.x - sp.x, dz = player.z - sp.z;
      player.x = sp.x + dx * Math.cos(a) + dz * Math.sin(a);
      player.z = sp.z - dx * Math.sin(a) + dz * Math.cos(a);
      player.yaw += a;
      player.targetYaw += a;
      bodyYaw += a;
    }
  }

}

const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

function update(dt) {
  updateSpinners(dt);
  // In the map view the controls follow the screen: up = up the map, left = left, ...
  // The kid turns to face that way, then walks. Otherwise: tank-style turning.
  const mapControls = mapMode;
  const mapDir = input.mapDir;
  const mapLen = Math.min(1, Math.hypot(mapDir.x, mapDir.z));
  if (mapControls) {
    input.consumeTurns(); // no step turns in the map view
    if (mapLen > 0.05) player.targetYaw = player.yaw + angleDiff(player.yaw, Math.atan2(mapDir.x, mapDir.z));
  } else {
    // Smooth steering from dragging the screen
    if (input.steer) {
      player.yaw += input.steer * STEER_RATE * dt;
      player.targetYaw += input.steer * STEER_RATE * dt;
    }
    player.targetYaw += input.consumeTurns() * TURN_STEP;
  }
  const diff = player.targetYaw - player.yaw;
  const step = TURN_SPEED * dt;
  player.yaw += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;

  const touch = document.body.classList.contains('touch');
  const jumpKey = touch ? 'Tap ⤒' : 'Press Space';

  // On a slide or a swing: the ride carries her
  if (ride) {
    updateRide(dt);
    showPrompt(ride?.kind === 'swing' ? `${touch ? 'Hold ▲' : 'Hold ↑'} to swing higher · ${jumpKey} to hop off` : '');
    for (const npc of npcs) npc.update(dt, player, npcs.filter((o) => o !== npc));
    updateCamera(dt);
    hud.update(player.x, player.z, player.yaw, npcs);
    return;
  }

  // Up a tree or the rope climber: only turning works until you climb down
  if (climb) {
    const { sit } = updateClimb(dt);
    if (climb) {
      const y = sit ? player.y - HIP_HEIGHT : player.y;
      kid.update(dt, 0, player.x, player.z, player.yaw, y, sit ? y : 0, sit);
      showPrompt(climb.phase === 'top' ? `${climb.spot.type === 'tree' ? '🌳' : '🧗'} ${jumpKey} to climb down` : '');
      for (const npc of npcs) npc.update(dt, player, npcs.filter((o) => o !== npc));
      updateCamera(dt);
      hud.update(player.x, player.z, player.yaw, npcs);
      return;
    }
  }

  // Jump also starts things: a slide, a swing, the bike, climbing
  if (riding) {
    if (input.consumeJump()) dismount();
  } else if (player.grounded && input.jumpQueued && nearestSlide()) {
    input.consumeJump();
    const sl = nearestSlide();
    ride = { kind: 'slide', s: sl, t: 0, len: Math.hypot(sl.x1 - sl.x0, sl.y1 - sl.y0, sl.z1 - sl.z0) };
    faceBack = false;
    return;
  } else if (player.grounded && player.y < 0.05 && input.jumpQueued && nearestSwing()) {
    input.consumeJump();
    ride = { kind: 'swing', s: nearestSwing(), t: 0, amp: 0, phase: 0 };
    ride.s.rider = 'kid';
    faceBack = false;
    return;
  } else if (player.grounded && player.y < 0.05 && input.jumpQueued && nearestBike()) {
    input.consumeJump();
    mount(nearestBike());
  } else if (player.grounded && player.y < 0.05 && input.jumpQueued && nearestClimb()) {
    input.consumeJump();
    startClimb(nearestClimb());
    return;
  }

  let move, speed;
  if (mapControls) {
    // walk once she is (nearly) facing the chosen direction
    const facing = Math.abs(angleDiff(player.yaw, player.targetYaw)) < 0.6;
    move = mapLen > 0.05 && facing ? 1 : 0;
    speed = move * (riding ? BIKE_SPEED : WALK_SPEED) * mapLen;
  } else {
    move = input.move;
    speed = riding
      ? move > 0 ? BIKE_SPEED : move < 0 ? -BIKE_BACK_SPEED : 0
      : move > 0 ? WALK_SPEED : move < 0 ? -BACK_SPEED : 0;
  }
  if (input.run && move > 0) speed *= riding ? 1.4 : RUN_FACTOR;
  const prevX = player.x, prevZ = player.z;
  player.x += Math.sin(player.yaw) * speed * dt;
  player.z += Math.cos(player.yaw) * speed * dt;
  for (const npc of npcs) npc.pushAway(player);
  resolveCollisions(player, house.colliders);
  // Shaped ground: no walking up hillsides that are too steep or steps that are too
  // high (jump instead); bikes stay off hills altogether
  if (riding ? terrainHeightAt(boxes, player.x, player.z) > 0.05 : terrainBlocks(boxes, prevX, prevZ, player.x, player.z, player.y)) {
    player.x = prevX;
    player.z = prevZ;
  }

  // Grass slopes: stand still on one for a moment and you slide down, sitting
  let sliding = false;
  const slope = !riding && player.grounded && move === 0 && player.support?.terrain ? terrainSlope(boxes, player.x, player.z) : null;
  const steep = slope ? Math.hypot(slope.gx, slope.gz) : 0;
  if (steep > 0.2 && steep < 1.0 && (stillOnSlope += dt) > SLIDE_DELAY) {
    slideSpeed = Math.min(SLIDE_MAX, slideSpeed + 5 * dt);
    player.x -= (slope.gx / steep) * slideSpeed * dt;
    player.z -= (slope.gz / steep) * slideSpeed * dt;
    resolveCollisions(player, house.colliders);
    bodyYaw = Math.atan2(-slope.gx, -slope.gz);
    sliding = true;
  } else {
    slideSpeed = 0;
    if (!(steep > 0.2 && steep < 1.0)) stillOnSlope = 0;
  }

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
  if (riding || mapControls) faceBack = false;
  else if (move < 0) faceBack = true;
  else if (move > 0) faceBack = false;
  if (!sliding) {
    const targetBody = player.yaw + (faceBack ? Math.PI : 0);
    bodyYaw += Math.atan2(Math.sin(targetBody - bodyYaw), Math.cos(targetBody - bodyYaw)) * Math.min(1, dt * 10);
  }

  if (riding) {
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    riding.object.position.set(player.x, 0, player.z);
    riding.object.rotation.y = player.yaw;
    for (const wheel of riding.object.userData.wheels ?? []) wheel.rotation.z -= (speed * dt) / 0.24;
    const seatX = player.x + fx * BIKE_SEAT.z, seatZ = player.z + fz * BIKE_SEAT.z;
    kid.update(dt, Math.abs(speed), seatX, seatZ, player.yaw, BIKE_SEAT.y - HIP_HEIGHT, 0, 0, 1);
    showPrompt(`${jumpKey} to get off`);
  } else {
    const groundY = stepVertical(player, boxes, dt, () => input.consumeJump());
    let animSpeed = player.grounded ? (faceBack ? Math.abs(speed) : speed) : 0;
    if (Math.abs(animSpeed) > RUN_ANIM_SPEED) animSpeed = Math.sign(animSpeed) * RUN_ANIM_SPEED;
    if (sliding) kid.update(dt, 0, player.x, player.z, bodyYaw, groundY + 0.08 - HIP_HEIGHT, groundY + 0.08 - HIP_HEIGHT, 1);
    else kid.update(dt, animSpeed, player.x, player.z, bodyYaw, player.y, groundY);
    const onGround = player.grounded && player.y < 0.05;
    const climbSpot = onGround ? nearestClimb() : null;
    showPrompt(
      player.grounded && nearestSlide() ? `🛝 ${jumpKey} to slide`
        : onGround && nearestSwing() ? `${jumpKey} to swing`
          : onGround && nearestBike() ? `🚲 ${jumpKey} to ride`
            : climbSpot ? `${climbSpot.type === 'tree' ? '🌳' : '🧗'} ${jumpKey} to climb` : '');
  }

  for (const npc of npcs) npc.update(dt, player, npcs.filter((o) => o !== npc));
  updateCamera(dt);
  hud.update(player.x, player.z, player.yaw, npcs);
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  env.update(dt, camera, player, mapT);
  renderer.render(scene, camera);
  for (const npc of npcs) npc.placeBubble(camera, innerWidth, innerHeight);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
