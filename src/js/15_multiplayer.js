// REAL-TIME WEBRTC P2P MULTIPLAYER ENGINE (PEER.JS) & BASE DEFENSE SYSTEMS
// =========================================================================
let isMultiplayerActive = false;
let isMultiplayerHost = false;
let netPeer = null;
let netConn = null;
const netPeerConns = new Map(); // Host hub-and-spoke registry: peerId -> { conn, slotId, cmdSeq, budget, budgetLastMs, faction }
let myMpSlotId = 1;
let myMpPeerId = 'host';
let currentRoomCode = '';
let mpOpponentFaction = 'china';
let netIdSequence = 100;

const MP_PROTOCOL_VERSION = 2;
const MP_MAX_HUMANS = 8; // Full 4v4 support (1 host + up to 7 remote human peers)
const MP_ALLOWED_FACTIONS = new Set(['usa', 'china', 'gla', 'random']);
const MP_COMMAND_PACKET_TYPES = new Set(['move_units', 'attack_target', 'spawn_unit', 'build_structure']);
let _mpTxSeq = 0;
let _mpLastRxSeq = 0;
let _mpLastRxStateSeq = 0;
let _mpCmdTxSeq = 0;
let _mpLastRxCmdSeq = 0;
let _mpRateWindowStart = 0;
let _mpRateWindowCount = 0;
const MP_RATE_LIMIT_PER_SEC = 120;
const MP_KEYFRAME_INTERVAL = 30; // Full keyframe every 30 broadcasts (3.0s at 10 Hz)
const MP_INTERP_DELAY_MS = 100;  // 100ms client jitter buffer matching 10 Hz host sync
const MP_MAX_ENTITY_SAMPLES = 5;
let _mpStateSyncCount = 0;
const _mpLastUnitSnapMap = new Map();
const _mpLastStructSnapMap = new Map();

function hasOpenMpPeers() {
    if (isMultiplayerHost && netPeerConns.size > 0) {
        for (const entry of netPeerConns.values()) {
            if (entry && entry.conn && entry.conn.open) return true;
        }
    }
    return Boolean(netConn && netConn.open);
}

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
    _mpCmdTxSeq = 0;
    _mpLastRxCmdSeq = 0;
    _mpRateWindowStart = 0;
    _mpRateWindowCount = 0;
    _mpStateSyncCount = 0;
    _mpLastUnitSnapMap.clear();
    _mpLastStructSnapMap.clear();
}

