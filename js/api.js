// ── Gemini API Configuration & Engine ──
async function fetchWithRetry(url, options, retries = 2) {
    const delays = [1200, 2500];
    for (let i = 0; i < retries; i++) {
        const response = await fetch(url, options);
        if (response.ok) return await response.json();
        const body = await response.text();
        if (response.status === 400 || response.status === 403) throw new Error(`API_KEY_ERROR: ${body}`);
        if (response.status === 429 || response.status === 503) {
            if (i < retries - 1) {
                await new Promise(r => setTimeout(r, delays[i]));
                continue;
            }
            throw new Error(`RATE_LIMIT: ${body}`);
        }
        throw new Error(`HTTP ${response.status}: ${body}`);
    }
    throw new Error('MAX_RETRIES');
}

// ── Dial messages: errors, notices and loading text all show on the tuner glass ──
const DEPTH_ZONES = [
    { value: 'deep-cuts', center: 1 / 6, label: 'UNDERGROUND' },
    { value: 'balanced', center: 0.5, label: 'BALANCED' },
    { value: 'mainstream', center: 5 / 6, label: 'MAINSTREAM' },
];
let _dialTimer = null;
let _dialKind = '';

function dialIdleText() {
    if (typeof isPowered === 'function' && !isPowered()) return '';
    const zone = DEPTH_ZONES.find(z => z.value === getActiveDiscoveryChip()) || DEPTH_ZONES[1];
    return `READY · ${getTrackCount()} TRACKS · ${zone.label}`;
}

// kind: '' | 'error' | 'notice' | 'loading'. holdMs > 0 returns to the idle text afterwards.
function setDialMessage(text, kind = '', holdMs = 0) {
    const el = document.getElementById('dial-msg');
    if (!el) return;
    clearTimeout(_dialTimer);
    _dialKind = kind;
    el.className = 'dial-msg' + (kind ? ' is-' + kind : '');
    el.textContent = text;
    if (holdMs > 0) _dialTimer = setTimeout(refreshDialIdle, holdMs);
}

function refreshDialIdle() {
    setDialMessage(dialIdleText());
}

function showError(msg) {
    setDialMessage(msg, 'error', 9000);
}

function showNotice(msg, autoDismissMs = 8000) {
    setDialMessage(msg, 'notice', autoDismissMs);
}

function hideNotice() {
    if (_dialKind === 'notice') refreshDialIdle();
}

// ── Rate-Limit Countdown ──
let _rateTimer = null;
function showRateLimitCountdown(seconds = 20) {
    let remaining = seconds;
    clearInterval(_rateTimer);
    const update = () => setDialMessage(`RATE LIMITED · RETRY IN ${remaining}s`, 'error');
    update();
    _rateTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) { clearInterval(_rateTimer); refreshDialIdle(); return; }
        update();
    }, 1000);
}

// ── Loading Messages ──
const LOADING_MSGS = [
    'SCANNING THE AIRWAVES…',
    'DIGGING THROUGH VINYL ARCHIVES…',
    'UNEARTHING BURIED GEMS…',
    'MATCHING VIBES & ERAS…',
    'CURATING YOUR PROGRAM…'
];
let loadingInterval = null;

function startLoadingMessages() {
    let idx = 0;
    setDialMessage(LOADING_MSGS[0], 'loading');
    clearInterval(loadingInterval);
    loadingInterval = setInterval(() => {
        idx = (idx + 1) % LOADING_MSGS.length;
        setDialMessage(LOADING_MSGS[idx], 'loading');
    }, 1800);
}

function stopLoadingMessages() {
    if (loadingInterval) { clearInterval(loadingInterval); loadingInterval = null; }
}

// ── Shared API schema ──
const GEMINI_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        title: { type: 'STRING' },
        description: { type: 'STRING' },
        tracks: { 
            type: 'ARRAY', 
            items: { 
                type: 'OBJECT',
                properties: {
                    title: { type: 'STRING' },
                    artist: { type: 'STRING' }
                },
                required: ['title', 'artist']
            } 
        },
        energy: { type: 'INTEGER' },
        genre: { type: 'STRING' }
    },
    required: ['title', 'description', 'tracks', 'energy', 'genre']
};

