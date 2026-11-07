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

const infCandidates = paths.filter(p => /art\\w3d\\[acnu]i/i.test(p)).map(p => p.split('\\').pop());
console.log('Infantry candidates ([ACNU]I*):', [...new Set(infCandidates)].slice(0, 30).join(', '));
