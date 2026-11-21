/**
 * Build script for Command & Conquer: Generals HTML5 Edition
 * Assembles the modular source files into index.html for GitHub Pages.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const srcDir = path.join(__dirname, 'src');
const pagesOutput = path.join(__dirname, 'index.html');

console.log('=== Building C&C Generals HTML5 ===');
const startTime = Date.now();

// 1. Read Template, CSS, and HTML Body
const template = fs.readFileSync(path.join(srcDir, 'index_template.html'), 'utf8');
for (const marker of ['/* {{CSS_CONTENT}} */', '<!-- {{BODY_CONTENT}} -->', '// {{JS_CONTENT}}']) {
    if (!template.includes(marker)) {
        throw new Error(`Missing required template placeholder ${marker} in src/index_template.html`);
    }
}
const css = fs.readFileSync(path.join(srcDir, 'css', 'style.css'), 'utf8');
const body = fs.readFileSync(path.join(srcDir, 'html', 'body.html'), 'utf8');

// 2. Read and stitch JS modules in sorted numerical order (externalizing heavy data blobs for browser caching)
const jsDir = path.join(srcDir, 'js');
const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort();
const EXTERNAL_DATA_FILES = new Set(['02b_w3d_models.js', '07b_tournament_desert.js', '10b_cameos.js']);
const dataOutDir = path.join(__dirname, 'assets', 'data');
fs.rmSync(dataOutDir, { recursive: true, force: true });
fs.mkdirSync(dataOutDir, { recursive: true });

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
        const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
        externalTags.push(`<script src="assets/data/${file}?v=${hash}"></script>`);
        console.log(`  ~ ${file} (${(content.length / 1024).toFixed(1)} KB -> cached assets/data/${file}?v=${hash})`);
    } else {
        console.log(`  + ${file} (${(content.length / 1024).toFixed(1)} KB)`);
        assembledJS += `\n// --- MODULE: ${file} ---\n` + content + '\n';
    }
});

// 3. Assemble the web build (CRLF-safe replacement without $ pattern interpretation)
const scriptAnchorRe = /<script>\r?\n\/\/ \{\{JS_CONTENT\}\}/;
if (!scriptAnchorRe.test(template)) {
    console.error('✗ Build FAILED: template missing <script>\\n// {{JS_CONTENT}} anchor!');
    process.exit(1);
}
const webHtml = template
    .replace('/* {{CSS_CONTENT}} */', () => css)
    .replace('<!-- {{BODY_CONTENT}} -->', () => body)
    .replace(scriptAnchorRe, () => `${externalTags.join('\n')}\n<script>\n// {{JS_CONTENT}}`)
    .replace('// {{JS_CONTENT}}', () => assembledJS);

// 4. Static lint & JavaScript syntax validation before saving
const { lintModules } = require('./tools/lint_js');
const lintRes = lintModules();
if (lintRes.errors.length > 0) {
    console.error('✗ Build FAILED due to JS lint errors:');
    lintRes.errors.forEach(e => console.error('  -', e));
    process.exit(1);
}
console.log(`✓ JS Lint PASSED (${lintRes.filesChecked} modules, ${lintRes.funcCount} top-level functions, 0 duplicates/leaks)`);

console.log('Validating JavaScript syntax with Node VM...');
try {
    new vm.Script(fullSyntaxCheckJS);
    console.log('✓ Syntax validation PASSED for the web build (0 errors)');
} catch (err) {
    console.error('✗ Build FAILED due to syntax error in assembled JS:');
    console.error(err);
    process.exit(1);
}

// 5. Write the GitHub Pages output and verify generated assets/data directory integrity
fs.writeFileSync(pagesOutput, webHtml, 'utf8');
const actualDataFiles = fs.readdirSync(dataOutDir).sort();
const expectedDataFiles = Array.from(EXTERNAL_DATA_FILES).sort();
if (actualDataFiles.length !== expectedDataFiles.length || actualDataFiles.some((f, i) => f !== expectedDataFiles[i])) {
    console.error(`✗ Build FAILED: unexpected files in assets/data: ${JSON.stringify(actualDataFiles)}`);
    process.exit(1);
}
for (const df of actualDataFiles) {
    const sz = fs.statSync(path.join(dataOutDir, df)).size;
    if (sz < 1024) {
        console.error(`✗ Build FAILED: generated assets/data/${df} is unexpectedly small (${sz} bytes)`);
        process.exit(1);
    }
}
const duration = Date.now() - startTime;
const webSizeKB = (webHtml.length / 1024).toFixed(1);

console.log(`✓ SUCCESS: Built ${pagesOutput} (Ready for GitHub Pages!)`);
console.log(`  Web build: ${webSizeKB} KB | External bundles: ${actualDataFiles.join(', ')} | Build time: ${duration}ms`);
