const fs = require('fs');

const fd = fs.openSync('D:/C&C/generals_big_files/W3D.big', 'r');
const headerBuf = Buffer.alloc(16);
fs.readSync(fd, headerBuf, 0, 16, 0);
const tableSize = headerBuf.readUInt32BE(12);
const numEntries = headerBuf.readUInt32BE(8);

const tableBuf = Buffer.alloc(tableSize);
fs.readSync(fd, tableBuf, 0, tableSize, 16);
fs.closeSync(fd);

let cursor = 0;
const paths = [];
for (let i = 0; i < numEntries; i++) {
    if (cursor + 8 > tableSize) break;
    cursor += 8;
    let endNull = cursor;
    while (endNull < tableSize && tableBuf[endNull] !== 0) endNull++;
    paths.push(tableBuf.toString('ascii', cursor, endNull));
    cursor = endNull + 1;
}

const infantryKeywords = ['ranger', 'burt', 'path', 'lotus', 'hack', 'redg', 'jarmen', 'rebel', 'terror', 'rpg', 'worker', 'dozer', 'colonel'];
infantryKeywords.forEach(kw => {
    const hits = paths.filter(p => p.toLowerCase().includes(kw)).map(p => p.split('\\').pop());
    console.log(`Hits for '${kw}':`, [...new Set(hits)].slice(0, 10).join(', '));
});
