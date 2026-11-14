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

// 4. Validate JavaScript syntax before saving
console.log('Validating JavaScript syntax with Node VM...');
try {
    new vm.Script(assembledJS);
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
