const fs = require('fs');
const path = require('path');
const { parseW3dModel } = require('./parse_w3d_clean');

const VEHICLE_MAP = {
    // USA
    'crusader':       { file: 'avleopard.W3D',   scale: 0.135, faction: 'usa' },
    'paladin':        { file: 'avPaladin.W3D',    scale: 0.135, faction: 'usa' },
    'humvee':         { file: 'AvHummer.W3D',     scale: 0.125, faction: 'usa' },
    'ambulance':      { file: 'AvAmbulance.W3D',  scale: 0.130, faction: 'usa' },
    'tomahawk':       { file: 'avtomahawk.W3D',   scale: 0.135, faction: 'usa' },
    'dozer':          { file: 'avconstdoz.W3D',   scale: 0.130, faction: 'usa' },
    'chinook':        { file: 'AVChinook.W3D',    scale: 0.125, faction: 'usa' },
    'comanche':       { file: 'AVComanche.W3D',   scale: 0.110, faction: 'usa' },
    'raptor':         { file: 'avraptor.W3D',     scale: 0.130, faction: 'usa' },
    'stealthfighter': { file: 'avstealth.W3D',    scale: 0.130, faction: 'usa' },
    'aurora':         { file: 'AVAurora.W3D',     scale: 0.125, faction: 'usa' },

    // China
    'battlemaster':   { file: 'NVBtMstr.W3D',     scale: 0.135, faction: 'china' },
    'overlord':       { file: 'NVOvrlrd.W3D',     scale: 0.145, faction: 'china' },
    'gatling':        { file: 'NVGattTank.W3D',   scale: 0.130, faction: 'china' },
    'dragon':         { file: 'NVDragon.W3D',     scale: 0.135, faction: 'china' },
    'crawler':        { file: 'NVTCrawler.W3D',   scale: 0.135, faction: 'china' },
    'inferno':        { file: 'NVInferno.W3D',    scale: 0.135, faction: 'china' },
    'nukecannon':     { file: 'NVNukeCn.W3D',     scale: 0.130, faction: 'china' },
    'truck':          { file: 'NVSSupplyTk.W3D',  scale: 0.130, faction: 'china' },
    'mig':            { file: 'NVMig.W3D',        scale: 0.130, faction: 'china' },

    // GLA
    'scorpion':       { file: 'UVLiteTank.W3D',   scale: 0.135, faction: 'gla' },
    'marauder':       { file: 'UVMarauder.W3D',   scale: 0.135, faction: 'gla' },
    'technical':      { file: 'UVTechTrck.W3D',   scale: 0.125, faction: 'gla' },
    'quad':           { file: 'UVQuadCann.W3D',   scale: 0.130, faction: 'gla' },
    'buggy':          { file: 'UVRockBug.W3D',    scale: 0.120, faction: 'gla' },
    'toxintractor':   { file: 'UVToxinTrk.W3D',   scale: 0.130, faction: 'gla' },
    'bombtruck':      { file: 'UVBmbtruk.W3D',    scale: 0.130, faction: 'gla' },
    'scud':           { file: 'UVScudLchr.W3D',   scale: 0.135, faction: 'gla' },
    'radarvan':       { file: 'UVRadarVan.W3D',   scale: 0.130, faction: 'gla' }
};

