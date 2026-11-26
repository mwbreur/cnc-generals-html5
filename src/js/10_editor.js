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
let editorCurrentMapId = null;

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
        if (editorProps.length < 200) {
            editorProps.push({ x: worldX, z: worldZ, type: 'tree' });
        }
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
const VALID_CUSTOM_MAP_THEMES = new Set(['desert', 'jungle', 'snow', 'city', 'temperate', 'highland', 'island', 'random']);

function sanitizeCustomMapObject(raw, fallbackId = null) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const rawId = typeof raw.id === 'string' && /^custom_[A-Za-z0-9_-]{1,48}$/.test(raw.id)
        ? raw.id
        : (fallbackId && /^custom_[A-Za-z0-9_-]{1,48}$/.test(fallbackId) ? fallbackId : null);
    if (!rawId) return null;

    const name = (typeof raw.name === 'string' ? raw.name.trim() : '').slice(0, 64) || 'Custom Map';
    const theme = (typeof raw.theme === 'string' && VALID_CUSTOM_MAP_THEMES.has(raw.theme.toLowerCase()))
        ? raw.theme.toLowerCase()
        : null;
    if (!theme) return null;

    const size = Number(raw.size);
    if (!Number.isFinite(size) || size < 400 || size > 4000) return null;

    const waterLevel = raw.waterLevel === undefined ? 0 : Number(raw.waterLevel);
    if (!Number.isFinite(waterLevel) || waterLevel < -20 || waterLevel > 20) return null;

    if (!raw.heightGrid || typeof raw.heightGrid.length !== 'number' || raw.heightGrid.length !== 1024) return null;
    const heightGrid = new Array(1024);
    for (let i = 0; i < 1024; i++) {
        const h = Number(raw.heightGrid[i]);
        if (!Number.isFinite(h)) return null;
        heightGrid[i] = Math.max(-10, Math.min(20, h));
    }

    const halfSize = size * 0.55;
    const clampCoord = (v) => Math.max(-halfSize, Math.min(halfSize, v));
    const sanitizePoints = (arr, maxCount, mapper) => {
        if (arr === undefined || arr === null) return [];
        if (!Array.isArray(arr)) return null;
        const out = [];
        const lim = Math.min(arr.length, maxCount);
        for (let i = 0; i < lim; i++) {
            const item = arr[i];
            if (!item || typeof item !== 'object') continue;
            const x = Number(item.x), z = Number(item.z);
            if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
            out.push(mapper(item, clampCoord(x), clampCoord(z), i));
        }
        return out;
    };

    const bridges = sanitizePoints(raw.bridges, 16, (b, x, z) => ({
        x, z,
        width: Number.isFinite(Number(b.width)) ? Math.max(8, Math.min(60, Number(b.width))) : 22,
        length: Number.isFinite(Number(b.length)) ? Math.max(16, Math.min(180, Number(b.length))) : 65,
        angle: Number.isFinite(Number(b.angle)) ? Number(b.angle) : 0
    }));
    const supplies = sanitizePoints(raw.supplies, 32, (s, x, z) => ({
        x, z,
        amount: Number.isFinite(Number(s.amount)) ? Math.max(500, Math.min(100000, Number(s.amount))) : 8000
    }));
    const spawnPoints = sanitizePoints(raw.spawnPoints, 16, (sp, x, z, idx) => ({
        id: Number.isInteger(sp.id) && sp.id > 0 && sp.id <= 16 ? sp.id : (idx + 1),
        x, z
    }));
    const props = sanitizePoints(raw.props, 250, (p, x, z) => ({
        x, z,
        type: (typeof p.type === 'string' && /^[a-z0-9_-]{1,24}$/i.test(p.type)) ? p.type : 'tree'
    }));
    if (bridges === null || supplies === null || spawnPoints === null || props === null) return null;

    return {
        id: rawId,
        name,
        theme,
        size: Math.round(size),
        waterLevel,
        heightGrid,
        bridges,
        supplies,
        spawnPoints,
        props
    };
}

function initCustomMapsStorage() {
    try {
        const raw = localStorage.getItem('cnc_custom_maps');
        if (raw) {
            const parsed = JSON.parse(raw);
            const clean = {};
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                let dropped = 0;
                Object.keys(parsed).forEach(k => {
                    const valid = sanitizeCustomMapObject(parsed[k], k);
                    if (valid) clean[valid.id] = valid;
                    else dropped++;
                });
                if (dropped > 0) {
                    try { localStorage.setItem('cnc_custom_maps', JSON.stringify(clean)); } catch (_) {}
                }
            }
            savedCustomMaps = clean;
        }
    } catch (e) {
        console.warn('localStorage not accessible, using memory cache:', e);
        savedCustomMaps = {};
    }
}

function saveCustomMap() {
    const nameEl = document.getElementById('me-map-name');
    const name = ((nameEl && nameEl.value) || 'Custom Map').trim().slice(0, 64) || 'Custom Map';
    const id = editorCurrentMapId && savedCustomMaps[editorCurrentMapId]
    ? editorCurrentMapId
    : 'custom_' + Date.now();
    const waterEl = document.getElementById('me-water-level');
    const mapObj = {
        id: id,
        name: name,
        theme: editorTheme,
        size: editorSize,
        waterLevel: parseFloat((waterEl && waterEl.value) || 0),
        heightGrid: Array.from(editorHeightGrid),
        bridges: editorBridges.map(b => ({ ...b })),
        supplies: editorSupplies.map(s => ({ ...s })),
        spawnPoints: editorSpawns.map(sp => ({ ...sp })),
        props: editorProps.map(p => ({ ...p }))
    };

    savedCustomMaps[id] = mapObj;
    editorCurrentMapId = id;
    try {
        localStorage.setItem('cnc_custom_maps', JSON.stringify(savedCustomMaps));
    } catch (e) {}

    refreshMapDropdowns();
    loadSavedMapsList();
    showNotification(`Map "${name}" saved! Available in Theater of War.`, 'success');
    return id;
}

