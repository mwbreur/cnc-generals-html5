// REAL-TIME WEBRTC P2P MULTIPLAYER ENGINE (PEER.JS) & BASE DEFENSE SYSTEMS
// =========================================================================
let isMultiplayerActive = false;
let isMultiplayerHost = false;
let netPeer = null;
let netConn = null;
let currentRoomCode = '';
let mpOpponentFaction = 'china';
let netIdSequence = 100;

const MP_PROTOCOL_VERSION = 2;
const MP_ALLOWED_FACTIONS = new Set(['usa', 'china', 'gla', 'random']);
let _mpTxSeq = 0;
let _mpLastRxSeq = 0;
let _mpLastRxStateSeq = 0;
let _mpRateWindowStart = 0;
let _mpRateWindowCount = 0;
const MP_RATE_LIMIT_PER_SEC = 120;

function generateRoomToken(length = 6) {
    const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Unambiguous uppercase alphanumeric (32 chars)
    let token = '';
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(length);
        crypto.getRandomValues(bytes);
        for (let i = 0; i < length; i++) token += alphabet[bytes[i] & 31];
    } else {
        for (let i = 0; i < length; i++) token += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return token;
}

function resetMultiplayerTransportState() {
    _mpTxSeq = 0;
    _mpLastRxSeq = 0;
    _mpLastRxStateSeq = 0;
    _mpRateWindowStart = 0;
    _mpRateWindowCount = 0;
}

function cleanupPeerSession() {
    if (netConn) {
        try { if (typeof netConn.removeAllListeners === 'function') netConn.removeAllListeners(); } catch (e) {}
        try { netConn.close(); } catch (e) {}
        netConn = null;
    }
    if (netPeer) {
        try { if (typeof netPeer.removeAllListeners === 'function') netPeer.removeAllListeners(); } catch (e) {}
        try { netPeer.destroy(); } catch (e) {}
        netPeer = null;
    }
    resetMultiplayerTransportState();
}
window.cleanupPeerSession = cleanupPeerSession;

function validateNetworkPacket(packet, isHostReceiver = false) {
    if (!packet || typeof packet !== 'object' || typeof packet.type !== 'string') {
        return { valid: false, reason: 'invalid_envelope' };
    }
    if (packet.v !== undefined && packet.v !== MP_PROTOCOL_VERSION) {
        return { valid: false, reason: 'protocol_version_mismatch' };
    }
    if (packet.seq !== undefined && (!Number.isInteger(packet.seq) || packet.seq < 0)) {
        return { valid: false, reason: 'invalid_sequence' };
    }
    // Host-only authoritative packet types that a client peer is never allowed to forge
    const hostOnlyTypes = new Set(['lobby_sync', 'start_battle', 'state_sync', 'host_left', 'unit_damage']);
    if (isHostReceiver && hostOnlyTypes.has(packet.type)) {
        return { valid: false, reason: 'authority_violation' };
    }
    const isFiniteVec = (v) => Boolean(v && typeof v === 'object' && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z));
    switch (packet.type) {
        case 'handshake':
            if (typeof packet.clientFaction !== 'string' || !MP_ALLOWED_FACTIONS.has(packet.clientFaction.toLowerCase())) {
                return { valid: false, reason: 'invalid_faction' };
            }
            return { valid: true };
        case 'lobby_sync':
            if (!Array.isArray(packet.slots)) return { valid: false, reason: 'invalid_slots' };
            return { valid: true };
        case 'start_battle':
            if (typeof packet.mapType !== 'string' || !Number.isFinite(packet.mapSize) || !Number.isFinite(packet.money)) {
                return { valid: false, reason: 'invalid_start_config' };
            }
            return { valid: true };
        case 'move_units':
            if (!Array.isArray(packet.unitNetIds) || packet.unitNetIds.length > 200 || !isFiniteVec(packet.targetPos)) {
                return { valid: false, reason: 'invalid_move_units' };
            }
            return { valid: true };
        case 'attack_target':
            if (!Array.isArray(packet.unitNetIds) || packet.unitNetIds.length > 200 || typeof packet.targetNetId !== 'string') {
                return { valid: false, reason: 'invalid_attack_target' };
            }
            return { valid: true };
        case 'spawn_unit':
            if (typeof packet.unitType !== 'string' || typeof packet.netId !== 'string' || !isFiniteVec(packet.position)) {
                return { valid: false, reason: 'invalid_spawn_unit' };
            }
            return { valid: true };
        case 'build_structure':
            if (typeof packet.structType !== 'string' || typeof packet.netId !== 'string' || !isFiniteVec(packet.position)) {
                return { valid: false, reason: 'invalid_build_structure' };
            }
            return { valid: true };
        case 'unit_damage':
            if (typeof packet.targetNetId !== 'string' || !Number.isFinite(packet.remainingHealth)) {
                return { valid: false, reason: 'invalid_unit_damage' };
            }
            return { valid: true };
        case 'state_sync':
            if (!Array.isArray(packet.u) || !Array.isArray(packet.s)) {
                return { valid: false, reason: 'invalid_state_sync' };
            }
            return { valid: true };
        case 'chat':
            if (typeof packet.sender !== 'string' || typeof packet.text !== 'string' || packet.text.length > 240) {
                return { valid: false, reason: 'invalid_chat' };
            }
            return { valid: true };
        case 'host_left':
        case 'client_left':
            return { valid: true };
        default:
            return { valid: false, reason: 'unknown_packet_type' };
    }
}
window.validateNetworkPacket = validateNetworkPacket;

// --- DEDICATED SKIRMISH, MULTIPLAYER, AND EDITOR SCREENS ---
let currentStartMenuMode = 'single';

