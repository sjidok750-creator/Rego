import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildParts, LION_SPOTS, lionPrims } from './parts.js';
import { merge, place } from './geom.js';
import { voxelize, buildBricks, brickMeshes, PALETTE, PITCH } from './lego.js';
import { makeGranite, makeBrick, makeStud, makeSurveyGround, makeBaseplate } from './materials.js';
import { buildChoreo, smooth } from './choreo.js';
import { createHud } from './hud.js';

const qs = new URLSearchParams(location.search);
const CAPTURE = qs.has('capture');
let mode = qs.get('mode') === 'brick' ? 'brick' : 'stone';
if (CAPTURE) document.documentElement.dataset.capture = '';

const app = document.getElementById('app');
const canvas = document.getElementById('gl');
const hudRoot = document.getElementById('hud');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: CAPTURE, powerPreference: 'high-performance' });
renderer.setPixelRatio(CAPTURE ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 400);
const camTarget = new THREE.Vector3(0, 4, 0);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const hemi = new THREE.HemisphereLight(0xbfd0e0, 0x3a3128, 0.6);
const sun = new THREE.DirectionalLight(0xffe1b8, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(CAPTURE ? 4096 : 2048, CAPTURE ? 4096 : 2048);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 140 });
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.025;
sun.target.position.set(0, 2, 0);
const rim = new THREE.DirectionalLight(0x9fc4ff, 0.8);
rim.position.set(18, 10, -22);
scene.add(hemi, sun, sun.target, rim);

const groundGeo = new THREE.CircleGeometry(400, 160).rotateX(-Math.PI / 2);
const groundStone = new THREE.Mesh(groundGeo, makeSurveyGround());
const groundBrick = new THREE.Mesh(groundGeo, makeBaseplate(PITCH));
groundStone.receiveShadow = groundBrick.receiveShadow = true;
scene.add(groundStone, groundBrick);

// ---------------------------------------------------------------------------
// Members

const parts = buildParts();
const pieces = parts.flatMap((p) => p.pieces);

parts.forEach((part, i) => {
  part.mat = makeGranite({ seed: i * 0.37 });
  for (const pc of part.pieces) {
    pc.part = part;
    const g = merge(pc.prims);
    g.computeBoundingBox();
    pc.center = g.boundingBox.getCenter(new THREE.Vector3());
    pc.minY = g.boundingBox.min.y;
    pc.worldPos = g.attributes.position.array;
    pc.group = new THREE.Group();
    pc.group.position.copy(pc.center);
    const holder = new THREE.Group(); // children stay in assembled world coordinates
    holder.position.copy(pc.center).negate();
    pc.group.add(holder);
    pc.stone = new THREE.Mesh(g, part.mat);
    pc.stone.castShadow = pc.stone.receiveShadow = true;
    const eg = new THREE.EdgesGeometry(g, 30);
    pc.edgeMat = new THREE.LineBasicMaterial({ color: 0xe0a458, transparent: true, opacity: 0, depthWrite: false });
    pc.edges = new THREE.LineSegments(eg, pc.edgeMat);
    holder.add(pc.stone, pc.edges);
    pc.ghostMat = new THREE.LineBasicMaterial({ color: 0x8fb3a4, transparent: true, opacity: 0, depthWrite: false });
    pc.ghost = new THREE.LineSegments(eg, pc.ghostMat);
    pc.ghost.renderOrder = 2;
    scene.add(pc.group, pc.ghost);
  }
});

const ch = buildChoreo(parts);

// Lay-down bays: a thin outline on the ground for every member's slot
for (const part of parts) {
  const b = part.bay;
  const a = b.W / 2 + 0.22, r0 = b.rIn - 0.22, r1 = b.rIn + b.D + 0.22;
  const pts = [[-a, r0], [a, r0], [a, r1], [-a, r1]].map(([t, r]) => new THREE.Vector3().addScaledVector(b.T, t).addScaledVector(b.R, r).setY(0.012));
  part.bayMat = new THREE.LineBasicMaterial({ color: 0x8fb3a4, transparent: true, opacity: 0.1, depthWrite: false });
  part.bayLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), part.bayMat);
  scene.add(part.bayLine);
}

