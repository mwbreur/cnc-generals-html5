// =========================================================================
// AUTHENTIC ZERO HOUR ANIMATED 3D SHELL MAP (MAIN MENU BACKGROUND)
// =========================================================================
window._shellMapState = null;

function cleanupShellMapDemo() {
    const st = window._shellMapState;
    if (!st) return;
    if (st.group && typeof scene !== 'undefined' && scene) {
        scene.remove(st.group);
    }
    window._shellMapState = null;
}
window.cleanupShellMapDemo = cleanupShellMapDemo;

function initShellMapDemo() {
    if (typeof scene === 'undefined' || !scene || typeof camera === 'undefined' || !camera || typeof THREE === 'undefined') return;
    if (typeof isMatchActive !== 'undefined' && isMatchActive) return;

    cleanupShellMapDemo();

    if (typeof terrainMesh === 'undefined' || !terrainMesh) {
        if (typeof setupMapEnvironment === 'function') {
            setupMapEnvironment('tournament_desert', 600);
        }
    }
    if (typeof fogMesh !== 'undefined' && fogMesh) {
        fogMesh.visible = false;
    }

    const group = new THREE.Group();
    group.name = 'ShellMapDemoGroup';
    scene.add(group);

    const hAt = (x, z) => (typeof getTerrainHeight === 'function' ? getTerrainHeight(x, z) : 0);
    const placeBuilding = (w3dKey, fallbackFn, x, z, rotY, isEnemy) => {
        let mesh = null;
        if (typeof createW3DBuildingMesh === 'function' && window.W3D_BUILDING_DATA && window.W3D_BUILDING_DATA[w3dKey]) {
            mesh = createW3DBuildingMesh(w3dKey, isEnemy);
        } else if (typeof fallbackFn === 'function') {
            mesh = fallbackFn(isEnemy);
        }
        if (!mesh) return;
        mesh.position.set(x, hAt(x, z), z);
        mesh.rotation.y = rotY;
        group.add(mesh);
    };

    // West Ridge: USA Airbase & Forward Command
    placeBuilding('usa_commandCenter', typeof createUSACommandCenter === 'function' ? createUSACommandCenter : null, -92, -35, 0.4, false);
    placeBuilding('usa_airfield', typeof createAirfield === 'function' ? createAirfield : null, -118, 10, 0.25, false);
    placeBuilding('usa_strategyCenter', typeof createStrategyCenter === 'function' ? createStrategyCenter : null, -72, -62, 0.6, false);
    placeBuilding('usa_patriot', typeof createPatriotBattery === 'function' ? createPatriotBattery : null, -52, -18, 0.5, false);
    placeBuilding('usa_patriot', typeof createPatriotBattery === 'function' ? createPatriotBattery : null, -58, 28, 0.2, false);

    // East Ridge: China / GLA Forward Position
    placeBuilding('china_commandCenter', typeof createChinaCommandCenter === 'function' ? createChinaCommandCenter : null, 95, 30, -2.5, true);
    placeBuilding('china_factory', typeof createChinaWarFactory === 'function' ? createChinaWarFactory : null, 118, -12, -2.7, true);
    placeBuilding('china_propagandaCenter', typeof createPropagandaCenter === 'function' ? createPropagandaCenter : null, 72, 58, -2.2, true);
    placeBuilding('civilian_bunker', null, 52, 16, -2.4, true);

    const makeUnit = (key, isEnemy) => {
        if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA[key]) {
            return createW3DVehicleMesh(key, isEnemy);
        }
        const g = new THREE.Group();
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(3.2, 1.4, 4.6),
            new THREE.MeshStandardMaterial({ color: isEnemy ? 0x9b2c2c : 0x2c5282, roughness: 0.6 })
        );
        body.position.y = 0.8;
        g.add(body);
        return g;
    };

    const convoys = [
        { key: 'paladin', isEnemy: false, cx: -28, cz: -14, rx: 22, rz: 18, speed: 0.22, phase: 0.0 },
        { key: 'crusader', isEnemy: false, cx: -34, cz: 16, rx: 18, rz: 20, speed: 0.24, phase: 1.8 },
        { key: 'humvee', isEnemy: false, cx: -20, cz: 4, rx: 16, rz: 14, speed: 0.34, phase: 3.1 },
        { key: 'overlord', isEnemy: true, cx: 28, cz: 12, rx: 20, rz: 18, speed: -0.18, phase: 0.6 },
        { key: 'battlemaster', isEnemy: true, cx: 36, cz: -16, rx: 18, rz: 16, speed: -0.24, phase: 2.5 },
        { key: 'scorpion', isEnemy: true, cx: 22, cz: -4, rx: 15, rz: 14, speed: -0.32, phase: 4.2 }
    ];
    convoys.forEach(c => {
            c.mesh = makeUnit(c.key, c.isEnemy);
            c.fireTimer = 0.8 + Math.random() * 2.2;
            group.add(c.mesh);
    });

    const aircraft = [
        { key: 'raptor', isEnemy: false, rx: 135, rz: 95, alt: 34, speed: 0.36, phase: 0.0 },
        { key: 'aurora', isEnemy: false, rx: 155, rz: 110, alt: 42, speed: 0.42, phase: 2.1 },
        { key: 'comanche', isEnemy: false, rx: 85, rz: 65, alt: 22, speed: 0.28, phase: 4.0 },
        { key: 'mig', isEnemy: true, rx: 130, rz: 90, alt: 36, speed: -0.38, phase: 1.2 }
    ];
    aircraft.forEach(a => {
            a.mesh = makeUnit(a.key, a.isEnemy);
            group.add(a.mesh);
    });

    window._shellMapState = {
        group,
        time: 0,
        convoys,
        aircraft
    };
}
window.initShellMapDemo = initShellMapDemo;

