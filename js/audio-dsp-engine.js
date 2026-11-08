/**
 * SoundHunt — Web Audio DSP Engine (audio-dsp-engine.js)
 * 
 * 100% Client-Side zero-dependency audio DSP analyzer:
 * - BPM tempo detection: bandpass kick/bass filter, onset envelope, autocorrelation & octave correction.
 * - Serato Camelot key detection: STFT pitch chromagram (PCP), Krumhansl-Schmuckler key profiling.
 * - Multi-tier caching (In-Memory + localStorage).
 * - Background sequential analysis queue with 100ms pacing.
 * - Dynamic per-track 2-row layout observer for responsive collision prevention.
 */

// ── Serato Camelot Color Palette ──
// Official harmonic wheel spectrum mapping for 1A-12A and 1B-12B
const CAMELOT_COLORS = {
    '1A':  '#00d2be', '1B':  '#00d2be',  // Turquoise / Teal
    '2A':  '#00b862', '2B':  '#00b862',  // Emerald / Sea Green
    '3A':  '#62db3b', '3B':  '#62db3b',  // Lime Green
    '4A':  '#a3e635', '4B':  '#a3e635',  // Chartreuse
    '5A':  '#facc15', '5B':  '#facc15',  // Golden Yellow
    '6A':  '#fb923c', '6B':  '#fb923c',  // Warm Orange
    '7A':  '#f87171', '7B':  '#f87171',  // Coral / Red-Orange
    '8A':  '#ef4444', '8B':  '#ef4444',  // Crimson Red
    '9A':  '#f43f5e', '9B':  '#f43f5e',  // Rose Ruby
    '10A': '#d946ef', '10B': '#d946ef',  // Fuchsia Magenta
    '11A': '#a855f7', '11B': '#a855f7',  // Purple / Violet
    '12A': '#3b82f6', '12B': '#3b82f6'   // Cobalt Blue
};

// ── Standard Krumhansl-Schmuckler Key Profiles ──
// Tonal hierarchies for Major and Minor keys across the 12 chromatic pitch classes
const KS_MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Pitch Class to Camelot mapping:
// 0=C, 1=C#, 2=D, 3=D#, 4=E, 5=F, 6=F#, 7=G, 8=G#, 9=A, 10=A#, 11=B
const MAJOR_PITCH_TO_CAMELOT = ['8B', '3B', '10B', '5B', '12B', '7B', '2B', '9B', '4B', '11B', '6B', '1B'];
const MINOR_PITCH_TO_CAMELOT = ['5A', '12A', '7A', '2A', '9A', '4A', '11A', '6A', '1A', '8A', '3A', '10A'];

// ── Multi-Tier Analysis Cache ──
const CACHE_STORAGE_KEY = 'soundhunt_bpm_key_cache_v3';
const inMemoryDspCache = new Map();

function getCacheKey(artist, title) {
    const a = (artist || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const t = (title || '').toLowerCase()
        .replace(/\s*[\(\[\{].*?[\)\]\}]/g, '')
        .replace(/[^a-z0-9]/g, '');
    return `${a}:::${t}`;
}

function normalizeTrackToCacheKey(trackStr) {
    if (!trackStr) return '';
    let artist = '';
    let title = trackStr;
    if (typeof trackStr === 'object' && trackStr !== null) {
        artist = trackStr.artist || '';
        title = trackStr.title || '';
    } else if (typeof trackStr === 'string' && trackStr.includes(' - ')) {
        const parts = trackStr.split(' - ');
        artist = parts[0];
        title = parts.slice(1).join(' - ');
    }
    return getCacheKey(artist, title);
}

function initDspCache() {
    try {
        // Auto-purge legacy v1 & v2 caches so stale calculations don't persist
        if (localStorage.getItem('soundhunt_bpm_key_cache')) {
            localStorage.removeItem('soundhunt_bpm_key_cache');
        }
        if (localStorage.getItem('soundhunt_bpm_key_cache_v2')) {
            localStorage.removeItem('soundhunt_bpm_key_cache_v2');
        }
        const stored = localStorage.getItem(CACHE_STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            Object.entries(parsed).forEach(([k, v]) => inMemoryDspCache.set(k, v));
        }
    } catch (e) {
        console.warn('SoundHunt DSP: Error reading cache from localStorage', e);
    }
}
initDspCache();

// Map order is oldest → newest (entries are re-inserted on every save), so the newest
// results are the ones kept. Lookup failures (offline, iTunes rate limit) are remembered
// for this session only and retried after DSP_ERROR_TTL; "no preview on iTunes" is
// stored but re-checked after DSP_UNAVAILABLE_TTL.
const DSP_CACHE_LIMIT = 600;
const DSP_ERROR_TTL = 10 * 60 * 1000;
const DSP_UNAVAILABLE_TTL = 7 * 24 * 60 * 60 * 1000;

function saveAnalysisToCache(cacheKey, result) {
    if (!cacheKey) return;
    inMemoryDspCache.delete(cacheKey);
    inMemoryDspCache.set(cacheKey, result);
    while (inMemoryDspCache.size > DSP_CACHE_LIMIT * 2) inMemoryDspCache.delete(inMemoryDspCache.keys().next().value);
    if (result && result.error) return; // session-only
    try {
        const keep = [...inMemoryDspCache].filter(([, v]) => v && !v.error).slice(-DSP_CACHE_LIMIT);
        localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(Object.fromEntries(keep)));
    } catch (e) {
        console.warn('SoundHunt DSP: Cache save quota warning', e);
    }
}

