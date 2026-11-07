const fs = require('fs');
const path = require('path');

function convertW3dToThreeMesh(filePath) {
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

    // 1. Read Hierarchy Pivots
    const pivots = [];
    topChunks.forEach(c => {
        if (c.type === 0x100) { // HIERARCHY
            const sub = readChunk(c.dataStart, c.dataEnd);
            sub.forEach(sc => {
                if (sc.type === 0x102) { // PIVOTS
                    const count = Math.floor((sc.dataEnd - sc.dataStart) / 60);
                    for (let i = 0; i < count; i++) {
                        const o = sc.dataStart + i * 60;
                        let endStr = o;
                        while (endStr < o + 16 && buf[endStr] !== 0) endStr++;
                        const name = buf.toString('ascii', o, endStr);
                        const parentIndex = buf.readInt32LE(o + 16);
                        // Westwood: X=Right, Y=Forward, Z=Up
                        // Three.js: X=Right, Y=Up, Z=-Forward (or Z=Forward)
                        const tx = buf.readFloatLE(o + 20);
                        const ty = buf.readFloatLE(o + 24);
                        const tz = buf.readFloatLE(o + 28);

                        // Rotation Quat (x, y, z, w)
                        const rx = buf.readFloatLE(o + 32);
                        const ry = buf.readFloatLE(o + 36);
                        const rz = buf.readFloatLE(o + 40);
                        const rw = buf.readFloatLE(o + 44);

                        pivots.push({
                            index: i,
                            name,
                            parentIndex,
                            // Axis swap: W3D (x, y, z) -> Three.js (x, z, -y)
                            translation: [tx, tz, -ty],
                            rotation: [rx, rz, -ry, rw]
                        });
                    }
                }
            });
        }
    });

    // 2. Read HLOD Sub-Objects
    const hlodSubObjects = [];
    topChunks.forEach(c => {
        if (c.type === 0x700) { // HLOD
            const hlodChildren = readChunk(c.dataStart, c.dataEnd);
            hlodChildren.forEach(hc => {
                if (hc.type === 0x702) { // HLOD_LOD_ARRAY
                    const arrayChildren = readChunk(hc.dataStart, hc.dataEnd);
                    arrayChildren.forEach(ac => {
                        if (ac.type === 0x704) { // HLOD_SUB_OBJECT
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
        if (c.type === 0x00) { // W3D_CHUNK_MESH
            const sub = readChunk(c.dataStart, c.dataEnd);
            let containerName = '', meshName = '';
            let vertices = null, normals = null, indices = null, uvs = null;
            const textures = [];

            sub.forEach(sc => {
                if (sc.type === 0x1f) { // MESH_HEADER3
                    const version = buf.readUInt32LE(sc.dataStart);
                    const attributes = buf.readUInt32LE(sc.dataStart + 4);

                    let endMesh = sc.dataStart + 8;
                    while (endMesh < sc.dataStart + 24 && buf[endMesh] !== 0) endMesh++;
                    meshName = buf.toString('ascii', sc.dataStart + 8, endMesh);

                    let endContainer = sc.dataStart + 24;
                    while (endContainer < sc.dataStart + 40 && buf[endContainer] !== 0) endContainer++;
                    containerName = buf.toString('ascii', sc.dataStart + 24, endContainer);

                    numTris = buf.readUInt32LE(sc.dataStart + 40);
                    numVerts = buf.readUInt32LE(sc.dataStart + 44);
                } else if (sc.type === 0x02) { // VERTICES
                    const vCount = Math.floor((sc.dataEnd - sc.dataStart) / 12);
                    vertices = [];
                    for (let i = 0; i < vCount; i++) {
                        const vx = buf.readFloatLE(sc.dataStart + i * 12 + 0);
                        const vy = buf.readFloatLE(sc.dataStart + i * 12 + 4);
                        const vz = buf.readFloatLE(sc.dataStart + i * 12 + 8);
                        // Swap Y and Z: (vx, vz, -vy)
                        vertices.push(
                            parseFloat(vx.toFixed(4)),
                            parseFloat(vz.toFixed(4)),
                            parseFloat((-vy).toFixed(4))
                        );
                    }
                } else if (sc.type === 0x03) { // VERTEX_NORMALS
                    const nCount = Math.floor((sc.dataEnd - sc.dataStart) / 12);
                    normals = [];
                    for (let i = 0; i < nCount; i++) {
                        const nx = buf.readFloatLE(sc.dataStart + i * 12 + 0);
                        const ny = buf.readFloatLE(sc.dataStart + i * 12 + 4);
                        const nz = buf.readFloatLE(sc.dataStart + i * 12 + 8);
                        normals.push(
                            parseFloat(nx.toFixed(4)),
                            parseFloat(nz.toFixed(4)),
                            parseFloat((-ny).toFixed(4))
                        );
                    }
                } else if (sc.type === 0x20) { // TRIANGLES
                    const tCount = Math.floor((sc.dataEnd - sc.dataStart) / 32);
                    indices = [];
                    for (let i = 0; i < tCount; i++) {
                        const v0 = buf.readUInt32LE(sc.dataStart + i * 32 + 0);
                        const v1 = buf.readUInt32LE(sc.dataStart + i * 32 + 4);
                        const v2 = buf.readUInt32LE(sc.dataStart + i * 32 + 8);
                        // Flip triangle winding order for swapped axis
                        indices.push(v0, v2, v1);
                    }
                } else if (sc.type === 0x30) { // TEXTURES
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
                } else if (sc.type === 0x38) { // MATERIAL_PASS
                    const passChunks = readChunk(sc.dataStart, sc.dataEnd);
                    passChunks.forEach(pc => {
                        if (pc.type === 0x48) { // TEXTURE_STAGE
                            const stageChunks = readChunk(pc.dataStart, pc.dataEnd);
                            stageChunks.forEach(stc => {
                                if (stc.type === 0x4a) { // STAGE_TEXCOORDS
                                    const uvCount = Math.floor((stc.dataEnd - stc.dataStart) / 8);
                                    uvs = [];
                                    for (let i = 0; i < uvCount; i++) {
                                        const u = buf.readFloatLE(stc.dataStart + i * 8 + 0);
                                        const v = buf.readFloatLE(stc.dataStart + i * 8 + 4);
                                        uvs.push(
                                            parseFloat(u.toFixed(4)),
                                            parseFloat((1.0 - v).toFixed(4)) // Flip V for Three.js
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
        filename: path.basename(filePath),
        pivots,
        hlodSubObjects,
        meshes
    };
}

const testConverted = convertW3dToThreeMesh('D:/C&C/extracted_assets/w3d/NVBtMstr.W3D');
console.log(`Converted ${testConverted.filename}:`);
console.log(`  Pivots: ${testConverted.pivots.length}`);
console.log(`  HLOD SubObjects: ${testConverted.hlodSubObjects.length}`);
console.log(`  Meshes: ${Object.keys(testConverted.meshes).length}`);
Object.values(testConverted.meshes).forEach(m => {
    console.log(`    - "${m.name}": Verts=${m.vertices ? m.vertices.length/3 : 0}, Tris=${m.indices ? m.indices.length/3 : 0}, Textures=[${m.textures.join(', ')}]`);
});
