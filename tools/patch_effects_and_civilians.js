const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { parseW3dModel } = require('./parse_w3d_clean');

const root = path.resolve(__dirname, '..');
const scratchTmp = path.join(root, 'assets', '_tmp_w3d_effects_patch');
fs.mkdirSync(scratchTmp, { recursive: true });

function readBigIndex(bigPath) {
    const map = new Map();
    if (!fs.existsSync(bigPath)) return map;
    const buf = fs.readFileSync(bigPath);
    const count = buf.readUInt32BE(8);
    let pos = 16;
    for (let i = 0; i < count; i++) {
        const off = buf.readUInt32BE(pos);
        const size = buf.readUInt32BE(pos + 4);
        pos += 8;
        let end = pos;
        while (end < buf.length && buf[end] !== 0) end++;
        const fullName = buf.toString('ascii', pos, end);
        pos = end + 1;
        const base = fullName.replace(/.*[\\\/]/, '').toLowerCase();
        if (!map.has(base)) {
            map.set(base, { bigPath, buf, off, size, fullName });
        }
    }
    return map;
}

// Prefer Zero Hour assets when overridden, fall back to base Generals
const w3dZhBig = readBigIndex(path.join(root, 'generals_big_files', 'W3DZH.big'));
const w3dBig = readBigIndex(path.join(root, 'generals_big_files', 'W3D.big'));
const texZhBig = readBigIndex(path.join(root, 'generals_big_files', 'TexturesZH.big'));
const texBig = readBigIndex(path.join(root, 'generals_big_files', 'Textures.big'));

function getBigFileBuffer(fileName, indices) {
    const key = fileName.toLowerCase();
    for (const idx of indices) {
        const entry = idx.get(key);
        if (entry) return entry.buf.subarray(entry.off, entry.off + entry.size);
    }
    return null;
}

function decodeTextureBuffer(fileName, buf) {
    const ext = path.extname(fileName).toLowerCase();
    if (ext === '.tga') {
        const w = buf.readUInt16LE(12);
        const h = buf.readUInt16LE(14);
        const bpp = buf[16];
        const dataOffset = 18 + buf[0];
        const pixelCount = w * h;
        const rgba = Buffer.alloc(pixelCount * 4);
        if (bpp === 32) {
            for (let i = 0; i < pixelCount; i++) {
                const src = dataOffset + i * 4;
                rgba[i * 4 + 0] = buf[src + 2];
                rgba[i * 4 + 1] = buf[src + 1];
                rgba[i * 4 + 2] = buf[src + 0];
                rgba[i * 4 + 3] = buf[src + 3];
            }
        } else if (bpp === 24) {
            for (let i = 0; i < pixelCount; i++) {
                const src = dataOffset + i * 3;
                rgba[i * 4 + 0] = buf[src + 2];
                rgba[i * 4 + 1] = buf[src + 1];
                rgba[i * 4 + 2] = buf[src + 0];
                rgba[i * 4 + 3] = 255;
            }
        } else {
            throw new Error(`Unsupported TGA bpp=${bpp} for ${fileName}`);
        }
        return { t: 'raw', w, h, d: rgba.toString('base64') };
    }

    const width = buf.readUInt32LE(16);
    const height = buf.readUInt32LE(12);
    const fourCC = buf.toString('ascii', 84, 88).replace(/\0/g, '').trim();
    if (fourCC === 'DXT1' || fourCC === 'DXT5') {
        const isDxt5 = (fourCC === 'DXT5');
        const blockSize = isDxt5 ? 16 : 8;
        let curW = width, curH = height, curOffset = 128;
        while (curW > 128 && curH > 128 && curOffset < buf.length) {
            const blocks = Math.max(1, Math.floor(curW / 4)) * Math.max(1, Math.floor(curH / 4));
            curOffset += blocks * blockSize;
            curW = Math.floor(curW / 2);
            curH = Math.floor(curH / 2);
        }
        const targetBlocks = Math.max(1, Math.floor(curW / 4)) * Math.max(1, Math.floor(curH / 4));
        const targetSize = targetBlocks * blockSize;
        const slice = buf.subarray(curOffset, curOffset + targetSize);
        return { t: isDxt5 ? 'dxt5' : 'dxt1', w: curW, h: curH, d: slice.toString('base64') };
    }

    const bpp = buf.readUInt32LE(88);
    const pixelCount = width * height;
    const rgba = Buffer.alloc(pixelCount * 4);
    const dataStart = 128;
    if (bpp === 32) {
        for (let i = 0; i < pixelCount; i++) {
            const s = dataStart + i * 4;
            rgba[i * 4 + 0] = buf[s + 2];
            rgba[i * 4 + 1] = buf[s + 1];
            rgba[i * 4 + 2] = buf[s + 0];
            rgba[i * 4 + 3] = buf[s + 3];
        }
    } else if (bpp === 24) {
        for (let i = 0; i < pixelCount; i++) {
            const s = dataStart + i * 3;
            rgba[i * 4 + 0] = buf[s + 2];
            rgba[i * 4 + 1] = buf[s + 1];
            rgba[i * 4 + 2] = buf[s + 0];
            rgba[i * 4 + 3] = 255;
        }
    } else {
        throw new Error(`Unsupported DDS format fourCC="${fourCC}" bpp=${bpp} for ${fileName}`);
    }
    return { t: 'raw', w: width, h: height, d: rgba.toString('base64') };
}