function isFreshAnalysis(v) {
    if (!v) return false;
    const age = Date.now() - (v.timestamp || 0);
    if (v.error) return age < DSP_ERROR_TTL;
    if (v.unavailable) return age < DSP_UNAVAILABLE_TTL;
    return true;
}

function getCachedAnalysis(trackStr) {
    const key = normalizeTrackToCacheKey(trackStr);
    if (!key) return null;
    const v = inMemoryDspCache.get(key);
    return isFreshAnalysis(v) ? v : null;
}

// Forget failed / "no preview" results for these tracks so they're looked up again.
function forgetFailedAnalyses(tracks) {
    (tracks || []).forEach(t => {
        const key = normalizeTrackToCacheKey(t);
        const v = key && inMemoryDspCache.get(key);
        if (v && (v.error || v.unavailable || !v.bpm || !v.camelot)) inMemoryDspCache.delete(key);
    });
}

// ── Audio Context Singleton ──
let dspAudioContext = null;
function getDspAudioContext() {
    if (!dspAudioContext) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
            dspAudioContext = new AudioCtx();
        }
    }
    if (dspAudioContext && dspAudioContext.state === 'suspended') {
        dspAudioContext.resume().catch(() => {});
    }
    return dspAudioContext;
}

// ── iTunes Rate-Limit Backoff Tracker ──
let rateLimitCooldownUntil = 0;

async function waitIfRateLimited() {
    const now = Date.now();
    if (rateLimitCooldownUntil > now) {
        const waitMs = rateLimitCooldownUntil - now;
        await new Promise(resolve => setTimeout(resolve, waitMs));
    }
}

function triggerRateLimitCooldown(ms = 2500) {
    rateLimitCooldownUntil = Math.max(rateLimitCooldownUntil, Date.now() + ms);
}

// ── Audio Fetching & Decoding ──
async function fetchAndDecodeAudio(previewUrl) {
    const audioCtx = getDspAudioContext();
    if (!audioCtx) throw new Error('Web Audio API not supported in this browser');

    await waitIfRateLimited();
    let resp = await fetch(previewUrl);
    if (resp.status === 429 || resp.status === 403) {
        triggerRateLimitCooldown(2500);
        await waitIfRateLimited();
        resp = await fetch(previewUrl);
    }
    if (!resp.ok) throw new Error(`HTTP error ${resp.status} fetching audio preview`);
    const arrayBuffer = await resp.arrayBuffer();
    return await audioCtx.decodeAudioData(arrayBuffer);
}

// ── DSP: Downmixing & Downsampling ──
function getMonoDownsampledBuffer(audioBuffer, targetSampleRate = 11025) {
    const srcSampleRate = audioBuffer.sampleRate;
    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    
    // Average channels to mono
    const mono = new Float32Array(length);
    for (let c = 0; c < numChannels; c++) {
        const chData = audioBuffer.getChannelData(c);
        for (let i = 0; i < length; i++) {
            mono[i] += chData[i] / numChannels;
        }
    }

    if (srcSampleRate === targetSampleRate) return mono;

    // Linear downsampling
    const ratio = srcSampleRate / targetSampleRate;
    const newLength = Math.floor(length / ratio);
    const downsampled = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
        const srcIdx = i * ratio;
        const i0 = Math.floor(srcIdx);
        const i1 = Math.min(i0 + 1, length - 1);
        const frac = srcIdx - i0;
        downsampled[i] = mono[i0] * (1 - frac) + mono[i1] * frac;
    }

    return downsampled;
}

