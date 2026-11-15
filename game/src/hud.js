// The DOM HUD: crosshair, health, ammo, money, timer, score, alive pips, kill feed,
// bomb status, round banner, buy menu and the overlay panels. It never touches the
// simulation; main.js pushes numbers in and reads callbacks out. DOM writes are
// cached so unchanged values never touch the document.
import { WEAPONS, FRAG } from './weapons.js';

const COPY = {
  start: { title: 'EMBERLINE', copy: 'A dusk container yard. Two sites, three lanes, one bomb. Hold the sites — or take one.', action: 'Click to play' },
  paused: { title: 'EMBERLINE', copy: 'Paused. Click to resume.', action: 'Click to resume' },
  round: { title: '', copy: '', action: 'Next round' },
  match: { title: '', copy: '', action: 'Play again' },
};

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
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const moneyEl = $('money-value');
  const timerEl = $('timer-value');
  const scoreEl = $('score-value');
  const aliveEl = $('alive');
  const feedEl = $('killfeed');
  const bannerEl = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const bombEl = $('bomb-status');
  const vignette = $('damage-vignette');
  const buyMenu = $('buy-menu');
  const buyRows = $('buy-rows');
  let hitTimer = 0;
  let bannerTimer = 0;
  const last = { hp: -1, mag: -1, reserve: -1, weapon: '', money: -1, timer: '', score: '', alive: '', bomb: '', gap: -1 };

  // Build the buy menu rows once.
  const rows = [];
  WEAPONS.forEach((def, index) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'buy-row';
    row.dataset.index = String(index);
    row.innerHTML = `<span class="buy-key">${index + 1}</span><span class="buy-name">${def.name}</span><span class="buy-stat">${def.damage} dmg · ${def.mag} rnd</span><span class="buy-price">$${def.price}</span>`;
    buyRows.appendChild(row);
    rows.push(row);
  });
  const fragRow = document.createElement('button');
  fragRow.type = 'button';
  fragRow.className = 'buy-row';
  fragRow.dataset.index = 'frag';
  fragRow.innerHTML = `<span class="buy-key">4</span><span class="buy-name">${FRAG.name}</span><span class="buy-stat">blast · ${FRAG.radius}m</span><span class="buy-price">$${FRAG.price}</span>`;
  buyRows.appendChild(fragRow);

  return {
    setHealth(hp) {
      if (hp === last.hp) return;
      last.hp = hp;
      healthFill.style.width = `${hp}%`;
      healthNum.textContent = String(hp);
      healthFill.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve, weapon) {
      if (mag === last.mag && reserve === last.reserve && weapon === last.weapon) return;
      last.mag = mag; last.reserve = reserve; last.weapon = weapon;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = weapon;
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setMoney(money) {
      if (money === last.money) return;
      last.money = money;
      moneyEl.textContent = `$${money}`;
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (text === last.timer) return;
      last.timer = text;
      timerEl.textContent = text;
      timerEl.classList.toggle('urgent', s <= 10 && phase === 'live');
      timerEl.classList.toggle('buy', phase === 'buy');
    },
    setScore(ember, ash, round) {
      const text = `EMBER ${ember} — ${ash} ASH · R${round}`;
      if (text === last.score) return;
      last.score = text;
      scoreEl.textContent = text;
    },
    setAlive(emberAlive, ashAlive) {
      const text = `${emberAlive}|${ashAlive}`;
      if (text === last.alive) return;
      last.alive = text;
      let html = '';
      for (let i = 0; i < 3; i += 1) html += `<i class="pip ember ${i < emberAlive ? 'on' : ''}"></i>`;
      html += '<span class="vs">vs</span>';
      for (let i = 0; i < 3; i += 1) html += `<i class="pip ash ${i < ashAlive ? 'on' : ''}"></i>`;
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
    killfeed(text, good) {
      const entry = document.createElement('div');
      entry.className = `feed-entry ${good ? 'good' : 'bad'}`;
      entry.textContent = text;
      feedEl.prepend(entry);
      while (feedEl.children.length > 4) feedEl.lastChild.remove();
      setTimeout(() => entry.remove(), 5000);
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
    showBuy(money, owned, fragsOwned) {
      buyMenu.hidden = false;
      rows.forEach((row, index) => {
        const def = WEAPONS[index];
        row.classList.toggle('owned', owned[index]);
        row.classList.toggle('cant', !owned[index] && money < def.price);
        row.querySelector('.buy-price').textContent = owned[index] ? 'OWNED' : `$${def.price}`;
      });
      fragRow.classList.toggle('cant', money < FRAG.price);
      fragRow.querySelector('.buy-price').textContent = fragsOwned > 0 ? `x${fragsOwned}` : `$${FRAG.price}`;
    },
    hideBuy() {
      buyMenu.hidden = true;
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
      buyRows.addEventListener('click', (event) => {
        const row = event.target.closest('.buy-row');
        if (row) handler(row.dataset.index);
      });
    },
  };
}
