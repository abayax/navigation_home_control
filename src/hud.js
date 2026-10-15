import { roomAt, roomRects } from './house.js';

const MINIMAP_CSS_WIDTH = 170;

export class Hud {
  constructor(data, house, { onToggleMap }) {
    this.rooms = data.rooms;
    this.labelEl = document.getElementById('room-label');
    this.current = undefined;

    const { minX, maxX, minZ, maxZ } = house.bounds;
    const pad = 1;
    this.minX = minX - pad;
    this.minZ = minZ - pad;
    const worldW = maxX - minX + pad * 2;
    const worldD = maxZ - minZ + pad * 2;

    const dpr = Math.min(devicePixelRatio, 2);
    const small = innerWidth < 500;
    const maxW = small ? 130 : MINIMAP_CSS_WIDTH;
    const maxH = small ? 150 : 210;
    const cssW = Math.min(maxW, (maxH * worldW) / worldD);
    const cssH = (cssW * worldD) / worldW;
    this.scale = (cssW * dpr) / worldW;

    this.canvas = document.getElementById('minimap');
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.ctx = this.canvas.getContext('2d');
    this.canvas.addEventListener('click', onToggleMap);

    document.getElementById('side-buttons').style.top = `calc(${cssH + 22}px + env(safe-area-inset-top))`;
    document.getElementById('map-btn').addEventListener('click', onToggleMap);

    // Static background: room floors + walls
    this.base = document.createElement('canvas');
    this.base.width = this.canvas.width;
    this.base.height = this.canvas.height;
    const b = this.base.getContext('2d');
    const outdoorFirst = [...data.rooms.filter((r) => r.outdoor), ...data.rooms.filter((r) => !r.outdoor)];
    for (const room of outdoorFirst) {
      b.fillStyle = room.floor;
      for (const [x0, z0, x1, z1] of roomRects(room)) {
        const [ax, ay] = this.toMap(x0, z0);
        const [bx, by] = this.toMap(x1, z1);
        b.fillRect(ax, ay, bx - ax, by - ay);
      }
    }
    const strokeSegs = (segs, color, width) => {
      b.strokeStyle = color;
      b.lineWidth = width * dpr;
      b.lineCap = 'square';
      for (const s of segs) {
        b.beginPath();
        b.moveTo(...this.toMap(s.ax, s.az));
        b.lineTo(...this.toMap(s.bx, s.bz));
        b.stroke();
      }
    };
    strokeSegs(house.fences, '#a0522d', 1);
    strokeSegs(house.walls, '#4a3b8f', 1.6);
    strokeSegs(house.windows, '#7fd3ff', 1.6);

    // Hide keyboard hint after a while
    setTimeout(() => document.getElementById('hint')?.classList.add('hidden'), 8000);
  }

  toMap(x, z) {
    return [(x - this.minX) * this.scale, (z - this.minZ) * this.scale];
  }

  update(x, z, yaw) {
    const room = roomAt(this.rooms, x, z);
    const name = room ? room.name : 'Outside';
    if (name !== this.current) {
      this.current = name;
      this.labelEl.textContent = `📍 ${name}`;
      this.labelEl.classList.remove('pop');
      void this.labelEl.offsetWidth; // restart the animation
      this.labelEl.classList.add('pop');
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base, 0, 0);

    // Player arrow
    const [px, py] = this.toMap(x, z);
    const size = 0.9 * this.scale;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    ctx.fillStyle = '#ff3d3d';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + fx * size * 1.3, py + fz * size * 1.3);
    ctx.lineTo(px - fx * size * 0.7 - fz * size * 0.8, py - fz * size * 0.7 + fx * size * 0.8);
    ctx.lineTo(px - fx * size * 0.7 + fz * size * 0.8, py - fz * size * 0.7 - fx * size * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
