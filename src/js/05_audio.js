// =========================================================================
// MULTI-FACTION (USA, CHINA, GLA) & SUPERWEAPONS PROCEDURAL WEB AUDIO SYNTHESIZER
// =========================================================================
let masterAudioCtx = null;

function getAudioContext() {
    if (!masterAudioCtx) {
        try {
            const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
            if (AC) masterAudioCtx = new AC();
        } catch (_) {
            return null;
        }
    }
    if (masterAudioCtx && masterAudioCtx.state === 'suspended') {
        try {
            const p = masterAudioCtx.resume();
            if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (_) {}
    }
    return masterAudioCtx;
}

// Backwards compatibility alias
function getUSAAudioContext() {
    return getAudioContext();
}

if (typeof window !== 'undefined') {
    const unlockAudio = () => {
        getAudioContext();
        window.removeEventListener('pointerdown', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });
}

function isAudioAllowed(type, faction = null) {
    return true;
}

function isUSASoundAllowed() {
    return isAudioAllowed('usa', 'usa');
}

// UI / global announcements that must never be distance-attenuated
const UI_AUDIO_TYPES = new Set([
    'click', 'gui_click', 'gui_combo', 'gui_blip', 'gui_msg', 'gui_error', 'gui_slider', 'cash_up', 'cash_down',
    'rally_set', 'rally_fail', 'radar_alert', 'radio_chirp', 'radar_on', 'radar_off', 'acknowledge', 'construction',
    'unit_promoted', 'superweapon_siren', 'scud_storm_volley', 'nuke_doors', 'nuke_launch', 'nuke_detonation',
    'orbital_beam', 'victory', 'defeat', 'power_down', 'power_up', 'crate_pickup', 'speaker_pulse'
]);

// SAGE AudioSettings.ini: 3D sounds fade with distance from the microphone (camera focus point) and are culled
// below MinSampleVolume. Distances scale with cameraRadius (default Skirmish radius is 220 on 1500 maps, 280 on 2200 maps)
// so units visible anywhere on the player's screen play at full volume and only off-screen battles attenuate.
const SPATIAL_AUDIO_NEAR = 180;
const SPATIAL_AUDIO_FAR = 720;
const SPATIAL_AUDIO_MIN_GAIN = 0.04;
function computeSpatialAudio(pos) {
    if (!pos || typeof cameraTarget === 'undefined' || !cameraTarget) return null;
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.z) || !Number.isFinite(cameraTarget.x) || !Number.isFinite(cameraTarget.z)) {
        return null;
    }
    const dx = pos.x - cameraTarget.x;
    const dz = pos.z - cameraTarget.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const radius = (typeof cameraRadius === 'number' && Number.isFinite(cameraRadius)) ? cameraRadius : 220;
    const nearDist = Math.max(SPATIAL_AUDIO_NEAR, radius * 0.90);
    const farDist = Math.max(SPATIAL_AUDIO_FAR, radius * 3.10);
    if (dist >= farDist) return { cull: true, gain: 0, pan: 0 };
    let gain = 1;
    if (dist > nearDist) {
        const t = Math.min(1, (dist - nearDist) / Math.max(1, farDist - nearDist));
        gain = Math.pow(1 - t, 1.45);
    }
    // Zooming in closer boosts 3D volume slightly (ZoomSoundVolumePercentageAmount = 20%)
    const zoomBonus = 0.85 + 0.15 * Math.max(0, Math.min(1, (425 - radius) / (425 - 130)));
    gain *= zoomBonus;
    if (gain < SPATIAL_AUDIO_MIN_GAIN) return { cull: true, gain: 0, pan: 0 };
    let pan = 0;
    if (typeof camera !== 'undefined' && camera && camera.matrixWorld && camera.matrixWorld.elements) {
        const e = camera.matrixWorld.elements;
        if (Number.isFinite(e[0]) && Number.isFinite(e[2])) {
            pan = Math.max(-0.80, Math.min(0.80, (dx * e[0] + dz * e[2]) / Math.max(140, radius * 0.85)));
        }
    }
    return { cull: false, gain, pan };
}

