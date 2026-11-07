/**
 * Automated Verification Test for In-Game Menu / Resume and AI Attack Delay Timers
 */
const fs = require('fs');
const vm = require('vm');

console.log('=== Running Menu Resume & AI Attack Timers Test ===');

// Setup mock DOM & Three.js environment
class MockElement {
    constructor(id = '', tagName = 'div') {
        this.id = id;
        this.tagName = tagName;
        this.style = { display: 'none' };
        this.children = [];
        this.classList = {
            add: (c) => this._classes.add(c),
            remove: (c) => this._classes.delete(c),
            toggle: (c, v) => v ? this._classes.add(c) : this._classes.delete(c),
            contains: (c) => this._classes.has(c)
        };
        this._classes = new Set();
        this.innerHTML = '';
        this.textContent = '';
        this.value = 'medium';
    }
    addEventListener() {}
    removeEventListener() {}
    getContext() {
        return {
            clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {},
            arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, closePath() {},
            save() {}, restore() {}, setLineDash() {}
        };
    }
    appendChild(c) { this.children.push(c); return c; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    closest() { return null; }
}

const elements = {
    'start-menu': new MockElement('start-menu'),
    'ingame-pause-modal': new MockElement('ingame-pause-modal'),
    'start-card': new MockElement('start-card'),
    'resume-game-btn': new MockElement('resume-game-btn'),
    'pause-players-list': new MockElement('pause-players-list'),
    'match-clock': new MockElement('match-clock'),
    'tactical-message': new MockElement('tactical-message'),
    'resource-display': new MockElement('resource-display'),
    'generals-command-bar': new MockElement('generals-command-bar'),
    'cb-squad-container': new MockElement('cb-squad-container'),
    'cb-active-cards-bar': new MockElement('cb-active-cards-bar'),
    'cb-watermark-logo': new MockElement('cb-watermark-logo'),
    'generals-powers-column': new MockElement('generals-powers-column'),
    'btn-repair': new MockElement('btn-repair'),
    'btn-sell': new MockElement('btn-sell')
};

class MockVector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    clone() { return new MockVector3(this.x, this.y, this.z); }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
    normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}

const keyListeners = [];

const mockWindow = {
    addEventListener: (event, handler) => {
        if (event === 'keydown') keyListeners.push(handler);
    },
    removeEventListener: () => {},
    innerWidth: 1920,
    innerHeight: 1080,
    mpSlots: [],
    spSlots: []
};

const mockDocument = {
    getElementById: (id) => elements[id] || new MockElement(id),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => new MockElement('', tag),
    activeElement: null,
    body: { style: { cursor: 'default' } }
};

const mockTHREE = {
    Vector3: MockVector3,
    Vector2: class { constructor(x=0,y=0){this.x=x;this.y=y;} },
    Raycaster: class { setFromCamera(){} intersectObjects(){return [];} },
    LineDashedMaterial: class {},
    BufferGeometry: class { setFromPoints(){return this;} },
    Line: class { constructor(){this.position=new MockVector3();} }
};

// Read assembled files
const code11 = fs.readFileSync('D:/C&C/src/js/11_sidebar.js', 'utf8');
const code13 = fs.readFileSync('D:/C&C/src/js/13_ai.js', 'utf8');

