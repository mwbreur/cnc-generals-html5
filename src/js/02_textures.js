function createTerrainTexture() {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 512;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#4c5144';
            ctx.fillRect(0, 0, 512, 512);

            // Muted, overlapping earth and scrub patches create a seamless terrain tile.
            const patchColors = ['#5b5b47', '#414a40', '#625b48', '#4c5547', '#6a604b'];
            for (let i = 0; i < 950; i++) {
                ctx.globalAlpha = 0.08 + Math.random() * 0.13;
                ctx.fillStyle = patchColors[Math.floor(Math.random() * patchColors.length)];
                ctx.beginPath();
                ctx.ellipse(Math.random() * 512, Math.random() * 512,
                    3 + Math.random() * 24, 2 + Math.random() * 16,
                    Math.random() * Math.PI, 0, Math.PI * 2);
                ctx.fill();
            }

            for (let i = 0; i < 1800; i++) {
                const shade = Math.random() > 0.5 ? '#77705a' : '#292f2c';
                ctx.globalAlpha = 0.12 + Math.random() * 0.2;
                ctx.fillStyle = shade;
                ctx.beginPath();
                ctx.ellipse(Math.random() * 512, Math.random() * 512,
                    0.5 + Math.random() * 2.5, 0.5 + Math.random() * 1.8,
                    Math.random() * Math.PI, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;

            const texture = new THREE.CanvasTexture(canvas);
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(48, 48);
            texture.anisotropy = 4;
            texture.encoding = THREE.sRGBEncoding;
            return texture;
        }

        function init() {
            const container = document.getElementById('canvas-container');
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x0a0c10);
            scene.fog = new THREE.FogExp2(0x0a0c10, 0.003);

            camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 1000);
            updateCameraPosition();

            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            container.appendChild(renderer.domElement);

            const ambientLight = new THREE.AmbientLight(0x445566, 1.3);
            scene.add(ambientLight);
            initProceduralTextures();
            initSharedMaterials();

            const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
            dirLight.position.set(60, 80, 40);
            dirLight.castShadow = true;
            dirLight.shadow.mapSize.width = 2048;
            dirLight.shadow.mapSize.height = 2048;
            dirLight.shadow.camera.near = 0.5;
            dirLight.shadow.camera.far = 600;
            const d = 220;
            dirLight.shadow.camera.left = -d; dirLight.shadow.camera.right = d;
            dirLight.shadow.camera.top = d; dirLight.shadow.camera.bottom = -d;
            dirLight.shadow.bias = -0.0003;
            scene.add(dirLight);

            groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            initCustomMapsStorage();
            refreshMapDropdowns();
            initLobbySlots('single');
            initLobbySlots('multiplayer');
            initMapEditor();
            setupMapEnvironment('desert', 800);

            window.addEventListener('pointerdown', onPointerDown);
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
            window.addEventListener('wheel', onWindowWheel, { passive: false });
            window.addEventListener('keydown', e => { keysPressed[e.key.toLowerCase()] = true; });
            window.addEventListener('keyup', e => { keysPressed[e.key.toLowerCase()] = false; });
            window.addEventListener('resize', onWindowResize);
            window.addEventListener('contextmenu', e => e.preventDefault());

            animate();
        }

        function createSupplyFields() {
            const crystalMaterial = new THREE.MeshStandardMaterial({ color: 0xc7a85a, roughness: 0.58, metalness: 0.12 });
            const shadowCrystalMaterial = new THREE.MeshStandardMaterial({ color: 0x8d7846, roughness: 0.72 });
            const crateMaterial = new THREE.MeshStandardMaterial({ color: 0x66533a, roughness: 0.9 });
            const barrelMaterial = new THREE.MeshStandardMaterial({ color: 0x9a814c, roughness: 0.55, metalness: 0.35 });
            const padMaterial = new THREE.MeshStandardMaterial({ color: 0x363b30, roughness: 1 });
            const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xd4b45e, transparent: true, opacity: 0.42, side: THREE.DoubleSide });

            // A 4-by-4 grid keeps resource fields distributed across the playable map.
            for (let x = -240; x <= 240; x += 160) {
                for (let z = -240; z <= 240; z += 160) {
                    const position = new THREE.Vector3(x, 0, z);
                    const field = new THREE.Group();
                    const pad = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.8, 0.18, 20), padMaterial);
                    pad.position.y = 0.06;
                    pad.receiveShadow = true;
                    field.add(pad);
                    const marker = new THREE.Mesh(new THREE.RingGeometry(7.5, 8.1, 32), markerMaterial);
                    marker.rotation.x = -Math.PI / 2;
                    marker.position.y = 0.17;
                    field.add(marker);

                    const crystals = [];
                    for (let i = 0; i < 7; i++) {
                        const angle = i * 2.4;
                        const crystal = new THREE.Mesh(
                            new THREE.DodecahedronGeometry(0.85 + (i % 3) * 0.2, 0),
                            i % 2 ? crystalMaterial : shadowCrystalMaterial
                        );
                        crystal.position.set(Math.cos(angle) * (2 + (i % 2)), 0.65 + (i % 3) * 0.15, Math.sin(angle) * (2 + (i % 2)));
                        crystal.scale.y = 1.45;
                        crystal.rotation.set(0.12 * i, angle, 0.08 * i);
                        crystal.castShadow = true;
                        field.add(crystal);
                        crystals.push(crystal);
                    }

                    for (let i = 0; i < 2; i++) {
                        const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 1.2), crateMaterial);
                        crate.position.set(i ? -4.4 : 4.2, 0.65, i ? 2.8 : -2.5);
                        crate.rotation.y = i * 0.5;
                        crate.castShadow = true;
                        field.add(crate);
                    }
                    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 1.25, 10), barrelMaterial);
                    barrel.position.set(4.4, 0.72, 3.8);
                    barrel.castShadow = true;
                    field.add(barrel);

                    field.position.copy(position);
                    scene.add(field);
                    supplyPoints.push({ position, mesh: field, crystals, stock: 8000, maxStock: 8000 }); // 4x supplies per depot
                }
            }
        }

        function getSupplyDropoffPosition(unitPos = null) {
            const dropoffs = structures.filter(s =>
                !s.isBuilding && s.health > 0 &&
                (s.type === 'center' || s.type === 'supplyCenter' || s.type === 'supplyStash')
            );
            if (dropoffs.length === 0) return supplyCenterPos;
            if (!unitPos) {
                const sc = dropoffs.find(s => s.type === 'supplyCenter' || s.type === 'supplyStash');
                return sc ? sc.position : dropoffs[0].position;
            }
            let best = dropoffs[0];
            let bestDist = Infinity;
            for (const d of dropoffs) {
                const dist = Math.hypot(unitPos.x - d.position.x, unitPos.z - d.position.z);
                const weight = (d.type === 'supplyCenter' || d.type === 'supplyStash') ? 0.75 : 1.0;
                if (dist * weight < bestDist) {
                    bestDist = dist * weight;
                    best = d;
                }
            }
            return best.position;
        }

        function findNearestSupplyPoint(position) {
            let nearest = null;
            let nearestDistance = Infinity;
            supplyPoints.forEach(point => {
                if (point.stock <= 0) return;
                const distance = position.distanceTo(point.position);
                if (distance < nearestDistance) {
                    nearest = point;
                    nearestDistance = distance;
                }
            });
            return nearest;
        }

        
        // Procedural Textures and Materials for authentic C&C Generals visual style
        // Module: Enhanced Textures and Materials