const OFFICIAL_AUDIO_MAP = {
    cannon: 'sfx_cannon_crusader',
    china_cannon: ['sfx_cannon_battlemaster_0', 'sfx_cannon_battlemaster_1'],
    battlemaster_cannon: ['sfx_cannon_battlemaster_0', 'sfx_cannon_battlemaster_1'],
    scorpion_cannon: ['sfx_cannon_scorpion_0', 'sfx_cannon_scorpion_1'],
    scorpion_missile: 'sfx_scorpion_missile',
    marauder_cannon: ['sfx_cannon_marauder_0', 'sfx_cannon_marauder_1'],
    inferno_cannon: 'sfx_cannon_inferno',
    paladin_cannon: 'sfx_cannon_paladin',
    machine_gun: 'sfx_rifle_ranger',
    humvee_mg: 'sfx_humvee_mg',
    comanche_cannon: 'sfx_comanche_cannon',
    redguard_rifle: ['sfx_rifle_redguard_0', 'sfx_rifle_redguard_1'],
    rebel_ak47: ['sfx_rifle_rebel_0', 'sfx_rifle_rebel_1'],
    ak47: ['sfx_rifle_rebel_0', 'sfx_rifle_rebel_1'],
    technical_mg: ['sfx_technical_mg_0', 'sfx_technical_mg_1'],
    quad_cannon: ['sfx_quad_cannon_0', 'sfx_quad_cannon_1', 'sfx_quad_cannon_2'],
    gatling_fire: ['sfx_gatling_fire_0', 'sfx_gatling_fire_1', 'sfx_gatling_fire_2'],
    dragon_flame: 'sfx_dragon_flame',
    flamethrower: 'sfx_dragon_flame',
    toxin_spray: 'sfx_toxin_spray',
    burton_rifle: 'sfx_burton_rifle',
    sniper_rifle: 'sfx_sniper_rifle',
    jarmen_snipe: 'sfx_jarmen_snipe',
    missile_defender: ['sfx_missile_defender', 'sfx_missile_defender_1', 'sfx_missile_defender_2'],
    expl_tomahawk: 'sfx_expl_tomahawk',
    tankhunter_rocket: 'sfx_tankhunter_rocket',
    rpg_launch: ['sfx_rpg_launch_0', 'sfx_rpg_launch_1'],
    buggy_rocket: ['sfx_buggy_rocket_0', 'sfx_buggy_rocket_1', 'sfx_buggy_rocket_2'],
    stinger_fire: ['sfx_stinger_fire_0', 'sfx_stinger_fire_1'],
    jet_missile: 'sfx_jet_missile',
    comanche_missile: 'sfx_missile_comanche',
    tomahawk_launch: 'sfx_missile_tomahawk',
    scud_launch: 'sfx_scud_launch',
    missile_launch: 'sfx_missile_comanche',
    laser_point_defense: 'sfx_pdl_laser',
    aurora_bomb: 'sfx_daisycutter_blast',
    daisycutter_drop: 'sfx_daisycutter_drop',
    daisycutter_blast: 'sfx_daisycutter_blast',
    carpet_bomb: ['sfx_carpet_bomb_0', 'sfx_carpet_bomb_1', 'sfx_carpet_bomb_2', 'sfx_expl_carpet_3'],
    spectre_gatling: ['sfx_spectre_gatling_0', 'sfx_spectre_gatling_1', 'sfx_spectre_gatling_2'],
    spectre_howitzer: ['sfx_spectre_howitzer_0', 'sfx_spectre_howitzer_1'],
    c130_flyover: 'sfx_c130_flyover',
    parachute_open: 'sfx_parachute_open',
    explosion: ['sfx_explosion', 'sfx_expl_small_0', 'sfx_expl_small_1', 'sfx_expl_small_2'],
    expl_small: ['sfx_expl_small_0', 'sfx_expl_small_1', 'sfx_expl_small_2'],
    expl_missile: ['sfx_expl_missile_0', 'sfx_expl_missile_1', 'sfx_expl_missile_2'],
    expl_vehicle: ['sfx_expl_vehicle_0', 'sfx_expl_vehicle_1', 'sfx_expl_vehicle_2'],
    expl_building: ['sfx_expl_building_0', 'sfx_expl_building_1'],
    expl_artillery: ['sfx_expl_artillery_0', 'sfx_expl_artillery_1', 'sfx_expl_artillery_2'],
    expl_fire: ['sfx_expl_fire_0', 'sfx_expl_fire_1', 'sfx_expl_fire_2'],
    expl_flashbang: ['sfx_expl_flashbang_0', 'sfx_expl_flashbang_1'],
    expl_neutron: ['sfx_expl_neutron_0', 'sfx_expl_neutron_1'],
    expl_mininuke: 'sfx_expl_mininuke',
    expl_emp: ['sfx_expl_emp_0', 'sfx_expl_emp_1'],
    impact_vehicle: ['sfx_impact_vehicle_0', 'sfx_impact_vehicle_1'],
    impact_building: ['sfx_impact_building_0', 'sfx_impact_building_1'],
    debris_vehicle: ['sfx_debris_vehicle_0', 'sfx_debris_vehicle_1'],
    debris_building: ['sfx_debris_building_0', 'sfx_debris_building_1'],
    shell_whistle: ['sfx_shell_whistle_0', 'sfx_shell_whistle_1'],
    demo_beep: 'sfx_demo_beep',
    mine_detonate: 'sfx_mine_detonate',
    unit_promoted: 'sfx_unit_promoted',
    jarmen_snipe_hit: 'sfx_jarmen_snipe_hit',
    fire_start: 'sfx_fire_start',
    a10_dive: ['sfx_a10_dive_0', 'sfx_a10_dive_1'],
    a10_flyby: 'sfx_a10_flyby',
    nuke_doors: 'sfx_nuke_doors',
    nuke_launch: 'sfx_nuke_launch',
    particle_annihilate: 'sfx_particle_annihilate',
    anthrax_blast: 'sfx_anthrax_blast',
    anthrax_hiss: 'sfx_anthrax_hiss',
    artillery_fire: 'sfx_artillery_fire',
    cluster_mines: 'sfx_cluster_mines',
    emp_pulse: 'sfx_emp_pulse',
    cash_hack: 'sfx_cash_hack',
    frenzy: 'sfx_frenzy',
    emergency_repair: 'sfx_emergency_repair',
    spy_drone: 'sfx_spy_drone',
    radar_scan: 'sfx_radar_scan',
    rebel_ambush: 'sfx_rebel_ambush',
    sneak_attack: 'sfx_sneak_attack',
    gps_scrambler: 'sfx_gps_scrambler',
    infantry_squish: 'sfx_infantry_squish',
    scrap_pickup: 'sfx_salvage_pickup',
    construction: 'sfx_place_building',
    click: 'sfx_click',
    gui_click: 'sfx_click',
    gui_combo: 'sfx_gui_combo',
    gui_blip: 'sfx_gui_blip',
    gui_msg: 'sfx_gui_msg',
    gui_error: 'sfx_gui_error',
    gui_slider: 'sfx_gui_slider',
    cash_up: 'sfx_cash_up',
    cash_down: 'sfx_cash_down',
    rally_set: 'sfx_rally_set',
    rally_fail: 'sfx_rally_fail',
    radar_alert: 'sfx_radar_alert',
    radio_chirp: 'sfx_radar_ping',
    radar_on: 'sfx_radar_on',
    radar_off: 'sfx_radar_off',
    crate_pickup: 'sfx_crate_pickup',
    garrison_enter: ['sfx_garrison_enter_0', 'sfx_garrison_enter_1'],
    garrison_exit: ['sfx_garrison_exit_0', 'sfx_garrison_exit_1'],
    power_down: 'sfx_power_down',
    power_up: 'sfx_power_up',
    mine_place: 'sfx_mine_place',
    nuke_artillery: 'sfx_nukecannon_fire',
    nukecannon_deploy: 'sfx_nukecannon_deploy',
    nukecannon_undeploy: 'sfx_nukecannon_undeploy',
    overlord_cannon: 'sfx_overlord_fire',
    speaker_pulse: 'sfx_speaker_tower',
    orbital_beam: 'sfx_particle_beam',
    nuke_detonation: 'sfx_nuke_blast',
    scud_storm_volley: 'sfx_scud_alarm',
    scud_detonation: 'sfx_scud_blast',
    superweapon_siren: 'sfx_nuke_siren',
    drone_repair: 'sfx_drone_fire',
    patriot_fire: ['sfx_patriot_fire_0', 'sfx_patriot_fire_1', 'sfx_patriot_fire_2', 'sfx_patriot_fire_3'],
    patriot_select: 'sfx_patriot_select'
};