function parseW3dFromBig(w3dFileName, faction, scale, dropRe = null, fallbackTex = null) {
    const buf = getBigFileBuffer(w3dFileName, [w3dZhBig, w3dBig]);
    if (!buf) throw new Error(`Missing W3D file: ${w3dFileName}`);
    const tmpFile = path.join(scratchTmp, w3dFileName);
    fs.writeFileSync(tmpFile, buf);
    const parsed = parseW3dModel(tmpFile);
    fs.unlinkSync(tmpFile);

    const filteredMeshes = {};
    for (const [mName, mData] of Object.entries(parsed.meshes || {})) {
        if (!mData.v || mData.v.length === 0 || !mData.i || mData.i.length === 0) continue;
        if (dropRe && (dropRe.test(mName) || (mData.tex && dropRe.test(mData.tex)))) continue;
        // Skip pure sky/reflection submeshes when real diffuse meshes exist
        if (mName.endsWith('__tex_lakedusk')) continue;
        if (mData.tex && /lakedusk|envmap|reflect/i.test(mData.tex)) {
            mData.tex = fallbackTex || mData.tex;
        }
        filteredMeshes[mName] = mData;
    }
    const meshEntries = (parsed.hlodSubObjects || [])
        .filter(h => filteredMeshes[h.name] !== undefined)
        .map(h => [h.boneIndex, h.name]);
    const compactPivots = (parsed.pivots || []).map(p => [p.name, p.parentIndex, p.tx, p.ty, p.tz]);
    return { f: faction, s: scale, p: compactPivots, h: meshEntries, m: filteredMeshes };
}

// 1. Load existing 02b_w3d_models.js cleanly (lines 1..11)
const w3dPath = path.join(root, 'src', 'js', '02b_w3d_models.js');
const lines = fs.readFileSync(w3dPath, 'utf8').split(/\r?\n/);
const headerCode = lines.slice(0, 11).join('\n');
const sb = { window: {} };
vm.runInNewContext(headerCode, sb);

const W3D_VEHICLE_DATA = sb.window.W3D_VEHICLE_DATA;
const W3D_BUILDING_DATA = sb.window.W3D_BUILDING_DATA;
const W3D_INFANTRY_DATA = sb.window.W3D_INFANTRY_DATA;
const W3D_TEXTURE_DATA = sb.window.W3D_TEXTURE_DATA;

// 2. Patch Vehicles: A-10 Warthog & Spy Drone
W3D_VEHICLE_DATA['a10_warthog'] = parseW3dFromBig('AVWarthog.W3D', 'usa', 0.24, /muzzlefx|light\d*|smoke\d*|treadfx/i, 'avwarthog.dds');
W3D_VEHICLE_DATA['spy_drone'] = parseW3dFromBig('AVSpyDrone.W3D', 'usa', 0.28, /muzzlefx|light\d*/i, 'avrepairdr.dds');

