// BUILDING AND OBSTACLE COLLISION RESOLUTION
        // =========================================================================
        function resolveObstacleCollisions(unit) {
            if (unit.isAir) return; // Aircraft fly safely above ground structures and trees

            // 1. Structure Collisions
            for (let s of structures) {
                if (s.health <= 0) continue;
                // Allow assigned builder to reach foundation perimeter
                if (unit.targetStructure === s && (unit.taskState === 'Building' || unit.taskState === 'MovingToBuild')) continue;

                // CRITICAL HARVESTER FIX: Allow trucks and workers delivering supplies to reach docking bays!
                if ((unit.type === 'truck' || unit.type === 'worker') && (unit.aiState === 'MovingToCenter' || unit.aiState === 'Depositing')) {
                    const dropoffPos = getSupplyDropoffPosition(unit.mesh.position);
                    if (Math.hypot(s.position.x - dropoffPos.x, s.position.z - dropoffPos.z) < 1.0) continue;
                }

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

            // 2. Map Obstacle Collisions (Skyscrapers, Rocks, Dense Trees)
            for (let obs of mapObstacles) {
                const minDist = obs.radius + unit.radius;
                const dx = unit.mesh.position.x - obs.position.x;
                const dz = unit.mesh.position.z - obs.position.z;
                const dist2D = Math.hypot(dx, dz);

                if (dist2D < minDist && dist2D > 0.0001) {
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
                if (groundH < waterLvl) {
                    // Unit entered water without a bridge: push back to nearest dry land shore
                    let bestX = unit.mesh.position.x;
                    let bestZ = unit.mesh.position.z;
                    let found = false;
                    for (let r = 1; r <= 14; r += 1.5) {
                        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
                            const tx = unit.mesh.position.x + Math.cos(a) * r;
                            const tz = unit.mesh.position.z + Math.sin(a) * r;
                            if (getTerrainHeight(tx, tz) >= waterLvl) {
                                bestX = tx; bestZ = tz; found = true; break;
                            }
                        }
                        if (found) break;
                    }
                    if (found) {
                        unit.mesh.position.x = bestX;
                        unit.mesh.position.z = bestZ;
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

        function buildStructureMesh(type, pos, instant = false) {
            let group;
            const f = selectedFaction;
            if (type === 'center') {
                group = f === 'china' ? createChinaCommandCenter() : f === 'gla' ? createGLACommandCenter() : createUSACommandCenter();
            } else if (type === 'power' || type === 'nuclearReactor') {
                group = (f === 'china' || type === 'nuclearReactor') ? createChinaNuclearReactor() : createUSAColdFusionReactor();
            } else if (type === 'barracks') {
                group = f === 'china' ? createChinaBarracks() : f === 'gla' ? createGLABarracks(false) : createUSABarracks();
            } else if (type === 'fakeBarracks') {
                group = createGLABarracks(true);
            } else if (type === 'factory') {
                group = f === 'china' ? createChinaWarFactory() : f === 'gla' ? createGLAArmsDealer(false) : createUSAWarFactory();
            } else if (type === 'fakeArmsDealer') {
                group = createGLAArmsDealer(true);
            } else if (type === 'supplyCenter') {
                group = f === 'china' ? createChinaSupplyCenter() : createUSASupplyCenter();
            } else if (type === 'supplyStash') {
                group = createGLASupplyStash();
            } else if (type === 'supplyDrop') {
                group = createUSASupplyDropZone();
            } else if (type === 'airfield') {
                group = f === 'china' ? createChinaAirfield() : createUSAAirfield();
            } else if (type === 'strategyCenter') {
                group = createUSAStrategyCenter();
            } else if (type === 'detentionCamp') {
                group = createUSADetentionCamp();
            } else if (type === 'patriot') {
                group = createUSAPatriotSystem();
            } else if (type === 'particleCannon') {
                group = createUSAParticleCannon();
            } else if (type === 'bunker') {
                group = createChinaBunker();
            } else if (type === 'gatlingCannon') {
                group = createChinaGatlingCannon();
            } else if (type === 'speakerTower') {
                group = createChinaSpeakerTower();
            } else if (type === 'propagandaCenter') {
                group = createChinaPropagandaCenter();
            } else if (type === 'internetCenter') {
                group = createChinaInternetCenter();
            } else if (type === 'nukeSilo') {
                group = createChinaNukeSilo();
            } else if (type === 'tunnel') {
                group = createGLATunnelNetwork();
            } else if (type === 'stingerSite') {
                group = createGLAStingerSite();
            } else if (type === 'demoTrap') {
                group = createGLADemoTrap();
            } else if (type === 'blackMarket') {
                group = createGLABlackMarket();
            } else if (type === 'palace') {
                group = createGLAPalace();
            } else if (type === 'scudStorm') {
                group = createGLAScudStorm();
            } else {
                group = f === 'china' ? createChinaCommandCenter() : f === 'gla' ? createGLACommandCenter() : createUSACommandCenter();
            }

            group.position.copy(pos);
            
            const structNetId = (isMultiplayerActive ? (isMultiplayerHost ? 'HS_' : 'CS_') : 'PS_') + (++netIdSequence);
            const structObj = {
                type: type, mesh: group, position: pos.clone(),
                radius: getStructureFootprint(type).radius,
                isBuilding: !instant, buildProgress: instant ? 100 : 0, dozerRef: null,
                health: 1200, maxHealth: 1200,
                netId: structNetId,
                teamId: (typeof playerTeamId !== 'undefined' ? playerTeamId : 1),
                ownerId: 'player',
                isAI: false
            };

            if (isMultiplayerActive && netConn && netConn.open) {
                broadcastNetPacket({
                    type: 'build_structure',
                    structType: type,
                    position: { x: pos.x, y: pos.y, z: pos.z },
                    netId: structNetId
                });
            }

            if (!instant) {
                group.traverse(child => {
                    if (child.isMesh) {
                        child.savedMaterial = child.material;
                        child.material = new THREE.MeshBasicMaterial({ color: 0x00ffcc, wireframe: true, transparent: true, opacity: 0.45 });
                    }
                });
            }

            scene.add(group);
            structures.push(structObj);
            return structObj;
        }

        function spawnEnemyUnit(type = 'tank', position = new THREE.Vector3(25, 0, -25)) {
            let mesh; let radius = 1.35; let speed = 0.14; let health = 450; let scanRange = 24;
            if (type === 'tank' || type === 'crusader') {
                mesh = createCrusaderTankMesh(true);
            } else if (type === 'battlemaster') {
                mesh = createBattlemasterTankMesh(true);
            } else if (type === 'overlord') {
                mesh = createOverlordTankMesh(true); radius = 2.0; health = 1000;
            } else if (type === 'gatling') {
                mesh = createGatlingTankMesh(true);
            } else if (type === 'quad') {
                mesh = createQuadCannonMesh(true);
            } else if (type === 'buggy') {
                mesh = createRocketBuggyMesh(true);
            } else if (type === 'humvee') {
                mesh = createHumveeMesh(true);
            } else {
                mesh = createBattlemasterTankMesh(true);
            }
            mesh.position.copy(position);
            scene.add(mesh);

            const enemyNetId = arguments[2] || ((isMultiplayerActive ? (isMultiplayerHost ? 'C_' : 'H_') : 'E_') + (++netIdSequence));
            const enemyObj = {
                type: type, mesh: mesh, selected: false, targetPosition: mesh.position.clone(),
                speed: speed, radius: radius, health: health, maxHealth: health,
                scanRange: scanRange, attackCooldown: 0, combatTarget: null,
                netId: enemyNetId,
                teamId: 2,
                ownerId: 'ai_1',
                isAI: true
            };
            enemyUnits.push(enemyObj);
            return enemyObj;
        }

        function createImpactExplosion(position) {
            spawnExplosion(position, 0xff793f);
        }

        // =========================================================================
        