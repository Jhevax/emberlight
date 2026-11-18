// Keyboard and mouse input. Held keys give a move vector; the mouse gives an aim
// point in playfield coordinates; one-shot presses (start, pause, dash, upgrade
// picks, mute) are queued as bit flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_DASH = 4;
export const ACTION_MUTE = 8;
export const ACTION_PICK_1 = 16;
export const ACTION_PICK_2 = 32;
export const ACTION_PICK_3 = 64;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const DASH = new Set(['ShiftLeft', 'ShiftRight', 'KeyQ']);
const MUTE = new Set(['KeyM']);
const PICK = { Digit1: ACTION_PICK_1, Digit2: ACTION_PICK_2, Digit3: ACTION_PICK_3 };

export function createInput(canvas, toField) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let firing = false;
  let actions = 0;
  let mouseX = 640;
  let mouseY = 360;
  let mouseDown = false;
  let clicked = null;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      firing = true;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (DASH.has(event.code)) {
      if (!event.repeat) actions |= ACTION_DASH;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (PICK[event.code]) {
      if (!event.repeat) actions |= PICK[event.code];
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (CONFIRM.has(event.code)) firing = false;
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    up = false; down = false; left = false; right = false; firing = false; mouseDown = false;
  });

  function trackPointer(event) {
    const point = toField(event.clientX, event.clientY);
    mouseX = point.x;
    mouseY = point.y;
  }
  canvas.addEventListener('pointermove', trackPointer);
  canvas.addEventListener('pointerdown', (event) => {
    trackPointer(event);
    mouseDown = true;
    clicked = { x: mouseX, y: mouseY };
    if (event.button === 0) firing = true;
    if (event.button === 2) actions |= ACTION_DASH;
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) { firing = false; mouseDown = false; }
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Normalised move vector {x, y}, each component -1, 0 or 1, diagonal kept at unit length. */
    moveVector() {
      const x = (right ? 1 : 0) - (left ? 1 : 0);
      const y = (down ? 1 : 0) - (up ? 1 : 0);
      if (x !== 0 && y !== 0) {
        const inv = 1 / Math.SQRT2;
        return { x: x * inv, y: y * inv };
      }
      return { x, y };
    },
    isFiring() { return firing || mouseDown; },
    aim() { return { x: mouseX, y: mouseY }; },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The last pointer-down point in field coordinates since the last call, or null. */
    takeClick() {
      const point = clicked;
      clicked = null;
      return point;
    },
  };
}
