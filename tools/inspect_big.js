const fs = require('fs');
const path = require('path');

function readBigHeader(filePath) {
    const fd = fs.openSync(filePath, 'r');
    const headerBuf = Buffer.alloc(16);
    fs.readSync(fd, headerBuf, 0, 16, 0);

    const magic = headerBuf.toString('ascii', 0, 4);
    const fileSize = headerBuf.readUInt32LE(4);
    const numEntries = headerBuf.readUInt32BE(8);
    const tableSize = headerBuf.readUInt32BE(12);

    console.log(`\n--- Archive: ${path.basename(filePath)} ---`);
    console.log(`Magic: ${magic}`);
    console.log(`Reported File Size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Number of Entries: ${numEntries}`);
    console.log(`Table Size: ${tableSize} bytes`);

    // Read the table buffer
    const tableBuf = Buffer.alloc(tableSize);
    fs.readSync(fd, tableBuf, 0, tableSize, 16);

    const entries = [];
    let cursor = 0;
    for (let i = 0; i < numEntries; i++) {
        if (cursor + 8 > tableSize) break;
        const offset = tableBuf.readUInt32BE(cursor);
        const size = tableBuf.readUInt32BE(cursor + 4);
        cursor += 8;

        let endNull = cursor;
        while (endNull < tableSize && tableBuf[endNull] !== 0) {
            endNull++;
        }
        const entryPath = tableBuf.toString('ascii', cursor, endNull);
        cursor = endNull + 1;

        entries.push({ path: entryPath, offset, size });
    }

    fs.closeSync(fd);
    console.log(`Successfully parsed ${entries.length} entries.`);
    return entries;
}

const w3dEntries = readBigHeader('D:/C&C/generals_big_files/W3D.big');
const texEntries = readBigHeader('D:/C&C/generals_big_files/Textures.big');

console.log('\nSample W3D Models:');
console.log(w3dEntries.slice(0, 15).map(e => `  ${e.path} (${(e.size / 1024).toFixed(1)} KB)`).join('\n'));

console.log('\nSearching for key combat units in W3D:');
const keywords = ['crusader', 'paladin', 'overlord', 'battlemaster', 'nuke', 'raptor', 'comanche', 'scorpion', 'marauder'];
keywords.forEach(kw => {
    const matches = w3dEntries.filter(e => e.path.toLowerCase().includes(kw));
    console.log(`  Matches for '${kw}': ${matches.length} (e.g. ${matches.slice(0, 3).map(m => path.basename(m.path)).join(', ')})`);
});
