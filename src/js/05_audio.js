// USA FACTION PROCEDURAL WEB AUDIO SYNTHESIZER ENGINE (ZERO EXTERNAL ASSETS)
        // =========================================================================
        let usaAudioCtx = null;

        function getUSAAudioContext() {
            if (!usaAudioCtx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (AC) usaAudioCtx = new AC();
            }
            if (usaAudioCtx && usaAudioCtx.state === 'suspended') {
                usaAudioCtx.resume();
            }
            return usaAudioCtx;
        }

        if (typeof window !== 'undefined') {
            const unlockAudio = () => {
                getUSAAudioContext();
                window.removeEventListener('pointerdown', unlockAudio);
                window.removeEventListener('keydown', unlockAudio);
            };
            window.addEventListener('pointerdown', unlockAudio, { passive: true });
            window.addEventListener('keydown', unlockAudio, { passive: true });
        }

        function isUSASoundAllowed() {
            return (typeof selectedFaction !== 'undefined' && selectedFaction === 'usa');
        }

        function playUSASound(type, options = {}) {
            if (!isUSASoundAllowed()) return; // ONLY USA faction for now!
            const ctx = getUSAAudioContext();
            if (!ctx) return;
            const t = ctx.currentTime;

            try {
                switch (type) {
                    case 'radio_chirp': {
                        // Tactical military radio chirp + squelch on unit selection
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.type = 'sine';
                        osc.frequency.setValueAtTime(1400, t);
                        osc.frequency.exponentialRampToValueAtTime(2200, t + 0.04);
                        gain.gain.setValueAtTime(0.18, t);
                        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
                        osc.connect(gain); gain.connect(ctx.destination);
                        osc.start(t); osc.stop(t + 0.09);

                        const bSize = Math.floor(ctx.sampleRate * 0.04);
                        const buf = ctx.createBuffer(1, bSize, ctx.sampleRate);
                        const data = buf.getChannelData(0);
                        for (let i = 0; i < bSize; i++) data[i] = (Math.random() * 2 - 1) * 0.12;
                        const src = ctx.createBufferSource(); src.buffer = buf;
                        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 2.0;
                        const g = ctx.createGain();
                        g.gain.setValueAtTime(0.12, t + 0.02);
                        g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
                        src.connect(f); f.connect(g); g.connect(ctx.destination);
                        src.start(t + 0.02);
                        break;
                    }
                    case 'acknowledge': {
                        // Order acknowledged confirmation
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.type = 'triangle';
                        osc.frequency.setValueAtTime(880, t);
                        osc.frequency.setValueAtTime(1320, t + 0.05);
                        gain.gain.setValueAtTime(0.15, t);
                        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
                        osc.connect(gain); gain.connect(ctx.destination);
                        osc.start(t); osc.stop(t + 0.12);
                        break;
                    }
                    case 'construction': {
                        // Heavy metallic placement clank & pneumatic pulse
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.type = 'square';
                        osc.frequency.setValueAtTime(140, t);
                        osc.frequency.exponentialRampToValueAtTime(45, t + 0.16);
                        gain.gain.setValueAtTime(0.22, t);
                        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
                        osc.connect(gain); gain.connect(ctx.destination);
                        osc.start(t); osc.stop(t + 0.21);
                        break;
                    }
                    case 'cannon': {
                        // 120mm Smoothbore tank cannon blast (Crusader / Paladin)
                        const bSize = Math.floor(ctx.sampleRate * 0.38);
                        const buf = ctx.createBuffer(1, bSize, ctx.sampleRate);
                        const data = buf.getChannelData(0);
                        for (let i = 0; i < bSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.07));
                        const src = ctx.createBufferSource(); src.buffer = buf;
                        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
                        const g = ctx.createGain();
                        g.gain.setValueAtTime(0.45, t);
                        g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
                        src.connect(f); f.connect(g); g.connect(ctx.destination);
                        src.start(t);

                        const osc = ctx.createOscillator();
                        const og = ctx.createGain();
                        osc.type = 'sine';
                        osc.frequency.setValueAtTime(130, t);
                        osc.frequency.exponentialRampToValueAtTime(35, t + 0.25);
                        og.gain.setValueAtTime(0.35, t);
                        og.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
                        osc.connect(og); og.connect(ctx.destination);
                        osc.start(t); osc.stop(t + 0.26);
                        break;
                    }
                    case 'laser': {
                        // Paladin Point Defense Laser beam zap
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.type = 'sawtooth';
                        osc.frequency.setValueAtTime(2600, t);
                        osc.frequency.exponentialRampToValueAtTime(400, t + 0.14);
                        gain.gain.setValueAtTime(0.18, t);
                        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
                        osc.connect(gain); gain.connect(ctx.destination);
                        osc.start(t); osc.stop(t + 0.15);
                        break;
                    }
                    case 'machine_gun': {
                        // Humvee .50 cal Browning M2 machine gun burst
                        for (let shot = 0; shot < 3; shot++) {
                            const st = t + shot * 0.085;
                            const bSize = Math.floor(ctx.sampleRate * 0.06);
                            const buf = ctx.createBuffer(1, bSize, ctx.sampleRate);
                            const data = buf.getChannelData(0);
                            for (let i = 0; i < bSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.015));
                            const src = ctx.createBufferSource(); src.buffer = buf;
                            const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1600; f.Q.value = 1.2;
                            const g = ctx.createGain();
                            g.gain.setValueAtTime(0.24, st);
                            g.gain.exponentialRampToValueAtTime(0.001, st + 0.06);
                            src.connect(f); f.connect(g); g.connect(ctx.destination);
                            src.start(st);
                        }
                        break;
                    }
                    case 'missile_launch': {
                        // Tomahawk / Patriot / Raptor missile whoosh
                        const bSize = Math.floor(ctx.sampleRate * 0.45);
                        const buf = ctx.createBuffer(1, bSize, ctx.sampleRate);
                        const data = buf.getChannelData(0);
                        for (let i = 0; i < bSize; i++) data[i] = (Math.random() * 2 - 1);
                        const src = ctx.createBufferSource(); src.buffer = buf;
                        const f = ctx.createBiquadFilter(); f.type = 'bandpass';
                        f.frequency.setValueAtTime(400, t);
                        f.frequency.exponentialRampToValueAtTime(1800, t + 0.35);
                        const g = ctx.createGain();
                        g.gain.setValueAtTime(0.05, t);
                        g.gain.linearRampToValueAtTime(0.28, t + 0.08);
                        g.gain.exponentialRampToValueAtTime(0.001, t + 0.44);
                        src.connect(f); f.connect(g); g.connect(ctx.destination);
                        src.start(t);
                        break;
                    }
                    case 'aurora_bomb': {
                        // Aurora Hypersonic Fuel-Air bomb detonation (deep sub-bass rumble)
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.type = 'sine';
                        osc.frequency.setValueAtTime(95, t);
                        osc.frequency.exponentialRampToValueAtTime(22, t + 0.7);
                        gain.gain.setValueAtTime(0.55, t);
                        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
                        osc.connect(gain); gain.connect(ctx.destination);
                        osc.start(t); osc.stop(t + 0.76);

                        const bSize = Math.floor(ctx.sampleRate * 0.6);
                        const buf = ctx.createBuffer(1, bSize, ctx.sampleRate);
                        const data = buf.getChannelData(0);
                        for (let i = 0; i < bSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.15));
                        const src = ctx.createBufferSource(); src.buffer = buf;
                        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 450;
                        const g = ctx.createGain();
                        g.gain.setValueAtTime(0.42, t);
                        g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
                        src.connect(f); f.connect(g); g.connect(ctx.destination);
                        src.start(t);
                        break;
                    }
                    case 'explosion': {
                        // Impact combat detonation rumble
                        const bSize = Math.floor(ctx.sampleRate * 0.32);
                        const buf = ctx.createBuffer(1, bSize, ctx.sampleRate);
                        const data = buf.getChannelData(0);
                        for (let i = 0; i < bSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.08));
                        const src = ctx.createBufferSource(); src.buffer = buf;
                        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
                        const g = ctx.createGain();
                        g.gain.setValueAtTime(0.38, t);
                        g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
                        src.connect(f); f.connect(g); g.connect(ctx.destination);
                        src.start(t);
                        break;
                    }
                }
            } catch (err) {
                // Audio safely fails gracefully in environments with restricted audio drivers
            }
        }

        // =========================================================================
        