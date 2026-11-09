const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 for PNG encoding
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c >>> 0;
}
function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}
function makePngChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcInput = Buffer.concat([typeBuf, data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(crcInput), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePngDataUrl(rgba, width, height) {
    const raw = Buffer.alloc(height * (1 + width * 4));
    for (let y = 0; y < height; y++) {
        const rowStart = y * (1 + width * 4);
        raw[rowStart] = 1; // Sub filter
        for (let x = 0; x < width; x++) {
            const p = (y * width + x) * 4;
            const prevP = (y * width + (x - 1)) * 4;
            for (let c = 0; c < 4; c++) {
                const cur = rgba[p + c];
                const left = x > 0 ? rgba[prevP + c] : 0;
                raw[rowStart + 1 + x * 4 + c] = (cur - left) & 0xff;
            }
        }
    }
    const compressed = zlib.deflateSync(raw, { level: 9 });
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6; // RGBA
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    const png = Buffer.concat([
        signature,
        makePngChunk('IHDR', ihdr),
        makePngChunk('IDAT', compressed),
        makePngChunk('IEND', Buffer.alloc(0))
    ]);
    return 'data:image/png;base64,' + png.toString('base64');
}

function decompressRefPack(buf, startOffset) {
    let pos = startOffset;
    const magic = buf.readUInt16BE(pos); pos += 2;
    let decompSize = 0;
    if (magic & 0x8000) {
        if (magic & 0x0100) pos += 4;
        decompSize = buf.readUInt32BE(pos); pos += 4;
    } else {
        if (magic & 0x0100) pos += 3;
        decompSize = (buf[pos] << 16) | (buf[pos + 1] << 8) | buf[pos + 2]; pos += 3;
    }
    const out = Buffer.alloc(decompSize);
    let outPos = 0;
    while (pos < buf.length && outPos < decompSize) {
        const b0 = buf[pos++];
        if (b0 >= 0xFC) {
            const litCount = b0 & 0x03;
            for (let i = 0; i < litCount && pos < buf.length && outPos < decompSize; i++) out[outPos++] = buf[pos++];
            if (b0 === 0xFC) break;
        } else if (b0 >= 0xE0) {
            const litCount = ((b0 - 0xDF) << 2);
            for (let i = 0; i < litCount && pos < buf.length && outPos < decompSize; i++) out[outPos++] = buf[pos++];
        } else if (b0 >= 0xC0) {
            const b1 = buf[pos++], b2 = buf[pos++], b3 = buf[pos++];
            const litCount = b0 & 0x03;
            for (let i = 0; i < litCount && pos < buf.length && outPos < decompSize; i++) out[outPos++] = buf[pos++];
            const copyCount = ((b0 & 0x0C) << 6) + b3 + 5;
            const copyOffset = ((b0 & 0x10) << 12) + (b1 << 8) + b2 + 1;
            let src = outPos - copyOffset;
            for (let i = 0; i < copyCount && outPos < decompSize; i++) out[outPos++] = out[src++];
        } else if (b0 >= 0x80) {
            const b1 = buf[pos++], b2 = buf[pos++];
            const litCount = (b1 >> 6) & 0x03;
            for (let i = 0; i < litCount && pos < buf.length && outPos < decompSize; i++) out[outPos++] = buf[pos++];
            const copyCount = (b0 & 0x3F) + 4;
            const copyOffset = ((b1 & 0x3F) << 8) + b2 + 1;
            let src = outPos - copyOffset;
            for (let i = 0; i < copyCount && outPos < decompSize; i++) out[outPos++] = out[src++];
        } else {
            const b1 = buf[pos++];
            const litCount = b0 & 0x03;
            for (let i = 0; i < litCount && pos < buf.length && outPos < decompSize; i++) out[outPos++] = buf[pos++];
            const copyCount = ((b0 >> 2) & 0x07) + 3;
            const copyOffset = ((b0 & 0x60) << 3) + b1 + 1;
            let src = outPos - copyOffset;
            for (let i = 0; i < copyCount && outPos < decompSize; i++) out[outPos++] = out[src++];
        }
    }
    return out;
}

function readBigIndex(bigPath) {
    const buf = fs.readFileSync(bigPath);
    const count = buf.readUInt32BE(8);
    let pos = 16;
    const entries = [];
    for (let i = 0; i < count; i++) {
        const off = buf.readUInt32BE(pos);
        const sz = buf.readUInt32BE(pos + 4);
        pos += 8;
        let end = pos;
        while (end < buf.length && buf[end] !== 0) end++;
        const name = buf.toString('ascii', pos, end);
        pos = end + 1;
        entries.push({ name, lower: name.toLowerCase(), off, sz, buf });
    }
    return entries;
}

const bigDir = path.join(__dirname, '..', 'generals_big_files');
const allEntries = [
    ...readBigIndex(path.join(bigDir, 'MapsZH.big')),
    ...readBigIndex(path.join(bigDir, 'Maps.big'))
];

function findMapEntries(searchKey) {
    const key = searchKey.toLowerCase();
    const mapEntry = allEntries.find(e => e.lower.includes(`maps\\${key}\\`) && e.lower.endsWith('.map'));
    const tgaEntry = allEntries.find(e => e.lower.includes(`maps\\${key}\\`) && e.lower.endsWith('.tga'));
    return { mapEntry, tgaEntry };
}

function parseOfficialMap(mapKey, meta) {
    const { mapEntry, tgaEntry } = findMapEntries(meta.folder);
    if (!mapEntry) throw new Error(`Map not found: ${meta.folder}`);

    const rawSlice = mapEntry.buf.slice(mapEntry.off, mapEntry.off + mapEntry.sz);
    const decomp = rawSlice.toString('ascii', 0, 4) === 'EAR\0'
        ? decompressRefPack(rawSlice, 8)
        : rawSlice;

    if (decomp.toString('ascii', 0, 4) !== 'CkMp') {
        throw new Error(`Invalid CkMp header in ${meta.folder}`);
    }

    // 1. Parse CkMp string dictionary
    const numStrings = decomp.readUInt32LE(4);
    let pos = 8;
    const dict = {};
    for (let i = 0; i < numStrings; i++) {
        const len = decomp[pos++];
        const str = decomp.toString('ascii', pos, pos + len); pos += len;
        const id = decomp.readUInt32LE(pos); pos += 4;
        dict[id] = str;
    }

    // 2. Locate HeightMapData and ObjectsList chunks
    let hmChunkPos = -1;
    let objListPos = -1, objListEnd = -1;
    let scanPos = pos;
    while (scanPos + 10 <= decomp.length) {
        const cid = decomp.readUInt32LE(scanPos);
        const cver = decomp.readUInt16LE(scanPos + 4);
        const csz = decomp.readUInt32LE(scanPos + 6);
        const cname = dict[cid] || '';
        const dataStart = scanPos + 10;
        if (cname === 'HeightMapData') {
            hmChunkPos = dataStart;
        } else if (cname === 'ObjectsList') {
            objListPos = dataStart;
            objListEnd = dataStart + csz;
        }
        if (csz <= 0 || dataStart + csz > decomp.length) break;
        scanPos = dataStart + csz;
    }

    // 3. Parse HeightMapData
    const W = decomp.readInt32LE(hmChunkPos);
    const H = decomp.readInt32LE(hmChunkPos + 4);
    const border = decomp.readInt32LE(hmChunkPos + 8);
    const numBoundaries = decomp.readInt32LE(hmChunkPos + 12);
    const hmDataStart = hmChunkPos + 20 + numBoundaries * 8;
    const playW = Math.max(1, W - 2 * border);
    const playH = Math.max(1, H - 2 * border);

    // Compute median height in playable area so baseline valley is ~0..2
    const sampleVals = [];
    for (let y = border; y < H - border; y += 4) {
        for (let x = border; x < W - border; x += 4) {
            sampleVals.push(decomp[hmDataStart + y * W + x]);
        }
    }
    sampleVals.sort((a, b) => a - b);
    const baseByte = sampleVals[Math.floor(sampleVals.length * 0.25)] || 64;

    const GRID = 65;
    const grid = [];
    for (let r = 0; r < GRID; r++) {
        const row = [];
        // Flip Y so North (high SAGE Y) is row 0 (z = -size/2) and South (low SAGE Y) is row 64 (z = +size/2)
        const srcY = Math.min(H - 1, Math.max(0, Math.floor(border + (1 - r / (GRID - 1)) * (playH - 1))));
        for (let c = 0; c < GRID; c++) {
            const srcX = Math.min(W - 1, Math.max(0, Math.floor(border + (c / (GRID - 1)) * (playW - 1))));
            const val = decomp[hmDataStart + srcY * W + srcX];
            const hVal = Math.max(-4.5, Math.min(14.0, (val - baseByte) * 0.11));
            row.push(parseFloat(hVal.toFixed(2)));
        }
        grid.push(row);
    }

    // 4. Parse ObjectsList for Player_*_Start, SupplyDock, and Tech buildings
    const rawSpawns = [];
    const rawSupplies = [];
    let p = objListPos;
    while (p > 0 && p + 10 <= objListEnd) {
        const cid = decomp.readUInt32LE(p);
        const cver = decomp.readUInt16LE(p + 4);
        const csz = decomp.readUInt32LE(p + 6);
        const dStart = p + 10;
        if (dict[cid] === 'Object' && dStart + csz <= objListEnd) {
            let op = dStart;
            const x = decomp.readFloatLE(op);
            const y = decomp.readFloatLE(op + 4);
            const z = decomp.readFloatLE(op + 8);
            op += 12;
            const angle = decomp.readFloatLE(op);
            const flags = decomp.readInt32LE(op + 4);
            const tLen = decomp.readUInt16LE(op + 8);
            op += 10;
            const templateName = decomp.toString('ascii', op, op + tLen);
            op += tLen;

            let waypointName = '';
            if (op + 2 <= dStart + csz) {
                const numProps = decomp.readUInt16LE(op);
                op += 2;
                for (let k = 0; k < numProps && op + 4 <= dStart + csz; k++) {
                    const keyAndType = decomp.readUInt32LE(op);
                    const pType = keyAndType & 0xff;
                    const pKeyId = keyAndType >>> 8;
                    const pKey = dict[pKeyId] || '';
                    op += 4;
                    if (pType === 0) op += 1;
                    else if (pType === 1) op += 4;
                    else if (pType === 2) op += 4;
                    else if (pType === 3) {
                        if (op + 2 > dStart + csz) break;
                        const sLen = decomp.readUInt16LE(op);
                        op += 2;
                        const sVal = decomp.toString('ascii', op, op + sLen);
                        op += sLen;
                        if (pKey === 'waypointName') waypointName = sVal;
                    } else if (pType === 4) {
                        if (op + 2 > dStart + csz) break;
                        const uLen = decomp.readUInt16LE(op);
                        op += 2 + uLen * 2;
                    } else break;
                }
            }

            // Convert SAGE playable coordinates (0..playW*10, 0..playH*10) to normalized [-0.41 .. +0.41]
            const nx = Math.max(-0.41, Math.min(0.41, (x / (playW * 10)) - 0.5));
            const nz = Math.max(-0.41, Math.min(0.41, 0.5 - (y / (playH * 10))));

            const mStart = /^Player_(\d)_Start$/i.exec(waypointName);
            if (mStart) {
                rawSpawns.push({
                    id: parseInt(mStart[1], 10),
                    nx: parseFloat(nx.toFixed(3)),
                    nz: parseFloat(nz.toFixed(3))
                });
            } else if (/SupplyDock|SupplyWarehouse|SupplyPile/i.test(templateName)) {
                // Deduplicate nearby supply docks
                if (!rawSupplies.some(s => Math.hypot(s.nx - nx, s.nz - nz) < 0.04)) {
                    rawSupplies.push({
                        nx: parseFloat(nx.toFixed(3)),
                        nz: parseFloat(nz.toFixed(3)),
                        amount: 30000
                    });
                }
            }
        }
        p = dStart + csz;
    }

    rawSpawns.sort((a, b) => a.id - b.id);
    // Ensure at least 4 spawns so 4-player skirmish works on 2-player maps too
    if (rawSpawns.length === 2) {
        const s1 = rawSpawns[0], s2 = rawSpawns[1];
        // Perpendicular flank positions
        const dx = s2.nx - s1.nx, dz = s2.nz - s1.nz;
        rawSpawns.push(
            { id: 3, nx: parseFloat(Math.max(-0.38, Math.min(0.38, -dz * 0.48)).toFixed(3)), nz: parseFloat(Math.max(-0.38, Math.min(0.38, dx * 0.48)).toFixed(3)) },
            { id: 4, nx: parseFloat(Math.max(-0.38, Math.min(0.38, dz * 0.48)).toFixed(3)), nz: parseFloat(Math.max(-0.38, Math.min(0.38, -dx * 0.48)).toFixed(3)) }
        );
    }
    if (rawSupplies.length < 4) {
        rawSpawns.forEach(sp => {
            if (rawSupplies.length < 4 && !rawSupplies.some(s => Math.hypot(s.nx - sp.nx, s.nz - sp.nz) < 0.14)) {
                rawSupplies.push({
                    nx: parseFloat((sp.nx * 0.78).toFixed(3)),
                    nz: parseFloat((sp.nz * 0.78).toFixed(3)),
                    amount: 30000
                });
            }
        });
    }

    // 5. Extract and PNG-encode the official 128x128 TGA aerial terrain/minimap preview
    let tgaDataUrl = '';
    if (tgaEntry) {
        const tgaBuf = tgaEntry.buf.slice(tgaEntry.off, tgaEntry.off + tgaEntry.sz);
        const idLen = tgaBuf[0];
        const tgaW = tgaBuf.readUInt16LE(12);
        const tgaH = tgaBuf.readUInt16LE(14);
        const bpp = tgaBuf[16];
        const desc = tgaBuf[17];
        const topOrigin = Boolean(desc & 0x20);
        const bytesPerPel = bpp >> 3;
        const pixelStart = 18 + idLen;
        const rgba = Buffer.alloc(tgaW * tgaH * 4);
        for (let row = 0; row < tgaH; row++) {
            const dstRow = topOrigin ? row : (tgaH - 1 - row);
            for (let col = 0; col < tgaW; col++) {
                const srcIdx = pixelStart + (row * tgaW + col) * bytesPerPel;
                const dstIdx = (dstRow * tgaW + col) * 4;
                rgba[dstIdx] = tgaBuf[srcIdx + 2];     // R
                rgba[dstIdx + 1] = tgaBuf[srcIdx + 1]; // G
                rgba[dstIdx + 2] = tgaBuf[srcIdx];     // B
                rgba[dstIdx + 3] = 255;                // A
            }
        }
        tgaDataUrl = encodePngDataUrl(rgba, tgaW, tgaH);
    }

    console.log(`  [OK] ${meta.name.padEnd(20)} | ${W}x${H} (border ${border}) | Spawns: ${rawSpawns.length} | Supplies: ${rawSupplies.length} | TGA: ${(tgaDataUrl.length / 1024).toFixed(1)} KB`);

    return {
        id: mapKey,
        name: meta.name,
        theme: meta.theme,
        maxPlayers: rawSpawns.length,
        grid,
        spawns: rawSpawns,
        supplies: rawSupplies,
        tgaDataUrl
    };
}

const OFFICIAL_MAP_LIST = [
    { id: 'tournament_desert', folder: 'tournament desert', name: 'Tournament Desert', theme: 'desert' },
    { id: 'scorched_earth', folder: 'scorched earth', name: 'Scorched Earth', theme: 'desert' },
    { id: 'desert_fury', folder: 'desert fury', name: 'Desert Fury', theme: 'desert' },
    { id: 'golden_oasis', folder: 'golden oasis', name: 'Golden Oasis', theme: 'desert' },
    { id: 'barren_badlands', folder: 'barrenbadlands', name: 'Barren Badlands', theme: 'desert' },
    { id: 'flash_fire', folder: 'flash fire', name: 'Flash Fire', theme: 'desert' },
    { id: 'winter_wolf', folder: 'winter wolf', name: 'Winter Wolf', theme: 'snow' },
    { id: 'alpine_assault', folder: 'alpine assault', name: 'Alpine Assault', theme: 'snow' },
    { id: 'final_crusade', folder: 'final crusade', name: 'Final Crusade', theme: 'jungle' },
    { id: 'heartland_shield', folder: 'heartland shield', name: 'Heartland Shield', theme: 'jungle' },
    { id: 'lone_eagle', folder: 'lone eagle', name: 'Lone Eagle', theme: 'jungle' },
    { id: 'twilight_flame', folder: 'twilight flame', name: 'Twilight Flame', theme: 'desert' }
];

console.log('Extracting 12 Official EA Skirmish Maps from MapsZH.big & Maps.big...');
const officialMaps = {};
for (const meta of OFFICIAL_MAP_LIST) {
    officialMaps[meta.id] = parseOfficialMap(meta.id, meta);
}

// Preserve RETAIL_DESERT_SAND_URI from existing 07b_tournament_desert.js
const existing07b = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', '07b_tournament_desert.js'), 'utf8');
const sandMatch = /window\.RETAIL_DESERT_SAND_URI\s*=\s*"([^"]+)";/.exec(existing07b);
const retailSandUri = sandMatch ? sandMatch[1] : '';

