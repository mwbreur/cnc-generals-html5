// =========================================================================
// TACTICAL SUBSYSTEMS: STEALTH & DETECTION, POINT DEFENSE LASERS & SALVAGE
// =========================================================================
// Official INIZH.big StealthUpdate:
// - Stationary-only stealth (MOVING breaks cloak): Pathfinder (stays cloaked while firing), Hijacker, Camouflage Rebels
// - Moving stealth (only FIRING/ATTACKING/ABILITY breaks cloak): Stealth Fighter, Scout Drone, Colonel Burton, Black Lotus, Jarmen Kell, Stealth Comanche
const STATIONARY_STEALTH_UNITS = new Set(['pathfinder', 'hijacker']);
const ALWAYS_STEALTH_UNITS = new Set(['stealthfighter', 'drone_scout', 'burton', 'blacklotus', 'jarmen']);

// Retail StealthUpdate: FriendlyOpacityMin = 50% .. FriendlyOpacityMax = 100% (owner/allies always see their stealthed units,
// shimmering between those values). Enemies see nothing until the unit is revealed (firing / detector).
const FRIENDLY_STEALTH_OPACITY_MIN = 0.5;
const FRIENDLY_STEALTH_OPACITY_MAX = 0.85;

function setMeshStealthOpacity(mesh, cloaked, animTimeSec = 0) {
    if (!mesh) return;
    // Per-mesh clone of shared W3D cached materials so cloaking ONE unit never turns every unit of that type translucent
    const shimmer = cloaked
        ? FRIENDLY_STEALTH_OPACITY_MIN + (FRIENDLY_STEALTH_OPACITY_MAX - FRIENDLY_STEALTH_OPACITY_MIN) * (0.5 + 0.5 * Math.sin(animTimeSec * 2.4 + (mesh.id || 0)))
        : 1;
    if (mesh._stealthOpacityApplied === cloaked && (!cloaked || Math.abs((mesh._stealthShimmer || 0) - shimmer) < 0.02)) return;
    mesh._stealthOpacityApplied = cloaked;
    mesh._stealthShimmer = shimmer;
    mesh.traverse(c => {
        if (!c.isMesh || !c.material) return;
        if (cloaked && !c._stealthOwnMat) {
            const src = c.material;
            if (Array.isArray(src)) {
                c.material = src.map(m => { const cl = m.clone(); cl.userData = Object.assign({}, cl.userData, { _shared: false }); return cl; });
            } else {
                c.material = src.clone();
                c.material.userData = Object.assign({}, c.material.userData, { _shared: false });
            }
            c._stealthOwnMat = true;
        }
        if (!c._stealthOwnMat) return;
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        for (let i = 0; i < mats.length; i++) {
            const m = mats[i];
            if (!m) continue;
            if (m.userData._origOpacity === undefined) {
                m.userData._origOpacity = m.opacity !== undefined ? m.opacity : 1.0;
                m.userData._origTransparent = !!m.transparent;
                m.userData._origDepthWrite = m.depthWrite;
            }
            if (cloaked) {
                m.transparent = true;
                m.opacity = m.userData._origOpacity * shimmer;
                m.depthWrite = true;
            } else {
                m.opacity = m.userData._origOpacity;
                m.transparent = m.userData._origTransparent;
                m.depthWrite = m.userData._origDepthWrite;
            }
        }
    });
}


