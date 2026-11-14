const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const catalogDir = path.join(root, 'src', 'audio');
const factions = {
    usa: ['crusader','paladin','ranger','rocket','humvee','comanche','chinook','raptor','stealthfighter','aurora','tomahawk','dozer_usa','burton','pathfinder','ambulance','dozer'],
    china: ['battlemaster','overlord','gatling','dragon','crawler','inferno','nukecannon','dozer_china','mig','redguard','tankhunter','hacker','lotus'],
    gla: ['rebel','rpg','terrorist','jarmen','worker','scorpion','marauder','technical','quad','buggy','toxintractor','bombtruck','scud','radarvan','mob','hijacker']
};

function loadCatalog() {
    const catalog = {};
    for (const group of ['global', 'usa', 'china', 'gla']) {
        const file = path.join(catalogDir, `${group}.json`);
        catalog[group] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    }
    return catalog;
}

function groupFor(key) {
    if (key.startsWith('sfx_')) return 'global';
    for (const faction of Object.keys(factions)) {
        if (key.includes(`_${faction}_`) || factions[faction].some(unit => key.startsWith(`voice_${unit}_`))) return faction;
    }
    throw new Error(`Cannot assign audio key to a catalog: ${key}`);
}

function writeAudioCatalog(additions) {
    const catalog = loadCatalog();
    for (const [key, data] of Object.entries(additions)) catalog[groupFor(key)][key] = data;
    fs.mkdirSync(catalogDir, { recursive: true });
    for (const [group, entries] of Object.entries(catalog)) {
        fs.writeFileSync(path.join(catalogDir, `${group}.json`), `${JSON.stringify(entries)}\n`);
    }
    return Object.fromEntries(Object.entries(catalog).map(([group, entries]) => [group, Object.keys(entries).length]));
}

module.exports = { loadCatalog, writeAudioCatalog };
