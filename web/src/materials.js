// Materials: procedural granite, moulded-plastic bricks, and the two grounds.
import * as THREE from 'three';

const NOISE = /* glsl */ `
float dbHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float dbNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dbHash(i), dbHash(i + vec3(1,0,0)), f.x), mix(dbHash(i + vec3(0,1,0)), dbHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dbHash(i + vec3(0,0,1)), dbHash(i + vec3(1,0,1)), f.x), mix(dbHash(i + vec3(0,1,1)), dbHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float dbFbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * dbNoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
`;

// White Bulguksa granite: fine speckle (mica / feldspar), soft blotches,
// rain streaks and lichen that thickens toward the ground. Driven by the
// object-space position, so the pattern stays glued to a stone as it moves.
export function makeGranite({ tint = 0xc3c0b8, seed = 0 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0, side: THREE.DoubleSide });
  const uniforms = { uStone: { value: new THREE.Color(tint) }, uSeed: { value: seed } };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vObjP;\nuniform vec3 uStone;\nuniform float uSeed;\n${NOISE}`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        {
          vec3 p = vObjP + vec3(uSeed * 3.1, 0.0, uSeed * 1.7);
          float aa = clamp(1.4 - length(fwidth(p * 48.0)) * 1.2, 0.0, 1.0);
          float n1 = dbNoise(p * 48.0);
          float n2 = dbNoise(p * 21.0 + 11.3);
          float n3 = dbFbm(p * 2.7);
          float low = 1.0 - smoothstep(0.0, 4.5, vObjP.y);
          vec3 c = uStone * (0.9 + 0.2 * n3);
          c = mix(c, uStone * 1.1, smoothstep(0.64, 0.8, n2) * 0.55 * aa);
          c = mix(c, vec3(0.16, 0.15, 0.14), smoothstep(0.74, 0.84, n1) * 0.7 * aa);
          float blot = smoothstep(0.48, 0.78, dbFbm(p * 0.8 + 3.0));
          c *= 1.0 - 0.16 * blot - 0.12 * low;
          float lich = smoothstep(0.6, 0.74, dbNoise(p * 4.2 + 7.0)) * (0.3 + 0.7 * low);
          c = mix(c, vec3(0.42, 0.45, 0.36), lich * 0.42);
          float streak = smoothstep(0.55, 0.92, dbNoise(vec3(p.x * 9.0, p.y * 0.6, p.z * 9.0)));
          c *= 1.0 - 0.1 * streak;
          diffuseColor.rgb *= c;
        }`);
  };
  mat.customProgramCacheKey = () => 'db-granite';
  return mat;
}

// Moulded ABS: crisp dark seams at every brick edge. Instances are unit cubes
// scaled per brick, so the seam width is computed in scaled local space.
export function makeBrick() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBoxP;\nvarying vec3 vBoxS;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vBoxS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vBoxP = position * vBoxS;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBoxP;\nvarying vec3 vBoxS;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 q = vBoxS * 0.5 - abs(vBoxP);
          float m1 = min(q.x, min(q.y, q.z));
          float m3 = max(q.x, max(q.y, q.z));
          float m2 = q.x + q.y + q.z - m1 - m3;
          float seam = 1.0 - smoothstep(0.0015, 0.006, m2);
          diffuseColor.rgb *= 1.0 - 0.45 * seam;
        }`);
  };
  mat.customProgramCacheKey = () => 'db-brick';
  return mat;
}

export function makeStud() {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0 });
}

const GROUND_COMMON = /* glsl */ `
varying vec3 vWorldP;
float dbGrid(vec2 p, float s, float th) {
  vec2 d = abs(fract(p / s + 0.5) - 0.5) * s;
  vec2 fw = fwidth(p);
  vec2 l = 1.0 - smoothstep(vec2(th), vec2(th) + fw * 1.5, d);
  return max(l.x, l.y);
}
`;

function groundVertex(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
}

// Survey ground: dark tamped earth with a glowing 1 m / 5 m survey grid.
export function makeSurveyGround() {
  const uniforms = { uLine: { value: new THREE.Color(0x8fb3a4) }, uLine2: { value: new THREE.Color(0xe0a458) } };
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a2e31, roughness: 0.97, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    groundVertex(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uLine;\nuniform vec3 uLine2;\n${GROUND_COMMON}\n${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= 0.82 + 0.3 * dbFbm(vec3(vWorldP.xz * 0.6, 1.0));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float r = length(vWorldP.xz);
          float fade = 1.0 - smoothstep(16.0, 42.0, r);
          float g = dbGrid(vWorldP.xz, 1.0, 0.006) * 0.16 + dbGrid(vWorldP.xz, 5.0, 0.012) * 0.34;
          float axis = (1.0 - smoothstep(0.0, 0.02 + fwidth(vWorldP.x) * 1.5, abs(vWorldP.x))) + (1.0 - smoothstep(0.0, 0.02 + fwidth(vWorldP.z) * 1.5, abs(vWorldP.z)));
          totalEmissiveRadiance += uLine * g * fade * 0.3 + uLine2 * clamp(axis, 0.0, 1.0) * fade * 0.12;
        }`);
  };
  mat.customProgramCacheKey = () => 'db-survey-ground';
  return mat;
}

// Brick ground: a green baseplate with studs that fade out once they get
// smaller than a couple of pixels (no moiré).
export function makeBaseplate(pitch = 0.08) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x958a73, roughness: 0.42, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    groundVertex(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n#define PITCH ${pitch.toFixed(4)}\n${GROUND_COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 c = vWorldP.xz / PITCH;
          vec2 f = fract(c) - 0.5;
          float r = length(f);
          float fw = length(fwidth(c));
          float vis = 1.0 - smoothstep(0.12, 0.35, fw);
          float top = 1.0 - smoothstep(0.27 - fw, 0.27 + fw, r);
          float rim = smoothstep(0.24, 0.3, r) * (1.0 - smoothstep(0.3, 0.38, r));
          float side = clamp(0.5 + (f.x - f.y), 0.0, 1.0);
          diffuseColor.rgb *= 1.0 + vis * (top * 0.08 - rim * (0.12 + 0.18 * side));
          float plate = dbGrid(vWorldP.xz, PITCH * 32.0, 0.004);
          diffuseColor.rgb *= 1.0 - plate * 0.25 * vis;
        }`);
  };
  mat.customProgramCacheKey = () => 'db-baseplate';
  return mat;
}
