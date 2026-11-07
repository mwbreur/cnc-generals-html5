function getUnitInitials(type) {
    const map = {
        infantry: 'RG', rocket: 'MD', pathfinder: 'PF', burton: 'CB',
        crusader: 'CR', paladin: 'PL', humvee: 'HV', ambulance: 'AM', tomahawk: 'TM',
        chinook: 'CH', comanche: 'CM', raptor: 'RP', stealthfighter: 'SF', aurora: 'AU',
        redguard: 'RG', tankhunter: 'TH', hacker: 'HK', blacklotus: 'BL',
        battlemaster: 'BM', dragon: 'DT', gatling: 'GT', crawler: 'TC', overlord: 'OL', inferno: 'IC', nukecannon: 'NC',
        rebel: 'RB', rpg: 'RPG', terrorist: 'TR', mob: 'MOB', hijacker: 'HJ', jarmen: 'JK',
        technical: 'TK', scorpion: 'SC', marauder: 'MR', buggy: 'RB', quad: 'QC', toxintractor: 'TT', bombtruck: 'BT', scud: 'SD', radarvan: 'RV',
        dozer: 'DZ', worker: 'WK', truck: 'TR'
    };
    return map[type] || (type ? type.substring(0, 2).toUpperCase() : '??');
}

// =========================================================================
// AUTHENTIC C&C GENERALS COMMAND BAR & RADAR MINIMAP ENGINE
// =========================================================================

