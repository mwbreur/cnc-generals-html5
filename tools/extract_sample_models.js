const fs = require('fs');
const path = require('path');

function extractFilesFromBig(bigPath, filterFn, outputDir) {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const fd = fs.openSync(bigPath, 'r');
    const headerBuf = Buffer.alloc(16);
    fs.readSync(fd, headerBuf, 0, 16, 0);

    const numEntries = headerBuf.readUInt32BE(8);
    const tableSize = headerBuf.readUInt32BE(12);

    const tableBuf = Buffer.alloc(tableSize);
    fs.readSync(fd, tableBuf, 0, tableSize, 16);

    let cursor = 0;
    let extractedCount = 0;

    for (let i = 0; i < numEntries; i++) {
        if (cursor + 8 > tableSize) break;
        const offset = tableBuf.readUInt32BE(cursor);
        const size = tableBuf.readUInt32BE(cursor + 4);
        cursor += 8;

        let endNull = cursor;
        while (endNull < tableSize && tableBuf[endNull] !== 0) endNull++;
        const entryPath = tableBuf.toString('ascii', cursor, endNull);
        cursor = endNull + 1;

        if (filterFn(entryPath)) {
            const fileBuf = Buffer.alloc(size);
            fs.readSync(fd, fileBuf, 0, size, offset);

            const outFilePath = path.join(outputDir, path.basename(entryPath));
            fs.writeFileSync(outFilePath, fileBuf);
            extractedCount++;
        }
    }

    fs.closeSync(fd);
    console.log(`Extracted ${extractedCount} files from ${path.basename(bigPath)} into ${outputDir}`);
}

// Extract sample key models
console.log('--- EXTRACTING KEY 3D MODELS (W3D.big) ---');
const keyModels = ['NVBtMstr.W3D', 'NVOvrlrd.W3D', 'NVNukeCn.W3D', 'avPaladin.W3D', 'AVComanche.W3D', 'avraptor.W3D', 'UVMarauder.W3D', 'UVLiteTank.W3D'];
extractFilesFromBig(
    'D:/C&C/generals_big_files/W3D.big',
    (p) => keyModels.some(km => p.toLowerCase().endsWith(km.toLowerCase())),
    'D:/C&C/extracted_models'
);
