// Weapons: three guns and a frag grenade. Each gun owns its numbers (damage, headshot
// multiplier, fire gap, magazine, reload, spread, recoil, price) and its view model.
// Ammo is kept per weapon so switching preserves the magazine. Grenades fly on a
// simple arc, bounce once, then explode; main.js applies the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { buildGun } from './rifle.js';
import { createTextures } from './textures.js';
import { voxelArm } from './voxel.js';

export const WEAPONS = [
  { id: 'pistol', name: 'P-9 Sidearm', price: 0, damage: 26, headMult: 4, gap: 0.16, auto: false, mag: 12, reserve: 48, reload: 1.4, spreadStill: 0.004, spreadMove: 0.02, recoil: 0.006, range: 60 },
  { id: 'smg', name: 'Hornet-9', price: 1500, damage: 22, headMult: 4, gap: 0.07, auto: true, mag: 25, reserve: 100, reload: 1.7, spreadStill: 0.006, spreadMove: 0.034, recoil: 0.005, range: 45 },
  { id: 'rifle', name: 'VK-7 Ember', price: 2900, damage: 34, headMult: 4, gap: 0.096, auto: true, mag: 30, reserve: 90, reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028, recoil: 0.009, range: 80 },
  { id: 'sniper', name: 'Longshot-50', price: 4500, damage: 95, headMult: 4, gap: 1.1, auto: false, mag: 5, reserve: 15, reload: 3.0, spreadStill: 0.0008, spreadMove: 0.06, recoil: 0.02, range: 120 },
  { id: 'shotgun', name: 'Breacher-12', price: 1600, damage: 9, headMult: 2, gap: 0.9, auto: false, mag: 6, reserve: 24, reload: 2.6, spreadStill: 0.02, spreadMove: 0.05, recoil: 0.016, range: 25, pellets: 8, stat: '8×9 dmg · 6 rnd' },
  { id: 'heavy', name: 'Mauler LMG', price: 3200, damage: 26, headMult: 4, gap: 0.11, auto: true, mag: 60, reserve: 120, reload: 3.2, spreadStill: 0.008, spreadMove: 0.04, recoil: 0.007, range: 60 },
];
export const FRAG = { id: 'frag', name: 'Frag Grenade', price: 300, radius: 5.5, maxDamage: 120, fuse: 1.6 };
// Shields: bought per round (reset on round start), absorb damage before HP.
// Buy keys 8 (light) / 9 (heavy) — the first free digits after the weapon keys.
export const SHIELDS = [
  { id: 'shield-light', name: 'Light Shield', price: 400, value: 25, key: '8' },
  { id: 'shield-heavy', name: 'Heavy Shield', price: 1000, value: 50, key: '9' },
];
// Switch/buy keys per weapon index: 4 is the frag, so the new guns take 5-7.
export const SWITCH_KEY = ['1', '2', '3', '5', '6', '7'];

const GRENADE_GRAVITY = 12;
const MUZZLE_TIME = 0.06;

function gunModel(def) {
  const { group, muzzleZ } = buildGun(def.id);
  // Slight yaw so the side profile (not just the flat top) faces the camera.
  group.rotation.y = 0.10;
  const model = new THREE.Group();
  model.add(group);
  // Plain voxel arm (Minecraft style: one chunky block, no fingers, no
  // glove) where the reference shows one — the realistic gloved hand is
  // GONE from every weapon (user order 2026-11-16). Sleeve color/angle
  // follows each ref: pistol gray checker (big, prominent), SMG/rifle/
  // shotgun dark olive, sniper light checker from the bottom-left,
  // LMG a small blue sliver at the frame edge.
  const ARM = {
    pistol: { color: '#8f959c', pattern: 'checker', size: [0.09, 0.34, 0.09], pos: [0.03, -0.24, 0.13], rot: [-0.55, 0, -0.25] },
    smg: { color: '#3d423a', size: [0.08, 0.30, 0.08], pos: [0.03, -0.23, 0.20], rot: [-0.5, 0, -0.2] },
    rifle: { color: '#3d423a', size: [0.08, 0.30, 0.08], pos: [0.03, -0.23, 0.20], rot: [-0.5, 0, -0.2] },
    sniper: { color: '#d9d9d9', pattern: 'checker', size: [0.09, 0.32, 0.09], pos: [-0.03, -0.23, 0.20], rot: [-0.5, 0, 0.3] },
    shotgun: { color: '#3d423a', size: [0.08, 0.28, 0.08], pos: [0.03, -0.23, 0.19], rot: [-0.5, 0, -0.2] },
    heavy: { color: '#3a6fd8', size: [0.08, 0.26, 0.08], pos: [0.06, -0.23, 0.19], rot: [-0.5, 0, -0.35] },
  };
  model.add(voxelArm(ARM[def.id]));
  // Per-weapon FPP framing, matched to the refs: pistol big and central
  // (ref 1), shotgun further right (ref 4), sniper rolled diagonal like
  // ref 5, LMG + sniper pulled back (z -0.62, lower) so big guns don't
  // read as floating.
  const VIEW_POS = {
    pistol: [0.22, -0.06, -0.50],
    smg: [0.24, -0.06, -0.46],
    rifle: [0.24, -0.06, -0.46],
    sniper: [0.22, -0.08, -0.68],
    shotgun: [0.23, -0.06, -0.46],
    heavy: [0.24, -0.09, -0.62],
  };
  const basePos = new THREE.Vector3(...VIEW_POS[def.id]);
  model.position.copy(basePos);
  if (def.id === 'sniper') model.rotation.z = 0.30; // diagonal hold, ref 5
  model.visible = false;
  model.userData.muzzleZ = muzzleZ;
  model.userData.gunGroup = group;
  model.userData.basePos = basePos;
  return model;
}

