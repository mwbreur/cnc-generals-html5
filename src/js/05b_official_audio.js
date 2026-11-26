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
    if (soundKey.startsWith('voice_truck_')) return 'china';
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

// SAGE AudioSettings.ini SampleCount3D = 25: cap simultaneous world (3D) samples using wall-clock expiration
// timestamps (never rely on AudioBufferSourceNode.onended, which can fail to fire in Chromium when V8/Oilpan
// garbage-collects an unreferenced source wrapper or while AudioContext is suspended, which would otherwise
// permanently saturate the counter at 25 and mute all weapon sounds).
const MAX_WORLD_SAMPLES = 28;
const _activeWorldSampleEnds = [];
const _liveSourceNodes = [];
const _liveGainNodes = [];
if (typeof window !== 'undefined') window._liveOfficialGainNodes = _liveGainNodes;
const _lastWorldSoundTime = {};

function playOfficialAudioBuffer(ctx, buffer, volume, pan = null, baseUnscaledVol = null) {
    if (!ctx || !buffer) return false;
    const isWorld = (typeof pan === 'number' && Number.isFinite(pan));
    const nowMs = Date.now();
    if (isWorld) {
        while (_activeWorldSampleEnds.length > 0 && _activeWorldSampleEnds[0] <= nowMs) {
            _activeWorldSampleEnds.shift();
        }
        if (_activeWorldSampleEnds.length >= MAX_WORLD_SAMPLES) return true;
    }
    try {
        if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {});
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        // Retail PitchShift: +/-4% random pitch so repeated shots don't sound identical
        if (isWorld && src.playbackRate && typeof src.playbackRate.value === 'number') {
            src.playbackRate.value = 0.96 + Math.random() * 0.08;
        }
        const gain = ctx.createGain();
        const effVol = Number.isFinite(volume) ? volume : 0.85;
        gain.gain.value = effVol;
        gain._baseVol = Number.isFinite(baseUnscaledVol) ? baseUnscaledVol : effVol;
        src.connect(gain);
        let tail = gain;
        if (isWorld && typeof ctx.createStereoPanner === 'function' && Math.abs(pan) > 0.01) {
            try {
                const panner = ctx.createStereoPanner();
                if (panner && panner.pan) {
                    panner.pan.value = Math.max(-1, Math.min(1, pan));
                    gain.connect(panner);
                    tail = panner;
                }
            } catch (panErr) {}
        }
        tail.connect(ctx.destination);
        if (isWorld) {
            const durMs = Math.min(1800, Math.max(120, ((buffer && typeof buffer.duration === 'number' && buffer.duration > 0) ? buffer.duration : 0.45) * 1000));
            _activeWorldSampleEnds.push(nowMs + durMs);
            if (_activeWorldSampleEnds.length > 1) _activeWorldSampleEnds.sort((a, b) => a - b);
        }
        // Hold strong JS references to active source & gain nodes in bounded ring buffers
        _liveSourceNodes.push(src);
        if (_liveSourceNodes.length > 36) _liveSourceNodes.shift();
        _liveGainNodes.push(gain);
        if (_liveGainNodes.length > 36) _liveGainNodes.shift();
        src.start(0);
        return true;
    } catch (e) {
        return false;
    }
}

const IMA_INDEX_TABLE = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];
const IMA_STEP_TABLE = [
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
    50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230,
    253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963,
    1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327,
    3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442,
    11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767
];

