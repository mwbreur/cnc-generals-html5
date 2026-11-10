const fs = require('fs');
const path = require('path');
const { parseW3dModel, isFxGlitchMesh } = require('./parse_w3d_clean');

const w3dDir = path.join(__dirname, '..', 'extracted_assets', 'w3d');
const texDir = path.join(__dirname, '..', 'extracted_assets', 'textures');

// Vehicles: scaled between 0.08 and 0.10 so tanks are ~2.7-3.9 units (sleek and proportional)
const VEHICLE_CONFIG = {
    // USA
    'crusader':       { file: 'avleopard.W3D',   tex: 'avleopard.dds',   scale: 0.320, faction: 'usa' },
    'paladin':        { file: 'avPaladin.W3D',    tex: 'avpaladin.dds',    scale: 0.320, faction: 'usa' },
    'humvee':         { file: 'AvHummer.W3D',     tex: 'avhummer.dds',     scale: 0.280, faction: 'usa' },
    'ambulance':      { file: 'AvAmbulance.W3D',  tex: 'avhummer.dds',     scale: 0.290, faction: 'usa' },
    'tomahawk':       { file: 'avtomahawk.W3D',   tex: 'avtomahawk.dds',   scale: 0.320, faction: 'usa' },
    'dozer':          { file: 'avconstdoz.W3D',   tex: 'avconstdoz.dds',   scale: 0.290, faction: 'usa' },
    'dozer_china':    { file: 'nvconstdoz.W3D',   tex: 'nvconstdoz.dds',   scale: 0.290, faction: 'china' },
    'chinook':        { file: 'AVChinook.W3D',    tex: 'avchinook.dds',    scale: 0.300, faction: 'usa' },
    'comanche':       { file: 'AVComanche.W3D',   tex: 'avcomanche.dds',   scale: 0.280, faction: 'usa' },
    'raptor':         { file: 'avraptor.W3D',     tex: 'avraptor.dds',     scale: 0.300, faction: 'usa' },
    'stealthfighter': { file: 'avstealth.W3D',    tex: 'avstealth.dds',    scale: 0.300, faction: 'usa' },
    'aurora':         { file: 'AVAurora.W3D',     tex: 'avaurora.dds',     scale: 0.300, faction: 'usa' },
    'drone_battle':   { file: 'avbattledr.W3D',   tex: 'avbattledr.dds',   scale: 0.200, faction: 'usa' },
    'drone_scout':    { file: 'avscoutdr.W3D',    tex: 'avrepairdr.dds',   scale: 0.200, faction: 'usa' },
    'drone_hellfire': { file: 'avhelldrone.w3d',  tex: 'avhelldrone.dds',  scale: 0.200, faction: 'usa' },

    // China
    'battlemaster':   { file: 'NVBtMstr.W3D',     tex: 'nvbtmstr.dds',     scale: 0.320, faction: 'china' },
    'overlord':       { file: 'NVOvrlrd.W3D',     tex: 'nvovrlrd.dds',     scale: 0.360, faction: 'china' },
    'overlord_bunker':  { file: 'NVOvrlrd_B.W3D', tex: 'nvovrlrd_u.dds',   scale: 1.0,   faction: 'china' },
    'overlord_gatling': { file: 'NVOvrlrd_G.W3D', tex: 'nvovrlrd_u.dds',   scale: 1.0,   faction: 'china' },
    'overlord_speaker': { file: 'NVOvrlrd_S.W3D', tex: 'nvovrlrd_u.dds',   scale: 1.0,   faction: 'china' },
    'gatling':        { file: 'NVGattTank.W3D',   tex: 'nvgatttank.dds',   scale: 0.290, faction: 'china' },
    'dragon':         { file: 'NVDragon.W3D',     tex: 'nvdragon.dds',     scale: 0.310, faction: 'china' },
    'crawler':        { file: 'NVTCrawler.W3D',   tex: 'nvtcrawler.dds',   scale: 0.320, faction: 'china' },
    'inferno':        { file: 'NVInferno.W3D',    tex: 'nvinferno.dds',    scale: 0.320, faction: 'china' },
    'nukecannon':     { file: 'NVNukeCn.W3D',     tex: 'nvnukecn.dds',     scale: 0.340, faction: 'china' },
    'truck':          { file: 'NVSSupplyTk.W3D',  tex: 'avsupplytk.dds',   scale: 0.290, faction: 'china' },
    'mig':            { file: 'NVMig.W3D',        tex: 'nvmig.dds',        scale: 0.300, faction: 'china' },

    // GLA
    'scorpion':       { file: 'UVLiteTank.W3D',   tex: 'uvlitetank.dds',   scale: 0.310, faction: 'gla' },
    'marauder':       { file: 'UVMarauder.W3D',   tex: 'uvmarauder.dds',   scale: 0.320, faction: 'gla' },
    'technical':      { file: 'UVTechTrck.W3D',   tex: 'uvtechtrck.dds',   scale: 0.270, faction: 'gla' },
    'quad':           { file: 'UVQuadCann.W3D',   tex: 'uvquadcann.dds',   scale: 0.290, faction: 'gla' },
    'buggy':          { file: 'UVRockBug.W3D',    tex: 'uvrockbug.dds',    scale: 0.270, faction: 'gla' },
    'toxintractor':   { file: 'UVToxinTrk.W3D',   tex: 'uvtoxintrk.dds',   scale: 0.290, faction: 'gla' },
    'bombtruck':      { file: 'UVBmbtruk.W3D',    tex: 'uvbmbtruk.dds',    scale: 0.290, faction: 'gla' },
    'scud':           { file: 'UVScudLchr.W3D',   tex: 'uvscudlchr.dds',   scale: 0.340, faction: 'gla' },
    'radarvan':       { file: 'UVRadarVan.W3D',   tex: 'uvradarvan.dds',   scale: 0.290, faction: 'gla' }
};

// Buildings: calibrated scale (0.26-0.27) so Command Centers are ~34 units, War Factories ~32 units, Power Plants ~16.5 units
const BUILDING_CONFIG = {
    // USA
    'usa_commandCenter':    { file: 'ABBtCmdHQ.W3D',   tex: 'abbtcmdhq.dds',    scale: 0.270, faction: 'usa' },
    'usa_power':            { file: 'ABPWRPLANT.W3D',  tex: 'abpwrplant.dds',   scale: 0.260, faction: 'usa' },
    'usa_barracks':         { file: 'ABBARRACKS.W3D',  tex: 'atbarrslab.dds',   scale: 0.260, faction: 'usa' },
    'usa_factory':          { file: 'ABWarFact.W3D',   tex: 'abwarfact.dds',    scale: 0.260, faction: 'usa' },
    'usa_supplyCenter':     { file: 'ABSUPPLYCT.W3D',  tex: 'absupplyct.dds',   scale: 0.260, faction: 'usa' },
    'usa_supplyDrop':       { file: 'ABSupDrop.W3D',   tex: 'zbsupdrop.dds',    scale: 0.260, faction: 'usa' },
    'usa_airfield':         { file: 'ABArFrcCmd.W3D',  tex: 'abarfrccmd.dds',   scale: 0.260, faction: 'usa' },
    'usa_strategyCenter':   { file: 'ABStrategy.W3D',  tex: 'abstratcnt.dds',   scale: 0.260, faction: 'usa' },
    'usa_patriot':          { file: 'ABPATRIOT.W3D',   tex: 'abpatriot.dds',    scale: 0.200, faction: 'usa' },
    'usa_particleCannon':   { file: 'ABSDILink.W3D',   tex: 'abpwrplant.dds',   scale: 0.270, faction: 'usa' },
    'usa_detentionCamp':    { file: 'ABPrison.W3D',    scale: 0.250, faction: 'usa' },

    // China
    'china_commandCenter':  { file: 'NBConYard.W3D',   tex: 'nbconyard.dds',    scale: 0.270, faction: 'china' },
    'china_power':          { file: 'NBPwrPlant.W3D',  scale: 0.260, faction: 'china' },
    'china_barracks':       { file: 'NBBarracks.W3D',  scale: 0.260, faction: 'china' },
    'china_factory':        { file: 'NBWarFact.W3D',   tex: 'nbwarfact.dds',    scale: 0.260, faction: 'china' },
    'china_supplyCenter':   { file: 'NBSupCent.W3D',   scale: 0.260, faction: 'china' },
    'china_airfield':       { file: 'NBAirfield.W3D',  tex: 'nbairfield.dds',   scale: 0.260, faction: 'china' },
    'china_gatlingCannon':  { file: 'NBGattling.W3D',  scale: 0.200, faction: 'china' },
    'china_bunker':         { file: 'NBBunker.W3D',    scale: 0.200, faction: 'china' },
    'china_speakerTower':   { file: 'NBPTower.W3D',    tex: 'nbptower.dds', scale: 0.200, faction: 'china' },
    'china_propagandaCenter': { file: 'NBPCenter.W3D', tex: 'nbprpcntrbs.dds', scale: 0.260, faction: 'china' },
    'china_nukeSilo':       { file: 'NBNMissle.W3D',   tex: 'ntnmissle.dds', scale: 0.270, faction: 'china' },
    'china_internetCenter': { file: 'NBIntCnt.W3D',    tex: 'ntintrntbase.dds', scale: 0.270, faction: 'china' },

    // GLA
    'gla_commandCenter':    { file: 'UBCmdHQ.W3D',     scale: 0.270, faction: 'gla' },
    'gla_supplyCenter':     { file: 'UBSupply.W3D',    scale: 0.260, faction: 'gla' },
    'gla_barracks':         { file: 'UBBarracks.W3D',  scale: 0.260, faction: 'gla' },
    'gla_factory':          { file: 'UBArmDeal.W3D',   scale: 0.260, faction: 'gla' },
    'gla_tunnel':           { file: 'UBUndTunn.W3D',   scale: 0.200, faction: 'gla' },
    'gla_stingerSite':      { file: 'UBStingerS.W3D',  scale: 0.200, faction: 'gla' },
    'gla_palace':           { file: 'UBPalace.W3D',    scale: 0.270, faction: 'gla' },
    'gla_blackMarket':      { file: 'UBBlackMkt.W3D',  scale: 0.260, faction: 'gla' },
    'gla_scudStorm':        { file: 'UBScudStrm.W3D',  scale: 0.270, faction: 'gla' },
    'gla_hole':             { file: 'UBHole.W3D',      scale: 0.200, faction: 'gla' },

    // Tech / Neutral Structures
    'tech_supplyDock':      { file: 'ZBSupplyDk.W3D',   tex: 'zbsupplydk.dds', scale: 0.260, faction: 'tech' },
    'tech_supplyCrates':    { file: 'ZBSupplyDk_B.W3D', tex: 'zbsupplydk.dds', scale: 0.260, faction: 'tech' },
    'tech_supplyWarehouse': { file: 'ZBSupplyWH.W3D',   tex: 'zbsupplydk.dds', scale: 0.260, faction: 'tech' },
    'tech_oilDerrick':      { file: 'ZBODerrick.W3D',   tex: 'ztoilpump.dds',  scale: 0.240, faction: 'tech' },
    'tech_hospital':        { file: 'CBHospital.W3D',   scale: 0.260, faction: 'tech' },
    'tech_refinery':        { file: 'CBOilRfny.W3D',    tex: 'cboilrfny.dds',  scale: 0.260, faction: 'tech' }
};

