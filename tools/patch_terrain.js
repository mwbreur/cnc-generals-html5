const fs = require('fs');
let c = fs.readFileSync('D:/C&C/src/js/07_terrain.js', 'utf8');

// 1. Add flattenedFootprints and wrap getTerrainHeight
const target1 = "        function getTerrainHeight(x, z) {";
const replace1 = `        const flattenedFootprints = [];

        function registerFlattenedFootprint(cx, cz, radius, targetY) {
            flattenedFootprints.push({ cx, cz, radius, targetY });
            if (terrainMesh && terrainMesh.geometry && terrainMesh.geometry.attributes.position) {
                const pos = terrainMesh.geometry.attributes.position;
                const count = pos.count;
                let modified = false;
                const rSq = radius * radius;
                const blendR = radius * 1.35;
                const blendRSq = blendR * blendR;
                for (let i = 0; i < count; i++) {
                    const vx = pos.getX(i);
                    const vz = pos.getZ(i);
                    const dx = vx - cx;
                    const dz = vz - cz;
                    const dSq = dx * dx + dz * dz;
                    if (dSq <= rSq) {
                        pos.setY(i, targetY);
                        modified = true;
                    } else if (dSq < blendRSq) {
                        const dist = Math.sqrt(dSq);
                        const t = (dist - radius) / (blendR - radius);
                        const origY = pos.getY(i);
                        pos.setY(i, targetY * (1 - t) + origY * t);
                        modified = true;
                    }
                }
                if (modified) {
                    pos.needsUpdate = true;
                    terrainMesh.geometry.computeVertexNormals();
                }
            }
        }
        window.registerFlattenedFootprint = registerFlattenedFootprint;

        function getTerrainHeight(x, z) {
            for (let i = 0; i < flattenedFootprints.length; i++) {
                const fp = flattenedFootprints[i];
                const dist = Math.hypot(x - fp.cx, z - fp.cz);
                if (dist <= fp.radius) {
                    return fp.targetY;
                } else if (dist < fp.radius * 1.35) {
                    const t = (dist - fp.radius) / (fp.radius * 0.35);
                    const rawH = getRawTerrainHeight(x, z);
                    return fp.targetY * (1 - t) + rawH * t;
                }
            }
            return getRawTerrainHeight(x, z);
        }

        function getRawTerrainHeight(x, z) {`;

if (!c.includes(target1)) {
    console.error("Target 1 not found!");
    process.exit(1);
}
c = c.replace(target1, replace1);

// 2. Clear flattenedFootprints in setupMapEnvironment
const target2 = "// Clear previous terrain, water, props, and supply points";
const replace2 = `flattenedFootprints.length = 0;\n            // Clear previous terrain, water, props, and supply points`;
if (!c.includes(target2)) {
    console.error("Target 2 not found!");
    process.exit(1);
}
c = c.replace(target2, replace2);

// 3. Update spawnSingleSupplyDockAt
const dockStart = "        function spawnSingleSupplyDockAt(pos, stock = 8800) {";
const dockEndMarker = "supplyPoints.push({";
const dockEndClose = "});\r\n        }";
const dockEndCloseAlt = "});\n        }";

const newDockFn = `        function spawnSingleSupplyDockAt(pos, stock = 30000) {
            let dockMesh;
            let crates = null;
            if (typeof createW3DBuildingMesh === 'function' && window.W3D_BUILDING_DATA && window.W3D_BUILDING_DATA['tech_supplyDock']) {
                dockMesh = createW3DBuildingMesh('tech_supplyDock', false);
                if (window.W3D_BUILDING_DATA['tech_supplyCrates']) {
                    crates = createW3DBuildingMesh('tech_supplyCrates', false);
                    crates.name = 'supplyCrates';
                    dockMesh.add(crates);
                }
            } else {
                dockMesh = new THREE.Group();
                const pad = new THREE.Mesh(new THREE.CylinderGeometry(7.0, 7.5, 0.35, 16), new THREE.MeshStandardMaterial({ color: 0x34495e, roughness: 0.95 }));
                pad.position.y = 0.18; dockMesh.add(pad);
            }

            const dockRadius = 7.5;
            const hCenter = (typeof getRawTerrainHeight === 'function') ? getRawTerrainHeight(pos.x, pos.z) : pos.y;
            const deckY = hCenter + 0.05;
            pos.y = deckY;
            dockMesh.position.copy(pos);

            if (typeof registerFlattenedFootprint === 'function') {
                registerFlattenedFootprint(pos.x, pos.z, dockRadius * 1.15, deckY);
            }

            scene.add(dockMesh);
            supplyPoints.push({
                position: pos.clone(),
                mesh: dockMesh,
                cratesRef: crates,
                stock: stock,
                maxStock: stock,
                remaining: stock,
                maxSupplies: stock
            });
        }`;

const sIdx = c.indexOf(dockStart);
if (sIdx !== -1) {
    let eIdx = c.indexOf(dockEndClose, sIdx);
    let len = dockEndClose.length;
    if (eIdx === -1) {
        eIdx = c.indexOf(dockEndCloseAlt, sIdx);
        len = dockEndCloseAlt.length;
    }
    if (eIdx !== -1) {
        c = c.substring(0, sIdx) + newDockFn + c.substring(eIdx + len);
        console.log("Replaced spawnSingleSupplyDockAt!");
    } else {
        console.error("Could not find dock close marker!");
    }
} else {
    console.error("Could not find dockStart!");
}

// 4. Update createSupplyFieldsForMap default stock to 30000
c = c.replace(/spawnSingleSupplyDockAt\(pos, s\.amount \|\| 8800\)/g, "spawnSingleSupplyDockAt(pos, s.amount || 30000)");
c = c.replace(/spawnSingleSupplyDockAt\(position, 8800\)/g, "spawnSingleSupplyDockAt(position, 30000)");

fs.writeFileSync('D:/C&C/src/js/07_terrain.js', c, 'utf8');
console.log('Successfully patched 07_terrain.js');
