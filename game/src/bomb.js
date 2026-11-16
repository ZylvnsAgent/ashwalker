// The bomb: one object, one timer. It is carried, dropped, planted (35 s to
// detonation, beeping faster as it runs down) or defused. The plant and defuse
// channels live in the bots and in main.js; this module owns the shared object,
// the planted countdown and the explosion itself.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { BOMB_TIME, PLANT_TIME, DEFUSE_TIME } from './state.js';

export function createBomb(scene, world) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.16, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.6, metalness: 0.3 }),
  );
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.enemy) }),
  );
  light.position.set(0.12, 0.1, 0);
  group.add(body, light);
  group.visible = false;
  scene.add(group);

  const flash = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 26, 1.4);
  scene.add(flash);
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false }),
  );
  shell.visible = false;
  scene.add(shell);

  let beepAt = 0;
  let blast = 0; // seconds since detonation, for the visual
  let blastPos = new THREE.Vector3();

  return {
    group,
    plant(site, bomb) {
      const s = world.sites[site];
      bomb.state = 'planted';
      bomb.site = site;
      bomb.timer = BOMB_TIME;
      bomb.position = { x: s.center.x, y: 0, z: s.center.z };
      group.position.set(s.center.x, 0.09, s.center.z);
      group.visible = true;
      beepAt = 0;
    },
    drop(pos, bomb) {
      bomb.state = 'dropped';
      bomb.position = { x: pos.x, y: 0, z: pos.z };
      group.position.set(pos.x, 0.09, pos.z);
      group.visible = true;
    },
    pickup(bomb) {
      bomb.state = 'carried';
      bomb.position = null;
      group.visible = false;
    },
    reset(bomb) {
      bomb.state = 'carried';
      bomb.site = null;
      bomb.timer = 0;
      bomb.plantProgress = 0;
      bomb.defuseProgress = 0;
      bomb.position = null;
      group.visible = false;
      shell.visible = false;
      flash.intensity = 0;
      blast = 0;
    },
    // Returns 'exploded' once, at the moment of detonation, else null.
    update(dt, bomb, now, onBeep, onExplode) {
      if (blast > 0) {
        blast += dt;
        const t = blast / 1.1;
        shell.scale.setScalar(1 + t * 14);
        shell.material.opacity = Math.max(0, 0.7 * (1 - t));
        flash.intensity = Math.max(0, 90 * (1 - t));
        if (blast > 1.1) { shell.visible = false; flash.intensity = 0; blast = 0; }
        return null;
      }
      if (bomb.state !== 'planted') return null;
      bomb.timer -= dt;
      const interval = Math.max(0.25, bomb.timer / BOMB_TIME);
      if (now >= beepAt) {
        beepAt = now + interval;
        light.material.color.setHex(0xffffff);
        setTimeout(() => light.material.color.setHex(0xe14b4b), 70);
        onBeep();
      }
      if (bomb.timer <= 0) {
        bomb.state = 'exploded';
        group.visible = false;
        blast = 0.001;
        blastPos.set(bomb.position.x, 0.6, bomb.position.z);
        shell.position.copy(blastPos);
        flash.position.copy(blastPos);
        shell.visible = true;
        onExplode(blastPos);
        return 'exploded';
      }
      return null;
    },
  };
}

export { PLANT_TIME, DEFUSE_TIME };
