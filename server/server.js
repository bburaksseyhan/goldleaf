// ============================================================
//  server.js - WebSocket leaderboard server for Goldleaf
// ============================================================
'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;

// Allowed origins: add your Vercel URL here (no trailing slash).
// Empty → accept all (fine for local dev; tighten for production).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

// ---------- Security limits ----------
const MAX_CONNECTIONS = 100;   // hard cap on concurrent players
const MAX_MSG_BYTES   = 512;   // largest message we'll parse
const RATE_LIMIT_MS   = 200;   // min ms between score updates per client
const HEARTBEAT_MS    = 10000; // ping interval

// ---------- HTTP server (health-check only on this deployment) ----------
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Goldleaf WS OK\n');
});

// ---------- WebSocket server ----------
const wss = new WebSocketServer({ server, maxPayload: MAX_MSG_BYTES });
const players = new Map();
let nextId = 1;

function buildBoard() {
  return [...players.values()]
    .map(p => ({ id: p.id, name: p.name, coins: p.coins, score: p.score, level: p.level, lives: p.lives, status: p.status }))
    .sort((a, b) => b.coins - a.coins || b.score - a.score);
}

function broadcastBoard() {
  const msg = JSON.stringify({ type: 'board', board: buildBoard(), count: players.size });
  for (const ws of wss.clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

wss.on('connection', (ws, req) => {
  // --- Origin check (skip if no allowlist configured) ---
  if (ALLOWED_ORIGINS.length > 0) {
    const origin = (req.headers.origin || '').replace(/\/$/, '');
    if (!ALLOWED_ORIGINS.includes(origin)) {
      ws.close(1008, 'Origin not allowed');
      return;
    }
  }

  // --- Connection cap ---
  if (players.size >= MAX_CONNECTIONS) {
    ws.close(1013, 'Server full');
    return;
  }

  const p = { id: nextId++, name: 'Guest', coins: 0, score: 0, level: 1, lives: 3, status: 'playing' };
  players.set(ws, p);
  ws.isAlive = true;
  ws.lastScore = 0;

  ws.send(JSON.stringify({ type: 'welcome', id: p.id }));
  broadcastBoard();

  ws.on('message', (raw) => {
    // Guard: maxPayload already enforced by ws, but double-check string length
    if (raw.length > MAX_MSG_BYTES) return;

    let m;
    try { m = JSON.parse(raw.toString()); } catch (e) { return; }

    if (m.type === 'join') {
      p.name = String(m.name || 'Guest').replace(/[<>"'&]/g, '').slice(0, 16) || 'Guest';

    } else if (m.type === 'score') {
      // Rate-limit score updates
      const now = Date.now();
      if (now - ws.lastScore < RATE_LIMIT_MS) return;
      ws.lastScore = now;

      p.coins  = Math.max(0, Math.min(99999, m.coins | 0));
      p.score  = Math.max(0, Math.min(9999999, m.score | 0));
      p.level  = Math.max(1, Math.min(99, m.level | 0));
      p.lives  = Math.max(0, Math.min(10, m.lives | 0));
      const allowed = ['playing', 'dead', 'over', 'win', 'done'];
      p.status = allowed.includes(m.status) ? m.status : 'playing';

    } else if (m.type === 'pong') {
      ws.isAlive = true;
      return; // no board broadcast needed for pong
    }

    broadcastBoard();
  });

  ws.on('close', () => { players.delete(ws); broadcastBoard(); });
  ws.on('error', () => { try { ws.terminate(); } catch (_) {} players.delete(ws); });
});

// Heartbeat: drop dead connections
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { players.delete(ws); ws.terminate(); continue; }
    ws.isAlive = false;
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' }));
  }
  broadcastBoard();
}, HEARTBEAT_MS);

server.listen(PORT, () => {
  console.log(`\n  Goldleaf WS running on port ${PORT}`);
  console.log(`  Max connections: ${MAX_CONNECTIONS}`);
  if (ALLOWED_ORIGINS.length)
    console.log(`  Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
  else
    console.log(`  Origins: any (set ALLOWED_ORIGINS env var to restrict)`);
});
