function createUSACommandCenter() {
    const g = new THREE.Group();
    // Heavy reinforced concrete foundation slab with hazard perimeter
    const base = new THREE.Mesh(new THREE.BoxGeometry(13.8, 0.65, 12.8), matConcrete);
    base.position.y = 0.32; base.receiveShadow = true; g.add(base);

    // Hazard warning boundary border
    [-6.6, 6.6].forEach(x => {
        const curb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 12.8), matHazard);
        curb.position.set(x, 0.7, 0); g.add(curb);
    });

    // Helipad marked area with white 'H' and perimeter lights
    const pad = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.06, 5.4), matDarkMetal);
    pad.position.set(3.5, 0.65, 2.8); g.add(pad);

    const hBar1 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 2.4), matConcrete);
    hBar1.position.set(2.7, 0.68, 2.8); g.add(hBar1);
    const hBar2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 2.4), matConcrete);
    hBar2.position.set(4.3, 0.68, 2.8); g.add(hBar2);
    const hCross = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.35), matConcrete);
    hCross.position.set(3.5, 0.68, 2.8); g.add(hCross);

    // Helipad touchdown perimeter lights
    [-2.5, 2.5].forEach(x => {
        [-2.5, 2.5].forEach(z => {
            const light = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), matBeaconAmber);
            light.position.set(3.5 + x, 0.72, 2.8 + z); g.add(light);
        });
    });

    // Main 2-story Operations Command Pavilion
    const mainOps = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.8, 6.5), matUSA);
    mainOps.position.set(-2.8, 2.2, 0); mainOps.castShadow = true; g.add(mainOps);

    // Elevated radar & intelligence tower
    const tower = new THREE.Mesh(new THREE.BoxGeometry(3.6, 5.2, 3.6), matUSAColor);
    tower.position.set(-4.2, 3.2, -3.2); tower.castShadow = true; g.add(tower);

    // Rooftop solar tech panels
    const solar = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.08, 5.2), matSolar);
    solar.position.set(-2.8, 4.14, 0); g.add(solar);

    // Rotating Radar Dish (radarDish)
    const dishGroup = new THREE.Group();
    dishGroup.name = "radarDish";
    dishGroup.position.set(-2.0, 5.4, -1.2);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.4, 8), matGunmetal);
    dishGroup.add(mast);

    const dish = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), matDarkMetal);
    dish.scale.set(1.4, 0.35, 1); dish.rotation.x = -Math.PI / 4; dish.position.set(0, 0.8, 0); dishGroup.add(dish);
    g.add(dishGroup);

    // Flashing red obstruction beacon (hazardBeacon)
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), matBeaconRed);
    beacon.name = "hazardBeacon";
    beacon.position.set(-4.2, 8.0, -3.2); g.add(beacon);

    // Perimeter security spotlights
    [-6.2, 6.2].forEach(x => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.5, 6), matGunmetal);
        post.position.set(x, 1.6, -5.5); g.add(post);

        const spot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), matWindowGlow);
        spot.position.set(x, 2.8, -5.5); g.add(spot);
    });

    return g;
}

function createUSAColdFusionReactor() {
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 5.2, 0.55, 14), matConcrete);
    pad.position.y = 0.28; pad.receiveShadow = true; g.add(pad);

    // Hazard rim
    const rim = new THREE.Mesh(new THREE.TorusGeometry(5.0, 0.15, 6, 16), matHazard);
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.55; g.add(rim);

    // Central Heavy Reactor Housing
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 2.4, 14), matDarkMetal);
    housing.position.y = 1.48; housing.castShadow = true; g.add(housing);

    // 4 High-tech Heatsink / Cooling Pylons
    for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        const x = Math.cos(angle) * 3.6, z = Math.sin(angle) * 3.6;

        const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.6, 0.9), matUSA);
        pylon.position.set(x, 2.1, z); pylon.castShadow = true; g.add(pylon);

        // Power conduit cable
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), matIonBlue);
        cable.rotation.z = Math.PI / 4; cable.position.set(x * 0.6, 2.6, z * 0.6); g.add(cable);
    }

    // Glowing Cold Fusion Core Sphere (fusionCore - pulses during animation)
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.35, 14, 12), matIonBlue);
    core.name = "fusionCore";
    core.position.y = 4.2; g.add(core);

    // Magnetic containment ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.14, 8, 16), matChrome);
    ring.rotation.x = Math.PI / 2; ring.position.y = 4.2; g.add(ring);

    return g;
}

function createUSABarracks() {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.48, 8.6), matConcrete);
    slab.position.y = 0.24; slab.receiveShadow = true; g.add(slab);

    // Main Quonset Hut Bunker Hall
    const hall = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 7.2, 14, 1, false, 0, Math.PI), matUSA);
    hall.rotation.z = Math.PI / 2; hall.rotation.y = Math.PI / 2;
    hall.position.set(0, 0.48, 0); hall.castShadow = true; g.add(hall);

    // Heavy reinforced blast doors with hazard stripes
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 0.15), matHazard);
    door.position.set(0, 1.35, 3.62); g.add(door);

    // Sandbag firing parapet along perimeter
    const sandbags = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.55, 0.45), matSandbags);
    sandbags.position.set(0, 0.5, 4.05); g.add(sandbags);

    // US Flag mast
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.2, 6), matGunmetal);
    mast.position.set(-4.0, 1.8, 3.4); g.add(mast);

    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.5, 0.04), matUSAColor);
    flag.name = "factionFlag";
    flag.position.set(-3.5, 3.0, 3.4); g.add(flag);

    // Rooftop air conditioning / ventilation unit
    const ac = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 1.2), matDarkMetal);
    ac.position.set(0, 3.4, -1.2); g.add(ac);

    return g;
}