function refreshMapDropdowns() {
    const spSelect = document.getElementById('map-environment');
    const mpSelect = document.getElementById('mp-map-env');

    [spSelect, mpSelect].forEach(sel => {
            if (!sel) return;
            const prevVal = sel.value;
            sel.querySelectorAll('option').forEach(option => {
                    if (option.value.startsWith('custom_')) option.remove();
            });
            let customGroup = sel.querySelector('optgroup[data-custom-maps]');
            if (!customGroup) {
                customGroup = document.createElement('optgroup');
                customGroup.label = 'Saved Custom Maps';
                customGroup.dataset.customMaps = 'true';
                sel.appendChild(customGroup);
            }
            customGroup.replaceChildren();
            Object.values(savedCustomMaps).forEach(map => {
                    const opt = document.createElement('option');
                    opt.value = map.id;
                    opt.innerText = `🗺️ ${map.name} (${map.theme.toUpperCase()} ${map.size}x${map.size})`;
                    customGroup.appendChild(opt);
            });
            if (customGroup.children.length === 0) customGroup.remove();
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

    if (!listEl._boundCustomMapClick) {
        listEl._boundCustomMapClick = true;
        listEl.addEventListener('click', (ev) => {
            const btn = ev.target && ev.target.closest ? ev.target.closest('button[data-map-action]') : null;
            if (!btn) return;
            const mapId = btn.dataset.mapId;
            const action = btn.dataset.mapAction;
            if (!mapId || !savedCustomMaps[mapId]) return;
            if (action === 'edit') loadCustomMapIntoEditor(mapId);
            else if (action === 'single') openSavedCustomMapInMode(mapId, 'single');
            else if (action === 'multiplayer') openSavedCustomMapInMode(mapId, 'multiplayer');
            else if (action === 'delete') deleteCustomMap(mapId);
        });
    }

    let html = '';
    maps.forEach(m => {
            const safeId = escapeHtml(m.id);
            const safeName = escapeHtml(m.name);
            const safeTheme = escapeHtml(m.theme);
            const safeSize = escapeHtml(String(m.size));
            html += `<div class="saved-map-card">
                    <div>
                        <strong>${safeName}</strong>
                        <span style="color:#8f9e91; font-size:10px; margin-left:6px;">${safeTheme} (${safeSize}x${safeSize})</span>
                    </div>
                    <div style="display:flex; gap:4px;">
                        <button class="rts-btn" style="padding:2px 8px; font-size:10px;" data-map-action="edit" data-map-id="${safeId}">EDIT</button>
                        <button class="rts-btn" style="padding:2px 8px; font-size:10px;" data-map-action="single" data-map-id="${safeId}">SKIRMISH</button>
                        <button class="rts-btn" style="padding:2px 8px; font-size:10px;" data-map-action="multiplayer" data-map-id="${safeId}">MULTIPLAYER</button>
                        <button class="rts-btn" style="padding:2px 8px; font-size:10px; border-color:#ff4757; color:#ff4757;" data-map-action="delete" data-map-id="${safeId}">DEL</button>
                    </div>
                </div>`;
    });
    listEl.innerHTML = html;
}

function loadCustomMapIntoEditor(id) {
    const m = savedCustomMaps[id];
    if (!m) return;
    editorCurrentMapId = id;
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
    editorBridges = (m.bridges || []).map(b => ({ ...b }));
    editorSupplies = (m.supplies || []).map(s => ({ ...s }));
    editorSpawns = (m.spawnPoints && m.spawnPoints.length > 0)
        ? m.spawnPoints.map(sp => ({ ...sp }))
        : getSpawnPointsForMap(editorSize, editorTheme, null);
    editorProps = (m.props || []).map(p => ({ ...p }));

    renderEditorCanvas();
    showNotification(`Loaded custom map "${m.name}" into editor.`, 'info');
}

function deleteCustomMap(id) {
    delete savedCustomMaps[id];
    if (editorCurrentMapId === id) editorCurrentMapId = null;
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
        const parsed = JSON.parse(jsonText);
        const id = 'custom_' + Date.now();
        const validated = sanitizeCustomMapObject(parsed, id);
        if (!validated) {
            showNotification("Invalid map JSON: missing or out-of-range theme, size, or heightGrid (1024 finite values required).", "error");
            return;
        }
        validated.id = id;
        savedCustomMaps[id] = validated;
        try { localStorage.setItem('cnc_custom_maps', JSON.stringify(savedCustomMaps)); } catch (e) {}
        refreshMapDropdowns();
        loadSavedMapsList();
        loadCustomMapIntoEditor(id);
        showNotification(`Map "${validated.name}" imported successfully!`, 'success');
    } catch (e) {
        showNotification("Invalid map JSON format.", "error");
    }
}

function playCustomMapNow() {
    saveMapAndOpenMode('single');
}

function saveMapAndOpenMode(mode) {
    const id = saveCustomMap();
    if (id) openSavedCustomMapInMode(id, mode);
}

function openSavedCustomMapInMode(id, mode) {
    const map = savedCustomMaps[id];
    if (!map || !['single', 'multiplayer'].includes(mode)) return;
    showStartSetupCard();
    switchGameModeTab(mode);
    const select = document.getElementById(mode === 'single' ? 'map-environment' : 'mp-map-env');
    if (select) {
        select.value = id;
        onMapSelectionChange(mode);
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

    const speedVal = Number((document.getElementById('skirmish-game-speed') || {}).value) || 30;
    const limitSwEl = document.getElementById('limit-superweapons');
    if (typeof window !== 'undefined') {
        window.skirmishGameSpeed = speedVal;
        window.gameSpeedMultiplier = Math.max(0.5, Math.min(2.0, speedVal / 30));
        window.limitSuperweapons = Boolean(limitSwEl && limitSwEl.checked);
    }

    const playerSlot = (typeof spSlots !== 'undefined') && (spSlots.find(s => s.active && s.isPlayer) || spSlots[0]);
    const facPool = ['usa', 'china', 'gla'];
    const slotFac = (playerSlot && playerSlot.faction) || selectedFaction;
    const resolvedPlayerFaction = slotFac === 'random'
        ? facPool[Math.floor(Math.random() * facPool.length)]
        : slotFac;
    if (typeof window !== 'undefined') window._resolvedSkirmishPlayerFaction = resolvedPlayerFaction;
    selectedFaction = resolvedPlayerFaction;

    if (typeof preloadSkirmishAudio === 'function') preloadSkirmishAudio(resolvedPlayerFaction);

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
    // Ensure no existing map supply dock overlaps the Command Center footprint
    const minClearance = 44;
    if (typeof supplyPoints !== 'undefined') {
        for (let i = 0; i < supplyPoints.length; i++) {
            const sp = supplyPoints[i];
            if (!sp || !sp.position) continue;
            const dist = sp.position.distanceTo(basePos);
            if (dist < minClearance) {
                const pushAngle = dist > 0.5
                ? Math.atan2(sp.position.z - basePos.z, sp.position.x - basePos.x)
                : (Math.atan2(basePos.z, basePos.x) + Math.PI);
                const nx = basePos.x + Math.cos(pushAngle) * 52;
                const nz = basePos.z + Math.sin(pushAngle) * 52;
                const ny = getTerrainHeight(nx, nz);
                sp.position.set(nx, ny, nz);
                if (sp.mesh) sp.mesh.position.set(nx, ny, nz);
            }
        }
        // If the map already provides a supply dock within 95 units, no need to add a duplicate
        if (supplyPoints.some(sp => sp && sp.position && sp.position.distanceTo(basePos) < 95)) {
            return;
        }
    }

    const angle = Math.atan2(basePos.z, basePos.x) + Math.PI; // Offset toward map center with clear build space
    const sx = basePos.x + Math.cos(angle) * 52;
    const sz = basePos.z + Math.sin(angle) * 52;
    const sy = getTerrainHeight(sx, sz);
    const supplyV = new THREE.Vector3(sx, sy, sz);

    const tooClose = supplyPoints.some(sp => sp.position.distanceTo(supplyV) < 24);
    if (!tooClose) {
        createSingleSupplyDock(supplyV);
    }
}

function deployBase(position, faction = selectedFaction, team = playerTeamId) {
    let deployPos = position.clone();
    const mapLimit = currentMapSize * 0.48;
    const isSpotClear = (p) => (
        Math.abs(p.x) <= mapLimit &&
        Math.abs(p.z) <= mapLimit &&
        !structures.some(structure => structure.position.distanceTo(p) < structure.radius + 18) &&
        !(typeof enemyStructures !== 'undefined' && enemyStructures.some(es => es.position && es.position.distanceTo(p) < (es.radius || 10) + 18))
    );
    if (!isSpotClear(deployPos)) {
        let foundClear = null;
        for (let r = 28; r <= 140 && !foundClear; r += 22) {
            for (let a = 0; a < 12; a++) {
                const ang = (a / 12) * Math.PI * 2;
                const cand = new THREE.Vector3(deployPos.x + Math.cos(ang) * r, 0, deployPos.z + Math.sin(ang) * r);
                if (isSpotClear(cand)) { foundClear = cand; break; }
            }
        }
        if (!foundClear) return;
        deployPos = foundClear;
    }
    position = deployPos;
    choosingBaseLocation = false;
    const hint = document.getElementById('deployment-hint');
    if (hint) hint.style.display = 'none';
    cameraTarget.copy(position);
    updateCameraPosition();
    supplyCenterPos.copy(position);
    supplyCenterPos.y = getTerrainHeight(supplyCenterPos.x, supplyCenterPos.z);
    const faceCenterYaw = (Math.hypot(supplyCenterPos.x, supplyCenterPos.z) > 1)
        ? Math.atan2(-supplyCenterPos.x, -supplyCenterPos.z)
        : 0;
    const ccObj = buildStructureMesh('center', supplyCenterPos, true, faceCenterYaw);
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
    const fwdX = Math.sin(faceCenterYaw), fwdZ = Math.cos(faceCenterYaw);
    const rightX = Math.cos(faceCenterYaw), rightZ = -Math.sin(faceCenterYaw);
    forces.forEach((type, index) => {
            const rowDist = 22 + Math.floor(index / 2) * 5;
            const latSpread = index === 0 ? 0 : ((index % 2 === 1 ? -1 : 1) * (5.5 + Math.floor((index - 1) / 2) * 4));
            const at = position.clone().add(new THREE.Vector3(fwdX * rowDist + rightX * latSpread, 0, fwdZ * rowDist + rightZ * latSpread));
            at.y = getTerrainHeight(at.x, at.z);
            const u = spawnUnit(type, at);
            if (u) {
                u.teamId = team;
                u.ownerId = 'player';
                u.isAI = false;
                u.taskState = 'Idle';
                if (u.mesh) u.mesh.rotation.y = faceCenterYaw;
                if (u.targetPosition && u.mesh) u.targetPosition.copy(u.mesh.position);
                u.faction = faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa');
            }
    });
    const builderName = (faction === 'gla' ? 'Worker' : 'Construction Dozer');
    showNotification(`Command Center operational. 1 ${builderName} deployed.`, 'success');
    updateSidebar();
}

function disposeSceneNodeSafe(node) {
    if (!node) return;
    if (typeof scene !== 'undefined' && scene && typeof scene.remove === 'function') {
        scene.remove(node);
    }
    if (typeof node.traverse === 'function') {
        node.traverse(c => {
            if (c.geometry && (!c.geometry.userData || !c.geometry.userData._shared) && typeof c.geometry.dispose === 'function') {
                c.geometry.dispose();
            }
            if (c.material) {
                const mats = Array.isArray(c.material) ? c.material : [c.material];
                for (let mi = 0; mi < mats.length; mi++) {
                    const m = mats[mi];
                    if (m && (!m.userData || !m.userData._shared) && typeof m.dispose === 'function') {
                        m.dispose();
                    }
                }
            }
        });
    }
}

function resetEntireBattlefieldState(mapSize = 1500) {
    if (typeof cleanupShellMapDemo === 'function') cleanupShellMapDemo();
    // 1. Deselect everything and reset cursors & blueprint states
    if (typeof selectedStructure !== 'undefined') selectedStructure = null;
    if (typeof selectedSupplyPoint !== 'undefined') selectedSupplyPoint = null;
    if (typeof blueprintMesh !== 'undefined' && blueprintMesh) {
        disposeSceneNodeSafe(blueprintMesh);
        blueprintMesh = null;
        activeBlueprintType = null;
    }
    if (typeof isPlacingBlueprint !== 'undefined') isPlacingBlueprint = false;
    if (typeof pendingSuperweapon !== 'undefined') pendingSuperweapon = null;
    if (typeof activeGeneralPower !== 'undefined') activeGeneralPower = null;
    if (typeof isSellMode !== 'undefined') isSellMode = false;
    if (document.body) document.body.style.cursor = 'default';

    // 2. Clear previous battle structures
    if (typeof structures !== 'undefined') {
        structures.forEach(s => {
            if (s._progressBarEl && s._progressBarEl.parentElement) s._progressBarEl.parentElement.removeChild(s._progressBarEl);
            disposeSceneNodeSafe(s.mesh);
        });
        structures.length = 0;
    }
    if (typeof enemyStructures !== 'undefined') {
        enemyStructures.forEach(es => {
            if (es._progressBarEl && es._progressBarEl.parentElement) es._progressBarEl.parentElement.removeChild(es._progressBarEl);
            disposeSceneNodeSafe(es.mesh);
        });
        enemyStructures.length = 0;
    }
    if (typeof window.neutralStructures !== 'undefined' && window.neutralStructures) {
        window.neutralStructures.forEach(ns => { disposeSceneNodeSafe(ns.mesh); });
        window.neutralStructures.length = 0;
    } else {
        window.neutralStructures = [];
    }

    // 3. Clear previous battle units (including trajectoryLines, drones, and selection circles)
    if (typeof units !== 'undefined') {
        units.forEach(u => {
            if (u.drone && u.drone.mesh) disposeSceneNodeSafe(u.drone.mesh);
            if (u.trajectoryLine) disposeSceneNodeSafe(u.trajectoryLine);
            if (u.selectionCircle) disposeSceneNodeSafe(u.selectionCircle);
            disposeSceneNodeSafe(u.mesh);
        });
        units.length = 0;
    }
    if (typeof enemyUnits !== 'undefined') {
        enemyUnits.forEach(eu => {
            if (eu.drone && eu.drone.mesh) disposeSceneNodeSafe(eu.drone.mesh);
            if (eu.trajectoryLine) disposeSceneNodeSafe(eu.trajectoryLine);
            if (eu.selectionCircle) disposeSceneNodeSafe(eu.selectionCircle);
            disposeSceneNodeSafe(eu.mesh);
        });
        enemyUnits.length = 0;
    }

    // 4. Clear projectiles, explosions, debris, active FX, missiles, supply planes, scrap crates, landmines, and control groups
    if (typeof projectiles !== 'undefined') {
        projectiles.forEach(p => { disposeSceneNodeSafe(p.mesh); });
        projectiles.length = 0;
    }
    if (typeof debrisList !== 'undefined') {
        debrisList.forEach(d => { disposeSceneNodeSafe(d.mesh); });
        debrisList.length = 0;
    }
    if (typeof activeFX !== 'undefined' && Array.isArray(activeFX)) {
        activeFX.forEach(fx => {
            if (!fx) return;
            if (typeof fx.dispose === 'function') {
                try { fx.dispose(); } catch (_) {}
            }
            if (fx.mesh) disposeSceneNodeSafe(fx.mesh);
            if (fx.group) disposeSceneNodeSafe(fx.group);
        });
        activeFX.length = 0;
    if (typeof clearVehicleTrackMarks === 'function') clearVehicleTrackMarks();
    }
    if (typeof activeMissiles !== 'undefined' && Array.isArray(activeMissiles)) {
        activeMissiles.forEach(m => { if (m && m.mesh) disposeSceneNodeSafe(m.mesh); });
        activeMissiles.length = 0;
    }
    if (typeof activeScrapCrates !== 'undefined' && Array.isArray(activeScrapCrates)) {
        activeScrapCrates.forEach(c => { if (c && c.mesh) disposeSceneNodeSafe(c.mesh); });
        activeScrapCrates.length = 0;
    }
    if (typeof landmines !== 'undefined' && Array.isArray(landmines)) {
        landmines.forEach(m => { if (m && m.mesh) disposeSceneNodeSafe(m.mesh); });
        landmines.length = 0;
    }
    if (typeof topplingTrees !== 'undefined' && Array.isArray(topplingTrees)) {
        topplingTrees.forEach(t => {
            if (t && t.mesh) {
                if (t.mesh.parent) t.mesh.parent.remove(t.mesh);
                disposeSceneNodeSafe(t.mesh);
            }
        });
        topplingTrees.length = 0;
    }
    if (typeof window !== 'undefined') {
        if (Array.isArray(window.activeSupplyPlanes)) {
            window.activeSupplyPlanes.forEach(p => { if (p && p.mesh) disposeSceneNodeSafe(p.mesh); });
            window.activeSupplyPlanes.length = 0;
        }
        window.activeParticleCannonTarget = null;
        window.activeParticleCannonPlayerOwned = false;
        window.activeParticleCannonControl = false;
        window._minimapTerrainBg = null;
        window._minimapTerrainKey = '';
    }
    if (typeof markPathfindGridDirty === 'function') markPathfindGridDirty();
    if (typeof _pathfindGridState !== 'undefined' && _pathfindGridState) {
        _pathfindGridState._baseCells = null;
        _pathfindGridState._baseKey = '';
    }
    if (typeof controlGroups !== 'undefined' && controlGroups) {
        for (let g = 1; g <= 9; g++) controlGroups[g] = [];
    }
    if (typeof attackMoveMode !== 'undefined') attackMoveMode = false;
    if (typeof guardModeActive !== 'undefined') guardModeActive = false;

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
    if (typeof resetGeneralsPowersState === 'function') resetGeneralsPowersState();
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

    // Find player slot & resolve Random / Team None (Free-for-All)
    const playerSlot = spSlots.find(s => s.active && s.isPlayer) || spSlots[0];
    const facList = ['usa', 'china', 'gla'];
    let resolvedPlayerFaction = playerSlot.faction;
    if (resolvedPlayerFaction === 'random') {
        const preResolved = (typeof window !== 'undefined') ? window._resolvedSkirmishPlayerFaction : null;
        resolvedPlayerFaction = (preResolved && facList.includes(preResolved))
            ? preResolved
            : facList[Math.floor(Math.random() * facList.length)];
    }
    if (typeof window !== 'undefined') window._resolvedSkirmishPlayerFaction = null;
    selectedFaction = resolvedPlayerFaction;
    refreshFactionRoster();
    playerTeamId = (playerSlot.team && playerSlot.team > 0) ? playerSlot.team : (100 + playerSlot.id);
    if (typeof getPlayerColorHex === 'function' && typeof applyPlayerColorToMaterials === 'function') {
        window.selectedPlayerColor = playerSlot.color || 'blue';
        applyPlayerColorToMaterials(getPlayerColorHex(window.selectedPlayerColor));
    }

    // Deploy all active slots
    const activeSlots = spSlots.filter(s => s.active);

    activeSlots.forEach(slot => {
            const spObj = spawns.find(p => p.id === slot.spawnId) || spawns[0];
            const spawnPos = new THREE.Vector3(spObj.x, getTerrainHeight(spObj.x, spObj.z), spObj.z);
            const effectiveTeam = (slot.team && slot.team > 0) ? slot.team : (100 + slot.id);

            // Ensure every base has convenient resources nearby
            spawnSupplyCacheNearBase(spawnPos);

            if (slot.isPlayer) {
                // Deploy Player base & orient camera behind spawn looking straight toward the center of the map
                deployBase(spawnPos, resolvedPlayerFaction, effectiveTeam);
                cameraRadius = selectedSize >= 2200 ? 280 : selectedSize >= 1400 ? 220 : 160;
                cameraTarget.copy(spawnPos);
                if (typeof cameraAlpha !== 'undefined' && Math.hypot(spawnPos.x, spawnPos.z) > 1) {
                    cameraAlpha = Math.atan2(spawnPos.x, spawnPos.z);
                }
                updateCameraPosition();
            } else {
                // Deploy AI Opponent / Ally base
                let fac = slot.faction;
                if (fac === 'random') {
                    fac = facList[Math.floor(Math.random() * facList.length)];
                }
                deployEnemyBase(spawnPos, fac, 'ai_' + slot.id, effectiveTeam, slot.difficulty, slot.color);
            }
    });

    // 2. Deploy Contested Neutral Map Tech Buildings (Derricks, Hospital, Refinery)
    spawnNeutralMapTechBuildings(selectedSize, selectedEnv);

    hasSpawnedInitialEnemyBase = true;
    isMatchActive = true;
    if (typeof document !== 'undefined' && document.body) document.body.classList.remove('in-main-menu');
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

    const officialMap = window.OFFICIAL_SKIRMISH_MAPS && window.OFFICIAL_SKIRMISH_MAPS[selectedEnv];
    let contested = [];
    if (officialMap) {
        (officialMap.derricks || []).forEach(d => contested.push({ type: 'techOilDerrick', name: 'Tech Oil Derrick', x: d.nx * selectedSize, z: d.nz * selectedSize, maxHealth: 1500 }));
        (officialMap.hospitals || []).forEach(h => contested.push({ type: 'techHospital', name: 'Tech Hospital', x: h.nx * selectedSize, z: h.nz * selectedSize, maxHealth: 1800 }));
        (officialMap.refineries || []).forEach(r => contested.push({ type: 'techRefinery', name: 'Tech Oil Refinery', x: r.nx * selectedSize, z: r.nz * selectedSize, maxHealth: 2000 }));
    } else {
        contested = [
            { type: 'techOilDerrick', name: 'Tech Oil Derrick', x: -selectedSize * 0.22, z: selectedSize * 0.18, maxHealth: 1500 },
            { type: 'techOilDerrick', name: 'Tech Oil Derrick', x: selectedSize * 0.22, z: -selectedSize * 0.18, maxHealth: 1500 },
            { type: 'techHospital', name: 'Tech Hospital', x: selectedSize * 0.20, z: selectedSize * 0.20, maxHealth: 1800 },
            { type: 'techRefinery', name: 'Tech Oil Refinery', x: -selectedSize * 0.20, z: -selectedSize * 0.20, maxHealth: 2000 }
        ];
    }

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

                const flagWindPivot = new THREE.Group();
                flagWindPivot.name = "flagWindPivot";
                flagWindPivot.userData.isWindFlag = true;
                flagWindPivot.position.set(2.8, 3.6, 2.2);

                const flagMat = new THREE.MeshStandardMaterial({ color: 0x95a5a6, roughness: 0.8, side: THREE.DoubleSide });
                const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), flagMat);
                flag.name = "neutralFlagCloth";
                flag.rotation.y = Math.PI / 2;
                flag.position.set(0, 0, 0.8);
                flagWindPivot.add(flag);
                flagGroup.add(flagWindPivot);
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

function deployEnemyBase(pos, faction, ownerId = 'ai_1', teamId = 2, difficulty = 'medium', colorKey = 'red') {
    // Authentic C&C Generals Skirmish Start: Enemy starts with 1 Command Center + 1 Construction Builder (Dozer / Worker)
    const enemyHex = (typeof getPlayerColorHex === 'function') ? getPlayerColorHex(colorKey) : 0xdc2626;
    if (typeof window !== 'undefined') {
        window.activeEnemyColorHex = enemyHex;
        window.aiColorMap = window.aiColorMap || {};
        window.aiColorMap[ownerId] = enemyHex;
    }
    const ccType = 'center';
    const faceCenterYaw = (Math.hypot(pos.x, pos.z) > 1) ? Math.atan2(-pos.x, -pos.z) : 0;
    const ccGroup = faction === 'china' ? createChinaCommandCenter(true) : faction === 'gla' ? createGLACommandCenter(true) : createUSACommandCenter(true);
    if (!ccGroup.userData || !ccGroup.userData.isW3D) ccGroup.scale.set(1.35, 1.35, 1.35);
    ccGroup.position.copy(pos);
    ccGroup.rotation.y = faceCenterYaw;
    ccGroup.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    scene.add(ccGroup);
    const ccMaxHp = (typeof getStructureMaxHealth === 'function') ? getStructureMaxHealth('commandCenter') : 5000;
    enemyStructures.push({
            type: ccType, faction: faction, position: pos.clone(), mesh: ccGroup, rotationY: faceCenterYaw,
            health: ccMaxHp, maxHealth: ccMaxHp, radius: 11 * 1.35, buildProgress: 100, isBuilding: false,
            netId: 'ES_' + (++netIdSequence), teamId: teamId, ownerId: ownerId, isAI: true, difficulty: difficulty
    });

    hasSpawnedInitialEnemyBase = true;
    isMatchActive = true;
    if (!matchStartTime) matchStartTime = Date.now();

    // Spawn AI Starting Construction Builder (Dozer for USA/China, Worker for GLA)
    const builderType = faction === 'gla' ? 'worker' : 'dozer';
    const startUnitsEl = document.getElementById('starting-units');
    const startMode = startUnitsEl ? startUnitsEl.value : 'dozer';
    const isLargeStart = (startMode === 'large' || startMode === 'heavy');
    const isSmallStart = (startMode === 'small' || startMode === 'light');
    const numBuilders = isLargeStart ? 2 : 1;
    const fwdX = Math.sin(faceCenterYaw), fwdZ = Math.cos(faceCenterYaw);
    const rightX = Math.cos(faceCenterYaw), rightZ = -Math.sin(faceCenterYaw);

    for (let b = 0; b < numBuilders; b++) {
        const lat = (b - (numBuilders - 1) * 0.5) * 6;
        const bPos = pos.clone().add(new THREE.Vector3(fwdX * 20 + rightX * lat, 0, fwdZ * 20 + rightZ * lat));
        bPos.y = getTerrainHeight(bPos.x, bPos.z);
        const builderUnit = spawnEnemyUnit(builderType, bPos, null, faction);
        if (builderUnit) {
            builderUnit.teamId = teamId;
            builderUnit.ownerId = ownerId;
            builderUnit.isAI = true;
            builderUnit.difficulty = difficulty;
            builderUnit.aiState = 'Idle';
            builderUnit.taskState = 'Idle';
            if (builderUnit.mesh) builderUnit.mesh.rotation.y = faceCenterYaw;
            if (builderUnit.targetPosition && builderUnit.mesh) builderUnit.targetPosition.copy(builderUnit.mesh.position);
        }
    }

    if (isSmallStart || isLargeStart) {
        const tankType = faction === 'china' ? 'battlemaster' : faction === 'gla' ? 'scorpion' : 'crusader';
        const numTanks = isLargeStart ? 2 : 1;
        for (let i = 0; i < numTanks; i++) {
            const lat = (i - (numTanks - 1) * 0.5) * 7;
            const uPos = pos.clone().add(new THREE.Vector3(fwdX * 26 + rightX * lat, 0, fwdZ * 26 + rightZ * lat));
            uPos.y = getTerrainHeight(uPos.x, uPos.z);
            const eu = spawnEnemyUnit(tankType, uPos, null, faction);
            if (eu) {
                eu.teamId = teamId; eu.ownerId = ownerId; eu.isAI = true; eu.difficulty = difficulty;
                if (eu.mesh) eu.mesh.rotation.y = faceCenterYaw;
                if (eu.targetPosition && eu.mesh) eu.targetPosition.copy(eu.mesh.position);
            }
        }
    }
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
                match = !['dozer', 'worker', 'truck', 'chinook'].includes(u.type);
            } else if (category === 'harvesters') {
                match = (u.type === 'truck' || u.type === 'worker' || u.type === 'chinook');
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
        if (first && typeof playUnitVoice === 'function') playUnitVoice(first.type, 'select', first.faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa'));
    }
    showNotification(`Selected ${count} ${category} unit(s).`, 'info');
    updateSidebar();
}
window.selectUnitsByType = selectUnitsByType;

// =========================================================================
// BROWSER EA SAGE .MAP IMPORTER (Uncompressed CkMp & EAR RefPack .map files)
// =========================================================================
const IMPORTED_SAGE_MAPS_KEY = 'cnc_imported_sage_maps_v1';

function _decompressSageRefPack(bytes, startOffset) {
    let pos = startOffset;
    const magic = (bytes[pos] << 8) | bytes[pos + 1];
    pos += 2;
    let decompSize = 0;
    if (magic & 0x8000) {
        if (magic & 0x0100) pos += 4;
        decompSize = ((bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]) >>> 0;
        pos += 4;
    } else {
        if (magic & 0x0100) pos += 3;
        decompSize = (bytes[pos] << 16) | (bytes[pos + 1] << 8) | bytes[pos + 2];
        pos += 3;
    }
    if (decompSize <= 0 || decompSize > 64 * 1024 * 1024) {
        throw new Error('Unsupported .map decompressed size: ' + decompSize);
    }
    const out = new Uint8Array(decompSize);
    let outPos = 0;
    while (pos < bytes.length && outPos < decompSize) {
        const b0 = bytes[pos++];
        if (b0 >= 0xFC) {
            const litCount = b0 & 0x03;
            for (let i = 0; i < litCount && pos < bytes.length && outPos < decompSize; i++) out[outPos++] = bytes[pos++];
            if (b0 === 0xFC) break;
        } else if (b0 >= 0xE0) {
            const litCount = (b0 - 0xDF) << 2;
            for (let i = 0; i < litCount && pos < bytes.length && outPos < decompSize; i++) out[outPos++] = bytes[pos++];
        } else if (b0 >= 0xC0) {
            const b1 = bytes[pos++], b2 = bytes[pos++], b3 = bytes[pos++];
            const litCount = b0 & 0x03;
            for (let i = 0; i < litCount && pos < bytes.length && outPos < decompSize; i++) out[outPos++] = bytes[pos++];
            const copyCount = ((b0 & 0x0C) << 6) + b3 + 5;
            const copyOffset = ((b0 & 0x10) << 12) + (b1 << 8) + b2 + 1;
            let src = outPos - copyOffset;
            for (let i = 0; i < copyCount && outPos < decompSize; i++) out[outPos++] = out[src++];
        } else if (b0 >= 0x80) {
            const b1 = bytes[pos++], b2 = bytes[pos++];
            const litCount = (b1 >> 6) & 0x03;
            for (let i = 0; i < litCount && pos < bytes.length && outPos < decompSize; i++) out[outPos++] = bytes[pos++];
            const copyCount = (b0 & 0x3F) + 4;
            const copyOffset = ((b1 & 0x3F) << 8) + b2 + 1;
            let src = outPos - copyOffset;
            for (let i = 0; i < copyCount && outPos < decompSize; i++) out[outPos++] = out[src++];
        } else {
            const b1 = bytes[pos++];
            const litCount = b0 & 0x03;
            for (let i = 0; i < litCount && pos < bytes.length && outPos < decompSize; i++) out[outPos++] = bytes[pos++];
            const copyCount = ((b0 >> 2) & 0x07) + 3;
            const copyOffset = ((b0 & 0x60) << 3) + b1 + 1;
            let src = outPos - copyOffset;
            for (let i = 0; i < copyCount && outPos < decompSize; i++) out[outPos++] = out[src++];
        }
    }
    return out;
}

function parseSageMapBuffer(arrayBuffer, fileName = 'Imported Map') {
    const raw = new Uint8Array(arrayBuffer);
    const readAscii = (u8, off, len) => {
        let s = '';
        for (let i = 0; i < len && off + i < u8.length; i++) s += String.fromCharCode(u8[off + i]);
        return s;
    };
    const isEar = raw.length >= 12 && readAscii(raw, 0, 4) === 'EAR\0';
    const decomp = isEar ? _decompressSageRefPack(raw, 8) : raw;
    if (decomp.length < 16 || readAscii(decomp, 0, 4) !== 'CkMp') {
        throw new Error('Not a valid C&C Generals / Zero Hour .map file (missing CkMp header).');
    }
    const dv = new DataView(decomp.buffer, decomp.byteOffset, decomp.byteLength);
    const numStrings = dv.getUint32(4, true);
    let pos = 8;
    const dict = {};
    let snowHits = 0, greenHits = 0, desertHits = 0;
    for (let i = 0; i < numStrings && pos < decomp.length; i++) {
        const len = decomp[pos++];
        const str = readAscii(decomp, pos, len);
        pos += len;
        const id = dv.getUint32(pos, true);
        pos += 4;
        dict[id] = str;
        if (/snow|ice|arctic|alpine|glacier/i.test(str)) snowHits++;
        else if (/grass|forest|pasture|pine|temperate/i.test(str)) greenHits++;
        else if (/sand|desert|dune|arid/i.test(str)) desertHits++;
    }

    let hmChunkPos = -1, hmChunkVer = 4, objListPos = -1, objListEnd = -1;
    let scanPos = pos;
    while (scanPos + 10 <= decomp.length) {
        const cid = dv.getUint32(scanPos, true);
        const cver = dv.getUint16(scanPos + 4, true);
        const csz = dv.getUint32(scanPos + 6, true);
        const cname = dict[cid] || '';
        const dataStart = scanPos + 10;
        if (cname === 'HeightMapData') { hmChunkPos = dataStart; hmChunkVer = cver; }
        else if (cname === 'ObjectsList') { objListPos = dataStart; objListEnd = dataStart + csz; }
        if (csz <= 0 || dataStart + csz > decomp.length) break;
        scanPos = dataStart + csz;
    }
    if (hmChunkPos < 0) throw new Error('Map is missing HeightMapData chunk.');

    const W = dv.getInt32(hmChunkPos, true);
    const H = dv.getInt32(hmChunkPos + 4, true);
    let border = 0;
    let hmDataStart = hmChunkPos + 12;
    if (hmChunkVer >= 4) {
        border = Math.max(0, dv.getInt32(hmChunkPos + 8, true));
        const numBoundaries = Math.max(0, dv.getInt32(hmChunkPos + 12, true));
        hmDataStart = hmChunkPos + 20 + numBoundaries * 8;
        // Fallback if a v3-layout chunk had a higher version header
        if (hmDataStart + W * H > decomp.length && hmChunkPos + 16 + W * H <= decomp.length) {
            hmDataStart = hmChunkPos + 16;
        }
    } else if (hmChunkVer === 3) {
        border = Math.max(0, dv.getInt32(hmChunkPos + 8, true));
        hmDataStart = hmChunkPos + 16;
    }
    if (W <= 0 || H <= 0 || hmDataStart + W * H > decomp.length) {
        throw new Error(`Invalid HeightMapData dimensions (${W}x${H}, v${hmChunkVer}).`);
    }
    const playW = Math.max(1, W - 2 * border);
    const playH = Math.max(1, H - 2 * border);
    // Derive recommended battlefield size from real SAGE playable span (1 cell = 10 SAGE units * 0.216 = 2.16 world units)
    const playSpan = Math.max(playW, playH);
    const sageWorldSpan = playSpan * 2.16;
    const dimRecSize = sageWorldSpan <= 750 ? 600 : (sageWorldSpan <= 1050 ? 900 : (sageWorldSpan <= 1400 ? 1200 : 1600));
    // Exact proportional SAGE vertical scale: 1 height byte = 0.625 SAGE units across playSpan*10 horizontal SAGE units
    const heightPerByte = Math.max(0.04, Math.min(0.28, (0.625 / (playSpan * 10)) * dimRecSize));

    const sampleVals = [];
    for (let y = border; y < H - border; y += 3) {
        for (let x = border; x < W - border; x += 3) {
            sampleVals.push(decomp[hmDataStart + y * W + x]);
        }
    }
    sampleVals.sort((a, b) => a - b);
    // Use true playable median (50th percentile) so ocean/canyon maps don't bias baseline down and clip plateaus
    const baseByte = sampleVals[Math.floor(sampleVals.length * 0.50)] || 64;

    // Bilinear-sampled heightmap preserving exact SAGE slope proportions (no staircase jaggedness or plateau clipping)
    const GRID = 97;
    const grid = [];
    for (let r = 0; r < GRID; r++) {
        const row = [];
        const fy = border + (1 - r / (GRID - 1)) * (playH - 1);
        const y0 = Math.min(H - 1, Math.max(0, Math.floor(fy)));
        const y1 = Math.min(H - 1, y0 + 1);
        const ty = fy - y0;
        for (let c = 0; c < GRID; c++) {
            const fx = border + (c / (GRID - 1)) * (playW - 1);
            const x0 = Math.min(W - 1, Math.max(0, Math.floor(fx)));
            const x1 = Math.min(W - 1, x0 + 1);
            const tx = fx - x0;
            const b00 = decomp[hmDataStart + y0 * W + x0];
            const b10 = decomp[hmDataStart + y0 * W + x1];
            const b01 = decomp[hmDataStart + y1 * W + x0];
            const b11 = decomp[hmDataStart + y1 * W + x1];
            const val = (b00 * (1 - tx) + b10 * tx) * (1 - ty) + (b01 * (1 - tx) + b11 * tx) * ty;
            const hVal = Math.max(-14.0, Math.min(48.0, (val - baseByte) * heightPerByte));
            row.push(Math.round(hVal * 100) / 100);
        }
        grid.push(row);
    }

    const hAtNorm = (nxVal, nzVal) => {
        const col = Math.max(0, Math.min(GRID - 1, Math.round((nxVal + 0.5) * (GRID - 1))));
        const row = Math.max(0, Math.min(GRID - 1, Math.round((nzVal + 0.5) * (GRID - 1))));
        return grid[row][col];
    };

    const rawSpawns = [], rawSupplies = [], rawDerricks = [], rawHospitals = [], rawRefineries = [];
    const rawBridges = [], rawBuildings = [], rawRoads = [], rawProps = [];
    let pendingRoadPt1 = null, pendingBridgePt1 = null;
    let p = objListPos;
    while (p > 0 && p + 10 <= objListEnd) {
        const cid = dv.getUint32(p, true);
        const csz = dv.getUint32(p + 6, true);
        const dStart = p + 10;
        if (dict[cid] === 'Object' && dStart + csz <= objListEnd) {
            let op = dStart;
            const x = dv.getFloat32(op, true);
            const y = dv.getFloat32(op + 4, true);
            op += 12;
            const angle = dv.getFloat32(op, true);
            const flags = dv.getInt32(op + 4, true);
            const tLen = dv.getUint16(op + 8, true);
            op += 10;
            const templateName = readAscii(decomp, op, tLen);
            op += tLen;
            let waypointName = '';
            if (op + 2 <= dStart + csz) {
                const numProps = dv.getUint16(op, true);
                op += 2;
                for (let k = 0; k < numProps && op + 4 <= dStart + csz; k++) {
                    const keyAndType = dv.getUint32(op, true);
                    const pType = keyAndType & 0xff;
                    const pKey = dict[keyAndType >>> 8] || '';
                    op += 4;
                    if (pType === 0) op += 1;
                    else if (pType === 1 || pType === 2) op += 4;
                    else if (pType === 3) {
                        if (op + 2 > dStart + csz) break;
                        const sLen = dv.getUint16(op, true); op += 2;
                        const sVal = readAscii(decomp, op, sLen); op += sLen;
                        if (pKey === 'waypointName') waypointName = sVal;
                    } else if (pType === 4) {
                        if (op + 2 > dStart + csz) break;
                        const uLen = dv.getUint16(op, true); op += 2 + uLen * 2;
                    } else break;
                }
            }
            const rawNx = (x / (playW * 10)) - 0.5;
            const rawNz = 0.5 - (y / (playH * 10));
            const nx = Math.max(-0.42, Math.min(0.42, rawNx));
            const nz = Math.max(-0.42, Math.min(0.42, rawNz));
            if (flags & 0x02) {
                pendingRoadPt1 = { nx: rawNx, nz: rawNz };
            } else if ((flags & 0x04) && pendingRoadPt1) {
                if (rawRoads.length < 220) {
                    rawRoads.push([
                        Math.round(pendingRoadPt1.nx * 1000) / 1000,
                        Math.round(pendingRoadPt1.nz * 1000) / 1000,
                        Math.round(rawNx * 1000) / 1000,
                        Math.round(rawNz * 1000) / 1000
                    ]);
                }
                pendingRoadPt1 = null;
            }
            const mStart = /^Player_(\d)_Start$/i.exec(waypointName);
            if (mStart) {
                rawSpawns.push({ id: parseInt(mStart[1], 10), nx: Math.round(nx * 1000) / 1000, nz: Math.round(nz * 1000) / 1000 });
            } else if (/SupplyDock|SupplyWarehouse|SupplyPile/i.test(templateName)) {
                if (!rawSupplies.some(s => Math.hypot(s.nx - nx, s.nz - nz) < 0.04)) {
                    rawSupplies.push({ nx: Math.round(nx * 1000) / 1000, nz: Math.round(nz * 1000) / 1000, amount: 30000 });
                }
            } else if (/TechOilDerrick/i.test(templateName)) {
                rawDerricks.push({ nx: Math.round(nx * 1000) / 1000, nz: Math.round(nz * 1000) / 1000 });
            } else if (/TechHospital/i.test(templateName)) {
                rawHospitals.push({ nx: Math.round(nx * 1000) / 1000, nz: Math.round(nz * 1000) / 1000 });
            } else if (/TechOilRefinery/i.test(templateName)) {
                rawRefineries.push({ nx: Math.round(nx * 1000) / 1000, nz: Math.round(nz * 1000) / 1000 });
            } else if (/CivilianBunker/i.test(templateName)) {
                rawBuildings.push([Math.round(nx * 1000) / 1000, Math.round(nz * 1000) / 1000, Math.round(angle * 100) / 100, 'bunker']);
            } else if (/Bridge/i.test(templateName)) {
                if ((flags & 0x30) === 0x10) {
                    pendingBridgePt1 = { nx: rawNx, nz: rawNz, tName: templateName };
                } else if ((flags & 0x30) === 0x20 && pendingBridgePt1) {
                    const midNx = (pendingBridgePt1.nx + rawNx) * 0.5;
                    const midNz = (pendingBridgePt1.nz + rawNz) * 0.5;
                    const dNx = rawNx - pendingBridgePt1.nx, dNz = rawNz - pendingBridgePt1.nz;
                    const deckH = Math.max(hAtNorm(pendingBridgePt1.nx, pendingBridgePt1.nz), hAtNorm(rawNx, rawNz));
                    if (!rawBridges.some(b => Math.hypot(b.nx - midNx, b.nz - midNz) < 0.03)) {
                        rawBridges.push({
                            nx: Math.round(midNx * 10000) / 10000,
                            nz: Math.round(midNz * 10000) / 10000,
                            angle: Math.round(Math.atan2(dNx, dNz) * 1000) / 1000,
                            span: Math.round((Math.hypot(dNx, dNz) + 0.022) * 10000) / 10000,
                            deckH: Math.round(deckH * 100) / 100,
                            width: /wide/i.test(pendingBridgePt1.tName || templateName) ? 24 : 20
                        });
                    }
                    pendingBridgePt1 = null;
                }
            } else if (rawProps.length < 180 && /Tree|Palm|Bush|Rock|Boulder/i.test(templateName)) {
                const pKind = /Palm/i.test(templateName) ? 'palm' : (/Rock|Boulder/i.test(templateName) ? 'rock' : (/Bush/i.test(templateName) ? 'bush' : 'tree'));
                rawProps.push([Math.round(nx * 1000) / 1000, Math.round(nz * 1000) / 1000, pKind]);
            }
        }
        if (csz <= 0 || dStart + csz > objListEnd) break;
        p = dStart + csz;
    }

    rawSpawns.sort((a, b) => a.id - b.id);
    if (rawSpawns.length < 2) {
        rawSpawns.push({ id: 1, nx: -0.34, nz: -0.34 }, { id: 2, nx: 0.34, nz: 0.34 });
    }
    const cleanName = String(fileName || 'Imported Map').replace(/\.(map|zip)$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 42) || 'Imported Map';
    const mapKey = 'imported_' + cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 28);
    const biome = (snowHits > greenHits && snowHits > desertHits) ? 'snow' : (greenHits > desertHits ? 'temperate' : 'desert');
    const theme = biome === 'temperate' ? 'jungle' : biome;
    const players = Math.max(2, Math.min(8, rawSpawns.length));
    const recSize = dimRecSize;

    return {
        key: mapKey,
        name: cleanName,
        players,
        biome,
        theme,
        gridSize: GRID,
        recommendedSize: recSize,
        grid: grid,
        heightGrid: grid,
        spawns: rawSpawns,
        supplies: rawSupplies,
        derricks: rawDerricks,
        hospitals: rawHospitals,
        refineries: rawRefineries,
        bridges: rawBridges,
        buildings: rawBuildings,
        roads: rawRoads,
        props: rawProps,
        isImportedSageMap: true
    };
}
window.parseSageMapBuffer = parseSageMapBuffer;

