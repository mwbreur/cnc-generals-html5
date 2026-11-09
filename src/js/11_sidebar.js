function getUnitInitials(type) {
    const map = {
        infantry: 'RG', rocket: 'MD', pathfinder: 'PF', burton: 'CB',
        crusader: 'CR', paladin: 'PL', humvee: 'HV', ambulance: 'AM', tomahawk: 'TM',
        chinook: 'CH', comanche: 'CM', raptor: 'RP', mig: 'MIG', stealthfighter: 'SF', aurora: 'AU',
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
        const mapSize = currentMapSize || 1500;
        const worldX = (px / radarCanvas.width - 0.5) * mapSize;
        const worldZ = (py / radarCanvas.height - 0.5) * mapSize;

        if (e.buttons === 1 || e.button === 0) {
            if (pendingSuperweapon) {
                const targetPos = new THREE.Vector3(worldX, typeof getTerrainHeight === 'function' ? getTerrainHeight(worldX, worldZ) : 0, worldZ);
                strikeWithSuperweapon(pendingSuperweapon, targetPos);
                return;
            }
            if (typeof activeGeneralPower !== 'undefined' && activeGeneralPower) {
                const targetPos = new THREE.Vector3(worldX, typeof getTerrainHeight === 'function' ? getTerrainHeight(worldX, worldZ) : 0, worldZ);
                executeGeneralsPowerAt(targetPos);
                return;
            }
            // Left-click drag: Pan camera
            cameraTarget.x = worldX;
            cameraTarget.z = worldZ;
            updateCameraPosition();
        } else if (e.button === 2 || e.buttons === 2) { // Right-click: Move order to map coordinates!
            e.preventDefault();
            const selectedList = units.filter(u => u.selected);
            if (selectedList.length > 0) {
                const targetPos = new THREE.Vector3(worldX, getTerrainHeight(worldX, worldZ), worldZ);
                if (typeof applyGroupFormationMove === 'function') {
                    applyGroupFormationMove(selectedList, targetPos);
                } else {
                    selectedList.forEach(u => {
                        u.targetPosition.copy(targetPos);
                        u.waypoints = [];
                        u.combatTarget = null;
                        u.taskState = 'Idle';
                    });
                }
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
    const mapSize = currentMapSize || 1500;
    const half = mapSize / 2;

    const hasRadar = (typeof isRadarOnline === 'function') ? isRadarOnline(selectedFaction) : true;

    // 1. Always Draw the Miniature Version of the Map Currently Being Played (Official C&C Generals Style)
    ctx.fillStyle = '#1b1610';
    ctx.fillRect(0, 0, w, h);

    const mapKey = (typeof currentMapType !== 'undefined' && currentMapType === 'desert')
        ? 'tournament_desert'
        : (typeof currentMapType !== 'undefined' ? currentMapType : 'tournament_desert');
    const offImg = window._officialMapImages && window._officialMapImages[mapKey];
    if (offImg && offImg.complete && offImg.naturalWidth > 0) {
        ctx.drawImage(offImg, 0, 0, w, h);
    } else if (window._minimapTerrainCanvas) {
        ctx.drawImage(window._minimapTerrainCanvas, 0, 0, w, h);
    }

    // 2. Subtle Fog of War tint so the full map terrain stays clearly visible while showing explored sectors
    if (typeof fogCanvas !== 'undefined' && fogCanvas) {
        ctx.save();
        ctx.globalAlpha = 0.24;
        ctx.drawImage(fogCanvas, 0, 0, w, h);
        ctx.restore();
    }

    // Transform world coord to minimap canvas coord
    const toRX = (x) => ((x + half) / mapSize) * w;
    const toRZ = (z) => ((z + half) / mapSize) * h;

    // 3. Draw Bridges
    if (mapBridges && mapBridges.length > 0) {
        ctx.strokeStyle = '#d2dae2';
        ctx.lineWidth = 2.5;
        mapBridges.forEach(b => {
            if (b.position) {
                const bx = toRX(b.position.x);
                const bz = toRZ(b.position.z);
                ctx.strokeRect(bx - 3, bz - 3, 6, 6);
            } else if (b.x1 !== undefined) {
                ctx.beginPath();
                ctx.moveTo(toRX(b.x1), toRZ(b.z1));
                ctx.lineTo(toRX(b.x2), toRZ(b.z2));
                ctx.stroke();
            }
        });
    }

    // 4. Draw Neutral Tech Structures (Oil Derricks, Hospitals, Refineries)
    if (window.neutralStructures && window.neutralStructures.length > 0) {
        window.neutralStructures.forEach(ns => {
            if (ns.health > 0 && ns.position) {
                const rx = toRX(ns.position.x);
                const rz = toRZ(ns.position.z);
                ctx.fillStyle = '#000000';
                ctx.fillRect(rx - 3, rz - 3, 6, 6);
                ctx.fillStyle = ns.capturedByTeam === playerTeamId ? '#2ecc71' : (ns.capturedByTeam ? '#e74c3c' : '#ffffff');
                ctx.fillRect(rx - 2, rz - 2, 4, 4);
            }
        });
    }

    // 5. Draw Supply Docks (Crisp Gold/Green Supply Icons)
    if (supplyPoints && supplyPoints.length > 0) {
        supplyPoints.forEach(sp => {
            if (sp.stock > 0) {
                const rx = toRX(sp.position.x);
                const rz = toRZ(sp.position.z);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
                ctx.fillRect(rx - 3.5, rz - 3.5, 7, 7);
                ctx.fillStyle = '#ffd700';
                ctx.fillRect(rx - 2.5, rz - 2.5, 5, 5);
            }
        });
    }

    // 6. Draw Friendly Structures
    structures.forEach(s => {
        if (s.health > 0) {
            const rx = toRX(s.position.x);
            const rz = toRZ(s.position.z);
            const sz = Math.max(4.5, (s.radius || 4) / mapSize * w * 2.2);
            ctx.fillStyle = '#000000';
            ctx.fillRect(rx - sz/2 - 0.5, rz - sz/2 - 0.5, sz + 1, sz + 1);
            ctx.fillStyle = '#2ecc71';
            ctx.fillRect(rx - sz/2, rz - sz/2, sz, sz);
        }
    });

    // 7. Draw Enemy & Allied AI Structures
    enemyStructures.forEach(es => {
        if (es.health > 0) {
            const isAlly = isFriendly({ teamId: playerTeamId }, es);
            if (!isAlly && es.mesh && !es.mesh.visible && !hasRadar) return;
            if (!isAlly && es.mesh && !es.mesh.visible) return;
            const rx = toRX(es.position.x);
            const rz = toRZ(es.position.z);
            const sz = Math.max(4.5, (es.radius || 4) / mapSize * w * 2.2);
            ctx.fillStyle = '#000000';
            ctx.fillRect(rx - sz/2 - 0.5, rz - sz/2 - 0.5, sz + 1, sz + 1);
            ctx.fillStyle = isAlly ? '#00cec9' : '#ff3838';
            ctx.fillRect(rx - sz/2, rz - sz/2, sz, sz);
        }
    });

    // 8. Draw Friendly Player Units
    units.forEach(u => {
        if (u.health > 0 && u.mesh && !u.garrisonedIn) {
            const rx = toRX(u.mesh.position.x);
            const rz = toRZ(u.mesh.position.z);
            ctx.fillStyle = '#000000';
            ctx.fillRect(rx - 2.5, rz - 2.5, 5, 5);
            ctx.fillStyle = u.selected ? '#ffffff' : '#55efc4';
            ctx.fillRect(rx - 1.5, rz - 1.5, 3, 3);
        }
    });

    // 9. Draw Enemy & Allied AI Units
    enemyUnits.forEach(eu => {
        if (eu.health > 0 && eu.mesh) {
            const isAlly = isFriendly({ teamId: playerTeamId }, eu);
            if (!isAlly && !eu.mesh.visible) return;
            const rx = toRX(eu.mesh.position.x);
            const rz = toRZ(eu.mesh.position.z);
            ctx.fillStyle = '#000000';
            ctx.fillRect(rx - 2.5, rz - 2.5, 5, 5);
            ctx.fillStyle = isAlly ? '#81ecec' : '#ff4757';
            ctx.fillRect(rx - 1.5, rz - 1.5, 3, 3);
        }
    });

    // 10. Draw Camera Viewport Frustum Rectangle (Classic C&C Generals White/Gold View Box)
    if (camera) {
        const camX = toRX(cameraTarget.x);
        const camZ = toRZ(cameraTarget.z);
        const viewW = (cameraRadius / mapSize) * w * 1.4;
        const viewH = (cameraRadius / mapSize) * h * 0.9;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(camX - viewW/2, camZ - viewH/2, viewW, viewH);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(camX - viewW/2, camZ - viewH/2, viewW, viewH);
    }

    // Subtle outer border frame
    ctx.strokeStyle = 'rgba(197, 185, 142, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
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

function resumeGame() {
    const menu = document.getElementById('start-menu');
    if (menu) {
        menu.style.display = 'none';
        menu.classList.remove('pause-mode');
    }
    const pauseModal = document.getElementById('ingame-pause-modal');
    if (pauseModal) pauseModal.style.display = 'none';
    const startCard = document.getElementById('start-card');
    if (startCard) startCard.style.display = 'none';
    const pauseWatermark = document.getElementById('pause-screen-watermark');
    if (pauseWatermark) pauseWatermark.style.display = 'none';
    const pauseClock = document.getElementById('pause-screen-clock');
    if (pauseClock) pauseClock.style.display = 'none';
}

function showInGamePauseModal() {
    const menu = document.getElementById('start-menu');
    const pauseModal = document.getElementById('ingame-pause-modal');
    const startCard = document.getElementById('start-card');
    const pauseWatermark = document.getElementById('pause-screen-watermark');
    const pauseClock = document.getElementById('pause-screen-clock');
    const matchClock = document.getElementById('match-clock');
    if (!menu) return;

    menu.style.display = 'flex';
    menu.classList.add('pause-mode');
    if (startCard) startCard.style.display = 'none';
    if (pauseModal) {
        pauseModal.style.display = 'flex';
        updatePauseModalPlayerList();
    }
    if (pauseWatermark) pauseWatermark.style.display = 'block';
    if (pauseClock) {
        pauseClock.style.display = 'block';
        if (matchClock) pauseClock.innerText = matchClock.innerText;
    }
}

function showStartSetupCard() {
    const menu = document.getElementById('start-menu');
    const pauseModal = document.getElementById('ingame-pause-modal');
    const startCard = document.getElementById('start-card');
    const resumeBtn = document.getElementById('resume-game-btn');
    const pauseWatermark = document.getElementById('pause-screen-watermark');
    const pauseClock = document.getElementById('pause-screen-clock');
    if (!menu) return;

    menu.style.display = 'flex';
    menu.classList.remove('pause-mode');
    if (pauseModal) pauseModal.style.display = 'none';
    if (pauseWatermark) pauseWatermark.style.display = 'none';
    if (pauseClock) pauseClock.style.display = 'none';
    if (startCard) {
        startCard.style.display = 'block';
        if (resumeBtn) {
            resumeBtn.style.display = (typeof isMatchActive !== 'undefined' && isMatchActive) ? 'block' : 'none';
        }
    }
}

function toggleInGameMenu() {
    const menu = document.getElementById('start-menu');
    if (!menu) return;
    const isVisible = menu.style.display !== 'none';
    if (isVisible) {
        resumeGame();
    } else {
        if (typeof isMatchActive !== 'undefined' && isMatchActive) {
            showInGamePauseModal();
        } else {
            showStartSetupCard();
        }
    }
}

function updatePauseModalPlayerList() {
    const listBody = document.getElementById('pause-players-list');
    if (!listBody) return;

    const slots = (typeof isMultiplayerActive !== 'undefined' && isMultiplayerActive) ? (window.mpSlots || []) : (window.spSlots || []);
    const activeSlots = slots.filter(s => s && s.active);

    let html = '';
    activeSlots.forEach(s => {
        let isAlive = true;
        if (s.isPlayer) {
            const hasAliveStruct = typeof structures !== 'undefined' && structures.some(st => st.health > 0);
            const hasAliveUnit = typeof units !== 'undefined' && units.some(u => u.health > 0);
            isAlive = hasAliveStruct || hasAliveUnit;
        } else {
            const ownerId = 'ai_' + s.id;
            const hasAliveStruct = typeof enemyStructures !== 'undefined' && enemyStructures.some(st => (st.ownerId === ownerId || st.teamId === s.team) && st.health > 0);
            const hasAliveUnit = typeof enemyUnits !== 'undefined' && enemyUnits.some(u => (u.ownerId === ownerId || u.teamId === s.team) && u.health > 0);
            isAlive = hasAliveStruct || hasAliveUnit;
        }

        const teamLabel = s.team ? `Team ${s.team}` : 'None';
        const armyLabel = (s.faction || 'USA').toUpperCase();
        const statusHtml = isAlive ? `<span style="color:#2ed573; font-weight:bold;">Playing</span>` : `<span style="color:#ff4757; font-weight:bold;">Defeated</span>`;
        const nameColor = s.isPlayer ? '#2ed573' : (isFriendly(s, { teamId: (typeof playerTeamId !== 'undefined' ? playerTeamId : 1) }) ? '#2ed573' : '#ced6e0');
        const armyColor = s.isPlayer ? '#2ed573' : '#ced6e0';

        html += `<tr>
            <td style="text-align:center;"><input type="checkbox" style="cursor:pointer;" title="Mute Tactical Audio"></td>
            <td style="color:${nameColor}; font-weight:bold;">${s.name || 'Commander'}</td>
            <td style="color:${armyColor}; font-weight:600;">${armyLabel}</td>
            <td style="color:#a4b0be;">${teamLabel}</td>
            <td>${statusHtml}</td>
        </tr>`;
    });

    listBody.innerHTML = html;
}

function restartCurrentMatch() {
    resumeGame();
    if (typeof startGame === 'function') {
        startGame();
        if (typeof showNotification === 'function') showNotification('Restarting Skirmish battle...', 'info');
    }
}

function openSkirmishSetupFromGame() {
    showStartSetupCard();
}

function surrenderMatch() {
    if (typeof isMatchActive !== 'undefined') isMatchActive = false;
    if (typeof isMultiplayerActive !== 'undefined' && isMultiplayerActive) {
        if (typeof isMultiplayerHost !== 'undefined' && isMultiplayerHost) {
            if (typeof broadcastNetPacket === 'function') {
                broadcastNetPacket({ type: 'host_left', message: 'Host commander surrendered and left the match.' });
            }
        } else {
            if (typeof broadcastNetPacket === 'function') {
                broadcastNetPacket({ type: 'client_left', message: 'Challenger surrendered and left the match.' });
            }
        }
    }
    resumeGame();
    if (typeof showNotification === 'function') showNotification('MISSION TERMINATED: Tactical forces ordered to surrender.', 'error');
    const ticker = document.getElementById('tactical-message');
    if (ticker) ticker.innerHTML = '<strong style="color:#ff4757;">SURRENDER: Operational theater yielded.</strong>';
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
    const usaDroneVehicles = ['tank', 'crusader', 'paladin', 'humvee', 'ambulance', 'tomahawk'];
    const selectedVehicles = units.filter(u => u.selected && usaDroneVehicles.includes(u.type));
    if (selectedVehicles.length === 0) {
        showNotification('Select a USA Vehicle (Crusader, Paladin, Humvee, Ambulance, or Tomahawk) first.', 'error');
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

function unloadTransportPassengers(transport) {
    const targets = transport ? [transport] : units.filter(u => u.selected && u.garrisoned && u.garrisoned.length > 0);
    let count = 0;
    targets.forEach(t => {
        if (!t.garrisoned || t.garrisoned.length === 0) return;
        const passengers = t.garrisoned.slice();
        t.garrisoned = [];
        passengers.forEach((p, idx) => {
            p.garrisonedIn = null;
            const angle = (idx / Math.max(1, passengers.length)) * Math.PI * 2;
            const dropPos = t.mesh.position.clone().add(new THREE.Vector3(Math.cos(angle) * (t.radius + 1.8), 0, Math.sin(angle) * (t.radius + 1.8)));
            dropPos.y = typeof getTerrainHeight === 'function' ? getTerrainHeight(dropPos.x, dropPos.z) : 0;
            p.mesh.position.copy(dropPos);
            p.targetPosition.copy(dropPos);
            p.mesh.visible = true;
            count++;
        });
    });
    if (count > 0) {
        playAudio('click');
        showNotification(`Disembarked ${count} passenger(s)!`, 'info');
        updateSidebar();
    }
}

function triggerHeroOrUnitAbility(unit, abilityType) {
    if (!unit || unit.health <= 0) return;
    if (abilityType === 'c4') {
        const allHostile = [...enemyStructures, ...enemyUnits].filter(e => e.health > 0);
        let nearest = null, bestD = 16;
        allHostile.forEach(e => {
            const p = e.position || (e.mesh && e.mesh.position);
            if (!p) return;
            const d = unit.mesh.position.distanceTo(p);
            if (d < bestD) { bestD = d; nearest = e; }
        });
        if (!nearest) {
            showNotification('Move Col. Burton closer to an enemy structure or vehicle to plant C4!', 'error');
            return;
        }
        const tPos = (nearest.position || nearest.mesh.position).clone();
        showNotification('Col. Burton planted Timed C4 Charge! Detonation in 2s...', 'warning');
        setTimeout(() => {
            if (nearest && nearest.health > 0) {
                spawnExplosion(tPos, 0xff4757);
                if (typeof triggerScreenShake === 'function') triggerScreenShake(1.0);
                applyCalculatedDamage(unit, nearest, 450, 'EXPLOSIVE');
            }
        }, 2000);
    } else if (abilityType === 'snipeDriver') {
        const enemyVehicles = enemyUnits.filter(e => e.health > 0 && !e.isAir && !e.isUnmanned && typeof isInfantryType === 'function' && !isInfantryType(e.type));
        let nearest = null, bestD = 36;
        enemyVehicles.forEach(e => {
            const d = unit.mesh.position.distanceTo(e.mesh.position);
            if (d < bestD) { bestD = d; nearest = e; }
        });
        if (!nearest) {
            showNotification('No enemy ground vehicle within Jarmen Kell snipe range!', 'error');
            return;
        }
        spawnLaserBeam(unit.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)), nearest.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 0xffffff, 4);
        nearest.isUnmanned = true;
        nearest.disabledUntil = (typeof buildingTick !== 'undefined' ? buildingTick : 0) + 999999;
        nearest.combatTarget = null;
        showNotification(`Jarmen Kell sniped the driver of ${nearest.type.toUpperCase()}! Send any infantry to capture it!`, 'success');
    } else if (abilityType === 'lotusHack') {
        const allHostile = [...enemyStructures, ...enemyUnits].filter(e => e.health > 0);
        let nearest = null, bestD = 26;
        allHostile.forEach(e => {
            const p = e.position || (e.mesh && e.mesh.position);
            if (!p) return;
            const d = unit.mesh.position.distanceTo(p);
            if (d < bestD) { bestD = d; nearest = e; }
        });
        if (!nearest) {
            showNotification('Move Black Lotus within range of an enemy structure or vehicle!', 'error');
            return;
        }
        unit.combatTarget = nearest;
        showNotification(`Black Lotus initiating cyber-link on ${nearest.type.toUpperCase()}...`, 'info');
    } else if (abilityType === 'detonate') {
        const pos = unit.mesh.position.clone();
        const isBio = unit.bioBomb;
        const dmg = (unit.type === 'bombtruck' ? (unit.highExplosive ? 480 : 340) : 220);
        const rad = (unit.type === 'bombtruck' ? (unit.highExplosive ? 16 : 12) : 8);
        spawnExplosion(pos, isBio ? 0x2ecc71 : 0xff4757);
        if (isBio && typeof spawnLingeringToxinCloud === 'function') spawnLingeringToxinCloud(pos);
        if (typeof triggerScreenShake === 'function') triggerScreenShake(unit.type === 'bombtruck' ? 1.3 : 0.7);
        [...enemyUnits, ...enemyStructures].forEach(e => {
            const ep = e.position || (e.mesh && e.mesh.position);
            if (ep && ep.distanceTo(pos) <= rad) {
                applyCalculatedDamage(unit, e, dmg, isBio ? 'TOXIN' : 'EXPLOSIVE');
            }
        });
        unit.health = 0;
    } else if (abilityType === 'flameWall') {
        const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), unit.mesh.rotation.y);
        for (let i = -2; i <= 2; i++) {
            const fPos = unit.mesh.position.clone().add(forward.clone().multiplyScalar(10)).add(new THREE.Vector3(i * 3.5, 0, 0));
            if (typeof spawnFlamethrowerBurst === 'function') spawnFlamethrowerBurst(unit.mesh.position.clone(), fPos);
            if (typeof spawnNapalmScorchPool === 'function') spawnNapalmScorchPool(fPos);
        }
        [...enemyUnits, ...enemyStructures].forEach(e => {
            const ep = e.position || (e.mesh && e.mesh.position);
            if (ep && ep.distanceTo(unit.mesh.position) <= 16) {
                applyCalculatedDamage(unit, e, 55, 'FLAME');
            }
        });
        showNotification('Dragon Tank unleashed Flame Wall!', 'warning');
    }
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
    const nukeCannons = units.filter(u => u.selected && (u.type === 'nukecannon' || u.type === 'nuketank'));
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
function applyOfficialMenuArt(facOverride) {
    const ui = window.OFFICIAL_UI_ASSETS;
    if (!ui || typeof document === 'undefined') return;
    const fac = facOverride || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa');

    const startCard = document.getElementById('start-card');
    if (startCard && ui.mainMenuBackdrop) {
        startCard.style.backgroundImage = `linear-gradient(180deg, rgba(10, 16, 13, 0.88) 0%, rgba(8, 12, 10, 0.92) 100%), url("${ui.mainMenuBackdrop}")`;
        startCard.style.backgroundSize = 'cover';
        startCard.style.backgroundPosition = 'center';
    }

    const setImg = (id, src) => {
        const el = document.getElementById(id);
        if (el && src) {
            if (el.src !== src) el.src = src;
            el.style.display = '';
        }
    };
    setImg('menu-skirmish-emblem', ui.skirmishEmblem);
    setImg('menu-ruler-img', ui.mainMenuRuler);
    setImg('menu-faction-crest', ui['logo_' + fac] || ui.logo_usa);
    setImg('fc-logo-usa', ui.logo_usa);
    setImg('fc-logo-china', ui.logo_china);
    setImg('fc-logo-gla', ui.logo_gla);
    setImg('hud-faction-emblem', ui['hud_logo_' + fac] || ui['mini_logo_' + fac]);
    setImg('cb-general-btn-img', ui['gen_btn_' + fac] || ui.gen_btn_usa);
    setImg('victory-banner-img', ui.banner_victory);
    setImg('victory-rank-badge', ui['rank_general_' + fac] || ui.rank_general_usa);
    setImg('defeat-banner-img', ui.banner_defeat);

    // Update General Powers Bar cameos according to active faction
    const gpBar = document.getElementById('general-powers-bar');
    if (gpBar && window.OFFICIAL_CAMEOS) {
        const gpSpec = fac === 'china'
            ? [
                { id: 'gp-spy-satellite', power: 'artilleryBarrage', cameo: 'artilleryBarrage', label: 'BARRAGE', title: 'Red Army 152mm Artillery Barrage' },
                { id: 'gp-a10-strike', power: 'a10Strike', cameo: 'carpetBomb', label: 'BOMBERS', title: 'PLA Tactical Bomber Strike' }
              ]
            : fac === 'gla'
            ? [
                { id: 'gp-spy-satellite', power: 'rebelAmbush', cameo: 'rebelAmbush', label: 'AMBUSH', title: 'GLA Rebel Ambush Cell' },
                { id: 'gp-a10-strike', power: 'artilleryBarrage', cameo: 'anthraxBomb', label: 'BOMBARD', title: 'GLA Rocket Bombardment' }
              ]
            : [
                { id: 'gp-spy-satellite', power: 'spySatellite', cameo: 'spySatellite', label: 'SATELLITE', title: 'USA Spy Satellite Scan' },
                { id: 'gp-a10-strike', power: 'a10Strike', cameo: 'a10Strike', label: 'A-10 CAS', title: 'A-10 Thunderbolt CAS Strike' }
              ];
        gpSpec.forEach(g => {
            const btn = document.getElementById(g.id);
            const cSrc = window.OFFICIAL_CAMEOS[g.cameo];
            if (btn && cSrc) {
                btn.title = g.title;
                btn.setAttribute('onclick', `activateGeneralsPower('${g.power}')`);
                btn.innerHTML = `<img src="${cSrc}" class="gp-cameo-img" alt="${g.label}" /><span class="gp-label">${g.label}</span>`;
            }
        });
    }
}
window.applyOfficialMenuArt = applyOfficialMenuArt;
if (typeof window !== 'undefined') {
    setTimeout(() => applyOfficialMenuArt(), 0);
}

function updateSidebar() {
    if (!radarCanvas) initRadarMinimap();
    applyOfficialMenuArt(selectedFaction);

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
            scorpion: '🦂', marauder: '🛞', technical: '🛻', quad: '⚡', buggy: '🚀', toxintractor: '☣️', scud: '🚀',
            dozer: '🚜', worker: '👷'
        };
        const uIcon = icons[u.type] || '🎖️';

        let headerRightTag = `<span class="inspector-kills-tag">★ ${u.kills || 0} KILLS</span>`;
        if (u.type === 'dozer' || u.type === 'worker') {
            const myTeam = (typeof playerTeamId !== 'undefined' ? playerTeamId : 1);
            const myBuilders = units.filter(b => (b.type === 'dozer' || b.type === 'worker') && b.health > 0 && !b.isDead && (typeof b.teamId === 'undefined' || b.teamId === myTeam));
            if (myBuilders.length > 1) {
                const bIdx = myBuilders.indexOf(u);
                headerRightTag = `<button class="quick-army-btn" style="padding: 2px 7px; font-size: 10px; margin: 0;" onclick="cycleSelectBuilder()" title="Cycle to next builder (Hotkeys: D or Ctrl+Arrow)">↻ NEXT (${bIdx + 1}/${myBuilders.length})</button>`;
            }
        }

        const unitCameoHtml = getCameoImg(u.type, spec.name, selectedFaction) || `<div class="inspector-avatar-icon">${uIcon}</div>`;

        inspector.innerHTML = `
            <div class="inspector-card">
                <div class="inspector-avatar-box">
                    ${unitCameoHtml}
                    <div class="inspector-rank-badge ${rankClass}">${rankTitle}</div>
                </div>
                <div class="inspector-info-pane">
                    <div class="inspector-header-row">
                        <span class="inspector-title">${spec.name}</span>
                        ${headerRightTag}
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
            if (u.type === 'worker') {
                currentGridSlots[9] = {
                    id: 'harvest',
                    name: 'HARVEST',
                    badge: 'GATHER',
                    disabled: false,
                    action: () => orderSelectedHarvestersToGather(),
                    desc: 'Dispatch Worker to gather supplies from Supply Stash / Dock'
                };
            }
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

        // Vehicle Upgrades, Drones & Special Unit Abilities
        if (['tank', 'crusader', 'paladin', 'humvee', 'ambulance', 'tomahawk'].includes(u.type)) {
            const activeDrone = u.drone ? u.drone.type : null;
            currentGridSlots.push(
                { name: 'BATTLE DRONE', cost: 300, badge: activeDrone === 'battle' ? 'ACTIVE' : 'DRONE', action: () => purchaseVehicleDrone('battle', 300), desc: 'Orbiting combat & repair drone: MG suppresses infantry, PDL intercepts missiles, repairs hull (+5 HP/s)' },
                { name: 'SCOUT DRONE', cost: 100, badge: activeDrone === 'scout' ? 'ACTIVE' : 'VISION', action: () => purchaseVehicleDrone('scout', 100), desc: '+50% Sight/Scan range & detects stealth units/mines' },
                { name: 'HELLFIRE DRONE', cost: 500, badge: activeDrone === 'hellfire' ? 'ACTIVE' : 'MISSILE', action: () => purchaseVehicleDrone('hellfire', 500), desc: 'Launches guided armor-piercing Hellfire missiles at vehicles & structures' }
            );
        } else if (u.type === 'overlord') {
            currentGridSlots.push(
                { name: 'BUNKER TOWER', cost: 500, badge: u.overlordUpgrade === 'bunker' ? 'ACTIVE' : 'TOWER', action: () => purchaseOverlordUpgrade('bunker', 500), desc: 'Garrison bunker pillbox for up to 5 troops firing 360°' },
                { name: 'GATLING TOWER', cost: 1200, badge: u.overlordUpgrade === 'gatling' ? 'ACTIVE' : 'TOWER', action: () => purchaseOverlordUpgrade('gatling', 1200), desc: 'Twin 20mm rotary anti-air/anti-infantry turret & stealth detection' },
                { name: 'PROPAGANDA', cost: 500, badge: u.overlordUpgrade === 'propaganda' ? 'ACTIVE' : 'TOWER', action: () => purchaseOverlordUpgrade('propaganda', 500), desc: 'Heals friendly armor (+4 HP/s) & buffs fire rate +25%' }
            );
        } else if (u.type === 'nukecannon' || u.type === 'nuketank') {
            currentGridSlots.push(
                { name: 'OUTRIGGERS', badge: 'DEPLOY', action: () => deployNukeCannonOutriggers(u), desc: 'Deploy hydraulic stabilization legs for siege artillery' },
                { name: 'NEUTRON SHELLS', cost: 1000, badge: u.neutronShells ? 'ACTIVE' : 'UPGRADE', action: () => purchaseNukeCannonUpgrade(1000), desc: 'Eliminates vehicle crews and leaves radiation' }
            );
        } else if (u.type === 'truck' || u.type === 'chinook') {
            currentGridSlots.push(
                { name: 'HARVEST', badge: 'GATHER', action: () => orderSelectedHarvestersToGather(), desc: 'Dispatch to nearest supply depot' }
            );
        } else if (u.type === 'burton') {
            currentGridSlots.push(
                { name: 'TIMED C4', badge: 'DEMO', action: () => triggerHeroOrUnitAbility(u, 'c4'), desc: 'Plant Timed C4 Charge on nearest enemy structure or vehicle (450 Demo Damage)' }
            );
        } else if (u.type === 'jarmen') {
            currentGridSlots.push(
                { name: 'SNIPE DRIVER', badge: 'SNIPE', action: () => triggerHeroOrUnitAbility(u, 'snipeDriver'), desc: 'Eliminate enemy vehicle driver so any friendly infantry can capture it' }
            );
        } else if (u.type === 'blacklotus') {
            currentGridSlots.push(
                { name: 'CYBER HACK', badge: 'HACK', action: () => triggerHeroOrUnitAbility(u, 'lotusHack'), desc: 'Capture building, steal $1000 from Supply Center, or disable enemy vehicle' }
            );
        } else if (u.type === 'terrorist' || u.type === 'bombtruck') {
            currentGridSlots.push(
                { name: 'DETONATE', badge: 'BOOM', action: () => triggerHeroOrUnitAbility(u, 'detonate'), desc: 'Detonate explosive payload immediately' }
            );
            if (u.type === 'bombtruck') {
                currentGridSlots.push(
                    { name: 'HIGH EXPLOSIVE', cost: 500, badge: u.highExplosive ? 'ACTIVE' : 'UPGRADE', action: () => { if (playerResources >= 500 && !u.highExplosive) { playerResources -= 500; u.highExplosive = true; showNotification('High-Explosive payload installed on Bomb Truck!', 'success'); updateSidebar(); } }, desc: 'Boosts blast damage and radius by +40%' },
                    { name: 'BIO-BOMB', cost: 500, badge: u.bioBomb ? 'ACTIVE' : 'TOXIN', action: () => { if (playerResources >= 500 && !u.bioBomb) { playerResources -= 500; u.bioBomb = true; showNotification('Anthrax Bio-Bomb payload installed on Bomb Truck!', 'success'); updateSidebar(); } }, desc: 'Releases lethal Anthrax toxin cloud on detonation' }
                );
            }
        } else if (u.type === 'dragon' || u.type === 'dragonTank') {
            currentGridSlots.push(
                { name: 'FLAME WALL', badge: 'FIRESTORM', action: () => triggerHeroOrUnitAbility(u, 'flameWall'), desc: 'Unleash a sweeping arc of napalm fire across the front sector' }
            );
        }
        if (u.capacity > 0 && u.garrisoned && u.garrisoned.length > 0) {
            currentGridSlots.push(
                { name: `EVACUATE (${u.garrisoned.length})`, badge: 'UNLOAD', action: () => unloadTransportPassengers(u), desc: 'Disembark all embarked passengers immediately' }
            );
        }
    } else {
        // Multi-Unit Squad (Control Bar Pro Layout matching screenshot!)
        const totalHP = selectedUnits.reduce((a, u) => a + u.health, 0);
        const maxHP = selectedUnits.reduce((a, u) => a + u.maxHealth, 0);
        const hpPct = Math.max(0, Math.min(100, Math.round((totalHP / maxHP) * 100)));
        const totalKills = selectedUnits.reduce((a, u) => a + (u.kills || 0), 0);

        // Official Faction Watermark from WindowZH.big / SCLogosUserInterface512 (or fallback SVG)
        const officialWatermarkSrc = window.OFFICIAL_UI_ASSETS && window.OFFICIAL_UI_ASSETS['watermark_' + selectedFaction];
        const watermarkSVGs = {
            usa: `<svg viewBox="0 0 100 100" class="cb-watermark-svg"><path d="M50 15 L62 38 L88 38 L68 54 L75 80 L50 64 L25 80 L32 54 L12 38 L38 38 Z" fill="rgba(0,255,204,0.14)"/></svg>`,
            china: `<svg viewBox="0 0 100 100" class="cb-watermark-svg"><polygon points="50,15 62,38 88,38 68,54 75,80 50,64 25,80 32,54 12,38 38,38" fill="rgba(255,71,87,0.14)"/></svg>`,
            gla: `<svg viewBox="0 0 100 100" class="cb-watermark-svg"><path d="M25 75 Q50 20 75 75 Z" fill="rgba(255,165,2,0.14)"/></svg>`
        };
        const watermark = officialWatermarkSrc
            ? `<img src="${officialWatermarkSrc}" class="cb-watermark-svg" alt="" style="object-fit:contain;" />`
            : (watermarkSVGs[selectedFaction] || watermarkSVGs.usa);

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
                        ${getCameoImg(u.type, u.type, selectedFaction) || getCameoSVG(u.type, selectedFaction, u.type)}
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

    // Friendly players cannot interact with their allies' buildings
    if (structure.ownerId && structure.ownerId !== 'player') {
        const teamLabel = structure.teamId ? `Team ${structure.teamId}` : 'Allied Forces';
        inspector.innerHTML = `
            <div class="cb-inspector-pane">
                <div class="inspector-card">
                    <div class="inspector-info-pane" style="width: 100%;">
                        <div class="inspector-header-row">
                            <span class="inspector-title" style="color: #00cec9;">[ALLIED] ${title}</span>
                            <span class="inspector-kills-tag" style="color: #00cec9;">● ALLY</span>
                        </div>
                        <div class="inspector-sub-role">${teamLabel} • Commanded by Ally</div>
                        <div class="inspector-hp-box">
                            <div class="inspector-hp-label">
                                <span>STRUCTURAL INTEGRITY</span>
                                <span>${Math.ceil(structure.health)} / ${structure.maxHealth} HP</span>
                            </div>
                            <div class="inspector-hp-track">
                                <div class="inspector-hp-fill high" style="width: ${hpPct}%;"></div>
                            </div>
                        </div>
                        <div style="font-size: 11px; color: #a4b0be; margin-top: 8px; font-style: italic;">
                            ⚠️ Allied Command Protocol: Friendly players cannot interact with or command allied facilities.
                        </div>
                    </div>
                </div>
            </div>
        `;
        currentGridSlots = new Array(12).fill(null);
        return;
    }

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

    const structCameoHtml = getCameoImg(structure.type, title, selectedFaction) || getCameoSVG(structure.type, selectedFaction, title);

    inspector.innerHTML = `
        <div class="cb-inspector-pane">
            ${queueHtml}
            <div class="inspector-card">
                <div class="inspector-avatar-box">
                    ${structCameoHtml}
                    <div class="inspector-rank-badge rank-regular">${selectedFaction.toUpperCase()}</div>
                </div>
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

    const lookupKey = structure.type === 'center' ? 'commandCenter' : structure.type;
    const factionUpgs = (buildingUpgradesCatalog && buildingUpgradesCatalog[selectedFaction] && 
        (buildingUpgradesCatalog[selectedFaction][structure.type] || buildingUpgradesCatalog[selectedFaction][lookupKey])) || [];

    if (producers.length > 0) {
        let uIdx = 0;
        // Populate first 5 units into Row 1 (slots 0..4)
        for (; uIdx < Math.min(5, producers.length); uIdx++) {
            const [type, spec] = producers[uIdx];
            const techReq = getUnitTechPrerequisite(type);
            const hasTech = !techReq || structures.some(s => s.type === techReq.building && !s.isBuilding && s.health > 0);
            const canAfford = playerResources >= spec.cost;
            let badge = hasTech ? (canAfford ? 'READY' : 'FUNDS') : 'LOCKED';
            currentGridSlots[uIdx] = {
                id: type,
                name: spec.name.toUpperCase(),
                cost: spec.cost,
                badge: badge,
                disabled: !hasTech || !canAfford || isConstructing,
                action: () => produceUnit(type),
                desc: spec.role || 'Combat Unit'
            };
        }

        // Slot 5 (Top-Right): RALLY POINT
        currentGridSlots[5] = {
            id: 'rally',
            name: 'SET RALLY',
            cost: '',
            badge: 'RALLY 🚩',
            disabled: isConstructing,
            action: () => triggerRallyPointMode(),
            desc: 'Set unit deployment rally point'
        };

        // Row 2 (slots 6..10): Overflow units from index 5 onward + building upgrades
        let slotPos = 6;
        for (; uIdx < producers.length && slotPos < 11; uIdx++, slotPos++) {
            const [type, spec] = producers[uIdx];
            const techReq = getUnitTechPrerequisite(type);
            const hasTech = !techReq || structures.some(s => s.type === techReq.building && !s.isBuilding && s.health > 0);
            const canAfford = playerResources >= spec.cost;
            let badge = hasTech ? (canAfford ? 'READY' : 'FUNDS') : 'LOCKED';
            currentGridSlots[slotPos] = {
                id: type,
                name: spec.name.toUpperCase(),
                cost: spec.cost,
                badge: badge,
                disabled: !hasTech || !canAfford || isConstructing,
                action: () => produceUnit(type),
                desc: spec.role || 'Combat Unit'
            };
        }

        // Upgrades for this unit-producing building in remaining slots on Row 2
        let upgIdx = 0;
        for (; slotPos < 11 && upgIdx < factionUpgs.length; slotPos++, upgIdx++) {
            assignUpgradeToSlot(slotPos, factionUpgs[upgIdx], structure, isConstructing);
        }
    } else {
        // Non-unit producing structure: All slots 0..10 available for upgrades, stances, and abilities!
        factionUpgs.slice(0, 11).forEach((upg, idx) => {
            assignUpgradeToSlot(idx, upg, structure, isConstructing);
        });
    }

    // Slot 11 (Bottom-Right): SELL STRUCTURE
    currentGridSlots[11] = {
        id: 'sell',
        name: 'SELL ($)',
        cost: '',
        badge: 'SELL 💰',
        disabled: false,
        action: () => sellStructure(selectedStructure),
        desc: 'Demolish structure for 50% refund'
    };
}

function assignUpgradeToSlot(slotIndex, upg, structure, isConstructing) {
    let badge = 'UPG';
    let disabled = false;
    let costStr = (upg.cost !== undefined && upg.cost > 0) ? upg.cost : '';

    if (upg.isStance) {
        const isCurrent = (typeof battlePlan !== 'undefined' && battlePlan === upg.stance);
        badge = isCurrent ? 'ACTIVE' : 'STANCE';
        disabled = isConstructing;
        costStr = '';
    } else if (upg.isToggle) {
        const isOvercharged = !!structure.overcharged;
        badge = isOvercharged ? 'ACTIVE' : 'TOGGLE';
        disabled = isConstructing;
        costStr = '';
    } else if (upg.isAddon) {
        let isInstalled = false;
        if (upg.id === 'controlRods') isInstalled = !!structure.powerUpgraded;
        else if (upg.id === 'mines') isInstalled = !!structure.hasMines;
        else if (upg.id === 'neutronMines') isInstalled = !!structure.hasNeutronMines;
        else if (upg.id === 'camoNetting') isInstalled = !!structure.hasCamoNetting;
        else if (upg.id === 'upgradeToReal') isInstalled = (structure.type !== 'fakeBarracks' && structure.type !== 'fakeArmsDealer');

        if (isInstalled) {
            badge = 'INSTALLED';
            disabled = true;
        } else {
            const canAfford = playerResources >= upg.cost;
            badge = canAfford ? 'READY' : 'FUNDS';
            disabled = !canAfford || isConstructing;
        }
    } else if (upg.isSuperweapon || upg.id === 'superweapon') {
        const onCooldown = structure.cooldownUntil && (typeof buildingTick !== 'undefined') && buildingTick < structure.cooldownUntil;
        if (isConstructing) {
            badge = 'BUILDING';
            disabled = true;
        } else if (onCooldown) {
            const secsLeft = Math.ceil((structure.cooldownUntil - buildingTick) / 60);
            badge = `${secsLeft}s ⏱`;
            disabled = true;
        } else {
            badge = 'READY ⚡';
            disabled = false;
        }
        costStr = 'LAUNCH';
    } else if (upg.isAbility) {
        const onCooldown = structure.abilityCooldownUntil && (typeof buildingTick !== 'undefined') && buildingTick < structure.abilityCooldownUntil;
        const canAfford = playerResources >= upg.cost;
        badge = onCooldown ? 'RELOAD' : (canAfford ? 'READY' : 'FUNDS');
        disabled = !canAfford || onCooldown || isConstructing;
    } else {
        // Global tech research
        const isResearched = (typeof researchedTechs !== 'undefined' && researchedTechs.has(upg.id));
        if (isResearched) {
            badge = 'DONE';
            disabled = true;
        } else {
            const canAfford = playerResources >= upg.cost;
            badge = canAfford ? 'UPG' : 'FUNDS';
            disabled = !canAfford || isConstructing;
        }
    }

    currentGridSlots[slotIndex] = {
        id: upg.id,
        name: upg.name,
        cost: costStr,
        badge: badge,
        disabled: disabled,
        action: () => executeStructureUpgradeOrAction(upg, structure),
        desc: upg.desc
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
    const officialCrestImg = window.OFFICIAL_UI_ASSETS && window.OFFICIAL_UI_ASSETS['logo_' + selectedFaction];
    const crestVisual = officialCrestImg
        ? `<img src="${officialCrestImg}" alt="${selectedFaction}" style="width:42px;height:42px;object-fit:contain;" />`
        : crest.icon;

    inspector.innerHTML = `
        <div class="inspector-idle-box">
            <div class="inspector-idle-crest">
                <div class="crest-icon">${crestVisual}</div>
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
                <button class="quick-army-btn" onclick="cycleSelectBuilder()" title="Cycle construction units (Hotkeys: D or Ctrl+Arrow)">🔨 Builders (${builderCount})</button>
            </div>
        </div>
    `;

    // 3x4 Grid based on active category
    if (activeGridCategory === 'commands') {
        currentGridSlots = [
            { name: 'ALL COMBAT', badge: 'SEL', action: () => selectUnitsByType('combat'), desc: 'Select all battle units' },
            { name: 'HARVESTERS', badge: 'SEL', action: () => selectUnitsByType('harvesters'), desc: 'Select all supply trucks and workers' },
            { name: 'BUILDERS', badge: 'CYCLE', action: () => cycleSelectBuilder(), desc: 'Cycle through construction dozers / workers' },
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

    // --- UPGRADES & STANCES CAMEO ICONS ---
    if (key.includes('bombard')) {
        return wrap(`
            <circle cx="32" cy="21" r="13" stroke="#e74c3c" stroke-width="1.5" stroke-dasharray="4,2"/>
            <line x1="32" y1="5" x2="32" y2="37" stroke="#e74c3c" stroke-width="1.2"/>
            <line x1="16" y1="21" x2="48" y2="21" stroke="#e74c3c" stroke-width="1.2"/>
            <polygon points="32,13 36,25 28,25" fill="#ff4757"/>
            <circle cx="32" cy="21" r="2.5" fill="#f1c40f"/>
        `);
    }
    if (key.includes('hold')) {
        return wrap(`
            <path d="M32 7 L47 12 C47 25 39 33 32 37 C25 33 17 25 17 12 Z" fill="#1b2a4a" stroke="#00d2d3" stroke-width="1.5"/>
            <path d="M32 11 L43 15 C43 24 37 30 32 33 C27 30 21 24 21 15 Z" fill="#0f1929"/>
            <rect x="29" y="16" width="6" height="12" rx="1" fill="#00d2d3"/>
            <line x1="26" y1="22" x2="38" y2="22" stroke="#00d2d3" stroke-width="2"/>
        `);
    }
    if (key.includes('search')) {
        return wrap(`
            <circle cx="32" cy="21" r="14" fill="#0c1815" stroke="#10ac84" stroke-width="1.5"/>
            <path d="M32 21 L43 11 A14 14 0 0 1 46 21 Z" fill="#1dd1a1" opacity="0.45"/>
            <circle cx="32" cy="21" r="8" stroke="#10ac84" stroke-width="1" stroke-dasharray="2,2"/>
            <circle cx="32" cy="21" r="2.5" fill="#1dd1a1"/>
        `);
    }
    if (key.includes('controlrod') || key.includes('upgradePower')) {
        return wrap(`
            <rect x="18" y="8" width="8" height="26" rx="2" fill="#0abde3" stroke="#48dbfb" stroke-width="1"/>
            <rect x="38" y="8" width="8" height="26" rx="2" fill="#0abde3" stroke="#48dbfb" stroke-width="1"/>
            <path d="M26 16 L38 22 M26 26 L38 18" stroke="#feca57" stroke-width="1.8"/>
            <circle cx="32" cy="21" r="3.5" fill="#ff9ff3"/>
        `);
    }
    if (key.includes('overcharge')) {
        return wrap(`
            <polygon points="32,7 48,34 16,34" fill="#222" stroke="#f39c12" stroke-width="2"/>
            <circle cx="32" cy="22" r="3" fill="#f1c40f"/>
            <path d="M32 12 L35 18 L29 18 Z M23 27 L28 23 L25 31 Z M41 27 L36 23 L39 31 Z" fill="#f39c12"/>
        `);
    }
    if (key.includes('mine')) {
        const isNeutron = key.includes('neutron');
        return wrap(`
            <polygon points="32,8 50,33 14,33" fill="#2c2c2c" stroke="${isNeutron ? '#00f2fe' : '#e74c3c'}" stroke-width="1.8"/>
            <circle cx="32" cy="23" r="5" fill="${isNeutron ? '#00f2fe' : '#e74c3c'}"/>
            <rect x="30" y="15" width="4" height="2" fill="#fff"/>
            <circle cx="32" cy="30" r="1.5" fill="#f1c40f"/>
        `);
    }
    if (key.includes('camonetting') || key.includes('camouflage')) {
        return wrap(`
            <path d="M12 28 Q32 10 52 28 L48 35 Q32 24 16 35 Z" fill="#3b4d28" stroke="#78e08f" stroke-width="1.2"/>
            <path d="M20 18 L44 30 M24 30 L40 18" stroke="#222f3e" stroke-width="1" stroke-dasharray="2,2"/>
            <circle cx="32" cy="18" r="2.5" fill="#78e08f"/>
        `);
    }
    if (key.includes('upgradetoreal')) {
        return wrap(`
            <rect x="18" y="14" width="28" height="20" rx="2" fill="#2c3e50" stroke="#f1c40f" stroke-width="1.5"/>
            <polygon points="16,14 32,5 48,14" fill="#d35400"/>
            <path d="M28 26 L36 18 M36 18 L36 24 M36 18 L30 18" stroke="#2ecc71" stroke-width="2"/>
        `);
    }
    if (key.includes('spydrone') || key.includes('radarvanscan') || key.includes('radar')) {
        return wrap(`
            <circle cx="32" cy="20" r="12" fill="#1b262c" stroke="#3282b8" stroke-width="1.5"/>
            <ellipse cx="32" cy="20" rx="9" ry="4" stroke="#00d2d3" stroke-width="1.2"/>
            <circle cx="32" cy="20" r="3" fill="#00f2fe"/>
            <line x1="32" y1="8" x2="32" y2="4" stroke="#00d2d3" stroke-width="2"/>
        `);
    }
    if (key.includes('emppulse')) {
        return wrap(`
            <circle cx="32" cy="21" r="14" stroke="#00f2fe" stroke-width="1.2" stroke-dasharray="3,3"/>
            <path d="M30 7 L24 21 L32 21 L28 35 L40 19 L32 19 Z" fill="#00f2fe" stroke="#fff" stroke-width="1"/>
        `);
    }
    if (key.includes('sneakattack')) {
        return wrap(`
            <path d="M14 26 Q32 14 50 26 L52 36 L12 36 Z" fill="#3d2b1f" stroke="#8b5a2b" stroke-width="1.5"/>
            <ellipse cx="32" cy="26" rx="9" ry="5" fill="#111"/>
            <path d="M32 14 L28 22 L36 22 Z" fill="#f39c12"/>
        `);
    }
    if (key.includes('capturebuilding')) {
        return wrap(`
            <rect x="18" y="16" width="28" height="18" fill="#34495e" stroke="#7f8c8d" stroke-width="1"/>
            <line x1="32" y1="6" x2="32" y2="16" stroke="#fff" stroke-width="1.5"/>
            <polygon points="32,6 44,9 32,13" fill="#2ecc71"/>
        `);
    }
    if (key.includes('flashbang')) {
        return wrap(`
            <circle cx="32" cy="21" r="12" fill="#fff" opacity="0.8"/>
            <polygon points="32,7 35,16 45,17 37,23 40,32 32,27 24,32 27,23 19,17 29,16" fill="#f1c40f"/>
        `);
    }
    if (key.includes('compositearmor') || key.includes('migarmor') || key.includes('fortifiedstructures')) {
        return wrap(`
            <rect x="18" y="10" width="28" height="8" rx="1.5" fill="#57606f" stroke="#a4b0be" stroke-width="1"/>
            <rect x="18" y="20" width="28" height="8" rx="1.5" fill="#2f3542" stroke="#a4b0be" stroke-width="1"/>
            <rect x="18" y="30" width="28" height="8" rx="1.5" fill="#1e272e" stroke="#00d2d3" stroke-width="1"/>
            <circle cx="22" cy="14" r="1.5" fill="#fff"/>
            <circle cx="42" cy="14" r="1.5" fill="#fff"/>
        `);
    }
    if (key.includes('dronearmor')) {
        return wrap(`
            <circle cx="32" cy="21" r="12" fill="#222f3e" stroke="#48dbfb" stroke-width="1.5"/>
            <rect x="26" y="18" width="12" height="6" rx="2" fill="#00d2d3"/>
            <line x1="20" y1="14" x2="44" y2="28" stroke="#48dbfb" stroke-width="1.2"/>
            <line x1="20" y1="28" x2="44" y2="14" stroke="#48dbfb" stroke-width="1.2"/>
        `);
    }
    if (key.includes('nationalism')) {
        return wrap(`
            <polygon points="20,12 30,8 30,22 20,26" fill="#c0392b" stroke="#e74c3c" stroke-width="1"/>
            <polygon points="44,12 34,8 34,22 44,26" fill="#c0392b" stroke="#e74c3c" stroke-width="1"/>
            <circle cx="32" cy="18" r="4" fill="#f1c40f"/>
            <polygon points="32,15 33,17 35,17 33.5,18.5 34,21 32,19.5 30,21 30.5,18.5 29,17 31,17" fill="#c0392b"/>
        `);
    }
    if (key.includes('subliminal')) {
        return wrap(`
            <circle cx="32" cy="21" r="5" fill="#e74c3c"/>
            <circle cx="32" cy="21" r="9" stroke="#f1c40f" stroke-width="1.5" fill="none" stroke-dasharray="4,2"/>
            <circle cx="32" cy="21" r="14" stroke="#e67e22" stroke-width="1.5" fill="none" stroke-dasharray="5,3"/>
        `);
    }
    if (key.includes('sathack')) {
        return wrap(`
            <circle cx="32" cy="21" r="4" fill="#fff"/>
            <rect x="14" y="19" width="12" height="4" fill="#3498db" stroke="#2980b9" stroke-width="1"/>
            <rect x="38" y="19" width="12" height="4" fill="#3498db" stroke="#2980b9" stroke-width="1"/>
            <path d="M26 28 C28 32 36 32 38 28" stroke="#2ecc71" stroke-width="1.5" fill="none"/>
            <line x1="32" y1="25" x2="32" y2="35" stroke="#2ecc71" stroke-width="1.2"/>
        `);
    }
    if (key.includes('uraniumshells') || key.includes('apbullets') || key.includes('aprockets')) {
        return wrap(`
            <polygon points="48,16 52,21 48,26 18,26 18,16" fill="#2c3e50" stroke="#2ecc71" stroke-width="1.2"/>
            <polygon points="48,17 54,21 48,25" fill="#2ecc71"/>
            <line x1="14" y1="21" x2="4" y2="21" stroke="#f1c40f" stroke-width="2"/>
        `);
    }
    if (key.includes('nucleartanks')) {
        return wrap(`
            <rect x="16" y="24" width="32" height="8" rx="2" fill="#2f3542" stroke="#2ed573" stroke-width="1"/>
            <rect x="22" y="16" width="20" height="10" rx="2" fill="#1e272e"/>
            <circle cx="32" cy="21" r="3" fill="#2ed573"/>
        `);
    }
    if (key.includes('chainguns') || key.includes('autoloader')) {
        return wrap(`
            <circle cx="32" cy="21" r="11" fill="#1e272e" stroke="#718093" stroke-width="1.5"/>
            <circle cx="32" cy="14" r="2.5" fill="#f1c40f"/>
            <circle cx="38" cy="18" r="2.5" fill="#f1c40f"/>
            <circle cx="38" cy="24" r="2.5" fill="#f1c40f"/>
            <circle cx="32" cy="28" r="2.5" fill="#f1c40f"/>
            <circle cx="26" cy="24" r="2.5" fill="#f1c40f"/>
            <circle cx="26" cy="18" r="2.5" fill="#f1c40f"/>
        `);
    }
    if (key.includes('blacknapalm')) {
        return wrap(`
            <path d="M32 6 C32 6 42 16 42 26 C42 32 37 36 32 36 C27 36 22 32 22 26 C22 16 32 6 32 6 Z" fill="#8e44ad" stroke="#c0392b" stroke-width="1.5"/>
            <path d="M32 14 C32 14 38 20 38 26 C38 29 35 32 32 32 C29 32 26 29 26 26 C26 20 32 14 32 14 Z" fill="#ff4757"/>
            <circle cx="32" cy="26" r="3" fill="#ffa502"/>
        `);
    }
    if (key.includes('towmissile') || key.includes('lasermissiles') || key.includes('rocketpods') || key.includes('scorpionrocket') || key.includes('buggyammo')) {
        return wrap(`
            <rect x="14" y="12" width="36" height="6" rx="2" fill="#2d3436" stroke="#636e72" stroke-width="1"/>
            <polygon points="50,15 44,12 44,18" fill="#e74c3c"/>
            <rect x="14" y="24" width="36" height="6" rx="2" fill="#2d3436" stroke="#636e72" stroke-width="1"/>
            <polygon points="50,27 44,24 44,30" fill="#e74c3c"/>
        `);
    }
    if (key.includes('countermeasures')) {
        return wrap(`
            <path d="M16 21 L36 12 L32 21 L48 21 L32 23 L36 30 Z" fill="#747d8c"/>
            <circle cx="16" cy="28" r="2.5" fill="#f39c12"/>
            <circle cx="22" cy="33" r="2" fill="#f1c40f"/>
            <circle cx="12" cy="34" r="1.5" fill="#ff4757"/>
        `);
    }
    if (key.includes('bunkerbusters')) {
        return wrap(`
            <rect x="16" y="24" width="32" height="10" fill="#2c3e50" stroke="#7f8c8d" stroke-width="1"/>
            <line x1="28" y1="24" x2="36" y2="34" stroke="#e74c3c" stroke-width="2"/>
            <polygon points="32,6 36,18 28,18" fill="#747d8c" stroke="#111" stroke-width="1"/>
        `);
    }
    if (key.includes('training') || key.includes('redguardtraining')) {
        return wrap(`
            <path d="M22 10 L32 18 L42 10" stroke="#f1c40f" stroke-width="3" fill="none" stroke-linecap="round"/>
            <path d="M22 18 L32 26 L42 18" stroke="#f1c40f" stroke-width="3" fill="none" stroke-linecap="round"/>
            <polygon points="32,27 34,32 39,32 35,35 37,40 32,37 27,40 29,35 25,32 30,32" fill="#ffd700"/>
        `);
    }
    if (key.includes('chemicalsuits')) {
        return wrap(`
            <ellipse cx="32" cy="21" rx="12" ry="14" fill="#2d3436" stroke="#2ed573" stroke-width="1.5"/>
            <ellipse cx="27" cy="18" rx="3.5" ry="3" fill="#2ed573"/>
            <ellipse cx="37" cy="18" rx="3.5" ry="3" fill="#2ed573"/>
            <circle cx="32" cy="27" r="4.5" fill="#111" stroke="#57606f" stroke-width="1"/>
        `);
    }
    if (key.includes('supplylines') || key.includes('workershoes')) {
        return wrap(`
            <rect x="20" y="14" width="24" height="20" rx="2" fill="#1e824c" stroke="#2ecc71" stroke-width="1.2"/>
            <text x="32" y="29" font-family="'Impact', sans-serif" font-size="16" fill="#ffd700" text-anchor="middle">$</text>
            <path d="M12 24 L20 18 M52 24 L44 18" stroke="#ffd700" stroke-width="2"/>
        `);
    }
    if (key.includes('armthemob')) {
        return wrap(`
            <rect x="18" y="20" width="28" height="5" fill="#57606f"/>
            <polygon points="46,20 54,22.5 46,25" fill="#111"/>
            <rect x="22" y="25" width="4" height="8" fill="#8b5a2b"/>
            <rect x="34" y="24" width="5" height="9" fill="#111"/>
        `);
    }
    if (key.includes('toxinshells') || key.includes('anthraxbeta')) {
        const isCyan = key.includes('anthraxbeta');
        return wrap(`
            <path d="M28 8 L36 8 L36 14 L42 28 C42 32 38 35 32 35 C26 35 22 32 22 28 L28 14 Z" fill="#1e272e" stroke="${isCyan ? '#00f2fe' : '#2ed573'}" stroke-width="1.5"/>
            <ellipse cx="32" cy="28" rx="7" ry="5" fill="${isCyan ? '#00f2fe' : '#2ed573'}"/>
            <circle cx="32" cy="22" r="1.5" fill="#fff"/>
        `);
    }
    if (key.includes('junkrepair')) {
        return wrap(`
            <path d="M18 12 L30 24 M30 24 L26 28 M18 12 L22 8" stroke="#ced6e0" stroke-width="3" stroke-linecap="round"/>
            <circle cx="38" cy="26" r="6" stroke="#f39c12" stroke-width="2" fill="none" stroke-dasharray="3,2"/>
            <polygon points="38,23 41,29 35,29" fill="#f1c40f"/>
        `);
    }
    if (key.includes('demolitions') || key.includes('boobytrap')) {
        return wrap(`
            <rect x="20" y="14" width="24" height="18" rx="2" fill="#c0392b" stroke="#e74c3c" stroke-width="1.2"/>
            <rect x="22" y="18" width="20" height="4" fill="#111"/>
            <line x1="32" y1="14" x2="32" y2="6" stroke="#f1c40f" stroke-width="1.5"/>
            <circle cx="32" cy="6" r="2.5" fill="#f39c12"/>
        `);
    }

    // 18. DEFAULT GENERIC MILITARY CAMEO
    return wrap(`
        <circle cx="32" cy="21" r="14" fill="#1f2c35" stroke="#3d576a" stroke-width="1.5"/>
        <polygon points="32,10 35,17 42,17 36,22 38,29 32,25 26,29 28,22 22,17 29,17" fill="#55efc4"/>
    `);
}

function getCameoImg(id, name, faction) {
    const fac = (faction || (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa')).toLowerCase();
    const rawKey = (id || name || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    const cameoMap = {
        // USA Units & Buildings
        'crusader': 'crusader',
        'tank': fac === 'china' ? 'battlemaster' : fac === 'gla' ? 'scorpion' : 'crusader',
        'paladin': 'paladin',
        'humvee': 'humvee',
        'ambulance': 'ambulance',
        'tomahawk': 'tomahawk',
        'dozer': 'dozer',
        'truck': 'truck_china',
        'chinook': 'chinook',
        'comanche': 'comanche',
        'raptor': 'raptor',
        'stealthfighter': 'stealthFighter',
        'stealth': 'stealthFighter',
        'aurora': 'aurora',
        'ranger': 'ranger',
        'infantry': fac === 'china' ? 'redguard' : fac === 'gla' ? 'rebel' : 'ranger',
        'missiledefender': 'missileDefender',
        'rocket': fac === 'china' ? 'tankhunter' : fac === 'gla' ? 'rpg' : 'missileDefender',
        'pathfinder': 'pathfinder',
        'burton': 'burton',
        'colonelburton': 'burton',
        // China Units & Buildings
        'battlemaster': 'battlemaster',
        'overlord': 'overlord',
        'gatling': 'gatling',
        'gatlingtank': 'gatling',
        'dragon': 'dragon',
        'dragontank': 'dragon',
        'crawler': 'crawler',
        'troopcrawler': 'crawler',
        'inferno': 'inferno',
        'infernocannon': 'inferno',
        'nukecannon': 'nukecannon',
        'nuketank': 'nukecannon',
        'mig': 'mig',
        'redguard': 'redguard',
        'tankhunter': 'tankhunter',
        'hacker': 'hacker',
        'blacklotus': 'blacklotus',
        // GLA Units & Buildings
        'worker': 'worker',
        'technical': 'technical',
        'scorpion': 'scorpion',
        'marauder': 'marauder',
        'buggy': 'buggy',
        'rocketbuggy': 'buggy',
        'quad': 'quad',
        'quadcannon': 'quad',
        'toxintractor': 'toxintractor',
        'bombtruck': 'bombtruck',
        'scud': 'scud',
        'scudlauncher': 'scud',
        'radarvan': 'radarvan',
        'rebel': 'rebel',
        'rpg': 'rpg',
        'rpgtrooper': 'rpg',
        'terrorist': 'terrorist',
        'mob': 'mob',
        'angrymob': 'mob',
        'hijacker': 'hijacker',
        'jarmen': 'jarmen',
        'jarmenkell': 'jarmen',
        // Vehicle Drones & Overlord Towers
        'battle_drone': 'drone_battle',
        'battledrone': 'drone_battle',
        'scout_drone': 'drone_scout',
        'scoutdrone': 'drone_scout',
        'hellfire': 'drone_hellfire',
        'hellfiredrone': 'drone_hellfire',
        'bunkertower': 'overlord_bunker',
        'gatlingtower': 'overlord_gatling',
        'propaganda': 'overlord_propaganda',
        'outriggers': 'nukecannon',
        'neutronshells': 'neutronShells',
        // Structures
        'center': 'commandCenter',
        'commandcenter': 'commandCenter',
        'power': 'power',
        'nuclearreactor': 'nuclearReactor',
        'barracks': 'barracks',
        'factory': 'factory',
        'warfactory': 'factory',
        'armsdealer': 'factory_gla',
        'supplycenter': 'supplyCenter',
        'supply': 'supplyCenter',
        'supplystash': 'supplyStash',
        'airfield': 'airfield',
        'patriot': 'patriot',
        'strategy': 'strategyCenter',
        'strategycenter': 'strategyCenter',
        'particle': 'particleCannon',
        'particlecannon': 'particleCannon',
        'supplydrop': 'supplyDrop',
        'detention': 'detentionCamp',
        'detentioncamp': 'detentionCamp',
        'propagandacenter': 'propagandaCenter',
        'internetcenter': 'internetCenter',
        'bunker': 'bunker',
        'gatlingcannon': 'gatlingCannon',
        'speakertower': 'speakerTower',
        'nukesilo': 'nukeSilo',
        'palace': 'palace',
        'blackmarket': 'blackMarket',
        'tunnel': 'tunnel',
        'stingersite': 'stingerSite',
        'demotrap': 'demoTrap',
        'scudstorm': 'scudStorm',
        'fakecommandcenter': 'fakeCommandCenter',
        'fakebarracks': 'fakeBarracks',
        'fakearmsdealer': 'fakeArmsDealer',
        // Upgrades & Stances
        'controlrods': 'controlRods',
        'upgradepower': 'controlRods',
        'overcharge': 'overcharge',
        'mines': 'mines',
        'neutronmines': 'neutronMines',
        'camonetting': 'camoNetting',
        'upgradetoreal': 'upgradeToReal',
        'bombardment': 'bombardment',
        'bombard': 'bombardment',
        'holdtheline': 'holdTheLine',
        'hold': 'holdTheLine',
        'searchdestroy': 'searchAndDestroy',
        'search': 'searchAndDestroy',
        'spydrone': 'spyDrone',
        'radarvanscan': 'radarVanScan',
        'emppulse': 'empPulse',
        'sneakattack': 'sneakAttack',
        'superweapon': 'superweapon',
        // Tech Buildings & Commands
        'tech_oilderrick': 'tech_oilDerrick',
        'oilderrick': 'tech_oilDerrick',
        'tech_supplydock': 'tech_supplyDock',
        'supplydock': 'tech_supplyDock',
        'stop': 'stop',
        'guard': 'guard',
        'scatter': 'scatter',
        'move': 'move',
        'harvest': 'supplyCenter',
        'repair': 'repair',
        'repairmode': 'repair',
        'sell': 'sell',
        'sellmode': 'sell',
        'rally': 'rally',
        'setrally': 'rally',
        'attack': 'attack',
        'builders': 'builders',
        'beacon': 'beacon',
        'pingmap': 'beacon',
        'recenter': 'commandCenter',
        'recenterbase': 'commandCenter',
        'allcombat': fac === 'china' ? 'battlemaster' : fac === 'gla' ? 'scorpion' : 'crusader',
        'harvesters': fac === 'china' ? 'truck_china' : fac === 'gla' ? 'worker' : 'chinook',
        'selecttrucks': fac === 'china' ? 'truck_china' : fac === 'gla' ? 'worker' : 'chinook',
        'dispatchall': 'tech_supplyDock'
    };
    const resolved = cameoMap[rawKey] || id || rawKey;
    if (window.OFFICIAL_CAMEOS) {
        const facKey = `${resolved}_${fac}`;
        const src = window.OFFICIAL_CAMEOS[facKey] || window.OFFICIAL_CAMEOS[resolved] || window.OFFICIAL_CAMEOS[rawKey];
        if (src) {
            return `<img src="${src}" class="slot-cameo-img" alt="${name || id}" />`;
        }
    }
    return null;
}

function handleGridSlotClick(idx) {
    if (typeof playOfficialSound === 'function') playOfficialSound('sfx_click', 0.65);
    if (currentGridSlots && currentGridSlots[idx] && typeof currentGridSlots[idx].action === 'function') {
        currentGridSlots[idx].action();
    }
}
window.handleGridSlotClick = handleGridSlotClick;

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
            const cameoSvg = getCameoImg(s.id, s.name, selectedFaction) || getCameoSVG(s.id, selectedFaction, s.name);
            const cleanBadge = isRally ? 'RALLY' : isSell ? 'SELL' : badgeStr;

            html += `<button class="grid-slot-btn ${specialClass}" onclick="handleGridSlotClick(${i})" onmouseenter="showTacticalTooltip(event, '${idStr}')" onmouseleave="hideTacticalTooltip()" ${disabledAttr}>
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

let _builderCycleIdx = 0;

function cycleSelectBuilder(direction = 1) {
    const myTeam = (typeof playerTeamId !== 'undefined' ? playerTeamId : 1);
    const builders = units.filter(u =>
        (u.type === 'dozer' || u.type === 'worker') &&
        u.health > 0 &&
        !u.isDead &&
        (typeof u.teamId === 'undefined' || u.teamId === myTeam)
    );

    if (builders.length === 0) {
        showNotification('No construction units available.', 'warning');
        return;
    }

    // Determine current index if a builder is already selected
    const currentIdx = builders.findIndex(u => u.selected);
    let nextIdx = 0;

    if (currentIdx !== -1) {
        // Cycle to next / previous builder
        nextIdx = (currentIdx + direction + builders.length) % builders.length;
    } else {
        // None selected yet: use saved cycle index
        if (typeof _builderCycleIdx !== 'number' || _builderCycleIdx >= builders.length) {
            _builderCycleIdx = 0;
        }
        nextIdx = _builderCycleIdx;
    }

    _builderCycleIdx = (nextIdx + 1) % builders.length;

    // Deselect everything else
    deselectAll();

    // Select target builder strictly alone
    const chosen = builders[nextIdx];
    chosen.selected = true;
    addSelectionCircle(chosen);

    // Pan camera to chosen builder
    if (chosen.mesh) {
        centerCameraOn(chosen.mesh.position);
    }

    // Audio unit voice feedback
    if (typeof playUnitVoice === 'function') {
        playUnitVoice(chosen.type, 'select');
    }

    if (builders.length > 1) {
        showNotification(`Builder selected (${nextIdx + 1}/${builders.length}).`, 'info');
    } else {
        const typeName = chosen.type === 'worker' ? 'Worker' : 'Construction Dozer';
        showNotification(`Builder selected: ${typeName}.`, 'info');
    }

    activeSidebarTab = 'production';
    updateSidebar();
    updateHUD();
}
window.cycleSelectBuilder = cycleSelectBuilder;

window.addEventListener('keydown', e => {
    // Ignore input if typing in chat, text fields, or modal
    if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

    const k = e.key.toLowerCase();
    const isCtrl = e.ctrlKey || e.metaKey;
    const isAlt = e.altKey;
    const isShift = e.shiftKey;
    const now = Date.now();

    // TAB: Toggle In-Game Diplomacy & Match Objectives Menu (Official Zero Hour shortcut)
    if (e.key === 'Tab') {
        e.preventDefault();
        toggleInGameMenu();
        return;
    }

    // Blueprint Rotation Keys: R / Q / E
    if (blueprintMesh) {
        if (k === 'r' || k === 'e') {
            blueprintRotationY = (typeof blueprintRotationY !== 'undefined' ? blueprintRotationY : 0) + Math.PI / 4;
            blueprintMesh.rotation.y = blueprintRotationY;
            return;
        }
        if (k === 'q') {
            blueprintRotationY = (typeof blueprintRotationY !== 'undefined' ? blueprintRotationY : 0) - Math.PI / 4;
            blueprintMesh.rotation.y = blueprintRotationY;
            return;
        }
    }

    // 1. ESCAPE: Universal cancel blueprint / superweapon / deselect all / toggle menu
    if (e.key === 'Escape' || k === 'escape') {
        const menu = document.getElementById('start-menu');
        if (menu && menu.style.display !== 'none') {
            resumeGame();
            return;
        }
        if (blueprintMesh) {
            scene.remove(blueprintMesh);
            blueprintMesh = null;
            activeBlueprintType = null;
            document.body.style.cursor = 'default';
            showNotification('Construction cancelled.', 'info');
            return;
        }
        if (pendingSuperweapon) {
            pendingSuperweapon = null;
            document.body.style.cursor = 'default';
            showNotification('Targeting cancelled.', 'info');
            return;
        }
        if (typeof activeGeneralPower !== 'undefined' && activeGeneralPower) {
            activeGeneralPower = null;
            document.body.style.cursor = 'default';
            showNotification('Power cancelled.', 'info');
            return;
        }
        if (attackMoveMode || guardModeActive) {
            attackMoveMode = false;
            guardModeActive = false;
            showNotification('Command cancelled.', 'info');
            return;
        }
        const hasSelected = units.some(u => u.selected) || selectedStructure || selectedSupplyPoint;
        if (hasSelected) {
            deselectAll();
            return;
        }
        // When completely idle: Open in-game menu!
        toggleInGameMenu();
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

    // 6. BUILDER CYCLING: Ctrl + Up / Down Arrow, or 'D' hotkey
    if (isCtrl && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        cycleSelectBuilder(e.key === 'ArrowDown' ? 1 : -1);
        return;
    }
    if (k === 'd' && !isCtrl && !isAlt && !blueprintMesh) {
        cycleSelectBuilder();
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
            if (u.type === 'truck' || u.type === 'worker' || u.type === 'chinook') u.aiState = 'Idle';
        }
    });
    playUSASound('acknowledge');
    showNotification('Unit movement halted.', 'info');
}

function orderSelectedHarvestersToGather() {
    const harvesters = units.filter(u => u.selected && (u.type === 'truck' || u.type === 'worker' || u.type === 'chinook'));
    if (harvesters.length === 0) {
        showNotification('Select a Chinook, Supply Truck or Worker first.', 'info');
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
        if (h.type === 'chinook') h.airState = 'flying';
    });
    showNotification(`Dispatched ${harvesters.length} harvester(s) to gather supplies.`, 'success');
}

function orderAllHarvestersToTargetSupply() {
    if (!selectedSupplyPoint) return;
    const harvesters = units.filter(u => u.type === 'truck' || u.type === 'worker' || u.type === 'chinook');
    if (harvesters.length === 0) {
        showNotification('No harvesters available! Build Chinooks, Supply Trucks or Workers.', 'error');
        return;
    }
    harvesters.forEach(h => {
        h.supplyTarget = selectedSupplyPoint;
        h.aiState = 'MovingToDock';
        h.taskState = 'Idle';
        h.combatTarget = null;
        h.targetPosition.copy(selectedSupplyPoint.position);
        if (h.type === 'chinook') h.airState = 'flying';
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
    if (structure.ownerId && structure.ownerId !== 'player') {
        showNotification('Cannot command repairs on allied structures!', 'error');
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
    if (structure.ownerId && structure.ownerId !== 'player') {
        showNotification('Cannot demolish allied structures!', 'error');
        return;
    }
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

function getEffectiveUnitCost(type) {
    const spec = unitRoster[type];
    if (!spec) return 0;
    let cost = spec.cost;
    const allTechs = [...(typeof structures !== 'undefined' ? structures : []), ...(window.neutralStructures || [])];
    const hasRefinery = allTechs.some(s => s.type === 'techRefinery' && (s.capturedByTeam === playerTeamId || isFriendly({ teamId: playerTeamId }, s)) && s.health > 0);
    if (hasRefinery && !isInfantryType(type)) {
        cost = Math.round(cost * 0.90); // 10% vehicle & aircraft discount!
    }
    return cost;
}

function produceUnit(type) {
    const spec = unitRoster[type];
    if (!spec) return;

    if (selectedStructure && selectedStructure.ownerId && selectedStructure.ownerId !== 'player') {
        showNotification('Cannot train units from allied facilities!', 'error');
        return;
    }

    const effCost = getEffectiveUnitCost(type);
    if (playerResources < effCost) {
        showNotification(`Insufficient funds to train ${spec.name} ($${effCost} required).`, 'error');
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

    playerResources -= effCost;
    fac.productionQueue.push({
        type: type,
        name: spec.name,
        cost: effCost,
        progress: 0,
        buildTime: spec.buildTime || (isInfantryType(type) ? 3.0 : 5.5)
    });

    playUSASound('radio_chirp');
    showNotification(`Queued: ${spec.name}${effCost < spec.cost ? ' (10% Refinery Discount)' : ''}`, 'info');
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
    executeStructureUpgradeOrAction({ id: action, name: action, cost: 0 }, structure);
}

function executeStructureUpgradeOrAction(upg, structure) {
    if (!structure || structure.health <= 0 || structure.isBuilding) return;
    if (structure.ownerId && structure.ownerId !== 'player') {
        showNotification('Cannot purchase upgrades for allied structures!', 'error');
        return;
    }

    if (upg.isStance) {
        battlePlan = upg.stance;
        playUSASound('radio_chirp');
        const stanceNames = {
            bombard: 'Bombardment (+20% Firepower)',
            hold: 'Hold the Line (+20% Armor & Defense)',
            search: 'Search & Destroy (+20% Sight & Range)'
        };
        showNotification(`Strategy Center Directive: ${stanceNames[upg.stance] || upg.name}`, 'info');
        updateSidebar();
        return;
    }

    if (upg.isToggle) {
        if (upg.id === 'overcharge') {
            structure.overcharged = !structure.overcharged;
            structure.powerOutput = structure.overcharged ? 15 : 10;
            playAudio('construction', {}, 'china');
            showNotification(`Nuclear Reactor overcharge ${structure.overcharged ? 'ACTIVATED (+50% Power, slow radiation wear)' : 'DEACTIVATED'}.`, structure.overcharged ? 'warning' : 'info');
            updateSidebar();
        }
        return;
    }

    if (upg.isAddon) {
        if (playerResources < upg.cost) {
            showNotification(`Insufficient funds to purchase ${upg.name} ($${upg.cost} required).`, 'error');
            return;
        }
        playerResources -= upg.cost;

        if (upg.id === 'controlRods' || upg.id === 'upgradePower') {
            structure.powerUpgraded = true;
            structure.powerOutput = 10;
            attachControlRodsVisual(structure);
            showNotification('Control Rods installed: Cold Fusion power doubled (+100%).', 'success');
        } else if (upg.id === 'mines') {
            structure.hasMines = true;
            attachPerimeterMinesVisual(structure, false);
            showNotification('Perimeter Landmines deployed around structure.', 'success');
        } else if (upg.id === 'neutronMines') {
            structure.hasMines = true;
            structure.hasNeutronMines = true;
            attachPerimeterMinesVisual(structure, true);
            showNotification('Neutron Mines armed around perimeter: hostile vehicle crews will be eliminated.', 'success');
        } else if (upg.id === 'camoNetting') {
            structure.hasCamoNetting = true;
            structure.isStealthed = true;
            attachCamoNettingVisual(structure);
            showNotification('Camo Netting installed: Structure is now concealed in stealth.', 'success');
        } else if (upg.id === 'upgradeToReal') {
            upgradeDecoyToRealStructure(structure);
        }
        playAudio('construction', {}, selectedFaction);
        updateSidebar();
        return;
    }

    if (upg.isAbility) {
        if (structure.abilityCooldownUntil && buildingTick < structure.abilityCooldownUntil) {
            showNotification('Ability recharging...', 'warning');
            return;
        }
        if (playerResources < upg.cost) {
            showNotification(`Insufficient funds for ${upg.name} ($${upg.cost} required).`, 'error');
            return;
        }
        playerResources -= upg.cost;
        structure.abilityCooldownUntil = buildingTick + 900; // 15s cooldown

        if (upg.id === 'spyDrone' || upg.id === 'radarVanScan') {
            triggerReconnaissanceScan(upg.id);
        } else if (upg.id === 'empPulse') {
            triggerEmpPulseDisruption();
        } else if (upg.id === 'sneakAttack') {
            triggerSneakAttackTunnel();
        }
        updateSidebar();
        return;
    }

    if (upg.id === 'superweapon' || upg.isSuperweapon) {
        if (buildingTick < (structure.cooldownUntil || 0)) {
            const secsLeft = Math.ceil((structure.cooldownUntil - buildingTick) / 60);
            showNotification(`Superweapon is recharging (${secsLeft}s remaining).`, 'error');
            return;
        }
        pendingSuperweapon = structure;
        document.body.style.cursor = 'crosshair';
        const weaponTitle = structure.type === 'particleCannon' ? 'Orbital Particle Beam' : structure.type === 'nukeSilo' ? 'Thermonuclear Missile' : 'SCUD Storm Salvo';
        showNotification(`⚡ TARGETING READY: Left-click target coordinates on terrain or minimap to fire ${weaponTitle}! (Right-click or Esc to cancel)`, 'warning');
        if (typeof playUSASound === 'function') playUSASound('radio_chirp');
        return;
    }

    // Global research
    if (playerResources < upg.cost) {
        showNotification(`Insufficient funds to research ${upg.name} ($${upg.cost} required).`, 'error');
        return;
    }
    playerResources -= upg.cost;
    researchedTechs.add(upg.id);
    playAudio('construction', {}, selectedFaction);

    // Immediate global stat application
    if (upg.id === 'compositeArmor') {
        units.filter(u => u.type === 'tank' || u.type === 'crusader' || u.type === 'paladin').forEach(u => {
            u.compositeArmor = true;
            u.maxHealth = Math.floor(u.maxHealth * 1.25);
            u.health = Math.min(u.maxHealth, u.health + 100);
        });
        showNotification('Composite Armor researched: Tanks gained +25% HP and layered armor!', 'success');
    } else if (upg.id === 'migArmor') {
        units.filter(u => u.type === 'raptor' && (u.faction === 'china' || u.isChina || selectedFaction === 'china')).forEach(u => {
            u.maxHealth = Math.floor(u.maxHealth * 1.25);
            u.health = Math.min(u.maxHealth, u.health + 65);
        });
        showNotification('MiG Composite Armor researched: MiGs gained +25% HP!', 'success');
    } else if (upg.id === 'fortifiedStructures') {
        structures.forEach(s => {
            s.maxHealth = Math.floor(s.maxHealth * 1.25);
            s.health = Math.min(s.maxHealth, s.health + 200);
        });
        showNotification('Fortified Structures researched: GLA structures reinforced (+25% HP)!', 'success');
    } else if (upg.id === 'workerShoes') {
        units.filter(u => u.type === 'worker').forEach(u => {
            if (!u.shoesApplied) { u.speed = (u.speed || 0.10) * 1.25; u.shoesApplied = true; }
        });
        showNotification('Worker Shoes acquired: Worker movement speed increased by +25%!', 'success');
    } else if (upg.id === 'nuclearTanks') {
        units.filter(u => u.type === 'battlemaster' || u.type === 'overlord').forEach(u => {
            u.speed = (u.speed || 0.15) * 1.25;
        });
        showNotification('Nuclear Tanks researched: Battlemaster and Overlord tank speed +25%!', 'success');
    } else if (upg.id === 'radar') {
        showNotification('Radar System online: Tactical mini-map telemetry fully active!', 'success');
    } else {
        showNotification(`Upgrade completed: ${upg.name}!`, 'success');
    }

    updateSidebar();
}

function attachControlRodsVisual(structure) {
    if (!structure || !structure.mesh) return;
    const rodGroup = new THREE.Group();
    rodGroup.name = "controlRodsAttachment";
    const rodMat = new THREE.MeshStandardMaterial({ color: 0x00f2fe, emissive: 0x00c6ff, emissiveIntensity: 0.8, metalness: 0.8, roughness: 0.2 });
    [-1.2, 1.2].forEach(x => {
        [-1.2, 1.2].forEach(z => {
            const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.6, 8), rodMat);
            rod.position.set(x, 3.8, z);
            rodGroup.add(rod);
        });
    });
    structure.mesh.add(rodGroup);
}

function attachPerimeterMinesVisual(structure, isNeutron = false) {
    if (!structure || !structure.mesh) return;
    const mineGroup = new THREE.Group();
    mineGroup.name = "perimeterMinesAttachment";
    const stakeMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 });
    const flagMat = new THREE.MeshBasicMaterial({ color: isNeutron ? 0x00ffff : 0xff4757 });
    const r = (structure.radius || 4.0) + 1.2;
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const mx = Math.cos(angle) * r;
        const mz = Math.sin(angle) * r;
        const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), stakeMat);
        stake.position.set(mx, 0.45, mz);
        const flag = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.02), flagMat);
        flag.position.set(mx + 0.12, 0.8, mz);
        mineGroup.add(stake);
        mineGroup.add(flag);
    }
    structure.mesh.add(mineGroup);
}

function attachCamoNettingVisual(structure) {
    if (!structure || !structure.mesh) return;
    const r = (structure.radius || 3.5) * 1.35;
    const netGeo = new THREE.ConeGeometry(r, 2.5, 8, 1, true);
    const netMat = new THREE.MeshStandardMaterial({
        color: 0x5a6848,
        wireframe: true,
        roughness: 0.9,
        transparent: true,
        opacity: 0.85
    });
    const net = new THREE.Mesh(netGeo, netMat);
    net.position.y = 1.8;
    net.name = "camoNettingAttachment";
    structure.mesh.add(net);
}

function upgradeDecoyToRealStructure(structure) {
    if (!structure) return;
    const oldType = structure.type;
    const newType = (oldType === 'fakeBarracks') ? 'barracks' : 'factory';
    structure.type = newType;
    structure.isFake = false;
    structure.maxHealth = (newType === 'barracks' ? 800 : 1200);
    structure.health = structure.maxHealth;
    showNotification(`Decoy converted: Now a fully operational ${newType === 'barracks' ? 'Barracks' : 'Arms Dealer'}!`, 'success');
}

function triggerReconnaissanceScan(abilityId) {
    const targetPos = (typeof camera !== 'undefined' && camera.position) ? new THREE.Vector3(camera.position.x, 0, camera.position.z) : new THREE.Vector3(0, 0, 0);
    if (typeof revealFogOfWarAt === 'function') revealFogOfWarAt(targetPos, 45, 900);
    playUSASound('radio_chirp');
    showNotification(`${abilityId === 'spyDrone' ? 'Spy Drone' : 'Radar Van'} recon scan active over operational theater!`, 'info');
}

function triggerEmpPulseDisruption() {
    const targetPos = (typeof camera !== 'undefined' && camera.position) ? new THREE.Vector3(camera.position.x, 0, camera.position.z) : new THREE.Vector3(0, 0, 0);
    if (typeof enemyUnits !== 'undefined') {
        enemyUnits.forEach(eu => {
            if (eu.health > 0 && eu.mesh && eu.mesh.position.distanceTo(targetPos) < 40) {
                eu.attackCooldown = 720; // Stunned for 12 seconds
                if (typeof spawnEnhancedExplosion === 'function') spawnEnhancedExplosion(eu.mesh.position, 0x00f2fe, 1.5, false);
            }
        });
    }
    playAudio('construction', {}, 'china');
    showNotification('EMP Disruption pulse discharged! Hostile systems in sector disabled for 12s.', 'info');
}

function triggerSneakAttackTunnel() {
    const targetPos = (typeof camera !== 'undefined' && camera.position) ? new THREE.Vector3(camera.position.x, 0, camera.position.z) : new THREE.Vector3(0, 0, 0);
    targetPos.y = (typeof getTerrainHeight === 'function') ? getTerrainHeight(targetPos.x, targetPos.z) : 0;
    const tunnelMesh = (typeof createGLATunnelMesh === 'function') ? createGLATunnelMesh() : new THREE.Group();
    tunnelMesh.position.copy(targetPos);
    scene.add(tunnelMesh);
    structures.push({
        type: 'tunnel',
        mesh: tunnelMesh,
        position: targetPos,
        health: 800,
        maxHealth: 800,
        radius: 3.5,
        isBuilding: false,
        buildProgress: 100,
        teamId: playerTeamId
    });
    if (typeof spawnEnhancedExplosion === 'function') spawnEnhancedExplosion(targetPos, 0x8b5a2b, 2.5, true);
    playAudio('construction', {}, 'gla');
    showNotification('Sneak Attack Network breached ground! Underground tunnel network established.', 'success');
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
    structure.cooldownUntil = buildingTick + 1800; // 30s cooldown
    pendingSuperweapon = null;
    document.body.style.cursor = 'default';
    showNotification('Superweapon strike confirmed on target coordinates!', 'success');
    updateSidebar();
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
                if (structure.type === 'supplyDrop' && buildingTick % 900 === 0) {
                    const bonus = (typeof researchedTechs !== 'undefined' && researchedTechs.has('supplyLines')) ? 275 : 250;
                    playerResources += bonus;
                }
                if (structure.type === 'blackMarket' && buildingTick % 300 === 0) playerResources += 30;
                if (structure.type === 'internetCenter' && buildingTick % 300 === 0) playerResources += 20;
                if (structure.type === 'nuclearReactor' && structure.overcharged) structure.health -= 8;

                // Perimeter landmines installed on Chinese/defensive structures
                if (structure.hasMines && buildingTick % 30 === 0) {
                    const triggerDist = (structure.radius || 4) + 4.5;
                    const nearbyEnemies = enemyUnits.filter(e => e.health > 0 && e.mesh && e.mesh.position.distanceTo(structure.position) < triggerDist);
                    if (nearbyEnemies.length > 0) {
                        nearbyEnemies.forEach(e => {
                            const isNeutron = !!structure.hasNeutronMines;
                            const dmg = isNeutron ? 320 : 180;
                            e.health = Math.max(0, e.health - dmg);
                            if (isNeutron && isInfantryType(e.type)) e.health = 0;
                            if (typeof spawnEnhancedExplosion === 'function') spawnEnhancedExplosion(e.mesh.position, isNeutron ? 0x00f2fe : 0xff4757, 1.8, true);
                        });
                        showNotification(`Perimeter mine detonated around ${structure.type.toUpperCase()}!`, 'warning');
                    }
                }

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

                if (['barracks', 'speakerTower', 'propagandaCenter'].includes(structure.type)) {
                    const healMult = (typeof researchedTechs !== 'undefined' && researchedTechs.has('subliminal')) ? 2 : 1;
                    units.forEach(unit => {
                        const infantry = ['infantry', 'redguard', 'tankhunter', 'rocket', 'rpg', 'rebel', 'terrorist', 'pathfinder', 'hacker'].includes(unit.type);
                        if (infantry && unit.health > 0 && unit.health < unit.maxHealth && unit.mesh.position.distanceTo(structure.position) < (structure.type === 'barracks' ? 12 : 26)) {
                            unit.health = Math.min(unit.maxHealth, unit.health + (structure.type === 'barracks' ? 2 : (2 * healMult)));
                        }
                    });
                }
                if (['factory', 'airfield'].includes(structure.type)) {
                    units.forEach(unit => {
                        const matchingUnit = structure.type === 'airfield'
                            ? ['chinook', 'comanche', 'raptor', 'mig', 'stealthfighter', 'aurora'].includes(unit.type)
                            : !['chinook', 'comanche', 'raptor', 'mig', 'stealthfighter', 'aurora', 'infantry', 'redguard', 'tankhunter', 'rocket', 'rpg', 'rebel', 'terrorist', 'worker', 'dozer'].includes(unit.type);
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

            // Overlord Propaganda Tower healing
            units.forEach(u => {
                if (u.type === 'overlord' && u.overlordUpgrade === 'speaker' && u.health > 0 && u.mesh) {
                    const ovHeal = (typeof researchedTechs !== 'undefined' && researchedTechs.has('subliminal')) ? 4 : 2;
                    units.forEach(nearby => {
                        if (nearby.health > 0 && nearby.health < nearby.maxHealth && nearby.mesh && nearby.mesh.position.distanceTo(u.mesh.position) < 24) {
                            nearby.health = Math.min(nearby.maxHealth, nearby.health + ovHeal);
                        }
                    });
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
                if (typeof researchedTechs !== 'undefined' && (researchedTechs.has('junkRepair') || researchedTechs.has('battleDrone'))) {
                    units.forEach(u => {
                        if (!u.isAir && !isInfantryType(u.type) && u.health > 0 && u.health < u.maxHealth) {
                            u.health = Math.min(u.maxHealth, u.health + 4);
                        }
                    });
                }
                if (typeof researchedTechs !== 'undefined' && researchedTechs.has('workerShoes')) {
                    units.filter(u => u.type === 'worker' && !u.shoesApplied).forEach(u => {
                        u.speed = (u.speed || 0.10) * 1.25;
                        u.shoesApplied = true;
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
            if (type === 'tank' || type === 'crusader') { mesh = createCrusaderTankMesh(false); radius = 3.6; speed = 0.15; health = 480; scanRange = 24; }
            else if (type === 'paladin') { mesh = createPaladinTankMesh(false); radius = 3.6; speed = 0.14; health = 550; scanRange = 26; }
            else if (type === 'humvee') { mesh = createHumveeMesh(false); radius = 2.8; speed = 0.22; health = 280; scanRange = 26; capacity = 5; garrisoned = []; }
            else if (type === 'ambulance') { mesh = createAmbulanceMesh(); radius = 2.8; speed = 0.18; health = 220; scanRange = 18; capacity = 4; garrisoned = []; }
            else if (type === 'tomahawk') { mesh = createTomahawkMesh(false); radius = 3.2; speed = 0.11; health = 220; scanRange = 38; }
            else if (type === 'dozer') { mesh = createUSADozerMesh(); radius = 3.2; speed = 0.10; health = 300; }
            else if (type === 'truck') { mesh = createUSATruckMesh(); radius = 3.2; speed = 0.13; health = 260; }
            else if (type === 'chinook') { mesh = createChinookMesh(); radius = 4.8; speed = 0.22; health = 550; isAir = true; capacity = 8; garrisoned = []; }
            else if (type === 'comanche') { mesh = createComancheMesh(); radius = 3.8; speed = 0.26; health = 340; scanRange = 28; isAir = true; }
            else if (type === 'mig') { mesh = createMigMesh(false); radius = 4.2; speed = 0.32; health = 280; scanRange = 30; isAir = true; }
            else if (type === 'raptor') { mesh = createRaptorMesh(false); radius = 4.2; speed = 0.32; health = 260; scanRange = 30; isAir = true; }
            else if (type === 'stealthfighter') { mesh = createStealthFighterMesh(); radius = 4.0; speed = 0.28; health = 240; scanRange = 32; isAir = true; }
            else if (type === 'aurora') { mesh = createAuroraMesh(); radius = 4.2; speed = 0.38; health = 180; scanRange = 35; isAir = true; }
            else if (type === 'infantry') { mesh = createRangerMesh(); radius = 0.8; speed = 0.08; health = 100; scanRange = 16; }
            else if (type === 'rocket') { mesh = createMissileDefenderMesh(); radius = 0.8; speed = 0.08; health = 120; scanRange = 24; }
            else if (type === 'pathfinder') { mesh = createPathfinderMesh(); radius = 0.8; speed = 0.09; health = 120; scanRange = 32; }
            else if (type === 'burton') { mesh = createBurtonMesh(); radius = 0.9; speed = 0.10; health = 350; scanRange = 24; }

            // China Forces
            else if (type === 'battlemaster') { mesh = createBattlemasterTankMesh(false); radius = 3.4; speed = 0.15; health = 460; scanRange = 24; }
            else if (type === 'overlord') { mesh = createOverlordTankMesh(false); radius = 5.2; speed = 0.09; health = 1100; scanRange = 28; capacity = 5; garrisoned = []; }
            else if (type === 'gatling') { mesh = createGatlingTankMesh(false); radius = 3.4; speed = 0.16; health = 400; scanRange = 22; }
            else if (type === 'dragon') { mesh = createDragonTankMesh(false); radius = 3.4; speed = 0.15; health = 450; scanRange = 18; }
            else if (type === 'crawler') { mesh = createTroopCrawlerMesh(); radius = 3.8; speed = 0.15; health = 480; scanRange = 20; capacity = 8; garrisoned = []; }
            else if (type === 'inferno') { mesh = createInfernoCannonMesh(); radius = 3.6; speed = 0.10; health = 220; scanRange = 36; }
            else if (type === 'nukecannon' || type === 'nuketank') { mesh = createNukeCannonMesh(); radius = 4.0; speed = 0.08; health = 260; scanRange = 42; }
            else if (type === 'redguard') { mesh = createRedGuardMesh(); radius = 0.8; speed = 0.08; health = 100; scanRange = 16; }
            else if (type === 'tankhunter') { mesh = createTankHunterMesh(); radius = 0.8; speed = 0.08; health = 120; scanRange = 24; }
            else if (type === 'hacker') { mesh = createHackerMesh(); radius = 0.8; speed = 0.07; health = 100; }
            else if (type === 'blacklotus') { mesh = createBlackLotusMesh(); radius = 0.8; speed = 0.10; health = 250; }

            // GLA Forces
            else if (type === 'worker') { mesh = createGLAWorkerMesh(); radius = 0.8; speed = 0.10; health = 150; }
            else if (type === 'technical') { mesh = createTechnicalMesh(false); radius = 2.6; speed = 0.22; health = 240; scanRange = 22; capacity = 5; garrisoned = []; }
            else if (type === 'scorpion') { mesh = createScorpionTankMesh(false); radius = 3.2; speed = 0.16; health = 360; scanRange = 22; }
            else if (type === 'marauder') { mesh = createMarauderTankMesh(false); radius = 3.4; speed = 0.13; health = 520; scanRange = 24; }
            else if (type === 'buggy') { mesh = createRocketBuggyMesh(false); radius = 2.6; speed = 0.22; health = 160; scanRange = 30; }
            else if (type === 'quad') { mesh = createQuadCannonMesh(false); radius = 3.2; speed = 0.17; health = 300; scanRange = 24; }
            else if (type === 'toxintractor') { mesh = createToxinTractorMesh(false); radius = 3.2; speed = 0.14; health = 360; scanRange = 20; }
            else if (type === 'bombtruck') { mesh = createBombTruckMesh(false); radius = 3.0; speed = 0.18; health = 220; scanRange = 14; }
            else if (type === 'scud') { mesh = createScudLauncherMesh(false); radius = 3.8; speed = 0.10; health = 240; scanRange = 40; }
            else if (type === 'radarvan') { mesh = createRadarVanMesh(); radius = 3.0; speed = 0.16; health = 220; }
            else if (type === 'rebel') { mesh = createRebelMesh(); radius = 0.8; speed = 0.08; health = 100; scanRange = 16; }
            else if (type === 'rpg') { mesh = createRPGTrooperMesh(); radius = 0.8; speed = 0.08; health = 120; scanRange = 24; }
            else if (type === 'terrorist') { mesh = createTerroristMesh(); radius = 0.8; speed = 0.12; health = 80; scanRange = 8; }
            else if (type === 'mob') { mesh = createAngryMobMesh(); radius = 1.4; speed = 0.08; health = 280; scanRange = 18; }
            else if (type === 'hijacker') { mesh = createHijackerMesh(); radius = 0.8; speed = 0.11; health = 120; }
            else if (type === 'jarmen') { mesh = createJarmenKellMesh(); radius = 0.8; speed = 0.09; health = 220; scanRange = 34; }
            else {
                mesh = selectedFaction === 'china' ? createBattlemasterTankMesh(false) : selectedFaction === 'gla' ? createScorpionTankMesh(false) : createCrusaderTankMesh(false);
            }

            // Scale calibration: vehicles/structures get 1.35x visual boost if procedural, infantry stays realistic (~0.88 units tall)
            if (!mesh.userData || !mesh.userData.isW3D) {
                if (typeof isInfantryType === 'function' && isInfantryType(type)) {
                    mesh.scale.set(0.52, 0.52, 0.52);
                } else {
                    mesh.scale.set(1.35, 1.35, 1.35);
                }
            }
            if (typeof isInfantryType !== 'function' || !isInfantryType(type)) {
                radius *= 1.35;
                scanRange *= 1.35;
                speed *= 1.15;
            }

            if (!position) {
                const angle = units.length * 2.4;
                const spawnRadius = 4 + Math.floor(units.length / 8) * 2;
                position = new THREE.Vector3(Math.cos(angle) * spawnRadius, 0, Math.sin(angle) * spawnRadius);
            }
            mesh.position.copy(position);
            if (isAir) {
                const cruiseAlt = (mesh.userData && mesh.userData.flightAltitude) ? mesh.userData.flightAltitude : 8.5;
                const groundY = typeof getTerrainHeight === 'function' ? getTerrainHeight(position.x, position.z) : 0;
                mesh.position.y = groundY + cruiseAlt;
            }
            scene.add(mesh);

            // Apply Tech Upgrades to Newly Spawned Units
            let initialVeterancy = 0;
            if (typeof researchedTechs !== 'undefined') {
                if (researchedTechs.has('compositeArmor') && (type === 'tank' || type === 'crusader' || type === 'paladin')) {
                    health = Math.floor(health * 1.25);
                }
                if (researchedTechs.has('migArmor') && (type === 'raptor' || type === 'mig') && (selectedFaction === 'china')) {
                    health = Math.floor(health * 1.25);
                }
                if (researchedTechs.has('redGuardTraining') && type === 'redguard') {
                    initialVeterancy = 1;
                    health = Math.floor(health * 1.20);
                }
                if (researchedTechs.has('nuclearTanks') && (type === 'battlemaster' || type === 'overlord')) {
                    speed *= 1.25;
                }
                if (researchedTechs.has('workerShoes') && type === 'worker') {
                    speed *= 1.25;
                }
            }

            const myNetId = (isMultiplayerActive ? (isMultiplayerHost ? 'H_' : 'C_') : 'P_') + (++netIdSequence);
            const isGatherer = (type === 'truck' || type === 'worker' || type === 'chinook');
            const isNaturalStealth = ['stealthfighter', 'burton', 'jarmen', 'blacklotus', 'hijacker'].includes(type) ||
                (type === 'comanche' && typeof researchedTechs !== 'undefined' && researchedTechs.has('stealthComanche'));
            const newUnitObj = {
                type: type, mesh: mesh, selected: false, targetPosition: position.clone(),
                speed: speed, radius: radius, selectionCircle: null, taskState: 'Idle',
                aiState: isGatherer ? (type === 'worker' ? 'Idle' : 'MovingToDock') : 'Idle',
                cargoLoaded: 0, timerState: 0, targetStructure: null, supplyTarget: null,
                health: health, maxHealth: health, scanRange: scanRange, _baseScanRange: scanRange, netId: myNetId,
                attackCooldown: 0, combatTarget: null, isAir: isAir,
                airState: isAir ? (type === 'comanche' || type === 'chinook' ? 'hovering' : 'circling') : 'none',
                patrolCenter: position ? position.clone() : new THREE.Vector3(),
                circleAngle: Math.random() * Math.PI * 2,
                circleRadius: (type === 'comanche' || type === 'chinook') ? 11.0 : 15.0,
                capacity: capacity || 0, garrisoned: garrisoned || [], waypoints: [],
                kills: 0,
                veterancy: initialVeterancy,
                isStealthed: isNaturalStealth,
                detectsStealth: ['crawler', 'dozer', 'worker', 'pathfinder', 'blacklotus', 'burton', 'jarmen', 'radarvan'].includes(type),
                compositeArmor: (typeof researchedTechs !== 'undefined' && researchedTechs.has('compositeArmor') && (type === 'tank' || type === 'crusader' || type === 'paladin')),
                shoesApplied: (typeof researchedTechs !== 'undefined' && researchedTechs.has('workerShoes') && type === 'worker')
            };
            if (type === 'chinook') {
                const sTarget = (typeof findNearestSupplyPoint === 'function') ? findNearestSupplyPoint(position) : null;
                if (sTarget) {
                    newUnitObj.supplyTarget = sTarget;
                    newUnitObj.targetPosition.copy(sTarget.position);
                    newUnitObj.airState = 'flying';
                }
            }
            newUnitObj.teamId = playerTeamId;
            newUnitObj.ownerId = 'player';
            newUnitObj.isAI = false;
            units.push(newUnitObj);
            if (type === 'crawler') {
                for (let rg = 0; rg < 4; rg++) {
                    const passenger = spawnUnit('redguard', position.clone());
                    if (passenger) {
                        passenger.mesh.visible = false;
                        passenger.garrisonedIn = newUnitObj;
                        newUnitObj.garrisoned.push(passenger);
                    }
                }
            }
            if (isMultiplayerActive && netConn && netConn.open) {
                broadcastNetPacket({
                    type: 'spawn_unit',
                    unitType: type,
                    position: { x: position.x, y: position.y, z: position.z },
                    netId: myNetId,
                    teamId: (typeof playerTeamId !== 'undefined' ? playerTeamId : 1),
                    faction: selectedFaction
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
                if (unit.mesh && typeof unit.mesh.remove === 'function') {
                    unit.mesh.remove(unit.selectionCircle);
                }
                if (typeof unit.selectionCircle.traverse === 'function') {
                    unit.selectionCircle.traverse(c => {
                        if (c.geometry && typeof c.geometry.dispose === 'function') c.geometry.dispose();
                        if (c.material && typeof c.material.dispose === 'function') c.material.dispose();
                    });
                }
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
            const maxCam = (currentMapSize || 1500) * 0.45;
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
            if (keysPressed['arrowup']) cameraTarget.addScaledVector(forward, panSpeed);
            if (keysPressed['arrowdown']) cameraTarget.addScaledVector(forward, -panSpeed);
            if (keysPressed['arrowleft']) cameraTarget.addScaledVector(right, -panSpeed);
            if (keysPressed['arrowright']) cameraTarget.addScaledVector(right, panSpeed);
            if (keysPressed['arrowup'] || keysPressed['arrowdown'] || 
                keysPressed['arrowleft'] || keysPressed['arrowright']) updateCameraPosition();
        }

        function processCameraScreenEdgePanning(clientX, clientY) {
            // Disabled: Camera movement via screen edges removed per user request.
            // Players pan using WASD / Arrow keys or middle-mouse drag.
        }
		
function triggerRallyPointMode() {
    if (selectedStructure) {
        if (selectedStructure.ownerId && selectedStructure.ownerId !== 'player') {
            showNotification('Cannot set rally points on allied structures!', 'error');
            return;
        }
        showNotification('Click anywhere on battlefield to set Rally Point.', 'info');
    } else {
        showNotification('Select a production building first to set its Rally Point.', 'warning');
    }
}

// Deprecated floating builder palette: structure building is now managed entirely via the bottom Generals command grid
function showBuilderPalette() {}
function hideBuilderPalette() {
    const pal = document.getElementById('builder-palette');
    if (pal) pal.style.display = 'none';
}
function switchBuilderCategory() {}
function renderBuilderPaletteCards() {}


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
    document.body.style.cursor = 'crosshair';
    if (powerType === 'spySatellite') {
        showNotification('USA Spy Satellite: Click terrain or minimap to survey target sector (Right-click/Esc to cancel).', 'info');
    } else if (powerType === 'a10Strike') {
        showNotification('A-10 Thunderbolt Strike: Click ground target to order CAS air strike (Right-click/Esc to cancel).', 'info');
    } else if (powerType === 'artilleryBarrage') {
        showNotification('Red Army Artillery Barrage: Click ground target to order 152mm artillery strike.', 'info');
    } else if (powerType === 'rebelAmbush') {
        showNotification('GLA Rebel Ambush: Click ground target to deploy armed subterranean guerrilla cell.', 'info');
    }
}

function executeGeneralsPowerAt(pos) {
    if (!activeGeneralPower) return false;
    const p = activeGeneralPower;
    activeGeneralPower = null;
    document.body.style.cursor = 'default';

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
    } else if (p === 'artilleryBarrage') {
        showNotification('★ Heavy 152mm Artillery Barrage firing on coordinates!', 'warning');
        playAudio('explosion');
        for (let i = 0; i < 8; i++) {
            setTimeout(() => {
                const scatter = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 16));
                if (typeof spawnEnhancedExplosion === 'function') spawnEnhancedExplosion(scatter, 0xff5722, 3.2, true);
                if (typeof damageHostilesInRadius === 'function') damageHostilesInRadius(scatter, 8.0, 140, 'EXPLOSIVE', units[0] || { teamId: playerTeamId });
            }, i * 250);
        }
        return true;
    } else if (p === 'rebelAmbush') {
        showNotification('★ Rebel Ambush cell surfacing from tunnels!', 'success');
        playAudio('construction', {}, 'gla');
        for (let i = 0; i < 4; i++) {
            const rPos = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6));
            if (typeof spawnUnit === 'function') spawnUnit('rebel', rPos);
        }
        return true;
    }
    return false;
}

function showVictoryBanner() {
    applyOfficialMenuArt(selectedFaction);
    const vModal = document.getElementById('victory-modal');
    if (!vModal) return;
    vModal.style.display = 'flex';
    
    const clockEl = document.getElementById('match-clock');
    const timeEl = document.getElementById('victory-time-val');
    if (timeEl && clockEl) timeEl.textContent = clockEl.textContent || '00:00:00';
    
    const facEl = document.getElementById('victory-faction-val');
    if (facEl) facEl.textContent = (typeof selectedFaction !== 'undefined' ? selectedFaction : 'USA').toUpperCase();

    const rankEl = document.getElementById('victory-rank-val');
    if (rankEl) {
        const sc = typeof playerScore !== 'undefined' ? playerScore : 6000;
        const stars = Math.min(5, Math.floor(sc / 2000) + 1);
        rankEl.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    }
    
    if (typeof playUSASound === 'function') playUSASound('victory');
}

function showDefeatBanner() {
    applyOfficialMenuArt(selectedFaction);
    const dModal = document.getElementById('defeat-modal');
    if (!dModal) return;
    dModal.style.display = 'flex';

    const clockEl = document.getElementById('match-clock');
    const timeEl = document.getElementById('defeat-time-val');
    if (timeEl && clockEl) timeEl.textContent = clockEl.textContent || '00:00:00';

    const facEl = document.getElementById('defeat-faction-val');
    if (facEl) facEl.textContent = (typeof selectedFaction !== 'undefined' ? selectedFaction : 'USA').toUpperCase();

    if (typeof playUSASound === 'function') playUSASound('defeat');
}

function dismissEndGameModal() {
    const vModal = document.getElementById('victory-modal');
    if (vModal) vModal.style.display = 'none';
    const dModal = document.getElementById('defeat-modal');
    if (dModal) dModal.style.display = 'none';
}

function openStartMenuFromEndGame() {
    dismissEndGameModal();
    if (typeof showStartSetupCard === 'function') showStartSetupCard();
}

function applyGroupFormationMove(selectedList, groundHit) {
    if (!selectedList || selectedList.length === 0) return;
    if (selectedList.length === 1) {
        const unit = selectedList[0];
        const bridges = !unit.isAir && typeof findBridgeCrossingsForPath === 'function' ? findBridgeCrossingsForPath(unit.mesh.position, groundHit) : null;
        if (bridges) {
            unit.waypoints = [bridges[0], bridges[1], groundHit.clone()];
            unit.targetPosition.copy(unit.waypoints.shift());
        } else {
            unit.waypoints = [];
            unit.targetPosition.copy(groundHit);
        }
        unit.combatTarget = null;
        unit.taskState = 'Moving';
        if (unit.targetStructure && unit.targetStructure.dozerRef === unit) {
            unit.targetStructure.dozerRef = null; unit.targetStructure = null;
        }
        if (unit.isAir) {
            unit.airState = (unit.airState === 'landed') ? 'taking_off' : (unit.type === 'comanche' || unit.type === 'chinook' ? 'flying' : 'flying');
            unit.patrolCenter.copy(groundHit);
        }
        return;
    }

    // FORMATION MOVEMENT: Organize multiple units into disciplined rank-and-file lines
    let sumX = 0, sumZ = 0;
    selectedList.forEach(u => {
        sumX += u.mesh.position.x;
        sumZ += u.mesh.position.z;
    });
    const squadCenterX = sumX / selectedList.length;
    const squadCenterZ = sumZ / selectedList.length;

    const moveDx = groundHit.x - squadCenterX;
    const moveDz = groundHit.z - squadCenterZ;
    const moveDist = Math.hypot(moveDx, moveDz);

    let fwdX = 0, fwdZ = 1;
    if (moveDist > 0.001) {
        fwdX = moveDx / moveDist;
        fwdZ = moveDz / moveDist;
    }
    const rightX = -fwdZ;
    const rightZ = fwdX;

    // Sort laterally along squad right vector to prevent crossing paths
    selectedList.sort((a, b) => {
        const projA = (a.mesh.position.x - squadCenterX) * rightX + (a.mesh.position.z - squadCenterZ) * rightZ;
        const projB = (b.mesh.position.x - squadCenterX) * rightX + (b.mesh.position.z - squadCenterZ) * rightZ;
        return projA - projB;
    });

    const count = selectedList.length;
    const cols = count <= 4 ? count : Math.min(6, Math.ceil(Math.sqrt(count) * 1.4));

    // Dynamic spacious separation based on unit radius (prevents tank overlap!)
    const maxRadius = Math.max(...selectedList.map(u => u.radius || 1.2));
    const isAllInf = selectedList.every(u => isInfantryType(u.type));
    const spacingX = isAllInf ? 3.2 : Math.max(7.5, maxRadius * 2.35);
    const spacingZ = isAllInf ? 3.5 : Math.max(8.0, maxRadius * 2.50);

    selectedList.forEach((unit, idx) => {
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        const unitsInThisRow = Math.min(cols, count - row * cols);
        const colOffset = (col - (unitsInThisRow - 1) / 2) * spacingX;
        const rowOffset = -row * spacingZ;

        let destX = groundHit.x + rightX * colOffset + fwdX * rowOffset;
        let destZ = groundHit.z + rightZ * colOffset + fwdZ * rowOffset;

        const maxCoord = (typeof currentMapSize !== 'undefined' ? currentMapSize : 600) * 0.45;
        destX = THREE.MathUtils.clamp(destX, -maxCoord, maxCoord);
        destZ = THREE.MathUtils.clamp(destZ, -maxCoord, maxCoord);

        const onBridge = (typeof mapBridges !== 'undefined') ? mapBridges.find(b => isPointOnBridge(destX, destZ, b)) : null;
        if (!onBridge && typeof getTerrainHeight === 'function' && typeof currentWaterLevel !== 'undefined' && getTerrainHeight(destX, destZ) < currentWaterLevel) {
            for (let t = 0.8; t >= 0.1; t -= 0.15) {
                const testX = groundHit.x + (destX - groundHit.x) * t;
                const testZ = groundHit.z + (destZ - groundHit.z) * t;
                if (getTerrainHeight(testX, testZ) >= currentWaterLevel || (typeof mapBridges !== 'undefined' && mapBridges.some(b => isPointOnBridge(testX, testZ, b)))) {
                    destX = testX;
                    destZ = testZ;
                    break;
                }
            }
        }

        const destY = typeof getTerrainHeight === 'function' ? getTerrainHeight(destX, destZ) : 0;
        const destV = new THREE.Vector3(destX, destY, destZ);

        const bridges = !unit.isAir && typeof findBridgeCrossingsForPath === 'function' ? findBridgeCrossingsForPath(unit.mesh.position, destV) : null;
        if (bridges) {
            unit.waypoints = [bridges[0], bridges[1], destV];
            unit.targetPosition.copy(unit.waypoints.shift());
        } else {
            unit.waypoints = [];
            unit.targetPosition.copy(destV);
        }

        unit.combatTarget = null;
        unit.taskState = 'Moving';
        if (unit.targetStructure && unit.targetStructure.dozerRef === unit) {
            unit.targetStructure.dozerRef = null; unit.targetStructure = null;
        }
        if (unit.isAir) {
            unit.airState = (unit.airState === 'landed') ? 'taking_off' : 'flying';
            unit.patrolCenter.copy(destV);
        }
        if (unit.type === 'truck' || unit.type === 'worker') {
            unit.aiState = 'Idle';
        }
    });
}
window.applyGroupFormationMove = applyGroupFormationMove;