function createUSAWarFactory() {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.55, 10.6), matConcrete);
    slab.position.y = 0.28; slab.receiveShadow = true; g.add(slab);

    // Main vehicle assembly hangar with corrugated steel roof
    const hangar = new THREE.Mesh(new THREE.BoxGeometry(11.8, 5.2, 9.2), matUSA);
    hangar.position.set(0, 2.85, 0); hangar.castShadow = true; g.add(hangar);

    // Massive double roll-up industrial blast doors
    [-2.8, 2.8].forEach(x => {
        const door = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.6, 0.18), matCorrugated);
        door.position.set(x, 2.1, 4.62); g.add(door);

        // Yellow/black hazard clearance header
        const header = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.35, 0.22), matHazard);
        header.position.set(x, 4.05, 4.62); g.add(header);
    });

    // Rooftop overhead gantry crane rails & exhaust funnels
    const rail1 = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.25, 0.25), matGunmetal);
    rail1.position.set(0, 5.5, -2.5); g.add(rail1);
    const rail2 = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.25, 0.25), matGunmetal);
    rail2.position.set(0, 5.5, 2.5); g.add(rail2);

    [-4.5, 4.5].forEach(x => {
        const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.2, 8), matDarkMetal);
        vent.position.set(x, 5.8, -3.2); g.add(vent);
    });

    return g;
}

function createUSASupplyCenter() {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(12.8, 0.52, 10.8), matConcrete);
    slab.position.y = 0.26; g.add(slab);

    // Main supply depot warehouse
    const depot = new THREE.Mesh(new THREE.BoxGeometry(9.6, 4.2, 6.5), matUSA);
    depot.position.set(-1.2, 2.35, -1.8); depot.castShadow = true; g.add(depot);

    // Unloading Pad with hazard warning borders
    const pad = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.08, 5.2), matDarkMetal);
    pad.position.set(3.2, 0.54, 2.4); g.add(pad);

    const padBorder = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.1, 0.3), matHazard);
    padBorder.position.set(3.2, 0.56, 4.9); g.add(padBorder);

    // Stacked supply cargo crates on pallets
    [-2.2, -0.6].forEach(x => {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 1.2), matTarp);
        crate.position.set(x, 1.05, 2.8); g.add(crate);
    });

    return g;
}

function createUSASupplyDropZone() {
    const g = new THREE.Group();
    // Large military landing pad with central cross
    const pad = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.38, 11.5), matConcrete);
    pad.position.y = 0.19; g.add(pad);

    const cross1 = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.06, 1.2), matUSAColor);
    cross1.position.set(0, 0.4, 0); g.add(cross1);
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 7.2), matUSAColor);
    cross2.position.set(0, 0.4, 0); g.add(cross2);

    // 4 Corner landing towers with orange strobe beacons (hazardBeacon)
    [-4.8, 4.8].forEach(x => {
        [-4.8, 4.8].forEach(z => {
            const tower = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.4, 0.7), matGunmetal);
            tower.position.set(x, 0.9, z); g.add(tower);

            const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), matBeaconAmber);
            strobe.name = "hazardBeacon";
            strobe.position.set(x, 1.7, z); g.add(strobe);
        });
    });

    return g;
}

function createUSAAirfield() {
    const g = new THREE.Group();
    // Tarmac runway strip with directional arrows
    const tarmac = new THREE.Mesh(new THREE.BoxGeometry(15.8, 0.28, 13.8), matDarkMetal);
    tarmac.position.y = 0.14; tarmac.receiveShadow = true; g.add(tarmac);

    // White runway centerlines
    for (let z = -5.0; z <= 5.0; z += 3.2) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 1.8), matConcrete);
        stripe.position.set(0, 0.3, z); g.add(stripe);
    }

    // Aircraft parking hardstand tie-downs
    [-5.5, 5.5].forEach(x => {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.06, 4.2), matConcrete);
        pad.position.set(x, 0.29, 0); g.add(pad);
    });

    // Control Tower with tinted glass observation cab
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 5.8, 2.4), matUSA);
    tower.position.set(-5.6, 3.0, -4.5); tower.castShadow = true; g.add(tower);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 3.2), matBlueGlass);
    cab.position.set(-5.6, 6.2, -4.5); g.add(cab);

    // Radar dish on tower roof (radarDish)
    const radarGroup = new THREE.Group();
    radarGroup.name = "radarDish";
    radarGroup.position.set(-5.6, 7.4, -4.5);

    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 6), matDarkMetal);
    dish.scale.set(1.3, 0.35, 1.0); dish.rotation.x = -Math.PI / 4; dishGroup => {};
    radarGroup.add(dish);
    g.add(radarGroup);

    return g;
}

