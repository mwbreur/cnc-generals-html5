function isPointBlockedByStructureOrObstacle(x, z, unitRadius = 1.2) {
    const structLists = [
        typeof structures !== 'undefined' ? structures : [],
        typeof enemyStructures !== 'undefined' ? enemyStructures : [],
        typeof neutralStructures !== 'undefined' ? neutralStructures : []
    ];
    for (const list of structLists) {
        for (let i = 0; i < list.length; i++) {
            const s = list[i];
            if (!s || s.health <= 0 || !s.position) continue;
            const minR = (s.radius || 6) + unitRadius + 1.2;
            const dx = x - s.position.x;
            const dz = z - s.position.z;
            if (dx * dx + dz * dz < minR * minR) return s;
        }
    }
    if (typeof mapObstacles !== 'undefined') {
        for (let i = 0; i < mapObstacles.length; i++) {
            const obs = mapObstacles[i];
            if (!obs || !obs.position) continue;
            const minR = (obs.radius || 2) + unitRadius + 0.8;
            const dx = x - obs.position.x;
            const dz = z - obs.position.z;
            if (dx * dx + dz * dz < minR * minR) return obs;
        }
    }
    return null;
}

function clampPointOutsideStructures(pos, unitRadius = 1.2, preferredAngle = 0) {
    const out = pos.clone();
    for (let pass = 0; pass < 3; pass++) {
        const blocker = isPointBlockedByStructureOrObstacle(out.x, out.z, unitRadius);
        if (!blocker) break;
        const minR = (blocker.radius || 6) + unitRadius + 2.5;
        let dx = out.x - blocker.position.x;
        let dz = out.z - blocker.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.05) {
            dx = Math.sin(preferredAngle);
            dz = Math.cos(preferredAngle);
        } else {
            dx /= d;
            dz /= d;
        }
        out.x = blocker.position.x + dx * minR;
        out.z = blocker.position.z + dz * minR;
    }
    if (typeof getTerrainHeight === 'function') {
        out.y = getTerrainHeight(out.x, out.z);
    }
    return out;
}

// Find an unoccupied staged slot at rally destination to prevent units bunching or pushing each other
function getUnoccupiedRallySlot(baseRally, unitRadius, isInf, structureFacingAngle) {
    const spacing = isInf ? 3.4 : Math.max(8.0, unitRadius * 2.5);
    const cols = isInf ? 5 : 4;
    for (let slotIdx = 0; slotIdx < 60; slotIdx++) {
        const col = slotIdx % cols;
        const row = Math.floor(slotIdx / cols);
        const colOff = (col - (cols - 1) / 2) * spacing;
        const rowOff = row * spacing;

        const perpX = Math.cos(structureFacingAngle);
        const perpZ = -Math.sin(structureFacingAngle);
        const fwdX = Math.sin(structureFacingAngle);
        const fwdZ = Math.cos(structureFacingAngle);

        const slotX = baseRally.x + perpX * colOff + fwdX * rowOff;
        const slotZ = baseRally.z + perpZ * colOff + fwdZ * rowOff;

        // Skip slots inside any building or map obstacle
        if (isPointBlockedByStructureOrObstacle(slotX, slotZ, unitRadius || 1.2)) continue;

        // Skip slots submerged in water unless on a bridge
        const onBridge = (typeof mapBridges !== 'undefined') && mapBridges.some(b => isPointOnBridge(slotX, slotZ, b));
        if (!onBridge && typeof getTerrainHeight === 'function' && typeof currentWaterLevel !== 'undefined') {
            if (getTerrainHeight(slotX, slotZ) < currentWaterLevel + 0.35) continue;
        }

        // Check if another friendly unit already occupies or is traveling to this slot
        const isOccupied = units.some(u => {
            if (u.isAir || u.garrisonedIn || u.health <= 0) return false;
            const distCurrent = Math.hypot(u.mesh.position.x - slotX, u.mesh.position.z - slotZ);
            const distTarget = Math.hypot(u.targetPosition.x - slotX, u.targetPosition.z - slotZ);
            return (distCurrent < spacing * 0.72) || (distTarget < spacing * 0.72 && u.taskState === 'Moving');
        });

        if (!isOccupied) {
            const slotY = typeof getTerrainHeight === 'function' ? getTerrainHeight(slotX, slotZ) : 0;
            return new THREE.Vector3(slotX, slotY, slotZ);
        }
    }
    return clampPointOutsideStructures(baseRally, unitRadius || 1.2, structureFacingAngle);
}

// =========================================================================
// PERF: Cached named-node lookup (replaces recursive getObjectByName every frame).
// Hits are validated by walking up the parent chain (cheap, ~5 levels) so removed
// parts are detected; misses are re-checked at most once per second so parts that
// are attached later (e.g. Overlord upgrades) are still found.
// =========================================================================
function getCachedNode(root, name) {
    if (!root || typeof root.getObjectByName !== 'function') return null;
    const ud = root.userData || (root.userData = {});
    const cache = ud._nodeCache || (ud._nodeCache = {});
    const entry = cache[name];
    if (entry !== undefined) {
        if (entry && typeof entry === 'object') {
            let p = entry;
            while (p && p !== root) p = p.parent;
            if (p === root || !entry.parent) return entry;
        } else if (typeof entry === 'number' && (_animNodeFrame - entry) < 60) {
            return null;
        }
    }
    const found = root.getObjectByName(name) || null;
    cache[name] = found || _animNodeFrame;
    return found;
}
window.getCachedNode = getCachedNode;

// =========================================================================
// PERF: Animated-node registry (replaces per-frame scene.traverse)
// Each top-level scene object lazily caches the sub-nodes that need animating.
// The cache is rebuilt when the object's direct child count changes, plus a
// staggered full refresh every ~3 seconds to catch deep hierarchy changes.
// kind: 1 = rotor spinning +, 2 = rotor spinning -, 3 = other named animation
// =========================================================================
const ANIMATED_NODE_NAMES = new Set([
    'radarDish', 'radarDish2', 'hazardBeacon', 'fusionCore', 'nukeCore', 'pumpjackArm',
    'particleAcceleratorRing', 'particleEmitter', 'nukeTip', 'nukeBlastDoorL',
    'nukeBlastDoorR', 'scudGantry', 'factionFlag'
]);
function classifyAnimatedNode(obj) {
    const n = obj.name;
    if (!n) return 0;
    const pName = obj.parent ? (obj.parent.name || '') : '';
    if (n === "comanche_rotor" || n === "chinook_rotor1" || n.includes("avcomanche_prop") || n.includes("props01") ||
        (n === "PROPELLER01" && (pName.includes("comanche") || pName.includes("chinook"))) ||
        n === "ductedFan" || n === "avbattledr.fan") return 1;
    if (n === "chinook_rotor2" || n.includes("props02") || (n === "PROPELLER02" && pName.includes("chinook"))) return 2;
    if (ANIMATED_NODE_NAMES.has(n)) return 3;
    return 0;
}
let _animNodeFrame = 0;
function forEachAnimatedNode(cb) {
    _animNodeFrame++;
    if (!scene || !scene.children) return;
    const roots = scene.children;
    for (let r = 0; r < roots.length; r++) {
        const root = roots[r];
        if (!root || typeof root.traverse !== 'function') continue;
        const childLen = root.children ? root.children.length : 0;
        const ud = root.userData || (root.userData = {});
        let cache = ud._animNodes;
        if (!cache || ud._animChildCount !== childLen || ((_animNodeFrame + r) % 180 === 0)) {
            cache = [];
            root.traverse(obj => {
                const kind = classifyAnimatedNode(obj);
                if (kind) cache.push(obj, kind);
            });
            ud._animNodes = cache;
            ud._animChildCount = childLen;
        }
        for (let i = 0; i < cache.length; i += 2) cb(cache[i], cache[i + 1]);
    }
}

// =========================================================================
// PERF: Ground-unit separation using a uniform spatial hash grid.
// Only units in the same or adjacent cells are compared: ~O(N) instead of O(N^2).
// Behaviour matches the former pairwise pass: a parked unit yields only 15%,
// the moving unit takes 85%; parked units lock their targetPosition so they
// don't drive back into the overlap.
// =========================================================================
const _sepGrid = new Map();
function _isSepMoving(u) {
    if (u.taskState === 'Moving' || u.taskState === 'MovingToAttack') return true;
    const tx = u.targetPosition.x - u.mesh.position.x;
    const tz = u.targetPosition.z - u.mesh.position.z;
    return (tx * tx + tz * tz) > 1.44; // 1.2^2
}
function separateGroundUnits(list) {
    _sepGrid.clear();
    let maxR = 0.5;
    const ground = [];
    for (let i = 0; i < list.length; i++) {
        const u = list[i];
        if (u.isAir || u.garrisonedIn || u.health <= 0 || !u.mesh) continue;
        ground.push(u);
        if ((u.radius || 1.2) > maxR) maxR = u.radius || 1.2;
    }
    const cell = maxR * 2;
    for (let i = 0; i < ground.length; i++) {
        const p = ground[i].mesh.position;
        const key = (Math.floor(p.x / cell) + 32768) * 65536 + (Math.floor(p.z / cell) + 32768);
        let bucket = _sepGrid.get(key);
        if (!bucket) { bucket = []; _sepGrid.set(key, bucket); }
        bucket.push(i);
        ground[i]._sepIdx = i;
    }
    for (let i = 0; i < ground.length; i++) {
        const u1 = ground[i];
        const p1 = u1.mesh.position;
        const cx = Math.floor(p1.x / cell), cz = Math.floor(p1.z / cell);
        for (let ox = -1; ox <= 1; ox++) {
            for (let oz = -1; oz <= 1; oz++) {
                const bucket = _sepGrid.get((cx + ox + 32768) * 65536 + (cz + oz + 32768));
                if (!bucket) continue;
                for (let b = 0; b < bucket.length; b++) {
                    const j = bucket[b];
                    if (j <= i) continue; // each pair handled once
                    const u2 = ground[j];
                    const dx = p1.x - u2.mesh.position.x;
                    const dz = p1.z - u2.mesh.position.z;
                    const min = ((u1.radius || 1.2) + (u2.radius || 1.2)) * 0.95;
                    const d2 = dx * dx + dz * dz;
                    if (d2 >= min * min || d2 < 1e-8) continue;
                    const d2D = Math.sqrt(d2);
                    const pMag = (min - d2D) * 0.22; // Smooth damped spring separation
                    const nx = dx / d2D, nz = dz / d2D;
                    const m1 = _isSepMoving(u1), m2 = _isSepMoving(u2);
                    let s1 = 0.5, s2 = 0.5;
                    if (!m1 && m2) { s1 = 0.15; s2 = 0.85; }
                    else if (m1 && !m2) { s1 = 0.85; s2 = 0.15; }
                    p1.x += nx * pMag * s1; p1.z += nz * pMag * s1;
                    u2.mesh.position.x -= nx * pMag * s2; u2.mesh.position.z -= nz * pMag * s2;
                    if (!m1) u1.targetPosition.copy(p1);
                    if (!m2) u2.targetPosition.copy(u2.mesh.position);
                }
            }
        }
    }
}

const CRUSHER_TANK_SET = new Set(['crusader', 'paladin', 'battlemaster', 'overlord', 'marauder', 'scorpion', 'tank']);
const INFANTRY_TYPE_SET = new Set(['ranger', 'missiledefender', 'pathfinder', 'burton', 'redguard', 'tankhunter', 'hacker', 'lotus', 'blacklotus', 'rebel', 'rpg', 'terrorist', 'jarmen', 'hijacker', 'worker', 'infantry', 'rocket']);

