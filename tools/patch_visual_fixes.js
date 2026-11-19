const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function readBigIndex(bigPath) {
    const map = new Map();
    if (!fs.existsSync(bigPath)) return map;
    const buf = fs.readFileSync(bigPath);
    const count = buf.readUInt32BE(8);
    let pos = 16;
    for (let i = 0; i < count; i++) {
        const off = buf.readUInt32BE(pos);
        const size = buf.readUInt32BE(pos + 4);
        pos += 8;
        let end = pos;
        while (end < buf.length && buf[end] !== 0) end++;
        const fullName = buf.toString('ascii', pos, end);
        pos = end + 1;
        const base = fullName.replace(/.*[\\\/]/, '').toLowerCase();
        if (!map.has(base)) {
            map.set(base, { bigPath, buf, off, size, fullName });
        }
    }
    return map;
}

const w3dZhBig = readBigIndex(path.join(root, 'generals_big_files', 'W3DZH.big'));
const w3dBig = readBigIndex(path.join(root, 'generals_big_files', 'W3D.big'));
const texZhBig = readBigIndex(path.join(root, 'generals_big_files', 'TexturesZH.big'));
const texBig = readBigIndex(path.join(root, 'generals_big_files', 'Textures.big'));

function getBigFileBuffer(fileName, indices) {
    const key = fileName.toLowerCase();
    for (const idx of indices) {
        const entry = idx.get(key);
        if (entry) return entry.buf.subarray(entry.off, entry.off + entry.size);
    }
    return null;
}

function decodeTextureBuffer(fileName, buf, maxDim = 128) {
    const ext = path.extname(fileName).toLowerCase();
    if (ext === '.tga') {
        const w = buf.readUInt16LE(12);
        const h = buf.readUInt16LE(14);
        const bpp = buf[16];
        const dataOffset = 18 + buf[0];
        const pixelCount = w * h;
        const rgba = Buffer.alloc(pixelCount * 4);
        if (bpp === 32) {
            for (let i = 0; i < pixelCount; i++) {
                const src = dataOffset + i * 4;
                rgba[i * 4 + 0] = buf[src + 2];
                rgba[i * 4 + 1] = buf[src + 1];
                rgba[i * 4 + 2] = buf[src + 0];
                rgba[i * 4 + 3] = buf[src + 3];
            }
        } else if (bpp === 24) {
            for (let i = 0; i < pixelCount; i++) {
                const src = dataOffset + i * 3;
                rgba[i * 4 + 0] = buf[src + 2];
                rgba[i * 4 + 1] = buf[src + 1];
                rgba[i * 4 + 2] = buf[src + 0];
                rgba[i * 4 + 3] = 255;
            }
        } else {
            throw new Error(`Unsupported TGA bpp=${bpp} for ${fileName}`);
        }
        return { t: 'raw', w, h, d: rgba.toString('base64') };
    }

    const width = buf.readUInt32LE(16);
    const height = buf.readUInt32LE(12);
    const fourCC = buf.toString('ascii', 84, 88).replace(/\0/g, '').trim();
    if (fourCC === 'DXT1' || fourCC === 'DXT5') {
        const isDxt5 = (fourCC === 'DXT5');
        const blockSize = isDxt5 ? 16 : 8;
        let curW = width, curH = height, curOffset = 128;
        while (curW > maxDim && curH > maxDim && curOffset < buf.length) {
            const blocks = Math.max(1, Math.floor(curW / 4)) * Math.max(1, Math.floor(curH / 4));
            curOffset += blocks * blockSize;
            curW = Math.floor(curW / 2);
            curH = Math.floor(curH / 2);
        }
        const targetBlocks = Math.max(1, Math.floor(curW / 4)) * Math.max(1, Math.floor(curH / 4));
        const targetSize = targetBlocks * blockSize;
        const slice = buf.subarray(curOffset, curOffset + targetSize);
        return { t: isDxt5 ? 'dxt5' : 'dxt1', w: curW, h: curH, d: slice.toString('base64') };
    }

    const bpp = buf.readUInt32LE(88);
    const pixelCount = width * height;
    const rgba = Buffer.alloc(pixelCount * 4);
    const dataStart = 128;
    if (bpp === 32) {
        for (let i = 0; i < pixelCount; i++) {
            const s = dataStart + i * 4;
            rgba[i * 4 + 0] = buf[s + 2];
            rgba[i * 4 + 1] = buf[s + 1];
            rgba[i * 4 + 2] = buf[s + 0];
            rgba[i * 4 + 3] = buf[s + 3];
        }
    } else if (bpp === 24) {
        for (let i = 0; i < pixelCount; i++) {
            const s = dataStart + i * 3;
            rgba[i * 4 + 0] = buf[s + 2];
            rgba[i * 4 + 1] = buf[s + 1];
            rgba[i * 4 + 2] = buf[s + 0];
            rgba[i * 4 + 3] = 255;
        }
    } else {
        throw new Error(`Unsupported DDS format fourCC="${fourCC}" bpp=${bpp} for ${fileName}`);
    }
    return { t: 'raw', w: width, h: height, d: rgba.toString('base64') };
}