// Retail Westwood 3D Infantry Characters (calibrated to ~2.4-2.6 units tall, classic RTS visual readability)
const INFANTRY_CONFIG = {
    // USA
    'ranger':          { file: 'AIRNGR_SKN.W3D',  skl: 'AIRNGR_SKL.W3D',  sta: 'AIRNGR_STA.W3D',  rna: 'AIRNGR_RNA.W3D',  submesh: null, tex: 'zhca_airanger.tga',   scale: 0.280, faction: 'usa' },
    'missiledefender': { file: 'NITHNT_SKN.W3D',  skl: 'NITHNT_SKL.W3D',  sta: 'NITHNT_STA.W3D',  rna: 'NITHNT_RNA.W3D',  submesh: null, tex: 'zhca_aimsslguy.tga',  scale: 0.280, faction: 'usa' },
    'pathfinder':      { file: 'AIPFDR_SKN.W3D',  skl: 'AIPFDR_SKL.W3D',  sta: 'AIPFDR_STA.W3D',  rna: 'AIPFDR_RNA.W3D',  submesh: null, tex: 'zhca_aipthfindr.tga', scale: 0.280, faction: 'usa' },
    'burton':          { file: 'AIHERO_SKN.W3D',  skl: 'AIHERO_SKL.W3D',  sta: 'AIHERO_STA.W3D',  rna: 'AIHERO_RNA.W3D',  submesh: null, tex: 'zhca_aihero2.tga',    scale: 0.290, faction: 'usa' },
    // China
    'redguard':        { file: 'NICNSC_SKN.W3D',  skl: 'NICNSC_SKL.W3D',  sta: 'NICNSC_STA.W3D',  rna: 'NICNSC_RNA.W3D',  submesh: null, tex: 'zhca_niconscrpt.tga', scale: 0.280, faction: 'china' },
    'tankhunter':      { file: 'NITHNT_SKN.W3D',  skl: 'NITHNT_SKL.W3D',  sta: 'NITHNT_STA.W3D',  rna: 'NITHNT_RNA.W3D',  submesh: null, tex: 'zhca_nithunter.tga',  scale: 0.280, faction: 'china' },
    'hacker':          { file: 'NIHCKR_SKN.W3D',  skl: 'NIHCKR_SKL.W3D',  sta: 'NIHCKR_STA.W3D',  rna: 'NIHCKR_RNA.W3D',  submesh: null, tex: 'zhca_nihacker.tga',   scale: 0.280, faction: 'china' },
    'lotus':           { file: 'NIHERO_SKN.W3D',  skl: 'NIHERO_SKL.W3D',  sta: 'NIHERO_STA.W3D',  rna: 'NIHERO_RNA.W3D',  submesh: null, tex: 'zhca_niblotus.tga',   scale: 0.285, faction: 'china' },
    // GLA
    'rebel':           { file: 'UIRGRD_SKN.W3D',  skl: 'UIRGRD_SKL.W3D',  sta: 'UIRGRD_STB.W3D',  rna: 'UIRGRD_RNA.W3D',  submesh: null, tex: 'zhca_uirguard.tga',   scale: 0.280, faction: 'gla' },
    'rpg':             { file: 'UISMSD_SKN.W3D',  skl: 'UISMSD_SKL.W3D',  sta: 'UISMSD_STA.W3D',  rna: 'UISMSD_WKB.W3D',  submesh: null, tex: 'zhca_uirstnger.tga',  scale: 0.280, faction: 'gla' },
    'terrorist':       { file: 'UITRST_SKN.W3D',  skl: 'UITRST_SKL.W3D',  sta: 'UITRST_STA.W3D',  rna: 'UITRST_RNA.W3D',  submesh: null, tex: 'zhca_uiter.tga',      scale: 0.280, faction: 'gla' },
    'jarmen':          { file: 'UIHERO_SKN.W3D',  skl: 'UIHERO_SKL.W3D',  sta: 'UIHERO_STA.W3D',  rna: 'UIHERO_RNA2.W3D', submesh: null, tex: 'zhca_uihero01.tga',   scale: 0.290, faction: 'gla' },
    'worker':          { file: 'UIWRKR_SKN.W3D',  skl: 'UIWRKR_SKL.W3D',  sta: 'UIWRKR_STA.W3D',  rna: 'UIWRKR_RNA.W3D',  submesh: null, tex: 'zhca_uiworker.tga',   scale: 0.270, faction: 'gla' }
};

// Additional architectural and detail textures
const EXTRA_TEXTURES = {
    'gradient2': 'gradient2.dds',
    'z_infxtras': 'z_infxtras.dds',
    'z_aipthfindr2': 'z_aipthfindr2.dds',
    'atcemwall01': 'atcemwall01.dds',
    'atcemblock02': 'atcemblock02.dds',
    'atsilverroof02': 'atsilverroof02.dds',
    'atsmokestack': 'atsmokestack.dds',
    'pmsandbags2': 'pmsandbags2.dds',
    'atwarfactslab': 'atwarfactslab.dds',
    'attarmack': 'attarmack.dds',
    'athqslab': 'athqslab.dds',
    'atstratslab': 'atstratslab.dds',
    'atfan': 'atfan.dds',
    'atsilverroof': 'atsilverroof.dds',
    'atpanelroof': 'atpanelroof.dds',
    'atgreebwall01': 'atgreebwall01.dds',
    'atventwall01': 'atventwall01.dds',
    'zbsupplydk': 'zbsupplydk.dds',
    'ztoilpump': 'ztoilpump.dds',
    'avbattledr': 'avbattledr.dds',
    'avrepairdr': 'avrepairdr.dds',
    'avhelldrone': 'avhelldrone.dds',
    'nbptower': 'nbptower.dds',
    'ntnmissle': 'ntnmissle.dds',
    'ntintrntbase': 'ntintrntbase.dds',
    'nvconstdoz': 'nvconstdoz.dds',
    'nvovrlrd_u': 'nvovrlrd_u.dds',
    'nbprpcntrbs': 'nbprpcntrbs.dds',
    'nbflag': 'nbflag.dds',
    'nbsign01': 'nbsign01.dds',
    'nbsign02': 'nbsign02.dds',
    'nbsign03': 'nbsign03.dds',
    'nbsign04': 'nbsign04.dds',
    'nbsign05': 'nbsign05.dds',
    'nbsign06': 'nbsign06.dds',
    'ntbambfence01': 'ntbambfence01.dds'
};