function animate() {
            requestAnimationFrame(animate);

            const nowTime = performance.now();
            const dt = (window._lastCombatFrameTime && nowTime > window._lastCombatFrameTime)
                ? Math.min(0.1, (nowTime - window._lastCombatFrameTime) / 1000)
                : (1 / 60);
            window._lastCombatFrameTime = nowTime;
            combatDeltaScale = Math.max(0.25, Math.min(3.0, dt * 60));

            const animTime = nowTime * 0.003;

            // Keep shadow frustum centered near cameraTarget for crisp shadows & high FPS
            if (window._mainDirLight && typeof cameraTarget !== 'undefined') {
                const snapX = Math.round(cameraTarget.x / 8) * 8;
                const snapZ = Math.round(cameraTarget.z / 8) * 8;
                window._mainDirLight.position.set(snapX + 60, 80, snapZ + 40);
                if (window._mainDirLight.target) {
                    window._mainDirLight.target.position.set(snapX, 0, snapZ);
                    window._mainDirLight.target.updateMatrixWorld();
                }
            }

            // Host-authoritative 10 Hz WebRTC delta state sync & smooth client interpolation
            if (typeof isMultiplayerActive !== 'undefined' && isMultiplayerActive) {
                if (typeof isMultiplayerHost !== 'undefined' && isMultiplayerHost && typeof broadcastHostStateSync === 'function') {
                    broadcastHostStateSync();
                } else if (typeof isMultiplayerHost !== 'undefined' && !isMultiplayerHost) {
                    const blendList = (arr) => {
                        for (let i = 0; i < arr.length; i++) {
                            const ent = arr[i];
                            if (ent && ent._mpNetTarget && ent.mesh) {
                                ent.mesh.position.x += (ent._mpNetTarget.x - ent.mesh.position.x) * 0.25;
                                ent.mesh.position.z += (ent._mpNetTarget.z - ent.mesh.position.z) * 0.25;
                                ent.mesh.rotation.y += (ent._mpNetTarget.ry - ent.mesh.rotation.y) * 0.25;
                            }
                        }
                    };
                    blendList(units);
                    blendList(enemyUnits);
                }
            }

            // Update Weapon Effects & Particle System
            
            updateFXEngine();

            // Update Top-Right Match Clock (Zero Hour style)
            if (typeof isMatchActive !== 'undefined' && isMatchActive && typeof matchStartTime !== 'undefined' && matchStartTime > 0) {
                const totalSec = Math.floor((Date.now() - matchStartTime) / 1000);
                if (window._lastClockSec !== totalSec) {
                    window._lastClockSec = totalSec;
                    const hrs = String(Math.floor(totalSec / 3600)).padStart(2, '0');
                    const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
                    const secs = String(totalSec % 60).padStart(2, '0');
                    const clockEl = document.getElementById('match-clock');
                    if (clockEl) clockEl.textContent = `${hrs}:${mins}:${secs}`;
                }
            }

            // =========================================================
            // 0. ACTIVE SELECTION VISUALS & DYNAMIC TRAJECTORY LINES
            // =========================================================
            units.forEach(unit => {
                if (unit.selected && unit.selectionCircle) {
                    unit.selectionCircle.rotation.y += 0.02;
                    const d = Math.hypot(unit.targetPosition.x - unit.mesh.position.x, unit.targetPosition.z - unit.mesh.position.z);
                    if (d > 2.5 && unit.health > 0) {
                        if (!unit.trajectoryLine) {
                            const lineMat = new THREE.LineDashedMaterial({
                                color: 0x00ffcc,
                                dashSize: 1.0,
                                gapSize: 0.6,
                                transparent: true,
                                opacity: 0.85
                            });
                            const lineGeo = new THREE.BufferGeometry().setFromPoints([
                                unit.mesh.position.clone(),
                                unit.targetPosition.clone()
                            ]);
                            unit.trajectoryLine = new THREE.Line(lineGeo, lineMat);
                            scene.add(unit.trajectoryLine);
                        } else {
                            const p1 = unit.mesh.position.clone();
                            p1.y = (typeof getTerrainHeight === 'function' ? getTerrainHeight(p1.x, p1.z) : 0) + 0.25;
                            const p2 = unit.targetPosition.clone();
                            p2.y = (typeof getTerrainHeight === 'function' ? getTerrainHeight(p2.x, p2.z) : 0) + 0.25;
                            unit.trajectoryLine.geometry.setFromPoints([p1, p2]);
                            unit.trajectoryLine.computeLineDistances();
                        }
                    } else if (unit.trajectoryLine) {
                        scene.remove(unit.trajectoryLine);
                        unit.trajectoryLine.geometry.dispose();
                        unit.trajectoryLine.material.dispose();
                        unit.trajectoryLine = null;
                    }
                } else if (unit.trajectoryLine) {
                    scene.remove(unit.trajectoryLine);
                    unit.trajectoryLine.geometry.dispose();
                    unit.trajectoryLine.material.dispose();
                    unit.trajectoryLine = null;
                }
            });

            // =========================================================
            // ACTIVE STRUCTURE PRODUCTION QUEUES
            // =========================================================
            structures.forEach(structure => {
                // Nuclear Reactor overcharge green radioactive venting
                if (structure.type === 'nuclearReactor' && structure.overcharged && buildingTick % 24 === 0 && typeof spawnMuzzleFlash === 'function') {
                    const ventPos = structure.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.5, 4.8, (Math.random() - 0.5) * 2.5));
                    spawnMuzzleFlash(ventPos, 0x2ecc71, 0.45);
                }

                if (structure.productionQueue && structure.productionQueue.length > 0 && !structure.isBuilding && structure.health > 0) {
                    const item = structure.productionQueue[0];
                    item.progress = (item.progress || 0) + (dt / (item.buildTime || 4.0));

                    // Vehicle Production Animation: Electric welding sparks at factory assembly bay
                    if (structure.type === 'factory' && buildingTick % 16 === 0 && typeof spawnMuzzleFlash === 'function') {
                        const weldPos = structure.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 2.2, (Math.random() - 0.5) * 3));
                        spawnMuzzleFlash(weldPos, 0x00d2d3, 0.55);
                    }

                    if (item.progress >= 1.0) {
                        // Training complete! Deploy unit in neat rank-and-file rally grid
                        const rallyIdx = (structure._producedCount || 0);
                        structure._producedCount = rallyIdx + 1;

                        const isInf = typeof isInfantryType === 'function' && isInfantryType(item.type);
                        const isAir = ['comanche', 'chinook', 'raptor', 'aurora', 'stealthfighter', 'mig'].includes(item.type);

                        // Units exit through the building's front. Include the visual footprint
                        // scale so infantry does not start inside the barracks corners.
                        const exitAngle = structure.mesh?.rotation?.y ?? structure.rotationY ?? 0;
                        const footprint = typeof getStructureFootprint === 'function'
                            ? getStructureFootprint(structure.type)
                            : { depth: (structure.radius || 8) * 2 };
                        const buildingDepth = footprint.depth * ((structure.mesh && structure.mesh.scale && structure.mesh.scale.z) || 1);
                        const exitClearance = isInf ? 4.5 : 6.5;
                        const spawnDist = Math.max((structure.radius || 0) + exitClearance, buildingDepth / 2 + exitClearance);
                        const spawnX = structure.position.x + Math.sin(exitAngle) * spawnDist;
                        const spawnZ = structure.position.z + Math.cos(exitAngle) * spawnDist;
                        const spawnY = typeof getTerrainHeight === 'function' ? getTerrainHeight(spawnX, spawnZ) : 0;
                        const spawnPos = new THREE.Vector3(spawnX, spawnY, spawnZ);

                        const productionFaction = structure.faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa');
                        const newUnit = spawnUnit(item.type, spawnPos, productionFaction);

                        if (newUnit.isAir) {
                            if (structure.rallyPoint) {
                                const airSpread = ((rallyIdx % 6) - 2.5) * 4.5;
                                const targetAirX = structure.rallyPoint.x + airSpread;
                                const targetAirZ = structure.rallyPoint.z + Math.floor(rallyIdx / 6) * 4.5;
                                const targetAirY = (typeof getTerrainHeight === 'function' ? getTerrainHeight(targetAirX, targetAirZ) : 0) + (newUnit.mesh.userData.flightAltitude || 8.5);
                                newUnit.targetPosition.set(targetAirX, targetAirY, targetAirZ);
                                newUnit.patrolCenter.copy(structure.rallyPoint);
                                newUnit.airState = 'flying';
                                newUnit.taskState = 'Moving';
                            } else {
                                newUnit.targetPosition.copy(spawnPos);
                                newUnit.patrolCenter.copy(spawnPos);
                                newUnit.airState = (newUnit.type === 'comanche' || newUnit.type === 'chinook') ? 'hovering' : 'landed';
                                newUnit.taskState = 'Idle';
                            }
                        } else {
                            // Assign distinct staged formation slot at rally point with bridge routing
                            const baseRally = structure.rallyPoint
                                ? structure.rallyPoint.clone()
                                : structure.position.clone().add(new THREE.Vector3(Math.sin(exitAngle), 0, Math.cos(exitAngle)).multiplyScalar(spawnDist + (isInf ? 7.0 : 12.0)));

                            const slotPos = getUnoccupiedRallySlot(baseRally, newUnit.radius || 1.8, isInf, exitAngle);
                            newUnit.targetPosition.copy(slotPos);
                            newUnit.taskState = 'Moving';
                            newUnit.waypoints = [];
                            if (structure.rallyPoint && typeof findBridgeCrossingsForPath === 'function') {
                                const bridges = findBridgeCrossingsForPath(newUnit.mesh.position, slotPos, structure);
                                if (bridges && bridges.length > 0) {
                                    newUnit.waypoints = [...bridges.filter(Boolean), slotPos.clone()];
                                    newUnit.targetPosition.copy(newUnit.waypoints.shift());
                                }
                            }
                            if (structure.rallyPoint && newUnit.waypoints.length === 0 && typeof findNavigationPath === 'function') {
                                const navPath = findNavigationPath(newUnit.mesh.position, slotPos);
                                if (navPath && navPath.length > 1) {
                                    newUnit.targetPosition.copy(navPath[0]);
                                    newUnit.waypoints = navPath.slice(1);
                                }
                            }
                        }
                        if (typeof playUnitReadySound === 'function') {
                            playUnitReadySound(item.type, newUnit.faction || productionFaction);
                        } else {
                            playUSASound('construction');
                        }
                        showNotification('Unit ready: ' + item.name, 'success');
                        structure.productionQueue.shift();
                        updateSidebar();
                    }
                }
            });

            // =========================================================
            // ACTIVE DRONES, OVERLORD UPGRADES & HEROIC VETERANCY REGENERATION
            // =========================================================
            let cachedLivingUnits = null;
            const getLivingUnits = () => {
                if (!cachedLivingUnits) {
                    cachedLivingUnits = [...units, ...enemyUnits];
                }
                return cachedLivingUnits;
            };

            units.forEach(unit => {
                if (unit.health <= 0) return;

                // 1. Authentic SAGE Engine Veterancy Passive Regeneration (ActiveBody.cpp)
                if (buildingTick % 60 === 0 && unit.health < unit.maxHealth) {
                    if (unit.veterancy === 1) unit.health = Math.min(unit.maxHealth, unit.health + 2); // +2 HP/s
                    else if (unit.veterancy === 2) unit.health = Math.min(unit.maxHealth, unit.health + 4); // +4 HP/s
                    else if (unit.veterancy === 3) unit.health = Math.min(unit.maxHealth, unit.health + 6); // +6 HP/s
                }

                // 2. USA Vehicle Drones (Scout, Battle, Hellfire)
                if (unit.drone && unit.drone.mesh) {
                    const drone = unit.drone;
                    const dMesh = drone.mesh;
                    drone.timer = (drone.timer || 0) + 1;

                    if (drone.type === 'scout') {
                        // Scout Drone: continuous circular orbit around the host vehicle at high reconnaissance altitude
                        drone.orbitAngle = (drone.orbitAngle !== undefined ? drone.orbitAngle : Math.random() * Math.PI * 2) + 0.038;
                        const orbitRadius = 7.5;
                        const targetX = unit.mesh.position.x + Math.sin(drone.orbitAngle) * orbitRadius;
                        const targetZ = unit.mesh.position.z + Math.cos(drone.orbitAngle) * orbitRadius;
                        const targetY = unit.mesh.position.y + 8.5 + Math.sin(drone.orbitAngle * 1.5) * 0.35;

                        dMesh.position.x += (targetX - dMesh.position.x) * 0.12;
                        dMesh.position.z += (targetZ - dMesh.position.z) * 0.12;
                        dMesh.position.y += (targetY - dMesh.position.y) * 0.12;

                        // Tangential heading facing orbit direction + inward banking roll
                        dMesh.rotation.y = drone.orbitAngle + Math.PI / 2;
                        dMesh.rotation.z = -0.22;
                        dMesh.rotation.x = 0.08;

                        // Fast spinning reconnaissance propeller (PERF: prop nodes cached once)
                        if (!drone._propNodes) {
                            drone._propNodes = [];
                            dMesh.traverse(c => { if (c.name && c.name.toLowerCase().includes('prop')) drone._propNodes.push(c); });
                        }
                        for (let pi = 0; pi < drone._propNodes.length; pi++) drone._propNodes[pi].rotation.y += 0.65;

                        // Scout Drone Function: +50% Sight/Scan Range & Active Stealth/Mine Detection within 32 units
                        unit.detectsStealth = true;
                        if (unit._baseScanRange) unit.scanRange = Math.round(unit._baseScanRange * 1.5);
                        if (drone.timer % 20 === 0) {
                            const detectR2 = 32.0 * 32.0;
                            const uX = unit.mesh.position.x, uZ = unit.mesh.position.z;
                            enemyUnits.forEach(eu => {
                                if (eu.health > 0 && eu.mesh && !isFriendly(unit, eu)) {
                                    const dx = eu.mesh.position.x - uX, dz = eu.mesh.position.z - uZ;
                                    if (dx * dx + dz * dz <= detectR2) {
                                        eu.isStealthed = false;
                                        eu.revealedUntil = buildingTick + 120;
                                    }
                                }
                            });
                            enemyStructures.forEach(es => {
                                if (es.health > 0 && es.position && !isFriendly(unit, es)) {
                                    const dx = es.position.x - uX, dz = es.position.z - uZ;
                                    if (dx * dx + dz * dz <= detectR2) {
                                        es.isStealthed = false;
                                        es.revealedUntil = buildingTick + 120;
                                    }
                                }
                            });
                        }
                    } else if (drone.type === 'hellfire') {
                        // Hellfire Drone: flies like the recon drone with horizontal flight attitude, circling the host vehicle
                        if (drone.orbitAngle === undefined) drone.orbitAngle = Math.random() * Math.PI * 2;
                        drone.orbitAngle += 0.030 + Math.sin(drone.timer * 0.015) * 0.005;

                        const orbitRadius = 6.2 + Math.sin(drone.timer * 0.02) * 0.8;
                        const targetX = unit.mesh.position.x + Math.sin(drone.orbitAngle) * orbitRadius;
                        const targetZ = unit.mesh.position.z + Math.cos(drone.orbitAngle) * orbitRadius;
                        const targetY = unit.mesh.position.y + 6.8 + Math.sin(drone.timer * 0.05) * 0.35;

                        dMesh.position.x += (targetX - dMesh.position.x) * 0.11;
                        dMesh.position.z += (targetZ - dMesh.position.z) * 0.11;
                        dMesh.position.y += (targetY - dMesh.position.y) * 0.11;

                        // Fly like recon drone: horizontal orientation facing flight tangent, slight nose trim, gentle banking roll
                        dMesh.rotation.y = drone.orbitAngle + Math.PI / 2;
                        dMesh.rotation.x = 0.08 + Math.sin(drone.timer * 0.04) * 0.03;
                        dMesh.rotation.z = -0.18 + Math.sin(drone.timer * 0.05) * 0.04;
                    } else {
                        // Battle Drone: oriented downwards (~28 degrees down pitch) towards ground targets, hovering & wandering
                        if (drone.orbitAngle === undefined) drone.orbitAngle = Math.random() * Math.PI * 2;
                        drone.orbitAngle += 0.020 + Math.sin(drone.timer * 0.015) * 0.008;

                        const dynamicDist = 4.4 + Math.sin(drone.timer * 0.035) * 1.2;
                        const targetX = unit.mesh.position.x + Math.sin(drone.orbitAngle) * dynamicDist + Math.cos(drone.timer * 0.02) * 0.7;
                        const targetZ = unit.mesh.position.z + Math.cos(drone.orbitAngle) * dynamicDist + Math.sin(drone.timer * 0.025) * 0.7;
                        const targetY = unit.mesh.position.y + 4.8 + Math.sin(drone.timer * 0.08) * 0.32;

                        dMesh.position.x += (targetX - dMesh.position.x) * 0.10;
                        dMesh.position.z += (targetZ - dMesh.position.z) * 0.10;
                        dMesh.position.y += (targetY - dMesh.position.y) * 0.10;

                        // Downward pitch (~28 degrees down) towards battlefield
                        dMesh.rotation.y = drone.orbitAngle + Math.PI / 2;
                        dMesh.rotation.x = 0.48 + Math.sin(drone.timer * 0.06) * 0.04;
                        dMesh.rotation.z = Math.sin(drone.timer * 0.07) * 0.08;

                        // Ducted lift fan spin (PERF: fan nodes cached once)
                        if (!drone._fanNodes) {
                            drone._fanNodes = [];
                            dMesh.traverse(c => {
                                if (c.name && (c.name.toLowerCase().includes('fan') || c.name.toLowerCase().includes('ducted'))) drone._fanNodes.push(c);
                            });
                        }
                        for (let fi = 0; fi < drone._fanNodes.length; fi++) drone._fanNodes[fi].rotation.y += 0.55;

                        // Swiveling underbelly gun (TURRET01 & TURRETEL01)
                        const dTurret = getCachedNode(dMesh, 'droneTurret') || getCachedNode(dMesh, 'turretSystem');
                        const dElev = getCachedNode(dMesh, 'droneTurretElevation') || getCachedNode(dMesh, 'TURRETEL01');
                        if (dTurret) {
                            const dmX = dMesh.position.x;
                            const dmZ = dMesh.position.z;
                            const maxDistSq = 18.0 * 18.0;
                            const enemyInf = getLivingUnits().find(e => {
                                if (e.health <= 0 || e.isAir || isFriendly(unit, e)) return false;
                                const dx = e.mesh.position.x - dmX;
                                const dz = e.mesh.position.z - dmZ;
                                return (dx * dx + dz * dz) <= maxDistSq;
                            });

                            if (enemyInf) {
                                // Swivel directly towards targeted hostile infantry
                                const ex = enemyInf.mesh.position.x;
                                const ez = enemyInf.mesh.position.z;
                                const targetAngle = Math.atan2(ex - dmX, ez - dmZ);
                                let relYaw = targetAngle - dMesh.rotation.y;
                                while (relYaw > Math.PI) relYaw -= Math.PI * 2;
                                while (relYaw < -Math.PI) relYaw += Math.PI * 2;
                                const clampedYaw = Math.max(-1.3, Math.min(1.3, relYaw));
                                dTurret.rotation.y += (clampedYaw - dTurret.rotation.y) * 0.20;

                                if (dElev) {
                                    const dy = enemyInf.mesh.position.y - dMesh.position.y;
                                    const dist = Math.hypot(ex - dmX, ez - dmZ);
                                    const angleElev = Math.atan2(-dy, dist) - dMesh.rotation.x;
                                    const clampedElev = Math.max(-0.4, Math.min(0.4, angleElev));
                                    dElev.rotation.x += (clampedElev - dElev.rotation.x) * 0.20;
                                }
                            } else {
                                // Idle search scan: gun swivels smoothly left and right like an automated sentry
                                const sweepYaw = Math.sin(drone.timer * 0.05) * 0.38;
                                const sweepPitch = Math.sin(drone.timer * 0.07) * 0.12;
                                dTurret.rotation.y += (sweepYaw - dTurret.rotation.y) * 0.10;
                                if (dElev) {
                                    dElev.rotation.x += (sweepPitch - dElev.rotation.x) * 0.10;
                                }
                            }
                        }
                    }

                    // Battle Drone: Repairs host vehicle (+8 HP/s stationary, +5 HP/s moving, with welding arc & sparks) + fires micro-MG at hostile targets
                    if (drone.type === 'battle') {
                        if (drone.timer % 60 === 0 && unit.health < unit.maxHealth) {
                            const isMoving = Math.hypot(unit.targetPosition.x - unit.mesh.position.x, unit.targetPosition.z - unit.mesh.position.z) > 0.8;
                            const repairAmt = isMoving ? 5 : 8;
                            unit.health = Math.min(unit.maxHealth, unit.health + repairAmt);
                            const hullPos = unit.mesh.position.clone().add(new THREE.Vector3(0, 1.1, 0));
                            if (typeof spawnLaserBeam === 'function') {
                                spawnLaserBeam(dMesh.position.clone(), hullPos, 0x00d2d3, 1.5);
                            }
                            if (typeof spawnSparks === 'function') {
                                spawnSparks(hullPos, 0x00f2fe, 5);
                            }
                            if (unit.selected && typeof updateSidebar === 'function') updateSidebar();
                        }
                        if (drone.timer % 35 === 0) {
                            const dmX = dMesh.position.x;
                            const dmZ = dMesh.position.z;
                            const maxDistSq = 18.0 * 18.0;
                            const enemyInf = getLivingUnits().find(e => {
                                if (e.health <= 0 || e.isAir || isFriendly(unit, e)) return false;
                                const dx = e.mesh.position.x - dmX;
                                const dz = e.mesh.position.z - dmZ;
                                return (dx * dx + dz * dz) <= maxDistSq;
                            });
                            if (enemyInf) {
                                let muzzlePos = dMesh.position.clone();
                                const muzzleNode = getCachedNode(dMesh, 'MUZZLE01');
                                if (muzzleNode) muzzleNode.getWorldPosition(muzzlePos);
                                spawnBulletTracer(muzzlePos, enemyInf.mesh.position, 0x00d2d3, 1.5);
                                playAudio('machine_gun');
                                applyCalculatedDamage(unit, enemyInf, 16, 'SMALL_ARMS');
                            }
                        }
                    }

                    // Hellfire Drone: Launches guided armor-piercing Hellfire missiles at hostile vehicles & structures (credits kills to host!)
                    if (drone.type === 'hellfire') {
                        if (drone.timer % 80 === 0) {
                            const dmX = dMesh.position.x;
                            const dmZ = dMesh.position.z;
                            const maxDistSq = 24.0 * 24.0;
                            let hellfireTarget = getLivingUnits().find(e => {
                                if (e.health <= 0 || e.isAir || isFriendly(unit, e)) return false;
                                const dx = e.mesh.position.x - dmX;
                                const dz = e.mesh.position.z - dmZ;
                                return (dx * dx + dz * dz) <= maxDistSq;
                            });
                            if (!hellfireTarget) {
                                hellfireTarget = enemyStructures.find(es => {
                                    if (es.health <= 0 || !es.position || isFriendly(unit, es)) return false;
                                    const dx = es.position.x - dmX;
                                    const dz = es.position.z - dmZ;
                                    return (dx * dx + dz * dz) <= maxDistSq;
                                });
                            }
                            if (hellfireTarget) {
                                let launchPos = dMesh.position.clone();
                                const pylonNode = getCachedNode(dMesh, 'WEAPONA');
                                if (pylonNode) pylonNode.getWorldPosition(launchPos);
                                const tPos = (hellfireTarget.position || hellfireTarget.mesh.position).clone();
                                spawnRocketProjectile(launchPos, tPos, false, false, {
                                    attacker: unit,
                                    target: hellfireTarget,
                                    damage: 48,
                                    damageType: 'ARMOR_PIERCING',
                                    splashRadius: 1.5
                                });
                                playAudio('missile_launch');
                            }
                        }
                    }
                }

                // 3. China Overlord Upgrades Active Logic
                if (unit.type === 'overlord' && unit.overlordUpgrade) {
                    unit.upgTimer = (unit.upgTimer || 0) + 1;
                    const uX = unit.mesh.position.x;
                    const uZ = unit.mesh.position.z;

                    // Overlord Bunker: Garrisoned troops or default bunker crew shoot 360 degrees
                    if (unit.overlordUpgrade === 'bunker' && unit.upgTimer % 45 === 0) {
                        const maxDistSq = 20.0 * 20.0;
                        const target = getLivingUnits().find(e => {
                            if (e.health <= 0 || isFriendly(unit, e)) return false;
                            const dx = e.mesh.position.x - uX;
                            const dz = e.mesh.position.z - uZ;
                            return (dx * dx + dz * dz) <= maxDistSq;
                        });
                        if (target) {
                            spawnBulletTracer(unit.mesh.position, target.mesh.position, 0xf39c12, 2.5);
                            playAudio('china_cannon', {}, 'china');
                            applyCalculatedDamage(unit, target, 24, 'SMALL_ARMS');
                        }
                    }

                    // Overlord Gatling Cannon: Stealth detection (firing handled by processCombatScanning)
                    if (unit.overlordUpgrade === 'gatling') {
                        unit.detectsStealth = true;
                    }

                    // Overlord Propaganda / Speaker Tower: Heals nearby allies (+4 HP/s, +6 HP/s with Subliminal Messaging) and grants Horde fire-rate buff (+25%)
                    if ((unit.overlordUpgrade === 'propaganda' || unit.overlordUpgrade === 'speaker') && unit.upgTimer % 60 === 0) {
                        const maxDistSq = 20.0 * 20.0;
                        const hasSub = (typeof researchedTechs !== 'undefined' && researchedTechs.has('subliminal'));
                        const healAmt = hasSub ? 6 : 4;
                        if (typeof spawnPropagandaPulseRing === 'function') {
                            spawnPropagandaPulseRing(unit.mesh.position, hasSub);
                        }
                        const myTeamList = unit.isAI ? enemyUnits : units;
                        myTeamList.forEach(ally => {
                            if (ally.health > 0 && ally.mesh) {
                                const dx = ally.mesh.position.x - uX;
                                const dz = ally.mesh.position.z - uZ;
                                if ((dx * dx + dz * dz) <= maxDistSq) {
                                    ally.health = Math.min(ally.maxHealth, ally.health + healAmt);
                                    ally.isHordeActive = true;
                                }
                            }
                        });
                    }
                }

                // 4. USA Ambulance Field Medic & Decontamination Aura
                if (unit.type === 'ambulance' && unit.health > 0 && buildingTick % 30 === 0) {
                    const ambX = unit.mesh.position.x, ambZ = unit.mesh.position.z;
                    const healR2 = 16.0 * 16.0;
                    const myTeamList = unit.isAI ? enemyUnits : units;
                    myTeamList.forEach(ally => {
                        if (ally.health > 0 && ally.health < ally.maxHealth && ally.mesh) {
                            const dx = ally.mesh.position.x - ambX, dz = ally.mesh.position.z - ambZ;
                            if (dx * dx + dz * dz <= healR2) {
                                ally.health = Math.min(ally.maxHealth, ally.health + 6);
                            }
                        }
                    });
                    if (unit.garrisoned && unit.garrisoned.length > 0) {
                        unit.garrisoned.forEach(p => {
                            if (p.health > 0 && p.health < p.maxHealth) p.health = Math.min(p.maxHealth, p.health + 8);
                        });
                    }
                }

                // 5. China Hacker Autonomous Internet Cash Hacking (when stationary OR inside Internet Center)
                if (unit.type === 'hacker' && unit.health > 0 && !unit.combatTarget) {
                    const inInternetCenter = !!(unit.garrisonedIn && unit.garrisonedIn.type === 'internetCenter' && unit.garrisonedIn.health > 0 && !unit.garrisonedIn.isBuilding);
                    const moveDist = Math.hypot(unit.targetPosition.x - unit.mesh.position.x, unit.targetPosition.z - unit.mesh.position.z);
                    if (inInternetCenter || moveDist < 0.8) {
                        unit._isHacking = true;
                        // Show deployed hacking terminal + glowing green uplink ring when stationary outside
                        if (!inInternetCenter && unit.mesh && !unit._hackVisual && typeof THREE !== 'undefined' && typeof THREE.CylinderGeometry === 'function') {
                            const hGrp = new THREE.Group();
                            const matGlow = new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
                            const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 18), matGlow);
                            ring.rotation.x = -Math.PI / 2;
                            ring.position.y = 0.12;
                            const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), matGlow);
                            mast.position.set(0.55, 0.9, 0.45);
                            const dish = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.28, 8), matGlow);
                            dish.rotation.x = Math.PI * 0.75;
                            dish.position.set(0.55, 1.85, 0.45);
                            hGrp.add(ring, mast, dish);
                            unit.mesh.add(hGrp);
                            unit._hackVisual = hGrp;
                        }
                        if (unit._hackVisual) {
                            unit._hackVisual.visible = !inInternetCenter;
                            if (!inInternetCenter) unit._hackVisual.rotation.y += 0.04;
                        }
                        unit._hackTimer = (unit._hackTimer || 0) + 1;
                        const hackCycle = inInternetCenter ? 40 : 60; // Internet Center accelerates hacking (+50% faster + boosted yield)
                        if (unit._hackTimer >= hackCycle) {
                            unit._hackTimer = 0;
                            const vetRates = inInternetCenter ? [8, 9, 12, 15] : [5, 6, 8, 10];
                            const vetIdx = Math.min(3, Math.max(0, unit.veterancy || 0));
                            const hackGain = vetRates[vetIdx];
                            unit._hackXp = (unit._hackXp || 0) + 1;
                            if (unit._hackXp >= 15 && (unit.veterancy || 0) < 1) { unit.veterancy = 1; }
                            else if (unit._hackXp >= 35 && (unit.veterancy || 0) < 2) { unit.veterancy = 2; }
                            else if (unit._hackXp >= 60 && (unit.veterancy || 0) < 3) { unit.veterancy = 3; }
                            if (!unit.isAI) {
                                playerResources += hackGain;
                                const cashOrigin = inInternetCenter
                                    ? (unit.garrisonedIn.position || unit.garrisonedIn.mesh.position).clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.5, 4.5, (Math.random() - 0.5) * 2.5))
                                    : unit.mesh.position.clone().add(new THREE.Vector3(0, 2.2, 0));
                                if (typeof spawnFloatingCashNumber === 'function') spawnFloatingCashNumber(cashOrigin, hackGain);
                                if (typeof updateHUD === 'function') updateHUD();
                            }
                        }
                    } else {
                        unit._isHacking = false;
                        if (unit._hackVisual) unit._hackVisual.visible = false;
                    }
                } else if (unit._hackVisual) {
                    unit._hackVisual.visible = false;
                }

                // 6. Dozer & Worker Mine / Demo Trap Sweeping + China Troop Crawler Stealth Detection
                if ((unit.type === 'dozer' || unit.type === 'worker' || unit.type === 'crawler') && unit.health > 0 && buildingTick % 30 === 0) {
                    const sweepR2 = (unit.type === 'crawler' ? 28.0 * 28.0 : 12.0 * 12.0);
                    const uX = unit.mesh.position.x, uZ = unit.mesh.position.z;
                    enemyUnits.forEach(eu => {
                        if (eu.health > 0 && eu.mesh && !isFriendly(unit, eu)) {
                            const dx = eu.mesh.position.x - uX, dz = eu.mesh.position.z - uZ;
                            if (dx * dx + dz * dz <= sweepR2) {
                                eu.isStealthed = false;
                                eu.revealedUntil = buildingTick + 90;
                            }
                        }
                    });
                    if ((unit.type === 'dozer' || unit.type === 'worker') && typeof landmines !== 'undefined' && landmines.length > 0) {
                        for (let mi = landmines.length - 1; mi >= 0; mi--) {
                            const mine = landmines[mi];
                            if (mine && !isFriendly(unit, mine) && mine.position) {
                                const dx = mine.position.x - uX, dz = mine.position.z - uZ;
                                if (dx * dx + dz * dz <= 12.0 * 12.0) {
                                    if (mine.mesh) scene.remove(mine.mesh);
                                    landmines.splice(mi, 1);
                                    if (!unit.isAI && typeof showNotification === 'function') {
                                        showNotification(`${unit.type.toUpperCase()} disarmed hostile landmine!`, 'info');
                                    }
                                }
                            }
                        }
                    }
                }

                // 7. Unmanned Vehicle Re-Crewing (Any infantry touching a vehicle whose driver was sniped by Jarmen Kell captures it!)
                if (typeof isInfantryType === 'function' && isInfantryType(unit.type) && unit.health > 0 && !unit.garrisonedIn) {
                    const allVehicles = [...enemyUnits, ...units].filter(v => v.isUnmanned && v.health > 0 && v.mesh);
                    for (let uv of allVehicles) {
                        if (unit.mesh.position.distanceTo(uv.mesh.position) <= (uv.radius || 2.5) + 2.0) {
                            if (enemyUnits.includes(uv) && !unit.isAI) {
                                enemyUnits.splice(enemyUnits.indexOf(uv), 1);
                                units.push(uv);
                            } else if (units.includes(uv) && unit.isAI) {
                                units.splice(units.indexOf(uv), 1);
                                enemyUnits.push(uv);
                            }
                            uv.teamId = unit.teamId;
                            uv.ownerId = unit.ownerId;
                            uv.isAI = unit.isAI;
                            uv.isUnmanned = false;
                            uv.disabledUntil = 0;
                            uv.combatTarget = null;
                            unit.health = 0;
                            if (!unit.isAI && typeof showNotification === 'function') {
                                showNotification(`${unit.type.toUpperCase()} crewed and captured unmanned ${uv.type.toUpperCase()}!`, 'success');
                            }
                            break;
                        }
                    }
                }
            });


            // Water surface ripple animation
            if (waterMesh) {
                const baseWaterY = (currentMapType === 'jungle' ? -1.2 : currentMapType === 'snow' ? -1.8 : currentMapType === 'city' ? -2.2 : -0.6);
                waterMesh.position.y = baseWaterY + Math.sin(animTime * 2.5) * 0.05;
            }

            // Dynamic military & building animations (Authentic C&C Generals building movements)
            // PERF: instead of traversing the whole scene graph every frame, each top-level
            // scene object caches its list of animated sub-nodes (rebuilt only if its children change).
            forEachAnimatedNode((obj, kind) => {
                if (kind === 1) {
                    obj.rotation.y += 0.45;
                } else if (kind === 2) {
                    obj.rotation.y -= 0.45;
                } else if (obj.name === "radarDish" || obj.name === "radarDish2") {
                    // Continuous radar dish / array rotation
                    obj.rotation.y += 0.025;
                } else if (obj.name === "hazardBeacon") {
                    // Alert strobes blinking
                    obj.visible = (Math.floor(animTime * 4) % 2 === 0);
                } else if (obj.name === "fusionCore" || obj.name === "nukeCore") {
                    // Reactor core pulsing energy
                    const pulse = 1.0 + Math.sin(animTime * 4) * 0.18;
                    obj.scale.set(pulse, pulse, pulse);
                } else if (obj.name === "pumpjackArm") {
                    // Tech Oil Derrick walking-beam pumpjack rocking motion
                    obj.rotation.x = Math.sin(animTime * 2.2) * 0.28;
                } else if (obj.name === "particleAcceleratorRing") {
                    // Particle Cannon magnetic accelerator spinning ring
                    obj.rotation.z += 0.04;
                } else if (obj.name === "particleEmitter") {
                    // Particle Cannon pulsating ion lens
                    const pPulse = 1.0 + Math.sin(animTime * 5.0) * 0.14;
                    obj.scale.set(pPulse, pPulse, pPulse);
                } else if (obj.name === "nukeTip") {
                    // Thermonuclear missile cryogenic breathing elevation
                    obj.position.y = 1.8 + Math.sin(animTime * 1.5) * 0.25;
                } else if (obj.name === "nukeBlastDoorL") {
                    const openAmt = Math.max(0, Math.sin(animTime * 1.5)) * 0.35;
                    obj.position.x = -2.2 - openAmt;
                } else if (obj.name === "nukeBlastDoorR") {
                    const openAmt = Math.max(0, Math.sin(animTime * 1.5)) * 0.35;
                    obj.position.x = 2.2 + openAmt;
                } else if (obj.name === "scudGantry") {
                    // SCUD Storm launch gantry breathing angle
                    obj.rotation.x = -Math.PI / 5.5 + Math.sin(animTime * 1.2) * 0.03;
                } else if (obj.name === "factionFlag") {
                    // Barracks cloth flagpole flag waving in wind
                    obj.rotation.y = Math.sin(animTime * 3.8) * 0.18;
                }
            });

            // Smooth cruising flight altitude for aircraft
            units.forEach(u => {
                if (u.isAir && u.health > 0) {
                    const flightY = u.mesh.userData.flightAltitude || 8.5;
                    u.mesh.position.y += (flightY - u.mesh.position.y) * 0.06;
                }
            });

            // Animate Cold Fusion Reactor pulsing blue rods
            const pulseBlue = 1.3 + Math.sin(animTime * 4.0) * 0.45;
            structures.forEach(s => {
                if ((s.type === 'power' || s.type === 'coldFusionReactor') && s.mesh && s.health > 0) {
                    // PERF: cache the pulsing rod meshes once instead of traversing every frame
                    if (!s._pulseMeshes) {
                        s._pulseMeshes = [];
                        s.mesh.traverse(c => {
                            if (c.isMesh && c.name && c.name.toLowerCase().includes('cylinder')) s._pulseMeshes.push(c);
                        });
                    }
                    for (let i = 0; i < s._pulseMeshes.length; i++) {
                        const c = s._pulseMeshes[i];
                        if (c.material && c.material.emissiveIntensity !== undefined) {
                            c.material.emissiveIntensity = pulseBlue;
                        }
                    }
                }
            });

            processPointDefenseLasers();
            processScrapCrateCollection();
            processCameraKeyboardPanning();
            updateTurretSystems();
            updateFogOfWar();
            processEnemyAIEngine();
            processEnemyMovement();
            processEnemyCombat();
            assignBuildersToConstruction();
            processBuildingFunctions();

            let constructionActive = false;
            const allConstructing = [...structures, ...(typeof enemyStructures !== 'undefined' ? enemyStructures : [])];
            allConstructing.forEach(s => {
                if (!s || !s.isBuilding || s.health <= 0) return;
                
                if (s.dozerRef && s.dozerRef.health > 0) {
                    const dPos = s.dozerRef.mesh.position;
                    const dist2D = Math.hypot(dPos.x - s.position.x, dPos.z - s.position.z);
                    const buildThreshold = s.radius + (s.dozerRef.radius || 1.8) + 3.5;
                    if (s.dozerRef.taskState === 'Building' || dist2D <= buildThreshold) {
                        s.dozerRef.taskState = 'Building';
                        const buildRate = (s.type === 'supplyDrop') ? (100 / 2700) : 0.35; // 45s build time for Supply Drop Zone
                        s.buildProgress += buildRate * combatDeltaScale;
                        if (s.mesh) {
                            if (s._baseScaleY === undefined) s._baseScaleY = s.mesh.scale.y || 1;
                            const pct = Math.min(1, Math.max(0, s.buildProgress / 100));
                            s.mesh.scale.y = s._baseScaleY * (0.18 + 0.82 * pct);
                            s.mesh.traverse(c => { if (c.isMesh && c.material && c.material.transparent) c.material.opacity = 0.28 + 0.62 * pct; });
                        }

                        // Rotate builder to face the building under construction
                        const toX = s.position.x - dPos.x;
                        const toZ = s.position.z - dPos.z;
                        if (Math.hypot(toX, toZ) > 0.05) {
                            s.dozerRef.mesh.rotation.y = Math.atan2(-toZ, toX) + Math.PI / 2;
                        }
                        
                        const isAiStruct = !!s.isAI || (s.ownerId && s.ownerId !== 'player');
                        if (!isAiStruct) {
                            constructionActive = true;
                            const wp = s.position.clone(); wp.y += 4; wp.project(camera);
                            const sX = (wp.x * 0.5 + 0.5) * window.innerWidth; const sY = (-(wp.y * 0.5) + 0.5) * window.innerHeight;
                            
                            if (wp.z >= -1 && wp.z <= 1) {
                                progressContainer.style.display = 'block';
                                progressContainer.style.left = sX + 'px'; progressContainer.style.top = sY + 'px';
                                progressFill.style.width = Math.min(100, s.buildProgress) + '%';
                            }
                        }

                        if (s.buildProgress >= 100) {
                            s.isBuilding = false;
                            s.buildProgress = 100;
                            if (s.mesh && s._baseScaleY !== undefined) s.mesh.scale.y = s._baseScaleY;
                            if (s.dozerRef) {
                                const finishedBuilder = s.dozerRef;
                                finishedBuilder.taskState = 'Idle';
                                finishedBuilder.targetStructure = null;
                                s.dozerRef = null;
                                // Advance Shift-queued construction orders if any remain
                                if (finishedBuilder.buildQueue && finishedBuilder.buildQueue.length > 0 && typeof assignDozerToStructure === 'function') {
                                    while (finishedBuilder.buildQueue.length > 0) {
                                        const nextStruct = finishedBuilder.buildQueue.shift();
                                        if (nextStruct && nextStruct.health > 0 && nextStruct.isBuilding) {
                                            assignDozerToStructure(finishedBuilder, nextStruct);
                                            break;
                                        }
                                    }
                                }
                            }
                            s.mesh.traverse(child => { if (child.isMesh && child.savedMaterial) child.material = child.savedMaterial; });
                            const bFaction = s.faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa');
                            if (['particleCannon', 'nukeSilo', 'scudStorm'].includes(s.type)) {
                                s.swMaxCooldown = (typeof getSuperweaponMaxCooldownTicks === 'function') ? getSuperweaponMaxCooldownTicks(s.type) : 7200;
                                s.cooldownUntil = buildingTick + s.swMaxCooldown;
                                s._readyAnnounced = false;
                                if (typeof playSuperweaponEvaAlert === 'function') {
                                    playSuperweaponEvaAlert(s.type, 'detected', typeof selectedFaction !== 'undefined' ? selectedFaction : bFaction);
                                }
                                if (typeof updateSuperweaponTimersHUD === 'function') updateSuperweaponTimersHUD();
                            } else if (!isAiStruct && typeof playBuildingCompleteSound === 'function') {
                                playBuildingCompleteSound(s.type, bFaction);
                            }
                            if (s.type !== 'supplyCenter' && !isAiStruct) {
                                showNotification(`${(s.type || 'Building').toUpperCase()} construction completed!`, 'success');
                            }

                            // Automatic Harvester Deployment upon Supply Center / Stash completion (Player & AI)
                            if (!s.spawnedHarvester) {
                                s.spawnedHarvester = true;
                                if (isAiStruct && typeof window !== 'undefined') {
                                    window.activeEnemyColorHex = (window.aiColorMap && window.aiColorMap[s.ownerId]) || window.activeEnemyColorHex || 0xdc2626;
                                }
                                if (s.type === 'supplyCenter') {
                                    if (bFaction === 'usa') {
                                        const spawnPos = s.position.clone().add(new THREE.Vector3(0, 4.5, 7.5));
                                        const chinook = isAiStruct
                                            ? (typeof spawnEnemyUnit === 'function' ? spawnEnemyUnit('chinook', spawnPos, null, 'usa') : null)
                                            : (typeof spawnUnit === 'function' ? spawnUnit('chinook', spawnPos) : null);
                                        if (chinook) {
                                            chinook.teamId = s.teamId || (typeof playerTeamId !== 'undefined' ? playerTeamId : 1);
                                            chinook.ownerId = s.ownerId || (isAiStruct ? 'ai_1' : 'player');
                                            chinook.isAI = isAiStruct;
                                            chinook.aiState = 'MovingToDock';
                                            chinook.taskState = 'Idle';
                                            chinook.airState = 'hovering';
                                            chinook.supplyTarget = (typeof findNearestSupplyPoint === 'function') ? findNearestSupplyPoint(chinook.mesh.position) : null;
                                            if (chinook.supplyTarget) {
                                                chinook.targetPosition.copy(chinook.supplyTarget.position);
                                                chinook.airState = 'flying';
                                            }
                                            if (!isAiStruct) {
                                                if (typeof playUnitReadyAudio === 'function') playUnitReadyAudio('chinook', 'usa');
                                                showNotification('USA Supply Depot constructed! Chinook transport deployed to harvest supplies.', 'success');
                                            }
                                        }
                                    } else if (bFaction === 'china') {
                                        const spawnPos = s.position.clone().add(new THREE.Vector3(0, 0, 7.5));
                                        spawnPos.y = (typeof getTerrainHeight === 'function') ? getTerrainHeight(spawnPos.x, spawnPos.z) : spawnPos.y;
                                        const truck = isAiStruct
                                            ? (typeof spawnEnemyUnit === 'function' ? spawnEnemyUnit('truck', spawnPos, null, 'china') : null)
                                            : (typeof spawnUnit === 'function' ? spawnUnit('truck', spawnPos) : null);
                                        if (truck) {
                                            truck.teamId = s.teamId || 1;
                                            truck.ownerId = s.ownerId || (isAiStruct ? 'ai_1' : 'player');
                                            truck.isAI = isAiStruct;
                                            truck.aiState = 'MovingToDock';
                                            truck.taskState = 'Idle';
                                            truck.supplyTarget = (typeof findNearestSupplyPoint === 'function') ? findNearestSupplyPoint(truck.mesh.position) : null;
                                            if (truck.supplyTarget) truck.targetPosition.copy(truck.supplyTarget.position);
                                            if (!isAiStruct && typeof playUnitReadyAudio === 'function') playUnitReadyAudio('truck', 'china');
                                        }
                                    }
                                } else if (s.type === 'supplyStash') {
                                    const spawnPos = s.position.clone().add(new THREE.Vector3(0, 0, 7.0));
                                    spawnPos.y = (typeof getTerrainHeight === 'function') ? getTerrainHeight(spawnPos.x, spawnPos.z) : spawnPos.y;
                                    const worker = isAiStruct
                                        ? (typeof spawnEnemyUnit === 'function' ? spawnEnemyUnit('worker', spawnPos, null, 'gla') : null)
                                        : (typeof spawnUnit === 'function' ? spawnUnit('worker', spawnPos) : null);
                                    if (worker) {
                                        worker.teamId = s.teamId || 1;
                                        worker.ownerId = s.ownerId || (isAiStruct ? 'ai_1' : 'player');
                                        worker.isAI = isAiStruct;
                                        worker.aiState = 'MovingToDock';
                                        worker.taskState = 'Idle';
                                        worker.supplyTarget = (typeof findNearestSupplyPoint === 'function') ? findNearestSupplyPoint(worker.mesh.position) : null;
                                        if (worker.supplyTarget) worker.targetPosition.copy(worker.supplyTarget.position);
                                        if (!isAiStruct && typeof playUnitReadyAudio === 'function') playUnitReadyAudio('worker', 'gla');
                                    }
                                }
                            }
                        }
                    }
                }
            });
            if (!constructionActive) progressContainer.style.display = 'none';

            // Ported from SupplyTruckAIUpdate.cpp & AIDock.cpp: Multi-slot harvester gathering for both Player and AI
            const updateHarvesterUnit = (unit, isAIUnit = false) => {
                if (!unit || unit.health <= 0 || !unit.mesh) return;
                if ((unit.type !== 'truck' && unit.type !== 'worker' && unit.type !== 'chinook') || unit.taskState !== 'Idle') return;
                const cargoHold = getCachedNode(unit.mesh, "cargoHold");
                switch (unit.aiState) {
                    case 'MovingToDock': {
                        if (!unit.supplyTarget || unit.supplyTarget.stock <= 0) {
                            unit.supplyTarget = findNearestSupplyPoint(unit.mesh.position);
                        }
                        if (unit.supplyTarget) {
                            const dockSlotPos = (typeof getSupplyDockSlotPosition === 'function' && unit.type !== 'chinook')
                                ? getSupplyDockSlotPosition(unit.supplyTarget, unit, false)
                                : unit.supplyTarget.position;
                            if (!unit.waypoints || unit.waypoints.length === 0) {
                                const dSlot = Math.hypot(unit.mesh.position.x - dockSlotPos.x, unit.mesh.position.z - dockSlotPos.z);
                                if (dSlot > 26 && !unit._harvNavDock && unit.type !== 'chinook' && typeof findNavigationPath === 'function') {
                                    unit._harvNavDock = true;
                                    const nav = findNavigationPath(unit.mesh.position, dockSlotPos);
                                    if (nav && nav.length > 0) {
                                        unit.targetPosition.copy(nav[0]);
                                        unit.waypoints = nav.slice(1);
                                    } else {
                                        unit.targetPosition.copy(dockSlotPos);
                                    }
                                } else if (!unit._harvNavDock || dSlot <= 26) {
                                    unit.targetPosition.copy(dockSlotPos);
                                }
                            }
                            const distToDock = Math.hypot(unit.mesh.position.x - unit.supplyTarget.position.x, unit.mesh.position.z - unit.supplyTarget.position.z);
                            const dockDistThreshold = (unit.type === 'chinook') ? 14.0 : 11.5;
                            if (distToDock < dockDistThreshold) {
                                unit.aiState = 'Harvesting';
                                unit.timerState = 0;
                                unit._harvNavDock = false;
                                unit.waypoints = [];
                                unit.targetPosition.copy(unit.mesh.position);
                                if (unit.type === 'chinook') unit.airState = 'hovering';
                            }
                        } else {
                            unit.targetPosition.copy(unit.mesh.position);
                        }
                        break;
                    }
                    case 'Harvesting':
                        if (!unit.supplyTarget || unit.supplyTarget.stock <= 0) {
                            unit.supplyTarget = null;
                            unit.aiState = 'MovingToDock';
                            break;
                        }
                        unit.timerState = (unit.timerState || 0) + 1;
                        if (unit.timerState > 80) {
                            const loadCap = (unit.type === 'worker') ? 100 : (unit.type === 'chinook' ? 600 : 200);
                            unit.cargoLoaded = Math.min(loadCap, unit.supplyTarget.stock);
                            unit.supplyTarget.stock -= unit.cargoLoaded;
                            if (unit.supplyTarget.crystals && unit.supplyTarget.crystals.length > 0) {
                                const visibleCrystals = Math.ceil(unit.supplyTarget.stock / unit.supplyTarget.maxStock * unit.supplyTarget.crystals.length);
                                unit.supplyTarget.crystals.forEach((crystal, index) => crystal.visible = index < visibleCrystals);
                            }
                            if (unit.supplyTarget.cratesRef) {
                                const ratio = Math.max(0.01, unit.supplyTarget.stock / (unit.supplyTarget.maxStock || 30000));
                                unit.supplyTarget.cratesRef.scale.set(1, ratio, 1);
                                if (unit.supplyTarget.stock <= 0) unit.supplyTarget.cratesRef.visible = false;
                            }
                            if (cargoHold) { cargoHold.visible = true; cargoHold.scale.set(1, 1, 1); }
                            unit.aiState = 'MovingToCenter';
                            if (unit.type === 'chinook') unit.airState = 'flying';
                        }
                        break;
                    case 'MovingToCenter': {
                        let dropoffPosition = null;
                        if (isAIUnit) {
                            const aiStructs = enemyStructures.filter(s => s.ownerId === unit.ownerId && s.health > 0 && (s.type === 'supplyCenter' || s.type === 'supplyStash' || s.type === 'center' || s.type === 'commandCenter'));
                            const bestCenter = aiStructs[0];
                            if (bestCenter) {
                                dropoffPosition = (typeof getSupplyDockSlotPosition === 'function' && unit.type !== 'chinook')
                                    ? getSupplyDockSlotPosition(bestCenter, unit, true)
                                    : bestCenter.position;
                            } else {
                                dropoffPosition = unit.mesh.position;
                            }
                        } else {
                            dropoffPosition = getSupplyDropoffPosition(unit.mesh.position);
                        }
                        if (!unit.waypoints || unit.waypoints.length === 0) {
                            const dDrop = Math.hypot(unit.mesh.position.x - dropoffPosition.x, unit.mesh.position.z - dropoffPosition.z);
                            if (dDrop > 26 && !unit._harvNavCenter && unit.type !== 'chinook' && typeof findNavigationPath === 'function') {
                                unit._harvNavCenter = true;
                                const nav = findNavigationPath(unit.mesh.position, dropoffPosition);
                                if (nav && nav.length > 0) {
                                    unit.targetPosition.copy(nav[0]);
                                    unit.waypoints = nav.slice(1);
                                } else {
                                    unit.targetPosition.copy(dropoffPosition);
                                }
                            } else if (!unit._harvNavCenter || dDrop <= 26) {
                                unit.targetPosition.copy(dropoffPosition);
                            }
                        }
                        if (cargoHold && cargoHold.scale.y < 1.0) cargoHold.scale.y += 0.015;
                        const distToDropoff = Math.hypot(unit.mesh.position.x - dropoffPosition.x, unit.mesh.position.z - dropoffPosition.z);
                        const centerDistThreshold = (unit.type === 'chinook') ? 14.0 : 9.5;
                        if (distToDropoff < centerDistThreshold) {
                            unit.aiState = 'Depositing';
                            unit.timerState = 0;
                            unit._harvNavCenter = false;
                            unit.waypoints = [];
                            unit.targetPosition.copy(unit.mesh.position);
                            if (unit.type === 'chinook') unit.airState = 'hovering';
                        }
                        break;
                    }
                    case 'Depositing':
                        if (unit.type === 'chinook') unit.airState = 'hovering';
                        unit.timerState = (unit.timerState || 0) + 1;
                        if (unit.timerState > 40) {
                            const earned = unit.cargoLoaded || (unit.type === 'chinook' ? 600 : (unit.type === 'worker' ? 100 : 200));
                            if (!isAIUnit && unit.teamId === (typeof playerTeamId !== 'undefined' ? playerTeamId : 1)) {
                                playerResources += earned;
                                const resEl = document.getElementById('resource-display');
                                if (resEl) resEl.innerText = '$' + playerResources;
                                if (typeof spawnFloatingCashNumber === 'function' && unit.mesh) {
                                    spawnFloatingCashNumber(unit.mesh.position.clone().add(new THREE.Vector3(0, 2.5, 0)), earned);
                                }
                                showNotification('Supplies delivered: +$' + earned, 'success');
                                updateSidebar();
                            } else if (unit.ownerId && typeof aiCommanders !== 'undefined' && aiCommanders[unit.ownerId]) {
                                aiCommanders[unit.ownerId].resources = (aiCommanders[unit.ownerId].resources || 0) + earned;
                            } else if (typeof aiResources !== 'undefined') {
                                aiResources += earned;
                            }
                            unit.cargoLoaded = 0;
                            if (cargoHold) cargoHold.visible = false;
                            unit.aiState = 'MovingToDock';
                            if (unit.type === 'chinook') unit.airState = 'flying';
                        }
                        break;
                }
            };
            units.forEach(unit => updateHarvesterUnit(unit, false));
            enemyUnits.forEach(unit => updateHarvesterUnit(unit, true));

            // Ported from DozerAIUpdate.cpp: DOZER_TASK_BUILD & DOZER_TASK_REPAIR state transitions
            const updateBuilderTaskUnit = (unit) => {
                if (!unit || unit.health <= 0 || !unit.mesh) return;
                if (unit.type !== 'dozer' && unit.type !== 'worker') return;
                const s = unit.targetStructure;
                if (unit.taskState === 'MovingToBuild' && s) {
                    if (s.health > 0 && s.isBuilding) {
                        const distToS = Math.hypot(unit.mesh.position.x - s.position.x, unit.mesh.position.z - s.position.z);
                        const buildThreshold = s.radius + (unit.radius || 1.8) + 3.2;
                        if (distToS <= buildThreshold && (!unit.waypoints || unit.waypoints.length === 0 || distToS <= s.radius + (unit.radius || 1.8) + 2.0)) {
                            unit.taskState = 'Building';
                            unit.waypoints = [];
                            unit._buildStuckTicks = 0;
                        } else {
                            const prevPos = unit._lastBuildMovePos;
                            const moved = prevPos ? Math.hypot(unit.mesh.position.x - prevPos.x, unit.mesh.position.z - prevPos.z) : 1;
                            if (!unit._lastBuildMovePos) unit._lastBuildMovePos = unit.mesh.position.clone();
                            else unit._lastBuildMovePos.copy(unit.mesh.position);
                            unit._buildStuckTicks = (moved < 0.02) ? ((unit._buildStuckTicks || 0) + 1) : 0;
                            if (unit._buildStuckTicks > 60) {
                                unit._buildStuckTicks = 0;
                                if (distToS <= buildThreshold + 2.5) {
                                    unit.taskState = 'Building';
                                    unit.waypoints = [];
                                } else if (typeof assignDozerToStructure === 'function') {
                                    assignDozerToStructure(unit, s);
                                }
                            }
                        }
                    } else if (!s.isBuilding || s.health <= 0) {
                        unit.taskState = 'Idle';
                        unit.targetStructure = null;
                        unit._buildStuckTicks = 0;
                    }
                } else if ((unit.taskState === 'MovingToRepair' || unit.taskState === 'Repairing') && s) {
                    // Sole-benefactor check (DozerAIUpdate.cpp:723 attemptHealingFromSoleBenefactor)
                    if (s.health <= 0 || s.isBuilding || s.health >= s.maxHealth || (s.soleRepairer && s.soleRepairer !== unit)) {
                        if (s.soleRepairer === unit) s.soleRepairer = null;
                        unit.taskState = 'Idle';
                        unit.targetStructure = null;
                        return;
                    }
                    s.soleRepairer = unit;
                    const distToS = Math.hypot(unit.mesh.position.x - s.position.x, unit.mesh.position.z - s.position.z);
                    const repairThreshold = s.radius + (unit.radius || 1.8) + 2.6;
                    if ((!unit.waypoints || unit.waypoints.length === 0) && distToS <= repairThreshold) {
                        unit.taskState = 'Repairing';
                        unit.targetPosition.copy(unit.mesh.position);
                        const repairRate = (typeof ZERO_HOUR_AI_DATA !== 'undefined' && ZERO_HOUR_AI_DATA.repairHealthPercentPerSecond) ? ZERO_HOUR_AI_DATA.repairHealthPercentPerSecond : 0.02;
                        const healPerFrame = Math.max(0.4, (s.maxHealth * repairRate) / 60) * combatDeltaScale;
                        s.health = Math.min(s.maxHealth, s.health + healPerFrame);
                        if (Math.random() < 0.25 && typeof spawnWeldingSpark === 'function') {
                            spawnWeldingSpark(unit.mesh.position, s.position);
                        }
                        if (s.health >= s.maxHealth) {
                            s.soleRepairer = null;
                            unit.taskState = 'Idle';
                            unit.targetStructure = null;
                        }
                    }
                }
            };
            units.forEach(updateBuilderTaskUnit);
            enemyUnits.forEach(updateBuilderTaskUnit);

            // GLA Worker Tool Visibility & Animation (Box when carrying, Hammer when building/repairing, Metal Detector when sweeping mines)
            const updateWorkerTools = (unit) => {
                if (!unit || unit.health <= 0 || !unit.mesh || unit.type !== 'worker') return;
                const boxMesh = getCachedNode(unit.mesh, 'cargoHold');
                const hammerMesh = getCachedNode(unit.mesh, 'workerHammer');
                const mineDetMesh = getCachedNode(unit.mesh, 'mineDetector');

                const isCarrying = !!(unit.cargoLoaded > 0 || unit.aiState === 'MovingToCenter' || unit.aiState === 'Depositing');
                const isBuildingOrRepairing = (unit.taskState === 'Building' || unit.taskState === 'Repairing');

                let isDetectingMines = !!unit.isClearingMines;
                if (!isDetectingMines && !isCarrying && !isBuildingOrRepairing && typeof landmines !== 'undefined' && landmines.length > 0) {
                    const uX = unit.mesh.position.x, uZ = unit.mesh.position.z;
                    for (let mi = 0; mi < landmines.length; mi++) {
                        const mine = landmines[mi];
                        if (mine && !isFriendly(unit, mine) && mine.position) {
                            const dx = mine.position.x - uX, dz = mine.position.z - uZ;
                            if (dx * dx + dz * dz <= 13.5 * 13.5) { isDetectingMines = true; break; }
                        }
                    }
                }

                if (boxMesh) boxMesh.visible = isCarrying;
                if (hammerMesh) {
                    hammerMesh.visible = !isCarrying && isBuildingOrRepairing;
                    if (hammerMesh.visible) {
                        hammerMesh.rotation.x = Math.sin(buildingTick * 0.35) * 0.85;
                    }
                }
                if (mineDetMesh) {
                    mineDetMesh.visible = !isCarrying && !isBuildingOrRepairing && isDetectingMines;
                    if (mineDetMesh.visible) {
                        mineDetMesh.rotation.y = Math.sin(buildingTick * 0.2) * 0.35;
                    }
                }
            };
            units.forEach(updateWorkerTools);
            enemyUnits.forEach(updateWorkerTools);

            // Sync GLA Scorpion Tank turret rocket rack & Quad Cannon salvage turret tiers
            const syncGLASalvageMeshes = (unit, isAIUnit) => {
                if (!unit || unit.health <= 0 || !unit.mesh) return;
                if (unit.type === 'scorpion') {
                    const rack = getCachedNode(unit.mesh, 'MISSLERACK01');
                    if (rack) {
                        const hasRocket = (unit.salvageLevel >= 1) || (!isAIUnit && typeof researchedTechs !== 'undefined' && researchedTechs.has('scorpionRocket'));
                        rack.visible = !!hasRocket;
                    }
                } else if (unit.type === 'quad') {
                    const lvl = unit.salvageLevel || 0;
                    const t0 = getCachedNode(unit.mesh, 'turretSystem');
                    const t1 = getCachedNode(unit.mesh, 'TURRETUP01');
                    const t2 = getCachedNode(unit.mesh, 'TURRETUP02');
                    if (t0) t0.visible = (lvl === 0);
                    if (t1) {
                        t1.visible = (lvl === 1);
                        if (t0 && t1.visible) t1.rotation.y = t0.rotation.y;
                    }
                    if (t2) {
                        t2.visible = (lvl >= 2);
                        if (t0 && t2.visible) t2.rotation.y = t0.rotation.y;
                    }
                } else if (unit.type === 'scud') {
                    const turretEl = getCachedNode(unit.mesh, 'TURRETEL');
                    if (turretEl) {
                        const targetElev = (unit.combatTarget && unit.combatTarget.health > 0) ? -1.05 : 0;
                        turretEl.rotation.x += (targetElev - turretEl.rotation.x) * 0.08;
                    }
                    const missile = getCachedNode(unit.mesh, 'MISSILE');
                    if (missile) {
                        missile.visible = !(unit.attackCooldown && unit.attackCooldown > 280);
                    }
                }
            };
            units.forEach(u => syncGLASalvageMeshes(u, false));
            enemyUnits.forEach(u => syncGLASalvageMeshes(u, true));

            // Authentic C&C Generals Damaged / Critical Visuals (charred armor/walls + rising smoke & fire)
            const updateEntityDamageVisuals = (list, isStruct) => {
                if (!list || list.length === 0) return;
                for (let idx = 0; idx < list.length; idx++) {
                    const ent = list[idx];
                    if (!ent || ent.health <= 0 || !ent.mesh || !ent.maxHealth || ent.isBuilding) continue;
                    if (ent.garrisonedIn) continue;
                    const hpRatio = ent.health / ent.maxHealth;
                    const tier = hpRatio < 0.35 ? 2 : (hpRatio < 0.65 ? 1 : 0);
                    if (tier !== (ent._damageTier || 0)) {
                        ent._damageTier = tier;
                        ent.mesh.traverse(c => {
                            if (!c.isMesh || !c.material || Array.isArray(c.material) || !c.material.color) return;
                            if (!c._damageClonedMat && tier > 0) {
                                c._origColorHex = c.material.color.getHex();
                                c.material = c.material.clone();
                                c._damageClonedMat = true;
                            }
                            if (c._damageClonedMat && c._origColorHex !== undefined) {
                                c.material.color.setHex(c._origColorHex);
                                if (tier === 1) c.material.color.multiplyScalar(0.65);
                                else if (tier === 2) c.material.color.multiplyScalar(0.40);
                            }
                        });
                    }
                    if (tier > 0 && ((buildingTick + idx) % (tier === 2 ? 10 : 18) === 0)) {
                        const basePos = ent.position || ent.mesh.position;
                        const spread = isStruct ? (ent.radius || 4) * 0.45 : (ent.radius || 1.2) * 0.4;
                        const smokePos = basePos.clone().add(new THREE.Vector3(
                            (Math.random() - 0.5) * spread,
                            isStruct ? (2.2 + Math.random() * 1.5) : (ent.isAir ? 0.3 : 1.0),
                            (Math.random() - 0.5) * spread
                        ));
                        if (typeof spawnSmokePuff === 'function') {
                            spawnSmokePuff(smokePos, tier === 2 ? 0x1e2229 : 0x4b525c, isStruct ? (tier === 2 ? 0.85 : 0.55) : (tier === 2 ? 0.5 : 0.32));
                        }
                        if (tier === 2 && Math.random() < 0.55 && typeof spawnMuzzleFlash === 'function') {
                            spawnMuzzleFlash(smokePos, 0xff5500, isStruct ? 0.55 : 0.3);
                        }
                    }
                }
            };
            updateEntityDamageVisuals(units, false);
            updateEntityDamageVisuals(enemyUnits, false);
            updateEntityDamageVisuals(structures, true);
            updateEntityDamageVisuals(enemyStructures, true);

            // PERF: single ground-unit separation pass using a spatial hash grid
            // (was two full O(N^2) passes per frame that fought each other)
            separateGroundUnits(units);

            units.forEach(unit => {
                // Embarking into transport vehicles or garrisonable structures (e.g. Internet Center)
                if (unit.taskState === 'MovingToEmbark' && unit.embarkTarget) {
                    const transport = unit.embarkTarget;
                    const tPos = transport.position || (transport.mesh && transport.mesh.position);
                    if (transport.health > 0 && tPos) {
                        unit.targetPosition.copy(tPos);
                        const cap = transport.capacity || (transport.type === 'internetCenter' ? 8 : 0);
                        const distToT = Math.hypot(unit.mesh.position.x - tPos.x, unit.mesh.position.z - tPos.z);
                        if (distToT < ((transport.radius || 1.4) + 2.8)) {
                            if (!transport.garrisoned) transport.garrisoned = [];
                            if (transport.garrisoned.length < cap) {
                                transport.garrisoned.push(unit);
                                unit.garrisonedIn = transport;
                                unit.mesh.visible = false;
                                unit.taskState = 'Idle';
                                unit.embarkTarget = null;
                                showNotification(`${unit.type} entered ${transport.type} (${transport.garrisoned.length}/${cap}).`, 'success');
                                updateSidebar();
                            }
                        }
                    } else {
                        unit.taskState = 'Idle';
                        unit.embarkTarget = null;
                    }
                }

                if (unit.garrisonedIn || unit.taskState === 'Building' || unit.taskState === 'Repairing') return;

                // =========================================================
                // AIRPLANE & HELICOPTER FLIGHT, LANDING & CIRCLING ENGINE
                // =========================================================
                // COMPREHENSIVE AIRCRAFT & HELICOPTER FLIGHT DYNAMICS
                // Helicopters: Hover in place, tilt into flight, strafe sideways in combat.
                // Airplanes: High-speed strafe run, drop bombs/missiles overhead, overshoot, loop turnaround.
                // =========================================================
                if (unit.isAir) {
                    const cruiseAlt = (unit.mesh.userData && unit.mesh.userData.flightAltitude) ? unit.mesh.userData.flightAltitude : 8.5;
                    const groundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(unit.mesh.position.x, unit.mesh.position.z) : 0;
                    const isHeli = (unit.type === 'comanche' || unit.type === 'chinook');

                    if (!unit.patrolCenter) unit.patrolCenter = unit.mesh.position.clone();
                    if (!unit.circleRadius) unit.circleRadius = isHeli ? 11.0 : 16.0;
                    if (unit.circleAngle === undefined) unit.circleAngle = Math.random() * Math.PI * 2;
                    if (!unit.airState || unit.airState === 'none') {
                        unit.airState = isHeli ? 'hovering' : 'circling';
                    }

                    // Dynamic State Transition: Automatically react to player/AI orders!
                    if (unit.combatTarget && unit.combatTarget.health > 0) {
                        if (unit.airState === 'landed') {
                            unit.airState = 'taking_off';
                        } else if (unit.airState !== 'taking_off') {
                            unit.airState = 'attacking';
                        }
                    } else if (unit.airState === 'hovering') {
                        const distToTarget = Math.hypot(unit.targetPosition.x - unit.mesh.position.x, unit.targetPosition.z - unit.mesh.position.z);
                        if (distToTarget > 2.0 || unit.taskState === 'Moving') {
                            unit.airState = 'flying';
                        }
                    } else if (unit.airState === 'circling') {
                        const distToPatrol = Math.hypot(unit.targetPosition.x - unit.patrolCenter.x, unit.targetPosition.z - unit.patrolCenter.z);
                        if (distToPatrol > 4.0 || unit.taskState === 'Moving') {
                            unit.airState = 'flying';
                            unit.patrolCenter.copy(unit.targetPosition);
                        }
                    }

                    // 1. Landed on Airfield Runway / Pad
                    if (unit.airState === 'landed') {
                        unit.mesh.position.y = groundY + 0.35;
                        unit.mesh.rotation.z = 0;
                        unit.mesh.rotation.x = 0;
                        const distToGoal = Math.hypot(unit.targetPosition.x - unit.mesh.position.x, unit.targetPosition.z - unit.mesh.position.z);
                        if (unit.combatTarget || (unit.waypoints && unit.waypoints.length > 0) || distToGoal > 4.0 || unit.taskState === 'Moving') {
                            unit.airState = 'taking_off';
                        }
                        return; // Stays safely on ground
                    }

                    // 2. Taking off & climbing to cruising altitude
                    if (unit.airState === 'taking_off') {
                        const targetY = groundY + cruiseAlt;
                        unit.mesh.position.y += (targetY - unit.mesh.position.y) * 0.08;
                        if (unit.mesh.position.y >= targetY * 0.85) {
                            unit.airState = (unit.combatTarget && unit.combatTarget.health > 0) ? 'attacking' : (isHeli ? 'hovering' : 'flying');
                        }
                    }

                    // 3. Helicopter Station Keeping: HOVER IN THE SAME SPOT
                    if (unit.airState === 'hovering' && isHeli) {
                        const targetHoverY = groundY + cruiseAlt + Math.sin(animTime * 2.5 + unit.mesh.id) * 0.18;
                        unit.mesh.position.y += (targetHoverY - unit.mesh.position.y) * 0.10;
                        unit.mesh.position.x += (unit.targetPosition.x - unit.mesh.position.x) * 0.12;
                        unit.mesh.position.z += (unit.targetPosition.z - unit.mesh.position.z) * 0.12;

                        // Return smoothly to level hover attitude
                        unit.mesh.rotation.x += (0 - unit.mesh.rotation.x) * 0.12;
                        unit.mesh.rotation.z += (0 - unit.mesh.rotation.z) * 0.12;

                        return; // Complete hover update
                    }

                    // 4. Attacking an Enemy Target
                    if (unit.airState === 'attacking' && unit.combatTarget) {
                        const tPos = unit.combatTarget.position || (unit.combatTarget.mesh && unit.combatTarget.mesh.position);
                        if (!tPos || unit.combatTarget.health <= 0) {
                            unit.combatTarget = null;
                            unit.planeAttackPhase = null;
                            if (isHeli) {
                                unit.airState = 'hovering';
                                unit.targetPosition.copy(unit.mesh.position);
                            } else {
                                unit.airState = 'circling';
                                unit.patrolCenter.copy(unit.mesh.position);
                                unit.targetPosition.copy(unit.mesh.position);
                                unit.circleAngle = Math.atan2(unit.mesh.position.z - unit.patrolCenter.z, unit.mesh.position.x - unit.patrolCenter.x);
                            }
                            unit.taskState = 'Idle';
                        } else if (isHeli) {
                            // --- HELICOPTERS (Comanche): Strafe sideways while facing and firing on target ---
                            const dxA = tPos.x - unit.mesh.position.x;
                            const dzA = tPos.z - unit.mesh.position.z;
                            const distToEnemy = Math.hypot(dxA, dzA);

                            // Face directly toward the enemy target at all times
                            const aimAngle = Math.atan2(-dzA, dxA) + Math.PI / 2;
                            let diff = aimAngle - unit.mesh.rotation.y;
                            while (diff < -Math.PI) diff += Math.PI * 2;
                            while (diff > Math.PI) diff -= Math.PI * 2;
                            unit.mesh.rotation.y += diff * 0.20;

                            if (distToEnemy > 22.0) {
                                // Close distance into effective rocket & gun range
                                const dirX = dxA / (distToEnemy || 1);
                                const dirZ = dzA / (distToEnemy || 1);
                                unit.mesh.position.x += dirX * unit.speed * combatDeltaScale;
                                unit.mesh.position.z += dirZ * unit.speed * combatDeltaScale;
                                unit.mesh.rotation.x += (0.14 - unit.mesh.rotation.x) * 0.12; // Forward tilt
                                unit.mesh.rotation.z += (0 - unit.mesh.rotation.z) * 0.12;
                            } else {
                                // Authentic Comanche Circle-Strafe: lateral sideways movement perpendicular to line-of-fire
                                if (unit.strafeDir === undefined) unit.strafeDir = (Math.random() < 0.5 ? 1 : -1);
                                unit.strafeTimer = (unit.strafeTimer || 0) + 1;
                                if (unit.strafeTimer > 75) {
                                    unit.strafeTimer = 0;
                                    unit.strafeDir *= -1; // Reverse strafe direction periodically
                                }

                                const perpX = -dzA / (distToEnemy || 1);
                                const perpZ = dxA / (distToEnemy || 1);
                                const strafeSpeed = unit.speed * 0.60 * combatDeltaScale;
                                unit.mesh.position.x += perpX * (strafeSpeed * unit.strafeDir);
                                unit.mesh.position.z += perpZ * (strafeSpeed * unit.strafeDir);

                                // Tilting roll during sideways strafe + nose dipped down toward ground target
                                unit.mesh.rotation.z += (unit.strafeDir * 0.22 - unit.mesh.rotation.z) * 0.12;
                                unit.mesh.rotation.x += (0.16 - unit.mesh.rotation.x) * 0.12;
                            }

                            if (distToEnemy <= 24.0 && unit.attackCooldown === 0) {
                                executeWeaponFire(unit, unit.combatTarget);
                            }
                        } else {
                            // --- FIXED-WING AIRPLANES (Raptor, Aurora, Stealth Fighter, MiG): Strafe Run & Bomb Drop ---
                            if (!unit.planeAttackPhase) unit.planeAttackPhase = 'inbound';

                            const dxA = tPos.x - unit.mesh.position.x;
                            const dzA = tPos.z - unit.mesh.position.z;
                            const distToEnemy = Math.hypot(dxA, dzA);
                            const isAuroraInbound = (unit.type === 'aurora' && unit.planeAttackPhase === 'inbound');
                            unit.invulnerableInbound = isAuroraInbound;
                            const planeSpeed = ((unit.type === 'aurora') ? (isAuroraInbound ? unit.speed * 1.85 : unit.speed * 0.65) : unit.speed) * combatDeltaScale;

                            if (unit.planeAttackPhase === 'inbound') {
                                // Phase 1: High-speed approach directly at the target
                                const dirX = dxA / (distToEnemy || 1);
                                const dirZ = dzA / (distToEnemy || 1);
                                unit.mesh.position.x += dirX * planeSpeed;
                                unit.mesh.position.z += dirZ * planeSpeed;

                                const targetAngle = Math.atan2(-dirZ, dirX) + Math.PI / 2;
                                let diff = targetAngle - unit.mesh.rotation.y;
                                while (diff < -Math.PI) diff += Math.PI * 2;
                                while (diff > Math.PI) diff -= Math.PI * 2;
                                unit.mesh.rotation.y += diff * 0.22;
                                unit.mesh.rotation.order = 'YXZ';
                                unit.mesh.rotation.x += (-0.08 - unit.mesh.rotation.x) * 0.12; // Slight diving attack angle
                                unit.mesh.rotation.z += (THREE.MathUtils.clamp(-diff * 1.8, -0.42, 0.42) - unit.mesh.rotation.z) * 0.15;

                                // Bomb & Missile Delivery: Release ordnance as plane streaks overhead
                                if (distToEnemy <= 16.0 && unit.attackCooldown === 0) {
                                    executeWeaponFire(unit, unit.combatTarget);
                                    unit.planeAttackPhase = 'overshoot';
                                    unit.overshootDirX = dirX;
                                    unit.overshootDirZ = dirZ;
                                    unit.overshootDist = 0;
                                }
                            } else if (unit.planeAttackPhase === 'overshoot') {
                                // Phase 2: Carry momentum past target (zoom climb overshoot)
                                unit.mesh.position.x += unit.overshootDirX * (planeSpeed * 1.35);
                                unit.mesh.position.z += unit.overshootDirZ * (planeSpeed * 1.35);
                                unit.overshootDist += planeSpeed * 1.35;
                                unit.mesh.position.y += 0.08; // Zoom climb
                                unit.mesh.rotation.x += (0.10 - unit.mesh.rotation.x) * 0.12;
                                unit.mesh.rotation.z += (0 - unit.mesh.rotation.z) * 0.12;

                                if (unit.overshootDist >= 34.0) {
                                    unit.planeAttackPhase = 'turnaround';
                                    unit.turnaroundTimer = 0;
                                }
                            } else if (unit.planeAttackPhase === 'turnaround') {
                                // Phase 3: Wide 180-degree banking turnaround to set up next attack run
                                unit.turnaroundTimer = (unit.turnaroundTimer || 0) + 1;
                                const turnRate = 0.038;
                                unit.mesh.rotation.y += turnRate;
                                unit.mesh.rotation.z += (-0.40 - unit.mesh.rotation.z) * 0.12; // Deep banking roll
                                unit.mesh.rotation.x += (0 - unit.mesh.rotation.x) * 0.10;

                                // Advance forward along turning vector
                                unit.mesh.position.x += Math.sin(unit.mesh.rotation.y) * (planeSpeed * 1.05);
                                unit.mesh.position.z += Math.cos(unit.mesh.rotation.y) * (planeSpeed * 1.05);

                                // Check alignment back towards target
                                const angleToTarget = Math.atan2(-dzA, dxA) + Math.PI / 2;
                                let angleDiff = Math.abs(angleToTarget - unit.mesh.rotation.y);
                                while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - Math.PI * 2);

                                if (angleDiff < 0.45 && unit.turnaroundTimer > 40) {
                                    // Successfully re-aligned with target for next strafe pass!
                                    unit.planeAttackPhase = 'inbound';
                                }
                            }
                        }
                    }

                    // 5. Commanded Flight Toward Destination
                    if (unit.airState === 'flying') {
                        const dx = unit.targetPosition.x - unit.mesh.position.x;
                        const dz = unit.targetPosition.z - unit.mesh.position.z;
                        const dist2D = Math.hypot(dx, dz);
                        const stopThreshold = isHeli ? 1.5 : 4.0;

                        if (dist2D > stopThreshold) {
                            const dirX = dx / dist2D;
                            const dirZ = dz / dist2D;
                            unit.mesh.position.x += dirX * unit.speed * combatDeltaScale;
                            unit.mesh.position.z += dirZ * unit.speed * combatDeltaScale;

                            const targetAngle = Math.atan2(-dirZ, dirX) + Math.PI / 2;
                            let diff = targetAngle - unit.mesh.rotation.y;
                            while (diff < -Math.PI) diff += Math.PI * 2;
                            while (diff > Math.PI) diff -= Math.PI * 2;
                            unit.mesh.rotation.y += diff * 0.18;

                            if (isHeli) {
                                // Helicopter tilts forward into flight and banks slightly into turns
                                unit.mesh.rotation.x += (0.14 - unit.mesh.rotation.x) * 0.12;
                                const targetBank = THREE.MathUtils.clamp(-diff * 0.8, -0.22, 0.22);
                                unit.mesh.rotation.z += (targetBank - unit.mesh.rotation.z) * 0.12;
                            } else {
                                unit.mesh.rotation.order = 'YXZ';
                                unit.mesh.rotation.x += (0 - unit.mesh.rotation.x) * 0.12;
                                unit.mesh.rotation.z += (THREE.MathUtils.clamp(-diff * 1.6, -0.42, 0.42) - unit.mesh.rotation.z) * 0.12;
                            }
                        } else {
                            if (unit.waypoints && unit.waypoints.length > 0) {
                                unit.targetPosition.copy(unit.waypoints.shift());
                            } else {
                                if (isHeli) {
                                    // Helicopters hover in place at arrival!
                                    unit.airState = 'hovering';
                                    unit.targetPosition.copy(unit.mesh.position);
                                } else {
                                    // Airplanes enter holding orbit
                                    unit.patrolCenter.copy(unit.targetPosition);
                                    unit.circleAngle = Math.atan2(unit.mesh.position.z - unit.patrolCenter.z, unit.mesh.position.x - unit.patrolCenter.x);
                                    unit.airState = 'circling';
                                }
                                unit.taskState = 'Idle';
                            }
                        }
                    }

                    // 6. Holding Pattern Circling (Strictly for fixed-wing airplanes)
                    if (unit.airState === 'circling') {
                        if (isHeli) {
                            // If a helicopter somehow gets into circling, immediately settle it to hovering
                            unit.airState = 'hovering';
                            unit.targetPosition.copy(unit.mesh.position);
                        } else {
                            const orbitR = unit.circleRadius || 16.0;
                            const orbitSpeed = unit.speed * 0.75 * combatDeltaScale;
                            const angularSpeed = orbitSpeed / orbitR;

                            unit.circleAngle = (unit.circleAngle || 0) + angularSpeed;
                            if (unit.circleAngle > Math.PI * 2) unit.circleAngle -= Math.PI * 2;

                            const targetOrbitX = unit.patrolCenter.x + Math.cos(unit.circleAngle) * orbitR;
                            const targetOrbitZ = unit.patrolCenter.z + Math.sin(unit.circleAngle) * orbitR;

                            const dxO = targetOrbitX - unit.mesh.position.x;
                            const dzO = targetOrbitZ - unit.mesh.position.z;
                            const distO = Math.hypot(dxO, dzO);

                            if (distO > 0.05) {
                                const step = Math.min(distO, orbitSpeed);
                                unit.mesh.position.x += (dxO / distO) * step;
                                unit.mesh.position.z += (dzO / distO) * step;
                            }

                            // Tangential heading for smooth circle flight
                            const tangentX = -Math.sin(unit.circleAngle);
                            const tangentZ = Math.cos(unit.circleAngle);
                            const targetAngle = Math.atan2(-tangentZ, tangentX) + Math.PI / 2;

                            let diff = targetAngle - unit.mesh.rotation.y;
                            while (diff < -Math.PI) diff += Math.PI * 2;
                            while (diff > Math.PI) diff -= Math.PI * 2;
                            unit.mesh.rotation.y += diff * 0.16;
                            unit.mesh.rotation.order = 'YXZ';
                            unit.mesh.rotation.x = 0;
                            unit.mesh.rotation.z += (-0.28 - unit.mesh.rotation.z) * 0.12;
                        }
                    }

                    // Maintain flight cruising altitude above ground
                    if (unit.airState !== 'landed' && unit.airState !== 'hovering') {
                        const targetY = groundY + cruiseAlt;
                        unit.mesh.position.y += (targetY - unit.mesh.position.y) * 0.08;
                    }

                    return; // Skip ground obstacles/sliding
                }

                // --- MOVE-AND-SHOOT: Authentic C&C Generals Fire-On-The-Move ---
                // Only halt movement if the player explicitly ordered an attack on a specific target ('MovingToAttack')
                // If on a move/patrol order, the unit drives continuously toward targetPosition while firing on the move!
                if (unit.taskState === 'MovingToAttack' && unit.combatTarget) {
                    const targetMesh = unit.combatTarget.mesh;
                    if (targetMesh && unit.combatTarget.health > 0) {
                        const dxT = targetMesh.position.x - unit.mesh.position.x;
                        const dzT = targetMesh.position.z - unit.mesh.position.z;
                        const distToTarget = Math.hypot(dxT, dzT);
                        const targetRadius = unit.combatTarget.radius || 0;
                        if (distToTarget <= (unit.scanRange + targetRadius - 1.5)) {
                            // In effective weapon range: halt chassis and open fire
                            unit.targetPosition.x = unit.mesh.position.x;
                            unit.targetPosition.z = unit.mesh.position.z;
                            return;
                        } else {
                            // Target moved out of range: pursue target
                            unit.targetPosition.x = targetMesh.position.x;
                            unit.targetPosition.z = targetMesh.position.z;
                        }
                    } else {
                        // Target destroyed or lost: resume idle
                        unit.combatTarget = null;
                        unit.taskState = 'Idle';
                    }
                }

                // --- CAPTURING NEUTRAL STRUCTURE CHANNELS ---
                if (unit.taskState === 'Capturing' && unit.captureTarget && unit.captureTarget.health > 0) {
                    const targetTech = unit.captureTarget;
                    const dTech = Math.hypot(targetTech.position.x - unit.mesh.position.x, targetTech.position.z - unit.mesh.position.z);
                    if (dTech <= (targetTech.radius + 3.0)) {
                        // Halt movement while capturing
                        unit.targetPosition.x = unit.mesh.position.x;
                        unit.targetPosition.z = unit.mesh.position.z;
                        targetTech.captureProgress = (targetTech.captureProgress || 0) + 1;
                        if (targetTech.captureProgress >= 120) { // ~2 seconds channeling
                            targetTech.captureProgress = 0;
                            targetTech.capturedByTeam = unit.teamId;
                            targetTech.teamId = unit.teamId;
                            targetTech.ownerId = (unit.teamId === playerTeamId) ? 'player' : (unit.ownerId || ('ai_' + unit.teamId));

                            // Turn flag cloth to player blue or enemy red
                            const flagCloth = targetTech.mesh ? getCachedNode(targetTech.mesh, "neutralFlagCloth") : null;
                            if (flagCloth && flagCloth.material) {
                                flagCloth.material.color.setHex((unit.teamId === playerTeamId) ? 0x3498db : 0xe74c3c);
                            }

                            if (unit.teamId === playerTeamId) {
                                if (targetTech.type === 'techOilDerrick') {
                                    playerResources += 1000;
                                    const resEl = document.getElementById('resource-display');
                                    if (resEl) resEl.innerText = `$${playerResources}`;
                                    showNotification('Tech Oil Derrick SECURED! +$1,000 cash grant + steady flow online.', 'success');
                                } else if (targetTech.type === 'techHospital') {
                                    showNotification('Tech Hospital SECURED! Field medics online: friendly infantry passively heal.', 'success');
                                } else if (targetTech.type === 'techRefinery') {
                                    showNotification('Tech Oil Refinery SECURED! Combat vehicle & aircraft costs discounted 10%.', 'success');
                                }
                                playUSASound('radio_chirp');
                            } else {
                                showNotification(`Warning: Enemy forces captured ${targetTech.name}!`, 'error');
                            }

                            unit.taskState = 'Idle';
                            unit.captureTarget = null;
                            if (typeof updateSidebar === 'function') updateSidebar();
                        }
                        return;
                    }
                }

                // Smoothly return turret forward if no active combat target
                const idleTurret = getCachedNode(unit.mesh, "turretSystem");
                if (idleTurret && !unit.combatTarget) {
                    idleTurret.rotation.y += (0 - idleTurret.rotation.y) * 0.1;
                }

                const stopBuffer = unit.isAir ? 1.0 : 0.4;

                // Use horizontal distance on XZ plane so altitude Y does not cause infinite distance overshoot/jitter
                const dx = unit.targetPosition.x - unit.mesh.position.x;
                const dz = unit.targetPosition.z - unit.mesh.position.z;
                const dist2D = Math.hypot(dx, dz);

                if (dist2D > stopBuffer) {
                    // Nuke Cannon Outrigger Siege Logic: if given a move order, automatically pack up outriggers before driving!
                    if ((unit.type === 'nukecannon' || unit.type === 'nuketank') && unit.isDeployed) {
                        if (unit.taskState === 'Moving' && typeof undeployNukeCannonOutriggers === 'function') {
                            undeployNukeCannonOutriggers(unit);
                        } else {
                            // Halt chassis while deployed in siege mode firing at a target
                            unit.targetPosition.copy(unit.mesh.position);
                            return;
                        }
                    }
                    const dirX = dx / dist2D;
                    const dirZ = dz / dist2D;
                    const step = Math.min(dist2D, unit.speed * combatDeltaScale);
                    unit.mesh.position.x += dirX * step;
                    unit.mesh.position.z += dirZ * step;

                    // Authentic Tank Crushing (SquishCollide.cpp: heavy tanks crush enemy infantry)
                    if (CRUSHER_TANK_SET.has(unit.type)) {
                        const hostiles = (typeof enemyUnits !== 'undefined') ? enemyUnits : [];
                        for (let enemy of hostiles) {
                            if (enemy.health > 0 && enemy.mesh && !isFriendly(unit, enemy) && (typeof getArmorCategory === 'function' ? getArmorCategory(enemy) === 'infantry' : INFANTRY_TYPE_SET.has(enemy.type))) {
                                const infDist = Math.hypot(unit.mesh.position.x - enemy.mesh.position.x, unit.mesh.position.z - enemy.mesh.position.z);
                                if (infDist <= ((unit.radius || 1.8) + (enemy.radius || 0.6)) * 0.95) {
                                    const toX = enemy.mesh.position.x - unit.mesh.position.x;
                                    const toZ = enemy.mesh.position.z - unit.mesh.position.z;
                                    if (toX * dirX + toZ * dirZ > 0) { // moving towards infantry
                                        enemy.health = 0;
                                        enemy._killCredited = true;
                                        if (typeof spawnSquishDecal === 'function') spawnSquishDecal(enemy.mesh.position);
                                        playAudio('infantry_squish');
                                        if (typeof showNotification === 'function') {
                                            showNotification(`Enemy infantry crushed under treads of ${unit.type.toUpperCase()}!`, 'info');
                                        }
                                        unit.kills = (unit.kills || 0) + 1;
                                        if (typeof checkVeterancyPromotion === 'function') checkVeterancyPromotion(unit);
                                        if (unit.selected && typeof updateSidebar === 'function') updateSidebar();
                                    }
                                }
                            }
                        }
                    }

                    // Anti-Stuck & Anti-Orbit Watchdog: catches units blocked OR sliding in circles around a building
                    if (!unit._lastPos) unit._lastPos = unit.mesh.position.clone();
                    if (!unit._stuckTimer) unit._stuckTimer = 0;
                    if (unit._bestTargetDist === undefined || unit._bestTargetX !== unit.targetPosition.x || unit._bestTargetZ !== unit.targetPosition.z) {
                        unit._bestTargetX = unit.targetPosition.x;
                        unit._bestTargetZ = unit.targetPosition.z;
                        unit._bestTargetDist = dist2D;
                        unit._noProgressTicks = 0;
                    }
                    if (dist2D < unit._bestTargetDist - 0.15) {
                        unit._bestTargetDist = dist2D;
                        unit._noProgressTicks = 0;
                    } else if (!unit.isAir) {
                        unit._noProgressTicks = (unit._noProgressTicks || 0) + 1;
                    }

                    const dMoved = unit.mesh.position.distanceTo(unit._lastPos);
                    const minExpectedStep = Math.max(0.008, (unit.speed || 0.1) * combatDeltaScale * 0.35);
                    if (dMoved < minExpectedStep || unit._noProgressTicks > 90) {
                        unit._stuckTimer++;
                        if (unit._stuckTimer > 28 || unit._noProgressTicks > 90) {
                            // If destination itself is inside a building, clamp it outside so the unit doesn't orbit forever
                            const targetBlocker = (!unit.isAir && unit.taskState === 'Moving')
                                ? isPointBlockedByStructureOrObstacle(unit.targetPosition.x, unit.targetPosition.z, unit.radius || 1.2)
                                : null;
                            if (targetBlocker && targetBlocker !== unit.targetStructure) {
                                const safeTarget = clampPointOutsideStructures(unit.targetPosition, unit.radius || 1.2);
                                unit.targetPosition.copy(safeTarget);
                                unit._bestTargetDist = Math.hypot(safeTarget.x - unit.mesh.position.x, safeTarget.z - unit.mesh.position.z);
                                unit._noProgressTicks = 0;
                                unit._stuckTimer = 0;
                            } else {
                                // Find which structure is actually blocking the forward path (ignore buildings we are already walking away from)
                                const blocking = structures.find(s => {
                                    if (s === unit.targetStructure || s.health <= 0) return false;
                                    const sdx = unit.mesh.position.x - s.position.x;
                                    const sdz = unit.mesh.position.z - s.position.z;
                                    if (Math.hypot(sdx, sdz) >= (s.radius + unit.radius + 1.8)) return false;
                                    return (sdx * dx + sdz * dz) < 0; // Only if moving TOWARD the building
                                });
                                if (blocking) {
                                    const angleToS = Math.atan2(blocking.position.z - unit.mesh.position.z, blocking.position.x - unit.mesh.position.x);
                                    const bypassRadius = blocking.radius + unit.radius + 3.2;
                                    const p1X = blocking.position.x + Math.cos(angleToS + Math.PI / 2) * bypassRadius;
                                    const p1Z = blocking.position.z + Math.sin(angleToS + Math.PI / 2) * bypassRadius;
                                    const p2X = blocking.position.x + Math.cos(angleToS - Math.PI / 2) * bypassRadius;
                                    const p2Z = blocking.position.z + Math.sin(angleToS - Math.PI / 2) * bypassRadius;

                                    const d1 = Math.hypot(unit.targetPosition.x - p1X, unit.targetPosition.z - p1Z);
                                    const d2 = Math.hypot(unit.targetPosition.x - p2X, unit.targetPosition.z - p2Z);
                                    const detourX = d1 <= d2 ? p1X : p2X;
                                    const detourZ = d1 <= d2 ? p1Z : p2Z;
                                    const detourY = typeof getTerrainHeight === 'function' ? getTerrainHeight(detourX, detourZ) : 0;
                                    const detourPos = new THREE.Vector3(detourX, detourY, detourZ);

                                    if (!unit.waypoints) unit.waypoints = [];
                                    unit.waypoints.unshift(unit.targetPosition.clone());
                                    unit.targetPosition.copy(detourPos);
                                    unit._bestTargetDist = Math.hypot(detourPos.x - unit.mesh.position.x, detourPos.z - unit.mesh.position.z);
                                } else if (unit._noProgressTicks > 90 && unit.taskState === 'Moving') {
                                    unit.taskState = 'Idle';
                                    unit.targetPosition.copy(unit.mesh.position);
                                } else {
                                    const rndA = Math.random() * Math.PI * 2;
                                    unit.mesh.position.x += Math.cos(rndA) * 1.5;
                                    unit.mesh.position.z += Math.sin(rndA) * 1.5;
                                }
                                unit._noProgressTicks = 0;
                                unit._stuckTimer = 0;
                            }
                        }
                    } else {
                        unit._stuckTimer = 0;
                    }
                    unit._lastPos.copy(unit.mesh.position);

                    // Smooth angular heading rotation
                    const targetAngle = Math.atan2(-dirZ, dirX) + Math.PI / 2;
                    let diff = targetAngle - unit.mesh.rotation.y;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    unit.mesh.rotation.y += diff * 0.18;

                    // Aerodynamic banking tilt for aircraft into turns; helicopters fly horizontal with slight forward pitch
                    if (unit.isAir) {
                        const isHeli = (unit.type === 'comanche' || unit.type === 'chinook');
                        if (!isHeli) {
                            const targetBank = THREE.MathUtils.clamp(-diff * 1.6, -0.3, 0.3);
                            unit.mesh.rotation.z += (targetBank - unit.mesh.rotation.z) * 0.12;
                            unit.mesh.rotation.x += (0 - unit.mesh.rotation.x) * 0.12;
                        } else {
                            // Helicopters stay strictly horizontal at all times
                            unit.mesh.rotation.z = 0;
                            unit.mesh.rotation.x = 0;
                        }
                    } else if (INFANTRY_TYPE_SET.has(unit.type)) {
                        unit.mesh.rotation.x = 0;
                        unit.mesh.rotation.z = 0;
                        unit._strideBob = 0;
                        if (unit.mesh.userData && unit.mesh.userData.animatedMeshes) {
                            unit._runCycle = ((unit._runCycle || 0) + 0.38) % 8;
                            const c = unit._runCycle;
                            const f0 = Math.floor(c);
                            const f1 = (f0 + 1) % 8;
                            const frac = c - f0;
                            unit.mesh.userData.animatedMeshes.forEach(m => {
                                if (m.userData && m.userData.runFrames && m.userData.runFrames[f0] && m.userData.runFrames[f1]) {
                                    const arr0 = m.userData.runFrames[f0];
                                    const arr1 = m.userData.runFrames[f1];
                                    const pos = m.geometry.attributes.position.array;
                                    for (let k = 0; k < pos.length; k++) {
                                        pos[k] = arr0[k] * (1 - frac) + arr1[k] * frac;
                                    }
                                    m.geometry.attributes.position.needsUpdate = true;
                                }
                            });
                        }
                    }
                } else {
                    // Reached waypoint: advance to next waypoint if routing across bridges!
                    if (unit.waypoints && unit.waypoints.length > 0) {
                        const nextWp = unit.waypoints.shift();
                        if (nextWp && typeof nextWp.x === 'number') {
                            unit.targetPosition.copy(nextWp);
                        }
                    } else {
                        // Reached final destination! Transition to Idle so it stops driving
                        if (unit.taskState === 'Moving') {
                            unit.taskState = 'Idle';
                        }
                        unit.targetPosition.copy(unit.mesh.position);
                        if (unit.isAir) {
                            // Unit is at destination! Settle aircraft banking and pitch to zero without spinning or flipping
                            unit.mesh.rotation.z += (0 - unit.mesh.rotation.z) * 0.12;
                            unit.mesh.rotation.x += (0 - unit.mesh.rotation.x) * 0.12;
                        } else if (INFANTRY_TYPE_SET.has(unit.type)) {
                            unit.mesh.rotation.x = 0;
                            unit.mesh.rotation.z = 0;
                            unit._strideBob = 0;
                            if (unit.mesh.userData && unit.mesh.userData.animatedMeshes) {
                                unit.mesh.userData.animatedMeshes.forEach(m => {
                                    if (m.userData && m.userData.standVerts) {
                                        const std = m.userData.standVerts;
                                        const pos = m.geometry.attributes.position.array;
                                        let changed = false;
                                        for (let k = 0; k < pos.length; k++) {
                                            const diff = std[k] - pos[k];
                                            if (Math.abs(diff) > 0.001) {
                                                pos[k] += diff * 0.25;
                                                changed = true;
                                            } else {
                                                pos[k] = std[k];
                                            }
                                        }
                                        if (changed) m.geometry.attributes.position.needsUpdate = true;
                                    }
                                });
                            }
                        }
                    }
                }

                // Match unit height to hills/terrain elevation & bridge elevation
                const groundY = getTerrainHeight(unit.mesh.position.x, unit.mesh.position.z);
                if (unit.isAir) {
                    const flightAlt = unit.mesh.userData.flightAltitude || 8.5;
                    const targetY = groundY + flightAlt;
                    unit.mesh.position.y += (targetY - unit.mesh.position.y) * 0.08;
                } else {
                    const onBridge = mapBridges.find(b => isPointOnBridge(unit.mesh.position.x, unit.mesh.position.z, b));
                    unit.mesh.position.y = (onBridge ? onBridge.deckY : groundY) + (unit._strideBob || 0);
                }

                // (Ground-unit soft repulsion is handled once per frame by separateGroundUnits())

                // Prevent driving through buildings, trees, skyscrapers or map edges
                resolveObstacleCollisions(unit);
            });

            processCombatScanning();
            processBaseDefenseCombat();

            updateHealthBars();

            // PERF: only allocate/filter when at least one entity in the array actually died this frame
            if (enemyUnits.some(e => e.health <= 0)) {
                enemyUnits = enemyUnits.filter(enemy => {
                    if (enemy.health > 0) return true;
                    scene.remove(enemy.mesh);
                    createImpactExplosion(enemy.mesh.position);
                    // Authentic GLA Scrap Crate Drop Chance (SalvageCrateCollide.cpp)
                    if (Math.random() < 0.65 && (typeof getArmorCategory === 'function' ? (getArmorCategory(enemy) === 'heavy_vehicle' || getArmorCategory(enemy) === 'light_vehicle') : !INFANTRY_TYPE_SET.has(enemy.type))) {
                        if (typeof spawnScrapCrate === 'function') spawnScrapCrate(enemy.mesh.position);
                    }
                    units.forEach(unit => {
                        if (unit.combatTarget === enemy) unit.combatTarget = null;
                    });
                    return false;
                });
            }

            if (structures.some(s => s.health <= 0)) {
                structures = structures.filter(structure => {
                    if (structure.health > 0) return true;
                    if (structure.mesh) scene.remove(structure.mesh);
                    createImpactExplosion(structure.position || (structure.mesh && structure.mesh.position));
                    spawnExplosion(structure.position || (structure.mesh && structure.mesh.position), 0xff793f, 3.5);
                    showNotification(`Friendly ${structure.type} destroyed!`, 'error');
                    if (structure.dozerRef) {
                        structure.dozerRef.taskState = 'Idle';
                        structure.dozerRef.targetStructure = null;
                        structure.dozerRef = null;
                    }
                    (structure.garrisoned || []).forEach(unit => {
                        unit.garrisonedIn = null;
                        unit.health = 0;
                    });
                    if (selectedStructure === structure) {
                        selectedStructure = null;
                        updateSidebar();
                    }
                    enemyUnits.forEach(enemy => {
                        if (enemy.combatTarget === structure) enemy.combatTarget = null;
                    });
                    return false;
                });
            }

            // Filter and remove neutralized enemy buildings with explosions & notifications
            if (enemyStructures.some(s => s.health <= 0)) {
                enemyStructures = enemyStructures.filter(structure => {
                    if (structure.health > 0) return true;
                    if (structure.mesh) scene.remove(structure.mesh);
                    const expPos = structure.position || (structure.mesh && structure.mesh.position);
                    createImpactExplosion(expPos);
                    spawnExplosion(expPos, 0xff4757, 4.0);
                    showNotification(`Hostile ${structure.type} eradicated!`, 'success');
                    units.forEach(unit => {
                        if (unit.combatTarget === structure) unit.combatTarget = null;
                    });
                    return false;
                });
            }

            if (units.some(u => u.health <= 0)) {
                const previousUnitCount = units.length;
                units = units.filter(unit => {
                    if (unit.health > 0) return true;
                    removeSelectionCircle(unit);
                    if (unit.drone && unit.drone.mesh) {
                        scene.remove(unit.drone.mesh);
                        unit.drone.mesh.traverse(c => {
                            if (c.geometry && !c.geometry.userData?._shared) c.geometry.dispose();
                            if (c.material && !c.material.userData?._shared) {
                                if (Array.isArray(c.material)) c.material.forEach(m => { if (!m.userData?._shared) m.dispose(); });
                                else c.material.dispose();
                            }
                        });
                        unit.drone = null;
                    }
                    scene.remove(unit.mesh);
                    // Authentic GLA Scrap Crate Drop Chance (SalvageCrateCollide.cpp)
                    if (Math.random() < 0.65 && (typeof getArmorCategory === 'function' ? (getArmorCategory(unit) === 'heavy_vehicle' || getArmorCategory(unit) === 'light_vehicle') : !INFANTRY_TYPE_SET.has(unit.type))) {
                        if (typeof spawnScrapCrate === 'function') spawnScrapCrate(unit.mesh.position);
                    }
                    enemyUnits.forEach(enemy => {
                        if (enemy.combatTarget === unit) enemy.combatTarget = null;
                    });
                    return false;
                });
                if (units.length !== previousUnitCount) updateHUD();
            }

            // Neutral Tech Buildings Periodic Effects:
            if (isMatchActive) {
                if (window._techPassiveTimer === undefined) window._techPassiveTimer = 0;
                window._techPassiveTimer++;

                // PERF: only build allTechs on the 1-second tick when it is actually used
                if (window._techPassiveTimer % 60 === 0) {
                    const allTechs = [...(typeof structures !== 'undefined' ? structures : []), ...(window.neutralStructures || [])];

                    // 1. Tech Oil Derrick: +$200 every 12 seconds (~720 frames)
                    if (window._techPassiveTimer % 720 === 0) {
                        const playerDerricks = allTechs.filter(s => s.type === 'techOilDerrick' && (s.capturedByTeam === playerTeamId || isFriendly({ teamId: playerTeamId }, s)) && s.health > 0);
                        if (playerDerricks.length > 0) {
                            const bonus = playerDerricks.length * 200;
                            playerResources += bonus;
                            const resEl = document.getElementById('resource-display');
                            if (resEl) resEl.innerText = `$${playerResources}`;
                            if (typeof spawnFloatingCashNumber === 'function') {
                                playerDerricks.forEach(d => {
                                    if (d.position) spawnFloatingCashNumber(d.position.clone().add(new THREE.Vector3(0, 5.0, 0)), 200);
                                });
                            }
                            if (typeof showNotification === 'function') {
                                showNotification(`Tech Oil Derrick: +$${bonus} passive supply revenue received.`, 'success');
                            }
                        }
                    }

                    // 2. Tech Hospital: Passive regeneration for all friendly infantry (+2 HP every 60 frames / 1.0s)
                    const hasHospital = allTechs.some(s => s.type === 'techHospital' && (s.capturedByTeam === playerTeamId || isFriendly({ teamId: playerTeamId }, s)) && s.health > 0);
                    if (hasHospital) {
                        for (let i = 0; i < units.length; i++) {
                            const u = units[i];
                            if (u.health > 0 && u.health < u.maxHealth && !u.isAir && INFANTRY_TYPE_SET.has(u.type)) {
                                u.health = Math.min(u.maxHealth, u.health + 2);
                            }
                        }
                    }
                }

                // 3. GLA Foundation Holes Rebuilding Timer (PERF: iterate in-place without per-frame spread/filter)
                const structLists = [structures, enemyStructures];
                for (let li = 0; li < 2; li++) {
                    const sList = structLists[li];
                    for (let si = 0; si < sList.length; si++) {
                        const hole = sList[si];
                        if (hole.type !== 'glaHole' || hole.health <= 0) continue;
                        if (hole.rebuildTimer === undefined) hole.rebuildTimer = 18 * 60; // 18 seconds
                        hole.rebuildTimer--;
                        if (hole.rebuildTimer <= 0) {
                            // Reconstruct structure for free!
                            hole.health = 0;
                            if (hole.mesh) scene.remove(hole.mesh);
                            const origType = hole.originalType || 'barracks';
                            if (typeof deployBaseStructureAt === 'function') {
                                deployBaseStructureAt(origType, hole.position, hole.ownerId, hole.teamId, 'gla');
                            }
                        }
                    }
                }
            }

            // Tactical Mission Victory / Defeat Objective Check (Total Annihilation of Hostile Forces)
            // PERF: throttled to every 15 frames and uses early-exit loops instead of 4 array spreads + filters per frame
            if (isMatchActive && hasSpawnedInitialEnemyBase && (_animNodeFrame % 15 === 0)) {
                const pTeam = { teamId: playerTeamId };
                let hasHostile = false, hasFriendly = false;
                const sLists = [structures, enemyStructures];
                for (let li = 0; li < 2 && (!hasHostile || !hasFriendly); li++) {
                    const arr = sLists[li];
                    for (let i = 0; i < arr.length; i++) {
                        const s = arr[i];
                        if (s.health <= 0) continue;
                        if (isFriendly(pTeam, s)) hasFriendly = true;
                        else hasHostile = true;
                        if (hasHostile && hasFriendly) break;
                    }
                }
                const uLists = [units, enemyUnits];
                for (let li = 0; li < 2 && (!hasHostile || !hasFriendly); li++) {
                    const arr = uLists[li];
                    for (let i = 0; i < arr.length; i++) {
                        const u = arr[i];
                        if (u.health <= 0) continue;
                        if (isFriendly(pTeam, u)) {
                            hasFriendly = true;
                        } else if (u.type !== 'truck' && u.type !== 'worker' && u.type !== 'dozer') {
                            hasHostile = true;
                        }
                        if (hasHostile && hasFriendly) break;
                    }
                }

                if (!hasHostile) {
                    isMatchActive = false;
                    showNotification("MISSION ACCOMPLISHED: ALL HOSTILE FORCES ELIMINATED!", "success");
                    const ticker = document.getElementById('tactical-message');
                    if (ticker) ticker.innerHTML = '<strong style="color:#55efc4;">VICTORY: Operational theater secured. All hostile forces destroyed!</strong>';
                    if (typeof showVictoryBanner === 'function') showVictoryBanner();
                } else if (!hasFriendly) {
                    isMatchActive = false;
                    showNotification("MISSION FAILED: ALL STRATEGIC ASSETS LOST!", "error");
                    const ticker = document.getElementById('tactical-message');
                    if (ticker) ticker.innerHTML = '<strong style="color:#ff4757;">CRITICAL DEFEAT: Command Center and all friendly forces destroyed.</strong>';
                    if (typeof showDefeatBanner === 'function') showDefeatBanner();
                }
            }

            if (!isMatchActive && typeof updateShellMapDemo === 'function') {
                updateShellMapDemo(dt);
            }
            if (typeof renderRadarMinimap === 'function') renderRadarMinimap();
            renderer.render(scene, camera);
        }
