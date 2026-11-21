// FOG OF WAR (COMMAND & CONQUER SHROUD & DYNAMIC VISION ENGINE)
// =========================================================================
let fogCanvas = null;
let fogCtx = null;
let _fogRawCanvas = null;
let _fogRawCtx = null;
let fogTexture = null;
let fogMesh = null;
let fogGrid = null; // Uint8Array: 0 = Shroud, 1 = Fog (explored), 2 = Visible
const FOG_RES = 128;
const FOG_TEX_RES = 512;
let fogUpdateTick = 0;
const activeVisionBeacons = [];

function revealFogOfWarAt(pos, radius = 35, duration = 1800) {
    activeVisionBeacons.push({
            x: pos.x,
            z: pos.z,
            radius: radius,
            life: duration
    });
}

function initFogOfWar(mapSize) {
    if (fogMesh) {
        scene.remove(fogMesh);
        if (fogMesh.geometry) fogMesh.geometry.dispose();
        if (fogMesh.material) fogMesh.material.dispose();
        fogMesh = null;
    }

    fogCanvas = document.createElement('canvas');
    fogCanvas.width = FOG_TEX_RES;
    fogCanvas.height = FOG_TEX_RES;
    fogCtx = fogCanvas.getContext('2d');

    _fogRawCanvas = document.createElement('canvas');
    _fogRawCanvas.width = FOG_RES;
    _fogRawCanvas.height = FOG_RES;
    _fogRawCtx = _fogRawCanvas.getContext('2d');

    // Fill completely black with 100% opacity (Initial Shroud)
    fogCtx.fillStyle = 'rgba(0, 0, 0, 1.0)';
    fogCtx.fillRect(0, 0, FOG_TEX_RES, FOG_TEX_RES);

    fogGrid = new Uint8Array(FOG_RES * FOG_RES); // All 0 (Shroud)

    fogTexture = new THREE.CanvasTexture(fogCanvas);
    fogTexture.generateMipmaps = false;
    fogTexture.minFilter = THREE.LinearFilter;
    fogTexture.magFilter = THREE.LinearFilter;

    // High-resolution terrain-hugging mesh: contours smoothly over 256x256 hills, cliffs, and valleys
    const segments = 160;
    const fogGeo = new THREE.PlaneGeometry(mapSize * 1.02, mapSize * 1.02, segments, segments);
    fogGeo.rotateX(-Math.PI / 2);
    const posAttr = fogGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
        const vx = posAttr.getX(i);
        const vz = posAttr.getZ(i);
        const th = typeof getTerrainHeight === 'function' ? getTerrainHeight(vx, vz) : 0;
        posAttr.setY(i, th + 1.8);
    }
    fogGeo.computeVertexNormals();

    const fogMat = new THREE.MeshBasicMaterial({
            map: fogTexture,
            transparent: true,
            opacity: 1.0,
            depthWrite: false
    });
    fogMesh = new THREE.Mesh(fogGeo, fogMat);
    fogMesh.position.set(0, 0, 0);
    fogMesh.renderOrder = 99;
    // Keep Fog of War hidden on the Main Menu ShellMap diorama & Map Editor so the sunlit 3D battlefield is visible!
    fogMesh.visible = Boolean(typeof isMatchActive !== 'undefined' && isMatchActive && !(typeof isMapEditorMode !== 'undefined' && isMapEditorMode));
    scene.add(fogMesh);
}

