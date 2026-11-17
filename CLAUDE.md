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
- **Run `node --check` after any edit**: syntax-check every changed server/test file before saying you are done.
- **If an edit fails twice, rewrite the whole file in one go**: do not retry a failing Edit; replace the entire file with Write instead.
- **network.js keeps ONE callback per event**: `onRoomJoined`, `onRoomError`, `onRoomLeft`, etc. are single slots, so never register a second handler for the same event — extend the existing one instead. After editing client files, check that every function that is called or registered is defined exactly once with the exact spelling, and that it is defined before first use or is a hoisted function declaration.
- **No Background Servers**: Never start, restart, or leave running any dev server (`npm run dev`), `npm start`, or `npm run server` in the background. The user runs servers in their own terminal. If a restart is needed, tell the user. Stop any background server processes immediately.
- **Server Syntax Check**: After ANY edit to a server file, run `node --check server/index.js` before saying you are done.
- **Language & Replies**: Always reply in English only, even after /clear. Keep replies short. Never start servers.

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

### ✅ Milestone 5: Rooms with Join Codes, Lobby Screen, Leave Room
- Rooms on the server: `createRoom` (optional 4-char code), `joinRoom`, `roomJoined`, `roomError`, `leaveRoom`/`roomLeft`. Max 8 players per room, room-scoped broadcasts (`io.to(code)`), `playerLeft` on leave, room deleted when empty.
- Client no longer auto-joins a room. On connect it sits in the lobby until the player picks.
- Lobby screen (full-screen overlay, solid black, z-index 100): game title, CREATE ROOM button, 4-char room-code input (auto-uppercase, max 4) + JOIN button, error line, "Connecting..." status. Buttons disabled until the socket connects.
- Screen state machine in `src/main.js`: `setScreen(state)` with exactly three states — `lobby` (lobby visible, HUD hidden), `ready` (in a room, pointer not locked: "Click to Play" overlay + LEAVE ROOM button + "Press Esc to release the mouse" visible), `playing` (pointer locked: all overlays hidden). One source of truth; `pointerlockchange` is the only trigger for ready/playing.
- Pointer lock may be requested ONLY on the "ready" screen from the "Click to Play" overlay itself (never from the lobby, code input, CREATE ROOM, JOIN or LEAVE ROOM). Gaining pointer lock while in the lobby is refused with `document.exitPointerLock()`.
- LEAVE ROOM resets locally synchronously (clear other players, clear tracers/flash/sparks, hide scoreboard/death screen, health 100, ammo 30/30, stats 0, exit pointer lock, back to lobby) and still emits `leaveRoom`; the server reply runs the same reset.
- `src/network.js` tracks `roomCode` and ignores stale events (playersList, playerJoined, playerMoved, playerLeft, shotFired, playerHit, playerDied, playerRespawned, scoreboardUpdate) when not in a room; `startLeaving()` resets state locally before the reply.
- Room code shown in the HUD top-center as "ROOM: ABCD".
- **Run**: `npm start` → http://localhost:5173
- **Test rooms**: `node test/rooms-test.js` (6/6) — two clients same room, different rooms, wrong code, room full, empty room deleted, leave room.
- **Test combat**: `node test/pvp-test.js` — spawns the REAL server (`node server/index.js`) on port 3100, connects A (createRoom "PVPT") + B (joinRoom "PVPT"), and checks body shots at 3/10/30/60m, headshot, kill/respawn, away shot, ground shot, platform shot.

**Invite link:** opening `/?room=ABCD` fills the lobby code box with the 4-character code (validated, auto-uppercase) and shows "Invite link: press JOIN to enter room XXXX" — joining still needs a user click. Once in a room, the Click to Play screen shows the room code, the full invite link (`<origin>/?room=<code>`) in a selectable text box, and a COPY INVITE LINK button (stopPropagation so it never starts pointer lock; copies with `navigator.clipboard.writeText`, falling back to selecting the text box + `execCommand('copy')`, and shows "Copied!" for 2s). After a successful join, `?room=` is stripped from the address bar with `history.replaceState` so a reload is clean.

**Key Technical Details:**
- Unified height convention (defined in `src/constants.js`): `PLAYER_EYE_HEIGHT = 1.6`, `PLAYER_HEIGHT = 1.8`
- Server stores player FEET position (y=0 at ground); client sends eye position; conversion happens in `playerUpdate` handler
- Visual capsule mesh bottom at feet (y=0), center at y=0.9, head at y=1.7
- Server body capsule: feetY to feetY+1.8, radius 0.4; head sphere center at feetY+1.7, radius 0.25
- MAX_SHOT_RANGE = 200 (server-only constant)
- Server uses feetY for hit detection; ray origin is camera world position
- All debug code removed; clean logs only: `[SERVER] listening on 3000`, `[SERVER] connected <id>, total players: N`, `[SERVER] disconnected <id>, total players: N`