function readChunks(buf, s, e) {
    const out = [];
    let cur = s;
    while (cur + 8 <= e) {
        const type = buf.readUInt32LE(cur);
        const raw = buf.readUInt32LE(cur + 4);
        const size = raw & 0x7fffffff;
        const hasSub = (raw & 0x80000000) !== 0;
        const dataStart = cur + 8;
        const dataEnd = Math.min(e, dataStart + size);
        out.push({ type, size, hasSub, s: dataStart, e: dataEnd });
        cur = dataEnd;
    }
    return out;
}

function quatToMat(qx, qy, qz, qw) {
    const xx = qx * qx, yy = qy * qy, zz = qz * qz;
    const xy = qx * qy, xz = qx * qz, yz = qy * qz;
    const wx = qw * qx, wy = qw * qy, wz = qw * qz;
    return [
        [1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy)],
        [2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx)],
        [2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy)]
    ];
}
function mulMat(A, B) {
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            for (let k = 0; k < 3; k++) C[i][j] += A[i][k] * B[k][j];
        }
    }
    return C;
}
function mulMatVec(A, v) {
    return [
        A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2],
        A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2],
        A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]
    ];
}

function toCompactQuat(qxW, qyW, qzW, qwW) {
    const len = Math.hypot(qxW, qyW, qzW, qwW) || 1;
    let qx = qyW / len;
    let qy = -qzW / len;
    let qz = -qxW / len;
    let qw = qwW / len;
    if (qw < 0) { qx = -qx; qy = -qy; qz = -qz; qw = -qw; }
    return [
        parseFloat(qx.toFixed(4)),
        parseFloat(qy.toFixed(4)),
        parseFloat(qz.toFixed(4)),
        parseFloat(qw.toFixed(4))
    ];
}

function isNonIdentityQuat(q) {
    return Math.abs(Math.abs(q[3]) - 1) > 0.005 || Math.hypot(q[0], q[1], q[2]) > 0.005;
}

/**
 * Raw W3D extractor preserving exact pivot quaternions q_three = (+qy, -qz, -qx, +qw)
 * and using caller-controlled mesh filtering (without legacy blacklists).
 */
