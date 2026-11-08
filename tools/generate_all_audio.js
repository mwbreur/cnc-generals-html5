const fs = require('fs');
const path = require('path');

const bigPaths = [
    'D:/C&C/generals_big_files/SpeechEnglish.big',
    'D:/C&C/generals_big_files/AudioEnglish.big',
    'D:/C&C/generals_big_files/Audio.big',
    'D:/C&C/generals_big_files/Speech.big'
];

function buildBigIndices(paths) {
    const index = {};
    for (const bp of paths) {
        if (!fs.existsSync(bp)) continue;
        const fd = fs.openSync(bp, 'r');
        const header = Buffer.alloc(16);
        fs.readSync(fd, header, 0, 16, 0);
        const magic = header.toString('ascii', 0, 4);
        if (magic !== 'BIGF' && magic !== 'BIG4') {
            fs.closeSync(fd);
            continue;
        }
        const numFiles = header.readUInt32BE(8);
        const tableSize = header.readUInt32BE(12);
        const tableBuf = Buffer.alloc(tableSize);
        fs.readSync(fd, tableBuf, 0, tableSize, 16);
        let pos = 0;
        for (let i = 0; i < numFiles; i++) {
            if (pos >= tableBuf.length) break;
            const offset = tableBuf.readUInt32BE(pos);
            const size = tableBuf.readUInt32BE(pos + 4);
            pos += 8;
            let strEnd = pos;
            while (strEnd < tableBuf.length && tableBuf[strEnd] !== 0) strEnd++;
            const name = tableBuf.toString('ascii', pos, strEnd);
            pos = strEnd + 1;
            const base = name.replace(/.*[\\\/]/, '').toLowerCase();
            if (!index[base]) {
                index[base] = { bigPath: bp, offset, size };
            }
        }
        fs.closeSync(fd);
    }
    return index;
}