function processEnemyMovement() {
    separateGroundUnits(enemyUnits);
    enemyUnits.forEach(enemy => {
        if (enemy.health <= 0) return;

        // Authentic Aircraft & Helicopter Flight Dynamics for AI
        if (enemy.isAir) {
            const isHeli = (enemy.type === 'comanche' || enemy.type === 'chinook');
            if (!enemy.patrolCenter) enemy.patrolCenter = enemy.mesh.position.clone();
            if (!enemy.circleRadius) enemy.circleRadius = isHeli ? 11.0 : 16.0;
            if (enemy.circleAngle === undefined) enemy.circleAngle = Math.random() * Math.PI * 2;
            if (!enemy.airState) enemy.airState = isHeli ? 'hovering' : 'circling';

            const cruiseAlt = (enemy.mesh.userData && enemy.mesh.userData.flightAltitude) ? enemy.mesh.userData.flightAltitude : 8.5;
            const targetY = (typeof getTerrainHeight === 'function' ? getTerrainHeight(enemy.mesh.position.x, enemy.mesh.position.z) : 0) + cruiseAlt;
            enemy.mesh.position.y += (targetY - enemy.mesh.position.y) * 0.08;

            const target = enemy.combatTarget;
            const targetPos = target && (target.position || (target.mesh && target.mesh.position));

            // 1. Actively engaging a target
            if (target && target.health > 0 && targetPos) {
                const dxT = targetPos.x - enemy.mesh.position.x;
                const dzT = targetPos.z - enemy.mesh.position.z;
                const distT = Math.hypot(dxT, dzT);

                if (isHeli) {
                    // AI Helicopter: Face target, dip nose, and strafe sideways
                    const aimAngle = Math.atan2(-dzT, dxT) + Math.PI / 2;
                    let diff = aimAngle - enemy.mesh.rotation.y;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    enemy.mesh.rotation.y += diff * 0.20;

                    if (distT > 20.0) {
                        const dirX = dxT / distT;
                        const dirZ = dzT / distT;
                        enemy.mesh.position.x += dirX * enemy.speed * combatDeltaScale;
                        enemy.mesh.position.z += dirZ * enemy.speed * combatDeltaScale;
                        enemy.mesh.rotation.x = 0.14;
                    } else {
                        if (enemy.strafeDir === undefined) enemy.strafeDir = (Math.random() < 0.5 ? 1 : -1);
                        enemy.strafeTimer = (enemy.strafeTimer || 0) + 1;
                        if (enemy.strafeTimer > 75) {
                            enemy.strafeTimer = 0;
                            enemy.strafeDir *= -1;
                        }
                        const perpX = -dzT / distT;
                        const perpZ = dxT / distT;
                        enemy.mesh.position.x += perpX * (enemy.speed * 0.60 * combatDeltaScale * enemy.strafeDir);
                        enemy.mesh.position.z += perpZ * (enemy.speed * 0.60 * combatDeltaScale * enemy.strafeDir);
                        enemy.mesh.rotation.z = enemy.strafeDir * 0.20;
                        enemy.mesh.rotation.x = 0.15;
                    }
                } else {
                    // AI Airplane: High-speed strafe run and overshoot
                    if (!enemy.planePhase) enemy.planePhase = 'inbound';
                    const planeSpeed = enemy.speed * 1.30 * combatDeltaScale;

                    if (enemy.planePhase === 'inbound') {
                        const dirX = dxT / distT;
                        const dirZ = dzT / distT;
                        enemy.mesh.position.x += dirX * planeSpeed;
                        enemy.mesh.position.z += dirZ * planeSpeed;
                        enemy.mesh.rotation.y = Math.atan2(-dirZ, dirX) + Math.PI / 2;
                        enemy.mesh.rotation.x = -0.08;

                        if (distT <= 16.0) {
                            if (enemy.attackCooldown === 0) executeWeaponFire(enemy, target);
                            enemy.planePhase = 'overshoot';
                            enemy.overshootDirX = dirX;
                            enemy.overshootDirZ = dirZ;
                            enemy.overshootDist = 0;
                        }
                    } else if (enemy.planePhase === 'overshoot') {
                        enemy.mesh.position.x += enemy.overshootDirX * (planeSpeed * 1.35);
                        enemy.mesh.position.z += enemy.overshootDirZ * (planeSpeed * 1.35);
                        enemy.overshootDist += planeSpeed * 1.35;
                        if (enemy.overshootDist >= 32.0) enemy.planePhase = 'turnaround';
                    } else if (enemy.planePhase === 'turnaround') {
                        enemy.mesh.rotation.y += 0.040;
                        enemy.mesh.rotation.z = -0.38;
                        enemy.mesh.position.x += Math.sin(enemy.mesh.rotation.y) * planeSpeed;
                        enemy.mesh.position.z += Math.cos(enemy.mesh.rotation.y) * planeSpeed;
                        const angleToTarget = Math.atan2(-dzT, dxT) + Math.PI / 2;
                        let aDiff = Math.abs(angleToTarget - enemy.mesh.rotation.y);
                        while (aDiff > Math.PI) aDiff = Math.abs(aDiff - Math.PI * 2);
                        if (aDiff < 0.45) enemy.planePhase = 'inbound';
                    }
                }
                return;
            }

            // 2. Normal flight or idle hovering / holding pattern
            const dx = enemy.targetPosition.x - enemy.mesh.position.x;
            const dz = enemy.targetPosition.z - enemy.mesh.position.z;
            const distToGoal = Math.hypot(dx, dz);

            if (distToGoal > (isHeli ? 1.5 : 3.5)) {
                const dirX = dx / distToGoal;
                const dirZ = dz / distToGoal;
                enemy.mesh.position.x += dirX * enemy.speed * combatDeltaScale;
                enemy.mesh.position.z += dirZ * enemy.speed * combatDeltaScale;
                enemy.mesh.rotation.y = Math.atan2(-dirZ, dirX) + Math.PI / 2;
                if (isHeli) enemy.mesh.rotation.x = 0.14;
                enemy.patrolCenter.copy(enemy.targetPosition);
            } else {
                if (isHeli) {
                    // Hover in place!
                    enemy.mesh.rotation.x = 0;
                    enemy.mesh.rotation.z = 0;
                } else {
                    // Circling holding pattern for airplanes
                    enemy.circleAngle += 0.022 * combatDeltaScale;
                    const tX = enemy.patrolCenter.x + Math.cos(enemy.circleAngle) * enemy.circleRadius;
                    const tZ = enemy.patrolCenter.z + Math.sin(enemy.circleAngle) * enemy.circleRadius;
                    const cDx = tX - enemy.mesh.position.x;
                    const cDz = tZ - enemy.mesh.position.z;
                    const cDist = Math.hypot(cDx, cDz);
                    if (cDist > 0.1) {
                        const cSpeed = enemy.speed * 0.85 * combatDeltaScale;
                        enemy.mesh.position.x += (cDx / cDist) * cSpeed;
                        enemy.mesh.position.z += (cDz / cDist) * cSpeed;
                        const fwdX = -Math.sin(enemy.circleAngle);
                        const fwdZ = Math.cos(enemy.circleAngle);
                        enemy.mesh.rotation.y = Math.atan2(-fwdZ, fwdX) + Math.PI / 2;
                        enemy.mesh.rotation.z = -0.28;
                    }
                }
            }
            return;
        }

        // Ground vehicle and infantry movement
        const target = enemy.combatTarget;
        const targetPos = target && (target.position || target.mesh.position);
        const targetRadius = target ? (target.radius || 0) : 0;
        if (target && target.health > 0 && enemy.mesh.position.distanceTo(targetPos) <= (enemy.scanRange + targetRadius - 2)) {
            enemy.targetPosition.copy(enemy.mesh.position);
            return;
        }

        const dx = enemy.targetPosition.x - enemy.mesh.position.x;
        const dz = enemy.targetPosition.z - enemy.mesh.position.z;
        const dist2D = Math.hypot(dx, dz);
        if (dist2D > 0.4) {
            const dirX = dx / dist2D;
            const dirZ = dz / dist2D;
            const step = Math.min(dist2D, enemy.speed * combatDeltaScale);
            enemy.mesh.position.x += dirX * step;
            enemy.mesh.position.z += dirZ * step;

            // AI Anti-Stuck Watchdog: prevent dozers/units from vibrating forever against obstacles
            if (!enemy.isAir) {
                enemy._aiStuckTick = (enemy._aiStuckTick || 0) + 1;
                if (!enemy._aiLastPos) enemy._aiLastPos = enemy.mesh.position.clone();
                if (enemy._aiStuckTick >= 40) {
                    const moved = Math.hypot(enemy.mesh.position.x - enemy._aiLastPos.x, enemy.mesh.position.z - enemy._aiLastPos.z);
                    enemy._aiLastPos.copy(enemy.mesh.position);
                    enemy._aiStuckTick = 0;
                    if (moved < 0.25) {
                        const sideAngle = ((enemy.netId || 1) % 2 === 0 ? 1 : -1) * (Math.PI / 2);
                        const perpX = Math.cos(sideAngle) * dirX - Math.sin(sideAngle) * dirZ;
                        const perpZ = Math.sin(sideAngle) * dirX + Math.cos(sideAngle) * dirZ;
                        const detour = new THREE.Vector3(enemy.mesh.position.x + perpX * 14, 0, enemy.mesh.position.z + perpZ * 14);
                        if (!enemy.waypoints) enemy.waypoints = [];
                        enemy.waypoints.unshift(enemy.targetPosition.clone());
                        enemy.targetPosition.copy(detour);
                    }
                }
            }

            // Authentic Tank Crushing by AI vehicles (SquishCollide.cpp)
            if (CRUSHER_TANK_SET.has(enemy.type)) {
                for (let ally of units) {
                    if (ally.health > 0 && ally.mesh && !isFriendly(enemy, ally) && (typeof getArmorCategory === 'function' ? getArmorCategory(ally) === 'infantry' : INFANTRY_TYPE_SET.has(ally.type))) {
                        const infDist = Math.hypot(enemy.mesh.position.x - ally.mesh.position.x, enemy.mesh.position.z - ally.mesh.position.z);
                        if (infDist <= ((enemy.radius || 1.8) + (ally.radius || 0.6)) * 0.95) {
                            const toX = ally.mesh.position.x - enemy.mesh.position.x;
                            const toZ = ally.mesh.position.z - enemy.mesh.position.z;
                            if (toX * dirX + toZ * dirZ > 0) {
                                ally.health = 0;
                                if (typeof spawnSquishDecal === 'function') spawnSquishDecal(ally.mesh.position);
                                playAudio('infantry_squish');
                                if (typeof showNotification === 'function') {
                                    showNotification(`Friendly ${ally.type.toUpperCase()} crushed by hostile tank!`, 'error');
                                }
                                enemy.kills = (enemy.kills || 0) + 1;
                            }
                        }
                    }
                }
            }
            enemy.mesh.rotation.y = Math.atan2(-dirZ, dirX) + Math.PI / 2;
            if (INFANTRY_TYPE_SET.has(enemy.type)) {
                enemy.mesh.rotation.x = 0;
                enemy.mesh.rotation.z = 0;
                enemy._strideBob = 0;
                if (enemy.mesh.userData && enemy.mesh.userData.animatedMeshes) {
                    enemy._runCycle = ((enemy._runCycle || 0) + 0.38) % 8;
                    const c = enemy._runCycle;
                    const f0 = Math.floor(c);
                    const f1 = (f0 + 1) % 8;
                    const frac = c - f0;
                    enemy.mesh.userData.animatedMeshes.forEach(m => {
                        if (m.userData && m.userData.runFrames && m.userData.runFrames[f0] && m.userData.runFrames[f1]) {
                            const arr0 = m.userData.runFrames[f0];
                            const arr1 = m.userData.runFrames[f1];
                            const pos = m.geometry.attributes.position.array;
                            for (let k = 0; k < pos.length; k++) {
                                pos[k] = arr0[k] * (1 - frac) + arr1[k] * frac;
                            }
                            m.geometry.attributes.position.needsUpdate = true;
                        }
                    });
                }
            }
        } else {
            if (enemy.waypoints && enemy.waypoints.length > 0) {
                const nextWp = enemy.waypoints.shift();
                enemy.targetPosition.copy(nextWp);
            }
            if (INFANTRY_TYPE_SET.has(enemy.type)) {
                enemy.mesh.rotation.x = 0;
                enemy.mesh.rotation.z = 0;
                enemy._strideBob = 0;
                if (enemy.mesh.userData && enemy.mesh.userData.animatedMeshes) {
                    enemy.mesh.userData.animatedMeshes.forEach(m => {
                        if (m.userData && m.userData.standVerts) {
                            const std = m.userData.standVerts;
                            const pos = m.geometry.attributes.position.array;
                            let changed = false;
                            for (let k = 0; k < pos.length; k++) {
                                const diff = std[k] - pos[k];
                                if (Math.abs(diff) > 0.001) {
                                    pos[k] += diff * 0.25;
                                    changed = true;
                                } else {
                                    pos[k] = std[k];
                                }
                            }
                            if (changed) m.geometry.attributes.position.needsUpdate = true;
                        }
                    });
                }
            }
        }

        // Match enemy ground height on hills & resolve obstacle collisions
        const eGroundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(enemy.mesh.position.x, enemy.mesh.position.z) : 0;
        enemy.mesh.position.y = eGroundY + (enemy._strideBob || 0);
        resolveObstacleCollisions(enemy);
    });
}