const sandbox = {
    window: mockWindow,
    document: mockDocument,
    THREE: mockTHREE,
    console: console,
    Math: Math,
    Date: Date,
    performance: { now: () => Date.now() },
    selectedFaction: 'usa',
    playerResources: 10000,
    isMultiplayerActive: false,
    isMatchActive: false,
    matchStartTime: 0,
    units: [],
    structures: [],
    enemyUnits: [],
    enemyStructures: [],
    selectedStructure: null,
    selectedSupplyPoint: null,
    blueprintMesh: null,
    pendingSuperweapon: null,
    activeGeneralPower: null,
    attackMoveMode: false,
    guardModeActive: false,
    deselectAll: () => {
        sandbox.units.forEach(u => u.selected = false);
        sandbox.selectedStructure = null;
        sandbox.selectedSupplyPoint = null;
    },
    showNotification: () => {},
    playUSASound: () => {},
    recenterBase: () => {},
    controlGroups: {},
    playerTeamId: 1,
    aiDifficultyLevel: 'medium',
    aiDecisionTimer: 0,
    currentMapSize: 800,
    getTerrainHeight: () => 0,
    getGroundIntersectPoint: () => new MockVector3(),
    isFriendly: (a, b) => {
        const tA = a.teamId !== undefined ? a.teamId : (a.team !== undefined ? a.team : 1);
        const tB = b.teamId !== undefined ? b.teamId : (b.team !== undefined ? b.team : 2);
        return tA === tB;
    },
    getSpawnPointsForMap: () => [
        { id: 1, x: -100, z: -100 },
        { id: 2, x: 100, z: 100 },
        { id: 3, x: -100, z: 100 },
        { id: 4, x: 100, z: -100 }
    ],
    spSlots: [
        { id: 1, name: 'Player (You)', isPlayer: true, isHuman: true, active: true, team: 1, faction: 'usa', spawnId: 1, difficulty: 'medium' },
        { id: 2, name: 'AI Opponent 1', isPlayer: false, isHuman: false, active: true, team: 2, faction: 'china', spawnId: 2, difficulty: 'easy' },
        { id: 3, name: 'AI Opponent 2', isPlayer: false, isHuman: false, active: true, team: 2, faction: 'gla', spawnId: 3, difficulty: 'medium' },
        { id: 4, name: 'AI Opponent 3', isPlayer: false, isHuman: false, active: true, team: 2, faction: 'usa', spawnId: 4, difficulty: 'hard' }
    ]
};
mockWindow.spSlots = sandbox.spSlots;

const ctx = vm.createContext(sandbox);

// Execute modules
vm.runInContext(code11, ctx);
vm.runInContext(code13, ctx);

console.log('✓ Successfully loaded 11_sidebar.js and 13_ai.js in test VM');

// TEST 1: IN-GAME MENU AND RESUME BEHAVIOR
console.log('\n--- Test 1: In-Game Menu & Resume Functionality ---');
sandbox.isMatchActive = true;
sandbox.matchStartTime = Date.now();
elements['start-menu'].style.display = 'none';
elements['ingame-pause-modal'].style.display = 'none';

// Open menu via toggleInGameMenu()
sandbox.toggleInGameMenu();
if (elements['start-menu'].style.display !== 'flex' || elements['ingame-pause-modal'].style.display !== 'flex') {
    throw new Error('Test 1 Failed: toggleInGameMenu did not display pause modal when match is active!');
}
console.log('✓ toggleInGameMenu() opened in-game pause modal while match active');

// Verify player list populated
const tableHtml = elements['pause-players-list'].innerHTML;
if (!tableHtml.includes('Player (You)') || !tableHtml.includes('AI Opponent 1') || !tableHtml.includes('USA') || !tableHtml.includes('CHINA')) {
    throw new Error('Test 1 Failed: Pause modal player list did not render expected players and armies: ' + tableHtml);
}
console.log('✓ In-game pause modal table correctly rendered Player & AI commanders');

// Resume game via resumeGame()
sandbox.resumeGame();
if (elements['start-menu'].style.display !== 'none' || elements['ingame-pause-modal'].style.display !== 'none') {
    throw new Error('Test 1 Failed: resumeGame() did not close the menu!');
}
if (!sandbox.isMatchActive) {
    throw new Error('Test 1 Failed: Match was reset when closing menu!');
}
console.log('✓ resumeGame() cleanly closed modal, match state fully preserved');

// TEST 2: ESCAPE AND TAB KEY NAVIGATION
console.log('\n--- Test 2: Escape and Tab Hotkeys ---');
const triggerKey = (key) => {
    keyListeners.forEach(fn => fn({
        key: key,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        preventDefault: () => {}
    }));
};