// Parse SAGE map.str (UTF-8, UTF-16LE, or Latin-1) into key/value map + display title
function _parseSageMapStr(bytes) {
    if (!bytes || bytes.length === 0) return { title: null, description: null, strings: {} };
    let text = '';
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
        for (let i = 2; i + 1 < bytes.length; i += 2) {
            text += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
        }
    } else if (typeof TextDecoder === 'function') {
        text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } else {
        for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
    }
    const strings = {};
    const lines = text.replace(/\r/g, '').split('\n');
    let curKey = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('//') || line.startsWith(';')) continue;
        if (/^END$/i.test(line)) { curKey = null; continue; }
        const qMatch = line.match(/^"(.*)"$/);
        if (qMatch && curKey) {
            strings[curKey] = qMatch[1].replace(/\\n/g, ' ').trim();
            continue;
        }
        const inlineMatch = line.match(/^([A-Za-z0-9_:.-]+)\s+"(.*)"$/);
        if (inlineMatch) {
            strings[inlineMatch[1]] = inlineMatch[2].replace(/\\n/g, ' ').trim();
            curKey = null;
        } else if (!curKey) {
            curKey = line;
        }
    }
    let title = null;
    let description = null;
    for (const [k, v] of Object.entries(strings)) {
        if (!v) continue;
        if (!title && (/^MAP:.*(Name|Title)$/i.test(k) || /^MapName$/i.test(k) || /^MAP:[^:]+$/i.test(k))) {
            title = v.slice(0, 48);
        }
        if (!description && /Desc|Brief|Intro/i.test(k)) {
            description = v.slice(0, 180);
        }
    }
    return { title, description, strings };
}

