// EMBERLINE: boot and the one loop. A fixed 60 Hz simulation feeds a render at
// the display's rate. ?shot=buy|play|bomb|end with &seed=N sets up a deterministic
// frame for a capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createState, PHASE, SIDE, ROUND_TIME, BOMB_TIME, PLANT_TIME, DEFUSE_TIME } from './state.js';
import { createWorld, nearestNode } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS, FRAG } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const state = createState();
const world = createWorld(scene);
const bots = createBots(scene, world);
const bomb = createBomb(scene, world);
const weapons = createWeapons(camera);
const hud = createHud();
const audio = createAudio();
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;

// Preallocated temps: the hot loop allocates nothing.
const direction = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }));
tracer.frustumCulled = false;
scene.add(tracer);
let tracerTime = 0;

let playerTeam = SIDE.EMBER;
let bombCarrier = 'player'; // 'player' | bot object | null (planted/dropped)
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let shotsThisStep = [];
let plantHeld = false;

const body = player.state;

function buildSetup(side) {
  const ashSite = random() < 0.5 ? 'A' : 'B';
  const other = ashSite === 'A' ? 'B' : 'A';
  if (side === SIDE.EMBER) {
    return {
      playerNode: 26, playerYaw: 0,
      bots: [
        { team: 'ember', role: 'holdA', name: 'Sable', node: 25, yaw: -Math.PI / 2 },
        { team: 'ember', role: 'holdB', name: 'Wren', node: 27, yaw: Math.PI / 2 },
        { team: 'ash', role: 'carrier', name: 'Vex', node: 0, yaw: Math.PI, site: ashSite },
        { team: 'ash', role: 'escort', name: 'Rook', node: 1, yaw: Math.PI, site: ashSite },
        { team: 'ash', role: 'flank', name: 'Moth', node: 2, yaw: Math.PI, site: other },
      ],
    };
  }
  return {
    playerNode: 1, playerYaw: Math.PI,
    bots: [
      { team: 'ash', role: 'escort', name: 'Rook', node: 0, yaw: Math.PI, site: ashSite },
      { team: 'ash', role: 'flank', name: 'Moth', node: 2, yaw: Math.PI, site: other },
      { team: 'ember', role: 'holdA', name: 'Sable', node: 25, yaw: -Math.PI / 2 },
      { team: 'ember', role: 'holdB', name: 'Wren', node: 27, yaw: Math.PI / 2 },
      { team: 'ember', role: 'roam', name: 'Pike', node: 26, yaw: 0 },
    ],
  };
}

function spawnAll(round, side) {
  const setup = buildSetup(side);
  playerTeam = side;
  const [px, pz] = world.waypoints.nodes[setup.playerNode];
  player.reset(px, pz, setup.playerYaw);
  weapons.refillRound();
  weapons.switchTo(0);
  bomb.reset(state.bomb);
  bombCarrier = side === SIDE.ASH ? 'player' : setup.bots.find((b) => b.role === 'carrier');
  bots.spawnRound(setup.bots);
  bots.syncPlayerTarget(body);
  shotsThisStep = [];
  syncHud();
}

const rounds = createRounds(state, {
  spawn: spawnAll,
  onPhase(phase) {
    if (phase === PHASE.BUY) {
      hud.showBuy(state.money, weapons.owned, weapons.frags());
      hud.banner(`Round ${state.round} — Buy phase`, state.playerSide === SIDE.EMBER ? 'Hold the sites. Spend your money.' : 'Take a site and plant the bomb.');
    } else if (phase === PHASE.LIVE) {
      hud.hideBuy();
      hud.banner(state.playerSide === SIDE.EMBER ? 'Defend the sites' : 'Plant the bomb', `Round ${state.round} · first to 5`);
    }
  },
  onRoundEnd(winner, reason, reward) {
    const won = winner === state.playerSide;
    hud.hideBuy();
    audio[won ? 'roundWin' : 'roundLose']();
    if (document.pointerLockElement) document.exitPointerLock();
    const reasonText = { elimination: 'Enemy team eliminated', detonation: 'The bomb detonated', defuse: 'The bomb was defused', time: 'Time expired — sites held' }[reason];
    hud.showOverlay('round', {
      title: won ? `${winner === 'ember' ? 'EMBER' : 'ASH'} takes the round` : `${winner === 'ember' ? 'EMBER' : 'ASH'} takes the round`,
      copy: `${reasonText}. ${won ? `+$${reward}` : `+$${reward} (loss bonus)`} · Score EMBER ${state.wins.ember} — ${state.wins.ash} ASH.`,
    });
  },
  onMatchEnd(winner) {
    const won = winner === state.playerSide;
    const acc = state.stats.shots ? Math.round((100 * state.stats.hits) / state.stats.shots) : 0;
    hud.showOverlay('match', {
      title: won ? 'VICTORY — EMBERLINE is yours' : 'DEFEAT — the yard belongs to them',
      copy: `Final score EMBER ${state.wins.ember} — ${state.wins.ash} ASH. You: ${state.kills} kills, ${state.deaths} deaths, ${acc}% accuracy.`,
    });
  },
});

