// ============================================================
//  game.js - Core game: state, flow, update, render, UI, loop
// ============================================================
import {
  W, H, GRAVITY, MOVE_SPEED, RUN_SPEED, BOOST_SPEED, ACCEL, FRICTION, JUMP_VELOCITY,
  MAX_FALL, SPEED_DURATION, STAR_DURATION, LIVES_PER_LEVEL, CHARACTERS,
  STATE, STORAGE_HIGH, STORAGE_PROGRESS, STORAGE_CHAR,
} from './config.js';
import { Sound, Music, toggleMute, isMuted } from './audio.js';
import { Input, initInput } from './input.js';
import { makeLevels } from './levels.js';
import { Net } from './net.js';

const STORAGE_NAME = 'pixelquest_name';

let canvas, ctx;

// ---------- Image assets (sprite sheets) ----------
const Assets = {
  images: {},
  load(name, src) { const img = new Image(); img.src = src; this.images[name] = img; },
  ready(name) { const i = this.images[name]; return !!(i && i.complete && i.naturalWidth > 0); },
};
Assets.load('mushRun', 'assets/mushroom/Mushroom-Run.png');
Assets.load('mushDie', 'assets/mushroom/Mushroom-Die.png');
Assets.load('flyFly', 'assets/flyer/Enemy3-Fly.png');
Assets.load('flyDie', 'assets/flyer/Enemy3-Die.png');
for (const c of ['green', 'blue', 'orange']) {
  Assets.load('slime_' + c + '_run', 'assets/slime/' + c + '-run.png');
  Assets.load('slime_' + c + '_jump', 'assets/slime/' + c + '-jump.png');
  Assets.load('slime_' + c + '_die', 'assets/slime/' + c + '-die.png');
}
Assets.load('bushIdle', 'assets/bush/Bush-Idle.png');
Assets.load('bushDie', 'assets/bush/Bush-Die.png');
for (let i = 0; i < CHARACTERS.length; i++) {
  Assets.load('pl' + i + 'Idle', 'assets/player/idle_' + i + '.png');
  Assets.load('pl' + i + 'Run', 'assets/player/run_' + i + '.png');
  Assets.load('pl' + i + 'Jump', 'assets/player/jump_' + i + '.png');
}
const MUSH_FW = 80, MUSH_FH = 64; // mushroom frame size
const FLY_FW = 64, FLY_FH = 64;   // flyer frame size
const SLIME_FW = 64, SLIME_FH = 64; // slime frame size
const BUSH_FW = 90, BUSH_FH = 64;   // bush monster frame size
const PLAYER_FW = 64, PLAYER_FH = 64; // player frame size (Leafy sprite)
const PL_IDLE_N = 24, PL_RUN_N = 8, PL_JUMP_N = 2;

// ---------- Shared state ----------
let gameState = STATE.MENU;
let levels = makeLevels();
let levelIndex = 0;
let level = null;

const player = {
  x: 0, y: 0, w: 28, h: 40, vx: 0, vy: 0,
  onGround: false, facing: 1,
  jumps: 0, maxJumps: 2,
  animFrame: 0, animTimer: 0, state: 'idle',
  dead: false, deathTimer: 0, spawnX: 0, spawnY: 0,
  invuln: 0, boostTimer: 0, starTimer: 0,
  ridingMover: null,
};

let score = 0;
let lives = 3;
let coinsCollected = 0;
let totalCoins = 0; // session-wide gold, reported to the live leaderboard
let timeLeft = 0;
let timeAccum = 0;
let bonus = null; // active "coin rush" bonus event (triggered by checkpoints)
let looseCoins = []; // scattered collectible coins (chest burst, golden enemy)
let fruit = null;    // active rare forest fruit
let fruitTimer = 0;  // frames until the next fruit appears
let goldenTimer = 0; // frames until a random enemy turns golden
let secret = null;   // active secret bonus-room session ({ active, timer, ret })

const camera = { x: 0, y: 0 };
let particles = [];
let popups = [];
let projectiles = [];
let shake = 0;
let jumpHeld = false;

let highScore = +(localStorage.getItem(STORAGE_HIGH) || 0);
let progress = +(localStorage.getItem(STORAGE_PROGRESS) || 0); // highest unlocked level index
let selectedChar = Math.min(CHARACTERS.length - 1, Math.max(0, +(localStorage.getItem(STORAGE_CHAR) || 0)));

let buttons = {}; // clickable UI rects keyed by id

// anim timers
let coinSpin = 0, flagWave = 0, titleBob = 0, winSpin = 0, waterPhase = 0, starHue = 0;

// ============================================================
//  FLOW
// ============================================================
export function init(_canvas, _ctx) {
  canvas = _canvas; ctx = _ctx;
  initInput(canvas, W, H, {
    onConfirm: handleConfirm,
    onPause: togglePause,
    onMute: () => { const m = toggleMute(); if (m) Music.stop(); else if (gameState === STATE.PLAYING) Music.start(); return m; },
    onCanvasPoint: handleCanvasPoint,
    onResume: () => Sound.resume(),
  });
  setupMultiplayer();
  requestAnimationFrame(loop);
}

function setupMultiplayer() {
  // load or generate a player name
  let name = localStorage.getItem(STORAGE_NAME);
  if (!name) { name = 'Spirit' + Math.floor(1000 + Math.random() * 9000); localStorage.setItem(STORAGE_NAME, name); }

  const input = document.getElementById('nameInput');
  if (input) {
    input.value = name;
    input.addEventListener('input', () => {
      const v = input.value.trim() || 'Guest';
      localStorage.setItem(STORAGE_NAME, v);
      Net.setName(v);
    });
  }
  Net.connect(name);
}

function startGame(fromIndex = 0) {
  Sound.resume();
  levels = makeLevels();
  levelIndex = fromIndex;
  score = 0;
  lives = 3;
  totalCoins = 0;
  loadLevel(levelIndex);
  gameState = STATE.PLAYING;
  if (!isMuted()) Music.start();
}

function loadLevel(idx) {
  level = levels[idx];
  lives = LIVES_PER_LEVEL; // each level starts fresh with full lives
  player.x = level.spawn.x; player.y = level.spawn.y;
  player.spawnX = level.spawn.x; player.spawnY = level.spawn.y;
  player.vx = 0; player.vy = 0; player.jumps = 0;
  player.dead = false; player.deathTimer = 0; player.invuln = 60;
  player.facing = 1; player.state = 'idle';
  player.boostTimer = 0; player.starTimer = 0; player.ridingMover = null;
  coinsCollected = 0;
  timeLeft = level.time;
  timeAccum = 0;
  bonus = null;
  looseCoins = [];
  fruit = null;
  fruitTimer = (10 + Math.random() * 8) * 60;
  goldenTimer = (8 + Math.random() * 6) * 60;
  secret = null;
  Music.setMode('normal');
  (level.chests || []).forEach(ch => { ch.hits = 0; ch.burst = false; ch.shake = 0; ch.w = 38; ch.h = 30; });
  if (level.portal) level.portal.used = false;
  camera.x = 0; camera.y = 0;
  particles = []; popups = []; projectiles = []; shake = 0;

  level.movers.forEach(m => { m.ox = m.x; m.oy = m.y; m.t = 0; m.pdx = 0; m.pdy = 0; });
  level.enemies.forEach(initEnemy);
  (level.checkpoints || []).forEach(c => { c.active = false; });
  if (level.boss) {
    const b = level.boss;
    b.dir = 1; b.vy = 0; b.onGround = false; b.hp = b.maxHp;
    b.jumpTimer = 90; b.shootTimer = 140; b.hurtFlash = 0; b.defeated = false; b.defeatTimer = 0;
  }
}

function initEnemy(e) {
  e.startX = e.x; e.dir = 1; e.anim = 0; e.dead = false; e.deadTimer = 0; e.gone = false; e.dieStart = null;
  e.golden = false; e.goldenTimer = 0;
  if (e.type === 'flyer') e.baseY = e.y;
  if (e.type === 'jumper') { e.baseY = e.y; e.vy = 0; e.timer = e.interval; e.airborne = false; }
  if (e.type === 'shooter') e.timer = e.shootInterval;
}

function nextLevel() {
  // unlock progress
  progress = Math.max(progress, Math.min(levelIndex + 1, levels.length - 1));
  localStorage.setItem(STORAGE_PROGRESS, progress);
  levelIndex++;
  if (levelIndex >= levels.length) {
    gameState = STATE.WIN;
    Music.stop();
    saveHigh();
    Net.report(totalCoins, score, level.name, lives, 'win', true);
  } else {
    loadLevel(levelIndex);
    gameState = STATE.PLAYING;
    if (!isMuted()) Music.start();
  }
}

function togglePause() {
  if (gameState === STATE.PLAYING) { gameState = STATE.PAUSED; Music.stop(); }
  else if (gameState === STATE.PAUSED) { gameState = STATE.PLAYING; if (!isMuted()) Music.start(); }
}

function saveHigh() {
  if (score > highScore) { highScore = score; localStorage.setItem(STORAGE_HIGH, highScore); }
}

function killPlayer() {
  if (player.dead || player.invuln > 0 || player.starTimer > 0) return;
  player.dead = true;
  player.deathTimer = 70;
  player.vy = -10;
  player.boostTimer = 0; player.starTimer = 0;
  shake = 18;
  Sound.death();
  spawnParticles(player.x + player.w / 2, player.y + player.h / 2, '#ff5555', 24);
}

function respawnOrGameOver() {
  lives--;
  if (lives <= 0) {
    gameState = STATE.GAMEOVER;
    Music.stop();
    Sound.gameover();
    saveHigh();
    Net.report(totalCoins, score, level.name, 0, 'over', true);
  } else {
    player.x = player.spawnX; player.y = player.spawnY;
    player.vx = 0; player.vy = 0; player.jumps = 0;
    player.dead = false; player.deathTimer = 0; player.invuln = 80;
    player.state = 'idle';
    spawnParticles(player.x + player.w / 2, player.y + player.h / 2, '#ffffff', 16);
  }
}

function handleConfirm() {
  if (gameState === STATE.MENU) startGame(0);
  else if (gameState === STATE.GAMEOVER || gameState === STATE.WIN) gameState = STATE.MENU;
  else if (gameState === STATE.LEVELCOMPLETE) nextLevel();
}

function handleCanvasPoint(mx, my) {
  if (gameState === STATE.PLAYING) return; // no clickable UI while playing
  for (const key in buttons) {
    const b = buttons[key];
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
      Sound.click();
      b.action();
      return;
    }
  }
}

// ============================================================
//  PARTICLES / POPUPS
// ============================================================
function spawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1.5 + Math.random() * 4;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5,
      life: 30 + Math.random() * 20, max: 50, color, size: 2 + Math.random() * 3,
    });
  }
}
function spawnPopup(x, y, text, color) {
  popups.push({ x, y, text, color, life: 60, vy: -0.8 });
}

