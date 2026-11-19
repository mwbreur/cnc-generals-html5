// Incremental retail WAV patcher (safe: merges only the listed keys into src/audio/*.json).
// Sources verified against INIZH.big Weapon.ini / FXList.ini / SoundEffects.ini:
//  - TomahawkMissileWeapon -> ProjectileDetonationFX WeaponFX_BombTruckDefaultBombDetonation -> ExplosionScudExplosive = gexpscu1
//  - MissileDefenderWeapon = imisweaa|imisweab|imisweac
//  - ExplosionCarpetBomb = gexpcara|b|c|d (Aurora FX_AuroraBombDetonate)
//  - ExplosionFire = gexpfira|b|c (Inferno shell)
const fs = require('fs');
const path = require('path');
const { writeAudioCatalog } = require('./audio_catalog');

const root = path.resolve(__dirname, '..');
const bigPaths = ['AudioZH.big', 'Audio.big', 'AudioEnglishZH.big', 'AudioEnglish.big', 'SpeechEnglishZH.big', 'SpeechEnglish.big', 'SpeechZH.big', 'Speech.big']
    .map(n => path.join(root, 'generals_big_files', n));

function buildBigIndex(paths) {
    const index = {};
    for (const bp of paths) {
        if (!fs.existsSync(bp)) continue;
        const buf = fs.readFileSync(bp);
        const count = buf.readUInt32BE(8);
        let pos = 16;
        for (let i = 0; i < count; i++) {
            const off = buf.readUInt32BE(pos);
            const size = buf.readUInt32BE(pos + 4);
            pos += 8;
            let end = pos;
            while (end < buf.length && buf[end] !== 0) end++;
            const base = buf.toString('ascii', pos, end).replace(/.*[\\\/]/, '').toLowerCase();
            pos = end + 1;
            if (!index[base]) index[base] = { buf, off, size };
        }
    }
    return index;
}

const soundFiles = {
    'sfx_expl_tomahawk': 'gexpscu1.wav',
    'sfx_missile_defender_1': 'imisweab.wav',
    'sfx_missile_defender_2': 'imisweac.wav',
    'sfx_expl_carpet_3': 'gexpcard.wav',
    'sfx_expl_fire_2': 'gexpfirc.wav'
};

const index = buildBigIndex(bigPaths);
const additions = {};
const skipped = [];
for (const [key, wav] of Object.entries(soundFiles)) {
    const e = index[wav];
    if (!e || e.size === 0) { skipped.push(`${key} (${wav})`); continue; }
    additions[key] = 'data:audio/wav;base64,' + e.buf.subarray(e.off, e.off + e.size).toString('base64');
}
const counts = writeAudioCatalog(additions);
console.log('Merged', Object.keys(additions).length, 'weapon WAVs. Catalog counts:', JSON.stringify(counts));
if (skipped.length) console.log('Skipped:', skipped.join(', '));
