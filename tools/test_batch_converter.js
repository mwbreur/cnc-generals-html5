const fs = require('fs');
const path = require('path');

function convertW3d(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
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

    // 1. Read Pivots
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
                        const name = buf.toString('ascii', o, endStr);
                        const parentIndex = buf.readInt32LE(o + 16);
                        const tx = buf.readFloatLE(o + 20);
                        const ty = buf.readFloatLE(o + 24);
                        const tz = buf.readFloatLE(o + 28);
                        const rx = buf.readFloatLE(o + 32);
                        const ry = buf.readFloatLE(o + 36);
                        const rz = buf.readFloatLE(o + 40);
                        const rw = buf.readFloatLE(o + 44);

                        pivots.push({
                            index: i,
                            name,
                            parentIndex,
                            translation: [parseFloat(tx.toFixed(3)), parseFloat(tz.toFixed(3)), parseFloat((-ty).toFixed(3))],
                            rotation: [parseFloat(rx.toFixed(4)), parseFloat(rz.toFixed(4)), parseFloat((-ry).toFixed(4)), parseFloat(rw.toFixed(4))]
                        });
                    }
                }
            });
        }
    });

    // 2. Read HLOD
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
                            const name = buf.toString('ascii', ac.dataStart + 4, endStr);
                            hlodSubObjects.push({ boneIndex, name });
                        }
                    });
                }
            });
        }
    });

    // 3. Read Meshes
    const meshes = {};

    function processMeshChunk(c) {
        if (c.type === 0x00) {
            const sub = readChunk(c.dataStart, c.dataEnd);
            let containerName = '', meshName = '';
            let vertices = null, normals = null, indices = null, uvs = null;
            const textures = [];

            sub.forEach(sc => {
                if (sc.type === 0x1f) {
                    let endMesh = sc.dataStart + 8;
                    while (endMesh < sc.dataStart + 24 && buf[endMesh] !== 0) endMesh++;
                    meshName = buf.toString('ascii', sc.dataStart + 8, endMesh);

                    let endContainer = sc.dataStart + 24;
                    while (endContainer < sc.dataStart + 40 && buf[endContainer] !== 0) endContainer++;
                    containerName = buf.toString('ascii', sc.dataStart + 24, endContainer);
                } else if (sc.type === 0x02) {
                    const vCount = Math.floor((sc.dataEnd - sc.dataStart) / 12);
                    vertices = [];
                    for (let i = 0; i < vCount; i++) {
                        const vx = buf.readFloatLE(sc.dataStart + i * 12 + 0);
                        const vy = buf.readFloatLE(sc.dataStart + i * 12 + 4);
                        const vz = buf.readFloatLE(sc.dataStart + i * 12 + 8);
                        vertices.push(
                            parseFloat(vx.toFixed(3)),
                            parseFloat(vz.toFixed(3)),
                            parseFloat((-vy).toFixed(3))
                        );
                    }
                } else if (sc.type === 0x03) {
                    const nCount = Math.floor((sc.dataEnd - sc.dataStart) / 12);
                    normals = [];
                    for (let i = 0; i < nCount; i++) {
                        const nx = buf.readFloatLE(sc.dataStart + i * 12 + 0);
                        const ny = buf.readFloatLE(sc.dataStart + i * 12 + 4);
                        const nz = buf.readFloatLE(sc.dataStart + i * 12 + 8);
                        normals.push(
                            parseFloat(nx.toFixed(3)),
                            parseFloat(nz.toFixed(3)),
                            parseFloat((-ny).toFixed(3))
                        );
                    }
                } else if (sc.type === 0x20) {
                    const tCount = Math.floor((sc.dataEnd - sc.dataStart) / 32);
                    indices = [];
                    for (let i = 0; i < tCount; i++) {
                        const v0 = buf.readUInt32LE(sc.dataStart + i * 32 + 0);
                        const v1 = buf.readUInt32LE(sc.dataStart + i * 32 + 4);
                        const v2 = buf.readUInt32LE(sc.dataStart + i * 32 + 8);
                        indices.push(v0, v2, v1);
                    }
                } else if (sc.type === 0x30) {
                    const texChunks = readChunk(sc.dataStart, sc.dataEnd);
                    texChunks.forEach(tc => {
                        if (tc.type === 0x31) {
                            const tsub = readChunk(tc.dataStart, tc.dataEnd);
                            tsub.forEach(tt => {
                                if (tt.type === 0x32) {
                                    let endStr = tt.dataStart;
                                    while (endStr < tt.dataEnd && buf[endStr] !== 0) endStr++;
                                    textures.push(buf.toString('ascii', tt.dataStart, endStr));
                                }
                            });
                        }
                    });
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
                                            parseFloat(u.toFixed(4)),
                                            parseFloat((1.0 - v).toFixed(4))
                                        );
                                    }
                                }
                            });
                        }
                    });
                }
            });

            const fullName = containerName ? `${containerName}.${meshName}` : meshName;
            meshes[fullName.toLowerCase()] = {
                name: fullName,
                vertices,
                normals,
                indices,
                uvs,
                textures
            };
        } else if (c.hasSub) {
            const sub = readChunk(c.dataStart, c.dataEnd);
            sub.forEach(processMeshChunk);
        }
    }

    topChunks.forEach(processMeshChunk);

    return {
        id: path.basename(filePath, path.extname(filePath)).toLowerCase(),
        name: path.basename(filePath),
        pivots,
        hlodSubObjects,
        meshes
    };
}

module.exports = { convertW3d };