function updateShellMapDemo(dt) {
    if ((!window._shellMapState || !window._shellMapState.group) && typeof initShellMapDemo === 'function') {
        initShellMapDemo();
    }
    const st = window._shellMapState;
    if (!st || !st.group) return;
    if (typeof camera === 'undefined' || !camera) return;

    const safeDt = Math.min(0.05, Math.max(0.001, dt || 0.016));
    st.time += safeDt;
    const t = st.time;
    const hAt = (x, z) => (typeof getTerrainHeight === 'function' ? getTerrainHeight(x, z) : 0);

    // Smooth Zero Hour ShellMap cinematic camera flyover (sweeping figure-8 + altitude banks)
    const camAngle = t * 0.085;
    const camRadius = 96 + Math.sin(t * 0.17) * 24;
    const camX = Math.cos(camAngle) * camRadius;
    const camZ = Math.sin(camAngle * 1.15) * camRadius * 0.72;
    const camY = hAt(camX, camZ) + 34 + Math.sin(t * 0.23) * 11;
    camera.position.set(camX, camY, camZ);
    camera.lookAt(Math.sin(t * 0.11) * 26, hAt(0, 0) + 5, Math.cos(t * 0.09) * 18);

    // Move armored columns, aim turrets & fire live tracers/rockets/explosions across the valley
    for (let i = 0; i < st.convoys.length; i++) {
        const c = st.convoys[i];
        const ang = t * c.speed + c.phase;
        const x = c.cx + Math.cos(ang) * c.rx;
        const z = c.cz + Math.sin(ang) * c.rz;
        const dx = -Math.sin(ang) * c.rx * c.speed;
        const dz = Math.cos(ang) * c.rz * c.speed;
        c.mesh.position.set(x, hAt(x, z), z);
        c.mesh.rotation.y = Math.atan2(dx, dz);

        const opp = st.convoys[(i + 3) % st.convoys.length];
        if (opp && opp.mesh) {
            const turret = (typeof getCachedNode === 'function') ? getCachedNode(c.mesh, 'turretSystem') : null;
            if (turret && turret.parent && typeof turret.parent.worldToLocal === 'function') {
                const localT = turret.parent.worldToLocal(opp.mesh.position.clone());
                turret.rotation.y = Math.atan2(localT.x, localT.z);
            }
        }

        c.fireTimer -= safeDt;
        if (c.fireTimer <= 0) {
            c.fireTimer = 1.1 + Math.random() * 1.8;
            if (opp && opp.mesh) {
                const startPos = c.mesh.position.clone().add(new THREE.Vector3(0, 2.2, 0));
                const endPos = opp.mesh.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 1.5, (Math.random() - 0.5) * 6));
                if (typeof spawnMuzzleFlash === 'function') spawnMuzzleFlash(startPos, c.isEnemy ? 0xff7733 : 0xffcc44, 0.8);
                if (typeof spawnBulletTracer === 'function') {
                    spawnBulletTracer(startPos, endPos, c.isEnemy ? 0xff5533 : 0xffdd55, 2.4);
                }
                if (typeof spawnRocketProjectile === 'function' && Math.random() < 0.35) {
                    spawnRocketProjectile(startPos, endPos, false, false, null);
                }
                if (typeof spawnExplosion === 'function' && Math.random() < 0.55) {
                    spawnExplosion(endPos, 0xff8833, 1.4, null);
                }
            }
        }
    }

    // Fly aircraft overhead in banked passes with periodic missile salvos
    for (let i = 0; i < st.aircraft.length; i++) {
        const a = st.aircraft[i];
        const ang = t * a.speed + a.phase;
        const x = Math.cos(ang) * a.rx;
        const z = Math.sin(ang) * a.rz;
        const dx = -Math.sin(ang) * a.rx * a.speed;
        const dz = Math.cos(ang) * a.rz * a.speed;
        a.mesh.position.set(x, hAt(x, z) + a.alt + Math.sin(t * 0.9 + i) * 2.5, z);
        a.mesh.rotation.y = Math.atan2(dx, dz);
        a.mesh.rotation.z = (a.speed > 0 ? -1 : 1) * 0.24;
        if (a.fireTimer === undefined) a.fireTimer = 1.5 + i * 0.9;
        a.fireTimer -= safeDt;
        if (a.fireTimer <= 0) {
            a.fireTimer = 2.6 + Math.random() * 2.2;
            const targetConvoy = st.convoys[(a.isEnemy ? 0 : 3) + (i % 3)];
            if (targetConvoy && targetConvoy.mesh && typeof spawnRocketProjectile === 'function') {
                spawnRocketProjectile(a.mesh.position.clone(), targetConvoy.mesh.position.clone(), false, false, null);
            }
        }
    }
}
window.updateShellMapDemo = updateShellMapDemo;
