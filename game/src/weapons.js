// Weapons: three guns and a frag grenade. Each gun owns its numbers (damage, headshot
// multiplier, fire gap, magazine, reload, spread, recoil, price) and its view model.
// Ammo is kept per weapon so switching preserves the magazine. Grenades fly on a
// simple arc, bounce once, then explode; main.js applies the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = [
  { id: 'pistol', name: 'P-9 Sidearm', price: 0, damage: 26, headMult: 4, gap: 0.16, auto: false, mag: 12, reserve: 48, reload: 1.4, spreadStill: 0.004, spreadMove: 0.02, recoil: 0.006, range: 60 },
  { id: 'smg', name: 'Hornet-9', price: 1500, damage: 22, headMult: 4, gap: 0.07, auto: true, mag: 25, reserve: 100, reload: 1.7, spreadStill: 0.006, spreadMove: 0.034, recoil: 0.005, range: 45 },
  { id: 'rifle', name: 'VK-7 Ember', price: 2900, damage: 34, headMult: 4, gap: 0.096, auto: true, mag: 30, reserve: 90, reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028, recoil: 0.009, range: 80 },
];
export const FRAG = { id: 'frag', name: 'Frag Grenade', price: 300, radius: 5.5, maxDamage: 120, fuse: 1.6 };

const GRENADE_GRAVITY = 12;
const MUZZLE_TIME = 0.06;

function gunModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });
  const model = new THREE.Group();
  if (def.id === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.24), body);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.08), grip);
    handle.position.set(0, -0.09, 0.08);
    model.add(slide, handle);
  } else if (def.id === 'smg') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.34), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.26), grip);
    barrel.position.set(0, 0.02, -0.28);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), grip);
    mag.position.set(0, -0.12, -0.02);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.06), accent);
    sight.position.set(0, 0.07, -0.05);
    model.add(receiver, barrel, mag, sight);
  } else {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
    barrel.position.set(0, 0.025, -0.38);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, 0.3);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.02, 0.2), accent);
    stripe.position.set(0, 0.055, -0.05);
    model.add(receiver, barrel, stock, stripe);
  }
  model.position.set(0.24, -0.2, -0.42);
  model.visible = false;
  return model;
}

export function createWeapons(camera) {
  const models = WEAPONS.map((def) => {
    const model = gunModel(def);
    camera.add(model);
    return model;
  });
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.1, 0.1),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const ammo = WEAPONS.map((def) => ({ mag: def.mag, reserve: def.reserve }));
  const owned = [true, false, false]; // pistol owned, smg/rifle bought
  let current = 0;
  let frags = 0;
  const state = { cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, switching: 0 };
  const grenades = []; // {pos, vel, fuse, bounced}
  const grenadeMeshes = [];
  const grenadeGeometry = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.enemy), roughness: 0.5, metalness: 0.4 });

  function def() {
    return WEAPONS[current];
  }

  function showModel() {
    models.forEach((model, i) => { model.visible = i === current; });
  }
  showModel();

  return {
    state,
    grenades,
    def,
    owned,
    current() { return current; },
    frags() { return frags; },
    ammo() { return ammo[current]; },
    ammoOf(index) { return ammo[index]; },
    step(dt, onExplode) {
      state.cooldown = Math.max(0, state.cooldown - dt);
      state.flash = Math.max(0, state.flash - dt);
      state.kick += (0 - state.kick) * Math.min(1, dt * 14);
      state.switching = Math.max(0, state.switching - dt);
      const model = models[current];
      model.position.z = -0.42 + state.kick;
      model.rotation.x = state.kick * 2.2 + (state.switching > 0 ? -0.4 * state.switching : 0);
      flash.visible = state.flash > 0;
      flash.rotation.z = state.flash * 30;
      flashLight.intensity = state.flash > 0 ? 18 : 0;
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