function processEnemyCombat() {
    enemyUnits.forEach(enemy => {
        if (enemy.health <= 0) return;
        if (enemy.attackCooldown > 0) enemy.attackCooldown = Math.max(0, enemy.attackCooldown - combatDeltaScale);

        const target = enemy.combatTarget;
        if (!target || target.health <= 0 || isFriendly(enemy, target)) {
            enemy.combatTarget = null;
            return;
        }

        const targetPos = target.position || target.mesh.position;
        const targetRadius = target.radius || 0;
        const distToTarget = enemy.mesh.position.distanceTo(targetPos);
        const minRange = (enemy.type === 'tomahawk' || enemy.type === 'nukecannon' || enemy.type === 'nuketank') ? (enemy.minRange || 16.0) : 0;
        if (distToTarget <= (enemy.scanRange + targetRadius) && distToTarget >= minRange && !(enemy.type === 'tomahawk' && target.isAir) && enemy.attackCooldown === 0) {
            const turret = getCachedNode(enemy.mesh, "turretSystem");
            if (turret && turret.parent) {
                const localTarget = turret.parent.worldToLocal(targetPos.clone());
                turret.rotation.y = Math.atan2(localTarget.x, localTarget.z);
            }
            executeWeaponFire(enemy, target);
        }
    });
}

        function updateHUD() {
            updateSidebar();
        }
        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

                // =========================================================================
        