const BUILDING_MAP = {
    // USA
    'usa_commandCenter':    { file: 'ABBtCmdHQ.W3D',   scale: 0.135, faction: 'usa' },
    'usa_power':            { file: 'ABPWRPLANT.W3D',  scale: 0.135, faction: 'usa' },
    'usa_barracks':         { file: 'ABBARRACKS.W3D',  scale: 0.135, faction: 'usa' },
    'usa_factory':          { file: 'ABWarFact.W3D',   scale: 0.135, faction: 'usa' },
    'usa_supplyCenter':     { file: 'ABSUPPLYCT.W3D',  scale: 0.135, faction: 'usa' },
    'usa_supplyDrop':       { file: 'ABSupDrop.W3D',   scale: 0.135, faction: 'usa' },
    'usa_airfield':         { file: 'ABArFrcCmd.W3D',  scale: 0.135, faction: 'usa' },
    'usa_strategyCenter':   { file: 'ABStrategy.W3D',  scale: 0.135, faction: 'usa' },
    'usa_patriot':          { file: 'ABPATRIOT.W3D',   scale: 0.135, faction: 'usa' },
    'usa_particleCannon':   { file: 'ABSDILink.W3D',   scale: 0.135, faction: 'usa' },
    'usa_detentionCamp':    { file: 'ABPrison.W3D',    scale: 0.135, faction: 'usa' },

    // China
    'china_commandCenter':  { file: 'NBConYard.W3D',   scale: 0.135, faction: 'china' },
    'china_power':          { file: 'NBPwrPlant.W3D',  scale: 0.135, faction: 'china' },
    'china_barracks':       { file: 'NBBarracks.W3D',  scale: 0.135, faction: 'china' },
    'china_factory':        { file: 'NBWarFact.W3D',   scale: 0.135, faction: 'china' },
    'china_supplyCenter':   { file: 'NBSupCent.W3D',   scale: 0.135, faction: 'china' },
    'china_airfield':       { file: 'NBAirfield.W3D',  scale: 0.135, faction: 'china' },
    'china_gatlingCannon':  { file: 'NBGattling.W3D',  scale: 0.135, faction: 'china' },
    'china_bunker':         { file: 'NBBunker.W3D',    scale: 0.135, faction: 'china' },
    'china_speakerTower':   { file: 'NBPTower.W3D',    scale: 0.135, faction: 'china' },
    'china_propagandaCenter':{ file: 'NBPCenter.W3D',  scale: 0.135, faction: 'china' },
    'china_nukeSilo':       { file: 'NBNMissle.W3D',   scale: 0.135, faction: 'china' },
    'china_internetCenter': { file: 'NBConYard.W3D',   scale: 0.135, faction: 'china' },

    // GLA
    'gla_commandCenter':    { file: 'UBCmdHQ.W3D',     scale: 0.135, faction: 'gla' },
    'gla_supplyCenter':     { file: 'UBSupply.W3D',    scale: 0.135, faction: 'gla' },
    'gla_barracks':         { file: 'UBBarracks.W3D',  scale: 0.135, faction: 'gla' },
    'gla_factory':          { file: 'UBArmDeal.W3D',   scale: 0.135, faction: 'gla' },
    'gla_tunnel':           { file: 'UBUndTunn.W3D',   scale: 0.135, faction: 'gla' },
    'gla_stingerSite':      { file: 'UBStingerS.W3D',  scale: 0.135, faction: 'gla' },
    'gla_palace':           { file: 'UBPalace.W3D',    scale: 0.135, faction: 'gla' },
    'gla_blackMarket':      { file: 'UBBlackMkt.W3D',  scale: 0.135, faction: 'gla' },
    'gla_scudStorm':        { file: 'UBScudStrm.W3D',  scale: 0.135, faction: 'gla' },
    'gla_hole':             { file: 'UBHole.W3D',      scale: 0.135, faction: 'gla' },

    // Neutral Tech Structures
    'tech_oilDerrick':      { file: 'ZBODerrick.W3D',  scale: 0.135, faction: 'tech' },
    'tech_hospital':        { file: 'ZBHospital.W3D',  scale: 0.135, faction: 'tech' },
    'tech_refinery':        { file: 'CBOilRfny.W3D',   scale: 0.135, faction: 'tech' }
};

const w3dDir = path.join(__dirname, '..', 'extracted_assets', 'w3d');

function processModelGroup(map) {
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
            if (/MUZZLEFX|TURRETFX|SMOKEFX|EXNK/i.test(mName)) continue;
            filteredMeshes[mName] = mData;
        }

        const filteredHlod = parsed.hlodSubObjects.filter(h => {
            return filteredMeshes[h.name] !== undefined;
        });

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
            h: filteredHlod.map(h => [h.boneIndex, h.name]),
            m: filteredMeshes
        };
    }
    return result;
}

console.log('Processing vehicle models...');
const vehicleData = processModelGroup(VEHICLE_MAP);
console.log(`Vehicles processed: ${Object.keys(vehicleData).length}`);

console.log('Processing building models...');
const buildingData = processModelGroup(BUILDING_MAP);
console.log(`Buildings processed: ${Object.keys(buildingData).length}`);