// Clean disconnected rogue test boxes or vertex spikes from meshes
function cleanRogueVertices(mesh, maxDist = 20) {
    if (!mesh || !mesh.v || !mesh.i) return;
    const oldV = mesh.v, oldU = mesh.u, oldI = mesh.i;
    const validFaces = [];
    for (let f = 0; f < oldI.length; f += 3) {
        const i0 = oldI[f], i1 = oldI[f+1], i2 = oldI[f+2];
        const d0 = Math.hypot(oldV[i0*3], oldV[i0*3+1], oldV[i0*3+2]);
        const d1 = Math.hypot(oldV[i1*3], oldV[i1*3+1], oldV[i1*3+2]);
        const d2 = Math.hypot(oldV[i2*3], oldV[i2*3+1], oldV[i2*3+2]);
        if (d0 <= maxDist && d1 <= maxDist && d2 <= maxDist) {
            validFaces.push(i0, i1, i2);
        }
    }
    const remap = new Map();
    const newV = [];
    const newU = oldU ? [] : null;
    const newI = [];
    for (const oldIdx of validFaces) {
        if (!remap.has(oldIdx)) {
            const newIdx = newV.length / 3;
            remap.set(oldIdx, newIdx);
            newV.push(oldV[oldIdx*3], oldV[oldIdx*3+1], oldV[oldIdx*3+2]);
            if (oldU) newU.push(oldU[oldIdx*2], oldU[oldIdx*2+1]);
        }
        newI.push(remap.get(oldIdx));
    }
    mesh.v = newV;
    mesh.i = newI;
    if (newU) mesh.u = newU;
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

        // Clean rogue geometry glitches
        if (key === 'crawler' && filteredMeshes['nvtcrawler.housecolor']) {
            cleanRogueVertices(filteredMeshes['nvtcrawler.housecolor'], 15);
        } else if (key === 'aurora' && filteredMeshes['avaurora.housecolor01']) {
            delete filteredMeshes['avaurora.housecolor01'];
        } else if (key === 'raptor') {
            if (filteredMeshes['avraptor.housecolor01']) delete filteredMeshes['avraptor.housecolor01'];
            if (filteredMeshes['avraptor.chassis01']) {
                const c = filteredMeshes['avraptor.chassis01'];
                const validFaces = [];
                for (let f = 0; f < c.i.length; f += 3) {
                    const i0 = c.i[f], i1 = c.i[f+1], i2 = c.i[f+2];
                    const x0 = c.v[i0*3], x1 = c.v[i1*3], x2 = c.v[i2*3];
                    if (x0 >= -3.5 && x1 >= -3.5 && x2 >= -3.5) {
                        validFaces.push(i0, i1, i2);
                    }
                }
                const remap = new Map();
                const newV = [];
                const newU = c.u ? [] : null;
                const newI = [];
                for (const oldIdx of validFaces) {
                    if (!remap.has(oldIdx)) {
                        const newIdx = newV.length / 3;
                        remap.set(oldIdx, newIdx);
                        newV.push(c.v[oldIdx*3], c.v[oldIdx*3+1], c.v[oldIdx*3+2]);
                        if (c.u) newU.push(c.u[oldIdx*2], c.u[oldIdx*2+1]);
                    }
                    newI.push(remap.get(oldIdx));
                }
                c.v = newV; c.i = newI; if (c.u) c.u = newU;
            }
        } else if (key === 'overlord') {
            // Remove unrotated barrel trim wrap rings that float into the sky without W3D pivot quaternions
            if (filteredMeshes['nvovrlrd.housecolor01']) delete filteredMeshes['nvovrlrd.housecolor01'];
            if (filteredMeshes['nvovrlrd.housecolor04']) delete filteredMeshes['nvovrlrd.housecolor04'];
        }

        // Canonical 3D Axis Alignment for Aircraft, Helicopters, and Drones (+Z forward, +Y up, +X right):
        if (key === 'raptor') {
            // Right-handed pure rotation (det = +1): Y is canopy UP (-ox), Z is nose FORWARD (+oy), X is wingspan (-oz)
            for (const m of Object.values(filteredMeshes)) {
                for (let i = 0; i < m.v.length; i += 3) {
                    const ox = m.v[i], oy = m.v[i+1], oz = m.v[i+2];
                    m.v[i] = -oz; m.v[i+1] = -ox; m.v[i+2] = oy;
                }
            }
            parsed.pivots.forEach(p => {
                const ox = p.tx, oy = p.ty, oz = p.tz;
                p.tx = -oz; p.ty = -ox; p.tz = oy;
            });
        } else if (key === 'aurora') {
            // Pure rotation (det = +1): Y is UP (-oz), Z is nose FORWARD (+ox), X is wingspan (-oy)
            for (const m of Object.values(filteredMeshes)) {
                for (let i = 0; i < m.v.length; i += 3) {
                    const ox = m.v[i], oy = m.v[i+1], oz = m.v[i+2];
                    m.v[i] = -oy; m.v[i+1] = -oz; m.v[i+2] = ox;
                }
            }
            parsed.pivots.forEach(p => {
                const ox = p.tx, oy = p.ty, oz = p.tz;
                p.tx = -oy; p.ty = -oz; p.tz = ox;
            });
        } else if (key === 'drone_battle') {
            // Center Battle Drone body in Z and align machine gun turret pointing +Z forward
            const cx = -4.835;
            for (const [mName, m] of Object.entries(filteredMeshes)) {
                if (mName.includes('turretel') || mName.includes('housecolor02') || mName.includes('fan')) {
                    // Turret and Fan local meshes already aligned to their pivots
                } else {
                    for (let i = 0; i < m.v.length; i += 3) {
                        const ox = m.v[i], oy = m.v[i+1], oz = m.v[i+2];
                        m.v[i] = -oz;
                        m.v[i+1] = oy;
                        m.v[i+2] = ox - cx;
                    }
                }
            }
            parsed.pivots.forEach(p => {
                if (p.name === 'ROOTTRANSFORM' || p.name === 'CHASSIS') {
                    p.tx = 0; p.ty = 0; p.tz = 0;
                } else if (p.name === 'TURRET01' || p.name === 'HOUSECOLOR01') {
                    p.tz = p.tx - cx;
                    p.tx = 0;
                } else if (p.name === 'FAN' || p.name === 'TURRETEL01' || p.name === 'TURRETFX01' || p.name === 'MUZZLE01' || p.name === 'HOUSECOLOR02') {
                    // Local relative offsets maintained
                } else {
                    const ox = p.tx, oy = p.ty, oz = p.tz;
                    p.tx = -oz;
                    p.ty = oy;
                    p.tz = ox - cx;
                }
            });
        } else if (key === 'drone_hellfire') {
            // Hellfire Drone: align chassis mesh to match world pivots and housecolor decals.
            // In avhelldrone.w3d, CHASSIS mesh was unrotated relative to its 90-degree pivot orientation.
            // Pure right-handed rotation (det = +1): X_new = Z_old, Y_new = X_old, Z_new = Y_old
            // Wingspan aligns horizontally along X [-6.88..6.88], height along Y [-2.23..0.80], and length along Z [-4.91..4.91]
            if (filteredMeshes['avhelldrone.chassis']) {
                const m = filteredMeshes['avhelldrone.chassis'];
                for (let i = 0; i < m.v.length; i += 3) {
                    const ox = m.v[i], oy = m.v[i+1], oz = m.v[i+2];
                    m.v[i] = oz;
                    m.v[i+1] = ox;
                    m.v[i+2] = oy;
                }
            }
        } else if (key === 'comanche') {
            // Comanche RAH-66: Rotate airframe upright (in W3D raw, CHASSIS had a 90-deg roll quaternion that was omitted during parsing).
            // Pure rotation (det = +1): X_new = Y_old, Y_new = -X_old, Z_new = Z_old.
            // Airframe wingspan aligns horizontally along X [-7.87..7.87], height along Y [-4.05..5.05], length along Z [-21.48..22.58].
            for (const [mName, m] of Object.entries(filteredMeshes)) {
                if (mName.includes('avcomanche_prop') || mName.includes('propeller01')) {
                    // Rotor blades and hub are already horizontal in local X-Z space
                    continue;
                }
                for (let i = 0; i < m.v.length; i += 3) {
                    const ox = m.v[i], oy = m.v[i+1], oz = m.v[i+2];
                    m.v[i] = oy;
                    m.v[i+1] = -ox;
                    m.v[i+2] = oz;
                }
            }
            parsed.pivots.forEach(p => {
                if (p.name === 'ROOTTRANSFORM' || p.name === 'CHASSIS' || p.name === 'HOUSECOLOR01') {
                    p.tx = 0; p.ty = 0; p.tz = 0;
                } else if (p.name === 'PROPELLER01') {
                    p.tx = 0; p.ty = 4.92; p.tz = 5.16;
                } else if (p.name === 'AVCOMANCHE_PROP') {
                    p.tx = 0; p.ty = 0; p.tz = 0;
                } else if (p.name === 'PROPELLER02') {
                    p.tx = 0; p.ty = 1.13; p.tz = -16.85;
                } else if (p.name === 'MUZZLE01') {
                    p.tx = 0; p.ty = -3.86; p.tz = 22.58;
                } else if (p.name === 'MISSILEUPGRADE') {
                    p.tx = 0; p.ty = 0; p.tz = 6.71;
                } else {
                    const ox = p.tx, oy = p.ty, oz = p.tz;
                    p.tx = oy; p.ty = -ox; p.tz = oz;
                }
            });
        } else if (key === 'chinook') {
            // Chinook CH-47: Rotate airframe upright (in W3D raw, CHASSIS had a 90-deg roll quaternion).
            // Pure rotation (det = +1): X_new = Y_old, Y_new = -X_old, Z_new = Z_old.
            // Airframe width aligns horizontally along X [-4.98..4.98], height along Y [-8.54..6.84], length along Z [-20.92..20.02].
            for (const [mName, m] of Object.entries(filteredMeshes)) {
                if (mName.includes('props') || mName.includes('propeller')) {
                    // Tandem rotor blades and hubs are already horizontal in local X-Z space
                    continue;
                }
                for (let i = 0; i < m.v.length; i += 3) {
                    const ox = m.v[i], oy = m.v[i+1], oz = m.v[i+2];
                    m.v[i] = oy;
                    m.v[i+1] = -ox;
                    m.v[i+2] = oz;
                }
            }
            parsed.pivots.forEach(p => {
                if (p.name === 'ROOTTRANSFORM' || p.name === 'CHASSIS' || p.name === 'HOUSECOLOR01') {
                    p.tx = 0; p.ty = 0; p.tz = 0;
                } else if (p.name === 'PROPELLER01') {
                    p.tx = 0; p.ty = 5.21; p.tz = 12.74;
                } else if (p.name === 'PROPS01') {
                    p.tx = 0; p.ty = 0.33; p.tz = 0;
                } else if (p.name === 'PROPELLER02') {
                    p.tx = 0; p.ty = 7.20; p.tz = -17.06;
                } else if (p.name === 'PROPS02') {
                    p.tx = 0; p.ty = 0.33; p.tz = 0;
                } else {
                    const ox = p.tx, oy = p.ty, oz = p.tz;
                    p.tx = oy; p.ty = -ox; p.tz = oz;
                }
            });
        }

        let meshEntries;
        if (parsed.hlodSubObjects.length > 0) {
            meshEntries = parsed.hlodSubObjects.filter(h => filteredMeshes[h.name] !== undefined).map(h => [h.boneIndex, h.name]);
        } else {
            meshEntries = Object.keys(filteredMeshes).map(mName => {
                const upper = mName.toUpperCase();
                let foundBone = 0;
                for (let pi = 0; pi < parsed.pivots.length; pi++) {
                    const pName = parsed.pivots[pi].name.toUpperCase();
                    if (pName && pName !== 'ROOTTRANSFORM' && (upper.includes(pName) || (upper.split('.')[1] && pName.includes(upper.split('.')[1])))) {
                        foundBone = pi;
                        break;
                    }
                }
                return [foundBone, mName];
            });
        }

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

// Extract DDS (DXT1 Mip 128x128 = 8192 bytes, DXT5 Mip 128x128 = 16384 bytes) and TGA (raw RGBA)
const textureData = {};

function loadSingleTexture(aliasKey, fileName) {
    if (!fileName) return;
    const baseName = path.basename(fileName, path.extname(fileName)).toLowerCase();
    const cleanKey = aliasKey ? aliasKey.toLowerCase().replace('.tga', '').replace('.dds', '') : null;

    if (textureData[baseName] && (!cleanKey || textureData[cleanKey])) return;

    let existing = textureData[baseName];
    if (!existing) {
        let texPath = path.join(texDir, fileName);
        if (!fs.existsSync(texPath)) {
            const ddsPath = path.join(texDir, baseName + '.dds');
            const tgaPath = path.join(texDir, baseName + '.tga');
            if (fs.existsSync(ddsPath)) texPath = ddsPath;
            else if (fs.existsSync(tgaPath)) texPath = tgaPath;
            else return;
        }

        const ext = path.extname(texPath).toLowerCase();
        if (ext === '.tga') {
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
            existing = {
                t: 'raw',
                w,
                h,
                d: rgba.toString('base64')
            };
        } else {
            const buf = fs.readFileSync(texPath);
            const width = buf.readUInt32LE(16);
            const height = buf.readUInt32LE(12);
            const fourCC = buf.toString('ascii', 84, 88).trim();
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
            const slice = buf.slice(curOffset, curOffset + targetSize);

            existing = {
                t: isDxt5 ? 'dxt5' : 'dxt1',
                w: curW,
                h: curH,
                d: slice.toString('base64')
            };
        }
    }

    if (existing) {
        textureData[baseName] = existing;
        if (cleanKey) textureData[cleanKey] = existing;
    }
}

function processTextures(configMap) {
    for (const [key, cfg] of Object.entries(configMap)) {
        const texFile = typeof cfg === 'string' ? cfg : cfg.tex;
        if (texFile) loadSingleTexture(key, texFile);
    }
}

processTextures(VEHICLE_CONFIG);
processTextures(BUILDING_CONFIG);
processTextures(INFANTRY_CONFIG);
processTextures(EXTRA_TEXTURES);

function mat4Compose(pos, q) {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    const te = new Float32Array(16);
    te[0] = 1 - (yy + zz);
    te[1] = xy + wz;
    te[2] = xz - wy;
    te[3] = 0;

    te[4] = xy - wz;
    te[5] = 1 - (xx + zz);
    te[6] = yz + wx;
    te[7] = 0;

    te[8] = xz + wy;
    te[9] = yz - wx;
    te[10] = 1 - (xx + yy);
    te[11] = 0;

    te[12] = pos[0];
    te[13] = pos[1];
    te[14] = pos[2];
    te[15] = 1;
    return te;
}

function mat4Mul(a, b) {
    const out = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
        const ai0 = a[i], ai1 = a[i+4], ai2 = a[i+8], ai3 = a[i+12];
        out[i]    = ai0 * b[0]  + ai1 * b[1]  + ai2 * b[2]  + ai3 * b[3];
        out[i+4]  = ai0 * b[4]  + ai1 * b[5]  + ai2 * b[6]  + ai3 * b[7];
        out[i+8]  = ai0 * b[8]  + ai1 * b[9]  + ai2 * b[10] + ai3 * b[11];
        out[i+12] = ai0 * b[12] + ai1 * b[13] + ai2 * b[14] + ai3 * b[15];
    }
    return out;
}

