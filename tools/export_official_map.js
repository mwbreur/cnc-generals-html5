const fs = require('fs');
const path = require('path');

function decompressRefPack(buf, startOffset) {
    let pos = startOffset;
    const magic = buf.readUInt16BE(pos); pos += 2;
    const decompSize = (buf[pos] << 16) | (buf[pos+1] << 8) | buf[pos+2]; pos += 3;
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
            const copyCount = (((b0 >> 2) & 0x07) << 8) + b3 + 5;
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

const mapsBigPath = path.join(__dirname, '..', 'generals_big_files', 'Maps.big');
if (!fs.existsSync(mapsBigPath)) {
    console.error('Maps.big not found at:', mapsBigPath);
    process.exit(1);
}

const mapsBuf = fs.readFileSync(mapsBigPath);
const count = mapsBuf.readUInt32BE(8);
let pos = 16, mapOff = 0, mapSz = 0, tgaOff = 0, tgaSz = 0;
for (let i = 0; i < count; i++) {
    const off = mapsBuf.readUInt32BE(pos);
    const sz = mapsBuf.readUInt32BE(pos + 4); pos += 8;
    let end = pos; while (end < mapsBuf.length && mapsBuf[end] !== 0) end++;
    const name = mapsBuf.toString('ascii', pos, end);
    if (name.toLowerCase().includes('tournament desert.map')) { mapOff = off; mapSz = sz; }
    if (name.toLowerCase().includes('tournament desert.tga')) { tgaOff = off; tgaSz = sz; }
    pos = end + 1;
}

console.log('Extracting Tournament Desert.map...');
const decomp = decompressRefPack(mapsBuf.slice(mapOff, mapOff + mapSz), 8);
const idx = decomp.indexOf('HeightMapData');
const dataOffset = idx + 55;
const W = 270, H = 320, bX = 35, bY = 35;
const playW = W - 2 * bX, playH = H - 2 * bY;

const GRID = 65;
const grid = [];
for (let r = 0; r < GRID; r++) {
    const row = [];
    const srcY = Math.floor(bY + (r / (GRID - 1)) * playH);
    for (let c = 0; c < GRID; c++) {
        const srcX = Math.floor(bX + (c / (GRID - 1)) * playW);
        const val = decomp[dataOffset + srcY * W + srcX];
        row.push(parseFloat(((val - 64) * 0.16).toFixed(2)));
    }
    grid.push(row);
}

console.log('Extracting Tournament Desert.tga aerial terrain texture...');
const tgaBuf = mapsBuf.slice(tgaOff, tgaOff + tgaSz);
const tgaW = tgaBuf.readUInt16LE(12), tgaH = tgaBuf.readUInt16LE(14);
const tgaPixels = Buffer.alloc(tgaW * tgaH * 4);
const offsetTga = 18;
for (let i = 0; i < tgaW * tgaH; i++) {
    tgaPixels[i * 4 + 0] = tgaBuf[offsetTga + i * 4 + 2]; // R
    tgaPixels[i * 4 + 1] = tgaBuf[offsetTga + i * 4 + 1]; // G
    tgaPixels[i * 4 + 2] = tgaBuf[offsetTga + i * 4 + 0]; // B
    tgaPixels[i * 4 + 3] = 255;                          // A
}

const outData = {
    grid,
    tgaW,
    tgaH,
    textureB64: tgaPixels.toString('base64')
};

const outputPath = path.join(__dirname, '..', 'src', 'js', '07_tournament_desert_data.json');
fs.writeFileSync(outputPath, JSON.stringify(outData), 'utf8');
console.log(`Saved official map data to ${outputPath} (${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB)`);