function isRadarOnline(faction = (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa')) {
    if (typeof structures === 'undefined') return true;

    // Check power requirement (USA & China need sufficient power grid to operate radar)
    if (faction !== 'gla') {
        let produced = 0, consumed = 0;
        structures.forEach(s => {
                if (s.health <= 0 || s.isBuilding) return;
                if (s.type === 'power') produced += (s.powerUpgraded ? 10 : 5);
                if (s.type === 'nuclearReactor') produced += (s.overcharged ? 15 : 10);
                const drain = (typeof STRUCTURE_POWER_DRAIN !== 'undefined' ? STRUCTURE_POWER_DRAIN[s.type] : 0) || 0;
                consumed += drain;
        });
        if (produced < consumed) return false;
    }

    if (faction === 'usa') {
        return structures.some(s => (s.type === 'center' || s.type === 'commandCenter') && s.health > 0 && !s.isBuilding);
    } else if (faction === 'china') {
        const hasCC = structures.some(s => (s.type === 'center' || s.type === 'commandCenter') && s.health > 0 && !s.isBuilding);
        const hasRadarUpgrade = (typeof researchedTechs !== 'undefined' && researchedTechs.has('radar'));
        return hasCC && hasRadarUpgrade;
    } else if (faction === 'gla') {
        const hasRadarVan = (typeof units !== 'undefined') && units.some(u => u.type === 'radarvan' && u.health > 0);
        return hasRadarVan;
    }
    return true;
}
window.isRadarOnline = isRadarOnline;

// Official INIZH.big ShroudClearingRange values (scaled at 150 SAGE = 32.4 game units => x 0.216)
const INIZH_SHROUD_RANGE = {
    // Heroes & Specialists
    burton: 108, pathfinder: 86, jarmen: 86, blacklotus: 86,
    // Infantry
    ranger: 86, infantry: 86, rocket: 86, missiledefender: 86,
    tankhunter: 86, rpg: 86, rebel: 65, hacker: 65, redguard: 43, mob: 43, worker: 43, pilot: 43, terrorist: 43, hijacker: 43,
    // Scout / Radar / AA Vehicles
    radarvan: 108, drone_scout: 90, ambulance: 86, crawler: 86, gatling: 78, humvee: 69,
    // Aircraft (Official INIZH.big ShroudClearingRange: Comanche/Chinook/Aurora 600 => 130, Raptor 400 => 86, MiG/Stealth 300 => 65)
    comanche: 130, chinook: 130, aurora: 130, raptor: 86, mig: 65, stealthfighter: 65,
    // Battle Tanks & Artillery
    tank: 65, crusader: 65, paladin: 65, battlemaster: 65, scorpion: 65, marauder: 65,
    quad: 65, buggy: 65, inferno: 65, scud: 65, nukecannon: 65, nuketank: 65, truck: 65,
    overlord: 43, dragon: 43, toxintractor: 43, tomahawk: 43, dozer: 43, technical: 54, bombtruck: 43, battlebus: 43,
    // Base Defenses
    stingerSite: 86, patriot: 78, gatlingCannon: 78, bunker: 54, tunnel: 54,
    // Structures
    strategyCenter: 86, commandCenter: 65, center: 65, palace: 65,
    power: 43, nuclearReactor: 43, supplyCenter: 43, supplyStash: 43, supplyDrop: 43,
    barracks: 43, factory: 43, airfield: 43, propagandaCenter: 43, internetCenter: 54,
    blackMarket: 43, particleCannon: 43, nukeSilo: 43, scudStorm: 43, derrick: 43
};

// Official INIZH.big VisionRange values (combat sight / acquisition range, scaled at 150 SAGE = 32.4 game units => x 0.216)
const INIZH_VISION_RANGE = {
    // USA
    chinook: 64.8, comanche: 43.2, raptor: 43.2, stealthfighter: 38.9, aurora: 38.9,
    pathfinder: 43.2, dozer: 43.2, tomahawk: 38.9,
    crusader: 32.4, tank: 32.4, paladin: 32.4, humvee: 32.4, burton: 32.4,
    rocket: 32.4, missiledefender: 32.4, pilot: 32.4, drone_scout: 32.4,
    ranger: 22.0, infantry: 22.0, ambulance: 22.0, truck: 32.4,
    // China
    blacklotus: 64.8, mig: 43.2, inferno: 38.9, nukecannon: 38.9, nuketank: 38.9, crawler: 37.8,
    battlemaster: 32.4, overlord: 32.4, gatling: 32.4, gatlingTank: 32.4,
    tankhunter: 32.4, hacker: 32.4,
    redguard: 22.0, dragon: 22.0, dragonTank: 22.0,
    // GLA
    jarmen: 43.2, radarvan: 43.2, buggy: 38.9, scud: 38.9,
    quad: 32.4, technical: 32.4, bombtruck: 32.4, battlebus: 32.4,
    rebel: 32.4, rpg: 32.4, terrorist: 32.4, mob: 32.4,
    scorpion: 27.0, marauder: 27.0,
    toxintractor: 22.0, hijacker: 22.0, worker: 22.0
};
function getUnitCombatVisionRange(type, fallbackScanRange = 24) {
    if (type && INIZH_VISION_RANGE[type] !== undefined) return INIZH_VISION_RANGE[type];
    return fallbackScanRange || 24;
}
window.INIZH_VISION_RANGE = INIZH_VISION_RANGE;
window.getUnitCombatVisionRange = getUnitCombatVisionRange;

function updateFogOfWar() {
    if (!fogCanvas || !fogCtx || !fogMesh) return;
    const shouldShowFog = Boolean(typeof isMatchActive !== 'undefined' && isMatchActive && !(typeof isMapEditorMode !== 'undefined' && isMapEditorMode));
    fogMesh.visible = shouldShowFog;
    if (!shouldShowFog) return;
    fogUpdateTick++;
    if (fogUpdateTick % 6 !== 0) return; // Smooth ~10Hz fog-of-war updates

    const mapSize = currentMapSize;
    const halfMap = mapSize * 0.5;

    // 1. Demote previous Visible (2) cells to Explored Fog (1)
    for (let i = 0; i < fogGrid.length; i++) {
        if (fogGrid[i] === 2) fogGrid[i] = 1;
    }

    // 2. Mark cells currently in line of sight of local player units and structures
    const radarActive = isRadarOnline(selectedFaction);
    const visionSources = [
        ...units.filter(u => u.health > 0 && !u.garrisonedIn),
        ...structures.filter(s => s.health > 0 && !s.isBuilding)
    ];
    if (typeof worldBuildings !== 'undefined' && worldBuildings.length > 0) {
        for (let wi = 0; wi < worldBuildings.length; wi++) {
            const wb = worldBuildings[wi];
            if (wb && wb.health > 0 && wb.garrisoned && wb.garrisoned.length > 0 &&
                (wb.teamId === playerTeamId || (typeof isFriendly === 'function' && isFriendly({ teamId: playerTeamId }, wb)))) {
                let maxGarrisonRange = 28;
                for (let gi = 0; gi < wb.garrisoned.length; gi++) {
                    const gu = wb.garrisoned[gi];
                    if (gu && gu.health > 0) {
                        maxGarrisonRange = Math.max(maxGarrisonRange, (gu.scanRange || 20) * 1.5);
                    }
                }
                visionSources.push({ position: wb.position, scanRange: maxGarrisonRange });
            }
        }
    }

    // Friendly players can watch each other's units when they have radar!
    if (radarActive) {
        visionSources.push(
            ...enemyUnits.filter(u => u.health > 0 && !u.garrisonedIn && isFriendly({ teamId: playerTeamId }, u)),
            ...enemyStructures.filter(s => s.health > 0 && !s.isBuilding && isFriendly({ teamId: playerTeamId }, s))
        );
    }

    // Satellite Hack I: Continuous orbital recon on all enemy Command Centers
    if (typeof researchedTechs !== 'undefined' && researchedTechs.has('satHack1')) {
        enemyStructures.forEach(es => {
                if (es.health > 0 && (es.type === 'center' || es.type === 'commandCenter')) {
                    visionSources.push({ position: es.position, scanRange: 24 });
                }
        });
    }
    // Satellite Hack II: Full orbital scan of all hostile forces & structures
    if (typeof researchedTechs !== 'undefined' && researchedTechs.has('satHack2')) {
        enemyStructures.forEach(es => {
                if (es.health > 0) visionSources.push({ position: es.position, scanRange: 18 });
        });
        enemyUnits.forEach(eu => {
                if (eu.health > 0 && eu.mesh) visionSources.push({ position: eu.mesh.position, scanRange: 14 });
        });
    }

    const beaconSteps = (typeof window !== 'undefined' && typeof window._simStepsThisFrame === 'number') ? window._simStepsThisFrame : 1;
    for (let i = activeVisionBeacons.length - 1; i >= 0; i--) {
        const b = activeVisionBeacons[i];
        b.life -= beaconSteps;
        visionSources.push({
                position: { x: b.x, z: b.z },
                scanRange: b.radius
        });
        if (b.life <= 0) activeVisionBeacons.splice(i, 1);
    }

    function getOfficialVisionRange(src) {
        if (!src) return 43;
        const t = src.type;
        let v = (t && INIZH_SHROUD_RANGE[t] !== undefined)
            ? INIZH_SHROUD_RANGE[t]
            : (src.isAir ? 72 : (src.scanRange ? Math.max(43, src.scanRange * 1.15) : (src.radius ? src.radius + 32 : 43)));
        if (src.drone && src.drone.type === 'scout') v *= 1.35;
        if (typeof battlePlan !== 'undefined' && battlePlan === 'search' && !src.isAI) v *= 1.2;
        return v;
    }

    visionSources.forEach(src => {
            const pos = src.position || src.mesh.position;
            const range = getOfficialVisionRange(src);
            const cx = Math.floor(((pos.x + halfMap) / mapSize) * FOG_RES);
            const cy = Math.floor(((pos.z + halfMap) / mapSize) * FOG_RES);
            const rCells = Math.ceil((range / mapSize) * FOG_RES);

            const r2 = rCells * rCells;
            const minX = Math.max(0, cx - rCells);
            const maxX = Math.min(FOG_RES - 1, cx + rCells);
            const minY = Math.max(0, cy - rCells);
            const maxY = Math.min(FOG_RES - 1, cy + rCells);

            for (let y = minY; y <= maxY; y++) {
                const dy = y - cy;
                const idxRow = y * FOG_RES;
                for (let x = minX; x <= maxX; x++) {
                    const dx = x - cx;
                    if (dx * dx + dy * dy <= r2) {
                        fogGrid[idxRow + x] = 2; // Direct Line of Sight!
                    }
                }
            }
    });

    // 3. Render Shroud & Fog at 512x512 with ImageData pixel buffer (avoids 16k fillRect calls/frame)
    if (_fogRawCtx) {
        if (!_fogRawCtx._imgData || _fogRawCtx._imgData.width !== FOG_RES) {
            _fogRawCtx._imgData = _fogRawCtx.createImageData(FOG_RES, FOG_RES);
        }
        const imgData = _fogRawCtx._imgData;
        const d = imgData.data;
        const total = FOG_RES * FOG_RES;
        for (let idx = 0; idx < total; idx++) {
            const p = idx << 2;
            if (fogGrid[idx] === 0) {
                d[p] = 0; d[p + 1] = 0; d[p + 2] = 0; d[p + 3] = 255;
            } else {
                d[p] = 10; d[p + 1] = 14; d[p + 2] = 18; d[p + 3] = 158;
            }
        }
        _fogRawCtx.putImageData(imgData, 0, 0);
        fogCtx.clearRect(0, 0, FOG_TEX_RES, FOG_TEX_RES);
        if ('filter' in fogCtx) fogCtx.filter = 'blur(6px)';
        fogCtx.drawImage(_fogRawCanvas, 0, 0, FOG_TEX_RES, FOG_TEX_RES);
        if ('filter' in fogCtx) fogCtx.filter = 'none';
    } else {
        fogCtx.clearRect(0, 0, FOG_TEX_RES, FOG_TEX_RES);
        fogCtx.fillStyle = 'rgba(10, 14, 18, 0.62)';
        fogCtx.fillRect(0, 0, FOG_TEX_RES, FOG_TEX_RES);
    }

    // 4. Punch soft high-res circular vision holes for currently visible areas
    fogCtx.globalCompositeOperation = 'destination-out';

    visionSources.forEach(src => {
            const pos = src.position || src.mesh.position;
            const range = getOfficialVisionRange(src);
            const cx = ((pos.x + halfMap) / mapSize) * FOG_TEX_RES;
            const cy = ((pos.z + halfMap) / mapSize) * FOG_TEX_RES;
            const rPx = (range / mapSize) * FOG_TEX_RES;

            const grad = fogCtx.createRadialGradient(cx, cy, rPx * 0.40, cx, cy, rPx * 1.05);
            grad.addColorStop(0, 'rgba(0, 0, 0, 1.0)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
            fogCtx.fillStyle = grad;
            fogCtx.beginPath();
            fogCtx.arc(cx, cy, rPx * 1.05, 0, Math.PI * 2);
            fogCtx.fill();
    });
    fogCtx.globalCompositeOperation = 'source-over';

    fogTexture.needsUpdate = true;

    // 5. Hide Hostile Units & Hostile Structures when out of direct Line of Sight OR concealed in Stealth! (Allies stay visible)
    const curTick = (typeof buildingTick !== 'undefined') ? buildingTick : 0;
    enemyUnits.forEach(enemy => {
            if (!enemy.mesh) return;
            if (isFriendly({ teamId: playerTeamId }, enemy)) {
                enemy.mesh.visible = true;
                return;
            }
            const isStealthHidden = !!(enemy.isStealthed && !(enemy.revealedUntil && enemy.revealedUntil > curTick));
            if (isStealthHidden) {
                enemy.mesh.visible = false;
                return;
            }
            const cx = Math.floor(((enemy.mesh.position.x + halfMap) / mapSize) * FOG_RES);
            const cy = Math.floor(((enemy.mesh.position.z + halfMap) / mapSize) * FOG_RES);
            const isVisible = (cx >= 0 && cx < FOG_RES && cy >= 0 && cy < FOG_RES)
            ? (fogGrid[cy * FOG_RES + cx] === 2)
            : false;
            enemy.mesh.visible = isVisible;
    });

    enemyStructures.forEach(es => {
            if (!es.mesh) return;
            if (isFriendly({ teamId: playerTeamId }, es)) {
                es.mesh.visible = true;
                return;
            }
            const isStealthHidden = !!(es.isStealthed && !(es.revealedUntil && es.revealedUntil > curTick));
            if (isStealthHidden) {
                es.mesh.visible = false;
                return;
            }
            const cx = Math.floor(((es.position.x + halfMap) / mapSize) * FOG_RES);
            const cy = Math.floor(((es.position.z + halfMap) / mapSize) * FOG_RES);
            const isVisible = (cx >= 0 && cx < FOG_RES && cy >= 0 && cy < FOG_RES)
            ? (fogGrid[cy * FOG_RES + cx] >= 1) // Structures visible once explored
            : false;
            es.mesh.visible = isVisible;
    });

    // 6. Hide unexplored resource points, neutral tech structures, civilian buildings, and map props under Shroud
    if (typeof supplyPoints !== 'undefined' && Array.isArray(supplyPoints)) {
        for (let i = 0; i < supplyPoints.length; i++) {
            const sp = supplyPoints[i];
            if (sp && sp.mesh && sp.position) sp.mesh.visible = isPositionExplored(sp.position.x, sp.position.z);
        }
    }
    if (typeof window !== 'undefined' && Array.isArray(window.neutralStructures)) {
        for (let i = 0; i < window.neutralStructures.length; i++) {
            const ns = window.neutralStructures[i];
            if (ns && ns.mesh && ns.position) ns.mesh.visible = isPositionExplored(ns.position.x, ns.position.z);
        }
    }
    if (typeof worldBuildings !== 'undefined' && Array.isArray(worldBuildings)) {
        for (let i = 0; i < worldBuildings.length; i++) {
            const wb = worldBuildings[i];
            if (wb && wb.mesh && wb.position) wb.mesh.visible = isPositionExplored(wb.position.x, wb.position.z);
        }
    }
    if (typeof mapPropsGroup !== 'undefined' && mapPropsGroup && Array.isArray(mapPropsGroup.children)) {
        for (let i = 0; i < mapPropsGroup.children.length; i++) {
            const ch = mapPropsGroup.children[i];
            if (!ch || (ch.userData && ch.userData.isWaterMesh)) continue;
            ch.visible = isPositionExplored(ch.position.x, ch.position.z);
        }
    }
}

function isPositionExplored(x, z) {
    if (!fogGrid) return true;
    const mapSize = currentMapSize || 1500;
    const halfMap = mapSize * 0.5;
    const cx = Math.floor(((x + halfMap) / mapSize) * FOG_RES);
    const cy = Math.floor(((z + halfMap) / mapSize) * FOG_RES);
    if (cx < 0 || cx >= FOG_RES || cy < 0 || cy >= FOG_RES) return false;
    return fogGrid[cy * FOG_RES + cx] >= 1;
}
function isPositionVisible(x, z) {
    if (!fogGrid) return true;
    const mapSize = currentMapSize || 1500;
    const halfMap = mapSize * 0.5;
    const cx = Math.floor(((x + halfMap) / mapSize) * FOG_RES);
    const cy = Math.floor(((z + halfMap) / mapSize) * FOG_RES);
    if (cx < 0 || cx >= FOG_RES || cy < 0 || cy >= FOG_RES) return false;
    return fogGrid[cy * FOG_RES + cx] === 2;
}
if (typeof window !== 'undefined') {
    window.isPositionExplored = isPositionExplored;
    window.isPositionVisible = isPositionVisible;
}

const factionCatalog = {
    usa: {
        label: 'USA', builder: 'dozer', starter: ['dozer'],
        barracks: {
            infantry: ['Ranger', 225, 'Assault rifleman with flashbangs & capture ability.'],
            rocket: ['Missile Defender', 300, 'Laser-guided anti-armor & anti-air missile infantry.'],
            pathfinder: ['Pathfinder', 600, 'Elite sniper infantry, detects stealth.'],
            burton: ['Colonel Burton', 1500, 'Elite commando with C4 charges and combat knife.']
        },
        factory: {
            crusader: ['Crusader Tank', 900, 'Main battle tank with 105mm cannon.'],
            paladin: ['Paladin Tank', 1100, 'Advanced battle tank with point-defense laser.'],
            humvee: ['Humvee', 700, 'Fast scout transport. Carries 5 infantry.'],
            ambulance: ['Ambulance', 600, 'Field medical unit. Cleans toxins & heals nearby troops.'],
            tomahawk: ['Tomahawk Missile', 1200, 'Long-range cruise missile mobile artillery (100-350 range, blind spot).']
        },
        airfield: {
            raptor: ['Raptor', 1400, 'Supersonic strike jet with laser-guided missiles.'],
            stealthfighter: ['Stealth Fighter', 1600, 'Radar-invisible ground attack stealth jet.'],
            aurora: ['Aurora Bomber', 2500, 'Mach-4 supersonic invincible bomb-run aircraft.'],
            comanche: ['Comanche', 1500, 'Attack gunship helicopter with rocket pods.']
        },
        supplyCenter: {
            chinook: ['Chinook', 1200, 'Heavy supply and troop transport helicopter.']
        },
        commandCenter: {
            dozer: ['Construction Dozer', 1000, 'Constructs and repairs USA military installations.']
        },
        support: ['Construction Dozer', 'Pilot (unbuildable)', 'Scout Drone (attachment)', 'Battle Drone (attachment)']
    },
    china: {
        label: 'China', builder: 'dozer', starter: ['dozer'],
        barracks: {
            redguard: ['Red Guard', 300, 'Assault rifle infantry trained in pairs.'],
            tankhunter: ['Tank Hunter', 300, 'Anti-armor rocket infantry with TNT charges.'],
            hacker: ['Hacker', 625, 'Stealth hacker, disables buildings & drains internet funds.'],
            blacklotus: ['Black Lotus', 1500, 'Elite hacker hero, captures structures & disables armor.']
        },
        factory: {
            battlemaster: ['Battle Master Tank', 800, 'Standard frontline battle tank.'],
            dragon: ['Dragon Tank', 800, 'Flamethrower tank, flushes out garrisoned structures.'],
            gatling: ['Gatling Tank', 800, 'Twin 20mm rotary anti-air/anti-infantry tank.'],
            crawler: ['Troop Crawler', 1400, 'Armored personnel carrier with 8 Red Guard soldiers.'],
            overlord: ['Overlord Tank', 2000, 'Super-heavy double-barrel dreadnought tank.'],
            inferno: ['Inferno Cannon', 900, 'Napalm siege artillery creating firestorms.'],
            nukecannon: ['Nuke Tank (Nuke Cannon)', 1600, 'Mobile tactical nuclear siege tank firing atomic shells.']
        },
        airfield: {
            mig: ['MiG-29 Fighter', 1200, 'High-speed interceptor jet with napalm missiles.']
        },
        supplyCenter: {
            truck: ['Supply Truck', 600, 'Gathers supplies from resource depots.']
        },
        commandCenter: {
            dozer: ['Construction Dozer', 1000, 'Constructs and repairs Chinese military installations.']
        },
        support: ['Construction Dozer']
    },
    gla: {
        label: 'GLA', builder: 'worker', starter: ['worker'],
        barracks: {
            rebel: ['Rebel', 150, 'Guerrilla assault infantry with capture ability.'],
            rpg: ['RPG Trooper', 300, 'Anti-armor guerrilla rocket trooper.'],
            terrorist: ['Terrorist', 200, 'Suicide explosive infantry with devastating blast.'],
            mob: ['Angry Mob', 800, 'Armed crowd throwing Molotov cocktails and bullets.'],
            hijacker: ['Hijacker', 400, 'Stealth commando, steals enemy vehicles on contact.'],
            jarmen: ['Jarmen Kell', 1500, 'Elite sniper hero, snipes vehicle drivers leaving them empty.']
        },
        factory: {
            radarvan: ['Radar Van', 500, 'Mobile radar van providing map radar & stealth detection.'],
            technical: ['Technical', 500, 'Fast guerrilla pickup with mounted heavy machine gun.'],
            scorpion: ['Scorpion Tank', 600, 'Light combat tank with rocket upgrade.'],
            quad: ['Quad Cannon', 700, 'Four 23mm anti-aircraft and anti-infantry autocannons.'],
            toxintractor: ['Toxin Tractor', 600, 'Corrosive chemical sprayer, cleans garrisoned buildings.'],
            marauder: ['Marauder Tank', 800, 'Heavy salvage tank with double-cannon upgrades.'],
            buggy: ['Rocket Buggy', 900, 'High-speed hit-and-run mobile rocket artillery.'],
            bombtruck: ['Bomb Truck', 1200, 'Disguised suicide vehicle packed with explosives.'],
            scud: ['SCUD Launcher', 1200, 'Mobile tactical ballistic missile with anthrax payload.'],
            battlebus: ['Battle Bus', 1000, 'Armored garrison transport bus with 8 firing ports and second-life bunker.']
        },
        airfield: {},
        supplyCenter: {
            worker: ['Worker', 200, 'Gathers supplies and builds GLA installations.']
        },
        commandCenter: {
            worker: ['Worker', 200, 'Gathers supplies and builds GLA installations.']
        },
        support: ['Worker (builder and resource gatherer)']
    }
};

const buildingUpgradesCatalog = {
    usa: {
        center: [
            { id: 'radar', name: 'RADAR SYSTEM', cost: 500, desc: 'Activates tactical mini-map radar telemetry.' },
            { id: 'spyDrone', name: 'SPY DRONE SCAN', cost: 200, isAbility: true, desc: 'Deploys an orbital scan over target coordinates, clearing shroud and detecting stealth.' }
        ],
        commandCenter: [
            { id: 'radar', name: 'RADAR SYSTEM', cost: 500, desc: 'Activates tactical mini-map radar telemetry.' },
            { id: 'spyDrone', name: 'SPY DRONE SCAN', cost: 200, isAbility: true, desc: 'Deploys an orbital scan over target coordinates, clearing shroud and detecting stealth.' }
        ],
        power: [
            { id: 'controlRods', name: 'CONTROL RODS', cost: 300, isAddon: true, desc: 'Installs advanced control rods to permanently double power output (+100%).' }
        ],
        barracks: [
            { id: 'captureBuilding', name: 'CAPTURE BUILDING', cost: 1000, desc: 'Enables Rangers and infantry to capture hostile and neutral structures.' },
            { id: 'flashbang', name: 'FLASHBANG GRENADES', cost: 800, desc: 'Equips Rangers with flashbangs to instantly breach & clear garrisons.' },
            { id: 'pathfinder', name: 'PATHFINDER SNIPER', cost: 1200, desc: 'Unlocks elite stealth snipers capable of eliminating hostile infantry from long range.' }
        ],
        factory: [
            { id: 'towMissile', name: 'TOW MISSILES', cost: 800, desc: 'Equips Humvees with roof-mounted anti-armor TOW missiles (+35 damage).' }
        ],
        airfield: [
            { id: 'laserMissiles', name: 'LASER-GUIDED MISSILES', cost: 1000, desc: 'Increases Raptor, Comanche, and Stealth Fighter missile damage by +25%.' },
            { id: 'rocketPods', name: 'ROCKET PODS', cost: 800, desc: 'Equips Comanche gunships with 40mm rocket pod volleys.' },
            { id: 'countermeasures', name: 'COUNTERMEASURES', cost: 1000, desc: 'Aircraft deploy flares to deflect 40% of incoming anti-air missile attacks.' },
            { id: 'bunkerBusters', name: 'BUNKER BUSTERS', cost: 500, desc: 'Equips Aurora Bombers to penetrate & destroy fortified bunkers.' }
        ],
        strategyCenter: [
            { id: 'planBombard', name: 'BOMBARDMENT', cost: 0, isStance: true, stance: 'bombard', desc: 'Strategy Stance: +20% firepower across all player combat forces.' },
            { id: 'planHold', name: 'HOLD THE LINE', cost: 0, isStance: true, stance: 'hold', desc: 'Strategy Stance: +20% armor & damage resistance for all units.' },
            { id: 'planSearch', name: 'SEARCH & DESTROY', cost: 0, isStance: true, stance: 'search', desc: 'Strategy Stance: +20% sight range and weapon range.' },
            { id: 'compositeArmor', name: 'COMPOSITE ARMOR', cost: 1200, desc: 'Increases Crusader and Paladin tank armor and HP by +25% (+100 HP).' },
            { id: 'droneArmor', name: 'DRONE ARMOR', cost: 500, desc: 'Increases all vehicle and base drones armor and durability by +25%.' },
            { id: 'advancedTraining', name: 'ADVANCED TRAINING', cost: 800, desc: 'Doubles combat experience gain, rapidly promoting units to Veteran rank.' },
            { id: 'chemicalSuits', name: 'CHEMICAL SUITS', cost: 800, desc: 'USA forces gain +50% resistance to toxin, anthrax, and radiation damage.' },
            { id: 'supplyLines', name: 'SUPPLY LINES', cost: 800, desc: 'Increases Supply Center and Supply Drop Zone crate income by +10% ($1,500 -> $1,650).' }
        ],
        particleCannon: [
            { id: 'superweapon', name: 'PARTICLE BEAM STRIKE', cost: 0, isSuperweapon: true, desc: 'Channels space-based orbital particle beam weapon at target coordinates anywhere on the battlefield.' }
        ]
    },
    china: {
        center: [
            { id: 'radar', name: 'RADAR GRID', cost: 500, desc: 'Activates tactical mini-map radar telemetry.' }
        ],
        commandCenter: [
            { id: 'radar', name: 'RADAR GRID', cost: 500, desc: 'Activates tactical mini-map radar telemetry.' }
        ],
        nuclearReactor: [
            { id: 'overcharge', name: 'REACTOR OVERCHARGE', cost: 0, isToggle: true, desc: 'Toggles +50% power output boost (15 PWR) at the cost of slow radiation decay.' },
            { id: 'mines', name: 'PERIMETER MINES', cost: 300, isAddon: true, desc: 'Deploys a ring of defensive landmines around the reactor.' }
        ],
        barracks: [
            { id: 'captureBuilding', name: 'CAPTURE BUILDING', cost: 1000, desc: 'Enables Red Guard to capture hostile and neutral structures.' },
            { id: 'redGuardTraining', name: 'RED GUARD TRAINING', cost: 800, desc: 'All newly trained Red Guard deploy with Veteran rank (★).' },
            { id: 'mines', name: 'PERIMETER MINES', cost: 300, isAddon: true, desc: 'Deploys a ring of defensive landmines around the barracks.' }
        ],
        factory: [
            { id: 'chainGuns', name: 'CHAIN GUNS', cost: 1000, desc: 'Equips Gatling weapons with high-velocity link barrels (+25% damage).' },
            { id: 'blackNapalm', name: 'BLACK NAPALM', cost: 1000, desc: 'Increases Dragon Tank and Inferno Cannon fire damage by +30%.' },
            { id: 'autoloader', name: 'AUTOLOADER TECH', cost: 800, desc: 'Increases Battlemaster Tank rate of fire by +25%.' },
            { id: 'mines', name: 'PERIMETER MINES', cost: 300, isAddon: true, desc: 'Deploys a ring of defensive landmines around the factory.' }
        ],
        airfield: [
            { id: 'migArmor', name: 'MIG COMPOSITE ARMOR', cost: 1000, desc: 'Increases MiG-29 armor and maximum HP by +25%.' },
            { id: 'blackNapalm', name: 'BLACK NAPALM', cost: 1000, desc: 'Equips MiGs with high-temperature black napalm missiles (+30% damage).' },
            { id: 'mines', name: 'PERIMETER MINES', cost: 300, isAddon: true, desc: 'Deploys a ring of defensive landmines around the airfield.' }
        ],
        propagandaCenter: [
            { id: 'nationalism', name: 'NATIONALISM DOCTRINE', cost: 1000, desc: 'Inspires Red Army with patriotic fervor, increasing Horde bonus (+35% damage, +40% fire rate).' },
            { id: 'subliminal', name: 'SUBLIMINAL MESSAGING', cost: 800, desc: 'Doubles Speaker Tower and Propaganda Tower healing rate (6 HP/s) and boosts range.' },
            { id: 'mines', name: 'PERIMETER MINES', cost: 300, isAddon: true, desc: 'Deploys a ring of defensive landmines around the propaganda center.' }
        ],
        internetCenter: [
            { id: 'satHack1', name: 'SATELLITE HACK I', cost: 1000, desc: 'Orbital hack continuously reveals all enemy Command Centers on radar.' },
            { id: 'satHack2', name: 'SATELLITE HACK II', cost: 1500, desc: 'Reveals all enemy combat vehicles and structure positions on mini-map.' },
            { id: 'empPulse', name: 'EMP SPY DISRUPTION', cost: 500, isAbility: true, desc: 'Discharges an electromagnetic pulse disabling power and vehicles in target sector for 12s.' },
            { id: 'mines', name: 'PERIMETER MINES', cost: 300, isAddon: true, desc: 'Deploys a ring of defensive landmines around the internet center.' }
        ],
        nukeSilo: [
            { id: 'superweapon', name: 'NUCLEAR MISSILE STRIKE', cost: 0, isSuperweapon: true, desc: 'Launches thermonuclear ballistic missile causing catastrophic area destruction and radiation.' },
            { id: 'uraniumShells', name: 'URANIUM SHELLS', cost: 1200, desc: 'Grants +25% damage to Battlemaster and Overlord tank cannons.' },
            { id: 'nuclearTanks', name: 'NUCLEAR ENGINES', cost: 800, desc: 'Increases Battlemaster and Overlord tank movement speed by +25%.' },
            { id: 'mines', name: 'PERIMETER MINES', cost: 300, isAddon: true, desc: 'Deploys a ring of defensive landmines around the silo.' }
        ],
        bunker: [
            { id: 'mines', name: 'PERIMETER MINES', cost: 300, isAddon: true, desc: 'Deploys perimeter explosive landmines around the bunker.' },
            { id: 'neutronMines', name: 'NEUTRON MINES', cost: 500, isAddon: true, desc: 'Zero Hour upgrade: eliminates vehicle crews on contact and destroys infantry.' }
        ],
        speakerTower: [
            { id: 'mines', name: 'PERIMETER MINES', cost: 300, isAddon: true, desc: 'Deploys perimeter explosive landmines around the speaker tower.' },
            { id: 'neutronMines', name: 'NEUTRON MINES', cost: 500, isAddon: true, desc: 'Zero Hour upgrade: eliminates vehicle crews on contact and destroys infantry.' }
        ],
        gatlingCannon: [
            { id: 'mines', name: 'PERIMETER MINES', cost: 300, isAddon: true, desc: 'Deploys perimeter explosive landmines around the gatling cannon.' },
            { id: 'neutronMines', name: 'NEUTRON MINES', cost: 500, isAddon: true, desc: 'Zero Hour upgrade: eliminates vehicle crews on contact and destroys infantry.' }
        ]
    },
    gla: {
        center: [
            { id: 'radarVanScan', name: 'RADAR VAN SCAN', cost: 200, isAbility: true, desc: 'Uplinks to Radar Van to reveal a targeted sector through fog of war.' },
            { id: 'sneakAttack', name: 'SNEAK ATTACK NETWORK', cost: 1000, isAbility: true, desc: 'Erects an instant sneak attack tunnel breach at target coordinates.' }
        ],
        commandCenter: [
            { id: 'radarVanScan', name: 'RADAR VAN SCAN', cost: 200, isAbility: true, desc: 'Uplinks to Radar Van to reveal a targeted sector through fog of war.' },
            { id: 'sneakAttack', name: 'SNEAK ATTACK NETWORK', cost: 1000, isAbility: true, desc: 'Erects an instant sneak attack tunnel breach at target coordinates.' }
        ],
        barracks: [
            { id: 'captureBuilding', name: 'CAPTURE BUILDING', cost: 1000, desc: 'Enables Rebels to capture enemy and neutral structures.' },
            { id: 'boobyTrap', name: 'BOOBY TRAP', cost: 500, desc: 'Enables Rebels to rig structures with lethal explosive charges.' },
            { id: 'camouflage', name: 'CAMOUFLAGE REBELS', cost: 1000, desc: 'Grants Rebel infantry permanent stealth while stationary.' }
        ],
        factory: [
            { id: 'scorpionRocket', name: 'SCORPION ROCKET', cost: 1000, desc: 'Equips Scorpion Tanks with roof-mounted anti-armor rockets (+65 damage).' },
            { id: 'junkRepair', name: 'JUNK REPAIR', cost: 1000, desc: 'Enables all GLA vehicles to passively auto-repair hull damage (+2 HP/s).' }
        ],
        palace: [
            { id: 'fortifiedStructures', name: 'FORTIFIED STRUCTURES', cost: 1000, desc: 'Increases HP and armor of all GLA buildings and GLA Holes by +25%.' },
            { id: 'armTheMob', name: 'ARM THE MOB', cost: 1000, desc: 'Equips Angry Mobs with AK-47 assault rifles (+100% damage output).' },
            { id: 'toxinShells', name: 'TOXIN SHELLS', cost: 1000, desc: 'Tank shells release toxic clouds that poison enemy infantry.' },
            { id: 'anthraxBeta', name: 'ANTHRAX BETA', cost: 1200, desc: 'Upgrades Anthrax toxin to Beta strain (+25% damage, glowing emerald chemical clouds).' },
            { id: 'demolitions', name: 'DEMOLITION SATCHELS', cost: 800, desc: 'Equips combat units with demolition charges allowing manual or death detonation.' }
        ],
        blackMarket: [
            { id: 'apBullets', name: 'ARMOR-PIERCING BULLETS', cost: 1000, desc: 'Increases bullet damage by +25% for Rebels, Technicals, and Quad Cannons.' },
            { id: 'apRockets', name: 'ARMOR-PIERCING ROCKETS', cost: 1200, desc: 'Increases rocket damage by +25% for RPG Troopers, Scorpion Tanks, and Buggies.' },
            { id: 'junkRepair', name: 'JUNK REPAIR', cost: 1000, desc: 'Equips all GLA vehicles with passive scrap self-regeneration.' },
            { id: 'buggyAmmo', name: 'BUGGY AMMO CHAINS', cost: 800, desc: 'Increases Rocket Buggy rocket salvo capacity by +50% (9 rockets per volley).' },
            { id: 'workerShoes', name: 'WORKER SHOES', cost: 500, desc: 'Increases Worker movement speed by +25% and supply harvest rate.' }
        ],
        tunnel: [
            { id: 'camoNetting', name: 'CAMO NETTING', cost: 400, isAddon: true, desc: 'Permanently stealths this Tunnel Network until it engages enemies.' }
        ],
        scudStorm: [
            { id: 'superweapon', name: 'SCUD STORM SALVO', cost: 0, isSuperweapon: true, desc: 'Fires a 9-missile ballistic SCUD rocket salvo loaded with deadly Anthrax Beta.' },
            { id: 'camoNetting', name: 'CAMO NETTING', cost: 400, isAddon: true, desc: 'Permanently stealths the SCUD Storm with camouflage netting.' }
        ],
        stingerSite: [
            { id: 'camoNetting', name: 'CAMO NETTING', cost: 400, isAddon: true, desc: 'Permanently stealths this Stinger Site until it fires upon an aircraft.' }
        ],
        demoTrap: [
            { id: 'camoNetting', name: 'CAMO NETTING', cost: 400, isAddon: true, desc: 'Conceals the Demo Trap with stealth netting until detonation.' }
        ],
        fakeCommandCenter: [
            { id: 'upgradeToReal', name: 'UPGRADE TO REAL COMMAND CENTER', cost: 1500, isAddon: true, desc: 'Converts this decoy fake command center into a real functional Command Center.' }
        ],
        fakeBarracks: [
            { id: 'upgradeToReal', name: 'UPGRADE TO REAL BARRACKS', cost: 200, isAddon: true, desc: 'Converts this decoy fake barracks into a real functional Barracks.' }
        ],
        fakeArmsDealer: [
            { id: 'upgradeToReal', name: 'UPGRADE TO REAL ARMS DEALER', cost: 350, isAddon: true, desc: 'Converts this decoy fake arms dealer into a real functional Arms Dealer.' }
        ]
    }
};
const factionBuildings = {
    usa: [
        ['power', 'Cold Fusion Reactor', 800], ['barracks', 'Barracks', 600], ['factory', 'War Factory', 2000],
        ['supplyCenter', 'Supply Center', 2000], ['supplyDrop', 'Supply Drop Zone', 2500], ['airfield', 'Air Field', 1000],
        ['strategyCenter', 'Strategy Center', 2500], ['detentionCamp', 'Detention Camp', 1000],
        ['patriot', 'Patriot Missile System', 1000], ['particleCannon', 'Particle Cannon', 5000]
    ],
    china: [
        ['barracks', 'Barracks', 500], ['factory', 'War Factory', 2000], ['supplyCenter', 'Supply Center', 1500],
        ['airfield', 'Air Field', 1000], ['internetCenter', 'Internet Center', 2500], ['nuclearReactor', 'Nuclear Reactor', 1000],
        ['propagandaCenter', 'Propaganda Center', 2000], ['bunker', 'Bunker', 400], ['gatlingCannon', 'Gatling Cannon', 1200],
        ['speakerTower', 'Speaker Tower', 500], ['nukeSilo', 'Nuclear Missile Silo', 5000]
    ],
    gla: [
        ['barracks', 'Barracks', 500], ['factory', 'Arms Dealer', 2500], ['supplyStash', 'Supply Stash', 1500],
        ['blackMarket', 'Black Market', 2500], ['tunnel', 'Tunnel Network', 800], ['stingerSite', 'Stinger Site', 900],
        ['demoTrap', 'Demo Trap', 400], ['palace', 'Palace', 2500], ['fakeCommandCenter', 'Fake Command Center', 500], ['fakeBarracks', 'Fake Barracks', 125],
        ['fakeArmsDealer', 'Fake Arms Dealer', 625], ['scudStorm', 'SCUD Storm', 5000]
    ]
};
let unitRoster = {};

// Official C&C Generals: Zero Hour 12 Generals Roster (PlayerTemplate.ini)
const ZERO_HOUR_GENERALS = {
    usa:             { id: 'usa',             baseFaction: 'usa',   name: 'USA',                        commander: 'USA High Command',              portraitKey: 'general_usa',             desc: 'Balanced USA arsenal with Crusaders, Paladins, Tomahawks, and full Air Force.', costMods: {}, structCostMods: {}, freePowers: [] },
    usa_air:         { id: 'usa_air',         baseFaction: 'usa',   name: 'USA Air Force General',      commander: 'Gen. Malcolm "Ace" Granger',    portraitKey: 'general_usa_air',         desc: 'King Raptor & Stealth Fighter doctrine: Aircraft cost -20%, +20% HP, and start with laser countermeasures.', costMods: { raptor: 0.8, stealthfighter: 0.8, aurora: 0.8, comanche: 0.8, chinook: 0.8 }, structCostMods: { airfield: 0.8 }, freePowers: ['stealthFighterUnlock'] },
    usa_laser:       { id: 'usa_laser',       baseFaction: 'usa',   name: 'USA Laser General',          commander: 'Gen. "Pinpoint" Townes',        portraitKey: 'general_usa_laser',       desc: 'Directed-energy armor & defenses: Laser Tanks and Laser Patriot batteries deal +25% beam damage.', costMods: { crusader: 0.9, paladin: 0.9 }, structCostMods: { patriot: 0.9 }, freePowers: ['paladinUnlock'] },
    usa_superweapon: { id: 'usa_superweapon', baseFaction: 'usa',   name: 'USA Superweapon General',    commander: 'Gen. Alexis Alexander',         portraitKey: 'general_usa_superweapon', desc: 'Particle Cannon costs $2,500 (-50%), EMP Patriot batteries disable enemy vehicles, and Aurora Alpha bombers.', costMods: { aurora: 0.85 }, structCostMods: { particleCannon: 0.5, patriot: 0.8 }, freePowers: ['pathfinderUnlock'] },
    china:           { id: 'china',           baseFaction: 'china', name: 'China',                      commander: 'PLA High Command',              portraitKey: 'general_china',           desc: 'Balanced PLA forces with Battlemasters, Overlords, Inferno & Nuke Cannons, and MiG air support.', costMods: {}, structCostMods: {}, freePowers: [] },
    china_tank:      { id: 'china_tank',      baseFaction: 'china', name: 'China Tank General',         commander: 'Gen. Ta Hun Kwai',              portraitKey: 'general_china_tank',      desc: 'Emperor Overlord & armored division: All tanks cost -20%, deploy at Veteran rank, and start with Autoloaders.', costMods: { battlemaster: 0.8, overlord: 0.8, gatling: 0.8, dragon: 0.8 }, structCostMods: {}, freePowers: [] },
    china_infantry:  { id: 'china_infantry',  baseFaction: 'china', name: 'China Infantry General',     commander: 'Gen. "Anvil" Shin Fai',         portraitKey: 'general_china_infantry',  desc: 'Mini-Gunner & Assault Crawler doctrine: All infantry deploy at Veteran rank (+25% HP) and Crawlers cost -20%.', costMods: { redguard: 0.8, tankhunter: 0.85, crawler: 0.8, hacker: 0.85 }, structCostMods: { bunker: 0.75 }, freePowers: ['redGuardTraining'] },
    china_nuke:      { id: 'china_nuke',      baseFaction: 'china', name: 'China Nuke General',         commander: 'Gen. Tsing Shi Tao',            portraitKey: 'general_china_nuke',      desc: 'Atomic warfare specialist: Tanks start with Uranium Shells & Nuclear Engines (+25% speed/damage); Nuke Cannon unlocked at Rank 1.', costMods: { nukecannon: 0.85 }, structCostMods: { nukeSilo: 0.8, nuclearReactor: 0.8 }, freePowers: ['nukeCannonUnlock'] },
    gla:             { id: 'gla',             baseFaction: 'gla',   name: 'GLA',                        commander: 'GLA High Council',              portraitKey: 'general_gla',             desc: 'Balanced guerrilla arsenal with Scorpion & Marauder tanks, Toxin weapons, and SCUD Storm.', costMods: {}, structCostMods: {}, freePowers: [] },
    gla_toxin:       { id: 'gla_toxin',       baseFaction: 'gla',   name: 'GLA Toxin General',          commander: 'Dr. Thrax',                     portraitKey: 'general_gla_toxin',       desc: 'Anthrax Gamma chemical arsenal: All tanks & rockets start with Toxin Shells and Anthrax Beta (+25% toxin damage).', costMods: { toxintractor: 0.8, scud: 0.85 }, structCostMods: { scudStorm: 0.85 }, freePowers: ['scudUnlock'] },
    gla_demo:        { id: 'gla_demo',        baseFaction: 'gla',   name: 'GLA Demolition General',     commander: 'Gen. Rodall "Demo" Juhziz',     portraitKey: 'general_gla_demo',        desc: 'High-explosive insurgency: All units start with Demolitions; Terrorists, Bomb Trucks & Demo Traps cost -20% (+35% blast damage).', costMods: { terrorist: 0.8, bombtruck: 0.8, rpg: 0.85 }, structCostMods: { demoTrap: 0.75 }, freePowers: [] },
    gla_stealth:     { id: 'gla_stealth',     baseFaction: 'gla',   name: 'GLA Stealth General',        commander: 'Prince Kassad',                 portraitKey: 'general_gla_stealth',     desc: 'Covert ambush warfare: Rebels start camouflaged, Hijackers are unlocked at Rank 1 and stay stealthed while moving.', costMods: { hijacker: 0.75, rebel: 0.85, quad: 0.9 }, structCostMods: { tunnel: 0.8 }, freePowers: ['hijackerUnlock'] }
};
let selectedGeneral = 'usa';
window.ZERO_HOUR_GENERALS = ZERO_HOUR_GENERALS;
window.selectedGeneral = selectedGeneral;

function renderGeneralSelectorCards(baseFaction) {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('zh-generals-selector');
    if (!container) return;
    const fac = (baseFaction || selectedFaction || 'usa').toLowerCase();
    const gens = Object.values(ZERO_HOUR_GENERALS).filter(g => g.baseFaction === fac);
    if (gens.length === 0) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = gens.map(g => {
        const isAct = (selectedGeneral === g.id);
        const port = (window.OFFICIAL_UI_ASSETS && window.OFFICIAL_UI_ASSETS[g.portraitKey]) || '';
        return `<button type="button" class="rts-btn zh-general-card ${isAct ? 'active' : ''}" data-general="${g.id}" onclick="selectGeneral('${g.id}')" title="${g.commander}: ${g.desc}" style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;margin:2px;font-size:11px;border:1px solid ${isAct ? '#ffd700' : '#3a4a3e'};background:${isAct ? 'rgba(255,215,0,0.16)' : 'rgba(16,24,20,0.85)'};">
            ${port ? `<img src="${port}" alt="${g.name}" style="width:26px;height:26px;object-fit:contain;border-radius:3px;" />` : ''}
            <span><strong>${g.name.replace(/^(USA|China|GLA)\s*/, '') || 'Standard'}</strong><br><small style="color:#a8b8aa;font-size:9px;">${g.commander}</small></span>
        </button>`;
    }).join('');
}
window.renderGeneralSelectorCards = renderGeneralSelectorCards;

function selectGeneral(generalId) {
    const gDef = ZERO_HOUR_GENERALS[generalId] || ZERO_HOUR_GENERALS[selectedFaction] || ZERO_HOUR_GENERALS.usa;
    selectedGeneral = gDef.id;
    window.selectedGeneral = selectedGeneral;
    if (selectedFaction !== gDef.baseFaction) {
        selectedFaction = gDef.baseFaction;
    }
    if (gDef.freePowers && typeof unlockedGeneralsPowers !== 'undefined') {
        gDef.freePowers.forEach(pId => unlockedGeneralsPowers.add(pId));
    }
    refreshFactionRoster();
    renderGeneralSelectorCards(selectedFaction);
    const overviewEl = (typeof document !== 'undefined') ? document.getElementById('faction-overview') : null;
    if (overviewEl) overviewEl.textContent = `${gDef.name} (${gDef.commander}) — ${gDef.desc}`;
    const spBriefingEl = (typeof document !== 'undefined') ? document.getElementById('sp-faction-briefing') : null;
    if (spBriefingEl) spBriefingEl.textContent = `${gDef.name} (${gDef.commander}) — ${gDef.desc}`;
    const spCrest = (typeof document !== 'undefined') ? document.getElementById('sp-intel-crest') : null;
    if (spCrest && window.OFFICIAL_UI_ASSETS && window.OFFICIAL_UI_ASSETS[gDef.portraitKey]) {
        spCrest.src = window.OFFICIAL_UI_ASSETS[gDef.portraitKey];
        spCrest.style.display = '';
    }
    if (typeof spSlots !== 'undefined' && spSlots[0]) {
        spSlots[0].faction = selectedFaction;
        spSlots[0].general = selectedGeneral;
    }
    return gDef;
}
window.selectGeneral = selectGeneral;

function selectFaction(faction, button) {
    if (ZERO_HOUR_GENERALS[faction]) {
        selectedGeneral = faction;
        window.selectedGeneral = faction;
        faction = ZERO_HOUR_GENERALS[faction].baseFaction;
    } else if (!ZERO_HOUR_GENERALS[selectedGeneral] || ZERO_HOUR_GENERALS[selectedGeneral].baseFaction !== faction) {
        selectedGeneral = faction;
        window.selectedGeneral = faction;
    }
    selectedFaction = faction;
    if (faction !== 'random' && factionCatalog[faction]) {
        refreshFactionRoster();
        renderGeneralSelectorCards(faction);
    }
    // Synchronize the top 3 big faction buttons
    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
        document.querySelectorAll('.faction-card').forEach(card => {
                card.classList.toggle('active', card.getAttribute('data-faction') === faction);
        });
    }

    // Update faction overview description & Skirmish briefing
    let overviewText = 'Random — Faction assigned randomly at deployment (USA, China, or GLA).';
    const roster = factionCatalog[faction];
    if (roster) {
        const infantry = Object.values(roster.barracks).map(unit => unit[0]).join(', ');
        const vehicles = Object.values(roster.factory).map(unit => unit[0]).join(', ');
        overviewText = `${roster.label} forces — Infantry: ${infantry}. Vehicles & aircraft: ${vehicles}. Support: ${roster.support.join(', ')}.`;
        const overviewEl = document.getElementById('faction-overview');
        if (overviewEl) overviewEl.textContent = overviewText;
    }
    const spBriefingEl = document.getElementById('sp-faction-briefing');
    if (spBriefingEl) spBriefingEl.textContent = overviewText;

    // Synchronize player/host slot 0 data model
    if (typeof spSlots !== 'undefined' && spSlots[0]) {
        spSlots[0].faction = faction;
    }
    if (faction !== 'random' && typeof mpSlots !== 'undefined' && mpSlots[0]) {
        mpSlots[0].faction = faction;
    }

    // Synchronize the dropdown selection boxes
    const spSelect = document.getElementById('single-slot-0-faction') || document.getElementById('sp-slot-0-faction');
    if (spSelect) spSelect.value = faction;

    if (faction !== 'random') {
        const mpSelect = document.getElementById('multiplayer-slot-0-faction') || document.getElementById('mp-slot-0-faction');
        if (mpSelect) mpSelect.value = faction;
    }

    if (typeof applyOfficialMenuArt === 'function') {
        applyOfficialMenuArt(faction);
    }

    if (typeof syncMpLobbyToPeer === 'function') {
        syncMpLobbyToPeer();
    }
}



function isBuildingAvailableForFaction(type, faction = selectedFaction) {
    if (type === 'center' || type === 'commandCenter') return true;
    return (factionBuildings[faction] || []).some(building => building[0] === type);
}
window.isBuildingAvailableForFaction = isBuildingAvailableForFaction;

function getStructureCost(type, faction = selectedFaction) {
    const entry = (factionBuildings[faction] || []).find(building => building[0] === type);
    const baseCost = entry ? entry[2] : 0;
    const gDef = ZERO_HOUR_GENERALS[selectedGeneral];
    if (gDef && gDef.baseFaction === faction && gDef.structCostMods && gDef.structCostMods[type]) {
        return Math.round(baseCost * gDef.structCostMods[type]);
    }
    return baseCost;
}

function getStructureFootprint(type) {
    const sizes = {
        center: [26, 12, 24], power: [16, 8, 14], barracks: [18, 9, 18], factory: [26, 10, 22],
        supplyCenter: [22, 9, 20], supplyDrop: [20, 10, 20], airfield: [42, 10, 60], strategyCenter: [24, 12, 22],
        detentionCamp: [18, 9, 16], patriot: [12, 9, 12], particleCannon: [26, 14, 26], nuclearReactor: [16, 10, 16],
        internetCenter: [20, 9, 18], propagandaCenter: [22, 10, 20], bunker: [14, 8, 14], gatlingCannon: [12, 9, 12],
        speakerTower: [10, 12, 10], nukeSilo: [24, 14, 24], supplyStash: [18, 9, 18], blackMarket: [20, 9, 18],
        tunnel: [16, 8, 16], stingerSite: [12, 9, 12], demoTrap: [6, 2, 6], palace: [26, 12, 22],
        fakeCommandCenter: [26, 12, 24], fakeBarracks: [18, 9, 18], fakeArmsDealer: [26, 10, 22], scudStorm: [26, 14, 26]
    };
    const [baseW, baseH, baseD] = sizes[type] || [16, 8, 16];
    const width = baseW;
    const height = baseH;
    const depth = baseD;
    return { width, height, depth, radius: Math.max(width, depth) * 0.55 };
}

let activeSidebarTab = 'production';
// researchedTechs initialized in 01_core.js

function setSidebarTab(tab) {
    activeSidebarTab = tab;
    document.querySelectorAll('.sidebar-tab').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`tab-btn-${tab}`);
    if (activeBtn) activeBtn.classList.add('active');
    updateSidebar();
}