// The three lions lost in the 1920s: dashed outlines at their empty corners
const lionMat = new THREE.LineDashedMaterial({ color: 0xe0a458, dashSize: 0.035, gapSize: 0.025, transparent: true, opacity: 0.3, depthWrite: false });
const lionGhostPos = [];
for (const s of LION_SPOTS.filter((s) => !s.extant)) {
  const g = merge(lionPrims().map((p) => place(p, { x: s.x, y: 1.64, z: s.z, ry: s.ry })));
  const l = new THREE.LineSegments(new THREE.EdgesGeometry(g, 35), lionMat);
  l.computeLineDistances();
  scene.add(l);
  lionGhostPos.push(new THREE.Vector3(s.x, 2.45, s.z));
}

// ---------------------------------------------------------------------------
// Brick edition (built on first use)

let brickStats = null;
function ensureBricks() {
  if (brickStats) return brickStats;
  const t0 = performance.now();
  const occ = voxelize(pieces);
  const studMat = makeStud();
  let total = 0, studs = 0, plates = 0;
  for (const part of parts) {
    part.brickMat = makeBrick();
    part.studMat = studMat.clone();
    const pal = part.name === '적심' ? PALETTE.core : part.name === '돌사자' ? PALETTE.lion : PALETTE.stone;
    part.brick = { bricks: 0, studs: 0 };
    for (const pc of part.pieces) {
      const data = buildBricks(occ, pc, pal, pc.center);
      pc.brickGroup = brickMeshes(data, part.brickMat, part.studMat);
      pc.group.add(pc.brickGroup);
      part.brick.bricks += data.bricks.length;
      part.brick.studs += data.studs.length;
      total += data.bricks.length;
      studs += data.studs.length;
      plates += data.plates;
    }
  }
  brickStats = { total, studs, plates, ms: Math.round(performance.now() - t0) };
  return brickStats;
}

const THEME = {
  stone: {
    exposure: 0.92, env: 0.26, fog: [0x151c22, 45, 170],
    hemi: [0x9fb4c8, 0x3a3128, 0.5], sun: [0xffe0bb, 2.3, [-24, 17, 20]], rim: [0x9fc4ff, 0.75],
    edge: 0xe0a458, ghost: 0x8fb3a4, ghostA: 0.55, bay: 0x8fb3a4, lion: 0xe0a458,
  },
  brick: {
    exposure: 0.9, env: 0.55, fog: [0xdde4e8, 60, 190],
    hemi: [0xf4f8ff, 0x8a7f6a, 0.75], sun: [0xfff1e0, 2.7, [-20, 26, 16]], rim: [0xdde8ff, 0.45],
    edge: 0xf2cd37, ghost: 0x0a6fb6, ghostA: 0.5, bay: 0x0a2f4a, lion: 0xd0281a,
  },
};
let theme = THEME[mode];

function applyMode(m) {
  mode = m;
  theme = THEME[m];
  if (m === 'brick') ensureBricks();
  document.documentElement.dataset.mode = m;
  for (const pc of pieces) {
    pc.stone.visible = m === 'stone';
    if (pc.brickGroup) pc.brickGroup.visible = m === 'brick';
    pc.edgeMat.color.setHex(theme.edge);
    pc.ghostMat.color.setHex(theme.ghost);
  }
  for (const part of parts) part.bayMat.color.setHex(theme.bay);
  lionMat.color.setHex(theme.lion);
  groundStone.visible = m === 'stone';
  groundBrick.visible = m === 'brick';
  renderer.toneMappingExposure = theme.exposure;
  scene.environmentIntensity = theme.env;
  scene.fog = new THREE.Fog(...theme.fog);
  hemi.color.setHex(theme.hemi[0]); hemi.groundColor.setHex(theme.hemi[1]); hemi.intensity = theme.hemi[2];
  sun.color.setHex(theme.sun[0]); sun.intensity = theme.sun[1]; sun.position.set(...theme.sun[2]);
  rim.color.setHex(theme.rim[0]); rim.intensity = theme.rim[1];
  hud.setMode(m, brickStats);
  document.querySelectorAll('[data-mode-btn]').forEach((b) => b.classList.toggle('on', b.dataset.modeBtn === m));
}

