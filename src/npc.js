import * as THREE from 'three';
import { createPerson, HIP_HEIGHT } from './person.js';
import { SUV_SEATS } from './furniture.js';
import { lineBlocked } from './collision.js';

// People who wander around on their own and talk to the kid: grown-ups (Mom, Dad)
// and other kids. Each NPC repeatedly picks something to do: sit somewhere, stand at
// something, get into the car, play (slide, swing, climb, spin), or wander to a
// random spot. It walks there along a nav-grid path, does it, then picks again.
// Play is a short "script" of steps, e.g. climb up the slide -> slide down -> step off.

const WALK_SPEED = 1.15; // grown-ups
const KID_WALK_SPEED = 1.6;
const KID_RUN_SPEED = 2.8;
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
  swingSet: 1.2, nestSwing: 1.2, fountain: 0.35, chessTable: 1.0, spinner: 0.6, slideMountain: 0.8, ropeClimber: 0.5, playHouse: 0.8, picnicTable: 0.45,
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
  constructor(def, { nav, spots, taken, rooms, walls, scene, hudEl, house }) {
    this.def = def;
    this.name = def.name;
    this.kind = def.kind ?? 'adult';
    this.house = house; // slides, swings, climbs, spinners to play on
    this.spinner = null; // the spinner this NPC is riding (main.js spins it)
    this.color = def.colors?.shirt ?? '#ffffff';
    this.nav = nav;
    this.spots = spots;
    this.taken = taken; // shared Set of spot ids in use
    this.rooms = rooms;
    this.walls = walls;
    const isKid = this.kind === 'kid';
    this.person = createPerson({
      colors: def.colors, scale: def.scale ?? (isKid ? 1 : 1.3), headScale: def.headScale ?? (isKid ? 1 : 0.8),
      hair: def.hair ?? 'short', glasses: !!def.glasses, dress: !!def.dress,
    });
    this.person.group.rotation.order = 'YXZ'; // lean with a swing around its own left-right axis
    scene.add(this.person.group);
    this.walkSpeed = isKid ? KID_WALK_SPEED : WALK_SPEED;
    this.moveSpeed = this.walkSpeed;
    this.groupY = 0;

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
    const isKid = this.kind === 'kid';
    // kids mostly play; grown-ups mostly sit and watch, sometimes play too
    const w = isKid ? { play: 0.7, sit: 0.05, stand: 0, car: 0 } : { play: 0.12, sit: 0.3, stand: 0.2, car: 0.05 };
    let r = Math.random();
    this.moveSpeed = this.walkSpeed;
    if ((r -= w.play) < 0 && this.startPlay()) return;
    const open = (kind) => this.spots.filter((s) => s.kind === kind && !this.taken.has(s.id));
    let spot = null;
    if ((r -= w.sit) < 0) spot = pick(open('sit'));
    else if ((r -= w.stand) < 0) spot = pick(open('stand'));
    else if ((r -= w.car) < 0) spot = pick(open('car'));
    if (spot && this.goTo(spot.approach, spot)) return;
    // Wander: pick a room (so small rooms are as likely as the big yard), then a spot in it.
    // Kids often run there.
    if (isKid && Math.random() < 0.5) this.moveSpeed = KID_RUN_SPEED;
    for (let tries = 0; tries < 6; tries++) {
      const p = this.nav.randomPoint(pick(this.rooms));
      if (p && this.goTo(p, null)) return;
    }
    this.state = 'idle';
    this.timer = rand(1, 3);
  }

  goTo(target, spot, plan = null) {
    const path = this.nav.findPath(this.x, this.z, target.x, target.z);
    if (!path) return false;
    this.path = path;
    this.spot = spot;
    this.plan = plan;
    if (spot) this.taken.add(spot.id);
    this.state = 'walk';
    this.waited = 0;
    return true;
  }

  // ---------- play: slides, swings, climbing, spinners ----------

  /** Pick something to play on that's free, plan the moves, and walk there. */
  startPlay() {
    const h = this.house;
    if (!h) return false;
    const isKid = this.kind === 'kid';
    const free = h.climbs.filter((c) => (c.riders ?? 0) < (c.spinner ? 3 : 1));
    const climbs = free.filter((c) => !c.spinner && (isKid || c.type !== 'tree')); // grown-ups don't climb trees
    const kinds = [
      ['slide', 0.3, h.slides.filter((sl) => !sl.rider)],
      ['swing', 0.25, h.swings.filter((sw) => !sw.rider)],
      ['climb', isKid ? 0.2 : 0.05, climbs],
      ['spin', 0.15, h.spinners],
      ['hang', 0.1, free.filter((c) => c.spinner)], // hang on the outside of a spinner
    ].filter(([, , list]) => list.length);
    for (let tries = 0; tries < 4 && kinds.length; tries++) {
      let r = Math.random() * kinds.reduce((t, [, wt]) => t + wt, 0);
      const [kind, , list] = kinds.find(([, wt]) => (r -= wt) < 0) ?? kinds[0];
      // climbing: the rope climber half the time (otherwise trees would win by numbers)
      const special = list.filter((c) => c.type && c.type !== 'tree');
      const target = kind === 'climb' && special.length && Math.random() < 0.5 ? pick(special) : pick(list);
      const plan = this[`plan_${kind === 'hang' ? 'climb' : kind}`](target);
      if (plan && this.goTo(plan.approach, null, plan)) {
        plan.reserve?.();
        return true;
      }
    }
    return false;
  }

  freeNear(cx, cz, dist) {
    // a walkable point `dist` from (cx, cz), trying several directions
    const a0 = Math.random() * Math.PI * 2;
    for (let k = 0; k < 8; k++) {
      const a = a0 + (k * Math.PI) / 4;
      const p = { x: cx + Math.sin(a) * dist, z: cz + Math.cos(a) * dist };
      if (this.nav.isFree(p.x, p.z)) return p;
    }
    return null;
  }

  plan_slide(sl) {
    const len = Math.hypot(sl.x1 - sl.x0, sl.z1 - sl.z0) || 1;
    const ux = (sl.x1 - sl.x0) / len, uz = (sl.z1 - sl.z0) / len;
    const approach = { x: sl.x1 + ux * 0.9, z: sl.z1 + uz * 0.9 };
    if (!this.nav.isFree(approach.x, approach.z)) return null;
    const down = Math.atan2(ux, uz), up = down + Math.PI;
    const top = { x: sl.x0, z: sl.z0 }, bottom = { x: sl.x1, z: sl.z1 };
    return {
      approach,
      reserve: () => (sl.rider = this),
      onEnd: () => (sl.rider = null),
      script: [
        { kind: 'move', from: { ...approach, y: 0 }, to: { ...bottom, y: sl.y1 }, dur: 0.4, pose: 'stand', yaw: up },
        { kind: 'move', from: { ...bottom, y: sl.y1 }, to: { ...top, y: sl.y0 }, dur: 2.2, pose: 'hang', yaw: up }, // climb up it
        { kind: 'move', from: { ...top, y: sl.y0 + 0.06 }, to: { ...bottom, y: sl.y1 + 0.06 }, dur: Math.hypot(len, sl.y0 - sl.y1) / 3.4, pose: 'sit', yaw: down },
        { kind: 'move', from: { ...bottom, y: 0 }, to: { ...approach, y: 0 }, dur: 0.35, pose: 'stand', yaw: down },
      ],
    };
  }

  plan_swing(sw) {
    const fx = Math.sin(sw.yaw), fz = Math.cos(sw.yaw);
    const approach = { x: sw.x + fx * 0.75, z: sw.z + fz * 0.75 };
    if (!this.nav.isFree(approach.x, approach.z)) return null;
    const seat = { x: sw.x, z: sw.z, y: sw.top - sw.length + 0.04 };
    return {
      approach,
      reserve: () => (sw.rider = this),
      onEnd: () => {
        sw.rider = null;
        sw.pivot.rotation.x = 0;
        this.person.group.rotation.x = 0;
      },
      script: [
        { kind: 'move', from: { ...approach, y: 0.45 }, to: seat, dur: 0.6, pose: 'sit', yaw: sw.yaw },
        { kind: 'swing', sw, dur: rand(8, 18), amp: this.kind === 'kid' ? rand(0.5, 1.1) : rand(0.25, 0.45) },
        { kind: 'move', from: seat, to: { ...approach, y: 0.45 }, dur: 0.5, pose: 'sit', yaw: sw.yaw },
      ],
    };
  }

  plan_climb(c) {
    const approach = this.freeNear(c.x, c.z, Math.max(c.minDist + 0.3, c.reach - 0.3));
    if (!approach) return null;
    const dx = approach.x - c.x, dz = approach.z - c.z, d = Math.hypot(dx, dz) || 1;
    const top = { x: c.x + (dx / d) * c.offset, z: c.z + (dz / d) * c.offset, y: c.y };
    const face = Math.atan2(-dx, -dz);
    const stay = c.spinner
      ? { kind: 'spin', sp: c.spinner, r: c.offset, y: c.y, pose: 'hang', dur: rand(6, 12), angle: Math.atan2(dx, dz) }
      : { kind: 'hold', pos: top, pose: 'sit', dur: rand(5, 12) };
    return {
      approach,
      reserve: () => (c.riders = (c.riders ?? 0) + 1),
      onEnd: () => (c.riders = Math.max(0, (c.riders ?? 1) - 1)),
      script: [
        { kind: 'move', from: { ...approach, y: 0 }, to: top, dur: 1.2, pose: 'hang', yaw: face },
        stay,
        { kind: 'move', from: top, to: { ...approach, y: 0 }, dur: 1.0, pose: 'hang', yaw: face, fromCurrent: true },
      ],
    };
  }

  plan_spin(sp) {
    const r = (sp.box.maxX - sp.box.minX) / 1.4; // the spinner's radius (its base is 1.4 r wide)
    const approach = this.freeNear(sp.x, sp.z, r + 0.7);
    if (!approach) return null;
    const a = Math.atan2(approach.x - sp.x, approach.z - sp.z);
    const inner = { x: sp.x + Math.sin(a) * r * 0.45, z: sp.z + Math.cos(a) * r * 0.45, y: 0.28 };
    return {
      approach,
      script: [
        { kind: 'move', from: { ...approach, y: 0 }, to: inner, dur: 0.6, pose: 'stand' },
        { kind: 'spin', sp, r: r * 0.45, y: 0.28, pose: 'stand', dur: rand(6, 12), angle: a },
        { kind: 'move', from: inner, to: { ...approach, y: 0 }, dur: 0.6, pose: 'stand', fromCurrent: true },
      ],
    };
  }

  /** Plays the current script step; returns the pose for this frame. */
  runScript(dt) {
    const seg = this.plan.script[this.segIndex];
    if (this.segT === 0 && seg.fromCurrent) seg.from = { x: this.x, z: this.z, y: this.scriptY ?? 0 };
    this.segT += dt;
    let y = 0;
    switch (seg.kind) {
      case 'move': {
        const k = Math.min(1, this.segT / seg.dur);
        this.x = seg.from.x + (seg.to.x - seg.from.x) * k;
        this.z = seg.from.z + (seg.to.z - seg.from.z) * k;
        y = seg.from.y + (seg.to.y - seg.from.y) * k;
        if (seg.yaw !== undefined) this.turnTo(seg.yaw, dt * 2);
        break;
      }
      case 'hold':
        this.x = seg.pos.x;
        this.z = seg.pos.z;
        y = seg.pos.y;
        break;
      case 'spin': {
        this.spinner = seg.sp;
        const a = (seg.sp.speed ?? 0) * dt;
        seg.angle += a;
        this.x = seg.sp.x + Math.sin(seg.angle) * seg.r;
        this.z = seg.sp.z + Math.cos(seg.angle) * seg.r;
        y = seg.y;
        if (seg.pose === 'hang') this.yaw = Math.atan2(seg.sp.x - this.x, seg.sp.z - this.z);
        else this.yaw += a;
        break;
      }
      case 'swing': {
        const sw = seg.sw;
        seg.phase = (seg.phase ?? 0) + (2.4 + seg.amp * 0.8) * dt;
        const a = Math.min(seg.amp, this.segT * 0.2) * Math.sin(seg.phase);
        sw.pivot.rotation.x = -a;
        const fx = Math.sin(sw.yaw), fz = Math.cos(sw.yaw);
        this.x = sw.x + fx * sw.length * Math.sin(a);
        this.z = sw.z + fz * sw.length * Math.sin(a);
        y = sw.top - sw.length * Math.cos(a) + 0.04;
        this.yaw = sw.yaw;
        this.person.group.rotation.x = -a;
        break;
      }
    }
    this.scriptY = y;
    const pose = seg.pose ?? 'sit';
    if (this.segT >= seg.dur) {
      if (seg.kind === 'spin') this.spinner = null;
      this.segIndex++;
      this.segT = 0;
      if (this.segIndex >= this.plan.script.length) {
        this.plan.onEnd?.();
        this.plan = null;
        this.state = 'idle';
        this.timer = rand(0.5, 2.5);
      }
    }
    return { pose, y, moving: seg.kind === 'move' && pose === 'stand' };
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

        const step = Math.min(d, this.moveSpeed * dt);
        this.x += ux * step;
        this.z += uz * step;
        this.speed = this.moveSpeed;
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

    if (this.state === 'script') {
      const { pose, y, moving } = this.runScript(dt);
      const hip = HIP_HEIGHT * this.person.scale;
      if (pose === 'sit') {
        this.groupY = y - hip; // y is the hips' height
        this.person.update(dt, 0, this.x, this.z, this.yaw, this.groupY, this.groupY, 1);
      } else if (pose === 'hang') {
        this.groupY = y; // feet off the ground -> arms-up pose
        this.person.update(dt, 0, this.x, this.z, this.yaw, y, 0, 0);
      } else {
        this.groupY = y;
        this.person.update(dt, moving ? this.walkSpeed : 0, this.x, this.z, this.yaw, y, y, 0);
      }
      return;
    }

    // Sitting: hips at seat height
    const seatY = this.spot && this.sit > 0 ? this.spot.seat.y : 0;
    const groupY = this.sit > 0 ? (seatY - HIP_HEIGHT * this.person.scale) * this.sit : 0;
    this.groupY = groupY;
    this.person.update(dt, Math.min(this.speed, KID_WALK_SPEED * 1.2), this.x, this.z, this.yaw, groupY, groupY, this.sit);
  }

  arrive() {
    if (this.plan) {
      this.state = 'script';
      this.segIndex = 0;
      this.segT = 0;
    } else if (!this.spot) {
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
    const headTop = this.person.height + this.groupY;
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
    if (this.inCar || this.state === 'script' || this.sit > 0) return;
    const dx = p.x - this.x, dz = p.z - this.z;
    const d = Math.hypot(dx, dz), min = BODY_RADIUS + p.radius;
    if (d >= min) return;
    const ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0;
    p.x = this.x + ux * min;
    p.z = this.z + uz * min;
  }
}