function playAudio(type, options = {}, faction = null) {
    if (!isAudioAllowed(type, faction)) return;

    if ((type === 'victory' || type === 'defeat') && typeof playEvaAlert === 'function') {
        if (playEvaAlert(type, faction)) return;
    }

    // Authentic SAGE-style 3D world audio attenuation & culling (applied to both official WAV & procedural synth fallback)
    const worldPos = options.pos || (UI_AUDIO_TYPES.has(type) ? null : window._sfxPos);
    const spatial = worldPos ? computeSpatialAudio(worldPos) : null;
    if (spatial && spatial.cull) return;
    const rawVol = (options && options.volume !== undefined && options.volume !== null) ? Number(options.volume) : 0.90;
    const masterMul = (typeof window !== 'undefined' && window._gameOptions && Number.isFinite(window._gameOptions.masterVolume))
        ? Math.max(0, Math.min(1, window._gameOptions.masterVolume))
        : 1.0;
    const baseVol = (Number.isFinite(rawVol) ? Math.max(0, Math.min(1, rawVol)) : 0.90) * masterMul;

    // Trigger authentic retail WAV from 05b_official_audio.js when available
    if (typeof playOfficialSound === 'function') {
        const mapped = OFFICIAL_AUDIO_MAP[type];
        const soundKey = Array.isArray(mapped) ? mapped[Math.floor(Math.random() * mapped.length)] : mapped;
        if (soundKey) {
            if (playOfficialSound(soundKey, spatial ? baseVol * spatial.gain : baseVol, null, spatial ? spatial.pan : null)) {
                return;
            }
        }
    }
    if (baseVol <= 0) return;

    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    try {
        switch (type) {
            // --- USA SOUNDS ---
            case 'radar_alert': {
                [0, 0.14].forEach((delay, idx) => {
                        const osc = ctx.createOscillator(); const gain = ctx.createGain();
                        osc.type = 'triangle';
                        osc.frequency.setValueAtTime(idx === 0 ? 960 : 740, t + delay);
                        gain.gain.setValueAtTime(0.22, t + delay);
                        gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.12);
                        osc.connect(gain); gain.connect(ctx.destination);
                        osc.start(t + delay); osc.stop(t + delay + 0.13);
                });
                break;
            }
            case 'radio_chirp': {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(1400, t); osc.frequency.exponentialRampToValueAtTime(2200, t + 0.04);
                gain.gain.setValueAtTime(0.18, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(t); osc.stop(t + 0.09);

                const bSize = Math.floor(ctx.sampleRate * 0.04);
                const buf = ctx.createBuffer(1, bSize, ctx.sampleRate);
                const data = buf.getChannelData(0);
                for (let i = 0; i < bSize; i++) data[i] = (Math.random() * 2 - 1) * 0.12;
                const src = ctx.createBufferSource(); src.buffer = buf;
                const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 2.0;
                const g = ctx.createGain(); g.gain.setValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
                src.connect(f); f.connect(g); g.connect(ctx.destination);
                src.start(t + 0.02);
                break;
            }
            case 'acknowledge': {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'triangle'; osc.frequency.setValueAtTime(880, t); osc.frequency.setValueAtTime(1320, t + 0.05);
                gain.gain.setValueAtTime(0.15, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(t); osc.stop(t + 0.12);
                break;
            }
            case 'construction': {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'square'; osc.frequency.setValueAtTime(140, t); osc.frequency.exponentialRampToValueAtTime(45, t + 0.16);
                gain.gain.setValueAtTime(0.22, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(t); osc.stop(t + 0.21);
                break;
            }
            case 'cannon': {
                const bSize = Math.floor(ctx.sampleRate * 0.38);
                const buf = ctx.createBuffer(1, bSize, ctx.sampleRate);
                const data = buf.getChannelData(0);
                for (let i = 0; i < bSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.07));
                const src = ctx.createBufferSource(); src.buffer = buf;
                const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.45, t);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
                src.connect(f); f.connect(g); g.connect(ctx.destination);
                src.start(t);

                const osc = ctx.createOscillator(); const og = ctx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(130, t); osc.frequency.exponentialRampToValueAtTime(35, t + 0.25);
                og.gain.setValueAtTime(0.35, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
                osc.connect(og); og.connect(ctx.destination);
                osc.start(t); osc.stop(t + 0.26);
                break;
            }
            case 'laser': {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sawtooth'; osc.frequency.setValueAtTime(2600, t); osc.frequency.exponentialRampToValueAtTime(400, t + 0.14);
                gain.gain.setValueAtTime(0.18, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(t); osc.stop(t + 0.15);
                break;
            }
            case 'machine_gun': {
                for (let shot = 0; shot < 3; shot++) {
                    const st = t + shot * 0.085;
                    const bSize = Math.floor(ctx.sampleRate * 0.06);
                    const buf = ctx.createBuffer(1, bSize, ctx.sampleRate);
                    const data = buf.getChannelData(0);
                    for (let i = 0; i < bSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.015));
                    const src = ctx.createBufferSource(); src.buffer = buf;
                    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1600; f.Q.value = 1.2;
                    const g = ctx.createGain();
                    g.gain.setValueAtTime(0.24, st);
                    g.gain.exponentialRampToValueAtTime(0.001, st + 0.06);
                    src.connect(f); f.connect(g); g.connect(ctx.destination);
                    src.start(st);
                }
                break;
            }
            case 'sniper_rifle': {
                const bSize = Math.floor(ctx.sampleRate * 0.14);
                const buf = ctx.createBuffer(1, bSize, ctx.sampleRate);
                const data = buf.getChannelData(0);
                for (let i = 0; i < bSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.022));
                const src = ctx.createBufferSource(); src.buffer = buf;
                const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200;
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.45, t);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
                src.connect(f); f.connect(g); g.connect(ctx.destination);
                src.start(t);

                const osc = ctx.createOscillator(); const og = ctx.createGain();
                osc.type = 'sawtooth'; osc.frequency.setValueAtTime(750, t); osc.frequency.exponentialRampToValueAtTime(140, t + 0.09);
                og.gain.setValueAtTime(0.28, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
                osc.connect(og); og.connect(ctx.destination);
                osc.start(t); osc.stop(t + 0.10);
                break;
            }
            case 'patriot_fire':
            case 'tomahawk_launch':
            case 'missile_launch': {
                const bSize = Math.floor(ctx.sampleRate * 0.45);
                const buf = ctx.createBuffer(1, bSize, ctx.sampleRate);
                const data = buf.getChannelData(0);
                for (let i = 0; i < bSize; i++) data[i] = (Math.random() * 2 - 1);
                const src = ctx.createBufferSource(); src.buffer = buf;
                const f = ctx.createBiquadFilter(); f.type = 'bandpass';
                f.frequency.setValueAtTime(400, t);
                f.frequency.exponentialRampToValueAtTime(1800, t + 0.35);
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.05, t);
                g.gain.linearRampToValueAtTime(0.28, t + 0.08);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.44);
                src.connect(f); f.connect(g); g.connect(ctx.destination);
                src.start(t);
                break;
            }
            case 'aurora_bomb': {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(95, t); osc.frequency.exponentialRampToValueAtTime(22, t + 0.7);
                gain.gain.setValueAtTime(0.55, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(t); osc.stop(t + 0.76);

                const bSize = Math.floor(ctx.sampleRate * 0.6);
                const buf = ctx.createBuffer(1, bSize, ctx.sampleRate);
                const data = buf.getChannelData(0);
                for (let i = 0; i < bSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.15));
                const src = ctx.createBufferSource(); src.buffer = buf;
                const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 450;
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.42, t);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
                src.connect(f); f.connect(g); g.connect(ctx.destination);
                src.start(t);
                break;
            }
            case 'explosion': {
                const bSize = Math.floor(ctx.sampleRate * 0.32);
                const buf = ctx.createBuffer(1, bSize, ctx.sampleRate);
                const data = buf.getChannelData(0);
                for (let i = 0; i < bSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.08));
                const src = ctx.createBufferSource(); src.buffer = buf;
                const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.38, t);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
                src.connect(f); f.connect(g); g.connect(ctx.destination);
                src.start(t);
                break;
            }

            // --- CHINA SOUNDS ---
            case 'overlord_cannon':
            case 'china_cannon': {
                const bSize = Math.floor(ctx.sampleRate * 0.45);
                const buf = ctx.createBuffer(1, bSize, ctx.sampleRate);
                const data = buf.getChannelData(0);
                for (let i = 0; i < bSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.08));
                const src = ctx.createBufferSource(); src.buffer = buf;
                const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 480;
                const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
                src.connect(f); f.connect(g); g.connect(ctx.destination);
                src.start(t);

                const osc = ctx.createOscillator(); const og = ctx.createGain();
                osc.type = 'sawtooth'; osc.frequency.setValueAtTime(110, t); osc.frequency.exponentialRampToValueAtTime(25, t + 0.3);
                og.gain.setValueAtTime(0.4, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
                osc.connect(og); og.connect(ctx.destination);
                osc.start(t); osc.stop(t + 0.31);
                break;
            }
            case 'gatling':
            case 'gatling_fire': {
                for (let i = 0; i < 4; i++) {
                    const st = t + i * 0.045;
                    const bSize = Math.floor(ctx.sampleRate * 0.04);
                    const buf = ctx.createBuffer(1, bSize, ctx.sampleRate);
                    const data = buf.getChannelData(0);
                    for (let j = 0; j < bSize; j++) data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (ctx.sampleRate * 0.012));
                    const src = ctx.createBufferSource(); src.buffer = buf;
                    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 1.5;
                    const g = ctx.createGain(); g.gain.setValueAtTime(0.22, st); g.gain.exponentialRampToValueAtTime(0.001, st + 0.04);
                    src.connect(f); f.connect(g); g.connect(ctx.destination);
                    src.start(st);
                }
                break;
            }
            case 'flamethrower': {
                const bSize = Math.floor(ctx.sampleRate * 0.35);
                const buf = ctx.createBuffer(1, bSize, ctx.sampleRate);
                const data = buf.getChannelData(0);
                for (let i = 0; i < bSize; i++) data[i] = (Math.random() * 2 - 1);
                const src = ctx.createBufferSource(); src.buffer = buf;
                const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(800, t); f.frequency.linearRampToValueAtTime(300, t + 0.35);
                const g = ctx.createGain(); g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
                src.connect(f); f.connect(g); g.connect(ctx.destination);
                src.start(t);
                break;
            }
            case 'propaganda_drone': {
                [523, 659].forEach((freq) => {
                        const osc = ctx.createOscillator(); const gain = ctx.createGain();
                        osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t);
                        gain.gain.setValueAtTime(0.12, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
                        osc.connect(gain); gain.connect(ctx.destination);
                        osc.start(t); osc.stop(t + 0.61);
                });
                break;
            }
            case 'nuke_artillery': {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sawtooth'; osc.frequency.setValueAtTime(85, t); osc.frequency.exponentialRampToValueAtTime(20, t + 0.5);
                gain.gain.setValueAtTime(0.6, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(t); osc.stop(t + 0.56);
                break;
            }

            // --- GLA SOUNDS ---
            case 'ak47': {
                for (let i = 0; i < 3; i++) {
                    const st = t + i * 0.08;
                    const bSize = Math.floor(ctx.sampleRate * 0.05);
                    const buf = ctx.createBuffer(1, bSize, ctx.sampleRate);
                    const data = buf.getChannelData(0);
                    for (let j = 0; j < bSize; j++) data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (ctx.sampleRate * 0.01));
                    const src = ctx.createBufferSource(); src.buffer = buf;
                    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 1.8;
                    const g = ctx.createGain(); g.gain.setValueAtTime(0.25, st); g.gain.exponentialRampToValueAtTime(0.001, st + 0.05);
                    src.connect(f); f.connect(g); g.connect(ctx.destination);
                    src.start(st);
                }
                break;
            }
            case 'technical_rev': {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sawtooth'; osc.frequency.setValueAtTime(90, t); osc.frequency.exponentialRampToValueAtTime(220, t + 0.18);
                gain.gain.setValueAtTime(0.18, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(t); osc.stop(t + 0.23);
                break;
            }
            case 'scud_launch': {
                const bSize = Math.floor(ctx.sampleRate * 0.6);
                const buf = ctx.createBuffer(1, bSize, ctx.sampleRate);
                const data = buf.getChannelData(0);
                for (let i = 0; i < bSize; i++) data[i] = (Math.random() * 2 - 1);
                const src = ctx.createBufferSource(); src.buffer = buf;
                const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(350, t); f.frequency.exponentialRampToValueAtTime(1200, t + 0.5);
                const g = ctx.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.58);
                src.connect(f); f.connect(g); g.connect(ctx.destination);
                src.start(t);
                break;
            }
            case 'demo_beep': {
                for (let i = 0; i < 3; i++) {
                    const st = t + i * 0.08;
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'square'; osc.frequency.setValueAtTime(1500 + i * 400, st);
                    gain.gain.setValueAtTime(0.15, st); gain.gain.exponentialRampToValueAtTime(0.001, st + 0.05);
                    osc.connect(gain); gain.connect(ctx.destination);
                    osc.start(st); osc.stop(st + 0.06);
                }
                break;
            }
            case 'scrap_pickup':
            case 'gla_salvage': {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'triangle'; osc.frequency.setValueAtTime(1200, t); osc.frequency.setValueAtTime(1800, t + 0.06);
                gain.gain.setValueAtTime(0.2, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(t); osc.stop(t + 0.16);
                break;
            }
            case 'infantry_squish': {
                // Heavy crushing squelch + bone crunch
                const bSize = Math.floor(ctx.sampleRate * 0.18);
                const buf = ctx.createBuffer(1, bSize, ctx.sampleRate);
                const data = buf.getChannelData(0);
                for (let i = 0; i < bSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.04));
                const src = ctx.createBufferSource(); src.buffer = buf;
                const filter = ctx.createBiquadFilter(); filter.type = 'lowpass';
                filter.frequency.setValueAtTime(700, t); filter.frequency.exponentialRampToValueAtTime(180, t + 0.16);
                const gain = ctx.createGain(); gain.gain.setValueAtTime(0.4, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
                src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
                src.start(t);
                break;
            }
            case 'laser_point_defense': {
                // High-tech laser interception chirp
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(2600, t);
                osc.frequency.exponentialRampToValueAtTime(650, t + 0.08);
                gain.gain.setValueAtTime(0.25, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(t); osc.stop(t + 0.1);
                break;
            }

            // --- SUPERWEAPON CINEMATIC AUDIO ---
            case 'superweapon_siren': {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(440, t);
                osc.frequency.linearRampToValueAtTime(660, t + 0.4);
                osc.frequency.linearRampToValueAtTime(440, t + 0.8);
                gain.gain.setValueAtTime(0.32, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(t); osc.stop(t + 1.21);
                break;
            }
            case 'orbital_beam': {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(180, t);
                osc.frequency.exponentialRampToValueAtTime(1400, t + 0.8);
                gain.gain.setValueAtTime(0.45, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(t); osc.stop(t + 1.05);
                break;
            }
            case 'nuke_detonation': {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(65, t);
                osc.frequency.exponentialRampToValueAtTime(18, t + 1.5);
                gain.gain.setValueAtTime(0.75, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(t); osc.stop(t + 1.65);
                break;
            }
            case 'scud_storm_volley': {
                for (let i = 0; i < 9; i++) {
                    const st = t + i * 0.14;
                    const bSize = Math.floor(ctx.sampleRate * 0.35);
                    const buf = ctx.createBuffer(1, bSize, ctx.sampleRate);
                    const data = buf.getChannelData(0);
                    for (let j = 0; j < bSize; j++) data[j] = (Math.random() * 2 - 1);
                    const src = ctx.createBufferSource(); src.buffer = buf;
                    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500 + i * 80;
                    const g = ctx.createGain(); g.gain.setValueAtTime(0.25, st); g.gain.exponentialRampToValueAtTime(0.001, st + 0.3);
                    src.connect(f); f.connect(g); g.connect(ctx.destination);
                    src.start(st);
                }
                break;
            }
        }
    } catch (err) {}
}

function playUSASound(type, options = {}) {
    playAudio(type, options, 'usa');
}
