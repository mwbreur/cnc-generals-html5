function processEnemyAIEngine() {
    if (isMultiplayerActive) return;
    aiDecisionTimer++;
    // Scaled AI decision tick rate by chosen difficulty
    const tickRate = aiDifficultyLevel === 'hard' ? 30 : aiDifficultyLevel === 'easy' ? 90 : 60;
    if (aiDecisionTimer < tickRate) return;
    aiDecisionTimer = 0;

    // AI Production Engine: Builds waves of combat units from enemy War Factory & Barracks!
    aiProductionTick++;
    const prodInterval = aiDifficultyLevel === 'hard' ? 8 : aiDifficultyLevel === 'easy' ? 24 : 14;
    if (aiProductionTick % prodInterval === 0 && enemyUnits.length < (aiDifficultyLevel === 'hard' ? 24 : aiDifficultyLevel === 'easy' ? 8 : 14)) {
        const fac = enemyStructures.find(es => es.type === 'factory' && es.health > 0);
        if (fac) {
            const spawnPos = fac.position.clone().add(new THREE.Vector3(12 + Math.random() * 4, 0, 8 + Math.random() * 4));
            spawnPos.y = getTerrainHeight(spawnPos.x, spawnPos.z);
            let uType = 'tank';
            if (fac.faction === 'china') {
                uType = (aiDifficultyLevel === 'hard' && Math.random() < 0.45) ? 'overlord' : (Math.random() < 0.35 ? 'gatling' : 'battlemaster');
            } else if (fac.faction === 'gla') {
                uType = (aiDifficultyLevel === 'hard' && Math.random() < 0.45) ? 'marauder' : (Math.random() < 0.4 ? 'buggy' : 'scorpion');
            } else {
                uType = (aiDifficultyLevel === 'hard' && Math.random() < 0.45) ? 'paladin' : (Math.random() < 0.35 ? 'humvee' : 'tank');
            }
            spawnEnemyUnit(uType, spawnPos);
        }
    }

    enemyUnits.forEach(enemy => {
        if (enemy.health <= 0) return;

        // If the enemy is already locked in a firefight with a valid target, keep pursuing
        if (enemy.combatTarget && enemy.combatTarget.health > 0) {
            const currentDist = enemy.mesh.position.distanceTo(enemy.combatTarget.mesh.position);
            if (currentDist > enemy.scanRange) {
                // If the player asset slips outside firing range, move closer to chase
                enemy.targetPosition.copy(enemy.combatTarget.mesh.position);
            }
            return; 
        }

        // --- Target Acquisition Pass ---
        let closestTarget = null;
        let minimumDistance = Infinity;

        // 1. Scan for nearby friendly Player Units
        units.forEach(playerUnit => {
            if (playerUnit.health > 0 && !playerUnit.garrisonedIn) {
                const distance = enemy.mesh.position.distanceTo(playerUnit.mesh.position);
                if (distance < minimumDistance) {
                    minimumDistance = distance;
                    closestTarget = playerUnit;
                }
            }
        });

        // 2. Scan for Player Base Structures if no units are close
                    structures.forEach(struct => {
            if (struct.buildProgress >= 100 && struct.health > 0) { // Only attack completed base layouts
                const distance = enemy.mesh.position.distanceTo(struct.position);
                if (distance < minimumDistance) {
                    minimumDistance = distance;
                    closestTarget = struct;
                }
            }
        });

        // --- Execute Tactical AI Order ---
        if (closestTarget) {
            enemy.combatTarget = closestTarget;
            const targetPos = closestTarget.position || closestTarget.mesh.position;
            
            // Move toward the target, but drop into standard firing formation right at weapon range
            if (minimumDistance > enemy.scanRange) {
                const approachDir = new THREE.Vector3().subVectors(targetPos, enemy.mesh.position).normalize();
                enemy.targetPosition.copy(targetPos).addScaledVector(approachDir, -(enemy.scanRange - 3));
            } else {
                enemy.targetPosition.copy(enemy.mesh.position); // Already in range, halt and open fire
            }
        } else {
            // No player targets left on map, return to baseline patrol stance
            if (enemy.targetPosition.distanceTo(enemy.mesh.position) < 2.0) {
                enemy.targetPosition.set(20 + (Math.random() * 20 - 10), 0, -20 + (Math.random() * 20 - 10));
            }
        }
    });
}

        function onPointerDown(e) {
            if (e.target.closest('#cnc-sidebar') || e.target.closest('#hud') || e.target.closest('#start-menu') || e.target.tagName === 'BUTTON') return;

            if (e.button === 0) {
                if (choosingBaseLocation) {
                    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
                    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
                    raycaster.setFromCamera(mouse, camera);
                    const placement = getGroundIntersectPoint();
                    if (placement) deployBase(placement);
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
                            alert('Superweapon is recharging.');
                        } else {
                            strikeWithSuperweapon(weapon, targetPosition);
                        }
                        pendingSuperweapon = null;
                    }
                    return;
                }
                if (blueprintMesh) {
                    if (!isBlueprintValid) {
                        showNotification("Cannot place structure in water, on bridges, or obstructed ground!", "error");
                        return;
                    }
                    if (isBlueprintValid) {
                        const cost = getStructureCost(activeBlueprintType);
                        if (playerResources < cost) {
                            alert("Insufficient resources.");
                            scene.remove(blueprintMesh);
                            blueprintMesh = null;
                            activeBlueprintType = null;
                            return;
                        }
                        playerResources -= cost;
                        document.getElementById('resource-display').innerText = `$${playerResources}`;
                        
                        const placementPosition = blueprintMesh.position.clone();
                        placementPosition.y = getTerrainHeight(placementPosition.x, placementPosition.z);
                        const newStruct = buildStructureMesh(activeBlueprintType, placementPosition);
                        playUSASound('construction');
                        scene.remove(blueprintMesh); blueprintMesh = null; activeBlueprintType = null;

                        const freeDozer = units.find(u => (u.type === 'dozer' || u.type === 'worker') && u.taskState === 'Idle');
                        if (freeDozer) {
                            freeDozer.taskState = 'MovingToBuild';
                            freeDozer.targetStructure = newStruct;
                            newStruct.dozerRef = freeDozer;
                        }
                    }
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
                if (pendingSuperweapon) { pendingSuperweapon = null; return; }
                if (blueprintMesh) { scene.remove(blueprintMesh); blueprintMesh = null; activeBlueprintType = null; return; }
                issueMoveCommand(e); 
            }
        }

        function onPointerMove(e) {
            // Screen edge panning removed per request
            mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);
            const intersect = new THREE.Vector3();

            const groundHit = getGroundIntersectPoint();
            if (groundHit) {
                intersect.copy(groundHit);
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
            e.preventDefault(); cameraRadius += e.deltaY * 0.04 * zoomSpeed;
            cameraRadius = Math.max(25, Math.min(300, cameraRadius)); updateCameraPosition();
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
            if (units.some(u => u.selected)) playUSASound('acknowledge');
            // Ignore if clicking inside UI elements
            if (e.target && (e.target.closest('#cnc-sidebar') || e.target.closest('#hud') || e.target.closest('#start-menu'))) {
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
                    const targetPos = (targetedEnemy.position || targetedEnemy.mesh.position).clone();
                    const targetRadius = targetedEnemy.radius || 4;

                    units.forEach((unit, idx) => {
                        if (unit.selected) {
                            unit.combatTarget = targetedEnemy;
                            unit.taskState = 'MovingToAttack';

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
                    const bridges = !unit.isAir ? findBridgeCrossingsForPath(unit.mesh.position, groundHit) : null;
                    if (bridges) {
                        unit.waypoints = [bridges[0], bridges[1], groundHit.clone()];
                        unit.targetPosition.copy(unit.waypoints.shift());
                    } else {
                        unit.waypoints = [];
                        unit.targetPosition.copy(groundHit);
                    }
                    unit.combatTarget = null;
                    unit.taskState = 'Idle';
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
                        unit.taskState = 'Idle';
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
            if (e.target && (e.target.closest('#cnc-sidebar') || e.target.closest('#hud') || e.target.closest('#start-menu') || e.target.closest('#tactical-tooltip'))) {
                return;
            }
            units.forEach(unit => { unit.selected = false; removeSelectionCircle(unit); });
            selectedStructure = null;
            selectedSupplyPoint = null;

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
                    unit.selected = true;
                    addSelectionCircle(unit);
                    activeSidebarTab = 'production';
                    updateSidebar();
                    updateHUD();
                    return;
                }
            }

            // 1b. Proximity fallback: If ray misses small infantry polygons, pick closest unit near clicked ground position!
            const groundHit = getGroundIntersectPoint();
            if (groundHit) {
                let closestUnit = null;
                let closestDist = Infinity;
                for (let u of units) {
                    if (u.garrisonedIn || !u.mesh) continue;
                    const d = Math.hypot(groundHit.x - u.mesh.position.x, groundHit.z - u.mesh.position.z);
                    const pickRadius = Math.max((u.radius || 1.2) * 2.2, 3.2);
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

            // 2. Check Structures
            const structureHits = raycaster.intersectObjects(structures.map(structure => structure.mesh), true);
            if (structureHits.length > 0) {
                let hit = structureHits[0].object;
                while (hit.parent && hit.parent !== scene) hit = hit.parent;
                selectedStructure = structures.find(candidate => candidate.mesh === hit) || null;
                if (selectedStructure) {
                    activeSidebarTab = 'production';
                    updateSidebar();
                    return;
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
            const allCombatUnits = [...units, ...enemyUnits];
            allCombatUnits.forEach(unit => {
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
        