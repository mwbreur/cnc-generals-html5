const AA_CAPABLE_UNITS = new Set([
    'rocket', 'missiledefender', 'humvee', 'patriot', 'avenger',
    'tankhunter', 'gatling', 'gatlingTank', 'gatlingCannon',
    'rpg', 'quad', 'stingerSite',
    'raptor', 'mig'
]);
const GROUND_ONLY_AIRCRAFT = new Set(['aurora', 'stealthfighter', 'comanche']);

function hasHumveeTowMissile(unit) {
    if (!unit || unit.type !== 'humvee') return false;
    if (unit.isAI) {
        const diff = unit.aiDifficulty || unit.difficulty;
        return diff === 'medium' || diff === 'hard';
    }
    return typeof researchedTechs !== 'undefined' && researchedTechs.has('towMissile');
}

function canUnitTarget(attacker, target) {
    if (!attacker || !target) return false;
    const curTick = (typeof buildingTick !== 'undefined') ? buildingTick : 0;
    if (target.isStealthed && !(target.revealedUntil && target.revealedUntil > curTick)) {
        return false;
    }
    if (target.isAir) {
        if (GROUND_ONLY_AIRCRAFT.has(attacker.type)) return false;
        if (attacker.type === 'humvee') return hasHumveeTowMissile(attacker);
        return AA_CAPABLE_UNITS.has(attacker.type);
    }
    return true;
}
if (typeof window !== 'undefined') window.canUnitTarget = canUnitTarget;

// Checks whether a hostile target at targetPos is revealed by the unit's own ShroudClearingRange, Fog of War, or an allied spotter
function isTargetSpottedForUnit(unit, targetPos, targetRadius = 0) {
    if (!unit || !unit.mesh || !targetPos) return false;
    // If the target is directly visible in the player's Fog of War (Spy Drone, Satellite Scan, Scout Drone, allied sight, etc.), allow firing!
    if (!unit.isAI && typeof isPositionVisible === 'function' && isPositionVisible(targetPos.x, targetPos.z)) {
        return true;
    }
    const getSight = (ent) => {
        let v = (typeof INIZH_SHROUD_RANGE !== 'undefined' && ent.type && INIZH_SHROUD_RANGE[ent.type] !== undefined)
            ? INIZH_SHROUD_RANGE[ent.type]
            : (ent.visionRange !== undefined ? ent.visionRange : (ent.scanRange || 24));
        if (ent.drone && ent.drone.type === 'scout') v = Math.max(v * 1.35, 65);
        if (typeof battlePlan !== 'undefined' && battlePlan === 'search' && !ent.isAI) v *= 1.2;
        return Math.max(v || 0, ent.visionRange || 0);
    };
    const uPos = unit.mesh.position;
    const ownVision = getSight(unit) + targetRadius;
    const dx = uPos.x - targetPos.x, dz = uPos.z - targetPos.z;
    if (dx * dx + dz * dz <= ownVision * ownVision) return true;

    // Beyond own ShroudClearingRange (e.g. Tomahawk 43u -> 75.6u, SCUD 65u -> 75.6u): requires friendly spotter
    const friendUnits = unit.isAI ? (typeof enemyUnits !== 'undefined' ? enemyUnits : []) : (typeof units !== 'undefined' ? units : []);
    for (let i = 0; i < friendUnits.length; i++) {
        const f = friendUnits[i];
        if (!f || f === unit || f.health <= 0 || !f.mesh) continue;
        if (typeof isFriendly === 'function' && !isFriendly(unit, f)) continue;
        const fVis = getSight(f) + targetRadius;
        const fdx = f.mesh.position.x - targetPos.x, fdz = f.mesh.position.z - targetPos.z;
        if (fdx * fdx + fdz * fdz <= fVis * fVis) return true;
    }
    const friendStructs = unit.isAI ? (typeof enemyStructures !== 'undefined' ? enemyStructures : []) : (typeof structures !== 'undefined' ? structures : []);
    for (let i = 0; i < friendStructs.length; i++) {
        const s = friendStructs[i];
        if (!s || s.health <= 0 || s.isBuilding) continue;
        if (typeof isFriendly === 'function' && !isFriendly(unit, s)) continue;
        const sp = s.position || (s.mesh && s.mesh.position);
        if (!sp) continue;
        const sVis = 43.0 + targetRadius;
        const sdx = sp.x - targetPos.x, sdz = sp.z - targetPos.z;
        if (sdx * sdx + sdz * sdz <= sVis * sVis) return true;
    }
    return false;
}
window.isTargetSpottedForUnit = isTargetSpottedForUnit;

let _combatScanTick = 0;
const _NON_COMBAT_SUPPORT_TYPES = new Set(['chinook', 'truck', 'worker', 'dozer', 'ambulance', 'radarvan', 'crawler', 'blacklotus', 'hijacker', 'pilot', 'drone_scout']);
function processOverlordGatlingTower(unit, spatialMap = null, unitIndex = 0) {
    if (!unit || unit.type !== 'overlord' || unit.overlordUpgrade !== 'gatling' || unit.health <= 0 || !unit.mesh) return;
    if (unit.isUnmanned || (unit.disabledUntil && typeof buildingTick !== 'undefined' && buildingTick < unit.disabledUntil)) return;
    if (unit.overlordGatCooldown === undefined) unit.overlordGatCooldown = 0;
    if (unit.overlordGatCooldown > 0) unit.overlordGatCooldown = Math.max(0, unit.overlordGatCooldown - combatDeltaScale);
    const gatRange = 43.2;
    const curTick = (typeof buildingTick !== 'undefined') ? buildingTick : 0;
    const isValidGatTarget = (h) => {
        if (!h || h.health <= 0 || isFriendly(unit, h)) return false;
        if (h.isStealthed && !(h.revealedUntil && h.revealedUntil > curTick)) return false;
        const hPos = h.position || (h.mesh && h.mesh.position);
        if (!hPos) return false;
        return Math.hypot(unit.mesh.position.x - hPos.x, unit.mesh.position.z - hPos.z) <= gatRange + (h.radius || 0);
    };
    let bestTarget = isValidGatTarget(unit._overlordGatTarget) ? unit._overlordGatTarget : null;
    if (!bestTarget && ((_combatScanTick + unitIndex) % 4 === 0)) {
        let bestScore = -Infinity;
        const considerList = (list) => {
            if (!list) return;
            for (let hi = 0; hi < list.length; hi++) {
                const h = list[hi];
                if (!isValidGatTarget(h)) continue;
                const hPos = h.position || h.mesh.position;
                const d = Math.hypot(unit.mesh.position.x - hPos.x, unit.mesh.position.z - hPos.z);
                let score = 100 - d;
                if (h.isAir) score += 60;
                if (getArmorCategory(h) === 'infantry') score += 30;
                if (score > bestScore) { bestScore = score; bestTarget = h; }
            }
        };
        if (unit.isEnemy || unit.isAI) {
            considerList(typeof units !== 'undefined' ? units : null);
            considerList(typeof structures !== 'undefined' ? structures : null);
            considerList(typeof enemyUnits !== 'undefined' ? enemyUnits : null);
            considerList(typeof enemyStructures !== 'undefined' ? enemyStructures : null);
        } else {
            const candUnits = spatialMap
                ? _queryCombatSpatialMap(spatialMap, unit.mesh.position.x, unit.mesh.position.z, gatRange + 8)
                : (typeof enemyUnits !== 'undefined' ? enemyUnits : null);
            considerList(candUnits);
            considerList(typeof enemyStructures !== 'undefined' ? enemyStructures : null);
        }
        unit._overlordGatTarget = bestTarget;
    }
    const upgMesh = unit.overlordUpgradeMesh || getCachedNode(unit.mesh, "overlordUpgrade");
    if (bestTarget && upgMesh) {
        const aimPos = (bestTarget.position || bestTarget.mesh.position).clone();
        aimPos.y += (bestTarget.isAir ? 0.3 : 0.6);
        const gatTurret = getCachedNode(upgMesh, "turretSystem") || upgMesh.getObjectByName("TURRET01");
        if (gatTurret && gatTurret.parent) {
            const localT = gatTurret.parent.worldToLocal(aimPos.clone());
            gatTurret.rotation.y = Math.atan2(localT.x, localT.z);
        }
    }
    if (bestTarget && unit.overlordGatCooldown === 0) {
        unit._overlordGatSpin = Math.min(12, (unit._overlordGatSpin || 0) + 1);
        unit._overlordGatCoastTicks = 90;
        let gatCd = unit._overlordGatSpin >= 8 ? 6 : (unit._overlordGatSpin >= 4 ? 10 : 16);
        if (unit.veterancy === 1) gatCd = Math.max(4, Math.floor(gatCd * 0.91));
        else if (unit.veterancy === 2) gatCd = Math.max(4, Math.floor(gatCd * 0.80));
        else if (unit.veterancy >= 3) gatCd = Math.max(3, Math.floor(gatCd * 0.65));
        if (unit.isHordeActive) gatCd = Math.max(3, Math.floor(gatCd * 0.80));
        unit.overlordGatCooldown = gatCd;
        unit._gatlingSpinVel = unit._overlordGatSpin >= 8 ? 0.98 : (unit._overlordGatSpin >= 4 ? 0.68 : 0.42);
        const tPos = (bestTarget.position || bestTarget.mesh.position).clone();
        tPos.y += (bestTarget.isAir ? 0.3 : 0.6);
        if (upgMesh && typeof upgMesh.updateMatrixWorld === 'function') upgMesh.updateMatrixWorld(true);
        const m1 = upgMesh && upgMesh.getObjectByName("MUZZLE01");
        const m2 = upgMesh && upgMesh.getObjectByName("MUZZLE02");
        const fallbackMuzzle = upgMesh ? upgMesh.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.6, 0)) : unit.mesh.position.clone().add(new THREE.Vector3(0, 2.2, 0));
        const muzzleL = m1 ? m1.getWorldPosition(new THREE.Vector3()) : fallbackMuzzle;
        const muzzleR = m2 ? m2.getWorldPosition(new THREE.Vector3()) : null;
        const isHeroicOverlord = (unit.veterancy >= 3);
        const gatFlashColor = isHeroicOverlord ? 0xff1111 : 0xffa502;
        const gatTracerColor = isHeroicOverlord ? 0xff1a1a : 0xf1c40f;
        spawnMuzzleFlash(muzzleL, gatFlashColor, isHeroicOverlord ? 0.55 : 0.4);
        spawnBulletTracer(muzzleL, tPos, gatTracerColor, isHeroicOverlord ? 3.8 : 2.8);
        if (typeof spawnBulletImpactFX === 'function') spawnBulletImpactFX(tPos, getArmorCategory(bestTarget), isHeroicOverlord);
        if (muzzleR) {
            spawnMuzzleFlash(muzzleR, gatFlashColor, isHeroicOverlord ? 0.55 : 0.4);
            spawnBulletTracer(muzzleR, tPos, gatTracerColor, isHeroicOverlord ? 3.8 : 2.8);
        }
        if (typeof playAudio === 'function') {
            const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            if (!unit._gatAudioLastMs || nowMs - unit._gatAudioLastMs >= 130) {
                unit._gatAudioLastMs = nowMs;
                playAudio('gatling_fire', { pos: unit.mesh.position, volume: 0.85 }, 'china');
            }
        }
        applyCalculatedDamage(unit, bestTarget, 10, 'GATLING');
    } else if (!bestTarget) {
        if (unit._overlordGatCoastTicks > 0) {
            unit._overlordGatCoastTicks = Math.max(0, unit._overlordGatCoastTicks - combatDeltaScale);
        } else if (unit._overlordGatSpin > 0) {
            unit._overlordGatSpin = Math.max(0, unit._overlordGatSpin - 0.12 * combatDeltaScale);
        }
    }
}

const _COMBAT_GRID_CELL = 40;
function _buildCombatSpatialMap(list) {
    const map = new Map();
    for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e || e.health <= 0 || !e.mesh) continue;
        const cx = Math.floor(e.mesh.position.x / _COMBAT_GRID_CELL);
        const cz = Math.floor(e.mesh.position.z / _COMBAT_GRID_CELL);
        const key = (cx + 512) * 2048 + (cz + 512);
        let bucket = map.get(key);
        if (!bucket) { bucket = []; map.set(key, bucket); }
        bucket.push(e);
    }
    return map;
}

function _queryCombatSpatialMap(map, x, z, range) {
    const r = Math.max(10, range + 8);
    const minX = Math.floor((x - r) / _COMBAT_GRID_CELL);
    const maxX = Math.floor((x + r) / _COMBAT_GRID_CELL);
    const minZ = Math.floor((z - r) / _COMBAT_GRID_CELL);
    const maxZ = Math.floor((z + r) / _COMBAT_GRID_CELL);
    const out = [];
    for (let cx = minX; cx <= maxX; cx++) {
        const base = (cx + 512) * 2048;
        for (let cz = minZ; cz <= maxZ; cz++) {
            const bucket = map.get(base + (cz + 512));
            if (bucket) {
                for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
            }
        }
    }
    return out;
}

