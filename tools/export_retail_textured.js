const fs = require('fs');
const path = require('path');
const { parseW3dModel } = require('./parse_w3d_clean');

const w3dDir = path.join(__dirname, '..', 'extracted_assets', 'w3d');
const texDir = path.join(__dirname, '..', 'extracted_assets', 'textures');

// Vehicles: scaled between 0.08 and 0.10 so tanks are ~2.7-3.9 units (sleek and proportional)
const VEHICLE_CONFIG = {
    // USA
    'crusader':       { file: 'avleopard.W3D',   tex: 'avleopard.dds',   scale: 0.090, faction: 'usa' },
    'paladin':        { file: 'avPaladin.W3D',    tex: 'avpaladin.dds',    scale: 0.090, faction: 'usa' },
    'humvee':         { file: 'AvHummer.W3D',     tex: 'avhummer.dds',     scale: 0.080, faction: 'usa' },
    'ambulance':      { file: 'AvAmbulance.W3D',  tex: 'avhummer.dds',     scale: 0.085, faction: 'usa' },
    'tomahawk':       { file: 'avtomahawk.W3D',   tex: 'avtomahawk.dds',   scale: 0.090, faction: 'usa' },
    'dozer':          { file: 'avconstdoz.W3D',   tex: 'avconstdoz.dds',   scale: 0.085, faction: 'usa' },
    'chinook':        { file: 'AVChinook.W3D',    tex: 'avchinook.dds',    scale: 0.085, faction: 'usa' },
    'comanche':       { file: 'AVComanche.W3D',   tex: 'avcomanche.dds',   scale: 0.080, faction: 'usa' },
    'raptor':         { file: 'avraptor.W3D',     tex: 'avraptor.dds',     scale: 0.085, faction: 'usa' },
    'stealthfighter': { file: 'avstealth.W3D',    tex: 'avstealth.dds',    scale: 0.085, faction: 'usa' },
    'aurora':         { file: 'AVAurora.W3D',     tex: 'avaurora.dds',     scale: 0.085, faction: 'usa' },
    'drone_battle':   { file: 'avbattledr.W3D',   tex: 'avbattledr.dds',   scale: 0.075, faction: 'usa' },

    // China
    'battlemaster':   { file: 'NVBtMstr.W3D',     tex: 'nvbtmstr.dds',     scale: 0.090, faction: 'china' },
    'overlord':       { file: 'NVOvrlrd.W3D',     tex: 'nvovrlrd.dds',     scale: 0.100, faction: 'china' },
    'gatling':        { file: 'NVGattTank.W3D',   tex: 'nvgatttank.dds',   scale: 0.085, faction: 'china' },
    'dragon':         { file: 'NVDragon.W3D',     tex: 'nvdragon.dds',     scale: 0.090, faction: 'china' },
    'crawler':        { file: 'NVTCrawler.W3D',   tex: 'nvtcrawler.dds',   scale: 0.090, faction: 'china' },
    'inferno':        { file: 'NVInferno.W3D',    tex: 'nvinferno.dds',    scale: 0.090, faction: 'china' },
    'nukecannon':     { file: 'NVNukeCn.W3D',     tex: 'nvnukecn.dds',     scale: 0.095, faction: 'china' },
    'truck':          { file: 'NVSSupplyTk.W3D',  tex: 'avsupplytk.dds',   scale: 0.085, faction: 'china' },
    'mig':            { file: 'NVMig.W3D',        tex: 'nvmig.dds',        scale: 0.085, faction: 'china' },

    // GLA
    'scorpion':       { file: 'UVLiteTank.W3D',   tex: 'uvlitetank.dds',   scale: 0.090, faction: 'gla' },
    'marauder':       { file: 'UVMarauder.W3D',   tex: 'uvmarauder.dds',   scale: 0.090, faction: 'gla' },
    'technical':      { file: 'UVTechTrck.W3D',   tex: 'uvtechtrck.dds',   scale: 0.080, faction: 'gla' },
    'quad':           { file: 'UVQuadCann.W3D',   tex: 'uvquadcann.dds',   scale: 0.085, faction: 'gla' },
    'buggy':          { file: 'UVRockBug.W3D',    tex: 'uvrockbug.dds',    scale: 0.080, faction: 'gla' },
    'toxintractor':   { file: 'UVToxinTrk.W3D',   tex: 'uvtoxintrk.dds',   scale: 0.085, faction: 'gla' },
    'bombtruck':      { file: 'UVBmbtruk.W3D',    tex: 'uvbmbtruk.dds',    scale: 0.085, faction: 'gla' },
    'scud':           { file: 'UVScudLchr.W3D',   tex: 'uvscudlchr.dds',   scale: 0.095, faction: 'gla' },
    'radarvan':       { file: 'UVRadarVan.W3D',   tex: 'uvradarvan.dds',   scale: 0.085, faction: 'gla' }
};

