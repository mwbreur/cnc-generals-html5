# Command & Conquer: Generals — HTML5 Edition

A work-in-progress, browser-based 3D real-time strategy game inspired by **Command & Conquer: Generals / Zero Hour**. The project uses Three.js, HTML, CSS, JavaScript, the Web Audio API and PeerJS/WebRTC.

**Play Online:** [mwbreur.github.io/cnc-generals-html5](https://mwbreur.github.io/cnc-generals-html5/)  
**Download Offline / LAN Release (No Docker or Git required):** [GitHub Releases](https://github.com/mwbreur/cnc-generals-html5/releases) — download the latest `.zip`, unzip, and double-click `Play_Windows.bat` (Windows) or `Play_Mac_Linux.command` (Mac/Linux).

> **Project status (`0.9.0-beta`):** Playable beta pre-release. All 3 factions (USA, China, GLA), 17 official maps, Skirmish AI, Map Editor, and P2P/LAN multiplayer are working, while balance parity, large-army (200+ unit) pathing/performance, and multiplayer special-power sync are still being actively polished toward `1.0.0`. See `release/README_PLAY.txt` for current known issues.

---

## Contents

- [Overview](#overview)
- [Technology](#technology)
- [Project layout](#project-layout)
- [Build and run](#build-and-run)
- [Build output and large files](#build-output-and-large-files)
- [Controls](#controls)
- [Development guidelines](#development-guidelines)
- [Testing and profiling](#testing-and-profiling)
- [Known limitations and next steps](#known-limitations-and-next-steps)

## Overview

The goal is to build a detailed, playable Generals-style RTS in the browser while retaining the existing Three.js architecture.

Current gameplay systems include:

- Three playable factions: **USA**, **China**, and **GLA**, with Generals' Promotions & Powers, Superweapons (Particle Cannon, Nuclear Missile, SCUD Storm), and faction-specific mechanics (USA Drones & Point Defense Lasers, China Overlord Towers & EMP/Frenzy, GLA Tunnel Networks & Salvage).
- 3D units, buildings, terrain, water, bridges, drifting cloud shadows, Map Editor, and direct browser import of retail `.map` / `.zip` SAGE maps (with `.tga` previews, `map.str` metadata, and automatic spawn-count battlefield sizing).
- Unit selection, lane-offset group movement, Guard mode (with live white radius preview & sector rings), combat, construction, harvesting, fixed-wing aircraft rearming, and upgrades.
- Fog of war, Skirmish AI, A* pathfinding, and collision handling.
- A Generals-style command bar, minimap, options menu, and in-game HUD.
- Procedural Web Audio effects paired with lazy-loaded retail audio catalogs (`src/audio/`).
- Peer-to-peer multiplayer using PeerJS/WebRTC plus built-in zero-dependency LAN WebSocket relay (`npm run lan`).

This is an independent fan project and is not affiliated with or endorsed by Electronic Arts. Command & Conquer and Generals are trademarks of their respective owners. Use only game assets that you have the right to distribute.

## Technology

| Area | Technology |
|---|---|
| 3D rendering | Three.js |
| Game systems | JavaScript |
| Interface | HTML and CSS |
| Procedural sound | Web Audio API |
| Multiplayer transport | PeerJS / WebRTC |
| Build tooling | Node.js (built-in modules) |
| Hosting | GitHub Pages / GitHub Actions |

The build, test, and LAN scripts use only Node.js built-in modules (zero runtime npm dependencies required); `package.json` defines convenient scripts (`npm test`, `npm run build`, `npm run lan`).

## Project layout

The repository is organized around handwritten source modules (`src/js/`), generated data bundles (`src/generated/`), and generated browser builds (`index.html` + `assets/data/`):

```text
.
├── src/
│   ├── css/
│   │   └── style.css
│   ├── html/
│   │   └── body.html
│   ├── audio/
│   │   ├── global.json
│   │   ├── usa.json
│   │   ├── china.json
│   │   └── gla.json
│   ├── vendor/
│   │   ├── three.min.js
│   │   └── peerjs.min.js
│   ├── generated/                     # Extracted static data bundles (externalized to assets/data/)
│   │   ├── 02b_w3d_models.js          # W3D 3D unit/building/prop meshes & textures
│   │   ├── 07b_tournament_desert.js   # Official EA skirmish maps & terrain tiles
│   │   └── 10b_cameos.js              # Official EA cameos & shell UI graphics
│   └── js/                            # Handwritten game modules (loaded in sorted order)
│       ├── 01_core.js                 # Core constants & shared globals
│       ├── 02_textures.js             # Procedural textures & materials
│       ├── 03_units.js                # Unit mesh builders
│       ├── 04_buildings.js            # Building mesh builders
│       ├── 05_audio.js                # Web Audio synth & 3D spatial attenuation
│       ├── 05b_official_audio.js      # Lazy-loaded retail audio catalog player
│       ├── 06_effects.js              # Projectiles, explosions, superweapon FX & tactical rings
│       ├── 07_terrain.js              # Terrain, water, bridges, clouds & map setup
│       ├── 08_collision.js            # Obstacle/unit collision & A* pathfinding
│       ├── 09_fogOfWar.js             # Fog of war, minimap & Skirmish lobby UI
│       ├── 10_editor.js               # Map editor & SAGE .map/.zip importer
│       ├── 11_sidebar.js              # Command bar, unit spawning, hotkeys & Generals' Powers
│       ├── 12_combat.js               # Combat loop, armor matrix & weapon firing
│       ├── 13_ai.js                   # Skirmish AI commander brain
│       ├── 13b_input.js               # Player pointer, selection, blueprints & right-click orders
│       ├── 14_gameLoop.js             # Main simulation, ground movement & render loop
│       ├── 14b_systems.js             # Stealth & detection, Point Defense Lasers & GLA salvage
│       ├── 14c_shellMap.js            # Animated 3D main-menu shell map
│       ├── 14d_aircraft.js            # Unified player & AI aircraft flight, combat & rearming engine
│       └── 15_multiplayer.js          # Host-authoritative WebRTC / LAN multiplayer
├── build.js
├── verify_system.js
├── tools/                             # Linter, audio validators & asset extraction tools
└── scripts/
    ├── e2e_smoke.mjs
    ├── lan_server.mjs
    ├── report-audio-usage.js
    └── report-project-size.js
```

The JavaScript filenames in `src/js/` are numbered to make their concatenation order explicit. `build.js` and `verify_system.js` automatically discover all `.js` files in `src/generated/` and `src/js/` in sorted order.

**Source files are the place to make changes.** The root `index.html` is a generated output; do not edit it by hand.

## Build and run

### Requirements

- Node.js 20 or newer is recommended (the CI workflow uses Node.js 24).
- A modern browser with WebGL support.

### Build

From the repository root:

```bash
node build.js
```

The build script reads the HTML/CSS source and JavaScript modules, validates them, and writes:

- `index.html` — web build for GitHub Pages. It fetches shared audio and the selected faction's catalog from `src/audio/` when a Skirmish starts.

The build script is intentionally simple and does not currently provide a production bundler, code splitting, minification, or asset hashing.

### Run locally / Off-Grid LAN (Single-Player & LAN Multiplayer)

Everything required to play — 3D models, textures, maps, cameos, audio, Three.js, and PeerJS — is bundled locally in the repository (`src/vendor/`). **No internet connection and no `npm install` are required.**

On one host computer (with Node.js 20+ installed):

```bash
git clone https://github.com/mwbreur/cnc-generals-html5.git
cd cnc-generals-html5
npm run lan
```

`npm run lan` uses only Node.js built-in modules and automatically:
1. Builds `index.html` and `assets/data/` if they are not already built.
2. Starts a local HTTP server on port `8080` (override with `--port=3000`) and prints your LAN URL (for example `http://192.168.1.42:8080`).
3. Starts a built-in zero-dependency **LAN WebSocket room relay** (`/lan-ws`) on the same port.

**How players join on a local network:**
- Other players on the same Wi-Fi or Ethernet network just open the printed LAN URL (`http://<host-ip>:8080`) in any modern browser (Chrome, Edge, Firefox) — no software to install on player PCs.
- When the game is served by `npm run lan` (or the Docker container below), multiplayer **automatically detects** the local LAN server (`/api/lan-status`), shows a **1-click Local Network (LAN) Lobby** inside **Multiplayer → Join Match** so players can join open rooms without typing room codes, and routes traffic over your local network with zero internet access. When hosted on GitHub Pages or static hosting, it automatically uses the PeerJS cloud broker instead.

### Run with Docker (LAN Party / NAS / Home Server)

Multi-architecture images (`linux/amd64` and `linux/arm64` for PCs, NAS boxes, and Raspberry Pis) are automatically built and published to **GitHub Container Registry (GHCR)** on every push to `master`.

Run directly from GHCR on any Docker host on your LAN:

```bash
docker run -d --name cnc-generals-lan -p 8181:8080 --restart unless-stopped ghcr.io/mwbreur/cnc-generals-html5:latest
```

Or build and run locally with Docker Compose:

```bash
docker compose up -d
```

Then everyone on your LAN opens `http://<host-ip>:8181` in their browser (override the port with `PORT=8080 docker compose up -d`). Each player runs their own 3D game instance locally in their browser and can see/join open games in the built-in **LAN Lobby**.

> **Note on `http://` vs `https://`:** On a local IP like `http://192.168.1.55:8181`, plain `http://` works cleanly out of the box with the built-in WebSocket LAN relay and avoids self-signed certificate warnings in players' browsers.

### Updating bundled Three.js / PeerJS (when online)

Local vendor files live in `src/vendor/` (`three.min.js` and `peerjs.min.js`). When you have an internet connection and want to refresh or update them:

```bash
npm run update-vendor
# Or pin specific versions:
node tools/update_vendor.js --three=0.128.0 --peerjs=1.5.4
npm run build
```

> **Note:** The renderer targets Three.js `r128` (`0.128.0`) UMD APIs; stick to `0.128.0` unless migrating the renderer.

Alternatively, for single-player development only, you can still serve the built files with any static HTTP server (such as `python -m http.server 8000`) and open [http://localhost:8000](http://localhost:8000). Opening `index.html` directly via `file://` is not supported because browsers block `fetch()` for local `src/audio/*.json` catalogs.

## Build output and large files

The build concatenates handwritten gameplay JavaScript modules from `src/js/` into `index.html` (~2.0 MB), while externalizing heavy generated data bundles from `src/generated/` into `assets/data/` (`02b_w3d_models.js`, `07b_tournament_desert.js`, and `10b_cameos.js`) with content-hashed cache-busting query strings (`?v=...`) so browsers cache models, official maps, and cameos across updates. Audio stays external in `src/audio/` so the game can lazy-load shared effects and the player's faction catalog.

The largest data assets in the repository are:

- `src/generated/02b_w3d_models.js` → `assets/data/02b_w3d_models.js` — W3D model data.
- `src/generated/10b_cameos.js` → `assets/data/10b_cameos.js` — Official EA cameos & shell UI graphics.
- `src/generated/07b_tournament_desert.js` → `assets/data/07b_tournament_desert.js` — Official EA skirmish maps & terrain tiles.
- `src/audio/*.json` — Official-audio catalogs.

The generated `index.html` size is reported by `node scripts/report-project-size.js`. This is an on-disk size, not a compressed transfer size.

### Audio loading

The current catalogs contain **699 clips** (`global`, `usa`, `china`, `gla`): shared effects plus faction-specific voices. The web build requests shared effects and only the player faction's catalog when starting a Skirmish. Campaign and cutscene speech is not part of these catalogs. Enemy battlefield effects remain shared.

The catalog split reorganizes existing clips; it does not establish that every source-game voice or weapon sound has been found. Audio archive completeness and live browser playback still need manual verification.

### Inspect project file sizes

Before changing asset formats or build output, generate a repeatable inventory:

```bash
node scripts/report-project-size.js
```

For machine-readable output:

```bash
node scripts/report-project-size.js --json
```

The report lists the largest repository files, total source size, generated HTML size, and JavaScript source modules at least 1 MB. These are on-disk sizes, not compressed network transfer sizes. Use browser DevTools or a local HTTP server to measure transfer size.

### Inspect audio references

Before extracting or reorganizing audio, inventory the literal sound IDs used by the gameplay code:

```bash
node scripts/report-audio-usage.js
```

For machine-readable output:

```bash
node scripts/report-audio-usage.js --json
```

This is a best-effort static scan. It reports literal calls to the audio functions, dynamic calls that need manual review, and the sizes of audio-related source modules. It does not decode or extract sounds. See [the Skirmish audio catalog notes](src/audio/README.md) for the current groups and known limitations.

### Validate audio changes

```bash
node tools/validate_audio_catalog.js
node tools/test_audio_loader.js
```

These check catalog grouping, lazy loading, faction voice selection, and caching.

## Controls

### Camera & Mouse
- **Arrow keys:** Pan the camera.
- **Mouse wheel:** Zoom the camera (or rotate a building blueprint during placement).
- **Middle mouse drag:** Rotate the camera.
- **Left click / drag:** Select units or buildings, or drag-box select multiple units.
- **Right click:** Issue move, attack, harvest, capture, garrison, or rally-point orders (`Shift` + Right click queues waypoints).
- **Minimap:** Left-click or drag to move the camera; right-click to issue orders.
- **Space / `H`:** Jump camera to your Command Center (`Space` also jumps to the last radar alert).
- **`Ctrl + H`:** Select and jump camera to your Hero unit.

### Selection & Control Groups
- **`Q`:** Select all on-screen combat units (double-tap to select all on map).
- **`Ctrl + W`:** Select all on-screen air units (double-tap to select all on map).
- **`E`:** Select all on-screen units of the same type as the current selection (double-tap for all on map).
- **`D` or `Ctrl + Up / Down`:** Cycle through your Dozers / Workers.
- **`Ctrl + Left / Right`:** Cycle the active unit in a multi-unit selection.
- **`1`–`9`:** Select control group (double-tap to center camera); **`Shift + 1`–`9`** (or **`Ctrl + 1`–`9`** in fullscreen/app mode) assigns group; **`Alt + 1`–`9`** views group without selecting.

### Combat, Building & UI
- **`A` + Right click:** Attack-Move.
- **`G` + Right click (or `GUARD` button):** Guard mode with live white sector radius preview & active guard ring (ground units and aircraft automatically return to their guarded sector).
- **`S`:** Stop selected units.
- **`X`:** Scatter selected units.
- **`Q` / `E` / `R` (while placing a building):** Rotate building blueprint.
- **`Tab`:** Toggle Diplomacy & Match Objectives screen.
- **`F9`:** Toggle HUD command bar.
- **`Esc`:** Cancel active placement/targeting/command mode, or open the Options menu.

Controls and bindings may change as development continues.

## Development guidelines

To keep the project manageable as it grows:

- Make focused changes in the relevant source module; avoid editing generated HTML.
- Preserve existing gameplay behavior unless a change specifically intends to alter it.
- Avoid adding large encoded media blobs to JavaScript source. Prefer real asset files and a documented loading path.
- Reuse Three.js geometries, materials and textures where objects share the same appearance.
- Dispose of GPU resources when removing objects that own unique geometries, materials or textures.
- Keep expensive work out of per-frame update loops where it can be event-driven or performed less frequently.
- Treat pathfinding, multiplayer state and game simulation as correctness-sensitive systems; add regression tests before optimizing them.
- Record reproducible profiling steps and before/after measurements instead of claiming performance improvements without evidence.

## Testing and profiling

The repository includes `verify_system.js`, a Node VM verification suite that validates syntax, spawns all unit/structure permutations, verifies SAGE armor math, A* pathfinding, obstacle collision, Generals' Powers, and runs a 350-tick headless Skirmish simulation test (using deterministic `simRandom()`).

For browser-level WebGL and asset loading verification, run the Playwright smoke test after `node build.js`:

```bash
npm install --no-save playwright
npx playwright install chromium
node scripts/e2e_smoke.mjs
```

This is also executed automatically in CI on every push to `master`.

Before a release, manually check at least:

- Starting a skirmish on each supported map size.
- Selecting, moving and grouping units around buildings, water and bridges.
- Assigning workers/dozers to build and repair at obstructed locations.
- Building, training, combat, harvesting and unit upgrades for each faction.
- Switching maps and using the map editor.
- Audio after the browser's first user interaction.
- Multiplayer connection, movement orders, combat and disconnect/reconnect behavior.
- Browser console errors and failed network requests.

For performance investigations, record the browser, device, map size, unit count and reproduction steps. Use Chrome/Edge DevTools Performance and Memory panels, and compare the same scenario before and after a change.

## Known limitations and next steps

This project is still evolving. In particular:

- `index.html` and `assets/data/` are generated by `node build.js` (git-ignored on `master` and deployed cleanly via GitHub Actions `deploy-pages`).
- The audio catalogs contain the clips already present in the project; completeness against the original game archives is not yet confirmed.
- `verify_system.js` covers headless simulation and 350-tick AI Skirmish checks, and `scripts/e2e_smoke.mjs` automates headless Chromium WebGL boot verification in CI; deeper interactive UI/combat E2E scenarios can be added over time.
- Multiplayer uses PeerJS WebRTC with 10 Hz host-authoritative `state_sync` and client interpolation; further multi-peer stress testing under high latency is ongoing.
- Large-map pathfinding and builder routing around tight base layouts should continue to be tested across all 12 official skirmish maps.

Next focus areas: **high-latency WebRTC stress testing, expanded Playwright gameplay E2E flows, and tight-base pathfinding polish.**

---

## Contributing

Small, focused improvements are easiest to review. When submitting a change, include:

1. What behavior changes and why.
2. The source files affected.
3. How the change was tested.
4. Any known compatibility or performance trade-offs.

Please avoid committing generated HTML unless the build/deployment workflow specifically requires it.
