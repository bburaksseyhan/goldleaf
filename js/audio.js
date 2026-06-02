// ============================================================
//  audio.js - Sound effects + looping background music
//  All sound is synthesized with the Web Audio API (no assets).
// ============================================================

let actx = null;
let muted = false;

function ensure() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { actx = null; }
  }
  if (actx && actx.state === 'suspended') actx.resume();
  return actx;
}

function tone(freq, dur, type = 'square', vol = 0.15, slideTo = null) {
  const a = ensure();
  if (!a || muted) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
  g.gain.setValueAtTime(vol, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g);
  g.connect(a.destination);
  o.start();
  o.stop(a.currentTime + dur);
}

export const Sound = {
  jump()      { tone(360, 0.18, 'triangle', 0.12, 560); },
  djump()     { tone(520, 0.16, 'triangle', 0.10, 820); },
  coin()      { tone(784, 0.08, 'triangle', 0.12); setTimeout(() => tone(1175, 0.14, 'triangle', 0.12), 60); },
  stomp()     { tone(150, 0.16, 'sine', 0.18, 70); },
  death()     { tone(300, 0.5, 'sawtooth', 0.18, 60); },
  levelup()   { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'square', 0.14), i * 120)); },
  gameover()  { [400, 330, 260, 180].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.16, f * 0.8), i * 180)); },
  click()     { tone(660, 0.08, 'square', 0.12); },
  powerup()   { [440, 660, 880, 1100].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'square', 0.13), i * 70)); },
  oneup()     { [784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, 0.14, 'triangle', 0.14), i * 90)); },
  shoot()     { tone(520, 0.12, 'sawtooth', 0.10, 180); },
  hurtBoss()  { tone(140, 0.2, 'square', 0.2, 70); },
  checkpoint(){ [660, 880, 990].forEach((f, i) => setTimeout(() => tone(f, 0.15, 'triangle', 0.13), i * 80)); },
  resume()    { ensure(); },
};

// ---------- Looping background music ----------
// A simple two-track sequencer (bass + lead) scheduled with setTimeout.
const Music = (() => {
  // ---- Calm forest theme: gentle arpeggio over Am - F - C - G ----
  const calm = {
    lead: [
      440, 523, 659, 523,   // Am
      349, 440, 523, 440,   // F
      523, 659, 784, 659,   // C
      392, 494, 587, 494,   // G
      440, 0,   659, 0,     // Am (airy)
      349, 0,   523, 0,     // F
      523, 0,   784, 0,     // C
      392, 494, 587, 0,     // G
    ],
    bass: [110, 110, 87, 87, 131, 131, 98, 98],
    tempo: 320, type: 'triangle', leadVol: 0.05, noteDur: 0.55,
    bassEvery: 2, bassDur: 0.75, bassVol: 0.06, shimmer: true,
  };

  // ---- Bonus "coin rush" theme: bright, fast, bouncy ----
  const rush = {
    lead: [
      523, 659, 784, 988, 784, 659, 523, 659,
      587, 698, 880, 1047, 880, 698, 587, 698,
      659, 784, 988, 1175, 988, 784, 659, 784,
      523, 659, 784, 1047, 784, 988, 1047, 1175,
    ],
    bass: [131, 196, 165, 196, 175, 196, 131, 196],
    tempo: 150, type: 'square', leadVol: 0.045, noteDur: 0.16,
    bassEvery: 1, bassDur: 0.18, bassVol: 0.05, shimmer: false,
  };

  let mode = 'calm';
  let playing = false;
  let step = 0;
  let bstep = 0;
  let timer = null;

  function cur() { return mode === 'rush' ? rush : calm; }

  function playNote(freq, dur, type, vol) {
    const a = ensure();
    if (!a || muted || freq === 0) return;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, a.currentTime);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g);
    g.connect(a.destination);
    o.start();
    o.stop(a.currentTime + dur);
  }

  function tick() {
    if (!playing) return;
    const m = cur();
    playNote(m.lead[step % m.lead.length], m.noteDur, m.type, m.leadVol);
    if (step % m.bassEvery === 0) playNote(m.bass[bstep % m.bass.length], m.bassDur, 'sine', m.bassVol);
    if (m.shimmer && step % 4 === 0) playNote(m.lead[step % m.lead.length] * 2, 0.9, 'sine', 0.015);
    step++; bstep++;
    timer = setTimeout(tick, m.tempo);
  }

  return {
    start() {
      if (playing) return;
      ensure();
      playing = true;
      tick();
    },
    stop() {
      playing = false;
      if (timer) { clearTimeout(timer); timer = null; }
    },
    // switch theme on the fly without interrupting the loop
    setMode(m) {
      const nm = m === 'bonus' ? 'rush' : 'calm';
      if (nm === mode) return;
      mode = nm;
      step = 0; bstep = 0; // restart the riff cleanly
    },
    isPlaying() { return playing; },
  };
})();

export { Music };

export function toggleMute() {
  muted = !muted;
  return muted;
}
export function isMuted() { return muted; }
