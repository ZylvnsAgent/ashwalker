// The DOM HUD: crosshair, health, ammo, money, timer, score, alive pips, kill feed,
// bomb status, round banner, buy menu and the overlay panels. It never touches the
// simulation; main.js pushes numbers in and reads callbacks out. DOM writes are
// cached so unchanged values never touch the document.
import { WEAPONS, FRAG, SHIELDS, SWITCH_KEY } from './weapons.js';

const COPY = {
  start: { title: 'ASHWALKER', copy: 'A dusk container yard. Two sites, three lanes, one bomb. Hold the sites — or take one.', action: 'Click to play' },
  paused: { title: 'ASHWALKER', copy: 'Paused. Click to resume.', action: 'Click to resume' },
  round: { title: '', copy: '', action: 'Next round' },
  match: { title: '', copy: '', action: 'Play again' },
};

// Shared top-down map renderer for the minimap, the full map and the
// briefing panel: walls/containers as rects, site zones with letters, team
// dots + bomb dot. `circle` clips the drawing to an inscribed circle
// (the minimap is round).
function drawTopDown(ctx, W, H, layout, bounds, sites, dots, circle = false) {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (circle) {
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, Math.min(W, H) / 2, 0, Math.PI * 2);
    ctx.clip();
  }
  ctx.fillStyle = 'rgba(22,16,9,0.92)';
  ctx.fillRect(0, 0, W, H);
  const pad = 6;
  const bw = bounds.maxX - bounds.minX;
  const bd = bounds.maxZ - bounds.minZ;
  const s = Math.min((W - pad * 2) / bw, (H - pad * 2) / bd);
  const ox = (W - bw * s) / 2;
  const oy = (H - bd * s) / 2;
  const px = (x) => ox + (x - bounds.minX) * s;
  const pz = (z) => oy + (z - bounds.minZ) * s;
  ctx.fillStyle = '#6b5a3a';
  for (const r of layout) {
    ctx.fillRect(px(r.x - r.w / 2), pz(r.z - r.d / 2), Math.max(1, r.w * s), Math.max(1, r.d * s));
  }
  for (const key of ['A', 'B']) {
    const site = sites[key];
    ctx.fillStyle = 'rgba(63,174,138,0.25)';
    ctx.fillRect(px(site.center.x - site.half), pz(site.center.z - site.half), site.half * 2 * s, site.half * 2 * s);
    ctx.fillStyle = '#3fae8a';
    ctx.font = `bold ${Math.max(10, 3 * s)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(key, px(site.center.x), pz(site.center.z));
  }
  for (const dot of dots) {
    ctx.fillStyle = dot.color;
    ctx.beginPath();
    ctx.arc(px(dot.x), pz(dot.z), dot.r || 3, 0, Math.PI * 2);
    ctx.fill();
    if (dot.yaw !== undefined) {
      const len = 2.5 * s;
      ctx.strokeStyle = dot.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px(dot.x), pz(dot.z));
      ctx.lineTo(px(dot.x) - Math.sin(dot.yaw) * len, pz(dot.z) - Math.cos(dot.yaw) * len);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const shieldBlock = $('shield-block');
  const shieldNum = $('shield-num');
  const slotCurrent = $('slot-current');
  const slotSecondary = $('slot-secondary');
  const moneyEl = $('money-value');
  const timerEl = $('timer-value');
  const scoreEl = $('score-value');
  const aliveEl = $('alive');
  const feedEl = $('killfeed');
  const bannerEl = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  // Kill notifications (CoDM-style medal + label, mid-screen): one element,
  // fed by a queue. Visibility is driven by SIM time (tickNotify), not wall
  // time, so a notification stays up in the frozen ?shot= harness frames.
  const notifyEl = $('kill-notify');
  const notifyMedal = $('kn-medal');
  const notifyLabel = $('kn-label');
  const notifySub = $('kn-sub');
  const NOTIFY_SHOW_S = 2; // sim seconds per notification
  let notifyQueue = [];
  let notifyShowing = null; // { kind, until }
  // Kill-feed line lifetime (wall ms). Real gameplay: 6s. The ?shot=
  // showcase driver may hold lines longer so a slow still can catch them —
  // main.js sets it only inside runShot, never in real play.
  let feedLifetimeMs = 6000;
  // Winged medal per kind: red for headshot tiers, gold for streak tiers.
  // The glyph is a skull (headshot), a skull ×2 (chain headshot), the multi
  // count, a star (chain killer), an A (ace), a blood drop (first blood),
  // or broken chain links (chain stopper).
  function medalSVG(kind) {
    const main = (kind === 'headshot' || kind === 'chainhs') ? '#e14b4b' : '#ffd23c';
    const dark = '#161009';
    const glyphs = {
      headshot: `<circle cx="32" cy="29" r="10" fill="${dark}"/><rect x="27" y="37" width="10" height="6" rx="1.5" fill="${dark}"/><circle cx="28" cy="28" r="2.4" fill="${main}"/><circle cx="36" cy="28" r="2.4" fill="${main}"/>`,
      chainhs: `<circle cx="32" cy="25" r="8" fill="${dark}"/><rect x="28" y="32" width="8" height="5" rx="1.5" fill="${dark}"/><circle cx="29" cy="24" r="2" fill="${main}"/><circle cx="35" cy="24" r="2" fill="${main}"/><text x="32" y="52" text-anchor="middle" font-size="11" font-weight="800" fill="${dark}" font-family="system-ui, sans-serif">×2</text>`,
      double: `<text x="32" y="41" text-anchor="middle" font-size="26" font-weight="800" fill="${dark}" font-family="system-ui, sans-serif">2</text>`,
      triple: `<text x="32" y="41" text-anchor="middle" font-size="26" font-weight="800" fill="${dark}" font-family="system-ui, sans-serif">3</text>`,
      chain: `<text x="32" y="42" text-anchor="middle" font-size="28" font-weight="800" fill="${dark}" font-family="system-ui, sans-serif">★</text>`,
      ace: `<text x="32" y="42" text-anchor="middle" font-size="26" font-weight="800" fill="${dark}" font-family="system-ui, sans-serif">A</text>`,
      firstblood: `<path d="M32 19 C32 19 23 30 23 36 a9 9 0 0 0 18 0 C41 30 32 19 32 19 Z" fill="${dark}"/>`,
      stopper: `<circle cx="26" cy="32" r="7" fill="none" stroke="${dark}" stroke-width="3"/><circle cx="38" cy="32" r="7" fill="none" stroke="${dark}" stroke-width="3"/><line x1="15" y1="15" x2="49" y2="49" stroke="#e14b4b" stroke-width="4" stroke-linecap="round"/>`,
    };
    return `<svg viewBox="0 0 64 64"><path d="M30 26 L8 14 L15 27 L6 31 L30 38 Z" fill="${main}" opacity="0.95"/><path d="M34 26 L56 14 L49 27 L58 31 L34 38 Z" fill="${main}" opacity="0.95"/><circle cx="32" cy="32" r="19" fill="${main}" stroke="${dark}" stroke-width="2"/><circle cx="32" cy="32" r="15" fill="none" stroke="${dark}" stroke-width="1" opacity="0.5"/>${glyphs[kind] || ''}</svg>`;
  }
  const NOTIFY_LABELS = {
    firstblood: 'FIRST BLOOD',
    headshot: 'HEADSHOT',
    chainhs: 'CHAIN HEADSHOT',
    double: 'DOUBLE KILL',
    triple: 'TRIPLE KILL',
    chain: 'CHAIN KILLER',
    ace: 'ACE',
    stopper: 'CHAIN STOPPER',
  };
  function pumpNotify(now) {
    if (notifyShowing || notifyQueue.length === 0) return;
    const next = notifyQueue.shift();
    notifyShowing = { kind: next.kind, until: now + NOTIFY_SHOW_S };
    notifyMedal.innerHTML = medalSVG(next.kind);
    notifyLabel.textContent = NOTIFY_LABELS[next.kind] || next.kind;
    notifySub.textContent = next.sub || '';
    notifyEl.className = (next.kind === 'headshot' || next.kind === 'chainhs') ? 'red' : 'gold';
    notifyEl.hidden = false;
  }
  const bombEl = $('bomb-status');
  const vignette = $('damage-vignette');
  const buyMenu = $('buy-menu');
  const buyGrid = $('buy-grid');
  const buyTeamEmber = $('buy-team-ember');
  const buyTeamAsh = $('buy-team-ash');
  const buyTimer = $('buy-timer');
  const buyScore = $('buy-score');
  const buyMoney = $('buy-money');
  const topbar = $('topbar');
  const minimap = $('minimap');
  const minimapCtx = minimap.getContext('2d');
  const briefing = $('briefing');
  const briefingMap = $('briefing-map');
  const briefingCtx = briefingMap.getContext('2d');
  const briefingTeam = $('briefing-team');
  const briefingMission = $('briefing-mission');
  const briefingStory = $('briefing-story');
  const scoreboard = $('scoreboard');
  const sbMatch = $('sb-match');
  const sbEmber = $('sb-ember');
  const sbAsh = $('sb-ash');
  const sbTotalEmber = $('sb-total-ember');
  const sbTotalAsh = $('sb-total-ash');
  const fullmap = $('fullmap');
  const fullmapCanvas = $('fullmap-canvas');
  const fullmapCtx = fullmapCanvas.getContext('2d');
  const fmSub = $('fm-sub');
  let briefingTimer = 0;
  let hitTimer = 0;
  let bannerTimer = 0;
  const last = { hp: -1, shield: -1, weaponSig: '', money: -1, timer: '', score: '', alive: '', bomb: '', gap: -1, scoreboardSig: '' };

  // Map dots shared by the minimap and the full map: player (white),
  // EMBER (orange) / ASH (teal) bots, and the bomb. The full map also
  // marks the bomb carrier when the bomb is carried (the minimap keeps
  // its original content: dropped / planted only).
  function mapDots(player, bots, bomb, sites, carrierPos = null) {
    const dots = [];
    if (player.alive) dots.push({ x: player.position.x, z: player.position.z, yaw: player.yaw, color: '#f2e8d5', r: 3.5 });
    for (const bot of bots) {
      if (!bot.alive) continue;
      dots.push({ x: bot.position.x, z: bot.position.z, color: bot.team === 'ember' ? '#ff9a3c' : '#3fae8a', r: 3 });
    }
    if (bomb.state === 'dropped' && bomb.position) dots.push({ x: bomb.position.x, z: bomb.position.z, color: '#ffd23c', r: 4 });
    else if (bomb.state === 'planted' && bomb.site) {
      const s = sites[bomb.site];
      dots.push({ x: s.center.x, z: s.center.z, color: '#e14b4b', r: 4 });
    } else if (bomb.state === 'carried' && carrierPos) {
      dots.push({ x: carrierPos.x, z: carrierPos.z, color: '#ffd23c', r: 5 });
    }
    return dots;
  }

  // Weapon silhouettes: blocky rect profiles drawn to match the voxel gun
  // models in rifle.js (same features: scopes, drums, bipods, pumps,
  // raked grips/mags). One fill colour; shape carries the identity. The
  // buy cards, the HUD weapon slots and the kill-feed weapon icon all use
  // these, so the icons always match the 3D weapon.
  const SILHOUETTES = {
    pistol: '<svg viewBox="0 0 120 48"><rect x="14" y="10" width="92" height="12"/><rect x="16" y="7" width="5" height="3"/><rect x="24" y="7" width="5" height="3"/><rect x="32" y="7" width="5" height="3"/><rect x="98" y="6" width="4" height="4"/><rect x="20" y="22" width="80" height="6"/><rect x="26" y="28" width="16" height="20" transform="rotate(-14 34 38)"/><rect x="62" y="28" width="16" height="4"/><rect x="70" y="28" width="3" height="8"/><rect x="104" y="14" width="6" height="4"/></svg>',
    smg: '<svg viewBox="0 0 140 48"><rect x="14" y="14" width="76" height="14"/><rect x="90" y="16" width="30" height="10"/><rect x="120" y="17" width="12" height="8"/><rect x="22" y="4" width="4" height="10"/><rect x="34" y="4" width="4" height="10"/><rect x="20" y="2" width="20" height="4"/><rect x="96" y="8" width="4" height="6"/><rect x="58" y="28" width="14" height="18" transform="rotate(-8 65 37)"/><rect x="88" y="28" width="12" height="14" transform="rotate(-12 94 35)"/><rect x="2" y="16" width="12" height="12"/><rect x="0" y="14" width="4" height="18"/></svg>',
    rifle: '<svg viewBox="0 0 140 48"><rect x="2" y="14" width="26" height="4"/><rect x="2" y="22" width="26" height="4"/><rect x="0" y="10" width="5" height="22"/><rect x="28" y="10" width="48" height="14"/><rect x="30" y="8" width="44" height="3"/><rect x="50" y="7" width="14" height="3"/><rect x="46" y="1" width="23" height="6"/><rect x="69" y="0" width="9" height="8"/><rect x="42" y="1" width="6" height="6"/><rect x="76" y="11" width="31" height="12"/><rect x="101" y="14" width="29" height="6"/><rect x="128" y="12" width="11" height="10"/><rect x="50" y="24" width="12" height="24" transform="rotate(9 56 36)"/><rect x="32" y="24" width="10" height="16" transform="rotate(-18 37 32)"/><rect x="104" y="24" width="8" height="10" transform="rotate(10 108 29)"/></svg>',
    sniper: '<svg viewBox="0 0 140 48"><rect x="2" y="14" width="26" height="4"/><rect x="2" y="22" width="26" height="4"/><rect x="0" y="10" width="5" height="22"/><rect x="28" y="12" width="46" height="12"/><rect x="48" y="8" width="16" height="4"/><rect x="44" y="0" width="28" height="7"/><rect x="70" y="0" width="10" height="9"/><rect x="40" y="1" width="6" height="6"/><rect x="100" y="14" width="30" height="6"/><rect x="128" y="12" width="11" height="10"/><rect x="52" y="24" width="12" height="22" transform="rotate(9 58 35)"/><rect x="34" y="24" width="10" height="16" transform="rotate(-18 39 32)"/><rect x="56" y="24" width="10" height="3"/><rect x="96" y="24" width="4" height="20" transform="rotate(24 98 34)"/><rect x="106" y="24" width="4" height="20" transform="rotate(-24 108 34)"/></svg>',
    shotgun: '<svg viewBox="0 0 140 48"><rect x="2" y="14" width="24" height="4"/><rect x="2" y="22" width="24" height="4"/><rect x="0" y="10" width="5" height="22"/><rect x="26" y="12" width="44" height="14"/><rect x="70" y="14" width="58" height="8"/><rect x="126" y="13" width="10" height="10"/><rect x="78" y="22" width="34" height="12"/><rect x="30" y="4" width="4" height="8"/><rect x="40" y="4" width="4" height="8"/><rect x="28" y="2" width="18" height="4"/><rect x="120" y="10" width="4" height="4"/><rect x="36" y="26" width="10" height="14" transform="rotate(-18 41 33)"/></svg>',
    heavy: '<svg viewBox="0 0 140 48"><rect x="2" y="14" width="24" height="4"/><rect x="2" y="22" width="24" height="4"/><rect x="0" y="10" width="5" height="22"/><rect x="26" y="10" width="54" height="16"/><rect x="44" y="2" width="32" height="6"/><rect x="44" y="8" width="4" height="4"/><rect x="72" y="8" width="4" height="4"/><rect x="80" y="13" width="48" height="8"/><rect x="126" y="12" width="11" height="10"/><rect x="46" y="26" width="20" height="18"/><rect x="32" y="26" width="10" height="14" transform="rotate(-18 37 33)"/><rect x="96" y="26" width="4" height="20" transform="rotate(24 98 36)"/><rect x="106" y="26" width="4" height="20" transform="rotate(-24 108 36)"/></svg>',
    frag: '<svg viewBox="0 0 48 48"><circle cx="24" cy="29" r="13"/><rect x="20" y="8" width="8" height="10"/><circle cx="33" cy="10" r="5" fill="none" stroke="#f2e8d5" stroke-width="2"/></svg>',
  };
  // Headshot mark: gold skull medal, sits inside the red HEADSHOT badge so a
  // headshot kill reads instantly in the feed.
  const HS_MARK = '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7.5" fill="#ffd23c"/><circle cx="8" cy="6.8" r="4" fill="#161009"/><rect x="5.9" y="9.6" width="4.2" height="2.6" rx="0.8" fill="#161009"/><circle cx="6.4" cy="6.6" r="1.05" fill="#ffd23c"/><circle cx="9.6" cy="6.6" r="1.05" fill="#ffd23c"/></svg>';
  const SHIELD_SVG = '<svg class="shield" viewBox="0 0 48 48"><path d="M24 4 L40 10 V24 C40 34 33 42 24 46 C15 42 8 34 8 24 V10 Z" stroke-width="2"/><path d="M24 16 v12 M18 22 h12" stroke-width="2"/></svg>';

  // Build the buy grid once: SIDEARM / SMGS / RIFLES / SNIPER / SHOTGUNS /
  // HEAVY / SHIELDS. Every category stocks a real, buyable item: six guns
  // and two shields (light 25 / heavy 50, per-round). The frag sits under
  // GEAR in the sidearm column, like the tall sidearm list in the Valorant
  // reference. `rows` stays in WEAPONS order so showBuy can map row -> def.
  const rows = [];
  function weaponCard(def, index) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'buy-row';
    card.dataset.index = String(index);
    card.innerHTML = `${SILHOUETTES[def.id]}<div class="buy-top"><span class="buy-name">${def.name}</span><span class="buy-key">${SWITCH_KEY[index]}</span></div><span class="buy-stat">${def.stat || `${def.damage} dmg · ${def.mag} rnd`}</span><span class="buy-price">$${def.price}</span>`;
    return card;
  }
  function shieldCard(def) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'buy-row';
    card.dataset.index = def.id;
    card.innerHTML = `${SHIELD_SVG}<div class="buy-top"><span class="buy-name">${def.name}</span><span class="buy-key">${def.key}</span></div><span class="buy-stat">absorbs ${def.value} dmg · this round</span><span class="buy-price">$${def.price}</span>`;
    return card;
  }
  function column(title) {
    const col = document.createElement('div');
    col.className = 'buy-col';
    col.innerHTML = `<h3>${title}</h3>`;
    buyGrid.appendChild(col);
    return col;
  }
  const colSidearm = column('SIDEARM');
  const sidearmCard = weaponCard(WEAPONS[0], 0);
  colSidearm.appendChild(sidearmCard);
  rows.push(sidearmCard);
  const gearHead = document.createElement('h4');
  gearHead.textContent = 'GEAR';
  colSidearm.appendChild(gearHead);
  const fragRow = document.createElement('button');
  fragRow.type = 'button';
  fragRow.className = 'buy-row';
  fragRow.dataset.index = 'frag';
  fragRow.innerHTML = `${SILHOUETTES.frag}<div class="buy-top"><span class="buy-name">${FRAG.name}</span><span class="buy-key">4</span></div><span class="buy-stat">blast · ${FRAG.radius}m</span><span class="buy-price">$${FRAG.price}</span>`;
  colSidearm.appendChild(fragRow);
  const colSmg = column('SMGS');
  const smgCard = weaponCard(WEAPONS[1], 1);
  colSmg.appendChild(smgCard);
  rows.push(smgCard);
  const colRifle = column('RIFLES');
  const rifleCard = weaponCard(WEAPONS[2], 2);
  colRifle.appendChild(rifleCard);
  rows.push(rifleCard);
  const colSniper = column('SNIPER');
  const sniperCard = weaponCard(WEAPONS[3], 3);
  colSniper.appendChild(sniperCard);
  rows.push(sniperCard);
  const colShotgun = column('SHOTGUNS');
  const shotgunCard = weaponCard(WEAPONS[4], 4);
  colShotgun.appendChild(shotgunCard);
  rows.push(shotgunCard);
  const colHeavy = column('HEAVY');
  const heavyCard = weaponCard(WEAPONS[5], 5);
  colHeavy.appendChild(heavyCard);
  rows.push(heavyCard);
  const colShields = column('SHIELDS');
  const shieldLightCard = shieldCard(SHIELDS[0]);
  const shieldHeavyCard = shieldCard(SHIELDS[1]);
  colShields.appendChild(shieldLightCard);
  colShields.appendChild(shieldHeavyCard);

  // Canvas portraits: team-coloured circle + initials (Valorant top bar).
  const portraitCache = new Map();
  function portraitFor(name, team) {
    const key = `${team}:${name}`;
    if (portraitCache.has(key)) return portraitCache.get(key);
    const c = document.createElement('canvas');
    c.width = 48;
    c.height = 48;
    const ctx = c.getContext('2d');
    ctx.fillStyle = team === 'ember' ? '#ff9a3c' : '#3fae8a';
    ctx.beginPath();
    ctx.arc(24, 24, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#161009';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name === 'YOU' ? 'YOU' : name.slice(0, 2).toUpperCase(), 24, 25);
    const url = c.toDataURL();
    portraitCache.set(key, url);
    return url;
  }
  function renderRoster(roster) {
    buyTeamEmber.innerHTML = '';
    buyTeamAsh.innerHTML = '';
    for (const member of roster) {
      const cell = document.createElement('div');
      cell.className = `buy-profile${member.name === 'YOU' ? ' you' : ''}${member.alive ? '' : ' dead'}`;
      const img = document.createElement('img');
      img.src = portraitFor(member.name, member.team);
      img.alt = member.name;
      const label = document.createElement('span');
      label.textContent = member.name;
      cell.appendChild(img);
      cell.appendChild(label);
      (member.team === 'ember' ? buyTeamEmber : buyTeamAsh).appendChild(cell);
    }
  }

  return {
    setHealth(hp, shield) {
      if (hp !== last.hp) {
        last.hp = hp;
        healthFill.style.width = `${hp}%`;
        healthNum.textContent = String(hp);
        healthFill.classList.toggle('low', hp <= 30);
        healthNum.classList.toggle('low', hp <= 30);
      }
      if (shield !== last.shield) {
        last.shield = shield;
        // Round like HP (Math.ceil): fractional falloff damage used to render
        // raw, e.g. 33.67740387018445.
        shieldNum.textContent = String(Math.ceil(shield));
        shieldBlock.classList.toggle('zero', shield === 0);
      }
    },
    // Bottom-right weapon slots (Valorant-style): the current weapon is the
    // big active slot at the bottom, the secondary sits above it, dimmed.
    // Each slot: { def, key, mag, reserve } or { frag: true, key, count }.
    // The signature cache skips DOM writes when nothing moved.
    setWeapons(current, secondary) {
      const sig = `${current.def.id}|${current.mag}|${current.reserve}|${secondary.frag ? 'frag' : secondary.def.id}|${secondary.mag}|${secondary.reserve}|${secondary.count}`;
      if (sig === last.weaponSig) return;
      last.weaponSig = sig;
      this.renderSlot(slotCurrent, current, true);
      this.renderSlot(slotSecondary, secondary, false);
    },
    renderSlot(slot, w, active) {
      slot.querySelector('.slot-key').textContent = w.key;
      slot.querySelector('.slot-sil').innerHTML = w.frag ? SILHOUETTES.frag : SILHOUETTES[w.def.id];
      slot.querySelector('.slot-name').textContent = w.frag ? FRAG.name : w.def.name;
      slot.querySelector('.slot-ammo').innerHTML = w.frag
        ? `<b>x${w.count}</b>`
        : `<b>${w.mag}</b><span> / ${w.reserve}</span>`;
      slot.classList.toggle('empty', active && !w.frag && w.mag === 0);
    },
    setMoney(money) {
      if (money === last.money) return;
      last.money = money;
      moneyEl.textContent = `$${money}`;
      buyMoney.textContent = `$${money}`;
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (text === last.timer) return;
      last.timer = text;
      timerEl.textContent = text;
      buyTimer.textContent = text;
      timerEl.classList.toggle('urgent', s <= 10 && phase === 'live');
      timerEl.classList.toggle('buy', phase === 'buy');
    },
    setScore(ember, ash, round) {
      const text = `EMBER ${ember} — ${ash} ASH · R${round}`;
      if (text === last.score) return;
      last.score = text;
      scoreEl.textContent = text;
      buyScore.textContent = text;
    },
    setAlive(emberAlive, ashAlive) {
      const text = `${emberAlive}|${ashAlive}`;
      if (text === last.alive) return;
      last.alive = text;
      let html = '';
      for (let i = 0; i < 5; i += 1) html += `<i class="pip ember ${i < emberAlive ? 'on' : ''}"></i>`;
      html += '<span class="vs">vs</span>';
      for (let i = 0; i < 5; i += 1) html += `<i class="pip ash ${i < ashAlive ? 'on' : ''}"></i>`;
      aliveEl.innerHTML = html;
    },
    setCrosshairGap(px) {
      const v = Math.round(px * 10) / 10;
      if (v === last.gap) return;
      last.gap = v;
      crosshair.style.setProperty('--gap', `${v}px`);
    },
    setBomb(text) {
      if (text === last.bomb) return;
      last.bomb = text;
      bombEl.textContent = text;
      bombEl.hidden = text === '';
      bombEl.classList.toggle('danger', text.startsWith('BOMB'));
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      vignette.classList.remove('flash');
      void vignette.offsetWidth;
      vignette.classList.add('flash');
    },
    // Point Blank kill line: killer name [weapon icon] victim name, plus a
    // red HEADSHOT badge on headshot kills. Names are team-coloured.
    killfeedKill(entry) {
      const el = document.createElement('div');
      el.className = 'feed-entry feed-kill';
      const killer = document.createElement('span');
      killer.className = `kf-name ${entry.killerTeam === 'ember' ? 'ember' : 'ash'}`;
      killer.textContent = entry.killer;
      const weapon = document.createElement('span');
      weapon.className = 'kf-weapon';
      weapon.innerHTML = SILHOUETTES[entry.weapon] || SILHOUETTES.rifle;
      const victim = document.createElement('span');
      victim.className = `kf-name ${entry.victimTeam === 'ember' ? 'ember' : 'ash'}`;
      victim.textContent = entry.victim;
      el.append(killer, weapon, victim);
      if (entry.headshot) {
        const hs = document.createElement('span');
        hs.className = 'kf-hs';
        hs.innerHTML = `${HS_MARK}<span>HEADSHOT</span>`;
        el.appendChild(hs);
      }
      feedEl.prepend(el);
      while (feedEl.children.length > 5) feedEl.lastChild.remove();
      setTimeout(() => el.remove(), feedLifetimeMs);
    },
    // Non-kill event line (bomb dropped / planted / picked up): muted text.
    killfeed(text, good) {
      const entry = document.createElement('div');
      entry.className = `feed-entry feed-event ${good ? 'good' : 'bad'}`;
      entry.textContent = text;
      feedEl.prepend(entry);
      while (feedEl.children.length > 5) feedEl.lastChild.remove();
      setTimeout(() => entry.remove(), feedLifetimeMs); // same lifetime as kill lines
    },
    banner(titleText, sub) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = sub || '';
      bannerEl.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { bannerEl.hidden = true; }, 2600);
    },
    hideBanner() {
      clearTimeout(bannerTimer);
      bannerEl.hidden = true;
    },
    // Kill notification queue: kinds firstblood/headshot/chainhs/double/
    // triple/chain/ace/stopper. `now` is sim time; tickNotify advances the
    // queue. Main.js decides when to call this (first blood fires for any
    // killer; the rest are player kills only).
    killNotify(kind, sub, now) {
      notifyQueue.push({ kind, sub });
      pumpNotify(now);
    },
    tickNotify(now) {
      if (notifyShowing && now >= notifyShowing.until) {
        notifyShowing = null;
        notifyEl.hidden = true;
        pumpNotify(now);
      }
    },
    clearNotify() {
      notifyQueue = [];
      notifyShowing = null;
      notifyEl.hidden = true;
    },
    // Showcase only: hold kill-feed lines longer so a slow still can catch
    // them (?shot= modes). Never called in real play — lifetime stays 6s.
    setFeedLifetime(ms) {
      feedLifetimeMs = ms;
    },
    // Diagnostic: kinds currently showing + queued — the ground truth for
    // the first-blood once-per-match check (no sim time needs to pass).
    notifyQueue() {
      return { showing: notifyShowing ? notifyShowing.kind : null, queued: notifyQueue.map((q) => q.kind) };
    },
    showBuy(money, owned, fragsOwned, roster, shield = 0) {
      buyMenu.hidden = false;
      topbar.style.display = 'none';
      if (roster) renderRoster(roster);
      rows.forEach((row, index) => {
        const def = WEAPONS[index];
        row.classList.toggle('owned', owned[index]);
        row.classList.toggle('cant', !owned[index] && money < def.price);
        row.querySelector('.buy-price').textContent = owned[index] ? 'OWNED' : `$${def.price}`;
      });
      fragRow.classList.toggle('cant', money < FRAG.price);
      fragRow.querySelector('.buy-price').textContent = fragsOwned > 0 ? `x${fragsOwned}` : `$${FRAG.price}`;
      for (const [card, def] of [[shieldLightCard, SHIELDS[0]], [shieldHeavyCard, SHIELDS[1]]]) {
        const has = shield >= def.value;
        card.classList.toggle('owned', has);
        card.classList.toggle('cant', !has && money < def.price);
        card.querySelector('.buy-price').textContent = has ? 'OWNED' : `$${def.price}`;
      }
      buyMoney.textContent = `$${money}`;
    },
    hideBuy() {
      buyMenu.hidden = true;
      topbar.style.display = '';
    },
    setMinimapVisible(visible) {
      minimap.hidden = !visible;
    },
    updateMinimap(layout, bounds, sites, player, bots, bomb) {
      drawTopDown(minimapCtx, 180, 180, layout, bounds, sites, mapDots(player, bots, bomb, sites), true);
    },
    // Full-size map: same top-down render as the minimap, large, plus the
    // bomb carrier marker when the bomb is carried.
    showFullMap(round, wins) {
      fmSub.textContent = `R${round} · EMBER ${wins.ember} — ${wins.ash} ASH`;
      fullmap.hidden = false;
    },
    hideFullMap() {
      fullmap.hidden = true;
    },
    updateFullMap(layout, bounds, sites, player, bots, bomb, carrierPos) {
      drawTopDown(fullmapCtx, 740, 460, layout, bounds, sites, mapDots(player, bots, bomb, sites, carrierPos));
    },
    // Scoreboard (hold TAB): two team tables, kills desc, team totals,
    // match score in the header. Rebuilds only when the data changes.
    showScoreboard(data) {
      scoreboard.hidden = false;
      const sig = JSON.stringify(data);
      if (sig === last.scoreboardSig) return;
      last.scoreboardSig = sig;
      sbMatch.textContent = `EMBER ${data.wins.ember} — ${data.wins.ash} ASH · R${data.round}`;
      const fill = (tbody, rows) => {
        tbody.innerHTML = rows.map((r, i) =>
          `<tr${r.isPlayer ? ' class="you"' : ''}><td>${i + 1}</td><td>${r.name}</td><td class="num">${r.kills}</td><td class="num">${r.deaths}</td></tr>`).join('');
      };
      fill(sbEmber, data.ember);
      fill(sbAsh, data.ash);
      sbTotalEmber.textContent = String(data.ember.reduce((a, r) => a + r.kills, 0));
      sbTotalAsh.textContent = String(data.ash.reduce((a, r) => a + r.kills, 0));
    },
    hideScoreboard() {
      scoreboard.hidden = true;
      last.scoreboardSig = '';
    },
    showBriefing(data) {
      briefingTeam.textContent = data.side === 'ember' ? 'EMBER — DEFEND · 5v5' : 'ASH — ATTACK · 5v5';
      briefingMission.textContent = data.mission;
      briefingStory.textContent = data.story;
      const dots = [];
      if (data.player) dots.push({ x: data.player.x, z: data.player.z, color: '#f2e8d5', r: 5 });
      for (const bot of data.bots || []) {
        if (!bot.alive) continue;
        dots.push({ x: bot.position.x, z: bot.position.z, color: bot.team === 'ember' ? '#ff9a3c' : '#3fae8a', r: 4 });
      }
      drawTopDown(briefingCtx, 440, 360, data.layout, data.bounds, data.sites, dots);
      briefing.hidden = false;
      clearTimeout(briefingTimer);
      briefingTimer = setTimeout(() => { briefing.hidden = true; }, 5000);
    },
    hideBriefing() {
      clearTimeout(briefingTimer);
      briefing.hidden = true;
    },
    showOverlay(mode, data) {
      if (mode === 'round') {
        title.textContent = data.title;
        copy.textContent = data.copy;
        play.textContent = 'Next round';
      } else if (mode === 'match') {
        title.textContent = data.title;
        copy.textContent = data.copy;
        play.textContent = 'Play again';
      } else {
        const text = COPY[mode];
        title.textContent = text.title;
        copy.textContent = text.copy;
        play.textContent = text.action;
      }
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    onBuy(handler) {
      buyGrid.addEventListener('click', (event) => {
        const row = event.target.closest('.buy-row');
        if (row) handler(row.dataset.index);
      });
    },
  };
}
