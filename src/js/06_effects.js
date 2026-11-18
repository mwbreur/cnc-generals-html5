// COMMAND & CONQUER: GENERALS - AUTHENTIC WEAPON EFFECTS & PARTICLE SYSTEM
// =========================================================================
const activeFX = [];
const activeMissiles = [];
const activeScrapCrates = [];

// Helper: Create glowing particle materials & shared unit-radius geometries (PERF: zero per-particle geometry alloc/dispose)
const fxMatFire = new THREE.MeshBasicMaterial({ color: 0xff6b35, transparent: true, opacity: 0.95 });
const fxMatSmoke = new THREE.MeshBasicMaterial({ color: 0x3d444d, transparent: true, opacity: 0.82 });
const fxMatToxin = new THREE.MeshBasicMaterial({ color: 0x2ed573, transparent: true, opacity: 0.95 });
const fxMatSpark = new THREE.MeshBasicMaterial({ color: 0xfff200, transparent: true, opacity: 1.0 });
const _fxSphere8 = new THREE.SphereGeometry(1, 8, 8);
const _fxSphere6 = new THREE.SphereGeometry(1, 6, 6);
const _fxSparkGeo = new THREE.SphereGeometry(0.12, 4, 4);
const _fxTracerGeo = new THREE.CylinderGeometry(1, 0.5, 1, 6);
if (typeof _fxTracerGeo.rotateX === 'function') _fxTracerGeo.rotateX(Math.PI / 2);
const _fxSparkMatCache = {};
const _fxSpriteTexCache = {};