// High-resolution procedural textures with bump mapping, panel seams, rivets, stencils, and military shaders

let texCamoUSA, texCamoChina, texCamoGLA, texHazard, texTread, texMetalPlate, texBumpPlate;
let texConcrete, texBumpConcrete, texCorrugated, texTechSolar;
let matUSA, matChina, matGLA, matUSAColor, matChinaColor, matGLAColor;
let matGunmetal, matDarkMetal, matTread, matTire, matGlass, matBlueGlass, matGoldGlass;
let matHazard, matIonBlue, matNukeGreen, matToxinGreen, matRedStar, matGold, matConcrete;
let matSandbags, matTarp, matCorrugated, matBeaconRed, matBeaconAmber, matFlameOrange, matWood;
let matSolar, matWindowGlow, matChrome, matExhaust;

function initProceduralTextures() {
    // 1. High-Resolution Hazard Warning Stripes (256x256 with bevel highlights and metallic wear)
    const hazCanvas = document.createElement('canvas');
    hazCanvas.width = hazCanvas.height = 256;
    const hctx = hazCanvas.getContext('2d');
    hctx.fillStyle = '#f39c12';
    hctx.fillRect(0, 0, 256, 256);
    // Dark stripes
    hctx.fillStyle = '#1e272e';
    for (let i = -256; i < 512; i += 48) {
        hctx.beginPath();
        hctx.moveTo(i, 0);
        hctx.lineTo(i + 24, 0);
        hctx.lineTo(i + 24 + 256, 256);
        hctx.lineTo(i + 256, 256);
        hctx.closePath();
        hctx.fill();
    }
    // High-contrast pinstripe borders
    hctx.strokeStyle = '#f1c40f';
    hctx.lineWidth = 3;
    for (let i = -256; i < 512; i += 48) {
        hctx.beginPath();
        hctx.moveTo(i + 24, 0);
        hctx.lineTo(i + 24 + 256, 256);
        hctx.stroke();
    }
    texHazard = new THREE.CanvasTexture(hazCanvas);
    texHazard.wrapS = texHazard.wrapT = THREE.RepeatWrapping;

    // 2. High-Fidelity USA Digital & Desert Plate Camouflage (512x512)
    const usaCanvas = document.createElement('canvas');
    usaCanvas.width = usaCanvas.height = 512;
    const uctx = usaCanvas.getContext('2d');
    uctx.fillStyle = '#a6997d';
    uctx.fillRect(0, 0, 512, 512);

    // Multi-tone digital camo patches
    const usaTones = ['#8d8065', '#beaf93', '#71664f', '#9b8d72', '#cec2a8', '#635a46'];
    for (let i = 0; i < 90; i++) {
        uctx.fillStyle = usaTones[i % usaTones.length];
        const px = Math.random() * 512, py = Math.random() * 512;
        const pw = 24 + Math.random() * 48, ph = 16 + Math.random() * 32;
        uctx.fillRect(px, py, pw, ph);
    }
    // Recessed armor plate seams with 3D bevels
    uctx.strokeStyle = 'rgba(30, 25, 20, 0.65)';
    uctx.lineWidth = 3;
    for (let x = 64; x < 512; x += 128) {
        uctx.beginPath(); uctx.moveTo(x, 0); uctx.lineTo(x, 512); uctx.stroke();
    }
    for (let y = 64; y < 512; y += 128) {
        uctx.beginPath(); uctx.moveTo(0, y); uctx.lineTo(512, y); uctx.stroke();
    }
    // Light highlight line on opposite bevel
    uctx.strokeStyle = 'rgba(255, 250, 230, 0.45)';
    uctx.lineWidth = 1.5;
    for (let x = 65; x < 512; x += 128) {
        uctx.beginPath(); uctx.moveTo(x + 2, 0); uctx.lineTo(x + 2, 512); uctx.stroke();
    }
    for (let y = 65; y < 512; y += 128) {
        uctx.beginPath(); uctx.moveTo(0, y + 2); uctx.lineTo(512, y + 2); uctx.stroke();
    }
    // Hex bolt heads & rivets along plate joints
    uctx.fillStyle = '#2c251d';
    for (let x = 64; x < 512; x += 128) {
        for (let y = 16; y < 512; y += 32) {
            uctx.beginPath(); uctx.arc(x - 4, y, 2.5, 0, Math.PI * 2); uctx.fill();
            uctx.beginPath(); uctx.arc(x + 4, y, 2.5, 0, Math.PI * 2); uctx.fill();
        }
    }
    // USA Tactical Star Insignia Stencil
    uctx.save();
    uctx.translate(256, 256);
    uctx.strokeStyle = 'rgba(240, 240, 235, 0.4)';
    uctx.lineWidth = 4;
    uctx.beginPath(); uctx.arc(0, 0, 38, 0, Math.PI * 2); uctx.stroke();
    uctx.fillStyle = 'rgba(240, 240, 235, 0.35)';
    uctx.beginPath();
    for (let s = 0; s < 5; s++) {
        const a1 = (s * 4 * Math.PI) / 5 - Math.PI / 2;
        const rx = Math.cos(a1) * 32, ry = Math.sin(a1) * 32;
        if (s === 0) uctx.moveTo(rx, ry); else uctx.lineTo(rx, ry);
    }
    uctx.closePath(); uctx.fill();
    uctx.restore();

    texCamoUSA = new THREE.CanvasTexture(usaCanvas);
    texCamoUSA.wrapS = texCamoUSA.wrapT = THREE.RepeatWrapping;

    // 3. High-Fidelity China PLA Heavy Dragon Steel Camouflage (512x512)
    const chinaCanvas = document.createElement('canvas');
    chinaCanvas.width = chinaCanvas.height = 512;
    const cctx = chinaCanvas.getContext('2d');
    cctx.fillStyle = '#455636';
    cctx.fillRect(0, 0, 512, 512);

    const chinaTones = ['#324026', '#586c47', '#6d6144', '#28331e', '#7b6f50', '#4a5438'];
    for (let i = 0; i < 90; i++) {
        cctx.fillStyle = chinaTones[i % chinaTones.length];
        const px = Math.random() * 512, py = Math.random() * 512;
        const pw = 28 + Math.random() * 52, ph = 20 + Math.random() * 36;
        cctx.fillRect(px, py, pw, ph);
    }
    // Welded armor plate seam lines
    cctx.strokeStyle = 'rgba(20, 28, 14, 0.7)';
    cctx.lineWidth = 4;
    for (let x = 80; x < 512; x += 160) {
        cctx.beginPath(); cctx.moveTo(x, 0); cctx.lineTo(x, 512); cctx.stroke();
    }
    for (let y = 80; y < 512; y += 160) {
        cctx.beginPath(); cctx.moveTo(0, y); cctx.lineTo(512, y); cctx.stroke();
    }
    // Simulated rough weld beads
    cctx.fillStyle = '#6e7f59';
    for (let x = 80; x < 512; x += 160) {
        for (let y = 8; y < 512; y += 14) {
            cctx.beginPath(); cctx.arc(x, y, 3, 0, Math.PI * 2); cctx.fill();
        }
    }
    // PLA Gold-bordered Red Star emblem
    cctx.save();
    cctx.translate(256, 256);
    cctx.strokeStyle = 'rgba(241, 196, 15, 0.55)';
    cctx.lineWidth = 4;
    cctx.beginPath(); cctx.arc(0, 0, 42, 0, Math.PI * 2); cctx.stroke();
    cctx.fillStyle = 'rgba(192, 57, 43, 0.55)';
    cctx.beginPath();
    for (let s = 0; s < 5; s++) {
        const a1 = (s * 4 * Math.PI) / 5 - Math.PI / 2;
        const rx = Math.cos(a1) * 34, ry = Math.sin(a1) * 34;
        if (s === 0) cctx.moveTo(rx, ry); else cctx.lineTo(rx, ry);
    }
    cctx.closePath(); cctx.fill();
    cctx.restore();

    texCamoChina = new THREE.CanvasTexture(chinaCanvas);
    texCamoChina.wrapS = texCamoChina.wrapT = THREE.RepeatWrapping;

    // 4. High-Fidelity GLA Scavenger Scrap & Weathered Rust Texture (512x512)
    const glaCanvas = document.createElement('canvas');
    glaCanvas.width = glaCanvas.height = 512;
    const gctx = glaCanvas.getContext('2d');
    gctx.fillStyle = '#6e5842';
    gctx.fillRect(0, 0, 512, 512);

    // Weathered patchwork scrap plates in mismatched rusty tones
    const scrapColors = ['#8d4c2b', '#4e3f32', '#997a55', '#382f25', '#b36137', '#5f4b3a', '#783820'];
    for (let i = 0; i < 80; i++) {
        gctx.fillStyle = scrapColors[i % scrapColors.length];
        const px = Math.random() * 512, py = Math.random() * 512;
        const pw = 30 + Math.random() * 70, ph = 25 + Math.random() * 60;
        gctx.fillRect(px, py, pw, ph);
    }
    // Jagged welded patchwork borders
    gctx.strokeStyle = '#221914';
    gctx.lineWidth = 3.5;
    for (let i = 0; i < 25; i++) {
        const x1 = Math.random() * 512, y1 = Math.random() * 512;
        const x2 = x1 + (Math.random() - 0.5) * 160, y2 = y1 + (Math.random() - 0.5) * 160;
        gctx.beginPath(); gctx.moveTo(x1, y1); gctx.lineTo(x2, y2); gctx.stroke();
    }
    // Prominent scrap hex bolts and rivets
    gctx.fillStyle = '#1c1510';
    for (let i = 0; i < 180; i++) {
        gctx.beginPath();
        gctx.arc(Math.random() * 512, Math.random() * 512, 2.5 + Math.random() * 2, 0, Math.PI * 2);
        gctx.fill();
    }
    // Oil drips & rust streaks
    gctx.fillStyle = 'rgba(25, 18, 12, 0.45)';
    for (let i = 0; i < 30; i++) {
        const rx = Math.random() * 512, ry = Math.random() * 400;
        gctx.fillRect(rx, ry, 3 + Math.random() * 4, 25 + Math.random() * 65);
    }

    texCamoGLA = new THREE.CanvasTexture(glaCanvas);
    texCamoGLA.wrapS = texCamoGLA.wrapT = THREE.RepeatWrapping;

    // 5. Universal Armor Bump Map (512x512 Grayscale Surface Relief)
    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = bumpCanvas.height = 512;
    const bctx = bumpCanvas.getContext('2d');
    bctx.fillStyle = '#808080'; // Neutral mid-gray
    bctx.fillRect(0, 0, 512, 512);

    // Recessed plate lines (dark grooves)
    bctx.strokeStyle = '#202020';
    bctx.lineWidth = 4;
    for (let x = 64; x < 512; x += 128) {
        bctx.beginPath(); bctx.moveTo(x, 0); bctx.lineTo(x, 512); bctx.stroke();
    }
    for (let y = 64; y < 512; y += 128) {
        bctx.beginPath(); bctx.moveTo(0, y); bctx.lineTo(512, y); bctx.stroke();
    }
    // Raised plate bevels
    bctx.strokeStyle = '#c0c0c0';
    bctx.lineWidth = 2;
    for (let x = 66; x < 512; x += 128) {
        bctx.beginPath(); bctx.moveTo(x, 0); bctx.lineTo(x, 512); bctx.stroke();
    }
    for (let y = 66; y < 512; y += 128) {
        bctx.beginPath(); bctx.moveTo(0, y); bctx.lineTo(512, y); bctx.stroke();
    }
    // Raised rivets & bolts (bright white points)
    bctx.fillStyle = '#ffffff';
    for (let x = 64; x < 512; x += 128) {
        for (let y = 16; y < 512; y += 32) {
            bctx.beginPath(); bctx.arc(x - 5, y, 3, 0, Math.PI * 2); bctx.fill();
            bctx.beginPath(); bctx.arc(x + 5, y, 3, 0, Math.PI * 2); bctx.fill();
        }
    }
    // Cooling grille louvers
    bctx.fillStyle = '#303030';
    for (let g = 0; g < 8; g++) {
        bctx.fillRect(200, 200 + g * 12, 112, 5);
    }
    texBumpPlate = new THREE.CanvasTexture(bumpCanvas);
    texBumpPlate.wrapS = texBumpPlate.wrapT = THREE.RepeatWrapping;

    // 6. High-Detail Caterpillar Tread Texture (128x128)
    const treadCanvas = document.createElement('canvas');
    treadCanvas.width = treadCanvas.height = 128;
    const tctx = treadCanvas.getContext('2d');
    tctx.fillStyle = '#22252a';
    tctx.fillRect(0, 0, 128, 128);
    // Rubber chevron cleat pads
    tctx.fillStyle = '#121417';
    tctx.fillRect(0, 8, 128, 22);
    tctx.fillRect(0, 72, 128, 22);
    // Center steel guide horns
    tctx.fillStyle = '#636e72';
    tctx.fillRect(52, 12, 24, 14);
    tctx.fillRect(52, 76, 24, 14);
    // Outer track connector end-pins
    tctx.fillStyle = '#2d3436';
    tctx.fillRect(6, 10, 14, 18);
    tctx.fillRect(108, 10, 14, 18);
    tctx.fillRect(6, 74, 14, 18);
    tctx.fillRect(108, 74, 14, 18);
    // Metallic edge highlights
    tctx.fillStyle = '#8395a7';
    tctx.fillRect(52, 12, 24, 3);
    tctx.fillRect(52, 76, 24, 3);
    texTread = new THREE.CanvasTexture(treadCanvas);
    texTread.wrapS = texTread.wrapT = THREE.RepeatWrapping;

    // 7. Concrete Foundation Texture with Expansion Joints (512x512)
    const concCanvas = document.createElement('canvas');
    concCanvas.width = concCanvas.height = 512;
    const conctx = concCanvas.getContext('2d');
    conctx.fillStyle = '#5c646d';
    conctx.fillRect(0, 0, 512, 512);
    // Concrete aggregate speckles
    conctx.fillStyle = '#485058';
    for (let i = 0; i < 400; i++) {
        conctx.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    // Expansion joints
    conctx.strokeStyle = '#2b3036';
    conctx.lineWidth = 3;
    for (let i = 128; i < 512; i += 128) {
        conctx.beginPath(); conctx.moveTo(i, 0); conctx.lineTo(i, 512); conctx.stroke();
        conctx.beginPath(); conctx.moveTo(0, i); conctx.lineTo(512, i); conctx.stroke();
    }
    texConcrete = new THREE.CanvasTexture(concCanvas);
    texConcrete.wrapS = texConcrete.wrapT = THREE.RepeatWrapping;

    // 8. Concrete Bump Map
    const concBumpCanvas = document.createElement('canvas');
    concBumpCanvas.width = concBumpCanvas.height = 512;
    const cbctx = concBumpCanvas.getContext('2d');
    cbctx.fillStyle = '#808080';
    cbctx.fillRect(0, 0, 512, 512);
    cbctx.strokeStyle = '#303030';
    cbctx.lineWidth = 4;
    for (let i = 128; i < 512; i += 128) {
        cbctx.beginPath(); cbctx.moveTo(i, 0); cbctx.lineTo(i, 512); cbctx.stroke();
        cbctx.beginPath(); cbctx.moveTo(0, i); cbctx.lineTo(512, i); cbctx.stroke();
    }
    texBumpConcrete = new THREE.CanvasTexture(concBumpCanvas);
    texBumpConcrete.wrapS = texBumpConcrete.wrapT = THREE.RepeatWrapping;

    // 9. Corrugated Iron Metal Texture (256x256)
    const corCanvas = document.createElement('canvas');
    corCanvas.width = corCanvas.height = 256;
    const crctx = corCanvas.getContext('2d');
    crctx.fillStyle = '#655749';
    crctx.fillRect(0, 0, 256, 256);
    // Sinusoidal horizontal corrugation shading
    for (let y = 0; y < 256; y += 12) {
        crctx.fillStyle = '#4c3f33';
        crctx.fillRect(0, y, 256, 6);
        crctx.fillStyle = '#807060';
        crctx.fillRect(0, y + 6, 256, 6);
    }
    texCorrugated = new THREE.CanvasTexture(corCanvas);
    texCorrugated.wrapS = texCorrugated.wrapT = THREE.RepeatWrapping;

    // 10. Solar / Tech Grid Texture (256x256)
    const solCanvas = document.createElement('canvas');
    solCanvas.width = solCanvas.height = 256;
    const sctx = solCanvas.getContext('2d');
    sctx.fillStyle = '#0f2027';
    sctx.fillRect(0, 0, 256, 256);
    sctx.strokeStyle = '#00d2d3';
    sctx.lineWidth = 2;
    for (let x = 0; x < 256; x += 32) {
        sctx.beginPath(); sctx.moveTo(x, 0); sctx.lineTo(x, 256); sctx.stroke();
    }
    for (let y = 0; y < 256; y += 32) {
        sctx.beginPath(); sctx.moveTo(0, y); sctx.lineTo(256, y); sctx.stroke();
    }
    texTechSolar = new THREE.CanvasTexture(solCanvas);
    texTechSolar.wrapS = texTechSolar.wrapT = THREE.RepeatWrapping;
}

function initSharedMaterials() {
    matUSA = new THREE.MeshStandardMaterial({ map: texCamoUSA, bumpMap: texBumpPlate, bumpScale: 0.045, roughness: 0.58, metalness: 0.32 });
    matChina = new THREE.MeshStandardMaterial({ map: texCamoChina, bumpMap: texBumpPlate, bumpScale: 0.05, roughness: 0.55, metalness: 0.35 });
    matGLA = new THREE.MeshStandardMaterial({ map: texCamoGLA, bumpMap: texBumpPlate, bumpScale: 0.07, roughness: 0.8, metalness: 0.25 });

    matUSAColor = new THREE.MeshStandardMaterial({ color: 0x9c8e73, bumpMap: texBumpPlate, bumpScale: 0.03, roughness: 0.62, metalness: 0.3 });
    matChinaColor = new THREE.MeshStandardMaterial({ color: 0x48583a, bumpMap: texBumpPlate, bumpScale: 0.035, roughness: 0.6, metalness: 0.32 });
    matGLAColor = new THREE.MeshStandardMaterial({ color: 0x756149, bumpMap: texBumpPlate, bumpScale: 0.05, roughness: 0.82, metalness: 0.2 });

    matGunmetal = new THREE.MeshStandardMaterial({ color: 0x2e3338, bumpMap: texBumpPlate, bumpScale: 0.035, roughness: 0.38, metalness: 0.82 });
    matDarkMetal = new THREE.MeshStandardMaterial({ color: 0x181a1d, roughness: 0.5, metalness: 0.75 });
    matTread = new THREE.MeshStandardMaterial({ map: texTread, bumpMap: texBumpPlate, bumpScale: 0.08, roughness: 0.85, metalness: 0.45 });
    matTire = new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.92, metalness: 0.1 });

    matGlass = new THREE.MeshStandardMaterial({ color: 0x2ed573, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.82 });
    matBlueGlass = new THREE.MeshStandardMaterial({ color: 0x00d2d3, roughness: 0.08, metalness: 0.92, transparent: true, opacity: 0.85 });
    matGoldGlass = new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.12, metalness: 0.88, transparent: true, opacity: 0.85 });

    matHazard = new THREE.MeshStandardMaterial({ map: texHazard, roughness: 0.45, metalness: 0.2 });
    matIonBlue = new THREE.MeshStandardMaterial({ color: 0x00d2d3, emissive: 0x00a8ff, emissiveIntensity: 0.95 });
    matNukeGreen = new THREE.MeshStandardMaterial({ color: 0x10ac84, emissive: 0x2ed573, emissiveIntensity: 0.9 });
    matToxinGreen = new THREE.MeshStandardMaterial({ color: 0x7bed9f, emissive: 0x2ed573, emissiveIntensity: 0.95 });
    matRedStar = new THREE.MeshStandardMaterial({ color: 0xd63031, roughness: 0.48, metalness: 0.25 });
    matGold = new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.35, metalness: 0.7 });

    matConcrete = new THREE.MeshStandardMaterial({ map: texConcrete, bumpMap: texBumpConcrete, bumpScale: 0.05, roughness: 0.92, metalness: 0.08 });
    matSandbags = new THREE.MeshStandardMaterial({ color: 0x937c57, roughness: 0.98 });
    matTarp = new THREE.MeshStandardMaterial({ color: 0x48543e, roughness: 0.9 });
    matCorrugated = new THREE.MeshStandardMaterial({ map: texCorrugated, bumpMap: texBumpPlate, bumpScale: 0.07, roughness: 0.78, metalness: 0.4 });
    matWood = new THREE.MeshStandardMaterial({ color: 0x7f5539, roughness: 0.95 });

    matBeaconRed = new THREE.MeshStandardMaterial({ color: 0xff3838, emissive: 0xff3838, emissiveIntensity: 0.85 });
    matBeaconAmber = new THREE.MeshStandardMaterial({ color: 0xff9f1a, emissive: 0xff9f1a, emissiveIntensity: 0.85 });
    matFlameOrange = new THREE.MeshStandardMaterial({ color: 0xff793f, emissive: 0xff5252, emissiveIntensity: 1.1 });

    matSolar = new THREE.MeshStandardMaterial({ map: texTechSolar, roughness: 0.2, metalness: 0.85 });
    matWindowGlow = new THREE.MeshStandardMaterial({ color: 0xfffa65, emissive: 0xfffa65, emissiveIntensity: 0.85 });
    matChrome = new THREE.MeshStandardMaterial({ color: 0xdcdde1, roughness: 0.15, metalness: 0.95 });
    matExhaust = new THREE.MeshStandardMaterial({ color: 0x2f3640, roughness: 0.65, metalness: 0.6 });
}


        // Module: Enhanced Caterpillar Track Assembly
// High-detail tank track with dual roadwheels, rubber tires, hubcaps, toothed sprockets, return rollers, and side skirts