function processCombatScanning() {
    _combatScanTick++;
    const enemyCount = (typeof enemyUnits !== 'undefined') ? enemyUnits.length : 0;
    const totalCombatUnits = units.length + enemyCount;
    // PERF: dynamic scan staggering scales smoothly for 200+ unit battles (~20-25 scans/frame max)
    const dynMovingMod = totalCombatUnits > 80 ? Math.min(8, Math.ceil(totalCombatUnits / 25)) : 2;
    const dynIdleMod = totalCombatUnits > 80 ? Math.min(12, Math.ceil(totalCombatUnits / 18)) : 4;
    const enemySpatialMap = (enemyCount > 24)
        ? _buildCombatSpatialMap(enemyUnits)
        : null;
    if (enemyCount > 0) {
        for (let ei = 0; ei < enemyUnits.length; ei++) {
            const eu = enemyUnits[ei];
            if (eu && eu.type === 'overlord' && eu.overlordUpgrade === 'gatling') {
                processOverlordGatlingTower(eu, null, ei);
            }
        }
    }
    units.forEach((unit, ui) => {
            if (unit.health <= 0) return;
            if (unit.isUnmanned || (unit.disabledUntil && typeof buildingTick !== 'undefined' && buildingTick < unit.disabledUntil)) return;
            if (unit.garrisonedIn) {
                const tr = unit.garrisonedIn;
                const isBuildingGarrison = !!(tr && (tr.isWorldBuilding || tr.type === 'bunker' || tr.type === 'palace'));
                const isOverlordBunker = !!(tr && tr.type === 'overlord' && tr.overlordUpgrade === 'bunker');
                const hasFireports = tr && tr.health > 0 && tr.mesh && (isBuildingGarrison || isOverlordBunker || tr.type === 'humvee' || tr.type === 'technical' || tr.type === 'battlebus');
                if (!hasFireports) return;
                const trPos = tr.position || tr.mesh.position;
                unit.mesh.position.copy(trPos);
                if (isBuildingGarrison) unit.mesh.position.y += 2.0;
                else if (isOverlordBunker) unit.mesh.position.y += 4.5;
                const rangeBonus = (isBuildingGarrison || isOverlordBunker) ? 1.5 : 1.0;
                const baseGarrisonRange = (unit.scanRange || 22) * rangeBonus + (isOverlordBunker ? (tr.radius || 6.2) : 0);
                const distToHostile = (h) => {
                    const hp = h && (h.position || (h.mesh && h.mesh.position));
                    if (!hp) return Infinity;
                    return (unit.isAir || h.isAir)
                        ? trPos.distanceTo(hp)
                        : Math.hypot(trPos.x - hp.x, trPos.z - hp.z);
                };
                if (tr.combatTarget && tr.combatTarget.health > 0 && canUnitTarget(unit, tr.combatTarget) &&
                    distToHostile(tr.combatTarget) <= baseGarrisonRange + (tr.combatTarget.radius || 0)) {
                    unit.combatTarget = tr.combatTarget;
                } else if (!unit.combatTarget || unit.combatTarget.health <= 0 ||
                    !canUnitTarget(unit, unit.combatTarget) ||
                    distToHostile(unit.combatTarget) > baseGarrisonRange + (unit.combatTarget.radius || 0)) {
                    unit.combatTarget = null;
                    if ((_combatScanTick + ui) % 3 === 0) {
                        let bestGTarget = null, bestGD = Infinity;
                        const candUnits = enemySpatialMap
                            ? _queryCombatSpatialMap(enemySpatialMap, trPos.x, trPos.z, baseGarrisonRange + 8)
                            : (typeof enemyUnits !== 'undefined' ? enemyUnits : []);
                        for (let hi = 0; hi < candUnits.length; hi++) {
                            const h = candUnits[hi];
                            if (!h || h.health <= 0 || isFriendly(unit, h) || !canUnitTarget(unit, h)) continue;
                            const d = distToHostile(h);
                            const maxD = baseGarrisonRange + (h.radius || 0);
                            if (d <= maxD && d < bestGD) { bestGD = d; bestGTarget = h; }
                        }
                        if (!bestGTarget && typeof enemyStructures !== 'undefined') {
                            for (let hi = 0; hi < enemyStructures.length; hi++) {
                                const h = enemyStructures[hi];
                                if (!h || h.health <= 0 || isFriendly(unit, h) || !canUnitTarget(unit, h)) continue;
                                const d = distToHostile(h);
                                const maxD = baseGarrisonRange + (h.radius || 0);
                                if (d <= maxD && d < bestGD) { bestGD = d; bestGTarget = h; }
                            }
                        }
                        if (bestGTarget) unit.combatTarget = bestGTarget;
                    }
                }
            }
            // Manage weapon assembly cooldown timers
            if (unit.attackCooldown > 0) unit.attackCooldown = Math.max(0, unit.attackCooldown - combatDeltaScale);

            // If unit already has a valid target, verify proximity constraints
            if (unit.combatTarget) {
                const targetPos = unit.combatTarget.position || (unit.combatTarget.mesh && unit.combatTarget.mesh.position);
                const targetRadius = unit.combatTarget.radius || 0;
                const distance = targetPos
                ? (unit.isAir || unit.combatTarget.isAir
                    ? unit.mesh.position.distanceTo(targetPos)
                    : Math.hypot(unit.mesh.position.x - targetPos.x, unit.mesh.position.z - targetPos.z))
                : Infinity;
                const inOverlordBunker = !!(unit.garrisonedIn && unit.garrisonedIn.type === 'overlord' && unit.garrisonedIn.overlordUpgrade === 'bunker');
                const garrisonRangeMult = (unit.garrisonedIn && (unit.garrisonedIn.isWorldBuilding || unit.garrisonedIn.type === 'bunker' || inOverlordBunker)) ? 1.33 : 1.0;
                const garrisonRadiusBonus = inOverlordBunker ? (unit.garrisonedIn.radius || 6.2) : 0;
                const maxEffectiveRange = unit.scanRange * garrisonRangeMult + garrisonRadiusBonus + targetRadius;
                const minEffectiveRange = (unit.type === 'nukecannon' || unit.type === 'nuketank') ? (unit.minRange || 32.4)
                    : (unit.type === 'tomahawk' ? (unit.minRange || 21.6)
                    : (unit.type === 'scud' ? (unit.minRange || 43.2)
                    : (unit.type === 'inferno' ? 10.8 : 0)));

                if (!canUnitTarget(unit, unit.combatTarget) || unit.combatTarget.health <= 0) {
                    unit.combatTarget = null; // Target invalid, untargetable, or destroyed
                } else if (distance > maxEffectiveRange || distance < minEffectiveRange) {
                    // Keep explicit MovingToAttack targets while approaching from out of range
                    if (unit.taskState !== 'MovingToAttack') {
                        unit.combatTarget = null; // Out of range or too close for siege artillery
                    }
                } else {
                    // Nuke Cannon: automatically deploy hydraulic outriggers as soon as it spots/locks a target in range!
                    if ((unit.type === 'nukecannon' || unit.type === 'nuketank') && !unit.isDeployed && typeof deployNukeCannonOutriggers === 'function') {
                        deployNukeCannonOutriggers(unit);
                    }
                    // Point Turret systems directly at target coordinates (yaw only; barrel pitch stays independent!)
                    const turret = getCachedNode(unit.mesh, "turretSystem");
                    if (turret && turret.parent && targetPos) {
                        const localTarget = turret.parent.worldToLocal(targetPos.clone());
                        turret.rotation.y = Math.atan2(localTarget.x, localTarget.z);
                    }
                    // Fire Weapon Command Trigger Sequence
                    if (unit.attackCooldown === 0) {
                        executeWeaponFire(unit, unit.combatTarget);
                    }
                }
            }

            // Gatling Tank ContinuousFireCoast: hold spool-up briefly across target switches, then wind down smoothly
            if (unit.type === 'gatling' || unit.type === 'gatlingTank') {
                if (unit._gatlingCoastTicks > 0) {
                    unit._gatlingCoastTicks = Math.max(0, unit._gatlingCoastTicks - combatDeltaScale);
                } else if (unit.gatlingSpin > 0) {
                    unit.gatlingSpin = Math.max(0, unit.gatlingSpin - 0.12 * combatDeltaScale);
                }
            }

            // Autonomous Overlord Roof Gatling Cannon (Anti-Air & Anti-Infantry) — continuous fire until target destroyed/gone
            if (unit.type === 'overlord' && unit.overlordUpgrade === 'gatling' && unit.health > 0) {
                processOverlordGatlingTower(unit, enemySpatialMap, ui);
            }

            // If combat target is friendly ally, clear immediately
            if (unit.combatTarget && isFriendly(unit, unit.combatTarget)) {
                unit.combatTarget = null;
            }

            // Auto-Scan while Idle or Moving (Fire-on-the-move: engage nearest hostile in range without stopping)
            // PERF: dynamically staggered by army size using squared horizontal distance + spatial grid
            const isNonCombatSupport = _NON_COMBAT_SUPPORT_TYPES.has(unit.type);
            const scanMod = (unit.taskState === 'Moving') ? dynMovingMod : dynIdleMod;
            if (!unit.combatTarget && ((_combatScanTick + ui) % scanMod === 0) && !isNonCombatSupport) {
                if (!(unit.isAir && unit.taskState === 'Moving')) {
                    const uPos = unit.mesh.position;
                    const minScanR = (unit.type === 'nukecannon' || unit.type === 'nuketank') ? (unit.minRange || 32.4)
                        : (unit.type === 'tomahawk' ? (unit.minRange || 21.6)
                        : (unit.type === 'scud' ? (unit.minRange || 43.2)
                        : (unit.type === 'inferno' ? 10.8 : 0)));
                    const minScanR2 = minScanR * minScanR;
                    let bestUnitDist2 = Infinity;
                    // 1. Scan for nearest hostile unit in range (spatial-grid accelerated for large armies)
                    let bestSightEnemy = null;
                    let bestSightDist2 = Infinity;
                    const maxQueryRange = Math.max(unit.scanRange || 0, unit.visionRange || 0) + 6;
                    const candidateEnemies = enemySpatialMap
                        ? _queryCombatSpatialMap(enemySpatialMap, uPos.x, uPos.z, maxQueryRange)
                        : enemyUnits;
                    for (let ei = 0; ei < candidateEnemies.length; ei++) {
                        const enemy = candidateEnemies[ei];
                        if (enemy.health > 0 && enemy.mesh && !isFriendly(unit, enemy)) {
                            if (!canUnitTarget(unit, enemy)) continue;
                            const ep = enemy.mesh.position;
                            const eRad = enemy.radius || 0;
                            const dx = uPos.x - ep.x, dz = uPos.z - ep.z;
                            const effR = unit.scanRange + eRad;
                            const d2 = dx * dx + dz * dz;
                            if (d2 >= minScanR2 && d2 <= effR * effR && d2 < bestUnitDist2) {
                                if (unit.scanRange <= (unit.visionRange || unit.scanRange) || isTargetSpottedForUnit(unit, ep, eRad)) {
                                    bestUnitDist2 = d2;
                                    unit.combatTarget = enemy;
                                    if (unit.isAir) unit.airState = 'attacking';
                                }
                            } else if (unit.taskState === 'Idle' && !unit.isAir && (unit.visionRange || 0) > unit.scanRange && unit.scanRange > 0) {
                                const visR = unit.visionRange + eRad;
                                if (d2 <= visR * visR && d2 < bestSightDist2) {
                                    bestSightDist2 = d2;
                                    bestSightEnemy = enemy;
                                }
                            }
                        }
                    }
                    // Infantry/units with VisionRange > AttackRange (e.g. Rebel 32.4 > 22): advance to weapon range when idle
                    if (!unit.combatTarget && bestSightEnemy && bestSightEnemy.mesh) {
                        unit.combatTarget = bestSightEnemy;
                        unit.taskState = 'MovingToAttack';
                        unit.targetPosition.copy(bestSightEnemy.mesh.position);
                    }
                    // 2. If no hostile units in range, auto-target nearest hostile structure
                    if (!unit.combatTarget && enemyStructures.length > 0) {
                        let bestStructDist2 = Infinity;
                        for (let si = 0; si < enemyStructures.length; si++) {
                            const struct = enemyStructures[si];
                            if (struct.health > 0 && struct.mesh && !isFriendly(unit, struct)) {
                                const sPos = struct.position || struct.mesh.position;
                                const sRad = struct.radius || 6;
                                const effR = unit.scanRange + sRad;
                                const dx = uPos.x - sPos.x, dz = uPos.z - sPos.z;
                                const d2 = dx * dx + dz * dz;
                                if (d2 >= minScanR2 && d2 <= effR * effR && d2 < bestStructDist2) {
                                    if (unit.scanRange <= (unit.visionRange || unit.scanRange) || isTargetSpottedForUnit(unit, sPos, sRad)) {
                                        bestStructDist2 = d2;
                                        unit.combatTarget = struct;
                                        if (unit.isAir) unit.airState = 'attacking';
                                    }
                                }
                            }
                        }
                    }
                }
            }
    });
}

// =========================================================================
// AUTHENTIC SAGE ENGINE DAMAGE & ARMOR MULTIPLIER MATRIX (Damage.h & Armor.h)
// =========================================================================
const DAMAGE_TYPES = {
    SMALL_ARMS: 'SMALL_ARMS',
    GATLING: 'GATLING',
    ARMOR_PIERCING: 'ARMOR_PIERCING',
    EXPLOSIVE: 'EXPLOSIVE',
    SNIPER: 'SNIPER',
    FLAME: 'FLAME',
    TOXIN: 'TOXIN',
    POISON: 'POISON',
    RADIATION: 'RADIATION',
    CRUSH: 'CRUSH'
};

const ARMOR_COEFFICIENTS = {
    infantry: {
        SMALL_ARMS: 1.0,
        GATLING: 1.5,
        ARMOR_PIERCING: 0.35,
        EXPLOSIVE: 0.8,
        SNIPER: 3.0,
        FLAME: 1.5,
        TOXIN: 1.5,
        POISON: 1.5,
        RADIATION: 1.5,
        CRUSH: 10.0,
        AURORA_BOMB: 1.0,
        STEALTHJET_MISSILES: 0.5
    },
    light_vehicle: {
        SMALL_ARMS: 0.5,
        GATLING: 1.0,
        ARMOR_PIERCING: 1.35,
        EXPLOSIVE: 1.2,
        SNIPER: 0.1,
        FLAME: 0.85,
        TOXIN: 0.6,
        POISON: 0.6,
        RADIATION: 0.6,
        CRUSH: 0.0,
        AURORA_BOMB: 1.0,
        STEALTHJET_MISSILES: 1.0
    },
    heavy_vehicle: {
        SMALL_ARMS: 0.2,
        GATLING: 0.45,
        ARMOR_PIERCING: 1.0,
        EXPLOSIVE: 1.0,
        SNIPER: 0.05,
        FLAME: 0.5,
        TOXIN: 0.4,
        POISON: 0.4,
        RADIATION: 0.4,
        CRUSH: 0.0,
        AURORA_BOMB: 1.0,
        STEALTHJET_MISSILES: 1.0
    },
    aircraft: {
        SMALL_ARMS: 0.6,
        GATLING: 1.5,
        ARMOR_PIERCING: 0.4,
        EXPLOSIVE: 1.3,
        SNIPER: 0.0,
        FLAME: 0.0,
        TOXIN: 0.0,
        POISON: 0.0,
        RADIATION: 0.0,
        CRUSH: 0.0,
        AURORA_BOMB: 0.0,
        STEALTHJET_MISSILES: 0.0
    },
    building: {
        SMALL_ARMS: 0.25,
        GATLING: 0.4,
        ARMOR_PIERCING: 0.85,
        EXPLOSIVE: 1.35,
        SNIPER: 0.0,
        FLAME: 1.25,
        TOXIN: 0.25,
        POISON: 0.25,
        RADIATION: 0.0,
        CRUSH: 0.0,
        AURORA_BOMB: 1.0,
        STEALTHJET_MISSILES: 1.25
    }
};

const _ARMOR_BLD_TYPES = new Set(['center', 'commandCenter', 'power', 'nuclearReactor', 'barracks', 'factory', 'airfield', 'supplyCenter', 'supplyStash', 'supplyDrop', 'bunker', 'patriot', 'gatlingCannon', 'speakerTower', 'stingerSite', 'palace', 'scudStorm', 'particleCannon', 'nukeSilo', 'strategyCenter', 'detentionCamp', 'internetCenter', 'propagandaCenter', 'blackMarket', 'derrick', 'tunnel', 'demoTrap']);
const _ARMOR_INF_TYPES = new Set(['ranger', 'infantry', 'redguard', 'rebel', 'rocket', 'missiledefender', 'rpg', 'tankhunter', 'pathfinder', 'jarmen', 'worker', 'burton', 'blacklotus', 'hacker', 'hijacker', 'terrorist', 'mob', 'pilot']);
const _ARMOR_LV_TYPES = new Set(['humvee', 'technical', 'buggy', 'dragon', 'dragonTank', 'toxintractor', 'truck', 'dozer', 'quad', 'ambulance', 'radarvan', 'bombtruck', 'crawler', 'battlebus']);

function getArmorCategory(target) {
    if (!target) return 'infantry';
    if (target._armorCat) return target._armorCat;
    let cat;
    if (target.isBuilding !== undefined || target.productionQueue || _ARMOR_BLD_TYPES.has(target.type) || (!target.speed && (target.radius || 0) >= 5)) {
        cat = 'building';
    } else if (target.isAir) {
        cat = 'aircraft';
    } else if (_ARMOR_INF_TYPES.has(target.type)) {
        cat = 'infantry';
    } else if (_ARMOR_LV_TYPES.has(target.type)) {
        cat = 'light_vehicle';
    } else {
        cat = 'heavy_vehicle';
    }
    target._armorCat = cat;
    return cat;
}

