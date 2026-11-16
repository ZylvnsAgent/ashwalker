// ASHWALKER: boot and the one loop. A fixed 60 Hz simulation feeds a render at
// the display's rate. ?shot=buy|play|bomb|end with &seed=N sets up a deterministic
// frame for a capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createState, PHASE, SIDE, ROUND_TIME, BOMB_TIME, PLANT_TIME, DEFUSE_TIME } from './state.js';
import { createWorld, nearestNode } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS, FRAG, SHIELDS, SWITCH_KEY } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';

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
// Debug hook for the headless verification drivers (same pattern as
// window.__shotReady): lets a driver traverse the scene and assert e.g.
// that no hand meshes exist anywhere.
window.__scene = scene;
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
const effects = createEffects(scene);
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;

// Preallocated temps: the hot loop allocates nothing.
const direction = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tracerMid = new THREE.Vector3();
const tracerDir = new THREE.Vector3();
const tracerUp = new THREE.Vector3(0, 1, 0);
const pelletDir = new THREE.Vector3(); // per-pellet ray direction (shotgun)
const hitNormal = new THREE.Vector3();
const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }));
tracer.frustumCulled = false;
scene.add(tracer);
// Tracer glow: a thin additive cylinder along the shot, so the beam reads
// as a hot streak instead of a 1 px line. Reused for every shot.
const tracerGlow = new THREE.Mesh(
  new THREE.CylinderGeometry(0.035, 0.035, 1, 6, 1, true),
  new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc06a'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
);
tracerGlow.frustumCulled = false;
scene.add(tracerGlow);
let tracerTime = 0;

let playerTeam = SIDE.EMBER;
let bombCarrier = 'player'; // 'player' | bot object | null (planted/dropped)
let elapsed = 0;
let frozen = false;
let started = false;
let overviewCam = false; // ?shot=overview: top-down map camera
let accumulator = 0;
let lastTime = performance.now();
let shotsThisStep = [];
let plantHeld = false;
let fullMapOpen = false;

