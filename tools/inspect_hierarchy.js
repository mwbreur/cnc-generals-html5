const fs = require('fs');

function inspectHierarchy(filePath) {
    const buf = fs.readFileSync(filePath);
    console.log(`\n========================================`);
    console.log(`HIERARCHY INSPECTION: ${filePath.split('/').pop()}`);
    console.log(`========================================`);

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

    topChunks.forEach(c => {
        if (c.type === 0x100) { // HIERARCHY
            console.log(`Found HIERARCHY chunk (size ${c.size})`);
            const sub = readChunk(c.dataStart, c.dataEnd);
            sub.forEach(sc => {
                if (sc.type === 0x101) { // HIERARCHY_HEADER
                    const version = buf.readUInt32LE(sc.dataStart);
                    const name = buf.toString('ascii', sc.dataStart + 4, sc.dataStart + 20).replace(/\0/g, '');
                    const pivotCount = buf.readUInt32LE(sc.dataStart + 20);
                    console.log(`  Header: version=${version}, name="${name}", pivotCount=${pivotCount}`);
                } else if (sc.type === 0x102) { // PIVOTS (60 bytes each: name 16 bytes, parentIndex uint32, translation 3x float, rotation 4x float)
                    const count = Math.floor((sc.dataEnd - sc.dataStart) / 60);
                    console.log(`  Pivots (${count}):`);
                    for (let i = 0; i < count; i++) {
                        const o = sc.dataStart + i * 60;
                        const pName = buf.toString('ascii', o, o + 16).replace(/\0/g, '');
                        const pParent = buf.readInt32LE(o + 16);
                        const tx = buf.readFloatLE(o + 20).toFixed(2);
                        const ty = buf.readFloatLE(o + 24).toFixed(2);
                        const tz = buf.readFloatLE(o + 28).toFixed(2);
                        console.log(`    [${i}] "${pName}" (parent: ${pParent}) pos: (${tx}, ${ty}, ${tz})`);
                    }
                }
            });
        } else if (c.type === 0x700) { // HLOD
            console.log(`Found HLOD chunk (size ${c.size})`);
            const sub = readChunk(c.dataStart, c.dataEnd);
            sub.forEach(sc => {
                if (sc.type === 0x701) { // HLOD_HEADER
                    const name = buf.toString('ascii', sc.dataStart + 8, sc.dataStart + 24).replace(/\0/g, '');
                    const hName = buf.toString('ascii', sc.dataStart + 24, sc.dataStart + 40).replace(/\0/g, '');
                    console.log(`  HLOD Header: name="${name}", hierarchy="${hName}"`);
                } else if (sc.type >= 0x702 && sc.type <= 0x705) { // HLOD_ARRAY
                    const arrayChunks = readChunk(sc.dataStart, sc.dataEnd);
                    arrayChunks.forEach(ac => {
                        if (ac.type === 0x706) { // SUB_OBJECT (36 bytes: boneIndex uint32, name 32 bytes)
                            const bIdx = buf.readUInt32LE(ac.dataStart);
                            const soName = buf.toString('ascii', ac.dataStart + 4, ac.dataEnd).replace(/\0/g, '');
                            console.log(`    SubObject: boneIndex=${bIdx}, name="${soName}"`);
                        }
                    });
                }
            });
        }
    });
}

inspectHierarchy('D:/C&C/extracted_assets/w3d/NVBtMstr.W3D');
inspectHierarchy('D:/C&C/extracted_assets/w3d/avPaladin.W3D');
inspectHierarchy('D:/C&C/extracted_assets/w3d/NVOvrlrd.W3D');
