const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Index all .big files once for fast lookup
const BIG_FILES = [
    'INIZH.big',
    'EnglishZH.big',
    'TexturesZH.big',
    'WindowZH.big',
    'INI.big',
    'English.big',
    'Textures.big',
    'Window.big'
];

const bigCatalog = {};
for (const bigFile of BIG_FILES) {
    const fullBigPath = path.join('D:/C&C/generals_big_files', bigFile);
    if (!fs.existsSync(fullBigPath)) continue;
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
        const entryPath = tableBuf.toString('ascii', offset, endNull).replace(/\\/g, '/');
        offset = endNull + 1;
        const fullKey = entryPath.toLowerCase();
        const baseKey = path.basename(entryPath).toLowerCase();
        if (!bigCatalog[fullKey]) bigCatalog[fullKey] = { bigPath: fullBigPath, offset: o, size: sz };
        if (!bigCatalog[baseKey]) bigCatalog[baseKey] = { bigPath: fullBigPath, offset: o, size: sz };
    }
}

function getAssetBuffer(nameOrPath) {
    const clean = nameOrPath.replace(/\\/g, '/').toLowerCase();
    const base = path.basename(clean);
    const localPath = path.join('D:/C&C/extracted_assets/textures', base);
    if (fs.existsSync(localPath)) {
        return fs.readFileSync(localPath);
    }
    const entry = bigCatalog[clean] || bigCatalog[base];
    if (!entry) return null;
    const buf = Buffer.alloc(entry.size);
    const fd = fs.openSync(entry.bigPath, 'r');
    fs.readSync(fd, buf, 0, entry.size, entry.offset);
    fs.closeSync(fd);
    return buf;
}

function decodeTga(tgaBuf) {
    if (!tgaBuf || tgaBuf.length < 18) return null;
    const idLen = tgaBuf[0];
    const imageType = tgaBuf[2];
    const width = tgaBuf.readUInt16LE(12);
    const height = tgaBuf.readUInt16LE(14);
    const bpp = tgaBuf[16];
    const descriptor = tgaBuf[17];
    const bytesPerPixel = bpp >> 3;
    const topOrigin = (descriptor & 0x20) !== 0;

    if ((imageType !== 2 && imageType !== 10) || (bytesPerPixel !== 3 && bytesPerPixel !== 4)) {
        return null;
    }

    const rgba = Buffer.alloc(width * height * 4);
    let srcPos = 18 + idLen;

    const writePixel = (pixIdx, r, g, b, a) => {
        const x = pixIdx % width;
        const rawY = Math.floor(pixIdx / width);
        const y = topOrigin ? rawY : (height - 1 - rawY);
        const dst = (y * width + x) * 4;
        rgba[dst] = r;
        rgba[dst + 1] = g;
        rgba[dst + 2] = b;
        rgba[dst + 3] = a;
    };

    const totalPixels = width * height;
    if (imageType === 2) {
        for (let i = 0; i < totalPixels && srcPos + bytesPerPixel <= tgaBuf.length; i++) {
            const b = tgaBuf[srcPos];
            const g = tgaBuf[srcPos + 1];
            const r = tgaBuf[srcPos + 2];
            const a = bytesPerPixel === 4 ? tgaBuf[srcPos + 3] : 255;
            srcPos += bytesPerPixel;
            writePixel(i, r, g, b, a);
        }
    } else if (imageType === 10) {
        let pixIdx = 0;
        while (pixIdx < totalPixels && srcPos < tgaBuf.length) {
            const header = tgaBuf[srcPos++];
            const count = (header & 0x7f) + 1;
            if (header & 0x80) {
                const b = tgaBuf[srcPos];
                const g = tgaBuf[srcPos + 1];
                const r = tgaBuf[srcPos + 2];
                const a = bytesPerPixel === 4 ? tgaBuf[srcPos + 3] : 255;
                srcPos += bytesPerPixel;
                for (let k = 0; k < count && pixIdx < totalPixels; k++) {
                    writePixel(pixIdx++, r, g, b, a);
                }
            } else {
                for (let k = 0; k < count && pixIdx < totalPixels && srcPos + bytesPerPixel <= tgaBuf.length; k++) {
                    const b = tgaBuf[srcPos];
                    const g = tgaBuf[srcPos + 1];
                    const r = tgaBuf[srcPos + 2];
                    const a = bytesPerPixel === 4 ? tgaBuf[srcPos + 3] : 255;
                    srcPos += bytesPerPixel;
                    writePixel(pixIdx++, r, g, b, a);
                }
            }
        }
    }

    return { rgba, width, height };
}

