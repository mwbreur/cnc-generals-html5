// COMMAND & CONQUER: GENERALS - AUTHENTIC WEAPON EFFECTS & PARTICLE SYSTEM
        // =========================================================================
        const activeFX = [];

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

        function spawnRocketProjectile(fromPos, toPos, isHeavy = false, isToxin = false) {
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

            activeFX.push({
                group: group,
                curPos: fromPos.clone(),
                toPos: toPos.clone(),
                distTotal: distTotal,
                distTraveled: 0,
                speed: speed,
                isHeavy: isHeavy,
                isToxin: isToxin,
                update() {
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

                        spawnEnhancedExplosion(this.toPos, this.isToxin ? 0x2ed573 : 0xff4757, this.isHeavy ? 2.2 : 1.2, this.isHeavy);
                        if (this.isToxin) {
                            spawnLingeringToxinCloud(this.toPos);
                        } else if (this.isHeavy) {
                            spawnCraterDecal(this.toPos, 3.2, 420);
                        }
                        return false;
                    }
                    return true;
                }
            });
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

        // Update all FX every frame
        function updateFXEngine() {
            for (let i = activeFX.length - 1; i >= 0; i--) {
                const alive = activeFX[i].update();
                if (!alive) {
                    activeFX.splice(i, 1);
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
        