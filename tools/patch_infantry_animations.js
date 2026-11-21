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

function getBigBuf(name) {
    if (!name) return null;
    const k = name.toLowerCase();
    for (const idx of [w3dZhBig, w3dBig]) {
        const e = idx.get(k);
        if (e) return e.buf.subarray(e.off, e.off + e.size);
    }
    return null;
}

function findAnimBuf(prefix, patterns) {
    const pLower = prefix.toLowerCase();
    for (const pat of patterns) {
        for (const idx of [w3dZhBig, w3dBig]) {
            for (const [k, e] of idx.entries()) {
                if (k.startsWith(pLower) && pat.test(k)) {
                    return { name: k, buf: e.buf.subarray(e.off, e.off + e.size) };
                }
            }
        }
    }
    return null;
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

const AXIS_SWAP = new Float32Array([1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1]);

function transformPoint(m, p) {
    const x = p[0], y = p[1], z = p[2];
    return [
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14]
    ];
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
                        if (!pivotDeltas[pivotIndex]) pivotDeltas[pivotIndex] = { t: [0, 0, 0], q: [0, 0, 0, 1] };
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
                const rawDM = mat4Compose(delta.t, delta.q);
                const threeDM = mat4Mul(mat4Mul(AXIS_SWAP, rawDM), AXIS_SWAP);
                pivots[pi].localThree = mat4Mul(pivots[pi].localThree, threeDM);
            }
        }
    }
    for (let i = 0; i < pivots.length; i++) {
        const p = pivots[i];
        p.worldMat = (p.parentIndex >= 0 && p.parentIndex < pivots.length && pivots[p.parentIndex].worldMat)
            ? mat4Mul(pivots[p.parentIndex].worldMat, p.localThree)
            : p.localThree;
    }
    return pivots;
}

function parseSkinMeshes(sknBuf) {
    const rawMeshes = {};
    let off = 0;
    while (off < sknBuf.length) {
        const type = sknBuf.readUInt32LE(off);
        const size = sknBuf.readUInt32LE(off + 4) & 0x7fffffff;
        if (type === 0x00) {
            let sub = off + 8;
            let meshName = '';
            const vArr = [], infArr = [];
            while (sub < off + 8 + size) {
                const st = sknBuf.readUInt32LE(sub);
                const ss = sknBuf.readUInt32LE(sub + 4) & 0x7fffffff;
                if (st === 0x1f) {
                    const ne = sknBuf.indexOf(0, sub + 16);
                    meshName = sknBuf.toString('ascii', sub + 16, Math.min(ne > sub + 16 ? ne : sub + 32, sub + 32)).trim();
                } else if (st === 0x02) {
                    const count = Math.floor(ss / 12);
                    for (let i = 0; i < count; i++) {
                        const vx = sknBuf.readFloatLE(sub + 8 + i * 12);
                        const vy = sknBuf.readFloatLE(sub + 8 + i * 12 + 4);
                        const vz = sknBuf.readFloatLE(sub + 8 + i * 12 + 8);
                        vArr.push([vx, vz, vy]);
                    }
                } else if (st === 0x0e) {
                    const count = Math.floor(ss / 8);
                    for (let i = 0; i < count; i++) {
                        infArr.push(sknBuf.readUInt16LE(sub + 8 + i * 8));
                    }
                }
                sub += 8 + ss;
            }
            const upper = meshName.toUpperCase();
            if (!upper.includes('MUZZLE') && !upper.includes('FLASH') && vArr.length > 0) {
                rawMeshes[meshName || 'mesh'] = { rawV: vArr, inf: infArr };
            }
        }
        off += 8 + size;
    }
    return rawMeshes;
}

