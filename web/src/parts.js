// Dabotap (多寶塔, 국보, 경주 불국사, 751) as a catalogue of stone members.
//
// Structure follows the documented composition of the pagoda (bottom to top):
//   십자형 기단(지대석·면석·갑석) + 사방 보계(8단, 난간석주) → 굄돌 1단
//   → 네 귀와 중앙의 방형석주 5주 → 교차 받침 2단 → 1층 갑석
//   → 사각 난간 속 8각 신부 → 8각 갑석 + 8각 난간 → 죽절형 석주 8주
//   → 16엽 8각 연화석 → 주두형 받침 8개 → 8각 옥개석
//   → 상륜부: 복련 16판 연화좌 · 8각 노반 · 구형 복발 · 8판 앙화 · 보륜 3 · 보개 · 보주 (찰주 관통)
// Overall height is 10.29 m. Member heights are chosen so the stack sums to
// exactly that; plan dimensions are proportioned from survey photographs.
// Units: metres. Y up. The pagoda's front (south) faces +Z.
//
// Parts are listed in removal order (top-down), the order a dismantling
// crew would lift them. Within a part, pieces are listed top-down too.
import {
  box, ngon, cyl, bar, lathe, ellipsoid, cone, extrudeY, extrudeZ, plus, polyRoof,
  place, rotY, circR, TAU,
} from './geom.js';
import * as THREE from 'three';

const PI = Math.PI;
const V8 = (k) => PI / 8 + (k * PI) / 4; // angle of the k-th octagon vertex (flats face the axes)
const F8 = (k) => (k * PI) / 4; // angle of the k-th octagon flat

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// piece(prims, { lay, baseYaw, label })
//   lay: how the piece rests on the ground after removal
//     'up'   — upright
//     'side' — a column laid on its side
//     'flat' — a panel laid on its face
//   baseYaw: the yaw that was applied to a canonical copy to put it in place
const piece = (prims, o = {}) => ({ prims, lay: o.lay || 'up', baseYaw: o.baseYaw || 0, label: o.label || '' });

// ---------------------------------------------------------------------------
// 상륜부 (finial)

function bojuChalju() {
  const mast = cyl(0.045, 0.045, 2.16, 7.68, { segs: 14 });
  const jewel = lathe([
    [0, 9.84], [0.055, 9.84], [0.055, 9.875], [0.085, 9.895], [0.125, 9.94], [0.145, 9.99],
    [0.142, 10.05], [0.118, 10.12], [0.08, 10.19], [0.04, 10.25], [0.012, 10.285], [0, 10.29],
  ], 40);
  const collar = cyl(0.075, 0.07, 0.04, 9.8, { segs: 24 });
  return [piece([mast, collar, jewel], { lay: 'side' })];
}

function bogae() {
  const prims = [
    ngon(8, 0.36, 0.74, 0.12, 9.22),
    polyRoof({ y0: 9.34, eaveT: 0.035, yTop: 9.48, afEave: 0.76, afTop: 0.2, lift: 0.028, sub: 4, rings: 5 }),
  ];
  const rr = circR(8, 0.76) - 0.02;
  for (let k = 0; k < 8; k++) {
    const a = V8(k);
    prims.push(cone(0.034, 0.13, { x: Math.sin(a) * rr, y: 9.37, z: Math.cos(a) * rr, rx: 0.6, ry: a }));
  }
  return [piece(prims)];
}

function boryun() {
  const round = (y0, r) => lathe([
    [0, y0], [r - 0.06, y0], [r - 0.01, y0 + 0.04], [r, y0 + 0.09], [r - 0.01, y0 + 0.14], [r - 0.06, y0 + 0.18], [0, y0 + 0.18],
  ], 40);
  const oct = [ngon(8, 0.44, 0.52, 0.09, 8.86), ngon(8, 0.52, 0.44, 0.09, 8.95)];
  return [
    piece([round(9.04, 0.24)], { label: '보륜 3 (원형)' }),
    piece(oct, { label: '보륜 2 (팔각)' }),
    piece([round(8.68, 0.28)], { label: '보륜 1 (원형)' }),
  ];
}

