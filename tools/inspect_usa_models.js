const fs = require('fs');
const path = require('path');
const { parseW3dModel } = require('./parse_w3d_clean');
const w3dDir = path.join(__dirname, '..', 'extracted_assets', 'w3d');

const usaFiles = [
    'avleopard.W3D', 'avPaladin.W3D', 'AvHummer.W3D', 'AvAmbulance.W3D',
    'avtomahawk.W3D', 'avconstdoz.W3D', 'AVChinook.W3D', 'AVComanche.W3D',
    'avraptor.W3D', 'avstealth.W3D', 'AVAurora.W3D', 'avbattledr.W3D', 'avscoutdr.W3D',
    'ABBtCmdHQ.W3D', 'ABPWRPLANT.W3D', 'ABBARRACKS.W3D', 'ABWarFact.W3D',
    'ABSUPPLYCT.W3D', 'ABSupDrop.W3D', 'ABArFrcCmd.W3D', 'ABStrategy.W3D',
    'ABPATRIOT.W3D', 'ABSDILink.W3D', 'ABPrison.W3D', 'ZBSupplyDk.W3D', 'ZBSupplyDk_B.W3D'
];

usaFiles.forEach(file => {
    const p = parseW3dModel(path.join(w3dDir, file));
    if (!p) { console.log('Missing:', file); return; }
    console.log('===', file, '===');
    Object.entries(p.meshes).forEach(([name, m]) => {
        let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
        for (let i = 0; i < m.v.length; i += 3) {
            minX = Math.min(minX, m.v[i]); maxX = Math.max(maxX, m.v[i]);
            minY = Math.min(minY, m.v[i+1]); maxY = Math.max(maxY, m.v[i+1]);
            minZ = Math.min(minZ, m.v[i+2]); maxZ = Math.max(maxZ, m.v[i+2]);
        }
        console.log('  ', name, 'tex:', m.tex, 'faces:', m.i.length / 3, 'Y:[' + minY.toFixed(1) + ',' + maxY.toFixed(1) + '] X:[' + minX.toFixed(1) + ',' + maxX.toFixed(1) + '] Z:[' + minZ.toFixed(1) + ',' + maxZ.toFixed(1) + ']');
    });
});
