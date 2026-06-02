// ============================================================
//  input.js - Keyboard + touch input handling
//  Exposes current button state; fires callbacks for UI events.
// ============================================================

const keys = {};
const touch = { left: false, right: false, jump: false, run: false };

export const Input = {
  get left()  { return keys['arrowleft'] || keys['a'] || touch.left; },
  get right() { return keys['arrowright'] || keys['d'] || touch.right; },
  get jumpDown() { return keys['arrowup'] || keys['w'] || keys[' '] || touch.jump; },
  get run() { return keys['shift'] || touch.run; },
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
    if (k === 'm') doMute();
    if (k === 'enter' || k === ' ') cb.onConfirm();
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  // ---- Virtual joystick ----
  const joystickEl = document.getElementById('joystick');
  const knobEl     = document.getElementById('joystickKnob');
  if (joystickEl && knobEl) {
    let joyTouchId = null;
    const DEAD  = 14;  // px dead zone before left/right fires
    const MAX_R = 38;  // max knob travel radius (px)

    const joyMove = (cx, cy) => {
      const r = joystickEl.getBoundingClientRect();
      const dx = cx - (r.left + r.width  / 2);
      const dy = cy - (r.top  + r.height / 2);
      const dist  = Math.sqrt(dx * dx + dy * dy);
      const ratio = Math.min(1, dist / MAX_R);
      const angle = Math.atan2(dy, dx);
      const kx = Math.cos(angle) * ratio * MAX_R;
      const ky = Math.sin(angle) * ratio * MAX_R;
      knobEl.style.transform = `translate(calc(-50% + ${kx.toFixed(1)}px), calc(-50% + ${ky.toFixed(1)}px))`;
      touch.left  = dx < -DEAD;
      touch.right = dx >  DEAD;
    };

    const joyEnd = () => {
      joyTouchId = null;
      knobEl.style.transform = 'translate(-50%, -50%)';
      touch.left = touch.right = false;
    };

    joystickEl.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.changedTouches[0];
      joyTouchId = t.identifier;
      joyMove(t.clientX, t.clientY);
      cb.onResume();
    }, { passive: false });

    window.addEventListener('touchmove', e => {
      if (joyTouchId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier === joyTouchId) { joyMove(t.clientX, t.clientY); break; }
      }
    }, { passive: false });

    const joyTouchEnd = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyTouchId) { joyEnd(); break; }
      }
    };
    window.addEventListener('touchend',    joyTouchEnd, { passive: false });
    window.addEventListener('touchcancel', joyTouchEnd, { passive: false });

    // mouse fallback for desktop testing
    joystickEl.addEventListener('mousedown', e => {
      joyTouchId = -1; joyMove(e.clientX, e.clientY); cb.onResume();
    });
    window.addEventListener('mousemove', e => {
      if (joyTouchId !== -1) return; joyMove(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', () => { if (joyTouchId === -1) joyEnd(); });
  }

  // jump button
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
  bind('btnJump', 'jump');

  const pauseBtn = document.getElementById('btnPause');
  if (pauseBtn) pauseBtn.addEventListener('click', () => cb.onPause());

  // mute toggle (keyboard 'm' and the on-screen button share this)
  const muteBtn = document.getElementById('btnMute');
  function updateMuteIcon(muted) {
    if (!muteBtn) return;
    muteBtn.innerHTML = muted ? '&#128263;' : '&#128266;'; // 🔇 / 🔊
    muteBtn.classList.toggle('muted', !!muted);
  }
  function doMute() {
    const m = cb.onMute();
    updateMuteIcon(m);
  }
  if (muteBtn) {
    const onMutePress = e => { e.preventDefault(); doMute(); };
    muteBtn.addEventListener('click', onMutePress);
    muteBtn.addEventListener('touchend', onMutePress, { passive: false });
  }

  // run toggle (touch) — keyboard uses Shift instead
  const runBtn = document.getElementById('btnRun');
  if (runBtn) {
    const toggleRun = e => {
      e.preventDefault();
      touch.run = !touch.run;
      runBtn.classList.toggle('on', touch.run);
      cb.onResume();
    };
    runBtn.addEventListener('click', toggleRun);
    runBtn.addEventListener('touchend', toggleRun, { passive: false });
  }

  const fsBtn = document.getElementById('btnFullscreen');
  if (fsBtn) {
    const toggleFullscreen = e => {
      if (e) e.preventDefault();
      const root = document.documentElement;
      const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (!isFs) {
        const req = root.requestFullscreen || root.webkitRequestFullscreen;
        if (req) {
          req.call(root).then(() => {
            if (screen.orientation && screen.orientation.lock)
              screen.orientation.lock('landscape').catch(() => {});
          }).catch(() => {});
        }
        // iOS Safari: no fullscreen API — scroll away the address bar instead
        if (!req) window.scrollTo(0, 1);
      } else {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) exit.call(document);
      }
    };
    fsBtn.addEventListener('click', toggleFullscreen);
    fsBtn.addEventListener('touchend', e => { e.preventDefault(); toggleFullscreen(e); }, { passive: false });
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
