# Command & Conquer: Generals - HTML5 Edition

A standalone, 100% browser-based 3D recreation of **Command & Conquer: Generals** built with Three.js, Web Audio API, and WebRTC PeerJS.

## Features
- **3 Playable Factions:** USA, China, and GLA with authentic 3D procedural models, faction textures, and tech trees.
- **Full Real-Time Base Building & Economy:** Command Centers, Barracks, War Factories, Airfields, Supply Centers, Harvesters, and Superweapons.
- **Air Combat & Loitering Patrol (CAP):** Aircraft spawn landed on airfield tarmacs, climb to cruising altitudes, fly smooth circular patrol orbits, and execute high-speed strafing / bombing runs.
- **Weapon & Lingering FX:** Multi-stage explosions, ground shockwaves, incandescent shrapnel sparks, persistent crater decals, lingering burning napalm pools with burn damage, and billowing anthrax/toxin gas clouds with poison ticks.
- **Procedural Web Audio Engine:** Realistic synthesized military radio chirps, unit order confirmations, building placement clanks, tank cannon blasts, point-defense lasers, machine guns, missile launches, and supersonic fuel-air detonations (USA Faction).
- **In-Game Map Editor:** Sculpt hills, paint elevations, place bridges and supply docks, customize themes (Desert, Grassland, Snow), and save/load custom maps.
- **Multiplayer:** Real-time WebRTC Peer-to-Peer multiplayer powered by PeerJS.

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
│       ├── 03_units.js          # 42 detailed unit 3D meshes & specs
│       ├── 04_buildings.js      # 33 detailed building structures
│       ├── 05_audio.js          # USA Web Audio API procedural synthesizer
│       ├── 06_effects.js        # Multi-stage explosions, napalm & toxin FX
│       ├── 07_terrain.js        # Heightmap generator, water, bridges
│       ├── 08_collision.js      # Obstacle & building collision physics
│       ├── 09_fogOfWar.js       # Shroud & dynamic unit line-of-sight
│       ├── 10_editor.js         # Map Editor terrain sculpting & save/load
│       ├── 11_sidebar.js        # Generals sidebar build queues & tech trees
│       ├── 12_combat.js         # Targeting, weapon firing, damage formulas
│       ├── 13_ai.js             # Enemy AI production & assault waves
│       ├── 14_gameLoop.js       # Animation loop, selection, move commands
│       └── 15_multiplayer.js    # PeerJS P2P multiplayer networking
├── build.js                     # Instant bundler into standalone HTML
├── C&Cv0.0024.html              # The playable standalone HTML game
└── README.md
```

## Building
To compile all modules from `src/` into a self-contained, double-clickable single HTML file:
```bash
node build.js
```

## Playing
Simply double-click `C&Cv0.0024.html` in Windows Explorer to play immediately in Chrome, Edge, or Firefox. No web server required!