const AXIS_SWAP = new Float32Array([
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, 1, 0, 0,
    0, 0, 0, 1
]);

function transformPoint(m, p) {
    const x = p[0], y = p[1], z = p[2];
    return [
        m[0] * x + m[4] * y + m[8]  * z + m[12],
        m[1] * x + m[5] * y + m[9]  * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14]
    ];
}

function loadSkeleton(sklFileName) {
    const sklPath = path.join(w3dDir, sklFileName);
    if (!fs.existsSync(sklPath)) return null;
    const buf = fs.readFileSync(sklPath);
    let sklPivots = [];
    let off = 0;
    while (off < buf.length) {
        const type = buf.readUInt32LE(off);
        const size = buf.readUInt32LE(off + 4) & 0x7fffffff;
        if (type === 0x100) { // W3D_CHUNK_HIERARCHY
            let sub = off + 8;
            let version = 0, pivotCount = 0;
            while (sub < off + 8 + size) {
                const st = buf.readUInt32LE(sub);
                const ss = buf.readUInt32LE(sub + 4) & 0x7fffffff;
                if (st === 0x101) { // W3D_CHUNK_HIERARCHY_HEADER
                    version = buf.readUInt32LE(sub + 8);
                    pivotCount = buf.readUInt32LE(sub + 28);
                } else if (st === 0x102) { // W3D_CHUNK_PIVOTS (60 bytes per pivot)
                    let po = sub + 8;
                    for (let i = 0; i < pivotCount; i++) {
                        const ne = buf.indexOf(0, po);
                        const pName = buf.toString('ascii', po, Math.min(ne > po ? ne : po + 16, po + 16)).trim();
                        let parentIndex = buf.readInt32LE(po + 16);
                        const tx = buf.readFloatLE(po + 20);
                        const ty = buf.readFloatLE(po + 24);
                        const tz = buf.readFloatLE(po + 28);
                        const qx = buf.readFloatLE(po + 44);
                        const qy = buf.readFloatLE(po + 48);
                        const qz = buf.readFloatLE(po + 52);
                        const qw = buf.readFloatLE(po + 56);
                        const rawM = mat4Compose([tx, ty, tz], [qx, qy, qz, qw]);
                        const localThree = mat4Mul(mat4Mul(AXIS_SWAP, rawM), AXIS_SWAP);
                        sklPivots.push({
                            name: pName,
                            parentIndex: parentIndex,
                            localThree,
                            tx, ty, tz,
                            rawM
                        });
                        po += 60;
                    }
                }
                sub += 8 + ss;
            }
        }
        off += 8 + size;
    }
    return sklPivots;
}