// =========================================================================
// AUTHENTIC POINT DEFENSE LASER SYSTEM (PointDefenseLaserUpdate.cpp)
// =========================================================================
function processPointDefenseLasers() {
    const allLivingUnits = (typeof units !== 'undefined' && typeof enemyUnits !== 'undefined')
        ? [...units, ...enemyUnits] : [];
    if (allLivingUnits.length === 0) return;

    allLivingUnits.forEach(defender => {
        if (defender.health <= 0 || !defender.mesh) return;

        const hasPDL = (defender.type === 'paladin') || (defender.drone && defender.drone.type === 'battle');
        if (!hasPDL) return;

        if (defender.pdlCooldown > 0) {
            defender.pdlCooldown = Math.max(0, defender.pdlCooldown - (typeof combatDeltaScale !== 'undefined' ? combatDeltaScale : 1.0));
            return;
        }

        const scanRange = (defender.type === 'paladin') ? 22.0 : 16.0;
        const myPos = defender.mesh.position;

        if (typeof activeMissiles !== 'undefined' && activeMissiles.length > 0) {
            for (let missile of activeMissiles) {
                if (missile.intercepted) continue;
                const attacker = missile.metadata ? missile.metadata.attacker : null;
                if (attacker && typeof isFriendly === 'function' && isFriendly(defender, attacker)) continue;

                const dist = myPos.distanceTo(missile.curPos);
                if (dist <= scanRange) {
                    // Intercept missile in mid-air!
                    missile.intercepted = true;
                    const laserOrigin = (defender.drone && defender.drone.mesh)
                        ? defender.drone.mesh.position.clone()
                        : myPos.clone().add(new THREE.Vector3(0, 1.8, 0));

                    if (typeof spawnLaserBeam === 'function') spawnLaserBeam(laserOrigin, missile.curPos, 0x00ffff, 2.8);
                    if (typeof spawnMuzzleFlash === 'function') spawnMuzzleFlash(laserOrigin, 0x00ffff, 0.4);
                    playAudio('laser_point_defense');
                    defender.pdlCooldown = (defender.type === 'paladin') ? 65 : 85;

                    if (typeof showNotification === 'function' && typeof units !== 'undefined' && units.includes(defender)) {
                        showNotification('★ Point Defense Laser intercepted hostile missile!', 'info');
                    }
                    return;
                }
            }
        }

        // Authentic Paladin Tank Anti-Infantry Laser Zap (when no missiles need interception)
        if (defender.type === 'paladin' && defender.pdlCooldown === 0) {
            const infRangeSq = 14.0 * 14.0;
            const hostileInf = allLivingUnits.find(e =>
                e.health > 0 && e.mesh && !e.isAir && !isFriendly(defender, e) &&
                (typeof getArmorCategory === 'function' ? getArmorCategory(e) === 'infantry' : false) &&
                myPos.distanceToSquared(e.mesh.position) <= infRangeSq
            );
            if (hostileInf) {
                const laserOrigin = myPos.clone().add(new THREE.Vector3(0, 1.8, 0));
                if (typeof spawnLaserBeam === 'function') spawnLaserBeam(laserOrigin, hostileInf.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 0x00ffff, 2.5);
                if (typeof spawnMuzzleFlash === 'function') spawnMuzzleFlash(laserOrigin, 0x00ffff, 0.35);
                playAudio('laser_point_defense');
                defender.pdlCooldown = 75;
                if (typeof applyCalculatedDamage === 'function') {
                    applyCalculatedDamage(defender, hostileInf, 40, 'SNIPER');
                }
            }
        }
    });
}

