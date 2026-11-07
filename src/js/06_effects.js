// COMMAND & CONQUER: GENERALS - AUTHENTIC WEAPON EFFECTS & PARTICLE SYSTEM
        // =========================================================================
        const activeFX = [];
        const activeMissiles = [];
        const activeScrapCrates = [];

        // Helper: Create glowing particle materials
        const fxMatFire = new THREE.MeshBasicMaterial({ color: 0xff6b35, transparent: true, opacity: 0.95 });
        const fxMatSmoke = new THREE.MeshBasicMaterial({ color: 0x3d444d, transparent: true, opacity: 0.82 });
        const fxMatToxin = new THREE.MeshBasicMaterial({ color: 0x2ed573, transparent: true, opacity: 0.95 });
        const fxMatSpark = new THREE.MeshBasicMaterial({ color: 0xfff200, transparent: true, opacity: 1.0 });

        // =========================================================================
        
        // VISUAL WEAPON EFFECTS & MULTI-STAGE PARTICLE SYSTEMS
        // =========================================================================

        function spawnMuzzleFlash(pos, color = 0xffa502, size = 0.65) {
            const flashGeo = new THREE.SphereGeometry(size, 8, 8);
            const flashMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1.0 });
            const flash = new THREE.Mesh(flashGeo, flashMat);
            flash.position.copy(pos);
            scene.add(flash);

            activeFX.push({
                mesh: flash,
                life: 4,
                maxLife: 4,
                update() {
                    this.life--;
                    const progress = this.life / this.maxLife;
                    this.mesh.scale.setScalar(1 + (1 - progress) * 0.8);
                    this.mesh.material.opacity = progress;
                    if (this.life <= 0) {
                        scene.remove(this.mesh);
                        this.mesh.geometry.dispose();
                        this.mesh.material.dispose();
                        return false;
                    }
                    return true;
                }
            });
        }

        function spawnBulletTracer(fromPos, toPos, color = 0xf1c40f, thickness = 2) {
            const points = [fromPos.clone(), toPos.clone()];
            const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
            const lineMat = new THREE.LineBasicMaterial({ color: color, linewidth: thickness, transparent: true, opacity: 0.95 });
            const line = new THREE.Line(lineGeo, lineMat);
            scene.add(line);

            activeFX.push({
                mesh: line,
                life: 3,
                maxLife: 3,
                update() {
                    this.life--;
                    this.mesh.material.opacity = this.life / this.maxLife;
                    if (this.life <= 0) {
                        scene.remove(this.mesh);
                        this.mesh.geometry.dispose();
                        this.mesh.material.dispose();
                        return false;
                    }
                    return true;
                }
            });
        }

        function spawnRocketProjectile(fromPos, toPos, isHeavy = false, isToxin = false, metadata = null) {
            const group = new THREE.Group();
            group.position.copy(fromPos);

            const bodyMat = new THREE.MeshStandardMaterial({
                color: isToxin ? 0x2ed573 : 0x747d8c,
                metalness: 0.8,
                roughness: 0.3
            });
            const rGeo = new THREE.CylinderGeometry(isHeavy ? 0.22 : 0.12, isHeavy ? 0.22 : 0.12, isHeavy ? 1.4 : 0.8, 8);
            rGeo.rotateX(Math.PI / 2);
            const rocketBody = new THREE.Mesh(rGeo, bodyMat);
            group.add(rocketBody);

            const glowMat = new THREE.MeshBasicMaterial({ color: isToxin ? 0x7bed9f : 0xff793f, transparent: true, opacity: 0.9 });
            const motorGlow = new THREE.Mesh(new THREE.SphereGeometry(isHeavy ? 0.35 : 0.2, 6, 6), glowMat);
            motorGlow.position.z = isHeavy ? -0.8 : -0.45;
            group.add(motorGlow);

            group.lookAt(toPos);
            scene.add(group);

            const speed = isHeavy ? 1.6 : 2.2;
            const distTotal = fromPos.distanceTo(toPos);

            const missileObj = {
                id: 'missile_' + Math.random().toString(36).substr(2, 9),
                group: group,
                curPos: fromPos.clone(),
                toPos: toPos.clone(),
                distTotal: distTotal,
                distTraveled: 0,
                speed: speed,
                isHeavy: isHeavy,
                isToxin: isToxin,
                metadata: metadata,
                intercepted: false,
                update() {
                    if (this.intercepted) {
                        // Point Defense Laser Interception in Mid-Air!
                        scene.remove(this.group);
                        this.group.traverse(child => {
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) child.material.dispose();
                        });
                        spawnEnhancedExplosion(this.curPos, 0x00ffff, 0.9, false);
                        const mIdx = activeMissiles.indexOf(this);
                        if (mIdx !== -1) activeMissiles.splice(mIdx, 1);
                        return false;
                    }

                    this.distTraveled += this.speed;
                    const alpha = Math.min(1.0, this.distTraveled / this.distTotal);
                    this.curPos.lerpVectors(fromPos, this.toPos, alpha);

                    if (this.isHeavy) {
                        const arcHeight = Math.sin(alpha * Math.PI) * 12.0;
                        this.group.position.set(this.curPos.x, this.curPos.y + arcHeight, this.curPos.z);
                    } else {
                        this.group.position.copy(this.curPos);
                    }

                    if (Math.random() < 0.85) {
                        spawnSmokePuff(this.group.position, this.isToxin ? 0x2ed573 : 0x747d8c, 0.25);
                    }

                    if (alpha >= 1.0) {
                        scene.remove(this.group);
                        this.group.traverse(child => {
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) child.material.dispose();
                        });

                        const mIdx = activeMissiles.indexOf(this);
                        if (mIdx !== -1) activeMissiles.splice(mIdx, 1);

                        spawnEnhancedExplosion(this.toPos, this.isToxin ? 0x2ed573 : 0xff4757, this.isHeavy ? 2.2 : 1.2, this.isHeavy);
                        if (this.isToxin) {
                            spawnLingeringToxinCloud(this.toPos);
                        } else if (this.isHeavy) {
                            spawnCraterDecal(this.toPos, 3.2, 420);
                        }

                        // Apply authentic missile / rocket payload damage if not intercepted!
                        if (this.metadata) {
                            const { attacker, target, damage, damageType, splashRadius } = this.metadata;
                            if (target && target.health > 0) {
                                if (typeof applyCalculatedDamage === 'function') {
                                    applyCalculatedDamage(attacker, target, damage, damageType || 'EXPLOSIVE');
                                } else {
                                    target.health -= damage;
                                }
                            }
                            if (splashRadius && splashRadius > 0) {
                                const allEnemies = (typeof units !== 'undefined' && typeof enemyUnits !== 'undefined')
                                    ? [...units, ...enemyUnits] : [];
                                allEnemies.forEach(other => {
                                    if (other !== target && other.health > 0 && other.mesh) {
                                        const d = other.mesh.position.distanceTo(this.toPos);
                                        if (d <= splashRadius && (typeof isFriendly === 'function' ? !isFriendly(attacker, other) : true)) {
                                            const splashDmg = Math.floor(damage * (1 - (d / splashRadius) * 0.5));
                                            if (typeof applyCalculatedDamage === 'function') {
                                                applyCalculatedDamage(attacker, other, splashDmg, damageType || 'EXPLOSIVE');
                                            } else {
                                                other.health -= splashDmg;
                                            }
                                        }
                                    }
                                });
                            }
                        }

                        return false;
                    }
                    return true;
                }
            };

            activeFX.push(missileObj);
            activeMissiles.push(missileObj);
        }

        function spawnGuidedBomb(fromPos, toPos, isFuelAir = false) {
            const bombMat = new THREE.MeshStandardMaterial({
                color: isFuelAir ? 0xff4757 : 0x2f3542,
                roughness: 0.4,
                metalness: 0.7
            });
            const bGeo = new THREE.CylinderGeometry(0.25, 0.15, isFuelAir ? 1.8 : 1.2, 8);
            bGeo.rotateX(Math.PI / 2);
            const bomb = new THREE.Mesh(bGeo, bombMat);
            bomb.position.copy(fromPos);
            bomb.lookAt(toPos);
            scene.add(bomb);

            const speed = 1.8;
            const distTotal = fromPos.distanceTo(toPos);

            activeFX.push({
                mesh: bomb,
                fromPos: fromPos.clone(),
                toPos: toPos.clone(),
                distTotal: distTotal,
                distTraveled: 0,
                speed: speed,
                isFuelAir: isFuelAir,
                update() {
                    this.distTraveled += this.speed;
                    const alpha = Math.min(1.0, this.distTraveled / this.distTotal);
                    this.mesh.position.lerpVectors(this.fromPos, this.toPos, alpha);

                    if (Math.random() < 0.6) {
                        spawnSmokePuff(this.mesh.position, 0xced6e0, 0.2);
                    }

                    if (alpha >= 1.0) {
                        scene.remove(this.mesh);
                        this.mesh.geometry.dispose();
                        this.mesh.material.dispose();

                        if (this.isFuelAir) {
                            spawnFuelAirExplosion(this.toPos);
                        } else {
                            spawnEnhancedExplosion(this.toPos, 0xff793f, 2.0, true);
                            spawnCraterDecal(this.toPos, 2.8, 380);
                        }
                        return false;
                    }
                    return true;
                }
            });
        }

        function spawnSmokePuff(pos, color = 0xdcdde1, initialSize = 0.3) {
            const geo = new THREE.SphereGeometry(initialSize, 6, 6);
            const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.75 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(pos);
            mesh.position.x += (Math.random() - 0.5) * 0.4;
            mesh.position.z += (Math.random() - 0.5) * 0.4;
            scene.add(mesh);

            const growSpeed = 0.045 + Math.random() * 0.03;
            const floatSpeed = 0.05 + Math.random() * 0.04;

            activeFX.push({
                mesh: mesh,
                life: 30 + Math.floor(Math.random() * 15),
                maxLife: 45,
                update() {
                    this.life--;
                    this.mesh.scale.addScalar(growSpeed);
                    this.mesh.position.y += floatSpeed;
                    this.mesh.material.opacity = (this.life / this.maxLife) * 0.7;
                    if (this.life <= 0) {
                        scene.remove(this.mesh);
                        this.mesh.geometry.dispose();
                        this.mesh.material.dispose();
                        return false;
                    }
                    return true;
                }
            });
        }

        function spawnSparks(pos, color = 0xfff200, count = 12) {
            for (let i = 0; i < count; i++) {
                const geo = new THREE.SphereGeometry(0.12, 4, 4);
                const mat = new THREE.MeshBasicMaterial({ color: color });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.copy(pos);
                scene.add(mesh);

                const angle = Math.random() * Math.PI * 2;
                const speed = 0.4 + Math.random() * 0.7;
                const vx = Math.cos(angle) * speed;
                const vz = Math.sin(angle) * speed;
                let vy = 0.3 + Math.random() * 0.6;

                activeFX.push({
                    mesh: mesh,
                    life: 14 + Math.floor(Math.random() * 8),
                    update() {
                        this.life--;
                        this.mesh.position.x += vx;
                        this.mesh.position.z += vz;
                        this.mesh.position.y += vy;
                        vy -= 0.04;
                        this.mesh.scale.setScalar(this.life / 20);
                        if (this.life <= 0 || this.mesh.position.y <= getTerrainHeight(this.mesh.position.x, this.mesh.position.z)) {
                            scene.remove(this.mesh);
                            this.mesh.geometry.dispose();
                            this.mesh.material.dispose();
                            return false;
                        }
                        return true;
                    }
                });
            }
        }

        // Charred blast crater decal on ground
        function spawnCraterDecal(pos, radius = 2.2, duration = 380) {
            const groundY = getTerrainHeight(pos.x, pos.z);
            const geo = new THREE.CircleGeometry(radius, 16);
            geo.rotateX(-Math.PI / 2);
            const mat = new THREE.MeshBasicMaterial({
                color: 0x111111,
                transparent: true,
                opacity: 0.85,
                depthWrite: false
            });
            const crater = new THREE.Mesh(geo, mat);
            crater.position.set(pos.x, groundY + 0.03, pos.z);
            scene.add(crater);

            activeFX.push({
                mesh: crater,
                life: duration,
                maxLife: duration,
                update() {
                    this.life--;
                    if (this.life < 80) {
                        this.mesh.material.opacity = (this.life / 80) * 0.85;
                    }
                    if (this.life <= 0) {
                        scene.remove(this.mesh);
                        this.mesh.geometry.dispose();
                        this.mesh.material.dispose();
                        return false;
                    }
                    return true;
                }
            });
        }

        // Lingering smoke plume for wrecked buildings and vehicles
        function spawnLingeringSmokeColumn(pos, duration = 240, color = 0x2d3436) {
            let timer = 0;
            activeFX.push({
                life: duration,
                update() {
                    this.life--;
                    timer++;
                    if (timer % 5 === 0) {
                        const puffPos = pos.clone();
                        puffPos.y += 0.5;
                        spawnSmokePuff(puffPos, color, 0.45);
                    }
                    return this.life > 0;
                }
            });
        }

        // Multi-stage Particle Explosion (C&C Generals style)
        function spawnEnhancedExplosion(pos, color = 0xffa502, scale = 1.0, isHeavy = false) {
            playUSASound('explosion');

            // 1. Core expanding fireball
            const fireballGeo = new THREE.SphereGeometry(1.2 * scale, 12, 12);
            const fireballMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1.0 });
            const fireball = new THREE.Mesh(fireballGeo, fireballMat);
            fireball.position.copy(pos);
            scene.add(fireball);

            // 2. Outward ground shockwave ring
            const ringGeo = new THREE.RingGeometry(0.5, 1.2 * scale, 24);
            ringGeo.rotateX(-Math.PI / 2);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.set(pos.x, getTerrainHeight(pos.x, pos.z) + 0.06, pos.z);
            scene.add(ring);

            // 3. Shrapnel & incandescent sparks
            spawnSparks(pos, color, isHeavy ? 24 : 12);

            // 4. Heavy billows of black smoke
            for (let i = 0; i < (isHeavy ? 6 : 3); i++) {
                setTimeout(() => {
                    const offset = new THREE.Vector3((Math.random() - 0.5) * scale, Math.random() * scale * 0.8, (Math.random() - 0.5) * scale);
                    spawnSmokePuff(pos.clone().add(offset), 0x2f3542, 0.6 * scale);
                }, i * 60);
            }

            activeFX.push({
                fireball: fireball,
                ring: ring,
                life: 18,
                maxLife: 18,
                scale: scale,
                update() {
                    this.life--;
                    const progress = 1 - (this.life / this.maxLife);

                    // Expand and fade fireball
                    this.fireball.scale.setScalar(1 + progress * 2.2);
                    this.fireball.material.opacity = Math.max(0, 1 - progress * 1.3);

                    // Expand ground shockwave ring
                    const ringExpansion = 1 + progress * 4.5 * this.scale;
                    this.ring.scale.set(ringExpansion, ringExpansion, 1);
                    this.ring.material.opacity = Math.max(0, (1 - progress) * 0.85);

                    if (this.life <= 0) {
                        scene.remove(this.fireball);
                        this.fireball.geometry.dispose();
                        this.fireball.material.dispose();

                        scene.remove(this.ring);
                        this.ring.geometry.dispose();
                        this.ring.material.dispose();
                        return false;
                    }
                    return true;
                }
            });
        }

        function spawnExplosion(pos, color = 0xffa502) {
            spawnEnhancedExplosion(pos, color, 1.0, false);
        }

        function spawnHeavyExplosion(pos, isToxin = false) {
            spawnEnhancedExplosion(pos, isToxin ? 0x2ed573 : 0xff4757, 2.2, true);
            if (isToxin) {
                spawnLingeringToxinCloud(pos);
            } else {
                spawnCraterDecal(pos, 3.2, 450);
            }
        }

        // Lingering Napalm Scorch Pool (deals continuous burn damage)
        function spawnNapalmScorchPool(pos) {
            const groundY = getTerrainHeight(pos.x, pos.z);
            const poolGeo = new THREE.CircleGeometry(3.5, 16);
            poolGeo.rotateX(-Math.PI / 2);
            const poolMat = new THREE.MeshBasicMaterial({ color: 0xff4757, transparent: true, opacity: 0.8, depthWrite: false });
            const pool = new THREE.Mesh(poolGeo, poolMat);
            pool.position.set(pos.x, groundY + 0.04, pos.z);
            scene.add(pool);

            activeFX.push({
                mesh: pool,
                pos: pos.clone(),
                life: 260, // ~4.5 seconds
                maxLife: 260,
                radius: 4.2,
                tickTimer: 0,
                update() {
                    this.life--;
                    this.tickTimer++;

                    // Flickering flame intensity
                    this.mesh.material.opacity = 0.55 + Math.sin(this.life * 0.3) * 0.25;

                    // Periodic flame tongue & smoke particles
                    if (this.tickTimer % 8 === 0) {
                        const sparkPos = this.pos.clone();
                        sparkPos.x += (Math.random() - 0.5) * 3.0;
                        sparkPos.z += (Math.random() - 0.5) * 3.0;
                        sparkPos.y = groundY + 0.2;
                        spawnSmokePuff(sparkPos, 0x1e272e, 0.4);
                    }

                    // Lingering damage tick: burn enemy units trapped in napalm pool!
                    if (this.tickTimer % 20 === 0) {
                        enemyUnits.forEach(enemy => {
                            if (enemy.health > 0 && enemy.mesh && !enemy.isAir) {
                                if (enemy.mesh.position.distanceTo(this.pos) <= this.radius) {
                                    enemy.health -= 8;
                                }
                            }
                        });
                        units.forEach(unit => {
                            if (unit.health > 0 && unit.mesh && !unit.isAir && unit.selectedFaction !== 'usa') {
                                if (unit.mesh.position.distanceTo(this.pos) <= this.radius) {
                                    unit.health -= 5;
                                }
                            }
                        });
                    }

                    if (this.life <= 0) {
                        scene.remove(this.mesh);
                        this.mesh.geometry.dispose();
                        this.mesh.material.dispose();
                        return false;
                    }
                    return true;
                }
            });
        }

        // Lingering Toxic Gas Cloud (Anthrax / GLA Toxin pool with poison tick)
        function spawnLingeringToxinCloud(pos) {
            const groundY = getTerrainHeight(pos.x, pos.z);
            const cloudGeo = new THREE.CircleGeometry(4.0, 16);
            cloudGeo.rotateX(-Math.PI / 2);
            const cloudMat = new THREE.MeshBasicMaterial({ color: 0x2ed573, transparent: true, opacity: 0.75, depthWrite: false });
            const cloud = new THREE.Mesh(cloudGeo, cloudMat);
            cloud.position.set(pos.x, groundY + 0.05, pos.z);
            scene.add(cloud);

            activeFX.push({
                mesh: cloud,
                pos: pos.clone(),
                life: 300, // ~5.0 seconds
                maxLife: 300,
                radius: 4.8,
                tickTimer: 0,
                update() {
                    this.life--;
                    this.tickTimer++;

                    // Pulsing toxic glow
                    this.mesh.material.opacity = 0.45 + Math.sin(this.life * 0.2) * 0.25;

                    // Rising green toxic mist spores
                    if (this.tickTimer % 6 === 0) {
                        const mistPos = this.pos.clone();
                        mistPos.x += (Math.random() - 0.5) * 3.5;
                        mistPos.z += (Math.random() - 0.5) * 3.5;
                        mistPos.y = groundY + 0.3;
                        spawnSmokePuff(mistPos, 0x2ed573, 0.5);
                    }

                    // Lingering poison damage tick: deals damage to infantry & light vehicles
                    if (this.tickTimer % 20 === 0) {
                        units.forEach(unit => {
                            if (unit.health > 0 && unit.mesh && !unit.isAir) {
                                if (unit.mesh.position.distanceTo(this.pos) <= this.radius) {
                                    unit.health -= 7;
                                }
                            }
                        });
                        enemyUnits.forEach(enemy => {
                            if (enemy.health > 0 && enemy.mesh && !enemy.isAir) {
                                if (enemy.mesh.position.distanceTo(this.pos) <= this.radius) {
                                    enemy.health -= 7;
                                }
                            }
                        });
                    }

                    if (this.life <= 0) {
                        scene.remove(this.mesh);
                        this.mesh.geometry.dispose();
                        this.mesh.material.dispose();
                        return false;
                    }
                    return true;
                }
            });
        }

        function spawnToxinPuddle(pos) { spawnLingeringToxinCloud(pos); }

        function spawnFlamethrowerBurst(fromPos, toPos) {
            const steps = 7;
            for (let i = 0; i < steps; i++) {
                const alpha = (i + 1) / steps;
                const pos = new THREE.Vector3().lerpVectors(fromPos, toPos, alpha);
                setTimeout(() => {
                    spawnSmokePuff(pos, 0xff6b35, 0.4 + alpha * 0.6);
                    if (i === steps - 1 && Math.random() < 0.4) {
                        spawnNapalmScorchPool(toPos);
                    }
                }, i * 35);
            }
        }

        function spawnToxinSprayBurst(fromPos, toPos) {
            const steps = 6;
            for (let i = 0; i < steps; i++) {
                const alpha = (i + 1) / steps;
                const pos = new THREE.Vector3().lerpVectors(fromPos, toPos, alpha);
                setTimeout(() => {
                    spawnSmokePuff(pos, 0x2ed573, 0.35 + alpha * 0.5);
                    if (i === steps - 1 && Math.random() < 0.4) {
                        spawnLingeringToxinCloud(toPos);
                    }
                }, i * 40);
            }
        }

        // Aurora Hypersonic Fuel-Air Bomb Detonation (Gigantic double shockwave + scorched crater)
        function spawnFuelAirExplosion(pos) {
            playUSASound('aurora_bomb');

            // 1. Massive expanding fireball
            spawnEnhancedExplosion(pos, 0xff793f, 3.2, true);

            // 2. Extra wide secondary supersonic shockwave ring
            const ringGeo = new THREE.RingGeometry(1.0, 3.5, 32);
            ringGeo.rotateX(-Math.PI / 2);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0x00d2d3, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.set(pos.x, getTerrainHeight(pos.x, pos.z) + 0.1, pos.z);
            scene.add(ring);

            // 3. Persistent scorched blast crater
            spawnCraterDecal(pos, 4.5, 520);

            // 4. Lingering napalm scorch pool
            spawnNapalmScorchPool(pos);

            activeFX.push({
                ring: ring,
                life: 24,
                maxLife: 24,
                update() {
                    this.life--;
                    const progress = 1 - (this.life / this.maxLife);
                    const scale = 1 + progress * 7.5;
                    this.ring.scale.set(scale, scale, 1);
                    this.ring.material.opacity = Math.max(0, (1 - progress) * 0.95);
                    if (this.life <= 0) {
                        scene.remove(this.ring);
                        this.ring.geometry.dispose();
                        this.ring.material.dispose();
                        return false;
                    }
                    return true;
                }
            });
        }

        // Paladin Point Defense Laser beam
        function spawnLaserBeam(fromPos, toPos, color = 0x00d2d3, coreThickness = 4) {
            const points = [fromPos.clone(), toPos.clone()];
            const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
            const lineMat = new THREE.LineBasicMaterial({ color: color, linewidth: coreThickness, transparent: true, opacity: 0.95 });
            const line = new THREE.Line(lineGeo, lineMat);
            scene.add(line);

            activeFX.push({
                mesh: line,
                life: 4,
                maxLife: 4,
                update() {
                    this.life--;
                    this.mesh.material.opacity = this.life / this.maxLife;
                    if (this.life <= 0) {
                        scene.remove(this.mesh);
                        this.mesh.geometry.dispose();
                        this.mesh.material.dispose();
                        return false;
                    }
                    return true;
                }
            });
        }

        function spawnMiniNukeMushroom(pos) {
            spawnEnhancedExplosion(pos, 0x2ed573, 3.8, true);
            spawnCraterDecal(pos, 5.0, 600);
            spawnLingeringToxinCloud(pos);
        }

        // Authentic Infantry Crushing Decal (SquishCollide.cpp)
        function spawnSquishDecal(pos) {
            const geo = new THREE.CircleGeometry(1.2, 10);
            geo.rotateX(-Math.PI / 2);
            const mat = new THREE.MeshBasicMaterial({
                color: 0x5a0b0b,
                transparent: true,
                opacity: 0.85,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(geo, mat);
            const groundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(pos.x, pos.z) : (pos.y || 0);
            mesh.position.set(pos.x, groundY + 0.04, pos.z);
            mesh.rotation.y = Math.random() * Math.PI * 2;
            mesh.scale.set(1.0 + Math.random() * 0.4, 1.0, 0.8 + Math.random() * 0.3);
            scene.add(mesh);
            activeFX.push({
                mesh: mesh,
                life: 600, // ~10 seconds
                maxLife: 600,
                update() {
                    this.life--;
                    if (this.life < 60) {
                        this.mesh.material.opacity = (this.life / 60) * 0.85;
                    }
                    if (this.life <= 0) {
                        scene.remove(this.mesh);
                        this.mesh.geometry.dispose();
                        this.mesh.material.dispose();
                        return false;
                    }
                    return true;
                }
            });
        }

        // Authentic GLA Salvage Scrap Crate (SalvageCrateCollide.cpp)
        function spawnScrapCrate(pos) {
            const group = new THREE.Group();
            const groundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(pos.x, pos.z) : (pos.y || 0);
            group.position.set(pos.x, groundY + 0.45, pos.z);

            // Crate Box
            const crateGeo = new THREE.BoxGeometry(1.3, 0.8, 1.3);
            const crateMat = new THREE.MeshStandardMaterial({
                color: 0x5c4033, // rusted bronze/scrap
                roughness: 0.65,
                metalness: 0.75
            });
            const crate = new THREE.Mesh(crateGeo, crateMat);
            group.add(crate);

            // Green salvage scrap beacon icon
            const scrapGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 6);
            const scrapMat = new THREE.MeshBasicMaterial({
                color: 0x2ed573,
                transparent: true,
                opacity: 0.95
            });
            const scrapIcon = new THREE.Mesh(scrapGeo, scrapMat);
            scrapIcon.position.y = 0.55;
            group.add(scrapIcon);

            // Ground pulse aura
            const ringGeo = new THREE.RingGeometry(0.8, 1.3, 16);
            ringGeo.rotateX(-Math.PI / 2);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0x2ed573,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.55
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.y = -0.4;
            group.add(ring);

            scene.add(group);

            const crateObj = {
                mesh: group,
                position: group.position,
                ringMat: ringMat,
                life: 2400, // ~40 seconds
                update() {
                    this.life--;
                    this.mesh.rotation.y += 0.02;
                    const pulse = 0.35 + Math.sin(Date.now() * 0.005) * 0.25;
                    this.ringMat.opacity = pulse;
                    if (this.life <= 0) {
                        scene.remove(this.mesh);
                        this.mesh.traverse(c => {
                            if (c.geometry) c.geometry.dispose();
                            if (c.material) c.material.dispose();
                        });
                        return false;
                    }
                    return true;
                }
            };
            activeScrapCrates.push(crateObj);
        }

        // Update all FX every frame
        function updateFXEngine() {
            for (let i = activeFX.length - 1; i >= 0; i--) {
                const alive = activeFX[i].update();
                if (!alive) {
                    activeFX.splice(i, 1);
                }
            }
            for (let i = activeScrapCrates.length - 1; i >= 0; i--) {
                const alive = activeScrapCrates[i].update();
                if (!alive) {
                    activeScrapCrates.splice(i, 1);
                }
            }
        }

        // Muzzle position helper for realistic weapon firing origins
        function getMuzzleWorldPosition(attacker, xOffset = 0) {
            const turret = attacker.mesh.getObjectByName("turretSystem");
            if (turret) {
                const wp = new THREE.Vector3();
                turret.getWorldPosition(wp);
                const q = turret.getWorldQuaternion(new THREE.Quaternion());
                const forward = new THREE.Vector3(xOffset, 0.15, 1.6).applyQuaternion(q);
                wp.add(forward);
                return wp;
            }
            const wp = attacker.mesh.position.clone();
            wp.y += attacker.isAir ? -0.25 : 0.8;
            if (xOffset !== 0) {
                const side = new THREE.Vector3(xOffset, 0, 0).applyQuaternion(attacker.mesh.quaternion);
                wp.add(side);
            }
            return wp;
        }

        // =========================================================================
        
        // =========================================================================
        // CINEMATIC ANIMATED SUPERWEAPONS (PARTICLE CANNON, NUKE SILO, SCUD STORM)
        // =========================================================================

        function animateParticleCannonStrike(targetPos, duration = 240) {
            playAudio('orbital_beam');

            const group = new THREE.Group();
            group.position.copy(targetPos);

            // 1. Searing orbital column
            const beamGeo = new THREE.CylinderGeometry(0.8, 1.4, 90, 16);
            const beamMat = new THREE.MeshBasicMaterial({ color: 0x00d2d3, transparent: true, opacity: 0.95 });
            const beam = new THREE.Mesh(beamGeo, beamMat);
            beam.position.y = 45;
            group.add(beam);

            // 2. Rotating orbital energy vortex rings
            const rings = [];
            for (let i = 0; i < 4; i++) {
                const rGeo = new THREE.RingGeometry(1.6 + i * 0.6, 2.0 + i * 0.6, 24);
                rGeo.rotateX(-Math.PI / 2);
                const rMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
                const r = new THREE.Mesh(rGeo, rMat);
                r.position.y = 6 + i * 14;
                group.add(r);
                rings.push(r);
            }

            scene.add(group);

            let life = duration;
            let sweepAngle = 0;
            const originCenter = targetPos.clone();

            activeFX.push({
                life: duration,
                update() {
                    life--;
                    sweepAngle += 0.08;
                    const sweepRadius = Math.sin((duration - life) * 0.02) * 12.0;
                    group.position.x = originCenter.x + Math.cos(sweepAngle) * sweepRadius;
                    group.position.z = originCenter.z + Math.sin(sweepAngle) * sweepRadius;
                    group.position.y = getTerrainHeight(group.position.x, group.position.z);

                    rings.forEach((r, idx) => {
                        r.rotation.y += 0.15 * (idx % 2 === 0 ? 1 : -1);
                        r.scale.setScalar(1 + Math.sin(Date.now() * 0.02 + idx) * 0.2);
                    });

                    // Ground electrical sizzle & sparks
                    if (Math.random() < 0.8) {
                        spawnSparks(group.position, 0x00d2d3, 8);
                        spawnSmokePuff(group.position, 0x222f3e, 0.6);
                    }

                    // Continuous damage tick to hostile units & structures in beam path
                    if (life % 10 === 0) {
                        const beamPos = group.position;
                        enemyUnits.forEach(enemy => {
                            if (enemy.health > 0 && enemy.mesh && enemy.mesh.position.distanceTo(beamPos) <= 9.0) {
                                enemy.health -= 35;
                            }
                        });
                        enemyStructures.forEach(struct => {
                            if (struct.health > 0 && struct.position && struct.position.distanceTo(beamPos) <= 12.0) {
                                struct.health -= 50;
                            }
                        });
                        if (Math.random() < 0.2) {
                            spawnCraterDecal(beamPos, 2.5, 300);
                        }
                    }

                    if (life <= 0) {
                        scene.remove(group);
                        group.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
                        spawnEnhancedExplosion(group.position, 0x00d2d3, 2.8, true);
                        spawnCraterDecal(group.position, 4.0, 480);
                        return false;
                    }
                    return true;
                }
            });
        }

        function animateNukeStrike(siloPos, targetPos) {
            playAudio('superweapon_siren');

            // 1. Ascending ICBM from Silo
            const missileGroup = new THREE.Group();
            missileGroup.position.copy(siloPos || targetPos);
            const mGeo = new THREE.CylinderGeometry(0.4, 0.45, 4.2, 8);
            const mMat = new THREE.MeshStandardMaterial({ color: 0xecf0f1, metalness: 0.8, roughness: 0.2 });
            const missileBody = new THREE.Mesh(mGeo, mMat);
            missileGroup.add(missileBody);

            const noseGeo = new THREE.ConeGeometry(0.4, 1.2, 8);
            const noseMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c });
            const nose = new THREE.Mesh(noseGeo, noseMat);
            nose.position.y = 2.7;
            missileGroup.add(nose);

            scene.add(missileGroup);

            let phase = 'ascent';
            let frame = 0;

            activeFX.push({
                life: 200,
                update() {
                    frame++;
                    if (phase === 'ascent') {
                        missileGroup.position.y += 1.8;
                        spawnSmokePuff(missileGroup.position, 0xff793f, 0.8);
                        if (missileGroup.position.y > 90) {
                            phase = 'descent';
                            missileGroup.position.set(targetPos.x, 100, targetPos.z);
                            missileGroup.rotation.x = Math.PI; // point down
                        }
                    } else if (phase === 'descent') {
                        missileGroup.position.y -= 3.2;
                        spawnSmokePuff(missileGroup.position, 0xff5252, 0.9);
                        const groundY = getTerrainHeight(targetPos.x, targetPos.z);
                        if (missileGroup.position.y <= groundY + 1.0) {
                            scene.remove(missileGroup);
                            missileGroup.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });

                            // Detonation!
                            playAudio('nuke_detonation');
                            spawnMushroomCloud(targetPos);

                            // Apocalyptic damage: 750 to enemies within 25 units
                            enemyUnits.forEach(enemy => {
                                if (enemy.health > 0 && enemy.mesh && enemy.mesh.position.distanceTo(targetPos) <= 25.0) {
                                    enemy.health -= 750;
                                }
                            });
                            enemyStructures.forEach(struct => {
                                if (struct.health > 0 && struct.position && struct.position.distanceTo(targetPos) <= 28.0) {
                                    struct.health -= 750;
                                }
                            });
                            return false;
                        }
                    }
                    return true;
                }
            });
        }

        function spawnMushroomCloud(pos) {
            const groundY = getTerrainHeight(pos.x, pos.z);

            // 1. Colossal expanding cap
            const capGeo = new THREE.SphereGeometry(3.5, 16, 16);
            const capMat = new THREE.MeshBasicMaterial({ color: 0xff6b35, transparent: true, opacity: 0.95 });
            const cap = new THREE.Mesh(capGeo, capMat);
            cap.position.set(pos.x, groundY + 4, pos.z);
            scene.add(cap);

            // 2. Vertical rising stem
            const stemGeo = new THREE.CylinderGeometry(1.2, 2.2, 14, 12);
            const stemMat = new THREE.MeshBasicMaterial({ color: 0x2f3542, transparent: true, opacity: 0.85 });
            const stem = new THREE.Mesh(stemGeo, stemMat);
            stem.position.set(pos.x, groundY + 7, pos.z);
            scene.add(stem);

            // 3. Supersonic shockwave ring
            const ringGeo = new THREE.RingGeometry(1.5, 4.5, 32);
            ringGeo.rotateX(-Math.PI / 2);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
            const shockwave = new THREE.Mesh(ringGeo, ringMat);
            shockwave.position.set(pos.x, groundY + 0.2, pos.z);
            scene.add(shockwave);

            // 4. Crater and lingering fallout
            spawnCraterDecal(pos, 7.5, 800);
            spawnLingeringToxinCloud(pos);

            let life = 60;
            activeFX.push({
                life: 60,
                update() {
                    life--;
                    const progress = 1 - (life / 60);

                    // Cap expands and billows upward
                    cap.position.y = groundY + 4 + progress * 16;
                    cap.scale.set(1 + progress * 3.5, 1 + progress * 2.2, 1 + progress * 3.5);
                    cap.material.opacity = Math.max(0, 0.95 - progress * 0.85);

                    // Stem stretches
                    stem.position.y = groundY + (4 + progress * 16) / 2;
                    stem.scale.set(1 + progress * 1.5, 1 + progress * 2.0, 1 + progress * 1.5);
                    stem.material.opacity = Math.max(0, 0.85 - progress * 0.8);

                    // Shockwave expands to 28 units
                    const rScale = 1 + progress * 6.5;
                    shockwave.scale.set(rScale, rScale, 1);
                    shockwave.material.opacity = Math.max(0, 0.95 - progress * 1.0);

                    if (life <= 0) {
                        scene.remove(cap); cap.geometry.dispose(); cap.material.dispose();
                        scene.remove(stem); stem.geometry.dispose(); stem.material.dispose();
                        scene.remove(shockwave); shockwave.geometry.dispose(); shockwave.material.dispose();
                        return false;
                    }
                    return true;
                }
            });
        }

        function animateScudStormStrike(stormPos, targetPos) {
            playAudio('superweapon_siren');
            playAudio('scud_storm_volley');

            // 9-rocket ripple salvo
            for (let i = 0; i < 9; i++) {
                setTimeout(() => {
                    const offset = new THREE.Vector3((Math.random() - 0.5) * 24, 0, (Math.random() - 0.5) * 24);
                    const subTarget = targetPos.clone().add(offset);
                    const launchOrigin = stormPos ? stormPos.clone() : targetPos.clone().add(new THREE.Vector3(-40, 0, -40));
                    launchOrigin.y += 2.0;

                    spawnRocketProjectile(launchOrigin, subTarget, true, true);

                    setTimeout(() => {
                        enemyUnits.forEach(enemy => {
                            if (enemy.health > 0 && enemy.mesh && enemy.mesh.position.distanceTo(subTarget) <= 10.0) {
                                enemy.health -= 120;
                            }
                        });
                        enemyStructures.forEach(struct => {
                            if (struct.health > 0 && struct.position && struct.position.distanceTo(subTarget) <= 12.0) {
                                struct.health -= 140;
                            }
                        });
                        spawnLingeringToxinCloud(subTarget);
                        spawnCraterDecal(subTarget, 3.2, 450);
                    }, 1400);
                }, i * 160);
            }
        }

        // =========================================================================
        // USA VEHICLE DRONE ATTACHMENTS (BATTLE, SCOUT, HELLFIRE)
        // =========================================================================

        function createDroneMesh(droneType) {
            const group = new THREE.Group();
            const bodyMat = new THREE.MeshStandardMaterial({
                color: droneType === 'scout' ? 0x747d8c : droneType === 'hellfire' ? 0x2f3542 : 0x576574,
                metalness: 0.8,
                roughness: 0.3
            });

            // Aerodynamic pod body
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.52), bodyMat);
            group.add(body);

            // Glowing sensor lens
            const eyeColor = droneType === 'scout' ? 0x2ed573 : droneType === 'hellfire' ? 0xff4757 : 0x00d2d3;
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshBasicMaterial({ color: eyeColor }));
            eye.position.set(0, -0.04, 0.28);
            group.add(eye);

            // Twin micro-rotors
            const rotors = new THREE.Group();
            const bladeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
            const bladeL = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.02, 0.08), bladeMat);
            bladeL.position.x = -0.22; rotors.add(bladeL);
            const bladeR = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.02, 0.08), bladeMat);
            bladeR.position.x = 0.22; rotors.add(bladeR);
            rotors.position.y = 0.12;
            group.add(rotors);

            group.userData.rotors = rotors;
            group.userData.droneType = droneType;
            return group;
        }

        function attachVehicleDrone(vehicle, droneType) {
            if (vehicle.drone && vehicle.drone.mesh) {
                scene.remove(vehicle.drone.mesh);
                vehicle.drone.mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
            }

            const mesh = createDroneMesh(droneType);
            mesh.position.copy(vehicle.mesh.position);
            mesh.position.y += droneType === 'scout' ? 4.2 : 2.2;
            scene.add(mesh);

            vehicle.drone = {
                type: droneType,
                mesh: mesh,
                timer: 0,
                cooldown: 0
            };

            // Scout drone boosts vision
            if (droneType === 'scout') {
                vehicle.scanRange = Math.round(vehicle.scanRange * 1.5);
            }

            playAudio('radio_chirp');
            showNotification(`${vehicle.type.toUpperCase()} deployed ${droneType.toUpperCase()} DRONE!`, 'success');
        }

        // =========================================================================
        // CHINA OVERLORD TANK SUPERSTRUCTURE UPGRADES (BUNKER, GATLING, PROPAGANDA)
        // =========================================================================

        function attachOverlordUpgrade(tank, upgradeType) {
            if (!tank || !tank.mesh) return;
            const turretSys = tank.mesh.getObjectByName("turretSystem") || tank.mesh;

            // Remove any existing superstructure upgrade
            if (tank.overlordUpgradeMesh) {
                if (tank.overlordUpgradeMesh.parent) {
                    tank.overlordUpgradeMesh.parent.remove(tank.overlordUpgradeMesh);
                } else {
                    turretSys.remove(tank.overlordUpgradeMesh);
                    tank.mesh.remove(tank.overlordUpgradeMesh);
                }
                tank.overlordUpgradeMesh.traverse(c => {
                    if (c.geometry) c.geometry.dispose();
                    if (c.material) {
                        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
                        else c.material.dispose();
                    }
                });
                tank.overlordUpgradeMesh = null;
            }

            // Hide the default command cupola and flag mast so they do not overlap the superstructure
            const cupola = tank.mesh.getObjectByName("commandCupola");
            if (cupola) cupola.visible = false;
            const mast = tank.mesh.getObjectByName("flagMast");
            if (mast) mast.visible = false;
            const flag = tank.mesh.getObjectByName("plaFlag");
            if (flag) flag.visible = false;
            const searchlight = tank.mesh.getObjectByName("cupolaSearchlight");
            if (searchlight) searchlight.visible = false;

            const group = new THREE.Group();
            group.name = "overlordUpgrade";
            // Mount directly onto the turret roof at the cupola mount position!
            group.position.set(0, 0.88, -0.45);

            if (upgradeType === 'bunker') {
                // Fortified hexagonal bunker pillbox with vision slits & firing embrasures
                const bGeo = new THREE.CylinderGeometry(1.15, 1.3, 0.9, 6);
                const bMat = new THREE.MeshStandardMaterial({ color: 0x47535e, roughness: 0.75, metalness: 0.35 });
                const b = new THREE.Mesh(bGeo, bMat);
                b.position.y = 0.45;
                b.castShadow = true;
                group.add(b);

                // Armored top rim / parapet
                const rimGeo = new THREE.CylinderGeometry(1.22, 1.22, 0.18, 6);
                const rimMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.6 });
                const rim = new THREE.Mesh(rimGeo, rimMat);
                rim.position.y = 0.92;
                group.add(rim);

                // Vision / firing slits
                for (let a = 0; a < 6; a++) {
                    const slitGeo = new THREE.BoxGeometry(0.42, 0.14, 0.18);
                    const slitMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
                    const slit = new THREE.Mesh(slitGeo, slitMat);
                    const ang = (a * Math.PI) / 3;
                    slit.position.set(Math.cos(ang) * 1.15, 0.55, Math.sin(ang) * 1.15);
                    slit.rotation.y = -ang + Math.PI / 2;
                    group.add(slit);
                }

                // Mini infantry helmet heads inside open hatch
                const hMat = new THREE.MeshStandardMaterial({ color: 0x27ae60 });
                [-0.35, 0.35].forEach(x => {
                    const h = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), hMat);
                    h.position.set(x, 1.05, 0);
                    group.add(h);
                });
            } else if (upgradeType === 'gatling') {
                // Raised motorized rotary turret base
                const baseGeo = new THREE.CylinderGeometry(0.85, 0.95, 0.45, 12);
                const baseMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, metalness: 0.8, roughness: 0.3 });
                const base = new THREE.Mesh(baseGeo, baseMat);
                base.position.y = 0.22;
                base.castShadow = true;
                group.add(base);

                // Swivel gun mount
                const mountGeo = new THREE.BoxGeometry(0.85, 0.45, 0.65);
                const mountMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.9 });
                const mount = new THREE.Mesh(mountGeo, mountMat);
                mount.position.set(0, 0.55, 0.1);
                group.add(mount);

                const barrelGroup = new THREE.Group();
                barrelGroup.name = "gatlingBarrels";
                barrelGroup.position.set(0, 0.65, 0.2);

                [-0.3, 0.3].forEach(bx => {
                    // Twin long heavy Gatling barrel assemblies
                    const bGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.2, 8);
                    bGeo.rotateX(Math.PI / 2);
                    const bMat = new THREE.MeshStandardMaterial({ color: 0x2f3542, metalness: 0.9, roughness: 0.2 });
                    const bMesh = new THREE.Mesh(bGeo, bMat);
                    bMesh.position.set(bx, 0, 1.1);
                    bMesh.castShadow = true;
                    barrelGroup.add(bMesh);

                    // Muzzle flash arrestor rings
                    const ringGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.22, 8);
                    ringGeo.rotateX(Math.PI / 2);
                    const ringMat = new THREE.MeshStandardMaterial({ color: 0x747d8c, metalness: 0.8 });
                    const ring = new THREE.Mesh(ringGeo, ringMat);
                    ring.position.set(bx, 0, 2.15);
                    barrelGroup.add(ring);
                });
                group.add(barrelGroup);

                // Rear Ammo feed box
                const ammoGeo = new THREE.BoxGeometry(0.8, 0.4, 0.5);
                const ammoMat = new THREE.MeshStandardMaterial({ color: 0x57606f, metalness: 0.6 });
                const ammo = new THREE.Mesh(ammoGeo, ammoMat);
                ammo.position.set(0, 0.55, -0.4);
                group.add(ammo);
            } else if (upgradeType === 'propaganda') {
                // Sturdy speaker mast tower with crimson beacon and 4 gold megaphone horns
                const mastGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.8, 8);
                const mastMat = new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.5 });
                const mast = new THREE.Mesh(mastGeo, mastMat);
                mast.position.y = 0.9;
                mast.castShadow = true;
                group.add(mast);

                // Flashing red propaganda beacon sphere
                const beaconGeo = new THREE.SphereGeometry(0.24, 8, 8);
                const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3838 });
                const beacon = new THREE.Mesh(beaconGeo, beaconMat);
                beacon.position.y = 1.9;
                group.add(beacon);

                // 4 heavy megaphone horn cones facing N, S, E, W
                for (let a = 0; a < 4; a++) {
                    const hornGeo = new THREE.ConeGeometry(0.32, 0.75, 8);
                    hornGeo.rotateX(Math.PI / 2);
                    const hornMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.4, metalness: 0.5 });
                    const horn = new THREE.Mesh(hornGeo, hornMat);
                    const ang = (a * Math.PI) / 2;
                    horn.position.set(Math.cos(ang) * 0.55, 1.5, Math.sin(ang) * 0.55);
                    horn.lookAt(new THREE.Vector3(horn.position.x * 2, 1.5, horn.position.z * 2));
                    group.add(horn);
                }
            }

            turretSys.add(group);
            tank.overlordUpgradeMesh = group;
            tank.overlordUpgrade = upgradeType;

            playAudio('construction', {}, 'china');
            showNotification(`OVERLORD upgraded with ${upgradeType.toUpperCase()}!`, 'success');
        }

        // =========================================================================
        // CHINA NUKE CANNON OUTRIGGER SIEGE DEPLOYMENT
        // =========================================================================

        function deployNukeCannonOutriggers(cannon) {
            if (cannon.isDeployed) return;
            cannon.isDeployed = true;
            playAudio('construction', {}, 'china');

            const chassis = cannon.mesh;
            const legMat = new THREE.MeshStandardMaterial({ color: 0x2d3436, metalness: 0.8 });
            [-1.4, 1.4].forEach(x => {
                [-1.6, 1.6].forEach(z => {
                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.8, 6), legMat);
                    leg.position.set(x, 0.3, z);
                    chassis.add(leg);
                });
            });
        }

        // Tactical Ground Waypoint Marker & Beacon (Move, Attack, Rally)
        function spawnWaypointMarker(pos, orderType = 'move') {
            if (!pos) return;
            const group = new THREE.Group();
            const yPos = typeof getTerrainHeight === 'function' ? getTerrainHeight(pos.x, pos.z) + 0.15 : pos.y + 0.15;
            group.position.set(pos.x, yPos, pos.z);

            const color = orderType === 'attack' ? 0xff2222 : orderType === 'rally' ? 0xf1c40f : 0x00ffcc;

            // 1. Expanding ground ripple ring
            const ringGeo = new THREE.RingGeometry(0.7, 1.15, 32);
            const ringMat = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
            const ringMesh = new THREE.Mesh(ringGeo, ringMat);
            ringMesh.rotation.x = -Math.PI / 2;
            group.add(ringMesh);

            // 2. Crosshair reticle ticks
            const tickGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-1.8, 0.05, 0), new THREE.Vector3(1.8, 0.05, 0),
                new THREE.Vector3(0, 0.05, -1.8), new THREE.Vector3(0, 0.05, 1.8)
            ]);
            const tickMat = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.9 });
            const crosshair = new THREE.LineSegments(tickGeo, tickMat);
            group.add(crosshair);

            // 3. Vertical beacon light beam shooting upwards
            const beamGeo = new THREE.CylinderGeometry(0.12, 0.35, 18, 16, 1, true);
            const beamMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.65, side: THREE.DoubleSide });
            const beamMesh = new THREE.Mesh(beamGeo, beamMat);
            beamMesh.position.y = 9.0;
            group.add(beamMesh);

            scene.add(group);

            let life = 0;
            const maxLife = 40;

            activeFX.push({
                update() {
                    life++;
                    const t = life / maxLife;
                    ringMesh.scale.addScalar(0.045);
                    ringMat.opacity = Math.max(0, 0.95 * (1.0 - t));
                    tickMat.opacity = Math.max(0, 0.9 * (1.0 - t));
                    beamMat.opacity = Math.max(0, 0.65 * (1.0 - t));
                    group.position.y += 0.02;

                    if (life >= maxLife) {
                        scene.remove(group);
                        ringGeo.dispose();
                        ringMat.dispose();
                        tickGeo.dispose();
                        tickMat.dispose();
                        beamGeo.dispose();
                        beamMat.dispose();
                        return false;
                    }
                    return true;
                }
            });
        }