function switchGameModeTab(mode) {
    const spPanel = document.getElementById('sp-controls-panel');
    const mpPanel = document.getElementById('mp-controls-panel');
    const edPanel = document.getElementById('editor-controls-panel');
    const menuTitle = document.getElementById('setup-screen-title');
    const factionSection = document.getElementById('faction-selection');
    const startCard = document.getElementById('start-card');
    const startMenu = document.getElementById('start-menu');

    if (!['single', 'multiplayer', 'editor'].includes(mode)) mode = 'single';
    currentStartMenuMode = mode;
    [spPanel, mpPanel, edPanel].forEach(p => { if (p) p.style.display = 'none'; });

    if (mode === 'single') {
        if (spPanel) spPanel.style.display = 'block';
        if (menuTitle) menuTitle.textContent = 'Skirmish';
        if (factionSection) factionSection.style.display = 'none';
        if (startCard) startCard.classList.add('zh-skirmish-card');
        if (startMenu) startMenu.classList.add('zh-skirmish-backdrop');
        onMapSelectionChange('single');
        if (typeof loadSkirmishStats === 'function') loadSkirmishStats();
        if (typeof updateSkirmishMapSummary === 'function') updateSkirmishMapSummary();
    } else if (mode === 'multiplayer') {
        if (mpPanel) mpPanel.style.display = 'block';
        if (menuTitle) menuTitle.textContent = 'Multiplayer';
        if (factionSection) factionSection.style.display = '';
        if (startCard) startCard.classList.remove('zh-skirmish-card');
        if (startMenu) startMenu.classList.remove('zh-skirmish-backdrop');
        if (!netPeer) initHostPeer();
        onMapSelectionChange('multiplayer');
    } else if (mode === 'editor') {
        if (edPanel) edPanel.style.display = 'block';
        if (menuTitle) menuTitle.textContent = 'Map Editor';
        if (factionSection) factionSection.style.display = 'none';
        if (startCard) startCard.classList.remove('zh-skirmish-card');
        if (startMenu) startMenu.classList.remove('zh-skirmish-backdrop');
        renderEditorCanvas();
        loadSavedMapsList();
    }
    if (typeof applyOfficialMenuArt === 'function') applyOfficialMenuArt();
}

function switchMpSubTab(tab) {
    const hostBtn = document.getElementById('sub-tab-host');
    const joinBtn = document.getElementById('sub-tab-join');
    const hostSection = document.getElementById('mp-host-section');
    const joinSection = document.getElementById('mp-join-section');

    if (tab === 'host') {
        hostBtn.classList.add('active');
        joinBtn.classList.remove('active');
        hostSection.style.display = 'block';
        joinSection.style.display = 'none';
        if (!netPeer) initHostPeer();
    } else {
        joinBtn.classList.add('active');
        hostBtn.classList.remove('active');
        joinSection.style.display = 'block';
        hostSection.style.display = 'none';
    }
}

function copyHostRoomCode() {
    const input = document.getElementById('mp-host-room-code');
    if (!input || !input.value) return;
    navigator.clipboard.writeText(input.value).then(() => {
            showNotification("Room code copied to clipboard: " + input.value, "info");
    }).catch(() => {
            input.select();
            document.execCommand('copy');
            showNotification("Room code copied: " + input.value, "info");
    });
}

// --- AUTOMATIC OFF-GRID LAN RELAY DETECTION & ADAPTER ---
let _lanServerProbePromise = null;
function detectLanServer() {
    if (_lanServerProbePromise) return _lanServerProbePromise;
    if (typeof window === 'undefined' || typeof fetch !== 'function' || typeof WebSocket !== 'function' || !window.location || !/^https?:$/.test(window.location.protocol)) {
        _lanServerProbePromise = Promise.resolve(null);
        return _lanServerProbePromise;
    }
    _lanServerProbePromise = new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 1500);
        fetch('/api/lan-status', { cache: 'no-store' })
            .then(r => (r && r.ok ? r.json() : null))
            .then(data => {
                clearTimeout(timer);
                if (data && data.ok && data.mode === 'lan') {
                    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                    const wsPath = data.wsPath || '/lan-ws';
                    resolve({ wsUrl: `${proto}//${window.location.host}${wsPath}` });
                } else {
                    resolve(null);
                }
            })
            .catch(() => {
                clearTimeout(timer);
                resolve(null);
            });
    });
    return _lanServerProbePromise;
}

function createLanRelayConnection(ws) {
    const handlers = { data: [], close: [], open: [] };
    const conn = {
        open: ws.readyState === 1,
        isLanRelay: true,
        on(event, fn) {
            if (handlers[event]) handlers[event].push(fn);
        },
        send(payload) {
            if (!conn.open || ws.readyState !== 1) return;
            try {
                ws.send(JSON.stringify({ _lan: 'data', payload }));
            } catch (err) {
                console.warn('LAN relay send error:', err);
            }
        },
        close() {
            conn.open = false;
            try { ws.close(); } catch (_) {}
        },
        _emit(event, arg) {
            if (event === 'close') conn.open = false;
            (handlers[event] || []).forEach(fn => {
                try { fn(arg); } catch (e) { console.error(e); }
            });
        }
    };
    return conn;
}

