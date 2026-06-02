// ============================================================
//  config.js - Global constants and enums
// ============================================================

export const W = 960;   // logical canvas width
export const H = 540;   // logical canvas height

// Physics
export const GRAVITY = 0.65;
export const MOVE_SPEED = 3.6;
export const RUN_SPEED = 5.2;   // hold Shift (or the on-screen RUN toggle) to sprint
export const BOOST_SPEED = 6.4; // speed power-up (fastest, stacks over running)
export const ACCEL = 0.6;
export const FRICTION = 0.78;
export const JUMP_VELOCITY = -12.5;
export const MAX_FALL = 16;
export const TILE = 40;

// Power-up durations (frames @60fps)
export const SPEED_DURATION = 8 * 60;
export const STAR_DURATION = 9 * 60;

// Lives granted at the start of every level
export const LIVES_PER_LEVEL = 3;

// Game states
export const STATE = {
  MENU: 'MENU',
  CHARSELECT: 'CHARSELECT',
  LEVELSELECT: 'LEVELSELECT',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  GAMEOVER: 'GAMEOVER',
  LEVELCOMPLETE: 'LEVELCOMPLETE',
  WIN: 'WIN',
};

// Selectable forest-spirit characters (leaf cloak = primary, bark tunic = overall)
export const CHARACTERS = [
  { name: 'SPROUT', primary: '#4caf50', overall: '#5d4037', skin: '#ffd9a0' },
  { name: 'MAPLE',   primary: '#e53935', overall: '#5d2b1a', skin: '#ffd9a0' },
  { name: 'BLOSSOM', primary: '#ec407a', overall: '#7b1f4b', skin: '#ffe0c0' },
  { name: 'BLOOM',  primary: '#26a69a', overall: '#00695c', skin: '#ffe0c0' },
  { name: 'AMBER',  primary: '#c0894b', overall: '#5d4037', skin: '#ffd9a0' },
  { name: 'DUSK',   primary: '#7e57c2', overall: '#311b92', skin: '#e8d5ff' },
];

export const STORAGE_HIGH = 'pixelquest_highscore';
export const STORAGE_PROGRESS = 'pixelquest_progress'; // highest unlocked level index
export const STORAGE_CHAR = 'pixelquest_character';
