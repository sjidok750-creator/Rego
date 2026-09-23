// Brick edition: voxelize every stone member onto a LEGO-proportioned lattice
// and rebuild it from standard bricks and plates.
//
//   1 stud  = 0.08 m of real stone — an 8 mm stud at exactly 1:10 scale
//   1 plate = 0.032 m (plate : stud = 3.2 mm : 8 mm, as in the real system)
//   1 brick = 3 plates
// At 1:10 the finished brick model would stand 1.03 m tall.
//
// Voxelization is exact for closed meshes: one vertical ray per stud column,
// intersections sorted, inside = between pairs (ray parity), per primitive.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const SCALE = 10;
export const PITCH = 0.08;
export const PLATE = 0.032;
const I0 = -62, K0 = -62, NI = 124, NK = 124, NJ = 330;
const EX = 0.00137, EZ = 0.00219; // keep rays off exact edges

// Footprints (studs) in preference order; both orientations are tried.
const SIZES = [[2, 8], [2, 6], [2, 4], [2, 3], [2, 2], [1, 8], [1, 6], [1, 4], [1, 3], [1, 2], [1, 1]];

// Colours: sRGB hex of the classic brick palette.
export const BRICK = {
  white: 0xf4f4f4,
  lightBluishGray: 0xa0a5a9,
  darkBluishGray: 0x6c6e68,
  tan: 0xe4cd9e,
  darkTan: 0x958a73,
  sandGreen: 0xa0bcac,
  reddishBrown: 0x582a12,
  black: 0x1b2a34,
  green: 0x237841,
};

// Each palette: a body colour, a patch colour laid out by low-frequency noise
// (so weathering reads as coherent areas, not confetti), and rare accents.
export const PALETTE = {
  stone: { body: BRICK.lightBluishGray, patch: BRICK.white, patchAt: 0.56, accents: [[BRICK.tan, 0.45], [BRICK.darkBluishGray, 0.35], [BRICK.sandGreen, 0.2]], accentRate: 0.035 },
  core: { body: BRICK.darkTan, patch: BRICK.darkBluishGray, patchAt: 0.5, accents: [[BRICK.reddishBrown, 1]], accentRate: 0.2 },
  lion: { body: BRICK.lightBluishGray, patch: BRICK.white, patchAt: 0.45, accents: [[BRICK.darkBluishGray, 1]], accentRate: 0.05 },
};

const idx = (i, j, k) => ((i - I0) * NJ + j) * NK + (k - K0);

export function voxelize(pieces) {
  const occ = new Uint16Array(NI * NJ * NK);
  pieces.forEach((pc, p) => {
    const tag = p + 1;
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    let count = 0;
    for (const g of pc.prims) {
      const a = g.attributes.position.array;
      const cols = new Map();
      for (let t = 0, nt = a.length / 9; t < nt; t++) {
        const o = t * 9;
        const x0 = a[o], z0 = a[o + 2], x1 = a[o + 3], z1 = a[o + 5], x2 = a[o + 6], z2 = a[o + 8];
        if (Math.abs((x1 - x0) * (z2 - z0) - (x2 - x0) * (z1 - z0)) < 1e-12) continue;
        const ia = Math.ceil((Math.min(x0, x1, x2) - EX) / PITCH - 0.5);
        const ib = Math.floor((Math.max(x0, x1, x2) - EX) / PITCH - 0.5);
        const ka = Math.ceil((Math.min(z0, z1, z2) - EZ) / PITCH - 0.5);
        const kb = Math.floor((Math.max(z0, z1, z2) - EZ) / PITCH - 0.5);
        for (let i = ia; i <= ib; i++) {
          for (let k = ka; k <= kb; k++) {
            const key = (i - I0) * NK + (k - K0);
            let list = cols.get(key);
            if (!list) cols.set(key, (list = []));
            list.push(o);
          }
        }
      }
      const hits = [];
      for (const [key, tris] of cols) {
        const i = Math.floor(key / NK) + I0, k = (key % NK) + K0;
        const px = (i + 0.5) * PITCH + EX, pz = (k + 0.5) * PITCH + EZ;
        hits.length = 0;
        for (const o of tris) {
          const x0 = a[o], y0 = a[o + 1], z0 = a[o + 2];
          const x1 = a[o + 3], y1 = a[o + 4], z1 = a[o + 5];
          const x2 = a[o + 6], y2 = a[o + 7], z2 = a[o + 8];
          const d = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
          const l0 = ((z1 - z2) * (px - x2) + (x2 - x1) * (pz - z2)) / d;
          if (l0 < 0 || l0 > 1) continue;
          const l1 = ((z2 - z0) * (px - x2) + (x0 - x2) * (pz - z2)) / d;
          if (l1 < 0 || l0 + l1 > 1) continue;
          hits.push(l0 * y0 + l1 * y1 + (1 - l0 - l1) * y2);
        }
        if (hits.length < 2) continue;
        hits.sort((u, v) => u - v);
        for (let h = 0; h + 1 < hits.length; h += 2) {
          const ja = Math.max(0, Math.ceil(hits[h] / PLATE - 0.5));
          const jb = Math.min(NJ - 1, Math.floor(hits[h + 1] / PLATE - 0.5));
          for (let j = ja; j <= jb; j++) {
            const q = idx(i, j, k);
            if (occ[q]) continue;
            occ[q] = tag;
            count++;
            if (i < lo[0]) lo[0] = i; if (i > hi[0]) hi[0] = i;
            if (j < lo[1]) lo[1] = j; if (j > hi[1]) hi[1] = j;
            if (k < lo[2]) lo[2] = k; if (k > hi[2]) hi[2] = k;
          }
        }
      }
    }
    pc.vox = { tag, count, lo, hi };
  });
  return occ;
}