function parseRawW3d(fileName, options = {}) {
    const {
        dropRe = null,
        includeQuats = true,
        fallbackTex = null,
        skipEnvTex = true
    } = options;
    const buf = getBigFileBuffer(fileName, [w3dZhBig, w3dBig]);
    if (!buf) throw new Error(`Missing W3D file: ${fileName}`);

    const pivots = [];
    const hlod = [];
    const meshes = {};

    for (const c of readChunks(buf, 0, buf.length)) {
        if (c.type === 0x100) {
            for (const sc of readChunks(buf, c.s, c.e)) {
                if (sc.type === 0x102) {
                    const count = Math.floor((sc.e - sc.s) / 60);
                    for (let i = 0; i < count; i++) {
                        const o = sc.s + i * 60;
                        let endStr = o;
                        while (endStr < o + 16 && buf[endStr] !== 0) endStr++;
                        const name = buf.toString('ascii', o, endStr).trim();
                        const parentIdx = buf.readInt32LE(o + 16);
                        const wx = buf.readFloatLE(o + 20);
                        const wy = buf.readFloatLE(o + 24);
                        const wz = buf.readFloatLE(o + 28);
                        const qxW = buf.readFloatLE(o + 44);
                        const qyW = buf.readFloatLE(o + 48);
                        const qzW = buf.readFloatLE(o + 52);
                        const qwW = buf.readFloatLE(o + 56);
                        const q3 = toCompactQuat(qxW, qyW, qzW, qwW);
                        const tx = parseFloat((-wy).toFixed(2));
                        const ty = parseFloat(wz.toFixed(2));
                        const tz = parseFloat(wx.toFixed(2));
                        if (includeQuats && isNonIdentityQuat(q3)) {
                            pivots.push([name, parentIdx, tx, ty, tz, q3[0], q3[1], q3[2], q3[3]]);
                        } else {
                            pivots.push([name, parentIdx, tx, ty, tz]);
                        }
                    }
                }
            }
        } else if (c.type === 0x700) {
            for (const hc of readChunks(buf, c.s, c.e)) {
                if (hc.type === 0x702) {
                    for (const ac of readChunks(buf, hc.s, hc.e)) {
                        if (ac.type === 0x704) {
                            const boneIndex = buf.readUInt32LE(ac.s);
                            let endStr = ac.s + 4;
                            while (endStr < ac.e && buf[endStr] !== 0) endStr++;
                            const name = buf.toString('ascii', ac.s + 4, endStr).trim().toLowerCase();
                            if (!dropRe || !dropRe.test(name)) {
                                hlod.push({ boneIndex, name });
                            }
                        }
                    }
                }
            }
        } else if (c.type === 0x00) {
            let meshName = '', containerName = '';
            let vertices = null, indices = null, uvs = null;
            const texNames = [], texIds = [];
            for (const sc of readChunks(buf, c.s, c.e)) {
                if (sc.type === 0x1f) {
                    let e1 = sc.s + 8; while (e1 < sc.s + 24 && buf[e1] !== 0) e1++;
                    meshName = buf.toString('ascii', sc.s + 8, e1).trim();
                    let e2 = sc.s + 24; while (e2 < sc.s + 40 && buf[e2] !== 0) e2++;
                    containerName = buf.toString('ascii', sc.s + 24, e2).trim();
                } else if (sc.type === 0x02) {
                    const vc = Math.floor((sc.e - sc.s) / 12);
                    vertices = [];
                    for (let i = 0; i < vc; i++) {
                        const wx = buf.readFloatLE(sc.s + i * 12 + 0);
                        const wy = buf.readFloatLE(sc.s + i * 12 + 4);
                        const wz = buf.readFloatLE(sc.s + i * 12 + 8);
                        vertices.push(parseFloat((-wy).toFixed(2)), parseFloat(wz.toFixed(2)), parseFloat(wx.toFixed(2)));
                    }
                } else if (sc.type === 0x20) {
                    const tc = Math.floor((sc.e - sc.s) / 32);
                    indices = [];
                    for (let i = 0; i < tc; i++) {
                        const v0 = buf.readUInt32LE(sc.s + i * 32 + 0);
                        const v1 = buf.readUInt32LE(sc.s + i * 32 + 4);
                        const v2 = buf.readUInt32LE(sc.s + i * 32 + 8);
                        indices.push(v0, v2, v1);
                    }
                } else if (sc.type === 0x30) {
                    for (const tc of readChunks(buf, sc.s, sc.e)) {
                        if (tc.type === 0x31) {
                            for (const tsc of readChunks(buf, tc.s, tc.e)) {
                                if (tsc.type === 0x32) {
                                    let et = tsc.s;
                                    while (et < tsc.e && buf[et] !== 0) et++;
                                    texNames.push(buf.toString('ascii', tsc.s, et).trim());
                                }
                            }
                        }
                    }
                } else if (sc.type === 0x38) {
                    for (const pc of readChunks(buf, sc.s, sc.e)) {
                        if (pc.type === 0x48) {
                            for (const stc of readChunks(buf, pc.s, pc.e)) {
                                if (stc.type === 0x4a) {
                                    const uvCount = Math.floor((stc.e - stc.s) / 8);
                                    uvs = [];
                                    for (let i = 0; i < uvCount; i++) {
                                        const u = buf.readFloatLE(stc.s + i * 8 + 0);
                                        const v = buf.readFloatLE(stc.s + i * 8 + 4);
                                        uvs.push(parseFloat(u.toFixed(3)), parseFloat((1.0 - v).toFixed(3)));
                                    }
                                } else if (stc.type === 0x49) {
                                    const cnt = Math.floor((stc.e - stc.s) / 4);
                                    for (let i = 0; i < cnt; i++) texIds.push(buf.readUInt32LE(stc.s + i * 4));
                                }
                            }
                        }
                    }
                }
            }
            const fullName = (containerName ? `${containerName}.${meshName}` : meshName).toLowerCase();
            if (dropRe && dropRe.test(fullName)) continue;
            if (!vertices || vertices.length === 0 || !indices || indices.length === 0) continue;

            if (texNames.length > 1 && texIds.length === indices.length / 3) {
                const usedIds = [...new Set(texIds)];
                for (const id of usedIds) {
                    const rawT = texNames[id];
                    let tName = rawT ? rawT.toLowerCase().replace('.tga', '.dds') : 'unknown';
                    if (skipEnvTex && /lakedusk|envmap|reflect/i.test(tName)) continue;
                    if (dropRe && dropRe.test(tName)) continue;
                    const subIndices = [];
                    for (let t = 0; t < texIds.length; t++) {
                        if (texIds[t] === id) {
                            subIndices.push(indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]);
                        }
                    }
                    const remap = new Map();
                    const subV = [];
                    const subU = uvs ? [] : null;
                    const finalI = [];
                    for (const oldIdx of subIndices) {
                        if (!remap.has(oldIdx)) {
                            remap.set(oldIdx, subV.length / 3);
                            subV.push(vertices[oldIdx * 3], vertices[oldIdx * 3 + 1], vertices[oldIdx * 3 + 2]);
                            if (uvs) subU.push(uvs[oldIdx * 2], uvs[oldIdx * 2 + 1]);
                        }
                        finalI.push(remap.get(oldIdx));
                    }
                    if (subV.length > 0 && finalI.length > 0) {
                        const subMeshName = `${fullName}__tex_${path.basename(tName, '.dds')}`;
                        meshes[subMeshName] = { v: subV, i: finalI, u: subU, tex: tName };
                    }
                }
            } else {
                let chosenTex = texNames[0];
                const nonEnv = texNames.filter(t => !/lakedusk|clouds|env_|_env/i.test(t));
                if (nonEnv.length > 0) chosenTex = nonEnv[0];
                let tName = chosenTex ? chosenTex.toLowerCase().replace('.tga', '.dds') : null;
                if (tName && /lakedusk|envmap|reflect/i.test(tName)) tName = fallbackTex || tName;
                if (dropRe && tName && dropRe.test(tName)) continue;
                meshes[fullName] = { v: vertices, i: indices, u: uvs, tex: tName };
            }
        }
    }

    const hOut = [];
    for (const h of hlod) {
        const matches = Object.keys(meshes).filter(m => m === h.name || m.startsWith(h.name + '__tex_'));
        for (const m of matches) hOut.push([h.boneIndex, m]);
    }
    return { pivots, h: hOut, meshes };
}

