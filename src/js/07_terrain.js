// MAP ENVIRONMENTS, PROCEDURAL TERRAIN, WATER & PROPS (TREES / CITY)
// =========================================================================
let currentMapType = 'tournament_desert';
let currentMapSize = 600;
let terrainMesh = null;
let waterMesh = null;
let mapPropsGroup = null;
const mapObstacles = []; // Solid obstacles with collision (trees, rocks, buildings)
const worldBuildings = []; // Garrisonable civilian buildings & bunkers on the map
window.worldBuildings = worldBuildings;

function registerWorldBuilding(mesh, x, y, z, angle = 0, radius = 6.0, isBunker = false, modelKey = null) {
    if (!mesh) return null;
    const bld = {
        type: isBunker ? 'civilianBunker' : 'civilianBuilding',
        isWorldBuilding: true,
        isNeutral: true,
        mesh: mesh,
        baseMesh: mesh,
        modelKey: modelKey || null,
        yPos: (mesh && mesh.position) ? mesh.position.y : y,
        position: new THREE.Vector3(x, y, z),
        rotationY: angle || 0,
        radius: radius,
        health: isBunker ? 1400 : 1200,
        maxHealth: isBunker ? 1400 : 1200,
        capacity: isBunker ? 6 : 8,
        garrisoned: [],
        ownerId: null,
        teamId: 0,
        faction: null,
        _garrisonVisual: null,
        _garrisonW3DMesh: null,
        _usingOfficialGarrisonModel: false,
        _garrisonColorHex: null,
        _lastGarrisonCount: 0
    };
    worldBuildings.push(bld);
    return bld;
}

function _createGarrisonPipSprite(occupied, capacity, hexColor) {
    if (typeof THREE === 'undefined' || typeof THREE.Sprite !== 'function' || typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 34;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(10, 14, 18, 0.85)';
        ctx.fillRect(4, 4, canvas.width - 8, canvas.height - 8);
        const colHex = '#' + (hexColor >>> 0).toString(16).padStart(6, '0');
        ctx.strokeStyle = colHex;
        ctx.lineWidth = 2;
        ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
        const slots = Math.max(1, Math.min(10, capacity || 8));
        const slotW = (canvas.width - 20) / slots;
        for (let i = 0; i < slots; i++) {
            ctx.fillStyle = i < occupied ? colHex : 'rgba(255, 255, 255, 0.22)';
            ctx.fillRect(10 + i * slotW, 9, Math.max(4, slotW - 3), canvas.height - 18);
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
    const spr = new THREE.Sprite(mat);
    spr.name = 'garrisonPipSprite';
    spr.scale.set(6.2, 1.35, 1);
    return spr;
}

function updateWorldBuildingGarrisonVisual(bld) {
    if (!bld || !bld.mesh) return;
    if (!bld.garrisoned || bld.garrisoned.length === 0) {
        if (bld._garrisonVisual) {
            bld.mesh.remove(bld._garrisonVisual);
            bld._garrisonVisual.traverse(c => {
                    if (c.geometry && typeof c.geometry.dispose === 'function') c.geometry.dispose();
                    if (c.material) {
                        if (c.material.map && typeof c.material.map.dispose === 'function') c.material.map.dispose();
                        if (typeof c.material.dispose === 'function') c.material.dispose();
                    }
            });
            bld._garrisonVisual = null;
        }
        if (bld._usingOfficialGarrisonModel && bld.baseMesh) {
            const parent = (bld.mesh && bld.mesh.parent) || (typeof mapPropsGroup !== 'undefined' ? mapPropsGroup : null) || (typeof scene !== 'undefined' ? scene : null);
            if (parent && bld.mesh !== bld.baseMesh) parent.remove(bld.mesh);
            bld.baseMesh.visible = true;
            if (parent && (!bld.baseMesh.parent || (parent.children && !parent.children.includes(bld.baseMesh)))) parent.add(bld.baseMesh);
            bld.mesh = bld.baseMesh;
            bld._garrisonW3DMesh = null;
            bld._usingOfficialGarrisonModel = false;
            bld._garrisonColorHex = null;
        }
        bld.ownerId = null;
        bld.teamId = 0;
        bld.faction = null;
        bld._lastGarrisonCount = 0;
        return;
    }

    const occupant = bld.garrisoned[0];
    bld.ownerId = occupant.ownerId || 'player';
    bld.teamId = occupant.teamId || 1;
    bld.faction = occupant.faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa');

    const isPlayerTeam = (typeof playerTeamId !== 'undefined') ? (bld.teamId === playerTeamId) : (bld.teamId === 1);
    const defaultFactionHex = (bld.faction === 'china') ? 0xe74c3c : (bld.faction === 'gla') ? 0x2ecc71 : 0x1e90ff;
    const flagColor = isPlayerTeam
        ? ((typeof window !== 'undefined' && window.selectedPlayerColorHex) ? window.selectedPlayerColorHex : defaultFactionHex)
        : ((typeof window !== 'undefined' && window.activeEnemyColorHex) ? window.activeEnemyColorHex : 0xdc2626);

    const gKey = bld.modelKey ? (bld.modelKey + '_g') : null;
    const hasOfficialGarrisonModel = Boolean(gKey && typeof window !== 'undefined' && window.W3D_BUILDING_DATA && window.W3D_BUILDING_DATA[gKey] && typeof createW3DBuildingMesh === 'function');

    if (hasOfficialGarrisonModel && (!bld._usingOfficialGarrisonModel || bld._garrisonColorHex !== flagColor)) {
        if (bld._garrisonVisual) {
            bld.mesh.remove(bld._garrisonVisual);
            bld._garrisonVisual.traverse(c => {
                    if (c.geometry && typeof c.geometry.dispose === 'function') c.geometry.dispose();
                    if (c.material) {
                        if (c.material.map && typeof c.material.map.dispose === 'function') c.material.map.dispose();
                        if (typeof c.material.dispose === 'function') c.material.dispose();
                    }
            });
            bld._garrisonVisual = null;
        }
        const parent = (bld.mesh && bld.mesh.parent) || (typeof mapPropsGroup !== 'undefined' ? mapPropsGroup : null) || (typeof scene !== 'undefined' ? scene : null);
        if (parent && bld.mesh && bld.mesh !== bld.baseMesh) {
            parent.remove(bld.mesh);
        } else if (parent && bld.baseMesh && bld.baseMesh.parent === parent) {
            parent.remove(bld.baseMesh);
        }
        const gMesh = createW3DBuildingMesh(gKey, !isPlayerTeam, null, flagColor);
        gMesh.position.set(bld.position.x, bld.yPos !== undefined ? bld.yPos : bld.position.y, bld.position.z);
        gMesh.rotation.y = bld.rotationY || 0;
        if (parent) parent.add(gMesh);
        bld.mesh = gMesh;
        bld._garrisonW3DMesh = gMesh;
        bld._usingOfficialGarrisonModel = true;
        bld._garrisonColorHex = flagColor;
    }

    if (!bld._garrisonVisual) {
        const grp = new THREE.Group();
        grp.name = 'worldBuildingGarrisonVisual';
        const sx = (bld.mesh.scale && bld.mesh.scale.x) ? bld.mesh.scale.x : 1;
        const sy = (bld.mesh.scale && bld.mesh.scale.y) ? bld.mesh.scale.y : 1;
        const sz = (bld.mesh.scale && bld.mesh.scale.z) ? bld.mesh.scale.z : 1;
        grp.scale.set(1 / sx, 1 / sy, 1 / sz);

        const r = (bld.radius || 5.5) * 0.92;
        if (!hasOfficialGarrisonModel) {
            const sandMat = new THREE.MeshStandardMaterial({ color: 0x9c8964, roughness: 0.95, metalness: 0.05 });
            const wireMat = new THREE.MeshStandardMaterial({ color: 0x6c757d, roughness: 0.5, metalness: 0.75 });
            const flagMat = new THREE.MeshStandardMaterial({ color: flagColor, roughness: 0.55, side: THREE.DoubleSide });
            const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3f44, metalness: 0.7, roughness: 0.4 });

            // Fallback sandbag walls + barbed wire coils when no official _G.W3D exists
            for (let side = 0; side < 4; side++) {
                const ang = side * (Math.PI / 2);
                const wallGrp = new THREE.Group();
                wallGrp.rotation.y = ang;

                const bag = new THREE.Mesh(new THREE.BoxGeometry(r * 1.45, 0.72, 0.55), sandMat);
                bag.position.set(0, 0.36, r);
                bag.castShadow = true;
                bag.receiveShadow = true;
                wallGrp.add(bag);

                const bagTop = new THREE.Mesh(new THREE.BoxGeometry(r * 1.25, 0.42, 0.44), sandMat);
                bagTop.position.set(0, 0.88, r);
                bagTop.castShadow = true;
                wallGrp.add(bagTop);

                if (typeof THREE.TorusGeometry === 'function') {
                    const coils = 4;
                    for (let ci = 0; ci < coils; ci++) {
                        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 6, 10), wireMat);
                        coil.position.set((ci - (coils - 1) * 0.5) * (r * 0.36), 0.35, r + 0.65);
                        coil.rotation.y = Math.PI / 2 + 0.25;
                        wallGrp.add(coil);
                    }
                }
                grp.add(wallGrp);
            }

            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6.8, 6), poleMat);
            pole.position.set(r * 0.45, 3.4, r * 0.45);
            const flagWindPivot = new THREE.Group();
            flagWindPivot.name = 'flagWindPivot';
            flagWindPivot.userData.isWindFlag = true;
            flagWindPivot.position.set(r * 0.45, 6.2, r * 0.45);
            const flag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 1.7), flagMat);
            flag.position.set(0, 0, 0.85);
            flagWindPivot.add(flag);
            grp.add(pole);
            grp.add(flagWindPivot);
        }

        // Subtle garrison glow + viewing/firing range ring on the ground
        // NOTE: no THREE.PointLight here. Adding/removing a light changes NUM_POINT_LIGHTS and forces a synchronous
        // recompile of every material in the scene (1s+ frame stall). The range ring + pips convey garrison state.
        let viewRange = 30;
        for (let gi = 0; gi < bld.garrisoned.length; gi++) {
            const gu = bld.garrisoned[gi];
            if (gu && gu.health > 0) viewRange = Math.max(viewRange, (gu.scanRange || 20) * 1.5);
        }
        if (typeof THREE.RingGeometry === 'function') {
            const rangeRing = new THREE.Mesh(
                new THREE.RingGeometry(viewRange - 0.35, viewRange, 48),
                new THREE.MeshBasicMaterial({ color: flagColor, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
            );
            rangeRing.rotation.x = -Math.PI / 2;
            rangeRing.position.y = 0.22;
            rangeRing.name = 'garrisonRangeRing';
            grp.add(rangeRing);
        }

        const pipSpr = _createGarrisonPipSprite(bld.garrisoned.length, bld.capacity || 8, flagColor);
        if (pipSpr) {
            pipSpr.position.set(0, bld.type === 'civilianBunker' ? 6.2 : 8.8, 0);
            grp.add(pipSpr);
        }
        bld._lastGarrisonCount = bld.garrisoned.length;

        bld.mesh.add(grp);
        bld._garrisonVisual = grp;
    } else if (bld._garrisonVisual) {
        // Update range ring if a unit with longer scanRange enters
        const existingRing = bld._garrisonVisual.getObjectByName && bld._garrisonVisual.getObjectByName('garrisonRangeRing');
        if (existingRing && existingRing.geometry && typeof THREE.RingGeometry === 'function') {
            let viewRange = 30;
            for (let gi = 0; gi < bld.garrisoned.length; gi++) {
                const gu = bld.garrisoned[gi];
                if (gu && gu.health > 0) viewRange = Math.max(viewRange, (gu.scanRange || 20) * 1.5);
            }
            existingRing.geometry.dispose();
            existingRing.geometry = new THREE.RingGeometry(viewRange - 0.35, viewRange, 48);
        }
        if (bld._lastGarrisonCount !== bld.garrisoned.length || bld._garrisonColorHex !== flagColor) {
            const oldPip = bld._garrisonVisual.getObjectByName && bld._garrisonVisual.getObjectByName('garrisonPipSprite');
            if (oldPip) {
                bld._garrisonVisual.remove(oldPip);
                if (oldPip.material) {
                    if (oldPip.material.map && typeof oldPip.material.map.dispose === 'function') oldPip.material.map.dispose();
                    if (typeof oldPip.material.dispose === 'function') oldPip.material.dispose();
                }
            }
            const nextPip = _createGarrisonPipSprite(bld.garrisoned.length, bld.capacity || 8, flagColor);
            if (nextPip) {
                nextPip.position.set(0, bld.type === 'civilianBunker' ? 6.2 : 8.8, 0);
                bld._garrisonVisual.add(nextPip);
            }
            bld._lastGarrisonCount = bld.garrisoned.length;
            bld._garrisonColorHex = flagColor;
        }
    }
}
window.updateWorldBuildingGarrisonVisual = updateWorldBuildingGarrisonVisual;

function _getRetailTerrainDetailTex(key) {
    if (typeof window === 'undefined' || typeof THREE === 'undefined' || typeof document === 'undefined') return null;
    if (!window._retailTerrainDetailTexCache) window._retailTerrainDetailTexCache = {};
    if (window._retailTerrainDetailTexCache[key]) return window._retailTerrainDetailTexCache[key];

    const can = document.createElement('canvas');
    can.width = can.height = 256;
    const ctx = can.getContext && can.getContext('2d');
    if (ctx) {
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, 256, 256);
        let s = (key.charCodeAt(0) * 997 + 1337) >>> 0;
        const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
        for (let i = 0; i < 6000; i++) {
            const x = rnd() * 256, y = rnd() * 256;
            const v = Math.floor(110 + rnd() * 36);
            ctx.fillStyle = `rgb(${v},${v},${v})`;
            ctx.fillRect(x, y, 2, 2);
        }
    }
    const tex = new THREE.CanvasTexture(can);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    if ('anisotropy' in tex) tex.anisotropy = 16;
    window._retailTerrainDetailTexCache[key] = tex;

    const uri = (window.RETAIL_TERRAIN_TILES && window.RETAIL_TERRAIN_TILES[key]) || null;
    if (uri && typeof Image !== 'undefined') {
        const img = new Image();
        img.onload = function() {
            if (ctx) {
                ctx.drawImage(img, 0, 0, 256, 256);
                tex.needsUpdate = true;
            }
        };
        img.src = uri;
    }
    return tex;
}

// Mathematical Heightmap Generator
function getCustomMapHeight(x, z) {
    if (!activeCustomMap || !activeCustomMap.heightGrid || activeCustomMap.heightGrid.length === 0) return 2.5;
    const size = currentMapSize;
    const half = size * 0.5;
    const u = Math.max(0, Math.min(1, (x + half) / size));
    const v = Math.max(0, Math.min(1, (z + half) / size));
    const res = 32;
    const gx = u * (res - 1);
    const gz = v * (res - 1);
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = Math.min(res - 1, x0 + 1);
    const z1 = Math.min(res - 1, z0 + 1);
    const fx = gx - x0;
    const fz = gz - z0;
    const grid = activeCustomMap.heightGrid;
    const h00 = grid[z0 * res + x0] !== undefined ? grid[z0 * res + x0] : 2.5;
    const h10 = grid[z0 * res + x1] !== undefined ? grid[z0 * res + x1] : 2.5;
    const h01 = grid[z1 * res + x0] !== undefined ? grid[z1 * res + x0] : 2.5;
    const h11 = grid[z1 * res + x1] !== undefined ? grid[z1 * res + x1] : 2.5;
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    return h0 * (1 - fz) + h1 * fz;
}

