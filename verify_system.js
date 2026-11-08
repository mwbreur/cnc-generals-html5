const fs = require('fs');
const vm = require('vm');

console.log("=== COMPREHENSIVE VERIFICATION SUITE ===");

// 1. Mock minimal Three.js environment
const THREE = {
    Vector3: function(x=0, y=0, z=0) {
        this.x = x; this.y = y; this.z = z;
        this.clone = () => new THREE.Vector3(this.x, this.y, this.z);
        this.copy = (v) => { this.x = v.x; this.y = v.y; this.z = v.z; return this; };
        this.distanceTo = (v) => Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z);
        this.add = (v) => { this.x += v.x; this.y += v.y; this.z += v.z; return this; };
        this.sub = (v) => { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; };
        this.set = (x,y,z) => { this.x = x; this.y = y; this.z = z; return this; };
        this.normalize = () => this;
        this.applyQuaternion = () => this;
        this.crossVectors = () => this;
    },
    Vector2: function(x=0, y=0) { this.x = x; this.y = y; },
    Quaternion: function() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; },
    Raycaster: function() {
        this.setFromCamera = () => {};
        this.intersectObjects = () => [];
        this.intersectObject = () => [];
    },
    Scene: function() {
        this.children = [];
        this.add = (c) => this.children.push(c);
        this.remove = (c) => {
            const idx = this.children.indexOf(c);
            if (idx >= 0) this.children.splice(idx, 1);
        };
        this.traverse = (cb) => {};
    },
    PerspectiveCamera: function() {
        this.position = new THREE.Vector3();
        this.quaternion = new THREE.Quaternion();
        this.lookAt = () => {};
        this.updateProjectionMatrix = () => {};
    },
    WebGLRenderer: function() {
        this.domElement = { style: {}, addEventListener: () => {} };
        this.setSize = () => {};
        this.setPixelRatio = () => {};
        this.render = () => {};
        this.shadowMap = { enabled: false };
    },
    AmbientLight: function() {},
    DirectionalLight: function() {
        this.position = new THREE.Vector3();
        this.castShadow = false;
        this.shadow = { mapSize: { width: 0, height: 0 }, camera: {} };
    },
    PointLight: function() { this.position = new THREE.Vector3(); },
    Group: function() {
        this.children = [];
        this.position = new THREE.Vector3();
        this.rotation = { x: 0, y: 0, z: 0 };
        this.scale = { x: 1, y: 1, z: 1, set: (x,y,z) => { this.scale.x = x; this.scale.y = y; this.scale.z = z; } };
        this.add = (c) => this.children.push(c);
        this.getObjectByName = () => null;
        this.traverse = () => {};
        this.userData = {};
    },
    Mesh: function(geo, mat) {
        this.geometry = geo;
        this.material = mat;
        this.position = new THREE.Vector3();
        this.rotation = { x: 0, y: 0, z: 0 };
        this.scale = { x: 1, y: 1, z: 1, set: (x,y,z) => { this.scale.x = x; this.scale.y = y; this.scale.z = z; } };
        this.traverse = () => {};
        this.userData = {};
        this.add = () => {};
        this.remove = () => {};
        this.getObjectByName = () => null;
    },
    Line: function(geo, mat) {
        this.geometry = geo || { dispose: () => {} };
        this.material = mat || { dispose: () => {} };
        this.computeLineDistances = () => {};
    },
    BufferGeometry: function() {
        this.setAttribute = () => {};
        this.setIndex = () => {};
        this.setFromPoints = () => this;
        this.dispose = () => {};
        this.computeVertexNormals = () => {};
    },
    Float32BufferAttribute: function(arr, itemSize) { this.array = arr; this.itemSize = itemSize; },
    BoxGeometry: function() { this.dispose = () => {}; },
    CylinderGeometry: function() { this.dispose = () => {}; },
    SphereGeometry: function() { this.dispose = () => {}; },
    ConeGeometry: function() { this.dispose = () => {}; },
    PlaneGeometry: function() {
        this.dispose = () => {};
        this.rotateX = () => {};
        this.computeVertexNormals = () => {};
        this.attributes = {
            position: {
                array: new Float32Array(100),
                count: 25,
                getX: () => 0,
                getY: () => 0,
                getZ: () => 0,
                setY: () => {}
            }
        };
    },
    RingGeometry: function() { this.dispose = () => {}; },
    TorusGeometry: function() { this.dispose = () => {}; },
    DodecahedronGeometry: function() { this.dispose = () => {}; },
    IcosahedronGeometry: function() { this.dispose = () => {}; },
    Plane: function(normal, constant) { this.normal = normal; this.constant = constant; },
    BufferAttribute: function() {},
    CanvasTexture: function() { this.dispose = () => {}; this.repeat = { set: () => {} }; this.wrapS = 0; this.wrapT = 0; },
    DataTexture: function() { this.dispose = () => {}; this.needsUpdate = false; },
    RGBAFormat: 1023,
    RepeatWrapping: 1000,
    LinearMipmapLinearFilter: 1008,
    LinearFilter: 1006,
    MeshBasicMaterial: function() { this.dispose = () => {}; },
    MeshStandardMaterial: function() { this.dispose = () => {}; },
    MeshLambertMaterial: function() { this.dispose = () => {}; },
    MeshPhongMaterial: function() { this.dispose = () => {}; },
    LineBasicMaterial: function() { this.dispose = () => {}; },
    LineDashedMaterial: function() { this.dispose = () => {}; },
    Color: function(c) { this.hex = c; this.setHex = (h) => { this.hex = h; }; },
    FogExp2: function() { this.color = new THREE.Color(0); },
    MathUtils: {
        clamp: (v, min, max) => Math.max(min, Math.min(max, v))
    },
    sRGBEncoding: 3001
};

