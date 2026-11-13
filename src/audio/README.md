# Skirmish audio asset plan

This directory is the planned home for the external audio manifest and extracted audio assets. The current game still uses the existing audio implementation in `src/js/05_audio.js` and the large official-audio data module `src/js/05b_official_audio.js`.

**This is preparation only:** no original audio has been moved, converted, deleted, or replaced by this document. The current build and playback behavior remain unchanged.

## Skirmish audio groups

The eventual web build should load audio by purpose, not simply by the faction selected in the lobby.

| Group | Contents | Loading plan |
|---|---|---|
| Shared combat | Weapon fire, projectiles, impacts, explosions, vehicle engines, aircraft and battlefield ambience for USA, China and GLA | Available to every match; individual files may still load on first use |
| Shared interface | Menu/UI effects and common alerts | Small core set loaded early |
| Player faction voices | Selection responses, acknowledgements, unit voices and faction-specific production/building announcements | Load the selected player's faction pack |
| Music | Original game music, if the source tracks can be located and safely extracted | Optional; load tracks on demand and provide a music toggle |
| Mission/story | Campaign dialogue, scripted sequences and cutscene audio | Out of the Skirmish loading path; future work |

Enemy weapon sounds must remain audible. For that reason, faction-specific weapon effects belong in the shared combat pool (or in combat packs loaded for factions present in the match), not exclusively in the local player's voice pack.

Enemy unit acknowledgements and campaign dialogue are not required for the initial Skirmish experience. If a later game mode needs them, it can request the relevant voice pack separately.

## Proposed manifest contract

After the current IDs and source data have been inventoried, add a manifest that maps stable logical sound IDs to external files. Each entry should record:

- A stable ID that existing gameplay code can request.
- A relative asset URL.
- The group: `combat`, `interface`, `faction-voice`, or `music`.
- The faction, only when the sound is faction-specific.
- The audio format and optional duration/metadata.
- Whether it is safe to preload or should be fetched on first use.

Do not invent file paths or sound IDs before they have been matched to the existing data. Keep a mapping from every old ID to its extracted asset so no voice line or effect is silently lost.

## Runtime requirements

The future loader should:

1. Fetch and decode an asset only when its group or sound is needed.
2. Cache the fetch/decode promise so simultaneous requests do not download or decode the same file repeatedly.
3. Reuse decoded buffers for repeated playback.
4. Preserve current volume and playback controls.
5. Fall back to the existing sound implementation while migration is incomplete.
6. Report missing assets clearly during development instead of silently swallowing errors.
7. Keep music optional and separate from short sound effects.

## Safe migration order

1. Run `node scripts/report-audio-usage.js` and inspect its output.
2. Map every current sound ID to its real source data and gameplay purpose.
3. Identify the official-audio module's internal format and extraction method.
4. Extract a small, representative test set without deleting the originals.
5. Add the manifest and loader behind a feature flag or fallback path.
6. Compare playback in a Skirmish match for all three factions.
7. Only then move the remaining audio and update the web build to keep large audio data out of the main HTML.

The standalone build should remain available as a compatibility target while the web build gains progressive loading.