// Press Tab while game active: should open in-game menu
triggerKey('Tab');
if (elements['start-menu'].style.display !== 'flex') {
    throw new Error('Test 2 Failed: Tab key did not open in-game menu!');
}
console.log('✓ Tab key opened in-game menu');

// Press Escape while menu is open: should resume game!
triggerKey('Escape');
if (elements['start-menu'].style.display !== 'none') {
    throw new Error('Test 2 Failed: Escape key did not close in-game menu!');
}
console.log('✓ Escape key closed in-game menu and returned to game');

// Select a unit, press Escape: should deselect unit, NOT open menu
sandbox.units = [{
    selected: true,
    health: 500,
    mesh: { position: new MockVector3() },
    targetPosition: new MockVector3()
}];
triggerKey('Escape');
if (sandbox.units[0].selected) {
    throw new Error('Test 2 Failed: Escape did not deselect selected unit!');
}
if (elements['start-menu'].style.display !== 'none') {
    throw new Error('Test 2 Failed: Escape opened menu while units were selected (should only deselect)!');
}
console.log('✓ Escape deselected unit without opening menu');

// Press Escape while completely idle: should open menu
triggerKey('Escape');
if (elements['start-menu'].style.display !== 'flex') {
    throw new Error('Test 2 Failed: Escape while idle did not open in-game menu!');
}
console.log('✓ Escape while idle opened in-game menu');

// Press Escape again: should close menu
triggerKey('Escape');
if (elements['start-menu'].style.display !== 'none') {
    throw new Error('Test 2 Failed: Escape did not close open menu!');
}
console.log('✓ Escape toggled menu closed');

// TEST 3: AI ATTACK DELAY TIMERS (Easy 5m / Medium 3m / Hard 2m)
console.log('\n--- Test 3: AI Attack Timers (Easy 5m, Medium 3m, Hard 2m) ---');

// Initialize AI commanders
sandbox.initAICommanders();
const commanders = sandbox.window.aiCommanders || sandbox.aiCommanders;
console.log(`Initialized ${Object.keys(commanders).length} AI commanders`);

// Verify difficulty assignment
const easyCmd = commanders['ai_2'];
const medCmd = commanders['ai_3'];
const hardCmd = commanders['ai_4'];

if (!easyCmd || easyCmd.difficulty !== 'easy') throw new Error('AI 2 is not easy!');
if (!medCmd || medCmd.difficulty !== 'medium') throw new Error('AI 3 is not medium!');
if (!hardCmd || hardCmd.difficulty !== 'hard') throw new Error('AI 4 is not hard!');

console.log('✓ Commanders registered with respective difficulties: Easy, Medium, Hard');

// Add discovered player base to all AI commanders
const playerBasePos = new MockVector3(-100, 0, -100);
[easyCmd, medCmd, hardCmd].forEach(c => {
    c.discoveredEnemyBases.push({
        position: playerBasePos.clone(),
        faction: 'usa',
        teamId: 1
    });
    c.discoveredEnemyTargets.push({
        netId: 'TARGET_BASE_1',
        position: playerBasePos.clone(),
        type: 'center',
        teamId: 1,
        isStructure: true
    });
});

sandbox.hostileStructures = [{
    netId: 'TARGET_BASE_1',
    position: playerBasePos,
    health: 2000,
    teamId: 1
}];
sandbox.structures = sandbox.hostileStructures;

// Create combat units for each commander
const makeUnit = (ownerId, x, z) => ({
    ownerId: ownerId,
    teamId: 2,
    health: 400,
    scanRange: 15,
    isScout: false,
    combatTarget: null,
    mesh: { position: new MockVector3(x, 0, z) },
    targetPosition: new MockVector3(x, 0, z)
});