const INFANTRY_SPECS = [
    { key: 'ranger',          skn: 'AIRNGR_SKN.W3D',  skl: 'AIRNGR_SKL.W3D',  sta: 'AIRNGR_STA.W3D',  pre: 'airngr_' },
    { key: 'missiledefender', skn: 'NITHNT_SKN.W3D',  skl: 'NITHNT_SKL.W3D',  sta: 'NITHNT_STA.W3D',  pre: 'nithnt_' },
    { key: 'pathfinder',      skn: 'AIPFDR_SKN.W3D',  skl: 'AIPFDR_SKL.W3D',  sta: 'AIPFDR_STA.W3D',  pre: 'aipfdr_' },
    { key: 'burton',          skn: 'AIHERO_SKN.W3D',  skl: 'AIHERO_SKL.W3D',  sta: 'AIHERO_STA.W3D',  pre: 'aihero_' },
    { key: 'redguard',        skn: 'NICNSC_SKN.W3D',  skl: 'NICNSC_SKL.W3D',  sta: 'NICNSC_STA.W3D',  pre: 'nicnsc_' },
    { key: 'tankhunter',      skn: 'NITHNT_SKN.W3D',  skl: 'NITHNT_SKL.W3D',  sta: 'NITHNT_STA.W3D',  pre: 'nithnt_' },
    { key: 'hacker',          skn: 'NIHCKR_SKN.W3D',  skl: 'NIHCKR_SKL.W3D',  sta: 'NIHCKR_STA.W3D',  pre: 'nihckr_' },
    { key: 'lotus',           skn: 'NIHERO_SKN.W3D',  skl: 'NIHERO_SKL.W3D',  sta: 'NIHERO_STA.W3D',  pre: 'nihero_' },
    { key: 'rebel',           skn: 'UIRGRD_SKN.W3D',  skl: 'UIRGRD_SKL.W3D',  sta: 'UIRGRD_STB.W3D',  pre: 'uirgrd_' },
    { key: 'rpg',             skn: 'UISMSD_SKN.W3D',  skl: 'UISMSD_SKL.W3D',  sta: 'UISMSD_STA.W3D',  pre: 'uismsd_' },
    { key: 'terrorist',       skn: 'UITRST_SKN.W3D',  skl: 'UITRST_SKL.W3D',  sta: 'UITRST_STA.W3D',  pre: 'uitrst_' },
    { key: 'jarmen',          skn: 'UIHERO_SKN.W3D',  skl: 'UIHERO_SKL.W3D',  sta: 'UIHERO_STA.W3D',  pre: 'uihero_' },
    { key: 'worker',          skn: 'UIWRKR_SKN.W3D',  skl: 'UIWRKR_SKL.W3D',  sta: 'UIWRKR_STA.W3D',  pre: 'uiwrkr_' },
    { key: 'pilot',           skn: 'AIRPLT_SKN.W3D',  skl: 'AIRPLT_SKL.W3D',  sta: 'AIRPLT_STA.W3D',  pre: 'airplt_' },
    { key: 'hijacker',        skn: 'UIHJCK_SKN.W3D',  skl: 'UIHJCK_SKL.W3D',  sta: 'UIHJCK_STA.W3D',  pre: 'uihjck_' },
    { key: 'mob',             skn: 'UIMOB01_SKN.W3D', skl: 'UIMOB01_SKL.W3D', sta: 'UIMOB01_STA.W3D', pre: 'uimob01_' }
];

const w3dPath = path.join(root, 'src', 'js', '02b_w3d_models.js');
const lines = fs.readFileSync(w3dPath, 'utf8').split(/\r?\n/);
const sb = { window: {} };
vm.runInNewContext(lines.slice(0, 11).join('\n'), sb);
const W3D_INFANTRY_DATA = sb.window.W3D_INFANTRY_DATA;

let atkCount = 0;
let dieCount = 0;

