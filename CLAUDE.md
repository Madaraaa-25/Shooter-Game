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

### 🔜 Milestone 4: Player-vs-Player Combat
- Sync shooting over network
- Damage, health, death/respawn
- Kill feed / scoreboard
- (Plan first, then implement)