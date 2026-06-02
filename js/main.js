// ============================================================
//  main.js - Entry point. Wires the canvas to the game.
// ============================================================
import { init } from './game.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

init(canvas, ctx);