// =========================================================================
// AUTHENTIC GLA SALVAGE SCRAP COLLECTION (SalvageCrateCollide.cpp)
// =========================================================================
function processScrapCrateCollection() {
    if (typeof activeScrapCrates === 'undefined' || activeScrapCrates.length === 0) return;
    const allLivingUnits = (typeof units !== 'undefined' && typeof enemyUnits !== 'undefined')
        ? [...units, ...enemyUnits] : [];

    for (let cIdx = activeScrapCrates.length - 1; cIdx >= 0; cIdx--) {
        const crate = activeScrapCrates[cIdx];
        if (!crate || !crate.mesh) continue;

        const weaponSalvagers = ['technical', 'scorpion', 'marauder', 'quad', 'buggy', 'toxintractor'];
        const glaSalvagers = [...weaponSalvagers, 'scud', 'bombtruck', 'radarvan'];
        for (let u of allLivingUnits) {
            if (u.health > 0 && u.mesh && glaSalvagers.includes(u.type)) {
                const d = Math.hypot(u.mesh.position.x - crate.position.x, u.mesh.position.z - crate.position.z);
                if (d <= (u.radius || 1.5) + 1.5) {
                    // Pick up crate!
                    scene.remove(crate.mesh);
                    crate.mesh.traverse(child => {
                        if (child.geometry && !(child.geometry.userData && child.geometry.userData._shared)) child.geometry.dispose();
                        if (child.material && !(child.material.userData && child.material.userData._shared)) child.material.dispose();
                    });
                    activeScrapCrates.splice(cIdx, 1);
                    playAudio('scrap_pickup', {}, 'gla');
                    if (typeof spawnMuzzleFlash === 'function') spawnMuzzleFlash(u.mesh.position, 0x2ed573, 1.2);

                    if (weaponSalvagers.includes(u.type) && (u.salvageLevel || 0) < 2) {
                        u.salvageLevel = (u.salvageLevel || 0) + 1;
                        if (u.salvageLevel === 1) {
                            if (typeof showNotification === 'function' && typeof units !== 'undefined' && units.includes(u)) {
                                showNotification(`★ ${u.type.toUpperCase()} salvaged scrap: WEAPONS UPGRADED!`, 'success');
                            }
                        } else if (u.salvageLevel === 2) {
                            u.maxHealth = Math.floor(u.maxHealth * 1.3);
                            u.health = u.maxHealth;
                            if (typeof showNotification === 'function' && typeof units !== 'undefined' && units.includes(u)) {
                                showNotification(`★★ ${u.type.toUpperCase()} salvaged scrap: HEAVY ARMOR MAXED!`, 'success');
                            }
                        }
                    } else {
                        u.health = u.maxHealth;
                        if (typeof units !== 'undefined' && units.includes(u)) {
                            playerResources += 500;
                            if (typeof updateSidebar === 'function') updateSidebar();
                            if (typeof showNotification === 'function') {
                                showNotification('💰 GLA salvaged scrap converted into +$500 Cash!', 'success');
                            }
                        }
                    }
                    break;
                }
            }
        }
    }
}