function initHostPeerLan(lanInfo, statusEl) {
    try {
        const ws = new WebSocket(lanInfo.wsUrl);
        let activeConn = null;
        netPeer = {
            destroy() {
                try { ws.close(); } catch (_) {}
            }
        };
        ws.onopen = () => {
            ws.send(JSON.stringify({ _lan: 'host', room: currentRoomCode }));
        };
        ws.onmessage = (ev) => {
            let msg;
            try { msg = JSON.parse(ev.data); } catch (_) { return; }
            if (!msg || typeof msg !== 'object') return;
            if (msg._lan === 'hosted') {
                isMultiplayerHost = true;
                if (statusEl) {
                    statusEl.innerHTML = `🟢 <strong>[LAN]</strong> Room <strong>${escapeHtml(currentRoomCode)}</strong> created. Share this code with your LAN challenger and wait for connection.`;
                }
            } else if (msg._lan === 'peer_connected') {
                activeConn = createLanRelayConnection(ws);
                activeConn.open = true;
                netConn = activeConn;
                setupNetDataConnection(activeConn);
                if (statusEl) {
                    statusEl.innerHTML = `🟢 <strong>[LAN] CHALLENGER CONNECTED!</strong> Opponent ready. Click "LAUNCH MULTIPLAYER BATTLE" to deploy.`;
                }
                const launchBtn = document.getElementById('mp-launch-btn');
                if (launchBtn) {
                    launchBtn.disabled = false;
                    launchBtn.style.opacity = '1';
                    launchBtn.style.cursor = 'pointer';
                    launchBtn.style.borderColor = '#55efc4';
                    launchBtn.style.color = '#55efc4';
                }
            } else if (msg._lan === 'data' && activeConn) {
                activeConn._emit('data', msg.payload);
            } else if (msg._lan === 'peer_disconnected' && activeConn) {
                activeConn._emit('close');
            } else if (msg._lan === 'error') {
                if (msg.code === 'unavailable-id') {
                    setTimeout(initHostPeer, 500);
                } else if (statusEl) {
                    statusEl.innerHTML = `<span style="color:#ff6b6b;">LAN notice: ${escapeHtml(msg.message || 'error')}</span>`;
                }
            }
        };
        ws.onclose = () => {
            if (activeConn) activeConn._emit('close');
        };
        ws.onerror = () => {
            if (statusEl) statusEl.innerHTML = '<span style="color:#ff4757;">Failed to connect to local LAN server.</span>';
        };
    } catch (err) {
        console.error('LAN host init error:', err);
        if (statusEl) statusEl.innerHTML = '<span style="color:#ff4757;">Failed to initialize LAN host session.</span>';
    }
}

function joinConnectToHostLan(lanInfo, statusEl) {
    try {
        const ws = new WebSocket(lanInfo.wsUrl);
        let activeConn = null;
        netPeer = {
            destroy() {
                try { ws.close(); } catch (_) {}
            }
        };
        ws.onopen = () => {
            ws.send(JSON.stringify({ _lan: 'join', room: currentRoomCode }));
        };
        ws.onmessage = (ev) => {
            let msg;
            try { msg = JSON.parse(ev.data); } catch (_) { return; }
            if (!msg || typeof msg !== 'object') return;
            if (msg._lan === 'joined') {
                activeConn = createLanRelayConnection(ws);
                activeConn.open = true;
                netConn = activeConn;
                setupNetDataConnection(activeConn);
                isMultiplayerHost = false;
                if (statusEl) {
                    statusEl.innerHTML = `🟢 <strong>[LAN] CONNECTED TO HOST!</strong> Waiting for host to launch the battle...`;
                }
                broadcastNetPacket({
                    type: 'handshake',
                    clientFaction: selectedFaction
                });
            } else if (msg._lan === 'data' && activeConn) {
                activeConn._emit('data', msg.payload);
            } else if (msg._lan === 'peer_disconnected' && activeConn) {
                activeConn._emit('close');
            } else if (msg._lan === 'error') {
                if (statusEl) {
                    statusEl.innerHTML = `<span style="color:#ff6b6b;">LAN join failed: ${escapeHtml(msg.message || 'Room not found')}</span>`;
                }
            }
        };
        ws.onclose = () => {
            if (activeConn) activeConn._emit('close');
        };
        ws.onerror = () => {
            if (statusEl) statusEl.innerHTML = '<span style="color:#ff4757;">Failed to reach local LAN server.</span>';
        };
    } catch (err) {
        console.error('LAN join error:', err);
        if (statusEl) statusEl.innerHTML = '<span style="color:#ff4757;">Failed to connect to local LAN server.</span>';
    }
}

// --- PEERJS / LAN HOST INITIALIZATION ---
function initHostPeer() {
    cleanupPeerSession();

    const randToken = generateRoomToken(6);
    currentRoomCode = 'CNC-' + randToken;
    const peerId = 'cnc-gen-' + randToken;

    const codeInput = document.getElementById('mp-host-room-code');
    const statusEl = document.getElementById('mp-host-status');
    if (codeInput) codeInput.value = currentRoomCode;
    if (statusEl) statusEl.innerHTML = 'Establishing room...';

    detectLanServer().then((lanInfo) => {
        if (lanInfo) {
            initHostPeerLan(lanInfo, statusEl);
            return;
        }
        if (typeof Peer === 'undefined') {
            if (statusEl) statusEl.innerHTML = '<span style="color:#ff4757;">⚠️ PeerJS offline and no local LAN server detected. Run <code>npm run lan</code> for off-grid multiplayer.</span>';
            return;
        }
        if (statusEl) statusEl.innerHTML = 'Establishing room on PeerJS broker...';
        try {
            netPeer = new Peer(peerId, { debug: 1 });

            netPeer.on('open', (id) => {
                    isMultiplayerHost = true;
                    if (statusEl) {
                        statusEl.innerHTML = `🟢 Room <strong>${currentRoomCode}</strong> created. Share this code with your challenger and wait for connection.`;
                    }
            });

            netPeer.on('connection', (conn) => {
                    netConn = conn;
                    setupNetDataConnection(conn);
                    if (statusEl) {
                        statusEl.innerHTML = `🟢 <strong>CHALLENGER CONNECTED!</strong> Opponent ready. Click "LAUNCH MULTIPLAYER BATTLE" to deploy.`;
                    }
                    const launchBtn = document.getElementById('mp-launch-btn');
                    if (launchBtn) {
                        launchBtn.disabled = false;
                        launchBtn.style.opacity = '1';
                        launchBtn.style.cursor = 'pointer';
                        launchBtn.style.borderColor = '#55efc4';
                        launchBtn.style.color = '#55efc4';
                    }
            });

            netPeer.on('error', (err) => {
                    console.warn('Peer error:', err);
                    if (err.type === 'unavailable-id') {
                        setTimeout(initHostPeer, 500);
                    } else if (statusEl) {
                        statusEl.innerHTML = `<span style="color:#ff6b6b;">Peer notice: ${err.message || err.type}</span>`;
                    }
            });
        } catch (err) {
            console.error('Peer init error:', err);
            if (statusEl) statusEl.innerHTML = '<span style="color:#ff4757;">Failed to initialize PeerJS.</span>';
        }
    });
}

