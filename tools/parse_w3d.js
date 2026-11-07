const fs = require('fs');

function parseW3dFile(filePath) {
    const buf = fs.readFileSync(filePath);
    let cursor = 0;

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

            chunks.push({
                type,
                typeHex: '0x' + type.toString(16),
                size,
                hasSub,
                dataStart,
                dataEnd
            });
            cur = dataEnd;
        }
        return chunks;
    }

    const topChunks = readChunk(0, buf.length);
    console.log(`\nFile: ${filePath.split('/').pop()} (Total size: ${buf.length} bytes)`);
    console.log(`Top chunks count: ${topChunks.length}`);

    const meshes = [];

    function processChunk(c) {
        if (c.type === 0x00) { // W3D_CHUNK_MESH
            const sub = readChunk(c.dataStart, c.dataEnd);
            let meshName = 'unnamed';
            let numTris = 0, numVerts = 0;
            let vertices = null;
            let normals = null;
            let indices = null;
            let uvs = null;
            const textures = [];

            sub.forEach(sc => {
                if (sc.type === 0x1f) { // MESH_HEADER3
                    let endStr = sc.dataStart;
                    while (endStr < sc.dataEnd && buf[endStr] !== 0) endStr++;
                    meshName = buf.toString('ascii', sc.dataStart, endStr);
                    numTris = buf.readUInt32LE(sc.dataStart + 36);
                    numVerts = buf.readUInt32LE(sc.dataStart + 40);
                } else if (sc.type === 0x02) { // VERTICES
                    const vCount = (sc.dataEnd - sc.dataStart) / 12;
                    vertices = new Float32Array(vCount * 3);
                    for (let i = 0; i < vCount * 3; i++) {
                        vertices[i] = buf.readFloatLE(sc.dataStart + i * 4);
                    }
                } else if (sc.type === 0x03) { // VERTEX_NORMALS
                    const nCount = (sc.dataEnd - sc.dataStart) / 12;
                    normals = new Float32Array(nCount * 3);
                    for (let i = 0; i < nCount * 3; i++) {
                        normals[i] = buf.readFloatLE(sc.dataStart + i * 4);
                    }
                } else if (sc.type === 0x20) { // TRIANGLES (32 bytes per triangle: 3x uint32 vertex indices, uint32 attrs, 3x float normal, float dist)
                    const tCount = Math.floor((sc.dataEnd - sc.dataStart) / 32);
                    indices = new Uint32Array(tCount * 3);
                    for (let i = 0; i < tCount; i++) {
                        indices[i * 3 + 0] = buf.readUInt32LE(sc.dataStart + i * 32 + 0);
                        indices[i * 3 + 1] = buf.readUInt32LE(sc.dataStart + i * 32 + 4);
                        indices[i * 3 + 2] = buf.readUInt32LE(sc.dataStart + i * 32 + 8);
                    }
                } else if (sc.type === 0x30) { // TEXTURES
                    const texChunks = readChunk(sc.dataStart, sc.dataEnd);
                    texChunks.forEach(tc => {
                        if (tc.type === 0x31) { // TEXTURE
                            const tsub = readChunk(tc.dataStart, tc.dataEnd);
                            tsub.forEach(tt => {
                                if (tt.type === 0x32) { // TEXTURE_NAME
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
                                    const uvCount = (stc.dataEnd - stc.dataStart) / 8;
                                    uvs = new Float32Array(uvCount * 2);
                                    for (let i = 0; i < uvCount * 2; i++) {
                                        uvs[i] = buf.readFloatLE(stc.dataStart + i * 4);
                                    }
                                }
                            });
                        }
                    });
                }
            });

            meshes.push({
                name: meshName,
                numTris: numTris || (indices ? indices.length / 3 : 0),
                numVerts: numVerts || (vertices ? vertices.length / 3 : 0),
                hasVertices: !!vertices,
                hasNormals: !!normals,
                hasIndices: !!indices,
                hasUvs: !!uvs,
                textures
            });
        } else if (c.hasSub) {
            const sub = readChunk(c.dataStart, c.dataEnd);
            sub.forEach(processChunk);
        }
    }

    topChunks.forEach(processChunk);
    console.log(`Parsed ${meshes.length} sub-meshes:`);
    meshes.forEach(m => {
        console.log(`  SubMesh: "${m.name}" | Verts: ${m.numVerts} | Tris: ${m.numTris} | UVs: ${m.hasUvs} | Normals: ${m.hasNormals} | Textures: [${m.textures.join(', ')}]`);
    });
}

parseW3dFile('D:/C&C/extracted_models/NVBtMstr.W3D');
parseW3dFile('D:/C&C/extracted_models/NVOvrlrd.W3D');
parseW3dFile('D:/C&C/extracted_models/NVNukeCn.W3D');