function anghwa() {
  const prims = [ngon(8, 0.36, 0.6, 0.2, 8.44), ngon(8, 0.66, 0.66, 0.04, 8.64)];
  for (let k = 0; k < 8; k++) {
    const a = F8(k);
    prims.push(ellipsoid(0.1, 0.035, 0.13, { x: Math.sin(a) * 0.235, y: 8.56, z: Math.cos(a) * 0.235, rx: -1.05, ry: a }));
  }
  return [piece(prims)];
}

function bokbal() {
  return [piece([lathe([
    [0, 8.08], [0.16, 8.08], [0.22, 8.12], [0.26, 8.18], [0.275, 8.235], [0.292, 8.24], [0.292, 8.28],
    [0.275, 8.285], [0.262, 8.33], [0.225, 8.385], [0.15, 8.425], [0.12, 8.44], [0, 8.44],
  ], 48)])];
}

function noban() {
  return [piece([ngon(8, 0.6, 0.6, 0.04, 7.84), ngon(8, 0.52, 0.52, 0.16, 7.88), ngon(8, 0.6, 0.6, 0.04, 8.04)])];
}

function yeonhwajwa() {
  const prims = [lathe([
    [0, 7.68], [0.42, 7.68], [0.42, 7.7], [0.39, 7.75], [0.33, 7.8], [0.29, 7.83], [0.27, 7.84], [0, 7.84],
  ], 48)];
  for (let k = 0; k < 16; k++) {
    const a = (k * PI) / 8 + PI / 16;
    prims.push(ellipsoid(0.08, 0.026, 0.115, { x: Math.sin(a) * 0.36, y: 7.745, z: Math.cos(a) * 0.36, rx: 0.62, ry: a }, 12, 8));
    const b = a + PI / 16;
    prims.push(ellipsoid(0.06, 0.022, 0.085, { x: Math.sin(b) * 0.295, y: 7.8, z: Math.cos(b) * 0.295, rx: 0.5, ry: b }, 12, 8));
  }
  return [piece(prims)];
}

// ---------------------------------------------------------------------------
// 탑신부 (body)

function okgaeseok() {
  return [piece([polyRoof({ y0: 7.04, eaveT: 0.14, yTop: 7.68, afEave: 3.2, afTop: 0.8, lift: 0.085, sub: 8, rings: 12, power: 1.8 })])];
}

function judu() {
  const out = [];
  for (let k = 0; k < 8; k++) {
    const a = V8(k);
    const post = box(0.15, 0.14, 0.15, 0, 6.8, 0);
    const cap = ngon(4, 0.17, 0.28, 0.1, 6.94);
    for (const g of [post, cap]) place(g, { x: Math.sin(a) * 0.82, z: Math.cos(a) * 0.82, ry: a });
    out.push(piece([post, cap], { baseYaw: a, label: `주두 ${k + 1}` }));
  }
  return out;
}

function yeonhwaseok() {
  const prims = [ngon(8, 1.0, 2.0, 0.28, 6.44), ngon(8, 2.2, 2.2, 0.08, 6.72)];
  for (let k = 0; k < 16; k++) {
    const a = (k * PI) / 8 + PI / 16;
    prims.push(ellipsoid(0.15, 0.045, 0.23, { x: Math.sin(a) * 0.83, y: 6.6, z: Math.cos(a) * 0.83, rx: -0.5, ry: a }, 14, 8));
  }
  return [piece(prims)];
}

function bambooProfile(y0, h) {
  const pts = [[0, y0], [0.125, y0], [0.125, y0 + 0.05], [0.1, y0 + 0.06]];
  const seg = (h - 0.12) / 3;
  for (let s = 0; s < 3; s++) {
    const ya = y0 + 0.06 + s * seg, yb = ya + seg;
    pts.push([0.1, ya + 0.012], [0.093, (ya + yb) / 2], [0.1, yb - 0.02]);
    if (s < 2) pts.push([0.116, yb - 0.006], [0.116, yb + 0.006], [0.1, yb + 0.014]);
  }
  pts.push([0.1, y0 + h - 0.06], [0.125, y0 + h - 0.05], [0.125, y0 + h], [0, y0 + h]);
  return pts;
}