function updateStealthAndDetection(animTimeSec = 0) {
    const allUnits = (typeof units !== 'undefined' && typeof enemyUnits !== 'undefined') ? [...units, ...enemyUnits] : [];
    const allStructs = (typeof structures !== 'undefined' && typeof enemyStructures !== 'undefined') ? [...structures, ...enemyStructures] : [];

    // 1. Update natural cloak / uncloak state for stealth units + GPS Scrambler timed cloak
    const nowStealthMs = Date.now();
    for (let i = 0; i < allUnits.length; i++) {
        const u = allUnits[i];
        if (!u || u.health <= 0) continue;
        const hasComancheStealth = u.type === 'comanche' && !u.isAI && typeof researchedTechs !== 'undefined' && researchedTechs.has('stealthComanche');
        const hasRebelCamo = u.type === 'rebel' && ((!u.isAI && typeof researchedTechs !== 'undefined' && researchedTechs.has('camouflage')) || !!u.hasCamouflage);
        const isStationaryStealth = STATIONARY_STEALTH_UNITS.has(u.type) || hasRebelCamo;
        const isAlwaysStealth = ALWAYS_STEALTH_UNITS.has(u.type) || hasComancheStealth;
        const hasGpsCloak = !!(u.gpsCloakUntil && u.gpsCloakUntil > nowStealthMs);
        if (u.gpsCloakUntil && u.gpsCloakUntil <= nowStealthMs) {
            u.gpsCloakUntil = 0;
            if (!isStationaryStealth && !isAlwaysStealth) {
                u.isStealthed = false;
                if (u.mesh) setMeshStealthOpacity(u.mesh, false, animTimeSec);
            }
        }
        if (!isStationaryStealth && !isAlwaysStealth && !hasGpsCloak) continue;

        const isRevealed = (u.revealedUntil && u.revealedUntil > buildingTick);
        if (isAlwaysStealth || hasGpsCloak) {
            u.isStealthed = !isRevealed;
        } else {
            const isMoving = u.taskState === 'Moving' || (u.waypoints && u.waypoints.length > 0);
            u.isStealthed = !isMoving && !isRevealed;
        }
    }

    // 2. Run stealth detectors (units & defense structures)
    const detectors = [];
    for (let i = 0; i < allUnits.length; i++) {
        const d = allUnits[i];
        if (!d || d.health <= 0 || !d.mesh) continue;
        if (d.detectsStealth || d.overlordUpgrade === 'gatling' || d.type === 'drone_scout') {
            const range = (d.type === 'radarvan' || d.type === 'drone_scout') ? 34 : 26;
            detectors.push({ obj: d, pos: d.mesh.position, range });
        }
    }
    for (let i = 0; i < allStructs.length; i++) {
        const s = allStructs[i];
        if (!s || s.health <= 0 || s.isBuilding || !s.position) continue;
        if (s.type === 'commandCenter' || s.type === 'center' || s.type === 'gatlingCannon' || s.type === 'patriot') {
            detectors.push({ obj: s, pos: s.position, range: 30 });
        }
    }

    for (let i = 0; i < allUnits.length; i++) {
        const u = allUnits[i];
        if (!u || u.health <= 0 || !u.mesh || !u.isStealthed) continue;
        for (let j = 0; j < detectors.length; j++) {
            const det = detectors[j];
            if (isFriendly(u, det.obj)) continue;
            if (u.mesh.position.distanceTo(det.pos) <= det.range) {
                u.revealedUntil = buildingTick + 24;
                u.isStealthed = false;
                break;
            }
        }
    }
    for (let i = 0; i < allStructs.length; i++) {
        const s = allStructs[i];
        if (!s || s.health <= 0 || !s.position) continue;
        // Re-cloak Camo Netted structures automatically once any reveal timer expires
        if (s.hasCamoNetting && !s.isBuilding) s.isStealthed = true;
        if (!s.isStealthed) continue;
        for (let j = 0; j < detectors.length; j++) {
            const det = detectors[j];
            if (isFriendly(s, det.obj)) continue;
            if (s.position.distanceTo(det.pos) <= det.range) {
                s.revealedUntil = buildingTick + 24;
                break;
            }
        }
    }

    // 3. Visual stealth: hide unrevealed enemy stealthed units/structures; shimmer friendly stealthed units
    if (typeof enemyUnits !== 'undefined') {
        for (let i = 0; i < enemyUnits.length; i++) {
            const eu = enemyUnits[i];
            if (!eu || !eu.mesh || eu.health <= 0) continue;
            const hidden = !!(eu.isStealthed && !(eu.revealedUntil && eu.revealedUntil > buildingTick));
            if (hidden) eu.mesh.visible = false;
        }
    }
    if (typeof enemyStructures !== 'undefined') {
        for (let i = 0; i < enemyStructures.length; i++) {
            const es = enemyStructures[i];
            if (!es || !es.mesh || es.health <= 0) continue;
            const hidden = !!(es.isStealthed && !(es.revealedUntil && es.revealedUntil > buildingTick));
            if (hidden) es.mesh.visible = false;
        }
    }
    if (typeof units !== 'undefined') {
        for (let i = 0; i < units.length; i++) {
            const u = units[i];
            if (!u || !u.mesh || u.health <= 0) continue;
            const cloaked = !!(u.isStealthed && !(u.revealedUntil && u.revealedUntil > buildingTick));
            // Owner always sees their own stealthed units (translucent shimmer); only enemies lose sight of them
            if (cloaked && !u.garrisonedIn && !u.mesh.visible && u.health > 0) u.mesh.visible = true;
            setMeshStealthOpacity(u.mesh, cloaked, performance.now() * 0.001);
        }
    }
    if (typeof structures !== 'undefined') {
        for (let i = 0; i < structures.length; i++) {
            const s = structures[i];
            if (!s || !s.mesh || s.health <= 0) continue;
            const cloaked = !!(s.isStealthed && !(s.revealedUntil && s.revealedUntil > buildingTick));
            setMeshStealthOpacity(s.mesh, cloaked, performance.now() * 0.001);
        }
    }
}