function computeWorldPose(pivots) {
    const worldR = [];
    const worldT = [];
    for (let i = 0; i < pivots.length; i++) {
        const p = pivots[i];
        const par = p[1];
        const t = [p[2], p[3], p[4]];
        const q = p.length >= 9 ? [p[5], p[6], p[7], p[8]] : [0, 0, 0, 1];
        const R = quatToMat(q[0], q[1], q[2], q[3]);
        if (par >= 0 && worldR[par]) {
            const rt = mulMatVec(worldR[par], t);
            worldT[i] = [worldT[par][0] + rt[0], worldT[par][1] + rt[1], worldT[par][2] + rt[2]];
            worldR[i] = mulMat(worldR[par], R);
        } else {
            worldT[i] = t;
            worldR[i] = R;
        }
    }
    return { worldR, worldT };
}

function getMeshWorldBBox(pivots, h, meshes, filterRe) {
    const { worldR, worldT } = computeWorldPose(pivots);
    let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (const [bi, mn] of h) {
        if (filterRe && !filterRe.test(mn)) continue;
        const m = meshes[mn];
        if (!m) continue;
        const R = worldR[bi] || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        const T = worldT[bi] || [0, 0, 0];
        for (let k = 0; k < m.v.length; k += 3) {
            const rv = mulMatVec(R, [m.v[k], m.v[k + 1], m.v[k + 2]]);
            const w = [rv[0] + T[0], rv[1] + T[1], rv[2] + T[2]];
            for (let a = 0; a < 3; a++) {
                if (w[a] < min[a]) min[a] = w[a];
                if (w[a] > max[a]) max[a] = w[a];
            }
        }
    }
    return { min, max };
}

function patchFlagPivotsFromW3D(w3dFile, buildingObj) {
    const raw = parseRawW3d(w3dFile, { includeQuats: true });
    const srcByName = new Map(raw.pivots.map(p => [p[0].toUpperCase(), p]));
    let patched = 0;
    for (let i = 0; i < buildingObj.p.length; i++) {
        const pname = buildingObj.p[i][0].toUpperCase();
        if (!/^HOUSECOLOR0[2-6]$/.test(pname)) continue;
        const sp = srcByName.get(pname);
        if (sp && sp.length >= 9) {
            buildingObj.p[i] = [buildingObj.p[i][0], buildingObj.p[i][1], buildingObj.p[i][2], buildingObj.p[i][3], buildingObj.p[i][4], sp[5], sp[6], sp[7], sp[8]];
            patched++;
        }
    }
    return patched;
}

