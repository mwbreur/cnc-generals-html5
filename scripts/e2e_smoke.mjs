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
    const fullPath = path.join(rootDir, relPath);
    if (!fullPath.startsWith(rootDir) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
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
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.THREE && window.OFFICIAL_CAMEOS && window.OFFICIAL_SKIRMISH_MAPS && window.W3D_INFANTRY_DATA), { timeout: 20000 });

    const stats = await page.evaluate(() => ({
        cameoCount: Object.keys(window.OFFICIAL_CAMEOS || {}).length,
        mapCount: Object.keys(window.OFFICIAL_SKIRMISH_MAPS || {}).length,
        infantryCount: Object.keys(window.W3D_INFANTRY_DATA || {}).length,
        hasCanvas: Boolean(document.querySelector('canvas'))
    }));

    if (stats.cameoCount < 200 || stats.mapCount < 12 || stats.infantryCount < 10 || !stats.hasCanvas) {
        throw new Error(`E2E boot check failed: ${JSON.stringify(stats)}`);
    }
    if (pageErrors.length > 0) {
        throw new Error(`Uncaught page errors: ${pageErrors.join(' | ')}`);
    }
    console.log(`✓ Playwright E2E smoke passed: cameos=${stats.cameoCount}, maps=${stats.mapCount}, infantry=${stats.infantryCount}, canvas=${stats.hasCanvas}`);
} finally {
    if (browser) await browser.close();
    server.close();
}
