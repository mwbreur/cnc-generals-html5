const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function readBigEntry(bigFile, subPath) {
    const fullBigPath = path.join('D:/C&C/generals_big_files', bigFile);
    if (!fs.existsSync(fullBigPath)) return null;
    const fd = fs.openSync(fullBigPath, 'r');
    const headerBuf = Buffer.alloc(16);
    fs.readSync(fd, headerBuf, 0, 16, 0);
    const numEntries = headerBuf.readUInt32BE(8);
    const tableSize = headerBuf.readUInt32BE(12);
    const tableBuf = Buffer.alloc(tableSize);
    fs.readSync(fd, tableBuf, 0, tableSize, 16);
    fs.closeSync(fd);
    let offset = 0;
    for (let i = 0; i < numEntries; i++) {
        if (offset + 8 > tableSize) break;
        const o = tableBuf.readUInt32BE(offset);
        const sz = tableBuf.readUInt32BE(offset + 4);
        offset += 8;
        let endNull = offset;
        while (endNull < tableSize && tableBuf[endNull] !== 0) endNull++;
        const entryPath = tableBuf.toString('ascii', offset, endNull);
        offset = endNull + 1;
        if (entryPath.toLowerCase() === subPath.toLowerCase() || path.basename(entryPath).toLowerCase() === subPath.toLowerCase()) {
            const dataBuf = Buffer.alloc(sz);
            const fd2 = fs.openSync(fullBigPath, 'r');
            fs.readSync(fd2, dataBuf, 0, sz, o);
            fs.closeSync(fd2);
            return dataBuf;
        }
    }
    return null;
}

function encodePng(rgba, width, height) {
    const rawData = Buffer.alloc(height * (1 + width * 4));
    for (let y = 0; y < height; y++) {
        rawData[y * (1 + width * 4)] = 0;
        rgba.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
    }
    const compressed = zlib.deflateSync(rawData);
    function crc32(buf) {
        let c = ~0;
        for (let i = 0; i < buf.length; i++) {
            c ^= buf[i];
            for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
        }
        return ~c >>> 0;
    }
    function makeChunk(type, data) {
        const len = data.length;
        const buf = Buffer.alloc(12 + len);
        buf.writeUInt32BE(len, 0);
        buf.write(type, 4, 4, 'ascii');
        data.copy(buf, 8);
        const crc = crc32(buf.slice(4, 8 + len));
        buf.writeUInt32BE(crc, 8 + len);
        return buf;
    }
    return 'data:image/png;base64,' + Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        makeChunk('IHDR', Buffer.from([
            (width >>> 24)&255, (width >>> 16)&255, (width >>> 8)&255, width&255,
            (height >>> 24)&255, (height >>> 16)&255, (height >>> 8)&255, height&255,
            8, 6, 0, 0, 0
        ])),
        makeChunk('IDAT', compressed),
        makeChunk('IEND', Buffer.alloc(0))
    ]).toString('base64');
}

// Load TGAs
const tgaCache = {};
for (let i = 1; i <= 5; i++) {
    const fn = 'sauserinterface512_00' + i + '.tga';
    const filePath = path.join('D:/C&C/extracted_assets/textures', fn);
    if (fs.existsSync(filePath)) {
        tgaCache[fn.toLowerCase()] = fs.readFileSync(filePath);
    }
}
const scTga = path.join('D:/C&C/extracted_assets/textures', 'sacontrolbar512_001.tga');
if (fs.existsSync(scTga)) {
    tgaCache['sacontrolbar512_001.tga'] = fs.readFileSync(scTga);
}
const ss1 = readBigEntry('EnglishZH.big', 'Data\\English\\Art\\Textures\\SSUserInterface512_001.tga');
if (ss1) tgaCache['ssuserinterface512_001.tga'] = ss1;
const ss2 = readBigEntry('EnglishZH.big', 'Data\\English\\Art\\Textures\\SSUserInterface512_002.tga');
if (ss2) tgaCache['ssuserinterface512_002.tga'] = ss2;

const ini1 = readBigEntry('INIZH.big', 'Data\\INI\\MappedImages\\TextureSize_512\\SAUserInterface512.INI').toString('utf8');
const ini2 = readBigEntry('INIZH.big', 'Data\\INI\\MappedImages\\TextureSize_512\\SSUserInterface512.INI').toString('utf8');
const ini3 = readBigEntry('INIZH.big', 'Data\\INI\\MappedImages\\TextureSize_512\\SAControlBar512.INI').toString('utf8');
const combinedIni = ini1 + '\n' + ini2 + '\n' + ini3;

