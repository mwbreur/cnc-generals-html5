# C&C: Generals HTML5 Edition — Project Rules

## 1. Project Goal & Scope
- **Skirmish & Multiplayer First:** Focus exclusively on 100% working Skirmish and smooth PeerJS WebRTC multiplayer with original *C&C: Generals / Zero Hour* look/feel and high FPS in large-scale battles. Single-player campaign missions are not planned.
- **Authentic EA Assets Over Custom Placeholders:**
  - On official maps (`window.OFFICIAL_SKIRMISH_MAPS`), use the extracted `ObjectsList` props, supply docks, and tech buildings—never scatter random procedural props, fake bridges, or fictitious buildings.
  - Prefer official EA W3D models (`02b_w3d_models.js`) and official EA cameos (`tools/build_cameos.js` -> `10b_cameos.js`, prioritizing `EnglishZH.big` over stale `extracted_assets`).
- **Host-Authoritative Multiplayer:** Never use strict lockstep (which causes slow-motion in large battles). Keep 10 Hz host-authoritative `state_sync` with smooth client interpolation.

## 2. Build, Verification & Git/CI Workflow
- **Always Verify Before Pushing:** Run `node build.js` and `node verify_system.js` (which includes a 350-tick headless Skirmish simulation test) after every code change.
- **Regenerate Data Bundles When Needed:**
  - After editing `tools/build_cameos.js`, run `node tools/build_cameos.js`.
  - After editing `tools/export_official_map.js`, run `node tools/export_official_map.js`.
  - `node build.js` externalizes `02b_w3d_models.js`, `07b_tournament_desert.js`, and `10b_cameos.js` into `assets/data/`—commit updated `assets/data/` alongside `index.html` and `src/`.
- **CI Rebase Handling:** `.github/workflows/build-and-deploy.yml` auto-commits generated `index.html` and `assets/data/` on `master`. If `git push origin master` is rejected:
  1. `git pull --rebase origin master`
  2. `node build.js`
  3. `git add index.html assets/data`
  4. `GIT_EDITOR=true git rebase --continue` (PowerShell: `$env:GIT_EDITOR="true"; git rebase --continue`)
  5. `git push origin master`

## 3. Codebase Invariants & Gotchas
- **Large Data Files (`02b_w3d_models.js`):** Never apply large text patches directly to the multi-megabyte `W3D_INFANTRY_DATA` / `W3D_VEHICLE_DATA` / `W3D_BUILDING_DATA` lines; use a targeted Node script preserving line endings.
- **Unit/Ability Registry Sync:** When adding or fixing units/abilities, keep `INFANTRY_TYPE_SET` (`14_gameLoop.js`), `isInfantryType` (`11_sidebar.js`), `cameoMap` (`11_sidebar.js`), and `CAMEO_MAP` (`tools/build_cameos.js`) aligned.
- **Collision & Pathfinding:** Obstacle collision (`resolveObstacleCollisions` in `08_collision.js`) must check both `structures` and `enemyStructures`, and AI/harvester loops must not overwrite active `waypoints` every frame.
