// Rounds: buy phase, live phase, round end, match end. Owns the timers, the win
// checks (elimination, detonation, defuse, time), the economy and the side flip.
// It never touches the scene; it tells main.js what happened through hooks.
import { PHASE, SIDE, ROUND_TIME, BUY_TIME, WIN_ROUNDS, MAX_ROUNDS, playerSideForRound, roundReward } from './state.js';

const ROUND_END_TIME = 4;

export function createRounds(state, hooks) {
  function aliveCount(team, env) {
    let count = env.player.alive && env.player.team === team ? 1 : 0;
    for (const bot of env.bots) if (bot.alive && bot.team === team) count += 1;
    return count;
  }

  function startRound() {
    state.round = Math.min(state.round, MAX_ROUNDS);
    state.playerSide = playerSideForRound(state.round);
    state.phase = PHASE.BUY;
    state.timer = BUY_TIME;
    state.bomb.state = 'carried';
    state.bomb.site = null;
    state.bomb.timer = 0;
    state.bomb.plantProgress = 0;
    state.bomb.defuseProgress = 0;
    state.bomb.position = null;
    hooks.spawn(state.round, state.playerSide);
    hooks.onPhase(PHASE.BUY);
  }

  function endRound(winner, reason) {
    if (state.phase !== PHASE.LIVE) return;
    const playerWon = winner === state.playerSide;
    const reward = roundReward(playerWon, playerWon ? 0 : state.lossStreak);
    state.money += reward;
    state.lossStreak = playerWon ? 0 : state.lossStreak + 1;
    state.wins[winner] += 1;
    state.phase = PHASE.ROUND_END;
    state.timer = ROUND_END_TIME;
    hooks.onRoundEnd(winner, reason, reward);
  }

  return {
    startMatch() {
      state.round = 1;
      state.wins = { ember: 0, ash: 0 };
      state.money = 800;
      state.kills = 0;
      state.deaths = 0;
      state.lossStreak = 0;
      state.matchWinner = null;
      startRound();
    },
    startRound,
    update(dt, env) {
      if (state.phase === PHASE.BUY) {
        state.timer -= dt;
        if (state.timer <= 0) {
          state.phase = PHASE.LIVE;
          state.timer = ROUND_TIME;
          hooks.onPhase(PHASE.LIVE);
        }
        return;
      }
      if (state.phase === PHASE.ROUND_END) {
        state.timer -= dt;
        if (state.timer <= 0) {
          if (state.wins.ember >= WIN_ROUNDS || state.wins.ash >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
            state.matchWinner = state.wins.ember > state.wins.ash ? SIDE.EMBER : SIDE.ASH;
            state.phase = PHASE.MATCH_END;
            hooks.onMatchEnd(state.matchWinner);
          } else {
            state.round += 1;
            startRound();
          }
        }
        return;
      }
      if (state.phase !== PHASE.LIVE) return;
      state.timer -= dt;
      const bomb = state.bomb;
      if (bomb.state === 'exploded') { endRound(SIDE.ASH, 'detonation'); return; }
      if (bomb.state === 'defused') { endRound(SIDE.EMBER, 'defuse'); return; }
      if (aliveCount(SIDE.ASH, env) === 0) { endRound(SIDE.EMBER, 'elimination'); return; }
      if (aliveCount(SIDE.EMBER, env) === 0) { endRound(SIDE.ASH, 'elimination'); return; }
      if (state.timer <= 0) {
        if (bomb.state === 'planted') return; // timer only ends the round when nothing is planted
        endRound(SIDE.EMBER, 'time');
      }
    },
  };
}
