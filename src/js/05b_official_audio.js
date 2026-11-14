// Official audio is stored in faction-specific catalogs so Skirmish downloads only what it needs.
window.OFFICIAL_AUDIO_DATA = {};
window.OFFICIAL_AUDIO_CACHE = {};
window.OFFICIAL_AUDIO_LOADS = {};

function getOfficialAudioGroup(soundKey, fallbackFaction = null) {
    if (soundKey.startsWith('sfx_')) return 'global';
    for (const faction of ['usa', 'china', 'gla']) {
        if (soundKey.includes('_' + faction + '_')) return faction;
    }
    if (soundKey.startsWith('voice_dozer_')) return 'usa';
    const faction = fallbackFaction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa') || 'usa';
    return ['usa', 'china', 'gla'].includes(faction.toLowerCase()) ? faction.toLowerCase() : 'usa';
}

function loadOfficialAudioGroup(group) {
    if (window.OFFICIAL_AUDIO_LOADS[group]) return window.OFFICIAL_AUDIO_LOADS[group];
    const embedded = window.OFFICIAL_AUDIO_EMBEDDED && window.OFFICIAL_AUDIO_EMBEDDED[group];
    if (embedded) {
        Object.assign(window.OFFICIAL_AUDIO_DATA, embedded);
        window.OFFICIAL_AUDIO_LOADS[group] = Promise.resolve(embedded);
        return window.OFFICIAL_AUDIO_LOADS[group];
    }
    const url = new URL('src/audio/' + group + '.json', document.baseURI);
    window.OFFICIAL_AUDIO_LOADS[group] = fetch(url).then(response => {
        if (!response.ok) throw new Error('Audio catalog request failed: ' + response.status);
        return response.json();
    }).then(entries => {
        Object.assign(window.OFFICIAL_AUDIO_DATA, entries);
        return entries;
    }).catch(error => {
        delete window.OFFICIAL_AUDIO_LOADS[group];
        console.warn('Could not load official audio catalog: ' + group, error);
        return {};
    });
    return window.OFFICIAL_AUDIO_LOADS[group];
}

function preloadSkirmishAudio(faction = null) {
    const playerFaction = (faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa') || 'usa').toLowerCase();
    return Promise.all([loadOfficialAudioGroup('global'), loadOfficialAudioGroup(['usa','china','gla'].includes(playerFaction) ? playerFaction : 'usa')]);
}

function playOfficialSound(soundKey, volume = 0.85, faction = null) {
    if (!soundKey) return;
    const play = () => {
        const data = window.OFFICIAL_AUDIO_DATA && window.OFFICIAL_AUDIO_DATA[soundKey];
        if (!data) return;
        try {
            const audio = new Audio(data);
            audio.volume = Math.max(0, Math.min(1, volume));
            const result = audio.play();
            if (result && result.catch) result.catch(() => {});
        } catch (error) { /* Audio is optional when unavailable. */ }
    };
    if (window.OFFICIAL_AUDIO_DATA && window.OFFICIAL_AUDIO_DATA[soundKey]) return play();
    loadOfficialAudioGroup(getOfficialAudioGroup(soundKey, faction)).then(play);
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
        `voice_${norm}_${act}_0`,
        `voice_${norm}_${act}_1`,
        `voice_${norm}_${act}`
    ];

    loadOfficialAudioGroup(getOfficialAudioGroup(candidates[0], fac)).then(entries => {
        const available = candidates.filter(key => entries[key]);
        if (available.length) {
            const chosen = available[Math.floor(Math.random() * available.length)];
            (window.playOfficialSound || playOfficialSound)(chosen, 0.90, fac);
        }
    });
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
    loadOfficialAudioGroup(fac).then(entries => {
        const hasUnitVoice = unitKey && entries[unitKey];
        const hasEvaVoice = entries[evaKey];
        const playSound = (typeof window !== 'undefined' && window.playOfficialSound) || playOfficialSound;
        if (hasUnitVoice && hasEvaVoice) {
            // Authentic mix: 60% unit callout, 40% faction EVA "Unit ready"
            playSound(Math.random() < 0.6 ? unitKey : evaKey, 0.95, fac);
        } else if (hasUnitVoice || hasEvaVoice) {
            playSound(hasUnitVoice ? unitKey : evaKey, 0.95, fac);
        } else if (typeof playUSASound === 'function') {
            playUSASound('construction');
        }
    });
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
    loadOfficialAudioGroup(fac).then(entries => {
        if (entries[evaKey]) playSound(evaKey, 0.95, fac);
        else if (typeof playUSASound === 'function') playUSASound('construction');
    });
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

    const evaKey = `eva_${fac}_${eventType}_${swSuffix}`;
    playSound(evaKey, 0.98);

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

window.loadOfficialAudioGroup = loadOfficialAudioGroup;
window.preloadSkirmishAudio = preloadSkirmishAudio;
window.playOfficialSound = playOfficialSound;
window.playUnitVoice = playUnitVoice;
window.playUnitReadySound = playUnitReadySound;
window.playBuildingCompleteSound = playBuildingCompleteSound;
window.playSuperweaponEvaAlert = playSuperweaponEvaAlert;
