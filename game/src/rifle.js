// Gun models: one builder for every rifle in the game, so the player's view model
// and the rifle a bot carries are the same weapon. Two-tone like the reference
// (a sleek sci-fi rifle): light silver faceted body, dark gunmetal, ember-orange
// accents. Built from primitives only; origin at the receiver centre, -z forward.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const silver = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.35, metalness: 0.55 });
const gunmetal = new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: 0.45, metalness: 0.6 });
const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85, metalness: 0.1 });
const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.25 });
const glass = new THREE.MeshBasicMaterial({ color: 0x0d2a26 });

function box(w, h, d, mat, x, y, z, rx = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  if (rx) mesh.rotation.x = rx;
  return mesh;
}

function tube(r, len, mat, x, y, z, seg = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  mesh.rotation.x = Math.PI / 2; // cylinder axis Y -> along Z
  mesh.position.set(x, y, z);
  return mesh;
}

// kind: 'rifle' (VK-7, long) | 'smg' (Hornet-9, compact) | 'pistol' (P-9).
// Returns { group, muzzleZ } with muzzleZ the local z of the muzzle tip.
export function buildGun(kind) {
  const group = new THREE.Group();
  let muzzleZ = -0.5;
  if (kind === 'rifle') {
    // Long faceted receiver, top rail, orange side stripe, ejection port.
    group.add(box(0.085, 0.10, 0.36, silver, 0, 0, 0));
    group.add(box(0.05, 0.018, 0.30, gunmetal, 0, 0.058, -0.02));
    group.add(box(0.088, 0.014, 0.22, accent, 0, 0.015, -0.03));
    group.add(box(0.012, 0.03, 0.09, gunmetal, 0.045, 0.005, 0.04));
    // Handguard with vent slots, long barrel, vented suppressor.
    group.add(box(0.075, 0.075, 0.24, silver, 0, 0.005, -0.30));
    for (const z of [-0.24, -0.31, -0.38]) group.add(box(0.08, 0.014, 0.03, dark, 0, 0.035, z));
    group.add(tube(0.016, 0.24, gunmetal, 0, 0.005, -0.50, 8));
    group.add(tube(0.032, 0.14, gunmetal, 0, 0.005, -0.66, 12));
    group.add(tube(0.035, 0.012, dark, 0, 0.005, -0.61, 12));
    group.add(tube(0.035, 0.012, dark, 0, 0.005, -0.70, 12));
    // Scope: mount, tube, objective bell, dark lens, rear cap.
    group.add(box(0.04, 0.025, 0.10, gunmetal, 0, 0.072, -0.04));
    group.add(tube(0.024, 0.17, silver, 0, 0.10, -0.04, 12));
    group.add(tube(0.033, 0.045, gunmetal, 0, 0.10, -0.13, 12));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.028, 16), glass);
    lens.position.set(0, 0.10, -0.154);
    lens.rotation.y = Math.PI;
    group.add(lens);
    group.add(tube(0.028, 0.03, gunmetal, 0, 0.10, 0.05, 12));
    // Big magazine, raked grip, vertical foregrip, skeletonised stock.
    group.add(box(0.055, 0.19, 0.095, gunmetal, 0, -0.13, -0.03, 0.16));
    group.add(box(0.06, 0.018, 0.10, accent, 0, -0.225, -0.06, 0.16));
    group.add(box(0.05, 0.13, 0.07, dark, 0, -0.10, 0.13, -0.32));
    group.add(box(0.045, 0.085, 0.05, dark, 0, -0.075, -0.38, 0.18));
    group.add(box(0.045, 0.02, 0.20, silver, 0, 0.008, 0.28));
    group.add(box(0.045, 0.02, 0.20, silver, 0, -0.058, 0.28));
    group.add(box(0.05, 0.13, 0.025, accent, 0, -0.025, 0.385));
    group.add(box(0.04, 0.018, 0.12, gunmetal, 0, 0.04, 0.30));
    group.add(box(0.012, 0.04, 0.015, gunmetal, 0, -0.06, 0.06));
    muzzleZ = -0.73;
  } else if (kind === 'smg') {
    group.add(box(0.08, 0.095, 0.28, silver, 0, 0, 0));
    group.add(box(0.045, 0.016, 0.22, gunmetal, 0, 0.055, 0));
    group.add(box(0.083, 0.012, 0.16, accent, 0, 0.012, 0));
    group.add(box(0.06, 0.06, 0.12, silver, 0, 0.005, -0.20));
    group.add(tube(0.014, 0.10, gunmetal, 0, 0.005, -0.28, 8));
    group.add(tube(0.024, 0.05, dark, 0, 0.005, -0.33, 8));
    // Red-dot sight: base, housing, glowing dot.
    group.add(box(0.03, 0.02, 0.06, gunmetal, 0, 0.065, -0.02));
    group.add(box(0.035, 0.035, 0.03, gunmetal, 0, 0.09, -0.02));
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.011, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }));
    dot.position.set(0, 0.09, -0.037);
    dot.rotation.y = Math.PI;
    group.add(dot);
    group.add(box(0.05, 0.16, 0.07, gunmetal, 0, -0.115, -0.01, 0.1));
    group.add(box(0.05, 0.12, 0.065, dark, 0, -0.095, 0.11, -0.3));
    group.add(box(0.04, 0.025, 0.15, silver, 0, -0.01, 0.21));
    group.add(box(0.045, 0.07, 0.02, accent, 0, -0.01, 0.29));
    muzzleZ = -0.355;
  } else {
    // P-9 sidearm: silver slide, orange stripe, dark grip, trigger guard.
    group.add(box(0.058, 0.055, 0.22, silver, 0, 0.015, -0.02));
    group.add(box(0.06, 0.012, 0.16, accent, 0, 0.03, -0.02));
    group.add(tube(0.012, 0.03, gunmetal, 0, 0.015, -0.14, 8));
    group.add(box(0.05, 0.05, 0.18, gunmetal, 0, -0.03, 0));
    group.add(box(0.052, 0.13, 0.07, dark, 0, -0.10, 0.06, -0.22));
    group.add(box(0.05, 0.012, 0.055, gunmetal, 0, -0.055, -0.03));
    group.add(box(0.008, 0.02, 0.01, accent, 0, 0.05, -0.12));
    group.add(box(0.03, 0.015, 0.01, gunmetal, 0, 0.05, 0.08));
    muzzleZ = -0.155;
  }
  return { group, muzzleZ };
}
