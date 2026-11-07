const fs = require('fs');
const path = require('path');

function parseW3dModel(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);

    function readChunk(start, end) {
        const chunks = [];
        let cur = start;
        while (cur + 8 <= end) {
            const type = buf.readUInt32LE(cur);
            const rawSize = buf.readUInt32LE(cur + 4);
            const size = rawSize & 0x7FFFFFFF;
            const hasSub = (rawSize & 0x80000000) !== 0;
            const dataStart = cur + 8;
            const dataEnd = Math.min(end, dataStart + size);
            chunks.push({ type, size, hasSub, dataStart, dataEnd });
            cur = dataEnd;
        }
        return chunks;
    }

    const topChunks = readChunk(0, buf.length);

    // 1. Pivots (transform hierarchy)
    const pivots = [];
    topChunks.forEach(c => {
        if (c.type === 0x100) {
            const sub = readChunk(c.dataStart, c.dataEnd);
            sub.forEach(sc => {
                if (sc.type === 0x102) {
                    const count = Math.floor((sc.dataEnd - sc.dataStart) / 60);
                    for (let i = 0; i < count; i++) {
                        const o = sc.dataStart + i * 60;
                        let endStr = o;
                        while (endStr < o + 16 && buf[endStr] !== 0) endStr++;
                        const name = buf.toString('ascii', o, endStr).trim();
                        const parentIndex = buf.readInt32LE(o + 16);
                        const wx = buf.readFloatLE(o + 20);
                        const wy = buf.readFloatLE(o + 24);
                        const wz = buf.readFloatLE(o + 28);

                        // W3D to Three.js: tx = -wy, ty = wz, tz = wx
                        pivots.push({
                            index: i,
                            name,
                            parentIndex,
                            tx: parseFloat((-wy).toFixed(2)),
                            ty: parseFloat(wz.toFixed(2)),
                            tz: parseFloat(wx.toFixed(2))
                        });
                    }
                }
            });
        }
    });

    // 2. HLOD sub-object table
    const hlodSubObjects = [];
    topChunks.forEach(c => {
        if (c.type === 0x700) {
            const hlodChildren = readChunk(c.dataStart, c.dataEnd);
            hlodChildren.forEach(hc => {
                if (hc.type === 0x702) {
                    const arrayChildren = readChunk(hc.dataStart, hc.dataEnd);
                    arrayChildren.forEach(ac => {
                        if (ac.type === 0x704) {
                            const boneIndex = buf.readUInt32LE(ac.dataStart);
                            let endStr = ac.dataStart + 4;
                            while (endStr < ac.dataEnd && buf[endStr] !== 0) endStr++;
                            const name = buf.toString('ascii', ac.dataStart + 4, endStr).trim().toLowerCase();
                            hlodSubObjects.push({ boneIndex, name });
                        }
                    });
                }
            });
        }
    });

    // 3. Meshes
    const meshes = {};
    function processMesh(c) {
        if (c.type === 0x00) {
            const sub = readChunk(c.dataStart, c.dataEnd);
            let containerName = '', meshName = '';
            let vertices = null, indices = null, uvs = null;

            sub.forEach(sc => {
                if (sc.type === 0x1f) {
                    let endMesh = sc.dataStart + 8;
                    while (endMesh < sc.dataStart + 24 && buf[endMesh] !== 0) endMesh++;
                    meshName = buf.toString('ascii', sc.dataStart + 8, endMesh).trim();

                    let endContainer = sc.dataStart + 24;
                    while (endContainer < sc.dataStart + 40 && buf[endContainer] !== 0) endContainer++;
                    containerName = buf.toString('ascii', sc.dataStart + 24, endContainer).trim();
                } else if (sc.type === 0x02) {
                    const vCount = Math.floor((sc.dataEnd - sc.dataStart) / 12);
                    vertices = [];
                    for (let i = 0; i < vCount; i++) {
                        const wx = buf.readFloatLE(sc.dataStart + i * 12 + 0);
                        const wy = buf.readFloatLE(sc.dataStart + i * 12 + 4);
                        const wz = buf.readFloatLE(sc.dataStart + i * 12 + 8);
                        // tx = -wy, ty = wz, tz = wx
                        vertices.push(
                            parseFloat((-wy).toFixed(2)),
                            parseFloat(wz.toFixed(2)),
                            parseFloat(wx.toFixed(2))
                        );
                    }
                } else if (sc.type === 0x20) {
                    const tCount = Math.floor((sc.dataEnd - sc.dataStart) / 32);
                    indices = [];
                    for (let i = 0; i < tCount; i++) {
                        const v0 = buf.readUInt32LE(sc.dataStart + i * 32 + 0);
                        const v1 = buf.readUInt32LE(sc.dataStart + i * 32 + 4);
                        const v2 = buf.readUInt32LE(sc.dataStart + i * 32 + 8);
                        // Swap v1 and v2 for CCW winding due to reflection determinant = -1
                        indices.push(v0, v2, v1);
                    }
                } else if (sc.type === 0x38) {
                    const passChunks = readChunk(sc.dataStart, sc.dataEnd);
                    passChunks.forEach(pc => {
                        if (pc.type === 0x48) {
                            const stageChunks = readChunk(pc.dataStart, pc.dataEnd);
                            stageChunks.forEach(stc => {
                                if (stc.type === 0x4a) {
                                    const uvCount = Math.floor((stc.dataEnd - stc.dataStart) / 8);
                                    uvs = [];
                                    for (let i = 0; i < uvCount; i++) {
                                        const u = buf.readFloatLE(stc.dataStart + i * 8 + 0);
                                        const v = buf.readFloatLE(stc.dataStart + i * 8 + 4);
                                        uvs.push(
                                            parseFloat(u.toFixed(3)),
                                            parseFloat((1.0 - v).toFixed(3))
                                        );
                                    }
                                }
                            });
                        }
                    });
                }
            });

            const fullName = containerName ? `${containerName}.${meshName}` : meshName;
            if (vertices && indices) {
                meshes[fullName.toLowerCase()] = {
                    v: vertices,
                    i: indices,
                    u: uvs
                };
            }
        } else if (c.hasSub) {
            readChunk(c.dataStart, c.dataEnd).forEach(processMesh);
        }
    }
    topChunks.forEach(processMesh);

    return {
        id: path.basename(filePath, path.extname(filePath)).toLowerCase(),
        name: path.basename(filePath),
        pivots,
        hlodSubObjects,
        meshes
    };
}

module.exports = { parseW3dModel };