// Decode uncompressed (type 2) or RLE-compressed (type 10) 24/32-bit TGA preview to compact JPEG data URL
function _decodeTgaToDataUrl(bytes) {
    if (!bytes || bytes.length < 18 || typeof document === 'undefined') return null;
    const idLen = bytes[0];
    const colorMapType = bytes[1];
    const imageType = bytes[2];
    const width = bytes[12] | (bytes[13] << 8);
    const height = bytes[14] | (bytes[15] << 8);
    const bpp = bytes[16];
    const descriptor = bytes[17];
    if (colorMapType !== 0 || (imageType !== 2 && imageType !== 10) || (bpp !== 24 && bpp !== 32)) return null;
    if (width <= 0 || height <= 0 || width > 2048 || height > 2048) return null;

    const bytesPerPixel = bpp >> 3;
    let offset = 18 + idLen;
    const totalPixels = width * height;
    const rgba = new Uint8ClampedArray(totalPixels * 4);
    const topOrigin = Boolean(descriptor & 0x20);

    const writePixel = (pxIdx, b, g, r, a) => {
        const x = pxIdx % width;
        const rawY = Math.floor(pxIdx / width);
        const y = topOrigin ? rawY : (height - 1 - rawY);
        const out = (y * width + x) * 4;
        rgba[out] = r;
        rgba[out + 1] = g;
        rgba[out + 2] = b;
        rgba[out + 3] = a;
    };

    if (imageType === 2) {
        for (let i = 0; i < totalPixels && offset + bytesPerPixel <= bytes.length; i++) {
            const b = bytes[offset], g = bytes[offset + 1], r = bytes[offset + 2];
            const a = bytesPerPixel === 4 ? bytes[offset + 3] : 255;
            offset += bytesPerPixel;
            writePixel(i, b, g, r, a);
        }
    } else {
        let px = 0;
        while (px < totalPixels && offset < bytes.length) {
            const hdr = bytes[offset++];
            const count = (hdr & 0x7F) + 1;
            if (hdr & 0x80) {
                if (offset + bytesPerPixel > bytes.length) break;
                const b = bytes[offset], g = bytes[offset + 1], r = bytes[offset + 2];
                const a = bytesPerPixel === 4 ? bytes[offset + 3] : 255;
                offset += bytesPerPixel;
                for (let k = 0; k < count && px < totalPixels; k++) writePixel(px++, b, g, r, a);
            } else {
                for (let k = 0; k < count && px < totalPixels && offset + bytesPerPixel <= bytes.length; k++) {
                    const b = bytes[offset], g = bytes[offset + 1], r = bytes[offset + 2];
                    const a = bytesPerPixel === 4 ? bytes[offset + 3] : 255;
                    offset += bytesPerPixel;
                    writePixel(px++, b, g, r, a);
                }
            }
        }
    }

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = width;
    srcCanvas.height = height;
    const srcCtx = srcCanvas.getContext('2d');
    if (!srcCtx || typeof srcCtx.createImageData !== 'function') return null;
    const imgData = srcCtx.createImageData(width, height);
    imgData.data.set(rgba);
    srcCtx.putImageData(imgData, 0, 0);

    // Cap preview size at 512x512 so localStorage stays lean while keeping crisp terrain/minimap detail
    const maxDim = 512;
    if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        const outCanvas = document.createElement('canvas');
        outCanvas.width = Math.max(1, Math.round(width * scale));
        outCanvas.height = Math.max(1, Math.round(height * scale));
        const outCtx = outCanvas.getContext('2d');
        if (outCtx) {
            outCtx.drawImage(srcCanvas, 0, 0, outCanvas.width, outCanvas.height);
            return outCanvas.toDataURL('image/jpeg', 0.85);
        }
    }
    return srcCanvas.toDataURL('image/jpeg', 0.85);
}

