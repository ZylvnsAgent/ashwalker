// Voxel helpers: Minecraft-style blocky parts built from scratch in code.
// No downloaded models or textures — every material is a flat color with a
// canvas-generated 16x16 pixel-noise (or checker) texture, NearestFilter, so
// it reads as chunky pixels like Minecraft. All guns are boxes only.
import * as THREE from 'three';

// Deterministic per-color PRNG so a color's noise pattern is stable.
function rngFor(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function colorSeed(hex) {
  let h = 0;
  const str = String(hex);
  for (let i = 0; i < str.length; i += 1) h = ((h * 31 + str.charCodeAt(i)) >>> 0);
  return h || 1;
}

const texCache = new Map();
function voxelTexture(hex, pattern = 'noise') {
  const key = `${hex}|${pattern}`;
  if (texCache.has(key)) return texCache.get(key);
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const base = new THREE.Color(hex);
  const rng = rngFor(colorSeed(key));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const c = base.clone();
      if (pattern === 'checker') {
        // 4x4-pixel checks, alternating base / darkened.
        const check = ((x >> 2) + (y >> 2)) % 2 === 0;
        if (!check) c.multiplyScalar(0.55);
        else c.multiplyScalar(1.0 + (rng() - 0.5) * 0.08);
      } else {
        // Minecraft-style speckle: mostly base, some pixels darker/lighter.
        const r = rng();
        if (r < 0.14) c.multiplyScalar(0.82);
        else if (r > 0.92) c.multiplyScalar(1.12);
        else c.multiplyScalar(1.0 + (rng() - 0.5) * 0.06);
      }
      ctx.fillStyle = `#${c.getHexString()}`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

const matCache = new Map();
// Flat matte Minecraft material for a color. `pattern` is 'noise' or 'checker'.
export function vmat(hex, pattern = 'noise') {
  const key = `${hex}|${pattern}`;
  if (matCache.has(key)) return matCache.get(key);
  const mat = new THREE.MeshStandardMaterial({
    map: voxelTexture(hex, pattern),
    roughness: 0.85,
    metalness: 0.05,
  });
  matCache.set(key, mat);
  return mat;
}

// Unlit flat face (scope lenses, glowing dots): reads as a solid pixel block.
export function vflat(hex) {
  const key = `flat|${hex}`;
  if (matCache.has(key)) return matCache.get(key);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex) });
  matCache.set(key, mat);
  return mat;
}

// One box part. rx = rotation.x (rake), rz = rotation.z (roll).
export function vbox(w, h, d, mat, x, y, z, rx = 0, rz = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  if (rx) mesh.rotation.x = rx;
  if (rz) mesh.rotation.z = rz;
  return mesh;
}

// Plain voxel arm: a single chunky block (Minecraft arm, no fingers, no
// glove) angled from the bottom of the frame up to the grip. `opts`:
// { color, pattern, size:[w,h,d], pos:[x,y,z], rot:[rx,ry,rz] }.
export function voxelArm(opts = {}) {
  const {
    color = '#3d423a', pattern = 'noise',
    size = [0.08, 0.30, 0.08], pos = [0.02, -0.27, 0.16], rot = [0.5, 0, -0.2],
  } = opts;
  const arm = new THREE.Group();
  const block = vbox(size[0], size[1], size[2], vmat(color, pattern), 0, 0, 0);
  arm.add(block);
  arm.position.set(pos[0], pos[1], pos[2]);
  arm.rotation.set(rot[0], rot[1], rot[2]);
  return arm;
}