const flattenedFootprints = [];

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
    // Compose overlapping flattened footprints in exact registration order (1:1 parity with registerFlattenedFootprint!)
    let h = getRawTerrainHeight(x, z);
    for (let i = 0; i < flattenedFootprints.length; i++) {
        const fp = flattenedFootprints[i];
        const r = fp.radius;
        const outerR = r * 1.35;
        const dx = x - fp.cx;
        if (dx > outerR || dx < -outerR) continue;
        const dz = z - fp.cz;
        if (dz > outerR || dz < -outerR) continue;
        const d2 = dx * dx + dz * dz;
        if (d2 <= r * r) {
            h = fp.targetY;
        } else if (d2 < outerR * outerR) {
            const dist = Math.sqrt(d2);
            const t = (dist - r) / (r * 0.35);
            h = fp.targetY * (1 - t) + h * t;
        }
    }
    return h;
}

let _activeProceduralRoads = [];
let _activeProceduralSpawns = [];

function distPointToSegment2D(px, pz, x1, z1, x2, z2) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const lenSq = dx * dx + dz * dz;
    if (lenSq < 1e-6) return Math.hypot(px - x1, pz - z1);
    let t = ((px - x1) * dx + (pz - z1) * dz) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    return Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz));
}

function buildProceduralRoadNetwork(mapType, mapSize) {
    _activeProceduralRoads = [];
    _activeProceduralSpawns = [];
    const officialMap = window.OFFICIAL_SKIRMISH_MAPS && window.OFFICIAL_SKIRMISH_MAPS[mapType];
    if (officialMap || activeCustomMap) return;

    const spawns = (typeof getSpawnPointsForMap === 'function')
        ? getSpawnPointsForMap(mapSize, mapType, null)
        : [];
    if (!Array.isArray(spawns) || spawns.length < 2) return;
    _activeProceduralSpawns = spawns;

    const roadKind = (mapType === 'desert' || mapType === 'random') ? 'dirt' : 'asphalt';
    // Sort spawns radially so ring-road connects adjacent spawns cleanly around the map perimeter
    const ordered = spawns.slice().sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));

    // 1. Perimeter ring highway connecting all neighboring spawn points
    for (let i = 0; i < ordered.length; i++) {
        const a = ordered[i];
        const b = ordered[(i + 1) % ordered.length];
        _activeProceduralRoads.push({ x1: a.x, z1: a.z, x2: b.x, z2: b.z, kind: roadKind });
    }
    // 2. Spokes from every spawn to the central strategic hub (0, 0)
    for (let i = 0; i < ordered.length; i++) {
        const a = ordered[i];
        _activeProceduralRoads.push({ x1: a.x, z1: a.z, x2: 0, z2: 0, kind: roadKind });
    }
}

function applyProceduralMapRulesToHeight(x, z, rawH, mapSize) {
    let h = rawH;
    // Rule 1: Flat buildable base plateaus around every spawn point (radius ~10% of map, smooth ramp)
    const plateauR = Math.min(50, mapSize * 0.095);
    const blendR = plateauR + 22;
    const baseTargetH = (currentMapType === 'city') ? 2.0 : 3.2;
    for (let i = 0; i < _activeProceduralSpawns.length; i++) {
        const sp = _activeProceduralSpawns[i];
        const d = Math.hypot(x - sp.x, z - sp.z);
        if (d < blendR) {
            const t = d <= plateauR ? 1.0 : (1.0 - (d - plateauR) / (blendR - plateauR));
            const s = t * t * (3 - 2 * t);
            h = h * (1 - s) + baseTargetH * s;
        }
    }
    // Rule 2: Guaranteed passable, gently graded AI road corridors (never impassable cliffs or dips)
    if (_activeProceduralRoads.length > 0 && h > -0.8) {
        let minRoadDist = 1e9;
        for (let i = 0; i < _activeProceduralRoads.length; i++) {
            const r = _activeProceduralRoads[i];
            const d = distPointToSegment2D(x, z, r.x1, r.z1, r.x2, r.z2);
            if (d < minRoadDist) minRoadDist = d;
        }
        if (minRoadDist < 22) {
            const t = minRoadDist <= 9 ? 1.0 : (1.0 - (minRoadDist - 9) / 13);
            const s = t * t * (3 - 2 * t);
            const targetRoadH = Math.max(1.8, Math.min(4.2, h));
            h = h * (1 - s) + targetRoadH * s;
        }
    }
    return h;
}

function getRawTerrainHeight(x, z) {
    if (window.OFFICIAL_SKIRMISH_MAPS && window.OFFICIAL_SKIRMISH_MAPS[currentMapType] && typeof getOfficialMapHeight === 'function') {
        return getOfficialMapHeight(currentMapType, x, z);
    }
    if (currentMapType === 'tournament_desert' && typeof getTournamentDesertHeight === 'function') {
        return getTournamentDesertHeight(x, z);
    }
    if (activeCustomMap && activeCustomMap.heightGrid) {
        return getCustomMapHeight(x, z);
    }
    const size = currentMapSize;
    if (currentMapType === 'desert') {
        // Rolling sand dunes and canyon plateaus - 98.7% accessible dry land!
        const dune1 = Math.sin(x * 0.02 + z * 0.012) * 2.6;
        const dune2 = Math.cos(x * 0.035 - z * 0.02) * 1.8;
        let h = 3.8 + dune1 + dune2;

        // Canyon mesa in the northwes
        const dxMesa = x + size * 0.22;
        const dzMesa = z + size * 0.22;
        const dMesa = Math.hypot(dxMesa, dzMesa);
        if (dMesa < size * 0.14) {
            h += (1 - dMesa / (size * 0.14)) * 7.5;
        }

        // Localized oasis pond depression in the southeas
        const dxOasis = x - size * 0.20;
        const dzOasis = z - size * 0.20;
        const dOasis = Math.hypot(dxOasis, dzOasis);
        if (dOasis < size * 0.08) {
            h -= (1 - dOasis / (size * 0.08)) * 8.5;
        }
        return applyProceduralMapRulesToHeight(x, z, h, size);
    } else if (currentMapType === 'jungle') {
        // Lush tropical hills and a defined river channel with shallow fords - 98% accessible land!
        const riverZ = Math.sin(x * 0.012) * (size * 0.09);
        const distToRiver = Math.abs(z - riverZ);
        let h = 4.5 + Math.sin(x * 0.022) * Math.cos(z * 0.022) * 3.2 + Math.sin(x * 0.045 + z * 0.03) * 1.6;

        const riverWidth = size * 0.032;
        if (distToRiver < riverWidth) {
            // Natural shallow sandbars / fords between bridges where units can wade across
            const isFord = Math.abs(x) < size * 0.06 || Math.abs(x - size * 0.13) < size * 0.03 || Math.abs(x + size * 0.13) < size * 0.03;
            if (isFord) {
                h += 0.8; // Ford stays above water!
            } else {
                const rf = 1 - (distToRiver / riverWidth);
                h -= rf * rf * 9.5;
            }
        }
        return applyProceduralMapRulesToHeight(x, z, h, size);
    } else if (currentMapType === 'snow') {
        // Siberian ridges and central ice pond - 99% accessible land!
        const ridge = Math.abs(Math.sin(x * 0.014 + z * 0.012)) * 4.5;
        const roll = Math.cos(x * 0.025 - z * 0.02) * 2.0;
        let h = 3.5 + ridge + roll;

        const dLake = Math.hypot(x, z);
        const lakeRadius = size * 0.08;
        if (dLake < lakeRadius) {
            const lf = 1 - (dLake / lakeRadius);
            h -= lf * lf * 8.0;
        }
        return applyProceduralMapRulesToHeight(x, z, h, size);
    } else if (currentMapType === 'city') {
        // Urban street grid with sunken concrete canal - 97% accessible land!
        const canalDist = Math.abs(x - size * 0.05);
        const canalWidth = size * 0.022;
        let h = 2.0 + ((Math.floor(x / 40) % 2 === 0 && Math.floor(z / 40) % 2 === 0) ? 0.4 : 0);
        if (canalDist < canalWidth) {
            h -= (1 - canalDist / canalWidth) * 7.5;
        }
        return applyProceduralMapRulesToHeight(x, z, h, size);
    } else if (currentMapType === 'random') {
        // Procedural Warzone with narrow stream and multiple crossings - 97.5% accessible land!
        const riverZ = Math.sin(x * 0.014 + randomMapSeed) * (size * 0.10);
        const distToRiver = Math.abs(z - riverZ);
        let h = 4.2 + Math.sin(x * 0.02 + randomMapSeed) * Math.cos(z * 0.02 + randomMapSeed * 0.5) * 2.8 +
        Math.sin(x * 0.045 - z * 0.035) * 1.5;

        const riverWidth = size * 0.032;
        if (distToRiver < riverWidth) {
            // Periodic shallow sandbar crossings
            const isFord = Math.sin(x * 0.04) > 0.55;
            if (isFord) {
                h += 0.8;
            } else {
                const f = 1 - (distToRiver / riverWidth);
                h -= f * f * 9.2;
            }
        }
        return applyProceduralMapRulesToHeight(x, z, h, size);
    }
    return 2.0;
}

