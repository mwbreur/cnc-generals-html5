/**
 * Build script for Command & Conquer: Generals HTML5 Edition
 * Assembles the modular source files into index.html for GitHub Pages.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const srcDir = path.join(__dirname, 'src');
const pagesOutput = path.join(__dirname, 'index.html');

console.log('=== Building C&C Generals HTML5 ===');
const startTime = Date.now();

// 1. Read Template, CSS, and HTML Body
const template = fs.readFileSync(path.join(srcDir, 'index_template.html'), 'utf8');
const css = fs.readFileSync(path.join(srcDir, 'css', 'style.css'), 'utf8');
const body = fs.readFileSync(path.join(srcDir, 'html', 'body.html'), 'utf8');

// 2. Read and stitch JS modules in sorted numerical order (externalizing heavy data blobs for browser caching)
const jsDir = path.join(srcDir, 'js');
const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort();
const EXTERNAL_DATA_FILES = new Set(['02b_w3d_models.js', '07b_tournament_desert.js', '10b_cameos.js']);
const dataOutDir = path.join(__dirname, 'assets', 'data');
if (!fs.existsSync(dataOutDir)) fs.mkdirSync(dataOutDir, { recursive: true });

console.log(`Assembling ${jsFiles.length} JavaScript modules:`);
let assembledJS = '';
let fullSyntaxCheckJS = '';
const externalTags = [];
jsFiles.forEach(file => {
    const filePath = path.join(jsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    fullSyntaxCheckJS += `\n// --- MODULE: ${file} ---\n` + content + '\n';
    if (EXTERNAL_DATA_FILES.has(file)) {
        fs.writeFileSync(path.join(dataOutDir, file), content, 'utf8');
        externalTags.push(`<script src="assets/data/${file}"></script>`);
        console.log(`  ~ ${file} (${(content.length / 1024).toFixed(1)} KB -> cached assets/data/${file})`);
    } else {
        console.log(`  + ${file} (${(content.length / 1024).toFixed(1)} KB)`);
        assembledJS += `\n// --- MODULE: ${file} ---\n` + content + '\n';
    }
});

// 3. Assemble the web build (safe replacement without $ pattern interpretation)
const webHtml = template
    .replace('/* {{CSS_CONTENT}} */', () => css)
    .replace('<!-- {{BODY_CONTENT}} -->', () => body)
    .replace('<script>\n// {{JS_CONTENT}}', () => `${externalTags.join('\n')}\n<script>\n// {{JS_CONTENT}}`)
    .replace('// {{JS_CONTENT}}', () => assembledJS);

// 4. Validate JavaScript syntax before saving
console.log('Validating JavaScript syntax with Node VM...');
try {
    new vm.Script(fullSyntaxCheckJS);
    console.log('✓ Syntax validation PASSED for the web build (0 errors)');
} catch (err) {
    console.error('✗ Build FAILED due to syntax error in assembled JS:');
    console.error(err);
    process.exit(1);
}

// 5. Write the GitHub Pages output
fs.writeFileSync(pagesOutput, webHtml, 'utf8');
const duration = Date.now() - startTime;
const webSizeKB = (webHtml.length / 1024).toFixed(1);

console.log(`✓ SUCCESS: Built ${pagesOutput} (Ready for GitHub Pages!)`);
console.log(`  Web build: ${webSizeKB} KB | Build time: ${duration}ms`);
