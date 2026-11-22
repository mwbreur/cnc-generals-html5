// BUILDING AND OBSTACLE COLLISION RESOLUTION
// =========================================================================
var collisionCount = 0;
window.collisionCount = 0;

// Retail SAGE CrusherLevel >= 2 vehicles that topple trees/palms/bushes on contact (ToppleUpdate.cpp)
const TREE_TOPPLE_VEHICLE_SET = new Set([
    'tank', 'crusader', 'paladin', 'battlemaster', 'overlord',
    'gatling', 'gatlingTank', 'dragon', 'inferno', 'nukecannon', 'nuketank',
    'scorpion', 'marauder', 'scud', 'dozer', 'crawler', 'tomahawk', 'toxintractor', 'quad'
]);
const topplingTrees = [];
window.topplingTrees = topplingTrees;

function triggerTreeTopple(obs, pushDirX, pushDirZ) {
    if (!obs || obs.toppled) return;
    obs.toppled = true;
    const len = Math.hypot(pushDirX, pushDirZ) || 1;
    const dirX = pushDirX / len;
    const dirZ = pushDirZ / len;
    // Axis perpendicular to push direction on XZ plane: cross((0,1,0), (dirX,0,dirZ)) = (dirZ, 0, -dirX)
    if (obs.mesh && typeof THREE !== 'undefined' && typeof THREE.Vector3 === 'function') {
        const axis = new THREE.Vector3(dirZ, 0, -dirX).normalize();
        const baseQuat = obs.mesh.quaternion && typeof obs.mesh.quaternion.clone === 'function'
            ? obs.mesh.quaternion.clone()
            : null;
        topplingTrees.push({
            mesh: obs.mesh,
            axis,
            baseQuat,
            baseY: obs.mesh.position.y,
            angle: 0,
            angularVel: 0.045,
            sinkTimer: 0,
            isBush: obs.kind === 'bush'
        });
    }
    if (typeof spawnTreadDustPuff === 'function' && obs.position) {
        spawnTreadDustPuff(obs.position, dirX, dirZ, 0x5c4a32, obs.kind === 'bush' ? 0.5 : 0.85);
    }
    if (typeof markPathfindGridDirty === 'function') markPathfindGridDirty();
}

function updateTopplingTrees(scale = 1.0) {
    if (topplingTrees.length === 0) return;
    const qStep = (typeof THREE !== 'undefined' && typeof THREE.Quaternion === 'function') ? new THREE.Quaternion() : null;
    for (let i = topplingTrees.length - 1; i >= 0; i--) {
        const t = topplingTrees[i];
        if (!t.mesh) { topplingTrees.splice(i, 1); continue; }
        if (t.angle < Math.PI * 0.48) {
            t.angularVel = Math.min(0.14, t.angularVel + 0.0045 * scale);
            t.angle = Math.min(Math.PI * 0.48, t.angle + t.angularVel * scale);
            if (qStep && t.baseQuat && t.mesh.quaternion) {
                qStep.setFromAxisAngle(t.axis, t.angle);
                t.mesh.quaternion.copy(qStep).multiply(t.baseQuat);
            } else if (t.mesh.rotation) {
                t.mesh.rotation.x = t.angle * t.axis.x;
                t.mesh.rotation.z = t.angle * t.axis.z;
            }
            if (t.isBush && t.mesh.scale) {
                const s = Math.max(0.25, 1 - (t.angle / (Math.PI * 0.48)) * 0.7);
                t.mesh.scale.y = s;
            }
        } else {
            // After lying fallen for ~2.5s, sink gently into terrain and remove
            t.sinkTimer += scale;
            if (t.sinkTimer > 150) {
                t.mesh.position.y -= 0.05 * scale;
                if (t.mesh.position.y < t.baseY - 4.5) {
                    if (t.mesh.parent) t.mesh.parent.remove(t.mesh);
                    if (typeof disposeSceneNodeSafe === 'function') disposeSceneNodeSafe(t.mesh);
                    topplingTrees.splice(i, 1);
                }
            }
        }
    }
}
window.updateTopplingTrees = updateTopplingTrees;

