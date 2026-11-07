const { convertW3d } = require('./test_batch_converter');

function testAssembly(w3dFile) {
    const data = convertW3d(w3dFile);
    console.log('=== Testing Assembly for:', data.name, '===');
    console.log('Pivots:', data.pivots.length);
    console.log('HLOD Sub-objects:', data.hlodSubObjects.length);
    
    data.pivots.forEach(p => {
        const parentName = p.parentIndex >= 0 ? data.pivots[p.parentIndex].name : 'ROOT';
        const submeshes = data.hlodSubObjects.filter(h => h.boneIndex === p.index).map(h => h.name);
        if (submeshes.length > 0 || p.name.includes('TURRET') || p.name.includes('BARREL') || p.name.includes('ROTOR')) {
            console.log(`Pivot [${p.index}] "${p.name}" (parent: ${parentName}) -> Meshes: [${submeshes.join(', ')}]`);
        }
    });
}

testAssembly('extracted_assets/w3d/NVBtMstr.W3D');
testAssembly('extracted_assets/w3d/avPaladin.W3D');
testAssembly('extracted_assets/w3d/AVComanche.W3D');