function onLockChange(locked) {
  if (shot) return;
  audio.unlock();
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (state.phase === PHASE.LIVE || state.phase === PHASE.BUY) {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (state.phase === PHASE.MENU || state.phase === PHASE.MATCH_END) {
    rounds.startMatch();
    hud.hideOverlay();
  } else if (state.phase === PHASE.ROUND_END) {
    hud.hideOverlay();
  }
  input.requestLock();
});

function buyItem(index) {
  if (state.phase !== PHASE.BUY) return;
  if (index === 'frag') {
    if (state.money < FRAG.price) return;
    state.money -= FRAG.price;
    weapons.buyFrag();
    hud.showBuy(state.money, weapons.owned, weapons.frags());
    hud.setMoney(state.money);
    return;
  }
  const i = Number(index);
  if (weapons.owned[i] || state.money < WEAPONS[i].price) return;
  state.money -= WEAPONS[i].price;
  weapons.buy(i);
  weapons.switchTo(i);
  hud.showBuy(state.money, weapons.owned, weapons.frags());
  syncHud();
}

hud.onBuy((index) => buyItem(index));

function syncHud() {
  hud.setHealth(Math.ceil(body.health));
  const a = weapons.ammo();
  hud.setAmmo(a.mag, a.reserve, weapons.def().name);
  hud.setMoney(state.money);
  hud.setScore(state.wins.ember, state.wins.ash, state.round);
  let emberAlive = 0;
  let ashAlive = 0;
  if (body.alive && playerTeam === SIDE.EMBER) emberAlive += 1;
  if (body.alive && playerTeam === SIDE.ASH) ashAlive += 1;
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    if (bot.team === SIDE.EMBER) emberAlive += 1;
    else ashAlive += 1;
  }
  hud.setAlive(emberAlive, ashAlive);
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  if (!weapons.takeRound()) { audio.dry(); return false; }
  state.stats.shots += 1;
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const targets = world.shootables.concat(bots.hitMeshes);
  const hit = raycaster.intersectObjects(targets, false)[0];
  const muzzle = tmpVec.copy(camera.position).addScaledVector(direction, 0.6);
  tmpRight.crossVectors(direction, camera.up).normalize();
  muzzle.addScaledVector(tmpRight, 0.15);
  muzzle.y -= 0.12;
  const end = hit ? hit.point : tmpVec2.copy(camera.position).addScaledVector(direction, 60);
  tracerGeo.setFromPoints([muzzle.clone(), end.clone()]);
  tracer.material.opacity = 0.9;
  tracerTime = 0.06;
  shotsThisStep.push({ x: body.position.x, z: body.position.z });
  if (hit && hit.object.userData.bot) {
    const victim = hit.object.userData.bot;
    const isHead = hit.object.userData.part === 'head';
    const dist = hit.distance;
    const falloff = Math.max(0.4, 1 - dist / 90);
    const amount = weapons.def().damage * falloff * (isHead ? weapons.def().headMult : 1);
    state.stats.hits += 1;
    if (isHead) state.stats.headshots += 1;
    const killed = bots.damageBot(victim, amount, body, botEnv());
    hud.hitMarker(killed, shot ? 4000 : 90);
    audio.hit(isHead);
    if (killed) {
      state.kills += 1;
      state.money += 300;
      hud.killfeed(`You ▸ ${victim.name || 'Bot'}${isHead ? ' (headshot)' : ''}`, true);
      hud.setMoney(state.money);
      if (bombCarrier === victim) {
        bomb.drop(victim.position, state.bomb);
        bombCarrier = null;
        hud.killfeed('Bomb dropped', false);
      }
    }
  }
  weapons.pullTrigger();
  player.recoil(weapons.def().recoil + random() * 0.004, (random() * 2 - 1) * 0.004);
  audio.shoot();
  syncHud();
  return true;
}