function damageHostilesInRadius(center, radius, damage, damageType = 'EXPLOSIVE', attacker = null) {
    if (!center || !Number.isFinite(radius) || radius <= 0 || !Number.isFinite(damage) || damage <= 0) return 0;
    const refAttacker = attacker || { teamId: (typeof playerTeamId !== 'undefined' ? playerTeamId : 1), ownerId: 'player', isAI: false };
    const isAttackerAI = Boolean(refAttacker.isAI);
    const targetUnitLists = isAttackerAI
        ? [typeof units !== 'undefined' ? units : [], typeof enemyUnits !== 'undefined' ? enemyUnits : []]
        : [typeof enemyUnits !== 'undefined' ? enemyUnits : [], typeof units !== 'undefined' ? units : []];
    const targetStructLists = isAttackerAI
        ? [typeof structures !== 'undefined' ? structures : [], typeof enemyStructures !== 'undefined' ? enemyStructures : []]
        : [typeof enemyStructures !== 'undefined' ? enemyStructures : [], typeof structures !== 'undefined' ? structures : []];

    let hits = 0;
    const applyAoE = (ent) => {
        if (!ent || ent.health <= 0) return;
        if (typeof isFriendly === 'function' && isFriendly(refAttacker, ent)) return;
        const p = ent.position || (ent.mesh && ent.mesh.position);
        if (!p) return;
        const effRad = radius + (ent.radius || 0);
        const dist = Math.hypot(p.x - center.x, p.z - center.z);
        if (dist > effRad) return;
        // Authentic SAGE radial falloff: 100% damage inside 60% radius, tapering to 50% at outer edge
        const falloff = dist <= effRad * 0.6 ? 1.0 : Math.max(0.5, 1.0 - ((dist - effRad * 0.6) / Math.max(0.1, effRad * 0.4)) * 0.5);
        applyCalculatedDamage(refAttacker, ent, Math.round(damage * falloff), damageType);
        hits++;
    };

    for (let li = 0; li < targetUnitLists.length; li++) {
        const list = targetUnitLists[li];
        for (let i = 0; i < list.length; i++) applyAoE(list[i]);
    }
    for (let li = 0; li < targetStructLists.length; li++) {
        const list = targetStructLists[li];
        for (let i = 0; i < list.length; i++) applyAoE(list[i]);
    }
    if (typeof worldBuildings !== 'undefined' && Array.isArray(worldBuildings)) {
        for (let i = 0; i < worldBuildings.length; i++) {
            const wb = worldBuildings[i];
            if (wb && wb.health > 0 && Array.isArray(wb.garrisoned) && wb.garrisoned.length > 0) {
                const occ = wb.garrisoned[0];
                if (occ && (typeof isFriendly !== 'function' || !isFriendly(refAttacker, occ))) {
                    applyAoE(wb);
                }
            }
        }
    }
    return hits;
}
if (typeof window !== 'undefined') window.damageHostilesInRadius = damageHostilesInRadius;

function applyCalculatedDamage(attacker, target, baseDamage, damageType = 'ARMOR_PIERCING') {
    if (!target || target.health <= 0) return;
    // Garrisoned passengers inside a living transport/bunker/Overlord Bunker are protected by the host's armor
    if (target.garrisonedIn && target.garrisonedIn.health > 0) return;

    const isAttackerPlayer = Boolean(attacker && ((typeof units !== 'undefined' && units.includes(attacker)) || (typeof structures !== 'undefined' && structures.includes(attacker))));
    const isTargetPlayer = Boolean(target && ((typeof units !== 'undefined' && units.includes(target)) || (typeof structures !== 'undefined' && structures.includes(target))));

    // Aircraft Defensive Flare Countermeasures: 40% chance to deflect missile/rocket (EXPLOSIVE) damage only
    const hasCountermeasures = target.isAir && (
        (isTargetPlayer && typeof researchedTechs !== 'undefined' && researchedTechs.has('countermeasures')) ||
        Boolean(target.hasCountermeasures)
    );
    const cmRoll = (typeof simRandom === 'function') ? simRandom() : Math.random();
    if (hasCountermeasures && damageType === 'EXPLOSIVE' && cmRoll < 0.40) {
        if (target.mesh && typeof spawnSmokePuff === 'function') spawnSmokePuff(target.mesh.position, 0xffd700, 0.4);
        return; // Deflected!
    }

    const cat = getArmorCategory(target);
    let mult = (ARMOR_COEFFICIENTS[cat] && ARMOR_COEFFICIENTS[cat][damageType] !== undefined)
    ? ARMOR_COEFFICIENTS[cat][damageType]
    : 1.0;
    // INIZH.big BaseDefenseStructureArmor: Stealth Fighter Bunker-Busters deal 150% against base defenses
    if (damageType === 'STEALTHJET_MISSILES' && cat === 'building' && ['patriot', 'gatlingCannon', 'stingerSite', 'bunker', 'tunnel'].includes(target.type)) {
        mult = 1.5;
    }

    // Respect 0.0 SAGE armor immunity (e.g., SNIPER vs building/aircraft, FLAME/TOXIN/CRUSH vs aircraft)
    if (mult <= 0 || baseDamage <= 0) return;

    let finalDmg = Math.max(1, Math.round(baseDamage * mult));

    // Attacker offensive buffs (USA Strategy Center Bombardment: +20% damage)
    if (typeof battlePlan !== 'undefined' && battlePlan === 'bombard' && isAttackerPlayer) {
        finalDmg = Math.round(finalDmg * 1.20);
    }
    // Official INIZH.big GameData.ini: WeaponBonus = GARRISONED DAMAGE 125%
    if (attacker && attacker.garrisonedIn && (attacker.garrisonedIn.isWorldBuilding || attacker.garrisonedIn.type === 'bunker' || (attacker.garrisonedIn.type === 'overlord' && attacker.garrisonedIn.overlordUpgrade === 'bunker'))) {
        finalDmg = Math.round(finalDmg * 1.25);
    }
    // China Horde Bonus: 5+ friendly horde units (Red Guard, Battlemaster) within 22m grant +20% damage (+35% with Nationalism)
    if (attacker && (attacker.type === 'redguard' || attacker.type === 'battlemaster' || attacker.type === 'infantry' || attacker.type === 'tank') && (attacker.faction === 'china' || attacker.isChina || (typeof selectedFaction !== 'undefined' && selectedFaction === 'china' && isAttackerPlayer))) {
        const friendlies = isAttackerPlayer ? units : (typeof enemyUnits !== 'undefined' ? enemyUnits : []);
        let hordeCount = 0;
        const aPos = attacker.mesh ? attacker.mesh.position : attacker.position;
        if (aPos) {
            const aX = aPos.x;
            const aZ = aPos.z;
            for (let i = 0; i < friendlies.length; i++) {
                const f = friendlies[i];
                if (f.health > 0 && f.mesh && (f.type === 'redguard' || f.type === 'battlemaster' || f.type === 'infantry' || f.type === 'tank')) {
                    const dx = aX - f.mesh.position.x;
                    const dz = aZ - f.mesh.position.z;
                    if (dx * dx + dz * dz <= 484) { // 22^2
                        hordeCount++;
                        if (hordeCount >= 5) break;
                    }
                }
            }
        }
        if (hordeCount >= 5) {
            const hasNationalism = isAttackerPlayer && typeof researchedTechs !== 'undefined' && researchedTechs.has('nationalism');
            const hordeFactor = hasNationalism ? 1.35 : 1.20;
            finalDmg = Math.round(finalDmg * hordeFactor);
            attacker.isHordeActive = true;
        } else {
            attacker.isHordeActive = false;
        }
    }

    // Additional Tech Munition Buffs (Attacker — strictly player-owned)
    const activePlayerGeneral = (isAttackerPlayer && typeof window !== 'undefined' && window.selectedGeneral) ? window.selectedGeneral : '';
    if (activePlayerGeneral === 'usa_laser' && ['tank', 'crusader', 'paladin', 'patriot'].includes(attacker.type)) {
        finalDmg = Math.round(finalDmg * 1.25);
    } else if (activePlayerGeneral === 'china_nuke' && (attacker.type === 'battlemaster' || attacker.type === 'overlord')) {
        finalDmg = Math.round(finalDmg * 1.25);
    } else if (activePlayerGeneral === 'gla_toxin' && (damageType === 'TOXIN' || ['toxintractor', 'scud', 'scorpion', 'marauder', 'rebel', 'rpg'].includes(attacker.type))) {
        finalDmg = Math.round(finalDmg * 1.25);
    } else if (activePlayerGeneral === 'gla_demo' && ['terrorist', 'bombtruck', 'rpg', 'scud'].includes(attacker.type)) {
        finalDmg = Math.round(finalDmg * 1.35);
    }
    if (isAttackerPlayer && typeof researchedTechs !== 'undefined') {
        if (researchedTechs.has('laserMissiles') && ['raptor', 'comanche', 'stealthfighter'].includes(attacker.type)) {
            finalDmg = Math.round(finalDmg * 1.25);
        }
        if (researchedTechs.has('blackNapalm') && (damageType === 'FIRE' || damageType === 'FLAME' || ['dragon', 'dragonTank', 'inferno', 'mig'].includes(attacker.type))) {
            finalDmg = Math.round(finalDmg * 1.30);
        }
        if (researchedTechs.has('anthraxBeta') && (damageType === 'TOXIN' || ['toxintractor', 'scud'].includes(attacker.type))) {
            finalDmg = Math.round(finalDmg * 1.25);
        }
        if (researchedTechs.has('armTheMob') && attacker.type === 'mob') {
            finalDmg = Math.round(finalDmg * 2.0);
        }
        if (researchedTechs.has('apBullets') && ['rebel', 'technical', 'quad'].includes(attacker.type)) {
            finalDmg = Math.round(finalDmg * 1.25);
        }
        if (researchedTechs.has('apRockets') && ['rpg', 'scorpion', 'buggy'].includes(attacker.type)) {
            finalDmg = Math.round(finalDmg * 1.25);
        }
        if (researchedTechs.has('chainGuns') && (attacker.type === 'gatling' || attacker.type === 'gatlingCannon')) {
            finalDmg = Math.round(finalDmg * 1.25);
        }
        if (researchedTechs.has('uraniumShells') && (attacker.type === 'battlemaster' || attacker.type === 'overlord')) {
            finalDmg = Math.round(finalDmg * 1.25);
        }
    }
    if (attacker && attacker.frenzyUntil && Date.now() < attacker.frenzyUntil) {
        finalDmg = Math.round(finalDmg * 1.30);
    }
    // Veterancy Damage Bonus: +10% (Veteran), +20% (Elite), +30% (Heroic)
    if (attacker && attacker.veterancy >= 1) {
        const vetDmgMult = attacker.veterancy >= 3 ? 1.30 : (attacker.veterancy === 2 ? 1.20 : 1.10);
        finalDmg = Math.round(finalDmg * vetDmgMult);
    }

    // Target defensive upgrade buffs (USA Strategy Center Hold the Line: +20% armor / -20% damage taken)
    if (typeof battlePlan !== 'undefined' && battlePlan === 'hold' && isTargetPlayer) {
        finalDmg = Math.max(1, Math.round(finalDmg * 0.80));
    }
    if (target.salvageLevel >= 2) finalDmg = Math.max(1, Math.round(finalDmg * 0.8)); // GLA Level 2 Scrap Armor
    if (target.compositeArmor) finalDmg = Math.max(1, Math.round(finalDmg * 0.85)); // USA Composite Armor

    // Target Tech Protection Buffs (strictly player-owned)
    if (isTargetPlayer && typeof researchedTechs !== 'undefined') {
        if (researchedTechs.has('chemicalSuits') && typeof units !== 'undefined' && units.includes(target) && (damageType === 'TOXIN' || damageType === 'POISON' || damageType === 'RADIATION')) {
            finalDmg = Math.max(1, Math.round(finalDmg * 0.50)); // -50% chemical & radiation damage
        }
        if (researchedTechs.has('droneArmor') && (target.type === 'drone' || target.drone)) {
            finalDmg = Math.max(1, Math.round(finalDmg * 0.75));
        }
        if (researchedTechs.has('fortifiedStructures') && typeof structures !== 'undefined' && structures.includes(target)) {
            finalDmg = Math.max(1, Math.round(finalDmg * 0.75));
        }
        if (researchedTechs.has('migArmor') && typeof units !== 'undefined' && units.includes(target) && target.type === 'mig' && (target.faction === 'china' || target.isChina || selectedFaction === 'china')) {
            finalDmg = Math.max(1, Math.round(finalDmg * 0.75));
        }
    }

    const wasAlive = target.health > 0;
    if (target.type === 'aurora' && target.invulnerableInbound) {
        return; // Authentic Zero Hour Aurora Bomber: Supersonic inbound run cannot be intercepted!
    }
    target.health = Math.max(0, target.health - finalDmg);
    target._lastAttackedTime = Date.now();
    target._lastAttacker = attacker || null;

    // Official INIZH.big GLAStingerSite: 3 individual Stinger Soldiers (100 HP each, 30s respawn) can be killed by snipers/flame/toxin/flashbang/anti-infantry!
    if (target.type === 'stingerSite' && target.health > 0 && !target.isBuilding) {
        if (!Array.isArray(target.stingerCrew)) {
            target.stingerCrew = [100, 100, 100];
            target.stingerRespawnAt = [0, 0, 0];
        }
        const isCrewKiller = damageType === 'SNIPER' || damageType === 'FLAME' || damageType === 'TOXIN' || damageType === 'POISON' || damageType === 'RADIATION' || damageType === 'FLASHBANG';
        const crewDmg = isCrewKiller ? Math.max(baseDamage, damageType === 'SNIPER' ? 120 : 55) : (damageType === 'GATLING' || damageType === 'SMALL_ARMS' ? Math.round(baseDamage * 0.85) : Math.round(baseDamage * 0.35));
        if (crewDmg > 0) {
            const curT = (typeof buildingTick !== 'undefined') ? buildingTick : 0;
            const hitsAll = damageType === 'FLAME' || damageType === 'TOXIN' || damageType === 'POISON' || damageType === 'RADIATION' || damageType === 'FLASHBANG';
            for (let ci = 0; ci < 3; ci++) {
                if (target.stingerCrew[ci] > 0) {
                    target.stingerCrew[ci] -= crewDmg;
                    if (target.stingerCrew[ci] <= 0) {
                        target.stingerCrew[ci] = 0;
                        target.stingerRespawnAt[ci] = curT + 1800; // Official SpawnReplaceDelay = 30000ms (30s)
                        if (target.mesh) {
                            const cm = target.mesh.getObjectByName('stingerCrew_' + ci);
                            if (cm) cm.visible = false;
                        }
                        if (typeof spawnSmokePuff === 'function' && target.position) {
                            spawnSmokePuff(target.position.clone().add(new THREE.Vector3((ci - 1) * 1.2, 1.5, 0)), 0xd63031, 0.55);
                        }
                    }
                    if (!hitsAll) break;
                }
            }
            // Sniper shots kill the Stinger Soldier without damaging the sandbag pit itself (matches retail Sniper 0% vs building!)
            if (damageType === 'SNIPER') return;
        }
    }

    // Authentic Generals Garrison Clearing (Flamethrowers, Toxin Tractors, Flashbangs clear buildings directly!)
    if (target.isWorldBuilding && Array.isArray(target.garrisoned) && target.garrisoned.length > 0 &&
        (damageType === 'FLAME' || damageType === 'TOXIN' || damageType === 'FLASHBANG')) {
        const clearDmg = damageType === 'FLASHBANG' ? 180 : Math.max(60, finalDmg * 2);
        const tPos = target.position || (target.mesh && target.mesh.position);
        if (tPos && typeof spawnMuzzleFlash === 'function') {
            spawnMuzzleFlash({ x: tPos.x, y: (tPos.y || 0) + 3.0, z: tPos.z }, damageType === 'TOXIN' ? 0x2ed573 : (damageType === 'FLASHBANG' ? 0xffffff : 0xff6b35), 1.6);
        }
        for (let gi = target.garrisoned.length - 1; gi >= 0; gi--) {
            const gUnit = target.garrisoned[gi];
            if (!gUnit) { target.garrisoned.splice(gi, 1); continue; }
            const wasOccAlive = gUnit.health > 0;
            gUnit.health = Math.max(0, gUnit.health - clearDmg);
            if (gUnit.health <= 0) {
                gUnit.garrisonedIn = null;
                target.garrisoned.splice(gi, 1);
                if (wasOccAlive && attacker && attacker.health > 0) {
                    attacker.kills = (attacker.kills || 0) + 1;
                    if (typeof checkVeterancyPromotion === 'function') checkVeterancyPromotion(attacker);
                    if (typeof awardGeneralsXP === 'function' && isAttackerPlayer) awardGeneralsXP(10);
                }
            }
        }
        if (typeof updateWorldBuildingGarrisonVisual === 'function') {
            updateWorldBuildingGarrisonVisual(target);
        }
    }

    // Player "Unit Under Attack" / "Base Under Attack" / "Ally Under Attack" EVA alert + Minimap radar signal
    const isPlayerUnit = (typeof units !== 'undefined' && units.includes(target));
    const isPlayerStruct = (typeof structures !== 'undefined' && structures.includes(target));
    const localTeam = (typeof playerTeamId !== 'undefined') ? playerTeamId : 1;
    const isAlliedTeammateAsset = !isPlayerUnit && !isPlayerStruct &&
        typeof isFriendly === 'function' &&
        isFriendly({ teamId: localTeam }, target) &&
        target.ownerId !== 'player';
    if ((isPlayerUnit || isPlayerStruct || isAlliedTeammateAsset) && (!attacker || !isFriendly(target, attacker))) {
        const nowMs = Date.now();
        const tPos = target.position || (target.mesh && target.mesh.position);
        if (tPos && typeof window !== 'undefined') {
            window.lastRadarAlertPos = tPos.clone ? tPos.clone() : { x: tPos.x, y: tPos.y || 0, z: tPos.z };
            if (!window.minimapAlertPings) window.minimapAlertPings = [];
            const hasNearbyPing = window.minimapAlertPings.some(p => Math.hypot(p.x - tPos.x, p.z - tPos.z) < 25 && p.life > 75);
            if (!hasNearbyPing) {
                window.minimapAlertPings.push({ x: tPos.x, z: tPos.z, life: 120, maxLife: 120, isBase: isPlayerStruct });
            }
            if (!window._lastUnderAttackAlertMs || (nowMs - window._lastUnderAttackAlertMs) > 8000) {
                window._lastUnderAttackAlertMs = nowMs;
                const alertType = isAlliedTeammateAsset
                    ? 'ally_under_attack'
                    : (isPlayerStruct ? 'base_under_attack' : 'unit_under_attack');
                if (typeof showNotification === 'function') {
                    const msg = isAlliedTeammateAsset
                        ? '⚠ ALLY UNDER ATTACK!'
                        : (isPlayerStruct ? '⚠ BASE UNDER ATTACK!' : '⚠ UNIT UNDER ATTACK!');
                    showNotification(msg, 'error');
                }
                if (typeof playEvaAlert === 'function') {
                    playEvaAlert(alertType);
                } else if (typeof playAudio === 'function') {
                    playAudio('radar_alert');
                }
            }
        }
    }
    const isFlyingAirUnit = !!(target.isAir && (
            target.type === 'chinook' ||
            target.airState === 'flying' ||
            target.taskState === 'Moving' ||
            (target.targetPosition && target.mesh && Math.hypot(target.targetPosition.x - target.mesh.position.x, target.targetPosition.z - target.mesh.position.z) > 4.0)
    ));
    if (target.health > 0 && target.scanRange > 0 && !target.combatTarget && target.taskState !== 'Moving' && !isFlyingAirUnit && attacker && attacker.health > 0 && !isFriendly(target, attacker)) {
        target.combatTarget = attacker;
    }

    // Sync damage dealt over WebRTC DataChannel
    if (typeof isMultiplayerActive !== 'undefined' && isMultiplayerActive && typeof netConn !== 'undefined' && netConn && netConn.open && typeof units !== 'undefined' && units.includes(attacker) && target && target.netId) {
        broadcastNetPacket({
                type: 'unit_damage',
                targetNetId: target.netId,
                remainingHealth: target.health
        });
    }

    // Check veterancy promotion & kill counter on kill
    if (wasAlive && target.health <= 0 && attacker && !target._killCredited) {
        target._killCredited = true;
        attacker.kills = (attacker.kills || 0) + 1;
        checkVeterancyPromotion(attacker);
        if (!attacker.isAI && typeof onPlayerKillReward === 'function') {
            onPlayerKillReward(target);
        }
        // If attacker is a passenger firing from a transport fireport (Humvee, Technical, Overlord Bunker), also credit the transport!
        if (attacker.garrisonedIn && attacker.garrisonedIn.health > 0) {
            attacker.garrisonedIn.kills = (attacker.garrisonedIn.kills || 0) + 1;
            checkVeterancyPromotion(attacker.garrisonedIn);
        }
        if ((attacker.selected || (attacker.garrisonedIn && attacker.garrisonedIn.selected)) && typeof updateSidebar === 'function') {
            updateSidebar();
        }
    }
}