const jsOutput = `/**
 * Command & Conquer: Generals Authentic Westwood 3D Retail Assets (Vehicles & Structures)
 * Extracted from official EA retail archives (W3D.big)
 * Coordinate transformed to Three.js standard Y-up with pivot bone hierarchy.
 */

window.W3D_VEHICLE_DATA = ${JSON.stringify(vehicleData)};
window.W3D_BUILDING_DATA = ${JSON.stringify(buildingData)};

/**
 * Creates an authentic Westwood 3D vehicle mesh with pivot hierarchy.
 */
function createW3DVehicleMesh(modelKey, isEnemy = false, fallbackFn = null) {
    if (!window.W3D_VEHICLE_DATA || !window.W3D_VEHICLE_DATA[modelKey]) {
        if (typeof fallbackFn === 'function') return fallbackFn(isEnemy);
        return new THREE.Group();
    }

    const data = window.W3D_VEHICLE_DATA[modelKey];
    const faction = data.f;
    const scale = data.s || 0.135;

    // Faction materials
    let hullMat, houseMat;
    if (isEnemy) {
        hullMat = new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.52, metalness: 0.35 });
        houseMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.55, metalness: 0.25 });
    } else {
        if (faction === 'usa') {
            hullMat = (typeof matUSA !== 'undefined') ? matUSA : new THREE.MeshStandardMaterial({ color: 0x7a7d5a, roughness: 0.58, metalness: 0.32 });
            houseMat = (typeof matUSAColor !== 'undefined') ? matUSAColor : new THREE.MeshStandardMaterial({ color: 0x1e3f66, roughness: 0.6, metalness: 0.3 });
        } else if (faction === 'china') {
            hullMat = (typeof matChina !== 'undefined') ? matChina : new THREE.MeshStandardMaterial({ color: 0x48583a, roughness: 0.55, metalness: 0.35 });
            houseMat = (typeof matChinaColor !== 'undefined') ? matChinaColor : new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.6, metalness: 0.32 });
        } else {
            hullMat = (typeof matGLA !== 'undefined') ? matGLA : new THREE.MeshStandardMaterial({ color: 0x5c5040, roughness: 0.8, metalness: 0.25 });
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

    // 2. Attach SubMeshes
    data.h.forEach(([boneIdx, meshName]) => {
        const mdata = data.m[meshName];
        if (!mdata || !mdata.v || !mdata.i) return;

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(mdata.v, 3));
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

    if (modelKey === 'dozer' || modelKey === 'ambulance') {
        const amberMat = (typeof matBeaconAmber !== 'undefined') ? matBeaconAmber : new THREE.MeshBasicMaterial({ color: 0xffa500 });
        const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.22, 8), amberMat);
        beacon.name = "hazardBeacon";
        beacon.position.set(0, 1.45, 0);
        root.add(beacon);
    }
    if (modelKey === 'truck') {
        const cargo = new THREE.Group();
        cargo.name = "cargoHold";
        root.add(cargo);
    }

    root.userData.isW3D = true;
    root.scale.set(scale, scale, scale);
    return root;
}

/**
 * Creates an authentic Westwood 3D building mesh with pivot hierarchy.
 * Supports team colors, defense turrets (Patriot, Gatling), ventilation fans, and foundations.
 */
function createW3DBuildingMesh(buildingKey, isEnemy = false, fallbackFn = null) {
    if (!window.W3D_BUILDING_DATA || !window.W3D_BUILDING_DATA[buildingKey]) {
        if (typeof fallbackFn === 'function') return fallbackFn(isEnemy);
        return new THREE.Group();
    }

    const data = window.W3D_BUILDING_DATA[buildingKey];
    const faction = data.f;
    const scale = data.s || 0.135;

    // Faction materials
    let bldMat, accentMat;
    if (isEnemy) {
        bldMat = new THREE.MeshStandardMaterial({ color: 0x772222, roughness: 0.65, metalness: 0.25 });
        accentMat = new THREE.MeshStandardMaterial({ color: 0x992222, roughness: 0.55, metalness: 0.25 });
    } else {
        if (faction === 'usa') {
            bldMat = (typeof matUSA !== 'undefined') ? matUSA : new THREE.MeshStandardMaterial({ color: 0x7a7d5a, roughness: 0.6, metalness: 0.28 });
            accentMat = (typeof matUSAColor !== 'undefined') ? matUSAColor : new THREE.MeshStandardMaterial({ color: 0x1e3f66, roughness: 0.58, metalness: 0.3 });
        } else if (faction === 'china') {
            bldMat = (typeof matChina !== 'undefined') ? matChina : new THREE.MeshStandardMaterial({ color: 0x48583a, roughness: 0.6, metalness: 0.3 });
            accentMat = (typeof matChinaColor !== 'undefined') ? matChinaColor : new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.55, metalness: 0.32 });
        } else if (faction === 'gla') {
            bldMat = (typeof matGLA !== 'undefined') ? matGLA : new THREE.MeshStandardMaterial({ color: 0x5c5040, roughness: 0.82, metalness: 0.2 });
            accentMat = (typeof matGLAColor !== 'undefined') ? matGLAColor : new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.78, metalness: 0.2 });
        } else {
            bldMat = new THREE.MeshStandardMaterial({ color: 0x6e6e6e, roughness: 0.7, metalness: 0.3 });
            accentMat = new THREE.MeshStandardMaterial({ color: 0xd4ac0d, roughness: 0.5, metalness: 0.4 });
        }
    }

    const concreteMat = (typeof matConcrete !== 'undefined') ? matConcrete : new THREE.MeshStandardMaterial({ color: 0x5a5854, roughness: 0.9, metalness: 0.1 });
    const metalMat = (typeof matDarkMetal !== 'undefined') ? matDarkMetal : new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.55, metalness: 0.7 });
    const gunMat = (typeof matGunmetal !== 'undefined') ? matGunmetal : new THREE.MeshStandardMaterial({ color: 0x2e3338, roughness: 0.4, metalness: 0.8 });
    const glassMat = (typeof matBlueGlass !== 'undefined') ? matBlueGlass : new THREE.MeshStandardMaterial({ color: 0x00d2d3, roughness: 0.1, metalness: 0.85, transparent: true, opacity: 0.8 });
    const nukeMat = (typeof matNukeGreen !== 'undefined') ? matNukeGreen : new THREE.MeshStandardMaterial({ color: 0x2ed573, emissive: 0x2ed573, emissiveIntensity: 0.8 });

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

    // 2. Attach SubMeshes
    data.h.forEach(([boneIdx, meshName]) => {
        const mdata = data.m[meshName];
        if (!mdata || !mdata.v || !mdata.i) return;

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(mdata.v, 3));
        geom.setIndex(mdata.i);
        geom.computeVertexNormals();

        const upper = meshName.toUpperCase();
        let mat = bldMat;
        if (upper.includes('HOUSECOLOR') || upper.includes('BANNER')) {
            mat = accentMat;
        } else if (upper.includes('BASE') || upper.includes('CONCRETE') || upper.includes('SLAB') || upper.includes('FOUNDATION') || upper.includes('FENCE')) {
            mat = concreteMat;
        } else if (upper.includes('GLASS') || upper.includes('WINDOW')) {
            mat = glassMat;
        } else if (upper.includes('WIRE') || upper.includes('LADDER') || upper.includes('RAILING') || upper.includes('FAN')) {
            mat = metalMat;
        } else if (upper.includes('BARREL') || upper.includes('GUN') || upper.includes('TURRET') || upper.includes('CANNON') || upper.includes('CYLINDER')) {
            mat = gunMat;
        } else if (upper.includes('GLOW') || upper.includes('NUKE')) {
            mat = nukeMat;
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

    // Ensure defense structures have a turretSystem group
    if (!root.getObjectByName('turretSystem')) {
        const altTurret = root.getObjectByName('TURRET') || root.getObjectByName('TURRET01');
        if (altTurret) altTurret.name = 'turretSystem';
    }

    root.userData.isW3D = true;
    root.scale.set(scale, scale, scale);
    return root;
}
`;

const outputPath = path.join(__dirname, '..', 'src', 'js', '02b_w3d_models.js');
fs.writeFileSync(outputPath, jsOutput, 'utf8');
console.log(`\nSuccessfully exported all assets to: ${outputPath} (${(jsOutput.length / 1024).toFixed(1)} KB)`);