function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ============================================================
//  UPDATE
// ============================================================
function update() {
  if (gameState !== STATE.PLAYING) return;

  const wantJump = Input.jumpDown;
  const jumpPressed = wantJump && !jumpHeld;
  jumpHeld = wantJump;

  // timer (the secret room runs its own countdown instead)
  if (!player.dead && !secret) {
    timeAccum += 1 / 60;
    if (timeAccum >= 1) { timeAccum -= 1; timeLeft--; if (timeLeft <= 0) { timeLeft = 0; killPlayer(); } }
  }

  // death animation
  if (player.dead) {
    player.deathTimer--;
    player.vy += GRAVITY;
    player.y += player.vy;
    player.x += player.vx;
    if (player.deathTimer <= 0) respawnOrGameOver();
    updateParticles(); updateMovers();
    if (shake > 0) shake *= 0.9;
    return;
  }

  if (player.invuln > 0) player.invuln--;
  if (player.boostTimer > 0) player.boostTimer--;
  if (player.starTimer > 0) player.starTimer--;

  const maxSpeed = player.boostTimer > 0 ? BOOST_SPEED : (Input.run ? RUN_SPEED : MOVE_SPEED);
  const accel = Input.run ? ACCEL * 1.35 : ACCEL; // snappier acceleration while sprinting

  // horizontal movement
  if (Input.left) { player.vx -= accel; player.facing = -1; }
  if (Input.right) { player.vx += accel; player.facing = 1; }
  if (!Input.left && !Input.right) player.vx *= FRICTION;
  player.vx = Math.max(-maxSpeed, Math.min(maxSpeed, player.vx));
  if (Math.abs(player.vx) < 0.05) player.vx = 0;

  // jump
  if (jumpPressed && player.jumps < player.maxJumps) {
    player.vy = JUMP_VELOCITY;
    player.jumps++;
    if (player.jumps === 1) Sound.jump();
    else { Sound.djump(); spawnParticles(player.x + player.w / 2, player.y + player.h, '#ffffff', 8); }
    player.onGround = false;
  }

  player.vy += GRAVITY;
  if (player.vy > MAX_FALL) player.vy = MAX_FALL;

  updateMovers();

  // Carry the player along with the platform they are standing on BEFORE
  // applying their own physics. This keeps the player glued to platforms
  // that move down/up/sideways and prevents sinking through fast movers.
  if (player.ridingMover) {
    player.x += player.ridingMover.pdx;
    player.y += player.ridingMover.pdy;
  }

  player.x += player.vx;
  resolveCollisions('x');

  player.onGround = false;
  player.y += player.vy;
  resolveCollisions('y');

  // Detect which moving platform the player is resting on (for next frame).
  player.ridingMover = null;
  for (const m of level.movers) {
    const feet = { x: player.x + 2, y: player.y + player.h - 1, w: player.w - 4, h: 6 };
    if (player.vy >= 0 && aabb(feet, m)) {
      player.ridingMover = m;
      // snap firmly onto the platform top so gravity can't accumulate
      player.y = m.y - player.h;
      player.vy = 0;
      player.onGround = true;
      player.jumps = 0;
    }
  }

  // world bounds
  if (player.x < 0) { player.x = 0; player.vx = 0; }
  if (player.x + player.w > level.width) { player.x = level.width - player.w; player.vx = 0; }
  // fell into a pit / off the bottom of the world -> always fatal (ignore
  // spawn invulnerability and star power so you can't walk around down there)
  if (player.y > H + 120 && !player.dead) {
    player.invuln = 0; player.starTimer = 0;
    killPlayer();
  }

  updateCoins();
  updatePowerups();
  updateLooseCoins();
  updateEnemies();
  updateProjectiles();
  if (level.boss) updateBoss();
  updateCheckpoints();
  updateBonus();
  if (!secret) { updateChests(); updateFruit(); updateGolden(); }
  updatePortal();
  updateSpikes();
  updateFlag();

  updatePlayerAnim();
  updateCamera();
  updateParticles();
  updatePopups();
  if (shake > 0) shake *= 0.88;

  Net.report(totalCoins, score, level.name, lives, player.dead ? 'dead' : 'playing');
}

function updateMovers() {
  for (const m of level.movers) {
    const px = m.x, py = m.y;
    m.t = (m.t || 0) + 0.02 * m.speed;
    if (m.axis === 'x') m.x = m.ox + Math.sin(m.t) * m.range / 2;
    else m.y = m.oy + Math.sin(m.t) * m.range / 2;
    m.pdx = m.x - px; m.pdy = m.y - py;
  }
}

function resolveCollisions(axis) {
  const solids = level.platforms.concat(level.movers);
  for (const s of solids) {
    if (!aabb(player, s)) continue;
    if (axis === 'x') {
      if (player.vx > 0) player.x = s.x - player.w;
      else if (player.vx < 0) player.x = s.x + s.w;
      player.vx = 0;
    } else {
      if (player.vy > 0) { player.y = s.y - player.h; player.onGround = true; player.jumps = 0; }
      else if (player.vy < 0) player.y = s.y + s.h;
      player.vy = 0;
    }
  }
}

function updateCoins() {
  for (const c of level.coins) {
    if (c.taken) continue;
    const dx = (player.x + player.w / 2) - c.x;
    const dy = (player.y + player.h / 2) - c.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 90) { c.x += dx * 0.18; c.y += dy * 0.18; }
    if (dist < 26) {
      c.taken = true; score += 100; coinsCollected++; totalCoins++;
      Sound.coin();
      spawnParticles(c.x, c.y, '#ffd700', 10);
      spawnPopup(c.x, c.y - 10, '+100', '#ffd700');
    }
  }
}

function updatePowerups() {
  for (const p of (level.powerups || [])) {
    if (p.taken) continue;
    const box = { x: p.x - 16, y: p.y - 16, w: 32, h: 32 };
    if (aabb(player, box)) {
      p.taken = true;
      if (p.type === 'speed') {
        player.boostTimer = SPEED_DURATION;
        Sound.powerup(); spawnPopup(p.x, p.y - 12, 'SPEED!', '#4dd2ff');
      } else if (p.type === 'star') {
        player.starTimer = STAR_DURATION;
        Sound.powerup(); spawnPopup(p.x, p.y - 12, 'INVINCIBLE!', '#ffd700');
      } else if (p.type === 'life') {
        lives = Math.min(9, lives + 1);
        Sound.oneup(); spawnPopup(p.x, p.y - 12, '1UP', '#7CFC8A');
      }
      spawnParticles(p.x, p.y, '#ffffff', 14);
    }
  }
}

function defeatEnemy(e, points) {
  e.dead = true; e.deadTimer = 42; e.dieStart = performance.now();
  score += points;
  Sound.stomp();
  spawnParticles(e.x + e.w / 2, e.y + e.h / 2, '#8b4513', 14);
  spawnPopup(e.x + e.w / 2, e.y - 6, '+' + points, '#fff');
  if (e.golden) {
    e.golden = false;
    spawnLooseCoins(e.x + e.w / 2, e.y + e.h / 2, 8);
    score += 300;
    spawnParticles(e.x + e.w / 2, e.y + e.h / 2, '#ffd700', 18);
    spawnPopup(e.x + e.w / 2, e.y - 24, 'GOLD +300', '#ffd54f');
  }
}

function updateEnemies() {
  for (const e of level.enemies) {
    if (e.dead) {
      e.deadTimer--;
      if (e.deadTimer <= 0) e.gone = true; // mushroom vanishes after its death animation
      continue;
    }
    e.anim = (e.anim || 0) + 0.15;

    if (e.type === 'walker') {
      e.x += e.speed * e.dir;
      if (e.x > e.startX + e.range) { e.x = e.startX + e.range; e.dir = -1; }
      if (e.x < e.startX) { e.x = e.startX; e.dir = 1; }
    } else if (e.type === 'flyer') {
      e.x += e.speed * e.dir;
      if (e.x > e.startX + e.range) { e.x = e.startX + e.range; e.dir = -1; }
      if (e.x < e.startX) { e.x = e.startX; e.dir = 1; }
      e.y = e.baseY + Math.sin(e.anim) * e.amp;
    } else if (e.type === 'jumper') {
      // horizontal patrol (like the walker)
      const range = e.range || 130, hspeed = e.speed || 1.2;
      e.x += hspeed * e.dir;
      if (e.x > e.startX + range) { e.x = e.startX + range; e.dir = -1; }
      if (e.x < e.startX) { e.x = e.startX; e.dir = 1; }
      // periodic hop
      e.timer--;
      e.vy += GRAVITY;
      e.y += e.vy;
      if (e.y >= e.baseY) {
        e.y = e.baseY; e.vy = 0; e.airborne = false;
        if (e.timer <= 0) { e.vy = e.jumpPower; e.timer = e.interval; e.airborne = true; }
      } else {
        e.airborne = true;
      }
    } else if (e.type === 'shooter') {
      e.timer--;
      const dx = (player.x + player.w / 2) - (e.x + e.w / 2);
      const dy = (player.y + player.h / 2) - (e.y + e.h / 2);
      if (e.timer <= 0 && Math.abs(dx) < 540) {
        const d = Math.hypot(dx, dy) || 1;
        const sp = 3.4;
        projectiles.push({ x: e.x + e.w / 2, y: e.y + 12, vx: dx / d * sp, vy: dy / d * sp, w: 12, h: 12, life: 220 });
        Sound.shoot();
        e.timer = e.shootInterval;
        e.facing = dx < 0 ? -1 : 1;
      }
    }

    // collision with player
    if (player.invuln <= 0 && aabb(player, e)) {
      const stomping = player.vy > 0 && (player.y + player.h - e.y) < 24;
      if (player.starTimer > 0) {
        defeatEnemy(e, 150);
      } else if (stomping) {
        defeatEnemy(e, 200);
        player.vy = JUMP_VELOCITY * 0.7;
        player.jumps = 1;
      } else {
        killPlayer();
      }
    }
  }
}

function updateProjectiles() {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.x += p.vx; p.y += p.vy; p.life--;
    const box = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
    if (player.invuln <= 0 && player.starTimer <= 0 && aabb(player, box)) {
      killPlayer();
      projectiles.splice(i, 1);
      continue;
    }
    if (p.life <= 0 || p.x < camera.x - 80 || p.x > camera.x + W + 80 || p.y > H + 100) {
      projectiles.splice(i, 1);
    }
  }
}

function updateBoss() {
  const b = level.boss;
  if (b.hurtFlash > 0) b.hurtFlash--;

  if (b.defeated) {
    b.defeatTimer--;
    b.vy += GRAVITY; b.y += b.vy;
    if (b.defeatTimer % 6 === 0) spawnParticles(b.x + Math.random() * b.w, b.y + Math.random() * b.h, '#ff5555', 8);
    shake = Math.max(shake, 6);
    if (b.defeatTimer <= 0) {
      score += 1500;
      Sound.levelup();
      gameState = STATE.LEVELCOMPLETE;
      saveHigh();
    }
    return;
  }

  // movement
  b.x += b.speed * b.dir;
  if (b.x < 50) { b.x = 50; b.dir = 1; }
  if (b.x + b.w > level.width - 50) { b.x = level.width - 50 - b.w; b.dir = -1; }

  // gravity / floor
  b.vy += GRAVITY; b.y += b.vy;
  const floorTop = 480;
  if (b.y + b.h >= floorTop) { b.y = floorTop - b.h; b.vy = 0; b.onGround = true; }

  // jump
  b.jumpTimer--;
  if (b.jumpTimer <= 0 && b.onGround) { b.vy = -15; b.onGround = false; b.jumpTimer = 120 + Math.random() * 60; }

  // shoot spread
  b.shootTimer--;
  if (b.shootTimer <= 0) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    for (const ang of [-0.4, 0, 0.4]) {
      const dx = (player.x - cx), dy = (player.y - cy);
      const base = Math.atan2(dy, dx) + ang;
      const sp = 3.6;
      projectiles.push({ x: cx, y: cy, vx: Math.cos(base) * sp, vy: Math.sin(base) * sp, w: 14, h: 14, life: 240 });
    }
    Sound.shoot();
    b.shootTimer = 150;
  }

  // collision
  if (player.invuln <= 0 && aabb(player, b)) {
    const stomping = player.vy > 0 && (player.y + player.h - b.y) < 30;
    if (stomping) {
      player.vy = JUMP_VELOCITY * 0.8; player.jumps = 1;
      if (b.hurtFlash <= 0) hurtBoss(b);
    } else if (player.starTimer > 0) {
      if (b.hurtFlash <= 0) hurtBoss(b);
    } else {
      killPlayer();
    }
  }
}

function hurtBoss(b) {
  b.hp--;
  b.hurtFlash = 40;
  b.speed += 0.4;
  Sound.hurtBoss();
  spawnParticles(b.x + b.w / 2, b.y + b.h / 2, '#ffcc00', 18);
  spawnPopup(b.x + b.w / 2, b.y - 10, 'HIT!', '#ff5555');
  if (b.hp <= 0) {
    b.defeated = true; b.defeatTimer = 110; b.vy = -6;
    spawnPopup(b.x + b.w / 2, b.y - 20, 'DEFEATED!', '#ffd700');
  }
}

function updateCheckpoints() {
  for (const c of (level.checkpoints || [])) {
    if (c.active) continue;
    const box = { x: c.x - 14, y: c.y - 70, w: 28, h: 84 };
    if (aabb(player, box)) {
      c.active = true;
      player.spawnX = c.x - player.w / 2;
      player.spawnY = c.y - player.h;
      Sound.checkpoint();
      spawnPopup(c.x, c.y - 80, 'CHECKPOINT!', '#7CFC8A');
      spawnParticles(c.x, c.y - 40, '#7CFC8A', 16);
      startBonus(c);
    }
  }
}

