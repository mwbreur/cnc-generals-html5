/**
 * Static JS Linter for C&C Generals HTML5 Edition
 * Catches cross-module duplicate declarations (which silently override in concatenated builds)
 * and unclosed module brace/scope leaks without external dependencies.
 */
const fs = require('fs');
const path = require('path');

const jsDir = path.join(__dirname, '..', 'src', 'js');

function lintModules() {
    const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort();
    const errors = [];
    const topFuncs = new Map();
    const topLexicals = new Map();

    for (const file of files) {
        const lines = fs.readFileSync(path.join(jsDir, file), 'utf8').split(/\r?\n/);
        let depth = 0;
        let inBlockComment = false;
        let inTemplate = false;
        const templateBraceDepths = [];

        for (let li = 0; li < lines.length; li++) {
            const raw = lines[li];
            const trimmed = raw.trim();

            if (!inBlockComment && !(inTemplate && templateBraceDepths.length === 0) && depth === 0 && trimmed) {
                const fnMatch = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(trimmed);
                if (fnMatch) {
                    const name = fnMatch[1];
                    const loc = `${file}:${li + 1}`;
                    if (topFuncs.has(name)) {
                        errors.push(`Duplicate top-level function "${name}" at ${loc} (first defined at ${topFuncs.get(name)})`);
                    } else {
                        topFuncs.set(name, loc);
                    }
                }
                const lexMatch = /^(let|const|class)\s+([A-Za-z_$][\w$]*)\b/.exec(trimmed);
                if (lexMatch) {
                    const name = lexMatch[2];
                    const loc = `${file}:${li + 1}`;
                    if (topLexicals.has(name)) {
                        errors.push(`Duplicate top-level ${lexMatch[1]} "${name}" at ${loc} (first declared at ${topLexicals.get(name)})`);
                    } else {
                        topLexicals.set(name, loc);
                    }
                }
            }

            let i = 0;
            let inSingle = false;
            let inDouble = false;
            let prevNonSpace = '';
            while (i < raw.length) {
                const ch = raw[i];
                const next = raw[i + 1];

                if (inBlockComment) {
                    if (ch === '*' && next === '/') { inBlockComment = false; i += 2; continue; }
                    i++;
                    continue;
                }
                if (inSingle) {
                    if (ch === '\\') { i += 2; continue; }
                    if (ch === "'") inSingle = false;
                    i++;
                    continue;
                }
                if (inDouble) {
                    if (ch === '\\') { i += 2; continue; }
                    if (ch === '"') inDouble = false;
                    i++;
                    continue;
                }
                if (inTemplate && templateBraceDepths.length === 0) {
                    if (ch === '\\') { i += 2; continue; }
                    if (ch === '`') { inTemplate = false; i++; continue; }
                    if (ch === '$' && next === '{') {
                        templateBraceDepths.push(depth);
                        depth++;
                        i += 2;
                        continue;
                    }
                    i++;
                    continue;
                }

                if (ch === '/' && next === '/') break;
                if (ch === '/' && next === '*') { inBlockComment = true; i += 2; continue; }
                if (ch === "'") { inSingle = true; prevNonSpace = ch; i++; continue; }
                if (ch === '"') { inDouble = true; prevNonSpace = ch; i++; continue; }
                if (ch === '`') { inTemplate = true; i++; continue; }
                if (ch === '/' && (!prevNonSpace || '(=[,;:!&|?{}~^+-*%<>'.includes(prevNonSpace))) {
                    let rj = i + 1;
                    let inClass = false;
                    let foundEnd = false;
                    while (rj < raw.length) {
                        if (raw[rj] === '\\') { rj += 2; continue; }
                        if (raw[rj] === '[') inClass = true;
                        else if (raw[rj] === ']') inClass = false;
                        else if (raw[rj] === '/' && !inClass) { foundEnd = true; break; }
                        rj++;
                    }
                    if (foundEnd) { i = rj + 1; prevNonSpace = '/'; continue; }
                }

                if (ch === '{' || ch === '[' || ch === '(') {
                    depth++;
                } else if (ch === '}' || ch === ']' || ch === ')') {
                    depth--;
                    if (depth < 0) {
                        errors.push(`Unmatched closing "${ch}" in ${file}:${li + 1}`);
                        depth = 0;
                    } else if (ch === '}' && templateBraceDepths.length > 0 && depth === templateBraceDepths[templateBraceDepths.length - 1]) {
                        templateBraceDepths.pop();
                    }
                }
                if (ch !== ' ' && ch !== '\t') prevNonSpace = ch;
                i++;
            }
        }

        if (depth !== 0 || inBlockComment || inTemplate) {
            errors.push(`Module ${file} ended with unclosed state (depth=${depth}, blockComment=${inBlockComment}, template=${inTemplate})`);
        }
    }

    return { filesChecked: files.length, funcCount: topFuncs.size, errors };
}

if (require.main === module) {
    const res = lintModules();
    if (res.errors.length > 0) {
        console.error('✗ JS Lint FAILED:');
        res.errors.forEach(e => console.error('  -', e));
        process.exit(1);
    }
    console.log(`✓ JS Lint PASSED (${res.filesChecked} modules, ${res.funcCount} top-level functions, 0 duplicates/leaks)`);
}

module.exports = { lintModules };
