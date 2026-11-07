const fs = require('fs');
const path = require('path');

const unitModelMap = {
    // USA
    crusader: 'AvHummer.W3D', // or avleopard / crusader
    paladin: 'avPaladin.W3D',
    humvee: 'CvHumVee.W3D',
    ambulance: 'AvAmbulance.W3D',
    tomahawk: 'avtomahawk.W3D',
    dozer: 'avconstdoz.W3D',
    truck: 'avpowtruck.W3D',
    chinook: 'AVChinook.W3D',
    comanche: 'AVComanche.W3D',
    raptor: 'avraptor.W3D',
    stealthfighter: 'avstealth.W3D',
    aurora: 'AVAurora.W3D',

    // China
    battlemaster: 'NVBtMstr.W3D',
    dragon: 'NVDragon.W3D',
    gatling: 'NVGattTank.W3D',
    crawler: 'NVTCrawler.W3D',
    overlord: 'NVOvrlrd.W3D',
    inferno: 'NVInferno.W3D',
    nukecannon: 'NVNukeCn.W3D',
    chinatruck: 'NVSSupplyTk.W3D',
    chinadozer: 'nvconstdoz_A.W3D',
    mig: 'NVMig.W3D',

    // GLA
    scorpion: 'UVLiteTank.W3D',
    marauder: 'UVMarauder.W3D',
    technical: 'UVTechTrck.W3D',
    quad: 'UVQuadCann.W3D',
    buggy: 'UVRockBug.W3D',
    toxintractor: 'UVToxinTrk.W3D',
    bombtruck: 'UVBmbtruk.W3D',
    scud: 'UVScudLchr.W3D',
    radarvan: 'UVRadarVan.W3D'
};

const w3dDir = 'D:/C&C/extracted_assets/w3d';
let found = 0, missing = 0;

for (const [key, file] of Object.entries(unitModelMap)) {
    const full = path.join(w3dDir, file);
    if (fs.existsSync(full)) {
        found++;
        console.log(`✓ ${key.padEnd(15)} -> ${file}`);
    } else {
        missing++;
        console.log(`✗ ${key.padEnd(15)} -> ${file} (NOT FOUND)`);
    }
}

console.log(`\nTotal verified: ${found}/${found + missing}`);