function checkVeterancyPromotion(unit) {
    if (!unit || unit.health <= 0) return;
    const reqFactor = (typeof researchedTechs !== 'undefined' && (researchedTechs.has('advancedTraining') || unit.advancedTraining)) ? 0.5 : 1.0;
    const v1 = Math.ceil(2 * reqFactor);
    const v2 = Math.ceil(5 * reqFactor);
    const v3 = Math.ceil(10 * reqFactor);

    if (unit.kills >= v1 && (!unit.veterancy || unit.veterancy < 1)) {
        unit.veterancy = 1; // Veteran (+20% HP)
        const oldMax = unit.maxHealth;
        unit.maxHealth = Math.floor(unit.maxHealth * 1.2);
        unit.health = Math.min(unit.maxHealth, unit.health + (unit.maxHealth - oldMax));
        if (typeof spawnPromotionFX === 'function' && unit.mesh) spawnPromotionFX(unit.mesh.position, 1);
        if (typeof showNotification === 'function') {
            showNotification(`★ ${unit.type.toUpperCase()} promoted to VETERAN! (+20% HP, +2 HP/s Heal)`, 'info');
        }
    } else if (unit.kills >= v2 && (!unit.veterancy || unit.veterancy < 2)) {
        unit.veterancy = 2; // Elite (+40% HP from base, +25% Fire Rate)
        const oldMax = unit.maxHealth;
        unit.maxHealth = Math.floor(unit.maxHealth * (1.4 / 1.2));
        unit.health = Math.min(unit.maxHealth, unit.health + (unit.maxHealth - oldMax));
        if (typeof spawnPromotionFX === 'function' && unit.mesh) spawnPromotionFX(unit.mesh.position, 2);
        if (typeof showNotification === 'function') {
            showNotification(`★★ ${unit.type.toUpperCase()} promoted to ELITE! (+40% HP, +25% ROF, +4 HP/s Heal)`, 'info');
        }
    } else if (unit.kills >= v3 && (!unit.veterancy || unit.veterancy < 3)) {
        unit.veterancy = 3; // Heroic (+60% HP from base, +50% Fire Rate, Heroic Crimson Laser Tracers)
        const oldMax = unit.maxHealth;
        unit.maxHealth = Math.floor(unit.maxHealth * (1.6 / 1.4));
        unit.health = Math.min(unit.maxHealth, unit.health + (unit.maxHealth - oldMax));
        if (typeof spawnPromotionFX === 'function' && unit.mesh) spawnPromotionFX(unit.mesh.position, 3);
        if (typeof showNotification === 'function') {
            showNotification(`★★★ ${unit.type.toUpperCase()} achieved HEROIC rank! (+60% HP, +50% ROF, +6 HP/s Heal, Heroic Red Tracers)`, 'success');
        }
    }
}

// Wrapper: publishes the firing unit's world position so every sound played during this shot is
// distance-attenuated / panned relative to the camera (garrisoned units use their building position).
function executeWeaponFire(attacker, target) {
    const sfxSrc = attacker && attacker.mesh ? attacker.mesh.position : null;
    window._sfxPos = sfxSrc || null;
    try {
        return executeWeaponFireInner(attacker, target);
    } finally {
        window._sfxPos = null;
    }
}