export function createWeapons(camera) {
  const models = WEAPONS.map((def) => {
    const model = gunModel(def);
    camera.add(model);
    return model;
  });
  // No hands anywhere (user order 2026-11-16): the realistic gloved hand
  // is removed from every weapon. The viewmodel is the voxel gun plus a
  // plain blocky voxel arm where the ref shows one.
  // Muzzle flash: a three-plane star burst (face-on star + vertical + horizontal
  // blades) with a hot core, so the flash reads from any angle instead of one
  // small plane. The light flickers per shot; both die with state.flash.
  const flashTex = createTextures().flash;
  const flashMat = new THREE.MeshBasicMaterial({
    map: flashTex, color: new THREE.Color('#ffb066'), transparent: true, opacity: 0.95,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const flashGroup = new THREE.Group();
  const flashPlanes = [];
  const flashFace = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), flashMat);
  flashPlanes.push(flashFace);
  const flashVert = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.16), flashMat);
  flashVert.rotation.y = Math.PI / 2;
  flashPlanes.push(flashVert);
  const flashHoriz = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.16), flashMat);
  flashHoriz.rotation.x = Math.PI / 2;
  flashPlanes.push(flashHoriz);
  for (const plane of flashPlanes) flashGroup.add(plane);
  flashGroup.position.set(0.24, -0.18, -0.95);
  flashGroup.visible = false;
  camera.add(flashGroup);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 7);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  // Shell casings: a fixed pool of small brass boxes, ejected on every shot
  // with gravity and one bounce. Preallocated; recycled round-robin.
  const CASINGS = 20;
  const casingGeo = new THREE.BoxGeometry(0.014, 0.014, 0.034);
  const casingMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c8a24a'), roughness: 0.35, metalness: 0.8 });
  const casings = [];
  for (let i = 0; i < CASINGS; i += 1) {
    const mesh = new THREE.Mesh(casingGeo, casingMat);
    mesh.visible = false;
    camera.parent.add(mesh);
    casings.push({ mesh, vel: new THREE.Vector3(), life: 0 });
  }
  let casingNext = 0;
  const _fwd = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _eject = new THREE.Vector3();

  const ammo = WEAPONS.map((def) => ({ mag: def.mag, reserve: def.reserve }));
  const owned = WEAPONS.map((def, i) => i === 0); // pistol owned, the rest bought
  let current = 0;
  let frags = 0;
  const state = { cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, switching: 0 };
  let flashSpin = 0;
  const grenades = []; // {pos, vel, fuse, bounced}
  const grenadeMeshes = [];
  const grenadeGeometry = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.enemy), roughness: 0.5, metalness: 0.4 });

  function def() {
    return WEAPONS[current];
  }

  function showModel() {
    models.forEach((model, i) => { model.visible = i === current; });
    // Muzzle flash + light sit at the current gun's muzzle, not a fixed point.
    // The view model is yawed 0.10, so the muzzle tip sits slightly left of the
    // gun's origin: x = baseX + muzzleZ*sin(0.10), z = baseZ + muzzleZ*cos(0.10).
    const mz = models[current].userData.muzzleZ;
    const bp = models[current].userData.basePos;
    const fx = bp.x + mz * Math.sin(0.10);
    const fz = bp.z + mz * Math.cos(0.10);
    flashGroup.position.set(fx, -0.18, fz);
    flashLight.position.set(fx, -0.16, fz + 0.12);
  }
  showModel();

  return {
    state,
    grenades,
    def,
    owned,
    current() { return current; },
    hideAll() { models.forEach((model) => { model.visible = false; }); },
    frags() { return frags; },
    ammo() { return ammo[current]; },
    ammoOf(index) { return ammo[index]; },
    step(dt, onExplode) {
      state.cooldown = Math.max(0, state.cooldown - dt);
      state.flash = Math.max(0, state.flash - dt);
      state.kick += (0 - state.kick) * Math.min(1, dt * 14);
      state.switching = Math.max(0, state.switching - dt);
      const model = models[current];
      model.position.z = model.userData.basePos.z + state.kick;
      model.rotation.x = state.kick * 2.2 + (state.switching > 0 ? -0.4 * state.switching : 0);
      flashGroup.visible = state.flash > 0;
      if (state.flash > 0) {
        // The face star spins fast; the light flickers hard while it burns.
        // Kept modest (8–13): the old 20–34 washed the whole viewmodel
        // yellow-white on the frozen flash frame.
        flashFace.rotation.z = flashSpin + state.flash * 40;
        flashLight.intensity = 8 + Math.random() * 5;
      } else flashLight.intensity = 0;
      for (const c of casings) {
        if (c.life <= 0) continue;
        c.life -= dt;
        if (c.life <= 0) { c.mesh.visible = false; continue; }
        c.vel.y -= 9.8 * dt;
        c.mesh.position.addScaledVector(c.vel, dt);
        if (c.mesh.position.y > 0.02) {
          c.mesh.rotation.x += dt * 9;
          c.mesh.rotation.z += dt * 7;
        }
        if (c.mesh.position.y < 0.015) {
          c.mesh.position.y = 0.015;
          c.vel.y = 0;
          c.vel.x *= 0.6;
          c.vel.z *= 0.6;
        }
      }
      if (state.reloadLeft > 0) {
        state.reloadLeft = Math.max(0, state.reloadLeft - dt);
        model.rotation.x = -0.55 * Math.min(1, (def().reload - state.reloadLeft) * 2);
        if (state.reloadLeft === 0) {
          const need = def().mag - ammo[current].mag;
          const take = Math.min(need, ammo[current].reserve);
          ammo[current].mag += take;
          ammo[current].reserve -= take;
        }
      }
      // Grenade flight: gravity, one bounce, fuse.
      for (let i = grenades.length - 1; i >= 0; i -= 1) {
        const g = grenades[i];
        g.fuse -= dt;
        g.vel.y -= GRENADE_GRAVITY * dt;
        g.pos.addScaledVector(g.vel, dt);
        if (g.pos.y < 0.09) {
          g.pos.y = 0.09;
          if (!g.bounced) { g.vel.y = Math.abs(g.vel.y) * 0.35; g.vel.x *= 0.6; g.vel.z *= 0.6; g.bounced = true; }
          else { g.vel.y = 0; g.vel.x *= 0.8; g.vel.z *= 0.8; }
        }
        grenadeMeshes[i].position.copy(g.pos);
        if (g.fuse <= 0) {
          const pos = g.pos.clone();
          grenades.splice(i, 1);
          const mesh = grenadeMeshes.splice(i, 1)[0];
          camera.parent.remove(mesh);
          onExplode(pos);
        }
      }
    },
    ready() {
      return ammo[current].mag > 0 && state.cooldown === 0 && state.reloadLeft === 0 && state.switching === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.055;
      flashSpin = Math.random() * Math.PI;
      flashGroup.scale.setScalar(0.85 + Math.random() * 0.4);
      // Eject a casing from the gun's ejection port: up and to the right.
      const c = casings[casingNext];
      casingNext = (casingNext + 1) % CASINGS;
      camera.getWorldPosition(_eject);
      camera.getWorldDirection(_fwd);
      _right.crossVectors(_fwd, camera.up).normalize();
      _eject.addScaledVector(_fwd, 0.35).addScaledVector(_right, 0.28);
      _eject.y -= 0.1;
      c.mesh.position.copy(_eject);
      c.mesh.visible = true;
      c.vel.copy(_right).multiplyScalar(1 + Math.random() * 0.7);
      c.vel.y = 1.4 + Math.random() * 0.8;
      c.vel.addScaledVector(_fwd, -0.4);
      c.life = 1.6;
    },
    takeRound() {
      if (ammo[current].mag <= 0) return false;
      ammo[current].mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || ammo[current].mag === def().mag || ammo[current].reserve === 0) return;
      state.reloadLeft = def().reload;
    },
    spread(speed) {
      const d = def();
      return d.spreadStill + Math.min(1, speed / 5.2) * d.spreadMove;
    },
    switchTo(index) {
      if (index === current || !owned[index] || state.reloadLeft > 0) return false;
      current = index;
      state.switching = 0.28;
      state.cooldown = Math.max(state.cooldown, 0.28);
      showModel();
      return true;
    },
    buy(index) {
      if (owned[index]) return false;
      owned[index] = true;
      ammo[index] = { mag: WEAPONS[index].mag, reserve: WEAPONS[index].reserve };
      return true;
    },
    buyFrag() {
      frags += 1;
      return true;
    },
    throwFrag(origin, direction) {
      if (frags <= 0) return false;
      frags -= 1;
      const mesh = new THREE.Mesh(grenadeGeometry, grenadeMaterial);
      mesh.position.copy(origin);
      camera.parent.add(mesh);
      grenadeMeshes.push(mesh);
      grenades.push({
        pos: origin.clone(),
        vel: direction.clone().multiplyScalar(13).add(new THREE.Vector3(0, 3.2, 0)),
        fuse: FRAG.fuse,
        bounced: false,
      });
      return true;
    },
    refillRound() {
      for (let i = 0; i < WEAPONS.length; i += 1) {
        if (owned[i]) ammo[i] = { mag: WEAPONS[i].mag, reserve: WEAPONS[i].reserve };
      }
      frags = 0;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
  };
}