function jukjeol() {
  const out = [];
  for (let k = 0; k < 8; k++) {
    const a = V8(k);
    out.push(piece([lathe(bambooProfile(5.56, 0.88), 20, { x: Math.sin(a) * 0.9, z: Math.cos(a) * 0.9 })], { lay: 'side', label: `죽절 석주 ${k + 1}` }));
  }
  out.push(piece([ngon(8, 0.6, 0.6, 0.88, 5.56)], { lay: 'side', label: '심주' }));
  return out;
}

function nangan8() {
  const ap = 1.46, e = ap * Math.tan(PI / 8);
  const out = [];
  for (let k = 0; k < 8; k++) {
    const prims = [
      ngon(8, 0.13, 0.13, 0.52, 5.56, { x: -e, z: ap }),
      ngon(8, 0.17, 0.1, 0.05, 6.08, { x: -e, z: ap }),
      box(2 * e, 0.09, 0.11, 0, 5.56, ap),
      bar(0.042, -e, ap, e, ap, 5.99),
      box(0.06, 0.3, 0.06, 0, 5.65, ap),
      ellipsoid(0.07, 0.035, 0.045, { x: 0, y: 5.95, z: ap }, 12, 8),
    ];
    const yaw = F8(k);
    for (const g of prims) rotY(g, yaw);
    out.push(piece(prims, { lay: 'flat', baseYaw: yaw, label: `팔각 난간 ${k + 1}` }));
  }
  return out;
}

function gapseok8() {
  return [
    piece([ngon(8, 3.2, 3.12, 0.2, 5.32), ngon(8, 3.08, 3.08, 0.04, 5.52)], { label: '팔각 갑석' }),
    piece([ngon(8, 2.5, 2.5, 0.12, 5.2)], { label: '층급받침' }),
  ];
}

function sinbu8() {
  const body = [ngon(8, 2.2, 2.2, 0.94, 4.2), ngon(8, 2.3, 2.3, 0.06, 5.14)];
  const rr = circR(8, 2.2) - 0.03;
  for (let k = 0; k < 8; k++) {
    const a = V8(k);
    body.push(place(box(0.12, 0.94, 0.12, 0, 0, 0), { x: Math.sin(a) * rr, y: 4.2, z: Math.cos(a) * rr, ry: a }));
  }
  const steps = [ngon(8, 2.9, 2.9, 0.12, 3.84), ngon(8, 2.7, 2.7, 0.12, 3.96), ngon(8, 2.5, 2.5, 0.12, 4.08)];
  return [piece(body, { label: '팔각 몸돌' }), piece(steps, { label: '3단 받침' })];
}

function nangan4() {
  const c = 2.02;
  const out = [];
  for (let k = 0; k < 4; k++) {
    const prims = [box(2 * c, 0.1, 0.14, 0, 3.84, c), bar(0.05, -c, c, c, c, 4.36)];
    for (const x of [-c, -c / 2, 0, c / 2]) {
      prims.push(box(0.16, 0.64, 0.16, x, 3.84, c), box(0.2, 0.04, 0.2, x, 4.48, c));
    }
    for (const x of [-0.75 * c, -0.25 * c, 0.25 * c, 0.75 * c]) {
      prims.push(box(0.07, 0.36, 0.07, x, 3.94, c), ellipsoid(0.08, 0.035, 0.05, { x, y: 4.3, z: c }, 12, 8));
    }
    const yaw = (k * PI) / 2;
    for (const g of prims) rotY(g, yaw);
    out.push(piece(prims, { lay: 'flat', baseYaw: yaw, label: `사각 난간 ${'남동북서'[k]}` }));
  }
  return out;
}

function gapseok1() {
  return [
    piece([box(4.5, 0.22, 4.5, 0, 3.56, 0), box(4.4, 0.06, 4.4, 0, 3.78, 0)], { label: '1층 갑석' }),
    piece([box(3.9, 0.12, 3.9, 0, 3.44, 0)], { label: '층급받침' }),
  ];
}

const CORNERS = [[1.62, 1.62], [-1.62, 1.62], [-1.62, -1.62], [1.62, -1.62]];

function brackets() {
  const out = CORNERS.map(([x, z], i) => piece([plus(0.8, 0.36, 3.12, 0.16, x, z), plus(1.2, 0.36, 3.28, 0.16, x, z)], { label: `귀 받침 ${i + 1}` }));
  out.push(piece([plus(1.1, 0.5, 3.12, 0.16), plus(1.7, 0.5, 3.28, 0.16)], { label: '중앙 받침' }));
  return out;
}