const outJs = `/**
 * Official EA Command & Conquer: Generals & Zero Hour Skirmish Maps
 * Extracted directly from retail Maps.big & MapsZH.big (CkMp HeightMapData, ObjectsList & aerial TGA previews)
 */
window.OFFICIAL_SKIRMISH_MAPS = ${JSON.stringify(officialMaps)};

// Backward-compatible Tournament Desert reference
window.TOURNAMENT_DESERT_DATA = window.OFFICIAL_SKIRMISH_MAPS.tournament_desert;

// Preload official aerial TGA preview images for instant 2D Canvas & 3D Texture rendering
window._officialMapImages = {};
if (typeof Image !== 'undefined') {
    Object.keys(window.OFFICIAL_SKIRMISH_MAPS).forEach(function(k) {
        var m = window.OFFICIAL_SKIRMISH_MAPS[k];
        if (m && m.tgaDataUrl) {
            var img = new Image();
            img.src = m.tgaDataUrl;
            window._officialMapImages[k] = img;
        }
    });
}

function getOfficialMapHeight(mapType, x, z) {
    var mapKey = (mapType === 'desert') ? 'tournament_desert' : mapType;
    var mapObj = window.OFFICIAL_SKIRMISH_MAPS && window.OFFICIAL_SKIRMISH_MAPS[mapKey];
    if (!mapObj || !mapObj.grid) return 0;
    var grid = mapObj.grid;
    var size = (typeof currentMapSize !== 'undefined' && currentMapSize) ? currentMapSize : 1500;
    var normX = (x + size * 0.5) / size;
    var normZ = (z + size * 0.5) / size;
    if (normX < 0 || normX > 1 || normZ < 0 || normZ > 1) return 0;
    var res = grid.length;
    var gx = normX * (res - 1);
    var gz = normZ * (res - 1);
    var x0 = Math.floor(gx), x1 = Math.min(res - 1, x0 + 1);
    var z0 = Math.floor(gz), z1 = Math.min(res - 1, z0 + 1);
    var fx = gx - x0, fz = gz - z0;
    var h00 = grid[z0][x0], h10 = grid[z0][x1];
    var h01 = grid[z1][x0], h11 = grid[z1][x1];
    var h0 = h00 * (1 - fx) + h10 * fx;
    var h1 = h01 * (1 - fx) + h11 * fx;
    return h0 * (1 - fz) + h1 * fz;
}
window.getOfficialMapHeight = getOfficialMapHeight;

function getTournamentDesertHeight(x, z) {
    return getOfficialMapHeight('tournament_desert', x, z);
}
window.getTournamentDesertHeight = getTournamentDesertHeight;

window.RETAIL_DESERT_SAND_URI = "${retailSandUri}";

window._officialMapTexCache = {};
function createOfficialMapTexture(mapType) {
    var mapKey = (mapType === 'desert') ? 'tournament_desert' : mapType;
    if (window._officialMapTexCache[mapKey]) return window._officialMapTexCache[mapKey];
    var mapObj = window.OFFICIAL_SKIRMISH_MAPS && window.OFFICIAL_SKIRMISH_MAPS[mapKey];
    if (!mapObj || typeof document === 'undefined') return null;
    try {
        var canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = mapObj.theme === 'snow' ? '#dce4ec' : mapObj.theme === 'jungle' ? '#4a5d38' : '#bfa87a';
        ctx.fillRect(0, 0, 512, 512);

        var tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;

        var drawAerial = function(img) {
            ctx.drawImage(img, 0, 0, 512, 512);
            // Add subtle surface micro-grain so close-up ground looks crisp
            var imgData = ctx.getImageData(0, 0, 512, 512);
            var d = imgData.data;
            for (var i = 0; i < d.length; i += 4) {
                var px = (i >> 2) & 511;
                var py = (i >> 11);
                var n = (((px * 1664525 + py * 1013904223) ^ (px >> 2)) & 0x1f) - 16;
                d[i] = Math.max(0, Math.min(255, d[i] + n * 0.55));
                d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n * 0.55));
                d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.55));
            }
            ctx.putImageData(imgData, 0, 0);
            tex.needsUpdate = true;
            if (window._minimapTerrainCanvas && typeof currentMapType !== 'undefined' && currentMapType === mapKey) {
                var mCtx = window._minimapTerrainCanvas.getContext('2d');
                mCtx.drawImage(img, 0, 0, window._minimapTerrainCanvas.width, window._minimapTerrainCanvas.height);
            }
        };

        var cachedImg = window._officialMapImages && window._officialMapImages[mapKey];
        if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
            drawAerial(cachedImg);
        } else if (mapObj.tgaDataUrl) {
            var img = cachedImg || new Image();
            img.onload = function() { drawAerial(img); };
            if (!img.src) img.src = mapObj.tgaDataUrl;
        }

        window._officialMapTexCache[mapKey] = tex;
        return tex;
    } catch (e) {
        return null;
    }
}
window.createOfficialMapTexture = createOfficialMapTexture;

function createTournamentDesertTexture() {
    return createOfficialMapTexture('tournament_desert');
}
window.createTournamentDesertTexture = createTournamentDesertTexture;
`;

const outPath = path.join(__dirname, '..', 'src', 'js', '07b_tournament_desert.js');
fs.writeFileSync(outPath, outJs, 'utf8');
console.log(`Saved 12 Official Skirmish Maps to ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
