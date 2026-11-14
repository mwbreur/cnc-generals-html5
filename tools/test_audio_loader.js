const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const requested = [];
const played = [];
const context = {
    window: {},
    URL,
    document: { baseURI: 'https://example.test/game/' },
    fetch: async url => {
        const group = new URL(url).pathname.split('/').pop().replace('.json', '');
        requested.push(group);
        const entries = JSON.parse(fs.readFileSync(path.join(root, 'src/audio', `${group}.json`), 'utf8'));
        return { ok: true, json: async () => entries };
    },
    Audio: function Audio(data) {
        this.data = data;
        this.play = () => { played.push(data); return Promise.resolve(); };
    },
    console
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/js/05b_official_audio.js'), 'utf8'), context);

(async () => {
    if (requested.length !== 0) throw new Error('Audio catalog loaded during script initialization');
    await context.preloadSkirmishAudio('china');
    if (requested.slice().sort().join(',') !== 'china,global') throw new Error(`Unexpected preload groups: ${requested.join(',')}`);
    if (!context.window.OFFICIAL_AUDIO_DATA.voice_china_redguard_create) throw new Error('China voice catalog did not load');
    if (context.window.OFFICIAL_AUDIO_DATA.voice_usa_ranger_create) throw new Error('Preload downloaded another faction catalog');
    context.window.playOfficialSound('sfx_click', 0.65);
    await new Promise(resolve => setImmediate(resolve));
    if (played.length !== 1) throw new Error(`Expected one playback, got ${played.length}`);
    if (requested.length !== 2) throw new Error('Cached catalog was fetched again');

    const china = JSON.parse(fs.readFileSync(path.join(root, 'src/audio/china.json'), 'utf8'));
    context.window.playUnitReadySound('dozer', 'china');
    await new Promise(resolve => setImmediate(resolve));
    if (!played.some(data => data === china.voice_china_dozer_create || data === china.eva_china_unit_ready)) {
        throw new Error('Unit-ready playback did not select an available China voice');
    }
    const playbackCount = played.length;
    context.window.playUnitVoice('unknown_unit', 'select', 'china');
    await new Promise(resolve => setImmediate(resolve));
    if (played.length !== playbackCount) throw new Error('Unknown unit voice unexpectedly played an unavailable clip');

    let embeddedFetches = 0;
    const embedded = vm.createContext({
        window: { OFFICIAL_AUDIO_EMBEDDED: { china } },
        fetch: () => { embeddedFetches++; throw new Error('Embedded catalog must not fetch'); },
        URL,
        document: { baseURI: 'file:///game.html' },
        console
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'src/js/05b_official_audio.js'), 'utf8'), embedded);
    await embedded.loadOfficialAudioGroup('china');
    if (embeddedFetches !== 0 || !embedded.window.OFFICIAL_AUDIO_DATA.voice_china_dozer_create) {
        throw new Error('Embedded audio catalog did not load without a network request');
    }
    console.log('Audio loader checks passed: lazy startup, faction routing, valid voice selection, request caching, and offline embedded catalogs.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
