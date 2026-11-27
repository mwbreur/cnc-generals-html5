// =========================================================================
// UNIFIED AIRCRAFT & HELICOPTER FLIGHT, COMBAT, REARMING & ORBIT ENGINE
// Shared by both player and AI aircraft so flight dynamics never drift apart.
// =========================================================================
function updateAircraftFlight(unit, idx, isAI, animTimeSec) {
    if (!unit || !unit.mesh || !unit.isAir) return;

    const tSec = (typeof animTimeSec === 'number' && Number.isFinite(animTimeSec)) ? animTimeSec : (Date.now() * 0.001);
    const cruiseAlt = (unit.mesh.userData && unit.mesh.userData.flightAltitude) ? unit.mesh.userData.flightAltitude : 8.5;
    const groundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(unit.mesh.position.x, unit.mesh.position.z) : 0;
    const isHeli = (unit.type === 'comanche' || unit.type === 'chinook');
    const rand = (typeof simRandom === 'function') ? simRandom : Math.random;
    const dScale = (typeof combatDeltaScale !== 'undefined') ? combatDeltaScale : 1.0;

    if (!unit.patrolCenter) unit.patrolCenter = unit.mesh.position.clone();
    if (!unit.circleRadius) unit.circleRadius = isHeli ? 11.0 : 30.0;
    if (unit.circleAngle === undefined) unit.circleAngle = rand() * Math.PI * 2;
    if (!unit.airState || unit.airState === 'none') {
        unit.airState = isHeli ? 'hovering' : 'circling';
    }

    // Official JetAIUpdate.cpp ammo clips: Raptor 4 (6 w/ Laser Missiles), MiG 2, Stealth Fighter 2, Aurora 1
    if (!isHeli && unit.type !== 'c130') {
        const hasLaserMissiles = !isAI && typeof researchedTechs !== 'undefined' && researchedTechs.has('laserMissiles');
        const baseClip = unit.type === 'raptor'
            ? (hasLaserMissiles ? 6 : 4)
            : (unit.type === 'aurora' ? 1 : 2);
        if (unit.maxAmmo !== baseClip) {
            const hadInit = (unit.ammo !== undefined);
            unit.maxAmmo = baseClip;
            if (!hadInit) unit.ammo = baseClip;
            else unit.ammo = Math.min(unit.ammo, baseClip);
        }
    }

    // Dynamic State Transitions
    if (unit.airState === 'returning_to_base' || unit.airState === 'rearming') {
        if (!isAI && unit.ammo > 0 && unit.taskState === 'Moving') {
            unit.airState = (unit.airState === 'rearming') ? 'taking_off' : 'flying';
        }
    } else if (unit.combatTarget && unit.combatTarget.health > 0 && unit.taskState !== 'Moving' && unit.type !== 'chinook') {
        if (!isHeli && unit.ammo !== undefined && unit.ammo <= 0) {
            unit.combatTarget = null;
            unit.airState = 'returning_to_base';
        } else if (unit.airState === 'landed') {
            unit.airState = 'taking_off';
        } else if (unit.airState !== 'taking_off') {
            unit.airState = 'attacking';
        }
    } else if (unit.airState === 'hovering') {
        const distToTarget = Math.hypot(unit.targetPosition.x - unit.mesh.position.x, unit.targetPosition.z - unit.mesh.position.z);
        if (distToTarget > 2.0 || unit.taskState === 'Moving') {
            unit.airState = 'flying';
        }
    } else if (unit.airState === 'circling') {
        const distToPatrol = Math.hypot(unit.targetPosition.x - unit.patrolCenter.x, unit.targetPosition.z - unit.patrolCenter.z);
        if (distToPatrol > 4.0 || unit.taskState === 'Moving') {
            unit.airState = 'flying';
            unit.patrolCenter.copy(unit.targetPosition);
        }
    }

    // 0a. Returning to Airfield to Rearm (JetAIUpdate.cpp)
    if (unit.airState === 'returning_to_base' && !isHeli) {
        const structList = isAI
            ? (typeof enemyStructures !== 'undefined' ? enemyStructures : [])
            : (typeof structures !== 'undefined' ? structures : []);
        let nearestAF = null, bestAFDist = Infinity;
        for (let ai = 0; ai < structList.length; ai++) {
            const af = structList[ai];
            if (!af || af.type !== 'airfield' || af.isBuilding || af.health <= 0 || !af.position) continue;
            if (isAI) {
                if (unit.ownerId && af.ownerId && af.ownerId !== unit.ownerId) continue;
                if (!unit.ownerId && af.teamId !== unit.teamId) continue;
            } else if (af.ownerId && af.ownerId !== 'player') {
                continue;
            }
            const d = Math.hypot(af.position.x - unit.mesh.position.x, af.position.z - unit.mesh.position.z);
            if (d < bestAFDist) { bestAFDist = d; nearestAF = af; }
        }
        if (!nearestAF) {
            // No airfield available: field-rearm slowly while circling
            unit._rearmTimer = (unit._rearmTimer || 0) + dScale;
            if (unit._rearmTimer >= 180) {
                unit._rearmTimer = 0;
                unit.ammo = Math.min(unit.maxAmmo || 2, (unit.ammo || 0) + 1);
                if (unit.ammo >= (unit.maxAmmo || 2)) unit.airState = 'circling';
            }
        } else {
            const dxAF = nearestAF.position.x - unit.mesh.position.x;
            const dzAF = nearestAF.position.z - unit.mesh.position.z;
            const distAF = Math.hypot(dxAF, dzAF);
            if (distAF > 4.0) {
                const spd = unit.speed * dScale;
                unit.mesh.position.x += (dxAF / distAF) * spd;
                unit.mesh.position.z += (dzAF / distAF) * spd;
                const targetY = groundY + (distAF < 20 ? Math.max(0.5, cruiseAlt * (distAF / 20)) : cruiseAlt);
                unit.mesh.position.y += (targetY - unit.mesh.position.y) * 0.10;
                const tAng = Math.atan2(-dzAF, dxAF) + Math.PI / 2;
                let diff = tAng - unit.mesh.rotation.y;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                unit.mesh.rotation.y += diff * 0.18;
                unit.mesh.rotation.x += (0 - unit.mesh.rotation.x) * 0.12;
                unit.mesh.rotation.z += (THREE.MathUtils.clamp(-diff * 1.4, -0.35, 0.35) - unit.mesh.rotation.z) * 0.12;
            } else {
                unit.airState = 'rearming';
                unit._rearmTimer = 0;
                unit.targetPosition.copy(nearestAF.position);
            }
            return;
        }
    }

    // 0b. Rearming & Repairing on Airfield Pad
    if (unit.airState === 'rearming' && !isHeli) {
        unit.mesh.position.y += ((groundY + 0.35) - unit.mesh.position.y) * 0.15;
        unit.mesh.rotation.x += (0 - unit.mesh.rotation.x) * 0.15;
        unit.mesh.rotation.z += (0 - unit.mesh.rotation.z) * 0.15;
        unit._rearmTimer = (unit._rearmTimer || 0) + dScale;
        if (unit.health < unit.maxHealth && Math.floor(unit._rearmTimer) % 15 === 0) {
            unit.health = Math.min(unit.maxHealth, unit.health + 4);
        }
        if (unit._rearmTimer >= 90) { // +1 missile/bomb every 1.5s
            unit._rearmTimer = 0;
            unit.ammo = Math.min(unit.maxAmmo || 2, (unit.ammo || 0) + 1);
            if (!isAI && unit.selected && typeof updateSidebar === 'function') updateSidebar();
            if (unit.ammo >= (unit.maxAmmo || 2)) {
                if (isAI) {
                    if (unit.patrolCenter) unit.targetPosition.copy(unit.patrolCenter);
                    unit.airState = 'taking_off';
                    unit.taskState = 'Idle';
                } else if (unit.guardPoint) {
                    unit.targetPosition.copy(unit.guardPoint);
                    unit.patrolCenter.copy(unit.guardPoint);
                    unit.airState = 'taking_off';
                    unit.taskState = 'Guarding';
                } else {
                    unit.airState = 'landed';
                    unit.taskState = 'Idle';
                }
                if (!isAI && typeof playAudio === 'function') playAudio('gui_blip', { volume: 0.45 });
            }
        }
        return;
    }

    // 1. Landed on Airfield Runway / Pad
    if (unit.airState === 'landed') {
        unit.mesh.position.y = groundY + 0.35;
        unit.mesh.rotation.z = 0;
        unit.mesh.rotation.x = 0;
        const distToGoal = Math.hypot(unit.targetPosition.x - unit.mesh.position.x, unit.targetPosition.z - unit.mesh.position.z);
        if (unit.combatTarget || (unit.waypoints && unit.waypoints.length > 0) || distToGoal > 4.0 || unit.taskState === 'Moving') {
            unit.airState = 'taking_off';
        }
        return;
    }

    // 2. Taking off & climbing to cruising altitude
    if (unit.airState === 'taking_off') {
        const targetY = groundY + cruiseAlt;
        unit.mesh.position.y += (targetY - unit.mesh.position.y) * 0.08;
        if (unit.mesh.position.y >= targetY * 0.85) {
            unit.airState = (unit.combatTarget && unit.combatTarget.health > 0) ? 'attacking' : (isHeli ? 'hovering' : 'flying');
        }
    }

    // 3. Helicopter Station Keeping: HOVER IN THE SAME SPOT
    if (unit.airState === 'hovering' && isHeli) {
        const targetHoverY = groundY + cruiseAlt + Math.sin(tSec * 2.5 + (unit.mesh.id || idx || 0)) * 0.18;
        unit.mesh.position.y += (targetHoverY - unit.mesh.position.y) * 0.10;
        unit.mesh.position.x += (unit.targetPosition.x - unit.mesh.position.x) * 0.12;
        unit.mesh.position.z += (unit.targetPosition.z - unit.mesh.position.z) * 0.12;
        unit.mesh.rotation.x += (0 - unit.mesh.rotation.x) * 0.12;
        unit.mesh.rotation.z += (0 - unit.mesh.rotation.z) * 0.12;
        return;
    }

    // 4. Attacking an Enemy Target
    if (unit.airState === 'attacking') {
        const tPos = unit.combatTarget && (unit.combatTarget.position || (unit.combatTarget.mesh && unit.combatTarget.mesh.position));
        const returnAnchor = unit.guardPoint || (!isHeli ? unit.patrolCenter : null);
        const leashR = unit.guardRadius || (isHeli ? Math.max(42, (unit.scanRange || 26) * 1.55) : Math.max(55, (unit.scanRange || 35) * 1.65));
        const outOfSector = !!(!isAI && returnAnchor && tPos && unit.taskState !== 'MovingToAttack'
            && Math.hypot(tPos.x - returnAnchor.x, tPos.z - returnAnchor.z) > leashR);

        if (!unit.combatTarget || !tPos || unit.combatTarget.health <= 0 || outOfSector) {
            unit.combatTarget = null;
            unit.planeAttackPhase = null;
            if (returnAnchor) {
                unit.targetPosition.copy(returnAnchor);
                const distToAnchor = Math.hypot(returnAnchor.x - unit.mesh.position.x, returnAnchor.z - unit.mesh.position.z);
                if (isHeli) {
                    unit.airState = distToAnchor > 3.0 ? 'flying' : 'hovering';
                } else {
                    unit.patrolCenter.copy(returnAnchor);
                    const orbitR = unit.circleRadius || 30.0;
                    if (distToAnchor > orbitR * 1.35) {
                        unit.airState = 'flying';
                    } else {
                        unit.airState = 'circling';
                        unit.circleAngle = Math.atan2(unit.mesh.position.z - unit.patrolCenter.z, unit.mesh.position.x - unit.patrolCenter.x);
                    }
                }
                unit.taskState = unit.guardPoint ? 'Guarding' : 'Idle';
            } else if (isHeli) {
                unit.airState = 'hovering';
                unit.targetPosition.copy(unit.mesh.position);
                unit.taskState = 'Idle';
            } else {
                unit.airState = 'circling';
                unit.patrolCenter.copy(unit.mesh.position);
                unit.targetPosition.copy(unit.mesh.position);
                unit.circleAngle = Math.atan2(unit.mesh.position.z - unit.patrolCenter.z, unit.mesh.position.x - unit.patrolCenter.x);
                unit.taskState = 'Idle';
            }
        } else if (isHeli) {
            // --- HELICOPTERS (Comanche): Strafe sideways while facing and firing on target ---
            const dxA = tPos.x - unit.mesh.position.x;
            const dzA = tPos.z - unit.mesh.position.z;
            const distToEnemy = Math.hypot(dxA, dzA);

            const aimAngle = Math.atan2(-dzA, dxA) + Math.PI / 2;
            let diff = aimAngle - unit.mesh.rotation.y;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            unit.mesh.rotation.y += diff * 0.20;

            if (distToEnemy > 22.0) {
                const dirX = dxA / (distToEnemy || 1);
                const dirZ = dzA / (distToEnemy || 1);
                unit.mesh.position.x += dirX * unit.speed * dScale;
                unit.mesh.position.z += dirZ * unit.speed * dScale;
                unit.mesh.rotation.x += (0.14 - unit.mesh.rotation.x) * 0.12;
                unit.mesh.rotation.z += (0 - unit.mesh.rotation.z) * 0.12;
            } else {
                if (unit.strafeDir === undefined) unit.strafeDir = (rand() < 0.5 ? 1 : -1);
                unit.strafeTimer = (unit.strafeTimer || 0) + 1;
                if (unit.strafeTimer > 75) {
                    unit.strafeTimer = 0;
                    unit.strafeDir *= -1;
                }
                const perpX = -dzA / (distToEnemy || 1);
                const perpZ = dxA / (distToEnemy || 1);
                const strafeSpeed = unit.speed * 0.60 * dScale;
                unit.mesh.position.x += perpX * (strafeSpeed * unit.strafeDir);
                unit.mesh.position.z += perpZ * (strafeSpeed * unit.strafeDir);
                unit.mesh.rotation.z += (unit.strafeDir * 0.22 - unit.mesh.rotation.z) * 0.12;
                unit.mesh.rotation.x += (0.16 - unit.mesh.rotation.x) * 0.12;
            }

            if (distToEnemy <= 24.0 && unit.attackCooldown === 0) {
                executeWeaponFire(unit, unit.combatTarget);
            }
        } else {
            // --- FIXED-WING AIRPLANES (Raptor, Aurora, Stealth Fighter, MiG): Strafe Run & Bomb Drop ---
            if (!unit.planeAttackPhase) unit.planeAttackPhase = 'inbound';

            const dxA = tPos.x - unit.mesh.position.x;
            const dzA = tPos.z - unit.mesh.position.z;
            const distToEnemy = Math.hypot(dxA, dzA);
            const isAuroraInbound = (unit.type === 'aurora' && unit.planeAttackPhase === 'inbound');
            unit.invulnerableInbound = isAuroraInbound;
            const planeSpeed = ((unit.type === 'aurora') ? (isAuroraInbound ? unit.speed * 1.85 : unit.speed * 0.65) : unit.speed) * dScale;

            if (unit.planeAttackPhase === 'inbound') {
                const dirX = dxA / (distToEnemy || 1);
                const dirZ = dzA / (distToEnemy || 1);
                unit.mesh.position.x += dirX * planeSpeed;
                unit.mesh.position.z += dirZ * planeSpeed;

                const targetAngle = Math.atan2(-dirZ, dirX) + Math.PI / 2;
                let diff = targetAngle - unit.mesh.rotation.y;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                unit.mesh.rotation.y += diff * 0.22;
                unit.mesh.rotation.order = 'YXZ';
                unit.mesh.rotation.x += (-0.08 - unit.mesh.rotation.x) * 0.12;
                unit.mesh.rotation.z += (THREE.MathUtils.clamp(-diff * 1.8, -0.42, 0.42) - unit.mesh.rotation.z) * 0.15;

                if ((distToEnemy <= 16.0 && unit.attackCooldown === 0) || distToEnemy <= 6.0) {
                    if (unit.attackCooldown === 0) {
                        executeWeaponFire(unit, unit.combatTarget);
                        if (unit.ammo !== undefined) {
                            unit.ammo = Math.max(0, unit.ammo - 1);
                            if (!isAI && unit.selected && typeof updateSidebar === 'function') updateSidebar();
                        }
                    }
                    unit.planeAttackPhase = 'overshoot';
                    if (distToEnemy > 0.2) {
                        unit.overshootDirX = dirX;
                        unit.overshootDirZ = dirZ;
                    } else {
                        unit.overshootDirX = Math.sin(unit.mesh.rotation.y);
                        unit.overshootDirZ = Math.cos(unit.mesh.rotation.y);
                    }
                    unit.overshootDist = 0;
                }
            } else if (unit.planeAttackPhase === 'overshoot') {
                unit.mesh.position.x += unit.overshootDirX * (planeSpeed * 1.35);
                unit.mesh.position.z += unit.overshootDirZ * (planeSpeed * 1.35);
                unit.overshootDist += planeSpeed * 1.35;
                unit.mesh.position.y += 0.08;
                unit.mesh.rotation.x += (0.10 - unit.mesh.rotation.x) * 0.12;
                unit.mesh.rotation.z += (0 - unit.mesh.rotation.z) * 0.12;

                if (unit.overshootDist >= 34.0) {
                    if (unit.ammo !== undefined && unit.ammo <= 0) {
                        unit.combatTarget = null;
                        unit.planeAttackPhase = null;
                        unit.airState = 'returning_to_base';
                        unit.taskState = 'Idle';
                    } else {
                        unit.planeAttackPhase = 'turnaround';
                        unit.turnaroundTimer = 0;
                    }
                }
            } else if (unit.planeAttackPhase === 'turnaround') {
                unit.turnaroundTimer = (unit.turnaroundTimer || 0) + 1;
                unit.mesh.rotation.y += 0.038;
                unit.mesh.rotation.z += (-0.40 - unit.mesh.rotation.z) * 0.12;
                unit.mesh.rotation.x += (0 - unit.mesh.rotation.x) * 0.10;
                unit.mesh.position.x += Math.sin(unit.mesh.rotation.y) * (planeSpeed * 1.05);
                unit.mesh.position.z += Math.cos(unit.mesh.rotation.y) * (planeSpeed * 1.05);

                const angleToTarget = Math.atan2(-dzA, dxA) + Math.PI / 2;
                let angleDiff = Math.abs(angleToTarget - unit.mesh.rotation.y);
                while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - Math.PI * 2);

                if (angleDiff < 0.45 && unit.turnaroundTimer > 40) {
                    unit.planeAttackPhase = 'inbound';
                }
            }
        }
    }

    // 5. Commanded Flight Toward Destination
    if (unit.airState === 'flying') {
        const targetCruiseY = groundY + cruiseAlt + Math.sin(tSec * 2.2 + (unit.mesh.id || idx || 0)) * 0.14;
        unit.mesh.position.y += (targetCruiseY - unit.mesh.position.y) * 0.08;
        const dx = unit.targetPosition.x - unit.mesh.position.x;
        const dz = unit.targetPosition.z - unit.mesh.position.z;
        const dist2D = Math.hypot(dx, dz);
        const stopThreshold = isHeli ? 1.5 : Math.max(6.0, (unit.circleRadius || 30.0) * 0.85);

        if (dist2D > stopThreshold) {
            const dirX = dx / dist2D;
            const dirZ = dz / dist2D;
            unit.mesh.position.x += dirX * unit.speed * dScale;
            unit.mesh.position.z += dirZ * unit.speed * dScale;

            const targetAngle = Math.atan2(-dirZ, dirX) + Math.PI / 2;
            let diff = targetAngle - unit.mesh.rotation.y;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            unit.mesh.rotation.y += diff * 0.18;

            if (isHeli) {
                unit.mesh.rotation.x += (0.14 - unit.mesh.rotation.x) * 0.12;
                const targetBank = THREE.MathUtils.clamp(-diff * 0.8, -0.22, 0.22);
                unit.mesh.rotation.z += (targetBank - unit.mesh.rotation.z) * 0.12;
            } else {
                unit.mesh.rotation.order = 'YXZ';
                unit.mesh.rotation.x += (0 - unit.mesh.rotation.x) * 0.12;
                unit.mesh.rotation.z += (THREE.MathUtils.clamp(-diff * 1.6, -0.42, 0.42) - unit.mesh.rotation.z) * 0.12;
            }
        } else {
            if (unit.waypoints && unit.waypoints.length > 0) {
                unit.targetPosition.copy(unit.waypoints.shift());
            } else {
                if (isHeli) {
                    unit.airState = 'hovering';
                    unit.targetPosition.copy(unit.mesh.position);
                } else {
                    unit.patrolCenter.copy(unit.targetPosition);
                    unit.circleAngle = Math.atan2(unit.mesh.position.z - unit.patrolCenter.z, unit.mesh.position.x - unit.patrolCenter.x);
                    unit.airState = 'circling';
                }
                unit.taskState = unit.guardPoint ? 'Guarding' : 'Idle';
            }
        }
    }

    // 6. Holding Pattern Circling (Strictly for fixed-wing airplanes)
    if (unit.airState === 'circling') {
        if (isHeli) {
            unit.airState = 'hovering';
            unit.targetPosition.copy(unit.mesh.position);
        } else {
            const targetOrbitY = groundY + cruiseAlt + Math.sin(tSec * 2.0 + (unit.mesh.id || idx || 0)) * 0.14;
            unit.mesh.position.y += (targetOrbitY - unit.mesh.position.y) * 0.08;
            const orbitR = unit.circleRadius || 30.0;
            const orbitSpeed = unit.speed * 0.85 * dScale;
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

            const tangentX = -Math.sin(unit.circleAngle);
            const tangentZ = Math.cos(unit.circleAngle);
            const targetAngle = Math.atan2(-tangentZ, tangentX) + Math.PI / 2;

            let diff = targetAngle - unit.mesh.rotation.y;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            unit.mesh.rotation.y += diff * 0.16;
            unit.mesh.rotation.order = 'YXZ';
            unit.mesh.rotation.x = 0;
            unit.mesh.rotation.z += (-0.24 - unit.mesh.rotation.z) * 0.12;
        }
    }

    // Maintain flight cruising altitude above ground
    if (unit.airState !== 'landed' && unit.airState !== 'hovering') {
        const targetY = groundY + cruiseAlt;
        unit.mesh.position.y += (targetY - unit.mesh.position.y) * 0.08;
    }

    // Authentic Helicopter Rotor Downwash Dust & Fixed-Wing Contrails (only when visible)
    if (unit.airState !== 'landed' && unit.mesh.visible !== false) {
        const alt = unit.mesh.position.y - groundY;
        if (isHeli && alt < 13.5 && (buildingTick + idx) % 10 === 0 && typeof spawnRotorDownwashDust === 'function') {
            spawnRotorDownwashDust(unit.mesh.position, unit.radius || 3.0);
        } else if (!isHeli && (buildingTick + idx) % 5 === 0 && typeof spawnJetContrailPuff === 'function') {
            const rY = unit.mesh.rotation.y || 0;
            const rightX = Math.cos(rY), rightZ = -Math.sin(rY);
            const fwdX = Math.sin(rY), fwdZ = Math.cos(rY);
            spawnJetContrailPuff({ x: unit.mesh.position.x + rightX * 2.1, y: unit.mesh.position.y + 0.1, z: unit.mesh.position.z + rightZ * 2.1 }, false);
            spawnJetContrailPuff({ x: unit.mesh.position.x - rightX * 2.1, y: unit.mesh.position.y + 0.1, z: unit.mesh.position.z - rightZ * 2.1 }, false);
            if (unit.airState === 'attacking') {
                spawnJetContrailPuff({ x: unit.mesh.position.x - fwdX * 1.8, y: unit.mesh.position.y, z: unit.mesh.position.z - fwdZ * 1.8 }, true);
            }
        }
    }
}
window.updateAircraftFlight = updateAircraftFlight;