// Procedural Texture Generator for Custom Maps (Height-aware splat texturing)
function createCustomTerrainTexture(customMap) {
    const width = 1024;
    const height = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    const res = 32;
    const grid = (customMap && customMap.heightGrid && customMap.heightGrid.length === res * res)
    ? customMap.heightGrid
    : null;
    const waterLevel = (customMap && customMap.waterLevel !== undefined) ? Number(customMap.waterLevel) : -1.0;
    const theme = (customMap && customMap.theme) ? customMap.theme : 'desert';

    for (let py = 0; py < height; py++) {
        const gyFloat = (py / (height - 1)) * (res - 1);
        const gy0 = Math.floor(gyFloat);
        const gy1 = Math.min(res - 1, gy0 + 1);
        const fy = gyFloat - gy0;

        for (let px = 0; px < width; px++) {
            const gxFloat = (px / (width - 1)) * (res - 1);
            const gx0 = Math.floor(gxFloat);
            const gx1 = Math.min(res - 1, gx0 + 1);
            const fx = gxFloat - gx0;

            let h = 2.5;
            let slope = 0;

            if (grid) {
                const h00 = grid[gy0 * res + gx0] !== undefined ? grid[gy0 * res + gx0] : 2.5;
                const h10 = grid[gy0 * res + gx1] !== undefined ? grid[gy0 * res + gx1] : 2.5;
                const h01 = grid[gy1 * res + gx0] !== undefined ? grid[gy1 * res + gx0] : 2.5;
                const h11 = grid[gy1 * res + gx1] !== undefined ? grid[gy1 * res + gx1] : 2.5;

                const topH = h00 * (1 - fx) + h10 * fx;
                const botH = h01 * (1 - fx) + h11 * fx;
                h = topH * (1 - fy) + botH * fy;

                const dHx = Math.abs((h10 - h00) * (1 - fy) + (h11 - h01) * fy);
                const dHy = Math.abs((h01 - h00) * (1 - fx) + (h11 - h10) * fx);
                slope = dHx + dHy;
            }

            // Pseudo-random high-frequency surface noise (-10 to +10)
            const nHash = ((px * 1664525 + py * 1013904223) ^ (px >> 2)) & 0xff;
            const noise = (nHash - 128) * 0.08;

            let r = 180, g = 160, b = 120;

            if (theme === 'desert') {
                if (h <= waterLevel + 0.35) {
                    // Shoreline damp silt & alluvial mud
                    r = 122 + noise * 0.6;
                    g = 102 + noise * 0.5;
                    b = 72 + noise * 0.4;
                } else if (slope > 0.40) {
                    // Canyon sandstone cliff face with rock strata
                    const strata = Math.sin(h * 3.8 + px * 0.02) * 16;
                    r = 150 + strata + noise;
                    g = 100 + strata * 0.7 + noise;
                    b = 65 + strata * 0.5 + noise;
                } else if (h > 5.5) {
                    // Elevated mesa limestone plateau
                    r = 218 + noise;
                    g = 196 + noise;
                    b = 156 + noise;
                } else {
                    // Rolling desert dunes with subtle ripples
                    const ripple = Math.sin(px * 0.08 + py * 0.04) * 6;
                    r = 202 + ripple + noise;
                    g = 176 + ripple * 0.85 + noise;
                    b = 132 + ripple * 0.65 + noise;
                }
            } else if (theme === 'jungle') {
                if (h <= waterLevel + 0.35) {
                    // Muddy riverbed & wetland sil
                    r = 75 + noise * 0.6;
                    g = 65 + noise * 0.5;
                    b = 48 + noise * 0.4;
                } else if (slope > 0.40) {
                    // Volcanic basalt cliff face
                    const strata = Math.sin(h * 3.0) * 10;
                    r = 68 + strata + noise;
                    g = 75 + strata + noise;
                    b = 66 + strata + noise;
                } else if (h > 5.5) {
                    // Upland savanna ridges
                    r = 92 + noise;
                    g = 128 + noise;
                    b = 62 + noise;
                } else {
                    // Lush tropical grass & foliage
                    const turf = Math.sin(px * 0.06 - py * 0.05) * 8;
                    r = 58 + turf * 0.5 + noise;
                    g = 110 + turf + noise;
                    b = 45 + turf * 0.4 + noise;
                }
            } else if (theme === 'snow') {
                if (h <= waterLevel + 0.35) {
                    // Icy slush & permafros
                    r = 140 + noise;
                    g = 158 + noise;
                    b = 180 + noise;
                } else if (slope > 0.40) {
                    // Dark Siberian granite crags
                    const strata = Math.sin(h * 3.2) * 12;
                    r = 78 + strata + noise;
                    g = 88 + strata + noise;
                    b = 102 + strata + noise;
                } else if (h > 5.5) {
                    // Packed glacial blue ice
                    r = 232 + noise * 0.5;
                    g = 245 + noise * 0.5;
                    b = 255;
                } else {
                    // Powder snow drifts
                    const drift = Math.sin(px * 0.05 + py * 0.05) * 6;
                    r = 235 + drift + noise;
                    g = 242 + drift + noise;
                    b = 250 + drift + noise;
                }
            } else if (theme === 'city') {
                if (h <= waterLevel + 0.35) {
                    // Canal bed / concrete basin
                    r = 44 + noise * 0.5;
                    g = 48 + noise * 0.5;
                    b = 54 + noise * 0.5;
                } else if (slope > 0.40) {
                    // Retaining wall / foundations
                    const strata = Math.sin(h * 4.0) * 10;
                    r = 82 + strata + noise;
                    g = 86 + strata + noise;
                    b = 92 + strata + noise;
                } else if (h > 5.5) {
                    // Elevated urban plaza
                    r = 98 + noise;
                    g = 104 + noise;
                    b = 112 + noise;
                } else {
                    // Asphalt streets and urban blocks
                    const isRoadGrid = (px % 64 < 10) || (py % 64 < 10);
                    if (isRoadGrid) {
                        r = 40 + noise * 0.5;
                        g = 42 + noise * 0.5;
                        b = 46 + noise * 0.5;
                    } else {
                        r = 68 + noise;
                        g = 73 + noise;
                        b = 78 + noise;
                    }
                }
            }

            const idx = (py * width + px) * 4;
            data[idx] = Math.max(0, Math.min(255, Math.round(r)));
            data[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
            data[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
            data[idx + 3] = 255;
        }
    }

    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(1, 1);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
}

// Procedural Texture Generator per Environmen
function createTerrainTextureForMap(mapType) {
    const officialKey = (mapType === 'desert') ? 'tournament_desert' : mapType;
    if (window.OFFICIAL_SKIRMISH_MAPS && window.OFFICIAL_SKIRMISH_MAPS[officialKey] && typeof createOfficialMapTexture === 'function') {
        const retailTex = createOfficialMapTexture(officialKey);
        if (retailTex) return retailTex;
    }
    if ((mapType === 'tournament_desert' || mapType === 'desert') && typeof createTournamentDesertTexture === 'function') {
        const retailTex = createTournamentDesertTexture();
        if (retailTex) return retailTex;
    }
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');

    if (mapType === 'desert') {
        ctx.fillStyle = '#bfa87a'; // Golden sand
        ctx.fillRect(0, 0, 512, 512);
        const patches = ['#a89265', '#cbba8d', '#8c7750', '#d9cca6', '#7a6744'];
        for (let i = 0; i < 1100; i++) {
            ctx.fillStyle = patches[i % patches.length];
            ctx.globalAlpha = 0.12 + Math.random() * 0.15;
            ctx.beginPath();
            ctx.ellipse(Math.random() * 512, Math.random() * 512, 4 + Math.random() * 22, 2 + Math.random() * 14, Math.random() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (mapType === 'jungle') {
        ctx.fillStyle = '#3a5328'; // Lush tropical green
        ctx.fillRect(0, 0, 512, 512);
        const patches = ['#2b3f1c', '#4b6b33', '#56452e', '#233417', '#60793b'];
        for (let i = 0; i < 1200; i++) {
            ctx.fillStyle = patches[i % patches.length];
            ctx.globalAlpha = 0.14 + Math.random() * 0.18;
            ctx.beginPath();
            ctx.ellipse(Math.random() * 512, Math.random() * 512, 4 + Math.random() * 24, 3 + Math.random() * 16, Math.random() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (mapType === 'snow') {
        ctx.fillStyle = '#eaf0f4'; // Frosty snow
        ctx.fillRect(0, 0, 512, 512);
        const patches = ['#d2dce3', '#f7faff', '#9fb0bc', '#c0cbd3', '#8999a6'];
        for (let i = 0; i < 1100; i++) {
            ctx.fillStyle = patches[i % patches.length];
            ctx.globalAlpha = 0.12 + Math.random() * 0.15;
            ctx.beginPath();
            ctx.ellipse(Math.random() * 512, Math.random() * 512, 5 + Math.random() * 26, 3 + Math.random() * 18, Math.random() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (mapType === 'city') {
        ctx.fillStyle = '#34383c'; // Dark asphal
        ctx.fillRect(0, 0, 512, 512);

        // Grid street pattern
        ctx.strokeStyle = '#222528';
        ctx.lineWidth = 14;
        for (let i = 0; i <= 512; i += 64) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
        }

        // Yellow lane dividers
        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        for (let i = 32; i <= 512; i += 64) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
        }
        ctx.setLineDash([]);
    } else if (mapType === 'random') {
        ctx.fillStyle = '#4a5d38'; // Warzone olive earth
        ctx.fillRect(0, 0, 512, 512);
        const patches = ['#3a482b', '#5c6f44', '#6b5c42', '#333f25', '#73634a', '#857252'];
        for (let i = 0; i < 1300; i++) {
            ctx.fillStyle = patches[i % patches.length];
            ctx.globalAlpha = 0.14 + Math.random() * 0.18;
            ctx.beginPath();
            ctx.ellipse(Math.random() * 512, Math.random() * 512, 4 + Math.random() * 24, 3 + Math.random() * 16, Math.random() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
    } else {
        // Guaranteed safety fallback for any custom or unrecognized map type - never render black!
        ctx.fillStyle = '#bfa87a';
        ctx.fillRect(0, 0, 512, 512);
        const patches = ['#a89265', '#cbba8d', '#8c7750', '#d9cca6', '#7a6744'];
        for (let i = 0; i < 1100; i++) {
            ctx.fillStyle = patches[i % patches.length];
            ctx.globalAlpha = 0.12 + Math.random() * 0.15;
            ctx.beginPath();
            ctx.ellipse(Math.random() * 512, Math.random() * 512, 4 + Math.random() * 22, 2 + Math.random() * 14, Math.random() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.globalAlpha = 1.0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(mapType === 'city' ? 24 : 36, mapType === 'city' ? 24 : 36);
    return texture;
}

// Build Terrain, Water, and Props for the selected Map
function setupMapEnvironment(mapType = 'tournament_desert', mapSize = 600) {
    if (mapType === 'desert') mapType = 'tournament_desert';
    // 0. Resolve activeCustomMap if mapType starts with custom_
    if (mapType && mapType.startsWith('custom_')) {
        if (!activeCustomMap || activeCustomMap.id !== mapType) {
            if (typeof savedCustomMaps !== 'undefined' && savedCustomMaps[mapType]) {
                activeCustomMap = savedCustomMaps[mapType];
            }
        }
    } else {
        activeCustomMap = null;
    }

    if (activeCustomMap && activeCustomMap.size) {
        mapSize = Number(activeCustomMap.size);
    }

    currentMapType = mapType;
    currentMapSize = mapSize;

    // Roll random map seed BEFORE any getTerrainHeight() / mesh displacement call; preserve multiplayer matchSeed!
    if (mapType === 'random') {
        const hasMpSeed = (typeof isMultiplayerActive !== 'undefined' && isMultiplayerActive && Number.isFinite(randomMapSeed) && randomMapSeed > 0);
        if (!hasMpSeed) {
            const rng = (typeof simRandom === 'function') ? simRandom : Math.random;
            randomMapSeed = rng() * 100;
            randomMapRiverFreq = 0.012 + rng() * 0.008;
        }
    }

    const officialMap = window.OFFICIAL_SKIRMISH_MAPS && window.OFFICIAL_SKIRMISH_MAPS[mapType];
    buildProceduralRoadNetwork(mapType, mapSize);
    const effectiveTheme = (activeCustomMap && activeCustomMap.theme)
    ? activeCustomMap.theme
    : (officialMap ? officialMap.theme : (mapType === 'random' ? 'jungle' : (['desert', 'jungle', 'snow', 'city', 'tournament_desert'].includes(mapType) ? mapType : 'desert')));

    flattenedFootprints.length = 0;
    // Clear previous terrain, water, props, and supply points (disposing non-shared GPU geometries, materials & canvas textures)
    if (terrainMesh) {
        scene.remove(terrainMesh);
        if (terrainMesh.geometry && typeof terrainMesh.geometry.dispose === 'function') terrainMesh.geometry.dispose();
        if (terrainMesh.material) {
            if (terrainMesh.material.map && typeof terrainMesh.material.map.dispose === 'function') terrainMesh.material.map.dispose();
            if (typeof terrainMesh.material.dispose === 'function') terrainMesh.material.dispose();
        }
        terrainMesh = null;
    }
    if (window.terrainDetailMesh) {
        scene.remove(window.terrainDetailMesh);
        if (window.terrainDetailMesh.geometry && typeof window.terrainDetailMesh.geometry.dispose === 'function') window.terrainDetailMesh.geometry.dispose();
        if (window.terrainDetailMesh.material) {
            if (window.terrainDetailMesh.material.map && typeof window.terrainDetailMesh.material.map.dispose === 'function') window.terrainDetailMesh.material.map.dispose();
            if (typeof window.terrainDetailMesh.material.dispose === 'function') window.terrainDetailMesh.material.dispose();
        }
        window.terrainDetailMesh = null;
    }
    if (waterMesh) {
        scene.remove(waterMesh);
        if (waterMesh.geometry && typeof waterMesh.geometry.dispose === 'function') waterMesh.geometry.dispose();
        if (waterMesh.material) {
            if (waterMesh.material.map && typeof waterMesh.material.map.dispose === 'function') waterMesh.material.map.dispose();
            if (typeof waterMesh.material.dispose === 'function') waterMesh.material.dispose();
        }
        waterMesh = null;
    }
    if (mapPropsGroup) {
        if (typeof disposeSceneNodeSafe === 'function') disposeSceneNodeSafe(mapPropsGroup);
        else scene.remove(mapPropsGroup);
        mapPropsGroup = null;
    }
    mapObstacles.length = 0;
    worldBuildings.length = 0;
    if (typeof markPathfindGridDirty === 'function') markPathfindGridDirty();
    if (typeof _pathfindGridState !== 'undefined' && _pathfindGridState) {
        _pathfindGridState._baseCells = null;
        _pathfindGridState._baseKey = '';
    }
    if (typeof window !== 'undefined') {
        window._minimapTerrainBg = null;
        window._minimapTerrainKey = '';
    }
    supplyPoints.forEach(sp => {
        if (sp.mesh) {
            if (typeof disposeSceneNodeSafe === 'function') disposeSceneNodeSafe(sp.mesh);
            else scene.remove(sp.mesh);
        }
    });
    supplyPoints.length = 0;

    mapPropsGroup = new THREE.Group();
    scene.add(mapPropsGroup);

    // 1. 3D Sky Dome + Day / Dusk / Night Time-of-Day Atmosphere & Lighting
    applyAtmosphereAndSkybox(effectiveTheme, typeof currentMapType !== 'undefined' ? currentMapType : effectiveTheme);

    // 2. High-Resolution Displaced Terrain Mesh (256x256 on standard maps for sharp cliff ledges)
    const segments = mapSize >= 2200 ? 280 : mapSize >= 1400 ? 256 : 160;
    const geo = new THREE.PlaneGeometry(mapSize, mapSize, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const posAttr = geo.attributes.position;
    const colorArr = new Float32Array(posAttr.count * 3);
    const gridSize = segments + 1;
    for (let i = 0; i < posAttr.count; i++) {
        const vx = posAttr.getX(i);
        const vz = posAttr.getZ(i);
        posAttr.setY(i, getTerrainHeight(vx, vz));
    }
    geo.computeVertexNormals();

    const isOfficialTexMap = Boolean(officialMap && !activeCustomMap && officialMap.terrainDataUrl);
    // Compute rich macro vertex colors from height & slope
    const normAttr = geo.attributes.normal;
    for (let i = 0; i < posAttr.count; i++) {
        const h = posAttr.getY(i);
        const nx = normAttr ? normAttr.getX(i) : 0.0;
        const ny = normAttr ? normAttr.getY(i) : 1.0;
        const nz = normAttr ? normAttr.getZ(i) : 0.0;
        const slope = 1.0 - Math.max(0, Math.min(1, ny));
        let cr = 0.84, cg = 0.63, cb = 0.35;
        if (isOfficialTexMap) {
            // Authentic Zero Hour directional sun hillshading + stratified cliff-face contrast so plateaus & canyons pop
            const sunDot = Math.max(0, Math.min(1, nx * 0.55 + ny * 0.72 + nz * 0.42));
            const cliffDarken = slope > 0.08 ? Math.min(0.32, (slope - 0.08) * 1.15) : 0;
            const strata = slope > 0.10 ? Math.sin(h * 1.15) * 0.055 * Math.min(1, (slope - 0.10) * 4.0) : 0;
            const heightLift = Math.max(-0.09, Math.min(0.08, h * 0.0032));
            const shade = Math.max(0.56, Math.min(1.10, 0.72 + sunDot * 0.36 - cliffDarken + strata + heightLift));
            // Subtle warm sunlit plateau vs cool shadowed canyon rock tint
            cr = shade * (1.0 + (sunDot - 0.55) * 0.05);
            cg = shade;
            cb = shade * (1.0 - (sunDot - 0.55) * 0.06);
        } else if (effectiveTheme === 'jungle') {
            cr = 0.34; cg = 0.48; cb = 0.24;
            if (slope > 0.10) {
                const t = Math.min(1, (slope - 0.10) * 4.0);
                cr = cr * (1 - t) + 0.32 * t;
                cg = cg * (1 - t) + 0.30 * t;
                cb = cb * (1 - t) + 0.24 * t;
            } else if (h > 6.0) {
                cr = 0.42; cg = 0.54; cb = 0.28;
            }
        } else if (effectiveTheme === 'snow') {
            cr = 0.86; cg = 0.90; cb = 0.95;
            if (slope > 0.10) {
                const t = Math.min(1, (slope - 0.10) * 4.0);
                cr = cr * (1 - t) + 0.38 * t;
                cg = cg * (1 - t) + 0.43 * t;
                cb = cb * (1 - t) + 0.50 * t;
            }
        } else if (effectiveTheme === 'city') {
            cr = 0.38; cg = 0.40; cb = 0.43;
            if (slope > 0.10) { cr = 0.30; cg = 0.32; cb = 0.35; }
        } else {
            // Desert / Tournament Desert: warm ochre-gold sand + stratified canyon cliffs
            const strata = Math.sin(h * 1.6) * 0.05;
            if (slope > 0.08) {
                const t = Math.min(1, (slope - 0.08) * 4.5);
                cr = cr * (1 - t) + (0.50 + strata) * t;
                cg = cg * (1 - t) + (0.35 + strata * 0.7) * t;
                cb = cb * (1 - t) + (0.21 + strata * 0.5) * t;
            } else if (h > 6.5) {
                cr = 0.88; cg = 0.70; cb = 0.43;
            } else if (h < -0.5) {
                cr = 0.70; cg = 0.50; cb = 0.28;
            }
        }
        colorArr[i * 3] = cr;
        colorArr[i * 3 + 1] = cg;
        colorArr[i * 3 + 2] = cb;
    }
    if (typeof geo.setAttribute === 'function' && typeof THREE.BufferAttribute === 'function') {
        geo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));
    }

    const isCustom = Boolean(activeCustomMap || (mapType && mapType.startsWith('custom_')));
    let terrainTexture = null;
    if (isCustom) {
        terrainTexture = createCustomTerrainTexture(activeCustomMap);
    } else if (isOfficialTexMap && typeof document !== 'undefined' && document.createElement) {
        // Render authentic EA BlendTileData + Terrain.big + Roads map texture at 2048x2048 with both
        // baked 16x16 retail tile overlay AND multi-scale GPU detail/cliff shader for crisp close-up ground.
        const MACRO_CANVAS_RES = 2048;
        const macroCanvas = document.createElement('canvas');
        macroCanvas.width = macroCanvas.height = MACRO_CANVAS_RES;
        const mCtx = macroCanvas.getContext && macroCanvas.getContext('2d');
        if (mCtx) {
            mCtx.fillStyle = effectiveTheme === 'snow' ? '#dfe6ec' : effectiveTheme === 'jungle' ? '#50643a' : '#bfa87a';
            mCtx.fillRect(0, 0, MACRO_CANVAS_RES, MACRO_CANVAS_RES);
        }
        terrainTexture = new THREE.CanvasTexture(macroCanvas);
        terrainTexture.wrapS = terrainTexture.wrapT = THREE.ClampToEdgeWrapping;
        terrainTexture.repeat.set(1, 1);
        terrainTexture.minFilter = THREE.LinearMipmapLinearFilter;
        terrainTexture.magFilter = THREE.LinearFilter;
        terrainTexture.generateMipmaps = true;

        const detailKeyForMacro = (effectiveTheme === 'snow' || effectiveTheme === 'jungle' || effectiveTheme === 'city') ? effectiveTheme : 'desert';
        const detailUriForMacro = (typeof window !== 'undefined' && window.RETAIL_TERRAIN_TILES && window.RETAIL_TERRAIN_TILES[detailKeyForMacro]) || null;
        let loadedMacroImg = null;
        let loadedTileImg = null;
        const compositeOfficialMacroCanvas = () => {
            if (!mCtx || !loadedMacroImg) return;
            mCtx.globalCompositeOperation = 'source-over';
            mCtx.globalAlpha = 1.0;
            mCtx.imageSmoothingEnabled = true;
            mCtx.imageSmoothingQuality = 'high';
            mCtx.drawImage(loadedMacroImg, 0, 0, MACRO_CANVAS_RES, MACRO_CANVAS_RES);
            if (loadedTileImg && typeof mCtx.createPattern === 'function') {
                const pat = mCtx.createPattern(loadedTileImg, 'repeat');
                if (pat) {
                    mCtx.save();
                    mCtx.globalCompositeOperation = 'overlay';
                    mCtx.globalAlpha = 0.42;
                    mCtx.fillStyle = pat;
                    mCtx.fillRect(0, 0, MACRO_CANVAS_RES, MACRO_CANVAS_RES);
                    mCtx.restore();
                }
            }
            terrainTexture.needsUpdate = true;
        };

        const macroImg = new Image();
        macroImg.onload = function() {
            loadedMacroImg = macroImg;
            compositeOfficialMacroCanvas();
        };
        macroImg.src = officialMap.terrainDataUrl;
        if (detailUriForMacro) {
            const dImg = new Image();
            dImg.onload = function() {
                loadedTileImg = dImg;
                compositeOfficialMacroCanvas();
            };
            dImg.src = detailUriForMacro;
        }
    } else if (typeof document !== 'undefined' && document.createElement) {
        // High-resolution tiled ground texture (54x54 across map) for procedural theaters
        const tileCanvas = document.createElement('canvas');
        tileCanvas.width = tileCanvas.height = 512;
        const tCtx = tileCanvas.getContext && tileCanvas.getContext('2d');
        if (tCtx) {
            const isSnow = (effectiveTheme === 'snow');
            const isJungle = (effectiveTheme === 'jungle');
            const isCity = (effectiveTheme === 'city');
            // Warm neutral base so vertexColors drive macro hues without washing out contrast
            tCtx.fillStyle = isCity ? '#c2c6cc' : isSnow ? '#f0f4f8' : isJungle ? '#d2dec8' : '#e0cfb2';
            tCtx.fillRect(0, 0, 512, 512);

            let seed = 4242;
            const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

            // Toroidally wrapped organic dirt/grass/sand patches (zero tile seams)
            for (let i = 0; i < 450; i++) {
                const ex = rand() * 512, ey = rand() * 512;
                const rx = 8 + rand() * 28, ry = 5 + rand() * 20, rot = rand() * Math.PI;
                tCtx.fillStyle = rand() > 0.5
                ? (isCity ? 'rgba(90,95,102,0.16)' : isSnow ? 'rgba(185,202,220,0.18)' : isJungle ? 'rgba(64,88,44,0.20)' : 'rgba(145,104,54,0.18)')
                : 'rgba(255,248,234,0.15)';
                for (let ox = -512; ox <= 512; ox += 512) {
                    if (ex + ox < -40 || ex + ox > 552) continue;
                    for (let oy = -512; oy <= 512; oy += 512) {
                        if (ey + oy < -40 || ey + oy > 552) continue;
                        tCtx.beginPath();
                        tCtx.ellipse(ex + ox, ey + oy, rx, ry, rot, 0, Math.PI * 2);
                        tCtx.fill();
                    }
                }
            }

            // Periodic wind-swept sand ripples for desert/snow (exact integer period across 512px)
            if (!isCity && !isJungle) {
                const twoPi = Math.PI * 2;
                for (let y = 0; y < 512; y += 8) {
                    tCtx.strokeStyle = (y % 16 === 0) ? 'rgba(135,98,52,0.18)' : 'rgba(255,250,240,0.16)';
                    tCtx.lineWidth = 1.5;
                    tCtx.beginPath();
                    for (let x = 0; x <= 512; x += 16) {
                        const yy = y + Math.sin((x / 512) * twoPi * 4 + (y / 512) * twoPi * 6) * 2.2;
                        if (x === 0) tCtx.moveTo(x, yy); else tCtx.lineTo(x, yy);
                    }
                    tCtx.stroke();
                }
            }

            // Crisp high-frequency pebbles, gravel & mineral speckles (wrapped across edges)
            for (let i = 0; i < 7500; i++) {
                const px = rand() * 512, py = rand() * 512;
                const r = 0.55 + rand() * 2.1;
                tCtx.fillStyle = rand() > 0.42
                ? (isSnow ? 'rgba(145,165,185,0.30)' : 'rgba(68,48,28,0.32)')
                : 'rgba(255,252,245,0.22)';
                for (let ox = -512; ox <= 512; ox += 512) {
                    if (px + ox < -4 || px + ox > 516) continue;
                    for (let oy = -512; oy <= 512; oy += 512) {
                        if (py + oy < -4 || py + oy > 516) continue;
                        tCtx.beginPath();
                        tCtx.arc(px + ox, py + oy, r, 0, Math.PI * 2);
                        tCtx.fill();
                    }
                }
            }

            terrainTexture = new THREE.CanvasTexture(tileCanvas);
            terrainTexture.wrapS = terrainTexture.wrapT = THREE.RepeatWrapping;
            terrainTexture.repeat.set(54, 54);
            terrainTexture.minFilter = THREE.LinearMipmapLinearFilter;
            terrainTexture.magFilter = THREE.LinearFilter;
            terrainTexture.generateMipmaps = true;
        }
    } else {
        terrainTexture = createTerrainTextureForMap(mapType);
    }

    // On procedural maps, upgrade the repeating ground texture to the crisp retail EA tile when available
    const procDetailKey = (effectiveTheme === 'snow' || effectiveTheme === 'jungle' || effectiveTheme === 'city') ? effectiveTheme : 'desert';
    const procDetailUri = (typeof window !== 'undefined' && window.RETAIL_TERRAIN_TILES && window.RETAIL_TERRAIN_TILES[procDetailKey])
        || (effectiveTheme === 'desert' ? (typeof window !== 'undefined' && window.RETAIL_DESERT_SAND_URI) : null);
    if (!isOfficialTexMap && !isCustom && procDetailUri && typeof document !== 'undefined' && terrainTexture && terrainTexture.image) {
        const tileImg = new Image();
        tileImg.onload = function() {
            if (terrainTexture.image && typeof terrainTexture.image.getContext === 'function') {
                const pCtx = terrainTexture.image.getContext('2d');
                if (pCtx) {
                    pCtx.drawImage(tileImg, 0, 0, terrainTexture.image.width || 512, terrainTexture.image.height || 512);
                    terrainTexture.repeat.set(56, 56);
                    terrainTexture.needsUpdate = true;
                    return;
                }
            }
            terrainTexture.image = tileImg;
            terrainTexture.repeat.set(56, 56);
            terrainTexture.needsUpdate = true;
        };
        tileImg.src = procDetailUri;
    }

    // For legacy maps lacking terrainDataUrl, sample macro TGA into vertexColors
    const macroUrl = (officialMap && !isCustom && !isOfficialTexMap) ? officialMap.tgaDataUrl : null;
    if (macroUrl && typeof document !== 'undefined') {
        const aerialImg = new Image();
        aerialImg.onload = function() {
            const aSize = 256;
            const aCan = document.createElement('canvas');
            aCan.width = aCan.height = aSize;
            const aCtx = aCan.getContext('2d');
            aCtx.drawImage(aerialImg, 0, 0, aSize, aSize);
            const aData = aCtx.getImageData(0, 0, aSize, aSize).data;
            const cAttr = geo.attributes.color;
            if (cAttr) {
                for (let i = 0; i < posAttr.count; i++) {
                    const vx = posAttr.getX(i);
                    const vz = posAttr.getZ(i);
                    const u = Math.max(0, Math.min(1, (vx / mapSize) + 0.5));
                    const v = Math.max(0, Math.min(1, (vz / mapSize) + 0.5));
                    const ax = Math.min(aSize - 1, Math.floor(u * (aSize - 1)));
                    const ay = Math.min(aSize - 1, Math.floor(v * (aSize - 1)));
                    const aIdx = (ay * aSize + ax) << 2;
                    const ar = Math.max(0, Math.min(1, (124 + (aData[aIdx] - 124) * 1.15) / 255));
                    const ag = Math.max(0, Math.min(1, (122 + (aData[aIdx + 1] - 124) * 1.15) / 255));
                    const ab = Math.max(0, Math.min(1, (118 + (aData[aIdx + 2] - 124) * 1.12) / 255));
                    const br = cAttr.getX(i), bg = cAttr.getY(i), bb = cAttr.getZ(i);
                    cAttr.setXYZ(i, br * 0.25 + ar * 0.75, bg * 0.25 + ag * 0.75, bb * 0.25 + ab * 0.75);
                }
                cAttr.needsUpdate = true;
            }
        };
        aerialImg.src = macroUrl;
    }
    if (officialMap && !isCustom && officialMap.tgaDataUrl && typeof document !== 'undefined') {
        const miniImg = new Image();
        miniImg.onload = function() {
            if (window._minimapTerrainCanvas && typeof currentMapType !== 'undefined' && currentMapType === mapType) {
                const mCtx = window._minimapTerrainCanvas.getContext('2d');
                mCtx.drawImage(miniImg, 0, 0, window._minimapTerrainCanvas.width, window._minimapTerrainCanvas.height);
            }
        };
        miniImg.src = officialMap.tgaDataUrl;
    }

    if (terrainTexture && 'anisotropy' in terrainTexture) {
        terrainTexture.anisotropy = 16;
    }
    const detailTex = (typeof _getRetailTerrainDetailTex === 'function') ? _getRetailTerrainDetailTex(procDetailKey) : null;
    const cliffTex = (typeof _getRetailTerrainDetailTex === 'function') ? _getRetailTerrainDetailTex('cliff') : null;
    const detailRepeat = Math.max(48.0, Math.round(mapSize / 22));
    if (detailTex && detailTex.repeat) {
        detailTex.repeat.set(detailRepeat, detailRepeat);
    }
    // Use high-frequency repeating detailTex for bumpMap instead of the coarse macro terrainTexture
    // so close-up terrain surface relief has 8192x8192 effective texel density instead of 512px blocks.
    const terrainMat = new THREE.MeshStandardMaterial({
            map: terrainTexture,
            vertexColors: !isCustom,
            bumpMap: detailTex || terrainTexture,
            bumpScale: detailTex ? 0.18 : 0.25,
            roughness: effectiveTheme === 'snow' ? 0.78 : effectiveTheme === 'city' ? 0.86 : 0.93,
            metalness: effectiveTheme === 'snow' ? 0.12 : effectiveTheme === 'city' ? 0.08 : 0.04
    });
    // Authentic C&C Generals / Zero Hour drifting cloud shadow map (UseCloudMap = Yes, applies to ALL maps: official, imported, procedural, custom)
    if (typeof window !== 'undefined' && !window._cloudShadowTexture && typeof document !== 'undefined' && typeof THREE.CanvasTexture === 'function') {
        const cSize = 256;
        const cCanvas = document.createElement('canvas');
        cCanvas.width = cSize;
        cCanvas.height = cSize;
        const cCtx = cCanvas.getContext('2d');
        const img = (cCtx && typeof cCtx.createImageData === 'function') ? cCtx.createImageData(cSize, cSize) : null;
        if (cCtx && img && img.data) {
            const data = img.data;
            const hash2 = (ix, iy, p) => {
                const x = ((ix % p) + p) % p;
                const y = ((iy % p) + p) % p;
                let n = (x * 374761393 + y * 668265263 + p * 1442695041) | 0;
                n = (n ^ (n >>> 13)) * 1274126177;
                return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
            };
            const vNoise = (u, v, period) => {
                const fx = u * period, fy = v * period;
                const x0 = Math.floor(fx), y0 = Math.floor(fy);
                const tx = fx - x0, ty = fy - y0;
                const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
                const a = hash2(x0, y0, period);
                const b = hash2(x0 + 1, y0, period);
                const c = hash2(x0, y0 + 1, period);
                const d = hash2(x0 + 1, y0 + 1, period);
                return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
            };
            for (let py = 0; py < cSize; py++) {
                const v = py / cSize;
                for (let px = 0; px < cSize; px++) {
                    const u = px / cSize;
                    let n = vNoise(u, v, 3) * 0.54
                          + vNoise(u, v, 6) * 0.28
                          + vNoise(u, v, 12) * 0.13
                          + vNoise(u, v, 24) * 0.05;
                    // Distinct sunlit clearings and soft billowing cloud shadow banks
                    n = Math.max(0, Math.min(1, (n - 0.36) / 0.30));
                    n = n * n * (3 - 2 * n);
                    const val = Math.round(n * 255);
                    const idx = (py * cSize + px) * 4;
                    data[idx] = val;
                    data[idx + 1] = val;
                    data[idx + 2] = val;
                    data[idx + 3] = 255;
                }
            }
            cCtx.putImageData(img, 0, 0);
            const cTex = new THREE.CanvasTexture(cCanvas);
            cTex.wrapS = THREE.RepeatWrapping;
            cTex.wrapT = THREE.RepeatWrapping;
            cTex.needsUpdate = true;
            window._cloudShadowTexture = cTex;
        }
    }
    if (typeof window !== 'undefined') {
        const cloudScaleVal = Math.max(1.5, mapSize / 240.0);
        const cloudEnabled = !(window._gameOptions && window._gameOptions.cloudShadows === false);
        const fallbackTex = window._cloudShadowTexture || detailTex || terrainTexture;
        if (!window._cloudShadowUniforms) {
            window._cloudShadowUniforms = {
                uCloudMap: { value: fallbackTex },
                uCloudOffset: { value: (typeof THREE.Vector2 === 'function') ? new THREE.Vector2(0, 0) : { x: 0, y: 0 } },
                uCloudScale: { value: cloudScaleVal },
                uCloudStrength: { value: cloudEnabled ? 0.62 : 0.0 }
            };
        } else {
            window._cloudShadowUniforms.uCloudMap.value = fallbackTex;
            window._cloudShadowUniforms.uCloudScale.value = cloudScaleVal;
            window._cloudShadowUniforms.uCloudStrength.value = cloudEnabled ? 0.62 : 0.0;
        }
    }
    const _cUniforms = (typeof window !== 'undefined' && window._cloudShadowUniforms) ? window._cloudShadowUniforms : {
        uCloudMap: { value: detailTex || terrainTexture },
        uCloudOffset: { value: (typeof THREE.Vector2 === 'function') ? new THREE.Vector2(0, 0) : { x: 0, y: 0 } },
        uCloudScale: { value: 2.5 },
        uCloudStrength: { value: 0.0 }
    };

    const _hasDetailBlend = Boolean((isOfficialTexMap || isCustom) && detailTex && cliffTex && typeof document !== 'undefined');
    if (typeof document !== 'undefined' && _cUniforms.uCloudMap && _cUniforms.uCloudMap.value) {
        const detailStrength = effectiveTheme === 'snow' ? 0.85 : 1.05;
        const meanMap = {
            desert: [0.82, 0.65, 0.30],
            jungle: [0.40, 0.48, 0.18],
            snow:   [0.83, 0.82, 0.75],
            city:   [0.78, 0.63, 0.36]
        };
        const mRgb = meanMap[procDetailKey] || meanMap.desert;
        const uDetailMean = (typeof THREE.Vector3 === 'function') ? new THREE.Vector3(mRgb[0], mRgb[1], mRgb[2]) : { x: mRgb[0], y: mRgb[1], z: mRgb[2] };
        const uCliffMean = (typeof THREE.Vector3 === 'function') ? new THREE.Vector3(0.78, 0.66, 0.46) : { x: 0.78, y: 0.66, z: 0.46 };

        terrainMat.customProgramCacheKey = () => (_hasDetailBlend ? 'terrain_detail_clouds_v4_' + procDetailKey : 'terrain_clouds_only_v4');
        terrainMat.onBeforeCompile = (shader) => {
            shader.uniforms.uCloudMap = _cUniforms.uCloudMap;
            shader.uniforms.uCloudOffset = _cUniforms.uCloudOffset;
            shader.uniforms.uCloudScale = _cUniforms.uCloudScale;
            shader.uniforms.uCloudStrength = _cUniforms.uCloudStrength;
            if (_hasDetailBlend) {
                shader.uniforms.uDetailMap = { value: detailTex };
                shader.uniforms.uCliffMap = { value: cliffTex };
                shader.uniforms.uDetailRepeat = { value: detailRepeat };
                shader.uniforms.uDetailStrength = { value: detailStrength };
                shader.uniforms.uDetailMean = { value: uDetailMean };
                shader.uniforms.uCliffMean = { value: uCliffMean };
            }
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nvarying float vTerrainSlope;\nvarying vec2 vTerrainUv;')
                .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerrainSlope = 1.0 - clamp( normal.y, 0.0, 1.0 );\nvTerrainUv = uv;');
            const detailUniformDecls = _hasDetailBlend
                ? 'uniform sampler2D uDetailMap;\nuniform sampler2D uCliffMap;\nuniform float uDetailRepeat;\nuniform float uDetailStrength;\nuniform vec3 uDetailMean;\nuniform vec3 uCliffMean;\n'
                : '';
            const detailFragBody = _hasDetailBlend ? `
                    vec2 dUv1 = vTerrainUv * uDetailRepeat;
                    vec2 dUv2 = mat2( 0.80, -0.60, 0.60, 0.80 ) * ( vTerrainUv * ( uDetailRepeat * 2.85 ) );
                    vec3 dTex1 = texture2D( uDetailMap, dUv1 ).rgb - uDetailMean;
                    vec3 dTex2 = texture2D( uDetailMap, dUv2 ).rgb - uDetailMean;
                    vec3 groundDelta = ( dTex1 * 0.72 + dTex2 * 0.48 ) * uDetailStrength;
                    vec3 cTex1 = texture2D( uCliffMap, dUv1 * 0.75 ).rgb - uCliffMean;
                    vec3 cTex2 = texture2D( uCliffMap, dUv2 * 0.55 ).rgb - uCliffMean;
                    vec3 cliffDelta = ( cTex1 * 0.85 + cTex2 * 0.55 ) * ( uDetailStrength * 1.15 );
                    float slopeMix = smoothstep( 0.12, 0.36, vTerrainSlope );
                    vec3 finalDelta = mix( groundDelta, cliffDelta, slopeMix );
                    diffuseColor.rgb = clamp( diffuseColor.rgb * ( vec3( 1.0 ) + finalDelta * 0.85 ) + finalDelta * 0.14, 0.0, 1.0 );
            ` : '';
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', `#include <common>\n${detailUniformDecls}uniform sampler2D uCloudMap;\nuniform vec2 uCloudOffset;\nuniform float uCloudScale;\nuniform float uCloudStrength;\nvarying float vTerrainSlope;\nvarying vec2 vTerrainUv;`)
                .replace('#include <map_fragment>', `#include <map_fragment>${detailFragBody}
                    if ( uCloudStrength > 0.001 ) {
                        vec2 cUv1 = vTerrainUv * uCloudScale + uCloudOffset;
                        vec2 cUv2 = vTerrainUv * ( uCloudScale * 1.55 ) + uCloudOffset * 0.72 + vec2( 0.37, 0.19 );
                        float cMask = texture2D( uCloudMap, cUv1 ).r * 0.68 + texture2D( uCloudMap, cUv2 ).r * 0.32;
                        vec3 cloudTint = mix( vec3( 1.06, 1.04, 0.99 ), vec3( 0.42, 0.47, 0.58 ), cMask );
                        diffuseColor.rgb *= mix( vec3( 1.0 ), cloudTint, uCloudStrength );
                    }
                `);
        };
    }
    terrainMesh = new THREE.Mesh(geo, terrainMat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    // 2b. Seamless Outer Terrain Horizon Apron (extends 520u beyond all 4 playable edges so terrain blends into horizon fog instead of cutting off)
    if (typeof THREE.BufferGeometry === 'function' && typeof THREE.Float32BufferAttribute === 'function') {
        const halfM = mapSize * 0.5;
        const apronW = 520;
        const outerM = halfM + apronW;
        const segs = 36;
        const apronPositions = [];
        const apronIndices = [];
        const addStrip = (innerPts, outerPts) => {
            const baseIdx = apronPositions.length / 3;
            for (let i = 0; i <= segs; i++) {
                const ip = innerPts[i];
                const op = outerPts[i];
                apronPositions.push(ip[0], ip[1], ip[2]);
                apronPositions.push(op[0], op[1], op[2]);
                if (i < segs) {
                    const a = baseIdx + i * 2;
                    const b = a + 1;
                    const c = a + 2;
                    const d = a + 3;
                    apronIndices.push(a, c, b, b, c, d);
                }
            }
        };
        // North (-Z), South (+Z), West (-X), East (+X) stitched cleanly to edge heights
        const makeEdge = (axis, sign) => {
            const inner = [], outer = [];
            for (let i = 0; i <= segs; i++) {
                const u = (i / segs) * 2 - 1; // -1 .. +1
                const ix = axis === 'z' ? u * halfM : sign * halfM;
                const iz = axis === 'z' ? sign * halfM : u * halfM;
                const ox = axis === 'z' ? u * outerM : sign * outerM;
                const oz = axis === 'z' ? sign * outerM : u * outerM;
                const hIn = (typeof getRawTerrainHeight === 'function') ? getRawTerrainHeight(ix, iz) : 0;
                const hOut = hIn * 0.35 - 1.5;
                inner.push([ix, hIn - 0.08, iz]);
                outer.push([ox, hOut, oz]);
            }
            if ((axis === 'z' && sign < 0) || (axis === 'x' && sign > 0)) addStrip(inner, outer);
            else addStrip(outer, inner);
        };
        makeEdge('z', -1);
        makeEdge('z', 1);
        makeEdge('x', -1);
        makeEdge('x', 1);

        const apronGeo = new THREE.BufferGeometry();
        apronGeo.setAttribute('position', new THREE.Float32BufferAttribute(apronPositions, 3));
        apronGeo.setIndex(apronIndices);
        apronGeo.computeVertexNormals();
        const apronColor = effectiveTheme === 'snow' ? 0xcad6e0
            : (effectiveTheme === 'city' ? 0x62686e
            : (effectiveTheme === 'jungle' ? 0x4c613d
            : (effectiveTheme === 'grassland' ? 0x637847 : 0xb89f76)));
        const apronMat = new THREE.MeshStandardMaterial({
            color: apronColor,
            roughness: 0.96,
            metalness: 0.02,
            side: THREE.DoubleSide
        });
        const apronMesh = new THREE.Mesh(apronGeo, apronMat);
        apronMesh.name = 'terrainHorizonApron';
        apronMesh.receiveShadow = false;
        mapPropsGroup.add(apronMesh);
    }

    // 3. Water Body (per-map waterLevel on official maps so river/lake maps render water while dry canyons stay passable)
    mapBridges.length = 0; // Clear previous bridges
    let waterLevel = (officialMap && officialMap.waterLevel !== undefined)
    ? Number(officialMap.waterLevel)
    : ((effectiveTheme === 'desert' || effectiveTheme === 'tournament_desert') ? -999.0 : -1.0);
    let waterColor = 0x0984e3;
    let waterOpacity = 0.82;

    if (effectiveTheme === 'desert') { waterColor = 0x0abde3; waterOpacity = 0.82; }
    else if (effectiveTheme === 'jungle') { waterColor = 0x00cec9; waterOpacity = 0.85; }
    else if (effectiveTheme === 'snow') { waterColor = 0x74b9ff; waterOpacity = 0.88; }
    else if (effectiveTheme === 'city') { waterColor = 0x2d3436; waterOpacity = 0.88; }

    if (mapType === 'random') {
        waterColor = 0x1b7094; waterOpacity = 0.86;
    }

    if (activeCustomMap && activeCustomMap.waterLevel !== undefined) {
        waterLevel = Number(activeCustomMap.waterLevel);
    }
    currentWaterLevel = waterLevel;

    const waterGeo = new THREE.PlaneGeometry(mapSize * 0.95, mapSize * 0.95);
    const waterMat = new THREE.MeshStandardMaterial({
            color: waterColor, roughness: 0.12, metalness: 0.85,
            transparent: true, opacity: waterOpacity
    });
    waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.y = waterLevel;
    waterMesh.visible = (waterLevel > -100);
    waterMesh.receiveShadow = true;
    scene.add(waterMesh);

    // Render localized PolygonTriggers water pools (e.g., oases/basins on dry maps)
    if (officialMap && !isCustom && Array.isArray(officialMap.waterPolygons) && typeof THREE.Shape === 'function' && typeof THREE.ShapeGeometry === 'function') {
        officialMap.waterPolygons.forEach(wp => {
                if (!wp || !Array.isArray(wp.points) || wp.points.length < 3) return;
                const shape = new THREE.Shape();
                wp.points.forEach((pt, idx) => {
                        const sx = pt[0] * mapSize;
                        const sy = -pt[1] * mapSize;
                        if (idx === 0) shape.moveTo(sx, sy);
                        else shape.lineTo(sx, sy);
                });
                shape.closePath();
                const pGeo = new THREE.ShapeGeometry(shape);
                pGeo.rotateX(-Math.PI / 2);
                const pMesh = new THREE.Mesh(pGeo, waterMat);
                pMesh.position.y = wp.waterY !== undefined ? wp.waterY : -0.8;
                pMesh.receiveShadow = true;
                pMesh.userData.isWaterMesh = true;
                mapPropsGroup.add(pMesh);
        });
    }

    // 4. Procedural Trees, Rocks & City Buildings
    spawnMapProps(effectiveTheme, mapSize);

    // 5. Distributed Supply Fields
    createSupplyFieldsForMap(mapSize);

    // 6. Dynamic Fog of War (C&C Shroud)
    initFogOfWar(mapSize);

    // 7. Build cached 2D Top-Down Terrain Canvas for the In-Game Radar Minimap
    if (typeof document !== 'undefined') {
        const miniCanvas = document.createElement('canvas');
        miniCanvas.width = 256;
        miniCanvas.height = 256;
        const mCtx = miniCanvas.getContext('2d');
        const drawProceduralRelief = () => {
            const step = mapSize / 256;
            for (let py = 0; py < 256; py += 2) {
                const wz = ((py / 255) - 0.5) * mapSize;
                for (let px = 0; px < 256; px += 2) {
                    const wx = ((px / 255) - 0.5) * mapSize;
                    const h = getRawTerrainHeight(wx, wz);
                    if (waterLevel > -100 && h < waterLevel) {
                        mCtx.fillStyle = effectiveTheme === 'snow' ? '#54a0ff' : '#1e6b9b';
                    } else {
                        // Directional sun hillshading so ridges, cliffs and canyons pop like the official game
                        const hx = getRawTerrainHeight(wx + step * 2, wz) - h;
                        const hz = getRawTerrainHeight(wx, wz + step * 2) - h;
                        const shade = (hx * -14) + (hz * -10);
                        const b = Math.max(40, Math.min(248, Math.floor(138 + h * 7 + shade)));
                        if (effectiveTheme === 'jungle') mCtx.fillStyle = `rgb(${Math.floor(b * 0.42)}, ${Math.floor(b * 0.72)}, ${Math.floor(b * 0.34)})`;
                        else if (effectiveTheme === 'snow') mCtx.fillStyle = `rgb(${b}, ${Math.min(255, b + 8)}, ${Math.min(255, b + 16)})`;
                        else if (effectiveTheme === 'city') mCtx.fillStyle = `rgb(${Math.floor(b * 0.45)}, ${Math.floor(b * 0.48)}, ${Math.floor(b * 0.52)})`;
                        else mCtx.fillStyle = `rgb(${b}, ${Math.floor(b * 0.82)}, ${Math.floor(b * 0.56)})`;
                    }
                    mCtx.fillRect(px, py, 2, 2);
                }
            }
            // Bake static map obstacles (trees, rocks, urban blocks) onto the miniature map
            if (mapObstacles && mapObstacles.length > 0) {
                mapObstacles.forEach(ob => {
                        const ox = ((ob.x / mapSize) + 0.5) * 256;
                        const oz = ((ob.z / mapSize) + 0.5) * 256;
                        mCtx.fillStyle = effectiveTheme === 'jungle' ? 'rgba(20, 55, 18, 0.75)' :
                        effectiveTheme === 'city' ? 'rgba(95, 105, 115, 0.85)' :
                        effectiveTheme === 'snow' ? 'rgba(90, 110, 125, 0.75)' :
                        'rgba(95, 72, 42, 0.75)';
                        const r = Math.max(1.5, (ob.radius / mapSize) * 256);
                        mCtx.fillRect(ox - r, oz - r, r * 2, r * 2);
                });
            }
        };

        drawProceduralRelief();
        window._minimapTerrainCanvas = miniCanvas;
    }
}

// --- THEMATIC 3D ENVIRONMENT PROPS ---

// 7. Desert Saguaro Cactus
function createCactusMesh() {
    const g = new THREE.Group();
    const cactusMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.85 });

    // Main trunk
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 5.2, 8), cactusMat);
    trunk.position.y = 2.6; trunk.castShadow = true; g.add(trunk);

    // Left arm
    const armL1 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.4, 8), cactusMat);
    armL1.rotation.z = Math.PI / 2; armL1.position.set(-0.9, 2.6, 0); g.add(armL1);
    const armL2 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.8, 8), cactusMat);
    armL2.position.set(-1.6, 3.3, 0); armL2.castShadow = true; g.add(armL2);

    // Right arm (higher)
    const armR1 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.4, 8), cactusMat);
    armR1.rotation.z = -Math.PI / 2; armR1.position.set(0.9, 3.4, 0); g.add(armR1);
    const armR2 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.8, 8), cactusMat);
    armR2.position.set(1.6, 4.1, 0); armR2.castShadow = true; g.add(armR2);

    return g;
}

// 8. Desert Oil Pipeline Segmen
function createPipelineMesh(length = 18) {
    const g = new THREE.Group();
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x636e72, roughness: 0.6, metalness: 0.65 });
    const supportMat = new THREE.MeshStandardMaterial({ color: 0x2d3436, roughness: 0.9 });

    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, length, 12), pipeMat);
    pipe.rotation.z = Math.PI / 2; pipe.position.y = 1.6; pipe.castShadow = true; g.add(pipe);

    // Concrete support footings
    for (let x = -length * 0.4; x <= length * 0.4; x += length * 0.4) {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 1.8), supportMat);
        foot.position.set(x, 0.9, 0); foot.castShadow = true; g.add(foot);
    }
    return g;
}