// ---------- Bonus "coin rush" event ----------
const BONUS_TIME = 9 * 60;   // seconds to grab every coin
const FLOWER_TIME = 6 * 60;  // window to grab the big flower afterwards
function startBonus(c) {
  if (bonus) return; // one rush at a time
  const n = 6;
  const coins = [];
  for (let i = 0; i < n; i++) {
    let cx = c.x + (Math.random() * 2 - 1) * 190;
    cx = Math.max(40, Math.min(level.width - 40, cx));
    const cy = c.y - 24 - Math.random() * 140;
    coins.push({ x: cx, y: cy, taken: false, phase: Math.random() * Math.PI * 2 });
  }
  bonus = {
    phase: 'collect',
    coins,
    target: n,
    collected: 0,
    timer: BONUS_TIME,
    max: BONUS_TIME,
    flower: null,
    anchorX: c.x,
    anchorY: c.y - 90,
  };
  if (!isMuted()) Music.setMode('bonus');
  spawnPopup(c.x, c.y - 100, 'COIN RUSH!', '#ffd54f');
}

function updateBonus() {
  if (!bonus) return;
  bonus.timer--;
  if (bonus.timer <= 0) { // ran out of time
    spawnPopup(player.x + player.w / 2, player.y - 16, bonus.phase === 'flower' ? 'MISSED!' : 'TIME UP', '#ff8a80');
    bonus = null;
    if (!isMuted()) Music.setMode('normal');
    return;
  }

  if (bonus.phase === 'collect') {
    for (const c of bonus.coins) {
      if (c.taken) continue;
      c.phase += 0.12;
      const dx = (player.x + player.w / 2) - c.x;
      const dy = (player.y + player.h / 2) - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 100) { c.x += dx * 0.2; c.y += dy * 0.2; }
      if (dist < 26) {
        c.taken = true; bonus.collected++;
        score += 50; totalCoins++; coinsCollected++;
        Sound.coin();
        spawnParticles(c.x, c.y, '#ffd700', 8);
        spawnPopup(c.x, c.y - 10, '+50', '#ffd700');
      }
    }
    if (bonus.collected >= bonus.target) {
      // every coin grabbed in time -> the great flower blooms
      bonus.phase = 'flower';
      bonus.timer = FLOWER_TIME;
      bonus.max = FLOWER_TIME;
      bonus.flower = { x: bonus.anchorX, y: bonus.anchorY, taken: false, bloom: 0 };
      Sound.powerup();
      spawnPopup(bonus.anchorX, bonus.anchorY - 30, 'BLOOM!', '#ff80ab');
      spawnParticles(bonus.anchorX, bonus.anchorY, '#ff80ab', 22);
    }
  } else if (bonus.phase === 'flower') {
    const f = bonus.flower;
    f.bloom = Math.min(1, f.bloom + 0.06);
    const box = { x: f.x - 22, y: f.y - 22, w: 44, h: 44 };
    if (aabb(player, box)) {
      f.taken = true;
      score += 1000; totalCoins += 10; coinsCollected += 10;
      Sound.oneup();
      spawnParticles(f.x, f.y, '#ff80ab', 28);
      spawnParticles(f.x, f.y, '#ffd700', 18);
      spawnPopup(f.x, f.y - 28, 'BONUS +1000', '#ffd54f');
      bonus = null;
      Music.setMode('normal');
    }
  }
}

// ---------- Loose scattered coins (chest burst + golden enemy drops) ----------
function spawnLooseCoins(x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    const sp = 3 + Math.random() * 4.5;
    looseCoins.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2.5,
      restY: y + 6 + Math.random() * 18, settled: false,
      life: 360, taken: false, phase: Math.random() * 6,
    });
  }
}
function updateLooseCoins() {
  for (let i = looseCoins.length - 1; i >= 0; i--) {
    const c = looseCoins[i];
    c.phase += 0.2; c.life--;
    if (!c.settled) {
      c.vy += 0.3; c.x += c.vx; c.y += c.vy; c.vx *= 0.98;
      if (c.vy > 0 && c.y >= c.restY) { c.y = c.restY; c.settled = true; }
    }
    const dx = (player.x + player.w / 2) - c.x, dy = (player.y + player.h / 2) - c.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 100) { c.x += dx * 0.2; c.y += dy * 0.2; }
    if (dist < 26 && !c.taken) {
      c.taken = true; score += 50; totalCoins++; coinsCollected++;
      Sound.coin();
      spawnParticles(c.x, c.y, '#ffd700', 6);
      spawnPopup(c.x, c.y - 8, '+50', '#ffd700');
    }
    if (c.taken || c.life <= 0) looseCoins.splice(i, 1);
  }
}

// ---------- Golden chest / piñata ----------
function updateChests() {
  for (const ch of (level.chests || [])) {
    if (ch.shake > 0) ch.shake--;
    if (ch.burst) continue;
    if (aabb(player, ch)) {
      const stomping = player.vy > 0 && (player.y + player.h - ch.y) < 22;
      if (stomping) {
        ch.hits++;
        ch.shake = 12;
        player.vy = JUMP_VELOCITY * 0.7; player.jumps = 1;
        Sound.stomp();
        spawnParticles(ch.x + ch.w / 2, ch.y, '#d2a04a', 8);
        if (ch.hits >= 3) {
          ch.burst = true;
          spawnLooseCoins(ch.x + ch.w / 2, ch.y + 4, 10);
          score += 100;
          Sound.powerup();
          spawnPopup(ch.x + ch.w / 2, ch.y - 14, 'JACKPOT!', '#ffd54f');
          spawnParticles(ch.x + ch.w / 2, ch.y, '#ffd700', 18);
        } else {
          spawnPopup(ch.x + ch.w / 2, ch.y - 10, String(3 - ch.hits) + ' more', '#ffe082');
        }
      }
    }
  }
}

// ---------- Rare forest fruit ----------
function updateFruit() {
  if (fruit) {
    fruit.phase += 0.1; fruit.life--;
    const dx = (player.x + player.w / 2) - fruit.x, dy = (player.y + player.h / 2) - fruit.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 30) {
      score += 300; totalCoins += 3; coinsCollected += 3;
      Sound.oneup();
      spawnParticles(fruit.x, fruit.y, '#ff5e7a', 18);
      spawnPopup(fruit.x, fruit.y - 14, 'FRUIT +300', '#ff8aa0');
      fruit = null;
      fruitTimer = (12 + Math.random() * 8) * 60;
    } else if (fruit.life <= 0) {
      fruit = null;
      fruitTimer = (12 + Math.random() * 8) * 60;
    }
    return;
  }
  fruitTimer--;
  if (fruitTimer <= 0) {
    const fx = Math.max(60, Math.min(level.width - 60, camera.x + 200 + Math.random() * (W - 400)));
    const fy = 180 + Math.random() * 180;
    fruit = { x: fx, y: fy, life: 9 * 60, taken: false, phase: 0 };
  }
}

// ---------- Golden enemy ----------
function updateGolden() {
  // tick down active golden marks
  for (const e of level.enemies) {
    if (e.golden && !e.dead) {
      e.goldenTimer--;
      if (e.goldenTimer <= 0) e.golden = false;
    }
  }
  goldenTimer--;
  if (goldenTimer <= 0) {
    const candidates = level.enemies.filter(e => !e.dead && !e.gone && !e.golden);
    if (candidates.length) {
      const e = candidates[(Math.random() * candidates.length) | 0];
      e.golden = true; e.goldenTimer = 9 * 60;
      spawnPopup(e.x + e.w / 2, e.y - 12, 'GOLDEN!', '#ffd54f');
    }
    goldenTimer = (9 + Math.random() * 7) * 60;
  }
}

// ---------- Secret bonus room ----------
function buildSecretRoom() {
  const width = 1400;
  const coins = [];
  for (let i = 0; i < 22; i++) coins.push({ x: 180 + i * 52, y: 300 - Math.sin(i * 0.5) * 90, taken: false });
  for (let i = 0; i < 10; i++) coins.push({ x: 320 + i * 90, y: 200, taken: false });
  return {
    name: 'BONUS', bg: '#3a2a5e', arena: false, time: 0, width,
    spawn: { x: 60, y: 360 },
    platforms: [{ x: 0, y: 440, w: width, h: 160 }],
    movers: [], coins, enemies: [], spikes: [], powerups: [],
    checkpoints: [], waterfalls: [],
    flag: null, boss: null, chests: [],
    exitPortal: { x: width - 110, y: 360, w: 44, h: 80 },
  };
}
function enterSecret() {
  if (secret) return;
  const ret = { levelIndex, x: player.x, y: player.y };
  secret = { active: true, timer: 14 * 60, ret, room: buildSecretRoom() };
  level = secret.room;
  player.x = level.spawn.x; player.y = level.spawn.y;
  player.vx = 0; player.vy = 0; player.jumps = 0; player.ridingMover = null;
  camera.x = 0; camera.y = 0;
  if (!isMuted()) Music.setMode('bonus');
  Sound.powerup();
  spawnPopup(player.x, player.y - 30, 'SECRET!', '#b388ff');
}
function exitSecret() {
  if (!secret) return;
  const ret = secret.ret;
  secret = null;
  level = levels[ret.levelIndex];
  player.x = ret.x; player.y = ret.y;
  player.vx = 0; player.vy = 0; player.jumps = 0; player.ridingMover = null;
  if (level.portal) level.portal.used = true;
  if (!isMuted()) Music.setMode('normal');
  Sound.checkpoint();
}
function updatePortal() {
  if (secret) {
    secret.timer--;
    const ex = level.exitPortal;
    if (secret.timer <= 0 || (ex && aabb(player, ex))) exitSecret();
    return;
  }
  const p = level.portal;
  if (p && !p.used && aabb(player, { x: p.x, y: p.y, w: 44, h: 80 })) enterSecret();
}

function updateSpikes() {
  for (const s of level.spikes) {
    if (player.invuln <= 0 && player.starTimer <= 0 && aabb(player, s)) { killPlayer(); break; }
  }
}

function updateFlag() {
  if (!level.flag) return;
  if (aabb(player, level.flag)) {
    score += Math.max(0, timeLeft) * 5 + 500;
    Sound.levelup();
    Music.stop();
    gameState = STATE.LEVELCOMPLETE;
    saveHigh();
  }
}

function updatePlayerAnim() {
  let st = 'idle';
  if (!player.onGround) st = 'jump';
  else if (Math.abs(player.vx) > 0.5) st = 'run';
  player.state = st;
  player.animTimer++;
  const speed = st === 'run' ? 5 : 12;
  if (player.animTimer >= speed) { player.animTimer = 0; player.animFrame = (player.animFrame + 1) % 4; }
}

function updateCamera() {
  const targetX = player.x + player.w / 2 - W / 2;
  const targetY = player.y + player.h / 2 - H / 2 - 40;
  camera.x += (targetX - camera.x) * 0.09;
  camera.y += (targetY - camera.y) * 0.09;
  camera.x = Math.max(0, Math.min(level.width - W, camera.x));
  camera.y = Math.max(-120, Math.min(80, camera.y));
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }
}
function updatePopups() {
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.y += p.vy; p.life--;
    if (p.life <= 0) popups.splice(i, 1);
  }
}

// ============================================================
//  RENDER
// ============================================================
function render() {
  updateNetUI();
  ctx.save();
  let sx = 0, sy = 0;
  if (shake > 0.5) { sx = (Math.random() - 0.5) * shake; sy = (Math.random() - 0.5) * shake; }
  ctx.translate(sx, sy);

  if (gameState === STATE.MENU) { drawMenu(); ctx.restore(); return; }
  if (gameState === STATE.CHARSELECT) { drawCharSelect(); ctx.restore(); return; }
  if (gameState === STATE.LEVELSELECT) { drawLevelSelect(); ctx.restore(); return; }
  if (gameState === STATE.WIN) { drawWin(); ctx.restore(); return; }

  drawBackground();

  ctx.save();
  ctx.translate(-Math.round(camera.x), -Math.round(camera.y));
  drawWaterfalls();
  drawPortal();
  drawPlatforms();
  drawChests();
  drawMovers();
  drawSpikes();
  drawCheckpoints();
  drawCoins();
  drawLooseCoins();
  drawPowerups();
  drawFruit();
  drawBonus();
  drawFlag();
  drawEnemies();
  drawProjectiles();
  if (level.boss) drawBoss();
  drawParticles();
  if (!player.dead || player.deathTimer > 0) drawPlayer();
  drawPopups();
  ctx.restore();

  drawHUD();
  drawLeaderboardPanel(W - 216, 52, 204, 5, 'GOLD RACE');

  if (gameState === STATE.PAUSED) drawPause();
  if (gameState === STATE.GAMEOVER) drawGameOver();
  if (gameState === STATE.LEVELCOMPLETE) drawLevelComplete();

  ctx.restore();
}