// ---------------------------------------------------------------------------

const hud = createHud(hudRoot, ch, { capture: CAPTURE });

let W = 1, H = 1;
function resize() {
  W = app.clientWidth;
  H = app.clientHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  // Hold the 16:9 horizontal field of view on narrow screens (capped).
  const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(17.5)) * (16 / 9));
  camera.fov = camera.aspect >= 16 / 9 ? 35 : Math.min(72, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / camera.aspect)));
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const partCenters = parts.map(() => new THREE.Vector3());
const ember = new THREE.Color();

function frame(t) {
  for (const part of parts) {
    let gl = 0;
    const pc0 = partCenters[part.index].set(0, 0, 0);
    for (const pc of part.pieces) {
      ch.pose(pc, t, pc.group.position, pc.group.quaternion);
      const g = ch.glow(pc, t);
      gl = Math.max(gl, g);
      pc.edgeMat.opacity = g * 0.85;
      pc.edges.visible = g > 0.004;
      const gh = ch.ghost(pc, t);
      pc.ghostMat.opacity = gh * theme.ghostA;
      pc.ghost.visible = gh > 0.004;
      pc0.add(pc.group.position);
    }
    pc0.divideScalar(part.pieces.length);
    const mat = mode === 'brick' ? part.brickMat : part.mat;
    if (mat) {
      mat.emissive.copy(ember.setHex(theme.edge));
      mat.emissiveIntensity = gl * (mode === 'brick' ? 0.18 : 0.22);
    }
    if (mode === 'brick' && part.studMat) {
      part.studMat.emissive.copy(ember);
      part.studMat.emissiveIntensity = gl * 0.18;
    }
    const landed = smooth((t - part.tLand + 0.3) / 0.5);
    const yard = t < ch.E0 ? 1 : 1 - smooth((t - ch.E0) / 1.5);
    part.bayMat.opacity = (0.1 + 0.35 * landed) * yard * (mode === 'brick' ? 0.8 : 1);
    part.bayLine.visible = part.bayMat.opacity > 0.004;
  }
  const lion = parts.find((p) => p.name === '돌사자');
  const lionHot = Math.min(smooth((t - lion.t0 + 1.4) / 0.5), 1 - smooth((t - lion.tLand) / 0.6));
  lionMat.opacity = 0.22 + 0.6 * Math.max(0, lionHot);

  if (autoCam) {
    ch.camera(t, camera.position, camTarget);
    camera.lookAt(camTarget);
  } else controls.update();
  camera.updateMatrixWorld();

  hud.update(t, camera, W, H, partCenters, lionGhostPos);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// Playback

let autoCam = true;
const controls = new OrbitControls(camera, canvas);
controls.enabled = false;
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 4;
controls.maxDistance = 90;

let t = Number(qs.get('t')) || 0;
let playing = !CAPTURE;
let speed = 1;

const icon = {
  play: '<svg viewBox="0 0 12 12"><path d="M2 1l9 5-9 5z"/></svg>',
  pause: '<svg viewBox="0 0 12 12"><path d="M2 1h3v10H2zM7 1h3v10H7z"/></svg>',
  restart: '<svg viewBox="0 0 12 12"><path d="M1 1h2v10H1zM11 1v10L4 6z"/></svg>',
};

if (!CAPTURE) {
  hud.controls.innerHTML = `
    <button id="btn-play" aria-label="일시정지">${icon.pause}</button>
    <button id="btn-restart" aria-label="처음부터">${icon.restart}</button>
    <span class="seg" role="group" aria-label="재생 속도">
      <button data-speed="0.5">0.5×</button><button data-speed="1" class="on">1×</button><button data-speed="2">2×</button>
    </span>
    <span class="seg" role="group" aria-label="모델">
      <button data-mode-btn="stone">정밀 석재</button><button data-mode-btn="brick">브릭</button>
    </span>
    <button id="btn-cam" class="on">자동 카메라</button>`;
  const btnPlay = document.getElementById('btn-play');
  const btnCam = document.getElementById('btn-cam');
  const syncPlay = () => {
    btnPlay.innerHTML = playing ? icon.pause : icon.play;
    btnPlay.setAttribute('aria-label', playing ? '일시정지' : '재생');
  };
  const setAuto = (on) => {
    autoCam = on;
    controls.enabled = !on;
    if (!on) controls.target.copy(camTarget);
    btnCam.classList.toggle('on', on);
    btnCam.textContent = on ? '자동 카메라' : '자유 카메라';
  };
  btnPlay.onclick = () => {
    if (!playing && t >= ch.END) t = 0;
    playing = !playing;
    syncPlay();
  };
  document.getElementById('btn-restart').onclick = () => { t = 0; playing = true; syncPlay(); };
  document.querySelectorAll('[data-speed]').forEach((b) => (b.onclick = () => {
    speed = Number(b.dataset.speed);
    document.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  document.querySelectorAll('[data-mode-btn]').forEach((b) => (b.onclick = () => {
    if (b.dataset.modeBtn === 'brick' && !brickStats) {
      b.textContent = '생성 중…';
      setTimeout(() => { applyMode('brick'); b.textContent = '브릭'; }, 30);
    } else applyMode(b.dataset.modeBtn);
  }));
  btnCam.onclick = () => setAuto(!autoCam);
  canvas.addEventListener('pointerdown', () => { if (autoCam) setAuto(false); });
  canvas.addEventListener('wheel', () => { if (autoCam) setAuto(false); }, { passive: true });

  const seekFrom = (e) => {
    const r = hud.track.getBoundingClientRect();
    t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * ch.END;
  };
  let dragging = false;
  hud.track.addEventListener('pointerdown', (e) => { dragging = true; hud.track.setPointerCapture(e.pointerId); seekFrom(e); });
  hud.track.addEventListener('pointermove', (e) => { if (dragging) seekFrom(e); });
  hud.track.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); btnPlay.click(); }
    if (e.code === 'ArrowRight') t = Math.min(ch.END, t + 2);
    if (e.code === 'ArrowLeft') t = Math.max(0, t - 2);
  });
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { playing = false; t = ch.disEnd + 2; syncPlay(); }
}

