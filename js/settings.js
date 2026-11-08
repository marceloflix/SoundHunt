// ── Rear panel (Settings modal) ──
let textSizeKnob = null;   // SHControls knob on #knob-textsize, built on first open
let saveBtnTimer = null;

function initTextSizeKnob() {
    if (textSizeKnob) return textSizeKnob;
    const wrap = document.getElementById('knob-textsize');
    if (!wrap || !window.SHControls) return null;
    textSizeKnob = SHControls.initKnob(wrap, value => {
        const select = document.getElementById('text-size-select');
        if (select) select.value = value;
    });
    return textSizeKnob;
}

// Shows a status line under a rear-panel section. state: ok | warn | error | null (hide).
function setRearStatus(el, state, html) {
    if (!el) return;
    el.classList.remove('is-ok', 'is-warn', 'is-error');
    if (!state) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
    }
    el.classList.add('is-' + state);
    el.innerHTML = html;
    el.classList.remove('hidden');
}

function setSaveBtnIcon(btn, icon, spin) {
    if (!btn) return;
    btn.innerHTML = `<i class="fas ${icon}${spin ? ' fa-spin' : ''}"></i>`;
}

function openSettings() {
    const key = getApiKey();
    document.getElementById('api-key-input').value = key;
    setRearStatus(document.getElementById('api-key-status'), null);
    setRearStatus(document.getElementById('clear-data-status'), null);

    const firstTimeNotice = document.getElementById('first-time-api-notice');
    if (firstTimeNotice && key) {
        firstTimeNotice.classList.add('hidden');
    }

    // Safety cover always starts closed
    const guard = document.getElementById('clear-guard');
    if (guard) guard.classList.remove('is-open');

    const textSize = getTextSize();
    document.getElementById('text-size-select').value = textSize;
    const knob = initTextSizeKnob();
    if (knob) knob.set(textSize, true);

    document.getElementById('auto-scroll-toggle').checked = getAutoScroll();
    document.getElementById('prompt-persona-input').value = getPromptPersona();
    document.getElementById('prompt-constraints-input').value = getPromptConstraints();
    document.getElementById('prompt-explicit-input').value = getPromptExplicit();

    document.getElementById('settings-modal').classList.remove('hidden');
}

function resetStructuredPrompt(btn) {
    if (btn && typeof armConfirmButton === 'function') {
        if (armConfirmButton(btn, CONFIRM_HTML, 'Click again to restore the default prompt')) {
            return;
        }
    }

    document.getElementById('prompt-persona-input').value = DEFAULT_PROMPT.persona;
    document.getElementById('prompt-constraints-input').value = DEFAULT_PROMPT.constraints;
    document.getElementById('prompt-explicit-input').value = DEFAULT_PROMPT.explicit;
}

function applyTextSize(sizeClass) {
    document.body.classList.remove('text-size-small', 'text-size-normal', 'text-size-large');
    if (sizeClass) document.body.classList.add(sizeClass);
}

function closeSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
    const guard = document.getElementById('clear-guard');
    if (guard) guard.classList.remove('is-open');
    const mainErrorDiv = document.getElementById('ai-error');
    if (mainErrorDiv && mainErrorDiv.textContent.includes('API KEY REQUIRED') && getApiKey()) {
        mainErrorDiv.classList.add('hidden');
    }
}