function pillars() {
  const out = CORNERS.map(([x, z], i) => piece([box(0.36, 1.3, 0.36, x, 1.82, z), box(0.46, 0.06, 0.46, x, 1.76, z)], { lay: 'side', label: `귀 석주 ${i + 1}` }));
  out.push(piece([box(0.6, 1.3, 0.6, 0, 1.82, 0), box(0.72, 0.06, 0.72, 0, 1.76, 0)], { lay: 'side', label: '중앙 석주' }));
  return out;
}

// ---------------------------------------------------------------------------
// 기단부 (stylobate)

export function lionPrims() {
  // Seated guardian lion, canonical: facing +Z, standing on y = 0.
  const L = [
    box(0.36, 0.05, 0.36, 0, 0, 0),
    ellipsoid(0.1, 0.1, 0.13, { x: 0.08, y: 0.14, z: -0.05 }),
    ellipsoid(0.1, 0.1, 0.13, { x: -0.08, y: 0.14, z: -0.05 }),
    ellipsoid(0.12, 0.19, 0.11, { x: 0, y: 0.26, z: 0.0, rx: -0.25 }),
    cyl(0.035, 0.032, 0.22, 0.05, { x: 0.075, z: 0.1, segs: 10 }),
    cyl(0.035, 0.032, 0.22, 0.05, { x: -0.075, z: 0.1, segs: 10 }),
    ellipsoid(0.042, 0.028, 0.055, { x: 0.075, y: 0.075, z: 0.13 }),
    ellipsoid(0.042, 0.028, 0.055, { x: -0.075, y: 0.075, z: 0.13 }),
    ellipsoid(0.145, 0.13, 0.12, { x: 0, y: 0.42, z: 0.02 }),
    ellipsoid(0.1, 0.1, 0.1, { x: 0, y: 0.45, z: 0.1 }),
    ellipsoid(0.06, 0.048, 0.05, { x: 0, y: 0.42, z: 0.18 }),
    ellipsoid(0.03, 0.035, 0.02, { x: 0.07, y: 0.54, z: 0.07 }),
    ellipsoid(0.03, 0.035, 0.02, { x: -0.07, y: 0.54, z: 0.07 }),
    ellipsoid(0.03, 0.11, 0.03, { x: 0, y: 0.22, z: -0.17, rx: 0.5 }),
  ];
  return L;
}

export const LION_SPOTS = [
  { x: 2.13, z: 2.13, ry: PI / 4, extant: true },
  { x: -2.13, z: 2.13, ry: -PI / 4 },
  { x: -2.13, z: -2.13, ry: (-3 * PI) / 4 },
  { x: 2.13, z: -2.13, ry: (3 * PI) / 4 },
];

function lion() {
  const s = LION_SPOTS[0];
  const prims = lionPrims().map((g) => place(g, { x: s.x, y: 1.64, z: s.z, ry: s.ry }));
  return [piece(prims, { baseYaw: s.ry })];
}

function goemdol() {
  return [piece([box(3.9, 0.12, 3.9, 0, 1.64, 0)])];
}

function gapseokBase() {
  return [piece([box(4.7, 0.16, 4.7, 0, 1.48, 0), box(4.56, 0.04, 4.56, 0, 1.44, 0)])];
}

function stairs() {
  const out = [];
  for (let k = 0; k < 4; k++) {
    const prims = [];
    for (let s = 0; s < 8; s++) {
      const len = (8 - s) * 0.26;
      prims.push(box(len, 0.18, 1.5, 2.36 + len / 2, 0.2 + 0.18 * s, 0));
    }
    prims.push(box(0.16, 1.24, 1.86, 2.28, 0.2, 0));
    const wall = [[2.36, 0.2], [4.52, 0.2], [4.52, 0.5], [2.62, 1.78], [2.36, 1.78]];
    prims.push(extrudeZ(wall, 0.75, 0.18), extrudeZ(wall, -0.93, 0.18));
    for (const z of [0.84, -0.84]) {
      prims.push(box(0.14, 0.46, 0.14, 4.42, 0.46, z), box(0.14, 0.46, 0.14, 2.49, 1.72, z));
    }
    const yaw = (k * PI) / 2;
    for (const g of prims) rotY(g, yaw);
    out.push(piece(prims, { baseYaw: yaw, label: `보계 ${'동북서남'[k]}` }));
  }
  return out;
}

