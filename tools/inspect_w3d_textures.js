const fs = require('fs');

function inspectW3dTextures(filePath) {
    const buf = fs.readFileSync(filePath);
    // Find all .tga or .dds strings in the binary
    const str = buf.toString('latin1');
    const matches = str.match(/[a-zA-Z0-9_\-\\]+\.(?:tga|dds)/gi) || [];
    console.log(`Textures referenced by ${filePath.split('\\').pop()}:`, [...new Set(matches)]);
}

['AVComanche.W3D', 'avPaladin.W3D', 'avraptor.W3D', 'NVBtMstr.W3D', 'NVNukeCn.W3D', 'NVOvrlrd.W3D'].forEach(f => {
    inspectW3dTextures('D:/C&C/extracted_models/' + f);
});
