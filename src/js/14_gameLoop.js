function isPointBlockedByStructureOrObstacle(x, z, unitRadius = 1.2) {
    const structLists = [
        typeof structures !== 'undefined' ? structures : [],
        typeof enemyStructures !== 'undefined' ? enemyStructures : [],
        typeof neutralStructures !== 'undefined' ? neutralStructures : []
    ];
    for (const list of structLists) {
        for (let i = 0; i < list.length; i++) {
            const s = list[i];
            if (!s || s.health <= 0 || !s.position) continue;
            const minR = (s.radius || 6) + unitRadius + 1.2;
            const dx = x - s.position.x;
            const dz = z - s.position.z;
            if (dx * dx + dz * dz < minR * minR) return s;
        }
    }
    if (typeof mapObstacles !== 'undefined') {
        for (let i = 0; i < mapObstacles.length; i++) {
            const obs = mapObstacles[i];
            if (!obs || !obs.position) continue;
            const minR = (obs.radius || 2) + unitRadius + 0.8;
            const dx = x - obs.position.x;
            const dz = z - obs.position.z;
            if (dx * dx + dz * dz < minR * minR) return obs;
        }
    }
    return null;
}

function clampPointOutsideStructures(pos, unitRadius = 1.2, preferredAngle = 0) {
    const out = pos.clone();
    for (let pass = 0; pass < 3; pass++) {
        const blocker = isPointBlockedByStructureOrObstacle(out.x, out.z, unitRadius);
        if (!blocker) break;
        const minR = (blocker.radius || 6) + unitRadius + 2.5;
        let dx = out.x - blocker.position.x;
        let dz = out.z - blocker.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.05) {
            dx = Math.sin(preferredAngle);
            dz = Math.cos(preferredAngle);
        } else {
            dx /= d;
            dz /= d;
        }
        out.x = blocker.position.x + dx * minR;
        out.z = blocker.position.z + dz * minR;
    }
    if (typeof getTerrainHeight === 'function') {
        out.y = getTerrainHeight(out.x, out.z);
    }
    return out;
}

// Find an unoccupied staged slot at rally destination to prevent units bunching or pushing each other
function getUnoccupiedRallySlot(baseRally, unitRadius, isInf, structureFacingAngle) {
    const spacing = isInf ? 3.4 : Math.max(8.0, unitRadius * 2.5);
    const cols = isInf ? 5 : 4;
    for (let slotIdx = 0; slotIdx < 60; slotIdx++) {
        const col = slotIdx % cols;
        const row = Math.floor(slotIdx / cols);
        const colOff = (col - (cols - 1) / 2) * spacing;
        const rowOff = row * spacing;

        const perpX = Math.cos(structureFacingAngle);
        const perpZ = -Math.sin(structureFacingAngle);
        const fwdX = Math.sin(structureFacingAngle);
        const fwdZ = Math.cos(structureFacingAngle);

        const slotX = baseRally.x + perpX * colOff + fwdX * rowOff;
        const slotZ = baseRally.z + perpZ * colOff + fwdZ * rowOff;

        // Skip slots inside any building or map obstacle
        if (isPointBlockedByStructureOrObstacle(slotX, slotZ, unitRadius || 1.2)) continue;

        // Skip slots submerged in water unless on a bridge
        const onBridge = (typeof mapBridges !== 'undefined') && mapBridges.some(b => isPointOnBridge(slotX, slotZ, b));
        if (!onBridge && typeof getTerrainHeight === 'function' && typeof currentWaterLevel !== 'undefined') {
            if (getTerrainHeight(slotX, slotZ) < currentWaterLevel + 0.35) continue;
        }

        // Check if another friendly unit already occupies or is traveling to this slot
        const isOccupied = units.some(u => {
                if (u.isAir || u.garrisonedIn || u.health <= 0) return false;
                const distCurrent = Math.hypot(u.mesh.position.x - slotX, u.mesh.position.z - slotZ);
                const distTarget = Math.hypot(u.targetPosition.x - slotX, u.targetPosition.z - slotZ);
                return (distCurrent < spacing * 0.72) || (distTarget < spacing * 0.72 && u.taskState === 'Moving');
        });

        if (!isOccupied) {
            const slotY = typeof getTerrainHeight === 'function' ? getTerrainHeight(slotX, slotZ) : 0;
            return new THREE.Vector3(slotX, slotY, slotZ);
        }
    }
    return clampPointOutsideStructures(baseRally, unitRadius || 1.2, structureFacingAngle);
}

// =========================================================================
// PERF: Cached named-node lookup (replaces recursive getObjectByName every frame).
// Hits are validated by walking up the parent chain (cheap, ~5 levels) so removed
// parts are detected; misses are re-checked at most once per second so parts that
// are attached later (e.g. Overlord upgrades) are still found.
// =========================================================================
function getCachedNode(root, name) {
    if (!root || typeof root.getObjectByName !== 'function') return null;
    const ud = root.userData || (root.userData = {});
    const cache = ud._nodeCache || (ud._nodeCache = {});
    const entry = cache[name];
    if (entry !== undefined) {
        if (entry && typeof entry === 'object') {
            let p = entry;
            while (p && p !== root) p = p.parent;
            if (p === root) return entry;
        } else if (typeof entry === 'number' && (_animNodeFrame - entry) < 60) {
            return null;
        }
    }
    const found = root.getObjectByName(name) || null;
    cache[name] = found || _animNodeFrame;
    return found;
}
window.getCachedNode = getCachedNode;

// =========================================================================
// PERF: Animated-node registry (replaces per-frame scene.traverse)
// Each top-level scene object lazily caches the sub-nodes that need animating.
// The cache is rebuilt when the object's direct child count changes, plus a
// staggered full refresh every ~3 seconds to catch deep hierarchy changes.
// kind: 1 = rotor spinning +, 2 = rotor spinning -, 3 = other named animation
// =========================================================================
const GLOBAL_FLAG_WIND_YAW = 0.45;
const _flagWaveQ = (typeof THREE !== 'undefined' && typeof THREE.Quaternion === 'function') ? new THREE.Quaternion() : null;
const _flagWaveAxis = (typeof THREE !== 'undefined' && typeof THREE.Vector3 === 'function') ? new THREE.Vector3(1, 0, 0) : null;

let _frameFrustum = null;
let _frameProjScreenMatrix = null;
let _frameFrustumReady = false;
const _frustumTestSphere = (typeof THREE !== 'undefined' && typeof THREE.Sphere === 'function')
    ? new THREE.Sphere(new THREE.Vector3(), 12)
    : null;

function updateFrameFrustum() {
    _frameFrustumReady = false;
    if (typeof THREE === 'undefined' || typeof THREE.Frustum !== 'function' || typeof THREE.Matrix4 !== 'function') return;
    if (typeof camera === 'undefined' || !camera || !camera.projectionMatrix || !camera.matrixWorldInverse) return;
    if (!_frameFrustum) _frameFrustum = new THREE.Frustum();
    if (!_frameProjScreenMatrix) _frameProjScreenMatrix = new THREE.Matrix4();
    if (typeof _frameProjScreenMatrix.multiplyMatrices !== 'function' || typeof _frameFrustum.setFromProjectionMatrix !== 'function') return;
    _frameProjScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frameFrustum.setFromProjectionMatrix(_frameProjScreenMatrix);
    _frameFrustumReady = true;
}

function isWorldPosInView(pos, margin = 14) {
    if (!_frameFrustumReady || !_frustumTestSphere || !pos) return true;
    _frustumTestSphere.center.set(pos.x, pos.y || 0, pos.z);
    _frustumTestSphere.radius = margin;
    return _frameFrustum.intersectsSphere(_frustumTestSphere);
}

function spinVehicleWheels(unit, stepDist) {
    if (!unit || !unit.mesh || unit.mesh.visible === false || !stepDist) return;
    if (!isWorldPosInView(unit.mesh.position, 14)) return;
    if (unit._wheelNodes === undefined) {
        const wNodes = [];
        if (typeof unit.mesh.traverse === 'function') {
            unit.mesh.traverse(c => {
                if (c.name && /^(TIRE|WHEEL)\d*$/i.test(c.name)) wNodes.push(c);
            });
        }
        unit._wheelNodes = wNodes;
    }
    const wNodes = unit._wheelNodes;
    if (wNodes && wNodes.length > 0) {
        const angleDelta = stepDist * 1.45;
        for (let i = 0; i < wNodes.length; i++) {
            wNodes[i].rotation.x += angleDelta;
        }
    }
}
if (typeof window !== 'undefined') window.spinVehicleWheels = spinVehicleWheels;

function updateWindFlagsOnStructure(rootMesh, animTime) {
    if (!rootMesh) return;
    if (rootMesh._windFlagEntries === undefined) {
        const entries = [];
        if (typeof rootMesh.traverse === 'function') {
            rootMesh.traverse(c => {
                if (c && (c.name === 'flagWindPivot' || (c.userData && c.userData.isWindFlag))) {
                    const segs = [];
                    if (typeof c.traverse === 'function') {
                        c.traverse(sub => {
                            if (sub && sub !== c && sub.userData && sub.userData.baseQuat) {
                                segs.push(sub);
                            }
                        });
                    }
                    entries.push({ pivot: c, segs });
                }
            });
        }
        rootMesh._windFlagEntries = entries.length > 0 ? entries : null;
    }
    const entries = rootMesh._windFlagEntries;
    if (!entries) return;
    const rootYaw = (rootMesh.rotation && typeof rootMesh.rotation.y === 'number') ? rootMesh.rotation.y : 0;
    const basePhase = ((rootMesh.id || 0) % 17) * 0.7;
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const pPhase = basePhase + i * 0.9;
        e.pivot.rotation.y = (GLOBAL_FLAG_WIND_YAW - rootYaw) + Math.sin(animTime * 3.4 + pPhase) * 0.12;
        if (_flagWaveQ && _flagWaveAxis && typeof _flagWaveQ.setFromAxisAngle === 'function') {
            const segs = e.segs;
            for (let s = 0; s < segs.length; s++) {
                const seg = segs[s];
                const wave = Math.sin(animTime * 6.2 - s * 1.15 + pPhase) * (0.14 + s * 0.06);
                _flagWaveQ.setFromAxisAngle(_flagWaveAxis, wave);
                if (seg.quaternion && typeof seg.quaternion.copy === 'function' && typeof seg.quaternion.multiply === 'function') {
                    seg.quaternion.copy(seg.userData.baseQuat).multiply(_flagWaveQ);
                }
            }
        }
    }
}

const ANIMATED_NODE_NAMES = new Set([
        'radarDish', 'radarDish2', 'hazardBeacon', 'fusionCore', 'nukeCore', 'pumpjackArm',
        'particleAcceleratorRing', 'particleEmitter', 'nukeTip', 'nukeBlastDoorL',
        'nukeBlastDoorR', 'scudGantry', 'factionFlag', 'flagWindPivot', 'usaCcCraneBoom', 'usaCcCraneHook',
        'OILDERRICK', 'HAMMERS'
]);
function classifyAnimatedNode(obj) {
    const n = obj.name;
    if (!n) return 0;
    const pName = obj.parent ? (obj.parent.name || '') : '';
    if (n === "comanche_rotor" || n === "chinook_rotor1" || n.includes("avcomanche_prop") || n.includes("props01") ||
        (n === "PROPELLER01" && (pName.includes("comanche") || pName.includes("chinook"))) ||
        n === "ductedFan" || n === "avbattledr.fan") return 1;
    if (n === "chinook_rotor2" || n.includes("props02") || (n === "PROPELLER02" && pName.includes("chinook"))) return 2;
    if (ANIMATED_NODE_NAMES.has(n)) return 3;
    if (!obj.isMesh) {
        if (/^FAN\d+$/i.test(n)) return 4;
        if (/^BANNER[A-E](0[235689]|1[12])$/i.test(n)) return 6;
        if (/^(FLOW)?TARP\d+$/i.test(n)) return 7;
    }
    return 0;
}
let _animNodeFrame = 0;
function forEachAnimatedNode(cb) {
    _animNodeFrame++;
    if (!scene || !scene.children) return;
    const roots = scene.children;
    for (let r = 0; r < roots.length; r++) {
        const root = roots[r];
        if (!root || typeof root.traverse !== 'function') continue;
        const childLen = root.children ? root.children.length : 0;
        const ud = root.userData || (root.userData = {});
        let cache = ud._animNodes;
        if (!cache || ud._animChildCount !== childLen || ((_animNodeFrame + r) % 180 === 0)) {
            cache = [];
            root.traverse(obj => {
                    const kind = classifyAnimatedNode(obj);
                    if (kind) cache.push(obj, kind);
            });
            ud._animNodes = cache;
            ud._animChildCount = childLen;
        }
        for (let i = 0; i < cache.length; i += 2) cb(cache[i], cache[i + 1]);
    }
}

// =========================================================================
// PERF: Ground-unit separation using a uniform spatial hash grid.
// Only units in the same or adjacent cells are compared: ~O(N) instead of O(N^2).
// Behaviour matches the former pairwise pass: a parked unit yields only 15%,
// the moving unit takes 85%; parked units lock their targetPosition so they
// don't drive back into the overlap.
// =========================================================================
const _sepGrid = new Map();
function _isSepMoving(u) {
    if (u.taskState === 'Moving' || u.taskState === 'MovingToAttack') return true;
    const tx = u.targetPosition.x - u.mesh.position.x;
    const tz = u.targetPosition.z - u.mesh.position.z;
    return (tx * tx + tz * tz) > 1.44; // 1.2^2
}
function separateGroundUnits(list) {
    _sepGrid.clear();
    let maxR = 0.5;
    const ground = [];
    for (let i = 0; i < list.length; i++) {
        const u = list[i];
        if (u.isAir || u.garrisonedIn || u.health <= 0 || !u.mesh) continue;
        ground.push(u);
        if ((u.radius || 1.2) > maxR) maxR = u.radius || 1.2;
    }
    const cell = maxR * 2;
    for (let i = 0; i < ground.length; i++) {
        const p = ground[i].mesh.position;
        const key = (Math.floor(p.x / cell) + 32768) * 65536 + (Math.floor(p.z / cell) + 32768);
        let bucket = _sepGrid.get(key);
        if (!bucket) { bucket = []; _sepGrid.set(key, bucket); }
        bucket.push(i);
        ground[i]._sepIdx = i;
    }
    for (let i = 0; i < ground.length; i++) {
        const u1 = ground[i];
        const p1 = u1.mesh.position;
        const cx = Math.floor(p1.x / cell), cz = Math.floor(p1.z / cell);
        for (let ox = -1; ox <= 1; ox++) {
            for (let oz = -1; oz <= 1; oz++) {
                const bucket = _sepGrid.get((cx + ox + 32768) * 65536 + (cz + oz + 32768));
                if (!bucket) continue;
                for (let b = 0; b < bucket.length; b++) {
                    const j = bucket[b];
                    if (j <= i) continue; // each pair handled once
                    const u2 = ground[j];
                    // Retail SupplyTruckAIUpdate: active harvesters pass smoothly on the supply lane instead of deadlocking/bouncing
                    const isHarv1 = (u1.type === 'truck' || u1.type === 'worker') && (u1.aiState === 'MovingToDock' || u1.aiState === 'MovingToCenter' || u1.aiState === 'Harvesting' || u1.aiState === 'Depositing');
                    const isHarv2 = (u2.type === 'truck' || u2.type === 'worker') && (u2.aiState === 'MovingToDock' || u2.aiState === 'MovingToCenter' || u2.aiState === 'Harvesting' || u2.aiState === 'Depositing');
                    if (isHarv1 && isHarv2) continue;
                    const dx = p1.x - u2.mesh.position.x;
                    const dz = p1.z - u2.mesh.position.z;
                    const min = ((u1.radius || 1.2) + (u2.radius || 1.2)) * 0.95;
                    const d2 = dx * dx + dz * dz;
                    if (d2 >= min * min || d2 < 1e-8) continue;
                    const d2D = Math.sqrt(d2);
                    const pMag = (min - d2D) * 0.22; // Smooth damped spring separation
                    const nx = dx / d2D, nz = dz / d2D;
                    const m1 = _isSepMoving(u1), m2 = _isSepMoving(u2);
                    let s1 = 0.5, s2 = 0.5;
                    if (!m1 && m2) { s1 = 0.15; s2 = 0.85; }
                    else if (m1 && !m2) { s1 = 0.85; s2 = 0.15; }
                    p1.x += nx * pMag * s1; p1.z += nz * pMag * s1;
                    u2.mesh.position.x -= nx * pMag * s2; u2.mesh.position.z -= nz * pMag * s2;
                    if (!m1) u1.targetPosition.copy(p1);
                    if (!m2) u2.targetPosition.copy(u2.mesh.position);
                }
            }
        }
    }
}

const CRUSHER_TANK_SET = new Set(['crusader', 'paladin', 'battlemaster', 'overlord', 'marauder', 'scorpion', 'tank']);
const INFANTRY_TYPE_SET = new Set(['ranger', 'missiledefender', 'pathfinder', 'burton', 'pilot', 'redguard', 'tankhunter', 'hacker', 'lotus', 'blacklotus', 'rebel', 'rpg', 'terrorist', 'jarmen', 'hijacker', 'worker', 'infantry', 'rocket']);

let _rafLoopId = 0;
let _simTimeAccumSec = 0;