function explodeGrenade(pos) {
  audio.explode();
  showBlast(pos);
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.position.x - pos.x, bot.position.z - pos.z);
    if (d < FRAG.radius) {
      const amount = FRAG.maxDamage * (1 - d / FRAG.radius);
      const killed = bots.damageBot(bot, amount, body, botEnv());
      if (killed) {
        state.kills += 1;
        state.money += 300;
        hud.killfeed(`You ▸ ${bot.name || 'Bot'} (frag)`, true);
        hud.setMoney(state.money);
        if (bombCarrier === bot) { bomb.drop(bot.position, state.bomb); bombCarrier = null; }
      }
    }
  }
  const pd = Math.hypot(body.position.x - pos.x, body.position.z - pos.z);
  if (body.alive && pd < FRAG.radius) {
    const died = player.damage(FRAG.maxDamage * (1 - pd / FRAG.radius) * 0.6);
    hud.damageFlash();
    audio.hurt();
    if (died) onPlayerDeath(null);
  }
  syncHud();
}

function onPlayerDeath(killer) {
  state.deaths += 1;
  if (killer) hud.killfeed(`${killer.name || 'Bot'} ▸ You`, false);
  else hud.killfeed('You are down', false);
  if (bombCarrier === 'player') {
    bomb.drop(body.position, state.bomb);
    bombCarrier = null;
    hud.killfeed('Bomb dropped', false);
  }
  hud.banner('You are down', 'Your team fights on — next round you return.');
  syncHud();
}

function botEnv() {
  return {
    player: { position: body.position, team: playerTeam, alive: body.alive },
    playerSpeed: player.groundSpeed(),
    bomb: state.bomb,
    shots: shotsThisStep,
    onBotShot(bot, from, dir) {
      shotsThisStep.push({ x: bot.position.x, z: bot.position.z });
      const d = Math.hypot(bot.position.x - body.position.x, bot.position.z - body.position.z);
      if (d < 30) audio.shoot();
    },
    damagePlayer(amount, head, bot) {
      if (!body.alive) return;
      const died = player.damage(amount);
      hud.damageFlash();
      audio.hurt();
      if (died) onPlayerDeath(bot);
      syncHud();
    },
    onPlant(site, bot) {
      bomb.plant(site, state.bomb);
      bombCarrier = null;
      audio.plant();
      hud.killfeed(`${bot.name || 'Bot'} planted the bomb at ${site}`, false);
      hud.banner('Bomb planted', `Site ${site} — defuse it before it blows.`);
    },
    onDefuse(bot) {
      state.bomb.state = 'defused';
      audio.plant();
      hud.killfeed(`${bot.name || 'Bot'} defused the bomb`, false);
      hud.banner('Bomb defused', 'The sites are safe.');
    },
    onBotKilled(victim, attacker) {
      if (attacker && attacker !== body && victim) {
        hud.killfeed(`${attacker.name || 'Bot'} ▸ ${victim.name || 'Bot'}`, attacker.team === playerTeam);
      }
      if (bombCarrier === victim) {
        bomb.drop(victim.position, state.bomb);
        bombCarrier = null;
        hud.killfeed('Bomb dropped', false);
      }
    },
  };
}

// Blast flash for grenades: an expanding transparent sphere + light, faded in step().
const blastShell = new THREE.Mesh(
  new THREE.SphereGeometry(1, 16, 12),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false }),
);
blastShell.visible = false;
scene.add(blastShell);
const blastLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 18, 1.5);
scene.add(blastLight);
let blastAge = 0;

function showBlast(pos) {
  blastShell.position.set(pos.x, Math.max(0.6, pos.y), pos.z);
  blastLight.position.copy(blastShell.position);
  blastShell.visible = true;
  blastAge = 0.001;
}

let buyVisible = false;

