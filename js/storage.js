// ── Dedicated AI Engine ──
// Primary model first; the next one takes over when the primary is rate-limited,
// overloaded, can't answer, or has been retired.
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];
const GEMINI_MODEL = GEMINI_MODELS[0];

// ── HTML escaping (everything from Gemini or the user goes through these before innerHTML) ──
function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
// For values placed inside a JS string literal within an inline handler attribute, e.g.
// onclick="fn('${escapeJsAttr(x)}')": escape for JS first, then for the HTML attribute.
function escapeJsAttr(value) {
    const js = String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
    return escapeHtml(js);
}

// ── Shared UI snippets ──
// Empty program log ("no signal" on the feed).
function feedEmptyHTML(message) {
    return `<div class="feed-empty"><span class="readout">NO SIGNAL</span><span class="engraved engraved-sm">${escapeHtml(message || 'Power on and tune in a vibe above to hunt tracks')}</span></div>`;
}
// What an armed (click-again-to-confirm) cap shows, see armConfirmButton().
const CONFIRM_HTML = '<i class="fas fa-question confirm-icon"></i>';

// ── Storage Keys ──
const STORAGE_KEYS = {
    apiKey:     'megamix_api_key',
    model:      'megamix_model',
    history:    'megamix_history',
    prompts:    'megamix_prompts',
    textSize:   'megamix_text_size',
    view:       'megamix_view',
    autoScroll: 'megamix_auto_scroll',
    promptPersona: 'megamix_prompt_persona',
    promptConstraints: 'megamix_prompt_constraints',
    promptExplicit: 'megamix_prompt_explicit',
    promptPopularity: 'megamix_prompt_popularity'
};

const DEFAULT_PROMPT = {
    persona: "an elite music curator and musicologist with encyclopedic knowledge of genres, eras, and discographies",
    constraints: "Prioritize sonic synergy, smooth transitions, and tracklist flow. Ensure diversity by picking at most one track per artist. Every song must authentically embody the mood, tempo, and era.",
    explicit: "allow" // 'allow' or 'clean'
};

// ── Prompt History ──
function getPromptHistory() {
    try {
        let prompts = JSON.parse(localStorage.getItem(STORAGE_KEYS.prompts)) || [];
        if (prompts.length > 10) {
            prompts = prompts.slice(0, 10);
            localStorage.setItem(STORAGE_KEYS.prompts, JSON.stringify(prompts));
        }
        return prompts;
    }
    catch { return []; }
}

function savePrompt(prompt) {
    if (!prompt) return;
    let prompts = getPromptHistory().filter(p => p !== prompt);
    prompts.unshift(prompt);
    if (prompts.length > 10) prompts.length = 10;
    localStorage.setItem(STORAGE_KEYS.prompts, JSON.stringify(prompts));
    renderPresets();
}

// ── MEMORY presets: the 5 most recent prompts on latching keys ──
const PRESET_COUNT = 5;

function renderPresets() {
    const bank = document.getElementById('preset-bank');
    if (!bank) return;
    const prompts = getPromptHistory().slice(0, PRESET_COUNT);
    let html = '';
    for (let i = 0; i < PRESET_COUNT; i++) {
        const p = prompts[i];
        html += p
            ? `<div class="preset"><span class="lcd"><span class="lcd-glass"><span class="lcd-text">${escapeHtml(p)}</span></span></span>` +
              `<button type="button" class="cap" data-prompt="${escapeHtml(p)}" onclick="recallPreset(this)" aria-label="Recall: ${escapeHtml(p)}"><span class="cap-num">${i + 1}</span></button></div>`
            : `<div class="preset is-empty"><span class="lcd lcd-empty"><span class="lcd-glass"><span class="lcd-text">— empty —</span></span></span>` +
              `<button type="button" class="cap" disabled aria-label="Empty memory ${i + 1}"><span class="cap-num">${i + 1}</span></button></div>`;
    }
    bank.innerHTML = html;
    if (window.SHControls) SHControls.initMarquee(bank);
}

