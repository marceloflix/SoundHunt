// ── Turntable: 30s iTunes previews on the SH-1977 deck ──
// Previews are fetched + decoded into one shared Web Audio deck (SHControls.createDeck) so the
// record can be scratched and the receiver's VU meters read the real signal. If a preview
// can't be fetched/decoded, a plain <audio> element plays it instead (no scratching then).
let currentPreviewBtn = null;   // the track row's .track-play button (read by playlist.js)

let deckEngine     = null;      // shared SHControls deck, created on the first preview (user gesture)
let fallbackAudio  = null;      // HTMLAudioElement used when Web Audio decode fails
let deckLoading    = false;     // a preview is being searched / fetched
let deckLoadToken  = 0;         // guards against out-of-order async loads
let deckWasPlaying = false;     // last state pushed to the UI
let deckLoadChain  = Promise.resolve();   // engine.load() calls run one at a time

const DECK_ARM = { rest: 8, start: 33, end: 48 };   // mirrors bindDeck() in controls.js
const DECK_SECONDS_PER_TURN = 1.8;                  // 33⅓ rpm

// JSONP search for iTunes (bypasses CORS restrictions on file:/// origin)
function searchItunesJSONP(term) {
    return new Promise((resolve, reject) => {
        const callbackName = 'itunes_cb_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
        const script = document.createElement('script');
        let done = false;

        const timeout = setTimeout(() => {
            if (done) return;
            done = true;
            cleanup();
            reject(new Error('iTunes search timed out'));
        }, 7000);

        function cleanup() {
            clearTimeout(timeout);
            delete window[callbackName];
            if (script.parentNode) script.parentNode.removeChild(script);
        }

        window[callbackName] = function(data) {
            if (done) return;
            done = true;
            cleanup();
            resolve(data);
        };

        script.onerror = function() {
            if (done) return;
            done = true;
            cleanup();
            reject(new Error('iTunes JSONP load error'));
        };

        script.src = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&limit=1&media=music&callback=${callbackName}`;
        document.head.appendChild(script);
    });
}

// Row play button: loading (spinner) / playing (pause, row lit) / idle (play).
function setTrackBtnState(btn, state) {
    if (!btn) return;
    const row = btn.closest ? btn.closest('.track-row') : null;
    btn.classList.toggle('is-loading', state === 'loading');
    if (state === 'loading') {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>';
        btn.title = 'Loading preview...';
        btn.setAttribute('aria-label', 'Loading preview');
        if (row) row.classList.remove('is-playing');
    } else if (state === 'playing') {
        btn.innerHTML = '<i class="fas fa-pause" aria-hidden="true"></i>';
        btn.title = 'Pause preview';
        btn.setAttribute('aria-label', 'Pause preview');
        if (row) row.classList.add('is-playing');
    } else {
        // idle / stopped / paused
        btn.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i>';
        btn.title = 'Preview 30s';
        btn.setAttribute('aria-label', 'Preview 30s');
        if (row) row.classList.remove('is-playing');
    }
}

function setAudioPlayerTitle(text) {
    const titleEl = document.getElementById('audio-track-title');
    const wrapper = document.getElementById('audio-track-title-wrapper');
    if (!titleEl) return;
    titleEl.textContent = text;
    titleEl.classList.remove('marquee-anim');
    titleEl.style.removeProperty('--marquee-distance');
    titleEl.style.removeProperty('--marquee-duration');

    requestAnimationFrame(() => {
        if (!wrapper || !titleEl) return;
        const overflow = titleEl.scrollWidth - wrapper.clientWidth;
        if (overflow > 4 && window.innerWidth <= 768) {
            const distance = overflow + 12;
            const duration = Math.max(7, Math.min(14, distance / 12 + 4));
            // transport.css scrolls by translateX(distance * -1)
            titleEl.style.setProperty('--marquee-distance', `${distance}px`);
            titleEl.style.setProperty('--marquee-duration', `${duration}s`);
            titleEl.classList.add('marquee-anim');
        }
    });
}

// ── Deck plumbing ──
function formatDeckTime(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function deckPosition() {
    if (fallbackAudio) return fallbackAudio.currentTime || 0;
    return deckEngine ? deckEngine.position() : 0;
}

function deckDuration() {
    if (fallbackAudio) return isFinite(fallbackAudio.duration) && fallbackAudio.duration > 0 ? fallbackAudio.duration : 30;
    return deckEngine ? deckEngine.duration() : 30;
}

function isDeckPlaying() {
    if (fallbackAudio) return !fallbackAudio.paused && !fallbackAudio.ended;
    if (!deckEngine) return false;
    // a scratch pauses the engine; keep the lamp/button steady while the hand is on the record
    return deckEngine.scratching ? deckWasPlaying : deckEngine.playing;
}

function syncDeckState(force) {
    const playing = isDeckPlaying();
    if (!force && playing === deckWasPlaying) return;
    deckWasPlaying = playing;

    const bar = document.getElementById('audio-player-bar');
    const lamp = document.getElementById('deck-lamp');
    const playPauseEl = document.getElementById('audio-play-pause');
    if (bar) bar.classList.toggle('is-playing', playing);
    if (lamp) lamp.classList.toggle('is-on', playing);
    if (playPauseEl && !deckLoading) {
        playPauseEl.innerHTML = playing ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
        playPauseEl.title = playing ? 'Pause preview' : 'Play preview';
    }
    if (currentPreviewBtn && !deckLoading) setTrackBtnState(currentPreviewBtn, playing ? 'playing' : 'idle');
}

// Runs every animation frame from bindDeck(), after it has placed the label and tonearm.
function onDeckFrame(progress) {
    const fill = document.getElementById('audio-progress-fill');
    const timeEl = document.getElementById('deck-time');
    const pos = deckPosition();
    const dur = deckDuration();
    const p = fallbackAudio ? Math.min(1, pos / dur) : progress;

    if (fallbackAudio) {
        // no decoded buffer: drive the label and arm from the <audio> element instead
        const deckEl = document.getElementById('deck');
        const rot = `rotate(${((pos / DECK_SECONDS_PER_TURN) * 360).toFixed(2)}deg)`;
        const label = deckEl.querySelector('.deck-label');
        const strobe = deckEl.querySelector('.deck-strobe');
        if (label) label.style.transform = rot;
        if (strobe) strobe.style.transform = rot;
        const active = !fallbackAudio.paused || (pos > 0 && pos < dur);
        deckEl.style.setProperty('--arm', (active ? DECK_ARM.start + (DECK_ARM.end - DECK_ARM.start) * p : DECK_ARM.rest) + 'deg');
    }

    if (fill) fill.style.width = (p * 100) + '%';
    if (timeEl) {
        const text = formatDeckTime(pos) + ' / ' + formatDeckTime(dur);
        if (timeEl.textContent !== text) timeEl.textContent = text;
    }
    syncDeckState(false);
}

// Creates the shared deck once, inside a user gesture so the AudioContext may start.
function ensureDeck() {
    if (deckEngine) return deckEngine;
    if (!window.SHControls || !(window.AudioContext || window.webkitAudioContext)) return null;
    try {
        deckEngine = SHControls.createDeck();
    } catch (e) {
        console.warn('Turntable: Web Audio unavailable, using plain audio.', e);
        deckEngine = null;
        return null;
    }
    deckEngine.onEnded = () => {
        deckEngine.offset = 0;   // lift the arm back to the rest
        syncDeckState(true);
    };
    const deckEl = document.getElementById('deck');
    if (deckEl) SHControls.bindDeck(deckEl, deckEngine, onDeckFrame);
    SHControls.startVU(document.querySelectorAll('.glass-meters .meter'), { analyser: deckEngine.analyser });
    return deckEngine;
}

function stopFallbackAudio() {
    if (!fallbackAudio) return;
    const a = fallbackAudio;
    fallbackAudio = null;
    a.onplay = a.onpause = a.onended = a.onerror = a.ontimeupdate = null;
    a.pause();
    a.removeAttribute('src');
    try { a.load(); } catch (e) { /* ignore */ }
}

// Stops whatever is on the platter and empties the engine (so a scratch can't replay it).
function unloadDeck() {
    stopFallbackAudio();
    if (deckEngine) {
        deckEngine.pause();
        deckEngine.stopSource();
        deckEngine.buffer = null;
        deckEngine.reversed = null;
        deckEngine.offset = 0;
    }
}

function setDeckArt(url) {
    const img = document.getElementById('deck-art');
    if (!img) return;
    if (url) {
        img.onerror = () => img.removeAttribute('src');
        img.src = url;
    } else {
        img.removeAttribute('src');
    }
}

function deckBadgesHTML(analysis) {
    const bpmGroup = value => `<span class="readout-group"><span class="fn-legend">BPM</span><span class="seg" data-ghost="888">${escapeHtml(value)}</span></span>`;
    if (analysis === 'loading') {
        return bpmGroup('---') + '<span class="readout-group"><span class="fn-legend">Key</span><span class="tag tag-muted tag-loading" title="Analysing tempo and key">···</span></span>';
    }
    if (!analysis || analysis.unavailable || !analysis.bpm || !analysis.camelot) {
        return bpmGroup('---') + '<span class="readout-group"><span class="fn-legend">Key</span><span class="tag tag-muted">—</span></span>';
    }
    let color = analysis.color || (typeof CAMELOT_COLORS !== 'undefined' ? CAMELOT_COLORS[analysis.camelot] : '');
    if (!/^#[0-9a-f]{3,8}$/i.test(color || '')) color = '';
    const tagStyle = color ? ` style="--tag:${color}"` : '';
    return bpmGroup(String(analysis.bpm)) +
        `<span class="readout-group"><span class="fn-legend">Key</span><span class="tag"${tagStyle} title="Camelot key ${escapeHtml(analysis.camelot)}">${escapeHtml(analysis.camelot)}</span></span>`;
}

function setDeckBadges(analysis) {
    const el = document.getElementById('audio-track-badges');
    if (el) el.innerHTML = analysis === null ? '' : deckBadgesHTML(analysis);
}

function setDeckLoading(on) {
    deckLoading = on;
    const playPauseEl = document.getElementById('audio-play-pause');
    if (on && playPauseEl) playPauseEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
}

// Shows a short message on the plate, then lowers the deck if nothing else was cued meanwhile.
function failPreview(btn, token, message) {
    deckLoading = false;
    setTrackBtnState(btn, 'idle');
    if (currentPreviewBtn === btn) currentPreviewBtn = null;
    setAudioPlayerTitle(message);
    const playPauseEl = document.getElementById('audio-play-pause');
    if (playPauseEl) playPauseEl.innerHTML = '<i class="fas fa-xmark"></i>';
    setDeckBadges(null);
    setTimeout(() => {
        if (token === deckLoadToken && !deckLoading && !isDeckPlaying()) closeAudioPlayer();
    }, 2000);
}

// Serialises engine.load(): a slow, superseded load must not land on top of a newer record.
function loadOnDeck(engine, url, token) {
    const run = deckLoadChain.then(() => (token === deckLoadToken ? engine.load(url) : Promise.reject(new Error('superseded'))));
    deckLoadChain = run.catch(() => {});
    return run;
}

function playFallbackAudio(url, token) {
    const audio = new Audio(url);
    fallbackAudio = audio;
    audio.onplay = audio.onpause = audio.onended = () => syncDeckState(true);
    // without Web Audio there is no bindDeck() frame loop; drive the plate from the element
    audio.ontimeupdate = () => { if (!deckEngine) onDeckFrame(0); };
    audio.onerror = () => {
        if (fallbackAudio !== audio) return;
        stopFallbackAudio();
        failPreview(currentPreviewBtn, token, 'Playback error');
    };
    return audio.play().catch(err => console.warn('Autoplay audio notice:', err));
}

async function previewTrack(trackName, btn) {
    if (typeof isPowered === 'function' && !isPowered()) {
        if (typeof nudgePower === 'function') nudgePower();
        return;
    }
    const bar = document.getElementById('audio-player-bar');

    // Same record: start/stop (or still cueing: ignore the extra tap)
    if (btn && currentPreviewBtn === btn && deckLoading) return;
    if (btn && currentPreviewBtn === btn && !deckLoading && (fallbackAudio || (deckEngine && deckEngine.buffer))) {
        toggleAudioPlayback();
        return;
    }

    // Create/resume the audio context now, while we're still inside the click.
    const engine = ensureDeck();
    if (engine && engine.ctx.state === 'suspended') engine.ctx.resume().catch(() => {});

    // Lift the needle off the current record
    unloadDeck();
    if (currentPreviewBtn && currentPreviewBtn !== btn) setTrackBtnState(currentPreviewBtn, 'idle');

    const token = ++deckLoadToken;
    currentPreviewBtn = btn;
    setDeckLoading(true);
    syncDeckState(true);
    setTrackBtnState(btn, 'loading');
    setAudioPlayerTitle('Searching...');
    setDeckArt(null);
    setDeckBadges(null);
    if (bar) bar.classList.add('active');

    try {
        let data;
        try {
            data = await searchItunesJSONP(trackName);
        } catch (jsonpErr) {
            console.warn('JSONP search failed, trying direct fetch:', jsonpErr);
            const resp = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(trackName)}&limit=1&media=music`);
            data = resp.ok ? await resp.json() : null;
        }
        if (token !== deckLoadToken) return;

        if (!data || !data.results || data.results.length === 0 || !data.results[0].previewUrl) {
            failPreview(btn, token, 'No preview available');
            return;
        }

        const preview = data.results[0];
        setAudioPlayerTitle(`${preview.artistName} — ${preview.trackName}`);
        setDeckArt(preview.artworkUrl100 ? preview.artworkUrl100.replace('100x100', '300x300') : null);

        // BPM / key readouts
        const cachedAnalysis = typeof getCachedAnalysis === 'function' ? getCachedAnalysis(trackName) : null;
        if (cachedAnalysis && cachedAnalysis.bpm && cachedAnalysis.camelot) {
            setDeckBadges(cachedAnalysis);
        } else if (typeof analyzeTrackAudio === 'function') {
            setDeckBadges('loading');
            analyzeTrackAudio(trackName, preview.previewUrl).then(res => {
                if (token === deckLoadToken) setDeckBadges(res);
                const row = btn && btn.closest ? btn.closest('.track-row') : null;
                if (row && typeof renderTrackBadgeResult === 'function') {
                    renderTrackBadgeResult(row, res);
                }
            }).catch(() => {
                if (token === deckLoadToken) setDeckBadges(null);
            });
        }

        // Put the record on: decode for the deck, or fall back to a plain <audio>
        let decoded = false;
        if (engine) {
            try {
                await loadOnDeck(engine, preview.previewUrl, token);
                decoded = true;
            } catch (decodeErr) {
                if (token !== deckLoadToken) return;
                console.warn('Turntable: decode failed, falling back to plain audio:', decodeErr);
            }
        }
        if (token !== deckLoadToken) {
            // another track was cued while this one loaded; leave the new one alone
            return;
        }
        deckLoading = false;
        if (decoded) {
            engine.play();
        } else {
            unloadDeck();
            await playFallbackAudio(preview.previewUrl, token);
        }
        syncDeckState(true);
    } catch (e) {
        if (token !== deckLoadToken) return;
        console.error('Audio preview failed:', e);
        unloadDeck();
        failPreview(btn, token, 'Preview failed');
    }
}