// 1. Load existing 02b_w3d_models.js cleanly
const w3dPath = path.join(root, 'src', 'js', '02b_w3d_models.js');
const lines = fs.readFileSync(w3dPath, 'utf8').split(/\r?\n/);
const headerCode = lines.slice(0, 11).join('\n');
const sb = { window: {} };
vm.runInNewContext(headerCode, sb);

const W3D_VEHICLE_DATA = sb.window.W3D_VEHICLE_DATA;
const W3D_BUILDING_DATA = sb.window.W3D_BUILDING_DATA;
const W3D_INFANTRY_DATA = sb.window.W3D_INFANTRY_DATA;
const W3D_TEXTURE_DATA = sb.window.W3D_TEXTURE_DATA;

// 2. Patch usa_commandCenter_radar (ABBtCmdHQ_AC.W3D)
const radarParsed = parseRawW3d('ABBtCmdHQ_AC.W3D', {
    dropRe: null,
    includeQuats: true,
    fallbackTex: 'atscaffold02.dds'
});
W3D_BUILDING_DATA['usa_commandCenter_radar'] = {
    f: 'usa',
    s: 0.27,
    p: radarParsed.pivots,
    h: radarParsed.h,
    m: radarParsed.meshes
};
const radarBBox = getMeshWorldBBox(radarParsed.pivots, radarParsed.h, radarParsed.meshes, /radardish/i);
console.log('usa_commandCenter_radar meshes:', Object.keys(radarParsed.meshes).length, 'RADARDISH Y=', [radarBBox.min[1].toFixed(1), radarBBox.max[1].toFixed(1)]);

// 3. Patch paladin (avPaladin.W3D) keeping LASER & HOUSECOLOR01/02/03 + exact q_three pivots
const palParsed = parseRawW3d('avPaladin.W3D', {
    dropRe: /turretfx\d*|headlight|lightbeam|firepoint|smoke\d*|treadfx\d*|turretms\d*/i,
    includeQuats: true,
    fallbackTex: 'avpaladin.dds'
});
W3D_VEHICLE_DATA['paladin'] = {
    f: 'usa',
    s: 0.32,
    p: palParsed.pivots,
    h: palParsed.h,
    m: palParsed.meshes
};
const palMzl = getMeshWorldBBox(palParsed.pivots, palParsed.h, palParsed.meshes, /housecolor02/i);
const palHc1 = getMeshWorldBBox(palParsed.pivots, palParsed.h, palParsed.meshes, /housecolor01/i);
const palLas = getMeshWorldBBox(palParsed.pivots, palParsed.h, palParsed.meshes, /laser/i);
const palChs = getMeshWorldBBox(palParsed.pivots, palParsed.h, palParsed.meshes, /chassis/i);
console.log('paladin verified bboxes:', {
    housecolor02_Z: [palMzl.min[2].toFixed(1), palMzl.max[2].toFixed(1)],
    housecolor01_Y: [palHc1.min[1].toFixed(1), palHc1.max[1].toFixed(1)],
    laser_Y: [palLas.min[1].toFixed(1), palLas.max[1].toFixed(1)],
    chassis_Y: [palChs.min[1].toFixed(1), palChs.max[1].toFixed(1)]
});

// 4. Patch drone_battle (avbattledr.W3D): bake rest-pose worldR into vertices so CHASSIS is 100% upright vertically & identity pivots
const bdRaw = parseRawW3d('avbattledr.W3D', {
    dropRe: /turretfx\d*|smoke\d*|muzzle\d*/i,
    includeQuats: true,
    fallbackTex: 'avbattledr.dds'
});
const { worldR: bdWorldR, worldT: bdWorldT } = computeWorldPose(bdRaw.pivots);
const bdIdxByName = new Map(bdRaw.pivots.map((p, idx) => [p[0].toUpperCase(), idx]));
const iCh = bdIdxByName.get('CHASSIS');
const iH1 = bdIdxByName.get('HOUSECOLOR01');
const iFan = bdIdxByName.get('FAN');
const iTur = bdIdxByName.get('TURRET01');
const iEl = bdIdxByName.get('TURRETEL01');
const iH2 = bdIdxByName.get('HOUSECOLOR02');

