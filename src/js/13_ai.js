
let isPlacingBlueprint = false;
let blueprintPlacementPos = null;
let isRightDragging = false;
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
    maxStrikeTeamSize: { easy: 5, medium: 8, hard: 11 }
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

function isTerrainCliffAt(wx, wz, hCenter) {
    if (typeof getTerrainHeight !== 'function') return false;
    const h = (hCenter !== undefined) ? hCenter : getTerrainHeight(wx, wz);
    const rawMapKey = (typeof currentMapType !== 'undefined') ? currentMapType : '';
    const mapKey = (rawMapKey === 'desert') ? 'tournament_desert' : rawMapKey;
    const offMap = (typeof window !== 'undefined' && window.OFFICIAL_SKIRMISH_MAPS) ? window.OFFICIAL_SKIRMISH_MAPS[mapKey] : null;
    if (offMap && offMap.grid && offMap.grid.length > 1) {
        // Scale-independent native grid cliff check so sheer ledges remain impassable at 900, 1500, 2200, and 3000 map sizes
        const sz = (typeof currentMapSize !== 'undefined' && currentMapSize > 0) ? currentMapSize : 1500;
        const step = sz / (offMap.grid.length - 1);
        const vScale = (typeof getOfficialMapVerticalScale === 'function') ? getOfficialMapVerticalScale(sz) : 1.0;
        const cliffThresh = 3.8 * vScale;
        const hXp = getTerrainHeight(wx + step, wz);
        const hXm = getTerrainHeight(wx - step, wz);
        const hZp = getTerrainHeight(wx, wz + step);
        const hZm = getTerrainHeight(wx, wz - step);
        return (Math.abs(hXp - h) > cliffThresh || Math.abs(hXm - h) > cliffThresh || Math.abs(hZp - h) > cliffThresh || Math.abs(hZm - h) > cliffThresh);
    }
    const d = 2.5;
    const hXp = getTerrainHeight(wx + d, wz);
    const hXm = getTerrainHeight(wx - d, wz);
    const hZp = getTerrainHeight(wx, wz + d);
    const hZm = getTerrainHeight(wx, wz - d);
    return (Math.abs(hXp - h) / d > 0.75 || Math.abs(hXm - h) / d > 0.75 || Math.abs(hZp - h) / d > 0.75 || Math.abs(hZm - h) / d > 0.75);
}
window.isTerrainCliffAt = isTerrainCliffAt;

