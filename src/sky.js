import * as THREE from 'three';

// Day / night: sky colour, lights, sun + clouds by day, moon + stars by night.
// Switching fades smoothly. The sky dome items follow the camera so they always
// look infinitely far away.

const FADE_SECONDS = 1.5;
const SKY_RADIUS = 140;

const DAY = {
  sky: new THREE.Color('#bfe6ff'),
  hemiSky: new THREE.Color('#ffffff'), hemiGround: new THREE.Color('#b8d8a0'), hemi: 2.2,
  sunColor: new THREE.Color('#fff4e0'), sun: 1.6,
  lamps: 0, // warm indoor-lamp fill light
  glow: 0, // light around the kid
};
const NIGHT = {
  sky: new THREE.Color('#0b1533'),
  hemiSky: new THREE.Color('#8fa6ff'), hemiGround: new THREE.Color('#1c2440'), hemi: 0.55,
  sunColor: new THREE.Color('#9fb4ff'), sun: 0.45, // moonlight
  lamps: 0.45,
  glow: 3,
};

const skyMat = (color, opts = {}) => new THREE.MeshBasicMaterial({ color, fog: false, transparent: true, depthWrite: false, ...opts });

export class Environment {
  constructor(scene, { hemi, sun, kid }) {
    this.scene = scene;
    this.hemi = hemi;
    this.sun = sun;
    this.kid = kid;
    this.night = localStorage.getItem('home-explorer:night') === '1';
    this.t = this.night ? 1 : 0; // 0 = day, 1 = night

    this.lamps = new THREE.AmbientLight('#ffcf8a', 0);
    this.glow = new THREE.PointLight('#ffe2a8', 0, 7, 1.2);
    scene.add(this.lamps, this.glow);

    // Things painted on the sky, centred on the camera every frame
    this.dome = new THREE.Group();
    scene.add(this.dome);

    // Sun: a bright disc with a soft halo, low in the south-west sky (the follow
    // camera only sees ~18° above the horizon, so sky things sit low)
    const sunDir = new THREE.Vector3(-0.6, 0.2, 0.75).normalize().multiplyScalar(SKY_RADIUS);
    this.sunDisc = new THREE.Group();
    this.sunDisc.position.copy(sunDir);
    this.sunDisc.add(new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), skyMat('#fff7b0')));
    this.sunDisc.add(new THREE.Mesh(new THREE.SphereGeometry(11, 24, 16), skyMat('#fff2a0', { opacity: 0.35 })));

    // Moon: pale disc with a few craters and a glow, in the north-east sky
    const moonDir = new THREE.Vector3(0.55, 0.26, -0.75).normalize().multiplyScalar(SKY_RADIUS);
    this.moon = new THREE.Group();
    this.moon.position.copy(moonDir);
    this.moon.add(new THREE.Mesh(new THREE.SphereGeometry(6, 24, 16), skyMat('#fdf6d8')));
    for (const [x, y, r] of [[-1.8, 1.2, 1.2], [1.6, -0.8, 0.9], [0.4, 2.4, 0.6], [-0.6, -2.2, 0.7]]) {
      const crater = new THREE.Mesh(new THREE.CircleGeometry(r, 16), skyMat('#e6dcb8'));
      crater.position.set(x, y, 0);
      this.moon.add(crater);
    }
    this.moon.add(new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), skyMat('#c9d6ff', { opacity: 0.18 })));
    this.moon.lookAt(0, 0, 0);
    this.moon.children.slice(1, 5).forEach((c) => (c.position.z = 6.01)); // craters on the near face

    // Stars: random points on the upper half of the sky
    const count = 900;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = Math.random() * Math.PI * 2, v = Math.random() * 0.95 + 0.05; // above the horizon
      const r = Math.sqrt(1 - v * v);
      pos.set([Math.cos(u) * r * SKY_RADIUS, v * SKY_RADIUS, Math.sin(u) * r * SKY_RADIUS], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: '#ffffff', size: 2, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false,
    }));

    this.dome.add(this.sunDisc, this.moon, this.stars);

    // Clouds: puffy clusters drifting slowly over the neighbourhood (world-fixed)
    this.clouds = new THREE.Group();
    const cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', fog: false, transparent: true, emissive: '#ffffff', emissiveIntensity: 0.35 });
    this.cloudMat = cloudMat;
    for (let i = 0; i < 14; i++) {
      const cloud = new THREE.Group();
      const puffs = 3 + Math.floor(Math.random() * 3);
      for (let p = 0; p < puffs; p++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(3 + Math.random() * 2.5, 14, 10), cloudMat);
        puff.position.set(p * 3.6 - puffs * 1.8, Math.random() * 1.5, Math.random() * 2.5 - 1.25);
        puff.scale.y = 0.65;
        cloud.add(puff);
      }
      cloud.position.set(Math.random() * 240 - 120, 22 + Math.random() * 10, Math.random() * 240 - 120);
      cloud.userData.speed = 0.6 + Math.random() * 0.8;
      this.clouds.add(cloud);
    }
    scene.add(this.clouds);

    this.button = document.getElementById('daynight-btn');
    this.button.addEventListener('click', () => this.toggle());
    this.apply();
  }

  toggle() {
    this.night = !this.night;
    localStorage.setItem('home-explorer:night', this.night ? '1' : '0');
  }

  // mapT: 0..1 how far into the map view we are (clouds fade out so they don't block it)
  update(dt, camera, player, mapT = 0) {
    const target = this.night ? 1 : 0;
    if (this.t !== target) {
      const step = dt / FADE_SECONDS;
      this.t = Math.abs(target - this.t) <= step ? target : this.t + Math.sign(target - this.t) * step;
      this.apply();
    }
    this.dome.position.copy(camera.position);
    this.glow.position.set(player.x, player.y + 1.6, player.z);
    this.cloudMat.opacity = 0.95 * (1 - this.t) * (1 - mapT);
    this.clouds.visible = this.cloudMat.opacity > 0.01;
    for (const cloud of this.clouds.children) {
      cloud.position.x += cloud.userData.speed * dt;
      if (cloud.position.x > 130) cloud.position.x -= 260;
    }
  }

  apply() {
    const k = this.t;
    const mix = (a, b) => a + (b - a) * k;
    const sky = DAY.sky.clone().lerp(NIGHT.sky, k);
    this.scene.background = sky;
    this.scene.fog.color.copy(sky);
    this.hemi.color.copy(DAY.hemiSky).lerp(NIGHT.hemiSky, k);
    this.hemi.groundColor.copy(DAY.hemiGround).lerp(NIGHT.hemiGround, k);
    this.hemi.intensity = mix(DAY.hemi, NIGHT.hemi);
    this.sun.color.copy(DAY.sunColor).lerp(NIGHT.sunColor, k);
    this.sun.intensity = mix(DAY.sun, NIGHT.sun);
    this.lamps.intensity = mix(DAY.lamps, NIGHT.lamps);
    this.glow.intensity = mix(DAY.glow, NIGHT.glow);

    const dayAmount = 1 - k;
    this.sunDisc.children.forEach((m, i) => (m.material.opacity = dayAmount * (i === 0 ? 1 : 0.35)));
    this.sunDisc.visible = dayAmount > 0.01;
    this.moon.children.forEach((m, i) => (m.material.opacity = k * (i === this.moon.children.length - 1 ? 0.18 : 1)));
    this.moon.visible = k > 0.01;
    this.stars.material.opacity = k;
    this.stars.visible = k > 0.01;
    this.button.textContent = this.night ? '☀️' : '🌙';
    this.button.setAttribute('aria-label', this.night ? 'Switch to day' : 'Switch to night');
  }
}