for (const spec of INFANTRY_SPECS) {
    const infObj = W3D_INFANTRY_DATA[spec.key];
    if (!infObj) continue;
    const sknBuf = getBigBuf(spec.skn);
    const sklBuf = getBigBuf(spec.skl);
    const staBuf = getBigBuf(spec.sta);
    if (!sknBuf || !sklBuf) continue;

    const basePivots = loadSkeletonBuf(sklBuf);
    const standBones = getBonesForAnimFrameBuf(basePivots, staBuf, 0);
    const rawMeshes = parseSkinMeshes(sknBuf);

    // Compute identical stand-pose normalization (cx, minY, cz) as original exporter
    let minX = 1e9, maxX = -1e9, minY = 1e9, minZ = 1e9, maxZ = -1e9;
    for (const mData of Object.values(rawMeshes)) {
        for (let i = 0; i < mData.rawV.length; i++) {
            const v = mData.rawV[i];
            const bIdx = (mData.inf && mData.inf.length === mData.rawV.length) ? mData.inf[i] : 0;
            const bone = standBones[bIdx];
            const wv = bone ? transformPoint(bone.worldMat, v) : v;
            const fwd = [-wv[0], wv[1], -wv[2]];
            if (fwd[0] < minX) minX = fwd[0]; if (fwd[0] > maxX) maxX = fwd[0];
            if (fwd[1] < minY) minY = fwd[1];
            if (fwd[2] < minZ) minZ = fwd[2]; if (fwd[2] > maxZ) maxZ = fwd[2];
        }
    }
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    const atkHit = findAnimBuf(spec.pre, [/_ata\.w3d$/, /_ata\d+\.w3d$/, /_ata\d+_lp\.w3d$/, /_atb\.w3d$/, /_atb\d+\.w3d$/, /_fia\d*\.w3d$/, /_aka\d*\.w3d$/]);
    const dieHit = findAnimBuf(spec.pre, [/_dta\.w3d$/, /_dta\d+\.w3d$/, /_dtb\d*\.w3d$/, /_da1\.w3d$/, /_die\d*\.w3d$/]);

    const bakeAnim = (animBuf, frameCount) => {
        if (!animBuf) return null;
        const total = Math.max(1, getAnimNumFramesBuf(animBuf));
        const sampledBones = [];
        for (let s = 0; s < frameCount; s++) {
            const frame = frameCount > 1 ? Math.floor(s * (total - 1) / (frameCount - 1)) : 0;
            sampledBones.push(getBonesForAnimFrameBuf(basePivots, animBuf, frame));
        }
        return sampledBones;
    };

    const atkBones = bakeAnim(atkHit ? atkHit.buf : null, 4);
    const dieBones = bakeAnim(dieHit ? dieHit.buf : null, 5);

    for (const [mName, existingMesh] of Object.entries(infObj.m)) {
        const mData = rawMeshes[mName];
        if (!mData || mData.rawV.length * 3 !== existingMesh.v.length) continue;

        const sampleForMesh = (sampledBones) => {
            if (!sampledBones) return null;
            return sampledBones.map(bones => {
                const flat = [];
                for (let i = 0; i < mData.rawV.length; i++) {
                    const v = mData.rawV[i];
                    const bIdx = (mData.inf && mData.inf.length === mData.rawV.length) ? mData.inf[i] : 0;
                    const bone = bones[bIdx];
                    const wv = bone ? transformPoint(bone.worldMat, v) : v;
                    const fwd = [-wv[0], wv[1], -wv[2]];
                    flat.push(
                        parseFloat((fwd[0] - cx).toFixed(2)),
                        parseFloat((fwd[1] - minY).toFixed(2)),
                        parseFloat((fwd[2] - cz).toFixed(2))
                    );
                }
                return flat;
            });
        };

        const atkFrames = sampleForMesh(atkBones);
        const dieFrames = sampleForMesh(dieBones);
        if (atkFrames) existingMesh.atk = atkFrames;
        if (dieFrames) existingMesh.die = dieFrames;
    }

    if (atkBones) atkCount++;
    if (dieBones) dieCount++;
    console.log(spec.key.padEnd(18), 'atk:', (atkHit ? atkHit.name : 'none').padEnd(20), 'die:', (dieHit ? dieHit.name : 'none'));
}

lines[8] = 'window.W3D_INFANTRY_DATA = ' + JSON.stringify(W3D_INFANTRY_DATA) + ';';
fs.writeFileSync(w3dPath, lines.join('\n'), 'utf8');
console.log(`SUCCESS: Baked official W3D HANIM attack (${atkCount}/16) and death (${dieCount}/16) skeletal keyframes into W3D_INFANTRY_DATA.`);