function releasePresets() {
    document.querySelectorAll('#preset-bank .cap.is-latched').forEach(c => c.classList.remove('is-latched'));
}

// Press a key: it latches and loads its program. Press the latched key again: it pops up
// and the program window goes back to its idle examples.
function recallPreset(btn) {
    if (typeof isPowered === 'function' && !isPowered()) { if (typeof nudgePower === 'function') nudgePower(); return; }
    const input = document.getElementById('ai-vibe');
    if (btn.classList.contains('is-latched')) {
        btn.classList.remove('is-latched');
        input.value = '';
        return;
    }
    releasePresets();
    btn.classList.add('is-latched');
    input.value = btn.dataset.prompt;
}

function togglePromptHistory() {
    const dropdown = document.getElementById('prompt-history-dropdown');
    if (!dropdown.classList.contains('hidden')) {
        dropdown.classList.add('hidden');
        return;
    }
    if (typeof isPowered === 'function' && !isPowered()) { if (typeof nudgePower === 'function') nudgePower(); return; }
    const history = getPromptHistory();
    dropdown.innerHTML = history.length === 0
        ? '<div class="memory-empty readout">NO PROGRAMS IN MEMORY YET</div>'
        : history.map(p => `<button type="button" onclick="selectPromptHistory(this)" data-prompt="${escapeHtml(p)}">${escapeHtml(p)}</button>`).join('');
    dropdown.classList.remove('hidden');
}

function selectPromptHistory(el) {
    releasePresets();
    document.getElementById('ai-vibe').value = el.dataset.prompt;
    document.getElementById('prompt-history-dropdown').classList.add('hidden');
    document.getElementById('ai-vibe').focus();
}

// Close history dropdown when clicking outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('prompt-history-dropdown');
    const btn = document.getElementById('prompt-history-btn');
    if (!dropdown || !btn) return;
    if (!dropdown.classList.contains('hidden') && !dropdown.contains(e.target) && !btn.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
});

// ── API Key & Model ──
function getApiKey() {
    return localStorage.getItem(STORAGE_KEYS.apiKey) || '';
}

// Backward-compatibility safe stubs
function getMusicApiKey() { return ''; }
function saveMusicApiKey() {}
function lookupSongInDatabase() { return null; }
function lookupVerifiedCatalog() { return null; }

function getModel() {
    return GEMINI_MODEL;
}

function getTextSize() {
    return localStorage.getItem(STORAGE_KEYS.textSize) || 'text-size-small';
}

function getAutoScroll() {
    const val = localStorage.getItem(STORAGE_KEYS.autoScroll);
    return val !== null ? val === 'true' : true; // Default to true
}

function getPromptPersona() {
    const val = localStorage.getItem(STORAGE_KEYS.promptPersona);
    if (!val || val === 'an elite music curator and sonic crate digger for SoundHunt') {
        return DEFAULT_PROMPT.persona;
    }
    return val;
}
function getPromptConstraints() {
    const val = localStorage.getItem(STORAGE_KEYS.promptConstraints);
    if (!val || val.startsWith("ZERO HALLUCINATIONS:")) {
        return DEFAULT_PROMPT.constraints;
    }
    return val;
}
function getPromptExplicit() {
    return localStorage.getItem(STORAGE_KEYS.promptExplicit) || DEFAULT_PROMPT.explicit;
}

// ── Mix History ──
function getHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.history)) || []; }
    catch { return []; }
}

function saveHistory(mixes) {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(mixes));
    updateHistoryControls();
}

function updateHistoryControls() {
    const ctrl   = document.getElementById('history-controls');
    const history = getHistory();
    if (history.length > 0) ctrl.classList.remove('hidden');
    else ctrl.classList.add('hidden');

    // localStorage quota warning
    try {
        const used = new Blob(Object.values(localStorage)).size;
        if (used > 4 * 1024 * 1024) {
            console.warn('SoundHunt: localStorage usage high (' + Math.round(used / 1024) + 'KB). Consider clearing old playlists.');
        }
    } catch (e) {}
}

