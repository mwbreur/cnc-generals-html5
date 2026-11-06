# Command & Conquer: Generals - HTML5 Edition

A standalone, 100% browser-based 3D recreation of **Command & Conquer: Generals** built with Three.js, procedural Web Audio API, and WebRTC PeerJS.

🎮 **Play Instantly in your Browser:** [https://mwbreur.github.io/cnc-generals-html5/](https://mwbreur.github.io/cnc-generals-html5/)

---

## Key Features

### 1. Three Playable Factions & Authentic 3D Models
- **USA:** Advanced high-tech laser and airborne warfare (Crusader Tank, Paladin Tank with Point Defense Laser, Humvee, Comanche Attack Helicopter, Raptor, Stealth Fighter, Aurora Hypersonic Bomber).
- **China:** Heavy armor, mass assault, and nuclear might (Battlemaster, Overlord Heavy Tank with modular superstructures, Dragon Tank, Gatling Tank, Nuke Cannon).
- **GLA:** Guerrilla warfare, chemical strikes, and mobile skirmishers (Scorpion Tank, Marauder Tank, Technical, Rocket Buggy, Quad Cannon, Toxin Tractor, SCUD Launcher).

### 2. Animated Superweapons
- **USA Particle Uplink Cannon:** Ground dish beams telemetry skyward, triggering an orbital beam column that sweeps spiraling destruction across enemy bases with crackling electrical sparks and intense scorch marks.
- **China Nuclear Missile Silo:** Silo doors open as an ICBM climbs into the stratosphere amidst air-raid sirens, plunging down into an apocalyptic multi-stage **Nuclear Mushroom Cloud** (expanding cap, smoke stem, supersonic shockwave ring, crater, and lingering radioactive fallout).
- **GLA SCUD Storm:** Fires a 9-missile ripple salvo staggered by 160ms with billowing green smoke, unleashing devastating chemical impacts and lingering Anthrax Gamma gas clouds.

### 3. USA Vehicle Drone Attachments
Attach hovering autonomous drones directly to Crusader Tanks, Paladin Tanks, and Humvees:
- **Battle Drone ($300):** Hovers overhead with spinning micro-rotors, constantly repairing the host vehicle (+3 HP/s) and suppressing nearby infantry with micro-gun fire.
- **Scout Drone ($100):** Grants 50% extra vision and shroud-clearing range.
- **Hellfire Drone ($500):** Actively scans for hostile armored targets and launches miniature guided anti-tank missiles.

### 4. China Overlord & Nuke Cannon Upgrades
- **Overlord Bunker ($500):** Hexagonal pillbox superstructure with sandbags and riflemen firing in all directions while moving.
- **Overlord Gatling Cannon ($1200):** Dual 20mm rotary Gatling turret mounted atop the main turret that independently targets and shreds aircraft and infantry.
- **Overlord Propaganda Tower ($500):** Broadcast mast with four megaphones that heals nearby friendly units (+4 HP/s) and increases rate of fire by 25%.
- **Nuke Cannon Outriggers & Neutron Shells ($1000):** Deploys hydraulic stabilization outriggers before firing tactical atomic shells, with optional Neutron Shell upgrades.

### 5. Unit Veterancy System
Units earn combat experience with visual chevron badges:
- **Rank 1 (Veteran - 2 kills):** +20% Max Health and increased firing rate.
- **Rank 2 (Elite - 5 kills):** +40% Max Health.
- **Rank 3 (Heroic - 10 kills):** Double health, golden tracers, and **continuous field health auto-regeneration (+3 HP/s)**.

### 6. Procedural Multi-Faction Audio Engine
100% asset-free procedural audio synthesized in real time via the Web Audio API:
- **USA:** Radio static clicks, unit order chirps, .50 cal machine gun bursts, tank cannons, point-defense lasers, missile whooshes, hypersonic fuel-air bombs.
- **China:** 152mm heavy smoothbore cannon blasts, high-RPM Gatling buzz, roaring flamethrower whooshes, propaganda tower chimes, nuclear artillery.
- **GLA:** AK-47 guerrilla bursts, Technical truck engine revs & horn, chemical missile hisses, demolition arming beeps, salvage clanks.
- **Superweapons:** Klaxon air raid sirens, orbital laser drone surges, thermonuclear sub-bass detonations, SCUD ripple salvos.

### 7. Real-Time Base Building, Airfield Ops & Map Editor
- **Airfield Combat Air Patrol (CAP):** Airplanes spawn landed on runway tarmacs, take off to cruising altitude, fly loitering patrol orbits, and scramble to attack nearby enemies.
- **Integrated In-Game Map Editor:** Sculpt hills, raise/lower terrain, paint cliffs, place bridges, place supply docks, and switch themes (Desert, Grassland, Snow).
- **WebRTC Peer-to-Peer Multiplayer:** Direct low-latency P2P multiplayer powered by PeerJS.

---

## Project Structure
```
D:\C&C\
├── src\
│   ├── index_template.html      # Outer HTML structure & dependencies
│   ├── css\
│   │   └── style.css            # Game UI styling, HUD, sidebar, radar
│   ├── html\
│   │   └── body.html            # HUD, menus, modal dialogs
│   └── js\
│       ├── 01_core.js           # Three.js setup, camera, global state
│       ├── 02_textures.js       # Procedural canvas camo & bump textures
│       ├── 03_units.js          # Detailed unit 3D meshes & veterancy
│       ├── 04_buildings.js      # 33 detailed building structures
│       ├── 05_audio.js          # Procedural Web Audio engine for USA, China & GLA
│       ├── 06_effects.js        # Superweapons, napalm, mushroom cloud & drone FX
│       ├── 07_terrain.js        # Heightmap generator, water, bridges
│       ├── 08_collision.js      # Obstacle & building collision physics
│       ├── 09_fogOfWar.js       # Dynamic unit line-of-sight & shroud
│       ├── 10_editor.js         # Map Editor terrain sculpting & save/load
│       ├── 11_sidebar.js        # Production queues, upgrades & superweapons
│       ├── 12_combat.js         # Targeting, weapon firing, veterancy progression
│       ├── 13_ai.js             # Enemy AI production & assault waves
│       ├── 14_gameLoop.js       # Animation loop, drone updates, heroic regen
│       └── 15_multiplayer.js    # PeerJS P2P multiplayer networking
├── build.js                     # Instant bundler into standalone HTML
├── C&Cv0.0024.html              # Standalone playable HTML game
├── index.html                   # Root build for GitHub Pages hosting
└── README.md
```

---

## Building
To compile all modules from `src/` into standalone single-file deliverables:
```bash
node build.js
```
*Builds in under 30 milliseconds with automated Node VM syntax validation!*

---

## Playing
- **Online:** Visit [https://mwbreur.github.io/cnc-generals-html5/](https://mwbreur.github.io/cnc-generals-html5/)
- **Offline:** Double-click `C&Cv0.0024.html` or `index.html` in Windows Explorer to play immediately in Chrome, Edge, or Firefox.