// Retail EA Audio.big / AudioZH.big SFX WAVs use 4-bit IMA ADPCM (fmt=0x0011), which browsers'
// native AudioContext.decodeAudioData() & <audio> reject. Transcode IMA ADPCM in-memory to standard
// 16-bit linear PCM (fmt=1) WAV so WebAudio decodes 100% of retail SFX with zero WebMediaPlayer fallback.
function ensurePcmWavBuffer(bytes) {
    if (!bytes || bytes.length < 44) return bytes.buffer;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (dv.getUint32(0, false) !== 0x52494646 || dv.getUint32(8, false) !== 0x57415645) return bytes.buffer;
    let fmt = 1, channels = 1, sampleRate = 22050, blockAlign = 512, samplesPerBlock = 0;
    let dataOffset = 0, dataSize = 0;
    let pos = 12;
    while (pos + 8 <= bytes.length) {
        const id = dv.getUint32(pos, false);
        const sz = dv.getUint32(pos + 4, true);
        if (id === 0x666d7420) {
            fmt = dv.getUint16(pos + 8, true);
            channels = dv.getUint16(pos + 10, true) || 1;
            sampleRate = dv.getUint32(pos + 12, true) || 22050;
            blockAlign = dv.getUint16(pos + 20, true) || 512;
            if (sz >= 20 && pos + 28 <= bytes.length) {
                samplesPerBlock = dv.getUint16(pos + 26, true);
            }
        } else if (id === 0x64617461) {
            dataOffset = pos + 8;
            dataSize = Math.min(sz, bytes.length - dataOffset);
            break;
        }
        pos += 8 + ((sz + 1) & ~1);
    }
    if (fmt !== 0x0011 || !dataOffset || dataSize <= 0) return bytes.buffer;
    if (channels !== 1) {
        console.warn('ensurePcmWavBuffer: stereo IMA ADPCM unsupported, passing raw buffer');
        return bytes.buffer;
    }

    const numBlocks = Math.floor(dataSize / blockAlign);
    const spb = samplesPerBlock || (1 + Math.floor((blockAlign - 4 * channels) * 2 / channels));
    const totalFrames = numBlocks * spb;
    const pcmBytes = totalFrames * channels * 2;
    const out = new ArrayBuffer(44 + pcmBytes);
    const outDv = new DataView(out);
    outDv.setUint32(0, 0x52494646, false);
    outDv.setUint32(4, 36 + pcmBytes, true);
    outDv.setUint32(8, 0x57415645, false);
    outDv.setUint32(12, 0x666d7420, false);
    outDv.setUint32(16, 16, true);
    outDv.setUint16(20, 1, true);
    outDv.setUint16(22, channels, true);
    outDv.setUint32(24, sampleRate, true);
    outDv.setUint32(28, sampleRate * channels * 2, true);
    outDv.setUint16(32, channels * 2, true);
    outDv.setUint16(34, 16, true);
    outDv.setUint32(36, 0x64617461, false);
    outDv.setUint32(40, pcmBytes, true);

    let outPos = 44;
    for (let b = 0; b < numBlocks; b++) {
        const bOff = dataOffset + b * blockAlign;
        let pred = dv.getInt16(bOff, true);
        let idx = Math.max(0, Math.min(88, bytes[bOff + 2]));
        outDv.setInt16(outPos, pred, true);
        outPos += 2;
        const endOff = Math.min(bytes.length, bOff + blockAlign);
        let produced = 1;
        for (let i = bOff + 4; i < endOff && produced < spb; i++) {
            const byte = bytes[i];
            for (let nibShift = 0; nibShift <= 4 && produced < spb; nibShift += 4) {
                const nib = (byte >> nibShift) & 0x0f;
                const step = IMA_STEP_TABLE[idx];
                let diff = step >> 3;
                if (nib & 1) diff += step >> 2;
                if (nib & 2) diff += step >> 1;
                if (nib & 4) diff += step;
                if (nib & 8) pred -= diff;
                else pred += diff;
                if (pred > 32767) pred = 32767;
                else if (pred < -32768) pred = -32768;
                idx += IMA_INDEX_TABLE[nib];
                if (idx < 0) idx = 0;
                else if (idx > 88) idx = 88;
                outDv.setInt16(outPos, pred, true);
                outPos += 2;
                produced++;
            }
        }
    }
    return out;
}