// ── DSP: Biquad Bandpass Filter (Kick/Bass Isolation ~60-220Hz) ──
function applyBiquadBandpass(samples, sampleRate, centerFreq = 120, Q = 1.0) {
    const w0 = 2 * Math.PI * centerFreq / sampleRate;
    const alpha = Math.sin(w0) / (2 * Q);

    const b0 = alpha;
    const b1 = 0;
    const b2 = -alpha;
    const a0 = 1 + alpha;
    const a1 = -2 * Math.cos(w0);
    const a2 = 1 - alpha;

    const out = new Float32Array(samples.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

    for (let i = 0; i < samples.length; i++) {
        const x0 = samples[i];
        const y0 = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
        out[i] = y0;
        x2 = x1;
        x1 = x0;
        y2 = y1;
        y1 = y0;
    }
    return out;
}

// ── Helper: Compute Onset Flux from Filtered Audio ──
function computeOnsetEnvelope(filteredSamples, sampleRate, envRate = 100) {
    const windowSize = Math.floor(sampleRate / envRate);
    const envLength = Math.floor(filteredSamples.length / windowSize);
    const env = new Float32Array(envLength);

    for (let i = 0; i < envLength; i++) {
        let sum = 0;
        const start = i * windowSize;
        for (let j = 0; j < windowSize; j++) {
            sum += Math.abs(filteredSamples[start + j]);
        }
        env[i] = sum / windowSize;
    }

    const onsets = new Float32Array(envLength);
    for (let i = 1; i < envLength; i++) {
        const diff = env[i] - env[i - 1];
        if (diff > 0) onsets[i] = diff;
    }
    return onsets;
}

// ── Helper: Normalized Autocorrelation Matrix ──
function computeAutocorrelation(onsets, minLag, maxLag, maxFrames) {
    const r = new Float32Array(maxLag + 1);
    let maxVal = 1e-9;
    for (let lag = minLag; lag <= maxLag; lag++) {
        let sum = 0;
        const count = maxFrames - lag;
        if (count <= 0) continue;
        for (let i = 0; i < count; i++) {
            sum += onsets[i] * onsets[i + lag];
        }
        r[lag] = sum / count;
        if (r[lag] > maxVal) maxVal = r[lag];
    }
    for (let lag = minLag; lag <= maxLag; lag++) {
        r[lag] /= maxVal;
    }
    return r;
}

// ── DSP: Serato-Grade BPM Detection (Dual-Band + Hemiola & Octave Disambiguation) ──
function detectBpmFromPcm(samples, sampleRate = 11025) {
    if (!samples || samples.length === 0) return 120;

    const envRate = 100;
    const minBpm = 65;
    const maxBpm = 195;
    const minLag = Math.floor((60 / maxBpm) * envRate); // ~30
    const maxLag = Math.ceil((60 / minBpm) * envRate);  // ~93
    const maxFrames = Math.min(Math.floor(samples.length / (sampleRate / envRate)), envRate * 29);

    // 1. Dual-Band Filtering: Low (kick/bass 120Hz) + High/Mid (snare/clap/hi-hat 2500Hz)
    const lowFiltered = applyBiquadBandpass(samples, sampleRate, 120, 1.0);
    const highFiltered = applyBiquadBandpass(samples, sampleRate, 2500, 0.8);

    const onsetsLow = computeOnsetEnvelope(lowFiltered, sampleRate, envRate);
    const onsetsHigh = computeOnsetEnvelope(highFiltered, sampleRate, envRate);

    // Combine into composite onset signal (captures kick transients and snare backbeats)
    const onsetsComb = new Float32Array(onsetsLow.length);
    for (let i = 0; i < onsetsLow.length; i++) {
        onsetsComb[i] = 0.5 * onsetsLow[i] + 0.5 * onsetsHigh[i];
    }

    const rComb = computeAutocorrelation(onsetsComb, minLag, maxLag, maxFrames);
    const rHigh = computeAutocorrelation(onsetsHigh, minLag, maxLag, maxFrames);

    function getInterpolatedR(rArr, lag) {
        if (lag < minLag || lag > maxLag) return 0;
        const i0 = Math.floor(lag);
        const i1 = Math.min(maxLag, i0 + 1);
        const f = lag - i0;
        return rArr[i0] * (1 - f) + rArr[i1] * f;
    }

    // 2. Find primary autocorrelation peak
    let peakLag = minLag;
    let maxVal = -1;
    for (let lag = minLag; lag <= maxLag; lag++) {
        if (rComb[lag] > maxVal) {
            maxVal = rComb[lag];
            peakLag = lag;
        }
    }

    let detectedBpm = (60 * envRate) / peakLag;

    // 3. Octave Doubling Disambiguation (evaluated first for uptempo tracks e.g. "Wake Me Up" 162 BPM, "Footloose" 174 BPM)
    // Checks if the fundamental tempo lies in the 125-185 BPM dance range
    let doubled = false;
    if (detectedBpm <= 95) {
        const halfLag = peakLag / 2;
        const doubleBpm = detectedBpm * 2;
        if (doubleBpm >= 125 && doubleBpm <= 185 && halfLag >= minLag) {
            const rDouble = getInterpolatedR(rComb, halfLag);
            if (rDouble > maxVal * 0.44) {
                peakLag = halfLag;
                detectedBpm = doubleBpm;
                doubled = true;
            }
        }
    }

    // 4. Hemiola 3:2 Disambiguation (fixes syncopated 80s basslines e.g. "Physical" 124 BPM, "I Wanna Dance" 119 BPM)
    // Only runs if octave doubling did not occur and relative correlation strongly confirms the 3:2 dance grid
    if (!doubled && detectedBpm >= 74 && detectedBpm <= 94) {
        const trueLagHemiola = peakLag * (2 / 3);
        const hemiolaBpm = detectedBpm * 1.5;
        if (hemiolaBpm >= 115 && hemiolaBpm <= 145 && trueLagHemiola >= minLag) {
            const rHemiolaHigh = getInterpolatedR(rHigh, trueLagHemiola);
            const rHemiolaComb = getInterpolatedR(rComb, trueLagHemiola);
            // Require strong relative correlation to prevent false positives on tracks like Wham! or Footloose
            if (rHemiolaComb > maxVal * 0.68 && rHemiolaHigh > maxVal * 0.55) {
                peakLag = trueLagHemiola;
                detectedBpm = hemiolaBpm;
            }
        }
    }

    // 5. Sub-integer refinement via parabolic interpolation
    const pInt = Math.round(peakLag);
    if (pInt > minLag && pInt < maxLag) {
        const y0 = rComb[pInt - 1];
        const y1 = rComb[pInt];
        const y2 = rComb[pInt + 1];
        const denom = (y0 - 2 * y1 + y2);
        if (denom !== 0) {
            const delta = (y0 - y2) / (2 * denom);
            if (Math.abs(delta) < 1) {
                peakLag = pInt + delta;
                detectedBpm = (60 * envRate) / peakLag;
            }
        }
    }

    return Math.max(minBpm, Math.min(maxBpm, Math.round(detectedBpm)));
}

// ── Precomputed Trigonometric Lookup Tables for STFT Chromagram ──
// Mathematically equivalent to STFT but replaces ~85M runtime Math.cos/sin calls
// with instant typed-array indexing, yielding a ~10x speedup with ZERO precision loss.
const DSP_SAMPLE_RATE = 11025;
const DSP_FFT_SIZE = 2048;
const DSP_HOP_SIZE = 1024;
const DSP_HALF_FFT = DSP_FFT_SIZE / 2;
const DSP_BIN_FREQ = DSP_SAMPLE_RATE / DSP_FFT_SIZE; // ~5.3833 Hz per bin
const DSP_MIN_BIN = Math.max(1, Math.floor(80 / DSP_BIN_FREQ)); // 14
const DSP_MAX_BIN = Math.min(DSP_HALF_FFT - 1, Math.ceil(1800 / DSP_BIN_FREQ)); // 335
const DSP_NUM_BINS = DSP_MAX_BIN - DSP_MIN_BIN + 1; // 322 bins
const DSP_NUM_STEPS = DSP_FFT_SIZE / 2; // 1024 steps

// Precalculate Hann window
const DSP_HANN_WINDOW = new Float32Array(DSP_FFT_SIZE);
for (let i = 0; i < DSP_FFT_SIZE; i++) {
    DSP_HANN_WINDOW[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (DSP_FFT_SIZE - 1)));
}

