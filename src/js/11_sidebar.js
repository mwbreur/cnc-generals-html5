// =========================================================================
// AUTHENTIC C&C GENERALS COMMAND BAR & RADAR MINIMAP ENGINE
// =========================================================================

let activeGridCategory = 'commands'; // 'commands', 'units', 'structures', 'defenses'
let isRepairMode = false;
let isSellMode = false;
let radarCanvas = null;
let radarCtx = null;
let radarSweepAngle = 0;
const GRID_HOTKEYS = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Z', 'X', 'C', 'V'];
let currentGridSlots = [];

// 1. RADAR MINIMAP ENGINE
function initRadarMinimap() {
    radarCanvas = document.getElementById('radar-canvas');
    if (!radarCanvas) return;
    radarCtx = radarCanvas.getContext('2d');

    let isRadarDragging = false;
    function handleRadarPointer(e) {
        if (!radarCanvas) return;
        const rect = radarCanvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const mapSize = currentMapSize || 800;
        const worldX = (px / radarCanvas.width - 0.5) * mapSize;
        const worldZ = (py / radarCanvas.height - 0.5) * mapSize;

        if (e.buttons === 1 || e.button === 0) { // Left-click drag: Pan camera
            cameraTarget.x = worldX;
            cameraTarget.z = worldZ;
            updateCameraPosition();
        } else if (e.button === 2 || e.buttons === 2) { // Right-click: Move order to map coordinates!
            e.preventDefault();
            const selectedList = units.filter(u => u.selected);
            if (selectedList.length > 0) {
                const targetPos = new THREE.Vector3(worldX, getTerrainHeight(worldX, worldZ), worldZ);
                selectedList.forEach(u => {
                    u.targetPosition.copy(targetPos);
                    u.waypoints = [];
                    u.combatTarget = null;
                    u.taskState = 'Idle';
                });
                playUSASound('acknowledge');
                showNotification(`Tactical rally order to coordinates [${Math.round(worldX)}, ${Math.round(worldZ)}]`, 'info');
                spawnPingEffect(targetPos);
            }
        }
    }

    radarCanvas.addEventListener('mousedown', e => {
        if (e.button === 0) isRadarDragging = true;
        handleRadarPointer(e);
    });
    window.addEventListener('mousemove', e => {
        if (isRadarDragging) handleRadarPointer(e);
    });
    window.addEventListener('mouseup', e => {
        if (e.button === 0) isRadarDragging = false;
    });
    radarCanvas.addEventListener('contextmenu', e => {
        e.preventDefault();
        handleRadarPointer(e);
    });
}

function renderRadarMinimap() {
    if (!radarCanvas) radarCanvas = document.getElementById('radar-canvas');
    if (!radarCanvas || !scene) return;
    if (!radarCtx) radarCtx = radarCanvas.getContext('2d');
    const ctx = radarCtx;
    const w = radarCanvas.width;
    const h = radarCanvas.height;
    const mapSize = currentMapSize || 800;
    const half = mapSize / 2;

    // Clear radar background
    ctx.fillStyle = '#061009';
    ctx.fillRect(0, 0, w, h);

    // Radar grid rings & crosshairs
    ctx.strokeStyle = 'rgba(0, 255, 180, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(w/2, h/2, w * 0.44, 0, Math.PI * 2);
    ctx.arc(w/2, h/2, w * 0.28, 0, Math.PI * 2);
    ctx.moveTo(w/2, 4); ctx.lineTo(w/2, h - 4);
    ctx.moveTo(4, h/2); ctx.lineTo(w - 4, h/2);
    ctx.stroke();

    // Transform world coord to radar canvas coord
    const toRX = (x) => ((x + half) / mapSize) * w;
    const toRZ = (z) => ((z + half) / mapSize) * h;

    // Draw bridges
    if (mapBridges && mapBridges.length > 0) {
        ctx.strokeStyle = '#636e72';
        ctx.lineWidth = 3;
        mapBridges.forEach(b => {
            ctx.beginPath();
            ctx.moveTo(toRX(b.x1), toRZ(b.z1));
            ctx.lineTo(toRX(b.x2), toRZ(b.z2));
            ctx.stroke();
        });
    }

    // Draw Supply Docks (Gold Diamonds)
    if (supplyPoints && supplyPoints.length > 0) {
        ctx.fillStyle = '#f1c40f';
        supplyPoints.forEach(sp => {
            if (sp.stock > 0) {
                const rx = toRX(sp.position.x);
                const rz = toRZ(sp.position.z);
                ctx.fillRect(rx - 2, rz - 2, 4, 4);
            }
        });
    }

    // Draw Friendly Structures (Solid Emerald Green Squares)
    ctx.fillStyle = '#2ecc71';
    structures.forEach(s => {
        if (s.health > 0) {
            const rx = toRX(s.position.x);
            const rz = toRZ(s.position.z);
            const sz = Math.max(4, (s.radius || 4) / mapSize * w * 2.2);
            ctx.fillRect(rx - sz/2, rz - sz/2, sz, sz);
        }
    });

    // Draw Enemy Structures (Solid Crimson Red Squares)
    ctx.fillStyle = '#e74c3c';
    enemyStructures.forEach(es => {
        if (es.health > 0) {
            const rx = toRX(es.position.x);
            const rz = toRZ(es.position.z);
            const sz = Math.max(4, (es.radius || 4) / mapSize * w * 2.2);
            ctx.fillRect(rx - sz/2, rz - sz/2, sz, sz);
        }
    });

    // Draw Friendly Units (Bright Neon Green Dots, Selected = Pulsing White)
    units.forEach(u => {
        if (u.health > 0 && u.mesh && !u.garrisonedIn) {
            const rx = toRX(u.mesh.position.x);
            const rz = toRZ(u.mesh.position.z);
            if (u.selected) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(rx - 2, rz - 2, 4, 4);
            } else {
                ctx.fillStyle = '#55efc4';
                ctx.fillRect(rx - 1.5, rz - 1.5, 3, 3);
            }
        }
    });

    // Draw Enemy Units (Bright Crimson Red Dots)
    ctx.fillStyle = '#ff4757';
    enemyUnits.forEach(eu => {
        if (eu.health > 0 && eu.mesh) {
            const rx = toRX(eu.mesh.position.x);
            const rz = toRZ(eu.mesh.position.z);
            ctx.fillRect(rx - 1.5, rz - 1.5, 3, 3);
        }
    });

    // Draw Camera Viewport Frustum on Radar (Cyan Outline)
    if (camera) {
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 1;
        const camX = toRX(cameraTarget.x);
        const camZ = toRZ(cameraTarget.z);
        const viewW = (cameraRadius / mapSize) * w * 1.4;
        const viewH = (cameraRadius / mapSize) * h * 0.9;
        ctx.strokeRect(camX - viewW/2, camZ - viewH/2, viewW, viewH);
    }

    // Sweeping Radar Line with phosphor fade!
    radarSweepAngle = (radarSweepAngle + 0.045) % (Math.PI * 2);
    const sweepLen = w * 0.46;
    const sweepX = w/2 + Math.cos(radarSweepAngle) * sweepLen;
    const sweepY = h/2 + Math.sin(radarSweepAngle) * sweepLen;
    const grad = ctx.createRadialGradient(w/2, h/2, 2, w/2, h/2, sweepLen);
    grad.addColorStop(0, 'rgba(0, 255, 180, 0.4)');
    grad.addColorStop(1, 'rgba(0, 255, 180, 0.0)');
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w/2, h/2);
    ctx.lineTo(sweepX, sweepY);
    ctx.stroke();
}

function triggerTacticalBeacon() {
    playUSASound('radio_chirp');
    showNotification('Tactical beacon placed. Coordinates transmitted to squad.', 'info');
    spawnPingEffect(cameraTarget);
}

function toggleRepairMode() {
    isRepairMode = !isRepairMode;
    isSellMode = false;
    document.getElementById('btn-repair')?.classList.toggle('active', isRepairMode);
    document.getElementById('btn-sell')?.classList.remove('active');
    document.body.style.cursor = isRepairMode ? 'crosshair' : 'default';
    showNotification(isRepairMode ? '🔧 REPAIR MODE: Click any damaged building to repair ($50)' : 'Repair mode deactivated.', 'info');
}

