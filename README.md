# Goldleaf

**Goldleaf** is a complete, forest-spirit themed 2D pixel-art platformer built with
HTML5 Canvas + JavaScript (ES modules), featuring a **live multiplayer gold race leaderboard**.

## Run it

The game ships with a small Node.js server that serves the static files **and** hosts
the real-time leaderboard over WebSocket on the same port.

```bash
npm install      # once, installs the `ws` package
npm start        # starts the server on http://localhost:8080
```

Then open <http://localhost:8080/> in your browser.

- **Play with others on your network (LAN):** have them open `http://<your-LAN-ip>:8080`
  (e.g. `http://192.168.1.20:8080`). Everyone's live gold count shows up in the
  "GOLD RACE" panel in real time.
- **Play over the internet:** deploy `server/server.js` to any Node host
  (Render, Railway, Fly.io, a VPS, etc.). The client connects to whatever origin
  served the page, so no config changes are needed. Set the `PORT` env var if your
  host requires it.

> Single-player still works with any static server (e.g. `python3 -m http.server`),
> but the leaderboard will show "offline" unless the Node server is running.

## Deploy to Fly.io (WebSocket server — full multiplayer)

Fly.io keeps the Node.js server running continuously, which means the live
**Gold Race leaderboard works** over `wss://`.

### 1 — Install the Fly CLI

```bash
brew install flyctl        # macOS
# or: curl -L https://fly.io/install.sh | sh
```

### 2 — Log in & create the app

```bash
fly auth login
fly launch --name goldleaf-server --no-deploy
# accept the defaults; a fly.toml is already present in the repo
```

### 3 — Deploy

```bash
fly deploy
# Fly builds the Dockerfile, pushes the image, and starts the machine.
# You'll see: https://goldleaf-server.fly.dev
```

### 4 — Point the Vercel frontend at the Fly server

Open `index.html` and update the meta tag with your actual Fly app URL:

```html
<meta name="goldleaf-ws" content="wss://goldleaf-server.fly.dev">
```

Then redeploy to Vercel:

```bash
vercel --prod
```

From now on the static game loads from Vercel (fast CDN) and multiplayer
connects to the Fly server (`wss://goldleaf-server.fly.dev`).

### Updating the server

```bash
fly deploy           # rebuild & push; zero-downtime rolling deploy
fly logs             # tail live logs
fly status           # machine health
```

> **Note:** The leaderboard state lives in memory. A server restart clears
> the scoreboard (fine for a demo). `auto_stop_machines = false` in
> `fly.toml` keeps the machine always on so WebSocket state is not lost.

---

## Deploy to Vercel

The whole game (all 6 levels, boss, power-ups, bonus mechanics) runs as a **static site**,
so it deploys to Vercel out of the box:

```bash
npm i -g vercel   # once
vercel            # from the project root, follow the prompts
vercel --prod     # deploy to production
```

Or just import the GitHub repo at <https://vercel.com/new>. `vercel.json` is already
configured to serve the repo root statically (no build step).

**Multiplayer note:** Vercel is serverless and cannot host a long-lived WebSocket
server, so the live "GOLD RACE" leaderboard is automatically **disabled** on a plain
Vercel deploy (the game stays single-player and shows "offline" — no errors). To keep
multiplayer, host `server/server.js` on a Node platform that supports WebSockets
(Render, Railway, Fly.io, a VPS…) and point the client at it by uncommenting the meta
tag in `index.html`:

```html
<meta name="goldleaf-ws" content="wss://your-ws-server.example.com">
```

(or set `window.GOLDLEAF_WS = 'wss://…'` before the game script loads).

## Controls

| Action      | Keys                        |
| ----------- | --------------------------- |
| Move        | Arrow keys / `A` `D`        |
| Jump        | `Space` / `Up` / `W`        |
| Double jump | Press jump again in mid-air |
| Pause       | `P`                         |
| Mute        | `M`                         |
| Mobile      | On-screen D-pad + JUMP      |

## Features

- **Live multiplayer leaderboard** — pick a name, join, and watch everyone's gold
  count update in real time (in-game and on the menu)
- Forest-spirit theme: leaf-capped hero, root monsters, thorny seeds, fireflies,
  spore pods, a treant boss, and calm ambient music
- 6 levels of increasing difficulty + a final **boss fight**
- Enemy types: **walkers, flyers, jumpers, and shooters** (with projectiles)
- Power-ups: **speed boost**, **invincibility star**, and **1UP extra life**
- 6 selectable characters; 3 lives granted per level
- Coins with magnet effect, score popups, particle effects
- Moving platforms, spikes, fall pits, countdown timer
- **In-level checkpoints** that update your respawn point
- **Animated parallax waterfalls**, clouds, mountains, and trees
- **Level-select screen** with unlock progress (saved to `localStorage`)
- Smooth easing camera, screen shake, death/respawn animations
- High score saved to `localStorage`
- Fixed-timestep ~60fps loop, AABB collision system

## Project structure

```
goldleaf/
├── index.html          # markup + canvas + touch controls + name bar
├── package.json        # Node server deps (ws)
├── css/
│   └── style.css       # layout, canvas, touch controls, name bar
├── js/
│   ├── main.js         # entry point (wires canvas to game)
│   ├── config.js       # constants & enums
│   ├── audio.js        # SFX + background music (Web Audio)
│   ├── input.js        # keyboard + touch input
│   ├── levels.js       # level data & generators
│   ├── net.js          # multiplayer client (WebSocket leaderboard)
│   └── game.js         # core: state, update, render, UI, loop
├── server/
│   └── server.js       # static file server + WebSocket leaderboard
└── README.md
```
