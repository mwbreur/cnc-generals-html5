const fs = require('fs');
const path = require('path');

function extractBigArchive(bigPath, outputDir) {
    console.log(`\nStarting extraction of: ${path.basename(bigPath)} ...`);
    const startTime = Date.now();

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
    let totalBytes = 0;

    for (let i = 0; i < numEntries; i++) {
        if (cursor + 8 > tableSize) break;
        const offset = tableBuf.readUInt32BE(cursor);
        const size = tableBuf.readUInt32BE(cursor + 4);
        cursor += 8;

        let endNull = cursor;
        while (endNull < tableSize && tableBuf[endNull] !== 0) endNull++;
        const entryPath = tableBuf.toString('ascii', cursor, endNull);
        cursor = endNull + 1;

        if (size > 0) {
            const fileBuf = Buffer.alloc(size);
            fs.readSync(fd, fileBuf, 0, size, offset);

            const filename = path.basename(entryPath);
            const outPath = path.join(outputDir, filename);
            fs.writeFileSync(outPath, fileBuf);
            extractedCount++;
            totalBytes += size;
        }

        if (i > 0 && i % 1000 === 0) {
            console.log(`  Processed ${i} / ${numEntries} entries...`);
        }
    }

    fs.closeSync(fd);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✓ Completed: Extracted ${extractedCount} files (${(totalBytes / (1024 * 1024)).toFixed(1)} MB) in ${duration}s into ${outputDir}`);
}

const w3dDir = 'D:/C&C/extracted_assets/w3d';
const texDir = 'D:/C&C/extracted_assets/textures';

extractBigArchive('D:/C&C/generals_big_files/W3D.big', w3dDir);
extractBigArchive('D:/C&C/generals_big_files/Textures.big', texDir);
