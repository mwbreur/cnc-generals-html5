# Skirmish audio catalogs

Official audio is grouped into `global.json` for shared battlefield/UI effects and one JSON catalog per player faction. The game fetches only the shared catalog and the player's faction catalog when a Skirmish starts; later playback requests reuse those in-memory catalogs. Campaign speech is not included in these catalogs.

These catalogs contain Base64 WAV data from the existing project audio set. Keep the catalog files alongside `index.html` under `src/audio/` when deploying the web build. `C&Cv0.0024.html` remains self-contained and embeds the audio catalogs for offline use. Run `node tools/validate_audio_catalog.js` after changing them and `node tools/test_audio_loader.js` to check lazy loading, faction routing, and offline playback setup.

Audio generation scripts merge new clips into the catalogs and must not replace `src/js/05b_official_audio.js`, which contains the runtime loader and playback functions.
