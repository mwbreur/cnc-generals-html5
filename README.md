# Command & Conquer: Generals — HTML5 Edition

A work-in-progress, browser-based 3D real-time strategy game inspired by **Command & Conquer: Generals / Zero Hour**. The project uses Three.js, HTML, CSS, JavaScript, the Web Audio API and PeerJS/WebRTC.

**Play:** [mwbreur.github.io/cnc-generals-html5](https://mwbreur.github.io/cnc-generals-html5/)

> **Project status:** Active work in progress. Features and systems are still being developed; expect bugs, balance changes and incomplete functionality.

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

- Three playable factions: USA, China and GLA.
- 3D units, buildings, terrain, water, bridges and map editing.
- Unit selection, movement, combat, construction, harvesting and upgrades.
- Fog of war, enemy AI, pathfinding and collision handling.
- A Generals-style command bar, minimap and in-game HUD.
- Procedural Web Audio effects, with an additional official-audio data module.
- Peer-to-peer multiplayer using PeerJS/WebRTC.

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

There is currently no npm dependency manifest. The build script uses Node.js built-in modules; the game itself also loads its browser-side dependencies as defined by the HTML template.

## Project layout

The repository is organized around source modules and generated browser builds:

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
│   └── js/
│       ├── 01_core.js
│       ├── 02_textures.js
│       ├── 02b_w3d_models.js
│       ├── 03_units.js
│       ├── 04_buildings.js
│       ├── 05_audio.js
│       ├── 05b_official_audio.js
│       ├── 06_effects.js
│       ├── 07_terrain.js
│       ├── 08_collision.js
│       ├── 09_fogOfWar.js
│       ├── 10_editor.js
│       ├── 10b_cameos.js
│       ├── 11_sidebar.js
│       ├── 12_combat.js
│       ├── 13_ai.js
│       ├── 14_gameLoop.js
│       └── 15_multiplayer.js
├── build.js
├── verify_system.js
├── scripts/
│   ├── report-audio-usage.js
│   └── report-project-size.js
└── index.html
```

The JavaScript filenames are numbered to make their concatenation order explicit. Keep shared globals and initialization dependencies in mind when changing module order.

**Source files are the place to make changes.** The root `index.html` is a generated output; do not edit it by hand.

## Build and run

### Requirements

- Node.js 20 or newer is recommended (the CI workflow uses Node.js 20).
- A modern browser with WebGL support.

### Build

From the repository root:

```bash
node build.js
```

The build script reads the HTML/CSS source and JavaScript modules, validates them, and writes:

- `index.html` — web build for GitHub Pages. It fetches shared audio and the selected faction's catalog from `src/audio/` when a Skirmish starts.

The build script is intentionally simple and does not currently provide a production bundler, code splitting, minification, or asset hashing.

### Run locally

For development, serve the repository over HTTP rather than relying on a `file://` URL. For example, if Python is installed:

```bash
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

Some browser features, especially WebRTC and audio playback, require a secure context or a user interaction. Localhost is treated as a secure context by modern browsers.

## Build output and large files

The build concatenates JavaScript source modules into `index.html`. Audio stays external so the game can lazy-load shared effects and the player's faction catalog.

Two particularly large source modules identified during a repository review are:

- `src/audio/*.json` — current official-audio catalogs.
- `src/js/02b_w3d_models.js` — W3D model data.

The generated `index.html` size is reported by `node scripts/report-project-size.js`. This is an on-disk size, not a compressed transfer size.

### Audio loading

The current catalogs contain 469 clips: shared effects plus USA, China and GLA voices. The web build requests shared effects and only the player faction's catalog when starting a Skirmish. Campaign and cutscene speech is not part of these catalogs. Enemy battlefield effects remain shared.

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

- **WASD / Arrow keys:** Move the camera.
- **Mouse wheel:** Zoom.
- **Middle mouse drag:** Rotate the camera.
- **Left click and drag:** Select units.
- **Right click:** Issue movement, attack, harvesting or waypoint orders.
- **Minimap:** Click to move the camera; right-click to issue orders.
- **Command grid:** `Q W E R`, `A S D F`, `Z X C V`.
- **Space:** Recenter on the base Command Center.

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

The repository includes `verify_system.js`, a Node-based verification script. The build currently performs JavaScript syntax validation, which is useful but does not prove that gameplay works in a browser.

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

- The web build still embeds large model data; only audio has been separated so far.
- The audio catalogs contain the clips already present in the project; completeness against the original game archives is not yet confirmed.
- Automated build validation currently checks syntax; gameplay regression coverage and browser-level smoke tests should be expanded.
- Multiplayer currently relies heavily on peers applying the same orders locally; synchronization behavior should be tested under latency and different frame rates.
- Large-map pathfinding and builder routing need regression testing across the full map-size range.

A sensible order of work is: **asset/build separation → repeatable tests → pathfinding correctness → profiling-led rendering and simulation optimization → multiplayer synchronization improvements.**

---

## Contributing

Small, focused improvements are easiest to review. When submitting a change, include:

1. What behavior changes and why.
2. The source files affected.
3. How the change was tested.
4. Any known compatibility or performance trade-offs.

Please avoid committing generated HTML unless the build/deployment workflow specifically requires it.
