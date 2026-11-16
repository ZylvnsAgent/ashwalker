// Pooled impact + explosion effects. Everything is preallocated at load:
// spark bursts (Points), dust/smoke/fireball sprites, debris boxes, shockwave
// rings and impact decals are recycled round-robin. update() allocates nothing.
import * as THREE from 'three';
import { createTextures } from './textures.js';

const SPARK_BURSTS = 6;
const SPARKS_PER_BURST = 14;
const DUST_SPRITES = 24;
const SMOKE_SPRITES = 18;
const FIRE_SPRITES = 6;
const DEBRIS = 12;
const DECALS = 20;
const RINGS = 2;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function randomInHemisphere(normal, speed, out) {
  // Random direction biased along `normal`, with a wide spread.
  out.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
  out.addScaledVector(normal, 1.6).normalize().multiplyScalar(speed * (0.5 + Math.random()));
  return out;
}

export function createEffects(scene) {
  const tex = createTextures();

  // --- Sparks: one Points cloud per burst, fixed vertex count. ---
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARK_BURSTS * SPARKS_PER_BURST * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({
    size: 0.11, map: tex.sparkDot, color: new THREE.Color('#ffc06a'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  sparks.visible = false;
  scene.add(sparks);
  const sparkVel = new Float32Array(SPARK_BURSTS * SPARKS_PER_BURST * 3);
  const sparkLife = new Float32Array(SPARK_BURSTS); // seconds left per burst
  let sparkNext = 0;

  // --- Sprites: dust (tan), smoke (dark), fireball (additive ember). ---
  function makeSprites(count, color, additive) {
    const list = [];
    const mat = new THREE.SpriteMaterial({
      map: tex.softDot, color, transparent: true, opacity: 0,
      depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    for (let i = 0; i < count; i += 1) {
      const sprite = new THREE.Sprite(mat.clone());
      sprite.visible = false;
      scene.add(sprite);
      list.push({ sprite, life: 0, maxLife: 1, grow: 1, rise: 0, drift: new THREE.Vector3(), baseOpacity: 0.5 });
    }
    return list;
  }
  const dust = makeSprites(DUST_SPRITES, new THREE.Color('#8a7a62'), false);
  const smoke = makeSprites(SMOKE_SPRITES, new THREE.Color('#2e2822'), false);
  const fire = makeSprites(FIRE_SPRITES, new THREE.Color('#ff9a3c'), true);
  let dustNext = 0;
  let smokeNext = 0;
  let fireNext = 0;

  function spawnSprite(pool, next, pos, vel, life, size0, size1, opacity) {
    const slot = pool[next];
    next = (next + 1) % pool.length;
    slot.sprite.position.copy(pos);
    slot.sprite.visible = true;
    slot.sprite.scale.setScalar(size0);
    slot.sprite.material.opacity = opacity;
    slot.life = life;
    slot.maxLife = life;
    slot.grow = (size1 - size0) / life;
    slot.rise = vel.y;
    slot.drift.copy(vel);
    slot.baseOpacity = opacity;
    return next;
  }

  // --- Debris: small dark boxes flung out, one bounce, then gone. ---
  const debrisGeo = new THREE.BoxGeometry(0.12, 0.08, 0.12);
  const debrisMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#241b12'), roughness: 0.9, metalness: 0.2 });
  const debris = [];
  for (let i = 0; i < DEBRIS; i += 1) {
    const mesh = new THREE.Mesh(debrisGeo, debrisMat);
    mesh.visible = false;
    mesh.castShadow = false;
    scene.add(mesh);
    debris.push({ mesh, vel: new THREE.Vector3(), life: 0, bounced: false });
  }
  let debrisNext = 0;

  // --- Shockwave rings: flat additive rings expanding over the ground. ---
  const ringGeo = new THREE.RingGeometry(0.82, 1, 40);
  const rings = [];
  for (let i = 0; i < RINGS; i += 1) {
    const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffb066'), transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    rings.push({ mesh, life: 0, maxLife: 0.5, maxRadius: 6 });
  }
  let ringNext = 0;

  // --- Impact decals: dark scorch marks lying on the hit surface. ---
  const decalGeo = new THREE.PlaneGeometry(0.42, 0.42);
  const decals = [];
  for (let i = 0; i < DECALS; i += 1) {
    const mesh = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({
      map: tex.decal, color: new THREE.Color('#ffffff'), transparent: true, opacity: 0,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    }));
    mesh.visible = false;
    scene.add(mesh);
    decals.push({ mesh, life: 0 });
  }
  let decalNext = 0;

  function sparkBurst(point, normal) {
    const b = sparkNext;
    sparkNext = (sparkNext + 1) % SPARK_BURSTS;
    const base = b * SPARKS_PER_BURST * 3;
    for (let i = 0; i < SPARKS_PER_BURST; i += 1) {
      const o = base + i * 3;
      sparkPos[o] = point.x;
      sparkPos[o + 1] = point.y;
      sparkPos[o + 2] = point.z;
      randomInHemisphere(normal, 3 + Math.random() * 4, _v);
      sparkVel[o] = _v.x;
      sparkVel[o + 1] = _v.y;
      sparkVel[o + 2] = _v.z;
    }
    sparkLife[b] = 0.4;
    sparkGeo.attributes.position.needsUpdate = true;
    sparks.visible = true;
  }

  function dustPuff(point, normal, count, strength) {
    for (let i = 0; i < count; i += 1) {
      _v.copy(point).addScaledVector(normal, 0.05);
      _v2.copy(normal).multiplyScalar(0.4 * strength);
      _v2.x += (Math.random() - 0.5) * 0.8;
      _v2.y += 0.5 + Math.random() * 0.6;
      _v2.z += (Math.random() - 0.5) * 0.8;
      dustNext = spawnSprite(dust, dustNext, _v, _v2, 0.55 + Math.random() * 0.3, 0.25, 0.9 + Math.random() * 0.5, 0.5);
    }
  }

  return {
    // Bullet hit on a bot: sparks only (no decal on a moving body).
    spark(point, normal) {
      sparkBurst(point, normal);
    },
    // Bullet hit on the world: sparks + dust + a scorch mark that lingers.
    impact(point, normal) {
      sparkBurst(point, normal);
      dustPuff(point, normal, 3, 1);
      const d = decals[decalNext];
      decalNext = (decalNext + 1) % DECALS;
      d.mesh.position.copy(point).addScaledVector(normal, 0.015);
      d.mesh.lookAt(_v.copy(point).add(normal));
      d.mesh.visible = true;
      d.mesh.material.opacity = 0.6;
      d.life = 10;
    },
    // Grenade / bomb blast: fireball, smoke plume, debris, shockwave ring.
    explosion(pos, scale = 1) {
      _v.set(pos.x, Math.max(0.5, pos.y) + 0.2, pos.z);
      for (let i = 0; i < 3; i += 1) {
        _v2.set((Math.random() - 0.5) * 0.6, 0.8 + Math.random(), (Math.random() - 0.5) * 0.6);
        fireNext = spawnSprite(fire, fireNext, _v, _v2, 0.32, 0.9 * scale, 2.6 * scale, 0.9);
      }
      for (let i = 0; i < 9; i += 1) {
        _v2.set((Math.random() - 0.5) * 1.6, 1.1 + Math.random() * 1.4, (Math.random() - 0.5) * 1.6);
        smokeNext = spawnSprite(smoke, smokeNext, _v, _v2, 1.8 + Math.random() * 0.8, 0.8 * scale, 3.4 * scale, 0.55);
      }
      dustPuff(_v, _up, 4, 2 * scale);
      for (let i = 0; i < DEBRIS; i += 1) {
        const d = debris[debrisNext];
        debrisNext = (debrisNext + 1) % DEBRIS;
        d.mesh.position.set(pos.x, Math.max(0.4, pos.y), pos.z);
        d.mesh.visible = true;
        d.mesh.scale.setScalar(0.7 + Math.random() * 0.9);
        const a = Math.random() * Math.PI * 2;
        const sp = (2.5 + Math.random() * 4.5) * scale;
        d.vel.set(Math.cos(a) * sp, 2 + Math.random() * 4, Math.sin(a) * sp);
        d.life = 1.3;
        d.bounced = false;
      }
      const r = rings[ringNext];
      ringNext = (ringNext + 1) % RINGS;
      r.mesh.position.set(pos.x, 0.06, pos.z);
      r.mesh.visible = true;
      r.mesh.scale.setScalar(0.4);
      r.mesh.material.opacity = 0.85;
      r.life = 0.5;
      r.maxLife = 0.5;
      r.maxRadius = 5.5 * scale;
    },
    update(dt) {
      // Sparks: integrate, gravity, expire per burst.
      let anySpark = false;
      for (let b = 0; b < SPARK_BURSTS; b += 1) {
        if (sparkLife[b] <= 0) continue;
        sparkLife[b] -= dt;
        anySpark = true;
        const base = b * SPARKS_PER_BURST * 3;
        for (let i = 0; i < SPARKS_PER_BURST; i += 1) {
          const o = base + i * 3;
          sparkVel[o + 1] -= 9 * dt;
          sparkPos[o] += sparkVel[o] * dt;
          sparkPos[o + 1] += sparkVel[o + 1] * dt;
          sparkPos[o + 2] += sparkVel[o + 2] * dt;
          if (sparkPos[o + 1] < 0.02) { sparkPos[o + 1] = 0.02; sparkVel[o + 1] = 0; }
        }
      }
      if (anySpark) sparkGeo.attributes.position.needsUpdate = true;
      else sparks.visible = false;

      // Sprites: rise, drift, grow, fade.
      for (const pool of [dust, smoke, fire]) {
        for (const s of pool) {
          if (s.life <= 0) continue;
          s.life -= dt;
          if (s.life <= 0) { s.sprite.visible = false; s.sprite.material.opacity = 0; continue; }
          const t = 1 - s.life / s.maxLife;
          s.sprite.position.addScaledVector(s.drift, dt);
          s.sprite.position.y += s.rise * dt * (1 - t * 0.5);
          s.sprite.scale.addScalar(s.grow * dt);
          s.sprite.material.opacity = s.baseOpacity * (1 - t);
        }
      }
      // Debris: gravity, one bounce, shrink out.
      for (const d of debris) {
        if (d.life <= 0) continue;
        d.life -= dt;
        if (d.life <= 0) { d.mesh.visible = false; continue; }
        d.vel.y -= 12 * dt;
        d.mesh.position.addScaledVector(d.vel, dt);
        d.mesh.rotation.x += dt * 6;
        d.mesh.rotation.z += dt * 4;
        if (d.mesh.position.y < 0.06) {
          d.mesh.position.y = 0.06;
          if (!d.bounced) { d.vel.y = Math.abs(d.vel.y) * 0.35; d.vel.x *= 0.6; d.vel.z *= 0.6; d.bounced = true; }
          else { d.vel.y = 0; d.vel.x *= 0.7; d.vel.z *= 0.7; }
        }
      }
      // Rings: expand and fade.
      for (const r of rings) {
        if (r.life <= 0) continue;
        r.life -= dt;
        if (r.life <= 0) { r.mesh.visible = false; continue; }
        const t = 1 - r.life / r.maxLife;
        r.mesh.scale.setScalar(0.4 + t * r.maxRadius);
        r.mesh.material.opacity = 0.85 * (1 - t);
      }
      // Decals: linger, fade in the last two seconds.
      for (const d of decals) {
        if (d.life <= 0) continue;
        d.life -= dt;
        if (d.life <= 0) { d.mesh.visible = false; d.mesh.material.opacity = 0; continue; }
        if (d.life < 2) d.mesh.material.opacity = 0.6 * (d.life / 2);
      }
    },
  };
}