// 9. Jungle Riverbank Reeds & Wetland Cattails
function createReedMesh() {
    const g = new THREE.Group();
    const stalkMat = new THREE.MeshStandardMaterial({ color: 0x27ae60, roughness: 0.85 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.95 });

    for (let i = 0; i < 9; i++) {
        const ang = (i * Math.PI * 2) / 9;
        const dist = 0.4 + (i % 3) * 0.25;
        const h = 2.2 + (i % 4) * 0.5;
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, h, 6), stalkMat);
        stalk.position.set(Math.cos(ang) * dist, h * 0.5, Math.sin(ang) * dist);
        stalk.rotation.x = (Math.random() - 0.5) * 0.15;
        stalk.rotation.z = (Math.random() - 0.5) * 0.15;
        g.add(stalk);

        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 6), headMat);
        head.position.set(stalk.position.x, h - 0.3, stalk.position.z);
        g.add(head);
    }
    return g;
}

// 10. Jungle Tropical Fern Patch
function createFernMesh() {
    const g = new THREE.Group();
    const fernMat = new THREE.MeshStandardMaterial({ color: 0x1abc9c, roughness: 0.8, side: THREE.DoubleSide });
    for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI * 2) / 8;
        const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.4), fernMat);
        frond.position.set(Math.cos(ang) * 0.7, 0.6, Math.sin(ang) * 0.7);
        frond.rotation.y = ang + Math.PI / 2;
        frond.rotation.x = 0.55;
        frond.castShadow = true;
        g.add(frond);
    }
    return g;
}