function cleanupPeerSession() {
    for (const entry of netPeerConns.values()) {
        if (entry && entry.conn) {
            try { if (typeof entry.conn.removeAllListeners === 'function') entry.conn.removeAllListeners(); } catch (e) {}
            try { entry.conn.close(); } catch (e) {}
        }
    }
    netPeerConns.clear();
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
    if (Array.isArray(mpSlots)) {
        mpSlots.forEach((s, idx) => {
            if (s && idx > 0) {
                delete s.peerId;
                if (idx > 1) s.isHuman = false;
            }
        });
    }
    myMpSlotId = 1;
    myMpPeerId = 'host';
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
    if (packet.cmdSeq !== undefined && (!Number.isInteger(packet.cmdSeq) || packet.cmdSeq < 0)) {
        return { valid: false, reason: 'invalid_command_sequence' };
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
            if (packet.k !== undefined && packet.k !== 0 && packet.k !== 1) {
                return { valid: false, reason: 'invalid_state_sync' };
            }
            if (packet.du !== undefined && !Array.isArray(packet.du)) {
                return { valid: false, reason: 'invalid_state_sync' };
            }
            if (packet.ds !== undefined && !Array.isArray(packet.ds)) {
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
    if (mode !== 'multiplayer') stopLanLobbyPolling();
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
        stopLanLobbyPolling();
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
        startLanLobbyPolling();
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

function createLanRelayConnection(ws, toPeerId = null) {
    const handlers = { data: [], close: [], open: [] };
    const conn = {
        open: ws.readyState === 1,
        isLanRelay: true,
        peer: toPeerId || 'lan_host',
        on(event, fn) {
            if (handlers[event]) handlers[event].push(fn);
        },
        send(payload) {
            if (!conn.open || ws.readyState !== 1) return;
            try {
                const msg = toPeerId ? { _lan: 'data', toPeerId, payload } : { _lan: 'data', payload };
                ws.send(JSON.stringify(msg));
            } catch (err) {
                console.warn('LAN relay send error:', err);
            }
        },
        close() {
            conn.open = false;
            if (!toPeerId) {
                try { ws.close(); } catch (_) {}
            }
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

function updateHostLobbyPeerStatus(isLan = false) {
    const statusEl = document.getElementById('mp-host-status');
    const launchBtn = document.getElementById('mp-launch-btn');
    const guestCount = netPeerConns.size;
    const totalHumans = 1 + guestCount;
    const prefix = isLan ? '<strong>[LAN]</strong> ' : '';
    if (statusEl) {
        if (guestCount > 0) {
            statusEl.innerHTML = `🟢 ${prefix}<strong>${guestCount === 1 ? 'CHALLENGER' : (guestCount + ' CHALLENGERS')} CONNECTED!</strong> (${totalHumans}/${MP_MAX_HUMANS} players ready). Click "LAUNCH MULTIPLAYER BATTLE" to deploy.`;
        } else {
            statusEl.innerHTML = `🟢 ${prefix}Room <strong>${escapeHtml(currentRoomCode)}</strong> created (1/${MP_MAX_HUMANS} players). Share this code with challengers and wait for connection.`;
        }
    }
    if (launchBtn) {
        launchBtn.disabled = guestCount === 0;
        launchBtn.style.opacity = guestCount > 0 ? '1' : '0.5';
        launchBtn.style.cursor = guestCount > 0 ? 'pointer' : 'not-allowed';
        if (guestCount > 0) {
            launchBtn.style.borderColor = '#55efc4';
            launchBtn.style.color = '#55efc4';
        }
    }
    if (typeof renderSlotsUI === 'function' && currentStartMenuMode === 'multiplayer') {
        renderSlotsUI('multiplayer');
    }
}

function registerHostPeerConnection(peerId, conn, isLan = false) {
    if (!peerId || !conn) return false;
    if (netPeerConns.size >= MP_MAX_HUMANS - 1) {
        try { conn.send({ type: 'host_left', message: `Lobby is full (${MP_MAX_HUMANS}/${MP_MAX_HUMANS} players).`, v: MP_PROTOCOL_VERSION }); } catch (_) {}
        try { conn.close(); } catch (_) {}
        return false;
    }
    let assignedSlot = null;
    if (Array.isArray(mpSlots)) {
        // 1. Prefer an open human slot without a bound peer (e.g. default Slot 2 Challenger)
        assignedSlot = mpSlots.find((s, idx) => idx > 0 && s && s.isHuman && !s.peerId);
        // 2. Otherwise claim the first inactive slot (slots 3..8 for 2v2 / 3v3 / 4v4)
        if (!assignedSlot) assignedSlot = mpSlots.find((s, idx) => idx > 0 && s && !s.active && !s.peerId);
        // 3. Otherwise convert an AI slot to human
        if (!assignedSlot) assignedSlot = mpSlots.find((s, idx) => idx > 0 && s && !s.isHost && !s.peerId);
        if (assignedSlot) {
            assignedSlot.active = true;
            assignedSlot.isHuman = true;
            assignedSlot.peerId = peerId;
            assignedSlot.name = assignedSlot.id === 2 ? 'Challenger' : `Player ${assignedSlot.id}`;
        }
    }
    const slotId = assignedSlot ? assignedSlot.id : (2 + netPeerConns.size);
    netPeerConns.set(peerId, {
        conn,
        slotId,
        cmdSeq: 0,
        budget: 12500,
        budgetLastMs: Date.now(),
        faction: (assignedSlot && assignedSlot.faction) || 'china',
        isLan
    });
    netConn = conn;
    setupNetDataConnection(conn, peerId);
    updateHostLobbyPeerStatus(isLan);
    if (conn.open) {
        syncMpLobbyToPeer();
    } else if (typeof conn.on === 'function') {
        conn.on('open', () => {
            syncMpLobbyToPeer();
        });
    }
    return true;
}

let _lanLobbyPollTimer = null;

function stopLanLobbyPolling() {
    if (_lanLobbyPollTimer) {
        clearInterval(_lanLobbyPollTimer);
        _lanLobbyPollTimer = null;
    }
}

function startLanLobbyPolling() {
    stopLanLobbyPolling();
    detectLanServer().then((lanInfo) => {
        const lobbyEl = document.getElementById('mp-lan-lobby');
        if (!lanInfo) {
            if (lobbyEl) lobbyEl.style.display = 'none';
            return;
        }
        if (lobbyEl) lobbyEl.style.display = 'block';
        refreshLanRooms();
        _lanLobbyPollTimer = setInterval(refreshLanRooms, 2500);
    });
}

function joinLanRoom(roomCode) {
    const input = document.getElementById('mp-join-input');
    if (input) input.value = roomCode;
    stopLanLobbyPolling();
    joinConnectToHost();
}
window.joinLanRoom = joinLanRoom;

function refreshLanRooms() {
    const listEl = document.getElementById('mp-lan-rooms-list');
    if (!listEl || typeof fetch !== 'function') return;
    fetch('/api/lan-rooms', { cache: 'no-store' })
        .then(r => (r && r.ok ? r.json() : null))
        .then(data => {
            if (!data || !data.ok || !Array.isArray(data.rooms)) return;
            const rooms = data.rooms;
            if (rooms.length === 0) {
                listEl.innerHTML = '<div style="color:#95a5a6; font-style:italic; padding:4px 0;">No hosted games yet on this LAN. Have one player click "Host Match".</div>';
                return;
            }
            if (!listEl._boundLanJoinClick) {
                listEl._boundLanJoinClick = true;
                listEl.addEventListener('click', (ev) => {
                    const btn = ev.target && ev.target.closest ? ev.target.closest('button[data-lan-room]') : null;
                    if (!btn) return;
                    const roomCode = btn.dataset.lanRoom;
                    if (roomCode && /^[A-Z0-9-]{1,32}$/.test(roomCode)) {
                        joinLanRoom(roomCode);
                    }
                });
            }
            let html = '';
            rooms.forEach(rm => {
                const rawCode = String(rm.room || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32);
                const code = escapeHtml(rawCode);
                const fac = escapeHtml(String(rm.hostFaction || 'usa').toUpperCase());
                const mapName = escapeHtml(String(rm.mapName || 'Tournament Desert'));
                const players = Math.max(0, Math.min(8, parseInt(rm.players, 10) || 0));
                const maxPlayers = Math.max(1, Math.min(8, parseInt(rm.maxPlayers, 10) || 2));
                const open = Boolean(rm.open) && Boolean(rawCode);
                const statusBadge = open
                    ? `<button type="button" class="rts-btn" style="padding:4px 12px; font-size:11px; background:#1f4030; border-color:#55efc4; color:#55efc4;" data-lan-room="${code}">JOIN</button>`
                    : `<span style="color:#ff9f43; font-size:11px; font-weight:bold;">FULL (${players}/${maxPlayers})</span>`;
                html += `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; background:rgba(12,20,16,0.9); border:1px solid #2b4436; padding:6px 10px; border-radius:3px; margin-bottom:5px;">
                    <div>
                        <div style="color:#55efc4; font-family:monospace; font-weight:bold; font-size:13px;">${code} <span style="color:#f1c40f; font-family:sans-serif; font-size:11px;">(${fac})</span></div>
                        <div style="color:#b2bec3; font-size:11px;">Map: ${mapName} &bull; Players: ${players}/${maxPlayers}</div>
                    </div>
                    <div>${statusBadge}</div>
                </div>`;
            });
            listEl.innerHTML = html;
        })
        .catch(() => {});
}
window.refreshLanRooms = refreshLanRooms;

function initHostPeerLan(lanInfo, statusEl) {
    try {
        const ws = new WebSocket(lanInfo.wsUrl);
        netPeer = {
            destroy() {
                try { ws.close(); } catch (_) {}
            }
        };
        ws.onopen = () => {
            const mapSelect = document.getElementById('mp-map-select');
            const mapName = (mapSelect && mapSelect.options && mapSelect.selectedIndex >= 0)
                ? mapSelect.options[mapSelect.selectedIndex].text
                : (typeof currentMapType !== 'undefined' ? String(currentMapType) : 'Tournament Desert');
            ws.send(JSON.stringify({
                _lan: 'host',
                room: currentRoomCode,
                hostFaction: (typeof selectedFaction !== 'undefined' ? selectedFaction : 'usa'),
                mapName
            }));
        };
        ws.onmessage = (ev) => {
            let msg;
            try { msg = JSON.parse(ev.data); } catch (_) { return; }
            if (!msg || typeof msg !== 'object') return;
            if (msg._lan === 'hosted') {
                isMultiplayerHost = true;
                myMpSlotId = 1;
                myMpPeerId = 'host';
                updateHostLobbyPeerStatus(true);
            } else if (msg._lan === 'peer_connected') {
                const pid = String(msg.peerId || ('lan_' + (++netIdSequence)));
                const peerConn = createLanRelayConnection(ws, pid);
                peerConn.open = true;
                registerHostPeerConnection(pid, peerConn, true);
            } else if (msg._lan === 'data') {
                const fromPid = msg.fromPeerId ? String(msg.fromPeerId) : null;
                const entry = fromPid ? netPeerConns.get(fromPid) : null;
                if (entry && entry.conn) {
                    entry.conn._emit('data', msg.payload);
                } else if (netConn && typeof netConn._emit === 'function') {
                    netConn._emit('data', msg.payload);
                }
            } else if (msg._lan === 'peer_disconnected') {
                const pid = msg.peerId ? String(msg.peerId) : null;
                const entry = pid ? netPeerConns.get(pid) : null;
                if (entry && entry.conn) {
                    entry.conn._emit('close');
                }
            } else if (msg._lan === 'error') {
                if (msg.code === 'unavailable-id') {
                    setTimeout(initHostPeer, 500);
                } else if (statusEl) {
                    statusEl.innerHTML = `<span style="color:#ff6b6b;">LAN notice: ${escapeHtml(msg.message || 'error')}</span>`;
                }
            }
        };
        ws.onclose = () => {
            for (const entry of Array.from(netPeerConns.values())) {
                if (entry && entry.conn) entry.conn._emit('close');
            }
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
                myMpPeerId = String(msg.peerId || ('lan_' + (++netIdSequence)));
                activeConn = createLanRelayConnection(ws, null);
                activeConn.open = true;
                netConn = activeConn;
                setupNetDataConnection(activeConn, 'host');
                isMultiplayerHost = false;
                if (statusEl) {
                    statusEl.innerHTML = `🟢 <strong>[LAN] CONNECTED TO HOST!</strong> Waiting for host to launch the battle...`;
                }
                broadcastNetPacket({
                    type: 'handshake',
                    clientFaction: selectedFaction,
                    peerId: myMpPeerId
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
                    myMpSlotId = 1;
                    myMpPeerId = id || 'host';
                    updateHostLobbyPeerStatus(false);
            });

            netPeer.on('connection', (conn) => {
                    const pid = String((conn && conn.peer) || ('p_' + (++netIdSequence)));
                    registerHostPeerConnection(pid, conn, false);
            });

            netPeer.on('error', (err) => {
                    console.warn('Peer error:', err);
                    if (err.type === 'unavailable-id') {
                        setTimeout(initHostPeer, 500);
                    } else if (statusEl) {
                        statusEl.innerHTML = `<span style="color:#ff6b6b;">Peer notice: ${escapeHtml(err.message || err.type || 'Unknown error')}</span>`;
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

    const cleanCode = rawCode.replace(/^CNC-?/i, '').replace(/[^A-Z0-9-]/g, '').slice(0, 32);
    if (!cleanCode) {
        showNotification("Invalid room code (use letters, numbers, and hyphens only).", "error");
        return;
    }
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
                    myMpPeerId = String(myId || ('p_' + (++netIdSequence)));
                    netConn = netPeer.connect(targetPeerId, { reliable: true });
                    setupNetDataConnection(netConn, 'host');

                    netConn.on('open', () => {
                            isMultiplayerHost = false;
                            if (statusEl) {
                                statusEl.innerHTML = `🟢 <strong>CONNECTED TO HOST!</strong> Waiting for host to launch the battle...`;
                            }
                            broadcastNetPacket({
                                    type: 'handshake',
                                    clientFaction: selectedFaction,
                                    peerId: myMpPeerId
                            });
                    });
            });

            netPeer.on('error', (err) => {
                    console.warn('Join error:', err);
                    if (statusEl) {
                        statusEl.innerHTML = `<span style="color:#ff6b6b;">Connection failed: Could not reach host ${escapeHtml(currentRoomCode)}. Verify room code.</span>`;
                    }
            });
        } catch (e) {
            console.error('Join error:', e);
            if (statusEl) statusEl.innerHTML = '<span style="color:#ff4757;">Failed to connect to PeerJS broker.</span>';
        }
    });
}

// --- DATA CHANNEL PACKET HANDLERS ---
function setupNetDataConnection(conn, peerId = null) {
    conn.on('data', (packet) => {
            handleNetworkPacket(packet, peerId);
    });

    conn.on('close', () => {
            if (!isMultiplayerHost && isMultiplayerActive) {
                onHostDisconnected("The host commander has disconnected and terminated the session.");
            } else if (isMultiplayerHost) {
                const entry = peerId ? netPeerConns.get(peerId) : null;
                const wasLan = Boolean(entry && entry.isLan);
                if (peerId) netPeerConns.delete(peerId);
                if (netConn === conn) {
                    const nextEntry = netPeerConns.values().next().value;
                    netConn = nextEntry ? nextEntry.conn : null;
                }
                if (entry && !isMultiplayerActive && Array.isArray(mpSlots)) {
                    const freed = mpSlots.find(s => s && s.id === entry.slotId);
                    if (freed) {
                        delete freed.peerId;
                        if (freed.id > 2) {
                            freed.isHuman = false;
                            freed.active = false;
                            freed.name = `AI Slot ${freed.id}`;
                        }
                    }
                    updateHostLobbyPeerStatus(wasLan);
                    syncMpLobbyToPeer();
                } else if (isMultiplayerActive) {
                    const label = entry ? `Player ${entry.slotId}` : 'Challenger';
                    showNotification(`${label} disconnected from the match.`, "error");
                    const badge = document.getElementById('mp-status-badge');
                    if (badge && netPeerConns.size === 0) badge.innerHTML = '🔴 ALL CHALLENGERS DISCONNECTED';
                }
            }
    });
}

const MP_ALLOWED_UNIT_TYPES = new Set([
    'dozer', 'worker', 'chinook', 'truck', 'ranger', 'infantry', 'redguard', 'rebel',
    'rocket', 'missiledefender', 'rpg', 'tankhunter', 'pathfinder', 'jarmen', 'burton',
    'blacklotus', 'hacker', 'hijacker', 'terrorist', 'mob', 'pilot', 'humvee', 'ambulance',
    'crusader', 'paladin', 'tomahawk', 'tank', 'battlemaster', 'gatling', 'dragon', 'dragonTank',
    'overlord', 'inferno', 'nukecannon', 'nuketank', 'crawler', 'technical', 'scorpion', 'marauder',
    'quad', 'buggy', 'toxintractor', 'bombtruck', 'radarvan', 'scud', 'battlebus',
    'comanche', 'raptor', 'aurora', 'stealthfighter', 'mig', 'helix', 'drone_scout'
]);
const MP_ALLOWED_STRUCT_TYPES = new Set([
    'center', 'commandCenter', 'fakeCommandCenter', 'power', 'nuclearReactor', 'barracks',
    'factory', 'airfield', 'supplyCenter', 'supplyStash', 'supplyDrop', 'bunker', 'patriot',
    'gatlingCannon', 'speakerTower', 'stingerSite', 'palace', 'scudStorm', 'particleCannon',
    'nukeSilo', 'strategyCenter', 'detentionCamp', 'internetCenter', 'propagandaCenter',
    'blackMarket', 'tunnel', 'demoTrap'
]);

function sanitizeMpSlots(rawSlots) {
    if (!Array.isArray(rawSlots) || rawSlots.length === 0 || rawSlots.length > 8) return null;
    const clean = [];
    for (let i = 0; i < rawSlots.length; i++) {
        const s = rawSlots[i];
        if (!s || typeof s !== 'object') return null;
        const fac = (typeof s.faction === 'string' && MP_ALLOWED_FACTIONS.has(s.faction.toLowerCase()))
            ? s.faction.toLowerCase()
            : 'usa';
        const team = Number.isInteger(s.team) && s.team >= 1 && s.team <= 4 ? s.team : ((i % 2) + 1);
        const spawnId = Number.isInteger(s.spawnId) && s.spawnId >= 1 && s.spawnId <= 8 ? s.spawnId : (i + 1);
        const name = (typeof s.name === 'string' ? s.name.trim() : `Commander ${i + 1}`).slice(0, 48) || `Commander ${i + 1}`;
        clean.push({
            id: Number.isInteger(s.id) ? s.id : (i + 1),
            name,
            faction: fac,
            team,
            spawnId,
            active: Boolean(s.active),
            isHost: Boolean(s.isHost),
            isHuman: Boolean(s.isHuman),
            ...(typeof s.peerId === 'string' && s.peerId.length <= 64 ? { peerId: s.peerId } : {}),
            color: (typeof s.color === 'string' && /^[a-z0-9#_-]{1,20}$/i.test(s.color)) ? s.color : (i === 0 ? 'blue' : 'red'),
            difficulty: (typeof s.difficulty === 'string' && ['easy', 'medium', 'hard'].includes(s.difficulty)) ? s.difficulty : 'medium'
        });
    }
    return clean;
}

const MP_FACTION_UNITS = {
    usa: new Set([
        'dozer', 'chinook', 'ranger', 'infantry', 'rocket', 'missiledefender', 'pathfinder', 'burton', 'pilot',
        'humvee', 'ambulance', 'crusader', 'paladin', 'tomahawk', 'tank',
        'comanche', 'raptor', 'aurora', 'stealthfighter', 'drone_scout'
    ]),
    china: new Set([
        'dozer', 'truck', 'redguard', 'infantry', 'tankhunter', 'rocket', 'hacker', 'blacklotus',
        'battlemaster', 'tank', 'gatling', 'dragon', 'dragonTank', 'overlord', 'inferno', 'nukecannon', 'nuketank', 'crawler',
        'mig', 'helix'
    ]),
    gla: new Set([
        'worker', 'rebel', 'infantry', 'rpg', 'rocket', 'terrorist', 'hijacker', 'jarmen', 'mob',
        'technical', 'scorpion', 'marauder', 'tank', 'quad', 'buggy', 'toxintractor', 'bombtruck', 'radarvan', 'scud', 'battlebus'
    ])
};
const MP_FACTION_STRUCTS = {
    usa: new Set(['center', 'commandCenter', 'power', 'barracks', 'factory', 'airfield', 'supplyCenter', 'supplyDrop', 'patriot', 'strategyCenter', 'detentionCamp', 'particleCannon']),
    china: new Set(['center', 'commandCenter', 'nuclearReactor', 'power', 'barracks', 'factory', 'airfield', 'supplyCenter', 'bunker', 'gatlingCannon', 'speakerTower', 'propagandaCenter', 'internetCenter', 'nukeSilo']),
    gla: new Set(['center', 'commandCenter', 'fakeCommandCenter', 'barracks', 'factory', 'supplyStash', 'stingerSite', 'tunnel', 'demoTrap', 'palace', 'blackMarket', 'scudStorm'])
};
let _mpPeerBudget = 10000;
let _mpPeerBudgetLastMs = 0;

function resolveConcreteMpFaction(rawFaction, seed, slotIndex = 0) {
    const f = String(rawFaction || 'usa').toLowerCase();
    if (f === 'usa' || f === 'china' || f === 'gla') return f;
    const pool = ['usa', 'china', 'gla'];
    const idx = Math.abs(((Number(seed) >>> 0) + (slotIndex * 7919)) % pool.length);
    return pool[idx];
}

function consumeMpPeerBudget(cost, peerEntry = null) {
    const now = Date.now();
    const safeCost = Math.max(0, Number(cost) || 0);
    if (peerEntry) {
        if (peerEntry.budgetLastMs > 0) {
            const elapsedSec = Math.max(0, Math.min(30, (now - peerEntry.budgetLastMs) / 1000));
            peerEntry.budget = Math.min(35000, peerEntry.budget + elapsedSec * 280);
        }
        peerEntry.budgetLastMs = now;
        if (peerEntry.budget < safeCost) return false;
        peerEntry.budget -= safeCost;
        return true;
    }
    if (_mpPeerBudgetLastMs > 0) {
        const elapsedSec = Math.max(0, Math.min(30, (now - _mpPeerBudgetLastMs) / 1000));
        // Generous upper bound for peer economy income (harvesters + secondary economy) to prevent false positives while blocking spam/free superweapons
        _mpPeerBudget = Math.min(35000, _mpPeerBudget + elapsedSec * 280);
    }
    _mpPeerBudgetLastMs = now;
    if (_mpPeerBudget < safeCost) return false;
    _mpPeerBudget -= safeCost;
    return true;
}

function getAuthenticatedPeerSlot() {
    if (!Array.isArray(mpSlots)) return null;
    return mpSlots.find(s => s && s.active && (isMultiplayerHost ? (!s.isHost && s.isHuman) : s.isHost)) || null;
}

function clampMpWorldPos(pos) {
    const half = (typeof currentMapSize === 'number' && currentMapSize > 0 ? currentMapSize : 1500) * 0.49;
    return new THREE.Vector3(
        Math.max(-half, Math.min(half, Number(pos.x) || 0)),
        Math.max(-20, Math.min(80, Number(pos.y) || 0)),
        Math.max(-half, Math.min(half, Number(pos.z) || 0))
    );
}

function renderClientSlotsList(slots) {
    const el = document.getElementById('mp-client-slots-list');
    if (!el || !Array.isArray(slots)) return;
    let html = '';
    slots.filter(s => s && s.active).forEach(s => {
            const teamNum = Math.max(1, Math.min(4, parseInt(s.team, 10) || 1));
            const teamPillClass = `team-${teamNum}`;
            const safeName = escapeHtml(String(s.name || 'Commander'));
            const safeFaction = escapeHtml(String(s.faction || 'usa').toUpperCase());
            const safeSpawn = escapeHtml(String(s.spawnId || 1));
            html += `<div style="display:flex; justify-content:space-between; align-items:center; background:rgba(20,28,22,0.8); border:1px solid #2e3d31; padding:5px 8px; border-radius:3px; margin-bottom:4px; font-size:11px;">
                <span><strong>${safeName}</strong> (${safeFaction})</span>
                <div>
                    <span class="team-pill ${teamPillClass}">Team ${teamNum}</span>
                    <span style="color:#55efc4; margin-left:6px;">Spawn ${safeSpawn}</span>
                </div>
            </div>`;
    });
    el.innerHTML = html;
}

function syncMpLobbyToPeer() {
    if (!hasOpenMpPeers()) return;
    const moneyEl = document.getElementById('mp-starting-money');
    const unitsEl = document.getElementById('mp-starting-units');
    const envEl = document.getElementById('mp-map-env');
    const sizeEl = document.getElementById('mp-map-size');
    const basePayload = {
            type: 'lobby_sync',
            slots: mpSlots,
            startingMoney: moneyEl ? parseInt(moneyEl.value, 10) : 10000,
            startingUnits: unitsEl ? unitsEl.value : 'small',
            mapEnv: envEl ? envEl.value : 'desert',
            mapSize: sizeEl ? parseInt(sizeEl.value, 10) : 1500,
            customMapData: activeCustomMap ? activeCustomMap : null
    };
    if (isMultiplayerHost && netPeerConns.size > 0) {
        for (const [pid, entry] of netPeerConns.entries()) {
            if (entry && entry.conn && entry.conn.open) {
                broadcastNetPacket(Object.assign({}, basePayload, { assignedSlotId: entry.slotId }), null, pid);
            }
        }
    } else {
        broadcastNetPacket(basePayload);
    }
}

function broadcastNetPacket(packet, excludePeerId = null, targetPeerId = null) {
    if (!packet || typeof packet !== 'object') return;
    try {
        packet.v = MP_PROTOCOL_VERSION;
        packet.seq = ++_mpTxSeq;
        if (MP_COMMAND_PACKET_TYPES.has(packet.type)) {
            packet.cmdSeq = ++_mpCmdTxSeq;
        }
        packet.ts = Math.round(typeof performance !== 'undefined' ? performance.now() : Date.now());
        if (isMultiplayerHost && netPeerConns.size > 0) {
            if (targetPeerId) {
                const entry = netPeerConns.get(targetPeerId);
                if (entry && entry.conn && entry.conn.open) entry.conn.send(packet);
                return;
            }
            for (const [pid, entry] of netPeerConns.entries()) {
                if (excludePeerId && pid === excludePeerId) continue;
                if (entry && entry.conn && entry.conn.open) {
                    entry.conn.send(packet);
                }
            }
        } else if (netConn && netConn.open) {
            netConn.send(packet);
        }
    } catch (e) {
        console.error('Packet broadcast error:', e);
    }
}

function handleNetworkPacket(packet, fromPeerId = null) {
    // 1. Per-second token-bucket rate limiter (scaled on host for up to 7 concurrent human guests)
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowMs - _mpRateWindowStart > 1000) {
        _mpRateWindowStart = nowMs;
        _mpRateWindowCount = 0;
    }
    const maxRate = isMultiplayerHost ? (MP_RATE_LIMIT_PER_SEC * Math.max(1, netPeerConns.size)) : MP_RATE_LIMIT_PER_SEC;
    if (++_mpRateWindowCount > maxRate) {
        console.warn('Multiplayer rate limit exceeded; dropping excess packet');
        return false;
    }

    // 2. Schema, protocol version & host-authority validation
    const check = validateNetworkPacket(packet, isMultiplayerHost);
    if (!check.valid) {
        console.warn('Rejected invalid multiplayer packet:', check.reason);
        return false;
    }

    const senderPeer = (isMultiplayerHost && fromPeerId) ? netPeerConns.get(fromPeerId) : null;

    // 3. Sequence ordering: drop stale out-of-order state_sync snapshots & per-peer player commands
    if (typeof packet.seq === 'number') {
        if (packet.type === 'state_sync') {
            if (packet.seq <= _mpLastRxStateSeq) return false;
            _mpLastRxStateSeq = packet.seq;
        }
        if (packet.seq > _mpLastRxSeq) _mpLastRxSeq = packet.seq;
    }
    if (MP_COMMAND_PACKET_TYPES.has(packet.type) && typeof packet.cmdSeq === 'number') {
        if (senderPeer) {
            if (packet.cmdSeq <= senderPeer.cmdSeq) {
                console.warn('Dropping stale out-of-order player command from', fromPeerId, packet.type, packet.cmdSeq);
                return false;
            }
            senderPeer.cmdSeq = packet.cmdSeq;
        } else if (!packet.relayed) {
            if (packet.cmdSeq <= _mpLastRxCmdSeq) {
                console.warn('Dropping stale out-of-order player command:', packet.type, packet.cmdSeq);
                return false;
            }
            _mpLastRxCmdSeq = packet.cmdSeq;
        }
    }

    const resolveSenderSlot = () => {
        if (senderPeer && Array.isArray(mpSlots)) {
            const byId = mpSlots.find(s => s && s.id === senderPeer.slotId);
            if (byId) return byId;
        }
        if (Number.isInteger(packet.fromSlotId) && Array.isArray(mpSlots)) {
            const byFrom = mpSlots.find(s => s && s.id === packet.fromSlotId);
            if (byFrom) return byFrom;
        }
        return getAuthenticatedPeerSlot();
    };
    const relayToOtherGuests = (pkt, slotObj) => {
        if (isMultiplayerHost && fromPeerId && netPeerConns.size > 1) {
            broadcastNetPacket(Object.assign({}, pkt, {
                fromSlotId: slotObj ? slotObj.id : undefined,
                relayed: true
            }), fromPeerId);
        }
    };

    try {
    if (packet.type === 'handshake') {
        const peerFac = packet.clientFaction || 'china';
        const peerSlot = resolveSenderSlot();
        if (peerSlot) {
            peerSlot.faction = peerFac;
            if (senderPeer) senderPeer.faction = peerFac;
        } else if (mpSlots[1]) {
            mpSlots[1].faction = peerFac;
        }
        mpOpponentFaction = peerFac;
        updateHostLobbyPeerStatus(Boolean(senderPeer && senderPeer.isLan));
        syncMpLobbyToPeer();
    }
    else if (packet.type === 'lobby_sync') {
        // Client receives live room configuration from Host
        if (Number.isInteger(packet.assignedSlotId)) {
            myMpSlotId = packet.assignedSlotId;
        }
        const cleanSlots = sanitizeMpSlots(packet.slots);
        if (cleanSlots) {
            mpSlots = cleanSlots;
            if (typeof window !== 'undefined') window.mpSlots = mpSlots;
            if (typeof packet.mapEnv === 'string') {
                const sel = document.getElementById('mp-map-env');
                if (sel) sel.value = packet.mapEnv;
            }
            if (Number.isFinite(packet.mapSize)) {
                const sel = document.getElementById('mp-map-size');
                if (sel) sel.value = String(packet.mapSize);
            }
            if (packet.customMapData && typeof sanitizeCustomMapObject === 'function') {
                const validCustom = sanitizeCustomMapObject(packet.customMapData, packet.customMapData.id);
                if (validCustom) {
                    activeCustomMap = validCustom;
                    savedCustomMaps[validCustom.id] = validCustom;
                }
            }
            const clientView = document.getElementById('mp-client-view');
            if (clientView) clientView.style.display = 'block';
            renderMapPreview('mp-client-map-preview', packet.mapEnv || 'desert', packet.mapSize || 1500, mpSlots, false);
            renderClientSlotsList(mpSlots);
        }
    }
    else if (packet.type === 'start_battle') {
        // Client receives launch packet from host
        const cleanSlots = sanitizeMpSlots(packet.slots);
        if (!cleanSlots) return false;
        const safeConfig = Object.assign({}, packet, { slots: cleanSlots });
        startMultiplayerMatch(false, safeConfig);
    }
    else if (packet.type === 'move_units') {
        // Remote peer ordered movement (restricted to remote human peer's own units; bounds clamped; stale waypoints cleared)
        const ids = new Set(packet.unitNetIds || []);
        const targetPos = clampMpWorldPos(packet.targetPos);
        const peerSlot = resolveSenderSlot();
        const peerTeamId = peerSlot ? peerSlot.team : (isMultiplayerHost ? 2 : 1);
        const peerOwnerId = peerSlot ? ('human_' + peerSlot.id) : null;
        enemyUnits.forEach(enemy => {
                const ownerOk = !peerOwnerId || !enemy.ownerId || enemy.ownerId === peerOwnerId || enemy.ownerId === 'challenger' || enemy.ownerId === 'ally';
                if (ids.has(enemy.netId) && !enemy.isAI && enemy.teamId === peerTeamId && ownerOk) {
                    enemy.targetPosition.copy(targetPos);
                    enemy.waypoints = [];
                    enemy.combatTarget = null;
                    if (enemy.isAir) {
                        enemy.airState = 'flying';
                        if (!enemy.patrolCenter) enemy.patrolCenter = new THREE.Vector3();
                        enemy.patrolCenter.copy(targetPos);
                    }
                }
        });
        relayToOtherGuests(packet, peerSlot);
    }
    else if (packet.type === 'attack_target') {
        const ids = new Set(packet.unitNetIds || []);
        const peerSlot = resolveSenderSlot();
        const peerTeamId = peerSlot ? peerSlot.team : (isMultiplayerHost ? 2 : 1);
        const peerOwnerId = peerSlot ? ('human_' + peerSlot.id) : null;
        const localTarget = units.find(u => u.netId === packet.targetNetId) ||
        structures.find(s => s.netId === packet.targetNetId) ||
        enemyUnits.find(eu => eu.netId === packet.targetNetId) ||
        enemyStructures.find(es => es.netId === packet.targetNetId);
        if (localTarget) {
            enemyUnits.forEach(enemy => {
                    const ownerOk = !peerOwnerId || !enemy.ownerId || enemy.ownerId === peerOwnerId || enemy.ownerId === 'challenger' || enemy.ownerId === 'ally';
                    if (ids.has(enemy.netId) && !enemy.isAI && enemy.teamId === peerTeamId && ownerOk) {
                        enemy.combatTarget = localTarget;
                    }
            });
        }
        relayToOtherGuests(packet, peerSlot);
    }
    else if (packet.type === 'host_left') {
        if (!isMultiplayerHost && isMultiplayerActive) {
            onHostDisconnected(packet.message || "Host has left the match.");
        }
    }
    else if (packet.type === 'client_left') {
        showNotification(packet.message || "Challenger has left the match.", "error");
        const badge = document.getElementById('mp-status-badge');
        if (badge && netPeerConns.size === 0) badge.innerHTML = '🔴 CHALLENGER DISCONNECTED';
    }
    else if (packet.type === 'spawn_unit') {
        if (!MP_ALLOWED_UNIT_TYPES.has(packet.unitType)) return false;
        if (enemyUnits.some(u => u && u.netId === packet.netId) || units.some(u => u && u.netId === packet.netId)) return false;
        if (enemyUnits.length >= 400) return false;
        const pos = clampMpWorldPos(packet.position);
        const peerSlot = resolveSenderSlot();
        const spawnTeam = peerSlot ? peerSlot.team : (isMultiplayerHost ? 2 : 1);
        const slotIndex = peerSlot ? Math.max(0, (peerSlot.id || 1) - 1) : 1;
        const peerFaction = resolveConcreteMpFaction(
            (peerSlot && peerSlot.faction) || (isMultiplayerHost ? mpOpponentFaction : 'usa'),
            typeof randomMapSeed !== 'undefined' ? randomMapSeed : 424242,
            slotIndex
        );
        const factionAllowedUnits = MP_FACTION_UNITS[peerFaction];
        if (factionAllowedUnits && !factionAllowedUnits.has(packet.unitType)) {
            console.warn('Rejected off-faction peer spawn_unit:', packet.unitType, 'for', peerFaction);
            return false;
        }
        const unitCost = (typeof unitCosts !== 'undefined' && Number.isFinite(unitCosts[packet.unitType])) ? unitCosts[packet.unitType] : 500;
        if (!consumeMpPeerBudget(unitCost, senderPeer)) {
            console.warn('Rejected unaffordable peer spawn_unit:', packet.unitType);
            return false;
        }
        if (peerSlot && peerSlot.color && typeof getPlayerColorHex === 'function' && typeof window !== 'undefined') {
            window.activeEnemyColorHex = getPlayerColorHex(peerSlot.color);
        }
        const isAlly = (spawnTeam === playerTeamId);
        const unit = spawnEnemyUnit(packet.unitType, pos, packet.netId, peerFaction);
        if (unit) {
            unit.teamId = spawnTeam;
            unit.ownerId = peerSlot ? ('human_' + peerSlot.id) : (isAlly ? 'ally' : 'challenger');
            unit.isAI = false;
            unit.faction = peerFaction;
        }
        relayToOtherGuests(packet, peerSlot);
    }
    else if (packet.type === 'build_structure') {
        if (!MP_ALLOWED_STRUCT_TYPES.has(packet.structType)) return false;
        if (enemyStructures.some(s => s && s.netId === packet.netId) || structures.some(s => s && s.netId === packet.netId)) return false;
        if (enemyStructures.length >= 200) return false;
        const pos = clampMpWorldPos(packet.position);
        const peerSlot = resolveSenderSlot();
        const structTeam = peerSlot ? peerSlot.team : (isMultiplayerHost ? 2 : 1);
        const slotIndex = peerSlot ? Math.max(0, (peerSlot.id || 1) - 1) : 1;
        const isAlly = (structTeam === playerTeamId);
        const foeFaction = resolveConcreteMpFaction(
            (peerSlot && peerSlot.faction) || (isMultiplayerHost ? mpOpponentFaction : 'usa'),
            typeof randomMapSeed !== 'undefined' ? randomMapSeed : 424242,
            slotIndex
        );
        const factionAllowedStructs = MP_FACTION_STRUCTS[foeFaction];
        if (factionAllowedStructs && !factionAllowedStructs.has(packet.structType)) {
            console.warn('Rejected off-faction peer build_structure:', packet.structType, 'for', foeFaction);
            return false;
        }
        const structCost = (typeof getStructureCost === 'function' ? getStructureCost(packet.structType) : 0) || 500;
        if (!consumeMpPeerBudget(structCost, senderPeer)) {
            console.warn('Rejected unaffordable peer build_structure:', packet.structType);
            return false;
        }
        if (peerSlot && peerSlot.color && typeof getPlayerColorHex === 'function' && typeof window !== 'undefined') {
            window.activeEnemyColorHex = getPlayerColorHex(peerSlot.color);
        }
        const structMaxHp = (typeof getStructureMaxHealth === 'function') ? getStructureMaxHealth(packet.structType) : 1200;
        const group = (typeof createStructureMeshForFaction === 'function')
        ? createStructureMeshForFaction(packet.structType, foeFaction, true)
        : createChinaWarFactory();
        if (!group.userData || !group.userData.isW3D) {
            group.scale.set(1.35, 1.35, 1.35);
        }
        group.position.copy(pos);
        if (packet.position && Number.isFinite(packet.position.rotationY)) group.rotation.y = packet.position.rotationY;
        scene.add(group);
        enemyStructures.push({
                type: packet.structType,
                faction: foeFaction,
                position: pos,
                mesh: group,
                health: structMaxHp,
                maxHealth: structMaxHp,
                radius: (typeof getStructureFootprint === 'function') ? getStructureFootprint(packet.structType).radius : 8,
                buildProgress: 100,
                isBuilding: false,
                netId: packet.netId,
                teamId: structTeam,
                ownerId: peerSlot ? ('human_' + peerSlot.id) : (isAlly ? 'ally' : 'challenger'),
                isAI: false
        });
        relayToOtherGuests(packet, peerSlot);
    }
    else if (packet.type === 'unit_damage') {
        const target = units.find(u => u.netId === packet.targetNetId) ||
        structures.find(s => s.netId === packet.targetNetId) ||
        enemyUnits.find(eu => eu.netId === packet.targetNetId) ||
        enemyStructures.find(es => es.netId === packet.targetNetId);
        if (target) {
            const maxHp = target.maxHealth || 10000;
            target.health = Math.max(0, Math.min(maxHp, packet.remainingHealth));
        }
    }
    else if (packet.type === 'state_sync' && !isMultiplayerHost) {
        const halfMap = (typeof currentMapSize === 'number' && currentMapSize > 0 ? currentMapSize : 1500) * 0.5;
        // Treat legacy packets without `k` as full keyframes for backwards compatibility
        const isKeyframe = (packet.k === undefined) ? true : Boolean(packet.k);
        const seenUnitIds = new Set();
        const unitMap = new Map();
        const localSet = new Set();
        for (let i = 0; i < units.length; i++) if (units[i].netId) { unitMap.set(units[i].netId, units[i]); localSet.add(units[i]); }
        for (let i = 0; i < enemyUnits.length; i++) if (enemyUnits[i].netId) unitMap.set(enemyUnits[i].netId, enemyUnits[i]);
        if (Array.isArray(packet.u)) {
            const uLim = Math.min(packet.u.length, 400);
            for (let i = 0; i < uLim; i++) {
                const row = packet.u[i];
                if (!Array.isArray(row) || row.length < 5) continue;
                const [nid, rawX, rawZ, rawRy, rawHp] = row;
                if (typeof nid !== 'string' || !Number.isFinite(rawX) || !Number.isFinite(rawZ) || !Number.isFinite(rawRy) || !Number.isFinite(rawHp)) continue;
                const x = Math.max(-halfMap, Math.min(halfMap, rawX));
                const z = Math.max(-halfMap, Math.min(halfMap, rawZ));
                const ry = rawRy;
                seenUnitIds.add(nid);
                const ent = unitMap.get(nid);
                if (ent) {
                    ent._mpSeenOnce = true;
                    ent.health = Math.max(0, Math.min(ent.maxHealth || 10000, rawHp));
                    if (ent.mesh) {
                        if (!Array.isArray(ent._mpSnapBuf)) ent._mpSnapBuf = [];
                        ent._mpSnapBuf.push({ t: nowMs, x, z, ry });
                        while (ent._mpSnapBuf.length > MP_MAX_ENTITY_SAMPLES) {
                            ent._mpSnapBuf.shift();
                        }
                        const drift = Math.hypot(x - ent.mesh.position.x, z - ent.mesh.position.z);
                        // Avoid rubber-banding local player units unless drift exceeds 2.5 units
                        if (!localSet.has(ent) || drift > 2.5) {
                            ent._mpNetTarget = { x, z, ry, isLocal: localSet.has(ent) };
                        } else {
                            ent._mpNetTarget = null;
                        }
                    }
                }
            }
            // Immediate death eviction for explicit delta-destroyed unit IDs
            if (Array.isArray(packet.du)) {
                const duLim = Math.min(packet.du.length, 400);
                for (let i = 0; i < duLim; i++) {
                    const deadId = packet.du[i];
                    const ent = typeof deadId === 'string' ? unitMap.get(deadId) : null;
                    if (ent && ent.health > 0) ent.health = 0;
                }
            }
            // Full ghost-unit reconciliation only on keyframe snapshots so delta frames never kill idle units
            if (isKeyframe) {
                unitMap.forEach((ent, nid) => {
                        if (ent._mpSeenOnce && !seenUnitIds.has(nid) && ent.health > 0) {
                            ent.health = 0;
                        }
                });
            }
        }
        if (Array.isArray(packet.s)) {
            const seenStructIds = new Set();
            const structMap = new Map();
            for (let i = 0; i < structures.length; i++) if (structures[i].netId) structMap.set(structures[i].netId, structures[i]);
            for (let i = 0; i < enemyStructures.length; i++) if (enemyStructures[i].netId) structMap.set(enemyStructures[i].netId, enemyStructures[i]);
            const sLim = Math.min(packet.s.length, 250);
            for (let i = 0; i < sLim; i++) {
                const row = packet.s[i];
                if (!Array.isArray(row) || row.length < 2) continue;
                const [nid, rawHp] = row;
                if (typeof nid !== 'string' || !Number.isFinite(rawHp)) continue;
                seenStructIds.add(nid);
                const st = structMap.get(nid);
                if (st) {
                    st._mpSeenOnce = true;
                    st.health = Math.max(0, Math.min(st.maxHealth || 10000, rawHp));
                }
            }
            if (Array.isArray(packet.ds)) {
                const dsLim = Math.min(packet.ds.length, 250);
                for (let i = 0; i < dsLim; i++) {
                    const deadId = packet.ds[i];
                    const st = typeof deadId === 'string' ? structMap.get(deadId) : null;
                    if (st && st.health > 0) st.health = 0;
                }
            }
            if (isKeyframe) {
                structMap.forEach((st, nid) => {
                        if (st._mpSeenOnce && !seenStructIds.has(nid) && st.health > 0) {
                            st.health = 0;
                        }
                });
            }
        }
    }
    else if (packet.type === 'chat') {
        addMpChatMessage(packet.sender, packet.text);
        relayToOtherGuests(packet, resolveSenderSlot());
    }
    } catch (err) {
        console.warn('Error handling multiplayer packet:', err);
        return false;
    }
}

// --- HOST LAUNCHES MATCH ---
function hostLaunchBattle() {
    const mapEnv = document.getElementById('mp-map-env').value;
    const mapSize = parseInt(document.getElementById('mp-map-size').value, 10);
    const startMoney = parseInt(document.getElementById('mp-starting-money').value, 10);
    const startUnits = document.getElementById('mp-starting-units').value;

    const basePacket = {
        type: 'start_battle',
        mapType: mapEnv,
        mapSize: mapSize,
        money: startMoney,
        startingUnits: startUnits,
        slots: mpSlots,
        customMapData: activeCustomMap ? activeCustomMap : null,
        seed: Math.floor(Math.random() * 1000000)
    };

    if (netPeerConns.size > 0) {
        for (const [pid, entry] of netPeerConns.entries()) {
            if (entry && entry.conn && entry.conn.open) {
                broadcastNetPacket(Object.assign({}, basePacket, { assignedSlotId: entry.slotId }), null, pid);
            }
        }
    } else {
        broadcastNetPacket(basePacket);
    }
    startMultiplayerMatch(true, basePacket);
}

// --- COMMON MULTIPLAYER START LOGIC ---
function startMultiplayerMatch(isHost, config) {
    isMultiplayerActive = true;
    isMultiplayerHost = isHost;
    _mpStateSyncCount = 0;
    _mpCmdTxSeq = 0;
    _mpLastRxCmdSeq = 0;
    _mpLastUnitSnapMap.clear();
    _mpLastStructSnapMap.clear();
    if (!isHost && Number.isInteger(config.assignedSlotId)) {
        myMpSlotId = config.assignedSlotId;
    } else if (isHost) {
        myMpSlotId = 1;
    }
    for (const entry of netPeerConns.values()) {
        if (entry) {
            entry.cmdSeq = 0;
            entry.budget = Math.max(2000, (Number(config.money) || 10000) + 2500);
            entry.budgetLastMs = Date.now();
        }
    }

    // Seed deterministic simulation PRNG from host match seed so both peers share identical RNG stream
    const matchSeed = (Number(config.seed) >>> 0) || 424242;
    if (typeof setSimSeed === 'function') setSimSeed(matchSeed);
    if (typeof randomMapSeed !== 'undefined') randomMapSeed = matchSeed;

    // Apply synced game configuration
    currentMapType = config.mapType;
    currentMapSize = config.mapSize;
    playerResources = config.money;
    _mpPeerBudget = Math.max(2000, (Number(config.money) || 10000) + 2500);
    _mpPeerBudgetLastMs = Date.now();

    if (config.customMapData) {
        const validCustom = (typeof sanitizeCustomMapObject === 'function')
            ? sanitizeCustomMapObject(config.customMapData, config.customMapData.id || (typeof config.mapType === 'string' ? config.mapType : null))
            : null;
        if (!validCustom) {
            console.warn('Rejected invalid customMapData in start_battle');
            if (typeof showNotification === 'function') showNotification('Rejected invalid custom map data from host.', 'error');
            return;
        }
        activeCustomMap = validCustom;
        if (typeof savedCustomMaps === 'object' && savedCustomMaps !== null) {
            savedCustomMaps[validCustom.id] = validCustom;
        }
        currentMapType = validCustom.id;
    }

    const rawSlots = (config.slots || mpSlots).filter(s => s && s.active);
    const activeSlots = rawSlots.map((s, idx) => Object.assign({}, s, {
        faction: resolveConcreteMpFaction(s.faction, matchSeed, idx)
    }));
    mpSlots = activeSlots.slice();
    if (typeof window !== 'undefined') window.mpSlots = mpSlots;
    const mySlot = isHost
        ? activeSlots.find(s => s.isHost)
        : (activeSlots.find(s => s.id === myMpSlotId) || activeSlots.find(s => s.peerId && s.peerId === myMpPeerId) || activeSlots.find(s => !s.isHost && s.isHuman));
    const playerSlot = mySlot || activeSlots[0];
    if (!playerSlot) return;
    myMpSlotId = playerSlot.id;
    playerTeamId = playerSlot.team;
    selectedFaction = playerSlot.faction;
    const humanCount = activeSlots.filter(s => s.isHuman).length;
    const remoteHumanSlot = activeSlots.find(s => s.isHuman && s !== playerSlot);
    if (remoteHumanSlot) mpOpponentFaction = remoteHumanSlot.faction;
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
        badge.innerHTML = `🟢 P2P WEBRTC ONLINE | ROOM: ${escapeHtml(currentRoomCode)} | TEAM ${escapeHtml(String(playerTeamId))} (${isHost ? 'HOST' : 'CLIENT'})`;
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

            const isMe = (slot === playerSlot);

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
                // Remote Human Peer Base (supports up to 8 human players / 4v4)
                if (typeof getPlayerColorHex === 'function') {
                    window.activeEnemyColorHex = getPlayerColorHex(slot.color || 'red');
                }
                const faceCenterYaw = (Math.hypot(spawnPos.x, spawnPos.z) > 1) ? Math.atan2(-spawnPos.x, -spawnPos.z) : 0;
                const foeCCGroup = (slot.faction === 'china') ? createChinaCommandCenter(true) : (slot.faction === 'gla') ? createGLACommandCenter(true) : createUSACommandCenter(true);
                foeCCGroup.position.copy(spawnPos);
                foeCCGroup.rotation.y = faceCenterYaw;
                scene.add(foeCCGroup);
                const ccMaxHp = (typeof getStructureMaxHealth === 'function') ? getStructureMaxHealth('commandCenter') : 5000;
                const ccNetId = (humanCount <= 2) ? ((isHost ? 'CS_' : 'HS_') + 'CC') : ('P' + slot.id + '_CC');
                enemyStructures.push({
                        type: 'commandCenter', faction: slot.faction, position: spawnPos.clone(), rotationY: faceCenterYaw,
                        mesh: foeCCGroup, health: ccMaxHp, maxHealth: ccMaxHp, radius: 10,
                        buildProgress: 100, isBuilding: false, netId: ccNetId,
                        teamId: slot.team, ownerId: 'human_' + slot.id, isAI: false
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
    if (typeof document !== 'undefined' && document.body) document.body.classList.remove('in-main-menu');
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
    const safeSenderStr = String(sender ?? 'Commander');
    const isSys = safeSenderStr === 'SYSTEM';
    const isHst = safeSenderStr.toLowerCase().includes('host');
    msg.className = 'mp-chat-msg ' + (isSys ? 'system' : isHst ? 'host' : 'challenger');
    msg.innerHTML = `<strong>[${escapeHtml(safeSenderStr)}]:</strong> ${escapeHtml(text)}`;
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
let _baseDefScanTick = 0;
function processBaseDefenseCombat() {
    _baseDefScanTick++;
    const curTick = (typeof buildingTick !== 'undefined') ? buildingTick : 0;
    const isDefType = (t) => t === 'patriot' || t === 'gatlingCannon' || t === 'stingerSite';
    let defIdx = 0;

    const processDefense = (def, isPlayerList) => {
        if (!def || !isDefType(def.type) || def.health <= 0 || def.isBuilding) return;
        const myIdx = defIdx++;
        if (def.disabledUntil && curTick < def.disabledUntil) {
            def._gatTarget = null;
            return;
        }
        const isPlayerDef = isPlayerList && !def.isEnemy;
        if (isPlayerDef && (def.type === 'patriot' || def.type === 'gatlingCannon') && typeof isPlayerLowPower !== 'undefined' && isPlayerLowPower) {
            def._gatTarget = null;
            return;
        }
        if (def.attackCooldown === undefined) def.attackCooldown = 0;
        if (def.attackCooldown > 0) {
            def.attackCooldown = Math.max(0, def.attackCooldown - combatDeltaScale);
        }

        const defCenter = def.position || def.mesh.position;

        // China Gatling Cannon: continuous target-locked 3-stage spool-up fire (INIZH.big: 250ms -> 125ms -> 62ms, 2.0s coast)
        if (def.type === 'gatlingCannon') {
            const isValidDefTarget = (t) => {
                if (!t || t.health <= 0 || t.garrisonedIn || !t.mesh || isFriendly(def, t)) return false;
                if (t.isStealthed && !(t.revealedUntil && t.revealedUntil > curTick)) return false;
                const tPos = t.position || t.mesh.position;
                const maxR = (t.isAir ? 86.4 : 48.6) + (t.radius || 0); // Retail INIZH.big: 400 Air / 225 Ground (* 0.216)
                return Math.hypot(defCenter.x - tPos.x, defCenter.z - tPos.z) <= maxR;
            };
            let target = isValidDefTarget(def._gatTarget) ? def._gatTarget : null;
            if (!target) {
                if (def._defIdleScanCd > 0) {
                    def._defIdleScanCd--;
                } else {
                    let bestDistSq = Infinity;
                    const scanUnitList = (list) => {
                        for (let i = 0; i < list.length; i++) {
                            const t = list[i];
                            if (!isValidDefTarget(t)) continue;
                            const dx = defCenter.x - t.mesh.position.x;
                            const dz = defCenter.z - t.mesh.position.z;
                            const dSq = dx * dx + dz * dz;
                            const effSq = t.isAir ? dSq * 0.65 : dSq;
                            if (effSq < bestDistSq) { bestDistSq = effSq; target = t; }
                        }
                    };
                    scanUnitList(units);
                    scanUnitList(enemyUnits);
                    if (!target) {
                        const scanStructList = (list) => {
                            for (let i = 0; i < list.length; i++) {
                                if (isValidDefTarget(list[i])) { target = list[i]; return true; }
                            }
                            return false;
                        };
                        if (!scanStructList(structures)) scanStructList(enemyStructures);
                    }
                    def._gatTarget = target;
                    if (!target) def._defIdleScanCd = 3 + (myIdx % 2);
                }
            }
            if (target) {
                const targetPos = (target.position || target.mesh.position).clone();
                targetPos.y += (target.isAir ? 0.3 : 0.6);
                // Track turret smoothly every tick while locked onto enemy
                const turret = getCachedNode(def.mesh, "turretSystem");
                if (turret && turret.parent && typeof turret.parent.worldToLocal === 'function') {
                    const localTarget = turret.parent.worldToLocal(targetPos.clone());
                    turret.rotation.y = Math.atan2(localTarget.x, localTarget.z);
                }
                if (def.attackCooldown === 0) {
                    def._gatSpin = Math.min(12, (def._gatSpin || 0) + 1);
                    def._gatCoastTicks = 120; // 2.0s ContinuousFireCoast
                    def.attackCooldown = def._gatSpin >= 5 ? 4 : (def._gatSpin >= 1 ? 8 : 15);
                    def._gatlingSpinVel = def._gatSpin >= 5 ? 0.98 : (def._gatSpin >= 1 ? 0.68 : 0.42);
                    if (def.mesh && typeof def.mesh.updateMatrixWorld === 'function') def.mesh.updateMatrixWorld(true);
                    const m1 = def.mesh && typeof def.mesh.getObjectByName === 'function' ? def.mesh.getObjectByName("MUZZLE01") : null;
                    const m2 = def.mesh && typeof def.mesh.getObjectByName === 'function' ? def.mesh.getObjectByName("MUZZLE02") : null;
                    const fallbackPos = defCenter.clone();
                    fallbackPos.y += 3.2;
                    const muzzleL = (m1 && typeof m1.getWorldPosition === 'function') ? m1.getWorldPosition(new THREE.Vector3()) : fallbackPos;
                    const muzzleR = (m2 && typeof m2.getWorldPosition === 'function') ? m2.getWorldPosition(new THREE.Vector3()) : null;
                    spawnMuzzleFlash(muzzleL, 0xffa502, 0.42);
                    spawnBulletTracer(muzzleL, targetPos, 0xf1c40f, 2.8);
                    if (typeof spawnBulletImpactFX === 'function' && typeof getArmorCategory === 'function') {
                        spawnBulletImpactFX(targetPos, getArmorCategory(target), false);
                    }
                    if (muzzleR) {
                        spawnMuzzleFlash(muzzleR, 0xffa502, 0.42);
                        spawnBulletTracer(muzzleR, targetPos, 0xffd32a, 2.8);
                    }
                    if ((!def.mesh || def.mesh.visible) && Math.random() < 0.35 && typeof playAudio === 'function') playAudio('gatling_fire', {}, 'china');
                    if (typeof applyCalculatedDamage === 'function') {
                        applyCalculatedDamage(def, target, target.isAir ? 6 : 10, 'GATLING');
                    } else {
                        target.health -= (target.isAir ? 6 : 10);
                    }
                    // PERF/NET: throttle rapid-fire Gatling unit_damage packets to <=4 Hz (or immediately on kill) so base defenses cannot saturate MP_RATE_LIMIT_PER_SEC
                    if (isMultiplayerActive && netConn && netConn.open && isMultiplayerHost && target.netId) {
                        const dmgNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
                        if (target.health <= 0 || !def._lastDmgSyncMs || (dmgNow - def._lastDmgSyncMs) >= 250) {
                            def._lastDmgSyncMs = dmgNow;
                            broadcastNetPacket({
                                type: 'unit_damage',
                                targetNetId: target.netId,
                                remainingHealth: Math.max(0, target.health)
                            });
                        }
                    }
                }
            } else {
                if (def._gatCoastTicks > 0) {
                    def._gatCoastTicks = Math.max(0, def._gatCoastTicks - combatDeltaScale);
                } else if (def._gatSpin > 0) {
                    def._gatSpin = Math.max(0, def._gatSpin - 0.12 * combatDeltaScale);
                }
            }
            return;
        }

        // Acquire closest target within official INIZH.big defense range (AttackRange = 225.0 => 48.6 units) strictly filtering !isFriendly
        if (def.attackCooldown === 0) {
            if (def.type === 'stingerSite' && Array.isArray(def.stingerCrew)) {
                for (let ci = 0; ci < 3; ci++) {
                    if (def.stingerCrew[ci] <= 0 && curTick >= (def.stingerRespawnAt[ci] || 0)) {
                        def.stingerCrew[ci] = 100;
                        const cm = def.mesh && def.mesh.getObjectByName ? def.mesh.getObjectByName('stingerCrew_' + ci) : null;
                        if (cm) cm.visible = true;
                    }
                }
            }
            if (def._defIdleScanCd > 0) {
                def._defIdleScanCd--;
                return;
            }
            const defRange = 48.6;
            const defAirRange = (def.type === 'stingerSite') ? 86.4 : (def.type === 'patriot' ? 75.6 : 86.4);
            let closestEnemy = null;
            let closestDistSq = Infinity;
            const scanUnits = (list) => {
                for (let i = 0; i < list.length; i++) {
                    const target = list[i];
                    if (target.health > 0 && !target.garrisonedIn && target.mesh && !isFriendly(def, target)) {
                        const dx = defCenter.x - target.mesh.position.x;
                        const dz = defCenter.z - target.mesh.position.z;
                        const dSq = dx * dx + dz * dz;
                        const maxR = target.isAir ? defAirRange : defRange;
                        if (dSq < maxR * maxR && dSq < closestDistSq) {
                            closestDistSq = dSq;
                            closestEnemy = target;
                        }
                    }
                }
            };
            scanUnits(units);
            scanUnits(enemyUnits);

            if (!closestEnemy) {
                const scanStructs = (list) => {
                    for (let i = 0; i < list.length; i++) {
                        const struct = list[i];
                        if (struct.health > 0 && struct.mesh && !isFriendly(def, struct)) {
                            const sPos = struct.position || struct.mesh.position;
                            const maxRange = defRange + (struct.radius || 0);
                            const dx = defCenter.x - sPos.x;
                            const dz = defCenter.z - sPos.z;
                            const dSq = dx * dx + dz * dz;
                            if (dSq < maxRange * maxRange) {
                                closestDistSq = dSq;
                                closestEnemy = struct;
                                return true;
                            }
                        }
                    }
                    return false;
                };
                if (!scanStructs(structures)) scanStructs(enemyStructures);
            }

            if (closestEnemy) {
                // Point turret at target
                const turret = getCachedNode(def.mesh, "turretSystem") || getCachedNode(def.mesh, "gatlingBarrels");
                if (turret && turret.parent && typeof turret.parent.worldToLocal === 'function') {
                    const localTarget = turret.parent.worldToLocal(closestEnemy.mesh.position.clone());
                    turret.rotation.y = Math.atan2(localTarget.x, localTarget.z);
                }

                // Fire defense weapon
                const defPos = (def.position || def.mesh.position).clone();
                defPos.y += 3.5;
                const targetPos = (closestEnemy.position || closestEnemy.mesh.position).clone();
                targetPos.y += (closestEnemy.isAir ? 0.2 : 0.5);

                if (def.type === 'patriot') {
                    def.attackCooldown = 180; // 3.0s reload
                    spawnMuzzleFlash(defPos, 0xff9f43, 0.8);
                    spawnRocketProjectile(defPos, targetPos, true, false);
                    if ((!def.mesh || def.mesh.visible) && typeof playUSASound === 'function') playUSASound('patriot_fire');
                    if (typeof applyCalculatedDamage === 'function') applyCalculatedDamage(def, closestEnemy, 65, 'EXPLOSIVE');
                    else closestEnemy.health -= 65;
                } else if (def.type === 'stingerSite') {
                    // Official INIZH.big GLAStingerSite: 3 Stinger Soldiers (100 HP each, 30s auto-respawn) firing a ripple volley
                    if (!Array.isArray(def.stingerCrew)) {
                        def.stingerCrew = [100, 100, 100];
                        def.stingerRespawnAt = [0, 0, 0];
                    }
                    let livingSoldiers = 0;
                    for (let ci = 0; ci < 3; ci++) {
                        if (def.stingerCrew[ci] <= 0 && curTick >= (def.stingerRespawnAt[ci] || 0)) {
                            def.stingerCrew[ci] = 100;
                            const cm = def.mesh && def.mesh.getObjectByName ? def.mesh.getObjectByName('stingerCrew_' + ci) : null;
                            if (cm) cm.visible = true;
                        }
                        if (def.stingerCrew[ci] > 0) livingSoldiers++;
                    }
                    if (livingSoldiers > 0) {
                        def.attackCooldown = 150; // 2.5s reload
                        const isToxinStinger = isPlayerDef && typeof activePlayerGeneral !== 'undefined' && activePlayerGeneral === 'gla_toxin';
                        for (let s = 0; s < livingSoldiers; s++) {
                            const offX = (s - 1) * 1.0;
                            const mPos = defPos.clone().add(new THREE.Vector3(offX, -1.6, 0));
                            spawnMuzzleFlash(mPos, isToxinStinger ? 0x2ed573 : 0xff9f43, 0.45);
                            spawnRocketProjectile(mPos, targetPos, false, isToxinStinger);
                        }
                        if ((!def.mesh || def.mesh.visible) && typeof playAudio === 'function') playAudio('stinger_fire', {}, 'gla');
                        const totalVolleyDmg = 32 * livingSoldiers;
                        if (typeof applyCalculatedDamage === 'function') applyCalculatedDamage(def, closestEnemy, totalVolleyDmg, 'EXPLOSIVE');
                        else closestEnemy.health -= totalVolleyDmg;
                    }
                }

                // Sync heavy defense damage in multiplayer (host-authoritative)
                if (isMultiplayerActive && netConn && netConn.open && isMultiplayerHost && closestEnemy.netId) {
                    broadcastNetPacket({
                            type: 'unit_damage',
                            targetNetId: closestEnemy.netId,
                            remainingHealth: Math.max(0, closestEnemy.health)
                    });
                }
            } else {
                def._defIdleScanCd = 3 + (myIdx % 2);
            }
        }
    };

    for (let i = 0; i < structures.length; i++) processDefense(structures[i], true);
    for (let i = 0; i < enemyStructures.length; i++) processDefense(enemyStructures[i], false);
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

let _mpLastStateSyncMs = -1000;
function broadcastHostStateSync() {
    if (!isMultiplayerActive || !isMultiplayerHost) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - _mpLastStateSyncMs < 100) return; // 10 Hz host-authoritative delta snapshot
    _mpLastStateSyncMs = now;

    _mpStateSyncCount++;
    const isKeyframe = (_mpStateSyncCount === 1) || (_mpStateSyncCount % MP_KEYFRAME_INTERVAL === 0);

    const uSnap = [];
    const currentUnitIds = new Set();
    const packUnits = (arr) => {
        for (let i = 0; i < arr.length; i++) {
            const u = arr[i];
            if (u && u.netId && u.health > 0 && u.mesh) {
                const x = Math.round(u.mesh.position.x * 10) / 10;
                const z = Math.round(u.mesh.position.z * 10) / 10;
                const ry = Math.round(u.mesh.rotation.y * 100) / 100;
                const hp = Math.round(u.health);
                currentUnitIds.add(u.netId);
                const prev = _mpLastUnitSnapMap.get(u.netId);
                const changed = isKeyframe || !prev ||
                    Math.abs(x - prev.x) > 0.05 ||
                    Math.abs(z - prev.z) > 0.05 ||
                    Math.abs(ry - prev.ry) > 0.02 ||
                    hp !== prev.hp;
                if (changed) {
                    uSnap.push([u.netId, x, z, ry, hp]);
                    _mpLastUnitSnapMap.set(u.netId, { x, z, ry, hp });
                }
            }
        }
    };
    packUnits(units);
    packUnits(enemyUnits);

    const du = [];
    _mpLastUnitSnapMap.forEach((_, nid) => {
        if (!currentUnitIds.has(nid)) {
            du.push(nid);
            _mpLastUnitSnapMap.delete(nid);
        }
    });

    const sSnap = [];
    const currentStructIds = new Set();
    const packStructs = (arr) => {
        for (let i = 0; i < arr.length; i++) {
            const s = arr[i];
            if (s && s.netId && s.health > 0) {
                const hp = Math.round(s.health);
                currentStructIds.add(s.netId);
                const prevHp = _mpLastStructSnapMap.get(s.netId);
                if (isKeyframe || prevHp === undefined || prevHp !== hp) {
                    sSnap.push([s.netId, hp]);
                    _mpLastStructSnapMap.set(s.netId, hp);
                }
            }
        }
    };
    packStructs(structures);
    packStructs(enemyStructures);

    const ds = [];
    _mpLastStructSnapMap.forEach((_, nid) => {
        if (!currentStructIds.has(nid)) {
            ds.push(nid);
            _mpLastStructSnapMap.delete(nid);
        }
    });

    // Skip empty delta packets when battlefield state is completely unchanged
    if (!isKeyframe && uSnap.length === 0 && sSnap.length === 0 && du.length === 0 && ds.length === 0) {
        return;
    }

    const pkt = { type: 'state_sync', k: isKeyframe ? 1 : 0, u: uSnap, s: sSnap };
    if (du.length > 0) pkt.du = du;
    if (ds.length > 0) pkt.ds = ds;
    broadcastNetPacket(pkt);
}

function updateMultiplayerInterpolation() {
    if (!isMultiplayerActive || isMultiplayerHost) return;
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const renderTime = nowMs - MP_INTERP_DELAY_MS;

    const shortestAngleDelta = (from, to) => {
        let diff = to - from;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        return diff;
    };

    const interpolateEntity = (ent, isLocal) => {
        if (!ent || ent.health <= 0 || !ent.mesh) return;
        const buf = ent._mpSnapBuf;
        let targetX = null, targetZ = null, targetRy = null;

        if (Array.isArray(buf) && buf.length >= 2) {
            let older = null, newer = null;
            for (let j = 0; j < buf.length - 1; j++) {
                if (buf[j].t <= renderTime && buf[j + 1].t >= renderTime) {
                    older = buf[j];
                    newer = buf[j + 1];
                    break;
                }
            }
            if (!older || !newer) {
                older = buf[buf.length - 2];
                newer = buf[buf.length - 1];
            }
            const span = newer.t - older.t;
            const alpha = span > 0 ? Math.max(0, Math.min(1, (renderTime - older.t) / span)) : 1.0;
            targetX = older.x + (newer.x - older.x) * alpha;
            targetZ = older.z + (newer.z - older.z) * alpha;
            targetRy = older.ry + shortestAngleDelta(older.ry, newer.ry) * alpha;
        } else if (ent._mpNetTarget) {
            targetX = ent._mpNetTarget.x;
            targetZ = ent._mpNetTarget.z;
            targetRy = ent._mpNetTarget.ry;
        } else {
            return;
        }

        if (isLocal) {
            const drift = Math.hypot(targetX - ent.mesh.position.x, targetZ - ent.mesh.position.z);
            if (drift <= 2.5) return;
            const blend = drift > 6.0 ? 0.30 : 0.14;
            ent.mesh.position.x += (targetX - ent.mesh.position.x) * blend;
            ent.mesh.position.z += (targetZ - ent.mesh.position.z) * blend;
            ent.mesh.rotation.y += shortestAngleDelta(ent.mesh.rotation.y, targetRy) * blend;
        } else {
            ent.mesh.position.x += (targetX - ent.mesh.position.x) * 0.45;
            ent.mesh.position.z += (targetZ - ent.mesh.position.z) * 0.45;
            ent.mesh.rotation.y += shortestAngleDelta(ent.mesh.rotation.y, targetRy) * 0.45;
            if (!ent.isAir && typeof getTerrainHeight === 'function') {
                ent.mesh.position.y = getTerrainHeight(ent.mesh.position.x, ent.mesh.position.z);
            }
        }
    };

    for (let i = 0; i < units.length; i++) interpolateEntity(units[i], true);
    for (let i = 0; i < enemyUnits.length; i++) interpolateEntity(enemyUnits[i], false);
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
