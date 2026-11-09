// MAP ENVIRONMENTS, PROCEDURAL TERRAIN, WATER & PROPS (TREES / CITY)
        // =========================================================================
        let currentMapType = 'tournament_desert';
        let currentMapSize = 1500;
        let terrainMesh = null;
        let waterMesh = null;
        let mapPropsGroup = null;
        const mapObstacles = []; // Solid obstacles with collision (trees, rocks, buildings)

        // Mathematical Heightmap Generator
        function getCustomMapHeight(x, z) {
            if (!activeCustomMap || !activeCustomMap.heightGrid || activeCustomMap.heightGrid.length === 0) return 2.5;
            const size = currentMapSize;
            const half = size * 0.5;
            const u = Math.max(0, Math.min(1, (x + half) / size));
            const v = Math.max(0, Math.min(1, (z + half) / size));
            const res = 32;
            const gx = u * (res - 1);
            const gz = v * (res - 1);
            const x0 = Math.floor(gx);
            const z0 = Math.floor(gz);
            const x1 = Math.min(res - 1, x0 + 1);
            const z1 = Math.min(res - 1, z0 + 1);
            const fx = gx - x0;
            const fz = gz - z0;
            const grid = activeCustomMap.heightGrid;
            const h00 = grid[z0 * res + x0] !== undefined ? grid[z0 * res + x0] : 2.5;
            const h10 = grid[z0 * res + x1] !== undefined ? grid[z0 * res + x1] : 2.5;
            const h01 = grid[z1 * res + x0] !== undefined ? grid[z1 * res + x0] : 2.5;
            const h11 = grid[z1 * res + x1] !== undefined ? grid[z1 * res + x1] : 2.5;
            const h0 = h00 * (1 - fx) + h10 * fx;
            const h1 = h01 * (1 - fx) + h11 * fx;
            return h0 * (1 - fz) + h1 * fz;
        }

        const flattenedFootprints = [];

        function registerFlattenedFootprint(cx, cz, radius, targetY) {
            flattenedFootprints.push({ cx, cz, radius, targetY });
            if (terrainMesh && terrainMesh.geometry && terrainMesh.geometry.attributes.position) {
                const pos = terrainMesh.geometry.attributes.position;
                const count = pos.count;
                let modified = false;
                const rSq = radius * radius;
                const blendR = radius * 1.35;
                const blendRSq = blendR * blendR;
                for (let i = 0; i < count; i++) {
                    const vx = pos.getX(i);
                    const vz = pos.getZ(i);
                    const dx = vx - cx;
                    const dz = vz - cz;
                    const dSq = dx * dx + dz * dz;
                    if (dSq <= rSq) {
                        pos.setY(i, targetY);
                        modified = true;
                    } else if (dSq < blendRSq) {
                        const dist = Math.sqrt(dSq);
                        const t = (dist - radius) / (blendR - radius);
                        const origY = pos.getY(i);
                        pos.setY(i, targetY * (1 - t) + origY * t);
                        modified = true;
                    }
                }
                if (modified) {
                    pos.needsUpdate = true;
                    terrainMesh.geometry.computeVertexNormals();
                }
            }
        }
        window.registerFlattenedFootprint = registerFlattenedFootprint;

        function getTerrainHeight(x, z) {
            // PERF: AABB + squared-distance reject avoids Math.hypot for distant footprints
            for (let i = 0; i < flattenedFootprints.length; i++) {
                const fp = flattenedFootprints[i];
                const r = fp.radius;
                const outerR = r * 1.35;
                const dx = x - fp.cx;
                if (dx > outerR || dx < -outerR) continue;
                const dz = z - fp.cz;
                if (dz > outerR || dz < -outerR) continue;
                const d2 = dx * dx + dz * dz;
                if (d2 <= r * r) {
                    return fp.targetY;
                } else if (d2 < outerR * outerR) {
                    const dist = Math.sqrt(d2);
                    const t = (dist - r) / (r * 0.35);
                    const rawH = getRawTerrainHeight(x, z);
                    return fp.targetY * (1 - t) + rawH * t;
                }
            }
            return getRawTerrainHeight(x, z);
        }

        function getRawTerrainHeight(x, z) {
            if (currentMapType === 'tournament_desert' && typeof getTournamentDesertHeight === 'function') {
                return getTournamentDesertHeight(x, z);
            }
            if (activeCustomMap && activeCustomMap.heightGrid) {
                return getCustomMapHeight(x, z);
            }
            const size = currentMapSize;
            if (currentMapType === 'desert') {
                // Rolling sand dunes and canyon plateaus - 98.7% accessible dry land!
                const dune1 = Math.sin(x * 0.02 + z * 0.012) * 2.6;
                const dune2 = Math.cos(x * 0.035 - z * 0.02) * 1.8;
                let h = 3.8 + dune1 + dune2;

                // Canyon mesa in the northwest
                const dxMesa = x + size * 0.22;
                const dzMesa = z + size * 0.22;
                const dMesa = Math.hypot(dxMesa, dzMesa);
                if (dMesa < size * 0.14) {
                    h += (1 - dMesa / (size * 0.14)) * 7.5;
                }

                // Localized oasis pond depression in the southeast
                const dxOasis = x - size * 0.20;
                const dzOasis = z - size * 0.20;
                const dOasis = Math.hypot(dxOasis, dzOasis);
                if (dOasis < size * 0.08) {
                    h -= (1 - dOasis / (size * 0.08)) * 8.5;
                }
                return h;
            } else if (currentMapType === 'jungle') {
                // Lush tropical hills and a defined river channel with shallow fords - 98% accessible land!
                const riverZ = Math.sin(x * 0.012) * (size * 0.09);
                const distToRiver = Math.abs(z - riverZ);
                let h = 4.5 + Math.sin(x * 0.022) * Math.cos(z * 0.022) * 3.2 + Math.sin(x * 0.045 + z * 0.03) * 1.6;

                const riverWidth = size * 0.032;
                if (distToRiver < riverWidth) {
                    // Natural shallow sandbars / fords between bridges where units can wade across
                    const isFord = Math.abs(x) < size * 0.06 || Math.abs(x - size * 0.13) < size * 0.03 || Math.abs(x + size * 0.13) < size * 0.03;
                    if (isFord) {
                        h += 0.8; // Ford stays above water!
                    } else {
                        const rf = 1 - (distToRiver / riverWidth);
                        h -= rf * rf * 9.5;
                    }
                }
                return h;
            } else if (currentMapType === 'snow') {
                // Siberian ridges and central ice pond - 99% accessible land!
                const ridge = Math.abs(Math.sin(x * 0.014 + z * 0.012)) * 4.5;
                const roll = Math.cos(x * 0.025 - z * 0.02) * 2.0;
                let h = 3.5 + ridge + roll;

                const dLake = Math.hypot(x, z);
                const lakeRadius = size * 0.08;
                if (dLake < lakeRadius) {
                    const lf = 1 - (dLake / lakeRadius);
                    h -= lf * lf * 8.0;
                }
                return h;
            } else if (currentMapType === 'city') {
                // Urban street grid with sunken concrete canal - 97% accessible land!
                const canalDist = Math.abs(x - size * 0.05);
                const canalWidth = size * 0.022;
                let h = 2.0 + ((Math.floor(x / 40) % 2 === 0 && Math.floor(z / 40) % 2 === 0) ? 0.4 : 0);
                if (canalDist < canalWidth) {
                    h -= (1 - canalDist / canalWidth) * 7.5;
                }
                return h;
            } else if (currentMapType === 'random') {
                // Procedural Warzone with narrow stream and multiple crossings - 97.5% accessible land!
                const riverZ = Math.sin(x * 0.014 + randomMapSeed) * (size * 0.10);
                const distToRiver = Math.abs(z - riverZ);
                let h = 4.2 + Math.sin(x * 0.02 + randomMapSeed) * Math.cos(z * 0.02 + randomMapSeed * 0.5) * 2.8 +
                        Math.sin(x * 0.045 - z * 0.035) * 1.5;

                const riverWidth = size * 0.032;
                if (distToRiver < riverWidth) {
                    // Periodic shallow sandbar crossings
                    const isFord = Math.sin(x * 0.04) > 0.55;
                    if (isFord) {
                        h += 0.8;
                    } else {
                        const f = 1 - (distToRiver / riverWidth);
                        h -= f * f * 9.2;
                    }
                }
                return h;
            }
            return 2.0;
        }

        // Procedural Texture Generator for Custom Maps (Height-aware splat texturing)
        function createCustomTerrainTexture(customMap) {
            const width = 1024;
            const height = 1024;
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            const imgData = ctx.createImageData(width, height);
            const data = imgData.data;

            const res = 32;
            const grid = (customMap && customMap.heightGrid && customMap.heightGrid.length === res * res)
                ? customMap.heightGrid
                : null;
            const waterLevel = (customMap && customMap.waterLevel !== undefined) ? Number(customMap.waterLevel) : -1.0;
            const theme = (customMap && customMap.theme) ? customMap.theme : 'desert';

            for (let py = 0; py < height; py++) {
                const gyFloat = (py / (height - 1)) * (res - 1);
                const gy0 = Math.floor(gyFloat);
                const gy1 = Math.min(res - 1, gy0 + 1);
                const fy = gyFloat - gy0;

                for (let px = 0; px < width; px++) {
                    const gxFloat = (px / (width - 1)) * (res - 1);
                    const gx0 = Math.floor(gxFloat);
                    const gx1 = Math.min(res - 1, gx0 + 1);
                    const fx = gxFloat - gx0;

                    let h = 2.5;
                    let slope = 0;

                    if (grid) {
                        const h00 = grid[gy0 * res + gx0] !== undefined ? grid[gy0 * res + gx0] : 2.5;
                        const h10 = grid[gy0 * res + gx1] !== undefined ? grid[gy0 * res + gx1] : 2.5;
                        const h01 = grid[gy1 * res + gx0] !== undefined ? grid[gy1 * res + gx0] : 2.5;
                        const h11 = grid[gy1 * res + gx1] !== undefined ? grid[gy1 * res + gx1] : 2.5;

                        const topH = h00 * (1 - fx) + h10 * fx;
                        const botH = h01 * (1 - fx) + h11 * fx;
                        h = topH * (1 - fy) + botH * fy;

                        const dHx = Math.abs((h10 - h00) * (1 - fy) + (h11 - h01) * fy);
                        const dHy = Math.abs((h01 - h00) * (1 - fx) + (h11 - h10) * fx);
                        slope = dHx + dHy;
                    }

                    // Pseudo-random high-frequency surface noise (-10 to +10)
                    const nHash = ((px * 1664525 + py * 1013904223) ^ (px >> 2)) & 0xff;
                    const noise = (nHash - 128) * 0.08;

                    let r = 180, g = 160, b = 120;

                    if (theme === 'desert') {
                        if (h <= waterLevel + 0.35) {
                            // Shoreline damp silt & alluvial mud
                            r = 122 + noise * 0.6;
                            g = 102 + noise * 0.5;
                            b = 72 + noise * 0.4;
                        } else if (slope > 0.40) {
                            // Canyon sandstone cliff face with rock strata
                            const strata = Math.sin(h * 3.8 + px * 0.02) * 16;
                            r = 150 + strata + noise;
                            g = 100 + strata * 0.7 + noise;
                            b = 65 + strata * 0.5 + noise;
                        } else if (h > 5.5) {
                            // Elevated mesa limestone plateau
                            r = 218 + noise;
                            g = 196 + noise;
                            b = 156 + noise;
                        } else {
                            // Rolling desert dunes with subtle ripples
                            const ripple = Math.sin(px * 0.08 + py * 0.04) * 6;
                            r = 202 + ripple + noise;
                            g = 176 + ripple * 0.85 + noise;
                            b = 132 + ripple * 0.65 + noise;
                        }
                    } else if (theme === 'jungle') {
                        if (h <= waterLevel + 0.35) {
                            // Muddy riverbed & wetland silt
                            r = 75 + noise * 0.6;
                            g = 65 + noise * 0.5;
                            b = 48 + noise * 0.4;
                        } else if (slope > 0.40) {
                            // Volcanic basalt cliff face
                            const strata = Math.sin(h * 3.0) * 10;
                            r = 68 + strata + noise;
                            g = 75 + strata + noise;
                            b = 66 + strata + noise;
                        } else if (h > 5.5) {
                            // Upland savanna ridges
                            r = 92 + noise;
                            g = 128 + noise;
                            b = 62 + noise;
                        } else {
                            // Lush tropical grass & foliage
                            const turf = Math.sin(px * 0.06 - py * 0.05) * 8;
                            r = 58 + turf * 0.5 + noise;
                            g = 110 + turf + noise;
                            b = 45 + turf * 0.4 + noise;
                        }
                    } else if (theme === 'snow') {
                        if (h <= waterLevel + 0.35) {
                            // Icy slush & permafrost
                            r = 140 + noise;
                            g = 158 + noise;
                            b = 180 + noise;
                        } else if (slope > 0.40) {
                            // Dark Siberian granite crags
                            const strata = Math.sin(h * 3.2) * 12;
                            r = 78 + strata + noise;
                            g = 88 + strata + noise;
                            b = 102 + strata + noise;
                        } else if (h > 5.5) {
                            // Packed glacial blue ice
                            r = 232 + noise * 0.5;
                            g = 245 + noise * 0.5;
                            b = 255;
                        } else {
                            // Powder snow drifts
                            const drift = Math.sin(px * 0.05 + py * 0.05) * 6;
                            r = 235 + drift + noise;
                            g = 242 + drift + noise;
                            b = 250 + drift + noise;
                        }
                    } else if (theme === 'city') {
                        if (h <= waterLevel + 0.35) {
                            // Canal bed / concrete basin
                            r = 44 + noise * 0.5;
                            g = 48 + noise * 0.5;
                            b = 54 + noise * 0.5;
                        } else if (slope > 0.40) {
                            // Retaining wall / foundations
                            const strata = Math.sin(h * 4.0) * 10;
                            r = 82 + strata + noise;
                            g = 86 + strata + noise;
                            b = 92 + strata + noise;
                        } else if (h > 5.5) {
                            // Elevated urban plaza
                            r = 98 + noise;
                            g = 104 + noise;
                            b = 112 + noise;
                        } else {
                            // Asphalt streets and urban blocks
                            const isRoadGrid = (px % 64 < 10) || (py % 64 < 10);
                            if (isRoadGrid) {
                                r = 40 + noise * 0.5;
                                g = 42 + noise * 0.5;
                                b = 46 + noise * 0.5;
                            } else {
                                r = 68 + noise;
                                g = 73 + noise;
                                b = 78 + noise;
                            }
                        }
                    }

                    const idx = (py * width + px) * 4;
                    data[idx] = Math.max(0, Math.min(255, Math.round(r)));
                    data[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
                    data[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
                    data[idx + 3] = 255;
                }
            }

            ctx.putImageData(imgData, 0, 0);

            const texture = new THREE.CanvasTexture(canvas);
            texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.repeat.set(1, 1);
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = true;
            texture.needsUpdate = true;
            return texture;
        }

        // Procedural Texture Generator per Environment
        function createTerrainTextureForMap(mapType) {
            if ((mapType === 'tournament_desert' || mapType === 'desert') && typeof createTournamentDesertTexture === 'function') {
                const retailTex = createTournamentDesertTexture();
                if (retailTex) return retailTex;
            }
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 512;
            const ctx = canvas.getContext('2d');

            if (mapType === 'desert') {
                ctx.fillStyle = '#bfa87a'; // Golden sand
                ctx.fillRect(0, 0, 512, 512);
                const patches = ['#a89265', '#cbba8d', '#8c7750', '#d9cca6', '#7a6744'];
                for (let i = 0; i < 1100; i++) {
                    ctx.fillStyle = patches[i % patches.length];
                    ctx.globalAlpha = 0.12 + Math.random() * 0.15;
                    ctx.beginPath();
                    ctx.ellipse(Math.random() * 512, Math.random() * 512, 4 + Math.random() * 22, 2 + Math.random() * 14, Math.random() * Math.PI, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else if (mapType === 'jungle') {
                ctx.fillStyle = '#3a5328'; // Lush tropical green
                ctx.fillRect(0, 0, 512, 512);
                const patches = ['#2b3f1c', '#4b6b33', '#56452e', '#233417', '#60793b'];
                for (let i = 0; i < 1200; i++) {
                    ctx.fillStyle = patches[i % patches.length];
                    ctx.globalAlpha = 0.14 + Math.random() * 0.18;
                    ctx.beginPath();
                    ctx.ellipse(Math.random() * 512, Math.random() * 512, 4 + Math.random() * 24, 3 + Math.random() * 16, Math.random() * Math.PI, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else if (mapType === 'snow') {
                ctx.fillStyle = '#eaf0f4'; // Frosty snow
                ctx.fillRect(0, 0, 512, 512);
                const patches = ['#d2dce3', '#f7faff', '#9fb0bc', '#c0cbd3', '#8999a6'];
                for (let i = 0; i < 1100; i++) {
                    ctx.fillStyle = patches[i % patches.length];
                    ctx.globalAlpha = 0.12 + Math.random() * 0.15;
                    ctx.beginPath();
                    ctx.ellipse(Math.random() * 512, Math.random() * 512, 5 + Math.random() * 26, 3 + Math.random() * 18, Math.random() * Math.PI, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else if (mapType === 'city') {
                ctx.fillStyle = '#34383c'; // Dark asphalt
                ctx.fillRect(0, 0, 512, 512);

                // Grid street pattern
                ctx.strokeStyle = '#222528';
                ctx.lineWidth = 14;
                for (let i = 0; i <= 512; i += 64) {
                    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
                }

                // Yellow lane dividers
                ctx.strokeStyle = '#f1c40f';
                ctx.lineWidth = 2;
                ctx.setLineDash([8, 8]);
                for (let i = 32; i <= 512; i += 64) {
                    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
                }
                ctx.setLineDash([]);
            } else if (mapType === 'random') {
                ctx.fillStyle = '#4a5d38'; // Warzone olive earth
                ctx.fillRect(0, 0, 512, 512);
                const patches = ['#3a482b', '#5c6f44', '#6b5c42', '#333f25', '#73634a', '#857252'];
                for (let i = 0; i < 1300; i++) {
                    ctx.fillStyle = patches[i % patches.length];
                    ctx.globalAlpha = 0.14 + Math.random() * 0.18;
                    ctx.beginPath();
                    ctx.ellipse(Math.random() * 512, Math.random() * 512, 4 + Math.random() * 24, 3 + Math.random() * 16, Math.random() * Math.PI, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else {
                // Guaranteed safety fallback for any custom or unrecognized map type - never render black!
                ctx.fillStyle = '#bfa87a';
                ctx.fillRect(0, 0, 512, 512);
                const patches = ['#a89265', '#cbba8d', '#8c7750', '#d9cca6', '#7a6744'];
                for (let i = 0; i < 1100; i++) {
                    ctx.fillStyle = patches[i % patches.length];
                    ctx.globalAlpha = 0.12 + Math.random() * 0.15;
                    ctx.beginPath();
                    ctx.ellipse(Math.random() * 512, Math.random() * 512, 4 + Math.random() * 22, 2 + Math.random() * 14, Math.random() * Math.PI, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.globalAlpha = 1.0;

            const texture = new THREE.CanvasTexture(canvas);
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(mapType === 'city' ? 24 : 36, mapType === 'city' ? 24 : 36);
            return texture;
        }

        // Build Terrain, Water, and Props for the selected Map
        function setupMapEnvironment(mapType = 'tournament_desert', mapSize = 1500) {
            if (mapType === 'desert') mapType = 'tournament_desert';
            // 0. Resolve activeCustomMap if mapType starts with custom_
            if (mapType && mapType.startsWith('custom_')) {
                if (!activeCustomMap || activeCustomMap.id !== mapType) {
                    if (typeof savedCustomMaps !== 'undefined' && savedCustomMaps[mapType]) {
                        activeCustomMap = savedCustomMaps[mapType];
                    }
                }
            } else {
                activeCustomMap = null;
            }

            if (activeCustomMap && activeCustomMap.size) {
                mapSize = Number(activeCustomMap.size);
            }

            currentMapType = mapType;
            currentMapSize = mapSize;

            const effectiveTheme = (activeCustomMap && activeCustomMap.theme)
                ? activeCustomMap.theme
                : (mapType === 'random' ? 'jungle' : (['desert', 'jungle', 'snow', 'city', 'tournament_desert'].includes(mapType) ? mapType : 'desert'));

            flattenedFootprints.length = 0;
            // Clear previous terrain, water, props, and supply points
            if (terrainMesh) { scene.remove(terrainMesh); terrainMesh.geometry.dispose(); terrainMesh = null; }
            if (waterMesh) { scene.remove(waterMesh); waterMesh.geometry.dispose(); waterMesh = null; }
            if (mapPropsGroup) { scene.remove(mapPropsGroup); mapPropsGroup = null; }
            mapObstacles.length = 0;
            supplyPoints.forEach(sp => { if (sp.mesh) scene.remove(sp.mesh); });
            supplyPoints.length = 0;

            mapPropsGroup = new THREE.Group();
            scene.add(mapPropsGroup);

            // 1. Atmosphere Lighting & Fog
            if (effectiveTheme === 'desert' || effectiveTheme === 'tournament_desert') {
                scene.background.setHex(0x1a150e);
                scene.fog = new THREE.FogExp2(0x1a150e, 0.0025);
            } else if (effectiveTheme === 'jungle') {
                scene.background.setHex(0x0e1811);
                scene.fog = new THREE.FogExp2(0x0e1811, 0.0028);
            } else if (effectiveTheme === 'snow') {
                scene.background.setHex(0x121a22);
                scene.fog = new THREE.FogExp2(0x121a22, 0.0022);
            } else if (effectiveTheme === 'city') {
                scene.background.setHex(0x111317);
                scene.fog = new THREE.FogExp2(0x111317, 0.0024);
            } else {
                scene.background.setHex(0x1a150e);
                scene.fog = new THREE.FogExp2(0x1a150e, 0.0025);
            }

            // 2. Procedural Displaced Terrain Mesh
            const segments = mapSize >= 2200 ? 180 : mapSize >= 1400 ? 140 : 100;
            const geo = new THREE.PlaneGeometry(mapSize, mapSize, segments, segments);
            geo.rotateX(-Math.PI / 2);

            const posAttr = geo.attributes.position;
            for (let i = 0; i < posAttr.count; i++) {
                const vx = posAttr.getX(i);
                const vz = posAttr.getZ(i);
                posAttr.setY(i, getTerrainHeight(vx, vz));
            }
            geo.computeVertexNormals();

            const isCustom = Boolean(activeCustomMap || (mapType && mapType.startsWith('custom_')));
            const terrainTexture = isCustom
                ? createCustomTerrainTexture(activeCustomMap)
                : createTerrainTextureForMap(mapType);

            const terrainMat = new THREE.MeshStandardMaterial({
                map: terrainTexture,
                roughness: effectiveTheme === 'snow' ? 0.75 : effectiveTheme === 'city' ? 0.85 : 0.95,
                metalness: effectiveTheme === 'snow' ? 0.15 : effectiveTheme === 'city' ? 0.1 : 0.05
            });
            terrainMesh = new THREE.Mesh(geo, terrainMat);
            terrainMesh.receiveShadow = true;
            scene.add(terrainMesh);

            // 3. Water Body
            mapBridges.length = 0; // Clear previous bridges
            let waterLevel = -1.0;
            let waterColor = 0x0984e3;
            let waterOpacity = 0.82;

            if (effectiveTheme === 'desert') { waterColor = 0x0abde3; waterOpacity = 0.82; }
            else if (effectiveTheme === 'jungle') { waterColor = 0x00cec9; waterOpacity = 0.85; }
            else if (effectiveTheme === 'snow') { waterColor = 0x74b9ff; waterOpacity = 0.88; }
            else if (effectiveTheme === 'city') { waterColor = 0x2d3436; waterOpacity = 0.88; }

            if (mapType === 'random') {
                randomMapSeed = Math.random() * 100;
                randomMapRiverFreq = 0.012 + Math.random() * 0.008;
                waterColor = 0x1b7094; waterOpacity = 0.86;
            }

            if (activeCustomMap && activeCustomMap.waterLevel !== undefined) {
                waterLevel = Number(activeCustomMap.waterLevel);
            }
            currentWaterLevel = waterLevel;

            const waterGeo = new THREE.PlaneGeometry(mapSize * 0.95, mapSize * 0.95);
            const waterMat = new THREE.MeshStandardMaterial({
                color: waterColor, roughness: 0.12, metalness: 0.85,
                transparent: true, opacity: waterOpacity
            });
            waterMesh = new THREE.Mesh(waterGeo, waterMat);
            waterMesh.rotation.x = -Math.PI / 2;
            waterMesh.position.y = waterLevel;
            waterMesh.receiveShadow = true;
            scene.add(waterMesh);

            // 4. Procedural Trees, Rocks & City Buildings
            spawnMapProps(effectiveTheme, mapSize);

            // 5. Distributed Supply Fields
            createSupplyFieldsForMap(mapSize);

            // 6. Dynamic Fog of War (C&C Shroud)
            initFogOfWar(mapSize);
        }

        // --- THEMATIC 3D ENVIRONMENT PROPS ---

        // 7. Desert Saguaro Cactus
        function createCactusMesh() {
            const g = new THREE.Group();
            const cactusMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.85 });

            // Main trunk
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 5.2, 8), cactusMat);
            trunk.position.y = 2.6; trunk.castShadow = true; g.add(trunk);

            // Left arm
            const armL1 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.4, 8), cactusMat);
            armL1.rotation.z = Math.PI / 2; armL1.position.set(-0.9, 2.6, 0); g.add(armL1);
            const armL2 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.8, 8), cactusMat);
            armL2.position.set(-1.6, 3.3, 0); armL2.castShadow = true; g.add(armL2);

            // Right arm (higher)
            const armR1 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.4, 8), cactusMat);
            armR1.rotation.z = -Math.PI / 2; armR1.position.set(0.9, 3.4, 0); g.add(armR1);
            const armR2 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.8, 8), cactusMat);
            armR2.position.set(1.6, 4.1, 0); armR2.castShadow = true; g.add(armR2);

            return g;
        }

        // 8. Desert Oil Pipeline Segment
        function createPipelineMesh(length = 18) {
            const g = new THREE.Group();
            const pipeMat = new THREE.MeshStandardMaterial({ color: 0x636e72, roughness: 0.6, metalness: 0.65 });
            const supportMat = new THREE.MeshStandardMaterial({ color: 0x2d3436, roughness: 0.9 });

            const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, length, 12), pipeMat);
            pipe.rotation.z = Math.PI / 2; pipe.position.y = 1.6; pipe.castShadow = true; g.add(pipe);

            // Concrete support footings
            for (let x = -length * 0.4; x <= length * 0.4; x += length * 0.4) {
                const foot = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 1.8), supportMat);
                foot.position.set(x, 0.9, 0); foot.castShadow = true; g.add(foot);
            }
            return g;
        }

        // 9. Jungle Riverbank Reeds & Wetland Cattails
        function createReedMesh() {
            const g = new THREE.Group();
            const stalkMat = new THREE.MeshStandardMaterial({ color: 0x27ae60, roughness: 0.85 });
            const headMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.95 });

            for (let i = 0; i < 9; i++) {
                const ang = (i * Math.PI * 2) / 9;
                const dist = 0.4 + (i % 3) * 0.25;
                const h = 2.2 + (i % 4) * 0.5;
                const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, h, 6), stalkMat);
                stalk.position.set(Math.cos(ang) * dist, h * 0.5, Math.sin(ang) * dist);
                stalk.rotation.x = (Math.random() - 0.5) * 0.15;
                stalk.rotation.z = (Math.random() - 0.5) * 0.15;
                g.add(stalk);

                const head = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 6), headMat);
                head.position.set(stalk.position.x, h - 0.3, stalk.position.z);
                g.add(head);
            }
            return g;
        }

        // 10. Jungle Tropical Fern Patch
        function createFernMesh() {
            const g = new THREE.Group();
            const fernMat = new THREE.MeshStandardMaterial({ color: 0x1abc9c, roughness: 0.8, side: THREE.DoubleSide });
            for (let i = 0; i < 8; i++) {
                const ang = (i * Math.PI * 2) / 8;
                const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.4), fernMat);
                frond.position.set(Math.cos(ang) * 0.7, 0.6, Math.sin(ang) * 0.7);
                frond.rotation.y = ang + Math.PI / 2;
                frond.rotation.x = 0.55;
                frond.castShadow = true;
                g.add(frond);
            }
            return g;
        }

        // 11. Snow Sharp Ice Spikes / Crevasse Crystals
        function createIceSpikeMesh() {
            const g = new THREE.Group();
            const iceMat = new THREE.MeshStandardMaterial({
                color: 0x74b9ff, roughness: 0.15, metalness: 0.75,
                transparent: true, opacity: 0.85
            });
            for (let i = 0; i < 6; i++) {
                const h = 2.4 + (i % 3) * 1.2;
                const spike = new THREE.Mesh(new THREE.ConeGeometry(0.4 + (i % 3) * 0.2, h, 5), iceMat);
                const a = i * 1.1;
                spike.position.set(Math.cos(a) * (1.2 + (i % 2) * 0.6), h * 0.5, Math.sin(a) * (1.2 + (i % 2) * 0.6));
                spike.rotation.set((Math.random() - 0.5) * 0.25, Math.random() * Math.PI, (Math.random() - 0.5) * 0.25);
                spike.castShadow = true;
                g.add(spike);
            }
            return g;
        }

        // 12. City Arched Steel Streetlight
        function createStreetLightMesh() {
            const g = new THREE.Group();
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7.5, 8), matDarkMetal);
            post.position.y = 3.75; post.castShadow = true; g.add(post);

            const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 0.2), matDarkMetal);
            arm.position.set(0.7, 7.3, 0); g.add(arm);

            const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.4), matGunmetal);
            head.position.set(1.4, 7.2, 0); g.add(head);

            const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.3), new THREE.MeshStandardMaterial({ color: 0xffea00, emissive: 0xffd32a, emissiveIntensity: 0.8 }));
            lamp.position.set(1.4, 7.08, 0); g.add(lamp);

            return g;
        }

        // 13. City Burnt-Out Combat Vehicle Wreck
        function createWreckCarMesh() {
            const g = new THREE.Group();
            const rustMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.95 });
            const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e272e, roughness: 0.9 });

            const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.75, 4.4), rustMat);
            body.position.y = 0.55; body.castShadow = true; g.add(body);

            const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 2.2), darkMat);
            cab.position.set(0, 1.15, -0.2); cab.castShadow = true; g.add(cab);

            // Destroyed wheels
            [[-1.15, 0.35, 1.4], [1.15, 0.35, 1.4], [-1.15, 0.35, -1.4], [1.15, 0.35, -1.4]].forEach(([wx, wy, wz]) => {
                const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 8), darkMat);
                wheel.rotation.z = Math.PI / 2; wheel.position.set(wx, wy, wz); g.add(wheel);
            });
            return g;
        }

        // Spawn Map Props (Trees, Rocks, Palms, City Buildings)
        function spawnMapProps(theme, mapSize) {
            // 1. If custom map has explicit bridges, spawn them
            if (activeCustomMap && activeCustomMap.bridges && activeCustomMap.bridges.length > 0) {
                activeCustomMap.bridges.forEach(b => {
                    const by = (activeCustomMap.waterLevel !== undefined ? Number(activeCustomMap.waterLevel) : -1.0) + 1.8;
                    spawnBridge(b.x, by, b.z, b.angle || 0, b.width || 20, b.length || 60);
                });
            }

            // 2. If custom map has explicit props, spawn them
            if (activeCustomMap && activeCustomMap.props && activeCustomMap.props.length > 0) {
                activeCustomMap.props.forEach(p => {
                    const py = getTerrainHeight(p.x, p.z);
                    if (theme === 'desert') {
                        const palm = createPalmTreeMesh();
                        palm.position.set(p.x, py, p.z);
                        mapPropsGroup.add(palm);
                        mapObstacles.push({ position: new THREE.Vector3(p.x, py, p.z), radius: 1.8 });
                    } else if (theme === 'jungle') {
                        const tree = createJungleTreeMesh();
                        tree.position.set(p.x, py, p.z);
                        mapPropsGroup.add(tree);
                        mapObstacles.push({ position: new THREE.Vector3(p.x, py, p.z), radius: 2.4 });
                    } else if (theme === 'snow') {
                        const pine = createSnowPineMesh();
                        pine.position.set(p.x, py, p.z);
                        mapPropsGroup.add(pine);
                        mapObstacles.push({ position: new THREE.Vector3(p.x, py, p.z), radius: 2.0 });
                    } else if (theme === 'city') {
                        const building = createCitySkyscraperMesh();
                        building.position.set(p.x, py, p.z);
                        mapPropsGroup.add(building);
                        mapObstacles.push({ position: new THREE.Vector3(p.x, py, p.z), radius: 5.5 });
                    }
                });
            }

            // 3. Ambient thematic props
            const count = activeCustomMap
                ? Math.min(32, Math.floor(mapSize * 0.035))
                : (mapSize > 1000 ? 110 : mapSize > 600 ? 75 : 45);
            const bound = mapSize * 0.42;

            for (let i = 0; i < count; i++) {
                const x = (Math.random() - 0.5) * 2 * bound;
                const z = (Math.random() - 0.5) * 2 * bound;
                const y = getTerrainHeight(x, z);

                // Do not spawn in water
                if (y < currentWaterLevel + 0.4 && theme !== 'city') continue;
                // Leave base centers clear
                if (Math.hypot(x, z) < 45) continue;
                // Avoid blocking bridges
                if (mapBridges.some(br => Math.hypot(x - br.position.x, z - br.position.z) < br.width + 6)) continue;

                if (theme === 'desert') {
                    const roll = Math.random();
                    if (roll > 0.6) {
                        const palm = createPalmTreeMesh();
                        palm.position.set(x, y, z);
                        mapPropsGroup.add(palm);
                        mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 1.8 });
                    } else if (roll > 0.3) {
                        const cactus = createCactusMesh();
                        cactus.position.set(x, y, z);
                        mapPropsGroup.add(cactus);
                        mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 1.4 });
                    } else if (roll > 0.1) {
                        const rock = createRockMesh(0x8a775b);
                        rock.position.set(x, y + 0.5, z);
                        mapPropsGroup.add(rock);
                        mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 2.2 });
                    } else {
                        const pipe = createPipelineMesh(20);
                        pipe.position.set(x, y, z);
                        pipe.rotation.y = Math.random() * Math.PI;
                        mapPropsGroup.add(pipe);
                        mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 3.5 });
                    }
                } else if (theme === 'jungle') {
                    const roll = Math.random();
                    if (roll > 0.45) {
                        const tree = createJungleTreeMesh();
                        tree.position.set(x, y, z);
                        mapPropsGroup.add(tree);
                        mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 2.4 });
                    } else if (roll > 0.25) {
                        const fern = createFernMesh();
                        fern.position.set(x, y, z);
                        mapPropsGroup.add(fern);
                    } else if (roll > 0.1) {
                        const reed = createReedMesh();
                        reed.position.set(x, y, z);
                        mapPropsGroup.add(reed);
                    } else {
                        const rock = createRockMesh(0x27ae60);
                        rock.position.set(x, y + 0.5, z);
                        mapPropsGroup.add(rock);
                        mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 2.0 });
                    }
                } else if (theme === 'snow') {
                    const roll = Math.random();
                    if (roll > 0.45) {
                        const pine = createSnowPineMesh();
                        pine.position.set(x, y, z);
                        mapPropsGroup.add(pine);
                        mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 2.0 });
                    } else if (roll > 0.2) {
                        const ice = createIceSpikeMesh();
                        ice.position.set(x, y, z);
                        mapPropsGroup.add(ice);
                        mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 1.8 });
                    } else {
                        const rock = createRockMesh(0xbdc3c7);
                        rock.position.set(x, y + 0.5, z);
                        mapPropsGroup.add(rock);
                        mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 2.2 });
                    }
                } else if (theme === 'city') {
                    const roll = Math.random();
                    if (Math.abs(x - mapSize * 0.06) > 35) {
                        if (roll > 0.4) {
                            const building = createCitySkyscraperMesh();
                            building.position.set(x, y, z);
                            mapPropsGroup.add(building);
                            mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 5.5 });
                        } else if (roll > 0.2) {
                            const light = createStreetLightMesh();
                            light.position.set(x, y, z);
                            mapPropsGroup.add(light);
                        } else {
                            const wreck = createWreckCarMesh();
                            wreck.position.set(x, y, z);
                            wreck.rotation.y = Math.random() * Math.PI * 2;
                            mapPropsGroup.add(wreck);
                            mapObstacles.push({ position: new THREE.Vector3(x, y, z), radius: 2.5 });
                        }
                    }
                }
            }

            // 4. Default Bridges for Preset Maps (only if not a custom map)
            if (!activeCustomMap) {
                if (currentMapType === 'jungle') {
                    const x1 = -mapSize * 0.24;
                    const z1 = Math.sin(x1 * 0.012) * (mapSize * 0.09);
                    spawnBridge(x1, 1.0, z1, 0, 20, 60);

                    const x2 = 0;
                    const z2 = Math.sin(x2 * 0.012) * (mapSize * 0.09);
                    spawnBridge(x2, 1.0, z2, 0, 20, 60);

                    const x3 = mapSize * 0.24;
                    const z3 = Math.sin(x3 * 0.012) * (mapSize * 0.09);
                    spawnBridge(x3, 1.0, z3, 0, 20, 60);
                } else if (currentMapType === 'city') {
                    spawnBridge(mapSize * 0.05, 1.0, -mapSize * 0.24, Math.PI / 2, 20, 56);
                    spawnBridge(mapSize * 0.05, 1.0, 0, Math.PI / 2, 20, 56);
                    spawnBridge(mapSize * 0.05, 1.0, mapSize * 0.24, Math.PI / 2, 20, 56);
                } else if (currentMapType === 'snow') {
                    spawnBridge(0, 1.0, 0, 0, 20, 64);
                } else if (currentMapType === 'tournament_desert') {
                    spawnBridge(-140, -5.5, 0, 0, 22, 68);
                    spawnBridge(140, -5.5, 0, 0, 22, 68);
                } else if (currentMapType === 'desert') {
                    spawnBridge(mapSize * 0.20, 1.0, mapSize * 0.20, Math.PI / 4, 18, 56);
                } else if (currentMapType === 'random') {
                    const rx1 = -mapSize * 0.24;
                    const rz1 = Math.sin(rx1 * 0.014 + randomMapSeed) * (mapSize * 0.10);
                    spawnBridge(rx1, 1.0, rz1, 0, 20, 60);

                    const rx2 = 0;
                    const rz2 = Math.sin(randomMapSeed) * (mapSize * 0.10);
                    spawnBridge(rx2, 1.0, rz2, 0, 20, 60);

                    const rx3 = mapSize * 0.24;
                    const rz3 = Math.sin(rx3 * 0.014 + randomMapSeed) * (mapSize * 0.10);
                    spawnBridge(rx3, 1.0, rz3, 0, 20, 60);
                }
            }
        }

        function spawnBridge(x, y, z, rotationY = 0, width = 16, length = 56) {
            const bridge = createBridgeMesh(currentMapType, width, length);
            bridge.position.set(x, y, z);
            bridge.rotation.y = rotationY;
            bridge.traverse(c => {
                if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
            });
            mapPropsGroup.add(bridge);
            mapBridges.push({
                position: new THREE.Vector3(x, y, z),
                width: width,
                length: length,
                rotationY: rotationY,
                deckY: y + 0.45
            });
        }

        function isPointOnBridge(x, z, bridge) {
            const dx = x - bridge.position.x;
            const dz = z - bridge.position.z;
            const halfW = bridge.width * 0.5 + 0.8;
            const halfL = bridge.length * 0.5 + 1.2;
            const maxHalf = halfW + halfL;
            if (dx > maxHalf || dx < -maxHalf || dz > maxHalf || dz < -maxHalf) return false;
            if (bridge._rotCached !== bridge.rotationY) {
                bridge._cos = Math.cos(-bridge.rotationY);
                bridge._sin = Math.sin(-bridge.rotationY);
                bridge._rotCached = bridge.rotationY;
            }
            const lx = dx * bridge._cos - dz * bridge._sin;
            const lz = dx * bridge._sin + dz * bridge._cos;
            return (Math.abs(lx) <= halfW && Math.abs(lz) <= halfL);
        }

        // --- 3D ENVIRONMENT PROPS ---

        // 1. Desert Palm Tree
        function createPalmTreeMesh() {
            const g = new THREE.Group();
            const trunkMat = new THREE.MeshStandardMaterial({ color: 0x785e3a, roughness: 0.95 });
            const frondMat = new THREE.MeshStandardMaterial({ color: 0x27ae60, roughness: 0.75, side: THREE.DoubleSide });

            // Curved trunk
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 6.5, 8), trunkMat);
            trunk.rotation.z = 0.12; trunk.position.set(0.4, 3.2, 0);
            trunk.castShadow = true; g.add(trunk);

            // Palm fronds
            for (let i = 0; i < 7; i++) {
                const angle = (i * Math.PI * 2) / 7;
                const frond = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 3.2), frondMat);
                frond.rotation.y = angle;
                frond.rotation.x = 0.35;
                frond.position.set(0.8 + Math.sin(angle) * 1.4, 6.4, Math.cos(angle) * 1.4);
                frond.castShadow = true; g.add(frond);
            }
            return g;
        }

        // 2. Desert / Mountain Boulder
        function createRockMesh(colorHex = 0x8a775b) {
            const geo = new THREE.DodecahedronGeometry(1.6 + Math.random() * 1.0, 1);
            const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.9 });
            const rock = new THREE.Mesh(geo, mat);
            rock.scale.set(1.4, 0.9, 1.2);
            rock.castShadow = true;
            return rock;
        }

        // 3. Lush Tropical Jungle Tree
        function createJungleTreeMesh() {
            const g = new THREE.Group();
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 5.5, 8), new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.95 }));
            trunk.position.y = 2.75; trunk.castShadow = true; g.add(trunk);

            // 3 Tiered dense jungle canopies
            const leafMat = new THREE.MeshStandardMaterial({ color: 0x1e824c, roughness: 0.85 });
            for (let i = 0; i < 3; i++) {
                const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.6 - i * 0.5, 8, 8), leafMat);
                canopy.scale.set(1.2, 0.65, 1.2);
                canopy.position.y = 4.8 + i * 1.5;
                canopy.castShadow = true; g.add(canopy);
            }
            return g;
        }

        // 4. Snow-Covered Siberian Pine Tree
        function createSnowPineMesh() {
            const g = new THREE.Group();
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 5.0, 8), new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.95 }));
            trunk.position.y = 2.5; trunk.castShadow = true; g.add(trunk);

            const pineMat = new THREE.MeshStandardMaterial({ color: 0x224233, roughness: 0.8 });
            const snowMat = new THREE.MeshStandardMaterial({ color: 0xf5f6fa, roughness: 0.6 });

            for (let i = 0; i < 4; i++) {
                const cone = new THREE.Mesh(new THREE.ConeGeometry(2.8 - i * 0.55, 2.0, 8), pineMat);
                cone.position.y = 3.6 + i * 1.4; cone.castShadow = true; g.add(cone);

                const snowCap = new THREE.Mesh(new THREE.ConeGeometry(2.3 - i * 0.5, 0.6, 8), snowMat);
                snowCap.position.y = 4.3 + i * 1.4; g.add(snowCap);
            }
            return g;
        }

        // 5. City Skyscraper & Office Building
        function createCitySkyscraperMesh() {
            const g = new THREE.Group();
            const height = 14 + Math.random() * 22;
            const width = 7 + Math.random() * 4;
            const depth = 7 + Math.random() * 4;

            const bMat = new THREE.MeshStandardMaterial({ color: 0x2f3640, roughness: 0.5, metalness: 0.7 });
            const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), bMat);
            body.position.y = height / 2; body.castShadow = true; g.add(body);

            // Lit office window grid panels
            const winMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, emissive: 0xf39c12, emissiveIntensity: 0.55 });
            [-width * 0.51, width * 0.51].forEach(x => {
                const win = new THREE.Mesh(new THREE.BoxGeometry(0.05, height * 0.75, depth * 0.7), winMat);
                win.position.set(x, height * 0.5, 0); g.add(win);
            });

            // Rooftop antenna tower with red aircraft warning beacon
            const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, 4.5, 8), matGunmetal);
            ant.position.set(0, height + 2.25, 0); g.add(ant);

            const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), matBeaconRed);
            beacon.name = "hazardBeacon";
            beacon.position.set(0, height + 4.5, 0); g.add(beacon);

            return g;
        }

        // 6. Concrete & Steel Bridge for River / Canal / Ravine Crossing
        function createBridgeMesh(mapType, width = 16, length = 56) {
            const g = new THREE.Group();
            const deckMat = new THREE.MeshStandardMaterial({ color: 0x4d5248, roughness: 0.9, metalness: 0.2 });
            const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 1.2, length), deckMat);
            deck.receiveShadow = true; deck.castShadow = true; g.add(deck);

            // Guard rails on both edges
            const halfW = width * 0.5 - 0.2;
            [-halfW, halfW].forEach(x => {
                const guard = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.4, length), matGunmetal);
                guard.position.set(x, 0.9, 0);
                guard.castShadow = true; g.add(guard);
            });

            // Warning yellow/black hazard approach stripes on bridge entry aprons
            [-length * 0.48, length * 0.48].forEach(z => {
                const stripe = new THREE.Mesh(new THREE.BoxGeometry(width - 0.6, 0.05, 2.2), matHazard);
                stripe.position.set(0, 0.63, z); g.add(stripe);
            });

            // Concrete support pillars beneath the deck into riverbed
            [-halfW + 1.8, halfW - 1.8].forEach(x => {
                [-length * 0.28, 0, length * 0.28].forEach(z => {
                    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 8.0, 8), matConcrete);
                    pillar.position.set(x, -3.8, z);
                    pillar.castShadow = true; g.add(pillar);
                });
            });

            return g;
        }

        function spawnSingleSupplyDockAt(pos, stock = 30000) {
            let dockMesh;
            let crates = null;
            if (typeof createW3DBuildingMesh === 'function' && window.W3D_BUILDING_DATA && window.W3D_BUILDING_DATA['tech_supplyDock']) {
                dockMesh = createW3DBuildingMesh('tech_supplyDock', false);
                if (window.W3D_BUILDING_DATA['tech_supplyCrates']) {
                    crates = createW3DBuildingMesh('tech_supplyCrates', false);
                    crates.name = 'supplyCrates';
                    crates.scale.set(1.0, 1.0, 1.0);
                    dockMesh.add(crates);
                }
            } else {
                dockMesh = new THREE.Group();
                const pad = new THREE.Mesh(new THREE.CylinderGeometry(7.0, 7.5, 0.35, 16), new THREE.MeshStandardMaterial({ color: 0x34495e, roughness: 0.95 }));
                pad.position.y = 0.18; dockMesh.add(pad);
            }

            const dockRadius = 7.5;
            const hCenter = (typeof getRawTerrainHeight === 'function') ? getRawTerrainHeight(pos.x, pos.z) : pos.y;
            const deckY = hCenter + 0.05;
            pos.y = deckY;
            dockMesh.position.copy(pos);

            if (typeof registerFlattenedFootprint === 'function') {
                registerFlattenedFootprint(pos.x, pos.z, dockRadius * 1.15, deckY);
            }

            scene.add(dockMesh);
            supplyPoints.push({
                position: pos.clone(),
                mesh: dockMesh,
                cratesRef: crates,
                crystals: [],
                stock: stock,
                maxStock: stock,
                remaining: stock,
                maxSupplies: stock
            });
        }

        // Supply Fields distribution across map size
        function createSupplyFieldsForMap(mapSize) {
            if (activeCustomMap && activeCustomMap.supplies && activeCustomMap.supplies.length > 0) {
                activeCustomMap.supplies.forEach(s => {
                    const y = getTerrainHeight(s.x, s.z);
                    const pos = new THREE.Vector3(s.x, y, s.z);
                    spawnSingleSupplyDockAt(pos, s.amount || 30000);
                });
                return;
            }

            const step = mapSize > 1000 ? 240 : mapSize > 600 ? 170 : 120;
            const bound = mapSize * 0.36;

            for (let x = -bound; x <= bound; x += step) {
                for (let z = -bound; z <= bound; z += step) {
                    const y = getTerrainHeight(x, z);
                    if (y < currentWaterLevel + 0.4) continue; // Don't spawn in water

                    const position = new THREE.Vector3(x, y, z);
                    spawnSingleSupplyDockAt(position, 30000);
                }
            }
        }

        