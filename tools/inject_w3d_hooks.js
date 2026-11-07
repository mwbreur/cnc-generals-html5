const fs = require('fs');
const path = require('path');

const unitsFile = path.join(__dirname, '..', 'src', 'js', '03_units.js');
let content = fs.readFileSync(unitsFile, 'utf8');

const hooks = [
    { target: "function createCrusaderTankMesh(isEnemy = false) {", model: "crusader" },
    { target: "function createPaladinTankMesh(isEnemy = false) {", model: "paladin" },
    { target: "function createHumveeMesh(isEnemy = false) {", model: "humvee" },
    { target: "function createAmbulanceMesh() {", model: "ambulance", newSig: "function createAmbulanceMesh(isEnemy = false) {" },
    { target: "function createTomahawkMesh(isEnemy = false) {", model: "tomahawk" },
    { target: "function createUSADozerMesh() {", model: "dozer", newSig: "function createUSADozerMesh(isEnemy = false) {" },
    { target: "function createUSATruckMesh() {", model: "truck", newSig: "function createUSATruckMesh(isEnemy = false) {" },
    { target: "function createChinookMesh() {", model: "chinook", newSig: "function createChinookMesh(isEnemy = false) {" },
    { target: "function createComancheMesh() {", model: "comanche", newSig: "function createComancheMesh(isEnemy = false) {" },
    { target: "function createRaptorMesh() {", model: "raptor", newSig: "function createRaptorMesh(isEnemy = false) {" },
    { target: "function createStealthFighterMesh() {", model: "stealthfighter", newSig: "function createStealthFighterMesh(isEnemy = false) {" },
    { target: "function createAuroraMesh() {", model: "aurora", newSig: "function createAuroraMesh(isEnemy = false) {" },
    { target: "function createBattlemasterTankMesh(isEnemy = false) {", model: "battlemaster" },
    { target: "function createOverlordTankMesh(isEnemy = false) {", model: "overlord" },
    { target: "function createGatlingTankMesh(isEnemy = false) {", model: "gatling" },
    { target: "function createDragonTankMesh(isEnemy = false) {", model: "dragon" },
    { target: "function createTroopCrawlerMesh() {", model: "crawler", newSig: "function createTroopCrawlerMesh(isEnemy = false) {" },
    { target: "function createInfernoCannonMesh() {", model: "inferno", newSig: "function createInfernoCannonMesh(isEnemy = false) {" },
    { target: "function createNukeCannonMesh() {", model: "nukecannon", newSig: "function createNukeCannonMesh(isEnemy = false) {" },
    { target: "function createTechnicalMesh(isEnemy = false) {", model: "technical" },
    { target: "function createScorpionTankMesh(isEnemy = false) {", model: "scorpion" },
    { target: "function createMarauderTankMesh(isEnemy = false) {", model: "marauder" },
    { target: "function createRocketBuggyMesh(isEnemy = false) {", model: "buggy" },
    { target: "function createQuadCannonMesh(isEnemy = false) {", model: "quad" },
    { target: "function createToxinTractorMesh(isEnemy = false) {", model: "toxintractor" },
    { target: "function createBombTruckMesh(isEnemy = false) {", model: "bombtruck" },
    { target: "function createScudLauncherMesh(isEnemy = false) {", model: "scud" },
    { target: "function createRadarVanMesh() {", model: "radarvan", newSig: "function createRadarVanMesh(isEnemy = false) {" }
];

let replaced = 0;
for (const h of hooks) {
    const sig = h.newSig || h.target;
    const injection = `${sig}\n    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['${h.model}']) {\n        return createW3DVehicleMesh('${h.model}', isEnemy);\n    }`;
    if (content.includes(h.target)) {
        content = content.replace(h.target, injection);
        replaced++;
    } else {
        console.warn(`Target not found: ${h.target}`);
    }
}

// Add createMigMesh function if not present
if (!content.includes('function createMigMesh')) {
    content += `\n\nfunction createMigMesh(isEnemy = false) {\n    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['mig']) {\n        return createW3DVehicleMesh('mig', isEnemy);\n    }\n    return createRaptorMesh(isEnemy);\n}\n`;
    replaced++;
}

fs.writeFileSync(unitsFile, content, 'utf8');
console.log(`Successfully injected hooks for ${replaced} vehicle mesh functions in 03_units.js`);
