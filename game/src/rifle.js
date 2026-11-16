// Gun models: Minecraft voxel style, built from scratch in code — boxes only,
// flat pixel-textured materials, no downloaded models or textures. One builder
// for every gun in the game, so the player's view model and the rifle a bot
// carries are the same weapon. Origin at the receiver centre, -z forward.
// No hands: the viewmodel is the weapon (plus a plain blocky voxel arm where
// the reference shows one, attached in weapons.js, not here — bots must not
// get arms).
import * as THREE from 'three';
import { vbox, vmat, vflat } from './voxel.js';

// Palette (flat Minecraft colors).
const BLACK = '#1b1b1e';
const GUNMETAL = '#333336';
const DARK = '#4a4a4d';
const SILVER = '#c9c9c4';
const WHITE = '#e9e9e4';
const EMBER = '#ff7a1a';
const CYAN = '#2fd4cf';
const LENS = '#0d3a3a';
const LENS_CYAN = '#35e0d8';
const PURPLE = '#5b2d8e';
const DPURPLE = '#33185c';
const MAGENTA = '#d254e8';
const TAN = '#a5824f';
const BROWN = '#6e5230';
const DBROWN = '#4a351d';
const GRAY = '#707070';
const DGRAY = '#3c3c3c';
const BLUE = '#3a7bd5';