function resolveObstacleCollisions(unit) {
    if (unit.isAir) return; // Aircraft fly safely above ground structures and trees

    let totalPushX = 0, totalPushZ = 0;
    let colliderCount = 0;
    collisionCount = 0;

    // PERF: compute harvester dropoff once per call (was recomputed per structure, each doing structures.filter)
    const isDeliveringHarvester = (unit.type === 'truck' || unit.type === 'worker') && (unit.aiState === 'MovingToCenter' || unit.aiState === 'Depositing');
    const dropoffPos = isDeliveringHarvester ? getSupplyDropoffPosition(unit.mesh.position) : null;

    // 1. Structure Collisions (check both player and AI structures)
    const structLists = (typeof enemyStructures !== 'undefined' && enemyStructures.length > 0) ? [structures, enemyStructures] : [structures];
    for (let sList of structLists) {
        for (let s of sList) {
            if (s.health <= 0) continue;
            // Allow assigned builder to reach foundation or repair perimeter
            if (unit.targetStructure === s && (unit.taskState === 'Building' || unit.taskState === 'MovingToBuild' || unit.taskState === 'Repairing' || unit.taskState === 'MovingToRepair')) continue;

            // CRITICAL HARVESTER FIX: Allow trucks and workers delivering supplies to reach docking bays!
            if (dropoffPos && Math.hypot(s.position.x - dropoffPos.x, s.position.z - dropoffPos.z) < 1.0) continue;

            const minDist = s.radius + unit.radius;
            const dx = unit.mesh.position.x - s.position.x;
            const dz = unit.mesh.position.z - s.position.z;
            const dist2D = Math.hypot(dx, dz);

            if (dist2D < minDist && dist2D > 0.0001) {
                const push = minDist - dist2D;
                const normX = dx / dist2D;
                const normZ = dz / dist2D;
                unit.mesh.position.x += normX * push;
                unit.mesh.position.z += normZ * push;
                totalPushX += normX * push;
                totalPushZ += normZ * push;
                colliderCount++;
                collisionCount++;

                // Tangent Vector Sliding: glides smoothly around building corners without sticking!
                const toTargetX = unit.targetPosition.x - unit.mesh.position.x;
                const toTargetZ = unit.targetPosition.z - unit.mesh.position.z;
                const toTargetDist = Math.hypot(toTargetX, toTargetZ);
                if (toTargetDist > 0.05) {
                    const dirX = toTargetX / toTargetDist;
                    const dirZ = toTargetZ / toTargetDist;
                    const dotNorm = dirX * (-normX) + dirZ * (-normZ);
                    if (dotNorm > 0) {
                        // Pick best tangent pointing toward destination
                        const tan1X = -normZ, tan1Z = normX;
                        const tan2X = normZ, tan2Z = -normX;
                        const dot1 = dirX * tan1X + dirZ * tan1Z;
                        const dot2 = dirX * tan2X + dirZ * tan2Z;
                        const bestTanX = dot1 >= dot2 ? tan1X : tan2X;
                        const bestTanZ = dot1 >= dot2 ? tan1Z : tan2Z;
                        const slideSpeed = Math.min(unit.speed || 0.15, 0.22);
                        unit.mesh.position.x += bestTanX * slideSpeed;
                        unit.mesh.position.z += bestTanZ * slideSpeed;
                    }
                }
            }
        }
    }

    // Pinch Resolution: If squeezed between multiple structures, pop out into open clearance
    if (colliderCount > 1 || collisionCount > 1) {
        const pushMag = Math.hypot(totalPushX, totalPushZ);
        if (pushMag < 0.01) {
            unit.mesh.position.x += 0.85;
            unit.mesh.position.z += 0.85;
        } else {
            unit.mesh.position.x += (totalPushX / pushMag) * 0.75;
            unit.mesh.position.z += (totalPushZ / pushMag) * 0.75;
        }
    }

    // 2. Map Obstacle Collisions (Skyscrapers, Rocks, Dense Trees — tracked tanks crush & topple trees/bushes!)
    const canToppleTrees = TREE_TOPPLE_VEHICLE_SET.has(unit.type);
    for (let oi = mapObstacles.length - 1; oi >= 0; oi--) {
        const obs = mapObstacles[oi];
        if (!obs || obs.toppled) continue;
        const minDist = obs.radius + unit.radius;
        const dx = unit.mesh.position.x - obs.position.x;
        const dz = unit.mesh.position.z - obs.position.z;
        const dist2D = Math.hypot(dx, dz);

        if (dist2D < minDist && dist2D > 0.0001) {
            // Retail SAGE ToppleUpdate: tracked vehicles knock down trees/palms/bushes in travel direction without stopping
            if (obs.crushable && (canToppleTrees || obs.kind === 'bush')) {
                const fwdX = -dx;
                const fwdZ = -dz;
                triggerTreeTopple(obs, fwdX, fwdZ);
                mapObstacles.splice(oi, 1);
                continue;
            }
            if (obs.nonBlocking) continue;

            const push = minDist - dist2D;
            const normX = dx / dist2D;
            const normZ = dz / dist2D;
            unit.mesh.position.x += normX * push;
            unit.mesh.position.z += normZ * push;

            // Tangent Vector Sliding: glides smoothly around building corners without sticking!
            const toTargetX = unit.targetPosition.x - unit.mesh.position.x;
            const toTargetZ = unit.targetPosition.z - unit.mesh.position.z;
            const toTargetDist = Math.hypot(toTargetX, toTargetZ);
            if (toTargetDist > 0.05) {
                const dirX = toTargetX / toTargetDist;
                const dirZ = toTargetZ / toTargetDist;
                const dotNorm = dirX * (-normX) + dirZ * (-normZ);
                if (dotNorm > 0) {
                    // Pick best tangent pointing toward destination
                    const tan1X = -normZ, tan1Z = normX;
                    const tan2X = normZ, tan2Z = -normX;
                    const dot1 = dirX * tan1X + dirZ * tan1Z;
                    const dot2 = dirX * tan2X + dirZ * tan2Z;
                    const bestTanX = dot1 >= dot2 ? tan1X : tan2X;
                    const bestTanZ = dot1 >= dot2 ? tan1Z : tan2Z;
                    const slideSpeed = Math.min(unit.speed || 0.15, 0.22);
                    unit.mesh.position.x += bestTanX * slideSpeed;
                    unit.mesh.position.z += bestTanZ * slideSpeed;
                }
            }
        }
    }

    // 3. WATER COLLISION & BRIDGE CROSSING (Ground units cannot enter water without a bridge!)
    const onBridge = mapBridges.find(b => isPointOnBridge(unit.mesh.position.x, unit.mesh.position.z, b));
    if (onBridge) {
        // Unit is crossing safely over bridge deck
        unit.mesh.position.y = onBridge.deckY;
    } else {
        const waterLvl = currentWaterLevel;
        const groundH = getTerrainHeight(unit.mesh.position.x, unit.mesh.position.z);
        const safeMargin = 0.35;
        if (groundH < waterLvl + safeMargin) {
            // Sample terrain gradient to find uphill vector toward dry shore
            const delta = 1.8;
            const hL = getTerrainHeight(unit.mesh.position.x - delta, unit.mesh.position.z);
            const hR = getTerrainHeight(unit.mesh.position.x + delta, unit.mesh.position.z);
            const hD = getTerrainHeight(unit.mesh.position.x, unit.mesh.position.z - delta);
            const hU = getTerrainHeight(unit.mesh.position.x, unit.mesh.position.z + delta);
            let sNormX = hR - hL;
            let sNormZ = hU - hD;
            const sLen = Math.hypot(sNormX, sNormZ);
            if (sLen > 0.001) {
                sNormX /= sLen;
                sNormZ /= sLen;
            } else {
                sNormX = 0; sNormZ = 1;
            }

            // Push firmly out of water onto dry ground
            const penetration = Math.max(0.25, (waterLvl + safeMargin) - groundH);
            unit.mesh.position.x += sNormX * (penetration * 2.5);
            unit.mesh.position.z += sNormZ * (penetration * 2.5);

            // Shoreline tangent deflection: glide along water margin without getting stuck
            const toTargetX = unit.targetPosition.x - unit.mesh.position.x;
            const toTargetZ = unit.targetPosition.z - unit.mesh.position.z;
            const toTargetDist = Math.hypot(toTargetX, toTargetZ);
            if (toTargetDist > 0.05) {
                const dirX = toTargetX / toTargetDist;
                const dirZ = toTargetZ / toTargetDist;
                const tan1X = -sNormZ, tan1Z = sNormX;
                const tan2X = sNormZ, tan2Z = -sNormX;
                const dot1 = dirX * tan1X + dirZ * tan1Z;
                const dot2 = dirX * tan2X + dirZ * tan2Z;
                const bestTanX = dot1 >= dot2 ? tan1X : tan2X;
                const bestTanZ = dot1 >= dot2 ? tan1Z : tan2Z;
                const slideSpeed = Math.min(unit.speed || 0.15, 0.20);
                unit.mesh.position.x += bestTanX * slideSpeed;
                unit.mesh.position.z += bestTanZ * slideSpeed;
            }

            // Automatic bridge rerouting if target is on other side of river
            if ((!unit.waypoints || unit.waypoints.length === 0) && typeof findBridgeCrossingsForPath === 'function') {
                const bridges = findBridgeCrossingsForPath(unit.mesh.position, unit.targetPosition);
                if (bridges && bridges.length > 0) {
                    unit.waypoints = [...bridges.filter(Boolean), unit.targetPosition.clone()];
                    unit.targetPosition.copy(unit.waypoints.shift());
                }
            }
        }
    }

    // 4. Map Edge Boundaries
    const limit = currentMapSize * 0.46;
    unit.mesh.position.x = THREE.MathUtils.clamp(unit.mesh.position.x, -limit, limit);
    unit.mesh.position.z = THREE.MathUtils.clamp(unit.mesh.position.z, -limit, limit);
}

