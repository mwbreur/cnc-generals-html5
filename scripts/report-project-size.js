#!/usr/bin/env node
'use strict';

/**
 * Reports repository file sizes to help identify oversized source modules
 * and generated outputs before changing the asset pipeline.
 *
 * Usage:
 *   node scripts/report-project-size.js
 *   node scripts/report-project-size.js --json
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ignoredDirectories = new Set(['.git', 'node_modules']);
const generatedNames = new Set(['index.html', 'C&Cv0.0024.html']);
const files = [];

function walk(directory) {
    let entries;
    try {
        entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (error) {
        if (error.code === 'ENOENT') return;
        throw error;
    }

    for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.github') continue;
        if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            walk(absolutePath);
        } else if (entry.isFile()) {
            const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
            const bytes = fs.statSync(absolutePath).size;
            files.push({ path: relativePath, bytes });
        }
    }
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

walk(root);
files.sort((a, b) => b.bytes - a.bytes);

const sourceFiles = files.filter(file => file.path.startsWith('src/'));
const generatedFiles = files.filter(file => generatedNames.has(file.path));
const largeJavaScript = sourceFiles.filter(file => file.path.endsWith('.js') && file.bytes >= 1024 * 1024);
const total = list => list.reduce((sum, file) => sum + file.bytes, 0);

const report = {
    scannedAt: new Date().toISOString(),
    totals: {
        repositoryFiles: files.length,
        sourceFiles: sourceFiles.length,
        sourceBytes: total(sourceFiles),
        generatedBytes: total(generatedFiles)
    },
    largestFiles: files.slice(0, 20),
    largeJavaScriptModules: largeJavaScript
};

if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
    console.log('Project size report');
    console.log('===================');
    console.log(`Files scanned: ${report.totals.repositoryFiles}`);
    console.log(`Source files:  ${report.totals.sourceFiles} (${formatBytes(report.totals.sourceBytes)})`);
    console.log(`Generated HTML: ${formatBytes(report.totals.generatedBytes)}`);
    console.log('');
    console.log('Largest files:');
    for (const file of report.largestFiles) {
        console.log(`  ${formatBytes(file.bytes).padStart(10)}  ${file.path}`);
    }
    console.log('');
    if (largeJavaScript.length) {
        console.log('JavaScript modules at least 1 MB (review for external asset extraction):');
        for (const file of largeJavaScript) {
            console.log(`  ${formatBytes(file.bytes).padStart(10)}  ${file.path}`);
        }
    } else {
        console.log('No JavaScript source modules at least 1 MB were found.');
    }
    console.log('');
    console.log('Note: these are on-disk byte sizes, not compressed network transfer sizes.');
}

if (largeJavaScript.length) {
    process.exitCode = 0;
}
