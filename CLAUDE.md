# CLAUDE.md

## Project Overview
Browser-based multiplayer First-Person Shooter (FPS) game.

## Tech Stack
- **Client**: Vite + Three.js
- **Server**: Node.js + Socket.IO

## Guidelines & Development Rules
- **Incremental Development**: Work in small steps, implementing one feature at a time.
- **Testing Instructions**: After completing each feature, provide exact instructions on how to run and test it.
- **Code Architecture**: Keep code simple, clear, and split into small, single-responsibility files.
- **Strict Scope Control**: Do not add unrequested features or extra functionality.
- **Planning**: Before making big structural changes, explain the plan first and wait for confirmation.
- **No Background Servers**: Never start, restart, or leave running any dev server (`npm run dev`), `npm start`, or `npm run server` in the background. The user runs servers in their own terminal. If a restart is needed, tell the user. Stop any background server processes immediately.
- **Server Syntax Check**: After ANY edit to a server file, run `node --check server/index.js` before saying you are done.

## Progress

### ✅ Milestone 1: 3D Arena with First-Person Controls
- Vite + Three.js project setup
- Arena: floor, 4 walls, 5 box obstacles, lighting
- FPS controls: WASD movement, mouse look (pointer lock), Space to jump
- Collision with walls and obstacles
- **Run**: `npm run dev` → http://localhost:5173

### ✅ Milestone 2: Shooting, Targets, Ammo & Reload
- Crosshair + left-click raycast shooting
- Muzzle flash at barrel, bright yellow tracer (90ms), hit spark
- 5 target dummies (capsules) around arena
- Hit → target disappears, respawns after 3s
- HUD: hit counter (top-left), ammo 30/30 (bottom-right), reload indicator + progress bar
- R to reload (1.5s), auto-reload when empty
- **Run**: `npm run dev` → http://localhost:5173

### ✅ Milestone 3: Multiplayer Movement Sync
- Socket.IO server (`server/index.js`) on port 3000, CORS for any localhost
- Client connects on load, gets unique ID + random color
- Sends position/rotation ~20 Hz (throttled)
- Server broadcasts player state to others
- Remote players shown as colored capsules with heads + 4-char ID labels
- Smooth interpolation (lerp position, slerp rotation)
- Player count display (top-right)
- Disconnect handling
- **Run**: `npm start` (runs server + client concurrently) → http://localhost:5173
- **Test 2 players**: Open in two tabs (one incognito)

### ✅ Milestone 4: Player-vs-Player Combat
- Server-authoritative hit detection (capsule raycast)
- 100 health, body shot 25 dmg, headshot 50 dmg
- Death → "YOU DIED" screen + 3s respawn countdown at random spawn
- Other players' shots visible as colored tracers
- HUD: health bar (bottom-left), hit marker, kills/deaths counters
- Scoreboard shown while holding Tab (name, color, kills, deaths)
- Practice target dummies still work locally
- **Run**: `npm start` → http://localhost:5173
- **Test PvP**: Two windows (one incognito), shoot each other, verify health/damage/kills/deaths/scoreboard

**Key Technical Details:**
- Unified height convention (defined in `src/constants.js`): `PLAYER_EYE_HEIGHT = 1.6`, `PLAYER_HEIGHT = 1.8`
- Server stores player FEET position (y=0 at ground); client sends eye position; conversion happens in `playerUpdate` handler
- Visual capsule mesh bottom at feet (y=0), center at y=0.9, head at y=1.7
- Server body capsule: feetY to feetY+1.8, radius 0.4; head sphere center at feetY+1.7, radius 0.25
- MAX_SHOT_RANGE = 200 (server-only constant)
- Server uses feetY for hit detection; ray origin is camera world position
- All debug code removed; clean logs only: `[SERVER] listening on 3000`, `[SERVER] connected <id>, total players: N`, `[SERVER] disconnected <id>, total players: N`