function processEnemyCombat() {
    enemyUnits.forEach((enemy, eIdx) => {
            if (enemy.health <= 0 || !enemy.mesh) return;
            if (enemy.isUnmanned || (enemy.disabledUntil && typeof buildingTick !== 'undefined' && buildingTick < enemy.disabledUntil)) return;
            if (enemy.garrisonedIn) {
                const host = enemy.garrisonedIn;
                if (!host || host.health <= 0 || !host.mesh) return;
                enemy.mesh.visible = false;
                const canFireFromInside = host.type === 'overlord' || host.type === 'humvee' || host.type === 'battlebus' || host.type === 'bunker' || host.type === 'palace' || !!host.isWorldBuilding;
                if (!canFireFromInside) return;
                enemy.mesh.position.copy(host.position || host.mesh.position);
                enemy.mesh.position.y += (host.type === 'humvee' || host.type === 'battlebus') ? 1.6 : 4.2;
            }
            if (enemy.attackCooldown > 0) enemy.attackCooldown = Math.max(0, enemy.attackCooldown - combatDeltaScale);
            const effectiveScanRange = enemy.scanRange > 0 ? enemy.scanRange : (enemy.type === 'blacklotus' ? 24 : (enemy.type === 'hijacker' ? 18 : 0));
            if (effectiveScanRange <= 0) return;

            const minRange = (enemy.type === 'nukecannon' || enemy.type === 'nuketank') ? (enemy.minRange || 32.4)
                : (enemy.type === 'tomahawk' ? (enemy.minRange || 21.6)
                : (enemy.type === 'scud' ? (enemy.minRange || 43.2)
                : (enemy.type === 'inferno' ? 10.8 : 0)));
            const distBetween = (aPos, bPos, use3D) => use3D
                ? aPos.distanceTo(bPos)
                : Math.hypot(aPos.x - bPos.x, aPos.z - bPos.z);

            let fireTarget = enemy.combatTarget;
            if (fireTarget && (fireTarget.health <= 0 || isFriendly(enemy, fireTarget))) {
                enemy.combatTarget = null;
                fireTarget = null;
            }

            let targetPos = fireTarget ? (fireTarget.position || (fireTarget.mesh && fireTarget.mesh.position)) : null;
            let targetRadius = fireTarget ? (fireTarget.radius || 0) : 0;
            let distToTarget = targetPos ? distBetween(enemy.mesh.position, targetPos, !!(enemy.isAir || (fireTarget && fireTarget.isAir))) : Infinity;
            let canHitTarget = fireTarget ? ((typeof canUnitTarget === 'function') ? canUnitTarget(enemy, fireTarget) : !(enemy.type === 'tomahawk' && fireTarget.isAir)) : false;

            // Fire-on-the-move auto-scan across ALL hostile units & structures (player AND hostile AI teams!)
            if (!fireTarget || !targetPos || distToTarget > (effectiveScanRange + targetRadius) || distToTarget < minRange || !canHitTarget) {
                if ((buildingTick + eIdx) % 3 === 0 || enemy.attackCooldown === 0) {
                    let bestOpp = null;
                    let bestDist = Infinity;
                    const checkList = (arr, defaultR) => {
                        if (!arr) return;
                        for (let i = 0; i < arr.length; i++) {
                            const cand = arr[i];
                            if (!cand || cand === enemy || cand.health <= 0 || cand.garrisonedIn || isFriendly(enemy, cand)) continue;
                            if (cand.isStealthed && !(cand.revealedUntil && cand.revealedUntil > buildingTick)) continue;
                            const cPos = cand.position || (cand.mesh && cand.mesh.position);
                            if (!cPos) continue;
                            if (typeof canUnitTarget === 'function' && !canUnitTarget(enemy, cand)) continue;
                            const cR = cand.radius || defaultR;
                            const d = distBetween(enemy.mesh.position, cPos, !!(enemy.isAir || cand.isAir));
                            if (d <= effectiveScanRange + cR && d >= minRange && d < bestDist) {
                                if (effectiveScanRange <= (enemy.visionRange || effectiveScanRange) || (typeof isTargetSpottedForUnit === 'function' && isTargetSpottedForUnit(enemy, cPos, cR))) {
                                    bestDist = d;
                                    bestOpp = cand;
                                }
                            }
                        }
                    };
                    checkList(units, 1.5);
                    checkList(enemyUnits, 1.5);
                    if (!bestOpp) {
                        checkList(structures, 6.0);
                        checkList(enemyStructures, 6.0);
                    }
                    if (bestOpp) {
                        fireTarget = bestOpp;
                        targetPos = fireTarget.position || fireTarget.mesh.position;
                        targetRadius = fireTarget.radius || 0;
                        distToTarget = bestDist;
                        canHitTarget = true;
                        if (!enemy.combatTarget) enemy.combatTarget = bestOpp;
                    }
                }
            }

            if (fireTarget && targetPos && distToTarget <= (effectiveScanRange + targetRadius) && distToTarget >= minRange && canHitTarget) {
                // Official C&C Generals AssaultTransportAIUpdate: China Troop Crawler automatically unloads its Red Guard squad upon entering combat!
                if (enemy.type === 'crawler' && enemy.garrisoned && enemy.garrisoned.length > 0 && typeof evacuateGarrisonedUnits === 'function') {
                    const deployed = enemy.garrisoned.slice();
                    evacuateGarrisonedUnits(enemy);
                    deployed.forEach(p => {
                        p._releasedForAttack = true;
                        p.combatTarget = fireTarget;
                    });
                }
                const turret = getCachedNode(enemy.mesh, "turretSystem");
                if (turret && turret.parent) {
                    const localTarget = turret.parent.worldToLocal(targetPos.clone());
                    turret.rotation.y = Math.atan2(localTarget.x, localTarget.z);
                }
                if (enemy.attackCooldown === 0) {
                    executeWeaponFire(enemy, fireTarget);
                }
            }
    });
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
    const allLivingUnits = (typeof units !== 'undefined' && typeof enemyUnits !== 'undefined')
    ? [...units, ...enemyUnits] : [];
    if (allLivingUnits.length === 0) return;

    allLivingUnits.forEach(defender => {
            if (defender.health <= 0 || !defender.mesh) return;

            const hasPDL = (defender.type === 'paladin') || (defender.type === 'avenger') || (defender.drone && defender.drone.type === 'battle');
            if (!hasPDL) return;

            if (defender.pdlCooldown > 0) {
                defender.pdlCooldown = Math.max(0, defender.pdlCooldown - (typeof combatDeltaScale !== 'undefined' ? combatDeltaScale : 1.0));
                return;
            }

            // Official INIZH.big PDL Weapon AttackRange (scaled to world units: Paladin 65 -> 11.5u, Avenger 100 -> 18.0u, Battle Drone -> 10.0u)
            const scanRange = (defender.type === 'avenger') ? 18.0 : ((defender.type === 'paladin') ? 11.5 : 10.0);
            const myPos = defender.mesh.position;
            const usesOwnPDL = (defender.type === 'paladin' || defender.type === 'avenger');
            const pdlOrigin = (!usesOwnPDL && defender.drone && defender.drone.mesh)
                ? defender.drone.mesh.position.clone()
                : myPos.clone().add(new THREE.Vector3(0, 1.8, 0));

            if (typeof activeMissiles !== 'undefined' && activeMissiles.length > 0) {
                for (let missile of activeMissiles) {
                    if (missile.intercepted) continue;
                    const attacker = missile.metadata ? missile.metadata.attacker : null;
                    const mTarget = missile.metadata ? missile.metadata.target : null;
                    if (typeof isFriendly === 'function') {
                        if (attacker && isFriendly(defender, attacker)) continue;
                        if (!attacker && (!mTarget || !isFriendly(defender, mTarget))) continue;
                        if (mTarget && !isFriendly(defender, mTarget)) continue;
                    }

                    const mPos = (missile.group && missile.group.position) ? missile.group.position : missile.curPos;
                    const dist = pdlOrigin.distanceTo(mPos);
                    if (dist <= scanRange) {
                        // Intercept missile in mid-air!
                        missile.intercepted = true;
                        if (typeof spawnLaserBeam === 'function') spawnLaserBeam(pdlOrigin, mPos, 0x00ffff, 2.8);
                        if (typeof spawnMuzzleFlash === 'function') spawnMuzzleFlash(pdlOrigin, 0x00ffff, 0.4);
                        playAudio('laser_point_defense', { pos: pdlOrigin });
                        defender.pdlCooldown = (defender.type === 'avenger') ? 35 : ((defender.type === 'paladin') ? 65 : 85);

                        if (typeof showNotification === 'function' && typeof units !== 'undefined' && units.includes(defender)) {
                            showNotification('★ Point Defense Laser intercepted hostile missile!', 'info');
                        }
                        return;
                    }
                }
            }

            // Authentic Paladin Tank Anti-Infantry Laser Zap (when no missiles need interception)
            if (defender.type === 'paladin' && defender.pdlCooldown === 0) {
                const infRangeSq = 11.0 * 11.0;
                const hostileInf = allLivingUnits.find(e =>
                    e.health > 0 && e.mesh && !e.isAir && !isFriendly(defender, e) &&
                    (typeof getArmorCategory === 'function' ? getArmorCategory(e) === 'infantry' : false) &&
                    myPos.distanceToSquared(e.mesh.position) <= infRangeSq
                );
                if (hostileInf) {
                    const laserOrigin = myPos.clone().add(new THREE.Vector3(0, 1.8, 0));
                    if (typeof spawnLaserBeam === 'function') spawnLaserBeam(laserOrigin, hostileInf.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 0x00ffff, 2.5);
                    if (typeof spawnMuzzleFlash === 'function') spawnMuzzleFlash(laserOrigin, 0x00ffff, 0.35);
                    playAudio('laser_point_defense', { pos: laserOrigin });
                    defender.pdlCooldown = 75;
                    if (typeof applyCalculatedDamage === 'function') {
                        applyCalculatedDamage(defender, hostileInf, 40, 'SNIPER');
                    }
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

        const weaponSalvagers = ['technical', 'scorpion', 'marauder', 'quad', 'buggy', 'toxintractor', 'battlebus'];
        const glaSalvagers = [...weaponSalvagers, 'scud', 'bombtruck', 'radarvan'];
        for (let u of allLivingUnits) {
            if (u.health > 0 && u.mesh && glaSalvagers.includes(u.type)) {
                const d = Math.hypot(u.mesh.position.x - crate.position.x, u.mesh.position.z - crate.position.z);
                if (d <= (u.radius || 1.5) + 1.5) {
                    // Pick up crate!
                    scene.remove(crate.mesh);
                    crate.mesh.traverse(child => {
                            if (child.geometry && !(child.geometry.userData && child.geometry.userData._shared)) child.geometry.dispose();
                            if (child.material && !(child.material.userData && child.material.userData._shared)) child.material.dispose();
                    });
                    activeScrapCrates.splice(cIdx, 1);
                    playAudio('scrap_pickup', {}, 'gla');
                    if (typeof spawnMuzzleFlash === 'function') spawnMuzzleFlash(u.mesh.position, 0x2ed573, 1.2);

                    if (weaponSalvagers.includes(u.type) && (u.salvageLevel || 0) < 2) {
                        u.salvageLevel = (u.salvageLevel || 0) + 1;
                        if (u.salvageLevel === 1) {
                            if (u.type === 'battlebus') {
                                u.maxHealth = Math.floor(u.maxHealth * 1.15);
                                u.health = Math.min(u.maxHealth, u.health + Math.floor(u.maxHealth * 0.2));
                            }
                            if (typeof showNotification === 'function' && typeof units !== 'undefined' && units.includes(u)) {
                                showNotification(`★ ${u.type.toUpperCase()} salvaged scrap: ${u.type === 'battlebus' ? 'ARMOR PLATING' : 'WEAPONS'} UPGRADED!`, 'success');
                            }
                        } else if (u.salvageLevel === 2) {
                            u.maxHealth = Math.floor(u.maxHealth * 1.3);
                            u.health = u.maxHealth;
                            if (typeof showNotification === 'function' && typeof units !== 'undefined' && units.includes(u)) {
                                showNotification(`★★ ${u.type.toUpperCase()} salvaged scrap: HEAVY ARMOR MAXED!`, 'success');
                            }
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