// Buildings: scaled between 0.14 and 0.16 so Command Center is ~20 units (6-8x larger than tanks)
const BUILDING_CONFIG = {
    // USA
    'usa_commandCenter':    { file: 'ABBtCmdHQ.W3D',   scale: 0.160, faction: 'usa' },
    'usa_power':            { file: 'ABPWRPLANT.W3D',  tex: 'abpwrplant.dds', scale: 0.140, faction: 'usa' },
    'usa_barracks':         { file: 'ABBARRACKS.W3D',  scale: 0.145, faction: 'usa' },
    'usa_factory':          { file: 'ABWarFact.W3D',   scale: 0.150, faction: 'usa' },
    'usa_supplyCenter':     { file: 'ABSUPPLYCT.W3D',  scale: 0.150, faction: 'usa' },
    'usa_supplyDrop':       { file: 'ABSupDrop.W3D',   scale: 0.150, faction: 'usa' },
    'usa_airfield':         { file: 'ABArFrcCmd.W3D',  scale: 0.150, faction: 'usa' },
    'usa_strategyCenter':   { file: 'ABStrategy.W3D',  tex: 'abstratcnt.dds', scale: 0.150, faction: 'usa' },
    'usa_patriot':          { file: 'ABPATRIOT.W3D',   tex: 'abpatriot.dds', scale: 0.130, faction: 'usa' },
    'usa_particleCannon':   { file: 'ABSDILink.W3D',   scale: 0.160, faction: 'usa' },
    'usa_detentionCamp':    { file: 'ABPrison.W3D',    scale: 0.145, faction: 'usa' },

    // China
    'china_commandCenter':  { file: 'NBConYard.W3D',   tex: 'nbconyard.dds', scale: 0.160, faction: 'china' },
    'china_power':          { file: 'NBPwrPlant.W3D',  scale: 0.140, faction: 'china' },
    'china_barracks':       { file: 'NBBarracks.W3D',  scale: 0.145, faction: 'china' },
    'china_factory':        { file: 'NBWarFact.W3D',   tex: 'nbwarfact.dds', scale: 0.150, faction: 'china' },
    'china_supplyCenter':   { file: 'NBSupCent.W3D',   scale: 0.150, faction: 'china' },
    'china_airfield':       { file: 'NBAirfield.W3D',  tex: 'nbairfield.dds', scale: 0.150, faction: 'china' },
    'china_gatlingCannon':  { file: 'NBGattling.W3D',  scale: 0.130, faction: 'china' },
    'china_bunker':         { file: 'NBBunker.W3D',    scale: 0.135, faction: 'china' },
    'china_speakerTower':   { file: 'NBPTower.W3D',    tex: 'nbptower.dds', scale: 0.130, faction: 'china' },
    'china_propagandaCenter':{ file: 'NBPCenter.W3D',  scale: 0.150, faction: 'china' },
    'china_nukeSilo':       { file: 'NBNMissle.W3D',   scale: 0.160, faction: 'china' },
    'china_internetCenter': { file: 'NBConYard.W3D',   tex: 'nbconyard.dds', scale: 0.160, faction: 'china' },

    // GLA
    'gla_commandCenter':    { file: 'UBCmdHQ.W3D',     scale: 0.160, faction: 'gla' },
    'gla_supplyCenter':     { file: 'UBSupply.W3D',    scale: 0.145, faction: 'gla' },
    'gla_barracks':         { file: 'UBBarracks.W3D',  scale: 0.145, faction: 'gla' },
    'gla_factory':          { file: 'UBArmDeal.W3D',   scale: 0.150, faction: 'gla' },
    'gla_tunnel':           { file: 'UBUndTunn.W3D',   tex: 'ubundtunn.dds', scale: 0.135, faction: 'gla' },
    'gla_stingerSite':      { file: 'UBStingerS.W3D',  scale: 0.135, faction: 'gla' },
    'gla_palace':           { file: 'UBPalace.W3D',    scale: 0.155, faction: 'gla' },
    'gla_blackMarket':      { file: 'UBBlackMkt.W3D',  scale: 0.150, faction: 'gla' },
    'gla_scudStorm':        { file: 'UBScudStrm.W3D',  scale: 0.160, faction: 'gla' },
    'gla_hole':             { file: 'UBHole.W3D',      scale: 0.140, faction: 'gla' },

    // Tech
    'tech_oilDerrick':      { file: 'ZBODerrick.W3D',  scale: 0.140, faction: 'tech' },
    'tech_hospital':        { file: 'ZBHospital.W3D',  scale: 0.150, faction: 'tech' },
    'tech_refinery':        { file: 'CBOilRfny.W3D',   scale: 0.150, faction: 'tech' }
};

