const fs = require('fs');
const path = require('path');

const buildingsFile = path.join(__dirname, '..', 'src', 'js', '04_buildings.js');
let content = fs.readFileSync(buildingsFile, 'utf8');

const hooks = [
    // USA
    { target: "function createUSACommandCenter() {", key: "usa_commandCenter", newSig: "function createUSACommandCenter(isEnemy = false) {" },
    { target: "function createUSAColdFusionReactor() {", key: "usa_power", newSig: "function createUSAColdFusionReactor(isEnemy = false) {" },
    { target: "function createUSABarracks() {", key: "usa_barracks", newSig: "function createUSABarracks(isEnemy = false) {" },
    { target: "function createUSAWarFactory() {", key: "usa_factory", newSig: "function createUSAWarFactory(isEnemy = false) {" },
    { target: "function createUSASupplyCenter() {", key: "usa_supplyCenter", newSig: "function createUSASupplyCenter(isEnemy = false) {" },
    { target: "function createUSASupplyDropZone() {", key: "usa_supplyDrop", newSig: "function createUSASupplyDropZone(isEnemy = false) {" },
    { target: "function createUSAAirfield() {", key: "usa_airfield", newSig: "function createUSAAirfield(isEnemy = false) {" },
    { target: "function createUSAStrategyCenter() {", key: "usa_strategyCenter", newSig: "function createUSAStrategyCenter(isEnemy = false) {" },
    { target: "function createUSAPatriotSystem() {", key: "usa_patriot", newSig: "function createUSAPatriotSystem(isEnemy = false) {" },
    { target: "function createUSAParticleCannon() {", key: "usa_particleCannon", newSig: "function createUSAParticleCannon(isEnemy = false) {" },
    { target: "function createUSADetentionCamp() {", key: "usa_detentionCamp", newSig: "function createUSADetentionCamp(isEnemy = false) {" },

    // China
    { target: "function createChinaCommandCenter() {", key: "china_commandCenter", newSig: "function createChinaCommandCenter(isEnemy = false) {" },
    { target: "function createChinaNuclearReactor() {", key: "china_power", newSig: "function createChinaNuclearReactor(isEnemy = false) {" },
    { target: "function createChinaBarracks() {", key: "china_barracks", newSig: "function createChinaBarracks(isEnemy = false) {" },
    { target: "function createChinaWarFactory() {", key: "china_factory", newSig: "function createChinaWarFactory(isEnemy = false) {" },
    { target: "function createChinaGatlingCannon() {", key: "china_gatlingCannon", newSig: "function createChinaGatlingCannon(isEnemy = false) {" },
    { target: "function createChinaBunker() {", key: "china_bunker", newSig: "function createChinaBunker(isEnemy = false) {" },
    { target: "function createChinaSpeakerTower() {", key: "china_speakerTower", newSig: "function createChinaSpeakerTower(isEnemy = false) {" },
    { target: "function createChinaNukeSilo() {", key: "china_nukeSilo", newSig: "function createChinaNukeSilo(isEnemy = false) {" },
    { target: "function createChinaSupplyCenter() {", key: "china_supplyCenter", newSig: "function createChinaSupplyCenter(isEnemy = false) {" },
    { target: "function createChinaAirfield() {", key: "china_airfield", newSig: "function createChinaAirfield(isEnemy = false) {" },
    { target: "function createChinaPropagandaCenter() {", key: "china_propagandaCenter", newSig: "function createChinaPropagandaCenter(isEnemy = false) {" },
    { target: "function createChinaInternetCenter() {", key: "china_internetCenter", newSig: "function createChinaInternetCenter(isEnemy = false) {" },

    // GLA
    { target: "function createGLACommandCenter() {", key: "gla_commandCenter", newSig: "function createGLACommandCenter(isEnemy = false) {" },
    { target: "function createGLABarracks(isFake = false) {", key: "gla_barracks", newSig: "function createGLABarracks(isFake = false, isEnemy = false) {" },
    { target: "function createGLAArmsDealer(isFake = false) {", key: "gla_factory", newSig: "function createGLAArmsDealer(isFake = false, isEnemy = false) {" },
    { target: "function createGLASupplyStash() {", key: "gla_supplyCenter", newSig: "function createGLASupplyStash(isEnemy = false) {" },
    { target: "function createGLABlackMarket() {", key: "gla_blackMarket", newSig: "function createGLABlackMarket(isEnemy = false) {" },
    { target: "function createGLATunnelNetwork() {", key: "gla_tunnel", newSig: "function createGLATunnelNetwork(isEnemy = false) {" },
    { target: "function createGLAStingerSite() {", key: "gla_stingerSite", newSig: "function createGLAStingerSite(isEnemy = false) {" },
    { target: "function createGLAPalace() {", key: "gla_palace", newSig: "function createGLAPalace(isEnemy = false) {" },
    { target: "function createGLAScudStorm() {", key: "gla_scudStorm", newSig: "function createGLAScudStorm(isEnemy = false) {" },
    { target: "function createGLAHoleMesh() {", key: "gla_hole", newSig: "function createGLAHoleMesh(isEnemy = false) {" },

    // Tech
    { target: "function createTechOilDerrickMesh() {", key: "tech_oilDerrick", newSig: "function createTechOilDerrickMesh(isEnemy = false) {" },
    { target: "function createTechHospitalMesh() {", key: "tech_hospital", newSig: "function createTechHospitalMesh(isEnemy = false) {" },
    { target: "function createTechRefineryMesh() {", key: "tech_refinery", newSig: "function createTechRefineryMesh(isEnemy = false) {" }
];

let replaced = 0;
for (const h of hooks) {
    const sig = h.newSig || h.target;
    const injection = `${sig}\n    if (typeof createW3DBuildingMesh === 'function' && window.W3D_BUILDING_DATA && window.W3D_BUILDING_DATA['${h.key}']) {\n        return createW3DBuildingMesh('${h.key}', isEnemy);\n    }`;
    if (content.includes(h.target)) {
        content = content.replace(h.target, injection);
        replaced++;
    } else {
        console.warn(`Target not found: ${h.target}`);
    }
}

fs.writeFileSync(buildingsFile, content, 'utf8');
console.log(`Successfully injected hooks for ${replaced} building functions in 04_buildings.js`);