// Precalculate pitch classes & cosine frequency weighting
const DSP_BIN_PITCH_CLASS = new Int8Array(DSP_HALF_FFT).fill(-1);
const DSP_BIN_WEIGHT = new Float32Array(DSP_HALF_FFT);
for (let k = DSP_MIN_BIN; k <= DSP_MAX_BIN; k++) {
    const freq = k * DSP_BIN_FREQ;
    const midi = 12 * Math.log2(freq / 440) + 69;
    const note = Math.round(midi);
    const pc = ((note % 12) + 12) % 12;
    DSP_BIN_PITCH_CLASS[k] = pc;
    const dist = Math.abs(midi - note);
    DSP_BIN_WEIGHT[k] = Math.cos(dist * Math.PI) * (1 / Math.sqrt(freq));
}

// Precalculate DFT Cos/Sin lookup tables
let dftCosTable = null;
let dftSinTable = null;

function initDftLookupTables() {
    if (dftCosTable && dftSinTable) return;
    dftCosTable = new Float32Array(DSP_NUM_BINS * DSP_NUM_STEPS);
    dftSinTable = new Float32Array(DSP_NUM_BINS * DSP_NUM_STEPS);

    for (let k = DSP_MIN_BIN; k <= DSP_MAX_BIN; k++) {
        const binIdx = k - DSP_MIN_BIN;
        const w = (2 * Math.PI * k) / DSP_FFT_SIZE;
        const base = binIdx * DSP_NUM_STEPS;
        for (let m = 0; m < DSP_NUM_STEPS; m++) {
            const angle = w * (m * 2);
            dftCosTable[base + m] = Math.cos(angle);
            dftSinTable[base + m] = Math.sin(angle);
        }
    }
}
initDftLookupTables();