function executeWeaponFireInner(attacker, target) {
    // Never fire weapon or deal damage to friendly teammates / allies or invalid air/ground targets!
    if (!attacker || !target || isFriendly(attacker, target) || !canUnitTarget(attacker, target)) {
        if (attacker && attacker.combatTarget === target) attacker.combatTarget = null;
        return;
    }
    if (attacker.isUnmanned || (attacker.disabledUntil && typeof buildingTick !== 'undefined' && buildingTick < attacker.disabledUntil)) {
        return;
    }
    if (['ambulance', 'chinook', 'truck', 'dozer', 'worker', 'radarvan', 'crawler', 'pilot'].includes(attacker.type)) {
        attacker.combatTarget = null;
        return;
    }
    if (attacker.isInfantry || (attacker.mesh && attacker.mesh.userData && attacker.mesh.userData.animatedMeshes)) {
        attacker._atkAnimTicks = 24;
    }
    // Authentic Command & Conquer: Generals Zero Hour Weapon Reload Rates (60 ticks = 1.0s, verified directly from INIZH.big Weapon.ini)
    const cncCooldowns = {
        // Main Battle & Heavy Tanks (INIZH.big: Crusader/Paladin/Battlemaster/Marauder 2000ms, Scorpion 1000ms, Overlord 2000ms reload + 300ms clip)
        'tank': 120, 'crusader': 120, 'battlemaster': 120, 'scorpion': 60, 'marauder': 120,
        'paladin': 120, 'overlord': 120,
        // Artillery & Heavy Siege Missiles (INIZH.big: Tomahawk 7000ms, SCUD 10000ms, Inferno 4000ms, NukeCannon 10000ms)
        'tomahawk': 420, 'scud': 600, 'inferno': 240, 'nukecannon': 600, 'nuketank': 600,
        // Anti-Tank & Rocket Troops / Base Defenses (INIZH.big: MissileDefender/TankHunter/RPG 1000ms, Patriot/Stinger 2000ms)
        'rocket': 60, 'missiledefender': 60, 'rpg': 60, 'tankhunter': 60, 'patriot': 120, 'stingerSite': 120,
        // Standard Infantry Rifle Bursts & Mob (INIZH.big: RedGuard/Ranger/Rebel ~1000ms, Burton 500-800ms, Mob 250ms)
        'ranger': 60, 'redguard': 60, 'rebel': 60, 'infantry': 60, 'burton': 50, 'mob': 30,
        'blacklotus': 120, 'hacker': 120,
        // High-Caliber Snipers (INIZH.big: Pathfinder 2000ms, Jarmen Kell 1000ms)
        'pathfinder': 120, 'jarmen': 60,
        // Fast Attack & Light Vehicles (INIZH.big: Buggy 6000ms reload, Humvee/Technical rapid, Dragon/Toxin continuous stream)
        'humvee': 36, 'technical': 24, 'buggy': 360,
        'dragon': 18, 'dragonTank': 18, 'toxintractor': 18,
        // Rapid-Fire Autocannons & Gatling Guns (INIZH.big: Quad 100ms, Gatling 3-stage spool)
        'gatling': 16, 'gatlingTank': 16, 'gatlingCannon': 16, 'quad': 12,
        // Aircraft
        'comanche': 150, 'raptor': 360, 'mig': 360, 'stealthfighter': 360, 'aurora': 300,
        'chinook': 180, 'truck': 180, 'worker': 180, 'dozer': 180
    };
    let baseCooldown = cncCooldowns[attacker.type] || 120;

    // Authentic Zero Hour 3-Stage Gatling Spool-Up Fire Rate Acceleration (16 -> 10 -> 6 ticks, ContinuousFireCoast 1.5s)
    if (attacker.type === 'gatling' || attacker.type === 'gatlingTank' || attacker.type === 'gatlingCannon') {
        attacker.gatlingSpin = Math.min(12, (attacker.gatlingSpin || 0) + 1);
        attacker._gatlingCoastTicks = 90;
        baseCooldown = attacker.gatlingSpin >= 8 ? 6 : (attacker.gatlingSpin >= 4 ? 10 : 16);
    } else if (attacker.gatlingSpin) {
        attacker.gatlingSpin = 0;
    }

    // Authentic Veterancy Fire Rate Bonus (ExperienceTracker.cpp)
    if (attacker.veterancy === 1) {
        baseCooldown = Math.floor(baseCooldown * 0.91); // Veteran: +10% ROF
    } else if (attacker.veterancy === 2) {
        baseCooldown = Math.floor(baseCooldown * 0.80); // Elite: 1.25x ROF
    } else if (attacker.veterancy === 3) {
        baseCooldown = Math.floor(baseCooldown * 0.65); // Heroic: 1.50x ROF
    }

    attacker.attackCooldown = baseCooldown;

    const curTProp = (typeof buildingTick !== 'undefined' ? buildingTick : 0);
    const inPropagandaAura = !!(attacker._propagandaUntil && curTProp <= attacker._propagandaUntil);
    if (inPropagandaAura) {
        // Official INIZH.big GameData.ini: ENTHUSIASTIC RATE_OF_FIRE 125% (*0.80), stacks with SUBLIMINAL RATE_OF_FIRE 125% (*0.64)
        const propRofMult = attacker._subliminalActive ? 0.64 : 0.80;
        attacker.attackCooldown = Math.max(5, Math.floor(attacker.attackCooldown * propRofMult));
    }
    if (attacker.isHordeActive) {
        const hordeFactor = (typeof researchedTechs !== 'undefined' && researchedTechs.has('nationalism')) ? 0.65 : 0.80;
        attacker.attackCooldown = Math.max(5, Math.floor(attacker.attackCooldown * hordeFactor)); // China Horde: +25% ROF (+50% w/ Nationalism)
    }
    // China Autoloader Tech: Battlemaster tanks fire +25% faster
    if (typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined' && researchedTechs.has('autoloader') && attacker.type === 'battlemaster') {
        attacker.attackCooldown = Math.max(6, Math.floor(attacker.attackCooldown * 0.75));
    }
    if (typeof battlePlan !== 'undefined' && battlePlan === 'search' && typeof units !== 'undefined' && units.includes(attacker)) attacker.attackCooldown = Math.floor(attacker.attackCooldown * 0.85);

    const targetPos = (target.position || target.mesh.position).clone();
    targetPos.y += (target.isAir ? 0.2 : 0.5);

    let muzzlePos = getMuzzleWorldPosition(attacker);
    if (attacker.garrisonedIn) {
        const gHost = attacker.garrisonedIn;
        if (gHost.isWorldBuilding && gHost.position) {
            const bPos = gHost.position;
            const bRad = gHost.radius || 5.5;
            const dx = targetPos.x - bPos.x, dz = targetPos.z - bPos.z;
            const len = Math.hypot(dx, dz) || 1;
            muzzlePos = new THREE.Vector3(bPos.x + (dx / len) * (bRad * 0.72), (bPos.y || 0) + 3.0 + (Math.random() - 0.5) * 0.6, bPos.z + (dz / len) * (bRad * 0.72));
        } else if (gHost.type === 'overlord' && gHost.overlordUpgrade === 'bunker' && gHost.mesh) {
            const upgMesh = gHost.overlordUpgradeMesh || getCachedNode(gHost.mesh, "overlordUpgrade");
            const bCenter = (upgMesh && typeof upgMesh.getWorldPosition === 'function')
                ? upgMesh.getWorldPosition(new THREE.Vector3())
                : gHost.mesh.position.clone().add(new THREE.Vector3(0, 4.6, 0));
            const dx = targetPos.x - bCenter.x, dz = targetPos.z - bCenter.z;
            const len = Math.hypot(dx, dz) || 1;
            muzzlePos = new THREE.Vector3(
                bCenter.x + (dx / len) * 2.4 + (Math.random() - 0.5) * 0.7,
                bCenter.y + 1.2 + (Math.random() - 0.5) * 0.3,
                bCenter.z + (dz / len) * 2.4 + (Math.random() - 0.5) * 0.7
            );
        } else if (gHost.mesh) {
            const hPos = gHost.position || gHost.mesh.position;
            const hRad = gHost.radius || 2.8;
            const dx = targetPos.x - hPos.x, dz = targetPos.z - hPos.z;
            const len = Math.hypot(dx, dz) || 1;
            muzzlePos = new THREE.Vector3(
                hPos.x + (dx / len) * (hRad * 0.65),
                (hPos.y || 0) + 1.8,
                hPos.z + (dz / len) * (hRad * 0.65)
            );
        }
    }

    // Spin Gatling barrels when firing (sets stage-scaled momentum for smooth continuous spin in gameLoop)
    if (attacker.type === 'gatling' || attacker.type === 'gatlingTank' || attacker.type === 'gatlingCannon') {
        const gSpin = attacker.gatlingSpin || 0;
        attacker._gatlingSpinVel = gSpin >= 8 ? 0.98 : (gSpin >= 4 ? 0.68 : 0.42);
    }

    // Firing uncloaks stealth units for their retail StealthDelay (INIZH.big StealthUpdate; 60 ticks = 1 s).
    // Pathfinder keeps stealth while attacking (only MOVING breaks it); Burton's silent knife kill stays hidden.
    const isBurtonSilentKnife = (
        attacker.type === 'burton' &&
        typeof getArmorCategory === 'function' && getArmorCategory(target) === 'infantry' &&
        attacker.mesh && attacker.mesh.position.distanceTo(targetPos) <= 5.5
    );
    if (attacker.isStealthed && attacker.type !== 'pathfinder' && !isBurtonSilentKnife) {
        const curT = (typeof buildingTick !== 'undefined' ? buildingTick : 0);
        const STEALTH_DELAY_TICKS = { stealthfighter: 90, burton: 120, blacklotus: 150, jarmen: 120, hijacker: 30, comanche: 90, rebel: 150 };
        attacker.isStealthed = false;
        attacker.revealedUntil = curT + (STEALTH_DELAY_TICKS[attacker.type] || 90);
    }

    // Authentic Heroic Tracers (Heroic rank units fire intense red laser tracers & scaled flashes!)
    const isHeroic = (attacker.veterancy >= 3);
    const heroicTracerColor = 0xff1a1a;
    const heroicFlashColor = 0xff1111;
    const heroicScale = isHeroic ? 1.35 : 1.0;

    // --- SIGNATURE C&C GENERALS WEAPON EFFECTS & DAMAGE APPLICATION ---

    const targetArmor = getArmorCategory(target);

    if (attacker.type === 'overlord') {
        // Authentic Zero Hour Overlord Dual 125mm Cannons (OverlordTankGun): 2-shot staggered salvo (220ms between barrels), 80 AP each (160 total), 2.0s reload
        const fireOverlordBarrel = (xOff, isSecond) => {
            if (attacker.health <= 0) return;
            const mPos = getMuzzleWorldPosition(attacker, xOff);
            const curTPos = (target && target.health > 0 && (target.position || (target.mesh && target.mesh.position)))
                ? (target.position || target.mesh.position).clone()
                : targetPos.clone();
            curTPos.y += (target && target.isAir ? 0.2 : 0.5);
            if (typeof spawnCannonMuzzleBlast === 'function') {
                spawnCannonMuzzleBlast(mPos, curTPos, { scale: 1.15 * heroicScale, color: 0xff9f43, isHeroic, dualVent: true });
            } else {
                spawnMuzzleFlash(mPos, isHeroic ? heroicFlashColor : 0xffa502, 0.9 * heroicScale);
            }
            if (typeof triggerUnitRecoil === 'function') triggerUnitRecoil(attacker, curTPos, isSecond ? 1.15 : 1.35);
            if (typeof spawnCannonShellProjectile === 'function') {
                spawnCannonShellProjectile(mPos, curTPos, {
                    color: 0xffb142, thickness: 1.25 * heroicScale, speed: isSecond ? 3.85 : 4.0, isHeroic,
                    onImpact: (hitPos) => { if (typeof spawnCannonImpactFX === 'function') spawnCannonImpactFX(hitPos, true, isHeroic, targetArmor); }
                });
            } else {
                spawnBulletTracer(mPos, curTPos, isHeroic ? heroicTracerColor : 0xffb142, 4.2 * heroicScale);
                if (typeof spawnCannonImpactFX === 'function') spawnCannonImpactFX(curTPos, true, isHeroic, targetArmor);
            }
            playAudio('overlord_cannon', {}, 'china');
            if (target && target.health > 0) {
                applyCalculatedDamage(attacker, target, 80, 'ARMOR_PIERCING');
            }
        };
        fireOverlordBarrel(-0.45, false);
        setTimeout(() => fireOverlordBarrel(0.45, true), 220);
        // Note: Overlord Gatling Cannon upgrade fires autonomously at full 43.2 range with 3-stage spool-up in processCombatScanning()!
    } else if (attacker.type === 'dragon') {
        // Dragon Tank NAPALM FLAMETHROWER! (Continuous stream @ 0.3s)
        spawnFlamethrowerBurst(muzzlePos, targetPos);
        if (Math.random() < 0.45) playAudio('dragon_flame', {}, 'china');
        applyCalculatedDamage(attacker, target, 10, 'FLAME');
    } else if (attacker.type === 'toxintractor') {
        // Toxin Tractor CHEMICAL ANTHRAX SPRAY! (Continuous stream @ 0.3s)
        spawnToxinSprayBurst(muzzlePos, targetPos);
        if (Math.random() < 0.45) playAudio('toxin_spray', {}, 'gla');
        let toxDmg = 10;
        if (attacker.salvageLevel >= 1) toxDmg = Math.round(toxDmg * (attacker.salvageLevel >= 2 ? 1.6 : 1.35));
        applyCalculatedDamage(attacker, target, toxDmg, 'TOXIN');
    } else if (attacker.type === 'buggy') {
        // Rocket Buggy RIPPLE VOLLEY! (6s reload, 4 rockets -> 8 with Buggy Ammo Chains; apRockets applied in applyCalculatedDamage)
        let rDmg = 20;
        if (attacker.salvageLevel >= 1) rDmg = Math.round(rDmg * (attacker.salvageLevel >= 2 ? 1.6 : 1.35));
        const rCount = (typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined' && researchedTechs.has('buggyAmmo')) ? 8 : 4;
        if (typeof playAudio === 'function') playAudio('buggy_rocket', {}, 'gla');
        for (let r = 0; r < rCount; r++) {
            setTimeout(() => {
                    const mPos = getMuzzleWorldPosition(attacker, (r % 2 === 0 ? -0.25 : 0.25));
                    if (typeof spawnRocketBackblast === 'function') spawnRocketBackblast(mPos, targetPos, 0.72 * heroicScale);
                    else spawnMuzzleFlash(mPos, isHeroic ? heroicFlashColor : 0xff9f43, 0.4 * heroicScale);
                    spawnRocketProjectile(mPos, targetPos, false, false, {
                            attacker: attacker,
                            target: target,
                            damage: rDmg,
                            damageType: 'EXPLOSIVE',
                            splashRadius: 1.5
                    });
                }, r * 80);
        }
    } else if (['rocket', 'missiledefender', 'rpg', 'tankhunter'].includes(attacker.type)) {
        // Shoulder-fired rockets (Tracked for Point Defense Laser interception; apRockets applied in applyCalculatedDamage)
        // Official INIZH.big: China Tank Hunters and vanilla GLA RPG Troopers fire standard AT rockets (NO toxin pools).
        // Only GLA Toxin General (Dr. Thrax) RPG Troopers fire Anthrax rockets.
        const isToxinRocket = (attacker.type === 'rpg' && typeof activePlayerGeneral !== 'undefined' && activePlayerGeneral === 'gla_toxin' && typeof units !== 'undefined' && units.includes(attacker));
        if (typeof spawnRocketBackblast === 'function') spawnRocketBackblast(muzzlePos, targetPos, 0.85 * heroicScale);
        else spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : 0xff9f43, 0.5 * heroicScale);
        spawnRocketProjectile(muzzlePos, targetPos, false, isToxinRocket, {
                attacker: attacker,
                target: target,
                damage: 40,
                damageType: 'EXPLOSIVE',
                splashRadius: 2.0
        });
        if (attacker.type === 'rpg') playAudio('rpg_launch', {}, 'gla');
        else if (attacker.type === 'tankhunter') playAudio('tankhunter_rocket', {}, 'china');
        else playAudio('missile_defender', {}, 'usa');
    } else if (['tomahawk', 'scud'].includes(attacker.type)) {
        // SCUD Launcher must elevate its launch rail into firing position before launching
        if (attacker.type === 'scud') {
            const turretEl = getCachedNode(attacker.mesh, 'TURRETEL');
            if (turretEl && turretEl.rotation.x > -0.75) {
                attacker.attackCooldown = 6;
                return;
            }
        }
        // Heavy cruise / ballistic missile (Tracked for Point Defense Laser interception!)
        const tomMissileNode = (attacker.type === 'tomahawk') ? getCachedNode(attacker.mesh, 'MISSILE') : null;
        const scudMuzzle = (attacker.type === 'scud') ? (getCachedNode(attacker.mesh, 'WEAPONA01') || getCachedNode(attacker.mesh, 'MISSILE')) : null;
        const launchNode = tomMissileNode || scudMuzzle;
        const launchPos = launchNode ? launchNode.getWorldPosition(new THREE.Vector3()) : muzzlePos;
        if (tomMissileNode) tomMissileNode.visible = false;
        if (typeof spawnRocketBackblast === 'function') spawnRocketBackblast(launchPos, targetPos, 1.65 * heroicScale);
        else spawnMuzzleFlash(launchPos, isHeroic ? heroicFlashColor : 0xff793f, 1.2 * heroicScale);
        const mDmg = attacker.type === 'scud' ? 300 : 150;
        const mSplash = attacker.type === 'tomahawk' ? 7.5 : 5.5;
        spawnRocketProjectile(launchPos, targetPos, true, attacker.type === 'scud', {
                attacker: attacker,
                target: target,
                damage: mDmg,
                damageType: 'EXPLOSIVE',
                splashRadius: mSplash,
                impactSound: attacker.type === 'tomahawk' ? 'expl_tomahawk' : null,
                impactShake: attacker.type === 'tomahawk' ? 1.6 : 0,
                missileTemplate: tomMissileNode
        });
        if (attacker.type === 'tomahawk') playUSASound('tomahawk_launch');
        if (attacker.type === 'scud') playAudio('scud_launch', {}, 'gla');
    } else if (attacker.type === 'inferno') {
        // Official INIZH.big InfernoCannonGun / InfernoCannonGunUpgraded (Black Napalm + 3-hit Firestorm Synergy)
        const hasBlackNapalm = (!attacker.isAI && typeof researchedTechs !== 'undefined' && researchedTechs.has('blackNapalm')) || !!attacker.hasBlackNapalm;
        const shellCol = hasBlackNapalm ? 0x1e90ff : 0xff6b22;
        const coreCol = hasBlackNapalm ? 0xa8e6ff : 0xffe699;
        const smokeCol = hasBlackNapalm ? 0x1b2a4a : 0xff8833;
        if (typeof spawnCannonMuzzleBlast === 'function') {
            spawnCannonMuzzleBlast(muzzlePos, targetPos, { scale: 1.35 * heroicScale, color: shellCol, smokeColor: hasBlackNapalm ? 0x1e272e : 0x6b4b3e, isHeroic, isArtillery: true });
        } else {
            spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : shellCol, 1.2 * heroicScale);
        }
        if (typeof triggerUnitRecoil === 'function') triggerUnitRecoil(attacker, targetPos, 1.4);
        playAudio('inferno_cannon', {}, 'china');
        const impactPos = targetPos.clone();
        const detonateInferno = (hitPos) => {
            const p = hitPos || impactPos;
            if (typeof spawnExplosion === 'function') spawnExplosion(p, hasBlackNapalm ? 0x1e90ff : 0xff5500, 1.45, 'expl_fire');
            if (typeof spawnNapalmScorchPool === 'function') spawnNapalmScorchPool(p, hasBlackNapalm, true);
            const allHostile = [...((attacker.isAI ? units : enemyUnits) || []), ...((attacker.isAI ? structures : enemyStructures) || [])];
            allHostile.forEach(h => {
                    if (!h || h.health <= 0 || isFriendly(attacker, h)) return;
                    const hp = h.position || (h.mesh && h.mesh.position);
                    if (hp && hp.distanceTo(p) <= 6.5) {
                        applyCalculatedDamage(attacker, h, h === target ? 65 : 35, 'FLAME');
                    }
            });
        };
        if (typeof spawnCannonShellProjectile === 'function') {
            spawnCannonShellProjectile(muzzlePos, impactPos, {
                color: shellCol, coreColor: coreCol, smokeColor: smokeCol,
                thickness: 1.45 * heroicScale, speed: 2.2, arcHeight: 12.5, trailRate: 0.9, trailSize: 0.36, isHeroic,
                onImpact: detonateInferno
            });
        } else {
            spawnBulletTracer(muzzlePos, targetPos, isHeroic ? heroicTracerColor : shellCol, 5.5 * heroicScale);
            setTimeout(() => detonateInferno(impactPos), 280);
        }
    } else if (attacker.type === 'nukecannon' || attacker.type === 'nuketank') {
        // China Nuke Cannon: Hydraulic Outrigger Siege Deployment + Nuclear vs Neutron Shells!
        deployNukeCannonOutriggers(attacker);
        const isNeutron = !!(attacker.neutronShells && attacker.ammoMode !== 'nuclear');
        const shellColor = isNeutron ? 0x00f2fe : 0x10ac84;
        if (typeof spawnCannonMuzzleBlast === 'function') {
            spawnCannonMuzzleBlast(muzzlePos, targetPos, {
                scale: 1.65 * heroicScale, color: shellColor,
                smokeColor: isNeutron ? 0x99f2ff : 0xaad8b0,
                isHeroic, isArtillery: true
            });
        } else {
            spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : shellColor, 1.6 * heroicScale);
            if (typeof spawnSmokePuff === 'function') spawnSmokePuff(muzzlePos, 0xd0d4dc, 0.75);
        }
        if (typeof triggerUnitRecoil === 'function') triggerUnitRecoil(attacker, targetPos, 1.65);
        playAudio('nuke_artillery', {}, 'china');
        playAudio('shell_whistle', { volume: 0.65 }, 'china');

        const impactPos = targetPos.clone();
        const triggerNukeVisuals = (hitPos) => {
            const p = hitPos || impactPos;
            if (isNeutron) {
                playAudio('expl_neutron', { volume: 0.88 }, 'china');
                if (typeof spawnNeutronBlast === 'function') spawnNeutronBlast(p);
            } else {
                playAudio('expl_mininuke', { volume: 0.92 }, 'china');
                spawnMiniNukeMushroom(p);
                if (typeof spawnLingeringToxinCloud === 'function') spawnLingeringToxinCloud(p);
            }
        };
        const applyNukeCannonImpact = (hitPos) => {
            const center = hitPos || impactPos;
            const allHostileUnits = (attacker.isAI ? units : enemyUnits) || [];
            const allHostileStructs = (attacker.isAI ? structures : enemyStructures) || [];
            if (isNeutron) {
                // Authentic Neutron Shell: Wipes out all infantry and kills drivers inside all ground vehicles in blast radius!
                allHostileUnits.forEach(e => {
                        if (e.health <= 0 || !e.mesh || isFriendly(attacker, e)) return;
                        if (e.mesh.position.distanceTo(center) <= 13.0) {
                            const cat = getArmorCategory(e);
                            if (cat === 'infantry') {
                                applyCalculatedDamage(attacker, e, 999, 'TOXIN');
                            } else if (!e.isAir) {
                                e.isUnmanned = true;
                                e.disabledUntil = 999999;
                                e.combatTarget = null;
                                if (e.targetPosition && e.mesh) e.targetPosition.copy(e.mesh.position);
                            }
                        }
                });
                if (target && target.health > 0 && !isFriendly(attacker, target)) {
                    const tPos = target.position || (target.mesh && target.mesh.position);
                    if (!tPos || tPos.distanceTo(center) <= 14.0) {
                        const tCat = getArmorCategory(target);
                        if (tCat === 'infantry') {
                            applyCalculatedDamage(attacker, target, 999, 'TOXIN');
                        } else if (!target.isAir && tCat !== 'building') {
                            target.isUnmanned = true;
                            target.disabledUntil = 999999;
                            target.combatTarget = null;
                        }
                    }
                }
            } else {
                // AoE Tactical Nuclear Shell Splash across all units & structures within 12 units
                const hitSet = new Set();
                allHostileUnits.forEach(e => {
                        if (e.health > 0 && e.mesh && !isFriendly(attacker, e) && e.mesh.position.distanceTo(center) <= 12.0) {
                            hitSet.add(e);
                            applyCalculatedDamage(attacker, e, 160, 'EXPLOSIVE');
                        }
                });
                allHostileStructs.forEach(s => {
                        const sp = s.position || (s.mesh && s.mesh.position);
                        if (s.health > 0 && sp && !isFriendly(attacker, s) && sp.distanceTo(center) <= 13.5) {
                            hitSet.add(s);
                            applyCalculatedDamage(attacker, s, 180, 'EXPLOSIVE');
                        }
                });
                if (target && target.health > 0 && !hitSet.has(target)) {
                    const tPos = target.position || (target.mesh && target.mesh.position);
                    if (!tPos || tPos.distanceTo(center) <= 14.0) {
                        applyCalculatedDamage(attacker, target, 160, 'EXPLOSIVE');
                    }
                }
            }
        };
        const onNukeShellImpact = (hitPos) => {
            triggerNukeVisuals(hitPos);
            applyNukeCannonImpact(hitPos);
        };
        if (typeof spawnCannonShellProjectile === 'function') {
            spawnCannonShellProjectile(muzzlePos, impactPos, {
                color: shellColor, coreColor: 0xeaffff,
                smokeColor: isNeutron ? 0x70f8ff : 0x55efc4,
                thickness: 1.65 * heroicScale, speed: 2.0, arcHeight: 13.0, trailRate: 0.95, trailSize: 0.38, isHeroic,
                onImpact: onNukeShellImpact
            });
        } else {
            spawnBulletTracer(muzzlePos, targetPos, shellColor, 6.5 * heroicScale);
            onNukeShellImpact(impactPos);
        }
    } else if (['battlemaster'].includes(attacker.type)) {
        // China 152mm Smoothbore Cannon (uraniumShells applied in applyCalculatedDamage)
        const hasUranium = typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined' && researchedTechs.has('uraniumShells');
        const hasToxin = typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined' && researchedTechs.has('toxinShells');
        if (typeof spawnCannonMuzzleBlast === 'function') {
            spawnCannonMuzzleBlast(muzzlePos, targetPos, {
                scale: 1.05 * heroicScale,
                color: hasUranium ? 0x6dff8e : 0xff8c32,
                smokeColor: hasUranium ? 0xb8d8be : 0xc8c0b4,
                isHeroic, dualVent: true
            });
        } else {
            spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : 0xff793f, 1.1 * heroicScale);
            if (typeof spawnSmokePuff === 'function') spawnSmokePuff(muzzlePos, 0xc8c0b4, 0.42);
        }
        if (typeof triggerUnitRecoil === 'function') triggerUnitRecoil(attacker, targetPos, 1.08);
        if (typeof spawnCannonShellProjectile === 'function') {
            spawnCannonShellProjectile(muzzlePos, targetPos, {
                color: hasUranium ? 0x55efc4 : 0xffb142,
                smokeColor: hasUranium ? 0x7bed9f : 0xd0ccc4,
                thickness: 1.1 * heroicScale, speed: 3.9, isHeroic,
                onImpact: (hitPos) => {
                    if (typeof spawnCannonImpactFX === 'function') spawnCannonImpactFX(hitPos, true, isHeroic, targetArmor);
                    if (hasToxin && typeof spawnLingeringToxinCloud === 'function') spawnLingeringToxinCloud(hitPos);
                }
            });
        } else {
            spawnBulletTracer(muzzlePos, targetPos, isHeroic ? heroicTracerColor : 0xffb142, 3.8 * heroicScale);
            if (typeof spawnCannonImpactFX === 'function') spawnCannonImpactFX(targetPos, true, isHeroic, targetArmor);
            if (hasToxin && typeof spawnLingeringToxinCloud === 'function') spawnLingeringToxinCloud(targetPos);
        }
        playAudio('battlemaster_cannon', {}, 'china');
        applyCalculatedDamage(attacker, target, 60, 'ARMOR_PIERCING');
    } else if (['gatlingTank', 'gatlingCannon', 'gatling'].includes(attacker.type)) {
        // China Twin 20mm Rotary Gatling Cannon (chainGuns applied in applyCalculatedDamage)
        const mL = getMuzzleWorldPosition(attacker, -0.18);
        const mR = getMuzzleWorldPosition(attacker, 0.18);
        spawnMuzzleFlash(mL, isHeroic ? heroicFlashColor : 0xffa502, 0.45 * heroicScale);
        spawnBulletTracer(mL, targetPos, isHeroic ? heroicTracerColor : 0xf1c40f, 3.2 * heroicScale);
        if (typeof spawnBulletImpactFX === 'function') spawnBulletImpactFX(targetPos, targetArmor, isHeroic);
        setTimeout(() => {
            spawnMuzzleFlash(mR, isHeroic ? heroicFlashColor : 0xffa502, 0.42 * heroicScale);
            spawnBulletTracer(mR, targetPos, isHeroic ? heroicTracerColor : 0xffd32a, 3.0 * heroicScale);
            if (typeof spawnSmokePuff === 'function' && Math.random() < 0.35) spawnSmokePuff(mR, 0xc8c4bc, 0.22);
        }, 48);
        if (Math.random() < 0.45) playAudio('gatling_fire', {}, 'china');
        applyCalculatedDamage(attacker, target, 10, 'GATLING');
    } else if (attacker.type === 'dragonTank') {
        // China Dragon Tank Flamethrower (Continuous stream @ 0.3s)
        spawnFlamethrowerBurst(muzzlePos, targetPos);
        if (Math.random() < 0.45) playAudio('dragon_flame', {}, 'china');
        applyCalculatedDamage(attacker, target, 10, 'FLAME');
    } else if (['rebel', 'technical'].includes(attacker.type)) {
        // GLA Kalashnikov AK-47 & Technical Heavy MG (apBullets applied in applyCalculatedDamage)
        const burstN = attacker.type === 'technical' ? 3 : 2;
        for (let b = 0; b < burstN; b++) {
            setTimeout(() => {
                spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : 0xf1c40f, (attacker.type === 'technical' ? 0.42 : 0.28) * heroicScale);
                spawnBulletTracer(muzzlePos, targetPos, isHeroic ? heroicTracerColor : 0xe67e22, (attacker.type === 'technical' ? 2.6 : 1.9) * heroicScale);
                if (b === 0 && typeof spawnBulletImpactFX === 'function') spawnBulletImpactFX(targetPos, targetArmor, isHeroic);
            }, b * 65);
        }
        playAudio(attacker.type === 'technical' ? 'technical_mg' : 'rebel_ak47', {}, 'gla');
        let baseMG = (attacker.type === 'technical' ? 18 : 15);
        if (attacker.type === 'technical' && attacker.salvageLevel >= 1) {
            baseMG = Math.round(baseMG * (attacker.salvageLevel >= 2 ? 1.6 : 1.35));
        }
        applyCalculatedDamage(attacker, target, baseMG, 'SMALL_ARMS');
    } else if (attacker.type === 'raptor' || attacker.type === 'mig') {
        // USA Raptor AMRAAM Missiles / China MiG Napalm Missiles
        const mPosL = getMuzzleWorldPosition(attacker, -0.65);
        const mPosR = getMuzzleWorldPosition(attacker, 0.65);
        if (typeof spawnRocketBackblast === 'function') {
            spawnRocketBackblast(mPosL, targetPos, 0.75 * heroicScale);
            setTimeout(() => spawnRocketBackblast(mPosR, targetPos, 0.75 * heroicScale), 100);
        } else {
            spawnMuzzleFlash(mPosL, isHeroic ? heroicFlashColor : 0xff9f43, 0.5 * heroicScale);
            spawnMuzzleFlash(mPosR, isHeroic ? heroicFlashColor : 0xff9f43, 0.5 * heroicScale);
        }
        const isMig = (attacker.type === 'mig');
        const mDmgType = isMig ? 'FIRE' : 'EXPLOSIVE';
        spawnRocketProjectile(mPosL, targetPos, false, false, {
            attacker, target, damage: isMig ? 55 : 60, damageType: mDmgType, splashRadius: isMig ? 3.0 : 2.0,
            onImpact: isMig ? (p) => { if (typeof spawnNapalmScorchPool === 'function') spawnNapalmScorchPool(p); } : undefined
        });
        setTimeout(() => spawnRocketProjectile(mPosR, targetPos, false, false, {
            attacker, target, damage: isMig ? 55 : 60, damageType: mDmgType, splashRadius: isMig ? 3.0 : 2.0
        }), 100);
        playAudio('jet_missile', {}, isMig ? 'china' : 'usa');
    } else if (attacker.type === 'stealthfighter') {
        // USA Stealth Fighter (StealthFighterMissileWeapon): 2x 100 STEALTHJET_MISSILES Bunker-Busters!
        const mPosL = getMuzzleWorldPosition(attacker, -0.55);
        const mPosR = getMuzzleWorldPosition(attacker, 0.55);
        spawnMuzzleFlash(mPosL, isHeroic ? heroicFlashColor : 0x00d2d3, 0.6 * heroicScale);
        spawnGuidedBomb(mPosL, targetPos, false, isHeroic);
        setTimeout(() => {
            spawnMuzzleFlash(mPosR, isHeroic ? heroicFlashColor : 0x00d2d3, 0.6 * heroicScale);
            spawnGuidedBomb(mPosR, targetPos, false, isHeroic);
        }, 110);
        playUSASound('jet_missile');
        setTimeout(() => applyCalculatedDamage(attacker, target, 100, 'STEALTHJET_MISSILES'), 380);
        setTimeout(() => applyCalculatedDamage(attacker, target, 100, 'STEALTHJET_MISSILES'), 490);
    } else if (attacker.type === 'aurora') {
        // USA Aurora Hypersonic Bomber (AuroraBombWeapon): 400 AURORA_BOMB Fuel-Air Bomb with Massive Shockwave!
        spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : 0x00d2d3, 1.2 * heroicScale);
        spawnGuidedBomb(muzzlePos, targetPos, true, isHeroic);
        playUSASound('daisycutter_drop');
        setTimeout(() => applyCalculatedDamage(attacker, target, 400, 'AURORA_BOMB'), 500);
    } else if (attacker.type === 'comanche') {
        // USA Comanche Attack Helicopter: 20mm Rotary Cannon + Hellfire Missiles!
        for (let b = 0; b < 2; b++) {
            setTimeout(() => {
                spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : 0xffa502, 0.45 * heroicScale);
                spawnBulletTracer(muzzlePos, targetPos, isHeroic ? heroicTracerColor : 0xffd32a, 2.8 * heroicScale);
                if (b === 0 && typeof spawnBulletImpactFX === 'function') spawnBulletImpactFX(targetPos, targetArmor, isHeroic);
            }, b * 55);
        }
        const mPosL = getMuzzleWorldPosition(attacker, -0.5);
        const mPosR = getMuzzleWorldPosition(attacker, 0.5);
        setTimeout(() => {
            if (typeof spawnRocketBackblast === 'function') spawnRocketBackblast(mPosL, targetPos, 0.7 * heroicScale);
            spawnRocketProjectile(mPosL, targetPos, false, false, { attacker, target, damage: 35, damageType: 'EXPLOSIVE' });
        }, 80);
        setTimeout(() => {
            if (typeof spawnRocketBackblast === 'function') spawnRocketBackblast(mPosR, targetPos, 0.7 * heroicScale);
            spawnRocketProjectile(mPosR, targetPos, false, false, { attacker, target, damage: 35, damageType: 'EXPLOSIVE' });
        }, 180);
        if (typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined' && researchedTechs.has('rocketPods')) {
            setTimeout(() => spawnRocketProjectile(mPosL, targetPos, false, false, { attacker, target, damage: 25, damageType: 'EXPLOSIVE' }), 260);
            setTimeout(() => spawnRocketProjectile(mPosR, targetPos, false, false, { attacker, target, damage: 25, damageType: 'EXPLOSIVE' }), 340);
        }
        playUSASound('comanche_cannon');
        playUSASound('comanche_missile');
        applyCalculatedDamage(attacker, target, 25, 'SMALL_ARMS');
    } else if (attacker.type === 'paladin') {
        // USA Paladin Tank: High-Velocity 120mm Tank Cannon (PDL runs autonomously on defense!)
        const hasToxin = typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined' && researchedTechs.has('toxinShells');
        if (typeof spawnCannonMuzzleBlast === 'function') {
            spawnCannonMuzzleBlast(muzzlePos, targetPos, { scale: 1.0 * heroicScale, color: 0xffa502, isHeroic, dualVent: true });
        } else {
            spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : 0xffa502, 0.75 * heroicScale);
            if (typeof spawnSmokePuff === 'function') spawnSmokePuff(muzzlePos, 0xc8c0b4, 0.42);
        }
        if (typeof triggerUnitRecoil === 'function') triggerUnitRecoil(attacker, targetPos, 1.0);
        if (typeof spawnCannonShellProjectile === 'function') {
            spawnCannonShellProjectile(muzzlePos, targetPos, {
                color: 0xffb830, thickness: 1.05 * heroicScale, speed: 4.2, isHeroic,
                onImpact: (hitPos) => {
                    if (typeof spawnCannonImpactFX === 'function') spawnCannonImpactFX(hitPos, false, isHeroic, targetArmor);
                    if (hasToxin && typeof spawnLingeringToxinCloud === 'function') spawnLingeringToxinCloud(hitPos);
                }
            });
        } else {
            spawnBulletTracer(muzzlePos, targetPos, isHeroic ? heroicTracerColor : 0xffb142, 3.5 * heroicScale);
            if (typeof spawnCannonImpactFX === 'function') spawnCannonImpactFX(targetPos, false, isHeroic, targetArmor);
            if (hasToxin && typeof spawnLingeringToxinCloud === 'function') spawnLingeringToxinCloud(targetPos);
        }
        playUSASound('paladin_cannon');
        applyCalculatedDamage(attacker, target, 60, 'ARMOR_PIERCING');
    } else if (attacker.type === 'quad') {
        // Quad Cannon 4x23mm Autocannon Salvo (apBullets applied in applyCalculatedDamage)
        [-0.22, 0.22].forEach((xOff, idx) => {
            setTimeout(() => {
                const mPos = getMuzzleWorldPosition(attacker, xOff);
                spawnMuzzleFlash(mPos, isHeroic ? heroicFlashColor : 0xffa502, 0.38 * heroicScale);
                spawnBulletTracer(mPos, targetPos, isHeroic ? heroicTracerColor : 0xffd32a, 2.5 * heroicScale);
                if (idx === 0 && typeof spawnBulletImpactFX === 'function') spawnBulletImpactFX(targetPos, targetArmor, isHeroic);
                if (idx === 1 && typeof spawnSmokePuff === 'function' && Math.random() < 0.4) spawnSmokePuff(mPos, 0xb8b4ac, 0.22);
            }, idx * 45);
        });
        let qDmg = 10;
        if (attacker.salvageLevel >= 1) qDmg = Math.round(qDmg * (attacker.salvageLevel >= 2 ? 1.6 : 1.35));
        if (Math.random() < 0.5) playAudio('quad_cannon', {}, 'gla');
        applyCalculatedDamage(attacker, target, qDmg, 'GATLING');
    } else if (attacker.type === 'jarmen' || attacker.type === 'pathfinder') {
        // Supersonic Sniper Vapor Trail (Instant lethal damage vs infantry, Jarmen Kell also snipes vehicle drivers!)
        if (typeof spawnSniperVaporTrail === 'function') {
            spawnSniperVaporTrail(muzzlePos, targetPos, attacker.type === 'jarmen' ? 0xffeaa7 : 0xeef6ff, isHeroic);
        } else {
            spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : 0xffffff, 0.3 * heroicScale);
            spawnLaserBeam(muzzlePos, targetPos, isHeroic ? heroicTracerColor : 0xffffff, isHeroic ? 3.2 : 2);
        }
        if (attacker.type === 'jarmen') playAudio('jarmen_snipe', {}, 'gla');
        else if (typeof playUSASound === 'function') playUSASound('sniper_rifle');
        const tArmor = targetArmor;
        const curTick = (typeof buildingTick !== 'undefined' ? buildingTick : 0);
        const canSnipeDriver = !attacker.snipeCooldownUntil || curTick >= attacker.snipeCooldownUntil;
        if (attacker.type === 'jarmen' && canSnipeDriver && (tArmor === 'light_vehicle' || tArmor === 'heavy_vehicle') && !target.isAir && target.mesh && !target.isUnmanned) {
            target.isUnmanned = true;
            target.disabledUntil = curTick + 999999;
            target.combatTarget = null;
            attacker.combatTarget = null;
            attacker.snipeCooldownUntil = curTick + 1800; // Official INIZH.big 30s ClipReloadTime
            if (typeof playAudio === 'function') playAudio('jarmen_snipe_hit', { volume: 0.85 }, 'gla');
            if (typeof spawnSparks === 'function') spawnSparks(targetPos, 0xffffff, 8);
            if (typeof showNotification === 'function') {
                showNotification(`Jarmen Kell sniped the driver of ${target.type.toUpperCase()}! Vehicle is now unmanned! (30s cooldown)`, 'success');
            }
            if (typeof updateSidebar === 'function' && attacker.selected) updateSidebar();
        } else {
            applyCalculatedDamage(attacker, target, 120, 'SNIPER');
        }
    } else if (attacker.type === 'burton') {
        // USA Hero Colonel Burton: Silent Knife (melee vs infantry), C4 Demo Charge (close vs structure/armor), or Heavy Rifle!
        const dist = attacker.mesh.position.distanceTo(targetPos);
        const tArmor = targetArmor;
        if (tArmor === 'infantry' && dist <= 5.5) {
            // Silent Knife Kill (stays stealthed!)
            attacker.isStealthed = true;
            applyCalculatedDamage(attacker, target, 250, 'SNIPER');
        } else if ((tArmor === 'building' || tArmor === 'heavy_vehicle' || tArmor === 'light_vehicle') && dist <= 11.0) {
            // C4 Demolition Charge!
            if (typeof playAudio === 'function') playAudio('demo_beep', { volume: 0.85 }, 'usa');
            if (typeof spawnEnhancedExplosion === 'function') spawnEnhancedExplosion(targetPos, 0xff4757, 2.4, true, 'expl_building');
            else spawnExplosion(targetPos, 0xff4757);
            if (typeof triggerScreenShake === 'function') triggerScreenShake(0.8);
            applyCalculatedDamage(attacker, target, 350, 'EXPLOSIVE');
        } else {
            for (let b = 0; b < 3; b++) {
                setTimeout(() => {
                    spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : 0xffa502, 0.42 * heroicScale);
                    spawnBulletTracer(muzzlePos, targetPos, isHeroic ? heroicTracerColor : 0xffd32a, 2.6 * heroicScale);
                    if (b === 1 && typeof spawnBulletImpactFX === 'function') spawnBulletImpactFX(targetPos, targetArmor, isHeroic);
                }, b * 55);
            }
            playUSASound('burton_rifle');
            applyCalculatedDamage(attacker, target, 45, 'SMALL_ARMS');
        }
    } else if (attacker.type === 'blacklotus') {
        // China Hero Black Lotus: Cyber Capture Building, Cash Hack ($1,000), or Vehicle Disable!
        spawnLaserBeam(muzzlePos, targetPos, 0x00ffaa, 2);
        playAudio('radio_chirp', {}, 'china');
        const tArmor = targetArmor;
        if (tArmor === 'building') {
            if ((target.type === 'supplyCenter' || target.type === 'supplyStash') && !attacker.isAI) {
                const curTick = (typeof buildingTick !== 'undefined') ? buildingTick : 0;
                const HACK_COOLDOWN_TICKS = 1500; // 25s at 60Hz sim ticks (respects pause & game speed)
                if (target._lastLotusHackTick === undefined || (curTick - target._lastLotusHackTick) >= HACK_COOLDOWN_TICKS) {
                    target._lastLotusHackTick = curTick;
                    playerResources += 1000;
                    if (typeof spawnFloatingCashNumber === 'function') spawnFloatingCashNumber(targetPos, 1000);
                    if (typeof showNotification === 'function') showNotification('Black Lotus hacked $1,000 from enemy Supply Depot!', 'success');
                    if (typeof updateHUD === 'function') updateHUD();
                } else {
                    const remainSec = Math.ceil((HACK_COOLDOWN_TICKS - (curTick - target._lastLotusHackTick)) / 60);
                    if (typeof showNotification === 'function') showNotification(`Cash Hack recharging on this depot (${remainSec}s)...`, 'info');
                }
            } else {
                applyCalculatedDamage(attacker, target, 340, 'EXPLOSIVE');
            }
        } else {
            target.disabledUntil = (typeof buildingTick !== 'undefined' ? buildingTick : 0) + 450;
            if (typeof spawnEMPDisableSparks === 'function') spawnEMPDisableSparks(targetPos);
        }
    } else if (attacker.type === 'hacker') {
        // China Hacker: Cyber-Disable Beam vs Enemy Vehicles/Turrets (generates cash when idle in gameLoop!)
        spawnLaserBeam(muzzlePos, targetPos, 0x10ac84, 2);
        playAudio('radio_chirp', {}, 'china');
        target.disabledUntil = (typeof buildingTick !== 'undefined' ? buildingTick : 0) + 210;
        if (typeof spawnEMPDisableSparks === 'function') spawnEMPDisableSparks(targetPos);
        applyCalculatedDamage(attacker, target, 10, 'SMALL_ARMS');
    } else if (attacker.type === 'hijacker') {
        // GLA Hijacker: Rushes enemy ground vehicle and captures it!
        const tArmor = targetArmor;
        if ((tArmor === 'light_vehicle' || tArmor === 'heavy_vehicle') && !target.isAir && target.mesh) {
            const dist = attacker.mesh.position.distanceTo(targetPos);
            if (dist > 6.5) {
                attacker.targetPosition.copy(targetPos);
                attacker.attackCooldown = 15;
                return;
            }
            // Transfer vehicle ownership!
            if (!attacker.isAI && typeof enemyUnits !== 'undefined' && enemyUnits.includes(target)) {
                const idx = enemyUnits.indexOf(target);
                if (idx !== -1) enemyUnits.splice(idx, 1);
                target.teamId = attacker.teamId;
                target.ownerId = attacker.ownerId;
                target.isAI = false;
                target.isUnmanned = false;
                target.disabledUntil = 0;
                target.combatTarget = null;
                units.push(target);
                if (typeof showNotification === 'function') showNotification(`Hijacker commandeered enemy ${target.type.toUpperCase()}!`, 'success');
            } else if (attacker.isAI && typeof units !== 'undefined' && units.includes(target)) {
                const idx = units.indexOf(target);
                if (idx !== -1) units.splice(idx, 1);
                target.teamId = attacker.teamId;
                target.ownerId = attacker.ownerId;
                target.isAI = true;
                target.isUnmanned = false;
                target.disabledUntil = 0;
                target.combatTarget = null;
                enemyUnits.push(target);
            }
            attacker.health = 0;
        } else {
            attacker.combatTarget = null;
        }
    } else if (attacker.type === 'terrorist' || attacker.type === 'bombtruck') {
        // GLA Terrorist & Bomb Truck: Rush target and detonate massive demolition payload on contact!
        const dist = attacker.mesh.position.distanceTo(targetPos);
        const detRange = (target.radius || 2.0) + (attacker.type === 'bombtruck' ? 6.5 : 4.5);
        if (dist > detRange) {
            attacker.targetPosition.copy(targetPos);
            attacker.attackCooldown = 12;
            return;
        }
        const isBio = attacker.bioBomb;
        const blastDmg = attacker.type === 'bombtruck' ? (attacker.highExplosive ? 480 : 340) : 220;
        const blastRad = attacker.type === 'bombtruck' ? (attacker.highExplosive ? 15 : 11) : 7.5;
        if (typeof spawnEnhancedExplosion === 'function') {
            spawnEnhancedExplosion(targetPos, isBio ? 0x2ecc71 : 0xff4757, attacker.type === 'bombtruck' ? 3.2 : 2.1, true, isBio ? 'anthrax_blast' : 'expl_vehicle');
        } else {
            spawnExplosion(targetPos, isBio ? 0x2ecc71 : 0xff4757);
            playAudio('explosion', {}, 'gla');
        }
        if (typeof spawnExplosionDebris === 'function') spawnExplosionDebris(targetPos, attacker.type === 'bombtruck' ? 8 : 5, 1.2, false);
        if (isBio && typeof spawnLingeringToxinCloud === 'function') spawnLingeringToxinCloud(targetPos);
        if (typeof triggerScreenShake === 'function') triggerScreenShake(attacker.type === 'bombtruck' ? 1.2 : 0.7);
        applyCalculatedDamage(attacker, target, blastDmg, isBio ? 'TOXIN' : 'EXPLOSIVE');
        const splashPool = attacker.isAI ? [...units, ...structures] : [...enemyUnits, ...enemyStructures];
        splashPool.forEach(other => {
                if (other !== target && other.health > 0) {
                    const op = other.position || (other.mesh && other.mesh.position);
                    if (op && op.distanceTo(targetPos) <= blastRad) {
                        applyCalculatedDamage(attacker, other, Math.round(blastDmg * 0.65), isBio ? 'TOXIN' : 'EXPLOSIVE');
                    }
                }
        });
        attacker.health = 0;
    } else if (attacker.type === 'mob') {
        // GLA Angry Mob: Multi-tracer AK-47 volley + Arcing Flaming Molotov Cocktails!
        [-0.35, 0, 0.35].forEach((off, idx) => {
            setTimeout(() => {
                const mPos = getMuzzleWorldPosition(attacker, off);
                spawnMuzzleFlash(mPos, isHeroic ? heroicFlashColor : 0xffa502, 0.35 * heroicScale);
                spawnBulletTracer(mPos, targetPos, isHeroic ? heroicTracerColor : 0xf39c12, 2.2 * heroicScale);
                if (idx === 1 && typeof spawnBulletImpactFX === 'function') spawnBulletImpactFX(targetPos, targetArmor, isHeroic);
            }, idx * 45);
        });
        if (typeof spawnThrownProjectile === 'function') {
            spawnThrownProjectile(muzzlePos, targetPos, {
                isMolotov: true,
                onImpact: (hitPos) => {
                    if (typeof spawnEnhancedExplosion === 'function') spawnEnhancedExplosion(hitPos, 0xff6b22, 0.85, false, 'expl_fire');
                    if (Math.random() < 0.35 && typeof spawnNapalmScorchPool === 'function') spawnNapalmScorchPool(hitPos);
                }
            });
        }
        playAudio('rebel_ak47', {}, 'gla');
        const mobDmg = 14;
        applyCalculatedDamage(attacker, target, mobDmg, 'SMALL_ARMS');
        applyCalculatedDamage(attacker, target, 7, 'FLAME');
    } else if (['tank', 'crusader', 'scorpion', 'marauder'].includes(attacker.type)) {
        // Tank Cannon (Crusader 60, Marauder 45, Scorpion 20 per INIZH.big)
        const isScorpion = attacker.type === 'scorpion';
        const isMarauder = attacker.type === 'marauder';
        const cannonScale = (isScorpion ? 0.78 : (isMarauder ? 0.96 : 1.0)) * heroicScale;
        const smokeCol = isMarauder ? 0x948c80 : (isScorpion ? 0xc2b8a3 : 0xc8c4bc);
        const hasToxin = typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined' && researchedTechs.has('toxinShells');

        if (typeof spawnCannonMuzzleBlast === 'function') {
            spawnCannonMuzzleBlast(muzzlePos, targetPos, {
                scale: cannonScale, color: 0xffa502, smokeColor: smokeCol, isHeroic, dualVent: !isScorpion
            });
        } else {
            spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : 0xffa502, 0.75 * heroicScale);
            if (typeof spawnSmokePuff === 'function') spawnSmokePuff(muzzlePos, 0xc8c0b4, 0.40);
        }
        if (typeof triggerUnitRecoil === 'function') triggerUnitRecoil(attacker, targetPos, isScorpion ? 0.75 : 1.0);
        if (typeof spawnCannonShellProjectile === 'function') {
            spawnCannonShellProjectile(muzzlePos, targetPos, {
                color: 0xffb830, smokeColor: smokeCol,
                thickness: cannonScale, speed: isScorpion ? 4.3 : 4.1, isHeroic,
                onImpact: (hitPos) => {
                    if (typeof spawnCannonImpactFX === 'function') spawnCannonImpactFX(hitPos, isMarauder, isHeroic, targetArmor);
                    if (hasToxin && typeof spawnLingeringToxinCloud === 'function') spawnLingeringToxinCloud(hitPos);
                }
            });
        } else {
            spawnBulletTracer(muzzlePos, targetPos, isHeroic ? heroicTracerColor : 0xffb142, 3.5 * heroicScale);
            if (typeof spawnCannonImpactFX === 'function') spawnCannonImpactFX(targetPos, false, isHeroic, targetArmor);
            if (hasToxin && typeof spawnLingeringToxinCloud === 'function') spawnLingeringToxinCloud(targetPos);
        }
        if (['tank', 'crusader'].includes(attacker.type)) playUSASound('cannon');
        else if (isScorpion) playAudio('scorpion_cannon', {}, 'gla');
        else playAudio('marauder_cannon', {}, 'gla');
        let tkDmg = isScorpion ? 20 : isMarauder ? 45 : 60;
        if (isMarauder && attacker.salvageLevel >= 1) {
            tkDmg = Math.round(tkDmg * (attacker.salvageLevel >= 2 ? 1.6 : 1.35));
            // Marauder twin cannon visuals on scrap upgrade
            const mPosR = getMuzzleWorldPosition(attacker, 0.3);
            if (typeof spawnCannonMuzzleBlast === 'function') {
                spawnCannonMuzzleBlast(mPosR, targetPos, { scale: cannonScale * 0.9, color: 0xffa502, smokeColor: smokeCol, isHeroic, dualVent: false });
            } else {
                spawnMuzzleFlash(mPosR, isHeroic ? heroicFlashColor : 0xffa502, 0.75 * heroicScale);
            }
            if (typeof spawnCannonShellProjectile === 'function') {
                spawnCannonShellProjectile(mPosR, targetPos, { color: 0xffb830, smokeColor: smokeCol, thickness: cannonScale, speed: 3.95, isHeroic });
            } else {
                spawnBulletTracer(mPosR, targetPos, isHeroic ? heroicTracerColor : 0xffb142, 3.5 * heroicScale);
            }
        } else if (isScorpion && (attacker.salvageLevel >= 1 || (typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined' && researchedTechs.has('scorpionRocket')))) {
            if (attacker.salvageLevel >= 1) {
                tkDmg = Math.round(tkDmg * (attacker.salvageLevel >= 2 ? 1.6 : 1.35));
            }
            // Secondary Scorpion Rocket (from turret rocket rack; apRockets applied in applyCalculatedDamage)
            const rackNode = getCachedNode(attacker.mesh, 'WEAPONA01') || getCachedNode(attacker.mesh, 'MISSLERACK01');
            const rocketPos = rackNode ? rackNode.getWorldPosition(new THREE.Vector3()) : muzzlePos;
            setTimeout(() => {
                    if (typeof playAudio === 'function') playAudio('scorpion_missile', {}, 'gla');
                    if (typeof spawnRocketBackblast === 'function') spawnRocketBackblast(rocketPos, targetPos, 0.72 * heroicScale);
                    spawnRocketProjectile(rocketPos, targetPos, false, false, { attacker, target, damage: 38, damageType: 'EXPLOSIVE' });
                }, 120);
        }
        applyCalculatedDamage(attacker, target, tkDmg, 'ARMOR_PIERCING');
    } else if (attacker.type === 'humvee') {
        const hasTow = hasHumveeTowMissile(attacker);
        if (target.isAir) {
            // Retail INIZH.big HumveeMissileWeaponAir: 50 dmg AntiAirborneVehicle TOW missile
            if (hasTow) {
                if (typeof spawnRocketBackblast === 'function') spawnRocketBackblast(muzzlePos, targetPos, 0.85 * heroicScale);
                spawnRocketProjectile(muzzlePos, targetPos, false, false, { attacker, target, damage: 50, damageType: 'EXPLOSIVE' });
                playAudio('missile_launch');
            }
            return;
        }
        // USA Humvee Heavy .50 Machine Gun (3-round burst + TOW missile backblast)
        for (let b = 0; b < 3; b++) {
            setTimeout(() => {
                spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : 0xffa502, 0.42 * heroicScale);
                spawnBulletTracer(muzzlePos, targetPos, isHeroic ? heroicTracerColor : 0xf39c12, 2.3 * heroicScale);
                if (b === 1 && typeof spawnBulletImpactFX === 'function') spawnBulletImpactFX(targetPos, targetArmor, isHeroic);
            }, b * 55);
        }
        playUSASound('humvee_mg');
        let vehDmg = hasTow ? 15 : 12;
        if (hasTow) {
            // Retail INIZH.big HumveeMissileWeapon: 30 dmg ground TOW missile
            if (typeof spawnRocketBackblast === 'function') spawnRocketBackblast(muzzlePos, targetPos, 0.8 * heroicScale);
            spawnRocketProjectile(muzzlePos, targetPos, false, false, { attacker, target, damage: 30, damageType: 'EXPLOSIVE' });
        }
        // Fire-From-Within: Garrisoned troops fire out (Player & AI)
        if (attacker.garrisoned && attacker.garrisoned.length > 0) {
            vehDmg += attacker.garrisoned.length * 6;
        }
        applyCalculatedDamage(attacker, target, vehDmg, 'SMALL_ARMS');
    } else {
        const hasFlashbang = attacker.type === 'ranger' && typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined' && researchedTechs.has('flashbang');
        const tArmorCat = targetArmor;
        if (hasFlashbang && (target.isWorldBuilding || tArmorCat === 'infantry') && Math.random() < 0.65) {
            // USA Ranger Flashbang Stun Grenade (arcing grenade -> blinding white strobe flash!)
            spawnMuzzleFlash(muzzlePos, 0xffffff, 0.35);
            if (typeof spawnThrownProjectile === 'function') {
                spawnThrownProjectile(muzzlePos, targetPos, {
                    isMolotov: false,
                    onImpact: (hitPos) => {
                        if (typeof spawnEnhancedExplosion === 'function') spawnEnhancedExplosion(hitPos, 0xffffff, 1.35, false, 'expl_flashbang');
                        else playAudio('expl_flashbang', { volume: 0.78 }, 'usa');
                    }
                });
            } else {
                spawnBulletTracer(muzzlePos, targetPos, 0xffffff, 2.2);
                if (typeof spawnEnhancedExplosion === 'function') spawnEnhancedExplosion(targetPos, 0xffffff, 1.35, false, 'expl_flashbang');
                else playAudio('expl_flashbang', { volume: 0.78 }, 'usa');
            }
            applyCalculatedDamage(attacker, target, 32, 'FLASHBANG');
        } else {
            // Infantry Rifle / Carbine 2-round burst (apBullets applied in applyCalculatedDamage)
            for (let b = 0; b < 2; b++) {
                setTimeout(() => {
                    spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : 0xffa502, 0.25 * heroicScale);
                    spawnBulletTracer(muzzlePos, targetPos, isHeroic ? heroicTracerColor : 0xf1c40f, 1.8 * heroicScale);
                    if (b === 0 && typeof spawnBulletImpactFX === 'function') spawnBulletImpactFX(targetPos, targetArmor, isHeroic);
                }, b * 70);
            }
            if (attacker.type === 'redguard') playAudio('redguard_rifle', {}, 'china');
            else if (typeof playUSASound === 'function') playUSASound('machine_gun');
            applyCalculatedDamage(attacker, target, 15, 'SMALL_ARMS');
        }
    }
}

