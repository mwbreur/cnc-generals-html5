const fs = require('fs');
let c = fs.readFileSync('D:/C&C/src/js/08_collision.js', 'utf8');

const target = "            group.position.copy(pos);\n            group.rotation.y = rotationY || 0;";
const targetCRLF = "            group.position.copy(pos);\r\n            group.rotation.y = rotationY || 0;";

const replacement = `            const footprint = getStructureFootprint(type);
            const radius = footprint.radius || 4.0;

            // Sample terrain height across foundation footprint to set optimal deck level
            const hCenter = (typeof getTerrainHeight === 'function') ? getTerrainHeight(pos.x, pos.z) : pos.y;
            const hN = (typeof getTerrainHeight === 'function') ? getTerrainHeight(pos.x, pos.z - radius * 0.7) : pos.y;
            const hS = (typeof getTerrainHeight === 'function') ? getTerrainHeight(pos.x, pos.z + radius * 0.7) : pos.y;
            const hE = (typeof getTerrainHeight === 'function') ? getTerrainHeight(pos.x + radius * 0.7, pos.z) : pos.y;
            const hW = (typeof getTerrainHeight === 'function') ? getTerrainHeight(pos.x - radius * 0.7, pos.z) : pos.y;
            const deckY = Math.max(hCenter, hN, hS, hE, hW) + 0.05;

            pos.y = deckY;
            group.position.copy(pos);
            group.rotation.y = rotationY || 0;

            // Level terrain heightmap under building footprint
            if (typeof registerFlattenedFootprint === 'function') {
                registerFlattenedFootprint(pos.x, pos.z, radius * 1.15, deckY);
            }

            // Concrete foundation skirt slab extending downward to ground level to eliminate any gaps on slopes
            const skirtGeom = new THREE.BoxGeometry(radius * 1.9, 1.8, radius * 1.9);
            const skirtMat = new THREE.MeshStandardMaterial({ color: 0x2e3135, roughness: 0.95 });
            const skirtMesh = new THREE.Mesh(skirtGeom, skirtMat);
            skirtMesh.name = 'foundationSkirt';
            skirtMesh.position.set(0, -0.88, 0);
            skirtMesh.receiveShadow = true;
            group.add(skirtMesh);`;

if (c.includes(target)) {
    c = c.replace(target, replacement);
    fs.writeFileSync('D:/C&C/src/js/08_collision.js', c, 'utf8');
    console.log("Patched 08_collision.js (LF) successfully!");
} else if (c.includes(targetCRLF)) {
    c = c.replace(targetCRLF, replacement);
    fs.writeFileSync('D:/C&C/src/js/08_collision.js', c, 'utf8');
    console.log("Patched 08_collision.js (CRLF) successfully!");
} else {
    console.error("Target not found in 08_collision.js!");
}
