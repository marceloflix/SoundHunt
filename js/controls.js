// SH-1977 hardware controls: rotary knobs, analog meters, tuner needle, VU driver.
// Classic script; exposes window.SHControls.

(function () {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const SWING = 42; // needle swing either side of vertical, degrees
    const PIVOT = { x: 60, y: 92 };
    const RADIUS = 70;

    const METER_SCALES = {
        vu: { marks: ['-20', '-10', '-5', '0', '+3'], red: 0.72, title: 'VU' },
        signal: { marks: ['1', '2', '3', '4', '5'], red: 1, title: 'SIGNAL' },
        energy: { marks: ['1', '2', '3', '4', '5'], red: 0.8, title: 'ENERGY' },
    };

    function polar(angleDeg, r) {
        const a = (angleDeg - 90) * Math.PI / 180;
        return { x: PIVOT.x + r * Math.cos(a), y: PIVOT.y + r * Math.sin(a) };
    }

    function el(tag, attrs, parent) {
        const node = document.createElementNS(SVG_NS, tag);
        for (const k in attrs) node.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(node);
        return node;
    }

    let meterSeq = 0;

    // Builds an analog meter SVG inside `host` (.meter). kind: vu | signal | energy.
    function buildMeter(host, kind) {
        const scale = METER_SCALES[kind] || METER_SCALES.vu;
        const id = 'm' + (++meterSeq);
        const svg = el('svg', { viewBox: '0 0 120 72', 'aria-hidden': 'true' });

        const defs = el('defs', {}, svg);
        const face = el('radialGradient', { id: id + 'f', cx: '50%', cy: '95%', r: '85%' }, defs);
        el('stop', { offset: '0%', 'stop-color': '#ffe2a6' }, face);
        el('stop', { offset: '55%', 'stop-color': '#f0bf6a' }, face);
        el('stop', { offset: '100%', 'stop-color': '#9a6224' }, face);
        const glass = el('linearGradient', { id: id + 'g', x1: '0', y1: '0', x2: '0.4', y2: '1' }, defs);
        el('stop', { offset: '0%', 'stop-color': '#fff', 'stop-opacity': '0.28' }, glass);
        el('stop', { offset: '45%', 'stop-color': '#fff', 'stop-opacity': '0.04' }, glass);
        el('stop', { offset: '46%', 'stop-color': '#fff', 'stop-opacity': '0' }, glass);

        el('rect', { x: 0, y: 0, width: 120, height: 72, fill: 'url(#' + id + 'f)' }, svg);

        // Scale arc: black, then red zone.
        const arc = (from, to, r) => {
            const a = polar(from, r), b = polar(to, r);
            return `M${a.x.toFixed(2)} ${a.y.toFixed(2)} A${r} ${r} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
        };
        const redFrom = -SWING + 2 * SWING * scale.red;
        el('path', { d: arc(-SWING, redFrom, RADIUS - 8), fill: 'none', stroke: '#2a1a08', 'stroke-width': 1.1 }, svg);
        if (scale.red < 1) {
            // printed red zone: a translucent band under the scale plus a solid edge
            el('path', { d: arc(redFrom, SWING, RADIUS - 12), fill: 'none', stroke: 'rgba(179,36,26,0.28)', 'stroke-width': 7 }, svg);
            el('path', { d: arc(redFrom, SWING, RADIUS - 8), fill: 'none', stroke: '#b3241a', 'stroke-width': 2.4 }, svg);
        }
        // secondary % scale (inner arc), as on Akai / JVC meter faces
        const inner = RADIUS - 20;
        el('path', { d: arc(-SWING, SWING, inner), fill: 'none', stroke: 'rgba(42,26,8,0.55)', 'stroke-width': 0.6 }, svg);
        for (let i = 0; i <= 10; i++) {
            const ang = -SWING + 2 * SWING * i / 10;
            const p1 = polar(ang, inner), p2 = polar(ang, inner + (i % 5 === 0 ? 3.2 : 2));
            el('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: 'rgba(42,26,8,0.6)', 'stroke-width': 0.6 }, svg);
        }
        [['0', -SWING], ['100%', SWING]].forEach(([t, ang]) => {
            const p = polar(ang, inner - 5);
            el('text', { x: p.x, y: p.y + 1.5, 'text-anchor': 'middle', 'font-size': 4.2, 'font-family': 'Share Tech Mono, monospace', fill: 'rgba(42,26,8,0.75)' }, svg).textContent = t;
        });

        // Ticks + numbers.
        const n = scale.marks.length;
        for (let i = 0; i <= (n - 1) * 4; i++) {
            const t = i / ((n - 1) * 4);
            const ang = -SWING + 2 * SWING * t;
            const major = i % 4 === 0;
            const p1 = polar(ang, RADIUS - 8), p2 = polar(ang, RADIUS - (major ? 15 : 12));
            el('line', {
                x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
                stroke: t >= scale.red && scale.red < 1 ? '#b3241a' : '#2a1a08',
                'stroke-width': major ? 1.3 : 0.7,
            }, svg);
            if (major) {
                const p = polar(ang, RADIUS - 2);
                const txt = el('text', {
                    x: p.x, y: p.y + 2, 'text-anchor': 'middle',
                    'font-size': 7, 'font-family': 'Share Tech Mono, monospace',
                    fill: t >= scale.red && scale.red < 1 ? '#b3241a' : '#2a1a08',
                }, svg);
                txt.textContent = scale.marks[i / 4];
            }
        }
        const title = el('text', {
            x: 60, y: 54, 'text-anchor': 'middle', 'font-size': 8,
            'font-family': 'Michroma, sans-serif', 'letter-spacing': 1.5, fill: '#3a2410',
        }, svg);
        title.textContent = host.dataset.title || scale.title;

        el('text', {
            x: 112, y: 60, 'text-anchor': 'end', 'font-size': 4.5,
            'font-family': 'Share Tech Mono, monospace', fill: '#5a3a18',
        }, svg).textContent = 'dB';
        el('text', {
            x: 8, y: 60, 'font-size': 4.5, 'letter-spacing': 0.6,
            'font-family': 'Michroma, sans-serif', fill: '#5a3a18',
        }, svg).textContent = 'SH';

        // Needle (with its soft shadow on the printed face).
        const needle = el('g', { class: 'meter-needle' }, svg);
        el('line', { x1: PIVOT.x + 1.6, y1: PIVOT.y, x2: PIVOT.x + 1.6, y2: PIVOT.y - RADIUS + 5, stroke: 'rgba(40,20,0,0.22)', 'stroke-width': 1.8, 'stroke-linecap': 'round' }, needle);
        el('line', { x1: PIVOT.x, y1: PIVOT.y, x2: PIVOT.x, y2: PIVOT.y - RADIUS + 3, stroke: '#141414', 'stroke-width': 1.3, 'stroke-linecap': 'round' }, needle);
        el('line', { x1: PIVOT.x, y1: PIVOT.y - RADIUS + 22, x2: PIVOT.x, y2: PIVOT.y - RADIUS + 3, stroke: '#c22a18', 'stroke-width': 1.3, 'stroke-linecap': 'round' }, needle);

        // Base plate hiding the pivot, then glass.
        el('path', { d: 'M0 64 Q60 56 120 64 L120 72 L0 72 Z', fill: '#1c140c' }, svg);
        el('rect', { x: 0, y: 0, width: 120, height: 72, fill: 'url(#' + id + 'g)' }, svg);

        host.innerHTML = '';
        const faceWrap = document.createElement('div');
        faceWrap.className = 'meter-face';
        faceWrap.appendChild(svg);
        host.appendChild(faceWrap);
        if (host.dataset.value) setMeter(host, parseFloat(host.dataset.value));
        return host;
    }

    // value 0..1
    function setMeter(host, value) {
        const v = Math.max(0, Math.min(1.08, value));
        host.style.setProperty('--deflect', (-SWING + 2 * SWING * v).toFixed(2) + 'deg');
    }

    function initMeters(root) {
        (root || document).querySelectorAll('.meter[data-meter]:not([data-built])').forEach(m => {
            m.dataset.built = '1';
            buildMeter(m, m.dataset.meter);
        });
    }

    // ------------------------------------------------------------ knobs
    // <div class="knob-wrap" data-knob data-values="a,b,c" data-angles="-60,0,60" data-value="b">
    //   <button class="knob" ...></button>
    //   <button class="knob-mark" data-value="a" style="--a:-60deg">A</button> ...
    // </div>
    function initKnob(wrap, onChange) {
        const values = wrap.dataset.values.split(',');
        const angles = wrap.dataset.angles.split(',').map(Number);
        const knob = wrap.querySelector('.knob');
        const marks = wrap.querySelectorAll('.knob-mark');

        function set(value, silent) {
            let i = values.indexOf(String(value));
            if (i < 0) i = 0;
            wrap.dataset.value = values[i];
            knob.style.setProperty('--angle', angles[i] + 'deg');
            knob.setAttribute('aria-valuenow', i);
            const mark = wrap.querySelector(`.knob-mark[data-value="${values[i]}"]`);
            knob.setAttribute('aria-valuetext', mark ? mark.textContent.trim() : values[i]);
            marks.forEach(m => m.classList.toggle('is-active', m.dataset.value === values[i]));
            if (!silent && onChange) onChange(values[i]);
        }

        // wrap=true for a tap (cycles round); arrow keys and wheel stop at the end stops
        function step(dir, wrapAround = false) {
            const i = values.indexOf(wrap.dataset.value);
            const next = wrapAround ? (i + dir + values.length) % values.length : Math.max(0, Math.min(values.length - 1, i + dir));
            if (next !== i) set(values[next]);
        }

        // Printed dot ring: a large dot per detent, two small dots between.
        const ring = wrap.querySelector('.knob-ticks');
        if (ring && !ring.childElementCount) {
            const steps = (angles.length - 1) * 3;
            for (let i = 0; i <= steps; i++) {
                const a = angles[0] + (angles[angles.length - 1] - angles[0]) * i / steps;
                const dot = document.createElement('i');
                dot.className = 'knob-dot' + (i % 3 === 0 ? ' is-major' : '');
                dot.style.setProperty('--a', a + 'deg');
                ring.appendChild(dot);
            }
        }

        knob.setAttribute('role', 'slider');
        knob.setAttribute('aria-valuemin', 0);
        knob.setAttribute('aria-valuemax', values.length - 1);
        // Tap = next detent; drag up/right or down/left = turn.
        let dragged = false;
        knob.addEventListener('pointerdown', e => {
            knob.setPointerCapture(e.pointerId);
            dragged = false;
            let acc = 0, lx = e.clientX, ly = e.clientY;
            const move = ev => {
                acc += (ev.clientX - lx) - (ev.clientY - ly);
                lx = ev.clientX; ly = ev.clientY;
                if (Math.abs(acc) >= 26) {
                    const i = values.indexOf(wrap.dataset.value);
                    const next = i + Math.sign(acc);
                    if (next >= 0 && next < values.length) set(values[next]);
                    acc = 0;
                    dragged = true;
                }
            };
            const up = () => knob.removeEventListener('pointermove', move);
            knob.addEventListener('pointermove', move);
            knob.addEventListener('pointerup', up, { once: true });
            knob.addEventListener('pointercancel', up, { once: true });
        });
        knob.addEventListener('click', () => { if (!dragged) step(1, true); });
        knob.addEventListener('keydown', e => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); step(1); }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); step(-1); }
        });
        knob.addEventListener('wheel', e => { e.preventDefault(); step(e.deltaY > 0 ? 1 : -1); }, { passive: false });
        marks.forEach(m => m.addEventListener('click', () => set(m.dataset.value)));

        set(wrap.dataset.value || values[0], true);
        wrap._setKnob = set;
        return { set };
    }

    // ------------------------------------------------------------ tuner dial
    function setDialNeedle(dial, pos) {
        dial.style.setProperty('--needle-pos', Math.max(0, Math.min(1, pos)));
    }
    function setDialSeeking(dial, on) {
        dial.classList.toggle('is-seeking', !!on);
    }

    // ------------------------------------------------------------ station scan (HUNT)
    // The needle sweeps the band, pausing on "stations" where the glass blooms and the
    // meters kick, like an auto-seek tuner. stop(finalPos) locks onto the chosen zone.
    function scanDial(dial, meters) {
        let alive = true, timer;
        const ms = Array.from(meters || []);
        const pos = () => parseFloat(dial.style.getPropertyValue('--needle-pos')) || 0.5;
        let dir = pos() < 0.5 ? 1 : -1;
        vu.hold = true;
        dial.classList.add('is-scanning');
        const decay = () => ms.forEach(m => setMeter(m, 0.05 + Math.random() * 0.06));

        function hop() {
            if (!alive) return;
            let target = pos() + dir * (0.12 + Math.random() * 0.22);
            if (target > 0.97 || target < 0.03) { dir *= -1; target = Math.max(0.03, Math.min(0.97, pos() + dir * 0.2)); }
            const travel = Math.round(260 + Math.abs(target - pos()) * 900);
            dial.style.setProperty('--needle-t', travel + 'ms');
            dial.style.setProperty('--needle-pos', target.toFixed(3));
            dial.classList.remove('is-blip');
            decay();
            timer = setTimeout(() => {
                if (!alive) return;
                // station found: glass blooms around the needle, meters kick
                dial.classList.add('is-blip');
                ms.forEach(m => setMeter(m, 0.55 + Math.random() * 0.45));
                timer = setTimeout(hop, 280 + Math.random() * 300);
            }, travel);
        }
        hop();

        return function stop(finalPos) {
            alive = false;
            clearTimeout(timer);
            dial.classList.remove('is-scanning', 'is-blip');
            dial.style.setProperty('--needle-t', '900ms');
            if (finalPos != null) dial.style.setProperty('--needle-pos', finalPos);
            // lock: one strong kick, then hand the meters back to the audio
            ms.forEach(m => setMeter(m, 0.92));
            setTimeout(() => { dial.classList.add('is-blip'); }, 600);
            setTimeout(() => { dial.classList.remove('is-blip'); vu.hold = false; }, 1500);
        };
    }

    // ------------------------------------------------------------ VU driver
    // Animates meters with an audio-like envelope. If an AnalyserNode is supplied, uses real levels.
    const vu = { raf: 0, meters: [], analyser: null, buf: null, t: 0, bpm: 120, hold: false };

    function vuFrame(now) {
        let levels;
        if (vu.analyser) {
            vu.analyser.getFloatTimeDomainData(vu.buf);
            let sum = 0;
            for (let i = 0; i < vu.buf.length; i++) sum += vu.buf[i] * vu.buf[i];
            const rms = Math.sqrt(sum / vu.buf.length);
            const db = 20 * Math.log10(rms + 1e-6);
            const v = Math.max(0, Math.min(1.05, (db + 32) / 30));
            levels = [v, v * (0.94 + Math.random() * 0.08)];
        } else {
            const beat = (now / 1000) * (vu.bpm / 60);
            const kick = Math.pow(1 - (beat % 1), 3);
            const base = 0.5 + 0.12 * Math.sin(now / 900) + 0.08 * Math.sin(now / 340);
            levels = [0, 1].map(ch => base + 0.28 * kick + (Math.random() - 0.5) * 0.12 + ch * 0.03);
        }
        if (!vu.hold) vu.meters.forEach((m, i) => setMeter(m, levels[i % 2]));
        vu.raf = requestAnimationFrame(vuFrame);
    }

    function startVU(meters, opts) {
        stopVU();
        vu.meters = Array.from(meters);
        vu.analyser = (opts && opts.analyser) || null;
        vu.buf = vu.analyser ? new Float32Array(vu.analyser.fftSize) : null;
        vu.bpm = (opts && opts.bpm) || 120;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            vu.meters.forEach(m => setMeter(m, 0.6));
            return;
        }
        vu.raf = requestAnimationFrame(vuFrame);
    }

    function stopVU() {
        cancelAnimationFrame(vu.raf);
        vu.raf = 0;
        vu.meters.forEach(m => setMeter(m, 0));
    }

    // ------------------------------------------------------------ depth dial (needle + flywheel)
    // zones: [{ value, center }] ordered left -> right. onChange(value) fires when the zone changes.
    function initDepthDial(dial, flywheel, zones, onChange) {
        let pos = parseFloat(getComputedStyle(dial).getPropertyValue('--needle-pos')) || 0.5;
        let zone = zoneAt(pos);
        let wheelOffset = 0;

        function zoneAt(p) { return zones[Math.min(zones.length - 1, Math.floor(p * zones.length))]; }

        function render(p, animate) {
            pos = Math.max(0, Math.min(1, p));
            dial.classList.toggle('is-dragging', !animate);
            dial.style.setProperty('--needle-pos', pos);
            const z = zoneAt(pos);
            if (z !== zone) {
                zone = z;
                if (onChange) onChange(z.value);
            }
            dial.querySelectorAll('[data-zone]').forEach(el => el.classList.toggle('is-active', el.dataset.zone === z.value));
        }

        function snap() {
            dial.classList.remove('is-dragging');
            render(zone.center, true);
        }

        function set(value) {
            const z = zones.find(x => x.value === value) || zones[0];
            zone = z;
            render(z.center, true);
        }

        // The flywheel is the only way to tune: drag horizontally / scroll; knurls move with the hand.
        if (flywheel) {
            const spin = dx => {
                wheelOffset += dx;
                flywheel.style.setProperty('--fw', wheelOffset + 'px');
                render(pos + dx / 700, false);
            };
            flywheel.addEventListener('pointerdown', e => {
                flywheel.setPointerCapture(e.pointerId);
                let x = e.clientX;
                const move = ev => { spin(ev.clientX - x); x = ev.clientX; };
                const up = () => { flywheel.removeEventListener('pointermove', move); snap(); };
                flywheel.addEventListener('pointermove', move);
                flywheel.addEventListener('pointerup', up, { once: true });
                flywheel.addEventListener('pointercancel', up, { once: true });
            });
            let wheelTimer;
            flywheel.addEventListener('wheel', e => {
                e.preventDefault();
                spin((e.deltaX || e.deltaY) * -0.6);
                clearTimeout(wheelTimer);
                wheelTimer = setTimeout(snap, 220);
            }, { passive: false });
            flywheel.tabIndex = 0;
            flywheel.setAttribute('role', 'slider');
            flywheel.setAttribute('aria-label', 'Discovery depth');
            flywheel.addEventListener('keydown', e => {
                const i = zones.indexOf(zone);
                if (e.key === 'ArrowRight' && i < zones.length - 1) { e.preventDefault(); spin(28); set(zones[i + 1].value); onChange && onChange(zones[i + 1].value); }
                if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); spin(-28); set(zones[i - 1].value); onChange && onChange(zones[i - 1].value); }
            });
        }

        render(pos, true);
        return { set, get: () => zone.value };
    }

    // ------------------------------------------------------------ preset LCD marquee
    function initMarquee(root) {
        (root || document).querySelectorAll('.lcd').forEach(d => {
            const text = d.querySelector('.lcd-text');
            if (!text) return;
            const box = d.querySelector('.lcd-glass') || d;
            const overflow = text.scrollWidth - box.clientWidth + 18;
            d.classList.toggle('is-overflow', overflow > 0);
            if (overflow <= 0) return;
            d.style.setProperty('--scroll-dist', overflow + 'px');
            d.style.setProperty('--scroll-dur', Math.max(3, overflow / 28) + 's');
            const host = d.closest('.preset') || d;
            const on = () => d.classList.add('is-scrolling');
            const off = () => d.classList.remove('is-scrolling');
            host.addEventListener('pointerenter', on);
            host.addEventListener('pointerleave', off);
            host.addEventListener('focusin', on);
            host.addEventListener('focusout', off);
        });
    }

    // ------------------------------------------------------------ typing placeholder
    function typePlaceholder(input, examples) {
        let i = 0, ch = 0, dir = 1, timer;
        const base = '';
        // Focus wipes the example (even half-typed) so the box is free to type in;
        // leaving it empty starts the next example from its first letter.
        input.addEventListener('focus', () => { input.placeholder = ''; });
        input.addEventListener('blur', () => { if (!input.value) { ch = 0; dir = 1; } });
        function step() {
            if (document.activeElement === input || input.value) { input.placeholder = ''; timer = setTimeout(step, 600); return; }
            const text = examples[i];
            ch += dir;
            input.placeholder = base + text.slice(0, ch) + (ch % 2 ? '▌' : ' ');
            if (dir > 0 && ch >= text.length) { dir = -1; timer = setTimeout(step, 1800); return; }
            if (dir < 0 && ch <= 0) { dir = 1; i = (i + 1) % examples.length; timer = setTimeout(step, 400); return; }
            timer = setTimeout(step, dir > 0 ? 70 + Math.random() * 60 : 22);
        }
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            input.addEventListener('blur', () => { input.placeholder = examples[0]; });
            input.placeholder = examples[0]; return;
        }
        step();
        return () => clearTimeout(timer);
    }

    // ------------------------------------------------------------ turntable engine
    // Plays a decoded preview through Web Audio so the record can be scratched:
    // label rotation is derived from playback position (33⅓ rpm = 1.8 s per turn),
    // and dragging the record moves the position, playing short grains at the hand's speed
    // (a reversed copy of the buffer handles backwards motion).
    const SECONDS_PER_TURN = 1.8;

    function createDeck() {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const out = ctx.createGain();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        out.connect(analyser).connect(ctx.destination);

        const d = {
            ctx, analyser,
            buffer: null, reversed: null,
            playing: false, scratching: false,
            offset: 0, startedAt: 0, source: null,
            onEnded: null,
        };

        d.load = async url => {
            const res = await fetch(url);
            if (!res.ok) throw new Error('fetch ' + res.status);
            const buf = await ctx.decodeAudioData(await res.arrayBuffer());
            const rev = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
            for (let c = 0; c < buf.numberOfChannels; c++) {
                rev.getChannelData(c).set(buf.getChannelData(c).slice().reverse());
            }
            d.stopSource();
            d.buffer = buf;
            d.reversed = rev;
            d.offset = 0;
            d.playing = false;
            return buf.duration;
        };

        d.duration = () => (d.buffer ? d.buffer.duration : 30);
        d.position = () => {
            if (!d.playing) return d.offset;
            return Math.min(d.duration(), ctx.currentTime - d.startedAt);
        };
        d.progress = () => d.position() / d.duration();
        d.angle = () => (d.position() / SECONDS_PER_TURN) * 360;

        d.stopSource = () => {
            if (d.source) {
                d.source.onended = null;
                try { d.source.stop(); } catch (e) { /* already stopped */ }
                d.source = null;
            }
        };

        d.play = () => {
            if (!d.buffer) return;
            if (ctx.state === 'suspended') ctx.resume();
            if (d.offset >= d.duration() - 0.05) d.offset = 0;
            d.stopSource();
            const src = ctx.createBufferSource();
            src.buffer = d.buffer;
            src.connect(out);
            src.start(0, d.offset);
            d.startedAt = ctx.currentTime - d.offset;
            d.source = src;
            d.playing = true;
            src.onended = () => {
                d.offset = d.duration();
                d.playing = false;
                d.source = null;
                if (d.onEnded) d.onEnded();
            };
        };

        d.pause = () => {
            if (!d.playing) return;
            d.offset = d.position();
            d.stopSource();
            d.playing = false;
        };

        d.seek = sec => {
            const was = d.playing;
            d.pause();
            d.offset = Math.max(0, Math.min(d.duration(), sec));
            if (was) d.play();
        };

        // --- scratching
        let resume = false, grain = null, lastT = 0;
        d.scratchStart = () => {
            if (!d.buffer) return;
            if (ctx.state === 'suspended') ctx.resume();
            resume = d.playing;
            d.pause();
            d.scratching = true;
            lastT = performance.now();
        };
        d.scratchMove = turns => {
            if (!d.scratching) return;
            const now = performance.now();
            const dt = Math.max(8, now - lastT) / 1000;
            lastT = now;
            const delta = turns * SECONDS_PER_TURN;
            const from = d.offset;
            d.offset = Math.max(0, Math.min(d.duration(), d.offset + delta));
            const rate = Math.abs(d.offset - from) / dt;
            if (rate < 0.05) return;
            const fwd = d.offset >= from;
            const g = ctx.createGain();
            const src = ctx.createBufferSource();
            src.buffer = fwd ? d.buffer : d.reversed;
            src.playbackRate.value = Math.min(4, Math.max(0.15, rate));
            src.connect(g).connect(out);
            const t = ctx.currentTime;
            const len = dt * 1.6;
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(1, t + 0.006);
            g.gain.setValueAtTime(1, t + len - 0.01);
            g.gain.linearRampToValueAtTime(0, t + len);
            const startAt = fwd ? from : d.duration() - from;
            src.start(t, Math.max(0, startAt), len * src.playbackRate.value + 0.02);
            if (grain) { try { grain.stop(t + 0.008); } catch (e) { /* ended */ } }
            grain = src;
        };
        d.scratchEnd = () => {
            d.scratching = false;
            if (resume) d.play();
        };

        return d;
    }

    // Wires a .deck element to an engine: label/tonearm follow position, record is draggable.
    function bindDeck(deckEl, engine, onFrame) {
        const label = deckEl.querySelector('.deck-label');
        const strobe = deckEl.querySelector('.deck-strobe');
        const platter = deckEl.querySelector('.deck-platter');
        const ARM_REST = 8, ARM_START = 33, ARM_END = 48;
        let raf;

        function frame() {
            const p = engine.progress();
            const rot = `rotate(${engine.angle().toFixed(2)}deg)`;
            label.style.transform = rot;
            if (strobe) strobe.style.transform = rot;
            const active = engine.playing || engine.scratching || (engine.offset > 0 && engine.offset < engine.duration());
            deckEl.style.setProperty('--arm', (active ? ARM_START + (ARM_END - ARM_START) * p : ARM_REST) + 'deg');
            if (onFrame) onFrame(p, engine);
            raf = requestAnimationFrame(frame);
        }

        function center() {
            const r = platter.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
        }
        const angleOf = (e, c) => Math.atan2(e.clientY - c.y, e.clientX - c.x);

        platter.addEventListener('pointerdown', e => {
            const c = center();
            if (Math.hypot(e.clientX - c.x, e.clientY - c.y) > c.r) return;
            platter.setPointerCapture(e.pointerId);
            deckEl.classList.add('is-scratching');
            engine.scratchStart();
            let last = angleOf(e, c);
            const move = ev => {
                const a = angleOf(ev, c);
                let da = a - last;
                if (da > Math.PI) da -= 2 * Math.PI;
                if (da < -Math.PI) da += 2 * Math.PI;
                last = a;
                engine.scratchMove(da / (2 * Math.PI));
            };
            const up = () => {
                platter.removeEventListener('pointermove', move);
                deckEl.classList.remove('is-scratching');
                engine.scratchEnd();
            };
            platter.addEventListener('pointermove', move);
            platter.addEventListener('pointerup', up, { once: true });
            platter.addEventListener('pointercancel', up, { once: true });
        });

        frame();
        return () => cancelAnimationFrame(raf);
    }

    // ------------------------------------------------------------ power-on
    // opts: { dial, meters, needleTo, onReady }. Staggered, slightly random start times
    // so the bulbs, meters, displays and pilot lamps don't all come up at once.
    const POWER_GROUPS = [
        ['.dial', 120, 160],
        ['.meter-face', 260, 220],
        ['.lamp.is-on:not(.is-standby), .led.is-on', 380, 300],
        ['.seg, .lcd-glass', 560, 380],
        ['.program-glass, .hunt-lens', 720, 260],
        ['.tracks, .readout, .tag', 880, 420],
    ];
    function power(on, opts) {
        const body = document.body;
        const o = opts || {};
        if (!on) {
            body.classList.remove('is-powering-on');
            body.classList.add('is-off');
            if (o.meters) { vu.hold = true; o.meters.forEach(m => setMeter(m, 0)); }
            return;
        }
        POWER_GROUPS.forEach(([sel, base, jitter]) => {
            document.querySelectorAll(sel).forEach(el => el.style.setProperty('--pd', Math.round(base + Math.random() * jitter) + 'ms'));
        });
        body.classList.remove('is-off');
        body.classList.add('is-powering-on');
        // meters: the turn-on thump slams the needles over, then they fall back
        if (o.meters) {
            vu.hold = true;
            setTimeout(() => o.meters.forEach(m => setMeter(m, 1.06)), 420);
            setTimeout(() => o.meters.forEach(m => setMeter(m, 0)), 900);
            setTimeout(() => { vu.hold = false; }, 1500);
        }
        // tuning pointer drifts up from the bottom of the band to the selected station
        if (o.dial && o.needleTo != null) {
            o.dial.style.setProperty('--needle-t', '0ms');
            o.dial.style.setProperty('--needle-pos', 0);
            setTimeout(() => {
                o.dial.style.setProperty('--needle-t', '1500ms');
                o.dial.style.setProperty('--needle-pos', o.needleTo);
            }, 700);
        }
        setTimeout(() => {
            body.classList.remove('is-powering-on');
            if (o.onReady) o.onReady();
        }, 2600);
    }

    window.SHControls = {
        buildMeter, setMeter, initMeters,
        initKnob,
        setDialNeedle, setDialSeeking, initDepthDial,
        initMarquee, typePlaceholder,
        startVU, stopVU, scanDial,
        createDeck, bindDeck,
        power,
    };
})();
