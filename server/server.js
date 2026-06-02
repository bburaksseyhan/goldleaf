// ============================================================
//  server.js - Static file server + live multiplayer leaderboard
//  One process serves the game AND a WebSocket leaderboard, so the
//  browser can connect to the same origin (deploy-friendly).
// ============================================================
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ---------- Static file server ----------
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(ROOT, urlPath));

  // prevent path traversal outside the project root
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------- Live leaderboard over WebSocket ----------
const wss = new WebSocketServer({ server });
const players = new Map(); // ws -> { id, name, coins, score, level }
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

wss.on('connection', (ws) => {
  const p = { id: nextId++, name: 'Guest', coins: 0, score: 0, level: 1, lives: 3, status: 'playing' };
  players.set(ws, p);
  ws.isAlive = true;

  ws.send(JSON.stringify({ type: 'welcome', id: p.id }));
  broadcastBoard();

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (m.type === 'join') {
      p.name = String(m.name || 'Guest').slice(0, 16) || 'Guest';
    } else if (m.type === 'score') {
      p.coins = Math.max(0, m.coins | 0);
      p.score = Math.max(0, m.score | 0);
      p.level = m.level | 0;
      p.lives = Math.max(0, m.lives | 0);
      const allowed = ['playing', 'dead', 'over', 'win', 'done'];
      p.status = allowed.includes(m.status) ? m.status : 'playing';
    } else if (m.type === 'pong') {
      ws.isAlive = true;
    }
    broadcastBoard();
  });

  ws.on('close', () => { players.delete(ws); broadcastBoard(); });
  ws.on('error', () => { players.delete(ws); });
});

// drop dead connections + keep board fresh
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { players.delete(ws); ws.terminate(); continue; }
    ws.isAlive = false;
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' }));
  }
  broadcastBoard();
}, 5000);

server.listen(PORT, () => {
  console.log(`\n  Goldleaf running:  http://localhost:${PORT}`);
  console.log(`  Multiplayer leaderboard is live (WebSocket on same port).`);
  console.log(`  Others on your network can join via  http://<your-LAN-ip>:${PORT}\n`);
});