function animate() {
    _rafLoopId = requestAnimationFrame(animate);

    const nowTime = performance.now();
    const rawDt = (window._lastCombatFrameTime && nowTime > window._lastCombatFrameTime)
    ? Math.min(0.1, (nowTime - window._lastCombatFrameTime) / 1000)
    : (1 / 60);
    window._lastCombatFrameTime = nowTime;
    const speedMul = (typeof window !== 'undefined' && typeof window.gameSpeedMultiplier === 'number' && isFinite(window.gameSpeedMultiplier)) ? window.gameSpeedMultiplier : 1.0;
    const simStep60Dt = 1 / 60;
    _simTimeAccumSec = Math.min(_simTimeAccumSec + rawDt * speedMul, simStep60Dt * 4);
    let _simStepsThisFrame = 0;
    while (_simTimeAccumSec >= simStep60Dt && _simStepsThisFrame < 4) {
        _simTimeAccumSec -= simStep60Dt;
        _simStepsThisFrame++;
    }
    if (typeof window !== 'undefined') window._simStepsThisFrame = _simStepsThisFrame;
    const dt = rawDt;
    combatDeltaScale = Math.max(0.25, Math.min(4.0, dt * 60 * speedMul));

    const animTime = nowTime * 0.003;
    // Authentic C&C Generals drifting cloud shadows across terrain
    if (typeof window !== 'undefined' && window._cloudShadowUniforms) {
        const cU = window._cloudShadowUniforms;
        if (cU.uCloudOffset && cU.uCloudOffset.value) {
            cU.uCloudOffset.value.x = (nowTime * 0.000034) % 100;
            cU.uCloudOffset.value.y = (nowTime * 0.000021) % 100;
        }
        if (cU.uCloudStrength) {
            const cloudsOn = !(window._gameOptions && window._gameOptions.cloudShadows === false);
            const tod = window._activeTimeOfDay || 'day';
            cU.uCloudStrength.value = !cloudsOn ? 0.0 : (tod === 'night' ? 0.18 : (tod === 'sunset' || tod === 'dawn' ? 0.38 : 0.62));
        }
    }
    updateFrameFrustum();
    if (typeof processPathfindBudgetQueue === 'function') processPathfindBudgetQueue();

    // Optional live FPS / Army Performance Counter (toggled in Options Menu)
    if (typeof window !== 'undefined' && window._gameOptions && window._gameOptions.showFps && typeof document !== 'undefined') {
        window._fpsAccum = (window._fpsAccum || 0) + 1;
        if (!window._fpsLastMs) window._fpsLastMs = nowTime;
        if (nowTime - window._fpsLastMs >= 500) {
            const fps = Math.round((window._fpsAccum * 1000) / Math.max(1, nowTime - window._fpsLastMs));
            window._fpsAccum = 0;
            window._fpsLastMs = nowTime;
            const badge = document.getElementById('fps-perf-badge');
            if (badge) {
                const uTot = (typeof units !== 'undefined' ? units.length : 0) + (typeof enemyUnits !== 'undefined' ? enemyUnits.length : 0);
                const rInfo = (typeof renderer !== 'undefined' && renderer && renderer.info && renderer.info.render) ? renderer.info.render : null;
                const fxTot = (typeof activeFX !== 'undefined' && Array.isArray(activeFX)) ? activeFX.length : 0;
                const gpuStr = rInfo ? ` • ${rInfo.calls} Calls • ${Math.round((rInfo.triangles || 0) / 1000)}k Tris • ${fxTot} FX` : '';
                badge.textContent = `${fps} FPS • ${uTot} Units${gpuStr}`;
            }
        }
    }

    // Keep shadow frustum centered near cameraTarget for crisp shadows & high FPS
    if (window._mainDirLight && typeof cameraTarget !== 'undefined') {
        const snapX = Math.round(cameraTarget.x / 8) * 8;
        const snapZ = Math.round(cameraTarget.z / 8) * 8;
        window._mainDirLight.position.set(snapX + 60, 80, snapZ + 40);
        if (window._mainDirLight.target) {
            window._mainDirLight.target.position.set(snapX, 0, snapZ);
            window._mainDirLight.target.updateMatrixWorld();
        }
    }

    // Host-authoritative 10 Hz WebRTC delta state sync & smooth client jitter-buffer interpolation
    if (typeof isMultiplayerActive !== 'undefined' && isMultiplayerActive) {
        if (typeof isMultiplayerHost !== 'undefined' && isMultiplayerHost && typeof broadcastHostStateSync === 'function') {
            broadcastHostStateSync();
        } else if (typeof isMultiplayerHost !== 'undefined' && !isMultiplayerHost && typeof updateMultiplayerInterpolation === 'function') {
            updateMultiplayerInterpolation();
        }
    }

    // Update Weapon Effects & Particle System at fixed 60 Hz simulation cadence (refresh-rate independent)
    for (let _fxStep = 0; _fxStep < _simStepsThisFrame; _fxStep++) {
        updateFXEngine();
    }
    if (typeof updateTopplingTrees === 'function') updateTopplingTrees(combatDeltaScale);

    // When in the main menu (not in an active match, map editor, or post-match Inspect Battlefield), render only the ShellMap diorama + FX
    const _inMainMenuShell = (typeof isMatchActive === 'undefined' || !isMatchActive)
        && (typeof isMapEditorMode === 'undefined' || !isMapEditorMode)
        && !(typeof document !== 'undefined' && document.getElementById('start-menu') && document.getElementById('start-menu').style && document.getElementById('start-menu').style.display === 'none');
    if (_inMainMenuShell) {
        if (typeof updateShellMapDemo === 'function') updateShellMapDemo(dt);
        renderer.render(scene, camera);
        return;
    }
    // Post-match Inspect Battlefield: keep camera controls active & render the finished battlefield without spawning the Main Menu demo
    if ((typeof isMatchActive === 'undefined' || !isMatchActive) && (typeof isMapEditorMode === 'undefined' || !isMapEditorMode)) {
        if (typeof updateCamera === 'function') updateCamera();
        if (typeof updateUnitHealthBars === 'function') updateUnitHealthBars();
        renderer.render(scene, camera);
        return;
    }

    // Update Top-Right Match Clock (Zero Hour style)
    if (typeof isMatchActive !== 'undefined' && isMatchActive && typeof matchStartTime !== 'undefined' && matchStartTime > 0) {
        const totalSec = Math.floor((Date.now() - matchStartTime) / 1000);
        if (window._lastClockSec !== totalSec) {
            window._lastClockSec = totalSec;
            const hrs = String(Math.floor(totalSec / 3600)).padStart(2, '0');
            const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
            const secs = String(totalSec % 60).padStart(2, '0');
            const clockEl = document.getElementById('match-clock');
            if (clockEl) clockEl.textContent = `${hrs}:${mins}:${secs}`;
        }
    }

    // =========================================================
    // 0. ACTIVE SELECTION VISUALS & DYNAMIC TRAJECTORY LINES
    // =========================================================
    units.forEach((unit, idx) => {
            if (unit.selected && unit.selectionCircle) {
                unit.selectionCircle.rotation.y += 0.02;
                const d = Math.hypot(unit.targetPosition.x - unit.mesh.position.x, unit.targetPosition.z - unit.mesh.position.z);
                if (d > 2.5 && unit.health > 0) {
                    const p1y = (typeof getTerrainHeight === 'function' ? getTerrainHeight(unit.mesh.position.x, unit.mesh.position.z) : 0) + 0.25;
                    const p2y = (typeof getTerrainHeight === 'function' ? getTerrainHeight(unit.targetPosition.x, unit.targetPosition.z) : 0) + 0.25;
                    if (!unit.trajectoryLine) {
                        const lineMat = new THREE.LineDashedMaterial({
                                color: 0x00ffcc,
                                dashSize: 1.0,
                                gapSize: 0.6,
                                transparent: true,
                                opacity: 0.85
                        });
                        const posBuf = new Float32Array([
                                unit.mesh.position.x, p1y, unit.mesh.position.z,
                                unit.targetPosition.x, p2y, unit.targetPosition.z
                        ]);
                        const lineGeo = new THREE.BufferGeometry();
                        lineGeo.setAttribute('position', new THREE.BufferAttribute(posBuf, 3));
                        unit.trajectoryLine = new THREE.Line(lineGeo, lineMat);
                        if (typeof unit.trajectoryLine.computeLineDistances === 'function') unit.trajectoryLine.computeLineDistances();
                        scene.add(unit.trajectoryLine);
                    } else {
                        const posAttr = unit.trajectoryLine.geometry && unit.trajectoryLine.geometry.attributes && unit.trajectoryLine.geometry.attributes.position;
                        if (posAttr && posAttr.array && posAttr.array.length >= 6) {
                            posAttr.array[0] = unit.mesh.position.x; posAttr.array[1] = p1y; posAttr.array[2] = unit.mesh.position.z;
                            posAttr.array[3] = unit.targetPosition.x; posAttr.array[4] = p2y; posAttr.array[5] = unit.targetPosition.z;
                            posAttr.needsUpdate = true;
                            if (typeof unit.trajectoryLine.computeLineDistances === 'function') unit.trajectoryLine.computeLineDistances();
                        }
                    }
                } else if (unit.trajectoryLine) {
                    scene.remove(unit.trajectoryLine);
                    unit.trajectoryLine.geometry.dispose();
                    unit.trajectoryLine.material.dispose();
                    unit.trajectoryLine = null;
                }
            } else if (unit.trajectoryLine) {
                scene.remove(unit.trajectoryLine);
                unit.trajectoryLine.geometry.dispose();
                unit.trajectoryLine.material.dispose();
                unit.trajectoryLine = null;
            }
    });

    // =========================================================
    // ACTIVE STRUCTURE PRODUCTION QUEUES
    // =========================================================
    structures.forEach(structure => {
            // Nuclear Reactor overcharge green radioactive venting
            if (structure.type === 'nuclearReactor' && structure.overcharged && buildingTick % 24 === 0 && typeof spawnMuzzleFlash === 'function') {
                const ventPos = structure.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.5, 4.8, (Math.random() - 0.5) * 2.5));
                spawnMuzzleFlash(ventPos, 0x2ecc71, 0.45);
            }

            if (structure.productionQueue && structure.productionQueue.length > 0 && !structure.isBuilding && structure.health > 0) {
                const item = structure.productionQueue[0];
                item.progress = (item.progress || 0) + (dt / (item.buildTime || 4.0));

                // Vehicle Production Animation: Electric welding sparks at factory assembly bay
                if (structure.type === 'factory' && buildingTick % 16 === 0 && typeof spawnMuzzleFlash === 'function') {
                    const weldPos = structure.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 2.2, (Math.random() - 0.5) * 3));
                    spawnMuzzleFlash(weldPos, 0x00d2d3, 0.55);
                }

                // Open production bay doors shortly before unit deploys
                if (item.progress >= 0.88 && (structure.type === 'factory' || structure.type === 'barracks')) {
                    structure._doorOpenUntil = Math.max(structure._doorOpenUntil || 0, animTime + 1.8);
                }

                if (item.progress >= 1.0) {
                    if (structure.type === 'factory' || structure.type === 'barracks') {
                        structure._doorOpenUntil = animTime + 1.8;
                    }
                    // Training complete! Deploy unit in neat rank-and-file rally grid
                    const rallyIdx = (structure._producedCount || 0);
                    structure._producedCount = rallyIdx + 1;

                    const isInf = typeof isInfantryType === 'function' && isInfantryType(item.type);
                    const isAir = ['comanche', 'chinook', 'raptor', 'aurora', 'stealthfighter', 'mig'].includes(item.type);

                    // Units exit through the building's front. Include the visual footprint
                    // scale so infantry does not start inside the barracks corners.
                    const exitAngle = structure.mesh?.rotation?.y ?? structure.rotationY ?? 0;
                    const footprint = typeof getStructureFootprint === 'function'
                    ? getStructureFootprint(structure.type)
                    : { depth: (structure.radius || 8) * 2 };
                    const buildingDepth = footprint.depth * ((structure.mesh && structure.mesh.scale && structure.mesh.scale.z) || 1);
                    const exitClearance = isInf ? 4.5 : 6.5;
                    const spawnDist = Math.max((structure.radius || 0) + exitClearance, buildingDepth / 2 + exitClearance);
                    const spawnX = structure.position.x + Math.sin(exitAngle) * spawnDist;
                    const spawnZ = structure.position.z + Math.cos(exitAngle) * spawnDist;
                    const spawnY = typeof getTerrainHeight === 'function' ? getTerrainHeight(spawnX, spawnZ) : 0;
                    const spawnPos = new THREE.Vector3(spawnX, spawnY, spawnZ);

                    const productionFaction = structure.faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa');
                    const newUnit = spawnUnit(item.type, spawnPos, productionFaction);

                    const isHarvesterUnit = (newUnit.type === 'chinook' || newUnit.type === 'truck' || (newUnit.type === 'worker' && (structure.type === 'supplyStash' || structure.type === 'supplyCenter')));
                    if (isHarvesterUnit) {
                        newUnit.taskState = 'Idle';
                        newUnit.aiState = 'MovingToDock';
                        newUnit.supplyTarget = (typeof findNearestSupplyPoint === 'function') ? findNearestSupplyPoint(newUnit.mesh.position) : null;
                        if (newUnit.supplyTarget) {
                            newUnit.targetPosition.copy(newUnit.supplyTarget.position);
                            if (newUnit.type === 'chinook') newUnit.airState = 'flying';
                        } else if (newUnit.type === 'chinook') {
                            newUnit.airState = 'hovering';
                        }
                    } else if (newUnit.isAir) {
                        if (structure.rallyPoint) {
                            const airSpread = ((rallyIdx % 6) - 2.5) * 4.5;
                            const targetAirX = structure.rallyPoint.x + airSpread;
                            const targetAirZ = structure.rallyPoint.z + Math.floor(rallyIdx / 6) * 4.5;
                            const targetAirY = (typeof getTerrainHeight === 'function' ? getTerrainHeight(targetAirX, targetAirZ) : 0) + (newUnit.mesh.userData.flightAltitude || 8.5);
                            newUnit.targetPosition.set(targetAirX, targetAirY, targetAirZ);
                            newUnit.patrolCenter.copy(structure.rallyPoint);
                            newUnit.airState = 'flying';
                            newUnit.taskState = 'Moving';
                        } else {
                            newUnit.targetPosition.copy(spawnPos);
                            newUnit.patrolCenter.copy(spawnPos);
                            newUnit.airState = (newUnit.type === 'comanche' || newUnit.type === 'chinook') ? 'hovering' : 'landed';
                            newUnit.taskState = 'Idle';
                        }
                    } else {
                        // Assign distinct staged formation slot at rally point with bridge routing
                        const baseRally = structure.rallyPoint
                        ? structure.rallyPoint.clone()
                        : structure.position.clone().add(new THREE.Vector3(Math.sin(exitAngle), 0, Math.cos(exitAngle)).multiplyScalar(spawnDist + (isInf ? 7.0 : 12.0)));

                        const slotPos = getUnoccupiedRallySlot(baseRally, newUnit.radius || 1.8, isInf, exitAngle);
                        newUnit.targetPosition.copy(slotPos);
                        newUnit.taskState = 'Moving';
                        newUnit.waypoints = [];
                        if (structure.rallyPoint && typeof findBridgeCrossingsForPath === 'function') {
                            const bridges = findBridgeCrossingsForPath(newUnit.mesh.position, slotPos, structure);
                            if (bridges && bridges.length > 0) {
                                newUnit.waypoints = [...bridges.filter(Boolean), slotPos.clone()];
                                newUnit.targetPosition.copy(newUnit.waypoints.shift());
                            }
                        }
                        if (structure.rallyPoint && newUnit.waypoints.length === 0 && typeof findNavigationPath === 'function') {
                            const navPath = findNavigationPath(newUnit.mesh.position, slotPos);
                            if (navPath && navPath.length > 1) {
                                newUnit.targetPosition.copy(navPath[0]);
                                newUnit.waypoints = navPath.slice(1);
                            }
                        }
                    }
                    if (typeof playUnitReadySound === 'function') {
                        playUnitReadySound(item.type, newUnit.faction || productionFaction);
                    } else {
                        playUSASound('construction');
                    }
                    showNotification('Unit ready: ' + item.name, 'success');
                    structure.productionQueue.shift();
                    updateSidebar();
                }
            }
    });

    // =========================================================
    // ACTIVE DRONES, OVERLORD UPGRADES & HEROIC VETERANCY REGENERATION
    // =========================================================
    let cachedLivingUnits = null;
    const getLivingUnits = () => {
        if (!cachedLivingUnits) {
            cachedLivingUnits = [...units, ...enemyUnits];
        }
        return cachedLivingUnits;
    };

    // Authentic SAGE Engine Veterancy Passive Regeneration for structures & AI units (1x/sec)
    if (_simStepsThisFrame > 0 && buildingTick % 60 === 0) {
        const sLists = [structures, enemyStructures];
        for (let li = 0; li < 2; li++) {
            const arr = sLists[li];
            for (let si = 0; si < arr.length; si++) {
                const st = arr[si];
                if (!st || st.isBuilding || st.health <= 0 || st.health >= st.maxHealth || !st.veterancy) continue;
                const sHeal = st.veterancy >= 3 ? 12 : (st.veterancy === 2 ? 6 : 3);
                st.health = Math.min(st.maxHealth, st.health + sHeal);
            }
        }
        for (let ei = 0; ei < enemyUnits.length; ei++) {
            const eu = enemyUnits[ei];
            if (!eu || eu.health <= 0 || eu.health >= eu.maxHealth || !eu.veterancy) continue;
            const uHeal = eu.veterancy >= 3 ? 6 : (eu.veterancy === 2 ? 4 : 2);
            eu.health = Math.min(eu.maxHealth, eu.health + uHeal);
        }
    }

    const updateVehicleDroneForUnit = (unit) => {
        if (!unit || unit.health <= 0 || !unit.mesh || !unit.drone || !unit.drone.mesh) return;
        const drone = unit.drone;
        const dMesh = drone.mesh;
        dMesh.visible = unit.mesh.visible;
        drone.timer = (drone.timer || 0) + 1;

        if (drone.type === 'scout') {
            // Scout Drone: continuous circular orbit around the host vehicle at high reconnaissance altitude
            drone.orbitAngle = (drone.orbitAngle !== undefined ? drone.orbitAngle : Math.random() * Math.PI * 2) + 0.038;
            const orbitRadius = 7.5;
            const targetX = unit.mesh.position.x + Math.sin(drone.orbitAngle) * orbitRadius;
            const targetZ = unit.mesh.position.z + Math.cos(drone.orbitAngle) * orbitRadius;
            const targetY = unit.mesh.position.y + 8.5 + Math.sin(drone.orbitAngle * 1.5) * 0.35;

            dMesh.position.x += (targetX - dMesh.position.x) * 0.12;
            dMesh.position.z += (targetZ - dMesh.position.z) * 0.12;
            dMesh.position.y += (targetY - dMesh.position.y) * 0.12;

            // Tangential heading facing orbit direction + inward banking roll
            dMesh.rotation.order = 'YXZ';
            dMesh.rotation.y = drone.orbitAngle + Math.PI / 2;
            dMesh.rotation.z = -0.22;
            dMesh.rotation.x = 0.08;

            // Fast spinning reconnaissance propeller (PERF: prop nodes cached once)
            if (!drone._propNodes) {
                drone._propNodes = [];
                dMesh.traverse(c => { if (c.name && c.name.toLowerCase().includes('prop')) drone._propNodes.push(c); });
            }
            for (let pi = 0; pi < drone._propNodes.length; pi++) drone._propNodes[pi].rotation.z += 0.65;

            // Scout Drone Function: +50% Sight/Scan Range & Active Stealth/Mine Detection within 32 units
            unit.detectsStealth = true;
            if (unit._baseScanRange) unit.scanRange = Math.round(unit._baseScanRange * 1.5);
            if (drone.timer % 20 === 0) {
                const detectR2 = 32.0 * 32.0;
                const uX = unit.mesh.position.x, uZ = unit.mesh.position.z;
                const livingAll = getLivingUnits();
                for (let li = 0; li < livingAll.length; li++) {
                    const eu = livingAll[li];
                    if (eu.health > 0 && eu.mesh && !isFriendly(unit, eu)) {
                        const dx = eu.mesh.position.x - uX, dz = eu.mesh.position.z - uZ;
                        if (dx * dx + dz * dz <= detectR2) {
                            eu.isStealthed = false;
                            eu.revealedUntil = buildingTick + 120;
                        }
                    }
                }
                const allStructs = [structures, enemyStructures];
                for (let sl = 0; sl < 2; sl++) {
                    const sArr = allStructs[sl];
                    for (let si = 0; si < sArr.length; si++) {
                        const es = sArr[si];
                        if (es.health > 0 && es.position && !isFriendly(unit, es)) {
                            const dx = es.position.x - uX, dz = es.position.z - uZ;
                            if (dx * dx + dz * dz <= detectR2) {
                                if (!es.hasCamoNetting) es.isStealthed = false;
                                es.revealedUntil = buildingTick + 120;
                            }
                        }
                    }
                }
            }
        } else if (drone.type === 'hellfire') {
            // Hellfire Drone: flies like the recon drone with horizontal flight attitude, circling the host vehicle
            if (drone.orbitAngle === undefined) drone.orbitAngle = Math.random() * Math.PI * 2;
            drone.orbitAngle += 0.030 + Math.sin(drone.timer * 0.015) * 0.005;

            const orbitRadius = 6.2 + Math.sin(drone.timer * 0.02) * 0.8;
            const targetX = unit.mesh.position.x + Math.sin(drone.orbitAngle) * orbitRadius;
            const targetZ = unit.mesh.position.z + Math.cos(drone.orbitAngle) * orbitRadius;
            const targetY = unit.mesh.position.y + 6.8 + Math.sin(drone.timer * 0.05) * 0.35;

            dMesh.position.x += (targetX - dMesh.position.x) * 0.11;
            dMesh.position.z += (targetZ - dMesh.position.z) * 0.11;
            dMesh.position.y += (targetY - dMesh.position.y) * 0.11;

            // Fly like recon drone: horizontal orientation facing flight tangent, slight nose trim, gentle banking roll
            dMesh.rotation.order = 'YXZ';
            dMesh.rotation.y = drone.orbitAngle + Math.PI / 2;
            dMesh.rotation.x = 0.08 + Math.sin(drone.timer * 0.04) * 0.03;
            dMesh.rotation.z = -0.18 + Math.sin(drone.timer * 0.05) * 0.04;
        } else {
            // Battle Drone: oriented downwards (~41 degrees down pitch) towards ground targets, hovering & wandering
            if (drone.orbitAngle === undefined) drone.orbitAngle = Math.random() * Math.PI * 2;
            drone.orbitAngle += 0.020 + Math.sin(drone.timer * 0.015) * 0.008;

            const dynamicDist = 4.4 + Math.sin(drone.timer * 0.035) * 1.2;
            const targetX = unit.mesh.position.x + Math.sin(drone.orbitAngle) * dynamicDist + Math.cos(drone.timer * 0.02) * 0.7;
            const targetZ = unit.mesh.position.z + Math.cos(drone.orbitAngle) * dynamicDist + Math.sin(drone.timer * 0.025) * 0.7;
            const targetY = unit.mesh.position.y + 4.8 + Math.sin(drone.timer * 0.08) * 0.32;

            dMesh.position.x += (targetX - dMesh.position.x) * 0.10;
            dMesh.position.z += (targetZ - dMesh.position.z) * 0.10;
            dMesh.position.y += (targetY - dMesh.position.y) * 0.10;

            // Upright hover attitude with gentle hovering bob
            dMesh.rotation.order = 'YXZ';
            dMesh.rotation.y = drone.orbitAngle + Math.PI / 2;
            dMesh.rotation.x = Math.sin(drone.timer * 0.06) * 0.05;
            dMesh.rotation.z = Math.sin(drone.timer * 0.07) * 0.06;

            // Ducted lift fan spin (PERF: fan nodes cached once)
            if (!drone._fanNodes) {
                drone._fanNodes = [];
                dMesh.traverse(c => {
                        if (c.name && (c.name.toLowerCase().includes('fan') || c.name.toLowerCase().includes('ducted'))) drone._fanNodes.push(c);
                });
            }
            for (let fi = 0; fi < drone._fanNodes.length; fi++) drone._fanNodes[fi].rotation.y += 0.55;

            // Swiveling underbelly gun (TURRET01 & TURRETEL01)
            const dTurret = getCachedNode(dMesh, 'droneTurret') || getCachedNode(dMesh, 'turretSystem');
            const dElev = getCachedNode(dMesh, 'droneTurretElevation') || getCachedNode(dMesh, 'TURRETEL01');
            if (dTurret) {
                const dmX = dMesh.position.x;
                const dmZ = dMesh.position.z;
                const maxDistSq = 18.0 * 18.0;
                const enemyInf = getLivingUnits().find(e => {
                        if (e.health <= 0 || e.isAir || isFriendly(unit, e)) return false;
                        const dx = e.mesh.position.x - dmX;
                        const dz = e.mesh.position.z - dmZ;
                        return (dx * dx + dz * dz) <= maxDistSq;
                });

                if (enemyInf) {
                    const ex = enemyInf.mesh.position.x;
                    const ez = enemyInf.mesh.position.z;
                    const targetAngle = Math.atan2(ex - dmX, ez - dmZ);
                    let relYaw = targetAngle - dMesh.rotation.y;
                    while (relYaw > Math.PI) relYaw -= Math.PI * 2;
                    while (relYaw < -Math.PI) relYaw += Math.PI * 2;
                    const clampedYaw = Math.max(-1.3, Math.min(1.3, relYaw));
                    dTurret.rotation.y += (clampedYaw - dTurret.rotation.y) * 0.20;

                    if (dElev) {
                        const dy = enemyInf.mesh.position.y - dMesh.position.y;
                        const dist = Math.hypot(ex - dmX, ez - dmZ);
                        const angleElev = Math.atan2(-dy, dist) - dMesh.rotation.x;
                        const clampedElev = Math.max(-0.4, Math.min(0.4, angleElev));
                        dElev.rotation.x += (clampedElev - dElev.rotation.x) * 0.20;
                    }
                } else {
                    const sweepYaw = Math.sin(drone.timer * 0.05) * 0.38;
                    const sweepPitch = Math.sin(drone.timer * 0.07) * 0.12;
                    dTurret.rotation.y += (sweepYaw - dTurret.rotation.y) * 0.10;
                    if (dElev) {
                        dElev.rotation.x += (sweepPitch - dElev.rotation.x) * 0.10;
                    }
                }
            }
        }

        // Battle Drone: Repairs host vehicle (+8 HP/s stationary, +5 HP/s moving, with welding arc & sparks) + fires micro-MG at hostile targets
        if (drone.type === 'battle') {
            if (drone.timer % 60 === 0 && unit.health < unit.maxHealth) {
                const isMoving = unit.targetPosition && Math.hypot(unit.targetPosition.x - unit.mesh.position.x, unit.targetPosition.z - unit.mesh.position.z) > 0.8;
                const repairAmt = isMoving ? 5 : 8;
                unit.health = Math.min(unit.maxHealth, unit.health + repairAmt);
                const hullPos = unit.mesh.position.clone().add(new THREE.Vector3(0, 1.1, 0));
                if (dMesh.visible && typeof spawnLaserBeam === 'function') {
                    spawnLaserBeam(dMesh.position.clone(), hullPos, 0x00d2d3, 1.5);
                }
                if (dMesh.visible && typeof spawnSparks === 'function') {
                    spawnSparks(hullPos, 0x00f2fe, 5);
                }
                if (unit.selected && typeof updateSidebar === 'function') updateSidebar();
            }
            if (drone.timer % 35 === 0) {
                const dmX = dMesh.position.x;
                const dmZ = dMesh.position.z;
                const maxDistSq = 23.8 * 23.8; // Retail INIZH.big BattleDroneMachineGun (110 * 0.216)
                const enemyInf = getLivingUnits().find(e => {
                        if (e.health <= 0 || e.isAir || isFriendly(unit, e)) return false;
                        const dx = e.mesh.position.x - dmX;
                        const dz = e.mesh.position.z - dmZ;
                        return (dx * dx + dz * dz) <= maxDistSq;
                });
                if (enemyInf) {
                    let muzzlePos = dMesh.position.clone();
                    const muzzleNode = getCachedNode(dMesh, 'MUZZLE01');
                    if (muzzleNode) muzzleNode.getWorldPosition(muzzlePos);
                    spawnBulletTracer(muzzlePos, enemyInf.mesh.position, 0x00d2d3, 1.5);
                    playAudio('machine_gun', { pos: muzzlePos });
                    applyCalculatedDamage(unit, enemyInf, 16, 'SMALL_ARMS');
                }
            }
        }

        // Hellfire Drone: Launches guided armor-piercing Hellfire missiles at hostile vehicles & structures (credits kills to host!)
        if (drone.type === 'hellfire') {
            if (drone.timer % 80 === 0) {
                const dmX = dMesh.position.x;
                const dmZ = dMesh.position.z;
                const maxDistSq = 32.4 * 32.4; // Retail INIZH.big HellfireMissileWeapon (150 * 0.216)
                let hellfireTarget = getLivingUnits().find(e => {
                        if (e.health <= 0 || e.isAir || isFriendly(unit, e)) return false;
                        const dx = e.mesh.position.x - dmX;
                        const dz = e.mesh.position.z - dmZ;
                        return (dx * dx + dz * dz) <= maxDistSq;
                });
                if (!hellfireTarget) {
                    const sLists = [structures, enemyStructures];
                    for (let sl = 0; sl < 2 && !hellfireTarget; sl++) {
                        hellfireTarget = sLists[sl].find(es => {
                            if (es.health <= 0 || !es.position || isFriendly(unit, es)) return false;
                            const dx = es.position.x - dmX;
                            const dz = es.position.z - dmZ;
                            return (dx * dx + dz * dz) <= maxDistSq;
                        });
                    }
                }
                if (hellfireTarget) {
                    let launchPos = dMesh.position.clone();
                    const pylonNode = getCachedNode(dMesh, 'WEAPONA');
                    if (pylonNode) pylonNode.getWorldPosition(launchPos);
                    const tPos = (hellfireTarget.position || hellfireTarget.mesh.position).clone();
                    spawnRocketProjectile(launchPos, tPos, false, false, {
                            attacker: unit,
                            target: hellfireTarget,
                            damage: 48,
                            damageType: 'ARMOR_PIERCING',
                            splashRadius: 1.5
                    });
                    playAudio('missile_launch', { pos: launchPos });
                }
            }
        }
    };

    // Update AI vehicle drones (Scout, Battle, Hellfire) so they orbit and follow their host tanks!
    for (let ei = 0; ei < enemyUnits.length; ei++) {
        const eu = enemyUnits[ei];
        if (eu && eu.drone && eu.drone.mesh) updateVehicleDroneForUnit(eu);
    }

    units.forEach((unit, idx) => {
            if (unit.health <= 0) return;

            // 1. Authentic SAGE Engine Veterancy Passive Regeneration (ActiveBody.cpp)
            if (_simStepsThisFrame > 0 && buildingTick % 60 === 0 && unit.health < unit.maxHealth) {
                if (unit.veterancy === 1) unit.health = Math.min(unit.maxHealth, unit.health + 2); // +2 HP/s
                else if (unit.veterancy === 2) unit.health = Math.min(unit.maxHealth, unit.health + 4); // +4 HP/s
                else if (unit.veterancy === 3) unit.health = Math.min(unit.maxHealth, unit.health + 6); // +6 HP/s
            }

            // 2. USA Vehicle Drones (Scout, Battle, Hellfire)
            if (unit.drone && unit.drone.mesh) {
                updateVehicleDroneForUnit(unit);
            }

            // 3. China Overlord Upgrades Active Logic
            if (unit.type === 'overlord' && unit.overlordUpgrade) {
                unit.upgTimer = (unit.upgTimer || 0) + 1;
                const uX = unit.mesh.position.x;
                const uZ = unit.mesh.position.z;

                // Overlord Bunker: firing is performed authentically by the actual garrisoned infantry via processCombatScanning()!

                // Overlord Gatling Cannon: Stealth detection (firing handled by processCombatScanning)
                if (unit.overlordUpgrade === 'gatling') {
                    unit.detectsStealth = true;
                }

                // Overlord Propaganda / Speaker Tower (Official INIZH.big ChinaTankOverlordPropagandaTower: Radius = 150 * 0.216 = 32.4u, 1% maxHP/s or 2% w/ Subliminal Messaging + Horde buff)
                if ((unit.overlordUpgrade === 'propaganda' || unit.overlordUpgrade === 'speaker') && unit.upgTimer % 60 === 0) {
                    const maxDistSq = 32.4 * 32.4;
                    const hasSub = !unit.isAI && (typeof researchedTechs !== 'undefined' && researchedTechs.has('subliminal'));
                    const healPct = hasSub ? 0.02 : 0.01;
                    if (typeof spawnPropagandaPulseRing === 'function') {
                        spawnPropagandaPulseRing(unit.mesh.position, hasSub, 5.2);
                    }
                    const myTeamList = unit.isAI ? enemyUnits : units;
                    for (let ai = 0; ai < myTeamList.length; ai++) {
                        const ally = myTeamList[ai];
                        if (!ally || ally.health <= 0 || !ally.mesh) continue;
                        const dx = ally.mesh.position.x - uX;
                        const dz = ally.mesh.position.z - uZ;
                        if ((dx * dx + dz * dz) <= maxDistSq) {
                            if (ally.health < ally.maxHealth) {
                                const healAmt = Math.max(1, Math.round((ally.maxHealth || 200) * healPct));
                                ally.health = Math.min(ally.maxHealth, ally.health + healAmt);
                            }
                            ally._propagandaUntil = buildingTick + 90;
                            ally._subliminalActive = hasSub;
                        }
                    }
                }
            }

            // 4. USA Ambulance Field Medic & Decontamination Aura
            if (unit.type === 'ambulance' && unit.health > 0 && buildingTick % 30 === 0) {
                const ambX = unit.mesh.position.x, ambZ = unit.mesh.position.z;
                const healR2 = 16.0 * 16.0;
                const myTeamList = unit.isAI ? enemyUnits : units;
                myTeamList.forEach(ally => {
                        if (ally.health > 0 && ally.health < ally.maxHealth && ally.mesh) {
                            const dx = ally.mesh.position.x - ambX, dz = ally.mesh.position.z - ambZ;
                            if (dx * dx + dz * dz <= healR2) {
                                ally.health = Math.min(ally.maxHealth, ally.health + 6);
                            }
                        }
                });
                if (unit.garrisoned && unit.garrisoned.length > 0) {
                    unit.garrisoned.forEach(p => {
                            if (p.health > 0 && p.health < p.maxHealth) p.health = Math.min(p.maxHealth, p.health + 8);
                    });
                }
            }

            // 5. China Hacker Autonomous Internet Cash Hacking (when stationary OR inside Internet Center)
            if (unit.type === 'hacker' && unit.health > 0 && !unit.combatTarget) {
                const inInternetCenter = !!(unit.garrisonedIn && unit.garrisonedIn.type === 'internetCenter' && unit.garrisonedIn.health > 0 && !unit.garrisonedIn.isBuilding);
                const moveDist = Math.hypot(unit.targetPosition.x - unit.mesh.position.x, unit.targetPosition.z - unit.mesh.position.z);
                if (inInternetCenter || moveDist < 0.8) {
                    unit._isHacking = true;
                    // Show deployed hacking terminal, crouch/typing stance & glowing green uplink ring when stationary outside
                    if (!inInternetCenter && unit.mesh && !unit._hackVisual && typeof THREE !== 'undefined' && typeof THREE.CylinderGeometry === 'function') {
                        const hGrp = new THREE.Group();
                        const matGlow = new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
                        const matDeck = new THREE.MeshStandardMaterial({ color: 0x1e272e, roughness: 0.6, metalness: 0.4 });
                        const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 18), matGlow);
                        ring.rotation.x = -Math.PI / 2;
                        ring.position.y = 0.12;
                        const laptopBase = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 0.38), matDeck);
                        laptopBase.position.set(0, 0.48, 0.68);
                        const laptopScreen = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.34, 0.04), matGlow);
                        laptopScreen.position.set(0, 0.66, 0.86);
                        laptopScreen.rotation.x = -0.25;
                        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), matGlow);
                        mast.position.set(0.55, 0.9, 0.45);
                        const dish = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.28, 8), matGlow);
                        dish.rotation.x = Math.PI * 0.75;
                        dish.position.set(0.55, 1.85, 0.45);
                        hGrp.add(ring, laptopBase, laptopScreen, mast, dish);
                        unit.mesh.add(hGrp);
                        unit._hackVisual = hGrp;
                        unit._hackDish = dish;
                    }
                    if (unit._hackVisual) {
                        unit._hackVisual.visible = !inInternetCenter;
                        if (!inInternetCenter && unit._hackDish) unit._hackDish.rotation.y += 0.08;
                    }
                    if (!inInternetCenter && unit.mesh) {
                        // Authentic Hacker crouched typing stance
                        unit.mesh.rotation.x = 0.22 + Math.sin(buildingTick * 0.45) * 0.04;
                    }
                    unit._hackTimer = (unit._hackTimer || 0) + 1;
                    const hackCycle = inInternetCenter ? 40 : 60; // Internet Center accelerates hacking (+50% faster + boosted yield)
                    if (unit._hackTimer >= hackCycle) {
                        unit._hackTimer = 0;
                        const vetRates = inInternetCenter ? [8, 9, 12, 15] : [5, 6, 8, 10];
                        const vetIdx = Math.min(3, Math.max(0, unit.veterancy || 0));
                        const hackGain = vetRates[vetIdx];
                        unit._hackXp = (unit._hackXp || 0) + 1;
                        if (unit._hackXp >= 15 && (unit.veterancy || 0) < 1) { unit.veterancy = 1; }
                        else if (unit._hackXp >= 35 && (unit.veterancy || 0) < 2) { unit.veterancy = 2; }
                        else if (unit._hackXp >= 60 && (unit.veterancy || 0) < 3) { unit.veterancy = 3; }
                        if (!unit.isAI) {
                            playerResources += hackGain;
                            const cashOrigin = inInternetCenter
                            ? (unit.garrisonedIn.position || unit.garrisonedIn.mesh.position).clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.5, 4.5, (Math.random() - 0.5) * 2.5))
                            : unit.mesh.position.clone().add(new THREE.Vector3(0, 2.2, 0));
                            if (typeof spawnFloatingCashNumber === 'function') spawnFloatingCashNumber(cashOrigin, hackGain);
                            if (typeof updateHUD === 'function') updateHUD();
                        }
                    }
                } else {
                    unit._isHacking = false;
                    if (unit._hackVisual) unit._hackVisual.visible = false;
                    if (unit.mesh) unit.mesh.rotation.x = 0;
                }
            } else if (unit._hackVisual) {
                unit._hackVisual.visible = false;
                if (unit.mesh) unit.mesh.rotation.x = 0;
            }

            // 6. Dozer & Worker Mine / Demo Trap Sweeping + China Troop Crawler Stealth Detection
            if ((unit.type === 'dozer' || unit.type === 'worker' || unit.type === 'crawler') && unit.health > 0 && buildingTick % 30 === 0) {
                const sweepR2 = (unit.type === 'crawler' ? 28.0 * 28.0 : 12.0 * 12.0);
                const uX = unit.mesh.position.x, uZ = unit.mesh.position.z;
                enemyUnits.forEach(eu => {
                        if (eu.health > 0 && eu.mesh && !isFriendly(unit, eu)) {
                            const dx = eu.mesh.position.x - uX, dz = eu.mesh.position.z - uZ;
                            if (dx * dx + dz * dz <= sweepR2) {
                                eu.isStealthed = false;
                                eu.revealedUntil = buildingTick + 90;
                            }
                        }
                });
                if ((unit.type === 'dozer' || unit.type === 'worker') && typeof landmines !== 'undefined' && landmines.length > 0) {
                    for (let mi = landmines.length - 1; mi >= 0; mi--) {
                        const mine = landmines[mi];
                        if (mine && !isFriendly(unit, mine) && mine.position) {
                            const dx = mine.position.x - uX, dz = mine.position.z - uZ;
                            if (dx * dx + dz * dz <= 12.0 * 12.0) {
                                if (mine.mesh) scene.remove(mine.mesh);
                                landmines.splice(mi, 1);
                                if (!unit.isAI && typeof showNotification === 'function') {
                                    showNotification(`${unit.type.toUpperCase()} disarmed hostile landmine!`, 'info');
                                }
                            }
                        }
                    }
                }
            }

            // 7. Unmanned Vehicle Re-Crewing (Any infantry touching a vehicle whose driver was sniped by Jarmen Kell captures it!)
            if ((buildingTick + idx) % 6 === 0 && typeof isInfantryType === 'function' && isInfantryType(unit.type) && unit.health > 0 && !unit.garrisonedIn) {
                const allVehicles = getLivingUnits();
                for (let vi = 0; vi < allVehicles.length; vi++) {
                    const uv = allVehicles[vi];
                    if (!uv || !uv.isUnmanned || uv.health <= 0 || !uv.mesh) continue;
                    if (unit.mesh.position.distanceTo(uv.mesh.position) <= (uv.radius || 2.5) + 2.0) {
                        if (enemyUnits.includes(uv) && !unit.isAI) {
                            enemyUnits.splice(enemyUnits.indexOf(uv), 1);
                            units.push(uv);
                        } else if (units.includes(uv) && unit.isAI) {
                            units.splice(units.indexOf(uv), 1);
                            enemyUnits.push(uv);
                        }
                        uv.teamId = unit.teamId;
                        uv.ownerId = unit.ownerId;
                        uv.isAI = unit.isAI;
                        uv.isUnmanned = false;
                        uv.disabledUntil = 0;
                        uv.combatTarget = null;
                        unit.health = 0;
                        if (!unit.isAI && typeof showNotification === 'function') {
                            showNotification(`${unit.type.toUpperCase()} crewed and captured unmanned ${uv.type.toUpperCase()}!`, 'success');
                        }
                        break;
                    }
                }
            }
    });


    // Water surface ripple animation
    if (waterMesh && waterMesh.visible) {
        const baseWaterY = (typeof currentWaterLevel !== 'undefined') ? currentWaterLevel : -0.6;
        waterMesh.position.y = baseWaterY + Math.sin(animTime * 2.5) * 0.05;
    }

    // Dynamic military & building animations (Authentic C&C Generals building movements)
    // PERF: instead of traversing the whole scene graph every frame, each top-level
    // scene object caches its list of animated sub-nodes (rebuilt only if its children change).
    forEachAnimatedNode((obj, kind) => {
            if (kind === 1) {
                obj.rotation.y += 0.45;
            } else if (kind === 2) {
                obj.rotation.y -= 0.45;
            } else if (kind === 4) {
                // Building rooftop ventilation / exhaust fans
                obj.rotation.y += 0.14;
            } else if (kind === 5) {
                // W3D 3-segment faction flag cloth ripple
                const phase = (obj.id || 0) * 0.9;
                obj.rotation.x = Math.sin(animTime * 3.8 + phase) * 0.12;
                obj.rotation.y = Math.cos(animTime * 2.6 + phase) * 0.09;
            } else if (kind === 6) {
                // W3D China & Black Market hanging banners waving in wind
                const phase = (obj.id || 0) * 0.7;
                obj.rotation.z = Math.sin(animTime * 3.5 + phase) * 0.10;
                obj.rotation.y = Math.sin(animTime * 2.3 + phase) * 0.06;
            } else if (kind === 7) {
                // W3D GLA cloth tarps & canopies billowing in wind
                const phase = (obj.id || 0) * 0.8;
                obj.rotation.x = Math.sin(animTime * 2.7 + phase) * 0.065;
            } else if (obj.name === "radarDish" || obj.name === "radarDish2") {
                // Continuous radar dish / array rotation
                obj.rotation.y += 0.025;
            } else if (obj.name === "usaCcCraneBoom") {
                // USA Command Center front mini-crane gentle slewing
                obj.rotation.y = Math.sin(animTime * 0.65) * 0.42;
            } else if (obj.name === "usaCcCraneHook") {
                // USA Command Center dangling crane cable & hook sway
                obj.rotation.z = Math.sin(animTime * 2.0) * 0.11;
                obj.rotation.x = Math.cos(animTime * 1.4) * 0.07;
            } else if (obj.name === "hazardBeacon") {
                // Alert strobes blinking
                obj.visible = (Math.floor(animTime * 4) % 2 === 0);
            } else if (obj.name === "fusionCore" || obj.name === "nukeCore") {
                // Reactor core pulsing energy
                const pulse = 1.0 + Math.sin(animTime * 4) * 0.18;
                obj.scale.set(pulse, pulse, pulse);
            } else if (obj.name === "pumpjackArm" || obj.name === "OILDERRICK") {
                // Tech Oil Derrick walking-beam pumpjack rocking motion
                obj.rotation.x = Math.sin(animTime * 2.2) * 0.24;
            } else if (obj.name === "HAMMERS") {
                // Tech Oil Derrick counterweight crank rocking in sync
                obj.rotation.x = -Math.sin(animTime * 2.2) * 0.28;
            } else if (obj.name === "particleAcceleratorRing") {
                // Particle Cannon magnetic accelerator spinning ring
                obj.rotation.z += 0.04;
            } else if (obj.name === "particleEmitter") {
                // Particle Cannon pulsating ion lens
                const pPulse = 1.0 + Math.sin(animTime * 5.0) * 0.14;
                obj.scale.set(pPulse, pPulse, pPulse);
            } else if (obj.name === "nukeTip") {
                // Thermonuclear missile cryogenic breathing elevation
                obj.position.y = 1.8 + Math.sin(animTime * 1.5) * 0.25;
            } else if (obj.name === "nukeBlastDoorL") {
                const openAmt = Math.max(0, Math.sin(animTime * 1.5)) * 0.35;
                obj.position.x = -2.2 - openAmt;
            } else if (obj.name === "nukeBlastDoorR") {
                const openAmt = Math.max(0, Math.sin(animTime * 1.5)) * 0.35;
                obj.position.x = 2.2 + openAmt;
            } else if (obj.name === "scudGantry" || (obj.name && obj.name.startsWith("scudGantry_"))) {
                // SCUD Storm launch gantry breathing angle (skip while superweapon charge owns rotation.x)
                if (!(obj.userData && obj.userData._chargeControlled)) {
                    obj.rotation.x = -Math.PI / 5.5 + Math.sin(animTime * 1.2) * 0.03;
                }
            } else if (obj.name === "factionFlag") {
                // Barracks cloth flagpole flag waving in wind
                obj.rotation.y = Math.sin(animTime * 3.8) * 0.18;
            }
    });

    // Smooth cruising flight altitude for aircraft
    units.forEach(u => {
            if (u.isAir && u.health > 0) {
                const flightY = u.mesh.userData.flightAltitude || 8.5;
                u.mesh.position.y += (flightY - u.mesh.position.y) * 0.06;
            }
    });

    // Animate Cold Fusion Reactor pulsing blue rods
    const pulseBlue = 1.3 + Math.sin(animTime * 4.0) * 0.45;
    structures.forEach(s => {
            if ((s.type === 'power' || s.type === 'coldFusionReactor') && s.mesh && s.health > 0) {
                // PERF: cache the pulsing rod meshes once instead of traversing every frame
                if (!s._pulseMeshes) {
                    s._pulseMeshes = [];
                    s.mesh.traverse(c => {
                            if (c.isMesh && c.name && (c.name.toLowerCase().includes('power glow') || c.name.toLowerCase().includes('cylinder'))) s._pulseMeshes.push(c);
                    });
                }
                for (let i = 0; i < s._pulseMeshes.length; i++) {
                    const c = s._pulseMeshes[i];
                    if (c.material && c.material.emissiveIntensity !== undefined) {
                        c.material.emissiveIntensity = pulseBlue;
                    }
                }
            }
            if (s.type === 'supplyDrop' && !s.isBuilding && s.health > 0 && (buildingTick % 4 === 0) && typeof spawnSmokePuff === 'function') {
                const smokePos = s.position.clone().add(new THREE.Vector3(
                        (Math.random() - 0.5) * 0.7,
                        0.9,
                        (Math.random() - 0.5) * 0.7
                ));
                spawnSmokePuff(smokePos, (buildingTick % 8 === 0) ? 0xff4d4d : 0xd63031, 0.85);
            }
            // USA Particle Cannon: authentic soft rising blueish ion mist inside the round emitter pit
            if (s.type === 'particleCannon' && s.mesh && !s.isBuilding && s.health > 0 && (buildingTick % 14 === 0) && typeof spawnSmokePuff === 'function') {
                const pitNode = getCachedNode(s.mesh, 'particleCannonGlowLight');
                const mistPos = pitNode
                    ? pitNode.getWorldPosition(new THREE.Vector3())
                    : s.position.clone().add(new THREE.Vector3(0, 2.5, 0));
                mistPos.x += (Math.random() - 0.5) * 2.2;
                mistPos.z += (Math.random() - 0.5) * 2.2;
                mistPos.y -= 0.4;
                spawnSmokePuff(mistPos, (buildingTick % 28 === 0) ? 0x80ecff : 0x38c8ff, 0.52);
            }
            // Dusk / Night base searchlights & building night glows
            if (s.mesh && s.health > 0 && typeof window !== 'undefined' && (window._activeTimeOfDay === 'night' || window._activeTimeOfDay === 'dusk')) {
                if (!s._nightLightsAttached && !s.isBuilding && typeof attachNightLightsToStructure === 'function') {
                    attachNightLightsToStructure(s);
                    s._nightLightsAttached = true;
                }
                if (s._searchlightPivot && !s.isBuilding) {
                    const phase = s._searchlightPivot.userData.phaseOffset || 0;
                    s._searchlightPivot.rotation.y = Math.sin(animTime * 0.55 + phase) * 1.45 + phase;
                }
            }
            // Production bay blast doors: slide open when unit deploys, close afterwards
            if ((s.type === 'factory' || s.type === 'barracks') && s.mesh && !s.isBuilding && s.health > 0) {
                if (s._blastDoors === undefined) {
                    const dl = s.mesh.getObjectByName('blastDoorL');
                    const dr = s.mesh.getObjectByName('blastDoorR');
                    s._blastDoors = (dl && dr) ? [dl, dr] : null;
                    s._doorOpenProgress = 0;
                }
                if (s._blastDoors) {
                    const wantOpen = (s._doorOpenUntil || 0) > animTime ? 1 : 0;
                    s._doorOpenProgress += (wantOpen - s._doorOpenProgress) * 0.16;
                    const p = s._doorOpenProgress;
                    for (let d = 0; d < 2; d++) {
                        const door = s._blastDoors[d];
                        door.position.x = door.userData.closedX + door.userData.openOffset * p;
                    }
                }
            }
            // China Gatling Cannon defense structure spinning barrels (both BARRELS01 & BARRELS02)
            if (s.type === 'gatlingCannon' && s.mesh && !s.isBuilding && s.health > 0) {
                if (s._gatlingBarrels === undefined) {
                    s._gatlingBarrels = [];
                    s.mesh.traverse(c => {
                        if (c.name === 'gatlingBarrels' || c.name === 'gatlingBarrels2') s._gatlingBarrels.push(c);
                    });
                }
                if (s._gatlingSpinVel && s._gatlingSpinVel > 0.005) {
                    for (let b = 0; b < s._gatlingBarrels.length; b++) {
                        s._gatlingBarrels[b].rotation.z += s._gatlingSpinVel;
                    }
                    s._gatlingSpinVel *= 0.94;
                }
            }
            // GLA SCUD Storm silo doors: open when ready to fire, closed while recharging
            if (s.type === 'scudStorm' && s.mesh && !s.isBuilding && s.health > 0) {
                if (s._scudDoors === undefined) {
                    s._scudDoors = [];
                    for (let d = 1; d <= 9; d++) {
                        const dn = s.mesh.getObjectByName('DOOR0' + d);
                        if (dn) {
                            dn.userData.baseY = dn.position.y;
                            s._scudDoors.push(dn);
                        }
                    }
                    s._scudOpenAmt = 0;
                }
                if (s._scudDoors.length > 0) {
                    const ready = (s.cooldownUntil || 0) <= buildingTick ? 1 : 0;
                    s._scudOpenAmt += (ready - s._scudOpenAmt) * 0.05;
                    for (let d = 0; d < s._scudDoors.length; d++) {
                        const dn = s._scudDoors[d];
                        dn.rotation.z = s._scudOpenAmt * 1.15;
                    }
                }
            }
    });

    if (typeof structures !== 'undefined') {
        for (let si = 0; si < structures.length; si++) {
            const s = structures[si];
            if (s && s.mesh && s.health > 0) updateWindFlagsOnStructure(s.mesh, animTime);
        }
    }
    if (typeof enemyStructures !== 'undefined') {
        for (let ei = 0; ei < enemyStructures.length; ei++) {
            const es = enemyStructures[ei];
            if (es && es.mesh && es.health > 0) updateWindFlagsOnStructure(es.mesh, animTime);
        }
    }
    if (typeof window !== 'undefined' && Array.isArray(window.neutralStructures)) {
        for (let ni = 0; ni < window.neutralStructures.length; ni++) {
            const ns = window.neutralStructures[ni];
            if (ns && ns.mesh) updateWindFlagsOnStructure(ns.mesh, animTime);
        }
    }
    if (typeof worldBuildings !== 'undefined') {
        for (let wi = 0; wi < worldBuildings.length; wi++) {
            const wb = worldBuildings[wi];
            if (wb && wb.mesh && wb.garrisoned && wb.garrisoned.length > 0) updateWindFlagsOnStructure(wb.mesh, animTime);
        }
    }

    if (_simStepsThisFrame > 0 && buildingTick % 6 === 0) updateStealthAndDetection();
    processPointDefenseLasers();
    processScrapCrateCollection();
    processCameraKeyboardPanning();
    // Keep 3D sky dome centered horizontally on camera target so edges never clip
    if (typeof window !== 'undefined' && window._skyboxMesh && typeof cameraTarget !== 'undefined' && cameraTarget) {
        window._skyboxMesh.position.set(cameraTarget.x, 0, cameraTarget.z);
    }
    // Lazily attach headlights to newly spawned enemy vehicles at Dusk/Night (throttled)
    if (typeof window !== 'undefined' && (window._activeTimeOfDay === 'night' || window._activeTimeOfDay === 'dusk') && (buildingTick % 30 === 0) && typeof attachNightLightsToUnit === 'function' && typeof enemyUnits !== 'undefined') {
        for (let ei = 0; ei < enemyUnits.length; ei++) {
            const eu = enemyUnits[ei];
            if (eu && eu.health > 0 && !eu.isAir && !eu._nightLightsAttached) {
                attachNightLightsToUnit(eu);
                eu._nightLightsAttached = true;
            }
        }
    }
    updateTurretSystems();
    updateFogOfWar();
    for (let _aiStep = 0; _aiStep < _simStepsThisFrame; _aiStep++) {
        processEnemyAIEngine();
    }
    processEnemyMovement();
    processEnemyCombat();
    assignBuildersToConstruction();
    for (let _bStep = 0; _bStep < _simStepsThisFrame; _bStep++) {
        processBuildingFunctions();
    }

    let constructionActive = false;
    const allConstructing = [...structures, ...(typeof enemyStructures !== 'undefined' ? enemyStructures : [])];
    allConstructing.forEach(s => {
            if (!s || !s.isBuilding || s.health <= 0) {
                if (s && s._progressBarEl) {
                    if (s._progressBarEl.parentElement) s._progressBarEl.parentElement.removeChild(s._progressBarEl);
                    s._progressBarEl = null;
                }
                return;
            }

            if (s.dozerRef && s.dozerRef.health > 0) {
                if (s.dozerRef.targetStructure !== s) {
                    s.dozerRef = null;
                    return;
                }
                const dPos = s.dozerRef.mesh.position;
                const dist2D = Math.hypot(dPos.x - s.position.x, dPos.z - s.position.z);
                const buildThreshold = s.radius + (s.dozerRef.radius || 1.8) + 3.5;
                if (s.dozerRef.taskState === 'Building' || dist2D <= buildThreshold) {
                    if (s.dozerRef.taskState === 'Building' && buildingTick % 18 === 0 && s.position && typeof spawnSparks === 'function') {
                        const sa = Math.random() * Math.PI * 2;
                        const sr = (s.radius || 4.0) * 0.7;
                        spawnSparks(s.position.clone().add(new THREE.Vector3(Math.cos(sa) * sr, 1.4, Math.sin(sa) * sr)), 0x74b9ff, 3);
                    }
                    s.dozerRef.taskState = 'Building';
                    const OFFICIAL_STRUCTURE_BUILD_SECS = {
                        demoTrap: 5,
                        barracks: 10, patriot: 10, gatlingCannon: 10, bunker: 10, stingerSite: 10,
                        power: 15, coldFusionReactor: 15, nuclearReactor: 15, supplyCenter: 15, supplyStash: 15, tunnel: 15, speakerTower: 15,
                        factory: 20, airfield: 20,
                        center: 30, commandCenter: 30, strategyCenter: 30, propagandaCenter: 30, palace: 30, internetCenter: 30, detentionCamp: 30, blackMarket: 30,
                        supplyDrop: 45,
                        particleCannon: 60, nukeSilo: 60, scudStorm: 60
                    };
                    const buildSecs = OFFICIAL_STRUCTURE_BUILD_SECS[s.type] || 15;
                    const buildRate = 100 / (buildSecs * 60);
                    s.buildProgress += buildRate * combatDeltaScale;
                    if (s.mesh) {
                        if (s._baseScaleY === undefined) s._baseScaleY = s.mesh.scale.y || 1;
                        const pct = Math.min(1, Math.max(0, s.buildProgress / 100));
                        s.mesh.scale.y = s._baseScaleY * (0.18 + 0.82 * pct);
                        s.mesh.traverse(c => { if (c.isMesh && c.material && c.material.transparent) c.material.opacity = 0.28 + 0.62 * pct; });
                    }

                    // Rotate builder to face the building under construction
                    const toX = s.position.x - dPos.x;
                    const toZ = s.position.z - dPos.z;
                    if (Math.hypot(toX, toZ) > 0.05) {
                        s.dozerRef.mesh.rotation.y = Math.atan2(-toZ, toX) + Math.PI / 2;
                    }

                    const isAiStruct = !!s.isAI || (s.ownerId && s.ownerId !== 'player');
                    if (!isAiStruct && typeof document !== 'undefined' && progressContainer) {
                        if (!s._progressBarEl) {
                            const barEl = progressContainer.cloneNode(true);
                            barEl.removeAttribute('id');
                            barEl.style.position = 'fixed';
                            (progressContainer.parentElement || document.body).appendChild(barEl);
                            s._progressBarEl = barEl;
                        }
                        const wp = s.position.clone(); wp.y += 4; wp.project(camera);
                        const sX = (wp.x * 0.5 + 0.5) * window.innerWidth;
                        const sY = (-(wp.y * 0.5) + 0.5) * window.innerHeight;
                        if (wp.z >= -1 && wp.z <= 1) {
                            s._progressBarEl.style.display = 'block';
                            s._progressBarEl.style.left = sX + 'px';
                            s._progressBarEl.style.top = sY + 'px';
                            const fillEl = s._progressBarEl.firstElementChild;
                            if (fillEl) fillEl.style.width = Math.min(100, s.buildProgress) + '%';
                        } else {
                            s._progressBarEl.style.display = 'none';
                        }
                    }

                    if (s.buildProgress >= 100) {
                        s.isBuilding = false;
                        s.buildProgress = 100;
                        if (s._progressBarEl) {
                            if (s._progressBarEl.parentElement) s._progressBarEl.parentElement.removeChild(s._progressBarEl);
                            s._progressBarEl = null;
                        }
                        if (s.mesh && s._baseScaleY !== undefined) s.mesh.scale.y = s._baseScaleY;
                        if (s.dozerRef) {
                            const finishedBuilder = s.dozerRef;
                            finishedBuilder.taskState = 'Idle';
                            finishedBuilder.targetStructure = null;
                            s.dozerRef = null;
                            // Advance Shift-queued construction orders if any remain
                            if (finishedBuilder.buildQueue && finishedBuilder.buildQueue.length > 0 && typeof assignDozerToStructure === 'function') {
                                while (finishedBuilder.buildQueue.length > 0) {
                                    const nextStruct = finishedBuilder.buildQueue.shift();
                                    if (nextStruct && nextStruct.health > 0 && nextStruct.isBuilding) {
                                        assignDozerToStructure(finishedBuilder, nextStruct);
                                        break;
                                    }
                                }
                            }
                        }
                        s.mesh.traverse(child => { if (child.isMesh && child.savedMaterial) child.material = child.savedMaterial; });
                        const bFaction = s.faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa');
                        if (['particleCannon', 'nukeSilo', 'scudStorm'].includes(s.type)) {
                            s.swMaxCooldown = (typeof getSuperweaponMaxCooldownTicks === 'function') ? getSuperweaponMaxCooldownTicks(s.type) : 7200;
                            s.cooldownUntil = buildingTick + s.swMaxCooldown;
                            s._readyAnnounced = false;
                            if (typeof playSuperweaponEvaAlert === 'function') {
                                playSuperweaponEvaAlert(s.type, 'detected', typeof selectedFaction !== 'undefined' ? selectedFaction : bFaction);
                            }
                            if (typeof revealFogOfWarAt === 'function' && s.position) {
                                revealFogOfWarAt(s.position, 24, 600);
                            }
                            if (typeof showNotification === 'function') {
                                const swLabel = s.type === 'scudStorm' ? 'SCUD Storm' : s.type === 'nukeSilo' ? 'Nuclear Missile Silo' : 'Particle Cannon';
                                showNotification(`⚠️ ${swLabel} detected!`, 'warning');
                            }
                            if (typeof updateSuperweaponTimersHUD === 'function') updateSuperweaponTimersHUD();
                        } else if (!isAiStruct && typeof playBuildingCompleteSound === 'function') {
                            playBuildingCompleteSound(s.type, bFaction);
                        }
                        if (s.type !== 'supplyCenter' && !isAiStruct) {
                            showNotification(`${(s.type || 'Building').toUpperCase()} construction completed!`, 'success');
                        }

                        // Automatic Harvester Deployment upon Supply Center / Stash completion (Player & AI)
                        if (!s.spawnedHarvester) {
                            s.spawnedHarvester = true;
                            if (isAiStruct && typeof window !== 'undefined') {
                                window.activeEnemyColorHex = (window.aiColorMap && window.aiColorMap[s.ownerId]) || window.activeEnemyColorHex || 0xdc2626;
                            }
                            if (s.type === 'supplyCenter') {
                                if (bFaction === 'usa') {
                                    const spawnPos = s.position.clone().add(new THREE.Vector3(0, 4.5, 7.5));
                                    const chinook = isAiStruct
                                    ? (typeof spawnEnemyUnit === 'function' ? spawnEnemyUnit('chinook', spawnPos, null, 'usa') : null)
                                    : (typeof spawnUnit === 'function' ? spawnUnit('chinook', spawnPos) : null);
                                    if (chinook) {
                                        chinook.teamId = s.teamId || (typeof playerTeamId !== 'undefined' ? playerTeamId : 1);
                                        chinook.ownerId = s.ownerId || (isAiStruct ? 'ai_1' : 'player');
                                        chinook.isAI = isAiStruct;
                                        chinook.aiState = 'MovingToDock';
                                        chinook.taskState = 'Idle';
                                        chinook.airState = 'hovering';
                                        chinook.supplyTarget = (typeof findNearestSupplyPoint === 'function') ? findNearestSupplyPoint(chinook.mesh.position) : null;
                                        if (chinook.supplyTarget) {
                                            chinook.targetPosition.copy(chinook.supplyTarget.position);
                                            chinook.airState = 'flying';
                                        }
                                        if (!isAiStruct) {
                                            if (typeof playUnitReadyAudio === 'function') playUnitReadyAudio('chinook', 'usa');
                                            showNotification('USA Supply Depot constructed! Chinook transport deployed to harvest supplies.', 'success');
                                        }
                                    }
                                } else if (bFaction === 'china') {
                                    const spawnPos = s.position.clone().add(new THREE.Vector3(0, 0, 7.5));
                                    spawnPos.y = (typeof getTerrainHeight === 'function') ? getTerrainHeight(spawnPos.x, spawnPos.z) : spawnPos.y;
                                    const truck = isAiStruct
                                    ? (typeof spawnEnemyUnit === 'function' ? spawnEnemyUnit('truck', spawnPos, null, 'china') : null)
                                    : (typeof spawnUnit === 'function' ? spawnUnit('truck', spawnPos) : null);
                                    if (truck) {
                                        truck.teamId = s.teamId || 1;
                                        truck.ownerId = s.ownerId || (isAiStruct ? 'ai_1' : 'player');
                                        truck.isAI = isAiStruct;
                                        truck.aiState = 'MovingToDock';
                                        truck.taskState = 'Idle';
                                        truck.supplyTarget = (typeof findNearestSupplyPoint === 'function') ? findNearestSupplyPoint(truck.mesh.position) : null;
                                        if (truck.supplyTarget) truck.targetPosition.copy(truck.supplyTarget.position);
                                        if (!isAiStruct && typeof playUnitReadyAudio === 'function') playUnitReadyAudio('truck', 'china');
                                    }
                                }
                            } else if (s.type === 'supplyStash') {
                                const spawnPos = s.position.clone().add(new THREE.Vector3(0, 0, 7.0));
                                spawnPos.y = (typeof getTerrainHeight === 'function') ? getTerrainHeight(spawnPos.x, spawnPos.z) : spawnPos.y;
                                const worker = isAiStruct
                                ? (typeof spawnEnemyUnit === 'function' ? spawnEnemyUnit('worker', spawnPos, null, 'gla') : null)
                                : (typeof spawnUnit === 'function' ? spawnUnit('worker', spawnPos) : null);
                                if (worker) {
                                    worker.teamId = s.teamId || 1;
                                    worker.ownerId = s.ownerId || (isAiStruct ? 'ai_1' : 'player');
                                    worker.isAI = isAiStruct;
                                    worker.aiState = 'MovingToDock';
                                    worker.taskState = 'Idle';
                                    worker.supplyTarget = (typeof findNearestSupplyPoint === 'function') ? findNearestSupplyPoint(worker.mesh.position) : null;
                                    if (worker.supplyTarget) worker.targetPosition.copy(worker.supplyTarget.position);
                                    if (!isAiStruct && typeof playUnitReadyAudio === 'function') playUnitReadyAudio('worker', 'gla');
                                }
                            }
                        }
                    }
                }
            }
    });
    if (!constructionActive) progressContainer.style.display = 'none';

    // Ported from SupplyTruckAIUpdate.cpp & AIDock.cpp: Multi-slot harvester gathering for both Player and AI
    const updateHarvesterUnit = (unit, isAIUnit = false) => {
        if (!unit || unit.health <= 0 || !unit.mesh) return;
        if ((unit.type !== 'truck' && unit.type !== 'worker' && unit.type !== 'chinook') || unit.taskState !== 'Idle') return;
        const cargoHold = getCachedNode(unit.mesh, "cargoHold");
        if (cargoHold) {
            const hasCargo = !!(unit.cargoLoaded > 0 || unit.aiState === 'MovingToCenter' || unit.aiState === 'Depositing');
            cargoHold.visible = hasCargo;
            if (hasCargo && unit.type === 'chinook') {
                const swayPhase = animTime * 3.2 + (unit.mesh.id || 0);
                cargoHold.rotation.z = Math.sin(swayPhase) * 0.08;
                cargoHold.rotation.x = Math.cos(swayPhase * 0.85) * 0.06;
            } else if (unit.type === 'chinook') {
                cargoHold.rotation.z = 0;
                cargoHold.rotation.x = 0;
            }
        }
        switch (unit.aiState) {
            case 'MovingToDock': {
                if (!unit.supplyTarget || unit.supplyTarget.stock <= 0) {
                    unit.supplyTarget = findNearestSupplyPoint(unit.mesh.position);
                }
                if (unit.supplyTarget) {
                    const dockSlotPos = (typeof getSupplyDockSlotPosition === 'function' && unit.type !== 'chinook')
                    ? getSupplyDockSlotPosition(unit.supplyTarget, unit, false)
                    : unit.supplyTarget.position;
                    if (!unit.waypoints || unit.waypoints.length === 0) {
                        const dSlot = Math.hypot(unit.mesh.position.x - dockSlotPos.x, unit.mesh.position.z - dockSlotPos.z);
                        if (dSlot > 26 && !unit._harvNavDock && unit.type !== 'chinook' && typeof findNavigationPath === 'function') {
                            unit._harvNavDock = true;
                            const nav = findNavigationPath(unit.mesh.position, dockSlotPos);
                            if (nav && nav.length > 0) {
                                unit.targetPosition.copy(nav[0]);
                                unit.waypoints = nav.slice(1);
                            } else {
                                unit.targetPosition.copy(dockSlotPos);
                            }
                        } else if (!unit._harvNavDock || dSlot <= 26) {
                            unit.targetPosition.copy(dockSlotPos);
                        }
                    }
                    const distToDock = Math.hypot(unit.mesh.position.x - unit.supplyTarget.position.x, unit.mesh.position.z - unit.supplyTarget.position.z);
                    const dockDistThreshold = (unit.type === 'chinook') ? 14.0 : 11.5;
                    if (distToDock < dockDistThreshold) {
                        unit.aiState = 'Harvesting';
                        unit.timerState = 0;
                        unit._harvNavDock = false;
                        unit.waypoints = [];
                        unit.targetPosition.copy(unit.mesh.position);
                        if (unit.type === 'chinook') unit.airState = 'hovering';
                    }
                } else {
                    // All supply piles depleted: return Chinooks safely to home Supply Center instead of idling in the open
                    if (unit.type === 'chinook') {
                        let homePos = null;
                        if (isAIUnit) {
                            const aiHome = enemyStructures.find(s => s.ownerId === unit.ownerId && !s.isBuilding && s.health > 0 && (s.type === 'supplyCenter' || s.type === 'center' || s.type === 'commandCenter'));
                            if (aiHome) homePos = aiHome.position;
                        } else if (typeof getSupplyDropoffPosition === 'function') {
                            homePos = getSupplyDropoffPosition(unit.mesh.position);
                        }
                        if (homePos && Math.hypot(unit.mesh.position.x - homePos.x, unit.mesh.position.z - homePos.z) > 14.0) {
                            unit.targetPosition.copy(homePos);
                            unit.airState = 'flying';
                        } else {
                            unit.targetPosition.copy(unit.mesh.position);
                            unit.airState = 'hovering';
                        }
                    } else {
                        unit.targetPosition.copy(unit.mesh.position);
                    }
                }
                break;
            }
            case 'Harvesting':
            if (!unit.supplyTarget || unit.supplyTarget.stock <= 0) {
                unit.supplyTarget = null;
                unit.aiState = 'MovingToDock';
                break;
            }
            unit.timerState = (unit.timerState || 0) + 1;
            const hasWorkerShoes = (unit.type === 'worker' && (unit.shoesApplied || (!isAIUnit && typeof researchedTechs !== 'undefined' && researchedTechs.has('workerShoes'))));
            const harvestTicks = hasWorkerShoes ? 55 : 80;
            if (unit.timerState > harvestTicks) {
                const loadCap = (unit.type === 'worker') ? (hasWorkerShoes ? 130 : 100) : (unit.type === 'chinook' ? 600 : 200);
                unit.cargoLoaded = Math.min(loadCap, unit.supplyTarget.stock);
                unit.supplyTarget.stock -= unit.cargoLoaded;
                if (unit.supplyTarget.crystals && unit.supplyTarget.crystals.length > 0) {
                    const visibleCrystals = Math.ceil(unit.supplyTarget.stock / unit.supplyTarget.maxStock * unit.supplyTarget.crystals.length);
                    unit.supplyTarget.crystals.forEach((crystal, index) => crystal.visible = index < visibleCrystals);
                }
                if (unit.supplyTarget.cratesRef) {
                    const ratio = Math.max(0.01, unit.supplyTarget.stock / (unit.supplyTarget.maxStock || 30000));
                    unit.supplyTarget.cratesRef.scale.set(1, ratio, 1);
                    if (unit.supplyTarget.stock <= 0) unit.supplyTarget.cratesRef.visible = false;
                }
                if (cargoHold) { cargoHold.visible = true; cargoHold.scale.set(1, 1, 1); }
                unit.aiState = 'MovingToCenter';
                if (unit.type === 'chinook') unit.airState = 'flying';
            }
            break;
            case 'MovingToCenter': {
                let dropoffPosition = null;
                let bestCenter = null;
                const structPool = isAIUnit
                    ? enemyStructures.filter(s => s.ownerId === unit.ownerId && !s.isBuilding && s.health > 0)
                    : structures.filter(s => !s.isBuilding && s.health > 0);
                const supplyCenters = structPool.filter(s => s.type === 'supplyCenter' || s.type === 'supplyStash');
                const candidates = supplyCenters.length > 0
                    ? supplyCenters
                    : structPool.filter(s => s.type === 'center' || s.type === 'commandCenter');
                bestCenter = candidates[0] || null;
                if (candidates.length > 1 && unit.mesh) {
                    let bestDist = Infinity;
                    for (let ci = 0; ci < candidates.length; ci++) {
                        const c = candidates[ci];
                        const d = Math.hypot(unit.mesh.position.x - c.position.x, unit.mesh.position.z - c.position.z);
                        if (d < bestDist) { bestDist = d; bestCenter = c; }
                    }
                }
                if (bestCenter) {
                    dropoffPosition = (typeof getSupplyDockSlotPosition === 'function' && unit.type !== 'chinook')
                        ? getSupplyDockSlotPosition(bestCenter, unit, true)
                        : bestCenter.position;
                } else if (!isAIUnit && typeof getSupplyDropoffPosition === 'function') {
                    dropoffPosition = getSupplyDropoffPosition(unit.mesh.position);
                } else {
                    dropoffPosition = unit.mesh.position;
                }
                if (!unit.waypoints || unit.waypoints.length === 0) {
                    const dDrop = Math.hypot(unit.mesh.position.x - dropoffPosition.x, unit.mesh.position.z - dropoffPosition.z);
                    if (dDrop > 26 && !unit._harvNavCenter && unit.type !== 'chinook' && typeof findNavigationPath === 'function') {
                        unit._harvNavCenter = true;
                        const nav = findNavigationPath(unit.mesh.position, dropoffPosition);
                        if (nav && nav.length > 0) {
                            unit.targetPosition.copy(nav[0]);
                            unit.waypoints = nav.slice(1);
                        } else {
                            unit.targetPosition.copy(dropoffPosition);
                        }
                    } else if (!unit._harvNavCenter || dDrop <= 26) {
                        unit.targetPosition.copy(dropoffPosition);
                    }
                }
                if (cargoHold && cargoHold.scale.y < 1.0) cargoHold.scale.y += 0.015;
                const distToDropoff = Math.hypot(unit.mesh.position.x - dropoffPosition.x, unit.mesh.position.z - dropoffPosition.z);
                const distToStruct = (bestCenter && bestCenter.position)
                    ? Math.hypot(unit.mesh.position.x - bestCenter.position.x, unit.mesh.position.z - bestCenter.position.z)
                    : distToDropoff;
                const structReach = bestCenter ? ((bestCenter.radius || 8.5) + (unit.radius || 3.2) + 2.5) : 9.5;
                const centerDistThreshold = (unit.type === 'chinook') ? 14.0 : 6.0;
                if (distToDropoff < centerDistThreshold || (unit.type !== 'chinook' && distToStruct < structReach)) {
                    unit.aiState = 'Depositing';
                    unit.timerState = 0;
                    unit._harvNavCenter = false;
                    unit.waypoints = [];
                    unit.targetPosition.copy(unit.mesh.position);
                    if (unit.type === 'chinook') unit.airState = 'hovering';
                }
                break;
            }
            case 'Depositing':
            if (unit.type === 'chinook') unit.airState = 'hovering';
            unit.timerState = (unit.timerState || 0) + 1;
            const hasShoesDeposit = (unit.type === 'worker' && (unit.shoesApplied || (!isAIUnit && typeof researchedTechs !== 'undefined' && researchedTechs.has('workerShoes'))));
            const depositTicks = hasShoesDeposit ? 28 : 40;
            if (unit.timerState > depositTicks) {
                const baseEarned = unit.cargoLoaded || (unit.type === 'chinook' ? 600 : (unit.type === 'worker' ? (hasShoesDeposit ? 130 : 100) : 200));
                if (!isAIUnit && unit.teamId === (typeof playerTeamId !== 'undefined' ? playerTeamId : 1)) {
                    // USA Strategy Center "Supply Lines" upgrade: +10% bonus cash on every Supply Center delivery
                    const hasSupplyLines = (typeof researchedTechs !== 'undefined' && researchedTechs.has('supplyLines'));
                    const earned = hasSupplyLines ? Math.round(baseEarned * 1.10) : baseEarned;
                    playerResources += earned;
                    const resEl = document.getElementById('resource-display');
                    if (resEl) resEl.innerText = '$' + playerResources;
                    if (typeof spawnFloatingCashNumber === 'function' && unit.mesh) {
                        spawnFloatingCashNumber(unit.mesh.position.clone().add(new THREE.Vector3(0, 2.5, 0)), earned);
                    }
                    showNotification('Supplies delivered: +$' + earned + (hasSupplyLines ? ' (+10% Supply Lines)' : ''), 'success');
                    updateSidebar();
                } else if (unit.ownerId && typeof aiCommanders !== 'undefined' && aiCommanders[unit.ownerId]) {
                    aiCommanders[unit.ownerId].resources = (aiCommanders[unit.ownerId].resources || 0) + baseEarned;
                } else if (typeof aiResources !== 'undefined') {
                    aiResources += baseEarned;
                }
                unit.cargoLoaded = 0;
                if (cargoHold) cargoHold.visible = false;
                unit.aiState = 'MovingToDock';
                if (unit.type === 'chinook') unit.airState = 'flying';
            }
            break;
        }
    };
    units.forEach(unit => updateHarvesterUnit(unit, false));
    enemyUnits.forEach(unit => updateHarvesterUnit(unit, true));

    // Ported from DozerAIUpdate.cpp: DOZER_TASK_BUILD & DOZER_TASK_REPAIR state transitions
    const updateBuilderTaskUnit = (unit) => {
        if (!unit || unit.health <= 0 || !unit.mesh) return;
        if (unit.type !== 'dozer' && unit.type !== 'worker') return;
        const s = unit.targetStructure;
        if (unit.taskState === 'MovingToBuild' && s) {
            if (s.health > 0 && s.isBuilding) {
                const distToS = Math.hypot(unit.mesh.position.x - s.position.x, unit.mesh.position.z - s.position.z);
                const buildThreshold = s.radius + (unit.radius || 1.9) + 4.0;
                if (distToS <= buildThreshold) {
                    unit.taskState = 'Building';
                    unit.waypoints = [];
                    unit.targetPosition.copy(unit.mesh.position);
                    unit._buildStuckTicks = 0;
                } else {
                    const prevPos = unit._lastBuildMovePos;
                    const moved = prevPos ? Math.hypot(unit.mesh.position.x - prevPos.x, unit.mesh.position.z - prevPos.z) : 1;
                    if (!unit._lastBuildMovePos) unit._lastBuildMovePos = unit.mesh.position.clone();
                    else unit._lastBuildMovePos.copy(unit.mesh.position);
                    unit._buildStuckTicks = (moved < 0.02) ? ((unit._buildStuckTicks || 0) + 1) : 0;
                    if (unit._buildStuckTicks > 60) {
                        unit._buildStuckTicks = 0;
                        if (distToS <= buildThreshold + 5.0) {
                            unit.taskState = 'Building';
                            unit.waypoints = [];
                            unit.targetPosition.copy(unit.mesh.position);
                        } else if (typeof assignDozerToStructure === 'function') {
                            assignDozerToStructure(unit, s);
                        }
                    }
                }
            } else if (!s.isBuilding || s.health <= 0) {
                unit.taskState = 'Idle';
                unit.targetStructure = null;
                unit._buildStuckTicks = 0;
            }
        } else if ((unit.taskState === 'MovingToRepair' || unit.taskState === 'Repairing') && s) {
            // Sole-benefactor check (DozerAIUpdate.cpp:723 attemptHealingFromSoleBenefactor)
            if (s.health <= 0 || s.isBuilding || s.health >= s.maxHealth || (s.soleRepairer && s.soleRepairer !== unit)) {
                if (s.soleRepairer === unit) s.soleRepairer = null;
                unit.taskState = 'Idle';
                unit.targetStructure = null;
                return;
            }
            s.soleRepairer = unit;
            const distToS = Math.hypot(unit.mesh.position.x - s.position.x, unit.mesh.position.z - s.position.z);
            const repairThreshold = s.radius + (unit.radius || 1.8) + 2.6;
            if ((!unit.waypoints || unit.waypoints.length === 0) && distToS <= repairThreshold) {
                unit.taskState = 'Repairing';
                unit.targetPosition.copy(unit.mesh.position);
                const repairRate = (typeof ZERO_HOUR_AI_DATA !== 'undefined' && ZERO_HOUR_AI_DATA.repairHealthPercentPerSecond) ? ZERO_HOUR_AI_DATA.repairHealthPercentPerSecond : 0.02;
                const healPerFrame = Math.max(0.4, (s.maxHealth * repairRate) / 60) * combatDeltaScale;
                s.health = Math.min(s.maxHealth, s.health + healPerFrame);
                if (Math.random() < 0.25 && typeof spawnWeldingSpark === 'function') {
                    spawnWeldingSpark(unit.mesh.position, s.position);
                }
                if (s.health >= s.maxHealth) {
                    s.soleRepairer = null;
                    unit.taskState = 'Idle';
                    unit.targetStructure = null;
                }
            }
        }
    };
    units.forEach(updateBuilderTaskUnit);
    enemyUnits.forEach(updateBuilderTaskUnit);

    // GLA Worker Tool Visibility & Animation (Box when carrying, Hammer when building/repairing, Metal Detector when sweeping mines)
    const updateWorkerTools = (unit) => {
        if (!unit || unit.health <= 0 || !unit.mesh || unit.type !== 'worker') return;
        const boxMesh = getCachedNode(unit.mesh, 'cargoHold');
        const hammerMesh = getCachedNode(unit.mesh, 'workerHammer');
        const mineDetMesh = getCachedNode(unit.mesh, 'mineDetector');

        const isCarrying = !!(unit.cargoLoaded > 0 || unit.aiState === 'MovingToCenter' || unit.aiState === 'Depositing');
        const isMoving = !!(unit.waypoints && unit.waypoints.length > 0) ||
            (unit.targetPosition && Math.hypot(unit.mesh.position.x - unit.targetPosition.x, unit.mesh.position.z - unit.targetPosition.z) > 1.2);
        const isBuildingOrRepairing = !isMoving && (unit.taskState === 'Building' || unit.taskState === 'Repairing');

        let isDetectingMines = !!unit.isClearingMines;
        if (!isDetectingMines && !isCarrying && !isBuildingOrRepairing && typeof landmines !== 'undefined' && landmines.length > 0) {
            const uX = unit.mesh.position.x, uZ = unit.mesh.position.z;
            for (let mi = 0; mi < landmines.length; mi++) {
                const mine = landmines[mi];
                if (mine && !isFriendly(unit, mine) && mine.position) {
                    const dx = mine.position.x - uX, dz = mine.position.z - uZ;
                    if (dx * dx + dz * dz <= 13.5 * 13.5) { isDetectingMines = true; break; }
                }
            }
        }

        if (boxMesh) boxMesh.visible = isCarrying;
        if (hammerMesh) {
            hammerMesh.visible = !isCarrying && isBuildingOrRepairing;
            if (hammerMesh.visible) {
                hammerMesh.rotation.x = Math.sin(buildingTick * 0.35) * 0.85;
            }
        }
        if (mineDetMesh) {
            mineDetMesh.visible = !isCarrying && !isBuildingOrRepairing && isDetectingMines;
            if (mineDetMesh.visible) {
                mineDetMesh.rotation.y = Math.sin(buildingTick * 0.2) * 0.35;
            }
        }
    };
    const updateDozerBladeAnim = (unit) => {
        if (!unit || unit.health <= 0 || !unit.mesh || unit.type !== 'dozer') return;
        const arms = getCachedNode(unit.mesh, 'ARMS');
        const bucket = getCachedNode(unit.mesh, 'BUCKET');
        if (!arms && !bucket) return;
        const isWorking = (unit.taskState === 'Building' || unit.taskState === 'Repairing');
        if (isWorking) {
            const phase = buildingTick * 0.14;
            if (arms) arms.rotation.x = Math.sin(phase) * 0.22 - 0.10;
            if (bucket) bucket.rotation.x = Math.sin(phase + 0.85) * 0.32;
        } else {
            if (arms && Math.abs(arms.rotation.x) > 0.002) arms.rotation.x *= 0.85;
            if (bucket && Math.abs(bucket.rotation.x) > 0.002) bucket.rotation.x *= 0.85;
        }
    };
    units.forEach(updateWorkerTools);
    enemyUnits.forEach(updateWorkerTools);
    units.forEach(updateDozerBladeAnim);
    enemyUnits.forEach(updateDozerBladeAnim);

    // Sync GLA Scorpion Tank turret rocket rack & Quad Cannon salvage turret tiers
    const syncGLASalvageMeshes = (unit, isAIUnit) => {
        if (!unit || unit.health <= 0 || !unit.mesh) return;
        if (unit.type === 'scorpion') {
            const rack = getCachedNode(unit.mesh, 'MISSLERACK01');
            if (rack) {
                const hasRocket = (unit.salvageLevel >= 1) || (!isAIUnit && typeof researchedTechs !== 'undefined' && researchedTechs.has('scorpionRocket'));
                rack.visible = !!hasRocket;
            }
        } else if (unit.type === 'quad') {
            const lvl = unit.salvageLevel || 0;
            const t0 = getCachedNode(unit.mesh, 'turretSystem');
            const t1 = getCachedNode(unit.mesh, 'TURRETUP01');
            const t2 = getCachedNode(unit.mesh, 'TURRETUP02');
            if (t0) t0.visible = (lvl === 0);
            if (t1) {
                t1.visible = (lvl === 1);
                if (t0 && t1.visible) t1.rotation.y = t0.rotation.y;
            }
            if (t2) {
                t2.visible = (lvl >= 2);
                if (t0 && t2.visible) t2.rotation.y = t0.rotation.y;
            }
            const airPitch = (unit.combatTarget && unit.combatTarget.health > 0 && unit.combatTarget.isAir) ? -0.62 : 0;
            ['TURRETEL', 'TURRETEL01', 'TURRETEL02'].forEach(elName => {
                const el = getCachedNode(unit.mesh, elName);
                if (el) el.rotation.x += (airPitch - el.rotation.x) * 0.14;
            });
            const qDish = getCachedNode(unit.mesh, 'radarDish') || getCachedNode(unit.mesh, 'RADARDISH01');
            if (qDish) qDish.rotation.y += 0.04;
        } else if (unit.type === 'marauder') {
            const lvl = unit.salvageLevel || 0;
            const t0 = getCachedNode(unit.mesh, 'turretSystem');
            const t1 = getCachedNode(unit.mesh, 'TURRETUP01');
            const t2 = getCachedNode(unit.mesh, 'TURRETUP02');
            if (t0) t0.visible = (lvl === 0);
            if (t1) {
                t1.visible = (lvl === 1);
                if (t0 && t1.visible) t1.rotation.y = t0.rotation.y;
            }
            if (t2) {
                t2.visible = (lvl >= 2);
                if (t0 && t2.visible) t2.rotation.y = t0.rotation.y;
            }
        } else if (unit.type === 'battlebus') {
            const lvl = unit.salvageLevel || 0;
            const bup1 = getCachedNode(unit.mesh, 'BUSUP01') || getCachedNode(unit.mesh, 'uvbattbus.busup01');
            const bup2 = getCachedNode(unit.mesh, 'BUSUP02') || getCachedNode(unit.mesh, 'uvbattbus.busup02');
            if (bup1) bup1.visible = (lvl >= 1);
            if (bup2) bup2.visible = (lvl >= 2);
        } else if (unit.type === 'humvee') {
            const hasTow = (!isAIUnit && typeof researchedTechs !== 'undefined' && researchedTechs.has('towMissile'))
                || (isAIUnit && unit.aiDifficulty && unit.aiDifficulty !== 'easy');
            const t0 = getCachedNode(unit.mesh, 'turretSystem');
            const t1 = getCachedNode(unit.mesh, 'TURRETUP01');
            if (t0) t0.visible = !hasTow;
            if (t1) {
                t1.visible = !!hasTow;
                if (t0 && t1.visible) t1.rotation.y = t0.rotation.y;
            }
            const towEl = getCachedNode(unit.mesh, 'TURRETUPEL01');
            if (towEl && hasTow) {
                const targetPitch = (unit.combatTarget && unit.combatTarget.health > 0) ? (unit.combatTarget.isAir ? -0.45 : -0.08) : 0;
                towEl.rotation.x += (targetPitch - towEl.rotation.x) * 0.14;
            }
        } else if (unit.type === 'scud') {
            const turretEl = getCachedNode(unit.mesh, 'TURRETEL');
            if (turretEl) {
                const targetElev = (unit.combatTarget && unit.combatTarget.health > 0) ? -1.05 : 0;
                turretEl.rotation.x += (targetElev - turretEl.rotation.x) * 0.08;
            }
            const missile = getCachedNode(unit.mesh, 'MISSILE');
            if (missile) {
                missile.visible = !(unit.attackCooldown && unit.attackCooldown > 280);
            }
        } else if (unit.type === 'tomahawk') {
            const turretEl = getCachedNode(unit.mesh, 'TURRETEL');
            if (turretEl) {
                const targetElev = (unit.combatTarget && unit.combatTarget.health > 0) ? -0.55 : 0;
                turretEl.rotation.x += (targetElev - turretEl.rotation.x) * 0.08;
            }
            const missile = getCachedNode(unit.mesh, 'MISSILE');
            if (missile) {
                missile.visible = !(unit.attackCooldown && unit.attackCooldown > 100);
            }
            const tRadar = getCachedNode(unit.mesh, 'RADAR');
            if (tRadar) tRadar.rotation.y += 0.04;
        } else if (unit.type === 'radarvan' || unit.type === 'overlord') {
            const rNode = getCachedNode(unit.mesh, 'RADAR') || getCachedNode(unit.mesh, 'RADARDISH01');
            if (rNode) rNode.rotation.y += 0.05;
        } else if (unit.type === 'dozer') {
            const arms = getCachedNode(unit.mesh, 'ARMS') || getCachedNode(unit.mesh, 'BUCKET');
            if (arms) {
                const targetArmRot = (unit.taskState === 'Building' || unit.taskState === 'Repairing')
                    ? Math.sin(buildingTick * 0.2) * 0.22
                    : 0;
                arms.rotation.x += (targetArmRot - arms.rotation.x) * 0.12;
            }
        }
        // Smooth Gatling barrel spin momentum for Gatling Tank & Overlord Gatling Upgrade
        if (unit._gatlingSpinVel && unit._gatlingSpinVel > 0.01) {
            const gBarrels = getCachedNode(unit.mesh, 'gatlingBarrels');
            if (gBarrels) gBarrels.rotation.z += unit._gatlingSpinVel;
            if (unit.overlordUpgradeMesh) {
                const og1 = getCachedNode(unit.overlordUpgradeMesh, 'gatlingBarrels');
                const og2 = getCachedNode(unit.overlordUpgradeMesh, 'gatlingBarrels2');
                if (og1) og1.rotation.z += unit._gatlingSpinVel;
                if (og2) og2.rotation.z += unit._gatlingSpinVel;
            }
            unit._gatlingSpinVel *= 0.94;
        }
    };
    units.forEach(u => syncGLASalvageMeshes(u, false));
    enemyUnits.forEach(u => syncGLASalvageMeshes(u, true));

    // Authentic C&C Generals Damaged / Critical Visuals (charred armor/walls + rising smoke & fire)
    const updateEntityDamageVisuals = (list, isStruct) => {
        if (!list || list.length === 0) return;
        for (let idx = 0; idx < list.length; idx++) {
            const ent = list[idx];
            if (!ent || ent.health <= 0 || !ent.mesh || !ent.maxHealth || ent.isBuilding) continue;
            if (ent.garrisonedIn) continue;
            const hpRatio = ent.health / ent.maxHealth;
            const tier = hpRatio < 0.35 ? 2 : (hpRatio < 0.65 ? 1 : 0);
            if (tier !== (ent._damageTier || 0)) {
                ent._damageTier = tier;
                ent.mesh.traverse(c => {
                        if (!c.isMesh || !c.material || Array.isArray(c.material) || !c.material.color) return;
                        if (!c._damageClonedMat && tier > 0) {
                            c._origColorHex = c.material.color.getHex();
                            c.material = c.material.clone();
                            c._damageClonedMat = true;
                        }
                        if (c._damageClonedMat && c._origColorHex !== undefined) {
                            c.material.color.setHex(c._origColorHex);
                            if (tier === 1) c.material.color.multiplyScalar(0.65);
                            else if (tier === 2) c.material.color.multiplyScalar(0.40);
                        }
                });
            }
            if (tier > 0 && ((buildingTick + idx) % (tier === 2 ? 10 : 18) === 0)) {
                const basePos = ent.position || ent.mesh.position;
                const spread = isStruct ? (ent.radius || 4) * 0.45 : (ent.radius || 1.2) * 0.4;
                const smokePos = basePos.clone().add(new THREE.Vector3(
                        (Math.random() - 0.5) * spread,
                        isStruct ? (2.2 + Math.random() * 1.5) : (ent.isAir ? 0.3 : 1.0),
                        (Math.random() - 0.5) * spread
                ));
                if (typeof spawnSmokePuff === 'function') {
                    spawnSmokePuff(smokePos, tier === 2 ? 0x1e2229 : 0x4b525c, isStruct ? (tier === 2 ? 0.85 : 0.55) : (tier === 2 ? 0.5 : 0.32));
                }
                if (tier === 2 && Math.random() < 0.55) {
                    if (typeof spawnMuzzleFlash === 'function') spawnMuzzleFlash(smokePos, 0xff5500, isStruct ? 0.65 : 0.32);
                    if (isStruct && typeof spawnSparks === 'function') spawnSparks(smokePos, 0xff9f43, 4);
                }
            }
        }
    };
    updateEntityDamageVisuals(units, false);
    updateEntityDamageVisuals(enemyUnits, false);
    updateEntityDamageVisuals(structures, true);
    updateEntityDamageVisuals(enemyStructures, true);

    // PERF: single ground-unit separation pass using a spatial hash grid
    // (was two full O(N^2) passes per frame that fought each other)
    separateGroundUnits(units);

    units.forEach((unit, idx) => {
            // Embarking into transport vehicles or garrisonable structures (e.g. Internet Center)
            if (unit.taskState === 'MovingToEmbark' && unit.embarkTarget) {
                const transport = unit.embarkTarget;
                const tPos = transport.position || (transport.mesh && transport.mesh.position);
                if (transport.health > 0 && tPos) {
                    unit.targetPosition.copy(tPos);
                    const isTunnel = transport.type === 'tunnel';
                    const cap = transport.capacity || (isTunnel ? 10 : (transport.type === 'internetCenter' ? 8 : ((transport.type === 'bunker' || transport.type === 'palace') ? 5 : 0)));
                    const distToT = Math.hypot(unit.mesh.position.x - tPos.x, unit.mesh.position.z - tPos.z);
                    if (distToT < ((transport.radius || 1.4) + 2.8)) {
                        if (isTunnel && typeof window !== 'undefined') {
                            if (!Array.isArray(window.glaTunnelNetworkPool)) window.glaTunnelNetworkPool = [];
                            transport.garrisoned = window.glaTunnelNetworkPool;
                        }
                        if (!transport.garrisoned) transport.garrisoned = [];
                        const enemyOccupied = transport.isWorldBuilding && transport.garrisoned.length > 0 && typeof isFriendly === 'function' && !isFriendly(unit, transport);
                        if (!enemyOccupied && transport.garrisoned.length < cap) {
                            transport.garrisoned.push(unit);
                            unit.garrisonedIn = transport;
                            unit.mesh.visible = false;
                            unit.taskState = 'Idle';
                            unit.embarkTarget = null;
                            if (transport.isWorldBuilding && typeof updateWorldBuildingGarrisonVisual === 'function') {
                                updateWorldBuildingGarrisonVisual(transport);
                                if (typeof playAudio === 'function') playAudio('garrison_enter', { volume: 0.78 });
                            }
                            showNotification(`${unit.type} entered ${transport.type} (${transport.garrisoned.length}/${cap}).`, 'success');
                            updateSidebar();
                        } else if (enemyOccupied || transport.garrisoned.length >= cap) {
                            unit.taskState = 'Idle';
                            unit.embarkTarget = null;
                        }
                    }
                } else {
                    unit.taskState = 'Idle';
                    unit.embarkTarget = null;
                }
            }

            if (unit.garrisonedIn || unit.taskState === 'Building' || unit.taskState === 'Repairing') return;

            // Unified Aircraft & Helicopter Flight, Combat, Rearming & Orbit Engine (14d_aircraft.js)
            if (unit.isAir) {
                if (typeof updateAircraftFlight === 'function') updateAircraftFlight(unit, idx, false);
                return;
            }

            // --- MOVE-AND-SHOOT: Authentic C&C Generals Fire-On-The-Move ---
            // Only halt movement if the player explicitly ordered an attack on a specific target ('MovingToAttack')
            // If on a move/patrol order, the unit drives continuously toward targetPosition while firing on the move!
            if (unit.taskState === 'MovingToAttack' && unit.combatTarget) {
                const targetMesh = unit.combatTarget.mesh;
                if (targetMesh && unit.combatTarget.health > 0) {
                    const dxT = targetMesh.position.x - unit.mesh.position.x;
                    const dzT = targetMesh.position.z - unit.mesh.position.z;
                    const distToTarget = Math.hypot(dxT, dzT);
                    const targetRadius = unit.combatTarget.radius || 0;
                    if (distToTarget <= (unit.scanRange + targetRadius - 1.5)) {
                        // In effective weapon range: halt chassis and open fire
                        unit.waypoints = [];
                        unit.targetPosition.x = unit.mesh.position.x;
                        unit.targetPosition.z = unit.mesh.position.z;
                        return;
                    } else if (!unit.waypoints || unit.waypoints.length === 0) {
                        // Target moved out of range: pursue target (routing across bridges if a river separates us)
                        const bridges = (!unit.isAir && typeof findBridgeCrossingsForPath === 'function')
                            ? findBridgeCrossingsForPath(unit.mesh.position, targetMesh.position)
                            : null;
                        if (bridges && bridges.length > 0) {
                            unit.waypoints = [...bridges.filter(Boolean), targetMesh.position.clone()];
                            unit.targetPosition.copy(unit.waypoints.shift());
                        } else {
                            unit.targetPosition.x = targetMesh.position.x;
                            unit.targetPosition.z = targetMesh.position.z;
                        }
                    }
                } else {
                    // Target destroyed or lost: resume idle or return to guard post
                    unit.combatTarget = null;
                    if (unit.guardPoint) {
                        unit.taskState = 'Guarding';
                        unit.targetPosition.copy(unit.guardPoint);
                    } else {
                        unit.taskState = 'Idle';
                    }
                }
            }

            // --- GUARD POST RETURN & LEASH FOR GROUND UNITS ---
            if (!unit.isAir && unit.guardPoint && unit.taskState !== 'MovingToAttack' && unit.taskState !== 'Building' && unit.taskState !== 'Capturing') {
                if (unit.combatTarget && unit.combatTarget.health > 0 && unit.combatTarget.mesh) {
                    const gPos = unit.combatTarget.position || unit.combatTarget.mesh.position;
                    const gDist = Math.hypot(gPos.x - unit.guardPoint.x, gPos.z - unit.guardPoint.z);
                    const gLeash = unit.guardRadius || Math.max(36, (unit.scanRange || 24) * 1.45);
                    if (gDist > gLeash) {
                        unit.combatTarget = null;
                        unit.targetPosition.copy(unit.guardPoint);
                        unit.taskState = 'Guarding';
                    } else {
                        const curDist = Math.hypot(gPos.x - unit.mesh.position.x, gPos.z - unit.mesh.position.z);
                        const tRad = unit.combatTarget.radius || 0;
                        if (curDist <= (unit.scanRange + tRad - 1.5)) {
                            unit.waypoints = [];
                            unit.targetPosition.x = unit.mesh.position.x;
                            unit.targetPosition.z = unit.mesh.position.z;
                        } else {
                            unit.targetPosition.x = gPos.x;
                            unit.targetPosition.z = gPos.z;
                        }
                    }
                } else {
                    unit.combatTarget = null;
                    const distHome = Math.hypot(unit.guardPoint.x - unit.mesh.position.x, unit.guardPoint.z - unit.mesh.position.z);
                    if (distHome > 3.5) {
                        unit.targetPosition.copy(unit.guardPoint);
                        unit.taskState = 'Guarding';
                    }
                }
            }

            // --- VETERAN PILOT BOARDING VEHICLE/AIRCRAFT ---
            if (unit.type === 'pilot' && unit.pilotTarget) {
                const pv = unit.pilotTarget;
                if (!pv || pv.health <= 0 || !pv.mesh) {
                    unit.pilotTarget = null;
                    unit.taskState = 'Idle';
                } else {
                    unit.targetPosition.set(pv.mesh.position.x, getTerrainHeight(pv.mesh.position.x, pv.mesh.position.z), pv.mesh.position.z);
                    const dPilot = Math.hypot(pv.mesh.position.x - unit.mesh.position.x, pv.mesh.position.z - unit.mesh.position.z);
                    if (dPilot <= (pv.radius || 3.0) + 3.5) {
                        const pVet = unit.veterancy || 1;
                        const wasUnmanned = !!pv.isUnmanned;
                        if (!wasUnmanned && (pv.veterancy || 0) >= pVet) {
                            if (typeof showNotification === 'function') {
                                showNotification(`${pv.type.toUpperCase()} already has equal or higher veterancy!`, 'warning');
                            }
                            unit.pilotTarget = null;
                            unit.taskState = 'Idle';
                            unit.targetPosition.copy(unit.mesh.position);
                            return;
                        }
                        if (wasUnmanned) {
                            pv.isUnmanned = false;
                            pv.disabledUntil = 0;
                        }
                        if ((pv.veterancy || 0) < pVet) {
                            const prevMult = pv.veterancy === 3 ? 1.6 : (pv.veterancy === 2 ? 1.4 : (pv.veterancy === 1 ? 1.2 : 1.0));
                            const nextMult = pVet === 3 ? 1.6 : (pVet === 2 ? 1.4 : 1.2);
                            const oldMax = pv.maxHealth;
                            pv.maxHealth = Math.floor(pv.maxHealth * (nextMult / prevMult));
                            pv.health = Math.min(pv.maxHealth, pv.health + Math.max(0, pv.maxHealth - oldMax));
                            pv.veterancy = pVet;
                            pv.kills = Math.max(pv.kills || 0, unit.kills || 0);
                            if (typeof spawnPromotionFX === 'function') spawnPromotionFX(pv.mesh.position, pVet);
                        }
                        if (typeof showNotification === 'function') {
                            showNotification(`★ Pilot boarded ${pv.type.toUpperCase()} — Veterancy Rank ${pVet} transferred!`, 'success');
                        }
                        unit.health = 0;
                        unit._silentRemove = true;
                        unit.pilotTarget = null;
                        return;
                    }
                }
            }

            // --- CAPTURING NEUTRAL STRUCTURE CHANNELS ---
            if (unit.taskState === 'Capturing' && unit.captureTarget && unit.captureTarget.health > 0) {
                const targetTech = unit.captureTarget;
                const dTech = Math.hypot(targetTech.position.x - unit.mesh.position.x, targetTech.position.z - unit.mesh.position.z);
                if (dTech <= (targetTech.radius + 3.0)) {
                    // Halt movement while capturing
                    unit.targetPosition.x = unit.mesh.position.x;
                    unit.targetPosition.z = unit.mesh.position.z;
                    targetTech.captureProgress = (targetTech.captureProgress || 0) + 1;
                    if (targetTech.captureProgress >= 120) { // ~2 seconds channeling
                        targetTech.captureProgress = 0;
                        targetTech.capturedByTeam = unit.teamId;
                        targetTech.teamId = unit.teamId;
                        targetTech.ownerId = (unit.teamId === playerTeamId) ? 'player' : (unit.ownerId || ('ai_' + unit.teamId));

                        // Turn flag cloth to player blue or enemy red
                        const flagCloth = targetTech.mesh ? getCachedNode(targetTech.mesh, "neutralFlagCloth") : null;
                        if (flagCloth && flagCloth.material) {
                            flagCloth.material.color.setHex((unit.teamId === playerTeamId) ? 0x3498db : 0xe74c3c);
                        }

                        if (unit.teamId === playerTeamId) {
                            if (targetTech.type === 'techOilDerrick') {
                                playerResources += 1000;
                                const resEl = document.getElementById('resource-display');
                                if (resEl) resEl.innerText = `$${playerResources}`;
                                showNotification('Tech Oil Derrick SECURED! +$1,000 cash grant + steady flow online.', 'success');
                            } else if (targetTech.type === 'techHospital') {
                                showNotification('Tech Hospital SECURED! Field medics online: friendly infantry passively heal.', 'success');
                            } else if (targetTech.type === 'techRefinery') {
                                showNotification('Tech Oil Refinery SECURED! Combat vehicle & aircraft costs discounted 10%.', 'success');
                            }
                            playUSASound('radio_chirp');
                        } else {
                            showNotification(`Warning: Enemy forces captured ${targetTech.name}!`, 'error');
                        }

                        unit.taskState = 'Idle';
                        unit.captureTarget = null;
                        if (typeof updateSidebar === 'function') updateSidebar();
                    }
                    return;
                }
            }

            // Smoothly return turret forward if no active combat target
            const idleTurret = getCachedNode(unit.mesh, "turretSystem");
            if (idleTurret && !unit.combatTarget) {
                idleTurret.rotation.y += (0 - idleTurret.rotation.y) * 0.1;
            }

            // Generous pass-through radius for intermediate waypoints (prevents 20+ unit formations jamming on 1 point),
            // tight 0.5u stop only on the final destination!
            const hasMoreWaypoints = !!(unit.waypoints && unit.waypoints.length > 0);
            const stopBuffer = unit.isAir ? 1.0 : (hasMoreWaypoints ? Math.max(4.5, (unit.radius || 1.2) * 2.2) : 0.5);

            // Use horizontal distance on XZ plane so altitude Y does not cause infinite distance overshoot/jitter
            const dx = unit.targetPosition.x - unit.mesh.position.x;
            const dz = unit.targetPosition.z - unit.mesh.position.z;
            const dist2D = Math.hypot(dx, dz);

            if (dist2D > stopBuffer) {
                // Nuke Cannon Outrigger Siege Logic: if given a move order, automatically pack up outriggers before driving!
                if ((unit.type === 'nukecannon' || unit.type === 'nuketank') && unit.isDeployed) {
                    if (unit.taskState === 'Moving' && typeof undeployNukeCannonOutriggers === 'function') {
                        undeployNukeCannonOutriggers(unit);
                    } else {
                        // Halt chassis while deployed in siege mode firing at a target
                        unit.targetPosition.copy(unit.mesh.position);
                        return;
                    }
                }
                const dirX = dx / dist2D;
                const dirZ = dz / dist2D;
                const step = Math.min(dist2D, unit.speed * combatDeltaScale);
                unit.mesh.position.x += dirX * step;
                unit.mesh.position.z += dirZ * step;
                if (!unit.isAir && !INFANTRY_TYPE_SET.has(unit.type)) spinVehicleWheels(unit, step);

                // Authentic Tank Crushing (SquishCollide.cpp: heavy tanks crush enemy infantry)
                if (CRUSHER_TANK_SET.has(unit.type)) {
                    const hostiles = (typeof enemyUnits !== 'undefined') ? enemyUnits : [];
                    for (let enemy of hostiles) {
                        if (enemy.health > 0 && enemy.mesh && !isFriendly(unit, enemy) && (typeof getArmorCategory === 'function' ? getArmorCategory(enemy) === 'infantry' : INFANTRY_TYPE_SET.has(enemy.type))) {
                            const infDist = Math.hypot(unit.mesh.position.x - enemy.mesh.position.x, unit.mesh.position.z - enemy.mesh.position.z);
                            if (infDist <= ((unit.radius || 1.8) + (enemy.radius || 0.6)) * 0.95) {
                                const toX = enemy.mesh.position.x - unit.mesh.position.x;
                                const toZ = enemy.mesh.position.z - unit.mesh.position.z;
                                if (toX * dirX + toZ * dirZ > 0) { // moving towards infantry
                                    enemy.health = 0;
                                    enemy._killCredited = true;
                                    if (typeof spawnSquishDecal === 'function') spawnSquishDecal(enemy.mesh.position);
                                    playAudio('infantry_squish');
                                    if (typeof showNotification === 'function') {
                                        showNotification(`Enemy infantry crushed under treads of ${unit.type.toUpperCase()}!`, 'info');
                                    }
                                    unit.kills = (unit.kills || 0) + 1;
                                    if (typeof checkVeterancyPromotion === 'function') checkVeterancyPromotion(unit);
                                    if (unit.selected && typeof updateSidebar === 'function') updateSidebar();
                                }
                            }
                        }
                    }
                }

                // Anti-Stuck & Anti-Orbit Watchdog: catches units blocked OR sliding in circles around a building
                if (!unit._lastPos) unit._lastPos = unit.mesh.position.clone();
                if (!unit._stuckTimer) unit._stuckTimer = 0;
                if (unit._bestTargetDist === undefined || unit._bestTargetX !== unit.targetPosition.x || unit._bestTargetZ !== unit.targetPosition.z) {
                    unit._bestTargetX = unit.targetPosition.x;
                    unit._bestTargetZ = unit.targetPosition.z;
                    unit._bestTargetDist = dist2D;
                    unit._noProgressTicks = 0;
                }
                if (dist2D < unit._bestTargetDist - 0.15) {
                    unit._bestTargetDist = dist2D;
                    unit._noProgressTicks = 0;
                } else if (!unit.isAir) {
                    unit._noProgressTicks = (unit._noProgressTicks || 0) + 1;
                }

                const dMoved = unit.mesh.position.distanceTo(unit._lastPos);
                const minExpectedStep = Math.max(0.008, (unit.speed || 0.1) * combatDeltaScale * 0.35);
                if (dMoved < minExpectedStep || unit._noProgressTicks > 90) {
                    unit._stuckTimer++;
                    if (unit._stuckTimer > 28 || unit._noProgressTicks > 90) {
                        // If destination itself is inside a building, clamp it outside so the unit doesn't orbit forever
                        const targetBlocker = (!unit.isAir && unit.taskState === 'Moving')
                        ? isPointBlockedByStructureOrObstacle(unit.targetPosition.x, unit.targetPosition.z, unit.radius || 1.2)
                        : null;
                        if (targetBlocker && targetBlocker !== unit.targetStructure) {
                            const safeTarget = clampPointOutsideStructures(unit.targetPosition, unit.radius || 1.2);
                            unit.targetPosition.copy(safeTarget);
                            unit._bestTargetDist = Math.hypot(safeTarget.x - unit.mesh.position.x, safeTarget.z - unit.mesh.position.z);
                            unit._noProgressTicks = 0;
                            unit._stuckTimer = 0;
                        } else {
                            // Find which structure is actually blocking the forward path (ignore buildings we are already walking away from)
                            const blocking = structures.find(s => {
                                    if (s === unit.targetStructure || s.health <= 0) return false;
                                    const sdx = unit.mesh.position.x - s.position.x;
                                    const sdz = unit.mesh.position.z - s.position.z;
                                    if (Math.hypot(sdx, sdz) >= (s.radius + unit.radius + 1.8)) return false;
                                    return (sdx * dx + sdz * dz) < 0; // Only if moving TOWARD the building
                            });
                            if (blocking) {
                                const angleToS = Math.atan2(blocking.position.z - unit.mesh.position.z, blocking.position.x - unit.mesh.position.x);
                                const bypassRadius = blocking.radius + unit.radius + 3.2;
                                const p1X = blocking.position.x + Math.cos(angleToS + Math.PI / 2) * bypassRadius;
                                const p1Z = blocking.position.z + Math.sin(angleToS + Math.PI / 2) * bypassRadius;
                                const p2X = blocking.position.x + Math.cos(angleToS - Math.PI / 2) * bypassRadius;
                                const p2Z = blocking.position.z + Math.sin(angleToS - Math.PI / 2) * bypassRadius;

                                const d1 = Math.hypot(unit.targetPosition.x - p1X, unit.targetPosition.z - p1Z);
                                const d2 = Math.hypot(unit.targetPosition.x - p2X, unit.targetPosition.z - p2Z);
                                const detourX = d1 <= d2 ? p1X : p2X;
                                const detourZ = d1 <= d2 ? p1Z : p2Z;
                                const detourY = typeof getTerrainHeight === 'function' ? getTerrainHeight(detourX, detourZ) : 0;
                                const detourPos = new THREE.Vector3(detourX, detourY, detourZ);

                                if (!unit.waypoints) unit.waypoints = [];
                                unit.waypoints.unshift(unit.targetPosition.clone());
                                unit.targetPosition.copy(detourPos);
                                unit._bestTargetDist = Math.hypot(detourPos.x - unit.mesh.position.x, detourPos.z - unit.mesh.position.z);
                            } else if (unit._noProgressTicks > 90 && unit.taskState === 'Moving') {
                                unit.taskState = 'Idle';
                                unit.targetPosition.copy(unit.mesh.position);
                            } else {
                                const rndA = ((typeof simRandom === 'function') ? simRandom() : Math.random()) * Math.PI * 2;
                                unit.mesh.position.x += Math.cos(rndA) * 1.5;
                                unit.mesh.position.z += Math.sin(rndA) * 1.5;
                            }
                            unit._noProgressTicks = 0;
                            unit._stuckTimer = 0;
                        }
                    }
                } else {
                    unit._stuckTimer = 0;
                }
                unit._lastPos.copy(unit.mesh.position);

                // Smooth angular heading rotation
                const targetAngle = Math.atan2(-dirZ, dirX) + Math.PI / 2;
                let diff = targetAngle - unit.mesh.rotation.y;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                unit.mesh.rotation.y += diff * 0.18;

                // Aerodynamic banking tilt for aircraft into turns; helicopters fly horizontal with slight forward pitch
                if (unit.isAir) {
                    const isHeli = (unit.type === 'comanche' || unit.type === 'chinook');
                    if (!isHeli) {
                        const targetBank = THREE.MathUtils.clamp(-diff * 1.6, -0.3, 0.3);
                        unit.mesh.rotation.z += (targetBank - unit.mesh.rotation.z) * 0.12;
                        unit.mesh.rotation.x += (0 - unit.mesh.rotation.x) * 0.12;
                    } else {
                        // Helicopters stay strictly horizontal at all times
                        unit.mesh.rotation.z = 0;
                        unit.mesh.rotation.x = 0;
                    }
                } else if (INFANTRY_TYPE_SET.has(unit.type)) {
                    unit.mesh.rotation.x = 0;
                    unit.mesh.rotation.z = 0;
                    unit._strideBob = 0;
                    if (unit.mesh.visible !== false && unit.mesh.userData && unit.mesh.userData.animatedMeshes && isWorldPosInView(unit.mesh.position, 10)) {
                        unit._runCycle = ((unit._runCycle || 0) + 0.38) % 8;
                        const c = unit._runCycle;
                        const f0 = Math.floor(c);
                        const f1 = (f0 + 1) % 8;
                        const frac = c - f0;
                        unit.mesh.userData.animatedMeshes.forEach(m => {
                                if (m.userData && m.userData.runFrames && m.userData.runFrames[f0] && m.userData.runFrames[f1]) {
                                    const arr0 = m.userData.runFrames[f0];
                                    const arr1 = m.userData.runFrames[f1];
                                    const pos = m.geometry.attributes.position.array;
                                    for (let k = 0; k < pos.length; k++) {
                                        pos[k] = arr0[k] * (1 - frac) + arr1[k] * frac;
                                    }
                                    m.geometry.attributes.position.needsUpdate = true;
                                }
                        });
                    }
                }
            } else {
                // Reached waypoint: advance to next waypoint if routing across bridges!
                if (unit.waypoints && unit.waypoints.length > 0) {
                    const nextWp = unit.waypoints.shift();
                    if (nextWp && typeof nextWp.x === 'number') {
                        unit.targetPosition.copy(nextWp);
                    }
                } else {
                    // Reached final destination! Transition to Idle so it stops driving
                    if (unit.taskState === 'Moving') {
                        unit.taskState = 'Idle';
                    }
                    unit.targetPosition.copy(unit.mesh.position);
                    if (unit.isAir) {
                        // Unit is at destination! Settle aircraft banking and pitch to zero without spinning or flipping
                        unit.mesh.rotation.z += (0 - unit.mesh.rotation.z) * 0.12;
                        unit.mesh.rotation.x += (0 - unit.mesh.rotation.x) * 0.12;
                    } else if (INFANTRY_TYPE_SET.has(unit.type)) {
                        unit.mesh.rotation.x = 0;
                        unit.mesh.rotation.z = 0;
                        unit._strideBob = 0;
                        updateInfantryStationaryAnim(unit);
                    }
                }
            }

            // Match unit height to hills/terrain elevation & bridge elevation
            const groundY = getTerrainHeight(unit.mesh.position.x, unit.mesh.position.z);
            if (unit.isAir) {
                const flightAlt = unit.mesh.userData.flightAltitude || 8.5;
                const targetY = groundY + flightAlt;
                unit.mesh.position.y += (targetY - unit.mesh.position.y) * 0.08;
            } else {
                const onBridge = mapBridges.find(b => isPointOnBridge(unit.mesh.position.x, unit.mesh.position.z, b));
                unit.mesh.position.y = (onBridge ? onBridge.deckY : groundY) + (unit._strideBob || 0);
            }

            // (Ground-unit soft repulsion is handled once per frame by separateGroundUnits())

            // EMP / Cyber-Disabled Electric Arc Visuals
            if (((unit.disabledUntil && buildingTick < unit.disabledUntil) || (unit.empDisabledUntil && Date.now() < unit.empDisabledUntil)) &&
                (buildingTick + idx) % 28 === 0 && typeof spawnEMPDisableSparks === 'function') {
                spawnEMPDisableSparks(unit.mesh.position);
            }

            // Vehicle terrain tread/wheel dust & diesel exhaust trail when moving on ground
            if (!unit.isAir && !unit._nightLightsAttached && typeof window !== 'undefined' && (window._activeTimeOfDay === 'night' || window._activeTimeOfDay === 'dusk') && typeof attachNightLightsToUnit === 'function') {
                attachNightLightsToUnit(unit);
                unit._nightLightsAttached = true;
            }
            if (!unit.isAir && !INFANTRY_TYPE_SET.has(unit.type) && unit.taskState === 'Moving' && typeof spawnTreadDustPuff === 'function') {
                const isTracked = ['tank', 'crusader', 'paladin', 'battlemaster', 'overlord', 'gatling', 'gatlingTank', 'dragon', 'inferno', 'nukecannon', 'nuketank', 'scorpion', 'marauder', 'scud', 'dozer', 'crawler'].includes(unit.type);
                const rotY = unit.mesh.rotation.y || 0;
                if (typeof spawnVehicleTrackMark === 'function') spawnVehicleTrackMark(unit, rotY, isTracked);
                const fwdX = Math.sin(rotY), fwdZ = Math.cos(rotY);
                const rightX = Math.cos(rotY), rightZ = -Math.sin(rotY);
                const rLen = (unit.radius || 2.5) * 0.68;
                const dustScale = Math.max(0.55, Math.min(1.15, (unit.radius || 2.8) * 0.22));
                if (isTracked && (buildingTick + idx) % 4 === 0) {
                    const lat = (unit.radius || 2.5) * 0.45;
                    spawnTreadDustPuff({ x: unit.mesh.position.x - fwdX * rLen - rightX * lat, y: unit.mesh.position.y, z: unit.mesh.position.z - fwdZ * rLen - rightZ * lat }, -fwdX, -fwdZ, null, dustScale);
                    spawnTreadDustPuff({ x: unit.mesh.position.x - fwdX * rLen + rightX * lat, y: unit.mesh.position.y, z: unit.mesh.position.z - fwdZ * rLen + rightZ * lat }, -fwdX, -fwdZ, null, dustScale);
                    if ((buildingTick + idx) % 16 === 0 && typeof spawnSmokePuff === 'function') {
                        spawnSmokePuff(unit.mesh.position.clone().add(new THREE.Vector3(-fwdX * rLen, 1.35, -fwdZ * rLen)), 0x4b525c, 0.34);
                    }
                } else if (!isTracked && (buildingTick + idx) % 4 === 0) {
                    spawnTreadDustPuff({ x: unit.mesh.position.x - fwdX * rLen, y: unit.mesh.position.y, z: unit.mesh.position.z - fwdZ * rLen }, -fwdX, -fwdZ, null, dustScale * 0.9);
                }
            }

            // Prevent driving through buildings, trees, skyscrapers or map edges
            resolveObstacleCollisions(unit);
    });

    processCombatScanning();
    processBaseDefenseCombat();

    updateHealthBars();

    function spawnUnitDeathFX(u) {
        if (!u || !u.mesh || u._silentRemove) return;
        const pos = u.mesh.position;
        if (INFANTRY_TYPE_SET.has(u.type)) {
            if (typeof spawnSmokePuff === 'function') spawnSmokePuff(pos, 0x555555, 0.45);
            return;
        }
        if (typeof spawnEnhancedExplosion === 'function') spawnEnhancedExplosion(pos, 0xff9f43, u.isAir ? 1.85 : 1.4, true, 'expl_vehicle');
        else createImpactExplosion(pos);
        if (typeof playAudio === 'function') playAudio('debris_vehicle', { volume: 0.65 });
        if (typeof spawnExplosionDebris === 'function') spawnExplosionDebris(pos, u.isAir ? 9 : 6, u.isAir ? 1.3 : 1.0, false);
        if (typeof spawnLingeringSmokeColumn === 'function') spawnLingeringSmokeColumn(pos, 110, 0x1f242c);
        if (typeof spawnCraterDecal === 'function') spawnCraterDecal(pos, u.isAir ? 3.2 : 2.2, 320, 'explosive');
    }

    // PERF: only allocate/filter when at least one entity in the array actually died this frame
    if (enemyUnits.some(e => e.health <= 0)) {
        enemyUnits = enemyUnits.filter(enemy => {
                if (enemy.health > 0) return true;
                if (enemy.garrisoned && enemy.garrisoned.length > 0 && typeof evacuateGarrisonedUnits === 'function') {
                    evacuateGarrisonedUnits(enemy);
                }
                if (enemy.drone && enemy.drone.mesh) {
                    if (typeof disposeSceneNodeSafe === 'function') disposeSceneNodeSafe(enemy.drone.mesh);
                    else scene.remove(enemy.drone.mesh);
                    enemy.drone = null;
                }
                if (enemy.trajectoryLine) {
                    if (typeof disposeSceneNodeSafe === 'function') disposeSceneNodeSafe(enemy.trajectoryLine);
                    else scene.remove(enemy.trajectoryLine);
                    enemy.trajectoryLine = null;
                }
                spawnUnitDeathFX(enemy);
                // Authentic GLA Scrap Crate Drop Chance (SalvageCrateCollide.cpp)
                const scrapRoll = (typeof simRandom === 'function') ? simRandom() : Math.random();
                if (scrapRoll < 0.65 && (typeof getArmorCategory === 'function' ? (getArmorCategory(enemy) === 'heavy_vehicle' || getArmorCategory(enemy) === 'light_vehicle') : !INFANTRY_TYPE_SET.has(enemy.type))) {
                    if (typeof spawnScrapCrate === 'function') spawnScrapCrate(enemy.mesh.position);
                }
                if (!spawnInfantryDeathAnimation(enemy)) {
                    if (typeof disposeSceneNodeSafe === 'function') disposeSceneNodeSafe(enemy.mesh);
                    else scene.remove(enemy.mesh);
                }
                units.forEach((unit) => {
                        if (unit.combatTarget === enemy) unit.combatTarget = null;
                        if (unit.embarkTarget === enemy) unit.embarkTarget = null;
                });
                enemyUnits.forEach((eu) => {
                        if (eu.embarkTarget === enemy) eu.embarkTarget = null;
                });
                return false;
        });
    }

    function evacuateGarrisonedUnits(container) {
        if (!container || !container.garrisoned || container.garrisoned.length === 0) return;
        const occupants = container.garrisoned.slice();
        container.garrisoned = [];
        if (container.isWorldBuilding) {
            if (typeof playAudio === 'function') playAudio('garrison_exit', { volume: 0.75 });
            if (typeof updateWorldBuildingGarrisonVisual === 'function') updateWorldBuildingGarrisonVisual(container);
        }
        const center = container.position || (container.mesh && container.mesh.position);
        if (!center) return;
        const exitDist = (container.radius || 5.0) + 2.5;
        const runDist = exitDist + 5.5;
        occupants.forEach((unit, idx) => {
                unit.garrisonedIn = null;
                if (!unit.mesh) return;
                const angle = (idx / Math.max(1, occupants.length)) * Math.PI * 2 + 0.35;
                const ex = center.x + Math.cos(angle) * exitDist;
                const ez = center.z + Math.sin(angle) * exitDist;
                const ey = typeof getTerrainHeight === 'function' ? getTerrainHeight(ex, ez) : (center.y || 0);
                unit.mesh.position.set(ex, ey, ez);
                unit.mesh.visible = true;
                const rx = center.x + Math.cos(angle) * runDist;
                const rz = center.z + Math.sin(angle) * runDist;
                const ry = typeof getTerrainHeight === 'function' ? getTerrainHeight(rx, rz) : ey;
                if (unit.targetPosition) unit.targetPosition.set(rx, ry, rz);
                unit.taskState = 'Moving';
                unit.combatTarget = null;
        });
    }

    const pendingGLAHoles = [];
    const shouldLeaveGLAHole = (s, isEnemyList) => {
        if (!s || s.isBuilding || s._wasSold) return false;
        if (s.type === 'glaHole' || s.type === 'demoTrap' || String(s.type || '').startsWith('fake')) return false;
        const fac = s.faction || (!isEnemyList && typeof selectedFaction !== 'undefined' ? selectedFaction : null);
        return fac === 'gla';
    };

    if (structures.some(s => s.health <= 0)) {
        structures = structures.filter(structure => {
                if (structure.health > 0) return true;
                if (structure._progressBarEl && structure._progressBarEl.parentElement) {
                    structure._progressBarEl.parentElement.removeChild(structure._progressBarEl);
                    structure._progressBarEl = null;
                }
                if (structure.mesh) {
                    if (typeof disposeSceneNodeSafe === 'function') disposeSceneNodeSafe(structure.mesh);
                    else scene.remove(structure.mesh);
                }
                const sPos = structure.position || (structure.mesh && structure.mesh.position);
                if (typeof spawnBuildingDestructionFX === 'function' && sPos) spawnBuildingDestructionFX(sPos, structure.radius || 5.5, 0xff793f);
                else createImpactExplosion(sPos);
                if (structure.type === 'glaHole' && structure.holeWorker && structure.holeWorker.health > 0) {
                    structure.holeWorker.health = 0;
                }
                if (shouldLeaveGLAHole(structure, false) && sPos) {
                    pendingGLAHoles.push({ src: structure, pos: sPos.clone(), isEnemy: false });
                }
                if (typeof playEvaAlert === 'function') playEvaAlert('building_lost');
                showNotification(structure.type === 'glaHole' ? 'GLA Foundation Hole destroyed!' : `Friendly ${structure.type} destroyed!`, 'error');
                if (structure.dozerRef) {
                    structure.dozerRef.taskState = 'Idle';
                    structure.dozerRef.targetStructure = null;
                    structure.dozerRef = null;
                }
                evacuateGarrisonedUnits(structure);
                if (selectedStructure === structure) {
                    selectedStructure = null;
                    updateSidebar();
                }
                enemyUnits.forEach(enemy => {
                        if (enemy.combatTarget === structure) enemy.combatTarget = null;
                });
                return false;
        });
    }

    // Filter and remove neutralized enemy buildings with explosions & notifications
    if (enemyStructures.some(s => s.health <= 0)) {
        enemyStructures = enemyStructures.filter(structure => {
                if (structure.health > 0) return true;
                if (structure._progressBarEl && structure._progressBarEl.parentElement) {
                    structure._progressBarEl.parentElement.removeChild(structure._progressBarEl);
                    structure._progressBarEl = null;
                }
                if (structure.mesh) {
                    if (typeof disposeSceneNodeSafe === 'function') disposeSceneNodeSafe(structure.mesh);
                    else scene.remove(structure.mesh);
                }
                const expPos = structure.position || (structure.mesh && structure.mesh.position);
                if (typeof spawnBuildingDestructionFX === 'function' && expPos) spawnBuildingDestructionFX(expPos, structure.radius || 5.5, 0xff4757);
                else createImpactExplosion(expPos);
                if (structure.type === 'glaHole' && structure.holeWorker && structure.holeWorker.health > 0) {
                    structure.holeWorker.health = 0;
                }
                if (shouldLeaveGLAHole(structure, true) && expPos) {
                    pendingGLAHoles.push({ src: structure, pos: expPos.clone(), isEnemy: true });
                }
                showNotification(structure.type === 'glaHole' ? 'Hostile GLA Hole destroyed!' : `Hostile ${structure.type} eradicated!`, 'success');
                evacuateGarrisonedUnits(structure);
                units.forEach((unit, idx) => {
                        if (unit.combatTarget === structure) unit.combatTarget = null;
                });
                return false;
        });
    }

    // Official GLA Hole spawning: destroyed GLA structures leave a sunken bunker hole + free rebuild worker
    for (let hi = 0; hi < pendingGLAHoles.length; hi++) {
        const { src, pos, isEnemy } = pendingGLAHoles[hi];
        if (typeof createGLAHoleMesh !== 'function') continue;
        const holeMesh = createGLAHoleMesh(isEnemy);
        const gY = (typeof getTerrainHeight === 'function') ? getTerrainHeight(pos.x, pos.z) : (pos.y || 0);
        const holePos = new THREE.Vector3(pos.x, gY + 0.05, pos.z);
        holeMesh.position.copy(holePos);
        holeMesh.rotation.y = src.rotationY || 0;
        scene.add(holeMesh);

        const isSmallHole = (src.type === 'stingerSite' || src.type === 'tunnel');
        let holeMaxHp = isSmallHole ? 180 : 250;
        if (!isEnemy && typeof researchedTechs !== 'undefined' && researchedTechs.has('fortifiedStructures')) {
            holeMaxHp = Math.floor(holeMaxHp * 1.25);
        }
        const holeObj = {
            type: 'glaHole',
            originalType: src.type,
            originalMaxHealth: src.maxHealth || 1200,
            originalRadius: src.radius || 6.0,
            mesh: holeMesh,
            position: holePos.clone(),
            rotationY: src.rotationY || 0,
            radius: Math.min(src.radius || 5.0, 5.2),
            health: holeMaxHp,
            maxHealth: holeMaxHp,
            netId: (isEnemy ? 'AIH_' : 'PH_') + (++netIdSequence),
            teamId: src.teamId !== undefined ? src.teamId : (isEnemy ? 2 : playerTeamId),
            ownerId: src.ownerId || (isEnemy ? 'ai_1' : 'player'),
            faction: 'gla',
            isAI: isEnemy,
            isBuilding: false,
            rebuildTimer: 18 * 60, // 18s official free reconstruction
            workerRespawnCd: 0,
            holeWorker: null
        };
        if (isEnemy) enemyStructures.push(holeObj);
        else structures.push(holeObj);

        // Spawn free GLA Worker from the hole to rebuild the structure
        const wPos = holePos.clone().add(new THREE.Vector3(3.2, 0, 2.2));
        if (!isEnemy && typeof spawnUnit === 'function') {
            const w = spawnUnit('worker', wPos);
            if (w) {
                w.isHoleWorker = true;
                w.taskState = 'Building';
                w.targetStructure = holeObj;
                w.targetPosition.copy(wPos);
                w.waypoints = [];
                holeObj.holeWorker = w;
            }
        } else if (isEnemy && typeof spawnEnemyUnit === 'function') {
            const w = spawnEnemyUnit('worker', wPos, 'gla');
            if (w) {
                w.isHoleWorker = true;
                w.ownerId = holeObj.ownerId;
                w.teamId = holeObj.teamId;
                w.taskState = 'Building';
                w.targetStructure = holeObj;
                w.targetPosition.copy(wPos);
                w.waypoints = [];
                holeObj.holeWorker = w;
            }
        }
        if (typeof showNotification === 'function') {
            showNotification(isEnemy ? `Hostile GLA Hole remaining — destroy it before it rebuilds ${src.type}!` : `GLA Hole intact — worker rebuilding ${src.type} for free!`, 'warning');
        }
    }

    if (typeof worldBuildings !== 'undefined' && worldBuildings.some(wb => wb.health <= 0)) {
        for (let wi = worldBuildings.length - 1; wi >= 0; wi--) {
            const wb = worldBuildings[wi];
            if (wb.health > 0) continue;
            evacuateGarrisonedUnits(wb);
                if (wb.mesh) {
                    if (typeof disposeSceneNodeSafe === 'function') disposeSceneNodeSafe(wb.mesh);
                    else scene.remove(wb.mesh);
                }
            if (wb.position) {
                if (typeof spawnBuildingDestructionFX === 'function') spawnBuildingDestructionFX(wb.position, wb.radius || 5.5, 0xff793f);
                else createImpactExplosion(wb.position);
            }
            if (typeof mapObstacles !== 'undefined' && Array.isArray(mapObstacles)) {
                for (let oi = mapObstacles.length - 1; oi >= 0; oi--) {
                    if (mapObstacles[oi].position && wb.position && mapObstacles[oi].position.distanceTo(wb.position) < 2.0) {
                        mapObstacles.splice(oi, 1);
                    }
                }
            }
            worldBuildings.splice(wi, 1);
        }
    }

    if (units.some(u => u.health <= 0)) {
        const previousUnitCount = units.length;
        const USA_PILOT_EJECT_SET = new Set(['tank', 'crusader', 'paladin', 'humvee', 'ambulance', 'tomahawk', 'comanche', 'raptor', 'stealthfighter', 'aurora', 'chinook']);
        const pendingPilotEjects = [];
        units = units.filter(unit => {
                if (unit.health > 0) return true;
                if (unit.garrisoned && unit.garrisoned.length > 0 && typeof evacuateGarrisonedUnits === 'function') {
                    evacuateGarrisonedUnits(unit);
                }
                removeSelectionCircle(unit);
                if (unit.trajectoryLine) {
                    if (typeof disposeSceneNodeSafe === 'function') disposeSceneNodeSafe(unit.trajectoryLine);
                    else scene.remove(unit.trajectoryLine);
                    unit.trajectoryLine = null;
                }
                if (unit.drone && unit.drone.mesh) {
                    if (typeof disposeSceneNodeSafe === 'function') disposeSceneNodeSafe(unit.drone.mesh);
                    else scene.remove(unit.drone.mesh);
                    unit.drone = null;
                }
                spawnUnitDeathFX(unit);
                // USA Ejection Seat: Manned USA vehicles/aircraft at Veteran+ eject a pilot retaining veterancy.
                // Deferred until AFTER units.filter() returns so spawnUnit() pushes onto the surviving units array!
                const isUsaOwned = unit.faction === 'usa' || (!unit.faction && typeof selectedFaction !== 'undefined' && selectedFaction === 'usa');
                if (!unit._silentRemove && isUsaOwned && !unit.isUnmanned && (unit.veterancy || 0) >= 1 && USA_PILOT_EJECT_SET.has(unit.type) && typeof spawnUnit === 'function') {
                    const ejectPos = unit.mesh.position.clone();
                    ejectPos.x += (Math.random() - 0.5) * 1.0;
                    ejectPos.z += (Math.random() - 0.5) * 1.0;
                    ejectPos.y = typeof getTerrainHeight === 'function' ? getTerrainHeight(ejectPos.x, ejectPos.z) : 0;
                    pendingPilotEjects.push({
                        pos: ejectPos,
                        vRank: Math.min(3, unit.veterancy),
                        kills: unit.kills || 0,
                        teamId: unit.teamId
                    });
                }
                // Authentic GLA Scrap Crate Drop Chance (SalvageCrateCollide.cpp)
                const uScrapRoll = (typeof simRandom === 'function') ? simRandom() : Math.random();
                if (uScrapRoll < 0.65 && (typeof getArmorCategory === 'function' ? (getArmorCategory(unit) === 'heavy_vehicle' || getArmorCategory(unit) === 'light_vehicle') : !INFANTRY_TYPE_SET.has(unit.type))) {
                    if (typeof spawnScrapCrate === 'function') spawnScrapCrate(unit.mesh.position);
                }
                if (!spawnInfantryDeathAnimation(unit)) {
                    if (typeof disposeSceneNodeSafe === 'function') disposeSceneNodeSafe(unit.mesh);
                    else scene.remove(unit.mesh);
                }
                enemyUnits.forEach(enemy => {
                        if (enemy.combatTarget === unit) enemy.combatTarget = null;
                });
                units.forEach(other => {
                        if (other.embarkTarget === unit) other.embarkTarget = null;
                        if (other.pilotTarget === unit) other.pilotTarget = null;
                });
                return false;
        });
        for (let pi = 0; pi < pendingPilotEjects.length; pi++) {
            const ej = pendingPilotEjects[pi];
            const pilot = spawnUnit('pilot', ej.pos, 'usa');
            if (pilot) {
                const vMult = ej.vRank === 3 ? 1.6 : (ej.vRank === 2 ? 1.4 : 1.2);
                pilot.veterancy = ej.vRank;
                pilot.kills = ej.kills;
                pilot.maxHealth = Math.floor(pilot.maxHealth * vMult);
                pilot.health = pilot.maxHealth;
                pilot.ownerId = 'player';
                if (ej.teamId !== undefined) pilot.teamId = ej.teamId;
                if (typeof showNotification === 'function') {
                    showNotification(`🪂 Veteran Pilot ejected (Rank ${'★'.repeat(ej.vRank)}) — select and right-click a friendly vehicle or aircraft to transfer veterancy!`, 'info');
                }
            }
        }
        if (units.length !== previousUnitCount) {
            if (typeof playEvaAlert === 'function') playEvaAlert('unit_lost');
            updateHUD();
        }
    }

    // Neutral Tech Buildings Periodic Effects:
    if (isMatchActive) {
        if (window._techPassiveTimer === undefined) window._techPassiveTimer = 0;
        window._techPassiveTimer++;

        // PERF: only build allTechs on the 1-second tick when it is actually used
        if (window._techPassiveTimer % 60 === 0) {
            const allTechs = [...(typeof structures !== 'undefined' ? structures : []), ...(window.neutralStructures || [])];

            // 1. Tech Oil Derrick: +$200 every 12 seconds (~720 frames)
            if (window._techPassiveTimer % 720 === 0) {
                const playerDerricks = allTechs.filter(s => s.type === 'techOilDerrick' && (s.capturedByTeam === playerTeamId || isFriendly({ teamId: playerTeamId }, s)) && s.health > 0);
                if (playerDerricks.length > 0) {
                    const bonus = playerDerricks.length * 200;
                    playerResources += bonus;
                    const resEl = document.getElementById('resource-display');
                    if (resEl) resEl.innerText = `$${playerResources}`;
                    if (typeof spawnFloatingCashNumber === 'function') {
                        playerDerricks.forEach(d => {
                                if (d.position) spawnFloatingCashNumber(d.position.clone().add(new THREE.Vector3(0, 5.0, 0)), 200);
                        });
                    }
                    if (typeof showNotification === 'function') {
                        showNotification(`Tech Oil Derrick: +$${bonus} passive supply revenue received.`, 'success');
                    }
                }
            }

            // 2. Tech Hospital: Passive regeneration for all friendly infantry (+2 HP every 60 frames / 1.0s)
            const hasHospital = allTechs.some(s => s.type === 'techHospital' && (s.capturedByTeam === playerTeamId || isFriendly({ teamId: playerTeamId }, s)) && s.health > 0);
            if (hasHospital) {
                for (let i = 0; i < units.length; i++) {
                    const u = units[i];
                    if (u.health > 0 && u.health < u.maxHealth && !u.isAir && INFANTRY_TYPE_SET.has(u.type)) {
                        u.health = Math.min(u.maxHealth, u.health + 2);
                    }
                }
            }
        }

        // 3. GLA Foundation Holes Rebuilding Timer (official free worker reconstruction unless hole is destroyed)
        const structLists = [structures, enemyStructures];
        for (let li = 0; li < 2; li++) {
            const sList = structLists[li];
            const isEnemyHole = (li === 1);
            for (let si = 0; si < sList.length; si++) {
                const hole = sList[si];
                if (hole.type !== 'glaHole' || hole.health <= 0) continue;
                // If the rebuild worker was killed while the hole survives, pause 5s then spawn a replacement worker
                const wAlive = !!(hole.holeWorker && hole.holeWorker.health > 0);
                if (!wAlive) {
                    if (!hole.workerRespawnCd) hole.workerRespawnCd = 300;
                    hole.workerRespawnCd--;
                    if (hole.workerRespawnCd <= 0) {
                        const wPos = hole.position.clone().add(new THREE.Vector3(3.2, 0, 2.2));
                        const nw = (!isEnemyHole && typeof spawnUnit === 'function')
                            ? spawnUnit('worker', wPos)
                            : (isEnemyHole && typeof spawnEnemyUnit === 'function' ? spawnEnemyUnit('worker', wPos, 'gla') : null);
                        if (nw) {
                            nw.isHoleWorker = true;
                            nw.ownerId = hole.ownerId;
                            nw.teamId = hole.teamId;
                            nw.taskState = 'Building';
                            nw.targetStructure = hole;
                            nw.targetPosition.copy(wPos);
                            nw.waypoints = [];
                            hole.holeWorker = nw;
                        }
                    }
                    continue;
                }
                // Keep hole worker visibly hammering at the hole
                if (hole.holeWorker.taskState !== 'Building') hole.holeWorker.taskState = 'Building';
                if (hole.rebuildTimer === undefined) hole.rebuildTimer = 18 * 60;
                hole.rebuildTimer--;
                if (hole.rebuildTimer <= 0) {
                    // Reconstruct original GLA structure for free!
                    const origType = hole.originalType || 'barracks';
                    const rebuildPos = hole.position.clone();
                    const rebuildRotY = hole.rotationY || 0;
                    const maxHp = hole.originalMaxHealth || 1200;
                    const rad = hole.originalRadius || 6.0;
                    if (hole.holeWorker && hole.holeWorker.health > 0) {
                        hole.holeWorker._silentRemove = true;
                        hole.holeWorker.health = 0;
                    }
                    hole.health = 0;
                    if (hole.mesh) {
                        if (typeof disposeSceneNodeSafe === 'function') disposeSceneNodeSafe(hole.mesh);
                        else scene.remove(hole.mesh);
                        hole.mesh = null;
                    }
                    if (typeof createStructureMeshForFaction === 'function') {
                        const newMesh = createStructureMeshForFaction(origType, 'gla', isEnemyHole);
                        if (!newMesh.userData || !newMesh.userData.isW3D) newMesh.scale.set(1.35, 1.35, 1.35);
                        newMesh.position.copy(rebuildPos);
                        newMesh.rotation.y = rebuildRotY;
                        scene.add(newMesh);
                        const rebuilt = {
                            type: origType,
                            mesh: newMesh,
                            position: rebuildPos.clone(),
                            rotationY: rebuildRotY,
                            radius: rad,
                            health: maxHp,
                            maxHealth: maxHp,
                            netId: (isEnemyHole ? 'AIS_' : 'PS_') + (++netIdSequence),
                            teamId: hole.teamId,
                            ownerId: hole.ownerId,
                            faction: 'gla',
                            isAI: isEnemyHole,
                            isBuilding: false,
                            buildProgress: 100
                        };
                        if (origType === 'scudStorm') {
                            rebuilt.swMaxCooldown = 18000;
                            rebuilt.cooldownUntil = buildingTick + 18000;
                            rebuilt._readyAnnounced = false;
                        }
                        sList.push(rebuilt);
                        if (typeof markPathfindGridDirty === 'function') markPathfindGridDirty();
                        if (typeof showNotification === 'function') {
                            showNotification(isEnemyHole ? `Hostile GLA Hole rebuilt ${origType}!` : `GLA ${origType} rebuilt from hole for free!`, isEnemyHole ? 'warning' : 'success');
                        }
                    }
                }
            }
        }
    }

    // Tactical Mission Victory / Defeat Objective Check (Total Annihilation of Hostile Forces)
    // PERF: throttled to every 15 frames and uses early-exit loops instead of 4 array spreads + filters per frame
    if (isMatchActive && hasSpawnedInitialEnemyBase && (_animNodeFrame % 15 === 0)) {
        const pTeam = { teamId: playerTeamId };
        let hasHostile = false, hasFriendly = false;
        const sLists = [structures, enemyStructures];
        for (let li = 0; li < 2 && (!hasHostile || !hasFriendly); li++) {
            const arr = sLists[li];
            for (let i = 0; i < arr.length; i++) {
                const s = arr[i];
                if (s.health <= 0) continue;
                if (isFriendly(pTeam, s)) hasFriendly = true;
                else hasHostile = true;
                if (hasHostile && hasFriendly) break;
            }
        }
        const uLists = [units, enemyUnits];
        for (let li = 0; li < 2 && (!hasHostile || !hasFriendly); li++) {
            const arr = uLists[li];
            for (let i = 0; i < arr.length; i++) {
                const u = arr[i];
                if (u.health <= 0) continue;
                if (isFriendly(pTeam, u)) {
                    hasFriendly = true;
                } else if (u.type !== 'truck' && u.type !== 'worker' && u.type !== 'dozer') {
                    hasHostile = true;
                }
                if (hasHostile && hasFriendly) break;
            }
        }

        if (!hasHostile) {
            isMatchActive = false;
            showNotification("MISSION ACCOMPLISHED: ALL HOSTILE FORCES ELIMINATED!", "success");
            const ticker = document.getElementById('tactical-message');
            if (ticker) ticker.innerHTML = '<strong style="color:#55efc4;">VICTORY: Operational theater secured. All hostile forces destroyed!</strong>';
            if (typeof recordSkirmishOutcome === 'function') recordSkirmishOutcome(true);
            if (typeof showVictoryBanner === 'function') showVictoryBanner();
        } else if (!hasFriendly) {
            isMatchActive = false;
            showNotification("MISSION FAILED: ALL STRATEGIC ASSETS LOST!", "error");
            const ticker = document.getElementById('tactical-message');
            if (ticker) ticker.innerHTML = '<strong style="color:#ff4757;">CRITICAL DEFEAT: Command Center and all friendly forces destroyed.</strong>';
            if (typeof recordSkirmishOutcome === 'function') recordSkirmishOutcome(false);
            if (typeof showDefeatBanner === 'function') showDefeatBanner();
        }
    }

    const _menuElForShell = (typeof document !== 'undefined') ? document.getElementById('start-menu') : null;
    if (!isMatchActive && !(_menuElForShell && _menuElForShell.style && _menuElForShell.style.display === 'none') && typeof updateShellMapDemo === 'function') {
        updateShellMapDemo(dt);
    }
    // Issue #70: Throttle minimap 2D canvas redraws to ~15 Hz (66ms) independently of 60 Hz 3D render loop
    if (typeof renderRadarMinimap === 'function') {
        const radarNow = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const isDragging = (typeof isDraggingRadar !== 'undefined' && isDraggingRadar);
        if (isDragging || !window._lastMinimapRenderMs || (radarNow - window._lastMinimapRenderMs) >= 66) {
            window._lastMinimapRenderMs = radarNow;
            renderRadarMinimap();
        }
    }
    if (typeof updateGuardIndicators === 'function') {
        updateGuardIndicators();
    }
    const _shakeOff = (typeof applyViewShake === 'function') ? applyViewShake(dt) : null;
    renderer.render(scene, camera);
    if (_shakeOff) camera.position.sub(_shakeOff);
}