// 3. Patch Civilian Buildings & Official Retail _G (Garrisoned) Pairs
const civSpecs = [
    { key: 'civilian_bunker_g', file: 'CBBunker01_G.W3D', scale: 0.26, primaryTex: 'cbbunker01_g.dds' },
    { key: 'civilian_house1_g', file: 'CBMogdis01_G.W3D', scale: 0.25, primaryTex: 'cbmogdis01_g.dds' },
    { key: 'civilian_house2_g', file: 'CBMogdis02_g.W3D', scale: 0.25, primaryTex: 'cbmogdis02_g.dds' },
    { key: 'civilian_hangar_g', file: 'CBTHanger1_g.W3D', scale: 0.25, primaryTex: 'cbthanger1.dds' },
    { key: 'civilian_desert_house', file: 'CBTHouse01.W3D', scale: 0.25, primaryTex: 'cbthouse01.dds' },
    { key: 'civilian_desert_house_g', file: 'CBTHouse01_G.W3D', scale: 0.25, primaryTex: 'cbthouse01_g.dds' },
    { key: 'civilian_chalet', file: 'CBChalet.W3D', scale: 0.25, primaryTex: 'cbchalet.dds' },
    { key: 'civilian_chalet_g', file: 'CBChalet_G.W3D', scale: 0.25, primaryTex: 'cbchalet_g.dds' },
    { key: 'civilian_soviet', file: 'CBSovBldg.W3D', scale: 0.25, primaryTex: 'cbsovbldg.dds' },
    { key: 'civilian_soviet_g', file: 'CBSovBldg_G.W3D', scale: 0.25, primaryTex: 'cbsovbldg_g.dds' },
    { key: 'civilian_cottage', file: 'CBGCtage01.w3d', scale: 0.25, primaryTex: 'cbgctage01.dds' },
    { key: 'civilian_cottage_g', file: 'CBGCtage01_G.w3d', scale: 0.25, primaryTex: 'cbgctage01_g.dds' },
    { key: 'civilian_euro', file: 'CBEuroCnd.W3D', scale: 0.25, primaryTex: 'cbeurocnd.dds' },
    { key: 'civilian_euro_g', file: 'CBEuroCnd_g.W3D', scale: 0.25, primaryTex: 'cbeurocnd_g.dds' }
];

for (const spec of civSpecs) {
    const model = parseW3dFromBig(spec.file, 'neutral', spec.scale, null, spec.primaryTex);
    // Ensure housecolorpole without texture stays clean
    W3D_BUILDING_DATA[spec.key] = model;
    console.log(`Parsed ${spec.key} (${spec.file}): ${Object.keys(model.m).length} meshes`);
}

// Re-verify existing civilian_house1 has cbmogdis01.dds (never lakedusk)
if (W3D_BUILDING_DATA['civilian_house1'] && W3D_BUILDING_DATA['civilian_house1'].m) {
    for (const m of Object.values(W3D_BUILDING_DATA['civilian_house1'].m)) {
        if (!m.tex || /lakedusk/i.test(m.tex)) m.tex = 'cbmogdis01.dds';
    }
}

// 4. Decode and insert all required textures into W3D_TEXTURE_DATA
function addTextureKey(alias, texFile) {
    const clean = path.basename(texFile).toLowerCase();
    const base = path.basename(clean, path.extname(clean));
    const tryOrder = clean.endsWith('.tga')
        ? [clean, base + '.tga', base + '.dds']
        : [clean, base + '.dds', base + '.tga'];
    for (const candidate of tryOrder) {
        const buf = getBigFileBuffer(candidate, [texZhBig, texBig]);
        if (buf) {
            const decoded = decodeTextureBuffer(candidate, buf);
            W3D_TEXTURE_DATA[base] = decoded;
            if (alias) W3D_TEXTURE_DATA[alias.toLowerCase()] = decoded;
            return true;
        }
    }
    return false;
}

const explicitTextures = {
    'a10_warthog': 'avwarthog.dds',
    'avwarthog': 'avwarthog.dds',
    'spy_drone': 'avrepairdr.dds',
    'avrepairdr': 'avrepairdr.dds',
    'pmsandbags2': 'pmsandbags2.dds',
    'pmsandbags2_d': 'pmsandbags2_d.dds',
    'pmbarbwire': 'pmbarbwire.dds',
    'pmbarbwire2': 'pmbarbwire2.dds',
    'housecolor': 'housecolor.dds',
    'housecolor2': 'housecolor2.dds',
    'civilian_bunker_g': 'cbbunker01_g.dds',
    'civilian_house1_g': 'cbmogdis01_g.dds',
    'civilian_house2_g': 'cbmogdis02_g.dds',
    'civilian_hangar_g': 'cbthanger1.dds',
    'civilian_desert_house': 'cbthouse01.dds',
    'civilian_desert_house_g': 'cbthouse01_g.dds',
    'civilian_chalet': 'cbchalet.dds',
    'civilian_chalet_g': 'cbchalet_g.dds',
    'civilian_soviet': 'cbsovbldg.dds',
    'civilian_soviet_g': 'cbsovbldg_g.dds',
    'civilian_cottage': 'cbgctage01.dds',
    'civilian_cottage_g': 'cbgctage01_g.dds',
    'civilian_euro': 'cbeurocnd.dds',
    'civilian_euro_g': 'cbeurocnd_g.dds'
};