// 11. Snow Sharp Ice Spikes / Crevasse Crystals
function createIceSpikeMesh() {
    const g = new THREE.Group();
    const iceMat = new THREE.MeshStandardMaterial({
            color: 0x74b9ff, roughness: 0.15, metalness: 0.75,
            transparent: true, opacity: 0.85
    });
    for (let i = 0; i < 6; i++) {
        const h = 2.4 + (i % 3) * 1.2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.4 + (i % 3) * 0.2, h, 5), iceMat);
        const a = i * 1.1;
        spike.position.set(Math.cos(a) * (1.2 + (i % 2) * 0.6), h * 0.5, Math.sin(a) * (1.2 + (i % 2) * 0.6));
        spike.rotation.set((Math.random() - 0.5) * 0.25, Math.random() * Math.PI, (Math.random() - 0.5) * 0.25);
        spike.castShadow = true;
        g.add(spike);
    }
    return g;
}

// 12. City Arched Steel Streetligh
function createStreetLightMesh() {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7.5, 8), matDarkMetal);
    post.position.y = 3.75; post.castShadow = true; g.add(post);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 0.2), matDarkMetal);
    arm.position.set(0.7, 7.3, 0); g.add(arm);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.4), matGunmetal);
    head.position.set(1.4, 7.2, 0); g.add(head);

    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.3), new THREE.MeshStandardMaterial({ color: 0xffea00, emissive: 0xffd32a, emissiveIntensity: 0.8 }));
    lamp.position.set(1.4, 7.08, 0); g.add(lamp);

    return g;
}

