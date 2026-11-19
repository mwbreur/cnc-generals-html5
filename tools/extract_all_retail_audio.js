const fs = require('fs');
const path = require('path');
const { writeAudioCatalog } = require('./audio_catalog');

const root = path.resolve(__dirname, '..');
const bigPaths = [
    path.join(root, 'generals_big_files', 'Audio.big'),
    path.join(root, 'generals_big_files', 'AudioZH.big'),
    path.join(root, 'generals_big_files', 'AudioEnglish.big'),
    path.join(root, 'generals_big_files', 'AudioEnglishZH.big'),
    path.join(root, 'generals_big_files', 'SpeechEnglish.big'),
    path.join(root, 'generals_big_files', 'SpeechEnglishZH.big'),
    path.join(root, 'generals_big_files', 'Speech.big'),
    path.join(root, 'generals_big_files', 'SpeechZH.big')
];

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
            const name = buf.toString('ascii', pos, end);
            pos = end + 1;
            const base = name.replace(/.*[\\\/]/, '').toLowerCase();
            if (!index[base]) {
                index[base] = { buf, off, size };
            }
        }
    }
    return index;
}

const soundFiles = {
    // Combat & Weapon SFX (global.json)
    'sfx_humvee_mg': 'vhumweaa.wav',
    'sfx_comanche_cannon': 'vcomwe2a.wav',
    'sfx_missile_defender': 'imisweaa.wav',
    'sfx_sniper_rifle': 'ijarwe1a.wav',
    'sfx_jarmen_snipe': 'ijarwe2a.wav',
    'sfx_burton_rifle': 'vsenweaa.wav',
    'sfx_pdl_laser': 'vpalwe2a.wav',
    'sfx_jet_missile': 'vmigweaa.wav',
    'sfx_c130_flyover': 'v130lo2a.wav',
    'sfx_parachute_open': 'gparacha.wav',
    'sfx_daisycutter_drop': 'vdaiweaa.wav',
    'sfx_daisycutter_blast': 'gexpdaia.wav',
    'sfx_spectre_gatling_0': 'vspewe1a.wav',
    'sfx_spectre_gatling_1': 'vspewe1b.wav',
    'sfx_spectre_gatling_2': 'vspewe1c.wav',
    'sfx_spectre_howitzer_0': 'bstrweaa.wav',
    'sfx_spectre_howitzer_1': 'bstrweab.wav',
    'sfx_cannon_battlemaster_0': 'vbatweaa.wav',
    'sfx_cannon_battlemaster_1': 'vbatweab.wav',
    'sfx_gatling_fire_0': 'bgatweaa.wav',
    'sfx_gatling_fire_1': 'bgatweab.wav',
    'sfx_gatling_fire_2': 'bgatweac.wav',
    'sfx_dragon_flame': 'vdralo2a.wav',
    'sfx_cannon_inferno': 'vinfweaa.wav',
    'sfx_rifle_redguard_0': 'iredweaa.wav',
    'sfx_rifle_redguard_1': 'iredweab.wav',
    'sfx_tankhunter_rocket': 'itanweaa.wav',
    'sfx_carpet_bomb_0': 'gexpcara.wav',
    'sfx_carpet_bomb_1': 'gexpcarb.wav',
    'sfx_carpet_bomb_2': 'gexpcarc.wav',
    'sfx_cannon_scorpion_0': 'vscoweaa.wav',
    'sfx_cannon_scorpion_1': 'vscoweab.wav',
    'sfx_scorpion_missile': 'vscowe2a.wav',
    'sfx_cannon_marauder_0': 'vmarweaa.wav',
    'sfx_cannon_marauder_1': 'vmarweab.wav',
    'sfx_technical_mg_0': 'vtecweaa.wav',
    'sfx_technical_mg_1': 'vtecweab.wav',
    'sfx_quad_cannon_0': 'vquaweaa.wav',
    'sfx_quad_cannon_1': 'vquaweab.wav',
    'sfx_quad_cannon_2': 'vquaweac.wav',
    'sfx_buggy_rocket_0': 'vrocweaa.wav',
    'sfx_buggy_rocket_1': 'vrocweab.wav',
    'sfx_buggy_rocket_2': 'vrocweac.wav',
    'sfx_toxin_spray': 'vtoxlo2a.wav',
    'sfx_scud_launch': 'vscuweaa.wav',
    'sfx_rifle_rebel_0': 'irebweaa.wav',
    'sfx_rifle_rebel_1': 'irebweab.wav',
    'sfx_rpg_launch_0': 'irpgweaa.wav',
    'sfx_rpg_launch_1': 'irpgweab.wav',
    'sfx_stinger_fire_0': 'bstiweaa.wav',
    'sfx_stinger_fire_1': 'bstiweab.wav',
    'sfx_salvage_pickup': 'gsalvage.wav',
    'sfx_infantry_squish': 'ginfcrua.wav',
    'sfx_place_building': 'gconst1a.wav',
    'sfx_radar_alert': 'uwarning.wav',
    'sfx_radar_ping': 'uradarpi.wav',
    'sfx_radar_on': 'gradarup.wav',
    'sfx_power_down': 'gpowerdn.wav',
    'sfx_power_up': 'gpowerup.wav',
    'sfx_mine_place': 'gminepla.wav',

    // Building Selection SFX (global.json)
    'sfx_select_usa_center': 'bcmasela.wav',
    'sfx_select_usa_power': 'bcolsela.wav',
    'sfx_select_usa_barracks': 'bbaasela.wav',
    'sfx_select_usa_factory': 'bwaasela.wav',
    'sfx_select_usa_supply': 'bsuasela.wav',
    'sfx_select_usa_supplydrop': 'bsupsela.wav',
    'sfx_select_usa_airfield': 'baiasela.wav',
    'sfx_select_usa_strategy': 'bstrsela.wav',
    'sfx_select_usa_detention': 'bdetsela.wav',
    'sfx_select_usa_particle': 'bparsela.wav',

    'sfx_select_china_center': 'bcmcsela.wav',
    'sfx_select_china_power': 'bnursela.wav',
    'sfx_select_china_barracks': 'bbacsela.wav',
    'sfx_select_china_factory': 'bwacsela.wav',
    'sfx_select_china_supply': 'bsucsela.wav',
    'sfx_select_china_airfield': 'baicsela.wav',
    'sfx_select_china_gatling': 'bgatsela.wav',
    'sfx_select_china_bunker': 'bbunsela.wav',
    'sfx_select_china_speaker': 'bspesela.wav',
    'sfx_select_china_propaganda': 'bprosela.wav',
    'sfx_select_china_nuke': 'bnumsela.wav',
    'sfx_select_china_internet': 'bintsela.wav',

    'sfx_select_gla_center': 'bcmgsela.wav',
    'sfx_select_gla_barracks': 'bbagsela.wav',
    'sfx_select_gla_factory': 'bwagsela.wav',
    'sfx_select_gla_supply': 'bsugsela.wav',
    'sfx_select_gla_tunnel': 'btunsela.wav',
    'sfx_select_gla_stinger': 'bstisela.wav',
    'sfx_select_gla_palace': 'bpalsela.wav',
    'sfx_select_gla_blackmarket': 'bblasela.wav',
    'sfx_select_gla_scud': 'bscusela.wav',

    // Official EVA Voices (usa.json, china.json, gla.json)
    'eva_usa_insufficient_funds': 'eufunds.wav',
    'eva_usa_low_power': 'eupower.wav',
    'eva_usa_upgrade_complete': 'euupgra.wav',
    'eva_usa_unit_lost': 'euunitl.wav',
    'eva_usa_victory': 'euplvic.wav',
    'eva_usa_defeat': 'eupldef.wav',
    'eva_usa_select_target': 'euselec.wav',

    'eva_china_insufficient_funds': 'ecfunds.wav',
    'eva_china_low_power': 'ecpower.wav',
    'eva_china_upgrade_complete': 'ecupgra.wav',
    'eva_china_unit_lost': 'ecunitl.wav',
    'eva_china_victory': 'ecplvic.wav',
    'eva_china_defeat': 'ecpldef.wav',
    'eva_china_select_target': 'ecselec.wav',

    'eva_gla_insufficient_funds': 'egfunds.wav',
    'eva_gla_low_power': 'egpower.wav',
    'eva_gla_upgrade_complete': 'egupgra.wav',
    'eva_gla_unit_lost': 'egunitl.wav',
    'eva_gla_victory': 'egplvic.wav',
    'eva_gla_defeat': 'egpldef.wav',
    'eva_gla_select_target': 'egselec.wav'
};

const index = buildBigIndex(bigPaths);
const additions = {};
const missing = [];
for (const [key, wavName] of Object.entries(soundFiles)) {
    const entry = index[wavName.toLowerCase()];
    if (!entry || entry.size === 0) {
        missing.push(`${key} (${wavName})`);
        continue;
    }
    const wavBuf = entry.buf.subarray(entry.off, entry.off + entry.size);
    additions[key] = 'data:audio/wav;base64,' + wavBuf.toString('base64');
}

if (missing.length > 0) {
    throw new Error('Missing retail WAV files: ' + missing.join(', '));
}

const counts = writeAudioCatalog(additions);
console.log(`Merged ${Object.keys(additions).length} official WAV clips cleanly! Catalog counts:`, JSON.stringify(counts));
