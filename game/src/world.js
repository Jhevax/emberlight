// Emberlight's rules and state, with no drawing and no browser in it: the player,
// the waves of foes, bolts and orbs, pickups, particles, the draft between waves
// and the two bosses. step() advances one fixed step and returns what happened as
// bit flags, so the caller can play sounds and change screens without the world
// knowing about either. The world takes its random function in, so a seed fixes a run.
import { BOSS_WAVES, DROP, ENEMY, FIELD, FINAL_WAVE, ORB, PARTICLES, PLAYER, spawnInterval, STEP, waveComposition } from './config.js';
import { createStats, rollDraft, upgradeById } from './upgrades.js';

export const EVENT_SHOOT = 1;
export const EVENT_HIT = 2;
export const EVENT_KILL = 4;
export const EVENT_PICKUP = 8;
export const EVENT_HEAL = 16;
export const EVENT_WAVE_CLEAR = 32;
export const EVENT_BOSS = 64;
export const EVENT_WIN = 128;
export const EVENT_LOSE = 256;
export const EVENT_DASH = 512;

const TAU = Math.PI * 2;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2, y: FIELD.height / 2, aim: -Math.PI / 2,
    hp: PLAYER.maxHp, maxHp: PLAYER.maxHp, fireTimer: 0,
    dashTimer: 0, dashCooldown: 0, dashX: 0, dashY: 0, invulnerable: 0,
  };
  const state = {
    player, stats: createStats(), levels: {},
    enemies: [], bolts: [], orbs: [], pickups: [], particles: [], floaters: [],
    wave: 0, phase: 'title', score: 0, embers: 0, kills: 0,
    elapsed: 0, spawnQueue: [], spawnTimer: 0, spawned: 0, totalToSpawn: 0,
    draft: [], banner: '', bannerTimer: 0, shake: 0, hitStop: 0,
    streak: 0, streakTimer: 0, boss: null, ambientTimer: 0,
  };

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      if (state.particles.length >= PARTICLES.max) return;
      const angle = random() * TAU;
      const v = speed * (0.3 + random() * 0.7);
      state.particles.push({
        x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v,
        life: 0.35 + random() * 0.4, maxLife: 0.75, size: 2 + random() * 3, color,
      });
    }
  }

  function floater(x, y, text, color) {
    if (state.floaters.length >= PARTICLES.floatersMax) state.floaters.shift();
    state.floaters.push({ x, y, text, color, life: 0.9 });
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.aim = -Math.PI / 2;
    player.hp = PLAYER.maxHp;
    player.maxHp = PLAYER.maxHp;
    player.fireTimer = 0;
    player.dashTimer = 0;
    player.dashCooldown = 0;
    player.invulnerable = 0;
    state.stats = createStats();
    state.levels = {};
    state.enemies.length = 0;
    state.bolts.length = 0;
    state.orbs.length = 0;
    state.pickups.length = 0;
    state.particles.length = 0;
    state.floaters.length = 0;
    state.wave = 0;
    state.phase = 'title';
    state.score = 0;
    state.embers = 0;
    state.kills = 0;
    state.elapsed = 0;
    state.spawnQueue.length = 0;
    state.spawnTimer = 0;
    state.spawned = 0;
    state.totalToSpawn = 0;
    state.draft = [];
    state.banner = '';
    state.bannerTimer = 0;
    state.shake = 0;
    state.hitStop = 0;
    state.streak = 0;
    state.streakTimer = 0;
    state.boss = null;
  }

  function edgePoint() {
    const side = Math.floor(random() * 4);
    const margin = 30;
    if (side === 0) return { x: margin + random() * (FIELD.width - margin * 2), y: -margin };
    if (side === 1) return { x: margin + random() * (FIELD.width - margin * 2), y: FIELD.height + margin };
    if (side === 2) return { x: -margin, y: margin + random() * (FIELD.height - margin * 2) };
    return { x: FIELD.width + margin, y: margin + random() * (FIELD.height - margin * 2) };
  }

  function spawnEnemy(kind, x, y, elite) {
    const base = ENEMY[kind];
    const isBoss = kind === 'brute' || kind === 'king';
    // Bosses scale gently with the wave; ordinary foes scale a little faster.
    const hpMul = isBoss ? 1 + (state.wave - 1) * 0.05 : 1 + (state.wave - 1) * 0.12;
    const enemy = {
      kind, x, y, vx: 0, vy: 0,
      hp: base.hp * hpMul * (elite ? 2.5 : 1),
      maxHp: base.hp * hpMul * (elite ? 2.5 : 1),
      radius: base.radius * (elite ? 1.25 : 1),
      speed: base.speed * (0.9 + random() * 0.2),
      damage: base.damage, score: base.score * (elite ? 3 : 1),
      embers: base.embers * (elite ? 3 : 1),
      color: base.color, elite: !!elite, flash: 0,
      shootTimer: 1 + random() * 1.5, attackTimer: 2 + random() * 2,
      summonTimer: 5, wobble: random() * TAU, chargeTimer: 0, charging: 0,
    };
    state.enemies.push(enemy);
    if (kind === 'brute' || kind === 'king') state.boss = enemy;
    return enemy;
  }

  function startWave(wave) {
    state.wave = wave;
    state.phase = 'fight';
    const comp = waveComposition(wave);
    const queue = [];
    for (let i = 0; i < comp.mote; i += 1) queue.push('mote');
    for (let i = 0; i < comp.wisp; i += 1) queue.push('wisp');
    for (let i = 0; i < comp.crawler; i += 1) queue.push('crawler');
    for (let i = 0; i < comp.spitter; i += 1) queue.push('spitter');
    // Shuffle the queue so the wave arrives mixed.
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    state.spawnQueue = queue;
    state.totalToSpawn = queue.length + (comp.boss ? 1 : 0);
    state.spawned = 0;
    state.spawnTimer = 0.8;
    if (comp.boss) {
      const point = edgePoint();
      spawnEnemy(comp.boss, point.x, point.y, false);
      state.spawned += 1;
      state.banner = comp.boss === 'king' ? 'THE HOLLOW KING' : 'GLOOMBRUTE';
      state.bannerTimer = 2.6;
      return EVENT_BOSS;
    }
    state.banner = `WAVE ${wave}`;
    state.bannerTimer = 2;
    return 0;
  }

  function beginDraft() {
    state.phase = 'draft';
    state.draft = rollDraft(random, state.levels);
    return EVENT_WAVE_CLEAR;
  }

  function applyUpgrade(id) {
    const def = upgradeById(id);
    if (!def) return false;
    if (!state.draft.some((d) => d.id === id)) return false;
    if ((state.levels[id] ?? 0) >= def.max) return false;
    state.levels[id] = (state.levels[id] ?? 0) + 1;
    def.apply(state.stats);
    if (state.stats.healNow > 0) {
      player.maxHp = PLAYER.maxHp + state.stats.maxHpBonus;
      player.hp = Math.min(player.maxHp, player.hp + state.stats.healNow);
      state.stats.healNow = 0;
    }
    player.maxHp = PLAYER.maxHp + state.stats.maxHpBonus;
    state.draft = [];
    return true;
  }

  function dropLoot(x, y, embers, isBoss) {
    for (let i = 0; i < embers; i += 1) {
      state.pickups.push({
        kind: 'ember', x: x + (random() - 0.5) * 36, y: y + (random() - 0.5) * 36,
        vx: (random() - 0.5) * 60, vy: (random() - 0.5) * 60, value: DROP.emberValue, life: 14,
      });
    }
    if (random() < DROP.heartChance || isBoss) {
      state.pickups.push({ kind: 'heart', x, y, vx: 0, vy: 0, value: DROP.heartHeal, life: 14 });
    }
  }

  function killEnemy(index) {
    const enemy = state.enemies[index];
    state.enemies.splice(index, 1);
    state.kills += 1;
    state.streak += 1;
    state.streakTimer = 2.5;
    const bonus = state.streak >= 10 ? 2 : state.streak >= 5 ? 1.5 : 1;
    const gained = Math.round(enemy.score * bonus);
    state.score += gained;
    floater(enemy.x, enemy.y - enemy.radius, `+${gained}`, '#ffd166');
    if (state.streak === 5 || state.streak === 10 || state.streak === 20) {
      floater(player.x, player.y - 34, `${state.streak} STREAK!`, '#57e6c9');
    }
    burst(enemy.x, enemy.y, enemy.color, enemy.kind === 'brute' || enemy.kind === 'king' ? 40 : 14, 220);
    burst(enemy.x, enemy.y, '#ffb347', 8, 160);
    dropLoot(enemy.x, enemy.y, enemy.embers, enemy.kind === 'brute' || enemy.kind === 'king');
    state.shake = Math.max(state.shake, enemy.kind === 'brute' || enemy.kind === 'king' ? 14 : 4);
    if (state.boss === enemy) state.boss = null;
    return gained;
  }

  function fireBolts() {
    const stats = state.stats;
    const count = 1 + stats.extraBolts;
    const damage = PLAYER.boltDamage * stats.damageMul;
    const spread = 0.14;
    for (let i = 0; i < count; i += 1) {
      const offset = (i - (count - 1) / 2) * spread;
      const angle = player.aim + offset;
      state.bolts.push({
        x: player.x + Math.cos(angle) * (PLAYER.radius + 6),
        y: player.y + Math.sin(angle) * (PLAYER.radius + 6),
        vx: Math.cos(angle) * PLAYER.boltSpeed, vy: Math.sin(angle) * PLAYER.boltSpeed,
        damage, pierce: stats.pierce, life: 1.1, hitSet: new Set(),
      });
    }
    player.fireTimer = PLAYER.fireInterval * stats.fireIntervalMul;
    burst(player.x + Math.cos(player.aim) * 24, player.y + Math.sin(player.aim) * 24, '#ffb347', 2, 90);
    return EVENT_SHOOT;
  }

  function hurtPlayer(damage) {
    if (player.invulnerable > 0 || player.dashTimer > 0) return 0;
    player.hp -= damage;
    player.invulnerable = PLAYER.invulnerable;
    state.streak = 0;
    state.shake = Math.max(state.shake, 9);
    burst(player.x, player.y, '#ff5a7a', 16, 240);
    if (player.hp <= 0) {
      player.hp = 0;
      state.phase = 'lost';
      burst(player.x, player.y, '#ffb347', 50, 320);
      return EVENT_HIT | EVENT_LOSE;
    }
    return EVENT_HIT;
  }

  function updateEnemies(dt) {
    const p = player;
    for (const enemy of state.enemies) {
      if (enemy.flash > 0) enemy.flash -= dt;
      const dx = p.x - enemy.x;
      const dy = p.y - enemy.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d;
      const ny = dy / d;
      if (enemy.kind === 'spitter') {
        let mx = 0;
        let my = 0;
        if (d > 300) { mx = nx; my = ny; }
        else if (d < 200) { mx = -nx; my = -ny; }
        else { mx = -ny * 0.6; my = nx * 0.6; }
        enemy.vx = mx * enemy.speed;
        enemy.vy = my * enemy.speed;
        enemy.shootTimer -= dt;
        if (enemy.shootTimer <= 0 && d < 460) {
          enemy.shootTimer = 2.2;
          state.orbs.push({ x: enemy.x, y: enemy.y, vx: nx * ORB.speed, vy: ny * ORB.speed, radius: ORB.radius, damage: ORB.damage, life: 4 });
        }
      } else if (enemy.kind === 'wisp') {
        enemy.wobble += dt * 5;
        const px = -ny * Math.sin(enemy.wobble);
        const py = nx * Math.sin(enemy.wobble);
        enemy.vx = (nx + px * 0.7) * enemy.speed;
        enemy.vy = (ny + py * 0.7) * enemy.speed;
      } else if (enemy.kind === 'brute') {
        enemy.vx = nx * enemy.speed;
        enemy.vy = ny * enemy.speed;
        enemy.attackTimer -= dt;
        if (enemy.attackTimer <= 0) {
          enemy.attackTimer = 4.5;
          for (let i = 0; i < 8; i += 1) {
            const a = (i / 8) * TAU + random() * 0.2;
            state.orbs.push({ x: enemy.x, y: enemy.y, vx: Math.cos(a) * ORB.speed * 0.9, vy: Math.sin(a) * ORB.speed * 0.9, radius: ORB.radius, damage: ORB.damage, life: 5 });
          }
        }
      } else if (enemy.kind === 'king') {
        const frac = enemy.hp / enemy.maxHp;
        enemy.vx = nx * enemy.speed * (frac < 0.33 ? 1.5 : 1);
        enemy.vy = ny * enemy.speed * (frac < 0.33 ? 1.5 : 1);
        enemy.attackTimer -= dt;
        if (enemy.attackTimer <= 0) {
          enemy.attackTimer = frac < 0.33 ? 2.2 : 2.9;
          const arms = frac < 0.66 ? 3 : 2;
          for (let a = 0; a < arms; a += 1) {
            for (let i = 0; i < 8; i += 1) {
              const angle = (i / 8) * TAU + a * 0.5 + enemy.wobble;
              state.orbs.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * ORB.speed, vy: Math.sin(angle) * ORB.speed, radius: ORB.radius, damage: ORB.damage, life: 5 });
            }
          }
          enemy.wobble += 0.35;
        }
        enemy.summonTimer -= dt;
        if (enemy.summonTimer <= 0) {
          enemy.summonTimer = 6;
          const point = edgePoint();
          spawnEnemy('mote', point.x, point.y, false);
          const point2 = edgePoint();
          spawnEnemy('wisp', point2.x, point2.y, false);
        }
      } else {
        enemy.vx = nx * enemy.speed;
        enemy.vy = ny * enemy.speed;
      }
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.x = Math.max(14, Math.min(FIELD.width - 14, enemy.x));
      enemy.y = Math.max(14, Math.min(FIELD.height - 14, enemy.y));
    }
    // Gentle separation so foes do not stack into one dot.
    const list = state.enemies;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = (min - d) / 2;
          const ux = dx / d;
          const uy = dy / d;
          a.x -= ux * push;
          a.y -= uy * push;
          b.x += ux * push;
          b.y += uy * push;
        }
      }
    }
  }

  function updateBolts(dt) {
    let events = 0;
    for (let i = state.bolts.length - 1; i >= 0; i -= 1) {
      const bolt = state.bolts[i];
      bolt.x += bolt.vx * dt;
      bolt.y += bolt.vy * dt;
      bolt.life -= dt;
      let dead = bolt.life <= 0 || bolt.x < -20 || bolt.x > FIELD.width + 20 || bolt.y < -20 || bolt.y > FIELD.height + 20;
      if (!dead) {
        for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
          const enemy = state.enemies[j];
          if (bolt.hitSet.has(enemy)) continue;
          const rr = enemy.radius + PLAYER.boltRadius;
          if (dist2(bolt.x, bolt.y, enemy.x, enemy.y) < rr * rr) {
            enemy.hp -= bolt.damage;
            enemy.flash = 0.09;
            bolt.hitSet.add(enemy);
            floater(enemy.x, enemy.y - enemy.radius - 6, String(Math.round(bolt.damage)), '#ffe9b0');
            burst(bolt.x, bolt.y, '#ffd166', 4, 140);
            events |= EVENT_KILL; // reuse as a "hit landed" tick for sound: see note below
            if (enemy.hp <= 0) {
              killEnemy(j);
              state.hitStop = Math.max(state.hitStop, 0.03);
            }
            if (bolt.pierce > 0) {
              bolt.pierce -= 1;
            } else {
              dead = true;
            }
            break;
          }
        }
      }
      if (dead) state.bolts.splice(i, 1);
    }
    return events;
  }

  function updateOrbs(dt) {
    let events = 0;
    for (let i = state.orbs.length - 1; i >= 0; i -= 1) {
      const orb = state.orbs[i];
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
      orb.life -= dt;
      const rr = PLAYER.radius + orb.radius;
      if (orb.life <= 0 || orb.x < -20 || orb.x > FIELD.width + 20 || orb.y < -20 || orb.y > FIELD.height + 20) {
        state.orbs.splice(i, 1);
        continue;
      }
      if (dist2(orb.x, orb.y, player.x, player.y) < rr * rr) {
        state.orbs.splice(i, 1);
        events |= hurtPlayer(orb.damage);
      }
    }
    return events;
  }

  function updatePickups(dt) {
    let events = 0;
    const reach = PLAYER.pickupRadius * state.stats.pickupMul;
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const item = state.pickups[i];
      item.life -= dt;
      const d = Math.hypot(player.x - item.x, player.y - item.y) || 1;
      if (d < reach) {
        const pull = 420 * (1 - d / (reach + 40));
        item.vx += ((player.x - item.x) / d) * pull * dt * 4;
        item.vy += ((player.y - item.y) / d) * pull * dt * 4;
      }
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.vx *= 0.92;
      item.vy *= 0.92;
      if (item.life <= 0) { state.pickups.splice(i, 1); continue; }
      if (d < PLAYER.radius + 12) {
        if (item.kind === 'ember') {
          state.embers += 1;
          state.score += item.value;
          events |= EVENT_PICKUP;
        } else {
          player.hp = Math.min(player.maxHp, player.hp + item.value);
          floater(player.x, player.y - 30, `+${item.value}`, '#ff8fb0');
          events |= EVENT_HEAL;
        }
        burst(item.x, item.y, item.kind === 'ember' ? '#ffb347' : '#ff5a7a', 6, 120);
        state.pickups.splice(i, 1);
      }
    }
    return events;
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
      const f = state.floaters[i];
      f.life -= dt;
      f.y -= 34 * dt;
      if (f.life <= 0) state.floaters.splice(i, 1);
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 34);
    if (state.bannerTimer > 0) state.bannerTimer -= dt;
    if (state.streakTimer > 0) {
      state.streakTimer -= dt;
      if (state.streakTimer <= 0) state.streak = 0;
    }
  }

  /**
   * One fixed step. `input` is {mx, my, firing, aimX, aimY, dash}. With mode
   * 'title' the world runs as an ambient backdrop: foes wander, nothing hurts
   * the player and nothing scores. Returns EVENT_* flags for the caller.
   */
  function step(dt, input, mode) {
    let events = 0;
    state.elapsed += dt;
    if (state.hitStop > 0) {
      state.hitStop -= dt;
      updateParticles(dt);
      return 0;
    }
    if (mode === 'title') {
      state.ambientTimer -= dt;
      if (state.ambientTimer <= 0 && state.enemies.length < 9) {
        state.ambientTimer = 1.4;
        const kinds = ['mote', 'wisp', 'crawler'];
        const point = edgePoint();
        spawnEnemy(kinds[Math.floor(random() * kinds.length)], point.x, point.y, false);
      }
      for (const enemy of state.enemies) {
        enemy.wobble += dt;
        enemy.x += Math.cos(enemy.wobble) * enemy.speed * 0.4 * dt;
        enemy.y += Math.sin(enemy.wobble * 0.7) * enemy.speed * 0.4 * dt;
        enemy.x = Math.max(14, Math.min(FIELD.width - 14, enemy.x));
        enemy.y = Math.max(14, Math.min(FIELD.height - 14, enemy.y));
      }
      updateParticles(dt);
      return 0;
    }

    // --- player ---
    const speed = PLAYER.speed * state.stats.speedMul;
    if (player.dashTimer > 0) {
      player.dashTimer -= dt;
      player.x += player.dashX * PLAYER.dashSpeed * dt;
      player.y += player.dashY * PLAYER.dashSpeed * dt;
    } else {
      player.x += input.mx * speed * dt;
      player.y += input.my * speed * dt;
      if (input.dash && player.dashCooldown <= 0 && (input.mx !== 0 || input.my !== 0)) {
        player.dashTimer = PLAYER.dashTime;
        player.dashCooldown = PLAYER.dashCooldown * state.stats.dashCooldownMul;
        player.dashX = input.mx;
        player.dashY = input.my;
        player.invulnerable = Math.max(player.invulnerable, PLAYER.dashTime + 0.1);
        events |= EVENT_DASH;
      }
    }
    player.x = Math.max(PLAYER.radius, Math.min(FIELD.width - PLAYER.radius, player.x));
    player.y = Math.max(PLAYER.radius, Math.min(FIELD.height - PLAYER.radius, player.y));
    player.aim = Math.atan2(input.aimY - player.y, input.aimX - player.x);
    if (player.fireTimer > 0) player.fireTimer -= dt;
    if (player.dashCooldown > 0) player.dashCooldown -= dt;
    if (player.invulnerable > 0) player.invulnerable -= dt;
    if (input.firing && player.fireTimer <= 0) events |= fireBolts();

    // --- spawning ---
    if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        const kind = state.spawnQueue.shift();
        const point = edgePoint();
        const elite = state.wave >= 4 && random() < 0.08;
        spawnEnemy(kind, point.x, point.y, elite);
        state.spawned += 1;
        state.spawnTimer = spawnInterval(state.wave, state.spawned, state.totalToSpawn);
      }
    }

    updateEnemies(dt);
    // Bolt hits also set EVENT_KILL as a hit tick; the caller plays the soft hit
    // sound for it and the kill sound only when the enemy count fell. We keep the
    // flag simple: a bolt landing is audible feedback either way.
    events |= updateBolts(dt);
    events |= updateOrbs(dt);
    events |= updatePickups(dt);

    // --- contact damage ---
    for (const enemy of state.enemies) {
      const rr = enemy.radius + PLAYER.radius - 2;
      if (dist2(enemy.x, enemy.y, player.x, player.y) < rr * rr) {
        events |= hurtPlayer(enemy.damage);
        if (state.phase === 'lost') break;
      }
    }

    updateParticles(dt);

    // --- wave end ---
    if (state.phase === 'fight' && state.spawnQueue.length === 0 && state.enemies.length === 0 && state.orbs.length === 0) {
      state.score += 50 + state.wave * 25;
      if (state.wave >= FINAL_WAVE) {
        state.phase = 'won';
        events |= EVENT_WIN;
      } else {
        events |= beginDraft();
      }
    }
    return events;
  }

  reset();
  return {
    state, reset, step, startWave, beginDraft, applyUpgrade,
    /** Advance particles and banners only, for screens where the fight is frozen. */
    tickFx(dt) { updateParticles(dt); },
    /** The boss enemy, or null when no boss is alive. */
    boss() { return state.boss; },
  };
}