// 13. City Burnt-Out Combat Vehicle Wreck
function createWreckCarMesh() {
    const g = new THREE.Group();
    const rustMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.95 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e272e, roughness: 0.9 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.75, 4.4), rustMat);
    body.position.y = 0.55; body.castShadow = true; g.add(body);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 2.2), darkMat);
    cab.position.set(0, 1.15, -0.2); cab.castShadow = true; g.add(cab);

    // Destroyed wheels
    [[-1.15, 0.35, 1.4], [1.15, 0.35, 1.4], [-1.15, 0.35, -1.4], [1.15, 0.35, -1.4]].forEach(([wx, wy, wz]) => {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 8), darkMat);
            wheel.rotation.z = Math.PI / 2; wheel.position.set(wx, wy, wz); g.add(wheel);
    });
    return g;
}

const _roadRibbonMatCache = {};
function _getRoadRibbonMaterial(kind) {
    const key = kind === 'dirt' ? 'dirt' : 'asphalt';
    if (_roadRibbonMatCache[key]) return _roadRibbonMatCache[key];
    let tex = null;
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        const can = document.createElement('canvas');
        can.width = 128;
        can.height = 128;
        const ctx = can.getContext && can.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, 128, 128);
            if (key === 'asphalt') {
                // Soft dusty shoulder fade -> dark weathered Generals asphalt -> faded dashed yellow centerline
                const grad = ctx.createLinearGradient(0, 0, 128, 0);
                grad.addColorStop(0.0, 'rgba(92,86,74,0.0)');
                grad.addColorStop(0.10, 'rgba(84,80,72,0.75)');
                grad.addColorStop(0.16, 'rgba(54,56,58,0.96)');
                grad.addColorStop(0.50, 'rgba(62,64,66,0.96)');
                grad.addColorStop(0.84, 'rgba(54,56,58,0.96)');
                grad.addColorStop(0.90, 'rgba(84,80,72,0.75)');
                grad.addColorStop(1.0, 'rgba(92,86,74,0.0)');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, 128, 128);
                // Edge white/dust lines
                ctx.fillStyle = 'rgba(186,182,168,0.42)';
                ctx.fillRect(20, 0, 3, 128);
                ctx.fillRect(105, 0, 3, 128);
                // Faded dashed yellow highway centerline
                ctx.fillStyle = 'rgba(208,176,74,0.78)';
                ctx.fillRect(62, 12, 4, 42);
                ctx.fillRect(62, 76, 4, 42);
            } else {
                // Packed desert / dirt military road with wheel ruts & soft feathered edges
                const grad = ctx.createLinearGradient(0, 0, 128, 0);
                grad.addColorStop(0.0, 'rgba(138,116,84,0.0)');
                grad.addColorStop(0.14, 'rgba(138,116,84,0.72)');
                grad.addColorStop(0.32, 'rgba(104,88,64,0.88)');
                grad.addColorStop(0.50, 'rgba(128,108,78,0.82)');
                grad.addColorStop(0.68, 'rgba(104,88,64,0.88)');
                grad.addColorStop(0.86, 'rgba(138,116,84,0.72)');
                grad.addColorStop(1.0, 'rgba(138,116,84,0.0)');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, 128, 128);
            }
            tex = new THREE.CanvasTexture(can);
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            if ('anisotropy' in tex) tex.anisotropy = 8;
        }
    }
    const mat = new THREE.MeshStandardMaterial({
        map: tex,
        color: key === 'asphalt' ? 0xffffff : 0xdfd3be,
        roughness: 0.94,
        metalness: 0.04,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
    });
    _roadRibbonMatCache[key] = mat;
    return mat;
}

function spawnMapRoads(mapType, mapSize) {
    if (!mapPropsGroup) return;
    const offMap = window.OFFICIAL_SKIRMISH_MAPS && window.OFFICIAL_SKIRMISH_MAPS[mapType];
    const segments = [];

    if (offMap && Array.isArray(offMap.roads) && offMap.roads.length > 0) {
        for (let i = 0; i < offMap.roads.length; i++) {
            const r = offMap.roads[i];
            if (!Array.isArray(r) || r.length < 4) continue;
            segments.push({
                x1: r[0] * mapSize,
                z1: r[1] * mapSize,
                x2: r[2] * mapSize,
                z2: r[3] * mapSize,
                kind: r[4] === 'dirt' ? 'dirt' : 'asphalt'
            });
        }
    } else if (_activeProceduralRoads.length > 0) {
        for (let i = 0; i < _activeProceduralRoads.length; i++) {
            segments.push(_activeProceduralRoads[i]);
        }
    }
    if (segments.length === 0) return;

    // Batch all segments per road material into 1 merged BufferGeometry (at most 2 draw calls total!)
    const buckets = { asphalt: { pos: [], uv: [], idx: [] }, dirt: { pos: [], uv: [], idx: [] } };
    for (let s = 0; s < segments.length; s++) {
        const seg = segments[s];
        const dx = seg.x2 - seg.x1;
        const dz = seg.z2 - seg.z1;
        const len = Math.hypot(dx, dz);
        if (len < 2.0) continue;
        const kind = seg.kind === 'dirt' ? 'dirt' : 'asphalt';
        const b = buckets[kind];
        const halfW = kind === 'dirt' ? 4.6 : 5.4;
        const nx = -dz / len;
        const nz = dx / len;
        const steps = Math.max(2, Math.min(48, Math.ceil(len / 9)));
        let vOffset = b.pos.length / 3;
        let prevValid = false;

        for (let k = 0; k <= steps; k++) {
            const frac = k / steps;
            const cx = seg.x1 + dx * frac;
            const cz = seg.z1 + dz * frac;
            const cy = getTerrainHeight(cx, cz);
            // Skip submerged river channel slices where bridges span above water
            if (cy < currentWaterLevel + 0.15) {
                prevValid = false;
                continue;
            }
            const lx = cx + nx * halfW;
            const lz = cz + nz * halfW;
            const rx = cx - nx * halfW;
            const rz = cz - nz * halfW;
            const ly = getTerrainHeight(lx, lz) + 0.16;
            const ry = getTerrainHeight(rx, rz) + 0.16;
            const vCoord = (frac * len) / 14.0;
            const curBase = b.pos.length / 3;
            b.pos.push(lx, ly, lz, rx, ry, rz);
            b.uv.push(0, vCoord, 1, vCoord);
            if (prevValid) {
                b.idx.push(vOffset, curBase, vOffset + 1, vOffset + 1, curBase, curBase + 1);
            }
            vOffset = curBase;
            prevValid = true;
        }
    }

    ['asphalt', 'dirt'].forEach(kind => {
        const b = buckets[kind];
        if (b.idx.length === 0) return;
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
        geom.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
        geom.setIndex(b.idx);
        geom.computeVertexNormals();
        const roadMesh = new THREE.Mesh(geom, _getRoadRibbonMaterial(kind));
        roadMesh.name = 'mapRoads_' + kind;
        roadMesh.receiveShadow = true;
        mapPropsGroup.add(roadMesh);
    });
}

