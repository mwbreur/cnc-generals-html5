# Skirmish audio catalogs

The web build loads official audio from faction-specific catalogs. The audio runtime and catalogs live in `src/js/05b_official_audio.js` and `src/audio/`.

## Current groups

| Catalog | Contents | Current entries |
|---|---|---:|
| `global.json` | Shared official battlefield and interface effects | 25 |
| `usa.json` | USA unit voices and EVA announcements | 155 |
| `china.json` | China unit voices and EVA announcements | 142 |
| `gla.json` | GLA unit voices and EVA announcements | 147 |

When a web Skirmish starts, the game requests shared effects and the player's faction catalog. Other catalogs are not requested for that match. The runtime caches each catalog request and only plays voice keys present in the loaded catalog. Campaign dialogue and cutscene audio are not included in these groups.

The generated `index.html` needs the files in `src/audio/` alongside it on the server.

## What this does and does not establish

These catalogs split the 469 official clips already present in the project's audio data. The split does not prove that every original-game voice line or weapon sound has been found. The earlier archive inventory reported 41 unresolved audio references; those need to be matched against the local source archives. A live browser test for all three factions is also still needed.

Enemy weapon effects must remain audible. They belong in `global.json`, even when a faction-specific weapon uses them. Faction catalogs are for voices and EVA lines, not a filter that silences enemy combat.

## Updating the catalogs

The audio generation scripts use `tools/audio_catalog.js` to merge newly found clips without replacing the runtime loader. The source archives are local inputs and are not included in the repository. After changing catalog data, run:

```bash
node tools/validate_audio_catalog.js
node tools/test_audio_loader.js
node build.js
node verify_system.js
```

The report scripts under `scripts/` help inventory literal audio calls and project file sizes. The audio-reference scan is best-effort; dynamic sound IDs still need manual review.
