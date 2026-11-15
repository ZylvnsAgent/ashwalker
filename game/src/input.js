// Keyboard and mouse, and the pointer lock that turns the mouse into look.
// Plain browser APIs only. Besides the held-key set it exposes press edges:
// takePress() returns the codes pressed since the last call (for semi-auto
// weapons, buying and one-shot actions).
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  const state = { keys, locked: false, firing: false, lookX: 0, lookY: 0 };

  function setKey(event, down) {
    if (down) {
      if (!keys.has(event.code)) pressed.add(event.code);
      keys.add(event.code);
    } else keys.delete(event.code);
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => { keys.clear(); pressed.clear(); });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (state.locked && event.button === 0) state.firing = true;
    if (event.button === 0) pressed.add('Mouse0');
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      // requestPointerLock returns a promise in modern browsers; a rejection
      // (no user gesture yet) must not surface as an uncaught error — the
      // game keeps running and the next real click retries the lock.
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    takePress() {
      // Copy first: `out` must be a different Set than `pressed`, or the
      // clear below would empty the very set being returned (press edges
      // would never fire: no semi-auto shots, no reload, no buy keys).
      const out = new Set(pressed);
      pressed.clear();
      return out;
    },
  };
}