function createAudioBufferFromPcmWav(ctx, pcmArrayBuffer) {
    if (!ctx || typeof ctx.createBuffer !== 'function' || !pcmArrayBuffer || pcmArrayBuffer.byteLength < 44) return null;
    try {
        const dv = new DataView(pcmArrayBuffer);
        if (dv.getUint32(0, false) !== 0x52494646 || dv.getUint32(8, false) !== 0x57415645) return null;
        let fmt = 0, channels = 1, sampleRate = 22050, bitsPerSample = 16, dataOffset = 0, dataSize = 0;
        let pos = 12;
        while (pos + 8 <= pcmArrayBuffer.byteLength) {
            const id = dv.getUint32(pos, false);
            const sz = dv.getUint32(pos + 4, true);
            if (id === 0x666d7420) {
                fmt = dv.getUint16(pos + 8, true);
                channels = dv.getUint16(pos + 10, true) || 1;
                sampleRate = dv.getUint32(pos + 12, true) || 22050;
                bitsPerSample = dv.getUint16(pos + 22, true) || 16;
            } else if (id === 0x64617461) {
                dataOffset = pos + 8;
                dataSize = Math.min(sz, pcmArrayBuffer.byteLength - dataOffset);
                break;
            }
            pos += 8 + ((sz + 1) & ~1);
        }
        if (fmt !== 1 || bitsPerSample !== 16 || !dataOffset || dataSize < 2) return null;
        const totalFrames = Math.floor(dataSize / (channels * 2));
        if (totalFrames <= 0) return null;
        const audioBuf = ctx.createBuffer(channels, totalFrames, sampleRate);
        if (!audioBuf || typeof audioBuf.getChannelData !== 'function') return null;
        for (let ch = 0; ch < channels; ch++) {
            const chanData = audioBuf.getChannelData(ch);
            let samplePos = dataOffset + ch * 2;
            const stride = channels * 2;
            for (let i = 0; i < totalFrames; i++, samplePos += stride) {
                chanData[i] = dv.getInt16(samplePos, true) / 32768.0;
            }
        }
        return audioBuf;
    } catch (e) {
        return null;
    }
}

function decodeOfficialAudioData(ctx, data) {
    if (typeof data === 'string' && data.startsWith('data:')) {
        const commaIdx = data.indexOf(',');
        if (commaIdx !== -1) {
            const b64 = data.slice(commaIdx + 1);
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const pcmWav = ensurePcmWavBuffer(bytes);
            const directBuf = createAudioBufferFromPcmWav(ctx, pcmWav);
            if (directBuf) return Promise.resolve(directBuf);
            return ctx.decodeAudioData(pcmWav);
        }
    }
    return fetch(data).then(r => r.arrayBuffer()).then(buf => {
        const pcmWav = ensurePcmWavBuffer(new Uint8Array(buf));
        const directBuf = createAudioBufferFromPcmWav(ctx, pcmWav);
        if (directBuf) return directBuf;
        return ctx.decodeAudioData(pcmWav);
    });
}

const MAX_AUDIO_FALLBACK_POOL = 8;
window.OFFICIAL_AUDIO_POOL = window.OFFICIAL_AUDIO_POOL || [];
let _officialAudioPoolIdx = 0;

function playOfficialAudioElementFallback(data, volume) {
    if (typeof Audio !== 'function' || !data) return false;
    try {
        let el;
        if (window.OFFICIAL_AUDIO_POOL.length < MAX_AUDIO_FALLBACK_POOL) {
            el = new Audio(data);
            window.OFFICIAL_AUDIO_POOL.push(el);
        } else {
            el = window.OFFICIAL_AUDIO_POOL[_officialAudioPoolIdx % MAX_AUDIO_FALLBACK_POOL];
            _officialAudioPoolIdx = (_officialAudioPoolIdx + 1) % MAX_AUDIO_FALLBACK_POOL;
            if (typeof el.pause === 'function') el.pause();
            el.src = data;
            el.currentTime = 0;
        }
        const masterMul = (typeof getMasterVolume === 'function') ? getMasterVolume() : 1.0;
        const baseVol = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.85;
        el._baseVolume = baseVol;
        el.volume = Math.max(0, Math.min(1, baseVol * masterMul));
        if (el.volume <= 0) return true;
        const result = el.play();
        if (result && result.catch) result.catch(() => {});
        return true;
    } catch (e) {
        return false;
    }
}