let _lastErrorGuiSoundAt = 0;

function showNotification(msg, type = 'info') {
    const ticker = document.getElementById('tactical-message');
    if (ticker) {
        ticker.textContent = msg;
        ticker.style.color = type === 'error' ? '#ff7675' : type === 'success' ? '#55efc4' : '#ffd86b';
    }
    if (type === 'error' && typeof playAudio === 'function') {
        const now = Date.now();
        if (now - _lastErrorGuiSoundAt > 650) {
            _lastErrorGuiSoundAt = now;
            playAudio('gui_error', { volume: 0.45 });
        }
    }
}

function hasCompletedStructure(buildingType, altBuildingType = null) {
    return structures.some(s => {
            if (s.health <= 0 || s.isBuilding) return false;
            if (s.type === buildingType) return true;
            if (altBuildingType && s.type === altBuildingType) return true;
            if ((buildingType === 'power' || buildingType === 'nuclearReactor') && (s.type === 'power' || s.type === 'nuclearReactor')) return true;
            if ((buildingType === 'factory' || buildingType === 'fakeArmsDealer') && (s.type === 'factory' || s.type === 'fakeArmsDealer')) return true;
            if ((buildingType === 'barracks' || buildingType === 'fakeBarracks') && (s.type === 'barracks' || s.type === 'fakeBarracks')) return true;
            return false;
    });
}