const bdPivotsClean = [
    ['ROOTTRANSFORM', -1, 0, 0, 0],
    ['CHASSIS', 0, bdWorldT[iCh][0], bdWorldT[iCh][1], bdWorldT[iCh][2]],
    ['HOUSECOLOR01', 1, parseFloat((bdWorldT[iH1][0] - bdWorldT[iCh][0]).toFixed(2)), parseFloat((bdWorldT[iH1][1] - bdWorldT[iCh][1]).toFixed(2)), parseFloat((bdWorldT[iH1][2] - bdWorldT[iCh][2]).toFixed(2))],
    ['FAN', 2, parseFloat((bdWorldT[iFan][0] - bdWorldT[iH1][0]).toFixed(2)), parseFloat((bdWorldT[iFan][1] - bdWorldT[iH1][1]).toFixed(2)), parseFloat((bdWorldT[iFan][2] - bdWorldT[iH1][2]).toFixed(2))],
    ['TURRET01', 1, parseFloat((bdWorldT[iTur][0] - bdWorldT[iCh][0]).toFixed(2)), parseFloat((bdWorldT[iTur][1] - bdWorldT[iCh][1]).toFixed(2)), parseFloat((bdWorldT[iTur][2] - bdWorldT[iCh][2]).toFixed(2))],
    ['TURRETEL01', 4, parseFloat((bdWorldT[iEl][0] - bdWorldT[iTur][0]).toFixed(2)), parseFloat((bdWorldT[iEl][1] - bdWorldT[iTur][1]).toFixed(2)), parseFloat((bdWorldT[iEl][2] - bdWorldT[iTur][2]).toFixed(2))],
    ['HOUSECOLOR02', 5, parseFloat((bdWorldT[iH2][0] - bdWorldT[iEl][0]).toFixed(2)), parseFloat((bdWorldT[iH2][1] - bdWorldT[iEl][1]).toFixed(2)), parseFloat((bdWorldT[iH2][2] - bdWorldT[iEl][2]).toFixed(2))]
];
const cleanIdxMap = new Map([[iCh, 1], [iH1, 2], [iFan, 3], [iTur, 4], [iEl, 5], [iH2, 6]]);
const bdMeshesClean = {};
const bdHClean = [];
for (const [oldBi, mName] of bdRaw.h) {
    const newBi = cleanIdxMap.get(oldBi);
    if (newBi === undefined) continue;
    const m = bdRaw.meshes[mName];
    if (!m) continue;
    const R = bdWorldR[oldBi];
    const rotV = [];
    for (let k = 0; k < m.v.length; k += 3) {
        const rv = mulMatVec(R, [m.v[k], m.v[k + 1], m.v[k + 2]]);
        rotV.push(parseFloat(rv[0].toFixed(2)), parseFloat(rv[1].toFixed(2)), parseFloat(rv[2].toFixed(2)));
    }
    bdMeshesClean[mName] = { v: rotV, i: m.i, u: m.u, tex: m.tex };
    bdHClean.push([newBi, mName]);
}
W3D_VEHICLE_DATA['drone_battle'] = {
    f: 'usa',
    s: 0.20,
    p: bdPivotsClean,
    h: bdHClean,
    m: bdMeshesClean
};
const bdChBBox = getMeshWorldBBox(bdPivotsClean, bdHClean, bdMeshesClean, /chassis/i);
const bdFanBBox = getMeshWorldBBox(bdPivotsClean, bdHClean, bdMeshesClean, /fan/i);
const bdGunBBox = getMeshWorldBBox(bdPivotsClean, bdHClean, bdMeshesClean, /turretel01/i);
console.log('drone_battle verified upright bboxes:', {
    chassis_Y: [bdChBBox.min[1].toFixed(1), bdChBBox.max[1].toFixed(1)],
    chassis_X: [bdChBBox.min[0].toFixed(1), bdChBBox.max[0].toFixed(1)],
    fan_Y: [bdFanBBox.min[1].toFixed(1), bdFanBBox.max[1].toFixed(1)],
    gun_Z: [bdGunBBox.min[2].toFixed(1), bdGunBBox.max[2].toFixed(1)]
});

// 5. Patch usa_power_upgrade (ABPWRPLANT_A1.W3D) & usa_power CYLINDER01/02 quaternions
const pwrUpgParsed = parseRawW3d('ABPWRPLANT_A1.W3D', { includeQuats: true });
W3D_BUILDING_DATA['usa_power_upgrade'] = {
    f: 'usa',
    s: 0.26,
    p: pwrUpgParsed.pivots,
    h: pwrUpgParsed.h,
    m: pwrUpgParsed.meshes
};
const pwrLineBB = getMeshWorldBBox(pwrUpgParsed.pivots, pwrUpgParsed.h, pwrUpgParsed.meshes, /line01/i);
const pwrGlowBB = getMeshWorldBBox(pwrUpgParsed.pivots, pwrUpgParsed.h, pwrUpgParsed.meshes, /power glow01/i);
console.log('usa_power_upgrade bboxes:', {
    line01_Y: [pwrLineBB.min[1].toFixed(1), pwrLineBB.max[1].toFixed(1)],
    glow_Y: [pwrGlowBB.min[1].toFixed(1), pwrGlowBB.max[1].toFixed(1)]
});