// --- PEERJS / LAN CLIENT JOIN INITIALIZATION ---
function joinConnectToHost() {
    const input = document.getElementById('mp-join-input');
    const rawCode = (input.value || '').trim().toUpperCase();
    if (!rawCode) {
        showNotification("Please enter a room code.", "error");
        return;
    }

    const cleanCode = rawCode.replace('CNC-', '').replace('CNC', '').trim();
    const targetPeerId = 'cnc-gen-' + cleanCode;
    currentRoomCode = 'CNC-' + cleanCode;

    const statusEl = document.getElementById('mp-join-status');
    if (statusEl) statusEl.innerHTML = `Connecting to host room <strong>${escapeHtml(currentRoomCode)}</strong>...`;

    cleanupPeerSession();

    detectLanServer().then((lanInfo) => {
        if (lanInfo) {
            joinConnectToHostLan(lanInfo, statusEl);
            return;
        }
        if (typeof Peer === 'undefined') {
            if (statusEl) statusEl.innerHTML = '<span style="color:#ff4757;">⚠️ PeerJS offline and no local LAN server detected. Run <code>npm run lan</code> for off-grid multiplayer.</span>';
            return;
        }
        try {
            netPeer = new Peer({ debug: 1 });

            netPeer.on('open', (myId) => {
                    netConn = netPeer.connect(targetPeerId, { reliable: true });
                    setupNetDataConnection(netConn);

                    netConn.on('open', () => {
                            isMultiplayerHost = false;
                            if (statusEl) {
                                statusEl.innerHTML = `🟢 <strong>CONNECTED TO HOST!</strong> Waiting for host to launch the battle...`;
                            }
                            broadcastNetPacket({
                                    type: 'handshake',
                                    clientFaction: selectedFaction
                            });
                    });
            });

            netPeer.on('error', (err) => {
                    console.warn('Join error:', err);
                    if (statusEl) {
                        statusEl.innerHTML = `<span style="color:#ff6b6b;">Connection failed: Could not reach host ${currentRoomCode}. Verify room code.</span>`;
                    }
            });
        } catch (e) {
            console.error('Join error:', e);
            if (statusEl) statusEl.innerHTML = '<span style="color:#ff4757;">Failed to connect to PeerJS broker.</span>';
        }
    });
}

// --- DATA CHANNEL PACKET HANDLERS ---
function setupNetDataConnection(conn) {
    conn.on('data', (packet) => {
            handleNetworkPacket(packet);
    });

    conn.on('close', () => {
            if (!isMultiplayerHost && isMultiplayerActive) {
                onHostDisconnected("The host commander has disconnected and terminated the session.");
            } else if (isMultiplayerHost && isMultiplayerActive) {
                showNotification("Challenger disconnected from the match.", "error");
                const badge = document.getElementById('mp-status-badge');
                if (badge) badge.innerHTML = '🔴 CHALLENGER DISCONNECTED';
            }
    });
}

function renderClientSlotsList(slots) {
    const el = document.getElementById('mp-client-slots-list');
    if (!el) return;
    let html = '';
    slots.filter(s => s.active).forEach(s => {
            const teamPillClass = `team-${s.team}`;
            html += `<div style="display:flex; justify-content:space-between; align-items:center; background:rgba(20,28,22,0.8); border:1px solid #2e3d31; padding:5px 8px; border-radius:3px; margin-bottom:4px; font-size:11px;">
                <span><strong>${escapeHtml(s.name)}</strong> (${s.faction.toUpperCase()})</span>
                <div>
                    <span class="team-pill ${teamPillClass}">Team ${s.team}</span>
                    <span style="color:#55efc4; margin-left:6px;">Spawn ${s.spawnId}</span>
                </div>
            </div>`;
    });
    el.innerHTML = html;
}

function syncMpLobbyToPeer() {
    if (!netConn || !netConn.open) return;
    const moneyEl = document.getElementById('mp-starting-money');
    const unitsEl = document.getElementById('mp-starting-units');
    const envEl = document.getElementById('mp-map-env');
    const sizeEl = document.getElementById('mp-map-size');
    broadcastNetPacket({
            type: 'lobby_sync',
            slots: mpSlots,
            startingMoney: moneyEl ? parseInt(moneyEl.value, 10) : 10000,
            startingUnits: unitsEl ? unitsEl.value : 'small',
            mapEnv: envEl ? envEl.value : 'desert',
            mapSize: sizeEl ? parseInt(sizeEl.value, 10) : 1500,
            customMapData: activeCustomMap ? activeCustomMap : null
    });
}

function broadcastNetPacket(packet) {
    if (netConn && netConn.open && packet && typeof packet === 'object') {
        try {
            packet.v = MP_PROTOCOL_VERSION;
            packet.seq = ++_mpTxSeq;
            packet.ts = Math.round(typeof performance !== 'undefined' ? performance.now() : Date.now());
            netConn.send(packet);
        } catch (e) {
            console.error('Packet broadcast error:', e);
        }
    }
}

