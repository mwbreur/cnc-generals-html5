
        let isPlacingBlueprint = false;
        let blueprintPlacementPos = null;
        let rightDragStart = null;
        let lastRightPointerPos = { x: 0, y: 0 };

// =========================================================================
// EA C&C GENERALS ZERO HOUR AI ENGINE PORT
// Ported from:
// - GeneralsMD/Code/GameEngine/Include/GameLogic/AI.h (TAiData)
// - GeneralsMD/Code/GameEngine/Source/GameLogic/AI/AIPathfind.cpp (A* + String-Pulling + Cell Classification)
// - GeneralsMD/Code/GameEngine/Source/GameLogic/AI/AISkirmishPlayer.cpp & AIPlayer.cpp (Economy, Defenses, Teams, Retaliation)
// - GeneralsMD/Code/GameEngine/Source/GameLogic/Object/Update/AIUpdate/DozerAIUpdate.cpp (Build/Repair/Footprint/Bored)
// - GeneralsMD/Code/GameEngine/Source/GameLogic/AI/AIDock.cpp (Multi-Slot Harvester Docking)
// =========================================================================

const ZERO_HOUR_AI_DATA = {
    structureSeconds: 10.0,
    teamSeconds: 12.0,
    resourcesWealthy: 7000,
    resourcesPoor: 2000,
    guardInnerModifierAI: 1.1,
    guardOuterModifierAI: 1.4,
    attackPriorityDistanceModifier: 100.0,
    skirmishGroupFudgeValue: 5.0,
    maxRetaliateDistance: 210.0,
    retaliateFriendsRadius: 70.0,
    aiDozerBoredRadiusModifier: 2.0,
    repairHealthPercentPerSecond: 0.02,
    resourceGatherers: { easy: 1, medium: 2, hard: 2 },
    maxStrikeTeamSize: { easy: 3, medium: 4, hard: 5 }
};
window.ZERO_HOUR_AI_DATA = ZERO_HOUR_AI_DATA;

// =========================================================================
// 1. AIPATHFIND.CPP: 2D PASSABILITY GRID, A* SEARCH & LINE-OF-SIGHT STRING PULLING
// =========================================================================
const PATHFIND_CELL_TYPES = {
    CLEAR: 0,
    WATER: 1,
    CLIFF: 2,
    RUBBLE: 3,
    OBSTACLE: 4,
    BRIDGE: 5
};
window.PATHFIND_CELL_TYPES = PATHFIND_CELL_TYPES;

let _pathfindGridState = {
    dirty: true,
    gridDim: 100,
    cellSize: 6.0,
    halfExtent: 300,
    cells: null,
    lastStructCount: -1,
    lastEnemyStructCount: -1
};

function markPathfindGridDirty() {
    _pathfindGridState.dirty = true;
}
window.markPathfindGridDirty = markPathfindGridDirty;

function classifyPathfindPosition(wx, wz, ignoreStruct = null, extraClearance = 1.6) {
    // Bridge cells override water/cliff underneath (AIPathfind.cpp classifyMap)
    if (typeof mapBridges !== 'undefined' && mapBridges && mapBridges.length > 0 && typeof isPointOnBridge === 'function') {
        for (let i = 0; i < mapBridges.length; i++) {
            if (isPointOnBridge(wx, wz, mapBridges[i])) return PATHFIND_CELL_TYPES.BRIDGE;
        }
    }
    // Check water passability
    const waterLvl = (typeof currentWaterLevel !== 'undefined') ? currentWaterLevel : -10;
    const h = (typeof getTerrainHeight === 'function') ? getTerrainHeight(wx, wz) : 0;
    if (h < waterLvl + 0.15) return PATHFIND_CELL_TYPES.WATER;

    // Check slope/cliff passability
    if (typeof getTerrainHeight === 'function') {
        const d = 2.5;
        const hX = getTerrainHeight(wx + d, wz);
        const hZ = getTerrainHeight(wx, wz + d);
        if (Math.abs(hX - h) / d > 1.35 || Math.abs(hZ - h) / d > 1.35) {
            return PATHFIND_CELL_TYPES.CLIFF;
        }
    }

    // Check player & AI structures
    const checkStructList = (list) => {
        if (!list) return false;
        for (let i = 0; i < list.length; i++) {
            const s = list[i];
            if (!s || s === ignoreStruct || s.health <= 0) continue;
            const sp = s.position || (s.mesh && s.mesh.position);
            if (!sp) continue;
            const r = (s.radius || 6.0) + extraClearance;
            const dx = wx - sp.x;
            const dz = wz - sp.z;
            if (dx * dx + dz * dz < r * r) return true;
        }
        return false;
    };
    if (typeof structures !== 'undefined' && checkStructList(structures)) return PATHFIND_CELL_TYPES.OBSTACLE;
    if (typeof enemyStructures !== 'undefined' && checkStructList(enemyStructures)) return PATHFIND_CELL_TYPES.OBSTACLE;

    // Check map obstacles
    if (typeof mapObstacles !== 'undefined' && mapObstacles) {
        for (let i = 0; i < mapObstacles.length; i++) {
            const obs = mapObstacles[i];
            if (!obs || !obs.position) continue;
            const r = (obs.radius || 2.5) + extraClearance * 0.8;
            const dx = wx - obs.position.x;
            const dz = wz - obs.position.z;
            if (dx * dx + dz * dz < r * r) return PATHFIND_CELL_TYPES.OBSTACLE;
        }
    }

    return PATHFIND_CELL_TYPES.CLEAR;
}
window.classifyPathfindPosition = classifyPathfindPosition;

function rebuildPathfindGrid() {
    const mapSize = (typeof currentMapSize !== 'undefined' && currentMapSize > 0) ? currentMapSize : 600;
    const halfExtent = Math.min(360, mapSize * 0.46);
    const gridDim = 100;
    const cellSize = (halfExtent * 2) / gridDim;
    if (!_pathfindGridState.cells || _pathfindGridState.cells.length !== gridDim * gridDim) {
        _pathfindGridState.cells = new Uint8Array(gridDim * gridDim);
    }
    _pathfindGridState.gridDim = gridDim;
    _pathfindGridState.cellSize = cellSize;
    _pathfindGridState.halfExtent = halfExtent;

    const cells = _pathfindGridState.cells;
    for (let gz = 0; gz < gridDim; gz++) {
        const wz = -halfExtent + (gz + 0.5) * cellSize;
        for (let gx = 0; gx < gridDim; gx++) {
            const wx = -halfExtent + (gx + 0.5) * cellSize;
            cells[gz * gridDim + gx] = classifyPathfindPosition(wx, wz, null, 1.5);
        }
    }
    _pathfindGridState.dirty = false;
    _pathfindGridState.lastStructCount = (typeof structures !== 'undefined' && structures) ? structures.length : 0;
    _pathfindGridState.lastEnemyStructCount = (typeof enemyStructures !== 'undefined' && enemyStructures) ? enemyStructures.length : 0;
}
window.rebuildPathfindGrid = rebuildPathfindGrid;

function isCellPassableOnGround(cellType) {
    return cellType === PATHFIND_CELL_TYPES.CLEAR || cellType === PATHFIND_CELL_TYPES.BRIDGE;
}

// Line-of-sight raymarch check between two world positions (AIPathfind.cpp optimizeGroundPath helper)
function isPathfindSegmentClear(startPos, endPos, ignoreStruct = null, clearance = 1.4) {
    if (!startPos || !endPos) return true;
    const dx = endPos.x - startPos.x;
    const dz = endPos.z - startPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5) return true;

    const steps = Math.max(4, Math.min(48, Math.ceil(dist / 2.5)));
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const px = startPos.x + dx * t;
        const pz = startPos.z + dz * t;
        const cell = classifyPathfindPosition(px, pz, ignoreStruct, clearance);
        if (!isCellPassableOnGround(cell)) return false;
    }
    return true;
}
window.isPathfindSegmentClear = isPathfindSegmentClear;

// String-Pulling Path Optimizer (ported from AIPathfind.cpp::optimizeGroundPath)
function optimizeGroundPath(waypoints, ignoreStruct = null) {
    if (!waypoints || waypoints.length <= 2) return waypoints ? waypoints.slice() : [];
    const result = [waypoints[0].clone()];
    let anchorIdx = 0;
    while (anchorIdx < waypoints.length - 1) {
        let furthestVisible = anchorIdx + 1;
        for (let probe = waypoints.length - 1; probe > anchorIdx + 1; probe--) {
            if (isPathfindSegmentClear(waypoints[anchorIdx], waypoints[probe], ignoreStruct, 1.3)) {
                furthestVisible = probe;
                break;
            }
        }
        result.push(waypoints[furthestVisible].clone());
        anchorIdx = furthestVisible;
    }
    return result;
}
window.optimizeGroundPath = optimizeGroundPath;

// Adjust destination outside impassable obstacles/water (ported from AIPathfind.cpp::adjustToPossibleDestination)
function adjustToPossibleDestination(destPos, ignoreStruct = null) {
    if (!destPos) return new THREE.Vector3();
    const cell = classifyPathfindPosition(destPos.x, destPos.z, ignoreStruct, 1.2);
    if (isCellPassableOnGround(cell)) return destPos.clone();

    for (let r = 3.0; r <= 24.0; r += 3.0) {
        for (let step = 0; step < 12; step++) {
            const angle = (step / 12) * Math.PI * 2;
            const tx = destPos.x + Math.cos(angle) * r;
            const tz = destPos.z + Math.sin(angle) * r;
            if (isCellPassableOnGround(classifyPathfindPosition(tx, tz, ignoreStruct, 1.2))) {
                const ty = (typeof getTerrainHeight === 'function') ? getTerrainHeight(tx, tz) : (destPos.y || 0);
                return new THREE.Vector3(tx, ty, tz);
            }
        }
    }
    return destPos.clone();
}
window.adjustToPossibleDestination = adjustToPossibleDestination;

// A* Ground Pathfinding with String-Pulling (ported from AIPathfind.cpp::findGroundPath)
function findNavigationPath(startPos, endPos, options = {}) {
    if (!startPos || !endPos) return [];
    const ignoreStruct = options.ignoreStruct || null;

    // Fast path: if direct line-of-sight is clear, no intermediate waypoints needed
    if (isPathfindSegmentClear(startPos, endPos, ignoreStruct, 1.4)) {
        return [endPos.clone()];
    }

    const sCount = (typeof structures !== 'undefined' && structures) ? structures.length : 0;
    const esCount = (typeof enemyStructures !== 'undefined' && enemyStructures) ? enemyStructures.length : 0;
    if (_pathfindGridState.dirty || sCount !== _pathfindGridState.lastStructCount || esCount !== _pathfindGridState.lastEnemyStructCount || !_pathfindGridState.cells) {
        rebuildPathfindGrid();
    }

    const { gridDim, cellSize, halfExtent, cells } = _pathfindGridState;
    const toGrid = (wVal) => Math.max(0, Math.min(gridDim - 1, Math.floor((wVal + halfExtent) / cellSize)));
    const toWorld = (gIdx) => -halfExtent + (gIdx + 0.5) * cellSize;

    const safeGoal = adjustToPossibleDestination(endPos, ignoreStruct);
    const sx = toGrid(startPos.x);
    const sz = toGrid(startPos.z);
    const gx = toGrid(safeGoal.x);
    const gz = toGrid(safeGoal.z);

    if (sx === gx && sz === gz) {
        return [endPos.clone()];
    }

    const totalCells = gridDim * gridDim;
    const gScore = new Float32Array(totalCells);
    gScore.fill(Infinity);
    const parent = new Int32Array(totalCells);
    parent.fill(-1);
    const closed = new Uint8Array(totalCells);

    const startIdx = sz * gridDim + sx;
    const goalIdx = gz * gridDim + gx;
    gScore[startIdx] = 0;

    // Compact binary min-heap for A* open set
    const heapNodes = [startIdx];
    const heapPriorities = [Math.hypot(gx - sx, gz - sz)];

    const pushOpen = (idx, prio) => {
        let i = heapNodes.length;
        heapNodes.push(idx);
        heapPriorities.push(prio);
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (heapPriorities[p] <= prio) break;
            heapNodes[i] = heapNodes[p];
            heapPriorities[i] = heapPriorities[p];
            i = p;
        }
        heapNodes[i] = idx;
        heapPriorities[i] = prio;
    };

    const popOpen = () => {
        const top = heapNodes[0];
        const lastIdx = heapNodes.pop();
        const lastPrio = heapPriorities.pop();
        const len = heapNodes.length;
        if (len > 0) {
            let i = 0;
            while ((i << 1) + 1 < len) {
                let left = (i << 1) + 1;
                let right = left + 1;
                let smallest = (right < len && heapPriorities[right] < heapPriorities[left]) ? right : left;
                if (lastPrio <= heapPriorities[smallest]) break;
                heapNodes[i] = heapNodes[smallest];
                heapPriorities[i] = heapPriorities[smallest];
                i = smallest;
            }
            heapNodes[i] = lastIdx;
            heapPriorities[i] = lastPrio;
        }
        return top;
    };

    const dirs = [
        [1, 0, 1.0], [-1, 0, 1.0], [0, 1, 1.0], [0, -1, 1.0],
        [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]
    ];

    let found = false;
    let closestIdx = startIdx;
    let closestHeur = Math.hypot(gx - sx, gz - sz);
    let iterations = 0;
    const maxIterations = 2400;

    while (heapNodes.length > 0 && iterations++ < maxIterations) {
        const current = popOpen();
        if (current === goalIdx) {
            found = true;
            break;
        }
        if (closed[current]) continue;
        closed[current] = 1;

        const cx = current % gridDim;
        const cz = (current / gridDim) | 0;

        for (let d = 0; d < 8; d++) {
            const nx = cx + dirs[d][0];
            const nz = cz + dirs[d][1];
            if (nx < 0 || nx >= gridDim || nz < 0 || nz >= gridDim) continue;
            const nIdx = nz * gridDim + nx;
            if (closed[nIdx]) continue;

            // Allow goal cell or cells belonging to ignoreStruct
            let passable = isCellPassableOnGround(cells[nIdx]) || nIdx === goalIdx;
            if (!passable && ignoreStruct) {
                const wx = toWorld(nx);
                const wz = toWorld(nz);
                passable = isCellPassableOnGround(classifyPathfindPosition(wx, wz, ignoreStruct, 1.4));
            }
            if (!passable) continue;

            // Prevent diagonal corner cutting across blocked orthogonal neighbors
            if (d >= 4) {
                const adj1 = cz * gridDim + nx;
                const adj2 = nz * gridDim + cx;
                if (!isCellPassableOnGround(cells[adj1]) || !isCellPassableOnGround(cells[adj2])) continue;
            }

            const tentativeG = gScore[current] + dirs[d][2];
            if (tentativeG < gScore[nIdx]) {
                gScore[nIdx] = tentativeG;
                parent[nIdx] = current;
                const h = Math.hypot(gx - nx, gz - nz);
                if (h < closestHeur) {
                    closestHeur = h;
                    closestIdx = nIdx;
                }
                pushOpen(nIdx, tentativeG + h * 1.05);
            }
        }
    }

    const traceTarget = found ? goalIdx : closestIdx;
    if (traceTarget === startIdx) {
        return [endPos.clone()];
    }

    const rawPoints = [];
    let curr = traceTarget;
    while (curr !== -1 && curr !== startIdx) {
        const cx = curr % gridDim;
        const cz = (curr / gridDim) | 0;
        const wx = toWorld(cx);
        const wz = toWorld(cz);
        const wy = (typeof getTerrainHeight === 'function') ? getTerrainHeight(wx, wz) : 0;
        rawPoints.push(new THREE.Vector3(wx, wy, wz));
        curr = parent[curr];
    }
    rawPoints.push(startPos.clone());
    rawPoints.reverse();
    rawPoints[rawPoints.length - 1] = endPos.clone();

    const smoothed = optimizeGroundPath(rawPoints, ignoreStruct);
    // Drop the starting point so returned array contains strictly forward waypoints ending at endPos
    return smoothed.length > 1 ? smoothed.slice(1) : [endPos.clone()];
}
window.findNavigationPath = findNavigationPath;

