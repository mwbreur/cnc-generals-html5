const fs = require('fs');

const files = fs.readdirSync('D:/C&C/extracted_assets/w3d');
const amTanks = files.filter(f => /^av.*tank.*\.w3d$/i.test(f) || /^av.*crus.*\.w3d$/i.test(f) || /^av.*mbt.*\.w3d$/i.test(f));
console.log('America Tank files:', amTanks);

const allAv = files.filter(f => /^av[a-z0-9]+\.w3d$/i.test(f));
console.log('All AV base files:', allAv);