const soundFiles = {
    // Weapons & Combat SFX
    'sfx_cannon_crusader': 'vcruweaa.wav',
    'sfx_cannon_paladin': 'vpalweaa.wav',
    'sfx_rifle_ranger': 'iranweaa.wav',
    'sfx_missile_comanche': 'vcomweaa.wav',
    'sfx_missile_tomahawk': 'vtomweaa.wav',
    'sfx_explosion': 'bgendiea.wav',
    'sfx_click': 'umenucla.wav',

    // Official EVA Voice Announcements (Unit Ready & Construction Complete)
    'eva_usa_unit_ready': 'euunitr.wav',
    'eva_usa_construction_complete': 'euconst.wav',
    'eva_china_unit_ready': 'ecunitr.wav',
    'eva_china_construction_complete': 'ecconst.wav',
    'eva_gla_unit_ready': 'egunitr.wav',
    'eva_gla_construction_complete': 'egconst.wav',

    // USA Unit Creation Voice Callouts
    'voice_usa_crusader_create': 'vcrusef.wav',
    'voice_usa_paladin_create': 'vpalseg.wav',
    'voice_usa_ranger_create': 'iranseg.wav',
    'voice_usa_rocket_create': 'imissea.wav',
    'voice_usa_humvee_create': 'vhumseg.wav',
    'voice_usa_comanche_create': 'vcomsef.wav',
    'voice_usa_chinook_create': 'vchiseg.wav',
    'voice_usa_raptor_create': 'vrapseg.wav',
    'voice_usa_aurora_create': 'vaurseg.wav',
    'voice_usa_tomahawk_create': 'vtomsea.wav',
    'voice_usa_dozer_create': 'vdousej.wav',
    'voice_usa_burton_create': 'icolsei.wav',
    'voice_usa_pathfinder_create': 'ipatsef.wav',
    'voice_usa_stealthfighter_create': 'vstesea.wav',
    'voice_usa_ambulance_create': 'vambseg.wav',

    // USA Interactive Unit Voices (Select / Move / Attack)
    'voice_crusader_select': 'vcrusea.wav',
    'voice_crusader_move': 'vcrumoa.wav',
    'voice_crusader_attack': 'vcruata.wav',

    'voice_paladin_select': 'vpalsea.wav',
    'voice_paladin_move': 'vpalmoa.wav',
    'voice_paladin_attack': 'vpalata.wav',

    'voice_ranger_select': 'iransea.wav',
    'voice_ranger_move': 'iranmoa.wav',
    'voice_ranger_attack': 'iranata.wav',

    'voice_rocket_select': 'imisseb.wav',
    'voice_rocket_move': 'imismoa.wav',
    'voice_rocket_attack': 'imisata.wav',

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

    'voice_tomahawk_select': 'vtomsea.wav',
    'voice_tomahawk_move': 'vtommoa.wav',
    'voice_tomahawk_attack': 'vtomata.wav',

    'voice_dozer_select': 'vdousea.wav',
    'voice_dozer_move': 'vdoumoa.wav',
    'voice_dozer_build': 'vdoubua.wav',

    'voice_burton_select': 'icolsea.wav',
    'voice_burton_move': 'icolmoa.wav',
    'voice_burton_attack': 'icolata.wav',

    'voice_pathfinder_select': 'ipatsea.wav',
    'voice_pathfinder_move': 'ipatmoa.wav',
    'voice_pathfinder_attack': 'ipatata.wav',

    // China Unit Creation Voice Callouts
    'voice_china_redguard_create': 'iredseg.wav',
    'voice_china_tankhunter_create': 'itansef.wav',
    'voice_china_battlemaster_create': 'vbatsef.wav',
    'voice_china_gatling_create': 'vgatsef.wav',
    'voice_china_dragon_create': 'vdraseg.wav',
    'voice_china_crawler_create': 'vtrosef.wav',
    'voice_china_overlord_create': 'vovesed.wav',
    'voice_china_inferno_create': 'vinfsef.wav',
    'voice_china_nukecannon_create': 'vnuksef.wav',
    'voice_china_mig_create': 'vmigsef.wav',
    'voice_china_hacker_create': 'ihacsef.wav',
    'voice_china_blacklotus_create': 'iblasef.wav',
    'voice_china_dozer_create': 'vdocsef.wav',
    'voice_china_truck_create': 'vsupsef.wav',

    // GLA Unit Creation Voice Callouts
    'voice_gla_rebel_create': 'irebseh.wav',
    'voice_gla_rpg_create': 'irpgsef.wav',
    'voice_gla_terrorist_create': 'iterseg.wav',
    'voice_gla_worker_create': 'iworseh.wav',
    'voice_gla_scorpion_create': 'vscosef.wav',
    'voice_gla_technical_create': 'vtecath.wav',
    'voice_gla_quad_create': 'vquasee.wav',
    'voice_gla_toxintractor_create': 'vtoxseg.wav',
    'voice_gla_buggy_create': 'vrocseg.wav',
    'voice_gla_marauder_create': 'vmarsef.wav',
    'voice_gla_radarvan_create': 'vradsef.wav',
    'voice_gla_bombtruck_create': 'vbomseg.wav',
    'voice_gla_scud_create': 'vscuseg.wav',
    'voice_gla_hijacker_create': 'ihijsef.wav',
    'voice_gla_jarmen_create': 'ijarsec.wav',
    'voice_gla_mob_create': 'iangsela.wav'
};

console.log('Building index from BIG files...');
const bigIndex = buildBigIndices(bigPaths);
console.log(`Indexed ${Object.keys(bigIndex).length} total files.`);

const audioMap = {};
let totalBytes = 0;
let loadedCount = 0;

for (const [key, fn] of Object.entries(soundFiles)) {
    const entry = bigIndex[fn.toLowerCase()];
    if (entry) {
        const fd = fs.openSync(entry.bigPath, 'r');
        const buf = Buffer.alloc(entry.size);
        fs.readSync(fd, buf, 0, entry.size, entry.offset);
        fs.closeSync(fd);

        totalBytes += buf.length;
        audioMap[key] = 'data:audio/wav;base64,' + buf.toString('base64');
        loadedCount++;
        console.log(`✓ Audio "${key}" loaded from ${path.basename(entry.bigPath)} [${fn}] (${(buf.length / 1024).toFixed(1)} KB)`);
    } else {
        console.warn(`✗ Missing audio file: ${fn}`);
    }
}

console.log(`\nSuccessfully loaded ${loadedCount} / ${Object.keys(soundFiles).length} audio tracks.`);
console.log(`Total raw payload: ${(totalBytes / 1024).toFixed(1)} KB (~${(totalBytes * 1.33 / 1024 / 1024).toFixed(2)} MB in Base64).`);