// =========================================================================
// 2. AIDOCK.CPP & SUPPLYTRUCKAIUPDATE.CPP: MULTI-SLOT HARVESTER DOCKING
// =========================================================================
function getSupplyDockSlotPosition(dockObj, harvester, isCenter = false) {
    if (!dockObj) return harvester && harvester.mesh ? harvester.mesh.position.clone() : new THREE.Vector3();
    const basePos = dockObj.position || (dockObj.mesh && dockObj.mesh.position) || dockObj;
    if (!dockObj._dockSlots) {
        dockObj._dockSlots = [null, null, null, null];
    }
    const unitId = (harvester && (harvester.netId || harvester._dockUnitId)) ||
        (harvester ? (harvester._dockUnitId = 'harv_' + Math.floor(Math.random() * 1000000)) : 'harv_0');

    let slotIdx = dockObj._dockSlots.indexOf(unitId);
    if (slotIdx === -1) {
        // Reclaim dead or different-target slots first
        for (let i = 0; i < dockObj._dockSlots.length; i++) {
            if (!dockObj._dockSlots[i]) {
                slotIdx = i;
                dockObj._dockSlots[i] = unitId;
                break;
            }
        }
        if (slotIdx === -1) {
            slotIdx = Math.abs(unitId.charCodeAt(unitId.length - 1) || 0) % 4;
            dockObj._dockSlots[slotIdx] = unitId;
        }
    }

    // 4 distinct radial approach bays around the Supply Dock / Supply Center (AIDock.cpp)
    const slotAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
    const angle = slotAngles[slotIdx % 4];
    const offsetRadius = isCenter ? 5.2 : 5.8;
    const tx = basePos.x + Math.cos(angle) * offsetRadius;
    const tz = basePos.z + Math.sin(angle) * offsetRadius;
    const ty = (typeof getTerrainHeight === 'function') ? getTerrainHeight(tx, tz) : (basePos.y || 0);
    return new THREE.Vector3(tx, ty, tz);
}
window.getSupplyDockSlotPosition = getSupplyDockSlotPosition;

// =========================================================================
// 3. DOZERAIUPDATE.CPP: FOOTPRINT EVACUATION, BUILD & REPAIR STATE MACHINE
// =========================================================================
function clearFoundationFootprint(structure) {
    if (!structure) return 0;
    const sPos = structure.position || (structure.mesh && structure.mesh.position);
    if (!sPos) return 0;
    const sRadius = structure.radius || 7.0;
    let evacuatedCount = 0;

    const allLists = [];
    if (typeof units !== 'undefined' && Array.isArray(units)) allLists.push(units);
    if (typeof enemyUnits !== 'undefined' && Array.isArray(enemyUnits)) allLists.push(enemyUnits);

    allLists.forEach(list => {
        list.forEach(u => {
            if (!u || u.health <= 0 || u.isAir || !u.mesh) return;
            if (u === structure.dozerRef) return;
            const uRadius = u.radius || 1.5;
            const clearanceDist = sRadius + uRadius + 1.5;
            const dx = u.mesh.position.x - sPos.x;
            const dz = u.mesh.position.z - sPos.z;
            const dist = Math.hypot(dx, dz);
            if (dist < clearanceDist) {
                let angle = Math.atan2(dz, dx);
                if (dist < 0.05) angle = Math.random() * Math.PI * 2;
                const safeRadius = sRadius + uRadius + 3.5;
                let exitX = sPos.x + Math.cos(angle) * safeRadius;
                let exitZ = sPos.z + Math.sin(angle) * safeRadius;
                const safeDest = adjustToPossibleDestination(new THREE.Vector3(exitX, sPos.y || 0, exitZ), structure);
                u.targetPosition.copy(safeDest);
                if (u.taskState === 'Idle') u.taskState = 'Moving';
                evacuatedCount++;
            }
        });
    });
    return evacuatedCount;
}
window.clearFoundationFootprint = clearFoundationFootprint;

// =========================================================================
// 4. AISKIRMISHPLAYER.CPP & AIPLAYER.CPP: SKIRMISH COMMANDER ENGINE
// =========================================================================
let aiCommanders = {};
window.aiCommanders = aiCommanders;

function initAICommanders() {
    aiCommanders = {};
    window.aiCommanders = aiCommanders;
    const mapSize = (typeof currentMapSize !== 'undefined' ? currentMapSize : 1500);
    const env = (typeof activeTheme !== 'undefined' ? activeTheme : 'desert');
    const allSpawns = (typeof getSpawnPointsForMap === 'function') ? getSpawnPointsForMap(mapSize, env, null) : [];
    const activeAISlots = (typeof spSlots !== 'undefined' ? spSlots : []).filter(s => s.active && !s.isPlayer);

    if (activeAISlots.length === 0) {
        const owners = new Set();
        enemyStructures.forEach(es => { if (es.ownerId) owners.add(es.ownerId); });
        owners.forEach(ownerId => {
            const sample = enemyStructures.find(es => es.ownerId === ownerId);
            createCommanderState(ownerId, sample ? sample.teamId : 2, sample ? sample.faction : 'china', sample ? sample.position : new THREE.Vector3(20, 0, -20));
        });
        return;
    }

    activeAISlots.forEach(slot => {
        const ownerId = 'ai_' + slot.id;
        const mySpawn = allSpawns.find(sp => sp.id === slot.spawnId);
        const myBasePos = mySpawn ? new THREE.Vector3(mySpawn.x, 0, mySpawn.z) : new THREE.Vector3(20, 0, -20);
        createCommanderState(ownerId, slot.team, slot.faction, myBasePos, slot.difficulty || 'medium', slot.spawnId);
    });

    function createCommanderState(ownerId, teamId, faction, basePos, difficulty = 'medium', spawnId = 0) {
        const candidateWaypoints = [];
        allSpawns.forEach(sp => {
            if (sp.id !== spawnId) {
                candidateWaypoints.push(new THREE.Vector3(sp.x, 0, sp.z));
            }
        });
        if (candidateWaypoints.length === 0) {
            const half = mapSize * 0.32;
            candidateWaypoints.push(
                new THREE.Vector3(-half, 0, -half),
                new THREE.Vector3(half, 0, -half),
                new THREE.Vector3(-half, 0, half),
                new THREE.Vector3(half, 0, half)
            );
        }
        for (let i = candidateWaypoints.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = candidateWaypoints[i]; candidateWaypoints[i] = candidateWaypoints[j]; candidateWaypoints[j] = tmp;
        }

        const startMoneyEl = typeof document !== 'undefined' ? document.getElementById('starting-money') : null;
        const lobbyMoney = startMoneyEl ? parseInt(startMoneyEl.value, 10) : 10000;
        const startCredits = (!isNaN(lobbyMoney) && lobbyMoney > 0) ? lobbyMoney : (difficulty === 'hard' ? 12000 : difficulty === 'easy' ? 7500 : 10000);
        aiCommanders[ownerId] = {
            ownerId: ownerId,
            teamId: teamId,
            faction: faction,
            difficulty: difficulty,
            basePos: basePos.clone(),
            rallyPoint: basePos.clone().add(new THREE.Vector3(16, 0, 16)),

            // Zero Hour Economy & Base Building State (AIPlayer.cpp / AISkirmishPlayer.cpp)
            resources: startCredits,
            structureTimer: 0,
            teamTimer: 0,
            stagingTeam: [],        // Unit netIds assembling at rallyPoint before wave launch
            activeTeams: [],        // Launched strike teams [{ id, unitNetIds, targetPos }]
            threatProfile: { air: 0, armor: 0, infantry: 0, preferredCounter: 'balanced' },

            // Fog of War / Scouting State (No advance omniscience!)
            unexploredWaypoints: candidateWaypoints,
            scoutNetIds: new Set(),
            discoveredEnemyBases: [],    // Array of { position: Vector3, faction: string, teamId: number }
            discoveredEnemyTargets: [],  // Array of { netId, position: Vector3, type, teamId, isStructure }
            hasSightedEnemy: false,

            // Production & tactical timers
            productionTimer: 0,
            attackWaveTimer: 0,
            matchStartTime: (typeof matchStartTime !== 'undefined' && matchStartTime > 0) ? matchStartTime : Date.now(),
            hasAnnouncedOffensive: false
        };
    }
}

// Shared Team Intelligence: Allies broadcast reconnaissance discoveries to each other
function shareTeamDiscovery(teamId, entity, isBase = false) {
    if (!entity) return;
    const ePos = entity.position || (entity.mesh && entity.mesh.position);
    if (!ePos) return;

    Object.values(aiCommanders).forEach(cmd => {
        if (cmd.teamId === teamId) {
            if (entity.netId && !cmd.discoveredEnemyTargets.some(t => t.netId === entity.netId)) {
                cmd.discoveredEnemyTargets.push({
                    netId: entity.netId,
                    position: ePos.clone(),
                    type: entity.type,
                    teamId: entity.teamId,
                    isStructure: isBase || !!entity.radius
                });
            }
            if (isBase) {
                const alreadyKnown = cmd.discoveredEnemyBases.some(b => b.position.distanceTo(ePos) < 25);
                if (!alreadyKnown) {
                    cmd.discoveredEnemyBases.push({
                        position: ePos.clone(),
                        faction: entity.faction || 'enemy',
                        teamId: entity.teamId
                    });
                    cmd.hasSightedEnemy = true;
                }
            }
        }
    });
}

// Threat & Counter-Force Evaluation (AISkirmishPlayer.cpp::selectTeamToBuild)
function evaluateEnemyThreatProfile(cmd, hostileUnits) {
    let air = 0, armor = 0, infantry = 0;
    const knownIds = new Set((cmd && cmd.discoveredEnemyTargets) ? cmd.discoveredEnemyTargets.map(t => t.netId) : []);
    (hostileUnits || []).forEach(hu => {
        if (!hu || hu.health <= 0) return;
        // Count units known via recon OR all passed units in direct evaluation
        if (knownIds.size > 0 && hu.netId && !knownIds.has(hu.netId)) return;
        if (hu.isAir || ['raptor', 'comanche', 'aurorabomber', 'chinook'].includes(hu.type)) {
            air++;
        } else if (typeof getArmorCategory === 'function' ? getArmorCategory(hu) === 'infantry' : ['ranger', 'missiledefender', 'pathfinder', 'burton', 'redguard', 'tankhunter', 'hacker', 'lotus', 'rebel', 'rpg', 'terrorist', 'jarmen', 'infantry', 'rocket'].includes(hu.type)) {
            infantry++;
        } else if (hu.type !== 'dozer' && hu.type !== 'worker' && hu.type !== 'truck') {
            armor++;
        }
    });

    let preferredCounter = 'balanced';
    if (air >= 2 && air >= armor * 0.6) preferredCounter = 'anti_air';
    else if (armor >= 3 && armor >= infantry) preferredCounter = 'anti_armor';
    else if (infantry >= 4) preferredCounter = 'anti_infantry';

    const profile = { air, armor, infantry, preferredCounter };
    if (cmd) cmd.threatProfile = profile;
    return profile;
}
window.evaluateEnemyThreatProfile = evaluateEnemyThreatProfile;

