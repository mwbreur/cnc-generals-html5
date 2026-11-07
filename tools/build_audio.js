const fs = require('fs');
const path = require('path');

const audioDir = 'D:/C&C/extracted_assets/audio';
const soundFiles = {
    // Weapons & Combat SFX
    'sfx_cannon_crusader': 'vcruweaa.wav',
    'sfx_cannon_paladin': 'vpalweaa.wav',
    'sfx_rifle_ranger': 'iranweaa.wav',
    'sfx_missile_comanche': 'vcomweaa.wav',
    'sfx_missile_tomahawk': 'vtomweaa.wav',
    'sfx_explosion': 'bgendiea.wav',
    'sfx_click': 'umenucla.wav',

    // USA Unit Voices (Select / Move / Attack / Create)
    'voice_crusader_select': 'vcrusea.wav',
    'voice_crusader_move': 'vcrumoa.wav',
    'voice_crusader_attack': 'vcruata.wav',

    'voice_paladin_select': 'vpalsea.wav',
    'voice_paladin_move': 'vpalmoa.wav',
    'voice_paladin_attack': 'vpalata.wav',

    'voice_ranger_create': 'iranseg.wav',
    'voice_ranger_select': 'iransea.wav',
    'voice_ranger_move': 'iranmoa.wav',
    'voice_ranger_attack': 'iranata.wav',

    'voice_humvee_select': 'vhumsea.wav',
    'voice_humvee_move': 'vhummoa.wav',
    'voice_humvee_attack': 'vhuma2a.wav',

    'voice_comanche_select': 'vcomsea.wav',
    'voice_comanche_move': 'vcommoa.wav',
    'voice_comanche_attack': 'vcoma2a.wav',

    'voice_chinook_select': 'vchisea.wav',
    'voice_chinook_move': 'vchimoa.wav',

    'voice_raptor_select': 'vrapsea.wav',
    'voice_raptor_move': 'vrapmoa.wav',
    'voice_raptor_attack': 'vrapa2a.wav',

    'voice_aurora_select': 'vaursea.wav',
    'voice_aurora_move': 'vaurmoa.wav',
    'voice_aurora_attack': 'vaurata.wav',

    // USA Dozer, Colonel Burton, Pathfinder
    'voice_dozer_select': 'vdousea.wav',
    'voice_dozer_move': 'vdoumoa.wav',
    'voice_dozer_build': 'vdoubua.wav',

    'voice_burton_select': 'icolsea.wav',
    'voice_burton_move': 'icolmoa.wav',
    'voice_burton_attack': 'icolata.wav',

    'voice_pathfinder_select': 'ipatsea.wav',
    'voice_pathfinder_move': 'ipatmoa.wav',
    'voice_pathfinder_attack': 'ipatata.wav'
};

const audioMap = {};
let totalBytes = 0;
for (const [key, fn] of Object.entries(soundFiles)) {
    const fPath = path.join(audioDir, fn);
    if (fs.existsSync(fPath)) {
        const buf = fs.readFileSync(fPath);
        totalBytes += buf.length;
        audioMap[key] = 'data:audio/wav;base64,' + buf.toString('base64');
        console.log(`✓ Audio "${key}" loaded (${(buf.length / 1024).toFixed(1)} KB)`);
    } else {
        console.warn(`✗ Missing audio file: ${fn}`);
    }
}

console.log(`Total audio payload: ${(totalBytes / 1024).toFixed(1)} KB.`);

const jsContent = `/**
 * Official Command & Conquer: Generals Authentic Audio & Voice Responses
 * Extracted directly from retail Audio.big and AudioEnglish.big
 */
window.OFFICIAL_AUDIO_DATA = ${JSON.stringify(audioMap)};
window.OFFICIAL_AUDIO_CACHE = {};

function playOfficialSound(soundKey, volume = 0.8) {
    if (!window.OFFICIAL_AUDIO_DATA || !window.OFFICIAL_AUDIO_DATA[soundKey]) return;
    try {
        const audio = new Audio(window.OFFICIAL_AUDIO_DATA[soundKey]);
        audio.volume = Math.max(0, Math.min(1, volume));
        audio.play().catch(() => {});
    } catch (e) {}
}

function playUnitVoice(unitType, action = 'select') {
    const t = (unitType || '').toLowerCase();
    let key = '';
    if (t === 'crusader' || t === 'tank') key = 'voice_crusader_' + action;
    else if (t === 'paladin') key = 'voice_paladin_' + action;
    else if (t === 'ranger' || t === 'infantry') key = 'voice_ranger_' + action;
    else if (t === 'humvee') key = 'voice_humvee_' + action;
    else if (t === 'comanche') key = 'voice_comanche_' + action;
    else if (t === 'chinook') key = 'voice_chinook_' + (action === 'attack' ? 'move' : action);
    else if (t === 'raptor') key = 'voice_raptor_' + action;
    else if (t === 'aurora') key = 'voice_aurora_' + action;
    else if (t === 'dozer') key = 'voice_dozer_' + (action === 'attack' ? 'move' : action);
    else if (t === 'burton') key = 'voice_burton_' + action;
    else if (t === 'pathfinder') key = 'voice_pathfinder_' + action;

    if (key && window.OFFICIAL_AUDIO_DATA && window.OFFICIAL_AUDIO_DATA[key]) {
        playOfficialSound(key, 0.85);
    }
}
window.playOfficialSound = playOfficialSound;
window.playUnitVoice = playUnitVoice;
`;

const destPath = 'D:/C&C/src/js/05b_official_audio.js';
fs.writeFileSync(destPath, jsContent, 'utf8');
console.log(`Successfully generated ${destPath}`);