function getAnimNumFrames(animFileName) {
    if (!animFileName) return 1;
    const animPath = path.join(w3dDir, animFileName);
    if (!fs.existsSync(animPath)) return 1;
    const animBuf = fs.readFileSync(animPath);
    let aoff = 0;
    while (aoff < animBuf.length) {
        const atype = animBuf.readUInt32LE(aoff);
        const asize = animBuf.readUInt32LE(aoff + 4) & 0x7fffffff;
        if (atype === 0x200) {
            let asub = aoff + 8;
            while (asub < aoff + 8 + asize) {
                const ast = animBuf.readUInt32LE(asub);
                const ass = animBuf.readUInt32LE(asub + 4) & 0x7fffffff;
                if (ast === 0x201) {
                    return animBuf.readUInt32LE(asub + 8 + 36);
                }
                asub += 8 + ass;
            }
        }
        aoff += 8 + asize;
    }
    return 1;
}

function getBonesForAnimFrame(basePivots, animFileName, frame) {
    const pivots = basePivots.map(p => ({
        name: p.name,
        parentIndex: p.parentIndex,
        localThree: new Float32Array(p.localThree),
        worldMat: null
    }));

    if (animFileName) {
        const animPath = path.join(w3dDir, animFileName);
        if (fs.existsSync(animPath)) {
            const animBuf = fs.readFileSync(animPath);
            let aoff = 0;
            const pivotDeltas = {};
            while (aoff < animBuf.length) {
                const atype = animBuf.readUInt32LE(aoff);
                const asize = animBuf.readUInt32LE(aoff + 4) & 0x7fffffff;
                if (atype === 0x200) {
                    let asub = aoff + 8;
                    while (asub < aoff + 8 + asize) {
                        const ast = animBuf.readUInt32LE(asub);
                        const ass = animBuf.readUInt32LE(asub + 4) & 0x7fffffff;
                        if (ast === 0x202) { // ANIMATION_CHANNEL
                            const firstFrame = animBuf.readUInt16LE(asub + 8);
                            const lastFrame = animBuf.readUInt16LE(asub + 10);
                            const channelType = animBuf.readUInt16LE(asub + 14);
                            const pivotIndex = animBuf.readUInt16LE(asub + 16); // Direct 0-based pivot index
                            if (!pivotDeltas[pivotIndex]) {
                                pivotDeltas[pivotIndex] = { t: [0,0,0], q: [0,0,0,1] };
                            }
                            const frameIdx = Math.max(0, Math.min(frame - firstFrame, lastFrame - firstFrame));
                            if (channelType === 0) pivotDeltas[pivotIndex].t[0] = animBuf.readFloatLE(asub + 20 + frameIdx * 4);
                            else if (channelType === 1) pivotDeltas[pivotIndex].t[1] = animBuf.readFloatLE(asub + 20 + frameIdx * 4);
                            else if (channelType === 2) pivotDeltas[pivotIndex].t[2] = animBuf.readFloatLE(asub + 20 + frameIdx * 4);
                            else if (channelType === 6) {
                                const valOff = asub + 20 + frameIdx * 16;
                                pivotDeltas[pivotIndex].q = [
                                    animBuf.readFloatLE(valOff + 0),
                                    animBuf.readFloatLE(valOff + 4),
                                    animBuf.readFloatLE(valOff + 8),
                                    animBuf.readFloatLE(valOff + 12)
                                ];
                            }
                        }
                        asub += 8 + ass;
                    }
                }
                aoff += 8 + asize;
            }

            for (const [piStr, delta] of Object.entries(pivotDeltas)) {
                const pi = parseInt(piStr);
                if (pi < pivots.length) {
                    const rawDelta = mat4Compose(delta.t, delta.q);
                    const deltaThree = mat4Mul(mat4Mul(AXIS_SWAP, rawDelta), AXIS_SWAP);
                    pivots[pi].localThree = mat4Mul(pivots[pi].localThree, deltaThree);
                }
            }
        }
    }

    for (let i = 0; i < pivots.length; i++) {
        const p = pivots[i];
        if (p.parentIndex === -1 || p.parentIndex >= i) {
            p.worldMat = p.localThree;
        } else {
            p.worldMat = mat4Mul(pivots[p.parentIndex].worldMat, p.localThree);
        }
    }
    return pivots;
}

function parseAndBakeSkinnedMesh(cfg) {
    const basePivots = loadSkeleton(cfg.skl);
    if (!basePivots) {
        console.warn(`Skeleton ${cfg.skl} not found for ${cfg.file}`);
        return null;
    }

    const standBones = getBonesForAnimFrame(basePivots, cfg.sta, 0);

    const sknPath = path.join(w3dDir, cfg.file);
    if (!fs.existsSync(sknPath)) return null;
    const buf = fs.readFileSync(sknPath);
    let off = 0;
    const rawMeshes = {};

    while (off < buf.length) {
        const type = buf.readUInt32LE(off);
        const size = buf.readUInt32LE(off + 4) & 0x7fffffff;
        if (type === 0) { // W3D_CHUNK_MESH
            let sub = off + 8;
            let meshName = '', numV = 0, numF = 0;
            let vArr = [], infArr = [], triArr = [], uvArr = [], meshTex = null;
            while (sub < off + 8 + size) {
                const st = buf.readUInt32LE(sub);
                const ss = buf.readUInt32LE(sub + 4) & 0x7fffffff;
                if (st === 0x1f) {
                    let endMesh = sub + 8 + 8;
                    while (endMesh < sub + 8 + 24 && buf[endMesh] !== 0) endMesh++;
                    meshName = buf.toString('ascii', sub + 8 + 8, endMesh).trim();
                } else if (st === 0x02) {
                    const count = Math.floor(ss / 12);
                    for (let i = 0; i < count; i++) {
                        const vx = buf.readFloatLE(sub + 8 + i * 12 + 0);
                        const vy = buf.readFloatLE(sub + 8 + i * 12 + 4);
                        const vz = buf.readFloatLE(sub + 8 + i * 12 + 8);
                        vArr.push([vx, vz, vy]);
                    }
                } else if (st === 0x0e) {
                    const count = Math.floor(ss / 8);
                    for (let i = 0; i < count; i++) {
                        infArr.push(buf.readUInt16LE(sub + 8 + i * 8));
                    }
                } else if (st === 0x20) {
                    const count = Math.floor(ss / 32);
                    for (let i = 0; i < count; i++) {
                        const v0 = buf.readUInt32LE(sub + 8 + i * 32 + 0);
                        const v1 = buf.readUInt32LE(sub + 8 + i * 32 + 4);
                        const v2 = buf.readUInt32LE(sub + 8 + i * 32 + 8);
                        triArr.push(v0, v2, v1);
                    }
                } else if (st === 0x30) {
                    let tSub = sub + 8;
                    while (tSub < sub + 8 + ss) {
                        const tst = buf.readUInt32LE(tSub);
                        const tss = buf.readUInt32LE(tSub + 4) & 0x7fffffff;
                        if (tst === 0x31) {
                            const nameBuf = buf.slice(tSub + 8, tSub + 8 + tss);
                            let raw = nameBuf.toString('ascii').replace(/\0/g, '').trim();
                            raw = raw.replace(/^[^a-zA-Z0-9_]+/, '');
                            meshTex = raw.toLowerCase();
                        }
                        tSub += 8 + tss;
                    }
                } else if (st === 0x38) { // W3D_CHUNK_MATERIAL_PASS
                    let pSub = sub + 8;
                    while (pSub < sub + 8 + ss) {
                        const pst = buf.readUInt32LE(pSub);
                        const pss = buf.readUInt32LE(pSub + 4) & 0x7fffffff;
                        if (pst === 0x48) { // W3D_CHUNK_STAGE_TEX_COORDS
                            let sSub = pSub + 8;
                            while (sSub < pSub + 8 + pss) {
                                const sst = buf.readUInt32LE(sSub);
                                const sss = buf.readUInt32LE(sSub + 4) & 0x7fffffff;
                                if (sst === 0x4a) { // W3D_CHUNK_TEX_COORDS
                                    const count = Math.floor(sss / 8);
                                    for (let i = 0; i < count; i++) {
                                        const u = buf.readFloatLE(sSub + 8 + i * 8 + 0);
                                        const v = buf.readFloatLE(sSub + 8 + i * 8 + 4);
                                        uvArr.push(parseFloat(u.toFixed(4)), parseFloat((1.0 - v).toFixed(4)));
                                    }
                                }
                                sSub += 8 + sss;
                            }
                        }
                        pSub += 8 + pss;
                    }
                }
                sub += 8 + ss;
            }

            const upper = meshName.toUpperCase();
            if (upper.includes('MUZZLE') || upper.includes('FLASH')) {
                off += 8 + size;
                continue;
            }

            if (cfg.submesh && meshName !== cfg.submesh) {
                off += 8 + size;
                continue;
            }

            if (vArr.length > 0 && triArr.length > 0) {
                rawMeshes[meshName || 'mesh'] = {
                    rawV: vArr,
                    inf: infArr,
                    tri: triArr,
                    uv: uvArr,
                    tex: meshTex || cfg.tex
                };
            }
        }
        off += 8 + size;
    }

    // Step 1: Compute stand pose vertices and determine global bounding box
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
    const standTransformed = {};

    for (const [mName, mData] of Object.entries(rawMeshes)) {
        const list = [];
        for (let i = 0; i < mData.rawV.length; i++) {
            const v = mData.rawV[i];
            const bIdx = (mData.inf && mData.inf.length === mData.rawV.length) ? mData.inf[i] : 0;
            const bone = standBones[bIdx];
            const wv = bone ? transformPoint(bone.worldMat, v) : v;
            const fwd = [-wv[0], wv[1], -wv[2]];
            list.push(fwd);

            if (fwd[0] < minX) minX = fwd[0]; if (fwd[0] > maxX) maxX = fwd[0];
            if (fwd[1] < minY) minY = fwd[1]; if (fwd[1] > maxY) maxY = fwd[1];
            if (fwd[2] < minZ) minZ = fwd[2]; if (fwd[2] > maxZ) maxZ = fwd[2];
        }
        standTransformed[mName] = list;
    }

    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const height = maxY - minY;

    // Step 2: Sample 8 animation frames across run animation (rna)
    const runFramesCount = 8;
    const totalRnaFrames = getAnimNumFrames(cfg.rna);
    const runSampledBones = [];
    for (let s = 0; s < runFramesCount; s++) {
        const frame = cfg.rna ? Math.floor(s * (totalRnaFrames - 1) / (runFramesCount - 1)) : 0;
        runSampledBones.push(cfg.rna ? getBonesForAnimFrame(basePivots, cfg.rna, frame) : standBones);
    }

    const exportMeshes = {};
    for (const [mName, mData] of Object.entries(rawMeshes)) {
        // Flatten stand vertices
        const flatV = [];
        for (const fwd of standTransformed[mName]) {
            flatV.push(
                parseFloat((fwd[0] - cx).toFixed(2)),
                parseFloat((fwd[1] - minY).toFixed(2)),
                parseFloat((fwd[2] - cz).toFixed(2))
            );
        }

        // Bake 8 run frames
        const bakedRun = [];
        for (let s = 0; s < runFramesCount; s++) {
            const bones = runSampledBones[s];
            const flatRun = [];
            for (let i = 0; i < mData.rawV.length; i++) {
                const v = mData.rawV[i];
                const bIdx = (mData.inf && mData.inf.length === mData.rawV.length) ? mData.inf[i] : 0;
                const bone = bones[bIdx];
                const wv = bone ? transformPoint(bone.worldMat, v) : v;
                const fwd = [-wv[0], wv[1], -wv[2]];
                flatRun.push(
                    parseFloat((fwd[0] - cx).toFixed(2)),
                    parseFloat((fwd[1] - minY).toFixed(2)),
                    parseFloat((fwd[2] - cz).toFixed(2))
                );
            }
            bakedRun.push(flatRun);
        }

        exportMeshes[mName] = {
            v: flatV,
            run: bakedRun,
            i: mData.tri,
            u: mData.uv,
            tex: mData.tex
        };
    }

    return {
        meshes: exportMeshes,
        bounds: {
            xSpan: (maxX - minX).toFixed(2),
            height: height.toFixed(2),
            zSpan: (maxZ - minZ).toFixed(2)
        }
    };
}