function resizeRgba(rgba, srcW, srcH, dstW, dstH) {
    if (srcW === dstW && srcH === dstH) return rgba;
    const out = Buffer.alloc(dstW * dstH * 4);
    for (let y = 0; y < dstH; y++) {
        const sy = Math.min(srcH - 1, Math.floor((y + 0.5) * srcH / dstH));
        for (let x = 0; x < dstW; x++) {
            const sx = Math.min(srcW - 1, Math.floor((x + 0.5) * srcW / dstW));
            const sIdx = (sy * srcW + sx) * 4;
            const dIdx = (y * dstW + x) * 4;
            out[dIdx] = rgba[sIdx];
            out[dIdx + 1] = rgba[sIdx + 1];
            out[dIdx + 2] = rgba[sIdx + 2];
            out[dIdx + 3] = rgba[sIdx + 3];
        }
    }
    return out;
}

function encodePng(rgba, width, height, quantizeBits = 0) {
    const rawData = Buffer.alloc(height * (1 + width * 4));
    const mask = quantizeBits > 0 ? (0xff << quantizeBits) & 0xff : 0xff;
    for (let y = 0; y < height; y++) {
        const rowStart = y * (1 + width * 4);
        rawData[rowStart] = 1; // Sub filter for much tighter deflate compression
        let prevR = 0, prevG = 0, prevB = 0, prevA = 0;
        for (let x = 0; x < width; x++) {
            const s = (y * width + x) * 4;
            const d = rowStart + 1 + x * 4;
            const r = rgba[s] & mask;
            const g = rgba[s + 1] & mask;
            const b = rgba[s + 2] & mask;
            const a = rgba[s + 3];
            rawData[d] = (r - prevR) & 0xff;
            rawData[d + 1] = (g - prevG) & 0xff;
            rawData[d + 2] = (b - prevB) & 0xff;
            rawData[d + 3] = (a - prevA) & 0xff;
            prevR = r; prevG = g; prevB = b; prevA = a;
        }
    }
    const compressed = zlib.deflateSync(rawData, { level: 9 });
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
            (width >>> 24) & 255, (width >>> 16) & 255, (width >>> 8) & 255, width & 255,
            (height >>> 24) & 255, (height >>> 16) & 255, (height >>> 8) & 255, height & 255,
            8, 6, 0, 0, 0
        ])),
        makeChunk('IDAT', compressed),
        makeChunk('IEND', Buffer.alloc(0))
    ]).toString('base64');
}

// Parse all UI & Cameo MappedImage INI files
const INI_FILES = [
    'Data/INI/MappedImages/TextureSize_512/SAUserInterface512.INI',
    'Data/INI/MappedImages/TextureSize_512/SNUserInterface512.INI',
    'Data/INI/MappedImages/TextureSize_512/SUUserInterface512.INI',
    'Data/INI/MappedImages/TextureSize_512/SSUserInterface512.INI',
    'Data/INI/MappedImages/TextureSize_512/SAControlBar512.INI',
    'Data/INI/MappedImages/TextureSize_512/SNControlBar512.INI',
    'Data/INI/MappedImages/TextureSize_512/SUControlBar512.INI',
    'Data/INI/MappedImages/TextureSize_512/SCLogosUserInterface512.INI',
    'Data/INI/MappedImages/TextureSize_512/SCShellUserInterface512.INI',
    'Data/INI/MappedImages/HandCreated/HandCreatedMappedImages.INI'
];

const mapped = {};
const blockRegex = /MappedImage\s+([a-zA-Z0-9_]+)[\s\S]*?Texture\s*=\s*([a-zA-Z0-9_.]+)\b[\s\S]*?Coords\s*=\s*Left:(\d+)\s+Top:(\d+)\s+Right:(\d+)\s+Bottom:(\d+)[\s\S]*?End/gi;