// ── Universal Confirmation Button System (Long Timeout & Click-Outside Dismissal) ──
const _armedConfirmButtons = new Set();
const DEFAULT_CONFIRM_TIMEOUT_MS = 8000; // 8 seconds allows comfortable decision time

function disarmConfirmButton(btn) {
    if (!btn || !btn._confirmData) return;
    if (btn._resetTimer) {
        clearTimeout(btn._resetTimer);
        btn._resetTimer = null;
    }
    const data = btn._confirmData;
    if (btn.isConnected) {
        btn.innerHTML = data.html;
        btn.title = data.title;
        if (data.width !== undefined) btn.style.width = data.width;
        if (data.padding !== undefined) btn.style.padding = data.padding;
    }
    delete btn.dataset.confirming;
    delete btn._confirmData;
    _armedConfirmButtons.delete(btn);
}

function disarmAllConfirmButtons(exceptBtn = null) {
    _armedConfirmButtons.forEach(b => {
        if (b !== exceptBtn) {
            disarmConfirmButton(b);
        }
    });
}

function armConfirmButton(btn, confirmHtml, confirmTitle = 'Click again to confirm', duration = DEFAULT_CONFIRM_TIMEOUT_MS, extraStyles = null) {
    if (!btn) return false;

    // Second click: already confirming -> disarm and return false to let caller execute destructive action
    if (btn.dataset.confirming) {
        disarmConfirmButton(btn);
        return false;
    }

    // First click: disarm any other active confirmation buttons across the app
    disarmAllConfirmButtons();

    btn._confirmData = {
        html: btn.innerHTML,
        title: btn.title || '',
        width: btn.style.width,
        padding: btn.style.padding
    };
    btn.dataset.confirming = 'true';

    if (extraStyles) {
        if (extraStyles.width !== undefined) btn.style.width = extraStyles.width;
        if (extraStyles.padding !== undefined) btn.style.padding = extraStyles.padding;
    }

    btn.innerHTML = confirmHtml;
    if (confirmTitle) btn.title = confirmTitle;

    btn._resetTimer = setTimeout(() => {
        disarmConfirmButton(btn);
    }, duration);

    _armedConfirmButtons.add(btn);
    return true; // Return true to tell caller to wait for confirmation
}

// Global dismiss listeners: click outside or press Escape immediately reverts confirmation
if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
        if (_armedConfirmButtons.size === 0) return;
        _armedConfirmButtons.forEach(btn => {
            if (!btn.contains(e.target)) {
                disarmConfirmButton(btn);
            }
        });
    }, true);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _armedConfirmButtons.size > 0) {
            disarmAllConfirmButtons();
        }
    });
}

function clearHistory(btn) {
    if (btn) {
        if (armConfirmButton(btn, CONFIRM_HTML, 'Click again to confirm clearing all playlists', DEFAULT_CONFIRM_TIMEOUT_MS)) {
            return;
        }
    } else if (typeof confirm === 'function') {
        if (!confirm('Clear all saved playlists?')) return;
    }

    localStorage.removeItem(STORAGE_KEYS.history);
    const container = document.getElementById('mixes-container');
    if (container) {
        container.innerHTML = feedEmptyHTML();
    }
    updateHistoryControls();
}

// ── Global toast: a lit message strip that drops from the top edge ──
function showAppToast(msg, type = 'success', duration = 3500) {
    let toast = document.getElementById('soundhunt-global-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'soundhunt-global-toast';
        toast.setAttribute('role', 'status');
        document.body.appendChild(toast);
    }
    const lamp = type === 'error' ? 'lamp-red' : (type === 'success' ? 'lamp-green' : '');
    toast.classList.toggle('is-error', type === 'error');
    toast.classList.toggle('is-success', type === 'success');
    toast.innerHTML = `<span class="lamp ${lamp} is-on"></span><span class="readout">${escapeHtml(msg)}</span>`;
    toast.classList.add('is-visible');
    if (toast._timer) clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('is-visible'), duration);
}