function myeonseok() {
  const out = [];
  for (let k = 0; k < 4; k++) {
    const W = k % 2 === 0 ? 4.4 : 3.8;
    const prims = [box(W, 1.24, 0.3, 0, 0.2, 2.05)];
    for (const x of [-1.2, 1.2]) prims.push(box(0.2, 1.24, 0.03, x, 0.2, 2.215));
    if (W > 4) {
      for (const s of [-1, 1]) {
        prims.push(box(0.22, 1.24, 0.03, s * 2.09, 0.2, 2.215));
        prims.push(box(0.03, 1.24, 0.22, s * 2.215, 0.2, 2.09));
      }
    }
    const yaw = (k * PI) / 2;
    for (const g of prims) rotY(g, yaw);
    out.push(piece(prims, { lay: 'flat', baseYaw: yaw, label: `면석 ${'남동북서'[k]}` }));
  }
  return out;
}

function jeoksim() {
  const r = rng(751);
  const prims = [box(3.76, 1.0, 3.76, 0, 0.2, 0)];
  const ico = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 7; j++) {
      const s = 0.17 + r() * 0.07;
      const src = ico.index ? ico.toNonIndexed() : ico;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', src.getAttribute('position').clone());
      g.computeVertexNormals();
      place(g, { sx: s * (0.9 + r() * 0.5), sy: s * (0.55 + r() * 0.3), sz: s * (0.9 + r() * 0.5) });
      place(g, {
        x: -1.53 + i * 0.51 + (r() - 0.5) * 0.14, y: 1.2 + 0.03 + r() * 0.03, z: -1.53 + j * 0.51 + (r() - 0.5) * 0.14,
        ry: r() * TAU,
      });
      prims.push(g);
    }
  }
  return [piece(prims)];
}

function jidaeseok() {
  const a = 2.5, b = 1.0, c = 4.62;
  const pts = [
    [b, -c], [b, -a], [a, -a], [a, -b], [c, -b], [c, b], [a, b], [a, a], [b, a], [b, c],
    [-b, c], [-b, a], [-a, a], [-a, b], [-c, b], [-c, -b], [-a, -b], [-a, -a], [-b, -a], [-b, -c],
  ];
  return [piece([extrudeY(pts, 0, 0.2)])];
}

// ---------------------------------------------------------------------------

export const PHASES = [
  { key: 'sangryun', roman: 'I', name: '상륜부', hanja: '相輪部', en: 'Finial' },
  { key: 'tapsin', roman: 'II', name: '탑신부', hanja: '塔身部', en: 'Body' },
  { key: 'gidan', roman: 'III', name: '기단부', hanja: '基壇部', en: 'Stylobate' },
];

