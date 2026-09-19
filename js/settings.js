// ── Settings Modal ──
function openSettings() {
    const key = getApiKey();
    document.getElementById('api-key-input').value = key;
    const statusEl = document.getElementById('api-key-status');
    if (statusEl) statusEl.classList.add('hidden');

    const clearStatusEl = document.getElementById('clear-data-status');
    if (clearStatusEl) clearStatusEl.classList.add('hidden');

    const firstTimeNotice = document.getElementById('first-time-api-notice');
    if (firstTimeNotice && key) {
        firstTimeNotice.classList.add('hidden');
    }
    
    document.getElementById('text-size-select').value = getTextSize();
    document.getElementById('auto-scroll-toggle').checked = getAutoScroll();
    document.getElementById('prompt-persona-input').value = getPromptPersona();
    document.getElementById('prompt-constraints-input').value = getPromptConstraints();
    document.getElementById('prompt-explicit-input').value = getPromptExplicit();

    document.getElementById('settings-modal').classList.remove('hidden');
}

function resetStructuredPrompt(btn) {
    if (btn) {
        const badge = '<span class="text-[9px] font-extrabold uppercase text-[#ff3333] bg-[#220000] border border-[#ff3333] px-1.5 py-[2px] rounded shadow-[0_0_6px_rgba(255,51,51,0.6)] cursor-pointer select-none pointer-events-none">Reset?</span>';
        if (typeof armConfirmButton === 'function') {
            if (armConfirmButton(btn, badge, 'Click again to confirm reset', typeof DEFAULT_CONFIRM_TIMEOUT_MS !== 'undefined' ? DEFAULT_CONFIRM_TIMEOUT_MS : 8000)) {
                return;
            }
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
    const mainErrorDiv = document.getElementById('ai-error');
    if (mainErrorDiv && mainErrorDiv.textContent.includes('API KEY REQUIRED') && getApiKey()) {
        mainErrorDiv.classList.add('hidden');
    }
}

async function saveSettings() {
    const saveBtn = document.getElementById('settings-save-btn');
    const originalBtnHtml = saveBtn ? saveBtn.innerHTML : '<i class="fas fa-save mr-1"></i> Save';
    
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Validating...';
        saveBtn.style.opacity = '0.7';
        saveBtn.style.cursor = 'wait';
    }

    const key      = document.getElementById('api-key-input').value.trim();
    const statusEl = document.getElementById('api-key-status');
    const textSize = document.getElementById('text-size-select').value;
    const autoScroll = document.getElementById('auto-scroll-toggle').checked;
    const persona = document.getElementById('prompt-persona-input').value;
    const constraints = document.getElementById('prompt-constraints-input').value;
    const explicit = document.getElementById('prompt-explicit-input').value;

    let geminiValid = true;

    // Show validating state immediately
    if (key && statusEl) {
        statusEl.className = 'text-[10px] mt-1 font-bold uppercase tracking-wider text-[#ffcc00]';
        statusEl.textContent = 'VALIDATING KEY...';
        statusEl.classList.remove('hidden');
    } else if (statusEl) {
        statusEl.classList.add('hidden');
    }

    if (key) {
        try {
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}?key=${key}`);
            if (r.ok) {
                if (statusEl) {
                    statusEl.className = 'text-[10px] mt-1 font-bold uppercase tracking-wider text-[#39ff14]';
                    statusEl.textContent = '✓ KEY VALID';
                }
            } else {
                if (statusEl) {
                    statusEl.className = 'text-[10px] mt-1 font-bold uppercase tracking-wider text-[#ff3333]';
                    statusEl.textContent = '✗ INVALID KEY — check and try again';
                }
                geminiValid = false;
            }
        } catch {
            if (statusEl) {
                statusEl.className = 'text-[10px] mt-1 font-bold uppercase tracking-wider text-[#ff9900]';
                statusEl.textContent = '⚠ NETWORK ERROR — saved anyway';
            }
        }
    }

    // If key was invalid: clear the input field and remove from storage immediately
    if (!geminiValid) {
        const geminiInput = document.getElementById('api-key-input');
        if (geminiInput) geminiInput.value = '';
        localStorage.removeItem(STORAGE_KEYS.apiKey);

        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalBtnHtml;
            saveBtn.style.opacity = '1';
            saveBtn.style.cursor = 'pointer';
        }
        return;
    }

    // Success indicator on button
    if (saveBtn) {
        saveBtn.innerHTML = '<i class="fas fa-check mr-1"></i> Saved!';
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

    setTimeout(() => {
        closeSettings();
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalBtnHtml;
            saveBtn.style.opacity = '1';
            saveBtn.style.cursor = 'pointer';
        }
    }, 600);
}

// ── Clear Application Data & Cache (Preserves Gemini API Key) ──
function clearApplicationData(btn) {
    if (btn) {
        const badge = '<span class="text-[9px] font-extrabold uppercase text-[#ff3333] bg-[#220000] border border-[#ff3333] px-1.5 py-[2px] rounded shadow-[0_0_6px_rgba(255,51,51,0.6)] cursor-pointer select-none pointer-events-none">Clear?</span>';
        if (typeof armConfirmButton === 'function') {
            if (armConfirmButton(btn, badge, 'Click again to confirm clearing cached data', typeof DEFAULT_CONFIRM_TIMEOUT_MS !== 'undefined' ? DEFAULT_CONFIRM_TIMEOUT_MS : 8000)) {
                return;
            }
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

    // 3. Clear Stash drawer
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
        container.innerHTML = '<div class="text-center text-[#555] text-[11px] py-8 uppercase tracking-widest"><i class="fas fa-compact-disc mr-2"></i>No playlists yet — enter a prompt above to hunt tracks.</div>';
    }
    if (typeof updateHistoryControls === 'function') {
        updateHistoryControls();
    }

    // 6. Reset Prompt History dropdown
    const promptDropdown = document.getElementById('prompt-history-dropdown');
    if (promptDropdown) promptDropdown.innerHTML = '';

    // 7. Immediate visual feedback (Inline status + Toast notification)
    const statusEl = document.getElementById('clear-data-status');
    if (statusEl) {
        statusEl.className = 'text-[10px] mt-1.5 font-bold uppercase tracking-wider text-[#39ff14]';
        statusEl.innerHTML = '<i class="fas fa-check mr-1"></i> Cached data cleared. API key preserved!';
        statusEl.classList.remove('hidden');
        setTimeout(() => {
            if (statusEl) statusEl.classList.add('hidden');
        }, 5000);
    }

    if (typeof showAppToast === 'function') {
        showAppToast('Cached data cleared. API key preserved.', 'success');
    }
}