let blueprintRotationY = 0;
window.blueprintRotationY = 0;

function activateBlueprint(type) {
    if (blueprintMesh) {
        if (typeof disposeSceneNodeSafe === 'function') disposeSceneNodeSafe(blueprintMesh);
        else scene.remove(blueprintMesh);
        blueprintMesh = null;
    }

    // Prerequisite tech tree check!
    const structReq = getStructureTechPrerequisite(type);
    if (structReq && !hasCompletedStructure(structReq.building, structReq.altBuilding)) {
        showNotification(`Construction blocked: Requires operational ${structReq.name}!`, 'error');
        return;
    }

    const superweaponTypes = ['particleCannon', 'nukeSilo', 'scudStorm'];
    if (typeof window !== 'undefined' && window.limitSuperweapons && superweaponTypes.includes(type)) {
        const existingSw = (typeof structures !== 'undefined') && structures.some(s => s && s.health > 0 && superweaponTypes.includes(s.type));
        if (existingSw) {
            showNotification('Limit Superweapons is enabled: Maximum 1 Superweapon allowed!', 'error');
            return;
        }
    }

    const cost = getStructureCost(type);
    if (!cost || playerResources < cost) {
        if (typeof playEvaAlert === 'function') playEvaAlert('insufficient_funds');
        showNotification("Insufficient resources for construction.", "error");
        return;
    }

    activeBlueprintType = type;
    blueprintRotationY = 0;
    window.blueprintRotationY = 0;
    window._blueprintManualRotated = false;

    const footprint = getStructureFootprint(type);
    const size = { x: footprint.width, y: footprint.height, z: footprint.depth };

    const group = new THREE.Group();
    group.name = "blueprintGroup";

    let hasModelPreview = false;
    if (typeof createStructureMeshForFaction === 'function') {
        const f = (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa');
        const previewMesh = createStructureMeshForFaction(type, f);
        if (previewMesh) {
            const wireMat = new THREE.MeshBasicMaterial({
                    color: 0x00ffcc,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.55
            });
            previewMesh.traverse(child => {
                    if (child.isMesh) {
                        child.material = wireMat;
                        child.castShadow = false;
                        child.receiveShadow = false;
                    }
            });
            previewMesh.name = "blueprintModel";
            group.add(previewMesh);
            hasModelPreview = true;
        }
    }

    if (!hasModelPreview) {
        // Fallback: semi-transparent foundation footprint box & wireframe cage
        const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
        const mat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.45 });
        const boxMesh = new THREE.Mesh(geo, mat);
        boxMesh.name = "blueprintBox";
        boxMesh.position.y = size.y / 2;
        group.add(boxMesh);

        const wireGeo = new THREE.EdgesGeometry(geo);
        const wireMat = new THREE.LineBasicMaterial({ color: 0x00ffcc, linewidth: 2 });
        const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
        wireMesh.name = "blueprintWire";
        wireMesh.position.y = size.y / 2;
        group.add(wireMesh);
    }

    // Directional Front-Facing Pointer Arrow (shows building front entrance/facing orientation)
    const arrowGroup = new THREE.Group();
    arrowGroup.name = "blueprintArrow";
    arrowGroup.position.set(0, 0.15, size.z / 2 + 1.2);

    const arrowHead = new THREE.Mesh(new THREE.ConeGeometry(size.x * 0.18, 1.8, 4), new THREE.MeshBasicMaterial({ color: 0x00ffcc }));
    arrowHead.rotation.x = Math.PI / 2;
    arrowGroup.add(arrowHead);

    const arrowShaft = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.08, 0.15, 1.2), new THREE.MeshBasicMaterial({ color: 0x00ffcc }));
    arrowShaft.position.z = -0.8;
    arrowGroup.add(arrowShaft);

    group.add(arrowGroup);

    blueprintMesh = group;
    blueprintMesh.position.set(0, 0, 0);
    blueprintMesh.rotation.y = 0;
    scene.add(blueprintMesh);

    showNotification(`Place ${footprint.name || type}. Rotate with Mouse Wheel, [R], [Q], [E], or Click-and-Drag! Right-click to cancel.`, 'info');
}

