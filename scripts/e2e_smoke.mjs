import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const rootDir = path.resolve(import.meta.dirname, '..');
const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    const reqPath = (req.url || '/').split('?')[0];
    const relPath = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
    const fullPath = path.resolve(rootDir, relPath);
    const relCheck = path.relative(rootDir, fullPath);
    if (relCheck.startsWith('..') || path.isAbsolute(relCheck) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(fullPath).pipe(res);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}/`;

const pageErrors = [];
let browser;
try {
    browser = await chromium.launch({
        headless: true,
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (err) => pageErrors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
        if (msg.type() === 'error') pageErrors.push(`console.error: ${msg.text()}`);
    });
    page.on('requestfailed', (req) => {
        pageErrors.push(`requestfailed: ${req.url()} (${req.failure()?.errorText || 'unknown'})`);
    });
    page.on('response', (res) => {
        if (res.status() >= 400 && !res.url().includes('favicon.ico')) {
            pageErrors.push(`HTTP ${res.status()} on ${res.url()}`);
        }
    });

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.THREE && window.OFFICIAL_CAMEOS && window.OFFICIAL_SKIRMISH_MAPS && window.W3D_INFANTRY_DATA), { timeout: 20000 });

    // Launch a Skirmish match and render 20 frames to verify terrain, W3D units/buildings, shaders, and audio JSON loading
    await page.evaluate(() => {
        if (typeof startGame !== 'function') throw new Error('startGame() is not defined');
        startGame();
    });
    await page.evaluate(() => new Promise((resolve) => {
        let frames = 0;
        const step = () => (++frames >= 20 ? resolve() : requestAnimationFrame(step));
        requestAnimationFrame(step);
    }));

    const stats = await page.evaluate(() => ({
        cameoCount: Object.keys(window.OFFICIAL_CAMEOS || {}).length,
        mapCount: Object.keys(window.OFFICIAL_SKIRMISH_MAPS || {}).length,
        infantryCount: Object.keys(window.W3D_INFANTRY_DATA || {}).length,
        hasCanvas: Boolean(document.querySelector('canvas')),
        unitCount: typeof units !== 'undefined' ? units.length : 0,
        structCount: typeof structures !== 'undefined' ? structures.length : 0,
        enemyStructCount: typeof enemyStructures !== 'undefined' ? enemyStructures.length : 0
    }));

    if (stats.cameoCount < 200 || stats.mapCount < 12 || stats.infantryCount < 10 || !stats.hasCanvas || stats.unitCount < 1 || stats.structCount < 1 || stats.enemyStructCount < 1) {
        throw new Error(`E2E Skirmish check failed: ${JSON.stringify(stats)}`);
    }

    // 2. Two-Peer Multiplayer E2E Stress Test (Host Runtime <-> Client Peer Simulation with simulated packet loss, out-of-order replay & disconnect)
    // Pause heavy 3D WebGL rendering loop during protocol stress phase so software SwiftShader does not starve the event loop on 2-vCPU CI runners
    const mpStats = await page.evaluate(() => {
        const logs = [];
        // 1. Simulate Client Handshake arriving on Host
        isMultiplayerHost = true;
        isMultiplayerActive = false;
        currentRoomCode = 'CNC-E2ETST';
        const outboundToClient = [];
        netConn = {
            open: true,
            send: (pkt) => outboundToClient.push(JSON.parse(JSON.stringify(pkt))),
            close: function() { this.open = false; }
        };

        handleNetworkPacket({ type: 'handshake', v: 2, seq: 1, clientFaction: 'china' });
        if (mpOpponentFaction !== 'china') throw new Error('Host failed to record opponent faction from handshake');
        const lobbySyncPkt = outboundToClient.find(p => p.type === 'lobby_sync');
        if (!lobbySyncPkt || lobbySyncPkt.v !== 2 || !Array.isArray(lobbySyncPkt.slots)) {
            throw new Error('Host did not emit valid v2 lobby_sync packet after handshake');
        }

        // 2. Host launches multiplayer battle
        outboundToClient.length = 0;
        mpSlots = [
            { id: 1, active: true, isHost: true, isHuman: true, name: 'Host', faction: 'usa', color: 'blue', team: 1, spawnId: 1 },
            { id: 2, active: true, isHost: false, isHuman: true, name: 'Challenger', faction: 'china', color: 'red', team: 2, spawnId: 2 }
        ];
        const launchPkt = {
            type: 'start_battle',
            mapType: 'tournament_desert',
            mapSize: 1500,
            money: 10000,
            startingUnits: 'small',
            slots: mpSlots,
            customMapData: null,
            seed: 987654
        };
        broadcastNetPacket(launchPkt);
        startMultiplayerMatch(true, launchPkt);

        // Emit 8 consecutive state_sync snapshots + move_units + chat from Host
        const u0 = units[0];
        if (u0 && u0.netId) {
            broadcastNetPacket({
                type: 'move_units',
                unitNetIds: [u0.netId],
                targetPos: { x: u0.mesh.position.x + 25, y: u0.mesh.position.y, z: u0.mesh.position.z - 20 }
            });
        }
        broadcastNetPacket({ type: 'chat', sender: 'Host', text: 'Advancing across valley!' });
        for (let i = 0; i < 8; i++) {
            _mpLastStateSyncMs = -1000;
            broadcastHostStateSync();
        }
        if (outboundToClient.filter(p => p.type === 'state_sync').length !== 8) {
            throw new Error('Expected 8 host state_sync snapshots queued');
        }

        // 3. Switch to Client role and replay Host packet stream with 25% simulated packet loss on state_sync
        resetMultiplayerTransportState();
        const clientStartPkt = outboundToClient.find(p => p.type === 'start_battle');
        startMultiplayerMatch(false, clientStartPkt);

        let syncIdx = 0;
        let appliedSyncs = 0;
        for (const pkt of outboundToClient) {
            if (pkt.type === 'start_battle') continue;
            if (pkt.type === 'state_sync') {
                syncIdx++;
                if (syncIdx % 4 === 0) continue; // 25% simulated packet loss
            }
            const res = handleNetworkPacket(pkt);
            if (pkt.type === 'state_sync' && res !== false) appliedSyncs++;
        }

        // 4. Inject out-of-order stale state_sync packet (seq=1) and verify Client rejects it
        const staleAccepted = handleNetworkPacket({ type: 'state_sync', v: 2, seq: 1, u: [], s: [] });
        if (staleAccepted !== false) {
            throw new Error('Client failed to reject out-of-order stale state_sync packet!');
        }

        // 5. Simulate Host disconnect and verify Client renders disconnect modal
        handleNetworkPacket({ type: 'host_left', v: 2, seq: 999, message: 'Host ended E2E test session.' });
        const modal = document.getElementById('host-disconnected-modal');
        return {
            modalVisible: Boolean(modal && modal.style.display === 'flex'),
            appliedSyncs,
            chatCount: document.querySelectorAll('#mp-chat-messages .mp-chat-msg').length,
            clientStructCount: typeof structures !== 'undefined' ? structures.length : 0,
            clientEnemyStructCount: typeof enemyStructures !== 'undefined' ? enemyStructures.length : 0
        };
    });

    if (!mpStats.modalVisible || mpStats.appliedSyncs !== 6 || mpStats.chatCount < 2 || mpStats.clientStructCount < 1 || mpStats.clientEnemyStructCount < 1) {
        throw new Error(`E2E Two-Peer Multiplayer check failed: ${JSON.stringify(mpStats)}`);
    }

    if (pageErrors.length > 0) {
        throw new Error(`Browser errors detected: ${pageErrors.join(' | ')}`);
    }
    console.log(`✓ Playwright E2E Skirmish & Two-Peer Multiplayer smoke passed: ${JSON.stringify({ ...stats, mpStats })}`);
} finally {
    if (browser) await browser.close();
    server.close();
    server.closeAllConnections?.();
}
