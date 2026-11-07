const fs = require('fs');
const { convertW3d } = require('./test_batch_converter.js');

// Test bounding box
function getBounds(modelData) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    Object.values(modelData.meshes).forEach(m => {
        if (!m.vertices) return;
        for (let i = 0; i < m.vertices.length; i += 3) {
            const x = m.vertices[i];
            const y = m.vertices[i+1];
            const z = m.vertices[i+2];
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
    });

    return {
        sizeX: (maxX - minX).toFixed(2),
        sizeY: (maxY - minY).toFixed(2),
        sizeZ: (maxZ - minZ).toFixed(2),
        scaleToFitLength4: (4.0 / (maxZ - minZ || maxX - minX)).toFixed(4)
    };
}

const testModels = ['NVBtMstr.W3D', 'avPaladin.W3D', 'NVOvrlrd.W3D', 'NVNukeCn.W3D', 'AVComanche.W3D', 'avraptor.W3D', 'UVMarauder.W3D'];
testModels.forEach(m => {
    const res = convertW3d('D:/C&C/extracted_assets/w3d/' + m);
    if (res) {
        const bounds = getBounds(res);
        console.log(`${m}: Size = [${bounds.sizeX}, ${bounds.sizeY}, ${bounds.sizeZ}] -> Suggested Scale Factor: ${bounds.scaleToFitLength4}`);
    }
});
