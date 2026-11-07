const fs = require('fs');
const path = require('path');

function parseW3dWithTextureSplit(filePath) {
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
    const meshes = {};

    function processMesh(c) {
        if (c.type === 0x00) {
            const sub = readChunk(c.dataStart, c.dataEnd);
            let containerName = '', meshName = '';
            let vertices = null, indices = null, uvs = null;
            let texNames = [], texIds = [];

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
                        indices.push(v0, v2, v1);
                    }
                } else if (sc.type === 0x30) {
                    const tChunks = readChunk(sc.dataStart, sc.dataEnd);
                    tChunks.forEach(tc => {
                        if (tc.type === 0x31) {
                            const tSub = readChunk(tc.dataStart, tc.dataEnd);
                            tSub.forEach(tsc => {
                                if (tsc.type === 0x32) {
                                    let et = tsc.dataStart;
                                    while (et < tsc.dataEnd && buf[et] !== 0) et++;
                                    texNames.push(buf.toString('ascii', tsc.dataStart, et).trim());
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
                                            parseFloat(u.toFixed(3)),
                                            parseFloat((1.0 - v).toFixed(3))
                                        );
                                    }
                                } else if (stc.type === 0x49) {
                                    const count = Math.floor((stc.dataEnd - stc.dataStart) / 4);
                                    for (let i = 0; i < count; i++) texIds.push(buf.readUInt32LE(stc.dataStart + i * 4));
                                }
                            });
                        }
                    });
                }
            });

            const fullName = (containerName ? (containerName + '.' + meshName) : meshName).toLowerCase();
            if (vertices && indices) {
                if (texNames.length > 1 && texIds.length === indices.length / 3) {
                    const usedIds = [...new Set(texIds)];
                    usedIds.forEach(id => {
                        const tName = texNames[id] ? texNames[id].toLowerCase().replace('.tga', '.dds') : 'unknown';
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
                                const newIdx = subV.length / 3;
                                remap.set(oldIdx, newIdx);
                                subV.push(vertices[oldIdx * 3], vertices[oldIdx * 3 + 1], vertices[oldIdx * 3 + 2]);
                                if (uvs) subU.push(uvs[oldIdx * 2], uvs[oldIdx * 2 + 1]);
                            }
                            finalI.push(remap.get(oldIdx));
                        }
                        const subMeshName = fullName + '__tex_' + path.basename(tName, '.dds');
                        meshes[subMeshName] = {
                            v: subV,
                            i: finalI,
                            u: subU,
                            tex: tName
                        };
                    });
                } else {
                    const tName = texNames[0] ? texNames[0].toLowerCase().replace('.tga', '.dds') : null;
                    meshes[fullName] = {
                        v: vertices,
                        i: indices,
                        u: uvs,
                        tex: tName
                    };
                }
            }
        } else if (c.hasSub) {
            readChunk(c.dataStart, c.dataEnd).forEach(processMesh);
        }
    }
    topChunks.forEach(processMesh);
    return meshes;
}

const meshes = parseW3dWithTextureSplit('D:/C&C/extracted_assets/w3d/ABPWRPLANT.W3D');
console.log('Resulting meshes for ABPWRPLANT:');
for (const [k, v] of Object.entries(meshes)) {
    console.log('  ' + k + ' => tris: ' + (v.i.length / 3) + ' tex: ' + v.tex);
}
