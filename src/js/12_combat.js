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

                // Autonomous Overlord Roof Gatling Cannon (Anti-Air & Anti-Infantry)
                if (unit.type === 'overlord' && unit.overlordUpgrade === 'gatling' && unit.health > 0) {
                    if (unit.overlordGatCooldown === undefined) unit.overlordGatCooldown = 0;
                    if (unit.overlordGatCooldown > 0) unit.overlordGatCooldown = Math.max(0, unit.overlordGatCooldown - combatDeltaScale);
                    if (unit.overlordGatCooldown === 0) {
                        const hostiles = (typeof enemyUnits !== 'undefined' ? enemyUnits : []).filter(e => e.health > 0 && e.mesh && !isFriendly(unit, e));
                        let bestTarget = null;
                        let bestScore = -Infinity;
                        hostiles.forEach(h => {
                            const d = unit.mesh.position.distanceTo(h.mesh.position);
                            if (d <= 28) {
                                let score = 100 - d;
                                if (h.isAir) score += 60; // Prioritize airborne aircraft!
                                if (getArmorCategory(h) === 'infantry') score += 30;
                                if (score > bestScore) { bestScore = score; bestTarget = h; }
                            }
                        });
                        if (bestTarget) {
                            unit.overlordGatCooldown = 18; // ~0.3s rapid fire!
                            const upgMesh = unit.overlordUpgradeMesh || unit.mesh.getObjectByName("overlordUpgrade");
                            const muzzle = upgMesh ? upgMesh.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.6, 0)) : unit.mesh.position.clone().add(new THREE.Vector3(0, 2.2, 0));
                            const tPos = (bestTarget.position || bestTarget.mesh.position).clone();
                            tPos.y += (bestTarget.isAir ? 0.3 : 0.6);
                            const barrels = unit.mesh.getObjectByName("gatlingBarrels") || (upgMesh && upgMesh.getObjectByName("gatlingBarrels"));
                            if (barrels) barrels.rotation.z += 1.6;
                            spawnMuzzleFlash(muzzle, 0xffa502, 0.4);
                            spawnBulletTracer(muzzle, tPos, 0xf1c40f, 2.8);
                            if (Math.random() < 0.35 && typeof playAudio === 'function') playAudio('gatling', {}, 'china');
                            applyCalculatedDamage(unit, bestTarget, 16, 'GATLING');
                        }
                    }
                }

                // If combat target is friendly ally, clear immediately
                if (unit.combatTarget && isFriendly(unit, unit.combatTarget)) {
                    unit.combatTarget = null;
                }

                // Auto-Scan fallback loop if completely idle (Only engage hostile targets!)
                if (!unit.combatTarget && unit.type !== 'chinook' && unit.type !== 'truck' && unit.type !== 'worker' && unit.type !== 'dozer') {
                    if (!(unit.isAir && unit.taskState === 'Moving')) {
                    // 1. Scan for nearest hostile units (Skip friendly allies!)
                    if (enemyUnits.length > 0) {
                        for (let enemy of enemyUnits) {
                            if (enemy.health > 0 && enemy.mesh && !isFriendly(unit, enemy)) {
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
                            if (struct.health > 0 && struct.mesh && !isFriendly(unit, struct)) {
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
                }
            });
        }

        // =========================================================================
// AUTHENTIC SAGE ENGINE DAMAGE & ARMOR MULTIPLIER MATRIX (Damage.h & Armor.h)
// =========================================================================
const DAMAGE_TYPES = {
    SMALL_ARMS: 'SMALL_ARMS',
    GATLING: 'GATLING',
    ARMOR_PIERCING: 'ARMOR_PIERCING',
    EXPLOSIVE: 'EXPLOSIVE',
    SNIPER: 'SNIPER',
    FLAME: 'FLAME',
    TOXIN: 'TOXIN',
    CRUSH: 'CRUSH'
};

const ARMOR_COEFFICIENTS = {
    infantry: {
        SMALL_ARMS: 1.0,
        GATLING: 1.5,
        ARMOR_PIERCING: 0.35,
        EXPLOSIVE: 0.8,
        SNIPER: 3.0,
        FLAME: 1.5,
        TOXIN: 1.5,
        CRUSH: 10.0
    },
    light_vehicle: {
        SMALL_ARMS: 0.5,
        GATLING: 1.0,
        ARMOR_PIERCING: 1.35,
        EXPLOSIVE: 1.2,
        SNIPER: 0.1,
        FLAME: 0.85,
        TOXIN: 0.6,
        CRUSH: 0.0
    },
    heavy_vehicle: {
        SMALL_ARMS: 0.2,
        GATLING: 0.45,
        ARMOR_PIERCING: 1.0,
        EXPLOSIVE: 1.0,
        SNIPER: 0.05,
        FLAME: 0.5,
        TOXIN: 0.4,
        CRUSH: 0.0
    },
    aircraft: {
        SMALL_ARMS: 0.6,
        GATLING: 1.5,
        ARMOR_PIERCING: 0.4,
        EXPLOSIVE: 1.3,
        SNIPER: 0.0,
        FLAME: 0.0,
        TOXIN: 0.0,
        CRUSH: 0.0
    },
    building: {
        SMALL_ARMS: 0.25,
        GATLING: 0.4,
        ARMOR_PIERCING: 0.85,
        EXPLOSIVE: 1.35,
        SNIPER: 0.0,
        FLAME: 1.25,
        TOXIN: 0.25,
        CRUSH: 0.0
    }
};

function getArmorCategory(target) {
    if (!target) return 'infantry';
    if (target.radius >= 4 || target.isBuilding || target.productionQueue || ['center', 'power', 'nuclearReactor', 'barracks', 'factory', 'airfield', 'supplyCenter', 'supplyStash', 'supplyDrop', 'bunker', 'patriot', 'gatlingCannon', 'speakerTower', 'stingerSite', 'palace', 'scudStorm', 'particleCannon', 'nukeSilo', 'strategyCenter', 'detentionCamp', 'internetCenter', 'propagandaCenter', 'tunnel', 'demoTrap'].includes(target.type)) {
        return 'building';
    }
    if (target.isAir) return 'aircraft';
    if (['ranger', 'infantry', 'redguard', 'rebel', 'rocket', 'rpg', 'tankhunter', 'pathfinder', 'jarmen', 'worker'].includes(target.type)) {
        return 'infantry';
    }
    if (['humvee', 'technical', 'buggy', 'dragon', 'toxintractor', 'truck', 'dozer', 'quad'].includes(target.type)) {
        return 'light_vehicle';
    }
    return 'heavy_vehicle';
}

function applyCalculatedDamage(attacker, target, baseDamage, damageType = 'ARMOR_PIERCING') {
    if (!target || target.health <= 0) return;

    // Aircraft Defensive Flare Countermeasures: 40% chance to deflect missile/anti-air damage
    if (typeof units !== 'undefined' && units.includes(target) && typeof researchedTechs !== 'undefined' && researchedTechs.has('countermeasures') && target.isAir && Math.random() < 0.40) {
        if (target.mesh && typeof spawnSmokePuff === 'function') spawnSmokePuff(target.mesh.position, 0xffd700, 0.4);
        return; // Deflected!
    }

    const cat = getArmorCategory(target);
    const mult = (ARMOR_COEFFICIENTS[cat] && ARMOR_COEFFICIENTS[cat][damageType] !== undefined)
        ? ARMOR_COEFFICIENTS[cat][damageType]
        : 1.0;
    
    let finalDmg = Math.max(1, Math.round(baseDamage * mult));

    // Attacker offensive buffs (USA Strategy Center Bombardment: +20% damage)
    if (typeof battlePlan !== 'undefined' && battlePlan === 'bombard' && typeof units !== 'undefined' && units.includes(attacker)) {
        finalDmg = Math.round(finalDmg * 1.20);
    }
    // China Horde Bonus: 5+ friendly horde units (Red Guard, Battlemaster) within 22m grant +20% damage (+35% with Nationalism)
    if (attacker && (attacker.type === 'redguard' || attacker.type === 'battlemaster' || attacker.type === 'infantry' || attacker.type === 'tank') && (attacker.faction === 'china' || attacker.isChina || (typeof selectedFaction !== 'undefined' && selectedFaction === 'china' && units.includes(attacker)))) {
        const friendlies = (typeof units !== 'undefined' && units.includes(attacker)) ? units : (typeof enemyUnits !== 'undefined' ? enemyUnits : []);
        let hordeCount = 0;
        const aPos = attacker.mesh ? attacker.mesh.position : attacker.position;
        if (aPos) {
            const aX = aPos.x;
            const aZ = aPos.z;
            for (let i = 0; i < friendlies.length; i++) {
                const f = friendlies[i];
                if (f.health > 0 && f.mesh && (f.type === 'redguard' || f.type === 'battlemaster' || f.type === 'infantry' || f.type === 'tank')) {
                    const dx = aX - f.mesh.position.x;
                    const dz = aZ - f.mesh.position.z;
                    if (dx * dx + dz * dz <= 484) { // 22^2
                        hordeCount++;
                        if (hordeCount >= 5) break;
                    }
                }
            }
        }
        if (hordeCount >= 5) {
            const hordeFactor = (typeof researchedTechs !== 'undefined' && researchedTechs.has('nationalism')) ? 1.35 : 1.20;
            finalDmg = Math.round(finalDmg * hordeFactor);
            attacker.isHordeActive = true;
        } else {
            attacker.isHordeActive = false;
        }
    }

    // Additional Tech Munition Buffs (Attacker)
    if (typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined') {
        if (researchedTechs.has('laserMissiles') && ['raptor', 'comanche', 'stealthfighter'].includes(attacker.type)) {
            finalDmg = Math.round(finalDmg * 1.25);
        }
        if (researchedTechs.has('blackNapalm') && (damageType === 'FIRE' || damageType === 'FLAME' || ['dragon', 'inferno'].includes(attacker.type))) {
            finalDmg = Math.round(finalDmg * 1.30);
        }
        if (researchedTechs.has('anthraxBeta') && (damageType === 'TOXIN' || ['toxintractor', 'scud'].includes(attacker.type))) {
            finalDmg = Math.round(finalDmg * 1.25);
        }
        if (researchedTechs.has('armTheMob') && attacker.type === 'mob') {
            finalDmg = Math.round(finalDmg * 2.0);
        }
        if (researchedTechs.has('apBullets') && ['rebel', 'technical', 'quad'].includes(attacker.type)) {
            finalDmg = Math.round(finalDmg * 1.25);
        }
        if (researchedTechs.has('apRockets') && ['rpg', 'scorpion', 'buggy'].includes(attacker.type)) {
            finalDmg = Math.round(finalDmg * 1.25);
        }
        if (researchedTechs.has('chainGuns') && (attacker.type === 'gatling' || attacker.type === 'gatlingCannon')) {
            finalDmg = Math.round(finalDmg * 1.25);
        }
        if (researchedTechs.has('uraniumShells') && (attacker.type === 'battlemaster' || attacker.type === 'overlord')) {
            finalDmg = Math.round(finalDmg * 1.25);
        }
    }

    // Target defensive upgrade buffs (USA Strategy Center Hold the Line: +20% armor / -20% damage taken)
    if (typeof battlePlan !== 'undefined' && battlePlan === 'hold' && typeof units !== 'undefined' && units.includes(target)) {
        finalDmg = Math.max(1, Math.round(finalDmg * 0.80));
    }
    if (target.salvageLevel >= 2) finalDmg = Math.max(1, Math.round(finalDmg * 0.8)); // GLA Level 2 Scrap Armor
    if (target.compositeArmor) finalDmg = Math.max(1, Math.round(finalDmg * 0.85)); // USA Composite Armor

    // Target Tech Protection Buffs
    if (typeof researchedTechs !== 'undefined') {
        if (researchedTechs.has('chemicalSuits') && typeof units !== 'undefined' && units.includes(target) && (damageType === 'TOXIN' || damageType === 'RADIATION')) {
            finalDmg = Math.max(1, Math.round(finalDmg * 0.50)); // -50% chemical & radiation damage
        }
        if (researchedTechs.has('droneArmor') && (target.type === 'drone' || target.drone)) {
            finalDmg = Math.max(1, Math.round(finalDmg * 0.75));
        }
        if (researchedTechs.has('fortifiedStructures') && typeof structures !== 'undefined' && structures.includes(target)) {
            finalDmg = Math.max(1, Math.round(finalDmg * 0.75));
        }
        if (researchedTechs.has('migArmor') && typeof units !== 'undefined' && units.includes(target) && target.type === 'raptor' && (target.faction === 'china' || target.isChina || selectedFaction === 'china')) {
            finalDmg = Math.max(1, Math.round(finalDmg * 0.75));
        }
    }

    target.health = Math.max(0, target.health - finalDmg);

    // Sync damage dealt over WebRTC DataChannel
    if (typeof isMultiplayerActive !== 'undefined' && isMultiplayerActive && typeof netConn !== 'undefined' && netConn && netConn.open && typeof units !== 'undefined' && units.includes(attacker) && target && target.netId) {
        broadcastNetPacket({
            type: 'unit_damage',
            targetNetId: target.netId,
            remainingHealth: target.health
        });
    }

    // Check veterancy promotion on kill
    if (target.health <= 0 && attacker && attacker.kills !== undefined) {
        attacker.kills = (attacker.kills || 0) + 1;
        checkVeterancyPromotion(attacker);
    }
}

function checkVeterancyPromotion(unit) {
    if (!unit || unit.health <= 0) return;
    const reqFactor = (typeof researchedTechs !== 'undefined' && (researchedTechs.has('advancedTraining') || unit.advancedTraining)) ? 0.5 : 1.0;
    const v1 = Math.ceil(2 * reqFactor);
    const v2 = Math.ceil(5 * reqFactor);
    const v3 = Math.ceil(10 * reqFactor);

    if (unit.kills >= v1 && (!unit.veterancy || unit.veterancy < 1)) {
        unit.veterancy = 1; // Veteran (+20% HP)
        const oldMax = unit.maxHealth;
        unit.maxHealth = Math.floor(unit.maxHealth * 1.2);
        unit.health = Math.min(unit.maxHealth, unit.health + (unit.maxHealth - oldMax));
        if (typeof showNotification === 'function') {
            showNotification(`★ ${unit.type.toUpperCase()} promoted to VETERAN! (+20% HP, +2 HP/s Heal)`, 'info');
        }
    } else if (unit.kills >= v2 && (!unit.veterancy || unit.veterancy < 2)) {
        unit.veterancy = 2; // Elite (+40% HP from base, +25% Fire Rate)
        const oldMax = unit.maxHealth;
        unit.maxHealth = Math.floor(unit.maxHealth * (1.4 / 1.2));
        unit.health = Math.min(unit.maxHealth, unit.health + (unit.maxHealth - oldMax));
        if (typeof showNotification === 'function') {
            showNotification(`★★ ${unit.type.toUpperCase()} promoted to ELITE! (+40% HP, +25% ROF, +4 HP/s Heal)`, 'info');
        }
    } else if (unit.kills >= v3 && (!unit.veterancy || unit.veterancy < 3)) {
        unit.veterancy = 3; // Heroic (+60% HP from base, +50% Fire Rate, Heroic Crimson Laser Tracers)
        const oldMax = unit.maxHealth;
        unit.maxHealth = Math.floor(unit.maxHealth * (1.6 / 1.4));
        unit.health = Math.min(unit.maxHealth, unit.health + (unit.maxHealth - oldMax));
        if (typeof showNotification === 'function') {
            showNotification(`★★★ ${unit.type.toUpperCase()} achieved HEROIC rank! (+60% HP, +50% ROF, +6 HP/s Heal, Heroic Red Tracers)`, 'success');
        }
    }
}

function executeWeaponFire(attacker, target) {
    // Never fire weapon or deal damage to friendly teammates / allies!
    if (!attacker || !target || isFriendly(attacker, target)) {
        if (attacker && attacker.combatTarget === target) attacker.combatTarget = null;
        return;
    }
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
    let baseCooldown = cncCooldowns[attacker.type] || 160;

    // Authentic Gatling Spool-Up Fire Rate Acceleration
    if (attacker.type === 'gatling' || attacker.type === 'gatlingCannon') {
        attacker.gatlingSpin = Math.min(6, (attacker.gatlingSpin || 0) + 1);
        baseCooldown = Math.max(13, Math.round(baseCooldown - attacker.gatlingSpin * 2.5));
    } else if (attacker.gatlingSpin) {
        attacker.gatlingSpin = 0;
    }

    // Authentic Veterancy Fire Rate Bonus (ExperienceTracker.cpp)
    if (attacker.veterancy === 2) {
        baseCooldown = Math.floor(baseCooldown * 0.80); // Elite: 1.25x ROF
    } else if (attacker.veterancy === 3) {
        baseCooldown = Math.floor(baseCooldown * 0.65); // Heroic: 1.50x ROF
    }

    attacker.attackCooldown = baseCooldown;

    if (attacker.isHordeActive) {
        const hordeFactor = (typeof researchedTechs !== 'undefined' && researchedTechs.has('nationalism')) ? 0.60 : 0.75;
        attacker.attackCooldown = Math.max(6, Math.floor(attacker.attackCooldown * hordeFactor)); // China Horde: +25% fire-rate (+40% with Nationalism)
    }
    // China Autoloader Tech: Battlemaster tanks fire +25% faster
    if (typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined' && researchedTechs.has('autoloader') && attacker.type === 'battlemaster') {
        attacker.attackCooldown = Math.max(6, Math.floor(attacker.attackCooldown * 0.75));
    }
    if (typeof battlePlan !== 'undefined' && battlePlan === 'search' && typeof units !== 'undefined' && units.includes(attacker)) attacker.attackCooldown = Math.floor(attacker.attackCooldown * 0.75);
    if (typeof battlePlan !== 'undefined' && battlePlan === 'hold' && typeof units !== 'undefined' && units.includes(attacker)) attacker.attackCooldown = Math.floor(attacker.attackCooldown * 1.25);

    const targetPos = (target.position || target.mesh.position).clone();
    targetPos.y += (target.isAir ? 0.2 : 0.5);

    const muzzlePos = getMuzzleWorldPosition(attacker);

    // Spin Gatling barrels when firing
    const gatling = attacker.mesh.getObjectByName("gatlingBarrels");
    if (gatling) gatling.rotation.z += 1.2;

    // Authentic Heroic Tracers (Heroic rank units fire intense red laser tracers!)
    const isHeroic = (attacker.veterancy === 3);
    const heroicTracerColor = 0xff2222;
    const heroicFlashColor = 0xff1111;

    // --- SIGNATURE C&C GENERALS WEAPON EFFECTS & DAMAGE APPLICATION ---

    if (attacker.type === 'overlord') {
        // Overlord Tank DUAL CANNONS!
        const muzzleL = getMuzzleWorldPosition(attacker, -0.45);
        const muzzleR = getMuzzleWorldPosition(attacker, 0.45);
        spawnMuzzleFlash(muzzleL, isHeroic ? heroicFlashColor : 0xffa502, 0.9);
        spawnMuzzleFlash(muzzleR, isHeroic ? heroicFlashColor : 0xffa502, 0.9);
        spawnBulletTracer(muzzleL, targetPos, isHeroic ? heroicTracerColor : 0xff4757, 4.2);
        spawnBulletTracer(muzzleR, targetPos, isHeroic ? heroicTracerColor : 0xff4757, 4.2);
        playAudio('china_cannon', {}, 'china');
        const ovDmg = (typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined' && researchedTechs.has('uraniumShells')) ? 119 : 95;
        applyCalculatedDamage(attacker, target, ovDmg, 'ARMOR_PIERCING');

        // Overlord Gatling Cannon Upgrade Firing!
        if (attacker.overlordUpgrade === 'gatling') {
            const upgMesh = attacker.overlordUpgradeMesh || attacker.mesh.getObjectByName("overlordUpgrade");
            const gatPos = upgMesh ? upgMesh.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.6, 0)) : muzzleL;
            const barrels = attacker.mesh.getObjectByName("gatlingBarrels") || (upgMesh && upgMesh.getObjectByName("gatlingBarrels"));
            if (barrels) barrels.rotation.z += 1.8;
            for (let b = 0; b < 3; b++) {
                setTimeout(() => {
                    spawnMuzzleFlash(gatPos, 0xffa502, 0.35);
                    spawnBulletTracer(gatPos, targetPos, 0xf1c40f, 2.8);
                }, b * 50);
            }
            if (typeof playAudio === 'function') playAudio('gatling', {}, 'china');
            applyCalculatedDamage(attacker, target, 24, 'GATLING');
        }
    } else if (attacker.type === 'dragon') {
        // Dragon Tank NAPALM FLAMETHROWER!
        spawnFlamethrowerBurst(muzzlePos, targetPos);
        applyCalculatedDamage(attacker, target, 35, 'FLAME');
    } else if (attacker.type === 'toxintractor') {
        // Toxin Tractor CHEMICAL ANTHRAX SPRAY!
        spawnToxinSprayBurst(muzzlePos, targetPos);
        applyCalculatedDamage(attacker, target, 32, 'TOXIN');
    } else if (attacker.type === 'buggy') {
        // Rocket Buggy RIPPLE VOLLEY! (8 rockets with Buggy Ammo Chains)
        const rDmg = (typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined' && researchedTechs.has('apRockets')) ? 15 : 12;
        const rCount = (typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined' && researchedTechs.has('buggyAmmo')) ? 8 : 4;
        for (let r = 0; r < rCount; r++) {
            setTimeout(() => {
                const mPos = getMuzzleWorldPosition(attacker, (r % 2 === 0 ? -0.25 : 0.25));
                spawnMuzzleFlash(mPos, 0xff9f43, 0.4);
                spawnRocketProjectile(mPos, targetPos, false, false, {
                    attacker: attacker,
                    target: target,
                    damage: rDmg,
                    damageType: 'EXPLOSIVE',
                    splashRadius: 1.5
                });
            }, r * 80);
        }
    } else if (['rocket', 'rpg', 'tankhunter'].includes(attacker.type)) {
        // Shoulder-fired rockets (Tracked for Point Defense Laser interception!)
        spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : 0xff9f43, 0.5);
        const rDmg = (typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined' && researchedTechs.has('apRockets') && attacker.type === 'rpg') ? 52 : 42;
        spawnRocketProjectile(muzzlePos, targetPos, false, attacker.type === 'rpg' || attacker.type === 'tankhunter', {
            attacker: attacker,
            target: target,
            damage: rDmg,
            damageType: 'EXPLOSIVE',
            splashRadius: 2.0
        });
    } else if (['tomahawk', 'scud'].includes(attacker.type)) {
        // Heavy cruise / ballistic missile (Tracked for Point Defense Laser interception!)
        spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : 0xff793f, 1.2);
        const mDmg = attacker.type === 'scud' ? 130 : 95;
        spawnRocketProjectile(muzzlePos, targetPos, true, attacker.type === 'scud', {
            attacker: attacker,
            target: target,
            damage: mDmg,
            damageType: 'EXPLOSIVE',
            splashRadius: 5.5
        });
        if (attacker.type === 'tomahawk') playUSASound('missile_launch');
        if (attacker.type === 'scud') playAudio('scud_launch', {}, 'gla');
    } else if (attacker.type === 'inferno') {
        // Inferno Cannon Napalm Artillery
        spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : 0xff5252, 1.0);
        spawnBulletTracer(muzzlePos, targetPos, isHeroic ? heroicTracerColor : 0xff793f, 5);
        setTimeout(() => spawnNapalmScorchPool(targetPos), 300);
        applyCalculatedDamage(attacker, target, 65, 'FLAME');
    } else if (attacker.type === 'nukecannon' || attacker.type === 'nuketank') {
        // Tactical Atomic Shell with Mini-Mushroom Cloud!
        deployNukeCannonOutriggers(attacker);
        spawnMuzzleFlash(muzzlePos, 0x10ac84, 1.5);
        spawnBulletTracer(muzzlePos, targetPos, 0x10ac84, 6);
        playAudio('nuke_artillery', {}, 'china');
        setTimeout(() => {
            spawnMiniNukeMushroom(targetPos);
            applyCalculatedDamage(attacker, target, (attacker.neutronShells ? 180 : 140), 'EXPLOSIVE');
        }, 750);
    } else if (['battlemaster'].includes(attacker.type)) {
        // China 152mm Smoothbore Cannon
        spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : 0xff793f, 1.1);
        spawnBulletTracer(muzzlePos, targetPos, isHeroic ? heroicTracerColor : 0xf39c12, 3.8);
        playAudio('china_cannon', {}, 'china');
        if (typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined' && researchedTechs.has('toxinShells')) {
            if (typeof spawnLingeringToxinCloud === 'function') spawnLingeringToxinCloud(targetPos);
        }
        const bmDmg = (typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined' && researchedTechs.has('uraniumShells')) ? 62 : 48;
        applyCalculatedDamage(attacker, target, bmDmg, 'ARMOR_PIERCING');
    } else if (['gatlingTank', 'gatlingCannon', 'gatling'].includes(attacker.type)) {
        // China Twin 20mm Rotary Gatling Cannon
        spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : 0xffa502, 0.45);
        spawnBulletTracer(muzzlePos, targetPos, isHeroic ? heroicTracerColor : 0xf1c40f, 4.5);
        playAudio('gatling_fire', {}, 'china');
        const gatDmg = (typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined' && researchedTechs.has('chainGuns')) ? 26 : 20;
        applyCalculatedDamage(attacker, target, gatDmg, 'GATLING');
    } else if (attacker.type === 'dragonTank') {
        // China Dragon Tank Flamethrower
        spawnFlamethrowerBurst(muzzlePos, targetPos);
        playAudio('flamethrower', {}, 'china');
        applyCalculatedDamage(attacker, target, 40, 'FLAME');
    } else if (['rebel', 'technical'].includes(attacker.type)) {
        // GLA Kalashnikov AK-47 & Technical Heavy MG (with scrap upgrades!)
        spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : 0xf1c40f, 0.4);
        spawnBulletTracer(muzzlePos, targetPos, isHeroic ? heroicTracerColor : 0xe67e22, 3.0);
        playAudio('ak47', {}, 'gla');
        let baseMG = (attacker.type === 'technical' ? 24 : 16);
        if (attacker.type === 'technical' && attacker.salvageLevel >= 1) {
            baseMG = Math.round(baseMG * (attacker.salvageLevel >= 2 ? 1.6 : 1.35));
        }
        applyCalculatedDamage(attacker, target, baseMG, 'SMALL_ARMS');
    } else if (attacker.type === 'raptor') {
        // USA Raptor Air-Superiority Fighter: Dual AMRAAM Guided Missiles!
        const mPosL = getMuzzleWorldPosition(attacker, -0.65);
        const mPosR = getMuzzleWorldPosition(attacker, 0.65);
        spawnMuzzleFlash(mPosL, 0xff9f43, 0.5);
        spawnMuzzleFlash(mPosR, 0xff9f43, 0.5);
        spawnRocketProjectile(mPosL, targetPos, false, false, { attacker, target, damage: 60, damageType: 'EXPLOSIVE', splashRadius: 2.0 });
        setTimeout(() => spawnRocketProjectile(mPosR, targetPos, false, false, { attacker, target, damage: 60, damageType: 'EXPLOSIVE', splashRadius: 2.0 }), 100);
        playUSASound('missile_launch');
    } else if (attacker.type === 'stealthfighter') {
        // USA Stealth Fighter: Laser-Guided Precision Bunker-Buster Bomb!
        spawnMuzzleFlash(muzzlePos, 0x00d2d3, 0.6);
        spawnGuidedBomb(muzzlePos, targetPos, false);
        playUSASound('missile_launch');
        setTimeout(() => applyCalculatedDamage(attacker, target, 150, 'EXPLOSIVE'), 400);
    } else if (attacker.type === 'aurora') {
        // USA Aurora Hypersonic Bomber: Fuel-Air Cluster Bomb with Massive Shockwave!
        spawnMuzzleFlash(muzzlePos, 0x00d2d3, 1.2);
        spawnGuidedBomb(muzzlePos, targetPos, true);
        playUSASound('aurora_bomb');
        setTimeout(() => applyCalculatedDamage(attacker, target, 220, 'EXPLOSIVE'), 500);
    } else if (attacker.type === 'comanche') {
        // USA Comanche Attack Helicopter: 20mm Rotary Cannon + Hellfire Missiles!
        spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : 0xffa502, 0.45);
        spawnBulletTracer(muzzlePos, targetPos, isHeroic ? heroicTracerColor : 0xffd32a, 3.0);
        const mPosL = getMuzzleWorldPosition(attacker, -0.5);
        const mPosR = getMuzzleWorldPosition(attacker, 0.5);
        setTimeout(() => spawnRocketProjectile(mPosL, targetPos, false, false, { attacker, target, damage: 35, damageType: 'EXPLOSIVE' }), 80);
        setTimeout(() => spawnRocketProjectile(mPosR, targetPos, false, false, { attacker, target, damage: 35, damageType: 'EXPLOSIVE' }), 180);
        if (typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined' && researchedTechs.has('rocketPods')) {
            setTimeout(() => spawnRocketProjectile(mPosL, targetPos, false, false, { attacker, target, damage: 25, damageType: 'EXPLOSIVE' }), 260);
            setTimeout(() => spawnRocketProjectile(mPosR, targetPos, false, false, { attacker, target, damage: 25, damageType: 'EXPLOSIVE' }), 340);
        }
        playUSASound('machine_gun');
        playUSASound('missile_launch');
        applyCalculatedDamage(attacker, target, 25, 'SMALL_ARMS');
    } else if (attacker.type === 'paladin') {
        // USA Paladin Tank: High-Velocity 105mm Tank Cannon (PDL runs autonomously on defense!)
        spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : 0xffa502, 0.75);
        spawnBulletTracer(muzzlePos, targetPos, isHeroic ? heroicTracerColor : 0xff4757, 3.5);
        playUSASound('cannon');
        if (typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined' && researchedTechs.has('toxinShells')) {
            if (typeof spawnLingeringToxinCloud === 'function') spawnLingeringToxinCloud(targetPos);
        }
        applyCalculatedDamage(attacker, target, 56, 'ARMOR_PIERCING');
    } else if (attacker.type === 'quad') {
        // Quad Cannon 4x23mm Autocannon Salvo!
        [-0.22, 0.22].forEach(xOff => {
            const mPos = getMuzzleWorldPosition(attacker, xOff);
            spawnMuzzleFlash(mPos, isHeroic ? heroicFlashColor : 0xffa502, 0.35);
            spawnBulletTracer(mPos, targetPos, isHeroic ? heroicTracerColor : 0xffd32a, 2.5);
        });
        const qDmg = (typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined' && researchedTechs.has('apBullets')) ? 40 : 32;
        applyCalculatedDamage(attacker, target, qDmg, 'GATLING');
    } else if (attacker.type === 'jarmen' || attacker.type === 'pathfinder') {
        // Supersonic Sniper Vapor Trail (Instant lethal damage vs infantry!)
        spawnMuzzleFlash(muzzlePos, 0xffffff, 0.3);
        spawnLaserBeam(muzzlePos, targetPos, 0xffffff, 2);
        applyCalculatedDamage(attacker, target, 90, 'SNIPER');
    } else if (['tank', 'crusader', 'scorpion', 'marauder'].includes(attacker.type)) {
        // Heavy Tank Cannon
        spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : 0xffa502, 0.75);
        spawnBulletTracer(muzzlePos, targetPos, isHeroic ? heroicTracerColor : 0xff4757, 3.5);
        if (['tank', 'crusader'].includes(attacker.type)) playUSASound('cannon');
        let tkDmg = 50;
        if (attacker.type === 'marauder' && attacker.salvageLevel >= 1) {
            tkDmg = Math.round(tkDmg * (attacker.salvageLevel >= 2 ? 1.6 : 1.35));
            // Marauder twin cannon visuals on scrap upgrade
            const mPosR = getMuzzleWorldPosition(attacker, 0.3);
            spawnMuzzleFlash(mPosR, isHeroic ? heroicFlashColor : 0xffa502, 0.75);
            spawnBulletTracer(mPosR, targetPos, isHeroic ? heroicTracerColor : 0xff4757, 3.5);
        } else if (attacker.type === 'scorpion' && (attacker.salvageLevel >= 1 || (typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined' && researchedTechs.has('scorpionRocket')))) {
            // Secondary Scorpion Rocket
            setTimeout(() => {
                spawnRocketProjectile(muzzlePos, targetPos, false, false, { attacker, target, damage: 38, damageType: 'EXPLOSIVE' });
            }, 120);
        }
        if (typeof units !== 'undefined' && units.includes(attacker) && typeof researchedTechs !== 'undefined' && researchedTechs.has('toxinShells')) {
            if (typeof spawnLingeringToxinCloud === 'function') spawnLingeringToxinCloud(targetPos);
        }
        applyCalculatedDamage(attacker, target, tkDmg, 'ARMOR_PIERCING');
    } else if (attacker.type === 'humvee') {
        // USA Humvee Heavy .50 Machine Gun
        spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : 0xffa502, 0.45);
        spawnBulletTracer(muzzlePos, targetPos, isHeroic ? heroicTracerColor : 0xf39c12, 2.5);
        playUSASound('machine_gun');
        let vehDmg = 22;
        if (typeof units !== 'undefined' && units.includes(attacker)) {
            if (typeof researchedTechs !== 'undefined' && researchedTechs.has('towMissile')) {
                vehDmg = 35;
                spawnRocketProjectile(muzzlePos, targetPos, false, false, { attacker, target, damage: 32, damageType: 'EXPLOSIVE' });
            }
            // Fire-From-Within: Garrisoned troops fire out
            if (attacker.garrisoned && attacker.garrisoned.length > 0) {
                vehDmg += attacker.garrisoned.length * 8;
            }
        }
        applyCalculatedDamage(attacker, target, vehDmg, 'SMALL_ARMS');
    } else {
        // Infantry Rifle / Carbine burst
        spawnMuzzleFlash(muzzlePos, isHeroic ? heroicFlashColor : 0xffa502, 0.25);
        spawnBulletTracer(muzzlePos, targetPos, isHeroic ? heroicTracerColor : 0xf1c40f, 1.8);
        let infDmg = (typeof units !== 'undefined' && units.includes(attacker) && attacker.type === 'rebel' && typeof researchedTechs !== 'undefined' && researchedTechs.has('apBullets')) ? 20 : 16;
        applyCalculatedDamage(attacker, target, infDmg, 'SMALL_ARMS');
    }
}