function getStructureTechPrerequisite(type) {
    if (type === 'center') return null; // Command Center has no prerequisites

    if (selectedFaction === 'usa') {
        if (type === 'power') return null; // USA Cold Fusion Reactor is Tier 1
        if (type === 'barracks' || type === 'supplyCenter') {
            return { building: 'power', name: 'Cold Fusion Reactor' };
        }
        if (type === 'patriot') {
            return { building: 'power', name: 'Cold Fusion Reactor' };
        }
        if (type === 'factory') {
            return { building: 'supplyCenter', altBuilding: 'barracks', name: 'Supply Center or Barracks' };
        }
        if (type === 'airfield') {
            return { building: 'supplyCenter', altBuilding: 'factory', name: 'Supply Center or War Factory' };
        }
        if (type === 'strategyCenter') {
            return { building: 'factory', altBuilding: 'airfield', name: 'War Factory or Airfield' };
        }
        if (type === 'supplyDrop' || type === 'detentionCamp' || type === 'particleCannon') {
            return { building: 'strategyCenter', name: 'Strategy Center' };
        }
    } else if (selectedFaction === 'china') {
        if (type === 'nuclearReactor' || type === 'power') return null; // China Nuclear Reactor is Tier 1
        if (type === 'barracks' || type === 'supplyCenter') {
            return { building: 'nuclearReactor', altBuilding: 'power', name: 'Nuclear Reactor' };
        }
        if (type === 'gatlingCannon' || type === 'bunker') {
            return { building: 'nuclearReactor', altBuilding: 'power', name: 'Nuclear Reactor' };
        }
        if (type === 'factory') {
            return { building: 'supplyCenter', altBuilding: 'barracks', name: 'Supply Center or Barracks' };
        }
        if (type === 'airfield') {
            return { building: 'supplyCenter', altBuilding: 'factory', name: 'Supply Center or War Factory' };
        }
        if (type === 'propagandaCenter') {
            return { building: 'factory', name: 'War Factory' };
        }
        if (type === 'speakerTower') {
            return { building: 'propagandaCenter', altBuilding: 'barracks', name: 'Propaganda Center or Barracks' };
        }
        if (type === 'internetCenter' || type === 'nukeSilo') {
            return { building: 'propagandaCenter', name: 'Propaganda Center' };
        }
    } else if (selectedFaction === 'gla') {
        // GLA requires no electrical power grid
        if (type === 'supplyStash' || type === 'barracks' || type === 'fakeBarracks') return null;
        if (type === 'tunnel' || type === 'stingerSite') {
            return { building: 'barracks', altBuilding: 'fakeBarracks', name: 'Barracks' };
        }
        if (type === 'factory' || type === 'fakeArmsDealer') {
            return { building: 'barracks', altBuilding: 'supplyStash', name: 'Barracks or Supply Stash' };
        }
        if (type === 'demoTrap') {
            return { building: 'factory', altBuilding: 'fakeArmsDealer', name: 'Arms Dealer' };
        }
        if (type === 'palace') {
            return { building: 'factory', altBuilding: 'fakeArmsDealer', name: 'Arms Dealer' };
        }
        if (type === 'blackMarket' || type === 'scudStorm') {
            return { building: 'palace', name: 'Palace' };
        }
    }
    return null;
}

function getUnitTechPrerequisite(type) {
    if (selectedFaction === 'usa') {
        if (['tomahawk', 'pathfinder', 'burton', 'stealthfighter', 'aurora'].includes(type)) {
            return { building: 'strategyCenter', name: 'Strategy Center' };
        }
    } else if (selectedFaction === 'china') {
        if (['overlord', 'inferno', 'nukecannon', 'nuketank', 'blacklotus', 'hacker'].includes(type)) {
            return { building: 'propagandaCenter', name: 'Propaganda Center' };
        }
    } else if (selectedFaction === 'gla') {
        if (['marauder', 'buggy', 'bombtruck', 'scud', 'hijacker', 'jarmen', 'mob'].includes(type)) {
            return { building: 'palace', name: 'Palace' };
        }
    }
    return null;
}