const pwrBaseRaw = parseRawW3d('ABPWRPLANT.W3D', { includeQuats: true });
const pwrBasePivByName = new Map(pwrBaseRaw.pivots.map(p => [p[0].toUpperCase(), p]));
if (W3D_BUILDING_DATA['usa_power']) {
    for (let i = 0; i < W3D_BUILDING_DATA['usa_power'].p.length; i++) {
        const pn = W3D_BUILDING_DATA['usa_power'].p[i][0].toUpperCase();
        if (pn === 'CYLINDER01' || pn === 'CYLINDER02') {
            const sp = pwrBasePivByName.get(pn);
            if (sp && sp.length >= 9) {
                const cur = W3D_BUILDING_DATA['usa_power'].p[i];
                W3D_BUILDING_DATA['usa_power'].p[i] = [cur[0], cur[1], cur[2], cur[3], cur[4], sp[5], sp[6], sp[7], sp[8]];
            }
        }
    }
    console.log('usa_power CYLINDER01/02 quaternions patched.');
}

// 6. Patch flagpole quaternions on all retail flag-bearing buildings
const flagPatchTargets = [
    ['usa_commandCenter', 'ABBtCmdHQ.W3D'],
    ['usa_barracks', 'ABBARRACKS.W3D'],
    ['china_commandCenter', 'NBConYard.W3D'],
    ['gla_commandCenter', 'UBCmdHQ.W3D'],
    ['civilian_bunker_g', 'CBBunker01_G.W3D'],
    ['civilian_house1_g', 'CBMogdis01_G.W3D'],
    ['civilian_house2_g', 'CBMogdis02_g.W3D'],
    ['civilian_hangar_g', 'CBTHanger1_g.W3D'],
    ['civilian_desert_house_g', 'CBTHouse01_G.W3D'],
    ['civilian_chalet_g', 'CBChalet_G.W3D'],
    ['civilian_soviet_g', 'CBSovBldg_G.W3D'],
    ['civilian_cottage_g', 'CBGCtage01_G.w3d'],
    ['civilian_euro_g', 'CBEuroCnd_g.W3D']
];
for (const [bKey, w3dFile] of flagPatchTargets) {
    if (!W3D_BUILDING_DATA[bKey]) throw new Error(`Missing W3D_BUILDING_DATA.${bKey}`);
    const cnt = patchFlagPivotsFromW3D(w3dFile, W3D_BUILDING_DATA[bKey]);
    console.log(`Flag pivots patched on ${bKey} (${w3dFile}): ${cnt}`);
}

// 7. Patch supply_drop_crate (PMUNCrate03.W3D)
const crateParsed = parseRawW3d('PMUNCrate03.W3D', {
    dropRe: null,
    includeQuats: true,
    fallbackTex: 'pmuncrateblue.dds'
});
W3D_BUILDING_DATA['supply_drop_crate'] = {
    f: 'usa',
    s: 0.11,
    p: crateParsed.pivots,
    h: crateParsed.h,
    m: crateParsed.meshes
};
console.log('supply_drop_crate meshes:', Object.keys(crateParsed.meshes).length);

// 8. Ensure all required textures exist in W3D_TEXTURE_DATA
function ensureTexture(key, fileName, maxDim = 128) {
    const cleanKey = key.toLowerCase();
    const cleanFile = path.basename(fileName).toLowerCase();
    const base = path.basename(cleanFile, path.extname(cleanFile));
    const tryOrder = cleanFile.endsWith('.tga')
        ? [cleanFile, base + '.tga', base + '.dds']
        : [cleanFile, base + '.dds', base + '.tga'];
    for (const candidate of tryOrder) {
        const buf = getBigFileBuffer(candidate, [texZhBig, texBig]);
        if (buf) {
            const decoded = decodeTextureBuffer(candidate, buf, maxDim);
            W3D_TEXTURE_DATA[base] = decoded;
            W3D_TEXTURE_DATA[cleanKey] = decoded;
            return true;
        }
    }
    return false;
}