function createUSAStrategyCenter() {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.8, 0.55, 18), matConcrete);
    slab.position.y = 0.28; g.add(slab);

    // Grand circular operations rotunda
    const pavilion = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.5, 3.2, 16), matUSA);
    pavilion.position.y = 2.15; pavilion.castShadow = true; g.add(pavilion);

    // High-tech domed roof
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3.8, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), matSolar);
    dome.position.y = 3.75; g.add(dome);

    // Central satellite communications spire
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 3.6, 8), matGunmetal);
    mast.position.set(0, 5.6, 0); g.add(mast);

    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), matBeaconRed);
    beacon.position.set(0, 7.4, 0); g.add(beacon);

    return g;
}

function createUSAPatriotSystem() {
    const g = new THREE.Group();
    // Concrete pad & sandbag revetment
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 3.3, 0.48, 12), matConcrete);
    pad.position.y = 0.24; g.add(pad);

    const berm = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.45, 6, 14), matSandbags);
    berm.rotation.x = Math.PI / 2; berm.position.y = 0.48; g.add(berm);

    // Rotating 4-Cell Launcher Turret (turretSystem)
    const turretSys = new THREE.Group();
    turretSys.name = "turretSystem";
    turretSys.position.set(0, 0.65, 0);

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 0.6, 12), matDarkMetal);
    pedestal.position.y = 0.3; turretSys.add(pedestal);

    // Elevating 4-cell box launcher
    const launcherBox = new THREE.Group();
    launcherBox.position.set(0, 0.75, 0);
    launcherBox.rotation.x = -Math.PI / 4; // 45-degree skyward tracking

    const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 2.6), matUSA);
    box.position.set(0, 0.45, 0.4); box.castShadow = true; launcherBox.add(box);

    // 4 Missile launch tubes with red caps
    [-0.45, 0.45].forEach(x => {
        [-0.22, 0.22].forEach(y => {
            const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), matRedStar);
            cap.position.set(x, 0.45 + y, 1.72); launcherBox.add(cap);
        });
    });

    // Tracking radar dome on launcher side
    const radome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), matGunmetal);
    radome.position.set(1.1, 0.5, 0.2); launcherBox.add(radome);

    turretSys.add(launcherBox);
    g.add(turretSys);
    return g;
}

function createUSAParticleCannon() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 7.4, 0.65, 20), matConcrete);
    base.position.y = 0.32; g.add(base);

    // Circular magnetic accelerator ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.65, 12, 24), matDarkMetal);
    ring.rotation.x = Math.PI / 2; ring.position.y = 1.0; ring.name = "particleAcceleratorRing"; g.add(ring);

    // Central high-energy particle uplinking emitter
    const emitter = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 3.4, 16), matUSA);
    emitter.position.y = 2.4; emitter.castShadow = true; g.add(emitter);

    const beamLens = new THREE.Mesh(new THREE.SphereGeometry(1.1, 14, 12), matIonBlue);
    beamLens.position.y = 4.2; beamLens.name = "particleEmitter"; g.add(beamLens);

    // 4 High-voltage power generator pylons
    for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.8, 0.8), matUSAColor);
        pylon.position.set(Math.cos(a) * 4.4, 1.8, Math.sin(a) * 4.4); g.add(pylon);
    }

    return g;
}

function createUSADetentionCamp() {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.42, 7.8), matConcrete);
    slab.position.y = 0.21; g.add(slab);

    const bunker = new THREE.Mesh(new THREE.BoxGeometry(5.4, 2.8, 4.4), matUSA);
    bunker.position.set(-1.2, 1.6, -1.0); bunker.castShadow = true; g.add(bunker);

    // Perimeter watchtower with searchlight
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.4, 0.8), matDarkMetal);
    post.position.set(3.2, 2.2, 2.8); g.add(post);

    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), matWindowGlow);
    spot.position.set(3.2, 4.5, 2.8); g.add(spot);

    return g;
}

// --- CHINA STRUCTURES ---