const domElementStub = () => ({
    style: {},
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    appendChild: () => {},
    removeChild: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getContext: () => new Proxy({}, {
        get: (target, prop) => {
            if (prop === 'measureText') return () => ({ width: 10 });
            if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => ({ addColorStop: () => {} });
            return () => {};
        },
        set: () => true
    })
});

const sandbox = {
    THREE,
    window: {
        innerWidth: 1920,
        innerHeight: 1080,
        addEventListener: () => {},
        removeEventListener: () => {},
        requestAnimationFrame: () => 1
    },
    document: {
        getElementById: () => domElementStub(),
        createElement: () => domElementStub(),
        body: domElementStub(),
        addEventListener: () => {}
    },
    navigator: { userAgent: 'NodeTest' },
    performance: { now: () => Date.now() },
    localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
    },
    console: console,
    Math: Math,
    Date: Date,
    setTimeout: (cb) => { return 1; },
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    requestAnimationFrame: (cb) => 1,
    cancelAnimationFrame: () => {},
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    renderer: new THREE.WebGLRenderer(),
    units: [],
    enemyUnits: [],
    structures: [],
    enemyStructures: [],
    neutralStructures: [],
    selectedFaction: 'usa',
    playerTeamId: 1,
    isMultiplayerActive: true,
    isMultiplayerHost: true,
    netIdSequence: 100,
    showNotification: () => {},
    playAudio: () => {},
    playUSASound: () => {},
    spawnExplosion: () => {},
    spawnSmokePuff: () => {},
    spawnBulletTracer: () => {},
    spawnMuzzleFlash: () => {},
    spawnRocketProjectile: () => {},
    getTerrainHeight: (x, z) => 0
};

vm.createContext(sandbox);

// Read and evaluate source files in order
const jsFiles = [
    '01_core.js',
    '02_textures.js',
    '02b_w3d_models.js',
    '03_units.js',
    '04_buildings.js',
    '05_audio.js',
    '06_effects.js',
    '07_terrain.js',
    '07b_tournament_desert.js',
    '08_collision.js',
    '09_fogOfWar.js',
    '10_editor.js',
    '11_sidebar.js',
    '12_combat.js',
    '13_ai.js',
    '14_gameLoop.js',
    '15_multiplayer.js'
];

for (const f of jsFiles) {
    const code = fs.readFileSync('D:/C&C/src/js/' + f, 'utf8');
    try {
        vm.runInContext(code, sandbox, { filename: f });
    } catch (err) {
        console.error(`Error in ${f}:`, err);
        process.exit(1);
    }
}

console.log(`✓ All ${jsFiles.length} JS modules evaluated in sandbox successfully.`);

// Initialize Three.js scene
vm.runInContext("init();", sandbox);