sandbox.enemyUnits = [
    makeUnit('ai_2', 100, 100), // Easy scout
    makeUnit('ai_2', 105, 105), // Easy combat tank
    makeUnit('ai_3', -100, 100), // Medium scout
    makeUnit('ai_3', -95, 105),  // Medium combat tank
    makeUnit('ai_4', 100, -100), // Hard scout
    makeUnit('ai_4', 105, -95)   // Hard combat tank
];

// Helper to simulate time passage and AI tick
const simulateAITick = (elapsedSeconds) => {
    const fixedNow = 1000000000;
    sandbox.Date.now = () => fixedNow;
    sandbox.matchStartTime = fixedNow - (elapsedSeconds * 1000);
    [easyCmd, medCmd, hardCmd].forEach(c => {
        c.matchStartTime = sandbox.matchStartTime;
    });
    sandbox.aiDecisionTimer = 100; // Force decision execution
    sandbox.processEnemyAIEngine();
};

// Scenario A: At 60 seconds (1 minute in) - ALL AIs should be holding defense, NO attacks launched!
simulateAITick(60);
const unitEasy = sandbox.enemyUnits[1]; // Combat tank
const unitMed = sandbox.enemyUnits[3];  // Combat tank
const unitHard = sandbox.enemyUnits[5]; // Combat tank

if (unitEasy.combatTarget || unitEasy.targetPosition.distanceTo(playerBasePos) < 50) {
    throw new Error('Easy AI attacked at 60s! Delay is 300s.');
}
if (unitMed.combatTarget || unitMed.targetPosition.distanceTo(playerBasePos) < 50) {
    throw new Error('Medium AI attacked at 60s! Delay is 180s.');
}
if (unitHard.combatTarget || unitHard.targetPosition.distanceTo(playerBasePos) < 50) {
    throw new Error('Hard AI attacked at 60s! Delay is 120s.');
}
console.log('✓ At 60s (1m): Easy (5m), Medium (3m), Hard (2m) all holding base defense, offensive suppressed');

// Scenario B: At 125 seconds (~2.1 minutes in) - Hard AI (120s threshold) should ATTACK, Easy & Medium still HOLD!
simulateAITick(125);
if (unitEasy.combatTarget || unitEasy.targetPosition.distanceTo(playerBasePos) < 50) {
    throw new Error('Easy AI attacked at 125s! Should hold until 300s.');
}
if (unitMed.combatTarget || unitMed.targetPosition.distanceTo(playerBasePos) < 50) {
    throw new Error('Medium AI attacked at 125s! Should hold until 180s.');
}
if (!unitHard.combatTarget && unitHard.targetPosition.distanceTo(playerBasePos) > 50) {
    throw new Error('Hard AI failed to attack after 120s expired!');
}
console.log('✓ At 125s (2m 5s): Hard AI unlocked and launched offensive attack wave! Easy and Medium holding defense.');

// Scenario C: At 185 seconds (~3.1 minutes in) - Medium AI (180s threshold) should now ALSO ATTACK! Easy still holds.
simulateAITick(185);
if (unitEasy.combatTarget || unitEasy.targetPosition.distanceTo(playerBasePos) < 50) {
    throw new Error('Easy AI attacked at 185s! Should hold until 300s.');
}
if (!unitMed.combatTarget && unitMed.targetPosition.distanceTo(playerBasePos) > 50) {
    throw new Error('Medium AI failed to attack after 180s expired!');
}
console.log('✓ At 185s (3m 5s): Medium AI unlocked and launched offensive assault! Easy AI still holding defense.');

// Scenario D: At 305 seconds (~5.1 minutes in) - Easy AI (300s threshold) should now FINALLY ATTACK!
simulateAITick(305);
if (!unitEasy.combatTarget && unitEasy.targetPosition.distanceTo(playerBasePos) > 50) {
    throw new Error('Easy AI failed to attack after 300s expired!');
}
console.log('✓ At 305s (5m 5s): Easy AI unlocked and launched offensive attack wave!');

console.log('\n======================================================');
console.log('✓ ALL TESTS PASSED: In-Game Menu, Esc/Tab, and AI Attack Delays verified!');
console.log('======================================================');