const mapped = {};
const blockRegex = /MappedImage\s+([a-zA-Z0-9_]+)[\s\S]*?Texture\s*=\s*([a-zA-Z0-9_.]+)\b[\s\S]*?Coords\s*=\s*Left:(\d+)\s+Top:(\d+)\s+Right:(\d+)\s+Bottom:(\d+)[\s\S]*?End/gi;
let m;
while ((m = blockRegex.exec(combinedIni)) !== null) {
    mapped[m[1].toLowerCase()] = {
        name: m[1],
        texture: m[2].toLowerCase(),
        left: parseInt(m[3]),
        top: parseInt(m[4]),
        right: parseInt(m[5]),
        bottom: parseInt(m[6])
    };
}

function cropCameo(imageName) {
    const info = mapped[imageName.toLowerCase()];
    if (!info) return null;
    const tgaBuf = tgaCache[info.texture];
    if (!tgaBuf) return null;

    const tgaW = tgaBuf.readUInt16LE(12), tgaH = tgaBuf.readUInt16LE(14);
    const dataOffset = 18;
    const cropW = info.right - info.left;
    const cropH = info.bottom - info.top;
    if (cropW <= 0 || cropH <= 0) return null;
    const cropRgba = Buffer.alloc(cropW * cropH * 4);

    for (let y = 0; y < cropH; y++) {
        const srcY = tgaH - 1 - (info.top + y);
        for (let x = 0; x < cropW; x++) {
            const srcX = info.left + x;
            const srcIdx = dataOffset + (srcY * tgaW + srcX) * 4;
            const dstIdx = (y * cropW + x) * 4;
            if (srcIdx + 3 < tgaBuf.length) {
                cropRgba[dstIdx + 0] = tgaBuf[srcIdx + 2]; // R
                cropRgba[dstIdx + 1] = tgaBuf[srcIdx + 1]; // G
                cropRgba[dstIdx + 2] = tgaBuf[srcIdx + 0]; // B
                cropRgba[dstIdx + 3] = tgaBuf[srcIdx + 3]; // A
            }
        }
    }
    return encodePng(cropRgba, cropW, cropH);
}

// Map logical game keys to official Cameo names
const CAMEO_MAP = {
    // USA Units
    'crusader': 'SACCrusader',
    'paladin': 'SAPaladin',
    'humvee': 'SAHummer',
    'ranger': 'SARanger',
    'missileDefender': 'SAMissleDefender',
    'pathfinder': 'SAPathFinder1',
    'burton': 'SABurton',
    'dozer': 'SACDozer',
    'chinook': 'SAChinook',
    'comanche': 'SACCommanche_L',
    'raptor': 'SACRaptor',
    'stealthFighter': 'SAStealth',
    'aurora': 'SAAurora',
    'ambulance': 'SAAmbulance',
    'tomahawk': 'SACTomahawk',
    'drone_battle': 'SABattleDrone',
    'drone_scout': 'SAScout',
    'drone_hellfire': 'SAHellfire',

    // USA Buildings
    'commandCenter': 'SAComCentr',
    'power': 'SAPowerPlant',
    'barracks': 'SABarracks',
    'factory': 'SACWeaponsfact',
    'supplyCenter': 'SASupplyCntr',
    'airfield': 'SAACommand',
    'patriot': 'SAPatriot',
    'strategyCenter': 'SAStrategyCenter',
    'particleCannon': 'SALaserCan_L',
    'supplyDrop': 'SADropZone',
    'detentionCamp': 'SAPrison',

    // Neutral / Tech
    'tech_oilDerrick': 'SAsupplyline',
    'tech_supplyDock': 'SASupplyCntr',

    // Command Action Buttons
    'stop': 'SSStop',
    'guard': 'SSGuard',
    'scatter': 'SSGuardAIR',
    'repair': 'SSRepair',
    'sell': 'SSSell2',
    'rally': 'SSRally',
    'attack': 'SAUAttack',
    'builders': 'SAWorker',
    'beacon': 'SABeacon'
};

const outputCameos = {};
for (const [key, cameoName] of Object.entries(CAMEO_MAP)) {
    let pngUrl = cropCameo(cameoName);
    if (!pngUrl && !cameoName.endsWith('_L')) {
        pngUrl = cropCameo(cameoName + '_L');
    }
    if (pngUrl) {
        outputCameos[key] = pngUrl;
        console.log(`✓ Cropped cameo for "${key}" (${cameoName})`);
    } else {
        console.warn(`✗ Failed to crop cameo for "${key}" (${cameoName})`);
    }
}

const jsContent = `/**
 * Official Command & Conquer: Generals Zero Hour Command Card Cameos & Action Icons
 * Cropped directly from retail EnglishZH.big & Textures.big
 */
window.OFFICIAL_CAMEOS = ${JSON.stringify(outputCameos, null, 2)};
`;

const destPath = path.join('D:/C&C/src/js/10b_cameos.js');
fs.writeFileSync(destPath, jsContent, 'utf8');
console.log(`Successfully generated ${destPath} with ${Object.keys(outputCameos).length} official cameos.`);
