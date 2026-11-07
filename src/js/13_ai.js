
        let isPlacingBlueprint = false;
        let blueprintPlacementPos = null;
        let rightDragStart = null;
        let lastRightPointerPos = { x: 0, y: 0 };

// =========================================================================
// ADVANCED AI COMMANDER ENGINE: FOG OF WAR, RECON SCOUTS, TEAM INTELLIGENCE
// =========================================================================
let aiCommanders = {};
window.aiCommanders = aiCommanders;

function initAICommanders() {
    aiCommanders = {};
    window.aiCommanders = aiCommanders;
    const mapSize = (typeof currentMapSize !== 'undefined' ? currentMapSize : 800);
    const env = (typeof activeTheme !== 'undefined' ? activeTheme : 'desert');
    const allSpawns = (typeof getSpawnPointsForMap === 'function') ? getSpawnPointsForMap(mapSize, env, null) : [];
    const activeAISlots = (typeof spSlots !== 'undefined' ? spSlots : []).filter(s => s.active && !s.isPlayer);

    if (activeAISlots.length === 0) {
        // Collect unique ownerIds from enemyStructures
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
        // Shuffle waypoints so each AI scout takes a unique reconnaissance path
        for (let i = candidateWaypoints.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = candidateWaypoints[i]; candidateWaypoints[i] = candidateWaypoints[j]; candidateWaypoints[j] = tmp;
        }

        aiCommanders[ownerId] = {
            ownerId: ownerId,
            teamId: teamId,
            faction: faction,
            difficulty: difficulty,
            basePos: basePos.clone(),
            rallyPoint: basePos.clone().add(new THREE.Vector3(14, 0, 14)),
            
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

    const mapSize = (typeof currentMapSize !== 'undefined' ? currentMapSize : 800);
    const allUnits = [...units, ...enemyUnits];
    const allStructures = [...structures, ...enemyStructures];

    // Evaluate each AI Commander independently
    Object.values(aiCommanders).forEach(cmd => {
        const myUnits = enemyUnits.filter(e => e.ownerId === cmd.ownerId && e.health > 0);
        const myStructures = enemyStructures.filter(s => s.ownerId === cmd.ownerId && s.health > 0);

        if (myStructures.length === 0 && myUnits.length === 0) return; // Commander eliminated

        // --- 1. AI Production Engine (From Commander's Own Facilities) ---
        cmd.productionTimer++;
        const prodInterval = cmd.difficulty === 'hard' ? 8 : cmd.difficulty === 'easy' ? 24 : 14;
        const maxUnits = cmd.difficulty === 'hard' ? 20 : cmd.difficulty === 'easy' ? 8 : 12;

        if (cmd.productionTimer % prodInterval === 0 && myUnits.length < maxUnits) {
            const fac = myStructures.find(es => es.type === 'factory' && es.health > 0) ||
                        myStructures.find(es => es.type === 'barracks' && es.health > 0);
            if (fac) {
                const spawnPos = fac.position.clone().add(new THREE.Vector3(10 + Math.random() * 4, 0, 8 + Math.random() * 4));
                spawnPos.y = typeof getTerrainHeight === 'function' ? getTerrainHeight(spawnPos.x, spawnPos.z) : 0;
                let uType = 'tank';
                if (fac.faction === 'china') {
                    uType = (cmd.difficulty === 'hard' && Math.random() < 0.45) ? 'overlord' : (Math.random() < 0.35 ? 'gatling' : 'battlemaster');
                } else if (fac.faction === 'gla') {
                    uType = (cmd.difficulty === 'hard' && Math.random() < 0.45) ? 'marauder' : (Math.random() < 0.4 ? 'buggy' : 'scorpion');
                } else {
                    uType = (cmd.difficulty === 'hard' && Math.random() < 0.45) ? 'paladin' : (Math.random() < 0.35 ? 'humvee' : 'tank');
                }
                const eu = spawnEnemyUnit(uType, spawnPos);
                if (eu) {
                    eu.teamId = cmd.teamId;
                    eu.ownerId = cmd.ownerId;
                    eu.isAI = true;
                    eu.difficulty = cmd.difficulty;
                }
            }
        }

        // --- 2. Reconnaissance & Scout Allocation ---
        // Clean up dead scouts
        for (let sId of cmd.scoutNetIds) {
            if (!myUnits.some(u => u.netId === sId)) cmd.scoutNetIds.delete(sId);
        }

        // Designate up to 2 active scout units
        if (cmd.scoutNetIds.size < (cmd.difficulty === 'easy' ? 1 : 2) && myUnits.length > 0) {
            const candidateScout = myUnits.find(u => !u.combatTarget && !cmd.scoutNetIds.has(u.netId));
            if (candidateScout) {
                candidateScout.isScout = true;
                cmd.scoutNetIds.add(candidateScout.netId);
            }
        }

        // Direct scouts to explore candidate quadrants
        cmd.scoutNetIds.forEach(scoutNetId => {
            const scout = myUnits.find(u => u.netId === scoutNetId);
            if (!scout) return;

            const distToGoal = scout.mesh.position.distanceTo(scout.targetPosition);
            if (distToGoal < 16.0 || scout.targetPosition.distanceTo(cmd.basePos) < 2.0) {
                if (cmd.unexploredWaypoints.length > 0) {
                    const nextWp = cmd.unexploredWaypoints.shift();
                    scout.targetPosition.copy(nextWp);
                } else {
                    // All initial quadrant spawns explored! Patrol perimeter or random map quadrants
                    const half = mapSize * 0.35;
                    const rx = (Math.random() * 2 - 1) * half;
                    const rz = (Math.random() * 2 - 1) * half;
                    scout.targetPosition.set(rx, typeof getTerrainHeight === 'function' ? getTerrainHeight(rx, rz) : 0, rz);
                }
            }
        });

        // --- 3. Line-of-Sight & Recon Detection Pass (NO OMNISCIENCE!) ---
        // Senses enemy assets ONLY when within visual range of commander's units or base
        const hostileUnits = allUnits.filter(u => u.health > 0 && !isFriendly(cmd, u));
        const hostileStructures = allStructures.filter(s => s.health > 0 && !isFriendly(cmd, s));

        myUnits.forEach(u => {
            const sightRange = (u.isScout ? 36 : 28);
            
            // Sighting hostile structures
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

            // Sighting hostile units
            hostileUnits.forEach(hu => {
                if (hu.mesh && u.mesh.position.distanceTo(hu.mesh.position) <= sightRange) {
                    shareTeamDiscovery(cmd.teamId, hu, false);
                }
            });
        });

        // --- 4. Tactical AI Order Pass (Based strictly on discovered intel!) ---
        // Clean up eradicated targets
        cmd.discoveredEnemyTargets = cmd.discoveredEnemyTargets.filter(t => {
            const aliveUnit = hostileUnits.find(hu => hu.netId === t.netId);
            const aliveStruct = hostileStructures.find(hs => hs.netId === t.netId);
            return (aliveUnit && aliveUnit.health > 0) || (aliveStruct && aliveStruct.health > 0);
        });

        cmd.discoveredEnemyBases = cmd.discoveredEnemyBases.filter(b => {
            return hostileStructures.some(hs => (hs.position || hs.mesh.position).distanceTo(b.position) < 35);
        });

        // AI Attack Grace Period check based on chosen difficulty:
        // Easy AI: 5 minutes (300s)
        // Medium AI: 3 minutes (180s)
        // Hard AI: 2 minutes (120s)
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

        myUnits.forEach(enemy => {
            if (enemy.isScout && !enemy.combatTarget) return; // Scouts focus on reconnaissance traversal

            // If unit is already engaged in active combat with valid hostile target:
            if (enemy.combatTarget && enemy.combatTarget.health > 0 && !isFriendly(enemy, enemy.combatTarget)) {
                const targetPos = enemy.combatTarget.position || enemy.combatTarget.mesh.position;
                // During grace period, disengage if target retreats far beyond AI base perimeter
                if (!canLaunchOffensive && targetPos && enemy.mesh.position.distanceTo(cmd.basePos) > 40) {
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

            // A. If offensive NOT yet permitted OR no enemy assets discovered yet: Hold defensive base perimeter!
            if (!canLaunchOffensive || (cmd.discoveredEnemyBases.length === 0 && cmd.discoveredEnemyTargets.length === 0)) {
                // Defend base perimeter from close intruders
                let localIntruder = null;
                let minDist = 35; // Base defense perimeter radius
                hostileUnits.forEach(hu => {
                    if (hu.mesh) {
                        const d = enemy.mesh.position.distanceTo(hu.mesh.position);
                        if (d < minDist) { minDist = d; localIntruder = hu; }
                    }
                });
                if (localIntruder) {
                    enemy.combatTarget = localIntruder;
                    enemy.targetPosition.copy(localIntruder.mesh.position);
                } else {
                    // Station at defensive rally zone around own Command Center
                    if (enemy.mesh.position.distanceTo(cmd.basePos) > 32) {
                        enemy.targetPosition.copy(cmd.rallyPoint);
                    }
                }
                return;
            }

            // B. Attack Grace Expired AND Enemies HAVE been discovered! Launch attack waves on known coordinates!
            let closestKnown = null;
            let minDistance = Infinity;

            // Target known discovered hostile units
            cmd.discoveredEnemyTargets.forEach(dt => {
                const liveObj = hostileUnits.find(hu => hu.netId === dt.netId) || hostileStructures.find(hs => hs.netId === dt.netId);
                if (liveObj && liveObj.health > 0) {
                    const objPos = liveObj.position || liveObj.mesh.position;
                    const d = enemy.mesh.position.distanceTo(objPos);
                    if (d < minDistance) {
                        minDistance = d;
                        closestKnown = liveObj;
                    }
                }
            });

            // Target known enemy bases
            if (!closestKnown && cmd.discoveredEnemyBases.length > 0) {
                const targetBase = cmd.discoveredEnemyBases[0];
                const d = enemy.mesh.position.distanceTo(targetBase.position);
                if (d > enemy.scanRange) {
                    enemy.targetPosition.copy(targetBase.position);
                }
                return;
            }

            if (closestKnown) {
                enemy.combatTarget = closestKnown;
                const targetPos = closestKnown.position || closestKnown.mesh.position;
                if (minDistance > enemy.scanRange) {
                    const approachDir = new THREE.Vector3().subVectors(targetPos, enemy.mesh.position).normalize();
                    enemy.targetPosition.copy(targetPos).addScaledVector(approachDir, -(enemy.scanRange - 3));
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
                scene.remove(blueprintMesh);
                blueprintMesh = null;
                activeBlueprintType = null;

                const freeDozer = units.find(u => (u.type === 'dozer' || u.type === 'worker') && u.taskState === 'Idle');
                if (freeDozer) {
                    freeDozer.taskState = 'MovingToBuild';
                    freeDozer.targetStructure = newStruct;
                    newStruct.dozerRef = freeDozer;
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
            cameraRadius = Math.max(35, Math.min(360, cameraRadius)); updateCameraPosition();
        }

        // River Crossing Bridge Waypoint Finder: detects if straight path hits water and routes via bridge
        function findBridgeCrossingsForPath(startPos, endPos) {
            if (mapBridges.length === 0) return null;
            let crossesWater = false;
            for (let t = 0.15; t <= 0.85; t += 0.1) {
                const px = startPos.x + (endPos.x - startPos.x) * t;
                const pz = startPos.z + (endPos.z - startPos.z) * t;
                if (getTerrainHeight(px, pz) < currentWaterLevel && !mapBridges.some(b => isPointOnBridge(px, pz, b))) {
                    crossesWater = true;
                    break;
                }
            }
            if (!crossesWater) return null; // Path is over dry land, direct movement fine!

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
            if (!bestBridge) return null;

            // Compute bridge entry and exit ramps along its longitudinal axis
            const fwdX = Math.sin(bestBridge.rotationY);
            const fwdZ = Math.cos(bestBridge.rotationY);
            const halfLen = bestBridge.length * 0.5 + 2.5;

            const ramp1 = new THREE.Vector3(bestBridge.position.x - fwdX * halfLen, bestBridge.deckY, bestBridge.position.z - fwdZ * halfLen);
            const ramp2 = new THREE.Vector3(bestBridge.position.x + fwdX * halfLen, bestBridge.deckY, bestBridge.position.z + fwdZ * halfLen);

            const d1 = startPos.distanceTo(ramp1);
            const d2 = startPos.distanceTo(ramp2);

            const entryRamp = d1 <= d2 ? ramp1 : ramp2;
            const exitRamp = d1 <= d2 ? ramp2 : ramp1;

            return [entryRamp, exitRamp];
        }

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

            if (units.some(u => u.selected)) playUSASound('acknowledge');
            // Ignore if clicking inside UI elements
            if (e.target && (e.target.closest('#generals-command-bar') || e.target.closest('#top-hud-bar') || e.target.closest('#cnc-sidebar') || e.target.closest('#hud') || e.target.closest('#start-menu'))) {
                return;
            }

            mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);

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

            // If a supply point was targeted and any harvester (truck or worker) is selected:
            const selectedHarvesters = units.filter(u => u.selected && (u.type === 'truck' || u.type === 'worker'));
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
                    if (bridges) {
                        unit.waypoints = [bridges[0], bridges[1], groundHit.clone()];
                        unit.targetPosition.copy(unit.waypoints.shift());
                    } else {
                        unit.waypoints = [];
                        unit.targetPosition.copy(groundHit);
                    }
                    unit.combatTarget = null;
                    unit.taskState = unit.isAir ? 'Moving' : 'Idle';
                    if (unit.isAir) {
                        unit.airState = (unit.airState === 'landed') ? 'taking_off' : 'flying';
                        unit.patrolCenter.copy(groundHit);
                    }
                    if (unit.targetStructure && unit.targetStructure.dozerRef === unit) {
                        unit.targetStructure.dozerRef = null; unit.targetStructure = null;
                    }
                    if (unit.type === 'truck' || unit.type === 'worker') {
                        unit.aiState = 'Idle';
                    }
                } else if (selectedList.length > 1) {
                    // FORMATION MOVEMENT: Organize multiple units into disciplined rank-and-file lines!
                    // 1. Calculate squad center
                    let sumX = 0, sumZ = 0;
                    selectedList.forEach(u => {
                        sumX += u.mesh.position.x;
                        sumZ += u.mesh.position.z;
                    });
                    const squadCenterX = sumX / selectedList.length;
                    const squadCenterZ = sumZ / selectedList.length;

                    // 2. Vector from squad center to target
                    const moveDx = groundHit.x - squadCenterX;
                    const moveDz = groundHit.z - squadCenterZ;
                    const moveDist = Math.hypot(moveDx, moveDz);

                    let fwdX = 0, fwdZ = 1;
                    if (moveDist > 0.001) {
                        fwdX = moveDx / moveDist;
                        fwdZ = moveDz / moveDist;
                    }
                    const rightX = -fwdZ;
                    const rightZ = fwdX;

                    // 3. Sort units laterally along squad right vector to maintain relative position & prevent path crossing
                    selectedList.sort((a, b) => {
                        const projA = (a.mesh.position.x - squadCenterX) * rightX + (a.mesh.position.z - squadCenterZ) * rightZ;
                        const projB = (b.mesh.position.x - squadCenterX) * rightX + (b.mesh.position.z - squadCenterZ) * rightZ;
                        return projA - projB;
                    });

                    // 4. Arrange in disciplined lines
                    const count = selectedList.length;
                    const cols = count <= 5 ? count : Math.min(6, Math.ceil(Math.sqrt(count) * 1.5));
                    const spacingX = 4.4; // Lateral spacing between units in rank
                    const spacingZ = 4.8; // Depth spacing between ranks

                    selectedList.forEach((unit, idx) => {
                        const row = Math.floor(idx / cols);
                        const col = idx % cols;
                        const unitsInThisRow = Math.min(cols, count - row * cols);
                        const colOffset = (col - (unitsInThisRow - 1) / 2) * spacingX;
                        const rowOffset = -row * spacingZ;

                        let destX = groundHit.x + rightX * colOffset + fwdX * rowOffset;
                        let destZ = groundHit.z + rightZ * colOffset + fwdZ * rowOffset;

                        // Clamp to playable map boundaries
                        const maxCoord = currentMapSize * 0.45;
                        destX = THREE.MathUtils.clamp(destX, -maxCoord, maxCoord);
                        destZ = THREE.MathUtils.clamp(destZ, -maxCoord, maxCoord);

                        // If formation slot falls in water without bridge, slide inward along rank toward dry land
                        const onBridge = mapBridges.find(b => isPointOnBridge(destX, destZ, b));
                        if (!onBridge && getTerrainHeight(destX, destZ) < currentWaterLevel) {
                            for (let t = 0.8; t >= 0.1; t -= 0.15) {
                                const testX = groundHit.x + (destX - groundHit.x) * t;
                                const testZ = groundHit.z + (destZ - groundHit.z) * t;
                                if (getTerrainHeight(testX, testZ) >= currentWaterLevel || mapBridges.some(b => isPointOnBridge(testX, testZ, b))) {
                                    destX = testX;
                                    destZ = testZ;
                                    break;
                                }
                            }
                        }

                        const destV = new THREE.Vector3(destX, getTerrainHeight(destX, destZ), destZ);
                        const bridges = !unit.isAir ? findBridgeCrossingsForPath(unit.mesh.position, destV) : null;
                        if (bridges) {
                            unit.waypoints = [bridges[0], bridges[1], destV];
                            unit.targetPosition.copy(unit.waypoints.shift());
                        } else {
                            unit.waypoints = [];
                            unit.targetPosition.copy(destV);
                        }
                        unit.combatTarget = null;
                        unit.taskState = unit.isAir ? 'Moving' : 'Idle';
                        if (unit.isAir) {
                            unit.airState = (unit.airState === 'landed') ? 'taking_off' : 'flying';
                            unit.patrolCenter.copy(destV);
                        }
                        if (unit.targetStructure && unit.targetStructure.dozerRef === unit) {
                            unit.targetStructure.dozerRef = null; unit.targetStructure = null;
                        }
                        if (unit.type === 'truck' || unit.type === 'worker') {
                            unit.aiState = 'Idle';
                        }
                    });
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
        function updateTurretSystems() {
            const allCombatEntities = [...units, ...enemyUnits, ...structures, ...enemyStructures];
            allCombatEntities.forEach(unit => {
                if (!unit.mesh) return;
                const turret = unit.mesh.getObjectByName("turretSystem");
                if (!turret) return;

                // 1. If actively engaged in combat, lock directly onto combat target!
                if (unit.combatTarget && unit.combatTarget.health > 0) {
                    const tPos = unit.combatTarget.position || (unit.combatTarget.mesh ? unit.combatTarget.mesh.position : null);
                    if (tPos) {
                        const localTarget = turret.parent.worldToLocal(tPos.clone());
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
            });
        }

        function updateHealthBars() {
            const damagedAssets = [...units, ...enemyUnits, ...structures, ...enemyStructures]
                .filter(asset => asset.health < asset.maxHealth && asset.health > 0 && !asset.garrisonedIn);
            const activeAssets = new Set(damagedAssets);

            healthBarElements.forEach((bar, asset) => {
                if (!activeAssets.has(asset)) {
                    bar.container.remove();
                    healthBarElements.delete(asset);
                }
            });

            damagedAssets.forEach(asset => {
                let bar = healthBarElements.get(asset);
                if (!bar) {
                    const container = document.createElement('div');
                    container.className = 'health-bar-container';
                    const fill = document.createElement('div');
                    fill.className = 'health-bar-fill';
                    container.appendChild(fill);
                    document.getElementById('health-bars').appendChild(container);
                    bar = { container, fill };
                    healthBarElements.set(asset, bar);
                }

                const isStructure = structures.includes(asset) || enemyStructures.includes(asset);
                const position = (asset.mesh || asset).position.clone();
                position.y += isStructure ? 7 : 3.5;
                position.project(camera);
                const onScreen = position.z >= -1 && position.z <= 1 &&
                    Math.abs(position.x) <= 1.1 && Math.abs(position.y) <= 1.1;
                bar.container.style.display = onScreen ? 'block' : 'none';
                if (!onScreen) return;

                bar.container.style.left = `${(position.x * 0.5 + 0.5) * window.innerWidth}px`;
                bar.container.style.top = `${(-position.y * 0.5 + 0.5) * window.innerHeight}px`;
                const healthRatio = Math.max(0, Math.min(1, asset.health / asset.maxHealth));
                bar.fill.style.width = `${healthRatio * 100}%`;
                bar.fill.style.backgroundColor = healthRatio < 0.3 ? '#ff4757' : healthRatio < 0.6 ? '#ffd166' : '#42e66b';
            });
        }

        function assignBuildersToConstruction() {
            const builders = units.filter(unit =>
                (unit.type === 'dozer' || unit.type === 'worker') && unit.health > 0
            );

            // Release foundations whose assigned builder was interrupted or removed.
            structures.forEach(structure => {
                const builder = structure.dozerRef;
                if (structure.isBuilding && builder &&
                    (!builders.includes(builder) || builder.targetStructure !== structure ||
                    !['MovingToBuild', 'Building'].includes(builder.taskState))) {
                    structure.dozerRef = null;
                }
            });

            const availableBuilders = builders.filter(builder =>
                builder.taskState === 'Idle' && !builder.targetStructure
            );
            const waitingStructures = structures.filter(structure =>
                structure.isBuilding && !structure.dozerRef
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
                    structure.dozerRef = nearestBuilder;
                    nearestBuilder.taskState = 'MovingToBuild';
                    nearestBuilder.targetStructure = structure;
                    nearestBuilder.targetPosition.copy(structure.position);
                    availableBuilders.splice(availableBuilders.indexOf(nearestBuilder), 1);
                }
            });
        }

        let combatDeltaScale = 1.0;
        