// =========================================================================
// AUTHENTIC ZERO HOUR ANIMATED 3D SHELL MAP (MAIN MENU BACKGROUND)
// =========================================================================
window._shellMapState = null;

function cleanupShellMapDemo() {
    const st = window._shellMapState;
    if (!st) return;
    if (st.group && typeof scene !== 'undefined' && scene) {
        scene.remove(st.group);
    }
    window._shellMapState = null;
}
window.cleanupShellMapDemo = cleanupShellMapDemo;

function initShellMapDemo() {
    if (typeof scene === 'undefined' || !scene || typeof camera === 'undefined' || !camera || typeof THREE === 'undefined') return;
    if (typeof isMatchActive !== 'undefined' && isMatchActive) return;

    cleanupShellMapDemo();

    if (typeof terrainMesh === 'undefined' || !terrainMesh) {
        if (typeof setupMapEnvironment === 'function') {
            setupMapEnvironment('tournament_desert', 900);
        }
    }

    const group = new THREE.Group();
    group.name = 'ShellMapDemoGroup';
    scene.add(group);

    const hAt = (x, z) => (typeof getTerrainHeight === 'function' ? getTerrainHeight(x, z) : 0);
    const placeBuilding = (w3dKey, fallbackFn, x, z, rotY, isEnemy) => {
        let mesh = null;
        if (typeof createW3DBuildingMesh === 'function' && window.W3D_BUILDING_DATA && window.W3D_BUILDING_DATA[w3dKey]) {
            mesh = createW3DBuildingMesh(w3dKey, isEnemy);
        } else if (typeof fallbackFn === 'function') {
            mesh = fallbackFn(isEnemy);
        }
        if (!mesh) return;
        mesh.position.set(x, hAt(x, z), z);
        mesh.rotation.y = rotY;
        group.add(mesh);
    };

    // West Ridge: USA Airbase & Forward Command
    placeBuilding('usa_commandCenter', typeof createUSACommandCenter === 'function' ? createUSACommandCenter : null, -92, -35, 0.4, false);
    placeBuilding('usa_airfield', typeof createAirfield === 'function' ? createAirfield : null, -118, 10, 0.25, false);
    placeBuilding('usa_strategyCenter', typeof createStrategyCenter === 'function' ? createStrategyCenter : null, -72, -62, 0.6, false);
    placeBuilding('usa_patriot', typeof createPatriotBattery === 'function' ? createPatriotBattery : null, -52, -18, 0.5, false);
    placeBuilding('usa_patriot', typeof createPatriotBattery === 'function' ? createPatriotBattery : null, -58, 28, 0.2, false);

    // East Ridge: China / GLA Forward Position
    placeBuilding('china_commandCenter', typeof createChinaCommandCenter === 'function' ? createChinaCommandCenter : null, 95, 30, -2.5, true);
    placeBuilding('china_warFactory', typeof createChinaWarFactory === 'function' ? createChinaWarFactory : null, 118, -12, -2.7, true);
    placeBuilding('china_propagandaCenter', typeof createPropagandaCenter === 'function' ? createPropagandaCenter : null, 72, 58, -2.2, true);
    placeBuilding('gla_bunker', null, 52, 16, -2.4, true);

    const makeUnit = (key, isEnemy) => {
        if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA[key]) {
            return createW3DVehicleMesh(key, isEnemy);
        }
        const g = new THREE.Group();
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(3.2, 1.4, 4.6),
            new THREE.MeshStandardMaterial({ color: isEnemy ? 0x9b2c2c : 0x2c5282, roughness: 0.6 })
        );
        body.position.y = 0.8;
        g.add(body);
        return g;
    };

    const convoys = [
        { key: 'paladin', isEnemy: false, cx: -28, cz: -14, rx: 22, rz: 18, speed: 0.22, phase: 0.0 },
        { key: 'crusader', isEnemy: false, cx: -34, cz: 16, rx: 18, rz: 20, speed: 0.24, phase: 1.8 },
        { key: 'humvee', isEnemy: false, cx: -20, cz: 4, rx: 16, rz: 14, speed: 0.34, phase: 3.1 },
        { key: 'overlord', isEnemy: true, cx: 28, cz: 12, rx: 20, rz: 18, speed: -0.18, phase: 0.6 },
        { key: 'battlemaster', isEnemy: true, cx: 36, cz: -16, rx: 18, rz: 16, speed: -0.24, phase: 2.5 },
        { key: 'scorpion', isEnemy: true, cx: 22, cz: -4, rx: 15, rz: 14, speed: -0.32, phase: 4.2 }
    ];
    convoys.forEach(c => {
        c.mesh = makeUnit(c.key, c.isEnemy);
        c.fireTimer = 0.8 + Math.random() * 2.2;
        group.add(c.mesh);
    });

    const aircraft = [
        { key: 'raptor', isEnemy: false, rx: 135, rz: 95, alt: 34, speed: 0.36, phase: 0.0 },
        { key: 'aurora', isEnemy: false, rx: 155, rz: 110, alt: 42, speed: 0.42, phase: 2.1 },
        { key: 'comanche', isEnemy: false, rx: 85, rz: 65, alt: 22, speed: 0.28, phase: 4.0 },
        { key: 'mig', isEnemy: true, rx: 130, rz: 90, alt: 36, speed: -0.38, phase: 1.2 }
    ];
    aircraft.forEach(a => {
        a.mesh = makeUnit(a.key, a.isEnemy);
        group.add(a.mesh);
    });

    window._shellMapState = {
        group,
        time: 0,
        convoys,
        aircraft
    };
}
window.initShellMapDemo = initShellMapDemo;

