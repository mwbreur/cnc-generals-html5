const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const audioDir = path.join(root, 'src', 'audio');
const groups = ['global', 'usa', 'china', 'gla'];
const seen = new Set();
const summary = {};

for (const group of groups) {
    const file = path.join(audioDir, `${group}.json`);
    const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
    let bytes = 0;
    for (const [key, data] of Object.entries(entries)) {
        if (seen.has(key)) throw new Error(`Duplicate audio key: ${key}`);
        seen.add(key);
        if (!data.startsWith('data:audio/wav;base64,')) throw new Error(`Invalid audio data URI for ${key}`);
        if ((group === 'global') !== key.startsWith('sfx_')) throw new Error(`Audio key is in the wrong group: ${key}`);
        if (group !== 'global' && key.includes('_usa_') && group !== 'usa') throw new Error(`USA key is in ${group}: ${key}`);
        if (group !== 'global' && key.includes('_china_') && group !== 'china') throw new Error(`China key is in ${group}: ${key}`);
        if (group !== 'global' && key.includes('_gla_') && group !== 'gla') throw new Error(`GLA key is in ${group}: ${key}`);
        bytes += Math.floor((data.length - 'data:audio/wav;base64,'.length) * 3 / 4);
    }
    summary[group] = { keys: Object.keys(entries).length, decodedBytes: bytes };
}

const runtime = fs.readFileSync(path.join(root, 'src/js/05b_official_audio.js'), 'utf8');
if (runtime.length > 50000) throw new Error(`Audio runtime unexpectedly large (${runtime.length} bytes)`);
if (runtime.includes('data:audio/wav;base64,')) throw new Error('Audio payload remains embedded in runtime source');
if (!runtime.includes("loadOfficialAudioGroup('global')")) throw new Error('Global audio is not part of the Skirmish preload');
for (const faction of ['usa', 'china', 'gla']) {
    if (!fs.existsSync(path.join(audioDir, `${faction}.json`))) throw new Error(`Missing faction catalog: ${faction}`);
}

const webBuild = path.join(root, 'index.html');
if (fs.existsSync(webBuild)) {
    const web = fs.readFileSync(webBuild, 'utf8');
    if (web.includes('window.OFFICIAL_AUDIO_EMBEDDED =')) throw new Error('Web build should use external audio catalogs');
}

console.log(JSON.stringify({ totalKeys: seen.size, groups: summary, runtimeBytes: Buffer.byteLength(runtime), webBuildChecked: fs.existsSync(webBuild) }, null, 2));
