const { convertW3d } = require('./test_batch_converter');

function checkRotations(w3dFile) {
    const data = convertW3d(w3dFile);
    console.log('Rotations for:', data.name);
    data.pivots.forEach(p => {
        if (Math.abs(p.rotation[0]) > 0.001 || Math.abs(p.rotation[1]) > 0.001 || Math.abs(p.rotation[2]) > 0.001 || Math.abs(p.rotation[3] - 1.0) > 0.001) {
            console.log(`  [${p.index}] ${p.name}: rot = [${p.rotation.join(', ')}]`);
        }
    });
}

checkRotations('extracted_assets/w3d/NVBtMstr.W3D');
checkRotations('extracted_assets/w3d/avPaladin.W3D');
checkRotations('extracted_assets/w3d/NVOvrlrd.W3D');
checkRotations('extracted_assets/w3d/AVComanche.W3D');
