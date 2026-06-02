// ============================================================
//  net.js - Client networking for the live multiplayer leaderboard
//  Connects to the same origin that served the page, so it works
//  locally and after deployment without any config.
// ============================================================

let ws = null;
let selfId = null;
let board = [];
let count = 0;
let myName = 'Guest';
let connected = false;
let lastSent = 0;
let reconnectTimer = null;
let lastReport = { coins: 0, score: 0, level: 1, lives: 3, status: 'playing' };

function overrideUrl() {
  // Lets a static deploy (e.g. Vercel) point at a hosted WebSocket server.
  const meta = document.querySelector('meta[name="goldleaf-ws"]');
  return String((window.GOLDLEAF_WS || (meta && meta.content) || '')).trim();
}

function serverUrl() {
  const ov = overrideUrl();
  if (ov) return ov;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}`;
}

function canConnect() {
  // An explicit ws server always wins.
  if (overrideUrl()) return true;
  if (!location.host) return false; // file://
  // Same-origin WS only exists when our own Node server is serving the page
  // (local dev / self-host). On a static host (Vercel) there is no ws server,
  // so stay gracefully offline instead of spamming failed reconnects.
  return location.hostname === 'localhost'
    || location.hostname === '127.0.0.1'
    || location.protocol === 'http:';
}

function open() {
  if (!canConnect()) return;
  try { ws = new WebSocket(serverUrl()); }
  catch (e) { scheduleReconnect(); return; }

  ws.onopen = () => {
    connected = true;
    send({ type: 'join', name: myName });
    // push whatever we last knew so the board is immediately accurate
    send({ type: 'score', ...lastReport });
  };
  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.type === 'welcome') selfId = m.id;
    else if (m.type === 'board') { board = m.board || []; count = m.count || board.length; }
    else if (m.type === 'ping') send({ type: 'pong' });
  };
  ws.onclose = () => { connected = false; scheduleReconnect(); };
  ws.onerror = () => { try { ws.close(); } catch (e) {} };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; open(); }, 2500);
}

function send(obj) {
  if (ws && ws.readyState === 1) {
    try { ws.send(JSON.stringify(obj)); } catch (e) {}
  }
}

export const Net = {
  connect(name) {
    if (name) myName = sanitize(name);
    if (!ws) open();
  },
  setName(name) {
    myName = sanitize(name);
    send({ type: 'join', name: myName });
  },
  report(coins, score, level, lives, status, immediate) {
    const prevStatus = lastReport.status;
    lastReport = {
      coins: coins | 0,
      score: score | 0,
      level: level | 0,
      lives: lives | 0,
      status: status || 'playing',
    };
    const now = performance.now();
    // always push immediately on important transitions (death, game over, win)
    if (!immediate && status === prevStatus && now - lastSent < 400) return; // throttle ~2.5/sec
    lastSent = now;
    send({ type: 'score', ...lastReport });
  },
  getBoard() { return board; },
  getCount() { return count; },
  getSelfId() { return selfId; },
  isConnected() { return connected; },
  getName() { return myName; },
};

function sanitize(name) {
  return String(name || 'Guest').replace(/\s+/g, ' ').trim().slice(0, 16) || 'Guest';
}
