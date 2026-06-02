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