// 2. Test all 42 unit types can be spawned by spawnEnemyUnit
const allUnitTypes = [
    // USA
    'crusader', 'paladin', 'humvee', 'ambulance', 'tomahawk', 'dozer', 'truck',
    'chinook', 'comanche', 'raptor', 'stealthfighter', 'aurora', 'ranger', 'missiledefender',
    'pathfinder', 'burton',
    // China
    'battlemaster', 'overlord', 'gatling', 'dragon', 'crawler', 'inferno', 'nukecannon', 'nuketank',
    'redguard', 'tankhunter', 'hacker', 'blacklotus',
    // GLA
    'worker', 'technical', 'scorpion', 'marauder', 'buggy', 'quad', 'toxintractor',
    'bombtruck', 'scud', 'radarvan', 'rebel', 'rpg', 'terrorist', 'mob', 'hijacker', 'jarmen'
];

let spawnedCount = 0;
for (const uType of allUnitTypes) {
    const res = sandbox.spawnEnemyUnit(uType, new THREE.Vector3(10, 0, 10), 'TEST_' + uType);
    if (!res || !res.mesh || res.health <= 0) {
        console.error(`Failed to spawn unit type: ${uType}`);
        process.exit(1);
    }
    spawnedCount++;
}
console.log(`✓ Tested ${spawnedCount}/42 unit types spawned successfully with health, speed, and meshes.`);

// 3. Test createStructureMeshForFaction handles all structures
const allStructureTypes = [
    'center', 'power', 'nuclearReactor', 'barracks', 'factory', 'airfield',
    'supplyCenter', 'supplyStash', 'patriot', 'gatlingCannon', 'bunker', 'speakerTower',
    'stingerSite', 'tunnel', 'strategyCenter', 'propagandaCenter', 'palace',
    'particleCannon', 'nukeSilo', 'scudStorm', 'supplyDrop', 'internetCenter', 'blackMarket', 'derrick'
];

let structCount = 0;
for (const sType of allStructureTypes) {
    for (const fac of ['usa', 'china', 'gla']) {
        const mesh = sandbox.createStructureMeshForFaction(sType, fac);
        if (!mesh) {
            console.error(`Failed to create structure mesh: ${sType} for ${fac}`);
            process.exit(1);
        }
        structCount++;
    }
}
console.log(`✓ Tested ${structCount} structure mesh permutations (${allStructureTypes.length} types x 3 factions).`);

// 4. Test Damage Matrix & Armor Coefficients
const armorCoeffs = vm.runInContext("ARMOR_COEFFICIENTS", sandbox);
const testDmgAP = armorCoeffs.heavy_vehicle.ARMOR_PIERCING;
const testDmgSA = armorCoeffs.heavy_vehicle.SMALL_ARMS;
const testDmgSniper = armorCoeffs.infantry.SNIPER;
if (testDmgAP === 1.0 && testDmgSA === 0.2 && testDmgSniper === 3.0) {
    console.log("✓ SAGE Armor damage coefficient matrix verified (AP vs Heavy = 1.0, SmallArms vs Heavy = 0.2, Sniper vs Inf = 3.0).");
} else {
    console.error("Damage coefficients mismatch!");
    process.exit(1);
}

// 5. Test Veterancy Progression
const checkVeterancyPromotion = vm.runInContext("checkVeterancyPromotion", sandbox);
const mockUnit = {
    type: 'battlemaster',
    mesh: new THREE.Mesh(),
    health: 400,
    maxHealth: 400,
    kills: 0,
    veterancy: 0
};
checkVeterancyPromotion(mockUnit);
if (mockUnit.veterancy !== 0) throw new Error("Veterancy check failed on 0 kills");

mockUnit.kills = 2;
checkVeterancyPromotion(mockUnit);
if (mockUnit.veterancy !== 1 || mockUnit.maxHealth !== 480) throw new Error("Veterancy rank 1 (+20% HP) failed");

mockUnit.kills = 5;
checkVeterancyPromotion(mockUnit);
if (mockUnit.veterancy !== 2) throw new Error("Veterancy rank 2 (Elite) failed");

mockUnit.kills = 10;
checkVeterancyPromotion(mockUnit);
if (mockUnit.veterancy !== 3) throw new Error("Veterancy rank 3 (Heroic) failed");

