// Geometry primitives for the Dabotap model.
// Every primitive comes back as a closed, non-indexed position+normal
// BufferGeometry in world space (metres, Y up, the pagoda's front faces +Z).
// Closed shells matter: the LEGO voxelizer relies on ray parity.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TAU = Math.PI * 2;

// Circumradius of a regular n-gon from its across-flats width.
export const circR = (n, af) => af / 2 / Math.cos(Math.PI / n);

function fin(g, smooth) {
  const src = g.index ? g.toNonIndexed() : g;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', src.getAttribute('position').clone());
  if (smooth && src.getAttribute('normal')) out.setAttribute('normal', src.getAttribute('normal').clone());
  else out.computeVertexNormals();
  return out;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

export function place(g, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, sx = s, sy = s, sz = s } = {}) {
  _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
  _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
  return g.applyMatrix4(_m);
}

export const rotY = (g, a) => g.applyMatrix4(_m.makeRotationY(a));

export function box(w, h, d, x = 0, y0 = 0, z = 0) {
  return fin(new THREE.BoxGeometry(w, h, d).translate(x, y0 + h / 2, z), false);
}

// Regular n-gon frustum with a flat (not a corner) facing +Z.
export function ngon(n, afBot, afTop, h, y0, { x = 0, z = 0, rot = 0 } = {}) {
  const g = new THREE.CylinderGeometry(circR(n, afTop), circR(n, afBot), h, n, 1, false, Math.PI / n + rot);
  return fin(g.translate(x, y0 + h / 2, z), false);
}

export function cyl(rBot, rTop, h, y0, { x = 0, z = 0, segs = 28 } = {}) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, segs, 1, false);
  return fin(g.translate(x, y0 + h / 2, z), true);
}

// Horizontal round bar from (x0,y,z0) to (x1,y,z1).
export function bar(r, x0, z0, x1, z1, y, segs = 14) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const g = fin(new THREE.CylinderGeometry(r, r, len, segs, 1, false), true);
  place(g, { rz: Math.PI / 2 });
  place(g, { x: (x0 + x1) / 2, y, z: (z0 + z1) / 2, ry: Math.atan2(-(z1 - z0), x1 - x0) });
  return g;
}

// Surface of revolution. profile: [[r, y], ...] from the axis at the bottom to
// the axis at the top. poly = true gives an n-gon lathe (segs sides, flat to +Z).
export function lathe(profile, segs = 40, { x = 0, z = 0, poly = false } = {}) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y));
  const g = new THREE.LatheGeometry(pts, segs, poly ? Math.PI / segs : 0, TAU);
  return fin(g.translate(x, 0, z), !poly);
}

export function sphere(r = 1, w = 18, h = 12) {
  return fin(new THREE.SphereGeometry(r, w, h), true);
}

export function ellipsoid(rx, ry, rz, opts = {}, w = 16, h = 10) {
  const g = sphere(1, w, h);
  place(g, { sx: rx, sy: ry, sz: rz });
  return place(g, opts);
}

export function cone(rBot, h, opts = {}, segs = 10) {
  const g = fin(new THREE.CylinderGeometry(0.0005, rBot, h, segs, 1, false).translate(0, h / 2, 0), false);
  return place(g, opts);
}

// Closed polygon (in the XZ plane) extruded upward from y0 by h.
export function extrudeY(pts, y0, h) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return fin(g, false);
}

// Closed polygon (in the XY plane) extruded along +Z from z0 by d.
export function extrudeZ(pts, z0, d) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, z0);
  return fin(g, false);
}

// Cross-shaped bracket block (교차 받침): two bars of width w crossing at (cx,cz).
export function plus(span, w, y0, h, cx = 0, cz = 0) {
  const a = span / 2, b = w / 2;
  const pts = [[b, -a], [b, -b], [a, -b], [a, b], [b, b], [b, a], [-b, a], [-b, b], [-a, b], [-a, -b], [-b, -b], [-b, -a]];
  return extrudeY(pts.map(([x, z]) => [x + cx, z + cz]), y0, h);
}

// Octagonal roof stone with a concave (swooping) slope and upturned corners.
// Closed shell: bottom soffit, eave band, sloped roof, flat top.
export function polyRoof({ n = 8, y0, eaveT, yTop, afEave, afTop, lift = 0.06, sub = 6, rings = 9, power = 1.7 }) {
  const N = n * sub;
  const Re = circR(n, afEave), Rt = circR(n, afTop);
  const ringPts = (rad, y, liftK) => {
    const out = [];
    for (let i = 0; i < N; i++) {
      const e = Math.floor(i / sub), f = (i % sub) / sub;
      const a0 = Math.PI / n + (e * TAU) / n, a1 = a0 + TAU / n;
      const x = Math.sin(a0) * rad + (Math.sin(a1) * rad - Math.sin(a0) * rad) * f;
      const z = Math.cos(a0) * rad + (Math.cos(a1) * rad - Math.cos(a0) * rad) * f;
      const cw = Math.pow(Math.abs(f - 0.5) * 2, 3);
      out.push([x, y + lift * liftK * cw, z]);
    }
    return out;
  };
  const H = yTop - y0 - eaveT;
  const R = [];
  R.push(ringPts(Re, y0, 1));
  R.push(ringPts(Re, y0 + eaveT, 1));
  for (let r = 1; r <= rings; r++) {
    const u = r / rings;
    R.push(ringPts(Re + (Rt - Re) * u, y0 + eaveT + H * Math.pow(u, power), Math.pow(1 - u, 2)));
  }
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  const bottomC = [0, y0, 0], topC = [0, yTop, 0];
  const B = R[0], T = R[R.length - 1];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    tri(bottomC, B[j], B[i]);
    tri(topC, T[i], T[j]);
  }
  for (let r = 0; r < R.length - 1; r++) {
    const A = R[r], C = R[r + 1];
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      tri(A[i], A[j], C[j]);
      tri(A[i], C[j], C[i]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function merge(list) {
  return mergeGeometries(list, false);
}
