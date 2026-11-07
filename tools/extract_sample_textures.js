const fs = require('fs');
const path = require('path');

function extractMatchingTextures() {
    const needed = ['avpaladin', 'avcomanche', 'avraptor', 'nvbtmstr', 'nvnukecn', 'nvovrlrd', 'nvtreads', 'housecolor'];

    const fd = fs.openSync('D:/C&C/generals_big_files/Textures.big', 'r');
    const headerBuf = Buffer.alloc(16);
    fs.readSync(fd, headerBuf, 0, 16, 0);

    const numEntries = headerBuf.readUInt32BE(8);
    const tableSize = headerBuf.readUInt32BE(12);

    const tableBuf = Buffer.alloc(tableSize);
    fs.readSync(fd, tableBuf, 0, tableSize, 16);

    let cursor = 0;
    const matches = [];

    for (let i = 0; i < numEntries; i++) {
        if (cursor + 8 > tableSize) break;
        const offset = tableBuf.readUInt32BE(cursor);
        const size = tableBuf.readUInt32BE(cursor + 4);
        cursor += 8;

        let endNull = cursor;
        while (endNull < tableSize && tableBuf[endNull] !== 0) endNull++;
        const p = tableBuf.toString('ascii', cursor, endNull);
        cursor = endNull + 1;

        const base = path.basename(p).toLowerCase();
        if (needed.some(n => base.includes(n))) {
            matches.push({ path: p, offset, size, base });
        }
    }

    console.log(`Found ${matches.length} matching textures in Textures.big:`);
    matches.slice(0, 15).forEach(m => console.log(`  ${m.base} (${(m.size / 1024).toFixed(1)} KB)`));

    // Extract a few sample textures
    const outDir = 'D:/C&C/extracted_models/textures';
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    matches.slice(0, 10).forEach(m => {
        const buf = Buffer.alloc(m.size);
        fs.readSync(fd, buf, 0, m.size, m.offset);
        fs.writeFileSync(path.join(outDir, m.base), buf);
    });

    fs.closeSync(fd);
    console.log(`Extracted sample textures into ${outDir}`);
}

extractMatchingTextures();
