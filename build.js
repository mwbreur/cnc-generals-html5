/**
 * Build script for Command & Conquer: Generals HTML5 Edition
 * Assembles modular source files from src/ into standalone playable HTML games:
 *  1. D:/C&C/C&Cv0.0024.html (Versioned release)
 *  2. D:/C&C/index.html      (GitHub Pages root deployment)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const srcDir = path.join(__dirname, 'src');
const versionedOutput = path.join(__dirname, 'C&Cv0.0024.html');
const pagesOutput = path.join(__dirname, 'index.html');

console.log('=== Building C&C Generals HTML5 ===');
const startTime = Date.now();

// 1. Read Template, CSS, and HTML Body
const template = fs.readFileSync(path.join(srcDir, 'index_template.html'), 'utf8');
const css = fs.readFileSync(path.join(srcDir, 'css', 'style.css'), 'utf8');
const body = fs.readFileSync(path.join(srcDir, 'html', 'body.html'), 'utf8');

// 2. Read and stitch JS modules in sorted numerical order
const jsDir = path.join(srcDir, 'js');
const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort();

console.log(`Assembling ${jsFiles.length} JavaScript modules:`);
let assembledJS = '';
jsFiles.forEach(file => {
    const filePath = path.join(jsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    console.log(`  + ${file} (${(content.length / 1024).toFixed(1)} KB)`);
    assembledJS += `\n// --- MODULE: ${file} ---\n` + content + '\n';
});

// 3. Assemble the web build (safe replacement without $ pattern interpretation)
const webHtml = template
    .replace('/* {{CSS_CONTENT}} */', () => css)
    .replace('<!-- {{BODY_CONTENT}} -->', () => body)
    .replace('// {{JS_CONTENT}}', () => assembledJS);

// Keep the versioned file self-contained for offline use. The web build keeps
// audio external so it can load only shared + selected-faction catalogs.
const audioDir = path.join(srcDir, 'audio');
const embeddedAudio = {};
for (const group of ['global', 'usa', 'china', 'gla']) {
    embeddedAudio[group] = JSON.parse(fs.readFileSync(path.join(audioDir, `${group}.json`), 'utf8'));
}
const standaloneJS = `window.OFFICIAL_AUDIO_EMBEDDED = ${JSON.stringify(embeddedAudio)};\n` + assembledJS;
const standaloneHtml = template
    .replace('/* {{CSS_CONTENT}} */', () => css)
    .replace('<!-- {{BODY_CONTENT}} -->', () => body)
    .replace('// {{JS_CONTENT}}', () => standaloneJS);

// 4. Validate JavaScript syntax before saving
console.log('Validating JavaScript syntax with Node VM...');
try {
    new vm.Script(assembledJS);
    new vm.Script(standaloneJS);
    console.log('✓ Syntax validation PASSED for web and standalone builds (0 errors)');
} catch (err) {
    console.error('✗ Build FAILED due to syntax error in assembled JS:');
    console.error(err);
    process.exit(1);
}

// 5. Write Outputs
fs.writeFileSync(versionedOutput, standaloneHtml, 'utf8');
fs.writeFileSync(pagesOutput, webHtml, 'utf8');
const duration = Date.now() - startTime;
const webSizeKB = (webHtml.length / 1024).toFixed(1);
const standaloneSizeKB = (standaloneHtml.length / 1024).toFixed(1);

console.log(`✓ SUCCESS: Built ${versionedOutput}`);
console.log(`✓ SUCCESS: Built ${pagesOutput} (Ready for GitHub Pages!)`);
console.log(`  Web build: ${webSizeKB} KB | Standalone: ${standaloneSizeKB} KB | Build time: ${duration}ms`);
