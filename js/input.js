// ============================================================
//  input.js - Keyboard + touch input handling
//  Exposes current button state; fires callbacks for UI events.
// ============================================================

const keys = {};
const touch = { left: false, right: false, jump: false };

export const Input = {
  get left()  { return keys['arrowleft'] || keys['a'] || touch.left; },
  get right() { return keys['arrowright'] || keys['d'] || touch.right; },
  get jumpDown() { return keys['arrowup'] || keys['w'] || keys[' '] || touch.jump; },
};

// callbacks: { onConfirm, onPause, onMute, onCanvasPoint, onResume }
export function initInput(canvas, W, H, cb) {
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (keys[k]) return; // ignore auto-repeat
    keys[k] = true;
    cb.onResume();

    if (k === 'p') cb.onPause();
    if (k === 'm') cb.onMute();
    if (k === 'enter' || k === ' ') cb.onConfirm();
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  // touch buttons
  const bind = (id, prop) => {
    const el = document.getElementById(id);
    if (!el) return;
    const on = e => { e.preventDefault(); touch[prop] = true; cb.onResume(); };
    const off = e => { e.preventDefault(); touch[prop] = false; };
    el.addEventListener('touchstart', on, { passive: false });
    el.addEventListener('touchend', off, { passive: false });
    el.addEventListener('touchcancel', off, { passive: false });
    el.addEventListener('mousedown', on);
    el.addEventListener('mouseup', off);
    el.addEventListener('mouseleave', off);
  };
  bind('btnLeft', 'left');
  bind('btnRight', 'right');
  bind('btnJump', 'jump');

  const pauseBtn = document.getElementById('btnPause');
  if (pauseBtn) pauseBtn.addEventListener('click', () => cb.onPause());

  const fsBtn = document.getElementById('btnFullscreen');
  if (fsBtn) {
    const toggleFullscreen = e => {
      if (e) e.preventDefault();
      const el = document.documentElement;
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(() => {});
        }
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
      }
    };
    fsBtn.addEventListener('click', toggleFullscreen);
    fsBtn.addEventListener('touchend', toggleFullscreen, { passive: false });
  }

  // map a client point to logical canvas coordinates
  const toLogical = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (W / rect.width),
      y: (clientY - rect.top) * (H / rect.height),
    };
  };

  canvas.addEventListener('click', e => {
    cb.onResume();
    const p = toLogical(e.clientX, e.clientY);
    cb.onCanvasPoint(p.x, p.y);
  });
  canvas.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    cb.onResume();
    const p = toLogical(t.clientX, t.clientY);
    cb.onCanvasPoint(p.x, p.y);
  }, { passive: true });

  // show touch controls + rotate hint on touch devices
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    const tc = document.getElementById('touchControls');
    if (tc) tc.classList.add('active');
    const rh = document.getElementById('rotateHint');
    if (rh) rh.classList.add('enabled');
  }
}
