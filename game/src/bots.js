// Bots: the other five players. Each bot walks the waypoint graph (BFS paths),
// holds a site or pushes one, sees through a vision cone with a line-of-sight ray,
// hears gunshots, fights in bursts with distance-scaled aim error, and plays the
// objective: the carrier plants, defenders defuse, everyone converges after a plant.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { findPath, nearestNode } from './world.js';
import { PLANT_TIME, DEFUSE_TIME } from './state.js';

const BOT_SPEED = 4.2;
const BOT_HEALTH = 100;
const VISION_RANGE = 40;
const VISION_HALF_FOV = 0.96; // ~110 degrees
const HEAR_RANGE = 28;
const REACTION_MIN = 0.25;
const REACTION_MAX = 0.45;
const BURST_GAP = 0.11;
const BULLET_DAMAGE = 26;
const HEAD_MULT = 4;

const tmpDir = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();
const tmpEye = new THREE.Vector3();
const raycaster = new THREE.Raycaster();

import { buildGun } from './rifle.js';

// Team identity: EMBER is warm ember-orange, ASH is cool teal-grey.
const TEAM_STYLE = {
  ember: { torso: 0xff9a3c, vest: 0x7a3c0d, helmet: 0x3d2f1f, pad: 0xcc7a2e, visor: 0xff9a3c, pack: 0x2e2118 },
  ash: { torso: 0x7d8a86, vest: 0x3fae8a, helmet: 0x2e3433, pad: 0x5c6b67, visor: 0x3fae8a, pack: 0x24282a },
};

