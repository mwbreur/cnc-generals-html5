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

function getTerrainSurfaceKind(x = 0, z = 0) {
    if (typeof getTerrainHeight === 'function' && typeof currentWaterLevel === 'number') {
        const h = getTerrainHeight(x, z);
        if (h <= currentWaterLevel + 0.35) return 'water';
        if (h <= currentWaterLevel + 1.35) return 'mud';
    }
    const mapKey = (typeof currentMapType !== 'undefined' && currentMapType) ? String(currentMapType).toLowerCase() : 'tournament_desert';
    if (mapKey.includes('snow') || mapKey.includes('winter') || mapKey.includes('alpine')) return 'snow';
    if (mapKey.includes('city')) return 'city';
    if (mapKey.includes('jungle') || mapKey.includes('final_crusade') || mapKey.includes('heartland') || mapKey.includes('lone_eagle') || mapKey === 'random') return 'green';
    return 'desert';
}

function getTerrainDustColor() {
    const kind = getTerrainSurfaceKind();
    if (kind === 'snow') return 0xeaf3fb;
    if (kind === 'city') return 0x7d848b;
    if (kind === 'green' || kind === 'mud') return 0x6f6048;
    return 0xcfb284;
}

const _fxMudClodMat = new THREE.MeshBasicMaterial({ color: 0x423020 });
const _fxWaterSplashMat = new THREE.MeshBasicMaterial({ color: 0x9bd3e8, transparent: true, opacity: 0.8 });

function spawnMudClodSpray(pos, backX = 0, backZ = 0, isWater = false) {
    if (!pos || typeof scene === 'undefined' || activeFX.length > 330) return;
    const mat = isWater ? _fxWaterSplashMat : _fxMudClodMat;
    const count = isWater ? 3 : 2;
    for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(_fxSparkGeo, mat);
        const s = isWater ? (1.1 + Math.random() * 0.6) : (0.95 + Math.random() * 0.75);
        mesh.scale.set(s, s * 0.85, s);
        mesh.position.set(
            pos.x + (Math.random() - 0.5) * 0.35,
            (pos.y || 0) + 0.16,
            pos.z + (Math.random() - 0.5) * 0.35
        );
        scene.add(mesh);
        let vx = backX * (0.14 + Math.random() * 0.14) + (Math.random() - 0.5) * 0.10;
        let vz = backZ * (0.14 + Math.random() * 0.14) + (Math.random() - 0.5) * 0.10;
        let vy = 0.16 + Math.random() * 0.14;
        let life = 16 + Math.floor(Math.random() * 8);
        activeFX.push({
            mesh,
            life,
            update() {
                life--;
                mesh.position.x += vx;
                mesh.position.z += vz;
                mesh.position.y += vy;
                vy -= 0.022;
                const gY = typeof getTerrainHeight === 'function' ? getTerrainHeight(mesh.position.x, mesh.position.z) : 0;
                if (life <= 0 || mesh.position.y <= gY + 0.04) {
                    scene.remove(mesh);
                    return false;
                }
                return true;
            }
        });
    }
}

function spawnTreadDustPuff(pos, backX = 0, backZ = 0, color = null, size = 0.55) {
    if (!pos || typeof scene === 'undefined' || activeFX.length > 520) return;
    const surface = getTerrainSurfaceKind(pos.x, pos.z);

    // Green/swamp/riverbank terrain flings mud clods (or water splashes) with much less dust than desert!
    if (surface === 'mud' || surface === 'water') {
        spawnMudClodSpray(pos, backX, backZ, surface === 'water');
        if (Math.random() > 0.35) return;
    } else if (surface === 'green' && Math.random() < 0.62) {
        spawnMudClodSpray(pos, backX, backZ, false);
    }

    const dustColor = color !== null ? color : (surface === 'water' ? 0xb8e2f2 : getTerrainDustColor());
    const surfaceSizeMult = (surface === 'desert') ? 1.95 : (surface === 'snow' ? 1.28 : (surface === 'green' ? 0.68 : (surface === 'city' ? 0.55 : 0.78)));
    const baseOpacity = (surface === 'desert') ? 0.78 : (surface === 'snow' ? 0.62 : (surface === 'green' ? 0.34 : 0.38));
    const maxLife = (surface === 'desert') ? 46 : (surface === 'snow' ? 28 : 20);

    const tex = _getFxSpriteTex('smoke');
    const mat = tex
        ? new THREE.SpriteMaterial({ map: tex, color: dustColor, transparent: true, opacity: baseOpacity, depthWrite: false })
        : new THREE.MeshBasicMaterial({ color: dustColor, transparent: true, opacity: baseOpacity * 0.85 });
    const mesh = tex ? new THREE.Sprite(mat) : new THREE.Mesh(_fxSphere6, mat);
    const startS = size * surfaceSizeMult * (tex ? 2.6 : 0.95);
    mesh.scale.set(startS, startS, startS);
    mesh.position.set(pos.x + (Math.random() - 0.5) * 0.55, pos.y + 0.18, pos.z + (Math.random() - 0.5) * 0.55);
    scene.add(mesh);

    let life = maxLife;
    const grow = 0.055 * startS;
    activeFX.push({
        mesh,
        life,
        update() {
            life--;
            const prog = 1 - life / maxLife;
            const s = startS + prog * startS * (surface === 'desert' ? 1.95 : 1.15);
            mesh.scale.set(s, s, s);
            mesh.position.x += backX * 0.05;
            mesh.position.z += backZ * 0.05;
            mesh.position.y += (surface === 'desert' ? 0.032 : 0.016) + grow * 0.12;
            mat.opacity = Math.max(0, (1 - prog) * baseOpacity);
            if (life <= 0) {
                scene.remove(mesh);
                mat.dispose();
                return false;
            }
            return true;
        }
    });
}

// Authentic C&C Generals USA Patriot Missile Network Curved Communication Arc (only while attacking/relaying!)
function spawnPatriotCommArc(fromPos, toPos) {
    if (!fromPos || !toPos || typeof scene === 'undefined' || activeFX.length > 350) return;
    const dist = fromPos.distanceTo(toPos);
    if (dist < 1.0) return;
    const arcHeight = Math.max(6.0, Math.min(18.0, dist * 0.25));
    const segs = 18;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const p = new THREE.Vector3().lerpVectors(fromPos, toPos, t);
        p.y += Math.sin(t * Math.PI) * arcHeight;
        pts.push(p);
    }
    const arcGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const arcMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.92 });
    const arcLine = new THREE.Line(arcGeo, arcMat);
    scene.add(arcLine);

    // Traveling cyan data pulse orb zipping along the arc from spotting Patriot to assisting Patriot
    const orbMat = new THREE.MeshBasicMaterial({ color: 0xc8ffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    const orb = new THREE.Mesh(_fxSphere6, orbMat);
    orb.scale.setScalar(0.55);
    orb.position.copy(pts[0]);
    scene.add(orb);

    let life = 22;
    const maxLife = 22;
    activeFX.push({
        life,
        update() {
            life--;
            const prog = 1 - life / maxLife;
            const pulseT = Math.min(1, prog * 1.25);
            const idxF = pulseT * segs;
            const i0 = Math.min(segs - 1, Math.floor(idxF));
            const frac = idxF - i0;
            orb.position.lerpVectors(pts[i0], pts[i0 + 1], frac);
            const fade = Math.max(0, 1 - prog);
            arcMat.opacity = fade * 0.92;
            orbMat.opacity = fade * 0.95;
            if (life <= 0) {
                scene.remove(arcLine);
                scene.remove(orb);
                arcGeo.dispose();
                arcMat.dispose();
                orbMat.dispose();
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
    window.getTerrainSurfaceKind = getTerrainSurfaceKind;
    window.getTerrainDustColor = getTerrainDustColor;
    window.spawnMudClodSpray = spawnMudClodSpray;
    window.spawnTreadDustPuff = spawnTreadDustPuff;
    window.spawnPatriotCommArc = spawnPatriotCommArc;
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
                color: isToxin ? 0x2ed573 : 0xc0c8d2,
                metalness: 0.65,
                roughness: 0.32
        });
        const rLen = isHeavy ? 2.1 : 1.35;
        const rRad = isHeavy ? 0.30 : 0.19;
        const rGeo = new THREE.CylinderGeometry(rRad, rRad, rLen, 8);
        rGeo.rotateX(Math.PI / 2);
        const rocketBody = new THREE.Mesh(rGeo, bodyMat);
        const noseMat = new THREE.MeshBasicMaterial({ color: isToxin ? 0x55efc4 : 0xff5252 });
        const noseGeo = new THREE.ConeGeometry(rRad * 1.05, rLen * 0.42, 8);
        noseGeo.rotateX(Math.PI / 2);
        const noseCone = new THREE.Mesh(noseGeo, noseMat);
        noseCone.position.z = rLen * 0.7;
        group.add(rocketBody, noseCone);
    }

    const isHeroic = !!(metadata && metadata.attacker && metadata.attacker.veterancy >= 3);
    const glowColor = isHeroic
        ? (isHeavy ? 0xff5522 : 0xff1e1e)
        : (isToxin ? 0x7bed9f : 0xff9f43);
    const glowRadius = (isHeavy ? 0.55 : 0.32) * (isHeroic ? 1.45 : 1.0);
    const glowMat = new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.95 });
    const motorGlow = new THREE.Mesh(new THREE.SphereGeometry(glowRadius, 6, 6), glowMat);
    motorGlow.scale.set(1, 1, 2.2);
    motorGlow.position.z = isHeavy ? -1.45 : -0.82;
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
        _tumbling: false,
        _tumbleVel: null,
        _tumbleRot: null,
        _tumbleTicks: 0,
        update() {
            if (this.intercepted) {
                // Authentic Zero Hour Paladin Point Defense Laser Interception:
                // Rocket loses guidance, sparks cyan, tumbles end-over-end trailing dark smoke, and crashes harmlessly!
                if (!this._tumbling) {
                    this._tumbling = true;
                    const mIdx = activeMissiles.indexOf(this);
                    if (mIdx !== -1) activeMissiles.splice(mIdx, 1);
                    if (typeof spawnMuzzleFlash === 'function') spawnMuzzleFlash(this.group.position, 0x00ffff, 1.0);
                    motorGlow.visible = false;
                    const fwd = new THREE.Vector3().subVectors(this.toPos, fromPos);
                    if (fwd.lengthSq() > 1e-4) fwd.normalize();
                    else fwd.set(1, 0, 0);
                    const sideSign = Math.random() < 0.5 ? -1 : 1;
                    this._tumbleVel = new THREE.Vector3(
                        fwd.x * 0.45 + (-fwd.z) * sideSign * (0.28 + Math.random() * 0.25),
                        0.18 + Math.random() * 0.14,
                        fwd.z * 0.45 + fwd.x * sideSign * (0.28 + Math.random() * 0.25)
                    );
                    this._tumbleRot = new THREE.Vector3(
                        (Math.random() - 0.5) * 0.45 + 0.18,
                        (Math.random() - 0.5) * 0.45,
                        (Math.random() - 0.5) * 0.55
                    );
                }
                this._tumbleTicks++;
                this._tumbleVel.y -= 0.055;
                this.group.position.add(this._tumbleVel);
                this.group.rotation.x += this._tumbleRot.x;
                this.group.rotation.y += this._tumbleRot.y;
                this.group.rotation.z += this._tumbleRot.z;
                if (this._tumbleTicks % 2 === 0 && typeof spawnSmokePuff === 'function') {
                    spawnSmokePuff(this.group.position, 0x4b525c, 0.30);
                }
                const gY = (typeof getTerrainHeight === 'function') ? getTerrainHeight(this.group.position.x, this.group.position.z) : 0;
                if (this.group.position.y <= gY + 0.15 || this._tumbleTicks >= 75) {
                    if (typeof spawnTreadDustPuff === 'function') spawnTreadDustPuff(this.group.position, 0, 0, null, 0.55);
                    if (typeof spawnMuzzleFlash === 'function') spawnMuzzleFlash(this.group.position, 0xffaa44, 0.55);
                    scene.remove(this.group);
                    this.group.traverse(child => {
                            if (child.userData && child.userData._sharedW3D) return;
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) child.material.dispose();
                    });
                    return false;
                }
                return true;
            }

            const isHoming = !!(this.metadata && this.metadata.isGuided && this.metadata.target && this.metadata.target.health > 0 && this.metadata.target.mesh);
            if (isHoming) {
                this.toPos.copy(this.metadata.target.mesh.position);
                this.toPos.y += this.metadata.target.isAir ? 0.3 : 0.5;
            }

            this.distTraveled += this.speed;
            let alpha;
            if (isHoming && !this.isHeavy) {
                // Incremental homing steering avoids early detonation / backward slide when moving target closes or retreats
                const toT = new THREE.Vector3().subVectors(this.toPos, this.curPos);
                const rem = toT.length();
                if (rem <= Math.max(1.2, this.speed)) {
                    this.curPos.copy(this.toPos);
                    alpha = 1.0;
                    this.distTraveled = this.distTotal;
                } else {
                    toT.multiplyScalar(this.speed / rem);
                    this.curPos.add(toT);
                    alpha = Math.min(0.98, this.distTraveled / Math.max(0.1, this.distTraveled + rem));
                    (this.mesh || this.group).lookAt(this.toPos);
                }
            } else {
                alpha = Math.min(1.0, this.distTraveled / Math.max(0.1, this.distTotal));
                this.curPos.lerpVectors(fromPos, this.toPos, alpha);
                if (isHoming) (this.mesh || this.group).lookAt(this.toPos);
            }

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

// =========================================================================
// AUTHENTIC C&C GENERALS VEHICLE TANK TREAD & TIRE TRACK DECAL SYSTEM
// (Pooled ring buffer — zero per-frame geometry allocation, never evicts combat FX!)
// =========================================================================
const _trackTexCache = { tracked: null, wheeled: null };
let _sharedTrackGeo = null;
const _activeTrackMarks = [];
const MAX_VEHICLE_TRACK_MARKS = 260;

function _getVehicleTrackTexture(isTracked) {
    const key = isTracked ? 'tracked' : 'wheeled';
    if (_trackTexCache[key]) return _trackTexCache[key];
    if (typeof document === 'undefined' || !document.createElement) return null;
    const can = document.createElement('canvas');
    can.width = 64;
    can.height = 64;
    const ctx = can.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, 64, 64);

    if (isTracked) {
        // Twin wide ribbed caterpillar tank treads
        const drawBelt = (x0, w) => {
            ctx.fillStyle = 'rgba(28, 22, 16, 0.32)';
            ctx.fillRect(x0, 2, w, 60);
            ctx.fillStyle = 'rgba(18, 13, 9, 0.72)';
            for (let y = 4; y < 60; y += 7) {
                ctx.fillRect(x0 + 1, y, w - 2, 3.5);
            }
        };
        drawBelt(6, 15);
        drawBelt(43, 15);
    } else {
        // Twin narrow rubber tire ruts with chevron tread
        const drawTire = (x0, w) => {
            ctx.fillStyle = 'rgba(26, 22, 18, 0.42)';
            ctx.fillRect(x0, 2, w, 60);
            ctx.fillStyle = 'rgba(16, 12, 9, 0.65)';
            for (let y = 4; y < 60; y += 6) {
                ctx.fillRect(x0 + 1, y, w - 2, 2.5);
            }
        };
        drawTire(10, 9);
        drawTire(45, 9);
    }
    const tex = new THREE.CanvasTexture(can);
    _trackTexCache[key] = tex;
    return tex;
}

function spawnVehicleTrackMark(unit, rotY, isTracked = true) {
    if (!unit || !unit.mesh || typeof scene === 'undefined') return;
    if (unit.mesh.visible === false) return;
    const px = unit.mesh.position.x;
    const pz = unit.mesh.position.z;
    // Only stamp a new track segment every ~2.4 world units of travel
    if (unit._lastTrackX !== undefined) {
        const d2 = (px - unit._lastTrackX) * (px - unit._lastTrackX) + (pz - unit._lastTrackZ) * (pz - unit._lastTrackZ);
        if (d2 < 5.76) return;
    }
    unit._lastTrackX = px;
    unit._lastTrackZ = pz;

    const groundY = (typeof getTerrainHeight === 'function') ? getTerrainHeight(px, pz) : (unit.mesh.position.y || 0);
    // Skip underwater or bridge deck
    if (typeof currentWaterLevel === 'number' && groundY < currentWaterLevel + 0.1) return;
    if (typeof getBridgeDeckHeightAt === 'function' && getBridgeDeckHeightAt(px, pz) !== null) return;

    if (!_sharedTrackGeo) {
        _sharedTrackGeo = new THREE.PlaneGeometry(1, 1);
        _sharedTrackGeo.rotateX(-Math.PI / 2);
    }
    const tex = _getVehicleTrackTexture(isTracked);
    if (!tex) return;

    const width = Math.max(1.8, (unit.radius || 2.5) * (isTracked ? 1.08 : 0.88));
    const length = 2.75;
    let entry;
    if (_activeTrackMarks.length >= MAX_VEHICLE_TRACK_MARKS) {
        entry = _activeTrackMarks.shift();
        entry.mesh.material.map = tex;
        entry.mesh.material.needsUpdate = true;
    } else {
        const mat = new THREE.MeshBasicMaterial({
            map: tex,
            color: 0xffffff,
            transparent: true,
            opacity: isTracked ? 0.58 : 0.48,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });
        const mesh = new THREE.Mesh(_sharedTrackGeo, mat);
        mesh.renderOrder = 1;
        scene.add(mesh);
        entry = { mesh, life: 0, maxLife: 1080, baseOpacity: 0.55 };
    }
    entry.baseOpacity = isTracked ? 0.58 : 0.48;
    entry.maxLife = 1080; // ~18 seconds before fading away
    entry.life = entry.maxLife;
    entry.mesh.visible = true;
    entry.mesh.position.set(px, groundY + 0.08, pz);
    entry.mesh.rotation.set(0, rotY || 0, 0);
    entry.mesh.scale.set(width, 1, length);
    entry.mesh.material.opacity = entry.baseOpacity;
    _activeTrackMarks.push(entry);
}
window.spawnVehicleTrackMark = spawnVehicleTrackMark;

function updateVehicleTrackMarks() {
    for (let i = _activeTrackMarks.length - 1; i >= 0; i--) {
        const tm = _activeTrackMarks[i];
        tm.life--;
        if (tm.life < 180) {
            tm.mesh.material.opacity = Math.max(0, (tm.life / 180) * tm.baseOpacity);
        }
        if (tm.life <= 0) {
            scene.remove(tm.mesh);
            if (tm.mesh.material) tm.mesh.material.dispose();
            _activeTrackMarks.splice(i, 1);
        }
    }
}

function clearVehicleTrackMarks() {
    while (_activeTrackMarks.length > 0) {
        const tm = _activeTrackMarks.pop();
        if (tm && tm.mesh) {
            if (typeof scene !== 'undefined') scene.remove(tm.mesh);
            if (tm.mesh.material) tm.mesh.material.dispose();
        }
    }
}
window.clearVehicleTrackMarks = clearVehicleTrackMarks;

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

// Track active Inferno Cannon burn patches for official 3-hit Firestorm synergy (HistoricBonusRadius)
const _activeInfernoPools = [];

