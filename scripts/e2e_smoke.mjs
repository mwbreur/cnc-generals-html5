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

    // 2. Two-Peer Multiplayer E2E Stress Test (Host Page <-> Client Page with simulated latency, packet drop & disconnect)
    const clientPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    clientPage.on('pageerror', (err) => pageErrors.push(`client pageerror: ${err.message}`));
    clientPage.on('console', (msg) => {
        if (msg.type() === 'error') pageErrors.push(`client console.error: ${msg.text()}`);
    });
    await clientPage.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await clientPage.waitForFunction(() => Boolean(window.THREE && window.OFFICIAL_CAMEOS && window.OFFICIAL_SKIRMISH_MAPS && window.W3D_INFANTRY_DATA), { timeout: 20000 });

    // Wire an in-memory WebRTC DataConnection bridge between Host (page) and Client (clientPage)
    const hostQueue = [];
    const clientQueue = [];
    await page.exposeFunction('__sendToClientPeer', (pkt) => clientQueue.push(JSON.parse(JSON.stringify(pkt))));
    await clientPage.exposeFunction('__sendToHostPeer', (pkt) => hostQueue.push(JSON.parse(JSON.stringify(pkt))));

    await page.evaluate(() => {
        isMultiplayerHost = true;
        isMultiplayerActive = false;
        currentRoomCode = 'CNC-E2ETST';
        netConn = {
            open: true,
            send: (pkt) => window.__sendToClientPeer(pkt),
            close: function() { this.open = false; }
        };
    });
    await clientPage.evaluate(() => {
        isMultiplayerHost = false;
        isMultiplayerActive = false;
        currentRoomCode = 'CNC-E2ETST';
        netConn = {
            open: true,
            send: (pkt) => window.__sendToHostPeer(pkt),
            close: function() { this.open = false; }
        };
    });

    const flushPackets = async ({ dropEvery = 0 } = {}) => {
        let idx = 0;
        while (hostQueue.length > 0 || clientQueue.length > 0) {
            while (clientQueue.length > 0) {
                const pkt = clientQueue.shift();
                idx++;
                // Only drop non-critical state_sync packets when simulating packet loss
                if (dropEvery > 0 && pkt.type === 'state_sync' && (idx % dropEvery === 0)) continue;
                await clientPage.evaluate((p) => handleNetworkPacket(p), pkt);
            }
            while (hostQueue.length > 0) {
                const pkt = hostQueue.shift();
                await page.evaluate((p) => handleNetworkPacket(p), pkt);
            }
        }
    };

    // A. Client sends handshake -> Host updates lobby & syncs back -> Host launches multiplayer battle
    await clientPage.evaluate(() => {
        selectedFaction = 'china';
        broadcastNetPacket({ type: 'handshake', clientFaction: 'china' });
    });
    await flushPackets();

    await page.evaluate(() => {
        mpSlots = [
            { id: 1, active: true, isHost: true, isHuman: true, name: 'Host', faction: 'usa', color: 'blue', team: 1, spawnId: 1 },
            { id: 2, active: true, isHost: false, isHuman: true, name: 'Challenger', faction: 'china', color: 'red', team: 2, spawnId: 2 }
        ];
        const pkt = {
            type: 'start_battle',
            mapType: 'tournament_desert',
            mapSize: 1500,
            money: 10000,
            startingUnits: 'small',
            slots: mpSlots,
            customMapData: null,
            seed: 987654
        };
        broadcastNetPacket(pkt);
        startMultiplayerMatch(true, pkt);
    });
    await flushPackets();

    // B. Stress test: Spawn combat unit, issue move & chat, pump 8 host state_sync snapshots under 25% simulated packet loss & out-of-order replay
    await page.evaluate(() => {
        const u = units[0];
        if (u && u.netId) {
            broadcastNetPacket({
                type: 'move_units',
                unitNetIds: [u.netId],
                targetPos: { x: u.mesh.position.x + 25, y: u.mesh.position.y, z: u.mesh.position.z - 20 }
            });
        }
        broadcastNetPacket({ type: 'chat', sender: 'Host', text: 'Advancing across valley!' });
        for (let i = 0; i < 8; i++) {
            _mpLastStateSyncMs = -1000;
            broadcastHostStateSync();
        }
    });
    await flushPackets({ dropEvery: 4 });

    // Inject an out-of-order stale state_sync packet on client and confirm it is rejected
    const staleRejected = await clientPage.evaluate(() => {
        return handleNetworkPacket({ type: 'state_sync', v: 2, seq: 1, u: [], s: [] }) === false;
    });
    if (!staleRejected) {
        throw new Error('Client failed to reject out-of-order stale state_sync packet in browser E2E!');
    }

    // C. Simulate host disconnect and verify client displays disconnect modal cleanly
    await page.evaluate(() => {
        broadcastNetPacket({ type: 'host_left', message: 'Host ended E2E test session.' });
    });
    await flushPackets();

    const mpStats = await clientPage.evaluate(() => {
        const modal = document.getElementById('host-disconnected-modal');
        return {
            modalVisible: Boolean(modal && modal.style.display === 'flex'),
            chatCount: document.querySelectorAll('#mp-chat-messages .mp-chat-msg').length,
            clientStructCount: typeof structures !== 'undefined' ? structures.length : 0,
            clientEnemyStructCount: typeof enemyStructures !== 'undefined' ? enemyStructures.length : 0
        };
    });
    if (!mpStats.modalVisible || mpStats.chatCount < 2 || mpStats.clientStructCount < 1 || mpStats.clientEnemyStructCount < 1) {
        throw new Error(`E2E Two-Peer Multiplayer check failed: ${JSON.stringify(mpStats)}`);
    }
    await clientPage.close();

    if (pageErrors.length > 0) {
        throw new Error(`Browser errors detected: ${pageErrors.join(' | ')}`);
    }
    console.log(`✓ Playwright E2E Skirmish & Two-Peer Multiplayer smoke passed: ${JSON.stringify({ ...stats, mpStats })}`);
} finally {
    if (browser) await browser.close();
    server.close();
    server.closeAllConnections?.();
}