const CATALOGUE = [
  ['보주·찰주', '寶珠·擦柱', 'Jewel finial & mast', '상륜을 꿰뚫은 중심 기둥 찰주를 뽑아 올리며 해체를 시작한다.', 0, bojuChalju, 0],
  ['보개', '寶蓋', 'Canopy', '귀꽃으로 장식한 팔각 지붕 모양의 덮개.', 0, bogae, 0],
  ['보륜', '寶輪', 'Rings', '원형·팔각형·원형으로 이어지는 세 개의 보륜.', 0, boryun, 0],
  ['앙화', '仰花', 'Upturned lotus', '단엽 8판 앙련을 새긴 팔각 받침.', 0, anghwa, 0],
  ['복발', '覆鉢', 'Inverted bowl', '발우를 엎어 놓은 모양의 둥근 부재.', 0, bokbal, 0],
  ['노반', '露盤', 'Dew basin', '상륜부의 기초가 되는 팔각 노반석.', 0, noban, 0],
  ['연화좌', '蓮華座', 'Lotus seat', '옥개석 위, 복엽 16판 복련을 새긴 연꽃 자리.', 0, yeonhwajwa, 0],
  ['팔각 옥개석', '八角屋蓋石', 'Octagonal roof stone', '낙수면이 완만하고 합각이 예리하다. 하면에는 낙수홈만 얕게 새겼다.', 1, okgaeseok, 0],
  ['주두형 받침', '柱頭形', 'Capital blocks', '연화석 위 여덟 개의 주두 모양 받침이 옥개석을 떠받친다.', 1, judu, 0.35],
  ['팔각 연화석', '八角蓮華石', 'Lotus stone', '16엽 연꽃잎을 새긴 팔각 받침돌.', 1, yeonhwaseok, 0],
  ['죽절형 석주', '竹節形石柱', 'Bamboo-joint pillars', '대나무 마디 모양 돌기둥 8주가 둥글게 서서 연화석을 받친다. 가운데 심주 포함.', 1, jukjeol, 0.45],
  ['팔각 난간', '八角欄干', 'Octagonal railing', '팔각 갑석 가장자리를 두른 여덟 칸의 돌난간.', 1, nangan8, 0.55],
  ['팔각 갑석', '八角甲石', 'Octagonal cover slab', '팔각 신부를 덮는 갑석과 그 아래 층급받침.', 1, gapseok8, 0],
  ['팔각 신부', '八角身部', 'Octagonal body', '사각 난간 속에 놓인 팔각 몸돌과 3단 받침.', 1, sinbu8, 0],
  ['사각 난간', '四角欄干', 'Square railing', '1층 갑석 위의 네모 난간 — 돌난대·동자주·하엽.', 1, nangan4, 0.7],
  ['1층 갑석', '甲石', 'First-storey slab', '교차 받침 위에 얹은 네모난 갑석과 층급받침.', 1, gapseok1, 0],
  ['교차 받침', '交叉받침', 'Crossed brackets', '석주 머리에 2단으로 교차해 얹은 목조 공포식 받침.', 1, brackets, 0.55],
  ['방형석주', '方形石柱', 'Square pillars', '네 귀와 중앙에 세운 다섯 개의 네모 돌기둥.', 1, pillars, 0.55],
  ['돌사자', '石獅子', 'Stone lion', '본래 네 모퉁이에 4구. 3구는 일제강점기에 반출되어 지금도 행방을 모른다.', 2, lion, 0.4],
  ['굄돌', '괴임', 'Riser course', '기단 갑석 윗면에 놓인 1단 굄.', 2, goemdol, 0],
  ['기단 갑석', '基壇甲石', 'Stylobate cover', '기단 면석을 덮는 넓은 판석.', 2, gapseokBase, 0],
  ['보계', '寶階', 'Stairways', '십자형 평면 사방의 8단 돌계단. 난간을 세웠던 석주가 남아 있다.', 2, stairs, 1.1],
  ['기단 면석', '基壇面石', 'Stylobate panels', '우주(모서리 기둥)와 탱주(가운데 기둥)를 새긴 면석.', 2, myeonseok, 0.8],
  ['적심', '積心', 'Rubble core', '기단 속을 채운 적심석. 1925년경 일제의 해체·보수 때 사리장엄구가 사라졌다.', 2, jeoksim, 0],
  ['지대석', '地臺石', 'Foundation stone', '탑 전체를 받치는 십자형 바닥돌.', 2, jidaeseok, 0],
];

function signedVolume(g) {
  const p = g.attributes.position.array;
  let v = 0;
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i], ay = p[i + 1], az = p[i + 2];
    const bx = p[i + 3], by = p[i + 4], bz = p[i + 5];
    const cx = p[i + 6], cy = p[i + 7], cz = p[i + 8];
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

export const GRANITE_DENSITY = 2.65; // t/m³

export function buildParts() {
  return CATALOGUE.map(([name, hanja, en, desc, phase, build, spread], i) => {
    const pieces = build();
    let vol = 0;
    const bb = new THREE.Box3();
    for (const pc of pieces) {
      pc.volume = pc.prims.reduce((s, g) => s + Math.abs(signedVolume(g)), 0);
      vol += pc.volume;
      for (const g of pc.prims) {
        g.computeBoundingBox();
        bb.union(g.boundingBox);
      }
    }
    const size = bb.getSize(new THREE.Vector3());
    return {
      index: i, no: String(i + 1).padStart(2, '0'), name, hanja, en, desc, phase, spread,
      pieces, volume: vol, mass: vol * GRANITE_DENSITY, bbox: bb, size,
    };
  });
}
