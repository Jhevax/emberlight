// The screenshot scenes behind ?shot=title|play|boss|win. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by an
// autopilot that kites away from foes, chases embers and aims at the nearest foe,
// so the frame is what a real game looks like and the same seed always gives the
// same frame. The win scene plays a whole run, waves 1 to 10, with the draft
// auto-picked; if the pilot falls, it retries with the next seed.
import { FIELD, STEP } from './config.js';
import { EVENT_LOSE, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_WIN } from './render.js';

const TITLE_SECONDS = 5;
const PLAY_SECONDS = 35;
const BOSS_FIGHT_SECONDS = 9;
const RUN_LIMIT_SECONDS = 900;

const DRAFT_PRIORITY = ['damage', 'rapid', 'twin', 'pierce', 'heart', 'swift', 'dash', 'magnet', 'lantern'];

/** The autopilot's input for one step: move, aim, fire, dash. */
export function autopilotInput(state) {
  const p = state.player;
  let moveX = 0;
  let moveY = 0;
  let aimX = p.x;
  let aimY = p.y - 100;
  let dash = false;

  let nearest = null;
  let nearestD = Infinity;
  let boss = null;
  for (const enemy of state.enemies) {
    const d = Math.hypot(enemy.x - p.x, enemy.y - p.y);
    if (enemy.kind === 'brute' || enemy.kind === 'king') boss = enemy;
    if (d < nearestD) { nearestD = d; nearest = enemy; }
  }
  const target = boss ?? nearest;
  if (target) {
    aimX = target.x;
    aimY = target.y;
    // Kite: back away when a foe is close, close in when it is far.
    const dx = p.x - target.x;
    const dy = p.y - target.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 150) { moveX = dx / d; moveY = dy / d; }
    else if (d > 330 && target.kind !== 'spitter') { moveX = -dx / d; moveY = -dy / d; }
    if (d < 80 && p.dashCooldown <= 0) dash = true;
  }
  // Dodge an orb that is about to arrive: step sideways.
  for (const orb of state.orbs) {
    const d = Math.hypot(orb.x - p.x, orb.y - p.y);
    if (d < 90) {
      const speed = Math.hypot(orb.vx, orb.vy) || 1;
      const nx = orb.vx / speed;
      const ny = orb.vy / speed;
      moveX = -ny;
      moveY = nx;
      break;
    }
  }
  // Chase a nearby ember when nothing is about to hit us.
  if (nearestD > 170 && state.pickups.length > 0) {
    let best = null;
    let bestD = 260;
    for (const item of state.pickups) {
      const d = Math.hypot(item.x - p.x, item.y - p.y);
      if (d < bestD) { bestD = d; best = item; }
    }
    if (best) {
      moveX = (best.x - p.x) / (bestD || 1);
      moveY = (best.y - p.y) / (bestD || 1);
    }
  }
  // Keep inside the field with a margin.
  if (p.x < 90) moveX = Math.max(moveX, 0.6);
  if (p.x > FIELD.width - 90) moveX = Math.min(moveX, -0.6);
  if (p.y < 90) moveY = Math.max(moveY, 0.6);
  if (p.y > FIELD.height - 90) moveY = Math.min(moveY, -0.6);
  const len = Math.hypot(moveX, moveY);
  if (len > 1) { moveX /= len; moveY /= len; }
  return { mx: moveX, my: moveY, firing: true, aimX, aimY, dash };
}

function pickDraft(world) {
  const draft = world.state.draft;
  if (draft.length === 0) return;
  let best = draft[0];
  let bestRank = Infinity;
  for (const def of draft) {
    const rank = DRAFT_PRIORITY.indexOf(def.id);
    if (rank !== -1 && rank < bestRank) { bestRank = rank; best = def; }
  }
  world.applyUpgrade(best.id);
}

/** Play waves from the world's current wave until `untilWave` clears or the run ends. */
function playWaves(world, untilWave) {
  let events = 0;
  for (let i = 0; i < RUN_LIMIT_SECONDS / STEP; i += 1) {
    const state = world.state;
    if (state.phase === 'draft') {
      pickDraft(world);
      if (state.wave >= untilWave) return { events, won: false, cleared: true };
      world.startWave(state.wave + 1);
      continue;
    }
    if (state.phase === 'won') return { events, won: true, cleared: true };
    if (state.phase === 'lost') return { events, won: false, cleared: false };
    events |= world.step(STEP, autopilotInput(state), 'fight');
    if (events & EVENT_LOSE) return { events, won: false, cleared: false };
    if (events & EVENT_WIN) return { events, won: true, cleared: true };
  }
  return { events, won: false, cleared: false };
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the
 * best score to show. `reseed` rebuilds the world's random for a retry.
 */
export function stageShot(name, world, reseed) {
  if (name === 'win') {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt > 0) reseed(attempt);
      world.reset();
      world.startWave(1);
      const result = playWaves(world, 10);
      if (result.won) return { screen: SCREEN_WIN, best: world.state.score };
    }
    return { screen: SCREEN_WIN, best: world.state.score };
  }
  if (name === 'boss') {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) reseed(attempt);
      world.reset();
      world.startWave(1);
      const result = playWaves(world, 4);
      if (!result.cleared) continue;
      world.startWave(5);
      for (let i = 0; i < BOSS_FIGHT_SECONDS / STEP; i += 1) {
        if (world.state.phase === 'lost') break;
        world.step(STEP, autopilotInput(world.state), 'fight');
      }
      if (world.state.phase !== 'lost' && world.state.boss) {
        return { screen: SCREEN_PLAY, best: world.state.score };
      }
    }
    world.reset();
    world.startWave(5);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'play') {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) reseed(attempt);
      world.reset();
      world.startWave(1);
      let alive = true;
      for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
        if (world.state.phase === 'draft') {
          pickDraft(world);
          world.startWave(world.state.wave + 1);
          continue;
        }
        const events = world.step(STEP, autopilotInput(world.state), 'fight');
        if (events & EVENT_LOSE) { alive = false; break; }
      }
      if (alive) return { screen: SCREEN_PLAY, best: world.state.score };
    }
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  if (name === 'draft') {
    // Verification scene only (not one of the four screenshots): clear wave 1
    // and show the upgrade draft over the field.
    world.reset();
    world.startWave(1);
    for (let i = 0; i < 240 / STEP; i += 1) {
      if (world.state.phase === 'draft') return { screen: SCREEN_UPGRADE, best: world.state.score };
      if (world.state.phase === 'lost') break;
      world.step(STEP, autopilotInput(world.state), 'fight');
    }
    return { screen: SCREEN_UPGRADE, best: world.state.score };
  }
  // Title (and any unknown name): an ambient backdrop behind the title panel.
  world.reset();
  for (let i = 0; i < TITLE_SECONDS / STEP; i += 1) {
    world.step(STEP, { mx: 0, my: 0, firing: false, aimX: 640, aimY: 360, dash: false }, 'title');
  }
  return { screen: SCREEN_TITLE, best: 0 };
}