for (const iniFile of INI_FILES) {
    const buf = getAssetBuffer(iniFile);
    if (!buf) continue;
    const text = buf.toString('utf8');
    let m;
    while ((m = blockRegex.exec(text)) !== null) {
        mapped[m[1].toLowerCase()] = {
            name: m[1],
            texture: m[2].toLowerCase(),
            left: parseInt(m[3], 10),
            top: parseInt(m[4], 10),
            right: parseInt(m[5], 10),
            bottom: parseInt(m[6], 10)
        };
    }
}

const decodedTgaCache = {};
function getDecodedTga(textureName) {
    const key = textureName.toLowerCase();
    if (decodedTgaCache[key] !== undefined) return decodedTgaCache[key];
    const buf = getAssetBuffer(key);
    if (!buf) {
        decodedTgaCache[key] = null;
        return null;
    }
    const decoded = decodeTga(buf);
    decodedTgaCache[key] = decoded;
    return decoded;
}

function cropMappedImage(imageName, opts = {}) {
    const info = mapped[imageName.toLowerCase()];
    if (!info) return null;
    const tga = getDecodedTga(info.texture);
    if (!tga) return null;

    const left = Math.max(0, Math.min(tga.width - 1, info.left));
    const top = Math.max(0, Math.min(tga.height - 1, info.top));
    const right = Math.max(left + 1, Math.min(tga.width, info.right));
    const bottom = Math.max(top + 1, Math.min(tga.height, info.bottom));

    const cropW = right - left;
    const cropH = bottom - top;
    if (cropW <= 0 || cropH <= 0) return null;

    let cropRgba = Buffer.alloc(cropW * cropH * 4);
    for (let y = 0; y < cropH; y++) {
        const srcRowStart = ((top + y) * tga.width + left) * 4;
        const dstRowStart = y * cropW * 4;
        tga.rgba.copy(cropRgba, dstRowStart, srcRowStart, srcRowStart + cropW * 4);
    }

    let finalW = cropW;
    let finalH = cropH;
    if (opts.maxWidth && finalW > opts.maxWidth) {
        finalH = Math.max(1, Math.round(finalH * (opts.maxWidth / finalW)));
        finalW = opts.maxWidth;
        cropRgba = resizeRgba(cropRgba, cropW, cropH, finalW, finalH);
    }
    return encodePng(cropRgba, finalW, finalH, opts.quantizeBits || 0);
}

