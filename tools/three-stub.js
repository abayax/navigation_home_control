// Minimal stand-in for three.js so house.js / furniture.js can run under Node
// for validation (geometry is ignored; only the 2D layout logic matters).
const vec = () => ({ x: 0, y: 0, z: 0, set() { return this; } });

export class Object3D {
  constructor() {
    this.position = vec();
    this.rotation = vec();
    this.scale = vec();
    this.children = [];
  }
  add(...c) {
    this.children.push(...c);
    return this;
  }
}
export class Group extends Object3D {}
export class Mesh extends Object3D {}
export class Sprite extends Object3D {}

class Geometry {
  constructor() {
    this.attributes = { uv: { count: 0, getX: () => 0, getY: () => 0, setXY() {} } };
  }
  rotateX() {
    return this;
  }
}
export class BoxGeometry extends Geometry {}
export class PlaneGeometry extends Geometry {}
export class CylinderGeometry extends Geometry {}
export class SphereGeometry extends Geometry {}
export class CapsuleGeometry extends Geometry {}
export class CircleGeometry extends Geometry {}
export class TorusGeometry extends Geometry {}

export class MeshLambertMaterial {}
export class MeshBasicMaterial {}
export class SpriteMaterial {}
export class CanvasTexture {
  constructor() {
    this.repeat = vec();
  }
}
export class Color {
  offsetHSL() { return this; }
  clone() { return this; }
  getStyle() { return '#ffffff'; }
}
export const SRGBColorSpace = 'srgb';
export const RepeatWrapping = 1000;