function createChinaCommandCenter() {
    const g = new THREE.Group();
    // Heavy concrete citadel foundation
    const base = new THREE.Mesh(new THREE.BoxGeometry(14.0, 0.75, 13.0), matConcrete);
    base.position.y = 0.38; base.receiveShadow = true; g.add(base);

    // Tiered Chinese Citadel with traditional pagoda eaves & military steel
    const lowerHall = new THREE.Mesh(new THREE.BoxGeometry(11.2, 3.4, 9.8), matChina);
    lowerHall.position.set(0, 2.05, 0); lowerHall.castShadow = true; g.add(lowerHall);

    // Flared eave roof trim
    const eave1 = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.45, 10.8), matChinaColor);
    eave1.position.set(0, 3.8, 0); g.add(eave1);

    // Upper operations tier
    const upperTier = new THREE.Mesh(new THREE.BoxGeometry(7.2, 2.8, 6.4), matChina);
    upperTier.position.set(0, 5.2, 0); upperTier.castShadow = true; g.add(upperTier);

    const eave2 = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.4, 7.4), matChinaColor);
    eave2.position.set(0, 6.7, 0); g.add(eave2);

    // Golden-bordered Red Star crest on front façade
    const crest = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 0.15), matRedStar);
    crest.position.set(0, 3.2, 4.98); g.add(crest);

    const goldBorder = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 0.08), matGold);
    goldBorder.position.set(0, 3.2, 4.92); g.add(goldBorder);

    // Rooftop Surveillance Radar (radarDish)
    const radarGroup = new THREE.Group();
    radarGroup.name = "radarDish";
    radarGroup.position.set(0, 7.2, 0);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.6, 8), matGunmetal);
    radarGroup.add(mast);

    const dish = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 8), matDarkMetal);
    dish.scale.set(1.5, 0.35, 1.0); dish.rotation.x = -Math.PI / 4; dish.position.set(0, 0.9, 0); radarGroup.add(dish);
    g.add(radarGroup);

    return g;
}

function createChinaNuclearReactor() {
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.8, 0.65, 16), matConcrete);
    pad.position.y = 0.32; pad.receiveShadow = true; g.add(pad);

    // Massive Hyperbolic Cooling Tower
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 4.2, 6.2, 16), matConcrete);
    tower.position.set(-1.8, 3.4, 0); tower.castShadow = true; g.add(tower);

    // Radioactive green glow at top of cooling tower
    const steamGlow = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.3, 12), matNukeGreen);
    steamGlow.position.set(-1.8, 6.6, 0); g.add(steamGlow);

    // Auxiliary generator hall
    const hall = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.8, 4.2), matChina);
    hall.position.set(2.8, 1.7, 0); hall.castShadow = true; g.add(hall);

    // Pulsating Nuclear Core Containment (nukeCore)
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), matNukeGreen);
    core.name = "nukeCore";
    core.position.set(2.8, 3.5, 0); g.add(core);

    // High-voltage transformer substation
    [-1.2, 1.2].forEach(z => {
        const trans = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.8), matDarkMetal);
        trans.position.set(4.5, 1.0, z); g.add(trans);
    });

    return g;
}

function createChinaBarracks() {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.52, 8.6), matConcrete);
    slab.position.y = 0.26; g.add(slab);

    // Red-trimmed military parade hall
    const hall = new THREE.Mesh(new THREE.BoxGeometry(8.2, 3.6, 6.5), matChina);
    hall.position.set(0, 2.05, 0); hall.castShadow = true; g.add(hall);

    // Red trim roof with gold crest
    const roof = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.5, 7.2), matRedStar);
    roof.position.set(0, 3.9, 0); g.add(roof);

    // Flagpole
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.4, 6), matGunmetal);
    mast.position.set(-4.0, 1.9, 3.2); g.add(mast);

    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.5, 0.04), matRedStar);
    flag.name = "factionFlag";
    flag.position.set(-3.5, 3.2, 3.2); g.add(flag);

    return g;
}

function createChinaWarFactory() {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(13.8, 0.58, 10.8), matConcrete);
    slab.position.y = 0.29; slab.receiveShadow = true; g.add(slab);

    // Heavy industrial steel mill production hall
    const mill = new THREE.Mesh(new THREE.BoxGeometry(12.2, 5.4, 9.4), matChina);
    mill.position.set(0, 2.95, 0); mill.castShadow = true; g.add(mill);

    // Dual industrial smokestacks
    [-4.5, -2.5].forEach(x => {
        const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 3.8, 10), matDarkMetal);
        stack.position.set(x, 6.8, -3.2); g.add(stack);
    });

    // Double heavy armored blast doors
    [-2.8, 2.8].forEach(x => {
        const door = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.8, 0.2), matDarkMetal);
        door.position.set(x, 2.2, 4.75); g.add(door);
    });

    return g;
}

function createChinaGatlingCannon() {
    const g = new THREE.Group();
    // Reinforced hexagonal concrete pillbox base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.2, 1.8, 6), matConcrete);
    base.position.y = 0.9; base.castShadow = true; g.add(base);

    // Rotating Twin-Tier Gatling Turret (turretSystem)
    const turretSys = new THREE.Group();
    turretSys.name = "turretSystem";
    turretSys.position.set(0, 1.8, 0);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.6, 12), matChina);
    cap.position.y = 0.3; turretSys.add(cap);

    // Rotating 8-barrel Gatling Cannon Cluster (gatlingBarrels)
    const barrelsGroup = new THREE.Group();
    barrelsGroup.name = "gatlingBarrels";
    barrelsGroup.position.set(0, 0.65, 0.8);

    for (let i = 0; i < 8; i++) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.4, 6), matGunmetal);
        barrel.rotation.x = Math.PI / 2;
        const angle = (i * Math.PI * 2) / 8;
        barrel.position.set(Math.cos(angle) * 0.24, Math.sin(angle) * 0.24, 0);
        barrelsGroup.add(barrel);
    }
    turretSys.add(barrelsGroup);

    g.add(turretSys);
    return g;
}

