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
// TERRAIN DUST, CONTRAIL, DEBRIS, IMPACT, EMP & PROMOTION HELPERS
// =========================================================================
const _fxDebrisGeo = new THREE.BoxGeometry(0.36, 0.20, 0.52);
const _fxDebrisMetalMat = new THREE.MeshStandardMaterial({ color: 0x26292e, roughness: 0.78, metalness: 0.45 });
const _fxDebrisConcreteMat = new THREE.MeshStandardMaterial({ color: 0x4b4842, roughness: 0.92, metalness: 0.1 });

function getTerrainDustColor() {
    const mapKey = (typeof currentMapType !== 'undefined' && currentMapType) ? String(currentMapType).toLowerCase() : 'tournament_desert';
    if (mapKey.includes('snow') || mapKey.includes('winter') || mapKey.includes('alpine')) return 0xe6eef6;
    if (mapKey.includes('city')) return 0x7d848b;
    if (mapKey.includes('jungle') || mapKey.includes('final_crusade') || mapKey.includes('heartland') || mapKey.includes('lone_eagle')) return 0x8c7d63;
    return 0xc9ae82;
}

function spawnTreadDustPuff(pos, backX = 0, backZ = 0, color = null, size = 0.55) {
    if (!pos || typeof scene === 'undefined' || activeFX.length > 320) return;
    const dustColor = color !== null ? color : getTerrainDustColor();
    const tex = _getFxSpriteTex('smoke');
    const mat = tex
        ? new THREE.SpriteMaterial({ map: tex, color: dustColor, transparent: true, opacity: 0.52, depthWrite: false })
        : new THREE.MeshBasicMaterial({ color: dustColor, transparent: true, opacity: 0.45 });
    const mesh = tex ? new THREE.Sprite(mat) : new THREE.Mesh(_fxSphere6, mat);
    const startS = size * (tex ? 2.4 : 0.85);
    mesh.scale.set(startS, startS, startS);
    mesh.position.set(pos.x + (Math.random() - 0.5) * 0.35, pos.y + 0.12, pos.z + (Math.random() - 0.5) * 0.35);
    scene.add(mesh);

    let life = 24;
    const maxLife = 24;
    const grow = 0.045 * startS;
    activeFX.push({
        mesh,
        life,
        update() {
            life--;
            const prog = 1 - life / maxLife;
            const s = startS + prog * startS * 1.15;
            mesh.scale.set(s, s, s);
            mesh.position.x += backX * 0.04;
            mesh.position.z += backZ * 0.04;
            mesh.position.y += 0.014 + grow * 0.1;
            mat.opacity = Math.max(0, (1 - prog) * 0.5);
            if (life <= 0) {
                scene.remove(mesh);
                mat.dispose();
                return false;
            }
            return true;
        }
    });
}

function spawnRotorDownwashDust(pos, radius = 3.0) {
    if (!pos || typeof scene === 'undefined' || activeFX.length > 300) return;
    const gY = typeof getTerrainHeight === 'function' ? getTerrainHeight(pos.x, pos.z) : 0;
    const col = getTerrainDustColor();
    for (let i = 0; i < 3; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = radius * (0.45 + Math.random() * 0.55);
        const dp = { x: pos.x + Math.cos(ang) * r, y: gY + 0.2, z: pos.z + Math.sin(ang) * r };
        spawnTreadDustPuff(dp, Math.cos(ang) * 1.6, Math.sin(ang) * 1.6, col, 0.65);
    }
}

function spawnJetContrailPuff(pos, isAfterburner = false) {
    if (!pos || typeof scene === 'undefined' || activeFX.length > 320) return;
    const col = isAfterburner ? 0xff9f43 : 0xf4f8ff;
    const tex = _getFxSpriteTex('smoke');
    const mat = tex
        ? new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, opacity: isAfterburner ? 0.65 : 0.42, depthWrite: false })
        : new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: isAfterburner ? 0.6 : 0.35 });
    const mesh = tex ? new THREE.Sprite(mat) : new THREE.Mesh(_fxSphere6, mat);
    const s0 = isAfterburner ? 0.65 : 0.48;
    mesh.scale.set(s0, s0, s0);
    mesh.position.copy(pos);
    scene.add(mesh);

    let life = isAfterburner ? 14 : 26;
    const maxLife = life;
    activeFX.push({
        life,
        update() {
            life--;
            const p = 1 - life / maxLife;
            const s = s0 * (1 + p * (isAfterburner ? 0.9 : 1.5));
            mesh.scale.set(s, s, s);
            mat.opacity = (1 - p) * (isAfterburner ? 0.6 : 0.4);
            if (life <= 0) {
                scene.remove(mesh);
                mat.dispose();
                return false;
            }
            return true;
        }
    });
}

function spawnExplosionDebris(pos, count = 6, scale = 1.0, isBuilding = false) {
    if (!pos || typeof scene === 'undefined' || activeFX.length > 340) return;
    const mat = isBuilding ? _fxDebrisConcreteMat : _fxDebrisMetalMat;
    const total = Math.min(count, 12);
    for (let i = 0; i < total; i++) {
        const mesh = new THREE.Mesh(_fxDebrisGeo, mat);
        const s = (0.65 + Math.random() * 0.9) * Math.min(2.2, scale);
        mesh.scale.set(s, s * (0.7 + Math.random() * 0.5), s);
        mesh.position.set(pos.x + (Math.random() - 0.5) * 1.2 * scale, (pos.y || 0) + 0.5, pos.z + (Math.random() - 0.5) * 1.2 * scale);
        scene.add(mesh);

        const ang = Math.random() * Math.PI * 2;
        let vx = Math.cos(ang) * (0.16 + Math.random() * 0.32) * scale;
        let vz = Math.sin(ang) * (0.16 + Math.random() * 0.32) * scale;
        let vy = (0.28 + Math.random() * 0.42) * Math.min(1.8, scale);
        const rx = (Math.random() - 0.5) * 0.28;
        const ry = (Math.random() - 0.5) * 0.28;
        let bounces = 0;
        let life = 44 + Math.floor(Math.random() * 20);
        activeFX.push({
            life,
            update() {
                life--;
                mesh.position.x += vx;
                mesh.position.z += vz;
                mesh.position.y += vy;
                vy -= 0.028;
                mesh.rotation.x += rx;
                mesh.rotation.y += ry;
                if (life % 7 === 0 && Math.random() < 0.45 && typeof spawnSmokePuff === 'function') {
                    spawnSmokePuff(mesh.position, 0x353b44, 0.28 * scale);
                }
                const gY = typeof getTerrainHeight === 'function' ? getTerrainHeight(mesh.position.x, mesh.position.z) : 0;
                if (mesh.position.y <= gY + 0.12) {
                    mesh.position.y = gY + 0.12;
                    if (bounces < 1 && Math.abs(vy) > 0.08) {
                        bounces++;
                        vy = -vy * 0.38;
                        vx *= 0.55;
                        vz *= 0.55;
                    } else {
                        vx = 0; vz = 0; vy = 0;
                    }
                }
                if (life <= 0) {
                    scene.remove(mesh);
                    return false;
                }
                return true;
            }
        });
    }
}

function spawnGroundDustPlume(pos, scale = 1.0) {
    if (!pos || typeof scene === 'undefined') return;
    const col = getTerrainDustColor();
    const gY = typeof getTerrainHeight === 'function' ? getTerrainHeight(pos.x, pos.z) : (pos.y || 0);
    const rings = scale >= 2.0 ? 8 : 5;
    for (let i = 0; i < rings; i++) {
        const ang = (i / rings) * Math.PI * 2 + Math.random() * 0.35;
        const dist = (0.8 + Math.random() * 0.9) * scale;
        const dp = { x: pos.x + Math.cos(ang) * dist, y: gY + 0.15, z: pos.z + Math.sin(ang) * dist };
        spawnTreadDustPuff(dp, Math.cos(ang) * 1.8 * Math.min(2.0, scale), Math.sin(ang) * 1.8 * Math.min(2.0, scale), col, 0.65 * Math.min(2.2, scale));
    }
}