const requiredTextures = [
    ['atscaffold02', 'atscaffold02.dds', 128],
    ['atsatellite02', 'atsatellite02.dds', 128],
    ['atconvey01', 'atconvey01.dds', 128],
    ['atcemwall01', 'atcemwall01.dds', 128],
    ['atgradient', 'atgradient.dds', 128],
    ['avpaladin', 'avpaladin.dds', 128],
    ['paladin', 'avpaladin.dds', 128],
    ['housecolor2', 'housecolor2.dds', 128],
    ['nvtreads', 'nvtreads.dds', 128],
    ['avbattledr', 'avbattledr.dds', 128],
    ['drone_battle', 'avbattledr.dds', 128],
    ['avconstdoz', 'avconstdoz.dds', 128],
    ['dozer', 'avconstdoz.dds', 128],
    ['abpwrplant', 'abpwrplant.dds', 128],
    ['atpwrglow', 'atpwrglow.dds', 128],
    ['pmuncrateblue', 'pmuncrateblue.dds', 128],
    ['pmredlight', 'pmredlight.dds', 128],
    ['parachute', 'parachute.dds', 128]
];
for (const [k, f, dim] of requiredTextures) {
    if (!ensureTexture(k, f, dim)) {
        throw new Error(`Missing required texture ${f} for key ${k}`);
    }
}

// Sweep any remaining referenced mesh textures across all dictionaries
const getTexKeys = () => new Set(Object.keys(W3D_TEXTURE_DATA).map(k => k.toLowerCase()));
let curTexKeys = getTexKeys();
for (const [dictName, dict] of [['W3D_VEHICLE_DATA', W3D_VEHICLE_DATA], ['W3D_BUILDING_DATA', W3D_BUILDING_DATA], ['W3D_INFANTRY_DATA', W3D_INFANTRY_DATA]]) {
    for (const [k, obj] of Object.entries(dict)) {
        for (const [mn, m] of Object.entries(obj.m || {})) {
            if (!m.tex || m.tex === 'unknown') continue;
            const base = m.tex.toLowerCase().replace(/\.(dds|tga)$/, '');
            if (!curTexKeys.has(base)) {
                if (!ensureTexture(base, m.tex, 128)) {
                    throw new Error(`Missing texture ${m.tex} referenced by ${dictName}.${k}.${mn}`);
                }
                curTexKeys = getTexKeys();
                console.log('Auto-extracted missing texture:', m.tex);
            }
        }
    }
}

// Verify 0 zero-vertex meshes and 0 missing textures
for (const [label, dict] of [['W3D_VEHICLE_DATA', W3D_VEHICLE_DATA], ['W3D_BUILDING_DATA', W3D_BUILDING_DATA], ['W3D_INFANTRY_DATA', W3D_INFANTRY_DATA]]) {
    for (const [k, obj] of Object.entries(dict)) {
        const entries = Object.entries(obj.m || {});
        if (entries.length === 0) throw new Error(`Empty meshes in ${label}.${k}`);
        for (const [mn, m] of entries) {
            if (!m.v || m.v.length === 0 || !m.i || m.i.length === 0) {
                throw new Error(`Zero-vertex mesh in ${label}.${k}.${mn}`);
            }
            if (m.tex && m.tex !== 'unknown') {
                const base = m.tex.toLowerCase().replace(/\.(dds|tga)$/, '');
                if (!curTexKeys.has(base)) {
                    throw new Error(`Missing texture ${m.tex} in ${label}.${k}.${mn}`);
                }
            }
        }
    }
}

lines[6] = 'window.W3D_VEHICLE_DATA = ' + JSON.stringify(W3D_VEHICLE_DATA) + ';';
lines[7] = 'window.W3D_BUILDING_DATA = ' + JSON.stringify(W3D_BUILDING_DATA) + ';';
lines[8] = 'window.W3D_INFANTRY_DATA = ' + JSON.stringify(W3D_INFANTRY_DATA) + ';';
lines[9] = 'window.W3D_TEXTURE_DATA = ' + JSON.stringify(W3D_TEXTURE_DATA) + ';';
fs.writeFileSync(w3dPath, lines.join('\n'), 'utf8');

console.log(
    'SUCCESS: Patched 02b_w3d_models.js cleanly! Verified 0 zero-vertex meshes and 0 missing textures across',
    Object.keys(W3D_VEHICLE_DATA).length, 'vehicles,',
    Object.keys(W3D_BUILDING_DATA).length, 'buildings,',
    Object.keys(W3D_INFANTRY_DATA).length, 'infantry, and',
    curTexKeys.size, 'textures.'
);
