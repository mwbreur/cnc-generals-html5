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
    if (pageErrors.length > 0) {
        throw new Error(`Browser errors detected: ${pageErrors.join(' | ')}`);
    }
    console.log(`✓ Playwright E2E Skirmish smoke passed: ${JSON.stringify(stats)}`);
} finally {
    if (browser) await browser.close();
    server.close();
    server.closeAllConnections?.();
}
