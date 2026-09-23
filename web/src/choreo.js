// Choreography: everything is a pure function of time t (seconds), so any
// frame can be rendered in any order — the video renderer seeks frame by frame.
//
//   intro        establishing shot of the assembled pagoda
//   dis          members lifted top-down and laid out, numbered, on a spiral
//                of bays around the site (the way a dismantling crew stacks stones)
//   mandala      top-down view of the full lay-down yard
//   explode      every member flies to an exploded, axis-aligned stack
//   assemble     the stack collapses back into the pagoda
//   end          closing card
import * as THREE from 'three';

const TAU = Math.PI * 2;
const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);
const QI = new THREE.Quaternion();

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const cubic = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const sine = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(x));
const outCubic = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const lerp = (a, b, s) => a + (b - a) * s;

const GAP_T = 0.24, GAP_R = 0.3, MAX_D = 4.8;
const EXPLODE_GAP = 0.42;
const TED = 2.3; // explode flight
const TCD = 2.3; // collapse

export function buildChoreo(parts, { r0 = 7.6, growth = 6.4, phi0 = -0.35 } = {}) {
  const pieces = parts.flatMap((p) => p.pieces);
  const N = parts.length;

  // 1 — resting orientation and footprint of every piece on the ground
  const tmp = new THREE.Vector3();
  for (const pc of pieces) {
    const qUn = new THREE.Quaternion().setFromAxisAngle(Y, -pc.baseYaw);
    const qLay = pc.lay === 'side' ? new THREE.Quaternion().setFromAxisAngle(Z, -Math.PI / 2)
      : pc.lay === 'flat' ? new THREE.Quaternion().setFromAxisAngle(X, -Math.PI / 2) : new THREE.Quaternion();
    pc.qL = qLay.multiply(qUn);
    const a = pc.worldPos;
    const lo = new THREE.Vector3(1e9, 1e9, 1e9), hi = new THREE.Vector3(-1e9, -1e9, -1e9);
    const step = a.length > 60000 ? 9 : 3;
    for (let i = 0; i < a.length; i += step) {
      tmp.set(a[i] - pc.center.x, a[i + 1] - pc.center.y, a[i + 2] - pc.center.z).applyQuaternion(pc.qL);
      lo.min(tmp); hi.max(tmp);
    }
    pc.foot = { w: hi.x - lo.x, d: hi.z - lo.z, h: hi.y - lo.y, cx: (lo.x + hi.x) / 2, cz: (lo.z + hi.z) / 2, minY: lo.y };
  }

  // 2 — pack each part's pieces into a rectangular bay (rows along the tangent)
  for (const part of parts) {
    let best;
    for (const rowLen of [1.5, 2.5, 3.5, 4.5, 5.5, 7, 9, 12, 16]) {
      const rows = [];
      let row = null;
      for (const pc of part.pieces) {
        const limit = Math.max(rowLen, pc.foot.w);
        if (!row || row.len + GAP_T + pc.foot.w > limit) rows.push((row = { items: [], len: -GAP_T, depth: 0 }));
        row.len += GAP_T + pc.foot.w;
        row.depth = Math.max(row.depth, pc.foot.d);
        row.items.push(pc);
      }
      const W = Math.max(...rows.map((r) => r.len));
      const D = rows.reduce((s, r) => s + r.depth, 0) + GAP_R * (rows.length - 1);
      best = { rows, W, D };
      if (D <= MAX_D) break;
    }
    let rr = 0;
    for (const row of best.rows) {
      let x = -row.len / 2;
      for (const pc of row.items) {
        pc.slot = { t: x + pc.foot.w / 2, r: rr + row.depth / 2 };
        x += pc.foot.w + GAP_T;
      }
      rr += row.depth + GAP_R;
    }
    part.bay = { W: best.W, D: best.D };
  }

  // 3 — bays along an Archimedean spiral: small crowning members close in,
  // the heavy stylobate stones on the outer turn
  const k = growth / TAU;
  let phi = phi0;
  for (const part of parts) {
    const b = part.bay;
    const rIn = r0 + k * (phi - phi0);
    const dphi = (b.W + 1.1) / (rIn + b.D / 2);
    b.phi = phi + dphi / 2;
    b.rIn = r0 + k * (b.phi - phi0);
    phi += dphi;
    b.T = new THREE.Vector3(Math.cos(b.phi), 0, -Math.sin(b.phi));
    b.R = new THREE.Vector3(Math.sin(b.phi), 0, Math.cos(b.phi));
    b.center = b.R.clone().multiplyScalar(b.rIn + b.D / 2);
    b.q = new THREE.Quaternion().setFromAxisAngle(Y, b.phi);
    for (const pc of part.pieces) {
      const slot = b.R.clone().multiplyScalar(b.rIn + pc.slot.r).addScaledVector(b.T, pc.slot.t);
      const off = new THREE.Vector3(-pc.foot.cx, 0, -pc.foot.cz).applyQuaternion(b.q);
      pc.landPos = slot.add(off);
      pc.landPos.y = -pc.foot.minY;
      pc.landQ = b.q.clone().multiply(pc.qL);
    }
  }
  const yardRadius = Math.max(...parts.map((p) => p.bay.rIn + p.bay.D)) + 1.2;

  // 4 — timing
  const T_INTRO = 6.5;
  let t = T_INTRO;
  const phaseStarts = [T_INTRO];
  parts.forEach((part, i) => {
    if (i > 0 && part.phase !== parts[i - 1].phase) {
      t += 1.3;
      phaseStarts.push(t - 0.6);
    }
    const n = part.pieces.length;
    const stag = n > 1 ? Math.min(0.2, 1.3 / (n - 1)) : 0;
    const big = Math.max(part.size.x, part.size.z) > 3;
    const dur = big ? 3.2 : 2.7;
    part.t0 = t;
    part.pieces.forEach((pc, j) => { pc.t0 = t + j * stag; pc.dur = dur; });
    part.tLand = t + (n - 1) * stag + dur;
    t += 1.55 + (n - 1) * stag + (big ? 0.35 : 0);
  });
  const disEnd = Math.max(...parts.map((p) => p.tLand));

  // 5 — lift heights: clear everything still standing, then cruise above the yard
  parts.forEach((part, i) => {
    let top = 0;
    for (let m = i + 1; m < N; m++) top = Math.max(top, parts[m].bbox.max.y);
    for (const pc of part.pieces) {
      pc.liftY = Math.max(pc.center.y + 0.45, top + 0.42 + (pc.center.y - pc.minY));
      pc.highY = pc.landPos.y + 2.1;
    }
  });

  // 6 — exploded view and reassembly
  const E0 = disEnd + 4.4;
  parts.forEach((part) => {
    const j = N - 1 - part.index; // bottom-up
    part.pieces.forEach((pc, n) => {
      const rad = new THREE.Vector3(pc.center.x, 0, pc.center.z);
      if (rad.length() > 0.05) rad.normalize(); else rad.set(0, 0, 0);
      pc.expPos = pc.center.clone().add(new THREE.Vector3(0, j * EXPLODE_GAP, 0)).addScaledVector(rad, part.spread);
      pc.expRad = rad;
      pc.te0 = E0 + j * 0.09 + n * 0.025;
    });
  });
  const expSettled = Math.max(...pieces.map((pc) => pc.te0)) + TED;
  const C0 = expSettled + 4.6;
  parts.forEach((part) => part.pieces.forEach((pc) => { pc.tc0 = C0 + part.index * 0.035; }));
  const assembled = C0 + (N - 1) * 0.035 + TCD;
  const END = assembled + 6.0;

  // pose -------------------------------------------------------------------
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion();

  function disPose(pc, u, pos, q) {
    const A = 0.1, B = 0.4, C = 0.8;
    const c = pc.center;
    if (u < A) {
      const s = u / A;
      pos.set(c.x, c.y + 0.025 * smooth(s), c.z);
      q.setFromEuler(new THREE.Euler(0.004 * Math.sin(s * 40), 0, 0.004 * Math.cos(s * 33)));
    } else if (u < B) {
      pos.set(c.x, lerp(c.y + 0.025, pc.liftY, cubic((u - A) / (B - A))), c.z);
      q.copy(QI);
    } else if (u < C) {
      const s = sine((u - B) / (C - B));
      const dist = Math.hypot(pc.landPos.x - c.x, pc.landPos.z - c.z);
      pos.set(lerp(c.x, pc.landPos.x, s), lerp(pc.liftY, pc.highY, s) + (0.4 + 0.06 * dist) * Math.sin(Math.PI * s), lerp(c.z, pc.landPos.z, s));
      q.slerpQuaternions(QI, pc.landQ, cubic((u - B) / (C - B)));
    } else {
      const s = (u - C) / (1 - C);
      pos.set(pc.landPos.x, lerp(pc.highY, pc.landPos.y, outCubic(s)), pc.landPos.z);
      q.copy(pc.landQ);
    }
  }

  function explodePose(pc, s, pos, q) {
    // cubic Bézier from the bay up and over into the stack
    const e = cubic(s);
    const p0 = pc.landPos, p3 = pc.expPos;
    _a.copy(p0).setY(p0.y + 4.5);
    _b.copy(p3).addScaledVector(pc.expRad, 1.6).setY(p3.y + 2.2);
    const m = 1 - e;
    pos.set(0, 0, 0)
      .addScaledVector(p0, m * m * m).addScaledVector(_a, 3 * m * m * e)
      .addScaledVector(_b, 3 * m * e * e).addScaledVector(p3, e * e * e);
    q.slerpQuaternions(pc.landQ, QI, sine(s));
  }

  function pose(pc, t, pos, q) {
    if (t < pc.t0) { pos.copy(pc.center); q.copy(QI); return 'home'; }
    if (t < pc.t0 + pc.dur) { disPose(pc, (t - pc.t0) / pc.dur, pos, q); return 'moving'; }
    if (t < pc.te0) { pos.copy(pc.landPos); q.copy(pc.landQ); return 'landed'; }
    if (t < pc.te0 + TED) { explodePose(pc, (t - pc.te0) / TED, pos, q); return 'exploding'; }
    if (t < pc.tc0) { pos.copy(pc.expPos); q.copy(QI); return 'exploded'; }
    if (t < pc.tc0 + TCD) { pos.lerpVectors(pc.expPos, pc.center, cubic((t - pc.tc0) / TCD)); q.copy(QI); return 'collapsing'; }
    pos.copy(pc.center); q.copy(QI); return 'home';
  }

  function glow(pc, t) {
    if (t < pc.t0 || t > pc.t0 + pc.dur + 0.6) return 0;
    const u = (t - pc.t0) / pc.dur;
    return smooth(u / 0.06) * (1 - smooth((u - 0.82) / 0.3));
  }

  function ghost(pc, t) {
    if (t < pc.t0) return 0;
    const g = smooth((t - pc.t0 - 0.25) / 0.6);
    if (t < pc.te0) return g;
    if (t < pc.tc0) return lerp(1, 0.1, smooth((t - pc.te0) / TED));
    return 0.1 * (1 - smooth((t - pc.tc0) / (TCD * 0.8)));
  }

  function stage(t) {
    if (t < T_INTRO) return 'intro';
    if (t < disEnd + 0.3) return 'dis';
    if (t < E0) return 'mandala';
    if (t < C0) return 'explode';
    if (t < assembled) return 'assemble';
    return 'end';
  }

  function activePart(t) {
    let a = -1;
    for (const p of parts) if (t >= p.t0 - 0.05 && t < p.tLand + 0.5) a = p.index;
    return a;
  }

  // camera -------------------------------------------------------------------
  // Keys: [t, azimuth, elevation, distance, targetX, targetY, targetZ]
  const keys = [];
  parts.forEach((part) => {
    const b = part.bay;
    const h = part.bbox.getCenter(new THREE.Vector3()).y;
    keys.push([
      part.t0 + 1.1,
      b.phi + 0.66,
      0.24 + 0.16 * (1 - Math.min(1, h / 10)),
      9.6 + 0.98 * (b.rIn + b.D / 2),
      0.45 * b.center.x,
      Math.max(1.0, h * 0.5 + 0.8),
      0.45 * b.center.z,
    ]);
  });
  // Off-centre framing for the title cards: shift the target to screen-left
  // so the pagoda sits in the right half and the type in the left.
  const offKey = (t, az, el, d, ty, off) => [t, az, el, d, -Math.cos(az) * off, ty, Math.sin(az) * off];
  const k1 = keys[0];
  keys.unshift(
    offKey(0, k1[1] - 1.25, 0.04, 10.5, 2.6, 2.6),
    offKey(3.4, k1[1] - 0.6, 0.13, 20, 5.0, 3.6),
  );
  const last = keys[keys.length - 1];
  const topDist = yardRadius / Math.tan(THREE.MathUtils.degToRad(17.5)) * 1.02;
  const az0 = last[1];
  keys.push(
    [disEnd + 1.3, az0 + 0.3, 0.95, topDist * 0.8, 0, 0.5, 0],
    [E0 - 0.2, az0 + 0.5, 1.36, topDist, 0, 0, 0],
    [E0 + 1.6, az0 + 0.75, 0.62, 40, 0, 4, 0],
    [expSettled - 0.3, az0 + 1.0, 0.13, 42, 0, 9.7, 0],
    [C0 - 0.1, az0 + 1.55, 0.1, 41, 0, 9.9, 0],
    offKey(assembled + 0.2, az0 + 1.95, 0.15, 24, 5.0, 2.0),
    offKey(END, az0 + 2.45, 0.17, 23, 5.1, 4.0),
  );
  // unwrap azimuth so the camera never spins the long way round
  for (let i = 1; i < keys.length; i++) {
    while (keys[i][1] - keys[i - 1][1] > Math.PI) keys[i][1] -= TAU;
    while (keys[i][1] - keys[i - 1][1] < -Math.PI) keys[i][1] += TAU;
  }

  const channel = (i, c, t) => {
    // cubic Hermite with time-aware Catmull-Rom tangents
    const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
    const dt = k2[0] - k1[0];
    const u = (t - k1[0]) / dt;
    const m1 = (k2[c] - k0[c]) / Math.max(1e-3, k2[0] - k0[0]);
    const m2 = (k3[c] - k1[c]) / Math.max(1e-3, k3[0] - k1[0]);
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * k1[c] + (u3 - 2 * u2 + u) * dt * m1 + (-2 * u3 + 3 * u2) * k2[c] + (u3 - u2) * dt * m2;
  };

  function camera(t, outPos, outTarget) {
    let i = 0;
    if (t <= keys[0][0]) i = 0;
    else if (t >= keys[keys.length - 1][0]) i = keys.length - 2;
    else while (i < keys.length - 2 && keys[i + 1][0] <= t) i++;
    const tc = Math.min(Math.max(t, keys[0][0]), keys[keys.length - 1][0]);
    const az = channel(i, 1, tc), el = channel(i, 2, tc), d = channel(i, 3, tc);
    outTarget.set(channel(i, 4, tc), channel(i, 5, tc), channel(i, 6, tc));
    outPos.set(
      outTarget.x + d * Math.cos(el) * Math.sin(az),
      outTarget.y + d * Math.sin(el),
      outTarget.z + d * Math.cos(el) * Math.cos(az),
    );
  }

  return {
    parts, pieces, T_INTRO, disEnd, E0, expSettled, C0, assembled, END, phaseStarts, yardRadius,
    pose, glow, ghost, stage, activePart, camera,
  };
}