function _getFxSpriteTex(kind) {
    if (_fxSpriteTexCache[kind]) return _fxSpriteTexCache[kind];
    if (typeof THREE === 'undefined' || !THREE.Sprite || !THREE.SpriteMaterial || typeof document === 'undefined' || !document.createElement) return null;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext && c.getContext('2d');
    if (!ctx) return null;
    const cx = 64, cy = 64;
    if (kind === 'flash') {
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 62);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.25, 'rgba(255,235,160,0.95)');
        g.addColorStop(0.55, 'rgba(255,140,30,0.55)');
        g.addColorStop(1, 'rgba(255,80,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
        // Starburst spikes
        ctx.fillStyle = 'rgba(255,255,230,0.75)';
        for (let a = 0; a < 4; a++) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate((a * Math.PI) / 4);
            ctx.beginPath();
            ctx.ellipse(0, 0, 56, 4.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    } else if (kind === 'fireball') {
        const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 60);
        g.addColorStop(0, 'rgba(255,255,220,1)');
        g.addColorStop(0.3, 'rgba(255,180,50,0.92)');
        g.addColorStop(0.65, 'rgba(220,65,15,0.65)');
        g.addColorStop(1, 'rgba(80,15,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
        for (let b = 0; b < 7; b++) {
            const ang = (b / 7) * Math.PI * 2;
            const bx = cx + Math.cos(ang) * 18;
            const by = cy + Math.sin(ang) * 18;
            const bg = ctx.createRadialGradient(bx, by, 2, bx, by, 28);
            bg.addColorStop(0, 'rgba(255,210,90,0.65)');
            bg.addColorStop(1, 'rgba(200,50,0,0)');
            ctx.fillStyle = bg;
            ctx.beginPath();
            ctx.arc(bx, by, 28, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (kind === 'smoke') {
        for (let b = 0; b < 9; b++) {
            const ang = (b / 9) * Math.PI * 2;
            const rad = b === 0 ? 0 : 18;
            const bx = cx + Math.cos(ang) * rad;
            const by = cy + Math.sin(ang) * rad;
            const bg = ctx.createRadialGradient(bx, by, 4, bx, by, 38);
            bg.addColorStop(0, 'rgba(255,255,255,0.55)');
            bg.addColorStop(0.55, 'rgba(210,210,210,0.28)');
            bg.addColorStop(1, 'rgba(150,150,150,0)');
            ctx.fillStyle = bg;
            ctx.beginPath();
            ctx.arc(bx, by, 38, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (kind === 'shockwave') {
        const g = ctx.createRadialGradient(cx, cy, 34, cx, cy, 62);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, 'rgba(255,220,160,0.85)');
        g.addColorStop(0.8, 'rgba(255,150,60,0.4)');
        g.addColorStop(1, 'rgba(255,100,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    _fxSpriteTexCache[kind] = tex;
    return tex;
}

// =========================================================================

// VISUAL WEAPON EFFECTS & MULTI-STAGE PARTICLE SYSTEMS
// =========================================================================

function spawnMuzzleFlash(pos, color = 0xffa502, size = 0.65) {
    const tex = _getFxSpriteTex('flash');
    const flashMat = tex
    ? new THREE.SpriteMaterial({ map: tex, color: color, transparent: true, opacity: 1.0, blending: THREE.AdditiveBlending, depthWrite: false })
    : new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1.0 });
    const flash = tex ? new THREE.Sprite(flashMat) : new THREE.Mesh(_fxSphere8, flashMat);
    const initS = size * (tex ? 2.4 : 1.0);
    flash.scale.set(initS, initS, initS);
    flash.position.copy(pos);
    scene.add(flash);

    activeFX.push({
            mesh: flash,
            baseSize: initS,
            life: 5,
            maxLife: 5,
            update() {
                this.life--;
                const progress = this.life / this.maxLife;
                const s = this.baseSize * (1 + (1 - progress) * 0.75);
                this.mesh.scale.set(s, s, s);
                this.mesh.material.opacity = progress;
                if (this.life <= 0) {
                    scene.remove(this.mesh);
                    this.mesh.material.dispose();
                    return false;
                }
                return true;
            }
    });
}

function spawnBulletTracer(fromPos, toPos, color = 0xf1c40f, thickness = 2) {
    const dx = toPos.x - fromPos.x, dy = toPos.y - fromPos.y, dz = toPos.z - fromPos.z;
    const totalDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (totalDist < 0.05) return;
    const nx = dx / totalDist, ny = dy / totalDist, nz = dz / totalDist;
    const boltLen = Math.min(totalDist, 2.2 + thickness * 0.85);
    const boltRadius = Math.max(0.055, thickness * 0.048);

    const mat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false
    });
    const bolt = new THREE.Mesh(_fxTracerGeo, mat);
    bolt.scale.set(boltRadius, boltRadius, boltLen);
    bolt.position.set(fromPos.x + nx * boltLen * 0.5, fromPos.y + ny * boltLen * 0.5, fromPos.z + nz * boltLen * 0.5);
    if (typeof bolt.lookAt === 'function') bolt.lookAt(toPos);
    scene.add(bolt);

    const steps = Math.max(2, Math.min(5, Math.round(totalDist / 10)));
    let tick = 0;

    activeFX.push({
            mesh: bolt,
            life: steps,
            maxLife: steps,
            update() {
                tick++;
                this.life--;
                const t = tick / this.maxLife;
                const travel = Math.max(0, totalDist - boltLen) * t + boltLen * 0.5;
                this.mesh.position.set(fromPos.x + nx * travel, fromPos.y + ny * travel, fromPos.z + nz * travel);
                this.mesh.material.opacity = Math.max(0.15, (this.life / this.maxLife) * 0.95);
                if (this.life <= 0) {
                    scene.remove(this.mesh);
                    this.mesh.material.dispose();
                    if (thickness >= 3.0 && typeof spawnMuzzleFlash === 'function') {
                        spawnMuzzleFlash(toPos, color, 0.35);
                    }
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

            if (this.metadata && this.metadata.isGuided && this.metadata.target && this.metadata.target.health > 0 && this.metadata.target.mesh) {
                this.toPos.copy(this.metadata.target.mesh.position);
                this.toPos.y += this.metadata.target.isAir ? 0.3 : 0.5;
                this.distTotal = Math.max(1, (this.fromPos || fromPos).distanceTo(this.toPos));
                (this.mesh || this.group).lookAt(this.toPos);
            }

            this.distTraveled += this.speed;
            const alpha = Math.min(1.0, this.distTraveled / Math.max(0.1, this.distTotal));
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
                if (this.metadata && this.metadata.isGuided && this.metadata.target && this.metadata.target.health > 0 && this.metadata.target.mesh) {
                    this.toPos.copy(this.metadata.target.mesh.position);
                    this.toPos.y += this.metadata.target.isAir ? 0.3 : 0.5;
                    this.distTotal = Math.max(1, (this.fromPos || fromPos).distanceTo(this.toPos));
                    (this.mesh || this.group).lookAt(this.toPos);
                }

                this.distTraveled += this.speed;
                const alpha = Math.min(1.0, this.distTraveled / Math.max(0.1, this.distTotal));
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

function spawnFloatingCashNumber(pos, amount) {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined' || !pos) return;
    if (typeof document === 'undefined' || typeof THREE.Sprite !== 'function') return;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.font = 'bold 34px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.lineWidth = 5;
        const label = `+$${amount}`;
        ctx.strokeText(label, 64, 32);
        ctx.fillStyle = '#2ecc71';
        ctx.fillText(label, 64, 32);
    }
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 1.0, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(pos.x, (pos.y || 0) + 3.2, pos.z);
    sprite.scale.set(4.5, 2.25, 1);
    scene.add(sprite);
    let life = 54;
    activeFX.push({
            life,
            update() {
                life--;
                sprite.position.y += 0.06;
                mat.opacity = Math.max(0, life / 54);
                if (life <= 0) {
                    scene.remove(sprite);
                    tex.dispose();
                    mat.dispose();
                    return false;
                }
                return true;
            }
    });
}
if (typeof window !== 'undefined') window.spawnFloatingCashNumber = spawnFloatingCashNumber;

function spawnSmokePuff(pos, color = 0xdcdde1, initialSize = 0.3) {
    if (activeFX.length > 280) return;
    const tex = _getFxSpriteTex('smoke');
    const mat = tex
    ? new THREE.SpriteMaterial({ map: tex, color: color, transparent: true, opacity: 0.72, depthWrite: false })
    : new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.75 });
    const mesh = tex ? new THREE.Sprite(mat) : new THREE.Mesh(_fxSphere6, mat);
    const startS = initialSize * (tex ? 2.6 : 1.0);
    mesh.scale.set(startS, startS, startS);
    mesh.position.copy(pos);
    mesh.position.x += (Math.random() - 0.5) * 0.4;
    mesh.position.z += (Math.random() - 0.5) * 0.4;
    scene.add(mesh);

    const growSpeed = (0.045 + Math.random() * 0.03) * startS;
    const floatSpeed = 0.055 + Math.random() * 0.04;

    activeFX.push({
            mesh: mesh,
            curScale: startS,
            life: 32 + Math.floor(Math.random() * 14),
            maxLife: 46,
            update() {
                this.life--;
                this.curScale += growSpeed;
                this.mesh.scale.set(this.curScale, this.curScale, this.curScale);
                this.mesh.position.y += floatSpeed;
                this.mesh.material.opacity = (this.life / this.maxLife) * 0.68;
                if (this.life <= 0) {
                    scene.remove(this.mesh);
                    this.mesh.material.dispose();
                    return false;
                }
                return true;
            }
    });
}

function spawnSparks(pos, color = 0xfff200, count = 12) {
    let mat = _fxSparkMatCache[color];
    if (!mat) {
        mat = new THREE.MeshBasicMaterial({ color: color });
        _fxSparkMatCache[color] = mat;
    }
    for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(_fxSparkGeo, mat);
        mesh.position.copy(pos);
        mesh.position.y += 0.35;
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
                    const s = this.life / 20;
                    this.mesh.scale.set(s, s, s);
                    if (this.life <= 0 || this.mesh.position.y <= getTerrainHeight(this.mesh.position.x, this.mesh.position.z)) {
                        scene.remove(this.mesh);
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
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
    });
    const crater = new THREE.Mesh(geo, mat);
    crater.position.set(pos.x, groundY + 0.18, pos.z);
    crater.renderOrder = 2;
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

    const fireTex = _getFxSpriteTex('fireball');
    const flashTex = _getFxSpriteTex('flash');
    const waveTex = _getFxSpriteTex('shockwave');

    // 1. Bright core flash + billowing fireball sprites
    const fireballs = [];
    const puffCount = isHeavy ? 5 : 3;
    for (let f = 0; f < puffCount; f++) {
        const useFlash = (f === 0 && flashTex);
        const mat = (fireTex || useFlash)
        ? new THREE.SpriteMaterial({
                map: useFlash ? flashTex : fireTex,
                color: f === 0 ? 0xffffff : color,
                transparent: true,
                opacity: 1.0,
                blending: THREE.AdditiveBlending,
                depthWrite: false
        })
        : new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1.0 });
        const fb = (fireTex || useFlash) ? new THREE.Sprite(mat) : new THREE.Mesh(_fxSphere8, mat);
        const s0 = (f === 0 ? 2.4 : 1.8 + Math.random() * 1.1) * scale;
        fb.scale.set(s0, s0, s0);
        fb.position.copy(pos).add(new THREE.Vector3(
                f === 0 ? 0 : (Math.random() - 0.5) * 1.6 * scale,
                (0.4 + Math.random() * 0.9) * scale,
                f === 0 ? 0 : (Math.random() - 0.5) * 1.6 * scale
        ));
        scene.add(fb);
        fireballs.push({
                mesh: fb,
                baseS: s0,
                vy: (0.04 + Math.random() * 0.06) * scale
        });
    }

    // 2. Outward ground shockwave ring
    const ringGeo = new THREE.RingGeometry(0.5, 1.4 * scale, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
            map: waveTex || null,
            color: waveTex ? color : 0xffd28a,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(pos.x, getTerrainHeight(pos.x, pos.z) + 0.08, pos.z);
    scene.add(ring);

    // 3. Shrapnel & incandescent sparks
    spawnSparks(pos, color, isHeavy ? 26 : 14);

    // 4. Heavy billows of black smoke
    for (let i = 0; i < (isHeavy ? 7 : 4); i++) {
        setTimeout(() => {
                const offset = new THREE.Vector3((Math.random() - 0.5) * 1.6 * scale, (0.4 + Math.random() * 0.9) * scale, (Math.random() - 0.5) * 1.6 * scale);
                spawnSmokePuff(pos.clone().add(offset), 0x262b33, (0.75 + Math.random() * 0.4) * scale);
            }, i * 55);
    }

    activeFX.push({
            fireballs: fireballs,
            ring: ring,
            life: isHeavy ? 24 : 18,
            maxLife: isHeavy ? 24 : 18,
            scale: scale,
            update() {
                this.life--;
                const progress = 1 - (this.life / this.maxLife);

                for (let i = 0; i < this.fireballs.length; i++) {
                    const fb = this.fireballs[i];
                    const curS = fb.baseS * (1 + progress * (i === 0 ? 1.8 : 2.5));
                    fb.mesh.scale.set(curS, curS, curS);
                    fb.mesh.position.y += fb.vy;
                    fb.mesh.material.opacity = Math.max(0, 1 - progress * 1.25);
                }

                const ringExpansion = 1 + progress * 4.8 * this.scale;
                this.ring.scale.set(ringExpansion, ringExpansion, 1);
                this.ring.material.opacity = Math.max(0, (1 - progress) * 0.85);

                if (this.life <= 0) {
                    for (let i = 0; i < this.fireballs.length; i++) {
                        const fb = this.fireballs[i];
                        scene.remove(fb.mesh);
                        fb.mesh.material.dispose();
                    }
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
                            if (unit.health > 0 && unit.mesh && !unit.isAir) {
                                if (unit.mesh.position.distanceTo(this.pos) <= this.radius) {
                                    if (typeof applyCalculatedDamage === 'function') {
                                        applyCalculatedDamage(null, unit, 5, 'FLAME');
                                    } else {
                                        unit.health -= 5;
                                    }
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

// Authentic GLA Salvage Scrap Crate (SalvageCrateCollide.cpp / PMJnkCrate.W3D)
function spawnScrapCrate(pos) {
    const group = new THREE.Group();
    const groundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(pos.x, pos.z) : (pos.y || 0);
    group.position.set(pos.x, groundY + 0.05, pos.z);

    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['salvage_crate']) {
        const w3dCrate = createW3DVehicleMesh('salvage_crate', false);
        group.add(w3dCrate);
    } else {
        const crateGeo = new THREE.BoxGeometry(1.3, 0.8, 1.3);
        const crateMat = new THREE.MeshStandardMaterial({
                color: 0x5c4033,
                roughness: 0.65,
                metalness: 0.75
        });
        const crate = new THREE.Mesh(crateGeo, crateMat);
        crate.position.y = 0.4;
        group.add(crate);
    }

    // Ground pulse aura
    const ringGeo = new THREE.RingGeometry(0.9, 1.4, 16);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
            color: 0x2ed573,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.55
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.08;
    group.add(ring);

    // RequiredScience = SCIENCE_GLA: Only visible to GLA player (still exists for GLA AI)
    const isPlayerGLA = (typeof selectedFaction !== 'undefined' && selectedFaction === 'gla');
    group.visible = isPlayerGLA;

    scene.add(group);

    const crateObj = {
        mesh: group,
        position: group.position,
        ringMat: ringMat,
        life: 2400, // ~40 seconds
        update() {
            this.life--;
            this.mesh.visible = (typeof selectedFaction !== 'undefined' && selectedFaction === 'gla');
            this.mesh.rotation.y += 0.015;
            const pulse = 0.35 + Math.sin(Date.now() * 0.005) * 0.25;
            this.ringMat.opacity = pulse;
            if (this.life <= 0) {
                scene.remove(this.mesh);
                this.mesh.traverse(c => {
                        if (c.geometry && !(c.geometry.userData && c.geometry.userData._shared)) c.geometry.dispose();
                        if (c.material && !(c.material.userData && c.material.userData._shared)) c.material.dispose();
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
    if (!attacker || !attacker.mesh) return new THREE.Vector3();

    // Ensure world matrix transforms are synchronously up to date
    if (typeof attacker.mesh.updateMatrixWorld === 'function') {
        attacker.mesh.updateMatrixWorld(true);
    }

    // Authentic Overlord dual 190mm cannons (exact world-scale offsets from turretSystem)
    if (attacker.type === 'overlord') {
        const turret = attacker.mesh.getObjectByName("turretSystem") || attacker.mesh;
        const wp = new THREE.Vector3();
        if (typeof turret.getWorldPosition === 'function') turret.getWorldPosition(wp);
        else wp.copy(attacker.mesh.position || new THREE.Vector3());
        const q = (typeof turret.getWorldQuaternion === 'function')
        ? turret.getWorldQuaternion(new THREE.Quaternion())
        : (attacker.mesh.quaternion ? attacker.mesh.quaternion.clone() : new THREE.Quaternion());
        const latOffset = (xOffset < 0) ? -2.62 : (xOffset > 0 ? 2.62 : 0);
        const forward = new THREE.Vector3(latOffset, 0.85, 11.62).applyQuaternion(q);
        return wp.add(forward);
    }

    // 1. Direct bone query for authentic W3D muzzle points (MUZZLE01 / MUZZLE02 / MUZZLEFX)
    if (attacker.mesh.userData && attacker.mesh.userData.isW3D) {
        let mBone = null;
        if (xOffset < 0) {
            mBone = attacker.mesh.getObjectByName("MUZZLE02") || attacker.mesh.getObjectByName("MUZZLE01") || attacker.mesh.getObjectByName("MUZZLE");
        } else {
            mBone = attacker.mesh.getObjectByName("MUZZLE01") || attacker.mesh.getObjectByName("MUZZLE02") || attacker.mesh.getObjectByName("MUZZLE");
        }
        if (mBone && typeof mBone.getWorldPosition === 'function') {
            const wp = new THREE.Vector3();
            mBone.getWorldPosition(wp);
            return wp;
        }
    }

    const turret = attacker.mesh.getObjectByName("turretSystem");
    if (turret) {
        const wp = new THREE.Vector3();
        if (typeof turret.getWorldPosition === 'function') turret.getWorldPosition(wp);
        else wp.copy(attacker.mesh.position);
        const q = (typeof turret.getWorldQuaternion === 'function')
        ? turret.getWorldQuaternion(new THREE.Quaternion())
        : (attacker.mesh.quaternion ? attacker.mesh.quaternion.clone() : new THREE.Quaternion());
        const forwardDist = (attacker.type === 'battlemaster' || attacker.type === 'crusader') ? 2.8 : 1.6;
        const forward = new THREE.Vector3(xOffset, 0.15, forwardDist).applyQuaternion(q);
        wp.add(forward);
        return wp;
    }
    const wp = attacker.mesh.position ? attacker.mesh.position.clone() : new THREE.Vector3();
    wp.y += attacker.isAir ? -0.25 : 0.8;
    if (xOffset !== 0) {
        const q = attacker.mesh.quaternion ? attacker.mesh.quaternion : new THREE.Quaternion();
        const side = new THREE.Vector3(xOffset, 0, 0).applyQuaternion(q);
        wp.add(side);
    }
    return wp;
}

// =========================================================================

// =========================================================================
// CINEMATIC ANIMATED SUPERWEAPONS (PARTICLE CANNON, NUKE SILO, SCUD STORM)
// =========================================================================

function setParticleBeamCursor(active) {
    if (typeof document === 'undefined' || !document.body) return;
    if (active) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="10" fill="none" stroke="%2300f2fe" stroke-width="2"/><circle cx="16" cy="16" r="3" fill="%23ffffff" stroke="%2300f2fe" stroke-width="1.5"/><line x1="16" y1="1" x2="16" y2="8" stroke="%2300f2fe" stroke-width="2"/><line x1="16" y1="24" x2="16" y2="31" stroke="%2300f2fe" stroke-width="2"/><line x1="1" y1="16" x2="8" y2="16" stroke="%2300f2fe" stroke-width="2"/><line x1="24" y1="16" x2="31" y2="16" stroke="%2300f2fe" stroke-width="2"/></svg>`;
        document.body.style.cursor = `url("data:image/svg+xml;utf8,${svg}") 16 16, crosshair`;
    } else if (!window.pendingSuperweapon && !window.activeBlueprintType) {
        document.body.style.cursor = 'default';
    }
}
window.setParticleBeamCursor = setParticleBeamCursor;

function spawnParticleFirePatch(pos) {
    if (typeof scene === 'undefined' || !pos) return;
    const patchGeo = new THREE.CircleGeometry(2.6, 12);
    patchGeo.rotateX(-Math.PI / 2);
    const patchMat = new THREE.MeshBasicMaterial({
            color: 0xff7b1a,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            polygonOffset: true,
            polygonOffsetFactor: -3,
            polygonOffsetUnits: -3
    });
    const patch = new THREE.Mesh(patchGeo, patchMat);
    const py = typeof getTerrainHeight === 'function' ? getTerrainHeight(pos.x, pos.z) : (pos.y || 0);
    patch.position.set(pos.x, py + 0.22, pos.z);
    patch.renderOrder = 3;
    scene.add(patch);

    let fireLife = 210; // ~3.5 seconds of residual fire
    activeFX.push({
            life: fireLife,
            update() {
                fireLife--;
                patchMat.opacity = 0.65 * Math.min(1, fireLife / 60) * (0.8 + Math.sin(fireLife * 0.4) * 0.2);
                if (fireLife % 12 === 0 && typeof spawnSmokePuff === 'function') {
                    spawnSmokePuff(patch.position, 0xff5500, 0.45);
                }
                if (fireLife % 20 === 0 && typeof applyCalculatedDamage === 'function') {
                    const allU = [...(typeof units !== 'undefined' ? units : []), ...(typeof enemyUnits !== 'undefined' ? enemyUnits : [])];
                    allU.forEach(u => {
                            if (u.health > 0 && u.mesh && !u.isAir && u.mesh.position.distanceTo(patch.position) <= 5.5) {
                                const cat = typeof getArmorCategory === 'function' ? getArmorCategory(u) : '';
                                if (cat === 'infantry' || cat === 'light_vehicle') {
                                    applyCalculatedDamage(null, u, 10, 'FLAME');
                                }
                            }
                    });
                }
                if (fireLife <= 0) {
                    scene.remove(patch);
                    patchGeo.dispose();
                    patchMat.dispose();
                    return false;
                }
                return true;
            }
    });
}

function animateParticleCannonStrike(targetPos, duration = 600, uplinkPos = null, isPlayerOwned = false) {
    if (typeof playSuperweaponEvaAlert === 'function') {
        playSuperweaponEvaAlert('particleCannon', 'launched', typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa');
    }
    playAudio('orbital_beam');
    if (typeof triggerScreenShake === 'function') triggerScreenShake(1.1);

    const group = new THREE.Group();
    group.position.copy(targetPos);
    window.activeParticleCannonTarget = targetPos.clone();
    window.activeParticleCannonPlayerOwned = !!isPlayerOwned;
    window.activeParticleCannonControl = !!isPlayerOwned;
    window.activeParticleCannonSpeed = 0.42;
    if (isPlayerOwned) setParticleBeamCursor(true);

    const addBlend = typeof THREE.AdditiveBlending !== 'undefined' ? { blending: THREE.AdditiveBlending } : {};

    // 1. Searing inner white-hot core + outer cyan orbital plasma column
    const coreGeo = new THREE.CylinderGeometry(0.45, 0.75, 110, 16);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.98, depthWrite: false, ...addBlend });
    const coreBeam = new THREE.Mesh(coreGeo, coreMat);
    coreBeam.position.y = 55;
    coreBeam.renderOrder = 6;
    group.add(coreBeam);

    const beamGeo = new THREE.CylinderGeometry(1.25, 2.35, 110, 20, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false, ...addBlend });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 55;
    beam.renderOrder = 5;
    group.add(beam);

    // Ground impact plasma flare disc + inner white-hot core pool
    const flareGeo = new THREE.CircleGeometry(4.8, 28);
    flareGeo.rotateX(-Math.PI / 2);
    const flareMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, ...addBlend });
    const flareDisc = new THREE.Mesh(flareGeo, flareMat);
    flareDisc.position.y = 0.35;
    flareDisc.renderOrder = 5;
    group.add(flareDisc);

    const impactCoreGeo = new THREE.CircleGeometry(2.1, 20);
    impactCoreGeo.rotateX(-Math.PI / 2);
    const impactCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, ...addBlend });
    const impactCore = new THREE.Mesh(impactCoreGeo, impactCoreMat);
    impactCore.position.y = 0.42;
    impactCore.renderOrder = 6;
    group.add(impactCore);

    // 2. Rotating orbital energy vortex rings
    const rings = [];
    for (let i = 0; i < 5; i++) {
        const rGeo = new THREE.RingGeometry(1.8 + i * 0.65, 2.35 + i * 0.65, 24);
        rGeo.rotateX(-Math.PI / 2);
        const rMat = new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xffffff : 0x00f2fe, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, ...addBlend });
        const r = new THREE.Mesh(rGeo, rMat);
        r.position.y = 1.2 + i * 14;
        r.renderOrder = 5;
        group.add(r);
        rings.push(r);
    }

    scene.add(group);

    // Optional Uplink Beam shooting straight up from the Particle Cannon structure into orbit
    let uplinkGroup = null;
    if (uplinkPos) {
        uplinkGroup = new THREE.Group();
        uplinkGroup.position.copy(uplinkPos);
        const upGeo = new THREE.CylinderGeometry(0.45, 0.45, 110, 12);
        const upMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.85 });
        const upMesh = new THREE.Mesh(upGeo, upMat);
        upMesh.position.y = 57;
        uplinkGroup.add(upMesh);
        scene.add(uplinkGroup);
    }

    let life = duration;
    const originCenter = targetPos.clone();

    activeFX.push({
            life: duration,
            update() {
                life--;
                // Low-Power shutoff: if owner's base enters Low Power while firing, shut off beam immediately
                if (isPlayerOwned && typeof window !== 'undefined' && window.isPlayerLowPower) {
                    window.activeParticleCannonTarget = null;
                    window.activeParticleCannonPlayerOwned = false;
                    window.activeParticleCannonControl = false;
                    setParticleBeamCursor(false);
                    scene.remove(group);
                    group.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
                    if (uplinkGroup) {
                        scene.remove(uplinkGroup);
                        uplinkGroup.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
                    }
                    if (typeof showNotification === 'function') {
                        showNotification('⚡ PARTICLE CANNON OFFLINE: Low Power — beam shut off!', 'error');
                    }
                    return false;
                }
                // Sit steadily on target when uncontrolled, or sweep in a straight line toward player's steered target
                if (window.activeParticleCannonTarget) {
                    const dx = window.activeParticleCannonTarget.x - originCenter.x;
                    const dz = window.activeParticleCannonTarget.z - originCenter.z;
                    const dist = Math.hypot(dx, dz);
                    if (dist > 0.45) {
                        const steerSpeed = window.activeParticleCannonSpeed || 0.42;
                        const step = Math.min(steerSpeed, dist);
                        originCenter.x += (dx / dist) * step;
                        originCenter.z += (dz / dist) * step;
                    }
                }
                group.position.x = originCenter.x;
                group.position.z = originCenter.z;
                group.position.y = typeof getTerrainHeight === 'function' ? getTerrainHeight(group.position.x, group.position.z) : 0;

                const pulse = 0.92 + Math.sin(life * 0.6) * 0.16;
                coreBeam.scale.set(pulse, 1, pulse);
                beam.scale.set(1.0 + Math.cos(life * 0.4) * 0.18, 1, 1.0 + Math.cos(life * 0.4) * 0.18);
                flareDisc.scale.setScalar(0.92 + Math.sin(life * 0.5) * 0.22);
                impactCore.scale.setScalar(0.85 + Math.cos(life * 0.7) * 0.2);

                rings.forEach((r, idx) => {
                        r.rotation.z += 0.16 * (idx % 2 === 0 ? 1 : -1);
                        r.scale.setScalar(1 + Math.sin(Date.now() * 0.02 + idx) * 0.22);
                });

                // Ground electrical sizzle, molten scorch, shockwave rings & sparks
                if (Math.random() < 0.9) {
                    spawnSparks(group.position, 0x00f2fe, 10);
                    if (Math.random() < 0.5) spawnSparks(group.position, 0xffffff, 5);
                    spawnSmokePuff(group.position, 0x222f3e, 0.75);
                }
                if (life % 16 === 0) {
                    const swGeo = new THREE.RingGeometry(1.2, 2.2, 24);
                    swGeo.rotateX(-Math.PI / 2);
                    const swMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, ...addBlend });
                    const sw = new THREE.Mesh(swGeo, swMat);
                    sw.position.set(group.position.x, group.position.y + 0.32, group.position.z);
                    sw.renderOrder = 5;
                    scene.add(sw);
                    let swLife = 22;
                    activeFX.push({
                            life: swLife,
                            update() {
                                swLife--;
                                const prog = 1 - swLife / 22;
                                sw.scale.setScalar(1 + prog * 3.8);
                                swMat.opacity = 0.9 * (1 - prog);
                                if (swLife <= 0) {
                                    scene.remove(sw);
                                    swGeo.dispose();
                                    swMat.dispose();
                                    return false;
                                }
                                return true;
                            }
                    });
                }
                if (life % 20 === 0 && typeof triggerScreenShake === 'function') {
                    triggerScreenShake(0.35);
                }

                // Continuous damage tick to all units & structures in beam path (supports AI superweapons & friendly fire)
                if (life % 10 === 0) {
                    const beamPos = group.position;
                    [...units, ...enemyUnits].forEach(u => {
                            if (u.health > 0 && u.mesh && u.mesh.position.distanceTo(beamPos) <= 9.5) {
                                if (typeof applyCalculatedDamage === 'function') {
                                    applyCalculatedDamage(null, u, 45, 'LASER');
                                } else {
                                    u.health -= 45;
                                }
                            }
                    });
                    [...structures, ...enemyStructures].forEach(struct => {
                            if (struct.health > 0 && struct.position && struct.position.distanceTo(beamPos) <= 12.5) {
                                if (typeof applyCalculatedDamage === 'function') {
                                    applyCalculatedDamage(null, struct, 65, 'LASER');
                                } else {
                                    struct.health -= 65;
                                }
                            }
                    });
                    if (Math.random() < 0.35) {
                        spawnCraterDecal(beamPos, 2.6, 360);
                    }
                }
                if (life % 14 === 0) {
                    spawnParticleFirePatch(group.position);
                }

                if (life <= 0) {
                    window.activeParticleCannonTarget = null;
                    window.activeParticleCannonPlayerOwned = false;
                    window.activeParticleCannonControl = false;
                    if (isPlayerOwned) setParticleBeamCursor(false);
                    scene.remove(group);
                    group.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
                    if (uplinkGroup) {
                        scene.remove(uplinkGroup);
                        uplinkGroup.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
                    }
                    spawnEnhancedExplosion(group.position, 0x00d2d3, 3.0, true);
                    spawnCraterDecal(group.position, 4.2, 480);
                    return false;
                }
                return true;
            }
    });
}

function animateNukeStrike(siloPos, targetPos) {
    if (typeof playSuperweaponEvaAlert === 'function') {
        playSuperweaponEvaAlert('nukeSilo', 'launched', typeof selectedFaction !== 'undefined' ? selectedFaction : 'china');
    }
    playAudio('superweapon_siren');

    // Target Warning Hazard Reticle on the Ground
    const warnGroup = new THREE.Group();
    const tGroundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(targetPos.x, targetPos.z) : 0;
    warnGroup.position.set(targetPos.x, tGroundY + 0.2, targetPos.z);
    const warnRing = new THREE.Mesh(
        new THREE.RingGeometry(2.5, 3.2, 32),
        new THREE.MeshBasicMaterial({ color: 0xff2222, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    warnRing.rotation.x = -Math.PI / 2;
    warnGroup.add(warnRing);
    scene.add(warnGroup);

    // 1. Ascending Chinese ICBM from Silo with booster fins & exhaust flame
    const missileGroup = new THREE.Group();
    const origin = (siloPos ? siloPos.clone() : targetPos.clone());
    missileGroup.position.copy(origin);
    const mGeo = new THREE.CylinderGeometry(0.45, 0.52, 4.8, 12);
    const mMat = new THREE.MeshStandardMaterial({ color: 0xecf0f1, metalness: 0.8, roughness: 0.2 });
    const missileBody = new THREE.Mesh(mGeo, mMat);
    missileGroup.add(missileBody);

    const stripeGeo = new THREE.CylinderGeometry(0.47, 0.49, 1.1, 12);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xc0392b });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.y = 0.8;
    missileGroup.add(stripe);

    const noseGeo = new THREE.ConeGeometry(0.45, 1.5, 12);
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.3 });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.y = 3.15;
    missileGroup.add(nose);

    const plumeGeo = new THREE.ConeGeometry(0.55, 2.6, 10);
    plumeGeo.rotateX(Math.PI);
    const plumeMat = new THREE.MeshBasicMaterial({ color: 0xffa502, transparent: true, opacity: 0.95 });
    const plume = new THREE.Mesh(plumeGeo, plumeMat);
    plume.position.y = -3.4;
    missileGroup.add(plume);

    scene.add(missileGroup);
    if (siloPos) {
        for (let s = 0; s < 6; s++) {
            spawnSmokePuff(siloPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 1.2, (Math.random() - 0.5) * 4)), 0xdcdde1, 1.2);
        }
    }

    let phase = 'ascent';
    let frame = 0;

    activeFX.push({
            life: 220,
            update() {
                frame++;
                warnRing.scale.setScalar(1.0 + Math.sin(frame * 0.35) * 0.25);
                plume.scale.set(0.85 + Math.random() * 0.35, 0.85 + Math.random() * 0.45, 0.85 + Math.random() * 0.35);

                if (phase === 'ascent') {
                    missileGroup.position.y += 1.9;
                    spawnSmokePuff(missileGroup.position.clone().add(new THREE.Vector3(0, -2.5, 0)), 0xff793f, 0.95);
                    if (missileGroup.position.y > 95) {
                        phase = 'descent';
                        missileGroup.position.set(targetPos.x, 105, targetPos.z);
                        missileGroup.rotation.x = Math.PI; // point straight down
                    }
                } else if (phase === 'descent') {
                    missileGroup.position.y -= 3.4;
                    spawnSmokePuff(missileGroup.position.clone().add(new THREE.Vector3(0, 2.5, 0)), 0xff5252, 1.0);
                    const groundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(targetPos.x, targetPos.z) : 0;
                    if (missileGroup.position.y <= groundY + 1.2) {
                        scene.remove(missileGroup);
                        missileGroup.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
                        scene.remove(warnGroup);
                        warnGroup.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });

                        // Thermonuclear Detonation!
                        playAudio('nuke_detonation');
                        if (typeof triggerScreenShake === 'function') triggerScreenShake(2.4);
                        spawnMushroomCloud(targetPos);
                        // Lingering Nuclear Radiation Pool
                        const radGroundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(targetPos.x, targetPos.z) : 0;
                        const radPool = new THREE.Mesh(
                            new THREE.CircleGeometry(14, 24),
                            new THREE.MeshBasicMaterial({ color: 0x39ff14, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false })
                        );
                        radPool.rotation.x = -Math.PI / 2;
                        radPool.position.set(targetPos.x, radGroundY + 0.16, targetPos.z);
                        scene.add(radPool);
                        let radTicks = 0;
                        activeFX.push({
                                life: 480,
                                update() {
                                    radTicks++;
                                    radPool.material.opacity = 0.25 + 0.12 * Math.sin(radTicks * 0.15);
                                    if (radTicks % 30 === 0 && typeof enemyUnits !== 'undefined') {
                                        enemyUnits.forEach(eu => {
                                                if (eu.health > 0 && eu.mesh && eu.mesh.position.distanceTo(targetPos) <= 14.5) {
                                                    eu.health -= 18;
                                                }
                                        });
                                    }
                                    if (radTicks >= 479) {
                                        scene.remove(radPool);
                                        radPool.geometry.dispose();
                                        radPool.material.dispose();
                                        return false;
                                    }
                                    return true;
                                }
                        });

                        // Apocalyptic damage: 850 to enemies within 28 units
                        enemyUnits.forEach(enemy => {
                                if (enemy.health > 0 && enemy.mesh && enemy.mesh.position.distanceTo(targetPos) <= 26.0) {
                                    if (typeof applyCalculatedDamage === 'function') {
                                        applyCalculatedDamage(null, enemy, 850, 'EXPLOSIVE');
                                    } else {
                                        enemy.health -= 850;
                                    }
                                }
                        });
                        enemyStructures.forEach(struct => {
                                if (struct.health > 0 && struct.position && struct.position.distanceTo(targetPos) <= 28.0) {
                                    if (typeof applyCalculatedDamage === 'function') {
                                        applyCalculatedDamage(null, struct, 850, 'EXPLOSIVE');
                                    } else {
                                        struct.health -= 850;
                                    }
                                }
                        });
                        return false;
                    }
                }
                return true;
            }
    });
}

function spawnMushroomCloud(pos, scaleMult = 1.0) {
    const groundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(pos.x, pos.z) : 0;

    // 0. Blinding initial white-gold thermal flash dome
    const flashGeo = new THREE.SphereGeometry(5.5 * scaleMult, 20, 20);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0 });
    const flashDome = new THREE.Mesh(flashGeo, flashMat);
    flashDome.position.set(pos.x, groundY + 1.5, pos.z);
    scene.add(flashDome);

    // 1. Colossal expanding mushroom cap + rolling torus rim
    const capGeo = new THREE.SphereGeometry(3.8 * scaleMult, 20, 20);
    const capMat = new THREE.MeshBasicMaterial({ color: 0xff6b35, transparent: true, opacity: 0.96 });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(pos.x, groundY + 4 * scaleMult, pos.z);
    scene.add(cap);

    const torusGeo = new THREE.TorusGeometry(3.2 * scaleMult, 1.35 * scaleMult, 12, 24);
    torusGeo.rotateX(Math.PI / 2);
    const torusMat = new THREE.MeshBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 0.9 });
    const torusRing = new THREE.Mesh(torusGeo, torusMat);
    torusRing.position.set(pos.x, groundY + 3.5 * scaleMult, pos.z);
    scene.add(torusRing);

    // 2. Vertical rising fireball & dust stem
    const stemGeo = new THREE.CylinderGeometry(1.4 * scaleMult, 2.6 * scaleMult, 14 * scaleMult, 14);
    const stemMat = new THREE.MeshBasicMaterial({ color: 0xd35400, transparent: true, opacity: 0.88 });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(pos.x, groundY + 7 * scaleMult, pos.z);
    scene.add(stem);

    // 3. Dual supersonic shockwave rings (ground & atmospheric Mach condensation ring)
    const ringGeo = new THREE.RingGeometry(1.8 * scaleMult, 4.8 * scaleMult, 36);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffa502, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
    const shockwave = new THREE.Mesh(ringGeo, ringMat);
    shockwave.position.set(pos.x, groundY + 0.25, pos.z);
    scene.add(shockwave);

    const machGeo = new THREE.RingGeometry(2.2 * scaleMult, 3.0 * scaleMult, 32);
    machGeo.rotateX(-Math.PI / 2);
    const machMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const machRing = new THREE.Mesh(machGeo, machMat);
    machRing.position.set(pos.x, groundY + 9 * scaleMult, pos.z);
    scene.add(machRing);

    // 4. Crater and lingering radioactive fallout field
    spawnCraterDecal(pos, 8.0 * scaleMult, 900);
    spawnLingeringToxinCloud(pos);

    const maxLife = Math.round(95 * Math.max(0.6, scaleMult));
    let life = maxLife;
    activeFX.push({
            life: maxLife,
            update() {
                life--;
                const progress = 1 - (life / maxLife);

                // Thermal flash rapidly expands and fades in first 25% of lifetime
                if (progress < 0.28) {
                    const fp = progress / 0.28;
                    flashDome.scale.setScalar(1 + fp * 3.5);
                    flashDome.material.opacity = Math.max(0, 1.0 - fp);
                } else {
                    flashDome.visible = false;
                }

                // Cap & Torus expand and billow upward
                const riseY = groundY + (4 + progress * 20) * scaleMult;
                cap.position.y = riseY;
                cap.scale.set(1 + progress * 3.8, 1 + progress * 2.4, 1 + progress * 3.8);
                cap.material.opacity = Math.max(0, 0.96 - progress * 0.88);
                if (progress > 0.45) cap.material.color.setHex(0x57606f);

                torusRing.position.y = riseY - 1.2 * scaleMult;
                torusRing.scale.set(1 + progress * 3.6, 1 + progress * 3.6, 1 + progress * 2.2);
                torusRing.material.opacity = Math.max(0, 0.9 - progress * 0.85);

                // Stem stretches
                stem.position.y = groundY + ((4 + progress * 20) * scaleMult) / 2;
                stem.scale.set(1 + progress * 1.6, 1 + progress * 2.2, 1 + progress * 1.6);
                stem.material.opacity = Math.max(0, 0.88 - progress * 0.82);

                // Shockwave expands to 28+ units
                const rScale = 1 + progress * 7.2;
                shockwave.scale.set(rScale, rScale, 1);
                shockwave.material.opacity = Math.max(0, 0.95 - progress * 1.0);

                const mScale = 1 + progress * 5.0;
                machRing.position.y = groundY + (8 + progress * 10) * scaleMult;
                machRing.scale.set(mScale, mScale, 1);
                machRing.material.opacity = Math.max(0, 0.85 - progress * 1.05);

                if (life <= 0) {
                    [flashDome, cap, torusRing, stem, shockwave, machRing].forEach(m => {
                            scene.remove(m);
                            if (m.geometry) m.geometry.dispose();
                            if (m.material) m.material.dispose();
                    });
                    return false;
                }
                return true;
            }
    });
}

function animateScudStormStrike(stormPos, targetPos) {
    if (typeof playSuperweaponEvaAlert === 'function') {
        playSuperweaponEvaAlert('scudStorm', 'launched', typeof selectedFaction !== 'undefined' ? selectedFaction : 'gla');
    }
    playAudio('superweapon_siren');
    playAudio('scud_storm_volley');

    // 9-missile ballistic ripple salvo from the 9 launcher tubes
    for (let i = 0; i < 9; i++) {
        setTimeout(() => {
                const angle = (i / 9) * Math.PI * 2;
                const dist = (i === 0) ? 0 : (6.5 + (i % 2) * 5.5);
                const offset = new THREE.Vector3(
                    Math.cos(angle) * dist + (Math.random() - 0.5) * 3.0,
                    0,
                    Math.sin(angle) * dist + (Math.random() - 0.5) * 3.0
                );
                const subTarget = targetPos.clone().add(offset);
                const tubeOffset = new THREE.Vector3(((i % 3) - 1) * 1.4, 2.4, (Math.floor(i / 3) - 1) * 1.4);
                const launchOrigin = (stormPos ? stormPos.clone() : targetPos.clone().add(new THREE.Vector3(-45, 0, -45))).add(tubeOffset);

                if (typeof spawnMuzzleFlash === 'function') spawnMuzzleFlash(launchOrigin, 0xffa502, 1.2);
                if (typeof spawnSmokePuff === 'function') spawnSmokePuff(launchOrigin, 0xdcdde1, 1.1);
                spawnRocketProjectile(launchOrigin, subTarget, true, true);

                setTimeout(() => {
                        playAudio('scud_detonation');
                        if (typeof triggerScreenShake === 'function') triggerScreenShake(0.95);
                        if (typeof spawnEnhancedExplosion === 'function') spawnEnhancedExplosion(subTarget, 0x2ecc71, 3.2, true);
                        enemyUnits.forEach(enemy => {
                                if (enemy.health > 0 && enemy.mesh && enemy.mesh.position.distanceTo(subTarget) <= 11.5) {
                                    if (typeof applyCalculatedDamage === 'function') {
                                        applyCalculatedDamage(null, enemy, 165, 'EXPLOSIVE');
                                    } else {
                                        enemy.health -= 165;
                                    }
                                }
                        });
                        enemyStructures.forEach(struct => {
                                if (struct.health > 0 && struct.position && struct.position.distanceTo(subTarget) <= 13.5) {
                                    if (typeof applyCalculatedDamage === 'function') {
                                        applyCalculatedDamage(null, struct, 195, 'EXPLOSIVE');
                                    } else {
                                        struct.health -= 195;
                                    }
                                }
                        });
                        spawnLingeringToxinCloud(subTarget);
                        spawnCraterDecal(subTarget, 3.6, 520);
                    }, 1350);
            }, i * 155);
    }
}

// Expanding Propaganda Aura Soundwave Ring (for Overlord Speaker Tower & Standalone Speaker Tower)
function spawnPropagandaPulseRing(pos, isSubliminal = false) {
    if (!pos || typeof scene === 'undefined' || !scene) return;
    const groundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(pos.x, pos.z) : pos.y;
    const ringColor = isSubliminal ? 0xff4757 : 0xf1c40f;
    const ringGeo = new THREE.RingGeometry(0.8, 1.25, 28);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
            color: ringColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.75
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(pos.x, groundY + 0.35, pos.z);
    scene.add(ringMesh);

    let life = 36;
    activeFX.push({
            life: 36,
            update() {
                life--;
                const t = 1 - (life / 36);
                const s = 1 + t * 14.0;
                ringMesh.scale.set(s, s, 1);
                ringMat.opacity = Math.max(0, 0.75 * (1 - t));
                if (life <= 0) {
                    scene.remove(ringMesh);
                    ringGeo.dispose();
                    ringMat.dispose();
                    return false;
                }
                return true;
            }
    });
}
window.spawnPropagandaPulseRing = spawnPropagandaPulseRing;

// Neutron Shell Radiation Pulse (Wipes out infantry & vehicle crews without destroying tank hulls)
function spawnNeutronBlast(pos) {
    if (!pos || typeof scene === 'undefined' || !scene) return;
    const groundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(pos.x, pos.z) : pos.y;
    const sphereGeo = new THREE.SphereGeometry(2.2, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.92 });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.set(pos.x, groundY + 1.5, pos.z);
    scene.add(sphere);

    const ringGeo = new THREE.RingGeometry(1.0, 2.2, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xa29bfe, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(pos.x, groundY + 0.3, pos.z);
    scene.add(ring);

    let life = 35;
    activeFX.push({
            life: 35,
            update() {
                life--;
                const t = 1 - (life / 35);
                sphere.scale.setScalar(1 + t * 4.5);
                sphereMat.opacity = Math.max(0, 0.92 * (1 - t));
                ring.scale.set(1 + t * 6.5, 1 + t * 6.5, 1);
                ringMat.opacity = Math.max(0, 0.95 * (1 - t));
                if (life <= 0) {
                    scene.remove(sphere); sphereGeo.dispose(); sphereMat.dispose();
                    scene.remove(ring); ringGeo.dispose(); ringMat.dispose();
                    return false;
                }
                return true;
            }
    });
}
window.spawnNeutronBlast = spawnNeutronBlast;

// =========================================================================
// USA VEHICLE DRONE ATTACHMENTS (BATTLE, SCOUT, HELLFIRE)
// =========================================================================

function createDroneMesh(droneType) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA) {
        let modelKey = 'drone_battle';
        if (droneType === 'scout') modelKey = 'drone_scout';
        else if (droneType === 'hellfire') modelKey = 'drone_hellfire';

        if (window.W3D_VEHICLE_DATA[modelKey]) {
            const droneMesh = createW3DVehicleMesh(modelKey, false);
            droneMesh.userData.droneType = droneType;
            return droneMesh;
        }
    }

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
    if (!vehicle || !vehicle.mesh) return;
    if (!vehicle._baseScanRange) {
        vehicle._baseScanRange = vehicle.scanRange || 25;
    }
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
        cooldown: 0,
        pdlCooldown: 0,
        repairCooldown: 0
    };

    // Scout drone boosts vision (+50% sight/scan range & stealth detection)
    if (droneType === 'scout') {
        vehicle.scanRange = Math.round(vehicle._baseScanRange * 1.5);
        vehicle.detectsStealth = true;
    } else {
        vehicle.scanRange = vehicle._baseScanRange;
        vehicle.detectsStealth = false;
    }

    if (typeof playOfficialSound === 'function') playOfficialSound('sfx_drone_create', 0.90);
    else playAudio('radio_chirp');
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

    // Hide the default command cupola and flag mast if present so they do not overlap
    const cupola = tank.mesh.getObjectByName("commandCupola");
    if (cupola) cupola.visible = false;
    const mast = tank.mesh.getObjectByName("flagMast");
    if (mast) mast.visible = false;
    const flag = tank.mesh.getObjectByName("plaFlag") || tank.mesh.getObjectByName("FLAG");
    if (flag) flag.visible = (upgradeType !== 'bunker');
    const searchlight = tank.mesh.getObjectByName("cupolaSearchlight");
    if (searchlight) searchlight.visible = false;
    const dish = tank.mesh.getObjectByName("radardish01") || tank.mesh.getObjectByName("RADARDISH01") || tank.mesh.getObjectByName("radarDish");
    if (dish) dish.visible = true;

    tank.overlordUpgrade = upgradeType;

    // Authentic Westwood 3D Overlord Upgrades (ChinaVehicle.ini / FactionUnit.ini):
    // Overlord upgrades attach to bone FIREPOINT01 located on the flat rear deck of the turret (Z = -15, Y = 4.81).
    // - ChinaTankOverlordBattleBunker -> NVOvrlrd_B.W3D on FIREPOINT01
    // - ChinaTankOverlordGattlingCannon -> NVOvrlrd_G.W3D on FIREPOINT01
    // - ChinaTankOverlordPropagandaTower -> NVOvrlrd_S.W3D on FIREPOINT01
    const upgKey = (upgradeType === 'bunker') ? 'overlord_bunker' :
    (upgradeType === 'gatling') ? 'overlord_gatling' :
    (upgradeType === 'speaker' || upgradeType === 'propaganda') ? 'overlord_speaker' : null;

    const firepoint = tank.mesh.getObjectByName('FIREPOINT01');
    const mountBone = firepoint || turretSys;

    if (upgKey && typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA[upgKey]) {
        const upgMesh = createW3DVehicleMesh(upgKey, !!tank.isEnemy);
        upgMesh.name = "overlordUpgrade";
        upgMesh.scale.set(1, 1, 1);
        // When attached to FIREPOINT01 (already located at Z = -15, Y = 4.81 on the turret rear deck), position is (0, 0, 0).
        // If attached directly to turretSystem fallback, position is (0, 4.81, -15.0).
        if (mountBone === firepoint) {
            upgMesh.position.set(0, 0, 0);
        } else {
            upgMesh.position.set(0, 4.81, -15.0);
        }
        upgMesh.rotation.set(0, 0, 0);

        if (upgradeType === 'gatling') {
            // Tag Gatling barrels so combat loop rotates them
            const b1 = upgMesh.getObjectByName('BARREL01');
            const b2 = upgMesh.getObjectByName('BARREL02');
            if (b1) b1.name = 'gatlingBarrels';
            if (b2) b2.name = 'gatlingBarrels2';
        }

        mountBone.add(upgMesh);
        tank.overlordUpgradeMesh = upgMesh;
        return;
    }

    const group = new THREE.Group();
    group.name = "overlordUpgrade";
    // Mount directly onto the rear flat deck!
    group.position.set(0, 0.45, -1.8);

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
    if (upgradeType === 'bunker') {
        tank.capacity = 5;
        if (!tank.garrisoned) tank.garrisoned = [];
    } else if (upgradeType === 'gatling') {
        tank.detectsStealth = true;
    }

    if (typeof playOfficialSound === 'function') {
        playOfficialSound('sfx_overlord_upgrade', 0.90);
        const voiceKey = upgradeType === 'bunker' ? 'voice_overlord_bunker' : upgradeType === 'gatling' ? 'voice_overlord_gatling' : 'voice_overlord_speaker';
        // These short voice keys do not encode a faction, so pass it
        // explicitly or the loader may look in the player's catalog.
        playOfficialSound(voiceKey, 0.92, 'china');
    } else {
        playAudio('construction', {}, 'china');
    }
    showNotification(`OVERLORD upgraded with ${upgradeType.toUpperCase()}!`, 'success');
}

// =========================================================================
// CHINA NUKE CANNON OUTRIGGER SIEGE DEPLOYMENT & RETRACTION
// =========================================================================

function deployNukeCannonOutriggers(cannon) {
    if (!cannon || !cannon.mesh || cannon.isDeployed) return;
    cannon.isDeployed = true;
    cannon.deployTimestamp = Date.now();
    if (cannon.targetPosition) cannon.targetPosition.copy(cannon.mesh.position);
    playAudio('nukecannon_deploy', {}, 'china');

    const chassis = cannon.mesh;
    let legGroup = chassis.getObjectByName("outriggerLegs");
    if (legGroup) chassis.remove(legGroup);

    legGroup = new THREE.Group();
    legGroup.name = "outriggerLegs";
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2d3436, metalness: 0.85, roughness: 0.3 });
    const padMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, metalness: 0.6, roughness: 0.4 });
    [-1.45, 1.45].forEach(x => {
            [-1.65, 1.65].forEach(z => {
                    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.16, 0.22), legMat);
                    strut.position.set(x * 0.78, 0.45, z);
                    legGroup.add(strut);

                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.85, 8), legMat);
                    leg.position.set(x, 0.35, z);
                    legGroup.add(leg);

                    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.12, 8), padMat);
                    pad.position.set(x, 0.06, z);
                    legGroup.add(pad);
            });
    });
    chassis.add(legGroup);

    const turret = chassis.getObjectByName("turretSystem");
    if (turret) turret.rotation.x = -0.32; // Elevate siege barrel
}

function undeployNukeCannonOutriggers(cannon) {
    if (!cannon || !cannon.mesh || !cannon.isDeployed) return;
    cannon.isDeployed = false;
    playAudio('nukecannon_undeploy', {}, 'china');

    const chassis = cannon.mesh;
    const legGroup = chassis.getObjectByName("outriggerLegs");
    if (legGroup) {
        chassis.remove(legGroup);
        legGroup.traverse(c => {
                if (c.geometry) c.geometry.dispose();
                if (c.material) c.material.dispose();
        });
    }
    const turret = chassis.getObjectByName("turretSystem");
    if (turret) turret.rotation.x = 0;
}
window.deployNukeCannonOutriggers = deployNukeCannonOutriggers;
window.undeployNukeCannonOutriggers = undeployNukeCannonOutriggers;

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

// =========================================================================
// USA SUPPLY DROP ZONE: C-130 HERCULES CRATE DELIVERY ($1,500 / $1,650)
// =========================================================================
function createC130FlyoverPlane() {
    let plane = null;
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['c130']) {
        plane = createW3DVehicleMesh('c130', false);
    } else {
        plane = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6c7a89, roughness: 0.55, metalness: 0.35 });
        const wingMat = new THREE.MeshStandardMaterial({ color: 0x56616e, roughness: 0.6, metalness: 0.3 });
        const fuselage = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.5, 9.0), bodyMat);
        const wings = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.25, 2.2), wingMat);
        wings.position.set(0, 0.35, 0.5);
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.4, 1.6), wingMat);
        tail.position.set(0, 1.4, -3.8);
        const hStab = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.2, 1.2), wingMat);
        hStab.position.set(0, 0.7, -3.9);
        plane.add(fuselage, wings, tail, hStab);
        plane.scale.set(1.6, 1.6, 1.6);
    }
    const c130Props = [];
    plane.traverse(c => {
            if (c.name && c.name.toUpperCase().startsWith('PROPELLER')) c130Props.push(c);
    });
    return { plane, c130Props };
}

function triggerSupplyDropZoneDelivery(structure) {
    if (!structure || !structure.position || structure.health <= 0 || structure.isBuilding) return;
    const dropCenter = structure.position.clone();
    const groundY = (typeof getTerrainHeight === 'function') ? getTerrainHeight(dropCenter.x, dropCenter.z) : 0;

    // 1. Official W3D C-130 Hercules Flyover Mesh (AvCargoPln.W3D)
    const { plane, c130Props } = createC130FlyoverPlane();

    const flightY = groundY + 15;
    const startPos = new THREE.Vector3(dropCenter.x - 130, flightY, dropCenter.z - 60);
    const endPos = new THREE.Vector3(dropCenter.x + 130, flightY, dropCenter.z + 60);
    plane.position.copy(startPos);
    if (typeof plane.lookAt === 'function') plane.lookAt(endPos);
    scene.add(plane);

    if (typeof window !== 'undefined') {
        if (!window.activeSupplyPlanes) window.activeSupplyPlanes = [];
    }
    const dirLen = Math.hypot(endPos.x - startPos.x, endPos.z - startPos.z) || 1;
    const planeTracker = { mesh: plane, dirX: (endPos.x - startPos.x) / dirLen, dirZ: (endPos.z - startPos.z) / dirLen };
    if (typeof window !== 'undefined') window.activeSupplyPlanes.push(planeTracker);

    if (typeof playAudio === 'function') playAudio('radio_chirp', {}, 'usa');
    if (typeof showNotification === 'function') showNotification('✈ C-130 Supply Drop inbound!', 'info');

    let planeTick = 0;
    const planeDuration = 360;
    let crateDropped = false;

    // 2. Parachute Supply Crate
    function spawnParachuteCrate() {
        const offX = (Math.random() - 0.5) * 5.0;
        const offZ = (Math.random() - 0.5) * 5.0;
        const landX = dropCenter.x + offX;
        const landZ = dropCenter.z + offZ;
        const landY = (typeof getTerrainHeight === 'function') ? getTerrainHeight(landX, landZ) : groundY;

        const crateGrp = new THREE.Group();
        const boxMat = new THREE.MeshStandardMaterial({ color: 0x4b5d3b, roughness: 0.7 });
        const strapMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.4 });
        const chuteMat = new THREE.MeshBasicMaterial({ color: 0xecf0f1, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });

        const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.5), boxMat);
        const strap = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.22, 1.58), strapMat);
        const chute = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.8, 8, 1, true), chuteMat);
        chute.position.y = 3.2;
        crateGrp.add(box, strap, chute);

        crateGrp.position.set(landX, groundY + 24, landZ);
        scene.add(crateGrp);

        let landed = false;
        let groundTicks = 0;
        let lifeTicks = 0;

        activeFX.push({
                update() {
                    lifeTicks++;
                    if (!landed) {
                        crateGrp.position.y -= 0.22;
                        crateGrp.rotation.y += 0.02;
                        if (crateGrp.position.y <= landY + 0.55) {
                            crateGrp.position.y = landY + 0.55;
                            landed = true;
                            chute.visible = false;
                        }
                        return true;
                    }

                    groundTicks++;
                    // Check if an enemy unit intercepts/steals/destroys the crate
                    if (typeof enemyUnits !== 'undefined') {
                        const interceptor = enemyUnits.find(e => e.health > 0 && e.mesh && Math.hypot(e.mesh.position.x - landX, e.mesh.position.z - landZ) < 4.5);
                        if (interceptor) {
                            if (typeof spawnMuzzleFlash === 'function') spawnMuzzleFlash(crateGrp.position, 0xff4757, 2.2);
                            if (typeof showNotification === 'function') showNotification('⚠ Enemy forces intercepted a Supply Drop Zone crate!', 'warning');
                            scene.remove(crateGrp);
                            box.geometry.dispose(); strap.geometry.dispose(); chute.geometry.dispose();
                            boxMat.dispose(); strapMat.dispose(); chuteMat.dispose();
                            return false;
                        }
                    }

                    // Collect immediately if a friendly unit touches it, or after ~4s (240 ticks) uncontested on the drop pad
                    const friendlyTouch = (typeof units !== 'undefined') && units.some(u => u.health > 0 && u.mesh && Math.hypot(u.mesh.position.x - landX, u.mesh.position.z - landZ) < 4.5);
                    if (friendlyTouch || groundTicks >= 240) {
                        const hasSupplyLines = (typeof researchedTechs !== 'undefined' && researchedTechs.has('supplyLines'));
                        const bonus = hasSupplyLines ? 1650 : 1500;
                        if (typeof playerResources !== 'undefined') {
                            playerResources += bonus;
                            const resEl = (typeof document !== 'undefined') ? document.getElementById('resource-display') : null;
                            if (resEl) resEl.innerText = `$${playerResources}`;
                        }
                        if (typeof spawnMuzzleFlash === 'function') spawnMuzzleFlash(crateGrp.position, 0x2ecc71, 2.0);
                        if (typeof spawnFloatingCashNumber === 'function') spawnFloatingCashNumber(crateGrp.position.clone().add(new THREE.Vector3(0, 1.5, 0)), bonus);
                        if (typeof showNotification === 'function') showNotification(`📦 C-130 Supply Drop collected: +$${bonus}!`, 'success');
                        scene.remove(crateGrp);
                        box.geometry.dispose(); strap.geometry.dispose(); chute.geometry.dispose();
                        boxMat.dispose(); strapMat.dispose(); chuteMat.dispose();
                        return false;
                    }
                    return lifeTicks < 1200;
                }
        });
    }

    activeFX.push({
            update() {
                planeTick++;
                const t = planeTick / planeDuration;
                plane.position.lerpVectors(startPos, endPos, t);
                for (let p = 0; p < c130Props.length; p++) c130Props[p].rotation.z += 0.65;
                if (!crateDropped && t >= 0.5) {
                    crateDropped = true;
                    spawnParachuteCrate();
                }
                if (planeTick >= planeDuration) {
                    if (typeof window !== 'undefined' && Array.isArray(window.activeSupplyPlanes)) {
                        const idx = window.activeSupplyPlanes.indexOf(planeTracker);
                        if (idx !== -1) window.activeSupplyPlanes.splice(idx, 1);
                    }
                    scene.remove(plane);
                    if (!(plane.userData && plane.userData.isW3D)) {
                        const mats = new Set();
                        plane.traverse(c => {
                                if (c.geometry && typeof c.geometry.dispose === 'function') c.geometry.dispose();
                                if (c.material) {
                                    if (Array.isArray(c.material)) c.material.forEach(m => mats.add(m));
                                    else mats.add(c.material);
                                }
                        });
                        mats.forEach(m => { if (m && typeof m.dispose === 'function') m.dispose(); });
                    }
                    return false;
                }
                return true;
            }
    });
}
window.triggerSupplyDropZoneDelivery = triggerSupplyDropZoneDelivery;

function triggerC130Paradrop(targetPos) {
    if (!targetPos || !scene) return;
    const dropCenter = targetPos.clone();
    const groundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(dropCenter.x, dropCenter.z) : 0;

    const { plane, c130Props } = createC130FlyoverPlane();
    const flightY = groundY + 15;
    const startPos = new THREE.Vector3(dropCenter.x - 130, flightY, dropCenter.z - 60);
    const endPos = new THREE.Vector3(dropCenter.x + 130, flightY, dropCenter.z + 60);
    plane.position.copy(startPos);
    if (typeof plane.lookAt === 'function') plane.lookAt(endPos);
    scene.add(plane);

    const dirLen = Math.hypot(endPos.x - startPos.x, endPos.z - startPos.z) || 1;
    const planeTracker = {
        mesh: plane,
        dirX: (endPos.x - startPos.x) / dirLen,
        dirZ: (endPos.z - startPos.z) / dirLen
    };
    if (typeof window !== 'undefined') {
        if (!window.activeSupplyPlanes) window.activeSupplyPlanes = [];
        window.activeSupplyPlanes.push(planeTracker);
    }

    let frame = 0;
    const totalFrames = 320;
    let dropped = false;
    const step = () => {
        frame++;
        const t = frame / totalFrames;
        plane.position.lerpVectors(startPos, endPos, t);
        c130Props.forEach(p => { p.rotation.z += 0.9; });

        if (!dropped && t >= 0.5) {
            dropped = true;
            for (let i = 0; i < 4; i++) {
                const rPos = dropCenter.clone().add(new THREE.Vector3((Math.random() - 0.5) * 7, 0, (Math.random() - 0.5) * 7));
                const rGround = typeof getTerrainHeight === 'function' ? getTerrainHeight(rPos.x, rPos.z) : groundY;
                const chuteMat = new THREE.MeshBasicMaterial({ color: 0xe8e2cf, side: THREE.DoubleSide });
                const chute = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), chuteMat);
                chute.position.set(rPos.x, flightY - 2, rPos.z);
                scene.add(chute);
                let dropTick = 0;
                const dropStep = () => {
                    dropTick++;
                    const dt = Math.min(1, dropTick / 55);
                    chute.position.y = (flightY - 2) * (1 - dt) + (rGround + 0.8) * dt;
                    if (dt < 1) {
                        requestAnimationFrame(dropStep);
                    } else {
                        scene.remove(chute);
                        chute.geometry.dispose();
                        chuteMat.dispose();
                        if (typeof spawnUnit === 'function') spawnUnit('infantry', rPos);
                    }
                };
                requestAnimationFrame(dropStep);
            }
            if (typeof spawnSmokePuff === 'function') spawnSmokePuff(dropCenter, 0xdddddd);
        }

        if (frame < totalFrames) {
            requestAnimationFrame(step);
        } else {
            planeTracker.alive = false;
            if (typeof window !== 'undefined' && Array.isArray(window.activeSupplyPlanes)) {
                const idx = window.activeSupplyPlanes.indexOf(planeTracker);
                if (idx !== -1) window.activeSupplyPlanes.splice(idx, 1);
            }
            scene.remove(plane);
        }
    };
    requestAnimationFrame(step);
}
window.triggerC130Paradrop = triggerC130Paradrop;