// 1. ALL UNIT, BUILDING, UPGRADE & GENERAL POWER CAMEOS (USA, CHINA, GLA, SHARED)
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
    'dozer_usa': 'SACDozer',
    'truck': 'SAPOWTruck',
    'truck_usa': 'SAPOWTruck',
    'chinook': 'SAChinook',
    'comanche': 'SACCommanche',
    'raptor': 'SACRaptor',
    'stealthFighter': 'SAStealth',
    'aurora': 'SAAurora',
    'ambulance': 'SAAmbulance',
    'tomahawk': 'SACTomahawk',
    'drone_battle': 'SABattleDrone',
    'drone_scout': 'SAScout',
    'drone_hellfire': 'SAHellfire',

    // China Units
    'redguard': 'SNRedGuard',
    'tankhunter': 'SNTankHunter',
    'hacker': 'SNHacker2',
    'blacklotus': 'SNBLKLotus2',
    'battlemaster': 'SNBattlemaster',
    'dragon': 'SNDragonTank',
    'gatling': 'SNGatlingTank',
    'crawler': 'SNTransport',
    'overlord': 'SNOverlord',
    'inferno': 'SNInferno',
    'nukecannon': 'SNNukeCannon',
    'nuketank': 'SNNukeCannon',
    'mig': 'SNMig',
    'dozer_china': 'SNDozer',
    'truck_china': 'SNSupplyTruck',
    'helix': 'SNHelix',
    'outpost': 'NVLOutpost',
    'ecm': 'SNEmpTank',

    // GLA Units
    'worker': 'SUWorker',
    'rebel': 'SURebel',
    'rpg': 'SURPG',
    'terrorist': 'SUTerrorist',
    'mob': 'SUAngryMob',
    'hijacker': 'SUHijacker',
    'jarmen': 'SUJermanKell1',
    'technical': 'SUTechnical',
    'scorpion': 'SUScorpion',
    'marauder': 'SUMarauder',
    'buggy': 'SURocketBuggy',
    'quad': 'SuQuadCannon',
    'toxintractor': 'SUToxinTractor',
    'bombtruck': 'SUBombTruck',
    'scud': 'SUScudLauncher',
    'radarvan': 'SURadarVan',
    'battlebus': 'SUbattlebus',
    'combatbike': 'SUComBike',
    'saboteur': 'SUSaboteur',

    // USA Buildings
    'commandCenter': 'SAComCentr',
    'commandCenter_usa': 'SAComCentr',
    'power': 'SAPowerPlant',
    'barracks': 'SABarracks',
    'barracks_usa': 'SABarracks',
    'factory': 'SACWeaponsfact',
    'factory_usa': 'SACWeaponsfact',
    'supplyCenter': 'SASupplyCntr',
    'supplyCenter_usa': 'SASupplyCntr',
    'airfield': 'SAACommand',
    'airfield_usa': 'SAACommand',
    'patriot': 'SAPatriot',
    'strategyCenter': 'SAStrategyCenter',
    'particleCannon': 'SALaserCan',
    'supplyDrop': 'SADropZone',
    'detentionCamp': 'SAPrison',
    'firebase': 'SAFirebase',

    // China Buildings
    'commandCenter_china': 'SNComCentr',
    'nuclearReactor': 'SNReactor',
    'barracks_china': 'SNBarracks',
    'factory_china': 'SNWarFact',
    'supplyCenter_china': 'SNSupplyCenter',
    'airfield_china': 'SNAirfield',
    'gatlingCannon': 'SNGatTower',
    'bunker': 'SNBunker',
    'speakerTower': 'SNPropSpeaker',
    'propagandaCenter': 'SNPropCentr',
    'internetCenter': 'SNIntCnt',
    'nukeSilo': 'SNNukeMisl',

    // GLA Buildings
    'commandCenter_gla': 'SUHeadquarters',
    'barracks_gla': 'SUBarracks',
    'factory_gla': 'SUArmsDealer',
    'supplyStash': 'SUSupplyCenter',
    'supplyCenter_gla': 'SUSupplyCenter',
    'tunnel': 'SUTunnel',
    'stingerSite': 'SUStinger',
    'demoTrap': 'SUBBTrap',
    'palace': 'SUPalace',
    'blackMarket': 'SUBlackMarket',
    'scudStorm': 'SUScudStorm',
    'fakeBarracks': 'SUBarracks_F',
    'fakeArmsDealer': 'SUArmsDealer_F',

    // Neutral / Tech Buildings
    'tech_oilDerrick': 'SSTechOilDerrick_L',
    'tech_oilRefinery': 'SSTechOilRefinery_L',
    'tech_hospital': 'SSTechHospital_L',
    'tech_radioStation': 'SSTechRadioStation_L',
    'tech_supplyDock': 'SASupplyCntr',

    // USA Upgrades & Abilities
    'controlRods': 'SACntrlRds',
    'upgradePower': 'SACntrlRds',
    'radar': 'SARadarUpgrade',
    'captureBuilding': 'SSCaptureBuilding',
    'flashbang': 'SSFlashbang',
    'towMissile': 'SSTowMissiles',
    'laserMissiles': 'SSLaserMissile',
    'rocketPods': 'SSCommancheMissiles',
    'countermeasures': 'SAFlares',
    'bunkerBusters': 'SABunkerBust',
    'compositeArmor': 'SSCompositeArmor',
    'droneArmor': 'SSScoutArmor',
    'advancedTraining': 'SSAdvancedTraining',
    'chemicalSuits': 'SAchemsuit',
    'supplyLines': 'SAsupplyline',
    'planHold': 'SSHoldLine',
    'planSearch': 'SSSeekDestroy',
    'planBombard': 'SSBombardment',
    'spyDrone': 'SSSpySat',
    'intel': 'SSCIA',

    // China Upgrades & Abilities
    'overcharge': 'SSOvercharge',
    'mines': 'SSMineBunker',
    'neutronMines': 'SNEMPMine',
    'redGuardTraining': 'SSHordeTraining',
    'chainGuns': 'SSGattling',
    'blackNapalm': 'SSBlackNapalm',
    'autoloader': 'SSAutoLoader',
    'migArmor': 'SSMigArmor',
    'nationalism': 'SSNationalism',
    'subliminal': 'SSSobMsge',
    'satHack1': 'SSNetHack',
    'satHack2': 'SSBuildingHack',
    'networkHack': 'SSCashHack',
    'empPulse': 'SSEMP',
    'uraniumShells': 'SSDepletedU_Shell',
    'nuclearTanks': 'SSNukeTank',
    'neutronShells': 'SNNeutShell',
    'outriggers': 'SNIsoStab',
    'overlord_bunker': 'SSOLBunker',
    'overlord_gatling': 'SSOLGattling',
    'overlord_speaker': 'SSOLSpeaker',

    // GLA Upgrades & Abilities
    'radarVanScan': 'SSRadarVanScan',
    'sneakAttack': 'SUSneakAttack',
    'boobyTrap': 'SUBBTrap',
    'scorpionRocket': 'SSScorpionRocketBuild',
    'fortifiedStructures': 'SUFakeUpgrade',
    'armTheMob': 'SSArmMob',
    'toxinShells': 'SSToxinShells',
    'anthraxBeta': 'SSAnthraxBeta',
    'demolitions': 'SSDetonateDemo',
    'camouflage': 'SSCamoflage',
    'camoNetting': 'SUcamo',
    'upgradeToReal': 'SUFakeToggle',
    'apBullets': 'SSAPShells',
    'apRockets': 'SSAPRockets',
    'junkRepair': 'SSJunkRepair',
    'buggyAmmo': 'SSBuggyRockets',
    'workerShoes': 'SUShoes',

    // General's Powers
    'spySatellite': 'SSSpySat',
    'a10Strike': 'SSA10Attack',
    'paratroopers': 'SACParatroopers',
    'fuelAirBomb': 'SAFuelAirBomb_L',
    'spectreGunship': 'SASpGunship',
    'artilleryBarrage': 'SSBarrage',
    'carpetBomb': 'SSCarpetBomb',
    'frenzy': 'SNFrenzy01',
    'clusterMines': 'SSClusterMines',
    'empBomb': 'SSEMP',
    'rebelAmbush': 'SSGLAAmbush',
    'cashBounty': 'SSCashBounty',
    'anthraxBomb': 'SSAnthraxBomb',
    'emergencyRepair': 'SSRepair',
    'gpsScrambler': 'SUGPS01',

    // Superweapon Launch Icons
    'superweapon_usa': 'SALaserCan',
    'superweapon_china': 'SNNukeLaunch',
    'superweapon_gla': 'SSScudStorm',

    // Command Action Buttons
    'stop': 'SSStop',
    'guard': 'SSGuard',
    'scatter': 'SSGuardAIR',
    'repair': 'SSRepair',
    'sell': 'SSSell2',
    'rally': 'SSRally',
    'attack': 'SSAttackMove2',
    'builders': 'SAWorker',
    'builders_usa': 'SAWorker',
    'builders_china': 'SNDozer',
    'builders_gla': 'SUWorkerE',
    'beacon': 'SABeacon',
    'garrison': 'SUEnterbldg',
    'ungarrison': 'SSEvacButton'
};