function createChinaBunker() {
    const g = new THREE.Group();
    // Low-profile semi-submerged reinforced concrete pillbox
    const bunker = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.2, 1.6, 8), matConcrete);
    bunker.position.y = 0.8; bunker.castShadow = true; g.add(bunker);

    // Armored narrow firing vision slits with dark interior
    const slit = new THREE.Mesh(new THREE.CylinderGeometry(3.62, 3.62, 0.24, 8, 1, true, 0, Math.PI * 1.5), matDarkMetal);
    slit.position.y = 1.05; g.add(slit);

    // Sandbag ring around bunker
    const berm = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.45, 6, 16), matSandbags);
    berm.rotation.x = Math.PI / 2; berm.position.y = 0.45; g.add(berm);

    return g;
}

function createChinaSpeakerTower() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 0.4, 8), matConcrete);
    base.position.y = 0.2; g.add(base);

    // Tall lattice steel mast
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 7.4, 8), matGunmetal);
    mast.position.y = 3.9; mast.castShadow = true; g.add(mast);

    // Multi-tier directional megaphone broadcast horns
    [4.8, 6.2].forEach(y => {
        for (let i = 0; i < 4; i++) {
            const horn = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 8), matChinaColor);
            horn.rotation.z = Math.PI / 2;
            horn.rotation.y = (i * Math.PI) / 2;
            const a = (i * Math.PI) / 2;
            horn.position.set(Math.cos(a) * 0.4, y, Math.sin(a) * 0.4);
            g.add(horn);
        }
    });

    // Top warning beacon
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), matBeaconRed);
    beacon.position.y = 7.7; g.add(beacon);

    return g;
}

function createChinaNukeSilo() {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.65, 13.6), matConcrete);
    slab.position.y = 0.32; g.add(slab);

    // Yellow hazard boundary circle
    const rim = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.35, 6, 20), matHazard);
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.68; g.add(rim);

    // Subterranean missile silo shaft aperture
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.8, 16), matDarkMetal);
    shaft.position.y = 0.4; g.add(shaft);

    // Heavy hydraulic blast door panels
    [-2.2, 2.2].forEach((x, idx) => {
        const door = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 6.8), matChina);
        door.position.set(x, 0.8, 0);
        door.name = idx === 0 ? "nukeBlastDoorL" : "nukeBlastDoorR";
        g.add(door);
    });

    // Visible nuclear missile nose tip emerging from shaft
    const nukeTipGroup = new THREE.Group();
    nukeTipGroup.name = "nukeTip";
    const nukeTip = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 14), matChinaColor);
    nukeTip.position.set(0, 1.8, 0); nukeTipGroup.add(nukeTip);

    const warhead = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 10), matNukeGreen);
    warhead.position.set(0, 2.9, 0); nukeTipGroup.add(warhead);
    g.add(nukeTipGroup);

    return g;
}

function createChinaSupplyCenter() {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(12.8, 0.52, 10.8), matConcrete);
    slab.position.y = 0.26; g.add(slab);

    // Heavy industrial warehouse
    const depot = new THREE.Mesh(new THREE.BoxGeometry(10.8, 4.4, 7.8), matChina);
    depot.position.set(0, 2.45, -1.0); depot.castShadow = true; g.add(depot);

    // Overhead gantry crane over loading dock
    const gantry = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.35, 0.35), matGunmetal);
    gantry.position.set(0, 4.9, 3.2); g.add(gantry);

    return g;
}

// China Dedicated Airfield (PLA MiG Hangars & Runway)
function createChinaAirfield() {
    const g = new THREE.Group();
    // Runway tarmac with red PLA landing stripes
    const tarmac = new THREE.Mesh(new THREE.BoxGeometry(15.8, 0.28, 13.8), matDarkMetal);
    tarmac.position.y = 0.14; tarmac.receiveShadow = true; g.add(tarmac);

    // Red runway guidance stripes
    for (let z = -5.0; z <= 5.0; z += 3.2) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 1.8), matRedStar);
        stripe.position.set(0, 0.3, z); g.add(stripe);
    }

    // Dual PLA MiG hardened revetment hangars with red trim
    [-5.6, 5.6].forEach(x => {
        const hangar = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 4.8, 12, 1, false, 0, Math.PI), matChina);
        hangar.rotation.z = Math.PI / 2; hangar.position.set(x, 0.3, 0); hangar.castShadow = true; g.add(hangar);

        const trim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 4.8), matRedStar);
        trim.position.set(x, 2.4, 0); g.add(trim);
    });

    // Control Tower
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.2, 5.5, 2.2), matChina);
    tower.position.set(-5.6, 2.9, -4.6); tower.castShadow = true; g.add(tower);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.3, 2.8), matGoldGlass);
    cab.position.set(-5.6, 5.8, -4.6); g.add(cab);

    return g;
}

function createChinaPropagandaCenter() {
    const g = new THREE.Group();
    // Monumental neoclassical palace with columns
    const palace = new THREE.Mesh(new THREE.BoxGeometry(11.5, 4.8, 8.8), matChina);
    palace.position.set(0, 2.4, 0); palace.castShadow = true; g.add(palace);

    // Pagoda style tiered roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(12.8, 0.8, 10.2), matRedStar);
    roof.position.set(0, 5.1, 0); g.add(roof);

    // Large Red Star Emblem
    const star = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 0.15), matGold);
    star.position.set(0, 3.2, 4.45); g.add(star);

    return g;
}

