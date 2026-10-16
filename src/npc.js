import * as THREE from 'three';
import { createPerson, HIP_HEIGHT } from './person.js';
import { SUV_SEATS } from './furniture.js';
import { lineBlocked } from './collision.js';

// Family members who wander around on their own and talk to the kid.
// Each NPC repeatedly picks something to do: sit somewhere, stand at something,
// get into the car, or wander to a random spot. It walks there along a nav-grid
// path, stays a while, then picks again.

const WALK_SPEED = 1.15;
const TURN_RATE = 6; // rad/s
const SIT_TIME = 0.6; // seconds to sit down / stand up
const TALK_DISTANCE = 2.2;
const TALK_FORGET = 3.2; // kid must go this far away before the next "hello"
const PHRASE_SECONDS = 7; // new phrase while the kid stays close
const BODY_RADIUS = 0.3; // for pushing the kid away
const SIT_TYPES = new Set(['chair', 'sofa', 'bed', 'bench']);
const STAND_TYPES = {
  counter: 0.35, fridge: 0.4, sink: 0.35, bookshelf: 0.45, desk: 0.45, piano: 0.45, tv: 1.6,
  // playground: grown-ups watching
  swingSet: 1.2, nestSwing: 1.2, fountain: 0.35, spinner: 0.6, slideMountain: 0.8, ropeClimber: 0.5, playHouse: 0.8, picnicTable: 0.45,
};

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const local = (box, lx, lz) => {
  // furniture-local (x, z) -> world, for a box rotated by box.rot
  const c = Math.cos(box.rot), s = Math.sin(box.rot);
  const cx = (box.minX + box.maxX) / 2, cz = (box.minZ + box.maxZ) / 2;
  return { x: cx + lx * c + lz * s, z: cz - lx * s + lz * c };
};

/** Load NPC definitions and phrase lists (never cached, so pushed edits show up). */
export async function loadNpcDefs(base = 'npcs/') {
  const res = await fetch(`${base}npcs.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${base}npcs.json: ${res.status}`);
  const { npcs } = await res.json();
  return Promise.all(npcs.map(async (def) => {
    let phrases = [];
    try {
      const text = await (await fetch(base + def.phrases, { cache: 'no-store' })).text();
      phrases = parsePhrases(text);
    } catch (e) {
      console.warn(`Could not load phrases for ${def.name}:`, e);
    }
    return { ...def, phrases: phrases.length ? phrases : ['Hi!'] };
  }));
}