// Distance-Weighted Target Attack Priority (AI.h AttackPriorityDistanceModifier)
function scoreAITargetPriority(attacker, target, cmd = null) {
    if (!attacker || !target || target.health <= 0) return -Infinity;
    const aPos = attacker.position || (attacker.mesh && attacker.mesh.position) || { x: 0, z: 0 };
    const tPos = target.position || (target.mesh && target.mesh.position) || { x: 0, z: 0 };
    const dist = Math.hypot(tPos.x - aPos.x, tPos.z - aPos.z);

    let basePriority = 100;
    const tType = target.type || '';
    if (['particleCannon', 'nukeSilo', 'scudStorm'].includes(tType)) basePriority = 260;
    else if (['factory', 'airfield', 'strategyCenter', 'propagandaCenter', 'palace'].includes(tType)) basePriority = 220;
    else if (['supplyCenter', 'supplyStash', 'truck', 'chinook', 'dozer', 'worker'].includes(tType)) basePriority = 195;
    else if (['patriot', 'gatlingCannon', 'bunker', 'tunnel', 'stingerSite'].includes(tType)) basePriority = 180;
    else if (['center', 'commandCenter', 'barracks', 'power', 'nuclearReactor'].includes(tType)) basePriority = 165;
    else if (['tomahawk', 'nukecannon', 'scudlauncher', 'inferno', 'overlord', 'paladin', 'marauder'].includes(tType)) basePriority = 155;

    // Bonus for low-health targets (focus fire)
    if (target.maxHealth > 0) {
        const hpRatio = target.health / target.maxHealth;
        if (hpRatio < 0.35) basePriority += 25;
    }

    const distMod = ZERO_HOUR_AI_DATA.attackPriorityDistanceModifier || 100.0;
    return basePriority - (dist / (distMod * 0.25));
}
window.scoreAITargetPriority = scoreAITargetPriority;

// Choose optimal unit type based on faction, facility, and enemy threat profile
function chooseAICounterUnitType(cmd, facilityType) {
    const f = cmd.faction || 'usa';
    const counter = (cmd.threatProfile && cmd.threatProfile.preferredCounter) || 'balanced';

    if (facilityType === 'barracks') {
        if (f === 'china') {
            if (counter === 'anti_air' || counter === 'anti_armor') return 'tankhunter';
            return Math.random() < 0.45 ? 'tankhunter' : 'redguard';
        } else if (f === 'gla') {
            if (counter === 'anti_air' || counter === 'anti_armor') return 'rpg';
            return Math.random() < 0.45 ? 'rpg' : 'rebel';
        } else {
            if (counter === 'anti_air' || counter === 'anti_armor') return 'missiledefender';
            return Math.random() < 0.45 ? 'missiledefender' : 'ranger';
        }
    }

    // War Factory / Arms Dealer vehicles
    if (f === 'china') {
        if (counter === 'anti_air' || counter === 'anti_infantry') return Math.random() < 0.7 ? 'gatling' : 'battlemaster';
        if (counter === 'anti_armor') return (cmd.difficulty === 'hard' && Math.random() < 0.55) ? 'overlord' : 'battlemaster';
        if (cmd.difficulty === 'hard' && Math.random() < 0.22) return 'nukecannon';
        return (cmd.difficulty === 'hard' && Math.random() < 0.4) ? 'overlord' : (Math.random() < 0.35 ? 'gatling' : 'battlemaster');
    } else if (f === 'gla') {
        if (counter === 'anti_air') return Math.random() < 0.75 ? 'quad' : 'scorpion';
        if (counter === 'anti_infantry') return Math.random() < 0.65 ? 'quad' : 'buggy';
        if (counter === 'anti_armor') return (cmd.difficulty === 'hard' && Math.random() < 0.5) ? 'marauder' : 'scorpion';
        if (cmd.difficulty === 'hard' && Math.random() < 0.22) return 'scud';
        return (cmd.difficulty === 'hard' && Math.random() < 0.4) ? 'marauder' : (Math.random() < 0.35 ? 'quad' : 'scorpion');
    } else {
        if (counter === 'anti_air') return Math.random() < 0.75 ? 'humvee' : 'paladin';
        if (counter === 'anti_infantry') return Math.random() < 0.65 ? 'humvee' : 'tank';
        if (counter === 'anti_armor') return (cmd.difficulty === 'hard' && Math.random() < 0.55) ? 'paladin' : 'tank';
        if (cmd.difficulty === 'hard' && Math.random() < 0.22) return 'tomahawk';
        return (cmd.difficulty === 'hard' && Math.random() < 0.4) ? 'paladin' : (Math.random() < 0.35 ? 'humvee' : 'tank');
    }
}

// Spawn AI structure for base construction or base perimeter defense (Requires active AI Builder: Dozer / Worker!)
function spawnAIStructure(cmd, type, pos, builderUnit) {
    if (typeof createStructureMeshForFaction !== 'function' || typeof scene === 'undefined') return null;
    const f = cmd.faction || 'china';
    const bType = (f === 'gla') ? 'worker' : 'dozer';
    const activeBuilder = builderUnit || (typeof enemyUnits !== 'undefined' ? enemyUnits.find(u =>
        u.ownerId === cmd.ownerId && u.health > 0 && (u.type === 'dozer' || u.type === 'worker') &&
        !u.targetStructure && u.taskState !== 'Building' && u.taskState !== 'MovingToBuild'
    ) : null);

    // Authentic C&C Generals Rule: AI CANNOT construct buildings without a live Dozer / Worker!
    if (!activeBuilder || activeBuilder.health <= 0) return null;

    const group = createStructureMeshForFaction(type, f);
    if (!group.userData || !group.userData.isW3D) {
        group.scale.set(1.35, 1.35, 1.35);
    }
    const radius = (typeof getStructureFootprint === 'function') ? (getStructureFootprint(type).radius || 6.0) : 6.0;
    const groundY = (typeof getTerrainHeight === 'function') ? getTerrainHeight(pos.x, pos.z) : 0;
    pos.y = groundY + 0.05;
    group.position.copy(pos);

    // Apply construction wireframe material until the AI Dozer/Worker completes construction (0% -> 100%)
    group.traverse(child => {
        if (child.isMesh) {
            child.savedMaterial = child.material;
            child.material = new THREE.MeshBasicMaterial({ color: 0xff9f43, wireframe: true, transparent: true, opacity: 0.45 });
        }
    });
    scene.add(group);

    const maxHp = (type === 'patriot' || type === 'gatlingCannon' || type === 'stingerSite') ? 900 : 1200;
    const esObj = {
        type: type,
        mesh: group,
        position: pos.clone(),
        radius: radius,
        health: maxHp,
        maxHealth: maxHp,
        netId: 'AIS_' + (++netIdSequence),
        teamId: cmd.teamId,
        ownerId: cmd.ownerId,
        faction: f,
        isAI: true,
        isBuilding: true,
        buildProgress: 0,
        dozerRef: null,
        spawnedHarvester: false
    };
    enemyStructures.push(esObj);
    if (typeof clearFoundationFootprint === 'function') clearFoundationFootprint(esObj);
    markPathfindGridDirty();
    if (typeof assignDozerToStructure === 'function') {
        assignDozerToStructure(activeBuilder, esObj);
    }
    return esObj;
}

// AI Economy, Harvester/Dozer Replacement & Base Defense Construction (AIPlayer.cpp)
function processAIBaseBuildingAndEconomy(cmd, myUnits, myStructures, hostileUnits) {
    // 1. Supply Center income + active harvester maintenance (queueSupplyTruck / queueDozer)
    const supplyStruct = myStructures.find(s => !s.isBuilding && (s.type === 'supplyCenter' || s.type === 'supplyStash'));
    const cmdCenter = myStructures.find(s => !s.isBuilding && (s.type === 'center' || s.type === 'commandCenter'));
    const incomeTick = cmd.difficulty === 'hard' ? 180 : cmd.difficulty === 'easy' ? 95 : 135;
    if (supplyStruct || cmdCenter) {
        cmd.resources = Math.min(25000, (cmd.resources || 0) + incomeTick);
    }

    const desiredGatherers = ZERO_HOUR_AI_DATA.resourceGatherers[cmd.difficulty] || 1;
    const myGatherers = myUnits.filter(u => u.type === 'truck' || u.type === 'chinook' || (u.type === 'worker' && u.aiState && u.aiState !== 'Idle'));
    if (supplyStruct && myGatherers.length < desiredGatherers && cmd.resources >= 600) {
        const hType = (cmd.faction === 'gla') ? 'worker' : (cmd.faction === 'usa' ? 'chinook' : 'truck');
        const spawnPos = adjustToPossibleDestination(supplyStruct.position.clone().add(new THREE.Vector3(7, 0, 7)), supplyStruct);
        const harv = spawnEnemyUnit(hType, spawnPos, null, cmd.faction);
        if (harv) {
            cmd.resources -= 600;
            harv.teamId = cmd.teamId;
            harv.ownerId = cmd.ownerId;
            harv.isAI = true;
            harv.difficulty = cmd.difficulty;
            harv.taskState = 'Idle';
            harv.aiState = 'MovingToDock';
            harv.supplyTarget = (typeof findNearestSupplyPoint === 'function') ? findNearestSupplyPoint(harv.mesh.position) : null;
            if (harv.supplyTarget) {
                harv.targetPosition.copy(getSupplyDockSlotPosition(harv.supplyTarget, harv, false));
                if (hType === 'chinook') harv.airState = 'flying';
            }
        }
    }

    // Ensure AI maintains at least 1 Construction Dozer / Builder Worker if Command Center stands
    const myBuilders = myUnits.filter(u => u.type === 'dozer' || (u.type === 'worker' && (!u.aiState || u.aiState === 'Idle')));
    if (cmdCenter && myBuilders.length === 0 && cmd.resources >= 1000) {
        const bType = (cmd.faction === 'gla') ? 'worker' : 'dozer';
        const spawnPos = adjustToPossibleDestination(cmdCenter.position.clone().add(new THREE.Vector3(-8, 0, 8)), cmdCenter);
        const bUnit = spawnEnemyUnit(bType, spawnPos, null, cmd.faction);
        if (bUnit) {
            cmd.resources -= 1000;
            bUnit.teamId = cmd.teamId;
            bUnit.ownerId = cmd.ownerId;
            bUnit.isAI = true;
            bUnit.difficulty = cmd.difficulty;
            bUnit.taskState = 'Idle';
            bUnit.aiState = 'Idle';
            myBuilders.push(bUnit);
        }
    }

    // Find an available idle AI builder (Dozer or Worker)
    const availBuilder = myBuilders.find(b =>
        b.health > 0 && !b.targetStructure && b.taskState !== 'Building' && b.taskState !== 'MovingToBuild'
    );
    if (!availBuilder) return;

    // If an existing AI foundation lost its builder, dispatch the idle builder to finish it first!
    const unfinishedStruct = myStructures.find(s => s.isBuilding && (!s.dozerRef || s.dozerRef.health <= 0));
    if (unfinishedStruct) {
        if (typeof assignDozerToStructure === 'function') {
            assignDozerToStructure(availBuilder, unfinishedStruct);
        }
        return;
    }

    // 2. Periodic Base Construction & Perimeter Defense Placement
    cmd.structureTimer = (cmd.structureTimer || 0) + 1;
    const buildCheckInterval = myStructures.length < 5 ? 2 : 5;
    if (cmd.structureTimer < buildCheckInterval) return;
    cmd.structureTimer = 0;

    // Do not build if enemies are directly inside base (underAttack check from AIPlayer.cpp)
    const baseUnderAttack = hostileUnits.some(hu => hu.mesh && hu.mesh.position.distanceTo(cmd.basePos) < 35);
    if (baseUnderAttack || cmd.resources < 600) return;

    // Essential base structures to construct / reconstruct in priority order
    const f = cmd.faction || 'china';
    const essentialList = [
        { check: s => s.type === 'power' || s.type === 'nuclearReactor', build: f === 'china' ? 'nuclearReactor' : 'power', cost: 800, offset: new THREE.Vector3(-22, 0, -18) },
        { check: s => s.type === 'supplyCenter' || s.type === 'supplyStash', build: f === 'gla' ? 'supplyStash' : 'supplyCenter', cost: 1500, offset: new THREE.Vector3(22, 0, -18) },
        { check: s => s.type === 'barracks', build: 'barracks', cost: 600, offset: new THREE.Vector3(-22, 0, 20) },
        { check: s => s.type === 'factory', build: 'factory', cost: 2000, offset: new THREE.Vector3(24, 0, 20) }
    ];

    for (let item of essentialList) {
        if (f === 'gla' && (item.build === 'power' || item.build === 'nuclearReactor')) continue;
        if (!myStructures.some(item.check) && cmd.resources >= item.cost) {
            const candidatePos = adjustToPossibleDestination(cmd.basePos.clone().add(item.offset));
            const built = spawnAIStructure(cmd, item.build, candidatePos, availBuilder);
            if (built) {
                cmd.resources -= item.cost;
            }
            return;
        }
    }

    // Build perimeter base defense along front approach vector (AISkirmishPlayer::buildAIBaseDefense)
    const defType = f === 'china' ? 'gatlingCannon' : f === 'gla' ? 'stingerSite' : 'patriot';
    const maxDefenses = cmd.difficulty === 'hard' ? 4 : cmd.difficulty === 'easy' ? 1 : 2;
    const currentDefenses = myStructures.filter(s => s.type === 'patriot' || s.type === 'gatlingCannon' || s.type === 'stingerSite' || s.type === 'bunker' || s.type === 'tunnel');
    if (currentDefenses.length < maxDefenses && cmd.resources >= 1800) {
        const enemyRef = (cmd.discoveredEnemyBases.length > 0) ? cmd.discoveredEnemyBases[0].position : new THREE.Vector3(0, 0, 0);
        const frontDir = new THREE.Vector3().subVectors(enemyRef, cmd.basePos);
        if (frontDir.lengthSq() < 1) frontDir.set(-cmd.basePos.x, 0, -cmd.basePos.z);
        frontDir.y = 0;
        frontDir.normalize();
        const sideDir = new THREE.Vector3(-frontDir.z, 0, frontDir.x);
        const spread = (currentDefenses.length % 2 === 0 ? 1 : -1) * (8 + currentDefenses.length * 4);
        const defPos = cmd.basePos.clone()
            .addScaledVector(frontDir, 24)
            .addScaledVector(sideDir, spread);
        const clearPos = adjustToPossibleDestination(defPos);
        const builtDef = spawnAIStructure(cmd, defType, clearPos, availBuilder);
        if (builtDef) {
            cmd.resources -= 1000;
        }
    }
}