// Raycasting helper: intersects displaced terrain heightmap or fallback ground plane
function getGroundIntersectPoint() {
    if (terrainMesh) {
        const hits = raycaster.intersectObject(terrainMesh);
        if (hits.length > 0) return hits[0].point;
    }
    const p = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, p)) {
        p.y = getTerrainHeight(p.x, p.z);
        return p;
    }
    return null;
}

function createStructureMeshForFaction(type, faction = 'usa', isEnemy = false) {
    let group;
    const f = faction || 'usa';
    if (type === 'center' || type === 'commandCenter') {
        group = f === 'china' ? createChinaCommandCenter(isEnemy) : f === 'gla' ? createGLACommandCenter(isEnemy) : createUSACommandCenter(isEnemy);
    } else if (type === 'power' || type === 'nuclearReactor') {
        group = (f === 'china' || type === 'nuclearReactor') ? createChinaNuclearReactor(isEnemy) : createUSAColdFusionReactor(isEnemy);
    } else if (type === 'barracks') {
        group = f === 'china' ? createChinaBarracks(isEnemy) : f === 'gla' ? createGLABarracks(false, isEnemy) : createUSABarracks(isEnemy);
    } else if (type === 'fakeBarracks') {
        group = createGLABarracks(true, isEnemy);
    } else if (type === 'factory') {
        group = f === 'china' ? createChinaWarFactory(isEnemy) : f === 'gla' ? createGLAArmsDealer(false, isEnemy) : createUSAWarFactory(isEnemy);
    } else if (type === 'fakeArmsDealer') {
        group = createGLAArmsDealer(true, isEnemy);
    } else if (type === 'supplyCenter') {
        group = f === 'china' ? createChinaSupplyCenter(isEnemy) : createUSASupplyCenter(isEnemy);
    } else if (type === 'supplyStash') {
        group = createGLASupplyStash(isEnemy);
    } else if (type === 'supplyDrop') {
        group = createUSASupplyDropZone(isEnemy);
    } else if (type === 'airfield') {
        group = f === 'china' ? createChinaAirfield(isEnemy) : createUSAAirfield(isEnemy);
    } else if (type === 'strategyCenter') {
        group = createUSAStrategyCenter(isEnemy);
    } else if (type === 'detentionCamp') {
        group = createUSADetentionCamp(isEnemy);
    } else if (type === 'patriot') {
        group = createUSAPatriotSystem(isEnemy);
    } else if (type === 'particleCannon') {
        group = createUSAParticleCannon(isEnemy);
    } else if (type === 'bunker') {
        group = createChinaBunker(isEnemy);
    } else if (type === 'gatlingCannon') {
        group = createChinaGatlingCannon(isEnemy);
    } else if (type === 'speakerTower') {
        group = createChinaSpeakerTower(isEnemy);
    } else if (type === 'propagandaCenter') {
        group = createChinaPropagandaCenter(isEnemy);
    } else if (type === 'internetCenter') {
        group = createChinaInternetCenter(isEnemy);
    } else if (type === 'nukeSilo') {
        group = createChinaNukeSilo(isEnemy);
    } else if (type === 'tunnel') {
        group = createGLATunnelNetwork(isEnemy);
    } else if (type === 'stingerSite') {
        group = createGLAStingerSite(isEnemy);
    } else if (type === 'demoTrap') {
        group = createGLADemoTrap(isEnemy);
    } else if (type === 'blackMarket') {
        group = createGLABlackMarket(isEnemy);
    } else if (type === 'palace') {
        group = createGLAPalace(isEnemy);
    } else if (type === 'scudStorm') {
        group = createGLAScudStorm(isEnemy);
    } else {
        group = f === 'china' ? createChinaCommandCenter(isEnemy) : f === 'gla' ? createGLACommandCenter(isEnemy) : createUSACommandCenter(isEnemy);
    }
    return group;
}
window.createStructureMeshForFaction = createStructureMeshForFaction;