// Retail Westwood 3D Infantry Characters (scaled to ~0.88 units tall, realistic human proportions)
const INFANTRY_CONFIG = {
    // USA
    'ranger':     { file: 'AIRNGR_SKN.W3D', tex: 'zhca_airanger.tga',   scale: 0.088, faction: 'usa' },
    'burton':     { file: 'AIHERO_SKN.W3D', tex: 'zhca_aihero2.tga',    scale: 0.092, faction: 'usa' },
    // China
    'redguard':   { file: 'NICNSC_SKN.W3D', tex: 'zhca_niconscrpt.tga', scale: 0.088, faction: 'china' },
    'tankhunter': { file: 'NITHNT_SKN.W3D', tex: 'zhca_nithunter.tga',  scale: 0.088, faction: 'china' },
    'hacker':     { file: 'NIHCKR_SKN.W3D', tex: 'zhca_nihacker.tga',   scale: 0.088, faction: 'china' },
    'lotus':      { file: 'NIHERO_SKN.W3D', tex: 'zhca_niblotus.tga',   scale: 0.085, faction: 'china' },
    // GLA
    'rebel':      { file: 'UIRGRD_SKN.W3D', tex: 'zhca_uirguard.tga',   scale: 0.088, faction: 'gla' },
    'rpg':        { file: 'UISMSD_SKN.W3D', tex: 'zhca_uirstnger.tga',  scale: 0.088, faction: 'gla' },
    'terrorist':  { file: 'UITRST_SKN.W3D', tex: 'zhca_uiter.tga',      scale: 0.088, faction: 'gla' },
    'jarmen':     { file: 'UIHERO_SKN.W3D', tex: 'zhca_uihero01.tga',   scale: 0.090, faction: 'gla' },
    'worker':     { file: 'UIWRKR_SKN.W3D', tex: 'zhca_uiworker.tga',   scale: 0.085, faction: 'gla' }
};

// Strict filter to eliminate light beams, muzzle flash billboards, and polygon spike glitches
function isFxGlitchMesh(name) {
    return /headlight|lightbeam|muzzlefx|turretfx|smokefx|exnk|exhaustfx|treadfx|firepoint/i.test(name);
}

function processModels(map) {
    const result = {};
    for (const [key, cfg] of Object.entries(map)) {
        const filePath = path.join(w3dDir, cfg.file);
        const parsed = parseW3dModel(filePath);
        if (!parsed) {
            console.warn(`WARNING: File not found: ${filePath}`);
            continue;
        }

        const filteredMeshes = {};
        for (const [mName, mData] of Object.entries(parsed.meshes)) {
            if (isFxGlitchMesh(mName)) continue;
            filteredMeshes[mName] = mData;
        }

        // Canonical 3D Axis Alignment for Aircraft:
        if (key === 'raptor') {
            // Permutation [z, x, y] aligns wings to X, height to Y, length to Z
            for (const m of Object.values(filteredMeshes)) {
                for (let i = 0; i < m.v.length; i += 3) {
                    const ox = m.v[i], oy = m.v[i+1], oz = m.v[i+2];
                    m.v[i] = oz; m.v[i+1] = ox; m.v[i+2] = oy;
                }
            }
            parsed.pivots.forEach(p => {
                const ox = p.tx, oy = p.ty, oz = p.tz;
                p.tx = oz; p.ty = ox; p.tz = oy;
            });
        } else if (key === 'aurora') {
            // Permutation [y, -z, x] aligns wings to X, height to Y, length to Z
            for (const m of Object.values(filteredMeshes)) {
                for (let i = 0; i < m.v.length; i += 3) {
                    const ox = m.v[i], oy = m.v[i+1], oz = m.v[i+2];
                    m.v[i] = oy; m.v[i+1] = -oz; m.v[i+2] = ox;
                }
            }
            parsed.pivots.forEach(p => {
                const ox = p.tx, oy = p.ty, oz = p.tz;
                p.tx = oy; p.ty = -oz; p.tz = ox;
            });
        } else if (key === 'comanche') {
            // Center rotor mast directly over helicopter cabin
            parsed.pivots.forEach(p => {
                if (p.name === 'PROPELLER01') { p.tx = 0; p.ty = 4.92; p.tz = 5.16; }
                if (p.name === 'PROPELLER02') { p.tx = 0; p.ty = -1.13; p.tz = -16.85; }
            });
        } else if (key === 'chinook') {
            // Center front and rear rotors directly on pylons
            parsed.pivots.forEach(p => {
                if (p.name === 'PROPELLER01') { p.tx = 0; p.ty = 5.21; p.tz = 12.74; }
                if (p.name === 'PROPELLER02') { p.tx = 0; p.ty = 7.20; p.tz = -17.06; }
            });
        }

        const meshEntries = parsed.hlodSubObjects.length > 0
            ? parsed.hlodSubObjects.filter(h => filteredMeshes[h.name] !== undefined).map(h => [h.boneIndex, h.name])
            : Object.keys(filteredMeshes).map(mName => [0, mName]);

        const compactPivots = parsed.pivots.map(p => [
            p.name,
            p.parentIndex,
            p.tx,
            p.ty,
            p.tz
        ]);

        result[key] = {
            f: cfg.faction,
            s: cfg.scale,
            p: compactPivots,
            h: meshEntries,
            m: filteredMeshes
        };
    }
    return result;
}