// Retail ViewShake (GameClient shake): intensity impulses accumulate (clamped), decay exponentially,
// and fall off with distance from the camera focus (MaxShakeRange).
let _viewShakeIntensity = 0;
const _viewShakeOffset = (typeof THREE !== 'undefined' && typeof THREE.Vector3 === 'function') ? new THREE.Vector3() : null;
const VIEW_SHAKE_MAX_RANGE = 260;
const VIEW_SHAKE_MAX_INTENSITY = 3.0;
function triggerScreenShake(intensity = 1, pos = null) {
    let amount = Number(intensity) || 0;
    if (pos && typeof cameraTarget !== 'undefined' && cameraTarget) {
        const d = Math.hypot(pos.x - cameraTarget.x, pos.z - cameraTarget.z);
        if (d >= VIEW_SHAKE_MAX_RANGE) return;
        amount *= 1 - d / VIEW_SHAKE_MAX_RANGE;
    }
    _viewShakeIntensity = Math.min(VIEW_SHAKE_MAX_INTENSITY, _viewShakeIntensity + amount);
}
window.triggerScreenShake = triggerScreenShake;
function applyViewShake(dt) {
    if (_viewShakeIntensity < 0.01 || !_viewShakeOffset || typeof camera === 'undefined' || !camera || !camera.position) {
        _viewShakeIntensity = 0;
        return null;
    }
    const mag = _viewShakeIntensity * 0.55;
    _viewShakeOffset.set((Math.random() - 0.5) * 2 * mag, (Math.random() - 0.5) * 2 * mag * 0.7, (Math.random() - 0.5) * 2 * mag);
    camera.position.add(_viewShakeOffset);
    if (typeof camera.updateMatrixWorld === 'function') camera.updateMatrixWorld(true);
    _viewShakeIntensity *= Math.exp(-(dt || 0.016) * 4.5);
    return _viewShakeOffset;
}
function processEnemyMovement() {
    separateGroundUnits(enemyUnits);
    enemyUnits.forEach((enemy, eIdx) => {
            if (enemy.health <= 0 || enemy.garrisonedIn) return;
            const isDisabled = Boolean(enemy.isUnmanned || (enemy.disabledUntil && typeof buildingTick !== 'undefined' && buildingTick < enemy.disabledUntil));
            if (isDisabled) {
                if (enemy.mesh && (buildingTick + eIdx) % 28 === 0 && typeof spawnEMPDisableSparks === 'function') {
                    spawnEMPDisableSparks(enemy.mesh.position);
                }
                return;
            }

            // Unified Aircraft & Helicopter Flight, Combat, Rearming & Orbit Engine (14d_aircraft.js)
            if (enemy.isAir) {
                if (typeof updateAircraftFlight === 'function') updateAircraftFlight(enemy, eIdx, true);
                return;
            }

            // Ground vehicle and infantry movement
            if (enemy.taskState === 'Building' || enemy.taskState === 'Repairing') return;
            const target = enemy.combatTarget;
            const targetPos = target && (target.position || target.mesh.position);
            const targetRadius = target ? (target.radius || 0) : 0;
            if (target && target.health > 0 && enemy.mesh.position.distanceTo(targetPos) <= (enemy.scanRange + targetRadius - 2)) {
                enemy.targetPosition.copy(enemy.mesh.position);
                return;
            }

            const dx = enemy.targetPosition.x - enemy.mesh.position.x;
            const dz = enemy.targetPosition.z - enemy.mesh.position.z;
            const dist2D = Math.hypot(dx, dz);
            const enemyStopBuffer = (enemy.waypoints && enemy.waypoints.length > 0)
                ? Math.max(4.5, (enemy.radius || 1.2) * 2.2)
                : 0.5;
            if (dist2D > enemyStopBuffer) {
                const dirX = dx / dist2D;
                const dirZ = dz / dist2D;
                let effectiveSpeed = enemy.speed;
                if (enemy._releasedForAttack && enemy._waveConvoySpeed && !enemy.isAir) {
                    const inCombatRange = target && target.health > 0 && targetPos &&
                        Math.hypot(enemy.mesh.position.x - targetPos.x, enemy.mesh.position.z - targetPos.z) <= ((enemy.scanRange || 24) + targetRadius + 14);
                    if (!inCombatRange) {
                        // Keep mixed-speed strike waves marching as a cohesive combined-arms group until reaching engagement range
                        effectiveSpeed = enemy.speed > enemy._waveConvoySpeed
                            ? enemy._waveConvoySpeed
                            : Math.min(enemy._waveConvoySpeed, enemy.speed * 1.45);
                    }
                }
                const step = Math.min(dist2D, effectiveSpeed * combatDeltaScale);
                const nextX = enemy.mesh.position.x + dirX * step;
                const nextZ = enemy.mesh.position.z + dirZ * step;
                // Enforce the exact same cliff passability rules on AI ground units as player units (no riding up sheer cliffs!)
                let cliffBlocked = false;
                if (!enemy.isAir && typeof isTerrainCliffAt === 'function') {
                    const onBridgeNext = (typeof getBridgeDeckHeightAt === 'function' && getBridgeDeckHeightAt(nextX, nextZ) !== null);
                    if (!onBridgeNext && isTerrainCliffAt(nextX, nextZ) && !isTerrainCliffAt(enemy.mesh.position.x, enemy.mesh.position.z)) {
                        cliffBlocked = true;
                        const nowTick = (typeof buildingTick !== 'undefined') ? buildingTick : 0;
                        if (!enemy._cliffRerouteTick || nowTick - enemy._cliffRerouteTick >= 30) {
                            enemy._cliffRerouteTick = nowTick;
                            const finalGoal = (enemy.waypoints && enemy.waypoints.length > 0)
                                ? enemy.waypoints[enemy.waypoints.length - 1]
                                : enemy.targetPosition;
                            // Issue #69: Route cliff reroutes through the pathfinding work queue (avoids per-frame A* spikes)
                            if (typeof enqueueNavigationPath === 'function' && finalGoal) {
                                enqueueNavigationPath(enemy, finalGoal, { ignoreStruct: enemy.targetStructure || enemy.combatTarget || null });
                            }
                        }
                    }
                }
                if (!cliffBlocked) {
                    enemy.mesh.position.x = nextX;
                    enemy.mesh.position.z = nextZ;
                }
                if (!enemy.isAir && !INFANTRY_TYPE_SET.has(enemy.type)) spinVehicleWheels(enemy, step);
                if (!enemy.isAir && !INFANTRY_TYPE_SET.has(enemy.type) && typeof spawnTreadDustPuff === 'function') {
                    const isTrackedEnemy = ['tank', 'crusader', 'paladin', 'battlemaster', 'overlord', 'gatling', 'gatlingTank', 'dragon', 'inferno', 'nukecannon', 'nuketank', 'scorpion', 'marauder', 'scud', 'dozer', 'crawler'].includes(enemy.type);
                    if (!cliffBlocked && typeof spawnVehicleTrackMark === 'function') {
                        spawnVehicleTrackMark(enemy, Math.atan2(dirX, dirZ), isTrackedEnemy);
                    }
                    const tickOff = buildingTick + (enemy.netId ? String(enemy.netId).length : 0);
                    if (tickOff % 4 === 0) {
                        const rLen = (enemy.radius || 2.5) * 0.68;
                        const dustScale = Math.max(0.55, Math.min(1.15, (enemy.radius || 2.8) * 0.22));
                        if (isTrackedEnemy) {
                            const rightX = dirZ, rightZ = -dirX;
                            const lat = (enemy.radius || 2.5) * 0.45;
                            spawnTreadDustPuff({ x: enemy.mesh.position.x - dirX * rLen - rightX * lat, y: enemy.mesh.position.y, z: enemy.mesh.position.z - dirZ * rLen - rightZ * lat }, -dirX, -dirZ, null, dustScale);
                            spawnTreadDustPuff({ x: enemy.mesh.position.x - dirX * rLen + rightX * lat, y: enemy.mesh.position.y, z: enemy.mesh.position.z - dirZ * rLen + rightZ * lat }, -dirX, -dirZ, null, dustScale);
                        } else {
                            spawnTreadDustPuff({ x: enemy.mesh.position.x - dirX * rLen, y: enemy.mesh.position.y, z: enemy.mesh.position.z - dirZ * rLen }, -dirX, -dirZ, null, dustScale * 0.9);
                        }
                    }
                }

                // AI Anti-Stuck Watchdog: prevent dozers/units from vibrating forever against obstacles or riverbanks
                if (!enemy.isAir) {
                    enemy._aiStuckTick = (enemy._aiStuckTick || 0) + 1;
                    if (!enemy._aiLastPos) enemy._aiLastPos = enemy.mesh.position.clone();
                    if (enemy._aiStuckTick >= 40) {
                        const moved = Math.hypot(enemy.mesh.position.x - enemy._aiLastPos.x, enemy.mesh.position.z - enemy._aiLastPos.z);
                        enemy._aiLastPos.copy(enemy.mesh.position);
                        enemy._aiStuckTick = 0;
                        if (moved < 0.25) {
                            // Issue #69: Queue A* reroute through pathfinding budget queue instead of synchronous frame-spiking search
                            const finalGoal = (enemy.waypoints && enemy.waypoints.length > 0)
                                ? enemy.waypoints[enemy.waypoints.length - 1]
                                : enemy.targetPosition;
                            if (typeof enqueueNavigationPath === 'function' && finalGoal && (!enemy._lastQueuedStuckTick || (buildingTick - enemy._lastQueuedStuckTick) >= 90)) {
                                enemy._lastQueuedStuckTick = buildingTick;
                                enqueueNavigationPath(enemy, finalGoal, { ignoreStruct: enemy.targetStructure || enemy.combatTarget || null });
                            } else {
                                const enemyNum = parseInt(String(enemy.netId || '1').replace(/\D/g, ''), 10) || 1;
                                const sideAngle = (enemyNum % 2 === 0 ? 1 : -1) * (Math.PI / 2);
                                const perpX = Math.cos(sideAngle) * dirX - Math.sin(sideAngle) * dirZ;
                                const perpZ = Math.sin(sideAngle) * dirX + Math.cos(sideAngle) * dirZ;
                                const rawDetour = new THREE.Vector3(enemy.mesh.position.x + perpX * 14, 0, enemy.mesh.position.z + perpZ * 14);
                                const safeDetour = (typeof adjustToPossibleDestination === 'function')
                                    ? adjustToPossibleDestination(rawDetour, enemy.targetStructure || null)
                                    : rawDetour;
                                if (!enemy.waypoints) enemy.waypoints = [];
                                enemy.waypoints.unshift(enemy.targetPosition.clone());
                                enemy.targetPosition.copy(safeDetour);
                            }
                        }
                    }
                }

                // Authentic Tank Crushing by AI vehicles (SquishCollide.cpp)
                if (CRUSHER_TANK_SET.has(enemy.type)) {
                    for (let ally of units) {
                        if (ally.health > 0 && ally.mesh && !isFriendly(enemy, ally) && (typeof getArmorCategory === 'function' ? getArmorCategory(ally) === 'infantry' : INFANTRY_TYPE_SET.has(ally.type))) {
                            const infDist = Math.hypot(enemy.mesh.position.x - ally.mesh.position.x, enemy.mesh.position.z - ally.mesh.position.z);
                            if (infDist <= ((enemy.radius || 1.8) + (ally.radius || 0.6)) * 0.95) {
                                const toX = ally.mesh.position.x - enemy.mesh.position.x;
                                const toZ = ally.mesh.position.z - enemy.mesh.position.z;
                                if (toX * dirX + toZ * dirZ > 0) {
                                    ally.health = 0;
                                    if (typeof spawnSquishDecal === 'function') spawnSquishDecal(ally.mesh.position);
                                    playAudio('infantry_squish');
                                    if (typeof showNotification === 'function') {
                                        showNotification(`Friendly ${ally.type.toUpperCase()} crushed by hostile tank!`, 'error');
                                    }
                                    enemy.kills = (enemy.kills || 0) + 1;
                                }
                            }
                        }
                    }
                }
                enemy.mesh.rotation.y = Math.atan2(-dirZ, dirX) + Math.PI / 2;
                if (INFANTRY_TYPE_SET.has(enemy.type)) {
                    enemy.mesh.rotation.x = 0;
                    enemy.mesh.rotation.z = 0;
                    enemy._strideBob = 0;
                    if (enemy.mesh.visible !== false && enemy.mesh.userData && enemy.mesh.userData.animatedMeshes && isWorldPosInView(enemy.mesh.position, 10)) {
                        enemy._runCycle = ((enemy._runCycle || 0) + 0.38) % 8;
                        const c = enemy._runCycle;
                        const f0 = Math.floor(c);
                        const f1 = (f0 + 1) % 8;
                        const frac = c - f0;
                        enemy.mesh.userData.animatedMeshes.forEach(m => {
                                if (m.userData && m.userData.runFrames && m.userData.runFrames[f0] && m.userData.runFrames[f1]) {
                                    const arr0 = m.userData.runFrames[f0];
                                    const arr1 = m.userData.runFrames[f1];
                                    const pos = m.geometry.attributes.position.array;
                                    for (let k = 0; k < pos.length; k++) {
                                        pos[k] = arr0[k] * (1 - frac) + arr1[k] * frac;
                                    }
                                    m.geometry.attributes.position.needsUpdate = true;
                                }
                        });
                    }
                }
            } else {
                if (enemy.waypoints && enemy.waypoints.length > 0) {
                    const nextWp = enemy.waypoints.shift();
                    enemy.targetPosition.copy(nextWp);
                }
                if (INFANTRY_TYPE_SET.has(enemy.type)) {
                    enemy.mesh.rotation.x = 0;
                    enemy.mesh.rotation.z = 0;
                    enemy._strideBob = 0;
                    updateInfantryStationaryAnim(enemy);
                }
            }

            // Match enemy ground height on hills & resolve obstacle collisions
            const eGroundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(enemy.mesh.position.x, enemy.mesh.position.z) : 0;
            enemy.mesh.position.y = eGroundY + (enemy._strideBob || 0);
            resolveObstacleCollisions(enemy);
    });
}

