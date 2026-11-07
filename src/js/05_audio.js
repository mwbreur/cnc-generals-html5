// =========================================================================
// MULTI-FACTION (USA, CHINA, GLA) & SUPERWEAPONS PROCEDURAL WEB AUDIO SYNTHESIZER
// =========================================================================
let masterAudioCtx = null;

function getAudioContext() {
    if (!masterAudioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) masterAudioCtx = new AC();
    }
    if (masterAudioCtx && masterAudioCtx.state === 'suspended') {
        masterAudioCtx.resume();
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
    if (typeof selectedFaction === 'undefined') return true;
    const globalSounds = ['superweapon_siren', 'orbital_beam', 'nuke_detonation', 'scud_storm_volley', 'explosion', 'construction', 'infantry_squish', 'laser_point_defense', 'scrap_pickup', 'gla_salvage'];
    if (globalSounds.includes(type)) return true;

    const targetFaction = faction || (type.startsWith('china') || ['gatling_fire', 'flamethrower', 'propaganda_drone', 'nuke_artillery'].includes(type) ? 'china' : (type.startsWith('gla') || ['ak47', 'technical_rev', 'scud_launch', 'demo_beep', 'scrap_pickup'].includes(type)) ? 'gla' : 'usa');
    return selectedFaction === targetFaction;
}

function isUSASoundAllowed() {
    return isAudioAllowed('usa', 'usa');
}

function playAudio(type, options = {}, faction = null) {
    if (!isAudioAllowed(type, faction)) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    try {
        switch (type) {
            // --- USA SOUNDS ---
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