function processInfantry(configMap) {
    const results = {};
    for (const [key, cfg] of Object.entries(configMap)) {
        const baked = parseAndBakeSkinnedMesh(cfg);
        if (!baked || Object.keys(baked.meshes).length === 0) {
            console.warn(`[W3D Infantry] Failed to bake skinned mesh for ${key}`);
            continue;
        }
        results[key] = {
            f: cfg.faction,
            s: cfg.scale,
            p: [],
            h: Object.keys(baked.meshes).map(mName => [0, mName]),
            m: baked.meshes
        };
        console.log(`[W3D Infantry] Baked ${key}: height ${baked.bounds.height}, submeshes: ${Object.keys(baked.meshes).join(', ')}`);
    }
    return results;
}
const vehicleData = processModels(VEHICLE_CONFIG);
console.log(`Processed ${Object.keys(vehicleData).length} vehicles.`);

const buildingData = processModels(BUILDING_CONFIG);
console.log(`Processed ${Object.keys(buildingData).length} buildings.`);

const infantryData = processInfantry(INFANTRY_CONFIG);
console.log(`Processed ${Object.keys(infantryData).length} infantry characters.`);

// Scan and extract all submesh textures across vehicles, buildings, and infantry
[vehicleData, buildingData, infantryData].forEach(dataSet => {
    Object.values(dataSet).forEach(model => {
        Object.values(model.m).forEach(m => {
            if (m.tex && m.tex !== 'unknown' && m.tex !== 'null') {
                loadSingleTexture(null, m.tex);
            }
        });
    });
});
console.log(`Extracted textures for ${Object.keys(textureData).length} assets.`);