function updateInfantryStationaryAnim(unit) {
    if (!unit || !unit.mesh || unit.mesh.visible === false || !unit.mesh.userData || !unit.mesh.userData.animatedMeshes) return;
    if (unit._atkAnimTicks > 0) unit._atkAnimTicks--;
    if (!isWorldPosInView(unit.mesh.position, 10)) return;
    const isAttacking = (unit._atkAnimTicks > 0) || !!(unit.combatTarget && unit.combatTarget.health > 0);
    if (isAttacking) {
        unit._atkCycle = ((unit._atkCycle || 0) + 0.24) % 4;
    }
    const c = unit._atkCycle || 0;
    unit.mesh.userData.animatedMeshes.forEach(m => {
        if (!m || !m.userData || !m.geometry || !m.geometry.attributes || !m.geometry.attributes.position) return;
        const pos = m.geometry.attributes.position.array;
        if (isAttacking && m.userData.atkFrames && m.userData.atkFrames.length >= 2) {
            const frames = m.userData.atkFrames;
            const n = frames.length;
            const idx = c % n;
            const f0 = Math.floor(idx);
            const f1 = (f0 + 1) % n;
            const frac = idx - f0;
            const arr0 = frames[f0];
            const arr1 = frames[f1];
            if (arr0 && arr1 && arr0.length === pos.length) {
                for (let k = 0; k < pos.length; k++) {
                    pos[k] = arr0[k] * (1 - frac) + arr1[k] * frac;
                }
                m.geometry.attributes.position.needsUpdate = true;
                return;
            }
        }
        if (m.userData.standVerts) {
            const std = m.userData.standVerts;
            let changed = false;
            for (let k = 0; k < pos.length; k++) {
                const diff = std[k] - pos[k];
                if (Math.abs(diff) > 0.001) {
                    pos[k] += diff * 0.25;
                    changed = true;
                } else {
                    pos[k] = std[k];
                }
            }
            if (changed) m.geometry.attributes.position.needsUpdate = true;
        }
    });
}