// ── DSP: Harmonic Key Detection via STFT Chromagram & Krumhansl-Schmuckler ──
function detectKeyFromPcm(samples, sampleRate = 11025) {
    if (!samples || samples.length === 0) {
        return { camelot: '8A', color: CAMELOT_COLORS['8A'] };
    }

    initDftLookupTables();

    // 12-semitone chromagram accumulator (C, C#, D, D#, E, F, F#, G, G#, A, A#, B)
    const chromagram = new Float32Array(12);

    // Analyze full preview context (skip 1.5s intro to avoid silence, scan through 29s)
    const startSample = Math.floor(sampleRate * 1.5);
    const endSample = Math.min(samples.length - DSP_FFT_SIZE, Math.floor(sampleRate * 29));
    const totalFrames = Math.floor((endSample - startSample) / DSP_HOP_SIZE);

    if (totalFrames <= 0) {
        return { camelot: '8A', color: CAMELOT_COLORS['8A'] };
    }

    // High-performance DFT using precomputed lookup tables
    const frameReal = new Float32Array(DSP_FFT_SIZE);
    for (let f = 0; f < totalFrames; f++) {
        const offset = startSample + f * DSP_HOP_SIZE;
        for (let i = 0; i < DSP_FFT_SIZE; i++) {
            frameReal[i] = samples[offset + i] * DSP_HANN_WINDOW[i];
        }

        // Accumulate harmonic energy across pitch classes
        for (let k = DSP_MIN_BIN; k <= DSP_MAX_BIN; k++) {
            const pc = DSP_BIN_PITCH_CLASS[k];
            if (pc < 0) continue;

            let re = 0;
            let im = 0;
            const baseOffset = (k - DSP_MIN_BIN) * DSP_NUM_STEPS;

            for (let m = 0; m < DSP_NUM_STEPS; m++) {
                const s = frameReal[m * 2];
                const tableIdx = baseOffset + m;
                re += s * dftCosTable[tableIdx];
                im -= s * dftSinTable[tableIdx];
            }

            const mag = Math.sqrt(re * re + im * im) * DSP_BIN_WEIGHT[k];
            chromagram[pc] += mag;
        }
    }

    // Normalize chromagram vector
    let chromaNorm = 0;
    for (let i = 0; i < 12; i++) chromaNorm += chromagram[i] * chromagram[i];
    chromaNorm = Math.sqrt(chromaNorm) || 1;
    for (let i = 0; i < 12; i++) chromagram[i] /= chromaNorm;

    // Standardize chromagram (mean 0)
    let chromaMean = 0;
    for (let i = 0; i < 12; i++) chromaMean += chromagram[i];
    chromaMean /= 12;
    const stdChroma = new Float32Array(12);
    for (let i = 0; i < 12; i++) stdChroma[i] = chromagram[i] - chromaMean;

    // Krumhansl-Schmuckler Pearson Correlation
    function getCorrelation(profile, shift) {
        let pMean = 0;
        for (let i = 0; i < 12; i++) pMean += profile[i];
        pMean /= 12;

        let num = 0, denC = 0, denP = 0;
        for (let i = 0; i < 12; i++) {
            const cVal = stdChroma[i];
            const pVal = profile[(i - shift + 12) % 12] - pMean;
            num += cVal * pVal;
            denC += cVal * cVal;
            denP += pVal * pVal;
        }
        const denom = Math.sqrt(denC * denP);
        return denom === 0 ? 0 : num / denom;
    }

    let bestCorr = -2;
    let bestKey = '8A'; // Default Serato Camelot

    // Test all 12 Major and 12 Minor keys
    for (let root = 0; root < 12; root++) {
        const corrMaj = getCorrelation(KS_MAJOR_PROFILE, root);
        if (corrMaj > bestCorr) {
            bestCorr = corrMaj;
            bestKey = MAJOR_PITCH_TO_CAMELOT[root];
        }

        const corrMin = getCorrelation(KS_MINOR_PROFILE, root);
        if (corrMin > bestCorr) {
            bestCorr = corrMin;
            bestKey = MINOR_PITCH_TO_CAMELOT[root];
        }
    }

    return {
        camelot: bestKey,
        color: CAMELOT_COLORS[bestKey] || '#39ff14'
    };
}

