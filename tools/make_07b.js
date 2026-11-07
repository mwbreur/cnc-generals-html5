const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'js', '07_tournament_desert_data.json'), 'utf8'));

const jsCode = `/**
 * Official EA Command & Conquer: Generals Tournament Desert Map Data
 * Extracted directly from retail Maps.big (Tournament Desert.map & Tournament Desert.tga)
 */
window.TOURNAMENT_DESERT_DATA = ${JSON.stringify(data)};

function getTournamentDesertHeight(x, z) {
    if (!window.TOURNAMENT_DESERT_DATA || !window.TOURNAMENT_DESERT_DATA.grid) return 0;
    const grid = window.TOURNAMENT_DESERT_DATA.grid;
    const size = (typeof currentMapSize !== 'undefined' && currentMapSize) ? currentMapSize : 1500;
    const normX = (x + size * 0.5) / size;
    const normZ = (z + size * 0.5) / size;
    if (normX < 0 || normX > 1 || normZ < 0 || normZ > 1) return 0;
    const res = 65;
    const gx = normX * (res - 1);
    const gz = normZ * (res - 1);
    const x0 = Math.floor(gx), x1 = Math.min(res - 1, x0 + 1);
    const z0 = Math.floor(gz), z1 = Math.min(res - 1, z0 + 1);
    const fx = gx - x0, fz = gz - z0;
    const h00 = grid[z0][x0], h10 = grid[z0][x1];
    const h01 = grid[z1][x0], h11 = grid[z1][x1];
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    return h0 * (1 - fz) + h1 * fz;
}

function createTournamentDesertTexture() {
    if (window._tournamentDesertTexCache) return window._tournamentDesertTexCache;
    if (!window.TOURNAMENT_DESERT_DATA || !window.TOURNAMENT_DESERT_DATA.textureB64) {
        return typeof createTerrainTextureForMap === 'function' ? createTerrainTextureForMap('desert') : null;
    }
    try {
        const b64 = window.TOURNAMENT_DESERT_DATA.textureB64;
        const binaryStr = (typeof atob === 'function') ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryStr.charCodeAt(i);
        const tex = new THREE.DataTexture(bytes, 128, 128, THREE.RGBAFormat);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        window._tournamentDesertTexCache = tex;
        return tex;
    } catch (e) {
        console.warn('Failed to load Tournament Desert texture:', e);
        return null;
    }
}
`;

const outputPath = path.join(__dirname, '..', 'src', 'js', '07b_tournament_desert.js');
fs.writeFileSync(outputPath, jsCode, 'utf8');
console.log(`Successfully generated ${outputPath} (${(jsCode.length / 1024).toFixed(1)} KB)`);
