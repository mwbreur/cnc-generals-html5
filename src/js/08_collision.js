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

        function createStructureMeshForFaction(type, faction = 'usa') {
            let group;
            const f = faction || 'usa';
            if (type === 'center' || type === 'commandCenter') {
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
            return group;
        }
        window.createStructureMeshForFaction = createStructureMeshForFaction;

        function buildStructureMesh(type, pos, instant = false, rotationY = 0) {
            const f = selectedFaction;
            const group = createStructureMeshForFaction(type, f);
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
            const deckY = Math.max(hCenter, hN, hS, hE, hW) + 0.05;

            pos.y = deckY;
            group.position.copy(pos);
            group.rotation.y = rotationY || 0;

            // Level terrain heightmap under building footprint
            if (typeof registerFlattenedFootprint === 'function') {
                registerFlattenedFootprint(pos.x, pos.z, radius * 1.15, deckY);
            }

            
            const structNetId = (isMultiplayerActive ? (isMultiplayerHost ? 'HS_' : 'CS_') : 'PS_') + (++netIdSequence);
            const structObj = {
                type: type, mesh: group, position: pos.clone(),
                rotationY: rotationY || 0,
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
                    position: { x: pos.x, y: pos.y, z: pos.z, rotationY: rotationY || 0 },
                    netId: structNetId,
                    teamId: (typeof playerTeamId !== 'undefined' ? playerTeamId : 1),
                    faction: selectedFaction
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

        function spawnEnemyUnit(type = 'tank', position = new THREE.Vector3(25, 0, -25), netId = null, faction = null) {
            let mesh; let radius = 1.2; let speed = 0.14; let health = 450; let scanRange = 22; let isAir = false;

            // USA Forces
            if (type === 'tank' || type === 'crusader') { mesh = createCrusaderTankMesh(true); radius = 1.35; speed = 0.15; health = 480; scanRange = 24; }
            else if (type === 'paladin') { mesh = createPaladinTankMesh(true); radius = 1.35; speed = 0.14; health = 550; scanRange = 26; }
            else if (type === 'humvee') { mesh = createHumveeMesh(true); radius = 1.1; speed = 0.22; health = 280; scanRange = 26; }
            else if (type === 'ambulance') { mesh = createAmbulanceMesh(); radius = 1.1; speed = 0.18; health = 220; scanRange = 15; }
            else if (type === 'tomahawk') { mesh = createTomahawkMesh(true); radius = 1.3; speed = 0.11; health = 220; scanRange = 38; }
            else if (type === 'dozer') { mesh = createUSADozerMesh(); radius = 1.3; speed = 0.10; health = 300; scanRange = 18; }
            else if (type === 'truck') { mesh = createUSATruckMesh(); radius = 1.2; speed = 0.13; health = 260; scanRange = 16; }
            else if (type === 'chinook') { mesh = createChinookMesh(); radius = 1.6; speed = 0.22; health = 550; scanRange = 22; isAir = true; }
            else if (type === 'comanche') { mesh = createComancheMesh(); radius = 1.4; speed = 0.26; health = 340; scanRange = 28; isAir = true; }
            else if (type === 'mig') { mesh = createMigMesh(true); radius = 1.5; speed = 0.32; health = 280; scanRange = 30; isAir = true; }
            else if (type === 'raptor') { mesh = createRaptorMesh(true); radius = 1.5; speed = 0.32; health = 260; scanRange = 30; isAir = true; }
            else if (type === 'stealthfighter') { mesh = createStealthFighterMesh(); radius = 1.4; speed = 0.28; health = 240; scanRange = 32; isAir = true; }
            else if (type === 'aurora') { mesh = createAuroraMesh(); radius = 1.6; speed = 0.38; health = 180; scanRange = 35; isAir = true; }
            else if (type === 'infantry' || type === 'ranger') { mesh = createRangerMesh(); radius = 0.5; speed = 0.08; health = 100; scanRange = 16; }
            else if (type === 'rocket' || type === 'missiledefender') { mesh = createMissileDefenderMesh(); radius = 0.5; speed = 0.08; health = 120; scanRange = 24; }
            else if (type === 'pathfinder') { mesh = createRangerMesh(); radius = 0.5; speed = 0.09; health = 120; scanRange = 32; }
            else if (type === 'burton') { mesh = createBurtonMesh(); radius = 0.6; speed = 0.10; health = 350; scanRange = 24; }

            // China Forces
            else if (type === 'battlemaster') { mesh = createBattlemasterTankMesh(true); radius = 1.35; speed = 0.15; health = 460; scanRange = 24; }
            else if (type === 'overlord') { mesh = createOverlordTankMesh(true); radius = 2.1; speed = 0.09; health = 1100; scanRange = 28; }
            else if (type === 'gatling') { mesh = createGatlingTankMesh(true); radius = 1.3; speed = 0.16; health = 400; scanRange = 22; }
            else if (type === 'dragon') { mesh = createDragonTankMesh(true); radius = 1.3; speed = 0.15; health = 450; scanRange = 18; }
            else if (type === 'crawler') { mesh = createTroopCrawlerMesh(); radius = 1.4; speed = 0.15; health = 480; scanRange = 20; }
            else if (type === 'inferno') { mesh = createInfernoCannonMesh(); radius = 1.3; speed = 0.10; health = 220; scanRange = 36; }
            else if (type === 'nukecannon' || type === 'nuketank') { mesh = createNukeCannonMesh(); radius = 1.6; speed = 0.08; health = 260; scanRange = 42; }
            else if (type === 'redguard') { mesh = createRedGuardMesh(); radius = 0.5; speed = 0.08; health = 100; scanRange = 16; }
            else if (type === 'tankhunter') { mesh = createTankHunterMesh(); radius = 0.5; speed = 0.08; health = 120; scanRange = 24; }
            else if (type === 'hacker') { mesh = createHackerMesh(); radius = 0.5; speed = 0.07; health = 100; scanRange = 14; }
            else if (type === 'blacklotus') { mesh = createBlackLotusMesh(); radius = 0.5; speed = 0.10; health = 250; scanRange = 24; }

            // GLA Forces
            else if (type === 'worker') { mesh = createGLAWorkerMesh(); radius = 0.5; speed = 0.10; health = 150; scanRange = 16; }
            else if (type === 'technical') { mesh = createTechnicalMesh(true); radius = 1.1; speed = 0.22; health = 240; scanRange = 22; }
            else if (type === 'scorpion') { mesh = createScorpionTankMesh(true); radius = 1.25; speed = 0.16; health = 360; scanRange = 22; }
            else if (type === 'marauder') { mesh = createMarauderTankMesh(true); radius = 1.35; speed = 0.13; health = 520; scanRange = 24; }
            else if (type === 'buggy') { mesh = createRocketBuggyMesh(true); radius = 1.1; speed = 0.22; health = 160; scanRange = 30; }
            else if (type === 'quad') { mesh = createQuadCannonMesh(true); radius = 1.2; speed = 0.17; health = 300; scanRange = 24; }
            else if (type === 'toxintractor') { mesh = createToxinTractorMesh(true); radius = 1.2; speed = 0.14; health = 360; scanRange = 20; }
            else if (type === 'bombtruck') { mesh = createBombTruckMesh(true); radius = 1.2; speed = 0.18; health = 220; scanRange = 14; }
            else if (type === 'scud') { mesh = createScudLauncherMesh(true); radius = 1.4; speed = 0.10; health = 240; scanRange = 40; }
            else if (type === 'radarvan') { mesh = createRadarVanMesh(); radius = 1.1; speed = 0.16; health = 220; scanRange = 20; }
            else if (type === 'rebel') { mesh = createRebelMesh(); radius = 0.5; speed = 0.08; health = 100; scanRange = 16; }
            else if (type === 'rpg') { mesh = createRPGTrooperMesh(); radius = 0.5; speed = 0.08; health = 120; scanRange = 24; }
            else if (type === 'terrorist') { mesh = createTerroristMesh(); radius = 0.5; speed = 0.12; health = 80; scanRange = 8; }
            else if (type === 'mob') { mesh = createAngryMobMesh(); radius = 0.8; speed = 0.08; health = 280; scanRange = 18; }
            else if (type === 'hijacker') { mesh = createHijackerMesh(); radius = 0.5; speed = 0.11; health = 120; scanRange = 16; }
            else if (type === 'jarmen') { mesh = createJarmenKellMesh(); radius = 0.5; speed = 0.09; health = 220; scanRange = 34; }
            else {
                mesh = createBattlemasterTankMesh(true);
            }

            if (!mesh.userData || !mesh.userData.isW3D) {
                if (typeof isInfantryType === 'function' && isInfantryType(type)) {
                    mesh.scale.set(0.52, 0.52, 0.52);
                } else {
                    mesh.scale.set(1.35, 1.35, 1.35);
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
            const enemyObj = {
                type: type, mesh: mesh, selected: false, targetPosition: mesh.position.clone(),
                speed: speed, radius: radius, health: health, maxHealth: health,
                scanRange: scanRange, attackCooldown: 0, combatTarget: null,
                netId: enemyNetId,
                teamId: 2,
                ownerId: 'ai_1',
                isAI: true,
                isAir: isAir,
                airState: isAir ? 'circling' : 'none',
                patrolCenter: mesh.position.clone()
            };
            enemyUnits.push(enemyObj);
            return enemyObj;
        }

        function createImpactExplosion(position) {
            spawnExplosion(position, 0xff793f);
        }

        // =========================================================================
        