// ============================================================
//  levels.js - Level definitions + helper generators
// ============================================================

function rowCoins(x, y, n, gap = 38) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push({ x: x + i * gap, y, taken: false });
  return arr;
}
function arcCoins(x, y, n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    arr.push({ x: x + i * 40, y: y - Math.sin(t * Math.PI) * 70, taken: false });
  }
  return arr;
}

// Enemy factory helpers (keep call sites short and readable)
const walker  = (x, y, range, speed)        => ({ type: 'walker',  x, y, w: 34, h: 40, range, speed });
const flyer   = (x, y, range, speed, amp)   => ({ type: 'flyer',   x, y, w: 36, h: 28, range, speed, amp });
const jumper  = (x, y, jumpPower, interval, range = 130, speed = 1.2) => ({ type: 'jumper',  x, y, w: 34, h: 36, jumpPower, interval, range, speed });
const shooter = (x, y)                       => ({ type: 'shooter', x, y, w: 36, h: 40, shootInterval: 110 });

export function makeLevels() {
  return [
    // ---------------- LEVEL 1 ----------------
    {
      name: 1, bg: '#5c94fc', time: 120, spawn: { x: 80, y: 380 }, width: 3200,
      platforms: [
        { x: 0, y: 480, w: 640, h: 120 },
        { x: 720, y: 480, w: 400, h: 120 },
        { x: 1200, y: 420, w: 240, h: 180 },
        { x: 1520, y: 480, w: 520, h: 120 },
        { x: 2120, y: 420, w: 160, h: 180 },
        { x: 2360, y: 360, w: 160, h: 240 },
        { x: 2600, y: 480, w: 600, h: 120 },
        { x: 340, y: 340, w: 160, h: 40 },
        { x: 900, y: 330, w: 140, h: 40 },
        { x: 1660, y: 330, w: 140, h: 40 },
      ],
      movers: [{ x: 1080, y: 380, w: 100, h: 24, axis: 'x', range: 120, speed: 1.2 }],
      coins: rowCoins(360, 300, 4).concat(rowCoins(920, 290, 3), rowCoins(1240, 360, 3), rowCoins(1680, 290, 3), rowCoins(2620, 420, 5)),
      enemies: [walker(780, 440, 300, 1.0), walker(1560, 440, 420, 1.2), walker(2640, 440, 480, 1.1), flyer(1300, 250, 220, 1.4, 40)],
      spikes: [{ x: 640, y: 560, w: 80, h: 20 }, { x: 2040, y: 560, w: 80, h: 20 }],
      powerups: [{ x: 470, y: 300, type: 'speed', taken: false }],
      checkpoints: [{ x: 1560, y: 380 }],
      waterfalls: [{ x: 1180, y: 240, h: 180 }],
      flag: { x: 3080, y: 360, w: 40, h: 120 },
      chests: [{ x: 860, y: 400 }],
      portal: { x: 920, y: 250, w: 44, h: 80 },
      boss: null,
    },

    // ---------------- LEVEL 2 ----------------
    {
      name: 2, bg: '#7ec0ee', time: 115, spawn: { x: 60, y: 380 }, width: 3800,
      platforms: [
        { x: 0, y: 480, w: 420, h: 120 },
        { x: 560, y: 440, w: 160, h: 160 },
        { x: 820, y: 400, w: 140, h: 200 },
        { x: 1080, y: 480, w: 300, h: 120 },
        { x: 1700, y: 480, w: 260, h: 120 },
        { x: 2080, y: 420, w: 160, h: 180 },
        { x: 2480, y: 480, w: 300, h: 120 },
        { x: 2900, y: 420, w: 160, h: 180 },
        { x: 3200, y: 480, w: 600, h: 120 },
        { x: 300, y: 330, w: 120, h: 36 },
        { x: 1180, y: 320, w: 140, h: 36 },
        { x: 2520, y: 330, w: 140, h: 36 },
      ],
      movers: [
        { x: 1440, y: 400, w: 110, h: 24, axis: 'x', range: 200, speed: 1.6 },
        { x: 2300, y: 300, w: 110, h: 24, axis: 'y', range: 160, speed: 1.3 },
      ],
      coins: rowCoins(320, 290, 3).concat(rowCoins(1200, 280, 3), rowCoins(2540, 290, 3), arcCoins(1480, 340, 5), rowCoins(3240, 420, 6)),
      enemies: [
        walker(1120, 440, 240, 1.4), walker(1740, 440, 200, 1.3),
        walker(2520, 440, 240, 1.5), walker(3260, 440, 480, 1.4),
        flyer(900, 250, 260, 1.6, 50), shooter(2120, 380),
      ],
      spikes: [
        { x: 420, y: 560, w: 140, h: 20 },
        { x: 1380, y: 560, w: 320, h: 20 },
        { x: 2780, y: 560, w: 120, h: 20 },
      ],
      powerups: [{ x: 360, y: 290, type: 'star', taken: false }, { x: 2560, y: 290, type: 'life', taken: false }],
      checkpoints: [{ x: 1740, y: 380 }, { x: 2900, y: 320 }],
      waterfalls: [{ x: 1000, y: 240, h: 240 }, { x: 3120, y: 280, h: 200 }],
      flag: { x: 3700, y: 360, w: 40, h: 120 },
      chests: [{ x: 1240, y: 400 }, { x: 2580, y: 400 }],
      boss: null,
    },

    // ---------------- LEVEL 3 ----------------
    {
      name: 3, bg: '#9b59b6', time: 110, spawn: { x: 60, y: 380 }, width: 4400,
      platforms: [
        { x: 0, y: 480, w: 360, h: 120 },
        { x: 480, y: 440, w: 120, h: 160 },
        { x: 720, y: 400, w: 120, h: 200 },
        { x: 960, y: 360, w: 120, h: 240 },
        { x: 1320, y: 480, w: 200, h: 120 },
        { x: 1960, y: 480, w: 160, h: 120 },
        { x: 2320, y: 420, w: 120, h: 180 },
        { x: 2560, y: 380, w: 120, h: 220 },
        { x: 3080, y: 480, w: 200, h: 120 },
        { x: 3600, y: 440, w: 120, h: 160 },
        { x: 3840, y: 480, w: 560, h: 120 },
        { x: 1180, y: 300, w: 120, h: 36 },
        { x: 2700, y: 300, w: 120, h: 36 },
        { x: 3300, y: 330, w: 120, h: 36 },
      ],
      movers: [
        { x: 1620, y: 420, w: 100, h: 24, axis: 'x', range: 240, speed: 2.0 },
        { x: 2880, y: 300, w: 100, h: 24, axis: 'y', range: 180, speed: 1.6 },
        { x: 3420, y: 400, w: 100, h: 24, axis: 'x', range: 140, speed: 1.8 },
      ],
      coins: arcCoins(740, 330, 5).concat(rowCoins(1200, 260, 3), rowCoins(2720, 260, 3), arcCoins(1640, 360, 5), rowCoins(3880, 420, 7)),
      enemies: [
        walker(1340, 440, 160, 1.6), walker(1980, 440, 120, 1.6),
        walker(3100, 440, 160, 1.8), walker(3880, 440, 420, 1.7),
        flyer(2000, 250, 300, 1.8, 60), jumper(1400, 440, -13, 90, 90, 0.9), shooter(2580, 340),
      ],
      spikes: [
        { x: 360, y: 560, w: 120, h: 20 },
        { x: 1520, y: 560, w: 440, h: 20 },
        { x: 2120, y: 560, w: 200, h: 20 },
        { x: 3280, y: 560, w: 320, h: 20 },
      ],
      powerups: [{ x: 1240, y: 260, type: 'speed', taken: false }, { x: 2760, y: 260, type: 'star', taken: false }],
      checkpoints: [{ x: 1960, y: 440 }, { x: 3080, y: 440 }],
      waterfalls: [{ x: 900, y: 320, h: 260 }, { x: 3760, y: 300, h: 180 }],
      flag: { x: 4300, y: 360, w: 40, h: 120 },
      chests: [{ x: 3160, y: 400 }],
      portal: { x: 1210, y: 222, w: 44, h: 80 },
      boss: null,
    },

    // ---------------- LEVEL 4 ----------------
    {
      name: 4, bg: '#2c3e6e', time: 105, spawn: { x: 60, y: 380 }, width: 4600,
      platforms: [
        { x: 0, y: 480, w: 420, h: 120 },
        { x: 540, y: 420, w: 140, h: 180 },
        { x: 820, y: 360, w: 140, h: 240 },
        { x: 1100, y: 480, w: 260, h: 120 },
        { x: 1500, y: 420, w: 140, h: 180 },
        { x: 1760, y: 360, w: 140, h: 240 },
        { x: 2040, y: 480, w: 260, h: 120 },
        { x: 2520, y: 440, w: 160, h: 160 },
        { x: 2820, y: 480, w: 240, h: 120 },
        { x: 3300, y: 420, w: 160, h: 180 },
        { x: 3620, y: 480, w: 300, h: 120 },
        { x: 4040, y: 480, w: 560, h: 120 },
        { x: 1180, y: 300, w: 120, h: 36 },
        { x: 2100, y: 300, w: 120, h: 36 },
        { x: 3000, y: 320, w: 120, h: 36 },
      ],
      movers: [
        { x: 1380, y: 360, w: 100, h: 24, axis: 'y', range: 200, speed: 1.7 },
        { x: 2340, y: 420, w: 110, h: 24, axis: 'x', range: 180, speed: 2.0 },
        { x: 3120, y: 380, w: 100, h: 24, axis: 'x', range: 200, speed: 2.2 },
      ],
      coins: arcCoins(560, 350, 5).concat(rowCoins(1140, 420, 4), rowCoins(2080, 250, 3), arcCoins(2540, 380, 5), rowCoins(4080, 420, 7)),
      enemies: [
        walker(1120, 440, 220, 1.8), walker(2060, 440, 220, 1.8),
        walker(3640, 440, 260, 1.9), walker(4080, 440, 480, 1.8),
        flyer(1300, 240, 360, 2.0, 70), flyer(2900, 260, 320, 2.0, 60),
        jumper(2560, 440, -14, 80, 180, 1.6), shooter(820, 320), shooter(3300, 380),
      ],
      spikes: [
        { x: 420, y: 560, w: 120, h: 20 },
        { x: 1360, y: 560, w: 140, h: 20 },
        { x: 1900, y: 560, w: 140, h: 20 },
        { x: 3060, y: 560, w: 240, h: 20 },
        { x: 3920, y: 560, w: 120, h: 20 },
      ],
      powerups: [{ x: 1240, y: 260, type: 'star', taken: false }, { x: 2160, y: 260, type: 'speed', taken: false }, { x: 3060, y: 280, type: 'life', taken: false }],
      checkpoints: [{ x: 2040, y: 440 }, { x: 3620, y: 440 }],
      waterfalls: [{ x: 1000, y: 320, h: 260 }, { x: 2240, y: 320, h: 260 }, { x: 3980, y: 300, h: 200 }],
      flag: { x: 4500, y: 360, w: 40, h: 120 },
      chests: [{ x: 2160, y: 400 }, { x: 3680, y: 400 }],
      boss: null,
    },

    // ---------------- LEVEL 5 ----------------
    {
      name: 5, bg: '#1f2d4d', time: 100, spawn: { x: 60, y: 380 }, width: 5000,
      platforms: [
        { x: 0, y: 480, w: 360, h: 120 },
        { x: 460, y: 430, w: 120, h: 170 },
        { x: 700, y: 380, w: 120, h: 220 },
        { x: 940, y: 330, w: 120, h: 270 },
        { x: 1240, y: 480, w: 200, h: 120 },
        { x: 1720, y: 440, w: 140, h: 160 },
        { x: 1980, y: 380, w: 140, h: 220 },
        { x: 2260, y: 480, w: 220, h: 120 },
        { x: 2700, y: 420, w: 140, h: 180 },
        { x: 3120, y: 480, w: 200, h: 120 },
        { x: 3560, y: 420, w: 140, h: 180 },
        { x: 3840, y: 360, w: 140, h: 240 },
        { x: 4140, y: 480, w: 200, h: 120 },
        { x: 4500, y: 480, w: 500, h: 120 },
        { x: 1320, y: 300, w: 120, h: 36 },
        { x: 2300, y: 300, w: 120, h: 36 },
        { x: 3160, y: 300, w: 120, h: 36 },
      ],
      movers: [
        { x: 1560, y: 380, w: 90, h: 22, axis: 'y', range: 220, speed: 2.0 },
        { x: 2520, y: 380, w: 100, h: 22, axis: 'x', range: 220, speed: 2.4 },
        { x: 3340, y: 380, w: 90, h: 22, axis: 'y', range: 200, speed: 2.2 },
        { x: 4360, y: 400, w: 110, h: 22, axis: 'x', range: 160, speed: 2.2 },
      ],
      coins: arcCoins(480, 360, 6).concat(rowCoins(1280, 420, 4), rowCoins(2320, 250, 3), arcCoins(2700, 380, 5), rowCoins(4540, 420, 7)),
      enemies: [
        walker(1260, 440, 180, 2.0), walker(2280, 440, 200, 2.0),
        walker(4540, 440, 420, 2.0),
        flyer(900, 230, 420, 2.2, 80), flyer(2600, 240, 380, 2.2, 70), flyer(3900, 250, 360, 2.2, 60),
        jumper(2740, 440, -14, 70, 150, 1.4), jumper(3160, 440, -15, 60, 240, 2.1),
        shooter(700, 340), shooter(1980, 340), shooter(3840, 320),
      ],
      spikes: [
        { x: 360, y: 560, w: 100, h: 20 },
        { x: 1060, y: 560, w: 180, h: 20 },
        { x: 1440, y: 560, w: 280, h: 20 },
        { x: 2480, y: 560, w: 220, h: 20 },
        { x: 3320, y: 560, w: 240, h: 20 },
        { x: 3980, y: 560, w: 160, h: 20 },
      ],
      powerups: [{ x: 1380, y: 260, type: 'star', taken: false }, { x: 2360, y: 260, type: 'speed', taken: false }, { x: 3220, y: 260, type: 'life', taken: false }],
      checkpoints: [{ x: 2260, y: 440 }, { x: 3120, y: 440 }, { x: 4140, y: 440 }],
      waterfalls: [{ x: 1140, y: 300, h: 280 }, { x: 2180, y: 320, h: 260 }, { x: 4440, y: 300, h: 200 }],
      flag: { x: 4900, y: 360, w: 40, h: 120 },
      chests: [{ x: 3220, y: 400 }],
      portal: { x: 1350, y: 222, w: 44, h: 80 },
      boss: null,
    },

    // ---------------- LEVEL 6 - BOSS FIGHT ----------------
    {
      name: 6, bg: '#3a0d2e', time: 140, spawn: { x: 60, y: 380 }, width: 2000, arena: true,
      platforms: [
        { x: 0, y: 480, w: 2000, h: 120 },     // arena floor
        { x: 260, y: 360, w: 160, h: 28 },      // side ledges
        { x: 1580, y: 360, w: 160, h: 28 },
        { x: 900, y: 300, w: 200, h: 28 },      // center high ledge
        { x: 0, y: 0, w: 40, h: 480 },          // left wall
        { x: 1960, y: 0, w: 40, h: 480 },       // right wall
      ],
      movers: [
        { x: 560, y: 380, w: 100, h: 22, axis: 'y', range: 120, speed: 1.6 },
        { x: 1340, y: 380, w: 100, h: 22, axis: 'y', range: 120, speed: 1.6 },
      ],
      coins: rowCoins(320, 320, 3).concat(rowCoins(1620, 320, 3), rowCoins(940, 260, 4)),
      enemies: [],
      spikes: [{ x: 700, y: 472, w: 80, h: 18 }, { x: 1220, y: 472, w: 80, h: 18 }],
      powerups: [{ x: 980, y: 260, type: 'star', taken: false }, { x: 100, y: 420, type: 'life', taken: false }],
      checkpoints: [],
      waterfalls: [{ x: 60, y: 40, h: 440 }, { x: 1900, y: 40, h: 440 }],
      flag: null, // appears after boss defeated
      boss: {
        x: 960, y: 360, w: 96, h: 96, hp: 5, maxHp: 5,
        dir: 1, speed: 2.0, vy: 0, onGround: false,
        jumpTimer: 90, shootTimer: 140, hurtFlash: 0, defeated: false, defeatTimer: 0,
      },
    },
  ];
}
