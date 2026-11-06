// --- MAP EDITOR ENGINE ---
        let editorTheme = 'desert';
        let editorSize = 800;
        let editorWaterLevel = 0;
        let editorTool = 'hill';
        let editorHeightGrid = new Float32Array(32 * 32);
        let editorBridges = [];
        let editorSupplies = [];
        let editorSpawns = [];
        let editorProps = [];
        let editorIsMouseDown = false;

        function initMapEditor() {
            clearEditorCanvas();
            loadSavedMapsList();
            setupEditorCanvasEvents();
        }

        function clearEditorCanvas() {
            for (let i = 0; i < editorHeightGrid.length; i++) {
                editorHeightGrid[i] = 2.5;
            }
            editorBridges = [];
            editorSupplies = [];
            editorSpawns = getSpawnPointsForMap(editorSize, editorTheme, null);
            editorProps = [];
            renderEditorCanvas();
        }

        function generateRandomEditorTerrain() {
            const res = 32;
            for (let y = 0; y < res; y++) {
                for (let x = 0; x < res; x++) {
                    const nx = x / res;
                    const ny = y / res;
                    let h = 2.5 + Math.sin(nx * 4) * Math.cos(ny * 4) * 3.5;
                    const riverY = 0.5 + Math.sin(nx * 3) * 0.15;
                    const dRiver = Math.abs(ny - riverY);
                    if (dRiver < 0.12) {
                        h = -2.8;
                    }
                    editorHeightGrid[y * res + x] = h;
                }
            }
            editorBridges = [{ x: 0, z: 0, width: 22, length: 65, angle: Math.PI / 2 }];
            editorSupplies = [
                { x: -160, z: 160, amount: 8000 },
                { x: 160, z: -160, amount: 8000 }
            ];
            editorSpawns = getSpawnPointsForMap(editorSize, editorTheme, null);
            renderEditorCanvas();
            showNotification("Procedural starter terrain generated!", "info");
        }

        function setEditorTool(tool) {
            editorTool = tool;
            document.querySelectorAll('.editor-tool-btn').forEach(b => b.classList.remove('active'));
            const btn = document.getElementById(`tool-${tool}`);
            if (btn) btn.classList.add('active');
        }

        function onEditorThemeChange() {
            const themeEl = document.getElementById('me-map-theme');
            if (themeEl) editorTheme = themeEl.value;
            renderEditorCanvas();
        }

        function onEditorSizeChange() {
            const sizeEl = document.getElementById('me-map-size');
            if (sizeEl) editorSize = parseInt(sizeEl.value, 10);
            editorSpawns = getSpawnPointsForMap(editorSize, editorTheme, null);
            renderEditorCanvas();
        }

        function setupEditorCanvasEvents() {
            const canvas = document.getElementById('editor-canvas');
            if (!canvas) return;

            canvas.addEventListener('mousedown', (e) => {
                editorIsMouseDown = true;
                applyEditorBrush(e);
            });
            window.addEventListener('mouseup', () => { editorIsMouseDown = false; });
            canvas.addEventListener('mousemove', (e) => {
                if (editorIsMouseDown) applyEditorBrush(e);
            });
            canvas.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                applyEditorBrush(e, true);
            });
        }

        function applyEditorBrush(e, isRightClick = false) {
            const canvas = document.getElementById('editor-canvas');
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            const res = 32;
            const gx = Math.floor((clickX / canvas.width) * res);
            const gy = Math.floor((clickY / canvas.height) * res);
            const worldX = (clickX / canvas.width - 0.5) * editorSize;
            const worldZ = (clickY / canvas.height - 0.5) * editorSize;

            if (editorTool === 'hill') {
                const delta = isRightClick ? -1.5 : 1.5;
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        const px = gx + dx;
                        const py = gy + dy;
                        if (px >= 0 && px < res && py >= 0 && py < res) {
                            const dist = Math.hypot(dx, dy);
                            if (dist <= 2.2) {
                                editorHeightGrid[py * res + px] = Math.max(-4, Math.min(14, editorHeightGrid[py * res + px] + delta * (1 - dist / 2.5)));
                            }
                        }
                    }
                }
            } else if (editorTool === 'plateau') {
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        const px = gx + dx;
                        const py = gy + dy;
                        if (px >= 0 && px < res && py >= 0 && py < res) {
                            editorHeightGrid[py * res + px] = 6.5;
                        }
                    }
                }
            } else if (editorTool === 'water') {
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        const px = gx + dx;
                        const py = gy + dy;
                        if (px >= 0 && px < res && py >= 0 && py < res) {
                            editorHeightGrid[py * res + px] = -3.2;
                        }
                    }
                }
            } else if (editorTool === 'bridge') {
                if (editorBridges.length < 6) {
                    editorBridges.push({ x: worldX, z: worldZ, width: 22, length: 65, angle: 0 });
                }
            } else if (editorTool === 'supply') {
                if (editorSupplies.length < 10) {
                    editorSupplies.push({ x: worldX, z: worldZ, amount: 8000 });
                }
            } else if (editorTool === 'spawn') {
                let closest = null;
                let minDist = Infinity;
                editorSpawns.forEach(sp => {
                    const d = Math.hypot(sp.x - worldX, sp.z - worldZ);
                    if (d < minDist) { minDist = d; closest = sp; }
                });
                if (closest) {
                    closest.x = worldX;
                    closest.z = worldZ;
                }
            } else if (editorTool === 'prop') {
                editorProps.push({ x: worldX, z: worldZ, type: 'tree' });
            }

            renderEditorCanvas();
        }

        function renderEditorCanvas() {
            const canvas = document.getElementById('editor-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const w = canvas.width;
            const h = canvas.height;
            const res = 32;
            const cellW = w / res;
            const cellH = h / res;
            const waterEl = document.getElementById('me-water-level');
            const waterLvl = parseFloat((waterEl && waterEl.value) || 0);

            for (let gy = 0; gy < res; gy++) {
                for (let gx = 0; gx < res; gx++) {
                    const val = editorHeightGrid[gy * res + gx];
                    if (val < waterLvl) {
                        ctx.fillStyle = '#2980b9';
                    } else {
                        const b = Math.min(255, Math.max(70, Math.floor(130 + val * 10)));
                        ctx.fillStyle = editorTheme === 'jungle' ? `rgb(25, ${b}, 40)` :
                                        editorTheme === 'snow' ? `rgb(${b}, ${b}, 245)` :
                                        editorTheme === 'city' ? `rgb(${b*0.75}, ${b*0.75}, ${b*0.75})` :
                                        `rgb(${b}, ${b*0.82}, 95)`;
                    }
                    ctx.fillRect(gx * cellW, gy * cellH, cellW + 1, cellH + 1);
                }
            }

            ctx.fillStyle = '#833471';
            editorBridges.forEach(b => {
                const cx = (b.x / editorSize + 0.5) * w;
                const cy = (b.z / editorSize + 0.5) * h;
                ctx.fillRect(cx - 10, cy - 16, 20, 32);
            });

            ctx.fillStyle = '#f1c40f';
            editorSupplies.forEach(s => {
                const cx = (s.x / editorSize + 0.5) * w;
                const cy = (s.z / editorSize + 0.5) * h;
                ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
            });

            editorSpawns.forEach(sp => {
                const cx = (sp.x / editorSize + 0.5) * w;
                const cy = (sp.z / editorSize + 0.5) * h;
                ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2);
                ctx.fillStyle = '#00ffcc'; ctx.fill();
                ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
                ctx.fillStyle = '#000'; ctx.font = 'bold 9px monospace';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(sp.id, cx, cy);
            });
        }

        // --- MAP SAVE, LOAD, EXPORT & IMPORT ---
        function initCustomMapsStorage() {
            try {
                const raw = localStorage.getItem('cnc_custom_maps');
                if (raw) savedCustomMaps = JSON.parse(raw);
            } catch (e) {
                console.warn('localStorage not accessible, using memory cache:', e);
            }
        }

        function saveCustomMap() {
            const nameEl = document.getElementById('me-map-name');
            const name = ((nameEl && nameEl.value) || 'Custom Map').trim();
            const id = 'custom_' + Date.now();
            const waterEl = document.getElementById('me-water-level');
            const mapObj = {
                id: id,
                name: name,
                theme: editorTheme,
                size: editorSize,
                waterLevel: parseFloat((waterEl && waterEl.value) || 0),
                heightGrid: Array.from(editorHeightGrid),
                bridges: editorBridges,
                supplies: editorSupplies,
                spawnPoints: editorSpawns,
                props: editorProps
            };

            savedCustomMaps[id] = mapObj;
            try {
                localStorage.setItem('cnc_custom_maps', JSON.stringify(savedCustomMaps));
            } catch (e) {}

            refreshMapDropdowns();
            loadSavedMapsList();
            showNotification(`Map "${name}" saved! Available in Theater of War.`, 'success');
        }

        function refreshMapDropdowns() {
            const spSelect = document.getElementById('map-environment');
            const mpSelect = document.getElementById('mp-map-env');

            [spSelect, mpSelect].forEach(sel => {
                if (!sel) return;
                sel.innerHTML = `
                    <option value="desert" selected>Desert Canyon (Middle East) - Dunes, mesas, oasis</option>
                    <option value="jungle">Tropical Jungle (Mekong Basin) - River, lush hills, canopy</option>
                    <option value="snow">Frozen Mountain (Siberian Tundra) - Icy ridges, frozen lake</option>
                    <option value="city">Small City Grid (Urban Warfare) - Skyscrapers, canal, streets</option>
                    <option value="random">Procedural Warzone - Random Hills, River & Bridges</option>
                `;
                Object.values(savedCustomMaps).forEach(map => {
                    const opt = document.createElement('option');
                    opt.value = map.id;
                    opt.innerText = `🗺️ ${map.name} (${map.theme.toUpperCase()} ${map.size}x${map.size})`;
                    sel.appendChild(opt);
                });
            });
        }

        function loadSavedMapsList() {
            const listEl = document.getElementById('saved-maps-list');
            if (!listEl) return;
            const maps = Object.values(savedCustomMaps);
            if (maps.length === 0) {
                listEl.innerHTML = '<div style="color:#8f9e91; font-size:11px; padding:6px;">No custom maps saved yet. Create and save one above!</div>';
                return;
            }

            let html = '';
            maps.forEach(m => {
                html += `<div class="saved-map-card">
                    <div>
                        <strong>${escapeHtml(m.name)}</strong>
                        <span style="color:#8f9e91; font-size:10px; margin-left:6px;">${m.theme} (${m.size}x${m.size})</span>
                    </div>
                    <div style="display:flex; gap:4px;">
                        <button class="rts-btn" style="padding:2px 8px; font-size:10px;" onclick="loadCustomMapIntoEditor('${m.id}')">EDIT</button>
                        <button class="rts-btn" style="padding:2px 8px; font-size:10px; border-color:#ff4757; color:#ff4757;" onclick="deleteCustomMap('${m.id}')">DEL</button>
                    </div>
                </div>`;
            });
            listEl.innerHTML = html;
        }

        function loadCustomMapIntoEditor(id) {
            const m = savedCustomMaps[id];
            if (!m) return;
            const nameEl = document.getElementById('me-map-name');
            const themeEl = document.getElementById('me-map-theme');
            const sizeEl = document.getElementById('me-map-size');
            const waterEl = document.getElementById('me-water-level');

            if (nameEl) nameEl.value = m.name;
            if (themeEl) themeEl.value = m.theme;
            if (sizeEl) sizeEl.value = String(m.size);
            if (waterEl) waterEl.value = String(m.waterLevel || 0);

            editorTheme = m.theme;
            editorSize = m.size;
            editorHeightGrid = new Float32Array(m.heightGrid);
            editorBridges = m.bridges || [];
            editorSupplies = m.supplies || [];
            editorSpawns = m.spawnPoints || getSpawnPointsForMap(editorSize, editorTheme, null);
            editorProps = m.props || [];

            renderEditorCanvas();
            showNotification(`Loaded custom map "${m.name}" into editor.`, 'info');
        }

        function deleteCustomMap(id) {
            delete savedCustomMaps[id];
            try { localStorage.setItem('cnc_custom_maps', JSON.stringify(savedCustomMaps)); } catch (e) {}
            refreshMapDropdowns();
            loadSavedMapsList();
            showNotification("Custom map removed.", "info");
        }

        function exportCustomMapJSON() {
            const nameEl = document.getElementById('me-map-name');
            const name = ((nameEl && nameEl.value) || 'Custom Map').trim();
            const waterEl = document.getElementById('me-water-level');
            const mapObj = {
                name: name,
                theme: editorTheme,
                size: editorSize,
                waterLevel: parseFloat((waterEl && waterEl.value) || 0),
                heightGrid: Array.from(editorHeightGrid),
                bridges: editorBridges,
                supplies: editorSupplies,
                spawnPoints: editorSpawns,
                props: editorProps
            };
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(mapObj));
            const dlAnchor = document.createElement('a');
            dlAnchor.setAttribute("href", dataStr);
            dlAnchor.setAttribute("download", `${name.toLowerCase().replace(/\s+/g, '_')}.cncmap.json`);
            dlAnchor.click();
            showNotification("Map file exported to JSON download.", "success");
            return JSON.stringify(mapObj, null, 2);
        }

        function importCustomMapJSON() {
            const jsonText = prompt("Paste raw custom map JSON data here:");
            if (!jsonText) return;
            try {
                const m = JSON.parse(jsonText);
                const id = 'custom_' + Date.now();
                m.id = id;
                savedCustomMaps[id] = m;
                try { localStorage.setItem('cnc_custom_maps', JSON.stringify(savedCustomMaps)); } catch (e) {}
                refreshMapDropdowns();
                loadSavedMapsList();
                loadCustomMapIntoEditor(id);
                showNotification(`Map "${m.name}" imported successfully!`, 'success');
            } catch (e) {
                showNotification("Invalid map JSON format.", "error");
            }
        }

        function playCustomMapNow() {
            saveCustomMap();
            switchGameModeTab('single');
            const spSelect = document.getElementById('map-environment');
            const latestId = Object.keys(savedCustomMaps).pop();
            if (latestId && spSelect) {
                spSelect.value = latestId;
                onMapSelectionChange('single');
            }
        }

        function getMapBasePositions(mapSize) {
            const offset = mapSize * 0.32;
            return {
                alpha: { name: 'Base Alpha (South-West)', pos: new THREE.Vector3(-offset, getTerrainHeight(-offset, offset), offset), oppKey: 'bravo' },
                bravo: { name: 'Base Bravo (North-East)', pos: new THREE.Vector3(offset, getTerrainHeight(offset, -offset), -offset), oppKey: 'alpha' },
                charlie: { name: 'Base Charlie (North-West)', pos: new THREE.Vector3(-offset, getTerrainHeight(-offset, -offset), -offset), oppKey: 'delta' },
                delta: { name: 'Base Delta (South-East)', pos: new THREE.Vector3(offset, getTerrainHeight(offset, offset), offset), oppKey: 'charlie' }
            };
        }

        function startGame() {
            const selectedEnv = document.getElementById('map-environment').value;
            const selectedSize = Number(document.getElementById('map-size').value);
            playerStartingPositionKey = (document.getElementById('player-start-pos') || {}).value || 'alpha';
            aiDifficultyLevel = (document.getElementById('ai-difficulty') || {}).value || 'medium';
            aiFactionChosen = (document.getElementById('ai-faction') || {}).value || 'random';

            setupMapEnvironment(selectedEnv, selectedSize);

            playerResources = Number(document.getElementById('starting-money').value);
            document.getElementById('resource-display').innerText = `$${playerResources}`;
            refreshFactionRoster();
            document.getElementById('start-menu').style.display = 'none';

            // Fixed Base Deployments for Player & AI Opponent
            setupGameDeployment();
        }

        function createSingleSupplyDock(pos) {
            const crystalMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.5, metalness: 0.2 });
            const crateMat = new THREE.MeshStandardMaterial({ color: 0x7f5539, roughness: 0.9 });
            const padMat = new THREE.MeshStandardMaterial({ color: 0x34495e, roughness: 0.95 });

            const field = new THREE.Group();
            const pad = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 7.2, 0.25, 16), padMat);
            pad.position.y = 0.12; field.add(pad);

            const crystals = [];
            for (let i = 0; i < 7; i++) {
                const angle = i * 2.4;
                const crystal = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95 + (i % 3) * 0.2, 0), crystalMat);
                crystal.position.set(Math.cos(angle) * (2.2 + (i % 2)), 0.75 + (i % 3) * 0.15, Math.sin(angle) * (2.2 + (i % 2)));
                crystal.scale.y = 1.45;
                field.add(crystal);
                crystals.push(crystal);
            }
            for (let c = 0; c < 3; c++) {
                const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.4), crateMat);
                crate.position.set(-2.8 + c * 1.5, 0.55, 3.2 - c * 0.6);
                crate.rotation.y = c * 0.4;
                field.add(crate);
            }
            field.position.copy(pos);
            scene.add(field);
            const dockObj = {
                mesh: field,
                position: pos.clone(),
                remaining: 8000,
                maxSupplies: 8000,
                crystals: crystals
            };
            supplyPoints.push(dockObj);
            return dockObj;
        }

        function spawnSupplyCacheNearBase(basePos) {
            const angle = Math.atan2(basePos.z, basePos.x) + Math.PI; // Offset slightly toward map center
            const sx = basePos.x + Math.cos(angle) * 25;
            const sz = basePos.z + Math.sin(angle) * 25;
            const sy = getTerrainHeight(sx, sz);
            const supplyV = new THREE.Vector3(sx, sy, sz);

            const tooClose = supplyPoints.some(sp => sp.position.distanceTo(supplyV) < 18);
            if (!tooClose) {
                createSingleSupplyDock(supplyV);
            }
        }

        function deployBase(position, faction = selectedFaction, team = playerTeamId) {
            const nearby = structures.some(structure => structure.position.distanceTo(position) < structure.radius + 18);
            if (nearby || Math.abs(position.x) > currentMapSize * 0.48 || Math.abs(position.z) > currentMapSize * 0.48) return;
            choosingBaseLocation = false;
            const hint = document.getElementById('deployment-hint');
            if (hint) hint.style.display = 'none';
            cameraTarget.copy(position);
            updateCameraPosition();
            supplyCenterPos.copy(position);
            supplyCenterPos.y = getTerrainHeight(supplyCenterPos.x, supplyCenterPos.z);
            const ccObj = buildStructureMesh('center', supplyCenterPos, true);
            if (ccObj) {
                ccObj.teamId = team;
                ccObj.ownerId = 'player';
                ccObj.isAI = false;
            }
            const setupEl = document.getElementById('starting-units');
            const setup = (setupEl && setupEl.value) || 'small';
            const factionData = factionCatalog[faction] || factionCatalog['usa'];
            const coreUnits = factionData.starter;
            let forces = setup === 'dozer' ? [coreUnits[0]] : setup === 'large'
                ? [coreUnits[0], coreUnits[0], coreUnits[1], coreUnits[1], coreUnits[2], coreUnits[2]]
                : coreUnits;
            forces.forEach((type, index) => {
                const angle = index * 2.4;
                const at = position.clone().add(new THREE.Vector3(Math.cos(angle) * 13, 0, Math.sin(angle) * 13));
                at.y = getTerrainHeight(at.x, at.z);
                const u = spawnUnit(type, at);
                if (u) {
                    u.teamId = team;
                    u.ownerId = 'player';
                    u.isAI = false;
                }
            });
            showNotification('Command Center operational. Base established.', 'success');
            updateSidebar();
        }

        function setupGameDeployment() {
            const selectedEnv = document.getElementById('map-environment').value;
            const selectedSize = Number(document.getElementById('map-size').value);
            const spawns = getSpawnPointsForMap(selectedSize, selectedEnv, activeCustomMap);

            // 1. Clear previous battle assets
            structures.forEach(s => { if (s.mesh) scene.remove(s.mesh); });
            structures.length = 0;
            units.forEach(u => { if (u.mesh) scene.remove(u.mesh); });
            units.length = 0;
            enemyStructures.forEach(es => { if (es.mesh) scene.remove(es.mesh); });
            enemyStructures.length = 0;
            enemyUnits.forEach(eu => { if (eu.mesh) scene.remove(eu.mesh); });
            enemyUnits.length = 0;

            choosingBaseLocation = false;
            document.getElementById('deployment-hint').style.display = 'none';

            // Find player slot
            const playerSlot = spSlots.find(s => s.active && s.isPlayer) || spSlots[0];
            playerTeamId = playerSlot.team;
            selectedFaction = playerSlot.faction;

            // Deploy all active slots
            const activeSlots = spSlots.filter(s => s.active);

            activeSlots.forEach(slot => {
                const spObj = spawns.find(p => p.id === slot.spawnId) || spawns[0];
                const spawnPos = new THREE.Vector3(spObj.x, getTerrainHeight(spObj.x, spObj.z), spObj.z);

                // Ensure every base has convenient resources nearby
                spawnSupplyCacheNearBase(spawnPos);

                if (slot.isPlayer) {
                    // Deploy Player base
                    deployBase(spawnPos, slot.faction, slot.team);
                    cameraRadius = selectedSize > 900 ? 220 : selectedSize > 600 ? 180 : 140;
                    cameraTarget.copy(spawnPos);
                    updateCameraPosition();
                } else {
                    // Deploy AI Opponent / Ally base
                    let fac = slot.faction;
                    if (fac === 'random') {
                        const facList = ['usa', 'china', 'gla'];
                        fac = facList[Math.floor(Math.random() * facList.length)];
                    }
                    deployEnemyBase(spawnPos, fac, 'ai_' + slot.id, slot.team, slot.difficulty);
                }
            });

            hasSpawnedInitialEnemyBase = true;
            isMatchActive = true;
            updateSidebar();
            showNotification(`Tactical Theater Initialized: ${activeSlots.length} Commanders deployed. Good luck, General!`, 'success');
        }

        function deployEnemyBase(pos, faction, ownerId = 'ai_1', teamId = 2, difficulty = 'medium') {
            // Enemy Command Center
            const ccType = 'center';
            const ccGroup = faction === 'china' ? createChinaCommandCenter() : faction === 'gla' ? createGLACommandCenter() : createUSACommandCenter();
            ccGroup.position.copy(pos);
            ccGroup.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
            scene.add(ccGroup);
            enemyStructures.push({
                type: ccType, faction: faction, position: pos.clone(), mesh: ccGroup,
                health: 2200, maxHealth: 2200, radius: 11, buildProgress: 100, isBuilding: false,
                netId: 'ES_' + (++netIdSequence), teamId: teamId, ownerId: ownerId, isAI: true, difficulty: difficulty
            });

            // Enemy Power / Reactor / Supply Stash
            const pwrPos = pos.clone().add(new THREE.Vector3(faction === 'gla' ? -18 : -20, 0, -18));
            pwrPos.y = getTerrainHeight(pwrPos.x, pwrPos.z);
            let pwrGroup;
            if (faction === 'china') pwrGroup = createChinaNuclearReactor();
            else if (faction === 'gla') pwrGroup = createGLASupplyStash();
            else pwrGroup = createUSAColdFusionReactor();
            pwrGroup.position.copy(pwrPos);
            pwrGroup.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
            scene.add(pwrGroup);
            enemyStructures.push({
                type: faction === 'gla' ? 'supplyStash' : 'power', faction: faction, position: pwrPos, mesh: pwrGroup,
                health: 1200, maxHealth: 1200, radius: 8, buildProgress: 100, isBuilding: false,
                netId: 'ES_' + (++netIdSequence), teamId: teamId, ownerId: ownerId, isAI: true, difficulty: difficulty
            });

            // Enemy War Factory / Arms Dealer
            const facPos = pos.clone().add(new THREE.Vector3(22, 0, -16));
            facPos.y = getTerrainHeight(facPos.x, facPos.z);
            const facGroup = faction === 'china' ? createChinaWarFactory() : faction === 'gla' ? createGLAArmsDealer(false) : createUSAWarFactory();
            facGroup.position.copy(facPos);
            facGroup.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
            scene.add(facGroup);
            enemyStructures.push({
                type: 'factory', faction: faction, position: facPos, mesh: facGroup,
                health: 1600, maxHealth: 1600, radius: 10, buildProgress: 100, isBuilding: false,
                netId: 'ES_' + (++netIdSequence), teamId: teamId, ownerId: ownerId, isAI: true, difficulty: difficulty
            });

            // Enemy Barracks
            const barPos = pos.clone().add(new THREE.Vector3(-18, 0, 18));
            barPos.y = getTerrainHeight(barPos.x, barPos.z);
            const barGroup = faction === 'china' ? createChinaBarracks() : faction === 'gla' ? createGLABarracks(false) : createUSABarracks();
            barGroup.position.copy(barPos);
            barGroup.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
            scene.add(barGroup);
            enemyStructures.push({
                type: 'barracks', faction: faction, position: barPos, mesh: barGroup,
                health: 1000, maxHealth: 1000, radius: 8, buildProgress: 100, isBuilding: false,
                netId: 'ES_' + (++netIdSequence), teamId: teamId, ownerId: ownerId, isAI: true, difficulty: difficulty
            });

            // Enemy Perimeter Defense
            const defPos = pos.clone().add(new THREE.Vector3(14, 0, 22));
            defPos.y = getTerrainHeight(defPos.x, defPos.z);
            let defGroup;
            if (faction === 'china') defGroup = createChinaGatlingCannon();
            else if (faction === 'gla') defGroup = createGLAStingerSite();
            else defGroup = createUSAPatriotBattery();
            defGroup.position.copy(defPos);
            defGroup.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
            scene.add(defGroup);
            enemyStructures.push({
                type: faction === 'china' ? 'gatlingCannon' : faction === 'gla' ? 'stingerSite' : 'patriot',
                faction: faction, position: defPos, mesh: defGroup,
                health: 900, maxHealth: 900, radius: 5.5, buildProgress: 100, isBuilding: false,
                netId: 'ES_' + (++netIdSequence), teamId: teamId, ownerId: ownerId, isAI: true, difficulty: difficulty
            });
            hasSpawnedInitialEnemyBase = true;
            isMatchActive = true;

            // Spawn Initial Guard units for AI
            const tankType = faction === 'china' ? 'battlemaster' : faction === 'gla' ? 'scorpion' : 'tank';
            for (let i = 0; i < 2; i++) {
                const uPos = pos.clone().add(new THREE.Vector3(10 + i * 5, 0, 10 + i * 4));
                const eu = spawnEnemyUnit(tankType, uPos);
                if (eu) { eu.teamId = teamId; eu.ownerId = ownerId; eu.isAI = true; eu.difficulty = difficulty; }
            }
        }

        function produceUnit(type) {
            const unitSpec = unitRoster[type];
            if (!unitSpec) return;

            // 1. Tech Prerequisite Validation
            const techReq = getUnitTechPrerequisite(type);
            if (techReq) {
                const hasTech = structures.some(s => s.type === techReq.building && !s.isBuilding && s.health > 0);
                if (!hasTech) {
                    showNotification(`Locked: Build a ${techReq.name} first!`, 'error');
                    return;
                }
            }

            // 2. Resource Validation
            if (playerResources < unitSpec.cost) {
                showNotification(`Insufficient funds! Need $${unitSpec.cost}.`, 'error');
                return;
            }

            // 3. Find facility
            const reqBldg = unitSpec.building;
            const actualBldg = reqBldg === 'commandCenter' ? 'center' : reqBldg;
            let facility = null;

            if (selectedStructure && (
                selectedStructure.type === actualBldg ||
                (type === 'truck' && ['supplyCenter', 'factory'].includes(selectedStructure.type)) ||
                (type === 'worker' && ['center', 'supplyStash'].includes(selectedStructure.type))
            )) {
                if (selectedStructure.isBuilding) {
                    showNotification(`Selected building is still under construction!`, 'error');
                    return;
                }
                facility = selectedStructure;
            } else {
                facility = structures.find(s => !s.isBuilding && s.health > 0 && (
                    s.type === actualBldg ||
                    (type === 'truck' && (s.type === 'supplyCenter' || s.type === 'factory')) ||
                    (type === 'worker' && (s.type === 'center' || s.type === 'supplyStash'))
                ));
            }

            if (!facility) {
                const nameMap = {
                    barracks: 'Barracks', factory: selectedFaction === 'gla' ? 'Arms Dealer' : 'War Factory',
                    airfield: 'Air Field', center: 'Command Center', supplyCenter: 'Supply Center', supplyStash: 'Supply Stash'
                };
                showNotification(`Build a ${nameMap[actualBldg] || actualBldg} first!`, 'error');
                return;
            }

            playerResources -= unitSpec.cost;
            document.getElementById('resource-display').innerText = `$${playerResources}`;

            const angle = units.length * 2.4;
            const spawnDist = facility.radius + 3.5;
            let spawnPos = facility.position.clone().add(new THREE.Vector3(Math.cos(angle) * spawnDist, 0, Math.sin(angle) * spawnDist));
            const isAircraft = ['raptor', 'stealthfighter', 'aurora', 'comanche', 'chinook'].includes(type);

            if (isAircraft && actualBldg === 'airfield') {
                // Airplane spawns LANDED on the airfield runway / tarmac!
                const groundY = getTerrainHeight(spawnPos.x, spawnPos.z);
                spawnPos.y = groundY + 0.35;
                const newU = spawnUnit(type, spawnPos);
                if (newU) {
                    newU.airState = 'landed';
                    newU.homeAirfield = facility;
                    newU.patrolCenter = facility.position.clone();
                    newU.circleAngle = Math.random() * Math.PI * 2;
                    newU.circleRadius = 15.0;
                    newU.mesh.position.y = groundY + 0.35;
                    newU.mesh.rotation.z = 0;
                }
                showNotification(`Assembled: ${unitSpec.name} (Ready on Airfield)`, 'success');
                updateSidebar();
                return;
            }

            spawnUnit(type, spawnPos);
            showNotification(`Training: ${unitSpec.name}`, 'success');
            updateSidebar();
        }

        function repairStructure(structure) {
            if (!structure || structure.health >= structure.maxHealth) {
                showNotification('Structure is at 100% integrity.', 'info');
                return;
            }
            const fee = Math.min(50, Math.ceil((structure.maxHealth - structure.health) * 0.1));
            if (playerResources < fee) {
                showNotification(`Insufficient funds to repair ($${fee} needed).`, 'error');
                return;
            }
            playerResources -= fee;
            structure.health = structure.maxHealth;
            document.getElementById('resource-display').innerText = `$${playerResources}`;
            showNotification(`Structure fully repaired.`, 'success');
            updateSidebar();
        }

        function sellStructure(structure) {
            if (!structure) return;
            const cost = getStructureCost(structure.type) || 500;
            const refund = Math.floor(cost * 0.5);
            playerResources += refund;
            document.getElementById('resource-display').innerText = `$${playerResources}`;

            scene.remove(structure.mesh);
            const idx = structures.indexOf(structure);
            if (idx !== -1) structures.splice(idx, 1);
            if (selectedStructure === structure) selectedStructure = null;

            showNotification(`Demolished ${structure.type}. +$${refund} refunded.`, 'info');
            updateSidebar();
        }

        function orderSelectedHarvestersToGather() {
            const harvesters = units.filter(u => u.selected && (u.type === 'truck' || u.type === 'worker'));
            if (harvesters.length === 0) {
                showNotification('Select a Supply Truck or Worker first.', 'info');
                return;
            }
            harvesters.forEach(h => {
                const target = findNearestSupplyPoint(h.mesh.position);
                if (target) {
                    h.supplyTarget = target;
                    h.aiState = 'MovingToDock';
                    h.taskState = 'Idle';
                    h.combatTarget = null;
                    h.targetPosition.copy(target.position);
                }
            });
            showNotification(`Harvester dispatched to nearest supply depot.`, 'success');
            updateSidebar();
        }

        function selectUnitsByType(category) {
            units.forEach(u => { u.selected = false; removeSelectionCircle(u); });
            selectedStructure = null;
            let count = 0;

            units.forEach(u => {
                let match = false;
                if (category === 'combat') {
                    match = !['dozer', 'worker', 'truck'].includes(u.type);
                } else if (category === 'harvesters') {
                    match = (u.type === 'truck' || u.type === 'worker');
                } else if (category === 'builders') {
                    match = (u.type === 'dozer' || u.type === 'worker');
                }
                if (match) {
                    u.selected = true;
                    addSelectionCircle(u);
                    count++;
                }
            });
            activeSidebarTab = 'production';
            showNotification(`Selected ${count} ${category} unit(s).`, 'info');
            updateSidebar();
        }

        // =========================================================================
        