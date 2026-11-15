// The single state store. Every system reads and writes this one object; no other
// module keeps its own copy of round, score, money or phase. Pure data, no DOM, no three.
export const PHASE = { MENU: 'menu', BUY: 'buy', LIVE: 'live', ROUND_END: 'round_end', MATCH_END: 'match_end' };
export const SIDE = { EMBER: 'ember', ASH: 'ash' }; // EMBER defends site, ASH attacks it
export const ROUND_TIME = 100; // seconds of live play
export const BUY_TIME = 14; // seconds of buy phase
export const WIN_ROUNDS = 5; // first to 5 takes the match (max 9 rounds)
export const MAX_ROUNDS = 9;
export const BOMB_TIME = 35; // seconds from plant to detonation
export const PLANT_TIME = 3; // seconds held to plant
export const DEFUSE_TIME = 5; // seconds held to defuse

export function createState() {
  return {
    phase: PHASE.MENU,
    round: 1,
    timer: 0, // seconds left in the current phase
    wins: { ember: 0, ash: 0 },
    money: 800, // player money
    kills: 0,
    deaths: 0,
    playerSide: SIDE.EMBER, // flips every round: odd rounds defend, even rounds attack
    bomb: { state: 'carried', site: null, plantProgress: 0, defuseProgress: 0, timer: 0, position: null },
    feed: [], // kill feed entries {text, good, at}
    banner: null, // {title, sub, at} shown centre-screen
    lossStreak: 0,
    matchWinner: null,
    stats: { shots: 0, hits: 0, headshots: 0 },
  };
}

export function playerSideForRound(round) {
  return round % 2 === 1 ? SIDE.EMBER : SIDE.ASH; // odd = defend, even = attack
}

export function roundReward(won, lossStreak) {
  if (won) return 3250;
  return Math.min(1900 + lossStreak * 500, 3400);
}