function spawnCannonImpactFX(pos, isHeavy = false, isHeroic = false, armorCat = 'heavy_vehicle') {
    if (!pos || typeof scene === 'undefined') return;
    const flashCol = isHeroic ? 0xff2a2a : (isHeavy ? 0xff7f2a : 0xffaa3b);
    const fireTex = _getFxSpriteTex('fireball');
    const flashTex = _getFxSpriteTex('flash');

    // 1. Bright core flash + fiery impact fireball
    spawnMuzzleFlash(pos, isHeroic ? 0xff2222 : 0xfff0c0, isHeavy ? 0.95 : 0.65);
    if (fireTex && activeFX.length < 340) {
        const puffs = isHeavy ? 3 : 2;
        for (let i = 0; i < puffs; i++) {
            const mat = new THREE.SpriteMaterial({
                map: fireTex,
                color: flashCol,
                transparent: true,
                opacity: 0.95,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const sp = new THREE.Sprite(mat);
            const s0 = (isHeavy ? 1.55 : 1.05) * (0.85 + Math.random() * 0.35);
            sp.scale.set(s0, s0, s0);
            sp.position.set(
                pos.x + (Math.random() - 0.5) * (isHeavy ? 0.9 : 0.45),
                (pos.y || 0) + 0.35 + Math.random() * 0.45,
                pos.z + (Math.random() - 0.5) * (isHeavy ? 0.9 : 0.45)
            );
            scene.add(sp);
            let life = isHeavy ? 16 : 12;
            const maxLife = life;
            activeFX.push({
                mesh: sp,
                life,
                update() {
                    life--;
                    const prog = 1 - life / maxLife;
                    const s = s0 * (1 + prog * 1.45);
                    sp.scale.set(s, s, s);
                    sp.position.y += 0.04;
                    mat.opacity = Math.max(0, (1 - prog) * 0.95);
                    if (life <= 0) {
                        scene.remove(sp);
                        mat.dispose();
                        return false;
                    }
                    return true;
                }
            });
        }
    }

    // 2. Incandescent shrapnel sparks & flying dirt/dust kick-up
    spawnSparks(pos, isHeroic ? 0xff4444 : 0xffd32a, isHeavy ? 14 : 8);
    const dustCol = getTerrainDustColor();
    const dustCount = isHeavy ? 3 : 2;
    for (let d = 0; d < dustCount; d++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = (isHeavy ? 1.4 : 0.9) * (0.6 + Math.random() * 0.6);
        spawnTreadDustPuff(pos, Math.cos(ang) * spd, Math.sin(ang) * spd, dustCol, isHeavy ? 0.72 : 0.48);
    }

    // 3. Dark impact smoke plume
    spawnSmokePuff(
        { x: pos.x, y: (pos.y || 0) + 0.4, z: pos.z },
        0x2e333b,
        isHeavy ? 0.62 : 0.40
    );

    // 4. Subtle scorch mark on heavy or ground hits
    if (isHeavy || Math.random() < 0.45) {
        spawnCraterDecal(pos, isHeavy ? 1.55 : 0.95, isHeavy ? 260 : 180, 'explosive');
    }

    if (typeof playAudio === 'function') {
        const key = armorCat === 'building' ? 'impact_building' : (isHeavy ? 'expl_small' : 'impact_vehicle');
        playAudio(key, { volume: isHeavy ? 0.55 : 0.42, pos });
    }
}

function spawnBulletImpactFX(pos, armorCat = 'heavy_vehicle', isHeroic = false) {
    if (!pos || typeof scene === 'undefined' || activeFX.length > 330) return;
    if (armorCat === 'heavy_vehicle' || armorCat === 'light_vehicle' || armorCat === 'air') {
        spawnSparks(pos, isHeroic ? 0xff3b3b : 0xffe066, 3);
        if (Math.random() < 0.5) spawnMuzzleFlash(pos, isHeroic ? 0xff2222 : 0xffcc55, 0.22);
    } else {
        spawnTreadDustPuff(pos, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, getTerrainDustColor(), 0.28);
        if (Math.random() < 0.35) spawnSparks(pos, isHeroic ? 0xff3b3b : 0xffd32a, 2);
    }
}

// Authentic C&C Generals Tank & Artillery Cannon Muzzle Blast:
// Directional fireball cone + muzzle-brake side gas vents + billowing lingering gunsmoke plume + ground overpressure dust
function spawnCannonMuzzleBlast(muzzlePos, targetPos, opts = {}) {
    if (!muzzlePos || typeof scene === 'undefined') return;
    const scale = opts.scale || 1.0;
    const isHeroic = !!opts.isHeroic;
    const isArtillery = !!opts.isArtillery;
    const dualVent = opts.dualVent !== false;
    const flashCol = isHeroic ? 0xff2222 : (opts.color || 0xff9f43);
    const smokeCol = opts.smokeColor !== undefined ? opts.smokeColor : 0xc8c4bc;

    let dx = targetPos ? (targetPos.x - muzzlePos.x) : 0;
    let dy = targetPos ? (targetPos.y - muzzlePos.y) : 0;
    let dz = targetPos ? (targetPos.z - muzzlePos.z) : 1;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    const hLen = Math.hypot(dx, dz) || 1;
    const hx = dx / hLen, hz = dz / hLen;
    // Perpendicular horizontal vector for muzzle-brake side vents
    const sx = -hz, sz = hx;

    const flashTex = _getFxSpriteTex('flash');
    const fireTex = _getFxSpriteTex('fireball');
    const smokeTex = _getFxSpriteTex('smoke');

    // 1. Directional bright muzzle flame cone (3 staggered sprites forward along bore)
    const coneOffsets = [0.0, 0.55 * scale, 1.15 * scale];
    const coneSizes = [1.05 * scale, 0.85 * scale, 0.62 * scale];
    for (let i = 0; i < coneOffsets.length; i++) {
        const useFlash = (i === 0);
        const tex = useFlash ? flashTex : fireTex;
        const mat = tex
            ? new THREE.SpriteMaterial({
                map: tex,
                color: i === 0 ? (isHeroic ? 0xff4444 : 0xfff5cc) : flashCol,
                transparent: true,
                opacity: 1.0,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
            : new THREE.MeshBasicMaterial({ color: flashCol, transparent: true, opacity: 0.95 });
        const sp = tex ? new THREE.Sprite(mat) : new THREE.Mesh(_fxSphere8, mat);
        const s0 = coneSizes[i] * (tex ? 2.2 : 0.85);
        sp.scale.set(s0, s0, s0);
        sp.position.set(
            muzzlePos.x + dx * coneOffsets[i],
            muzzlePos.y + dy * coneOffsets[i],
            muzzlePos.z + dz * coneOffsets[i]
        );
        scene.add(sp);
        let life = 6 + i * 2;
        const maxLife = life;
        const fwdSpd = (0.14 + i * 0.06) * scale;
        activeFX.push({
            mesh: sp,
            life,
            update() {
                life--;
                const prog = 1 - life / maxLife;
                const curS = s0 * (1 + prog * 0.85);
                sp.scale.set(curS, curS, curS);
                sp.position.x += dx * fwdSpd * (1 - prog * 0.6);
                sp.position.y += dy * fwdSpd * (1 - prog * 0.6) + 0.015;
                sp.position.z += dz * fwdSpd * (1 - prog * 0.6);
                mat.opacity = Math.max(0, 1 - prog);
                if (life <= 0) {
                    scene.remove(sp);
                    mat.dispose();
                    return false;
                }
                return true;
            }
        });
    }

    // 2. Side muzzle-brake V-blast gas vents (signature Generals Crusader/Overlord/Battlemaster detail)
    if (dualVent && activeFX.length < 320) {
        [-1, 1].forEach(sideSign => {
            const mat = (fireTex || smokeTex)
                ? new THREE.SpriteMaterial({
                    map: fireTex || smokeTex,
                    color: isHeroic ? 0xff4444 : 0xffc87a,
                    transparent: true,
                    opacity: 0.85,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                })
                : new THREE.MeshBasicMaterial({ color: flashCol, transparent: true, opacity: 0.8 });
            const sp = (fireTex || smokeTex) ? new THREE.Sprite(mat) : new THREE.Mesh(_fxSphere6, mat);
            const s0 = 0.72 * scale * ((fireTex || smokeTex) ? 2.0 : 0.7);
            sp.scale.set(s0, s0, s0);
            sp.position.set(
                muzzlePos.x + sx * sideSign * 0.3 * scale,
                muzzlePos.y,
                muzzlePos.z + sz * sideSign * 0.3 * scale
            );
            scene.add(sp);
            let life = 9;
            const maxLife = 9;
            let vx = (sx * sideSign * 0.24 - hx * 0.05) * scale;
            let vz = (sz * sideSign * 0.24 - hz * 0.05) * scale;
            activeFX.push({
                mesh: sp,
                life,
                update() {
                    life--;
                    const prog = 1 - life / maxLife;
                    const curS = s0 * (1 + prog * 1.15);
                    sp.scale.set(curS, curS, curS);
                    sp.position.x += vx;
                    sp.position.z += vz;
                    sp.position.y += 0.015;
                    vx *= 0.84;
                    vz *= 0.84;
                    mat.opacity = Math.max(0, (1 - prog) * 0.85);
                    if (life <= 0) {
                        scene.remove(sp);
                        mat.dispose();
                        return false;
                    }
                    return true;
                }
            });
        });
    }

    // 3. Billowing directional cannon gunsmoke plume (lingers ~1.1-1.6s)
    if (activeFX.length < 320) {
        const smokeCount = isArtillery ? 6 : 4;
        for (let i = 0; i < smokeCount; i++) {
            const mat = smokeTex
                ? new THREE.SpriteMaterial({
                    map: smokeTex,
                    color: smokeCol,
                    transparent: true,
                    opacity: 0.68,
                    depthWrite: false
                })
                : new THREE.MeshBasicMaterial({ color: smokeCol, transparent: true, opacity: 0.62 });
            const sp = smokeTex ? new THREE.Sprite(mat) : new THREE.Mesh(_fxSphere6, mat);
            const s0 = (0.42 + i * 0.12) * scale * (smokeTex ? 2.5 : 0.9);
            sp.scale.set(s0, s0, s0);
            const fwdOff = (0.25 + i * 0.45) * scale;
            sp.position.set(
                muzzlePos.x + dx * fwdOff + (Math.random() - 0.5) * 0.28 * scale,
                muzzlePos.y + dy * fwdOff + (Math.random() - 0.5) * 0.2 * scale,
                muzzlePos.z + dz * fwdOff + (Math.random() - 0.5) * 0.28 * scale
            );
            scene.add(sp);
            let life = (isArtillery ? 74 : 56) + Math.floor(Math.random() * 24);
            const maxLife = life;
            let vx = (hx * (0.15 + i * 0.045) + sx * (Math.random() - 0.5) * 0.08) * scale;
            let vz = (hz * (0.15 + i * 0.045) + sz * (Math.random() - 0.5) * 0.08) * scale;
            const vy = 0.022 + Math.random() * 0.022;
            activeFX.push({
                mesh: sp,
                life,
                update() {
                    life--;
                    const prog = 1 - life / maxLife;
                    const curS = s0 * (1 + prog * 1.95);
                    sp.scale.set(curS, curS, curS);
                    sp.position.x += vx;
                    sp.position.z += vz;
                    sp.position.y += vy * (0.5 + prog * 0.8);
                    vx *= 0.92;
                    vz *= 0.92;
                    mat.opacity = Math.max(0, (1 - prog) * 0.65);
                    if (life <= 0) {
                        scene.remove(sp);
                        mat.dispose();
                        return false;
                    }
                    return true;
                }
            });
        }
    }

    // 4. Ground overpressure dust kick-up right beneath the cannon barrel
    if (activeFX.length < 320) {
        const gY = typeof getTerrainHeight === 'function' ? getTerrainHeight(muzzlePos.x, muzzlePos.z) : 0;
        if ((muzzlePos.y - gY) < 6.0) {
            const dustCol = getTerrainDustColor();
            const dustRings = isArtillery ? 5 : 3;
            for (let d = 0; d < dustRings; d++) {
                const ang = (d / dustRings) * Math.PI * 2 + Math.random() * 0.5;
                const r = (0.7 + Math.random() * 0.6) * scale;
                const dp = {
                    x: muzzlePos.x + hx * 0.6 * scale + Math.cos(ang) * r,
                    y: gY + 0.16,
                    z: muzzlePos.z + hz * 0.6 * scale + Math.sin(ang) * r
                };
                spawnTreadDustPuff(
                    dp,
                    (Math.cos(ang) * 1.35 + hx * 0.65) * scale,
                    (Math.sin(ang) * 1.35 + hz * 0.65) * scale,
                    dustCol,
                    (isArtillery ? 0.88 : 0.58) * scale
                );
            }
        }
    }
}

// Authentic Rocket / Missile Launcher Backblast Smoke & Dust Cloud
function spawnRocketBackblast(muzzlePos, targetPos, scale = 1.0) {
    if (!muzzlePos || typeof scene === 'undefined') return;
    let dx = targetPos ? (targetPos.x - muzzlePos.x) : 0;
    let dz = targetPos ? (targetPos.z - muzzlePos.z) : 1;
    const hLen = Math.hypot(dx, dz) || 1;
    const bx = -dx / hLen, bz = -dz / hLen;

    spawnMuzzleFlash(muzzlePos, 0xff9f43, 0.55 * scale);
    const smokeTex = _getFxSpriteTex('smoke');
    const count = scale >= 1.2 ? 5 : 3;
    for (let i = 0; i < count; i++) {
        if (activeFX.length > 330) break;
        const mat = smokeTex
            ? new THREE.SpriteMaterial({ map: smokeTex, color: 0xd8d5ce, transparent: true, opacity: 0.65, depthWrite: false })
            : new THREE.MeshBasicMaterial({ color: 0xd8d5ce, transparent: true, opacity: 0.58 });
        const sp = smokeTex ? new THREE.Sprite(mat) : new THREE.Mesh(_fxSphere6, mat);
        const s0 = (0.36 + i * 0.1) * scale * (smokeTex ? 2.4 : 0.85);
        sp.scale.set(s0, s0, s0);
        sp.position.set(
            muzzlePos.x + bx * (0.4 + i * 0.45) * scale + (Math.random() - 0.5) * 0.25,
            muzzlePos.y + (Math.random() - 0.5) * 0.2,
            muzzlePos.z + bz * (0.4 + i * 0.45) * scale + (Math.random() - 0.5) * 0.25
        );
        scene.add(sp);
        let life = 34 + Math.floor(Math.random() * 14);
        const maxLife = life;
        let vx = bx * (0.14 + i * 0.03) * scale;
        let vz = bz * (0.14 + i * 0.03) * scale;
        activeFX.push({
            mesh: sp,
            life,
            update() {
                life--;
                const prog = 1 - life / maxLife;
                const curS = s0 * (1 + prog * 1.8);
                sp.scale.set(curS, curS, curS);
                sp.position.x += vx;
                sp.position.z += vz;
                sp.position.y += 0.025;
                vx *= 0.90;
                vz *= 0.90;
                mat.opacity = Math.max(0, (1 - prog) * 0.62);
                if (life <= 0) {
                    scene.remove(sp);
                    mat.dispose();
                    return false;
                }
                return true;
            }
        });
    }
    if (scale >= 1.2) {
        const gY = typeof getTerrainHeight === 'function' ? getTerrainHeight(muzzlePos.x, muzzlePos.z) : 0;
        const dustCol = getTerrainDustColor();
        for (let d = 0; d < 3; d++) {
            spawnTreadDustPuff(
                { x: muzzlePos.x + bx * (1.2 + d * 0.6), y: gY + 0.18, z: muzzlePos.z + bz * (1.2 + d * 0.6) },
                bx * 1.4,
                bz * 1.4,
                dustCol,
                0.75 * scale
            );
        }
    }
}

// Smooth, non-accumulating turret kickback + chassis rock when tanks/artillery fire
function triggerUnitRecoil(unit, targetPos, strength = 1.0) {
    if (!unit || !unit.mesh || unit.isAir) return;
    const turret = (typeof getCachedNode === 'function') ? getCachedNode(unit.mesh, 'turretSystem') : null;
    if (unit._activeRecoilFX) {
        unit._activeRecoilFX.cancel();
        unit._activeRecoilFX = null;
    }
    if (turret && !turret.userData._recoilRestPos) {
        turret.userData._recoilRestPos = turret.position.clone();
    }
    const restPos = turret ? turret.userData._recoilRestPos : null;
    const kickDist = Math.min(0.45, 0.24 * strength);
    const kickPitch = Math.min(0.085, 0.042 * strength);
    const totalFrames = 20;
    let frame = 0;
    let cancelled = false;
    const turretYaw = turret ? turret.rotation.y : 0;
    const kickLocalX = -Math.sin(turretYaw) * kickDist;
    const kickLocalZ = -Math.cos(turretYaw) * kickDist;

    const fx = {
        life: totalFrames,
        cancel() {
            cancelled = true;
            if (turret && restPos) turret.position.copy(restPos);
            if (unit.mesh) unit.mesh.rotation.x = 0;
        },
        update() {
            if (cancelled || !unit.mesh || unit.health <= 0) {
                if (turret && restPos) turret.position.copy(restPos);
                if (unit.mesh) unit.mesh.rotation.x = 0;
                if (unit._activeRecoilFX === fx) unit._activeRecoilFX = null;
                return false;
            }
            frame++;
            // Fast kick back over first 3 frames, smooth damped recovery over remaining 17 frames
            const amp = frame <= 3
                ? (frame / 3)
                : Math.pow(Math.max(0, 1 - (frame - 3) / (totalFrames - 3)), 1.7);
            if (turret && restPos) {
                turret.position.set(
                    restPos.x + kickLocalX * amp,
                    restPos.y,
                    restPos.z + kickLocalZ * amp
                );
            }
            unit.mesh.rotation.x = -kickPitch * amp;
            if (frame >= totalFrames) {
                if (turret && restPos) turret.position.copy(restPos);
                unit.mesh.rotation.x = 0;
                if (unit._activeRecoilFX === fx) unit._activeRecoilFX = null;
                return false;
            }
            return true;
        }
    };
    unit._activeRecoilFX = fx;
    activeFX.push(fx);
}

// High-velocity glowing Cannon / Artillery Shell with smoke streak & synced impact callback
function spawnCannonShellProjectile(fromPos, toPos, opts = {}) {
    if (!fromPos || !toPos || typeof scene === 'undefined') {
        if (opts && typeof opts.onImpact === 'function') opts.onImpact(toPos);
        return;
    }
    const start = fromPos.clone();
    const end = toPos.clone();
    const totalDist = start.distanceTo(end);
    if (totalDist < 0.1) {
        if (typeof opts.onImpact === 'function') opts.onImpact(end);
        return;
    }

    const isHeroic = !!opts.isHeroic;
    const shellColor = isHeroic ? 0xff2222 : (opts.color || 0xffb830);
    const coreColor = isHeroic ? 0xffd0d0 : (opts.coreColor || 0xfff8dc);
    const smokeColor = isHeroic ? 0xff4444 : (opts.smokeColor !== undefined ? opts.smokeColor : 0xd6d2ca);
    const thickness = opts.thickness || 1.0;
    const speed = opts.speed || 3.8;
    const arcHeight = opts.arcHeight !== undefined ? opts.arcHeight : Math.min(1.1, totalDist * 0.025);
    const trailRate = opts.trailRate !== undefined ? opts.trailRate : 0.72;
    const trailSize = opts.trailSize || (0.24 * thickness);

    const group = new THREE.Group();
    group.position.copy(start);

    const outerMat = new THREE.MeshBasicMaterial({
        color: shellColor,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const coreMat = new THREE.MeshBasicMaterial({
        color: coreColor,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const outerBolt = new THREE.Mesh(_fxTracerGeo, outerMat);
    outerBolt.scale.set(0.16 * thickness, 0.16 * thickness, 1.9 * thickness);
    const coreBolt = new THREE.Mesh(_fxTracerGeo, coreMat);
    coreBolt.scale.set(0.08 * thickness, 0.08 * thickness, 1.45 * thickness);
    group.add(outerBolt);
    group.add(coreBolt);

    if (typeof group.lookAt === 'function') group.lookAt(end);
    scene.add(group);

    let distTraveled = 0;
    const curPos = start.clone();
    const nextPos = start.clone();

    activeFX.push({
        mesh: group,
        life: Math.max(4, Math.ceil(totalDist / speed) + 4),
        update() {
            distTraveled += speed;
            const alpha = Math.min(1.0, distTraveled / totalDist);
            curPos.lerpVectors(start, end, alpha);
            curPos.y += Math.sin(alpha * Math.PI) * arcHeight;
            group.position.copy(curPos);

            if (alpha < 0.99 && typeof group.lookAt === 'function') {
                const nAlpha = Math.min(1.0, alpha + 0.05);
                nextPos.lerpVectors(start, end, nAlpha);
                nextPos.y += Math.sin(nAlpha * Math.PI) * arcHeight;
                group.lookAt(nextPos);
            }

            if (Math.random() < trailRate && activeFX.length < 320) {
                spawnSmokePuff(curPos, smokeColor, trailSize);
            }

            if (alpha >= 1.0) {
                scene.remove(group);
                outerMat.dispose();
                coreMat.dispose();
                if (typeof opts.onImpact === 'function') {
                    opts.onImpact(end);
                }
                return false;
            }
            return true;
        }
    });
}

// Supersonic Sniper Vapor Trail (Pathfinder / Jarmen Kell)
function spawnSniperVaporTrail(fromPos, toPos, color = 0xeef6ff, isHeroic = false) {
    if (!fromPos || !toPos || typeof scene === 'undefined') return;
    const lineCol = isHeroic ? 0xff2222 : color;
    const points = [fromPos.clone(), toPos.clone()];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({ color: lineCol, transparent: true, opacity: 0.92 });
    const line = new THREE.Line(lineGeo, lineMat);
    scene.add(line);

    spawnMuzzleFlash(fromPos, isHeroic ? 0xff2222 : 0xffffff, 0.42);
    spawnSmokePuff(fromPos, 0xd8dce2, 0.22);
    spawnSparks(toPos, lineCol, 4);

    let life = 22;
    const maxLife = 22;
    activeFX.push({
        mesh: line,
        life,
        update() {
            life--;
            lineMat.opacity = Math.max(0, (life / maxLife) * 0.88);
            if (life <= 0) {
                scene.remove(line);
                lineGeo.dispose();
                lineMat.dispose();
                return false;
            }
            return true;
        }
    });
}

// Arcing Thrown Projectile (Ranger Flashbang Grenade / Angry Mob Molotov Cocktail)
function spawnThrownProjectile(fromPos, toPos, opts = {}) {
    if (!fromPos || !toPos || typeof scene === 'undefined') {
        if (opts && typeof opts.onImpact === 'function') opts.onImpact(toPos);
        return;
    }
    const start = fromPos.clone();
    const end = toPos.clone();
    const totalDist = Math.max(0.5, start.distanceTo(end));
    const isMolotov = !!opts.isMolotov;
    const color = isMolotov ? 0xff6b22 : 0xf4f8ff;
    const mat = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(_fxSphere6, mat);
    mesh.scale.setScalar(isMolotov ? 0.18 : 0.15);
    mesh.position.copy(start);
    scene.add(mesh);

    const speed = isMolotov ? 0.95 : 1.15;
    const arcH = Math.min(4.5, Math.max(1.8, totalDist * 0.22));
    let dist = 0;

    activeFX.push({
        mesh,
        life: Math.ceil(totalDist / speed) + 4,
        update() {
            dist += speed;
            const alpha = Math.min(1.0, dist / totalDist);
            mesh.position.lerpVectors(start, end, alpha);
            mesh.position.y += Math.sin(alpha * Math.PI) * arcH;
            if (isMolotov && Math.random() < 0.7 && activeFX.length < 320) {
                spawnSmokePuff(mesh.position, 0xff7b29, 0.18);
            }
            if (alpha >= 1.0) {
                scene.remove(mesh);
                mat.dispose();
                if (typeof opts.onImpact === 'function') opts.onImpact(end);
                return false;
            }
            return true;
        }
    });
}

function spawnBuildingDestructionFX(pos, radius = 5.5, color = 0xff793f) {
    if (!pos || typeof scene === 'undefined') return;
    const scale = Math.max(2.2, Math.min(3.8, (radius || 5.5) * 0.52));
    spawnEnhancedExplosion(pos, color, scale, true, 'expl_building');
    if (typeof playAudio === 'function') playAudio('debris_building', { volume: 0.78, pos });
    if (typeof triggerScreenShake === 'function') triggerScreenShake(0.95);
    spawnExplosionDebris(pos, 10, 1.45, true);
    spawnCraterDecal(pos, Math.max(3.4, radius * 0.72), 540, 'explosive');
    spawnLingeringSmokeColumn(pos, 260, 0x22262b);

    [140, 300].forEach((delay, idx) => {
        setTimeout(() => {
            if (typeof scene === 'undefined') return;
            const subPos = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * radius * 0.85, 0.8 + idx * 0.6, (Math.random() - 0.5) * radius * 0.85));
            spawnEnhancedExplosion(subPos, idx === 0 ? 0xff9f43 : 0xff5522, scale * 0.68, false, 'expl_small');
            spawnExplosionDebris(subPos, 4, 1.1, true);
        }, delay);
    });
}

function spawnEMPDisableSparks(pos) {
    if (!pos || typeof scene === 'undefined' || activeFX.length > 340) return;
    const baseY = (pos.y || 0) + 1.1;
    const pts = [];
    for (let i = 0; i < 6; i++) {
        const ang = (i / 5) * Math.PI * 2;
        const r = 0.85 + Math.random() * 1.1;
        pts.push(new THREE.Vector3(pos.x + Math.cos(ang) * r, baseY + (Math.random() - 0.3) * 1.8, pos.z + Math.sin(ang) * r));
    }
    const arcGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const arcMat = new THREE.LineBasicMaterial({ color: 0x38e8ff, transparent: true, opacity: 0.95 });
    const arcLine = new THREE.Line(arcGeo, arcMat);
    scene.add(arcLine);
    spawnSparks({ x: pos.x, y: baseY, z: pos.z }, 0x38e8ff, 4);

    let life = 12;
    activeFX.push({
        life,
        update() {
            life--;
            arcMat.opacity = Math.max(0, life / 12);
            if (life <= 0) {
                scene.remove(arcLine);
                arcGeo.dispose();
                arcMat.dispose();
                return false;
            }
            return true;
        }
    });
}

function spawnPromotionFX(pos, rank = 1) {
    if (!pos || typeof scene === 'undefined') return;
    const p = (pos.mesh && pos.mesh.position) ? pos.mesh.position : (pos.position || pos);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
    if (typeof playAudio === 'function') playAudio('unit_promoted', { volume: 0.82 });
    const col = rank >= 3 ? 0xffd32a : (rank === 2 ? 0xffc048 : 0xffeaa7);
    const gY = typeof getTerrainHeight === 'function' ? getTerrainHeight(p.x, p.z) : (p.y || 0);
    spawnMuzzleFlash({ x: p.x, y: gY + 1.6, z: p.z }, col, 1.1 + rank * 0.25);
    spawnSparks({ x: p.x, y: gY + 0.8, z: p.z }, col, 8 + rank * 4);

    if (typeof THREE.RingGeometry !== 'function') return;
    const ringGeo = new THREE.RingGeometry(0.6, 1.05, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(p.x, gY + 0.35, p.z);
    scene.add(ring);

    let life = 28;
    activeFX.push({
        life,
        update() {
            life--;
            const prog = 1 - life / 28;
            ring.scale.setScalar(1 + prog * 3.4);
            ring.position.y += 0.04;
            ringMat.opacity = Math.max(0, (1 - prog) * 0.95);
            if (life <= 0) {
                scene.remove(ring);
                ringGeo.dispose();
                ringMat.dispose();
                return false;
            }
            return true;
        }
    });
}

if (typeof window !== 'undefined') {
    window.getTerrainDustColor = getTerrainDustColor;
    window.spawnTreadDustPuff = spawnTreadDustPuff;
    window.spawnRotorDownwashDust = spawnRotorDownwashDust;
    window.spawnJetContrailPuff = spawnJetContrailPuff;
    window.spawnExplosionDebris = spawnExplosionDebris;
    window.spawnGroundDustPlume = spawnGroundDustPlume;
    window.spawnCannonImpactFX = spawnCannonImpactFX;
    window.spawnBulletImpactFX = spawnBulletImpactFX;
    window.spawnCannonMuzzleBlast = spawnCannonMuzzleBlast;
    window.spawnRocketBackblast = spawnRocketBackblast;
    window.triggerUnitRecoil = triggerUnitRecoil;
    window.spawnCannonShellProjectile = spawnCannonShellProjectile;
    window.spawnSniperVaporTrail = spawnSniperVaporTrail;
    window.spawnThrownProjectile = spawnThrownProjectile;
    window.spawnBuildingDestructionFX = spawnBuildingDestructionFX;
    window.spawnEMPDisableSparks = spawnEMPDisableSparks;
    window.spawnPromotionFX = spawnPromotionFX;
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

    if (metadata && metadata.missileTemplate && typeof metadata.missileTemplate.clone === 'function') {
        const mClone = metadata.missileTemplate.clone(true);
        mClone.visible = true;
        mClone.position.set(0, 0, 0);
        mClone.rotation.set(0, 0, 0);
        mClone.scale.setScalar(0.32);
        mClone.traverse(c => {
            c.visible = true;
            if (!c.userData) c.userData = {};
            c.userData._sharedW3D = true;
        });
        group.add(mClone);
    } else {
        const bodyMat = new THREE.MeshStandardMaterial({
                color: isToxin ? 0x2ed573 : 0x747d8c,
                metalness: 0.8,
                roughness: 0.3
        });
        const rGeo = new THREE.CylinderGeometry(isHeavy ? 0.22 : 0.12, isHeavy ? 0.22 : 0.12, isHeavy ? 1.4 : 0.8, 8);
        rGeo.rotateX(Math.PI / 2);
        const rocketBody = new THREE.Mesh(rGeo, bodyMat);
        group.add(rocketBody);
    }

    const isHeroic = !!(metadata && metadata.attacker && metadata.attacker.veterancy >= 3);
    const glowColor = isHeroic
        ? (isHeavy ? 0xff5522 : 0xff1e1e)
        : (isToxin ? 0x7bed9f : 0xff793f);
    const glowRadius = (isHeavy ? 0.45 : 0.2) * (isHeroic ? 1.45 : 1.0);
    const glowMat = new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.9 });
    const motorGlow = new THREE.Mesh(new THREE.SphereGeometry(glowRadius, 6, 6), glowMat);
    motorGlow.position.z = isHeavy ? -1.4 : -0.45;
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
        isHeroic: isHeroic,
        metadata: metadata,
        intercepted: false,
        update() {
            if (this.intercepted) {
                // Point Defense Laser Interception in Mid-Air!
                scene.remove(this.group);
                this.group.traverse(child => {
                        if (child.userData && child.userData._sharedW3D) return;
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
                const arcHeight = Math.sin(alpha * Math.PI) * 14.0;
                this.group.position.set(this.curPos.x, this.curPos.y + arcHeight, this.curPos.z);
                const nextAlpha = Math.min(1.0, alpha + 0.04);
                const nextPos = new THREE.Vector3().lerpVectors(fromPos, this.toPos, nextAlpha);
                nextPos.y += Math.sin(nextAlpha * Math.PI) * 14.0;
                if (typeof this.group.lookAt === 'function' && nextAlpha < 1.0) this.group.lookAt(nextPos);
            } else {
                this.group.position.copy(this.curPos);
            }

            if (Math.random() < (this.isHeroic ? 0.95 : 0.85)) {
                const trailColor = this.isHeroic
                    ? (this.isHeavy ? 0xff5522 : 0xf10e0e)
                    : (this.isToxin ? 0x2ed573 : 0x747d8c);
                const trailSize = this.isHeroic ? (this.isHeavy ? 0.42 : 0.35) : 0.25;
                spawnSmokePuff(this.group.position, trailColor, trailSize);
            }

            if (alpha >= 1.0) {
                scene.remove(this.group);
                this.group.traverse(child => {
                        if (child.userData && child.userData._sharedW3D) return;
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) child.material.dispose();
                });

                const mIdx = activeMissiles.indexOf(this);
                if (mIdx !== -1) activeMissiles.splice(mIdx, 1);

                const expColor = (!this.isToxin && this.isHeroic) ? 0xff2222 : (this.isToxin ? 0x2ed573 : 0xff4757);
                const expScale = this.isHeroic ? (this.isHeavy ? 2.5 : 1.45) : (this.isHeavy ? 2.2 : 1.2);
                const hasCustomImpactSfx = !!(this.metadata && typeof this.metadata.onImpact === 'function');
                const impactSfx = this.metadata && this.metadata.impactSound;
                const expSound = hasCustomImpactSfx ? 'none' : (impactSfx || (this.isToxin ? 'anthrax_blast' : (this.isHeavy ? 'expl_artillery' : 'expl_missile')));
                spawnEnhancedExplosion(this.toPos, expColor, expScale, this.isHeavy, expSound);
                if (this.metadata && this.metadata.impactShake && typeof triggerScreenShake === 'function') {
                    triggerScreenShake(this.metadata.impactShake);
                }
                if (hasCustomImpactSfx) {
                    this.metadata.onImpact(this.toPos);
                }
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

function spawnGuidedBomb(fromPos, toPos, isFuelAir = false, isHeroic = false) {
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
            isHeroic: isHeroic,
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

                if (Math.random() < (this.isHeroic ? 0.85 : 0.6)) {
                    spawnSmokePuff(this.mesh.position, this.isHeroic ? 0xf10e0e : 0xced6e0, this.isHeroic ? 0.32 : 0.2);
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

// Charred blast crater decal on ground (cached per-weapon-style procedural crater textures)
const _craterTexCache = {};
function _getCraterTexture(style = 'explosive') {
    if (_craterTexCache[style]) return _craterTexCache[style];
    if (typeof document === 'undefined' || !THREE.CanvasTexture) return null;
    const size = 128;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    const cx = size / 2, cy = size / 2;

    const palettes = {
        explosive: { inner: 'rgba(12, 10, 9, 0.96)', mid: 'rgba(26, 20, 16, 0.88)', rim: 'rgba(54, 42, 30, 0.62)', ray: 'rgba(68, 52, 36, 0.50)', ridge: 'rgba(92, 74, 54, 0.45)' },
        nuke:      { inner: 'rgba(30, 220, 100, 0.85)', mid: 'rgba(16, 65, 32, 0.92)', rim: 'rgba(18, 22, 16, 0.78)', ray: 'rgba(46, 213, 115, 0.42)', ridge: 'rgba(85, 239, 196, 0.45)' },
        flame:     { inner: 'rgba(255, 95, 25, 0.75)', mid: 'rgba(28, 14, 10, 0.94)', rim: 'rgba(18, 12, 10, 0.72)', ray: 'rgba(255, 110, 40, 0.35)', ridge: 'rgba(120, 45, 20, 0.48)' },
        toxin:     { inner: 'rgba(110, 235, 90, 0.78)', mid: 'rgba(28, 54, 20, 0.90)', rim: 'rgba(24, 34, 18, 0.68)', ray: 'rgba(80, 200, 70, 0.40)', ridge: 'rgba(123, 237, 159, 0.40)' },
        ion:       { inner: 'rgba(110, 240, 255, 0.90)', mid: 'rgba(12, 60, 95, 0.90)', rim: 'rgba(14, 22, 34, 0.72)', ray: 'rgba(0, 210, 255, 0.48)', ridge: 'rgba(72, 219, 251, 0.55)' }
    };
    const pal = palettes[style] || palettes.explosive;

    const outerGrad = ctx.createRadialGradient(cx, cy, size * 0.06, cx, cy, size * 0.48);
    outerGrad.addColorStop(0.0, pal.inner);
    outerGrad.addColorStop(0.28, pal.mid);
    outerGrad.addColorStop(0.55, pal.rim);
    outerGrad.addColorStop(0.80, 'rgba(18, 16, 14, 0.24)');
    outerGrad.addColorStop(1.0, 'rgba(15, 12, 10, 0.0)');
    ctx.fillStyle = outerGrad;
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 28; i++) {
        const ang = (i / 28) * Math.PI * 2 + (i % 3) * 0.11;
        const len = size * (0.30 + ((i * 37) % 19) * 0.009);
        ctx.strokeStyle = (i % 2 === 0) ? 'rgba(12, 10, 9, 0.72)' : pal.ray;
        ctx.lineWidth = 2 + (i % 3);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * 6, cy + Math.sin(ang) * 6);
        ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
        ctx.stroke();
    }

    ctx.strokeStyle = pal.ridge;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.25, 0, Math.PI * 2);
    ctx.stroke();

    _craterTexCache[style] = new THREE.CanvasTexture(c);
    return _craterTexCache[style];
}

function spawnCraterDecal(pos, radius = 2.2, duration = 380, style = 'explosive') {
    const groundY = getTerrainHeight(pos.x, pos.z);
    const tex = _getCraterTexture(style);
    const geo = new THREE.PlaneGeometry(radius * 2.25, radius * 2.25);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
            map: tex || undefined,
            color: tex ? 0xffffff : 0x1a1512,
            transparent: true,
            opacity: 0.92,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
    });
    const crater = new THREE.Mesh(geo, mat);
    crater.position.set(pos.x, groundY + 0.18, pos.z);
    crater.rotation.y = Math.random() * Math.PI * 2;
    crater.renderOrder = 2;
    scene.add(crater);

    activeFX.push({
            mesh: crater,
            life: duration,
            maxLife: duration,
            update() {
                this.life--;
                if (this.life < 80) {
                    this.mesh.material.opacity = (this.life / 80) * 0.92;
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
function spawnEnhancedExplosion(pos, color = 0xffa502, scale = 1.0, isHeavy = false, soundType = null) {
    if (soundType !== 'none') {
        const chosenSfx = soundType || (isHeavy ? 'expl_artillery' : 'expl_small');
        if (typeof playAudio === 'function') playAudio(chosenSfx, { pos });
        else if (typeof playUSASound === 'function') playUSASound(chosenSfx, { pos });
    }

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
    spawnSparks(pos, color, isHeavy ? 22 : 12);

    // 4. Radial ground dust ejecta & flying shrapnel chunks on medium/heavy explosions
    if (isHeavy || scale >= 1.5) {
        spawnGroundDustPlume(pos, Math.min(2.6, scale));
    }
    if (scale >= 1.4) {
        spawnExplosionDebris(pos, isHeavy ? 6 : 3, Math.min(2.0, scale), false);
    }

    // 5. Heavy billows of black smoke
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

function spawnExplosion(pos, color = 0xffa502, scale = 1.0, soundType = null) {
    spawnEnhancedExplosion(pos, color, scale, scale >= 2.2, soundType);
}

function spawnHeavyExplosion(pos, isToxin = false) {
    spawnEnhancedExplosion(pos, isToxin ? 0x2ed573 : 0xff4757, 2.2, true, isToxin ? 'anthrax_blast' : 'expl_artillery');
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
    if (!fromPos || !toPos || typeof scene === 'undefined') return;
    const fireTex = _getFxSpriteTex('fireball');
    const steps = 9;
    spawnMuzzleFlash(fromPos, 0xffdd55, 0.72);
    for (let i = 0; i < steps; i++) {
        const alpha = (i + 1) / steps;
        const pos = new THREE.Vector3().lerpVectors(fromPos, toPos, alpha);
        setTimeout(() => {
            if (typeof scene === 'undefined') return;
            // Rolling incandescent fireball jet (white-yellow -> vivid orange -> deep red)
            if (fireTex && activeFX.length < 330) {
                const col = alpha < 0.3 ? 0xffe066 : (alpha < 0.7 ? 0xff7722 : 0xe83b12);
                const mat = new THREE.SpriteMaterial({
                    map: fireTex,
                    color: col,
                    transparent: true,
                    opacity: 0.95,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                });
                const sp = new THREE.Sprite(mat);
                const s0 = (0.75 + alpha * 1.65);
                sp.scale.set(s0, s0, s0);
                sp.position.set(
                    pos.x + (Math.random() - 0.5) * (0.3 + alpha * 0.9),
                    pos.y + 0.1 + alpha * 0.3,
                    pos.z + (Math.random() - 0.5) * (0.3 + alpha * 0.9)
                );
                scene.add(sp);
                let life = 16 + Math.floor(alpha * 8);
                const maxLife = life;
                activeFX.push({
                    mesh: sp,
                    life,
                    update() {
                        life--;
                        const prog = 1 - life / maxLife;
                        const s = s0 * (1 + prog * 1.15);
                        sp.scale.set(s, s, s);
                        sp.position.y += 0.045;
                        mat.opacity = Math.max(0, (1 - prog) * 0.95);
                        if (life <= 0) {
                            scene.remove(sp);
                            mat.dispose();
                            return false;
                        }
                        return true;
                    }
                });
            } else {
                spawnSmokePuff(pos, 0xff6b35, 0.4 + alpha * 0.6);
            }
            // Rising dark soot smoke off the flame tail
            if (i >= 4 && i % 2 === 0) {
                spawnSmokePuff({ x: pos.x, y: pos.y + 0.45, z: pos.z }, 0x26282e, 0.38 + alpha * 0.35);
            }
            if (i === steps - 1) {
                spawnSparks(toPos, 0xffaa22, 5);
                if (Math.random() < 0.45) spawnNapalmScorchPool(toPos);
            }
        }, i * 28);
    }
}

function spawnToxinSprayBurst(fromPos, toPos) {
    if (!fromPos || !toPos || typeof scene === 'undefined') return;
    const smokeTex = _getFxSpriteTex('smoke');
    const steps = 8;
    spawnMuzzleFlash(fromPos, 0x7bed9f, 0.52);
    for (let i = 0; i < steps; i++) {
        const alpha = (i + 1) / steps;
        const pos = new THREE.Vector3().lerpVectors(fromPos, toPos, alpha);
        setTimeout(() => {
            if (typeof scene === 'undefined') return;
            const col = alpha < 0.45 ? 0x7bed9f : 0x2ed573;
            if (smokeTex && activeFX.length < 330) {
                const mat = new THREE.SpriteMaterial({
                    map: smokeTex,
                    color: col,
                    transparent: true,
                    opacity: 0.82,
                    depthWrite: false
                });
                const sp = new THREE.Sprite(mat);
                const s0 = 0.75 + alpha * 1.55;
                sp.scale.set(s0, s0, s0);
                sp.position.set(
                    pos.x + (Math.random() - 0.5) * (0.25 + alpha * 0.85),
                    pos.y + 0.08,
                    pos.z + (Math.random() - 0.5) * (0.25 + alpha * 0.85)
                );
                scene.add(sp);
                let life = 24 + Math.floor(alpha * 10);
                const maxLife = life;
                activeFX.push({
                    mesh: sp,
                    life,
                    update() {
                        life--;
                        const prog = 1 - life / maxLife;
                        const s = s0 * (1 + prog * 1.35);
                        sp.scale.set(s, s, s);
                        sp.position.y += 0.018;
                        mat.opacity = Math.max(0, (1 - prog) * 0.8);
                        if (life <= 0) {
                            scene.remove(sp);
                            mat.dispose();
                            return false;
                        }
                        return true;
                    }
                });
            } else {
                spawnSmokePuff(pos, col, 0.35 + alpha * 0.5);
            }
            if (i === steps - 1) {
                spawnSparks(toPos, 0x7bed9f, 4);
                if (Math.random() < 0.45) spawnLingeringToxinCloud(toPos);
            }
        }, i * 32);
    }
}

// Aurora Hypersonic Fuel-Air Bomb Detonation (Gigantic double shockwave + scorched crater)
function spawnFuelAirExplosion(pos, soundType = 'aurora_bomb') {
    if (soundType !== 'none') {
        playUSASound(soundType, { pos });
    }

    // 1. Massive expanding fireball
    spawnEnhancedExplosion(pos, 0xff793f, 3.2, true, 'none');

    // 2. Extra wide secondary supersonic shockwave ring
    const ringGeo = new THREE.RingGeometry(1.0, 3.5, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00d2d3, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(pos.x, getTerrainHeight(pos.x, pos.z) + 0.1, pos.z);
    scene.add(ring);

    // 3. Persistent scorched blast crater
    spawnCraterDecal(pos, 4.5, 520, 'flame');

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
    if (typeof playOfficialSound === 'function') playOfficialSound('sfx_particle_charge', 0.85);
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

    // Ground impact radial blue plasma glow halo (matches official ParticleCannonUplink_HitFlare)
    let glowTex = null;
    if (typeof document !== 'undefined' && document.createElement) {
        const gCan = document.createElement('canvas');
        gCan.width = gCan.height = 128;
        const gCtx = gCan.getContext('2d');
        if (gCtx) {
            const grad = gCtx.createRadialGradient(64, 64, 2, 64, 64, 64);
            grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
            grad.addColorStop(0.22, 'rgba(110, 235, 255, 0.95)');
            grad.addColorStop(0.55, 'rgba(0, 145, 255, 0.55)');
            grad.addColorStop(1.0, 'rgba(0, 80, 255, 0.0)');
            gCtx.fillStyle = grad;
            gCtx.fillRect(0, 0, 128, 128);
            glowTex = new THREE.CanvasTexture(gCan);
        }
    }
    const flareGeo = new THREE.PlaneGeometry(52, 52);
    flareGeo.rotateX(-Math.PI / 2);
    const flareMat = new THREE.MeshBasicMaterial({
        color: 0x1ec8ff,
        map: glowTex,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
        ...addBlend
    });
    const flareDisc = new THREE.Mesh(flareGeo, flareMat);
    flareDisc.position.y = 0.65;
    flareDisc.renderOrder = 10;
    group.add(flareDisc);

    // Big blue atmospheric plasma bloom dome around impact base
    const domeGeo = new THREE.SphereGeometry(8.5, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const domeMat = new THREE.MeshBasicMaterial({
        color: 0x00b8ff,
        transparent: true,
        opacity: 0.36,
        side: THREE.DoubleSide,
        depthWrite: false,
        ...addBlend
    });
    const plasmaDome = new THREE.Mesh(domeGeo, domeMat);
    plasmaDome.position.y = 0.3;
    plasmaDome.scale.set(1.3, 1.8, 1.3);
    plasmaDome.renderOrder = 9;
    group.add(plasmaDome);

    const impactCoreGeo = new THREE.CircleGeometry(4.0, 20);
    impactCoreGeo.rotateX(-Math.PI / 2);
    const impactCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, depthTest: false, ...addBlend });
    const impactCore = new THREE.Mesh(impactCoreGeo, impactCoreMat);
    impactCore.position.y = 0.72;
    impactCore.renderOrder = 11;
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
                plasmaDome.scale.set(1.3 + Math.sin(life * 0.45) * 0.18, 1.8 + Math.cos(life * 0.55) * 0.25, 1.3 + Math.sin(life * 0.45) * 0.18);
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
                    if (typeof revealFogOfWarAt === 'function') revealFogOfWarAt(group.position, 24, 90);
                    const swGeo = new THREE.RingGeometry(1.6, 3.0, 24);
                    swGeo.rotateX(-Math.PI / 2);
                    const swMat = new THREE.MeshBasicMaterial({ color: 0x48dbfb, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, depthTest: false, ...addBlend });
                    const sw = new THREE.Mesh(swGeo, swMat);
                    sw.position.set(group.position.x, group.position.y + 0.75, group.position.z);
                    sw.renderOrder = 10;
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
                        spawnCraterDecal(beamPos, 2.6, 360, 'ion');
                    }
                }
                if (life % 14 === 0) {
                    spawnParticleFirePatch(group.position);
                    if (life % 70 === 0 && typeof playAudio === 'function') playAudio('particle_annihilate', { volume: 0.72 });
                }

                if (life <= 0) {
                    window.activeParticleCannonTarget = null;
                    window.activeParticleCannonPlayerOwned = false;
                    window.activeParticleCannonControl = false;
                    if (isPlayerOwned) setParticleBeamCursor(false);
                    scene.remove(group);
                    if (glowTex && typeof glowTex.dispose === 'function') glowTex.dispose();
                    group.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
                    if (uplinkGroup) {
                        scene.remove(uplinkGroup);
                        uplinkGroup.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
                    }
                    spawnEnhancedExplosion(group.position, 0x00d2d3, 3.0, true, 'particle_annihilate');
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
    playAudio('nuke_doors', { volume: 0.85 }, 'china');
    setTimeout(() => { if (typeof playAudio === 'function') playAudio('nuke_launch', { volume: 0.9 }, 'china'); }, 280);

    // Target Warning Hazard Reticle on the Ground
    const warnGroup = new THREE.Group();
    const tGroundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(targetPos.x, targetPos.z) : 0;
    warnGroup.position.set(targetPos.x, tGroundY + 0.5, targetPos.z);
    const warnRing = new THREE.Mesh(
        new THREE.RingGeometry(2.5, 3.2, 32),
        new THREE.MeshBasicMaterial({ color: 0xff2222, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false })
    );
    warnRing.rotation.x = -Math.PI / 2;
    warnRing.renderOrder = 10;
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
                        if (typeof playAudio === 'function') playAudio('shell_whistle', { volume: 0.85 });
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
                        if (typeof revealFogOfWarAt === 'function') revealFogOfWarAt(targetPos, 34, 420);
                        if (typeof triggerScreenShake === 'function') triggerScreenShake(2.4);
                        spawnMushroomCloud(targetPos);
                        // Lingering Nuclear Radiation Pool
                        const radGroundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(targetPos.x, targetPos.z) : 0;
                        const radPool = new THREE.Mesh(
                            new THREE.CircleGeometry(14, 24),
                            new THREE.MeshBasicMaterial({ color: 0x39ff14, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false, depthTest: false })
                        );
                        radPool.rotation.x = -Math.PI / 2;
                        radPool.position.set(targetPos.x, radGroundY + 0.45, targetPos.z);
                        radPool.renderOrder = 9;
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
    spawnCraterDecal(pos, 8.0 * scaleMult, 900, 'nuke');
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
                if (i % 2 === 0 && typeof playAudio === 'function') playAudio('scud_launch', { volume: 0.72 }, 'gla');
                spawnRocketProjectile(launchOrigin, subTarget, true, true, {
                    onImpact: (impactPos) => {
                        playAudio('scud_detonation');
                        setTimeout(() => { if (typeof playAudio === 'function') playAudio('anthrax_hiss', { volume: 0.65 }, 'gla'); }, 220);
                        if (typeof revealFogOfWarAt === 'function') revealFogOfWarAt(impactPos, 22, 300);
                        if (typeof triggerScreenShake === 'function') triggerScreenShake(0.95);
                        if (typeof spawnEnhancedExplosion === 'function') spawnEnhancedExplosion(impactPos, 0x2ecc71, 3.2, true, 'none');
                        enemyUnits.forEach(enemy => {
                            if (enemy.health > 0 && enemy.mesh && enemy.mesh.position.distanceTo(impactPos) <= 11.5) {
                                if (typeof applyCalculatedDamage === 'function') {
                                    applyCalculatedDamage(null, enemy, 165, 'EXPLOSIVE');
                                } else {
                                    enemy.health -= 165;
                                }
                            }
                        });
                        enemyStructures.forEach(struct => {
                            if (struct.health > 0 && struct.position && struct.position.distanceTo(impactPos) <= 13.5) {
                                if (typeof applyCalculatedDamage === 'function') {
                                    applyCalculatedDamage(null, struct, 195, 'EXPLOSIVE');
                                } else {
                                    struct.health -= 195;
                                }
                            }
                        });
                        spawnCraterDecal(impactPos, 3.6, 520, 'toxin');
                    }
                });
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

// Authentic C&C Generals Tactical Ground Waypoint Markers (Move / Attack / Garrison / Rally)
function spawnWaypointMarker(pos, orderType = 'move') {
    if (!pos || typeof scene === 'undefined') return;
    const group = new THREE.Group();
    const yPos = typeof getTerrainHeight === 'function' ? getTerrainHeight(pos.x, pos.z) + 0.22 : (pos.y || 0) + 0.22;
    group.position.set(pos.x, yPos, pos.z);

    const isAttack = (orderType === 'attack' || orderType === 'attackMove');
    const isRally = (orderType === 'rally');
    const isGarrison = (orderType === 'garrison');
    const color = isAttack ? 0xff2a2a : isRally ? 0xf1c40f : isGarrison ? 0x2ecc71 : 0x38ff5a;

    // 1. Primary ground ring (shrinks inward for Move/Garrison like Generals; pulses for Attack)
    const ringGeo = new THREE.RingGeometry(0.85, 1.35, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    if (isGarrison) ringMesh.scale.setScalar(2.4);
    else if (!isAttack) ringMesh.scale.setScalar(1.65);
    group.add(ringMesh);

    // 2. Crisp ground chevron / crosshair brackets
    const pts = isAttack
        ? [
            new THREE.Vector3(-1.7, 0.05, 0), new THREE.Vector3(-0.7, 0.05, 0),
            new THREE.Vector3(0.7, 0.05, 0), new THREE.Vector3(1.7, 0.05, 0),
            new THREE.Vector3(0, 0.05, -1.7), new THREE.Vector3(0, 0.05, -0.7),
            new THREE.Vector3(0, 0.05, 0.7), new THREE.Vector3(0, 0.05, 1.7)
        ]
        : [
            new THREE.Vector3(-1.3, 0.05, -0.4), new THREE.Vector3(-1.3, 0.05, -1.3),
            new THREE.Vector3(-1.3, 0.05, -1.3), new THREE.Vector3(-0.4, 0.05, -1.3),
            new THREE.Vector3(1.3, 0.05, 0.4), new THREE.Vector3(1.3, 0.05, 1.3),
            new THREE.Vector3(1.3, 0.05, 1.3), new THREE.Vector3(0.4, 0.05, 1.3),
            new THREE.Vector3(-1.3, 0.05, 0.4), new THREE.Vector3(-1.3, 0.05, 1.3),
            new THREE.Vector3(-1.3, 0.05, 1.3), new THREE.Vector3(-0.4, 0.05, 1.3),
            new THREE.Vector3(1.3, 0.05, -0.4), new THREE.Vector3(1.3, 0.05, -1.3),
            new THREE.Vector3(1.3, 0.05, -1.3), new THREE.Vector3(0.4, 0.05, -1.3)
        ];
    const tickGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const tickMat = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.92 });
    const crosshair = new THREE.LineSegments(tickGeo, tickMat);
    group.add(crosshair);

    // 3. Only Rally markers keep a short golden tactical pole; Move/Attack stay low-profile on the terrain
    let beamMesh = null, beamGeo = null, beamMat = null;
    if (isRally) {
        beamGeo = new THREE.CylinderGeometry(0.10, 0.24, 7.5, 10, 1, true);
        beamMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false });
        beamMesh = new THREE.Mesh(beamGeo, beamMat);
        beamMesh.position.y = 3.75;
        group.add(beamMesh);
    }

    scene.add(group);

    let life = 0;
    const maxLife = isAttack ? 34 : 30;
    activeFX.push({
        update() {
            life++;
            const t = life / maxLife;
            if (isAttack) {
                ringMesh.scale.setScalar(1.0 + Math.sin(life * 0.45) * 0.25 + t * 0.4);
            } else if (isGarrison) {
                const s = 2.4 * (1 - t * 0.55);
                ringMesh.scale.set(s, s, 1);
            } else {
                const s = Math.max(0.35, 1.65 * (1 - t * 0.72));
                ringMesh.scale.set(s, s, 1);
                crosshair.scale.setScalar(Math.max(0.4, 1.15 - t * 0.65));
            }
            ringMat.opacity = Math.max(0, 0.95 * (1.0 - t));
            tickMat.opacity = Math.max(0, 0.92 * (1.0 - t));
            if (beamMat) beamMat.opacity = Math.max(0, 0.65 * (1.0 - t));

            if (life >= maxLife) {
                scene.remove(group);
                ringGeo.dispose();
                ringMat.dispose();
                tickGeo.dispose();
                tickMat.dispose();
                if (beamGeo) beamGeo.dispose();
                if (beamMat) beamMat.dispose();
                return false;
            }
            return true;
        }
    });
}

// =========================================================================
// USA SUPPLY DROP ZONE: C-130 HERCULES CRATE DELIVERY ($1,500 / $1,650)
// =========================================================================
function createC130FlyoverPlane(modelKey = 'c130') {
    let plane = null;
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA[modelKey]) {
        plane = createW3DVehicleMesh(modelKey, false);
    } else {
        plane = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({ color: modelKey === 'china_bomber' ? 0x556b2f : 0x6c7a89, roughness: 0.55, metalness: 0.35 });
        const wingMat = new THREE.MeshStandardMaterial({ color: modelKey === 'china_bomber' ? 0x455a24 : 0x56616e, roughness: 0.6, metalness: 0.3 });
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
            if (c.isMesh) c.castShadow = true;
            if (c.name && c.name.toUpperCase().startsWith('PROPELLER')) c130Props.push(c);
    });
    return { plane, c130Props };
}

function triggerSupplyDropZoneDelivery(structure) {
    if (!structure || !structure.position || structure.health <= 0 || structure.isBuilding) return;
    const dropCenter = structure.position.clone();
    const groundY = (typeof getTerrainHeight === 'function') ? getTerrainHeight(dropCenter.x, dropCenter.z) : 0;

    // 1. Official W3D C-130 Hercules Flyover Mesh (AvCargoPln.W3D)
    const { plane, c130Props } = createC130FlyoverPlane('c130');

    const flightY = groundY + 16.5;
    const startPos = new THREE.Vector3(dropCenter.x - 95, flightY, dropCenter.z - 45);
    const endPos = new THREE.Vector3(dropCenter.x + 95, flightY, dropCenter.z + 45);
    plane.position.copy(startPos);
    if (typeof plane.lookAt === 'function') plane.lookAt(endPos);
    scene.add(plane);

    if (typeof window !== 'undefined') {
        if (!window.activeSupplyPlanes) window.activeSupplyPlanes = [];
    }
    const dirLen = Math.hypot(endPos.x - startPos.x, endPos.z - startPos.z) || 1;
    const planeTracker = { mesh: plane, dirX: (endPos.x - startPos.x) / dirLen, dirZ: (endPos.z - startPos.z) / dirLen };
    if (typeof window !== 'undefined') window.activeSupplyPlanes.push(planeTracker);

    if (typeof playAudio === 'function') playAudio('c130_flyover', { volume: 0.7 }, 'usa');
    if (typeof showNotification === 'function') showNotification('✈ C-130 Supply Drop inbound!', 'info');

    let planeTick = 0;
    const planeDuration = 420;
    let crateDropped = false;

    // 2. Parachute Supply Crate
    function spawnParachuteCrate(offsetX = 0, offsetZ = 0, valuePerCrate = 500) {
        const offX = offsetX + (Math.random() - 0.5) * 1.4;
        const offZ = offsetZ + (Math.random() - 0.5) * 1.4;
        const landX = dropCenter.x + offX;
        const landZ = dropCenter.z + offZ;
        const landY = (typeof getTerrainHeight === 'function') ? getTerrainHeight(landX, landZ) : groundY;
        if (typeof playAudio === 'function') playAudio('parachute_open', { volume: 0.7 }, 'usa');

        const crateGrp = new THREE.Group();
        let proceduralBox = null, proceduralStrap = null, boxMat = null, strapMat = null;
        if (typeof createW3DBuildingMesh === 'function' && window.W3D_BUILDING_DATA && window.W3D_BUILDING_DATA['supply_drop_crate']) {
            const w3dCrate = createW3DBuildingMesh('supply_drop_crate', false);
            crateGrp.add(w3dCrate);
        } else {
            boxMat = new THREE.MeshStandardMaterial({ color: 0x3b4e6b, roughness: 0.7 });
            strapMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.4 });
            proceduralBox = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), boxMat);
            proceduralBox.position.y = 0.6;
            proceduralStrap = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.24, 1.68), strapMat);
            proceduralStrap.position.y = 0.6;
            crateGrp.add(proceduralBox, proceduralStrap);
        }
        const chuteTex = (typeof getW3dTexture === 'function') ? getW3dTexture('parachute') : null;
        const chuteGeo = new THREE.SphereGeometry(2.0, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
        const chuteMat = new THREE.MeshStandardMaterial({
            ...(chuteTex ? { map: chuteTex } : {}),
            color: chuteTex ? 0xffffff : 0xe8e4d4,
            roughness: 0.85,
            side: THREE.DoubleSide,
            alphaTest: 0.25
        });
        const chute = new THREE.Mesh(chuteGeo, chuteMat);
        chute.position.y = 3.2;
        crateGrp.add(chute);

        const cordGeo = new THREE.CylinderGeometry(0.025, 0.025, 3.0, 4);
        const cordMat = new THREE.MeshBasicMaterial({ color: 0xdedad0 });
        const cords = [];
        [[1.35, 0], [-1.35, 0], [0, 1.35], [0, -1.35]].forEach(([cx, cz]) => {
            const cord = new THREE.Mesh(cordGeo, cordMat);
            cord.position.set(cx * 0.5, 2.0, cz * 0.5);
            if (cx) cord.rotation.z = cx > 0 ? -0.44 : 0.44;
            if (cz) cord.rotation.x = cz > 0 ? 0.44 : -0.44;
            crateGrp.add(cord);
            cords.push(cord);
        });

        crateGrp.position.set(landX, flightY - 1.2, landZ);
        scene.add(crateGrp);

        function disposeCrate() {
            scene.remove(crateGrp);
            chuteGeo.dispose();
            chuteMat.dispose();
            cordGeo.dispose();
            cordMat.dispose();
            if (proceduralBox) proceduralBox.geometry.dispose();
            if (proceduralStrap) proceduralStrap.geometry.dispose();
            if (boxMat) boxMat.dispose();
            if (strapMat) strapMat.dispose();
        }

        let landed = false;
        let groundTicks = 0;
        let lifeTicks = 0;

        activeFX.push({
                update() {
                    lifeTicks++;
                    if (!landed) {
                        crateGrp.position.y -= 0.22;
                        crateGrp.rotation.y += 0.02;
                        if (crateGrp.position.y <= landY + 0.05) {
                            crateGrp.position.y = landY + 0.05;
                            landed = true;
                            chute.visible = false;
                            for (let ci = 0; ci < cords.length; ci++) cords[ci].visible = false;
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
                            disposeCrate();
                            return false;
                        }
                    }

                    // Collect immediately if a friendly unit touches it, or after ~4s (240 ticks) uncontested on the drop pad
                    const friendlyTouch = (typeof units !== 'undefined') && units.some(u => u.health > 0 && u.mesh && Math.hypot(u.mesh.position.x - landX, u.mesh.position.z - landZ) < 4.5);
                    if (friendlyTouch || groundTicks >= 240) {
                        const bonus = valuePerCrate;
                        if (typeof playerResources !== 'undefined') {
                            playerResources += bonus;
                            const resEl = (typeof document !== 'undefined') ? document.getElementById('resource-display') : null;
                            if (resEl) resEl.innerText = `$${playerResources}`;
                        }
                        if (typeof spawnMuzzleFlash === 'function') spawnMuzzleFlash(crateGrp.position, 0x2ecc71, 2.0);
                        if (typeof spawnFloatingCashNumber === 'function') spawnFloatingCashNumber(crateGrp.position.clone().add(new THREE.Vector3(0, 1.5, 0)), bonus);
                        if (typeof showNotification === 'function') showNotification(`📦 C-130 Supply Drop collected: +$${bonus}!`, 'success');
                        disposeCrate();
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
                if (!crateDropped && t >= 0.44) {
                    crateDropped = true;
                    const hasSupplyLines = (typeof researchedTechs !== 'undefined' && researchedTechs.has('supplyLines'));
                    const perCrateVal = hasSupplyLines ? 550 : 500;
                    const dropOffsets = [[0, 0], [-2.3, -1.9], [2.3, -1.9]];
                    dropOffsets.forEach(([ox, oz], ci) => {
                        if (ci === 0) spawnParachuteCrate(ox, oz, perCrateVal);
                        else setTimeout(() => { if (typeof scene !== 'undefined') spawnParachuteCrate(ox, oz, perCrateVal); }, ci * 260);
                    });
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

    const { plane, c130Props } = createC130FlyoverPlane('c130');
    const flightY = groundY + 16.5;
    const startPos = new THREE.Vector3(dropCenter.x - 95, flightY, dropCenter.z - 45);
    const endPos = new THREE.Vector3(dropCenter.x + 95, flightY, dropCenter.z + 45);
    plane.position.copy(startPos);
    if (typeof plane.lookAt === 'function') plane.lookAt(endPos);
    scene.add(plane);
    if (typeof playAudio === 'function') playAudio('c130_flyover', { volume: 0.75 }, 'usa');

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
    const totalFrames = 380;
    let dropped = false;
    activeFX.push({
        update() {
            frame++;
            const t = frame / totalFrames;
            plane.position.lerpVectors(startPos, endPos, t);
            for (let p = 0; p < c130Props.length; p++) c130Props[p].rotation.z += 0.75;

            if (!dropped && t >= 0.5) {
                dropped = true;
                if (typeof playAudio === 'function') playAudio('parachute_open', { volume: 0.75 }, 'usa');
                for (let i = 0; i < 4; i++) {
                    const rPos = dropCenter.clone().add(new THREE.Vector3((Math.random() - 0.5) * 7, 0, (Math.random() - 0.5) * 7));
                    const rGround = typeof getTerrainHeight === 'function' ? getTerrainHeight(rPos.x, rPos.z) : groundY;
                    const chuteMat = new THREE.MeshBasicMaterial({ color: 0xe8e2cf, side: THREE.DoubleSide });
                    const chute = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), chuteMat);
                    chute.position.set(rPos.x, flightY - 1.2, rPos.z);
                    scene.add(chute);
                    let dropTick = 0;
                    activeFX.push({
                        update() {
                            dropTick++;
                            const dt = Math.min(1, dropTick / 65);
                            chute.position.y = (flightY - 1.2) * (1 - dt) + (rGround + 0.8) * dt;
                            if (dt < 1) return true;
                            scene.remove(chute);
                            chute.geometry.dispose();
                            chuteMat.dispose();
                            if (typeof spawnUnit === 'function') spawnUnit('infantry', rPos);
                            return false;
                        }
                    });
                }
                if (typeof spawnSmokePuff === 'function') spawnSmokePuff(dropCenter, 0xdddddd);
            }

            if (frame < totalFrames) return true;
            planeTracker.alive = false;
            if (typeof window !== 'undefined' && Array.isArray(window.activeSupplyPlanes)) {
                const idx = window.activeSupplyPlanes.indexOf(planeTracker);
                if (idx !== -1) window.activeSupplyPlanes.splice(idx, 1);
            }
            scene.remove(plane);
            return false;
        }
    });
}
window.triggerC130Paradrop = triggerC130Paradrop;

function triggerC130FuelAirBomb(targetPos, pseudoAttacker) {
    if (!targetPos || !scene) return;
    const dropCenter = targetPos.clone();
    const groundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(dropCenter.x, dropCenter.z) : 0;

    const { plane, c130Props } = createC130FlyoverPlane('c130');
    const flightY = groundY + 18.0;
    const startPos = new THREE.Vector3(dropCenter.x - 100, flightY, dropCenter.z - 42);
    const endPos = new THREE.Vector3(dropCenter.x + 100, flightY, dropCenter.z + 42);
    plane.position.copy(startPos);
    if (typeof plane.lookAt === 'function') plane.lookAt(endPos);
    scene.add(plane);
    if (typeof playAudio === 'function') playAudio('c130_flyover', { volume: 0.78 }, 'usa');

    const dirLen = Math.hypot(endPos.x - startPos.x, endPos.z - startPos.z) || 1;
    const planeTracker = { mesh: plane, dirX: (endPos.x - startPos.x) / dirLen, dirZ: (endPos.z - startPos.z) / dirLen };
    if (typeof window !== 'undefined') {
        if (!window.activeSupplyPlanes) window.activeSupplyPlanes = [];
        window.activeSupplyPlanes.push(planeTracker);
    }

    let frame = 0;
    const totalFrames = 320;
    let dropped = false;

    activeFX.push({
        update() {
            frame++;
            const t = frame / totalFrames;
            plane.position.lerpVectors(startPos, endPos, t);
            for (let p = 0; p < c130Props.length; p++) c130Props[p].rotation.z += 0.8;

            if (!dropped && t >= 0.5) {
                dropped = true;
                if (typeof playAudio === 'function') playAudio('daisycutter_drop', { volume: 0.9 }, 'usa');
                const canisterGrp = new THREE.Group();
                const canisterMat = new THREE.MeshStandardMaterial({ color: 0x3b4d36, roughness: 0.45, metalness: 0.5 });
                const canister = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.1, 10), canisterMat);
                const chuteMat = new THREE.MeshBasicMaterial({ color: 0xf1ede0, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
                const chute = new THREE.Mesh(new THREE.ConeGeometry(2.0, 1.6, 8, 1, true), chuteMat);
                chute.position.y = 2.4;
                canisterGrp.add(canister, chute);
                canisterGrp.position.set(dropCenter.x, flightY - 1.2, dropCenter.z);
                scene.add(canisterGrp);

                let dropTick = 0;
                activeFX.push({
                    update() {
                        dropTick++;
                        const dt = Math.min(1, dropTick / 68);
                        canisterGrp.position.y = (flightY - 1.2) * (1 - dt) + (groundY + 0.6) * dt;
                        canisterGrp.rotation.y += 0.03;
                        if (dt < 1) return true;
                        scene.remove(canisterGrp);
                        canister.geometry.dispose();
                        canisterMat.dispose();
                        chute.geometry.dispose();
                        chuteMat.dispose();
                        if (typeof playAudio === 'function') playAudio('daisycutter_blast', { volume: 0.98 }, 'usa');
                        if (typeof triggerScreenShake === 'function') triggerScreenShake(1.4);
                        if (typeof spawnFuelAirExplosion === 'function') spawnFuelAirExplosion(dropCenter, 'none');
                        else if (typeof spawnEnhancedExplosion === 'function') spawnEnhancedExplosion(dropCenter, 0xff7f50, 6.5, true, 'none');
                        if (typeof spawnCraterDecal === 'function') spawnCraterDecal(dropCenter, 6.0, 600);
                        if (typeof damageHostilesInRadius === 'function') damageHostilesInRadius(dropCenter, 22.0, 650, 'EXPLOSIVE', pseudoAttacker);
                        return false;
                    }
                });
            }

            if (frame < totalFrames) return true;
            if (typeof window !== 'undefined' && Array.isArray(window.activeSupplyPlanes)) {
                const idx = window.activeSupplyPlanes.indexOf(planeTracker);
                if (idx !== -1) window.activeSupplyPlanes.splice(idx, 1);
            }
            scene.remove(plane);
            return false;
        }
    });
}
window.triggerC130FuelAirBomb = triggerC130FuelAirBomb;

function triggerSpectreGunship(targetPos, pseudoAttacker) {
    if (!targetPos || !scene) return;
    const dropCenter = targetPos.clone();
    const groundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(dropCenter.x, dropCenter.z) : 0;
    const { plane, c130Props } = createC130FlyoverPlane('c130');
    const flightY = groundY + 18.0;
    const orbitRadius = 22.0;
    let angle = -Math.PI * 0.6;
    const angularSpeed = 0.016;
    const totalFrames = 600;
    let frame = 0;

    plane.position.set(dropCenter.x + Math.cos(angle) * orbitRadius, flightY, dropCenter.z + Math.sin(angle) * orbitRadius);
    scene.add(plane);
    if (typeof playAudio === 'function') playAudio('c130_flyover', { volume: 0.7 }, 'usa');

    // Ground targeting ring while AC-130 Spectre circles overhead
    const ringGeo = new THREE.RingGeometry(13.2, 14.0, 36);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff3f34, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
    const targetRing = new THREE.Mesh(ringGeo, ringMat);
    targetRing.position.set(dropCenter.x, groundY + 0.25, dropCenter.z);
    scene.add(targetRing);

    const planeTracker = { mesh: plane, dirX: -Math.sin(angle), dirZ: Math.cos(angle) };
    if (typeof window !== 'undefined') {
        if (!window.activeSupplyPlanes) window.activeSupplyPlanes = [];
        window.activeSupplyPlanes.push(planeTracker);
    }

    activeFX.push({
        update() {
            frame++;
            angle += angularSpeed;
            const px = dropCenter.x + Math.cos(angle) * orbitRadius;
            const pz = dropCenter.z + Math.sin(angle) * orbitRadius;
            const nx = dropCenter.x + Math.cos(angle + 0.05) * orbitRadius;
            const nz = dropCenter.z + Math.sin(angle + 0.05) * orbitRadius;
            plane.position.set(px, flightY, pz);
            if (typeof plane.lookAt === 'function') plane.lookAt(nx, flightY, nz);
            plane.rotateZ(0.28); // Bank inward toward target circle like official AC-130 Spectre
            planeTracker.dirX = -Math.sin(angle);
            planeTracker.dirZ = Math.cos(angle);
            for (let p = 0; p < c130Props.length; p++) c130Props[p].rotation.z += 0.75;
            ringMat.opacity = 0.28 + 0.22 * Math.sin(frame * 0.14);

            // Rapid 25mm Gatling cannon strafe bursts
            if (frame % 12 === 0 && frame <= 540) {
                const strafePt = dropCenter.clone().add(new THREE.Vector3((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 16));
                strafePt.y = typeof getTerrainHeight === 'function' ? getTerrainHeight(strafePt.x, strafePt.z) : groundY;
                if (typeof spawnBulletTracer === 'function') spawnBulletTracer(plane.position.clone(), strafePt, 0xffd32a, 2.8);
                if (typeof spawnSparks === 'function') spawnSparks(strafePt, 0xffbe76, 6);
                if (frame % 24 === 0 && typeof playAudio === 'function') playAudio('spectre_gatling', { volume: 0.75 }, 'usa');
                if (typeof damageHostilesInRadius === 'function') damageHostilesInRadius(strafePt, 4.0, 28, 'GATLING', pseudoAttacker);
            }

            // Heavy 105mm Howitzer shells
            if (frame % 56 === 28 && frame <= 520) {
                const scatter = dropCenter.clone().add(new THREE.Vector3((Math.random() - 0.5) * 14, 0, (Math.random() - 0.5) * 14));
                scatter.y = typeof getTerrainHeight === 'function' ? getTerrainHeight(scatter.x, scatter.z) : groundY;
                if (typeof spawnBulletTracer === 'function') spawnBulletTracer(plane.position.clone(), scatter, 0xffbe76, 5);
                if (typeof spawnEnhancedExplosion === 'function') spawnEnhancedExplosion(scatter, 0xff9f43, 2.6, true, 'none');
                if (typeof playAudio === 'function') playAudio('spectre_howitzer', { volume: 0.9 }, 'usa');
                if (typeof damageHostilesInRadius === 'function') damageHostilesInRadius(scatter, 7.5, 130, 'EXPLOSIVE', pseudoAttacker);
            }

            if (frame < totalFrames) return true;
            if (typeof window !== 'undefined' && Array.isArray(window.activeSupplyPlanes)) {
                const idx = window.activeSupplyPlanes.indexOf(planeTracker);
                if (idx !== -1) window.activeSupplyPlanes.splice(idx, 1);
            }
            scene.remove(plane);
            scene.remove(targetRing);
            ringGeo.dispose();
            ringMat.dispose();
            return false;
        }
    });
}
window.triggerSpectreGunship = triggerSpectreGunship;

function triggerChinaCarpetBomber(targetPos, pseudoAttacker) {
    if (!targetPos || !scene) return;
    const dropCenter = targetPos.clone();
    const groundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(dropCenter.x, dropCenter.z) : 0;

    const { plane, c130Props } = createC130FlyoverPlane('china_bomber');
    const flightY = groundY + 18.0;
    const startPos = new THREE.Vector3(dropCenter.x - 95, flightY, dropCenter.z - 48);
    const endPos = new THREE.Vector3(dropCenter.x + 95, flightY, dropCenter.z + 48);
    plane.position.copy(startPos);
    if (typeof plane.lookAt === 'function') plane.lookAt(endPos);
    scene.add(plane);
    if (typeof playAudio === 'function') playAudio('c130_flyover', { volume: 0.78 }, 'china');

    const dirLen = Math.hypot(endPos.x - startPos.x, endPos.z - startPos.z) || 1;
    const planeTracker = { mesh: plane, dirX: (endPos.x - startPos.x) / dirLen, dirZ: (endPos.z - startPos.z) / dirLen };
    if (typeof window !== 'undefined') {
        if (!window.activeSupplyPlanes) window.activeSupplyPlanes = [];
        window.activeSupplyPlanes.push(planeTracker);
    }

    let frame = 0;
    const totalFrames = 260;
    const droppedIdx = new Set();

    activeFX.push({
        update() {
            frame++;
            const t = frame / totalFrames;
            plane.position.lerpVectors(startPos, endPos, t);
            for (let p = 0; p < c130Props.length; p++) c130Props[p].rotation.z += 0.8;

            for (let b = 0; b < 7; b++) {
                const triggerT = 0.36 + b * 0.045;
                if (!droppedIdx.has(b) && t >= triggerT) {
                    droppedIdx.add(b);
                    const dropOrigin = plane.position.clone();
                    const impactPos = dropCenter.clone().add(new THREE.Vector3((b - 3) * 5.2, 0, (b - 3) * 2.6));
                    impactPos.y = typeof getTerrainHeight === 'function' ? getTerrainHeight(impactPos.x, impactPos.z) : groundY;
                    let bTick = 0;
                    activeFX.push({
                        update() {
                            bTick++;
                            if (bTick < 22) return true;
                            if (typeof spawnEnhancedExplosion === 'function') spawnEnhancedExplosion(impactPos, 0xff6348, 3.8, true, 'none');
                            if (typeof spawnCraterDecal === 'function') spawnCraterDecal(impactPos, 3.2, 420);
                            if (typeof playAudio === 'function') playAudio('carpet_bomb', { volume: 0.85 }, 'china');
                            if (typeof damageHostilesInRadius === 'function') damageHostilesInRadius(impactPos, 6.5, 135, 'EXPLOSIVE', pseudoAttacker);
                            return false;
                        }
                    });
                    if (typeof spawnGuidedBomb === 'function') spawnGuidedBomb(dropOrigin, impactPos, false, false);
                }
            }

            if (frame < totalFrames) return true;
            if (typeof window !== 'undefined' && Array.isArray(window.activeSupplyPlanes)) {
                const idx = window.activeSupplyPlanes.indexOf(planeTracker);
                if (idx !== -1) window.activeSupplyPlanes.splice(idx, 1);
            }
            scene.remove(plane);
            return false;
        }
    });
}
window.triggerChinaCarpetBomber = triggerChinaCarpetBomber;

function spawnPingEffect(pos) {
    if (!pos || typeof scene === 'undefined' || typeof activeFX === 'undefined') return;
    const x = pos.x || 0, z = pos.z || 0;
    const y = (typeof getTerrainHeight === 'function') ? getTerrainHeight(x, z) + 0.35 : 0.35;

    if (typeof window !== 'undefined') {
        if (!Array.isArray(window.minimapAlertPings)) window.minimapAlertPings = [];
        window.minimapAlertPings.push({ x, z, life: 90, maxLife: 90, color: '#00f2fe' });
    }
    if (typeof playAudio === 'function') playAudio('rally_set', { volume: 0.78 });

    const ringGeo = new THREE.RingGeometry(1.0, 1.55, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(x, y, z);
    ring.renderOrder = 8;
    scene.add(ring);

    const ring2Geo = new THREE.RingGeometry(0.45, 0.8, 24);
    ring2Geo.rotateX(-Math.PI / 2);
    const ring2Mat = new THREE.MeshBasicMaterial({ color: 0xf1c40f, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.position.set(x, y + 0.05, z);
    ring2.renderOrder = 8;
    scene.add(ring2);

    const beamGeo = new THREE.CylinderGeometry(0.14, 0.32, 16, 12, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(x, y + 8, z);
    scene.add(beam);

    let life = 72;
    activeFX.push({
        life,
        update() {
            life--;
            const prog = 1 - life / 72;
            const pulse = prog % 0.5 * 2;
            ring.scale.setScalar(1 + pulse * 4.5);
            ringMat.opacity = (1 - prog) * (1 - pulse * 0.5) * 0.95;
            ring2.scale.setScalar(0.8 + prog * 6.0);
            ring2Mat.opacity = Math.max(0, (1 - prog) * 0.85);
            beamMat.opacity = Math.max(0, (1 - prog) * 0.6);
            if (life <= 0) {
                scene.remove(ring); ringGeo.dispose(); ringMat.dispose();
                scene.remove(ring2); ring2Geo.dispose(); ring2Mat.dispose();
                scene.remove(beam); beamGeo.dispose(); beamMat.dispose();
                return false;
            }
            return true;
        }
    });
}
window.spawnPingEffect = spawnPingEffect;

// =========================================================================
// GENERAL POWERS AUTHENTIC RETAIL VISUAL & AUDIO STRIKE TRIGGERS
// =========================================================================
function triggerA10Strike(targetPos, pseudoAttacker) {
    if (!targetPos || typeof scene === 'undefined') return;
    const target = targetPos.clone();
    const groundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(target.x, target.z) : 0;

    for (let i = 0; i < 2; i++) {
        setTimeout(() => {
            if (typeof scene === 'undefined') return;
            const latOffset = (i === 0 ? -4.5 : 4.5);
            const startPos = new THREE.Vector3(target.x - 105 + latOffset, groundY + 26, target.z - 105 - latOffset);
            const diveApex = new THREE.Vector3(target.x + latOffset * 0.6, groundY + 9.5, target.z - latOffset * 0.6);
            const exitPos = new THREE.Vector3(target.x + 110 + latOffset, groundY + 28, target.z + 110 - latOffset);

            let plane = null;
            if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['a10_warthog']) {
                plane = createW3DVehicleMesh('a10_warthog', false);
            } else {
                plane = new THREE.Group();
            }
            plane.position.copy(startPos);
            if (typeof plane.lookAt === 'function') plane.lookAt(diveApex);
            scene.add(plane);
            if (i === 0 && typeof playAudio === 'function') {
                playAudio('a10_dive', { volume: 0.92 }, 'usa');
                playAudio('a10_flyby', { volume: 0.72 }, 'usa');
            }

            let frame = 0;
            const totalFrames = 175;
            const firedMissiles = new Set();
            activeFX.push({
                update() {
                    frame++;
                    const t = frame / totalFrames;
                    if (t < 0.5) {
                        const dt = t * 2;
                        plane.position.lerpVectors(startPos, diveApex, dt);
                        if (typeof plane.lookAt === 'function') plane.lookAt(diveApex.x + 2, diveApex.y - 2, diveApex.z + 2);
                    } else {
                        const ct = (t - 0.5) * 2;
                        plane.position.lerpVectors(diveApex, exitPos, ct);
                        if (typeof plane.lookAt === 'function') plane.lookAt(exitPos);
                    }

                    if (frame % 4 === 0 && t > 0.15 && t < 0.85) {
                        spawnJetContrailPuff(plane.position.clone().add(new THREE.Vector3(-2.8, 0.2, 0)), false);
                        spawnJetContrailPuff(plane.position.clone().add(new THREE.Vector3(2.8, 0.2, 0)), false);
                    }

                    // 30mm GAU-8 Avenger cannon strafe during dive approach
                    if (t >= 0.24 && t <= 0.48 && frame % 4 === 0) {
                        const hitPt = target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 9, 0, (Math.random() - 0.5) * 9));
                        hitPt.y = typeof getTerrainHeight === 'function' ? getTerrainHeight(hitPt.x, hitPt.z) : groundY;
                        spawnBulletTracer(plane.position.clone(), hitPt, 0xffd32a, 3.0);
                        spawnSparks(hitPt, 0xffa502, 5);
                        if (frame % 8 === 0 && typeof playAudio === 'function') playAudio('gatling_fire', { volume: 0.65 }, 'usa');
                        if (typeof damageHostilesInRadius === 'function') damageHostilesInRadius(hitPt, 4.0, 26, 'GATLING', pseudoAttacker);
                    }

                    // Launch 3 Maverick AGM-65 missiles per A-10
                    [0.30, 0.37, 0.44].forEach((trigT, mIdx) => {
                        if (!firedMissiles.has(mIdx) && t >= trigT) {
                            firedMissiles.add(mIdx);
                            const impact = target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 9.5, 0, (Math.random() - 0.5) * 9.5));
                            impact.y = typeof getTerrainHeight === 'function' ? getTerrainHeight(impact.x, impact.z) : groundY;
                            if (typeof spawnRocketProjectile === 'function') {
                                spawnRocketProjectile(plane.position.clone(), impact, true, false, {
                                    attacker: pseudoAttacker,
                                    target: null,
                                    targetPos: impact,
                                    damage: 120,
                                    damageType: 'EXPLOSIVE',
                                    splashRadius: 6.5
                                });
                            }
                            if (typeof playAudio === 'function') playAudio('jet_missile', { volume: 0.78 }, 'usa');
                        }
                    });

                    if (frame < totalFrames) return true;
                    scene.remove(plane);
                    return false;
                }
            });
        }, i * 320);
    }
}

function triggerSpyDronePower(targetPos) {
    if (!targetPos || typeof scene === 'undefined') return;
    const center = targetPos.clone();
    const gY = typeof getTerrainHeight === 'function' ? getTerrainHeight(center.x, center.z) : 0;
    if (typeof playAudio === 'function') playAudio('spy_drone', { volume: 0.85 }, 'usa');

    let drone = null;
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['spy_drone']) {
        drone = createW3DVehicleMesh('spy_drone', false);
    } else {
        drone = new THREE.Group();
    }
    const prop = drone.getObjectByName ? (drone.getObjectByName('PROPELLER') || drone.getObjectByName('avspydrone.propeller')) : null;
    drone.position.set(center.x, gY + 18, center.z);
    scene.add(drone);

    const ringGeo = new THREE.RingGeometry(4.5, 5.2, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false });
    const scanRing = new THREE.Mesh(ringGeo, ringMat);
    scanRing.position.set(center.x, gY + 0.35, center.z);
    scene.add(scanRing);

    let life = 900;
    let angle = 0;
    activeFX.push({
        life,
        update() {
            life--;
            angle += 0.03;
            const ox = center.x + Math.cos(angle) * 6.5;
            const oz = center.z + Math.sin(angle) * 6.5;
            const nx = center.x + Math.cos(angle + 0.05) * 6.5;
            const nz = center.z + Math.sin(angle + 0.05) * 6.5;
            drone.position.set(ox, gY + 18 + Math.sin(angle * 2) * 0.5, oz);
            if (typeof drone.lookAt === 'function') drone.lookAt(nx, drone.position.y, nz);
            if (prop && prop.rotation) prop.rotation.z += 0.85;
            const pulse = 1 + ((900 - life) % 60) / 60 * 4.5;
            scanRing.scale.setScalar(pulse);
            ringMat.opacity = Math.max(0, 0.72 * (1 - ((900 - life) % 60) / 60));
            if (life <= 0) {
                scene.remove(drone);
                scene.remove(scanRing);
                ringGeo.dispose();
                ringMat.dispose();
                return false;
            }
            return true;
        }
    });
}

function triggerEmpPulseFX(targetPos) {
    if (!targetPos || typeof scene === 'undefined') return;
    const gY = typeof getTerrainHeight === 'function' ? getTerrainHeight(targetPos.x, targetPos.z) : 0;
    if (typeof playAudio === 'function') playAudio('emp_pulse', { volume: 0.92 });
    spawnMuzzleFlash({ x: targetPos.x, y: gY + 1.5, z: targetPos.z }, 0x00e5ff, 5.5);

    const sphereGeo = new THREE.SphereGeometry(2.5, 20, 16);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0x38e8ff, transparent: true, opacity: 0.55, wireframe: false });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.set(targetPos.x, gY + 0.8, targetPos.z);
    scene.add(sphere);

    const ringGeo = new THREE.RingGeometry(1.0, 2.6, 36);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x8beeff, side: THREE.DoubleSide, transparent: true, opacity: 0.92, depthWrite: false });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(targetPos.x, gY + 0.45, targetPos.z);
    scene.add(ring);

    let life = 40;
    activeFX.push({
        life,
        update() {
            life--;
            const prog = 1 - life / 40;
            sphere.scale.setScalar(1 + prog * 9.0);
            sphereMat.opacity = Math.max(0, (1 - prog) * 0.5);
            ring.scale.setScalar(1 + prog * 11.5);
            ringMat.opacity = Math.max(0, (1 - prog) * 0.92);
            if (life <= 0) {
                scene.remove(sphere); sphereGeo.dispose(); sphereMat.dispose();
                scene.remove(ring); ringGeo.dispose(); ringMat.dispose();
                return false;
            }
            return true;
        }
    });
}