// Zero-dependency browser ZIP extractor (supports Store method 0 & Deflate method 8 via DecompressionStream)
async function _extractZipEntries(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const dv = new DataView(arrayBuffer);
    // Find End of Central Directory (EOCD) signature 0x06054b50
    let eocdPos = -1;
    const minSearch = Math.max(0, bytes.length - 65557);
    for (let i = bytes.length - 22; i >= minSearch; i--) {
        if (dv.getUint32(i, true) === 0x06054b50) { eocdPos = i; break; }
    }
    if (eocdPos < 0) throw new Error('Invalid ZIP archive (missing EOCD header).');

    const cdCount = dv.getUint16(eocdPos + 10, true);
    const cdOffset = dv.getUint32(eocdPos + 16, true);
    const entries = [];
    let pos = cdOffset;
    const dec = (typeof TextDecoder === 'function') ? new TextDecoder('utf-8', { fatal: false }) : null;

    for (let i = 0; i < cdCount && pos + 46 <= bytes.length; i++) {
        if (dv.getUint32(pos, true) !== 0x02014b50) break;
        const method = dv.getUint16(pos + 10, true);
        const compSize = dv.getUint32(pos + 20, true);
        const nameLen = dv.getUint16(pos + 28, true);
        const extraLen = dv.getUint16(pos + 30, true);
        const commentLen = dv.getUint16(pos + 32, true);
        const localHeaderOff = dv.getUint32(pos + 42, true);
        const nameBytes = bytes.subarray(pos + 46, pos + 46 + nameLen);
        const name = dec ? dec.decode(nameBytes) : String.fromCharCode(...nameBytes);
        pos += 46 + nameLen + extraLen + commentLen;

        if (!name || name.endsWith('/') || name.includes('__MACOSX/')) continue;
        if (localHeaderOff + 30 > bytes.length || dv.getUint32(localHeaderOff, true) !== 0x04034b50) continue;
        const lhNameLen = dv.getUint16(localHeaderOff + 26, true);
        const lhExtraLen = dv.getUint16(localHeaderOff + 28, true);
        const dataOff = localHeaderOff + 30 + lhNameLen + lhExtraLen;
        if (dataOff + compSize > bytes.length) continue;
        const compData = bytes.subarray(dataOff, dataOff + compSize);

        let fileBytes = null;
        if (method === 0) {
            fileBytes = compData.slice();
        } else if (method === 8) {
            if (typeof DecompressionStream !== 'function') {
                throw new Error('This browser does not support Deflate ZIP decompression.');
            }
            const ds = new DecompressionStream('deflate-raw');
            const writer = ds.writable.getWriter();
            writer.write(compData);
            writer.close();
            const outBuf = await new Response(ds.readable).arrayBuffer();
            fileBytes = new Uint8Array(outBuf);
        }
        if (fileBytes) entries.push({ name, bytes: fileBytes });
    }
    return entries;
}