const jsContent = `/**
 * Official Command & Conquer: Generals Authentic Audio & Voice Responses
 * Extracted directly from retail Audio.big, AudioEnglish.big, and SpeechEnglish.big
 * Features Faction-Specific EVA Unit Ready / Construction Complete announcements
 * and authentic unit creation callout voice lines for USA, China, and GLA.
 */
window.OFFICIAL_AUDIO_DATA = ${JSON.stringify(audioMap)};
window.OFFICIAL_AUDIO_CACHE = {};

function playOfficialSound(soundKey, volume = 0.85) {
    if (!window.OFFICIAL_AUDIO_DATA || !window.OFFICIAL_AUDIO_DATA[soundKey]) return;
    try {
        const audio = new Audio(window.OFFICIAL_AUDIO_DATA[soundKey]);
        audio.volume = Math.max(0, Math.min(1, volume));
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(() => {});
        }
    } catch (e) {}
}

function playUnitVoice(unitType, action = 'select', faction = null) {
    const fac = (faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa') || 'usa').toLowerCase();
    const t = (unitType || '').toLowerCase();
    let key = '';

    if (t.includes('crusader') || t === 'tank') key = 'voice_crusader_' + action;
    else if (t.includes('paladin')) key = 'voice_paladin_' + action;
    else if (t.includes('ranger') || t.includes('infantry')) key = 'voice_ranger_' + action;
    else if (t.includes('rocket') || t.includes('missile')) key = 'voice_rocket_' + action;
    else if (t.includes('humvee')) key = 'voice_humvee_' + action;
    else if (t.includes('comanche')) key = 'voice_comanche_' + action;
    else if (t.includes('chinook') || (t.includes('truck') && fac === 'usa')) key = 'voice_chinook_' + (action === 'attack' ? 'move' : action);
    else if (t.includes('raptor')) key = 'voice_raptor_' + action;
    else if (t.includes('aurora')) key = 'voice_aurora_' + action;
    else if (t.includes('tomahawk')) key = 'voice_tomahawk_' + action;
    else if (t.includes('dozer') || t.includes('builder')) key = 'voice_dozer_' + (action === 'attack' ? 'move' : action);
    else if (t.includes('burton')) key = 'voice_burton_' + action;
    else if (t.includes('pathfinder')) key = 'voice_pathfinder_' + action;

    if (key && window.OFFICIAL_AUDIO_DATA && window.OFFICIAL_AUDIO_DATA[key]) {
        (window.playOfficialSound || playOfficialSound)(key, 0.88);
    }
}

/**
 * Authentic C&C Generals Unit Ready Announcement
 * Plays faction-specific EVA ("Unit ready" / "Unit is ready" / "Our unit is ready")
 * or the unit's authentic Westwood deployment callout voice line.
 */
function playUnitReadySound(unitType, faction = null) {
    const fac = (faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa') || 'usa').toLowerCase();
    const t = (unitType || '').toLowerCase();

    let unitKey = null;
    if (fac === 'usa') {
        if (t.includes('crusader') || t === 'tank') unitKey = 'voice_usa_crusader_create';
        else if (t.includes('paladin')) unitKey = 'voice_usa_paladin_create';
        else if (t.includes('ranger') || t.includes('infantry')) unitKey = 'voice_usa_ranger_create';
        else if (t.includes('rocket') || t.includes('missile')) unitKey = 'voice_usa_rocket_create';
        else if (t.includes('humvee')) unitKey = 'voice_usa_humvee_create';
        else if (t.includes('comanche')) unitKey = 'voice_usa_comanche_create';
        else if (t.includes('chinook') || t.includes('truck')) unitKey = 'voice_usa_chinook_create';
        else if (t.includes('raptor')) unitKey = 'voice_usa_raptor_create';
        else if (t.includes('stealth')) unitKey = 'voice_usa_stealthfighter_create';
        else if (t.includes('aurora')) unitKey = 'voice_usa_aurora_create';
        else if (t.includes('tomahawk')) unitKey = 'voice_usa_tomahawk_create';
        else if (t.includes('dozer') || t.includes('builder')) unitKey = 'voice_usa_dozer_create';
        else if (t.includes('burton')) unitKey = 'voice_usa_burton_create';
        else if (t.includes('pathfinder')) unitKey = 'voice_usa_pathfinder_create';
        else if (t.includes('ambulance')) unitKey = 'voice_usa_ambulance_create';
    } else if (fac === 'china') {
        if (t.includes('redguard') || t.includes('infantry')) unitKey = 'voice_china_redguard_create';
        else if (t.includes('tankhunter') || t.includes('rocket')) unitKey = 'voice_china_tankhunter_create';
        else if (t.includes('hacker')) unitKey = 'voice_china_hacker_create';
        else if (t.includes('blacklotus')) unitKey = 'voice_china_blacklotus_create';
        else if (t.includes('battlemaster') || t === 'tank') unitKey = 'voice_china_battlemaster_create';
        else if (t.includes('dragon')) unitKey = 'voice_china_dragon_create';
        else if (t.includes('gatling')) unitKey = 'voice_china_gatling_create';
        else if (t.includes('crawler')) unitKey = 'voice_china_crawler_create';
        else if (t.includes('overlord')) unitKey = 'voice_china_overlord_create';
        else if (t.includes('inferno')) unitKey = 'voice_china_inferno_create';
        else if (t.includes('nuke')) unitKey = 'voice_china_nukecannon_create';
        else if (t.includes('mig') || t.includes('raptor')) unitKey = 'voice_china_mig_create';
        else if (t.includes('truck')) unitKey = 'voice_china_truck_create';
        else if (t.includes('dozer') || t.includes('builder')) unitKey = 'voice_china_dozer_create';
    } else if (fac === 'gla') {
        if (t.includes('rebel') || t.includes('infantry')) unitKey = 'voice_gla_rebel_create';
        else if (t.includes('rpg') || t.includes('rocket')) unitKey = 'voice_gla_rpg_create';
        else if (t.includes('terrorist')) unitKey = 'voice_gla_terrorist_create';
        else if (t.includes('mob')) unitKey = 'voice_gla_mob_create';
        else if (t.includes('hijacker')) unitKey = 'voice_gla_hijacker_create';
        else if (t.includes('jarmen')) unitKey = 'voice_gla_jarmen_create';
        else if (t.includes('technical')) unitKey = 'voice_gla_technical_create';
        else if (t.includes('scorpion') || t === 'tank') unitKey = 'voice_gla_scorpion_create';
        else if (t.includes('marauder')) unitKey = 'voice_gla_marauder_create';
        else if (t.includes('quad')) unitKey = 'voice_gla_quad_create';
        else if (t.includes('toxin')) unitKey = 'voice_gla_toxintractor_create';
        else if (t.includes('buggy')) unitKey = 'voice_gla_buggy_create';
        else if (t.includes('bombtruck')) unitKey = 'voice_gla_bombtruck_create';
        else if (t.includes('scud')) unitKey = 'voice_gla_scud_create';
        else if (t.includes('radar')) unitKey = 'voice_gla_radarvan_create';
        else if (t.includes('worker') || t.includes('builder') || t.includes('truck')) unitKey = 'voice_gla_worker_create';
    }

    const evaKey = 'eva_' + fac + '_unit_ready';
    const hasUnitVoice = unitKey && window.OFFICIAL_AUDIO_DATA && window.OFFICIAL_AUDIO_DATA[unitKey];
    const hasEvaVoice = window.OFFICIAL_AUDIO_DATA && window.OFFICIAL_AUDIO_DATA[evaKey];

    const playSound = (typeof window !== 'undefined' && window.playOfficialSound) || playOfficialSound;
    if (hasUnitVoice && hasEvaVoice) {
        // Authentic mix: 60% unit callout, 40% faction EVA "Unit ready"
        const chosen = (Math.random() < 0.6) ? unitKey : evaKey;
        playSound(chosen, 0.95);
    } else if (hasUnitVoice) {
        playSound(unitKey, 0.95);
    } else if (hasEvaVoice) {
        playSound(evaKey, 0.95);
    } else {
        if (typeof playUSASound === 'function') playUSASound('construction');
    }
}

/**
 * Authentic C&C Generals Construction Complete Announcement
 * USA: "Construction complete" (euconst.wav)
 * China: "Building complete" (ecconst.wav)
 * GLA: "Building complete" (egconst.wav)
 */
function playBuildingCompleteSound(structureType, faction = null) {
    const fac = (faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa') || 'usa').toLowerCase();
    const evaKey = 'eva_' + fac + '_construction_complete';
    const playSound = (typeof window !== 'undefined' && window.playOfficialSound) || playOfficialSound;
    if (window.OFFICIAL_AUDIO_DATA && window.OFFICIAL_AUDIO_DATA[evaKey]) {
        playSound(evaKey, 0.95);
    } else {
        if (typeof playUSASound === 'function') playUSASound('construction');
    }
}

window.playOfficialSound = playOfficialSound;
window.playUnitVoice = playUnitVoice;
window.playUnitReadySound = playUnitReadySound;
window.playBuildingCompleteSound = playBuildingCompleteSound;
`;

const destPath = 'D:/C&C/src/js/05b_official_audio.js';
fs.writeFileSync(destPath, jsContent, 'utf8');
console.log(`Successfully generated ${destPath}`);