function playOfficialSound(soundKey, volume = 0.85, faction = null, pan = null, volumePreScaled = false) {
    if (!soundKey) return false;
    const masterMul = (typeof getMasterVolume === 'function') ? getMasterVolume() : 1.0;
    const rawClamped = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0.85));
    const baseUnscaled = volumePreScaled ? (masterMul > 0.0001 ? Math.min(1, rawClamped / masterMul) : rawClamped) : rawClamped;
    const clampedVol = volumePreScaled ? rawClamped : Math.max(0, Math.min(1, rawClamped * masterMul));
    if (clampedVol <= 0 || masterMul <= 0) return true;
    if (typeof pan === 'number') {
        // Retail "Limit" behaviour: don't stack identical world sounds within a few ms
        const nowMs = Date.now();
        if (_lastWorldSoundTime[soundKey] && (nowMs - _lastWorldSoundTime[soundKey]) < 45) return true;
        _lastWorldSoundTime[soundKey] = nowMs;
    }
    const play = () => {
        try {
        const data = window.OFFICIAL_AUDIO_DATA && window.OFFICIAL_AUDIO_DATA[soundKey];
        if (!data || typeof data !== 'string') return false;
        const ctx = (typeof getAudioContext === 'function') ? getAudioContext() : null;
        if (ctx && typeof ctx.decodeAudioData === 'function') {
            const cached = window.OFFICIAL_AUDIO_CACHE[soundKey];
            if (cached === 'fallback') {
                return playOfficialAudioElementFallback(data, baseUnscaled);
            }
            if (cached && cached.duration !== undefined) {
                return playOfficialAudioBuffer(ctx, cached, clampedVol, pan, baseUnscaled);
            }
            if (cached && typeof cached.then === 'function') {
                cached.then(buf => {
                    if (buf) playOfficialAudioBuffer(ctx, buf, clampedVol, pan, baseUnscaled);
                    else playOfficialAudioElementFallback(data, baseUnscaled);
                });
                return true;
            }
            const decodePromise = decodeOfficialAudioData(ctx, data).then(buf => {
                window.OFFICIAL_AUDIO_CACHE[soundKey] = buf;
                playOfficialAudioBuffer(ctx, buf, clampedVol, pan, baseUnscaled);
                return buf;
            }).catch(() => {
                window.OFFICIAL_AUDIO_CACHE[soundKey] = 'fallback';
                playOfficialAudioElementFallback(data, baseUnscaled);
                return null;
            });
            window.OFFICIAL_AUDIO_CACHE[soundKey] = decodePromise;
            return true;
        }
        return playOfficialAudioElementFallback(data, baseUnscaled);
        } catch (err) {
            console.warn('Official audio playback error for', soundKey, err);
            return false;
        }
    };
    if (window.OFFICIAL_AUDIO_DATA && window.OFFICIAL_AUDIO_DATA[soundKey]) return play();
    // Kick off lazy group load for subsequent plays, but return false now so caller plays synth fallback instead of silence
    loadOfficialAudioGroup(getOfficialAudioGroup(soundKey, faction)).catch(() => {});
    return false;
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
    } else if (t === 'worker' || t.includes('dozer') || t.includes('builder')) {
        norm = fac === 'china' ? 'dozer_china' : (fac === 'gla' ? 'worker' : 'dozer_usa');
    } else if (t === 'truck') {
        norm = fac === 'usa' ? 'chinook' : (fac === 'gla' ? 'worker' : 'truck');
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
    else if (t === 'mob') norm = 'rebel';
    else if (t === 'hijacker') norm = 'terrorist';

    let act = (action || 'select').toLowerCase();
    // Non-combat units re-route attack to move
    if (act === 'attack' && (norm === 'dozer_usa' || norm === 'dozer_china' || norm === 'worker' || norm === 'chinook' || norm === 'ambulance' || norm === 'radarvan' || norm === 'truck')) {
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
        else if (t === 'worker' || t.includes('dozer') || t.includes('builder')) unitKey = 'voice_usa_dozer_create';
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
        else if (t === 'worker' || t.includes('dozer') || t.includes('builder')) unitKey = 'voice_china_dozer_create';
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

const BUILDING_SELECT_SFX_MAP = {
    usa: {
        center: 'sfx_select_usa_center', commandCenter: 'sfx_select_usa_center',
        power: 'sfx_select_usa_power', coldFusionReactor: 'sfx_select_usa_power',
        barracks: 'sfx_select_usa_barracks', factory: 'sfx_select_usa_factory',
        supplyCenter: 'sfx_select_usa_supply', supplyDrop: 'sfx_select_usa_supplydrop',
        airfield: 'sfx_select_usa_airfield', strategyCenter: 'sfx_select_usa_strategy',
        patriot: 'sfx_patriot_select', detentionCamp: 'sfx_select_usa_detention',
        particleCannon: 'sfx_select_usa_particle'
    },
    china: {
        center: 'sfx_select_china_center', commandCenter: 'sfx_select_china_center',
        power: 'sfx_select_china_power', nuclearReactor: 'sfx_select_china_power',
        barracks: 'sfx_select_china_barracks', factory: 'sfx_select_china_factory',
        supplyCenter: 'sfx_select_china_supply', airfield: 'sfx_select_china_airfield',
        gatlingCannon: 'sfx_select_china_gatling', bunker: 'sfx_select_china_bunker',
        speakerTower: 'sfx_select_china_speaker', propagandaCenter: 'sfx_select_china_propaganda',
        nukeSilo: 'sfx_select_china_nuke', internetCenter: 'sfx_select_china_internet'
    },
    gla: {
        center: 'sfx_select_gla_center', commandCenter: 'sfx_select_gla_center',
        barracks: 'sfx_select_gla_barracks', factory: 'sfx_select_gla_factory',
        supplyCenter: 'sfx_select_gla_supply', supplyStash: 'sfx_select_gla_supply',
        tunnel: 'sfx_select_gla_tunnel', stingerSite: 'sfx_select_gla_stinger',
        palace: 'sfx_select_gla_palace', blackMarket: 'sfx_select_gla_blackmarket',
        scudStorm: 'sfx_select_gla_scud'
    }
};

function playBuildingSelectSound(structureType, faction = null) {
    if (!structureType) return false;
    const fac = (faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa') || 'usa').toLowerCase();
    const normFac = ['usa', 'china', 'gla'].includes(fac) ? fac : 'usa';
    const facMap = BUILDING_SELECT_SFX_MAP[normFac] || BUILDING_SELECT_SFX_MAP.usa;
    let key = facMap[structureType];
    if (!key) {
        for (const f of ['usa', 'china', 'gla']) {
            if (BUILDING_SELECT_SFX_MAP[f][structureType]) { key = BUILDING_SELECT_SFX_MAP[f][structureType]; break; }
        }
    }
    return key ? playOfficialSound(key, 0.55) : false;
}

const _lastEvaAlertTimes = {};
function playEvaAlert(eventName, faction = null) {
    if (!eventName) return false;
    const fac = (faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa') || 'usa').toLowerCase();
    const normFac = ['usa', 'china', 'gla'].includes(fac) ? fac : 'usa';
    const throttled = ['insufficient_funds', 'low_power', 'unit_lost', 'building_lost', 'unit_under_attack', 'ally_under_attack', 'base_under_attack', 'reinforcements'].includes(eventName);
    const now = Date.now();
    if (throttled && _lastEvaAlertTimes[eventName] && (now - _lastEvaAlertTimes[eventName]) < 4000) {
        return false;
    }
    _lastEvaAlertTimes[eventName] = now;
    if (eventName === 'unit_under_attack') {
        // Retail Generals has no "Unit under attack" EVA voice (euallyu/ecallyu/egallyu are "An ally is under attack"):
        // play only the radar alert ping when the player's own units are under fire.
        return playOfficialSound('sfx_radar_alert', 0.85);
    }
    if (eventName === 'base_under_attack' || eventName === 'ally_under_attack') {
        playOfficialSound('sfx_radar_alert', 0.85);
    }
    // Map ally_under_attack to the extracted retail euallyu/ecallyu/egallyu ("An ally is under attack") clip
    const audioEventKey = (eventName === 'ally_under_attack') ? 'unit_under_attack' : eventName;
    const key = `eva_${normFac}_${audioEventKey}`;
    if (window.OFFICIAL_AUDIO_DATA && window.OFFICIAL_AUDIO_DATA[key]) {
        return playOfficialSound(key, 0.92, normFac);
    }
    if (typeof loadOfficialAudioGroup === 'function') {
        loadOfficialAudioGroup(normFac).then(entries => {
            if (entries && entries[key]) playOfficialSound(key, 0.92, normFac);
        });
    }
    return false;
}

window.loadOfficialAudioGroup = loadOfficialAudioGroup;
window.preloadSkirmishAudio = preloadSkirmishAudio;
window.playOfficialSound = playOfficialSound;
window.playUnitVoice = playUnitVoice;
window.playUnitReadySound = playUnitReadySound;
window.playBuildingCompleteSound = playBuildingCompleteSound;
window.playSuperweaponEvaAlert = playSuperweaponEvaAlert;
window.playBuildingSelectSound = playBuildingSelectSound;
window.playEvaAlert = playEvaAlert;