async function parseSageMapArchiveBuffer(arrayBuffer, fileName = 'Imported Map') {
    const u8 = new Uint8Array(arrayBuffer);
    const isZip = u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4B && (u8[2] === 0x03 || u8[2] === 0x05);
    if (!isZip) {
        return parseSageMapBuffer(arrayBuffer, fileName);
    }

    const entries = await _extractZipEntries(arrayBuffer);
    const mapEntry = entries.find(e => /\.map$/i.test(e.name));
    if (!mapEntry) {
        throw new Error('ZIP archive does not contain a .map file.');
    }
    const baseName = mapEntry.name.split('/').pop();
    const mapStem = baseName.replace(/\.map$/i, '').toLowerCase();

    const parsed = parseSageMapBuffer(
        mapEntry.bytes.buffer.slice(mapEntry.bytes.byteOffset, mapEntry.bytes.byteOffset + mapEntry.bytes.byteLength),
        baseName
    );

    // Optional map.str (or *.str) for official display title & description
    const strEntry = entries.find(e => /(^|\/)map\.str$/i.test(e.name)) || entries.find(e => /\.str$/i.test(e.name));
    if (strEntry) {
        const strInfo = _parseSageMapStr(strEntry.bytes);
        if (strInfo.title) {
            parsed.name = strInfo.title;
        }
        if (strInfo.description) {
            parsed.description = strInfo.description;
        }
        if (strInfo.strings && Object.keys(strInfo.strings).length > 0) {
            parsed.mapStrings = strInfo.strings;
        }
    }

    // Optional .tga preview/minimap image (prefer matching map stem, else largest .tga)
    const tgaEntries = entries.filter(e => /\.tga$/i.test(e.name));
    if (tgaEntries.length > 0) {
        const matchedTga = tgaEntries.find(e => e.name.split('/').pop().replace(/\.tga$/i, '').toLowerCase() === mapStem)
            || tgaEntries.sort((a, b) => b.bytes.length - a.bytes.length)[0];
        const tgaUrl = _decodeTgaToDataUrl(matchedTga.bytes);
        if (tgaUrl) parsed.tgaDataUrl = tgaUrl;
    }

    return parsed;
}
window.parseSageMapArchiveBuffer = parseSageMapArchiveBuffer;