// Match kill/death totals, keyed by name (bot objects are recreated every
// round, so per-bot counters would reset — the scoreboard needs match
// totals). Reset on round 1 spawn; the player entry mirrors state.kills.
const matchStats = new Map();
function ensureStats(name, team) {
  if (!matchStats.has(name)) matchStats.set(name, { name, team, kills: 0, deaths: 0 });
  return matchStats.get(name);
}
// Kill streaks, keyed by name (same lifetime as matchStats, but per-life:
// a streak ends the moment its owner dies, and resets every round in
// spawnAll). `multi` counts kills inside a rolling window; `streak` counts
// consecutive kills since the last death; `hs` counts consecutive headshot
// kills (a non-headshot kill or a death breaks it). Drives the on-screen
// kill notifications for the PLAYER only — bots feed the streaks (so killing
// a streaking bot can be a CHAIN STOPPER) but never see the banner.
const MULTI_WINDOW = 5; // sim seconds between kills to keep a multi-kill chain
const STOPPER_STREAK = 4; // victim streak that makes your kill a CHAIN STOPPER (a chain killer)
const CHAIN_STREAK = 4; // your streak that makes a kill a CHAIN KILLER
const ACE_STREAK = 5; // your streak that makes a kill an ACE (all 5 enemies dead)
const streaks = new Map(); // name -> { streak, multi, lastAt, hs }
function streakOf(name) {
  if (!streaks.has(name)) streaks.set(name, { streak: 0, multi: 0, lastAt: -1e9, hs: 0 });
  return streaks.get(name);
}
// First blood: the first kill of the match, exactly once. Reset when a new
// match starts (spawnAll, round 1) — if round 1 somehow ends kill-less,
// round 2's first kill still draws it, since it is the match's first kill.
let firstBloodDrawn = false;
// One place for every kill: stats + Point Blank feed line. killerName may
// be 'YOU', a bot name, or 'BOMB' (bomb detonation — feed line only, no
// stats entry). Pass null as killerName for a death with no killer.
function recordKill(killerName, killerTeam, victimName, victimTeam, weaponId, headshot, countKiller = true) {
  // Streaks first: the victim's chain ends; the killer's chain grows.
  const victimStreak = streakOf(victimName);
  const victimWasStreak = victimStreak.streak;
  victimStreak.streak = 0;
  victimStreak.multi = 0;
  victimStreak.hs = 0;
  let killerStreak = null;
  if (killerName && countKiller) {
    ensureStats(killerName, killerTeam).kills += 1;
    killerStreak = streakOf(killerName);
    killerStreak.streak += 1;
    killerStreak.multi = (elapsed - killerStreak.lastAt <= MULTI_WINDOW) ? killerStreak.multi + 1 : 1;
    killerStreak.lastAt = elapsed;
    if (headshot) killerStreak.hs += 1; else killerStreak.hs = 0;
  }
  ensureStats(victimName, victimTeam).deaths += 1;
  if (killerName === 'YOU') state.kills += 1;
  if (victimName === 'YOU') state.deaths += 1;
  if (killerName) {
    hud.killfeedKill({ killer: killerName, killerTeam, weapon: weaponId, victim: victimName, victimTeam, headshot });
  }
  // First blood: the first kill of the match draws it, exactly once, and
  // names the killer. Fires for any killer (player or bot) — bomb kills
  // (countKiller false) and no-killer deaths don't draw it.
  if (!firstBloodDrawn && killerName && countKiller) {
    firstBloodDrawn = true;
    hud.killNotify('firstblood', killerName, elapsed);
  }
  // Player kill notifications. A kill shows one banner per ladder, the
  // highest tier it reaches — kill ladder double < triple < chain killer
  // < ace, headshot ladder headshot < chain headshot — so the 5th kill
  // shows ACE, not ACE + CHAIN KILLER. Several banners from one kill queue
  // in order (e.g. FIRST BLOOD + HEADSHOT, ACE + CHAIN HEADSHOT) — hud
  // shows them in order, ~2s each.
  if (killerName === 'YOU' && killerStreak) {
    let tier = null;
    if (killerStreak.streak >= ACE_STREAK) tier = 'ace';
    else if (killerStreak.streak === CHAIN_STREAK) tier = 'chain';
    else if (killerStreak.multi === 3) tier = 'triple';
    else if (killerStreak.multi === 2) tier = 'double';
    if (tier) hud.killNotify(tier, victimName, elapsed);
    if (headshot) {
      if (killerStreak.hs >= 2) hud.killNotify('chainhs', victimName, elapsed);
      else hud.killNotify('headshot', victimName, elapsed);
    }
    if (victimWasStreak >= STOPPER_STREAK) hud.killNotify('stopper', `${victimName} · ${victimWasStreak}-kill streak`, elapsed);
  }
}
// Scoreboard data: current roster (player + 9 bots) with match totals,
// each team sorted by kills desc (ties: fewer deaths, then name).
function scoreboardData() {
  const rows = roster().map((m) => {
    const s = ensureStats(m.name, m.team);
    return { name: m.name, kills: s.kills, deaths: s.deaths, isPlayer: m.name === 'YOU' };
  });
  const byKills = (a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name);
  return {
    ember: rows.filter((r) => matchStats.get(r.name).team === SIDE.EMBER).sort(byKills),
    ash: rows.filter((r) => matchStats.get(r.name).team === SIDE.ASH).sort(byKills),
    wins: state.wins, round: state.round,
  };
}

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
        { team: 'ember', role: 'roam', name: 'Juno', node: 34, yaw: 0 },
        { team: 'ember', role: 'holdA', name: 'Fable', node: 35, yaw: -Math.PI / 2 },
        { team: 'ash', role: 'carrier', name: 'Vex', node: 0, yaw: Math.PI, site: ashSite },
        { team: 'ash', role: 'escort', name: 'Rook', node: 1, yaw: Math.PI, site: ashSite },
        { team: 'ash', role: 'flank', name: 'Moth', node: 2, yaw: Math.PI, site: other },
        { team: 'ash', role: 'escort', name: 'Havoc', node: 32, yaw: Math.PI, site: ashSite },
        { team: 'ash', role: 'flank', name: 'Onyx', node: 33, yaw: Math.PI, site: other },
      ],
    };
  }
  return {
    playerNode: 1, playerYaw: Math.PI,
    bots: [
      { team: 'ash', role: 'escort', name: 'Rook', node: 0, yaw: Math.PI, site: ashSite },
      { team: 'ash', role: 'flank', name: 'Moth', node: 2, yaw: Math.PI, site: other },
      { team: 'ash', role: 'escort', name: 'Havoc', node: 32, yaw: Math.PI, site: ashSite },
      { team: 'ash', role: 'flank', name: 'Onyx', node: 33, yaw: Math.PI, site: other },
      { team: 'ember', role: 'holdA', name: 'Sable', node: 25, yaw: -Math.PI / 2 },
      { team: 'ember', role: 'holdB', name: 'Wren', node: 27, yaw: Math.PI / 2 },
      { team: 'ember', role: 'roam', name: 'Pike', node: 26, yaw: 0 },
      { team: 'ember', role: 'roam', name: 'Juno', node: 34, yaw: 0 },
      { team: 'ember', role: 'holdA', name: 'Fable', node: 35, yaw: -Math.PI / 2 },
    ],
  };
}

