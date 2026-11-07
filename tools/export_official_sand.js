const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function readBigEntry(bigFile, subPath) {
    const fd = fs.openSync(path.join('D:/C&C/generals_big_files', bigFile), 'r');
    const headerBuf = Buffer.alloc(16);
    fs.readSync(fd, headerBuf, 0, 16, 0);
    const numEntries = headerBuf.readUInt32BE(8);
    const tableSize = headerBuf.readUInt32BE(12);
    const tableBuf = Buffer.alloc(tableSize);
    fs.readSync(fd, tableBuf, 0, tableSize, 16);
    let cursor = 0;
    for (let i = 0; i < numEntries; i++) {
        if (cursor + 8 > tableSize) break;
        const offset = tableBuf.readUInt32BE(cursor);
        const size = tableBuf.readUInt32BE(cursor + 4);
        cursor += 8;
        let endNull = cursor;
        while (endNull < tableSize && tableBuf[endNull] !== 0) endNull++;
        const entryPath = tableBuf.toString('ascii', cursor, endNull);
        cursor = endNull + 1;
        if (entryPath.toLowerCase().includes(subPath.toLowerCase())) {
            const dataBuf = Buffer.alloc(size);
            fs.readSync(fd, dataBuf, 0, size, offset);
            fs.closeSync(fd);
            return dataBuf;
        }
    }
    fs.closeSync(fd);
    return null;
}

const tgaBuf = readBigEntry('Terrain.big', 'TLSand01a.tga');
const w = tgaBuf.readUInt16LE(12), h = tgaBuf.readUInt16LE(14);
const desc = tgaBuf.readUInt8(17);
const topToBottom = (desc & 0x20) !== 0;

const tw = 192, th = 192;
const rgba = Buffer.alloc(tw * th * 4);
for (let ty = 0; ty < th; ty++) {
    const sy = Math.floor(ty * 2);
    const targetSy = topToBottom ? sy : (h - 1 - sy);
    for (let tx = 0; tx < tw; tx++) {
        const sx = Math.floor(tx * 2);
        const srcOffset = 18 + (targetSy * w + sx) * 3;
        const b = tgaBuf[srcOffset], g = tgaBuf[srcOffset + 1], r = tgaBuf[srcOffset + 2];
        const destIdx = (ty * tw + tx) * 4;
        rgba[destIdx] = r; rgba[destIdx+1] = g; rgba[destIdx+2] = b; rgba[destIdx+3] = 255;
    }
}

function encodePng(rgba, width, height) {
    const rawData = Buffer.alloc(height * (1 + width * 4));
    for (let y = 0; y < height; y++) {
        rawData[y * (1 + width * 4)] = 0;
        rgba.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
    }
    const deflated = zlib.deflateSync(rawData, { level: 9 });
    
    function makeChunk(type, data) {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length, 0);
        const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const crc = Buffer.alloc(4);
        crc.writeInt32BE(crc32(typeAndData), 0);
        return Buffer.concat([len, typeAndData, crc]);
    }
    function crc32(buf) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < buf.length; i++) {
            c ^= buf[i];
            for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
        }
        return (c ^ 0xFFFFFFFF) | 0;
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        makeChunk('IHDR', ihdr),
        makeChunk('IDAT', deflated),
        makeChunk('IEND', Buffer.alloc(0))
    ]);
}

const png = encodePng(rgba, tw, th);
const b64 = 'data:image/png;base64,' + png.toString('base64');

let code07b = fs.readFileSync('src/js/07b_tournament_desert.js', 'utf8');
const fnIdx = code07b.indexOf('function createTournamentDesertTexture()');
if (fnIdx !== -1) {
    const newFn = `
window.RETAIL_DESERT_SAND_URI = ${JSON.stringify(b64)};

function createTournamentDesertTexture() {
    if (window._tournamentDesertTexCache) return window._tournamentDesertTexCache;
    try {
        const img = new Image();
        const tex = new THREE.Texture(img);
        img.onload = () => {
            tex.needsUpdate = true;
        };
        img.src = window.RETAIL_DESERT_SAND_URI;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(55, 55);
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        window._tournamentDesertTexCache = tex;
        return tex;
    } catch (e) {
        console.warn('Failed to load authentic desert sand texture:', e);
        return typeof createTerrainTextureForMap === 'function' ? createTerrainTextureForMap('desert') : null;
    }
}
window.createTournamentDesertTexture = createTournamentDesertTexture;
`;
    code07b = code07b.substring(0, fnIdx) + newFn;
    fs.writeFileSync('src/js/07b_tournament_desert.js', code07b, 'utf8');
    console.log('Successfully updated 07b_tournament_desert.js with authentic retail sand texture!');
} else {
    console.warn('Could not find createTournamentDesertTexture in 07b_tournament_desert.js');
}