// Spawn Map Props (100% Official EA W3D Trees, Bushes, Rocks & Civilian Buildings + Roads)
function spawnMapProps(theme, mapSize) {
    const offMap = window.OFFICIAL_SKIRMISH_MAPS && window.OFFICIAL_SKIRMISH_MAPS[currentMapType];

    // 1. Spawn Bridges FIRST so props & AI clearance rules always respect every bridge
    if (activeCustomMap && activeCustomMap.bridges && activeCustomMap.bridges.length > 0) {
        activeCustomMap.bridges.forEach(b => {
                const by = (activeCustomMap.waterLevel !== undefined ? Number(activeCustomMap.waterLevel) : -1.0) + 1.8;
                spawnBridge(b.x, by, b.z, b.angle || 0, b.width || 20, b.length || 60);
        });
    } else if (!activeCustomMap && !offMap) {
        if (currentMapType === 'jungle') {
            const x1 = -mapSize * 0.24;
            const z1 = Math.sin(x1 * 0.012) * (mapSize * 0.09);
            spawnBridge(x1, 1.0, z1, 0, 22, 60);

            const x2 = 0;
            const z2 = Math.sin(x2 * 0.012) * (mapSize * 0.09);
            spawnBridge(x2, 1.0, z2, 0, 22, 60);

            const x3 = mapSize * 0.24;
            const z3 = Math.sin(x3 * 0.012) * (mapSize * 0.09);
            spawnBridge(x3, 1.0, z3, 0, 22, 60);
        } else if (currentMapType === 'city') {
            spawnBridge(mapSize * 0.05, 1.0, -mapSize * 0.24, Math.PI / 2, 22, 56);
            spawnBridge(mapSize * 0.05, 1.0, 0, Math.PI / 2, 22, 56);
            spawnBridge(mapSize * 0.05, 1.0, mapSize * 0.24, Math.PI / 2, 22, 56);
        } else if (currentMapType === 'snow') {
            spawnBridge(0, 1.0, 0, 0, 22, 64);
        } else if (currentMapType === 'random') {
            const rx1 = -mapSize * 0.24;
            const rz1 = Math.sin(rx1 * 0.014 + randomMapSeed) * (mapSize * 0.10);
            spawnBridge(rx1, 1.0, rz1, 0, 22, 60);

            const rx2 = 0;
            const rz2 = Math.sin(randomMapSeed) * (mapSize * 0.10);
            spawnBridge(rx2, 1.0, rz2, 0, 22, 60);

            const rx3 = mapSize * 0.24;
            const rz3 = Math.sin(rx3 * 0.014 + randomMapSeed) * (mapSize * 0.10);
            spawnBridge(rx3, 1.0, rz3, 0, 22, 60);
        }
    }

    // 2. Render crisp terrain-conforming 3D road ribbons (official Maps.big/MapsZH.big roads + procedural AI highways)
    spawnMapRoads(currentMapType, mapSize);

    const spawnOfficialProp = (w3dKey, x, y, z, rotY, scaleMult = 1.0) => {
        if (typeof createW3DBuildingMesh !== 'function' || !window.W3D_BUILDING_DATA || !window.W3D_BUILDING_DATA[w3dKey]) return null;
        const m = createW3DBuildingMesh(w3dKey, false);
        m.position.set(x, y, z);
        m.rotation.y = rotY;
        if (scaleMult !== 1.0) m.scale.multiplyScalar(scaleMult);
        mapPropsGroup.add(m);
        return m;
    };

    // 3. If custom map has explicit props, spawn official EA W3D assets only
    if (activeCustomMap && activeCustomMap.props && activeCustomMap.props.length > 0) {
        activeCustomMap.props.forEach(p => {
                const py = getTerrainHeight(p.x, p.z);
                if (theme === 'desert') {
                    const palm = spawnOfficialProp('prop_palm', p.x, py, p.z, (p.x + p.z) % 6.28);
                    if (palm) mapObstacles.push({ position: new THREE.Vector3(p.x, py, p.z), radius: 1.8, kind: 'palm', mesh: palm, crushable: true, toppled: false });
                } else if (theme === 'jungle' || theme === 'snow') {
                    const tree = spawnOfficialProp('prop_tree', p.x, py, p.z, (p.x + p.z) % 6.28);
                    if (tree) mapObstacles.push({ position: new THREE.Vector3(p.x, py, p.z), radius: 2.2, kind: 'tree', mesh: tree, crushable: true, toppled: false });
                } else if (theme === 'city') {
                    const urbanKeys = ['civilian_euro', 'civilian_soviet', 'civilian_house2'];
                    const uKey = urbanKeys[Math.abs(Math.round(p.x + p.z)) % urbanKeys.length];
                    const building = spawnOfficialProp(uKey, p.x, py, p.z, 0);
                    if (building) {
                        mapObstacles.push({ position: new THREE.Vector3(p.x, py, p.z), radius: 5.5 });
                        registerWorldBuilding(building, p.x, py, p.z, 0, 5.5, false, uKey);
                    }
                }
        });
    }

    // 4. Map props: use authentic EA ObjectsList props on official maps (no random procedural clutter!)
    if (offMap && !activeCustomMap && Array.isArray(offMap.props) && offMap.props.length > 0) {
        offMap.props.forEach(p => {
                const x = p[0] * mapSize;
                const z = p[1] * mapSize;
                const kind = p[2];
                const y = getTerrainHeight(x, z);
                if (y < currentWaterLevel + 0.3) return;
                if (kind === 'palm') {
                    const palm = spawnOfficialProp('prop_palm', x, y, z, (x + z) % 6.28);
                    if (palm) mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 1.6, kind: 'palm', mesh: palm, crushable: true, toppled: false });
                } else if (kind === 'tree') {
                    const tree = spawnOfficialProp('prop_tree', x, y, z, (x + z) % 6.28);
                    if (tree) mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 2.0, kind: 'tree', mesh: tree, crushable: true, toppled: false });
                } else if (kind === 'bush') {
                    const bush = spawnOfficialProp('prop_bush', x, y, z, (x + z) % 6.28);
                    if (bush) mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 1.1, kind: 'bush', mesh: bush, crushable: true, toppled: false, nonBlocking: true });
                } else if (kind === 'rock') {
                    const rock = spawnOfficialProp('prop_rock', x, y, z, (x + z) % 6.28);
                    if (rock) mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 2.2 });
                }
        });
        // Spawn official EA bridges & civilian structures/bunkers from ObjectsList
        if (Array.isArray(offMap.bridges)) {
            offMap.bridges.forEach(b => {
                    const bx = b.nx * mapSize, bz = b.nz * mapSize;
                    const bAngle = b.angle || 0;
                    const bWidth = b.width || 20;
                    const bLen = b.span ? Math.max(66, Math.round(b.span * mapSize) + 18) : 64;
                    const endOffset = bLen * 0.48;
                    const end1H = getTerrainHeight(bx - Math.sin(bAngle) * endOffset, bz - Math.cos(bAngle) * endOffset);
                    const end2H = getTerrainHeight(bx + Math.sin(bAngle) * endOffset, bz + Math.cos(bAngle) * endOffset);
                    const scaledDeckH = (b.deckH !== undefined)
                        ? b.deckH * ((typeof getOfficialMapVerticalScale === 'function') ? getOfficialMapVerticalScale(mapSize) : 1.0)
                        : -999;
                    const bankY = Math.max(scaledDeckH, end1H, end2H, getTerrainHeight(bx, bz));
                    const by = (currentWaterLevel > -100)
                        ? Math.max(bankY, currentWaterLevel + 1.15)
                        : bankY;
                    spawnBridge(bx, by, bz, bAngle, bWidth, bLen);
            });
        }
        if (Array.isArray(offMap.buildings)) {
            const mapTheme = ((offMap.theme || theme || '') + '').toLowerCase();
            const civPool = mapTheme === 'desert'
                ? ['civilian_desert_house', 'civilian_house1', 'civilian_house2', 'civilian_hangar']
                : mapTheme === 'snow'
                    ? ['civilian_chalet', 'civilian_soviet', 'civilian_cottage', 'civilian_hangar']
                    : mapTheme === 'city'
                        ? ['civilian_euro', 'civilian_house2', 'civilian_soviet', 'civilian_hangar']
                        : ['civilian_cottage', 'civilian_house1', 'civilian_house2', 'civilian_hangar'];
            offMap.buildings.forEach((bld, bIdx) => {
                    const bx = bld[0] * mapSize, bz = bld[1] * mapSize;
                    const angle = bld[2] || 0;
                    const kind = bld[3] || 'civilian';
                    const by = getTerrainHeight(bx, bz);
                    let mesh = null;
                    let usedModelKey = null;
                    let yPos = by;
                    if (kind === 'bunker' && typeof createW3DBuildingMesh === 'function' && window.W3D_BUILDING_DATA && window.W3D_BUILDING_DATA['civilian_bunker']) {
                        mesh = createW3DBuildingMesh('civilian_bunker', false);
                        usedModelKey = 'civilian_bunker';
                        // CBBunker01.W3D already has its floor at Y=0 and a deep -31.4 foundation skirt for hillsides
                        yPos = by;
                    } else if (kind === 'bunker' && typeof createChinaBunker === 'function') {
                        mesh = createChinaBunker(false);
                        mesh.scale.set(0.95, 0.95, 0.95);
                    } else if (typeof createW3DBuildingMesh === 'function' && window.W3D_BUILDING_DATA) {
                        const civKey = civPool[bIdx % civPool.length];
                        if (window.W3D_BUILDING_DATA[civKey]) {
                            mesh = createW3DBuildingMesh(civKey, false);
                            usedModelKey = civKey;
                        }
                    }
                    if (!mesh) {
                        mesh = new THREE.Group();
                        const body = new THREE.Mesh(
                            new THREE.BoxGeometry(9.0, 5.5, 7.5),
                            typeof matConcrete !== 'undefined' ? matConcrete : new THREE.MeshStandardMaterial({ color: 0xb5a68c, roughness: 0.9 })
                        );
                        body.position.y = 2.75;
                        body.castShadow = true;
                        body.receiveShadow = true;
                        const roof = new THREE.Mesh(
                            new THREE.BoxGeometry(9.4, 0.5, 7.9),
                            typeof matDarkMetal !== 'undefined' ? matDarkMetal : new THREE.MeshStandardMaterial({ color: 0x3b3b3b, roughness: 0.7 })
                        );
                        roof.position.y = 5.65;
                        mesh.add(body, roof);
                    }
                    // Official .map angles use 0 = +X (East), while CBBunker01.W3D front embrasures face +Z -> add +PI/2 so bunkers face inward as designed
                    const finalAngle = (usedModelKey === 'civilian_bunker') ? (angle + Math.PI / 2) : angle;
                    mesh.position.set(bx, yPos, bz);
                    mesh.rotation.y = finalAngle;
                    mapPropsGroup.add(mesh);
                    const wbRadius = kind === 'bunker' ? 5.0 : 6.0;
                    mapObstacles.push({ position: new THREE.Vector3(bx, by, bz), radius: wbRadius });
                    registerWorldBuilding(mesh, bx, by, bz, finalAngle, wbRadius, kind === 'bunker', usedModelKey);
            });
        }
    } else {
        // Procedural Map Rules:
        // 1. 100% official EA W3D assets only (trees, palms, bushes, rocks, garrisonable civilian buildings).
        // 2. Strict AI pathfinding clearance along every road corridor, spawn plateau, bridge, and supply dock.
        const count = activeCustomMap
        ? Math.min(32, Math.floor(mapSize * 0.035))
        : (mapSize > 1000 ? 110 : mapSize > 750 ? 80 : 52);
        const bound = mapSize * 0.42;
        const propRng = (typeof simRandom === 'function') ? simRandom : Math.random;
        const mapSpawns = (typeof getSpawnPointsForMap === 'function')
            ? getSpawnPointsForMap(mapSize, currentMapType, activeCustomMap)
            : [];

        const isNearProceduralRoad = (px, pz, minClear) => {
            for (let ri = 0; ri < _activeProceduralRoads.length; ri++) {
                const r = _activeProceduralRoads[ri];
                if (distPointToSegment2D(px, pz, r.x1, r.z1, r.x2, r.z2) < minClear) return true;
            }
            return false;
        };

        const civPools = {
            desert: ['civilian_desert_house', 'civilian_house1', 'civilian_bunker'],
            jungle: ['civilian_cottage', 'civilian_house1', 'civilian_bunker'],
            snow:   ['civilian_chalet', 'civilian_soviet', 'civilian_bunker'],
            city:   ['civilian_euro', 'civilian_soviet', 'civilian_house1', 'civilian_house2', 'civilian_hangar', 'civilian_bunker']
        };

        for (let i = 0; i < count; i++) {
            const x = (propRng() - 0.5) * 2 * bound;
            const z = (propRng() - 0.5) * 2 * bound;
            const y = getTerrainHeight(x, z);

            // Never spawn in water or steep underwater banks
            if (y < currentWaterLevel + 0.5 && theme !== 'city') continue;
            // Keep central hub clear for AI pathing & battles
            if (Math.hypot(x, z) < 36) continue;
            // Keep every spawn base plateau completely clear
            if (mapSpawns && mapSpawns.some(sp => Math.hypot(x - sp.x, z - sp.z) < 46)) continue;
            // Keep every guaranteed AI road corridor wide and obstacle-free (22u clearance)
            if (isNearProceduralRoad(x, z, 22)) continue;
            // Keep every bridge & bridge approach completely clear
            if (mapBridges.some(br => Math.hypot(x - br.position.x, z - br.position.z) < br.width + 14)) continue;
            // Avoid overlapping previously placed obstacles
            if (mapObstacles.some(ob => ob && ob.position && Math.hypot(x - ob.position.x, z - ob.position.z) < (ob.radius || 3) + 5.5)) continue;

            const roll = propRng();
            const rotY = propRng() * Math.PI * 2;
            const pool = civPools[theme] || civPools.desert;

            if (theme === 'city') {
                if (Math.abs(x - mapSize * 0.05) <= 28) continue;
                if (roll > 0.30) {
                    const uKey = pool[Math.floor(propRng() * pool.length) % pool.length];
                    const bRot = Math.floor(propRng() * 4) * (Math.PI / 2);
                    const bld = spawnOfficialProp(uKey, x, y, z, bRot);
                    if (bld) {
                        const isBunk = (uKey === 'civilian_bunker');
                        const r = isBunk ? 5.0 : 6.0;
                        mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: r });
                        registerWorldBuilding(bld, x, y, z, bRot, r, isBunk, uKey);
                    }
                } else if (roll > 0.14) {
                    const tree = spawnOfficialProp('prop_tree', x, y, z, rotY);
                    if (tree) mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 2.0, kind: 'tree', mesh: tree, crushable: true, toppled: false });
                } else {
                    const bush = spawnOfficialProp('prop_bush', x, y, z, rotY);
                    if (bush) mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 1.1, kind: 'bush', mesh: bush, crushable: true, toppled: false, nonBlocking: true });
                }
            } else if (theme === 'desert') {
                if (roll > 0.55) {
                    const palm = spawnOfficialProp('prop_palm', x, y, z, rotY);
                    if (palm) mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 1.6, kind: 'palm', mesh: palm, crushable: true, toppled: false });
                } else if (roll > 0.30) {
                    const bush = spawnOfficialProp('prop_bush', x, y, z, rotY);
                    if (bush) mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 1.1, kind: 'bush', mesh: bush, crushable: true, toppled: false, nonBlocking: true });
                } else if (roll > 0.14) {
                    const rock = spawnOfficialProp('prop_rock', x, y, z, rotY);
                    if (rock) mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 2.2 });
                } else {
                    const uKey = pool[Math.floor(propRng() * pool.length) % pool.length];
                    const bRot = Math.floor(propRng() * 4) * (Math.PI / 2);
                    const bld = spawnOfficialProp(uKey, x, y, z, bRot);
                    if (bld) {
                        const isBunk = (uKey === 'civilian_bunker');
                        const r = isBunk ? 5.0 : 6.0;
                        mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: r });
                        registerWorldBuilding(bld, x, y, z, bRot, r, isBunk, uKey);
                    }
                }
            } else {
                // Jungle / Snow / Random: official W3D trees, bushes, rocks, and themed garrisonable civilian structures
                if (roll > 0.45) {
                    const tree = spawnOfficialProp('prop_tree', x, y, z, rotY);
                    if (tree) mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 2.0, kind: 'tree', mesh: tree, crushable: true, toppled: false });
                } else if (roll > 0.24) {
                    const bush = spawnOfficialProp('prop_bush', x, y, z, rotY);
                    if (bush) mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 1.1, kind: 'bush', mesh: bush, crushable: true, toppled: false, nonBlocking: true });
                } else if (roll > 0.12) {
                    const rock = spawnOfficialProp('prop_rock', x, y, z, rotY);
                    if (rock) mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 2.2 });
                } else {
                    const uKey = pool[Math.floor(propRng() * pool.length) % pool.length];
                    const bRot = Math.floor(propRng() * 4) * (Math.PI / 2);
                    const bld = spawnOfficialProp(uKey, x, y, z, bRot);
                    if (bld) {
                        const isBunk = (uKey === 'civilian_bunker');
                        const r = isBunk ? 5.0 : 6.0;
                        mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: r });
                        registerWorldBuilding(bld, x, y, z, bRot, r, isBunk, uKey);
                    }
                }
            }
        }
    }
}

function spawnBridge(x, y, z, rotationY = 0, width = 16, length = 56) {
    const bridge = createBridgeMesh(currentMapType, width, length);
    bridge.position.set(x, y, z);
    bridge.rotation.y = rotationY;
    bridge.traverse(c => {
            if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
    });
    mapPropsGroup.add(bridge);
    mapBridges.push({
            position: new THREE.Vector3(x, y, z),
            width: width,
            length: length,
            rotationY: rotationY,
            deckY: y + 0.45
    });
    // Flatten & elevate both bridge approaches above water so AI & player units never stall on banks
    if (typeof registerFlattenedFootprint === 'function' && currentWaterLevel > -100) {
        const rampY = Math.max(y + 0.15, currentWaterLevel + 0.85);
        const fwdX = Math.sin(rotationY);
        const fwdZ = Math.cos(rotationY);
        for (const frac of [-0.52, -0.32, 0.32, 0.52]) {
            registerFlattenedFootprint(x + fwdX * (length * frac), z + fwdZ * (length * frac), width * 0.85, rampY);
        }
    }
    if (typeof markPathfindGridDirty === 'function') markPathfindGridDirty();
}

function isPointOnBridge(x, z, bridge) {
    const dx = x - bridge.position.x;
    const dz = z - bridge.position.z;
    const halfW = bridge.width * 0.5 + 2.2;
    const halfL = bridge.length * 0.5 + 4.5;
    const maxHalf = halfW + halfL;
    if (dx > maxHalf || dx < -maxHalf || dz > maxHalf || dz < -maxHalf) return false;
    if (bridge._rotCached !== bridge.rotationY) {
        bridge._cos = Math.cos(bridge.rotationY);
        bridge._sin = Math.sin(bridge.rotationY);
        bridge._rotCached = bridge.rotationY;
    }
    const lx = dx * bridge._cos - dz * bridge._sin;
    const lz = dx * bridge._sin + dz * bridge._cos;
    return (Math.abs(lx) <= halfW && Math.abs(lz) <= halfL);
}

// --- 3D ENVIRONMENT PROPS ---

// 1. Desert Palm Tree
function createPalmTreeMesh() {
    const g = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x785e3a, roughness: 0.95 });
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x27ae60, roughness: 0.75, side: THREE.DoubleSide });

    // Curved trunk
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 6.5, 8), trunkMat);
    trunk.rotation.z = 0.12; trunk.position.set(0.4, 3.2, 0);
    trunk.castShadow = true; g.add(trunk);

    // Palm fronds
    for (let i = 0; i < 7; i++) {
        const angle = (i * Math.PI * 2) / 7;
        const frond = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 3.2), frondMat);
        frond.rotation.y = angle;
        frond.rotation.x = 0.35;
        frond.position.set(0.8 + Math.sin(angle) * 1.4, 6.4, Math.cos(angle) * 1.4);
        frond.castShadow = true; g.add(frond);
    }
    return g;
}

// 2. Desert / Mountain Boulder
function createRockMesh(colorHex = 0x8a775b) {
    const geo = new THREE.DodecahedronGeometry(1.6 + Math.random() * 1.0, 1);
    const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.9 });
    const rock = new THREE.Mesh(geo, mat);
    rock.scale.set(1.4, 0.9, 1.2);
    rock.castShadow = true;
    return rock;
}

// 3. Lush Tropical Jungle Tree
function createJungleTreeMesh() {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 5.5, 8), new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.95 }));
    trunk.position.y = 2.75; trunk.castShadow = true; g.add(trunk);

    // 3 Tiered dense jungle canopies
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x1e824c, roughness: 0.85 });
    for (let i = 0; i < 3; i++) {
        const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.6 - i * 0.5, 8, 8), leafMat);
        canopy.scale.set(1.2, 0.65, 1.2);
        canopy.position.y = 4.8 + i * 1.5;
        canopy.castShadow = true; g.add(canopy);
    }
    return g;
}

// 4. Snow-Covered Siberian Pine Tree
function createSnowPineMesh() {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 5.0, 8), new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.95 }));
    trunk.position.y = 2.5; trunk.castShadow = true; g.add(trunk);

    const pineMat = new THREE.MeshStandardMaterial({ color: 0x224233, roughness: 0.8 });
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xf5f6fa, roughness: 0.6 });

    for (let i = 0; i < 4; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(2.8 - i * 0.55, 2.0, 8), pineMat);
        cone.position.y = 3.6 + i * 1.4; cone.castShadow = true; g.add(cone);

        const snowCap = new THREE.Mesh(new THREE.ConeGeometry(2.3 - i * 0.5, 0.6, 8), snowMat);
        snowCap.position.y = 4.3 + i * 1.4; g.add(snowCap);
    }
    return g;
}

