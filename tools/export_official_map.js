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

function paethPredictor(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    return pb <= pc ? b : c;
}

function encodeRgbPngDataUrl(rgba, width, height, quantMask = 0xff) {
    const stride = width * 3;
    const raw = Buffer.alloc(height * (1 + stride));
    const curRow = Buffer.alloc(stride);
    const prevRow = Buffer.alloc(stride);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const si = (y * width + x) * 4;
            const di = x * 3;
            curRow[di + 0] = rgba[si + 0] & quantMask;
            curRow[di + 1] = rgba[si + 1] & quantMask;
            curRow[di + 2] = rgba[si + 2] & quantMask;
        }
        const rowStart = y * (1 + stride);
        raw[rowStart] = 4; // Paeth filter
        for (let i = 0; i < stride; i++) {
            const cur = curRow[i];
            const a = i >= 3 ? curRow[i - 3] : 0;
            const b = prevRow[i];
            const c = i >= 3 ? prevRow[i - 3] : 0;
            raw[rowStart + 1 + i] = (cur - paethPredictor(a, b, c)) & 0xff;
        }
        curRow.copy(prevRow);
    }
    const compressed = zlib.deflateSync(raw, { level: 9 });
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 2; // RGB
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

function decodeTgaBuffer(tgaBuf) {
    if (!tgaBuf || tgaBuf.length < 18) return null;
    const idLen = tgaBuf[0];
    const imageType = tgaBuf[2];
    const w = tgaBuf.readUInt16LE(12);
    const h = tgaBuf.readUInt16LE(14);
    const bpp = tgaBuf[16];
    const desc = tgaBuf[17];
    const topOrigin = Boolean(desc & 0x20);
    const bytesPerPel = bpp >> 3;
    if (!w || !h || (bytesPerPel !== 3 && bytesPerPel !== 4)) return null;
    let p = 18 + idLen;
    const rgba = Buffer.alloc(w * h * 4);
    const writePel = (idx, r, g, b, a) => {
        const row = Math.floor(idx / w);
        const col = idx % w;
        const dstRow = topOrigin ? row : (h - 1 - row);
        const dst = (dstRow * w + col) * 4;
        rgba[dst] = r; rgba[dst + 1] = g; rgba[dst + 2] = b; rgba[dst + 3] = a;
    };
    if (imageType === 2) {
        for (let i = 0; i < w * h && p + bytesPerPel <= tgaBuf.length; i++) {
            const b = tgaBuf[p], g = tgaBuf[p + 1], r = tgaBuf[p + 2];
            const a = bytesPerPel === 4 ? tgaBuf[p + 3] : 255;
            writePel(i, r, g, b, a);
            p += bytesPerPel;
        }
    } else if (imageType === 10) {
        let i = 0;
        while (i < w * h && p < tgaBuf.length) {
            const hdr = tgaBuf[p++];
            const count = (hdr & 0x7f) + 1;
            if (hdr & 0x80) {
                const b = tgaBuf[p], g = tgaBuf[p + 1], r = tgaBuf[p + 2];
                const a = bytesPerPel === 4 ? tgaBuf[p + 3] : 255;
                p += bytesPerPel;
                for (let k = 0; k < count && i < w * h; k++, i++) writePel(i, r, g, b, a);
            } else {
                for (let k = 0; k < count && i < w * h && p + bytesPerPel <= tgaBuf.length; k++, i++) {
                    const b = tgaBuf[p], g = tgaBuf[p + 1], r = tgaBuf[p + 2];
                    const a = bytesPerPel === 4 ? tgaBuf[p + 3] : 255;
                    writePel(i, r, g, b, a);
                    p += bytesPerPel;
                }
            }
        }
    } else {
        return null;
    }
    return { w, h, rgba };
}

function loadTerrainAndRoadAssets() {
    const terrainClassToFile = {};
    const roadDefs = {};
    for (const iniBig of ['INIZH.big', 'INI.big']) {
        const bigPath = path.join(bigDir, iniBig);
        if (!fs.existsSync(bigPath)) continue;
        for (const e of readBigIndex(bigPath)) {
            if (e.lower.endsWith('terrain.ini')) {
                const txt = e.buf.subarray(e.off, e.off + e.sz).toString('ascii');
                let curName = null;
                for (const rawLine of txt.split(/\r?\n/)) {
                    const line = rawLine.split(';')[0].trim();
                    const mStart = /^Terrain\s+(\S+)/i.exec(line);
                    if (mStart) curName = mStart[1].toLowerCase();
                    else if (/^End$/i.test(line)) curName = null;
                    else if (curName) {
                        const mTex = /^Texture\s*=\s*(\S+)/i.exec(line);
                        if (mTex && !terrainClassToFile[curName]) terrainClassToFile[curName] = mTex[1].toLowerCase();
                    }
                }
            } else if (e.lower.endsWith('roads.ini')) {
                const txt = e.buf.subarray(e.off, e.off + e.sz).toString('ascii');
                let curRoad = null;
                for (const rawLine of txt.split(/\r?\n/)) {
                    const line = rawLine.split(';')[0].trim();
                    const mStart = /^Road\s+(\S+)/i.exec(line);
                    if (mStart) curRoad = { name: mStart[1].toLowerCase(), width: 35, tex: '' };
                    else if (/^End$/i.test(line)) {
                        if (curRoad && !roadDefs[curRoad.name]) roadDefs[curRoad.name] = curRoad;
                        curRoad = null;
                    } else if (curRoad) {
                        const mTex = /^Texture\s*=\s*(\S+)/i.exec(line);
                        if (mTex) curRoad.tex = mTex[1].toLowerCase();
                        const mW = /^RoadWidth\s*=\s*([0-9.]+)/i.exec(line);
                        if (mW) curRoad.width = parseFloat(mW[1]) || 35;
                    }
                }
            }
        }
    }
    const tgaFiles = {};
    for (const terrBig of ['TerrainZH.big', 'Terrain.big']) {
        const bigPath = path.join(bigDir, terrBig);
        if (!fs.existsSync(bigPath)) continue;
        for (const e of readBigIndex(bigPath)) {
            const base = path.basename(e.lower);
            if (base.endsWith('.tga') && !tgaFiles[base]) {
                tgaFiles[base] = e;
            }
        }
    }
    const decodedCache = {};
    const getTga = (fileName) => {
        if (!fileName) return null;
        const key = fileName.toLowerCase();
        if (decodedCache[key] !== undefined) return decodedCache[key];
        const entry = tgaFiles[key];
        decodedCache[key] = entry ? decodeTgaBuffer(entry.buf.subarray(entry.off, entry.off + entry.sz)) : null;
        return decodedCache[key];
    };
    return { terrainClassToFile, roadDefs, getTga };
}