export function parsePhrases(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

/** Places where NPCs can sit or stand, derived from the layout's furniture. */
export function findSpots(house, nav) {
  const spots = [];
  for (const box of house.items) {
    const { item } = box;
    const swap = Math.abs(Math.sin(box.rot)) > 0.5;
    const halfW = (swap ? box.maxZ - box.minZ : box.maxX - box.minX) / 2; // local x half-size
    const halfD = (swap ? box.maxX - box.minX : box.maxZ - box.minZ) / 2; // local z half-size
    const sides = [[0, halfD + 0.35, 0], [halfW + 0.35, 0, Math.PI / 2], [-halfW - 0.35, 0, -Math.PI / 2], [0, -halfD - 0.35, Math.PI]];
    const freeSides = sides.filter(([lx, lz]) => { const p = local(box, lx, lz); return nav.isFree(p.x, p.z); });
    const id = `${item.type}@${item.at}`;

    if (item.type === 'suv') {
      SUV_SEATS.forEach((seat, i) => {
        const door = local(box, seat.door.x, seat.door.z);
        if (!nav.isFree(door.x, door.z)) return;
        const p = local(box, seat.x, seat.z);
        spots.push({ id: `${id}#${i}`, kind: 'car', approach: door, seat: { ...p, y: 0.5, yaw: box.rot } });
      });
    } else if (SIT_TYPES.has(item.type) || (item.type === 'box' && box.top <= 0.6 && halfW <= 0.6 && halfD <= 0.6)) {
      if (!freeSides.length) continue;
      const [lx, lz, sideYaw] = freeSides[0];
      const approach = local(box, lx, lz);
      if (item.type === 'sofa') {
        for (const off of [-halfW / 2, halfW / 2]) {
          const front = local(box, off, halfD + 0.35);
          if (!nav.isFree(front.x, front.z)) continue;
          const p = local(box, off, 0.08);
          spots.push({ id: `${id}#${off}`, kind: 'sit', approach: front, seat: { ...p, y: box.top, yaw: box.rot } });
        }
      } else if (item.type === 'bed') {
        // sit on the edge of the bed on the free side, facing out
        const p = local(box, Math.sign(lx) * Math.max(0, halfW - 0.3), Math.sign(lz) * Math.max(0, halfD - 0.3));
        spots.push({ id, kind: 'sit', approach, seat: { ...p, y: box.top, yaw: box.rot + sideYaw } });
      } else {
        const p = local(box, 0, 0);
        const yaw = item.type === 'chair' ? box.rot : box.rot + sideYaw;
        spots.push({ id, kind: 'sit', approach, seat: { ...p, y: box.top, yaw } });
      }
    } else if (item.type in STAND_TYPES) {
      const gap = STAND_TYPES[item.type];
      const front = local(box, 0, halfD + gap);
      if (!nav.isFree(front.x, front.z)) continue;
      spots.push({ id, kind: 'stand', approach: front, seat: { ...front, y: 0, yaw: box.rot + Math.PI } });
    }
  }
  return spots;
}

export class Npc {
  constructor(def, { nav, spots, taken, rooms, walls, scene, hudEl }) {
    this.def = def;
    this.name = def.name;
    this.color = def.colors?.shirt ?? '#ffffff';
    this.nav = nav;
    this.spots = spots;
    this.taken = taken; // shared Set of spot ids in use
    this.rooms = rooms;
    this.walls = walls;
    this.person = createPerson({
      colors: def.colors, scale: def.scale ?? 1.3, headScale: def.headScale ?? 0.8,
      hair: def.hair ?? 'short', glasses: !!def.glasses,
    });
    scene.add(this.person.group);

    const start = nav.randomPoint(pick(rooms)) ?? nav.randomPoint();
    this.x = start.x;
    this.z = start.z;
    this.y = 0;
    this.yaw = rand(-Math.PI, Math.PI);
    this.sit = 0;
    this.speed = 0;
    this.state = 'idle';
    this.timer = rand(0.5, 3);
    this.path = [];
    this.spot = null;
    this.waited = 0;

    // Speech bubble (HTML, positioned over the head every frame)
    this.bubble = document.createElement('div');
    this.bubble.className = 'bubble';
    this.bubble.innerHTML = '<span class="name"></span><span class="text"></span>';
    this.bubble.querySelector('.name').textContent = def.name;
    this.bubbleText = this.bubble.querySelector('.text');
    hudEl.appendChild(this.bubble);
    this.talking = false;
    this.phraseTimer = 0;
    this.lastPhrase = null;
  }

  get inCar() {
    return this.spot?.kind === 'car' && this.sit > 0;
  }

  // ---------- decisions ----------

  chooseNext() {
    const r = Math.random();
    const open = (kind) => this.spots.filter((s) => s.kind === kind && !this.taken.has(s.id));
    let spot = null;
    if (r < 0.3) spot = pick(open('sit'));
    else if (r < 0.5) spot = pick(open('stand'));
    else if (r < 0.55) spot = pick(open('car'));
    if (spot && this.goTo(spot.approach, spot)) return;
    // Wander: pick a room (so small rooms are as likely as the big yard), then a spot in it
    for (let tries = 0; tries < 6; tries++) {
      const p = this.nav.randomPoint(pick(this.rooms));
      if (p && this.goTo(p, null)) return;
    }
    this.state = 'idle';
    this.timer = rand(1, 3);
  }

  goTo(target, spot) {
    const path = this.nav.findPath(this.x, this.z, target.x, target.z);
    if (!path) return false;
    this.path = path;
    this.spot = spot;
    if (spot) this.taken.add(spot.id);
    this.state = 'walk';
    this.waited = 0;
    return true;
  }

  release() {
    if (this.spot) this.taken.delete(this.spot.id);
    this.spot = null;
  }

  // ---------- per frame ----------

  update(dt, kid, others) {
    this.updateTalk(dt, kid);
    this.speed = 0;

    switch (this.state) {
      case 'idle':
        if (this.talking) this.faceToward(kid.x, kid.z, dt);
        if ((this.timer -= dt) <= 0) this.chooseNext();
        break;

      case 'walk': {
        if (this.talking) {
          this.faceToward(kid.x, kid.z, dt);
          break;
        }
        const next = this.path[0];
        if (!next) {
          this.arrive();
          break;
        }
        const dx = next.x - this.x, dz = next.z - this.z;
        const d = Math.hypot(dx, dz);
        const ux = dx / (d || 1), uz = dz / (d || 1);
        // Wait politely if the kid or the other NPC is right in front (but not forever)
        const blocked = [kid, ...others.filter((o) => !o.inCar)].some((o) => {
          const ox = o.x - this.x, oz = o.z - this.z;
          const od = Math.hypot(ox, oz);
          return od < 0.8 && (ox * ux + oz * uz) / (od || 1) > 0.6;
        });
        // (after 1.5 s of waiting, squeeze past for 1.5 s, then wait again)
        if (blocked) {
          this.waited += dt;
          if (this.waited > 3) this.waited = 0;
          if (this.waited < 1.5) break;
        } else {
          this.waited = 0;
        }

        const step = Math.min(d, WALK_SPEED * dt);
        this.x += ux * step;
        this.z += uz * step;
        this.speed = WALK_SPEED;
        this.turnTo(Math.atan2(ux, uz), dt);
        if (d - step < 0.03) this.path.shift();
        break;
      }

      case 'sitDown':
      case 'standUp': {
        const down = this.state === 'sitDown';
        this.t = Math.min(1, this.t + dt / SIT_TIME);
        const k = down ? this.t : 1 - this.t;
        const { approach, seat } = this.spot;
        this.x = approach.x + (seat.x - approach.x) * k;
        this.z = approach.z + (seat.z - approach.z) * k;
        this.sit = k;
        this.turnTo(seat.yaw, dt * 2);
        if (this.t >= 1) {
          if (down) {
            this.state = 'stay';
            this.timer = this.spot.kind === 'car' ? rand(10, 25) : rand(8, 25);
          } else {
            this.release();
            this.chooseNext();
          }
        }
        break;
      }

      case 'stay':
        if (this.spot?.kind === 'stand' && !this.talking) this.turnTo(this.spot.seat.yaw, dt);
        if (this.talking && this.sit === 0) this.faceToward(kid.x, kid.z, dt);
        if ((this.timer -= dt) <= 0) {
          if (this.sit > 0) {
            this.state = 'standUp';
            this.t = 0;
          } else {
            this.release();
            this.chooseNext();
          }
        }
        break;
    }

    // Sitting: hips at seat height
    const seatY = this.spot && this.sit > 0 ? this.spot.seat.y : 0;
    const groupY = this.sit > 0 ? (seatY - HIP_HEIGHT * this.person.scale) * this.sit : 0;
    this.person.update(dt, this.speed, this.x, this.z, this.yaw, groupY, groupY, this.sit);
  }

  arrive() {
    if (!this.spot) {
      this.state = 'idle';
      this.timer = rand(2, 6);
    } else if (this.spot.kind === 'stand') {
      this.state = 'stay';
      this.timer = rand(4, 12);
    } else {
      this.state = 'sitDown';
      this.t = 0;
    }
  }

  turnTo(target, dt) {
    const diff = angleDiff(this.yaw, target);
    this.yaw += Math.sign(diff) * Math.min(Math.abs(diff), TURN_RATE * dt);
  }

  faceToward(x, z, dt) {
    if (this.sit > 0) return;
    this.turnTo(Math.atan2(x - this.x, z - this.z), dt);
  }

  // ---------- talking ----------

  updateTalk(dt, kid) {
    const d = Math.hypot(kid.x - this.x, kid.z - this.z);
    const canSee = !lineBlocked(kid.x, kid.z, this.x, this.z, this.walls);
    if (!this.talking && d < TALK_DISTANCE && canSee) {
      this.talking = true;
      this.say();
    } else if (this.talking && (d > TALK_FORGET || !canSee)) {
      this.talking = false;
      this.bubble.classList.remove('show');
    } else if (this.talking && (this.phraseTimer -= dt) <= 0) {
      this.say();
    }
  }

  say() {
    const options = this.def.phrases.length > 1 ? this.def.phrases.filter((p) => p !== this.lastPhrase) : this.def.phrases;
    this.lastPhrase = pick(options);
    this.bubbleText.textContent = this.lastPhrase;
    this.bubble.classList.add('show');
    this.phraseTimer = PHRASE_SECONDS;
  }

  /** Position the HTML bubble above the head. */
  placeBubble(camera, width, height) {
    if (!this.talking) return;
    const headTop = this.person.height + (this.sit > 0 ? this.spot.seat.y - HIP_HEIGHT * this.person.scale : 0);
    const v = new THREE.Vector3(this.x, headTop + 0.25, this.z).project(camera);
    if (v.z > 1) {
      this.bubble.style.visibility = 'hidden';
      return;
    }
    this.bubble.style.visibility = 'visible';
    const sx = (v.x * 0.5 + 0.5) * width, sy = (-v.y * 0.5 + 0.5) * height;
    this.bubble.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
  }

  /** Keep the kid from walking through this NPC. */
  pushAway(p) {
    if (this.inCar) return;
    const dx = p.x - this.x, dz = p.z - this.z;
    const d = Math.hypot(dx, dz), min = BODY_RADIUS + p.radius;
    if (d >= min) return;
    const ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0;
    p.x = this.x + ux * min;
    p.z = this.z + uz * min;
  }
}