// kind: 'rifle' (VK-7, long) | 'smg' (Hornet-9, compact) | 'pistol' (P-9)
// | 'sniper' (Longshot-50, scoped bolt-action) | 'shotgun' (Breacher-12, pump)
// | 'heavy' (Mauler LMG, drum-fed). Returns { group, muzzleZ }.
export function buildGun(kind) {
  const group = new THREE.Group();
  let muzzleZ = -0.5;
  if (kind === 'rifle') {
    // VK-7 Ember, ref 3: white body, black parts, cyan accents, boxy scope
    // with a cyan lens.
    group.add(vbox(0.085, 0.10, 0.36, vmat(WHITE), 0, 0, 0));
    group.add(vbox(0.05, 0.018, 0.30, vmat(BLACK), 0, 0.058, -0.02));
    group.add(vbox(0.088, 0.014, 0.22, vmat(CYAN), 0, 0.015, -0.03));
    group.add(vbox(0.012, 0.03, 0.09, vmat(BLACK), 0.045, 0.005, 0.04));
    // Handguard with vent slots, blocky barrel, boxy muzzle brake.
    group.add(vbox(0.075, 0.075, 0.24, vmat(WHITE), 0, 0.005, -0.30));
    for (const z of [-0.24, -0.31, -0.38]) group.add(vbox(0.08, 0.014, 0.03, vmat(DARK), 0, 0.035, z));
    group.add(vbox(0.028, 0.028, 0.22, vmat(GUNMETAL), 0, 0.005, -0.48));
    group.add(vbox(0.042, 0.042, 0.08, vmat(BLACK), 0, 0.005, -0.62));
    group.add(vbox(0.02, 0.02, 0.012, vmat(DARK), 0, 0.005, -0.665));
    // Boxy scope: mount, tube, objective bell, cyan lens face, rear cap.
    group.add(vbox(0.04, 0.025, 0.10, vmat(BLACK), 0, 0.072, -0.04));
    group.add(vbox(0.045, 0.045, 0.17, vmat(WHITE), 0, 0.10, -0.04));
    group.add(vbox(0.06, 0.06, 0.05, vmat(BLACK), 0, 0.10, -0.13));
    group.add(vbox(0.05, 0.05, 0.006, vflat(LENS_CYAN), 0, 0.10, -0.157));
    group.add(vbox(0.05, 0.05, 0.03, vmat(BLACK), 0, 0.10, 0.05));
    // Big magazine, raked grip, vertical foregrip, skeletonised stock.
    group.add(vbox(0.055, 0.19, 0.095, vmat(BLACK), 0, -0.13, -0.03, 0.16));
    group.add(vbox(0.06, 0.018, 0.10, vmat(CYAN), 0, -0.225, -0.06, 0.16));
    group.add(vbox(0.05, 0.13, 0.045, vmat(BLACK), 0, -0.10, 0.13, -0.32));
    group.add(vbox(0.045, 0.085, 0.05, vmat(BLACK), 0, -0.075, -0.38, 0.18));
    group.add(vbox(0.045, 0.02, 0.20, vmat(WHITE), 0, 0.008, 0.28));
    group.add(vbox(0.045, 0.02, 0.20, vmat(WHITE), 0, -0.058, 0.28));
    group.add(vbox(0.05, 0.13, 0.025, vmat(CYAN), 0, -0.025, 0.385));
    group.add(vbox(0.04, 0.018, 0.12, vmat(BLACK), 0, 0.04, 0.30));
    group.add(vbox(0.012, 0.04, 0.015, vmat(BLACK), 0, -0.06, 0.06));
    muzzleZ = -0.67;
  } else if (kind === 'smg') {
    // Hornet-9, ref 2: purple body, dark purple shroud, magenta stripe,
    // aperture rear sight.
    group.add(vbox(0.08, 0.095, 0.28, vmat(PURPLE), 0, 0, 0));
    group.add(vbox(0.045, 0.016, 0.22, vmat(DPURPLE), 0, 0.055, 0));
    group.add(vbox(0.083, 0.012, 0.16, vmat(MAGENTA), 0, 0.012, 0));
    group.add(vbox(0.06, 0.06, 0.12, vmat(PURPLE), 0, 0.005, -0.20));
    group.add(vbox(0.028, 0.028, 0.10, vmat(GUNMETAL), 0, 0.005, -0.28));
    group.add(vbox(0.034, 0.034, 0.03, vmat(BLACK), 0, 0.005, -0.345));
    // Aperture rear sight: two posts + top bar; front post.
    group.add(vbox(0.008, 0.035, 0.008, vmat(DPURPLE), -0.014, 0.075, 0.06));
    group.add(vbox(0.008, 0.035, 0.008, vmat(DPURPLE), 0.014, 0.075, 0.06));
    group.add(vbox(0.036, 0.008, 0.008, vmat(DPURPLE), 0, 0.095, 0.06));
    group.add(vbox(0.008, 0.018, 0.008, vmat(MAGENTA), 0, 0.068, -0.14));
    group.add(vbox(0.05, 0.16, 0.07, vmat(DPURPLE), 0, -0.115, -0.01, 0.1));
    group.add(vbox(0.05, 0.12, 0.065, vmat(BLACK), 0, -0.095, 0.11, -0.3));
    group.add(vbox(0.04, 0.025, 0.15, vmat(PURPLE), 0, -0.01, 0.21));
    group.add(vbox(0.045, 0.07, 0.02, vmat(MAGENTA), 0, -0.01, 0.29));
    muzzleZ = -0.36;
  } else if (kind === 'sniper') {
    // Longshot-50, ref 5: tan body, big black scope, bolt handle, bipod.
    group.add(vbox(0.075, 0.095, 0.34, vmat(TAN), 0, 0, 0.02));
    group.add(vbox(0.045, 0.016, 0.28, vmat(BLACK), 0, 0.055, 0));
    group.add(vbox(0.078, 0.012, 0.20, vmat(BROWN), 0, 0.012, 0));
    group.add(vbox(0.06, 0.055, 0.10, vmat(GUNMETAL), 0, 0.005, -0.20));
    group.add(vbox(0.026, 0.026, 0.34, vmat(GUNMETAL), 0, 0.005, -0.42));
    group.add(vbox(0.04, 0.04, 0.08, vmat(BLACK), 0, 0.005, -0.62));
    group.add(vbox(0.02, 0.02, 0.012, vmat(DARK), 0, 0.005, -0.665));
    // Big scope: tall mount, long tube, wide objective bell, dark lens face.
    group.add(vbox(0.04, 0.03, 0.09, vmat(BLACK), 0, 0.075, -0.02));
    group.add(vbox(0.05, 0.05, 0.22, vmat(BLACK), 0, 0.11, -0.02));
    group.add(vbox(0.075, 0.075, 0.06, vmat(BLACK), 0, 0.11, -0.14));
    group.add(vbox(0.06, 0.06, 0.006, vflat(LENS), 0, 0.11, -0.172));
    group.add(vbox(0.055, 0.055, 0.035, vmat(BLACK), 0, 0.11, 0.08));
    group.add(vbox(0.02, 0.02, 0.02, vmat(GUNMETAL), 0, 0.14, -0.02));
    group.add(vbox(0.02, 0.02, 0.02, vmat(GUNMETAL), 0.035, 0.11, -0.02));
    // Bolt handle sticking out the right side, small box mag, bipod legs.
    group.add(vbox(0.05, 0.012, 0.012, vmat(GUNMETAL), 0.055, -0.01, 0.02));
    group.add(vbox(0.012, 0.05, 0.012, vmat(BLACK), 0.078, -0.03, 0.02));
    group.add(vbox(0.05, 0.15, 0.08, vmat(BLACK), 0, -0.115, -0.01, 0.1));
    group.add(vbox(0.05, 0.12, 0.045, vmat(BLACK), 0, -0.095, 0.11, -0.3));
    group.add(vbox(0.012, 0.16, 0.012, vmat(GUNMETAL), -0.03, -0.10, -0.30, 0.5));
    group.add(vbox(0.012, 0.16, 0.012, vmat(GUNMETAL), 0.03, -0.10, -0.30, -0.5));
    group.add(vbox(0.045, 0.02, 0.22, vmat(TAN), 0, 0.008, 0.30));
    group.add(vbox(0.045, 0.02, 0.22, vmat(TAN), 0, -0.058, 0.30));
    group.add(vbox(0.05, 0.12, 0.025, vmat(BROWN), 0, -0.025, 0.40));
    muzzleZ = -0.67;
  } else if (kind === 'shotgun') {
    // Breacher-12, ref 4: tan/brown long gun, ribbed barrel, iron sights
    // (front post + rear aperture), pump grip, tube mag.
    group.add(vbox(0.09, 0.10, 0.30, vmat(BROWN), 0, 0, 0));
    group.add(vbox(0.05, 0.018, 0.26, vmat(TAN), 0, 0.058, -0.02));
    for (const z of [-0.06, -0.10, -0.14]) group.add(vbox(0.052, 0.008, 0.012, vmat(DBROWN), 0, 0.068, z));
    group.add(vbox(0.035, 0.035, 0.32, vmat(GUNMETAL), 0, 0.01, -0.30));
    group.add(vbox(0.045, 0.045, 0.03, vmat(BLACK), 0, 0.01, -0.47));
    // Pump: wide ribbed grip sliding under the barrel + bead sight.
    group.add(vbox(0.07, 0.05, 0.16, vmat(DBROWN), 0, -0.035, -0.28));
    group.add(vbox(0.072, 0.012, 0.16, vmat(TAN), 0, -0.062, -0.28));
    group.add(vbox(0.008, 0.02, 0.008, vmat(EMBER), 0, 0.075, -0.44));
    // Rear aperture sight: two posts + top bar.
    group.add(vbox(0.008, 0.035, 0.008, vmat(BROWN), -0.014, 0.075, 0.02));
    group.add(vbox(0.008, 0.035, 0.008, vmat(BROWN), 0.014, 0.075, 0.02));
    group.add(vbox(0.036, 0.008, 0.008, vmat(BROWN), 0, 0.095, 0.02));
    // Tube mag under the barrel, shell saddle on the side, stock.
    group.add(vbox(0.03, 0.03, 0.26, vmat(SILVER), 0, -0.045, -0.28));
    group.add(vbox(0.012, 0.05, 0.12, vmat(TAN), 0.048, -0.01, 0.02));
    group.add(vbox(0.05, 0.13, 0.06, vmat(DBROWN), 0, -0.10, 0.11, -0.3));
    group.add(vbox(0.05, 0.10, 0.12, vmat(BROWN), 0, -0.03, 0.26));
    group.add(vbox(0.05, 0.12, 0.02, vmat(BLACK), 0, -0.03, 0.325));
    muzzleZ = -0.49;
  } else if (kind === 'heavy') {
    // Mauler LMG, ref 6: bulky gray receiver, boxy drum mag, carry handle,
    // bipod legs, long shroud.
    group.add(vbox(0.10, 0.11, 0.38, vmat(GRAY), 0, 0, 0));
    group.add(vbox(0.055, 0.018, 0.30, vmat(DGRAY), 0, 0.062, -0.02));
    group.add(vbox(0.103, 0.014, 0.24, vmat(BLUE), 0, 0.014, -0.02));
    group.add(vbox(0.07, 0.06, 0.14, vmat(DGRAY), 0, 0.005, -0.22));
    group.add(vbox(0.03, 0.03, 0.20, vmat(GUNMETAL), 0, 0.005, -0.40));
    group.add(vbox(0.045, 0.045, 0.05, vmat(BLACK), 0, 0.005, -0.52));
    // Carry handle on top, big boxy drum magazine underneath, bipod legs.
    group.add(vbox(0.03, 0.025, 0.22, vmat(DGRAY), 0, 0.085, -0.05));
    group.add(vbox(0.02, 0.03, 0.03, vmat(DGRAY), 0, 0.10, -0.14));
    group.add(vbox(0.02, 0.03, 0.03, vmat(DGRAY), 0, 0.10, 0.04));
    group.add(vbox(0.11, 0.11, 0.06, vmat(DGRAY), 0, -0.11, -0.02));
    group.add(vbox(0.112, 0.02, 0.062, vmat(BLUE), 0, -0.11, -0.02));
    group.add(vbox(0.012, 0.15, 0.012, vmat(GUNMETAL), -0.035, -0.11, -0.34, 0.45));
    group.add(vbox(0.012, 0.15, 0.012, vmat(GUNMETAL), 0.035, -0.11, -0.34, -0.45));
    group.add(vbox(0.05, 0.13, 0.045, vmat(BLACK), 0, -0.10, 0.13, -0.3));
    group.add(vbox(0.045, 0.02, 0.20, vmat(GRAY), 0, 0.008, 0.30));
    group.add(vbox(0.045, 0.02, 0.20, vmat(GRAY), 0, -0.058, 0.30));
    group.add(vbox(0.05, 0.13, 0.025, vmat(BLUE), 0, -0.025, 0.40));
    muzzleZ = -0.55;
  } else {
    // P-9 sidearm, ref 1: chunky black slide with serrations, small rear
    // sight, raked grip, trigger guard.
    group.add(vbox(0.06, 0.055, 0.26, vmat(BLACK), 0, 0.02, -0.03));
    for (const z of [0.03, 0.05, 0.07]) group.add(vbox(0.064, 0.03, 0.008, vmat(DARK), 0, 0.02, z));
    group.add(vbox(0.02, 0.015, 0.012, vmat(DARK), -0.016, 0.055, 0.085));
    group.add(vbox(0.02, 0.015, 0.012, vmat(DARK), 0.016, 0.055, 0.085));
    group.add(vbox(0.008, 0.012, 0.008, vmat(DARK), 0, 0.052, -0.15));
    group.add(vbox(0.03, 0.03, 0.02, vmat(DARK), 0, 0.02, -0.165));
    group.add(vbox(0.055, 0.05, 0.22, vmat(GUNMETAL), 0, -0.025, -0.01));
    group.add(vbox(0.052, 0.13, 0.07, vmat(BLACK), 0, -0.10, 0.06, -0.22));
    group.add(vbox(0.05, 0.012, 0.06, vmat(GUNMETAL), 0, -0.055, -0.03));
    group.add(vbox(0.008, 0.02, 0.01, vmat(EMBER), 0, 0.05, -0.12));
    group.add(vbox(0.03, 0.015, 0.01, vmat(GUNMETAL), 0, 0.05, 0.08));
    muzzleZ = -0.17;
  }
  return { group, muzzleZ };
}