// Official INIZH.big Structure MaxHealth values
const STRUCTURE_MAX_HEALTH_TABLE = {
    center: 5000, commandCenter: 5000, fakeCommandCenter: 1250,
    particleCannon: 4000, nukeSilo: 4000, scudStorm: 4000,
    palace: 3000,
    internetCenter: 2500,
    factory: 2000, supplyCenter: 2000, supplyStash: 2000, derrick: 2000, hospital: 2000,
    airfield: 1500, strategyCenter: 1500, nuclearReactor: 1500,
    barracks: 1000, propagandaCenter: 1000, supplyDrop: 1000, blackMarket: 1000,
    bunker: 1000, patriot: 1000, gatlingCannon: 1000, stingerSite: 1000, tunnel: 1000,
    power: 800, speakerTower: 300, demoTrap: 100
};
function getStructureMaxHealth(type) {
    return STRUCTURE_MAX_HEALTH_TABLE[type] || 1200;
}
window.getStructureMaxHealth = getStructureMaxHealth;

function buildStructureMesh(type, pos, instant = false, rotationY = 0) {
    const f = (selectedFaction || 'usa').toLowerCase();
    if (typeof isBuildingAvailableForFaction === 'function' && !isBuildingAvailableForFaction(type, f)) {
        console.warn(`Blocked ${type} construction for ${f}: structure is not in that faction's build list.`);
        return null;
    }
    const group = createStructureMeshForFaction(type, f);
    if (!group) return null;
    if (!group.userData || !group.userData.isW3D) {
        group.scale.set(1.35, 1.35, 1.35);
    }
    const footprint = getStructureFootprint(type);
    const radius = footprint.radius || 4.0;

    // Sample terrain height across foundation footprint to set optimal deck level
    const hCenter = (typeof getTerrainHeight === 'function') ? getTerrainHeight(pos.x, pos.z) : pos.y;
    const hN = (typeof getTerrainHeight === 'function') ? getTerrainHeight(pos.x, pos.z - radius * 0.7) : pos.y;
    const hS = (typeof getTerrainHeight === 'function') ? getTerrainHeight(pos.x, pos.z + radius * 0.7) : pos.y;
    const hE = (typeof getTerrainHeight === 'function') ? getTerrainHeight(pos.x + radius * 0.7, pos.z) : pos.y;
    const hW = (typeof getTerrainHeight === 'function') ? getTerrainHeight(pos.x - radius * 0.7, pos.z) : pos.y;
    const deckY = (hCenter * 2 + hN + hS + hE + hW) / 6 + 0.05;

    pos.y = deckY;
    group.position.copy(pos);
    group.rotation.y = rotationY || 0;

    // Level terrain heightmap under building footprint
    if (typeof registerFlattenedFootprint === 'function') {
        registerFlattenedFootprint(pos.x, pos.z, radius * 1.15, deckY);
    }


    const structMaxHp = getStructureMaxHealth(type);
    const isInitialMpCC = Boolean(isMultiplayerActive && instant && (type === 'center' || type === 'commandCenter') && !structures.some(s => (s.type === 'center' || s.type === 'commandCenter') && s.health > 0));
    const mpHumanTotal = (isMultiplayerActive && typeof mpSlots !== 'undefined' && Array.isArray(mpSlots)) ? mpSlots.filter(s => s && s.active && s.isHuman).length : 2;
    const mpStructPrefix = (typeof myMpSlotId === 'number' && myMpSlotId > 2) ? ('P' + myMpSlotId + 'S_') : (isMultiplayerHost ? 'HS_' : 'CS_');
    const structNetId = isInitialMpCC
        ? (mpHumanTotal > 2 && typeof myMpSlotId === 'number' ? ('P' + myMpSlotId + '_CC') : ((isMultiplayerHost ? 'HS_' : 'CS_') + 'CC'))
        : ((isMultiplayerActive ? mpStructPrefix : 'PS_') + (++netIdSequence));
    const structObj = {
        type: type, mesh: group, position: pos.clone(),
        rotationY: rotationY || 0,
        radius: getStructureFootprint(type).radius,
        isBuilding: !instant, buildProgress: instant ? 100 : 0, dozerRef: null,
        health: structMaxHp, maxHealth: structMaxHp,
        netId: structNetId,
        teamId: (typeof playerTeamId !== 'undefined' ? playerTeamId : 1),
        ownerId: 'player',
        isAI: false,
        faction: f,
        spawnedHarvester: false
    };

    if (instant && (type === 'supplyCenter' || type === 'supplyStash')) {
        structObj.spawnedHarvester = true;
        setTimeout(() => {
                if (structObj.health <= 0 || !structures.includes(structObj)) return;
                if (typeof spawnUnit === 'function') {
                    const hType = (type === 'supplyStash') ? 'worker' : (f === 'usa' ? 'chinook' : 'truck');
                    const spawnPos = pos.clone().add(new THREE.Vector3(0, hType === 'chinook' ? 4.5 : 0, 7.5));
                    if (hType !== 'chinook') spawnPos.y = (typeof getTerrainHeight === 'function') ? getTerrainHeight(spawnPos.x, spawnPos.z) : spawnPos.y;
                    const hUnit = spawnUnit(hType, spawnPos);
                    if (hUnit) {
                        hUnit.teamId = structObj.teamId;
                        hUnit.ownerId = structObj.ownerId;
                        hUnit.isAI = structObj.isAI;
                        hUnit.aiState = 'MovingToDock';
                        hUnit.taskState = 'Idle';
                        if (hType === 'chinook') hUnit.airState = 'hovering';
                        hUnit.supplyTarget = (typeof findNearestSupplyPoint === 'function') ? findNearestSupplyPoint(hUnit.mesh.position) : null;
                        if (hUnit.supplyTarget) {
                            hUnit.targetPosition.copy(hUnit.supplyTarget.position);
                            if (hType === 'chinook') hUnit.airState = 'flying';
                        }
                    }
                }
            }, 100);
    }

    if (isMultiplayerActive && netConn && netConn.open && !isInitialMpCC) {
        broadcastNetPacket({
                type: 'build_structure',
                structType: type,
                position: { x: pos.x, y: pos.y, z: pos.z, rotationY: rotationY || 0 },
                netId: structNetId,
                teamId: (typeof playerTeamId !== 'undefined' ? playerTeamId : 1),
                faction: selectedFaction
        });
    }

    if (!instant) {
        if (!window._sharedConstructionWireMat) {
            window._sharedConstructionWireMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, wireframe: true, transparent: true, opacity: 0.45 });
            window._sharedConstructionWireMat.userData = { _shared: true };
        }
        group.traverse(child => {
                if (child.isMesh) {
                    child.savedMaterial = child.material;
                    child.material = window._sharedConstructionWireMat;
                }
        });
    }

    scene.add(group);
    structures.push(structObj);
    if (typeof clearFoundationFootprint === 'function') clearFoundationFootprint(structObj);
    if (typeof markPathfindGridDirty === 'function') markPathfindGridDirty();
    return structObj;
}