for (const [alias, file] of Object.entries(explicitTextures)) {
    const ok = addTextureKey(alias, file);
    if (!ok) {
        // pmsandbags2_d may fallback to pmsandbags2
        if (alias === 'pmsandbags2_d' && W3D_TEXTURE_DATA['pmsandbags2']) {
            W3D_TEXTURE_DATA['pmsandbags2_d'] = W3D_TEXTURE_DATA['pmsandbags2'];
        } else {
            throw new Error(`Missing required texture "${file}" (alias "${alias}")`);
        }
    }
}

// Sweep any remaining referenced mesh textures across new/all entries
const texKeysCheck = () => new Set(Object.keys(W3D_TEXTURE_DATA).map(k => k.toLowerCase()));
let curTexKeys = texKeysCheck();
for (const [dictName, dict] of [['W3D_VEHICLE_DATA', W3D_VEHICLE_DATA], ['W3D_BUILDING_DATA', W3D_BUILDING_DATA], ['W3D_INFANTRY_DATA', W3D_INFANTRY_DATA]]) {
    for (const [k, obj] of Object.entries(dict)) {
        for (const [mn, m] of Object.entries(obj.m || {})) {
            if (!m.tex || m.tex === 'unknown') continue;
            const base = m.tex.toLowerCase().replace(/\.(dds|tga)$/, '');
            if (!curTexKeys.has(base)) {
                const extracted = addTextureKey(null, m.tex);
                if (!extracted) {
                    throw new Error(`Missing texture ${m.tex} referenced by ${dictName}.${k}.${mn}`);
                }
                curTexKeys = texKeysCheck();
                console.log(`Auto-extracted additional texture: ${m.tex}`);
            }
        }
    }
}

// 5. Assert 0 zero-vertex meshes and 0 missing textures
for (const [label, dict] of [['W3D_VEHICLE_DATA', W3D_VEHICLE_DATA], ['W3D_BUILDING_DATA', W3D_BUILDING_DATA], ['W3D_INFANTRY_DATA', W3D_INFANTRY_DATA]]) {
    for (const [k, obj] of Object.entries(dict)) {
        const meshes = Object.entries(obj.m || {});
        if (meshes.length === 0) throw new Error(`Empty meshes on ${label}.${k}`);
        for (const [mn, m] of meshes) {
            if (!m.v || m.v.length === 0 || !m.i || m.i.length === 0) {
                throw new Error(`Zero-vertex mesh ${label}.${k}.${mn}`);
            }
            if (m.tex && m.tex !== 'unknown') {
                const base = m.tex.toLowerCase().replace(/\.(dds|tga)$/, '');
                if (!curTexKeys.has(base)) {
                    throw new Error(`Missing texture ${m.tex} referenced by ${label}.${k}.${mn}`);
                }
            }
        }
    }
}

// 6. Write lines 7..10 back cleanly and clean scratch directory
lines[6] = 'window.W3D_VEHICLE_DATA = ' + JSON.stringify(W3D_VEHICLE_DATA) + ';';
lines[7] = 'window.W3D_BUILDING_DATA = ' + JSON.stringify(W3D_BUILDING_DATA) + ';';
lines[8] = 'window.W3D_INFANTRY_DATA = ' + JSON.stringify(W3D_INFANTRY_DATA) + ';';
lines[9] = 'window.W3D_TEXTURE_DATA = ' + JSON.stringify(W3D_TEXTURE_DATA) + ';';

fs.writeFileSync(w3dPath, lines.join('\n'));
fs.rmSync(scratchTmp, { recursive: true, force: true });

console.log(
    'SUCCESS: Patched 02b_w3d_models.js cleanly! Verified 0 zero-vertex meshes and 0 missing textures across',
    Object.keys(W3D_VEHICLE_DATA).length, 'vehicles,',
    Object.keys(W3D_BUILDING_DATA).length, 'buildings,',
    Object.keys(W3D_INFANTRY_DATA).length, 'infantry, and',
    curTexKeys.size, 'textures.'
);