function createChinaInternetCenter() {
    const g = new THREE.Group();
    // High-tech cyber warfare bunker
    const base = new THREE.Mesh(new THREE.BoxGeometry(10.8, 4.0, 8.8), matChina);
    base.position.y = 2.0; base.castShadow = true; g.add(base);

    // Multiple rotating satellite communication dishes
    [-2.6, 2.6].forEach(x => {
        const dish = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), matDarkMetal);
        dish.name = "radarDish";
        dish.scale.set(1.3, 0.35, 1.0); dish.rotation.x = -Math.PI / 4; dish.position.set(x, 4.6, 0); g.add(dish);
    });

    return g;
}

// --- GLA STRUCTURES ---

function createGLACommandCenter() {
    const g = new THREE.Group();
    // Weathered sandbag & dirt foundation
    const slab = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.55, 12.5), matSandbags);
    slab.position.y = 0.28; slab.receiveShadow = true; g.add(slab);

    // Mud-brick stronghold fortress with fortified corner bastions
    const fort = new THREE.Mesh(new THREE.BoxGeometry(9.6, 4.2, 8.6), matGLAColor);
    fort.position.set(0, 2.38, 0); fort.castShadow = true; g.add(fort);

    // 4 Corner watch bastions
    [-4.8, 4.8].forEach(x => {
        [-4.2, 4.2].forEach(z => {
            const bastion = new THREE.Mesh(new THREE.BoxGeometry(2.4, 5.2, 2.4), matGLA);
            bastion.position.set(x, 2.88, z); bastion.castShadow = true; g.add(bastion);
        });
    });

    // Camouflage netting overhang
    const tarp = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.1, 7.2), matTarp);
    tarp.position.set(0, 4.55, 0); g.add(tarp);

    // Scavenged satellite dish antenna
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 6), matGunmetal);
    dish.scale.set(1.2, 0.3, 1.0); dish.rotation.x = -Math.PI / 3; dish.position.set(-2.8, 5.8, 2.2); g.add(dish);

    return g;
}

function createGLABarracks(isFake = false) {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.42, 7.8), matSandbags);
    slab.position.y = 0.21; g.add(slab);

    // Adobe & corrugated training shack
    const shack = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.2, 5.8), matGLAColor);
    shack.position.set(0, 1.8, 0); shack.castShadow = true; g.add(shack);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.25, 6.4), matCorrugated);
    roof.position.set(0, 3.45, 0); g.add(roof);

    // Sandbag training parapet
    const berm = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.6, 0.5), matSandbags);
    berm.position.set(0, 0.5, 3.4); g.add(berm);

    return g;
}

function createGLAArmsDealer(isFake = false) {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.48, 10.5), matSandbags);
    slab.position.y = 0.24; g.add(slab);

    // Scrapyard workshop with corrugated tin roof
    const garage = new THREE.Mesh(new THREE.BoxGeometry(11.8, 4.4, 8.8), matCorrugated);
    garage.position.set(0, 2.45, 0); garage.castShadow = true; g.add(garage);

    // Hoist crane & engine hoist
    const crane = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.2, 0.3), matGunmetal);
    crane.position.set(4.8, 2.5, 3.2); g.add(crane);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.25, 0.25), matGunmetal);
    arm.position.set(3.8, 4.4, 3.2); g.add(arm);

    // Oil drums & scrap piles
    [-3.5, -2.2].forEach(x => {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.85, 8), matDarkMetal);
        drum.position.set(x, 0.68, 3.8); g.add(drum);
    });

    return g;
}

function createGLASupplyStash() {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.42, 8.8), matSandbags);
    slab.position.y = 0.21; g.add(slab);

    // Dug-in cave shelter with camouflage netting
    const shelter = new THREE.Mesh(new THREE.BoxGeometry(8.8, 2.8, 6.8), matGLAColor);
    shelter.position.set(0, 1.6, 0); shelter.castShadow = true; g.add(shelter);

    const net = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.12, 7.4), matTarp);
    net.position.set(0, 3.05, 0); g.add(net);

    // Stacked contraband wooden crates
    [-2.2, 0, 2.2].forEach(x => {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.1), matWood);
        crate.position.set(x, 0.7, 2.8); g.add(crate);
    });

    return g;
}

function createGLABlackMarket() {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.42, 9.5), matSandbags);
    slab.position.y = 0.21; g.add(slab);

    // Bazaar shanties with striped fabric awnings
    const market = new THREE.Mesh(new THREE.BoxGeometry(9.5, 3.6, 7.5), matCorrugated);
    market.position.set(0, 2.0, 0); market.castShadow = true; g.add(market);

    // Striped fabric canopy
    const awning = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.12, 3.5), matTarp);
    awning.rotation.x = Math.PI / 12; awning.position.set(0, 2.8, 4.2); g.add(awning);

    // Satellite uplink dish
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 6), matGunmetal);
    dish.scale.set(1.2, 0.3, 1.0); dish.rotation.x = -Math.PI / 4; dish.position.set(2.8, 4.2, -1.2); g.add(dish);

    return g;
}