function triggerArtilleryBarrageFX(targetPos, pseudoAttacker) {
    if (!targetPos || typeof scene === 'undefined') return;
    if (typeof playAudio === 'function') playAudio('artillery_fire', { volume: 0.85 }, 'china');
    for (let i = 0; i < 8; i++) {
        setTimeout(() => {
            if (typeof scene === 'undefined') return;
            const scatter = targetPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 18, 0, (Math.random() - 0.5) * 18));
            scatter.y = typeof getTerrainHeight === 'function' ? getTerrainHeight(scatter.x, scatter.z) : 0;
            if (i % 2 === 0 && typeof playAudio === 'function') playAudio('shell_whistle', { volume: 0.55 });
            setTimeout(() => {
                if (typeof scene === 'undefined') return;
                spawnEnhancedExplosion(scatter, 0xff5722, 3.0, true, 'expl_artillery');
                spawnCraterDecal(scatter, 2.8, 420);
                if (typeof triggerScreenShake === 'function') triggerScreenShake(0.45);
                if (typeof damageHostilesInRadius === 'function') damageHostilesInRadius(scatter, 8.0, 140, 'EXPLOSIVE', pseudoAttacker);
            }, 240);
        }, i * 260);
    }
}

function triggerAnthraxBombFX(targetPos, pseudoAttacker) {
    if (!targetPos || typeof scene === 'undefined') return;
    const impact = targetPos.clone();
    impact.y = typeof getTerrainHeight === 'function' ? getTerrainHeight(impact.x, impact.z) : 0;
    const dropFrom = new THREE.Vector3(impact.x - 16, impact.y + 42, impact.z - 12);
    if (typeof playAudio === 'function') playAudio('shell_whistle', { volume: 0.78 });

    const bombGeo = new THREE.CylinderGeometry(0.45, 0.35, 2.2, 8);
    const bombMat = new THREE.MeshStandardMaterial({ color: 0x2ecc71, roughness: 0.4, metalness: 0.6 });
    const bomb = new THREE.Mesh(bombGeo, bombMat);
    bomb.position.copy(dropFrom);
    if (typeof bomb.lookAt === 'function') bomb.lookAt(impact);
    scene.add(bomb);

    let tick = 0;
    activeFX.push({
        update() {
            tick++;
            const t = Math.min(1, tick / 28);
            bomb.position.lerpVectors(dropFrom, impact, t);
            if (tick % 3 === 0) spawnSmokePuff(bomb.position, 0x2ecc71, 0.45);
            if (t < 1) return true;
            scene.remove(bomb); bombGeo.dispose(); bombMat.dispose();
            if (typeof playAudio === 'function') playAudio('anthrax_blast', { volume: 0.95 }, 'gla');
            setTimeout(() => { if (typeof playAudio === 'function') playAudio('anthrax_hiss', { volume: 0.75 }, 'gla'); }, 180);
            if (typeof triggerScreenShake === 'function') triggerScreenShake(0.9);
            spawnEnhancedExplosion(impact, 0x2ecc71, 4.8, true, 'none');
            spawnCraterDecal(impact, 5.2, 560, 'toxin');
            spawnLingeringToxinCloud(impact);
            for (let k = 0; k < 4; k++) {
                const a = (k / 4) * Math.PI * 2;
                spawnLingeringToxinCloud(impact.clone().add(new THREE.Vector3(Math.cos(a) * 6.5, 0, Math.sin(a) * 6.5)));
            }
            if (typeof damageHostilesInRadius === 'function') damageHostilesInRadius(impact, 18.0, 320, 'TOXIN', pseudoAttacker);
            return false;
        }
    });
}