const TERRAIN_ASSETS = loadTerrainAndRoadAssets();

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

    // 2. Locate HeightMapData, BlendTileData, ObjectsList, and PolygonTriggers chunks
    let hmChunkPos = -1;
    let blendPos = -1, blendEnd = -1, blendVer = 0;
    let objListPos = -1, objListEnd = -1;
    let trigPos = -1, trigEnd = -1, trigVer = 0;
    let scanPos = pos;
    while (scanPos + 10 <= decomp.length) {
        const cid = decomp.readUInt32LE(scanPos);
        const cver = decomp.readUInt16LE(scanPos + 4);
        const csz = decomp.readUInt32LE(scanPos + 6);
        const cname = dict[cid] || '';
        const dataStart = scanPos + 10;
        if (cname === 'HeightMapData') {
            hmChunkPos = dataStart;
        } else if (cname === 'BlendTileData') {
            blendPos = dataStart;
            blendEnd = dataStart + csz;
            blendVer = cver;
        } else if (cname === 'ObjectsList') {
            objListPos = dataStart;
            objListEnd = dataStart + csz;
        } else if (cname === 'PolygonTriggers') {
            trigPos = dataStart;
            trigEnd = dataStart + csz;
            trigVer = cver;
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

    const GRID = 97;
    const grid = [];
    for (let r = 0; r < GRID; r++) {
        const row = [];
        // Flip Y so North (high SAGE Y) is row 0 (z = -size/2) and South (low SAGE Y) is row 96 (z = +size/2)
        const srcY = Math.min(H - 1, Math.max(0, Math.floor(border + (1 - r / (GRID - 1)) * (playH - 1))));
        for (let c = 0; c < GRID; c++) {
            const srcX = Math.min(W - 1, Math.max(0, Math.floor(border + (c / (GRID - 1)) * (playW - 1))));
            const val = decomp[hmDataStart + srcY * W + srcX];
            const hVal = Math.max(-5.5, Math.min(22.0, (val - baseByte) * 0.155));
            row.push(parseFloat(hVal.toFixed(2)));
        }
        grid.push(row);
    }

    // 4. Parse ObjectsList for Player_*_Start, SupplyDock, and Tech buildings
    const rawSpawns = [];
    const rawSupplies = [];
    const rawDerricks = [];
    const rawHospitals = [];
    const rawRefineries = [];
    const rawBunkers = [];
    const rawBridges = [];
    const rawBuildings = [];
    const rawProps = [];
    const rawRoads = [];
    let pendingRoadPt1 = null;
    let pendingBridgePt1 = null;
    const hAtNorm = (nxVal, nzVal) => {
        const col = Math.max(0, Math.min(GRID - 1, Math.round((nxVal + 0.5) * (GRID - 1))));
        const row = Math.max(0, Math.min(GRID - 1, Math.round((nzVal + 0.5) * (GRID - 1))));
        return grid[row][col];
    };
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

            if (flags & 0x02) {
                pendingRoadPt1 = {
                    nx: (x / (playW * 10)) - 0.5,
                    nz: 0.5 - (y / (playH * 10)),
                    tName: templateName.toLowerCase()
                };
            } else if ((flags & 0x04) && pendingRoadPt1) {
                rawRoads.push({
                    x1: pendingRoadPt1.nx,
                    z1: pendingRoadPt1.nz,
                    x2: (x / (playW * 10)) - 0.5,
                    z2: 0.5 - (y / (playH * 10)),
                    tName: pendingRoadPt1.tName || templateName.toLowerCase()
                });
                pendingRoadPt1 = null;
            }

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
            } else if (/TechOilDerrick/i.test(templateName)) {
                rawDerricks.push({ nx: parseFloat(nx.toFixed(3)), nz: parseFloat(nz.toFixed(3)) });
            } else if (/TechHospital/i.test(templateName)) {
                rawHospitals.push({ nx: parseFloat(nx.toFixed(3)), nz: parseFloat(nz.toFixed(3)) });
            } else if (/TechOilRefinery/i.test(templateName)) {
                rawRefineries.push({ nx: parseFloat(nx.toFixed(3)), nz: parseFloat(nz.toFixed(3)) });
            } else if (/CivilianBunker/i.test(templateName)) {
                rawBunkers.push({ nx: parseFloat(nx.toFixed(3)), nz: parseFloat(nz.toFixed(3)), angle: parseFloat(angle.toFixed(2)) });
                rawBuildings.push([parseFloat(nx.toFixed(3)), parseFloat(nz.toFixed(3)), parseFloat(angle.toFixed(2)), 'bunker']);
            } else if (/Bridge/i.test(templateName)) {
                const bnx = (x / (playW * 10)) - 0.5;
                const bnz = 0.5 - (y / (playH * 10));
                if ((flags & 0x30) === 0x10) {
                    // BRIDGE_POINT1: start endpoint of a paired river bridge
                    pendingBridgePt1 = { nx: bnx, nz: bnz, tName: templateName };
                } else if ((flags & 0x30) === 0x20 && pendingBridgePt1) {
                    // BRIDGE_POINT2: end endpoint of a paired river bridge -> compute center, angle, span & bank deck elevation
                    const midNx = (pendingBridgePt1.nx + bnx) * 0.5;
                    const midNz = (pendingBridgePt1.nz + bnz) * 0.5;
                    const dNx = bnx - pendingBridgePt1.nx;
                    const dNz = bnz - pendingBridgePt1.nz;
                    const rawSpan = Math.hypot(dNx, dNz);
                    const spanAngle = Math.atan2(dNx, dNz);
                    const bank1 = Math.max(hAtNorm(pendingBridgePt1.nx, pendingBridgePt1.nz), hAtNorm(pendingBridgePt1.nx - dNx * 0.15, pendingBridgePt1.nz - dNz * 0.15));
                    const bank2 = Math.max(hAtNorm(bnx, bnz), hAtNorm(bnx + dNx * 0.15, bnz + dNz * 0.15));
                    const deckH = Math.max(bank1, bank2);
                    const isWide = /wide/i.test(pendingBridgePt1.tName || templateName);
                    if (!rawBridges.some(b => Math.hypot(b.nx - midNx, b.nz - midNz) < 0.03)) {
                        rawBridges.push({
                            nx: parseFloat(midNx.toFixed(4)),
                            nz: parseFloat(midNz.toFixed(4)),
                            angle: parseFloat(spanAngle.toFixed(3)),
                            span: parseFloat((rawSpan + 0.022).toFixed(4)),
                            deckH: parseFloat(deckH.toFixed(2)),
                            width: isWide ? 24 : 20
                        });
                    }
                    pendingBridgePt1 = null;
                } else if ((flags & 0x30) === 0) {
                    // Standalone single-object decorative/canyon bridge (e.g., MonumentTrainBridge)
                    if (!rawBridges.some(b => Math.hypot(b.nx - nx, b.nz - nz) < 0.04)) {
                        rawBridges.push({
                            nx: parseFloat(nx.toFixed(3)),
                            nz: parseFloat(nz.toFixed(3)),
                            angle: parseFloat(angle.toFixed(2))
                        });
                    }
                }
            } else if (/Warehouse|Wherehouse|WatchTower|Hanger|Garage|IndustrialBuilding|AmmoCache|Apartment|Hut/i.test(templateName)) {
                rawBuildings.push([parseFloat(nx.toFixed(3)), parseFloat(nz.toFixed(3)), parseFloat(angle.toFixed(2)), 'civilian']);
            } else if (/TreePalm/i.test(templateName)) {
                rawProps.push([parseFloat(nx.toFixed(3)), parseFloat(nz.toFixed(3)), 'palm']);
            } else if (/Tree/i.test(templateName)) {
                rawProps.push([parseFloat(nx.toFixed(3)), parseFloat(nz.toFixed(3)), 'tree']);
            } else if (/Bush/i.test(templateName)) {
                rawProps.push([parseFloat(nx.toFixed(3)), parseFloat(nz.toFixed(3)), 'bush']);
            } else if (/Rock|Boulder|CementChunk/i.test(templateName)) {
                rawProps.push([parseFloat(nx.toFixed(3)), parseFloat(nz.toFixed(3)), 'rock']);
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

    // 5b. Parse PolygonTriggers for localized water areas (oases, lakes, rivers)
    const waterPolygons = [];
    if (trigPos > 0 && trigPos < trigEnd) {
        let tp = trigPos;
        const nTrig = decomp.readInt32LE(tp); tp += 4;
        for (let i = 0; i < nTrig && tp + 16 <= trigEnd; i++) {
            const nLen = decomp.readUInt16LE(tp); tp += 2;
            const tName = decomp.toString('ascii', tp, tp + nLen); tp += nLen;
            if (trigVer >= 4) {
                const lLen = decomp.readUInt16LE(tp); tp += 2 + lLen; // layerName in PolygonTriggers v4
            }
            tp += 4; // trigId
            const isWater = decomp[tp++];
            tp += 1; // isRiver
            if (trigVer >= 3) tp += 4; // riverStart
            const nPts = decomp.readInt32LE(tp); tp += 4;
            const pts = [];
            let sumZ = 0;
            for (let j = 0; j < nPts && tp + 12 <= trigEnd; j++) {
                const px = decomp.readInt32LE(tp);
                const py = decomp.readInt32LE(tp + 4);
                const pz = decomp.readInt32LE(tp + 8);
                tp += 12;
                const pnx = (px / (playW * 10)) - 0.5;
                const pnz = 0.5 - (py / (playH * 10));
                pts.push([parseFloat(pnx.toFixed(4)), parseFloat(pnz.toFixed(4))]);
                sumZ += pz;
            }
            if (isWater === 1 && pts.length >= 3) {
                const avgByte = (sumZ / pts.length) / 0.625; // SAGE height unit -> heightmap byte approx
                const waterY = Math.max(-4.0, Math.min(18.0, (avgByte - baseByte) * 0.155));
                waterPolygons.push({ name: tName, waterY: parseFloat(waterY.toFixed(2)), points: pts });
            }
        }
    }

    // 5c. Bake 512x512 Retail Terrain Texture from BlendTileData (tileNdx + quarterTileUv + blendTileNdx + extraBlendTileNdx + cliffInfoNdx) + Terrain.big + Roads
    let terrainDataUrl = '';
    if (blendPos > 0 && blendPos < blendEnd) {
        let bp = blendPos;
        const N = decomp.readInt32LE(bp); bp += 4;
        const tileNdxOff = bp; bp += N * 2;
        const blendNdxOff = bp; bp += N * 2;
        const extraNdxOff = blendVer >= 6 ? bp : -1;
        if (blendVer >= 6) bp += N * 2;
        const cliffNdxOff = bp; bp += N * 2;
        const cliffByteWidth = blendVer === 7 ? Math.floor((W + 1) / 8) : Math.ceil(W / 8);
        const cliffStateOff = bp;
        if (blendVer >= 7) bp += H * cliffByteWidth;

        const numBitmapTiles = decomp.readInt32LE(bp); bp += 4;
        const numBlendedTiles = decomp.readInt32LE(bp); bp += 4;
        const numCliffInfo = decomp.readInt32LE(bp); bp += 4;
        const numTexClasses = decomp.readInt32LE(bp); bp += 4;
        const texClasses = [];
        for (let i = 0; i < numTexClasses && bp + 18 <= blendEnd; i++) {
            const firstTile = decomp.readInt32LE(bp); bp += 4;
            const numTiles = decomp.readInt32LE(bp); bp += 4;
            const width = decomp.readInt32LE(bp); bp += 4;
            bp += 4; // legacy isGDI
            const nLen = decomp.readUInt16LE(bp); bp += 2;
            const name = decomp.toString('ascii', bp, bp + nLen); bp += nLen;
            const file = TERRAIN_ASSETS.terrainClassToFile[name.toLowerCase()] || '';
            const tga = TERRAIN_ASSETS.getTga(file);
            texClasses.push({ firstTile, numTiles, width, name, tga });
        }
        if (bp + 8 <= blendEnd) {
            bp += 4; // numEdgeTiles
            const numEdgeClasses = decomp.readInt32LE(bp); bp += 4;
            for (let i = 0; i < numEdgeClasses && bp + 14 <= blendEnd; i++) {
                bp += 12;
                const nLen = decomp.readUInt16LE(bp); bp += 2 + nLen;
            }
        }
        const blendedTiles = [{ blendNdx: 0, shape: 0, custom: -1 }];
        for (let i = 1; i < numBlendedTiles && bp + 18 <= blendEnd; i++) {
            const bNdx = decomp.readInt32LE(bp);
            const horiz = decomp[bp + 4];
            const vert = decomp[bp + 5];
            const rightDiag = decomp[bp + 6];
            const leftDiag = decomp[bp + 7];
            const inverted = decomp[bp + 8];
            const longDiag = decomp[bp + 9];
            const custom = decomp.readInt32LE(bp + 10);
            bp += 18;
            let shape = 0;
            if (horiz !== 0) shape = 0;
            else if (vert !== 0) shape = 1;
            else if (rightDiag !== 0) shape = longDiag !== 0 ? 5 : 3;
            else if (leftDiag !== 0) shape = longDiag !== 0 ? 4 : 2;
            if ((inverted & 1) !== 0) shape += 6;
            blendedTiles.push({ blendNdx: bNdx, shape, custom });
        }
        const cliffInfos = [{ tileIndex: 0, u0: 0, v0: 0, u1: 0, v1: 0, u2: 0, v2: 0, u3: 0, v3: 0 }];
        for (let i = 1; i < numCliffInfo && bp + 38 <= blendEnd; i++) {
            cliffInfos.push({
                tileIndex: decomp.readInt32LE(bp),
                u0: decomp.readFloatLE(bp + 4), v0: decomp.readFloatLE(bp + 8),
                u1: decomp.readFloatLE(bp + 12), v1: decomp.readFloatLE(bp + 16),
                u2: decomp.readFloatLE(bp + 20), v2: decomp.readFloatLE(bp + 24),
                u3: decomp.readFloatLE(bp + 28), v3: decomp.readFloatLE(bp + 32)
            });
            bp += 38;
        }

        const evalBlendAlpha = (shape, cu, cv) => {
            const inv = shape >= 6;
            const base = inv ? shape - 6 : shape;
            let h = cu, v = cv;
            if (base === 0) {
                if (!inv) h = 1 - h;
                return 1 - Math.max(0, Math.min(1, h));
            }
            if (base === 1) {
                if (!inv) v = 1 - v;
                return 1 - Math.max(0, Math.min(1, v));
            }
            const rightD = base === 3 || base === 5;
            const longD = base === 4 || base === 5;
            if (rightD) h = 1 - h;
            if (!inv) v = 1 - v;
            v += h;
            if (longD) v -= 64 / 63;
            return 1 - Math.max(0, Math.min(1, v));
        };

        // Precompute a 4x4 box-filtered mip (8x8 texel average per sample) for each quarter-tile (tileId) on demand.
        // Matches WorldHeightMap's macro mip sampling (sentifold tileAtlas.ts) so the macro map captures smooth
        // tile color gradients and exact blend transitions with zero 3-world-unit Nyquist pebble aliasing blotches,
        // while the 2048px canvas pattern + dual-scale GPU detail/cliff shader render crisp 1:1 retail texels up close.
        const quarterTileMipCache = new Map();
        const getQuarterTileMip4x4 = (tileId) => {
            let mip = quarterTileMipCache.get(tileId);
            if (mip) return mip;
            const baseTileId = tileId >> 2;
            let cls = texClasses[0];
            for (let c = 0; c < texClasses.length; c++) {
                if (baseTileId >= texClasses[c].firstTile && baseTileId < texClasses[c].firstTile + texClasses[c].numTiles) {
                    cls = texClasses[c];
                    break;
                }
            }
            mip = new Float32Array(16 * 4);
            if (!cls || !cls.tga) {
                for (let i = 0; i < 16; i++) {
                    mip[i * 4] = 180; mip[i * 4 + 1] = 150; mip[i * 4 + 2] = 105; mip[i * 4 + 3] = 255;
                }
                quarterTileMipCache.set(tileId, mip);
                return mip;
            }
            const localTile = Math.max(0, baseTileId - cls.firstTile);
            const tw = Math.max(1, cls.width || 1);
            const tileCol = localTile % tw;
            const tileRow = Math.floor(localTile / tw) % tw;
            const tileW = cls.tga.w / tw;
            const tileH = cls.tga.h / tw;
            const minU = (tileId & 1) !== 0 ? 0.5 : 0.0;
            const maxU = (tileId & 1) !== 0 ? 1.0 : 0.5;
            const minV = (tileId & 2) !== 0 ? 0.0 : 0.5;
            const maxV = (tileId & 2) !== 0 ? 0.5 : 1.0;
            const qx0 = Math.floor((tileCol + minU) * tileW);
            const qy0 = Math.floor((tileRow + minV) * tileH);
            const qw = Math.max(4, Math.floor((maxU - minU) * tileW));
            const qh = Math.max(4, Math.floor((maxV - minV) * tileH));
            for (let gy = 0; gy < 4; gy++) {
                const yStart = qy0 + Math.floor((gy / 4) * qh);
                const yEnd = Math.min(cls.tga.h, qy0 + Math.max(yStart - qy0 + 1, Math.floor(((gy + 1) / 4) * qh)));
                for (let gx = 0; gx < 4; gx++) {
                    const xStart = qx0 + Math.floor((gx / 4) * qw);
                    const xEnd = Math.min(cls.tga.w, qx0 + Math.max(xStart - qx0 + 1, Math.floor(((gx + 1) / 4) * qw)));
                    let sr = 0, sg = 0, sb = 0, sa = 0, cnt = 0;
                    for (let ty = yStart; ty < yEnd; ty++) {
                        for (let tx = xStart; tx < xEnd; tx++) {
                            const si = (ty * cls.tga.w + tx) * 4;
                            sr += cls.tga.rgba[si];
                            sg += cls.tga.rgba[si + 1];
                            sb += cls.tga.rgba[si + 2];
                            sa += cls.tga.rgba[si + 3];
                            cnt++;
                        }
                    }
                    const di = (gy * 4 + gx) * 4;
                    mip[di] = sr / (cnt || 1);
                    mip[di + 1] = sg / (cnt || 1);
                    mip[di + 2] = sb / (cnt || 1);
                    mip[di + 3] = sa / (cnt || 1);
                }
            }
            quarterTileMipCache.set(tileId, mip);
            return mip;
        };

        const sampleTileIdRgba = (tileId, cu, cv) => {
            const mip = getQuarterTileMip4x4(tileId);
            const fx = Math.max(0, Math.min(3, cu * 3));
            const fy = Math.max(0, Math.min(3, cv * 3));
            const x0 = Math.min(2, Math.floor(fx)), x1 = x0 + 1, wx = fx - x0;
            const y0 = Math.min(2, Math.floor(fy)), y1 = y0 + 1, wy = fy - y0;
            const i00 = (y0 * 4 + x0) * 4, i10 = (y0 * 4 + x1) * 4;
            const i01 = (y1 * 4 + x0) * 4, i11 = (y1 * 4 + x1) * 4;
            const w00 = (1 - wx) * (1 - wy), w10 = wx * (1 - wy), w01 = (1 - wx) * wy, w11 = wx * wy;
            return [
                mip[i00] * w00 + mip[i10] * w10 + mip[i01] * w01 + mip[i11] * w11,
                mip[i00 + 1] * w00 + mip[i10 + 1] * w10 + mip[i01 + 1] * w01 + mip[i11 + 1] * w11,
                mip[i00 + 2] * w00 + mip[i10 + 2] * w10 + mip[i01 + 2] * w01 + mip[i11 + 2] * w11,
                mip[i00 + 3] * w00 + mip[i10 + 3] * w10 + mip[i01 + 3] * w01 + mip[i11 + 3] * w11
            ];
        };

        if (texClasses.length > 0) {
            const TEX_RES = 768;
            const rgba = Buffer.alloc(TEX_RES * TEX_RES * 4);
            const evalCellAt = (cx, cy, cu, cv) => {
                const cellIdx = cy * W + cx;
                const tileId = decomp.readInt16LE(tileNdxOff + cellIdx * 2);
                const base = sampleTileIdRgba(tileId, cu, cv);
                let r = base[0], g = base[1], b = base[2];

                const bNdx = decomp.readInt16LE(blendNdxOff + cellIdx * 2);
                if (bNdx > 0 && bNdx < blendedTiles.length) {
                    const bInfo = blendedTiles[bNdx];
                    if (bInfo.custom < 0) {
                        const bSample = sampleTileIdRgba(bInfo.blendNdx, cu, cv);
                        const a = evalBlendAlpha(bInfo.shape, cu, cv) * (bSample[3] / 255);
                        r = r * (1 - a) + bSample[0] * a;
                        g = g * (1 - a) + bSample[1] * a;
                        b = b * (1 - a) + bSample[2] * a;
                    }
                }
                if (extraNdxOff > 0) {
                    const eNdx = decomp.readInt16LE(extraNdxOff + cellIdx * 2);
                    if (eNdx > 0 && eNdx < blendedTiles.length) {
                        const eInfo = blendedTiles[eNdx];
                        if (eInfo.custom < 0) {
                            const eSample = sampleTileIdRgba(eInfo.blendNdx, cu, cv);
                            const a = evalBlendAlpha(eInfo.shape, cu, cv) * (eSample[3] / 255);
                            r = r * (1 - a) + eSample[0] * a;
                            g = g * (1 - a) + eSample[1] * a;
                            b = b * (1 - a) + eSample[2] * a;
                        }
                    }
                }
                if (blendVer >= 7) {
                    const isCliff = (decomp[cliffStateOff + cy * cliffByteWidth + (cx >> 3)] & (1 << (cx & 7))) !== 0;
                    if (isCliff) {
                        r *= 0.85; g *= 0.83; b *= 0.80;
                    }
                }
                return [r, g, b];
            };

            for (let py = 0; py < TEX_RES; py++) {
                const normY = py / (TEX_RES - 1);
                const fy = border + (1 - normY) * (playH - 1);
                const cy = Math.min(H - 2, Math.max(0, Math.floor(fy)));
                const cv = fy - cy;
                for (let px = 0; px < TEX_RES; px++) {
                    const normX = px / (TEX_RES - 1);
                    const fx = border + normX * (playW - 1);
                    const cx = Math.min(W - 2, Math.max(0, Math.floor(fx)));
                    const cu = fx - cx;
                    // Smooth 2x2 sub-cell supersampling across cell boundaries
                    const c0 = evalCellAt(cx, cy, cu, cv);
                    const cX = evalCellAt(Math.min(W - 2, cx + 1), cy, cu, cv);
                    const cY = evalCellAt(cx, Math.min(H - 2, cy + 1), cu, cv);
                    const bx = Math.max(0, (cu - 0.65) / 0.35) * 0.35;
                    const by = Math.max(0, (cv - 0.65) / 0.35) * 0.35;
                    const r = c0[0] * (1 - bx - by) + cX[0] * bx + cY[0] * by;
                    const g = c0[1] * (1 - bx - by) + cX[1] * bx + cY[1] * by;
                    const b = c0[2] * (1 - bx - by) + cX[2] * bx + cY[2] * by;
                    const di = (py * TEX_RES + px) * 4;
                    rgba[di] = Math.round(r);
                    rgba[di + 1] = Math.round(g);
                    rgba[di + 2] = Math.round(b);
                    rgba[di + 3] = 255;
                }
            }
            // Stamp retail roads onto the 512x512 ground texture
            for (const rd of rawRoads) {
                const rDef = TERRAIN_ASSETS.roadDefs[rd.tName] || { width: 35, tex: '' };
                const rTga = TERRAIN_ASSETS.getTga(rDef.tex);
                const x1 = (rd.x1 + 0.5) * TEX_RES, y1 = (rd.z1 + 0.5) * TEX_RES;
                const x2 = (rd.x2 + 0.5) * TEX_RES, y2 = (rd.z2 + 0.5) * TEX_RES;
                const segLen = Math.hypot(x2 - x1, y2 - y1);
                if (segLen < 0.5) continue;
                const halfW = Math.max(2.0, (rDef.width / (playW * 10)) * TEX_RES * 0.55);
                const minX = Math.max(0, Math.floor(Math.min(x1, x2) - halfW - 1));
                const maxX = Math.min(TEX_RES - 1, Math.ceil(Math.max(x1, x2) + halfW + 1));
                const minY = Math.max(0, Math.floor(Math.min(y1, y2) - halfW - 1));
                const maxY = Math.min(TEX_RES - 1, Math.ceil(Math.max(y1, y2) + halfW + 1));
                const dx = (x2 - x1) / segLen, dy = (y2 - y1) / segLen;
                for (let py = minY; py <= maxY; py++) {
                    for (let px = minX; px <= maxX; px++) {
                        const vx = px - x1, vy = py - y1;
                        const proj = Math.max(0, Math.min(segLen, vx * dx + vy * dy));
                        const cx = x1 + dx * proj, cy = y1 + dy * proj;
                        const dist = Math.hypot(px - cx, py - cy);
                        if (dist <= halfW) {
                            const di = (py * TEX_RES + px) * 4;
                            let rr = 96, rg = 92, rb = 84, alpha = 0.85;
                            if (rTga) {
                                const cross = ((vx * (-dy) + vy * dx) / (halfW * 2)) + 0.5;
                                const tx = Math.min(rTga.w - 1, Math.max(0, Math.floor(cross * rTga.w)));
                                const ty = Math.min(rTga.h - 1, Math.max(0, Math.floor(((proj * 0.12) % 1) * rTga.h)));
                                const si = (ty * rTga.w + tx) * 4;
                                rr = rTga.rgba[si]; rg = rTga.rgba[si + 1]; rb = rTga.rgba[si + 2];
                                alpha = (rTga.rgba[si + 3] / 255);
                            } else {
                                alpha = Math.max(0, 1 - (dist / halfW) * 0.35) * 0.78;
                            }
                            rgba[di] = Math.round(rgba[di] * (1 - alpha) + rr * alpha);
                            rgba[di + 1] = Math.round(rgba[di + 1] * (1 - alpha) + rg * alpha);
                            rgba[di + 2] = Math.round(rgba[di + 2] * (1 - alpha) + rb * alpha);
                        }
                    }
                }
            }
            terrainDataUrl = encodeRgbPngDataUrl(rgba, TEX_RES, TEX_RES, 0xfc);
        }
    }

    console.log(`  [OK] ${meta.name.padEnd(20)} | ${W}x${H} (border ${border}) | Spawns: ${rawSpawns.length} | Roads: ${rawRoads.length} | WaterPolys: ${waterPolygons.length} | Tex: ${(terrainDataUrl.length / 1024).toFixed(1)} KB`);

    return {
        id: mapKey,
        name: meta.name,
        theme: meta.theme,
        waterLevel: meta.waterLevel !== undefined ? meta.waterLevel : -999,
        maxPlayers: rawSpawns.length,
        grid,
        spawns: rawSpawns,
        supplies: rawSupplies,
        derricks: rawDerricks,
        hospitals: rawHospitals,
        refineries: rawRefineries,
        bunkers: rawBunkers,
        bridges: rawBridges,
        buildings: rawBuildings,
        props: rawProps,
        roads: rawRoads.map(rd => [
            Number(rd.x1.toFixed(4)),
            Number(rd.z1.toFixed(4)),
            Number(rd.x2.toFixed(4)),
            Number(rd.z2.toFixed(4)),
            /dirt|sand|mud|trail|gravel/i.test(rd.tName || '') ? 'dirt' : 'asphalt'
        ]),
        waterPolygons,
        tgaDataUrl,
        terrainDataUrl
    };
}

const OFFICIAL_MAP_LIST = [
    { id: 'tournament_desert', folder: 'tournament desert', name: 'Tournament Desert', theme: 'desert', waterLevel: -999 },
    { id: 'scorched_earth', folder: 'scorched earth', name: 'Scorched Earth', theme: 'desert', waterLevel: -999 },
    { id: 'desert_fury', folder: 'desert fury', name: 'Desert Fury', theme: 'desert', waterLevel: -999 },
    { id: 'golden_oasis', folder: 'golden oasis', name: 'Golden Oasis', theme: 'desert', waterLevel: -0.8 },
    { id: 'barren_badlands', folder: 'barrenbadlands', name: 'Barren Badlands', theme: 'desert', waterLevel: -999 },
    { id: 'flash_fire', folder: 'flash fire', name: 'Flash Fire', theme: 'desert', waterLevel: -999 },
    { id: 'winter_wolf', folder: 'winter wolf', name: 'Winter Wolf', theme: 'snow', waterLevel: -0.8 },
    { id: 'alpine_assault', folder: 'alpine assault', name: 'Alpine Assault', theme: 'snow', waterLevel: -0.8 },
    { id: 'final_crusade', folder: 'final crusade', name: 'Final Crusade', theme: 'jungle', waterLevel: -0.8 },
    { id: 'heartland_shield', folder: 'heartland shield', name: 'Heartland Shield', theme: 'jungle', waterLevel: -0.8 },
    { id: 'lone_eagle', folder: 'lone eagle', name: 'Lone Eagle', theme: 'jungle', waterLevel: -0.8 },
    { id: 'defcon6', folder: 'defcon6', name: 'DEFCON 6', theme: 'jungle', waterLevel: -999 },
    { id: 'green_pastures', folder: 'green pastures', name: 'Green Pastures', theme: 'jungle', waterLevel: -0.8 },
    { id: 'hostile_dawn', folder: 'hostile dawn', name: 'Hostile Dawn', theme: 'desert', waterLevel: -999 },
    { id: 'red_rock', folder: 'red rock', name: 'Red Rock', theme: 'desert', waterLevel: -999 },
    { id: 'twilight_flame', folder: 'twilight flame', name: 'Twilight Flame', theme: 'desert', waterLevel: -999 },
    { id: 'fortress_avalanche', folder: 'fortress avalanche', name: 'Fortress Avalanche', theme: 'snow', waterLevel: -0.8 }
];

console.log(`Extracting ${OFFICIAL_MAP_LIST.length} Official EA Skirmish Maps from MapsZH.big & Maps.big...`);
const officialMaps = {};
for (const meta of OFFICIAL_MAP_LIST) {
    officialMaps[meta.id] = parseOfficialMap(meta.id, meta);
}

// Extract crisp 1:1 native 256x256 seamless retail ground detail tiles from Terrain.big / TerrainZH.big
// using the sharpest 4x4 (256x256) retail TGA sheets with seamless edge-wrapping & micro-contrast enhancement.
function encodeRetailTile256(tgaName, contrastBoost = 1.35) {
    const tga = TERRAIN_ASSETS.getTga(tgaName);
    if (!tga) throw new Error(`Missing retail terrain tile: ${tgaName}`);
    const outSz = 256;
    const raw = Buffer.alloc(outSz * outSz * 4);
    let sumR = 0, sumG = 0, sumB = 0;
    const n = outSz * outSz;
    for (let y = 0; y < outSz; y++) {
        const y0 = y % tga.h;
        for (let x = 0; x < outSz; x++) {
            const x0 = x % tga.w;
            const si = (y0 * tga.w + x0) * 4;
            const di = (y * outSz + x) * 4;
            raw[di] = tga.rgba[si];
            raw[di + 1] = tga.rgba[si + 1];
            raw[di + 2] = tga.rgba[si + 2];
            raw[di + 3] = 255;
            sumR += raw[di]; sumG += raw[di + 1]; sumB += raw[di + 2];
        }
    }
    const meanR = sumR / n, meanG = sumG / n, meanB = sumB / n;
    // Seamless toroidal cross-fade border (16px) + micro-contrast around mean color
    const rgba = Buffer.alloc(outSz * outSz * 4);
    const border = 16;
    for (let y = 0; y < outSz; y++) {
        const wy = y < border ? (y / border) : 1.0;
        const oppY = (y + (outSz >> 1)) % outSz;
        for (let x = 0; x < outSz; x++) {
            const wx = x < border ? (x / border) : 1.0;
            const oppX = (x + (outSz >> 1)) % outSz;
            const i00 = (y * outSz + x) * 4;
            const i10 = (y * outSz + oppX) * 4;
            const i01 = (oppY * outSz + x) * 4;
            const i11 = (oppY * outSz + oppX) * 4;
            const w00 = wx * wy, w10 = (1 - wx) * wy, w01 = wx * (1 - wy), w11 = (1 - wx) * (1 - wy);
            for (let c = 0; c < 3; c++) {
                const meanC = c === 0 ? meanR : (c === 1 ? meanG : meanB);
                const val = raw[i00 + c] * w00 + raw[i10 + c] * w10 + raw[i01 + c] * w01 + raw[i11 + c] * w11;
                const boosted = meanC + (val - meanC) * contrastBoost;
                rgba[i00 + c] = Math.max(0, Math.min(255, Math.round(boosted)));
            }
            rgba[i00 + 3] = 255;
        }
    }
    return encodeRgbPngDataUrl(rgba, outSz, outSz, 0xff);
}

const RETAIL_TERRAIN_TILES = {
    desert: encodeRetailTile256('tmsand11a.tga', 1.45),
    jungle: encodeRetailTile256('tmgras08a.tga', 1.30),
    snow: encodeRetailTile256('tmsnow03b.tga', 1.45),
    city: encodeRetailTile256('tmdirt12a.tga', 1.35),
    cliff: encodeRetailTile256('tmrock01a.tga', 1.35)
};
const retailSandUri = RETAIL_TERRAIN_TILES.desert;

const outJs = `/**
 * Official EA Command & Conquer: Generals & Zero Hour Skirmish Maps
 * Extracted directly from retail Maps.big & MapsZH.big (CkMp HeightMapData, ObjectsList & aerial TGA previews)
 */
window.OFFICIAL_SKIRMISH_MAPS = ${JSON.stringify(officialMaps)};

window.RETAIL_TERRAIN_TILES = ${JSON.stringify(RETAIL_TERRAIN_TILES)};

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
        canvas.width = 1024;
        canvas.height = 1024;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = mapObj.theme === 'snow' ? '#dce4ec' : mapObj.theme === 'jungle' ? '#4a5d38' : '#bfa87a';
        ctx.fillRect(0, 0, 1024, 1024);

        var tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;

        var applyDetail = function() {
            if (window.RETAIL_DESERT_SAND_URI) {
                var sandImg = new Image();
                sandImg.onload = function() {
                    var pat = ctx.createPattern(sandImg, 'repeat');
                    if (pat) {
                        ctx.save();
                        ctx.scale(0.16, 0.16);
                        ctx.globalCompositeOperation = 'overlay';
                        ctx.globalAlpha = mapObj.theme === 'desert' ? 0.62 : 0.30;
                        ctx.fillStyle = pat;
                        ctx.fillRect(0, 0, 1024 / 0.16, 1024 / 0.16);
                        ctx.restore();
                        tex.needsUpdate = true;
                    }
                };
                sandImg.src = window.RETAIL_DESERT_SAND_URI;
            }
        };

        var drawAerial = function(img) {
            ctx.drawImage(img, 0, 0, 1024, 1024);
            // Add subtle surface micro-grain so close-up ground looks crisp
            var imgData = ctx.getImageData(0, 0, 1024, 1024);
            var d = imgData.data;
            for (var i = 0; i < d.length; i += 4) {
                var px = (i >> 2) & 1023;
                var py = (i >> 12);
                var n = (((px * 1664525 + py * 1013904223) ^ (px >> 2)) & 0x1f) - 16;
                d[i] = Math.max(0, Math.min(255, d[i] + n * 0.45));
                d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n * 0.45));
                d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.45));
            }
            ctx.putImageData(imgData, 0, 0);
            applyDetail();
            tex.needsUpdate = true;
            if (window._minimapTerrainCanvas && typeof currentMapType !== 'undefined' && currentMapType === mapKey) {
                var mCtx = window._minimapTerrainCanvas.getContext('2d');
                mCtx.drawImage(img, 0, 0, window._minimapTerrainCanvas.width, window._minimapTerrainCanvas.height);
            }
        };

        var cachedImg = window._officialMapImages && window._officialMapImages[mapKey];
        if (mapObj.terrainDataUrl) {
            var tImg = new Image();
            tImg.onload = function() { drawAerial(tImg); };
            tImg.src = mapObj.terrainDataUrl;
        } else if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
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