// Comprehensive C&C Generals Briefings Catalog for Floating Tooltips
const tacticalBriefings = {
    // USA Units
    infantry: { name: 'Ranger', role: 'Light Combat Infantry', cost: '$225', desc: 'Frontline rifleman equipped with combat armor and flashbang grenades. Can clear garrisons and capture enemy structures.', req: 'Barracks', unlock: 'Building Capture, Flashbangs' },
    rocket: { name: 'Missile Defender', role: 'Anti-Armor / Anti-Air Infantry', cost: '$300', desc: 'Equipped with wire-guided anti-tank / anti-aircraft missile launcher. Features Laser Guided Targeting.', req: 'Barracks', unlock: 'Laser Guided Missiles' },
    pathfinder: { name: 'Pathfinder', role: 'Sniper Scout', cost: '$600', desc: 'Elite designated marksman with thermal scope. Concealed in stealth when stationary. Eliminates infantry at extreme range.', req: 'Strategy Center', unlock: 'Stealth Scout, Anti-Infantry Dominance' },
    burton: { name: 'Colonel Burton', role: 'Hero Commando', cost: '$1500', desc: 'Colonel Burton - armed with rapid machine gun, timed C4 explosive charges, remote detonators, and combat knife.', req: 'Strategy Center', unlock: 'Timed C4 Charges, Remote Demolitions' },
    tank: { name: 'Crusader Tank', role: 'Main Battle Tank', cost: '$900', desc: 'Frontline armored fighting vehicle with high-velocity smoothbore cannon and heavy composite glacis.', req: 'War Factory', unlock: 'Battle Drones, Laser Point Defense' },
    crusader: { name: 'Crusader Tank', role: 'Main Battle Tank', cost: '$900', desc: 'Frontline armored fighting vehicle with high-velocity smoothbore cannon and heavy composite glacis.', req: 'War Factory', unlock: 'Battle Drones, Laser Point Defense' },
    humvee: { name: 'Humvee', role: 'Rapid Recon Vehicle', cost: '$700', desc: 'High-mobility light combat transport. Mounts a heavy .50 cal gun and carries up to 5 infantry squads who can fire out.', req: 'War Factory', unlock: 'Fire-from-within, High Speed Raids' },
    ambulance: { name: 'Ambulance', role: 'Field Support Vehicle', cost: '$600', desc: 'Mobile battlefield medical unit that decontaminates chemical/radiation zones and rapidly heals nearby friendly infantry.', req: 'War Factory', unlock: 'Mass Infantry Healing, Decontamination' },
    paladin: { name: 'Paladin Tank', role: 'Advanced Defense Tank', cost: '$1100', desc: 'High-tech main battle tank equipped with anti-missile Point Defense Laser and heavy 120mm cannon.', req: 'Strategy Center', unlock: 'Active Anti-Missile Laser Shield' },
    tomahawk: { name: 'Tomahawk Launcher', role: 'Cruise Missile Artillery', cost: '$1200', desc: 'Mobile launcher firing long-range Tomahawk cruise missiles (150 dmg + splash, min-range blind spot). Vulnerable to aircraft & light rushes.', req: 'Strategy Center', unlock: 'Extreme Long-Range Bombardment' },
    chinook: { name: 'Chinook', role: 'Heavy Cargo Transport', cost: '$1200', desc: 'Twin-rotor heavy cargo helicopter. Gathers combat supplies from resource zones and transports heavy infantry.', req: 'Airfield', unlock: 'Supply Harvesting, Airborne Insertion' },
    raptor: { name: 'Raptor', role: 'Air Superiority Fighter', cost: '$1400', desc: 'Supersonic tactical strike jet armed with 4 precision-guided Sidewinder / Maverick missiles.', req: 'Airfield', unlock: 'Precision Air Strikes, Hit-and-Run' },
    comanche: { name: 'Comanche', role: 'Attack Gunship Helicopter', cost: '$1500', desc: 'Rotary-wing close air support gunship equipped with 20mm rotary vulcan cannon and rocket pods.', req: 'Airfield', unlock: 'Continuous Close Air Support' },
    stealthfighter: { name: 'Stealth Fighter', role: 'Stealth Strike Jet', cost: '$1600', desc: 'Advanced stealth airframe invisible to standard radar. Delivers precision laser-guided bunker-busting bombs.', req: 'Strategy Center', unlock: 'Stealth Air Infiltration, Defense Bypassing' },
    aurora: { name: 'Aurora Bomber', role: 'Hypersonic Strategic Bomber', cost: '$2500', desc: 'Mach 3+ strategic bomber. Immune to interception during supersonic attack run. Delivers fuel-air bombs.', req: 'Strategy Center', unlock: 'Unstoppable Precision Strike' },
    dozer: { name: 'Construction Dozer', role: 'Combat Engineering Vehicle', cost: '$1000', desc: 'Heavy engineering vehicle that builds, repairs, and clears battlefield infrastructure.', req: 'Command Center', unlock: 'Base Construction, Automated Repairs' },
    truck: { name: 'Supply Truck', role: 'Automated Logistics Transport', cost: '$600', desc: 'Heavy cargo transport. Automatically gathers supplies from fields and unloads at Supply Centers.', req: 'Supply Center', unlock: 'Resource Income Flow' },

    // China Units
    redguard: { name: 'Red Guard', role: 'Conscript Infantry', cost: '$300', desc: 'Patriotic Chinese riflemen deployed in pairs. Can capture hostile buildings and gain horde firing bonuses.', req: 'Barracks', unlock: 'Building Capture, Red Army Horde Bonus' },
    tankhunter: { name: 'Tank Hunter', role: 'Anti-Armor Rocket Squad', cost: '$300', desc: 'Infantry equipped with RPG rocket launchers and magnetic TNT tank-disabling charges.', req: 'Barracks', unlock: 'TNT Sabotage, Anti-Tank Ambush' },
    hacker: { name: 'Hacker', role: 'Cyber Warfare Specialist', cost: '$625', desc: 'Espionage operative who hacks satellite networks for continuous funds or disables hostile base structures.', req: 'Propaganda Center', unlock: 'Continuous Cash Hack, Building Shutdown' },
    blacklotus: { name: 'Black Lotus', role: 'Special Agent Hero', cost: '$1500', desc: 'Stealth cyber operative capable of instant building capture, supply theft, and vehicle disabling from afar.', req: 'Propaganda Center', unlock: 'Stealth Espionage, Remote Tech Capture' },
    battlemaster: { name: 'Battle Master Tank', role: 'Main Battle Tank', cost: '$800', desc: 'Reliable frontline armored tank armed with a 100mm rifled cannon. Gains firepower when grouped in packs.', req: 'War Factory', unlock: 'Nationalism Horde Firepower Bonus' },
    dragon: { name: 'Dragon Tank', role: 'Incendiary Flame Tank', cost: '$800', desc: 'Armored flame vehicle that ejects high-temperature liquid napalm. Instantly clears garrisoned neutral buildings.', req: 'War Factory', unlock: 'Garrison Clearing, Anti-Infantry Inferno' },
    gatling: { name: 'Gatling Tank', role: 'Anti-Infantry / Anti-Air Tank', cost: '$800', desc: 'Fast light tank mounting dual rotary cannons. Spins up to devastating fire rates against infantry and aircraft.', req: 'War Factory', unlock: 'Rapid Shredding Fire, Anti-Air Defense' },
    crawler: { name: 'Troop Crawler', role: 'Troop Carrier & Radar', cost: '$1400', desc: 'Heavy all-terrain transport carrying 8 Red Guards. Equipped with mobile base radar dish and medical station.', req: 'War Factory', unlock: 'Infantry Transport, Mobile Radar' },
    overlord: { name: 'Overlord Tank', role: 'Super-Heavy Dual-Cannon Tank', cost: '$2000', desc: 'Massive siege tank featuring twin 125mm cannons. Can be upgraded with Gatling Cannon, Bunker, or Speaker Tower.', req: 'Propaganda Center', unlock: 'Crushes Vehicles, Mobile Bastion' },
    inferno: { name: 'Inferno Cannon', role: 'Napalm Artillery', cost: '$900', desc: 'Self-propelled artillery firing combustible napalm canisters that trigger sweeping firestorms.', req: 'Propaganda Center', unlock: 'Napalm Firestorm Barrage' },
    nukecannon: { name: 'Nuke Tank (Nuke Cannon)', role: 'Tactical Nuclear Artillery', cost: '$1600', desc: 'Heavy tracked nuclear siege tank firing miniaturized tactical atomic shells that leave radioactive fallout.', req: 'Propaganda Center', unlock: 'Tactical Nuclear Strikes, Area Denial' },
    nuketank: { name: 'Nuke Tank (Nuke Cannon)', role: 'Tactical Nuclear Artillery', cost: '$1600', desc: 'Heavy tracked nuclear siege tank firing miniaturized tactical atomic shells that leave radioactive fallout.', req: 'Propaganda Center', unlock: 'Tactical Nuclear Strikes, Area Denial' },
    mig: { name: 'MiG Fighter', role: 'Multirole Fighter Jet', cost: '$1200', desc: 'Delta-wing combat jet armed with dual Blackshark napalm rockets. Multiple MiGs trigger firestorms.', req: 'Airfield', unlock: 'Air Napalm Firestorms' },

    // GLA Units
    rebel: { name: 'Rebel', role: 'Guerrilla Rifleman', cost: '$150', desc: 'Light insurgent infantry armed with Kalashnikov rifles. Stealthy and can capture buildings.', req: 'Barracks', unlock: 'Building Capture, Guerrilla Ambush' },
    rpg: { name: 'RPG Trooper', role: 'Rocket Insurgent', cost: '$300', desc: 'Insurgent equipped with shoulder-launched rocket launcher. Fires effectively from civilian buildings and tunnels.', req: 'Barracks', unlock: 'Anti-Armor, Tunnel Network Ambush' },
    terrorist: { name: 'Terrorist', role: 'Explosive Martyr', cost: '$200', desc: 'Infiltrator equipped with explosive suicide belt. Can carjack civilian and military vehicles for mobile bombs.', req: 'Barracks', unlock: 'High-Explosive Sabotage' },
    mob: { name: 'Angry Mob', role: 'Insurgent Riot Swarm', cost: '$800', desc: 'Large crowd of rioters throwing Molotov cocktails and firing assault rifles. Highly resilient to armor piercing.', req: 'Palace', unlock: 'Swarm Tactics, Molotov Bombardment' },
    hijacker: { name: 'Hijacker', role: 'Vehicle Pirate', cost: '$400', desc: 'Inconspicuous operative who sprints toward enemy vehicles and commandeers them for the GLA.', req: 'Palace', unlock: 'Vehicle Hijacking & Stealing' },
    jarmen: { name: 'Jarmen Kell', role: 'Legendary Sniper Hero', cost: '$1500', desc: 'Jarmen Kell - master sniper who snipes enemy vehicle drivers, allowing GLA troops to commandeer empty vehicles.', req: 'Palace', unlock: 'Driver Sniping, Stealth Marksmanship' },
    technical: { name: 'Technical', role: 'Light Assault Truck', cost: '$500', desc: 'Fast pickup truck with mounted heavy machine gun. Upgrades instantly by salvaging battlefield wreckage.', req: 'Arms Dealer', unlock: 'Rapid Hit-and-Run, Salvage Upgrades' },
    scorpion: { name: 'Scorpion Tank', role: 'Light Battle Tank', cost: '$600', desc: 'Mobile light tank armed with a 75mm cannon. Can mount a Scorpion Rocket launcher through salvage.', req: 'Arms Dealer', unlock: 'Scorpion Rocket, Salvage Scavenging' },
    marauder: { name: 'Marauder Tank', role: 'Heavy Salvage Tank', cost: '$800', desc: 'Sturdy combat tank designed to scavenge enemy scrap metal to upgrade to twin heavy barrels.', req: 'Palace', unlock: 'Dual-Cannon Salvage Evolution' },
    buggy: { name: 'Rocket Buggy', role: 'Dune Buggy Skirmisher', cost: '$900', desc: 'Fast desert dune buggy armed with long-range rocket pods. Excels at hit-and-run base harassment.', req: 'Palace', unlock: 'Long-Range Skirmishing' },
    quad: { name: 'Quad Cannon', role: 'Anti-Infantry / Anti-Air Flak', cost: '$700', desc: 'Tracked vehicle with four heavy flak barrels. Shreds infantry, helicopters, and lightly armored vehicles.', req: 'Arms Dealer', unlock: 'Anti-Air Flak, Rapid Shredding' },
    toxintractor: { name: 'Toxin Tractor', role: 'Chemical Sprayer', cost: '$600', desc: 'Armored agricultural tractor converted to spray lethal Anthrax toxin. Clears civilian garrisons and contaminates ground.', req: 'Arms Dealer', unlock: 'Anthrax Spray, Garrison Clearing' },
    bombtruck: { name: 'Bomb Truck', role: 'Explosive Demolition Truck', cost: '$1200', desc: 'Disguised transport packed with high explosives and optional anthrax or nuclear warheads.', req: 'Palace', unlock: 'Massive Base Demolition, Disguise' },
    scud: { name: 'SCUD Launcher', role: 'Ballistic Missile Vehicle', cost: '$1200', desc: 'Heavy launcher firing long-range ballistic SCUD missiles tipped with high explosive or Anthrax warheads.', req: 'Palace', unlock: 'Ballistic Bombardment, Toxin Clouds' },
    radarvan: { name: 'Radar Van', role: 'Mobile Radar Station', cost: '$500', desc: 'Provides the GLA with tactical minimap radar and reconnaissance scan abilities.', req: 'Arms Dealer', unlock: 'GLA Base Radar, Recon Sweeps' },
    battlebus: { name: 'Battle Bus', role: 'Armored Garrison Bus', cost: '$1000', desc: 'Armored transport bus carrying 8 infantry firing from within. Converts into an armored bunker when disabled once.', req: 'Palace', unlock: '8-Slot Fireport Transport, Second-Life Bunker' },
    worker: { name: 'Worker', role: 'GLA Laborer & Builder', cost: '$200', desc: 'GLA laborer who constructs buildings, gathers supply boxes by hand, and clears battlefield debris.', req: 'Command Center', unlock: 'Base Construction, Manual Harvesting' },

    // Buildings across all 3 factions
    center: { name: 'Command Center', role: 'Base Headquarters', cost: '$2000', desc: 'Main command base facility. Produces combat engineers and dozers, provides satellite radar uplink, and unlocks core tech.', req: 'None', unlock: 'Builders, Radar, Tier 1 Tech' },
    power: { name: 'Cold Fusion Reactor', role: 'Clean Energy Production', cost: '$800', desc: 'USA Cold Fusion Reactor. Supplies clean electrical power to base structures and defenses.', req: 'Command Center', unlock: 'Supply Center, Barracks, Patriot Missiles' },
    nuclearReactor: { name: 'Nuclear Reactor', role: 'Atomic Energy Production', cost: '$1000', desc: 'China Nuclear Reactor. Generates massive power. Can be overcharged for +50% output.', req: 'Command Center', unlock: 'Supply Center, Barracks, Base Defenses' },
    barracks: { name: 'Barracks', role: 'Infantry Training Facility', cost: '$500 - $600', desc: 'Trains ground infantry, rangers, and special forces. Heals nearby friendly infantry.', req: 'Power (USA/China)', unlock: 'Combat Infantry, Base Defenses' },
    fakeBarracks: { name: 'Fake Barracks', role: 'Decoy Structure', cost: '$125', desc: 'Cheap wooden decoy structure that tricks enemy reconnaissance and can detonate or upgrade to real Barracks.', req: 'Command Center', unlock: 'Deception, Camouflage' },
    factory: { name: 'War Factory / Arms Dealer', role: 'Armored Vehicle Plant', cost: '$2000 - $2500', desc: 'Produces main battle tanks, artillery, and armored transports. Automatically repairs nearby friendly vehicles.', req: 'Supply Center or Barracks', unlock: 'Armored Fighting Vehicles, Tier 2 Tech' },
    fakeArmsDealer: { name: 'Fake Arms Dealer', role: 'Decoy Arms Dealer', cost: '$625', desc: 'Decoy vehicle workshop designed to mislead enemy bombers and satellite surveillance.', req: 'Barracks or Supply Stash', unlock: 'Deception, Decoy Defense' },
    supplyCenter: { name: 'Supply Center', role: 'Logistics Resource Hub', cost: '$1500 - $2000', desc: 'Logistics hub that processes supply shipments. Comes equipped with an automated Supply Harvester.', req: 'Power (USA/China)', unlock: 'Supply Harvesters, War Factory, Airfield' },
    supplyStash: { name: 'Supply Stash', role: 'GLA Resource Depot', cost: '$1500', desc: 'GLA warehouse where workers deposit salvaged supply crates. Unlocks Arms Dealer.', req: 'Command Center', unlock: 'Workers, Arms Dealer' },
    airfield: { name: 'Air Field', role: 'Aviation Hangar', cost: '$1000', desc: 'Houses and re-arms combat aircraft. Automatically repairs and reloads docked aircraft.', req: 'Supply Center or War Factory', unlock: 'Fighters, Bombers, Attack Helicopters' },
    strategyCenter: { name: 'Strategy Center', role: 'Strategic Operations Hub', cost: '$2500', desc: 'USA Advanced Tech Hub. Allows selection of Battle Plans (Hold the Line, Search & Destroy, Bombardment).', req: 'War Factory or Airfield', unlock: 'Paladin, Tomahawk, Aurora, Particle Cannon' },
    propagandaCenter: { name: 'Propaganda Center', role: 'State Propaganda Hub', cost: '$2000', desc: 'China Tier 3 Tech Hub. Broadcasts party doctrines, healing friendly troops and boosting firing rates.', req: 'War Factory', unlock: 'Overlord Tank, Nuke Cannon, Nuclear Silo' },
    palace: { name: 'Palace', role: 'Warlord Bastion Citadel', cost: '$2500', desc: 'GLA Citadel and High Command. Heavy garrison fortress allowing troops to fire out with reinforced armor.', req: 'Arms Dealer', unlock: 'Marauder Tank, SCUD Launcher, SCUD Storm' },
    patriot: { name: 'Patriot Missile System', role: 'Guided Missile Battery', cost: '$1000', desc: 'USA automated surface-to-air and anti-vehicle guided missile battery. Connects with nearby Patriots.', req: 'Cold Fusion Reactor', unlock: 'Automated Base Defense' },
    gatlingCannon: { name: 'Gatling Cannon', role: 'Anti-Air / Anti-Infantry Defense', cost: '$1200', desc: 'China rapid-fire dual rotating Gatling guns. Spins up to extreme velocity, shredding infantry and aircraft.', req: 'Nuclear Reactor', unlock: 'Anti-Air, Anti-Infantry Defense' },
    bunker: { name: 'Concrete Bunker', role: 'Fortified Infantry Emplacement', cost: '$400', desc: 'Reinforced concrete bunker that protects up to 5 garrisoned infantry while allowing them to fire.', req: 'Barracks', unlock: 'Protected Infantry Firepoint' },
    speakerTower: { name: 'Speaker Tower', role: 'Propaganda Loudspeaker', cost: '$500', desc: 'Broadcasts patriotic speeches that continuously heal friendly units and boost weapon reload speed.', req: 'Propaganda Center or Barracks', unlock: 'Horde Health Regeneration' },
    tunnel: { name: 'Tunnel Network', role: 'Subterranean Transit Hub', cost: '$800', desc: 'GLA subterranean network with mounted anti-infantry gun. Units enter here and emerge instantly at any other tunnel.', req: 'Barracks', unlock: 'Instant Map Transit, Tunnel Defense' },
    stingerSite: { name: 'Stinger Site', role: 'Surface-to-Air Missile Revetment', cost: '$900', desc: 'GLA fortified revetment housing 3 Stinger missile gunners. Deadly against enemy helicopters and aircraft.', req: 'Barracks', unlock: 'Anti-Air Defense' },
    demoTrap: { name: 'Demo Trap', role: 'Concealed Demolitions Mine', cost: '$400', desc: 'Camouflaged explosive charge that detonates when enemy armor passes over, causing catastrophic damage.', req: 'Arms Dealer', unlock: 'Area Denial, Anti-Armor Ambush' },
    particleCannon: { name: 'Particle Cannon', role: 'Orbital Particle Superweapon', cost: '$5000', desc: 'USA space-based orbital particle beam weapon. Channels high-energy particle stream across the battlefield.', req: 'Strategy Center', unlock: 'Orbital Particle Beam Strike' },
    nukeSilo: { name: 'Nuclear Missile Silo', role: 'Thermonuclear ICBM Silo', cost: '$5000', desc: 'China thermonuclear ICBM silo. Delivers a devastating atomic warhead that incinerates entire bases.', req: 'Propaganda Center', unlock: 'Thermonuclear Ballistic Missile Strike' },
    scudStorm: { name: 'SCUD Storm', role: 'Chemical Ballistic Superweapon', cost: '$5000', desc: 'GLA multiple ballistic missile complex. Salvo fires 9 chemical SCUD rockets loaded with Anthrax Beta.', req: 'Palace', unlock: 'SCUD Storm Ballistic Salvo' },
    supplyDrop: { name: 'Supply Drop Zone', role: 'Airborne Resupply Zone', cost: '$2500', desc: 'USA Tier 3 logistics drop zone with red smoke signal. Calls a C-130 Hercules every 2 minutes to drop $1,500 crates ($1,650 with Supply Lines). Functions during power outages & EMP.', req: 'Strategy Center', unlock: 'C-130 Airborne Supply Drops' },
    internetCenter: { name: 'Internet Center', role: 'Cyber Warfare Facility', cost: '$2500', desc: 'China electronic intelligence facility. Stations Hackers to steal funds and track enemy positions.', req: 'Propaganda Center', unlock: 'Global Satellite Spy Uplink' },
    blackMarket: { name: 'Black Market', role: 'Covert Commerce Bazaar', cost: '$2500', desc: 'GLA subterranean black market. Generates continuous funds and sells illegal black market weapons tech.', req: 'Palace', unlock: 'Continuous Black Market Income' },
    detentionCamp: { name: 'Detention Camp', role: 'Military Intelligence Facility', cost: '$1000', desc: 'USA interrogation and surveillance facility. Grants radar intelligence sweeps of hostile forces.', req: 'Strategy Center', unlock: 'Hostile Intelligence Sweeps' },

    // Upgrades & Abilities
    radar: { name: 'Radar System', role: 'Telemetry Uplink', cost: '$500', desc: 'Activates tactical mini-map radar telemetry grid.', req: 'Command Center', unlock: 'Tactical Mini-Map Grid' },
    upgradePower: { name: 'Control Rod Upgrade', role: 'Facility Optimization', cost: '$300', desc: 'Installs advanced control rods to permanently double power output (+100%).', req: 'Cold Fusion Reactor', unlock: '+100% Electrical Power' },
    controlRods: { name: 'Control Rod Upgrade', role: 'Facility Optimization', cost: '$300', desc: 'Installs advanced control rods to permanently double power output (+100%).', req: 'Cold Fusion Reactor', unlock: '+100% Electrical Power' },
    overcharge: { name: 'Reactor Overcharge', role: 'Nuclear Reactor Modulation', cost: 'FREE', desc: 'Overdrives cooling systems to gain +50% power generation at the cost of gradual structural wear.', req: 'Nuclear Reactor', unlock: '+50% Surge Power' },
    planHold: { name: 'Hold the Line', role: 'Strategic Battle Plan', cost: 'FREE', desc: 'Strategy Center directive: troops dig in, boosting defensive armor by +20%.', req: 'Strategy Center', unlock: '+20% Friendly Armor' },
    planSearch: { name: 'Search & Destroy', role: 'Strategic Battle Plan', cost: 'FREE', desc: 'Strategy Center directive: increases weapons range and sensor sight range by +20%.', req: 'Strategy Center', unlock: '+20% Weapon Range & Sight' },
    planBombard: { name: 'Bombardment Plan', role: 'Strategic Battle Plan', cost: 'FREE', desc: 'Strategy Center directive: boosts ordnance explosive yield and firepower by +20%.', req: 'Strategy Center', unlock: '+20% Firepower Damage' },
    compositeArmor: { name: 'Composite Armor', role: 'Vehicle Armor Research', cost: '$1200', desc: 'Reinforces Crusader and Paladin tanks with layered composite plating (+25% HP).', req: 'Strategy Center', unlock: '+25% Tank Durability' },
    droneArmor: { name: 'Drone Armor', role: 'Robotics Durability', cost: '$500', desc: 'Increases all vehicle and base drones armor and durability by +25%.', req: 'Strategy Center', unlock: '+25% Drone Armor' },
    advancedTraining: { name: 'Advanced Training', role: 'Doctrine Optimization', cost: '$800', desc: 'Doubles combat experience gain, rapidly promoting units to Veteran rank.', req: 'Strategy Center', unlock: '2x Veterancy Rate' },
    chemicalSuits: { name: 'Chemical Suits', role: 'NBC Protection', cost: '$800', desc: 'USA forces gain +50% resistance to toxin, anthrax, and radiation damage.', req: 'Strategy Center', unlock: '+50% Toxic/Radiation Resistance' },
    supplyLines: { name: 'Supply Lines', role: 'Logistics Optimization', cost: '$800', desc: 'USA Supply Trucks and Chinooks bring back +10% extra cash per delivery.', req: 'Strategy Center', unlock: '+10% Harvest Income' },
    nationalism: { name: 'Nationalism Doctrine', role: 'Troop Morale Research', cost: '$1000', desc: 'Inspires Chinese troops with patriotic fervor, increasing fire rate when in horde groups.', req: 'Propaganda Center', unlock: '+25% Horde Firing Rate' },
    subliminal: { name: 'Subliminal Messaging', role: 'Psychological Broadcast', cost: '$800', desc: 'Enhances Speaker Towers and Propaganda Centers to double healing rate (+100%).', req: 'Propaganda Center', unlock: '2x Regeneration Speed' },
    anthraxBeta: { name: 'Anthrax Beta', role: 'Chemical Weapon Research', cost: '$1200', desc: 'Upgrades Anthrax toxin to Beta strain, increasing chemical weapon damage by +25%.', req: 'Palace', unlock: '+25% Toxin Damage' },
    armTheMob: { name: 'Arm the Mob', role: 'Insurgent Weapon Distribution', cost: '$1000', desc: 'Distributes AK-47 assault rifles to Angry Mobs, drastically increasing lethal ranged firepower.', req: 'Palace', unlock: 'Rifles for Mobs' },
    captureBuilding: { name: 'Capture Building', role: 'Infantry Tactics Research', cost: '$1000', desc: 'Trains Rangers, Red Guards, and Rebels in tactical infiltration to capture enemy buildings.', req: 'Barracks', unlock: 'Building Capture' },
    flashbang: { name: 'Flashbang Grenades', role: 'Infantry Breach Tech', cost: '$800', desc: 'Equips Rangers with flashbangs to instantly breach & clear garrisons.', req: 'Barracks', unlock: 'Garrison Clearance' },
    laserMissiles: { name: 'Laser-Guided Missiles', role: 'Precision Munition Tech', cost: '$1000', desc: 'Increases Raptor, Comanche, and Stealth Fighter missile damage by +25%.', req: 'Airfield', unlock: '+25% Air-to-Ground Missile Damage' },
    rocketPods: { name: 'Rocket Pods', role: 'Helicopter Weapon Pods', cost: '$800', desc: 'Equips Comanche gunships with 40mm rocket pod volleys.', req: 'Airfield', unlock: 'Rocket Pod Salvos' },
    countermeasures: { name: 'Countermeasures Flare Dispenser', role: 'Defensive Avionics', cost: '$1000', desc: 'Aircraft deploy flares to deflect 40% of incoming anti-air missile attacks.', req: 'Airfield', unlock: '40% Missile Deflection Chance' },
    bunkerBusters: { name: 'Bunker Busters', role: 'Penetration Munition', cost: '$500', desc: 'Equips Aurora Bombers to penetrate & destroy fortified bunkers.', req: 'Airfield', unlock: 'Bunker Demolition' },
    intel: { name: 'Intelligence Sweep', role: 'Satellite Surveillance', cost: 'FREE', desc: 'Sweeps the battlefield to reveal enemy coordinates and status reports.', req: 'Detention Camp', unlock: 'Hostile Asset Recon' },
    spyDrone: { name: 'Spy Drone Recon', role: 'Orbital Reconnaissance', cost: '$200', desc: 'Deploys an orbital scan over target coordinates, clearing shroud and detecting stealth.', req: 'Command Center', unlock: 'Targeted Shroud Clearance' },
    garrison: { name: 'Garrison Troops', role: 'Fortification Order', cost: 'FREE', desc: 'Commands up to 5 nearby infantry to enter the bunker or structure to fire from safety.', req: 'Operational Facility', unlock: 'Protected Firepoint' },
    ungarrison: { name: 'Evacuate Troops', role: 'Deployment Order', cost: 'FREE', desc: 'Evacuates all garrisoned soldiers to external positions.', req: 'Garrisoned Structure', unlock: 'Infantry Deployment' },
    tunnel: { name: 'Tunnel Transit', role: 'Underground Movement', cost: 'FREE', desc: 'Transports all nearby units instantaneously through underground tunnels to the exit.', req: 'Tunnel Network', unlock: 'Instant Transit' },
    networkHack: { name: 'Satellite Hack', role: 'Cyber Espionage', cost: 'FREE', desc: 'Hacks orbital satellite relay to acquire +$250 cash directly into treasury.', req: 'Internet Center', unlock: '+$250 Cyber Funds' },
    plantMines: { name: 'Deploy Landmines', role: 'Base Security', cost: '$100', desc: 'Deploys explosive perimeter landmines around facility perimeter.', req: 'Structure', unlock: 'Perimeter Defense' },
    mines: { name: 'Perimeter Landmines', role: 'Base Security', cost: '$300', desc: 'Deploys explosive perimeter landmines around facility perimeter.', req: 'Structure', unlock: 'Perimeter Defense' },
    neutronMines: { name: 'Neutron Landmines', role: 'Advanced Base Security', cost: '$500', desc: 'Perimeter mines release neutron radiation, neutralizing vehicle drivers and infantry.', req: 'Structure', unlock: 'Neutron Vehicle Decapitation' },
    superweapon: { name: 'Superweapon Strike', role: 'Strategic Armageddon', cost: 'FREE', desc: 'Prepares superweapon for targeting anywhere on the battlefield.', req: 'Superweapon Facility', unlock: 'Devastating Strike' },
    towMissile: { name: 'TOW Missile Tech', role: 'Anti-Armor Enhancement', cost: '$800', desc: 'Mounts wire-guided TOW missile launcher on Humvees (+40% armor damage).', req: 'War Factory', unlock: '+40% Humvee Damage' },
    battleDrone: { name: 'Battle Drone Upgrade', role: 'Autonomous Vehicle Drone', cost: '$400', desc: 'Deploys hovering support drone over tanks for continuous repair & sniper fire.', req: 'War Factory', unlock: 'Auto-Repair, Infantry Defense' },
    redGuardTraining: { name: 'Red Guard Training', role: 'Elite Drills', cost: '$800', desc: 'All newly trained Red Guard deploy with Veteran rank.', req: 'Barracks', unlock: 'Veteran Red Guard' },
    chainGuns: { name: 'Chain Guns Tech', role: 'Ballistic Optimization', cost: '$1000', desc: 'Upgrades Gatling weapons with high-velocity link barrels (+25% damage & instant spin).', req: 'War Factory', unlock: '+25% Firepower, Instant Spin' },
    blackNapalm: { name: 'Black Napalm', role: 'Incendiary Research', cost: '$1000', desc: 'Increases Dragon Tank, Inferno Cannon, and MiG napalm fire damage by +30%.', req: 'War Factory / Airfield', unlock: '+30% Napalm Fire Damage' },
    autoloader: { name: 'Autoloader Tech', role: 'Ballistic Mechanism', cost: '$800', desc: 'Increases Battlemaster Tank rate of fire by +25%.', req: 'War Factory', unlock: '+25% Tank Fire Rate' },
    migArmor: { name: 'MiG Armor', role: 'Aircraft Plating', cost: '$1000', desc: 'Increases MiG-29 armor and maximum HP by +25%.', req: 'Airfield', unlock: '+25% MiG HP' },
    satHack1: { name: 'Satellite Hack I', role: 'Orbital Espionage', cost: '$1000', desc: 'Orbital hack continuously reveals all enemy Command Centers on radar.', req: 'Internet Center', unlock: 'Enemy HQ Radar Detection' },
    satHack2: { name: 'Satellite Hack II', role: 'Orbital Espionage', cost: '$1500', desc: 'Reveals all enemy combat vehicles and structure positions on mini-map.', req: 'Internet Center', unlock: 'Total Hostile Tracking' },
    empPulse: { name: 'EMP Spy Disruption', role: 'Electronic Warfare', cost: '$500', desc: 'Discharges an electromagnetic pulse disabling power and vehicles in target sector.', req: 'Internet Center', unlock: 'EMP Disruption Wave' },
    uraniumShells: { name: 'Uranium Shells Tech', role: 'Kinetic Munition', cost: '$1200', desc: 'Depleted uranium penetrators for Battlemaster and Overlord tank cannons (+25% armor piercing).', req: 'Propaganda Center / Nuke Silo', unlock: '+25% Heavy Armor Piercing' },
    nuclearTanks: { name: 'Nuclear Tanks', role: 'Propulsion Research', cost: '$1000', desc: 'Equips Battlemaster and Overlord tanks with nuclear engines (+25% speed).', req: 'Nuke Silo', unlock: '+25% Heavy Tank Speed' },
    radarVanScan: { name: 'Radar Van Scan', role: 'Mobile Surveillance', cost: '$200', desc: 'Uplinks to Radar Van to reveal a targeted sector through fog of war.', req: 'Command Center', unlock: 'Targeted Shroud Clearance' },
    sneakAttack: { name: 'Sneak Attack Network', role: 'Subterranean Breach', cost: '$1000', desc: 'Erects an instant sneak attack tunnel breach at target coordinates.', req: 'Command Center', unlock: 'Instant Remote Tunnel' },
    boobyTrap: { name: 'Booby Trap', role: 'Sabotage Tactics', cost: '$500', desc: 'Enables Rebels to rig structures with lethal explosive charges.', req: 'Barracks', unlock: 'Structure Demolition Traps' },
    scorpionRocket: { name: 'Scorpion Rocket Tech', role: 'Heavy Turret Missile', cost: '$1000', desc: 'Mounts high-explosive missile launcher on Scorpion tank turrets.', req: 'Arms Dealer', unlock: 'Turret Rocket Salvo' },
    fortifiedStructures: { name: 'Fortified Structures', role: 'Masonry Reinforcement', cost: '$1000', desc: 'Increases HP and armor of all GLA buildings and GLA Holes by +25%.', req: 'Palace', unlock: '+25% Building & Hole HP' },
    toxinShells: { name: 'Toxin Shells', role: 'Chemical Munition', cost: '$1000', desc: 'Tank shells release toxic clouds that poison enemy infantry.', req: 'Palace', unlock: 'Poison Gas Residue' },
    demolitions: { name: 'Demolition Satchels', role: 'High Explosives', cost: '$800', desc: 'Equips combat units with demolition charges allowing manual or death detonation.', req: 'Palace', unlock: 'Devastating Death Explosions' },
    apBullets: { name: 'AP Bullets Tech', role: 'Armor Piercing Ammo', cost: '$1000', desc: 'Reinforced tungsten core ammunition for Rebels, Technicals, and Quad Cannons (+25% damage).', req: 'Black Market', unlock: '+25% Small Arms Damage' },
    apRockets: { name: 'AP Rockets Tech', role: 'Shaped Charge Warheads', cost: '$1200', desc: 'High-explosive anti-tank warheads for RPG Troopers and Rocket Buggies (+25% damage).', req: 'Black Market', unlock: '+25% Rocket Damage' },
    junkRepair: { name: 'Junk Repair Tech', role: 'Battlefield Scavenging', cost: '$1000', desc: 'GLA mechanics continuously scavenge battlefield scrap to repair all vehicles (+1 HP/s).', req: 'Black Market', unlock: 'Continuous Vehicle Auto-Healing' },
    buggyAmmo: { name: 'Buggy Ammo Chains', role: 'Ammunition Capacity', cost: '$800', desc: 'Increases Rocket Buggy rocket salvo capacity by +50% (9 rockets per volley).', req: 'Black Market', unlock: '+50% Buggy Salvo Size' },
    workerShoes: { name: 'Worker Shoes', role: 'Labor Logistics', cost: '$500', desc: 'Increases Worker movement speed by +25% and supply harvest rate.', req: 'Black Market', unlock: '+25% Worker Movement Speed' },
    camoNetting: { name: 'Camo Netting', role: 'Tactical Camouflage', cost: '$400', desc: 'Permanently stealths this defensive structure until it engages enemies.', req: 'Defensive Structure', unlock: 'Permanent Stealth Concealment' },
    upgradeToReal: { name: 'Upgrade to Real Structure', role: 'Decoy Conversion', cost: '$200 - $350', desc: 'Converts this decoy fake building into a real functional installation.', req: 'Decoy Structure', unlock: 'Full Operational Conversion' },
    camouflage: { name: 'Camouflage Tech', role: 'Guerilla Concealment', cost: '$1000', desc: 'Desert ghillie camouflage makes Rebels completely invisible when stationary.', req: 'Palace', unlock: 'Permanent Static Stealth' }
};

