// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred, the margin filled
// with the backdrop colour. The cavern is drawn in deep indigo, the keeper's
// lantern cuts a warm circle of light out of the dark, and every foe glows in
// its own colour so the scene reads at a glance.
import { FIELD, FONT, PALETTE, PLAYER } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const PANEL = { width: 640, top: 150, line: 34, bottom: 74 };

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('Score ');
  const waveLabel = cachedLabel('Wave ');
  const emberLabel = cachedLabel('Embers ');
  const bestLabel = cachedLabel('Best ');
  const finalLabel = cachedLabel('Score ');
  const waveBestLabel = cachedLabel('Best wave ');
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align ?? 'left';
    if (baseline) context.textBaseline = baseline;
    context.fillText(value, x, y);
  }

  /** Client (CSS) coordinates to playfield coordinates, for mouse aiming and clicks. */
  function toField(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.x / (window.devicePixelRatio || 1)) / (view.scale / (window.devicePixelRatio || 1)),
      y: (clientY - rect.top - view.y / (window.devicePixelRatio || 1)) / (view.scale / (window.devicePixelRatio || 1)),
    };
  }

  function drawFloor(time) {
    context.fillStyle = PALETTE.floor;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Checker of faint stone tiles.
    context.fillStyle = PALETTE.floorAlt;
    const tile = 80;
    for (let ty = 0; ty < FIELD.height / tile; ty += 1) {
      for (let tx = 0; tx < FIELD.width / tile; tx += 1) {
        if ((tx + ty) % 2 === 0) context.fillRect(tx * tile, ty * tile, tile, tile);
      }
    }
    // Grid seams.
    context.strokeStyle = PALETTE.grid;
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 0; x <= FIELD.width; x += tile) { context.moveTo(x, 0); context.lineTo(x, FIELD.height); }
    for (let y = 0; y <= FIELD.height; y += tile) { context.moveTo(0, y); context.lineTo(FIELD.width, y); }
    context.stroke();
    // Wall border.
    context.strokeStyle = PALETTE.wall;
    context.lineWidth = 10;
    context.strokeRect(5, 5, FIELD.width - 10, FIELD.height - 10);
    // A few stalagmite silhouettes along the edges, fixed by the clock so they never jump.
    context.fillStyle = '#0e1330';
    const rocks = [[90, 700], [300, 712], [640, 706], [980, 712], [1180, 700], [40, 120], [1240, 240]];
    for (const [rx, ry] of rocks) {
      context.beginPath();
      context.moveTo(rx - 26, ry);
      context.lineTo(rx, ry - 34 - ((rx * 7) % 18));
      context.lineTo(rx + 26, ry);
      context.closePath();
      context.fill();
    }
    void time;
  }

  function drawPickups(state) {
    for (const item of state.pickups) {
      const blink = item.life < 3 ? (Math.floor(item.life * 6) % 2 === 0 ? 0.35 : 1) : 1;
      context.globalAlpha = blink;
      if (item.kind === 'ember') {
        context.fillStyle = PALETTE.amber;
        context.beginPath();
        context.arc(item.x, item.y, 7, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = PALETTE.flame;
        context.beginPath();
        context.arc(item.x - 2, item.y - 2, 3, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillStyle = PALETTE.heart;
        context.beginPath();
        context.arc(item.x - 4, item.y - 2, 5, 0, Math.PI * 2);
        context.arc(item.x + 4, item.y - 2, 5, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.moveTo(item.x - 8, item.y);
        context.lineTo(item.x, item.y + 9);
        context.lineTo(item.x + 8, item.y);
        context.closePath();
        context.fill();
      }
    }
    context.globalAlpha = 1;
  }

  function drawEnemies(state, time) {
    for (const enemy of state.enemies) {
      const flash = enemy.flash > 0;
      const glow = context.createRadialGradient(enemy.x, enemy.y, 2, enemy.x, enemy.y, enemy.radius * 2.2);
      glow.addColorStop(0, enemy.color);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      context.globalAlpha = 0.5;
      context.fillStyle = glow;
      context.beginPath();
      context.arc(enemy.x, enemy.y, enemy.radius * 2.2, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      context.fillStyle = flash ? '#ffffff' : enemy.color;
      if (enemy.kind === 'crawler') {
        context.beginPath();
        context.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#2a0e12';
        context.beginPath();
        context.arc(enemy.x - 7, enemy.y - 5, 4, 0, Math.PI * 2);
        context.arc(enemy.x + 7, enemy.y - 5, 4, 0, Math.PI * 2);
        context.fill();
      } else if (enemy.kind === 'spitter') {
        context.beginPath();
        context.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#0e2412';
        context.beginPath();
        context.arc(enemy.x, enemy.y, 5, 0, Math.PI * 2);
        context.fill();
      } else if (enemy.kind === 'brute' || enemy.kind === 'king') {
        // Horned boss: big body, horns, glowing eyes.
        context.beginPath();
        context.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = flash ? '#ffffff' : '#2a0e2e';
        context.beginPath();
        context.moveTo(enemy.x - enemy.radius * 0.7, enemy.y - enemy.radius * 0.5);
        context.lineTo(enemy.x - enemy.radius * 1.15, enemy.y - enemy.radius * 1.25);
        context.lineTo(enemy.x - enemy.radius * 0.3, enemy.y - enemy.radius * 0.85);
        context.moveTo(enemy.x + enemy.radius * 0.7, enemy.y - enemy.radius * 0.5);
        context.lineTo(enemy.x + enemy.radius * 1.15, enemy.y - enemy.radius * 1.25);
        context.lineTo(enemy.x + enemy.radius * 0.3, enemy.y - enemy.radius * 0.85);
        context.fill();
        context.fillStyle = '#fff3c4';
        context.beginPath();
        context.arc(enemy.x - enemy.radius * 0.32, enemy.y - enemy.radius * 0.1, 5, 0, Math.PI * 2);
        context.arc(enemy.x + enemy.radius * 0.32, enemy.y - enemy.radius * 0.1, 5, 0, Math.PI * 2);
        context.fill();
        // Boss health arc above the boss.
        const frac = Math.max(0, enemy.hp / enemy.maxHp);
        context.strokeStyle = '#3a466e';
        context.lineWidth = 6;
        context.beginPath();
        context.arc(enemy.x, enemy.y, enemy.radius + 12, -Math.PI / 2, Math.PI * 1.5);
        context.stroke();
        context.strokeStyle = enemy.kind === 'king' ? PALETTE.boss : PALETTE.danger;
        context.beginPath();
        context.arc(enemy.x, enemy.y, enemy.radius + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
        context.stroke();
      } else {
        // Mote / wisp: a glowing shard that pulses.
        const pulse = 1 + Math.sin(time * 6 + enemy.wobble) * 0.12;
        context.save();
        context.translate(enemy.x, enemy.y);
        context.rotate(enemy.wobble * 0.4);
        context.scale(pulse, pulse);
        context.beginPath();
        context.moveTo(0, -enemy.radius);
        context.lineTo(enemy.radius * 0.8, 0);
        context.lineTo(0, enemy.radius);
        context.lineTo(-enemy.radius * 0.8, 0);
        context.closePath();
        context.fill();
        context.restore();
        context.fillStyle = '#ffffff';
        context.beginPath();
        context.arc(enemy.x, enemy.y, 3, 0, Math.PI * 2);
        context.fill();
      }
      if (enemy.elite) {
        context.strokeStyle = '#ffd166';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(enemy.x, enemy.y, enemy.radius + 5, 0, Math.PI * 2);
        context.stroke();
      }
    }
  }

  function drawPlayer(state, time) {
    const p = state.player;
    if (p.invulnerable > 0 && Math.floor(p.invulnerable * 12) % 2 === 0 && p.dashTimer <= 0) {
      // Blink while invulnerable after a hit.
    } else {
      // Lantern glow.
      const lightR = PLAYER.lightRadius * state.stats.lightMul;
      const glow = context.createRadialGradient(p.x, p.y, 8, p.x, p.y, lightR * 0.55);
      glow.addColorStop(0, 'rgba(255, 179, 71, 0.30)');
      glow.addColorStop(1, 'rgba(255, 179, 71, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(p.x, p.y, lightR * 0.55, 0, Math.PI * 2);
      context.fill();
      // Body: a hooded keeper, drawn as a warm circle with a teal cloak wedge.
      context.fillStyle = '#2f6f6a';
      context.beginPath();
      context.arc(p.x, p.y, PLAYER.radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.amber;
      context.beginPath();
      context.arc(p.x, p.y, PLAYER.radius - 6, 0, Math.PI * 2);
      context.fill();
      // Aim direction: the lantern flame points where the mouse is.
      const fx = p.x + Math.cos(p.aim) * (PLAYER.radius + 8);
      const fy = p.y + Math.sin(p.aim) * (PLAYER.radius + 8);
      context.fillStyle = PALETTE.flame;
      context.beginPath();
      context.arc(fx, fy, 6 + Math.sin(time * 9) * 1.2, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#fff3c4';
      context.beginPath();
      context.arc(fx, fy, 2.6, 0, Math.PI * 2);
      context.fill();
    }
    // Dash cooldown ring under the player.
    if (p.dashCooldown > 0) {
      const frac = 1 - p.dashCooldown / (PLAYER.dashCooldown * state.stats.dashCooldownMul);
      context.strokeStyle = 'rgba(87, 230, 201, 0.7)';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(p.x, p.y, PLAYER.radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      context.stroke();
    }
  }

  function drawBoltsAndOrbs(state) {
    for (const bolt of state.bolts) {
      context.fillStyle = '#ffd166';
      context.beginPath();
      context.arc(bolt.x, bolt.y, PLAYER.boltRadius + 2, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#fff3c4';
      context.beginPath();
      context.arc(bolt.x, bolt.y, PLAYER.boltRadius - 2, 0, Math.PI * 2);
      context.fill();
    }
    for (const orb of state.orbs) {
      context.fillStyle = '#ff5a6e';
      context.beginPath();
      context.arc(orb.x, orb.y, orb.radius + 3, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffd7de';
      context.beginPath();
      context.arc(orb.x, orb.y, orb.radius - 2, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    for (const f of state.floaters) {
      context.globalAlpha = Math.min(1, f.life / 0.5);
      text(f.text, f.x, f.y, 18, f.color, 'center');
    }
    context.globalAlpha = 1;
  }

  /** The dark: everything outside the lantern's circle is dimmed. */
  function drawDarkness(state) {
    const p = state.player;
    const lightR = PLAYER.lightRadius * state.stats.lightMul;
    const dark = context.createRadialGradient(p.x, p.y, lightR * 0.55, p.x, p.y, lightR * 1.9);
    dark.addColorStop(0, 'rgba(4, 6, 16, 0)');
    dark.addColorStop(0.55, 'rgba(4, 6, 16, 0.18)');
    dark.addColorStop(1, 'rgba(4, 6, 16, 0.55)');
    context.fillStyle = dark;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function drawHud(state, best) {
    const p = state.player;
    context.textBaseline = 'top';
    // Health bar, top left.
    context.fillStyle = 'rgba(7, 10, 20, 0.72)';
    context.fillRect(16, 14, 260, 44);
    context.fillStyle = '#3a1020';
    context.fillRect(24, 22, 180, 16);
    const hpFrac = Math.max(0, p.hp / p.maxHp);
    context.fillStyle = hpFrac > 0.5 ? PALETTE.teal : hpFrac > 0.25 ? PALETTE.amber : PALETTE.danger;
    context.fillRect(24, 22, 180 * hpFrac, 16);
    text(`${Math.ceil(p.hp)} / ${p.maxHp}`, 212, 22, 16, PALETTE.text, 'left');
    text(`Dash ${p.dashCooldown <= 0 ? 'READY' : '…' }`, 24, 40, 13, PALETTE.muted, 'left');
    // Score and wave, top centre.
    text(scoreLabel(state.score), FIELD.width / 2 - 16, 16, 26, PALETTE.text, 'right');
    text(waveLabel(`${state.wave} / 10`), FIELD.width / 2 + 16, 16, 26, PALETTE.text, 'left');
    // Embers and best, top right.
    text(emberLabel(state.embers), FIELD.width - 24, 16, 26, PALETTE.amber, 'right');
    text(bestLabel(best), FIELD.width - 24, 44, 16, PALETTE.muted, 'right');
    // Boss bar, under the top centre.
    const boss = state.boss;
    if (boss) {
      const name = boss.kind === 'king' ? 'THE HOLLOW KING' : 'GLOOMBRUTE';
      text(name, FIELD.width / 2, 58, 18, PALETTE.boss, 'center');
      context.fillStyle = '#2a0e2e';
      context.fillRect(FIELD.width / 2 - 200, 80, 400, 12);
      context.fillStyle = PALETTE.boss;
      context.fillRect(FIELD.width / 2 - 200, 80, 400 * Math.max(0, boss.hp / boss.maxHp), 12);
    }
    // Wave banner.
    if (state.bannerTimer > 0 && state.banner) {
      context.globalAlpha = Math.min(1, state.bannerTimer);
      text(state.banner, FIELD.width / 2, 190, 54, PALETTE.flame, 'center');
      context.globalAlpha = 1;
    }
    // Kill streak.
    if (state.streak >= 5) {
      text(`${state.streak} STREAK`, FIELD.width / 2, 120, 22, PALETTE.teal, 'center');
    }
    // Low health pulse.
    if (hpFrac <= 0.25) {
      context.strokeStyle = `rgba(255, 90, 110, ${0.25 + 0.2 * Math.sin(Date.now() / 180)})`;
      context.lineWidth = 6;
      context.strokeRect(3, 3, FIELD.width - 6, FIELD.height - 6);
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(7, 10, 20, 0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 46, accent ?? PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 34, 23, PALETTE.amber, 'center');
  }

  /** The three upgrade cards; returns their rectangles for click handling. */
  function drawUpgradeDraft(state) {
    const cards = [];
    const cardW = 300;
    const cardH = 220;
    const gap = 28;
    const total = state.draft.length * cardW + (state.draft.length - 1) * gap;
    const startX = (FIELD.width - total) / 2;
    const y = 250;
    context.textBaseline = 'alphabetic';
    context.fillStyle = 'rgba(7, 10, 20, 0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text('THE LANTERN OFFERS', FIELD.width / 2, 120, 40, PALETTE.flame, 'center');
    text(`Wave ${state.wave} cleared — choose one blessing (click or press 1–3)`, FIELD.width / 2, 170, 22, PALETTE.muted, 'center');
    state.draft.forEach((def, i) => {
      const x = startX + i * (cardW + gap);
      const level = (state.levels[def.id] ?? 0) + 1;
      cards.push({ x, y, width: cardW, height: cardH, id: def.id });
      context.fillStyle = PALETTE.panel;
      context.fillRect(x, y, cardW, cardH);
      context.strokeStyle = PALETTE.amber;
      context.lineWidth = 2;
      context.strokeRect(x, y, cardW, cardH);
      text(`[${i + 1}]`, x + 18, y + 34, 18, PALETTE.muted, 'left');
      text(def.name, x + cardW / 2, y + 78, 26, PALETTE.text, 'center');
      text(def.blurb, x + cardW / 2, y + 122, 19, PALETTE.muted, 'center');
      text(`Level ${level} of ${def.max}`, x + cardW / 2, y + 168, 18, PALETTE.teal, 'center');
    });
    return cards;
  }

  function drawField(state, time) {
    drawFloor(time);
    drawPickups(state);
    drawEnemies(state, time);
    drawPlayer(state, time);
    drawBoltsAndOrbs(state);
    drawParticles(state);
    drawDarkness(state);
  }

  /** Paint one frame. `best` is the best score, `bestWave` the best wave reached. */
  function draw(state, screen, best, bestWave, time) {
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawField(state, time);
    let cards = null;
    if (screen === SCREEN_TITLE) {
      drawPanel(
        'EMBERLIGHT',
        ['Keeper of the Last Lantern', 'The dark is coming. Hold the light through 10 waves', 'and banish the Hollow King.', 'WASD / arrows to move · Mouse to aim · Hold click to shoot', 'Shift / right-click to dash · P to pause · M to mute', best > 0 ? bestLabel(best) : ''],
        'Press Space or click to begin',
        PALETTE.flame,
      );
    } else if (screen === SCREEN_UPGRADE) {
      drawHud(state, best);
      cards = drawUpgradeDraft(state);
    } else {
      drawHud(state, best);
      if (screen === SCREEN_PAUSED) {
        drawPanel('Paused', ['The dark waits for no one — except now.'], 'Press P to resume', PALETTE.text);
      } else if (screen === SCREEN_OVER) {
        drawPanel(
          'THE LIGHT GOES OUT',
          [`${finalLabel(state.score)}`, `${waveBestLabel(bestWave)}`, `Wave ${state.wave} of 10 · ${state.kills} foes banished · ${state.embers} embers gathered`],
          'Press Space or click to try again',
          PALETTE.danger,
        );
      } else if (screen === SCREEN_WIN) {
        drawPanel(
          'DAWN BREAKS',
          ['The Hollow King is banished. The lantern burns on.', `${finalLabel(state.score)}`, `${state.kills} foes banished · ${state.embers} embers gathered`],
          'Press Space or click to play again',
          PALETTE.flame,
        );
      }
    }
    return { cards };
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toField };
}
