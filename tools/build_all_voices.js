const fs = require('fs');
const path = require('path');
const { loadCatalog, writeAudioCatalog } = require('./audio_catalog');
const projectRoot = path.resolve(__dirname, '..');

// 1. Load existing audio entries from the faction catalogs.
const audioMap = Object.assign({}, ...Object.values(loadCatalog()));
console.log(`Loaded ${Object.keys(audioMap).length} existing audio keys from catalogs.`);

// 2. Index big files
const bigPaths = [
    path.join(projectRoot, 'generals_big_files', 'AudioEnglish.big'),
    path.join(projectRoot, 'generals_big_files', 'SpeechEnglish.big'),
    path.join(projectRoot, 'generals_big_files', 'Audio.big')
];

const bigIndex = {};
for (const bp of bigPaths) {
    if (!fs.existsSync(bp)) continue;
    const buf = fs.readFileSync(bp);
    const magic = buf.toString('latin1', 0, 4);
    if (magic !== 'BIGF' && magic !== 'BIG4') continue;
    const numFiles = buf.readUInt32BE(8);
    let pos = 16;
    for (let i = 0; i < numFiles; i++) {
        const offset = buf.readUInt32BE(pos);
        const size = buf.readUInt32BE(pos + 4);
        pos += 8;
        let strEnd = pos;
        while (buf[strEnd] !== 0) strEnd++;
        const name = buf.toString('latin1', pos, strEnd);
        pos = strEnd + 1;
        const base = path.basename(name).toLowerCase();
        if (!bigIndex[base]) {
            bigIndex[base] = { buf, offset, size };
        }
    }
}
console.log(`Indexed ${Object.keys(bigIndex).length} files from .big archives.`);

// 3. Define all 42 units and prefixes
const unitPrefixes = {
    // USA
    crusader: 'vcru',
    paladin: 'vpal',
    ranger: 'iran',
    rocket: 'imis',
    humvee: 'vhum',
    ambulance: 'vamb',
    tomahawk: 'vtom',
    dozer_usa: 'vdoc',
    chinook: 'vchi',
    comanche: 'vcom',
    raptor: 'vrap',
    stealthfighter: 'vste',
    aurora: 'vaur',
    burton: 'icol',
    pathfinder: 'ipat',

    // China
    battlemaster: 'vbat',
    overlord: 'vove',
    gatling: 'vgat',
    dragon: 'vdra',
    crawler: 'vtro',
    inferno: 'vinf',
    nukecannon: 'vnuk',
    dozer_china: 'vdou',
    mig: 'vmig',
    redguard: 'ired',
    tankhunter: 'itan',
    hacker: 'ihac',
    lotus: 'ibla',

    // GLA
    rebel: 'ireb',
    rpg: 'irpg',
    terrorist: 'iter',
    jarmen: 'ijar',
    worker: 'iwor',
    scorpion: 'vsco',
    marauder: 'vmar',
    technical: 'vtec',
    quad: 'vqua',
    buggy: 'vroc',
    toxintractor: 'vtox',
    bombtruck: 'vbom',
    scud: 'vscu',
    radarvan: 'vrad'
};

function extractBase64(filename) {
    const entry = bigIndex[filename.toLowerCase()];
    if (!entry) return null;
    const slice = entry.buf.subarray(entry.offset, entry.offset + entry.size);
    return 'data:audio/wav;base64,' + slice.toString('base64');
}

let addedCount = 0;

for (const [unit, prefix] of Object.entries(unitPrefixes)) {
    // Select variations: sea, seb
    const sel0 = extractBase64(prefix + 'sea.wav');
    const sel1 = extractBase64(prefix + 'seb.wav');
    if (sel0) { audioMap[`voice_${unit}_select_0`] = sel0; audioMap[`voice_${unit}_select`] = sel0; addedCount++; }
    if (sel1) { audioMap[`voice_${unit}_select_1`] = sel1; addedCount++; }

    // Move variations: moa, mob
    const mov0 = extractBase64(prefix + 'moa.wav');
    const mov1 = extractBase64(prefix + 'mob.wav');
    if (mov0) { audioMap[`voice_${unit}_move_0`] = mov0; audioMap[`voice_${unit}_move`] = mov0; addedCount++; }
    if (mov1) { audioMap[`voice_${unit}_move_1`] = mov1; addedCount++; }

    // Attack variations (for combat units): ata, atb
    if (['dozer_usa', 'dozer_china', 'worker'].includes(unit)) {
        const bu0 = extractBase64(prefix + 'bua.wav');
        const bu1 = extractBase64(prefix + 'bub.wav');
        if (bu0) { audioMap[`voice_${unit}_build_0`] = bu0; audioMap[`voice_${unit}_build`] = bu0; addedCount++; }
        if (bu1) { audioMap[`voice_${unit}_build_1`] = bu1; addedCount++; }
    } else if (!['ambulance', 'chinook', 'radarvan'].includes(unit)) {
        const atk0 = extractBase64(prefix + 'ata.wav');
        const atk1 = extractBase64(prefix + 'atb.wav');
        if (atk0) { audioMap[`voice_${unit}_attack_0`] = atk0; audioMap[`voice_${unit}_attack`] = atk0; addedCount++; }
        if (atk1) { audioMap[`voice_${unit}_attack_1`] = atk1; addedCount++; }
    }
}

