const fs = require('fs');
let c = fs.readFileSync('D:/C&C/src/js/11_sidebar.js', 'utf8');

const target = "function renderCommandGrid(container, slots) {";

const replacement = `function getCameoImg(id, name) {
    const rawKey = (id || name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cameoMap = {
        'crusader': 'crusader',
        'tank': 'crusader',
        'paladin': 'paladin',
        'humvee': 'humvee',
        'ambulance': 'ambulance',
        'tomahawk': 'tomahawk',
        'dozer': 'dozer',
        'chinook': 'chinook',
        'comanche': 'comanche',
        'raptor': 'raptor',
        'stealthfighter': 'stealthFighter',
        'stealth': 'stealthFighter',
        'aurora': 'aurora',
        'ranger': 'ranger',
        'infantry': 'ranger',
        'missiledefender': 'missileDefender',
        'rocket': 'missileDefender',
        'burton': 'burton',
        'colonelburton': 'burton',
        'battle_drone': 'drone_battle',
        'battledrone': 'drone_battle',
        'scout_drone': 'drone_scout',
        'scoutdrone': 'drone_scout',
        'center': 'commandCenter',
        'commandcenter': 'commandCenter',
        'power': 'power',
        'barracks': 'barracks',
        'factory': 'factory',
        'warfactory': 'factory',
        'supplycenter': 'supplyCenter',
        'supply': 'supplyCenter',
        'airfield': 'airfield',
        'patriot': 'patriot',
        'strategy': 'strategyCenter',
        'strategycenter': 'strategyCenter',
        'particle': 'particleCannon',
        'particlecannon': 'particleCannon',
        'supplydrop': 'supplyDrop',
        'detention': 'detentionCamp',
        'detentioncamp': 'detentionCamp',
        'tech_oilderrick': 'tech_oilDerrick',
        'oilderrick': 'tech_oilDerrick',
        'tech_supplydock': 'tech_supplyDock',
        'supplydock': 'tech_supplyDock'
    };
    const resolved = cameoMap[rawKey] || rawKey;
    if (window.OFFICIAL_CAMEOS && window.OFFICIAL_CAMEOS[resolved]) {
        return \`<img src="\${window.OFFICIAL_CAMEOS[resolved]}" class="slot-cameo-img" alt="\${name || id}" />\`;
    }
    return null;
}

function handleGridSlotClick(idx) {
    if (typeof playOfficialSound === 'function') playOfficialSound('sfx_click', 0.65);
    if (currentGridSlots && currentGridSlots[idx] && typeof currentGridSlots[idx].action === 'function') {
        currentGridSlots[idx].action();
    }
}
window.handleGridSlotClick = handleGridSlotClick;

function renderCommandGrid(container, slots) {`;

if (!c.includes(target)) {
    console.error("target renderCommandGrid not found!");
    process.exit(1);
}
c = c.replace(target, replacement);

// Replace cameoSvg and onclick inside renderCommandGrid
const slotTarget = "const cameoSvg = getCameoSVG(s.id, selectedFaction, s.name);";
const slotReplace = "const cameoSvg = getCameoImg(s.id, s.name) || getCameoSVG(s.id, selectedFaction, s.name);";
c = c.replace(slotTarget, slotReplace);

const clickTarget = "onclick=\"currentGridSlots[${i}].action()\"";
const clickReplace = "onclick=\"handleGridSlotClick(${i})\"";
c = c.replace(clickTarget, clickReplace);

fs.writeFileSync('D:/C&C/src/js/11_sidebar.js', c, 'utf8');
console.log("Successfully updated 11_sidebar.js with official cameos and click sounds!");