// ── Core API Generator with Minimal Thinking for Maximum Speed ──
async function executeGeminiGenerate(apiKey, prompt) {
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: GEMINI_RESPONSE_SCHEMA,
            maxOutputTokens: 2500,
            thinkingConfig: {
                thinkingLevel: 'MINIMAL'
            }
        }
    };
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    
    try {
        const data = await fetchWithRetry(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!responseText) throw new Error('NO_CONTENT');
        return JSON.parse(responseText);
    } catch (err) {
        // If thinkingConfig is rejected for any reason, safely retry once without it
        if (err.message && (err.message.includes('thinkingConfig') || err.message.includes('thinkingLevel') || err.message.includes('thinking_config') || err.message.includes('INVALID_ARGUMENT'))) {
            delete payload.generationConfig.thinkingConfig;
            const retryData = await fetchWithRetry(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const fallbackText = retryData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!fallbackText) throw new Error('NO_CONTENT');
            return JSON.parse(fallbackText);
        }
        throw err;
    }
}

// ── Generate Playlist ──
let _generating = false;

async function generateMix() {
    // Like the real thing: nothing works until POWER is on.
    if (typeof isPowered === 'function' && !isPowered()) { if (typeof nudgePower === 'function') nudgePower(); return; }
    if (_generating) return; // HUNT is already scanning (also stops Enter from double-firing)

    const apiKey = getApiKey();
    if (!apiKey) { showError('NO ANTENNA · CONNECT YOUR GEMINI KEY ON THE REAR PANEL'); openSettings(); return; }

    const vibeInput = document.getElementById('ai-vibe');
    const vibe = vibeInput.value.trim() || 'Retro 2000s Pop';
    const trackCount = getTrackCount();

    const btn = document.getElementById('generate-btn');
    _generating = true;
    btn.classList.add('is-busy');
    startLoadingMessages();
    const stopScan = SHControls.scanDial(document.getElementById('dial'), document.querySelectorAll('.glass-meters .meter'));
    let lockedText = '';

    const persona = getPromptPersona() || 'an elite music curator and musicologist with encyclopedic knowledge of genres, eras, and discographies';
    const constraints = getPromptConstraints();
    const explicit = getPromptExplicit() === 'clean' ? 'Only choose CLEAN, non-explicit tracks.' : 'Explicit tracks are allowed.';
    const chip = typeof getActiveDiscoveryChip === 'function' ? getActiveDiscoveryChip() : 'balanced';
    let popString = '';
    if (chip === 'deep-cuts') {
        popString = 'CRITICAL DISCOVERY FOCUS: Prioritize underground, rare vinyl B-sides, obscure hidden gems, and lesser-known authentic tracks. Avoid predictable, overplayed commercial radio hits.';
    } else if (chip === 'mainstream') {
        popString = 'DISCOVERY FOCUS: Prioritize celebrated mainstream hits, iconic classics, and timeless crowd-pleasers.';
    } else {
        popString = 'DISCOVERY FOCUS: Provide a balanced blend of famous essentials and exciting, lesser-known hidden gems.';
    }

    const prompt = `You are ${persona}. Discover a cohesive, high-quality, highly authentic ${trackCount}-track selection for vibe or genre: "${vibe}".
${constraints}
${popString}
${explicit}

ERA & RELEASE DATE ACCURACY (CRITICAL):
- If the vibe/prompt mentions or implies a specific decade, era, or year range (e.g., "80s", "90s", "70s", "2000s", "80's 90's", etc.):
  * EVERY selected track MUST have been genuinely originally released or recorded during that exact era.
  * NEVER include modern retro-revival songs or tracks released outside that timeframe. (For example, if the prompt says "80's 90's synthwave" or "80s synth music", pick authentic 1980s and 1990s synth-pop, new wave, and electronic music like Depeche Mode, New Order, Giorgio Moroder, Gary Numan, Kraftwerk, Jan Hammer, Pet Shop Boys, A-ha, Tears for Fears, etc. Do NOT include 2010s/2020s songs like The Weeknd, Kavinsky, or The Midnight).
- Only select real, existing songs by actual artists that strictly honor the era and sonic vibe.

CRITICAL ARTIST & SONG ATTRIBUTION (ZERO HALLUCINATIONS):
- ABSOLUTE FACTUAL INTEGRITY: NEVER invent or hallucinate songs or mix up artist attributions. Every track MUST be a real, verified song that genuinely exists in official discographies (Spotify, Apple Music, Discogs).
- EXACT PRIMARY RECORDING ARTIST: Always credit the official primary artist on the original single/album release. Do NOT confuse solo artists with their former bands or side projects:
  * "Careless Whisper", "Faith", "Father Figure", "Freedom! '90" -> Artist MUST be "George Michael" (NOT Wham!).
  * "In the Air Tonight", "Against All Odds", "Another Day in Paradise" -> Artist MUST be "Phil Collins" (NOT Genesis).
  * "Englishman in New York", "Fields of Gold" -> Artist MUST be "Sting" (NOT The Police).
  * "Billie Jean", "Thriller", "Rock with You" -> Artist MUST be "Michael Jackson" (NOT The Jackson 5).
  * "Sledgehammer", "In Your Eyes" -> Artist MUST be "Peter Gabriel" (NOT Genesis).
  * "Live and Let Die", "Band on the Run" -> Artist MUST be "Paul McCartney" or "Wings" (NOT The Beatles).
  * "Hello", "All Night Long" -> Artist MUST be "Lionel Richie" (NOT The Commodores).
  * "I'm Coming Out", "Upside Down" -> Artist MUST be "Diana Ross" (NOT The Supremes).
- NEVER MASH UP ARTISTS: If you are not 100% sure that an artist recorded a specific track, DO NOT guess — choose a different verified song that authentically matches the vibe.

Output specifications:
- Energy: integer 1-5 (1=chill/ambient, 2=relaxed, 3=moderate, 4=energetic, 5=intense/peak).
- Description: 2 sentences max. Informative and direct on mood, sonic character, era authenticity, and ideal context.`;

    try {
        const mixData = await executeGeminiGenerate(apiKey, prompt);
        mixData._prompt = vibe;
        mixData._focus = chip;
        renderNewMix(mixData, true);
        savePrompt(vibe);
        vibeInput.value = '';
        releasePresets();
        lockedText = `LOCKED · ${(mixData.tracks || []).length} TRACKS FOUND`;

        if (getAutoScroll()) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (error) {
        console.error('Gemini API Error:', error);
        const msg = error.message || '';
        stopLoadingMessages();
        if (msg.includes('API_KEY_ERROR')) {
            showError('BAD ANTENNA · CHECK YOUR API KEY ON THE REAR PANEL');
        } else if (msg.includes('RATE_LIMIT') || msg.includes('QUOTA_EXHAUSTED') || msg.includes('MAX_RETRIES') || msg.includes('429')) {
            showRateLimitCountdown(20);
        } else {
            showError('NO SIGNAL · CONNECTION FAILED, PLEASE TRY AGAIN');
        }
    } finally {
        _generating = false;
        btn.classList.remove('is-busy');
        stopLoadingMessages();
        const zone = DEPTH_ZONES.find(z => z.value === chip) || DEPTH_ZONES[1];
        stopScan(zone.center);
        if (lockedText) setDialMessage(lockedText, '', 6000);
    }
}

// ── Discovery Popularity Chips (Main Interface) ──
// The discovery depth is the tuning needle (set with the flywheel, see ui.js).
let _depthDial = null;

function getActiveDiscoveryChip() {
    if (_depthDial) return _depthDial.get();
    return localStorage.getItem('soundhunt_discovery_chip') || 'balanced';
}

function setDiscoveryChip(mode) {
    if (_depthDial) _depthDial.set(mode);
    localStorage.setItem('soundhunt_discovery_chip', mode);
}

// ── Dig Deeper Modal Controller (Magnifying Glass) ──
let _digDeeperTarget = {
    ts: null,
    index: null,
    artist: '',
    title: '',
    count: 5
};

function openDigDeeperModal(ts, index, artist, title) {
    if (typeof isPowered === 'function' && !isPowered()) { if (typeof nudgePower === 'function') nudgePower(); return; }
    _digDeeperTarget = {
        ts,
        index,
        artist: artist || '',
        title: title || '',
        count: 5
    };

    const label = _digDeeperTarget.artist
        ? `${_digDeeperTarget.artist} - ${_digDeeperTarget.title}`
        : _digDeeperTarget.title;

    const seedEl = document.getElementById('dig-deeper-seed');
    if (seedEl) seedEl.textContent = label;

    setDigDeeperCount(5);

    const modal = document.getElementById('dig-deeper-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeDigDeeperModal() {
    const modal = document.getElementById('dig-deeper-modal');
    if (modal) modal.classList.add('hidden');
}

function setDigDeeperCount(cnt) {
    const count = Math.max(1, Math.min(25, parseInt(cnt, 10) || 5));
    _digDeeperTarget.count = count;
    latchDigCount(count);

    const customInput = document.getElementById('dig-deeper-custom-count');
    if (customInput) customInput.value = count;
}

function onDigCustomCountChange(val) {
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 25) {
        _digDeeperTarget.count = parsed;
        latchDigCount(parsed);
    }
}

// The 3 / 5 / 10 keys latch like presets; a custom number releases them all.
function latchDigCount(count) {
    document.querySelectorAll('.dig-count-btn').forEach(btn => {
        btn.classList.toggle('is-latched', parseInt(btn.dataset.count, 10) === count);
    });
}

// Backwards compatibility alias
function promptSimilarTrackCount(artist, title, btn) {
    openDigDeeperModal(null, null, artist, title);
}

// ── Execute Dig Deeper: Append Similar Tracks to Existing Playlist ──
async function executeDigDeeper() {
    if (typeof isPowered === 'function' && !isPowered()) { if (typeof nudgePower === 'function') nudgePower(); return; }
    const { ts, artist, title, count } = _digDeeperTarget;
    const apiKey = getApiKey();
    if (!apiKey) {
        closeDigDeeperModal();
        showError('NO ANTENNA · CONNECT YOUR GEMINI KEY ON THE REAR PANEL');
        if (typeof openSettings === 'function') openSettings();
        return;
    }

    const submitBtn = document.getElementById('dig-deeper-submit-btn');
    const originalHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    const songLabel = artist ? `${artist} - ${title}` : title;
    closeDigDeeperModal();

    showNotice(`FINE TUNING · ${count} TRACKS LIKE ${songLabel}`, 15000);

    // Look up target mix upfront to build the exclusion list
    const history = typeof getHistory === 'function' ? getHistory() : [];
    const mix = history.find(m => String(m._timestamp) === String(ts));
    const existingTracks = (mix && Array.isArray(mix.tracks)) ? mix.tracks : [];
    const existingTrackLabels = existingTracks.map(t => {
        if (typeof t === 'object' && t !== null) {
            return t.artist ? `${t.artist} - ${t.title}` : t.title;
        }
        return String(t);
    }).filter(Boolean);

    const forbiddenTracks = [songLabel, ...existingTrackLabels].filter(Boolean);
    const forbiddenListText = forbiddenTracks.slice(0, 40).map(t => `  * "${t}"`).join('\n');

    const explicit = getPromptExplicit() === 'clean' ? 'Only choose CLEAN, non-explicit tracks.' : 'Explicit tracks are allowed.';
    const chip = getActiveDiscoveryChip();
    let depthGuidance = '';
    if (chip === 'deep-cuts') {
        depthGuidance = 'CRITICAL: Prioritize obscure gems, rare b-sides, and underground cuts that sound astonishingly close to this groove. Avoid commercial radio tracks.';
    } else if (chip === 'mainstream') {
        depthGuidance = 'Prioritize well-known essentials, iconic anthems, and popular songs that share this energy.';
    } else {
        depthGuidance = 'Provide a balanced blend of authentic gems, compatible classics, and exciting discoveries.';
    }

    // Request extra candidates so deduplication guarantees exact count
    const requestedCandidates = Math.min(25, count + 3);

    const prompt = `You are an elite crate digger, sonic curator, and record specialist for SoundHunt.
Discover exactly ${requestedCandidates} tracks that share the authentic sonic DNA, groove, production era, and mood of:
Seed Track: "${title}"
Artist: "${artist}"

${explicit}
${depthGuidance}

STRICT SELECTION CRITERIA:
- Unearth real, existing songs by genuine artists that sound like they belong in the exact same DJ crate or listening session.
- ZERO HALLUCINATIONS & FACTUAL ARTIST INTEGRITY: NEVER invent or guess songs or attribute tracks to the wrong artist. Every track MUST be a real, verified song that exists in official discographies (Spotify, Apple Music, Discogs).
- PRIMARY ARTIST ATTRIBUTION: Always credit the official primary artist (e.g. "George Michael", NOT "Wham!"; "Phil Collins", NOT "Genesis"; "Sting", NOT "The Police").
- STRICT ERA AUTHENTICITY: If the seed song is from a specific decade (e.g. 80s, 90s, 70s, 2000s), every discovered track MUST be an authentic release from that era. Do NOT suggest modern retro revival tracks.

ABSOLUTE NO-DUPLICATION RULES (CRITICAL):
- NEVER include or repeat the seed track "${songLabel}" in your recommendations.
${forbiddenTracks.length > 0 ? `- DO NOT recommend any of the following songs already present in this playlist:\n${forbiddenListText}\n` : ''}- Every track in your response MUST be completely unique and distinct.

Output:
- Title: "Hunted from: ${songLabel}"
- Description: 2 short sentences explaining why these songs match this track's groove and vibe.`;

    try {
        const geminiResult = await executeGeminiGenerate(apiKey, prompt);
        const newTracks = Array.isArray(geminiResult.tracks) ? geminiResult.tracks : [];

        if (newTracks.length === 0) {
            showError('NO SIGNAL · NO SIMILAR TRACKS FOUND FOR THIS SONG');
            return;
        }

        // Helper to normalize track identity for strict comparison
        const normKey = (art, tit) => {
            const a = (art || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const t = (tit || '').toLowerCase()
                .replace(/\s*[\(\[\{].*?[\)\]\}]/g, '')
                .replace(/[^a-z0-9]/g, '');
            return `${a}:::${t}`;
        };

        const seenSongs = new Set();
        // Register seed track as forbidden
        seenSongs.add(normKey(artist, title));
        if (title) seenSongs.add(normKey('', title));

        // Register all current playlist tracks as forbidden
        existingTracks.forEach(t => {
            const art = typeof t === 'object' && t !== null ? (t.artist || '') : (String(t).includes(' - ') ? String(t).split(' - ')[0] : '');
            const tit = typeof t === 'object' && t !== null ? (t.title || '') : (String(t).includes(' - ') ? String(t).split(' - ').slice(1).join(' - ') : String(t));
            seenSongs.add(normKey(art, tit));
        });

        // Filter incoming tracks strictly
        const uniqueProcessedTracks = [];
        for (const rawTrack of newTracks) {
            let art = '';
            let tit = '';
            if (typeof rawTrack === 'string') {
                const parts = rawTrack.split(' - ');
                art = parts.length > 1 ? parts[0].trim() : '';
                tit = parts.length > 1 ? parts.slice(1).join(' - ').trim() : rawTrack.trim();
            } else if (typeof rawTrack === 'object' && rawTrack !== null) {
                art = (rawTrack.artist || '').trim();
                tit = (rawTrack.title || '').trim();
            }

            if (!tit) continue;

            const key = normKey(art, tit);
            const titleOnlyKey = normKey('', tit);

            // Skip if duplicate of seed track, existing playlist track, or previously processed track
            if (seenSongs.has(key) || (art && seenSongs.has(titleOnlyKey))) {
                continue;
            }

            seenSongs.add(key);
            uniqueProcessedTracks.push({
                artist: art,
                title: tit,
                isDigDeeper: true
            });

            if (uniqueProcessedTracks.length >= count) {
                break;
            }
        }

        if (uniqueProcessedTracks.length === 0) {
            showError('ALL FOUND TRACKS WERE ALREADY IN THIS PROGRAM · TRY AGAIN');
            return;
        }

        if (mix && Array.isArray(mix.tracks)) {
            const firstNewIndex = mix.tracks.length;
            mix.tracks.push(...uniqueProcessedTracks);
            saveHistory(history);
            rebuildFeed();

            // Automatically queue sequential BPM/Key analysis for only the newly appended tracks
            if (typeof dspQueue !== 'undefined') {
                uniqueProcessedTracks.forEach((t, i) => {
                    dspQueue.enqueue({
                        ts: ts,
                        index: firstNewIndex + i,
                        track: t,
                        forceReanalyze: false
                    });
                });
            }

            showNotice(`LOCKED · ADDED ${uniqueProcessedTracks.length} TRACKS LIKE ${songLabel}`, 6000);

            // Scroll to the first newly added track and briefly highlight it
            setTimeout(() => {
                const firstNewEl = document.getElementById(`track-${ts}-${firstNewIndex}`);
                if (firstNewEl) {
                    firstNewEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    firstNewEl.classList.add('is-flash');
                    setTimeout(() => firstNewEl.classList.remove('is-flash'), 1500);
                } else {
                    const card = document.querySelector(`[data-ts="${ts}"]`);
                    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }, 100);
        } else {
            // Fallback if mix not in history (e.g. demo card): create as standalone mix
            geminiResult.tracks = uniqueProcessedTracks;
            geminiResult._prompt = `Hunted from: ${artist ? artist + ' - ' : ''}${title}`;
            renderNewMix(geminiResult, true);
            showNotice(`LOCKED · NEW PROGRAM WITH ${uniqueProcessedTracks.length} TRACKS LIKE ${songLabel}`, 6000);
        }
    } catch (err) {
        console.error('Dig deeper error:', err);
        showError('NO SIGNAL · FINE TUNE FAILED, PLEASE TRY AGAIN');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalHtml;
        }
    }
}
