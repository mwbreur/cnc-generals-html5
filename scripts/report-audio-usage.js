#!/usr/bin/env node
'use strict';

/**
 * Best-effort inventory of literal audio IDs referenced by gameplay code.
 *
 * Usage:
 *   node scripts/report-audio-usage.js
 *   node scripts/report-audio-usage.js --json
 *
 * This script does not decode, extract, or modify audio. Dynamic sound IDs
 * and references assembled at runtime are reported separately for review.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceDirectory = path.join(root, 'src', 'js');
const functionNames = ['playAudio', 'playOfficialSound', 'playMusic', 'playSound'];
const calls = Object.fromEntries(functionNames.map(name => [name, {}]));
const dynamicCalls = [];
const sourceFiles = [];

function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            walk(absolutePath);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            sourceFiles.push(absolutePath);
        }
    }
}

function lineAt(source, offset) {
    let line = 1;
    for (let i = 0; i < offset; i++) {
        if (source.charCodeAt(i) === 10) line++;
    }
    return line;
}

function readLiteral(source, offset) {
    let cursor = offset;
    while (/\s/.test(source[cursor] || '')) cursor++;
    const quote = source[cursor];
    if (quote !== "'" && quote !== '"') return null;

    let value = '';
    cursor++;
    while (cursor < source.length) {
        const char = source[cursor++];
        if (char === quote) return value;
        if (char === '\\' && cursor < source.length) {
            const escaped = source[cursor++];
            value += escaped === 'n' ? '\n' : escaped === 't' ? '\t' : escaped;
        } else {
            value += char;
        }
    }
    return null;
}

walk(sourceDirectory);
sourceFiles.sort();

for (const absolutePath of sourceFiles) {
    const source = fs.readFileSync(absolutePath, 'utf8');
    const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');

    for (const functionName of functionNames) {
        const pattern = new RegExp('\\b' + functionName + '\\s*\\(', 'g');
        let match;
        while ((match = pattern.exec(source)) !== null) {
            const before = source.slice(Math.max(0, match.index - 24), match.index);
            if (/\bfunction\s*$/.test(before)) continue; // Skip function declarations.

            const id = readLiteral(source, pattern.lastIndex);
            const line = lineAt(source, match.index);
            if (id) {
                if (!calls[functionName][id]) calls[functionName][id] = [];
                calls[functionName][id].push({ file: relativePath, line });
            } else {
                dynamicCalls.push({ function: functionName, file: relativePath, line });
            }
        }
    }
}

const audioDataFiles = sourceFiles
    .filter(file => /audio|sound|music/i.test(path.basename(file)))
    .map(file => ({
        file: path.relative(root, file).split(path.sep).join('/'),
        bytes: fs.statSync(file).size
    }))
    .sort((a, b) => b.bytes - a.bytes);

const report = {
    note: 'Best-effort static scan. Review dynamic calls and verify every ID against the audio data before extraction.',
    sourceFilesScanned: sourceFiles.length,
    literalIds: Object.fromEntries(
        Object.entries(calls).map(([name, entries]) => [
            name,
            Object.entries(entries)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([id, references]) => ({ id, references }))
        ])
    ),
    dynamicCalls,
    audioDataFiles
};

if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
    console.log('Skirmish audio reference inventory');
    console.log('==================================');
    console.log('JavaScript files scanned: ' + report.sourceFilesScanned);
    console.log('');

    for (const [functionName, entries] of Object.entries(report.literalIds)) {
        console.log(functionName + ' (' + entries.length + ' literal IDs)');
        for (const entry of entries) {
            const locations = entry.references
                .map(ref => ref.file + ':' + ref.line)
                .join(', ');
            console.log('  ' + entry.id + '  [' + locations + ']');
        }
        console.log('');
    }

    console.log('Dynamic calls requiring manual review: ' + dynamicCalls.length);
    for (const entry of dynamicCalls) {
        console.log('  ' + entry.function + '  ' + entry.file + ':' + entry.line);
    }
    console.log('');
    console.log('Audio-related source files:');
    for (const file of audioDataFiles) {
        console.log('  ' + (file.bytes / (1024 * 1024)).toFixed(2) + ' MB  ' + file.file);
    }
    console.log('');
    console.log(report.note);
}
