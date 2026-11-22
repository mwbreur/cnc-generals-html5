========================================================================
  COMMAND & CONQUER: GENERALS & ZERO HOUR — HTML5 EDITION (BETA)
========================================================================

HOW TO PLAY LOCALLY (NO DOCKER, NO GIT, NO SETUP REQUIRED)
------------------------------------------------------------------------
1. Unzip this entire folder somewhere on your PC (e.g. Desktop or Games).
2. Double-click the launcher for your system:
   - Windows:     Play_Windows.bat
   - Mac / Linux: Play_Mac_Linux.command
3. Your web browser will automatically open http://localhost:8080.
   Keep the launcher window open while playing; close it when done.

IMPORTANT: Please use the launcher instead of double-clicking index.html
directly. Modern browsers block audio files when opened via file:// URLs.

- Windows Note: Works out of the box on Windows 10/11 with ZERO extra
  software installed (uses built-in PowerShell). If Windows SmartScreen
  warns about an unrecognized script, click "More info" -> "Run anyway".
- Mac Note: If macOS blocks the .command file on first launch, right-click
  Play_Mac_Linux.command -> "Open" -> "Open".

OFFLINE LAN MULTIPLAYER (OPTIONAL)
------------------------------------------------------------------------
To host a 2-player match on your home Wi-Fi / LAN without internet:
1. Make sure the HOST PC has Node.js installed (https://nodejs.org).
2. Run Play_Windows.bat or Play_Mac_Linux.command on the host PC.
3. The launcher prints your local LAN address (e.g. http://192.168.1.42:8080).
4. Have the second player open that URL in their browser (no install needed
   on the second PC!), click Multiplayer -> Join, and join your room!

WHAT'S INCLUDED IN THIS BETA
------------------------------------------------------------------------
- All 3 Factions: USA, China, and GLA with official W3D 3D models,
  infantry/vehicle animations, upgrades, General Powers & Superweapons.
- 17 Official Maps (2P, 4P, 6P, 8P) + Procedural Skirmish Maps + Map Editor.
- Skirmish AI (Easy / Medium / Hard) with base building, harvesting, and
  multi-front attacks.
- Live 3D Main Menu ShellMap battle & Zero Hour Options Menu (Graphics,
  Audio, Gameplay, FPS counter).
- Online P2P (WebRTC) and Offline LAN Multiplayer.

WHAT WE'RE STILL WORKING ON (ROAD TO 1.0)
------------------------------------------------------------------------
This is a BETA pre-release snapshot. We are still actively polishing:
- Faction/unit balance, edge-case abilities, and retail Zero Hour parity.
- Large-army (200+ unit) performance and tight-chokepoint pathfinding.
- AI base-building spacing and tactical decision polish.
- Multiplayer sync edge cases (superweapon/general power sync & reconnects).

KNOWN ISSUES YOU MAY ENCOUNTER
------------------------------------------------------------------------
- First load takes ~2-4 seconds while the 3D model and map bundles load.
- Very large battles (200+ active units) can still dip FPS on older GPUs;
  open the Options menu to lower Shadow/FX quality or cap DPR if needed.
- Occasional unit clumping or brief hesitation around narrow base alleys
  and supply centers.
- Some multiplayer special powers/superweapons are still being hardened
  for full 2-player state parity.
- Online P2P multiplayer relies on public WebRTC signaling (PeerJS); for
  the most reliable 2-player experience on the same network, use LAN mode.

FOUND A BUG OR HAVE FEEDBACK?
------------------------------------------------------------------------
Please open an issue on GitHub:
https://github.com/mwbreur/cnc-generals-html5/issues