function handleNetworkPacket(packet) {
    // 1. Per-second token-bucket rate limiter
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowMs - _mpRateWindowStart > 1000) {
        _mpRateWindowStart = nowMs;
        _mpRateWindowCount = 0;
    }
    if (++_mpRateWindowCount > MP_RATE_LIMIT_PER_SEC) {
        console.warn('Multiplayer rate limit exceeded; dropping excess packet');
        return false;
    }

    // 2. Schema, protocol version & host-authority validation
    const check = validateNetworkPacket(packet, isMultiplayerHost);
    if (!check.valid) {
        console.warn('Rejected invalid multiplayer packet:', check.reason);
        return false;
    }

    // 3. Sequence ordering: drop stale out-of-order state_sync snapshots
    if (typeof packet.seq === 'number') {
        if (packet.type === 'state_sync') {
            if (packet.seq <= _mpLastRxStateSeq) return false;
            _mpLastRxStateSeq = packet.seq;
        }
        if (packet.seq > _mpLastRxSeq) _mpLastRxSeq = packet.seq;
    }

    if (packet.type === 'handshake') {
        mpOpponentFaction = packet.clientFaction || 'china';
        if (mpSlots[1]) mpSlots[1].faction = mpOpponentFaction;
        const statusEl = document.getElementById('mp-host-status');
        if (statusEl) {
            statusEl.innerHTML = `🟢 <strong>CHALLENGER CONNECTED!</strong> (Opponent: ${mpOpponentFaction.toUpperCase()}). Ready to launch.`;
        }
        syncMpLobbyToPeer();
    }
    else if (packet.type === 'lobby_sync') {
        // Client receives live room configuration from Host
        if (packet.slots) {
            mpSlots = packet.slots;
            if (packet.mapEnv) {
                const sel = document.getElementById('mp-map-env');
                if (sel) sel.value = packet.mapEnv;
            }
            if (packet.mapSize) {
                const sel = document.getElementById('mp-map-size');
                if (sel) sel.value = String(packet.mapSize);
            }
            if (packet.customMapData) {
                activeCustomMap = packet.customMapData;
                savedCustomMaps[packet.customMapData.id] = packet.customMapData;
            }
            const clientView = document.getElementById('mp-client-view');
            if (clientView) clientView.style.display = 'block';
            renderMapPreview('mp-client-map-preview', packet.mapEnv || 'desert', packet.mapSize || 1500, mpSlots, false);
            renderClientSlotsList(mpSlots);
        }
    }
    else if (packet.type === 'start_battle') {
        // Client receives launch packet from host
        startMultiplayerMatch(false, packet);
    }
    else if (packet.type === 'move_units') {
        // Remote peer ordered movement
        const ids = new Set(packet.unitNetIds || []);
        const targetPos = new THREE.Vector3(packet.targetPos.x, packet.targetPos.y, packet.targetPos.z);
        enemyUnits.forEach(enemy => {
                if (ids.has(enemy.netId)) {
                    enemy.targetPosition.copy(targetPos);
                    enemy.combatTarget = null;
                    if (enemy.isAir) {
                        enemy.airState = 'flying';
                        if (!enemy.patrolCenter) enemy.patrolCenter = new THREE.Vector3();
                        enemy.patrolCenter.copy(targetPos);
                    }
                }
        });
    }
    else if (packet.type === 'attack_target') {
        const ids = new Set(packet.unitNetIds || []);
        const localTarget = units.find(u => u.netId === packet.targetNetId) ||
        structures.find(s => s.netId === packet.targetNetId) ||
        enemyUnits.find(eu => eu.netId === packet.targetNetId) ||
        enemyStructures.find(es => es.netId === packet.targetNetId);
        if (localTarget) {
            enemyUnits.forEach(enemy => {
                    if (ids.has(enemy.netId)) {
                        enemy.combatTarget = localTarget;
                    }
            });
        }
    }
    else if (packet.type === 'host_left') {
        if (!isMultiplayerHost && isMultiplayerActive) {
            onHostDisconnected(packet.message || "Host has left the match.");
        }
    }
    else if (packet.type === 'client_left') {
        showNotification(packet.message || "Challenger has left the match.", "error");
        const badge = document.getElementById('mp-status-badge');
        if (badge) badge.innerHTML = '🔴 CHALLENGER DISCONNECTED';
    }
    else if (packet.type === 'spawn_unit') {
        const pos = new THREE.Vector3(packet.position.x, packet.position.y, packet.position.z);
        const spawnTeam = packet.teamId !== undefined ? packet.teamId : (isMultiplayerHost ? 2 : 1);
        const isAlly = (spawnTeam === playerTeamId);
        const unit = spawnEnemyUnit(packet.unitType, pos, packet.netId, packet.faction);
        unit.teamId = spawnTeam;
        unit.ownerId = isAlly ? 'ally' : 'challenger';
        unit.isAI = false;
        if (packet.faction) unit.faction = packet.faction;
    }
    else if (packet.type === 'build_structure') {
        const pos = new THREE.Vector3(packet.position.x, packet.position.y, packet.position.z);
        const structTeam = packet.teamId !== undefined ? packet.teamId : (isMultiplayerHost ? 2 : 1);
        const isAlly = (structTeam === playerTeamId);
        const foeFaction = packet.faction || (isMultiplayerHost ? mpOpponentFaction : 'usa');
        const group = (typeof createStructureMeshForFaction === 'function')
        ? createStructureMeshForFaction(packet.structType, foeFaction, true)
        : createChinaWarFactory();
        if (!group.userData || !group.userData.isW3D) {
            group.scale.set(1.35, 1.35, 1.35);
        }
        group.position.copy(pos);
        if (packet.position && packet.position.rotationY) group.rotation.y = packet.position.rotationY;
        scene.add(group);
        enemyStructures.push({
                type: packet.structType,
                faction: foeFaction,
                position: pos,
                mesh: group,
                health: 1200,
                maxHealth: 1200,
                radius: (typeof getStructureFootprint === 'function') ? getStructureFootprint(packet.structType).radius : 8,
                buildProgress: 100,
                isBuilding: false,
                netId: packet.netId,
                teamId: structTeam,
                ownerId: isAlly ? 'ally' : 'challenger',
                isAI: false
        });
    }
    else if (packet.type === 'unit_damage') {
        const target = units.find(u => u.netId === packet.targetNetId) ||
        structures.find(s => s.netId === packet.targetNetId) ||
        enemyUnits.find(eu => eu.netId === packet.targetNetId) ||
        enemyStructures.find(es => es.netId === packet.targetNetId);
        if (target) {
            target.health = packet.remainingHealth;
        }
    }
    else if (packet.type === 'state_sync' && !isMultiplayerHost) {
        const seenUnitIds = new Set();
        const unitMap = new Map();
        const localSet = new Set();
        for (let i = 0; i < units.length; i++) if (units[i].netId) { unitMap.set(units[i].netId, units[i]); localSet.add(units[i]); }
        for (let i = 0; i < enemyUnits.length; i++) if (enemyUnits[i].netId) unitMap.set(enemyUnits[i].netId, enemyUnits[i]);
        if (Array.isArray(packet.u)) {
            for (let i = 0; i < packet.u.length; i++) {
                const [nid, x, z, ry, hp] = packet.u[i];
                seenUnitIds.add(nid);
                const ent = unitMap.get(nid);
                if (ent) {
                    ent._mpSeenOnce = true;
                    ent.health = hp;
                    if (ent.mesh) {
                        const drift = Math.hypot(x - ent.mesh.position.x, z - ent.mesh.position.z);
                        // Avoid rubber-banding local player units unless drift exceeds 2.5 units
                        if (!localSet.has(ent) || drift > 2.5) {
                            ent._mpNetTarget = { x, z, ry };
                        } else {
                            ent._mpNetTarget = null;
                        }
                    }
                }
            }
            // Clean up ghost units that died on host between snapshots
            unitMap.forEach((ent, nid) => {
                    if (ent._mpSeenOnce && !seenUnitIds.has(nid) && ent.health > 0) {
                        ent.health = 0;
                    }
            });
        }
        if (Array.isArray(packet.s)) {
            const seenStructIds = new Set();
            const structMap = new Map();
            for (let i = 0; i < structures.length; i++) if (structures[i].netId) structMap.set(structures[i].netId, structures[i]);
            for (let i = 0; i < enemyStructures.length; i++) if (enemyStructures[i].netId) structMap.set(enemyStructures[i].netId, enemyStructures[i]);
            for (let i = 0; i < packet.s.length; i++) {
                const [nid, hp] = packet.s[i];
                seenStructIds.add(nid);
                const st = structMap.get(nid);
                if (st) {
                    st._mpSeenOnce = true;
                    st.health = hp;
                }
            }
            structMap.forEach((st, nid) => {
                    if (st._mpSeenOnce && !seenStructIds.has(nid) && st.health > 0) {
                        st.health = 0;
                    }
            });
        }
    }
    else if (packet.type === 'chat') {
        addMpChatMessage(packet.sender, packet.text);
    }
}