const outputCameos = {};
const primaryKeyByCameo = {};
const cameoAliases = [];

for (const [key, cameoName] of Object.entries(CAMEO_MAP)) {
    const normName = cameoName.toLowerCase();
    if (primaryKeyByCameo[normName]) {
        cameoAliases.push([key, primaryKeyByCameo[normName]]);
        continue;
    }
    let pngUrl = cropMappedImage(cameoName, { quantizeBits: 1 });
    if (!pngUrl && !cameoName.endsWith('_L')) {
        pngUrl = cropMappedImage(cameoName + '_L', { quantizeBits: 1 });
    }
    if (!pngUrl && cameoName.endsWith('_L')) {
        pngUrl = cropMappedImage(cameoName.slice(0, -2), { quantizeBits: 1 });
    }
    if (pngUrl) {
        outputCameos[key] = pngUrl;
        primaryKeyByCameo[normName] = key;
    } else {
        console.warn(`✗ Failed to crop cameo for "${key}" (${cameoName})`);
    }
}

// 2. OFFICIAL MENU, SHELL, LOGOS, WATERMARKS, HUD & SCORE BANNERS
const UI_ASSET_SPECS = {
    // Shell & Menu Backdrops (downsampled for compact bundle size)
    mainMenuBackdrop: { name: 'MainMenuBackdrop', maxWidth: 420, quantizeBits: 2 },
    mainMenuRuler: { name: 'MainMenuRuler', maxWidth: 420, quantizeBits: 2 },
    mpLoadBackdrop: { name: 'Mp_Load', maxWidth: 400, quantizeBits: 2 },
    skirmishEmblem: { name: 'Skirmish144', maxWidth: 112, quantizeBits: 1 },

    // Faction Logos (144x144 & 96x96)
    logo_usa: { name: 'SAFactionLogo144_US', maxWidth: 120, quantizeBits: 1 },
    logo_china: { name: 'SNFactionLogo144_China', maxWidth: 120, quantizeBits: 1 },
    logo_gla: { name: 'SUFactionLogo144_GLA', maxWidth: 120, quantizeBits: 1 },
    mini_logo_usa: { name: 'SAFactionLogo96_US', maxWidth: 48, quantizeBits: 1 },
    mini_logo_china: { name: 'SNFactionLogo96_China', maxWidth: 48, quantizeBits: 1 },
    mini_logo_gla: { name: 'SUFactionLogo96_GLA', maxWidth: 48, quantizeBits: 1 },

    // Faction Watermarks (Inspector background crests)
    watermark_usa: { name: 'WatermarkUSA', maxWidth: 120, quantizeBits: 1 },
    watermark_china: { name: 'WatermarkChina', maxWidth: 120, quantizeBits: 1 },
    watermark_gla: { name: 'WatermarkGLA', maxWidth: 120, quantizeBits: 1 },

    // Control Bar HUD Faction Logos & General Power Star Buttons
    hud_logo_usa: { name: 'SALogo', maxWidth: 120, quantizeBits: 1 },
    hud_logo_china: { name: 'SNLogo', maxWidth: 120, quantizeBits: 1 },
    hud_logo_gla: { name: 'SULogo', maxWidth: 120, quantizeBits: 1 },
    gen_btn_usa: { name: 'SAGeneral', maxWidth: 80, quantizeBits: 0 },
    gen_btn_china: { name: 'SNGeneral', maxWidth: 80, quantizeBits: 0 },
    gen_btn_gla: { name: 'SUGeneral', maxWidth: 80, quantizeBits: 0 },

    // Rank Badges
    rank_private_usa: { name: 'Rank_Private_USA', maxWidth: 72, quantizeBits: 1 },
    rank_general_usa: { name: 'Rank_General_USA', maxWidth: 72, quantizeBits: 1 },
    rank_general_china: { name: 'Rank_General_China', maxWidth: 72, quantizeBits: 1 },
    rank_general_gla: { name: 'Rank_General_GLA', maxWidth: 72, quantizeBits: 1 },

    // End-Game Banners
    banner_victory: { name: 'Victorious', maxWidth: 380, quantizeBits: 2 },
    banner_defeat: { name: 'Defeated', maxWidth: 380, quantizeBits: 2 }
};