function spawnInfernoFirestorm(center, hasBlackNapalm = false) {
    if (!center || typeof scene === 'undefined') return;
    const groundY = (typeof getTerrainHeight === 'function') ? getTerrainHeight(center.x, center.z) : (center.y || 0);
    const fireTex = _getFxSpriteTex('fireball');
    const smokeTex = _getFxSpriteTex('smoke');
    const group = new THREE.Group();
    group.position.set(center.x, groundY, center.z);

    const addBlend = typeof THREE.AdditiveBlending !== 'undefined' ? { blending: THREE.AdditiveBlending } : {};
    const radius = 8.5;
    const durationTicks = 660; // 11 seconds

    // Blazing ground magma / napalm pool
    const baseGeo = new THREE.CircleGeometry(radius, 28);
    baseGeo.rotateX(-Math.PI / 2);
    const baseMat = new THREE.MeshBasicMaterial({
        ...(smokeTex ? { map: smokeTex } : {}),
        color: hasBlackNapalm ? 0x1e60ff : 0xff5500,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        ...addBlend
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.16;
    group.add(baseMesh);

    // Towering swirling Firestorm flame pillars (orange/gold/black or Black Napalm blue/black-blue)
    const pillars = [];
    const flameColors = hasBlackNapalm
        ? [0x2980ff, 0x70c8ff, 0x0d2b6b, 0x1e40af]
        : [0xff7718, 0xffcc33, 0xe84118, 0xff4500];
    if (typeof THREE.Sprite === 'function' && typeof THREE.SpriteMaterial === 'function') {
        const pillarCount = 14;
        for (let i = 0; i < pillarCount; i++) {
            const isSmoke = (i >= 10);
            const mat = new THREE.SpriteMaterial({
                map: isSmoke ? smokeTex : (fireTex || smokeTex),
                color: isSmoke ? (hasBlackNapalm ? 0x0f172a : 0x1f1916) : flameColors[i % flameColors.length],
                transparent: true,
                opacity: isSmoke ? 0.55 : 0.92,
                depthWrite: false,
                ...(isSmoke ? {} : addBlend)
            });
            const spr = new THREE.Sprite(mat);
            const ang = (i / pillarCount) * Math.PI * 2;
            const orbitR = isSmoke ? (2.0 + Math.random() * 4.5) : (0.8 + (i % 4) * 1.6);
            const baseY = isSmoke ? (6.5 + Math.random() * 5.0) : (1.8 + (i % 5) * 1.8);
            const scale = isSmoke ? (7.5 + Math.random() * 4.0) : (5.2 + Math.random() * 3.8);
            spr.position.set(Math.cos(ang) * orbitR, baseY, Math.sin(ang) * orbitR);
            spr.scale.set(scale, scale * (isSmoke ? 1.1 : 1.45), 1);
            group.add(spr);
            pillars.push({
                spr, mat, ang, orbitR, baseY, scale, isSmoke,
                spinSpeed: (isSmoke ? 0.035 : 0.085) * (i % 2 === 0 ? 1 : -1),
                phase: Math.random() * Math.PI * 2,
                baseOp: mat.opacity
            });
        }
    }
    scene.add(group);

    if (typeof triggerScreenShake === 'function') triggerScreenShake(0.95);
    if (typeof playAudio === 'function') playAudio('expl_fire', { volume: 0.9 });
    if (typeof spawnCraterDecal === 'function') spawnCraterDecal(center, 7.5, 1200, 'flame');

    const disposeStorm = () => {
        scene.remove(group);
        baseGeo.dispose();
        baseMat.dispose();
        for (let i = 0; i < pillars.length; i++) pillars[i].mat.dispose();
    };

    let life = durationTicks;
    let tick = 0;
    activeFX.push({
        persistent: true,
        group,
        life: durationTicks,
        dispose: disposeStorm,
        update() {
            life--;
            tick++;
            const env = Math.min(1, tick / 18) * Math.min(1, life / 80);
            baseMat.opacity = env * (0.72 + Math.sin(tick * 0.25) * 0.16);
            for (let i = 0; i < pillars.length; i++) {
                const p = pillars[i];
                p.ang += p.spinSpeed;
                const rise = Math.sin(tick * 0.08 + p.phase) * 1.6;
                p.spr.position.set(Math.cos(p.ang) * p.orbitR, p.baseY + rise, Math.sin(p.ang) * p.orbitR);
                const pulse = 0.88 + Math.sin(tick * 0.22 + p.phase) * 0.22;
                p.spr.scale.set(p.scale * pulse, p.scale * (p.isSmoke ? 1.15 : 1.5) * pulse, 1);
                p.mat.opacity = env * p.baseOp;
            }
            // Spiraling embers & smoke
            if (tick % 10 === 0 && activeFX.length < 480 && typeof spawnSmokePuff === 'function') {
                const ea = Math.random() * Math.PI * 2;
                const er = Math.random() * radius * 0.7;
                spawnSmokePuff(new THREE.Vector3(center.x + Math.cos(ea) * er, groundY + 3.5, center.z + Math.sin(ea) * er), hasBlackNapalm ? 0x1e3a8a : 0x261f1b, 1.35);
            }
            // Official Firestorm DoT: 3.5x-4x normal burn every 0.5s (melts tanks, incinerates infantry, burns structures)
            if (tick % 30 === 0) {
                const stormDmg = hasBlackNapalm ? 48 : 38;
                const allUnits = [...(typeof units !== 'undefined' ? units : []), ...(typeof enemyUnits !== 'undefined' ? enemyUnits : [])];
                for (let i = 0; i < allUnits.length; i++) {
                    const u = allUnits[i];
                    if (u && u.health > 0 && u.mesh && !u.isAir && Math.hypot(u.mesh.position.x - center.x, u.mesh.position.z - center.z) <= radius) {
                        if (typeof applyCalculatedDamage === 'function') applyCalculatedDamage(null, u, stormDmg, 'FLAME');
                        else u.health -= stormDmg;
                    }
                }
                const allStructs = [...(typeof structures !== 'undefined' ? structures : []), ...(typeof enemyStructures !== 'undefined' ? enemyStructures : [])];
                for (let i = 0; i < allStructs.length; i++) {
                    const st = allStructs[i];
                    const sp = st && (st.position || (st.mesh && st.mesh.position));
                    if (st && st.health > 0 && sp && Math.hypot(sp.x - center.x, sp.z - center.z) <= radius + 2.5) {
                        if (typeof applyCalculatedDamage === 'function') applyCalculatedDamage(null, st, Math.round(stormDmg * 1.15), 'FLAME');
                        else st.health -= stormDmg;
                    }
                }
            }
            if (life <= 0) {
                disposeStorm();
                return false;
            }
            return true;
        }
    });
}

// Lingering Napalm Scorch Pool (supports Black Napalm blue/black flames & 3-hit Inferno Firestorm synergy)
function spawnNapalmScorchPool(pos, hasBlackNapalm = false, isInfernoShell = false) {
    if (!pos || typeof scene === 'undefined') return;
    // Official Firestorm Synergy: if 2+ active Inferno pools already exist within 7.0u, consume them and ignite a massive Firestorm Vortex!
    if (isInfernoShell) {
        const nearby = [];
        for (let i = _activeInfernoPools.length - 1; i >= 0; i--) {
            const p = _activeInfernoPools[i];
            if (!p || p.life <= 0) { _activeInfernoPools.splice(i, 1); continue; }
            if (Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) <= 7.0) nearby.push(p);
        }
        if (nearby.length >= 2) {
            const avgX = (pos.x + nearby.reduce((s, p) => s + p.pos.x, 0)) / (nearby.length + 1);
            const avgZ = (pos.z + nearby.reduce((s, p) => s + p.pos.z, 0)) / (nearby.length + 1);
            const anyBlack = hasBlackNapalm || nearby.some(p => p.hasBlackNapalm);
            nearby.forEach(p => { p.life = 1; }); // Consume small patches on next tick
            spawnInfernoFirestorm(new THREE.Vector3(avgX, pos.y || 0, avgZ), anyBlack);
            return;
        }
    }

    const groundY = (typeof getTerrainHeight === 'function') ? getTerrainHeight(pos.x, pos.z) : (pos.y || 0);
    const fireTex = _getFxSpriteTex('fireball');
    const smokeTex = _getFxSpriteTex('smoke');
    const addBlend = typeof THREE.AdditiveBlending !== 'undefined' ? { blending: THREE.AdditiveBlending } : {};
    const poolGrp = new THREE.Group();
    poolGrp.position.set(pos.x, groundY, pos.z);

    const poolGeo = new THREE.CircleGeometry(3.8, 18);
    poolGeo.rotateX(-Math.PI / 2);
    const poolMat = new THREE.MeshBasicMaterial({
        ...(smokeTex ? { map: smokeTex } : {}),
        color: hasBlackNapalm ? 0x1e60ff : 0xff4500,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        ...addBlend
    });
    const poolMesh = new THREE.Mesh(poolGeo, poolMat);
    poolMesh.position.y = 0.08;
    poolGrp.add(poolMesh);

    const flameSprites = [];
    if (typeof THREE.Sprite === 'function' && typeof THREE.SpriteMaterial === 'function') {
        const fCols = hasBlackNapalm ? [0x2980ff, 0x6ec6ff, 0x142c66] : [0xff7718, 0xffcc33, 0xe84118];
        for (let fi = 0; fi < 4; fi++) {
            const fm = new THREE.SpriteMaterial({
                map: fireTex || smokeTex,
                color: fCols[fi % fCols.length],
                transparent: true,
                opacity: 0.82,
                depthWrite: false,
                ...addBlend
            });
            const fs = new THREE.Sprite(fm);
            const fa = (fi / 4) * Math.PI * 2 + Math.random() * 0.5;
            const fr = fi === 0 ? 0 : (1.1 + Math.random() * 1.4);
            fs.position.set(Math.cos(fa) * fr, 1.0 + Math.random() * 0.8, Math.sin(fa) * fr);
            const sc = 2.6 + Math.random() * 1.4;
            fs.scale.set(sc, sc * 1.25, 1);
            poolGrp.add(fs);
            flameSprites.push({ spr: fs, mat: fm, sc, phase: Math.random() * Math.PI * 2 });
        }
    }
    scene.add(poolGrp);

    const disposePool = () => {
        scene.remove(poolGrp);
        poolGeo.dispose();
        poolMat.dispose();
        for (let i = 0; i < flameSprites.length; i++) flameSprites[i].mat.dispose();
    };

    const duration = isInfernoShell ? 540 : 300; // 9s for Inferno Cannon, 5s for incidental napalm
    const fxEntry = {
            group: poolGrp,
            pos: pos.clone(),
            life: duration,
            maxLife: duration,
            radius: 4.0,
            hasBlackNapalm: !!hasBlackNapalm,
            tickTimer: 0,
            dispose: disposePool,
            update() {
                this.life--;
                this.tickTimer++;
                const fadeOut = Math.min(1, this.life / 60);
                poolMat.opacity = fadeOut * (0.55 + Math.sin(this.life * 0.25) * 0.22);
                for (let fi = 0; fi < flameSprites.length; fi++) {
                    const f = flameSprites[fi];
                    const flick = 0.85 + Math.sin(this.tickTimer * 0.3 + f.phase) * 0.22;
                    f.spr.scale.set(f.sc * flick, f.sc * 1.3 * flick, 1);
                    f.mat.opacity = fadeOut * 0.82;
                }

                // Periodic dark smoke puff
                if (this.tickTimer % 14 === 0 && activeFX.length < 480) {
                    const sparkPos = this.pos.clone();
                    sparkPos.x += (Math.random() - 0.5) * 3.0;
                    sparkPos.z += (Math.random() - 0.5) * 3.0;
                    sparkPos.y = groundY + 0.6;
                    spawnSmokePuff(sparkPos, hasBlackNapalm ? 0x111827 : 0x1e272e, 0.55);
                }

                // Lingering FLAME DoT every 0.5s (30 ticks) to ground units & structures inside the burn patch
                if (this.tickTimer % 30 === 0) {
                    const burnDmg = hasBlackNapalm ? 13 : 10;
                    const allGround = [...(typeof units !== 'undefined' ? units : []), ...(typeof enemyUnits !== 'undefined' ? enemyUnits : [])];
                    for (let i = 0; i < allGround.length; i++) {
                        const u = allGround[i];
                        if (u && u.health > 0 && u.mesh && !u.isAir && Math.hypot(u.mesh.position.x - this.pos.x, u.mesh.position.z - this.pos.z) <= this.radius) {
                            if (typeof applyCalculatedDamage === 'function') applyCalculatedDamage(null, u, burnDmg, 'FLAME');
                            else u.health -= burnDmg;
                        }
                    }
                    const allStructs = [...(typeof structures !== 'undefined' ? structures : []), ...(typeof enemyStructures !== 'undefined' ? enemyStructures : [])];
                    for (let i = 0; i < allStructs.length; i++) {
                        const st = allStructs[i];
                        const sp = st && (st.position || (st.mesh && st.mesh.position));
                        if (st && st.health > 0 && sp && Math.hypot(sp.x - this.pos.x, sp.z - this.pos.z) <= this.radius + 1.5) {
                            if (typeof applyCalculatedDamage === 'function') applyCalculatedDamage(null, st, Math.round(burnDmg * 0.7), 'FLAME');
                            else st.health -= Math.round(burnDmg * 0.7);
                        }
                    }
                }

                if (this.life <= 0) {
                    disposePool();
                    return false;
                }
                return true;
            }
    };
    activeFX.push(fxEntry);
    if (isInfernoShell) _activeInfernoPools.push(fxEntry);
}

// Lingering Toxic Gas Cloud (Anthrax / GLA Toxin / SCUD Storm OCL_PoisonField* with official INIZH.big poison DoT)
// Official INIZH.big: SmallPoisonFieldWeapon = 2.0 (Beta 2.5) / 500ms for 10s; LargePoisonFieldWeapon = 15.0 (Beta 25.0) / 500ms for 45s.
function spawnLingeringToxinCloud(pos, radius = 4.2, durationTicks = 600, customDmgPerTick = null) {
    if (!pos || typeof scene === 'undefined') return;
    const groundY = (typeof getTerrainHeight === 'function') ? getTerrainHeight(pos.x, pos.z) : (pos.y || 0);
    const smokeTex = _getFxSpriteTex('smoke');
    const cloudGroup = new THREE.Group();
    cloudGroup.position.set(pos.x, groundY, pos.z);

    // Soft ground-hugging toxic haze layer
    const cloudGeo = new THREE.PlaneGeometry(radius * 2.5, radius * 2.5);
    cloudGeo.rotateX(-Math.PI / 2);
    const cloudMat = new THREE.MeshBasicMaterial({
        ...(smokeTex ? { map: smokeTex } : {}),
        color: 0x38d948,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
    });
    const groundPool = new THREE.Mesh(cloudGeo, cloudMat);
    groundPool.position.y = 0.16;
    groundPool.rotation.y = Math.random() * Math.PI * 2;
    cloudGroup.add(groundPool);

    // Official Generals volumetric swirling green / yellow-green anthrax mist bank (soft overlapping camera-facing sprites, not dots)
    const mistSprites = [];
    if (smokeTex && typeof THREE.Sprite === 'function' && typeof THREE.SpriteMaterial === 'function') {
        const mistCount = radius > 7 ? 7 : 3;
        const mistPalette = [0x4cd137, 0xb8e934, 0x26de81, 0xa3cb38, 0x20bf6b];
        for (let mi = 0; mi < mistCount; mi++) {
            const ang = (mi / mistCount) * Math.PI * 2 + Math.random() * 0.6;
            const dist = (mi === 0) ? 0 : radius * (0.28 + Math.random() * 0.52);
            const baseScale = radius * (radius > 7 ? (0.95 + Math.random() * 0.55) : (1.15 + Math.random() * 0.45));
            const sMat = new THREE.SpriteMaterial({
                map: smokeTex,
                color: mistPalette[mi % mistPalette.length],
                transparent: true,
                opacity: radius > 7 ? 0.42 : 0.34,
                depthWrite: false
            });
            const spr = new THREE.Sprite(sMat);
            const baseX = Math.cos(ang) * dist;
            const baseZ = Math.sin(ang) * dist;
            const baseY = 1.2 + Math.random() * (radius > 7 ? 3.8 : 1.4);
            spr.position.set(baseX, baseY, baseZ);
            spr.scale.set(baseScale, baseScale * 0.72, 1);
            cloudGroup.add(spr);
            mistSprites.push({
                spr, mat: sMat, baseX, baseZ, baseY, baseScale,
                phase: Math.random() * Math.PI * 2,
                speed: 0.015 + Math.random() * 0.015,
                orbitR: 0.6 + Math.random() * (radius * 0.14),
                baseOpacity: sMat.opacity
            });
        }
    }
    scene.add(cloudGroup);

    const disposeCloud = () => {
        scene.remove(cloudGroup);
        cloudGeo.dispose();
        cloudMat.dispose();
        for (let i = 0; i < mistSprites.length; i++) mistSprites[i].mat.dispose();
    };

    activeFX.push({
            persistent: radius > 7,
            group: cloudGroup,
            pos: pos.clone(),
            life: durationTicks,
            maxLife: durationTicks,
            radius: radius,
            customDmgPerTick: customDmgPerTick,
            tickTimer: 0,
            dispose: disposeCloud,
            update() {
                this.life--;
                this.tickTimer++;
                const fadeIn = Math.min(1, this.tickTimer / 22);
                const fadeOut = Math.min(1, this.life / 100);
                const alphaEnv = fadeIn * fadeOut;

                // Soft pulsing green anthrax contamination haze
                cloudMat.opacity = alphaEnv * (0.44 + Math.sin(this.life * 0.08) * 0.12);

                // Gently swirl & breathe the 3D volumetric anthrax mist clouds
                for (let mi = 0; mi < mistSprites.length; mi++) {
                    const m = mistSprites[mi];
                    const t = this.tickTimer * m.speed + m.phase;
                    m.spr.position.x = m.baseX + Math.cos(t) * m.orbitR;
                    m.spr.position.z = m.baseZ + Math.sin(t * 0.85) * m.orbitR;
                    m.spr.position.y = m.baseY + Math.sin(t * 1.2) * 0.7;
                    const swell = 1.0 + Math.sin(t * 0.7) * 0.14;
                    m.spr.scale.set(m.baseScale * swell, m.baseScale * 0.72 * swell, 1);
                    m.mat.opacity = alphaEnv * m.baseOpacity * (0.85 + Math.sin(t) * 0.15);
                }

                // Official INIZH.big poison field tick (500ms = 30 ticks): damages all ground units inside
                // Small puddle (<=7u): 2.5 dmg/500ms (SmallPoisonFieldWeapon 2.0 / Beta 2.5)
                // Large SCUD Storm pool (>7u): 15 dmg/500ms (LargePoisonFieldWeapon 15.0)
                // Huge Anthrax Bomb pool (>12u): 25 dmg/500ms (LargePoisonFieldWeaponUpgraded 25.0)
                if (this.tickTimer % 30 === 0) {
                    const dmg = this.customDmgPerTick != null
                        ? this.customDmgPerTick
                        : (this.radius > 12 ? 25 : (this.radius > 7 ? 15 : 2.5));
                    const allGround = [...(typeof units !== 'undefined' ? units : []), ...(typeof enemyUnits !== 'undefined' ? enemyUnits : [])];
                    for (let i = 0; i < allGround.length; i++) {
                        const u = allGround[i];
                        if (u && u.health > 0 && u.mesh && !u.isAir && Math.hypot(u.mesh.position.x - this.pos.x, u.mesh.position.z - this.pos.z) <= this.radius) {
                            if (typeof applyCalculatedDamage === 'function') applyCalculatedDamage(null, u, dmg, 'POISON');
                            else u.health -= dmg;
                        }
                    }
                }

                if (this.life <= 0) {
                    disposeCloud();
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

// Authentic C&C Generals: Zero Hour Fuel Air Bomb / Daisy Cutter Thermobaric Detonation
// Stage 1: Fuel-air aerosol mist dispersal -> Stage 2: Blinding thermobaric fire dome + Wilson condensation shell
// -> Stage 3: Twin ground-hugging pressure shockwaves + debris skirt -> Stage 4: Rising ember-lit mushroom smoke column
function spawnFuelAirExplosion(pos, soundType = 'aurora_bomb', blastScale = 1.0, onIgnite = null) {
    if (!pos || !scene) return;
    const gY = (typeof getTerrainHeight === 'function') ? getTerrainHeight(pos.x, pos.z) : (pos.y || 0);
    const center = new THREE.Vector3(pos.x, gY, pos.z);
    const isDaisyCutter = blastScale >= 1.15;
    // Official INIZH.big FX_DaisyCutterExplode -> FX_DaisyCutterIgnite -> FX_DaisyCutterFinalExplosion (slow, weighty thermobaric sequence)
    const dispersalTicks = isDaisyCutter ? 115 : 22;
    const igniteFlashStart = isDaisyCutter ? 74 : 12;

    const rootGrp = new THREE.Group();
    rootGrp.position.copy(center);
    scene.add(rootGrp);

    const ownedGeos = [];
    const ownedMats = [];
    const track = (geo, mat) => { ownedGeos.push(geo); ownedMats.push(mat); return new THREE.Mesh(geo, mat); };
    const smokeTex = _getFxSpriteTex('smoke');
    const fireTex = _getFxSpriteTex('fireball');
    const fallbackGeo = new THREE.IcosahedronGeometry(1.0, 1);
    ownedGeos.push(fallbackGeo);

    const makeVolSprite = (tex, colorHex, opacity, additive = false) => {
        if (tex && typeof THREE.Sprite === 'function' && typeof THREE.SpriteMaterial === 'function') {
            const mat = new THREE.SpriteMaterial({
                map: tex,
                color: colorHex,
                transparent: true,
                opacity,
                depthWrite: false,
                ...(additive ? { blending: THREE.AdditiveBlending } : {})
            });
            ownedMats.push(mat);
            return new THREE.Sprite(mat);
        }
        const mat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity,
            depthWrite: false,
            ...(additive ? { blending: THREE.AdditiveBlending } : {})
        });
        ownedMats.push(mat);
        return new THREE.Mesh(fallbackGeo, mat);
    };

    // --- STAGE 1: Official DaisyExplosionGasSpray (R:239 G:227 B:10 bright yellow-gold aerosol fuel vapor cloud) ---
    const mistGroup = new THREE.Group();
    rootGrp.add(mistGroup);
    const mistPuffs = [];
    const mistCount = isDaisyCutter ? 30 : 12;
    for (let i = 0; i < mistCount; i++) {
        const ang = (i / mistCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.32;
        const ringFrac = 0.25 + ((i % 4) / 3) * 0.75;
        const ringR = ringFrac * (isDaisyCutter ? 18.5 : 8.5) * blastScale;
        const col = (i % 5 === 0) ? 0xc4fa7a : ((i % 2 === 0) ? 0xefe30a : 0xdcc914); // Official R:239,227,10 & R:196,250,122
        const puff = makeVolSprite(smokeTex, col, 0.0, false);
        puff.position.set(0, 1.0 + Math.random() * 1.2, 0);
        puff.scale.setScalar(1.2);
        mistGroup.add(puff);
        mistPuffs.push({
            mesh: puff,
            tx: Math.cos(ang) * ringR,
            tz: Math.sin(ang) * ringR,
            ty: 1.2 + Math.random() * (isDaisyCutter ? 3.8 : 1.8),
            maxScale: (5.2 + Math.random() * 3.8) * blastScale
        });
    }

    // Initial burster pop (BuggySubExplosion)
    if (typeof spawnMuzzleFlash === 'function') {
        spawnMuzzleFlash(new THREE.Vector3(center.x, center.y + 1.8, center.z), 0xffe44d, isDaisyCutter ? 2.0 : 1.1);
    }

    // --- STAGE 2-3 meshes (created at ignition) ---
    let ignited = false;
    let igniteTick = 0;
    let wilsonDome = null;
    let shockRing1 = null;
    let shockRing2 = null;
    let dustSkirt = null;
    const fireWall = [];
    const smokeCol = [];

    const triggerThermobaricIgnition = () => {
        ignited = true;
        if (soundType !== 'none' && typeof playUSASound === 'function') {
            playUSASound(soundType, { pos: center });
        }
        if (typeof onIgnite === 'function') {
            try { onIgnite(center); } catch (_) {}
        }
        if (typeof triggerScreenShake === 'function') {
            triggerScreenShake(isDaisyCutter ? 2.1 : 1.0);
        }

        // 1. Official DaisyFlameShockwave: outward wall of roaring additive fire sprites across the entire fuel cloud!
        const wallCount = isDaisyCutter ? 32 : 14;
        for (let i = 0; i < wallCount; i++) {
            const ang = (i / wallCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
            const isCore = i < Math.floor(wallCount * 0.25);
            const col = isCore ? 0xfff3a8 : ((i % 3 === 0) ? 0xffcc33 : ((i % 3 === 1) ? 0xff7718 : 0xe84118));
            const spr = makeVolSprite(fireTex || smokeTex, col, 0.95, true);
            const startR = isCore ? (Math.random() * 3.5 * blastScale) : ((3.0 + Math.random() * 6.0) * blastScale);
            spr.position.set(Math.cos(ang) * startR, 1.4 + Math.random() * 2.4, Math.sin(ang) * startR);
            const initS = (isCore ? 6.5 : 4.2) * blastScale;
            spr.scale.setScalar(initS);
            rootGrp.add(spr);
            fireWall.push({
                mesh: spr,
                vx: Math.cos(ang) * (isCore ? 0.08 : (0.21 + Math.random() * 0.14)) * blastScale,
                vy: (isCore ? 0.13 : (0.06 + Math.random() * 0.08)) * blastScale,
                vz: Math.sin(ang) * (isCore ? 0.08 : (0.21 + Math.random() * 0.14)) * blastScale,
                baseScale: initS,
                maxGrow: (isCore ? 12.5 : 10.0) * blastScale
            });
        }

        // 2. Translucent white Wilson condensation dome (atmospheric overpressure flash)
        const wilsonGeo = new THREE.SphereGeometry(1.0, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.52);
        const wilsonMat = new THREE.MeshBasicMaterial({
            color: 0xf4f7fa,
            transparent: true,
            opacity: 0.30,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        wilsonDome = track(wilsonGeo, wilsonMat);
        wilsonDome.position.y = 0.1;
        rootGrp.add(wilsonDome);

        // 3. Ground-hugging amber flame shockwave ring + outer supersonic white Mach ring
        const ring1Geo = new THREE.RingGeometry(0.72, 1.0, 48);
        ring1Geo.rotateX(-Math.PI / 2);
        const ring1Mat = new THREE.MeshBasicMaterial({ color: 0xffd56b, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
        shockRing1 = track(ring1Geo, ring1Mat);
        shockRing1.position.y = 0.35;
        rootGrp.add(shockRing1);

        const ring2Geo = new THREE.RingGeometry(0.88, 1.0, 48);
        ring2Geo.rotateX(-Math.PI / 2);
        const ring2Mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
        shockRing2 = track(ring2Geo, ring2Mat);
        shockRing2.position.y = 0.55;
        rootGrp.add(shockRing2);

        const skirtGeo = new THREE.TorusGeometry(1.0, 0.14, 8, 32);
        skirtGeo.rotateX(Math.PI / 2);
        const skirtMat = new THREE.MeshBasicMaterial({ color: 0x9b8365, transparent: true, opacity: 0.55, depthWrite: false });
        dustSkirt = track(skirtGeo, skirtMat);
        dustSkirt.position.y = 0.85;
        rootGrp.add(dustSkirt);

        // 4. Rising volumetric dark smoke column (textured smoke sprites, stem + cap)
        const smokeCount = isDaisyCutter ? 18 : 9;
        for (let i = 0; i < smokeCount; i++) {
            const isCap = i >= Math.floor(smokeCount * 0.45);
            const ang = (i / smokeCount) * Math.PI * 2 + Math.random() * 0.6;
            const capR = isCap ? (3.0 + Math.random() * 6.0) * blastScale : (0.8 + Math.random() * 1.8) * blastScale;
            const puff = makeVolSprite(smokeTex, isCap ? 0x262422 : 0x3a322c, 0.0, false);
            puff.position.set(Math.cos(ang) * capR * 0.3, isCap ? 4.0 * blastScale : 1.2, Math.sin(ang) * capR * 0.3);
            rootGrp.add(puff);
            smokeCol.push({
                mesh: puff,
                isCap,
                tx: Math.cos(ang) * capR,
                tz: Math.sin(ang) * capR,
                riseSpeed: (isCap ? 0.095 : 0.06) * blastScale * (0.85 + Math.random() * 0.35),
                baseScale: (isCap ? 7.5 : 4.5) * blastScale * (0.85 + Math.random() * 0.4)
            });
        }

        // 5. Scorched ground crater + perimeter flame ignition (DaisyCutterFlameWeapon) + flying debris
        if (typeof spawnCraterDecal === 'function') spawnCraterDecal(center, isDaisyCutter ? 10.5 : 5.2, 720, 'flame');
        if (typeof spawnNapalmScorchPool === 'function') spawnNapalmScorchPool(center);
        if (typeof spawnExplosionDebris === 'function') spawnExplosionDebris(center, isDaisyCutter ? 14 : 7, 1.5 * blastScale, false);
    };

    const maxPostIgnite = isDaisyCutter ? 300 : 155;
    let totalTick = 0;

    const cleanup = () => {
        scene.remove(rootGrp);
        for (let i = 0; i < ownedGeos.length; i++) {
            try { ownedGeos[i].dispose(); } catch (_) {}
        }
        for (let i = 0; i < ownedMats.length; i++) {
            try { ownedMats[i].dispose(); } catch (_) {}
        }
    };

    activeFX.push({
        persistent: true,
        dispose: cleanup,
        group: rootGrp,
        dispose: cleanup,
        update() {
            totalTick++;

            // Stage 1 & 2: Yellow-gold aerosol fuel vapor expands outward, then sparks with yellow-green/amber ignition flashes!
            if (!ignited) {
                const p = Math.min(1, totalTick / dispersalTicks);
                const ease = 1 - Math.pow(1 - p, 2);
                for (let i = 0; i < mistPuffs.length; i++) {
                    const mp = mistPuffs[i];
                    mp.mesh.position.set(mp.tx * ease, mp.ty * (0.5 + 0.5 * ease), mp.tz * ease);
                    mp.mesh.scale.setScalar(1.2 + mp.maxScale * ease);
                    mp.mesh.material.opacity = Math.sin(p * Math.PI * 0.85) * 0.52;
                }
                // Stage 2: DaisyExplosionScatterIgnite1 & 2 (yellow-green -> golden ignition flashes inside the gas cloud)
                if (totalTick >= igniteFlashStart && (totalTick % 4 === 0) && typeof spawnMuzzleFlash === 'function') {
                    const ang = Math.random() * Math.PI * 2;
                    const rr = Math.random() * (isDaisyCutter ? 14.0 : 6.0) * blastScale;
                    const flashPos = new THREE.Vector3(center.x + Math.cos(ang) * rr, center.y + 1.2 + Math.random() * 2.5, center.z + Math.sin(ang) * rr);
                    spawnMuzzleFlash(flashPos, (totalTick % 8 === 0) ? 0xd3f843 : 0xffda6a, isDaisyCutter ? 2.6 : 1.4);
                }
                if (totalTick >= dispersalTicks) {
                    mistGroup.visible = false;
                    triggerThermobaricIgnition();
                }
                return true;
            }

            igniteTick++;

            // Roaring volumetric flame shockwave wall (0..96 ticks — slow, heavy thermobaric roll)
            const wp = Math.min(1, igniteTick / 96);
            for (let i = 0; i < fireWall.length; i++) {
                const fl = fireWall[i];
                fl.mesh.position.x += fl.vx * (1 - wp * 0.65);
                fl.mesh.position.y += fl.vy * (1 - wp * 0.55);
                fl.mesh.position.z += fl.vz * (1 - wp * 0.65);
                fl.mesh.scale.setScalar(fl.baseScale + Math.sin(wp * Math.PI * 0.78) * fl.maxGrow);
                fl.mesh.material.opacity = Math.max(0, (1 - wp * wp) * 0.92);
                fl.mesh.visible = wp < 1;
            }

            // Wilson condensation pressure dome (0..72 ticks)
            if (wilsonDome) {
                const cp = Math.min(1, igniteTick / 72);
                const wScale = (5.0 + cp * 24.0) * blastScale;
                wilsonDome.scale.set(wScale, wScale * 0.58, wScale);
                wilsonDome.material.opacity = Math.max(0, (1 - cp) * 0.30);
                wilsonDome.visible = cp < 1;
            }

            // Ground-hugging flame & supersonic Mach shockwave rings
            if (shockRing1) {
                const sp1 = Math.min(1, igniteTick / 66);
                const s1 = (2.5 + sp1 * 26.0) * blastScale;
                shockRing1.scale.set(s1, 1, s1);
                shockRing1.material.opacity = Math.max(0, (1 - sp1) * 0.92);
                shockRing1.visible = sp1 < 1;
            }
            if (shockRing2) {
                const sp2 = Math.min(1, igniteTick / 52);
                const s2 = (3.0 + sp2 * 31.0) * blastScale;
                shockRing2.scale.set(s2, 1, s2);
                shockRing2.material.opacity = Math.max(0, (1 - sp2) * 0.72);
                shockRing2.visible = sp2 < 1;
            }
            if (dustSkirt) {
                const dp = Math.min(1, igniteTick / 110);
                const ds = (3.0 + dp * 22.0) * blastScale;
                dustSkirt.scale.set(ds, 1 + dp * 2.2, ds);
                dustSkirt.material.opacity = Math.max(0, (1 - dp) * 0.55);
                dustSkirt.visible = dp < 1;
            }

            // Rising volumetric dark smoke column
            for (let i = 0; i < smokeCol.length; i++) {
                const sm = smokeCol[i];
                const sp = Math.min(1, Math.max(0, (igniteTick - 10) / (maxPostIgnite - 10)));
                sm.mesh.position.y += sm.riseSpeed * (1 - sp * 0.55);
                sm.mesh.position.x = sm.tx * (0.35 + sp * 0.85);
                sm.mesh.position.z = sm.tz * (0.35 + sp * 0.85);
                sm.mesh.scale.setScalar(sm.baseScale * (0.65 + sp * 1.25));
                const fadeIn = Math.min(1, Math.max(0, (igniteTick - 10) / 20));
                const fadeOut = Math.max(0, 1 - Math.pow(sp, 1.8));
                sm.mesh.material.opacity = fadeIn * fadeOut * (sm.isCap ? 0.65 : 0.52);
            }

            if (igniteTick >= maxPostIgnite) {
                cleanup();
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

// Update all FX every frame (with hard safety cap to keep draw calls bounded in massive battles;
// never evict persistent gameplay flyovers/crates/superweapons like Supply Drop C-130s!)
const MAX_ACTIVE_FX = 450;
function updateFXEngine() {
    let evictScanIdx = 0;
    while (activeFX.length > MAX_ACTIVE_FX && evictScanIdx < activeFX.length) {
        if (activeFX[evictScanIdx] && activeFX[evictScanIdx].persistent) {
            evictScanIdx++;
            continue;
        }
        const oldest = activeFX.splice(evictScanIdx, 1)[0];
        if (oldest) {
            if (typeof oldest.dispose === 'function') { try { oldest.dispose(); } catch (_) {} }
            else if (oldest.mesh && typeof disposeSceneNodeSafe === 'function') disposeSceneNodeSafe(oldest.mesh);
            else if (oldest.group && typeof disposeSceneNodeSafe === 'function') disposeSceneNodeSafe(oldest.group);
        }
    }
    for (let i = activeFX.length - 1; i >= 0; i--) {
        const fx = activeFX[i];
        let alive = false;
        try {
            alive = !!(fx && typeof fx.update === 'function' && fx.update());
        } catch (_) {
            if (fx && typeof fx.dispose === 'function') { try { fx.dispose(); } catch (_e) {} }
            alive = false;
        }
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
    updateVehicleTrackMarks();
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
    const fireTex = _getFxSpriteTex('fireball');
    const patchGeo = new THREE.PlaneGeometry(7.2, 7.2);
    patchGeo.rotateX(-Math.PI / 2);
    const patchMat = new THREE.MeshBasicMaterial({
            ...(fireTex ? { map: fireTex } : {}),
            color: 0xff7b1a,
            transparent: true,
            opacity: 0.82,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            polygonOffset: true,
            polygonOffsetFactor: -3,
            polygonOffsetUnits: -3
    });
    const patch = new THREE.Mesh(patchGeo, patchMat);
    const py = typeof getTerrainHeight === 'function' ? getTerrainHeight(pos.x, pos.z) : (pos.y || 0);
    patch.position.set(pos.x, py + 0.18, pos.z);
    patch.rotation.y = Math.random() * Math.PI * 2;
    patch.renderOrder = 3;
    scene.add(patch);

    let fireLife = 360; // ~6.0 seconds of glowing molten scorch trail
    activeFX.push({
            life: fireLife,
            update() {
                fireLife--;
                patchMat.opacity = 0.72 * Math.min(1, fireLife / 90) * (0.78 + Math.sin(fireLife * 0.35) * 0.22);
                if (fireLife % 14 === 0 && typeof spawnSmokePuff === 'function' && activeFX.length < 480) {
                    spawnSmokePuff(patch.position, (fireLife % 28 === 0) ? 0xff6b1a : 0x2b2d32, 0.52);
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
    if (typeof triggerScreenShake === 'function') triggerScreenShake(0.7);

    // Bright electric-blue flash overlay (official Generals Particle Cannon ignition & orbital impact flash)
    const triggerBlueParticleFlash = (peakOpacity = 0.65, fadeMs = 620) => {
        if (typeof document === 'undefined' || !document.body) return;
        const fl = document.createElement('div');
        fl.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:9998;background:radial-gradient(circle, rgba(220,250,255,${peakOpacity}) 0%, rgba(0,185,255,${(peakOpacity * 0.78).toFixed(2)}) 55%, rgba(0,95,255,${(peakOpacity * 0.42).toFixed(2)}) 100%);transition:opacity ${fadeMs}ms ease-out;opacity:1;`;
        document.body.appendChild(fl);
        requestAnimationFrame(() => { fl.style.opacity = '0'; });
        setTimeout(() => { if (fl.parentNode) fl.parentNode.removeChild(fl); }, fadeMs + 60);
    };

    const UPLINK_DELAY = uplinkPos ? 72 : 0; // 1.2s upward beam travel to orbital satellite before reflection strike
    const group = new THREE.Group();
    group.position.copy(targetPos);
    group.visible = (UPLINK_DELAY === 0);
    window.activeParticleCannonTarget = targetPos.clone();
    window.activeParticleCannonPlayerOwned = !!isPlayerOwned;
    window.activeParticleCannonControl = !!isPlayerOwned;
    window.activeParticleCannonSpeed = 0.42;
    if (isPlayerOwned) setParticleBeamCursor(true);

    const addBlend = typeof THREE.AdditiveBlending !== 'undefined' ? { blending: THREE.AdditiveBlending } : {};

    // 1. Blinding solid white-hot core + intense cyan-blue orbital plasma column
    const coreGeo = new THREE.CylinderGeometry(0.85, 1.35, 140, 16);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: false, opacity: 1.0 });
    const coreBeam = new THREE.Mesh(coreGeo, coreMat);
    coreBeam.position.y = 70;
    coreBeam.renderOrder = 6;
    group.add(coreBeam);

    const beamGeo = new THREE.CylinderGeometry(1.85, 3.4, 140, 20, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x38f6ff, transparent: true, opacity: 0.94, side: THREE.DoubleSide, depthWrite: false, ...addBlend });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 70;
    beam.renderOrder = 5;
    group.add(beam);

    // Massive bright ground impact radial blue plasma glow halo (official ParticleCannonUplink_HitFlare)
    let glowTex = null;
    if (typeof document !== 'undefined' && document.createElement) {
        const gCan = document.createElement('canvas');
        gCan.width = gCan.height = 128;
        const gCtx = gCan.getContext('2d');
        if (gCtx) {
            const grad = gCtx.createRadialGradient(64, 64, 2, 64, 64, 64);
            grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
            grad.addColorStop(0.32, 'rgba(185, 248, 255, 1.0)');
            grad.addColorStop(0.62, 'rgba(25, 195, 255, 0.82)');
            grad.addColorStop(0.84, 'rgba(0, 120, 255, 0.36)');
            grad.addColorStop(1.0, 'rgba(0, 80, 255, 0.0)');
            gCtx.fillStyle = grad;
            gCtx.fillRect(0, 0, 128, 128);
            glowTex = new THREE.CanvasTexture(gCan);
        }
    }
    const flareGeo = new THREE.PlaneGeometry(82, 82);
    flareGeo.rotateX(-Math.PI / 2);
    const flareMat = new THREE.MeshBasicMaterial({
        color: 0x5ce6ff,
        map: glowTex,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
        ...addBlend
    });
    const flareDisc = new THREE.Mesh(flareGeo, flareMat);
    flareDisc.position.y = 0.65;
    flareDisc.renderOrder = 10;
    group.add(flareDisc);

    // Massive bright blue atmospheric plasma bloom dome around impact base
    const domeGeo = new THREE.SphereGeometry(14.5, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const domeMat = new THREE.MeshBasicMaterial({
        color: 0x22d8ff,
        transparent: true,
        opacity: 0.64,
        side: THREE.DoubleSide,
        depthWrite: false,
        ...addBlend
    });
    const plasmaDome = new THREE.Mesh(domeGeo, domeMat);
    plasmaDome.position.y = 0.3;
    plasmaDome.scale.set(1.35, 1.65, 1.35);
    plasmaDome.renderOrder = 9;
    group.add(plasmaDome);

    const impactCoreGeo = new THREE.CircleGeometry(7.2, 24);
    impactCoreGeo.rotateX(-Math.PI / 2);
    const impactCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: false, opacity: 1.0, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
    const impactCore = new THREE.Mesh(impactCoreGeo, impactCoreMat);
    impactCore.position.y = 0.72;
    impactCore.renderOrder = 11;
    group.add(impactCore);

    // 2. Rotating orbital energy vortex rings
    const rings = [];
    for (let i = 0; i < 5; i++) {
        const rGeo = new THREE.RingGeometry(2.6 + i * 0.85, 3.45 + i * 0.85, 24);
        rGeo.rotateX(-Math.PI / 2);
        const rMat = new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xffffff : 0x48f4ff, transparent: true, opacity: 0.96, side: THREE.DoubleSide, depthWrite: false, ...addBlend });
        const r = new THREE.Mesh(rGeo, rMat);
        r.position.y = 1.2 + i * 16;
        r.renderOrder = 5;
        group.add(r);
        rings.push(r);
    }

    scene.add(group);

    // Uplink Beam shooting straight up from the Particle Cannon's risen dish into orbit (reflects off orbital satellite)
    let uplinkGroup = null;
    let upCore = null;
    let upSheath = null;
    let upBloom = null;
    let upDishFlash = null;
    const uplinkRings = [];
    if (uplinkPos) {
        uplinkGroup = new THREE.Group();
        uplinkGroup.position.copy(uplinkPos);
        upCore = new THREE.Mesh(
            new THREE.CylinderGeometry(0.75, 0.95, 220, 14),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: false, opacity: 1.0 })
        );
        upCore.position.y = 110;
        upCore.scale.set(1, 0.02, 1);
        uplinkGroup.add(upCore);
        upSheath = new THREE.Mesh(
            new THREE.CylinderGeometry(1.9, 2.6, 220, 16, 1, true),
            new THREE.MeshBasicMaterial({ color: 0x38f6ff, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false, ...addBlend })
        );
        upSheath.position.y = 110;
        upSheath.scale.set(1, 0.02, 1);
        uplinkGroup.add(upSheath);
        upBloom = new THREE.Mesh(
            new THREE.CylinderGeometry(3.4, 4.6, 220, 16, 1, true),
            new THREE.MeshBasicMaterial({ color: 0x00a2ff, transparent: true, opacity: 0.56, side: THREE.DoubleSide, depthWrite: false, ...addBlend })
        );
        upBloom.position.y = 110;
        upBloom.scale.set(1, 0.02, 1);
        uplinkGroup.add(upBloom);
        // Bright blue ignition flash sphere at the risen dish
        upDishFlash = new THREE.Mesh(
            new THREE.SphereGeometry(5.5, 16, 12),
            new THREE.MeshBasicMaterial({ color: 0x80f0ff, transparent: true, opacity: 0.95, depthWrite: false, ...addBlend })
        );
        upDishFlash.position.y = 1.5;
        uplinkGroup.add(upDishFlash);
        for (let ur = 0; ur < 5; ur++) {
            const urGeo = new THREE.RingGeometry(1.4, 2.2, 20);
            urGeo.rotateX(-Math.PI / 2);
            const urMesh = new THREE.Mesh(urGeo, new THREE.MeshBasicMaterial({ color: 0x74f0ff, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false, ...addBlend }));
            urMesh.position.y = 4 + ur * 36;
            uplinkGroup.add(urMesh);
            uplinkRings.push(urMesh);
        }
        scene.add(uplinkGroup);
        triggerBlueParticleFlash(0.42, 480);
    }

    // Outer wide atmospheric electric-blue bloom sheath around the main orbital beam
    const outerBloomGeo = new THREE.CylinderGeometry(3.4, 5.8, 140, 20, 1, true);
    const outerBloomMat = new THREE.MeshBasicMaterial({ color: 0x00a2ff, transparent: true, opacity: 0.58, side: THREE.DoubleSide, depthWrite: false, ...addBlend });
    const outerBloom = new THREE.Mesh(outerBloomGeo, outerBloomMat);
    outerBloom.position.y = 70;
    outerBloom.renderOrder = 4;
    group.add(outerBloom);

    const disposeParticleBeam = () => {
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
            uplinkGroup = null;
        }
    };

    const totalDuration = duration + UPLINK_DELAY;
    let life = totalDuration;
    let elapsed = 0;
    let strikeStarted = (UPLINK_DELAY === 0);
    let impactFlashSphere = null;
    let impactFlashLife = 0;
    const originCenter = targetPos.clone();
    const lastScorchPos = new THREE.Vector3(1e9, 0, 1e9);

    if (strikeStarted) {
        playAudio('orbital_beam');
        triggerBlueParticleFlash(0.68, 650);
    }

    activeFX.push({
            persistent: true,
            group: group,
            life: totalDuration,
            dispose: disposeParticleBeam,
            update() {
                life--;
                elapsed++;
                // Low-Power shutoff: if owner's base enters Low Power while firing, shut off beam immediately
                if (isPlayerOwned && typeof window !== 'undefined' && window.isPlayerLowPower) {
                    disposeParticleBeam();
                    if (typeof showNotification === 'function') {
                        showNotification('⚡ PARTICLE CANNON OFFLINE: Low Power — beam shut off!', 'error');
                    }
                    return false;
                }
                // Animate upward orbital uplink beam shooting straight up from the risen dish to the satellite
                if (uplinkGroup) {
                    const shootFrac = Math.min(1, elapsed / Math.max(1, UPLINK_DELAY * 0.55));
                    const beamYScale = Math.max(0.02, shootFrac);
                    const upPulse = 0.92 + Math.sin(elapsed * 0.55) * 0.14;
                    if (upCore) { upCore.scale.set(upPulse, beamYScale, upPulse); upCore.position.y = 110 * beamYScale; }
                    if (upSheath) { upSheath.scale.set(upPulse, beamYScale, upPulse); upSheath.position.y = 110 * beamYScale; }
                    if (upBloom) { upBloom.scale.set(upPulse, beamYScale, upPulse); upBloom.position.y = 110 * beamYScale; }
                    if (upDishFlash) {
                        const fProg = Math.min(1, elapsed / 26);
                        upDishFlash.scale.setScalar(1.0 + fProg * 3.2);
                        upDishFlash.material.opacity = Math.max(0, 0.95 * (1 - fProg));
                    }
                    for (let ui = 0; ui < uplinkRings.length; ui++) {
                        uplinkRings[ui].position.y += 4.2;
                        if (uplinkRings[ui].position.y > 195 * beamYScale) uplinkRings[ui].position.y = 4;
                    }
                }

                // Stage 1 -> Stage 2 transition: orbital satellite reflects beam down onto target with bright blue flash!
                if (!strikeStarted) {
                    if (elapsed < UPLINK_DELAY) return true;
                    strikeStarted = true;
                    group.visible = true;
                    playAudio('orbital_beam');
                    if (typeof triggerScreenShake === 'function') triggerScreenShake(1.4);
                    triggerBlueParticleFlash(0.72, 680);
                    const tY = typeof getTerrainHeight === 'function' ? getTerrainHeight(originCenter.x, originCenter.z) : 0;
                    group.position.set(originCenter.x, tY, originCenter.z);
                    impactFlashSphere = new THREE.Mesh(
                        new THREE.SphereGeometry(4.5, 16, 12),
                        new THREE.MeshBasicMaterial({ color: 0xa8f4ff, transparent: true, opacity: 0.98, depthWrite: false, ...addBlend })
                    );
                    impactFlashSphere.position.y = 2.0;
                    impactFlashSphere.renderOrder = 12;
                    group.add(impactFlashSphere);
                    impactFlashLife = 28;
                    spawnCraterDecal(group.position, 4.8, 1800, 'ion');
                    lastScorchPos.copy(group.position);
                }
                if (impactFlashSphere && impactFlashLife > 0) {
                    impactFlashLife--;
                    const fp = 1 - impactFlashLife / 28;
                    impactFlashSphere.scale.setScalar(1 + fp * 5.2);
                    impactFlashSphere.material.opacity = 0.98 * (1 - fp);
                    if (impactFlashLife <= 0) impactFlashSphere.visible = false;
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
                outerBloom.scale.set(1.0 + Math.sin(life * 0.35) * 0.22, 1, 1.0 + Math.sin(life * 0.35) * 0.22);
                flareDisc.scale.setScalar(0.92 + Math.sin(life * 0.5) * 0.22);
                plasmaDome.scale.set(1.3 + Math.sin(life * 0.45) * 0.18, 1.8 + Math.cos(life * 0.55) * 0.25, 1.3 + Math.sin(life * 0.45) * 0.18);
                impactCore.scale.setScalar(0.85 + Math.cos(life * 0.7) * 0.2);

                rings.forEach((r, idx) => {
                        r.rotation.z += 0.16 * (idx % 2 === 0 ? 1 : -1);
                        r.position.y -= 1.15;
                        if (r.position.y < 1.0) r.position.y = 75;
                        r.scale.setScalar(1 + Math.sin(Date.now() * 0.02 + idx) * 0.24);
                });

                // Ground electrical sizzle, molten scorch, shockwave rings & sparks
                if (Math.random() < 0.92) {
                    spawnSparks(group.position, 0x00f2fe, 12);
                    if (Math.random() < 0.6) spawnSparks(group.position, 0xffffff, 6);
                    spawnSmokePuff(group.position, 0x222f3e, 0.95);
                }
                if (life % 14 === 0) {
                    if (typeof revealFogOfWarAt === 'function') revealFogOfWarAt(group.position, 24, 90);
                    const swGeo = new THREE.RingGeometry(2.6, 5.2, 32);
                    swGeo.rotateX(-Math.PI / 2);
                    const swMat = new THREE.MeshBasicMaterial({ color: 0x70f4ff, transparent: true, opacity: 1.0, side: THREE.DoubleSide, depthWrite: false, depthTest: false, ...addBlend });
                    const sw = new THREE.Mesh(swGeo, swMat);
                    sw.position.set(group.position.x, group.position.y + 0.75, group.position.z);
                    sw.renderOrder = 10;
                    scene.add(sw);
                    let swLife = 26;
                    activeFX.push({
                            mesh: sw,
                            life: swLife,
                            update() {
                                swLife--;
                                const prog = 1 - swLife / 26;
                                sw.scale.setScalar(1 + prog * 5.8);
                                swMat.opacity = 1.0 * (1 - prog);
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

                // Continuous molten scorch trail carved along the beam's dragged path (iconic Zero Hour Particle Cannon burn scar)
                if (life % 4 === 0) {
                    const dxS = group.position.x - lastScorchPos.x;
                    const dzS = group.position.z - lastScorchPos.z;
                    if (dxS * dxS + dzS * dzS >= 2.25 || life % 24 === 0) {
                        spawnCraterDecal(group.position, 5.4, 1800, 'ion');
                        lastScorchPos.copy(group.position);
                    }
                }
                // Continuous high-frequency thermal damage tick (every 0.1s = 6 ticks; melts heavy tanks & structures in 1.5-2s)
                if (life % 6 === 0) {
                    const beamPos = group.position;
                    [...units, ...enemyUnits].forEach(u => {
                            if (u.health > 0 && u.mesh && u.mesh.position.distanceTo(beamPos) <= 8.5) {
                                if (typeof applyCalculatedDamage === 'function') {
                                    applyCalculatedDamage(null, u, 55, 'LASER');
                                } else {
                                    u.health -= 55;
                                }
                            }
                    });
                    [...structures, ...enemyStructures].forEach(struct => {
                            if (struct.health > 0 && struct.position && struct.position.distanceTo(beamPos) <= 11.5) {
                                if (typeof applyCalculatedDamage === 'function') {
                                    applyCalculatedDamage(null, struct, 85, 'LASER');
                                } else {
                                    struct.health -= 85;
                                }
                            }
                    });
                }
                if (life % 12 === 0) {
                    spawnParticleFirePatch(group.position);
                    if (life % 70 === 0 && typeof playAudio === 'function') playAudio('particle_annihilate', { volume: 0.72 });
                }

                if (life <= 0) {
                    const finalPos = group.position.clone();
                    disposeParticleBeam();
                    spawnEnhancedExplosion(finalPos, 0x00d2d3, 3.4, true, 'particle_annihilate');
                    spawnCraterDecal(finalPos, 5.2, 1800, 'ion');
                    // Vent cooling steam from the Particle Cannon structure upon beam shutdown
                    if (uplinkPos && typeof spawnSmokePuff === 'function') {
                        for (let sv = 0; sv < 8; sv++) {
                            const sa = (sv / 8) * Math.PI * 2;
                            spawnSmokePuff(
                                uplinkPos.clone().add(new THREE.Vector3(Math.cos(sa) * 2.4, 0.8 + Math.random() * 1.6, Math.sin(sa) * 2.4)),
                                sv % 2 === 0 ? 0xf1f2f6 : 0xbceeff,
                                1.35
                            );
                        }
                    }
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

    // Official INIZH.big NeutronMissile DeliveryDecalRadius = 210 * 0.216 = 45.4u (outer blast) & Blast6InnerRadius = 60 * 0.216 = 13.0u (ground zero)
    const NUKE_INNER_RADIUS = 13.0;
    const NUKE_OUTER_RADIUS = 45.4;
    const NUKE_RAD_RADIUS = 43.2; // NukeRadiationFieldWeapon PrimaryDamageRadius = 200 * 0.216

    // Target Warning Hazard Reticle on the Ground (matches official DeliveryDecalRadius)
    const warnGroup = new THREE.Group();
    const tGroundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(targetPos.x, targetPos.z) : 0;
    warnGroup.position.set(targetPos.x, tGroundY + 0.5, targetPos.z);
    const warnRing = new THREE.Mesh(
        new THREE.RingGeometry(NUKE_OUTER_RADIUS - 1.2, NUKE_OUTER_RADIUS, 48),
        new THREE.MeshBasicMaterial({ color: 0xff2222, side: THREE.DoubleSide, transparent: true, opacity: 0.65, depthWrite: false, depthTest: false })
    );
    warnRing.rotation.x = -Math.PI / 2;
    warnRing.renderOrder = 10;
    warnGroup.add(warnRing);

    const warnInner = new THREE.Mesh(
        new THREE.RingGeometry(NUKE_INNER_RADIUS - 0.8, NUKE_INNER_RADIUS, 36),
        new THREE.MeshBasicMaterial({ color: 0xff5252, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false })
    );
    warnInner.rotation.x = -Math.PI / 2;
    warnInner.renderOrder = 10;
    warnGroup.add(warnInner);

    const warnCore = new THREE.Mesh(
        new THREE.RingGeometry(2.2, 3.4, 24),
        new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false })
    );
    warnCore.rotation.x = -Math.PI / 2;
    warnCore.renderOrder = 10;
    warnGroup.add(warnCore);
    scene.add(warnGroup);

    // 1. Ascending Official EA NBNRocket.W3D ICBM from Silo with booster ignition plume & billowing launch smoke
    const missileGroup = new THREE.Group();
    const origin = (siloPos ? siloPos.clone().add(new THREE.Vector3(-3.5, 1.5, -5.2)) : targetPos.clone());
    missileGroup.position.copy(origin);

    if (typeof createW3DBuildingMesh === 'function' && window.W3D_BUILDING_DATA && window.W3D_BUILDING_DATA['china_nukeRocket']) {
        const w3dRocket = createW3DBuildingMesh('china_nukeRocket', false);
        missileGroup.add(w3dRocket);
    } else {
        const mGeo = new THREE.CylinderGeometry(0.45, 0.52, 4.8, 12);
        const mMat = new THREE.MeshStandardMaterial({ color: 0xecf0f1, metalness: 0.8, roughness: 0.2 });
        missileGroup.add(new THREE.Mesh(mGeo, mMat));
        const noseGeo = new THREE.ConeGeometry(0.45, 1.5, 12);
        const nose = new THREE.Mesh(noseGeo, new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.3 }));
        nose.position.y = 3.15;
        missileGroup.add(nose);
    }

    const plumeGeo = new THREE.ConeGeometry(1.15, 5.4, 12);
    plumeGeo.rotateX(Math.PI);
    const plumeMat = new THREE.MeshBasicMaterial({ color: 0xffb142, transparent: true, opacity: 0.95 });
    const plume = new THREE.Mesh(plumeGeo, plumeMat);
    plume.position.y = -2.7;
    missileGroup.add(plume);

    scene.add(missileGroup);
    if (siloPos) {
        // Official FX_NeutronMissileLaunch: billowing pressurized silo ignition cloud & camera rumble
        if (typeof triggerScreenShake === 'function') triggerScreenShake(0.85);
        if (typeof spawnMuzzleFlash === 'function') spawnMuzzleFlash(origin.clone().add(new THREE.Vector3(0, 1.5, 0)), 0xffdd59, 4.2);
        for (let s = 0; s < 18; s++) {
            const ang = (s / 18) * Math.PI * 2;
            const rad = 2.0 + Math.random() * 6.5;
            spawnSmokePuff(
                origin.clone().add(new THREE.Vector3(Math.cos(ang) * rad, 0.8 + Math.random() * 3.0, Math.sin(ang) * rad)),
                s % 3 === 0 ? 0xff9f43 : (s % 2 === 0 ? 0xf1f2f6 : 0xb2bec3),
                2.0 + Math.random() * 1.4
            );
        }
    }

    let phase = 'ascent';
    let frame = 0;
    let cruiseFrame = 0;
    const CRUISE_TICKS = 175; // Combined with ~65 ascent ticks = 4.0s total travel delay before steep 80-deg reentry
    let descentStartX = targetPos.x + 24;
    let descentStartZ = targetPos.z - 12;

    activeFX.push({
            persistent: true,
            group: missileGroup,
            life: 440,
            update() {
                frame++;
                const pulse = 0.5 + 0.5 * Math.sin(frame * 0.25);
                warnRing.material.opacity = 0.30 + pulse * 0.35;
                warnInner.material.opacity = 0.45 + pulse * 0.40;
                warnCore.scale.setScalar(1.0 + Math.sin(frame * 0.35) * 0.25);
                plume.scale.set(0.85 + Math.random() * 0.35, 0.85 + Math.random() * 0.45, 0.85 + Math.random() * 0.35);

                if (phase === 'ascent') {
                    // Authentic heavy ICBM liftoff: gradual acceleration straight up along Y-axis with roaring fire-and-smoke trail
                    const climbSpeed = frame < 18 ? (0.45 + frame * 0.09) : 2.35;
                    missileGroup.position.y += climbSpeed;
                    spawnSmokePuff(missileGroup.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, -2.5, (Math.random() - 0.5) * 1.4)), frame % 2 === 0 ? 0xff793f : 0xf1f2f6, 1.65);
                    if (frame < 26 && frame % 2 === 0 && siloPos) {
                        const a = Math.random() * Math.PI * 2;
                        const rr = 2.5 + Math.random() * 5.5;
                        spawnSmokePuff(origin.clone().add(new THREE.Vector3(Math.cos(a) * rr, 0.8 + Math.random() * 2.2, Math.sin(a) * rr)), 0xdcdde1, 1.9);
                    }
                    if (missileGroup.position.y > 145) {
                        phase = 'cruise';
                        cruiseFrame = 0;
                        missileGroup.visible = false;
                    }
                } else if (phase === 'cruise') {
                    cruiseFrame++;
                    if (cruiseFrame >= CRUISE_TICKS) {
                        phase = 'descent';
                        missileGroup.visible = true;
                        descentStartX = targetPos.x + 22;
                        descentStartZ = targetPos.z - 10;
                        missileGroup.position.set(descentStartX, 135, descentStartZ);
                        // Steep ~80-degree entry angle aimed directly at targetPos
                        missileGroup.rotation.set(Math.PI - 0.10, 0, -0.17);
                        if (typeof playAudio === 'function') playAudio('shell_whistle', { volume: 0.85 });
                    }
                } else if (phase === 'descent') {
                    const groundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(targetPos.x, targetPos.z) : 0;
                    const dropDist = Math.max(1, 135 - (groundY + 14.0));
                    missileGroup.position.y -= 3.8;
                    const frac = Math.min(1, Math.max(0, (135 - missileGroup.position.y) / dropDist));
                    missileGroup.position.x = descentStartX + (targetPos.x - descentStartX) * frac;
                    missileGroup.position.z = descentStartZ + (targetPos.z - descentStartZ) * frac;
                    spawnSmokePuff(missileGroup.position.clone().add(new THREE.Vector3(0, 3.0, 0)), frame % 2 === 0 ? 0xff5252 : 0xdcdde1, 1.35);
                    if (missileGroup.position.y <= groundY + 14.0) {
                        scene.remove(missileGroup);
                        missileGroup.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
                        scene.remove(warnGroup);
                        warnGroup.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });

                        // Official INIZH.big NeutronMissileSlowDeathBehavior Thermonuclear Detonation!
                        playAudio('nuke_detonation');
                        if (typeof revealFogOfWarAt === 'function') revealFogOfWarAt(targetPos, 50, 600);
                        if (typeof triggerScreenShake === 'function') triggerScreenShake(3.2);
                        // Massive towering mushroom cloud + 45.4u shockwave + 69u charred scorch decal (ScorchMarkSize = 320 * 0.216)
                        spawnMushroomCloud(targetPos, 1.85, NUKE_OUTER_RADIUS);
                        spawnCraterDecal(targetPos, 30.7, 2400, 'nuke');

                        // Multi-stage Blast Sequence (Blasts 1-5 shockwave sweep -> Blast 6 at 1180ms -> OCL_NukeRadiationField at 1750ms)
                        let detTick = 0;
                        let blast6Applied = false;
                        let radSpawned = false;
                        const blastCenter = targetPos.clone();
                        activeFX.push({
                            persistent: true,
                            life: 120,
                            update() {
                                detTick++;
                                // Blasts 1-5 (580ms-1000ms = ticks 35..60): fiery debris bursts along expanding shockwave front
                                if (detTick === 35 || detTick === 43 || detTick === 51 || detTick === 60) {
                                    const ringR = detTick === 35 ? 13.0 : (detTick === 43 ? 22.0 : (detTick === 51 ? 31.0 : 39.0));
                                    for (let k = 0; k < 6; k++) {
                                        const a = (k / 6) * Math.PI * 2 + detTick * 0.3;
                                        const p = new THREE.Vector3(blastCenter.x + Math.cos(a) * ringR, 0, blastCenter.z + Math.sin(a) * ringR);
                                        p.y = typeof getTerrainHeight === 'function' ? getTerrainHeight(p.x, p.z) + 0.6 : 0.6;
                                        if (typeof spawnSmokePuff === 'function') spawnSmokePuff(p, 0xff793f, 1.8);
                                    }
                                }

                                // Official Blast 6 at 1180ms (tick 71):
                                // Blast6InnerRadius = 60 (13.0u) -> 3500 dmg
                                // Blast6OuterRadius = 210 (45.4u) -> linear falloff 3500 -> 300 dmg
                                // Affects ALL units & structures (ALLIES, ENEMIES, NEUTRALS) just like Zero Hour!
                                if (!blast6Applied && detTick >= 71) {
                                    blast6Applied = true;
                                    const computeNukeDamage = (dist) => {
                                        if (dist <= NUKE_INNER_RADIUS) return 3500;
                                        const t = Math.min(1, (dist - NUKE_INNER_RADIUS) / (NUKE_OUTER_RADIUS - NUKE_INNER_RADIUS));
                                        return Math.round(3500 - t * (3500 - 300));
                                    };
                                    const allUnits = [
                                        ...(typeof units !== 'undefined' ? units : []),
                                        ...(typeof enemyUnits !== 'undefined' ? enemyUnits : [])
                                    ];
                                    for (let i = 0; i < allUnits.length; i++) {
                                        const u = allUnits[i];
                                        if (!u || u.health <= 0 || !u.mesh) continue;
                                        const dist = Math.hypot(u.mesh.position.x - blastCenter.x, u.mesh.position.z - blastCenter.z);
                                        if (dist <= NUKE_OUTER_RADIUS) {
                                            const dmg = computeNukeDamage(dist);
                                            if (typeof applyCalculatedDamage === 'function') applyCalculatedDamage(null, u, dmg, 'EXPLOSIVE');
                                            else u.health -= dmg;
                                        }
                                    }
                                    const allStructs = [
                                        ...(typeof structures !== 'undefined' ? structures : []),
                                        ...(typeof enemyStructures !== 'undefined' ? enemyStructures : [])
                                    ];
                                    for (let i = 0; i < allStructs.length; i++) {
                                        const st = allStructs[i];
                                        if (!st || st.health <= 0) continue;
                                        const pos = st.position || (st.mesh && st.mesh.position);
                                        if (!pos) continue;
                                        const dist = Math.hypot(pos.x - blastCenter.x, pos.z - blastCenter.z);
                                        if (dist <= NUKE_OUTER_RADIUS) {
                                            const dmg = computeNukeDamage(dist);
                                            if (typeof applyCalculatedDamage === 'function') applyCalculatedDamage(null, st, dmg, 'EXPLOSIVE');
                                            else st.health -= dmg;
                                        }
                                    }
                                }

                                // Official OCL_NukeRadiationField at Midpoint (1750ms = tick 105):
                                // PrimaryDamage = 25 RADIATION / 750ms (45 ticks), PrimaryDamageRadius = 200 (43.2u), Lifetime = 30s (1800 ticks)
                                if (!radSpawned && detTick >= 105) {
                                    radSpawned = true;
                                    const radGroundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(blastCenter.x, blastCenter.z) : 0;
                                    const radGroup = new THREE.Group();
                                    radGroup.position.set(blastCenter.x, radGroundY + 0.22, blastCenter.z);
                                    const radTex = _getFxSpriteTex('smoke');
                                    const flashTex = _getFxSpriteTex('flash');
                                    const addB = typeof THREE.AdditiveBlending !== 'undefined' ? { blending: THREE.AdditiveBlending } : {};

                                    const outerGeo = new THREE.PlaneGeometry(NUKE_RAD_RADIUS * 2.05, NUKE_RAD_RADIUS * 2.05);
                                    outerGeo.rotateX(-Math.PI / 2);
                                    const outerMat = new THREE.MeshBasicMaterial({
                                        ...(radTex ? { map: radTex } : {}),
                                        color: 0x76e018,
                                        transparent: true,
                                        opacity: 0.42,
                                        depthWrite: false,
                                        polygonOffset: true,
                                        polygonOffsetFactor: -2,
                                        polygonOffsetUnits: -2,
                                        ...addB
                                    });
                                    const outerDisc = new THREE.Mesh(outerGeo, outerMat);
                                    radGroup.add(outerDisc);

                                    const innerGeo = new THREE.PlaneGeometry(NUKE_RAD_RADIUS * 1.15, NUKE_RAD_RADIUS * 1.15);
                                    innerGeo.rotateX(-Math.PI / 2);
                                    const innerMat = new THREE.MeshBasicMaterial({
                                        ...(flashTex ? { map: flashTex } : {}),
                                        color: 0xc2ff38,
                                        transparent: true,
                                        opacity: 0.36,
                                        depthWrite: false,
                                        polygonOffset: true,
                                        polygonOffsetFactor: -3,
                                        polygonOffsetUnits: -3,
                                        ...addB
                                    });
                                    const innerDisc = new THREE.Mesh(innerGeo, innerMat);
                                    innerDisc.position.y = 0.06;
                                    radGroup.add(innerDisc);
                                    scene.add(radGroup);

                                    const disposeRad = () => {
                                        scene.remove(radGroup);
                                        radGroup.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
                                    };

                                    let radTicks = 0;
                                    const radDuration = 1800; // Official INIZH.big LifetimeUpdate = 30000ms (30s)
                                    activeFX.push({
                                        persistent: true,
                                        group: radGroup,
                                        life: radDuration,
                                        dispose: disposeRad,
                                        update() {
                                            radTicks++;
                                            const fadeIn = Math.min(1, radTicks / 45);
                                            const fadeOut = Math.min(1, (radDuration - radTicks) / 240);
                                            const env = fadeIn * fadeOut;
                                            outerMat.opacity = env * (0.30 + 0.10 * Math.sin(radTicks * 0.09));
                                            innerMat.opacity = env * (0.28 + 0.12 * Math.cos(radTicks * 0.13));
                                            outerDisc.rotation.y += 0.0025;
                                            innerDisc.rotation.y -= 0.004;
                                            if (radTicks % 8 === 0 && typeof spawnSmokePuff === 'function' && activeFX.length < 440) {
                                                const ang = Math.random() * Math.PI * 2;
                                                const rr = Math.sqrt(Math.random()) * (NUKE_RAD_RADIUS * 0.88);
                                                spawnSmokePuff(
                                                    new THREE.Vector3(blastCenter.x + Math.cos(ang) * rr, radGroundY + 0.55, blastCenter.z + Math.sin(ang) * rr),
                                                    (radTicks % 16 === 0) ? 0xc2ff38 : 0x76e018,
                                                    1.35 + Math.random() * 0.65
                                                );
                                            }
                                            if (radTicks % 45 === 0) {
                                                const allGround = [...(typeof units !== 'undefined' ? units : []), ...(typeof enemyUnits !== 'undefined' ? enemyUnits : [])];
                                                for (let i = 0; i < allGround.length; i++) {
                                                    const u = allGround[i];
                                                    if (u && u.health > 0 && u.mesh && !u.isAir && Math.hypot(u.mesh.position.x - blastCenter.x, u.mesh.position.z - blastCenter.z) <= NUKE_RAD_RADIUS) {
                                                        if (typeof applyCalculatedDamage === 'function') applyCalculatedDamage(null, u, 25, 'RADIATION');
                                                        else u.health -= 25;
                                                    }
                                                }
                                            }
                                            if (radTicks >= radDuration) {
                                                disposeRad();
                                                return false;
                                            }
                                            return true;
                                        }
                                    });
                                    return false;
                                }
                                return detTick < 120;
                            }
                        });
                        return false;
                    }
                }
                return true;
            }
    });
}

function spawnMushroomCloud(pos, scaleMult = 1.0, shockwaveTargetRadius = null) {
    if (!pos || typeof scene === 'undefined') return;
    const groundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(pos.x, pos.z) : 0;
    const fireTex = _getFxSpriteTex('fireball');
    const smokeTex = _getFxSpriteTex('smoke');
    const flashTex = _getFxSpriteTex('flash');
    const addBlend = typeof THREE.AdditiveBlending !== 'undefined' ? { blending: THREE.AdditiveBlending } : {};

    // Brief iconic Zero Hour blinding white-gold thermal screen flash (full-scale nukes only)
    if (shockwaveTargetRadius && typeof document !== 'undefined' && document.body && document.createElement) {
        try {
            const ov = document.createElement('div');
            ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9998;background:radial-gradient(circle, rgba(255,255,240,0.85) 0%, rgba(255,210,120,0.45) 55%, rgba(255,140,40,0) 100%);opacity:0.95;transition:opacity 0.55s ease-out;';
            document.body.appendChild(ov);
            requestAnimationFrame(() => { ov.style.opacity = '0'; });
            setTimeout(() => { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 650);
        } catch (_) {}
    }

    const cloudGroup = new THREE.Group();
    cloudGroup.position.set(pos.x, groundY, pos.z);
    scene.add(cloudGroup);

    // 0. Blinding thermal flash billboard + expanding ground glare
    const flashMat = new THREE.SpriteMaterial({
        ...(flashTex ? { map: flashTex } : {}),
        color: 0xfffbe6,
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
        ...addBlend
    });
    const flashSprite = new THREE.Sprite(flashMat);
    flashSprite.position.set(0, 6.0 * scaleMult, 0);
    flashSprite.scale.set(16 * scaleMult, 16 * scaleMult, 1);
    cloudGroup.add(flashSprite);

    // 1. Volumetric Mushroom Cloud built from layered soft fireball/smoke sprites (NO cartoon solid spheres/cylinders!)
    const capPuffs = [];
    const stemPuffs = [];
    const skirtPuffs = [];
    const makePuff = (tex, colorHex, additive, baseSize) => {
        const mat = new THREE.SpriteMaterial({
            ...(tex ? { map: tex } : {}),
            color: colorHex,
            transparent: true,
            opacity: 0.92,
            depthWrite: false,
            ...(additive ? addBlend : {})
        });
        const sp = new THREE.Sprite(mat);
        sp.scale.set(baseSize, baseSize, 1);
        cloudGroup.add(sp);
        return sp;
    };

    // 1a. Rolling Toroidal Mushroom Cap (16 layered billowing fireball + soot sprites)
    for (let i = 0; i < 16; i++) {
        const isRing = i < 11;
        const ang = isRing ? ((i / 11) * Math.PI * 2) : (((i - 11) / 5) * Math.PI * 2 + 0.4);
        const radFrac = isRing ? (0.85 + (i % 2) * 0.22) : 0.35;
        const yOff = isRing ? ((i % 2) * 1.4 - 0.8) : (2.6 + (i % 3) * 0.8);
        const baseSz = (isRing ? 8.5 : 10.5) * scaleMult;
        const isInnerGlow = (i % 3 === 0);
        const sp = makePuff(isInnerGlow ? fireTex : smokeTex, isInnerGlow ? 0xffb142 : 0xff6b35, isInnerGlow, baseSz);
        capPuffs.push({ sp, ang, radFrac, yOff, baseSz, isInnerGlow, phase: i * 0.7 });
    }

    // 1b. Churning Vertical Fireball & Dust Stem (10 stacked billowing sprites)
    for (let i = 0; i < 10; i++) {
        const frac = i / 9;
        const baseSz = (6.8 - frac * 1.8) * scaleMult;
        const isHot = i % 2 === 0;
        const sp = makePuff(isHot ? fireTex : smokeTex, isHot ? 0xff793f : 0x8b4513, false, baseSz);
        stemPuffs.push({ sp, frac, baseSz, ang: i * 1.3, wobble: (0.4 + (i % 3) * 0.35) * scaleMult });
    }

    // 1c. Ground-Hugging Base Surge / Dust Skirt (10 outward-rolling shock-dust clouds)
    for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2 + (i % 2) * 0.15;
        const baseSz = (7.2 + (i % 3) * 1.2) * scaleMult;
        const sp = makePuff(smokeTex, i % 2 === 0 ? 0xd2b48c : 0x7f6a52, false, baseSz);
        skirtPuffs.push({ sp, ang, baseSz });
    }

    // 2. Dual Supersonic Shockwave Rings (ground blast front + atmospheric Wilson condensation ring)
    const baseShockOuter = 4.8 * scaleMult;
    const ringGeo = new THREE.RingGeometry(2.6 * scaleMult, baseShockOuter, 56);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffeaa7, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false, ...addBlend });
    const shockwave = new THREE.Mesh(ringGeo, ringMat);
    shockwave.position.set(0, 0.45, 0);
    cloudGroup.add(shockwave);

    const machGeo = new THREE.RingGeometry(4.2 * scaleMult, 6.0 * scaleMult, 48);
    machGeo.rotateX(-Math.PI / 2);
    const machMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false });
    const machRing = new THREE.Mesh(machGeo, machMat);
    machRing.position.set(0, 12 * scaleMult, 0);
    cloudGroup.add(machRing);

    // 3. Persistent nuclear scorched crater (skipped when caller spawns a calibrated full-scale nuke crater)
    if (!shockwaveTargetRadius) {
        spawnCraterDecal(pos, 8.0 * scaleMult, 1200, 'nuke');
    }

    const disposeCloud = () => {
        scene.remove(cloudGroup);
        cloudGroup.traverse(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
        });
    };

    const maxLife = Math.round(240 * Math.max(0.65, Math.min(1.6, scaleMult))); // ~6.4s dramatic billowing cloud for full nuke
    let life = maxLife;
    const maxShockScale = shockwaveTargetRadius ? (shockwaveTargetRadius / baseShockOuter) : 8.2;
    const cHot = new THREE.Color(0xffb142);
    const cOrange = new THREE.Color(0xd35400);
    const cSoot = new THREE.Color(0x3a3836);

    activeFX.push({
            persistent: true,
            group: cloudGroup,
            life: maxLife,
            dispose: disposeCloud,
            update() {
                life--;
                const progress = 1 - (life / maxLife);
                const easeOut = 1 - Math.pow(1 - progress, 2.2);
                const fadeTail = progress > 0.62 ? Math.max(0, 1 - (progress - 0.62) / 0.38) : 1.0;

                // Thermal flash expands explosively and fades in first 16%
                if (progress < 0.18) {
                    const fp = progress / 0.18;
                    const fs = (16 + fp * 48) * scaleMult;
                    flashSprite.scale.set(fs, fs, 1);
                    flashMat.opacity = Math.max(0, 1.0 - fp * fp);
                } else {
                    flashSprite.visible = false;
                }

                // Cap rises from Y=5 -> Y=30*scaleMult, expands radially into a rolling mushroom dome, cools orange -> soot grey
                const capHeight = (5.0 + easeOut * 24.0) * scaleMult;
                const capRadius = (2.8 + easeOut * 11.5) * scaleMult;
                for (let i = 0; i < capPuffs.length; i++) {
                    const cp = capPuffs[i];
                    const r = capRadius * cp.radFrac;
                    const swirl = cp.ang + progress * 0.45;
                    cp.sp.position.set(Math.cos(swirl) * r, capHeight + cp.yOff * (0.6 + easeOut * 1.1) * scaleMult, Math.sin(swirl) * r);
                    const sz = cp.baseSz * (0.7 + easeOut * 1.45);
                    cp.sp.scale.set(sz, sz * 0.82, 1);
                    if (cp.isInnerGlow) {
                        cp.sp.material.opacity = Math.max(0, (1 - Math.min(1, progress / 0.58)) * 0.9);
                    } else {
                        const coolT = Math.min(1, Math.max(0, (progress - 0.18) / 0.45));
                        cp.sp.material.color.copy(cOrange).lerp(cSoot, coolT);
                        cp.sp.material.opacity = fadeTail * 0.86;
                    }
                }

                // Stem stretches upward smoothly beneath the cap
                for (let i = 0; i < stemPuffs.length; i++) {
                    const st = stemPuffs[i];
                    const y = (1.5 + st.frac * (capHeight - 2.5 * scaleMult));
                    const w = st.wobble * (0.4 + progress * 0.9);
                    st.sp.position.set(Math.cos(st.ang + progress) * w, y, Math.sin(st.ang + progress) * w);
                    const sz = st.baseSz * (0.65 + easeOut * 1.15);
                    st.sp.scale.set(sz, sz * 1.15, 1);
                    const coolT = Math.min(1, Math.max(0, (progress - 0.12) / 0.42));
                    st.sp.material.color.copy(cHot).lerp(cSoot, coolT);
                    st.sp.material.opacity = fadeTail * 0.78;
                }

                // Base surge dust skirt rolls outward along the ground
                const skirtR = (3.5 + easeOut * 16.0) * scaleMult;
                for (let i = 0; i < skirtPuffs.length; i++) {
                    const sk = skirtPuffs[i];
                    sk.sp.position.set(Math.cos(sk.ang) * skirtR, (1.8 + easeOut * 2.4) * scaleMult, Math.sin(sk.ang) * skirtR);
                    const sz = sk.baseSz * (0.75 + easeOut * 1.35);
                    sk.sp.scale.set(sz, sz * 0.65, 1);
                    sk.sp.material.opacity = Math.max(0, (1 - progress / 0.72) * 0.68);
                }

                // Supersonic ground shockwave sweeps to full Blast6OuterRadius (45.4u) over ~1.2s then dissipates
                const shockProg = shockwaveTargetRadius ? Math.min(1, progress / 0.22) : Math.min(1, progress / 0.55);
                const rScale = 1 + shockProg * (maxShockScale - 1);
                shockwave.scale.set(rScale, rScale, 1);
                ringMat.opacity = Math.max(0, 0.92 * (1 - shockProg));

                // Wilson atmospheric condensation ring rises around mid-stem
                const machProg = Math.min(1, progress / 0.55);
                const mScale = 1 + machProg * 2.8;
                machRing.position.y = (10 + machProg * 14) * scaleMult;
                machRing.scale.set(mScale, mScale, 1);
                machMat.opacity = Math.max(0, 0.68 * Math.sin(machProg * Math.PI));

                if (life <= 0) {
                    disposeCloud();
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

    // Biohazard Target Zone Reticle (wide circular saturation zone matching official SCUD Storm scatter)
    const warnGroundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(targetPos.x, targetPos.z) : 0;
    const warnGeo = new THREE.RingGeometry(27.0, 29.0, 48);
    warnGeo.rotateX(-Math.PI / 2);
    const warnMat = new THREE.MeshBasicMaterial({ color: 0x4cd137, side: THREE.DoubleSide, transparent: true, opacity: 0.65, depthWrite: false, depthTest: false });
    const warnRing = new THREE.Mesh(warnGeo, warnMat);
    warnRing.position.set(targetPos.x, warnGroundY + 0.5, targetPos.z);
    warnRing.renderOrder = 10;
    scene.add(warnRing);
    let warnLife = 360;
    activeFX.push({
        persistent: true,
        mesh: warnRing,
        life: warnLife,
        update() {
            warnLife--;
            warnMat.opacity = Math.min(1, warnLife / 55) * (0.30 + 0.30 * Math.sin(warnLife * 0.22));
            if (warnLife <= 0) {
                scene.remove(warnRing);
                warnGeo.dispose();
                warnMat.dispose();
                return false;
            }
            return true;
        }
    });

    // Official SCUD Storm: 9 missiles fire in staggered 0.35-0.45s succession, climb steeply off-screen, then rain down in wide inaccurate scatter
    const launchMissileStage = (launchOrigin, subTarget, onImpact) => {
        const mGroup = new THREE.Group();
        const body = new THREE.Mesh(
            new THREE.CylinderGeometry(0.42, 0.52, 4.6, 8),
            new THREE.MeshStandardMaterial({ color: 0x5c6654, roughness: 0.65, metalness: 0.25 })
        );
        const nose = new THREE.Mesh(
            new THREE.ConeGeometry(0.42, 1.4, 8),
            new THREE.MeshStandardMaterial({ color: 0x2ecc40, roughness: 0.5 })
        );
        nose.position.y = 3.0;
        const flame = new THREE.Mesh(
            new THREE.ConeGeometry(0.68, 3.2, 8),
            new THREE.MeshBasicMaterial({ color: 0xffa502, transparent: true, opacity: 0.92 })
        );
        flame.rotation.x = Math.PI;
        flame.position.y = -3.6;
        mGroup.add(body, nose, flame);
        mGroup.position.copy(launchOrigin);
        scene.add(mGroup);

        let phase = 'ascend';
        let t = 0;
        const ascendTicks = 68;
        const cruiseTicks = 112; // Total ~3.0s travel delay (68 + 112 = 180 ticks) off-screen before incoming rain
        const descendTicks = 56;
        const targetGroundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(subTarget.x, subTarget.z) : 0;
        const impactPoint = new THREE.Vector3(subTarget.x, targetGroundY, subTarget.z);
        const dirXZ = new THREE.Vector3(subTarget.x - launchOrigin.x, 0, subTarget.z - launchOrigin.z);
        if (dirXZ.lengthSq() > 0.01) dirXZ.normalize();
        const apexY = 185;

        const disposeM = () => {
            scene.remove(mGroup);
            mGroup.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
        };

        activeFX.push({
            persistent: true,
            group: mGroup,
            life: ascendTicks + cruiseTicks + descendTicks + 20,
            dispose: disposeM,
            update() {
                t++;
                if (phase === 'ascend') {
                    const p = Math.min(1, t / ascendTicks);
                    const ease = p * p; // accelerating rocket boost straight up
                    mGroup.position.set(
                        launchOrigin.x + dirXZ.x * (p * 14),
                        launchOrigin.y + ease * apexY,
                        launchOrigin.z + dirXZ.z * (p * 14)
                    );
                    flame.scale.setScalar(0.9 + Math.sin(t * 0.9) * 0.25);
                    if (t % 2 === 0 && mGroup.position.y < 145 && typeof spawnSmokePuff === 'function') {
                        spawnSmokePuff(mGroup.position.clone().add(new THREE.Vector3(0, -2.5, 0)), (t % 4 === 0) ? 0xe5e7eb : 0x9ca3af, 1.55);
                    }
                    if (t >= ascendTicks) {
                        phase = 'cruise';
                        t = 0;
                        mGroup.visible = false;
                    }
                    return true;
                } else if (phase === 'cruise') {
                    if (t >= cruiseTicks) {
                        phase = 'descend';
                        t = 0;
                        mGroup.visible = true;
                        mGroup.position.set(impactPoint.x - dirXZ.x * 20, impactPoint.y + apexY, impactPoint.z - dirXZ.z * 20);
                        mGroup.rotation.x = Math.PI; // Nose down!
                    }
                    return true;
                } else {
                    const p = Math.min(1, t / descendTicks);
                    mGroup.position.set(
                        impactPoint.x - dirXZ.x * (22 * (1 - p)),
                        impactPoint.y + apexY * (1 - p),
                        impactPoint.z - dirXZ.z * (22 * (1 - p))
                    );
                    if (t % 3 === 0 && mGroup.position.y < 130 && typeof spawnSmokePuff === 'function') {
                        spawnSmokePuff(mGroup.position.clone().add(new THREE.Vector3(0, 2.5, 0)), 0xd1d5db, 1.15);
                    }
                    if (t >= descendTicks) {
                        disposeM();
                        if (typeof onImpact === 'function') onImpact(impactPoint);
                        return false;
                    }
                    return true;
                }
            }
        });
    };

    for (let i = 0; i < 9; i++) {
        setTimeout(() => {
                // Wide, inaccurate circular saturation scatter (radius up to ~28u)
                const randAngle = Math.random() * Math.PI * 2;
                const randDist = (i === 0) ? (Math.random() * 6.0) : (6.0 + Math.sqrt(Math.random()) * 22.0);
                const offset = new THREE.Vector3(
                    Math.cos(randAngle) * randDist,
                    0,
                    Math.sin(randAngle) * randDist
                );
                const subTarget = targetPos.clone().add(offset);
                const tubeOffset = new THREE.Vector3(((i % 3) - 1) * 1.6, 2.8, (Math.floor(i / 3) - 1) * 1.6);
                const launchOrigin = (stormPos ? stormPos.clone() : targetPos.clone().add(new THREE.Vector3(-45, 0, -45))).add(tubeOffset);

                // Heavy billowing gray-white launch smoke & exhaust ignition at SCUD Storm launcher
                if (typeof spawnMuzzleFlash === 'function') spawnMuzzleFlash(launchOrigin, 0xff9f43, 2.1);
                if (typeof spawnSmokePuff === 'function') {
                    spawnSmokePuff(launchOrigin, 0xe5e7eb, 1.9);
                    spawnSmokePuff(launchOrigin.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3.5, 1.0, (Math.random() - 0.5) * 3.5)), 0x9ca3af, 1.7);
                }
                if (typeof playAudio === 'function') playAudio('scud_launch', { volume: i % 2 === 0 ? 0.72 : 0.48 }, 'gla');

                launchMissileStage(launchOrigin, subTarget, (impactPos) => {
                        playAudio('scud_detonation');
                        setTimeout(() => { if (typeof playAudio === 'function') playAudio('anthrax_hiss', { volume: 0.65 }, 'gla'); }, 220);
                        if (typeof revealFogOfWarAt === 'function') revealFogOfWarAt(impactPos, 28, 360);
                        if (typeof triggerScreenShake === 'function') triggerScreenShake(1.05);

                        // Dual fiery HE explosion + emerald/yellow-green Anthrax shockwave ring
                        if (typeof spawnEnhancedExplosion === 'function') {
                            spawnEnhancedExplosion(impactPos, 0xff793f, 2.9, true, 'none');
                            spawnEnhancedExplosion(impactPos, 0x4cd137, 3.8, true, 'none');
                        }
                        const gY = typeof getTerrainHeight === 'function' ? getTerrainHeight(impactPos.x, impactPos.z) : 0;
                        const bioGeo = new THREE.RingGeometry(1.5, 3.6, 36);
                        bioGeo.rotateX(-Math.PI / 2);
                        const bioMat = new THREE.MeshBasicMaterial({ color: 0xb8e934, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
                        const bioRing = new THREE.Mesh(bioGeo, bioMat);
                        bioRing.position.set(impactPos.x, gY + 0.4, impactPos.z);
                        scene.add(bioRing);
                        let bLife = 28;
                        activeFX.push({
                            mesh: bioRing,
                            life: bLife,
                            update() {
                                bLife--;
                                const p = 1 - bLife / 28;
                                bioRing.scale.setScalar(1 + p * 4.4);
                                bioMat.opacity = 0.85 * (1 - p);
                                if (bLife <= 0) {
                                    scene.remove(bioRing);
                                    bioGeo.dispose();
                                    bioMat.dispose();
                                    return false;
                                }
                                return true;
                            }
                        });

                        // Official ScudStormDamageWeapon damages ALL units & structures in blast radius with distance falloff
                        const allU = [...(typeof units !== 'undefined' ? units : []), ...(typeof enemyUnits !== 'undefined' ? enemyUnits : [])];
                        for (let ui = 0; ui < allU.length; ui++) {
                            const u = allU[ui];
                            if (!u || u.health <= 0 || !u.mesh) continue;
                            const dist = Math.hypot(u.mesh.position.x - impactPos.x, u.mesh.position.z - impactPos.z);
                            if (dist <= 13.5) {
                                const dmg = Math.round(185 * Math.max(0.28, 1 - dist / 14.5));
                                if (typeof applyCalculatedDamage === 'function') applyCalculatedDamage(null, u, dmg, 'EXPLOSIVE');
                                else u.health -= dmg;
                            }
                        }
                        const allS = [...(typeof structures !== 'undefined' ? structures : []), ...(typeof enemyStructures !== 'undefined' ? enemyStructures : [])];
                        for (let si = 0; si < allS.length; si++) {
                            const st = allS[si];
                            const sp = st && (st.position || (st.mesh && st.mesh.position));
                            if (!st || st.health <= 0 || !sp) continue;
                            const dist = Math.hypot(sp.x - impactPos.x, sp.z - impactPos.z);
                            if (dist <= 15.0) {
                                const dmg = Math.round(220 * Math.max(0.30, 1 - dist / 16.0));
                                if (typeof applyCalculatedDamage === 'function') applyCalculatedDamage(null, st, dmg, 'EXPLOSIVE');
                                else st.health -= dmg;
                            }
                        }

                        spawnCraterDecal(impactPos, 5.2, 1200, 'toxin');
                        // Official INIZH.big ScudStormDamageWeapon FireOCL = OCL_PoisonFieldLarge (35s volumetric green/yellow anthrax mist)
                        spawnLingeringToxinCloud(impactPos, 12.5, 2100);
                });
            }, i * 380);
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
                const s = 1 + t * 25.0; // Expands to official 32.4u PropagandaTowerBehavior radius (1.25 * 26 = 32.5u)
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

function attachVehicleDrone(vehicle, droneType, silent = false) {
    if (!vehicle || !vehicle.mesh) return;
    if (!vehicle._baseScanRange) {
        vehicle._baseScanRange = vehicle.scanRange || 25;
    }
    if (vehicle.drone && vehicle.drone.mesh) {
        if (typeof disposeSceneNodeSafe === 'function') disposeSceneNodeSafe(vehicle.drone.mesh);
        else scene.remove(vehicle.drone.mesh);
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

    const _nowDroneSfx = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (_nowDroneSfx - (window._lastDroneDeploySfxMs || 0) >= 150) {
        window._lastDroneDeploySfxMs = _nowDroneSfx;
        if (typeof playOfficialSound === 'function') playOfficialSound('sfx_drone_create', 0.90);
        else playAudio('radio_chirp');
    }
    if (!silent && !vehicle.isEnemy && !vehicle.isAI && typeof showNotification === 'function') {
        showNotification(`${vehicle.type.toUpperCase()} deployed ${droneType.toUpperCase()} DRONE!`, 'success');
    }
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
        if (typeof disposeSceneNodeSafe === 'function') disposeSceneNodeSafe(tank.overlordUpgradeMesh);
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

    if (upgradeType === 'bunker') {
        tank.capacity = 5;
        if (!Array.isArray(tank.garrisoned)) tank.garrisoned = [];
    } else {
        if (Array.isArray(tank.garrisoned) && tank.garrisoned.length > 0 && typeof unloadTransportPassengers === 'function') {
            unloadTransportPassengers(tank);
        }
        tank.capacity = 0;
        if (upgradeType === 'gatling') tank.detectsStealth = true;
    }
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

    if (typeof playOfficialSound === 'function') {
        playOfficialSound('sfx_overlord_upgrade', 0.90);
        const voiceKey = upgradeType === 'bunker' ? 'voice_overlord_bunker' : upgradeType === 'gatling' ? 'voice_overlord_gatling' : 'voice_overlord_speaker';
        // These short voice keys do not encode a faction, so pass it
        // explicitly or the loader may look in the player's catalog.
        playOfficialSound(voiceKey, 0.92, 'china');
    } else {
        playAudio('construction', {}, 'china');
    }
    if (!tank.isEnemy && !tank.isAI && typeof showNotification === 'function') {
        showNotification(`OVERLORD upgraded with ${upgradeType.toUpperCase()}!`, 'success');
    }
}

// =========================================================================
// CHINA NUKE CANNON OUTRIGGER SIEGE DEPLOYMENT & RETRACTION
// =========================================================================

function applyNukeCannonPose(mesh, isDeployed) {
    if (!mesh) return;
    const packedNames = ['TURRETBACK', 'TURRETFRONT', 'ELEVATIONBARREL', 'GUNBARREL', 'LIFTERS'];
    packedNames.forEach(n => {
        const node = mesh.getObjectByName(n);
        if (node) node.visible = !isDeployed;
    });
    const turret = mesh.getObjectByName('turretSystem') || mesh.getObjectByName('TURRET01');
    if (turret) {
        turret.visible = !!isDeployed;
        turret.rotation.x = 0; // Base spins strictly horizontally on Y — NEVER tilts upward!
        const turretEl = turret.getObjectByName('TURRETEL');
        if (turretEl) {
            // Barrel trunnion pitches up/down independently of the spinning turret base
            turretEl.rotation.x = isDeployed ? -0.62 : 0;
        }
    }
    // Retail W3D hydraulic outrigger arms (ARM01-ARM04 + HOUSECOLOR01-04 + TOE01-12)
    ['ARM01', 'ARM02', 'ARM03', 'ARM04'].forEach(armName => {
        const arm = mesh.getObjectByName(armName);
        if (arm) {
            if (arm.userData._restY === undefined) arm.userData._restY = arm.position.y;
            arm.scale.x = isDeployed ? 1.0 : 0.42;
            arm.position.y = isDeployed ? (arm.userData._restY - 2.2) : (arm.userData._restY + 0.5);
        }
    });
}
window.applyNukeCannonPose = applyNukeCannonPose;

function deployNukeCannonOutriggers(cannon) {
    if (!cannon || !cannon.mesh || cannon.isDeployed) return;
    cannon.isDeployed = true;
    cannon.deployTimestamp = Date.now();
    if (cannon.targetPosition) cannon.targetPosition.copy(cannon.mesh.position);
    if (cannon.waypoints) cannon.waypoints = [];
    cannon.taskState = 'Idle';
    playAudio('nukecannon_deploy', {}, 'china');

    const chassis = cannon.mesh;
    if (chassis.userData && chassis.userData.isW3D) {
        applyNukeCannonPose(chassis, true);
    } else {
        // Fallback procedural Nuke Cannon mesh
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
    }
    if (cannon.selected && typeof updateSidebar === 'function') updateSidebar();
}

function undeployNukeCannonOutriggers(cannon) {
    if (!cannon || !cannon.mesh || !cannon.isDeployed) return;
    cannon.isDeployed = false;
    playAudio('nukecannon_undeploy', {}, 'china');

    const chassis = cannon.mesh;
    if (chassis.userData && chassis.userData.isW3D) {
        applyNukeCannonPose(chassis, false);
    } else {
        const legGroup = chassis.getObjectByName("outriggerLegs");
        if (legGroup) {
            chassis.remove(legGroup);
            legGroup.traverse(c => {
                    if (c.geometry) c.geometry.dispose();
                    if (c.material) c.material.dispose();
            });
        }
    }
    if (cannon.selected && typeof updateSidebar === 'function') updateSidebar();
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
    const cleanupWaypoint = () => {
        scene.remove(group);
        ringGeo.dispose();
        ringMat.dispose();
        tickGeo.dispose();
        tickMat.dispose();
        if (beamGeo) beamGeo.dispose();
        if (beamMat) beamMat.dispose();
    };

    activeFX.push({
        dispose: cleanupWaypoint,
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

// Compute bounded map-crossing flight path passing directly over dropCenter (safe on 900..3000 maps)
function computeMapCrossingFlightPath(dropCenter, flightY, dirX = 0.90, dirZ = 0.435, speedPerTick = 0.95) {
    const len = Math.hypot(dirX, dirZ) || 1;
    const ux = dirX / len, uz = dirZ / len;
    const activeSize = (typeof currentMapSize === 'number' && currentMapSize > 100)
        ? currentMapSize
        : ((typeof mapSize === 'number' && mapSize > 100) ? mapSize : 1500);
    const halfBound = Math.max(activeSize * 0.5 + 55, Math.abs(dropCenter.x) + 140, Math.abs(dropCenter.z) + 140);
    // Ray-box intersection along ±(ux, uz) from dropCenter to padded map edges, capped so Epic 3000x3000 flyovers stay brisk
    const maxLegDist = 380;
    const hitDist = (sx, sz) => {
        const tx = Math.abs(sx) > 1e-4 ? ((sx > 0 ? halfBound : -halfBound) - dropCenter.x) / sx : 1e9;
        const tz = Math.abs(sz) > 1e-4 ? ((sz > 0 ? halfBound : -halfBound) - dropCenter.z) / sz : 1e9;
        const raw = Math.min(tx > 0 ? tx : maxLegDist, tz > 0 ? tz : maxLegDist);
        return Math.max(110, Math.min(maxLegDist, raw));
    };
    const backDist = hitDist(-ux, -uz);
    const fwdDist = hitDist(ux, uz);
    const totalDist = backDist + fwdDist;
    const startPos = new THREE.Vector3(dropCenter.x - ux * backDist, flightY, dropCenter.z - uz * backDist);
    const endPos = new THREE.Vector3(dropCenter.x + ux * fwdDist, flightY, dropCenter.z + uz * fwdDist);
    const dropT = backDist / Math.max(1, totalDist);
    const duration = Math.max(180, Math.round(totalDist / Math.max(0.35, speedPerTick)));
    return { startPos, endPos, dropT, duration };
}

function triggerSupplyDropZoneDelivery(structure) {
    if (!structure || !structure.position || structure.health <= 0 || structure.isBuilding) return;
    const dropCenter = structure.position.clone();
    const groundY = (typeof getTerrainHeight === 'function') ? getTerrainHeight(dropCenter.x, dropCenter.z) : 0;

    // 1. Official W3D C-130 Hercules Flyover Mesh (AvCargoPln.W3D) — full edge-to-edge map crossing!
    const { plane, c130Props } = createC130FlyoverPlane('c130');

    const flightY = groundY + 26.0;
    const { startPos, endPos, dropT, duration: planeDuration } = computeMapCrossingFlightPath(dropCenter, flightY, 0.90, 0.435, 1.05);
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
                persistent: true,
                dispose: disposeCrate,
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
                    if (lifeTicks >= 1200) {
                        disposeCrate();
                        return false;
                    }
                    return true;
                }
        });
    }

    const cleanupSupplyC130 = () => {
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
    };

    activeFX.push({
            persistent: true,
            dispose: cleanupSupplyC130,
            update() {
                planeTick++;
                const t = planeTick / planeDuration;
                plane.position.lerpVectors(startPos, endPos, t);
                for (let p = 0; p < c130Props.length; p++) c130Props[p].rotation.z += 0.65;
                if (!crateDropped && t >= Math.max(0.05, dropT - 0.02)) {
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
                    cleanupSupplyC130();
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
    const flightY = groundY + 26.0;
    const { startPos, endPos, dropT, duration: totalFrames } = computeMapCrossingFlightPath(dropCenter, flightY, 0.90, 0.435, 1.15);
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
    let dropped = false;
    const cleanupParadropC130 = () => {
        planeTracker.alive = false;
        if (typeof window !== 'undefined' && Array.isArray(window.activeSupplyPlanes)) {
            const idx = window.activeSupplyPlanes.indexOf(planeTracker);
            if (idx !== -1) window.activeSupplyPlanes.splice(idx, 1);
        }
        scene.remove(plane);
    };
    activeFX.push({
        persistent: true,
        dispose: cleanupParadropC130,
        update() {
            frame++;
            const t = frame / totalFrames;
            plane.position.lerpVectors(startPos, endPos, t);
            for (let p = 0; p < c130Props.length; p++) c130Props[p].rotation.z += 0.75;

            if (!dropped && t >= dropT) {
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
                        persistent: true,
                        dispose() { scene.remove(chute); chute.geometry.dispose(); chuteMat.dispose(); },
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
            cleanupParadropC130();
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
    const flightY = groundY + 26.5;
    const { startPos, endPos, dropT: fabDropT, duration: totalFrames } = computeMapCrossingFlightPath(dropCenter, flightY, 0.92, 0.39, 1.25);
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
    let dropped = false;
    const cleanupFabC130 = () => {
        if (typeof window !== 'undefined' && Array.isArray(window.activeSupplyPlanes)) {
            const idx = window.activeSupplyPlanes.indexOf(planeTracker);
            if (idx !== -1) window.activeSupplyPlanes.splice(idx, 1);
        }
        scene.remove(plane);
    };

    activeFX.push({
        persistent: true,
        dispose: cleanupFabC130,
        update() {
            frame++;
            const t = frame / totalFrames;
            plane.position.lerpVectors(startPos, endPos, t);
            for (let p = 0; p < c130Props.length; p++) c130Props[p].rotation.z += 0.8;

            if (!dropped && t >= fabDropT) {
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
                    persistent: true,
                    dispose() {
                        scene.remove(canisterGrp);
                        canister.geometry.dispose(); canisterMat.dispose();
                        chute.geometry.dispose(); chuteMat.dispose();
                    },
                    update() {
                        dropTick++;
                        const dt = Math.min(1, dropTick / 115);
                        canisterGrp.position.y = (flightY - 1.2) * (1 - dt) + (groundY + 0.6) * dt;
                        canisterGrp.rotation.y += 0.03;
                        if (dt < 1) return true;
                        scene.remove(canisterGrp);
                        canister.geometry.dispose();
                        canisterMat.dispose();
                        chute.geometry.dispose();
                        chuteMat.dispose();
                        const triggerDaisyDamage = () => {
                            if (typeof playAudio === 'function') playAudio('daisycutter_blast', { volume: 0.98 }, 'usa');
                            if (typeof damageHostilesInRadius === 'function') damageHostilesInRadius(dropCenter, 24.0, 650, 'EXPLOSIVE', pseudoAttacker);
                        };
                        if (typeof spawnFuelAirExplosion === 'function') {
                            spawnFuelAirExplosion(dropCenter, 'none', 1.35, triggerDaisyDamage);
                        } else {
                            if (typeof spawnEnhancedExplosion === 'function') spawnEnhancedExplosion(dropCenter, 0xff7f50, 6.5, true, 'none');
                            triggerDaisyDamage();
                        }
                        return false;
                    }
                });
            }

            if (frame < totalFrames) return true;
            cleanupFabC130();
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

    const cleanupSpectre = () => {
        if (typeof window !== 'undefined' && Array.isArray(window.activeSupplyPlanes)) {
            const idx = window.activeSupplyPlanes.indexOf(planeTracker);
            if (idx !== -1) window.activeSupplyPlanes.splice(idx, 1);
        }
        scene.remove(plane);
        scene.remove(targetRing);
        ringGeo.dispose();
        ringMat.dispose();
    };

    activeFX.push({
        persistent: true,
        dispose: cleanupSpectre,
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
    const flightY = groundY + 26.5;
    const { startPos, endPos, dropT: carpetDropT, duration: totalFrames } = computeMapCrossingFlightPath(dropCenter, flightY, 0.89, 0.45, 1.35);
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
    const droppedIdx = new Set();

    const cleanupCarpetBomber = () => {
        if (typeof window !== 'undefined' && Array.isArray(window.activeSupplyPlanes)) {
            const idx = window.activeSupplyPlanes.indexOf(planeTracker);
            if (idx !== -1) window.activeSupplyPlanes.splice(idx, 1);
        }
        scene.remove(plane);
    };

    activeFX.push({
        persistent: true,
        dispose: cleanupCarpetBomber,
        update() {
            frame++;
            const t = frame / totalFrames;
            plane.position.lerpVectors(startPos, endPos, t);
            for (let p = 0; p < c130Props.length; p++) c130Props[p].rotation.z += 0.8;

            for (let b = 0; b < 7; b++) {
                const triggerT = Math.max(0.05, carpetDropT - 0.06 + b * 0.02);
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

    // Authentic Zero Hour 2-plane A-10 Warthog flight (fixed 60Hz activeFX — no setTimeout!)
    for (let i = 0; i < 2; i++) {
        const delayTicks = i * 20;
        const latOffset = (i === 0 ? -4.5 : 4.5);
        const startPos = new THREE.Vector3(target.x - 105 + latOffset, groundY + 26, target.z - 105 - latOffset);
        const diveApex = new THREE.Vector3(target.x + latOffset * 0.6, groundY + 9.5, target.z - latOffset * 0.6);
        const exitPos = new THREE.Vector3(target.x + 110 + latOffset, groundY + 28, target.z + 110 - latOffset);

        let plane = null;
        let launched = false;
        let waitTick = 0;
        let frame = 0;
        const totalFrames = 175;
        const firedMissiles = new Set();

        const cleanupPlane = () => {
            if (plane) {
                if (typeof disposeSceneNodeSafe === 'function') disposeSceneNodeSafe(plane);
                else scene.remove(plane);
                plane = null;
            }
        };

        activeFX.push({
            persistent: true,
            dispose: cleanupPlane,
            update() {
                if (!launched) {
                    waitTick++;
                    if (waitTick < delayTicks) return true;
                    launched = true;
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
                }
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
                    if (typeof damageHostilesInRadius === 'function') damageHostilesInRadius(hitPt, 4.5, 32, 'GATLING', pseudoAttacker);
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
                                damage: 140,
                                damageType: 'EXPLOSIVE',
                                splashRadius: 6.5
                            });
                        }
                        if (typeof playAudio === 'function') playAudio('jet_missile', { volume: 0.78 }, 'usa');
                    }
                });

                if (frame < totalFrames) return true;
                cleanupPlane();
                return false;
            }
        });
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

    const maxLife = 3600; // Matches 60s fog reveal duration
    let life = maxLife;
    let angle = 0;
    const cleanupDrone = () => {
        if (typeof disposeSceneNodeSafe === 'function') disposeSceneNodeSafe(drone);
        else scene.remove(drone);
        scene.remove(scanRing);
        ringGeo.dispose();
        ringMat.dispose();
    };
    activeFX.push({
        persistent: true,
        life,
        dispose: cleanupDrone,
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
            const pulse = 1 + ((maxLife - life) % 60) / 60 * 4.5;
            scanRing.scale.setScalar(pulse);
            ringMat.opacity = Math.max(0, 0.72 * (1 - ((maxLife - life) % 60) / 60));
            // Actively detect stealthed hostile units & structures beneath the Spy Drone
            if (life % 12 === 0 && typeof buildingTick !== 'undefined') {
                const detUntil = buildingTick + 30;
                if (typeof enemyUnits !== 'undefined') {
                    for (let i = 0; i < enemyUnits.length; i++) {
                        const eu = enemyUnits[i];
                        if (eu && eu.health > 0 && eu.isStealthed && eu.mesh && Math.hypot(eu.mesh.position.x - center.x, eu.mesh.position.z - center.z) <= 85) {
                            eu.revealedUntil = Math.max(eu.revealedUntil || 0, detUntil);
                        }
                    }
                }
                if (typeof enemyStructures !== 'undefined') {
                    for (let i = 0; i < enemyStructures.length; i++) {
                        const es = enemyStructures[i];
                        if (es && es.health > 0 && es.isStealthed && es.position && Math.hypot(es.position.x - center.x, es.position.z - center.z) <= 85) {
                            es.revealedUntil = Math.max(es.revealedUntil || 0, detUntil);
                        }
                    }
                }
            }
            if (life <= 0) {
                cleanupDrone();
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
    const center = targetPos.clone();
    const totalShells = 10;
    let tick = 0;
    let fired = 0;
    // Fixed 60Hz activeFX barrage with falling 152mm arcing shells (no setTimeout!)
    activeFX.push({
        persistent: true,
        update() {
            tick++;
            if (fired < totalShells && (tick === 1 || tick % 16 === 0)) {
                const shellIdx = fired++;
                const scatter = center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 18, 0, (Math.random() - 0.5) * 18));
                scatter.y = typeof getTerrainHeight === 'function' ? getTerrainHeight(scatter.x, scatter.z) : 0;
                const skyOrigin = new THREE.Vector3(scatter.x - 18, scatter.y + 52, scatter.z - 14);
                if (shellIdx % 2 === 0 && typeof playAudio === 'function') playAudio('shell_whistle', { volume: 0.55 });
                const onShellHit = (hitPos) => {
                    const p = hitPos || scatter;
                    spawnEnhancedExplosion(p, 0xff5722, 3.0, true, 'expl_artillery');
                    spawnCraterDecal(p, 2.8, 420);
                    if (typeof triggerScreenShake === 'function') triggerScreenShake(0.45);
                    if (typeof damageHostilesInRadius === 'function') damageHostilesInRadius(p, 8.5, 145, 'EXPLOSIVE', pseudoAttacker);
                };
                if (typeof spawnCannonShellProjectile === 'function') {
                    spawnCannonShellProjectile(skyOrigin, scatter, {
                        color: 0xffa502, coreColor: 0xfff5cc, smokeColor: 0xd0ccc4,
                        thickness: 1.35, speed: 3.1, arcHeight: 4.0, trailRate: 0.85,
                        onImpact: onShellHit
                    });
                } else {
                    onShellHit(scatter);
                }
            }
            return fired < totalShells;
        }
    });
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

    // Authentic Zero Hour Anthrax Beta green toxin cloud dome + 4 fixed-step lingering DoT pulses (no setTimeout!)
    let tick = 0;
    let detonated = false;
    let postTick = 0;
    let cloudDome = null;
    let cloudGeo = null;
    let cloudMat = null;

    const cleanup = () => {
        if (bomb.parent) scene.remove(bomb);
        try { bombGeo.dispose(); bombMat.dispose(); } catch (_) {}
        if (cloudDome) {
            scene.remove(cloudDome);
            try { cloudGeo.dispose(); cloudMat.dispose(); } catch (_) {}
            cloudDome = null;
        }
    };

    activeFX.push({
        persistent: true,
        dispose: cleanup,
        update() {
            if (!detonated) {
                tick++;
                const t = Math.min(1, tick / 28);
                bomb.position.lerpVectors(dropFrom, impact, t);
                if (tick % 3 === 0) spawnSmokePuff(bomb.position, 0x2ecc71, 0.45);
                if (t < 1) return true;
                detonated = true;
                scene.remove(bomb);
                if (typeof playAudio === 'function') playAudio('anthrax_blast', { volume: 0.95 }, 'gla');
                if (typeof triggerScreenShake === 'function') triggerScreenShake(0.95);
                spawnEnhancedExplosion(impact, 0x2ecc71, 4.8, true, 'none');
                spawnCraterDecal(impact, 5.2, 560, 'toxin');
                spawnLingeringToxinCloud(impact);
                for (let k = 0; k < 5; k++) {
                    const a = (k / 5) * Math.PI * 2;
                    spawnLingeringToxinCloud(impact.clone().add(new THREE.Vector3(Math.cos(a) * 7.5, 0, Math.sin(a) * 7.5)));
                }
                cloudGeo = new THREE.SphereGeometry(1.0, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
                cloudMat = new THREE.MeshBasicMaterial({ color: 0x32ff7e, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide });
                cloudDome = new THREE.Mesh(cloudGeo, cloudMat);
                cloudDome.position.set(impact.x, impact.y + 0.2, impact.z);
                scene.add(cloudDome);
                if (typeof damageHostilesInRadius === 'function') damageHostilesInRadius(impact, 18.0, 320, 'TOXIN', pseudoAttacker);
                return true;
            }
            postTick++;
            if (postTick === 12 && typeof playAudio === 'function') playAudio('anthrax_hiss', { volume: 0.75 }, 'gla');
            if (cloudDome) {
                const p = Math.min(1, postTick / 360);
                const s = 4.0 + Math.min(1, postTick / 35) * 14.5;
                cloudDome.scale.set(s, s * 0.55, s);
                cloudMat.opacity = Math.max(0, (1 - p) * 0.40);
            }
            // 4 lingering Anthrax Beta toxin damage waves every 90 ticks (1.5s at 60Hz)
            if (postTick % 90 === 0 && postTick <= 360) {
                if (typeof damageHostilesInRadius === 'function') damageHostilesInRadius(impact, 16.5, 95, 'TOXIN', pseudoAttacker);
            }
            if (postTick >= 360) {
                cleanup();
                return false;
            }
            return true;
        }
    });
}

function triggerLeafletDropFX(targetPos, onDrop = null) {
    if (!targetPos || typeof scene === 'undefined') return;
    const dropCenter = targetPos.clone();
    const gY = typeof getTerrainHeight === 'function' ? getTerrainHeight(dropCenter.x, dropCenter.z) : 0;
    const { plane, c130Props } = createC130FlyoverPlane('c130');
    const flightY = gY + 26.0;
    const { startPos, endPos, dropT: leafDropT, duration: leafDur } = computeMapCrossingFlightPath(dropCenter, flightY, 0.91, 0.41, 1.3);
    plane.position.copy(startPos);
    if (typeof plane.lookAt === 'function') plane.lookAt(endPos);
    scene.add(plane);
    if (typeof playAudio === 'function') playAudio('c130_flyover', { volume: 0.72 }, 'usa');

    let frame = 0;
    let released = false;
    const cleanupPlane = () => {
        if (typeof disposeSceneNodeSafe === 'function') disposeSceneNodeSafe(plane);
        else scene.remove(plane);
    };
    activeFX.push({
        persistent: true,
        dispose: cleanupPlane,
        update() {
            frame++;
            const t = frame / leafDur;
            plane.position.lerpVectors(startPos, endPos, t);
            for (let p = 0; p < c130Props.length; p++) c130Props[p].rotation.z += 0.8;
            if (!released && t >= leafDropT) {
                released = true;
                if (typeof onDrop === 'function') {
                    try { onDrop(dropCenter); } catch (_) {}
                }
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
            if (frame < leafDur) return true;
            cleanupPlane();
            return false;
        }
    });
}

function triggerFrenzyFX(targetPos) {
    if (!targetPos || typeof scene === 'undefined') return;
    const gY = typeof getTerrainHeight === 'function' ? getTerrainHeight(targetPos.x, targetPos.z) : 0;
    const ringGeo = new THREE.RingGeometry(1.5, 3.0, 36);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff2e2e, side: THREE.DoubleSide, transparent: true, opacity: 0.92, depthWrite: false });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(targetPos.x, gY + 0.45, targetPos.z);
    scene.add(ring);
    spawnSparks({ x: targetPos.x, y: gY + 1.0, z: targetPos.z }, 0xff3838, 16);
    let life = 44;
    activeFX.push({
        dispose() { scene.remove(ring); ringGeo.dispose(); ringMat.dispose(); },
        update() {
            life--;
            const p = 1 - life / 44;
            const s = 1 + p * 8.5;
            ring.scale.set(s, 1, s);
            ringMat.opacity = Math.max(0, (1 - p) * 0.92);
            if (life <= 0) { scene.remove(ring); ringGeo.dispose(); ringMat.dispose(); return false; }
            return true;
        }
    });
}
window.triggerFrenzyFX = triggerFrenzyFX;

function triggerGpsScramblerFX(targetPos) {
    if (!targetPos || typeof scene === 'undefined') return;
    const gY = typeof getTerrainHeight === 'function' ? getTerrainHeight(targetPos.x, targetPos.z) : 0;
    const domeGeo = new THREE.SphereGeometry(2.0, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const domeMat = new THREE.MeshBasicMaterial({ color: 0x2ed573, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.set(targetPos.x, gY + 0.2, targetPos.z);
    scene.add(dome);
    let life = 42;
    activeFX.push({
        dispose() { scene.remove(dome); domeGeo.dispose(); domeMat.dispose(); },
        update() {
            life--;
            const p = 1 - life / 42;
            const s = 1 + p * 10.5;
            dome.scale.set(s, s * 0.5, s);
            domeMat.opacity = Math.max(0, (1 - p) * 0.45);
            if (life <= 0) { scene.remove(dome); domeGeo.dispose(); domeMat.dispose(); return false; }
            return true;
        }
    });
}
window.triggerGpsScramblerFX = triggerGpsScramblerFX;

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

function triggerNapalmStrikeFX(targetPos, pseudoAttacker) {
    if (!targetPos || typeof scene === 'undefined') return;
    const dropCenter = targetPos.clone();
    const groundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(dropCenter.x, dropCenter.z) : 0;
    const flightY = groundY + 24.0;
    const { startPos, endPos, dropT, duration: totalFrames } = computeMapCrossingFlightPath(dropCenter, flightY, 0.85, 0.52, 1.45);

    const migs = [];
    [-3.5, 3.5].forEach(latOff => {
        const mMesh = (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['mig'])
            ? createW3DVehicleMesh('mig', false)
            : new THREE.Group();
        mMesh.position.set(startPos.x + latOff, flightY, startPos.z - latOff);
        if (typeof mMesh.lookAt === 'function') mMesh.lookAt(endPos.x + latOff, flightY, endPos.z - latOff);
        scene.add(mMesh);
        migs.push({ mesh: mMesh, latOff });
    });
    if (typeof playAudio === 'function') playAudio('a10_flyby', { volume: 0.82 }, 'china');

    let frame = 0;
    let dropped = false;
    const cleanup = () => {
        migs.forEach(m => { if (m.mesh.parent) scene.remove(m.mesh); });
    };
    activeFX.push({
        persistent: true,
        dispose: cleanup,
        update() {
            frame++;
            const t = frame / totalFrames;
            migs.forEach(m => {
                m.mesh.position.set(
                    startPos.x + (endPos.x - startPos.x) * t + m.latOff,
                    flightY,
                    startPos.z + (endPos.z - startPos.z) * t - m.latOff
                );
            });
            if (!dropped && t >= dropT) {
                dropped = true;
                if (typeof playAudio === 'function') playAudio('dragon_flame', { volume: 0.9 }, 'china');
                for (let b = -2; b <= 2; b++) {
                    const hitPt = dropCenter.clone().add(new THREE.Vector3(b * 3.8, 0, b * 2.2));
                    hitPt.y = typeof getTerrainHeight === 'function' ? getTerrainHeight(hitPt.x, hitPt.z) : groundY;
                    spawnEnhancedExplosion(hitPt, 0xff5500, 3.4, true, 'expl_fire');
                    spawnCraterDecal(hitPt, 3.5, 480, 'flame');
                    if (typeof spawnNapalmScorchPool === 'function') spawnNapalmScorchPool(hitPt);
                }
                if (typeof triggerScreenShake === 'function') triggerScreenShake(0.95);
                if (typeof damageHostilesInRadius === 'function') {
                    damageHostilesInRadius(dropCenter, 16.0, 260, 'FLAME', pseudoAttacker);
                }
            }
            if (frame < totalFrames) return true;
            cleanup();
            return false;
        }
    });
}
window.triggerNapalmStrikeFX = triggerNapalmStrikeFX;

function triggerNeutronMissileFX(targetPos, pseudoAttacker) {
    if (!targetPos || typeof scene === 'undefined') return;
    const center = targetPos.clone();
    center.y = typeof getTerrainHeight === 'function' ? getTerrainHeight(center.x, center.z) : 0;
    if (typeof playAudio === 'function') playAudio('expl_neutron', { volume: 0.95 }, 'china');
    if (typeof spawnNeutronBlast === 'function') spawnNeutronBlast(center);
    else spawnEnhancedExplosion(center, 0x00f2fe, 5.2, true, 'none');
    if (typeof triggerScreenShake === 'function') triggerScreenShake(1.1);
    spawnCraterDecal(center, 5.5, 600, 'ion');

    // Authentic Neutron radiation wave: kills all enemy infantry and vehicle crews in 20m radius, leaving hulls unmanned!
    const hostiles = (typeof enemyUnits !== 'undefined') ? enemyUnits : [];
    let depopulated = 0;
    for (let i = 0; i < hostiles.length; i++) {
        const e = hostiles[i];
        if (!e || e.health <= 0 || !e.mesh) continue;
        if (Math.hypot(e.mesh.position.x - center.x, e.mesh.position.z - center.z) <= 20.0) {
            const isInf = (typeof isInfantryType === 'function' && isInfantryType(e.type));
            if (isInf) {
                if (typeof applyCalculatedDamage === 'function') applyCalculatedDamage(pseudoAttacker, e, 999, 'TOXIN');
                else e.health = 0;
            } else if (!e.isAir) {
                e.isUnmanned = true;
                e.disabledUntil = 999999;
                e.combatTarget = null;
                if (e.targetPosition && e.mesh) e.targetPosition.copy(e.mesh.position);
                depopulated++;
            }
        }
    }
    return depopulated;
}
window.triggerNeutronMissileFX = triggerNeutronMissileFX;

function triggerDirtyNukeFX(targetPos, pseudoAttacker) {
    if (!targetPos || typeof scene === 'undefined') return;
    const center = targetPos.clone();
    center.y = typeof getTerrainHeight === 'function' ? getTerrainHeight(center.x, center.z) : 0;
    if (typeof playAudio === 'function') playAudio('expl_mininuke', { volume: 0.95 }, 'gla');
    if (typeof spawnMiniNukeMushroom === 'function') spawnMiniNukeMushroom(center);
    spawnEnhancedExplosion(center, 0x2ecc71, 4.6, true, 'none');
    spawnCraterDecal(center, 5.0, 600, 'nuke');
    if (typeof spawnLingeringToxinCloud === 'function') {
        spawnLingeringToxinCloud(center, 9.0, 900);
    }
    if (typeof triggerScreenShake === 'function') triggerScreenShake(1.1);
    if (typeof damageHostilesInRadius === 'function') {
        damageHostilesInRadius(center, 16.0, 380, 'EXPLOSIVE', pseudoAttacker);
        damageHostilesInRadius(center, 18.0, 140, 'TOXIN', pseudoAttacker);
    }
}
window.triggerDirtyNukeFX = triggerDirtyNukeFX;

function triggerBlackMarketNukeFX(targetPos, pseudoAttacker) {
    if (!targetPos || typeof scene === 'undefined') return;
    const center = targetPos.clone();
    center.y = typeof getTerrainHeight === 'function' ? getTerrainHeight(center.x, center.z) : 0;
    if (typeof playAudio === 'function') playAudio('nuke_detonation', { volume: 0.95 }, 'gla');
    if (typeof spawnNuclearMushroomCloud === 'function') spawnNuclearMushroomCloud(center, 0.65);
    else if (typeof spawnMiniNukeMushroom === 'function') spawnMiniNukeMushroom(center);
    spawnCraterDecal(center, 6.5, 720, 'nuke');
    if (typeof spawnLingeringToxinCloud === 'function') spawnLingeringToxinCloud(center, 10.5, 1080);
    if (typeof triggerScreenShake === 'function') triggerScreenShake(1.35);
    if (typeof damageHostilesInRadius === 'function') {
        damageHostilesInRadius(center, 20.0, 520, 'EXPLOSIVE', pseudoAttacker);
    }
}
window.triggerBlackMarketNukeFX = triggerBlackMarketNukeFX;

// =========================================================================
// NIGHT & DUSK LIGHTING FX: VEHICLE HEADLIGHTS, BUILDING GLOWS & SEARCHLIGHTS
// (Zero-cost additive translucent geometry — no dynamic PointLight/SpotLight shader spikes!)
// =========================================================================
let _nightGlowTex = null;
let _nightBeamTex = null;
let _nightHeadlightConeGeo = null;
let _nightSearchlightConeGeo = null;
let _nightHeadlightMat = null;
let _nightSearchlightMat = null;

function _getNightGlowTex() {
    if (_nightGlowTex) return _nightGlowTex;
    if (typeof document === 'undefined' || !document.createElement || typeof THREE === 'undefined' || !THREE.CanvasTexture) return null;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext && c.getContext('2d');
    if (!ctx) return null;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0.0, 'rgba(255, 250, 225, 1.0)');
    g.addColorStop(0.35, 'rgba(255, 232, 165, 0.58)');
    g.addColorStop(0.75, 'rgba(255, 200, 110, 0.16)');
    g.addColorStop(1.0, 'rgba(255, 180, 80, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    _nightGlowTex = new THREE.CanvasTexture(c);
    _nightGlowTex.needsUpdate = true;
    return _nightGlowTex;
}

function _getNightBeamTex() {
    if (_nightBeamTex) return _nightBeamTex;
    if (typeof document === 'undefined' || !document.createElement || typeof THREE === 'undefined' || !THREE.CanvasTexture) return null;
    const c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    const ctx = c.getContext && c.getContext('2d');
    if (!ctx) return null;
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0.0, 'rgba(255, 252, 220, 0.55)');
    g.addColorStop(0.35, 'rgba(240, 245, 210, 0.24)');
    g.addColorStop(0.80, 'rgba(200, 225, 255, 0.06)');
    g.addColorStop(1.0, 'rgba(180, 215, 255, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 128);
    _nightBeamTex = new THREE.CanvasTexture(c);
    _nightBeamTex.needsUpdate = true;
    return _nightBeamTex;
}

function _ensureNightLightSharedAssets() {
    if (typeof THREE === 'undefined') return false;
    if (!_nightHeadlightConeGeo && typeof THREE.CylinderGeometry === 'function') {
        // Open-ended cone pointing along +Z (narrow at headlights, wide ahead on ground)
        const geo = new THREE.CylinderGeometry(0.22, 2.2, 8.8, 10, 1, true);
        if (typeof geo.translate === 'function') geo.translate(0, -4.4, 0);
        if (typeof geo.rotateX === 'function') geo.rotateX(-Math.PI / 2);
        geo.userData = Object.assign(geo.userData || {}, { _shared: true });
        _nightHeadlightConeGeo = geo;
    }
    if (!_nightSearchlightConeGeo && typeof THREE.CylinderGeometry === 'function') {
        const sGeo = new THREE.CylinderGeometry(0.45, 5.2, 24.0, 14, 1, true);
        if (typeof sGeo.translate === 'function') sGeo.translate(0, -12.0, 0);
        if (typeof sGeo.rotateX === 'function') sGeo.rotateX(-Math.PI / 2);
        sGeo.userData = Object.assign(sGeo.userData || {}, { _shared: true });
        _nightSearchlightConeGeo = sGeo;
    }
    if (!_nightHeadlightMat) {
        _nightHeadlightMat = new THREE.MeshBasicMaterial({
            map: _getNightBeamTex() || null,
            color: 0xfff3c4,
            transparent: true,
            opacity: 0.42,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        _nightHeadlightMat.userData = Object.assign(_nightHeadlightMat.userData || {}, { _shared: true });
    }
    if (!_nightSearchlightMat) {
        _nightSearchlightMat = new THREE.MeshBasicMaterial({
            map: _getNightBeamTex() || null,
            color: 0xcbeeff,
            transparent: true,
            opacity: 0.34,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        _nightSearchlightMat.userData = Object.assign(_nightSearchlightMat.userData || {}, { _shared: true });
    }
    return true;
}

const _SEARCHLIGHT_STRUCT_TYPES = new Set([
    'center', 'commandCenter', 'airfield', 'strategyCenter', 'propagandaCenter',
    'palace', 'patriot', 'gatlingCannon', 'stingerSite', 'barracks', 'factory'
]);

function attachNightLightsToUnit(unit) {
    if (!unit || !unit.mesh || unit.isAir) return;
    if (typeof isInfantryType === 'function' && isInfantryType(unit.type)) return;
    const tod = (typeof window !== 'undefined' && window._activeTimeOfDay) ? window._activeTimeOfDay : 'day';
    const wantVisible = (tod === 'night' || tod === 'dusk');

    let grp = unit.mesh.getObjectByName ? unit.mesh.getObjectByName('nightLightsGroup') : null;
    if (!grp) {
        if (!wantVisible) return; // Lazy-create only when Dusk/Night is active
        if (!_ensureNightLightSharedAssets()) return;
        grp = new THREE.Group();
        grp.name = 'nightLightsGroup';
        // Normalize against W3D / procedural mesh scale so headlights are always true world scale
        const invS = 1 / Math.max(0.05, (unit.mesh.scale && unit.mesh.scale.x) ? unit.mesh.scale.x : 1);
        grp.scale.set(invS, invS, invS);

        const r = Math.min(4.2, Math.max(1.8, (unit.radius || 2.8) * 0.62));
        const frontZ = r * 0.85;
        const sideX = r * 0.42;
        const lensY = 0.85;
        const glowTex = _getNightGlowTex();

        [-sideX, sideX].forEach((xOff) => {
            if (typeof THREE.Sprite === 'function' && typeof THREE.SpriteMaterial === 'function') {
                const spMat = new THREE.SpriteMaterial({
                    map: glowTex || null,
                    color: 0xfff3c4,
                    transparent: true,
                    opacity: 0.9,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                });
                const sp = new THREE.Sprite(spMat);
                sp.scale.set(1.15, 1.15, 1);
                sp.position.set(xOff, lensY, frontZ);
                grp.add(sp);
            }
            if (_nightHeadlightConeGeo) {
                const cone = new THREE.Mesh(_nightHeadlightConeGeo, _nightHeadlightMat);
                cone.position.set(xOff, lensY - 0.12, frontZ);
                cone.rotation.x = 0.08; // Slight downward angle onto road/terrain
                grp.add(cone);
            }
        });
        unit.mesh.add(grp);
    }
    grp.visible = wantVisible;
}

function attachNightLightsToStructure(structure) {
    if (!structure || !structure.mesh) return;
    const tod = (typeof window !== 'undefined' && window._activeTimeOfDay) ? window._activeTimeOfDay : 'day';
    const wantVisible = (tod === 'night' || tod === 'dusk');

    let grp = structure.mesh.getObjectByName ? structure.mesh.getObjectByName('nightLightsGroup') : null;
    if (!grp) {
        if (!wantVisible) return;
        if (!_ensureNightLightSharedAssets()) return;
        grp = new THREE.Group();
        grp.name = 'nightLightsGroup';
        const invS = 1 / Math.max(0.05, (structure.mesh.scale && structure.mesh.scale.x) ? structure.mesh.scale.x : 1);
        grp.scale.set(invS, invS, invS);

        const rad = Math.min(7.5, Math.max(3.0, (structure.radius || 5.0) * 0.65));
        const glowTex = _getNightGlowTex();
        const isDef = (structure.type === 'patriot' || structure.type === 'gatlingCannon' || structure.type === 'stingerSite');

        // 1. Warm lit window / pad glow sprites around the building
        if (typeof THREE.Sprite === 'function' && typeof THREE.SpriteMaterial === 'function') {
            const lampColor = structure.faction === 'usa' ? 0xcceeff : (structure.faction === 'china' ? 0xffdd99 : 0xffcc77);
            const lampOffsets = isDef
                ? [[0, 3.2, 0]]
                : [[-rad * 0.55, 2.4, rad * 0.55], [rad * 0.55, 2.4, rad * 0.55], [0, 3.6, -rad * 0.45]];
            lampOffsets.forEach(([lx, ly, lz]) => {
                const spMat = new THREE.SpriteMaterial({
                    map: glowTex || null,
                    color: lampColor,
                    transparent: true,
                    opacity: 0.72,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                });
                const sp = new THREE.Sprite(spMat);
                sp.scale.set(isDef ? 2.6 : 4.2, isDef ? 2.6 : 4.2, 1);
                sp.position.set(lx, ly, lz);
                grp.add(sp);
            });
        }

        // 2. Sweeping volumetric base searchlight beam on key structures
        if (_SEARCHLIGHT_STRUCT_TYPES.has(structure.type) && _nightSearchlightConeGeo) {
            const pivot = new THREE.Group();
            pivot.name = 'searchlightPivot';
            pivot.position.set(0, isDef ? 4.2 : 6.4, 0);
            pivot.userData.phaseOffset = Math.random() * Math.PI * 2;
            const beam = new THREE.Mesh(_nightSearchlightConeGeo, _nightSearchlightMat);
            beam.rotation.x = 0.36; // Angled downward sweeping the terrain around the base
            pivot.add(beam);
            grp.add(pivot);
            structure._searchlightPivot = pivot;
        }
        structure.mesh.add(grp);
    }
    grp.visible = wantVisible && !structure.isBuilding;
}

function refreshAllNightLights() {
    const tod = (typeof window !== 'undefined' && window._activeTimeOfDay) ? window._activeTimeOfDay : 'day';
    const isNight = (tod === 'night');
    const isDusk = (tod === 'dusk');
    if (_nightHeadlightMat) _nightHeadlightMat.opacity = isNight ? 0.46 : (isDusk ? 0.24 : 0);
    if (_nightSearchlightMat) _nightSearchlightMat.opacity = isNight ? 0.36 : (isDusk ? 0.18 : 0);

    const uLists = [
        typeof units !== 'undefined' ? units : [],
        typeof enemyUnits !== 'undefined' ? enemyUnits : []
    ];
    uLists.forEach(list => {
        for (let i = 0; i < list.length; i++) {
            if (list[i] && list[i].health > 0) attachNightLightsToUnit(list[i]);
        }
    });
    const sLists = [
        typeof structures !== 'undefined' ? structures : [],
        typeof enemyStructures !== 'undefined' ? enemyStructures : []
    ];
    sLists.forEach(list => {
        for (let i = 0; i < list.length; i++) {
            if (list[i] && list[i].health > 0) attachNightLightsToStructure(list[i]);
        }
    });
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
    window.attachNightLightsToUnit = attachNightLightsToUnit;
    window.attachNightLightsToStructure = attachNightLightsToStructure;
    window.refreshAllNightLights = refreshAllNightLights;
}
