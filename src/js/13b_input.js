// =========================================================================
// PLAYER INPUT, SELECTION, BLUEPRINT PLACEMENT & COMMAND DISPATCH ENGINE
// =========================================================================
function onPointerDown(e) {
    if (e.target.closest('#generals-command-bar') || e.target.closest('#top-hud-bar') || e.target.closest('#cnc-sidebar') || e.target.closest('#hud') || e.target.closest('#start-menu') || e.target.closest('#general-powers-bar') || e.target.closest('#generals-powers-modal') || e.target.tagName === 'BUTTON') return;

    if (e.button === 0) {
        if (typeof isSellMode !== 'undefined' && isSellMode) {
            isSellMode = false;
            document.getElementById('btn-sell')?.classList.remove('active');
            document.body.style.cursor = 'default';
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
    // Pointer movement is frequent. Only raycast the terrain while a blueprint
    // actually needs a ground position; camera rotation and box selection do
    // not need a terrain intersection.
    const isGuardHover = !!(typeof guardModeActive !== 'undefined' && guardModeActive);
    const needsGroundPick = isPlacingBlueprint || !!blueprintMesh || isGuardHover;
    if (!needsGroundPick && !isRotatingCamera && !isDragging) return;

    if (needsGroundPick) {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const groundHit = getGroundIntersectPoint();
        if (groundHit) {
            if (isPlacingBlueprint && blueprintMesh && blueprintPlacementPos) {
                const dx = groundHit.x - blueprintPlacementPos.x;
                const dz = groundHit.z - blueprintPlacementPos.z;
                if (Math.hypot(dx, dz) > 1.2) {
                    blueprintRotationY = Math.atan2(dx, dz);
                    window._blueprintManualRotated = true;
                    blueprintMesh.rotation.y = blueprintRotationY;
                }
                return;
            }
            if (blueprintMesh) {
                updateBlueprintPosition(groundHit);
                return;
            }
            if (isGuardHover && typeof updateGuardCursorPreview === 'function') {
                updateGuardCursorPreview(groundHit);
            }
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
    if (builder.aiState) builder.aiState = 'Idle';
    builder._boredTimer = 0;
    const perimeterPoint = getStructureBuildPerimeterPoint(builder, structure);
    builder.targetPosition.copy(perimeterPoint);
    builder.waypoints = [];
    // Route builders around buildings, cliffs and water instead of sending
    // them straight toward the construction site. Pathfinding is only run
    // when a build/repair task is assigned, not every frame.
    if (builder.mesh && typeof findNavigationPath === 'function') {
        const route = findNavigationPath(builder.mesh.position, perimeterPoint, { ignoreStruct: structure });
        if (route && route.length > 0) {
            builder.targetPosition.copy(route[0]);
            builder.waypoints = route.slice(1);
        } else {
            const dx = perimeterPoint.x - builder.mesh.position.x;
            const dz = perimeterPoint.z - builder.mesh.position.z;
            const d = Math.hypot(dx, dz) || 1;
            const builderNum = parseInt(String(builder.netId || '1').replace(/\D/g, ''), 10) || 1;
            const sideSign = (builderNum % 2 === 0 ? 1 : -1);
            const detour = new THREE.Vector3(
                builder.mesh.position.x + (dx * 0.5 - dz * 0.4 * sideSign),
                perimeterPoint.y || 0,
                builder.mesh.position.z + (dz * 0.5 + dx * 0.4 * sideSign)
            );
            if (d > 12) {
                builder.targetPosition.copy(detour);
                builder.waypoints = [perimeterPoint.clone()];
            }
        }
    } else if (typeof findBridgeCrossingsForPath === 'function' && builder.mesh) {
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
    // Route builders around buildings, cliffs and water instead of sending
    // them straight toward the construction site. Pathfinding is only run
    // when a build/repair task is assigned, not every frame.
    if (builder.mesh && typeof findNavigationPath === 'function') {
        const route = findNavigationPath(builder.mesh.position, perimeterPoint, { ignoreStruct: structure });
        if (route && route.length > 0) {
            builder.targetPosition.copy(route[0]);
            builder.waypoints = route.slice(1);
        }
    } else if (typeof findBridgeCrossingsForPath === 'function' && builder.mesh) {
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
        const isShiftBuild = !!e.shiftKey;
        const placedType = activeBlueprintType;
        const placementPosition = blueprintPlacementPos.clone();
        placementPosition.y = getTerrainHeight(placementPosition.x, placementPosition.z);
        const newStruct = buildStructureMesh(placedType, placementPosition, false, blueprintRotationY);
        if (!newStruct) {
            scene.remove(blueprintMesh);
            blueprintMesh = null;
            activeBlueprintType = null;
            showNotification('Structure not available for this faction!', 'error');
            return;
        }
        playerResources -= cost;
        const resEl = document.getElementById('resource-display');
        if (resEl) resEl.innerText = `$${playerResources}`;
        playUSASound('construction');

        // Keep blueprint active if Shift is held and player can afford another structure
        if (!isShiftBuild || playerResources < cost) {
            scene.remove(blueprintMesh);
            blueprintMesh = null;
            activeBlueprintType = null;
        }

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
            if (isShiftBuild && (assignedBuilder.taskState === 'Building' || assignedBuilder.taskState === 'MovingToBuild') && assignedBuilder.targetStructure && assignedBuilder.targetStructure.health > 0 && assignedBuilder.targetStructure.isBuilding) {
                if (!assignedBuilder.buildQueue) assignedBuilder.buildQueue = [];
                assignedBuilder.buildQueue.push(newStruct);
                newStruct.dozerRef = assignedBuilder;
                showNotification(`Queued ${placedType.toUpperCase()} (${assignedBuilder.buildQueue.length} in builder queue).`, 'info');
            } else {
                assignedBuilder.buildQueue = [];
                assignDozerToStructure(assignedBuilder, newStruct);
                if (typeof playUnitVoice === 'function') playUnitVoice(assignedBuilder.type, 'build', assignedBuilder.faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa'));
                showNotification('Construction started!', 'info');
            }
        } else {
            showNotification('Construction started!', 'info');
        }
        return;
    }
    if (e.button === 0 && window.rallyPointPlacementStructure) {
        const rallyStructure = window.rallyPointPlacementStructure;
        window.rallyPointPlacementStructure = null;
        document.body.style.cursor = 'default';
        isDragging = false;
        selectionBox.style.display = 'none';
        if (e.target && (e.target.closest('#generals-command-bar') || e.target.closest('#top-hud-bar') || e.target.closest('#cnc-sidebar') || e.target.closest('#hud') || e.target.closest('#start-menu'))) return;
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const groundPoint = getGroundIntersectPoint();
        if (groundPoint) {
            rallyStructure.rallyPoint = groundPoint.clone();
            if (typeof spawnWaypointMarker === 'function') spawnWaypointMarker(groundPoint, 'rally');
            showNotification('Rally point established for ' + rallyStructure.type.toUpperCase() + '.', 'info');
            if (typeof playAudio === 'function') playAudio('rally_set', { volume: 0.78 });
            else playUSASound('radio_chirp');
            updateSidebar();
        }
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
        window._blueprintManualRotated = true;
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
    const segDist = Math.hypot(endPos.x - startPos.x, endPos.z - startPos.z);
    // Dense adaptive scan (at least every 6 world units) along trajectory to detect water channels
    const numSamples = Math.max(20, Math.min(180, Math.ceil(segDist / 6.0)));
    for (let i = 1; i < numSamples; i++) {
        const t = i / numSamples;
        const px = startPos.x + (endPos.x - startPos.x) * t;
        const pz = startPos.z + (endPos.z - startPos.z) * t;
        if (getTerrainHeight(px, pz) < currentWaterLevel + 0.15 && (!hasBridges || !mapBridges.some(b => isPointOnBridge(px, pz, b)))) {
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
            const halfLen = bestBridge.length * 0.44;

            const ramp1 = new THREE.Vector3(bestBridge.position.x - fwdX * halfLen, bestBridge.deckY, bestBridge.position.z - fwdZ * halfLen);
            const ramp2 = new THREE.Vector3(bestBridge.position.x + fwdX * halfLen, bestBridge.deckY, bestBridge.position.z + fwdZ * halfLen);

            const d1 = Math.hypot(startPos.x - ramp1.x, startPos.z - ramp1.z);
            const d2 = Math.hypot(startPos.x - ramp2.x, startPos.z - ramp2.z);

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
    // Ignore if clicking inside UI elements
    if (e.target && (e.target.closest('#generals-command-bar') || e.target.closest('#top-hud-bar') || e.target.closest('#cnc-sidebar') || e.target.closest('#hud') || e.target.closest('#start-menu') || e.target.closest('#general-powers-bar') || e.target.closest('#generals-powers-modal'))) {
        return;
    }

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // Allow player to steer active Particle Cannon orbital beam in a straight line by right-clicking terrain
    if (window.activeParticleCannonTarget && window.activeParticleCannonPlayerOwned &&
        (window.activeParticleCannonControl || !units.some(u => u.selected) || (selectedStructure && selectedStructure.type === 'particleCannon'))) {
        const beamHit = getGroundIntersectPoint();
        if (beamHit) {
            const nowMs = Date.now();
            const isFast = (e.detail >= 2) || (window._lastParticleBeamClickMs && (nowMs - window._lastParticleBeamClickMs) < 500);
            window._lastParticleBeamClickMs = nowMs;
            window.activeParticleCannonSpeed = isFast ? 0.50 : 0.25;
            window.activeParticleCannonManual = true;
            window.activeParticleCannonControl = true;
            if (typeof setParticleBeamCursor === 'function') setParticleBeamCursor(true);
            window.activeParticleCannonTarget.copy(beamHit);
            if (typeof spawnWaypointMarker === 'function') spawnWaypointMarker(beamHit, 'attack');
            showNotification(isFast ? '⚡ Particle Beam: Fast Sweep (2x Speed)!' : '⚡ Redirecting Particle Beam!', 'info');
            return;
        }
    }

    // Ground intersections must use the ray for this pointer event, not the previous frame.
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
            if (typeof playAudio === 'function') playAudio('rally_set', { volume: 0.78 });
            else playUSASound('radio_chirp');
            updateSidebar();
            return;
        }
    }

    if (units.some(u => u.selected)) {
        const sel = units.find(u => u.selected);
        if (sel && typeof playUnitVoice === 'function') playUnitVoice(sel.type, 'move', sel.faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa'));
        else playUSASound('acknowledge');
    }

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

            if (typeof guardModeActive !== 'undefined') guardModeActive = false;
            let _attackPathCount = 0;
            units.forEach((unit, idx) => {
                    if (unit.selected) {
                        unit.combatTarget = targetedEnemy;
                        unit.guardPoint = null;
                        unit.taskState = 'MovingToAttack';
                        if (unit.isAir) {
                            unit.airState = (unit.airState === 'landed') ? 'taking_off' : 'attacking';
                            unit.targetPosition.copy(targetPos);
                            unit.patrolCenter.copy(targetPos);
                        } else {
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
                                const destV = new THREE.Vector3(destX, getTerrainHeight(destX, destZ), destZ);
                                if (++_attackPathCount > MAX_ASTAR_PER_FRAME && typeof enqueueNavigationPath === 'function') {
                                    enqueueNavigationPath(unit, destV);
                                } else {
                                    const bridges = (typeof findBridgeCrossingsForPath === 'function')
                                        ? findBridgeCrossingsForPath(unit.mesh.position, destV)
                                        : null;
                                    if (bridges && bridges.length > 0) {
                                        unit.waypoints = [...bridges.filter(Boolean), destV];
                                        unit.targetPosition.copy(unit.waypoints.shift());
                                    } else {
                                        unit.waypoints = [];
                                        unit.targetPosition.copy(destV);
                                    }
                                }
                            } else {
                                unit.waypoints = [];
                                unit.targetPosition.copy(unit.mesh.position);
                            }
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

    // 1b. Check if right-clicking a friendly vehicle/aircraft with ejected Veteran Pilot(s), or transport/Internet Center to embark!
    const selectedPilots = units.filter(u => u.selected && u.type === 'pilot');
    if (selectedPilots.length > 0) {
        const boardableUnits = units.filter(u => !u.garrisonedIn && u.health > 0 && u.type !== 'pilot' && !isInfantryType(u.type) && u.mesh);
        const boardableMeshes = boardableUnits.map(u => u.mesh);
        const pilotHits = boardableMeshes.length ? raycaster.intersectObjects(boardableMeshes, true) : [];
        let targetVehicle = null;
        if (pilotHits.length > 0) {
            let hitObj = pilotHits[0].object;
            while (hitObj.parent && hitObj.parent !== scene) hitObj = hitObj.parent;
            targetVehicle = boardableUnits.find(u => u.mesh === hitObj) || null;
        }
        // Proximity fallback if click landed right next to a friendly vehicle/aircraft
        if (!targetVehicle) {
            const pGround = getGroundIntersectPoint();
            if (pGround) {
                let bestDist = Infinity;
                for (let bi = 0; bi < boardableUnits.length; bi++) {
                    const cand = boardableUnits[bi];
                    const d = Math.hypot(cand.mesh.position.x - pGround.x, cand.mesh.position.z - pGround.z);
                    if (d <= (cand.radius || 3.0) + 2.5 && d < bestDist) {
                        bestDist = d;
                        targetVehicle = cand;
                    }
                }
            }
        }
        if (targetVehicle) {
            selectedPilots.forEach(p => {
                    p.pilotTarget = targetVehicle;
                    p.taskState = 'Moving';
                    p.combatTarget = null;
                    p.waypoints = [];
                    p.targetPosition.set(targetVehicle.mesh.position.x, getTerrainHeight(targetVehicle.mesh.position.x, targetVehicle.mesh.position.z), targetVehicle.mesh.position.z);
            });
            if (typeof spawnWaypointMarker === 'function') spawnWaypointMarker(targetVehicle.mesh.position, 'move');
            if (typeof playUnitVoice === 'function') playUnitVoice('pilot', 'move', 'usa');
            showNotification(`Pilot ordered to board ${targetVehicle.type.toUpperCase()} and transfer veterancy!`, 'info');
            updateSidebar();
            return;
        }
    }

    const friendlyMeshes = units.filter(u => u.capacity > 0 && !u.garrisonedIn).map(u => u.mesh);
    const selectedHackers = units.filter(u => u.selected && u.type === 'hacker');
    const selectedInfantryForStruct = units.filter(u => u.selected && isInfantryType(u.type));
    const selectedGroundForTunnel = units.filter(u => u.selected && !u.isAir && !u.garrisonedIn);
    const icStructures = (selectedHackers.length > 0 && typeof structures !== 'undefined')
    ? structures.filter(s => s.health > 0 && !s.isBuilding && s.type === 'internetCenter' && s.mesh)
    : [];
    const garrisonStructures = (selectedInfantryForStruct.length > 0 && typeof structures !== 'undefined')
    ? structures.filter(s => s.health > 0 && !s.isBuilding && (s.type === 'bunker' || s.type === 'palace') && s.mesh)
    : [];
    const tunnelStructures = (selectedGroundForTunnel.length > 0 && typeof structures !== 'undefined')
    ? structures.filter(s => s.health > 0 && !s.isBuilding && s.type === 'tunnel' && s.mesh)
    : [];
    const icMeshes = icStructures.map(s => s.mesh);
    const garrisonStructMeshes = garrisonStructures.map(s => s.mesh);
    const tunnelStructMeshes = tunnelStructures.map(s => s.mesh);
    const transportHits = raycaster.intersectObjects([...friendlyMeshes, ...icMeshes, ...garrisonStructMeshes, ...tunnelStructMeshes], true);
    if (transportHits.length > 0) {
        let hitObj = transportHits[0].object;
        while (hitObj.parent && hitObj.parent !== scene) hitObj = hitObj.parent;
        const tunTarget = tunnelStructures.find(s => s.mesh === hitObj);
        if (tunTarget && selectedGroundForTunnel.length > 0) {
            if (typeof window !== 'undefined' && !Array.isArray(window.glaTunnelNetworkPool)) window.glaTunnelNetworkPool = [];
            tunTarget.capacity = 10;
            tunTarget.garrisoned = (typeof window !== 'undefined') ? window.glaTunnelNetworkPool : [];
            if (typeof spawnWaypointMarker === 'function') spawnWaypointMarker(tunTarget.position, 'garrison');
            selectedGroundForTunnel.forEach(u => {
                u.embarkTarget = tunTarget;
                u.taskState = 'MovingToEmbark';
                u.combatTarget = null;
                u.targetPosition.copy(tunTarget.position);
            });
            showNotification(`Units ordered into GLA Tunnel Network (${tunTarget.garrisoned.length}/10 — deploy from any friendly tunnel!).`, 'info');
            updateSidebar();
            return;
        }
        const icTarget = icStructures.find(s => s.mesh === hitObj);
        if (icTarget && selectedHackers.length > 0) {
            if (!icTarget.capacity) icTarget.capacity = 8;
            if (!icTarget.garrisoned) icTarget.garrisoned = [];
            selectedHackers.forEach(h => {
                    h.embarkTarget = icTarget;
                    h.taskState = 'MovingToEmbark';
                    h.combatTarget = null;
                    h.targetPosition.copy(icTarget.position);
            });
            showNotification(`Hackers ordered to garrison Internet Center (${icTarget.garrisoned.length}/${icTarget.capacity} slots) for accelerated hacking.`, 'info');
            updateSidebar();
            return;
        }
        const gStruct = garrisonStructures.find(s => s.mesh === hitObj);
        if (gStruct && selectedInfantryForStruct.length > 0) {
            if (!gStruct.capacity) gStruct.capacity = 5;
            if (!gStruct.garrisoned) gStruct.garrisoned = [];
            if (typeof spawnWaypointMarker === 'function') spawnWaypointMarker(gStruct.position, 'garrison');
            selectedInfantryForStruct.forEach(inf => {
                    inf.embarkTarget = gStruct;
                    inf.taskState = 'MovingToEmbark';
                    inf.combatTarget = null;
                    inf.targetPosition.copy(gStruct.position);
            });
            const sLabel = gStruct.type === 'palace' ? 'Palace' : 'Bunker';
            showNotification(`Infantry ordered to garrison ${sLabel} (${gStruct.garrisoned.length}/${gStruct.capacity} slots).`, 'info');
            updateSidebar();
            return;
        }
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

    // 1b2. Check if right-clicking on a garrisonable civilian/world building (attack enemy garrison or embark friendly infantry)
    const selectedForBld = units.filter(u => u.selected);
    if (selectedForBld.length > 0 && typeof worldBuildings !== 'undefined' && worldBuildings.length > 0) {
        const wbMeshes = worldBuildings.map(wb => wb.mesh).filter(Boolean);
        const wbHits = wbMeshes.length ? raycaster.intersectObjects(wbMeshes, true) : [];
        if (wbHits.length > 0) {
            const hitLeaf = wbHits[0].object;
            const wbTarget = worldBuildings.find(wb => {
                    let o = hitLeaf;
                    while (o) { if (o === wb.mesh) return true; o = o.parent; }
                    return false;
            });
            if (wbTarget && wbTarget.health > 0) {
                const occupiedByEnemy = wbTarget.garrisoned && wbTarget.garrisoned.length > 0 && !isFriendly({ teamId: playerTeamId }, wbTarget);
                if (occupiedByEnemy) {
                    const combatUnits = selectedForBld.filter(u => !u.isBuilder && !['dozer', 'worker', 'supply', 'supplyTruck', 'truck', 'chinook'].includes(u.type));
                    if (combatUnits.length > 0) {
                        if (typeof spawnWaypointMarker === 'function') spawnWaypointMarker(wbTarget.position, 'attack');
                        if (typeof playUnitVoice === 'function') {
                            playUnitVoice(combatUnits[0].type, 'attack', combatUnits[0].faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa'));
                        }
                        const targetRadius = wbTarget.radius || 5.5;
                        combatUnits.forEach((unit, idx) => {
                                unit.combatTarget = wbTarget;
                                unit.taskState = 'MovingToAttack';
                                unit.embarkTarget = null;
                                if (unit.isAir) {
                                    unit.airState = (unit.airState === 'landed') ? 'taking_off' : 'attacking';
                                    unit.targetPosition.copy(wbTarget.position);
                                    unit.patrolCenter.copy(wbTarget.position);
                                } else {
                                    const dist = unit.mesh.position.distanceTo(wbTarget.position);
                                    const desiredRange = (unit.scanRange || 18) + targetRadius - 2.5;
                                    if (dist > desiredRange) {
                                        const approach = new THREE.Vector3().subVectors(wbTarget.position, unit.mesh.position).normalize();
                                        const fanAngle = (idx % 5 - 2) * 0.22;
                                        approach.applyAxisAngle(new THREE.Vector3(0, 1, 0), fanAngle);
                                        const destX = wbTarget.position.x - approach.x * desiredRange;
                                        const destZ = wbTarget.position.z - approach.z * desiredRange;
                                        unit.targetPosition.set(destX, typeof getTerrainHeight === 'function' ? getTerrainHeight(destX, destZ) : 0, destZ);
                                    } else {
                                        unit.targetPosition.copy(unit.mesh.position);
                                    }
                                }
                            });
                        showNotification('Attacking enemy-garrisoned structure! Use fire, toxin, or flashbangs to clear occupants.', 'warning');
                        return;
                    }
                    showNotification('Building is garrisoned by hostile forces! Clear it with fire or toxins.', 'error');
                    return;
                }
                const selectedInfForBld = selectedForBld.filter(u => isInfantryType(u.type));
                if (selectedInfForBld.length > 0) {
                    if (typeof spawnWaypointMarker === 'function') spawnWaypointMarker(wbTarget.position, 'garrison');
                    if (typeof playUnitVoice === 'function') {
                        playUnitVoice(selectedInfForBld[0].type, 'move', selectedInfForBld[0].faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa'));
                    }
                    selectedInfForBld.forEach(inf => {
                            inf.embarkTarget = wbTarget;
                            inf.taskState = 'MovingToEmbark';
                            inf.combatTarget = null;
                            inf.targetPosition.copy(wbTarget.position);
                    });
                    showNotification(`Infantry ordered to garrison building (${(wbTarget.garrisoned || []).length}/${wbTarget.capacity} slots).`, 'info');
                    updateSidebar();
                    return;
                }
            }
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
        const isGuardClick = !!(typeof guardModeActive !== 'undefined' && guardModeActive);
        if (typeof spawnWaypointMarker === 'function') {
            spawnWaypointMarker(groundHit, isGuardClick ? 'guard' : 'move');
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
        if (typeof guardModeActive !== 'undefined' && guardModeActive && typeof orderUnitsGuard === 'function') {
            orderUnitsGuard(groundHit);
            updateSidebar();
            return;
        }
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
            unit.guardPoint = null;
            unit.pilotTarget = null;
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
            selectedList.forEach(u => { u.pilotTarget = null; });
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

    const selectionBefore = units.filter(u => u.selected);
    const selectedStructureBefore = selectedStructure;
    const selectedSupplyBefore = selectedSupplyPoint;
    const selectionChanged = () => {
        const after = units.filter(u => u.selected);
        return after.length !== selectionBefore.length || after.some((unit, index) => unit !== selectionBefore[index]) ||
        selectedStructure !== selectedStructureBefore || selectedSupplyPoint !== selectedSupplyBefore;
    };

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // Particle Cannon active beam steering (Left-click: 1x drag, Double-click: 2x fast sweep)
    if (window.activeParticleCannonTarget && window.activeParticleCannonPlayerOwned && window.activeParticleCannonControl) {
        const pUnitMeshes = units.filter(u => !u.garrisonedIn && u.mesh).map(u => u.mesh);
        const pUnitHits = pUnitMeshes.length ? raycaster.intersectObjects(pUnitMeshes, true) : [];
        const pStructMeshes = structures.map(s => s.mesh).filter(Boolean);
        const pStructHits = pStructMeshes.length ? raycaster.intersectObjects(pStructMeshes, true) : [];
        let clickedOtherPlayerStruct = false;
        if (pStructHits.length > 0) {
            let sRoot = pStructHits[0].object;
            while (sRoot.parent && sRoot.parent !== scene) sRoot = sRoot.parent;
            const hitStruct = structures.find(s => s.mesh === sRoot);
            if (hitStruct && hitStruct.type !== 'particleCannon') clickedOtherPlayerStruct = true;
        }
        if (pUnitHits.length > 0 || clickedOtherPlayerStruct) {
            // Player clicked away onto a unit or another building -> release beam steering control
            window.activeParticleCannonControl = false;
            if (typeof setParticleBeamCursor === 'function') setParticleBeamCursor(false);
        } else {
            const beamGround = getGroundIntersectPoint();
            if (beamGround) {
                const nowMs = Date.now();
                const isFast = (e.detail >= 2) || (window._lastParticleBeamClickMs && (nowMs - window._lastParticleBeamClickMs) < 350);
                window._lastParticleBeamClickMs = nowMs;
                window.activeParticleCannonSpeed = isFast ? 0.84 : 0.42;
                window.activeParticleCannonTarget.copy(beamGround);
                if (typeof spawnWaypointMarker === 'function') spawnWaypointMarker(beamGround, 'attack');
                showNotification(isFast ? '⚡ Particle Beam: Fast Sweep (2x Speed)!' : '⚡ Steering Particle Beam!', 'info');
                return;
            }
        }
    }

    // 1. Check Units (Direct Raycast)
    const unitMeshes = units.filter(u => !u.garrisonedIn && u.mesh).map(u => u.mesh);
    // Avoid entering Three.js recursive raycasting when there is nothing selectable.
    const unitHits = unitMeshes.length ? raycaster.intersectObjects(unitMeshes, true) : [];
    if (unitHits.length > 0) {
        let hit = unitHits[0].object;
        while (hit.parent && hit.parent !== scene) hit = hit.parent;
        const unit = units.find(candidate => candidate.mesh === hit);
        if (unit && !unit.garrisonedIn) {
            if (!e.shiftKey && unit.selected && selectionBefore.length === 1 && selectedStructure == null && selectedSupplyPoint == null) return;
            if (e.shiftKey) {
                // Shift + Click: Add or remove from current selection (Official rule)
                unit.selected = !unit.selected;
                if (unit.selected) addSelectionCircle(unit);
                else removeSelectionCircle(unit);
            } else {
                // Normal Click: Deselect previous and select this unit
                units.forEach(u => { if (u.selected) { u.selected = false; removeSelectionCircle(u); } });
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
        units.forEach(u => { if (u.selected) { u.selected = false; removeSelectionCircle(u); } });
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
            if (closestUnit.selected && selectionBefore.length === 1 && selectedStructure == null && selectedSupplyPoint == null) return;
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
    const structureMeshes = allStructures.map(structure => structure.mesh).filter(Boolean);
    const structureHits = structureMeshes.length ? raycaster.intersectObjects(structureMeshes, true) : [];
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
                if (typeof playBuildingSelectSound === 'function') {
                    playBuildingSelectSound(hitCandidate.type, hitCandidate.faction || selectedFaction);
                }
                if (hitCandidate.type === 'particleCannon' && window.activeParticleCannonTarget && window.activeParticleCannonPlayerOwned) {
                    window.activeParticleCannonControl = true;
                    if (typeof setParticleBeamCursor === 'function') setParticleBeamCursor(true);
                    showNotification('⚡ Particle Beam steering control re-acquired!', 'info');
                }
                updateSidebar();
                return;
            }
        }
    }

    // 2b. Check Garrisoned World Buildings owned by the player (allows Evacuate)
    if (typeof worldBuildings !== 'undefined' && worldBuildings.length > 0) {
        const wbMeshes = worldBuildings.filter(wb => wb.garrisoned && wb.garrisoned.length > 0 && wb.teamId === playerTeamId).map(wb => wb.mesh).filter(Boolean);
        const wbHits = wbMeshes.length ? raycaster.intersectObjects(wbMeshes, true) : [];
        if (wbHits.length > 0) {
            const hitLeaf = wbHits[0].object;
            const wbTarget = worldBuildings.find(wb => {
                    let o = hitLeaf;
                    while (o) { if (o === wb.mesh) return true; o = o.parent; }
                    return false;
            });
            if (wbTarget) {
                selectedStructure = wbTarget;
                activeSidebarTab = 'production';
                if (typeof playAudio === 'function') playAudio('gui_blip', { volume: 0.65 });
                updateSidebar();
                return;
            }
        }
    }

    // 3. Check Supply Depots / Field crystals (Selectable per user request!)
    const supplyMeshes = supplyPoints.map(p => p.mesh).filter(Boolean);
    const supplyHits = supplyMeshes.length ? raycaster.intersectObjects(supplyMeshes, true) : [];
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

    if (selectionChanged()) {
        updateSidebar();
        updateHUD();
    }
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
        const firstSel = units.find(u => u && u.selected && !u.garrisonedIn);
        if (firstSel && typeof playUnitVoice === 'function') {
            playUnitVoice(firstSel.type, 'select', firstSel.faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa'));
        }
    }
    updateHUD();
    updateSidebar();
}

// Advanced Turret System: Locks onto active combat targets or sweeps in natural idle radar scans
// PERF: iterates the four lists directly (no per-frame array spread) and reuses one scratch vector
const _turretScratch = new THREE.Vector3();
let _turretThrottleFrame = 0;
function updateTurretSystems() {
    // Throttle turret tracking to every 2 frames (Issue #63); lerp factors compensated below for identical speed
    _turretThrottleFrame++;
    if ((_turretThrottleFrame & 1) !== 0) return;
    const lists = [units, enemyUnits, structures, enemyStructures];
    for (let li = 0; li < lists.length; li++) {
        const list = lists[li];
        for (let ui = 0; ui < list.length; ui++) updateTurretFor(list[ui]);
    }
}
function updateTurretFor(unit) {
    if (!unit || !unit.mesh || unit.mesh.visible === false) return;
    const turret = getCachedNode(unit.mesh, "turretSystem");
    if (!turret) return;

    // 1. If actively engaged in combat, lock directly onto combat target!
    if (unit.combatTarget && unit.combatTarget.health > 0) {
        const tPos = unit.combatTarget.position || (unit.combatTarget.mesh ? unit.combatTarget.mesh.position : null);
        if (tPos && turret.parent && typeof turret.parent.worldToLocal === 'function') {
            const localTarget = turret.parent.worldToLocal(_turretScratch.copy(tPos));
            const desiredAngle = Math.atan2(localTarget.x, localTarget.z);
            let diff = desiredAngle - turret.rotation.y;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            turret.rotation.y += diff * 0.28; // Smooth swift tracking (2-frame compensated)
            return;
        }
    }

    // 2. Out of combat: skip idle observation sweeps when far off-screen to save per-frame math in large battles
    if (typeof camera !== 'undefined' && camera && camera.position) {
        const dx = unit.mesh.position.x - camera.position.x;
        const dz = unit.mesh.position.z - camera.position.z;
        if (dx * dx + dz * dz > 260 * 260) return;
    }
    if (!unit._idleTurretTimer || unit._idleTurretTimer <= 0) {
        unit._idleTurretTimer = 50 + Math.floor(Math.random() * 90); // Sweeps every 2-5 seconds (2-frame compensated)
        // 65% chance forward (0 rad), 35% chance to sweep left or right
        unit._idleTurretAngle = Math.random() < 0.65 ? 0 : (Math.random() - 0.5) * 1.3;
    }
    unit._idleTurretTimer--;
    let diff = (unit._idleTurretAngle || 0) - turret.rotation.y;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    turret.rotation.y += diff * 0.068; // Gentle, authentic military traverse (2-frame compensated)
}

// PERF: health bars no longer rebuild 4 arrays + a Set per frame, no O(S) includes() per asset,
// no Vector3 allocation per bar, and DOM styles are only written when their value changes.
// Positioning uses transform (compositor-only) instead of left/top (layout).
const _hbScratch = new THREE.Vector3();
let _hbFrame = 0;
let _hbContainer = null;
const _hbGroupMap = new Map();
const _VET_ICONS = [
    '',
    '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 7 L5 2 L9 7 L7.4 7 L5 4 L2.6 7 Z" fill="#ffd32a" stroke="#111" stroke-width="0.6"/></svg>',
    '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M1.5 10 L6 5.5 L10.5 10 L8.8 10 L6 7.2 L3.2 10 Z" fill="#ffd32a" stroke="#111" stroke-width="0.5"/><path d="M1.5 6 L6 1.5 L10.5 6 L8.8 6 L6 3.2 L3.2 6 Z" fill="#ffd32a" stroke="#111" stroke-width="0.5"/></svg>',
    '<svg width="12" height="12" viewBox="0 0 12 12"><polygon points="6,0.6 7.6,4.1 11.4,4.6 8.6,7.2 9.3,11 6,9.1 2.7,11 3.4,7.2 0.6,4.6 4.4,4.1" fill="#ffdd59" stroke="#c0392b" stroke-width="0.9"/></svg>'
];
function updateHealthBars() {
    _hbFrame++;
    // Issue #60: throttle health bar projection/DOM loop to 30 Hz when total battlefield assets exceed 160
    const totalAssets = units.length + enemyUnits.length + structures.length + enemyStructures.length;
    if (totalAssets > 160 && (_hbFrame & 1) !== 0) return;
    if (!_hbContainer) _hbContainer = document.getElementById('health-bars');
    _hbGroupMap.clear();
    const cg = (typeof controlGroups !== 'undefined') ? controlGroups : (typeof window !== 'undefined' ? window.controlGroups : null);
    if (cg) {
        for (let g = 1; g <= 9; g++) {
            const grp = cg[g];
            if (grp && grp.length) {
                for (let k = 0; k < grp.length; k++) {
                    if (!_hbGroupMap.has(grp[k])) _hbGroupMap.set(grp[k], g);
                }
            }
        }
    }
    const selStruct = (typeof selectedStructure !== 'undefined') ? selectedStructure : null;
    const w = window.innerWidth, h = window.innerHeight;
    const lists = [units, enemyUnits, structures, enemyStructures];
    for (let li = 0; li < lists.length; li++) {
        const list = lists[li];
        const isStructure = li >= 2;
        for (let ai = 0; ai < list.length; ai++) {
            const asset = list[ai];
            if (!(asset.health > 0 && !asset.garrisonedIn)) continue;
            if (asset.mesh && !asset.mesh.visible) {
                const hiddenBar = healthBarElements.get(asset);
                if (hiddenBar && hiddenBar.container && hiddenBar.shown !== false) {
                    hiddenBar.container.style.display = 'none';
                    hiddenBar.shown = false;
                }
                continue;
            }
            const isSelected = !!asset.selected || (isStructure && asset === selStruct);
            const showHealthBar = isSelected || asset.health < asset.maxHealth;
            const vetRank = Math.min(3, Math.max(0, asset.veterancy || 0));
            if (!showHealthBar && vetRank === 0) continue;

            // PERF: project & check onScreen BEFORE creating a DOM element for off-screen units
            const position = _hbScratch.copy((asset.mesh || asset).position);
            position.y += isStructure ? 7 : 3.5;
            position.project(camera);
            const onScreen = position.z >= -1 && position.z <= 1 &&
                Math.abs(position.x) <= 1.1 && Math.abs(position.y) <= 1.1;

            let bar = healthBarElements.get(asset);
            if (!onScreen) {
                if (bar) {
                    bar.seen = _hbFrame;
                    if (bar.shown !== false) {
                        bar.container.style.display = 'none';
                        bar.shown = false;
                    }
                }
                continue;
            }
            if (!bar) {
                const container = document.createElement('div');
                container.className = 'hb-wrap';
                container.style.left = '0px';
                container.style.top = '0px';

                const groupBadge = document.createElement('span');
                groupBadge.className = 'hb-group-badge';
                groupBadge.style.display = 'none';
                container.appendChild(groupBadge);

                const barBox = document.createElement('div');
                barBox.className = 'health-bar-container';
                const fill = document.createElement('div');
                fill.className = 'health-bar-fill';
                barBox.appendChild(fill);
                container.appendChild(barBox);

                const vetBadge = document.createElement('span');
                vetBadge.className = 'hb-vet-badge';
                vetBadge.style.display = 'none';
                container.appendChild(vetBadge);

                if (_hbContainer) _hbContainer.appendChild(container);
                bar = { container, barBox, fill, groupBadge, vetBadge, shown: null, hbShown: null, tf: '', pct: -1, color: '', grp: -1, vet: -1 };
                healthBarElements.set(asset, bar);
            }
            bar.seen = _hbFrame;
            if (bar.shown !== true) {
                bar.container.style.display = 'flex';
                bar.shown = true;
            }

            const px = Math.round((position.x * 0.5 + 0.5) * w);
            const py = Math.round((-position.y * 0.5 + 0.5) * h);
            const tf = `translate(${px}px, ${py}px) translate(-50%, -50%)`;
            if (bar.tf !== tf) { bar.container.style.transform = tf; bar.tf = tf; }

            if (bar.hbShown !== showHealthBar) {
                bar.barBox.style.display = showHealthBar ? 'block' : 'none';
                bar.hbShown = showHealthBar;
            }
            if (showHealthBar) {
                const healthRatio = Math.max(0, Math.min(1, asset.health / asset.maxHealth));
                const pct = Math.round(healthRatio * 100);
                if (bar.pct !== pct) { bar.fill.style.width = pct + '%'; bar.pct = pct; }
                const color = healthRatio < 0.3 ? '#ff4757' : healthRatio < 0.6 ? '#ffd166' : '#42e66b';
                if (bar.color !== color) { bar.fill.style.backgroundColor = color; bar.color = color; }
            }

            const grpNum = (!isStructure && isSelected) ? (_hbGroupMap.get(asset) || 0) : 0;
            if (bar.grp !== grpNum) {
                bar.groupBadge.style.display = grpNum > 0 ? 'inline-block' : 'none';
                if (grpNum > 0) bar.groupBadge.textContent = String(grpNum);
                bar.grp = grpNum;
            }

            if (bar.vet !== vetRank) {
                bar.vetBadge.style.display = vetRank > 0 ? 'inline-flex' : 'none';
                bar.vetBadge.innerHTML = _VET_ICONS[vetRank] || '';
                bar.vet = vetRank;
            }
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