applyMode(mode);

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (playing) {
    t += dt * speed;
    if (t >= ch.END) {
      t = ch.END;
      playing = false;
      const b = document.getElementById('btn-play');
      if (b) { b.innerHTML = icon.play; b.setAttribute('aria-label', '재생'); }
    }
  }
  frame(t);
  requestAnimationFrame(loop);
}

// Frame-accurate API for the offline video renderer
window.DABO = {
  duration: ch.END,
  ready: document.fonts.ready.then(() => true),
  seek(time) { frame(time); return true; },
  stats() {
    return {
      mode, duration: ch.END, parts: parts.length, pieces: pieces.length, brick: brickStats,
      timing: { intro: ch.T_INTRO, disEnd: ch.disEnd, explode: ch.E0, collapse: ch.C0, assembled: ch.assembled, end: ch.END },
      // touch-down events for the sound design
      landings: pieces.map((pc) => ({ t: pc.t0 + pc.dur, mass: pc.volume * 2.65, part: pc.part.index })),
      lifts: pieces.map((pc) => ({ t: pc.t0, mass: pc.volume * 2.65, part: pc.part.index })),
      reassembly: parts.map((p) => ({ t: p.pieces[0].tc0 + 2.3, mass: p.mass, part: p.index })),
      phases: ch.phaseStarts,
    };
  },
};

if (CAPTURE) frame(t);
else requestAnimationFrame(loop);