let blueprintRotationY = 0;
window.blueprintRotationY = 0;

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
    blueprintRotationY = 0;
    window.blueprintRotationY = 0;

    const footprint = getStructureFootprint(type);
    const size = { x: footprint.width, y: footprint.height, z: footprint.depth };

    const group = new THREE.Group();
    group.name = "blueprintGroup";

    // 1. Semi-transparent foundation footprint box
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.45 });
    const boxMesh = new THREE.Mesh(geo, mat);
    boxMesh.name = "blueprintBox";
    group.add(boxMesh);

    // 2. Wireframe grid cage
    const wireGeo = new THREE.EdgesGeometry(geo);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x00ffcc, linewidth: 2 });
    const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
    wireMesh.name = "blueprintWire";
    group.add(wireMesh);

    // 3. Directional Front-Facing Pointer Arrow (shows building front entrance/facing orientation)
    const arrowGroup = new THREE.Group();
    arrowGroup.name = "blueprintArrow";
    arrowGroup.position.set(0, -size.y / 2 + 0.15, size.z / 2 + 1.2);

    const arrowHead = new THREE.Mesh(new THREE.ConeGeometry(size.x * 0.18, 1.8, 4), new THREE.MeshBasicMaterial({ color: 0x00ffcc }));
    arrowHead.rotation.x = Math.PI / 2;
    arrowGroup.add(arrowHead);

    const arrowShaft = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.08, 0.15, 1.2), new THREE.MeshBasicMaterial({ color: 0x00ffcc }));
    arrowShaft.position.z = -0.8;
    arrowGroup.add(arrowShaft);

    group.add(arrowGroup);

    blueprintMesh = group;
    blueprintMesh.position.set(0, size.y / 2, 0);
    blueprintMesh.rotation.y = 0;
    scene.add(blueprintMesh);

    showNotification(`Place ${footprint.name || type}. Rotate with Mouse Wheel, [R], [Q], [E], or Click-and-Drag! Right-click to cancel.`, 'info');
}

function updateBlueprintPosition(intersectPoint) {
    if (!blueprintMesh) return;
    blueprintMesh.position.x = intersectPoint.x;
    blueprintMesh.position.z = intersectPoint.z;
    const groundH = getTerrainHeight(intersectPoint.x, intersectPoint.z);
    blueprintMesh.position.y = groundH + getStructureFootprint(activeBlueprintType).height / 2;
    blueprintMesh.rotation.y = (typeof blueprintRotationY !== 'undefined') ? blueprintRotationY : 0;

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

    const colorHex = isBlueprintValid ? 0x00ffcc : 0xff4757;
    blueprintMesh.traverse(child => {
        if (child.material && child.material.color) {
            child.material.color.setHex(colorHex);
        }
    });
}
let aiProductionTick = 0;
