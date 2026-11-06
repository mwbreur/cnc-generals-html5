// C&C GENERALS CONSTRUCTION SIDEBAR RENDERING ENGINE
        // =========================================================================

        function updateSidebar() {
            const body = document.getElementById('sidebar-body');
            if (!body) return;

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
                const ratio = consumed === 0 ? 1 : Math.min(1.5, produced / consumed);
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
                        powerText.style.color = '#42e66b';
                    } else {
                        powerText.textContent = '⚡ POWER: LOW (-50% SPD)';
                        powerText.style.color = '#e74c3c';
                    }
                }
            }

            // 2. Active Tab Rendering
            if (activeSidebarTab === 'structures') {
                renderStructuresPalette(body);
                return;
            }

            if (activeSidebarTab === 'defenses') {
                renderDefensesPalette(body);
                return;
            }

            // Tab: 'production'
            if (selectedStructure) {
                renderSelectedBuildingPanel(body, selectedStructure);
            } else if (selectedSupplyPoint) {
                renderSelectedSupplyPanel(body, selectedSupplyPoint);
            } else {
                const selectedUnits = units.filter(u => u.selected);
                if (selectedUnits.length > 0) {
                    renderSelectedUnitsPanel(body, selectedUnits);
                } else {
                    renderBaseHeadquartersPanel(body);
                }
            }
        }

        function renderSelectedSupplyPanel(container, supplyPoint) {
            const stock = supplyPoint.stock || 0;
            const maxStock = supplyPoint.maxStock || 8000;
            const percent = Math.max(0, Math.min(100, Math.round((stock / maxStock) * 100)));
            const statusText = stock <= 0 ? '⚠ EXHAUSTED' : stock < 2000 ? '⚡ LOW STOCK' : '● ACTIVE RESOURCE';

            let html = `
                <div class="info-card">
                    <div class="info-card-header">
                        <div>
                            <div class="info-card-title">SUPPLY FIELD / DEPOT</div>
                            <div style="font-size: 9px; color: #8e8870; margin-top: 2px;">STRATEGIC RESOURCE CACHE</div>
                        </div>
                        <span class="info-card-status ${stock <= 0 ? 'building' : ''}">${statusText}</span>
                    </div>

                    <div class="hp-wrapper">
                        <div class="hp-labels">
                            <span>REMAINING RESOURCES</span>
                            <span style="color: #ffe685; font-weight: bold;">$${stock.toLocaleString()} / $${maxStock.toLocaleString()} (${percent}%)</span>
                        </div>
                        <div class="hp-bar-track">
                            <div class="hp-bar-fill" style="width: ${percent}%; background: ${percent > 50 ? 'linear-gradient(90deg, #f1c40f, #2ed573)' : percent > 20 ? 'linear-gradient(90deg, #e67e22, #f1c40f)' : 'linear-gradient(90deg, #e74c3c, #e67e22)'};"></div>
                        </div>
                    </div>

                    <div style="font-size: 11px; line-height: 1.5; color: #c5b98e; margin: 8px 0 4px 0;">
                        Supply field contains raw industrial salvage and minerals (4x capacity). Deploy Supply Trucks or Workers to harvest credits for your command.
                    </div>

                    <div class="util-btn-row">
                        <button class="util-btn" onclick="orderAllHarvestersToTargetSupply()" style="color: #ffe685; border-color: #ffd86b;">
                            ⛏ Dispatch All Harvesters
                        </button>
                        <button class="util-btn" onclick="selectedSupplyPoint = null; updateSidebar();">
                            ✕ Deselect
                        </button>
                    </div>
                </div>

                <div class="section-header">
                    <span>RESOURCE OPERATIONS</span>
                </div>
                <div class="cmd-grid">
                    <button class="cmd-btn" style="grid-column: span 2;" onclick="orderAllHarvestersToTargetSupply()">
                        <div class="cmd-btn-name">⛏ HARVEST FROM THIS FIELD</div>
                        <div class="cmd-btn-desc">Orders all friendly trucks and workers to gather supplies here</div>
                        <div class="cmd-btn-footer">
                            <span class="cmd-btn-cost">HARVEST</span>
                            <span class="cmd-btn-badge badge-ready">DISPATCH</span>
                        </div>
                    </button>
                    <button class="cmd-btn" onclick="selectUnitsByType('harvesters')">
                        <div class="cmd-btn-name">SELECT HARVESTERS</div>
                        <div class="cmd-btn-desc">Select all trucks and workers</div>
                        <div class="cmd-btn-footer"><span class="cmd-btn-badge badge-ready">SELECT</span></div>
                    </button>
                    <button class="cmd-btn" onclick="selectedSupplyPoint = null; updateSidebar();">
                        <div class="cmd-btn-name">RETURN TO HQ</div>
                        <div class="cmd-btn-desc">Return to Base Overview</div>
                        <div class="cmd-btn-footer"><span class="cmd-btn-badge badge-ready">HQ</span></div>
                    </button>
                </div>
            `;
            container.innerHTML = html;
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

        function renderSelectedBuildingPanel(container, structure) {
            const names = {
                center: 'Command Center', power: 'Cold Fusion Reactor', nuclearReactor: 'Nuclear Reactor',
                factory: selectedFaction === 'gla' ? 'Arms Dealer' : 'War Factory', supplyCenter: 'Supply Center',
                supplyStash: 'Supply Stash', supplyDrop: 'Supply Drop Zone', airfield: 'Air Field',
                strategyCenter: 'Strategy Center', detentionCamp: 'Detention Camp', internetCenter: 'Internet Center',
                propagandaCenter: 'Propaganda Center', bunker: 'Bunker', patriot: 'Patriot Missile System',
                gatlingCannon: 'Gatling Cannon', speakerTower: 'Speaker Tower', particleCannon: 'Particle Cannon',
                nukeSilo: 'Nuclear Missile Silo', blackMarket: 'Black Market', tunnel: 'Tunnel Network',
                stingerSite: 'Stinger Site', demoTrap: 'Demo Trap', palace: 'Palace', scudStorm: 'SCUD Storm',
                fakeBarracks: 'Fake Barracks', fakeArmsDealer: 'Fake Arms Dealer', barracks: 'Barracks'
            };
            const title = (names[structure.type] || structure.type).toUpperCase();
            const hpPercent = Math.max(0, Math.round((structure.health / structure.maxHealth) * 100));
            const isConstructing = structure.isBuilding;

            let html = `
                <div class="info-card">
                    <div class="info-card-header">
                        <div>
                            <div class="info-card-title">${title}</div>
                            <div style="font-size: 9px; color: #8e8870; margin-top: 2px;">
                                ${structure.isAir ? 'Airfield Structure' : 'Tactical Facility'}
                            </div>
                        </div>
                        <span class="info-card-status ${isConstructing ? 'building' : ''}">
                            ${isConstructing ? '🔨 CONSTRUCTING' : '● OPERATIONAL'}
                        </span>
                    </div>

                    <div class="hp-wrapper">
                        <div class="hp-labels">
                            <span>STRUCTURAL INTEGRITY</span>
                            <span>${Math.ceil(structure.health)} / ${structure.maxHealth} HP (${hpPercent}%)</span>
                        </div>
                        <div class="hp-bar-track">
                            <div class="hp-bar-fill" style="width: ${hpPercent}%;"></div>
                        </div>
                    </div>

                    <div class="util-btn-row">
                        <button class="util-btn" onclick="repairStructure(selectedStructure)" ${structure.health >= structure.maxHealth ? 'disabled style="opacity:0.5;"' : ''}>
                            🔧 Repair ($50)
                        </button>
                        <button class="util-btn sell" onclick="sellStructure(selectedStructure)">
                            💰 Demolish / Sell
                        </button>
                    </div>
                </div>

                <div class="section-header">
                    <span>PRODUCTION &amp; COMMAND ORDERS</span>
                    <span style="font-size: 9px; color: #ffe685;">[HOTKEYS: CLICK]</span>
                </div>
                <div class="cmd-grid" id="building-cmd-grid">
            `;

            // Unit Production Buttons for this building
            const productionType = structure.type === 'center' ? 'commandCenter' : structure.type;
            const producers = Object.entries(unitRoster).filter(([type, spec]) => {
                if (spec.building === productionType) return true;
                if (structure.type === 'supplyCenter' && type === 'truck') return true;
                if (structure.type === 'supplyStash' && type === 'worker') return true;
                if (structure.type === 'factory' && type === 'truck' && selectedFaction !== 'gla') return true;
                return false;
            });

            producers.forEach(([type, spec]) => {
                const techReq = getUnitTechPrerequisite(type);
                const hasTech = !techReq || structures.some(s => s.type === techReq.building && !s.isBuilding && s.health > 0);
                const canAfford = playerResources >= spec.cost;
                const isReady = hasTech && canAfford && !isConstructing;

                let badge = '';
                if (!hasTech) {
                    badge = `<span class="cmd-btn-badge badge-locked">🔒 REQ: ${techReq.name.toUpperCase()}</span>`;
                } else if (!canAfford) {
                    badge = `<span class="cmd-btn-badge badge-funds">NEED FUNDS</span>`;
                } else if (isConstructing) {
                    badge = `<span class="cmd-btn-badge badge-funds">BUILDING...</span>`;
                } else {
                    badge = `<span class="cmd-btn-badge badge-ready">READY</span>`;
                }

                html += `
                    <button class="cmd-btn ${!hasTech ? 'locked-tech' : ''}" onclick="produceUnit('${type}')" onmouseenter="showTacticalTooltip(event, '${type}')" onmouseleave="hideTacticalTooltip()" ${!isReady ? 'disabled' : ''}>
                        <div class="cmd-btn-name">${spec.name}</div>
                        <div class="cmd-btn-footer">
                            <span class="cmd-btn-cost">$${spec.cost}</span>
                            ${badge}
                        </div>
                    </button>
                `;
            });

            // Special Upgrades and Abilities for this building
            const abilityButtons = getBuildingAbilities(structure);
            abilityButtons.forEach(ab => {
                html += `
                    <button class="cmd-btn" onclick="useStructureAbility('${ab.action}')" onmouseenter="showTacticalTooltip(event, '${ab.action}')" onmouseleave="hideTacticalTooltip()" ${ab.disabled ? 'disabled' : ''}>
                        <div class="cmd-btn-name">${ab.label}</div>
                        <div class="cmd-btn-desc">${ab.desc || ''}</div>
                        <div class="cmd-btn-footer">
                            <span class="cmd-btn-cost">${ab.cost ? '$' + ab.cost : 'READY'}</span>
                            <span class="cmd-btn-badge badge-ready">${ab.badge || 'ACTION'}</span>
                        </div>
                    </button>
                `;
            });

            if (producers.length === 0 && abilityButtons.length === 0) {
                html += `
                    <div style="grid-column: span 2; padding: 14px; text-align: center; color: #8e8870; font-size: 11px; background: rgba(0,0,0,0.25); border: 1px dashed #4a4530;">
                        No unit production at this facility.<br>Structure functions automatically.
                    </div>
                `;
            }

            html += `</div>`;
            container.innerHTML = html;
        }

        function getBuildingAbilities(structure) {
            if (structure.isBuilding) return [];
            const abilities = [];

            if (structure.type === 'center') {
                abilities.push({ action: 'intel', label: 'Radar Recon Sweep', desc: 'Scan enemy positions', cost: 0, badge: 'RECON' });
                if (selectedFaction === 'china') {
                    abilities.push({ action: 'plantMines', label: 'Deploy Landmines', desc: 'Perimeter minefield', cost: 100, badge: 'DEFENSE', disabled: structure.minesPlanted });
                }
            } else if (structure.type === 'power') {
                abilities.push({ action: 'upgradePower', label: structure.powerUpgraded ? 'Control Rods Active' : 'Upgrade Control Rods', desc: 'Doubles power output', cost: 300, badge: '+100% PWR', disabled: structure.powerUpgraded });
            } else if (structure.type === 'nuclearReactor') {
                abilities.push({ action: 'overcharge', label: structure.overcharged ? 'Disable Overcharge' : 'Overcharge Reactor', desc: '+50% power generation', cost: 0, badge: 'OVERDRIVE' });
                abilities.push({ action: 'plantMines', label: 'Deploy Landmines', desc: 'Perimeter minefield', cost: 100, badge: 'DEFENSE', disabled: structure.minesPlanted });
            } else if (structure.type === 'factory') {
                if (selectedFaction === 'usa') {
                    abilities.push({ action: 'towMissile', label: 'TOW Missile Tech', desc: 'Humvees gain TOW missile (+40% dmg)', cost: 800, badge: 'UPGRADE', disabled: researchedTechs.has('towMissile') });
                    abilities.push({ action: 'battleDrone', label: 'Battle Drone Upgrade', desc: 'Tanks gain auto-repair drone', cost: 400, badge: 'DRONE', disabled: researchedTechs.has('battleDrone') });
                } else if (selectedFaction === 'china') {
                    abilities.push({ action: 'chainGuns', label: 'Chain Guns Tech', desc: 'Gatling weapons deal +25% dmg', cost: 1000, badge: 'UPGRADE', disabled: researchedTechs.has('chainGuns') });
                } else if (selectedFaction === 'gla') {
                    abilities.push({ action: 'scorpionRocket', label: 'Scorpion Rocket Tech', desc: 'Scorpions mount turret rocket (+40% dmg)', cost: 1000, badge: 'UPGRADE', disabled: researchedTechs.has('scorpionRocket') });
                }
            } else if (structure.type === 'strategyCenter') {
                abilities.push({ action: 'planHold', label: 'Plan: Hold the Line', desc: '+20% armor buff', cost: 0, badge: battlePlan === 'hold' ? 'ACTIVE' : 'SELECT' });
                abilities.push({ action: 'planSearch', label: 'Plan: Search & Destroy', desc: '+20% vision & range', cost: 0, badge: battlePlan === 'search' ? 'ACTIVE' : 'SELECT' });
                abilities.push({ action: 'planBombard', label: 'Plan: Bombardment', desc: '+20% shell damage', cost: 0, badge: battlePlan === 'bombard' ? 'ACTIVE' : 'SELECT' });
                abilities.push({ action: 'compositeArmor', label: 'Composite Armor Tech', desc: 'Tanks gain +25% HP', cost: 1200, badge: 'TECH', disabled: researchedTechs.has('compositeArmor') });
            } else if (structure.type === 'propagandaCenter') {
                abilities.push({ action: 'nationalism', label: 'Nationalism Tech', desc: '+25% attack rate', cost: 1000, badge: 'TECH', disabled: researchedTechs.has('nationalism') });
                abilities.push({ action: 'subliminal', label: 'Subliminal Messaging', desc: '2x speaker recovery', cost: 800, badge: 'TECH', disabled: researchedTechs.has('subliminal') });
                abilities.push({ action: 'uraniumShells', label: 'Uranium Shells Tech', desc: 'Battlemaster/Overlord tanks deal +25% dmg', cost: 1200, badge: 'TECH', disabled: researchedTechs.has('uraniumShells') });
            } else if (structure.type === 'palace') {
                const count = (structure.garrisoned || []).length;
                abilities.push({ action: count > 0 ? 'ungarrison' : 'garrison', label: count > 0 ? `Evacuate Palace (${count})` : 'Garrison Infantry (Up to 5)', desc: 'Fire from fortified slits', cost: 0, badge: count > 0 ? 'EVAC' : 'GARRISON' });
                abilities.push({ action: 'anthraxBeta', label: 'Anthrax Beta Tech', desc: '+25% chemical toxin dmg', cost: 1200, badge: 'TECH', disabled: researchedTechs.has('anthraxBeta') });
                abilities.push({ action: 'armTheMob', label: 'Arm the Mob Tech', desc: 'Mobs get AK-47 assault rifles', cost: 1000, badge: 'TECH', disabled: researchedTechs.has('armTheMob') });
                abilities.push({ action: 'apBullets', label: 'AP Bullets Tech', desc: 'Rebels & Technicals +25% dmg', cost: 1000, badge: 'TECH', disabled: researchedTechs.has('apBullets') });
                abilities.push({ action: 'apRockets', label: 'AP Rockets Tech', desc: 'RPG Troopers & Buggies +25% dmg', cost: 1200, badge: 'TECH', disabled: researchedTechs.has('apRockets') });
                abilities.push({ action: 'junkRepair', label: 'Junk Repair Tech', desc: 'GLA vehicles auto-regenerate (+1 HP/s)', cost: 1000, badge: 'REPAIR', disabled: researchedTechs.has('junkRepair') });
                abilities.push({ action: 'camouflage', label: 'Camouflage Tech', desc: 'Rebels gain stealth when stationary', cost: 1000, badge: 'STEALTH', disabled: researchedTechs.has('camouflage') });
            } else if (structure.type === 'bunker') {
                const count = (structure.garrisoned || []).length;
                abilities.push({ action: count > 0 ? 'ungarrison' : 'garrison', label: count > 0 ? `Evacuate Bunker (${count}/5)` : 'Garrison Nearby Infantry', desc: 'Infantry fire through bunker', cost: 0, badge: count > 0 ? 'EVAC' : 'GARRISON' });
            } else if (structure.type === 'tunnel') {
                abilities.push({ action: 'tunnel', label: 'Tunnel Transfer Network', desc: 'Instantly warp between tunnels', cost: 0, badge: 'WARP' });
            } else if (structure.type === 'internetCenter') {
                abilities.push({ action: 'networkHack', label: 'Satellite Network Hack', desc: 'Steal $250 enemy funds', cost: 0, badge: 'HACK' });
            } else if (['particleCannon', 'nukeSilo', 'scudStorm'].includes(structure.type)) {
                abilities.push({ action: 'superweapon', label: 'FIRE SUPERWEAPON', desc: 'Target weapon strike on map', cost: 0, badge: 'STRIKE' });
            } else if (structure.type === 'barracks') {
                abilities.push({ action: 'captureBuilding', label: 'Capture Tech Upgrade', desc: 'Infantry capture neutral tech', cost: 1000, badge: 'UPGRADE', disabled: researchedTechs.has('captureBuilding') });
            }

            return abilities;
        }

        function renderSelectedUnitsPanel(container, selectedUnits) {
            const hasHarvester = selectedUnits.some(u => u.type === 'truck' || u.type === 'worker');
            const totalHP = selectedUnits.reduce((acc, u) => acc + u.health, 0);
            const maxHP = selectedUnits.reduce((acc, u) => acc + u.maxHealth, 0);
            const percent = Math.max(0, Math.round((totalHP / maxHP) * 100));

            // Breakdown
            const counts = {};
            selectedUnits.forEach(u => { counts[u.type] = (counts[u.type] || 0) + 1; });
            const breakdown = Object.entries(counts).map(([type, c]) => `${c} ${unitRoster[type] ? unitRoster[type].name : type}`).join(', ');

            let html = `
                <div class="info-card">
                    <div class="info-card-header">
                        <div>
                            <div class="info-card-title">COMMAND GROUP (${selectedUnits.length})</div>
                            <div style="font-size: 10px; color: #ffe685; margin-top: 2px;">${breakdown}</div>
                        </div>
                        <span class="info-card-status">READY</span>
                    </div>

                    <div class="hp-wrapper">
                        <div class="hp-labels">
                            <span>SQUAD COMBAT READINESS</span>
                            <span>${Math.ceil(totalHP)} / ${maxHP} HP (${percent}%)</span>
                        </div>
                        <div class="hp-bar-track">
                            <div class="hp-bar-fill" style="width: ${percent}%;"></div>
                        </div>
                    </div>
                </div>

                <div class="section-header">
                    <span>TACTICAL UNIT COMMANDS</span>
                </div>
                <div class="cmd-grid">
            `;

            // Harvester Gather Supplies Button!
            if (hasHarvester) {
                html += `
                    <button class="cmd-btn" style="grid-column: span 2; border-color: #ffd86b; background: linear-gradient(180deg, #3d3b23 0%, #201f12 100%);" onclick="orderSelectedHarvestersToGather()">
                        <div class="cmd-btn-name" style="color: #ffe685; font-size: 12px;">⛏ GATHER SUPPLIES</div>
                        <div class="cmd-btn-desc">Orders selected harvesters to gather supplies from field</div>
                        <div class="cmd-btn-footer">
                            <span class="cmd-btn-cost">HARVEST</span>
                            <span class="cmd-btn-badge badge-ready">DISPATCH</span>
                        </div>
                    </button>
                `;
            }

            // Transport Passengers & Evacuate Control!
            const transportsWithPassengers = selectedUnits.filter(u => u.capacity > 0 && u.garrisoned && u.garrisoned.length > 0);
            if (transportsWithPassengers.length > 0) {
                let totalPassengers = 0;
                const pCounts = {};
                transportsWithPassengers.forEach(t => {
                    totalPassengers += t.garrisoned.length;
                    t.garrisoned.forEach(p => { pCounts[p.type] = (pCounts[p.type] || 0) + 1; });
                });
                const pList = Object.entries(pCounts).map(([type, c]) => `${c} ${type.toUpperCase()}`).join(', ');
                html += `
                    <button class="cmd-btn" style="grid-column: span 2; border-color: #55efc4; background: linear-gradient(180deg, #133a2d 0%, #0d201a 100%);" onclick="orderSelectedTransportsToUnload()">
                        <div class="cmd-btn-name" style="color: #55efc4; font-size: 12px;">⬇ UNLOAD / EVACUATE (${totalPassengers} PASSENGERS)</div>
                        <div class="cmd-btn-desc" style="color: #a8e6cf;">Embarked: ${pList}</div>
                        <div class="cmd-btn-footer">
                            <span class="cmd-btn-cost">DEPLOY</span>
                            <span class="cmd-btn-badge badge-ready">UNLOAD ALL</span>
                        </div>
                    </button>
                `;
            }

            html += `
                    <button class="cmd-btn" onclick="orderUnitsHalt()">
                        <div class="cmd-btn-name">⏹ STOP ORDER</div>
                        <div class="cmd-btn-desc">Halt all movement</div>
                        <div class="cmd-btn-footer"><span class="cmd-btn-badge badge-ready">HALT</span></div>
                    </button>
                    <button class="cmd-btn" onclick="selectUnitsByType('combat')">
                        <div class="cmd-btn-name">⚔ ALL COMBAT</div>
                        <div class="cmd-btn-desc">Select all battle units</div>
                        <div class="cmd-btn-footer"><span class="cmd-btn-badge badge-ready">SELECT</span></div>
                    </button>
                </div>
            `;
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
            showNotification('Unit movement halted.', 'info');
        }

        function renderBaseHeadquartersPanel(container) {
            const combatCount = units.filter(u => !['dozer', 'worker', 'truck'].includes(u.type)).length;
            const harvesterCount = units.filter(u => u.type === 'truck' || u.type === 'worker').length;
            const builderCount = units.filter(u => u.type === 'dozer' || u.type === 'worker').length;

            let html = `
                <div class="info-card">
                    <div class="info-card-header">
                        <div>
                            <div class="info-card-title">BASE STRATEGIC OVERVIEW</div>
                            <div style="font-size: 9px; color: #8e8870; margin-top: 2px;">HEADQUARTERS MONITOR</div>
                        </div>
                        <span class="info-card-status">ONLINE</span>
                    </div>
                    <div style="font-size: 11px; line-height: 1.6; color: #c5b98e; margin: 6px 0;">
                        Operational Assets: <strong>${structures.length}</strong> structures, <strong>${units.length}</strong> units.<br>
                        Combat Force: <strong>${combatCount}</strong> · Harvesters: <strong>${harvesterCount}</strong> · Builders: <strong>${builderCount}</strong>.
                    </div>
                    <div class="util-btn-row">
                        <button class="util-btn" onclick="selectUnitsByType('combat')">⚔ All Combat</button>
                        <button class="util-btn" onclick="selectUnitsByType('harvesters')">⛏ Harvesters</button>
                        <button class="util-btn" onclick="selectUnitsByType('builders')">🔨 Builders</button>
                    </div>
                </div>

                <div class="section-header">
                    <span>QUICK CONSTRUCTION PALETTE</span>
                    <span style="font-size: 9px; color: #ffe685;">[PLACE ON MAP]</span>
                </div>
                <div class="cmd-grid">
            `;

            const buildings = factionBuildings[selectedFaction] || [];
            buildings.forEach(([type, name, cost]) => {
                const structReq = getStructureTechPrerequisite(type);
                const hasTech = !structReq || hasCompletedStructure(structReq.building, structReq.altBuilding);
                const canAfford = playerResources >= cost;
                const isReady = hasTech && canAfford;

                let badge = '';
                if (!hasTech) {
                    badge = `<span class="cmd-btn-badge badge-locked">🔒 REQ: ${structReq.name.toUpperCase()}</span>`;
                } else if (!canAfford) {
                    badge = `<span class="cmd-btn-badge badge-funds">FUNDS</span>`;
                } else {
                    badge = `<span class="cmd-btn-badge badge-ready">BUILD</span>`;
                }

                html += `
                    <button class="cmd-btn ${!hasTech ? 'locked-tech' : ''}" onclick="activateBlueprint('${type}')" onmouseenter="showTacticalTooltip(event, '${type}')" onmouseleave="hideTacticalTooltip()" ${!isReady ? 'disabled' : ''}>
                        <div class="cmd-btn-name">${name}</div>
                        <div class="cmd-btn-footer">
                            <span class="cmd-btn-cost">$${cost}</span>
                            ${badge}
                        </div>
                    </button>
                `;
            });

            html += `</div>`;
            container.innerHTML = html;
        }

        function renderStructuresPalette(container) {
            let html = `
                <div class="section-header">
                    <span>BASE STRUCTURES CATALOG</span>
                    <span style="font-size: 9px; color: #ffe685;">[CLICK TO PLACE]</span>
                </div>
                <div class="cmd-grid">
            `;

            const buildings = factionBuildings[selectedFaction] || [];
            buildings.forEach(([type, name, cost]) => {
                const structReq = getStructureTechPrerequisite(type);
                const hasTech = !structReq || hasCompletedStructure(structReq.building, structReq.altBuilding);
                const canAfford = playerResources >= cost;
                const isReady = hasTech && canAfford;

                let badge = '';
                if (!hasTech) {
                    badge = `<span class="cmd-btn-badge badge-locked">🔒 REQ: ${structReq.name.toUpperCase()}</span>`;
                } else if (!canAfford) {
                    badge = `<span class="cmd-btn-badge badge-funds">FUNDS</span>`;
                } else {
                    badge = `<span class="cmd-btn-badge badge-ready">BUILD</span>`;
                }

                html += `
                    <button class="cmd-btn ${!hasTech ? 'locked-tech' : ''}" onclick="activateBlueprint('${type}')" onmouseenter="showTacticalTooltip(event, '${type}')" onmouseleave="hideTacticalTooltip()" ${!isReady ? 'disabled' : ''}>
                        <div class="cmd-btn-name">${name}</div>
                        <div class="cmd-btn-footer">
                            <span class="cmd-btn-cost">$${cost}</span>
                            ${badge}
                        </div>
                    </button>
                `;
            });

            html += `</div>`;
            container.innerHTML = html;
        }

        function renderDefensesPalette(container) {
            let html = `
                <div class="section-header">
                    <span>PERIMETER DEFENSES &amp; SUPERWEAPONS</span>
                </div>
                <div class="cmd-grid">
            `;

            const allBuildings = factionBuildings[selectedFaction] || [];
            const defenseKeys = ['patriot', 'gatlingCannon', 'speakerTower', 'bunker', 'tunnel', 'stingerSite', 'demoTrap', 'particleCannon', 'nukeSilo', 'scudStorm'];
            const defenses = allBuildings.filter(([type]) => defenseKeys.includes(type));

            defenses.forEach(([type, name, cost]) => {
                const structReq = getStructureTechPrerequisite(type);
                const hasTech = !structReq || hasCompletedStructure(structReq.building, structReq.altBuilding);
                const canAfford = playerResources >= cost;
                const isReady = hasTech && canAfford;

                let badge = '';
                if (!hasTech) {
                    badge = `<span class="cmd-btn-badge badge-locked">🔒 REQ: ${structReq.name.toUpperCase()}</span>`;
                } else if (!canAfford) {
                    badge = `<span class="cmd-btn-badge badge-funds">FUNDS</span>`;
                } else {
                    badge = `<span class="cmd-btn-badge badge-ready">DEPLOY</span>`;
                }

                html += `
                    <button class="cmd-btn ${!hasTech ? 'locked-tech' : ''}" onclick="activateBlueprint('${type}')" onmouseenter="showTacticalTooltip(event, '${type}')" onmouseleave="hideTacticalTooltip()" ${!isReady ? 'disabled' : ''}>
                        <div class="cmd-btn-name">${name}</div>
                        <div class="cmd-btn-footer">
                            <span class="cmd-btn-cost">$${cost}</span>
                            ${badge}
                        </div>
                    </button>
                `;
            });

            html += `</div>`;
            container.innerHTML = html;
        }

        function renderStructureMenu(structure) {
            selectedStructure = structure;
            activeSidebarTab = 'production';
            updateSidebar();
        }

        function updateHUD() {
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
            } else if (action === 'intel') {
                intelTimer = 1800;
                const hostiles = enemyUnits.filter(enemy => enemy.health > 0);
                const report = hostiles.map(enemy => `${enemy.type} (${Math.ceil(enemy.health)} HP)`).join(', ') || 'No hostiles detected';
                showNotification(`Intelligence sweep complete: ${report}.`, 'info');
            } else if (action === 'garrison') {
                structure.garrisoned = units.filter(unit => unit.health > 0 && unit.mesh.visible &&
                    ['infantry', 'redguard', 'tankhunter', 'rocket', 'rpg', 'rebel', 'terrorist', 'pathfinder', 'hacker'].includes(unit.type) &&
                    unit.mesh.position.distanceTo(structure.position) < 18).slice(0, 5);
                structure.garrisoned.forEach(unit => { unit.mesh.visible = false; unit.garrisonedIn = structure; });
                showNotification(`Garrisoned ${structure.garrisoned.length} infantry soldiers inside facility.`, 'success');
            } else if (action === 'ungarrison') {
                (structure.garrisoned || []).forEach((unit, index) => {
                    unit.mesh.visible = true;
                    unit.mesh.position.copy(structure.position).add(new THREE.Vector3(7 + index * 1.5, 0, 0));
                    unit.targetPosition.copy(unit.mesh.position);
                    unit.garrisonedIn = null;
                });
                showNotification(`Evacuated ${structure.garrisoned.length} infantry soldiers from facility.`, 'info');
                structure.garrisoned = [];
            } else if (action === 'tunnel') {
                const exits = structures.filter(candidate => candidate.type === 'tunnel' && candidate !== structure && !candidate.isBuilding);
                if (!exits.length) { showNotification('Build a second Tunnel Network as an exit.', 'error'); return; }
                const exit = exits[0];
                const transferCount = units.filter(unit => unit.health > 0 && unit.mesh.position.distanceTo(structure.position) < 18).length;
                units.filter(unit => unit.health > 0 && unit.mesh.position.distanceTo(structure.position) < 18).forEach((unit, index) => {
                    unit.mesh.position.copy(exit.position).add(new THREE.Vector3(exit.radius + 2 + index * 1.5, 0, 0));
                    unit.targetPosition.copy(unit.mesh.position);
                });
                showNotification(`Tunneled ${transferCount} unit(s) through network.`, 'success');
            } else if (action === 'networkHack') {
                if (buildingTick < (structure.cooldownUntil || 0)) { showNotification('Satellite network hack recharging.', 'error'); return; }
                playerResources += 250;
                structure.cooldownUntil = buildingTick + 600;
                intelTimer = 600;
                showNotification(`Network hack complete: +$250 acquired from orbital relay!`, 'success');
            } else if (action === 'plantMines') {
                if (structure.minesPlanted) { showNotification('Minefield already deployed around facility.', 'info'); return; }
                if (playerResources < 100) { showNotification('Need $100 for landmines.', 'error'); return; }
                playerResources -= 100;
                structure.minesPlanted = true;
                for (const x of [-12, 12]) for (const z of [-12, 12]) {
                    landmines.push({ position: structure.position.clone().add(new THREE.Vector3(x, 0, z)), active: true });
                }
                showNotification('Perimeter landmines deployed around facility.', 'success');
            } else if (action === 'towMissile') {
                if (playerResources < 800) { showNotification('Need $800 for TOW Missiles.', 'error'); return; }
                playerResources -= 800;
                researchedTechs.add('towMissile');
                showNotification('TOW Missiles researched: Humvees equipped with anti-tank missiles (+40% damage)!', 'success');
            } else if (action === 'battleDrone') {
                if (playerResources < 400) { showNotification('Need $400 for Battle Drones.', 'error'); return; }
                playerResources -= 400;
                researchedTechs.add('battleDrone');
                showNotification('Battle Drones researched: Tanks gain auto-repair and point defense!', 'success');
            } else if (action === 'chainGuns') {
                if (playerResources < 1000) { showNotification('Need $1000 for Chain Guns.', 'error'); return; }
                playerResources -= 1000;
                researchedTechs.add('chainGuns');
                showNotification('Chain Guns researched: Gatling weapons fire +25% harder and spin up instantly!', 'success');
            } else if (action === 'uraniumShells') {
                if (playerResources < 1200) { showNotification('Need $1200 for Uranium Shells.', 'error'); return; }
                playerResources -= 1200;
                researchedTechs.add('uraniumShells');
                showNotification('Uranium Shells researched: Battlemaster & Overlord tank rounds deal +25% damage!', 'success');
            } else if (action === 'scorpionRocket') {
                if (playerResources < 1000) { showNotification('Need $1000 for Scorpion Rockets.', 'error'); return; }
                playerResources -= 1000;
                researchedTechs.add('scorpionRocket');
                showNotification('Scorpion Rockets researched: Scorpion tanks equipped with explosive turret rockets!', 'success');
            } else if (action === 'apBullets') {
                if (playerResources < 1000) { showNotification('Need $1000 for AP Bullets.', 'error'); return; }
                playerResources -= 1000;
                researchedTechs.add('apBullets');
                showNotification('AP Bullets researched: Rebels, Technicals, and Quad Cannons deal +25% damage!', 'success');
            } else if (action === 'apRockets') {
                if (playerResources < 1200) { showNotification('Need $1200 for AP Rockets.', 'error'); return; }
                playerResources -= 1200;
                researchedTechs.add('apRockets');
                showNotification('AP Rockets researched: RPG Troopers & Rocket Buggies deal +25% armor-piercing damage!', 'success');
            } else if (action === 'junkRepair') {
                if (playerResources < 1000) { showNotification('Need $1000 for Junk Repair.', 'error'); return; }
                playerResources -= 1000;
                researchedTechs.add('junkRepair');
                showNotification('Junk Repair researched: All GLA armored vehicles continuously self-heal!', 'success');
            } else if (action === 'camouflage') {
                if (playerResources < 1000) { showNotification('Need $1000 for Camouflage.', 'error'); return; }
                playerResources -= 1000;
                researchedTechs.add('camouflage');
                showNotification('Camouflage researched: Rebels become invisible when motionless!', 'success');
            } else if (action === 'superweapon') {
                if (buildingTick < (structure.cooldownUntil || 0)) { showNotification('Superweapon is recharging.', 'error'); return; }
                pendingSuperweapon = structure;
                showNotification(`Click map to target ${structure.type === 'particleCannon' ? 'Particle Cannon' : structure.type === 'nukeSilo' ? 'Nuclear Strike' : 'SCUD Storm'}. Right-click to cancel.`, 'info');
            }

            document.getElementById('resource-display').textContent = `$${playerResources}`;
            updateSidebar();
        }

        function strikeWithSuperweapon(structure, targetPosition) {
            const radius = structure.type === 'particleCannon' ? 18 : 24;
            const damage = structure.type === 'particleCannon' ? 500 : structure.type === 'nukeSilo' ? 650 : 450;
            enemyUnits.forEach(enemy => {
                if (enemy.mesh.position.distanceTo(targetPosition) <= radius) enemy.health -= damage;
            });
            createImpactExplosion(targetPosition);
            structure.lastFired = buildingTick;
            structure.cooldownUntil = buildingTick + 1800;
            pendingSuperweapon = null;
            selectionStatus.textContent = 'Superweapon impact confirmed.';
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
		