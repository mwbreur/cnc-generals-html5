const fs = require('fs');
let c = fs.readFileSync('D:/C&C/src/js/13_ai.js', 'utf8');

// 1. Attack voice trigger
const atkTarget = "if (typeof spawnWaypointMarker === 'function') {\n                        const tPos = targetedEnemy.mesh ? targetedEnemy.mesh.position : hitEnemyObj.position;\n                        spawnWaypointMarker(tPos, 'attack');\n                    }";
const atkTargetCRLF = "if (typeof spawnWaypointMarker === 'function') {\r\n                        const tPos = targetedEnemy.mesh ? targetedEnemy.mesh.position : hitEnemyObj.position;\r\n                        spawnWaypointMarker(tPos, 'attack');\r\n                    }";

const atkReplace = `if (typeof spawnWaypointMarker === 'function') {
                        const tPos = targetedEnemy.mesh ? targetedEnemy.mesh.position : hitEnemyObj.position;
                        spawnWaypointMarker(tPos, 'attack');
                    }
                    if (firstSelected && typeof playUnitVoice === 'function') {
                        playUnitVoice(firstSelected.type, 'attack');
                    }`;

if (c.includes(atkTarget)) {
    c = c.replace(atkTarget, atkReplace);
} else if (c.includes(atkTargetCRLF)) {
    c = c.replace(atkTargetCRLF, atkReplace);
} else {
    console.error("Attack voice target not found!");
}

// 2. Move voice trigger (ground move)
const moveTarget = "if (units.some(u => u.selected)) playUSASound('acknowledge');";
const moveReplace = `if (units.some(u => u.selected)) {
                const sel = units.find(u => u.selected);
                if (sel && typeof playUnitVoice === 'function') playUnitVoice(sel.type, 'move');
                else playUSASound('acknowledge');
            }`;
if (c.includes(moveTarget)) {
    c = c.replace(moveTarget, moveReplace);
} else {
    console.error("Move voice target not found!");
}

// 3. Select voice trigger
const selTarget = "unit.selected = true;\n                        addSelectionCircle(unit);";
const selTargetCRLF = "unit.selected = true;\r\n                        addSelectionCircle(unit);";
const selReplace = `unit.selected = true;
                        addSelectionCircle(unit);
                        if (typeof playUnitVoice === 'function') playUnitVoice(unit.type, 'select');`;

if (c.includes(selTarget)) {
    c = c.replace(selTarget, selReplace);
} else if (c.includes(selTargetCRLF)) {
    c = c.replace(selTargetCRLF, selReplace);
} else {
    console.error("Select voice target not found!");
}

fs.writeFileSync('D:/C&C/src/js/13_ai.js', c, 'utf8');
console.log("Successfully patched unit voices into 13_ai.js");