function showTacticalTooltip(event, id) {
    const tooltip = document.getElementById('tactical-tooltip');
    if (!tooltip) return;
    const info = tacticalBriefings[id];
    if (!info) return;

    let html = `
                <div class="tooltip-title">${info.name || id}</div>
                <div class="tooltip-role">${info.role || 'TACTICAL ASSET'}</div>
                <div class="tooltip-cost">${info.cost ? 'COST: ' + info.cost : 'STANDARD ASSET'}</div>
                <div class="tooltip-desc">${info.desc || ''}</div>
            `;
    if (info.req) {
        html += `<div class="tooltip-req">PREREQUISITE: ${info.req}</div>`;
    }
    if (info.unlock) {
        html += `<div class="tooltip-unlock">CAPABILITIES: ${info.unlock}</div>`;
    }

    tooltip.innerHTML = html;
    tooltip.style.display = 'block';

    const targetEl = event.currentTarget || event.target;
    const rect = targetEl.getBoundingClientRect();

    let left = rect.left - 270;
    if (left < 10) left = rect.right + 12;
    let top = Math.min(window.innerHeight - 240, Math.max(15, rect.top - 10));

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

function hideTacticalTooltip() {
    const tooltip = document.getElementById('tactical-tooltip');
    if (tooltip) tooltip.style.display = 'none';
}

function refreshFactionRoster() {
    const faction = factionCatalog[selectedFaction];
    // Official INIZH.big BuildTime values (in seconds)
    const OFFICIAL_UNIT_BUILD_TIME = {
        infantry: 5.0, ranger: 5.0, redguard: 10.0, rebel: 5.0,
        rocket: 5.0, missiledefender: 5.0, tankhunter: 5.0, rpg: 5.0,
        pathfinder: 10.0, hacker: 20.0, terrorist: 5.0, mob: 15.0, hijacker: 10.0,
        burton: 20.0, blacklotus: 20.0, jarmen: 20.0,
        technical: 5.0, humvee: 10.0, ambulance: 10.0, radarvan: 10.0,
        toxintractor: 5.0, dragon: 10.0, crawler: 15.0, bombtruck: 15.0, battlebus: 15.0,
        scorpion: 7.0, battlemaster: 10.0, crusader: 10.0, tank: 10.0,
        gatling: 10.0, quad: 6.0, buggy: 10.0,
        paladin: 12.0, marauder: 10.0, inferno: 15.0, scud: 15.0,
        tomahawk: 20.0, nukecannon: 20.0, nuketank: 20.0, overlord: 20.0,
        chinook: 10.0, comanche: 20.0, raptor: 20.0, mig: 10.0, stealthfighter: 25.0, aurora: 30.0,
        truck: 10.0, dozer: 5.0, worker: 3.0
    };
    unitRoster = {};
    const gDef = ZERO_HOUR_GENERALS[selectedGeneral];
    const modCost = (t, baseC) => (gDef && gDef.baseFaction === selectedFaction && gDef.costMods && gDef.costMods[t])
        ? Math.round(baseC * gDef.costMods[t])
        : baseC;

    // 1. Barracks Infantry
    if (faction.barracks) {
        Object.entries(faction.barracks).forEach(([type, data]) => {
                unitRoster[type] = { name: data[0], cost: modCost(type, data[1]), building: 'barracks', role: data[2] || 'Infantry', buildTime: OFFICIAL_UNIT_BUILD_TIME[type] || 5.0 };
        });
    }
    // 2. War Factory Ground Armor
    if (faction.factory) {
        Object.entries(faction.factory).forEach(([type, data]) => {
                unitRoster[type] = { name: data[0], cost: modCost(type, data[1]), building: 'factory', role: data[2] || 'Ground Vehicle', buildTime: OFFICIAL_UNIT_BUILD_TIME[type] || 10.0 };
        });
    }
    // 3. Airfield Aircraft & Helicopters
    if (faction.airfield) {
        Object.entries(faction.airfield).forEach(([type, data]) => {
                unitRoster[type] = { name: data[0], cost: modCost(type, data[1]), building: 'airfield', role: data[2] || 'Aircraft', buildTime: OFFICIAL_UNIT_BUILD_TIME[type] || 15.0 };
        });
    }
    // 4. Logistics (Supply Center)
    if (faction.supplyCenter) {
        Object.entries(faction.supplyCenter).forEach(([type, data]) => {
                unitRoster[type] = { name: data[0], cost: modCost(type, data[1]), building: 'supplyCenter', role: data[2] || 'Logistics', buildTime: OFFICIAL_UNIT_BUILD_TIME[type] || 10.0 };
        });
    }
    // 5. Command Center (Dozers / Workers)
    if (faction.commandCenter) {
        Object.entries(faction.commandCenter).forEach(([type, data]) => {
                unitRoster[type] = { name: data[0], cost: modCost(type, data[1]), building: 'commandCenter', role: data[2] || 'Construction', buildTime: OFFICIAL_UNIT_BUILD_TIME[type] || 5.0 };
        });
    }

    // Update Start Menu active faction buttons
    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
        document.querySelectorAll('[data-faction]').forEach(button => {
                if (button.dataset && button.dataset.faction === selectedFaction) button.classList.add('active');
                else if (button.classList) button.classList.remove('active');
        });
    }

    // Update Faction badge in Top HUD
    const badge = document.getElementById('sidebar-faction-badge');
    if (badge) {
        badge.textContent = selectedFaction === 'usa' ? 'USA STRATEGIC FORCES' :
        selectedFaction === 'china' ? 'PEOPLE\'S LIBERATION ARMY' : 'GLA CELL NETWORK';
    }
    updateSidebar();
}

let playerStartingPositionKey = 'alpha';
let aiDifficultyLevel = 'medium';
let aiFactionChosen = 'random';
let enemyStructures = [];
let isMatchActive = false;
let matchStartTime = 0;
let hasSpawnedInitialEnemyBase = false;
let playerTeamId = 1;
// activeCustomMap & savedCustomMaps declared in 01_core.js
let focusedSlotIdx = 0;

// Classic C&C Generals 8-Color Player Palette (multiplayer.ini)
const PLAYER_COLORS = [
    { id: 'red',    label: 'Red',            css: '#dc2626', hex: 0xdc2626 },
    { id: 'blue',   label: 'Blue',           css: '#2563eb', hex: 0x2563eb },
    { id: 'green',  label: 'Green',          css: '#16a34a', hex: 0x16a34a },
    { id: 'yellow', label: 'Yellow',         css: '#eab308', hex: 0xeab308 },
    { id: 'orange', label: 'Orange',         css: '#ea580c', hex: 0xea580c },
    { id: 'purple', label: 'Purple',         css: '#9333ea', hex: 0x9333ea },
    { id: 'teal',   label: 'Teal',           css: '#06b6d4', hex: 0x06b6d4 },
    { id: 'pink',   label: 'Pink / Magenta', css: '#ec4899', hex: 0xec4899 }
];
function getPlayerColorDef(colorId) {
    const normalized = colorId === 'cyan' ? 'teal' : (colorId === 'magenta' ? 'pink' : colorId);
    return PLAYER_COLORS.find(c => c.id === normalized) || PLAYER_COLORS[1];
}
function getPlayerColorHex(colorId) {
    return getPlayerColorDef(colorId).hex;
}
function applyPlayerColorToMaterials(hex) {
    if (typeof window !== 'undefined') window.selectedPlayerColorHex = hex;
    if (typeof matUSAColor !== 'undefined' && matUSAColor && matUSAColor.color) matUSAColor.color.setHex(hex);
    if (typeof matChinaColor !== 'undefined' && matChinaColor && matChinaColor.color) matChinaColor.color.setHex(hex);
    if (typeof matGLAColor !== 'undefined' && matGLAColor && matGLAColor.color) matGLAColor.color.setHex(hex);
}
if (typeof window !== 'undefined') {
    window.PLAYER_COLORS = PLAYER_COLORS;
    window.getPlayerColorHex = getPlayerColorHex;
    window.applyPlayerColorToMaterials = applyPlayerColorToMaterials;
    window.selectedPlayerColor = 'blue';
    window.selectedPlayerColorHex = 0x2563eb;
}

// --- SKIRMISH & MULTIPLAYER LOBBY SLOTS STATE ---
let spSlots = [
    { id: 1, name: 'Player (You)', isPlayer: true, isHuman: true, active: true, team: 1, faction: 'usa', color: 'blue', spawnId: 1, difficulty: 'medium' },
    { id: 2, name: 'AI Opponent 1', isPlayer: false, isHuman: false, active: true, team: 2, faction: 'random', color: 'red', spawnId: 2, difficulty: 'medium' },
    { id: 3, name: 'AI Slot 3', isPlayer: false, isHuman: false, active: false, team: 2, faction: 'random', color: 'green', spawnId: 3, difficulty: 'medium' },
    { id: 4, name: 'AI Slot 4', isPlayer: false, isHuman: false, active: false, team: 1, faction: 'random', color: 'yellow', spawnId: 4, difficulty: 'medium' },
    { id: 5, name: 'AI Slot 5', isPlayer: false, isHuman: false, active: false, team: 2, faction: 'random', color: 'cyan', spawnId: 5, difficulty: 'medium' },
    { id: 6, name: 'AI Slot 6', isPlayer: false, isHuman: false, active: false, team: 3, faction: 'random', color: 'orange', spawnId: 6, difficulty: 'medium' },
    { id: 7, name: 'AI Slot 7', isPlayer: false, isHuman: false, active: false, team: 3, faction: 'random', color: 'purple', spawnId: 7, difficulty: 'medium' },
    { id: 8, name: 'AI Slot 8', isPlayer: false, isHuman: false, active: false, team: 4, faction: 'random', color: 'pink', spawnId: 8, difficulty: 'medium' }
];

let mpSlots = [
    { id: 1, name: 'Host (You)', isPlayer: true, isHuman: true, isHost: true, active: true, team: 1, faction: 'usa', color: 'blue', spawnId: 1, difficulty: 'medium' },
    { id: 2, name: 'Challenger', isPlayer: false, isHuman: true, isHost: false, active: true, team: 2, faction: 'china', color: 'red', spawnId: 2, difficulty: 'medium' },
    { id: 3, name: 'AI Slot 3', isPlayer: false, isHuman: false, isHost: false, active: false, team: 2, faction: 'gla', color: 'green', spawnId: 3, difficulty: 'medium' },
    { id: 4, name: 'AI Slot 4', isPlayer: false, isHuman: false, isHost: false, active: false, team: 1, faction: 'usa', color: 'yellow', spawnId: 4, difficulty: 'medium' },
    { id: 5, name: 'AI Slot 5', isPlayer: false, isHuman: false, isHost: false, active: false, team: 2, faction: 'china', color: 'cyan', spawnId: 5, difficulty: 'medium' },
    { id: 6, name: 'AI Slot 6', isPlayer: false, isHuman: false, isHost: false, active: false, team: 3, faction: 'gla', color: 'orange', spawnId: 6, difficulty: 'medium' },
    { id: 7, name: 'AI Slot 7', isPlayer: false, isHuman: false, isHost: false, active: false, team: 3, faction: 'usa', color: 'purple', spawnId: 7, difficulty: 'medium' },
    { id: 8, name: 'AI Slot 8', isPlayer: false, isHuman: false, isHost: false, active: false, team: 4, faction: 'china', color: 'pink', spawnId: 8, difficulty: 'medium' }
];
window.spSlots = spSlots;
window.mpSlots = mpSlots;

// --- TEAM FRIENDLY / HOSTILE RESOLUTION ---
function isFriendly(assetA, assetB) {
    if (!assetA || !assetB) return false;
    const getTeam = (a) => {
        if (a.teamId !== undefined) return a.teamId;
        if (a.team !== undefined) return a.team;
        if (typeof units !== 'undefined' && units.includes(a)) return (typeof playerTeamId !== 'undefined' ? playerTeamId : 1);
        if (typeof structures !== 'undefined' && structures.includes(a)) return (typeof playerTeamId !== 'undefined' ? playerTeamId : 1);
        if (a.isAI) return 2;
        return (typeof playerTeamId !== 'undefined' ? playerTeamId : 1);
    };
    return getTeam(assetA) === getTeam(assetB);
}

// --- SPAWN POINTS DISTRIBUTION (Small: 4, Medium: 6, Large: 8) ---
function getSpawnPointsForMap(mapSize, mapType, customMap) {
    if (customMap && customMap.spawnPoints && customMap.spawnPoints.length > 0) {
        return customMap.spawnPoints;
    }

    const sz = mapSize || 1500;
    const officialMap = window.OFFICIAL_SKIRMISH_MAPS && window.OFFICIAL_SKIRMISH_MAPS[mapType];
    if (officialMap && officialMap.spawns && officialMap.spawns.length > 0) {
        return officialMap.spawns.map((s, idx) => ({
                    id: s.id || (idx + 1),
                    name: `Spawn ${s.id || (idx + 1)} (${officialMap.name})`,
                    x: Math.round(s.nx * sz),
                    z: Math.round(s.nz * sz)
        }));
    }

    if (mapType === 'tournament_desert') {
        return [
            { id: 1, name: 'Spawn 1 (South Plateau)', x: 0, z: -580 },
            { id: 2, name: 'Spawn 2 (North Plateau)', x: 0, z: 580 },
            { id: 3, name: 'Spawn 3 (West Flank)', x: -380, z: 0 },
            { id: 4, name: 'Spawn 4 (East Flank)', x: 380, z: 0 }
        ];
    }

    const spawns = [];
    if (mapSize <= 750) {
        // Small map: 4 spawn points (quadrants)
        const d = mapSize * 0.30;
        spawns.push(
            { id: 1, name: 'Spawn 1 (SW)', x: -d, z: d },
            { id: 2, name: 'Spawn 2 (NE)', x: d, z: -d },
            { id: 3, name: 'Spawn 3 (NW)', x: -d, z: -d },
            { id: 4, name: 'Spawn 4 (SE)', x: d, z: d }
        );
    } else if (mapSize <= 1050) {
        // Medium map: 6 spawn points evenly distributed in a ring
        const r = mapSize * 0.32;
        const count = 6;
        const dirs = ['S', 'SE', 'NE', 'N', 'NW', 'SW'];
        for (let i = 0; i < count; i++) {
            const angle = (i * (360 / count)) * (Math.PI / 180);
            const x = Math.round(Math.sin(angle) * r);
            const z = Math.round(Math.cos(angle) * r);
            spawns.push({ id: i + 1, name: `Spawn ${i + 1} (${dirs[i]})`, x, z });
        }
    } else {
        // Large map: 8 spawn points evenly distributed in a ring
        const r = mapSize * 0.33;
        const count = 8;
        const dirs = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
        for (let i = 0; i < count; i++) {
            const angle = (i * (360 / count)) * (Math.PI / 180);
            const x = Math.round(Math.sin(angle) * r);
            const z = Math.round(Math.cos(angle) * r);
            spawns.push({ id: i + 1, name: `Spawn ${i + 1} (${dirs[i]})`, x, z });
        }
    }
    return spawns;
}