function hash3(i, j, k) {
  let h = Math.imul(i * 73856093 ^ j * 19349663 ^ k * 83492791, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const s = (t) => t * t * (3 - 2 * t);
  const fx = s(x - xi), fy = s(y - yi), fz = s(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const h = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return l(
    l(l(h(0, 0, 0), h(1, 0, 0), fx), l(h(0, 1, 0), h(1, 1, 0), fx), fy),
    l(l(h(0, 0, 1), h(1, 0, 1), fx), l(h(0, 1, 1), h(1, 1, 1), fx), fy), fz);
}

function pick(pal, r, x, y, z) {
  if (r < pal.accentRate) {
    // lichen (sand green) only near the ground
    const acc = pal.accents.filter(([c]) => c !== BRICK.sandGreen || y < 2.2);
    const tot = acc.reduce((a, [, w]) => a + w, 0);
    let u = (r / pal.accentRate) * tot;
    for (const [c, w] of acc) if ((u -= w) <= 0) return c;
    return acc[acc.length - 1][0];
  }
  const n = 0.65 * valueNoise(x * 1.1, y * 1.6, z * 1.1) + 0.35 * valueNoise(x * 3.1 + 9, y * 3.1, z * 3.1);
  return n > pal.patchAt ? pal.patch : pal.body;
}

// Build bricks for one piece. Returns instancing data relative to `center`.
export function buildBricks(occ, pc, palette, center) {
  const { tag, lo, hi } = pc.vox;
  if (!pc.vox.count) return { bricks: [], studs: [], plates: 0 };
  const inP = (i, j, k) =>
    i >= I0 && i < I0 + NI && k >= K0 && k < K0 + NK && j >= 0 && j < NJ && occ[idx(i, j, k)] === tag;
  const W = hi[0] - lo[0] + 1, H = hi[1] - lo[1] + 1, D = hi[2] - lo[2] + 1;
  const L = (i, j, k) => ((i - lo[0]) * H + (j - lo[1])) * D + (k - lo[2]);
  const free = new Uint8Array(W * H * D);
  for (let i = lo[0]; i <= hi[0]; i++) {
    for (let j = lo[1]; j <= hi[1]; j++) {
      for (let k = lo[2]; k <= hi[2]; k++) {
        if (!inP(i, j, k)) continue;
        const interior = inP(i + 1, j, k) && inP(i - 1, j, k) && inP(i, j + 1, k) && inP(i, j - 1, k) && inP(i, j, k + 1) && inP(i, j, k - 1);
        if (!interior) free[L(i, j, k)] = 1;
      }
    }
  }
  const fits = (i, j, k, w, d) => {
    if (j > hi[1] || i + w - 1 > hi[0] || k + d - 1 > hi[2]) return false;
    for (let a = 0; a < w; a++) for (let b = 0; b < d; b++) if (!free[L(i + a, j, k + b)]) return false;
    return true;
  };
  const take = (i, j, k, w, d) => {
    for (let a = 0; a < w; a++) for (let b = 0; b < d; b++) free[L(i + a, j, k + b)] = 0;
  };
  const bricks = [], studs = [];
  let plates = 0;
  for (let j = lo[1]; j <= hi[1]; j++) {
    const alt = Math.floor(j / 3) % 2 === 1;
    for (let k = lo[2]; k <= hi[2]; k++) {
      for (let i = lo[0]; i <= hi[0]; i++) {
        if (!free[L(i, j, k)]) continue;
        let w = 1, d = 1;
        search: for (const [a, b] of SIZES) {
          const opts = a === b ? [[a, b]] : alt ? [[b, a], [a, b]] : [[a, b], [b, a]];
          for (const [ww, dd] of opts) {
            if (fits(i, j, k, ww, dd)) { w = ww; d = dd; break search; }
          }
        }
        const tall = j % 3 === 0 && fits(i, j + 1, k, w, d) && fits(i, j + 2, k, w, d);
        const h = tall ? 3 : 1;
        for (let s = 0; s < h; s++) take(i, j + s, k, w, d);
        if (!tall) plates++;
        const cx = (i + w / 2) * PITCH, cy = (j + h / 2) * PLATE, cz = (k + d / 2) * PITCH;
        const color = pick(palette, hash3(i, j, k), cx, cy, cz);
        bricks.push([cx - center.x, cy - center.y, cz - center.z, w * PITCH, h * PLATE, d * PITCH, color]);
        const jt = j + h;
        for (let a = 0; a < w; a++) {
          for (let b = 0; b < d; b++) {
            if (inP(i + a, jt, k + b)) continue;
            studs.push([(i + a + 0.5) * PITCH - center.x, jt * PLATE - center.y, (k + b + 0.5) * PITCH - center.z, color]);
          }
        }
      }
    }
  }
  return { bricks, studs, plates };
}

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();
const unitBox = new THREE.BoxGeometry(1, 1, 1);
export const STUD_H = PITCH * (1.7 / 8); // stud: 4.8 mm Ø, 1.7 mm tall on an 8 mm pitch
// Stud: open 8-sided tube + top cap (its bottom is never visible) — 22 triangles.
// Tens of thousands of these dominate render cost; at 8 cm pitch an octagon
// is indistinguishable from a circle at any camera distance used here.
const studGeo = (() => {
  const side = new THREE.CylinderGeometry(PITCH * 0.3, PITCH * 0.3, STUD_H, 8, 1, true);
  const cap = new THREE.CircleGeometry(PITCH * 0.3, 8).rotateX(-Math.PI / 2).translate(0, STUD_H / 2, 0);
  const g = mergeGeometries([side.deleteAttribute('uv') && side, cap.deleteAttribute('uv') && cap]);
  return g.translate(0, STUD_H / 2, 0);
})();

export function brickMeshes({ bricks, studs }, brickMat, studMat) {
  const group = new THREE.Group();
  if (!bricks.length) return group;
  const body = new THREE.InstancedMesh(unitBox, brickMat, bricks.length);
  bricks.forEach(([x, y, z, w, h, d, col], n) => {
    _m.compose(_p.set(x, y, z), _q, _s.set(w - 0.002, h - 0.0012, d - 0.002));
    body.setMatrixAt(n, _m);
    body.setColorAt(n, _c.setHex(col));
  });
  body.castShadow = body.receiveShadow = true;
  group.add(body);
  if (studs.length) {
    const top = new THREE.InstancedMesh(studGeo, studMat, studs.length);
    studs.forEach(([x, y, z, col], n) => {
      _m.makeTranslation(x, y, z);
      top.setMatrixAt(n, _m);
      top.setColorAt(n, _c.setHex(col));
    });
    top.castShadow = false; // sub-centimetre shadows are invisible at this scale; skipping them halves the stud cost
    top.receiveShadow = true;
    group.add(top);
  }
  return group;
}