let activeGridCategory = 'commands'; // 'commands', 'units', 'structures', 'defenses'
let isRepairMode = false;
let isSellMode = false;
let radarCanvas = null;
let radarCtx = null;
let radarSweepAngle = 0;
const GRID_HOTKEYS = ['Q', 'W', 'E', 'R', 'T', 'Y', 'A', 'S', 'D', 'F', 'G', 'H'];
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

    // Draw Enemy & Allied AI Structures
    enemyStructures.forEach(es => {
        if (es.health > 0) {
            const isAlly = isFriendly({ teamId: playerTeamId }, es);
            if (isAlly) {
                ctx.fillStyle = '#00cec9'; // Cyan for Allied AI base
            } else {
                if (es.mesh && !es.mesh.visible) return; // Hidden under fog/shroud
                ctx.fillStyle = '#e74c3c'; // Crimson for Hostile enemy
            }
            const rx = toRX(es.position.x);
            const rz = toRZ(es.position.z);
            const sz = Math.max(4, (es.radius || 4) / mapSize * w * 2.2);
            ctx.fillRect(rx - sz/2, rz - sz/2, sz, sz);
        }
    });

    // Draw Friendly Player Units (Bright Neon Green Dots, Selected = Pulsing White)
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

    // Draw Enemy & Allied AI Units
    enemyUnits.forEach(eu => {
        if (eu.health > 0 && eu.mesh) {
            const isAlly = isFriendly({ teamId: playerTeamId }, eu);
            if (isAlly) {
                ctx.fillStyle = '#81ecec'; // Light Cyan for Allied AI units
            } else {
                if (!eu.mesh.visible) return; // Hidden under fog of war
                ctx.fillStyle = '#ff4757'; // Crimson Red for Hostile enemies
            }
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
    const isBuilderSelected = selectedUnits.length === 1 && (selectedUnits[0].type === 'dozer' || selectedUnits[0].type === 'worker');
    if (isBuilderSelected) {
        showBuilderPalette();
    } else {
        hideBuilderPalette();
    }
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

        // 3x4 / 2x6 Grid Slots for Single Unit
        if (u.type === 'dozer' || u.type === 'worker') {
            // Direct building blueprints on command bar grid for builder units!
            const allBuildings = factionBuildings[selectedFaction] || [];
            currentGridSlots = new Array(12).fill(null);
            allBuildings.slice(0, 10).forEach(([bType, bName, bCost], bIdx) => {
                const structReq = getStructureTechPrerequisite(bType);
                const hasTech = !structReq || hasCompletedStructure(structReq.building, structReq.altBuilding);
                const canAfford = playerResources >= bCost;
                currentGridSlots[bIdx] = {
                    id: bType,
                    name: bName.toUpperCase(),
                    cost: bCost,
                    badge: hasTech ? (canAfford ? 'READY' : 'FUNDS') : 'LOCKED',
                    disabled: !hasTech || !canAfford,
                    action: () => activateBlueprint(bType),
                    desc: `Construct ${bName}`
                };
            });
            currentGridSlots[10] = {
                id: 'stop',
                name: 'STOP',
                badge: 'HALT',
                disabled: false,
                action: () => orderUnitsHalt(),
                desc: 'Halt builder actions'
            };
            currentGridSlots[11] = {
                id: 'guard',
                name: 'GUARD',
                badge: 'DEF',
                disabled: false,
                action: () => showNotification('Builder holding defensive repair posture.', 'info'),
                desc: 'Hold position'
            };
        } else {
            currentGridSlots = [
                { id: 'move', name: 'MOVE', badge: 'DIR', action: () => {}, desc: 'Move to coordinates' },
                { id: 'stop', name: 'STOP', badge: 'HALT', action: () => orderUnitsHalt(), desc: 'Halt all movement' },
                { id: 'guard', name: 'GUARD', badge: 'DEF', action: () => showNotification('Unit holding defensive guard posture.', 'info'), desc: 'Guard current sector' },
                { id: 'scatter', name: 'SCATTER', badge: 'EVADE', action: () => scatterSelectedUnits(), desc: 'Scatter into spread formation' }
            ];
        }

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
        // Multi-Unit Squad (Control Bar Pro Layout matching screenshot!)
        const totalHP = selectedUnits.reduce((a, u) => a + u.health, 0);
        const maxHP = selectedUnits.reduce((a, u) => a + u.maxHealth, 0);
        const hpPct = Math.max(0, Math.min(100, Math.round((totalHP / maxHP) * 100)));
        const totalKills = selectedUnits.reduce((a, u) => a + (u.kills || 0), 0);

        // Watermark SVG based on faction
        const watermarkSVGs = {
            usa: `<svg viewBox="0 0 100 100" class="cb-watermark-svg"><path d="M50 15 L62 38 L88 38 L68 54 L75 80 L50 64 L25 80 L32 54 L12 38 L38 38 Z" fill="rgba(0,255,204,0.14)"/></svg>`,
            china: `<svg viewBox="0 0 100 100" class="cb-watermark-svg"><polygon points="50,15 62,38 88,38 68,54 75,80 50,64 25,80 32,54 12,38 38,38" fill="rgba(255,71,87,0.14)"/></svg>`,
            gla: `<svg viewBox="0 0 100 100" class="cb-watermark-svg"><path d="M25 75 Q50 20 75 75 Z" fill="rgba(255,165,2,0.14)"/></svg>`
        };
        const watermark = watermarkSVGs[selectedFaction] || watermarkSVGs.usa;

        // Render interactive unit cameo portraits (matching screenshot!)
        const unitCameosHtml = selectedUnits.slice(0, 10).map((u, idx) => {
            const uHpPct = Math.max(0, Math.min(100, Math.round((u.health / u.maxHealth) * 100)));
            const hpColor = uHpPct > 50 ? '#2ecc71' : uHpPct > 25 ? '#f39c12' : '#e74c3c';
            const initials = getUnitInitials(u.type);
            const rankStars = u.veterancy === 3 ? '★★★' : u.veterancy === 2 ? '★★' : u.veterancy === 1 ? '★' : '';
            return `
                <div class="cb-squad-unit-card" title="${u.type.toUpperCase()} (${Math.ceil(u.health)}/${u.maxHealth} HP). Click to isolate, Shift+Click to deselect." onclick="handleSquadCardClick(event, ${idx})">
                    <div class="cb-squad-hp-track">
                        <div class="cb-squad-hp-bar" style="width: ${uHpPct}%; background: ${hpColor};"></div>
                    </div>
                    <div class="cb-squad-avatar-preview">
                        ${getCameoSVG(u.type, selectedFaction, u.type)}
                    </div>
                    ${rankStars ? `<span class="cb-squad-rank-stars">${rankStars}</span>` : ''}
                    <span class="cb-squad-tag">${initials}</span>
                </div>
            `;
        }).join('');

        inspector.innerHTML = `
            <div class="cb-inspector-squad-container">
                ${watermark}
                <div class="cb-squad-header-row">
                    <span class="cb-squad-title">TACTICAL SQUAD (${selectedUnits.length} UNITS)</span>
                    <span class="cb-squad-readiness">${Math.ceil(totalHP)} / ${maxHP} HP (★ ${totalKills} KILLS)</span>
                </div>
                <div class="cb-squad-grid">
                    ${unitCameosHtml}
                </div>
                <div class="cb-squad-quick-actions">
                    <button class="quick-army-btn" onclick="orderUnitsHalt()">⏹ Stop (S)</button>
                    <button class="quick-army-btn" onclick="scatterSelectedUnits()">💨 Scatter (X)</button>
                    <button class="quick-army-btn" onclick="selectUnitsByType('combat')">⚔ All Combat</button>
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
    hideBuilderPalette();
    const names = {
        center: 'Command Center', power: 'Cold Fusion Reactor', nuclearReactor: 'Nuclear Reactor',
        factory: selectedFaction === 'gla' ? 'Arms Dealer' : 'War Factory',
        supplyCenter: 'Supply Center', supplyStash: 'Supply Stash', supplyDrop: 'Supply Drop Zone', airfield: 'Air Field',
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

    // Build Queue Display HTML (matching [MD] [MD] from Control Bar Pro screenshot)
    let queueHtml = '';
    if (structure.productionQueue && structure.productionQueue.length > 0) {
        queueHtml = `
            <div class="cb-queue-strip">
                <span class="cb-queue-label">QUEUED:</span>
                <div class="cb-queue-slots">
                    ${structure.productionQueue.map((item, idx) => {
                        const pct = Math.round((item.progress || 0) * 100);
                        const initials = getUnitInitials(item.type);
                        return `
                            <div class="cb-queue-card ${idx === 0 ? 'active' : 'waiting'}" title="${item.name} (${pct}%). Click to cancel." onclick="cancelQueuedItem(selectedStructure, ${idx})">
                                <span class="cb-qc-tag">${initials}</span>
                                ${idx === 0 ? `<div class="cb-qc-fill" style="width: ${pct}%;"></div>` : ''}
                                <span class="cb-qc-x">✕</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    inspector.innerHTML = `
        <div class="cb-inspector-pane">
            ${queueHtml}
            <div class="inspector-card">
                <div class="inspector-info-pane" style="width: 100%;">
                    <div class="inspector-header-row">
                        <span class="inspector-title">${title}</span>
                        <span class="inspector-kills-tag">${isConstructing ? '🔨 BUILDING...' : '● ONLINE'}</span>
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
                        <button class="quick-army-btn" onclick="sellStructure(selectedStructure)">💰 Sell</button>
                        <button class="quick-army-btn" onclick="triggerRallyPointMode()">🚩 Set Rally</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // 2-Row Production Grid (strictly units built by this structure + upgrades + rally + sell)
    currentGridSlots = new Array(12).fill(null);

    const productionType = structure.type === 'center' ? 'commandCenter' : structure.type;
    const producers = Object.entries(unitRoster).filter(([type, spec]) => {
        return spec.building === productionType;
    });

    // Populate units into slots 0..4
    producers.slice(0, 5).forEach(([type, spec], idx) => {
        const techReq = getUnitTechPrerequisite(type);
        const hasTech = !techReq || structures.some(s => s.type === techReq.building && !s.isBuilding && s.health > 0);
        const canAfford = playerResources >= spec.cost;
        let badge = hasTech ? (canAfford ? 'READY' : 'FUNDS') : 'LOCKED';
        currentGridSlots[idx] = {
            id: type,
            name: spec.name.toUpperCase(),
            cost: spec.cost,
            badge: badge,
            disabled: !hasTech || !canAfford || isConstructing,
            action: () => produceUnit(type),
            desc: spec.role || 'Combat Unit'
        };
    });

    // Slot 5 (Top-Right): RALLY POINT
    currentGridSlots[5] = {
        name: 'SET RALLY',
        cost: '',
        badge: 'RALLY 🚩',
        disabled: isConstructing,
        action: () => triggerRallyPointMode(),
        desc: 'Set unit deployment rally point'
    };

    // Upgrades for this building in slots 6..9
    const factionUpgs = (buildingUpgradesCatalog && buildingUpgradesCatalog[selectedFaction] && buildingUpgradesCatalog[selectedFaction][structure.type]) || [];
    factionUpgs.slice(0, 4).forEach((upg, idx) => {
        const canAfford = playerResources >= upg.cost;
        currentGridSlots[6 + idx] = {
            name: upg.name,
            cost: upg.cost,
            badge: canAfford ? 'UPG' : 'FUNDS',
            disabled: !canAfford || isConstructing,
            action: () => {
                if (playerResources < upg.cost) { showNotification('Insufficient funds.', 'error'); return; }
                playerResources -= upg.cost;
                showNotification(`Upgrade completed: ${upg.name}`, 'success');
                playUSASound('construction');
                updateSidebar();
            },
            desc: upg.desc
        };
    });

    // Slot 11 (Bottom-Right): SELL STRUCTURE
    currentGridSlots[11] = {
        name: 'SELL ($)',
        cost: '',
        badge: 'SELL 💰',
        disabled: false,
        action: () => sellStructure(selectedStructure),
        desc: 'Demolish structure for 50% refund'
    };
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

// =========================================================================
// C&C GENERALS "CONTROL BAR PRO" SVG CAMEO VECTOR ARTWORK LIBRARY
// Authentic portraits, cameos, icons and thumbnails for units, upgrades & commands
// =========================================================================

function getCameoSVG(id, faction = 'usa', name = '') {
    const key = (id || name || '').toLowerCase();

    const wrap = (content) =>
        `<svg class="slot-cameo-svg" viewBox="0 0 64 42" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="64" height="42" rx="3" fill="#0c1318"/>
            <rect x="0.5" y="0.5" width="63" height="41" rx="2.5" stroke="#253846" stroke-opacity="0.6"/>
            ${content}
        </svg>`;

    // 1. RALLY POINT (Golden Banner Flag)
    if (key.includes('rally')) {
        return wrap(`
            <path d="M12 36 L12 6" stroke="#c0d4e3" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="12" cy="5" r="2.2" fill="#ffd700"/>
            <path d="M13 7 L48 15 L13 24 Z" fill="url(#cbGoldGrad)" stroke="#b8860b" stroke-width="1"/>
            <path d="M13 10 L44 15 L13 21 Z" fill="#ffd700" opacity="0.4"/>
            <ellipse cx="12" cy="36" rx="5" ry="2" fill="#555"/>
            <defs>
                <linearGradient id="cbGoldGrad" x1="13" y1="7" x2="48" y2="24" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#fff275"/>
                    <stop offset="0.5" stop-color="#f1c40f"/>
                    <stop offset="1" stop-color="#d35400"/>
                </linearGradient>
            </defs>
        `);
    }

    // 2. SELL STRUCTURE (Dollar Banknotes & Green Cash Sign)
    if (key.includes('sell')) {
        return wrap(`
            <rect x="8" y="14" width="48" height="22" rx="2" fill="#1b4d2e" stroke="#2ecc71" stroke-width="1.2"/>
            <rect x="12" y="10" width="40" height="22" rx="2" fill="#27ae60" stroke="#a8e6cf" stroke-width="1"/>
            <circle cx="32" cy="21" r="7" fill="#1e824c" stroke="#ffd700" stroke-width="1.2"/>
            <text x="32" y="26" font-family="'Impact', 'Arial Black', sans-serif" font-size="16" font-weight="900" fill="#ffd700" text-anchor="middle">$</text>
        `);
    }

    // 3. STOP / HALT
    if (key.includes('stop') || key.includes('halt')) {
        return wrap(`
            <polygon points="24,6 40,6 50,16 50,30 40,38 24,38 14,30 14,16" fill="#c0392b" stroke="#e74c3c" stroke-width="1.5"/>
            <rect x="22" y="14" width="20" height="15" rx="1" fill="#fff"/>
            <polygon points="20,20 22,14 22,25 20,25" fill="#fff"/>
        `);
    }

    // 4. GUARD / DEFENSE POSTURE
    if (key.includes('guard') || key.includes('def')) {
        return wrap(`
            <path d="M32 6 L48 11 C48 24 40 33 32 37 C24 33 16 24 16 11 Z" fill="#2980b9" stroke="#00e5ff" stroke-width="1.5"/>
            <path d="M32 10 L44 14 C44 24 38 31 32 34 C26 31 20 24 20 14 Z" fill="#1a5276"/>
            <polygon points="32,15 34,21 40,21 35,25 37,31 32,27 27,31 29,25 24,21 30,21" fill="#ffd700"/>
        `);
    }

    // 5. SCATTER / EVADE
    if (key.includes('scatter') || key.includes('evade')) {
        return wrap(`
            <path d="M26 16 L12 8 M12 8 L18 8 M12 8 L12 14" stroke="#e67e22" stroke-width="2" stroke-linecap="round"/>
            <path d="M38 16 L52 8 M52 8 L46 8 M52 8 L52 14" stroke="#e67e22" stroke-width="2" stroke-linecap="round"/>
            <path d="M26 26 L12 34 M12 34 L18 34 M12 34 L12 28" stroke="#e67e22" stroke-width="2" stroke-linecap="round"/>
            <path d="M38 26 L52 34 M52 34 L46 34 M52 34 L52 28" stroke="#e67e22" stroke-width="2" stroke-linecap="round"/>
            <circle cx="32" cy="21" r="3.5" fill="#f39c12"/>
        `);
    }

    // 6. OVERLORD SUPER TANK
    if (key.includes('overlord')) {
        return wrap(`
            <rect x="22" y="4" width="4.5" height="22" fill="#2c3e50" stroke="#7f8c8d" stroke-width="0.8"/>
            <rect x="37.5" y="4" width="4.5" height="22" fill="#2c3e50" stroke="#7f8c8d" stroke-width="0.8"/>
            <rect x="20.5" y="2" width="7.5" height="4" fill="#111"/>
            <rect x="36" y="2" width="7.5" height="4" fill="#111"/>
            <rect x="6" y="16" width="12" height="22" rx="2" fill="#1c2833" stroke="#95a5a6" stroke-width="1"/>
            <rect x="46" y="16" width="12" height="22" rx="2" fill="#1c2833" stroke="#95a5a6" stroke-width="1"/>
            <rect x="15" y="18" width="34" height="20" rx="3" fill="#27ae60" stroke="#2ecc71" stroke-width="1.2"/>
            <rect x="20" y="17" width="24" height="15" rx="2" fill="#1e824c" stroke="#52be80" stroke-width="1"/>
            <polygon points="32,20 33.5,23.5 37,23.5 34,25.5 35.5,29 32,27 28.5,29 30,25.5 27,23.5 30.5,23.5" fill="#e74c3c"/>
        `);
    }

    // 7. RANGER / INFANTRY
    if (key.includes('ranger') || key.includes('infantry') || key.includes('redguard') || key.includes('rebel')) {
        const isChina = key.includes('redguard') || faction === 'china';
        const isGLA = key.includes('rebel') || faction === 'gla';
        const hatColor = isChina ? '#922b21' : isGLA ? '#7d6608' : '#27ae60';
        return wrap(`
            <ellipse cx="32" cy="16" rx="14" ry="10" fill="${hatColor}" stroke="#1e272c" stroke-width="1.2"/>
            <rect x="23" y="19" width="18" height="10" rx="2" fill="#d4ac0d"/>
            ${isGLA ? '<path d="M20 23 Q32 28 44 23 L42 35 L22 35 Z" fill="#d5dbdb"/>' : '<rect x="24" y="19" width="16" height="5" rx="2" fill="#2c3e50" stroke="#00e5ff" stroke-width="0.8"/>'}
            <path d="M16 38 C16 31 22 28 32 28 C42 28 48 31 48 38 Z" fill="#34495e" stroke="#1e272c" stroke-width="1"/>
            ${isChina ? '<polygon points="32,10 33,13 36,13 33.5,15 34.5,18 32,16 29.5,18 30.5,15 28,13 31,13" fill="#f1c40f"/>' : ''}
            <rect x="42" y="24" width="16" height="4" rx="1" fill="#111"/>
            <rect x="52" y="22" width="2" height="8" fill="#555"/>
        `);
    }

    // 8. MISSILE DEFENDER / TANK HUNTER / RPG
    if (key.includes('rocket') || key.includes('defender') || key.includes('tankhunter') || key.includes('rpg')) {
        return wrap(`
            <rect x="8" y="11" width="48" height="9" rx="2.5" fill="#2d572c" stroke="#52be80" stroke-width="1"/>
            <polygon points="56,15.5 50,11 50,20" fill="#e74c3c"/>
            <circle cx="10" cy="15.5" r="3.5" fill="#111" stroke="#2d572c" stroke-width="1"/>
            <rect x="26" y="7" width="8" height="4" rx="1" fill="#111"/>
            <circle cx="30" cy="9" r="1.5" fill="#00ffcc"/>
            <ellipse cx="26" cy="24" rx="9" ry="7" fill="#1e824c"/>
            <path d="M16 40 C16 32 20 29 28 29 C36 29 40 32 40 40 Z" fill="#2c3e50"/>
        `);
    }

    // 9. COLONEL BURTON
    if (key.includes('burton')) {
        return wrap(`
            <circle cx="32" cy="18" r="11" fill="#d4ac0d"/>
            <path d="M21 13 Q32 8 43 13 L43 17 Q32 12 21 17 Z" fill="#e74c3c"/>
            <path d="M42 16 L52 20 L48 24 L41 18 Z" fill="#c0392b"/>
            <rect x="25" y="16" width="6" height="4" rx="1" fill="#111"/>
            <rect x="33" y="16" width="6" height="4" rx="1" fill="#111"/>
            <line x1="31" y1="18" x2="33" y2="18" stroke="#111" stroke-width="1.2"/>
            <path d="M18 40 C18 31 23 27 32 27 C41 27 46 31 46 40 Z" fill="#2e4053"/>
            <path d="M46 34 L58 16 L56 14 L44 30 Z" fill="#bdc3c7" stroke="#7f8c8d" stroke-width="0.8"/>
            <rect x="42" y="30" width="4" height="6" rx="1" fill="#78281f"/>
        `);
    }

    // 10. PATHFINDER / SNIPER
    if (key.includes('pathfinder') || key.includes('jarmen') || key.includes('sniper')) {
        return wrap(`
            <path d="M18 38 C18 20 22 10 32 10 C42 10 46 20 46 38 Z" fill="#4d5656" stroke="#229954" stroke-width="1" stroke-dasharray="3,2"/>
            <circle cx="44" cy="20" r="14" fill="#0b1b16" fill-opacity="0.8" stroke="#00ffcc" stroke-width="1.5"/>
            <circle cx="44" cy="20" r="9" stroke="#00ffcc" stroke-width="0.8" stroke-dasharray="2,2"/>
            <line x1="44" y1="4" x2="44" y2="36" stroke="#ff3838" stroke-width="1"/>
            <line x1="28" y1="20" x2="60" y2="20" stroke="#ff3838" stroke-width="1"/>
            <circle cx="44" cy="20" r="1.5" fill="#ff3838"/>
            <rect x="10" y="24" width="30" height="3" fill="#111"/>
        `);
    }

    // 11. CRUSADER / BATTLEMASTER / TANKS
    if (key.includes('crusader') || key.includes('tank') || key.includes('battlemaster') || key.includes('scorpion') || key.includes('marauder') || key.includes('paladin')) {
        const isLaser = key.includes('paladin');
        return wrap(`
            <rect x="2" y="17" width="32" height="4" rx="1" fill="#34495e" stroke="#1b2631" stroke-width="0.8"/>
            <rect x="2" y="16" width="6" height="6" rx="1" fill="#111"/>
            ${isLaser ? '<line x1="4" y1="19" x2="0" y2="19" stroke="#00e5ff" stroke-width="2"/>' : ''}
            <rect x="14" y="23" width="46" height="15" rx="3" fill="#17202a" stroke="#5d6d7e" stroke-width="1"/>
            <circle cx="20" cy="30" r="4.5" fill="#2c3e50" stroke="#7f8c8d" stroke-width="1"/>
            <circle cx="31" cy="30" r="4.5" fill="#2c3e50" stroke="#7f8c8d" stroke-width="1"/>
            <circle cx="42" cy="30" r="4.5" fill="#2c3e50" stroke="#7f8c8d" stroke-width="1"/>
            <circle cx="53" cy="30" r="4.5" fill="#2c3e50" stroke="#7f8c8d" stroke-width="1"/>
            <polygon points="24,12 48,12 52,22 22,22" fill="#2e4053" stroke="#85929e" stroke-width="1"/>
            ${isLaser ? '<circle cx="44" cy="9" r="3.5" fill="#00e5ff" stroke="#fff" stroke-width="1"/>' : '<rect x="42" y="9" width="6" height="3" fill="#111"/>'}
        `);
    }

    // 12. HUMVEE / TECHNICAL / BUGGY
    if (key.includes('humvee') || key.includes('technical') || key.includes('buggy') || key.includes('quad')) {
        return wrap(`
            <path d="M10 28 L14 20 L24 16 L44 16 L52 22 L56 28 Z" fill="#27ae60" stroke="#1e824c" stroke-width="1.2"/>
            <polygon points="25,18 34,18 34,23 23,23" fill="#1b2631" stroke="#5dade2" stroke-width="0.8"/>
            <polygon points="36,18 43,18 45,23 36,23" fill="#1b2631" stroke="#5dade2" stroke-width="0.8"/>
            <rect x="31" y="9" width="18" height="3" fill="#111"/>
            <circle cx="18" cy="30" r="7" fill="#17202a" stroke="#7f8c8d" stroke-width="1.5"/>
            <circle cx="48" cy="30" r="7" fill="#17202a" stroke="#7f8c8d" stroke-width="1.5"/>
        `);
    }

    // 13. DOZER / WORKER
    if (key.includes('dozer') || key.includes('worker') || key.includes('build')) {
        return wrap(`
            <path d="M6 34 L12 16 L17 18 L12 34 Z" fill="#f39c12" stroke="#d68910" stroke-width="1.2"/>
            <rect x="16" y="16" width="36" height="15" rx="2" fill="#f1c40f" stroke="#b7950b" stroke-width="1.2"/>
            <rect x="30" y="8" width="16" height="10" rx="2" fill="#2c3e50" stroke="#f1c40f" stroke-width="1"/>
            <rect x="18" y="27" width="38" height="10" rx="3" fill="#1c2833" stroke="#7f8c8d" stroke-width="1"/>
            <circle cx="24" cy="32" r="3" fill="#7f8c8d"/>
            <circle cx="34" cy="32" r="3" fill="#7f8c8d"/>
            <circle cx="44" cy="32" r="3" fill="#7f8c8d"/>
        `);
    }

    // 14. HELICOPTER / AIRCRAFT
    if (key.includes('comanche') || key.includes('chinook') || key.includes('raptor') || key.includes('mig') || key.includes('aurora') || key.includes('air')) {
        const isHeli = key.includes('comanche') || key.includes('chinook');
        if (isHeli) {
            return wrap(`
                <line x1="8" y1="6" x2="56" y2="6" stroke="#bdc3c7" stroke-width="2.2" stroke-linecap="round"/>
                <circle cx="32" cy="6" r="3" fill="#111"/>
                <ellipse cx="32" cy="20" rx="20" ry="8" fill="#2c3e50" stroke="#5dade2" stroke-width="1"/>
                <path d="M38 16 Q48 18 48 22 Q40 24 36 22 Z" fill="#00e5ff" opacity="0.8"/>
                <path d="M16 20 L4 18 L2 10 L8 18 Z" fill="#1b2631"/>
            `);
        } else {
            return wrap(`
                <polygon points="32,4 42,32 32,28 22,32" fill="#34495e" stroke="#5dade2" stroke-width="1"/>
                <polygon points="32,14 60,32 52,35 32,26" fill="#2c3e50" stroke="#7f8c8d" stroke-width="0.8"/>
                <polygon points="32,14 4,32 12,35 32,26" fill="#2c3e50" stroke="#7f8c8d" stroke-width="0.8"/>
                <ellipse cx="28" cy="33" rx="2.5" ry="4" fill="#e74c3c"/>
                <ellipse cx="36" cy="33" rx="2.5" ry="4" fill="#e74c3c"/>
            `);
        }
    }

    // 15. NUKE CANNON / ARTILLERY
    if (key.includes('nuke') || key.includes('inferno') || key.includes('tomahawk') || key.includes('scud')) {
        return wrap(`
            <line x1="8" y1="8" x2="38" y2="22" stroke="#2c3e50" stroke-width="5" stroke-linecap="round"/>
            <line x1="8" y1="8" x2="38" y2="22" stroke="#7f8c8d" stroke-width="2.5" stroke-linecap="round"/>
            <rect x="16" y="24" width="44" height="14" rx="2" fill="#1a252f" stroke="#27ae60" stroke-width="1"/>
            <circle cx="48" cy="18" r="8" fill="#f1c40f" stroke="#111" stroke-width="1"/>
            <circle cx="48" cy="18" r="2.5" fill="#111"/>
            <path d="M48 10 L45 15 L51 15 Z" fill="#111"/>
            <path d="M42 22 L46 19 L44 24 Z" fill="#111"/>
            <path d="M54 22 L52 24 L50 19 Z" fill="#111"/>
        `);
    }

    // 16. DRONES
    if (key.includes('drone')) {
        const isHellfire = key.includes('hellfire');
        const isScout = key.includes('scout');
        const glow = isHellfire ? '#e74c3c' : isScout ? '#00e5ff' : '#2ecc71';
        return wrap(`
            <line x1="16" y1="12" x2="48" y2="28" stroke="#7f8c8d" stroke-width="2"/>
            <line x1="16" y1="28" x2="48" y2="12" stroke="#7f8c8d" stroke-width="2"/>
            <ellipse cx="16" cy="12" rx="7" ry="2.5" fill="#bdc3c7" stroke="#34495e" stroke-width="1"/>
            <ellipse cx="48" cy="12" rx="7" ry="2.5" fill="#bdc3c7" stroke="#34495e" stroke-width="1"/>
            <ellipse cx="16" cy="28" rx="7" ry="2.5" fill="#bdc3c7" stroke="#34495e" stroke-width="1"/>
            <ellipse cx="48" cy="28" rx="7" ry="2.5" fill="#bdc3c7" stroke="#34495e" stroke-width="1"/>
            <circle cx="32" cy="20" r="7" fill="#2c3e50" stroke="#95a5a6" stroke-width="1.2"/>
            <circle cx="32" cy="20" r="3.5" fill="${glow}"/>
        `);
    }

    // 17. OVERLORD UPGRADE TOWERS
    if (key.includes('bunker')) {
        return wrap(`
            <polygon points="20,12 44,12 52,28 12,28" fill="#5d6d7e" stroke="#2c3e50" stroke-width="1.5"/>
            <rect x="22" y="16" width="6" height="3" fill="#111"/>
            <rect x="36" y="16" width="6" height="3" fill="#111"/>
            <rect x="18" y="26" width="28" height="10" rx="2" fill="#2c3e50"/>
        `);
    }
    if (key.includes('gatling')) {
        return wrap(`
            <rect x="24" y="6" width="4" height="20" fill="#111" stroke="#555" stroke-width="0.8"/>
            <rect x="36" y="6" width="4" height="20" fill="#111" stroke="#555" stroke-width="0.8"/>
            <circle cx="26" cy="6" r="3" fill="#e67e22"/>
            <circle cx="38" cy="6" r="3" fill="#e67e22"/>
            <rect x="20" y="24" width="24" height="12" rx="3" fill="#2c3e50" stroke="#7f8c8d" stroke-width="1"/>
        `);
    }
    if (key.includes('propaganda')) {
        return wrap(`
            <rect x="30" y="10" width="4" height="26" fill="#922b21"/>
            <circle cx="32" cy="8" r="3.5" fill="#ff2222" stroke="#fff" stroke-width="1"/>
            <polygon points="20,10 30,14 30,18 20,22" fill="#f1c40f" stroke="#b7950b" stroke-width="0.8"/>
            <polygon points="44,10 34,14 34,18 44,22" fill="#f1c40f" stroke="#b7950b" stroke-width="0.8"/>
            <rect x="22" y="34" width="20" height="5" rx="1" fill="#2c3e50"/>
        `);
    }

    // 18. DEFAULT GENERIC MILITARY CAMEO
    return wrap(`
        <circle cx="32" cy="21" r="14" fill="#1f2c35" stroke="#3d576a" stroke-width="1.5"/>
        <polygon points="32,10 35,17 42,17 36,22 38,29 32,25 26,29 28,22 22,17 29,17" fill="#55efc4"/>
    `);
}

function renderCommandGrid(container, slots) {
    if (!container) return;
    let html = '';
    for (let i = 0; i < 12; i++) {
        const s = slots[i];
        if (s) {
            const isRally = s.badge && s.badge.includes('RALLY');
            const isSell = s.badge && s.badge.includes('SELL');
            const specialClass = isRally ? 'slot-rally' : isSell ? 'slot-sell' : '';
            const costStr = s.cost ? (String.fromCharCode(36) + s.cost) : '';
            const badgeStr = s.badge || '';
            const idStr = s.id || s.name || '';
            const disabledAttr = s.disabled ? 'disabled' : '';
            const cameoSvg = getCameoSVG(s.id, selectedFaction, s.name);
            const cleanBadge = isRally ? 'RALLY' : isSell ? 'SELL' : badgeStr;

            html += `<button class="grid-slot-btn ${specialClass}" onclick="currentGridSlots[${i}].action()" onmouseenter="showTacticalTooltip(event, '${idStr}')" onmouseleave="hideTacticalTooltip()" ${disabledAttr}>
                <div class="slot-art-wrap">
                    ${cameoSvg}
                </div>
                <div class="slot-overlay-top">
                    <span class="grid-slot-badge ${s.disabled ? 'badge-locked' : 'badge-ready'}">${cleanBadge}</span>
                </div>
                <div class="slot-overlay-bottom">
                    <span class="grid-slot-name" title="${s.name}">${s.name}</span>
                    ${costStr ? `<span class="grid-slot-cost">${costStr}</span>` : ''}
                </div>
            </button>`;
        } else {
            html += '<div class="grid-slot-btn empty"></div>';
        }
    }
    container.innerHTML = html;
}

// =========================================================================
// OFFICIAL C&C: GENERALS & ZERO HOUR CONTROL SYSTEM
// Reference: https://strategywiki.org/wiki/Command_%26_Conquer:_Generals/Controls
// =========================================================================

// Control Groups (1-9)
const controlGroups = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [] };
const lastGroupTapTime = {};
let lastQPressTime = 0;
let lastWPressTime = 0;
let lastEPressTime = 0;
let attackMoveMode = false;
let guardModeActive = false;

function centerCameraOn(pos) {
    if (!pos) return;
    cameraTarget.set(pos.x, 0, pos.z);
    updateCameraPosition();
}

function isUnitVisibleOnScreen(u) {
    if (!u.mesh || u.health <= 0) return false;
    const p = u.mesh.position.clone().project(camera);
    return (p.x >= -1.05 && p.x <= 1.05 && p.y >= -1.05 && p.y <= 1.05 && p.z >= -1 && p.z <= 1);
}

function deselectAll() {
    units.forEach(u => {
        u.selected = false;
        removeSelectionCircle(u);
    });
    selectedStructure = null;
    selectedSupplyPoint = null;
    hideBuilderPalette();
    updateSidebar();
    updateHUD();
}

window.addEventListener('keydown', e => {
    // Ignore input if typing in chat, text fields, or modal
    if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

    const k = e.key.toLowerCase();
    const isCtrl = e.ctrlKey || e.metaKey;
    const isAlt = e.altKey;
    const isShift = e.shiftKey;
    const now = Date.now();

    // 1. ESCAPE: Universal cancel blueprint / superweapon / deselect all
    if (e.key === 'Escape' || k === 'escape') {
        if (blueprintMesh) {
            scene.remove(blueprintMesh);
            blueprintMesh = null;
            activeBlueprintType = null;
            showNotification('Construction cancelled.', 'info');
            return;
        }
        if (pendingSuperweapon) {
            pendingSuperweapon = null;
            showNotification('Targeting cancelled.', 'info');
            return;
        }
        if (attackMoveMode || guardModeActive) {
            attackMoveMode = false;
            guardModeActive = false;
            showNotification('Command cancelled.', 'info');
            return;
        }
        deselectAll();
        return;
    }

    // 2. SPACEBAR: Jump camera to Command Center or last radar alert
    if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        recenterBase();
        return;
    }

    // 3. CONTROL GROUPS: 1-9
    if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
        const num = parseInt(e.key);
        if (isCtrl) {
            // Assign selected units to group
            const selectedList = units.filter(u => u.selected && u.health > 0);
            controlGroups[num] = [...selectedList];
            showNotification(`Group ${num} assigned (${selectedList.length} units).`, 'success');
            playUSASound('radio_chirp');
            return;
        } else if (isAlt) {
            // Alt + (1-9): View group on screen without selecting
            const group = controlGroups[num] || [];
            const valid = group.filter(u => u.health > 0 && u.mesh);
            if (valid.length > 0) {
                centerCameraOn(valid[0].mesh.position);
            }
            return;
        } else {
            // (1-9): Select control group (Double-tap = select + snap camera)
            const group = (controlGroups[num] || []).filter(u => u.health > 0 && u.mesh);
            if (group.length > 0) {
                deselectAll();
                group.forEach(u => {
                    u.selected = true;
                    addSelectionCircle(u);
                });
                updateSidebar();
                updateHUD();
                playUSASound('radio_chirp');

                if (lastGroupTapTime[num] && (now - lastGroupTapTime[num]) < 380) {
                    centerCameraOn(group[0].mesh.position);
                }
                lastGroupTapTime[num] = now;
            } else {
                showNotification(`Group ${num} is empty.`, 'warning');
            }
            return;
        }
    }

    // 4. MASS SELECTION HOTKEYS (Q, W, E)
    // Q (Press Once): Select all on-screen combat units | (Double-Press): Select all combat units on map
    if (k === 'q' && !isCtrl && !isAlt) {
        const isDouble = (now - lastQPressTime) < 380;
        lastQPressTime = now;
        deselectAll();
        const combatList = units.filter(u => u.health > 0 && !['dozer', 'worker', 'truck'].includes(u.type));
        const toSelect = isDouble ? combatList : combatList.filter(u => isUnitVisibleOnScreen(u));
        toSelect.forEach(u => { u.selected = true; addSelectionCircle(u); });
        updateSidebar();
        showNotification(isDouble ? `All combat units on map selected (${toSelect.length}).` : `On-screen combat units selected (${toSelect.length}).`, 'info');
        playUSASound('radio_chirp');
        return;
    }

    // W (Zero Hour rule): Select air units (Only if not using WASD camera panning)
    // If Shift/Ctrl held with W:
    if (k === 'w' && isCtrl) {
        const isDouble = (now - lastWPressTime) < 380;
        lastWPressTime = now;
        deselectAll();
        const airList = units.filter(u => u.health > 0 && u.isAir);
        const toSelect = isDouble ? airList : airList.filter(u => isUnitVisibleOnScreen(u));
        toSelect.forEach(u => { u.selected = true; addSelectionCircle(u); });
        updateSidebar();
        showNotification(isDouble ? `All air units on map selected (${toSelect.length}).` : `On-screen air units selected (${toSelect.length}).`, 'info');
        playUSASound('radio_chirp');
        return;
    }

    // E (Press Once): Select all on-screen units of same type | (Double-Press): Across map
    if (k === 'e' && !isCtrl && !isAlt) {
        const selectedFirst = units.find(u => u.selected);
        if (selectedFirst) {
            const targetType = selectedFirst.type;
            const isDouble = (now - lastEPressTime) < 380;
            lastEPressTime = now;
            const sameTypeAll = units.filter(u => u.type === targetType && u.health > 0);
            const toSelect = isDouble ? sameTypeAll : sameTypeAll.filter(u => isUnitVisibleOnScreen(u));
            deselectAll();
            toSelect.forEach(u => { u.selected = true; addSelectionCircle(u); });
            updateSidebar();
            const typeLabel = unitRoster[targetType] ? unitRoster[targetType].name : targetType.toUpperCase();
            showNotification(isDouble ? `All ${typeLabel} on map selected (${toSelect.length}).` : `On-screen ${typeLabel} selected (${toSelect.length}).`, 'info');
            playUSASound('radio_chirp');
            return;
        }
    }

    // 5. COMMAND CENTER & HERO HOTKEYS
    // H: Jump camera to Command Center
    if (k === 'h' && !isCtrl) {
        const cc = structures.find(s => (s.type === 'center' || s.type === 'commandCenter') && s.health > 0);
        if (cc) {
            centerCameraOn(cc.position);
            showNotification('Camera jumped to Command Center.', 'info');
        }
        return;
    }
    // Ctrl + H: Jump camera to Hero unit (Burton / Black Lotus / Jarmen Kell)
    if (k === 'h' && isCtrl) {
        const heroTypes = ['burton', 'blacklotus', 'jarmen'];
        const hero = units.find(u => heroTypes.includes(u.type) && u.health > 0);
        if (hero) {
            deselectAll();
            hero.selected = true;
            addSelectionCircle(hero);
            centerCameraOn(hero.mesh.position);
            updateSidebar();
            showNotification(`Hero selected: ${hero.type.toUpperCase()}`, 'success');
            playUSASound('radio_chirp');
        } else {
            showNotification('No Hero unit currently on the battlefield.', 'warning');
        }
        return;
    }

    // 6. BUILDER CYCLING: Ctrl + Up / Down Arrow
    if (isCtrl && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const builders = units.filter(u => (u.type === 'dozer' || u.type === 'worker') && u.health > 0);
        if (builders.length > 0) {
            const currentIdx = builders.findIndex(u => u.selected);
            let nextIdx = 0;
            if (e.key === 'ArrowDown') nextIdx = (currentIdx + 1) % builders.length;
            else nextIdx = (currentIdx - 1 + builders.length) % builders.length;
            deselectAll();
            builders[nextIdx].selected = true;
            addSelectionCircle(builders[nextIdx]);
            centerCameraOn(builders[nextIdx].mesh.position);
            updateSidebar();
            showNotification(`Builder selected (${nextIdx + 1}/${builders.length}).`, 'info');
        }
        return;
    }

    // 7. SELECTION CYCLING: Ctrl + Left / Right Arrow
    if (isCtrl && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const selectedList = units.filter(u => u.selected && u.health > 0);
        if (selectedList.length > 1) {
            const activeUnit = selectedList.shift();
            selectedList.push(activeUnit);
            updateSidebar();
        }
        return;
    }

    // 8. COMBAT ORDERS:
    // S: Stop unit movement immediately (only when units are selected and NOT holding Ctrl/Alt)
    if (k === 's' && !isCtrl && !isAlt && units.some(u => u.selected)) {
        orderUnitsHalt();
        return;
    }

    // X: Scatter selected infantry away from AOE damage
    if (k === 'x' && !isCtrl && units.some(u => u.selected)) {
        scatterSelectedUnits();
        return;
    }

    // A + Click mode: Attack-Move
    if (k === 'a' && !isCtrl && units.some(u => u.selected)) {
        attackMoveMode = !attackMoveMode;
        guardModeActive = false;
        showNotification(attackMoveMode ? 'ATTACK-MOVE: Right-click destination or enemy to attack-move.' : 'Attack-Move cancelled.', 'info');
        return;
    }

    // G + Click mode: Guard
    if (k === 'g' && !isCtrl && units.some(u => u.selected)) {
        guardModeActive = !guardModeActive;
        attackMoveMode = false;
        showNotification(guardModeActive ? 'GUARD MODE: Right-click sector or unit to protect.' : 'Guard cancelled.', 'info');
        return;
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

    // Prioritize selected structure if it can build this unit!
    let fac = null;
    if (selectedStructure && !selectedStructure.isBuilding && selectedStructure.health > 0) {
        if (spec.building === 'commandCenter' && selectedStructure.type === 'center') fac = selectedStructure;
        else if (selectedStructure.type === spec.building) fac = selectedStructure;
    }
    if (!fac) {
        fac = structures.find(s => {
            if (s.isBuilding || s.health <= 0) return false;
            if (spec.building === 'commandCenter' && s.type === 'center') return true;
            if (s.type === spec.building) return true;
            return false;
        });
    }

    if (!fac) {
        showNotification(`Production halted: No operational production facility available!`, 'error');
        return;
    }

    if (!fac.productionQueue) fac.productionQueue = [];
    if (fac.productionQueue.length >= 5) {
        showNotification('Production queue full (max 5 units).', 'warning');
        return;
    }

    playerResources -= spec.cost;
    fac.productionQueue.push({
        type: type,
        name: spec.name,
        cost: spec.cost,
        progress: 0,
        buildTime: spec.buildTime || (isInfantryType(type) ? 3.0 : 5.5)
    });

    playUSASound('radio_chirp');
    showNotification(`Queued: ${spec.name}`, 'info');
    updateSidebar();
}

function cancelQueuedItem(structure, index) {
    if (!structure || !structure.productionQueue || !structure.productionQueue[index]) return;
    const item = structure.productionQueue[index];
    playerResources += item.cost;
    structure.productionQueue.splice(index, 1);
    playUSASound('radio_chirp');
    showNotification(`Cancelled: ${item.name} (Refunded $${item.cost})`, 'info');
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

            // 1.35x Scale Boost for high visual fidelity & detail
            mesh.scale.set(1.35, 1.35, 1.35);
            radius *= 1.35;
            scanRange *= 1.35;
            speed *= 1.15;

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
            const r = unit.radius * 1.45;
            const group = new THREE.Group();
            group.name = "selectionReticle";
            group.position.y = 0.05;

            const factionColor = (typeof selectedFaction !== 'undefined' && selectedFaction === 'china') ? 0xff4757 : 
                                 (typeof selectedFaction !== 'undefined' && selectedFaction === 'gla') ? 0xffa502 : 0x00ffcc;

            // 1. High-contrast ground circle
            const ringGeo = new THREE.RingGeometry(r - 0.08, r, 32);
            const ringMat = new THREE.MeshBasicMaterial({ color: factionColor, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = -Math.PI / 2;
            group.add(ring);

            // 2. Four distinct L-shaped corner brackets [ ]
            const bMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
            const bOffset = r * 1.15;
            const bArm = r * 0.45;

            // Corner 1 (+X, +Z)
            const c1Geo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(bOffset - bArm, 0.02, bOffset),
                new THREE.Vector3(bOffset, 0.02, bOffset),
                new THREE.Vector3(bOffset, 0.02, bOffset - bArm)
            ]);
            group.add(new THREE.Line(c1Geo, bMat));

            // Corner 2 (-X, +Z)
            const c2Geo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-bOffset + bArm, 0.02, bOffset),
                new THREE.Vector3(-bOffset, 0.02, bOffset),
                new THREE.Vector3(-bOffset, 0.02, bOffset - bArm)
            ]);
            group.add(new THREE.Line(c2Geo, bMat));

            // Corner 3 (-X, -Z)
            const c3Geo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-bOffset + bArm, 0.02, -bOffset),
                new THREE.Vector3(-bOffset, 0.02, -bOffset),
                new THREE.Vector3(-bOffset, 0.02, -bOffset + bArm)
            ]);
            group.add(new THREE.Line(c3Geo, bMat));

            // Corner 4 (+X, -Z)
            const c4Geo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(bOffset - bArm, 0.02, -bOffset),
                new THREE.Vector3(bOffset, 0.02, -bOffset),
                new THREE.Vector3(bOffset, 0.02, -bOffset + bArm)
            ]);
            group.add(new THREE.Line(c4Geo, bMat));

            unit.mesh.add(group);
            unit.selectionCircle = group;
            playUSASound('radio_chirp');
        }

        function removeSelectionCircle(unit) {
            if (unit.selectionCircle) {
                unit.mesh.remove(unit.selectionCircle);
                unit.selectionCircle.traverse(c => {
                    if (c.geometry) c.geometry.dispose();
                    if (c.material) c.material.dispose();
                });
                unit.selectionCircle = null;
            }
            if (unit.trajectoryLine) {
                scene.remove(unit.trajectoryLine);
                if (unit.trajectoryLine.geometry) unit.trajectoryLine.geometry.dispose();
                if (unit.trajectoryLine.material) unit.trajectoryLine.material.dispose();
                unit.trajectoryLine = null;
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
		
function triggerRallyPointMode() {
    if (selectedStructure) {
        showNotification('Click anywhere on battlefield to set Rally Point.', 'info');
    } else {
        showNotification('Select a production building first to set its Rally Point.', 'warning');
    }
}

let activeBuilderCategory = 'base';

function showBuilderPalette() {
    const pal = document.getElementById('builder-palette');
    if (!pal) return;
    pal.style.display = 'flex';
    renderBuilderPaletteCards();
}

function hideBuilderPalette() {
    const pal = document.getElementById('builder-palette');
    if (pal) pal.style.display = 'none';
}

function switchBuilderCategory(cat) {
    activeBuilderCategory = cat;
    document.querySelectorAll('.bp-cat-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(cat === 'base' ? 'bp-tab-base' : 'bp-tab-def');
    if (activeBtn) activeBtn.classList.add('active');
    renderBuilderPaletteCards();
}

function renderBuilderPaletteCards() {
    const container = document.getElementById('bp-cards-grid');
    if (!container) return;

    const allBuildings = factionBuildings[selectedFaction] || [];
    const defenseKeys = ['patriot', 'gatlingCannon', 'speakerTower', 'bunker', 'tunnel', 'stingerSite', 'demoTrap', 'particleCannon', 'nukeSilo', 'scudStorm'];
    
    const bList = activeBuilderCategory === 'defenses'
        ? allBuildings.filter(([type]) => defenseKeys.includes(type))
        : allBuildings.filter(([type]) => !defenseKeys.includes(type));

    let html = '';
    bList.forEach(([type, name, cost]) => {
        const structReq = getStructureTechPrerequisite(type);
        const hasTech = !structReq || hasCompletedStructure(structReq.building, structReq.altBuilding);
        const canAfford = playerResources >= cost;
        const disabled = !hasTech || !canAfford;

        const initials = name.split(' ').map(w => w[0]).join('').substring(0, 3).toUpperCase();
        html += `
            <button class="bp-card-btn ${disabled ? 'disabled' : ''}" onclick="activateBlueprint('${type}')" ${disabled ? 'disabled' : ''}>
                <div class="bp-card-icon">${initials}</div>
                <div class="bp-card-info">
                    <span class="bp-card-title">${name}</span>
                    <span class="bp-card-cost">$${cost}</span>
                </div>
            </button>
        `;
    });
    container.innerHTML = html;
}


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

    // Prioritize selected structure if it can build this unit!
    let fac = null;
    if (selectedStructure && !selectedStructure.isBuilding && selectedStructure.health > 0) {
        if (spec.building === 'commandCenter' && selectedStructure.type === 'center') fac = selectedStructure;
        else if (selectedStructure.type === spec.building) fac = selectedStructure;
    }
    if (!fac) {
        fac = structures.find(s => {
            if (s.isBuilding || s.health <= 0) return false;
            if (spec.building === 'commandCenter' && s.type === 'center') return true;
            if (s.type === spec.building) return true;
            return false;
        });
    }

    if (!fac) {
        showNotification(`Production halted: No operational production facility available!`, 'error');
        return;
    }

    if (!fac.productionQueue) fac.productionQueue = [];
    if (fac.productionQueue.length >= 5) {
        showNotification('Production queue full (max 5 units).', 'warning');
        return;
    }

    playerResources -= spec.cost;
    fac.productionQueue.push({
        type: type,
        name: spec.name,
        cost: spec.cost,
        progress: 0,
        buildTime: spec.buildTime || (isInfantryType(type) ? 3.0 : 5.5)
    });

    playUSASound('radio_chirp');
    showNotification(`Queued: ${spec.name}`, 'info');
    updateSidebar();
}

function cancelQueuedItem(structure, index) {
    if (!structure || !structure.productionQueue || !structure.productionQueue[index]) return;
    const item = structure.productionQueue[index];
    playerResources += item.cost;
    structure.productionQueue.splice(index, 1);
    playUSASound('radio_chirp');
    showNotification(`Cancelled: ${item.name} (Refunded $${item.cost})`, 'info');
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

        
// =========================================================================
// SQUAD INTERACTION & GENERALS POWERS (Control Bar Pro)
// =========================================================================
function handleSquadCardClick(e, idx) {
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    const sel = units.filter(u => u.selected);
    const targetUnit = sel[idx];
    if (!targetUnit) return;

    if (e.shiftKey) {
        targetUnit.selected = false;
        if (typeof removeSelectionCircle === 'function') removeSelectionCircle(targetUnit);
    } else {
        units.forEach(u => {
            const match = (u === targetUnit);
            u.selected = match;
            if (!match && typeof removeSelectionCircle === 'function') removeSelectionCircle(u);
        });
    }
    updateSidebar();
}

let activeGeneralPower = null;

function activateGeneralsPower(powerType) {
    activeGeneralPower = powerType;
    if (powerType === 'spySatellite') {
        showNotification('USA Spy Satellite: Click on the terrain or minimap to survey target sector.', 'info');
    } else if (powerType === 'a10Strike') {
        showNotification('A-10 Thunderbolt Strike: Click ground target to order CAS air strike.', 'info');
    }
}

function executeGeneralsPowerAt(pos) {
    if (!activeGeneralPower) return false;
    const p = activeGeneralPower;
    activeGeneralPower = null;

    if (p === 'spySatellite') {
        if (typeof revealFogOfWarAt === 'function') revealFogOfWarAt(pos, 42, 1800);
        if (typeof spawnMuzzleFlash === 'function') spawnMuzzleFlash(pos, 0x00ffff, 4.0);
        if (typeof spawnLaserBeam === 'function') {
            const orbitalHigh = pos.clone().add(new THREE.Vector3(0, 50, 0));
            spawnLaserBeam(orbitalHigh, pos, 0x00ffff, 3.5);
        }
        playAudio('radio_chirp');
        showNotification('★ USA Spy Satellite online! Sector uncloaked for 30 seconds.', 'success');
        return true;
    } else if (p === 'a10Strike') {
        showNotification('★ A-10 Warthog flight inbound to target coordinates!', 'success');
        playAudio('radio_chirp');
        for (let i = 0; i < 2; i++) {
            setTimeout(() => {
                const flyStart = pos.clone().add(new THREE.Vector3(-40 + i * 8, 22, -40));
                const flyEnd = pos.clone().add(new THREE.Vector3(40 + i * 8, 22, 40));
                for (let r = 0; r < 3; r++) {
                    setTimeout(() => {
                        const rPos = flyStart.clone().lerp(flyEnd, 0.4 + r * 0.15);
                        const impact = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
                        if (typeof spawnRocketProjectile === 'function') {
                            spawnRocketProjectile(rPos, impact, true, false, {
                                attacker: units[0] || { teamId: playerTeamId },
                                target: null,
                                targetPos: impact,
                                damage: 110,
                                damageType: 'EXPLOSIVE',
                                splashRadius: 6.0
                            });
                        }
                        if (typeof playUSASound === 'function') playUSASound('missile_launch');
                    }, r * 150);
                }
            }, i * 350);
        }
        return true;
    }
    return false;
}