// --- INTERACTIVE 2D MAP PREVIEW RENDERER ---
function renderMapPreview(canvasId, mapType, mapSize, slots, interactive) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // 1. Draw Terrain Background
    const officialMap = window.OFFICIAL_SKIRMISH_MAPS && window.OFFICIAL_SKIRMISH_MAPS[mapType];
    if (officialMap) {
        const offImg = window._officialMapImages && window._officialMapImages[mapType];
        if (offImg && offImg.complete && offImg.naturalWidth > 0) {
            ctx.drawImage(offImg, 0, 0, w, h);
        } else {
            if (offImg) {
                offImg.addEventListener('load', () => renderMapPreview(canvasId, mapType, mapSize, slots, interactive), { once: true });
            }
            const grid = officialMap.grid || [];
            const res = grid.length || 65;
            const cellW = w / res, cellH = h / res;
            for (let r = 0; r < res; r++) {
                for (let c = 0; c < res; c++) {
                    const val = (grid[r] && grid[r][c] !== undefined) ? grid[r][c] : 0;
                    const b = Math.min(245, Math.max(60, Math.floor(145 + val * 8)));
                    ctx.fillStyle = officialMap.theme === 'snow' ? `rgb(${b}, ${Math.min(255, b + 8)}, ${Math.min(255, b + 16)})` :
                    officialMap.theme === 'jungle' ? `rgb(${Math.floor(b * 0.45)}, ${Math.floor(b * 0.78)}, ${Math.floor(b * 0.36)})` :
                    `rgb(${b}, ${Math.floor(b * 0.84)}, ${Math.floor(b * 0.58)})`;
                    ctx.fillRect(c * cellW, r * cellH, cellW + 1, cellH + 1);
                }
            }
        }
        // Draw Supply Docks on Official Map Preview
        if (officialMap.supplies) {
            officialMap.supplies.forEach(s => {
                    const sx = (s.nx + 0.5) * w;
                    const sy = (s.nz + 0.5) * h;
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                    ctx.fillRect(sx - 4, sy - 4, 8, 8);
                    ctx.fillStyle = '#2ecc71';
                    ctx.fillRect(sx - 3, sy - 3, 6, 6);
            });
        }
    } else if (activeCustomMap && mapType && mapType.startsWith('custom_')) {
        const res = 32;
        const grid = activeCustomMap.heightGrid || [];
        const cellW = w / res;
        const cellH = h / res;
        for (let gy = 0; gy < res; gy++) {
            for (let gx = 0; gx < res; gx++) {
                const val = grid[gy * res + gx] !== undefined ? grid[gy * res + gx] : 2.5;
                if (val < (activeCustomMap.waterLevel || 0)) {
                    ctx.fillStyle = '#2980b9'; // Water
                } else {
                    const brightness = Math.min(255, Math.max(80, Math.floor(130 + val * 10)));
                    ctx.fillStyle = activeCustomMap.theme === 'jungle' ? `rgb(30, ${brightness}, 45)` :
                    activeCustomMap.theme === 'snow' ? `rgb(${brightness}, ${brightness}, 240)` :
                    activeCustomMap.theme === 'city' ? `rgb(${brightness*0.7}, ${brightness*0.7}, ${brightness*0.7})` :
                    `rgb(${brightness}, ${brightness*0.8}, 90)`;
                }
                ctx.fillRect(gx * cellW, gy * cellH, cellW + 1, cellH + 1);
            }
        }
    } else if (mapType === 'desert') {
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, '#cda26a');
        grad.addColorStop(0.5, '#b8894f');
        grad.addColorStop(1, '#dfbc85');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#a6773f';
        ctx.beginPath(); ctx.ellipse(w * 0.35, h * 0.3, w * 0.22, h * 0.12, Math.PI / 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3498db';
        ctx.beginPath(); ctx.ellipse(w * 0.72, h * 0.72, w * 0.08, h * 0.06, 0, 0, Math.PI * 2); ctx.fill();
    } else if (mapType === 'jungle') {
        ctx.fillStyle = '#1e3f20';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#2980b9';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(w * 0.1, h * 0.5);
        ctx.bezierCurveTo(w * 0.3, h * 0.3, w * 0.7, h * 0.7, w * 0.9, h * 0.5);
        ctx.stroke();
    } else if (mapType === 'snow') {
        ctx.fillStyle = '#dcdde1';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#718093';
        ctx.beginPath(); ctx.ellipse(w * 0.3, h * 0.25, w * 0.18, h * 0.08, Math.PI / 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#74b9ff';
        ctx.beginPath(); ctx.ellipse(w * 0.6, h * 0.65, w * 0.14, h * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    } else if (mapType === 'city') {
        ctx.fillStyle = '#2d3436';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#636e72';
        ctx.lineWidth = 4;
        for (let s = 30; s < w; s += 45) {
            ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(s, h); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, s); ctx.lineTo(w, s); ctx.stroke();
        }
    } else {
        ctx.fillStyle = '#3d4a3e';
        ctx.fillRect(0, 0, w, h);
    }

    // 2. Draw Spawn Points & Assignments
    const spawns = getSpawnPointsForMap(mapSize, mapType, activeCustomMap);
    const activeSlots = slots ? slots.filter(s => s.active) : [];

    spawns.forEach(sp => {
            const cx = (sp.x / mapSize + 0.5) * w;
            const cy = (sp.z / mapSize + 0.5) * h;
            const assignedSlot = activeSlots.find(s => s.spawnId === sp.id);

            ctx.beginPath();
            ctx.arc(cx, cy, 13, 0, Math.PI * 2);

            if (assignedSlot) {
                const cDef = getPlayerColorDef(assignedSlot.color);
                ctx.fillStyle = cDef.css;
                ctx.fill();
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = assignedSlot.isPlayer ? '#00ffcc' : assignedSlot.isHuman ? '#f1c40f' : '#ffffff';
                ctx.stroke();

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 9px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const txt = assignedSlot.isPlayer ? 'YOU' : assignedSlot.isHuman ? 'P2' : `AI${assignedSlot.id}`;
                ctx.fillText(txt, cx, cy);
            } else {
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = '#8f9e91';
                ctx.setLineDash([3, 2]);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.fillStyle = '#8f9e91';
                ctx.font = 'bold 10px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(sp.id, cx, cy);
            }
    });
}

// --- CLICK ON MAP PREVIEW TO ASSIGN SPAWN POINT ---
function handleMapPreviewClick(e, mode) {
    const canvasId = mode === 'single' ? 'sp-map-preview' : 'mp-map-preview';
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width ? (canvas.width / rect.width) : 1;
    const scaleY = rect.height ? (canvas.height / rect.height) : 1;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    const mapSize = parseInt(document.getElementById(mode === 'single' ? 'map-size' : 'mp-map-size').value, 10);
    const mapType = document.getElementById(mode === 'single' ? 'map-environment' : 'mp-map-env').value;
    const spawns = getSpawnPointsForMap(mapSize, mapType, activeCustomMap);

    for (let sp of spawns) {
        const cx = (sp.x / mapSize + 0.5) * canvas.width;
        const cy = (sp.z / mapSize + 0.5) * canvas.height;
        const dist = Math.hypot(clickX - cx, clickY - cy);
        if (dist <= 18) {
            updateSlot(mode, focusedSlotIdx, 'spawnId', sp.id);
            break;
        }
    }
}

function updateLobbySlotsCount(mode, maxSpawns, slots) {
    const countEl = document.getElementById(mode === 'single' ? 'sp-slots-count' : 'mp-slots-count');
    if (countEl) {
        const activeCount = slots.slice(0, maxSpawns).filter(s => s.active).length;
        countEl.innerText = `${maxSpawns} Spawns (${activeCount} Active)`;
    }
}

// --- SKIRMISH & MULTIPLAYER LOBBY SLOTS MANAGEMENT ---
function initLobbySlots(mode) {
    syncMapOptionsForBattlefieldSize(mode);
    const mapSize = parseInt(document.getElementById(mode === 'single' ? 'map-size' : 'mp-map-size').value, 10);
    const mapType = document.getElementById(mode === 'single' ? 'map-environment' : 'mp-map-env').value;
    const spawns = getSpawnPointsForMap(mapSize, mapType, activeCustomMap);
    const maxSpawns = Math.max(2, Math.min(8, spawns.length || getRequiredSpawnsForSize(mapSize)));
    const slots = mode === 'single' ? spSlots : mpSlots;

    slots.forEach((s, idx) => {
            if (idx < maxSpawns) {
                if (idx < 2) { s.active = true; s.closed = false; }
            } else {
                s.active = false;
            }
            const fallbackSpawnId = spawns[idx % maxSpawns] ? spawns[idx % maxSpawns].id : ((idx % maxSpawns) + 1);
            s.spawnId = fallbackSpawnId;
    });

    renderSlotsUI(mode);
    const canvasId = mode === 'single' ? 'sp-map-preview' : 'mp-map-preview';
    renderMapPreview(canvasId, mapType, mapSize, slots, true);
    updateLobbySlotsCount(mode, maxSpawns, slots);

    if (mode === 'single') {
        updateSkirmishMapSummary();
    }
}

function setFocusedSlot(mode, idx) {
    focusedSlotIdx = idx;
    const listEl = document.getElementById(mode === 'single' ? 'sp-slots-list' : 'mp-slots-list');
    if (!listEl) return;
    if (mode === 'single') {
        const rows = listEl.querySelectorAll('.zh-slot-row');
        rows.forEach((r, i) => r.classList.toggle('focused', i === idx));
        return;
    }
    const rows = listEl.querySelectorAll('.slot-row');
    rows.forEach((r, i) => {
            if (i === idx) {
                r.style.borderColor = '#55efc4';
                r.style.boxShadow = '0 0 8px rgba(85,239,196,0.3)';
            } else {
                const slots = mpSlots;
                r.style.borderColor = (slots[i] && slots[i].active) ? '#55efc4' : '#253327';
                r.style.boxShadow = 'none';
            }
    });
}

function renderSlotsUI(mode) {
    const listEl = document.getElementById(mode === 'single' ? 'sp-slots-list' : 'mp-slots-list');
    if (!listEl) return;
    const mapSize = parseInt(document.getElementById(mode === 'single' ? 'map-size' : 'mp-map-size').value, 10);
    const slots = mode === 'single' ? spSlots : mpSlots;
    const mapType = document.getElementById(mode === 'single' ? 'map-environment' : 'mp-map-env').value;
    const spawns = getSpawnPointsForMap(mapSize, mapType, activeCustomMap);
    const maxSpawns = Math.max(2, Math.min(8, spawns.length || getRequiredSpawnsForSize(mapSize)));

    let html = '';
    if (mode === 'single') {
        for (let i = 0; i < maxSpawns; i++) {
            const s = slots[i];
            const isFocused = (focusedSlotIdx === i);
            const curColorDef = getPlayerColorDef(s.color || PLAYER_COLORS[i % PLAYER_COLORS.length].id);
            const curTeam = (s.team === 0 || s.team) ? s.team : 0;

            html += `<div class="zh-slot-row ${isFocused ? 'focused' : ''} ${s.active ? '' : 'inactive-slot'}" onclick="setFocusedSlot('single', ${i});">`;

            // Col 1: Players (editable name for slot 0; Open/Closed/Difficulty for slots 1-7)
            html += `<div>`;
            if (i === 0) {
                const safeName = String(s.name || 'Player').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
                html += `<input id="sp-player-name" class="zh-skirmish-input" type="text" maxlength="20" value="${safeName}" onclick="event.stopPropagation(); setFocusedSlot('single', 0);" oninput="updateSlot('single', 0, 'name', this.value, true)">`;
            } else {
                const slotModeVal = !s.active ? (s.closed ? 'closed' : 'open') : (s.difficulty || 'medium');
                html += `<select class="zh-skirmish-select" onclick="event.stopPropagation(); setFocusedSlot('single', ${i});" onmousedown="event.stopPropagation();" onchange="updateSkirmishSlotType(${i}, this.value)">
                            <option value="open" ${slotModeVal === 'open' ? 'selected' : ''}>Open</option>
                            <option value="closed" ${slotModeVal === 'closed' ? 'selected' : ''}>Closed</option>
                            <option value="easy" ${slotModeVal === 'easy' ? 'selected' : ''}>Easy Army</option>
                            <option value="medium" ${slotModeVal === 'medium' ? 'selected' : ''}>Medium Army</option>
                            <option value="hard" ${slotModeVal === 'hard' ? 'selected' : ''}>Hard Army</option>
                        </select>`;
            }
            html += `</div>`;

            // Col 2: Color swatch + dropdown
            html += `<div class="zh-color-cell">`;
            html += `<span class="zh-color-swatch" style="background:${s.active ? curColorDef.css : '#263052'};"></span>`;
            html += `<select class="zh-skirmish-select" ${!s.active ? 'disabled' : ''} onclick="event.stopPropagation(); setFocusedSlot('single', ${i});" onmousedown="event.stopPropagation();" onchange="updateSlot('single', ${i}, 'color', this.value)">`;
            PLAYER_COLORS.forEach(c => {
                    html += `<option value="${c.id}" ${curColorDef.id === c.id ? 'selected' : ''}>${c.label}</option>`;
            });
            html += `</select></div>`;

            // Col 3: Faction
            html += `<div>`;
            if (i === 0) {
                html += `<select id="single-slot-0-faction" class="zh-skirmish-select" onclick="event.stopPropagation(); setFocusedSlot('single', 0);" onmousedown="event.stopPropagation();" onchange="selectFaction(this.value); updateSlot('single', 0, 'faction', this.value);">
                            <option value="usa" ${s.faction === 'usa' ? 'selected' : ''}>USA</option>
                            <option value="china" ${s.faction === 'china' ? 'selected' : ''}>China</option>
                            <option value="gla" ${s.faction === 'gla' ? 'selected' : ''}>GLA</option>
                            <option value="random" ${s.faction === 'random' ? 'selected' : ''}>Random</option>
                        </select>`;
            } else {
                html += `<select class="zh-skirmish-select" ${!s.active ? 'disabled' : ''} onclick="event.stopPropagation(); setFocusedSlot('single', ${i});" onmousedown="event.stopPropagation();" onchange="updateSlot('single', ${i}, 'faction', this.value)">
                            <option value="random" ${s.faction === 'random' ? 'selected' : ''}>Random</option>
                            <option value="usa" ${s.faction === 'usa' ? 'selected' : ''}>USA</option>
                            <option value="china" ${s.faction === 'china' ? 'selected' : ''}>China</option>
                            <option value="gla" ${s.faction === 'gla' ? 'selected' : ''}>GLA</option>
                        </select>`;
            }
            html += `</div>`;

            // Col 4: Team (None, 1, 2, 3, 4)
            html += `<div>`;
            html += `<select class="zh-skirmish-select" ${!s.active ? 'disabled' : ''} onclick="event.stopPropagation(); setFocusedSlot('single', ${i});" onmousedown="event.stopPropagation();" onchange="updateSlot('single', ${i}, 'team', parseInt(this.value, 10))">
                        <option value="0" ${curTeam === 0 ? 'selected' : ''}>None</option>
                        <option value="1" ${curTeam === 1 ? 'selected' : ''}>1</option>
                        <option value="2" ${curTeam === 2 ? 'selected' : ''}>2</option>
                        <option value="3" ${curTeam === 3 ? 'selected' : ''}>3</option>
                        <option value="4" ${curTeam === 4 ? 'selected' : ''}>4</option>
                    </select>`;
            html += `</div>`;

            html += `</div>`;
        }
        listEl.innerHTML = html;
        return;
    }

    for (let i = 0; i < maxSpawns; i++) {
        const s = slots[i];
        const isFocused = (focusedSlotIdx === i);

        html += `<div class="slot-row ${s.active ? 'active-slot' : ''}" style="${isFocused ? 'border-color:#55efc4; box-shadow:0 0 8px rgba(85,239,196,0.3);' : ''}" onclick="setFocusedSlot('${mode}', ${i});">`;

        // 1. Badge & Status Toggle
        html += `<div class="slot-badge">`;
        if (i === 0) {
            html += `<span style="color:#00ffcc;">👑 ${s.name}</span>`;
        } else if (i === 1 && mode === 'multiplayer') {
            html += `<span style="color:#f1c40f;">🚀 Challenger</span>`;
        } else {
            html += `<select class="slot-select" style="width:75px;" onclick="event.stopPropagation(); setFocusedSlot('${mode}', ${i});" onmousedown="event.stopPropagation();" onchange="updateSlot('${mode}', ${i}, 'active', this.value === '1')">
                        <option value="1" ${s.active ? 'selected' : ''}>Active</option>
                        <option value="0" ${!s.active ? 'selected' : ''}>Closed</option>
                    </select>`;
        }
        html += `</div>`;

        // 2. Faction Selector
        html += `<div>`;
        if (i === 0) {
            html += `<select id="${mode}-slot-0-faction" class="slot-select" onclick="event.stopPropagation(); setFocusedSlot('${mode}', ${i});" onmousedown="event.stopPropagation();" onchange="selectFaction(this.value); updateSlot('${mode}', ${i}, 'faction', this.value);">
                        <option value="usa" ${s.faction==='usa'?'selected':''}>USA Force</option>
                        <option value="china" ${s.faction==='china'?'selected':''}>China Force</option>
                        <option value="gla" ${s.faction==='gla'?'selected':''}>GLA Network</option>
                    </select>`;
        } else {
            html += `<select class="slot-select" ${!s.active ? 'disabled' : ''} onclick="event.stopPropagation(); setFocusedSlot('${mode}', ${i});" onmousedown="event.stopPropagation();" onchange="updateSlot('${mode}', ${i}, 'faction', this.value)">
                        <option value="usa" ${s.faction==='usa'?'selected':''}>USA Force</option>
                        <option value="china" ${s.faction==='china'?'selected':''}>China Force</option>
                        <option value="gla" ${s.faction==='gla'?'selected':''}>GLA Network</option>
                    </select>`;
        }
        html += `</div>`;

        // 2b. Player Color Selector
        const curColorDef = getPlayerColorDef(s.color || PLAYER_COLORS[i % PLAYER_COLORS.length].id);
        html += `<div style="display:flex; align-items:center; gap:4px;">`;
        html += `<span style="width:10px; height:10px; border-radius:2px; background:${curColorDef.css}; border:1px solid rgba(255,255,255,0.45); display:inline-block; flex-shrink:0;"></span>`;
        html += `<select class="slot-select" style="width:74px;" ${!s.active ? 'disabled' : ''} onclick="event.stopPropagation(); setFocusedSlot('${mode}', ${i});" onmousedown="event.stopPropagation();" onchange="updateSlot('${mode}', ${i}, 'color', this.value)">`;
        PLAYER_COLORS.forEach(c => {
                html += `<option value="${c.id}" ${curColorDef.id===c.id?'selected':''}>${c.label}</option>`;
        });
        html += `</select></div>`;

        // 3. Team Selector (Team 1, 2, 3, 4)
        html += `<div>`;
        html += `<select class="slot-select" ${!s.active ? 'disabled' : ''} onclick="event.stopPropagation(); setFocusedSlot('${mode}', ${i});" onmousedown="event.stopPropagation();" onchange="updateSlot('${mode}', ${i}, 'team', parseInt(this.value, 10))">
                    <option value="1" ${s.team===1?'selected':''}>🔵 Team 1</option>
                    <option value="2" ${s.team===2?'selected':''}>🔴 Team 2</option>
                    <option value="3" ${s.team===3?'selected':''}>🟢 Team 3</option>
                    <option value="4" ${s.team===4?'selected':''}>🟡 Team 4</option>
                </select>`;
        html += `</div>`;

        // 4. Difficulty Selector (for AI)
        html += `<div>`;
        if (s.isHuman) {
            html += `<span style="font-size:10px; color:#c5b98e; padding:3px;">Human</span>`;
        } else {
            html += `<select class="slot-select" ${!s.active ? 'disabled' : ''} onclick="event.stopPropagation(); setFocusedSlot('${mode}', ${i});" onmousedown="event.stopPropagation();" onchange="updateSlot('${mode}', ${i}, 'difficulty', this.value)">
                        <option value="easy" ${s.difficulty==='easy'?'selected':''}>Easy</option>
                        <option value="medium" ${s.difficulty==='medium'?'selected':''}>Medium</option>
                        <option value="hard" ${s.difficulty==='hard'?'selected':''}>Hard</option>
                    </select>`;
        }
        html += `</div>`;

        // 5. Spawn Location Selector
        html += `<div>`;
        html += `<select class="slot-select" ${!s.active ? 'disabled' : ''} onclick="event.stopPropagation(); setFocusedSlot('${mode}', ${i});" onmousedown="event.stopPropagation();" onchange="updateSlot('${mode}', ${i}, 'spawnId', parseInt(this.value, 10))">`;
        spawns.forEach(sp => {
                html += `<option value="${sp.id}" ${s.spawnId===sp.id?'selected':''}>${sp.name}</option>`;
        });
        html += `</select></div>`;

        html += `</div>`;
    }
    listEl.innerHTML = html;
}

