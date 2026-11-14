const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const requested = [];
const played = [];
const context = {
    window: {},
    selectedFaction: 'usa',
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
    context.window.playOfficialSound('voice_overlord_bunker', 0.9, 'china');
    await new Promise(resolve => setImmediate(resolve));
    if (requested.join(',') !== 'china') throw new Error(`Explicit China voice loaded the wrong catalog: ${requested.join(',')}`);
    const initialPlaybackCount = played.length;
    await context.preloadSkirmishAudio('china');
    if (requested.slice().sort().join(',') !== 'china,global') throw new Error(`Unexpected preload groups: ${requested.join(',')}`);
    if (!context.window.OFFICIAL_AUDIO_DATA.voice_china_redguard_create) throw new Error('China voice catalog did not load');
    if (context.window.OFFICIAL_AUDIO_DATA.voice_usa_ranger_create) throw new Error('Preload downloaded another faction catalog');
    context.window.playOfficialSound('sfx_click', 0.65);
    await new Promise(resolve => setImmediate(resolve));
    if (played.length !== initialPlaybackCount + 1) throw new Error(`Expected one additional playback, got ${played.length - initialPlaybackCount}`);
    if (requested.length !== 2) throw new Error('Cached catalog was fetched again');

    const china = JSON.parse(fs.readFileSync(path.join(root, 'src/audio/china.json'), 'utf8'));
    context.window.playUnitReadySound('dozer', 'china');
    await new Promise(resolve => setImmediate(resolve));
    if (!played.some(data => data === china.voice_china_dozer_create || data === china.eva_china_unit_ready)) {
        throw new Error('Unit-ready playback did not select an available China voice');
    }
    const factions = {
        usa: JSON.parse(fs.readFileSync(path.join(root, 'src/audio/usa.json'), 'utf8')),
        china,
        gla: JSON.parse(fs.readFileSync(path.join(root, 'src/audio/gla.json'), 'utf8'))
    };
    for (const faction of ['usa', 'china', 'gla']) {
        context.window.playUnitVoice('worker', 'select', faction);
        await new Promise(resolve => setImmediate(resolve));
        const prefix = faction === 'usa' ? 'voice_dozer_usa_select' : faction === 'china' ? 'voice_dozer_china_select' : 'voice_worker_select';
        const keys = Object.keys(factions[faction]).filter(key => key.startsWith(prefix));
        if (!keys.length || !keys.some(key => played.includes(factions[faction][key]))) {
            throw new Error(`Worker selection voice did not use the ${faction} catalog`);
        }
    }
    for (const [faction, expected] of [['usa', 'voice_usa_dozer_create'], ['china', 'voice_china_dozer_create'], ['gla', 'voice_gla_worker_create']]) {
        context.window.playUnitReadySound('worker', faction);
        await new Promise(resolve => setImmediate(resolve));
        const eva = factions[faction][`eva_${faction}_unit_ready`];
        if (!played.includes(factions[faction][expected]) && (!eva || !played.includes(eva))) {
            throw new Error(`Worker ready announcement did not use the ${faction} unit or EVA voice`);
        }
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
    console.log('Audio loader checks passed: lazy startup, faction-specific builder voices, valid voice selection, request caching, and offline embedded catalogs.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