// Extract DDS (DXT1 Mip 1 = 128x128 = 8192 bytes) and TGA (64x64 RGBA)
const textureData = {};
function processTextures(configMap) {
    for (const [key, cfg] of Object.entries(configMap)) {
        if (!cfg.tex) continue;
        const texPath = path.join(texDir, cfg.tex);
        if (!fs.existsSync(texPath)) continue;

        if (cfg.tex.toLowerCase().endsWith('.tga')) {
            // Read uncompressed 32bpp TGA
            const buf = fs.readFileSync(texPath);
            const w = buf.readUInt16LE(12);
            const h = buf.readUInt16LE(14);
            const bpp = buf[16];
            const dataOffset = 18 + buf[0];
            const pixelCount = w * h;
            const rgba = Buffer.alloc(pixelCount * 4);
            if (bpp === 32) {
                for (let i = 0; i < pixelCount; i++) {
                    const src = dataOffset + i * 4;
                    rgba[i * 4 + 0] = buf[src + 2]; // R
                    rgba[i * 4 + 1] = buf[src + 1]; // G
                    rgba[i * 4 + 2] = buf[src + 0]; // B
                    rgba[i * 4 + 3] = buf[src + 3]; // A
                }
            } else if (bpp === 24) {
                for (let i = 0; i < pixelCount; i++) {
                    const src = dataOffset + i * 3;
                    rgba[i * 4 + 0] = buf[src + 2];
                    rgba[i * 4 + 1] = buf[src + 1];
                    rgba[i * 4 + 2] = buf[src + 0];
                    rgba[i * 4 + 3] = 255;
                }
            }
            textureData[key] = {
                t: 'raw',
                w,
                h,
                d: rgba.toString('base64')
            };
        } else {
            // DDS DXT1
            const buf = fs.readFileSync(texPath);
            const width = buf.readUInt32LE(16);
            const height = buf.readUInt32LE(12);
            const mip0Size = (width * height) / 2;
            const mip1Offset = 128 + mip0Size;
            const mip1Size = 128 * 128 / 2; // 8192 bytes for 128x128 DXT1

            if (buf.length >= mip1Offset + mip1Size) {
                const mip1Slice = buf.slice(mip1Offset, mip1Offset + mip1Size);
                textureData[key] = {
                    t: 'dxt1',
                    w: 128,
                    h: 128,
                    d: mip1Slice.toString('base64')
                };
            } else {
                const slice = buf.slice(128, 128 + Math.min(mip0Size, 32768));
                textureData[key] = {
                    t: 'dxt1',
                    w: Math.min(width, 128),
                    h: Math.min(height, 128),
                    d: slice.toString('base64')
                };
            }
        }
    }
}

processTextures(VEHICLE_CONFIG);
processTextures(BUILDING_CONFIG);
processTextures(INFANTRY_CONFIG);
console.log(`Extracted textures for ${Object.keys(textureData).length} assets.`);

const vehicleData = processModels(VEHICLE_CONFIG);
console.log(`Processed ${Object.keys(vehicleData).length} vehicles.`);

const buildingData = processModels(BUILDING_CONFIG);
console.log(`Processed ${Object.keys(buildingData).length} buildings.`);

const infantryData = processModels(INFANTRY_CONFIG);
console.log(`Processed ${Object.keys(infantryData).length} infantry characters.`);