function updateSkirmishSlotType(slotIdx, val) {
    const slot = spSlots[slotIdx];
    if (!slot) return;
    if (typeof playAudio === 'function') playAudio('gui_combo', { volume: 0.55 });
    if (val === 'open' || val === 'closed') {
        slot.active = false;
        slot.closed = (val === 'closed');
    } else {
        slot.active = true;
        slot.closed = false;
        slot.difficulty = val;
    }
    const mapSize = parseInt(document.getElementById('map-size').value, 10);
    const mapType = document.getElementById('map-environment').value;
    const spawns = getSpawnPointsForMap(mapSize, mapType, activeCustomMap);
    const maxSpawns = Math.max(2, Math.min(8, spawns.length || getRequiredSpawnsForSize(mapSize)));
    renderSlotsUI('single');
    renderMapPreview('sp-map-preview', mapType, mapSize, spSlots, true);
    updateLobbySlotsCount('single', maxSpawns, spSlots);
}

function updateSlot(mode, slotIdx, field, value, skipRerender = false) {
    const slots = mode === 'single' ? spSlots : mpSlots;
    const targetSlot = slots[slotIdx];
    if (!targetSlot) return;

    if (field === 'spawnId') {
        const existing = slots.find((s, idx) => idx !== slotIdx && s.active && s.spawnId === value);
        if (existing) {
            existing.spawnId = targetSlot.spawnId;
        }
        targetSlot.spawnId = value;
    } else {
        targetSlot[field] = value;
    }
    if (field === 'color' && slotIdx === 0) {
        if (typeof window !== 'undefined') window.selectedPlayerColor = value;
        applyPlayerColorToMaterials(getPlayerColorHex(value));
    }

    if (skipRerender) return;

    renderSlotsUI(mode);
    const canvasId = mode === 'single' ? 'sp-map-preview' : 'mp-map-preview';
    const mapSize = parseInt(document.getElementById(mode === 'single' ? 'map-size' : 'mp-map-size').value, 10);
    const mapType = document.getElementById(mode === 'single' ? 'map-environment' : 'mp-map-env').value;
    renderMapPreview(canvasId, mapType, mapSize, slots, true);
    if (mode === 'single') {
        const spawns = getSpawnPointsForMap(mapSize, mapType, activeCustomMap);
        const maxSpawns = Math.max(2, Math.min(8, spawns.length || getRequiredSpawnsForSize(mapSize)));
        updateLobbySlotsCount('single', maxSpawns, slots);
    }

    if (mode === 'multiplayer') {
        syncMpLobbyToPeer();
    }
}

function getRequiredSpawnsForSize(mapSize) {
    const sz = parseInt(mapSize, 10) || 600;
    if (sz <= 750) return 4;
    if (sz <= 1050) return 6;
    return 8;
}

function getMapMaxPlayers(mapKey) {
    if (typeof window !== 'undefined' && window.OFFICIAL_SKIRMISH_MAPS && window.OFFICIAL_SKIRMISH_MAPS[mapKey]) {
        const m = window.OFFICIAL_SKIRMISH_MAPS[mapKey];
        if (m.spawns && m.spawns.length > 0) return m.spawns.length;
        return m.maxPlayers || 4;
    }
    if (mapKey && String(mapKey).startsWith('custom_') && typeof savedCustomMaps !== 'undefined' && savedCustomMaps && savedCustomMaps[mapKey]) {
        const cm = savedCustomMaps[mapKey];
        if (cm.spawnPoints && cm.spawnPoints.length > 0) return cm.spawnPoints.length;
        return getRequiredSpawnsForSize(cm.size || 1500);
    }
    // Procedural theaters (desert, jungle, snow, city, random) dynamically scale to 4, 6, or 8 spawns
    return 8;
}

function doesMapMatchBattlefieldSize(mapKey, mapSize) {
    const requiredSpawns = getRequiredSpawnsForSize(mapSize);
    // Procedural theaters dynamically scale to exact 4, 6, or 8 spawns for the chosen size category
    if (['desert', 'jungle', 'snow', 'city', 'random'].includes(mapKey)) {
        return true;
    }
    const maxP = getMapMaxPlayers(mapKey);
    return maxP === requiredSpawns;
}

function syncMapOptionsForBattlefieldSize(mode) {
    if (typeof document === 'undefined') return;
    const envEl = document.getElementById(mode === 'single' ? 'map-environment' : 'mp-map-env');
    const sizeEl = document.getElementById(mode === 'single' ? 'map-size' : 'mp-map-size');
    if (!envEl || !sizeEl) return;

    const mapSize = parseInt(sizeEl.value, 10) || 600;
    const options = Array.from(envEl.options || []);
    let firstCompatibleVal = null;

    options.forEach(opt => {
        const supported = doesMapMatchBattlefieldSize(opt.value, mapSize);
        opt.hidden = !supported;
        opt.disabled = !supported;
        if (supported && firstCompatibleVal === null) {
            firstCompatibleVal = opt.value;
        }
    });

    if (typeof envEl.querySelectorAll === 'function') {
        envEl.querySelectorAll('optgroup').forEach(og => {
            const hasVisible = Array.from(og.querySelectorAll('option')).some(o => !o.hidden);
            og.hidden = !hasVisible;
            og.disabled = !hasVisible;
        });
    }

    if (!doesMapMatchBattlefieldSize(envEl.value, mapSize) && firstCompatibleVal !== null) {
        envEl.value = firstCompatibleVal;
        if (firstCompatibleVal.startsWith('custom_') && typeof savedCustomMaps !== 'undefined' && savedCustomMaps[firstCompatibleVal]) {
            activeCustomMap = savedCustomMaps[firstCompatibleVal];
        } else {
            activeCustomMap = null;
        }
    }
}

function onMapSelectionChange(mode) {
    const mapType = document.getElementById(mode === 'single' ? 'map-environment' : 'mp-map-env').value;
    const sizeEl = document.getElementById(mode === 'single' ? 'map-size' : 'mp-map-size');

    if (mapType.startsWith('custom_') && savedCustomMaps[mapType]) {
        activeCustomMap = savedCustomMaps[mapType];
        if (sizeEl) sizeEl.value = String(activeCustomMap.size || 1500);
    } else {
        activeCustomMap = null;
    }

    initLobbySlots(mode);
    if (mode === 'single') {
        const modal = document.getElementById('skirmish-map-modal');
        if (modal && !modal.hidden) renderSkirmishMapPickerGrid();
    }
    if (mode === 'multiplayer') syncMpLobbyToPeer();
}

function onMapSizeChange(mode) {
    syncMapOptionsForBattlefieldSize(mode);
    initLobbySlots(mode);
    if (mode === 'single') {
        const modal = document.getElementById('skirmish-map-modal');
        if (modal && !modal.hidden) renderSkirmishMapPickerGrid();
    }
    if (mode === 'multiplayer') syncMpLobbyToPeer();
}

function updateSkirmishMapSummary() {
    if (typeof document === 'undefined') return;
    const envEl = document.getElementById('map-environment');
    const sizeEl = document.getElementById('map-size');
    const mapType = (envEl && envEl.value) ? envEl.value : 'tournament_desert';
    const mapSize = sizeEl ? (parseInt(sizeEl.value, 10) || 1500) : 1500;
    const officialMap = (typeof window !== 'undefined' && window.OFFICIAL_SKIRMISH_MAPS) ? window.OFFICIAL_SKIRMISH_MAPS[mapType] : null;
    const selectedOptText = (envEl && envEl.options && envEl.selectedIndex >= 0 && envEl.options[envEl.selectedIndex] && envEl.options[envEl.selectedIndex].text)
        ? String(envEl.options[envEl.selectedIndex].text)
        : String(mapType);

    const nameEl = document.getElementById('sp-map-display-name');
    if (nameEl) {
        nameEl.textContent = officialMap ? officialMap.name : ((activeCustomMap && activeCustomMap.name) ? activeCustomMap.name : selectedOptText.split(' (')[0]);
    }

    const intelEl = document.getElementById('sp-map-intel');
    if (intelEl) {
        if (officialMap) {
            const derricks = (officialMap.derricks || []).length;
            const hospitals = (officialMap.hospitals || []).length;
            const refineries = (officialMap.refineries || []).length;
            const techParts = [];
            if (derricks) techParts.push(`${derricks} Oil Derrick${derricks > 1 ? 's' : ''}`);
            if (hospitals) techParts.push(`${hospitals} Hospital${hospitals > 1 ? 's' : ''}`);
            if (refineries) techParts.push(`${refineries} Oil Refiner${refineries > 1 ? 'ies' : 'y'}`);
            const techText = techParts.length ? ` • Tech: ${techParts.join(', ')}` : '';
            intelEl.textContent = `${officialMap.name} • Official EA ${(officialMap.theme || 'desert').toUpperCase()} Map (${officialMap.maxPlayers || 4}P)${techText}`;
        } else if (activeCustomMap && mapType.startsWith('custom_')) {
            intelEl.textContent = `${activeCustomMap.name} • Custom Map (${mapSize}x${mapSize})`;
        } else {
            intelEl.textContent = `${selectedOptText} • Procedural Theater (${mapSize}x${mapSize})`;
        }
    }

    const overviewEl = document.getElementById('faction-overview');
    const briefingEl = document.getElementById('sp-faction-briefing');
    if (briefingEl) {
        const curFac = (spSlots[0] && spSlots[0].faction) || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa');
        if (curFac === 'random') {
            briefingEl.textContent = 'Random — Faction assigned randomly at deployment (USA, China, or GLA).';
        } else if (overviewEl && overviewEl.textContent) {
            briefingEl.textContent = overviewEl.textContent;
        }
    }
}

function renderSkirmishMapPickerGrid() {
    const gridEl = document.getElementById('skirmish-map-grid');
    const envEl = document.getElementById('map-environment');
    const sizeEl = document.getElementById('map-size');
    if (!gridEl) return;
    syncMapOptionsForBattlefieldSize('single');
    const currentKey = envEl ? envEl.value : 'tournament_desert';
    const mapSize = sizeEl ? (parseInt(sizeEl.value, 10) || 600) : 600;
    const requiredSpawns = getRequiredSpawnsForSize(mapSize);
    const items = [];
    let hiddenCount = 0;

    if (typeof window !== 'undefined' && window.OFFICIAL_SKIRMISH_MAPS) {
        Object.keys(window.OFFICIAL_SKIRMISH_MAPS).forEach(key => {
                const m = window.OFFICIAL_SKIRMISH_MAPS[key];
                if (!m) return;
                const maxP = (m.spawns && m.spawns.length > 0) ? m.spawns.length : (m.maxPlayers || 4);
                if (!doesMapMatchBattlefieldSize(key, mapSize)) {
                    hiddenCount++;
                    return;
                }
                items.push({
                    key,
                    name: m.name || key,
                    sub: `Official EA • ${maxP} Spawns • ${m.theme || 'desert'}`,
                    thumb: m.terrainDataUrl || ''
                });
        });
    }

    [
        { key: 'desert', name: 'Desert Canyon', sub: `Procedural • ${requiredSpawns} Spawns • Desert` },
        { key: 'jungle', name: 'Tropical Jungle', sub: `Procedural • ${requiredSpawns} Spawns • Jungle` },
        { key: 'snow', name: 'Frozen Mountain', sub: `Procedural • ${requiredSpawns} Spawns • Snow` },
        { key: 'city', name: 'Small City Grid', sub: `Procedural • ${requiredSpawns} Spawns • Urban` },
        { key: 'random', name: 'Procedural Warzone', sub: `Procedural • ${requiredSpawns} Spawns • Random` }
    ].forEach(p => items.push({ key: p.key, name: p.name, sub: p.sub, thumb: '' }));

    if (typeof savedCustomMaps !== 'undefined' && savedCustomMaps) {
        Object.keys(savedCustomMaps).forEach(k => {
                const cm = savedCustomMaps[k];
                if (!cm) return;
                const maxP = getMapMaxPlayers(k);
                if (!doesMapMatchBattlefieldSize(k, mapSize)) {
                    hiddenCount++;
                    return;
                }
                items.push({ key: k, name: cm.name || k, sub: `Custom • ${maxP} Spawns • ${cm.size || 1500}m`, thumb: '' });
        });
    }

    const filterNote = hiddenCount > 0
        ? `<div style="grid-column: 1 / -1; font-size: 11px; color: #9fb8d8; padding: 4px 8px; background: rgba(16, 30, 54, 0.72); border: 1px solid rgba(110, 168, 254, 0.3); border-radius: 3px;">Showing ${requiredSpawns}-spawn maps (${mapSize}x${mapSize}). ${hiddenCount} map${hiddenCount > 1 ? 's' : ''} from other size categories hidden.</div>`
        : '';

    gridEl.innerHTML = filterNote + items.map(item => {
            const selectedCls = item.key === currentKey ? 'selected' : '';
            const safeKey = String(item.key).replace(/'/g, "\\'");
            const thumbHtml = item.thumb
                ? `<img class="zh-map-pick-thumb" src="${item.thumb}" alt="${item.name}" />`
                : `<div class="zh-map-pick-thumb procedural-thumb">Procedural</div>`;
            return `<button type="button" class="zh-map-pick-card ${selectedCls}" onclick="selectSkirmishMapFromModal('${safeKey}')">${thumbHtml}<div class="zh-map-pick-title">${item.name}</div><div class="zh-map-pick-sub">${item.sub}</div></button>`;
    }).join('');
}

let _lastSliderGuiSoundAt = 0;

function selectSkirmishMapFromModal(mapKey) {
    if (typeof playAudio === 'function') playAudio('gui_click', { volume: 0.6 });
    const envEl = document.getElementById('map-environment');
    if (envEl) {
        envEl.value = mapKey;
        onMapSelectionChange('single');
    }
    renderSkirmishMapPickerGrid();
}

function openSkirmishMapModal() {
    if (typeof playAudio === 'function') playAudio('gui_click', { volume: 0.6 });
    const modal = document.getElementById('skirmish-map-modal');
    if (!modal) return;
    renderSkirmishMapPickerGrid();
    modal.hidden = false;
}

function closeSkirmishMapModal() {
    if (typeof playAudio === 'function') playAudio('gui_click', { volume: 0.6 });
    const modal = document.getElementById('skirmish-map-modal');
    if (modal) modal.hidden = true;
}

function onSkirmishGameSpeedChange(val) {
    if (typeof playAudio === 'function') {
        const now = Date.now();
        if (now - _lastSliderGuiSoundAt > 90) {
            _lastSliderGuiSoundAt = now;
            playAudio('gui_slider', { volume: 0.35 });
        }
    }
    const num = Number(val) || 30;
    const valEl = document.getElementById('skirmish-game-speed-val');
    if (valEl) valEl.textContent = String(num);
    if (typeof window !== 'undefined') {
        window.skirmishGameSpeed = num;
        window.gameSpeedMultiplier = Math.max(0.5, Math.min(2.0, num / 30));
    }
}

const SKIRMISH_STATS_STORAGE_KEY = 'cnc_zh_skirmish_stats_v1';

function readSkirmishStatsObj() {
    try {
        if (typeof localStorage === 'undefined') return { wins: 0, losses: 0, curStreak: 0, bestStreak: 0 };
        const raw = localStorage.getItem(SKIRMISH_STATS_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return {
                wins: Number(parsed.wins) || 0,
                losses: Number(parsed.losses) || 0,
                curStreak: Number(parsed.curStreak) || 0,
                bestStreak: Number(parsed.bestStreak) || 0
            };
        }
    } catch (_) {}
    return { wins: 0, losses: 0, curStreak: 0, bestStreak: 0 };
}

function renderSkirmishStatsObj(stats) {
    if (typeof document === 'undefined') return;
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(val);
    };
    set('skirmish-stat-best-streak', stats.bestStreak);
    set('skirmish-stat-cur-streak', stats.curStreak);
    set('skirmish-stat-wins', stats.wins);
    set('skirmish-stat-losses', stats.losses);
}

function loadSkirmishStats() {
    renderSkirmishStatsObj(readSkirmishStatsObj());
}

function recordSkirmishOutcome(won) {
    const stats = readSkirmishStatsObj();
    if (won) {
        stats.wins += 1;
        stats.curStreak += 1;
        if (stats.curStreak > stats.bestStreak) stats.bestStreak = stats.curStreak;
    } else {
        stats.losses += 1;
        stats.curStreak = 0;
    }
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(SKIRMISH_STATS_STORAGE_KEY, JSON.stringify(stats));
        }
    } catch (_) {}
    renderSkirmishStatsObj(stats);
}

function resetSkirmishStats() {
    const empty = { wins: 0, losses: 0, curStreak: 0, bestStreak: 0 };
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(SKIRMISH_STATS_STORAGE_KEY, JSON.stringify(empty));
        }
    } catch (_) {}
    renderSkirmishStatsObj(empty);
}


