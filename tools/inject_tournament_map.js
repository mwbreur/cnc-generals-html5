const fs = require('fs');
const path = require('path');

const terrainPath = path.join(__dirname, '..', 'src', 'js', '07_terrain.js');
let content = fs.readFileSync(terrainPath, 'utf8');

// 1. Hook getTerrainHeight
if (!content.includes('getTournamentDesertHeight')) {
    content = content.replace(
        'function getTerrainHeight(x, z) {',
        `function getTerrainHeight(x, z) {
            if (currentMapType === 'tournament_desert' && typeof getTournamentDesertHeight === 'function') {
                return getTournamentDesertHeight(x, z);
            }`
    );
}

// 2. Hook createTerrainTextureForMap
if (!content.includes('createTournamentDesertTexture')) {
    content = content.replace(
        'function createTerrainTextureForMap(mapType) {',
        `function createTerrainTextureForMap(mapType) {
            if (mapType === 'tournament_desert' && typeof createTournamentDesertTexture === 'function') {
                return createTournamentDesertTexture();
            }`
    );
}

// 3. Hook effectiveTheme & atmosphere in setupMapEnvironment
content = content.replace(
    "['desert', 'jungle', 'snow', 'city'].includes(mapType)",
    "['desert', 'jungle', 'snow', 'city', 'tournament_desert'].includes(mapType)"
);
content = content.replace(
    "if (effectiveTheme === 'desert') {",
    "if (effectiveTheme === 'desert' || effectiveTheme === 'tournament_desert') {"
);

// 4. Hook bridges in spawnMapProps
if (!content.includes("spawnBridge(-140, -5.5, 0")) {
    content = content.replace(
        "} else if (currentMapType === 'desert') {",
        `} else if (currentMapType === 'tournament_desert') {
                    spawnBridge(-140, -5.5, 0, 0, 22, 68);
                    spawnBridge(140, -5.5, 0, 0, 22, 68);
                } else if (currentMapType === 'desert') {`
    );
}

// 5. Hook supply docks in createSupplyFieldsForMap
if (!content.includes("currentMapType === 'tournament_desert'")) {
    content = content.replace(
        'function createSupplyFieldsForMap(mapSize) {',
        `function createSupplyFieldsForMap(mapSize) {
            if (currentMapType === 'tournament_desert') {
                const docks = [
                    { x: 0, z: -520, amt: 8800 },
                    { x: 0, z: 520, amt: 8800 },
                    { x: -340, z: -50, amt: 8800 },
                    { x: 340, z: 50, amt: 8800 }
                ];
                docks.forEach(d => {
                    const y = getTerrainHeight(d.x, d.z);
                    spawnSingleSupplyDockAt(new THREE.Vector3(d.x, y, d.z), d.amt);
                });
                return;
            }`
    );
}

fs.writeFileSync(terrainPath, content, 'utf8');
console.log('Successfully hooked Tournament Desert into src/js/07_terrain.js');
