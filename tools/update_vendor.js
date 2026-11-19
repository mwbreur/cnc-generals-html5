/**
 * Downloads and verifies local vendor bundles (Three.js and PeerJS) into src/vendor/
 * so the game can run 100% off-grid without any external CDN access.
 *
 * Usage:
 *   node tools/update_vendor.js
 *   node tools/update_vendor.js --three=0.128.0 --peerjs=1.5.4
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const vendorDir = path.join(rootDir, 'src', 'vendor');

const args = process.argv.slice(2);
function getArg(name, fallback) {
    const prefix = `--${name}=`;
    const match = args.find(a => a.startsWith(prefix));
    return match ? match.slice(prefix.length).trim() : fallback;
}

const threeVersion = getArg('three', '0.128.0');
const peerjsVersion = getArg('peerjs', '1.5.4');

const TARGETS = [
    {
        name: 'three',
        version: threeVersion,
        filename: 'three.min.js',
        urls: [
            `https://cdn.jsdelivr.net/npm/three@${threeVersion}/build/three.min.js`,
            `https://cdnjs.cloudflare.com/ajax/libs/three.js/r${threeVersion.split('.')[1]}/three.min.js`
        ]
    },
    {
        name: 'peerjs',
        version: peerjsVersion,
        filename: 'peerjs.min.js',
        urls: [
            `https://cdn.jsdelivr.net/npm/peerjs@${peerjsVersion}/dist/peerjs.min.js`,
            `https://unpkg.com/peerjs@${peerjsVersion}/dist/peerjs.min.js`
        ]
    }
];

function downloadUrl(url, redirectCount = 0) {
    if (redirectCount > 5) return Promise.reject(new Error(`Too many redirects for ${url}`));
    return new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: 20000 }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const nextUrl = new URL(res.headers.location, url).toString();
                res.resume();
                return resolve(downloadUrl(nextUrl, redirectCount + 1));
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('timeout', () => { req.destroy(new Error(`Timeout downloading ${url}`)); });
        req.on('error', reject);
    });
}

async function fetchWithFallback(target) {
    let lastErr = null;
    for (const url of target.urls) {
        try {
            process.stdout.write(`Downloading ${target.name}@${target.version} from ${url} ... `);
            const buf = await downloadUrl(url);
            if (!buf || buf.length < 10000) {
                throw new Error(`Unexpectedly small payload (${buf ? buf.length : 0} bytes)`);
            }
            console.log(`OK (${(buf.length / 1024).toFixed(1)} KB)`);
            return { buf, url };
        } catch (err) {
            console.log(`FAILED (${err.message})`);
            lastErr = err;
        }
    }
    throw lastErr || new Error(`Failed to download ${target.name}`);
}

async function main() {
    fs.mkdirSync(vendorDir, { recursive: true });
    const manifest = {
        updatedAt: new Date().toISOString(),
        libraries: {}
    };

    for (const target of TARGETS) {
        const { buf, url } = await fetchWithFallback(target);
        const sri = 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
        const outPath = path.join(vendorDir, target.filename);
        fs.writeFileSync(outPath, buf);
        manifest.libraries[target.name] = {
            version: target.version,
            file: `src/vendor/${target.filename}`,
            bytes: buf.length,
            integrity: sri,
            sourceUrl: url
        };
        console.log(`  ✓ Saved ${path.relative(rootDir, outPath)} (${sri})`);
    }

    fs.writeFileSync(path.join(vendorDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    console.log('✓ Vendor bundles updated in src/vendor/. Run `npm run build` to rebuild index.html.');
}

main().catch((err) => {
    console.error('✗ Vendor update failed:', err.message);
    process.exit(1);
});