const jsOutput = `/**
 * Command & Conquer: Generals Authentic Westwood 3D Retail Assets (Vehicles, Structures & Infantry)
 * Real EA retail models with UV mapping and embedded textures (DXT1, DXT5 & TGA).
 * Multi-texture building submeshes with seamless materials and zero graphical glitches.
 */

window.W3D_VEHICLE_DATA = ${JSON.stringify(vehicleData)};
window.W3D_BUILDING_DATA = ${JSON.stringify(buildingData)};
window.W3D_INFANTRY_DATA = ${JSON.stringify(infantryData)};
window.W3D_TEXTURE_DATA = ${JSON.stringify(textureData)};

window.W3D_TEXTURE_CACHE = {};

/**
 * In-browser texture loader (supporting DXT1 BC1, DXT5 BC3, and raw TGA pixel buffers) to native Three.js DataTexture.
 */
function getW3dTexture(modelKey) {
    if (!modelKey) return null;
    const cleanKey = modelKey.toLowerCase().replace('.tga', '').replace('.dds', '');
    if (window.W3D_TEXTURE_CACHE[cleanKey]) return window.W3D_TEXTURE_CACHE[cleanKey];
    if (!window.W3D_TEXTURE_DATA || !window.W3D_TEXTURE_DATA[cleanKey]) return null;

    try {
        const item = window.W3D_TEXTURE_DATA[cleanKey];
        const b64 = item.d;
        const binaryStr = (typeof atob === 'function') ? atob(b64) : (typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64').toString('binary') : '');
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryStr.charCodeAt(i);

        let tex;
        if (item.t === 'raw') {
            tex = new THREE.DataTexture(bytes, item.w, item.h, THREE.RGBAFormat);
        } else if (item.t === 'dxt5') {
            const width = item.w || 128, height = item.h || 128;
            const rgba = new Uint8Array(width * height * 4);
            let offset = 0;

            for (let by = 0; by < height; by += 4) {
                for (let bx = 0; bx < width; bx += 4) {
                    if (offset + 16 > len) break;
                    const a0 = bytes[offset], a1 = bytes[offset + 1];
                    const alphas = [a0, a1];
                    if (a0 > a1) {
                        for (let i = 1; i <= 6; i++) alphas[i + 1] = (((7 - i) * a0 + i * a1) / 7) | 0;
                    } else {
                        for (let i = 1; i <= 4; i++) alphas[i + 1] = (((5 - i) * a0 + i * a1) / 5) | 0;
                        alphas[6] = 0; alphas[7] = 255;
                    }
                    const aBits0 = bytes[offset + 2] | (bytes[offset + 3] << 8) | (bytes[offset + 4] << 16);
                    const aBits1 = bytes[offset + 5] | (bytes[offset + 6] << 8) | (bytes[offset + 7] << 16);

                    const c0 = bytes[offset + 8] | (bytes[offset + 9] << 8);
                    const c1 = bytes[offset + 10] | (bytes[offset + 11] << 8);
                    const r0 = (((c0 >> 11) & 0x1F) * 255 / 31) | 0;
                    const g0 = (((c0 >> 5) & 0x3F) * 255 / 63) | 0;
                    const b0 = ((c0 & 0x1F) * 255 / 31) | 0;
                    const r1 = (((c1 >> 11) & 0x1F) * 255 / 31) | 0;
                    const g1 = (((c1 >> 5) & 0x3F) * 255 / 63) | 0;
                    const b1 = ((c1 & 0x1F) * 255 / 31) | 0;

                    const colors = [
                        [r0, g0, b0],
                        [r1, g1, b1],
                        [((2*r0 + r1)/3)|0, ((2*g0 + g1)/3)|0, ((2*b0 + b1)/3)|0],
                        [((r0 + 2*r1)/3)|0, ((r0 + 2*g1)/3)|0, ((b0 + 2*b1)/3)|0]
                    ];
                    const cBits = bytes[offset + 12] | (bytes[offset + 13] << 8) | (bytes[offset + 14] << 16) | (bytes[offset + 15] << 24);
                    offset += 16;

                    for (let p = 0; p < 16; p++) {
                        const px = bx + (p % 4);
                        const py = by + ((p / 4) | 0);
                        const cIdx = (cBits >>> (p * 2)) & 0x03;
                        const aIdx = (p < 8) ? ((aBits0 >>> (p * 3)) & 0x07) : ((aBits1 >>> ((p - 8) * 3)) & 0x07);
                        const dest = (py * width + px) * 4;
                        rgba[dest] = colors[cIdx][0];
                        rgba[dest + 1] = colors[cIdx][1];
                        rgba[dest + 2] = colors[cIdx][2];
                        rgba[dest + 3] = alphas[aIdx];
                    }
                }
            }
            tex = new THREE.DataTexture(rgba, width, height, THREE.RGBAFormat);
        } else {
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
                            const pIndex = py * 4 + px;
                            const colorIndex = (lookup >>> (pIndex * 2)) & 0x03;
                            const dIndex = ((by + py) * width + (bx + px)) * 4;
                            const col = colors[colorIndex];
                            rgba[dIndex] = col[0];
                            rgba[dIndex + 1] = col[1];
                            rgba[dIndex + 2] = col[2];
                            rgba[dIndex + 3] = col[3];
                        }
                    }
                }
            }
            tex = new THREE.DataTexture(rgba, width, height, THREE.RGBAFormat);
        }

        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        window.W3D_TEXTURE_CACHE[cleanKey] = tex;
        return tex;
    } catch (e) {
        console.warn('Failed to decode W3D texture:', modelKey, e);
        return null;
    }
}

window.W3D_GEOM_CACHE = window.W3D_GEOM_CACHE || {};
window.W3D_MAT_CACHE = window.W3D_MAT_CACHE || {};

function getCachedW3DGeometry(cacheKey, mdata) {
    let geom = window.W3D_GEOM_CACHE[cacheKey];
    if (geom) return geom;
    geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(mdata.v, 3));
    if (mdata.u && mdata.u.length > 0) {
        geom.setAttribute('uv', new THREE.Float32BufferAttribute(mdata.u, 2));
    }
    geom.setIndex(mdata.i);
    geom.computeVertexNormals();
    geom.userData = { _shared: true };
    window.W3D_GEOM_CACHE[cacheKey] = geom;
    return geom;
}

function getCachedW3DMaterial(cacheKey, factoryFn) {
    let mat = window.W3D_MAT_CACHE[cacheKey];
    if (mat) return mat;
    mat = factoryFn();
    if (mat) mat.userData = Object.assign(mat.userData || {}, { _shared: true });
    window.W3D_MAT_CACHE[cacheKey] = mat;
    return mat;
}

function createW3DVehicleMesh(modelKey, isEnemy = false, fallbackFn = null) {
    if (!window.W3D_VEHICLE_DATA || !window.W3D_VEHICLE_DATA[modelKey]) {
        if (typeof fallbackFn === 'function') return fallbackFn(isEnemy);
        return new THREE.Group();
    }

    const data = window.W3D_VEHICLE_DATA[modelKey];
    const faction = data.f;
    const scale = data.s || 0.09;

    const vTex = getW3dTexture(modelKey);
    const matPrefix = 'veh:' + modelKey + ':' + (isEnemy ? 'E' : 'F') + ':';
    let hullMat, houseMat;
    if (isEnemy) {
        hullMat = getCachedW3DMaterial(matPrefix + 'hull', () => vTex 
            ? new THREE.MeshStandardMaterial({ map: vTex, color: 0xaa4444, roughness: 0.6, metalness: 0.25 })
            : new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.52, metalness: 0.35 }));
        houseMat = getCachedW3DMaterial('veh:enemy:house', () => new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.55, metalness: 0.25 }));
    } else {
        if (vTex) {
            hullMat = getCachedW3DMaterial(matPrefix + 'hull', () => new THREE.MeshStandardMaterial({ map: vTex, roughness: 0.6, metalness: 0.25 }));
        } else {
            if (faction === 'usa') {
                hullMat = (typeof matUSA !== 'undefined') ? matUSA : getCachedW3DMaterial('veh:usa:hull', () => new THREE.MeshStandardMaterial({ color: 0x4a5d4e, roughness: 0.5, metalness: 0.35 }));
            } else if (faction === 'china') {
                hullMat = (typeof matChina !== 'undefined') ? matChina : getCachedW3DMaterial('veh:china:hull', () => new THREE.MeshStandardMaterial({ color: 0x556b2f, roughness: 0.55, metalness: 0.3 }));
            } else {
                hullMat = (typeof matGLA !== 'undefined') ? matGLA : getCachedW3DMaterial('veh:gla:hull', () => new THREE.MeshStandardMaterial({ color: 0x6e6347, roughness: 0.75, metalness: 0.2 }));
            }
        }
        if (faction === 'usa') {
            houseMat = (typeof matUSAColor !== 'undefined') ? matUSAColor : getCachedW3DMaterial('veh:usa:house', () => new THREE.MeshStandardMaterial({ color: 0x1e3f66, roughness: 0.58, metalness: 0.3 }));
        } else if (faction === 'china') {
            houseMat = (typeof matChinaColor !== 'undefined') ? matChinaColor : getCachedW3DMaterial('veh:china:house', () => new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.55, metalness: 0.32 }));
        } else {
            houseMat = (typeof matGLAColor !== 'undefined') ? matGLAColor : getCachedW3DMaterial('veh:gla:house', () => new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.78, metalness: 0.2 }));
        }
    }

    const treadMat = (typeof matTread !== 'undefined') ? matTread : getCachedW3DMaterial('veh:tread', () => new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.1 }));
    const metalMat = (typeof matDarkMetal !== 'undefined') ? matDarkMetal : getCachedW3DMaterial('veh:metal', () => new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.5, metalness: 0.7 }));
    const glassMat = (typeof matBlueGlass !== 'undefined') ? matBlueGlass : getCachedW3DMaterial('veh:glass', () => new THREE.MeshStandardMaterial({ color: 0x00d2d3, roughness: 0.1, metalness: 0.85, transparent: true, opacity: 0.8 }));

    const pivotGroups = [];
    data.p.forEach(p => {
        const [name, parentIdx, tx, ty, tz] = p;
        const grp = new THREE.Group();
        grp.name = name;
        grp.position.set(tx, ty, tz);

        const upper = name.toUpperCase();
        if (upper === 'TURRET' || upper === 'TURRET01') {
            grp.name = 'turretSystem';
        } else if ((upper.includes('BARRELS') || upper.includes('BARREL')) && (modelKey === 'gatling' || modelKey === 'overlord_gatling')) {
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

    data.h.forEach(([boneIdx, meshName]) => {
        const mdata = data.m[meshName];
        if (!mdata || !mdata.v || !mdata.i) return;

        const geom = getCachedW3DGeometry('veh:' + modelKey + ':' + meshName, mdata);

        const upper = meshName.toUpperCase();
        let mat = hullMat;
        if (upper.includes('HOUSECOLOR') || upper.includes('BANNER')) {
            mat = houseMat;
        } else if (upper.includes('TREAD') || upper.includes('TRACK') || upper.includes('WHEEL') || upper.includes('TIRE')) {
            mat = treadMat;
        } else if (upper.includes('BARREL') || upper.includes('GUN') || upper.includes('CANNON') || upper.includes('EXHAUST')) {
            mat = metalMat;
        } else if (upper.includes('GLASS') || upper.includes('WINDOW')) {
            mat = glassMat;
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

    if (modelKey === 'drone_battle') {
        const fanMesh = root.getObjectByName('avbattledr.fan');
        if (fanMesh) fanMesh.name = 'ductedFan';
        const dTurret = root.getObjectByName('turretSystem') || root.getObjectByName('TURRET01');
        if (dTurret) dTurret.name = 'droneTurret';
        const dElev = root.getObjectByName('TURRETEL01');
        if (dElev) dElev.name = 'droneTurretElevation';
    } else if (modelKey === 'comanche') {
        const rotor = root.getObjectByName('PROPELLER01') || root.getObjectByName('avcomanche.avcomanche_prop');
        if (rotor) rotor.name = 'comanche_rotor';
    } else if (modelKey === 'chinook') {
        const r1 = root.getObjectByName('PROPELLER01') || root.getObjectByName('avchinook.props01');
        if (r1) r1.name = 'chinook_rotor1';
        const r2 = root.getObjectByName('PROPELLER02') || root.getObjectByName('avchinook.props02');
        if (r2) r2.name = 'chinook_rotor2';
    }

    const isAirUnit = ['comanche', 'chinook', 'raptor', 'aurora', 'stealthfighter', 'mig', 'drone_battle', 'drone_scout', 'drone_hellfire', 'overlord_bunker', 'overlord_gatling', 'overlord_speaker'].includes(modelKey);
    if (!isAirUnit) {
        if (data._cachedMinY === undefined) {
            let minY = 1e9;
            root.traverse(c => {
                if (c.isMesh && c.geometry && c.geometry.attributes && c.geometry.attributes.position) {
                    const pos = c.geometry.attributes.position;
                    for (let i = 0; i < pos.count; i++) {
                        const vy = pos.getY(i);
                        let curY = vy;
                        let p = c.parent;
                        while (p && p !== root) {
                            curY += p.position.y;
                            p = p.parent;
                        }
                        if (curY < minY) minY = curY;
                    }
                }
            });
            data._cachedMinY = minY;
        }
        const minY = data._cachedMinY;
        if (minY < 1e8 && minY < 0) {
            const shiftY = -minY;
            root.children.forEach(child => {
                child.position.y += shiftY;
            });
        }
    } else {
        root.userData.isAir = true;
        root.userData.flightAltitude = (modelKey === 'chinook') ? 8.5 : (modelKey === 'comanche') ? 8.0 : (modelKey === 'raptor' || modelKey === 'aurora') ? 9.5 : 8.5;
    }

    root.userData.isW3D = true;
    root.scale.set(scale, scale, scale);
    return root;
}

/**
 * Creates an authentic Westwood 3D building mesh with UV mapping, multi-textures & reactor glow.
 */
function createW3DBuildingMesh(buildingKey, isEnemy = false, fallbackFn = null) {
    if (!window.W3D_BUILDING_DATA || !window.W3D_BUILDING_DATA[buildingKey]) {
        if (typeof fallbackFn === 'function') return fallbackFn(isEnemy);
        return new THREE.Group();
    }

    const data = window.W3D_BUILDING_DATA[buildingKey];
    const faction = data.f;
    const scale = data.s || 0.26;
    const bTex = getW3dTexture(buildingKey);

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
        emissiveIntensity: 1.8,
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

    // 2. Attach SubMeshes with exact UV textures
    data.h.forEach(([boneIdx, meshName]) => {
        const mdata = data.m[meshName];
        if (!mdata || !mdata.v || !mdata.i) return;

        const geom = getCachedW3DGeometry('bld:' + buildingKey + ':' + meshName, mdata);

        const upper = meshName.toUpperCase();
        let subTex = null;
        if (mdata.tex) {
            const cleanT = mdata.tex.toLowerCase().replace('.tga', '').replace('.dds', '');
            subTex = getW3dTexture(cleanT);
        }

        let mat = bldMat;
        if (buildingKey === 'usa_power' && (upper.includes('CYLINDER01') || upper.includes('CYLINDER02') || upper.includes('CYLINDER'))) {
            mat = coldFusionGlowMat;
        } else if (buildingKey === 'usa_power' && (upper.includes('GRADIENT2') || (mdata.tex && mdata.tex.toLowerCase().includes('gradient2')))) {
            // Vibrant glowing blue plasma energy conduit connecting cooling towers to power grid
            mat = new THREE.MeshStandardMaterial({
                color: 0x00d2ff,
                emissive: 0x0088ff,
                emissiveIntensity: 1.6,
                roughness: 0.2,
                metalness: 0.5
            });
        } else if (upper.includes('GRADIENT2') || (mdata.tex && mdata.tex.toLowerCase().includes('gradient2'))) {
            // Authentic metallic cooling tower finish - eliminates zebra stripes!
            mat = new THREE.MeshStandardMaterial({ color: 0x585d64, roughness: 0.55, metalness: 0.25 });
        } else if (subTex) {
            mat = new THREE.MeshStandardMaterial({ map: subTex, roughness: 0.65, metalness: 0.25 });
            if (isEnemy) mat.color.setHex(0xaa4444);
        } else if (upper.includes('HOUSECOLOR') || upper.includes('BANNER')) {
            mat = accentMat;
        } else if (bTex) {
            mat = bldMat;
        } else {
            if (upper.includes('BASE') || upper.includes('CONCRETE') || upper.includes('SLAB') || upper.includes('FOUNDATION') || upper.includes('FENCE')) {
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

    if (buildingKey === 'usa_power') {
        const glow1 = new THREE.PointLight(0x00d2ff, 2.5, 35);
        glow1.position.set(-4.65, 18.0, -0.54);
        root.add(glow1);

        const glow2 = new THREE.PointLight(0x00d2ff, 2.5, 35);
        glow2.position.set(-17.54, 18.0, -13.16);
        root.add(glow2);
    }

    // Align base foundation to y = 0 (PERF: cache minBldY per buildingKey)
    if (data._cachedMinBldY === undefined) {
        let minBldY = 1e9;
        root.traverse(c => {
            if (c.isMesh && c.geometry && c.geometry.attributes && c.geometry.attributes.position) {
                const pos = c.geometry.attributes.position;
                for (let i = 0; i < pos.count; i++) {
                    const vy = pos.getY(i);
                    let curY = vy;
                    let p = c.parent;
                    while (p && p !== root) {
                        curY += p.position.y;
                        p = p.parent;
                    }
                    if (curY < minBldY) minBldY = curY;
                }
            }
        });
        data._cachedMinBldY = minBldY;
    }
    const minBldY = data._cachedMinBldY;
    if (minBldY < 1e8 && minBldY < 0) {
        const shiftY = -minBldY + 0.35;
        root.children.forEach(child => {
            child.position.y += shiftY;
        });
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
            fallbackMesh.scale.set(0.28, 0.28, 0.28);
            return fallbackMesh;
        }
        return new THREE.Group();
    }

    const data = window.W3D_INFANTRY_DATA[infantryKey];
    const faction = data.f;
    const scale = data.s || 0.280;
    const iTex = getW3dTexture(infantryKey);

    let skinMat;
    if (iTex) {
        skinMat = new THREE.MeshStandardMaterial({
            map: iTex,
            roughness: 0.72,
            metalness: 0.15,
            side: THREE.DoubleSide,
            color: isEnemy ? 0xcc6666 : 0xffffff
        });
    } else {
        const col = (faction === 'usa') ? 0x1e3f66 : (faction === 'china') ? 0xcc0000 : 0x2e8b57;
        skinMat = new THREE.MeshStandardMaterial({ color: isEnemy ? 0x882222 : col, roughness: 0.7, side: THREE.DoubleSide });
    }

    const root = new THREE.Group();
    root.userData.animatedMeshes = [];

    data.h.forEach(([_, meshName]) => {
        const mdata = data.m[meshName];
        if (!mdata || !mdata.v || !mdata.i) return;

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(mdata.v.slice(), 3));
        if (mdata.u && mdata.u.length > 0) {
            geom.setAttribute('uv', new THREE.Float32BufferAttribute(mdata.u, 2));
        }
        geom.setIndex(mdata.i);
        geom.computeVertexNormals();

        let subMat = skinMat;
        if (mdata.tex) {
            const subTex = getW3dTexture(mdata.tex);
            if (subTex) {
                subMat = new THREE.MeshStandardMaterial({
                    map: subTex,
                    roughness: 0.72,
                    metalness: 0.15,
                    side: THREE.DoubleSide,
                    color: isEnemy ? 0xcc6666 : 0xffffff
                });
            }
        }

        const mesh = new THREE.Mesh(geom, subMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        mesh.userData.runFrames = mdata.run;
        mesh.userData.standVerts = mdata.v;
        root.userData.animatedMeshes.push(mesh);
        root.add(mesh);
    });

    root.userData.isW3D = true;
    root.scale.set(scale, scale, scale);
    return root;
}
window.createW3DVehicleMesh = createW3DVehicleMesh;
window.createW3DBuildingMesh = createW3DBuildingMesh;
window.createW3DInfantryMesh = createW3DInfantryMesh;
window.getW3dTexture = getW3dTexture;
`;

const jsDestPath = path.join(__dirname, '..', 'src', 'js', '02b_w3d_models.js');
fs.writeFileSync(jsDestPath, jsOutput, 'utf8');
console.log(`Generated authentic W3D bundle at ${jsDestPath} (${(fs.statSync(jsDestPath).size / (1024 * 1024)).toFixed(2)} MB)`);
