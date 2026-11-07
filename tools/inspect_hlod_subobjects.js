const fs = require('fs');

function inspectHlodSubObjects(filePath) {
    const buf = fs.readFileSync(filePath);
    console.log(`\nHLOD Sub-Objects in ${filePath.split('/').pop()}:`);

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
        if (c.type === 0x700) { // HLOD
            const hlodChildren = readChunk(c.dataStart, c.dataEnd);
            hlodChildren.forEach(hc => {
                if (hc.type === 0x702) { // HLOD_LOD_ARRAY
                    const arrayChildren = readChunk(hc.dataStart, hc.dataEnd);
                    arrayChildren.forEach(ac => {
                        if (ac.type === 0x704) { // HLOD_SUB_OBJECT
                            const boneIdx = buf.readUInt32LE(ac.dataStart);
                            let endStr = ac.dataStart + 4;
                            while (endStr < ac.dataEnd && buf[endStr] !== 0) endStr++;
                            const name = buf.toString('ascii', ac.dataStart + 4, endStr);
                            console.log(`  SubObject: bone=${boneIdx}, meshName="${name}"`);
                        }
                    });
                }
            });
        }
    });
}

inspectHlodSubObjects('D:/C&C/extracted_assets/w3d/NVBtMstr.W3D');
inspectHlodSubObjects('D:/C&C/extracted_assets/w3d/avPaladin.W3D');
inspectHlodSubObjects('D:/C&C/extracted_assets/w3d/NVOvrlrd.W3D');