function botMeshes(team) {
  const style = TEAM_STYLE[team];
  const torsoMat = new THREE.MeshStandardMaterial({ color: style.torso, roughness: 0.65, metalness: 0.05 });
  const vestMat = new THREE.MeshStandardMaterial({ color: style.vest, roughness: 0.7, metalness: 0.1 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: style.helmet, roughness: 0.5, metalness: 0.15 });
  const padMat = new THREE.MeshStandardMaterial({ color: style.pad, roughness: 0.65, metalness: 0.05 });
  const packMat = new THREE.MeshStandardMaterial({ color: style.pack, roughness: 0.85 });
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.05 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x26211c, roughness: 0.8 });
  const visorMat = new THREE.MeshBasicMaterial({ color: style.visor });
  const group = new THREE.Group();

  // Legs pivot at the hip so the walk swing rotates them.
  function leg(x) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.60, 0);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.52, 0.18), darkMat);
    thigh.position.set(0, -0.26, 0);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.09, 0.27), darkMat);
    boot.position.set(0, -0.555, -0.02);
    pivot.add(thigh, boot);
    return pivot;
  }
  const legL = leg(-0.11);
  const legR = leg(0.11);

  // Torso: team-coloured chest, darker vest front/back, glowing chest stripe.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.60, 0.28), torsoMat);
  torso.position.y = 0.90;
  const vestF = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.42, 0.07), vestMat);
  vestF.position.set(0, 0.92, -0.155);
  const vestB = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.42, 0.05), vestMat);
  vestB.position.set(0, 0.92, 0.155);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.04, 0.015), visorMat);
  stripe.position.set(0, 1.06, -0.195);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.10), packMat);
  pack.position.set(0, 0.94, 0.20);
  const padL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.07, 0.27), padMat);
  padL.position.set(-0.31, 1.19, 0);
  const padR = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.07, 0.27), padMat);
  padR.position.set(0.31, 1.19, 0);

  // Arms: two segments, bent forward in an aim pose toward the rifle.
  function arm(x, rotX, rotZ, foreX) {
    const shoulder = new THREE.Group();
    shoulder.position.set(x, 1.16, 0);
    shoulder.rotation.set(rotX, 0, rotZ);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.24, 0.13), torsoMat);
    upper.position.set(0, -0.11, 0);
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.22, 0);
    elbow.rotation.x = foreX;
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.22, 0.12), torsoMat);
    fore.position.set(0, -0.10, 0);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.09, 0.10), darkMat);
    hand.position.set(0, -0.22, 0);
    elbow.add(fore, hand);
    shoulder.add(upper, elbow);
    return shoulder;
  }
  const armR = arm(0.31, 0.75, -0.35, 0.75);
  const armL = arm(-0.31, 0.9, 0.35, 0.7);

  // Head: face, helmet cap, glowing visor slit.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 12), skinMat);
  head.position.y = 1.50;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), helmetMat);
  helmet.position.y = 1.51;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.05, 0.02), visorMat);
  visor.position.set(0, 1.51, -0.145);

  // The same rifle the player carries, held at chest height, pointing forward.
  const { group: gun } = buildGun('rifle');
  gun.position.set(0.10, 1.10, -0.22);
  gun.rotation.x = -0.02;

  group.add(legL, legR, torso, vestF, vestB, stripe, pack, padL, padR, armR, armL, head, helmet, visor, gun);
  group.traverse((mesh) => { if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
  return { group, torso, head, legL, legR };
}

export function createBots(scene, world) {
  const bots = [];
  const hitMeshes = [];
  // Invisible-but-raycastable hit boxes for the player (bots shoot at these).
  const playerMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const playerTorso = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.9, 0.68), playerMat);
  const playerHead = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), playerMat);
  playerTorso.userData.part = 'torso';
  playerHead.userData.part = 'head';
  scene.add(playerTorso, playerHead);

  function makeBot(team, role, index) {
    const { group, torso, head, legL, legR } = botMeshes(team);
    scene.add(group);
    const bot = {
      team, role, index, group, torso, head, legL, legR,
      health: BOT_HEALTH, alive: true,
      position: group.position, // Vector3, y = 0
      yaw: 0, speed: BOT_SPEED, walkPhase: 0,
      node: 0, path: [], pathIndex: 0,
      state: 'move', holdNode: -1, goalSite: null,
      target: null, lastSeen: new THREE.Vector3(), seenAt: -99,
      reactionAt: 0, burstLeft: 0, burstTimer: 0, pauseTimer: 0,
      investigateUntil: 0, investigateNode: -1,
      channel: 0, // plant/defuse progress seconds
      scanTimer: Math.random() * 0.15,
      strafePhase: Math.random() * 6.28,
    };
    torso.userData.bot = bot; torso.userData.part = 'torso';
    head.userData.bot = bot; head.userData.part = 'head';
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  function resetBot(bot, nodeId, yaw) {
    const [x, z] = world.waypoints.nodes[nodeId];
    bot.group.position.set(x, 0, z);
    bot.group.rotation.set(0, yaw, 0);
    bot.yaw = yaw;
    bot.health = BOT_HEALTH;
    bot.alive = true;
    bot.node = nodeId;
    bot.path = [];
    bot.pathIndex = 0;
    bot.state = 'move';
    bot.target = null;
    bot.channel = 0;
    bot.burstLeft = 0;
    bot.burstTimer = 0;
    bot.pauseTimer = 0;
    bot.investigateUntil = 0;
    bot.walkPhase = 0;
    bot.legL.rotation.set(0, 0, 0);
    bot.legR.rotation.set(0, 0, 0);
  }

  function setGoal(bot, goalNode) {
    if (bot.node === goalNode && bot.path.length === 0) return;
    bot.path = findPath(world.waypoints, bot.node, goalNode);
    bot.pathIndex = 0;
  }

  function losClear(from, to, maxDist) {
    tmpDir.subVectors(to, from);
    const dist = tmpDir.length();
    if (dist > maxDist) return false;
    tmpDir.normalize();
    raycaster.set(from, tmpDir);
    raycaster.far = dist;
    return raycaster.intersectObjects(world.shootables, false).length === 0;
  }

  function eyeOf(bot) {
    return tmpEye.set(bot.position.x, 1.5, bot.position.z);
  }

  function perceive(bot, env, now) {
    // Returns the best visible enemy: {kind: 'player'|'bot', ref, pos, dist} or null.
    const eye = eyeOf(bot);
    const fx = -Math.sin(bot.yaw);
    const fz = -Math.cos(bot.yaw);
    let best = null;
    let bestDist = Infinity;
    const consider = (kind, ref, pos, chestY) => {
      tmpTarget.set(pos.x, chestY, pos.z);
      const dx = tmpTarget.x - eye.x;
      const dy = tmpTarget.y - eye.y;
      const dz = tmpTarget.z - eye.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > VISION_RANGE || dist >= bestDist) return;
      const dot = (dx * fx + dz * fz) / (Math.max(0.001, Math.hypot(dx, dz)));
      if (dot < Math.cos(VISION_HALF_FOV) && dist > 3) return; // outside the cone (close range is always seen)
      if (!losClear(eye, tmpTarget, dist)) return;
      bestDist = dist;
      best = { kind, ref, pos: new THREE.Vector3(pos.x, chestY, pos.z), dist };
    };
    if (env.player.alive && env.player.team !== bot.team) {
      consider('player', env.player, env.player.position, env.player.position.y + 1.2);
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      consider('bot', other, other.position, 1.2);
    }
    return best;
  }

  function fireAt(bot, seen, env, now) {
    // One burst round: ray from the bot eye toward the target with aim error.
    const eye = eyeOf(bot).clone();
    tmpDir.subVectors(seen.pos, eye).normalize();
    const err = 0.015 + seen.dist * 0.0009 + (seen.kind === 'player' ? env.playerSpeed * 0.004 : 0.002);
    tmpDir.x += (Math.random() * 2 - 1) * err;
    tmpDir.y += (Math.random() * 2 - 1) * err;
    tmpDir.z += (Math.random() * 2 - 1) * err;
    tmpDir.normalize();
    raycaster.set(eye, tmpDir);
    raycaster.far = 80;
    const meshes = seen.kind === 'player' ? [playerTorso, playerHead] : [seen.ref.torso, seen.ref.head];
    const hit = raycaster.intersectObjects(meshes, false)[0];
    env.onBotShot(bot, eye, tmpDir.clone());
    if (!hit) return;
    const falloff = Math.max(0.4, 1 - seen.dist / 90);
    const amount = BULLET_DAMAGE * falloff * (hit.object.userData.part === 'head' ? HEAD_MULT : 1);
    if (seen.kind === 'player') env.damagePlayer(amount, hit.object.userData.part === 'head', bot);
    else damageBot(seen.ref, amount, bot, env);
  }

  function damageBot(bot, amount, attacker, env) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) {
      // Being shot at reveals the shooter: look toward them.
      if (attacker && attacker.position) bot.lastSeen.set(attacker.position.x, 1.2, attacker.position.z);
      return false;
    }
    bot.alive = false;
    bot.state = 'dead';
    bot.group.rotation.x = -Math.PI / 2 * 0.9;
    bot.group.position.y = 0.15;
    if (env && env.onBotKilled) env.onBotKilled(bot, attacker);
    return true;
  }

  function moveToward(bot, x, z, dt) {
    const dx = x - bot.position.x;
    const dz = z - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const stepLen = Math.min(dist, bot.speed * dt);
    bot.position.x += (dx / dist) * stepLen;
    bot.position.z += (dz / dist) * stepLen;
    const targetYaw = Math.atan2(-dx, -dz);
    let dyaw = targetYaw - bot.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    bot.yaw += dyaw * Math.min(1, dt * 8);
    bot.group.rotation.y = bot.yaw;
    return dist - stepLen < 0.5;
  }

  function followPath(bot, dt) {
    if (bot.pathIndex >= bot.path.length) return true;
    const nodeId = bot.path[bot.pathIndex];
    const [x, z] = world.waypoints.nodes[nodeId];
    if (moveToward(bot, x, z, dt)) {
      bot.node = nodeId;
      bot.pathIndex += 1;
    }
    return bot.pathIndex >= bot.path.length;
  }

  function decide(bot, env, now) {
    // Objective steering, run when the bot has no target and no path.
    const bomb = env.bomb;
    if (bot.team === 'ash') {
      if (bomb.state === 'planted') { setGoal(bot, nearestNode(world.waypoints, world.sites[bomb.site].center.x, world.sites[bomb.site].center.z)); bot.state = 'move'; return; }
      if (bomb.state === 'dropped' && bomb.position) {
        setGoal(bot, nearestNode(world.waypoints, bomb.position.x, bomb.position.z));
        bot.state = 'move';
        return;
      }
      if (bot.role === 'carrier') {
        if (bomb.state === 'carried') {
          const site = bot.goalSite;
          const node = world.sites[site].node;
          if (bot.node === node) { bot.state = 'plant'; return; }
          setGoal(bot, node);
          bot.state = 'move';
          return;
        }
        if (bomb.state === 'dropped' && bomb.position) {
          setGoal(bot, nearestNode(world.waypoints, bomb.position.x, bomb.position.z));
          bot.state = 'move';
          return;
        }
      }
      if (bot.role === 'escort') {
        const carrier = bots.find((b) => b.team === 'ash' && b.role === 'carrier' && b.alive);
        if (carrier) { setGoal(bot, carrier.node); bot.state = 'move'; return; }
        // No carrier bot: the player carries. Escort the player instead.
        if (env.player.team === 'ash' && env.player.alive) {
          setGoal(bot, nearestNode(world.waypoints, env.player.position.x, env.player.position.z));
          bot.state = 'move';
          return;
        }
      }
      // Flank: push the other site, then hold it.
      const site = bot.goalSite === 'A' ? 'B' : 'A';
      setGoal(bot, world.sites[site].node);
      bot.state = 'move';
      return;
    }
    // EMBER defence.
    if (bomb.state === 'planted') {
      const site = bomb.site;
      if (bot.node === world.sites[site].node) { bot.state = 'defuse'; return; }
      setGoal(bot, world.sites[site].node);
      bot.state = 'move';
      return;
    }
    if (bot.role === 'holdA' || bot.role === 'holdB') {
      const site = bot.role === 'holdA' ? 'A' : 'B';
      if (bot.node !== world.sites[site].node) { setGoal(bot, world.sites[site].node); bot.state = 'move'; return; }
      bot.state = 'hold';
      return;
    }
    // Roam mid.
    if (bot.node !== 16) { setGoal(bot, 16); bot.state = 'move'; return; }
    bot.state = 'hold';
  }

  return {
    bots,
    hitMeshes,
    playerTargets: [playerTorso, playerHead],
    spawnRound(setup) {
      // setup: [{team, role, name, node, yaw, site}]
      bots.length = 0;
      hitMeshes.length = 0;
      for (const s of setup) {
        const bot = makeBot(s.team, s.role, bots.length);
        bot.name = s.name || 'Bot';
        bot.goalSite = s.site || null;
        resetBot(bot, s.node, s.yaw);
        if (s.role === 'holdA') bot.holdNode = world.sites.A.node;
        if (s.role === 'holdB') bot.holdNode = world.sites.B.node;
      }
      // Rebuild hit meshes in team order (player targets are separate).
      hitMeshes.length = 0;
      for (const bot of bots) hitMeshes.push(bot.torso, bot.head);
    },
    damageBot,
    syncPlayerTarget(playerState) {
      playerTorso.position.set(playerState.position.x, playerState.position.y + 1.0, playerState.position.z);
      playerHead.position.set(playerState.position.x, playerState.position.y + 1.56, playerState.position.z);
    },
    step(dt, env, now) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        bot.scanTimer -= dt;
        const seen = bot.scanTimer <= 0 ? perceive(bot, env, now) : bot.target;
        if (bot.scanTimer <= 0) {
          bot.scanTimer = 0.15;
          if (seen) {
            bot.target = seen;
            bot.lastSeen.copy(seen.pos);
            bot.seenAt = now;
            if (bot.reactionAt === 0) bot.reactionAt = now + REACTION_MIN + Math.random() * (REACTION_MAX - REACTION_MIN);
          } else if (bot.target && now - bot.seenAt > 1.2) {
            bot.target = null;
            bot.reactionAt = 0;
          }
        }
        // Hearing: a nearby gunshot pulls the bot to investigate.
        if (!bot.target && env.shots) {
          for (const shot of env.shots) {
            const d = Math.hypot(shot.x - bot.position.x, shot.z - bot.position.z);
            if (d < HEAR_RANGE) {
              bot.investigateNode = nearestNode(world.waypoints, shot.x, shot.z);
              bot.investigateUntil = now + 4;
              break;
            }
          }
        }

        // Walk bob + leg swing while moving or strafing in combat.
        const moving = bot.state === 'move' || (bot.target && now >= bot.reactionAt);
        if (moving) {
          bot.walkPhase += dt * 9;
          const s = Math.sin(bot.walkPhase);
          bot.group.position.y = Math.abs(Math.cos(bot.walkPhase)) * 0.045;
          bot.legL.rotation.x = s * 0.5;
          bot.legR.rotation.x = -s * 0.5;
        } else {
          bot.group.position.y += (0 - bot.group.position.y) * Math.min(1, dt * 8);
          bot.legL.rotation.x *= Math.max(0, 1 - dt * 8);
          bot.legR.rotation.x *= Math.max(0, 1 - dt * 8);
        }

        if (bot.target && now >= bot.reactionAt) {
          // Combat: face the target, strafe, fire in bursts.
          const t = bot.target;
          const dx = t.pos.x - bot.position.x;
          const dz = t.pos.z - bot.position.z;
          const targetYaw = Math.atan2(-dx, -dz);
          let dyaw = targetYaw - bot.yaw;
          while (dyaw > Math.PI) dyaw -= Math.PI * 2;
          while (dyaw < -Math.PI) dyaw += Math.PI * 2;
          bot.yaw += dyaw * Math.min(1, dt * 10);
          bot.group.rotation.y = bot.yaw;
          bot.strafePhase += dt * 2.2;
          const strafe = Math.sin(bot.strafePhase) * 0.9;
          const sx = Math.cos(bot.yaw) * strafe;
          const sz = -Math.sin(bot.yaw) * strafe;
          bot.position.x += sx * dt;
          bot.position.z += sz * dt;
          bot.burstTimer -= dt;
          if (bot.burstLeft <= 0) {
            bot.pauseTimer -= dt;
            if (bot.pauseTimer <= 0) {
              bot.burstLeft = 3 + Math.floor(Math.random() * 3);
              bot.pauseTimer = 0.7 + Math.random() * 0.5;
            }
          } else if (bot.burstTimer <= 0) {
            bot.burstTimer = BURST_GAP;
            bot.burstLeft -= 1;
            // Re-aim at the target's current spot before each round.
            const live = perceive(bot, env, now);
            if (live) { bot.target = live; bot.lastSeen.copy(live.pos); fireAt(bot, live, env, now); }
          }
          continue;
        }

        if (bot.state === 'plant') {
          bot.channel += dt;
          if (bot.channel >= PLANT_TIME) {
            bot.channel = 0;
            bot.state = 'move';
            env.onPlant(bot.goalSite, bot);
          }
          continue;
        }
        if (bot.state === 'defuse') {
          bot.channel += dt;
          if (bot.channel >= DEFUSE_TIME) {
            bot.channel = 0;
            bot.state = 'move';
            env.onDefuse(bot);
          }
          continue;
        }
        if (bot.state === 'hold') {
          // Scan: slow yaw sweep while holding.
          bot.yaw += Math.sin(now * 0.5 + bot.index) * dt * 0.4;
          bot.group.rotation.y = bot.yaw;
          if (bot.investigateUntil > now) { setGoal(bot, bot.investigateNode); bot.state = 'move'; }
          continue;
        }
        // Move: follow the current path, then decide the next goal.
        if (bot.path.length === 0 || bot.pathIndex >= bot.path.length) {
          if (bot.investigateUntil > now) { setGoal(bot, bot.investigateNode); }
          else decide(bot, env, now);
        } else {
          followPath(bot, dt);
        }
      }
    },
  };
}
