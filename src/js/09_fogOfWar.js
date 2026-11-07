// FOG OF WAR (COMMAND & CONQUER SHROUD & DYNAMIC VISION ENGINE)
        // =========================================================================
        let fogCanvas = null;
        let fogCtx = null;
        let fogTexture = null;
        let fogMesh = null;
        let fogGrid = null; // Uint8Array: 0 = Shroud, 1 = Fog (explored), 2 = Visible
        const FOG_RES = 128;
        let fogUpdateTick = 0;
        const activeVisionBeacons = [];

        function revealFogOfWarAt(pos, radius = 35, duration = 1800) {
            activeVisionBeacons.push({
                x: pos.x,
                z: pos.z,
                radius: radius,
                life: duration
            });
        }

        function initFogOfWar(mapSize) {
            if (fogMesh) {
                scene.remove(fogMesh);
                if (fogMesh.geometry) fogMesh.geometry.dispose();
                if (fogMesh.material) fogMesh.material.dispose();
                fogMesh = null;
            }

            fogCanvas = document.createElement('canvas');
            fogCanvas.width = FOG_RES;
            fogCanvas.height = FOG_RES;
            fogCtx = fogCanvas.getContext('2d');

            // Fill completely black with 100% opacity (Initial Shroud)
            fogCtx.fillStyle = 'rgba(0, 0, 0, 1.0)';
            fogCtx.fillRect(0, 0, FOG_RES, FOG_RES);

            fogGrid = new Uint8Array(FOG_RES * FOG_RES); // All 0 (Shroud)

            fogTexture = new THREE.CanvasTexture(fogCanvas);
            fogTexture.generateMipmaps = false;
            fogTexture.minFilter = THREE.LinearFilter;
            fogTexture.magFilter = THREE.LinearFilter;

            // Subdivided terrain-hugging mesh: contours smoothly over hills, dunes, mesas and valleys
            const segments = 64;
            const fogGeo = new THREE.PlaneGeometry(mapSize * 1.02, mapSize * 1.02, segments, segments);
            fogGeo.rotateX(-Math.PI / 2);
            const posAttr = fogGeo.attributes.position;
            for (let i = 0; i < posAttr.count; i++) {
                const vx = posAttr.getX(i);
                const vz = posAttr.getZ(i);
                const th = typeof getTerrainHeight === 'function' ? getTerrainHeight(vx, vz) : 0;
                posAttr.setY(i, th + 1.2);
            }
            fogGeo.computeVertexNormals();

            const fogMat = new THREE.MeshBasicMaterial({
                map: fogTexture,
                transparent: true,
                opacity: 0.94,
                depthWrite: false
            });
            fogMesh = new THREE.Mesh(fogGeo, fogMat);
            fogMesh.position.set(0, 0, 0);
            fogMesh.renderOrder = 99;
            scene.add(fogMesh);
        }

        function updateFogOfWar() {
            if (!fogCanvas || !fogCtx || !fogMesh) return;
            fogUpdateTick++;
            if (fogUpdateTick % 4 !== 0) return; // Smooth 60fps pacing

            const mapSize = currentMapSize;
            const halfMap = mapSize * 0.5;

            // 1. Demote previous Visible (2) cells to Explored Fog (1)
            for (let i = 0; i < fogGrid.length; i++) {
                if (fogGrid[i] === 2) fogGrid[i] = 1;
            }

            // 2. Mark cells currently in line of sight of any friendly unit or structure (including Allied AI & General Powers)
            const visionSources = [
                ...units.filter(u => u.health > 0 && !u.garrisonedIn),
                ...structures.filter(s => s.health > 0 && !s.isBuilding),
                ...enemyUnits.filter(u => u.health > 0 && !u.garrisonedIn && isFriendly({ teamId: playerTeamId }, u)),
                ...enemyStructures.filter(s => s.health > 0 && !s.isBuilding && isFriendly({ teamId: playerTeamId }, s))
            ];

            for (let i = activeVisionBeacons.length - 1; i >= 0; i--) {
                const b = activeVisionBeacons[i];
                b.life--;
                visionSources.push({
                    position: { x: b.x, z: b.z },
                    scanRange: b.radius
                });
                if (b.life <= 0) activeVisionBeacons.splice(i, 1);
            }

            visionSources.forEach(src => {
                const pos = src.position || src.mesh.position;
                const range = src.scanRange || (src.radius ? src.radius + 18 : 26);
                const cx = Math.floor(((pos.x + halfMap) / mapSize) * FOG_RES);
                const cy = Math.floor(((pos.z + halfMap) / mapSize) * FOG_RES);
                const rCells = Math.ceil((range / mapSize) * FOG_RES);

                const r2 = rCells * rCells;
                const minX = Math.max(0, cx - rCells);
                const maxX = Math.min(FOG_RES - 1, cx + rCells);
                const minY = Math.max(0, cy - rCells);
                const maxY = Math.min(FOG_RES - 1, cy + rCells);

                for (let y = minY; y <= maxY; y++) {
                    const dy = y - cy;
                    const idxRow = y * FOG_RES;
                    for (let x = minX; x <= maxX; x++) {
                        const dx = x - cx;
                        if (dx * dx + dy * dy <= r2) {
                            fogGrid[idxRow + x] = 2; // Direct Line of Sight!
                        }
                    }
                }
            });

            // 3. Render Shroud & Fog canvas
            fogCtx.clearRect(0, 0, FOG_RES, FOG_RES);
            fogCtx.fillStyle = 'rgba(10, 14, 18, 0.62)'; // Explored fog
            fogCtx.fillRect(0, 0, FOG_RES, FOG_RES);

            fogCtx.fillStyle = 'rgba(5, 7, 10, 1.0)'; // Unexplored pitch shroud
            for (let y = 0; y < FOG_RES; y++) {
                const idxRow = y * FOG_RES;
                for (let x = 0; x < FOG_RES; x++) {
                    if (fogGrid[idxRow + x] === 0) {
                        fogCtx.fillRect(x, y, 1, 1);
                    }
                }
            }

            // 4. Punch soft circular vision holes for currently visible areas
            fogCtx.globalCompositeOperation = 'destination-out';
            visionSources.forEach(src => {
                const pos = src.position || src.mesh.position;
                const range = src.scanRange || (src.radius ? src.radius + 18 : 26);
                const cx = ((pos.x + halfMap) / mapSize) * FOG_RES;
                const cy = ((pos.z + halfMap) / mapSize) * FOG_RES;
                const rPx = (range / mapSize) * FOG_RES;

                const grad = fogCtx.createRadialGradient(cx, cy, rPx * 0.45, cx, cy, rPx);
                grad.addColorStop(0, 'rgba(0, 0, 0, 1.0)');
                grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
                fogCtx.fillStyle = grad;
                fogCtx.beginPath();
                fogCtx.arc(cx, cy, rPx, 0, Math.PI * 2);
                fogCtx.fill();
            });
            fogCtx.globalCompositeOperation = 'source-over';

            fogTexture.needsUpdate = true;

            // 5. Hide Hostile Units & Hostile Structures when out of direct Line of Sight! (Allies stay visible)
            enemyUnits.forEach(enemy => {
                if (!enemy.mesh) return;
                if (isFriendly({ teamId: playerTeamId }, enemy)) {
                    enemy.mesh.visible = true;
                    return;
                }
                const cx = Math.floor(((enemy.mesh.position.x + halfMap) / mapSize) * FOG_RES);
                const cy = Math.floor(((enemy.mesh.position.z + halfMap) / mapSize) * FOG_RES);
                const isVisible = (cx >= 0 && cx < FOG_RES && cy >= 0 && cy < FOG_RES)
                    ? (fogGrid[cy * FOG_RES + cx] === 2)
                    : false;
                enemy.mesh.visible = isVisible;
            });

            enemyStructures.forEach(es => {
                if (!es.mesh) return;
                if (isFriendly({ teamId: playerTeamId }, es)) {
                    es.mesh.visible = true;
                    return;
                }
                const cx = Math.floor(((es.position.x + halfMap) / mapSize) * FOG_RES);
                const cy = Math.floor(((es.position.z + halfMap) / mapSize) * FOG_RES);
                const isVisible = (cx >= 0 && cx < FOG_RES && cy >= 0 && cy < FOG_RES)
                    ? (fogGrid[cy * FOG_RES + cx] >= 1) // Structures visible once explored
                    : false;
                es.mesh.visible = isVisible;
            });
        }

                const factionCatalog = {
            usa: {
                label: 'USA', builder: 'dozer', starter: ['dozer', 'tank', 'truck'],
                barracks: {
                    infantry: ['Ranger', 100, 'Assault rifleman with flashbangs & capture ability.'],
                    rocket: ['Missile Defender', 175, 'Laser-guided anti-armor & anti-air missile infantry.'],
                    pathfinder: ['Pathfinder', 600, 'Elite sniper infantry, detects stealth.'],
                    burton: ['Colonel Burton', 1500, 'Elite commando with C4 charges and combat knife.']
                },
                factory: {
                    crusader: ['Crusader Tank', 400, 'Main battle tank with 105mm cannon.'],
                    paladin: ['Paladin Tank', 600, 'Advanced battle tank with point-defense laser.'],
                    humvee: ['Humvee', 350, 'Fast scout transport. Carries 5 infantry.'],
                    ambulance: ['Ambulance', 300, 'Field medical unit. Cleans toxins & heals nearby troops.'],
                    tomahawk: ['Tomahawk Missile', 900, 'Long-range cruise missile mobile artillery.']
                },
                airfield: {
                    raptor: ['Raptor', 1100, 'Supersonic strike jet with laser-guided missiles.'],
                    stealthfighter: ['Stealth Fighter', 1400, 'Radar-invisible ground attack stealth jet.'],
                    aurora: ['Aurora Bomber', 1800, 'Mach-4 supersonic invincible bomb-run aircraft.'],
                    comanche: ['Comanche', 1000, 'Attack gunship helicopter with rocket pods.'],
                    chinook: ['Chinook', 1200, 'Heavy supply and troop transport helicopter.']
                },
                supplyCenter: {
                    truck: ['Supply Truck', 600, 'Gathers supplies from resource depots.']
                },
                commandCenter: {
                    dozer: ['Construction Dozer', 500, 'Constructs and repairs USA military installations.']
                },
                support: ['Construction Dozer', 'Pilot (unbuildable)', 'Scout Drone (attachment)', 'Battle Drone (attachment)']
            },
            china: {
                label: 'China', builder: 'dozer', starter: ['dozer', 'gatling', 'truck'],
                barracks: {
                    redguard: ['Red Guard', 80, 'Assault rifle infantry trained in pairs.'],
                    tankhunter: ['Tank Hunter', 150, 'Anti-armor rocket infantry with TNT charges.'],
                    hacker: ['Hacker', 600, 'Stealth hacker, disables buildings & drains internet funds.'],
                    blacklotus: ['Black Lotus', 1500, 'Elite hacker hero, captures structures & disables armor.']
                },
                factory: {
                    battlemaster: ['Battle Master Tank', 400, 'Standard frontline battle tank.'],
                    dragon: ['Dragon Tank', 500, 'Flamethrower tank, flushes out garrisoned structures.'],
                    gatling: ['Gatling Tank', 500, 'Twin 20mm rotary anti-air/anti-infantry tank.'],
                    crawler: ['Troop Crawler', 700, 'Armored personnel carrier with 8 Red Guard soldiers.'],
                    overlord: ['Overlord Tank', 1500, 'Super-heavy double-barrel dreadnought tank.'],
                    inferno: ['Inferno Cannon', 900, 'Napalm siege artillery creating firestorms.'],
                    nukecannon: ['Nuke Cannon', 1800, 'Mobile tactical nuclear siege artillery.']
                },
                airfield: {
                    raptor: ['MiG-29 Fighter', 1100, 'High-speed interceptor jet with napalm missiles.']
                },
                supplyCenter: {
                    truck: ['Supply Truck', 600, 'Gathers supplies from resource depots.']
                },
                commandCenter: {
                    dozer: ['Construction Dozer', 500, 'Constructs and repairs Chinese military installations.']
                },
                support: ['Construction Dozer']
            },
            gla: {
                label: 'GLA', builder: 'worker', starter: ['worker', 'scorpion', 'technical'],
                barracks: {
                    rebel: ['Rebel', 80, 'Guerrilla assault infantry with capture ability.'],
                    rpg: ['RPG Trooper', 150, 'Anti-armor guerrilla rocket trooper.'],
                    terrorist: ['Terrorist', 200, 'Suicide explosive infantry with devastating blast.'],
                    mob: ['Angry Mob', 700, 'Armed crowd throwing Molotov cocktails and bullets.'],
                    hijacker: ['Hijacker', 800, 'Stealth commando, steals enemy vehicles on contact.'],
                    jarmen: ['Jarmen Kell', 1500, 'Elite sniper hero, snipes vehicle drivers leaving them empty.']
                },
                factory: {
                    radarvan: ['Radar Van', 500, 'Mobile radar van providing map radar & stealth detection.'],
                    technical: ['Technical', 300, 'Fast guerrilla pickup with mounted heavy machine gun.'],
                    scorpion: ['Scorpion Tank', 450, 'Light combat tank with rocket upgrade.'],
                    quad: ['Quad Cannon', 450, 'Four 23mm anti-aircraft and anti-infantry autocannons.'],
                    toxintractor: ['Toxin Tractor', 650, 'Corrosive chemical sprayer, cleans garrisoned buildings.'],
                    marauder: ['Marauder Tank', 800, 'Heavy salvage tank with double-cannon upgrades.'],
                    buggy: ['Rocket Buggy', 700, 'High-speed hit-and-run mobile rocket artillery.'],
                    bombtruck: ['Bomb Truck', 600, 'Disguised suicide vehicle packed with explosives.'],
                    scud: ['SCUD Launcher', 1200, 'Mobile tactical ballistic missile with anthrax payload.']
                },
                airfield: {},
                supplyCenter: {
                    worker: ['Worker', 200, 'Gathers supplies and builds GLA installations.']
                },
                commandCenter: {
                    worker: ['Worker', 200, 'Gathers supplies and builds GLA installations.']
                },
                support: ['Worker (builder and resource gatherer)']
            }
        };

        const buildingUpgradesCatalog = {
            usa: {
                barracks: [
                    { id: 'upg_flashbang', name: 'FLASHBANG GRENADES', cost: 800, desc: 'Equips Rangers with flashbangs to instantly breach & clear garrisons.' },
                    { id: 'upg_capture', name: 'CAPTURE BUILDING', cost: 1000, desc: 'Enables Rangers and infantry to capture hostile structures.' }
                ],
                factory: [
                    { id: 'upg_tow', name: 'TOW MISSILES', cost: 800, desc: 'Equips Humvees with roof-mounted anti-armor TOW missiles.' }
                ],
                airfield: [
                    { id: 'upg_laser_missiles', name: 'LASER GUIDED MISSILES', cost: 1000, desc: 'Increases Raptor and Comanche missile damage by +25%.' },
                    { id: 'upg_bunker_busters', name: 'BUNKER BUSTERS', cost: 500, desc: 'Equips Aurora Bombers to penetrate & clear fortified bunkers.' }
                ]
            },
            china: {
                barracks: [
                    { id: 'upg_capture', name: 'CAPTURE BUILDING', cost: 1000, desc: 'Enables Red Guard to capture hostile structures.' },
                    { id: 'upg_redguard_training', name: 'RED GUARD TRAINING', cost: 800, desc: 'All newly trained Red Guard deploy with Veteran rank.' }
                ],
                factory: [
                    { id: 'upg_black_napalm', name: 'BLACK NAPALM', cost: 1000, desc: 'Increases Dragon Tank and Inferno Cannon fire damage by +30%.' },
                    { id: 'upg_chain_guns', name: 'CHAIN GUNS', cost: 1000, desc: 'Equips Gatling Tanks with depleted uranium ammo (+25% damage).' }
                ],
                airfield: [
                    { id: 'upg_black_napalm', name: 'BLACK NAPALM', cost: 1000, desc: 'Equips MiG-29s with high-temperature black napalm missiles.' }
                ]
            },
            gla: {
                barracks: [
                    { id: 'upg_capture', name: 'CAPTURE BUILDING', cost: 1000, desc: 'Enables Rebels to capture enemy structures.' },
                    { id: 'upg_camouflage', name: 'CAMOUFLAGE', cost: 1000, desc: 'Grants Rebel infantry permanent stealth while stationary.' }
                ],
                factory: [
                    { id: 'upg_scorpion_rocket', name: 'SCORPION ROCKET', cost: 1000, desc: 'Equips Scorpion Tanks with roof-mounted anti-armor rockets.' },
                    { id: 'upg_junk_repair', name: 'JUNK REPAIR', cost: 1000, desc: 'Enables all GLA vehicles to automatically auto-regenerate armor.' }
                ],
                airfield: []
            }
        };
        const factionBuildings = {
            usa: [
                ['power', 'Cold Fusion Reactor', 300], ['barracks', 'Barracks', 400], ['factory', 'War Factory', 700],
                ['supplyCenter', 'Supply Center', 500], ['supplyDrop', 'Supply Drop Zone', 1200], ['airfield', 'Air Field', 1000],
                ['strategyCenter', 'Strategy Center', 1500], ['detentionCamp', 'Detention Camp', 900],
                ['patriot', 'Patriot Missile System', 800], ['particleCannon', 'Particle Cannon', 2500]
            ],
            china: [
                ['barracks', 'Barracks', 400], ['factory', 'War Factory', 700], ['supplyCenter', 'Supply Center', 500],
                ['airfield', 'Air Field', 1000], ['internetCenter', 'Internet Center', 1000], ['nuclearReactor', 'Nuclear Reactor', 500],
                ['propagandaCenter', 'Propaganda Center', 1200], ['bunker', 'Bunker', 500], ['gatlingCannon', 'Gatling Cannon', 700],
                ['speakerTower', 'Speaker Tower', 600], ['nukeSilo', 'Nuclear Missile Silo', 2500]
            ],
            gla: [
                ['barracks', 'Barracks', 400], ['factory', 'Arms Dealer', 700], ['supplyStash', 'Supply Stash', 500],
                ['blackMarket', 'Black Market', 1200], ['tunnel', 'Tunnel Network', 700], ['stingerSite', 'Stinger Site', 700],
                ['demoTrap', 'Demo Trap', 300], ['palace', 'Palace', 1500], ['fakeBarracks', 'Fake Barracks', 200],
                ['fakeArmsDealer', 'Fake Arms Dealer', 350], ['scudStorm', 'SCUD Storm', 2500]
            ]
        };
        let unitRoster = {};

        function selectFaction(faction, button) {
            selectedFaction = faction;
            // Synchronize the top 3 big faction buttons
            document.querySelectorAll('.faction-card').forEach(card => {
                card.classList.toggle('active', card.getAttribute('data-faction') === faction);
            });

            // Update faction overview description
            const roster = factionCatalog[faction];
            if (roster) {
                const infantry = Object.values(roster.barracks).map(unit => unit[0]).join(', ');
                const vehicles = Object.values(roster.factory).map(unit => unit[0]).join(', ');
                const overviewEl = document.getElementById('faction-overview');
                if (overviewEl) {
                    overviewEl.textContent = `${roster.label} forces — Infantry: ${infantry}. Vehicles & aircraft: ${vehicles}. Support: ${roster.support.join(', ')}.`;
                }
            }

            // Synchronize player/host slot 0 data model
            if (typeof spSlots !== 'undefined' && spSlots[0]) {
                spSlots[0].faction = faction;
            }
            if (typeof mpSlots !== 'undefined' && mpSlots[0]) {
                mpSlots[0].faction = faction;
            }

            // Synchronize the small dropdown selection boxes
            const spSelect = document.getElementById('single-slot-0-faction') || document.getElementById('sp-slot-0-faction');
            if (spSelect) spSelect.value = faction;

            const mpSelect = document.getElementById('multiplayer-slot-0-faction') || document.getElementById('mp-slot-0-faction');
            if (mpSelect) mpSelect.value = faction;

            if (typeof syncMpLobbyToPeer === 'function') {
                syncMpLobbyToPeer();
            }
        }



        function getStructureCost(type) {
            const entry = factionBuildings[selectedFaction].find(building => building[0] === type);
            return entry ? entry[2] : 0;
        }

        function getStructureFootprint(type) {
            const sizes = {
                center: [12, 8, 11], power: [8, 6, 8], barracks: [8, 5.5, 7], factory: [12, 5, 9],
                supplyCenter: [11, 5, 9], supplyDrop: [10, 7, 10], airfield: [14, 4, 12], strategyCenter: [11, 7, 10],
                detentionCamp: [8, 5, 7], patriot: [6, 5, 6], particleCannon: [12, 9, 12], nuclearReactor: [8, 7, 8],
                internetCenter: [9, 5, 8], propagandaCenter: [10, 6, 9], bunker: [7, 4, 7], gatlingCannon: [5, 7, 5],
                speakerTower: [5, 9, 5], nukeSilo: [12, 9, 12], supplyStash: [9, 5, 8], blackMarket: [10, 5, 9],
                tunnel: [8, 4, 8], stingerSite: [6, 6, 6], demoTrap: [4, 1.5, 4], palace: [12, 7, 10],
                fakeBarracks: [8, 5.5, 7], fakeArmsDealer: [12, 5, 9], scudStorm: [12, 9, 12]
            };
            const [baseW, baseH, baseD] = sizes[type] || [8, 5, 8];
            const scale = 1.35;
            const width = baseW * scale;
            const height = baseH * scale;
            const depth = baseD * scale;
            return { width, height, depth, radius: Math.max(width, depth) * 0.55 };
        }

        let activeSidebarTab = 'production';
        let researchedTechs = new Set();

        function setSidebarTab(tab) {
            activeSidebarTab = tab;
            document.querySelectorAll('.sidebar-tab').forEach(b => b.classList.remove('active'));
            const activeBtn = document.getElementById(`tab-btn-${tab}`);
            if (activeBtn) activeBtn.classList.add('active');
            updateSidebar();
        }

        function showNotification(msg, type = 'info') {
            const ticker = document.getElementById('tactical-message');
            if (ticker) {
                ticker.textContent = msg;
                ticker.style.color = type === 'error' ? '#ff7675' : type === 'success' ? '#55efc4' : '#ffd86b';
            }
        }

        function recenterBase() {
            const cc = structures.find(s => s.type === 'center') || structures[0];
            if (cc) {
                cameraTarget.copy(cc.position);
                updateCameraPosition();
                showNotification('Camera centered on Base Headquarters.', 'info');
            }
        }

        function hasCompletedStructure(buildingType, altBuildingType = null) {
            return structures.some(s => {
                if (s.health <= 0 || s.isBuilding) return false;
                if (s.type === buildingType) return true;
                if (altBuildingType && s.type === altBuildingType) return true;
                if ((buildingType === 'power' || buildingType === 'nuclearReactor') && (s.type === 'power' || s.type === 'nuclearReactor')) return true;
                if ((buildingType === 'factory' || buildingType === 'fakeArmsDealer') && (s.type === 'factory' || s.type === 'fakeArmsDealer')) return true;
                if ((buildingType === 'barracks' || buildingType === 'fakeBarracks') && (s.type === 'barracks' || s.type === 'fakeBarracks')) return true;
                return false;
            });
        }

        function getStructureTechPrerequisite(type) {
            if (type === 'center') return null; // Command Center has no prerequisites

            if (selectedFaction === 'usa') {
                if (type === 'power') return null; // USA Cold Fusion Reactor is Tier 1
                if (type === 'barracks' || type === 'supplyCenter') {
                    return { building: 'power', name: 'Cold Fusion Reactor' };
                }
                if (type === 'patriot') {
                    return { building: 'power', name: 'Cold Fusion Reactor' };
                }
                if (type === 'factory') {
                    return { building: 'supplyCenter', altBuilding: 'barracks', name: 'Supply Center or Barracks' };
                }
                if (type === 'airfield') {
                    return { building: 'supplyCenter', altBuilding: 'factory', name: 'Supply Center or War Factory' };
                }
                if (type === 'strategyCenter') {
                    return { building: 'factory', altBuilding: 'airfield', name: 'War Factory or Airfield' };
                }
                if (type === 'supplyDrop' || type === 'detentionCamp' || type === 'particleCannon') {
                    return { building: 'strategyCenter', name: 'Strategy Center' };
                }
            } else if (selectedFaction === 'china') {
                if (type === 'nuclearReactor' || type === 'power') return null; // China Nuclear Reactor is Tier 1
                if (type === 'barracks' || type === 'supplyCenter') {
                    return { building: 'nuclearReactor', altBuilding: 'power', name: 'Nuclear Reactor' };
                }
                if (type === 'gatlingCannon' || type === 'bunker') {
                    return { building: 'nuclearReactor', altBuilding: 'power', name: 'Nuclear Reactor' };
                }
                if (type === 'factory') {
                    return { building: 'supplyCenter', altBuilding: 'barracks', name: 'Supply Center or Barracks' };
                }
                if (type === 'airfield') {
                    return { building: 'supplyCenter', altBuilding: 'factory', name: 'Supply Center or War Factory' };
                }
                if (type === 'propagandaCenter') {
                    return { building: 'factory', name: 'War Factory' };
                }
                if (type === 'speakerTower') {
                    return { building: 'propagandaCenter', altBuilding: 'barracks', name: 'Propaganda Center or Barracks' };
                }
                if (type === 'internetCenter' || type === 'nukeSilo') {
                    return { building: 'propagandaCenter', name: 'Propaganda Center' };
                }
            } else if (selectedFaction === 'gla') {
                // GLA requires no electrical power grid
                if (type === 'supplyStash' || type === 'barracks' || type === 'fakeBarracks') return null;
                if (type === 'tunnel' || type === 'stingerSite') {
                    return { building: 'barracks', altBuilding: 'fakeBarracks', name: 'Barracks' };
                }
                if (type === 'factory' || type === 'fakeArmsDealer') {
                    return { building: 'barracks', altBuilding: 'supplyStash', name: 'Barracks or Supply Stash' };
                }
                if (type === 'demoTrap') {
                    return { building: 'factory', altBuilding: 'fakeArmsDealer', name: 'Arms Dealer' };
                }
                if (type === 'palace') {
                    return { building: 'factory', altBuilding: 'fakeArmsDealer', name: 'Arms Dealer' };
                }
                if (type === 'blackMarket' || type === 'scudStorm') {
                    return { building: 'palace', name: 'Palace' };
                }
            }
            return null;
        }

        function getUnitTechPrerequisite(type) {
            if (selectedFaction === 'usa') {
                if (['paladin', 'tomahawk', 'pathfinder', 'burton', 'stealthfighter', 'aurora'].includes(type)) {
                    return { building: 'strategyCenter', name: 'Strategy Center' };
                }
            } else if (selectedFaction === 'china') {
                if (['overlord', 'inferno', 'nukecannon', 'blacklotus', 'hacker'].includes(type)) {
                    return { building: 'propagandaCenter', name: 'Propaganda Center' };
                }
            } else if (selectedFaction === 'gla') {
                if (['marauder', 'buggy', 'bombtruck', 'scud', 'hijacker', 'jarmen', 'mob'].includes(type)) {
                    return { building: 'palace', name: 'Palace' };
                }
            }
            return null;
        }

        // Comprehensive C&C Generals Briefings Catalog for Floating Tooltips
        const tacticalBriefings = {
            // USA Units
            infantry: { name: 'Ranger', role: 'Light Combat Infantry', cost: '$100', desc: 'Frontline rifleman equipped with combat armor and flashbang grenades. Can clear garrisons and capture enemy structures.', req: 'Barracks', unlock: 'Building Capture, Flashbangs' },
            rocket: { name: 'Missile Defender', role: 'Anti-Armor / Anti-Air Infantry', cost: '$175', desc: 'Equipped with wire-guided anti-tank / anti-aircraft missile launcher. Features Laser Guided Targeting.', req: 'Barracks', unlock: 'Laser Guided Missiles' },
            pathfinder: { name: 'Pathfinder', role: 'Sniper Scout', cost: '$600', desc: 'Elite designated marksman with thermal scope. Concealed in stealth when stationary. Eliminates infantry at extreme range.', req: 'Strategy Center', unlock: 'Stealth Scout, Anti-Infantry Dominance' },
            burton: { name: 'Colonel Burton', role: 'Hero Commando', cost: '$1500', desc: 'Colonel Burton - armed with rapid machine gun, timed C4 explosive charges, remote detonators, and combat knife.', req: 'Strategy Center', unlock: 'Timed C4 Charges, Remote Demolitions' },
            tank: { name: 'Crusader Tank', role: 'Main Battle Tank', cost: '$400', desc: 'Frontline armored fighting vehicle with high-velocity smoothbore cannon and heavy composite glacis.', req: 'War Factory', unlock: 'Battle Drones, Laser Point Defense' },
            crusader: { name: 'Crusader Tank', role: 'Main Battle Tank', cost: '$400', desc: 'Frontline armored fighting vehicle with high-velocity smoothbore cannon and heavy composite glacis.', req: 'War Factory', unlock: 'Battle Drones, Laser Point Defense' },
            humvee: { name: 'Humvee', role: 'Rapid Recon Vehicle', cost: '$350', desc: 'High-mobility light combat transport. Mounts a heavy .50 cal gun and carries up to 5 infantry squads who can fire out.', req: 'War Factory', unlock: 'Fire-from-within, High Speed Raids' },
            ambulance: { name: 'Ambulance', role: 'Field Support Vehicle', cost: '$300', desc: 'Mobile battlefield medical unit that decontaminates chemical/radiation zones and rapidly heals nearby friendly infantry.', req: 'War Factory', unlock: 'Mass Infantry Healing, Decontamination' },
            paladin: { name: 'Paladin Tank', role: 'Advanced Defense Tank', cost: '$600', desc: 'High-tech main battle tank equipped with anti-missile Point Defense Laser and heavy 120mm cannon.', req: 'Strategy Center', unlock: 'Active Anti-Missile Laser Shield' },
            tomahawk: { name: 'Tomahawk Launcher', role: 'Cruise Missile Artillery', cost: '$900', desc: 'Mobile launcher firing long-range Tomahawk cruise missiles. Devastating against static base defenses.', req: 'Strategy Center', unlock: 'Extreme Long-Range Bombardment' },
            chinook: { name: 'Chinook', role: 'Heavy Cargo Transport', cost: '$1200', desc: 'Twin-rotor heavy cargo helicopter. Gathers combat supplies from resource zones and transports heavy infantry.', req: 'Airfield', unlock: 'Supply Harvesting, Airborne Insertion' },
            raptor: { name: 'Raptor', role: 'Air Superiority Fighter', cost: '$1100', desc: 'Supersonic tactical strike jet armed with 4 precision-guided Sidewinder / Maverick missiles.', req: 'Airfield', unlock: 'Precision Air Strikes, Hit-and-Run' },
            comanche: { name: 'Comanche', role: 'Attack Gunship Helicopter', cost: '$1000', desc: 'Rotary-wing close air support gunship equipped with 20mm rotary vulcan cannon and rocket pods.', req: 'Airfield', unlock: 'Continuous Close Air Support' },
            stealthfighter: { name: 'Stealth Fighter', role: 'Stealth Strike Jet', cost: '$1400', desc: 'Advanced stealth airframe invisible to standard radar. Delivers precision laser-guided bunker-busting bombs.', req: 'Strategy Center', unlock: 'Stealth Air Infiltration, Defense Bypassing' },
            aurora: { name: 'Aurora Bomber', role: 'Hypersonic Strategic Bomber', cost: '$1800', desc: 'Mach 3+ strategic bomber. Immune to interception during supersonic attack run. Delivers fuel-air bombs.', req: 'Strategy Center', unlock: 'Unstoppable Precision Strike' },
            dozer: { name: 'Construction Dozer', role: 'Combat Engineering Vehicle', cost: '$500', desc: 'Heavy engineering vehicle that builds, repairs, and clears battlefield infrastructure.', req: 'Command Center', unlock: 'Base Construction, Automated Repairs' },
            truck: { name: 'Supply Truck', role: 'Automated Logistics Transport', cost: '$600', desc: 'Heavy cargo transport. Automatically gathers supplies from fields and unloads at Supply Centers.', req: 'Supply Center', unlock: 'Resource Income Flow' },

            // China Units
            redguard: { name: 'Red Guard', role: 'Conscript Infantry', cost: '$80', desc: 'Patriotic Chinese riflemen deployed in pairs. Can capture hostile buildings and gain horde firing bonuses.', req: 'Barracks', unlock: 'Building Capture, Red Army Horde Bonus' },
            tankhunter: { name: 'Tank Hunter', role: 'Anti-Armor Rocket Squad', cost: '$150', desc: 'Infantry equipped with RPG rocket launchers and magnetic TNT tank-disabling charges.', req: 'Barracks', unlock: 'TNT Sabotage, Anti-Tank Ambush' },
            hacker: { name: 'Hacker', role: 'Cyber Warfare Specialist', cost: '$600', desc: 'Espionage operative who hacks satellite networks for continuous funds or disables hostile base structures.', req: 'Propaganda Center', unlock: 'Continuous Cash Hack, Building Shutdown' },
            blacklotus: { name: 'Black Lotus', role: 'Special Agent Hero', cost: '$1500', desc: 'Stealth cyber operative capable of instant building capture, supply theft, and vehicle disabling from afar.', req: 'Propaganda Center', unlock: 'Stealth Espionage, Remote Tech Capture' },
            battlemaster: { name: 'Battle Master Tank', role: 'Main Battle Tank', cost: '$400', desc: 'Reliable frontline armored tank armed with a 100mm rifled cannon. Gains firepower when grouped in packs.', req: 'War Factory', unlock: 'Nationalism Horde Firepower Bonus' },
            dragon: { name: 'Dragon Tank', role: 'Incendiary Flame Tank', cost: '$500', desc: 'Armored flame vehicle that ejects high-temperature liquid napalm. Instantly clears garrisoned neutral buildings.', req: 'War Factory', unlock: 'Garrison Clearing, Anti-Infantry Inferno' },
            gatling: { name: 'Gatling Tank', role: 'Anti-Infantry / Anti-Air Tank', cost: '$500', desc: 'Fast light tank mounting dual rotary cannons. Spins up to devastating fire rates against infantry and aircraft.', req: 'War Factory', unlock: 'Rapid Shredding Fire, Anti-Air Defense' },
            crawler: { name: 'Troop Crawler', role: 'Troop Carrier & Radar', cost: '$700', desc: 'Heavy all-terrain transport carrying 8 Red Guards. Equipped with mobile base radar dish and medical station.', req: 'War Factory', unlock: 'Infantry Transport, Mobile Radar' },
            overlord: { name: 'Overlord Tank', role: 'Super-Heavy Dual-Cannon Tank', cost: '$1500', desc: 'Massive siege tank featuring twin 125mm cannons. Can be upgraded with Gatling Cannon, Bunker, or Speaker Tower.', req: 'Propaganda Center', unlock: 'Crushes Vehicles, Mobile Bastion' },
            inferno: { name: 'Inferno Cannon', role: 'Napalm Artillery', cost: '$900', desc: 'Self-propelled artillery firing combustible napalm canisters that trigger sweeping firestorms.', req: 'Propaganda Center', unlock: 'Napalm Firestorm Barrage' },
            nukecannon: { name: 'Nuke Cannon', role: 'Tactical Nuclear Artillery', cost: '$1800', desc: 'Heavy tracked artillery firing miniaturized tactical nuclear shells that leave radioactive fallout.', req: 'Propaganda Center', unlock: 'Tactical Nuclear Strikes, Area Denial' },
            mig: { name: 'MiG Fighter', role: 'Multirole Fighter Jet', cost: '$1200', desc: 'Delta-wing combat jet armed with dual Blackshark napalm rockets. Multiple MiGs trigger firestorms.', req: 'Airfield', unlock: 'Air Napalm Firestorms' },

            // GLA Units
            rebel: { name: 'Rebel', role: 'Guerrilla Rifleman', cost: '$80', desc: 'Light insurgent infantry armed with Kalashnikov rifles. Stealthy and can capture buildings.', req: 'Barracks', unlock: 'Building Capture, Guerrilla Ambush' },
            rpg: { name: 'RPG Trooper', role: 'Rocket Insurgent', cost: '$150', desc: 'Insurgent equipped with shoulder-launched rocket launcher. Fires effectively from civilian buildings and tunnels.', req: 'Barracks', unlock: 'Anti-Armor, Tunnel Network Ambush' },
            terrorist: { name: 'Terrorist', role: 'Explosive Martyr', cost: '$200', desc: 'Infiltrator equipped with explosive suicide belt. Can carjack civilian and military vehicles for mobile bombs.', req: 'Barracks', unlock: 'High-Explosive Sabotage' },
            mob: { name: 'Angry Mob', role: 'Insurgent Riot Swarm', cost: '$700', desc: 'Large crowd of rioters throwing Molotov cocktails and firing assault rifles. Highly resilient to armor piercing.', req: 'Palace', unlock: 'Swarm Tactics, Molotov Bombardment' },
            hijacker: { name: 'Hijacker', role: 'Vehicle Pirate', cost: '$800', desc: 'Inconspicuous operative who sprints toward enemy vehicles and commandeers them for the GLA.', req: 'Palace', unlock: 'Vehicle Hijacking & Stealing' },
            jarmen: { name: 'Jarmen Kell', role: 'Legendary Sniper Hero', cost: '$1500', desc: 'Jarmen Kell - master sniper who snipes enemy vehicle drivers, allowing GLA troops to commandeer empty vehicles.', req: 'Palace', unlock: 'Driver Sniping, Stealth Marksmanship' },
            technical: { name: 'Technical', role: 'Light Assault Truck', cost: '$300', desc: 'Fast pickup truck with mounted heavy machine gun. Upgrades instantly by salvaging battlefield wreckage.', req: 'Arms Dealer', unlock: 'Rapid Hit-and-Run, Salvage Upgrades' },
            scorpion: { name: 'Scorpion Tank', role: 'Light Battle Tank', cost: '$450', desc: 'Mobile light tank armed with a 75mm cannon. Can mount a Scorpion Rocket launcher through salvage.', req: 'Arms Dealer', unlock: 'Scorpion Rocket, Salvage Scavenging' },
            marauder: { name: 'Marauder Tank', role: 'Heavy Salvage Tank', cost: '$800', desc: 'Sturdy combat tank designed to scavenge enemy scrap metal to upgrade to twin heavy barrels.', req: 'Palace', unlock: 'Dual-Cannon Salvage Evolution' },
            buggy: { name: 'Rocket Buggy', role: 'Dune Buggy Skirmisher', cost: '$700', desc: 'Fast desert dune buggy armed with long-range rocket pods. Excels at hit-and-run base harassment.', req: 'Palace', unlock: 'Long-Range Skirmishing' },
            quad: { name: 'Quad Cannon', role: 'Anti-Infantry / Anti-Air Flak', cost: '$450', desc: 'Tracked vehicle with four heavy flak barrels. Shreds infantry, helicopters, and lightly armored vehicles.', req: 'Arms Dealer', unlock: 'Anti-Air Flak, Rapid Shredding' },
            toxintractor: { name: 'Toxin Tractor', role: 'Chemical Sprayer', cost: '$650', desc: 'Armored agricultural tractor converted to spray lethal Anthrax toxin. Clears civilian garrisons and contaminates ground.', req: 'Arms Dealer', unlock: 'Anthrax Spray, Garrison Clearing' },
            bombtruck: { name: 'Bomb Truck', role: 'Explosive Demolition Truck', cost: '$600', desc: 'Disguised transport packed with high explosives and optional anthrax or nuclear warheads.', req: 'Palace', unlock: 'Massive Base Demolition, Disguise' },
            scud: { name: 'SCUD Launcher', role: 'Ballistic Missile Vehicle', cost: '$1200', desc: 'Heavy launcher firing long-range ballistic SCUD missiles tipped with high explosive or Anthrax warheads.', req: 'Palace', unlock: 'Ballistic Bombardment, Toxin Clouds' },
            radarvan: { name: 'Radar Van', role: 'Mobile Radar Station', cost: '$500', desc: 'Provides the GLA with tactical minimap radar and reconnaissance scan abilities.', req: 'Arms Dealer', unlock: 'GLA Base Radar, Recon Sweeps' },
            worker: { name: 'Worker', role: 'GLA Laborer & Builder', cost: '$200', desc: 'GLA laborer who constructs buildings, gathers supply boxes by hand, and clears battlefield debris.', req: 'Command Center', unlock: 'Base Construction, Manual Harvesting' },

            // Buildings across all 3 factions
            center: { name: 'Command Center', role: 'Base Headquarters', cost: '$2000', desc: 'Main command base facility. Produces combat engineers and dozers, provides satellite radar uplink, and unlocks core tech.', req: 'None', unlock: 'Builders, Radar, Tier 1 Tech' },
            power: { name: 'Cold Fusion Reactor', role: 'Clean Energy Production', cost: '$300', desc: 'USA Cold Fusion Reactor. Supplies clean electrical power to base structures and defenses.', req: 'Command Center', unlock: 'Supply Center, Barracks, Patriot Missiles' },
            nuclearReactor: { name: 'Nuclear Reactor', role: 'Atomic Energy Production', cost: '$500', desc: 'China Nuclear Reactor. Generates massive power. Can be overcharged for +50% output.', req: 'Command Center', unlock: 'Supply Center, Barracks, Base Defenses' },
            barracks: { name: 'Barracks', role: 'Infantry Training Facility', cost: '$400', desc: 'Trains ground infantry, rangers, and special forces. Heals nearby friendly infantry.', req: 'Power (USA/China)', unlock: 'Combat Infantry, Base Defenses' },
            fakeBarracks: { name: 'Fake Barracks', role: 'Decoy Structure', cost: '$200', desc: 'Cheap wooden decoy structure that tricks enemy reconnaissance and can detonate or upgrade to real Barracks.', req: 'Command Center', unlock: 'Deception, Camouflage' },
            factory: { name: 'War Factory / Arms Dealer', role: 'Armored Vehicle Plant', cost: '$700', desc: 'Produces main battle tanks, artillery, and armored transports. Automatically repairs nearby friendly vehicles.', req: 'Supply Center or Barracks', unlock: 'Armored Fighting Vehicles, Tier 2 Tech' },
            fakeArmsDealer: { name: 'Fake Arms Dealer', role: 'Decoy Arms Dealer', cost: '$350', desc: 'Decoy vehicle workshop designed to mislead enemy bombers and satellite surveillance.', req: 'Barracks or Supply Stash', unlock: 'Deception, Decoy Defense' },
            supplyCenter: { name: 'Supply Center', role: 'Logistics Resource Hub', cost: '$500', desc: 'Logistics hub that processes supply shipments. Comes equipped with an automated Supply Truck.', req: 'Power (USA/China)', unlock: 'Supply Harvesters, War Factory, Airfield' },
            supplyStash: { name: 'Supply Stash', role: 'GLA Resource Depot', cost: '$500', desc: 'GLA warehouse where workers deposit salvaged supply crates. Unlocks Arms Dealer.', req: 'Command Center', unlock: 'Workers, Arms Dealer' },
            airfield: { name: 'Air Field', role: 'Aviation Hangar', cost: '$1000', desc: 'Houses and re-arms combat aircraft. Automatically repairs and reloads docked aircraft.', req: 'Supply Center or War Factory', unlock: 'Fighters, Bombers, Attack Helicopters' },
            strategyCenter: { name: 'Strategy Center', role: 'Strategic Operations Hub', cost: '$1500', desc: 'USA Advanced Tech Hub. Allows selection of Battle Plans (Hold the Line, Search & Destroy, Bombardment).', req: 'War Factory or Airfield', unlock: 'Paladin, Tomahawk, Aurora, Particle Cannon' },
            propagandaCenter: { name: 'Propaganda Center', role: 'State Propaganda Hub', cost: '$1200', desc: 'China Tier 3 Tech Hub. Broadcasts party doctrines, healing friendly troops and boosting firing rates.', req: 'War Factory', unlock: 'Overlord Tank, Nuke Cannon, Nuclear Silo' },
            palace: { name: 'Palace', role: 'Warlord Bastion Citadel', cost: '$1500', desc: 'GLA Citadel and High Command. Heavy garrison fortress allowing troops to fire out with reinforced armor.', req: 'Arms Dealer', unlock: 'Marauder Tank, SCUD Launcher, SCUD Storm' },
            patriot: { name: 'Patriot Missile System', role: 'Guided Missile Battery', cost: '$800', desc: 'USA automated surface-to-air and anti-vehicle guided missile battery. Connects with nearby Patriots.', req: 'Cold Fusion Reactor', unlock: 'Automated Base Defense' },
            gatlingCannon: { name: 'Gatling Cannon', role: 'Anti-Air / Anti-Infantry Defense', cost: '$700', desc: 'China rapid-fire dual rotating Gatling guns. Spins up to extreme velocity, shredding infantry and aircraft.', req: 'Nuclear Reactor', unlock: 'Anti-Air, Anti-Infantry Defense' },
            bunker: { name: 'Concrete Bunker', role: 'Fortified Infantry Emplacement', cost: '$500', desc: 'Reinforced concrete bunker that protects up to 5 garrisoned infantry while allowing them to fire.', req: 'Barracks', unlock: 'Protected Infantry Firepoint' },
            speakerTower: { name: 'Speaker Tower', role: 'Propaganda Loudspeaker', cost: '$600', desc: 'Broadcasts patriotic speeches that continuously heal friendly units and boost weapon reload speed.', req: 'Propaganda Center or Barracks', unlock: 'Horde Health Regeneration' },
            tunnel: { name: 'Tunnel Network', role: 'Subterranean Transit Hub', cost: '$700', desc: 'GLA subterranean network with mounted anti-infantry gun. Units enter here and emerge instantly at any other tunnel.', req: 'Barracks', unlock: 'Instant Map Transit, Tunnel Defense' },
            stingerSite: { name: 'Stinger Site', role: 'Surface-to-Air Missile Revetment', cost: '$700', desc: 'GLA fortified revetment housing 3 Stinger missile gunners. Deadly against enemy helicopters and aircraft.', req: 'Barracks', unlock: 'Anti-Air Defense' },
            demoTrap: { name: 'Demo Trap', role: 'Concealed Demolitions Mine', cost: '$300', desc: 'Camouflaged explosive charge that detonates when enemy armor passes over, causing catastrophic damage.', req: 'Arms Dealer', unlock: 'Area Denial, Anti-Armor Ambush' },
            particleCannon: { name: 'Particle Cannon', role: 'Orbital Particle Superweapon', cost: '$2500', desc: 'USA space-based orbital particle beam weapon. Channels high-energy particle stream across the battlefield.', req: 'Strategy Center', unlock: 'Orbital Particle Beam Strike' },
            nukeSilo: { name: 'Nuclear Missile Silo', role: 'Thermonuclear ICBM Silo', cost: '$2500', desc: 'China thermonuclear ICBM silo. Delivers a devastating atomic warhead that incinerates entire bases.', req: 'Propaganda Center', unlock: 'Thermonuclear Ballistic Missile Strike' },
            scudStorm: { name: 'SCUD Storm', role: 'Chemical Ballistic Superweapon', cost: '$2500', desc: 'GLA multiple ballistic missile complex. Salvo fires 9 chemical SCUD rockets loaded with Anthrax Beta.', req: 'Palace', unlock: 'SCUD Storm Ballistic Salvo' },
            supplyDrop: { name: 'Supply Drop Zone', role: 'Airborne Resupply Zone', cost: '$1200', desc: 'USA logistics landing zone. Cargo planes deliver $250 supply pallets at regular intervals.', req: 'Strategy Center', unlock: 'Automated Passive Income Flow' },
            internetCenter: { name: 'Internet Center', role: 'Cyber Warfare Facility', cost: '$1000', desc: 'China electronic intelligence facility. Stations Hackers to steal funds and track enemy positions.', req: 'Propaganda Center', unlock: 'Global Satellite Spy Uplink' },
            blackMarket: { name: 'Black Market', role: 'Covert Commerce Bazaar', cost: '$1200', desc: 'GLA subterranean black market. Generates continuous funds and sells illegal black market weapons tech.', req: 'Palace', unlock: 'Continuous Black Market Income' },
            detentionCamp: { name: 'Detention Camp', role: 'Military Intelligence Facility', cost: '$900', desc: 'USA interrogation and surveillance facility. Grants radar intelligence sweeps of hostile forces.', req: 'Strategy Center', unlock: 'Hostile Intelligence Sweeps' },

            // Upgrades & Abilities
            upgradePower: { name: 'Control Rod Upgrade', role: 'Facility Optimization', cost: '$300', desc: 'Installs advanced control rods to permanently double power output (+100%).', req: 'Cold Fusion Reactor', unlock: '+100% Electrical Power' },
            overcharge: { name: 'Reactor Overcharge', role: 'Nuclear Reactor Modulation', cost: 'FREE', desc: 'Overdrives cooling systems to gain +50% power generation at the cost of gradual structural wear.', req: 'Nuclear Reactor', unlock: '+50% Surge Power' },
            planHold: { name: 'Hold the Line', role: 'Strategic Battle Plan', cost: 'FREE', desc: 'Strategy Center directive: troops dig in, boosting defensive armor by +20%.', req: 'Strategy Center', unlock: '+20% Friendly Armor' },
            planSearch: { name: 'Search & Destroy', role: 'Strategic Battle Plan', cost: 'FREE', desc: 'Strategy Center directive: increases weapons range and sensor sight range by +20%.', req: 'Strategy Center', unlock: '+20% Weapon Range & Sight' },
            planBombard: { name: 'Bombardment Plan', role: 'Strategic Battle Plan', cost: 'FREE', desc: 'Strategy Center directive: boosts ordnance explosive yield and firepower by +20%.', req: 'Strategy Center', unlock: '+20% Firepower Damage' },
            compositeArmor: { name: 'Composite Armor', role: 'Vehicle Armor Research', cost: '$1200', desc: 'Reinforces Crusader and Paladin tanks with layered composite plating (+25% HP).', req: 'Strategy Center', unlock: '+25% Tank Durability' },
            nationalism: { name: 'Nationalism Doctrine', role: 'Troop Morale Research', cost: '$1000', desc: 'Inspires Chinese troops with patriotic fervor, increasing fire rate when in horde groups.', req: 'Propaganda Center', unlock: '+25% Horde Firing Rate' },
            subliminal: { name: 'Subliminal Messaging', role: 'Psychological Broadcast', cost: '$800', desc: 'Enhances Speaker Towers and Propaganda Centers to double healing rate (+100%).', req: 'Propaganda Center', unlock: '2x Regeneration Speed' },
            anthraxBeta: { name: 'Anthrax Beta', role: 'Chemical Weapon Research', cost: '$1200', desc: 'Upgrades Anthrax toxin to Beta strain, increasing chemical weapon damage by +25%.', req: 'Palace', unlock: '+25% Toxin Damage' },
            armTheMob: { name: 'Arm the Mob', role: 'Insurgent Weapon Distribution', cost: '$1000', desc: 'Distributes AK-47 assault rifles to Angry Mobs, drastically increasing lethal ranged firepower.', req: 'Palace', unlock: 'Rifles for Mobs' },
            captureBuilding: { name: 'Capture Building', role: 'Infantry Tactics Research', cost: '$1000', desc: 'Trains Rangers, Red Guards, and Rebels in tactical infiltration to capture enemy buildings.', req: 'Barracks', unlock: 'Building Capture' },
            intel: { name: 'Intelligence Sweep', role: 'Satellite Surveillance', cost: 'FREE', desc: 'Sweeps the battlefield to reveal enemy coordinates and status reports.', req: 'Detention Camp', unlock: 'Hostile Asset Recon' },
            garrison: { name: 'Garrison Troops', role: 'Fortification Order', cost: 'FREE', desc: 'Commands up to 5 nearby infantry to enter the bunker or structure to fire from safety.', req: 'Operational Facility', unlock: 'Protected Firepoint' },
            ungarrison: { name: 'Evacuate Troops', role: 'Deployment Order', cost: 'FREE', desc: 'Evacuates all garrisoned soldiers to external positions.', req: 'Garrisoned Structure', unlock: 'Infantry Deployment' },
            tunnel: { name: 'Tunnel Transit', role: 'Underground Movement', cost: 'FREE', desc: 'Transports all nearby units instantaneously through underground tunnels to the exit.', req: 'Tunnel Network', unlock: 'Instant Transit' },
            networkHack: { name: 'Satellite Hack', role: 'Cyber Espionage', cost: 'FREE', desc: 'Hacks orbital satellite relay to acquire +$250 cash directly into treasury.', req: 'Internet Center', unlock: '+$250 Cyber Funds' },
            plantMines: { name: 'Deploy Landmines', role: 'Base Security', cost: '$100', desc: 'Deploys explosive perimeter landmines around facility perimeter.', req: 'Structure', unlock: 'Perimeter Defense' },
            superweapon: { name: 'Superweapon Strike', role: 'Strategic Armageddon', cost: 'FREE', desc: 'Prepares superweapon for targeting anywhere on the battlefield.', req: 'Superweapon Facility', unlock: 'Devastating Strike' },
            towMissile: { name: 'TOW Missile Tech', role: 'Anti-Armor Enhancement', cost: '$800', desc: 'Mounts wire-guided TOW missile launcher on Humvees (+40% armor damage).', req: 'War Factory', unlock: '+40% Humvee Damage' },
            battleDrone: { name: 'Battle Drone Upgrade', role: 'Autonomous Vehicle Drone', cost: '$400', desc: 'Deploys hovering support drone over tanks for continuous repair & sniper fire.', req: 'War Factory', unlock: 'Auto-Repair, Infantry Defense' },
            chainGuns: { name: 'Chain Guns Tech', role: 'Ballistic Optimization', cost: '$1000', desc: 'Upgrades Gatling weapons with high-velocity link barrels (+25% damage & instant spin).', req: 'War Factory', unlock: '+25% Firepower, Instant Spin' },
            uraniumShells: { name: 'Uranium Shells Tech', role: 'Kinetic Munition', cost: '$1200', desc: 'Depleted uranium penetrators for Battlemaster and Overlord tank cannons (+25% armor piercing).', req: 'Propaganda Center', unlock: '+25% Heavy Armor Piercing' },
            scorpionRocket: { name: 'Scorpion Rocket Tech', role: 'Heavy Turret Missile', cost: '$1000', desc: 'Mounts high-explosive missile launcher on Scorpion tank turrets.', req: 'Arms Dealer', unlock: 'Turret Rocket Salvo' },
            apBullets: { name: 'AP Bullets Tech', role: 'Armor Piercing Ammo', cost: '$1000', desc: 'Reinforced tungsten core ammunition for Rebels, Technicals, and Quad Cannons (+25% damage).', req: 'Palace', unlock: '+25% Small Arms Damage' },
            apRockets: { name: 'AP Rockets Tech', role: 'Shaped Charge Warheads', cost: '$1200', desc: 'High-explosive anti-tank warheads for RPG Troopers and Rocket Buggies (+25% damage).', req: 'Palace', unlock: '+25% Rocket Damage' },
            junkRepair: { name: 'Junk Repair Tech', role: 'Battlefield Scavenging', cost: '$1000', desc: 'GLA mechanics continuously scavenge battlefield scrap to repair all vehicles (+1 HP/s).', req: 'Palace', unlock: 'Continuous Vehicle Auto-Healing' },
            camouflage: { name: 'Camouflage Tech', role: 'Guerilla Concealment', cost: '$1000', desc: 'Desert ghillie camouflage makes Rebels completely invisible when stationary.', req: 'Palace', unlock: 'Permanent Static Stealth' }
        };

        function showTacticalTooltip(event, id) {
            const tooltip = document.getElementById('tactical-tooltip');
            if (!tooltip) return;
            const info = tacticalBriefings[id];
            if (!info) return;

            let html = `
                <div class="tooltip-title">${info.name || id}</div>
                <div class="tooltip-role">${info.role || 'TACTICAL ASSET'}</div>
                <div class="tooltip-cost">${info.cost ? 'COST: ' + info.cost : 'STANDARD ASSET'}</div>
                <div class="tooltip-desc">${info.desc || ''}</div>
            `;
            if (info.req) {
                html += `<div class="tooltip-req">PREREQUISITE: ${info.req}</div>`;
            }
            if (info.unlock) {
                html += `<div class="tooltip-unlock">CAPABILITIES: ${info.unlock}</div>`;
            }

            tooltip.innerHTML = html;
            tooltip.style.display = 'block';

            const targetEl = event.currentTarget || event.target;
            const rect = targetEl.getBoundingClientRect();

            let left = rect.left - 270;
            if (left < 10) left = rect.right + 12;
            let top = Math.min(window.innerHeight - 240, Math.max(15, rect.top - 10));

            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${top}px`;
        }

        function hideTacticalTooltip() {
            const tooltip = document.getElementById('tactical-tooltip');
            if (tooltip) tooltip.style.display = 'none';
        }

                function refreshFactionRoster() {
            const faction = factionCatalog[selectedFaction];
            unitRoster = {};
            
            // 1. Barracks Infantry
            if (faction.barracks) {
                Object.entries(faction.barracks).forEach(([type, data]) => {
                    unitRoster[type] = { name: data[0], cost: data[1], building: 'barracks', role: data[2] || 'Infantry', buildTime: 3.0 };
                });
            }
            // 2. War Factory Ground Armor
            if (faction.factory) {
                Object.entries(faction.factory).forEach(([type, data]) => {
                    unitRoster[type] = { name: data[0], cost: data[1], building: 'factory', role: data[2] || 'Ground Vehicle', buildTime: 5.5 };
                });
            }
            // 3. Airfield Aircraft & Helicopters
            if (faction.airfield) {
                Object.entries(faction.airfield).forEach(([type, data]) => {
                    unitRoster[type] = { name: data[0], cost: data[1], building: 'airfield', role: data[2] || 'Aircraft', buildTime: 7.0 };
                });
            }
            // 4. Logistics (Supply Center)
            if (faction.supplyCenter) {
                Object.entries(faction.supplyCenter).forEach(([type, data]) => {
                    unitRoster[type] = { name: data[0], cost: data[1], building: 'supplyCenter', role: data[2] || 'Logistics', buildTime: 4.0 };
                });
            }
            // 5. Command Center (Dozers / Workers)
            if (faction.commandCenter) {
                Object.entries(faction.commandCenter).forEach(([type, data]) => {
                    unitRoster[type] = { name: data[0], cost: data[1], building: 'commandCenter', role: data[2] || 'Construction', buildTime: 4.5 };
                });
            }

            // Update Start Menu active faction buttons
            document.querySelectorAll('[data-faction]').forEach(button => {
                if (button.dataset.faction === selectedFaction) button.classList.add('active');
                else button.classList.remove('active');
            });

            // Update Faction badge in Top HUD
            const badge = document.getElementById('sidebar-faction-badge');
            if (badge) {
                badge.textContent = selectedFaction === 'usa' ? 'USA STRATEGIC FORCES' :
                                    selectedFaction === 'china' ? 'PEOPLE\'S LIBERATION ARMY' : 'GLA CELL NETWORK';
            }
            updateSidebar();
        }

        let playerStartingPositionKey = 'alpha';
        let aiDifficultyLevel = 'medium';
        let aiFactionChosen = 'random';
        let enemyStructures = [];
        let isMatchActive = false;
        let matchStartTime = 0;
        let hasSpawnedInitialEnemyBase = false;
        let playerTeamId = 1;
        // activeCustomMap & savedCustomMaps declared in 01_core.js
        let focusedSlotIdx = 0;

        // --- SKIRMISH & MULTIPLAYER LOBBY SLOTS STATE ---
        let spSlots = [
            { id: 1, name: 'Player (You)', isPlayer: true, isHuman: true, active: true, team: 1, faction: 'usa', spawnId: 1, difficulty: 'medium' },
            { id: 2, name: 'AI Opponent 1', isPlayer: false, isHuman: false, active: true, team: 2, faction: 'china', spawnId: 2, difficulty: 'medium' },
            { id: 3, name: 'AI Slot 3', isPlayer: false, isHuman: false, active: false, team: 2, faction: 'gla', spawnId: 3, difficulty: 'medium' },
            { id: 4, name: 'AI Slot 4', isPlayer: false, isHuman: false, active: false, team: 1, faction: 'usa', spawnId: 4, difficulty: 'medium' },
            { id: 5, name: 'AI Slot 5', isPlayer: false, isHuman: false, active: false, team: 2, faction: 'china', spawnId: 5, difficulty: 'medium' },
            { id: 6, name: 'AI Slot 6', isPlayer: false, isHuman: false, active: false, team: 3, faction: 'gla', spawnId: 6, difficulty: 'medium' },
            { id: 7, name: 'AI Slot 7', isPlayer: false, isHuman: false, active: false, team: 3, faction: 'usa', spawnId: 7, difficulty: 'medium' },
            { id: 8, name: 'AI Slot 8', isPlayer: false, isHuman: false, active: false, team: 4, faction: 'china', spawnId: 8, difficulty: 'medium' }
        ];

        let mpSlots = [
            { id: 1, name: 'Host (You)', isPlayer: true, isHuman: true, isHost: true, active: true, team: 1, faction: 'usa', spawnId: 1, difficulty: 'medium' },
            { id: 2, name: 'Challenger', isPlayer: false, isHuman: true, isHost: false, active: true, team: 2, faction: 'china', spawnId: 2, difficulty: 'medium' },
            { id: 3, name: 'AI Slot 3', isPlayer: false, isHuman: false, isHost: false, active: false, team: 2, faction: 'gla', spawnId: 3, difficulty: 'medium' },
            { id: 4, name: 'AI Slot 4', isPlayer: false, isHuman: false, isHost: false, active: false, team: 1, faction: 'usa', spawnId: 4, difficulty: 'medium' },
            { id: 5, name: 'AI Slot 5', isPlayer: false, isHuman: false, isHost: false, active: false, team: 2, faction: 'china', spawnId: 5, difficulty: 'medium' },
            { id: 6, name: 'AI Slot 6', isPlayer: false, isHuman: false, isHost: false, active: false, team: 3, faction: 'gla', spawnId: 6, difficulty: 'medium' },
            { id: 7, name: 'AI Slot 7', isPlayer: false, isHuman: false, isHost: false, active: false, team: 3, faction: 'usa', spawnId: 7, difficulty: 'medium' },
            { id: 8, name: 'AI Slot 8', isPlayer: false, isHuman: false, isHost: false, active: false, team: 4, faction: 'china', spawnId: 8, difficulty: 'medium' }
        ];
        window.spSlots = spSlots;
        window.mpSlots = mpSlots;

        // --- TEAM FRIENDLY / HOSTILE RESOLUTION ---
        function isFriendly(assetA, assetB) {
            if (!assetA || !assetB) return false;
            const getTeam = (a) => {
                if (a.teamId !== undefined) return a.teamId;
                if (a.team !== undefined) return a.team;
                if (typeof units !== 'undefined' && units.includes(a)) return (typeof playerTeamId !== 'undefined' ? playerTeamId : 1);
                if (typeof structures !== 'undefined' && structures.includes(a)) return (typeof playerTeamId !== 'undefined' ? playerTeamId : 1);
                if (a.isAI) return 2;
                return (typeof playerTeamId !== 'undefined' ? playerTeamId : 1);
            };
            return getTeam(assetA) === getTeam(assetB);
        }

        // --- SPAWN POINTS DISTRIBUTION (Small: 4, Medium: 6, Large: 8) ---
        function getSpawnPointsForMap(mapSize, mapType, customMap) {
            if (customMap && customMap.spawnPoints && customMap.spawnPoints.length > 0) {
                return customMap.spawnPoints;
            }

            const spawns = [];
            if (mapSize <= 600) {
                // Small map: 4 spawn points (quadrants)
                const d = mapSize * 0.30;
                spawns.push(
                    { id: 1, name: 'Spawn 1 (SW)', x: -d, z: d },
                    { id: 2, name: 'Spawn 2 (NE)', x: d, z: -d },
                    { id: 3, name: 'Spawn 3 (NW)', x: -d, z: -d },
                    { id: 4, name: 'Spawn 4 (SE)', x: d, z: d }
                );
            } else if (mapSize <= 900) {
                // Medium map: 6 spawn points evenly distributed in a ring
                const r = mapSize * 0.32;
                const count = 6;
                const dirs = ['S', 'SE', 'NE', 'N', 'NW', 'SW'];
                for (let i = 0; i < count; i++) {
                    const angle = (i * (360 / count)) * (Math.PI / 180);
                    const x = Math.round(Math.sin(angle) * r);
                    const z = Math.round(Math.cos(angle) * r);
                    spawns.push({ id: i + 1, name: `Spawn ${i + 1} (${dirs[i]})`, x, z });
                }
            } else {
                // Large map: 8 spawn points evenly distributed in a ring
                const r = mapSize * 0.33;
                const count = 8;
                const dirs = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
                for (let i = 0; i < count; i++) {
                    const angle = (i * (360 / count)) * (Math.PI / 180);
                    const x = Math.round(Math.sin(angle) * r);
                    const z = Math.round(Math.cos(angle) * r);
                    spawns.push({ id: i + 1, name: `Spawn ${i + 1} (${dirs[i]})`, x, z });
                }
            }
            return spawns;
        }

        // --- INTERACTIVE 2D MAP PREVIEW RENDERER ---
        function renderMapPreview(canvasId, mapType, mapSize, slots, interactive) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const w = canvas.width;
            const h = canvas.height;
            ctx.clearRect(0, 0, w, h);

            // 1. Draw Terrain Background
            if (activeCustomMap && mapType && mapType.startsWith('custom_')) {
                const res = 32;
                const grid = activeCustomMap.heightGrid || [];
                const cellW = w / res;
                const cellH = h / res;
                for (let gy = 0; gy < res; gy++) {
                    for (let gx = 0; gx < res; gx++) {
                        const val = grid[gy * res + gx] !== undefined ? grid[gy * res + gx] : 2.5;
                        if (val < (activeCustomMap.waterLevel || 0)) {
                            ctx.fillStyle = '#2980b9'; // Water
                        } else {
                            const brightness = Math.min(255, Math.max(80, Math.floor(130 + val * 10)));
                            ctx.fillStyle = activeCustomMap.theme === 'jungle' ? `rgb(30, ${brightness}, 45)` :
                                            activeCustomMap.theme === 'snow' ? `rgb(${brightness}, ${brightness}, 240)` :
                                            activeCustomMap.theme === 'city' ? `rgb(${brightness*0.7}, ${brightness*0.7}, ${brightness*0.7})` :
                                            `rgb(${brightness}, ${brightness*0.8}, 90)`;
                        }
                        ctx.fillRect(gx * cellW, gy * cellH, cellW + 1, cellH + 1);
                    }
                }
            } else if (mapType === 'desert') {
                const grad = ctx.createLinearGradient(0, 0, w, h);
                grad.addColorStop(0, '#cda26a');
                grad.addColorStop(0.5, '#b8894f');
                grad.addColorStop(1, '#dfbc85');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = '#a6773f';
                ctx.beginPath(); ctx.ellipse(w * 0.35, h * 0.3, w * 0.22, h * 0.12, Math.PI / 6, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#3498db';
                ctx.beginPath(); ctx.ellipse(w * 0.72, h * 0.72, w * 0.08, h * 0.06, 0, 0, Math.PI * 2); ctx.fill();
            } else if (mapType === 'jungle') {
                ctx.fillStyle = '#1e3f20';
                ctx.fillRect(0, 0, w, h);
                ctx.strokeStyle = '#2980b9';
                ctx.lineWidth = 14;
                ctx.beginPath();
                ctx.moveTo(w * 0.1, h * 0.5);
                ctx.bezierCurveTo(w * 0.3, h * 0.3, w * 0.7, h * 0.7, w * 0.9, h * 0.5);
                ctx.stroke();
            } else if (mapType === 'snow') {
                ctx.fillStyle = '#dcdde1';
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = '#718093';
                ctx.beginPath(); ctx.ellipse(w * 0.3, h * 0.25, w * 0.18, h * 0.08, Math.PI / 4, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#74b9ff';
                ctx.beginPath(); ctx.ellipse(w * 0.6, h * 0.65, w * 0.14, h * 0.1, 0, 0, Math.PI * 2); ctx.fill();
            } else if (mapType === 'city') {
                ctx.fillStyle = '#2d3436';
                ctx.fillRect(0, 0, w, h);
                ctx.strokeStyle = '#636e72';
                ctx.lineWidth = 4;
                for (let s = 30; s < w; s += 45) {
                    ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(s, h); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(0, s); ctx.lineTo(w, s); ctx.stroke();
                }
            } else {
                ctx.fillStyle = '#3d4a3e';
                ctx.fillRect(0, 0, w, h);
            }

            // 2. Draw Spawn Points & Assignments
            const spawns = getSpawnPointsForMap(mapSize, mapType, activeCustomMap);
            const activeSlots = slots ? slots.filter(s => s.active) : [];

            spawns.forEach(sp => {
                const cx = (sp.x / mapSize + 0.5) * w;
                const cy = (sp.z / mapSize + 0.5) * h;
                const assignedSlot = activeSlots.find(s => s.spawnId === sp.id);

                ctx.beginPath();
                ctx.arc(cx, cy, 13, 0, Math.PI * 2);

                if (assignedSlot) {
                    const teamColors = ['#0984e3', '#d63031', '#00b894', '#e17055'];
                    ctx.fillStyle = teamColors[(assignedSlot.team - 1) % 4] || '#0984e3';
                    ctx.fill();
                    ctx.lineWidth = 2.5;
                    ctx.strokeStyle = assignedSlot.isPlayer ? '#00ffcc' : assignedSlot.isHuman ? '#f1c40f' : '#ffffff';
                    ctx.stroke();

                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 9px monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const txt = assignedSlot.isPlayer ? 'YOU' : assignedSlot.isHuman ? 'P2' : `AI${assignedSlot.id}`;
                    ctx.fillText(txt, cx, cy);
                } else {
                    ctx.fillStyle = 'rgba(0,0,0,0.5)';
                    ctx.fill();
                    ctx.lineWidth = 1.5;
                    ctx.strokeStyle = '#8f9e91';
                    ctx.setLineDash([3, 2]);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    ctx.fillStyle = '#8f9e91';
                    ctx.font = 'bold 10px monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(sp.id, cx, cy);
                }
            });
        }

        // --- CLICK ON MAP PREVIEW TO ASSIGN SPAWN POINT ---
        function handleMapPreviewClick(e, mode) {
            const canvasId = mode === 'single' ? 'sp-map-preview' : 'mp-map-preview';
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            const mapSize = parseInt(document.getElementById(mode === 'single' ? 'map-size' : 'mp-map-size').value, 10);
            const mapType = document.getElementById(mode === 'single' ? 'map-environment' : 'mp-map-env').value;
            const spawns = getSpawnPointsForMap(mapSize, mapType, activeCustomMap);
            const slots = mode === 'single' ? spSlots : mpSlots;

            for (let sp of spawns) {
                const cx = (sp.x / mapSize + 0.5) * canvas.width;
                const cy = (sp.z / mapSize + 0.5) * canvas.height;
                const dist = Math.hypot(clickX - cx, clickY - cy);
                if (dist <= 18) {
                    updateSlot(mode, focusedSlotIdx, 'spawnId', sp.id);
                    break;
                }
            }
        }

        // --- SKIRMISH & MULTIPLAYER LOBBY SLOTS MANAGEMENT ---
        function initLobbySlots(mode) {
            const mapSize = parseInt(document.getElementById(mode === 'single' ? 'map-size' : 'mp-map-size').value, 10);
            const maxSpawns = mapSize <= 600 ? 4 : mapSize <= 900 ? 6 : 8;
            const slots = mode === 'single' ? spSlots : mpSlots;

            slots.forEach((s, idx) => {
                if (idx < maxSpawns) {
                    if (idx < 2) s.active = true;
                } else {
                    s.active = false;
                }
                s.spawnId = (idx % maxSpawns) + 1;
            });

            renderSlotsUI(mode);
            const canvasId = mode === 'single' ? 'sp-map-preview' : 'mp-map-preview';
            const mapType = document.getElementById(mode === 'single' ? 'map-environment' : 'mp-map-env').value;
            renderMapPreview(canvasId, mapType, mapSize, slots, true);

            const countEl = document.getElementById(mode === 'single' ? 'sp-slots-count' : 'mp-slots-count');
            if (countEl) countEl.innerText = `${maxSpawns} Spawns (${slots.filter(s => s.active).length} Active)`;
        }

        function setFocusedSlot(mode, idx) {
            focusedSlotIdx = idx;
            const listEl = document.getElementById(mode === 'single' ? 'sp-slots-list' : 'mp-slots-list');
            if (!listEl) return;
            const rows = listEl.querySelectorAll('.slot-row');
            rows.forEach((r, i) => {
                if (i === idx) {
                    r.style.borderColor = '#55efc4';
                    r.style.boxShadow = '0 0 8px rgba(85,239,196,0.3)';
                } else {
                    const slots = mode === 'single' ? spSlots : mpSlots;
                    r.style.borderColor = (slots[i] && slots[i].active) ? '#55efc4' : '#253327';
                    r.style.boxShadow = 'none';
                }
            });
        }

        function renderSlotsUI(mode) {
            const listEl = document.getElementById(mode === 'single' ? 'sp-slots-list' : 'mp-slots-list');
            if (!listEl) return;
            const mapSize = parseInt(document.getElementById(mode === 'single' ? 'map-size' : 'mp-map-size').value, 10);
            const maxSpawns = mapSize <= 600 ? 4 : mapSize <= 900 ? 6 : 8;
            const slots = mode === 'single' ? spSlots : mpSlots;
            const mapType = document.getElementById(mode === 'single' ? 'map-environment' : 'mp-map-env').value;
            const spawns = getSpawnPointsForMap(mapSize, mapType, activeCustomMap);

            let html = '';
            for (let i = 0; i < maxSpawns; i++) {
                const s = slots[i];
                const isFocused = (focusedSlotIdx === i);

                html += `<div class="slot-row ${s.active ? 'active-slot' : ''}" style="${isFocused ? 'border-color:#55efc4; box-shadow:0 0 8px rgba(85,239,196,0.3);' : ''}" onclick="setFocusedSlot('${mode}', ${i});">`;

                // 1. Badge & Status Toggle
                html += `<div class="slot-badge">`;
                if (i === 0) {
                    html += `<span style="color:#00ffcc;">👑 ${s.name}</span>`;
                } else if (i === 1 && mode === 'multiplayer') {
                    html += `<span style="color:#f1c40f;">🚀 Challenger</span>`;
                } else {
                    html += `<select class="slot-select" style="width:75px;" onclick="event.stopPropagation(); setFocusedSlot('${mode}', ${i});" onmousedown="event.stopPropagation();" onchange="updateSlot('${mode}', ${i}, 'active', this.value === '1')">
                        <option value="1" ${s.active ? 'selected' : ''}>Active</option>
                        <option value="0" ${!s.active ? 'selected' : ''}>Closed</option>
                    </select>`;
                }
                html += `</div>`;

                // 2. Faction Selector
                html += `<div>`;
                if (i === 0) {
                    html += `<select id="${mode}-slot-0-faction" class="slot-select" onclick="event.stopPropagation(); setFocusedSlot('${mode}', ${i});" onmousedown="event.stopPropagation();" onchange="selectFaction(this.value); updateSlot('${mode}', ${i}, 'faction', this.value);">
                        <option value="usa" ${s.faction==='usa'?'selected':''}>USA Force</option>
                        <option value="china" ${s.faction==='china'?'selected':''}>China Force</option>
                        <option value="gla" ${s.faction==='gla'?'selected':''}>GLA Network</option>
                    </select>`;
                } else {
                    html += `<select class="slot-select" ${!s.active ? 'disabled' : ''} onclick="event.stopPropagation(); setFocusedSlot('${mode}', ${i});" onmousedown="event.stopPropagation();" onchange="updateSlot('${mode}', ${i}, 'faction', this.value)">
                        <option value="usa" ${s.faction==='usa'?'selected':''}>USA Force</option>
                        <option value="china" ${s.faction==='china'?'selected':''}>China Force</option>
                        <option value="gla" ${s.faction==='gla'?'selected':''}>GLA Network</option>
                        ${mode === 'single' ? `<option value="random" ${s.faction==='random'?'selected':''}>🎲 Random</option>` : ''}
                    </select>`;
                }
                html += `</div>`;

                // 3. Team Selector (Team 1, 2, 3, 4)
                html += `<div>`;
                html += `<select class="slot-select" ${!s.active ? 'disabled' : ''} onclick="event.stopPropagation(); setFocusedSlot('${mode}', ${i});" onmousedown="event.stopPropagation();" onchange="updateSlot('${mode}', ${i}, 'team', parseInt(this.value, 10))">
                    <option value="1" ${s.team===1?'selected':''}>🔵 Team 1</option>
                    <option value="2" ${s.team===2?'selected':''}>🔴 Team 2</option>
                    <option value="3" ${s.team===3?'selected':''}>🟢 Team 3</option>
                    <option value="4" ${s.team===4?'selected':''}>🟡 Team 4</option>
                </select>`;
                html += `</div>`;

                // 4. Difficulty Selector (for AI)
                html += `<div>`;
                if (s.isHuman) {
                    html += `<span style="font-size:10px; color:#c5b98e; padding:3px;">Human</span>`;
                } else {
                    html += `<select class="slot-select" ${!s.active ? 'disabled' : ''} onclick="event.stopPropagation(); setFocusedSlot('${mode}', ${i});" onmousedown="event.stopPropagation();" onchange="updateSlot('${mode}', ${i}, 'difficulty', this.value)">
                        <option value="easy" ${s.difficulty==='easy'?'selected':''}>Easy</option>
                        <option value="medium" ${s.difficulty==='medium'?'selected':''}>Medium</option>
                        <option value="hard" ${s.difficulty==='hard'?'selected':''}>Hard</option>
                    </select>`;
                }
                html += `</div>`;

                // 5. Spawn Location Selector
                html += `<div>`;
                html += `<select class="slot-select" ${!s.active ? 'disabled' : ''} onclick="event.stopPropagation(); setFocusedSlot('${mode}', ${i});" onmousedown="event.stopPropagation();" onchange="updateSlot('${mode}', ${i}, 'spawnId', parseInt(this.value, 10))">`;
                spawns.forEach(sp => {
                    html += `<option value="${sp.id}" ${s.spawnId===sp.id?'selected':''}>${sp.name}</option>`;
                });
                html += `</select></div>`;

                html += `</div>`;
            }
            listEl.innerHTML = html;
        }

        function updateSlot(mode, slotIdx, field, value) {
            const slots = mode === 'single' ? spSlots : mpSlots;
            const targetSlot = slots[slotIdx];
            if (!targetSlot) return;

            if (field === 'spawnId') {
                const existing = slots.find((s, idx) => idx !== slotIdx && s.active && s.spawnId === value);
                if (existing) {
                    existing.spawnId = targetSlot.spawnId;
                }
                targetSlot.spawnId = value;
            } else {
                targetSlot[field] = value;
            }

            renderSlotsUI(mode);
            const canvasId = mode === 'single' ? 'sp-map-preview' : 'mp-map-preview';
            const mapSize = parseInt(document.getElementById(mode === 'single' ? 'map-size' : 'mp-map-size').value, 10);
            const mapType = document.getElementById(mode === 'single' ? 'map-environment' : 'mp-map-env').value;
            renderMapPreview(canvasId, mapType, mapSize, slots, true);

            if (mode === 'multiplayer') {
                syncMpLobbyToPeer();
            }
        }

        function onMapSelectionChange(mode) {
            const mapType = document.getElementById(mode === 'single' ? 'map-environment' : 'mp-map-env').value;
            const sizeEl = document.getElementById(mode === 'single' ? 'map-size' : 'mp-map-size');

            if (mapType.startsWith('custom_') && savedCustomMaps[mapType]) {
                activeCustomMap = savedCustomMaps[mapType];
                if (sizeEl) sizeEl.value = String(activeCustomMap.size || 800);
            } else {
                activeCustomMap = null;
            }

            initLobbySlots(mode);
            if (mode === 'multiplayer') syncMpLobbyToPeer();
        }

        function onMapSizeChange(mode) {
            initLobbySlots(mode);
            if (mode === 'multiplayer') syncMpLobbyToPeer();
        }

        