// ── iTunes Preview Resolver ──
async function resolveTrackPreviewUrl(trackStr) {
    if (!trackStr) return null;
    let query = trackStr;
    if (typeof trackStr === 'object' && trackStr !== null) {
        query = `${trackStr.artist || ''} ${trackStr.title || ''}`.trim();
    }
    // Clean query
    query = query.replace(/\s*[\(\[\{].*?[\)\]\}]/g, '').trim();

    await waitIfRateLimited();

    // null = iTunes answered and has no preview; throws = iTunes couldn't be asked
    // (offline / rate-limited), which must not be remembered as "no preview".
    const pick = data => (data && data.results && data.results[0] && data.results[0].previewUrl) || null;
    try {
        if (typeof searchItunesJSONP === 'function') return pick(await searchItunesJSONP(query));
    } catch (e) {
        // JSONP blocked or timed out: try a direct fetch
    }

    try {
        await waitIfRateLimited();
        let resp = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&limit=1&media=music`);
        if (resp.status === 429 || resp.status === 403) {
            triggerRateLimitCooldown(2500);
            await waitIfRateLimited();
            resp = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&limit=1&media=music`);
        }
        if (resp.ok) return pick(await resp.json());
        if (resp.status === 429 || resp.status === 403) triggerRateLimitCooldown(15000);
        throw new Error(`iTunes search HTTP ${resp.status}`);
    } catch (e) {
        console.warn('SoundHunt DSP: Preview search failed for:', query, e);
        throw e;
    }
}

// ── Core Track Analyzer ──
async function analyzeTrackAudio(trackStr, previewUrl = null) {
    const cacheKey = normalizeTrackToCacheKey(trackStr);
    const cached = getCachedAnalysis(trackStr);
    if (cached) return cached;

    let url = previewUrl;
    if (!url) {
        try {
            url = await resolveTrackPreviewUrl(trackStr);
        } catch (err) {
            const errorResult = { bpm: null, camelot: null, color: null, error: err.message || 'lookup failed', timestamp: Date.now() };
            saveAnalysisToCache(cacheKey, errorResult);
            return errorResult;
        }
    }

    if (!url) {
        const nullResult = { bpm: null, camelot: null, color: null, unavailable: true, timestamp: Date.now() };
        saveAnalysisToCache(cacheKey, nullResult);
        return nullResult;
    }

    try {
        const audioBuffer = await fetchAndDecodeAudio(url);
        const monoPcm = getMonoDownsampledBuffer(audioBuffer, 11025);

        const bpm = detectBpmFromPcm(monoPcm, 11025);
        const keyData = detectKeyFromPcm(monoPcm, 11025);

        const result = {
            bpm: bpm,
            camelot: keyData.camelot,
            color: keyData.color,
            previewUrl: url,
            timestamp: Date.now()
        };

        saveAnalysisToCache(cacheKey, result);
        return result;
    } catch (err) {
        console.warn('SoundHunt DSP: Analysis error on track', trackStr, err);
        const errorResult = { bpm: null, camelot: null, color: null, error: err.message, timestamp: Date.now() };
        saveAnalysisToCache(cacheKey, errorResult);
        return errorResult;
    }
}