function registerImportedSageMap(mapObj, persist = true) {
    if (!mapObj || !mapObj.key) return;
    // Ensure legacy persisted maps also populate `grid` (used by getOfficialMapHeight) and `theme` (used by 07_terrain.js)
    if (!Array.isArray(mapObj.grid) && Array.isArray(mapObj.heightGrid)) {
        mapObj.grid = mapObj.heightGrid;
    }
    if (!Array.isArray(mapObj.heightGrid) && Array.isArray(mapObj.grid)) {
        mapObj.heightGrid = mapObj.grid;
    }
    if (!Array.isArray(mapObj.grid)) return;
    if (!mapObj.theme) {
        mapObj.theme = mapObj.biome === 'temperate' ? 'jungle' : (mapObj.biome || 'desert');
    }
    if (typeof window !== 'undefined') {
        window.OFFICIAL_SKIRMISH_MAPS = window.OFFICIAL_SKIRMISH_MAPS || {};
        window.OFFICIAL_SKIRMISH_MAPS[mapObj.key] = mapObj;
        // Preload imported .tga preview into _officialMapImages so Skirmish preview canvas renders it immediately
        if (mapObj.tgaDataUrl && typeof Image === 'function') {
            window._officialMapImages = window._officialMapImages || {};
            const img = new Image();
            img.src = mapObj.tgaDataUrl;
            window._officialMapImages[mapObj.key] = img;
        }
    }
    const label = `${mapObj.name} (${mapObj.players}P • Imported Map)`;
    const addOpt = (selId, grpId) => {
        const sel = typeof document !== 'undefined' ? document.getElementById(selId) : null;
        if (!sel) return;
        let opt = sel.querySelector(`option[value="${mapObj.key}"]`);
        if (!opt) {
            opt = document.createElement('option');
            opt.value = mapObj.key;
            const grp = grpId ? document.getElementById(grpId) : null;
            if (grp) {
                grp.style.display = '';
                grp.appendChild(opt);
            } else {
                sel.appendChild(opt);
            }
        }
        opt.textContent = label;
    };
    addOpt('map-environment', 'sp-imported-maps-optgroup');
    addOpt('mp-map-env', null);

    if (persist && typeof localStorage !== 'undefined') {
        try {
            const store = JSON.parse(localStorage.getItem(IMPORTED_SAGE_MAPS_KEY) || '{}');
            // Avoid duplicating the 97x97 grid twice in localStorage JSON
            const toSave = Object.assign({}, mapObj);
            delete toSave.heightGrid;
            store[mapObj.key] = toSave;
            localStorage.setItem(IMPORTED_SAGE_MAPS_KEY, JSON.stringify(store));
        } catch (err) {
            console.warn('Could not persist imported map to localStorage (quota):', err);
        }
    }
}
window.registerImportedSageMap = registerImportedSageMap;