// --- HOST LAUNCHES MATCH ---
function hostLaunchBattle() {
    const mapEnv = document.getElementById('mp-map-env').value;
    const mapSize = parseInt(document.getElementById('mp-map-size').value, 10);
    const startMoney = parseInt(document.getElementById('mp-starting-money').value, 10);
    const startUnits = document.getElementById('mp-starting-units').value;

    const packet = {
        type: 'start_battle',
        mapType: mapEnv,
        mapSize: mapSize,
        money: startMoney,
        startingUnits: startUnits,
        slots: mpSlots,
        customMapData: activeCustomMap ? activeCustomMap : null,
        seed: Math.floor(Math.random() * 1000000)
    };

    broadcastNetPacket(packet);
    startMultiplayerMatch(true, packet);
}

// --- COMMON MULTIPLAYER START LOGIC ---
function startMultiplayerMatch(isHost, config) {
    isMultiplayerActive = true;
    isMultiplayerHost = isHost;

    // Seed deterministic simulation PRNG from host match seed so both peers share identical RNG stream
    const matchSeed = (Number(config.seed) >>> 0) || 424242;
    if (typeof setSimSeed === 'function') setSimSeed(matchSeed);
    if (typeof randomMapSeed !== 'undefined') randomMapSeed = matchSeed;

    // Apply synced game configuration
    currentMapType = config.mapType;
    currentMapSize = config.mapSize;
    playerResources = config.money;

    if (config.customMapData) {
        activeCustomMap = config.customMapData;
        savedCustomMaps[config.mapType] = config.customMapData;
    }

    const activeSlots = (config.slots || mpSlots).filter(s => s.active);
    const mySlot = isHost ? activeSlots.find(s => s.isHost) : activeSlots.find(s => !s.isHost && s.isHuman);
    const playerSlot = mySlot || activeSlots[0];
    playerTeamId = playerSlot.team;
    selectedFaction = playerSlot.faction;
    if (typeof preloadSkirmishAudio === 'function') preloadSkirmishAudio(selectedFaction);

    // Refresh map & purge any previous single player skirmish remnants completely
    if (typeof resetEntireBattlefieldState === 'function') {
        resetEntireBattlefieldState(currentMapSize);
    }

    // Hide start menu
    const startMenu = document.getElementById('start-menu');
    if (startMenu) startMenu.style.display = 'none';

    // Show Multiplayer status badge & tactical radio chat
    const badge = document.getElementById('mp-status-badge');
    if (badge) {
        badge.style.display = 'block';
        badge.innerHTML = `🟢 P2P WEBRTC ONLINE | ROOM: ${currentRoomCode} | TEAM ${playerTeamId} (${isHost ? 'HOST' : 'CLIENT'})`;
    }

    const chatContainer = document.getElementById('mp-chat-container');
    if (chatContainer) chatContainer.style.display = 'block';
    addMpChatMessage('SYSTEM', `Multiplayer deployed! You are Team ${playerTeamId} commanding ${selectedFaction.toUpperCase()}. Press [ENTER] to chat.`);

    // Build map environment
    setupMapEnvironment(currentMapType, currentMapSize);

    const spawns = getSpawnPointsForMap(currentMapSize, currentMapType, activeCustomMap);

    // Deploy all active commanders (Host, Challenger, and AI slots)
    activeSlots.forEach(slot => {
            const spObj = spawns.find(p => p.id === slot.spawnId) || spawns[0];
            const spawnPos = new THREE.Vector3(spObj.x, getTerrainHeight(spObj.x, spObj.z), spObj.z);

            spawnSupplyCacheNearBase(spawnPos);

            const isMe = (isHost && slot.isHost) || (!isHost && !slot.isHost && slot.isHuman);

            if (isMe) {
                // Deploy Local Player Base
                if (typeof getPlayerColorHex === 'function' && typeof applyPlayerColorToMaterials === 'function') {
                    window.selectedPlayerColor = slot.color || 'blue';
                    applyPlayerColorToMaterials(getPlayerColorHex(window.selectedPlayerColor));
                }
                deployBase(spawnPos, slot.faction, slot.team);
                camera.position.set(spawnPos.x, 65, spawnPos.z + 65);
                camera.lookAt(spawnPos.x, 0, spawnPos.z);
            } else if (slot.isHuman) {
                // Remote Human Peer Base
                if (typeof getPlayerColorHex === 'function') {
                    window.activeEnemyColorHex = getPlayerColorHex(slot.color || 'red');
                }
                const faceCenterYaw = (Math.hypot(spawnPos.x, spawnPos.z) > 1) ? Math.atan2(-spawnPos.x, -spawnPos.z) : 0;
                const foeCCGroup = (slot.faction === 'china') ? createChinaCommandCenter(true) : (slot.faction === 'gla') ? createGLACommandCenter(true) : createUSACommandCenter(true);
                foeCCGroup.position.copy(spawnPos);
                foeCCGroup.rotation.y = faceCenterYaw;
                scene.add(foeCCGroup);
                enemyStructures.push({
                        type: 'commandCenter', faction: slot.faction, position: spawnPos.clone(), rotationY: faceCenterYaw,
                        mesh: foeCCGroup, health: 2500, maxHealth: 2500, radius: 10,
                        buildProgress: 100, isBuilding: false, netId: (isHost ? 'CS_' : 'HS_') + 'CC',
                        teamId: slot.team, ownerId: 'challenger', isAI: false
                });
            } else {
                // AI Base
                deployEnemyBase(spawnPos, slot.faction, 'ai_' + slot.id, slot.team, slot.difficulty, slot.color);
            }
    });

    // Deploy Contested Neutral Map Tech Buildings (Oil Derricks, Hospital, Refinery)
    if (typeof spawnNeutralMapTechBuildings === 'function') {
        spawnNeutralMapTechBuildings(currentMapSize, currentMapType);
    }

    const resEl = document.getElementById('resource-display');
    if (resEl) resEl.innerText = `${playerResources}`;

    hasSpawnedInitialEnemyBase = true;
    isMatchActive = true;
    matchStartTime = Date.now();
    if (typeof initAICommanders === 'function') initAICommanders();
    updateSidebar();
    showNotification(`Tactical Deployment Complete. Command Center operational!`, 'success');
}