console.log(`Added ${addedCount} multi-variation voice clips. Total audio keys: ${Object.keys(audioMap).length}.`);

// 4. Generate the enhanced 05b_official_audio.js
const jsContent = `/**
 * Official Command & Conquer: Generals Authentic Audio & Voice Responses
 * Extracted directly from retail Audio.big, AudioEnglish.big, and SpeechEnglish.big
 * Features Faction-Specific EVA Unit Ready / Construction Complete announcements,
 * Multi-Variation Voice Lines (Select, Move, Attack, Build) across all USA, China, and GLA units,
 * and Superweapon Buildup / Strike SFX & EVA Alerts.
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

/**
 * Authentic Unit Voice Lines with Multiple Random Variations
 * Handles selection, movement, attack commands, and building dispatch across all factions.
 */
function playUnitVoice(unitType, action = 'select', faction = null) {
    if (!unitType) return;
    const fac = (faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa') || 'usa').toLowerCase();
    const t = (unitType || '').toLowerCase();
    let norm = t;

    // Normalize generic unit types based on faction
    if (t === 'tank') {
        norm = fac === 'china' ? 'battlemaster' : (fac === 'gla' ? 'scorpion' : 'crusader');
    } else if (t === 'infantry') {
        norm = fac === 'china' ? 'redguard' : (fac === 'gla' ? 'rebel' : 'ranger');
    } else if (t === 'rocket') {
        norm = fac === 'china' ? 'tankhunter' : (fac === 'gla' ? 'rpg' : 'rocket');
    } else if (t.includes('dozer') || t.includes('builder')) {
        norm = fac === 'china' ? 'dozer_china' : (fac === 'gla' ? 'worker' : 'dozer_usa');
    } else if (t.includes('crusader')) norm = 'crusader';
    else if (t.includes('paladin')) norm = 'paladin';
    else if (t.includes('ranger')) norm = 'ranger';
    else if (t.includes('missile')) norm = 'rocket';
    else if (t.includes('humvee')) norm = 'humvee';
    else if (t.includes('ambulance')) norm = 'ambulance';
    else if (t.includes('comanche')) norm = 'comanche';
    else if (t.includes('chinook')) norm = 'chinook';
    else if (t.includes('raptor')) norm = 'raptor';
    else if (t.includes('stealth')) norm = 'stealthfighter';
    else if (t.includes('aurora')) norm = 'aurora';
    else if (t.includes('tomahawk')) norm = 'tomahawk';
    else if (t.includes('burton')) norm = 'burton';
    else if (t.includes('pathfinder')) norm = 'pathfinder';
    else if (t.includes('battlemaster')) norm = 'battlemaster';
    else if (t.includes('overlord')) norm = 'overlord';
    else if (t.includes('gatling')) norm = 'gatling';
    else if (t.includes('dragon')) norm = 'dragon';
    else if (t.includes('crawler')) norm = 'crawler';
    else if (t.includes('inferno')) norm = 'inferno';
    else if (t.includes('nuke')) norm = 'nukecannon';
    else if (t.includes('mig')) norm = 'mig';
    else if (t.includes('redguard')) norm = 'redguard';
    else if (t.includes('tankhunter')) norm = 'tankhunter';
    else if (t.includes('hacker')) norm = 'hacker';
    else if (t.includes('lotus')) norm = 'lotus';
    else if (t.includes('rebel')) norm = 'rebel';
    else if (t.includes('rpg')) norm = 'rpg';
    else if (t.includes('terrorist')) norm = 'terrorist';
    else if (t.includes('jarmen')) norm = 'jarmen';
    else if (t.includes('worker')) norm = 'worker';
    else if (t.includes('scorpion')) norm = 'scorpion';
    else if (t.includes('marauder')) norm = 'marauder';
    else if (t.includes('technical')) norm = 'technical';
    else if (t.includes('quad')) norm = 'quad';
    else if (t.includes('buggy')) norm = 'buggy';
    else if (t.includes('toxin')) norm = 'toxintractor';
    else if (t.includes('bombtruck')) norm = 'bombtruck';
    else if (t.includes('scud')) norm = 'scud';
    else if (t.includes('radar')) norm = 'radarvan';

    let act = (action || 'select').toLowerCase();
    // Non-combat units re-route attack to move
    if (act === 'attack' && (norm === 'dozer_usa' || norm === 'dozer_china' || norm === 'worker' || norm === 'chinook' || norm === 'ambulance' || norm === 'radarvan')) {
        act = 'move';
    }

    // Candidate keys: random variation _0 or _1, fallback to base
    const candidates = [
        \`voice_\${norm}_\${act}_0\`,
        \`voice_\${norm}_\${act}_1\`,
        \`voice_\${norm}_\${act}\`
    ];

    const available = candidates.filter(k => window.OFFICIAL_AUDIO_DATA && window.OFFICIAL_AUDIO_DATA[k]);
    if (available.length > 0) {
        const chosen = available[Math.floor(Math.random() * available.length)];
        (window.playOfficialSound || playOfficialSound)(chosen, 0.90);
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
    const sType = (structureType || '').toLowerCase();
    const playSound = (typeof window !== 'undefined' && window.playOfficialSound) || playOfficialSound;
    if (sType === 'particlecannon' || sType === 'nukesilo' || sType === 'scudstorm') {
        playSuperweaponEvaAlert(structureType, 'detected', fac);
        return;
    }
    const evaKey = 'eva_' + fac + '_construction_complete';
    if (window.OFFICIAL_AUDIO_DATA && window.OFFICIAL_AUDIO_DATA[evaKey]) {
        playSound(evaKey, 0.95);
    } else {
        if (typeof playUSASound === 'function') playUSASound('construction');
    }
}

/**
 * Plays official EVA superweapon alerts ("Warning: Particle Cannon activated",
 * "Warning: Nuclear Missile launched", "Warning: Scud Storm launched", etc.)
 * and authentic superweapon sirens/klaxons from Audio.big & SpeechEnglish.big.
 */
function playSuperweaponEvaAlert(swType, eventType = 'launched', faction = null) {
    const fac = (faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa') || 'usa').toLowerCase();
    const playSound = (typeof window !== 'undefined' && window.playOfficialSound) || playOfficialSound;
    const t = (swType || '').toLowerCase();
    let swSuffix = 'particle';
    if (t.includes('nuke')) swSuffix = 'nuke';
    else if (t.includes('scud')) swSuffix = 'scud';

    const evaKey = \`eva_\${fac}_\${eventType}_\${swSuffix}\`;
    if (window.OFFICIAL_AUDIO_DATA && window.OFFICIAL_AUDIO_DATA[evaKey]) {
        playSound(evaKey, 0.98);
    }

    if (eventType === 'launched') {
        if (swSuffix === 'nuke') {
            playSound('sfx_nuke_siren', 0.92);
        } else if (swSuffix === 'scud') {
            playSound('sfx_scud_alarm', 0.92);
        } else {
            playSound('sfx_particle_charge', 0.92);
        }
    } else if (eventType === 'ready') {
        if (swSuffix === 'scud') playSound('sfx_scud_ready', 0.90);
        else if (swSuffix === 'nuke') playSound('sfx_nuke_select', 0.90);
        else playSound('sfx_particle_select', 0.90);
    }
}

window.playOfficialSound = playOfficialSound;
window.playUnitVoice = playUnitVoice;
window.playUnitReadySound = playUnitReadySound;
window.playBuildingCompleteSound = playBuildingCompleteSound;
window.playSuperweaponEvaAlert = playSuperweaponEvaAlert;
`;

const catalogSizes = writeAudioCatalog(audioMap);
console.log(`Merged voice variations into faction catalogs: ${JSON.stringify(catalogSizes)}`);