function updateBlueprintPosition(intersectPoint) {
    if (!blueprintMesh) return;
    blueprintMesh.position.x = intersectPoint.x;
    blueprintMesh.position.z = intersectPoint.z;
    const groundH = getTerrainHeight(intersectPoint.x, intersectPoint.z);
    blueprintMesh.position.y = groundH;
    if (!window._blueprintManualRotated && Math.hypot(intersectPoint.x, intersectPoint.z) > 0.5) {
        blueprintRotationY = Math.atan2(-intersectPoint.x, -intersectPoint.z);
        window.blueprintRotationY = blueprintRotationY;
    }
    blueprintMesh.rotation.y = (typeof blueprintRotationY !== 'undefined') ? blueprintRotationY : 0;

    isBlueprintValid = true;
    const footprint = getStructureFootprint(activeBlueprintType);
    const rBoundary = footprint.radius;

    // 1. Water restriction: Buildings CANNOT be placed in water or on riverbeds!
    if (groundH < currentWaterLevel) {
        isBlueprintValid = false;
    }

    // Check footprint perimeter samples to ensure the entire foundation is on dry land
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        const px = intersectPoint.x + Math.cos(a) * (rBoundary * 0.85);
        const pz = intersectPoint.z + Math.sin(a) * (rBoundary * 0.85);
        if (getTerrainHeight(px, pz) < currentWaterLevel) {
            isBlueprintValid = false;
            break;
        }
    }

    // 2. Bridges restriction: Cannot place buildings on bridge decks
    if (mapBridges.some(b => isPointOnBridge(intersectPoint.x, intersectPoint.z, b))) {
        isBlueprintValid = false;
    }

    // 3. Distance to existing structures (both player and enemy/neutral)
    for (let s of structures) {
        const d = intersectPoint.distanceTo(s.position);
        if (d < (rBoundary + s.radius)) { isBlueprintValid = false; break; }
    }
    if (isBlueprintValid && typeof enemyStructures !== 'undefined') {
        for (let es of enemyStructures) {
            if (!es || es.health <= 0 || !es.position) continue;
            const d = intersectPoint.distanceTo(es.position);
            if (d < (rBoundary + (es.radius || 8))) { isBlueprintValid = false; break; }
        }
    }

    // 4. Map edge bounds
    const limit = currentMapSize * 0.44;
    if (Math.abs(intersectPoint.x) > limit || Math.abs(intersectPoint.z) > limit) isBlueprintValid = false;

    const colorHex = isBlueprintValid ? 0x00ffcc : 0xff4757;
    blueprintMesh.traverse(child => {
            if (child.material && child.material.color) {
                child.material.color.setHex(colorHex);
            }
    });
}
let aiProductionTick = 0;