function spawnEnemyUnit(type = 'tank', position = new THREE.Vector3(25, 0, -25), netId = null, faction = null) {
    let mesh; let radius = 1.2; let speed = 0.14; let health = 450; let scanRange = 22; let isAir = false;

    // USA Forces (100% parity with spawnUnit & official INIZH.big MaxHealth / AttackRange values)
    if (type === 'tank' || type === 'crusader') { mesh = createCrusaderTankMesh(true); radius = 3.6; speed = 0.15; health = 480; scanRange = 24; }
    else if (type === 'paladin') { mesh = createPaladinTankMesh(true); radius = 3.6; speed = 0.14; health = 500; scanRange = 24; }
    else if (type === 'humvee') { mesh = createHumveeMesh(true); radius = 2.8; speed = 0.22; health = 240; scanRange = 24; }
    else if (type === 'ambulance') { mesh = createAmbulanceMesh(true); radius = 2.8; speed = 0.18; health = 240; scanRange = 16; }
    else if (type === 'tomahawk') { mesh = createTomahawkMesh(true); radius = 3.2; speed = 0.11; health = 180; scanRange = 56; }
    else if (type === 'dozer') { mesh = (faction === 'china' || (typeof enemyFaction !== 'undefined' && enemyFaction === 'china')) ? createChinaDozerMesh(true) : createUSADozerMesh(true); radius = 1.9; speed = 0.10; health = 250; scanRange = 18; }
    else if (type === 'truck') { mesh = createUSATruckMesh(true); radius = 3.2; speed = 0.13; health = 300; scanRange = 16; }
    else if (type === 'chinook') { mesh = createChinookMesh(true); radius = 4.8; speed = 0.38; health = 300; scanRange = 0; isAir = true; }
    else if (type === 'comanche') { mesh = createComancheMesh(true); radius = 3.8; speed = 0.35; health = 220; scanRange = 32; isAir = true; }
    else if (type === 'mig') { mesh = createMigMesh(true); radius = 4.2; speed = 0.46; health = 160; scanRange = 51; isAir = true; }
    else if (type === 'raptor') { mesh = createRaptorMesh(true); radius = 4.2; speed = 0.50; health = 160; scanRange = 51; isAir = true; }
    else if (type === 'stealthfighter') { mesh = createStealthFighterMesh(true); radius = 4.0; speed = 0.50; health = 120; scanRange = 36; isAir = true; }
    else if (type === 'aurora') { mesh = createAuroraMesh(true); radius = 4.2; speed = 0.54; health = 80; scanRange = 48; isAir = true; }
    else if (type === 'infantry' || type === 'ranger') { mesh = createRangerMesh(); radius = 0.8; speed = 0.08; health = 180; scanRange = 22; }
    else if (type === 'rocket' || type === 'missiledefender') { mesh = createMissileDefenderMesh(); radius = 0.8; speed = 0.08; health = 100; scanRange = 38; }
    else if (type === 'pathfinder') { mesh = createPathfinderMesh(true); radius = 0.8; speed = 0.095; health = 120; scanRange = 65; }
    else if (type === 'burton') { mesh = createBurtonMesh(); radius = 0.9; speed = 0.10; health = 200; scanRange = 27; }

    // China Forces (100% parity with spawnUnit & official INIZH.big)
    else if (type === 'battlemaster') { mesh = createBattlemasterTankMesh(true); radius = 3.4; speed = 0.15; health = 400; scanRange = 24; }
    else if (type === 'overlord') { mesh = createOverlordTankMesh(true); radius = 4.6; speed = 0.09; health = 1100; scanRange = 28; }
    else if (type === 'gatling') { mesh = createGatlingTankMesh(true); radius = 3.2; speed = 0.16; health = 300; scanRange = 24; }
    else if (type === 'dragon') { mesh = createDragonTankMesh(true); radius = 3.2; speed = 0.15; health = 280; scanRange = 12; }
    else if (type === 'crawler') { mesh = createTroopCrawlerMesh(true); radius = 3.6; speed = 0.15; health = 240; scanRange = 28; }
    else if (type === 'inferno') { mesh = createInfernoCannonMesh(true); radius = 3.2; speed = 0.10; health = 120; scanRange = 64.8; }
    else if (type === 'nukecannon' || type === 'nuketank') { mesh = createNukeCannonMesh(true); radius = 2.6; speed = 0.08; health = 240; scanRange = 56; }
    else if (type === 'redguard') { mesh = createRedGuardMesh(); radius = 0.8; speed = 0.085; health = 120; scanRange = 22; }
    else if (type === 'tankhunter') { mesh = createTankHunterMesh(); radius = 0.8; speed = 0.08; health = 100; scanRange = 38; }
    else if (type === 'hacker') { mesh = createHackerMesh(); radius = 0.8; speed = 0.08; health = 100; scanRange = 14; }
    else if (type === 'blacklotus') { mesh = createBlackLotusMesh(); radius = 0.8; speed = 0.10; health = 200; scanRange = 24; }

    // GLA Forces (100% parity with spawnUnit & official INIZH.big)
    else if (type === 'worker') { mesh = createGLAWorkerMesh(); radius = 0.8; speed = 0.085; health = 100; scanRange = 16; }
    else if (type === 'technical') { mesh = createTechnicalMesh(true); radius = 2.6; speed = 0.22; health = 240; scanRange = 24; }
    else if (type === 'scorpion') { mesh = createScorpionTankMesh(true); radius = 3.2; speed = 0.16; health = 370; scanRange = 24; }
    else if (type === 'marauder') { mesh = createMarauderTankMesh(true); radius = 3.4; speed = 0.15; health = 500; scanRange = 27; }
    else if (type === 'buggy') { mesh = createRocketBuggyMesh(true); radius = 2.6; speed = 0.24; health = 120; scanRange = 48; }
    else if (type === 'quad') { mesh = createQuadCannonMesh(true); radius = 3.2; speed = 0.17; health = 300; scanRange = 24; }
    else if (type === 'toxintractor') { mesh = createToxinTractorMesh(true); radius = 3.2; speed = 0.14; health = 240; scanRange = 16; }
    else if (type === 'bombtruck') { mesh = createBombTruckMesh(true); radius = 3.0; speed = 0.18; health = 220; scanRange = 14; }
    else if (type === 'scud') { mesh = createScudLauncherMesh(true); radius = 3.8; speed = 0.10; health = 180; scanRange = 56; }
    else if (type === 'radarvan') { mesh = createRadarVanMesh(true); radius = 3.0; speed = 0.16; health = 200; scanRange = 20; }
    else if (type === 'battlebus') {
        mesh = (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['battlebus'])
            ? createW3DVehicleMesh('battlebus', true)
            : createTechnicalMesh(true);
        radius = 3.4; speed = 0.20; health = 400; scanRange = 24;
    }
    else if (type === 'rebel') { mesh = createRebelMesh(); radius = 0.8; speed = 0.08; health = 120; scanRange = 22; }
    else if (type === 'rpg') { mesh = createRPGTrooperMesh(); radius = 0.8; speed = 0.08; health = 100; scanRange = 38; }
    else if (type === 'terrorist') { mesh = createTerroristMesh(); radius = 0.8; speed = 0.085; health = 120; scanRange = 8; }
    else if (type === 'mob') { mesh = createAngryMobMesh(); radius = 1.4; speed = 0.072; health = 280; scanRange = 26; }
    else if (type === 'hijacker') { mesh = createHijackerMesh(); radius = 0.8; speed = 0.095; health = 100; scanRange = 16; }
    else if (type === 'jarmen') { mesh = createJarmenKellMesh(); radius = 0.8; speed = 0.095; health = 200; scanRange = 49; }
    else {
        mesh = createBattlemasterTankMesh(true);
    }

    if (!mesh.userData || !mesh.userData.isW3D) {
        if (typeof isInfantryType === 'function' && isInfantryType(type)) {
            mesh.scale.set(0.52, 0.52, 0.52);
        } else {
            mesh.scale.set(1.35, 1.35, 1.35);
        }
        // Ensure procedural enemy vehicles/aircraft never render in friendly faction materials
        if (typeof matEnemyHull !== 'undefined' && matEnemyHull && typeof mesh.traverse === 'function') {
            mesh.traverse(c => {
                if (!c || !c.isMesh || !c.material) return;
                if (c.material === matUSA || c.material === matChina || c.material === matGLA ||
                    c.material === matUSAColor || c.material === matChinaColor || c.material === matGLAColor) {
                    c.material = matEnemyHull;
                }
            });
        }
    }
    if (typeof isInfantryType !== 'function' || !isInfantryType(type)) {
        radius *= 1.35;
        scanRange *= 1.35;
        speed *= 1.15;
    }
    mesh.position.copy(position);

    if (isAir) {
        const cruiseAlt = (mesh.userData && mesh.userData.flightAltitude) ? mesh.userData.flightAltitude : 8.5;
        const groundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(position.x, position.z) : 0;
        mesh.position.y = groundY + cruiseAlt;
    }
    scene.add(mesh);

    const enemyNetId = netId || ((isMultiplayerActive ? (isMultiplayerHost ? 'C_' : 'H_') : 'E_') + (++netIdSequence));
    const isGatherer = (type === 'truck' || type === 'worker' || type === 'chinook');
    const isBuilder = (type === 'dozer' || type === 'worker');
    const isTransport = (type === 'humvee' || type === 'chinook' || type === 'crawler' || type === 'battlebus' || type === 'technical' || type === 'ambulance');
    const isNaturalStealth = ['pathfinder', 'stealthfighter', 'burton', 'jarmen', 'blacklotus', 'hijacker', 'drone_scout'].includes(type);
    let cap = 0;
    if (isTransport) {
        if (type === 'crawler' || type === 'battlebus' || type === 'chinook') cap = 8;
        else if (type === 'ambulance') cap = 4;
        else cap = 5;
    }
    const visionRange = (typeof getUnitCombatVisionRange === 'function') ? getUnitCombatVisionRange(type, scanRange) : (scanRange || 24);
    const enemyObj = {
        type: type, mesh: mesh, selected: false, targetPosition: mesh.position.clone(),
        speed: speed, radius: radius, health: health, maxHealth: health,
        scanRange: scanRange, _baseScanRange: scanRange, visionRange: visionRange, attackCooldown: 0, combatTarget: null,
        kills: 0, veterancy: 0,
        isStealthed: isNaturalStealth,
        detectsStealth: (type === 'crawler' || type === 'dozer' || type === 'worker' || type === 'pathfinder' || type === 'blacklotus' || type === 'burton' || type === 'jarmen'),
        capacity: cap,
        garrisoned: [],
        netId: enemyNetId,
        teamId: 2,
        ownerId: 'ai_1',
        faction: faction || (typeof enemyFaction !== 'undefined' ? enemyFaction : 'china'),
        isAI: true,
        isAir: isAir,
        airState: isAir ? (type === 'comanche' || type === 'chinook' ? 'hovering' : 'circling') : 'none',
        aiState: isGatherer ? (type === 'worker' ? 'Idle' : 'MovingToDock') : 'Idle',
        taskState: 'Idle',
        cargoLoaded: 0, timerState: 0, supplyTarget: null,
        patrolCenter: mesh.position.clone()
    };
    if (isGatherer && type !== 'worker') {
        const sTarget = (typeof findNearestSupplyPoint === 'function') ? findNearestSupplyPoint(mesh.position) : null;
        if (sTarget) {
            enemyObj.supplyTarget = sTarget;
            enemyObj.targetPosition.copy(sTarget.position);
            if (type === 'chinook') enemyObj.airState = 'flying';
        }
    }
    enemyUnits.push(enemyObj);
    if (type === 'crawler') {
        for (let rg = 0; rg < 4; rg++) {
            const passenger = spawnEnemyUnit('redguard', position.clone(), null, faction || 'china');
            if (passenger) {
                passenger.mesh.visible = false;
                passenger.garrisonedIn = enemyObj;
                enemyObj.garrisoned.push(passenger);
            }
        }
    }
    return enemyObj;
}

function createImpactExplosion(position) {
    spawnExplosion(position, 0xff793f);
}

// =========================================================================