function step(dt) {
  elapsed += dt;
  rounds.update(dt, { player: { alive: body.alive, team: playerTeam }, bots: bots.bots });
  if (state.phase === PHASE.LIVE || state.phase === PHASE.BUY) {
    player.step(dt, input.state.keys);
  }
  weapons.step(dt, explodeGrenade);
  if (state.phase === PHASE.LIVE) {
    bots.step(dt, botEnv(), elapsed);
    // Plant / defuse channels for the player (hold E inside the site).
    const keys = input.state.keys;
    const site = world.siteAt(body.position.x, body.position.z);
    if (playerTeam === SIDE.ASH && state.bomb.state === 'carried' && bombCarrier === 'player' && site && keys.has('KeyE') && body.alive) {
      state.bomb.plantProgress += dt;
      hud.setBomb(`PLANTING… ${Math.min(99, Math.floor((100 * state.bomb.plantProgress) / PLANT_TIME))}%`);
      if (state.bomb.plantProgress >= PLANT_TIME) {
        state.bomb.plantProgress = 0;
        bomb.plant(site, state.bomb);
        bombCarrier = null;
        audio.plant();
        hud.killfeed(`You planted the bomb at ${site}`, true);
        hud.banner('Bomb planted', `Site ${site} — hold it until it blows.`);
      }
    } else if (state.bomb.state === 'planted' && playerTeam === SIDE.EMBER && site === state.bomb.site && keys.has('KeyE') && body.alive) {
      state.bomb.defuseProgress += dt;
      hud.setBomb(`DEFUSING… ${Math.min(99, Math.floor((100 * state.bomb.defuseProgress) / DEFUSE_TIME))}%`);
      if (state.bomb.defuseProgress >= DEFUSE_TIME) {
        state.bomb.defuseProgress = 0;
        state.bomb.state = 'defused';
        audio.plant();
        hud.killfeed('You defused the bomb', true);
        hud.banner('Bomb defused', 'The sites are safe.');
      }
    } else {
      state.bomb.plantProgress = Math.max(0, state.bomb.plantProgress - dt * 2);
      state.bomb.defuseProgress = Math.max(0, state.bomb.defuseProgress - dt * 2);
      if (state.bomb.state === 'planted') hud.setBomb(`BOMB PLANTED — ${Math.max(0, Math.ceil(state.bomb.timer))}s · SITE ${state.bomb.site}`);
      else if (state.bomb.state === 'dropped') hud.setBomb(playerTeam === SIDE.ASH ? 'BOMB DROPPED — recover it' : '');
      else hud.setBomb('');
    }
    // Pick up a dropped bomb.
    if (state.bomb.state === 'dropped' && state.bomb.position) {
      const bp = state.bomb.position;
      if (playerTeam === SIDE.ASH && body.alive && Math.hypot(body.position.x - bp.x, body.position.z - bp.z) < 1.4) {
        bomb.pickup(state.bomb);
        bombCarrier = 'player';
        hud.killfeed('You picked up the bomb', true);
      } else {
        for (const bot of bots.bots) {
          if (!bot.alive || bot.team !== SIDE.ASH) continue;
          if (Math.hypot(bot.position.x - bp.x, bot.position.z - bp.z) < 1.4) {
            bomb.pickup(state.bomb);
            bombCarrier = bot;
            bot.role = 'carrier';
            const da = Math.hypot(bot.position.x - world.sites.A.center.x, bot.position.z - world.sites.A.center.z);
            const db = Math.hypot(bot.position.x - world.sites.B.center.x, bot.position.z - world.sites.B.center.z);
            bot.goalSite = da < db ? 'A' : 'B';
            hud.killfeed(`${bot.name || 'Bot'} picked up the bomb`, false);
            break;
          }
        }
      }
    }
    bomb.update(dt, state.bomb, elapsed, () => audio.beep(), (pos) => {
      audio.explode();
      showBlast(pos);
      for (const bot of bots.bots) {
        if (!bot.alive) continue;
        const d = Math.hypot(bot.position.x - pos.x, bot.position.z - pos.z);
        if (d < 12) bots.damageBot(bot, 500 * (1 - d / 12), null, botEnv());
      }
      const pd = Math.hypot(body.position.x - pos.x, body.position.z - pos.z);
      if (body.alive && pd < 12) {
        const died = player.damage(500 * (1 - pd / 12));
        if (died) onPlayerDeath(null);
      }
    });
  }
  bots.syncPlayerTarget(body);
  if (blastAge > 0) {
    blastAge += dt;
    const t = blastAge / 0.5;
    blastShell.scale.setScalar(1 + t * 4);
    blastShell.material.opacity = Math.max(0, 0.5 * (1 - t));
    blastLight.intensity = Math.max(0, 40 * (1 - t));
    if (blastAge > 0.5) { blastShell.visible = false; blastLight.intensity = 0; blastAge = 0; }
  }
  if (tracerTime > 0) {
    tracerTime -= dt;
    tracer.material.opacity = Math.max(0, tracerTime / 0.06) * 0.9;
  }
  shotsThisStep = [];
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const pressed = input.takePress();
    if (state.phase === PHASE.LIVE && body.alive) {
      const def = weapons.def();
      if (def.auto) {
        if (input.state.firing && weapons.ready()) shoot(weapons.spread(player.groundSpeed()));
      } else if (pressed.has('Mouse0') && weapons.ready()) {
        shoot(weapons.spread(player.groundSpeed()));
      }
      if (pressed.has('Digit4') && weapons.frags() > 0) {
        camera.getWorldDirection(direction);
        tmpVec.copy(camera.position).addScaledVector(direction, 0.5);
        weapons.throwFrag(tmpVec, direction);
      }
    }
    if (pressed.has('KeyR')) weapons.reload();
    if (state.phase === PHASE.BUY) {
      // Buy phase: keys 1-4 buy (the mouse is pointer-locked, so the menu
      // rows can't be clicked). Outside buy phase the same keys switch
      // weapons, and 4 throws a frag.
      if (pressed.has('Digit1')) buyItem(0);
      if (pressed.has('Digit2')) buyItem(1);
      if (pressed.has('Digit3')) buyItem(2);
      if (pressed.has('Digit4')) buyItem('frag');
    } else {
      if (pressed.has('Digit1')) weapons.switchTo(0);
      if (pressed.has('Digit2')) weapons.switchTo(1);
      if (pressed.has('Digit3')) weapons.switchTo(2);
    }
    if (pressed.has('KeyB') && state.phase === PHASE.BUY) {
      buyVisible = !buyVisible;
      if (buyVisible) hud.showBuy(state.money, weapons.owned, weapons.frags());
      else hud.hideBuy();
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    hud.setTimer(state.timer, state.phase);
    hud.setCrosshairGap(6 + weapons.spread(player.groundSpeed()) * 1400);
    syncHud();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function placeBot(bot, x, z, yaw) {
  bot.group.position.set(x, 0, z);
  bot.yaw = yaw;
  bot.group.rotation.y = yaw;
  bot.node = nearestNode(world.waypoints, x, z);
  bot.path = [];
  bot.pathIndex = 0;
  bot.state = 'hold';
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  rounds.startMatch();
  if (name === 'buy') {
    state.money = 4350;
    hud.showBuy(state.money, weapons.owned, weapons.frags());
    settle(10);
    syncCamera();
    syncHud();
  } else if (name === 'play') {
    state.phase = PHASE.LIVE;
    state.timer = 87;
    state.wins.ember = 2;
    state.wins.ash = 1;
    state.round = 4;
    state.money = 1200;
    hud.hideBuy();
    hud.hideOverlay();
    hud.banner('Defend the sites', 'Round 4 · first to 5');
    player.damage(22);
    body.position.set(0, 0, 2);
    body.yaw = 0;
    body.pitch = 0;
    // Foes face away (north, toward the sites) so the player is outside their
    // vision cone: the short shooting window below ends before they can turn,
    // acquire and return fire.
    const foe = bots.bots.find((b) => b.team === SIDE.ASH);
    const foe2 = bots.bots.find((b) => b.team === SIDE.ASH && b !== foe);
    if (foe) placeBot(foe, 0, -8, 0);
    if (foe2) placeBot(foe2, -8, -8, 0);
    settle(2);
    if (foe) {
      aimAt(tmpVec.set(foe.position.x, 1.2, foe.position.z));
      shoot(0);
      settle(10);
      aimAt(tmpVec.set(foe.position.x, 1.2, foe.position.z));
      shoot(0);
      settle(10);
      aimAt(tmpVec.set(foe.position.x, 1.2, foe.position.z));
      shoot(0);
      settle(2); // keep the last muzzle flash lit for the frame
    }
    syncHud();
  } else if (name === 'bomb') {
    state.phase = PHASE.LIVE;
    state.timer = 71;
    state.wins.ember = 1;
    state.wins.ash = 1;
    state.round = 3;
    hud.hideBuy();
    hud.hideOverlay();
    hud.hideBanner();
    bomb.plant('A', state.bomb);
    state.bomb.timer = 28;
    body.position.set(-11, 0, -9);
    body.yaw = Math.PI / 2;
    body.pitch = 0;
    const holder = bots.bots.find((b) => b.team === SIDE.ASH);
    const mate = bots.bots.find((b) => b.team === SIDE.EMBER);
    if (holder) placeBot(holder, -14, -11, -2.16);
    if (mate) placeBot(mate, -14, -6, -0.79);
    settle(10);
    aimAt(tmpVec.set(-16, 1.0, -9));
    hud.setBomb('BOMB PLANTED — 28s · SITE A');
    syncHud();
  } else {
    // end: round-end overlay over the yard.
    state.phase = PHASE.ROUND_END;
    state.wins.ember = 3;
    state.wins.ash = 2;
    state.round = 6;
    hud.hideBuy();
    hud.hideBanner();
    body.position.set(0, 0, 8);
    body.yaw = 0;
    body.pitch = 0;
    settle(10);
    syncCamera();
    hud.showOverlay('round', {
      title: 'EMBER takes the round',
      copy: 'Enemy team eliminated. +$3250 · Score EMBER 3 — 2 ASH.',
    });
    syncHud();
  }
  hud.setTimer(state.timer, state.phase);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
syncHud();
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