// ---------- Background (parallax) ----------
function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, level.bg);
  g.addColorStop(1, level.arena ? '#5a1846' : '#bfe3ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Vertical parallax: anchor background layers to the world so they don't
  // "float" when the player jumps high. camera.y rests at ~80 on the lowest
  // ground (clamp max); measure the rise relative to that neutral baseline.
  const dy = camera.y - 80;

  const m1 = -camera.x * 0.2;
  ctx.fillStyle = level.arena ? '#5e2a52' : '#7d9b76';
  for (let i = -1; i < 9; i++) mountain(m1 + i * 360, 420 - dy * 0.2, 200, 180);

  const m2 = -camera.x * 0.35;
  ctx.fillStyle = level.arena ? '#48203f' : '#5e7d57';
  for (let i = -1; i < 11; i++) mountain(m2 + i * 300 + 120, 440 - dy * 0.35, 150, 140);

  const c1 = -camera.x * 0.15;
  ctx.fillStyle = level.arena ? 'rgba(255,200,240,0.25)' : 'rgba(255,255,255,0.9)';
  for (let i = -1; i < 10; i++) cloud(c1 + i * 340 + 60, 90 + (i % 3) * 40 - dy * 0.15);

  if (!level.arena) {
    const t1 = -camera.x * 0.5;
    const ty = 460 - dy * 0.6;
    for (let i = -1; i < 18; i++) tree(t1 + i * 220 + 40, ty);
  }
}
function mountain(x, baseY, w, h) {
  ctx.beginPath();
  ctx.moveTo(x, baseY); ctx.lineTo(x + w / 2, baseY - h); ctx.lineTo(x + w, baseY);
  ctx.closePath(); ctx.fill();
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.moveTo(x + w / 2 - 22, baseY - h + 30); ctx.lineTo(x + w / 2, baseY - h);
  ctx.lineTo(x + w / 2 + 22, baseY - h + 30); ctx.lineTo(x + w / 2 + 10, baseY - h + 24);
  ctx.lineTo(x + w / 2, baseY - h + 34); ctx.lineTo(x + w / 2 - 10, baseY - h + 24);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
function cloud(x, y) {
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.arc(x + 26, y + 6, 28, 0, Math.PI * 2);
  ctx.arc(x + 58, y, 22, 0, Math.PI * 2); ctx.arc(x + 30, y - 12, 24, 0, Math.PI * 2);
  ctx.fill();
}
function tree(x, baseY) {
  ctx.fillStyle = '#6b4226'; ctx.fillRect(x - 6, baseY - 30, 12, 40);
  ctx.fillStyle = '#3c8c3c';
  ctx.beginPath();
  ctx.arc(x, baseY - 46, 28, 0, Math.PI * 2); ctx.arc(x - 20, baseY - 32, 22, 0, Math.PI * 2);
  ctx.arc(x + 20, baseY - 32, 22, 0, Math.PI * 2); ctx.fill();
}

// ---------- Waterfalls (animated, world-space) ----------
function drawWaterfalls() {
  for (const wf of (level.waterfalls || [])) {
    const baseW = 46;
    const x = wf.x, y = wf.y, h = wf.h;
    const cx = x + baseW / 2;
    ctx.save();

    // soft mist halo behind the stream (wide, faint, fades on the sides)
    const halo = ctx.createLinearGradient(x - 14, 0, x + baseW + 14, 0);
    halo.addColorStop(0, 'rgba(190,230,255,0)');
    halo.addColorStop(0.5, 'rgba(200,235,255,0.16)');
    halo.addColorStop(1, 'rgba(190,230,255,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(x - 14, y - 8, baseW + 28, h + 16);

    // body: horizontal slices give a gently wavering width + edge glow + vertical fade
    for (let yy = 0; yy < h; yy += 8) {
      const t = yy / h;
      const wob = Math.sin(yy * 0.05 + waterPhase * 3) * 3;       // width ripple
      const w = baseW + wob + t * 6;                              // widens slightly toward the pool
      const a = 0.40 + t * 0.14;
      const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
      g.addColorStop(0, `rgba(120,195,255,${(a * 0.45).toFixed(3)})`);
      g.addColorStop(0.5, `rgba(214,242,255,${a.toFixed(3)})`);
      g.addColorStop(1, `rgba(120,195,255,${(a * 0.45).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - w / 2, y + yy, w, 9);
    }

    // bright falling streaks at varying speeds / widths / lengths
    for (let i = 0; i < 5; i++) {
      const speed = 26 + i * 9;
      const sw = 3 + (i % 2);
      const sx = x + 7 + i * 8;
      const period = 64 + i * 10;
      const len = 30 + i * 6;
      ctx.fillStyle = `rgba(248,253,255,${(0.55 - i * 0.06).toFixed(3)})`;
      const offset = (waterPhase * speed + i * 33) % period;
      for (let yy = y - period + offset; yy < y + h - 8; yy += period) {
        const top = Math.max(y, yy);
        const bottom = Math.min(y + h - 4, yy + len);
        if (bottom > top) ctx.fillRect(sx, top, sw, bottom - top);
      }
    }

    // top lip where the water spills over
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    roundRect(x + 1, y - 4, baseW - 2, 7, 3); ctx.fill();

    // foam pool at the base
    const baseY = y + h;
    ctx.fillStyle = 'rgba(232,250,255,0.85)';
    for (let i = 0; i < 8; i++) {
      const r = 5 + Math.sin(waterPhase * 2 + i) * 3;
      ctx.beginPath();
      ctx.arc(x - 2 + i * 7, baseY, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // splash droplets bouncing up out of the pool
    ctx.fillStyle = 'rgba(224,247,255,0.75)';
    for (let i = 0; i < 7; i++) {
      const ph = (waterPhase * 2.4 + i * 1.7) % Math.PI;
      const dy = Math.sin(ph) * 18;
      const dx = (i - 3) * 6;
      const s = 2 + (i % 2);
      ctx.fillRect(cx + dx - s / 2, baseY - dy, s, s);
    }
    ctx.restore();
  }
}

// ---------- Platforms ----------
function drawPlatforms() {
  for (const p of level.platforms) drawIsland(p.x, p.y, p.w, p.h);
}
function drawIsland(x, y, w, h) {
  ctx.fillStyle = level.arena ? '#5a3a6a' : '#9c6b3f';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = level.arena ? '#4a2e58' : '#7d5230';
  for (let i = 0; i < w; i += 20)
    for (let j = 12; j < h; j += 18)
      if ((i + j) % 40 === 0) ctx.fillRect(x + i + 4, y + j, 6, 6);
  ctx.fillStyle = level.arena ? '#8e5fae' : '#5fc043';
  ctx.fillRect(x, y, w, 12);
  ctx.fillStyle = level.arena ? '#6e3f8e' : '#3fa024';
  ctx.fillRect(x, y + 12, w, 4);
  ctx.fillStyle = level.arena ? '#8e5fae' : '#5fc043';
  for (let i = 0; i < w; i += 8) {
    const hh = (i / 8 % 2 === 0) ? 5 : 3;
    ctx.fillRect(x + i, y - hh, 6, hh);
  }
}

function drawMovers() {
  for (const m of level.movers) {
    ctx.fillStyle = '#c8772f'; ctx.fillRect(m.x, m.y, m.w, m.h);
    ctx.fillStyle = '#a85f20'; ctx.fillRect(m.x, m.y + m.h - 6, m.w, 6);
    ctx.fillStyle = '#5fc043'; ctx.fillRect(m.x, m.y, m.w, 6);
    ctx.fillStyle = '#ffd27f';
    ctx.fillRect(m.x + 4, m.y + 10, 4, 4); ctx.fillRect(m.x + m.w - 8, m.y + 10, 4, 4);
  }
}

function drawSpikes() {
  for (const s of level.spikes) {
    ctx.fillStyle = '#cfd8dc';
    const n = Math.floor(s.w / 16);
    for (let i = 0; i < n; i++) {
      const bx = s.x + i * 16;
      ctx.beginPath();
      ctx.moveTo(bx, s.y + s.h); ctx.lineTo(bx + 8, s.y); ctx.lineTo(bx + 16, s.y + s.h);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#90a4ae'; ctx.fillRect(s.x, s.y + s.h - 4, s.w, 4);
  }
}

// ---------- Checkpoints ----------
function cpBlob(x, y, rx, ry, rot, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}
function drawCheckpoints() {
  for (const c of (level.checkpoints || [])) {
    const active = c.active;
    const sway = Math.sin(flagWave + c.x * 0.05) * (active ? 3.5 : 1.2);
    const baseX = c.x, baseY = c.y + 14;   // anchor (bottom of the sprout)
    const tipY = c.y - 64;                  // top of the stem
    const tipX = baseX + sway;

    ctx.save();

    // little soil mound + grass tuft so the sprout looks planted
    cpBlob(baseX, baseY, 15, 6, 0, '#6d4c33');
    cpBlob(baseX, baseY + 3, 15, 5, 0, '#553421');
    ctx.strokeStyle = active ? '#6abf3f' : '#7d8a5a';
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (const dx of [-9, -4, 4, 9]) {
      ctx.beginPath();
      ctx.moveTo(baseX + dx, baseY - 2);
      ctx.lineTo(baseX + dx + (dx > 0 ? 3 : -3), baseY - 9);
      ctx.stroke();
    }

    // curved stem swaying in the breeze
    ctx.strokeStyle = active ? '#5aa12f' : '#6b6f55';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY - 4);
    ctx.quadraticCurveTo(baseX + sway * 0.5, (baseY + tipY) / 2, tipX, tipY);
    ctx.stroke();

    if (active) {
      // glowing bloom
      ctx.save();
      ctx.shadowColor = '#aef359'; ctx.shadowBlur = 22;
      // open leaves
      cpBlob(tipX - 9, tipY + 16, 9, 5, -0.5, '#7cd14a');
      cpBlob(tipX + 9, tipY + 12, 9, 5, 0.5, '#6abf3f');
      // flower petals
      for (let k = 0; k < 5; k++) {
        const ang = -Math.PI / 2 + k * (Math.PI * 2 / 5);
        cpBlob(tipX + Math.cos(ang) * 7, tipY + Math.sin(ang) * 7, 6, 4, ang, '#ffe082');
      }
      cpBlob(tipX, tipY, 4.5, 4.5, 0, '#fff3b0');
      ctx.restore();
      // floating pollen sparkles drifting upward
      ctx.fillStyle = '#fff3b0';
      for (let i = 0; i < 4; i++) {
        const t = (flagWave * 0.18 + i * 0.27) % 1;
        const sx = tipX + Math.sin(flagWave + i * 2) * 11;
        const sy = tipY - 6 - t * 24;
        ctx.globalAlpha = 1 - t;
        ctx.beginPath(); ctx.arc(sx, sy, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else {
      // dormant: drooping leaves + a closed bud
      cpBlob(tipX - 7, tipY + 17, 7, 4, 0.7, '#6f7a52');
      cpBlob(tipX + 7, tipY + 13, 7, 4, -0.7, '#6f7a52');
      cpBlob(tipX, tipY + 3, 5, 8, 0, '#7c8a5a');
      cpBlob(tipX, tipY - 2, 3, 4, 0, '#8e9c63');
    }

    ctx.restore();
  }
}

// ---------- Bonus coin rush ----------
function drawBonus() {
  if (!bonus) return;
  if (bonus.phase === 'collect') {
    for (const c of bonus.coins) {
      if (c.taken) continue;
      const bob = Math.sin(c.phase) * 3;
      const rw = 7 + Math.abs(Math.cos(c.phase)) * 7;
      ctx.save();
      ctx.shadowColor = '#ffd54f'; ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffd700';
      ctx.beginPath(); ctx.ellipse(c.x, c.y + bob, rw, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffec80';
      ctx.beginPath(); ctx.ellipse(c.x, c.y + bob, rw * 0.5, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  } else if (bonus.phase === 'flower' && bonus.flower) {
    drawBigFlower(bonus.flower);
  }
}
function drawBigFlower(f) {
  const cx = f.x, cy = f.y + Math.sin(flagWave) * 4;
  const s = 0.45 + f.bloom * 0.55;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.rotate(flagWave * 0.15);
  ctx.shadowColor = '#ff80ab'; ctx.shadowBlur = 24;
  const petals = 8;
  for (let k = 0; k < petals; k++) {
    const ang = k * (Math.PI * 2 / petals);
    ctx.fillStyle = k % 2 ? '#ff80ab' : '#ff9ec4';
    ctx.beginPath();
    ctx.ellipse(Math.cos(ang) * 20, Math.sin(ang) * 20, 13, 8, ang, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffe082';
  ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff3b0';
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#caa400';
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3 + flagWave * 0.15;
    ctx.beginPath(); ctx.arc(Math.cos(a) * 5, Math.sin(a) * 5, 1.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------- Loose coins / chest / fruit / portal ----------
function drawLooseCoins() {
  for (const c of looseCoins) {
    const rw = 6 + Math.abs(Math.cos(c.phase)) * 5;
    ctx.save();
    ctx.shadowColor = '#ffd54f'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.ellipse(c.x, c.y, rw, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffec80';
    ctx.beginPath(); ctx.ellipse(c.x, c.y, rw * 0.5, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
function drawChests() {
  for (const ch of (level.chests || [])) {
    if (ch.burst) continue;
    const ox = ch.shake > 0 ? (Math.random() - 0.5) * 4 : 0;
    const x = ch.x + ox, y = ch.y, w = ch.w, h = ch.h;
    // body
    ctx.fillStyle = '#6d4c33'; ctx.fillRect(x, y + 8, w, h - 8);
    ctx.fillStyle = '#5a3a26'; ctx.fillRect(x, y + h - 6, w, 6);
    // lid
    ctx.fillStyle = '#8a5a36'; ctx.fillRect(x, y, w, 12);
    // gold trim + lock
    ctx.fillStyle = '#ffd54f';
    ctx.fillRect(x, y + 11, w, 3);
    ctx.fillRect(x + w / 2 - 4, y + 6, 8, 12);
    ctx.fillStyle = '#caa400';
    ctx.fillRect(x + w / 2 - 2, y + 10, 4, 4);
    // a couple of vine accents
    ctx.strokeStyle = '#5aa12f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 3, y + 8); ctx.quadraticCurveTo(x - 2, y + 2, x + 6, y - 2); ctx.stroke();
  }
}
function drawFruit() {
  if (!fruit) return;
  if (fruit.life < 60 && (fruit.life >> 2) % 2 === 0) return; // blink before expiring
  const cx = fruit.x, cy = fruit.y + Math.sin(fruit.phase) * 3;
  ctx.save();
  ctx.shadowColor = '#ff5e7a'; ctx.shadowBlur = 16;
  // berry body
  ctx.fillStyle = '#ff4d6d';
  ctx.beginPath(); ctx.arc(cx - 5, cy + 2, 8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 5, cy + 2, 8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy + 7, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff90a8';
  ctx.beginPath(); ctx.arc(cx - 6, cy, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // leaf + stem
  ctx.fillStyle = '#5aa12f';
  ctx.beginPath(); ctx.ellipse(cx + 3, cy - 9, 6, 3, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#6d4c33'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx, cy - 10); ctx.stroke();
}
function drawPortal() {
  // main-level portal (entrance) or the room's exit portal
  const p = secret ? level.exitPortal : (level.portal && !level.portal.used ? level.portal : null);
  if (!p) return;
  const w = p.w || 44, hh = p.h || 80;
  const cx = p.x + w / 2, cy = p.y + hh / 2;
  ctx.save();
  ctx.shadowColor = '#b388ff'; ctx.shadowBlur = 22;
  for (let i = 0; i < 5; i++) {
    const r = (w / 2) * (1 - i * 0.16);
    const a = flagWave * (i % 2 ? -1 : 1) * 0.6;
    ctx.fillStyle = i % 2 ? 'rgba(179,136,255,0.55)' : 'rgba(124,179,66,0.45)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, hh / 2 * (1 - i * 0.16), a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 4; i++) {
    const a = flagWave + i * Math.PI / 2;
    ctx.globalAlpha = 0.5 + Math.sin(flagWave * 2 + i) * 0.3;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 8, cy + Math.sin(a) * 18, 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------- Coins ----------
function drawCoins() {
  coinSpin += 0.1;
  for (const c of level.coins) {
    if (c.taken) continue;
    const wobble = Math.abs(Math.cos(coinSpin + c.x * 0.01));
    const rw = 7 + wobble * 7;
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.ellipse(c.x, c.y, rw, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffec80';
    ctx.beginPath(); ctx.ellipse(c.x, c.y, rw * 0.5, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#caa400'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, rw, 14, 0, 0, Math.PI * 2); ctx.stroke();
  }
}

// ---------- Power-ups ----------
function drawPowerups() {
  for (const p of (level.powerups || [])) {
    if (p.taken) continue;
    const bob = Math.sin(coinSpin + p.x * 0.02) * 4;
    const cx = p.x, cy = p.y + bob;
    if (p.type === 'star') {
      drawStarShape(cx, cy, 15, '#ffd700', '#fff3b0');
    } else if (p.type === 'speed') {
      ctx.fillStyle = '#1e90ff';
      ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx + 6, cy - 8); ctx.lineTo(cx - 4, cy + 1); ctx.lineTo(cx + 2, cy + 1); ctx.lineTo(cx - 6, cy + 9);
      ctx.stroke();
    } else if (p.type === 'life') {
      ctx.fillStyle = '#2ecc71';
      ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px "Courier New", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('1UP', cx, cy + 1);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
  }
}
function drawStarShape(cx, cy, r, fill, stroke) {
  ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + i * Math.PI / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

// ---------- Flag ----------
function drawFlag() {
  flagWave += 0.12;
  if (!level.flag) return;
  const f = level.flag;
  // wooden vine pole
  ctx.fillStyle = '#6d4c33'; ctx.fillRect(f.x, f.y, 6, f.h);
  // glowing seed-of-life orb on top
  ctx.save();
  ctx.shadowColor = '#aef359'; ctx.shadowBlur = 18;
  ctx.fillStyle = '#cddc39';
  ctx.beginPath(); ctx.arc(f.x + 3, f.y, 9, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // waving leaf banner
  ctx.fillStyle = '#43a047';
  ctx.beginPath();
  ctx.moveTo(f.x + 6, f.y + 6);
  for (let i = 0; i <= 40; i++) {
    const yy = f.y + 6 + i;
    const xx = f.x + 6 + 50 + Math.sin(flagWave + i * 0.2) * 6;
    ctx.lineTo(xx, yy);
  }
  ctx.lineTo(f.x + 6, f.y + 46); ctx.closePath(); ctx.fill();
  // leaf vein
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(f.x + 6, f.y + 9); ctx.lineTo(f.x + 50, f.y + 26); ctx.stroke();
  // mossy base
  ctx.fillStyle = '#4f7942'; ctx.fillRect(f.x - 14, f.y + f.h, 34, 10);
}

// ---------- Enemies ----------
function drawEnemies() {
  for (const e of level.enemies) {
    if (e.gone) continue; // defeated and faded out — don't draw
    if (e.dead) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, e.deadTimer / 12)); // fade out at the end
      if (e.type === 'walker') drawMushroomDie(e);
      else if (e.type === 'flyer') drawFlyerDie(e);
      else if (e.type === 'jumper') drawSlimeDie(e);
      else if (e.type === 'shooter') drawBushDie(e);
      else { ctx.fillStyle = '#6d4c33'; ctx.fillRect(e.x, e.y + e.h - 8, e.w, 8); }
      ctx.restore();
      continue;
    }
    ctx.save();
    if (e.golden) {
      // pulsing golden aura + circling sparkles
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 16 + Math.sin(flagWave * 3) * 6;
    }
    if (e.type === 'flyer') drawFlyerSprite(e);
    else if (e.type === 'shooter') drawBush(e);
    else if (e.type === 'jumper') drawSlime(e);
    else drawMushroom(e);
    ctx.restore();
    if (e.golden) {
      ctx.fillStyle = '#fff8c4';
      for (let i = 0; i < 3; i++) {
        const a = flagWave * 2 + i * (Math.PI * 2 / 3);
        ctx.beginPath();
        ctx.arc(e.x + e.w / 2 + Math.cos(a) * (e.w / 2 + 6), e.y + e.h / 2 + Math.sin(a) * (e.h / 2 + 4), 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// Ground-anchored sprite blit (feet rest on the bottom of the collision box)
function blitGround(img, frame, fw, fh, e, dw, dh, flip) {
  const dx = e.x + e.w / 2 - dw / 2;
  const dy = e.y + e.h - dh + 4;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flip) {
    ctx.translate(dx + dw, dy); ctx.scale(-1, 1);
    ctx.drawImage(img, frame * fw, 0, fw, fh, 0, 0, dw, dh);
  } else {
    ctx.drawImage(img, frame * fw, 0, fw, fh, dx, dy, dw, dh);
  }
  ctx.restore();
}
function slimeColorKey() {
  const n = level ? level.name : 1;
  return n <= 2 ? 'green' : n <= 4 ? 'blue' : 'orange';
}
function drawSlime(e) {
  const color = slimeColorKey();
  const key = e.airborne ? 'slime_' + color + '_jump' : 'slime_' + color + '_run';
  if (!Assets.ready(key)) { drawThornSeed(e); return; }
  const frames = e.airborne ? 11 : 6;
  const frame = Math.floor(Date.now() / (e.airborne ? 60 : 80)) % frames;
  blitGround(Assets.images[key], frame, SLIME_FW, SLIME_FH, e, 46, 46, e.dir < 0);
}
function drawSlimeDie(e) {
  const key = 'slime_' + slimeColorKey() + '_die';
  if (!Assets.ready(key) || e.dieStart == null) {
    ctx.fillStyle = '#6d4c33'; ctx.fillRect(e.x, e.y + e.h - 8, e.w, 8); return;
  }
  const frame = Math.min(10, Math.floor((performance.now() - e.dieStart) / 50));
  blitGround(Assets.images[key], frame, SLIME_FW, SLIME_FH, e, 46, 46, e.dir < 0);
}
function drawBush(e) {
  if (!Assets.ready('bushIdle')) { drawSporePod(e); return; }
  const frame = Math.floor(Date.now() / 110) % 8;
  blitGround(Assets.images['bushIdle'], frame, BUSH_FW, BUSH_FH, e, 64, 46, (e.facing || 1) < 0);
}
function drawBushDie(e) {
  if (!Assets.ready('bushDie') || e.dieStart == null) {
    ctx.fillStyle = '#6d4c33'; ctx.fillRect(e.x, e.y + e.h - 8, e.w, 8); return;
  }
  const frame = Math.min(13, Math.floor((performance.now() - e.dieStart) / 45));
  blitGround(Assets.images['bushDie'], frame, BUSH_FW, BUSH_FH, e, 64, 46, (e.facing || 1) < 0);
}

// Centered sprite blit (for airborne enemies); flip faces movement direction
function blitCentered(img, frame, fw, fh, cx, cy, dw, dh, flip) {
  const dx = cx - dw / 2, dy = cy - dh / 2;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flip) {
    ctx.translate(dx + dw, dy); ctx.scale(-1, 1);
    ctx.drawImage(img, frame * fw, 0, fw, fh, 0, 0, dw, dh);
  } else {
    ctx.drawImage(img, frame * fw, 0, fw, fh, dx, dy, dw, dh);
  }
  ctx.restore();
}
function drawFlyerSprite(e) {
  if (!Assets.ready('flyFly')) { drawFirefly(e); return; } // fallback until loaded
  const frame = Math.floor(Date.now() / 90) % 8;
  blitCentered(Assets.images['flyFly'], frame, FLY_FW, FLY_FH, e.x + e.w / 2, e.y + e.h / 2, 48, 48, e.dir > 0);
}
function drawFlyerDie(e) {
  if (!Assets.ready('flyDie') || e.dieStart == null) {
    ctx.fillStyle = '#6d4c33'; ctx.fillRect(e.x, e.y + e.h - 8, e.w, 8); return;
  }
  const frame = Math.min(16, Math.floor((performance.now() - e.dieStart) / 40));
  blitCentered(Assets.images['flyDie'], frame, FLY_FW, FLY_FH, e.x + e.w / 2, e.y + e.h / 2, 48, 48, e.dir > 0);
}

// Mushroom asset helpers --------------------------------------
function blitSprite(img, frame, e, dh) {
  const dw = dh * (MUSH_FW / MUSH_FH);
  const dx = e.x + e.w / 2 - dw / 2;
  const dy = e.y + e.h - dh + 4;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (e.dir < 0) {
    ctx.translate(dx + dw, dy); ctx.scale(-1, 1);
    ctx.drawImage(img, frame * MUSH_FW, 0, MUSH_FW, MUSH_FH, 0, 0, dw, dh);
  } else {
    ctx.drawImage(img, frame * MUSH_FW, 0, MUSH_FW, MUSH_FH, dx, dy, dw, dh);
  }
  ctx.restore();
}
function drawMushroom(e) {
  if (!Assets.ready('mushRun')) { drawRootMonster(e); return; } // fallback until loaded
  const frame = Math.floor(Date.now() / 90) % 8;
  blitSprite(Assets.images['mushRun'], frame, e, 54);
}
function drawMushroomDie(e) {
  if (!Assets.ready('mushDie') || e.dieStart == null) {
    ctx.fillStyle = '#6d4c33'; ctx.fillRect(e.x, e.y + e.h - 8, e.w, 8); return;
  }
  const frame = Math.min(14, Math.floor((performance.now() - e.dieStart) / 45));
  blitSprite(Assets.images['mushDie'], frame, e, 54);
}
// Root monster (walker): a gnarled bark creature with mossy crown + glowing eyes
function drawRootMonster(e) {
  const bob = Math.sin(e.anim || 0) * 2;
  // bark body
  ctx.fillStyle = '#6d4c33';
  ctx.fillRect(e.x + 2, e.y + 12 + bob, e.w - 4, e.h - 14);
  // mossy rounded crown
  ctx.fillStyle = '#4f7942';
  ctx.beginPath(); ctx.ellipse(e.x + e.w / 2, e.y + 13 + bob, e.w / 2, 12, 0, Math.PI, 0); ctx.fill();
  // bark crack
  ctx.fillStyle = '#523924';
  ctx.fillRect(e.x + e.w / 2 - 1, e.y + 16 + bob, 2, e.h - 22);
  // gnarled roots (feet)
  ctx.fillStyle = '#4e3424';
  ctx.fillRect(e.x + 2, e.y + e.h - 5 + bob, 9, 5); ctx.fillRect(e.x + e.w - 11, e.y + e.h - 5 + bob, 9, 5);
  // glowing eyes
  ctx.fillStyle = '#aef359';
  const look = e.dir > 0 ? 2 : 0;
  ctx.fillRect(e.x + 8 + look, e.y + 16 + bob, 4, 4); ctx.fillRect(e.x + e.w - 12 + look, e.y + 16 + bob, 4, 4);
  // brow
  ctx.fillStyle = '#3a2614';
  ctx.fillRect(e.x + 7, e.y + 14 + bob, 6, 2); ctx.fillRect(e.x + e.w - 13, e.y + 14 + bob, 6, 2);
}

// Thorny seed (jumper): spiky bouncing seed
function drawThornSeed(e) {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  const r = e.w / 2 - 2;
  // spikes
  ctx.fillStyle = '#6b4c2f';
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + (e.anim || 0) * 0.4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a - 0.18) * r, cy + Math.sin(a - 0.18) * r);
    ctx.lineTo(cx + Math.cos(a + 0.18) * r, cy + Math.sin(a + 0.18) * r);
    ctx.lineTo(cx + Math.cos(a) * (r + 7), cy + Math.sin(a) * (r + 7));
    ctx.closePath(); ctx.fill();
  }
  // seed body
  ctx.fillStyle = '#8d6e4a';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b08c5e';
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2); ctx.fill();
  // eyes
  ctx.fillStyle = '#000';
  ctx.fillRect(cx - 4, cy - 2, 3, 3); ctx.fillRect(cx + 2, cy - 2, 3, 3);
}

// Firefly (flyer): glowing forest bug
function drawFirefly(e) {
  const flap = Math.sin((e.anim || 0) * 4) * 5;
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  // wings
  ctx.fillStyle = 'rgba(220,255,220,0.55)';
  ctx.beginPath(); ctx.ellipse(cx - 7, cy - 4 + flap * 0.2, 8, 4, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 7, cy - 4 - flap * 0.2, 8, 4, 0.5, 0, Math.PI * 2); ctx.fill();
  // glowing abdomen
  ctx.save();
  ctx.shadowColor = '#fff59d'; ctx.shadowBlur = 16;
  ctx.fillStyle = '#cddc39';
  ctx.beginPath(); ctx.ellipse(cx, cy + 3, 8, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // head
  ctx.fillStyle = '#33691e';
  ctx.beginPath(); ctx.arc(cx, cy - 6, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.fillRect(cx - 2, cy - 7, 2, 2); ctx.fillRect(cx + 1, cy - 7, 2, 2);
  // glowing tail dot
  ctx.fillStyle = '#ffff8d';
  ctx.beginPath(); ctx.arc(cx, cy + 10, 3, 0, Math.PI * 2); ctx.fill();
}

// Spore pod (shooter): a rooted plant that spits spores
function drawSporePod(e) {
  const f = e.facing || 1;
  // pot/base
  ctx.fillStyle = '#5d4037';
  ctx.fillRect(e.x + 4, e.y + e.h - 14, e.w - 8, 14);
  ctx.fillStyle = '#4e342e';
  ctx.fillRect(e.x + 4, e.y + e.h - 5, e.w - 8, 5);
  // bulb
  ctx.fillStyle = '#558b2f';
  ctx.beginPath(); ctx.ellipse(e.x + e.w / 2, e.y + 16, e.w / 2 - 4, 14, 0, 0, Math.PI * 2); ctx.fill();
  // spots
  ctx.fillStyle = '#9ccc65';
  ctx.fillRect(e.x + 10, e.y + 11, 4, 4); ctx.fillRect(e.x + e.w - 16, e.y + 19, 4, 4);
  // mouth opening facing the player
  ctx.fillStyle = '#1b5e20';
  const mx = f > 0 ? e.x + e.w - 7 : e.x + 7;
  ctx.beginPath(); ctx.arc(mx, e.y + 16, 5, 0, Math.PI * 2); ctx.fill();
  // eyes
  ctx.fillStyle = '#000';
  ctx.fillRect(e.x + e.w / 2 - 6, e.y + 9, 3, 3); ctx.fillRect(e.x + e.w / 2 + 3, e.y + 9, 3, 3);
}

// ---------- Projectiles ----------
function drawProjectiles() {
  for (const p of projectiles) {
    ctx.save();
    ctx.shadowColor = '#c5e1a5'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#7cb342';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#dcedc8';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.w / 4, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------- Boss ----------
function drawBoss() {
  const b = level.boss;
  const flash = b.hurtFlash > 0 && Math.floor(b.hurtFlash / 4) % 2 === 0;
  ctx.save();
  // bark body
  ctx.fillStyle = flash ? '#ffffff' : (b.defeated ? '#4e342e' : '#6d4c33');
  ctx.fillRect(b.x, b.y + 14, b.w, b.h - 14);
  // mossy crown
  ctx.fillStyle = flash ? '#dcedc8' : '#4f7942';
  ctx.beginPath(); ctx.ellipse(b.x + b.w / 2, b.y + 18, b.w / 2, 22, 0, Math.PI, 0); ctx.fill();
  // thorny antlers on top
  ctx.fillStyle = '#33691e';
  for (let i = 0; i < 5; i++) {
    const sx = b.x + 8 + i * (b.w - 16) / 4;
    ctx.beginPath();
    ctx.moveTo(sx - 6, b.y + 8); ctx.lineTo(sx, b.y - 6); ctx.lineTo(sx + 6, b.y + 8);
    ctx.closePath(); ctx.fill();
  }
  // glowing eyes
  ctx.fillStyle = '#aef359';
  ctx.fillRect(b.x + 22, b.y + 30, 16, 16); ctx.fillRect(b.x + b.w - 38, b.y + 30, 16, 16);
  ctx.fillStyle = '#1b3a0e';
  const look = b.dir > 0 ? 6 : 0;
  ctx.fillRect(b.x + 24 + look, b.y + 36, 7, 8); ctx.fillRect(b.x + b.w - 36 + look, b.y + 36, 7, 8);
  // bark brows
  ctx.fillStyle = '#3a2614';
  ctx.fillRect(b.x + 20, b.y + 26, 20, 4); ctx.fillRect(b.x + b.w - 40, b.y + 26, 20, 4);
  // root feet
  ctx.fillStyle = '#4e3424';
  ctx.fillRect(b.x + 6, b.y + b.h - 8, 24, 8); ctx.fillRect(b.x + b.w - 30, b.y + b.h - 8, 24, 8);
  ctx.restore();

  // HP bar above boss
  const bw = b.w + 20, bx = b.x - 10, by = b.y - 20;
  ctx.fillStyle = '#000'; ctx.fillRect(bx, by, bw, 8);
  ctx.fillStyle = '#7cb342'; ctx.fillRect(bx + 1, by + 1, (bw - 2) * (b.hp / b.maxHp), 6);
}

// ---------- Player ----------
function drawPlayer() {
  const px = Math.round(player.x), py = Math.round(player.y);
  if (drawPlayerSprite(px, py)) return;
  drawPlayerFallback(px, py);
}

// Leafy sprite character. Returns false (so the fallback runs) until loaded.
function drawPlayerSprite(px, py) {
  const st = player.state;
  const pfx = 'pl' + selectedChar;
  let key = pfx + 'Idle', fcount = PL_IDLE_N, fps = 7;
  if (st === 'run') { key = pfx + 'Run'; fcount = PL_RUN_N; fps = 14; }
  else if (st === 'jump') { key = pfx + 'Jump'; fcount = PL_JUMP_N; fps = 6; }
  if (!Assets.ready(key)) return false;

  let frame;
  if (st === 'jump') frame = player.vy < 0 ? 0 : 1; // rising vs falling
  else frame = Math.floor(Date.now() / (1000 / fps)) % fcount;

  ctx.save();
  if (player.invuln > 0 && player.starTimer <= 0 && Math.floor(player.invuln / 4) % 2 === 0) ctx.globalAlpha = 0.4;
  if (player.starTimer > 0) {
    starHue = (starHue + 18) % 360;
    ctx.shadowColor = `hsl(${starHue},90%,60%)`; ctx.shadowBlur = 16;
  } else if (player.boostTimer > 0) {
    ctx.shadowColor = '#4dd2ff'; ctx.shadowBlur = 10;
  }

  const dh = 58, dw = 58;
  const dx = px + player.w / 2 - dw / 2;
  const dy = py + player.h - dh + 7;
  const img = Assets.images[key];
  ctx.imageSmoothingEnabled = false;
  if (player.facing < 0) {
    ctx.translate(dx + dw, dy); ctx.scale(-1, 1);
    ctx.drawImage(img, frame * PLAYER_FW, 0, PLAYER_FW, PLAYER_FH, 0, 0, dw, dh);
  } else {
    ctx.drawImage(img, frame * PLAYER_FW, 0, PLAYER_FW, PLAYER_FH, dx, dy, dw, dh);
  }
  ctx.restore();
  return true;
}

function drawPlayerFallback(px, py) {
  ctx.save();
  if (player.invuln > 0 && player.starTimer <= 0 && Math.floor(player.invuln / 4) % 2 === 0) ctx.globalAlpha = 0.4;

  const cx = px + player.w / 2;
  ctx.translate(cx, 0); ctx.scale(player.facing, 1); ctx.translate(-cx, 0);

  const x = px, y = py, w = player.w, h = player.h;
  const char = CHARACTERS[selectedChar];

  // star aura
  let bodyColor = char.primary;
  if (player.starTimer > 0) {
    starHue = (starHue + 18) % 360;
    bodyColor = `hsl(${starHue},90%,60%)`;
    ctx.shadowColor = `hsl(${starHue},90%,60%)`;
    ctx.shadowBlur = 14;
  } else if (player.boostTimer > 0) {
    ctx.shadowColor = '#4dd2ff'; ctx.shadowBlur = 8;
  }

  // Side-on profile (faces +x; the whole sprite is flipped for facing left).
  // Running swings legs/arms forward & back so the hero runs where it looks.
  let strideX = 0, liftFront = 0, liftBack = 0, armSwing = 0, bodyY = 0;
  if (player.state === 'run') {
    const p = Math.sin(player.animFrame * Math.PI / 2);
    strideX = p * 5; armSwing = p * 4;
    liftFront = Math.max(0, -p) * 3;
    liftBack = Math.max(0, p) * 3;
  } else if (player.state === 'jump') {
    strideX = 4; armSwing = -3; liftFront = 2;
  } else {
    bodyY = Math.sin(Date.now() * 0.005) * 1.2;
  }

  // legs: back (left) and front (right) stride opposite each other
  ctx.fillStyle = char.overall;
  ctx.fillRect(x + 5 - strideX, y + h - 12 + liftBack, 8, 12);
  ctx.fillRect(x + w - 13 + strideX, y + h - 12 + liftFront, 8, 12);
  ctx.fillStyle = '#5a2d0c';
  ctx.fillRect(x + 4 - strideX, y + h - 4 + liftBack, 11, 4);
  ctx.fillRect(x + w - 15 + strideX, y + h - 4 + liftFront, 11, 4);

  // tunic body + earthy belt
  ctx.fillStyle = bodyColor; ctx.fillRect(x + 3, y + 12 + bodyY, w - 6, 16);
  ctx.fillStyle = char.overall; ctx.fillRect(x + 6, y + 18 + bodyY, w - 12, 12);
  // glowing seed accent toward the front
  ctx.fillStyle = '#d4e157';
  ctx.fillRect(x + w - 12, y + 20 + bodyY, 3, 3);

  // arms swing opposite the legs (back arm behind body, front arm ahead)
  ctx.fillStyle = bodyColor;
  ctx.fillRect(x + 2 - armSwing, y + 14 + bodyY, 5, 10);
  ctx.fillRect(x + w - 7 + armSwing, y + 14 + bodyY, 5, 10);
  ctx.fillStyle = char.skin;
  ctx.fillRect(x + 2 - armSwing, y + 22 + bodyY, 5, 4);
  ctx.fillRect(x + w - 7 + armSwing, y + 22 + bodyY, 5, 4);

  // face (profile, looking toward +x) with a little nose nub on the leading edge
  ctx.fillStyle = char.skin;
  ctx.fillRect(x + 5, y + 4 + bodyY, w - 10, 10);
  ctx.fillRect(x + w - 4, y + 8 + bodyY, 4, 4);
  // eyes toward the front (one prominent, one peeking)
  ctx.fillStyle = '#000';
  ctx.fillRect(x + w - 10, y + 7 + bodyY, 3, 3);
  ctx.fillRect(x + w - 15, y + 7 + bodyY, 2, 3);
  // leaf cap with the tip leaning forward
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.moveTo(x + 2, y + 6 + bodyY);
  ctx.lineTo(x + w - 6, y - 8 + bodyY);
  ctx.lineTo(x + w - 2, y + 6 + bodyY);
  ctx.closePath();
  ctx.fill();
  // curled leaf tip
  ctx.fillRect(x + w - 8, y - 10 + bodyY, 3, 4);
  // leaf vein highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 5, y + 5 + bodyY);
  ctx.lineTo(x + w - 7, y - 6 + bodyY);
  ctx.stroke();

  ctx.restore();
}

// ---------- Particles / Popups ----------
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}
function drawPopups() {
  ctx.textAlign = 'center';
  for (const p of popups) {
    ctx.globalAlpha = Math.max(0, p.life / 60);
    ctx.font = 'bold 18px "Courier New", monospace';
    ctx.fillStyle = '#000'; ctx.fillText(p.text, p.x + 1, p.y + 1);
    ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

// ============================================================
//  HUD & SCREENS
// ============================================================
function drawHUD() {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, 0, W, 46);
  ctx.textBaseline = 'middle';

  // SCORE (left)
  ctx.font = 'bold 20px "Courier New", monospace';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.fillText('SCORE ' + String(score).padStart(6, '0'), 14, 23);

  // HI score (left, smaller, just under-right of score)
  ctx.font = 'bold 12px "Courier New", monospace';
  ctx.fillStyle = '#ffe9a0';
  ctx.fillText('HI ' + String(highScore).padStart(6, '0'), 182, 23);

  // COINS
  ctx.font = 'bold 20px "Courier New", monospace';
  ctx.fillStyle = '#ffd700';
  ctx.beginPath(); ctx.arc(292, 23, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText('x ' + coinsCollected, 308, 23);

  // LIVES (label + hearts)
  ctx.fillStyle = '#fff';
  ctx.fillText('LIVES', 410, 23);
  for (let i = 0; i < lives; i++) drawHeart(500 + i * 22, 23, 8);

  // TIME (center-right)
  ctx.textAlign = 'center';
  ctx.fillStyle = timeLeft < 20 ? '#ff6b6b' : '#fff';
  ctx.fillText('TIME ' + String(timeLeft).padStart(3, '0'), 720, 23);

  // LEVEL (right)
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fff';
  ctx.fillText('LEVEL ' + level.name + '/' + levels.length, W - 14, 23);

  // power-up timers (below the bar, left side)
  let pux = 14;
  if (player.boostTimer > 0) { drawTimerPill(pux, 54, '#4dd2ff', 'SPEED', player.boostTimer / SPEED_DURATION); pux += 96; }
  if (player.starTimer > 0) { drawTimerPill(pux, 54, '#ffd700', 'STAR', player.starTimer / STAR_DURATION); }

  // bonus coin-rush countdown (centered below the bar)
  if (bonus) {
    const frac = Math.max(0, bonus.timer / bonus.max);
    const col = bonus.phase === 'flower' ? '#ff80ab' : '#ffd54f';
    const label = bonus.phase === 'flower'
      ? 'GRAB THE FLOWER!'
      : 'COIN RUSH  ' + bonus.collected + '/' + bonus.target;
    const bw = 240, bx = (W - bw) / 2, by = 52;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(bx, by, bw, 22, 10); ctx.fill();
    ctx.fillStyle = col;
    roundRect(bx + 3, by + 3, (bw - 6) * frac, 16, 7); ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(label, W / 2, by + 11);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, W / 2, by + 11);
  }

  // secret bonus-room countdown
  if (secret) {
    const frac = Math.max(0, secret.timer / (14 * 60));
    const bw = 240, bx = (W - bw) / 2, by = 52;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(bx, by, bw, 22, 10); ctx.fill();
    ctx.fillStyle = '#b388ff';
    roundRect(bx + 3, by + 3, (bw - 6) * frac, 16, 7); ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText('SECRET ROOM - GRAB THE GOLD!', W / 2, by + 11);
    ctx.fillStyle = '#fff';
    ctx.fillText('SECRET ROOM - GRAB THE GOLD!', W / 2, by + 11);
  }

  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}
function drawTimerPill(x, y, color, label, frac) {
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(x, y, 88, 14, 7); ctx.fill();
  ctx.fillStyle = color;
  roundRect(x + 2, y + 2, (88 - 4) * Math.max(0, frac), 10, 5); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px "Courier New", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 44, y + 7);
  ctx.textBaseline = 'middle';
}
function updateNetUI() {
  const bar = document.getElementById('nameBar');
  const dot = document.getElementById('netDot');
  const info = document.getElementById('netInfo');
  const showBar = (gameState === STATE.MENU || gameState === STATE.CHARSELECT || gameState === STATE.LEVELSELECT);
  if (bar) bar.classList.toggle('show', showBar);
  if (dot) { dot.classList.toggle('on', Net.isConnected()); dot.classList.toggle('off', !Net.isConnected()); }
  if (info) info.textContent = Net.isConnected() ? (Net.getCount() + ' online') : 'offline';
}

// Live gold leaderboard panel (used in-game and on menus)
function drawLeaderboardPanel(x, y, w, maxRows, title) {
  const list = Net.getBoard();
  const shown = Math.min(maxRows, Math.max(1, list.length));
  const headerH = 24, rowH = 21;
  const h = headerH + rowH * shown + 8;

  ctx.fillStyle = 'rgba(15,20,12,0.72)';
  roundRect(x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(124,179,66,0.7)'; ctx.lineWidth = 2;
  roundRect(x, y, w, h, 8); ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#cddc39';
  ctx.font = 'bold 13px "Courier New", monospace';
  ctx.fillText(title, x + 10, y + 13);
  ctx.textAlign = 'right';
  ctx.fillStyle = Net.isConnected() ? '#9ccc65' : '#e57373';
  ctx.font = '10px "Courier New", monospace';
  ctx.fillText(Net.isConnected() ? (Net.getCount() + ' online') : 'offline', x + w - 10, y + 13);

  ctx.font = 'bold 13px "Courier New", monospace';
  if (!list.length) {
    ctx.textAlign = 'center'; ctx.fillStyle = '#88996f';
    ctx.fillText('waiting for players...', x + w / 2, y + headerH + rowH / 2);
  } else {
    for (let i = 0; i < shown; i++) {
      const p = list[i];
      const ry = y + headerH + i * rowH + rowH / 2;
      const self = p.id === Net.getSelfId();
      const out = p.status === 'over';
      if (self) {
        ctx.fillStyle = 'rgba(255,245,157,0.14)';
        ctx.fillRect(x + 3, ry - rowH / 2 + 1, w - 6, rowH - 2);
      }
      ctx.save();
      if (out) ctx.globalAlpha = 0.5; // dim eliminated players
      // rank + name
      ctx.textAlign = 'left';
      ctx.font = 'bold 13px "Courier New", monospace';
      ctx.fillStyle = self ? '#fff59d' : '#dcedc8';
      const nm = p.name.length > 8 ? p.name.slice(0, 8) : p.name;
      const label = (i + 1) + '. ' + nm;
      ctx.fillText(label, x + 10, ry);
      // status / lives badge right after the name
      let sx = x + 10 + ctx.measureText(label).width + 6;
      if (p.status === 'win') {
        ctx.fillStyle = '#ffd54f';
        ctx.font = 'bold 10px "Courier New", monospace';
        ctx.fillText('WIN', sx, ry);
      } else if (out) {
        ctx.fillStyle = '#ef5350';
        ctx.font = 'bold 10px "Courier New", monospace';
        ctx.fillText('OUT', sx, ry);
      } else {
        // remaining lives as tiny hearts (respawning = amber, alive = red)
        const hc = Math.max(0, Math.min(3, p.lives));
        const heartCol = p.status === 'dead' ? '#ffca28' : '#ff5d73';
        for (let k = 0; k < hc; k++) drawHeartMini(sx + 4 + k * 10, ry, heartCol);
      }
      // gold coin icon + count (right aligned)
      ctx.textAlign = 'right';
      ctx.font = 'bold 13px "Courier New", monospace';
      ctx.fillStyle = '#ffd54f';
      ctx.fillText(String(p.coins), x + w - 10, ry);
      ctx.beginPath(); ctx.arc(x + w - 14 - ctx.measureText(String(p.coins)).width - 6, ry, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
}

function drawHeartMini(cx, cy, color) {
  const s = 3;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.3);
  ctx.bezierCurveTo(cx, cy - s * 0.5, cx - s, cy - s * 0.5, cx - s, cy + s * 0.1);
  ctx.bezierCurveTo(cx - s, cy + s * 0.6, cx, cy + s * 0.9, cx, cy + s * 1.1);
  ctx.bezierCurveTo(cx, cy + s * 0.9, cx + s, cy + s * 0.6, cx + s, cy + s * 0.1);
  ctx.bezierCurveTo(cx + s, cy - s * 0.5, cx, cy - s * 0.5, cx, cy + s * 0.3);
  ctx.fill();
}

function drawHeart(x, y, s) {
  ctx.fillStyle = '#ff4d6d';
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y - s * 0.5, x - s, y - s * 0.5, x - s, y + s * 0.1);
  ctx.bezierCurveTo(x - s, y + s * 0.6, x, y + s * 0.9, x, y + s * 1.1);
  ctx.bezierCurveTo(x, y + s * 0.9, x + s, y + s * 0.6, x + s, y + s * 0.1);
  ctx.bezierCurveTo(x + s, y - s * 0.5, x, y - s * 0.5, x, y + s * 0.3);
  ctx.fill();
}

function panel(x, y, w, h) {
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  roundRect(x, y, w, h, 12); ctx.fill();
  ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 3;
  roundRect(x, y, w, h, 12); ctx.stroke();
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function makeButton(key, label, x, y, w, h, action, color, disabled) {
  if (!disabled) buttons[key] = { x, y, w, h, action };
  ctx.fillStyle = disabled ? '#555' : (color || '#e63946');
  roundRect(x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = disabled ? '#888' : '#fff'; ctx.lineWidth = 2;
  roundRect(x, y, w, h, 8); ctx.stroke();
  ctx.fillStyle = disabled ? '#999' : '#fff';
  ctx.font = 'bold 22px "Courier New", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
}

function drawMenu() {
  buttons = {};
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#5c94fc'); g.addColorStop(1, '#bfe3ff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  titleBob += 0.02;
  cloud(120 + Math.sin(titleBob) * 10, 110); cloud(720 + Math.cos(titleBob) * 10, 150); cloud(500, 80);
  ctx.fillStyle = '#5fc043'; ctx.fillRect(0, H - 80, W, 80);
  ctx.fillStyle = '#9c6b3f'; ctx.fillRect(0, H - 60, W, 60);
  ctx.fillStyle = '#3fa024';
  ctx.beginPath(); ctx.arc(200, H - 80, 90, Math.PI, 0); ctx.fill();
  ctx.beginPath(); ctx.arc(760, H - 80, 110, Math.PI, 0); ctx.fill();

  const ty = 140 + Math.sin(titleBob * 2) * 6;
  ctx.textAlign = 'center';
  ctx.font = 'bold 72px "Courier New", monospace';
  ctx.fillStyle = '#000'; ctx.fillText('GOLDLEAF', W / 2 + 4, ty + 4);
  ctx.fillStyle = '#ffd700'; ctx.fillText('GOLDLEAF', W / 2, ty);
  ctx.font = 'bold 22px "Courier New", monospace';
  ctx.fillStyle = '#fff'; ctx.fillText('A Forest Spirit Adventure', W / 2, ty + 44);

  drawHeroSprite(W / 2, ty + 116, selectedChar, 64);
  ctx.font = 'bold 13px "Courier New", monospace';
  ctx.fillStyle = '#1a1a2e';
  ctx.fillText('Hero: ' + CHARACTERS[selectedChar].name, W / 2, ty + 132);

  ctx.font = '15px "Courier New", monospace';
  ctx.fillStyle = '#1a1a2e';
  ctx.fillText('Move: Arrows / WASD   Run: Shift   Jump: Space / Up (Double Jump!)   P: Pause   M: Mute', W / 2, H - 176);
  ctx.fillText('Stomp enemies, grab power-ups & coins, reach the flag — beat the boss!', W / 2, H - 156);

  makeButton('start', 'START GAME', W / 2 - 340, H - 116, 215, 52, () => startGame(0), '#2a9d8f');
  makeButton('char', 'CHARACTER', W / 2 - 107, H - 116, 215, 52, () => { gameState = STATE.CHARSELECT; }, '#e67e22');
  makeButton('select', 'LEVEL SELECT', W / 2 + 126, H - 116, 215, 52, () => { gameState = STATE.LEVELSELECT; }, '#457b9d');

  // live multiplayer leaderboard preview
  drawLeaderboardPanel(W - 250, 150, 232, 5, 'GOLD RACE');
  ctx.textAlign = 'left';
}
// New: blit the Leafy sprite (per-character tint) centered at cx with feet at feetY.
// Falls back to the procedural hero drawing until the sheet has loaded.
function drawHeroSprite(cx, feetY, idx, size) {
  const key = 'pl' + idx + 'Idle';
  if (!Assets.ready(key)) {
    drawMenuHero(cx - size / 2 + (size - 28) / 2, feetY - size + 8, CHARACTERS[idx]);
    return;
  }
  const frame = Math.floor(Date.now() / 140) % PL_IDLE_N;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(Assets.images[key], frame * PLAYER_FW, 0, PLAYER_FW, PLAYER_FH,
    Math.round(cx - size / 2), Math.round(feetY - size), size, size);
  ctx.restore();
}

function drawMenuHero(x, y, char) {
  char = char || CHARACTERS[0];
  // legs + tunic
  ctx.fillStyle = char.overall; ctx.fillRect(x + 4, y + 28, 8, 12); ctx.fillRect(x + 16, y + 28, 8, 12);
  ctx.fillStyle = char.primary; ctx.fillRect(x + 3, y + 12, 22, 16);
  ctx.fillStyle = char.overall; ctx.fillRect(x + 6, y + 18, 16, 12);
  // face
  ctx.fillStyle = char.skin; ctx.fillRect(x + 5, y + 4, 18, 10);
  // eyes
  ctx.fillStyle = '#000'; ctx.fillRect(x + 9, y + 7, 2, 3); ctx.fillRect(x + 17, y + 7, 2, 3);
  // leaf cap
  ctx.fillStyle = char.primary;
  ctx.beginPath();
  ctx.moveTo(x + 3, y + 6); ctx.lineTo(x + 14, y - 7); ctx.lineTo(x + 25, y + 6); ctx.closePath();
  ctx.fill();
  ctx.fillRect(x + 13, y - 9, 3, 4);
}

function drawCharSelect() {
  buttons = {};
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2c3e50'); g.addColorStop(1, '#4a6278');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 46px "Courier New", monospace';
  ctx.fillText('CHOOSE YOUR HERO', W / 2, 84);

  const cols = 3, cellW = 200, cellH = 150, gapX = 36, gapY = 30;
  const totalW = cols * cellW + (cols - 1) * gapX;
  const startX = (W - totalW) / 2;
  const startY = 120;
  for (let i = 0; i < CHARACTERS.length; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const x = startX + c * (cellW + gapX);
    const y = startY + r * (cellH + gapY);
    const isSel = i === selectedChar;
    buttons['ch' + i] = { x, y, w: cellW, h: cellH, action: () => { selectedChar = i; localStorage.setItem(STORAGE_CHAR, i); Sound.coin(); } };
    ctx.fillStyle = isSel ? 'rgba(46,157,143,0.9)' : 'rgba(0,0,0,0.4)';
    roundRect(x, y, cellW, cellH, 12); ctx.fill();
    ctx.strokeStyle = isSel ? '#ffd700' : '#888'; ctx.lineWidth = isSel ? 4 : 2;
    roundRect(x, y, cellW, cellH, 12); ctx.stroke();
    // big hero preview (Leafy sprite, per-character tint)
    drawHeroSprite(x + cellW / 2, y + cellH - 34, i, 92);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(CHARACTERS[i].name, x + cellW / 2, y + cellH - 16);
    if (isSel) {
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 13px "Courier New", monospace';
      ctx.fillText('SELECTED', x + cellW / 2, y + 18);
    }
  }
  makeButton('charback', 'BACK', W / 2 - 90, H - 64, 180, 46, () => { gameState = STATE.MENU; }, '#e63946');
  ctx.textAlign = 'left';
}

function drawLevelSelect() {
  buttons = {};
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#34495e'); g.addColorStop(1, '#5d6d7e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 48px "Courier New", monospace';
  ctx.fillText('SELECT LEVEL', W / 2, 90);
  ctx.fillStyle = '#fff';
  ctx.font = '16px "Courier New", monospace';
  ctx.fillText('Highest unlocked: Level ' + (progress + 1), W / 2, 124);

  const cols = 3, cellW = 200, cellH = 120, gapX = 40, gapY = 40;
  const totalW = cols * cellW + (cols - 1) * gapX;
  const startX = (W - totalW) / 2;
  const startY = 160;
  for (let i = 0; i < levels.length; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const x = startX + c * (cellW + gapX);
    const y = startY + r * (cellH + gapY);
    const locked = i > progress;
    const isBoss = i === levels.length - 1;
    if (!locked) buttons['lvl' + i] = { x, y, w: cellW, h: cellH, action: () => startGame(i) };
    ctx.fillStyle = locked ? 'rgba(0,0,0,0.45)' : (isBoss ? '#7a1f3d' : 'rgba(42,157,143,0.85)');
    roundRect(x, y, cellW, cellH, 12); ctx.fill();
    ctx.strokeStyle = locked ? '#777' : '#fff'; ctx.lineWidth = 3;
    roundRect(x, y, cellW, cellH, 12); ctx.stroke();
    ctx.fillStyle = locked ? '#999' : '#fff';
    ctx.font = 'bold 30px "Courier New", monospace';
    ctx.fillText(isBoss ? 'BOSS' : ('LEVEL ' + (i + 1)), x + cellW / 2, y + 50);
    ctx.font = '16px "Courier New", monospace';
    ctx.fillText(locked ? 'LOCKED' : 'PLAY', x + cellW / 2, y + 86);
  }
  makeButton('back', 'BACK', W / 2 - 90, H - 70, 180, 46, () => { gameState = STATE.MENU; }, '#e63946');
  ctx.textAlign = 'left';
}

function drawPause() {
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
  panel(W / 2 - 180, H / 2 - 130, 360, 260);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 44px "Courier New", monospace';
  ctx.fillText('PAUSED', W / 2, H / 2 - 70);
  buttons = {};
  makeButton('resume', 'RESUME', W / 2 - 110, H / 2 - 30, 220, 46, togglePause, '#2a9d8f');
  makeButton('quit', 'MAIN MENU', W / 2 - 110, H / 2 + 30, 220, 46, () => { gameState = STATE.MENU; Music.stop(); }, '#e63946');
  ctx.textAlign = 'left';
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, W, H);
  panel(W / 2 - 200, H / 2 - 150, 400, 300);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff4d6d';
  ctx.font = 'bold 52px "Courier New", monospace';
  ctx.fillText('GAME OVER', W / 2, H / 2 - 80);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px "Courier New", monospace';
  ctx.fillText('Score: ' + score, W / 2, H / 2 - 30);
  ctx.fillStyle = '#ffe9a0';
  ctx.font = '18px "Courier New", monospace';
  ctx.fillText('High Score: ' + highScore, W / 2, H / 2);
  buttons = {};
  makeButton('restart', 'PLAY AGAIN', W / 2 - 110, H / 2 + 30, 220, 48, () => startGame(0), '#2a9d8f');
  makeButton('menu2', 'MAIN MENU', W / 2 - 110, H / 2 + 90, 220, 44, () => { gameState = STATE.MENU; }, '#457b9d');
  ctx.textAlign = 'left';
}

function drawLevelComplete() {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
  panel(W / 2 - 210, H / 2 - 150, 420, 300);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 40px "Courier New", monospace';
  ctx.fillText('LEVEL ' + level.name + ' CLEAR!', W / 2, H / 2 - 90);
  ctx.fillStyle = '#fff';
  ctx.font = '20px "Courier New", monospace';
  ctx.fillText('Coins: ' + coinsCollected, W / 2, H / 2 - 40);
  ctx.fillText('Time Bonus: ' + (timeLeft * 5), W / 2, H / 2 - 12);
  ctx.fillStyle = '#a8ffb0';
  ctx.font = 'bold 26px "Courier New", monospace';
  ctx.fillText('Score: ' + score, W / 2, H / 2 + 24);
  buttons = {};
  const isLast = levelIndex >= levels.length - 1;
  makeButton('next', isLast ? 'FINISH' : 'NEXT LEVEL', W / 2 - 110, H / 2 + 50, 220, 48, nextLevel, '#2a9d8f');
  ctx.textAlign = 'left';
}

function drawWin() {
  winSpin += 0.05;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2a0845'); g.addColorStop(1, '#6441a5');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 60; i++) {
    const x = (i * 97 + Math.sin(winSpin + i) * 30) % W;
    const y = ((i * 53 + winSpin * 60) % H);
    ctx.fillStyle = ['#ffd700', '#ff4d6d', '#2a9d8f', '#fff', '#5c94fc'][i % 5];
    ctx.fillRect(x, y, 6, 6);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000';
  ctx.font = 'bold 64px "Courier New", monospace';
  ctx.fillText('YOU WIN!', W / 2 + 4, H / 2 - 60 + 4);
  ctx.fillStyle = '#ffd700'; ctx.fillText('YOU WIN!', W / 2, H / 2 - 60);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px "Courier New", monospace';
  ctx.fillText('Final Score: ' + score, W / 2, H / 2);
  ctx.fillStyle = '#ffe9a0';
  ctx.font = '20px "Courier New", monospace';
  ctx.fillText('High Score: ' + highScore, W / 2, H / 2 + 36);
  buttons = {};
  makeButton('winmenu', 'MAIN MENU', W / 2 - 110, H / 2 + 70, 220, 50, () => { gameState = STATE.MENU; }, '#2a9d8f');
  ctx.textAlign = 'left';
}

// ============================================================
//  MAIN LOOP (fixed timestep ~60fps)
// ============================================================
let lastTime = performance.now();
let acc = 0;
const STEP = 1000 / 60;

function loop(now) {
  acc += now - lastTime;
  lastTime = now;
  if (acc > 200) acc = 200;
  let steps = 0;
  while (acc >= STEP && steps < 5) { update(); acc -= STEP; steps++; }
  waterPhase += 0.05;
  render();
  requestAnimationFrame(loop);
}