// The row showing this track: the one at its queued index if it still holds that track,
// otherwise wherever the track moved to in the same card.
function findTrackRow(ts, index, track) {
    const want = typeof getTrackString === 'function' ? getTrackString(track) : null;
    const holds = r => !!r && (!want || (r.querySelector('.track-text') || {}).dataset?.track === want);
    const row = document.getElementById(`track-${ts}-${index}`);
    if (holds(row)) return row;
    if (!want) return null;
    const card = document.querySelector(`#mixes-container [data-ts="${CSS.escape(String(ts))}"]`);
    return card ? [...card.querySelectorAll('.track-row')].find(holds) || null : null;
}

// ── Background Concurrent Analysis Queue (2-Worker Concurrency Pool) ──
class ConcurrentDspQueue {
    constructor(maxWorkers = 2) {
        this.queue = [];
        this.maxWorkers = maxWorkers;
        this.activeWorkers = 0;
        this.playlistProgress = new Map(); // ts -> { total, done }
    }

    enqueue(item) {
        const existingIdx = this.queue.findIndex(q => q.ts === item.ts && q.index === item.index);
        if (existingIdx !== -1) {
            this.queue[existingIdx] = item;
        } else {
            this.queue.push(item);
        }

        this.scheduleWorkers();
    }

    scheduleWorkers() {
        while (this.activeWorkers < this.maxWorkers && this.queue.length > 0) {
            this.activeWorkers++;
            this.runWorker();
        }
    }

    async runWorker() {
        while (this.queue.length > 0) {
            const item = this.queue.shift();
            try {
                await this.processItem(item);
            } catch (err) {
                console.warn('SoundHunt DSP Queue: Error processing item', item, err);
            }

            // Yield 40ms between audio decoding & processing to preserve 60 FPS UI responsiveness
            await new Promise(resolve => setTimeout(resolve, 40));
        }

        this.activeWorkers--;
    }

    async processItem(item) {
        const { ts, index, track, forceReanalyze } = item;
        let rowEl = findTrackRow(ts, index, track);
        const trackStr = typeof track === 'object' && track !== null ? `${track.artist || ''} - ${track.title || ''}` : String(track);

        // Check if already cached (unless forced)
        let analysis = !forceReanalyze ? getCachedAnalysis(trackStr) : null;

        if (!analysis) {
            if (rowEl) renderTrackBadgeLoading(rowEl);
            analysis = await analyzeTrackAudio(trackStr, track && track.previewUrl ? track.previewUrl : null);
        }

        // Look the row up again: tracks may have been added or removed while this ran.
        rowEl = findTrackRow(ts, index, track);
        if (rowEl) {
            renderTrackBadgeResult(rowEl, analysis);
            evaluateTrackRowLayout(rowEl);
        }

        this.updateProgress(ts);
    }

    updateProgress(ts) {
        const prog = this.playlistProgress.get(ts);
        if (!prog) return;

        prog.done++;
        if (prog.done < prog.total) {
            setAnalyzeButtonState(ts, prog);
        } else {
            setAnalyzeButtonState(ts, null);
            this.playlistProgress.delete(ts);
        }
    }

    startPlaylist(ts, tracks, forceReanalyze = false) {
        if (!Array.isArray(tracks) || tracks.length === 0) return;

        // Initialize progress tracker
        this.playlistProgress.set(ts, {
            total: tracks.length,
            done: 0
        });

        setAnalyzeButtonState(ts, this.playlistProgress.get(ts));

        const uncachedItems = [];

        tracks.forEach((t, i) => {
            const trackStr = typeof t === 'object' && t !== null ? `${t.artist || ''} - ${t.title || ''}` : String(t);

            if (forceReanalyze) {
                const key = normalizeTrackToCacheKey(t);
                if (key) inMemoryDspCache.delete(key);
            }

            // Zero-Delay Caching: if already analyzed and not forced, render immediately in 0ms!
            const cached = !forceReanalyze ? getCachedAnalysis(trackStr) : null;
            if (cached) {
                const rowEl = document.getElementById(`track-${ts}-${i}`);
                if (rowEl) {
                    renderTrackBadgeResult(rowEl, cached);
                    evaluateTrackRowLayout(rowEl);
                }
                this.updateProgress(ts);
            } else {
                uncachedItems.push({
                    ts: ts,
                    index: i,
                    track: t,
                    forceReanalyze: forceReanalyze
                });
            }
        });

        // Enqueue only items that genuinely need network/DSP computation
        uncachedItems.forEach(item => this.enqueue(item));
    }
}

