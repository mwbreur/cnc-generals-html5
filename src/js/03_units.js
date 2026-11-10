function createTrackAssembly(width, height, length, matHull, isEnemy = false) {
    const trackGroup = new THREE.Group();
    const treadWidth = 0.44;
    const wheelRadius = height * 0.42;
    const numRoadWheels = 5;

    [-width / 2 + treadWidth / 2, width / 2 - treadWidth / 2].forEach(xOffset => {
        // Continuous tread track: segmented loop with sloped front climb and rear drop
        const segMat = matTread;
        // Central main track section
        const mainTread = new THREE.Mesh(new THREE.BoxGeometry(treadWidth, height * 0.88, length * 0.82), segMat);
        mainTread.position.set(xOffset, height * 0.5, 0);
        mainTread.castShadow = true;
        trackGroup.add(mainTread);

        // Angled front track climb
        const frontClimb = new THREE.Mesh(new THREE.BoxGeometry(treadWidth, height * 0.55, length * 0.22), segMat);
        frontClimb.rotation.x = -Math.PI / 6;
        frontClimb.position.set(xOffset, height * 0.46, length * 0.45);
        frontClimb.castShadow = true;
        trackGroup.add(frontClimb);

        // Angled rear track drop
        const rearDrop = new THREE.Mesh(new THREE.BoxGeometry(treadWidth, height * 0.55, length * 0.22), segMat);
        rearDrop.rotation.x = Math.PI / 6;
        rearDrop.position.set(xOffset, height * 0.46, -length * 0.45);
        rearDrop.castShadow = true;
        trackGroup.add(rearDrop);

        // Armored ballistic side skirts with modular segments and bolts
        const skirtMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x992d22, roughness: 0.6 }) : matHull;
        const skirtX = xOffset + (xOffset > 0 ? 0.23 : -0.23);
        const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.08, height * 0.72, length * 0.95), skirtMat);
        skirt.position.set(skirtX, height * 0.62, 0);
        skirt.castShadow = true;
        trackGroup.add(skirt);

        // Rubber mud flaps front and rear
        const flapFront = new THREE.Mesh(new THREE.BoxGeometry(treadWidth + 0.1, height * 0.4, 0.08), matDarkMetal);
        flapFront.position.set(xOffset, height * 0.42, length * 0.52);
        trackGroup.add(flapFront);

        const flapRear = new THREE.Mesh(new THREE.BoxGeometry(treadWidth + 0.1, height * 0.4, 0.08), matDarkMetal);
        flapRear.position.set(xOffset, height * 0.42, -length * 0.52);
        trackGroup.add(flapRear);

        // Front drive sprocket (toothed) & rear idler with tensioner
        const sprocket = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius * 0.92, wheelRadius * 0.92, treadWidth + 0.06, 12), matDarkMetal);
        sprocket.rotation.z = Math.PI / 2;
        sprocket.position.set(xOffset, height * 0.55, length * 0.46);
        trackGroup.add(sprocket);

        const idler = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius * 0.88, wheelRadius * 0.88, treadWidth + 0.06, 12), matDarkMetal);
        idler.rotation.z = Math.PI / 2;
        idler.position.set(xOffset, height * 0.55, -length * 0.46);
        trackGroup.add(idler);

        // Dual Road Wheels with stamped hub caps
        const spacing = (length * 0.68) / (numRoadWheels - 1);
        for (let i = 0; i < numRoadWheels; i++) {
            const zWheel = -length * 0.34 + i * spacing;
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius * 0.82, wheelRadius * 0.82, treadWidth + 0.05, 12), matGunmetal);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(xOffset, wheelRadius * 0.9, zWheel);
            trackGroup.add(wheel);

            // Hub cap
            const hub = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius * 0.28, wheelRadius * 0.28, treadWidth + 0.09, 8), matDarkMetal);
            hub.rotation.z = Math.PI / 2;
            hub.position.set(xOffset, wheelRadius * 0.9, zWheel);
            trackGroup.add(hub);
        }

        // Return rollers supporting upper track
        [-length * 0.2, length * 0.2].forEach(zRoller => {
            const roller = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius * 0.35, wheelRadius * 0.35, treadWidth + 0.04, 8), matDarkMetal);
            roller.rotation.z = Math.PI / 2;
            roller.position.set(xOffset, height * 0.82, zRoller);
            trackGroup.add(roller);
        });
    });
    return trackGroup;
}


        // Module: Enhanced USA Units
// High visual fidelity, composite armor plates, FLIR pods, antennae, cupolas, weapon systems

function createCrusaderTankMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['crusader']) {
        return createW3DVehicleMesh('crusader', isEnemy);
    }
    const g = new THREE.Group();
    const hullMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.5, metalness: 0.35 }) : matUSA;
    const accentMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x222, roughness: 0.5 }) : matUSAColor;

    // Upgraded track assembly
    g.add(createTrackAssembly(2.4, 0.58, 3.6, hullMat, isEnemy));

    // Lower hull & sloped glacis
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.52, 3.4), hullMat);
    hull.position.y = 0.54; hull.castShadow = true; g.add(hull);

    const glacis = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.3, 1.05), hullMat);
    glacis.rotation.x = Math.PI / 5.5;
    glacis.position.set(0, 0.54, 1.48); glacis.castShadow = true; g.add(glacis);

    // Front tow shackles
    [-0.65, 0.65].forEach(x => {
        const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.03, 6, 8), matDarkMetal);
        shackle.position.set(x, 0.42, 2.0); g.add(shackle);
    });

    // Driver periscope vision blocks
    const periscope = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.12), matBlueGlass);
    periscope.position.set(-0.25, 0.78, 1.15); g.add(periscope);

    // Rear engine deck louvers & dual exhaust vents
    const exhaust = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.14, 0.8), matDarkMetal);
    exhaust.position.set(0, 0.8, -1.25); g.add(exhaust);

    [-0.55, 0.55].forEach(x => {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8), matExhaust);
        pipe.rotation.x = Math.PI / 2;
        pipe.position.set(x, 0.75, -1.72); g.add(pipe);
    });

    // Turret System (rotates to target)
    const turretSys = new THREE.Group();
    turretSys.name = "turretSystem";
    turretSys.position.set(0, 0.84, 0);

    // Angular composite turret body
    const turret = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.48, 2.0), hullMat);
    turret.position.set(0, 0.24, -0.15); turret.castShadow = true; turretSys.add(turret);

    // Angled cheek armor wedges (M1 Abrams style)
    [-0.75, 0.75].forEach((xSide, i) => {
        const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.44, 1.3), accentMat);
        cheek.rotation.y = (i === 0 ? 0.16 : -0.16);
        cheek.position.set(xSide, 0.24, 0.18); cheek.castShadow = true; turretSys.add(cheek);
    });

    // Turret bustle rack (rear storage basket)
    const rack = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.32, 0.45), matDarkMetal);
    rack.position.set(0, 0.32, -1.2); turretSys.add(rack);

    // Commander cupola with periscopes
    const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.22, 12), matGunmetal);
    cupola.position.set(-0.38, 0.56, -0.35); turretSys.add(cupola);

    // Roof-mounted .50 cal Browning M2 machine gun
    const m2Gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.75), matGunmetal);
    m2Gun.position.set(-0.38, 0.78, -0.15); turretSys.add(m2Gun);

    const m2Ammo = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.16), matDarkMetal);
    m2Ammo.position.set(-0.48, 0.78, -0.2); turretSys.add(m2Ammo);

    // Gunner FLIR thermal sight pod with cyan optic lens
    const flirBox = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.26), matGunmetal);
    flirBox.position.set(0.46, 0.52, 0.48); turretSys.add(flirBox);

    const flirLens = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.05), matBlueGlass);
    flirLens.position.set(0.46, 0.52, 0.62); turretSys.add(flirLens);

    // Dual whip communications antennas
    [-0.58, 0.58].forEach((x, idx) => {
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 1.5, 6), matDarkMetal);
        ant.position.set(x, 1.15, -0.9);
        ant.rotation.x = -0.12 + idx * 0.04;
        turretSys.add(ant);
    });

    // Gun mantlet shroud
    const mantlet = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.36, 0.3), accentMat);
    mantlet.position.set(0, 0.24, 0.95); turretSys.add(mantlet);

    // 120mm Smoothbore Cannon with thermal shroud & bore evacuator
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.088, 2.7, 12), matGunmetal);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.24, 1.7); barrel.castShadow = true; turretSys.add(barrel);

    const boreEvac = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 12), accentMat);
    boreEvac.rotation.x = Math.PI / 2; boreEvac.position.set(0, 0.24, 1.55); turretSys.add(boreEvac);

    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.24, 12), matDarkMetal);
    muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.24, 3.05); turretSys.add(muzzle);

    g.add(turretSys);
    return g;
}

function createPaladinTankMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['paladin']) {
        return createW3DVehicleMesh('paladin', isEnemy);
    }
    const g = new THREE.Group();
    const hullMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.5, metalness: 0.35 }) : matUSA;
    const accentMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x222, roughness: 0.5 }) : matUSAColor;

    g.add(createTrackAssembly(2.5, 0.6, 3.7, hullMat, isEnemy));

    // Chiseled composite hull with side skirts
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.56, 3.5), hullMat);
    hull.position.y = 0.56; hull.castShadow = true; g.add(hull);

    const glacis = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.32, 1.1), hullMat);
    glacis.rotation.x = Math.PI / 5.2; glacis.position.set(0, 0.56, 1.5); g.add(glacis);

    // Turret System
    const turretSys = new THREE.Group();
    turretSys.name = "turretSystem";
    turretSys.position.set(0, 0.9, 0);

    const turret = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.52, 2.2), hullMat);
    turret.position.set(0, 0.26, -0.1); turret.castShadow = true; turretSys.add(turret);

    // Active Point Defense Laser Pod (elevated, rotating with turret)
    const laserBase = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.38, 12), matGunmetal);
    laserBase.position.set(0.48, 0.65, -0.3); turretSys.add(laserBase);

    const laserLens = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), matIonBlue);
    laserLens.position.set(0.48, 0.76, -0.18); turretSys.add(laserLens);

    // Gunner sight and auxiliary generator
    const auxGen = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.4), matDarkMetal);
    auxGen.position.set(-0.48, 0.58, -0.85); turretSys.add(auxGen);

    // Dual antennas
    [-0.6, 0.6].forEach(x => {
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 1.6, 6), matDarkMetal);
        ant.position.set(x, 1.25, -0.9); ant.rotation.x = -0.1; turretSys.add(ant);
    });

    // Heavy smoothbore cannon with integrated laser targeting pod
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.095, 2.8, 12), matGunmetal);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.26, 1.8); barrel.castShadow = true; turretSys.add(barrel);

    const boreEvac = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.55, 12), accentMat);
    boreEvac.rotation.x = Math.PI / 2; boreEvac.position.set(0, 0.26, 1.6); turretSys.add(boreEvac);

    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.25, 12), matDarkMetal);
    muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.26, 3.2); turretSys.add(muzzle);

    g.add(turretSys);
    return g;
}

function createHumveeMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['humvee']) {
        return createW3DVehicleMesh('humvee', isEnemy);
    }
    const g = new THREE.Group();
    const bodyMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.5 }) : matUSA;
    const accentMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x222, roughness: 0.5 }) : matUSAColor;

    // Chassis frame
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.2, 3.2), matDarkMetal);
    chassis.position.y = 0.38; g.add(chassis);

    // Main cabin with sloped rear fastback
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.65, 1.6), bodyMat);
    cab.position.set(0, 0.78, -0.1); cab.castShadow = true; g.add(cab);

    const fastback = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.42, 1.1), bodyMat);
    fastback.rotation.x = -Math.PI / 6; fastback.position.set(0, 0.72, -1.05); g.add(fastback);

    // Front sloped hood & vertical air intake grille
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.4, 1.15), bodyMat);
    hood.position.set(0, 0.64, 1.05); hood.castShadow = true; g.add(hood);

    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.32, 0.05), matDarkMetal);
    grille.position.set(0, 0.62, 1.64); g.add(grille);

    // Front winch bumper with bullbar
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.22, 0.16), matGunmetal);
    bumper.position.set(0, 0.45, 1.7); g.add(bumper);

    // Tinted bulletproof windshield & windows
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.38, 0.08), matBlueGlass);
    windshield.rotation.x = -Math.PI / 10; windshield.position.set(0, 0.88, 0.72); g.add(windshield);

    // Headlights
    [-0.6, 0.6].forEach(x => {
        const light = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 8), matWindowGlow);
        light.rotation.x = Math.PI / 2; light.position.set(x, 0.62, 1.66); g.add(light);
    });

    // 4 Heavy all-terrain military tires with deep treads
    [-0.92, 0.92].forEach(x => {
        [-0.95, 0.95].forEach(z => {
            const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.3, 14), matTire);
            tire.rotation.z = Math.PI / 2; tire.position.set(x, 0.44, z); tire.castShadow = true; g.add(tire);

            const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 10), matGunmetal);
            hub.rotation.z = Math.PI / 2; hub.position.set(x, 0.44, z); g.add(hub);
        });
    });

    // Roof Weapon Ring with TOW Missile Launcher & Gun Shield (turretSystem)
    const turretSys = new THREE.Group();
    turretSys.name = "turretSystem";
    turretSys.position.set(0, 1.15, -0.05);

    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.18, 12), matDarkMetal);
    turretSys.add(ring);

    // Gun shield
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.06), matGunmetal);
    shield.position.set(0, 0.3, 0.3); turretSys.add(shield);

    // .50 cal machine gun
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.85), matGunmetal);
    gun.position.set(-0.1, 0.32, 0.45); gun.castShadow = true; turretSys.add(gun);

    // TOW Missile Box Launcher on side of ring
    const towBox = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.25, 0.7), matUSAColor);
    towBox.position.set(0.26, 0.36, 0.15); turretSys.add(towBox);

    const towCap = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), matHazard);
    towCap.position.set(0.26, 0.36, 0.52); turretSys.add(towCap);

    // Antenna whip on rear
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 1.3, 6), matDarkMetal);
    ant.position.set(-0.7, 0.6, -1.2); ant.rotation.x = -0.15; g.add(ant);

    g.add(turretSys);
    return g;
}

function createAmbulanceMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['ambulance']) {
        return createW3DVehicleMesh('ambulance', isEnemy);
    }
    const g = new THREE.Group();
    // Extended medical Humvee chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.2, 3.6), matDarkMetal);
    chassis.position.y = 0.38; g.add(chassis);

    // Forward cab
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.65, 1.3), matUSA);
    cab.position.set(0, 0.78, 0.6); cab.castShadow = true; g.add(cab);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.4, 1.15), matUSA);
    hood.position.set(0, 0.64, 1.35); g.add(hood);

    // Large enclosed medical shelter body
    const shelter = new THREE.Mesh(new THREE.BoxGeometry(1.74, 1.05, 2.2), matUSA);
    shelter.position.set(0, 0.98, -0.65); shelter.castShadow = true; g.add(shelter);

    // Red Cross medical emblems on sides and roof
    [-0.88, 0.88].forEach(x => {
        const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.55), matRedStar);
        crossH.position.set(x, 1.05, -0.65); g.add(crossH);
        const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.55, 0.2), matRedStar);
        crossV.position.set(x, 1.05, -0.65); g.add(crossV);
    });

    // Roof Red Cross
    const crossTopH = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.2), matRedStar);
    crossTopH.position.set(0, 1.52, -0.65); g.add(crossTopH);
    const crossTopV = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.55), matRedStar);
    crossTopV.position.set(0, 1.52, -0.65); g.add(crossTopV);

    // 4 Off-road wheels
    [-0.92, 0.92].forEach(x => {
        [-1.0, 1.0].forEach(z => {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.3, 12), matTire);
            wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.44, z); g.add(wheel);
        });
    });

    // Emergency strobe lightbar (hazardBeacon)
    const lightbar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.22), matBeaconAmber);
    lightbar.name = "hazardBeacon";
    lightbar.position.set(0, 1.56, 0.5); g.add(lightbar);

    return g;
}

function createTomahawkMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['tomahawk']) {
        return createW3DVehicleMesh('tomahawk', isEnemy);
    }
    const g = new THREE.Group();
    const cabMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.5 }) : matUSA;
    const bodyMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x333, roughness: 0.5 }) : matUSAColor;

    // 6x6 Heavy Tactical Launcher Truck Chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.28, 4.4), matDarkMetal);
    chassis.position.y = 0.45; g.add(chassis);

    // Armored forward cab
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.95, 1.4), cabMat);
    cab.position.set(0, 1.0, 1.4); cab.castShadow = true; g.add(cab);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.38, 0.08), matBlueGlass);
    windshield.position.set(0, 1.15, 2.12); g.add(windshield);

    // 6 Heavy all-terrain tires
    [-1.02, 1.02].forEach(x => {
        [-1.4, -0.3, 1.3].forEach(z => {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.34, 12), matTire);
            wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.46, z); g.add(wheel);
        });
    });

    // Rotating Launcher Turret with Dual Tomahawk Missile Canisters (turretSystem)
    const turretSys = new THREE.Group();
    turretSys.name = "turretSystem";
    turretSys.position.set(0, 0.85, -0.6);

    const turntable = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.24, 14), matDarkMetal);
    turretSys.add(turntable);

    // Elevating launcher arm
    const launchArm = new THREE.Group();
    launchArm.position.set(0, 0.25, -0.2);
    launchArm.rotation.x = -Math.PI / 8; // Elevated 22.5 degrees

    // Twin rectangular missile box canisters
    [-0.38, 0.38].forEach(x => {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 2.8), bodyMat);
        box.position.set(x, 0.35, 0.4); box.castShadow = true; launchArm.add(box);

        // Missile nose cone protruding from canister
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 10), matGunmetal);
        nose.rotation.x = Math.PI / 2; nose.position.set(x, 0.35, 1.95); launchArm.add(nose);
    });

    // Hydraulic lift piston
    const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 8), matChrome);
    piston.rotation.x = Math.PI / 4; piston.position.set(0, 0.1, -0.2); launchArm.add(piston);

    turretSys.add(launchArm);
    g.add(turretSys);
    return g;
}

function createChinaDozerMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['dozer_china']) {
        return createW3DVehicleMesh('dozer_china', isEnemy);
    }
    return createUSADozerMesh(isEnemy);
}
window.createChinaDozerMesh = createChinaDozerMesh;

function createUSADozerMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['dozer']) {
        return createW3DVehicleMesh('dozer', isEnemy);
    }
    const g = new THREE.Group();
    // Heavy tracked construction tractor
    g.add(createTrackAssembly(2.5, 0.65, 3.2, matHazard, false));

    // Heavy operator cab with rollcage grid
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.9, 1.8), matUSAColor);
    cab.position.set(0, 0.98, -0.2); cab.castShadow = true; g.add(cab);

    // Tinted windows on all 4 sides
    const frontWin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 0.08), matBlueGlass);
    frontWin.position.set(0, 1.15, 0.72); g.add(frontWin);

    // Front heavy bulldozer blade with hydraulic lifting pistons
    const blade = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.78, 0.22), matHazard);
    blade.position.set(0, 0.55, 2.1); blade.castShadow = true; g.add(blade);

    // Dual chrome hydraulic cylinders
    [-0.85, 0.85].forEach(x => {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 1.4), matDarkMetal);
        arm.position.set(x, 0.58, 1.35); g.add(arm);

        const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 8), matChrome);
        piston.rotation.x = Math.PI / 4; piston.position.set(x, 0.75, 1.1); g.add(piston);
    });

    // Flashing amber safety beacon (hazardBeacon)
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.22, 10), matBeaconAmber);
    beacon.name = "hazardBeacon";
    beacon.position.set(0, 1.55, -0.2); g.add(beacon);

    // Rear winch and counterweight
    const winch = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.5), matGunmetal);
    winch.position.set(0, 0.7, -1.35); g.add(winch);

    return g;
}

function createUSATruckMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['truck']) {
        return createW3DVehicleMesh('truck', isEnemy);
    }
    const g = new THREE.Group();
    // 6x6 Heavy Supply Transport Hauler
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.25, 4.2), matDarkMetal);
    chassis.position.y = 0.45; g.add(chassis);

    // Forward cab
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.95, 1.3), matUSA);
    cab.position.set(0, 1.0, 1.3); cab.castShadow = true; g.add(cab);

    // 6 All-terrain wheels
    [-0.98, 0.98].forEach(x => {
        [-1.3, -0.25, 1.25].forEach(z => {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.3, 12), matTire);
            wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.44, z); g.add(wheel);
        });
    });

    // Rear cargo bed with stacked supply crates (cargoHold)
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 2.6), matDarkMetal);
    bed.position.set(0, 0.65, -0.75); g.add(bed);

    const cargo = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.85, 2.4), matTarp);
    cargo.name = "cargoHold";
    cargo.position.set(0, 1.15, -0.75); cargo.castShadow = true; g.add(cargo);

    return g;
}

function createChinookMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['chinook']) {
        return createW3DVehicleMesh('chinook', isEnemy);
    }
    const g = new THREE.Group();
    g.userData.isAir = true;
    g.userData.flightAltitude = 8.0;

    // Aerodynamic elongated fuselage
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 5.2), matUSA);
    body.position.set(0, 1.4, 0); body.castShadow = true; g.add(body);

    // Cockpit bubble with curved green/blue glass
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 1.2), matBlueGlass);
    cockpit.position.set(0, 1.35, 2.7); g.add(cockpit);

    // Dual aerodynamic fuel sponsons on sides
    [-1.1, 1.1].forEach(x => {
        const sponson = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.65, 3.4), matUSAColor);
        sponson.position.set(x, 0.95, 0); g.add(sponson);
    });

    // Twin Rotor Pylons (front & elevated rear)
    const pylonFront = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.65, 10), matGunmetal);
    pylonFront.position.set(0, 2.3, 1.9); g.add(pylonFront);

    const pylonRear = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 1.1, 10), matGunmetal);
    pylonRear.position.set(0, 2.5, -2.1); g.add(pylonRear);

    // Counter-rotating 3-blade main rotors
    const rotorFront = new THREE.Group();
    rotorFront.name = "chinook_rotor1";
    rotorFront.position.set(0, 2.65, 1.9);
    for (let i = 0; i < 3; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 3.2), matDarkMetal);
        blade.rotation.y = (i * Math.PI * 2) / 3;
        blade.position.set(0, 0, 1.4);
        rotorFront.add(blade);
    }
    g.add(rotorFront);

    const rotorRear = new THREE.Group();
    rotorRear.name = "chinook_rotor2";
    rotorRear.position.set(0, 3.1, -2.1);
    for (let i = 0; i < 3; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 3.2), matDarkMetal);
        blade.rotation.y = (i * Math.PI * 2) / 3;
        blade.position.set(0, 0, 1.4);
        rotorRear.add(blade);
    }
    g.add(rotorRear);

    // Rear cargo loading ramp door
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.1), matDarkMetal);
    ramp.position.set(0, 1.25, -2.62); g.add(ramp);

    // Strobe beacon
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), matBeaconRed);
    beacon.position.set(0, 3.15, -2.1); g.add(beacon);

    return g;
}

function createComancheMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['comanche']) {
        return createW3DVehicleMesh('comanche', isEnemy);
    }
    const g = new THREE.Group();
    g.userData.isAir = true;
    g.userData.flightAltitude = 7.5;

    // RAH-66 Faceted Stealth Attack Fuselage
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.95, 4.4), matUSA);
    body.position.set(0, 1.1, 0); body.castShadow = true; g.add(body);

    // Chiseled nose with tandem cockpit canopy
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.8, 4), matUSA);
    nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.05, 2.8); g.add(nose);

    const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.45, 1.8), matGoldGlass);
    canopy.position.set(0, 1.42, 1.2); g.add(canopy);

    // Chin-mounted 20mm 3-barrel Gatling Cannon Turret (turretSystem)
    const turretSys = new THREE.Group();
    turretSys.name = "turretSystem";
    turretSys.position.set(0, 0.65, 2.2);

    const gunBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.25, 8), matGunmetal);
    turretSys.add(gunBase);

    const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.1, 8), matDarkMetal);
    gunBarrel.rotation.x = Math.PI / 2; gunBarrel.position.set(0, -0.08, 0.55); turretSys.add(gunBarrel);

    g.add(turretSys);

    // FLIR electro-optical ball sensor
    const flir = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), matBlueGlass);
    flir.position.set(0, 0.75, 3.4); g.add(flir);

    // 5-Blade Main Rotor Hub (comanche_rotor)
    const rotor = new THREE.Group();
    rotor.name = "comanche_rotor";
    rotor.position.set(0, 1.75, 0.2);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.18, 10), matGunmetal);
    rotor.add(hub);

    for (let i = 0; i < 5; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.035, 3.1), matDarkMetal);
        blade.rotation.y = (i * Math.PI * 2) / 5;
        blade.position.set(0, 0, 1.4);
        rotor.add(blade);
    }
    g.add(rotor);

    // Tail boom with enclosed Fenestron anti-torque fan
    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 2.8), matUSA);
    boom.position.set(0, 1.2, -2.8); g.add(boom);

    const fenestronRing = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.32, 12), matDarkMetal);
    fenestronRing.rotation.z = Math.PI / 2; fenestronRing.position.set(0, 1.35, -4.0); g.add(fenestronRing);

    // Retractable stub weapon wings with Hellfire missile racks
    [-0.95, 0.95].forEach(x => {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.12, 0.6), matUSAColor);
        wing.position.set(x, 0.95, 0.2); g.add(wing);

        // Hellfire quad-pack
        const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.9), matDarkMetal);
        pylon.position.set(x, 0.78, 0.2); g.add(pylon);
    });

    return g;
}

function createRaptorMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['raptor']) {
        return createW3DVehicleMesh('raptor', isEnemy);
    }
    const g = new THREE.Group();
    g.userData.isAir = true;
    g.userData.flightAltitude = 9.0;

    // F-22 Stealth Air Superiority Airframe
    const fuselage = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.65, 4.8), matUSA);
    fuselage.position.set(0, 0.5, 0); fuselage.castShadow = true; g.add(fuselage);

    // Needle nose cone
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.2, 4), matUSA);
    nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.48, 3.2); g.add(nose);

    // Gold tinted stealth canopy
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.4, 1.6), matGoldGlass);
    canopy.position.set(0, 0.85, 1.3); g.add(canopy);

    // Swept diamond delta wings
    [-2.2, 2.2].forEach((x, i) => {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 2.4), matUSA);
        wing.rotation.y = (i === 0 ? 0.2 : -0.2);
        wing.position.set(x * 0.65, 0.48, -0.2); wing.castShadow = true; g.add(wing);

        // AIM-120 underwing missile
        const missile = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8), matUSAColor);
        missile.rotation.x = Math.PI / 2; missile.position.set(x * 0.7, 0.38, -0.2); g.add(missile);
    });

    // Canted twin vertical stabilizers (V-tail)
    [-0.75, 0.75].forEach((x, i) => {
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 1.2), matUSA);
        tail.rotation.z = (i === 0 ? -0.28 : 0.28);
        tail.position.set(x, 1.05, -2.0); g.add(tail);
    });

    // Twin rectangular 2D thrust-vectoring engine nozzles
    [-0.38, 0.38].forEach(x => {
        const nozzle = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.35), matExhaust);
        nozzle.position.set(x, 0.48, -2.55); g.add(nozzle);
    });

    return g;
}

function createStealthFighterMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['stealthfighter']) {
        return createW3DVehicleMesh('stealthfighter', isEnemy);
    }
    const g = new THREE.Group();
    g.userData.isAir = true;
    g.userData.flightAltitude = 9.0;
    const stealthMat = new THREE.MeshStandardMaterial({ color: 0x1f2421, roughness: 0.4, metalness: 0.8 });

    // F-117 Faceted Stealth Body
    const body = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5.0, 4), stealthMat);
    body.rotation.x = Math.PI / 2; body.scale.set(1.4, 1.0, 0.24);
    body.position.set(0, 0.5, 0); body.castShadow = true; g.add(body);

    // Faceted cockpit glass facets
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 1.2), matBlueGlass);
    glass.position.set(0, 0.68, 1.0); g.add(glass);

    // Canted V-Tail fins
    [-0.55, 0.55].forEach((x, i) => {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 1.1), stealthMat);
        fin.rotation.z = (i === 0 ? -0.55 : 0.55); fin.position.set(x, 0.92, -1.9); g.add(fin);
    });
    return g;
}

function createAuroraMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['aurora']) {
        return createW3DVehicleMesh('aurora', isEnemy);
    }
    const g = new THREE.Group();
    g.userData.isAir = true;
    g.userData.flightAltitude = 10.5;
    const sleekMat = new THREE.MeshStandardMaterial({ color: 0xecf0f1, roughness: 0.25, metalness: 0.85 });

    // Hypersonic Mach 5 waverider blended body
    const body = new THREE.Mesh(new THREE.ConeGeometry(3.4, 5.8, 3), sleekMat);
    body.rotation.x = Math.PI / 2; body.rotation.y = Math.PI;
    body.scale.set(1.25, 1.0, 0.16); body.position.set(0, 0.5, 0.2); body.castShadow = true; g.add(body);

    // Supersonic cockpit wedge
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 1.8), matBlueGlass);
    cockpit.position.set(0, 0.65, 1.2); g.add(cockpit);

    // Scramjet glowing pulse detonation exhaust
    const scramjet = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 0.35), matIonBlue);
    scramjet.position.set(0, 0.48, -2.65); g.add(scramjet);

    return g;
}

function createRangerMesh(isEnemy = false) {
    if (typeof createW3DInfantryMesh === 'function' && window.W3D_INFANTRY_DATA && window.W3D_INFANTRY_DATA['ranger']) {
        return createW3DInfantryMesh('ranger', isEnemy);
    }
    const g = new THREE.Group();
    g.scale.set(0.52, 0.52, 0.52);
    // Tactical uniform & combat boots
    const boots = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.4), matDarkMetal);
    boots.position.y = 0.15; g.add(boots);

    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.32), matUSAColor);
    legs.position.y = 0.45; g.add(legs);

    // Body with tactical armor vest
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.36), matUSAColor);
    torso.position.y = 0.85; torso.castShadow = true; g.add(torso);

    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.42), matTarp);
    vest.position.y = 0.88; g.add(vest);

    // Kevlar PASGT Helmet with NVG mount
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), matUSAColor);
    head.position.y = 1.35; g.add(head);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), matUSAColor);
    helmet.position.set(0, 1.4, -0.02); helmet.castShadow = true; g.add(helmet);

    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.12), matDarkMetal);
    goggles.position.set(0, 1.36, 0.18); g.add(goggles);

    // M4A1 Carbine with tactical scope & magazine
    const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.88), matGunmetal);
    rifle.position.set(0.25, 0.88, 0.25); rifle.rotation.x = -0.12; rifle.castShadow = true; g.add(rifle);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.1), matDarkMetal);
    mag.position.set(0.25, 0.78, 0.22); g.add(mag);

    return g;
}

function createMissileDefenderMesh(isEnemy = false) {
    if (typeof createW3DInfantryMesh === 'function' && window.W3D_INFANTRY_DATA && window.W3D_INFANTRY_DATA['missiledefender']) {
        return createW3DInfantryMesh('missiledefender', isEnemy);
    }
    const g = createRangerMesh(isEnemy);
    // Shoulder-mounted FIM-92 Stinger / Javelin Missile Launcher
    const launcher = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 1.45, 10), matGunmetal);
    launcher.rotation.x = Math.PI / 2; launcher.position.set(0.38, 1.2, 0.1); launcher.castShadow = true; g.add(launcher);

    const opticalSight = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.25), matBlueGlass);
    opticalSight.position.set(0.24, 1.32, 0.2); g.add(opticalSight);

    const warhead = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), matHazard);
    warhead.position.set(0.38, 1.2, 0.85); g.add(warhead);
    return g;
}

function createPathfinderMesh(isEnemy = false) {
    if (typeof createW3DInfantryMesh === 'function' && window.W3D_INFANTRY_DATA && window.W3D_INFANTRY_DATA['pathfinder']) {
        return createW3DInfantryMesh('pathfinder', isEnemy);
    }
    const g = createRangerMesh(isEnemy);
    const ghillie = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.5), new THREE.MeshStandardMaterial({ color: 0x4a5d4e, roughness: 0.9 }));
    ghillie.position.y = 0.9; g.add(ghillie);
    return g;
}

function createBurtonMesh(isEnemy = false) {
    if (typeof createW3DInfantryMesh === 'function' && window.W3D_INFANTRY_DATA && window.W3D_INFANTRY_DATA['burton']) {
        return createW3DInfantryMesh('burton', isEnemy);
    }
    const g = new THREE.Group();
    g.scale.set(0.52, 0.52, 0.52);
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd2a679, roughness: 0.75 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x3d3d3d, roughness: 0.8 });

    // Camo cargo pants & combat boots
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.72, 0.38), pantsMat);
    legs.position.y = 0.36; g.add(legs);

    // Muscular shirtless/vest commando torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.68, 0.44), skinMat);
    torso.position.y = 0.98; torso.castShadow = true; g.add(torso);

    // Cross-body ammo bandoliers & combat harness
    const harness = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.48, 0.48), matDarkMetal);
    harness.position.y = 0.98; g.add(harness);

    // Head with commando red beret
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), skinMat);
    head.position.y = 1.44; g.add(head);

    const beret = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.15, 10), matRedStar);
    beret.rotation.z = 0.22; beret.position.set(0.06, 1.58, 0); g.add(beret);

    // Dual combat knives on chest harness
    [-0.2, 0.2].forEach(x => {
        const knife = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.08), matChrome);
        knife.position.set(x, 1.05, 0.26); g.add(knife);
    });

    // Heavy M60 Assault Machine Gun
    const heavyGun = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 1.25), matGunmetal);
    heavyGun.position.set(0.32, 0.92, 0.38); g.add(heavyGun);

    return g;
}


        // Module: Enhanced China Units
// Heavy cast armor, reactive armor blocks, Gatling barrels, flame projectors, nuclear artillery, PLA insignias

function createBattlemasterTankMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['battlemaster']) {
        return createW3DVehicleMesh('battlemaster', isEnemy);
    }
    const g = new THREE.Group();
    const hullMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.5, metalness: 0.35 }) : matChina;
    const accentMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x222, roughness: 0.5 }) : matChinaColor;
    const redStarMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x111, roughness: 0.5 }) : matRedStar;

    // Upgraded track assembly
    g.add(createTrackAssembly(2.4, 0.56, 3.5, hullMat, isEnemy));

    // Low-profile sloped hull with glacis
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.5, 3.4), hullMat);
    hull.position.y = 0.52; hull.castShadow = true; g.add(hull);

    const glacis = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.28, 1.0), hullMat);
    glacis.rotation.x = Math.PI / 5.2; glacis.position.set(0, 0.52, 1.45); g.add(glacis);

    // Reactive Armor (ERA) bricks on glacis
    [-0.55, -0.18, 0.18, 0.55].forEach(x => {
        const brick = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.4), accentMat);
        brick.rotation.x = Math.PI / 5.2; brick.position.set(x, 0.65, 1.4); g.add(brick);
    });

    // Dual external cylindrical auxiliary fuel drums on rear with mounting brackets
    [-0.55, 0.55].forEach(x => {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.78, 12), accentMat);
        drum.rotation.z = Math.PI / 2; drum.position.set(x, 0.68, -1.72); drum.castShadow = true; g.add(drum);

        const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.2), matDarkMetal);
        bracket.position.set(x, 0.55, -1.65); g.add(bracket);
    });

    // Cast rounded/angular turret (turretSystem)
    const turretSys = new THREE.Group();
    turretSys.name = "turretSystem";
    turretSys.position.set(0, 0.78, 0.1);

    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 1.1, 0.5, 14), hullMat);
    turret.scale.set(1.12, 1.0, 1.28); turret.position.y = 0.25; turret.castShadow = true; turretSys.add(turret);

    // Reactive Armor tiles along turret cheeks
    [-0.82, 0.82].forEach((xSide, i) => {
        for (let b = -1; b <= 1; b++) {
            const era = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.35), accentMat);
            era.rotation.y = (i === 0 ? 0.35 : -0.35);
            era.position.set(xSide, 0.26, 0.3 + b * 0.4); turretSys.add(era);
        }
    });

    // Red star crest emblem
    const star = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.06), redStarMat);
    star.position.set(0.92, 0.28, 0); star.rotation.y = Math.PI / 2; turretSys.add(star);

    // Commander cupola with anti-aircraft 12.7mm heavy machine gun
    const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.2, 10), matGunmetal);
    cupola.position.set(-0.35, 0.56, -0.25); turretSys.add(cupola);

    const aaGun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.75), matDarkMetal);
    aaGun.position.set(-0.35, 0.76, -0.05); turretSys.add(aaGun);

    // Radio antenna
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 1.4, 6), matDarkMetal);
    ant.position.set(0.48, 1.05, -0.65); ant.rotation.x = -0.15; turretSys.add(ant);

    // Long 125mm rifled cannon with thermal shroud & muzzle brake
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.095, 2.8, 12), matGunmetal);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.25, 1.7); barrel.castShadow = true; turretSys.add(barrel);

    const boreEvac = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.45, 10), accentMat);
    boreEvac.rotation.x = Math.PI / 2; boreEvac.position.set(0, 0.25, 1.55); turretSys.add(boreEvac);

    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.3, 10), matDarkMetal);
    muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.25, 3.1); turretSys.add(muzzle);

    g.add(turretSys);
    return g;
}

function createOverlordTankMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['overlord']) {
        return createW3DVehicleMesh('overlord', isEnemy);
    }
    const g = new THREE.Group();
    const hullMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.5, metalness: 0.35 }) : matChina;
    const trimMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x222, roughness: 0.5 }) : matChinaColor;

    // Massive quad-track undercarriage (two separate track assemblies per side!)
    [-1.5, 1.5].forEach(xSide => {
        const outerTrack = createTrackAssembly(0.9, 0.8, 5.6, hullMat, isEnemy);
        outerTrack.position.x = xSide; g.add(outerTrack);
    });

    // Enormous armored super-heavy hull
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.05, 5.4), hullMat);
    hull.position.y = 0.9; hull.castShadow = true; g.add(hull);

    // Front heavy ram prow with steel teeth
    const prow = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.75, 0.9), trimMat);
    prow.rotation.x = Math.PI / 5.5; prow.position.set(0, 0.9, 2.6); g.add(prow);

    // Massive double-barreled heavy turret (turretSystem)
    const turretSys = new THREE.Group();
    turretSys.name = "turretSystem";
    turretSys.position.set(0, 1.5, 0.2);

    const turret = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.88, 3.0), hullMat);
    turret.position.y = 0.44; turret.castShadow = true; turretSys.add(turret);

    // Dual 190mm Heavy Cannons side-by-side with recoil sleeves
    [-0.5, 0.5].forEach(xBarrel => {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.145, 3.8, 14), matGunmetal);
        barrel.rotation.x = Math.PI / 2; barrel.position.set(xBarrel, 0.44, 2.4); barrel.castShadow = true; turretSys.add(barrel);

        const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.8, 12), trimMat);
        sleeve.rotation.x = Math.PI / 2; sleeve.position.set(xBarrel, 0.44, 1.2); turretSys.add(sleeve);

        const muzzle = new THREE.BoxGeometry(0.35, 0.28, 0.45);
        const muzzleMesh = new THREE.Mesh(muzzle, matDarkMetal);
        muzzleMesh.position.set(xBarrel, 0.44, 4.3); turretSys.add(muzzleMesh);
    });

    // Rooftop command cupola / bunker with red flag & searchlight
    const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.45, 12), trimMat);
    cupola.name = "commandCupola";
    cupola.position.set(0, 1.05, -0.45); turretSys.add(cupola);

    const searchlight = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.15, 8), matWindowGlow);
    searchlight.name = "cupolaSearchlight";
    searchlight.rotation.x = Math.PI / 2; searchlight.position.set(0.65, 1.1, 0.8); turretSys.add(searchlight);

    // PLA Red Banner Flag on mast
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.0, 6), matGunmetal);
    mast.name = "flagMast";
    mast.position.set(0, 1.8, -0.45); turretSys.add(mast);

    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.45, 0.04), matRedStar);
    flag.name = "plaFlag";
    flag.position.set(0.42, 2.4, -0.45); turretSys.add(flag);

    // Dual smoking exhaust stacks on rear hull
    [-0.9, 0.9].forEach(x => {
        const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 10), matExhaust);
        stack.position.set(x, 1.6, -2.2); g.add(stack);
    });

    g.add(turretSys);
    return g;
}

function createGatlingTankMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['gatling']) {
        return createW3DVehicleMesh('gatling', isEnemy);
    }
    const g = new THREE.Group();
    const hullMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.5, metalness: 0.35 }) : matChina;
    const darkMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x222, roughness: 0.5 }) : matDarkMetal;

    g.add(createTrackAssembly(2.35, 0.55, 3.4, hullMat, isEnemy));

    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.52, 3.3), hullMat);
    hull.position.y = 0.52; hull.castShadow = true; g.add(hull);

    // Elevated Gatling Turret (turretSystem)
    const turretSys = new THREE.Group();
    turretSys.name = "turretSystem";
    turretSys.position.set(0, 0.8, -0.1);

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.65, 1.8), hullMat);
    base.position.y = 0.32; turretSys.add(base);

    // Dual Ammo Feed Drums on turret sides
    [-0.85, 0.85].forEach(x => {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.35, 12), darkMat);
        drum.rotation.z = Math.PI / 2; drum.position.set(x, 0.45, -0.2); turretSys.add(drum);
    });

    // Rotating 6-barrel Gatling Cannon Assembly (gatlingBarrels)
    const barrelsGroup = new THREE.Group();
    barrelsGroup.name = "gatlingBarrels";
    barrelsGroup.position.set(0, 0.55, 0.6);

    const centralSpindle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 8), matGunmetal);
    centralSpindle.rotation.x = Math.PI / 2; barrelsGroup.add(centralSpindle);

    for (let i = 0; i < 6; i++) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), matGunmetal);
        barrel.rotation.x = Math.PI / 2;
        const angle = (i * Math.PI * 2) / 6;
        barrel.position.set(Math.cos(angle) * 0.18, Math.sin(angle) * 0.18, 0);
        barrelsGroup.add(barrel);
    }
    turretSys.add(barrelsGroup);

    // Top targeting radar dish
    const radar = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), matDarkMetal);
    radar.scale.set(1.0, 0.4, 1.0); radar.position.set(0, 0.85, -0.3); turretSys.add(radar);

    g.add(turretSys);
    return g;
}

function createDragonTankMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['dragon']) {
        return createW3DVehicleMesh('dragon', isEnemy);
    }
    const g = new THREE.Group();
    const hullMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.5, metalness: 0.35 }) : matChina;

    g.add(createTrackAssembly(2.4, 0.58, 3.4, hullMat, isEnemy));

    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 3.3), hullMat);
    hull.position.y = 0.55; hull.castShadow = true; g.add(hull);

    // Dual pressurized napalm fuel tanks on rear deck with hazard warning
    [-0.52, 0.52].forEach(x => {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.4, 12), matHazard);
        tank.rotation.x = Math.PI / 2; tank.position.set(x, 0.98, -0.9); tank.castShadow = true; g.add(tank);

        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 10), matDarkMetal);
        band.rotation.x = Math.PI / 2; band.position.set(x, 0.98, -0.9); g.add(band);
    });

    // Flame Projection Turret (turretSystem)
    const turretSys = new THREE.Group();
    turretSys.name = "turretSystem";
    turretSys.position.set(0, 0.85, 0.2);

    const turret = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 1.5), hullMat);
    turret.position.y = 0.28; turret.castShadow = true; turretSys.add(turret);

    // Twin napalm flame projector nozzles with pilot torches
    [-0.26, 0.26].forEach(x => {
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.8, 10), matGunmetal);
        nozzle.rotation.x = Math.PI / 2; nozzle.position.set(x, 0.28, 1.35); nozzle.castShadow = true; turretSys.add(nozzle);

        // Pilot torch igniter tip
        const pilot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), matFlameOrange);
        pilot.position.set(x, 0.28, 2.3); turretSys.add(pilot);
    });

    g.add(turretSys);
    return g;
}

function createTroopCrawlerMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['crawler']) {
        return createW3DVehicleMesh('crawler', isEnemy);
    }
    const g = new THREE.Group();
    // Heavy 8x8 Wheeled APC / Troop Transport
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.28, 4.6), matDarkMetal);
    chassis.position.y = 0.48; g.add(chassis);

    // Armored hull & troop cabin
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.95, 4.4), matChina);
    body.position.set(0, 1.05, 0); body.castShadow = true; g.add(body);

    // Vision slits
    [-0.92, 0.92].forEach(x => {
        for (let z = -1.2; z <= 1.2; z += 0.8) {
            const slit = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.3), matDarkMetal);
            slit.position.set(x, 1.25, z); g.add(slit);
        }
    });

    // 8 Heavy all-terrain tires
    [-1.02, 1.02].forEach(x => {
        [-1.6, -0.55, 0.55, 1.6].forEach(z => {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.32, 12), matTire);
            wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.46, z); g.add(wheel);
        });
    });

    // Rooftop Morale Propaganda Loudspeaker Tower
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.2, 8), matGunmetal);
    pole.position.set(0, 1.95, 0.2); g.add(pole);

    // 4 Directional Megaphone Horns
    for (let i = 0; i < 4; i++) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 8), matChinaColor);
        horn.rotation.z = Math.PI / 2;
        horn.rotation.y = (i * Math.PI) / 2;
        const angle = (i * Math.PI) / 2;
        horn.position.set(Math.cos(angle) * 0.32, 2.35, Math.sin(angle) * 0.32 + 0.2);
        g.add(horn);
    }

    return g;
}

function createInfernoCannonMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['inferno']) {
        return createW3DVehicleMesh('inferno', isEnemy);
    }
    const g = new THREE.Group();
    g.add(createTrackAssembly(2.45, 0.58, 3.6, matChina, false));

    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.62, 3.5), matChina);
    hull.position.y = 0.62; g.add(hull);

    // High-angle heavy incendiary artillery (turretSystem)
    const turretSys = new THREE.Group();
    turretSys.name = "turretSystem";
    turretSys.position.set(0, 0.98, -0.2);

    const gunMount = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.6, 1.4), matChinaColor);
    gunMount.position.y = 0.3; turretSys.add(gunMount);

    // 155mm Heavy Howitzer Barrel with hydraulic recoil cylinders
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 3.2, 12), matGunmetal);
    barrel.rotation.x = Math.PI / 4.2; barrel.position.set(0, 0.95, 0.85); barrel.castShadow = true; turretSys.add(barrel);

    // Dual recoil cylinders
    [-0.22, 0.22].forEach(x => {
        const recoil = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.2, 8), matChrome);
        recoil.rotation.x = Math.PI / 4.2; recoil.position.set(x, 1.05, 0.5); turretSys.add(recoil);
    });

    // Rear stabilizing spades
    [-0.7, 0.7].forEach(x => {
        const spade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.35), matDarkMetal);
        spade.rotation.x = -Math.PI / 6; spade.position.set(x, 0.45, -1.8); g.add(spade);
    });

    g.add(turretSys);
    return g;
}

function createNukeCannonMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['nukecannon']) {
        return createW3DVehicleMesh('nukecannon', isEnemy);
    }
    const g = new THREE.Group();
    // Heavy atomic artillery tractor carriage
    g.add(createTrackAssembly(2.7, 0.68, 4.6, matChina, false));

    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.75, 4.4), matChina);
    hull.position.y = 0.72; g.add(hull);

    // Giant Atomic Artillery Turret (turretSystem)
    const turretSys = new THREE.Group();
    turretSys.name = "turretSystem";
    turretSys.position.set(0, 1.15, -0.7);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 0.6, 14), matDarkMetal);
    turretSys.add(base);

    // Massive Atomic Cannon Barrel with nuclear radiation rings
    const nukeBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 4.8, 14), matGunmetal);
    nukeBarrel.rotation.x = Math.PI / 5.5; nukeBarrel.position.set(0, 1.25, 1.6); nukeBarrel.castShadow = true; turretSys.add(nukeBarrel);

    // Green glowing nuclear containment collar
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.6, 12), matNukeGreen);
    collar.rotation.x = Math.PI / 5.5; collar.position.set(0, 1.65, 2.3); turretSys.add(collar);

    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, 0.7, 12), matHazard);
    muzzle.rotation.x = Math.PI / 5.5; muzzle.position.set(0, 2.3, 3.6); turretSys.add(muzzle);

    // Counterweight block on rear of cannon
    const counterweight = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.9), matDarkMetal);
    counterweight.position.set(0, 0.6, -1.1); turretSys.add(counterweight);

    g.add(turretSys);
    return g;
}

function createRedGuardMesh(isEnemy = false) {
    if (typeof createW3DInfantryMesh === 'function' && window.W3D_INFANTRY_DATA && window.W3D_INFANTRY_DATA['redguard']) {
        return createW3DInfantryMesh('redguard', isEnemy);
    }
    const g = new THREE.Group();
    g.scale.set(0.52, 0.52, 0.52);
    // PLA infantry uniform & combat boots
    const boots = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.28, 0.38), matDarkMetal);
    boots.position.y = 0.14; g.add(boots);

    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.32), matChinaColor);
    legs.position.y = 0.44; g.add(legs);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 1.25, 8), matChinaColor);
    body.position.y = 0.64; body.castShadow = true; g.add(body);

    // Red collar tabs
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.36), matRedStar);
    collar.position.y = 1.16; g.add(collar);

    // Peaked cap / steel helmet with red star crest
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), matChinaColor);
    helmet.position.y = 1.38; helmet.castShadow = true; g.add(helmet);

    const star = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), matRedStar);
    star.position.set(0, 1.42, 0.25); g.add(star);

    // Type 56 Assault Rifle with curved banana mag and fixed bayonet
    const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.92), matGunmetal);
    rifle.position.set(0.24, 0.86, 0.24); rifle.castShadow = true; g.add(rifle);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.12), matDarkMetal);
    mag.position.set(0.24, 0.76, 0.2); g.add(mag);

    const bayonet = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.25), matChrome);
    bayonet.position.set(0.24, 0.86, 0.78); g.add(bayonet);

    return g;
}

function createTankHunterMesh(isEnemy = false) {
    if (typeof createW3DInfantryMesh === 'function' && window.W3D_INFANTRY_DATA && window.W3D_INFANTRY_DATA['tankhunter']) {
        return createW3DInfantryMesh('tankhunter', isEnemy);
    }
    const g = createRedGuardMesh(isEnemy);
    // Conical field hat / steel helmet
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.24, 12), matGLAColor);
    hat.position.y = 1.48; g.add(hat);

    // RPG-7 Anti-Tank Rocket Launcher
    const rpg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.5, 10), matGunmetal);
    rpg.rotation.x = Math.PI / 2; rpg.position.set(0.34, 1.18, 0.2); g.add(rpg);

    const opticalSight = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.2), matDarkMetal);
    opticalSight.position.set(0.22, 1.28, 0.2); g.add(opticalSight);

    const warhead = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 10), matNukeGreen);
    warhead.rotation.x = Math.PI / 2; warhead.position.set(0.34, 1.18, 1.05); g.add(warhead);

    return g;
}

function createHackerMesh(isEnemy = false) {
    if (typeof createW3DInfantryMesh === 'function' && window.W3D_INFANTRY_DATA && window.W3D_INFANTRY_DATA['hacker']) {
        return createW3DInfantryMesh('hacker', isEnemy);
    }
    const g = new THREE.Group();
    g.scale.set(0.52, 0.52, 0.52);
    // Field operative coat & civilian hacker attire
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.15, 0.38), matDarkMetal);
    body.position.y = 0.58; g.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), matUSAColor);
    head.position.y = 1.35; g.add(head);

    // Audio headset
    const headset = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 10), matGunmetal);
    headset.rotation.z = Math.PI / 2; headset.position.y = 1.36; g.add(headset);

    // Deployable field terminal desk with glowing green screen
    const table = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.6), matGunmetal);
    table.position.set(0, 0.74, 0.48); g.add(table);

    const laptopBase = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.36), matDarkMetal);
    laptopBase.position.set(0, 0.8, 0.48); g.add(laptopBase);

    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.04), matNukeGreen);
    screen.rotation.x = -Math.PI / 12; screen.position.set(0, 1.0, 0.65); g.add(screen);

    // Satellite dish antenna umbrella
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), matGunmetal);
    mast.position.set(-0.45, 1.1, 0.2); g.add(mast);

    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), matChrome);
    dish.scale.set(1.0, 0.3, 1.0); dish.rotation.x = -Math.PI / 4; dish.position.set(-0.45, 1.85, 0.2); g.add(dish);

    return g;
}

function createBlackLotusMesh(isEnemy = false) {
    if (typeof createW3DInfantryMesh === 'function' && window.W3D_INFANTRY_DATA && window.W3D_INFANTRY_DATA['lotus']) {
        return createW3DInfantryMesh('lotus', isEnemy);
    }
    const g = new THREE.Group();
    g.scale.set(0.52, 0.52, 0.52);
    const stealthMat = new THREE.MeshStandardMaterial({ color: 0x181a1d, roughness: 0.35, metalness: 0.85 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.5 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.7 });

    // Sleek espionage trenchcoat
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.35, 10), stealthMat);
    body.position.y = 0.68; body.castShadow = true; g.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), skinMat);
    head.position.y = 1.42; g.add(head);

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), hairMat);
    hair.position.set(0, 1.46, -0.04); g.add(hair);

    // Glowing holographic datapad transceiver
    const datapad = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.36, 0.04), matBlueGlass);
    datapad.position.set(0.24, 0.88, 0.32); g.add(datapad);

    // Silenced pistol in holster
    const pistol = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.28), matDarkMetal);
    pistol.position.set(-0.25, 0.75, 0.1); g.add(pistol);

    return g;
}


        // Module: Enhanced GLA Units
// Scavenger scrap metal, rusted plates, toxic tanks, improvised vehicles, guerrilla armaments

function createGLAWorkerMesh(isEnemy = false) {
    if (typeof createW3DInfantryMesh === 'function' && window.W3D_INFANTRY_DATA && window.W3D_INFANTRY_DATA['worker']) {
        return createW3DInfantryMesh('worker', isEnemy);
    }
    const g = new THREE.Group();
    g.scale.set(0.52, 0.52, 0.52);
    const robeMat = new THREE.MeshStandardMaterial({ color: 0x8a775b, roughness: 0.95 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xc89d6b, roughness: 0.8 });

    // Desert dishdasha robe
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.46, 1.25, 8), robeMat);
    robe.position.y = 0.62; robe.castShadow = true; g.add(robe);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), skinMat);
    head.position.y = 1.35; g.add(head);

    // Keffiyeh turban headwrap
    const turban = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.11, 8, 12), matGLAColor);
    turban.rotation.x = Math.PI / 2; turban.position.y = 1.42; g.add(turban);

    // Burlap gear pack on hip
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.58, 0.38), matSandbags);
    pack.position.set(0, 0.85, -0.34); pack.castShadow = true; g.add(pack);

    // Salvage Cargo Sack on shoulder (cargoHold - visible when carrying supplies)
    const sackMat = new THREE.MeshStandardMaterial({ color: 0xb59e72, roughness: 0.9 });
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.6), sackMat);
    cargo.name = "cargoHold";
    cargo.position.set(-0.35, 1.3, 0);
    cargo.castShadow = true;
    cargo.visible = false;
    g.add(cargo);

    // Wooden pickaxe / shovel tool in hand
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.35, 6), matWood);
    handle.rotation.z = 0.3; handle.position.set(0.4, 0.8, 0.2); g.add(handle);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.35, 0.05), matGunmetal);
    blade.position.set(0.62, 0.35, 0.2); g.add(blade);

    return g;
}

function createTechnicalMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['technical']) {
        return createW3DVehicleMesh('technical', isEnemy);
    }
    const g = new THREE.Group();
    const cabMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.5 }) : matGLA;
    const rustMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x333, roughness: 0.7 }) : matCorrugated;

    // Civilian 4x4 pickup truck chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.2, 3.4), matDarkMetal);
    chassis.position.y = 0.38; g.add(chassis);

    // Cabin with rusted doors
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.88, 1.45), cabMat);
    cab.position.set(0, 0.96, 0.45); cab.castShadow = true; g.add(cab);

    // Hood & heavy rusted bullbar
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.48, 1.15), rustMat);
    hood.position.set(0, 0.76, 1.6); hood.castShadow = true; g.add(hood);

    const bullbar = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.58, 0.18), matGunmetal);
    bullbar.position.set(0, 0.66, 2.2); g.add(bullbar);

    // Open pickup bed with roll cage
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.42, 1.85), rustMat);
    bed.position.set(0, 0.56, -1.02); bed.receiveShadow = true; g.add(bed);

    const rollbar = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.08, 6, 10), matGunmetal);
    rollbar.position.set(0, 1.28, -0.32); g.add(rollbar);

    // 4 Oversized off-road knobby tires
    [-0.94, 0.94].forEach(x => {
        [-1.18, 1.28].forEach(z => {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.3, 12), matTire);
            wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.44, z); wheel.castShadow = true; g.add(wheel);

            const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.32, 8), matDarkMetal);
            hub.rotation.z = Math.PI / 2; hub.position.set(x, 0.44, z); g.add(hub);
        });
    });

    // Swivel-mounted DShK 12.7mm Heavy Machine Gun (turretSystem)
    const turretSys = new THREE.Group();
    turretSys.name = "turretSystem";
    turretSys.position.set(0, 1.18, -0.92);

    const pintle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.65, 8), matGunmetal);
    pintle.position.y = 0.32; turretSys.add(pintle);

    // Armor gun shield plate with viewport slit
    const gunShield = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.58, 0.08), matGunmetal);
    gunShield.position.set(0, 0.68, 0.28); turretSys.add(gunShield);

    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.085, 1.4, 8), matDarkMetal);
    gun.rotation.x = Math.PI / 2; gun.position.set(0, 0.68, 0.8); gun.castShadow = true; turretSys.add(gun);

    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.15, 10), matGunmetal);
    drum.rotation.x = Math.PI / 2; drum.position.set(-0.24, 0.68, 0.5); turretSys.add(drum);

    g.add(turretSys);
    return g;
}

function createScorpionTankMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['scorpion']) {
        return createW3DVehicleMesh('scorpion', isEnemy);
    }
    const g = new THREE.Group();
    const hullMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.5, metalness: 0.35 }) : matGLA;

    g.add(createTrackAssembly(2.25, 0.52, 3.2, hullMat, isEnemy));

    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.48, 3.1), hullMat);
    hull.position.y = 0.5; hull.castShadow = true; g.add(hull);

    // Turret System
    const turretSys = new THREE.Group();
    turretSys.name = "turretSystem";
    turretSys.position.set(0, 0.75, 0);

    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.98, 0.45, 12), hullMat);
    turret.position.y = 0.22; turret.castShadow = true; turretSys.add(turret);

    // 75mm Main Gun with corrugated heat shroud
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 2.4, 10), matGunmetal);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.22, 1.45); barrel.castShadow = true; turretSys.add(barrel);

    // Side-mounted wire-guided anti-tank missile launch box
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.32, 0.9), matDarkMetal);
    pod.position.set(0.76, 0.4, 0); turretSys.add(pod);

    const rocketTip = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.35, 8), matToxinGreen);
    rocketTip.rotation.x = Math.PI / 2; rocketTip.position.set(0.76, 0.4, 0.58); turretSys.add(rocketTip);

    // External fuel barrel strapped to rear hull
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.65, 10), matRedStar);
    drum.rotation.z = Math.PI / 2; drum.position.set(0, 0.65, -1.6); g.add(drum);

    g.add(turretSys);
    return g;
}

function createMarauderTankMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['marauder']) {
        return createW3DVehicleMesh('marauder', isEnemy);
    }
    const g = new THREE.Group();
    const hullMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.5, metalness: 0.35 }) : matGLA;
    const plateMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x222, roughness: 0.5 }) : matCorrugated;

    g.add(createTrackAssembly(2.5, 0.6, 3.6, hullMat, isEnemy));

    // Heavy scavenged hull with bolted scrap plates
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.58, 3.5), hullMat);
    hull.position.y = 0.58; hull.castShadow = true; g.add(hull);

    // Salvaged armor plates welded on
    [-0.85, 0.85].forEach(x => {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 2.2), plateMat);
        plate.position.set(x, 0.65, 0); g.add(plate);
    });

    // Heavy Cast Turret (turretSystem)
    const turretSys = new THREE.Group();
    turretSys.name = "turretSystem";
    turretSys.position.set(0, 0.9, 0);

    const turret = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 2.0), hullMat);
    turret.position.set(0, 0.28, -0.1); turret.castShadow = true; turretSys.add(turret);

    // Heavy rifled cannon with double muzzle brake
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.8, 12), matGunmetal);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.28, 1.7); barrel.castShadow = true; turretSys.add(barrel);

    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.38), matDarkMetal);
    muzzle.position.set(0, 0.28, 3.15); turretSys.add(muzzle);

    // Dual smoke grenade discharger racks
    [-0.65, 0.65].forEach(x => {
        const smoke = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.3), matDarkMetal);
        smoke.position.set(x, 0.52, 0.4); turretSys.add(smoke);
    });

    g.add(turretSys);
    return g;
}

function createRocketBuggyMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['buggy']) {
        return createW3DVehicleMesh('buggy', isEnemy);
    }
    const g = new THREE.Group();
    const frameMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.5 }) : matDarkMetal;
    const bodyMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x222, roughness: 0.5 }) : matGLA;

    // Lightweight tubular dune buggy spaceframe
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 2.8), frameMat);
    frame.position.y = 0.55; g.add(frame);

    // Exposed rear V8 engine block with chrome exhaust headers
    const engine = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.65), matGunmetal);
    engine.position.set(0, 0.65, -1.05); g.add(engine);

    [-0.38, 0.38].forEach(x => {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), matChrome);
        pipe.rotation.x = -Math.PI / 4; pipe.position.set(x, 0.85, -1.25); g.add(pipe);
    });

    // 4 Oversized knobby sand tires (rear larger than front)
    [-0.88, 0.88].forEach(x => {
        const frontTire = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.26, 12), matTire);
        frontTire.rotation.z = Math.PI / 2; frontTire.position.set(x, 0.38, 1.15); g.add(frontTire);

        const rearTire = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.35, 12), matTire);
        rearTire.rotation.z = Math.PI / 2; rearTire.position.set(x, 0.48, -0.95); g.add(rearTire);
    });

    // Roof-mounted 6-tube Rocket Launch Pod (turretSystem)
    const turretSys = new THREE.Group();
    turretSys.name = "turretSystem";
    turretSys.position.set(0, 0.95, -0.1);

    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.45, 1.4), bodyMat);
    pod.rotation.x = -Math.PI / 7; pod.position.y = 0.35; pod.castShadow = true; turretSys.add(pod);

    // 6 Rocket tubes
    for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 3; c++) {
            const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 1.42, 8), matDarkMetal);
            tube.rotation.x = Math.PI / 2;
            tube.position.set(-0.22 + c * 0.22, 0.25 + r * 0.2, 0.1);
            pod.add(tube);
        }
    }

    g.add(turretSys);
    return g;
}

function createQuadCannonMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['quad']) {
        return createW3DVehicleMesh('quad', isEnemy);
    }
    const g = new THREE.Group();
    const hullMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.5 }) : matGLA;

    g.add(createTrackAssembly(2.3, 0.54, 3.3, hullMat, isEnemy));

    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 3.2), hullMat);
    hull.position.y = 0.5; hull.castShadow = true; g.add(hull);

    // 4-Barreled 23mm Anti-Aircraft Autocannon Turret (turretSystem)
    const turretSys = new THREE.Group();
    turretSys.name = "turretSystem";
    turretSys.position.set(0, 0.8, -0.1);

    const turret = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 1.6), hullMat);
    turret.position.y = 0.28; turretSys.add(turret);

    // 4 Synchronized Autocannon Barrels with flash hiders
    [-0.32, -0.11, 0.11, 0.32].forEach(x => {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 2.2, 8), matGunmetal);
        barrel.rotation.x = Math.PI / 2; barrel.position.set(x, 0.35, 1.4); barrel.castShadow = true; turretSys.add(barrel);

        const hider = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 8), matDarkMetal);
        hider.rotation.x = -Math.PI / 2; hider.position.set(x, 0.35, 2.55); turretSys.add(hider);
    });

    // Twin side ammo drums
    [-0.8, 0.8].forEach(x => {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.26, 10), matDarkMetal);
        drum.rotation.z = Math.PI / 2; drum.position.set(x, 0.4, -0.1); turretSys.add(drum);
    });

    g.add(turretSys);
    return g;
}

function createToxinTractorMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['toxintractor']) {
        return createW3DVehicleMesh('toxintractor', isEnemy);
    }
    const g = new THREE.Group();
    const bodyMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.5 }) : matGLA;

    // Tracked tractor chassis
    g.add(createTrackAssembly(2.35, 0.6, 3.2, bodyMat, isEnemy));

    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.95, 1.6), bodyMat);
    cab.position.set(0, 1.0, 0.1); cab.castShadow = true; g.add(cab);

    // Front clearing dozer blade
    const blade = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.65, 0.15), matGunmetal);
    blade.position.set(0, 0.48, 1.9); g.add(blade);

    // Twin pressurized toxic chemical tanks with green liquid level gauge
    [-0.52, 0.52].forEach(x => {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.3, 12), matToxinGreen);
        tank.rotation.x = Math.PI / 2; tank.position.set(x, 0.95, -1.0); tank.castShadow = true; g.add(tank);

        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 10), matDarkMetal);
        band.rotation.x = Math.PI / 2; band.position.set(x, 0.95, -1.0); g.add(band);
    });

    // Roof Chemical Spray Turret (turretSystem)
    const turretSys = new THREE.Group();
    turretSys.name = "turretSystem";
    turretSys.position.set(0, 1.48, 0.1);

    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.6, 8), matGunmetal);
    gun.rotation.x = Math.PI / 2; gun.position.set(0, 0.18, 0.85); gun.castShadow = true; turretSys.add(gun);

    const nozzle = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), matToxinGreen);
    nozzle.position.set(0, 0.18, 1.7); turretSys.add(nozzle);

    g.add(turretSys);
    return g;
}

function createBombTruckMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['bombtruck']) {
        return createW3DVehicleMesh('bombtruck', isEnemy);
    }
    const g = new THREE.Group();
    const cabMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.5 }) : matCorrugated;

    // Delivery truck chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.25, 4.0), matDarkMetal);
    chassis.position.y = 0.42; g.add(chassis);

    // Cab
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.95, 1.3), cabMat);
    cab.position.set(0, 0.98, 1.25); cab.castShadow = true; g.add(cab);

    // 6 Wheels
    [-0.95, 0.95].forEach(x => {
        [-1.3, -0.25, 1.25].forEach(z => {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 10), matTire);
            wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.42, z); g.add(wheel);
        });
    });

    // Enclosed cargo hold containing high explosives & dynamite
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.05, 2.4), matCorrugated);
    cargo.position.set(0, 1.05, -0.7); cargo.castShadow = true; g.add(cargo);

    // Visible explosive barrels on top / rear
    [-0.45, 0.45].forEach(x => {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.65, 10), matRedStar);
        barrel.position.set(x, 1.35, -1.6); g.add(barrel);
    });

    return g;
}

function createScudLauncherMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['scud']) {
        return createW3DVehicleMesh('scud', isEnemy);
    }
    const g = new THREE.Group();
    const cabMat = isEnemy ? new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.5 }) : matGLA;

    // 8x8 Mobile Transporter Erector Launcher chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.32, 4.8), matDarkMetal);
    chassis.position.y = 0.5; g.add(chassis);

    // Armored forward driving cab
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.95, 1.4), cabMat);
    cab.position.set(0, 1.05, 1.6); cab.castShadow = true; g.add(cab);

    // 8 Heavy tires
    [-1.05, 1.05].forEach(x => {
        [-1.7, -0.6, 0.5, 1.6].forEach(z => {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.34, 12), matTire);
            wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.48, z); g.add(wheel);
        });
    });

    // Hydraulic Erection Arm & SCUD Missile
    const launchRail = new THREE.Group();
    launchRail.position.set(0, 0.8, -0.6);
    launchRail.rotation.x = -Math.PI / 6; // Elevated 30 degrees

    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.25, 4.4), matGunmetal);
    launchRail.add(rail);

    const scudBody = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 4.2, 14), matChinaColor);
    scudBody.rotation.x = Math.PI / 2; scudBody.position.set(0, 0.42, 0.3); launchRail.add(scudBody);

    const scudWarhead = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.2, 14), matToxinGreen);
    scudWarhead.rotation.x = -Math.PI / 2; scudWarhead.position.set(0, 0.42, 2.7); launchRail.add(scudWarhead);

    g.add(launchRail);
    return g;
}

function createRadarVanMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['radarvan']) {
        return createW3DVehicleMesh('radarvan', isEnemy);
    }
    const g = new THREE.Group();
    // Weathered van body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.15, 2.9), matCorrugated);
    body.position.y = 0.98; body.castShadow = true; g.add(body);

    // Makeshift rotating radar dish (radarDish)
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), matGunmetal);
    dish.name = "radarDish";
    dish.scale.set(1.4, 0.35, 1); dish.position.set(0, 1.95, 0); g.add(dish);

    // Antennas
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.4, 6), matDarkMetal);
    ant.position.set(0.65, 2.0, -0.8); g.add(ant);

    // 4 Wheels
    [-0.95, 0.95].forEach(x => {
        [-0.95, 0.95].forEach(z => {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 10), matTire);
            wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.42, z); g.add(wheel);
        });
    });

    return g;
}

function createRebelMesh(isEnemy = false) {
    if (typeof createW3DInfantryMesh === 'function' && window.W3D_INFANTRY_DATA && window.W3D_INFANTRY_DATA['rebel']) {
        return createW3DInfantryMesh('rebel', isEnemy);
    }
    const g = new THREE.Group();
    g.scale.set(0.52, 0.52, 0.52);
    // Guerrilla fighter with desert robe & keffiyeh
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 1.25, 8), matGLAColor);
    body.position.y = 0.64; body.castShadow = true; g.add(body);

    const wrap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), matSandbags);
    wrap.position.y = 1.38; g.add(wrap);

    // Ammo bandolier across chest
    const bandolier = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 6, 12), matDarkMetal);
    bandolier.rotation.x = Math.PI / 3; bandolier.position.y = 0.88; g.add(bandolier);

    // AK-47 assault rifle with curved banana magazine
    const ak47 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.92), matGunmetal);
    ak47.position.set(0.24, 0.86, 0.24); ak47.castShadow = true; g.add(ak47);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.12), matDarkMetal);
    mag.position.set(0.24, 0.74, 0.2); g.add(mag);

    return g;
}

function createRPGTrooperMesh(isEnemy = false) {
    if (typeof createW3DInfantryMesh === 'function' && window.W3D_INFANTRY_DATA && window.W3D_INFANTRY_DATA['rpg']) {
        return createW3DInfantryMesh('rpg', isEnemy);
    }
    const g = createRebelMesh(isEnemy);
    // RPG-7 launcher
    const rpg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.45, 8), matGunmetal);
    rpg.rotation.x = Math.PI / 2; rpg.position.set(0.34, 1.18, 0.2); g.add(rpg);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.42, 8), matToxinGreen);
    tip.rotation.x = Math.PI / 2; tip.position.set(0.34, 1.18, 1.0); g.add(tip);
    return g;
}

function createTerroristMesh(isEnemy = false) {
    if (typeof createW3DInfantryMesh === 'function' && window.W3D_INFANTRY_DATA && window.W3D_INFANTRY_DATA['terrorist']) {
        return createW3DInfantryMesh('terrorist', isEnemy);
    }
    const g = createRebelMesh(isEnemy);
    // Suicide explosive vest with dynamite sticks
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.48, 0.38), matRedStar);
    vest.position.y = 0.88; g.add(vest);

    // Detonator wire & switch in hand
    const detonator = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.08), matDarkMetal);
    detonator.position.set(-0.25, 0.8, 0.25); g.add(detonator);
    return g;
}

function createAngryMobMesh() {
    const g = new THREE.Group();
    // 3 Angry mob rioters with Molotov cocktails
    for (let i = -1; i <= 1; i++) {
        const rebel = createRebelMesh();
        rebel.position.set(i * 0.45, 0, (i % 2) * 0.3);

        // Molotov cocktail with flaming rag
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 6), matGlass);
        bottle.position.set(0.3, 1.0, 0.35); rebel.add(bottle);

        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), matFlameOrange);
        flame.position.set(0.3, 1.18, 0.35); rebel.add(flame);

        g.add(rebel);
    }
    return g;
}

function createHijackerMesh() {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x1f1f1f, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.25, 8), dark);
    body.position.y = 0.64; g.add(body);

    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), dark);
    mask.position.y = 1.36; g.add(mask);

    // Lockpick / wirecutters
    const tool = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), matChrome);
    tool.position.set(0.25, 0.8, 0.2); g.add(tool);
    return g;
}

function createJarmenKellMesh(isEnemy = false) {
    if (typeof createW3DInfantryMesh === 'function' && window.W3D_INFANTRY_DATA && window.W3D_INFANTRY_DATA['jarmen']) {
        return createW3DInfantryMesh('jarmen', isEnemy);
    }
    const g = new THREE.Group();
    g.scale.set(0.52, 0.52, 0.52);
    const cloakMat = new THREE.MeshStandardMaterial({ color: 0x8a775b, roughness: 0.95 });

    // Ghillie desert burlap poncho
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.4, 8), cloakMat);
    body.position.y = 0.7; body.castShadow = true; g.add(body);

    // SVD Dragunov High-Caliber Sniper Rifle with long barrel & scope
    const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 1.6), matGunmetal);
    rifle.position.set(0.25, 0.88, 0.4); rifle.rotation.x = -0.12; rifle.castShadow = true; g.add(rifle);

    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 8), matDarkMetal);
    scope.rotation.x = Math.PI / 2; scope.position.set(0.25, 1.0, 0.35); g.add(scope);

    // Bipod
    const bipod = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.04), matDarkMetal);
    bipod.position.set(0.25, 0.72, 1.05); g.add(bipod);

    return g;
}


        // Module: Enhanced Buildings (USA, China, GLA)
// Detailed concrete foundations, hazard borders, rooftop ventilation, illuminated windows, radar dishes, authentic faction architecture

// --- USA STRUCTURES ---



function createMigMesh(isEnemy = false) {
    if (typeof createW3DVehicleMesh === 'function' && window.W3D_VEHICLE_DATA && window.W3D_VEHICLE_DATA['mig']) {
        return createW3DVehicleMesh('mig', isEnemy);
    }
    return createRaptorMesh(isEnemy);
}
