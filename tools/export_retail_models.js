const fs = require('fs');
const path = require('path');
const { parseW3dModel } = require('./parse_w3d_clean');

const MODEL_MAP = {
    // USA
    'crusader':       { file: 'avleopard.W3D',   scale: 0.115, faction: 'usa' },
    'paladin':        { file: 'avPaladin.W3D',    scale: 0.115, faction: 'usa' },
    'humvee':         { file: 'AvHummer.W3D',     scale: 0.105, faction: 'usa' },
    'ambulance':      { file: 'AvAmbulance.W3D',  scale: 0.110, faction: 'usa' },
    'tomahawk':       { file: 'avtomahawk.W3D',   scale: 0.115, faction: 'usa' },
    'dozer':          { file: 'avconstdoz.W3D',   scale: 0.110, faction: 'usa' },
    'chinook':        { file: 'AVChinook.W3D',    scale: 0.105, faction: 'usa' },
    'comanche':       { file: 'AVComanche.W3D',   scale: 0.090, faction: 'usa' },
    'raptor':         { file: 'avraptor.W3D',     scale: 0.110, faction: 'usa' },
    'stealthfighter': { file: 'avstealth.W3D',    scale: 0.110, faction: 'usa' },
    'aurora':         { file: 'AVAurora.W3D',     scale: 0.105, faction: 'usa' },

    // China
    'battlemaster':   { file: 'NVBtMstr.W3D',     scale: 0.115, faction: 'china' },
    'overlord':       { file: 'NVOvrlrd.W3D',     scale: 0.125, faction: 'china' },
    'gatling':        { file: 'NVGattTank.W3D',   scale: 0.110, faction: 'china' },
    'dragon':         { file: 'NVDragon.W3D',     scale: 0.115, faction: 'china' },
    'crawler':        { file: 'NVTCrawler.W3D',   scale: 0.115, faction: 'china' },
    'inferno':        { file: 'NVInferno.W3D',    scale: 0.115, faction: 'china' },
    'nukecannon':     { file: 'NVNukeCn.W3D',     scale: 0.110, faction: 'china' },
    'truck':          { file: 'NVSSupplyTk.W3D',  scale: 0.110, faction: 'china' },
    'mig':            { file: 'NVMig.W3D',        scale: 0.110, faction: 'china' },

    // GLA
    'scorpion':       { file: 'UVLiteTank.W3D',   scale: 0.115, faction: 'gla' },
    'marauder':       { file: 'UVMarauder.W3D',   scale: 0.115, faction: 'gla' },
    'technical':      { file: 'UVTechTrck.W3D',   scale: 0.105, faction: 'gla' },
    'quad':           { file: 'UVQuadCann.W3D',   scale: 0.110, faction: 'gla' },
    'buggy':          { file: 'UVRockBug.W3D',    scale: 0.100, faction: 'gla' },
    'toxintractor':   { file: 'UVToxinTrk.W3D',   scale: 0.110, faction: 'gla' },
    'bombtruck':      { file: 'UVBmbtruk.W3D',    scale: 0.110, faction: 'gla' },
    'scud':           { file: 'UVScudLchr.W3D',   scale: 0.115, faction: 'gla' },
    'radarvan':       { file: 'UVRadarVan.W3D',   scale: 0.110, faction: 'gla' }
};

const w3dDir = path.join(__dirname, '..', 'extracted_assets', 'w3d');
const exportData = {};

let totalVerts = 0;
let totalTris = 0;

for (const [key, cfg] of Object.entries(MODEL_MAP)) {
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
        totalVerts += mData.v.length / 3;
        totalTris += mData.i.length / 3;
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

    exportData[key] = {
        f: cfg.faction,
        s: cfg.scale,
        p: compactPivots,
        h: filteredHlod.map(h => [h.boneIndex, h.name]),
        m: filteredMeshes
    };
}

const jsonString = JSON.stringify(exportData);

const jsOutput = `/**
 * Command & Conquer: Generals Authentic Westwood 3D Retail Vehicle Models
 * Extracted from official EA retail archives (W3D.big)
 * Coordinate transformed to Three.js standard Y-up with pivot bone hierarchy.
 */

window.W3D_VEHICLE_DATA = ${jsonString};

/**
 * Creates an authentic Westwood 3D vehicle mesh with pivot hierarchy.
 * Automatically wires:
 *  - TURRET01 -> "turretSystem" (combat targeting rotation)
 *  - BARREL01 -> "barrelSystem" / "gatlingBarrels" (weapon elevation & spin)
 *  - ROTOR01 / PROPELLER01 -> "comanche_rotor" / "chinook_rotor1"
 *  - PROPELLER02 -> "chinook_rotor2"
 *  - RADAR / RADARDISH01 -> "radarDish"
 *  - LASER -> "pointDefenseLaser"
 *  - HOUSECOLOR* -> faction / player accent materials
 *  - TREAD* -> tread materials
 */
function createW3DVehicleMesh(modelKey, isEnemy = false, fallbackFn = null) {
    if (!window.W3D_VEHICLE_DATA || !window.W3D_VEHICLE_DATA[modelKey]) {
        if (typeof fallbackFn === 'function') return fallbackFn(isEnemy);
        return new THREE.Group();
    }

    const data = window.W3D_VEHICLE_DATA[modelKey];
    const faction = data.f;
    const scale = data.s || 0.12;

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

        // Standardize dynamic animation and combat hooks
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

    // 2. Build and attach SubMeshes
    data.h.forEach(([boneIdx, meshName]) => {
        const mdata = data.m[meshName];
        if (!mdata || !mdata.v || !mdata.i) return;

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(mdata.v, 3));
        geom.setIndex(mdata.i);
        geom.computeVertexNormals();

        // Assign proper authentic material
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

    // Ensure unit has a turretSystem group if one exists in child hierarchy
    if (!root.getObjectByName('turretSystem')) {
        const altTurret = root.getObjectByName('TURRET01') || root.getObjectByName('TURRET');
        if (altTurret) altTurret.name = 'turretSystem';
    }

    // Aircraft configuration
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

    // Specialized unit accessories
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

    // Apply scaling
    root.scale.set(scale, scale, scale);
    return root;
}
`;

const outputPath = path.join(__dirname, '..', 'src', 'js', '02b_w3d_models.js');
fs.writeFileSync(outputPath, jsOutput, 'utf8');
console.log(`\nSuccessfully updated: ${outputPath} (${(jsOutput.length / 1024).toFixed(1)} KB)`);
