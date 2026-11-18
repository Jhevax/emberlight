// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between six screens: title, play, the
// upgrade draft, paused, victory and game over.
//
// ?seed=N fixes the run. ?shot=title|play|boss|win (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
import { BEST_KEY, BEST_WAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EVENT_BOSS, EVENT_DASH, EVENT_HEAL, EVENT_HIT, EVENT_KILL,
  EVENT_LOSE, EVENT_PICKUP, EVENT_SHOOT, EVENT_WAVE_CLEAR, EVENT_WIN,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_DASH, ACTION_MUTE, ACTION_PAUSE,
  ACTION_PICK_1, ACTION_PICK_2, ACTION_PICK_3, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE,
  SCREEN_UPGRADE, SCREEN_WIN,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const baseSeed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
// The world calls this wrapper, so a screenshot retry can swap in a fresh
// seeded generator and the world really does replay with a different seed.
let rng = createRandom(baseSeed);
const world = createWorld(() => rng());
const renderer = createRenderer(canvas);
const audio = createAudio();

function readNumber(key) {
  try {
    return Number.parseInt(window.localStorage.getItem(key) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveNumber(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world, (attempt) => {
    rng = createRandom(baseSeed + attempt * 7919);
    world.reset();
  });
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, 0, 1.2);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, (clientX, clientY) => renderer.toField(clientX, clientY));
  let screen = SCREEN_TITLE;
  let best = readNumber(BEST_KEY);
  let bestWave = readNumber(BEST_WAVE_KEY);
  let accumulator = 0;
  let last = performance.now();
  let clock = 0;
  let cards = null;
  let killsSeen = 0;
  let dashQueued = false;

  function announce(message) {
    status.textContent = message;
  }

  function recordBest() {
    if (world.state.score > best) {
      best = world.state.score;
      saveNumber(BEST_KEY, best);
    }
    if (world.state.wave > bestWave) {
      bestWave = world.state.wave;
      saveNumber(BEST_WAVE_KEY, bestWave);
    }
  }

  function startGame() {
    world.reset();
    world.startWave(1);
    killsSeen = 0;
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.wave();
    announce('Playing. Wave 1. Hold the light.');
  }

  function endGame(won) {
    recordBest();
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (won) audio.win();
    else audio.lose();
    announce(won
      ? `Dawn breaks. You won with score ${world.state.score}.`
      : `The light goes out. Score ${world.state.score}. Best ${best}.`);
  }

  function applyPick(index) {
    const draft = world.state.draft;
    if (index < 0 || index >= draft.length) return;
    const id = draft[index].id;
    if (world.applyUpgrade(id)) {
      audio.upgrade();
      world.startWave(world.state.wave + 1);
      audio.wave();
      screen = SCREEN_PLAY;
      announce(`Wave ${world.state.wave}.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) {
      if (actions & ACTION_CONFIRM) startGame();
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_DASH) dashQueued = true;
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_UPGRADE) {
      if (actions & ACTION_PICK_1) applyPick(0);
      else if (actions & ACTION_PICK_2) applyPick(1);
      else if (actions & ACTION_PICK_3) applyPick(2);
      const click = input.takeClick();
      if (click && cards) {
        for (let i = 0; i < cards.length; i += 1) {
          const card = cards[i];
          if (click.x >= card.x && click.x <= card.x + card.width && click.y >= card.y && click.y <= card.y + card.height) {
            applyPick(i);
            break;
          }
        }
      }
    }
  }

  function handleEvents(events) {
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_DASH) audio.dash();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_HEAL) audio.heal();
    if (events & EVENT_HIT) audio.hurt();
    if (events & EVENT_KILL) audio.hit();
    if (world.state.kills > killsSeen) {
      killsSeen = world.state.kills;
      audio.kill();
    }
    if (events & EVENT_BOSS) audio.boss();
    if (events & EVENT_WAVE_CLEAR) {
      screen = SCREEN_UPGRADE;
      announce(`Wave ${world.state.wave} cleared. Choose a blessing.`);
    }
    if (events & EVENT_WIN) endGame(true);
    else if (events & EVENT_LOSE) endGame(false);
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { mx: 0, my: 0, firing: false, aimX: 640, aimY: 360, dash: false }, 'title');
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const move = input.moveVector();
    const aim = input.aim();
    const dash = dashQueued;
    dashQueued = false;
    const events = world.step(STEP, {
      mx: move.x, my: move.y, firing: input.isFiring(), aimX: aim.x, aimY: aim.y,
      dash,
    }, 'fight');
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    clock += dt;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      accumulator += dt;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
      world.tickFx(dt);
    }
    const drawn = renderer.draw(world.state, screen, best, bestWave, clock);
    cards = drawn.cards;
  }

  // A click on the title / end screens starts the game; clicks elsewhere are
  // the firing button, so only treat a click as confirm on those screens.
  canvas.addEventListener('pointerdown', () => {
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) {
      audio.unlock();
      startGame();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Emberlight. Press Space or click to begin.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
