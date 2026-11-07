function animate() {
            requestAnimationFrame(animate);

            const nowTime = performance.now();
            const dt = Math.min(0.1, (nowTime - (window._lastCombatFrameTime || nowTime)) / 1000);
            window._lastCombatFrameTime = nowTime;
            combatDeltaScale = Math.min(6.0, dt * 60);

            const animTime = nowTime * 0.003;

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
                        // Training complete! Deploy unit at rally point or structure entrance
                        const spawnPos = structure.position.clone().add(new THREE.Vector3(structure.radius + 3.5, 0, structure.radius + 3.5));
                        spawnPos.y = typeof getTerrainHeight === 'function' ? getTerrainHeight(spawnPos.x, spawnPos.z) : 0;
                        const newUnit = spawnUnit(item.type, spawnPos);
                        if (newUnit.isAir) {
                            if (structure.rallyPoint) {
                                newUnit.targetPosition.copy(structure.rallyPoint);
                                newUnit.patrolCenter.copy(structure.rallyPoint);
                                newUnit.airState = 'flying';
                                newUnit.taskState = 'Moving';
                            } else {
                                newUnit.targetPosition.copy(spawnPos);
                                newUnit.patrolCenter.copy(spawnPos);
                                newUnit.airState = 'circling';
                                newUnit.taskState = 'Idle';
                            }
                        } else {
                            const targetRally = structure.rallyPoint ? structure.rallyPoint.clone() : spawnPos.clone().add(new THREE.Vector3(6, 0, 6));
                            newUnit.targetPosition.copy(targetRally);
                        }
                        playUSASound('construction');
                        showNotification('Unit deployed: ' + item.name, 'success');
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
                            const dmX = dMesh.position.x;
                            const dmZ = dMesh.position.z;
                            const maxDistSq = 16.0 * 16.0;
                            const enemyInf = getLivingUnits().find(e => {
                                if (e.health <= 0 || e.isAir || isFriendly(unit, e)) return false;
                                const dx = e.mesh.position.x - dmX;
                                const dz = e.mesh.position.z - dmZ;
                                return (dx * dx + dz * dz) <= maxDistSq;
                            });
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
                            const dmX = dMesh.position.x;
                            const dmZ = dMesh.position.z;
                            const maxDistSq = 22.0 * 22.0;
                            const enemyArmor = getLivingUnits().find(e => {
                                if (e.health <= 0 || e.isAir || isFriendly(unit, e)) return false;
                                const dx = e.mesh.position.x - dmX;
                                const dz = e.mesh.position.z - dmZ;
                                return (dx * dx + dz * dz) <= maxDistSq;
                            });
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
                    const uX = unit.mesh.position.x;
                    const uZ = unit.mesh.position.z;

                    // Overlord Bunker: 2 troops shoot 360 degrees
                    if (unit.overlordUpgrade === 'bunker' && unit.upgTimer % 45 === 0) {
                        const maxDistSq = 18.0 * 18.0;
                        const target = getLivingUnits().find(e => {
                            if (e.health <= 0 || isFriendly(unit, e)) return false;
                            const dx = e.mesh.position.x - uX;
                            const dz = e.mesh.position.z - uZ;
                            return (dx * dx + dz * dz) <= maxDistSq;
                        });
                        if (target) {
                            spawnBulletTracer(unit.mesh.position, target.mesh.position, 0xf39c12, 2.5);
                            playAudio('china_cannon', {}, 'china');
                            target.health -= 22;
                        }
                    }

                    // Overlord Gatling Cannon: Rapid anti-air and anti-infantry turret
                    if (unit.overlordUpgrade === 'gatling' && unit.upgTimer % 12 === 0) {
                        const maxDistSq = 20.0 * 20.0;
                        const target = getLivingUnits().find(e => {
                            if (e.health <= 0 || isFriendly(unit, e)) return false;
                            const dx = e.mesh.position.x - uX;
                            const dz = e.mesh.position.z - uZ;
                            return (dx * dx + dz * dz) <= maxDistSq;
                        });
                        if (target) {
                            spawnMuzzleFlash(unit.mesh.position, 0xffa502, 0.4);
                            spawnBulletTracer(unit.mesh.position, target.mesh.position, 0xf1c40f, 3.5);
                            playAudio('gatling_fire', {}, 'china');
                            target.health -= 18;
                        }
                    }

                    // Overlord Propaganda Tower: Heals nearby allies (+3 HP/s) and pulses soundwaves
                    if (unit.overlordUpgrade === 'propaganda' && unit.upgTimer % 60 === 0) {
                        const maxDistSq = 18.0 * 18.0;
                        units.forEach(ally => {
                            if (ally.health > 0) {
                                const dx = ally.mesh.position.x - uX;
                                const dz = ally.mesh.position.z - uZ;
                                if ((dx * dx + dz * dz) <= maxDistSq) {
                                    ally.health = Math.min(ally.maxHealth, ally.health + 4);
                                }
                            }
                        });
                    }
                }
            });


            // Water surface ripple animation
            if (waterMesh) {
                const baseWaterY = (currentMapType === 'jungle' ? -1.2 : currentMapType === 'snow' ? -1.8 : currentMapType === 'city' ? -2.2 : -0.6);
                waterMesh.position.y = baseWaterY + Math.sin(animTime * 2.5) * 0.05;
            }

            // Dynamic military & building animations (Authentic C&C Generals building movements)
            scene.traverse(obj => {
                if (obj.name === "comanche_rotor" || obj.name === "chinook_rotor1") {
                    obj.rotation.y += 0.45;
                } else if (obj.name === "chinook_rotor2") {
                    obj.rotation.y -= 0.45;
                } else if (obj.name === "radarDish") {
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

            // Paladin Tank Battle Drone Hover Animation & Field Repair
            units.forEach(u => {
                if (u.type === 'paladin' && u.health > 0) {
                    const drone = u.mesh.getObjectByName('paladinBattleDrone');
                    if (drone) {
                        drone.position.y = (2.4 / 0.09) + Math.sin(animTime * 3.5 + u.mesh.id) * 1.5;
                        const fan = drone.getObjectByName('fan') || drone.getObjectByName('FAN');
                        if (fan) fan.rotation.y += 0.55;

                        // Field repair: Battle Drone slowly repairs damaged Paladin (+3 HP per second)
                        if (u.health < u.maxHealth && buildingTick % 20 === 0) {
                            u.health = Math.min(u.maxHealth, u.health + 3);
                        }
                    }
                }
            });

            // Animate Cold Fusion Reactor pulsing blue rods
            const pulseBlue = 1.3 + Math.sin(animTime * 4.0) * 0.45;
            structures.forEach(s => {
                if ((s.type === 'power' || s.type === 'coldFusionReactor') && s.mesh && s.health > 0) {
                    s.mesh.traverse(c => {
                        if (c.isMesh && c.name && c.name.toLowerCase().includes('cylinder')) {
                            if (c.material && c.material.emissiveIntensity !== undefined) {
                                c.material.emissiveIntensity = pulseBlue;
                            }
                        }
                    });
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
                    const cruiseAlt = (unit.mesh.userData && unit.mesh.userData.flightAltitude) ? unit.mesh.userData.flightAltitude : 8.5;
                    const groundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(unit.mesh.position.x, unit.mesh.position.z) : 0;
                    const isHeli = (unit.type === 'comanche' || unit.type === 'chinook');

                    if (!unit.patrolCenter) unit.patrolCenter = unit.mesh.position.clone();
                    if (!unit.circleRadius) unit.circleRadius = isHeli ? 11.0 : 15.0;
                    if (unit.circleAngle === undefined) unit.circleAngle = Math.random() * Math.PI * 2;
                    if (!unit.airState || unit.airState === 'none') unit.airState = 'circling';

                    // Dynamic State Transition: Automatically react to player/AI orders!
                    if (unit.combatTarget && unit.combatTarget.health > 0) {
                        if (unit.airState === 'landed') {
                            unit.airState = 'taking_off';
                        } else if (unit.airState !== 'taking_off') {
                            unit.airState = 'attacking';
                        }
                    } else if (unit.airState === 'circling') {
                        // Switch from circling to flying ONLY if a new destination away from patrolCenter is commanded
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
                            unit.airState = (unit.combatTarget && unit.combatTarget.health > 0) ? 'attacking' : 'flying';
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
                            const maxBank = isHeli ? 0.0 : 0.45;
                            unit.mesh.rotation.z += (THREE.MathUtils.clamp(-diff * 1.8, -maxBank, maxBank) - unit.mesh.rotation.z) * 0.15;

                            if (distToEnemy <= (unit.type === 'comanche' ? 24 : 28) && unit.attackCooldown === 0) {
                                executeWeaponFire(unit, unit.combatTarget);
                            }

                            if (distToEnemy < 6.0 || unit.combatTarget.health <= 0) {
                                if (unit.combatTarget.health <= 0) {
                                    unit.combatTarget = null;
                                    unit.patrolCenter.copy(unit.mesh.position);
                                    unit.targetPosition.copy(unit.mesh.position);
                                    unit.circleAngle = Math.atan2(unit.mesh.position.z - unit.patrolCenter.z, unit.mesh.position.x - unit.patrolCenter.x);
                                    unit.airState = 'circling';
                                    unit.taskState = 'Idle';
                                } else {
                                    // Strafing turn pass: carry momentum past target
                                    unit.mesh.position.x += dirX * (planeSpeed * 1.4);
                                    unit.mesh.position.z += dirZ * (planeSpeed * 1.4);
                                }
                            }
                        } else {
                            unit.combatTarget = null;
                            unit.patrolCenter.copy(unit.mesh.position);
                            unit.targetPosition.copy(unit.mesh.position);
                            unit.circleAngle = Math.atan2(unit.mesh.position.z - unit.patrolCenter.z, unit.mesh.position.x - unit.patrolCenter.x);
                            unit.airState = 'circling';
                            unit.taskState = 'Idle';
                        }
                    }

                    // 4. Flying toward designated destination
                    if (unit.airState === 'flying') {
                        const dx = unit.targetPosition.x - unit.mesh.position.x;
                        const dz = unit.targetPosition.z - unit.mesh.position.z;
                        const dist2D = Math.hypot(dx, dz);

                        if (dist2D > 3.5) {
                            const dirX = dx / dist2D;
                            const dirZ = dz / dist2D;
                            unit.mesh.position.x += dirX * unit.speed;
                            unit.mesh.position.z += dirZ * unit.speed;

                            const targetAngle = Math.atan2(-dirZ, dirX) + Math.PI / 2;
                            let diff = targetAngle - unit.mesh.rotation.y;
                            while (diff < -Math.PI) diff += Math.PI * 2;
                            while (diff > Math.PI) diff -= Math.PI * 2;
                            unit.mesh.rotation.y += diff * 0.18;

                            const maxBank = isHeli ? 0.0 : 0.42;
                            unit.mesh.rotation.z += (THREE.MathUtils.clamp(-diff * 1.6, -maxBank, maxBank) - unit.mesh.rotation.z) * 0.12;
                        } else {
                            if (unit.waypoints && unit.waypoints.length > 0) {
                                unit.targetPosition.copy(unit.waypoints.shift());
                            } else {
                                unit.patrolCenter.copy(unit.targetPosition);
                                unit.circleAngle = Math.atan2(unit.mesh.position.z - unit.patrolCenter.z, unit.mesh.position.x - unit.patrolCenter.x);
                                unit.airState = 'circling';
                                unit.taskState = 'Idle';
                            }
                        }
                    }

                    // 5. Circling smoothly at location ("fly around slowly in circles at their location")
                    if (unit.airState === 'circling') {
                        const orbitR = unit.circleRadius || (isHeli ? 11.0 : 15.0);
                        const orbitSpeed = unit.speed * 0.70; // Smooth, slow loiter speed
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

                        // Align heading with circle tangent
                        const tangentX = -Math.sin(unit.circleAngle);
                        const tangentZ = Math.cos(unit.circleAngle);
                        const targetAngle = Math.atan2(-tangentZ, tangentX) + Math.PI / 2;

                        let diff = targetAngle - unit.mesh.rotation.y;
                        while (diff < -Math.PI) diff += Math.PI * 2;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        unit.mesh.rotation.y += diff * 0.16;

                        // Graceful inward banking roll for planes, STRICTLY HORIZONTAL for helicopters
                        const targetBank = isHeli ? 0.0 : -0.28;
                        unit.mesh.rotation.z += (targetBank - unit.mesh.rotation.z) * 0.12;
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
                            const flagCloth = targetTech.mesh ? targetTech.mesh.getObjectByName("neutralFlagCloth") : null;
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

                    // Authentic Tank Crushing (SquishCollide.cpp: heavy tanks crush enemy infantry)
                    const isCrusherTank = ['crusader', 'paladin', 'battlemaster', 'overlord', 'marauder', 'scorpion', 'tank'].includes(unit.type);
                    if (isCrusherTank) {
                        const hostiles = (typeof enemyUnits !== 'undefined') ? enemyUnits : [];
                        for (let enemy of hostiles) {
                            if (enemy.health > 0 && enemy.mesh && !isFriendly(unit, enemy) && (typeof getArmorCategory === 'function' ? getArmorCategory(enemy) === 'infantry' : ['ranger','redguard','rebel','infantry','rocket','rpg','tankhunter','pathfinder','jarmen','worker'].includes(enemy.type))) {
                                const infDist = Math.hypot(unit.mesh.position.x - enemy.mesh.position.x, unit.mesh.position.z - enemy.mesh.position.z);
                                if (infDist <= ((unit.radius || 1.8) + (enemy.radius || 0.6)) * 0.95) {
                                    const toX = enemy.mesh.position.x - unit.mesh.position.x;
                                    const toZ = enemy.mesh.position.z - unit.mesh.position.z;
                                    if (toX * dirX + toZ * dirZ > 0) { // moving towards infantry
                                        enemy.health = 0;
                                        if (typeof spawnSquishDecal === 'function') spawnSquishDecal(enemy.mesh.position);
                                        playAudio('infantry_squish');
                                        if (typeof showNotification === 'function') {
                                            showNotification(`Enemy infantry crushed under treads of ${unit.type.toUpperCase()}!`, 'info');
                                        }
                                        unit.kills = (unit.kills || 0) + 1;
                                        if (typeof checkVeterancyPromotion === 'function') checkVeterancyPromotion(unit);
                                    }
                                }
                            }
                        }
                    }

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
                // Authentic GLA Scrap Crate Drop Chance (SalvageCrateCollide.cpp)
                if (Math.random() < 0.65 && (typeof getArmorCategory === 'function' ? (getArmorCategory(enemy) === 'heavy_vehicle' || getArmorCategory(enemy) === 'light_vehicle') : !['ranger','redguard','rebel','infantry','rocket','rpg','tankhunter','pathfinder','jarmen','worker'].includes(enemy.type))) {
                    if (typeof spawnScrapCrate === 'function') spawnScrapCrate(enemy.mesh.position);
                }
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
                // Authentic GLA Scrap Crate Drop Chance (SalvageCrateCollide.cpp)
                if (Math.random() < 0.65 && (typeof getArmorCategory === 'function' ? (getArmorCategory(unit) === 'heavy_vehicle' || getArmorCategory(unit) === 'light_vehicle') : !['ranger','redguard','rebel','infantry','rocket','rpg','tankhunter','pathfinder','jarmen','worker'].includes(unit.type))) {
                    if (typeof spawnScrapCrate === 'function') spawnScrapCrate(unit.mesh.position);
                }
                enemyUnits.forEach(enemy => {
                    if (enemy.combatTarget === unit) enemy.combatTarget = null;
                });
                return false;
            });
            if (units.length !== previousUnitCount) updateHUD();

            // Neutral Tech Buildings Periodic Effects:
            if (isMatchActive) {
                if (window._techPassiveTimer === undefined) window._techPassiveTimer = 0;
                window._techPassiveTimer++;
                
                const allTechs = [...(typeof structures !== 'undefined' ? structures : []), ...(window.neutralStructures || [])];

                // 1. Tech Oil Derrick: +$200 every 12 seconds (~720 frames)
                if (window._techPassiveTimer % 720 === 0) {
                    const playerDerricks = allTechs.filter(s => s.type === 'techOilDerrick' && (s.capturedByTeam === playerTeamId || isFriendly({ teamId: playerTeamId }, s)) && s.health > 0);
                    if (playerDerricks.length > 0) {
                        const bonus = playerDerricks.length * 200;
                        playerResources += bonus;
                        const resEl = document.getElementById('resource-display');
                        if (resEl) resEl.innerText = `$${playerResources}`;
                        if (typeof showNotification === 'function') {
                            showNotification(`Tech Oil Derrick: +$${bonus} passive supply revenue received.`, 'success');
                        }
                    }
                }

                // 2. Tech Hospital: Passive regeneration for all friendly infantry (+2 HP every 60 frames / 1.0s)
                if (window._techPassiveTimer % 60 === 0) {
                    const hasHospital = allTechs.some(s => s.type === 'techHospital' && (s.capturedByTeam === playerTeamId || isFriendly({ teamId: playerTeamId }, s)) && s.health > 0);
                    if (hasHospital) {
                        units.forEach(u => {
                            if (u.health > 0 && u.health < u.maxHealth && !u.isAir && ['ranger','infantry','redguard','rebel','rocket','rpg','tankhunter','pathfinder','burton','jarmen','worker'].includes(u.type)) {
                                u.health = Math.min(u.maxHealth, u.health + 2);
                            }
                        });
                    }
                }

                // 3. GLA Foundation Holes Rebuilding Timer
                const glaHoles = [...structures, ...enemyStructures].filter(s => s.type === 'glaHole' && s.health > 0);
                glaHoles.forEach(hole => {
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
                });
            }

            // Tactical Mission Victory / Defeat Objective Check (Total Annihilation of Hostile Forces)
            if (isMatchActive && hasSpawnedInitialEnemyBase) {
                const remainingHostileStructures = [...structures, ...enemyStructures].filter(s => s.health > 0 && !isFriendly({ teamId: playerTeamId }, s));
                const remainingHostileCombatUnits = [...units, ...enemyUnits].filter(u => u.health > 0 && !isFriendly({ teamId: playerTeamId }, u) && !['truck', 'worker', 'dozer'].includes(u.type));
                const remainingFriendlyStructures = [...structures, ...enemyStructures].filter(s => s.health > 0 && isFriendly({ teamId: playerTeamId }, s));
                const remainingFriendlyUnits = [...units, ...enemyUnits].filter(u => u.health > 0 && isFriendly({ teamId: playerTeamId }, u));

                if (remainingHostileStructures.length === 0 && remainingHostileCombatUnits.length === 0) {
                    isMatchActive = false;
                    showNotification("MISSION ACCOMPLISHED: ALL HOSTILE FORCES ELIMINATED!", "success");
                    const ticker = document.getElementById('tactical-message');
                    if (ticker) ticker.innerHTML = '<strong style="color:#55efc4;">VICTORY: Operational theater secured. All hostile forces destroyed!</strong>';
                    if (typeof showVictoryBanner === 'function') showVictoryBanner();
                } else if (remainingFriendlyStructures.length === 0 && remainingFriendlyUnits.length === 0) {
                    isMatchActive = false;
                    showNotification("MISSION FAILED: ALL STRATEGIC ASSETS LOST!", "error");
                    const ticker = document.getElementById('tactical-message');
                    if (ticker) ticker.innerHTML = '<strong style="color:#ff4757;">CRITICAL DEFEAT: Command Center and all friendly forces destroyed.</strong>';
                    if (typeof showDefeatBanner === 'function') showDefeatBanner();
                }
            }

            if (typeof renderRadarMinimap === 'function') renderRadarMinimap();
            renderer.render(scene, camera);
        }
function processEnemyMovement() {
    enemyUnits.forEach(enemy => {
        if (enemy.health <= 0) return;

        // Authentic Aircraft Flight & Holding Pattern Circling
        if (enemy.isAir) {
            const isHeli = (enemy.type === 'comanche' || enemy.type === 'chinook');
            if (!enemy.patrolCenter) enemy.patrolCenter = enemy.mesh.position.clone();
            if (!enemy.circleRadius) enemy.circleRadius = isHeli ? 11.0 : 15.0;
            if (enemy.circleAngle === undefined) enemy.circleAngle = Math.random() * Math.PI * 2;
            if (!enemy.airState) enemy.airState = 'circling';

            const cruiseAlt = (enemy.mesh.userData && enemy.mesh.userData.flightAltitude) ? enemy.mesh.userData.flightAltitude : 8.5;
            const targetY = (typeof getTerrainHeight === 'function' ? getTerrainHeight(enemy.mesh.position.x, enemy.mesh.position.z) : 0) + cruiseAlt;
            enemy.mesh.position.y += (targetY - enemy.mesh.position.y) * 0.08;

            const target = enemy.combatTarget;
            const targetPos = target && (target.position || target.mesh.position);

            // 1. If actively attacking a target
            if (target && target.health > 0) {
                const dxT = targetPos.x - enemy.mesh.position.x;
                const dzT = targetPos.z - enemy.mesh.position.z;
                const distT = Math.hypot(dxT, dzT);
                if (distT > (enemy.scanRange || 24) * 0.7) {
                    const dirX = dxT / distT;
                    const dirZ = dzT / distT;
                    enemy.mesh.position.x += dirX * enemy.speed;
                    enemy.mesh.position.z += dirZ * enemy.speed;
                    enemy.mesh.rotation.y = Math.atan2(-dirZ, dirX) + Math.PI / 2;
                } else {
                    // Holding circle orbit around hostile target while engaging
                    enemy.circleAngle += isHeli ? 0.018 : 0.024;
                    const orbitRadius = (enemy.circleRadius || 12.0) * 0.75;
                    const cX = targetPos.x + Math.cos(enemy.circleAngle) * orbitRadius;
                    const cZ = targetPos.z + Math.sin(enemy.circleAngle) * orbitRadius;
                    enemy.mesh.position.x += (cX - enemy.mesh.position.x) * 0.06;
                    enemy.mesh.position.z += (cZ - enemy.mesh.position.z) * 0.06;
                    const fwdX = -Math.sin(enemy.circleAngle);
                    const fwdZ = Math.cos(enemy.circleAngle);
                    enemy.mesh.rotation.y = Math.atan2(-fwdZ, fwdX) + Math.PI / 2;
                }
                return;
            }

            // 2. Normal commanded flight or patrol
            const dx = enemy.targetPosition.x - enemy.mesh.position.x;
            const dz = enemy.targetPosition.z - enemy.mesh.position.z;
            const distToGoal = Math.hypot(dx, dz);

            if (distToGoal > 3.0) {
                const dirX = dx / distToGoal;
                const dirZ = dz / distToGoal;
                enemy.mesh.position.x += dirX * enemy.speed;
                enemy.mesh.position.z += dirZ * enemy.speed;
                enemy.mesh.rotation.y = Math.atan2(-dirZ, dirX) + Math.PI / 2;
                enemy.patrolCenter.copy(enemy.targetPosition);
            } else {
                // Smooth holding orbit circling around patrolCenter
                enemy.circleAngle += isHeli ? 0.015 : 0.022;
                const tX = enemy.patrolCenter.x + Math.cos(enemy.circleAngle) * enemy.circleRadius;
                const tZ = enemy.patrolCenter.z + Math.sin(enemy.circleAngle) * enemy.circleRadius;
                const cDx = tX - enemy.mesh.position.x;
                const cDz = tZ - enemy.mesh.position.z;
                const cDist = Math.hypot(cDx, cDz);
                if (cDist > 0.1) {
                    const cSpeed = enemy.speed * 0.85;
                    enemy.mesh.position.x += (cDx / cDist) * cSpeed;
                    enemy.mesh.position.z += (cDz / cDist) * cSpeed;
                    const fwdX = -Math.sin(enemy.circleAngle);
                    const fwdZ = Math.cos(enemy.circleAngle);
                    enemy.mesh.rotation.y = Math.atan2(-fwdZ, fwdX) + Math.PI / 2;
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
            const step = Math.min(dist2D, enemy.speed);
            enemy.mesh.position.x += dirX * step;
            enemy.mesh.position.z += dirZ * step;

            // Authentic Tank Crushing by AI vehicles (SquishCollide.cpp)
            const isEnemyCrusher = ['crusader', 'paladin', 'battlemaster', 'overlord', 'marauder', 'scorpion', 'tank'].includes(enemy.type);
            if (isEnemyCrusher) {
                for (let ally of units) {
                    if (ally.health > 0 && ally.mesh && !isFriendly(enemy, ally) && (typeof getArmorCategory === 'function' ? getArmorCategory(ally) === 'infantry' : ['ranger','redguard','rebel','infantry','rocket','rpg','tankhunter','pathfinder','jarmen','worker'].includes(ally.type))) {
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
        }

        // Match enemy ground height on hills & resolve obstacle collisions
        enemy.mesh.position.y = typeof getTerrainHeight === 'function' ? getTerrainHeight(enemy.mesh.position.x, enemy.mesh.position.z) : 0;
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
        
// =========================================================================
// AUTHENTIC POINT DEFENSE LASER SYSTEM (PointDefenseLaserUpdate.cpp)
// =========================================================================
function processPointDefenseLasers() {
    if (typeof activeMissiles === 'undefined' || activeMissiles.length === 0) return;
    const allLivingUnits = (typeof units !== 'undefined' && typeof enemyUnits !== 'undefined')
        ? [...units, ...enemyUnits] : [];

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
                    showNotification('★ Paladin Point Defense Laser intercepted hostile missile!', 'info');
                }
                break;
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

        for (let u of allLivingUnits) {
            if (u.health > 0 && u.mesh && ['technical', 'scorpion', 'marauder'].includes(u.type)) {
                const d = Math.hypot(u.mesh.position.x - crate.position.x, u.mesh.position.z - crate.position.z);
                if (d <= (u.radius || 1.5) + 1.2) {
                    // Pick up crate!
                    scene.remove(crate.mesh);
                    crate.mesh.traverse(child => {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) child.material.dispose();
                    });
                    activeScrapCrates.splice(cIdx, 1);
                    playAudio('scrap_pickup', {}, 'gla');
                    if (typeof spawnMuzzleFlash === 'function') spawnMuzzleFlash(u.mesh.position, 0x2ed573, 1.2);

                    u.salvageLevel = (u.salvageLevel || 0) + 1;
                    if (u.salvageLevel === 1) {
                        if (typeof showNotification === 'function' && typeof units !== 'undefined' && units.includes(u)) {
                            showNotification(`★ ${u.type.toUpperCase()} salvaged scrap: WEAPONS UPGRADED!`, 'success');
                        }
                    } else if (u.salvageLevel === 2) {
                        const oldMax = u.maxHealth;
                        u.maxHealth = Math.floor(u.maxHealth * 1.3);
                        u.health = u.maxHealth;
                        if (typeof showNotification === 'function' && typeof units !== 'undefined' && units.includes(u)) {
                            showNotification(`★★ ${u.type.toUpperCase()} salvaged scrap: HEAVY ARMOR MAXED!`, 'success');
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