async function saveSettings() {
    const saveBtn = document.getElementById('settings-save-btn');
    if (saveBtn && saveBtn.disabled) return;
    clearTimeout(saveBtnTimer);

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.setAttribute('aria-busy', 'true');
        setSaveBtnIcon(saveBtn, 'fa-spinner', true);
    }
    const restoreSaveBtn = () => {
        if (!saveBtn) return;
        saveBtn.disabled = false;
        saveBtn.removeAttribute('aria-busy');
        setSaveBtnIcon(saveBtn, 'fa-check');
    };

    const key        = document.getElementById('api-key-input').value.trim();
    const statusEl   = document.getElementById('api-key-status');
    const textSize   = document.getElementById('text-size-select').value;
    const autoScroll = document.getElementById('auto-scroll-toggle').checked;
    const persona    = document.getElementById('prompt-persona-input').value;
    const constraints = document.getElementById('prompt-constraints-input').value;
    const explicit   = document.getElementById('prompt-explicit-input').value;

    let geminiValid = true;

    // Show validating state immediately
    if (key) setRearStatus(statusEl, 'warn', '<i class="fas fa-satellite-dish"></i> Checking signal…');
    else setRearStatus(statusEl, null);

    if (key) {
        try {
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}?key=${encodeURIComponent(key)}`);
            if (r.ok) {
                setRearStatus(statusEl, 'ok', '<i class="fas fa-check"></i> Signal OK · key valid');
            } else {
                setRearStatus(statusEl, 'error', '<i class="fas fa-xmark"></i> No signal · invalid key, check and try again');
                geminiValid = false;
            }
        } catch {
            setRearStatus(statusEl, 'warn', '<i class="fas fa-triangle-exclamation"></i> Network error · saved anyway');
        }
    }

    // If key was invalid: clear the input field and remove from storage immediately
    if (!geminiValid) {
        const geminiInput = document.getElementById('api-key-input');
        if (geminiInput) geminiInput.value = '';
        localStorage.removeItem(STORAGE_KEYS.apiKey);
        if (saveBtn) {
            setSaveBtnIcon(saveBtn, 'fa-xmark');
            saveBtnTimer = setTimeout(restoreSaveBtn, 1200);
        }
        return;
    }

    // Success indicator on the cap
    if (saveBtn) {
        setSaveBtnIcon(saveBtn, 'fa-check-double');
        saveBtn.classList.add('is-latched');
    }

    // Clear any previous "API KEY REQUIRED" error on main screen
    const mainErrorDiv = document.getElementById('ai-error');
    if (mainErrorDiv && (mainErrorDiv.textContent.includes('API KEY REQUIRED') || mainErrorDiv.textContent.includes('API_KEY_ERROR'))) {
        mainErrorDiv.classList.add('hidden');
    }

    // Save preferences
    localStorage.setItem(STORAGE_KEYS.apiKey, key);
    if (key) {
        const firstTimeNotice = document.getElementById('first-time-api-notice');
        if (firstTimeNotice) firstTimeNotice.classList.add('hidden');
    }
    localStorage.setItem(STORAGE_KEYS.model, GEMINI_MODEL);
    localStorage.setItem(STORAGE_KEYS.textSize, textSize);
    localStorage.setItem(STORAGE_KEYS.autoScroll, autoScroll);
    localStorage.setItem(STORAGE_KEYS.promptPersona, persona);
    localStorage.setItem(STORAGE_KEYS.promptConstraints, constraints);
    localStorage.setItem(STORAGE_KEYS.promptExplicit, explicit);
    applyTextSize(textSize);

    saveBtnTimer = setTimeout(() => {
        closeSettings();
        restoreSaveBtn();
        if (saveBtn) saveBtn.classList.remove('is-latched');
    }, 600);
}

// ── Clear Application Data & Cache (Preserves Gemini API Key) ──
// Behind a flip cover: the first press on a closed guard just lifts the cover.
function clearApplicationData(btn) {
    const guard = document.getElementById('clear-guard');
    if (guard && !guard.classList.contains('is-open')) {
        guard.classList.add('is-open');
        return;
    }
    if (btn && typeof armConfirmButton === 'function') {
        if (armConfirmButton(btn, CONFIRM_HTML, 'Click again to confirm clearing cached data')) {
            return;
        }
    }

    // CRITICAL EXCEPTION: Save and protect the API key
    const currentApiKey = typeof getApiKey === 'function' ? getApiKey() : localStorage.getItem(STORAGE_KEYS.apiKey);

    try {
        // 1. Purge cached items from localStorage
        localStorage.removeItem(STORAGE_KEYS.history);
        localStorage.removeItem(STORAGE_KEYS.prompts);
        localStorage.removeItem('soundhunt_bpm_key_cache');
        localStorage.removeItem('soundhunt_bpm_key_cache_v2');
        localStorage.removeItem('soundhunt_bpm_key_cache_v3');
        localStorage.removeItem('soundhunt_download_stash');
        localStorage.removeItem('soundhunt_stash');
        localStorage.removeItem('soundhunt_discovery_chip');

        // Strictly ensure API key is never overwritten or lost
        if (currentApiKey) {
            localStorage.setItem(STORAGE_KEYS.apiKey, currentApiKey);
        }
    } catch (e) {
        console.warn('SoundHunt: Error clearing storage caches', e);
    }

    // 2. Clear in-memory DSP cache
    if (typeof inMemoryDspCache !== 'undefined' && inMemoryDspCache.clear) {
        inMemoryDspCache.clear();
    }

    // 3. Clear the crate
    if (typeof saveStash === 'function') {
        saveStash([]);
    }
    if (typeof renderStash === 'function') {
        renderStash();
    }

    // 4. Close active audio preview if playing
    if (typeof closeAudioPlayer === 'function') {
        closeAudioPlayer();
    }

    // 5. Reset UI feed to empty state
    const container = document.getElementById('mixes-container');
    if (container) {
        container.innerHTML = feedEmptyHTML();
    }
    if (typeof updateHistoryControls === 'function') {
        updateHistoryControls();
    }

    // 6. Reset Prompt History dropdown
    const promptDropdown = document.getElementById('prompt-history-dropdown');
    if (promptDropdown) promptDropdown.innerHTML = '';
    if (typeof releasePresets === 'function') releasePresets();
    if (typeof renderPresets === 'function') renderPresets();

    // 7. Close the cover again and confirm (inline status + toast)
    if (guard) guard.classList.remove('is-open');
    const statusEl = document.getElementById('clear-data-status');
    setRearStatus(statusEl, 'ok', '<i class="fas fa-check"></i> Cached data cleared · API key preserved');
    setTimeout(() => setRearStatus(statusEl, null), 5000);

    if (typeof showAppToast === 'function') {
        showAppToast('Cached data cleared. API key preserved.', 'success');
    }
}