function createGLATunnelNetwork() {
    const g = new THREE.Group();
    // Heavy sandbagged circular parapet
    const berm = new THREE.Mesh(new THREE.TorusGeometry(3.8, 0.65, 8, 16), matSandbags);
    berm.rotation.x = Math.PI / 2; berm.position.y = 0.38; g.add(berm);

    // Subterranean steel hatch entrance
    const hatch = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.45, 12), matDarkMetal);
    hatch.position.y = 0.25; g.add(hatch);

    // Twin machine gun firing nests with gun shields
    [-1.6, 1.6].forEach(x => {
        const shield = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.55, 0.08), matGunmetal);
        shield.position.set(x, 0.9, 2.2); g.add(shield);

        const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.2, 8), matDarkMetal);
        gun.rotation.x = Math.PI / 2; gun.position.set(x, 0.9, 2.7); g.add(gun);
    });

    return g;
}

function createGLAStingerSite() {
    const g = new THREE.Group();
    const berm = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.58, 6, 14), matSandbags);
    berm.rotation.x = Math.PI / 2; berm.position.y = 0.38; g.add(berm);

    // 3 Stinger missile gunners in foxholes
    for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3;
        const x = Math.cos(a) * 1.5, z = Math.sin(a) * 1.5;

        const gunner = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 1.1, 8), matGLAColor);
        gunner.position.set(x, 0.55, z); g.add(gunner);

        // Stinger launcher tube
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.4, 8), matGunmetal);
        tube.rotation.x = Math.PI / 3; tube.rotation.y = a;
        tube.position.set(x, 1.0, z); g.add(tube);
    }

    return g;
}

function createGLADemoTrap() {
    const g = new THREE.Group();
    // High-explosive barrel cluster with skull warning
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 1.25, 10), matRedStar);
    barrel.position.y = 0.48; g.add(barrel);

    // Proximity antenna & dynamite sticks
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 6), matDarkMetal);
    ant.position.set(0, 1.45, 0); g.add(ant);

    [-0.35, 0.35].forEach(x => {
        const dyn = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 6), matRedStar);
        dyn.position.set(x, 0.35, 0.35); g.add(dyn);
    });

    return g;
}

function createGLAPalace() {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(13.8, 0.55, 11.8), matSandbags);
    slab.position.y = 0.28; g.add(slab);

    // Grand fortified desert palace with arched portico
    const palace = new THREE.Mesh(new THREE.BoxGeometry(11.2, 4.6, 8.8), matGLAColor);
    palace.position.set(0, 2.58, 0); palace.castShadow = true; g.add(palace);

    // Golden arabesque palace dome
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), matGold);
    dome.position.set(0, 4.88, 0); g.add(dome);

    // Balcony sniper perches on corners
    [-4.5, 4.5].forEach(x => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), matGLA);
        post.position.set(x, 4.8, 2.8); g.add(post);
    });

    return g;
}

function createGLAScudStorm() {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(13.8, 0.65, 13.8), matConcrete);
    slab.position.y = 0.32; g.add(slab);

    // Sandbag revetment berm
    const berm = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.68, 8, 18), matSandbags);
    berm.rotation.x = Math.PI / 2; berm.position.y = 0.72; g.add(berm);

    // Battery of 4 massive SCUD chemical ballistic missiles
    for (let i = 0; i < 4; i++) {
        const x = (i % 2 === 0 ? -2.2 : 2.2);
        const z = (i < 2 ? -2.2 : 2.2);

        const missileGroup = new THREE.Group();
        missileGroup.name = "scudGantry";
        missileGroup.position.set(x, 0.85, z);
        missileGroup.rotation.x = -Math.PI / 5.5; // Elevated ballistic angle

        // Launch gantry arm
        const gantry = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 4.6), matGunmetal);
        missileGroup.add(gantry);

        // SCUD missile rocket body
        const scudBody = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 4.5, 14), matChinaColor);
        scudBody.position.y = 2.25; missileGroup.add(scudBody);

        // Toxic green chemical warhead
        const warhead = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.35, 14), matToxinGreen);
        warhead.position.y = 5.15; missileGroup.add(warhead);

        // Stabilizer tail fins
        for (let f = 0; f < 4; f++) {
            const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.55), matDarkMetal);
            fin.rotation.y = (f * Math.PI) / 2;
            fin.position.set(0, 0.45, 0);
            missileGroup.add(fin);
        }

        g.add(missileGroup);
    }
    return g;
}


// =========================================================================
// NEUTRAL MAP TECH BUILDINGS & GLA RECONSTRUCTION HOLES
// =========================================================================