// --- TACTICAL CHAT OVERLAY LOGIC ---
function addMpChatMessage(sender, text) {
    const box = document.getElementById('mp-chat-messages');
    if (!box) return;
    const msg = document.createElement('div');
    const isSys = sender === 'SYSTEM';
    const isHst = sender.toLowerCase().includes('host');
    msg.className = 'mp-chat-msg ' + (isSys ? 'system' : isHst ? 'host' : 'challenger');
    msg.innerHTML = `<strong>[${sender}]:</strong> ${escapeHtml(text)}`;
    box.appendChild(msg);
    box.scrollTop = box.scrollHeight;

    if (!isSys) {
        setTimeout(() => {
                msg.style.transition = 'opacity 1.5s ease';
                msg.style.opacity = '0.35';
            }, 12000);
    }
}

function handleChatInputKeyDown(e) {
    if (e.key === 'Enter') {
        const input = document.getElementById('mp-chat-input');
        const text = (input.value || '').trim();
        if (text) {
            const sender = isMultiplayerHost ? 'Host' : 'Challenger';
            addMpChatMessage(sender, text);
            broadcastNetPacket({ type: 'chat', sender: sender, text: text });
            input.value = '';
        }
        input.blur();
    }
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

window.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const chatInput = document.getElementById('mp-chat-input');
            const chatContainer = document.getElementById('mp-chat-container');
            if (chatContainer && chatContainer.style.display !== 'none' && chatInput) {
                if (document.activeElement !== chatInput) {
                    chatInput.focus();
                    e.preventDefault();
                }
            }
        }
});

// --- AUTOMATIC BASE DEFENSE COMBAT SYSTEM ---
function processBaseDefenseCombat() {
    const allDefenses = [
        ...structures.filter(s => ['patriot', 'gatlingCannon', 'stingerSite'].includes(s.type) && s.health > 0 && !s.isBuilding),
        ...enemyStructures.filter(es => ['patriot', 'gatlingCannon', 'stingerSite'].includes(es.type) && es.health > 0 && !es.isBuilding)
    ];
    if (allDefenses.length === 0) return;

    const allLivingUnits = [...units, ...enemyUnits];
    const allLivingStructures = [...structures, ...enemyStructures];

    allDefenses.forEach(def => {
            if (def.attackCooldown === undefined) def.attackCooldown = 0;
            if (def.attackCooldown > 0) {
                def.attackCooldown = Math.max(0, def.attackCooldown - combatDeltaScale);
            }

            // Acquire closest target within defense range (34 units) strictly filtering !isFriendly
            if (def.attackCooldown === 0) {
                let closestEnemy = null;
                let closestDistSq = 34 * 34; // Fast squared distance
                const defCenter = def.position || def.mesh.position;
                for (let target of allLivingUnits) {
                    if (target.health > 0 && !target.garrisonedIn && target.mesh && !isFriendly(def, target)) {
                        const dx = defCenter.x - target.mesh.position.x;
                        const dz = defCenter.z - target.mesh.position.z;
                        const dSq = dx * dx + dz * dz;
                        if (dSq < closestDistSq) {
                            closestDistSq = dSq;
                            closestEnemy = target;
                        }
                    }
                }

                if (!closestEnemy) {
                    for (let struct of allLivingStructures) {
                        if (struct.health > 0 && struct.mesh && !isFriendly(def, struct)) {
                            const sPos = struct.position || struct.mesh.position;
                            const maxRange = 34 + (struct.radius || 0);
                            const dx = defCenter.x - sPos.x;
                            const dz = defCenter.z - sPos.z;
                            const dSq = dx * dx + dz * dz;
                            if (dSq < maxRange * maxRange) {
                                closestDistSq = dSq;
                                closestEnemy = struct;
                                break;
                            }
                        }
                    }
                }

                if (closestEnemy) {
                    // Point turret at target
                    const turret = getCachedNode(def.mesh, "turretSystem") || getCachedNode(def.mesh, "gatlingBarrels");
                    if (turret && turret.parent) {
                        const localTarget = turret.parent.worldToLocal(closestEnemy.mesh.position.clone());
                        turret.rotation.y = Math.atan2(localTarget.x, localTarget.z);
                    }

                    // Fire defense weapon
                    const defPos = (def.position || def.mesh.position).clone();
                    defPos.y += 3.5;
                    const targetPos = (closestEnemy.position || closestEnemy.mesh.position).clone();
                    targetPos.y += (closestEnemy.isAir ? 0.2 : 0.5);

                    if (def.type === 'gatlingCannon') {
                        def.attackCooldown = 28; // ~0.46s reload
                        spawnMuzzleFlash(defPos, 0xffa502, 0.4);
                        spawnBulletTracer(defPos, targetPos, 0xf1c40f, 2.5);
                        if ((!def.mesh || def.mesh.visible) && typeof playAudio === 'function') playAudio('gatling_fire', {}, 'china');
                        closestEnemy.health -= 22;
                    } else if (def.type === 'patriot') {
                        def.attackCooldown = 190; // ~3.16s reload
                        spawnMuzzleFlash(defPos, 0xff9f43, 0.8);
                        spawnRocketProjectile(defPos, targetPos, true, false);
                        if ((!def.mesh || def.mesh.visible) && typeof playUSASound === 'function') playUSASound('patriot_fire');
                        closestEnemy.health -= 65;
                    } else if (def.type === 'stingerSite') {
                        def.attackCooldown = 150; // ~2.5s reload
                        spawnMuzzleFlash(defPos, 0xff9f43, 0.5);
                        spawnRocketProjectile(defPos, targetPos, false, true);
                        if ((!def.mesh || def.mesh.visible) && typeof playAudio === 'function') playAudio('stinger_fire', {}, 'gla');
                        closestEnemy.health -= 50;
                    }

                    // Sync damage in multiplayer (host-authoritative)
                    if (isMultiplayerActive && netConn && netConn.open && isMultiplayerHost && closestEnemy.netId) {
                        broadcastNetPacket({
                                type: 'unit_damage',
                                targetNetId: closestEnemy.netId,
                                remainingHealth: Math.max(0, closestEnemy.health)
                        });
                    }
                }
            }
    });
}