const jsOutput = `/**
 * Command & Conquer: Generals Authentic Westwood 3D Retail Assets (Vehicles, Structures & Infantry)
 * Real EA retail models with UV mapping and embedded textures (DXT1 & TGA).
 * Proportional scale: Buildings (0.14-0.16) > Vehicles (0.08-0.10) > Infantry (0.085-0.09).
 */

window.W3D_VEHICLE_DATA = ${JSON.stringify(vehicleData)};
window.W3D_BUILDING_DATA = ${JSON.stringify(buildingData)};
window.W3D_INFANTRY_DATA = ${JSON.stringify(infantryData)};
window.W3D_TEXTURE_DATA = ${JSON.stringify(textureData)};

window.W3D_TEXTURE_CACHE = {};

/**
 * In-browser texture loader (supporting both DXT1 BC1 and raw TGA pixel buffers) to native Three.js DataTexture.
 */
function getW3dTexture(modelKey) {
    if (window.W3D_TEXTURE_CACHE[modelKey]) return window.W3D_TEXTURE_CACHE[modelKey];
    if (!window.W3D_TEXTURE_DATA || !window.W3D_TEXTURE_DATA[modelKey]) return null;

    try {
        const item = window.W3D_TEXTURE_DATA[modelKey];
        const b64 = item.d;
        const binaryStr = (typeof atob === 'function') ? atob(b64) : (typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64').toString('binary') : '');
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryStr.charCodeAt(i);

        let tex;
        if (item.t === 'raw') {
            // Raw 32-bit RGBA from uncompressed TGA
            tex = new THREE.DataTexture(bytes, item.w, item.h, THREE.RGBAFormat);
        } else {
            // In-browser DXT1 (BC1) Decoder to 128x128 RGBA
            const width = item.w || 128, height = item.h || 128;
            const rgba = new Uint8Array(width * height * 4);
            let offset = 0;

            for (let by = 0; by < height; by += 4) {
                for (let bx = 0; bx < width; bx += 4) {
                    if (offset + 8 > len) break;
                    const c0 = bytes[offset] | (bytes[offset + 1] << 8);
                    const c1 = bytes[offset + 2] | (bytes[offset + 3] << 8);
                    offset += 4;

                    const r0 = (((c0 >> 11) & 0x1F) * 255 / 31) | 0;
                    const g0 = (((c0 >> 5) & 0x3F) * 255 / 63) | 0;
                    const b0 = ((c0 & 0x1F) * 255 / 31) | 0;

                    const r1 = (((c1 >> 11) & 0x1F) * 255 / 31) | 0;
                    const g1 = (((c1 >> 5) & 0x3F) * 255 / 63) | 0;
                    const b1 = ((c1 & 0x1F) * 255 / 31) | 0;

                    const colors = [
                        [r0, g0, b0, 255],
                        [r1, g1, b1, 255],
                        c0 > c1 ? [((2*r0 + r1)/3)|0, ((2*g0 + g1)/3)|0, ((2*b0 + b1)/3)|0, 255]
                                : [((r0 + r1)/2)|0, ((g0 + g1)/2)|0, ((b0 + b1)/2)|0, 255],
                        c0 > c1 ? [((r0 + 2*r1)/3)|0, ((g0 + 2*g1)/3)|0, ((b0 + 2*b1)/3)|0, 255]
                                : [0, 0, 0, 0]
                    ];

                    const lookup = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
                    offset += 4;

                    for (let py = 0; py < 4; py++) {
                        for (let px = 0; px < 4; px++) {
                            const idx = (lookup >> (2 * (py * 4 + px))) & 0x03;
                            const col = colors[idx];
                            const outIdx = ((by + py) * width + (bx + px)) * 4;
                            rgba[outIdx] = col[0];
                            rgba[outIdx + 1] = col[1];
                            rgba[outIdx + 2] = col[2];
                            rgba[outIdx + 3] = col[3];
                        }
                    }
                }
            }
            tex = new THREE.DataTexture(rgba, width, height, THREE.RGBAFormat);
        }

        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.flipY = false;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        window.W3D_TEXTURE_CACHE[modelKey] = tex;
        return tex;
    } catch (err) {
        console.warn('Error decoding texture for', modelKey, err);
        return null;
    }
}

/**
 * Creates an authentic Westwood 3D vehicle mesh with UV texture mapping & pivot hierarchy.
 */
function createW3DVehicleMesh(modelKey, isEnemy = false, fallbackFn = null) {
    if (!window.W3D_VEHICLE_DATA || !window.W3D_VEHICLE_DATA[modelKey]) {
        if (typeof fallbackFn === 'function') return fallbackFn(isEnemy);
        return new THREE.Group();
    }

    const data = window.W3D_VEHICLE_DATA[modelKey];
    const faction = data.f;
    const scale = data.s || 0.09;

    // Faction materials
    const vTex = getW3dTexture(modelKey);
    let hullMat, houseMat;
    if (isEnemy) {
        hullMat = vTex 
            ? new THREE.MeshStandardMaterial({ map: vTex, color: 0x993333, roughness: 0.6, metalness: 0.25 })
            : new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.52, metalness: 0.35 });
        houseMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.55, metalness: 0.25 });
    } else {
        if (vTex) {
            hullMat = new THREE.MeshStandardMaterial({ map: vTex, roughness: 0.65, metalness: 0.28 });
        } else {
            if (faction === 'usa') {
                hullMat = (typeof matUSA !== 'undefined') ? matUSA : new THREE.MeshStandardMaterial({ color: 0x7a7d5a, roughness: 0.58, metalness: 0.32 });
            } else if (faction === 'china') {
                hullMat = (typeof matChina !== 'undefined') ? matChina : new THREE.MeshStandardMaterial({ color: 0x48583a, roughness: 0.55, metalness: 0.35 });
            } else {
                hullMat = (typeof matGLA !== 'undefined') ? matGLA : new THREE.MeshStandardMaterial({ color: 0x5c5040, roughness: 0.8, metalness: 0.25 });
            }
        }
        if (faction === 'usa') {
            houseMat = (typeof matUSAColor !== 'undefined') ? matUSAColor : new THREE.MeshStandardMaterial({ color: 0x1e3f66, roughness: 0.6, metalness: 0.3 });
        } else if (faction === 'china') {
            houseMat = (typeof matChinaColor !== 'undefined') ? matChinaColor : new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.6, metalness: 0.32 });
        } else {
            houseMat = (typeof matGLAColor !== 'undefined') ? matGLAColor : new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.82, metalness: 0.2 });
        }
    }

    const treadMat = (typeof matTread !== 'undefined') ? matTread : new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.85, metalness: 0.45 });
    const darkMat = (typeof matDarkMetal !== 'undefined') ? matDarkMetal : new THREE.MeshStandardMaterial({ color: 0x181a1d, roughness: 0.5, metalness: 0.75 });
    const gunMat = (typeof matGunmetal !== 'undefined') ? matGunmetal : new THREE.MeshStandardMaterial({ color: 0x2e3338, roughness: 0.38, metalness: 0.82 });
    const glassMat = (typeof matBlueGlass !== 'undefined') ? matBlueGlass : new THREE.MeshStandardMaterial({ color: 0x00d2d3, roughness: 0.08, metalness: 0.9, transparent: true, opacity: 0.85 });

    // 1. Build Pivot hierarchy
    const pivotGroups = [];
    data.p.forEach(p => {
        const [name, parentIdx, tx, ty, tz] = p;
        const grp = new THREE.Group();
        grp.name = name;
        grp.position.set(tx, ty, tz);

        const upper = name.toUpperCase();
        if (upper === 'TURRET01' || upper === 'TURRET') {
            grp.name = 'turretSystem';
        } else if (upper === 'BARREL01') {
            grp.name = (modelKey === 'gatling' || modelKey === 'quad') ? 'gatlingBarrels' : 'barrelSystem';
        } else if (upper === 'PROPELLER01' || upper === 'ROTOR01') {
            grp.name = (modelKey === 'chinook') ? 'chinook_rotor1' : 'comanche_rotor';
        } else if (upper === 'PROPELLER02') {
            grp.name = 'chinook_rotor2';
        } else if (upper === 'RADAR' || upper === 'RADARDISH01') {
            grp.name = 'radarDish';
        } else if (upper === 'LASER') {
            grp.name = 'pointDefenseLaser';
        }
        pivotGroups.push({ grp, parentIdx, name });
    });

    const root = new THREE.Group();
    pivotGroups.forEach(pg => {
        if (pg.parentIdx >= 0 && pivotGroups[pg.parentIdx]) {
            pivotGroups[pg.parentIdx].grp.add(pg.grp);
        } else {
            root.add(pg.grp);
        }
    });

    // 2. Attach SubMeshes with UVs
    data.h.forEach(([boneIdx, meshName]) => {
        const mdata = data.m[meshName];
        if (!mdata || !mdata.v || !mdata.i) return;

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(mdata.v, 3));
        if (mdata.u && mdata.u.length > 0) {
            geom.setAttribute('uv', new THREE.Float32BufferAttribute(mdata.u, 2));
        }
        geom.setIndex(mdata.i);
        geom.computeVertexNormals();

        const upper = meshName.toUpperCase();
        let mat = hullMat;
        if (upper.includes('HOUSECOLOR')) {
            mat = houseMat;
        } else if (upper.includes('TREAD')) {
            mat = treadMat;
        } else if (upper.includes('BARREL') || upper.includes('GUN') || upper.includes('CANNON')) {
            mat = gunMat;
        } else if (upper.includes('GLASS') || upper.includes('WINDSHIELD')) {
            mat = glassMat;
        } else if (upper.includes('TIRE') || upper.includes('WHEEL')) {
            mat = darkMat;
        }

        const mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        if (pivotGroups[boneIdx]) {
            pivotGroups[boneIdx].grp.add(mesh);
        } else {
            root.add(mesh);
        }
    });

    if (!root.getObjectByName('turretSystem')) {
        const altTurret = root.getObjectByName('TURRET01') || root.getObjectByName('TURRET');
        if (altTurret) altTurret.name = 'turretSystem';
    }

    if (['chinook', 'comanche', 'raptor', 'stealthfighter', 'aurora', 'mig'].includes(modelKey)) {
        root.userData.isAir = true;
        const flightAlts = {
            'chinook': 8.0,
            'comanche': 7.5,
            'raptor': 9.0,
            'stealthfighter': 9.0,
            'aurora': 10.5,
            'mig': 9.5
        };
        root.userData.flightAltitude = flightAlts[modelKey] || 8.5;
    }

    if (modelKey === 'truck') {
        const cargo = new THREE.Group();
        cargo.name = "cargoHold";
        root.add(cargo);
    }

    // Attach Battle Drone to Paladin Tank
    if (modelKey === 'paladin') {
        const drone = createW3DVehicleMesh('drone_battle', isEnemy);
        drone.name = 'paladinBattleDrone';
        drone.position.set(0, 2.4 / scale, -2.6 / scale); // Offset in local space above & behind tank
        root.add(drone);
    }

    root.userData.isW3D = true;
    root.scale.set(scale, scale, scale);
    return root;
}

/**
 * Creates an authentic Westwood 3D building mesh with UV mapping, real textures & reactor glow.
 */
function createW3DBuildingMesh(buildingKey, isEnemy = false, fallbackFn = null) {
    if (!window.W3D_BUILDING_DATA || !window.W3D_BUILDING_DATA[buildingKey]) {
        if (typeof fallbackFn === 'function') return fallbackFn(isEnemy);
        return new THREE.Group();
    }

    const data = window.W3D_BUILDING_DATA[buildingKey];
    const faction = data.f;
    const scale = data.s || 0.15;
    const bTex = getW3dTexture(buildingKey);

    // Faction materials
    let bldMat, accentMat;
    if (isEnemy) {
        bldMat = bTex
            ? new THREE.MeshStandardMaterial({ map: bTex, color: 0xaa4444, roughness: 0.65, metalness: 0.25 })
            : new THREE.MeshStandardMaterial({ color: 0x772222, roughness: 0.65, metalness: 0.25 });
        accentMat = new THREE.MeshStandardMaterial({ color: 0x992222, roughness: 0.55, metalness: 0.25 });
    } else {
        if (bTex) {
            bldMat = new THREE.MeshStandardMaterial({ map: bTex, roughness: 0.65, metalness: 0.25 });
        } else {
            if (faction === 'usa') {
                bldMat = (typeof matUSA !== 'undefined') ? matUSA : new THREE.MeshStandardMaterial({ color: 0x7a7d5a, roughness: 0.6, metalness: 0.28 });
            } else if (faction === 'china') {
                bldMat = (typeof matChina !== 'undefined') ? matChina : new THREE.MeshStandardMaterial({ color: 0x48583a, roughness: 0.6, metalness: 0.3 });
            } else if (faction === 'gla') {
                bldMat = (typeof matGLA !== 'undefined') ? matGLA : new THREE.MeshStandardMaterial({ color: 0x5c5040, roughness: 0.82, metalness: 0.2 });
            } else {
                bldMat = new THREE.MeshStandardMaterial({ color: 0x6e6e6e, roughness: 0.7, metalness: 0.3 });
            }
        }
        if (faction === 'usa') {
            accentMat = (typeof matUSAColor !== 'undefined') ? matUSAColor : new THREE.MeshStandardMaterial({ color: 0x1e3f66, roughness: 0.58, metalness: 0.3 });
        } else if (faction === 'china') {
            accentMat = (typeof matChinaColor !== 'undefined') ? matChinaColor : new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.55, metalness: 0.32 });
        } else if (faction === 'gla') {
            accentMat = (typeof matGLAColor !== 'undefined') ? matGLAColor : new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.78, metalness: 0.2 });
        } else {
            accentMat = new THREE.MeshStandardMaterial({ color: 0xd4ac0d, roughness: 0.5, metalness: 0.4 });
        }
    }

    const concreteMat = (typeof matConcrete !== 'undefined') ? matConcrete : new THREE.MeshStandardMaterial({ color: 0x5a5854, roughness: 0.9, metalness: 0.1 });
    const metalMat = (typeof matDarkMetal !== 'undefined') ? matDarkMetal : new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.55, metalness: 0.7 });
    const gunMat = (typeof matGunmetal !== 'undefined') ? matGunmetal : new THREE.MeshStandardMaterial({ color: 0x2e3338, roughness: 0.4, metalness: 0.8 });
    const glassMat = (typeof matBlueGlass !== 'undefined') ? matBlueGlass : new THREE.MeshStandardMaterial({ color: 0x00d2d3, roughness: 0.1, metalness: 0.85, transparent: true, opacity: 0.8 });
    const nukeMat = (typeof matNukeGreen !== 'undefined') ? matNukeGreen : new THREE.MeshStandardMaterial({ color: 0x2ed573, emissive: 0x2ed573, emissiveIntensity: 0.8 });
    
    // Iconic Cold Fusion Reactor glowing blue plasma rods material
    const coldFusionGlowMat = new THREE.MeshStandardMaterial({
        color: 0x00d2d3,
        emissive: 0x00a8ff,
        emissiveIntensity: 1.6,
        roughness: 0.1,
        metalness: 0.3
    });

    // 1. Build Pivot hierarchy
    const pivotGroups = [];
    data.p.forEach(p => {
        const [name, parentIdx, tx, ty, tz] = p;
        const grp = new THREE.Group();
        grp.name = name;
        grp.position.set(tx, ty, tz);

        const upper = name.toUpperCase();
        if (upper === 'TURRET' || upper === 'TURRET01') {
            grp.name = 'turretSystem';
        } else if (upper.includes('BARRELS')) {
            grp.name = 'gatlingBarrels';
        } else if (upper.includes('RADAR') || upper.includes('DISH')) {
            grp.name = 'radarDish';
        }
        pivotGroups.push({ grp, parentIdx, name });
    });

    const root = new THREE.Group();
    pivotGroups.forEach(pg => {
        if (pg.parentIdx >= 0 && pivotGroups[pg.parentIdx]) {
            pivotGroups[pg.parentIdx].grp.add(pg.grp);
        } else {
            root.add(pg.grp);
        }
    });

    // 2. Attach SubMeshes with UVs
    data.h.forEach(([boneIdx, meshName]) => {
        const mdata = data.m[meshName];
        if (!mdata || !mdata.v || !mdata.i) return;

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(mdata.v, 3));
        if (mdata.u && mdata.u.length > 0) {
            geom.setAttribute('uv', new THREE.Float32BufferAttribute(mdata.u, 2));
        }
        geom.setIndex(mdata.i);
        geom.computeVertexNormals();

        const upper = meshName.toUpperCase();
        let mat = bldMat;
        if (buildingKey === 'usa_power' && (upper.includes('CYLINDER01') || upper.includes('CYLINDER02') || upper.includes('CYLINDER'))) {
            mat = coldFusionGlowMat;
        } else if (upper.includes('HOUSECOLOR') || upper.includes('BANNER')) {
            mat = accentMat;
        } else if (upper.includes('BASE') || upper.includes('CONCRETE') || upper.includes('SLAB') || upper.includes('FOUNDATION') || upper.includes('FENCE')) {
            mat = concreteMat;
        } else if (upper.includes('GLASS') || upper.includes('WINDOW')) {
            mat = glassMat;
        } else if (upper.includes('WIRE') || upper.includes('LADDER') || upper.includes('RAILING') || upper.includes('FAN')) {
            mat = metalMat;
        } else if (upper.includes('BARREL') || upper.includes('GUN') || upper.includes('TURRET') || upper.includes('CANNON')) {
            mat = gunMat;
        } else if (upper.includes('GLOW') || upper.includes('NUKE')) {
            mat = nukeMat;
        }

        const mesh = new THREE.Mesh(geom, mat);
        mesh.name = meshName;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        if (pivotGroups[boneIdx]) {
            pivotGroups[boneIdx].grp.add(mesh);
        } else {
            root.add(mesh);
        }
    });

    if (!root.getObjectByName('turretSystem')) {
        const altTurret = root.getObjectByName('TURRET') || root.getObjectByName('TURRET01');
        if (altTurret) altTurret.name = 'turretSystem';
    }

    root.userData.isW3D = true;
    root.scale.set(scale, scale, scale);
    return root;
}

/**
 * Creates an authentic Westwood 3D retail infantry mesh with authentic uniform textures.
 */
function createW3DInfantryMesh(infantryKey, isEnemy = false, fallbackFn = null) {
    if (!window.W3D_INFANTRY_DATA || !window.W3D_INFANTRY_DATA[infantryKey]) {
        if (typeof fallbackFn === 'function') {
            const fallbackMesh = fallbackFn(isEnemy);
            fallbackMesh.scale.set(0.52, 0.52, 0.52);
            return fallbackMesh;
        }
        return new THREE.Group();
    }

    const data = window.W3D_INFANTRY_DATA[infantryKey];
    const faction = data.f;
    const scale = data.s || 0.088;
    const iTex = getW3dTexture(infantryKey);

    let skinMat;
    if (iTex) {
        skinMat = new THREE.MeshStandardMaterial({
            map: iTex,
            roughness: 0.72,
            metalness: 0.15,
            color: isEnemy ? 0xcc6666 : 0xffffff
        });
    } else {
        const col = (faction === 'usa') ? 0x1e3f66 : (faction === 'china') ? 0xcc0000 : 0x2e8b57;
        skinMat = new THREE.MeshStandardMaterial({ color: isEnemy ? 0x882222 : col, roughness: 0.7 });
    }

    const root = new THREE.Group();
    data.h.forEach(([_, meshName]) => {
        const mdata = data.m[meshName];
        if (!mdata || !mdata.v || !mdata.i) return;

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(mdata.v, 3));
        if (mdata.u && mdata.u.length > 0) {
            geom.setAttribute('uv', new THREE.Float32BufferAttribute(mdata.u, 2));
        }
        geom.setIndex(mdata.i);
        geom.computeVertexNormals();

        const mesh = new THREE.Mesh(geom, skinMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        root.add(mesh);
    });

    root.userData.isW3D = true;
    root.userData.isInfantry = true;
    root.scale.set(scale, scale, scale);
    return root;
}
`;

const outputPath = path.join(__dirname, '..', 'src', 'js', '02b_w3d_models.js');
fs.writeFileSync(outputPath, jsOutput, 'utf8');
console.log(`\nSuccessfully exported textured assets to: ${outputPath} (${(jsOutput.length / 1024).toFixed(1)} KB)`);