function classifyPathfindPosition(wx, wz, ignoreStruct = null, extraClearance = 0.6) {
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

    // Check scale-independent slope/cliff passability
    if (isTerrainCliffAt(wx, wz, h)) {
        return PATHFIND_CELL_TYPES.CLIFF;
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

    // Check map obstacles (skip nonBlocking bushes and crushable trees/palms so tanks & AI path cleanly through foliage)
    if (typeof mapObstacles !== 'undefined' && mapObstacles) {
        for (let i = 0; i < mapObstacles.length; i++) {
            const obs = mapObstacles[i];
            if (!obs || !obs.position || obs.nonBlocking || obs.crushable || obs.toppled) continue;
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
    const halfExtent = mapSize * 0.5;
    // Keep navigation coverage aligned with the actual map, with roughly 10 world units per cell.
    const gridDim = Math.min(300, Math.max(100, Math.ceil(mapSize / 10)));
    const cellSize = (halfExtent * 2) / gridDim;
    const totalCells = gridDim * gridDim;
    if (!_pathfindGridState.cells || _pathfindGridState.cells.length !== totalCells) {
        _pathfindGridState.cells = new Uint8Array(totalCells);
    }
    _pathfindGridState.gridDim = gridDim;
    _pathfindGridState.cellSize = cellSize;
    _pathfindGridState.halfExtent = halfExtent;

    const cells = _pathfindGridState.cells;
    const hasBridges = (typeof mapBridges !== 'undefined' && mapBridges && mapBridges.length > 0 && typeof isPointOnBridge === 'function');
    const waterLvl = (typeof currentWaterLevel !== 'undefined') ? currentWaterLevel : -10;
    const hasHeight = (typeof getTerrainHeight === 'function');
    const mapKey = (typeof currentMapType !== 'undefined' ? currentMapType : '') + ':' + mapSize + ':' + waterLvl + ':' + (hasBridges ? mapBridges.length : 0);

    // 1. Base terrain/water/cliff/bridge layer (cached per map+size so building changes skip 22,500+ terrain checks)
    if (!_pathfindGridState._baseCells || _pathfindGridState._baseKey !== mapKey || _pathfindGridState._baseCells.length !== totalCells) {
        const base = new Uint8Array(totalCells);
        const d = 2.5;
        for (let gz = 0; gz < gridDim; gz++) {
            const wz = -halfExtent + (gz + 0.5) * cellSize;
            const rowOff = gz * gridDim;
            for (let gx = 0; gx < gridDim; gx++) {
                const wx = -halfExtent + (gx + 0.5) * cellSize;
                let cellType = PATHFIND_CELL_TYPES.CLEAR;
                let onBridge = false;
                if (hasBridges) {
                    for (let bi = 0; bi < mapBridges.length; bi++) {
                        if (isPointOnBridge(wx, wz, mapBridges[bi])) { onBridge = true; break; }
                    }
                }
                if (onBridge) {
                    cellType = PATHFIND_CELL_TYPES.BRIDGE;
                } else if (hasHeight) {
                    const h = getTerrainHeight(wx, wz);
                    if (h < waterLvl + 0.15) {
                        cellType = PATHFIND_CELL_TYPES.WATER;
                    } else if (isTerrainCliffAt(wx, wz, h)) {
                        cellType = PATHFIND_CELL_TYPES.CLIFF;
                    }
                }
                base[rowOff + gx] = cellType;
            }
        }
        _pathfindGridState._baseCells = base;
        _pathfindGridState._baseKey = mapKey;
    }
    cells.set(_pathfindGridState._baseCells);

    // 2. Stamp structures & mapObstacles only across their bounding boxes (O(K) instead of O(N*K))
    const stampCircle = (cx, cz, r) => {
        const minX = Math.max(0, Math.floor((cx - r + halfExtent) / cellSize));
        const maxX = Math.min(gridDim - 1, Math.floor((cx + r + halfExtent) / cellSize));
        const minZ = Math.max(0, Math.floor((cz - r + halfExtent) / cellSize));
        const maxZ = Math.min(gridDim - 1, Math.floor((cz + r + halfExtent) / cellSize));
        const r2 = r * r;
        for (let gz = minZ; gz <= maxZ; gz++) {
            const wz = -halfExtent + (gz + 0.5) * cellSize;
            const dz = wz - cz;
            const rowOff = gz * gridDim;
            for (let gx = minX; gx <= maxX; gx++) {
                if (cells[rowOff + gx] === PATHFIND_CELL_TYPES.OBSTACLE) continue;
                const wx = -halfExtent + (gx + 0.5) * cellSize;
                const dx = wx - cx;
                if (dx * dx + dz * dz < r2) {
                    cells[rowOff + gx] = PATHFIND_CELL_TYPES.OBSTACLE;
                }
            }
        }
    };
    const stampStructList = (list) => {
        if (!list) return;
        for (let i = 0; i < list.length; i++) {
            const s = list[i];
            if (!s || s.health <= 0) continue;
            const sp = s.position || (s.mesh && s.mesh.position);
            if (!sp) continue;
            stampCircle(sp.x, sp.z, (s.radius || 6.0) + 1.5);
        }
    };
    if (typeof structures !== 'undefined') stampStructList(structures);
    if (typeof enemyStructures !== 'undefined') stampStructList(enemyStructures);
    if (typeof mapObstacles !== 'undefined' && mapObstacles) {
        for (let i = 0; i < mapObstacles.length; i++) {
            const obs = mapObstacles[i];
            if (!obs || !obs.position || obs.nonBlocking || obs.crushable || obs.toppled) continue;
            stampCircle(obs.position.x, obs.position.z, (obs.radius || 2.5) + 1.2);
        }
    }

    _pathfindGridState.dirty = false;
    _pathfindGridState.lastStructCount = (typeof structures !== 'undefined' && structures) ? structures.length : 0;
    _pathfindGridState.lastEnemyStructCount = (typeof enemyStructures !== 'undefined' && enemyStructures) ? enemyStructures.length : 0;
}
window.rebuildPathfindGrid = rebuildPathfindGrid;

// Incremental O(footprint) update when a single structure is placed or destroyed (avoids full grid rebuild)
function stampStructureOnPathfindGrid(struct, isBlocked = true) {
    if (!struct || !_pathfindGridState.cells || !_pathfindGridState._baseCells) {
        _pathfindGridState.dirty = true;
        return;
    }
    const sp = struct.position || (struct.mesh && struct.mesh.position);
    if (!sp) return;
    const { cells, _baseCells, gridDim, cellSize, halfExtent } = _pathfindGridState;
    const r = (struct.radius || 6.0) + 1.5;
    const minX = Math.max(0, Math.floor((sp.x - r + halfExtent) / cellSize));
    const maxX = Math.min(gridDim - 1, Math.floor((sp.x + r + halfExtent) / cellSize));
    const minZ = Math.max(0, Math.floor((sp.z - r + halfExtent) / cellSize));
    const maxZ = Math.min(gridDim - 1, Math.floor((sp.z + r + halfExtent) / cellSize));
    const r2 = r * r;
    for (let gz = minZ; gz <= maxZ; gz++) {
        const wz = -halfExtent + (gz + 0.5) * cellSize;
        const dz = wz - sp.z;
        const rowOff = gz * gridDim;
        for (let gx = minX; gx <= maxX; gx++) {
            const wx = -halfExtent + (gx + 0.5) * cellSize;
            const dx = wx - sp.x;
            if (dx * dx + dz * dz < r2) {
                cells[rowOff + gx] = isBlocked ? PATHFIND_CELL_TYPES.OBSTACLE : _baseCells[rowOff + gx];
            }
        }
    }
    _pathfindGridState.lastStructCount = (typeof structures !== 'undefined' && structures) ? structures.length : 0;
    _pathfindGridState.lastEnemyStructCount = (typeof enemyStructures !== 'undefined' && enemyStructures) ? enemyStructures.length : 0;
}
window.stampStructureOnPathfindGrid = stampStructureOnPathfindGrid;

// Per-frame A* pathfinding budget queue (prevents frame spikes when 40+ units receive group move/attack orders)
const _pathfindBudgetQueue = [];
const _pathfindBudgetSet = new Map();
const MAX_ASTAR_PER_FRAME = 6;

function enqueueNavigationPath(unit, goalPos, options = {}) {
    if (!unit || !unit.mesh || !goalPos) return;
    if (unit.isAir) {
        unit.waypoints = [];
        if (unit.targetPosition && typeof unit.targetPosition.copy === 'function') {
            unit.targetPosition.copy(goalPos);
        }
        return;
    }
    const ignoreStruct = options && options.ignoreStruct ? options.ignoreStruct : null;
    // Fast path: if the direct segment is verified clear, move immediately with zero queue latency
    if (typeof isPathfindSegmentClear === 'function' && isPathfindSegmentClear(unit.mesh.position, goalPos, ignoreStruct, 1.4)) {
        unit.waypoints = [];
        if (unit.targetPosition && typeof unit.targetPosition.copy === 'function') {
            unit.targetPosition.copy(goalPos);
        }
        if (_pathfindBudgetSet.has(unit)) {
            const stale = _pathfindBudgetSet.get(unit);
            _pathfindBudgetSet.delete(unit);
            const qIdx = _pathfindBudgetQueue.indexOf(stale);
            if (qIdx !== -1) _pathfindBudgetQueue.splice(qIdx, 1);
        }
        return;
    }
    // Blocked direct segment: retain safe position until A* computes obstacle-avoiding waypoints
    const existing = _pathfindBudgetSet.get(unit);
    if (existing) {
        existing.goalPos = goalPos.clone();
        existing.options = options;
        return;
    }
    const job = { unit, goalPos: goalPos.clone(), options };
    _pathfindBudgetSet.set(unit, job);
    _pathfindBudgetQueue.push(job);
}
window.enqueueNavigationPath = enqueueNavigationPath;

function processPathfindBudgetQueue(maxSolves = MAX_ASTAR_PER_FRAME) {
    let solved = 0;
    while (solved < maxSolves && _pathfindBudgetQueue.length > 0) {
        const job = _pathfindBudgetQueue.shift();
        _pathfindBudgetSet.delete(job.unit);
        const u = job.unit;
        if (!u || u.health <= 0 || !u.mesh || u.garrisonedIn || u.isAir) continue;
        const path = (typeof findNavigationPath === 'function')
            ? findNavigationPath(u.mesh.position, job.goalPos, job.options || {})
            : null;
        const cleanPath = Array.isArray(path) ? path.filter(Boolean) : [];
        if (cleanPath.length > 0) {
            u._pathBlockedAt = 0;
            u.targetPosition.copy(cleanPath[0]);
            u.waypoints = cleanPath.slice(1);
        } else {
            // Issue #75: Never convert a failed/unreachable A* search into a direct move through obstacles
            u.waypoints = [];
            if (u.targetPosition && typeof u.targetPosition.copy === 'function') {
                u.targetPosition.copy(u.mesh.position);
            }
            u._pathBlockedAt = (typeof buildingTick !== 'undefined' && buildingTick > 0) ? buildingTick : Date.now();
        }
        solved++;
    }
    return solved;
}
window.processPathfindBudgetQueue = processPathfindBudgetQueue;

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
    const cell = classifyPathfindPosition(destPos.x, destPos.z, ignoreStruct, 1.5);
    if (isCellPassableOnGround(cell)) return destPos.clone();

    for (let r = 3.0; r <= 36.0; r += 3.0) {
        for (let step = 0; step < 12; step++) {
            const angle = (step / 12) * Math.PI * 2;
            const tx = destPos.x + Math.cos(angle) * r;
            const tz = destPos.z + Math.sin(angle) * r;
            if (isCellPassableOnGround(classifyPathfindPosition(tx, tz, ignoreStruct, 1.5))) {
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
    const safeGoal = adjustToPossibleDestination(endPos, ignoreStruct);

    // Fast path: if direct line-of-sight to safeGoal is clear, no intermediate waypoints needed
    if (isPathfindSegmentClear(startPos, safeGoal, ignoreStruct, 1.4)) {
        return [safeGoal.clone()];
    }

    // Bridge-aware macro shortcut: if direct line crosses a river and bridges exist, route cleanly via bridge entry/exit ramps
    const hasBridges = typeof mapBridges !== 'undefined' && mapBridges && mapBridges.length > 0;
    if (hasBridges && typeof currentWaterLevel !== 'undefined' && currentWaterLevel > -100 && typeof getTerrainHeight === 'function') {
        const segDist = Math.hypot(safeGoal.x - startPos.x, safeGoal.z - startPos.z);
        const samples = Math.max(16, Math.min(120, Math.ceil(segDist / 8.0)));
        let hitsWater = false;
        for (let i = 1; i < samples; i++) {
            const t = i / samples;
            const px = startPos.x + (safeGoal.x - startPos.x) * t;
            const pz = startPos.z + (safeGoal.z - startPos.z) * t;
            if (getTerrainHeight(px, pz) < currentWaterLevel + 0.15 && !mapBridges.some(b => isPointOnBridge(px, pz, b))) {
                hitsWater = true;
                break;
            }
        }
        if (hitsWater) {
            let bestB = null, bestD = Infinity;
            for (let bi = 0; bi < mapBridges.length; bi++) {
                const b = mapBridges[bi];
                const d = Math.hypot(startPos.x - b.position.x, startPos.z - b.position.z) + Math.hypot(safeGoal.x - b.position.x, safeGoal.z - b.position.z);
                if (d < bestD) { bestD = d; bestB = b; }
            }
            if (bestB) {
                const fwdX = Math.sin(bestB.rotationY);
                const fwdZ = Math.cos(bestB.rotationY);
                const halfLen = bestB.length * 0.44;
                const r1 = new THREE.Vector3(bestB.position.x - fwdX * halfLen, bestB.deckY, bestB.position.z - fwdX * 0 - fwdZ * halfLen);
                const r2 = new THREE.Vector3(bestB.position.x + fwdX * halfLen, bestB.deckY, bestB.position.z + fwdZ * halfLen);
                const d1 = Math.hypot(startPos.x - r1.x, startPos.z - r1.z);
                const d2 = Math.hypot(startPos.x - r2.x, startPos.z - r2.z);
                const entry = d1 <= d2 ? r1 : r2;
                const exit = d1 <= d2 ? r2 : r1;
                return [entry, exit, safeGoal.clone()];
            }
        }
    }

    const sCount = (typeof structures !== 'undefined' && structures) ? structures.length : 0;
    const esCount = (typeof enemyStructures !== 'undefined' && enemyStructures) ? enemyStructures.length : 0;
    if (_pathfindGridState.dirty || sCount !== _pathfindGridState.lastStructCount || esCount !== _pathfindGridState.lastEnemyStructCount || !_pathfindGridState.cells) {
        rebuildPathfindGrid();
    }

    const { gridDim, cellSize, halfExtent, cells } = _pathfindGridState;
    const toGrid = (wVal) => Math.max(0, Math.min(gridDim - 1, Math.floor((wVal + halfExtent) / cellSize)));
    const toWorld = (gIdx) => -halfExtent + (gIdx + 0.5) * cellSize;

    const sx = toGrid(startPos.x);
    const sz = toGrid(startPos.z);
    const gx = toGrid(safeGoal.x);
    const gz = toGrid(safeGoal.z);

    if (sx === gx && sz === gz) {
        return [safeGoal.clone()];
    }

    const totalCells = gridDim * gridDim;
    if (!_pathfindGridState._gScore || _pathfindGridState._gScore.length !== totalCells) {
        _pathfindGridState._gScore = new Float32Array(totalCells);
        _pathfindGridState._parent = new Int32Array(totalCells);
        _pathfindGridState._closed = new Uint8Array(totalCells);
    }
    const gScore = _pathfindGridState._gScore;
    const parent = _pathfindGridState._parent;
    const closed = _pathfindGridState._closed;
    gScore.fill(Infinity);
    parent.fill(-1);
    closed.fill(0);

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
    const maxIterations = Math.min(totalCells, Math.max(2400, Math.floor(totalCells * 0.35)));

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

    // An incomplete search must not be turned into an unsafe straight-line route to the goal.
    if (!found) return [];
    const traceTarget = goalIdx;
    if (traceTarget === startIdx) {
        return [safeGoal.clone()];
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
    rawPoints[rawPoints.length - 1] = safeGoal.clone();

    const smoothed = optimizeGroundPath(rawPoints, ignoreStruct);
    // Drop the starting point so returned array contains strictly forward waypoints ending at safeGoal
    return smoothed.length > 1 ? smoothed.slice(1) : [safeGoal.clone()];
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
        dockObj._dockSlotRefs = [null, null, null, null];
    }
    const unitId = (harvester && (harvester.netId || harvester._dockUnitId)) ||
    (harvester ? (harvester._dockUnitId = 'harv_' + Math.floor(simRandom() * 1000000)) : 'harv_0');

    let slotIdx = dockObj._dockSlots.indexOf(unitId);
    if (slotIdx === -1) {
        // Reclaim empty or dead-harvester slots first so destroyed harvesters never permanently block bays
        for (let i = 0; i < dockObj._dockSlots.length; i++) {
            const ref = dockObj._dockSlotRefs && dockObj._dockSlotRefs[i];
            const isDead = Boolean(ref && typeof ref.health === 'number' && ref.health <= 0);
            if (!dockObj._dockSlots[i] || isDead) {
                slotIdx = i;
                dockObj._dockSlots[i] = unitId;
                if (dockObj._dockSlotRefs) dockObj._dockSlotRefs[i] = harvester || null;
                break;
            }
        }
        if (slotIdx === -1) {
            slotIdx = Math.abs(unitId.charCodeAt(unitId.length - 1) || 0) % 4;
            dockObj._dockSlots[slotIdx] = unitId;
            if (dockObj._dockSlotRefs) dockObj._dockSlotRefs[slotIdx] = harvester || null;
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
                        if (dist < 0.05) angle = simRandom() * Math.PI * 2;
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
    const mapType = (typeof currentMapType !== 'undefined' && currentMapType)
    ? currentMapType
    : (typeof activeTheme !== 'undefined' ? activeTheme : 'desert');
    const customMap = (typeof activeCustomMap !== 'undefined') ? activeCustomMap : null;
    const allSpawns = (typeof getSpawnPointsForMap === 'function') ? getSpawnPointsForMap(mapSize, mapType, customMap) : [];
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
            const deployedCC = (typeof enemyStructures !== 'undefined')
            ? enemyStructures.find(es => es.ownerId === ownerId && es.type === 'center') || enemyStructures.find(es => es.ownerId === ownerId)
            : null;
            const mySpawn = allSpawns.find(sp => sp.id === slot.spawnId);
            const myBasePos = deployedCC && deployedCC.position
            ? deployedCC.position.clone()
            : (mySpawn ? new THREE.Vector3(mySpawn.x, 0, mySpawn.z) : new THREE.Vector3(20, 0, -20));
            const actualFaction = (deployedCC && deployedCC.faction)
            ? deployedCC.faction
            : (slot.faction === 'random' ? 'china' : slot.faction);
            const actualColorHex = (typeof window !== 'undefined' && window.aiColorMap && window.aiColorMap[ownerId])
            ? window.aiColorMap[ownerId]
            : ((typeof getPlayerColorHex === 'function' && slot.color) ? getPlayerColorHex(slot.color) : 0xdc2626);
            createCommanderState(ownerId, slot.team, actualFaction, myBasePos, slot.difficulty || 'medium', slot.spawnId, actualColorHex, slot.general || null);
    });

    function createCommanderState(ownerId, teamId, faction, basePos, difficulty = 'medium', spawnId = 0, colorHex = 0xdc2626, generalId = null) {
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
            const j = Math.floor(simRandom() * (i + 1));
            const tmp = candidateWaypoints[i]; candidateWaypoints[i] = candidateWaypoints[j]; candidateWaypoints[j] = tmp;
        }

        const startMoneyEl = typeof document !== 'undefined' ? document.getElementById('starting-money') : null;
        const lobbyMoney = startMoneyEl ? parseInt(startMoneyEl.value, 10) : 10000;
        const startCredits = (!isNaN(lobbyMoney) && lobbyMoney > 0) ? lobbyMoney : (difficulty === 'hard' ? 12000 : difficulty === 'easy' ? 7500 : 10000);
        // Place rally point 48 units in front of basePos toward map center (outside base buildings so units never jam inside base!)
        const toCenter = new THREE.Vector3(-basePos.x, 0, -basePos.z);
        if (toCenter.lengthSq() < 1) toCenter.set(1, 0, 1);
        toCenter.normalize();
        const rawRally = basePos.clone().addScaledVector(toCenter, 48);
        const rallyPos = (typeof adjustToPossibleDestination === 'function')
            ? adjustToPossibleDestination(rawRally, null)
            : rawRally;
        rallyPos.y = typeof getTerrainHeight === 'function' ? getTerrainHeight(rallyPos.x, rallyPos.z) : (basePos.y || 0);

        aiCommanders[ownerId] = {
            ownerId: ownerId,
            teamId: teamId,
            faction: faction,
            generalId: generalId,
            colorHex: colorHex,
            difficulty: difficulty,
            basePos: basePos.clone(),
            rallyPoint: rallyPos,
            candidateEnemySpawns: candidateWaypoints.map(wp => wp.clone()),

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
const AI_AA_CAPABLE_TYPES = new Set(['gatling', 'gatlingTank', 'gatlingCannon', 'quad', 'patriot', 'stingerSite', 'avenger', 'rocket', 'missiledefender', 'tankhunter', 'rpg', 'raptor', 'mig', 'comanche', 'humvee']);
function scoreAITargetPriority(attacker, target, cmd = null) {
    if (!attacker || !target || target.health <= 0) return -Infinity;
    if (typeof canUnitTarget === 'function' ? (!canUnitTarget(attacker, target) && !(attacker.type === 'overlord' && attacker.overlordUpgrade === 'gatling')) : (target.isAir && !AI_AA_CAPABLE_TYPES.has(attacker.type) && !(attacker.type === 'overlord' && attacker.overlordUpgrade === 'gatling'))) {
        return -Infinity;
    }
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

// Choose optimal unit type based on faction, facility, enemy threat profile, and current wave role diversity
function chooseAICounterUnitType(cmd, facilityType, existingUnits = []) {
    const f = cmd.faction || 'usa';
    const diff = cmd.difficulty || 'medium';
    const counter = (cmd.threatProfile && cmd.threatProfile.preferredCounter) || 'balanced';
    const hasTier3 = typeof enemyStructures !== 'undefined' && enemyStructures.some(
        s => s.ownerId === cmd.ownerId && !s.isBuilding && s.health > 0 &&
        (s.type === 'propagandaCenter' || s.type === 'strategyCenter' || s.type === 'palace')
    );
    const countType = (types) => existingUnits.filter(u => types.includes(u.type)).length;

    if (facilityType === 'airfield') {
        if (f === 'china') return 'mig';
        if (f === 'usa') {
            const r = simRandom();
            if (hasTier3 && diff !== 'easy' && countType(['aurora']) < (diff === 'hard' ? 2 : 1) && r < 0.25) return 'aurora';
            if (diff !== 'easy' && countType(['stealthfighter']) < 1 && r < 0.45) return 'stealthfighter';
            return simRandom() < 0.55 ? 'comanche' : 'raptor';
        }
        return null;
    }

    if (facilityType === 'barracks') {
        // Blend threat counter (~35%) with full infantry/specialist variety (~65%) so barracks never spams 100% one unit
        const useCounter = (counter === 'anti_air' || counter === 'anti_armor') && simRandom() < 0.35;
        if (f === 'china') {
            if (hasTier3 && diff !== 'easy' && countType(['blacklotus']) === 0 && simRandom() < 0.16) return 'blacklotus';
            if (useCounter) return 'tankhunter';
            const thCount = countType(['tankhunter']);
            const rgCount = countType(['redguard']);
            if (thCount > rgCount + 1) return 'redguard';
            if (rgCount > thCount + 1) return 'tankhunter';
            return simRandom() < 0.52 ? 'tankhunter' : 'redguard';
        } else if (f === 'gla') {
            if (hasTier3 && diff !== 'easy') {
                if (countType(['jarmen']) === 0 && simRandom() < 0.18) return 'jarmen';
                if (countType(['mob']) < (diff === 'hard' ? 2 : 1) && simRandom() < 0.24) return 'mob';
                if (diff === 'hard' && countType(['hijacker']) === 0 && simRandom() < 0.14) return 'hijacker';
            }
            if (diff !== 'easy' && countType(['terrorist']) < 1 && simRandom() < 0.14) return 'terrorist';
            if (useCounter) return 'rpg';
            const rpgCount = countType(['rpg']);
            const rebCount = countType(['rebel']);
            if (rpgCount > rebCount + 1) return 'rebel';
            if (rebCount > rpgCount + 1) return 'rpg';
            return simRandom() < 0.52 ? 'rpg' : 'rebel';
        } else {
            if (hasTier3 && diff !== 'easy') {
                if (countType(['burton']) === 0 && simRandom() < 0.18) return 'burton';
                if (countType(['pathfinder']) < (diff === 'hard' ? 2 : 1) && simRandom() < 0.28) return 'pathfinder';
            }
            if (useCounter) return 'missiledefender';
            const mdCount = countType(['missiledefender', 'rocket']);
            const rngCount = countType(['ranger', 'infantry']);
            if (mdCount > rngCount + 1) return 'ranger';
            if (rngCount > mdCount + 1) return 'missiledefender';
            return simRandom() < 0.52 ? 'missiledefender' : 'ranger';
        }
    }

    // War Factory / Arms Dealer vehicles: enforce combined-arms role diversity in every wave!
    // Blend threat counter (~35%) with role-balanced combined-arms selection (~65%)
    const useVehicleCounter = counter !== 'balanced' && simRandom() < 0.35;

    if (f === 'china') {
        if (useVehicleCounter) {
            if (counter === 'anti_air') return 'gatling';
            if (counter === 'anti_infantry') return simRandom() < 0.5 ? 'dragon' : (simRandom() < 0.5 ? 'crawler' : 'gatling');
            if (counter === 'anti_armor') return (hasTier3 && simRandom() < 0.55) ? 'overlord' : 'battlemaster';
        }
        // Fill missing combined-arms roles first (AA escort, flame/transport, siege artillery, heavy armor)
        if (countType(['gatling']) === 0 && existingUnits.length >= 2) return 'gatling';
        if (diff !== 'easy' && countType(['crawler', 'dragon']) === 0 && existingUnits.length >= 3) {
            return simRandom() < 0.55 ? 'crawler' : 'dragon';
        }
        if (diff !== 'easy' && countType(['inferno', 'nukecannon']) === 0 && existingUnits.length >= 4) {
            return (hasTier3 && simRandom() < 0.55) ? 'nukecannon' : 'inferno';
        }
        const r = simRandom();
        if (hasTier3 && r < (diff === 'hard' ? 0.28 : 0.20)) return 'overlord';
        if (hasTier3 && diff !== 'easy' && r < (diff === 'hard' ? 0.42 : 0.32)) return 'nukecannon';
        if (diff !== 'easy' && r < 0.54) return 'inferno';
        if (r < 0.68) return 'gatling';
        if (r < 0.79) return 'crawler';
        if (r < 0.88) return 'dragon';
        return 'battlemaster';
    } else if (f === 'gla') {
        if (useVehicleCounter) {
            if (counter === 'anti_air') return 'quad';
            if (counter === 'anti_infantry') return simRandom() < 0.5 ? 'toxintractor' : 'quad';
            if (counter === 'anti_armor') return (hasTier3 && simRandom() < 0.55) ? 'marauder' : (simRandom() < 0.65 ? 'scorpion' : 'buggy');
        }
        if (countType(['quad']) === 0 && existingUnits.length >= 2) return 'quad';
        if (diff !== 'easy' && countType(['buggy', 'scud']) === 0 && existingUnits.length >= 3) {
            return (hasTier3 && simRandom() < 0.5) ? 'scud' : 'buggy';
        }
        if (countType(['toxintractor', 'technical']) === 0 && existingUnits.length >= 4) {
            return simRandom() < 0.55 ? 'toxintractor' : 'technical';
        }
        const r = simRandom();
        if (hasTier3 && diff !== 'easy' && r < (diff === 'hard' ? 0.22 : 0.16)) return 'scud';
        if (hasTier3 && diff === 'hard' && countType(['bombtruck']) === 0 && r < 0.29) return 'bombtruck';
        if (hasTier3 && r < 0.48) return 'marauder';
        if (r < 0.64) return 'quad';
        if (r < 0.76) return 'buggy';
        if (r < 0.85) return 'toxintractor';
        if (r < 0.91) return 'technical';
        return 'scorpion';
    } else {
        if (useVehicleCounter) {
            if (counter === 'anti_air') return 'humvee';
            if (counter === 'anti_infantry') return simRandom() < 0.7 ? 'humvee' : 'ambulance';
            if (counter === 'anti_armor') return (hasTier3 && simRandom() < 0.55) ? 'paladin' : 'tank';
        }
        if (countType(['humvee']) === 0 && existingUnits.length >= 2) return 'humvee';
        if (hasTier3 && diff !== 'easy' && countType(['tomahawk']) === 0 && existingUnits.length >= 3) return 'tomahawk';
        if (diff !== 'easy' && countType(['ambulance']) === 0 && existingUnits.length >= 5) return 'ambulance';
        const r = simRandom();
        if (hasTier3 && diff !== 'easy' && r < (diff === 'hard' ? 0.22 : 0.16)) return 'tomahawk';
        if (hasTier3 && r < (diff === 'hard' ? 0.52 : 0.42)) return 'paladin';
        if (r < 0.72) return 'humvee';
        if (diff !== 'easy' && countType(['ambulance']) < 1 && r < 0.80) return 'ambulance';
        return 'tank';
    }
}

// Spawn AI structure for base construction or base perimeter defense (Requires active AI Builder: Dozer / Worker!)
function spawnAIStructure(cmd, type, pos, builderUnit) {
    if (typeof createStructureMeshForFaction !== 'function' || typeof scene === 'undefined') return null;
    if (typeof window !== 'undefined') {
        window.activeEnemyColorHex = (window.aiColorMap && window.aiColorMap[cmd.ownerId]) || cmd.colorHex || 0xdc2626;
    }
    const f = cmd.faction || 'china';
    const bType = (f === 'gla') ? 'worker' : 'dozer';
    const activeBuilder = builderUnit || (typeof enemyUnits !== 'undefined' ? enemyUnits.find(u =>
            u.ownerId === cmd.ownerId && u.health > 0 && (u.type === 'dozer' || u.type === 'worker') &&
            !u.targetStructure && u.taskState !== 'Building' && u.taskState !== 'MovingToBuild'
        ) : null);

    // Authentic C&C Generals Rule: AI CANNOT construct buildings without a live Dozer / Worker!
    if (!activeBuilder || activeBuilder.health <= 0) return null;

    const group = createStructureMeshForFaction(type, f, true);
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

    const curSimTick = (typeof buildingTick !== 'undefined') ? buildingTick : 0;
    const desiredGatherers = ZERO_HOUR_AI_DATA.resourceGatherers[cmd.difficulty] || 1;
    const myGatherers = myUnits.filter(u => u.type === 'truck' || u.type === 'chinook' || (u.type === 'worker' && u.aiState && u.aiState !== 'Idle'));
    if (supplyStruct && myGatherers.length < desiredGatherers && cmd.resources >= 600) {
        const hType = (cmd.faction === 'gla') ? 'worker' : (cmd.faction === 'usa' ? 'chinook' : 'truck');
        const harvTrainTicks = hType === 'worker' ? 300 : (hType === 'chinook' ? 540 : 420); // 5s / 9s / 7s at 60Hz sim ticks
        if (!cmd._harvesterReadyTick) {
            cmd._harvesterReadyTick = curSimTick + harvTrainTicks;
        } else if (curSimTick >= cmd._harvesterReadyTick) {
            cmd._harvesterReadyTick = 0;
            const spawnPos = adjustToPossibleDestination(supplyStruct.position.clone().add(new THREE.Vector3(7, 0, 7)), supplyStruct);
            if (typeof window !== 'undefined') window.activeEnemyColorHex = (window.aiColorMap && window.aiColorMap[cmd.ownerId]) || cmd.colorHex || 0xdc2626;
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
    } else {
        cmd._harvesterReadyTick = 0;
    }

    // Ensure AI maintains at least 1 Construction Dozer / Builder Worker if Command Center stands (tick-based training time respects pause & game speed)
    const myBuilders = myUnits.filter(u => u.type === 'dozer' || (u.type === 'worker' && (!u.aiState || u.aiState === 'Idle')));
    if (cmdCenter && myBuilders.length === 0 && cmd.resources >= 1000) {
        const bType = (cmd.faction === 'gla') ? 'worker' : 'dozer';
        const builderTrainTicks = bType === 'worker' ? 300 : 480; // 5s Worker / 8s Dozer at 60Hz sim ticks
        if (!cmd._builderReadyTick) {
            cmd._builderReadyTick = curSimTick + builderTrainTicks;
        } else if (curSimTick >= cmd._builderReadyTick) {
            cmd._builderReadyTick = 0;
            const spawnPos = adjustToPossibleDestination(cmdCenter.position.clone().add(new THREE.Vector3(-8, 0, 8)), cmdCenter);
            if (typeof window !== 'undefined') window.activeEnemyColorHex = (window.aiColorMap && window.aiColorMap[cmd.ownerId]) || cmd.colorHex || 0xdc2626;
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
    } else if (myBuilders.length > 0) {
        cmd._builderReadyTick = 0;
    }

    // Find an available idle AI builder (Dozer or Worker)
    const availBuilder = myBuilders.find(b =>
        b.health > 0 && !b.targetStructure && b.taskState !== 'Building' && b.taskState !== 'MovingToBuild'
    );
    if (!availBuilder) return;

    // If an existing AI foundation lost its builder or builder moved on, dispatch the idle builder to finish it first!
    const unfinishedStruct = myStructures.find(s => s.isBuilding && (!s.dozerRef || s.dozerRef.health <= 0 || s.dozerRef.targetStructure !== s));
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

    // Find a clear, non-overlapping build site with wide avenues so heavy tanks (Overlords) & Dozers never wedge between buildings
    function findAIStructureBuildLocation(cmd, type, desiredPos) {
        const newR = (typeof getStructureFootprint === 'function') ? (getStructureFootprint(type).radius || 6.0) : 6.0;
        const mapHalf = (typeof currentMapSize !== 'undefined' ? currentMapSize * 0.45 : 270);
        const allStructs = [
            ...(typeof structures !== 'undefined' ? structures : []),
            ...(typeof enemyStructures !== 'undefined' ? enemyStructures : [])
        ];

        const isClear = (cx, cz, clearanceGap) => {
            if (Math.abs(cx) > mapHalf || Math.abs(cz) > mapHalf) return false;
            if (typeof getTerrainHeight === 'function') {
                const h = getTerrainHeight(cx, cz);
                if (typeof currentWaterLevel !== 'undefined' && h < currentWaterLevel + 0.3) return false;
                if (typeof isTerrainCliffAt === 'function' && isTerrainCliffAt(cx, cz, h)) return false;
            }
            for (let i = 0; i < allStructs.length; i++) {
                const s = allStructs[i];
                if (!s || s.health <= 0) continue;
                const sp = s.position || (s.mesh && s.mesh.position);
                if (!sp) continue;
                const minD = (s.radius || 6.0) + newR + clearanceGap;
                const dx = cx - sp.x, dz = cz - sp.z;
                if (dx * dx + dz * dz < minD * minD) return false;
            }
            if (typeof supplyPoints !== 'undefined' && Array.isArray(supplyPoints)) {
                for (let i = 0; i < supplyPoints.length; i++) {
                    const sp = supplyPoints[i];
                    if (!sp || !sp.position) continue;
                    const minD = (sp.radius || 5.0) + newR + 10.0;
                    const dx = cx - sp.position.x, dz = cz - sp.position.z;
                    if (dx * dx + dz * dz < minD * minD) return false;
                }
            }
            if (cmd.rallyPoint) {
                const rdx = cx - cmd.rallyPoint.x, rdz = cz - cmd.rallyPoint.z;
                const rMin = newR + 14.0;
                if (rdx * rdx + rdz * rdz < rMin * rMin) return false;
            }
            return true;
        };

        const preferredGap = 22.0;
        if (isClear(desiredPos.x, desiredPos.z, preferredGap)) {
            const y = typeof getTerrainHeight === 'function' ? getTerrainHeight(desiredPos.x, desiredPos.z) : 0;
            return new THREE.Vector3(desiredPos.x, y, desiredPos.z);
        }

        for (const gap of [22.0, 15.0]) {
            for (let ring = 12; ring <= 110; ring += 12) {
                for (let step = 0; step < 16; step++) {
                    const ang = (step / 16) * Math.PI * 2;
                    const cx = desiredPos.x + Math.cos(ang) * ring;
                    const cz = desiredPos.z + Math.sin(ang) * ring;
                    if (isClear(cx, cz, gap)) {
                        const y = typeof getTerrainHeight === 'function' ? getTerrainHeight(cx, cz) : 0;
                        return new THREE.Vector3(cx, y, cz);
                    }
                }
            }
        }
        return null;
    }

    // Essential base structures to construct / reconstruct in priority order
    const f = cmd.faction || 'china';
    const essentialList = [
        { check: s => s.type === 'power' || s.type === 'nuclearReactor', build: f === 'china' ? 'nuclearReactor' : 'power', cost: 800, offset: new THREE.Vector3(-44, 0, -34) },
        { check: s => s.type === 'supplyCenter' || s.type === 'supplyStash', build: f === 'gla' ? 'supplyStash' : 'supplyCenter', cost: 1500, offset: new THREE.Vector3(44, 0, -34) },
        { check: s => s.type === 'barracks', build: 'barracks', cost: 600, offset: new THREE.Vector3(-44, 0, 36) },
        { check: s => s.type === 'factory', build: 'factory', cost: 2000, offset: new THREE.Vector3(46, 0, 36) },
        ...(f !== 'gla' ? [{ check: s => s.type === 'airfield', build: 'airfield', cost: 1000, offset: new THREE.Vector3(0, 0, -56) }] : []),
        { check: s => s.type === 'strategyCenter' || s.type === 'propagandaCenter' || s.type === 'palace', build: f === 'china' ? 'propagandaCenter' : f === 'gla' ? 'palace' : 'strategyCenter', cost: 1500, offset: new THREE.Vector3(-62, 0, 0) }
    ];
    const hasCompletedTier3 = myStructures.some(s => !s.isBuilding && s.health > 0 && (s.type === 'strategyCenter' || s.type === 'propagandaCenter' || s.type === 'palace'));
    const swMinTick = cmd.difficulty === 'hard' ? 12000 : 18000; // Hard: ~3m20s, Medium: ~5m00s
    if (cmd.difficulty !== 'easy' && hasCompletedTier3 && (typeof buildingTick === 'undefined' || buildingTick >= swMinTick)) {
        const swType = f === 'china' ? 'nukeSilo' : f === 'gla' ? 'scudStorm' : 'particleCannon';
        const swCost = (typeof getStructureCost === 'function' ? getStructureCost(swType) : 0) || 2500;
        essentialList.push(
            { check: s => s.type === 'particleCannon' || s.type === 'nukeSilo' || s.type === 'scudStorm', build: swType, cost: swCost, offset: new THREE.Vector3(64, 0, 0) }
        );
    }

    for (let item of essentialList) {
        if (f === 'gla' && (item.build === 'power' || item.build === 'nuclearReactor')) continue;
        if (!myStructures.some(item.check) && cmd.resources >= item.cost) {
            const candidatePos = findAIStructureBuildLocation(cmd, item.build, cmd.basePos.clone().add(item.offset));
            if (!candidatePos) continue;
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
        const spread = (currentDefenses.length % 2 === 0 ? 1 : -1) * (20 + Math.floor(currentDefenses.length / 2) * 22);
        const defPos = cmd.basePos.clone()
        .addScaledVector(frontDir, 52)
        .addScaledVector(sideDir, spread);
        const clearPos = findAIStructureBuildLocation(cmd, defType, defPos);
        if (!clearPos) return;
        const builtDef = spawnAIStructure(cmd, defType, clearPos, availBuilder);
        if (builtDef) {
            cmd.resources -= 1000;
        }
    }

    // GLA AI Camo Netting on completed Stinger Sites & Tunnel Networks (free/instant for GLA Stealth General; $400 purchase for standard GLA)
    if (f === 'gla') {
        const isStealthGen = cmd.generalId === 'gla_stealth';
        for (let i = 0; i < myStructures.length; i++) {
            const s = myStructures[i];
            if (!s || s.health <= 0 || s.isBuilding || s.hasCamoNetting) continue;
            if (s.type !== 'stingerSite' && s.type !== 'tunnel') continue;
            if (isStealthGen || cmd.resources >= 1000) {
                s.hasCamoNetting = true;
                s.isStealthed = true;
                if (typeof attachCamoNettingVisual === 'function') attachCamoNettingVisual(s);
                if (!isStealthGen) {
                    cmd.resources -= 400;
                    break; // Purchase at most 1 camo net per AI decision tick
                }
            }
        }
    }
}

function processEnemyAIEngine() {
    if (isMultiplayerActive) return;
    aiDecisionTimer++;
    // Scaled AI decision tick rate by difficulty + dynamic scaling for large AI armies (Issue #64)
    const baseTickRate = aiDifficultyLevel === 'hard' ? 30 : aiDifficultyLevel === 'easy' ? 90 : 60;
    const aiUnitCount = (typeof enemyUnits !== 'undefined' && enemyUnits.length) ? enemyUnits.length : 0;
    const tickRate = Math.max(baseTickRate, Math.min(120, Math.ceil(aiUnitCount / 2.5)));
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

            // --- 0b. AI Unit Upgrades (China Overlord Towers & USA Vehicle Drones) ---
            if (cmd.faction === 'china' && typeof attachOverlordUpgrade === 'function' && (cmd.resources || 0) >= 500) {
                const bareOverlord = myUnits.find(u => u.type === 'overlord' && u.health > 0 && !u.overlordUpgrade);
                if (bareOverlord) {
                    const existingSpeaker = myUnits.some(u => u.type === 'overlord' && u.overlordUpgrade === 'speaker');
                    let upg = 'gatling', cost = 1200;
                    const roll = simRandom();
                    if (!existingSpeaker && roll < 0.35) { upg = 'speaker'; cost = 500; }
                    else if (roll < 0.78) { upg = 'gatling'; cost = 1200; }
                    else { upg = 'bunker'; cost = 400; }
                    if ((cmd.resources || 0) >= cost) {
                        cmd.resources -= cost;
                        if (typeof window !== 'undefined') window.activeEnemyColorHex = (window.aiColorMap && window.aiColorMap[cmd.ownerId]) || cmd.colorHex || 0xdc2626;
                        attachOverlordUpgrade(bareOverlord, upg);
                        if (upg === 'bunker' && typeof spawnEnemyUnit === 'function') {
                            // Garrison AI Overlord Battle Bunker with Red Guard & Tank Hunters
                            const garrisonTypes = ['tankhunter', 'tankhunter', 'redguard'];
                            for (let gi = 0; gi < garrisonTypes.length; gi++) {
                                const inf = spawnEnemyUnit(garrisonTypes[gi], bareOverlord.mesh.position.clone(), null, 'china');
                                if (inf) {
                                    inf.teamId = cmd.teamId;
                                    inf.ownerId = cmd.ownerId;
                                    inf.isAI = true;
                                    inf.garrisonedIn = bareOverlord;
                                    if (inf.mesh) inf.mesh.visible = false;
                                    if (!Array.isArray(bareOverlord.garrisoned)) bareOverlord.garrisoned = [];
                                    bareOverlord.garrisoned.push(inf);
                                }
                            }
                        }
                    }
                }
            } else if (cmd.faction === 'usa' && typeof attachVehicleDrone === 'function' && (cmd.resources || 0) >= 900) {
                const bareVeh = myUnits.find(u => ['paladin', 'crusader', 'humvee', 'tomahawk'].includes(u.type) && u.health > 0 && !u.drone);
                if (bareVeh) {
                    const droneType = (simRandom() < 0.72) ? 'battle' : 'scout';
                    cmd.resources -= 300;
                    attachVehicleDrone(bareVeh, droneType);
                }
            }

            // --- 1. AI Production Engine with Combined-Arms Variety & Threat Counter Selection ---
            cmd.productionTimer++;
            const isWealthy = (cmd.resources || 0) >= ZERO_HOUR_AI_DATA.resourcesWealthy;
            const baseProdInterval = cmd.difficulty === 'hard' ? 6 : cmd.difficulty === 'easy' ? 18 : 10;
            const prodInterval = isWealthy ? Math.max(3, Math.floor(baseProdInterval * 0.65)) : baseProdInterval;
            const maxUnits = cmd.difficulty === 'hard' ? 30 : cmd.difficulty === 'easy' ? 12 : 20;

            const combatUnits = myUnits.filter(u => !u.garrisonedIn && u.type !== 'dozer' && u.type !== 'worker' && u.type !== 'truck' && u.type !== 'chinook');
            if (cmd.productionTimer >= prodInterval && combatUnits.length < maxUnits && (cmd.resources || 0) >= 500) {
                cmd.productionTimer = 0;
                const fac = myStructures.find(es => !es.isBuilding && es.type === 'factory' && es.health > 0);
                const bar = myStructures.find(es => !es.isBuilding && es.type === 'barracks' && es.health > 0);
                const air = myStructures.find(es => !es.isBuilding && es.type === 'airfield' && es.health > 0);
                const existingAirCount = combatUnits.filter(u => u.isAir).length;
                const maxAir = cmd.difficulty === 'hard' ? 4 : (cmd.difficulty === 'easy' ? 1 : 2);
                // Combined arms: mix armor/vehicles (~60%), infantry/specialists (~25%), and aircraft (~15-20% when Airfield operational)
                let chosenFacility = null;
                if (air && existingAirCount < maxAir && simRandom() < 0.22) {
                    chosenFacility = air;
                } else if (fac && bar) {
                    const infCount = combatUnits.filter(u => typeof isInfantryType === 'function' ? isInfantryType(u.type) : false).length;
                    const vehCount = combatUnits.length - infCount - existingAirCount;
                    const facBias = (infCount * 2 < vehCount) ? 0.52 : 0.68;
                    chosenFacility = simRandom() < facBias ? fac : bar;
                } else {
                    chosenFacility = fac || bar || (air && existingAirCount < maxAir ? air : null);
                }
                if (chosenFacility) {
                    const uType = chooseAICounterUnitType(cmd, chosenFacility.type, combatUnits);
                    if (uType) {
                        const rawSpawn = chosenFacility.position.clone().add(new THREE.Vector3(10 + simRandom() * 4, 0, 8 + simRandom() * 4));
                        const spawnPos = adjustToPossibleDestination(rawSpawn, chosenFacility);
                        spawnPos.y = typeof getTerrainHeight === 'function' ? getTerrainHeight(spawnPos.x, spawnPos.z) : 0;
                        if (typeof window !== 'undefined') window.activeEnemyColorHex = (window.aiColorMap && window.aiColorMap[cmd.ownerId]) || cmd.colorHex || 0xdc2626;
                        const eu = spawnEnemyUnit(uType, spawnPos, null, cmd.faction);
                        if (eu) {
                            const uCost = (typeof unitCosts !== 'undefined' && unitCosts[uType]) ? unitCosts[uType] : 700;
                            cmd.resources = Math.max(0, (cmd.resources || 0) - uCost);
                            eu.teamId = cmd.teamId;
                            eu.ownerId = cmd.ownerId;
                            eu.isAI = true;
                            eu.difficulty = cmd.difficulty;
                            // Ensure any pre-garrisoned passengers (e.g. China Troop Crawler Red Guards) inherit commander team/owner
                            if (Array.isArray(eu.garrisoned) && eu.garrisoned.length > 0) {
                                eu.garrisoned.forEach(p => {
                                    p.teamId = cmd.teamId;
                                    p.ownerId = cmd.ownerId;
                                    p.isAI = true;
                                    p.difficulty = cmd.difficulty;
                                });
                            }
                            // Medium & Hard AI loads USA Humvees ("Rockvees") and GLA Technicals with rocket/rifle infantry
                            if ((uType === 'humvee' || uType === 'technical') && cmd.difficulty !== 'easy' && typeof spawnEnemyUnit === 'function') {
                                const passTypes = uType === 'humvee'
                                    ? (cmd.difficulty === 'hard' ? ['missiledefender', 'missiledefender', 'ranger'] : ['missiledefender', 'ranger'])
                                    : (cmd.difficulty === 'hard' ? ['rpg', 'rpg', 'rebel'] : ['rpg', 'rebel']);
                                for (let pi = 0; pi < passTypes.length; pi++) {
                                    const pass = spawnEnemyUnit(passTypes[pi], spawnPos.clone(), null, cmd.faction);
                                    if (pass) {
                                        pass.teamId = cmd.teamId;
                                        pass.ownerId = cmd.ownerId;
                                        pass.isAI = true;
                                        pass.difficulty = cmd.difficulty;
                                        pass.garrisonedIn = eu;
                                        if (pass.mesh) pass.mesh.visible = false;
                                        if (!Array.isArray(eu.garrisoned)) eu.garrisoned = [];
                                        eu.garrisoned.push(pass);
                                    }
                                }
                            }
                            // Add newly produced combat unit to staging strike team at rally point (AISkirmishPlayer::processTeamBuilding)
                            if (!cmd.stagingTeam) cmd.stagingTeam = [];
                            cmd.stagingTeam.push(eu.netId);
                            if (eu.isAir) {
                                eu.airState = 'flying';
                                eu.patrolCenter = cmd.rallyPoint.clone();
                                eu.targetPosition.copy(cmd.rallyPoint);
                            } else {
                                eu.targetPosition.copy(cmd.rallyPoint);
                                eu.taskState = 'Moving';
                                eu.waypoints = [];
                            }
                        }
                    }
                }
            }

            // --- 2. Reconnaissance & Scout Squad Assembly (Original Generals: form a 2-unit recon group ONCE before enemy base is found; never trickle 1-by-1!) ---
            for (let sId of cmd.scoutNetIds) {
                if (!combatUnits.some(u => u.netId === sId)) cmd.scoutNetIds.delete(sId);
            }
            const hasDiscoveredBase = (cmd.discoveredEnemyBases && cmd.discoveredEnemyBases.length > 0);
            if (hasDiscoveredBase && cmd.scoutNetIds.size > 0) {
                // Enemy base has been located: fold scouts back into the main strike force instead of wandering alone!
                cmd.scoutNetIds.forEach(sId => {
                    const su = combatUnits.find(u => u.netId === sId);
                    if (su) {
                        su.isScout = false;
                        if (!su._releasedForAttack && cmd.stagingTeam && !cmd.stagingTeam.includes(su.netId)) {
                            cmd.stagingTeam.push(su.netId);
                        }
                    }
                });
                cmd.scoutNetIds.clear();
            }
            const reconSquadSize = 2;
            // Only assemble the initial recon squad BEFORE it launches (never endlessly steal newly produced units 1-by-1 out of stagingTeam as scouts die!)
            if (!cmd._reconLaunched && !hasDiscoveredBase) {
                while (cmd.scoutNetIds.size < reconSquadSize && combatUnits.length > cmd.scoutNetIds.size) {
                    const candidateScout = combatUnits.find(u => !u.combatTarget && !u._releasedForAttack && !cmd.scoutNetIds.has(u.netId) && !u.isAir);
                    if (!candidateScout) break;
                    candidateScout.isScout = true;
                    cmd.scoutNetIds.add(candidateScout.netId);
                    if (cmd.stagingTeam) {
                        cmd.stagingTeam = cmd.stagingTeam.filter(id => id !== candidateScout.netId);
                    }
                }
            }

            const assignAIGroundRoute = (unit, destPos, ignoreStruct = null) => {
                if (!unit || !destPos) return;
                if (unit.isAir) {
                    unit.waypoints = [];
                    unit.targetPosition.copy(destPos);
                    return;
                }
                const navPath = (typeof findNavigationPath === 'function')
                    ? findNavigationPath(unit.mesh.position, destPos, { ignoreStruct })
                    : [destPos.clone()];
                if (navPath && navPath.length > 1) {
                    unit.waypoints = navPath.slice(1);
                    unit.targetPosition.copy(navPath[0]);
                } else {
                    unit.waypoints = [];
                    unit.targetPosition.copy(destPos);
                }
            };

            const scoutUnits = [];
            cmd.scoutNetIds.forEach(sId => {
                const su = myUnits.find(u => u.netId === sId);
                if (su && su.health > 0) scoutUnits.push(su);
            });

            if (scoutUnits.length > 0) {
                if (!cmd._reconLaunched) {
                    // Hold recon squad together at rallyPoint until the full 2-3 unit group is assembled
                    if (scoutUnits.length >= reconSquadSize) {
                        cmd._reconLaunched = true;
                        cmd._reconGoal = null;
                    } else {
                        scoutUnits.forEach((su, si) => {
                            if (su.waypoints && su.waypoints.length > 0) return;
                            const ang = (si / Math.max(1, reconSquadSize)) * Math.PI * 2;
                            const spot = new THREE.Vector3(cmd.rallyPoint.x + Math.cos(ang) * 6.5, cmd.rallyPoint.y || 0, cmd.rallyPoint.z + Math.sin(ang) * 6.5);
                            if (su.mesh.position.distanceTo(spot) > 7.5) {
                                assignAIGroundRoute(su, spot);
                                su.taskState = 'Moving';
                            }
                        });
                    }
                }
                if (cmd._reconLaunched) {
                    cmd._reconGoalTicks = (cmd._reconGoalTicks || 0) + 1;
                    // Advance to next exploration waypoint on arrival OR after timeout (prevents scouts stalling forever on obstacles)
                    const needNewGoal = !cmd._reconGoal || cmd._reconGoalTicks >= 45 || scoutUnits.some(su => su.mesh.position.distanceTo(cmd._reconGoal) < 20.0);
                    if (needNewGoal) {
                        cmd._reconGoalTicks = 0;
                        if (cmd.unexploredWaypoints.length > 0) {
                            cmd._reconGoal = cmd.unexploredWaypoints.shift().clone();
                        } else if (cmd.candidateEnemySpawns && cmd.candidateEnemySpawns.length > 0) {
                            cmd._reconCycleIdx = ((cmd._reconCycleIdx || 0) + 1) % cmd.candidateEnemySpawns.length;
                            cmd._reconGoal = cmd.candidateEnemySpawns[cmd._reconCycleIdx].clone();
                        } else {
                            const half = mapSize * 0.35;
                            const rx = (simRandom() * 2 - 1) * half;
                            const rz = (simRandom() * 2 - 1) * half;
                            cmd._reconGoal = new THREE.Vector3(rx, typeof getTerrainHeight === 'function' ? getTerrainHeight(rx, rz) : 0, rz);
                        }
                        scoutUnits.forEach((su, si) => {
                            if (su.combatTarget) return;
                            const offAng = (si / Math.max(1, scoutUnits.length)) * Math.PI * 2;
                            const dest = new THREE.Vector3(
                                cmd._reconGoal.x + Math.cos(offAng) * 4.0,
                                cmd._reconGoal.y || 0,
                                cmd._reconGoal.z + Math.sin(offAng) * 4.0
                            );
                            assignAIGroundRoute(su, dest);
                        });
                    } else {
                        // Ensure any newly reinforced scout joins the active recon squad
                        scoutUnits.forEach((su, si) => {
                            if (su.combatTarget || (su.waypoints && su.waypoints.length > 0)) return;
                            if (su.mesh.position.distanceTo(su.targetPosition) < 4.0 && su.mesh.position.distanceTo(cmd._reconGoal) > 18.0) {
                                const offAng = (si / Math.max(1, scoutUnits.length)) * Math.PI * 2;
                                assignAIGroundRoute(su, new THREE.Vector3(cmd._reconGoal.x + Math.cos(offAng) * 4.0, cmd._reconGoal.y || 0, cmd._reconGoal.z + Math.sin(offAng) * 4.0));
                            }
                        });
                    }
                }
            } else {
                // Do not reset _reconLaunched if an enemy base was already discovered; if all scouts died before finding a base, wait 30 AI ticks before forming another pair
                if (!hasDiscoveredBase) {
                    cmd._reconRetryCooldown = (cmd._reconRetryCooldown || 0) + 1;
                    if (cmd._reconRetryCooldown >= 30) {
                        cmd._reconRetryCooldown = 0;
                        cmd._reconLaunched = false;
                        cmd._reconGoal = null;
                    }
                }
            }

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
                    const isBaseUnderAttack = victimPos.distanceTo(cmd.basePos) <= 55;
                    if (retDist <= ZERO_HOUR_AI_DATA.maxRetaliateDistance || isBaseUnderAttack) {
                        shareTeamDiscovery(cmd.teamId, attacker, false);
                        const rallyRadius = isBaseUnderAttack ? 72 : ZERO_HOUR_AI_DATA.retaliateFriendsRadius;
                        const stagingSet = new Set(cmd.stagingTeam || []);
                        combatUnits.forEach(ally => {
                                // Only break staging formation if our own base is directly under attack!
                                if (!isBaseUnderAttack && stagingSet.has(ally.netId)) return;
                                if (typeof canUnitTarget === 'function' && !canUnitTarget(ally, attacker)) return;
                                if (!ally.combatTarget && ally.mesh.position.distanceTo(victimPos) <= rallyRadius) {
                                    ally.combatTarget = attacker;
                                    if (isBaseUnderAttack) ally._releasedForAttack = true;
                                    assignAIGroundRoute(ally, attackerPos, attacker);
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
            const attackDelays = { easy: 135, medium: 85, hard: 60 };
            const attackDelaySec = attackDelays[cmd.difficulty] || 85;
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

            // Clean dead units from stagingTeam and ensure ALL non-scout, non-released combat units stage at rallyPoint together!
            if (!cmd.stagingTeam) cmd.stagingTeam = [];
            cmd.stagingTeam = cmd.stagingTeam.filter(id => combatUnits.some(u => u.netId === id));
            const releasedGroundUnits = combatUnits.filter(u => u._releasedForAttack && !u.isAir);
            combatUnits.forEach(u => {
                if (u.isScout) return;
                // If a previously released unit is left isolated near home base after defending, fold it back into stagingTeam so it regroups with the next wave instead of trickling 1-by-1!
                if (u._releasedForAttack && !u.combatTarget && u.mesh.position.distanceTo(cmd.basePos) < 75 && releasedGroundUnits.length < 3) {
                    u._releasedForAttack = false;
                    u._waveGoal = null;
                    u._waveId = 0;
                }
                if (!u._releasedForAttack && !cmd.stagingTeam.includes(u.netId)) {
                    cmd.stagingTeam.push(u.netId);
                }
            });

            const targetWaveSize = ZERO_HOUR_AI_DATA.maxStrikeTeamSize[cmd.difficulty] || 8;
            const minTimeoutWaveSize = Math.max(3, Math.floor(targetWaveSize * 0.5));
            const hasKnownEnemy = (cmd.discoveredEnemyTargets.length > 0 || cmd.discoveredEnemyBases.length > 0);
            const waveWaitTicks = (cmd.stagingTeam.length >= minTimeoutWaveSize && canLaunchOffensive) ? (cmd.attackWaveTimer = (cmd.attackWaveTimer || 0) + 1) : (cmd.attackWaveTimer = 0);
            const waveReady = canLaunchOffensive && (cmd.stagingTeam.length >= targetWaveSize || (cmd.stagingTeam.length >= minTimeoutWaveSize && waveWaitTicks >= 55));

            if (waveReady) {
                // If scouts haven't found an enemy base yet, pick a search-and-destroy sweep point (enemy spawn) so AI never huddles forever!
                let sweepTarget = null;
                if (!hasKnownEnemy) {
                    const spawnPool = (cmd.candidateEnemySpawns && cmd.candidateEnemySpawns.length > 0) ? cmd.candidateEnemySpawns : cmd.unexploredWaypoints;
                    if (spawnPool && spawnPool.length > 0) {
                        cmd._sweepIdx = ((cmd._sweepIdx || 0) + 1) % spawnPool.length;
                        sweepTarget = spawnPool[cmd._sweepIdx].clone();
                    }
                }
                // Release staging team as a coordinated combined-arms (land + air) strike wave with synchronized convoy march speed!
                const waveTargetPos = sweepTarget
                    ? sweepTarget.clone()
                    : (cmd.discoveredEnemyBases.length > 0
                        ? cmd.discoveredEnemyBases[0].position.clone()
                        : (cmd.discoveredEnemyTargets.length > 0 ? cmd.discoveredEnemyTargets[0].position.clone() : null));
                const waveMembers = cmd.stagingTeam
                    .map(id => combatUnits.find(u => u.netId === id))
                    .filter(Boolean);
                const waveId = (cmd._nextWaveId = (cmd._nextWaveId || 0) + 1);
                // Synchronized convoy march speed so fast buggies/humvees escort main battle tanks & infantry instead of rushing ahead 1-by-1
                const convoySpeed = 0.145;
                waveMembers.forEach((member, mi) => {
                        member._releasedForAttack = true;
                        member._waveId = waveId;
                        member._waveConvoySpeed = convoySpeed;
                        const spreadAng = (mi / Math.max(1, waveMembers.length)) * Math.PI * 2;
                        const formOffset = member.isAir ? 0 : (4.5 + (mi % 2) * 3.0);
                        if (waveTargetPos) {
                            const dest = new THREE.Vector3(
                                waveTargetPos.x + Math.cos(spreadAng) * formOffset,
                                waveTargetPos.y || 0,
                                waveTargetPos.z + Math.sin(spreadAng) * formOffset
                            );
                            member._waveGoal = waveTargetPos.clone();
                            if (sweepTarget) member._sweepTarget = dest.clone();
                            if (member.isAir) {
                                member.airState = 'flying';
                                member.patrolCenter = dest.clone();
                                member.targetPosition.copy(dest);
                            } else {
                                assignAIGroundRoute(member, dest);
                                member.taskState = 'Moving';
                            }
                        }
                });
                cmd.stagingTeam = [];
                cmd.attackWaveTimer = 0;
            }

            const hashSlotId = (id) => {
                if (typeof id === 'number' && Number.isFinite(id)) return Math.abs(Math.floor(id));
                const s = String(id || '1');
                let h = 0;
                for (let ci = 0; ci < s.length; ci++) h = ((h * 31) + s.charCodeAt(ci)) | 0;
                return Math.abs(h);
            };

            combatUnits.forEach((enemy, enemyIdx) => {
                    if (enemy.isScout && !enemy.combatTarget) return;
                    const isStaging = !enemy._releasedForAttack;

                    // If unit is already engaged in active combat with valid hostile target:
                    if (enemy.combatTarget && enemy.combatTarget.health > 0 && !isFriendly(enemy, enemy.combatTarget)) {
                        const targetPos = enemy.combatTarget.position || enemy.combatTarget.mesh.position;
                        // Staged units defending the base perimeter must NOT chase an intruder across the map 1-by-1!
                        if ((!canLaunchOffensive || isStaging) && targetPos && (enemy.mesh.position.distanceTo(cmd.basePos) > 72 || targetPos.distanceTo(cmd.basePos) > 80)) {
                            enemy.combatTarget = null;
                        } else {
                            if (enemy.mesh.position.distanceTo(targetPos) > (enemy.scanRange || 22)) {
                                // Never overwrite active bridge/A* waypoints while already routing toward target!
                                if (!enemy.waypoints || enemy.waypoints.length === 0) {
                                    assignAIGroundRoute(enemy, targetPos, enemy.combatTarget);
                                }
                            }
                            return;
                        }
                    } else if (enemy.combatTarget) {
                        enemy.combatTarget = null;
                    }

                    // Defend base perimeter against close intruders (for staging units, only engage intruders actually near base/rallyPoint!)
                    let localIntruder = null;
                    let minDist = 36 * ZERO_HOUR_AI_DATA.guardInnerModifierAI;
                    hostileUnits.forEach(hu => {
                            if (hu.mesh) {
                                if (typeof canUnitTarget === 'function' && !canUnitTarget(enemy, hu)) return;
                                if (hu.isStealthed && !(hu.revealedUntil && hu.revealedUntil > buildingTick)) return;
                                if (isStaging && hu.mesh.position.distanceTo(cmd.basePos) > 72 && hu.mesh.position.distanceTo(cmd.rallyPoint) > 38) return;
                                const d = enemy.mesh.position.distanceTo(hu.mesh.position);
                                if (d < minDist) { minDist = d; localIntruder = hu; }
                            }
                    });
                    if (localIntruder) {
                        enemy.combatTarget = localIntruder;
                        assignAIGroundRoute(enemy, localIntruder.mesh.position, localIntruder);
                        return;
                    }

                    // Active search-and-destroy sweep when wave launched before enemy base was sighted
                    // Continuously cycle across candidate enemy spawns / map sectors instead of recalling back to base!
                    if (enemy._releasedForAttack && !hasKnownEnemy) {
                        const needNextSweep = !enemy._sweepTarget || enemy.mesh.position.distanceTo(enemy._sweepTarget) <= 18;
                        if (needNextSweep) {
                            const pool = (cmd.candidateEnemySpawns && cmd.candidateEnemySpawns.length > 0) ? cmd.candidateEnemySpawns : cmd.unexploredWaypoints;
                            if (pool && pool.length > 0) {
                                enemy._sweepSlotIdx = ((enemy._sweepSlotIdx !== undefined ? enemy._sweepSlotIdx : (cmd._sweepIdx || 0)) + 1) % pool.length;
                                enemy._sweepTarget = pool[enemy._sweepSlotIdx].clone();
                            } else {
                                const half = mapSize * 0.32;
                                const sx = (simRandom() * 2 - 1) * half;
                                const sz = (simRandom() * 2 - 1) * half;
                                enemy._sweepTarget = new THREE.Vector3(sx, typeof getTerrainHeight === 'function' ? getTerrainHeight(sx, sz) : 0, sz);
                            }
                            if (enemy.isAir) {
                                enemy.airState = 'flying';
                                enemy.patrolCenter = enemy._sweepTarget.clone();
                                enemy.targetPosition.copy(enemy._sweepTarget);
                            } else {
                                assignAIGroundRoute(enemy, enemy._sweepTarget);
                            }
                        } else if (!enemy.waypoints || enemy.waypoints.length === 0) {
                            if (enemy.mesh.position.distanceTo(enemy.targetPosition) <= 5) {
                                if (enemy.isAir) {
                                    enemy.targetPosition.copy(enemy._sweepTarget);
                                } else {
                                    assignAIGroundRoute(enemy, enemy._sweepTarget);
                                }
                            }
                        }
                        return;
                    }

                    // Hold in staging rally area until full wave is assembled (5 on Easy, 8 on Medium, 11 on Hard)
                    if (!canLaunchOffensive || isStaging || !hasKnownEnemy) {
                        if (enemy.waypoints && enemy.waypoints.length > 0) return;
                        const slotIdx = hashSlotId(enemy.netId !== undefined ? enemy.netId : enemyIdx);
                        const slotAng = (slotIdx % 12) * (Math.PI * 2 / 12);
                        const slotR = 7.5 + ((slotIdx >> 2) % 3) * 5.0;
                        const sx = cmd.rallyPoint.x + Math.cos(slotAng) * slotR;
                        const sz = cmd.rallyPoint.z + Math.sin(slotAng) * slotR;
                        const sy = typeof getTerrainHeight === 'function' ? getTerrainHeight(sx, sz) : (cmd.rallyPoint.y || 0);
                        const stagedSpot = new THREE.Vector3(sx, sy, sz);
                        // Wide arrival deadzone (9.5u) so staged units stop cleanly instead of circling their CC!
                        if (enemy.mesh.position.distanceTo(stagedSpot) > 9.5) {
                            assignAIGroundRoute(enemy, stagedSpot);
                            enemy.taskState = 'Moving';
                        } else {
                            enemy.targetPosition.copy(enemy.mesh.position);
                            enemy.taskState = 'Idle';
                        }
                        return;
                    }

                    // Cohesive Wave March: keep released wave members advancing together toward their shared wave objective
                    // until the wave arrives within assault staging distance (52u) of the target base!
                    if (enemy._waveGoal && !enemy.isAir) {
                        const distToWaveGoal = Math.hypot(enemy.mesh.position.x - enemy._waveGoal.x, enemy.mesh.position.z - enemy._waveGoal.z);
                        if (distToWaveGoal > 52) {
                            if (!enemy.waypoints || enemy.waypoints.length === 0) {
                                if (Math.hypot(enemy.mesh.position.x - enemy.targetPosition.x, enemy.mesh.position.z - enemy.targetPosition.z) <= 5.0) {
                                    assignAIGroundRoute(enemy, enemy._waveGoal);
                                }
                            }
                            return;
                        } else {
                            enemy._waveGoal = null;
                        }
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
                        if (d > enemy.scanRange && (!enemy.waypoints || enemy.waypoints.length === 0)) {
                            if (!enemy.isAir && typeof enqueueNavigationPath === 'function') {
                                enqueueNavigationPath(enemy, targetBase.position);
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
                            if (!enemy.waypoints || enemy.waypoints.length === 0) {
                                const approachDir = new THREE.Vector3().subVectors(targetPos, enemy.mesh.position).normalize();
                                const goalPos = targetPos.clone().addScaledVector(approachDir, -(enemy.scanRange - 3));
                                if (!enemy.isAir && typeof enqueueNavigationPath === 'function') {
                                    enqueueNavigationPath(enemy, goalPos, { ignoreStruct: bestTarget });
                                } else {
                                    enemy.targetPosition.copy(goalPos);
                                }
                            }
                        } else {
                            enemy.waypoints = [];
                            enemy.targetPosition.copy(enemy.mesh.position);
                        }
                    }
            });

            // --- Official AISkirmishPlayer General Powers (Medium & Hard AI unleash faction powers on discovered hostile bases/armies) ---
            if (cmd.difficulty !== 'easy' && typeof buildingTick !== 'undefined' && buildingTick >= 12600) { // After 3:30 in-match
                const gpInterval = cmd.difficulty === 'hard' ? 14400 : 18000; // 4:00 (Hard) or 5:00 (Medium)
                if (!cmd._nextGeneralPowerTick) cmd._nextGeneralPowerTick = 12600 + Math.floor(simRandom() * 3600);
                if (buildingTick >= cmd._nextGeneralPowerTick && cmd.discoveredEnemyBases && cmd.discoveredEnemyBases.length > 0) {
                    const targetObj = cmd.discoveredEnemyBases[Math.floor(simRandom() * cmd.discoveredEnemyBases.length)];
                    const gpPos = targetObj && targetObj.position ? targetObj.position.clone() : null;
                    if (gpPos) {
                        cmd._nextGeneralPowerTick = buildingTick + gpInterval;
                        const aiPseudo = { isAI: true, ownerId: cmd.ownerId, teamId: cmd.teamId, faction: cmd.faction };
                        if (cmd.faction === 'usa' && typeof triggerA10Strike === 'function') {
                            triggerA10Strike(gpPos, aiPseudo);
                            if (typeof showNotification === 'function') showNotification('⚠️ WARNING: Hostile A-10 Warthog Strike inbound!', 'error');
                        } else if (cmd.faction === 'china' && typeof triggerArtilleryBarrageFX === 'function') {
                            triggerArtilleryBarrageFX(gpPos, aiPseudo);
                            if (typeof showNotification === 'function') showNotification('⚠️ WARNING: Hostile PLA Artillery Barrage detected!', 'error');
                        } else if (cmd.faction === 'gla' && typeof triggerAnthraxBombFX === 'function') {
                            triggerAnthraxBombFX(gpPos, aiPseudo);
                            if (typeof showNotification === 'function') showNotification('⚠️ WARNING: Hostile GLA Anthrax Bomb inbound!', 'error');
                        }
                    }
                }
            }
    });
}