function toggleSellMode() {
    isSellMode = !isSellMode;
    isRepairMode = false;
    document.getElementById('btn-sell')?.classList.toggle('active', isSellMode);
    document.getElementById('btn-repair')?.classList.remove('active');
    document.body.style.cursor = isSellMode ? 'not-allowed' : 'default';
    showNotification(isSellMode ? '💰 SELL MODE: Click any structure to demolish for 50% refund' : 'Sell mode deactivated.', 'info');
}

function toggleInGameMenu() {
    const menu = document.getElementById('start-menu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    }
}

function switchGridCategory(cat) {
    activeGridCategory = cat;
    document.querySelectorAll('.grid-cat-btn').forEach(btn => {
        btn.classList.toggle('active', btn.id === `grid-tab-${cat}`);
    });
    updateSidebar();
}

function scatterSelectedUnits() {
    const selectedList = units.filter(u => u.selected);
    if (selectedList.length === 0) return;
    selectedList.forEach(u => {
        const angle = Math.random() * Math.PI * 2;
        const dist = 6 + Math.random() * 8;
        const nx = u.mesh.position.x + Math.cos(angle) * dist;
        const nz = u.mesh.position.z + Math.sin(angle) * dist;
        u.targetPosition.set(nx, getTerrainHeight(nx, nz), nz);
        u.taskState = 'Idle';
    });
    playUSASound('acknowledge');
    showNotification('Units scattered into tactical spread!', 'info');
}

function purchaseVehicleDrone(droneType, cost) {
    const selectedVehicles = units.filter(u => u.selected && ['crusader', 'paladin', 'humvee'].includes(u.type));
    if (selectedVehicles.length === 0) {
        showNotification('Select a Crusader Tank, Paladin Tank, or Humvee first.', 'error');
        return;
    }
    if (playerResources < cost) {
        showNotification(`Insufficient funds for ${droneType} drone ($${cost} needed).`, 'error');
        return;
    }
    playerResources -= cost;
    selectedVehicles.forEach(v => attachVehicleDrone(v, droneType));
    playUSASound('radio_chirp');
    showNotification(`${droneType.toUpperCase()} Drone attached to vehicle!`, 'success');
    updateSidebar();
}

function purchaseOverlordUpgrade(upgType, cost) {
    const overlords = units.filter(u => u.selected && u.type === 'overlord');
    if (overlords.length === 0) {
        showNotification('Select an Overlord Tank first.', 'error');
        return;
    }
    if (playerResources < cost) {
        showNotification(`Insufficient funds for Overlord upgrade ($${cost} needed).`, 'error');
        return;
    }
    playerResources -= cost;
    overlords.forEach(ov => attachOverlordUpgrade(ov, upgType));
    playAudio('china_cannon', {}, 'china');
    showNotification(`Overlord ${upgType.toUpperCase()} superstructure installed!`, 'success');
    updateSidebar();
}

function purchaseNukeCannonUpgrade(cost) {
    const nukeCannons = units.filter(u => u.selected && u.type === 'nukecannon');
    if (nukeCannons.length === 0) {
        showNotification('Select a Nuke Cannon first.', 'error');
        return;
    }
    if (playerResources < cost) {
        showNotification(`Insufficient funds for Neutron Shells ($${cost} needed).`, 'error');
        return;
    }
    playerResources -= cost;
    nukeCannons.forEach(nc => { nc.neutronShells = true; });
    playAudio('nuke_artillery', {}, 'china');
    showNotification(`Neutron Shells loaded into Nuke Cannon battery!`, 'success');
    updateSidebar();
}

// 2. THE UPGRADED C&C GENERALS COMMAND BAR UPDATE LOOP
function updateSidebar() {
    if (!radarCanvas) initRadarMinimap();

    // Faction Themes applied to top HUD and bottom command bar
    const topBar = document.getElementById('top-hud-bar');
    const cmdBar = document.getElementById('generals-command-bar');
    const themeClass = `theme-${selectedFaction}`;
    if (topBar) topBar.className = themeClass;
    if (cmdBar) cmdBar.className = themeClass;

    const factionTitles = {
        usa: 'USA STRATEGIC FORCES',
        china: 'PEOPLE\'S LIBERATION ARMY',
        gla: 'GLOBAL LIBERATION ARMY'
    };
    const badge = document.getElementById('sidebar-faction-badge');
    if (badge) badge.textContent = factionTitles[selectedFaction] || 'STRATEGIC FORCES';

    // 1. Update Power Grid Status
    let produced = 0, consumed = 0;
    if (selectedFaction !== 'gla') {
        structures.forEach(s => {
            if (s.health <= 0 || s.isBuilding) return;
            if (s.type === 'power') produced += (s.powerUpgraded ? 10 : 5);
            if (s.type === 'nuclearReactor') produced += (s.overcharged ? 15 : 10);
            const drain = {
                barracks: 1, factory: 1, supplyCenter: 1, airfield: 1,
                strategyCenter: 2, detentionCamp: 1, internetCenter: 2,
                propagandaCenter: 2, patriot: 3, gatlingCannon: 1,
                particleCannon: 4, nukeSilo: 4
            }[s.type] || 0;
            consumed += drain;
        });
    }

    const powerBar = document.getElementById('power-bar-fill');
    const powerNums = document.getElementById('power-nums');
    const powerText = document.getElementById('power-status-text');

    if (selectedFaction === 'gla') {
        if (powerText) powerText.textContent = '⚡ POWER: NONE NEEDED (GLA)';
        if (powerNums) powerNums.textContent = 'N/A';
        if (powerBar) { powerBar.style.width = '100%'; powerBar.classList.remove('low'); }
    } else {
        const percent = Math.min(100, Math.round((produced / Math.max(1, consumed)) * 100));
        if (powerNums) powerNums.textContent = `${produced} / ${consumed}`;
        if (powerBar) {
            powerBar.style.width = `${Math.min(100, percent)}%`;
            if (produced < consumed) powerBar.classList.add('low');
            else powerBar.classList.remove('low');
        }
        if (powerText) {
            if (produced >= consumed) {
                powerText.textContent = '⚡ POWER: NORMAL';
                powerText.style.color = '#55efc4';
            } else {
                powerText.textContent = '⚡ POWER: LOW (-50% SPD)';
                powerText.style.color = '#e74c3c';
            }
        }
    }

    // Update Cash counter
    const resDisp = document.getElementById('resource-display');
    if (resDisp) resDisp.textContent = Number(playerResources).toLocaleString();

    // 2. RENDER INSPECTOR CONSOLE & 3X4 COMMAND GRID
    const inspector = document.getElementById('inspector-console');
    const gridContainer = document.getElementById('command-grid-3x4');
    if (!inspector || !gridContainer) return;

    currentGridSlots = [];

    const selectedUnits = units.filter(u => u.selected);

    if (selectedStructure) {
        renderStructureInspectorAndGrid(inspector, selectedStructure);
    } else if (selectedSupplyPoint) {
        renderSupplyInspectorAndGrid(inspector, selectedSupplyPoint);
    } else if (selectedUnits.length > 0) {
        renderUnitsInspectorAndGrid(inspector, selectedUnits);
    } else {
        renderBaseOverviewInspectorAndGrid(inspector);
    }

    // Render the 3x4 Grid Buttons
    renderCommandGrid(gridContainer, currentGridSlots);
}

function renderUnitsInspectorAndGrid(inspector, selectedUnits) {
    if (selectedUnits.length === 1) {
        const u = selectedUnits[0];
        const spec = unitRoster[u.type] || { name: u.type.toUpperCase(), role: 'Combat Unit', cost: '' };
        const hpPct = Math.max(0, Math.min(100, Math.round((u.health / u.maxHealth) * 100)));
        const hpClass = hpPct > 50 ? 'high' : hpPct > 25 ? 'mid' : 'low';

        const rankClasses = ['rank-regular', 'rank-veteran', 'rank-elite', 'rank-heroic'];
        const rankTitles = ['ROOKIE', '★ VETERAN', '★★ ELITE', '★★★ HEROIC'];
        const rankClass = rankClasses[u.veterancy || 0];
        const rankTitle = rankTitles[u.veterancy || 0];

        // Attachment text
        let attachedText = 'Standard Hull';
        if (u.drone) attachedText = `Drone: ${u.drone.type.toUpperCase()}`;
        else if (u.overlordUpgrade) attachedText = `Tower: ${u.overlordUpgrade.toUpperCase()}`;
        else if (u.neutronShells) attachedText = 'Shells: NEUTRON ☢';

        // Passengers
        let passHtml = '';
        if (u.capacity && u.garrisoned) {
            passHtml = `
                <div class="inspector-passengers-row">
                    <span>👥 Garrison: ${u.garrisoned.length} / ${u.capacity} Seats</span>
                    ${u.garrisoned.length > 0 ? '<button class="inspector-unload-btn" onclick="orderSelectedTransportsToUnload()">UNLOAD ALL</button>' : ''}
                </div>
            `;
        }

        const icons = {
            crusader: '🛡️', paladin: '⚔️', humvee: '🚙', comanche: '🚁', raptor: '✈️', stealthfighter: '🛩️', aurora: '🚀',
            battlemaster: '🛡️', overlord: '🏰', gatling: '🔄', dragon: '🔥', nukecannon: '☢️',
            scorpion: '🦂', marauder: '🛞', technical: '🛻', quad: '⚡', buggy: '🚀', toxintractor: '☣️', scud: '🚀'
        };
        const uIcon = icons[u.type] || '🎖️';

        inspector.innerHTML = `
            <div class="inspector-card">
                <div class="inspector-avatar-box">
                    <div class="inspector-avatar-icon">${uIcon}</div>
                    <div class="inspector-rank-badge ${rankClass}">${rankTitle}</div>
                </div>
                <div class="inspector-info-pane">
                    <div class="inspector-header-row">
                        <span class="inspector-title">${spec.name}</span>
                        <span class="inspector-kills-tag">★ ${u.kills || 0} KILLS</span>
                    </div>
                    <div class="inspector-sub-role">${spec.role}</div>
                    <div class="inspector-hp-box">
                        <div class="inspector-hp-label">
                            <span>COMBAT INTEGRITY</span>
                            <span>${Math.ceil(u.health)} / ${u.maxHealth} HP</span>
                        </div>
                        <div class="inspector-hp-track">
                            <div class="inspector-hp-fill ${hpClass}" style="width: ${hpPct}%;"></div>
                        </div>
                    </div>
                    <div class="inspector-attachments-row">
                        <span>Speed: ${Math.round(u.speed * 100)}</span>
                        <span>${attachedText}</span>
                    </div>
                    ${passHtml}
                </div>
            </div>
        `;

        // 3x4 Grid Slots for Single Unit
        currentGridSlots = [
            { name: 'MOVE', badge: 'DIR', action: () => {}, desc: 'Move to coordinates' },
            { name: 'STOP', badge: 'HALT', action: () => orderUnitsHalt(), desc: 'Halt all movement' },
            { name: 'GUARD', badge: 'DEF', action: () => showNotification('Unit holding defensive guard posture.', 'info'), desc: 'Guard current sector' },
            { name: 'SCATTER', badge: 'EVADE', action: () => scatterSelectedUnits(), desc: 'Scatter into spread formation' }
        ];

        // Vehicle Upgrades & Drones
        if (['crusader', 'paladin', 'humvee'].includes(u.type)) {
            currentGridSlots.push(
                { name: 'BATTLE DRONE', cost: 300, badge: 'DRONE', action: () => purchaseVehicleDrone('battle', 300), desc: 'Repairs hull (+3 HP/s) and suppresses infantry' },
                { name: 'SCOUT DRONE', cost: 100, badge: 'VISION', action: () => purchaseVehicleDrone('scout', 100), desc: '+50% Sight range & reconnaissance sweep' },
                { name: 'HELLFIRE DRONE', cost: 500, badge: 'MISSILE', action: () => purchaseVehicleDrone('hellfire', 500), desc: 'Launches miniature guided anti-tank missiles' }
            );
        } else if (u.type === 'overlord') {
            currentGridSlots.push(
                { name: 'BUNKER TOWER', cost: 500, badge: 'TOWER', action: () => purchaseOverlordUpgrade('bunker', 500), desc: 'Garrison bunker pillbox for troops firing 360°' },
                { name: 'GATLING TOWER', cost: 1200, badge: 'TOWER', action: () => purchaseOverlordUpgrade('gatling', 1200), desc: 'Twin 20mm rotary anti-air/anti-infantry turret' },
                { name: 'PROPAGANDA', cost: 500, badge: 'TOWER', action: () => purchaseOverlordUpgrade('propaganda', 500), desc: 'Heals friendly armor (+4 HP/s) & buffs fire rate 25%' }
            );
        } else if (u.type === 'nukecannon') {
            currentGridSlots.push(
                { name: 'OUTRIGGERS', badge: 'DEPLOY', action: () => deployNukeCannonOutriggers(u), desc: 'Deploy hydraulic stabilization legs for siege artillery' },
                { name: 'NEUTRON SHELLS', cost: 1000, badge: 'UPGRADE', action: () => purchaseNukeCannonUpgrade(1000), desc: 'Eliminates vehicle crews and leaves radiation' }
            );
        } else if (u.type === 'truck' || u.type === 'worker') {
            currentGridSlots.push(
                { name: 'HARVEST', badge: 'GATHER', action: () => orderSelectedHarvestersToGather(), desc: 'Dispatch to nearest supply depot' }
            );
        }
    } else {
        // Multi-Unit Squad
        const totalHP = selectedUnits.reduce((a, u) => a + u.health, 0);
        const maxHP = selectedUnits.reduce((a, u) => a + u.maxHealth, 0);
        const hpPct = Math.max(0, Math.min(100, Math.round((totalHP / maxHP) * 100)));
        const totalKills = selectedUnits.reduce((a, u) => a + (u.kills || 0), 0);

        const counts = {};
        selectedUnits.forEach(u => { counts[u.type] = (counts[u.type] || 0) + 1; });
        const breakdown = Object.entries(counts).map(([type, c]) => `${c}x ${unitRoster[type] ? unitRoster[type].name : type.toUpperCase()}`).join(', ');

        inspector.innerHTML = `
            <div class="inspector-card">
                <div class="inspector-info-pane" style="width: 100%;">
                    <div class="inspector-header-row">
                        <span class="inspector-title">TACTICAL SQUAD (${selectedUnits.length} UNITS)</span>
                        <span class="inspector-kills-tag">★ ${totalKills} TOTAL KILLS</span>
                    </div>
                    <div class="inspector-sub-role">${breakdown}</div>
                    <div class="inspector-hp-box">
                        <div class="inspector-hp-label">
                            <span>SQUAD READINESS</span>
                            <span>${Math.ceil(totalHP)} / ${maxHP} HP</span>
                        </div>
                        <div class="inspector-hp-track">
                            <div class="inspector-hp-fill high" style="width: ${hpPct}%;"></div>
                        </div>
                    </div>
                    <div class="inspector-quick-btns">
                        <button class="quick-army-btn" onclick="selectUnitsByType('combat')">⚔ Combat</button>
                        <button class="quick-army-btn" onclick="orderUnitsHalt()">⏹ Stop</button>
                        <button class="quick-army-btn" onclick="scatterSelectedUnits()">💨 Scatter</button>
                    </div>
                </div>
            </div>
        `;

        currentGridSlots = [
            { name: 'MOVE', badge: 'DIR', action: () => {}, desc: 'Move squad' },
            { name: 'STOP', badge: 'HALT', action: () => orderUnitsHalt(), desc: 'Halt all movement' },
            { name: 'GUARD', badge: 'DEF', action: () => showNotification('Squad holding defensive perimeter.', 'info'), desc: 'Guard sector' },
            { name: 'SCATTER', badge: 'EVADE', action: () => scatterSelectedUnits(), desc: 'Scatter squad' },
            { name: 'ALL COMBAT', badge: 'SEL', action: () => selectUnitsByType('combat'), desc: 'Select all combat units' },
            { name: 'HARVESTERS', badge: 'SEL', action: () => selectUnitsByType('harvesters'), desc: 'Select harvesters' }
        ];
    }
}

function renderStructureInspectorAndGrid(inspector, structure) {
    const names = {
        center: 'Command Center', power: 'Cold Fusion Reactor', nuclearReactor: 'Nuclear Reactor',
        factory: selectedFaction === 'gla' ? 'Arms Dealer' : 'War Factory', supplyCenter: 'Supply Center',
        supplyStash: 'Supply Stash', supplyDrop: 'Supply Drop Zone', airfield: 'Air Field',
        strategyCenter: 'Strategy Center', detentionCamp: 'Detention Camp', internetCenter: 'Internet Center',
        propagandaCenter: 'Propaganda Center', bunker: 'Bunker', patriot: 'Patriot Missile System',
        gatlingCannon: 'Gatling Cannon', speakerTower: 'Speaker Tower', particleCannon: 'Particle Cannon',
        nukeSilo: 'Nuclear Missile Silo', blackMarket: 'Black Market', tunnel: 'Tunnel Network',
        stingerSite: 'Stinger Site', demoTrap: 'Demo Trap', palace: 'Palace', scudStorm: 'SCUD Storm',
        barracks: 'Barracks'
    };
    const title = (names[structure.type] || structure.type).toUpperCase();
    const hpPct = Math.max(0, Math.min(100, Math.round((structure.health / structure.maxHealth) * 100)));
    const isConstructing = structure.isBuilding;

    inspector.innerHTML = `
        <div class="inspector-card">
            <div class="inspector-info-pane" style="width: 100%;">
                <div class="inspector-header-row">
                    <span class="inspector-title">${title}</span>
                    <span class="inspector-kills-tag">${isConstructing ? '🔨 BUILDING...' : '● OPERATIONAL'}</span>
                </div>
                <div class="inspector-sub-role">${structure.isAir ? 'Airfield Operations' : 'Forward Installation'}</div>
                <div class="inspector-hp-box">
                    <div class="inspector-hp-label">
                        <span>STRUCTURAL INTEGRITY</span>
                        <span>${Math.ceil(structure.health)} / ${structure.maxHealth} HP</span>
                    </div>
                    <div class="inspector-hp-track">
                        <div class="inspector-hp-fill high" style="width: ${hpPct}%;"></div>
                    </div>
                </div>
                <div class="inspector-quick-btns">
                    <button class="quick-army-btn" onclick="repairStructure(selectedStructure)">🔧 Repair ($50)</button>
                    <button class="quick-army-btn" onclick="sellStructure(selectedStructure)">💰 Demolish / Sell</button>
                    <button class="quick-army-btn" onclick="selectedStructure = null; updateSidebar();">✕ Deselect</button>
                </div>
            </div>
        </div>
    `;

    // 3x4 Grid for Building: Unit Production & Facility Abilities
    const productionType = structure.type === 'center' ? 'commandCenter' : structure.type;
    const producers = Object.entries(unitRoster).filter(([type, spec]) => {
        if (spec.building === productionType) return true;
        if (structure.type === 'supplyCenter' && type === 'truck') return true;
        if (structure.type === 'supplyStash' && type === 'worker') return true;
        if (structure.type === 'factory' && type === 'truck' && selectedFaction !== 'gla') return true;
        return false;
    });

    currentGridSlots = producers.map(([type, spec]) => {
        const techReq = getUnitTechPrerequisite(type);
        const hasTech = !techReq || structures.some(s => s.type === techReq.building && !s.isBuilding && s.health > 0);
        const canAfford = playerResources >= spec.cost;
        let badge = hasTech ? (canAfford ? 'READY' : 'FUNDS') : 'LOCKED';
        return {
            id: type,
            name: spec.name.toUpperCase(),
            cost: spec.cost,
            badge: badge,
            disabled: !hasTech || !canAfford || isConstructing,
            action: () => produceUnit(type),
            desc: spec.role || 'Combat Unit'
        };
    });

    const abilityButtons = getBuildingAbilities(structure);
    abilityButtons.forEach(ab => {
        currentGridSlots.push({
            name: ab.label.toUpperCase(),
            cost: ab.cost || '',
            badge: ab.badge || 'ACTION',
            disabled: ab.disabled,
            action: () => useStructureAbility(ab.action),
            desc: ab.desc || ''
        });
    });
}

function renderSupplyInspectorAndGrid(inspector, supplyPoint) {
    const stock = supplyPoint.stock || 0;
    const maxStock = supplyPoint.maxStock || 8000;
    const percent = Math.max(0, Math.min(100, Math.round((stock / maxStock) * 100)));

    inspector.innerHTML = `
        <div class="inspector-card">
            <div class="inspector-info-pane" style="width: 100%;">
                <div class="inspector-header-row">
                    <span class="inspector-title">SUPPLY FIELD / DEPOT</span>
                    <span class="inspector-kills-tag">${stock <= 0 ? '⚠ EXHAUSTED' : '● ACTIVE CACHE'}</span>
                </div>
                <div class="inspector-sub-role">STRATEGIC RESOURCE POINT</div>
                <div class="inspector-hp-box">
                    <div class="inspector-hp-label">
                        <span>RESOURCES REMAINING</span>
                        <span>$${stock.toLocaleString()} / $${maxStock.toLocaleString()} (${percent}%)</span>
                    </div>
                    <div class="inspector-hp-track">
                        <div class="inspector-hp-fill high" style="width: ${percent}%;"></div>
                    </div>
                </div>
                <div class="inspector-quick-btns">
                    <button class="quick-army-btn" onclick="orderAllHarvestersToTargetSupply()">⛏ Dispatch All Harvesters</button>
                    <button class="quick-army-btn" onclick="selectedSupplyPoint = null; updateSidebar();">✕ Deselect</button>
                </div>
            </div>
        </div>
    `;

    currentGridSlots = [
        { name: 'DISPATCH ALL', badge: 'MINE', action: () => orderAllHarvestersToTargetSupply(), desc: 'Order all harvesters to gather here' },
        { name: 'SELECT TRUCKS', badge: 'SEL', action: () => selectUnitsByType('harvesters'), desc: 'Select all supply trucks and workers' },
        { name: 'RECENTER BASE', badge: 'BASE', action: () => recenterBase(), desc: 'Recenter camera on base' }
    ];
}

function renderBaseOverviewInspectorAndGrid(inspector) {
    const combatCount = units.filter(u => !['dozer', 'worker', 'truck'].includes(u.type)).length;
    const harvesterCount = units.filter(u => u.type === 'truck' || u.type === 'worker').length;
    const builderCount = units.filter(u => u.type === 'dozer' || u.type === 'worker').length;

    const factionCrests = {
        usa: { icon: '🦅', title: 'USA STRATEGIC COMMAND', sub: 'HIGH-TECH AIR & ARMOR DOCTRINE' },
        china: { icon: '★', title: 'PEOPLE\'S LIBERATION ARMY', sub: 'HEAVY ARMOR & MASS BOMBARDMENT' },
        gla: { icon: '⚔️', title: 'GLOBAL LIBERATION ARMY', sub: 'GUERRILLA CELL & CHEMICAL WARFARE' }
    };
    const crest = factionCrests[selectedFaction] || factionCrests.usa;

    inspector.innerHTML = `
        <div class="inspector-idle-box">
            <div class="inspector-idle-crest">
                <div class="crest-icon">${crest.icon}</div>
                <div>
                    <div class="crest-heading">${crest.title}</div>
                    <div class="crest-sub">${crest.sub}</div>
                </div>
            </div>
            <div class="inspector-army-stats">
                Operational: <strong>${structures.length}</strong> structures, <strong>${units.length}</strong> units.<br>
                Force: <strong>${combatCount}</strong> Combat · <strong>${harvesterCount}</strong> Harvesters · <strong>${builderCount}</strong> Builders.
            </div>
            <div class="inspector-quick-btns">
                <button class="quick-army-btn" onclick="selectUnitsByType('combat')">⚔ Combat (${combatCount})</button>
                <button class="quick-army-btn" onclick="selectUnitsByType('harvesters')">⛏ Harvesters (${harvesterCount})</button>
                <button class="quick-army-btn" onclick="selectUnitsByType('builders')">🔨 Builders (${builderCount})</button>
            </div>
        </div>
    `;

    // 3x4 Grid based on active category
    if (activeGridCategory === 'commands') {
        currentGridSlots = [
            { name: 'ALL COMBAT', badge: 'SEL', action: () => selectUnitsByType('combat'), desc: 'Select all battle units' },
            { name: 'HARVESTERS', badge: 'SEL', action: () => selectUnitsByType('harvesters'), desc: 'Select all supply trucks and workers' },
            { name: 'BUILDERS', badge: 'SEL', action: () => selectUnitsByType('builders'), desc: 'Select all construction dozers / workers' },
            { name: 'RECENTER', badge: 'BASE', action: () => recenterBase(), desc: 'Center camera on main Command Center' },
            { name: 'REPAIR MODE', badge: 'TOOL', action: () => toggleRepairMode(), desc: 'Click buildings to repair' },
            { name: 'SELL MODE', badge: 'TOOL', action: () => toggleSellMode(), desc: 'Click buildings to demolish for cash' },
            { name: 'PING MAP', badge: 'ALERT', action: () => triggerTacticalBeacon(), desc: 'Broadcast tactical alert beacon' },
            { name: 'SCATTER', badge: 'EVADE', action: () => scatterSelectedUnits(), desc: 'Scatter selected forces' }
        ];
    } else if (activeGridCategory === 'structures' || activeGridCategory === 'defenses') {
        const allBuildings = factionBuildings[selectedFaction] || [];
        const defenseKeys = ['patriot', 'gatlingCannon', 'speakerTower', 'bunker', 'tunnel', 'stingerSite', 'demoTrap', 'particleCannon', 'nukeSilo', 'scudStorm'];
        const bList = activeGridCategory === 'defenses'
            ? allBuildings.filter(([type]) => defenseKeys.includes(type))
            : allBuildings.filter(([type]) => !defenseKeys.includes(type));

        currentGridSlots = bList.map(([type, name, cost]) => {
            const structReq = getStructureTechPrerequisite(type);
            const hasTech = !structReq || hasCompletedStructure(structReq.building, structReq.altBuilding);
            const canAfford = playerResources >= cost;
            return {
                id: type,
                name: name.toUpperCase(),
                cost: cost,
                badge: hasTech ? (canAfford ? 'BUILD' : 'FUNDS') : 'REQ',
                disabled: !hasTech || !canAfford,
                action: () => activateBlueprint(type),
                desc: `Construct ${name}`
            };
        });
    } else if (activeGridCategory === 'units') {
        // Quick Units production across operational facilities
        currentGridSlots = Object.entries(unitRoster).slice(0, 12).map(([type, spec]) => {
            const canAfford = playerResources >= spec.cost;
            return {
                id: type,
                name: spec.name.toUpperCase(),
                cost: spec.cost,
                badge: canAfford ? 'TRAIN' : 'FUNDS',
                disabled: !canAfford,
                action: () => produceUnit(type),
                desc: spec.role || 'Train combat unit'
            };
        });
    }
}

function renderCommandGrid(container, slots) {
    let html = '';
    for (let i = 0; i < 12; i++) {
        const key = GRID_HOTKEYS[i];
        const s = slots[i];
        if (s) {
            html += `
                <button class="grid-slot-btn" onclick="currentGridSlots[${i}].action()" onmouseenter="showTacticalTooltip(event, '${s.id || ''}')" onmouseleave="hideTacticalTooltip()" ${s.disabled ? 'disabled' : ''}>
                    <span class="grid-key-badge">${key}</span>
                    <span class="grid-slot-name">${s.name}</span>
                    <div class="grid-slot-footer">
                        <span class="grid-slot-cost">${s.cost ? '$' + s.cost : ''}</span>
                        <span class="grid-slot-badge badge-ready">${s.badge || ''}</span>
                    </div>
                </button>
            `;
        } else {
            html += `
                <div class="grid-slot-btn empty">
                    <span class="grid-key-badge">${key}</span>
                </div>
            `;
        }
    }
    container.innerHTML = html;
}

// 3. KEYBOARD HOTKEY LISTENER (Q, W, E, R, A, S, D, F, Z, X, C, V)
const KEY_SLOT_MAP = {
    'q': 0, 'w': 1, 'e': 2, 'r': 3,
    'a': 4, 's': 5, 'd': 6, 'f': 7,
    'z': 8, 'x': 9, 'c': 10, 'v': 11
};
window.addEventListener('keydown', e => {
    if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    const k = e.key.toLowerCase();
    if (KEY_SLOT_MAP[k] !== undefined) {
        const slotIdx = KEY_SLOT_MAP[k];
        if (currentGridSlots && currentGridSlots[slotIdx] && !currentGridSlots[slotIdx].disabled) {
            currentGridSlots[slotIdx].action();
            const btn = document.querySelectorAll('.command-grid-3x4 .grid-slot-btn')[slotIdx];
            if (btn) {
                btn.classList.add('hotkey-pulse');
                setTimeout(() => btn.classList.remove('hotkey-pulse'), 120);
            }
        }
    }
});

function isInfantryType(type) {
    return ['infantry', 'redguard', 'tankhunter', 'rocket', 'rpg', 'rebel', 'terrorist', 'pathfinder', 'hacker', 'burton', 'jarmen', 'mob'].includes(type);
}

function orderSelectedTransportsToUnload() {
    const selectedTransports = units.filter(u => u.selected && u.capacity > 0 && u.garrisoned && u.garrisoned.length > 0);
    if (selectedTransports.length === 0) return;

    selectedTransports.forEach(transport => {
        const count = transport.garrisoned.length;
        transport.garrisoned.forEach((passenger, idx) => {
            passenger.garrisonedIn = null;
            passenger.mesh.visible = true;
            const ang = (idx / count) * Math.PI * 2;
            const dropDist = (transport.radius || 1.4) + 2.4;
            const dropX = transport.mesh.position.x + Math.cos(ang) * dropDist;
            const dropZ = transport.mesh.position.z + Math.sin(ang) * dropDist;
            passenger.mesh.position.set(dropX, getTerrainHeight(dropX, dropZ), dropZ);
            passenger.targetPosition.copy(passenger.mesh.position);
            passenger.taskState = 'Idle';
        });
        transport.garrisoned = [];
    });
    showNotification('Garrisoned infantry disembarked from transport.', 'info');
    updateSidebar();
}

function orderUnitsHalt() {
    units.forEach(u => {
        if (u.selected) {
            u.targetPosition.copy(u.mesh.position);
            u.combatTarget = null;
            u.taskState = 'Idle';
            if (u.type === 'truck' || u.type === 'worker') u.aiState = 'Idle';
        }
    });
    playUSASound('acknowledge');
    showNotification('Unit movement halted.', 'info');
}

function orderSelectedHarvestersToGather() {
    const harvesters = units.filter(u => u.selected && (u.type === 'truck' || u.type === 'worker'));
    if (harvesters.length === 0) {
        showNotification('Select a Supply Truck or Worker first.', 'info');
        return;
    }
    const targetSp = selectedSupplyPoint || findNearestSupplyPoint(harvesters[0].mesh.position);
    if (!targetSp) {
        showNotification('No active supply field found nearby.', 'error');
        return;
    }
    harvesters.forEach(h => {
        h.supplyTarget = targetSp;
        h.aiState = 'MovingToDock';
        h.taskState = 'Idle';
        h.combatTarget = null;
        h.targetPosition.copy(targetSp.position);
    });
    showNotification(`Dispatched ${harvesters.length} harvester(s) to gather supplies.`, 'success');
}

function orderAllHarvestersToTargetSupply() {
    if (!selectedSupplyPoint) return;
    const harvesters = units.filter(u => u.type === 'truck' || u.type === 'worker');
    if (harvesters.length === 0) {
        showNotification('No harvesters available! Build Supply Trucks or Workers.', 'error');
        return;
    }
    harvesters.forEach(h => {
        h.supplyTarget = selectedSupplyPoint;
        h.aiState = 'MovingToDock';
        h.taskState = 'Idle';
        h.combatTarget = null;
        h.targetPosition.copy(selectedSupplyPoint.position);
    });
    showNotification(`Dispatched ${harvesters.length} harvester(s) to gather supplies ($${selectedSupplyPoint.stock} left).`, 'success');
    updateSidebar();
}

function recenterBase() {
    const hq = structures.find(s => s.type === 'center' && s.health > 0) || structures[0];
    if (hq) {
        cameraTarget.x = hq.position.x;
        cameraTarget.z = hq.position.z;
        updateCameraPosition();
        playUSASound('radio_chirp');
    }
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
    playUSASound('construction');
    showNotification('Structure fully repaired.', 'success');
    updateSidebar();
}

function sellStructure(structure) {
    if (!structure) return;
    const cost = getStructureCost(structure.type) || 500;
    const refund = Math.floor(cost * 0.5);
    playerResources += refund;

    scene.remove(structure.mesh);
    const idx = structures.indexOf(structure);
    if (idx !== -1) structures.splice(idx, 1);
    if (selectedStructure === structure) selectedStructure = null;

    showNotification(`Demolished ${structure.type}. +$${refund} refunded.`, 'info');
    updateSidebar();
}

function produceUnit(type) {
    const spec = unitRoster[type];
    if (!spec) return;

    if (playerResources < spec.cost) {
        showNotification(`Insufficient funds to train ${spec.name} ($${spec.cost} required).`, 'error');
        return;
    }

    const techReq = getUnitTechPrerequisite(type);
    if (techReq && !hasCompletedStructure(techReq.building, techReq.altBuilding)) {
        showNotification(`Production blocked: Requires operational ${techReq.name}!`, 'error');
        return;
    }

    const fac = structures.find(s => {
        if (s.isBuilding || s.health <= 0) return false;
        if (spec.building === 'commandCenter' && s.type === 'center') return true;
        if (s.type === spec.building) return true;
        if (s.type === 'supplyCenter' && type === 'truck') return true;
        if (s.type === 'supplyStash' && type === 'worker') return true;
        if (s.type === 'factory' && type === 'truck' && selectedFaction !== 'gla') return true;
        return false;
    });

    if (!fac) {
        showNotification(`Production halted: No operational production facility available!`, 'error');
        return;
    }

    playerResources -= spec.cost;
    const spawnPos = fac.position.clone().add(new THREE.Vector3(fac.radius + 3.5, 0, fac.radius + 3.5));
    spawnPos.y = getTerrainHeight(spawnPos.x, spawnPos.z);

    const newUnit = spawnUnit(type, spawnPos);
    const rallyTarget = spawnPos.clone().add(new THREE.Vector3(5, 0, 5));
    newUnit.targetPosition.copy(rallyTarget);

    playUSASound('construction');
    showNotification(`Unit deployed: ${spec.name}`, 'success');
    updateSidebar();
}

function useStructureAbility(action) {
    const structure = selectedStructure;
    if (!structure || structure.isBuilding) return;

    if (action === 'upgradePower') {
        if (structure.powerUpgraded) return;
        if (playerResources < 300) { showNotification('Insufficient resources for control rods.', 'error'); return; }
        playerResources -= 300;
        structure.powerUpgraded = true;
        structure.powerOutput = 10;
        showNotification('Control rods installed: Cold Fusion power doubled (+100%).', 'success');
    } else if (action === 'overcharge') {
        structure.overcharged = !structure.overcharged;
        showNotification(`Nuclear Reactor overcharge ${structure.overcharged ? 'ACTIVATED (+50% PWR)' : 'DEACTIVATED'}.`, 'info');
    } else if (action === 'planHold') {
        battlePlan = 'hold';
        showNotification('Strategy Center: Battle plan Hold the Line active (+20% armor).', 'info');
    } else if (action === 'planSearch') {
        battlePlan = 'search';
        showNotification('Strategy Center: Battle plan Search & Destroy active (+20% range & sight).', 'info');
    } else if (action === 'planBombard') {
        battlePlan = 'bombard';
        showNotification('Strategy Center: Battle plan Bombardment active (+20% firepower).', 'info');
    } else if (action === 'compositeArmor') {
        if (playerResources < 1200) { showNotification('Need $1200 for Composite Armor.', 'error'); return; }
        playerResources -= 1200;
        researchedTechs.add('compositeArmor');
        units.filter(u => u.type === 'tank' || u.type === 'paladin').forEach(u => { u.health += 100; u.maxHealth += 100; });
        showNotification('Composite Armor researched: Tanks gained +25% HP!', 'success');
    } else if (action === 'nationalism') {
        if (playerResources < 1000) { showNotification('Need $1000 for Nationalism.', 'error'); return; }
        playerResources -= 1000;
        researchedTechs.add('nationalism');
        showNotification('Nationalism researched: Chinese troops fire +25% faster!', 'success');
    } else if (action === 'subliminal') {
        if (playerResources < 800) { showNotification('Need $800 for Subliminal Messaging.', 'error'); return; }
        playerResources -= 800;
        researchedTechs.add('subliminal');
        showNotification('Subliminal Messaging researched: Healing recovery doubled!', 'success');
    } else if (action === 'anthraxBeta') {
        if (playerResources < 1200) { showNotification('Need $1200 for Anthrax Beta.', 'error'); return; }
        playerResources -= 1200;
        researchedTechs.add('anthraxBeta');
        showNotification('Anthrax Beta researched: Toxin weapons deal +25% damage!', 'success');
    } else if (action === 'armTheMob') {
        if (playerResources < 1000) { showNotification('Need $1000 for Arm the Mob.', 'error'); return; }
        playerResources -= 1000;
        researchedTechs.add('armTheMob');
        showNotification('Arm the Mob researched: Mobs equipped with AK-47 assault rifles!', 'success');
    } else if (action === 'captureBuilding') {
        if (playerResources < 1000) { showNotification('Need $1000 for Capture Building.', 'error'); return; }
        playerResources -= 1000;
        researchedTechs.add('captureBuilding');
        showNotification('Capture Building researched: Infantry can now capture enemy tech!', 'success');
    } else if (action === 'superweapon') {
        if (buildingTick < (structure.cooldownUntil || 0)) { showNotification('Superweapon is recharging.', 'error'); return; }
        pendingSuperweapon = structure;
        showNotification(`Click map to target ${structure.type === 'particleCannon' ? 'Particle Cannon' : structure.type === 'nukeSilo' ? 'Nuclear Strike' : 'SCUD Storm'}. Right-click to cancel.`, 'info');
    }

    updateSidebar();
}

function strikeWithSuperweapon(structure, targetPosition) {
    const sType = structure.type;
    if (sType === 'particleCannon') {
        animateParticleCannonStrike(targetPosition);
    } else if (sType === 'nukeSilo') {
        animateNukeStrike(structure.position, targetPosition);
    } else if (sType === 'scudStorm') {
        animateScudStormStrike(structure.position, targetPosition);
    } else {
        createImpactExplosion(targetPosition);
    }
    structure.lastFired = buildingTick;
    structure.cooldownUntil = buildingTick + 1800;
    pendingSuperweapon = null;
    showNotification('Superweapon strike confirmed on target coordinates!', 'info');
}

function renderStructureMenu(structure) {
    selectedStructure = structure;
    updateSidebar();
}

function updateHUD() {
    updateSidebar();
}

        function processBuildingFunctions() {
            buildingTick++;
            if (intelTimer > 0) intelTimer--;
            if (buildingTick % 60 !== 0) return;
            const activeStructures = structures.filter(structure => !structure.isBuilding && structure.health > 0);
            activeStructures.forEach(structure => {
                if (structure.type === 'supplyDrop' && buildingTick % 900 === 0) playerResources += 250;
                if (structure.type === 'blackMarket' && buildingTick % 300 === 0) playerResources += 30;
                if (structure.type === 'internetCenter' && buildingTick % 300 === 0) playerResources += 20;
                if (structure.type === 'nuclearReactor' && structure.overcharged) structure.health -= 8;

                if (['patriot', 'gatlingCannon', 'stingerSite'].includes(structure.type) && buildingTick % 45 === 0) {
                    const target = enemyUnits.find(enemy => enemy.health > 0 && enemy.mesh.position.distanceTo(structure.position) < 45);
                    if (target) {
                        const targetPos = target.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0));
                        if (structure.type === 'patriot') {
                            const mPos = structure.position.clone().add(new THREE.Vector3(0, 2.4, 0));
                            spawnMuzzleFlash(mPos, 0xff9f43, 0.6);
                            spawnRocketProjectile(mPos, targetPos, false, false);
                            target.health -= 45;
                        } else if (structure.type === 'gatlingCannon') {
                            const mPos = structure.position.clone().add(new THREE.Vector3(0, 2.8, 0));
                            spawnMuzzleFlash(mPos, 0xffa502, 0.5);
                            spawnBulletTracer(mPos, targetPos, 0xf1c40f, 3);
                            target.health -= 28;
                        } else if (structure.type === 'stingerSite') {
                            const mPos = structure.position.clone().add(new THREE.Vector3(0, 1.4, 0));
                            spawnMuzzleFlash(mPos, 0x2ed573, 0.5);
                            spawnRocketProjectile(mPos, targetPos, false, true);
                            target.health -= 38;
                        }
                    }
                }

                if (['barracks', 'speakerTower'].includes(structure.type)) {
                    units.forEach(unit => {
                        const infantry = ['infantry', 'redguard', 'tankhunter', 'rocket', 'rpg', 'rebel', 'terrorist', 'pathfinder', 'hacker'].includes(unit.type);
                        if (infantry && unit.health > 0 && unit.health < unit.maxHealth && unit.mesh.position.distanceTo(structure.position) < (structure.type === 'barracks' ? 12 : 24)) {
                            unit.health = Math.min(unit.maxHealth, unit.health + (structure.type === 'barracks' ? 2 : 1));
                        }
                    });
                }
                if (['factory', 'airfield'].includes(structure.type)) {
                    units.forEach(unit => {
                        const matchingUnit = structure.type === 'airfield'
                            ? ['chinook', 'comanche', 'raptor', 'stealthfighter', 'aurora'].includes(unit.type)
                            : !['chinook', 'comanche', 'raptor', 'stealthfighter', 'aurora', 'infantry', 'redguard', 'tankhunter', 'rocket', 'rpg', 'rebel', 'terrorist', 'worker', 'dozer'].includes(unit.type);
                        if (matchingUnit && unit.health > 0 && unit.health < unit.maxHealth && unit.mesh.position.distanceTo(structure.position) < 16) {
                            unit.health = Math.min(unit.maxHealth, unit.health + 3);
                        }
                    });
                }
                if (structure.type === 'demoTrap') {
                    const target = enemyUnits.find(enemy => enemy.health > 0 && enemy.mesh.position.distanceTo(structure.position) < 7);
                    if (target) {
                        enemyUnits.forEach(enemy => { if (enemy.mesh.position.distanceTo(structure.position) < 16) enemy.health -= 300; });
                        structure.health = 0;
                        createImpactExplosion(structure.position);
                    }
                }
            });
            landmines.forEach(mine => {
                if (!mine.active) return;
                const trigger = enemyUnits.some(enemy => enemy.health > 0 && enemy.mesh.position.distanceTo(mine.position) < 3.5);
                if (trigger) {
                    mine.active = false;
                    enemyUnits.forEach(enemy => {
                        if (enemy.mesh.position.distanceTo(mine.position) < 9) enemy.health -= 180;
                    });
                    createImpactExplosion(mine.position);
                }
            });
            // Continuous auto-repair from Junk Repair & Battle Drones
            if (buildingTick % 60 === 0) {
                if (researchedTechs.has('junkRepair') || researchedTechs.has('battleDrone')) {
                    units.forEach(u => {
                        if (!u.isAir && !isInfantryType(u.type) && u.health > 0 && u.health < u.maxHealth) {
                            u.health = Math.min(u.maxHealth, u.health + 4);
                        }
                    });
                }
            }
            document.getElementById('resource-display').textContent = `$${playerResources}`;
        }

        
        function createFactionUnitMesh(type) {
            return createCrusaderTankMesh(false);
        }

        function spawnUnit(type, position = null) {
            let mesh; let radius = 1.2; let speed = 0.14;
            let health = 400; let scanRange = 22; let isAir = false;
            let capacity = 0; let garrisoned = [];

            // USA Forces
            if (type === 'tank' || type === 'crusader') { mesh = createCrusaderTankMesh(false); radius = 1.35; speed = 0.15; health = 480; scanRange = 24; }
            else if (type === 'paladin') { mesh = createPaladinTankMesh(false); radius = 1.35; speed = 0.14; health = 550; scanRange = 26; }
            else if (type === 'humvee') { mesh = createHumveeMesh(false); radius = 1.1; speed = 0.22; health = 280; scanRange = 26; capacity = 5; garrisoned = []; }
            else if (type === 'ambulance') { mesh = createAmbulanceMesh(); radius = 1.1; speed = 0.18; health = 220; scanRange = 15; }
            else if (type === 'tomahawk') { mesh = createTomahawkMesh(false); radius = 1.3; speed = 0.11; health = 220; scanRange = 38; }
            else if (type === 'dozer') { mesh = createUSADozerMesh(); radius = 1.3; speed = 0.10; health = 300; }
            else if (type === 'truck') { mesh = createUSATruckMesh(); radius = 1.2; speed = 0.13; health = 260; }
            else if (type === 'chinook') { mesh = createChinookMesh(); radius = 1.6; speed = 0.22; health = 550; isAir = true; capacity = 8; garrisoned = []; }
            else if (type === 'comanche') { mesh = createComancheMesh(); radius = 1.4; speed = 0.26; health = 340; scanRange = 28; isAir = true; }
            else if (type === 'raptor') { mesh = createRaptorMesh(); radius = 1.5; speed = 0.32; health = 260; scanRange = 30; isAir = true; }
            else if (type === 'stealthfighter') { mesh = createStealthFighterMesh(); radius = 1.4; speed = 0.28; health = 240; scanRange = 32; isAir = true; }
            else if (type === 'aurora') { mesh = createAuroraMesh(); radius = 1.6; speed = 0.38; health = 180; scanRange = 35; isAir = true; }
            else if (type === 'infantry') { mesh = createRangerMesh(); radius = 0.5; speed = 0.08; health = 100; scanRange = 16; }
            else if (type === 'rocket') { mesh = createMissileDefenderMesh(); radius = 0.5; speed = 0.08; health = 120; scanRange = 24; }
            else if (type === 'pathfinder') { mesh = createRangerMesh(); radius = 0.5; speed = 0.09; health = 120; scanRange = 32; }
            else if (type === 'burton') { mesh = createBurtonMesh(); radius = 0.6; speed = 0.10; health = 350; scanRange = 24; }

            // China Forces
            else if (type === 'battlemaster') { mesh = createBattlemasterTankMesh(false); radius = 1.35; speed = 0.15; health = 460; scanRange = 24; }
            else if (type === 'overlord') { mesh = createOverlordTankMesh(false); radius = 2.1; speed = 0.09; health = 1100; scanRange = 28; capacity = 5; garrisoned = []; }
            else if (type === 'gatling') { mesh = createGatlingTankMesh(false); radius = 1.3; speed = 0.16; health = 400; scanRange = 22; }
            else if (type === 'dragon') { mesh = createDragonTankMesh(false); radius = 1.3; speed = 0.15; health = 450; scanRange = 18; }
            else if (type === 'crawler') { mesh = createTroopCrawlerMesh(); radius = 1.4; speed = 0.15; health = 480; scanRange = 20; capacity = 8; garrisoned = []; }
            else if (type === 'inferno') { mesh = createInfernoCannonMesh(); radius = 1.3; speed = 0.10; health = 220; scanRange = 36; }
            else if (type === 'nukecannon') { mesh = createNukeCannonMesh(); radius = 1.6; speed = 0.08; health = 260; scanRange = 42; }
            else if (type === 'redguard') { mesh = createRedGuardMesh(); radius = 0.5; speed = 0.08; health = 100; scanRange = 16; }
            else if (type === 'tankhunter') { mesh = createTankHunterMesh(); radius = 0.5; speed = 0.08; health = 120; scanRange = 24; }
            else if (type === 'hacker') { mesh = createHackerMesh(); radius = 0.5; speed = 0.07; health = 100; }
            else if (type === 'blacklotus') { mesh = createBlackLotusMesh(); radius = 0.5; speed = 0.10; health = 250; }

            // GLA Forces
            else if (type === 'worker') { mesh = createGLAWorkerMesh(); radius = 0.5; speed = 0.10; health = 150; }
            else if (type === 'technical') { mesh = createTechnicalMesh(false); radius = 1.1; speed = 0.22; health = 240; scanRange = 22; capacity = 5; garrisoned = []; }
            else if (type === 'scorpion') { mesh = createScorpionTankMesh(false); radius = 1.25; speed = 0.16; health = 360; scanRange = 22; }
            else if (type === 'marauder') { mesh = createMarauderTankMesh(false); radius = 1.35; speed = 0.13; health = 520; scanRange = 24; }
            else if (type === 'buggy') { mesh = createRocketBuggyMesh(false); radius = 1.1; speed = 0.22; health = 160; scanRange = 30; }
            else if (type === 'quad') { mesh = createQuadCannonMesh(false); radius = 1.2; speed = 0.17; health = 300; scanRange = 24; }
            else if (type === 'toxintractor') { mesh = createToxinTractorMesh(false); radius = 1.2; speed = 0.14; health = 360; scanRange = 20; }
            else if (type === 'bombtruck') { mesh = createBombTruckMesh(false); radius = 1.2; speed = 0.18; health = 220; scanRange = 14; }
            else if (type === 'scud') { mesh = createScudLauncherMesh(false); radius = 1.4; speed = 0.10; health = 240; scanRange = 40; }
            else if (type === 'radarvan') { mesh = createRadarVanMesh(); radius = 1.1; speed = 0.16; health = 220; }
            else if (type === 'rebel') { mesh = createRebelMesh(); radius = 0.5; speed = 0.08; health = 100; scanRange = 16; }
            else if (type === 'rpg') { mesh = createRPGTrooperMesh(); radius = 0.5; speed = 0.08; health = 120; scanRange = 24; }
            else if (type === 'terrorist') { mesh = createTerroristMesh(); radius = 0.5; speed = 0.12; health = 80; scanRange = 8; }
            else if (type === 'mob') { mesh = createAngryMobMesh(); radius = 0.8; speed = 0.08; health = 280; scanRange = 18; }
            else if (type === 'hijacker') { mesh = createHijackerMesh(); radius = 0.5; speed = 0.11; health = 120; }
            else if (type === 'jarmen') { mesh = createJarmenKellMesh(); radius = 0.5; speed = 0.09; health = 220; scanRange = 34; }
            else {
                mesh = selectedFaction === 'china' ? createBattlemasterTankMesh(false) : selectedFaction === 'gla' ? createScorpionTankMesh(false) : createCrusaderTankMesh(false);
            }

            if (!position) {
                const angle = units.length * 2.4;
                const spawnRadius = 4 + Math.floor(units.length / 8) * 2;
                position = new THREE.Vector3(Math.cos(angle) * spawnRadius, 0, Math.sin(angle) * spawnRadius);
            }
            mesh.position.copy(position);
            if (isAir) {
                const groundY = getTerrainHeight(position.x, position.z);
                const isSpawnLanded = position && Math.abs(position.y - groundY) < 1.5;
                if (!isSpawnLanded) {
                    mesh.position.y = mesh.userData.flightAltitude || 8.5;
                }
            }
            scene.add(mesh);

            const myNetId = (isMultiplayerActive ? (isMultiplayerHost ? 'H_' : 'C_') : 'P_') + (++netIdSequence);
            const newUnitObj = {
                type: type, mesh: mesh, selected: false, targetPosition: position.clone(),
                speed: speed, radius: radius, selectionCircle: null, taskState: 'Idle',
                aiState: (type === 'truck' || type === 'worker') ? 'MovingToDock' : 'Idle',
                cargoLoaded: 0, timerState: 0, targetStructure: null, supplyTarget: null,
                health: health, maxHealth: health, scanRange: scanRange, netId: myNetId,
                attackCooldown: 0, combatTarget: null, isAir: isAir,
                airState: isAir ? (position && Math.abs(position.y - getTerrainHeight(position.x, position.z)) < 1.5 ? 'landed' : 'circling') : 'none',
                patrolCenter: position ? position.clone() : new THREE.Vector3(),
                circleAngle: Math.random() * Math.PI * 2, circleRadius: 15.0,
                capacity: capacity || 0, garrisoned: garrisoned || [], waypoints: []
            };
            newUnitObj.teamId = playerTeamId;
            newUnitObj.ownerId = 'player';
            newUnitObj.isAI = false;
            units.push(newUnitObj);
            if (isMultiplayerActive && netConn && netConn.open) {
                broadcastNetPacket({
                    type: 'spawn_unit',
                    unitType: type,
                    position: { x: position.x, y: position.y, z: position.z },
                    netId: myNetId
                });
            }
            updateHUD();
            return newUnitObj;
        }

        function addSelectionCircle(unit) {
            if (unit.selectionCircle) return;
            const r = unit.radius * 1.35;
            const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.12, r, 32), new THREE.MeshBasicMaterial({ color: 0xe0c46e, side: THREE.DoubleSide }));
            ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
            unit.mesh.add(ring); unit.selectionCircle = ring;
            playUSASound('radio_chirp');
        }

        function removeSelectionCircle(unit) {
            if (unit.selectionCircle) {
                unit.mesh.remove(unit.selectionCircle); unit.selectionCircle.geometry.dispose();
                unit.selectionCircle.material.dispose(); unit.selectionCircle = null;
            }
        }

        function updateCameraPosition() {
            const maxCam = (currentMapSize || 800) * 0.45;
            cameraTarget.x = THREE.MathUtils.clamp(cameraTarget.x, -maxCam, maxCam);
            cameraTarget.z = THREE.MathUtils.clamp(cameraTarget.z, -maxCam, maxCam);
            const x = cameraTarget.x + cameraRadius * Math.sin(cameraBeta) * Math.sin(cameraAlpha);
            const y = cameraTarget.y + cameraRadius * Math.cos(cameraBeta);
            const z = cameraTarget.z + cameraRadius * Math.sin(cameraBeta) * Math.cos(cameraAlpha);
            camera.position.set(x, y, z); camera.lookAt(cameraTarget);
        }

        function processCameraKeyboardPanning() {
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); forward.y = 0; forward.normalize();
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion); right.y = 0; right.normalize();
            if (keysPressed['w'] || keysPressed['arrowup']) cameraTarget.addScaledVector(forward, panSpeed);
            if (keysPressed['s'] || keysPressed['arrowdown']) cameraTarget.addScaledVector(forward, -panSpeed);
            if (keysPressed['a'] || keysPressed['arrowleft']) cameraTarget.addScaledVector(right, -panSpeed);
            if (keysPressed['d'] || keysPressed['arrowright']) cameraTarget.addScaledVector(right, panSpeed);
            if (keysPressed['w'] || keysPressed['arrowup'] || keysPressed['s'] || keysPressed['arrowdown'] || 
                keysPressed['a'] || keysPressed['arrowleft'] || keysPressed['d'] || keysPressed['arrowright']) updateCameraPosition();
        }

        function processCameraScreenEdgePanning(clientX, clientY) {
            // Disabled: Camera movement via screen edges removed per user request.
            // Players pan using WASD / Arrow keys or middle-mouse drag.
        }
		