function spawnAll(round, side) {
  const setup = buildSetup(side);
  playerTeam = side;
  if (round === 1) { matchStats.clear(); firstBloodDrawn = false; } // fresh match totals + first blood
  streaks.clear(); // streaks are per-life: every round starts fresh
  hud.clearNotify();
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

const BRIEFING_STORY = 'CT-FORCE learned the Free Rebels are moving black-market weapons through this yard. Find the crates. Shut the operation down.';

const rounds = createRounds(state, {
  spawn: spawnAll,
  onPhase(phase) {
    if (phase === PHASE.BUY) {
      // The buy phase runs with a FREE cursor (Valorant/CS style): release
      // pointer lock so the buy-menu buttons — shields especially, which
      // used to be click-only — actually receive mouse clicks. While the
      // lock is held, clicks route to the locked canvas and the menu is
      // unclickable. Re-locked when the live phase starts (below).
      if (document.pointerLockElement) document.exitPointerLock();
      hud.showBuy(state.money, weapons.owned, weapons.frags(), roster(), body.shield);
      hud.showBriefing({
        side: state.playerSide,
        mission: state.playerSide === SIDE.EMBER ? 'Hold the sites. Spend your money.' : 'Take a site and plant the bomb.',
        story: BRIEFING_STORY,
        layout: world.layout, bounds: world.bounds, sites: world.sites,
        player: body.position, bots: bots.bots,
      });
      hud.banner(`Round ${state.round} — Buy phase`, state.playerSide === SIDE.EMBER ? 'Hold the sites. Spend your money.' : 'Take a site and plant the bomb.');
    } else if (phase === PHASE.LIVE) {
      hud.hideBuy();
      hud.hideBriefing();
      hud.banner(state.playerSide === SIDE.EMBER ? 'Defend the sites' : 'Plant the bomb', `Round ${state.round} · first to 5`);
      // Re-lock the pointer for live play. This needs a user gesture: if the
      // player clicked/keyed a buy within the last few seconds the lock
      // engages silently; if they idled through buy phase it fails, so
      // prompt them to click once to resume instead of leaving them
      // lock-less in a live round.
      input.requestLock();
      setTimeout(() => {
        if (state.phase === PHASE.LIVE && !document.pointerLockElement) hud.showOverlay('paused');
      }, 150);
    }
  },
  onRoundEnd(winner, reason, reward) {
    const won = winner === state.playerSide;
    hud.hideBuy();
    fullMapOpen = false;
    hud.hideFullMap();
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
    fullMapOpen = false;
    hud.hideFullMap();
    const acc = state.stats.shots ? Math.round((100 * state.stats.hits) / state.stats.shots) : 0;
    hud.showOverlay('match', {
      title: won ? 'VICTORY — ASHWALKER is yours' : 'DEFEAT — the yard belongs to them',
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
  } else if (state.phase === PHASE.LIVE) {
    // Paused only in live play: the buy phase deliberately runs unlocked
    // (free cursor for the menu), so losing the lock there is not a pause.
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
  // The buy phase runs unlocked (free cursor for the menu), so only re-lock
  // when resuming live play — locking here would re-lock the buy menu the
  // moment it opens.
  if (state.phase === PHASE.LIVE) input.requestLock();
});

function buyItem(index) {
  if (state.phase !== PHASE.BUY) return;
  hud.hideBriefing(); // the briefing is skippable on the first buy action
  if (index === 'frag') {
    if (state.money < FRAG.price) return;
    state.money -= FRAG.price;
    weapons.buyFrag();
    hud.showBuy(state.money, weapons.owned, weapons.frags(), roster(), body.shield);
    hud.setMoney(state.money);
    return;
  }
  if (index === 'shield-light' || index === 'shield-heavy') {
    const def = SHIELDS.find((s) => s.id === index);
    if (!def || body.shield >= def.value || state.money < def.price) return;
    state.money -= def.price;
    player.setShield(def.value);
    hud.showBuy(state.money, weapons.owned, weapons.frags(), roster(), body.shield);
    hud.setMoney(state.money);
    syncHud();
    return;
  }
  const i = Number(index);
  if (weapons.owned[i] || state.money < WEAPONS[i].price) return;
  state.money -= WEAPONS[i].price;
  weapons.buy(i);
  weapons.switchTo(i);
  hud.showBuy(state.money, weapons.owned, weapons.frags(), roster(), body.shield);
  syncHud();
}

// Buy-phase roster for the profile top bar: the player + every spawned bot.
function roster() {
  return [{ name: 'YOU', team: playerTeam, alive: body.alive },
    ...bots.bots.map((b) => ({ name: b.name, team: b.team, alive: b.alive }))];
}

hud.onBuy((index) => buyItem(index));

function syncHud() {
  hud.setHealth(Math.ceil(body.health), body.shield);
  const cur = weapons.current();
  const a = weapons.ammo();
  hud.setWeapons(
    { def: weapons.def(), key: SWITCH_KEY[cur], mag: a.mag, reserve: a.reserve },
    secondarySlot(),
  );
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

// Secondary weapon slot: the pistol when a primary is current; otherwise the
// highest owned primary (or the frag if the pistol is the only weapon owned).
function secondarySlot() {
  const cur = weapons.current();
  if (cur !== 0) {
    const a = weapons.ammoOf(0);
    return { def: WEAPONS[0], key: SWITCH_KEY[0], mag: a.mag, reserve: a.reserve };
  }
  for (let i = WEAPONS.length - 1; i >= 1; i -= 1) {
    if (weapons.owned[i]) {
      const a = weapons.ammoOf(i);
      return { def: WEAPONS[i], key: SWITCH_KEY[i], mag: a.mag, reserve: a.reserve };
    }
  }
  return { frag: true, key: '4', count: weapons.frags() };
}

function syncCamera() {
  if (overviewCam) {
    // Top-down: 34 m above the yard, map north (ASH spawn, -z) at the top.
    camera.position.set(0, 34, 0.01);
    camera.lookAt(0, 0, 0);
    return;
  }
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
  const def = weapons.def();
  const pellets = def.pellets || 1;
  camera.getWorldDirection(direction);
  if (pellets === 1) {
    // Single-ray weapons take the spread on the centre ray.
    direction.x += (random() * 2 - 1) * spread;
    direction.y += (random() * 2 - 1) * spread;
    direction.z += (random() * 2 - 1) * spread;
  }
  direction.normalize();
  scene.updateMatrixWorld(true);
  const targets = world.shootables.concat(bots.hitMeshes);
  let firstHit = null;
  for (let p = 0; p < pellets; p += 1) {
    pelletDir.copy(direction);
    if (pellets > 1) {
      // Each pellet gets its own direction inside the spread cone.
      pelletDir.x += (random() * 2 - 1) * spread;
      pelletDir.y += (random() * 2 - 1) * spread;
      pelletDir.z += (random() * 2 - 1) * spread;
      pelletDir.normalize();
    }
    raycaster.set(camera.position, pelletDir);
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (p === 0) firstHit = hit;
    if (hit && hit.object.userData.bot) {
      const victim = hit.object.userData.bot;
      if (!victim.alive) continue; // a later pellet can't hit a dead bot
      const isHead = hit.object.userData.part === 'head';
      const dist = hit.distance;
      const falloff = Math.max(0.4, 1 - dist / 90);
      const amount = def.damage * falloff * (isHead ? def.headMult : 1);
      state.stats.hits += 1;
      if (isHead) state.stats.headshots += 1;
      const killed = bots.damageBot(victim, amount, body, botEnv());
      hud.hitMarker(killed, shot ? 4000 : 90);
      audio.hit(isHead);
      if (killed) {
        state.money += 300;
        recordKill('YOU', playerTeam, victim.name || 'Bot', victim.team, def.id, isHead);
        hud.setMoney(state.money);
        if (bombCarrier === victim) {
          bomb.drop(victim.position, state.bomb);
          bombCarrier = null;
          hud.killfeed('Bomb dropped', false);
        }
      }
    }
  }
  // Tracer + impact effects follow the centre ray only.
  const muzzle = tmpVec.copy(camera.position).addScaledVector(direction, 0.6);
  tmpRight.crossVectors(direction, camera.up).normalize();
  muzzle.addScaledVector(tmpRight, 0.15);
  muzzle.y -= 0.12;
  const end = firstHit ? firstHit.point : tmpVec2.copy(camera.position).addScaledVector(direction, 60);
  const tracerPos = tracerGeo.attributes.position;
  tracerPos.setXYZ(0, muzzle.x, muzzle.y, muzzle.z);
  tracerPos.setXYZ(1, end.x, end.y, end.z);
  tracerPos.needsUpdate = true;
  tracer.material.opacity = 0.9;
  tracerMid.copy(muzzle).add(end).multiplyScalar(0.5);
  tracerDir.copy(end).sub(muzzle);
  const tracerLen = tracerDir.length();
  tracerDir.normalize();
  tracerGlow.position.copy(tracerMid);
  tracerGlow.quaternion.setFromUnitVectors(tracerUp, tracerDir);
  tracerGlow.scale.set(1, tracerLen, 1);
  tracerGlow.material.opacity = 0.55;
  tracerTime = 0.12;
  // Impact effects: sparks + dust + a scorch mark on the world, sparks only
  // on a bot (no decal on a moving body).
  if (firstHit && firstHit.face) {
    if (firstHit.object.userData.bot) {
      hitNormal.copy(direction).multiplyScalar(-1);
      effects.spark(firstHit.point, hitNormal);
    } else {
      hitNormal.copy(firstHit.face.normal).transformDirection(firstHit.object.matrixWorld);
      effects.impact(firstHit.point, hitNormal);
    }
  }
  shotsThisStep.push({ x: body.position.x, z: body.position.z });
  weapons.pullTrigger();
  player.recoil(def.recoil + random() * 0.004, (random() * 2 - 1) * 0.004);
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
        state.money += 300;
        recordKill('YOU', playerTeam, bot.name || 'Bot', bot.team, 'frag', false);
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

function onPlayerDeath(killer, headshot = false) {
  if (killer) recordKill(killer.name || 'Bot', killer.team, 'YOU', playerTeam, 'rifle', headshot);
  else {
    ensureStats('YOU', playerTeam).deaths += 1;
    state.deaths += 1;
    streakOf('YOU').streak = 0; // no-killer death still ends the streak
    streakOf('YOU').multi = 0;
    hud.killfeed('You are down', false);
  }
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
      if (died) onPlayerDeath(bot, head);
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
    onBotKilled(victim, attacker, headshot = false) {
      if (attacker && attacker !== body && victim) {
        // Bot-vs-bot kill (bots all carry rifles). Player kills are
        // recorded by the shooter's own code, not here.
        recordKill(attacker.name || 'Bot', attacker.team, victim.name || 'Bot', victim.team, 'rifle', headshot);
      } else if (!attacker && victim) {
        // Bomb detonation kill: feed line only, no killer stats entry.
        recordKill('BOMB', SIDE.ASH, victim.name || 'Bot', victim.team, 'frag', false, false);
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
let blastScale = 1;

function showBlast(pos, scale = 1) {
  blastShell.position.set(pos.x, Math.max(0.6, pos.y), pos.z);
  blastLight.position.copy(blastShell.position);
  blastShell.visible = true;
  blastAge = 0.001;
  blastScale = scale;
  // Full explosion treatment: fireball, smoke plume, debris, shockwave ring.
  effects.explosion(pos, scale);
}

// Minimap: live play only, redrawn at ~4 Hz, hidden otherwise — never in the
// buy phase / weapon shop, where it used to dock bottom-right and overlap
// the Heavy Shield card.
let minimapAcc = 0;
function refreshMinimap() {
  const visible = state.phase === PHASE.LIVE;
  hud.setMinimapVisible(visible);
  if (visible) hud.updateMinimap(world.layout, world.bounds, world.sites, body, bots.bots, state.bomb);
}

// Bomb carrier position for the full-map marker (player or a bot).
function bombCarrierPos() {
  if (state.bomb.state !== 'carried') return null;
  if (bombCarrier === 'player') return body.position;
  if (bombCarrier && bombCarrier.position) return bombCarrier.position;
  return null;
}
function refreshFullMap() {
  hud.updateFullMap(world.layout, world.bounds, world.sites, body, bots.bots, state.bomb, bombCarrierPos());
}

let buyVisible = false;

function step(dt) {
  elapsed += dt;
  hud.tickNotify(elapsed);
  rounds.update(dt, { player: { alive: body.alive, team: playerTeam }, bots: bots.bots });
  if (state.phase === PHASE.LIVE || state.phase === PHASE.BUY) {
    player.step(dt, input.state.keys);
  }
  weapons.step(dt, explodeGrenade);
  effects.update(dt);
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
      showBlast(pos, 2.2); // bomb detonation: more than double a grenade
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
    blastShell.scale.setScalar((1 + t * 5) * blastScale);
    blastShell.material.opacity = Math.max(0, 0.5 * (1 - t));
    blastLight.intensity = Math.max(0, 60 * blastScale * (1 - t));
    if (blastAge > 0.5) { blastShell.visible = false; blastLight.intensity = 0; blastAge = 0; }
  }
  if (tracerTime > 0) {
    tracerTime -= dt;
    const fade = Math.max(0, tracerTime / 0.12);
    tracer.material.opacity = fade * 0.9;
    tracerGlow.material.opacity = fade * 0.55;
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
      // Buy phase: keys 1-3, 5-7 buy weapons, 4 buys a frag, 8/9 buy the
      // shields. The mouse is free in buy phase (pointer lock released),
      // so the menu rows are clickable too — keys are the no-mouse backup.
      if (pressed.has('Digit1')) buyItem(0);
      if (pressed.has('Digit2')) buyItem(1);
      if (pressed.has('Digit3')) buyItem(2);
      if (pressed.has('Digit4')) buyItem('frag');
      if (pressed.has('Digit5')) buyItem(3);
      if (pressed.has('Digit6')) buyItem(4);
      if (pressed.has('Digit7')) buyItem(5);
      if (pressed.has('Digit8')) buyItem('shield-light');
      if (pressed.has('Digit9')) buyItem('shield-heavy');
    } else {
      if (pressed.has('Digit1')) weapons.switchTo(0);
      if (pressed.has('Digit2')) weapons.switchTo(1);
      if (pressed.has('Digit3')) weapons.switchTo(2);
      if (pressed.has('Digit5')) weapons.switchTo(3);
      if (pressed.has('Digit6')) weapons.switchTo(4);
      if (pressed.has('Digit7')) weapons.switchTo(5);
    }
    if (pressed.has('KeyB') && state.phase === PHASE.BUY) {
      buyVisible = !buyVisible;
      if (buyVisible) hud.showBuy(state.money, weapons.owned, weapons.frags(), roster(), body.shield);
      else hud.hideBuy();
    }
    // Scoreboard: hold TAB (live / buy / round end). Full map: M toggles,
    // independently of TAB — both overlays can be open at once.
    const tabHeld = input.state.keys.has('Tab')
      && (state.phase === PHASE.LIVE || state.phase === PHASE.BUY || state.phase === PHASE.ROUND_END);
    if (tabHeld) hud.showScoreboard(scoreboardData());
    else hud.hideScoreboard();
    if (pressed.has('KeyM') && (state.phase === PHASE.LIVE || state.phase === PHASE.BUY)) {
      fullMapOpen = !fullMapOpen;
      if (fullMapOpen) { hud.showFullMap(state.round, state.wins); refreshFullMap(); }
      else hud.hideFullMap();
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
    minimapAcc += dt;
    if (minimapAcc >= 0.25) {
      minimapAcc = 0;
      refreshMinimap();
      if (fullMapOpen) refreshFullMap();
    }
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
  hud.hideBriefing(); // deterministic shots hide it unless the mode is 'briefing'
  if (name === 'buy') {
    // ?shot=buy&money=N overrides the buy-phase wallet for click tests.
    state.money = Number(params.get('money') ?? 4350);
    hud.showBuy(state.money, weapons.owned, weapons.frags(), roster(), body.shield);
    settle(10);
    syncCamera();
    syncHud();
    refreshMinimap();
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
    // The combat frame shows the bought weapon: ?shot=play&weapon=N picks
    // it (default VK-7), &shield=N pre-buys shield so the HUD shows it.
    // Shield is set first so the 22 test damage is absorbed by it.
    const shotWeapon = Number(params.get('weapon') ?? 2);
    const shotShield = Number(params.get('shield') ?? 0);
    if (shotShield > 0) player.setShield(shotShield);
    player.damage(22);
    weapons.buy(shotWeapon);
    weapons.switchTo(shotWeapon);
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
    refreshMinimap();
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
    refreshMinimap();
  } else if (name === 'overview') {
    // Top-down map overview (Cargo Grid briefing style): HUD off, viewmodels
    // hidden, fog off, camera 34 m above the yard looking straight down.
    document.getElementById('hud').style.display = 'none';
    hud.hideOverlay();
    hud.hideBuy();
    hud.hideBanner();
    weapons.hideAll();
    scene.fog = null;
    overviewCam = true;
    camera.up.set(0, 0, -1);
    state.phase = PHASE.LIVE;
    state.timer = 87;
    state.wins.ember = 2;
    state.wins.ash = 1;
    state.round = 4;
    body.position.set(0, 0, 2);
    body.yaw = 0;
    body.pitch = 0;
    settle(10);
    syncCamera();
    syncHud();
  } else if (name === 'briefing') {
    // Round-start briefing over the buy screen: top-down map + team/mission.
    state.money = 4350;
    hud.showBuy(state.money, weapons.owned, weapons.frags(), roster(), body.shield);
    hud.showBriefing({
      side: state.playerSide,
      mission: state.playerSide === SIDE.EMBER ? 'Hold the sites. Spend your money.' : 'Take a site and plant the bomb.',
      story: BRIEFING_STORY,
      layout: world.layout, bounds: world.bounds, sites: world.sites,
      player: body.position, bots: bots.bots,
    });
    settle(10);
    syncCamera();
    syncHud();
    refreshMinimap();
  } else if (name === 'feed') {
    // Kill-feed showcase: three PB-format lines (one headshot) + one event line.
    state.phase = PHASE.LIVE;
    state.timer = 87;
    state.wins.ember = 2;
    state.wins.ash = 1;
    state.round = 4;
    hud.hideBuy();
    hud.hideOverlay();
    body.position.set(0, 0, 2);
    body.yaw = 0;
    body.pitch = 0;
    recordKill('Sable', SIDE.EMBER, 'Vex', SIDE.ASH, 'rifle', false);
    recordKill('YOU', playerTeam, 'Rook', SIDE.ASH, 'rifle', true);
    recordKill('Juno', SIDE.EMBER, 'Moth', SIDE.ASH, 'smg', false);
    hud.killfeed('Bomb dropped', false);
    settle(10);
    syncCamera();
    syncHud();
    refreshMinimap();
  } else if (name === 'notify') {
    // Kill-notification showcase: seed streak state, then fire exactly one
    // notification of the requested kind (?shot=notify&kind=headshot|double|
    // triple|chain|stopper|firstblood|ace) through the real recordKill path,
    // so the feed line lands too. The banner is sim-time driven, so it stays
    // up in the frozen frame. Feed lines are held 60s here (showcase only —
    // real play keeps 6s) so a slow still can catch them.
    hud.setFeedLifetime(60000);
    // First blood, ace and chain killer go through a REAL VK-7 headshot
    // kill instead (like the cover frame), so the muzzle flash is in frame
    // too: first blood is the match's first kill (round 1); ace seeds the
    // streak to 4 so this kill is the 5th (all enemies dead); chain seeds
    // it to 3 so this kill is the 4th (chain killer).
    state.phase = PHASE.LIVE;
    state.timer = 87;
    state.wins.ember = 2;
    state.wins.ash = 1;
    state.round = 4;
    hud.hideBuy();
    hud.hideOverlay();
    body.position.set(0, 0, 2);
    body.yaw = 0;
    body.pitch = 0;
    const kind = params.get('kind') || 'headshot';
    if (kind === 'firstblood' || kind === 'ace' || kind === 'chain') {
      state.round = 1;
      state.wins.ember = 0;
      state.wins.ash = 0;
      state.money = 1200;
      // Ace's and chain's seeded streaks imply prior kills already drew
      // first blood; a real first-blood kill starts with it undrawn.
      firstBloodDrawn = kind !== 'firstblood';
      const you = streakOf('YOU');
      if (kind === 'ace') { you.streak = 4; you.multi = 3; you.lastAt = elapsed; }
      else if (kind === 'chain') { you.streak = 3; you.multi = 3; you.lastAt = elapsed; }
      weapons.buy(2);
      weapons.switchTo(2);
      const foe = bots.bots.find((b) => b.team === SIDE.ASH);
      if (foe) placeBot(foe, 0, -8, 0);
      settle(2);
      if (foe) {
        aimAt(tmpVec.set(foe.position.x, 1.50, foe.position.z));
        shoot(0);
        settle(2); // keep the last muzzle flash lit for the frame
      }
      // Once-per-match proof: a second kill in the same page must NOT draw
      // first blood again (?shot=notify&kind=firstblood&twice=1). Snapshot
      // the queue right after — showing + queued is the ground truth.
      if (params.get('twice') && kind === 'firstblood') {
        const foe2 = bots.bots.find((b) => b.team === SIDE.ASH && b.alive);
        if (foe2) {
          placeBot(foe2, 0, -8, 0);
          aimAt(tmpVec.set(foe2.position.x, 1.50, foe2.position.z));
          shoot(0);
          settle(2);
        }
        window.__notifyQueue = hud.notifyQueue();
      }
    } else {
      const you = streakOf('YOU');
      const vex = streakOf('Vex');
      // Seeded streaks imply prior kills already drew first blood, so the
      // showcased kill doesn't — first blood has its own kind above.
      firstBloodDrawn = true;
      if (kind === 'double') { you.streak = 1; you.multi = 1; you.lastAt = elapsed; }
      else if (kind === 'triple') { you.streak = 2; you.multi = 2; you.lastAt = elapsed; }
      else if (kind === 'chainhs') { you.hs = 1; }
      else if (kind === 'stopper') { vex.streak = 4; vex.multi = 4; vex.lastAt = elapsed; }
      if (kind === 'stopper') recordKill('YOU', playerTeam, 'Vex', SIDE.ASH, 'rifle', false);
      else recordKill('YOU', playerTeam, 'Rook', SIDE.ASH, 'rifle', kind === 'headshot' || kind === 'chainhs');
      settle(2);
    }
    syncCamera();
    syncHud();
    refreshMinimap();
  } else if (name === 'cover') {
    // Cover frame: the player scores a HEADSHOT kill with the VK-7 while
    // firing. One headshot at 10 m deals ~121 dmg vs 100 HP, so a single
    // aimed shot drops the foe; the HEADSHOT banner and the feed line are
    // both in frame, muzzle flash still lit.
    state.phase = PHASE.LIVE;
    state.timer = 87;
    state.wins.ember = 2;
    state.wins.ash = 1;
    state.round = 4;
    state.money = 1200;
    hud.hideBuy();
    hud.hideOverlay();
    weapons.buy(2);
    weapons.switchTo(2);
    body.position.set(0, 0, 2);
    body.yaw = 0;
    body.pitch = 0;
    const foe = bots.bots.find((b) => b.team === SIDE.ASH);
    if (foe) placeBot(foe, 0, -8, 0);
    settle(2);
    if (foe) {
      aimAt(tmpVec.set(foe.position.x, 1.50, foe.position.z));
      shoot(0);
      settle(2); // keep the last muzzle flash lit for the frame
    }
    syncHud();
    refreshMinimap();
  } else if (name === 'scoreboard') {
    // Scoreboard showcase: seed match totals, TAB panel open.
    state.phase = PHASE.LIVE;
    state.timer = 71;
    state.wins.ember = 2;
    state.wins.ash = 1;
    state.round = 4;
    hud.hideBuy();
    hud.hideOverlay();
    body.position.set(0, 0, 2);
    body.yaw = 0;
    body.pitch = 0;
    const seed = [
      ['YOU', SIDE.EMBER, 7, 2], ['Sable', SIDE.EMBER, 5, 3], ['Wren', SIDE.EMBER, 3, 4],
      ['Juno', SIDE.EMBER, 2, 2], ['Fable', SIDE.EMBER, 1, 5],
      ['Vex', SIDE.ASH, 6, 4], ['Rook', SIDE.ASH, 4, 3], ['Moth', SIDE.ASH, 3, 6],
      ['Havoc', SIDE.ASH, 2, 1], ['Onyx', SIDE.ASH, 0, 3],
    ];
    for (const [n, t, k, d] of seed) {
      const s = ensureStats(n, t);
      s.kills = k;
      s.deaths = d;
    }
    state.kills = 7;
    state.deaths = 2;
    hud.showScoreboard(scoreboardData());
    settle(10);
    syncCamera();
    syncHud();
    refreshMinimap();
  } else if (name === 'fullmap') {
    // Full-map showcase: M overlay open over live play.
    state.phase = PHASE.LIVE;
    state.timer = 87;
    state.wins.ember = 2;
    state.wins.ash = 1;
    state.round = 4;
    hud.hideBuy();
    hud.hideOverlay();
    body.position.set(0, 0, 2);
    body.yaw = 0;
    body.pitch = 0;
    fullMapOpen = true;
    hud.showFullMap(state.round, state.wins);
    refreshFullMap();
    settle(10);
    syncCamera();
    syncHud();
    refreshMinimap();
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
    window.__painted = painted; // harness hook: frames presented so far
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
