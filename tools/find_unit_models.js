const fs = require('fs');

function inspectVehicleNames() {
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
        const offset = tableBuf.readUInt32BE(cursor);
        const size = tableBuf.readUInt32BE(cursor + 4);
        cursor += 8;
        let endNull = cursor;
        while (endNull < tableSize && tableBuf[endNull] !== 0) endNull++;
        const p = tableBuf.toString('ascii', cursor, endNull);
        cursor = endNull + 1;
        paths.push(p);
    }

    console.log('--- America Vehicles (AV*.W3D) ---');
    console.log([...new Set(paths.filter(p => /art\\w3d\\av[a-z0-9_]+\.w3d$/i.test(p)).map(p => p.split('\\').pop()))].slice(0, 30).join(', '));

    console.log('\n--- China Vehicles (NV*.W3D) ---');
    console.log([...new Set(paths.filter(p => /art\\w3d\\nv[a-z0-9_]+\.w3d$/i.test(p)).map(p => p.split('\\').pop()))].slice(0, 30).join(', '));

    console.log('\n--- GLA Vehicles (UV*.W3D) ---');
    console.log([...new Set(paths.filter(p => /art\\w3d\\uv[a-z0-9_]+\.w3d$/i.test(p)).map(p => p.split('\\').pop()))].slice(0, 30).join(', '));

    console.log('\n--- Buildings (AB*, NB*, UB*) ---');
    const bldgs = paths.filter(p => /art\\w3d\\[anu]b[a-z0-9_]+\.w3d$/i.test(p)).map(p => p.split('\\').pop());
    console.log('Sample Buildings:', [...new Set(bldgs)].slice(0, 20).join(', '));
}

inspectVehicleNames();