// 5. City Skyscraper & Office Building
function createCitySkyscraperMesh() {
    const g = new THREE.Group();
    const height = 14 + Math.random() * 22;
    const width = 7 + Math.random() * 4;
    const depth = 7 + Math.random() * 4;

    const bMat = new THREE.MeshStandardMaterial({ color: 0x2f3640, roughness: 0.5, metalness: 0.7 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), bMat);
    body.position.y = height / 2; body.castShadow = true; g.add(body);

    // Lit office window grid panels
    const winMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, emissive: 0xf39c12, emissiveIntensity: 0.55 });
    [-width * 0.51, width * 0.51].forEach(x => {
            const win = new THREE.Mesh(new THREE.BoxGeometry(0.05, height * 0.75, depth * 0.7), winMat);
            win.position.set(x, height * 0.5, 0); g.add(win);
    });

    // Rooftop antenna tower with red aircraft warning beacon
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, 4.5, 8), matGunmetal);
    ant.position.set(0, height + 2.25, 0); g.add(ant);

    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), matBeaconRed);
    beacon.name = "hazardBeacon";
    beacon.position.set(0, height + 4.5, 0); g.add(beacon);

    return g;
}

// 6. Concrete & Steel Bridge for River / Canal / Ravine Crossing
function createBridgeMesh(mapType, width = 16, length = 56) {
    const g = new THREE.Group();
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x4d5248, roughness: 0.9, metalness: 0.2 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 1.2, length), deckMat);
    deck.receiveShadow = true; deck.castShadow = true; g.add(deck);

    // Guard rails on both edges
    const halfW = width * 0.5 - 0.2;
    [-halfW, halfW].forEach(x => {
            const guard = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.4, length), matGunmetal);
            guard.position.set(x, 0.9, 0);
            guard.castShadow = true; g.add(guard);
    });

    // Warning yellow/black hazard approach stripes on bridge entry aprons
    [-length * 0.48, length * 0.48].forEach(z => {
            const stripe = new THREE.Mesh(new THREE.BoxGeometry(width - 0.6, 0.05, 2.2), matHazard);
            stripe.position.set(0, 0.63, z); g.add(stripe);
    });

    // Concrete support pillars beneath the deck into riverbed
    [-halfW + 1.8, halfW - 1.8].forEach(x => {
            [-length * 0.28, 0, length * 0.28].forEach(z => {
                    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 8.0, 8), matConcrete);
                    pillar.position.set(x, -3.8, z);
                    pillar.castShadow = true; g.add(pillar);
            });
    });

    return g;
}

function spawnSingleSupplyDockAt(pos, stock = 30000) {
    let dockMesh;
    let crates = null;
    if (typeof createW3DBuildingMesh === 'function' && window.W3D_BUILDING_DATA && window.W3D_BUILDING_DATA['tech_supplyDock']) {
        dockMesh = createW3DBuildingMesh('tech_supplyDock', false);
        if (window.W3D_BUILDING_DATA['tech_supplyCrates']) {
            crates = createW3DBuildingMesh('tech_supplyCrates', false);
            crates.name = 'supplyCrates';
            crates.scale.set(1.0, 1.0, 1.0);
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
            crystals: [],
            stock: stock,
            maxStock: stock,
            remaining: stock,
            maxSupplies: stock
    });
}

// Supply Fields distribution across map size
function createSupplyFieldsForMap(mapSize) {
    if (activeCustomMap && activeCustomMap.supplies && activeCustomMap.supplies.length > 0) {
        activeCustomMap.supplies.forEach(s => {
                const y = getTerrainHeight(s.x, s.z);
                const pos = new THREE.Vector3(s.x, y, s.z);
                spawnSingleSupplyDockAt(pos, s.amount || 30000);
        });
        return;
    }

    const officialMap = window.OFFICIAL_SKIRMISH_MAPS && window.OFFICIAL_SKIRMISH_MAPS[currentMapType];
    if (officialMap && officialMap.supplies && officialMap.supplies.length > 0) {
        officialMap.supplies.forEach(s => {
                const sx = Math.round(s.nx * mapSize);
                const sz = Math.round(s.nz * mapSize);
                const y = getTerrainHeight(sx, sz);
                const pos = new THREE.Vector3(sx, y, sz);
                spawnSingleSupplyDockAt(pos, s.amount || 30000);
        });
        // Also ensure each spawn point has a reachable nearby supply dock within ~210 units
        if (typeof getSpawnPointsForMap === 'function') {
            const spawns = getSpawnPointsForMap(mapSize, currentMapType, null);
            spawns.forEach(sp => {
                    const hasNear = supplyPoints.some(d => Math.hypot(d.position.x - sp.x, d.position.z - sp.z) < 240);
                    if (!hasNear) {
                        const sx = Math.round(sp.x * 0.78);
                        const sz = Math.round(sp.z * 0.78);
                        const y = getTerrainHeight(sx, sz);
                        spawnSingleSupplyDockAt(new THREE.Vector3(sx, y, sz), 30000);
                    }
            });
        }
        return;
    }

    const step = mapSize > 1000 ? 240 : mapSize > 600 ? 170 : 120;
    const bound = mapSize * 0.36;

    for (let x = -bound; x <= bound; x += step) {
        for (let z = -bound; z <= bound; z += step) {
            const y = getTerrainHeight(x, z);
            if (y < currentWaterLevel + 0.4) continue; // Don't spawn in water

            const position = new THREE.Vector3(x, y, z);
            spawnSingleSupplyDockAt(position, 30000);
        }
    }
}

// =========================================================================
// 3D SKY DOME & TIME-OF-DAY (DAY / DUSK / NIGHT) ATMOSPHERE ENGINE
// =========================================================================
const _skyboxTexCache = {};

function resolveEffectiveTimeOfDay(mapKey) {
    const selEl = (typeof document !== 'undefined') ? document.getElementById('sp-time-of-day') : null;
    const pref = (typeof window !== 'undefined' && window.selectedTimeOfDay)
        ? window.selectedTimeOfDay
        : (selEl ? selEl.value : 'auto');
    if (pref === 'day' || pref === 'dusk' || pref === 'night') return pref;
    const mk = String(mapKey || '').toLowerCase();
    if (mk.includes('twilight')) return 'dusk';
    return 'day';
}

function _getSkyboxTexture(theme, tod) {
    const cacheKey = `${theme}_${tod}`;
    if (_skyboxTexCache[cacheKey]) return _skyboxTexCache[cacheKey];
    if (typeof document === 'undefined' || !document.createElement || typeof THREE === 'undefined' || !THREE.CanvasTexture) return null;

    const w = 1024, h = 512;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext && c.getContext('2d');
    if (!ctx) return null;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    if (tod === 'night') {
        grad.addColorStop(0.00, '#040915');
        grad.addColorStop(0.32, '#0a162c');
        grad.addColorStop(0.50, '#162844');
        grad.addColorStop(0.58, '#132036');
        grad.addColorStop(1.00, '#09101d');
    } else if (tod === 'dusk') {
        grad.addColorStop(0.00, '#1b1b3a');
        grad.addColorStop(0.24, '#3d2c52');
        grad.addColorStop(0.42, '#9e4747');
        grad.addColorStop(0.50, '#e88b48');
        grad.addColorStop(0.56, '#c46a3a');
        grad.addColorStop(1.00, '#3a2420');
    } else if (theme === 'snow') {
        grad.addColorStop(0.00, '#4f7ea8');
        grad.addColorStop(0.32, '#8fb8d6');
        grad.addColorStop(0.50, '#d8e6f0');
        grad.addColorStop(0.60, '#c2d3df');
        grad.addColorStop(1.00, '#9db2c2');
    } else if (theme === 'jungle') {
        grad.addColorStop(0.00, '#2a6cb0');
        grad.addColorStop(0.32, '#6cb0dc');
        grad.addColorStop(0.50, '#bfe0f0');
        grad.addColorStop(0.60, '#9bc0cf');
        grad.addColorStop(1.00, '#6a8792');
    } else if (theme === 'city') {
        grad.addColorStop(0.00, '#3e6285');
        grad.addColorStop(0.32, '#7d9db8');
        grad.addColorStop(0.50, '#c2ced8');
        grad.addColorStop(0.60, '#a6b3be');
        grad.addColorStop(1.00, '#78848f');
    } else {
        // Desert / Tournament Desert
        grad.addColorStop(0.00, '#2f6aa8');
        grad.addColorStop(0.28, '#6ca4cf');
        grad.addColorStop(0.46, '#d9c9a6');
        grad.addColorStop(0.52, '#e2cca3');
        grad.addColorStop(0.62, '#c8b288');
        grad.addColorStop(1.00, '#9a845e');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Deterministic pseudo-random helper for stars & clouds
    let seed = 1337;
    const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

    if (tod === 'night') {
        // Crisp starfield across the upper hemisphere
        for (let i = 0; i < 420; i++) {
            const sx = rand() * w;
            const sy = rand() * (h * 0.47);
            const sr = 0.5 + rand() * 1.35;
            const alpha = (0.35 + rand() * 0.65) * Math.max(0.15, 1 - sy / (h * 0.49));
            ctx.fillStyle = (i % 7 === 0) ? `rgba(180,215,255,${alpha.toFixed(2)})` : `rgba(255,252,240,${alpha.toFixed(2)})`;
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();
        }
        // Luminous full moon + atmospheric halo
        const mx = w * 0.24, my = h * 0.22;
        const mHalo = ctx.createRadialGradient(mx, my, 4, mx, my, 68);
        mHalo.addColorStop(0.0, 'rgba(235, 246, 255, 0.95)');
        mHalo.addColorStop(0.18, 'rgba(180, 215, 255, 0.55)');
        mHalo.addColorStop(0.55, 'rgba(90, 140, 210, 0.14)');
        mHalo.addColorStop(1.0, 'rgba(30, 60, 120, 0)');
        ctx.fillStyle = mHalo;
        ctx.beginPath();
        ctx.arc(mx, my, 68, 0, Math.PI * 2);
        ctx.fill();
    } else {
        // Sun disc & atmospheric glow
        const sx = w * 0.22;
        const sy = tod === 'dusk' ? h * 0.45 : h * 0.24;
        const sunGrad = ctx.createRadialGradient(sx, sy, 6, sx, sy, tod === 'dusk' ? 115 : 85);
        if (tod === 'dusk') {
            sunGrad.addColorStop(0.0, 'rgba(255, 240, 195, 0.98)');
            sunGrad.addColorStop(0.22, 'rgba(255, 170, 85, 0.72)');
            sunGrad.addColorStop(0.58, 'rgba(235, 95, 45, 0.22)');
            sunGrad.addColorStop(1.0, 'rgba(180, 50, 30, 0)');
        } else {
            sunGrad.addColorStop(0.0, 'rgba(255, 255, 235, 0.95)');
            sunGrad.addColorStop(0.20, 'rgba(255, 244, 200, 0.50)');
            sunGrad.addColorStop(0.60, 'rgba(255, 230, 180, 0.12)');
            sunGrad.addColorStop(1.0, 'rgba(255, 220, 170, 0)');
        }
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.arc(sx, sy, tod === 'dusk' ? 115 : 85, 0, Math.PI * 2);
        ctx.fill();

        // Soft painted horizon & upper sky cloud bands
        const cloudCount = 34;
        for (let i = 0; i < cloudCount; i++) {
            const cx = rand() * w;
            const cy = h * (0.16 + rand() * 0.29);
            const rx = 38 + rand() * 82;
            const ry = 9 + rand() * 18;
            const cg = ctx.createRadialGradient(cx, cy, 4, cx, cy, rx);
            if (tod === 'dusk') {
                cg.addColorStop(0.0, 'rgba(255, 175, 115, 0.34)');
                cg.addColorStop(0.55, 'rgba(130, 62, 72, 0.22)');
                cg.addColorStop(1.0, 'rgba(70, 38, 60, 0)');
            } else {
                cg.addColorStop(0.0, 'rgba(255, 255, 255, 0.42)');
                cg.addColorStop(0.60, 'rgba(240, 245, 252, 0.18)');
                cg.addColorStop(1.0, 'rgba(255, 255, 255, 0)');
            }
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(1, ry / rx);
            ctx.fillStyle = cg;
            ctx.beginPath();
            ctx.arc(0, 0, rx, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    _skyboxTexCache[cacheKey] = tex;
    return tex;
}

function applyAtmosphereAndSkybox(effectiveTheme, mapKey) {
    if (typeof scene === 'undefined' || typeof THREE === 'undefined') return;
    const tod = resolveEffectiveTimeOfDay(mapKey);
    if (typeof window !== 'undefined') window._activeTimeOfDay = tod;

    // 1. Fog & fallback background color
    let bgHex = 0xd8c39e;
    let fogDensity = 0.0004;
    if (tod === 'night') {
        bgHex = 0x0d192d;
        fogDensity = 0.00058;
    } else if (tod === 'dusk') {
        bgHex = 0xb5684b;
        fogDensity = 0.00048;
    } else if (effectiveTheme === 'jungle') {
        bgHex = 0xa8d0e6; fogDensity = 0.00038;
    } else if (effectiveTheme === 'snow') {
        bgHex = 0xcfdce6; fogDensity = 0.00042;
    } else if (effectiveTheme === 'city') {
        bgHex = 0xb8c4d0; fogDensity = 0.00045;
    } else {
        bgHex = 0xd8c39e; fogDensity = 0.00040;
    }
    if (scene.background && typeof scene.background.setHex === 'function') scene.background.setHex(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, fogDensity);

    // 2. Directional sun/moon light & ambient tint
    const amb = (typeof window !== 'undefined') ? window._mainAmbientLight : null;
    const dir = (typeof window !== 'undefined') ? window._mainDirLight : null;
    const setLightHex = (light, hex, intensity) => {
        if (!light) return;
        if (light.color && typeof light.color.setHex === 'function') light.color.setHex(hex);
        light.intensity = intensity;
    };
    if (tod === 'night') {
        setLightHex(amb, 0x284068, 0.82);
        setLightHex(dir, 0x88b4ff, 0.85);
        if (dir && dir.position && typeof dir.position.set === 'function') dir.position.set(-55, 72, -35);
    } else if (tod === 'dusk') {
        setLightHex(amb, 0x634b68, 1.05);
        setLightHex(dir, 0xffa463, 1.30);
        if (dir && dir.position && typeof dir.position.set === 'function') dir.position.set(-85, 42, 48);
    } else {
        setLightHex(amb, 0x445566, 1.30);
        setLightHex(dir, 0xffffff, 1.40);
        if (dir && dir.position && typeof dir.position.set === 'function') dir.position.set(60, 80, 40);
    }

    // 3. 3D Sky Dome surrounding the map
    if (typeof window !== 'undefined' && window._skyboxMesh) {
        scene.remove(window._skyboxMesh);
        if (window._skyboxMesh.geometry) window._skyboxMesh.geometry.dispose();
        if (window._skyboxMesh.material) window._skyboxMesh.material.dispose();
        window._skyboxMesh = null;
    }
    const skyTex = _getSkyboxTexture(effectiveTheme, tod);
    if (skyTex && typeof THREE.SphereGeometry === 'function') {
        const skyRadius = Math.max(520, (typeof currentMapSize === 'number' ? currentMapSize : 900) * 1.45);
        const skyGeo = new THREE.SphereGeometry(skyRadius, 28, 16);
        const skyMat = new THREE.MeshBasicMaterial({
            map: skyTex,
            side: THREE.BackSide,
            depthWrite: false,
            fog: false
        });
        const skyMesh = new THREE.Mesh(skyGeo, skyMat);
        skyMesh.name = 'battlefieldSkybox';
        skyMesh.renderOrder = -10;
        scene.add(skyMesh);
        if (typeof window !== 'undefined') window._skyboxMesh = skyMesh;
    }

    if (typeof refreshAllNightLights === 'function') refreshAllNightLights();
}
if (typeof window !== 'undefined') {
    window.resolveEffectiveTimeOfDay = resolveEffectiveTimeOfDay;
    window.applyAtmosphereAndSkybox = applyAtmosphereAndSkybox;
}