function createTechOilDerrickMesh() {
    const g = new THREE.Group();
    g.name = "techOilDerrick";
    const matConcrete = new THREE.MeshStandardMaterial({ color: 0x4a5559, roughness: 0.85 });
    const matSteel = new THREE.MeshStandardMaterial({ color: 0x2f3640, metalness: 0.85, roughness: 0.35 });
    const matRust = new THREE.MeshStandardMaterial({ color: 0x8c4227, roughness: 0.7 });
    const matYellow = new THREE.MeshStandardMaterial({ color: 0xe1b12c, roughness: 0.5 });

    // Concrete base pad
    const base = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.6, 6.2), matConcrete);
    base.position.y = 0.3; base.castShadow = true; base.receiveShadow = true; g.add(base);

    // Steel lattice derrick tower
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.8, 6.5, 4), matSteel);
    tower.position.set(1.5, 3.5, 0); tower.castShadow = true; g.add(tower);

    // Crown block & pulley
    const crown = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 1.2), matYellow);
    crown.position.set(1.5, 6.9, 0); g.add(crown);

    // Walking-beam pumpjack assembly
    const pumpGroup = new THREE.Group();
    pumpGroup.name = "pumpjackArm";
    pumpGroup.position.set(-1.2, 2.2, 0);

    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, 0.6), matSteel);
    post.position.y = -0.5; g.add(post); post.position.x = -1.2;

    const beam = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.4, 0.4), matRust);
    pumpGroup.add(beam);

    const horsehead = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.35, 3), matSteel);
    horsehead.rotation.z = Math.PI / 2;
    horsehead.position.set(-1.8, 0, 0);
    pumpGroup.add(horsehead);

    g.add(pumpGroup);

    // Fuel tanks and pipeline
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.8, 12), matRust);
    tank.position.set(-1.2, 1.0, 1.8); tank.castShadow = true; g.add(tank);

    return g;
}

function createTechHospitalMesh() {
    const g = new THREE.Group();
    g.name = "techHospital";
    const matWhite = new THREE.MeshStandardMaterial({ color: 0xf5f6fa, roughness: 0.4 });
    const matRed = new THREE.MeshStandardMaterial({ color: 0xe84118, roughness: 0.3 });
    const matGlass = new THREE.MeshStandardMaterial({ color: 0x00a8ff, roughness: 0.2, metalness: 0.8 });
    const matRoof = new THREE.MeshStandardMaterial({ color: 0x353b48, roughness: 0.7 });

    // Main clinic building
    const mainBody = new THREE.Mesh(new THREE.BoxGeometry(6.4, 2.6, 5.2), matWhite);
    mainBody.position.y = 1.3; mainBody.castShadow = true; g.add(mainBody);

    // Upper medical bay
    const upper = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.4, 3.6), matWhite);
    upper.position.set(0, 3.1, 0); upper.castShadow = true; g.add(upper);

    // Emergency cross logo on roof
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.8), matRed);
    crossH.position.set(0, 3.85, 0); g.add(crossH);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 2.4), matRed);
    crossV.position.set(0, 3.85, 0); g.add(crossV);

    // Glass entrance & windows
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.8, 0.1), matGlass);
    win.position.set(0, 1.2, 2.62); g.add(win);

    return g;
}

function createTechRefineryMesh() {
    const g = new THREE.Group();
    g.name = "techRefinery";
    const matSteel = new THREE.MeshStandardMaterial({ color: 0x718093, metalness: 0.8, roughness: 0.35 });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x2f3640, roughness: 0.8 });
    const matOrange = new THREE.MeshStandardMaterial({ color: 0xe67e22, roughness: 0.4 });

    // Foundation
    const pad = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.5, 6.0), matDark);
    pad.position.y = 0.25; g.add(pad);

    // Twin catalytic cracking distillation towers
    const col1 = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 6.5, 14), matSteel);
    col1.position.set(-1.8, 3.5, -0.8); col1.castShadow = true; g.add(col1);

    const col2 = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 5.2, 14), matSteel);
    col2.position.set(-0.2, 2.8, -0.8); col2.castShadow = true; g.add(col2);

    // Spherical LNG / fuel pressure vessel
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1.4, 14, 14), matSteel);
    sphere.position.set(1.8, 1.8, 1.0); sphere.castShadow = true; g.add(sphere);

    // Piping manifold
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.5, 8), matOrange);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(-0.8, 4.2, -0.8); g.add(pipe);

    return g;
}

function createGLAHoleMesh() {
    const g = new THREE.Group();
    g.name = "glaHole";
    const matMud = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.95 });
    const matTimber = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.85 });
    const matMetal = new THREE.MeshStandardMaterial({ color: 0x2c3e50, metalness: 0.6 });

    // Excavated trench / mud pit
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 2.2, 1.2, 10), matMud);
    pit.position.y = 0.5; pit.receiveShadow = true; g.add(pit);

    // Wooden scaffolding and rebar support stakes
    for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI) / 3;
        const stake = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.0, 0.15), matTimber);
        stake.position.set(Math.cos(ang) * 2.6, 1.0, Math.sin(ang) * 2.6);
        stake.rotation.z = (Math.random() - 0.5) * 0.3;
        g.add(stake);
    }

    // Corrugated tin sheet over trench
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 1.6), matMetal);
    sheet.position.set(0.4, 0.8, -0.3); sheet.rotation.y = 0.4; g.add(sheet);

    return g;
}
        