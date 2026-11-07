function animate() {
            requestAnimationFrame(animate);

            const nowTime = performance.now();
            const dt = Math.min(0.1, (nowTime - (window._lastCombatFrameTime || nowTime)) / 1000);
            window._lastCombatFrameTime = nowTime;
            combatDeltaScale = Math.min(6.0, dt * 60);

            const animTime = nowTime * 0.003;

            // Update Weapon Effects & Particle System
            
            updateFXEngine();

            // =========================================================
            // ACTIVE DRONES, OVERLORD UPGRADES & HEROIC VETERANCY REGENERATION
            // =========================================================
            units.forEach(unit => {
                if (unit.health <= 0) return;

                // 1. Heroic Self-Healing
                if (unit.veterancy === 3 && buildingTick % 30 === 0 && unit.health < unit.maxHealth) {
                    unit.health = Math.min(unit.maxHealth, unit.health + 3);
                }

                // 2. USA Vehicle Drones
                if (unit.drone && unit.drone.mesh) {
                    const drone = unit.drone;
                    const dMesh = drone.mesh;

                    // Hover position tracking above vehicle
                    const targetDroneY = unit.mesh.position.y + (drone.type === 'scout' ? 4.2 : 2.2) + Math.sin(Date.now() * 0.006) * 0.25;
                    dMesh.position.x += (unit.mesh.position.x - dMesh.position.x) * 0.18;
                    dMesh.position.z += (unit.mesh.position.z - dMesh.position.z) * 0.18;
                    dMesh.position.y += (targetDroneY - dMesh.position.y) * 0.18;
                    dMesh.rotation.y = unit.mesh.rotation.y;

                    if (dMesh.userData && dMesh.userData.rotors) {
                        dMesh.userData.rotors.rotation.y += 0.45;
                    }

                    drone.timer = (drone.timer || 0) + 1;

                    // Battle Drone: Repairs vehicle + fires micro-gun at hostile infantry
                    if (drone.type === 'battle') {
                        if (drone.timer % 60 === 0 && unit.health < unit.maxHealth) {
                            unit.health = Math.min(unit.maxHealth, unit.health + 3);
                        }
                        if (drone.timer % 40 === 0) {
                            const enemyInf = enemyUnits.find(e => e.health > 0 && !e.isAir && e.mesh.position.distanceTo(dMesh.position) <= 16.0);
                            if (enemyInf) {
                                spawnBulletTracer(dMesh.position, enemyInf.mesh.position, 0x00d2d3, 1.5);
                                playAudio('machine_gun');
                                enemyInf.health -= 12;
                            }
                        }
                    }

                    // Hellfire Drone: Launches mini-Hellfire rockets at hostile armor
                    if (drone.type === 'hellfire') {
                        if (drone.timer % 90 === 0) {
                            const enemyArmor = enemyUnits.find(e => e.health > 0 && !e.isAir && e.mesh.position.distanceTo(dMesh.position) <= 22.0);
                            if (enemyArmor) {
                                spawnRocketProjectile(dMesh.position, enemyArmor.mesh.position, false, false);
                                playAudio('missile_launch');
                                enemyArmor.health -= 35;
                            }
                        }
                    }
                }

                // 3. China Overlord Upgrades Active Logic
                if (unit.type === 'overlord' && unit.overlordUpgrade) {
                    unit.upgTimer = (unit.upgTimer || 0) + 1;

                    // Overlord Bunker: 2 troops shoot 360 degrees
                    if (unit.overlordUpgrade === 'bunker' && unit.upgTimer % 45 === 0) {
                        const target = enemyUnits.find(e => e.health > 0 && e.mesh.position.distanceTo(unit.mesh.position) <= 18.0);
                        if (target) {
                            spawnBulletTracer(unit.mesh.position, target.mesh.position, 0xf39c12, 2.5);
                            playAudio('china_cannon', {}, 'china');
                            target.health -= 22;
                        }
                    }

                    // Overlord Gatling Cannon: Rapid anti-air and anti-infantry turret
                    if (unit.overlordUpgrade === 'gatling' && unit.upgTimer % 12 === 0) {
                        const target = enemyUnits.find(e => e.health > 0 && e.mesh.position.distanceTo(unit.mesh.position) <= 20.0);
                        if (target) {
                            spawnMuzzleFlash(unit.mesh.position, 0xffa502, 0.4);
                            spawnBulletTracer(unit.mesh.position, target.mesh.position, 0xf1c40f, 3.5);
                            playAudio('gatling_fire', {}, 'china');
                            target.health -= 18;
                        }
                    }

                    // Overlord Propaganda Tower: Heals nearby allies (+3 HP/s) and pulses soundwaves
                    if (unit.overlordUpgrade === 'propaganda' && unit.upgTimer % 60 === 0) {
                        units.forEach(ally => {
                            if (ally.health > 0 && ally.mesh.position.distanceTo(unit.mesh.position) <= 18.0) {
                                ally.health = Math.min(ally.maxHealth, ally.health + 4);
                            }
                        });
                        playAudio('propaganda_drone', {}, 'china');
                    }
                }
            });


            // Water surface ripple animation
            if (waterMesh) {
                const baseWaterY = (currentMapType === 'jungle' ? -1.2 : currentMapType === 'snow' ? -1.8 : currentMapType === 'city' ? -2.2 : -0.6);
                waterMesh.position.y = baseWaterY + Math.sin(animTime * 2.5) * 0.05;
            }

            // Dynamic military animations (Helicopter rotors, radar dishes, beacon lights, reactor core pulses)
            scene.traverse(obj => {
                if (obj.name === "comanche_rotor" || obj.name === "chinook_rotor1") {
                    obj.rotation.y += 0.45;
                } else if (obj.name === "chinook_rotor2") {
                    obj.rotation.y -= 0.45;
                } else if (obj.name === "radarDish") {
                    obj.rotation.y += 0.025;
                } else if (obj.name === "hazardBeacon") {
                    obj.visible = (Math.floor(animTime * 3) % 2 === 0);
                } else if (obj.name === "fusionCore" || obj.name === "nukeCore") {
                    const pulse = 1.0 + Math.sin(animTime * 4) * 0.18;
                    obj.scale.set(pulse, pulse, pulse);
                }
            });

            // Smooth cruising flight altitude for aircraft
            units.forEach(u => {
                if (u.isAir && u.health > 0) {
                    const flightY = u.mesh.userData.flightAltitude || 8.5;
                    u.mesh.position.y += (flightY - u.mesh.position.y) * 0.06;
                }
            });
            processCameraKeyboardPanning();
            updateTurretSystems();
            updateFogOfWar();
            processEnemyAIEngine();
            processEnemyMovement();
            processEnemyCombat();
            assignBuildersToConstruction();
            processBuildingFunctions();

            let constructionActive = false;
            structures.forEach(s => {
                if (!s.isBuilding) return;
                
                if (s.dozerRef) {
                    const dPos = s.dozerRef.mesh.position;
                    if (dPos.distanceTo(s.position) < (s.radius + 3.0)) {
                        s.dozerRef.taskState = 'Building';
                        s.buildProgress += 0.35;
                        
                        constructionActive = true;
                        const wp = s.position.clone(); wp.y += 4; wp.project(camera);
                        const sX = (wp.x * 0.5 + 0.5) * window.innerWidth; const sY = (-(wp.y * 0.5) + 0.5) * window.innerHeight;
                        
                        progressContainer.style.display = 'block';
                        progressContainer.style.left = sX + 'px'; progressContainer.style.top = sY + 'px';
                        progressFill.style.width = Math.min(100, s.buildProgress) + '%';

                        if (s.buildProgress >= 100) {
                            s.isBuilding = false; s.dozerRef.taskState = 'Idle';
                            s.dozerRef.targetStructure = null; s.dozerRef = null;
                            s.mesh.traverse(child => { if (child.isMesh && child.savedMaterial) child.material = child.savedMaterial; });
                        }
                    } else { s.dozerRef.targetPosition.copy(s.position); }
                }
            });
            if (!constructionActive) progressContainer.style.display = 'none';

            units.forEach(unit => {
                if ((unit.type !== 'truck' && unit.type !== 'worker') || unit.taskState !== 'Idle') return;
                const cargoHold = unit.mesh.getObjectByName("cargoHold");
                switch (unit.aiState) {
                    case 'MovingToDock':
                        if (!unit.supplyTarget || unit.supplyTarget.stock <= 0) {
                            unit.supplyTarget = findNearestSupplyPoint(unit.mesh.position);
                        }
                        if (unit.supplyTarget) {
                            unit.targetPosition.copy(unit.supplyTarget.position);
                            const distToDock = Math.hypot(unit.mesh.position.x - unit.supplyTarget.position.x, unit.mesh.position.z - unit.supplyTarget.position.z);
                            if (distToDock < 11.0) {
                                unit.aiState = 'Harvesting';
                                unit.timerState = 0;
                            }
                        } else {
                            unit.targetPosition.copy(unit.mesh.position);
                        }
                        break;
                    case 'Harvesting':
                        if (!unit.supplyTarget || unit.supplyTarget.stock <= 0) {
                            unit.supplyTarget = null;
                            unit.aiState = 'MovingToDock';
                            break;
                        }
                        unit.timerState += 1;
                        if (unit.timerState > 80) {
                            const loadCap = (unit.type === 'worker') ? 100 : 200;
                            unit.cargoLoaded = Math.min(loadCap, unit.supplyTarget.stock);
                            unit.supplyTarget.stock -= unit.cargoLoaded;
                            const visibleCrystals = Math.ceil(unit.supplyTarget.stock / unit.supplyTarget.maxStock * unit.supplyTarget.crystals.length);
                            unit.supplyTarget.crystals.forEach((crystal, index) => crystal.visible = index < visibleCrystals);
                            if (cargoHold) { cargoHold.visible = true; cargoHold.scale.set(1, 1, 1); }
                            unit.aiState = 'MovingToCenter';
                        }
                        break;
                    case 'MovingToCenter': {
                        const dropoffPosition = getSupplyDropoffPosition(unit.mesh.position);
                        unit.targetPosition.copy(dropoffPosition);
                        if (cargoHold && cargoHold.scale.y < 1.0) cargoHold.scale.y += 0.015;
                        const distToDropoff = Math.hypot(unit.mesh.position.x - dropoffPosition.x, unit.mesh.position.z - dropoffPosition.z);
                        if (distToDropoff < 9.0) {
                            unit.aiState = 'Depositing';
                            unit.timerState = 0;
                        }
                        break;
                    }
                    case 'Depositing':
                        unit.timerState += 1;
                        if (unit.timerState > 40) {
                            playerResources += (unit.cargoLoaded || 200);
                            unit.cargoLoaded = 0;
                            if (cargoHold) cargoHold.visible = false;
                            document.getElementById('resource-display').innerText = `$${playerResources}`;
                            showNotification(`Supplies delivered: +$${unit.type === 'worker' ? 100 : 200}`, 'success');
                            updateSidebar();
                            unit.aiState = 'MovingToDock';
                        }
                        break;
                }
            });

            units.forEach(unit => {
                if ((unit.type === 'dozer' || unit.type === 'worker') && unit.taskState === 'MovingToBuild' && unit.targetStructure) {
                    unit.targetPosition.copy(unit.targetStructure.position);
                }
            });

            for (let i = 0; i < units.length; i++) {
                for (let j = i + 1; j < units.length; j++) {
                    const u1 = units[i]; const u2 = units[j];
                    if (u1.isAir !== u2.isAir) continue; // Air units and ground units fly on different layers
                    const d2D = new THREE.Vector2(u1.mesh.position.x, u1.mesh.position.z).distanceTo(new THREE.Vector2(u2.mesh.position.x, u2.mesh.position.z));
                    const min = u1.radius + u2.radius;
                    if (d2D < min) {
                        const pMag = (min - d2D) * 0.5;
                        const pVec = new THREE.Vector3().subVectors(u1.mesh.position, u2.mesh.position); pVec.y = 0; pVec.normalize();
                        u1.mesh.position.addScaledVector(pVec, pMag); u2.mesh.position.addScaledVector(pVec, -pMag);
                    }
                }
            }

            units.forEach(unit => {
                // Embarking into transport vehicles
                if (unit.taskState === 'MovingToEmbark' && unit.embarkTarget) {
                    const transport = unit.embarkTarget;
                    if (transport.health > 0) {
                        unit.targetPosition.copy(transport.mesh.position);
                        const distToT = Math.hypot(unit.mesh.position.x - transport.mesh.position.x, unit.mesh.position.z - transport.mesh.position.z);
                        if (distToT < ((transport.radius || 1.4) + 2.5)) {
                            if (!transport.garrisoned) transport.garrisoned = [];
                            if (transport.garrisoned.length < transport.capacity) {
                                transport.garrisoned.push(unit);
                                unit.garrisonedIn = transport;
                                unit.mesh.visible = false;
                                unit.taskState = 'Idle';
                                unit.embarkTarget = null;
                                showNotification(`${unit.type} boarded ${transport.type} (${transport.garrisoned.length}/${transport.capacity}).`, 'success');
                                updateSidebar();
                            }
                        }
                    } else {
                        unit.taskState = 'Idle';
                        unit.embarkTarget = null;
                    }
                }

                if (unit.garrisonedIn || unit.taskState === 'Building') return;

                // =========================================================
                // AIRPLANE & HELICOPTER FLIGHT, LANDING & CIRCLING ENGINE
                // =========================================================
                if (unit.isAir) {
                    const cruiseAlt = unit.mesh.userData.flightAltitude || 8.5;
                    const groundY = getTerrainHeight(unit.mesh.position.x, unit.mesh.position.z);

                    // 1. Landed on Airfield Runway / Pad
                    if (unit.airState === 'landed') {
                        unit.mesh.position.y = groundY + 0.35;
                        unit.mesh.rotation.z = 0;
                        const distToDest = Math.hypot(unit.targetPosition.x - unit.mesh.position.x, unit.targetPosition.z - unit.mesh.position.z);
                        if (unit.combatTarget || (unit.waypoints && unit.waypoints.length > 0) || distToDest > 4.0) {
                            unit.airState = 'taking_off';
                        }
                        return; // Stays safely on ground
                    }

                    // 2. Taking off & climbing to cruising altitude
                    if (unit.airState === 'taking_off') {
                        const targetY = groundY + cruiseAlt;
                        unit.mesh.position.y += (targetY - unit.mesh.position.y) * 0.06;
                        if (unit.mesh.position.y >= targetY * 0.85) {
                            unit.airState = unit.combatTarget ? 'attacking' : 'flying';
                        }
                    }

                    // 3. Attacking an enemy target
                    if (unit.airState === 'attacking' && unit.combatTarget) {
                        const tPos = unit.combatTarget.position || (unit.combatTarget.mesh && unit.combatTarget.mesh.position);
                        if (tPos && unit.combatTarget.health > 0) {
                            const dxA = tPos.x - unit.mesh.position.x;
                            const dzA = tPos.z - unit.mesh.position.z;
                            const distToEnemy = Math.hypot(dxA, dzA);

                            // Aurora supersonic speed surge on attack run!
                            const planeSpeed = (unit.type === 'aurora') ? unit.speed * 1.55 : unit.speed;
                            const dirX = dxA / (distToEnemy || 1);
                            const dirZ = dzA / (distToEnemy || 1);

                            unit.mesh.position.x += dirX * planeSpeed;
                            unit.mesh.position.z += dirZ * planeSpeed;

                            const targetAngle = Math.atan2(-dirZ, dirX) + Math.PI / 2;
                            let diff = targetAngle - unit.mesh.rotation.y;
                            while (diff < -Math.PI) diff += Math.PI * 2;
                            while (diff > Math.PI) diff -= Math.PI * 2;
                            unit.mesh.rotation.y += diff * 0.22;
                            unit.mesh.rotation.z += (THREE.MathUtils.clamp(-diff * 1.8, -0.45, 0.45) - unit.mesh.rotation.z) * 0.15;

                            if (distToEnemy <= (unit.type === 'comanche' ? 22 : 25) && unit.attackCooldown === 0) {
                                executeWeaponFire(unit, unit.combatTarget);
                            }

                            if (distToEnemy < 6.0 || unit.combatTarget.health <= 0) {
                                if (unit.combatTarget.health <= 0) unit.combatTarget = null;
                                unit.patrolCenter.copy(unit.mesh.position);
                                unit.circleAngle = unit.mesh.rotation.y;
                                unit.airState = 'circling';
                            }
                        } else {
                            unit.combatTarget = null;
                            unit.airState = 'circling';
                        }
                    }

                    // 4. Flying toward designated destination
                    if (unit.airState === 'flying') {
                        const dx = unit.targetPosition.x - unit.mesh.position.x;
                        const dz = unit.targetPosition.z - unit.mesh.position.z;
                        const dist2D = Math.hypot(dx, dz);

                        if (dist2D > 2.5) {
                            const dirX = dx / dist2D;
                            const dirZ = dz / dist2D;
                            unit.mesh.position.x += dirX * unit.speed;
                            unit.mesh.position.z += dirZ * unit.speed;

                            const targetAngle = Math.atan2(-dirZ, dirX) + Math.PI / 2;
                            let diff = targetAngle - unit.mesh.rotation.y;
                            while (diff < -Math.PI) diff += Math.PI * 2;
                            while (diff > Math.PI) diff -= Math.PI * 2;
                            unit.mesh.rotation.y += diff * 0.18;
                            unit.mesh.rotation.z += (THREE.MathUtils.clamp(-diff * 1.6, -0.4, 0.4) - unit.mesh.rotation.z) * 0.12;
                        } else {
                            if (unit.waypoints && unit.waypoints.length > 0) {
                                unit.targetPosition.copy(unit.waypoints.shift());
                            } else {
                                unit.patrolCenter.copy(unit.mesh.position);
                                unit.circleAngle = unit.mesh.rotation.y;
                                unit.airState = 'circling';
                                unit.taskState = 'Idle';
                            }
                        }
                    }

                    // 5. Circling smoothly at location ("fly around slowly in circles at their location")
                    if (unit.airState === 'circling' || (unit.taskState === 'Idle' && !unit.combatTarget && unit.airState !== 'landed')) {
                        unit.airState = 'circling';
                        unit.circleAngle = (unit.circleAngle || 0) + (unit.speed * 0.045);
                        const orbitR = unit.circleRadius || 15.0;
                        const targetOrbitX = unit.patrolCenter.x + Math.cos(unit.circleAngle) * orbitR;
                        const targetOrbitZ = unit.patrolCenter.z + Math.sin(unit.circleAngle) * orbitR;

                        const dxO = targetOrbitX - unit.mesh.position.x;
                        const dzO = targetOrbitZ - unit.mesh.position.z;
                        const distO = Math.hypot(dxO, dzO);

                        const orbitSpeed = unit.speed * 0.85;
                        const dirX = dxO / (distO || 1);
                        const dirZ = dzO / (distO || 1);
                        unit.mesh.position.x += dirX * Math.min(distO, orbitSpeed);
                        unit.mesh.position.z += dirZ * Math.min(distO, orbitSpeed);

                        const targetAngle = Math.atan2(-dirZ, dirX) + Math.PI / 2;
                        let diff = targetAngle - unit.mesh.rotation.y;
                        while (diff < -Math.PI) diff += Math.PI * 2;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        unit.mesh.rotation.y += diff * 0.16;

                        unit.mesh.rotation.z += (-0.28 - unit.mesh.rotation.z) * 0.1;
                    }

                    // Maintain flight cruising altitude above ground
                    if (unit.airState !== 'landed') {
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

                // Smoothly return turret forward if no active combat target
                const idleTurret = unit.mesh.getObjectByName("turretSystem");
                if (idleTurret && !unit.combatTarget) {
                    idleTurret.rotation.y += (0 - idleTurret.rotation.y) * 0.1;
                }

                const stopBuffer = unit.taskState === 'MovingToBuild' && unit.targetStructure
                    ? unit.targetStructure.radius + 1.0
                    : (unit.isAir ? 1.0 : 0.4);

                // Use horizontal distance on XZ plane so altitude Y does not cause infinite distance overshoot/jitter
                const dx = unit.targetPosition.x - unit.mesh.position.x;
                const dz = unit.targetPosition.z - unit.mesh.position.z;
                const dist2D = Math.hypot(dx, dz);

                if (dist2D > stopBuffer) {
                    const dirX = dx / dist2D;
                    const dirZ = dz / dist2D;
                    const step = Math.min(dist2D, unit.speed);
                    unit.mesh.position.x += dirX * step;
                    unit.mesh.position.z += dirZ * step;

                    // Anti-Stuck Corner Watchdog: if stuck against a tight crevice or corner, nudge free!
                    if (!unit._lastPos) unit._lastPos = unit.mesh.position.clone();
                    if (!unit._stuckTimer) unit._stuckTimer = 0;
                    const dMoved = unit.mesh.position.distanceTo(unit._lastPos);
                    if (dMoved < 0.05) {
                        unit._stuckTimer++;
                        if (unit._stuckTimer > 20) {
                            unit.mesh.position.x += (Math.random() - 0.5) * 1.8;
                            unit.mesh.position.z += (Math.random() - 0.5) * 1.8;
                            unit._stuckTimer = 0;
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

                    // Aerodynamic banking tilt for aircraft into turns
                    if (unit.isAir) {
                        const targetBank = THREE.MathUtils.clamp(-diff * 1.6, -0.4, 0.4);
                        unit.mesh.rotation.z += (targetBank - unit.mesh.rotation.z) * 0.12;
                    }
                } else {
                    // Reached waypoint: advance to next waypoint if routing across bridges!
                    if (unit.waypoints && unit.waypoints.length > 0) {
                        const nextWp = unit.waypoints.shift();
                        unit.targetPosition.copy(nextWp);
                    } else if (unit.isAir) {
                        // Unit is at destination! Settle aircraft banking to zero without spinning or flipping
                        unit.mesh.rotation.z += (0 - unit.mesh.rotation.z) * 0.12;
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
                    unit.mesh.position.y = onBridge ? onBridge.deckY : groundY;
                }

                // Gentle soft repulsion for ground units to avoid overlapping and bumping
                if (!unit.isAir) {
                    for (let other of units) {
                        if (other === unit || other.isAir || other.garrisonedIn) continue;
                        const ddx = unit.mesh.position.x - other.mesh.position.x;
                        const ddz = unit.mesh.position.z - other.mesh.position.z;
                        const distU = Math.hypot(ddx, ddz);
                        const minU = (unit.radius || 1.3) + (other.radius || 1.3);
                        if (distU < minU && distU > 0.0001) {
                            const pushU = (minU - distU) * 0.25;
                            unit.mesh.position.x += (ddx / distU) * pushU;
                            unit.mesh.position.z += (ddz / distU) * pushU;
                        }
                    }
                }

                // Prevent driving through buildings, trees, skyscrapers or map edges
                resolveObstacleCollisions(unit);
            });

            processCombatScanning();
            processBaseDefenseCombat();

            updateHealthBars();

            enemyUnits = enemyUnits.filter(enemy => {
                if (enemy.health > 0) return true;
                scene.remove(enemy.mesh);
                createImpactExplosion(enemy.mesh.position);
                units.forEach(unit => {
                    if (unit.combatTarget === enemy) unit.combatTarget = null;
                });
                return false;
            });

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

            // Filter and remove neutralized enemy buildings with explosions & notifications
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

            const previousUnitCount = units.length;
            units = units.filter(unit => {
                if (unit.health > 0) return true;
                removeSelectionCircle(unit);
                scene.remove(unit.mesh);
                enemyUnits.forEach(enemy => {
                    if (enemy.combatTarget === unit) enemy.combatTarget = null;
                });
                return false;
            });
            if (units.length !== previousUnitCount) updateHUD();

            // Tactical Mission Victory / Defeat Objective Check
            if (isMatchActive && hasSpawnedInitialEnemyBase) {
                if (enemyStructures.length === 0 && enemyUnits.length === 0) {
                    isMatchActive = false;
                    showNotification("MISSION ACCOMPLISHED: ALL HOSTILE BUILDINGS & UNITS ELIMINATED!", "success");
                    const ticker = document.getElementById('tactical-message');
                    if (ticker) ticker.innerHTML = '<strong style="color:#55efc4;">VICTORY: Operational theater secured. All enemy structures neutralized!</strong>';
                } else if (structures.length === 0 && units.length === 0) {
                    isMatchActive = false;
                    showNotification("MISSION FAILED: ALL STRATEGIC ASSETS LOST!", "error");
                    const ticker = document.getElementById('tactical-message');
                    if (ticker) ticker.innerHTML = '<strong style="color:#ff4757;">CRITICAL DEFEAT: Command Center and all forward forces destroyed.</strong>';
                }
            }

            if (typeof renderRadarMinimap === 'function') renderRadarMinimap();
            renderer.render(scene, camera);
        }
function processEnemyMovement() {
    enemyUnits.forEach(enemy => {
        if (enemy.health <= 0) return;

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
            const step = Math.min(dist2D, enemy.speed);
            enemy.mesh.position.x += dirX * step;
            enemy.mesh.position.z += dirZ * step;
            enemy.mesh.rotation.y = Math.atan2(-dirZ, dirX) + Math.PI / 2;
        }

        // Match enemy ground height on hills & resolve obstacle collisions
        enemy.mesh.position.y = getTerrainHeight(enemy.mesh.position.x, enemy.mesh.position.z);
        resolveObstacleCollisions(enemy);
    });
}

function processEnemyCombat() {
    enemyUnits.forEach(enemy => {
        if (enemy.health <= 0) return;
        if (enemy.attackCooldown > 0) enemy.attackCooldown = Math.max(0, enemy.attackCooldown - combatDeltaScale);

        const target = enemy.combatTarget;
        if (!target || target.health <= 0) {
            enemy.combatTarget = null;
            return;
        }

        const targetPos = target.position || target.mesh.position;
        const targetRadius = target.radius || 0;
        if (enemy.mesh.position.distanceTo(targetPos) <= (enemy.scanRange + targetRadius) && enemy.attackCooldown === 0) {
            const turret = enemy.mesh.getObjectByName("turretSystem");
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
        