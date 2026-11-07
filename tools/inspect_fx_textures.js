const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '../src/js/02b_w3d_models.js'), 'utf8');

function searchTex(term) {
    const regex = new RegExp('"([a-zA-Z0-9_.-]+)":\\{[^}]*"tex":"([^"]*' + term + '[^"]*)"', 'gi');
    let m;
    while ((m = regex.exec(content)) !== null) {
        console.log(m[1], '=>', m[2]);
    }
}

console.log('=== lightbeam ===');
searchTex('lightbeam');
console.log('=== extnkmzl ===');
searchTex('extnkmzl');
console.log('=== night / shadow / beam ===');
searchTex('beam');
searchTex('shadow');
