// Emberlight — every tuning number, colour and wave recipe in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 16,
  speed: 265,
  maxHp: 100,
  fireInterval: 0.20,
  boltDamage: 14,
  boltSpeed: 640,
  boltRadius: 6,
  pickupRadius: 56,
  dashSpeed: 780,
  dashTime: 0.16,
  dashCooldown: 2.4,
  invulnerable: 0.6,
  lightRadius: 300,
};

export const ENEMY = {
  mote:    { hp: 18, speed: 108, radius: 12, damage: 8,  score: 10, embers: 1, color: '#c9a7ff' },
  wisp:    { hp: 14, speed: 172, radius: 10, damage: 6,  score: 15, embers: 1, color: '#7fe3ff' },
  crawler: { hp: 58, speed: 56,  radius: 20, damage: 14, score: 25, embers: 2, color: '#ff8a7a' },
  spitter: { hp: 26, speed: 78,  radius: 13, damage: 10, score: 30, embers: 2, color: '#a5e08a' },
  brute:   { hp: 650, speed: 50, radius: 46, damage: 20, score: 500, embers: 12, color: '#ff5a6e' },
  king:    { hp: 1200, speed: 58, radius: 56, damage: 24, score: 1500, embers: 30, color: '#e8b4ff' },
};

export const ORB = { speed: 190, radius: 7, damage: 10 };

/** Waves 1..10. Boss waves are 5 (Gloombrute) and 10 (the Hollow King, the win). */
export const FINAL_WAVE = 10;
export const BOSS_WAVES = { 5: 'brute', 10: 'king' };

export function waveComposition(wave) {
  return {
    mote: 5 + wave * 2,
    wisp: wave >= 3 ? 2 + wave : 0,
    crawler: wave >= 2 ? 2 + wave : 0,
    spitter: wave >= 2 ? Math.floor(wave * 0.8) : 0,
    boss: BOSS_WAVES[wave] ?? null,
  };
}

/** Seconds between spawns at the start of a wave; it tightens as the wave goes on. */
export function spawnInterval(wave, spawned, total) {
  const base = Math.max(0.28, 0.85 - wave * 0.05);
  return base * (1 - 0.35 * (spawned / Math.max(1, total)));
}

export const DROP = { heartChance: 0.08, heartHeal: 30, emberValue: 5 };

export const PARTICLES = { max: 320, floatersMax: 24 };

export const PALETTE = {
  backdrop: '#070a14',
  floor: '#12172a',
  floorAlt: '#171e36',
  wall: '#0d1226',
  grid: '#1c2442',
  text: '#f4ead8',
  muted: '#9aa3c0',
  amber: '#ffb347',
  ember: '#ff7a2f',
  flame: '#ffd166',
  teal: '#57e6c9',
  heart: '#ff5a7a',
  panel: '#1a2038',
  panelEdge: '#3a466e',
  danger: '#ff5a6e',
  boss: '#e8b4ff',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score and best wave are kept between visits (this browser only). */
export const BEST_KEY = 'emberlight.best';
export const BEST_WAVE_KEY = 'emberlight.bestWave';
