const fs = require('fs');
const path = require('path');
const { writeAudioCatalog } = require('./audio_catalog');

const root = path.resolve(__dirname, '..');
const bigPaths = [
    path.join(root, 'generals_big_files', 'AudioZH.big'),
    path.join(root, 'generals_big_files', 'Audio.big'),
    path.join(root, 'generals_big_files', 'AudioEnglishZH.big'),
    path.join(root, 'generals_big_files', 'AudioEnglish.big'),
    path.join(root, 'generals_big_files', 'SpeechEnglishZH.big'),
    path.join(root, 'generals_big_files', 'SpeechEnglish.big'),
    path.join(root, 'generals_big_files', 'SpeechZH.big'),
    path.join(root, 'generals_big_files', 'Speech.big')
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
    // Explosions, Impacts & Debris
    'sfx_expl_small_0': 'gexpdira.wav',
    'sfx_expl_small_1': 'gexpdirb.wav',
    'sfx_expl_small_2': 'gexpdirc.wav',
    'sfx_expl_missile_0': 'gexpifva.wav',
    'sfx_expl_missile_1': 'gexpifvb.wav',
    'sfx_expl_missile_2': 'gexpifvc.wav',
    'sfx_expl_vehicle_0': 'vgendieg.wav',
    'sfx_expl_vehicle_1': 'vgendieh.wav',
    'sfx_expl_vehicle_2': 'vgendiei.wav',
    'sfx_expl_building_0': 'gbuidiea.wav',
    'sfx_expl_building_1': 'gbuidieb.wav',
    'sfx_expl_artillery_0': 'gexparta.wav',
    'sfx_expl_artillery_1': 'gexpartb.wav',
    'sfx_expl_artillery_2': 'gexpartc.wav',
    'sfx_expl_fire_0': 'gexpfira.wav',
    'sfx_expl_fire_1': 'gexpfirb.wav',
    'sfx_expl_flashbang_0': 'gexpflaa.wav',
    'sfx_expl_flashbang_1': 'gexpflab.wav',
    'sfx_expl_neutron_0': 'gexpneua.wav',
    'sfx_expl_neutron_1': 'gexpneub.wav',
    'sfx_expl_mininuke': 'gexpnuka.wav',
    'sfx_expl_emp_0': 'gexpempa.wav',
    'sfx_expl_emp_1': 'gexpempb.wav',
    'sfx_impact_vehicle_0': 'gvehim2a.wav',
    'sfx_impact_vehicle_1': 'gvehim2b.wav',
    'sfx_impact_building_0': 'gbuiim2a.wav',
    'sfx_impact_building_1': 'gbuiim2b.wav',
    'sfx_debris_vehicle_0': 'gvehdeba.wav',
    'sfx_debris_vehicle_1': 'gvehdebb.wav',
    'sfx_debris_building_0': 'gbuideba.wav',
    'sfx_debris_building_1': 'gbuidebb.wav',
    'sfx_shell_whistle_0': 'gshescra.wav',
    'sfx_shell_whistle_1': 'gshescrb.wav',
    'sfx_demo_beep': 'gdembeep.wav',
    'sfx_mine_detonate': 'gminecla.wav',
    'sfx_unit_promoted': 'gunitpra.wav',
    'sfx_jarmen_snipe_hit': 'gvehsnia.wav',
    'sfx_fire_start': 'gfiresta.wav',

    // Special Weapons & General Powers
    'sfx_a10_dive_0': 'va10diva.wav',
    'sfx_a10_dive_1': 'va10divb.wav',
    'sfx_a10_flyby': 'va10lo2a.wav',
    'sfx_nuke_doors': 'bneutrea.wav',
    'sfx_nuke_launch': 'bneutlau.wav',
    'sfx_particle_annihilate': 'sparlo4b.wav',
    'sfx_anthrax_blast': 'santexpl.wav',
    'sfx_anthrax_hiss': 'gantlo2a.wav',
    'sfx_artillery_fire': 'sartweaa.wav',
    'sfx_cluster_mines': 'scluster.wav',
    'sfx_emp_pulse': 'sempexpl.wav',
    'sfx_cash_hack': 'scashhac.wav',
    'sfx_frenzy': 'sfrenzya.wav',
    'sfx_emergency_repair': 'srepaira.wav',
    'sfx_spy_drone': 'sspysate.wav',
    'sfx_radar_scan': 'vradscan.wav',
    'sfx_rebel_ambush': 'sambusha.wav',
    'sfx_sneak_attack': 'ssneakat.wav',
    'sfx_gps_scrambler': 'sscrambl.wav',

    // Interface & Garrison SFX
    'sfx_gui_combo': 'umenuclb.wav',
    'sfx_gui_blip': 'umenuclc.wav',
    'sfx_gui_msg': 'umenucld.wav',
    'sfx_gui_error': 'umenucle.wav',
    'sfx_gui_slider': 'uslider.wav',
    'sfx_cash_up': 'ucredupa.wav',
    'sfx_cash_down': 'ucreddna.wav',
    'sfx_rally_set': 'uralset1.wav',
    'sfx_rally_fail': 'uralsetn.wav',
    'sfx_radar_off': 'gradardn.wav',
    'sfx_crate_pickup': 'gcramona.wav',
    'sfx_garrison_enter_0': 'ggarenta.wav',
    'sfx_garrison_enter_1': 'ggarentb.wav',
    'sfx_garrison_exit_0': 'ggarexia.wav',
    'sfx_garrison_exit_1': 'ggarexib.wav',

    // Faction EVA lines (USA)
    'eva_usa_base_under_attack': 'eubasun.wav',
    'eva_usa_unit_under_attack': 'euallyu.wav',
    'eva_usa_building_lost': 'eubuilo.wav',
    'eva_usa_general_promoted': 'eulevel.wav',
    'eva_usa_ready_particle': 'euparrea.wav',
    'eva_usa_ready_nuke': 'eunukrea.wav',
    'eva_usa_ready_scud': 'euscurea.wav',
    'eva_usa_beacon': 'eubeaco.wav',
    'eva_usa_reinforcements': 'eureinf.wav',
    'eva_usa_building_captured': 'eubuica.wav',

    // Faction EVA lines (China)
    'eva_china_base_under_attack': 'ecbasun.wav',
    'eva_china_unit_under_attack': 'ecallyu.wav',
    'eva_china_building_lost': 'ecbuilo.wav',
    'eva_china_general_promoted': 'eclevel.wav',
    'eva_china_ready_particle': 'ecparrea.wav',
    'eva_china_ready_nuke': 'ecnukrea.wav',
    'eva_china_ready_scud': 'ecscurea.wav',
    'eva_china_beacon': 'ecbeaco.wav',
    'eva_china_reinforcements': 'ecreinf.wav',
    'eva_china_building_captured': 'ecbuica.wav',

    // Faction EVA lines (GLA)
    'eva_gla_base_under_attack': 'egbasun.wav',
    'eva_gla_unit_under_attack': 'egallyu.wav',
    'eva_gla_building_lost': 'egbuilo.wav',
    'eva_gla_general_promoted': 'eglevel.wav',
    'eva_gla_ready_particle': 'egparrea.wav',
    'eva_gla_ready_nuke': 'egnukrea.wav',
    'eva_gla_ready_scud': 'egscurea.wav',
    'eva_gla_beacon': 'egbeaco.wav',
    'eva_gla_reinforcements': 'egreinf.wav',
    'eva_gla_building_captured': 'egbuica.wav'
};

const index = buildBigIndex(bigPaths);
const additions = {};
const skipped = [];
for (const [key, wavName] of Object.entries(soundFiles)) {
    const entry = index[wavName.toLowerCase()];
    if (!entry || entry.size === 0) {
        skipped.push(`${key} (${wavName})`);
        continue;
    }
    const wavBuf = entry.buf.subarray(entry.off, entry.off + entry.size);
    additions[key] = 'data:audio/wav;base64,' + wavBuf.toString('base64');
}

const counts = writeAudioCatalog(additions);
console.log(`Merged ${Object.keys(additions).length} retail effects & EVA WAVs cleanly! Catalog counts:`, JSON.stringify(counts));
if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} unavailable optional WAV(s):`, skipped.join(', '));
}