function processEnemyAIEngine() {
    if (isMultiplayerActive) return;
    aiDecisionTimer++;
    // Scaled AI decision tick rate by chosen difficulty
    const tickRate = aiDifficultyLevel === 'hard' ? 30 : aiDifficultyLevel === 'easy' ? 90 : 60;
    if (aiDecisionTimer < tickRate) return;
    aiDecisionTimer = 0;

    // Ensure AI commanders initialized
    if (Object.keys(aiCommanders).length === 0 && enemyStructures.length > 0) {
        initAICommanders();
    }

    const mapSize = (typeof currentMapSize !== 'undefined' ? currentMapSize : 1500);
    const allUnits = [...units, ...enemyUnits];
    const allStructures = [...structures, ...enemyStructures];

    // Evaluate each AI Commander independently
    Object.values(aiCommanders).forEach(cmd => {
        const myUnits = enemyUnits.filter(e => e.ownerId === cmd.ownerId && e.health > 0);
        const myStructures = enemyStructures.filter(s => s.ownerId === cmd.ownerId && s.health > 0);

        if (myStructures.length === 0 && myUnits.length === 0) return; // Commander eliminated

        const hostileUnits = allUnits.filter(u => u.health > 0 && !isFriendly(cmd, u));
        const hostileStructures = allStructures.filter(s => s.health > 0 && !isFriendly(cmd, s));

        // --- 0. Zero Hour Economy, Harvesters, Dozer Auto-Repair & Base Building ---
        processAIBaseBuildingAndEconomy(cmd, myUnits, myStructures, hostileUnits);
        evaluateEnemyThreatProfile(cmd, hostileUnits);

        // --- 1. AI Production Engine with Threat Counter Selection ---
        cmd.productionTimer++;
        const isWealthy = (cmd.resources || 0) >= ZERO_HOUR_AI_DATA.resourcesWealthy;
        const baseProdInterval = cmd.difficulty === 'hard' ? 7 : cmd.difficulty === 'easy' ? 22 : 12;
        const prodInterval = isWealthy ? Math.max(4, Math.floor(baseProdInterval * 0.65)) : baseProdInterval;
        const maxUnits = cmd.difficulty === 'hard' ? 24 : cmd.difficulty === 'easy' ? 10 : 15;

        const combatUnits = myUnits.filter(u => u.type !== 'dozer' && u.type !== 'worker' && u.type !== 'truck' && u.type !== 'chinook');
        if (cmd.productionTimer % prodInterval === 0 && combatUnits.length < maxUnits && (cmd.resources || 0) >= 500) {
            const fac = myStructures.find(es => !es.isBuilding && es.type === 'factory' && es.health > 0);
            const bar = myStructures.find(es => !es.isBuilding && es.type === 'barracks' && es.health > 0);
            // Combined arms: mix 70% armor/vehicles + 30% counter infantry when both facilities exist
            const chosenFacility = (fac && bar) ? (Math.random() < 0.72 ? fac : bar) : (fac || bar);
            if (chosenFacility) {
                const rawSpawn = chosenFacility.position.clone().add(new THREE.Vector3(10 + Math.random() * 4, 0, 8 + Math.random() * 4));
                const spawnPos = adjustToPossibleDestination(rawSpawn, chosenFacility);
                spawnPos.y = typeof getTerrainHeight === 'function' ? getTerrainHeight(spawnPos.x, spawnPos.z) : 0;
                const uType = chooseAICounterUnitType(cmd, chosenFacility.type);
                const eu = spawnEnemyUnit(uType, spawnPos, null, cmd.faction);
                if (eu) {
                    cmd.resources = Math.max(0, (cmd.resources || 0) - 700);
                    eu.teamId = cmd.teamId;
                    eu.ownerId = cmd.ownerId;
                    eu.isAI = true;
                    eu.difficulty = cmd.difficulty;
                    // Add newly produced combat unit to staging strike team at rally point (AISkirmishPlayer::processTeamBuilding)
                    if (!cmd.stagingTeam) cmd.stagingTeam = [];
                    cmd.stagingTeam.push(eu.netId);
                    eu.targetPosition.copy(cmd.rallyPoint);
                    eu.taskState = 'Moving';
                    eu.waypoints = [];
                }
            }
        }

        // --- 2. Reconnaissance & Scout Allocation ---
        for (let sId of cmd.scoutNetIds) {
            if (!myUnits.some(u => u.netId === sId)) cmd.scoutNetIds.delete(sId);
        }

        if (cmd.scoutNetIds.size < (cmd.difficulty === 'easy' ? 1 : 2) && combatUnits.length > 0) {
            const candidateScout = combatUnits.find(u => !u.combatTarget && !cmd.scoutNetIds.has(u.netId));
            if (candidateScout) {
                candidateScout.isScout = true;
                cmd.scoutNetIds.add(candidateScout.netId);
                if (cmd.stagingTeam) {
                    cmd.stagingTeam = cmd.stagingTeam.filter(id => id !== candidateScout.netId);
                }
            }
        }

        cmd.scoutNetIds.forEach(scoutNetId => {
            const scout = myUnits.find(u => u.netId === scoutNetId);
            if (!scout) return;

            const distToGoal = scout.mesh.position.distanceTo(scout.targetPosition);
            if (distToGoal < 16.0 || scout.targetPosition.distanceTo(cmd.basePos) < 2.0) {
                if (cmd.unexploredWaypoints.length > 0) {
                    const nextWp = cmd.unexploredWaypoints.shift();
                    scout.targetPosition.copy(nextWp);
                } else {
                    const half = mapSize * 0.35;
                    const rx = (Math.random() * 2 - 1) * half;
                    const rz = (Math.random() * 2 - 1) * half;
                    scout.targetPosition.set(rx, typeof getTerrainHeight === 'function' ? getTerrainHeight(rx, rz) : 0, rz);
                }
            }
        });

        // --- 3. Line-of-Sight & Recon Detection Pass (NO OMNISCIENCE!) ---
        myUnits.forEach(u => {
            const sightRange = (u.isScout ? 36 : 28);

            hostileStructures.forEach(struct => {
                const sPos = struct.position || (struct.mesh && struct.mesh.position);
                if (sPos && u.mesh.position.distanceTo(sPos) <= (sightRange + (struct.radius || 8))) {
                    const wasKnown = cmd.discoveredEnemyBases.some(b => b.position.distanceTo(sPos) < 25);
                    shareTeamDiscovery(cmd.teamId, struct, true);
                    if (!wasKnown) {
                        if (cmd.teamId === playerTeamId) {
                            showNotification(`Allied Recon: Hostile enemy base sighted at sector [${Math.round(sPos.x)}, ${Math.round(sPos.z)}]!`, 'info');
                            if (typeof playUSASound === 'function') playUSASound('radio_chirp');
                        } else if (structures.includes(struct) || units.includes(struct)) {
                            showNotification(`Radar Alert: Hostile reconnaissance detected our perimeter!`, 'warning');
                        }
                    }
                }
            });

            hostileUnits.forEach(hu => {
                if (hu.mesh && u.mesh.position.distanceTo(hu.mesh.position) <= sightRange) {
                    shareTeamDiscovery(cmd.teamId, hu, false);
                }
            });
        });

        // --- 4. Retaliation System (Zero Hour AI.h: MaxRetaliationDistance & RetaliationFriendsRadius) ---
        const nowMs = Date.now();
        const recentlyAttackedAsset = [...myStructures, ...myUnits].find(a =>
            a._lastAttackedTime && (nowMs - a._lastAttackedTime < 6500) &&
            a._lastAttacker && a._lastAttacker.health > 0 && !isFriendly(cmd, a._lastAttacker)
        );
        if (recentlyAttackedAsset && recentlyAttackedAsset._lastAttacker) {
            const attacker = recentlyAttackedAsset._lastAttacker;
            const attackerPos = attacker.position || (attacker.mesh && attacker.mesh.position);
            const victimPos = recentlyAttackedAsset.position || (recentlyAttackedAsset.mesh && recentlyAttackedAsset.mesh.position);
            if (attackerPos && victimPos) {
                const retDist = victimPos.distanceTo(attackerPos);
                if (retDist <= ZERO_HOUR_AI_DATA.maxRetaliateDistance) {
                    shareTeamDiscovery(cmd.teamId, attacker, false);
                    combatUnits.forEach(ally => {
                        if (!ally.combatTarget && ally.mesh.position.distanceTo(victimPos) <= ZERO_HOUR_AI_DATA.retaliateFriendsRadius) {
                            ally.combatTarget = attacker;
                            ally.targetPosition.copy(attackerPos);
                        }
                    });
                }
            }
        }

        // --- 5. Tactical AI Order Pass & Strike Team Wave Assembly ---
        cmd.discoveredEnemyTargets = cmd.discoveredEnemyTargets.filter(t => {
            const aliveUnit = hostileUnits.find(hu => hu.netId === t.netId);
            const aliveStruct = hostileStructures.find(hs => hs.netId === t.netId);
            return (aliveUnit && aliveUnit.health > 0) || (aliveStruct && aliveStruct.health > 0);
        });

        cmd.discoveredEnemyBases = cmd.discoveredEnemyBases.filter(b => {
            return hostileStructures.some(hs => (hs.position || hs.mesh.position).distanceTo(b.position) < 35);
        });

        const elapsedSec = (Date.now() - (cmd.matchStartTime || (typeof matchStartTime !== 'undefined' ? matchStartTime : Date.now()))) / 1000;
        const attackDelays = { easy: 300, medium: 180, hard: 120 };
        const attackDelaySec = attackDelays[cmd.difficulty] || 180;
        const canLaunchOffensive = elapsedSec >= attackDelaySec;

        if (canLaunchOffensive && !cmd.hasAnnouncedOffensive) {
            cmd.hasAnnouncedOffensive = true;
            if (typeof isFriendly === 'function' && !isFriendly(cmd, { teamId: (typeof playerTeamId !== 'undefined' ? playerTeamId : 1) })) {
                if (typeof showNotification === 'function') {
                    showNotification(`Tactical Alert: Hostile AI Commander (${(cmd.faction || 'OPFOR').toUpperCase()} - ${(cmd.difficulty || 'medium').toUpperCase()}) has mobilized offensive strike forces!`, 'warning');
                }
                if (typeof playUSASound === 'function') playUSASound('radio_chirp');
            }
        }

        // Clean dead units from stagingTeam
        if (!cmd.stagingTeam) cmd.stagingTeam = [];
        cmd.stagingTeam = cmd.stagingTeam.filter(id => combatUnits.some(u => u.netId === id));
        const targetWaveSize = ZERO_HOUR_AI_DATA.maxStrikeTeamSize[cmd.difficulty] || 4;
        if (canLaunchOffensive && cmd.stagingTeam.length >= targetWaveSize && (cmd.discoveredEnemyTargets.length > 0 || cmd.discoveredEnemyBases.length > 0)) {
            // Release staging team into active offensive wave!
            cmd.stagingTeam.forEach(id => {
                const member = combatUnits.find(u => u.netId === id);
                if (member) member._releasedForAttack = true;
            });
            cmd.stagingTeam = [];
        }

        combatUnits.forEach(enemy => {
            if (enemy.isScout && !enemy.combatTarget) return;

            // If unit is already engaged in active combat with valid hostile target:
            if (enemy.combatTarget && enemy.combatTarget.health > 0 && !isFriendly(enemy, enemy.combatTarget)) {
                const targetPos = enemy.combatTarget.position || enemy.combatTarget.mesh.position;
                if (!canLaunchOffensive && targetPos && enemy.mesh.position.distanceTo(cmd.basePos) > 45) {
                    enemy.combatTarget = null;
                } else {
                    if (enemy.mesh.position.distanceTo(targetPos) > enemy.scanRange) {
                        enemy.targetPosition.copy(targetPos);
                    }
                    return;
                }
            } else if (enemy.combatTarget) {
                enemy.combatTarget = null;
            }

            // Defend base perimeter against close intruders at all times (guardInnerModifierAI)
            let localIntruder = null;
            let minDist = 38 * ZERO_HOUR_AI_DATA.guardInnerModifierAI;
            hostileUnits.forEach(hu => {
                if (hu.mesh) {
                    const d = enemy.mesh.position.distanceTo(hu.mesh.position);
                    if (d < minDist) { minDist = d; localIntruder = hu; }
                }
            });
            if (localIntruder) {
                enemy.combatTarget = localIntruder;
                enemy.targetPosition.copy(localIntruder.mesh.position);
                return;
            }

            // Hold in staging rally area until wave is full or offensive grace expires
            const isStaging = cmd.stagingTeam.includes(enemy.netId) && !enemy._releasedForAttack;
            if (!canLaunchOffensive || isStaging || (cmd.discoveredEnemyBases.length === 0 && cmd.discoveredEnemyTargets.length === 0)) {
                if (enemy.mesh.position.distanceTo(cmd.rallyPoint) > 14) {
                    enemy.targetPosition.copy(cmd.rallyPoint);
                    enemy.taskState = 'Moving';
                }
                return;
            }

            // Select highest-priority discovered target using Zero Hour distance-weighted priority!
            let bestTarget = null;
            let bestScore = -Infinity;

            cmd.discoveredEnemyTargets.forEach(dt => {
                const liveObj = hostileUnits.find(hu => hu.netId === dt.netId) || hostileStructures.find(hs => hs.netId === dt.netId);
                if (liveObj && liveObj.health > 0) {
                    const score = scoreAITargetPriority(enemy, liveObj, cmd);
                    if (score > bestScore) {
                        bestScore = score;
                        bestTarget = liveObj;
                    }
                }
            });

            if (!bestTarget && cmd.discoveredEnemyBases.length > 0) {
                const targetBase = cmd.discoveredEnemyBases[0];
                const d = enemy.mesh.position.distanceTo(targetBase.position);
                if (d > enemy.scanRange) {
                    const navPath = (!enemy.isAir && typeof findNavigationPath === 'function')
                        ? findNavigationPath(enemy.mesh.position, targetBase.position)
                        : [targetBase.position.clone()];
                    if (navPath.length > 1) {
                        enemy.waypoints = navPath.slice(1);
                        enemy.targetPosition.copy(navPath[0]);
                    } else {
                        enemy.targetPosition.copy(targetBase.position);
                    }
                }
                return;
            }

            if (bestTarget) {
                enemy.combatTarget = bestTarget;
                const targetPos = bestTarget.position || bestTarget.mesh.position;
                const distToBest = enemy.mesh.position.distanceTo(targetPos);
                if (distToBest > enemy.scanRange) {
                    const approachDir = new THREE.Vector3().subVectors(targetPos, enemy.mesh.position).normalize();
                    const goalPos = targetPos.clone().addScaledVector(approachDir, -(enemy.scanRange - 3));
                    const navPath = (!enemy.isAir && typeof findNavigationPath === 'function')
                        ? findNavigationPath(enemy.mesh.position, goalPos, { ignoreStruct: bestTarget })
                        : [goalPos];
                    if (navPath.length > 1) {
                        enemy.waypoints = navPath.slice(1);
                        enemy.targetPosition.copy(navPath[0]);
                    } else {
                        enemy.targetPosition.copy(goalPos);
                    }
                } else {
                    enemy.targetPosition.copy(enemy.mesh.position);
                }
            }
        });
    });
}

        function onPointerDown(e) {
            if (e.target.closest('#generals-command-bar') || e.target.closest('#top-hud-bar') || e.target.closest('#cnc-sidebar') || e.target.closest('#hud') || e.target.closest('#start-menu') || e.target.tagName === 'BUTTON') return;

            if (e.button === 0) {
                if (typeof isSellMode !== 'undefined' && isSellMode) {
                    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
                    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
                    raycaster.setFromCamera(mouse, camera);
                    const allStructures = [...structures, ...enemyStructures];
                    const hits = raycaster.intersectObjects(allStructures.map(s => s.mesh).filter(Boolean), true);
                    if (hits.length > 0) {
                        let hit = hits[0].object;
                        while (hit.parent && hit.parent !== scene) hit = hit.parent;
                        const targetStruct = allStructures.find(s => s.mesh === hit);
                        if (targetStruct) {
                            if (targetStruct.ownerId && targetStruct.ownerId !== 'player') {
                                showNotification("Cannot demolish an allied structure!", "error");
                            } else {
                                sellStructure(targetStruct);
                            }
                        }
                    }
                    return;
                }
                if (typeof isRepairMode !== 'undefined' && isRepairMode) {
                    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
                    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
                    raycaster.setFromCamera(mouse, camera);
                    const allStructures = [...structures, ...enemyStructures];
                    const hits = raycaster.intersectObjects(allStructures.map(s => s.mesh).filter(Boolean), true);
                    if (hits.length > 0) {
                        let hit = hits[0].object;
                        while (hit.parent && hit.parent !== scene) hit = hit.parent;
                        const targetStruct = allStructures.find(s => s.mesh === hit);
                        if (targetStruct) {
                            if (targetStruct.ownerId && targetStruct.ownerId !== 'player') {
                                showNotification("Cannot command repairs on allied structures!", "error");
                            } else {
                                repairStructure(targetStruct);
                            }
                        }
                    }
                    return;
                }
                if (choosingBaseLocation) {
                    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
                    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
                    raycaster.setFromCamera(mouse, camera);
                    const placement = getGroundIntersectPoint();
                    if (placement) deployBase(placement);
                    return;
                }
                if (typeof activeGeneralPower !== 'undefined' && activeGeneralPower) {
                    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
                    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
                    raycaster.setFromCamera(mouse, camera);
                    const targetPosition = getGroundIntersectPoint();
                    if (targetPosition) {
                        executeGeneralsPowerAt(targetPosition);
                    }
                    return;
                }
                if (pendingSuperweapon) {
                    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
                    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
                    raycaster.setFromCamera(mouse, camera);
                    const targetPosition = getGroundIntersectPoint();
                    if (targetPosition) {
                        const weapon = pendingSuperweapon;
                        if (buildingTick < (weapon.cooldownUntil || 0)) {
                            const secsLeft = Math.ceil((weapon.cooldownUntil - buildingTick) / 60);
                            showNotification(`Superweapon is recharging (${secsLeft}s remaining).`, 'error');
                        } else {
                            strikeWithSuperweapon(weapon, targetPosition);
                        }
                        pendingSuperweapon = null;
                        document.body.style.cursor = 'default';
                    }
                    return;
                }
                if (blueprintMesh) {
                    if (!isBlueprintValid) {
                        showNotification("Cannot place structure in water, on bridges, or obstructed ground!", "error");
                        return;
                    }
                    isPlacingBlueprint = true;
                    blueprintPlacementPos = blueprintMesh.position.clone();
                    return;
                }
                isDragging = true;
                startPoint.x = e.clientX;
                startPoint.y = e.clientY;
                selectionBox.style.left = e.clientX + 'px';
                selectionBox.style.top = e.clientY + 'px';
                selectionBox.style.width = '0px';
                selectionBox.style.height = '0px';
                selectionBox.style.display = 'none';
            } else if (e.button === 1) {
                isRotatingCamera = true;
                previousMousePosition = { x: e.clientX, y: e.clientY };
                e.preventDefault();
            } else if (e.button === 2) { 
                if (typeof activeGeneralPower !== 'undefined' && activeGeneralPower) {
                    activeGeneralPower = null;
                    document.body.style.cursor = 'default';
                    showNotification('General power cancelled.', 'info');
                    return;
                }
                if (pendingSuperweapon) {
                    pendingSuperweapon = null;
                    document.body.style.cursor = 'default';
                    showNotification('Superweapon strike cancelled.', 'info');
                    return;
                }
                if (blueprintMesh) {
                    scene.remove(blueprintMesh);
                    blueprintMesh = null;
                    activeBlueprintType = null;
                    isPlacingBlueprint = false;
                    document.body.style.cursor = 'default';
                    showNotification('Construction cancelled.', 'info');
                    return;
                }
                // Hold Right-Click & Drag to rapidly scroll across map
                isRightDragging = false;
                rightDragStart = { x: e.clientX, y: e.clientY };
                lastRightPointerPos = { x: e.clientX, y: e.clientY };
            }
        }

        function onPointerMove(e) {
            // Hold Right-Click & Drag: Rapidly scroll across the map (Official Generals control)
            if (rightDragStart) {
                const dist = Math.hypot(e.clientX - rightDragStart.x, e.clientY - rightDragStart.y);
                if (dist > 5) {
                    isRightDragging = true;
                    const dx = e.clientX - lastRightPointerPos.x;
                    const dy = e.clientY - lastRightPointerPos.y;
                    const forward = new THREE.Vector3(-Math.sin(cameraAlpha), 0, -Math.cos(cameraAlpha));
                    const right = new THREE.Vector3(Math.cos(cameraAlpha), 0, -Math.sin(cameraAlpha));
                    const scrollFactor = (cameraRadius / 100) * 0.38;
                    cameraTarget.addScaledVector(right, -dx * scrollFactor);
                    cameraTarget.addScaledVector(forward, dy * scrollFactor);
                    updateCameraPosition();
                    lastRightPointerPos = { x: e.clientX, y: e.clientY };
                    return;
                }
            }
            mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);
            const intersect = new THREE.Vector3();

            const groundHit = getGroundIntersectPoint();
            if (groundHit) {
                intersect.copy(groundHit);
                if (isPlacingBlueprint && blueprintMesh && blueprintPlacementPos) {
                    const dx = groundHit.x - blueprintPlacementPos.x;
                    const dz = groundHit.z - blueprintPlacementPos.z;
                    if (Math.hypot(dx, dz) > 1.2) {
                        blueprintRotationY = Math.atan2(dx, dz);
                        blueprintMesh.rotation.y = blueprintRotationY;
                    }
                    return;
                }
                if (blueprintMesh) {
                    updateBlueprintPosition(intersect);
                    return;
                }
            }

            if (isRotatingCamera) {
                cameraAlpha -= (e.clientX - previousMousePosition.x) * 0.005;
                previousMousePosition = { x: e.clientX, y: e.clientY };
                updateCameraPosition();
                return;
            }

            // CRUCIAL FIX: Only update & show drag rectangle when left mouse button is actively held down!
            if (!isDragging) return;

            const w = Math.abs(e.clientX - startPoint.x);
            const h = Math.abs(e.clientY - startPoint.y);
            selectionBox.style.width = w + 'px';
            selectionBox.style.height = h + 'px';
            selectionBox.style.left = Math.min(e.clientX, startPoint.x) + 'px';
            selectionBox.style.top = Math.min(e.clientY, startPoint.y) + 'px';
            if (w > 8 || h > 8) {
                selectionBox.style.display = 'block';
            }
        }

        // Ported from DozerAIUpdate.cpp::findGoodBuildOrRepairPosition:
        // Computes the closest perimeter point outside the structure footprint, and rotates around
        // the perimeter if the direct angle is in water or inside another obstacle's footprint.
        function getStructureBuildPerimeterPoint(builder, structure) {
            const builderRadius = (builder && builder.radius) || 1.8;
            const structRadius = (structure && structure.radius) || 8.0;
            const workDist = structRadius + builderRadius + 0.6;
            const bPos = (builder && builder.mesh) ? builder.mesh.position : ((builder && builder.position) || { x: 0, z: 0 });
            const sPos = structure.position || (structure.mesh && structure.mesh.position) || { x: 0, y: 0, z: 0 };
            const dx = bPos.x - sPos.x;
            const dz = bPos.z - sPos.z;
            let baseAngle = Math.atan2(dz, dx);
            if (Math.abs(dx) < 0.001 && Math.abs(dz) < 0.001) baseAngle = 0;

            const angleOffsets = [
                0,
                Math.PI / 6, -Math.PI / 6,
                Math.PI / 3, -Math.PI / 3,
                Math.PI / 2, -Math.PI / 2,
                (2 * Math.PI) / 3, -(2 * Math.PI) / 3,
                (5 * Math.PI) / 6, -(5 * Math.PI) / 6,
                Math.PI
            ];
            for (let i = 0; i < angleOffsets.length; i++) {
                const a = baseAngle + angleOffsets[i];
                const tX = sPos.x + Math.cos(a) * workDist;
                const tZ = sPos.z + Math.sin(a) * workDist;
                const cell = classifyPathfindPosition(tX, tZ, structure, 0.8);
                if (isCellPassableOnGround(cell)) {
                    const tY = typeof getTerrainHeight === 'function' ? getTerrainHeight(tX, tZ) : (sPos.y || 0);
                    return new THREE.Vector3(tX, tY, tZ);
                }
            }
            const tX = sPos.x + Math.cos(baseAngle) * workDist;
            const tZ = sPos.z + Math.sin(baseAngle) * workDist;
            const tY = typeof getTerrainHeight === 'function' ? getTerrainHeight(tX, tZ) : (sPos.y || 0);
            return new THREE.Vector3(tX, tY, tZ);
        }
        window.getStructureBuildPerimeterPoint = getStructureBuildPerimeterPoint;

        function assignDozerToStructure(builder, structure) {
            if (!builder || !structure || structure.health <= 0) return;
            if (structure.dozerRef && structure.dozerRef !== builder) {
                structure.dozerRef.targetStructure = null;
                structure.dozerRef.taskState = 'Idle';
            }
            structure.dozerRef = builder;
            builder.targetStructure = structure;
            builder.taskState = 'MovingToBuild';
            builder._boredTimer = 0;
            const perimeterPoint = getStructureBuildPerimeterPoint(builder, structure);
            builder.targetPosition.copy(perimeterPoint);
            builder.waypoints = [];
            if (typeof findBridgeCrossingsForPath === 'function' && builder.mesh) {
                const bridges = findBridgeCrossingsForPath(builder.mesh.position, builder.targetPosition, structure);
                if (bridges && bridges.length > 0) {
                    builder.waypoints = [...bridges, builder.targetPosition.clone()];
                    builder.targetPosition.copy(builder.waypoints.shift());
                }
            }
        }
        window.assignDozerToStructure = assignDozerToStructure;

        // Ported from DozerAIUpdate.cpp::newTask(DOZER_TASK_REPAIR) & sole-benefactor repair lock
        function assignDozerToRepair(builder, structure) {
            if (!builder || !structure || structure.health <= 0 || structure.isBuilding || structure.health >= structure.maxHealth) return false;
            // Enforce sole-benefactor repair lock (DozerAIUpdate.cpp:723 attemptHealingFromSoleBenefactor)
            if (structure.soleRepairer && structure.soleRepairer !== builder && structure.soleRepairer.health > 0 &&
                (structure.soleRepairer.taskState === 'Repairing' || structure.soleRepairer.taskState === 'MovingToRepair') &&
                structure.soleRepairer.targetStructure === structure) {
                return false;
            }
            structure.soleRepairer = builder;
            builder.targetStructure = structure;
            builder.taskState = 'MovingToRepair';
            builder._boredTimer = 0;
            if (builder.type === 'worker') builder.aiState = 'Idle';
            const perimeterPoint = getStructureBuildPerimeterPoint(builder, structure);
            builder.targetPosition.copy(perimeterPoint);
            builder.waypoints = [];
            if (typeof findBridgeCrossingsForPath === 'function' && builder.mesh) {
                const bridges = findBridgeCrossingsForPath(builder.mesh.position, builder.targetPosition, structure);
                if (bridges && bridges.length > 0) {
                    builder.waypoints = [...bridges, builder.targetPosition.clone()];
                    builder.targetPosition.copy(builder.waypoints.shift());
                }
            }
            return true;
        }
        window.assignDozerToRepair = assignDozerToRepair;

        function onPointerUp(e) {
            if (e.button === 1) isRotatingCamera = false;
            if (e.button === 2) {
                const wasDragging = isRightDragging;
                isRightDragging = false;
                rightDragStart = null;
                isPlacingBlueprint = false;
                if (!wasDragging) {
                    issueMoveCommand(e);
                }
                return;
            }
            if (e.button === 0 && isPlacingBlueprint && blueprintMesh && blueprintPlacementPos) {
                isPlacingBlueprint = false;
                const cost = getStructureCost(activeBlueprintType);
                if (playerResources < cost) {
                    showNotification("Insufficient resources for construction.", "error");
                    scene.remove(blueprintMesh);
                    blueprintMesh = null;
                    activeBlueprintType = null;
                    return;
                }
                playerResources -= cost;
                const resEl = document.getElementById('resource-display');
                if (resEl) resEl.innerText = `$${playerResources}`;
                
                const placementPosition = blueprintPlacementPos.clone();
                placementPosition.y = getTerrainHeight(placementPosition.x, placementPosition.z);
                const newStruct = buildStructureMesh(activeBlueprintType, placementPosition, false, blueprintRotationY);
                playUSASound('construction');
                if (typeof playUnitVoice === 'function') playUnitVoice('dozer', 'build');
                scene.remove(blueprintMesh);
                blueprintMesh = null;
                activeBlueprintType = null;

                const builderCandidates = units.filter(u => (u.type === 'dozer' || u.type === 'worker') && u.health > 0);
                let assignedBuilder = builderCandidates.find(u => u.selected);
                if (!assignedBuilder) {
                    assignedBuilder = builderCandidates.find(u => u.taskState === 'Idle');
                }
                if (!assignedBuilder && builderCandidates.length > 0) {
                    let minDist = Infinity;
                    builderCandidates.forEach(b => {
                        const d = b.mesh.position.distanceTo(newStruct.position);
                        if (d < minDist) {
                            minDist = d;
                            assignedBuilder = b;
                        }
                    });
                }
                if (assignedBuilder) {
                    assignDozerToStructure(assignedBuilder, newStruct);
                }
                showNotification('Construction started!', 'info');
                return;
            }
            if (e.button !== 0 || !isDragging) return;
            isDragging = false;

            const x1 = Math.min(startPoint.x, e.clientX);
            const x2 = Math.max(startPoint.x, e.clientX);
            const y1 = Math.min(startPoint.y, e.clientY);
            const y2 = Math.max(startPoint.y, e.clientY);
            const dragW = x2 - x1;
            const dragH = y2 - y1;

            // Reset visual drag box display
            selectionBox.style.display = 'none';
            selectionBox.style.width = '0px';
            selectionBox.style.height = '0px';

            // Distinct threshold: Drag rectangle if dragged > 6px, otherwise single click
            if (dragW > 6 || dragH > 6) {
                evaluateBoxSelection({ left: x1, right: x2, top: y1, bottom: y2 });
            } else {
                evaluateClickSelection(e);
            }
        }

        function onWindowWheel(e) {
            if (blueprintMesh) {
                e.preventDefault();
                blueprintRotationY = (typeof blueprintRotationY !== 'undefined' ? blueprintRotationY : 0) + (e.deltaY > 0 ? Math.PI / 8 : -Math.PI / 8);
                blueprintMesh.rotation.y = blueprintRotationY;
                return;
            }
            e.preventDefault(); cameraRadius += e.deltaY * 0.04 * zoomSpeed;
            cameraRadius = Math.max(25, Math.min(450, cameraRadius)); updateCameraPosition();
        }

        // River Crossing Bridge & Obstacle Waypoint Finder (integrated with AIPathfind.cpp):
        // Returns null when the straight line is clear; returns bridge entry/exit ramps when crossing water;
        // or returns A* string-pulled intermediate waypoints when blocked by structures/obstacles.
        function findBridgeCrossingsForPath(startPos, endPos, ignoreStruct = null) {
            if (!startPos || !endPos) return null;
            let crossesWater = false;
            const hasBridges = typeof mapBridges !== 'undefined' && mapBridges && mapBridges.length > 0;
            // Dense 20-sample scan along trajectory to detect water channels
            for (let t = 0.05; t <= 0.95; t += 0.05) {
                const px = startPos.x + (endPos.x - startPos.x) * t;
                const pz = startPos.z + (endPos.z - startPos.z) * t;
                if (getTerrainHeight(px, pz) < currentWaterLevel && (!hasBridges || !mapBridges.some(b => isPointOnBridge(px, pz, b)))) {
                    crossesWater = true;
                    break;
                }
            }

            if (crossesWater && hasBridges) {
                // Find closest bridge spanning this river
                let bestBridge = null;
                let bestDist = Infinity;
                mapBridges.forEach(b => {
                    const d = Math.hypot(startPos.x - b.position.x, startPos.z - b.position.z) +
                              Math.hypot(endPos.x - b.position.x, endPos.z - b.position.z);
                    if (d < bestDist) {
                        bestDist = d;
                        bestBridge = b;
                    }
                });
                if (bestBridge) {
                    const fwdX = Math.sin(bestBridge.rotationY);
                    const fwdZ = Math.cos(bestBridge.rotationY);
                    const halfLen = bestBridge.length * 0.5 + 3.0;

                    const ramp1 = new THREE.Vector3(bestBridge.position.x - fwdX * halfLen, bestBridge.deckY, bestBridge.position.z - fwdZ * halfLen);
                    const ramp2 = new THREE.Vector3(bestBridge.position.x + fwdX * halfLen, bestBridge.deckY, bestBridge.position.z + fwdZ * halfLen);

                    const d1 = startPos.distanceTo(ramp1);
                    const d2 = startPos.distanceTo(ramp2);

                    const entryRamp = d1 <= d2 ? ramp1 : ramp2;
                    const exitRamp = d1 <= d2 ? ramp2 : ramp1;

                    return [entryRamp, exitRamp];
                }
            }

            // If straight line is blocked by intermediate structures or terrain obstacles, compute A* detour waypoints
            if (typeof isPathfindSegmentClear === 'function' && !isPathfindSegmentClear(startPos, endPos, ignoreStruct, 1.4)) {
                const navWaypoints = findNavigationPath(startPos, endPos, { ignoreStruct });
                if (navWaypoints && navWaypoints.length > 1) {
                    // Return intermediate waypoints (excluding final destination, which caller appends)
                    return navWaypoints.slice(0, navWaypoints.length - 1);
                }
            }
            return null;
        }
        window.findBridgeCrossingsForPath = findBridgeCrossingsForPath;

        function issueMoveCommand(e) {
            // Check if player has a building selected and right-clicks on ground to set its rally point!
            if (selectedStructure && !units.some(u => u.selected)) {
                if (selectedStructure.ownerId && selectedStructure.ownerId !== 'player') {
                    showNotification('Cannot set rally points on allied structures!', 'error');
                    return;
                }
                const gHit = getGroundIntersectPoint();
                if (gHit) {
                    selectedStructure.rallyPoint = gHit.clone();
                    if (typeof spawnWaypointMarker === 'function') spawnWaypointMarker(gHit, 'rally');
                    showNotification('Rally point established for ' + selectedStructure.type.toUpperCase() + '.', 'info');
                    playUSASound('radio_chirp');
                    updateSidebar();
                    return;
                }
            }

            if (units.some(u => u.selected)) {
                const sel = units.find(u => u.selected);
                if (sel && typeof playUnitVoice === 'function') playUnitVoice(sel.type, 'move', sel.faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa'));
                else playUSASound('acknowledge');
            }
            // Ignore if clicking inside UI elements
            if (e.target && (e.target.closest('#generals-command-bar') || e.target.closest('#top-hud-bar') || e.target.closest('#cnc-sidebar') || e.target.closest('#hud') || e.target.closest('#start-menu'))) {
                return;
            }

            mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);

            // 0. Check if right-clicking on a friendly structure (unfinished foundation or damaged building) with Dozers/Workers
            const friendlyStructMeshes = structures.map(s => s.mesh).filter(Boolean);
            const friendlyStructHits = raycaster.intersectObjects(friendlyStructMeshes, true);
            if (friendlyStructHits.length > 0) {
                let hitObj = friendlyStructHits[0].object;
                while (hitObj.parent && hitObj.parent !== scene) hitObj = hitObj.parent;
                const targetedStruct = structures.find(s => s.mesh === hitObj);
                const selectedBuilders = units.filter(u => u.selected && (u.type === 'dozer' || u.type === 'worker') && u.health > 0);
                if (targetedStruct && selectedBuilders.length > 0) {
                    selectedBuilders.forEach(builder => {
                        if (targetedStruct.isBuilding) {
                            assignDozerToStructure(builder, targetedStruct);
                        } else if (targetedStruct.health < targetedStruct.maxHealth) {
                            assignDozerToRepair(builder, targetedStruct);
                        } else {
                            assignDozerToStructure(builder, targetedStruct);
                        }
                    });
                    if (typeof spawnWaypointMarker === 'function') spawnWaypointMarker(targetedStruct.position, 'move');
                    const actionName = targetedStruct.isBuilding ? 'construction' : (targetedStruct.health < targetedStruct.maxHealth ? 'repairs' : 'assignment');
                    showNotification(`Construction crew dispatched to resume ${actionName} on ${targetedStruct.type.toUpperCase()}.`, 'success');
                    if (typeof playUnitVoice === 'function') playUnitVoice(selectedBuilders[0].type, 'build', selectedBuilders[0].faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa'));
                    updateSidebar();
                    return;
                }
            }

            // 1. Check if the player right-clicked directly on an enemy unit OR enemy building
            const targetableEnemyMeshes = [
                ...enemyUnits.map(enemy => enemy.mesh),
                ...enemyStructures.map(struct => struct.mesh)
            ].filter(Boolean);
            const enemyIntersects = raycaster.intersectObjects(targetableEnemyMeshes, true);

            if (enemyIntersects.length > 0) {
                let hitEnemyObj = enemyIntersects[0].object;
                while (hitEnemyObj.parent && hitEnemyObj.parent !== scene) {
                    hitEnemyObj = hitEnemyObj.parent;
                }

                const targetedEnemy = enemyUnits.find(enemy => enemy.mesh === hitEnemyObj) ||
                                      enemyStructures.find(struct => struct.mesh === hitEnemyObj);

                if (targetedEnemy) {
                    const firstSelected = units.find(u => u.selected) || { teamId: playerTeamId };
                    if (isFriendly(firstSelected, targetedEnemy)) {
                        // Friendly ally clicked! Move to support / guard / rendezvous without attacking!
                        const tPos = targetedEnemy.mesh ? targetedEnemy.mesh.position : hitEnemyObj.position;
                        if (typeof spawnWaypointMarker === 'function') spawnWaypointMarker(tPos, 'move');
                        units.forEach(unit => {
                            if (unit.selected) {
                                unit.combatTarget = null;
                                unit.taskState = unit.isAir ? 'Moving' : 'Idle';
                                unit.targetPosition.copy(tPos);
                                if (unit.isAir) {
                                    unit.airState = (unit.airState === 'landed') ? 'taking_off' : 'flying';
                                    unit.patrolCenter.copy(tPos);
                                }
                            }
                        });
                        showNotification(`Support order: Rendezvous with allied ${targetedEnemy.type || 'unit'}`, 'info');
                        return;
                    }

                    if (typeof spawnWaypointMarker === 'function') {
                        const tPos = targetedEnemy.mesh ? targetedEnemy.mesh.position : hitEnemyObj.position;
                        spawnWaypointMarker(tPos, 'attack');
                    }
                    if (firstSelected && typeof playUnitVoice === 'function') {
                        playUnitVoice(firstSelected.type, 'attack', firstSelected.faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa'));
                    }

                    const targetPos = (targetedEnemy.position || targetedEnemy.mesh.position).clone();
                    const targetRadius = targetedEnemy.radius || 4;

                    units.forEach((unit, idx) => {
                        if (unit.selected) {
                            unit.combatTarget = targetedEnemy;
                            unit.taskState = 'MovingToAttack';
                            if (unit.isAir) {
                                unit.airState = (unit.airState === 'landed') ? 'taking_off' : 'attacking';
                                unit.targetPosition.copy(targetPos);
                                unit.patrolCenter.copy(targetPos);
                            }

                            const distToEnemy = unit.mesh.position.distanceTo(targetPos);
                            const desiredRange = unit.scanRange + targetRadius - 3;

                            if (distToEnemy > desiredRange) {
                                const approachVector = new THREE.Vector3()
                                    .subVectors(targetPos, unit.mesh.position)
                                    .normalize();

                                // Fan out units around building perimeter to avoid collision bunching
                                const fanAngle = (idx % 5 - 2) * 0.22;
                                approachVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), fanAngle);

                                const destX = targetPos.x - approachVector.x * desiredRange;
                                const destZ = targetPos.z - approachVector.z * desiredRange;
                                unit.targetPosition.set(destX, getTerrainHeight(destX, destZ), destZ);
                            } else {
                                unit.targetPosition.copy(unit.mesh.position);
                            }

                            if (unit.type === 'truck' || unit.type === 'worker') {
                                unit.aiState = 'Idle';
                            }
                        }
                    });

                    if (isMultiplayerActive && netConn && netConn.open) {
                        broadcastNetPacket({
                            type: 'attack_target',
                            unitNetIds: units.filter(u => u.selected).map(u => u.netId).filter(Boolean),
                            targetNetId: targetedEnemy.netId
                        });
                    }

                    showNotification(`Attack order confirmed on ${targetedEnemy.type || 'hostile asset'}!`, 'info');
                    updateSidebar();
                    return;
                }
            }

            // 1b. Check if right-clicking on a friendly transport vehicle to embark!
            const friendlyMeshes = units.filter(u => u.capacity > 0 && !u.garrisonedIn).map(u => u.mesh);
            const transportHits = raycaster.intersectObjects(friendlyMeshes, true);
            if (transportHits.length > 0) {
                let hitObj = transportHits[0].object;
                while (hitObj.parent && hitObj.parent !== scene) hitObj = hitObj.parent;
                const transport = units.find(u => u.mesh === hitObj);
                const selectedInfantry = units.filter(u => u.selected && isInfantryType(u.type));
                if (transport && selectedInfantry.length > 0) {
                    selectedInfantry.forEach(inf => {
                        inf.embarkTarget = transport;
                        inf.taskState = 'MovingToEmbark';
                        inf.combatTarget = null;
                        inf.targetPosition.copy(transport.mesh.position);
                    });
                    showNotification(`Infantry ordered to embark into ${transport.type} (${(transport.garrisoned || []).length}/${transport.capacity} seats).`, 'info');
                    updateSidebar();
                    return;
                }
            }

            // 1c. Check if right-clicking on a neutral capturable tech structure!
            if (window.neutralStructures && window.neutralStructures.length > 0) {
                const neutralMeshes = window.neutralStructures.map(ns => ns.mesh).filter(Boolean);
                const neutralHits = raycaster.intersectObjects(neutralMeshes, true);
                if (neutralHits.length > 0) {
                    let hitObj = neutralHits[0].object;
                    while (hitObj.parent && hitObj.parent !== scene) hitObj = hitObj.parent;
                    const targetTech = window.neutralStructures.find(ns => ns.mesh === hitObj);
                    if (targetTech) {
                        const selectedInfantry = units.filter(u => u.selected && isInfantryType(u.type));
                        if (selectedInfantry.length > 0) {
                            const tPos = targetTech.position.clone();
                            if (typeof spawnWaypointMarker === 'function') spawnWaypointMarker(tPos, 'move');
                            selectedInfantry.forEach(inf => {
                                inf.combatTarget = null;
                                inf.taskState = 'Capturing';
                                inf.captureTarget = targetTech;
                                inf.targetPosition.copy(tPos);
                            });
                            showNotification(`Infantry ordered to secure ${targetTech.name}!`, 'info');
                            playUSASound('radio_chirp');
                            updateSidebar();
                            return;
                        } else {
                            showNotification(`Deploy Infantry (Ranger, Red Guard, Rebel) to capture ${targetTech.name}.`, 'warning');
                        }
                    }
                }
            }

            // 2. CHECK IF RIGHT-CLICKING ON OR NEAR A SUPPLY DEPOT / CRATES!
            const groundHit = getGroundIntersectPoint();
            let clickedSupplyPoint = null;

            // Direct raycast hit on supply crystals, wooden docks, barrels
            const supplyMeshes = supplyPoints.map(p => p.mesh).filter(Boolean);
            const supplyIntersects = raycaster.intersectObjects(supplyMeshes, true);
            if (supplyIntersects.length > 0) {
                let hitObj = supplyIntersects[0].object;
                while (hitObj.parent && hitObj.parent !== scene) hitObj = hitObj.parent;
                clickedSupplyPoint = supplyPoints.find(p => p.mesh === hitObj || (p.mesh && p.mesh.children.includes(hitObj)));
                if (!clickedSupplyPoint && supplyIntersects[0].point) {
                    clickedSupplyPoint = findNearestSupplyPoint(supplyIntersects[0].point);
                }
            }

            // Proximity hit: clicking anywhere on the ground within 18 units of a supply depot
            if (!clickedSupplyPoint && groundHit) {
                for (const sp of supplyPoints) {
                    if (sp.stock > 0 && Math.hypot(groundHit.x - sp.position.x, groundHit.z - sp.position.z) < 18.0) {
                        clickedSupplyPoint = sp;
                        break;
                    }
                }
            }

            // If a supply point was targeted and any harvester (truck, worker, or chinook) is selected:
            const selectedHarvesters = units.filter(u => u.selected && (u.type === 'truck' || u.type === 'worker' || u.type === 'chinook'));
            if (clickedSupplyPoint && selectedHarvesters.length > 0) {
                selectedHarvesters.forEach(harvester => {
                    harvester.supplyTarget = clickedSupplyPoint;
                    harvester.aiState = 'MovingToDock';
                    harvester.taskState = 'Idle';
                    harvester.combatTarget = null;
                    harvester.targetPosition.copy(clickedSupplyPoint.position);
                });
                showNotification(`Harvester dispatched to gather supplies from field (${clickedSupplyPoint.stock} left).`, 'success');
                updateSidebar();
                return;
            }

            // 3. Open Ground Fallback (Runs if no enemy or supply was right-clicked)
            if (groundHit) {
                if (typeof spawnWaypointMarker === 'function') {
                    spawnWaypointMarker(groundHit, 'move');
                }
                // If destination point is in deep water without a bridge, redirect to nearest dry shore!
                const destOnBridge = mapBridges.some(b => isPointOnBridge(groundHit.x, groundHit.z, b));
                if (!destOnBridge && getTerrainHeight(groundHit.x, groundHit.z) < currentWaterLevel) {
                    for (let r = 2; r <= 32; r += 2) {
                        let shoreFound = false;
                        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
                            const sx = groundHit.x + Math.cos(a) * r;
                            const sz = groundHit.z + Math.sin(a) * r;
                            if (getTerrainHeight(sx, sz) >= currentWaterLevel || mapBridges.some(b => isPointOnBridge(sx, sz, b))) {
                                groundHit.x = sx;
                                groundHit.z = sz;
                                shoreFound = true;
                                break;
                            }
                        }
                        if (shoreFound) break;
                    }
                }

                const selectedList = units.filter(u => u.selected);
                if (selectedList.length === 1) {
                    const unit = selectedList[0];
                    // Alt + Right-Click: Append waypoint to sequential path queue (Official Generals rule)
                    if (e.altKey && unit.targetPosition && Math.hypot(unit.targetPosition.x - unit.mesh.position.x, unit.targetPosition.z - unit.mesh.position.z) > 2.0) {
                        if (!unit.waypoints) unit.waypoints = [];
                        unit.waypoints.push(groundHit.clone());
                        showNotification('Waypoint queued (' + (unit.waypoints.length) + ').', 'info');
                        return;
                    }
                    const bridges = !unit.isAir ? findBridgeCrossingsForPath(unit.mesh.position, groundHit) : null;
                    if (bridges && bridges.length > 0) {
                        unit.waypoints = [...bridges, groundHit.clone()];
                        unit.targetPosition.copy(unit.waypoints.shift());
                    } else {
                        unit.waypoints = [];
                        unit.targetPosition.copy(groundHit);
                    }
                    unit.combatTarget = null;
                    unit.taskState = 'Moving';
                    if (unit.isAir) {
                        unit.airState = (unit.airState === 'landed') ? 'taking_off' : 'flying';
                        unit.patrolCenter.copy(groundHit);
                    }
                    if (unit.targetStructure) {
                        if (unit.targetStructure.dozerRef === unit) unit.targetStructure.dozerRef = null;
                        if (unit.targetStructure.soleRepairer === unit) unit.targetStructure.soleRepairer = null;
                        unit.targetStructure = null;
                    }
                    if (unit.type === 'truck' || unit.type === 'worker') {
                        unit.aiState = 'Idle';
                    }
                } else if (selectedList.length > 1) {
                    if (typeof applyGroupFormationMove === 'function') {
                        applyGroupFormationMove(selectedList, groundHit);
                    }
                }

                if (isMultiplayerActive && netConn && netConn.open) {
                    broadcastNetPacket({
                        type: 'move_units',
                        unitNetIds: selectedList.map(u => u.netId).filter(Boolean),
                        targetPos: { x: groundHit.x, y: groundHit.y, z: groundHit.z }
                    });
                }

                updateSidebar();
            }
        }

        function evaluateClickSelection(e) {
            if (e.target && (e.target.closest('#generals-command-bar') || e.target.closest('#top-hud-bar') || e.target.closest('#cnc-sidebar') || e.target.closest('#hud') || e.target.closest('#start-menu') || e.target.closest('#tactical-tooltip') || e.target.closest('#builder-palette') || e.target.closest('#general-powers-bar'))) {
                return;
            }

            mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);

            // 1. Check Units (Direct Raycast)
            const unitMeshes = units.filter(u => !u.garrisonedIn && u.mesh).map(u => u.mesh);
            const unitHits = raycaster.intersectObjects(unitMeshes, true);
            if (unitHits.length > 0) {
                let hit = unitHits[0].object;
                while (hit.parent && hit.parent !== scene) hit = hit.parent;
                const unit = units.find(candidate => candidate.mesh === hit);
                if (unit && !unit.garrisonedIn) {
                    if (e.shiftKey) {
                        // Shift + Click: Add or remove from current selection (Official rule)
                        unit.selected = !unit.selected;
                        if (unit.selected) addSelectionCircle(unit);
                        else removeSelectionCircle(unit);
                    } else {
                        // Normal Click: Deselect previous and select this unit
                        units.forEach(u => { u.selected = false; removeSelectionCircle(u); });
                        selectedStructure = null;
                        selectedSupplyPoint = null;
                        unit.selected = true;
                        addSelectionCircle(unit);
                        if (typeof playUnitVoice === 'function') playUnitVoice(unit.type, 'select', unit.faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa'));
                    }
                    updateSidebar();
                    updateHUD();
                    return;
                }
            }

            // If not Shift-clicking a unit, clear unit selection for structure click or ground click
            if (!e.shiftKey) {
                units.forEach(u => { u.selected = false; removeSelectionCircle(u); });
                selectedStructure = null;
                selectedSupplyPoint = null;
            }

            // 1b. Proximity fallback: If ray misses small infantry polygons, pick closest unit near clicked ground position!
            const groundHit = getGroundIntersectPoint();
            if (groundHit) {
                let closestUnit = null;
                let closestDist = Infinity;
                for (let u of units) {
                    if (u.garrisonedIn || !u.mesh) continue;
                    const d = Math.hypot(groundHit.x - u.mesh.position.x, groundHit.z - u.mesh.position.z);
                    const pickRadius = u.isAir ? 7.5 : Math.max((u.radius || 1.2) * 2.2, 3.2);
                    if (d <= pickRadius && d < closestDist) {
                        closestDist = d;
                        closestUnit = u;
                    }
                }
                if (closestUnit) {
                    closestUnit.selected = true;
                    addSelectionCircle(closestUnit);
                    if (typeof playUnitVoice === 'function') playUnitVoice(closestUnit.type, 'select', closestUnit.faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa'));
                    activeSidebarTab = 'production';
                    updateSidebar();
                    updateHUD();
                    return;
                }
            }

            // 2. Check Structures (Player & Allied)
            const allStructures = [...structures, ...enemyStructures];
            const structureHits = raycaster.intersectObjects(allStructures.map(structure => structure.mesh).filter(Boolean), true);
            if (structureHits.length > 0) {
                let hit = structureHits[0].object;
                while (hit.parent && hit.parent !== scene) hit = hit.parent;
                const hitCandidate = allStructures.find(candidate => candidate.mesh === hit) || null;
                if (hitCandidate) {
                    if (isFriendly({ teamId: playerTeamId }, hitCandidate) && hitCandidate.ownerId !== 'player') {
                        selectedStructure = hitCandidate;
                        showNotification(`Allied ${hitCandidate.type.toUpperCase()}: Commanded by Ally (Interaction Restricted)`, 'info');
                        activeSidebarTab = 'production';
                        updateSidebar();
                        return;
                    }
                    if (structures.includes(hitCandidate)) {
                        selectedStructure = hitCandidate;
                        activeSidebarTab = 'production';
                        updateSidebar();
                        return;
                    }
                }
            }

            // 3. Check Supply Depots / Field crystals (Selectable per user request!)
            const supplyMeshes = supplyPoints.map(p => p.mesh).filter(Boolean);
            const supplyHits = raycaster.intersectObjects(supplyMeshes, true);
            if (supplyHits.length > 0) {
                let hit = supplyHits[0].object;
                while (hit.parent && hit.parent !== scene) hit = hit.parent;
                selectedSupplyPoint = supplyPoints.find(p => p.mesh === hit || (p.mesh && p.mesh.children && p.mesh.children.includes(hit))) || null;
                if (!selectedSupplyPoint && supplyHits[0].point) {
                    selectedSupplyPoint = findNearestSupplyPoint(supplyHits[0].point);
                }
                if (selectedSupplyPoint) {
                    activeSidebarTab = 'production';
                    updateSidebar();
                    return;
                }
            }

            // Proximity hit: clicking near a supply depot on ground
            if (groundHit) {
                for (const sp of supplyPoints) {
                    if (Math.hypot(groundHit.x - sp.position.x, groundHit.z - sp.position.z) < 14.0) {
                        selectedSupplyPoint = sp;
                        activeSidebarTab = 'production';
                        updateSidebar();
                        updateHUD();
                        return;
                    }
                }
            }

            updateSidebar();
            updateHUD();
        }





        function evaluateBoxSelection(box) {
            let countSelected = 0;
            const bLeft = Math.min(box.left, box.right);
            const bRight = Math.max(box.left, box.right);
            const bTop = Math.min(box.top, box.bottom);
            const bBottom = Math.max(box.top, box.bottom);

            units.forEach(unit => {
                if (unit.garrisonedIn || !unit.mesh) {
                    unit.selected = false;
                    removeSelectionCircle(unit);
                    return;
                }

                // Get unit position projected into screen coordinates
                const wp = new THREE.Vector3();
                unit.mesh.getWorldPosition(wp);
                wp.project(camera);

                // If behind camera view plane, do not select
                if (wp.z > 1.0) {
                    unit.selected = false;
                    removeSelectionCircle(unit);
                    return;
                }

                const sX = (wp.x * 0.5 + 0.5) * window.innerWidth;
                const sY = (-(wp.y * 0.5) + 0.5) * window.innerHeight;

                // Generous margin so touching any part of the unit's model selects it
                const margin = Math.max(12, (unit.radius || 1.2) * 10);

                if (sX >= (bLeft - margin) && sX <= (bRight + margin) &&
                    sY >= (bTop - margin) && sY <= (bBottom + margin)) {
                    unit.selected = true;
                    addSelectionCircle(unit);
                    countSelected++;
                } else {
                    unit.selected = false;
                    removeSelectionCircle(unit);
                }
            });

            if (countSelected > 0) {
                selectedStructure = null;
                selectedSupplyPoint = null;
                activeSidebarTab = 'production';
            }
            updateHUD();
            updateSidebar();
        }

        // Advanced Turret System: Locks onto active combat targets or sweeps in natural idle radar scans
        // PERF: iterates the four lists directly (no per-frame array spread) and reuses one scratch vector
        const _turretScratch = new THREE.Vector3();
        function updateTurretSystems() {
            const lists = [units, enemyUnits, structures, enemyStructures];
            for (let li = 0; li < lists.length; li++) {
                const list = lists[li];
                for (let ui = 0; ui < list.length; ui++) updateTurretFor(list[ui]);
            }
        }
        function updateTurretFor(unit) {
                if (!unit.mesh) return;
                const turret = getCachedNode(unit.mesh, "turretSystem");
                if (!turret) return;

                // 1. If actively engaged in combat, lock directly onto combat target!
                if (unit.combatTarget && unit.combatTarget.health > 0) {
                    const tPos = unit.combatTarget.position || (unit.combatTarget.mesh ? unit.combatTarget.mesh.position : null);
                    if (tPos) {
                        const localTarget = turret.parent.worldToLocal(_turretScratch.copy(tPos));
                        const desiredAngle = Math.atan2(localTarget.x, localTarget.z);
                        let diff = desiredAngle - turret.rotation.y;
                        while (diff < -Math.PI) diff += Math.PI * 2;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        turret.rotation.y += diff * 0.16; // Smooth swift tracking
                        return;
                    }
                }

                // 2. Out of combat: gentle, slow, randomized observation sweeps
                if (!unit._idleTurretTimer || unit._idleTurretTimer <= 0) {
                    unit._idleTurretTimer = 100 + Math.floor(Math.random() * 180); // Sweeps every 2-5 seconds
                    // 65% chance forward (0 rad), 35% chance to sweep left or right
                    unit._idleTurretAngle = Math.random() < 0.65 ? 0 : (Math.random() - 0.5) * 1.3;
                }
                unit._idleTurretTimer--;
                let diff = (unit._idleTurretAngle || 0) - turret.rotation.y;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                turret.rotation.y += diff * 0.035; // Gentle, authentic military traverse
        }

        // PERF: health bars no longer rebuild 4 arrays + a Set per frame, no O(S) includes() per asset,
        // no Vector3 allocation per bar, and DOM styles are only written when their value changes.
        // Positioning uses transform (compositor-only) instead of left/top (layout).
        const _hbScratch = new THREE.Vector3();
        let _hbFrame = 0;
        let _hbContainer = null;
        function updateHealthBars() {
            _hbFrame++;
            if (!_hbContainer) _hbContainer = document.getElementById('health-bars');
            const w = window.innerWidth, h = window.innerHeight;
            const lists = [units, enemyUnits, structures, enemyStructures];
            for (let li = 0; li < lists.length; li++) {
                const list = lists[li];
                const isStructure = li >= 2;
                for (let ai = 0; ai < list.length; ai++) {
                    const asset = list[ai];
                    if (!(asset.health < asset.maxHealth && asset.health > 0 && !asset.garrisonedIn)) continue;

                    let bar = healthBarElements.get(asset);
                    if (!bar) {
                        const container = document.createElement('div');
                        container.className = 'health-bar-container';
                        container.style.left = '0px';
                        container.style.top = '0px';
                        const fill = document.createElement('div');
                        fill.className = 'health-bar-fill';
                        container.appendChild(fill);
                        if (_hbContainer) _hbContainer.appendChild(container);
                        bar = { container, fill, shown: null, tf: '', pct: -1, color: '' };
                        healthBarElements.set(asset, bar);
                    }
                    bar.seen = _hbFrame;

                    const position = _hbScratch.copy((asset.mesh || asset).position);
                    position.y += isStructure ? 7 : 3.5;
                    position.project(camera);
                    const onScreen = position.z >= -1 && position.z <= 1 &&
                        Math.abs(position.x) <= 1.1 && Math.abs(position.y) <= 1.1;
                    if (bar.shown !== onScreen) {
                        bar.container.style.display = onScreen ? 'block' : 'none';
                        bar.shown = onScreen;
                    }
                    if (!onScreen) continue;

                    const px = Math.round((position.x * 0.5 + 0.5) * w);
                    const py = Math.round((-position.y * 0.5 + 0.5) * h);
                    const tf = `translate(${px}px, ${py}px) translate(-50%, -50%)`;
                    if (bar.tf !== tf) { bar.container.style.transform = tf; bar.tf = tf; }

                    const healthRatio = Math.max(0, Math.min(1, asset.health / asset.maxHealth));
                    const pct = Math.round(healthRatio * 100);
                    if (bar.pct !== pct) { bar.fill.style.width = pct + '%'; bar.pct = pct; }
                    const color = healthRatio < 0.3 ? '#ff4757' : healthRatio < 0.6 ? '#ffd166' : '#42e66b';
                    if (bar.color !== color) { bar.fill.style.backgroundColor = color; bar.color = color; }
                }
            }

            // Remove bars for assets that are healed, dead, garrisoned or gone
            healthBarElements.forEach((bar, asset) => {
                if (bar.seen !== _hbFrame) {
                    bar.container.remove();
                    healthBarElements.delete(asset);
                }
            });
        }

        function assignBuildersToConstruction() {
            const builders = units.filter(unit =>
                (unit.type === 'dozer' || unit.type === 'worker') && unit.health > 0
            );

            // 1. Maintain assigned construction & repair builders
            structures.forEach(structure => {
                const builder = structure.dozerRef;
                if (structure.isBuilding && builder) {
                    if (!builders.includes(builder) || builder.health <= 0) {
                        structure.dozerRef = null;
                    } else if (builder.targetStructure !== structure) {
                        if (builder.taskState === 'Idle' || !builder.targetStructure) {
                            assignDozerToStructure(builder, structure);
                        } else {
                            structure.dozerRef = null;
                        }
                    } else if (builder.taskState !== 'MovingToBuild' && builder.taskState !== 'Building') {
                        assignDozerToStructure(builder, structure);
                    }
                }
                if (structure.soleRepairer) {
                    const rep = structure.soleRepairer;
                    if (rep.health <= 0 || rep.targetStructure !== structure ||
                        (rep.taskState !== 'MovingToRepair' && rep.taskState !== 'Repairing') ||
                        structure.health >= structure.maxHealth) {
                        structure.soleRepairer = null;
                    }
                }
            });

            // 2. Dispatch available idle builders to unfinished structures waiting for construction
            const availableBuilders = builders.filter(builder =>
                (!builder.aiState || builder.aiState === 'Idle') &&
                ((builder.taskState === 'Idle' && !builder.targetStructure) ||
                 (builder.targetStructure && !builder.targetStructure.isBuilding && builder.taskState !== 'MovingToRepair' && builder.taskState !== 'Repairing'))
            );
            const waitingStructures = structures.filter(structure =>
                structure.isBuilding && !structure.dozerRef && structure.health > 0
            );

            waitingStructures.forEach(structure => {
                let nearestBuilder = null;
                let nearestDistance = Infinity;
                availableBuilders.forEach(builder => {
                    const distance = builder.mesh.position.distanceTo(structure.position);
                    if (distance < nearestDistance) {
                        nearestDistance = distance;
                        nearestBuilder = builder;
                    }
                });

                if (nearestBuilder) {
                    assignDozerToStructure(nearestBuilder, structure);
                    availableBuilders.splice(availableBuilders.indexOf(nearestBuilder), 1);
                }
            });

            // 3. Zero Hour DozerAIUpdate Boredom Auto-Repair (DozerAIUpdate.cpp: boredTime / boredRange)
            // Idle Dozers/Workers automatically scan within boredRange for damaged friendly structures to repair.
            availableBuilders.forEach(builder => {
                builder._boredTimer = (builder._boredTimer || 0) + 1;
                if (builder._boredTimer < 45) return; // Wait ~0.75s idle before seeking repair tasks
                const boredRange = 75.0;
                let nearestDamaged = null;
                let minDist = boredRange;
                structures.forEach(s => {
                    if (!s || s.isBuilding || s.health <= 0 || s.health >= s.maxHealth || s.soleRepairer) return;
                    const d = builder.mesh.position.distanceTo(s.position);
                    if (d < minDist) {
                        minDist = d;
                        nearestDamaged = s;
                    }
                });
                if (nearestDamaged) {
                    assignDozerToRepair(builder, nearestDamaged);
                }
            });

            // 4. AI Dozers/Workers Auto-Build Unfinished Foundations & Auto-Repair with AIDozerBoredRadiusModifier
            if (typeof enemyUnits !== 'undefined' && typeof enemyStructures !== 'undefined') {
                const aiBuilders = enemyUnits.filter(u =>
                    (u.type === 'dozer' || (u.type === 'worker' && (!u.aiState || u.aiState === 'Idle'))) && u.health > 0
                );
                aiBuilders.forEach(aiBuilder => {
                    if (aiBuilder.taskState === 'Building' || aiBuilder.taskState === 'MovingToBuild' || aiBuilder.taskState === 'Repairing' || aiBuilder.taskState === 'MovingToRepair') return;
                    // First priority: finish any unfinished AI structure foundation owned by this AI
                    const unfinished = enemyStructures.find(es =>
                        es && es.ownerId === aiBuilder.ownerId && es.isBuilding && es.health > 0 && (!es.dozerRef || es.dozerRef.health <= 0)
                    );
                    if (unfinished) {
                        assignDozerToStructure(aiBuilder, unfinished);
                        return;
                    }
                    aiBuilder._boredTimer = (aiBuilder._boredTimer || 0) + 1;
                    if (aiBuilder._boredTimer < 30) return;
                    const aiBoredRange = 75.0 * (ZERO_HOUR_AI_DATA.aiDozerBoredRadiusModifier || 2.0);
                    let bestDamaged = null;
                    let minDist = aiBoredRange;
                    enemyStructures.forEach(es => {
                        if (!es || es.ownerId !== aiBuilder.ownerId || es.isBuilding || es.health <= 0 || es.health >= es.maxHealth || es.soleRepairer) return;
                        const d = aiBuilder.mesh.position.distanceTo(es.position);
                        if (d < minDist) {
                            minDist = d;
                            bestDamaged = es;
                        }
                    });
                    if (bestDamaged) {
                        assignDozerToRepair(aiBuilder, bestDamaged);
                    }
                });
            }
        }

        let combatDeltaScale = 1.0;
        