const outputUiAssets = {};
for (const [key, spec] of Object.entries(UI_ASSET_SPECS)) {
    const pngUrl = cropMappedImage(spec.name, { maxWidth: spec.maxWidth, quantizeBits: spec.quantizeBits });
    if (pngUrl) {
        outputUiAssets[key] = pngUrl;
    } else {
        console.warn(`✗ Failed to crop UI asset "${key}" (${spec.name})`);
    }
}

const aliasLines = cameoAliases.map(([alias, primary]) => `window.OFFICIAL_CAMEOS[${JSON.stringify(alias)}] = window.OFFICIAL_CAMEOS[${JSON.stringify(primary)}];`).join('\n');

const jsContent = `/**
 * Official Command & Conquer: Generals Zero Hour Command Card Cameos, Action Icons & Shell UI Assets
 * Cropped directly from retail EnglishZH.big, TexturesZH.big, Textures.big & WindowZH.big
 */
window.OFFICIAL_CAMEOS = ${JSON.stringify(outputCameos, null, 2)};
${aliasLines}
window.OFFICIAL_UI_ASSETS = ${JSON.stringify(outputUiAssets, null, 2)};
`;

const destPath = path.join('D:/C&C/src/js/10b_cameos.js');
fs.writeFileSync(destPath, jsContent, 'utf8');
const statSizeKB = (fs.statSync(destPath).size / 1024).toFixed(1);
console.log(`Successfully generated ${destPath} (${statSizeKB} KB) with ${Object.keys(outputCameos).length + cameoAliases.length} official cameos and ${Object.keys(outputUiAssets).length} shell UI assets.`);