function toggleAudioPlayback() {
    if (deckLoading) return;
    if (fallbackAudio) {
        if (fallbackAudio.paused) {
            if (typeof isPowered === 'function' && !isPowered()) { if (typeof nudgePower === 'function') nudgePower(); return; }
            fallbackAudio.play().catch(e => console.warn('Play error:', e));
        } else {
            fallbackAudio.pause();
        }
    } else if (deckEngine && deckEngine.buffer) {
        if (deckEngine.playing) {
            deckEngine.pause();
        } else {
            if (typeof isPowered === 'function' && !isPowered()) { if (typeof nudgePower === 'function') nudgePower(); return; }
            deckEngine.play();
        }
    }
    syncDeckState(true);
}

function closeAudioPlayer() {
    deckLoadToken++;
    deckLoading = false;
    unloadDeck();
    const btn = currentPreviewBtn;
    currentPreviewBtn = null;
    if (btn) setTrackBtnState(btn, 'idle');
    syncDeckState(true);

    const bar = document.getElementById('audio-player-bar');
    if (bar) bar.classList.remove('active', 'is-playing');
    const fill = document.getElementById('audio-progress-fill');
    if (fill) fill.style.width = '0%';
    const timeEl = document.getElementById('deck-time');
    if (timeEl) timeEl.textContent = '0:00 / 0:30';
    setDeckBadges(null);
    setDeckArt(null);
    const titleEl = document.getElementById('audio-track-title');
    if (titleEl) {
        titleEl.textContent = '—';
        titleEl.classList.remove('marquee-anim');
    }
}

window.addEventListener('resize', () => {
    const bar = document.getElementById('audio-player-bar');
    if (bar && bar.classList.contains('active')) {
        const titleEl = document.getElementById('audio-track-title');
        if (titleEl && titleEl.textContent && titleEl.textContent !== '—') {
            setAudioPlayerTitle(titleEl.textContent);
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // Click the strobe stripe to seek
    const progressContainer = document.getElementById('audio-progress');
    if (progressContainer) {
        progressContainer.addEventListener('click', (e) => {
            const rect = progressContainer.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            if (fallbackAudio) {
                if (isFinite(fallbackAudio.duration)) fallbackAudio.currentTime = pct * fallbackAudio.duration;
            } else if (deckEngine && deckEngine.buffer) {
                deckEngine.seek(pct * deckEngine.duration());
            } else {
                return;
            }
            const fill = document.getElementById('audio-progress-fill');
            if (fill) fill.style.width = (pct * 100) + '%';
        });
    }
});
