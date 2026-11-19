const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { parseW3dModel } = require('./parse_w3d_clean');

const root = path.resolve(__dirname, '..');
const scratchTmp = path.join(root, 'assets', '_tmp_w3d_patch');
fs.mkdirSync(scratchTmp, { recursive: true });

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

const w3dBig = readBigIndex(path.join(root, 'generals_big_files', 'W3D.big'));
const w3dZhBig = readBigIndex(path.join(root, 'generals_big_files', 'W3DZH.big'));
const texBig = readBigIndex(path.join(root, 'generals_big_files', 'Textures.big'));
const texZhBig = readBigIndex(path.join(root, 'generals_big_files', 'TexturesZH.big'));

function getBigFileBuffer(fileName, indices) {
    const key = fileName.toLowerCase();
    for (const idx of indices) {
        const entry = idx.get(key);
        if (entry) return entry.buf.subarray(entry.off, entry.off + entry.size);
    }
    return null;
}

function findAnimInBig(prefix, patterns, indices) {
    const pLower = prefix.toLowerCase();
    for (const pat of patterns) {
        for (const idx of indices) {
            for (const [k] of idx.entries()) {
                if (k.startsWith(pLower) && pat.test(k)) return k;
            }
        }
    }
    return null;
}

function decodeTextureBuffer(fileName, buf) {
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
        while (curW > 128 && curH > 128 && curOffset < buf.length) {
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

function mat4Compose(pos, q) {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const te = new Float32Array(16);
    te[0] = 1 - (yy + zz); te[1] = xy + wz; te[2] = xz - wy; te[3] = 0;
    te[4] = xy - wz; te[5] = 1 - (xx + zz); te[6] = yz + wx; te[7] = 0;
    te[8] = xz + wy; te[9] = yz - wx; te[10] = 1 - (xx + yy); te[11] = 0;
    te[12] = pos[0]; te[13] = pos[1]; te[14] = pos[2]; te[15] = 1;
    return te;
}

function mat4Mul(a, b) {
    const out = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
        const ai0 = a[i], ai1 = a[i + 4], ai2 = a[i + 8], ai3 = a[i + 12];
        out[i] = ai0 * b[0] + ai1 * b[1] + ai2 * b[2] + ai3 * b[3];
        out[i + 4] = ai0 * b[4] + ai1 * b[5] + ai2 * b[6] + ai3 * b[7];
        out[i + 8] = ai0 * b[8] + ai1 * b[9] + ai2 * b[10] + ai3 * b[11];
        out[i + 12] = ai0 * b[12] + ai1 * b[13] + ai2 * b[14] + ai3 * b[15];
    }
    return out;
}

const AXIS_SWAP = new Float32Array([1,0,0,0, 0,0,1,0, 0,1,0,0, 0,0,0,1]);

function transformPoint(m, p) {
    const x = p[0], y = p[1], z = p[2];
    return [m[0]*x + m[4]*y + m[8]*z + m[12], m[1]*x + m[5]*y + m[9]*z + m[13], m[2]*x + m[6]*y + m[10]*z + m[14]];
}

function loadSkeletonBuf(buf) {
    const sklPivots = [];
    let off = 0;
    while (off < buf.length) {
        const type = buf.readUInt32LE(off);
        const size = buf.readUInt32LE(off + 4) & 0x7fffffff;
        if (type === 0x100) {
            let sub = off + 8, pivotCount = 0;
            while (sub < off + 8 + size) {
                const st = buf.readUInt32LE(sub);
                const ss = buf.readUInt32LE(sub + 4) & 0x7fffffff;
                if (st === 0x101) {
                    pivotCount = buf.readUInt32LE(sub + 28);
                } else if (st === 0x102) {
                    let po = sub + 8;
                    for (let i = 0; i < pivotCount; i++) {
                        const ne = buf.indexOf(0, po);
                        const pName = buf.toString('ascii', po, Math.min(ne > po ? ne : po + 16, po + 16)).trim();
                        const parentIndex = buf.readInt32LE(po + 16);
                        const tx = buf.readFloatLE(po + 20), ty = buf.readFloatLE(po + 24), tz = buf.readFloatLE(po + 28);
                        const qx = buf.readFloatLE(po + 44), qy = buf.readFloatLE(po + 48), qz = buf.readFloatLE(po + 52), qw = buf.readFloatLE(po + 56);
                        const rawM = mat4Compose([tx, ty, tz], [qx, qy, qz, qw]);
                        const localThree = mat4Mul(mat4Mul(AXIS_SWAP, rawM), AXIS_SWAP);
                        sklPivots.push({ name: pName, parentIndex, localThree });
                        po += 60;
                    }
                }
                sub += 8 + ss;
            }
        }
        off += 8 + size;
    }
    return sklPivots;
}

function getAnimNumFramesBuf(animBuf) {
    if (!animBuf) return 1;
    let aoff = 0;
    while (aoff < animBuf.length) {
        const atype = animBuf.readUInt32LE(aoff);
        const asize = animBuf.readUInt32LE(aoff + 4) & 0x7fffffff;
        if (atype === 0x200) {
            let asub = aoff + 8;
            while (asub < aoff + 8 + asize) {
                const ast = animBuf.readUInt32LE(asub);
                const ass = animBuf.readUInt32LE(asub + 4) & 0x7fffffff;
                if (ast === 0x201) return animBuf.readUInt32LE(asub + 8 + 36);
                asub += 8 + ass;
            }
        }
        aoff += 8 + asize;
    }
    return 1;
}

function getBonesForAnimFrameBuf(basePivots, animBuf, frame) {
    const pivots = basePivots.map(p => ({ name: p.name, parentIndex: p.parentIndex, localThree: new Float32Array(p.localThree), worldMat: null }));
    if (animBuf) {
        let aoff = 0;
        const pivotDeltas = {};
        while (aoff < animBuf.length) {
            const atype = animBuf.readUInt32LE(aoff);
            const asize = animBuf.readUInt32LE(aoff + 4) & 0x7fffffff;
            if (atype === 0x200) {
                let asub = aoff + 8;
                while (asub < aoff + 8 + asize) {
                    const ast = animBuf.readUInt32LE(asub);
                    const ass = animBuf.readUInt32LE(asub + 4) & 0x7fffffff;
                    if (ast === 0x202) {
                        const firstFrame = animBuf.readUInt16LE(asub + 8);
                        const lastFrame = animBuf.readUInt16LE(asub + 10);
                        const channelType = animBuf.readUInt16LE(asub + 14);
                        const pivotIndex = animBuf.readUInt16LE(asub + 16);
                        if (!pivotDeltas[pivotIndex]) pivotDeltas[pivotIndex] = { t: [0,0,0], q: [0,0,0,1] };
                        const frameIdx = Math.max(0, Math.min(frame - firstFrame, lastFrame - firstFrame));
                        if (channelType === 0) pivotDeltas[pivotIndex].t[0] = animBuf.readFloatLE(asub + 20 + frameIdx * 4);
                        else if (channelType === 1) pivotDeltas[pivotIndex].t[1] = animBuf.readFloatLE(asub + 20 + frameIdx * 4);
                        else if (channelType === 2) pivotDeltas[pivotIndex].t[2] = animBuf.readFloatLE(asub + 20 + frameIdx * 4);
                        else if (channelType === 6) {
                            const vOff = asub + 20 + frameIdx * 16;
                            pivotDeltas[pivotIndex].q = [
                                animBuf.readFloatLE(vOff + 0), animBuf.readFloatLE(vOff + 4),
                                animBuf.readFloatLE(vOff + 8), animBuf.readFloatLE(vOff + 12)
                            ];
                        }
                    }
                    asub += 8 + ass;
                }
            }
            aoff += 8 + asize;
        }
        for (const [piStr, delta] of Object.entries(pivotDeltas)) {
            const pi = parseInt(piStr, 10);
            if (pi < pivots.length) {
                const rawDelta = mat4Compose(delta.t, delta.q);
                const deltaThree = mat4Mul(mat4Mul(AXIS_SWAP, rawDelta), AXIS_SWAP);
                pivots[pi].localThree = mat4Mul(pivots[pi].localThree, deltaThree);
            }
        }
    }
    for (let i = 0; i < pivots.length; i++) {
        const p = pivots[i];
        p.worldMat = (p.parentIndex === -1 || p.parentIndex >= i) ? p.localThree : mat4Mul(pivots[p.parentIndex].worldMat, p.localThree);
    }
    return pivots;
}

function bakeSkinnedInfantryFromBig(cfg) {
    const sklBuf = getBigFileBuffer(cfg.skl, [w3dBig, w3dZhBig]);
    const buf = getBigFileBuffer(cfg.skn, [w3dBig, w3dZhBig]);
    if (!sklBuf || !buf) throw new Error(`Missing SKL or SKN for ${cfg.key}`);
    const basePivots = loadSkeletonBuf(sklBuf);
    const staBuf = cfg.sta ? getBigFileBuffer(cfg.sta, [w3dBig, w3dZhBig]) : null;
    const rnaBuf = cfg.rna ? getBigFileBuffer(cfg.rna, [w3dBig, w3dZhBig]) : null;
    const standBones = getBonesForAnimFrameBuf(basePivots, staBuf, 0);

    let off = 0;
    const rawMeshes = {};
    while (off < buf.length) {
        const type = buf.readUInt32LE(off);
        const size = buf.readUInt32LE(off + 4) & 0x7fffffff;
        if (type === 0) {
            let sub = off + 8;
            let meshName = '';
            const vArr = [], infArr = [], triArr = [], uvArr = [];
            let meshTex = null;
            while (sub < off + 8 + size) {
                const st = buf.readUInt32LE(sub);
                const ss = buf.readUInt32LE(sub + 4) & 0x7fffffff;
                if (st === 0x1f) {
                    let endMesh = sub + 8 + 8;
                    while (endMesh < sub + 8 + 24 && buf[endMesh] !== 0) endMesh++;
                    meshName = buf.toString('ascii', sub + 8 + 8, endMesh).trim();
                } else if (st === 0x02) {
                    const count = Math.floor(ss / 12);
                    for (let i = 0; i < count; i++) {
                        vArr.push([buf.readFloatLE(sub + 8 + i*12), buf.readFloatLE(sub + 8 + i*12 + 8), buf.readFloatLE(sub + 8 + i*12 + 4)]);
                    }
                } else if (st === 0x0e) {
                    const count = Math.floor(ss / 8);
                    for (let i = 0; i < count; i++) infArr.push(buf.readUInt16LE(sub + 8 + i*8));
                } else if (st === 0x20) {
                    const count = Math.floor(ss / 32);
                    for (let i = 0; i < count; i++) {
                        triArr.push(buf.readUInt32LE(sub + 8 + i*32), buf.readUInt32LE(sub + 8 + i*32 + 8), buf.readUInt32LE(sub + 8 + i*32 + 4));
                    }
                } else if (st === 0x30) {
                    let tSub = sub + 8;
                    while (tSub < sub + 8 + ss) {
                        const tst = buf.readUInt32LE(tSub);
                        const tss = buf.readUInt32LE(tSub + 4) & 0x7fffffff;
                        if (tst === 0x31) {
                            let texSub = tSub + 8;
                            while (texSub < tSub + 8 + tss) {
                                const tt = buf.readUInt32LE(texSub);
                                const ts = buf.readUInt32LE(texSub + 4) & 0x7fffffff;
                                if (tt === 0x32) {
                                    meshTex = buf.subarray(texSub + 8, texSub + 8 + ts).toString('ascii').replace(/\0/g, '').trim().toLowerCase();
                                    break;
                                }
                                texSub += 8 + ts;
                            }
                        }
                        tSub += 8 + tss;
                    }
                } else if (st === 0x38) {
                    let pSub = sub + 8;
                    while (pSub < sub + 8 + ss) {
                        const pst = buf.readUInt32LE(pSub);
                        const pss = buf.readUInt32LE(pSub + 4) & 0x7fffffff;
                        if (pst === 0x48) {
                            let sSub = pSub + 8;
                            while (sSub < pSub + 8 + pss) {
                                const sst = buf.readUInt32LE(sSub);
                                const sss = buf.readUInt32LE(sSub + 4) & 0x7fffffff;
                                if (sst === 0x4a) {
                                    const count = Math.floor(sss / 8);
                                    for (let i = 0; i < count; i++) {
                                        const u = buf.readFloatLE(sSub + 8 + i*8);
                                        const v = buf.readFloatLE(sSub + 8 + i*8 + 4);
                                        uvArr.push(parseFloat(u.toFixed(4)), parseFloat((1.0 - v).toFixed(4)));
                                    }
                                }
                                sSub += 8 + sss;
                            }
                        }
                        pSub += 8 + pss;
                    }
                }
                sub += 8 + ss;
            }
            const upper = meshName.toUpperCase();
            if (!upper.includes('MUZZLE') && !upper.includes('FLASH') && vArr.length > 0 && triArr.length > 0) {
                rawMeshes[meshName || 'mesh'] = { rawV: vArr, inf: infArr, tri: triArr, uv: uvArr, tex: meshTex || cfg.tex };
            }
        }
        off += 8 + size;
    }

    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
    const standTransformed = {};
    for (const [mName, mData] of Object.entries(rawMeshes)) {
        const list = [];
        for (let i = 0; i < mData.rawV.length; i++) {
            const v = mData.rawV[i];
            const bIdx = (mData.inf && mData.inf.length === mData.rawV.length) ? mData.inf[i] : 0;
            const bone = standBones[bIdx];
            const wv = bone ? transformPoint(bone.worldMat, v) : v;
            const fwd = [-wv[0], wv[1], -wv[2]];
            list.push(fwd);
            if (fwd[0] < minX) minX = fwd[0]; if (fwd[0] > maxX) maxX = fwd[0];
            if (fwd[1] < minY) minY = fwd[1]; if (fwd[1] > maxY) maxY = fwd[1];
            if (fwd[2] < minZ) minZ = fwd[2]; if (fwd[2] > maxZ) maxZ = fwd[2];
        }
        standTransformed[mName] = list;
    }
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const runFramesCount = 8;
    const totalRnaFrames = getAnimNumFramesBuf(rnaBuf);
    const runSampledBones = [];
    for (let s = 0; s < runFramesCount; s++) {
        const frame = rnaBuf ? Math.floor(s * (totalRnaFrames - 1) / (runFramesCount - 1)) : 0;
        runSampledBones.push(rnaBuf ? getBonesForAnimFrameBuf(basePivots, rnaBuf, frame) : standBones);
    }

    const exportMeshes = {};
    for (const [mName, mData] of Object.entries(rawMeshes)) {
        const flatV = [];
        for (const fwd of standTransformed[mName]) {
            flatV.push(parseFloat((fwd[0] - cx).toFixed(2)), parseFloat((fwd[1] - minY).toFixed(2)), parseFloat((fwd[2] - cz).toFixed(2)));
        }
        const bakedRun = [];
        for (let s = 0; s < runFramesCount; s++) {
            const bones = runSampledBones[s];
            const flatRun = [];
            for (let i = 0; i < mData.rawV.length; i++) {
                const v = mData.rawV[i];
                const bIdx = (mData.inf && mData.inf.length === mData.rawV.length) ? mData.inf[i] : 0;
                const bone = bones[bIdx];
                const wv = bone ? transformPoint(bone.worldMat, v) : v;
                const fwd = [-wv[0], wv[1], -wv[2]];
                flatRun.push(parseFloat((fwd[0] - cx).toFixed(2)), parseFloat((fwd[1] - minY).toFixed(2)), parseFloat((fwd[2] - cz).toFixed(2)));
            }
            bakedRun.push(flatRun);
        }
        exportMeshes[mName] = { v: flatV, run: bakedRun, i: mData.tri, u: mData.uv, tex: mData.tex };
    }
    return {
        f: cfg.faction,
        s: cfg.scale,
        p: [],
        h: Object.keys(exportMeshes).map(mName => [0, mName]),
        m: exportMeshes
    };
}

function parseStaticW3dFromBig(w3dFileName, faction, scale, dropRe = null) {
    const buf = getBigFileBuffer(w3dFileName, [w3dBig, w3dZhBig]);
    if (!buf) throw new Error(`Missing W3D file: ${w3dFileName}`);
    const tmpFile = path.join(scratchTmp, w3dFileName);
    fs.writeFileSync(tmpFile, buf);
    const parsed = parseW3dModel(tmpFile);
    fs.unlinkSync(tmpFile);

    const filteredMeshes = {};
    for (const [mName, mData] of Object.entries(parsed.meshes || {})) {
        if (dropRe && (dropRe.test(mName) || (mData.tex && dropRe.test(mData.tex)))) continue;
        filteredMeshes[mName] = mData;
    }
    const meshEntries = (parsed.hlodSubObjects || [])
        .filter(h => filteredMeshes[h.name] !== undefined)
        .map(h => [h.boneIndex, h.name]);
    const compactPivots = (parsed.pivots || []).map(p => [p.name, p.parentIndex, p.tx, p.ty, p.tz]);
    return { f: faction, s: scale, p: compactPivots, h: meshEntries, m: filteredMeshes };
}

// 1. Load existing 02b_w3d_models.js cleanly (only lines 1..11, ignoring broken bottom override)
const w3dPath = path.join(root, 'src', 'js', '02b_w3d_models.js');
const lines = fs.readFileSync(w3dPath, 'utf8').split(/\r?\n/);
const headerCode = lines.slice(0, 11).join('\n');
const sb = { window: {} };
vm.runInNewContext(headerCode, sb);

const W3D_VEHICLE_DATA = sb.window.W3D_VEHICLE_DATA;
const W3D_BUILDING_DATA = sb.window.W3D_BUILDING_DATA;
const W3D_INFANTRY_DATA = sb.window.W3D_INFANTRY_DATA;
const W3D_TEXTURE_DATA = sb.window.W3D_TEXTURE_DATA;

// 2. Patch vehicles & buildings
const c130 = parseStaticW3dFromBig('AvCargoPln.W3D', 'usa', 0.24, /\.light\d+|coplight\.dds/i);
W3D_VEHICLE_DATA['c130'] = c130;

const chinaBomber = parseStaticW3dFromBig('NVCargoPln.W3D', 'china', 0.24, /\.light\d+|coplight\.dds/i);
W3D_VEHICLE_DATA['china_bomber'] = chinaBomber;

const hospital = parseStaticW3dFromBig('ZBHospital.W3D', 'tech', 0.24);
W3D_BUILDING_DATA['tech_hospital'] = hospital;

// 3. Patch skinned infantry
const pilotRna = findAnimInBig('airplt_', [/_rna\.w3d$/, /_wka\.w3d$/, /_sta\.w3d$/], [w3dBig, w3dZhBig]);
const pilot = bakeSkinnedInfantryFromBig({ key: 'pilot', skn: 'AIRPLT_SKN.W3D', skl: 'AIRPLT_SKL.W3D', sta: 'AIRPLT_STA.W3D', rna: pilotRna || 'AIRPLT_STA.W3D', faction: 'usa', scale: 0.28, tex: 'zhca_airappilot.tga' });
W3D_INFANTRY_DATA['pilot'] = pilot;

const hijackerRna = findAnimInBig('uihjck_', [/_rna\.w3d$/, /_wka\.w3d$/, /_run\.w3d$/, /_sta\.w3d$/], [w3dBig, w3dZhBig]);
const hijacker = bakeSkinnedInfantryFromBig({ key: 'hijacker', skn: 'UIHJCK_SKN.W3D', skl: 'UIHJCK_SKL.W3D', sta: 'UIHJCK_STA.W3D', rna: hijackerRna || 'UIHJCK_STA.W3D', faction: 'gla', scale: 0.28, tex: 'zhca_uihijack.tga' });
W3D_INFANTRY_DATA['hijacker'] = hijacker;

const mobRna = findAnimInBig('uimob01_', [/_rna\.w3d$/, /_rnd\.w3d$/, /_sta\.w3d$/], [w3dBig, w3dZhBig]);
const mob = bakeSkinnedInfantryFromBig({ key: 'mob', skn: 'UIMOB01_SKN.W3D', skl: 'UIMOB01_SKL.W3D', sta: 'UIMOB01_STA.W3D', rna: mobRna || 'UIMOB01_STA.W3D', faction: 'gla', scale: 0.28, tex: 'zhca_uimob01.tga' });
W3D_INFANTRY_DATA['mob'] = mob;

// 4. Extract missing textures
const extraTextures = {
    'avstarlift': 'avstarlift.dds',
    'avcargopln': 'avcargopln.dds',
    'c130': 'avcargopln.dds',
    'nvcargopln': 'nvcargopln.dds',
    'china_bomber': 'nvcargopln.dds',
    'atpwrglow': 'atpwrglow.dds',
    'zbhospital': 'zbhospital.dds',
    'zbhospital2': 'zbhospital2.dds',
    'zbhospital3': 'zbhospital3.dds',
    'tech_hospital': 'zbhospital.dds',
    'ubdemotrap': 'ubdemotrap.dds'
};

function addTextureKey(alias, texFile) {
    const base = path.basename(texFile, path.extname(texFile)).toLowerCase();
    const tgaCandidate = base + '.tga';
    const ddsCandidate = base + '.dds';
    const tryOrder = texFile.toLowerCase().endsWith('.tga')
        ? [texFile, tgaCandidate, ddsCandidate]
        : [texFile, ddsCandidate, tgaCandidate];
    for (const candidate of tryOrder) {
        const buf = getBigFileBuffer(candidate, [texBig, texZhBig]);
        if (buf) {
            const decoded = decodeTextureBuffer(candidate, buf);
            W3D_TEXTURE_DATA[base] = decoded;
            W3D_TEXTURE_DATA[alias.toLowerCase()] = decoded;
            return true;
        }
    }
    throw new Error(`Could not find texture "${texFile}" (alias "${alias}") in Textures.big / TexturesZH.big`);
}

for (const [alias, file] of Object.entries(extraTextures)) {
    addTextureKey(alias, file);
}
for (const [infKey, infData] of Object.entries({ pilot, hijacker, mob })) {
    const texFiles = [...new Set(Object.values(infData.m).map(m => m.tex).filter(Boolean))];
    console.log(`Infantry ${infKey} textures:`, texFiles.join(', '));
    if (texFiles.length > 0) addTextureKey(infKey, texFiles[0]);
    for (const tf of texFiles) addTextureKey(path.basename(tf, path.extname(tf)), tf);
}

// 5. Write lines 7..10 back and strip stale bottom c130 override if present
lines[6] = 'window.W3D_VEHICLE_DATA = ' + JSON.stringify(W3D_VEHICLE_DATA) + ';';
lines[7] = 'window.W3D_BUILDING_DATA = ' + JSON.stringify(W3D_BUILDING_DATA) + ';';
lines[8] = 'window.W3D_INFANTRY_DATA = ' + JSON.stringify(W3D_INFANTRY_DATA) + ';';
lines[9] = 'window.W3D_TEXTURE_DATA = ' + JSON.stringify(W3D_TEXTURE_DATA) + ';';

const cleanedLines = lines.filter(l =>
    !l.includes('// Authentic EA Retail C-130 Hercules (AvCargoPln.W3D) for Supply Drop Zone') &&
    !l.startsWith('if (window.W3D_VEHICLE_DATA) window.W3D_VEHICLE_DATA["c130"]') &&
    !l.startsWith('if (window.W3D_TEXTURE_DATA) window.W3D_TEXTURE_DATA["c130"]')
);
fs.writeFileSync(w3dPath, cleanedLines.join('\n'));
fs.rmSync(scratchTmp, { recursive: true, force: true });

// 6. Verify 0 zero-vertex models and 0 missing textures
const texKeys = new Set(Object.keys(W3D_TEXTURE_DATA).map(k => k.toLowerCase()));
for (const [label, dict] of [['W3D_VEHICLE_DATA', W3D_VEHICLE_DATA], ['W3D_BUILDING_DATA', W3D_BUILDING_DATA], ['W3D_INFANTRY_DATA', W3D_INFANTRY_DATA]]) {
    for (const [k, obj] of Object.entries(dict)) {
        const meshes = Object.entries(obj.m || {});
        if (meshes.length === 0) throw new Error(`Empty meshes on ${label}.${k}`);
        for (const [mn, m] of meshes) {
            if (!m.v || m.v.length === 0 || !m.i || m.i.length === 0) {
                throw new Error(`Zero-vertex mesh ${label}.${k}.${mn}`);
            }
            if (m.tex && m.tex !== 'unknown') {
                const base = m.tex.toLowerCase().replace(/\.(dds|tga)$/, '');
                if (!texKeys.has(base)) {
                    throw new Error(`Missing texture ${m.tex} referenced by ${label}.${k}.${mn}`);
                }
            }
        }
    }
}
console.log('SUCCESS: Patched 02b_w3d_models.js cleanly! Verified 0 zero-vertex meshes and 0 missing textures across all', Object.keys(W3D_VEHICLE_DATA).length, 'vehicles,', Object.keys(W3D_BUILDING_DATA).length, 'buildings,', Object.keys(W3D_INFANTRY_DATA).length, 'infantry, and', texKeys.size, 'textures.');