function loadPersistedImportedSageMaps() {
    if (typeof localStorage === 'undefined') return;
    try {
        const store = JSON.parse(localStorage.getItem(IMPORTED_SAGE_MAPS_KEY) || '{}');
        Object.values(store).forEach(m => {
            if (m && m.key && (Array.isArray(m.grid) || Array.isArray(m.heightGrid))) registerImportedSageMap(m, false);
        });
    } catch (_) {}
}
window.loadPersistedImportedSageMaps = loadPersistedImportedSageMaps;

function importOfficialSageMapFile() {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,.map';
    input.onchange = (ev) => {
        const file = ev.target && ev.target.files && ev.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const parsed = await parseSageMapArchiveBuffer(reader.result, file.name);
                registerImportedSageMap(parsed, true);
                const spSel = document.getElementById('map-environment');
                const sizeSel = document.getElementById('map-size');
                if (sizeSel && parsed.recommendedSize) sizeSel.value = String(parsed.recommendedSize);
                if (spSel) {
                    spSel.value = parsed.key;
                    if (typeof onMapSelectionChange === 'function') onMapSelectionChange('single');
                }
                if (typeof showNotification === 'function') {
                    const extras = [];
                    if (parsed.tgaDataUrl) extras.push('.tga preview');
                    if (parsed.mapStrings) extras.push('map.str');
                    const extraStr = extras.length ? ` + ${extras.join(' & ')}` : '';
                    showNotification(`Imported "${parsed.name}" (${parsed.players}P, ${parsed.supplies.length} supplies, ${parsed.bridges.length} bridges${extraStr})!`, 'success');
                }
            } catch (err) {
                console.error('Failed to import map file:', err);
                if (typeof showNotification === 'function') {
                    showNotification('Could not import map: ' + (err && err.message ? err.message : 'Invalid format'), 'error');
                }
            }
        };
        reader.readAsArrayBuffer(file);
    };
    input.click();
}
window.importOfficialSageMapFile = importOfficialSageMapFile;

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('DOMContentLoaded', () => { loadPersistedImportedSageMaps(); });
}

// =========================================================================