function triggerLeafletDropFX(targetPos) {
    if (!targetPos || typeof scene === 'undefined') return;
    const dropCenter = targetPos.clone();
    const gY = typeof getTerrainHeight === 'function' ? getTerrainHeight(dropCenter.x, dropCenter.z) : 0;
    const { plane, c130Props } = createC130FlyoverPlane('c130');
    const flightY = gY + 19.0;
    const startPos = new THREE.Vector3(dropCenter.x - 90, flightY, dropCenter.z - 40);
    const endPos = new THREE.Vector3(dropCenter.x + 90, flightY, dropCenter.z + 40);
    plane.position.copy(startPos);
    if (typeof plane.lookAt === 'function') plane.lookAt(endPos);
    scene.add(plane);
    if (typeof playAudio === 'function') playAudio('c130_flyover', { volume: 0.72 }, 'usa');

    let frame = 0;
    let released = false;
    activeFX.push({
        update() {
            frame++;
            const t = frame / 240;
            plane.position.lerpVectors(startPos, endPos, t);
            for (let p = 0; p < c130Props.length; p++) c130Props[p].rotation.z += 0.8;
            if (!released && t >= 0.48) {
                released = true;
                if (typeof playAudio === 'function') playAudio('parachute_open', { volume: 0.75 });
                const paperGeo = new THREE.PlaneGeometry(0.65, 0.42);
                const paperMat = new THREE.MeshBasicMaterial({ color: 0xfaf7e8, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
                let remainingSheets = 28;
                for (let k = 0; k < 28; k++) {
                    const sheet = new THREE.Mesh(paperGeo, paperMat);
                    sheet.position.set(
                        dropCenter.x + (Math.random() - 0.5) * 18,
                        flightY - 2 - Math.random() * 4,
                        dropCenter.z + (Math.random() - 0.5) * 18
                    );
                    scene.add(sheet);
                    const sway = Math.random() * Math.PI * 2;
                    let sLife = 110;
                    activeFX.push({
                        update() {
                            sLife--;
                            sheet.position.y -= 0.16;
                            sheet.position.x += Math.sin(sLife * 0.12 + sway) * 0.12;
                            sheet.rotation.x += 0.08;
                            sheet.rotation.z += 0.1;
                            if (sLife <= 0 || sheet.position.y <= gY + 0.15) {
                                scene.remove(sheet);
                                if (--remainingSheets <= 0) { paperGeo.dispose(); paperMat.dispose(); }
                                return false;
                            }
                            return true;
                        }
                    });
                }
            }
            if (frame < 240) return true;
            scene.remove(plane);
            return false;
        }
    });
}

function triggerEmergencyRepairFX(targetPos) {
    if (!targetPos || typeof scene === 'undefined') return;
    const gY = typeof getTerrainHeight === 'function' ? getTerrainHeight(targetPos.x, targetPos.z) : 0;
    if (typeof playAudio === 'function') playAudio('emergency_repair', { volume: 0.92 });
    const ringGeo = new THREE.RingGeometry(1.5, 2.8, 36);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x2ed573, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(targetPos.x, gY + 0.4, targetPos.z);
    scene.add(ring);
    spawnSparks({ x: targetPos.x, y: gY + 0.8, z: targetPos.z }, 0x2ed573, 18);

    let life = 38;
    activeFX.push({
        life,
        update() {
            life--;
            const p = 1 - life / 38;
            ring.scale.setScalar(1 + p * 8.5);
            ringMat.opacity = Math.max(0, (1 - p) * 0.9);
            if (life <= 0) {
                scene.remove(ring);
                ringGeo.dispose();
                ringMat.dispose();
                return false;
            }
            return true;
        }
    });
}

function triggerRebelAmbushFX(targetPos) {
    if (!targetPos || typeof scene === 'undefined') return;
    if (typeof playAudio === 'function') playAudio('rebel_ambush', { volume: 0.92 }, 'gla');
    spawnGroundDustPlume(targetPos, 1.8);
}

function triggerSneakAttackFX(targetPos) {
    if (!targetPos || typeof scene === 'undefined') return;
    if (typeof playAudio === 'function') playAudio('sneak_attack', { volume: 0.92 }, 'gla');
    spawnGroundDustPlume(targetPos, 2.2);
    spawnExplosionDebris(targetPos, 7, 1.2, true);
}

if (typeof window !== 'undefined') {
    window.triggerA10Strike = triggerA10Strike;
    window.triggerSpyDronePower = triggerSpyDronePower;
    window.triggerEmpPulseFX = triggerEmpPulseFX;
    window.triggerArtilleryBarrageFX = triggerArtilleryBarrageFX;
    window.triggerAnthraxBombFX = triggerAnthraxBombFX;
    window.triggerLeafletDropFX = triggerLeafletDropFX;
    window.triggerEmergencyRepairFX = triggerEmergencyRepairFX;
    window.triggerRebelAmbushFX = triggerRebelAmbushFX;
    window.triggerSneakAttackFX = triggerSneakAttackFX;
}