window.addEventListener('load', init);

function onHostDisconnected(reason = "The host commander has left or closed the multiplayer match.") {
    isMatchActive = false;
    isMultiplayerActive = false;

    const modal = document.getElementById('host-disconnected-modal');
    const reasonEl = document.getElementById('host-disconnect-reason');
    if (reasonEl) reasonEl.textContent = reason;
    if (modal) modal.style.display = 'flex';

    const badge = document.getElementById('mp-status-badge');
    if (badge) badge.innerHTML = '🔴 HOST DISCONNECTED';

    const ticker = document.getElementById('tactical-message');
    if (ticker) ticker.innerHTML = '<strong style="color:#ff4757;">ALERT: Host commander has disconnected. Match terminated.</strong>';

    showNotification("⚠️ HOST HAS DISCONNECTED: The multiplayer match has ended.", "error");
    if (typeof playAudio === 'function') playAudio('defeat', {}, selectedFaction);
}
window.onHostDisconnected = onHostDisconnected;

let _mpLastStateSyncMs = 0;
function broadcastHostStateSync() {
    if (!isMultiplayerActive || !isMultiplayerHost) return;
    const now = performance.now();
    if (now - _mpLastStateSyncMs < 100) return; // 10 Hz host-authoritative delta snapshot
    _mpLastStateSyncMs = now;
    const uSnap = [];
    const packUnits = (arr) => {
        for (let i = 0; i < arr.length; i++) {
            const u = arr[i];
            if (u && u.netId && u.health > 0 && u.mesh) {
                uSnap.push([
                        u.netId,
                        Math.round(u.mesh.position.x * 10) / 10,
                        Math.round(u.mesh.position.z * 10) / 10,
                        Math.round(u.mesh.rotation.y * 100) / 100,
                        Math.round(u.health)
                ]);
            }
        }
    };
    packUnits(units);
    packUnits(enemyUnits);
    const sSnap = [];
    const packStructs = (arr) => {
        for (let i = 0; i < arr.length; i++) {
            const s = arr[i];
            if (s && s.netId && s.health > 0) {
                sSnap.push([s.netId, Math.round(s.health)]);
            }
        }
    };
    packStructs(structures);
    packStructs(enemyStructures);
    broadcastNetPacket({ type: 'state_sync', u: uSnap, s: sSnap });
}

function leaveMultiplayerSessionToMenu() {
    const modal = document.getElementById('host-disconnected-modal');
    if (modal) modal.style.display = 'none';

    cleanupPeerSession();

    isMultiplayerActive = false;
    isMultiplayerHost = false;
    isMatchActive = false;

    if (typeof resetEntireBattlefieldState === 'function') {
        resetEntireBattlefieldState(currentMapSize || 1500);
    }

    const badge = document.getElementById('mp-status-badge');
    if (badge) badge.style.display = 'none';
    const chatContainer = document.getElementById('mp-chat-container');
    if (chatContainer) chatContainer.style.display = 'none';

    const startMenu = document.getElementById('start-menu');
    if (startMenu) {
        startMenu.style.display = 'flex';
        startMenu.classList.remove('pause-mode');
    }
    const startCard = document.getElementById('start-card');
    if (startCard) startCard.style.display = 'block';
    const resumeBtn = document.getElementById('resume-game-btn');
    if (resumeBtn) resumeBtn.style.display = 'none';

    switchGameModeTab('multiplayer');
    switchMpSubTab('join');
    showNotification("Returned to Multiplayer Lobby.", "info");
}
window.leaveMultiplayerSessionToMenu = leaveMultiplayerSessionToMenu;

window.addEventListener('beforeunload', () => {
        if (isMultiplayerActive && netConn && netConn.open) {
            if (isMultiplayerHost) {
                broadcastNetPacket({ type: 'host_left', message: 'Host closed the game window.' });
            } else {
                broadcastNetPacket({ type: 'client_left', message: 'Challenger closed the game window.' });
            }
        }
});