function spawnInfantryDeathAnimation(unit) {
    if (!unit || unit._silentRemove || !unit.mesh || !INFANTRY_TYPE_SET.has(unit.type)) return false;
    const animMeshes = unit.mesh.userData && unit.mesh.userData.animatedMeshes;
    if (!animMeshes || animMeshes.length === 0) return false;
    const hasDie = animMeshes.some(m => m && m.userData && m.userData.dieFrames && m.userData.dieFrames.length >= 2);
    if (!hasDie || typeof activeFX === 'undefined') return false;

    const corpseMesh = unit.mesh;
    corpseMesh.rotation.x = 0;
    corpseMesh.rotation.z = 0;
    // Hide health/rank/selection UI attachments while playing the skeletal collapse
    if (corpseMesh.children) {
        for (let i = 0; i < corpseMesh.children.length; i++) {
            const ch = corpseMesh.children[i];
            if (ch && ch.name && (ch.name === 'healthBar' || ch.name === 'veterancyChevron' || ch.name === 'selectionRing' || ch.name === 'workerHammer' || ch.name === 'cargoHold' || ch.name === 'mineDetector')) {
                ch.visible = false;
            }
        }
    }

    const collapseTicks = 28;
    const holdTicks = 45;
    const sinkTicks = 22;
    let tick = 0;
    const totalTicks = collapseTicks + holdTicks + sinkTicks;
    activeFX.push({
        life: totalTicks,
        update() {
            tick++;
            if (tick <= collapseTicks) {
                const prog = tick / collapseTicks;
                for (let mi = 0; mi < animMeshes.length; mi++) {
                    const m = animMeshes[mi];
                    if (!m || !m.userData || !m.userData.dieFrames || m.userData.dieFrames.length < 2) continue;
                    const frames = m.userData.dieFrames;
                    const maxIdx = frames.length - 1;
                    const fVal = prog * maxIdx;
                    const f0 = Math.min(maxIdx, Math.floor(fVal));
                    const f1 = Math.min(maxIdx, f0 + 1);
                    const frac = fVal - f0;
                    const arr0 = frames[f0];
                    const arr1 = frames[f1];
                    const pos = m.geometry && m.geometry.attributes && m.geometry.attributes.position && m.geometry.attributes.position.array;
                    if (pos && arr0 && arr1 && arr0.length === pos.length) {
                        for (let k = 0; k < pos.length; k++) {
                            pos[k] = arr0[k] * (1 - frac) + arr1[k] * frac;
                        }
                        m.geometry.attributes.position.needsUpdate = true;
                    }
                }
            } else if (tick > collapseTicks + holdTicks) {
                corpseMesh.position.y -= 0.06;
            }
            if (tick >= totalTicks) {
                if (typeof disposeSceneNodeSafe === 'function') disposeSceneNodeSafe(corpseMesh);
                else if (typeof scene !== 'undefined') scene.remove(corpseMesh);
                return false;
            }
            return true;
        }
    });
    return true;
}