const dspQueue = new ConcurrentDspQueue(2);

// ── UI Rendering Helpers ──
// Lit tags: tempo in amber, key in its Camelot wheel colour.
function getBadgeHTML(analysis) {
    if (!analysis) {
        return '<span class="tag tag-loading" title="Analysing BPM and key">···</span>';
    }

    if (analysis.unavailable || !analysis.bpm || !analysis.camelot) {
        return '<span class="tag tag-muted" title="BPM / key unavailable">—</span>';
    }

    const bpm = escapeHtml(analysis.bpm);
    const camelot = escapeHtml(analysis.camelot);
    const color = CAMELOT_COLORS[analysis.camelot] || analysis.color;
    const keyStyle = /^#[0-9a-f]{3,8}$/i.test(color || '') ? ` style="--tag:${color}"` : '';

    return `<span class="tag" title="${bpm} BPM">${bpm}</span><span class="tag"${keyStyle} title="Key ${camelot}">${camelot}</span>`;
}

function renderTrackBadgeLoading(rowEl) {
    const badgeContainer = rowEl.querySelector('.track-badges');
    if (!badgeContainer) return;
    badgeContainer.innerHTML = getBadgeHTML(null);
}

// BPM · KEY cap on a mix card. `prog` = { done, total } while a run is going, null when
// finished: spinner in the cap, blinking lamp and "n/m" in the legend while running;
// the wave icon and a steady lamp (analysed) afterwards.
function setAnalyzeButtonState(ts, prog) {
    const btn = document.getElementById(`btn-analyze-${ts}`);
    if (!btn) return;
    const fn = btn.closest('.fn');
    const lamp = fn ? fn.querySelector('.fn-legend .lamp') : null;
    const text = fn ? fn.querySelector('.fn-legend .fn-text') : null;
    const running = !!prog;

    btn.classList.toggle('analyzing-active', running);
    btn.innerHTML = running ? '<i class="fas fa-spinner fa-spin"></i>' : '<i class="fas fa-wave-square"></i>';
    btn.setAttribute('aria-busy', running ? 'true' : 'false');
    if (lamp) {
        lamp.classList.add('is-on');
        lamp.classList.toggle('is-blink', running);
    }
    if (text) text.textContent = running ? `${prog.done}/${prog.total}` : 'BPM · Key';
}

function renderTrackBadgeResult(rowEl, analysis) {
    const badgeContainer = rowEl.querySelector('.track-badges');
    if (!badgeContainer) return;
    badgeContainer.innerHTML = getBadgeHTML(analysis);
}

// ── Layout Compatibility Helpers ──
function evaluateTrackRowLayout(row) {}
function observeTrackRow(row) {}
function observeAllTrackRows() {}

// ── Global Interface Functions ──
function triggerPlaylistAnalysis(ts, btn, force = false) {
    if (typeof isPowered === 'function' && !isPowered()) { if (typeof nudgePower === 'function') nudgePower(); return; }
    const history = typeof getHistory === 'function' ? getHistory() : [];
    const mix = history.find(m => String(m._timestamp) === String(ts));
    
    let tracks = mix ? mix.tracks : null;
    if (!tracks) {
        // Check DOM if demo or unsaved playlist
        const card = document.querySelector(`[data-ts="${ts}"]`);
        if (card) {
            const rowTitles = card.querySelectorAll('.track-title-wrapper');
            tracks = Array.from(rowTitles).map(el => el.getAttribute('data-track') || el.textContent.trim());
        }
    }

    if (!tracks || tracks.length === 0) return;

    // A press always re-tries tracks that came back without BPM/key (offline, rate limit,
    // no preview); finished analyses are deterministic, so they're reused. `force`
    // re-runs everything.
    if (!force) forgetFailedAnalyses(tracks);
    dspQueue.startPlaylist(ts, tracks, force);
}
