function processCombatScanning() {
			units.forEach(unit => {
                if (unit.garrisonedIn) return;
				// Manage weapon assembly cooldown timers
				if (unit.attackCooldown > 0) unit.attackCooldown = Math.max(0, unit.attackCooldown - combatDeltaScale);

				// If unit already has a valid target, verify proximity constraints
				if (unit.combatTarget) {
                    const targetPos = unit.combatTarget.position || (unit.combatTarget.mesh && unit.combatTarget.mesh.position);
                    const targetRadius = unit.combatTarget.radius || 0;
                    const distance = targetPos ? unit.mesh.position.distanceTo(targetPos) : Infinity;
                    const maxEffectiveRange = unit.scanRange + targetRadius;

                    if (distance > maxEffectiveRange || unit.combatTarget.health <= 0) {
                        unit.combatTarget = null; // Target lost or destroyed
                    } else {
                        // Point Turret systems directly at target coordinates
                        const turret = unit.mesh.getObjectByName("turretSystem");
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

                // Auto-Scan fallback loop if completely idle
                if (!unit.combatTarget) {
                    // 1. Scan for nearest hostile units
                    if (enemyUnits.length > 0) {
                        for (let enemy of enemyUnits) {
                            if (enemy.health > 0 && enemy.mesh) {
                                const dist = unit.mesh.position.distanceTo(enemy.mesh.position);
                                if (dist <= unit.scanRange) {
                                    unit.combatTarget = enemy;
                                    if (unit.isAir) unit.airState = 'attacking';
                                    break;
                                }
                            }
                        }
                    }
                    // 2. If no hostile units in range, auto-target nearest hostile structures
                    if (!unit.combatTarget && enemyStructures.length > 0) {
                        for (let struct of enemyStructures) {
                            if (struct.health > 0 && struct.mesh) {
                                const sPos = struct.position || struct.mesh.position;
                                const dist = unit.mesh.position.distanceTo(sPos);
                                if (dist <= (unit.scanRange + (struct.radius || 6))) {
                                    unit.combatTarget = struct;
                                    if (unit.isAir) unit.airState = 'attacking';
                                    break;
                                }
                            }
                        }
                    }
                }
            });
        }

        function executeWeaponFire(attacker, target) {
            // Authentic Command & Conquer: Generals Weapon Reload Rates (60 ticks = 1.0s)
            const cncCooldowns = {
                // Main Battle & Heavy Tanks (~3.0s - 4.0s)
                'tank': 180, 'crusader': 180, 'battlemaster': 180, 'scorpion': 160, 'marauder': 170,
                'paladin': 190, 'overlord': 240,
                // Artillery & Heavy Siege Missiles (~6.0s - 7.5s)
                'tomahawk': 360, 'scud': 360, 'inferno': 360, 'nukecannon': 450,
                // Anti-Tank & Rocket Troops (~2.66s)
                'rocket': 160, 'rpg': 160, 'tankhunter': 160, 'patriot': 190, 'stingerSite': 150,
                // Standard Infantry Rifle Bursts (~1.66s)
                'ranger': 100, 'redguard': 100, 'rebel': 100, 'infantry': 100,
                // High-Caliber Snipers (~3.66s)
                'pathfinder': 220, 'jarmen': 220,
                // Fast Attack & Light Vehicles (~1.25s)
                'humvee': 75, 'technical': 75, 'buggy': 75,
                'dragon': 50, 'toxintractor': 50,
                // Rapid-Fire Autocannons & Gatling Guns (~0.46s - 0.75s)
                'gatling': 28, 'gatlingCannon': 28, 'quad': 45,
                // Aircraft (~2.5s - 6.0s)
                'comanche': 150, 'raptor': 240, 'stealthfighter': 240, 'aurora': 360,
                'chinook': 180, 'truck': 180, 'worker': 180, 'dozer': 180
            };
            attacker.attackCooldown = cncCooldowns[attacker.type] || 160;

            if (battlePlan === 'search' && units.includes(attacker)) attacker.attackCooldown = Math.floor(attacker.attackCooldown * 0.75);
            if (battlePlan === 'hold' && units.includes(attacker)) attacker.attackCooldown = Math.floor(attacker.attackCooldown * 1.25);

            const targetPos = (target.position || target.mesh.position).clone();
            targetPos.y += (target.isAir ? 0.2 : 0.5);

            const muzzlePos = getMuzzleWorldPosition(attacker);

            // Spin Gatling barrels when firing
            const gatling = attacker.mesh.getObjectByName("gatlingBarrels");
            if (gatling) gatling.rotation.z += 1.2;

            // --- SIGNATURE C&C GENERALS WEAPON EFFECTS ---

            if (attacker.type === 'overlord') {
                // Overlord Tank DUAL CANNONS!
                const muzzleL = getMuzzleWorldPosition(attacker, -0.45);
                const muzzleR = getMuzzleWorldPosition(attacker, 0.45);
                spawnMuzzleFlash(muzzleL, 0xffa502, 0.9);
                spawnMuzzleFlash(muzzleR, 0xffa502, 0.9);
                spawnBulletTracer(muzzleL, targetPos, 0xff4757, 4);
                spawnBulletTracer(muzzleR, targetPos, 0xff4757, 4);
                playAudio('china_cannon', {}, 'china');
                const ovDmg = (units.includes(attacker) && researchedTechs.has('uraniumShells')) ? 119 : 95;
                target.health -= ovDmg;
            } else if (attacker.type === 'dragon') {
                // Dragon Tank NAPALM FLAMETHROWER!
                spawnFlamethrowerBurst(muzzlePos, targetPos);
                target.health -= 32;
            } else if (attacker.type === 'toxintractor') {
                // Toxin Tractor CHEMICAL ANTHRAX SPRAY!
                spawnToxinSprayBurst(muzzlePos, targetPos);
                target.health -= 30;
            } else if (attacker.type === 'buggy') {
                // Rocket Buggy RIPPLE VOLLEY!
                for (let r = 0; r < 4; r++) {
                    setTimeout(() => {
                        const mPos = getMuzzleWorldPosition(attacker, (r % 2 === 0 ? -0.25 : 0.25));
                        spawnMuzzleFlash(mPos, 0xff9f43, 0.4);
                        spawnRocketProjectile(mPos, targetPos, false, false);
                    }, r * 80);
                }
                target.health -= (units.includes(attacker) && researchedTechs.has('apRockets')) ? 56 : 45;
            } else if (['rocket', 'rpg', 'tankhunter'].includes(attacker.type)) {
                // Shoulder-fired rockets
                spawnMuzzleFlash(muzzlePos, 0xff9f43, 0.5);
                spawnRocketProjectile(muzzlePos, targetPos, false, attacker.type === 'rpg' || attacker.type === 'tankhunter');
                target.health -= (units.includes(attacker) && researchedTechs.has('apRockets') && attacker.type === 'rpg') ? 50 : 40;
            } else if (['tomahawk', 'scud'].includes(attacker.type)) {
                // Heavy cruise / ballistic missile
                spawnMuzzleFlash(muzzlePos, 0xff793f, 1.2);
                spawnRocketProjectile(muzzlePos, targetPos, true, attacker.type === 'scud');
                if (attacker.type === 'tomahawk') playUSASound('missile_launch');
                target.health -= 90;
            } else if (attacker.type === 'inferno') {
                // Inferno Cannon Napalm Artillery
                spawnMuzzleFlash(muzzlePos, 0xff5252, 1.0);
                spawnBulletTracer(muzzlePos, targetPos, 0xff793f, 5);
                setTimeout(() => spawnNapalmScorchPool(targetPos), 300);
                target.health -= 65;
            } else if (attacker.type === 'nukecannon') {
                // Tactical Atomic Shell with Mini-Mushroom Cloud!
                spawnMuzzleFlash(muzzlePos, 0x10ac84, 1.5);
                spawnBulletTracer(muzzlePos, targetPos, 0x10ac84, 6);
                setTimeout(() => spawnMiniNukeMushroom(targetPos), 280);
                target.health -= 140;
            } else if (['battlemaster', 'overlord'].includes(attacker.type)) {
                // China 152mm Smoothbore Twin Cannon
                spawnMuzzleFlash(muzzlePos, 0xff793f, 1.1);
                spawnBulletTracer(muzzlePos, targetPos, 0xf39c12, 3.8);
                playAudio('china_cannon', {}, 'china');
                target.health -= (attacker.type === 'overlord' ? 95 : 45);
            } else if (['gatlingTank', 'gatlingCannon'].includes(attacker.type)) {
                // China Twin 20mm Rotary Gatling Cannon
                spawnMuzzleFlash(muzzlePos, 0xffa502, 0.45);
                spawnBulletTracer(muzzlePos, targetPos, 0xf1c40f, 4.5);
                playAudio('gatling_fire', {}, 'china');
                target.health -= 25;
            } else if (attacker.type === 'dragonTank') {
                // China Dragon Tank Flamethrower
                spawnFlamethrowerBurst(muzzlePos, targetPos);
                playAudio('flamethrower', {}, 'china');
                target.health -= 40;
            } else if (attacker.type === 'nukecannon') {
                // China Nuke Cannon Nuclear Artillery Shell
                deployNukeCannonOutriggers(attacker);
                spawnMuzzleFlash(muzzlePos, 0x2ed573, 1.5);
                playAudio('nuke_artillery', {}, 'china');
                setTimeout(() => {
                    spawnMiniNukeMushroom(targetPos);
                    target.health -= (attacker.neutronShells ? 180 : 140);
                }, 800);
            } else if (['rebel', 'technical'].includes(attacker.type)) {
                // GLA Kalashnikov AK-47 & Technical Heavy MG
                spawnMuzzleFlash(muzzlePos, 0xf1c40f, 0.4);
                spawnBulletTracer(muzzlePos, targetPos, 0xe67e22, 3.0);
                playAudio('ak47', {}, 'gla');
                target.health -= (attacker.type === 'technical' ? 24 : 16);
            } else if (attacker.type === 'scud') {
                // GLA SCUD Launcher Chemical Warhead
                spawnMuzzleFlash(muzzlePos, 0x2ed573, 1.2);
                spawnRocketProjectile(muzzlePos, targetPos, true, true);
                playAudio('scud_launch', {}, 'gla');
                target.health -= 130;
            } else if (attacker.type === 'raptor') {
                // USA Raptor Air-Superiority Fighter: Dual AMRAAM Guided Missiles!
                const mPosL = getMuzzleWorldPosition(attacker, -0.65);
                const mPosR = getMuzzleWorldPosition(attacker, 0.65);
                spawnMuzzleFlash(mPosL, 0xff9f43, 0.5);
                spawnMuzzleFlash(mPosR, 0xff9f43, 0.5);
                spawnRocketProjectile(mPosL, targetPos, false, false);
                setTimeout(() => spawnRocketProjectile(mPosR, targetPos, false, false), 100);
                playUSASound('missile_launch');
                target.health -= 120;
            } else if (attacker.type === 'stealthfighter') {
                // USA Stealth Fighter: Laser-Guided Precision Bunker-Buster Bomb!
                spawnMuzzleFlash(muzzlePos, 0x00d2d3, 0.6);
                spawnGuidedBomb(muzzlePos, targetPos, false);
                playUSASound('missile_launch');
                target.health -= 150;
            } else if (attacker.type === 'aurora') {
                // USA Aurora Hypersonic Bomber: Fuel-Air Cluster Bomb with Massive Shockwave!
                spawnMuzzleFlash(muzzlePos, 0x00d2d3, 1.2);
                spawnGuidedBomb(muzzlePos, targetPos, true);
                playUSASound('aurora_bomb');
                target.health -= 220;
            } else if (attacker.type === 'comanche') {
                // USA Comanche Attack Helicopter: 20mm Rotary Cannon + Hellfire Missiles!
                spawnMuzzleFlash(muzzlePos, 0xffa502, 0.45);
                spawnBulletTracer(muzzlePos, targetPos, 0xffd32a, 3.0);
                const mPosL = getMuzzleWorldPosition(attacker, -0.5);
                const mPosR = getMuzzleWorldPosition(attacker, 0.5);
                setTimeout(() => spawnRocketProjectile(mPosL, targetPos, false, false), 80);
                setTimeout(() => spawnRocketProjectile(mPosR, targetPos, false, false), 180);
                playUSASound('machine_gun');
                playUSASound('missile_launch');
                target.health -= 70;
            } else if (attacker.type === 'paladin') {
                // Paladin Cannon + Point Defense Laser
                spawnMuzzleFlash(muzzlePos, 0xffa502, 0.7);
                spawnBulletTracer(muzzlePos, targetPos, 0xff4757, 3);
                spawnLaserBeam(muzzlePos, targetPos, 0x00d2d3, 3);
                playUSASound('cannon');
                playUSASound('laser');
                target.health -= 55;
                // Paladin Cannon + Point Defense Laser
                spawnMuzzleFlash(muzzlePos, 0xffa502, 0.7);
                spawnBulletTracer(muzzlePos, targetPos, 0xff4757, 3);
                spawnLaserBeam(muzzlePos, targetPos, 0x00d2d3, 3);
                target.health -= 55;
            } else if (attacker.type === 'quad') {
                // Quad Cannon 4x23mm Autocannon Salvo!
                [-0.22, 0.22].forEach(xOff => {
                    const mPos = getMuzzleWorldPosition(attacker, xOff);
                    spawnMuzzleFlash(mPos, 0xffa502, 0.35);
                    spawnBulletTracer(mPos, targetPos, 0xffd32a, 2.5);
                });
                target.health -= (units.includes(attacker) && researchedTechs.has('apBullets')) ? 40 : 32;
            } else if (attacker.type === 'gatling' || attacker.type === 'gatlingCannon') {
                // High-speed Gatling autocannon stream
                spawnMuzzleFlash(muzzlePos, 0xffa502, 0.4);
                spawnBulletTracer(muzzlePos, targetPos, 0xf1c40f, 2.5);
                target.health -= (units.includes(attacker) && researchedTechs.has('chainGuns')) ? 25 : 20;
            } else if (attacker.type === 'jarmen' || attacker.type === 'pathfinder') {
                // Supersonic Sniper Vapor Trail
                spawnMuzzleFlash(muzzlePos, 0xffffff, 0.3);
                spawnLaserBeam(muzzlePos, targetPos, 0xffffff, 2);
                target.health -= 85;
            } else if (['tank', 'crusader', 'battlemaster', 'scorpion', 'marauder'].includes(attacker.type)) {
                // Heavy Tank Cannon
                spawnMuzzleFlash(muzzlePos, 0xffa502, 0.75);
                spawnBulletTracer(muzzlePos, targetPos, 0xff4757, 3.5);
                if (['tank', 'crusader'].includes(attacker.type)) playUSASound('cannon');
                let tkDmg = 50;
                if (units.includes(attacker)) {
                    if (attacker.type === 'battlemaster' && researchedTechs.has('uraniumShells')) tkDmg = 62;
                    else if (attacker.type === 'scorpion' && researchedTechs.has('scorpionRocket')) tkDmg = 70;
                }
                target.health -= tkDmg;
            } else if (attacker.type === 'humvee' || attacker.type === 'technical') {
                // Heavy Machine Gun .50 cal / DShK
                spawnMuzzleFlash(muzzlePos, 0xffa502, 0.45);
                spawnBulletTracer(muzzlePos, targetPos, 0xf39c12, 2.5);
                if (attacker.type === 'humvee') playUSASound('machine_gun');
                let vehDmg = 22;
                if (units.includes(attacker)) {
                    if (attacker.type === 'humvee' && researchedTechs.has('towMissile')) {
                        vehDmg = 35;
                        spawnRocketProjectile(muzzlePos, targetPos, false, false);
                    } else if (attacker.type === 'technical' && researchedTechs.has('apBullets')) {
                        vehDmg = 28;
                    }
                    // Fire-From-Within: Garrisoned infantry fire out through firing ports!
                    if (attacker.garrisoned && attacker.garrisoned.length > 0) {
                        vehDmg += attacker.garrisoned.length * 8;
                    }
                }
                target.health -= vehDmg;
            } else {
                // Assault Rifle burst
                spawnMuzzleFlash(muzzlePos, 0xffa502, 0.25);
                spawnBulletTracer(muzzlePos, targetPos, 0xf1c40f, 1.8);
                let infDmg = (units.includes(attacker) && attacker.type === 'rebel' && researchedTechs.has('apBullets')) ? 20 : 16;
                target.health -= infDmg;
            }

            // Sync damage dealt over WebRTC DataChannel
            if (isMultiplayerActive && netConn && netConn.open && units.includes(attacker) && target && target.netId) {
                broadcastNetPacket({
                    type: 'unit_damage',
                    targetNetId: target.netId,
                    remainingHealth: Math.max(0, target.health)
                });
            }

            // Veterancy promotion check on kill
            if (target && target.health <= 0 && attacker && attacker.kills !== undefined) {
                attacker.kills++;
                if (attacker.kills === 2 && attacker.veterancy < 1) {
                    attacker.veterancy = 1; // Veteran (+20% HP)
                    attacker.maxHealth = Math.floor(attacker.maxHealth * 1.2);
                    attacker.health = attacker.maxHealth;
                    showNotification(`★ ${attacker.type.toUpperCase()} promoted to VETERAN!`, 'info');
                } else if (attacker.kills === 5 && attacker.veterancy < 2) {
                    attacker.veterancy = 2; // Elite (+40% HP)
                    attacker.maxHealth = Math.floor(attacker.maxHealth * 1.2);
                    attacker.health = attacker.maxHealth;
                    showNotification(`★★ ${attacker.type.toUpperCase()} promoted to ELITE!`, 'info');
                } else if (attacker.kills === 10 && attacker.veterancy < 3) {
                    attacker.veterancy = 3; // Heroic (Self-healing & Gold muzzle flash)
                    attacker.maxHealth = Math.floor(attacker.maxHealth * 1.4);
                    attacker.health = attacker.maxHealth;
                    showNotification(`★★★ ${attacker.type.toUpperCase()} achieved HEROIC rank! (Auto-Regeneration Active)`, 'success');
                }
            }
        }

        function activateBlueprint(type) {
            if (blueprintMesh) { scene.remove(blueprintMesh); blueprintMesh = null; }

            // Prerequisite tech tree check!
            const structReq = getStructureTechPrerequisite(type);
            if (structReq && !hasCompletedStructure(structReq.building, structReq.altBuilding)) {
                showNotification(`Construction blocked: Requires operational ${structReq.name}!`, 'error');
                return;
            }

            const cost = getStructureCost(type);
            if (!cost || playerResources < cost) { showNotification("Insufficient resources for construction.", "error"); return; }

            activeBlueprintType = type;
            const footprint = getStructureFootprint(type);
            const size = { x: footprint.width, y: footprint.height, z: footprint.depth };
            const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
            const mat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.4 });
            
            blueprintMesh = new THREE.Mesh(geo, mat);
            blueprintMesh.position.set(0, size.y / 2, 0);
            scene.add(blueprintMesh);
        }

        function updateBlueprintPosition(intersectPoint) {
            if (!blueprintMesh) return;
            blueprintMesh.position.x = intersectPoint.x;
            blueprintMesh.position.z = intersectPoint.z;
            const groundH = getTerrainHeight(intersectPoint.x, intersectPoint.z);
            blueprintMesh.position.y = groundH + getStructureFootprint(activeBlueprintType).height / 2;

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

            // 3. Distance to existing structures
            for (let s of structures) {
                const d = intersectPoint.distanceTo(s.position);
                if (d < (rBoundary + s.radius)) { isBlueprintValid = false; break; }
            }

            // 4. Map edge bounds
            const limit = currentMapSize * 0.44;
            if (Math.abs(intersectPoint.x) > limit || Math.abs(intersectPoint.z) > limit) isBlueprintValid = false;

            blueprintMesh.material.color.setHex(isBlueprintValid ? 0x00ffcc : 0xff4757);
        }
let aiProductionTick = 0;