function updateShellMapDemo(dt) {
    const st = window._shellMapState;
    if (!st || !st.group) return;
    if (typeof camera === 'undefined' || !camera) return;

    st.time += dt;
    const t = st.time;
    const hAt = (x, z) => (typeof getTerrainHeight === 'function' ? getTerrainHeight(x, z) : 0);

    // Smooth Zero Hour ShellMap cinematic camera flyover (sweeping figure-8 + altitude banks)
    const camAngle = t * 0.085;
    const camRadius = 96 + Math.sin(t * 0.17) * 24;
    const camX = Math.cos(camAngle) * camRadius;
    const camZ = Math.sin(camAngle * 1.15) * camRadius * 0.72;
    const camY = hAt(camX, camZ) + 34 + Math.sin(t * 0.23) * 11;
    camera.position.set(camX, camY, camZ);
    camera.lookAt(Math.sin(t * 0.11) * 26, hAt(0, 0) + 5, Math.cos(t * 0.09) * 18);

    // Move armored columns & fire periodic tracers across the valley
    for (let i = 0; i < st.convoys.length; i++) {
        const c = st.convoys[i];
        const ang = t * c.speed + c.phase;
        const x = c.cx + Math.cos(ang) * c.rx;
        const z = c.cz + Math.sin(ang) * c.rz;
        const dx = -Math.sin(ang) * c.rx * c.speed;
        const dz = Math.cos(ang) * c.rz * c.speed;
        c.mesh.position.set(x, hAt(x, z), z);
        c.mesh.rotation.y = Math.atan2(dx, dz);

        c.fireTimer -= dt;
        if (c.fireTimer <= 0) {
            c.fireTimer = 1.6 + Math.random() * 2.6;
            const opp = st.convoys[(i + 3) % st.convoys.length];
            if (opp && opp.mesh) {
                const startPos = c.mesh.position.clone().add(new THREE.Vector3(0, 2.2, 0));
                const endPos = opp.mesh.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 1.5, (Math.random() - 0.5) * 8));
                if (typeof spawnMuzzleFlash === 'function') spawnMuzzleFlash(startPos, c.isEnemy ? 0xff7733 : 0xffcc44, 0.75);
                if (typeof spawnTracer === 'function') {
                    spawnTracer(startPos, endPos, c.isEnemy ? 0xff5533 : 0xffdd55);
                }
                if (typeof spawnExplosion === 'function' && Math.random() < 0.45) {
                    spawnExplosion(endPos, 1.4, 0xff8833);
                }
            }
        }
    }

    // Fly aircraft overhead in banked passes
    for (let i = 0; i < st.aircraft.length; i++) {
        const a = st.aircraft[i];
        const ang = t * a.speed + a.phase;
        const x = Math.cos(ang) * a.rx;
        const z = Math.sin(ang) * a.rz;
        const dx = -Math.sin(ang) * a.rx * a.speed;
        const dz = Math.cos(ang) * a.rz * a.speed;
        a.mesh.position.set(x, hAt(x, z) + a.alt + Math.sin(t * 0.9 + i) * 2.5, z);
        a.mesh.rotation.y = Math.atan2(dx, dz);
        a.mesh.rotation.z = (a.speed > 0 ? -1 : 1) * 0.24;
    }
}
window.updateShellMapDemo = updateShellMapDemo;