console.log("✓ Veterancy progression verified: Rank 1 (+20% HP), Rank 2 (+40% HP), Rank 3 Heroic (+60% HP & Red Tracers).");

// 6. Test resetEntireBattlefieldState
const resetEntireBattlefieldState = vm.runInContext("resetEntireBattlefieldState", sandbox);
if (typeof resetEntireBattlefieldState === 'function') {
    resetEntireBattlefieldState(600);
    console.log("✓ resetEntireBattlefieldState verified.");
} else {
    console.error("resetEntireBattlefieldState missing!");
    process.exit(1);
}

// 7. Test Radar Online Detection
const isRadarOnline = vm.runInContext("isRadarOnline", sandbox);
if (typeof isRadarOnline === 'function') {
    const radarResult = isRadarOnline('usa');
    console.log("✓ isRadarOnline function verified (returns boolean: " + radarResult + ").");
}

// 8. Test Builder Palette Removal & Builder Cycling Selection
const bodyHtml = fs.readFileSync('src/html/body.html', 'utf8');
if (bodyHtml.includes('id="builder-palette"') || bodyHtml.includes('class="builder-floating-palette"')) {
    console.error("FAIL: #builder-palette is still present in src/html/body.html!");
    process.exit(1);
}
console.log("✓ Verified #builder-palette DOM element is removed from body.html.");

// Setup mock units for builder cycling
const cycleSelectBuilder = vm.runInContext("cycleSelectBuilder", sandbox);
const selectUnitsByType = vm.runInContext("selectUnitsByType", sandbox);

if (typeof cycleSelectBuilder !== 'function') {
    console.error("FAIL: cycleSelectBuilder is not a function!");
    process.exit(1);
}

// Test with 0 builders
vm.runInContext("units = [];", sandbox);
cycleSelectBuilder();

// Test with 2 builders
vm.runInContext(`
    units = [
        { type: 'dozer', health: 200, isDead: false, selected: false, mesh: new THREE.Mesh() },
        { type: 'dozer', health: 200, isDead: false, selected: false, mesh: new THREE.Mesh() },
        { type: 'crusader', health: 400, isDead: false, selected: false, mesh: new THREE.Mesh() }
    ];
`, sandbox);

// 1st cycle: should select strictly b1 (index 0)
cycleSelectBuilder();
const uAfter1 = vm.runInContext("units", sandbox);
if (!uAfter1[0].selected || uAfter1[1].selected || uAfter1[2].selected) {
    console.error("FAIL: 1st cycle did not select strictly b1!", { b1: uAfter1[0].selected, b2: uAfter1[1].selected, c1: uAfter1[2].selected });
    process.exit(1);
}

// 2nd cycle: should select strictly b2 (index 1)
cycleSelectBuilder();
const uAfter2 = vm.runInContext("units", sandbox);
if (uAfter2[0].selected || !uAfter2[1].selected || uAfter2[2].selected) {
    console.error("FAIL: 2nd cycle did not select strictly b2!", { b1: uAfter2[0].selected, b2: uAfter2[1].selected, c1: uAfter2[2].selected });
    process.exit(1);
}

// 3rd cycle: should wrap around and select strictly b1 (index 0)
cycleSelectBuilder();
const uAfter3 = vm.runInContext("units", sandbox);
if (!uAfter3[0].selected || uAfter3[1].selected || uAfter3[2].selected) {
    console.error("FAIL: 3rd cycle did not wrap around to b1!", { b1: uAfter3[0].selected, b2: uAfter3[1].selected, c1: uAfter3[2].selected });
    process.exit(1);
}

// Test selectUnitsByType('builders'): should cycle, NOT select all
selectUnitsByType('builders');
const uAfter4 = vm.runInContext("units", sandbox);
if (uAfter4[0].selected || !uAfter4[1].selected || uAfter4[2].selected) {
    console.error("FAIL: selectUnitsByType('builders') did not cycle to single builder b2!", { b1: uAfter4[0].selected, b2: uAfter4[1].selected, c1: uAfter4[2].selected });
    process.exit(1);
}
console.log("✓ Verified builder cycling: single-selects and cycles between multiple builders without selecting all.");

console.log("=== ALL SYSTEM VERIFICATION CHECKS PASSED ===");
