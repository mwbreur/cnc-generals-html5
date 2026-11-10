// --- MAP EDITOR ENGINE ---
        let editorTheme = 'desert';
        let editorSize = 1500;
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
                const prevVal = sel.value;
                sel.innerHTML = `
                    <option value="tournament_desert" selected>Tournament Desert (Official EA Retail Map)</option>
                    <option value="desert">Desert Canyon (Middle East) - Dunes, mesas, oasis</option>
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
                if (prevVal && sel.querySelector(`option[value="${prevVal}"]`)) {
                    sel.value = prevVal;
                }
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

        function createSingleSupplyDock(pos, stock = 30000) {
            if (typeof spawnSingleSupplyDockAt === 'function') {
                return spawnSingleSupplyDockAt(pos, stock);
            }
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
                stock: stock,
                maxStock: stock,
                remaining: stock,
                maxSupplies: stock,
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
            const setup = (setupEl && setupEl.value) || 'dozer';
            const factionData = factionCatalog[faction] || factionCatalog['usa'];
            const builderType = factionData.builder || (faction === 'gla' ? 'worker' : 'dozer');
            let forces;
            if (setup === 'small') {
                const tankType = faction === 'usa' ? 'tank' : (faction === 'china' ? 'gatling' : 'technical');
                forces = [builderType, tankType];
            } else if (setup === 'large') {
                const tankType = faction === 'usa' ? 'tank' : (faction === 'china' ? 'gatling' : 'technical');
                forces = [builderType, builderType, tankType, tankType];
            } else {
                // Authentic Zero Hour: Exactly 1 Builder (Dozer for USA/China, Worker for GLA)
                forces = [builderType];
            }
            forces.forEach((type, index) => {
                const angle = index * 2.4;
                const at = position.clone().add(new THREE.Vector3(Math.cos(angle) * 14, 0, Math.sin(angle) * 14));
                at.y = getTerrainHeight(at.x, at.z);
                const u = spawnUnit(type, at);
                if (u) {
                    u.teamId = team;
                    u.ownerId = 'player';
                    u.isAI = false;
                    u.taskState = 'Idle';
                    u.faction = faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa');
                }
            });
            const builderName = (faction === 'gla' ? 'Worker' : 'Construction Dozer');
            showNotification(`Command Center operational. 1 ${builderName} deployed.`, 'success');
            updateSidebar();
        }

        function resetEntireBattlefieldState(mapSize = 1500) {
            // 1. Deselect everything and reset cursors & blueprint states
            if (typeof selectedStructure !== 'undefined') selectedStructure = null;
            if (typeof selectedSupplyPoint !== 'undefined') selectedSupplyPoint = null;
            if (typeof blueprintMesh !== 'undefined' && blueprintMesh) {
                if (typeof scene !== 'undefined') scene.remove(blueprintMesh);
                blueprintMesh = null;
                activeBlueprintType = null;
            }
            if (typeof isPlacingBlueprint !== 'undefined') isPlacingBlueprint = false;
            if (typeof pendingSuperweapon !== 'undefined') pendingSuperweapon = null;
            if (typeof activeGeneralPower !== 'undefined') activeGeneralPower = null;
            if (typeof isSellMode !== 'undefined') isSellMode = false;
            if (typeof isRepairMode !== 'undefined') isRepairMode = false;
            if (document.body) document.body.style.cursor = 'default';

            // 2. Clear previous battle structures
            if (typeof structures !== 'undefined') {
                structures.forEach(s => { if (s.mesh && typeof scene !== 'undefined') scene.remove(s.mesh); });
                structures.length = 0;
            }
            if (typeof enemyStructures !== 'undefined') {
                enemyStructures.forEach(es => { if (es.mesh && typeof scene !== 'undefined') scene.remove(es.mesh); });
                enemyStructures.length = 0;
            }
            if (typeof window.neutralStructures !== 'undefined' && window.neutralStructures) {
                window.neutralStructures.forEach(ns => { if (ns.mesh && typeof scene !== 'undefined') scene.remove(ns.mesh); });
                window.neutralStructures.length = 0;
            } else {
                window.neutralStructures = [];
            }

            // 3. Clear previous battle units
            if (typeof units !== 'undefined') {
                units.forEach(u => {
                    if (u.mesh && typeof scene !== 'undefined') scene.remove(u.mesh);
                    if (u.selectionCircle && typeof scene !== 'undefined') scene.remove(u.selectionCircle);
                });
                units.length = 0;
            }
            if (typeof enemyUnits !== 'undefined') {
                enemyUnits.forEach(eu => {
                    if (eu.mesh && typeof scene !== 'undefined') scene.remove(eu.mesh);
                    if (eu.selectionCircle && typeof scene !== 'undefined') scene.remove(eu.selectionCircle);
                });
                enemyUnits.length = 0;
            }

            // 4. Clear projectiles, explosions, debris
            if (typeof projectiles !== 'undefined') {
                projectiles.forEach(p => { if (p.mesh && typeof scene !== 'undefined') scene.remove(p.mesh); });
                projectiles.length = 0;
            }
            if (typeof debrisList !== 'undefined') {
                debrisList.forEach(d => { if (d.mesh && typeof scene !== 'undefined') scene.remove(d.mesh); });
                debrisList.length = 0;
            }

            // 5. Reset tech tree research, General powers, resources
            if (typeof researchedTechs !== 'undefined') researchedTechs.clear();
            if (typeof generalsPoints !== 'undefined') generalsPoints = 0;
            if (typeof currentGeneralRank !== 'undefined') currentGeneralRank = 1;
            if (typeof currentGeneralXP !== 'undefined') currentGeneralXP = 0;
            if (typeof unlockedGeneralsPowers !== 'undefined') unlockedGeneralsPowers.clear();

            // 6. Reset UI health bars
            if (typeof healthBarElements !== 'undefined' && healthBarElements) {
                healthBarElements.forEach(bar => { if (bar.container) bar.container.remove(); });
                healthBarElements.clear();
            }

            // 7. Reset Fog of War shroud to completely unrevealed
            if (typeof initFogOfWar === 'function') {
                initFogOfWar(mapSize);
            }
            if (typeof activeVisionBeacons !== 'undefined') {
                activeVisionBeacons.length = 0;
            }

            // 8. Reset AI commanders and timers
            if (typeof aiCommanders !== 'undefined') {
                for (const k in aiCommanders) delete aiCommanders[k];
            }
            if (typeof buildingTick !== 'undefined') buildingTick = 0;
            hasSpawnedInitialEnemyBase = false;

            // 9. Reset modals
            const vicModal = document.getElementById('victory-modal');
            if (vicModal) vicModal.style.display = 'none';
            const defModal = document.getElementById('defeat-modal');
            if (defModal) defModal.style.display = 'none';
            const hostModal = document.getElementById('host-disconnected-modal');
            if (hostModal) hostModal.style.display = 'none';
            if (typeof hasDeclaredVictory !== 'undefined') hasDeclaredVictory = false;

            if (typeof resumeGame === 'function') resumeGame();
        }
        window.resetEntireBattlefieldState = resetEntireBattlefieldState;

        function setupGameDeployment() {
            const selectedEnv = document.getElementById('map-environment').value;
            const selectedSize = Number(document.getElementById('map-size').value);
            const spawns = getSpawnPointsForMap(selectedSize, selectedEnv, activeCustomMap);

            // 1. Clear previous battle assets with full battlefield refresh
            resetEntireBattlefieldState(selectedSize);

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
                    cameraRadius = selectedSize >= 2200 ? 280 : selectedSize >= 1400 ? 220 : 160;
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

            // 2. Deploy Contested Neutral Map Tech Buildings (Derricks, Hospital, Refinery)
            spawnNeutralMapTechBuildings(selectedSize, selectedEnv);

            hasSpawnedInitialEnemyBase = true;
            isMatchActive = true;
            matchStartTime = Date.now();
            matchStartTime = Date.now();
            if (typeof initAICommanders === 'function') initAICommanders();
            updateSidebar();
            showNotification(`Tactical Theater Initialized: ${activeSlots.length} Commanders deployed. Good luck, General!`, 'success');
        }

        function spawnNeutralMapTechBuildings(selectedSize, selectedEnv) {
            if (!window.neutralStructures) window.neutralStructures = [];
            window.neutralStructures.forEach(ns => {
                if (ns.mesh && typeof scene !== 'undefined' && scene && scene.remove) scene.remove(ns.mesh);
            });
            window.neutralStructures = [];

            const contested = (selectedEnv === 'tournament_desert') ? [
                { type: 'techOilDerrick', name: 'Tech Oil Derrick', x: -360, z: 0, maxHealth: 1500 },
                { type: 'techOilDerrick', name: 'Tech Oil Derrick', x: 360, z: 0, maxHealth: 1500 },
                { type: 'techHospital', name: 'Tech Hospital', x: 0, z: 0, maxHealth: 1800 }
            ] : [
                { type: 'techOilDerrick', name: 'Tech Oil Derrick', x: -selectedSize * 0.22, z: selectedSize * 0.18, maxHealth: 1500 },
                { type: 'techOilDerrick', name: 'Tech Oil Derrick', x: selectedSize * 0.22, z: -selectedSize * 0.18, maxHealth: 1500 },
                { type: 'techHospital', name: 'Tech Hospital', x: selectedSize * 0.20, z: selectedSize * 0.20, maxHealth: 1800 },
                { type: 'techRefinery', name: 'Tech Oil Refinery', x: -selectedSize * 0.20, z: -selectedSize * 0.20, maxHealth: 2000 }
            ];

            contested.forEach(item => {
                const y = typeof getTerrainHeight === 'function' ? getTerrainHeight(item.x, item.z) : 0;
                const pos = new THREE.Vector3(item.x, y, item.z);
                let meshGroup;
                if (item.type === 'techOilDerrick' && typeof createTechOilDerrickMesh === 'function') meshGroup = createTechOilDerrickMesh();
                else if (item.type === 'techHospital' && typeof createTechHospitalMesh === 'function') meshGroup = createTechHospitalMesh();
                else if (item.type === 'techRefinery' && typeof createTechRefineryMesh === 'function') meshGroup = createTechRefineryMesh();

                if (meshGroup) {
                    meshGroup.position.copy(pos);
                    if (!meshGroup.userData || !meshGroup.userData.isW3D) {
                        meshGroup.scale.set(1.3, 1.3, 1.3);
                    }
                    meshGroup.traverse(c => {
                        if (c.isMesh) {
                            c.castShadow = true;
                            c.receiveShadow = true;
                        }
                    });

                    // Neutral faction flag pole
                    const flagGroup = new THREE.Group();
                    flagGroup.name = "neutralFlagGroup";
                    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.2, 8), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8 }));
                    pole.position.set(2.8, 2.1, 2.2);
                    flagGroup.add(pole);

                    const flagMat = new THREE.MeshStandardMaterial({ color: 0x95a5a6, roughness: 0.8, side: THREE.DoubleSide });
                    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), flagMat);
                    flag.name = "neutralFlagCloth";
                    flag.position.set(3.6, 3.6, 2.2);
                    flagGroup.add(flag);
                    meshGroup.add(flagGroup);

                    if (typeof scene !== 'undefined' && scene && scene.add) {
                        scene.add(meshGroup);
                    }

                    const nObj = {
                        type: item.type,
                        name: item.name,
                        isNeutral: true,
                        teamId: 0,
                        ownerId: 'neutral',
                        position: pos,
                        mesh: meshGroup,
                        health: item.maxHealth,
                        maxHealth: item.maxHealth,
                        radius: 7.5 * 1.3,
                        captureProgress: 0,
                        capturingUnit: null,
                        capturedByTeam: null,
                        netId: 'NS_' + (++netIdSequence)
                    };
                    window.neutralStructures.push(nObj);
                }
            });
        }

        function deployEnemyBase(pos, faction, ownerId = 'ai_1', teamId = 2, difficulty = 'medium') {
            // Authentic C&C Generals Skirmish Start: Enemy starts with 1 Command Center + 1 Construction Builder (Dozer / Worker)
            const ccType = 'center';
            const ccGroup = faction === 'china' ? createChinaCommandCenter() : faction === 'gla' ? createGLACommandCenter() : createUSACommandCenter();
            if (!ccGroup.userData || !ccGroup.userData.isW3D) ccGroup.scale.set(1.35, 1.35, 1.35);
            ccGroup.position.copy(pos);
            ccGroup.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
            scene.add(ccGroup);
            enemyStructures.push({
                type: ccType, faction: faction, position: pos.clone(), mesh: ccGroup,
                health: 2200, maxHealth: 2200, radius: 11 * 1.35, buildProgress: 100, isBuilding: false,
                netId: 'ES_' + (++netIdSequence), teamId: teamId, ownerId: ownerId, isAI: true, difficulty: difficulty
            });

            hasSpawnedInitialEnemyBase = true;
            isMatchActive = true;
            matchStartTime = Date.now();

            // Spawn AI Starting Construction Builder (Dozer for USA/China, Worker for GLA)
            const builderType = faction === 'gla' ? 'worker' : 'dozer';
            const startUnitsEl = document.getElementById('starting-units');
            const startMode = startUnitsEl ? startUnitsEl.value : 'standard';
            const numBuilders = startMode === 'heavy' ? 2 : 1;

            for (let b = 0; b < numBuilders; b++) {
                const bPos = pos.clone().add(new THREE.Vector3(14 + b * 5, 0, 12));
                bPos.y = getTerrainHeight(bPos.x, bPos.z);
                const builderUnit = spawnEnemyUnit(builderType, bPos, null, faction);
                if (builderUnit) {
                    builderUnit.teamId = teamId;
                    builderUnit.ownerId = ownerId;
                    builderUnit.isAI = true;
                    builderUnit.difficulty = difficulty;
                    builderUnit.aiState = 'Idle';
                    builderUnit.taskState = 'Idle';
                }
            }

            if (startMode === 'light' || startMode === 'heavy') {
                const tankType = faction === 'china' ? 'battlemaster' : faction === 'gla' ? 'scorpion' : 'crusader';
                const numTanks = startMode === 'heavy' ? 2 : 1;
                for (let i = 0; i < numTanks; i++) {
                    const uPos = pos.clone().add(new THREE.Vector3(10 + i * 5, 0, -14));
                    uPos.y = getTerrainHeight(uPos.x, uPos.z);
                    const eu = spawnEnemyUnit(tankType, uPos, null, faction);
                    if (eu) { eu.teamId = teamId; eu.ownerId = ownerId; eu.isAI = true; eu.difficulty = difficulty; }
                }
            }
        }

        function orderSelectedHarvestersToGather() {
            const harvesters = units.filter(u => u.selected && (u.type === 'truck' || u.type === 'worker' || u.type === 'chinook'));
            if (harvesters.length === 0) {
                showNotification('Select a Chinook, Supply Truck or Worker first.', 'info');
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
                    if (h.type === 'chinook') h.airState = 'flying';
                }
            });
            showNotification(`Harvester dispatched to nearest supply depot.`, 'success');
            updateSidebar();
        }

        function selectUnitsByType(category) {
            if (category === 'builders') {
                if (typeof cycleSelectBuilder === 'function') {
                    cycleSelectBuilder();
                    return;
                } else if (typeof window.cycleSelectBuilder === 'function') {
                    window.cycleSelectBuilder();
                    return;
                }
            }
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
            if (count > 0) {
                const first = units.find(u => u.selected);
                if (first && typeof playUnitVoice === 'function') playUnitVoice(first.type, 'select');
            }
            showNotification(`Selected ${count} ${category} unit(s).`, 'info');
            updateSidebar();
        }
        window.selectUnitsByType = selectUnitsByType;

        // =========================================================================
        