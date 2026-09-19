// ── Stage Stepper ──
const STAGES = [10, 20, 30, 40];
let stageIndex = 0;

function advanceStage() {
    stageIndex = (stageIndex + 1) % STAGES.length;
    const val  = STAGES[stageIndex];
    const numEl = document.getElementById('stage-num');
    numEl.classList.remove('stage-anim');
    void numEl.offsetWidth; // force reflow to restart animation
    numEl.textContent = val;
    numEl.classList.add('stage-anim');
    const dots = document.getElementById('stage-dots').children;
    for (let i = 0; i < dots.length; i++) {
        dots[i].style.background = i <= stageIndex ? '#39ff14' : '#222';
    }
}

function getTrackCount() { return STAGES[stageIndex]; }

// ── Scroll-to-Top Button ──
function initScrollToTop() {
    const btn = document.getElementById('scroll-top');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 200) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
        else                      { btn.style.opacity = '0'; btn.style.pointerEvents = 'none'; }
    });
    btn.addEventListener('mouseenter', function () { this.style.borderColor = '#39ff14'; });
    btn.addEventListener('mouseleave', function () { this.style.borderColor = '#333'; });
}

// ── App Initialisation ──
window.addEventListener('DOMContentLoaded', () => {
    initScrollToTop();
    if (typeof applyTextSize === 'function') {
        applyTextSize(getTextSize());
    } else {
        document.body.className = getTextSize();
    }

    const history = getHistory();
    if (history.length > 0) {
        history.slice().reverse().forEach(mix => renderNewMix(mix, false));
        updateHistoryControls();
    } else {
        // Show demo mix on first launch
        setTimeout(() => {
            renderNewMix({
                title: 'SoundHunt Discovery Demo',
                description: 'Welcome to SoundHunt! Type any vibe, era, or mood above to hunt down tracks. Click ✕ to prune unwanted songs, 🔍 to dig deeper into similar tracks, or ★ to stash tracks for 1-click Monochrome downloading.',
                tracks: [
                    { title: 'Technologic', artist: 'Daft Punk' },
                    { title: 'Galvanize', artist: 'The Chemical Brothers' },
                    { title: 'D.A.N.C.E.', artist: 'Justice' },
                    { title: 'Right Here, Right Now', artist: 'Fatboy Slim' },
                    { title: 'Smack My Bitch Up', artist: 'The Prodigy' }
                ],
                genre: 'Electronic Discovery'
            }, true);
        }, 500);
    }

    // Initialize discovery chip
    if (typeof setDiscoveryChip === 'function') {
        const savedChip = localStorage.getItem('soundhunt_discovery_chip') || 'balanced';
        setDiscoveryChip(savedChip);
    }

    // Auto-prompt settings for first-time visitors who don't have an API key configured
    if (typeof getApiKey === 'function' && !getApiKey()) {
        setTimeout(() => {
            const notice = document.getElementById('first-time-api-notice');
            if (notice) notice.classList.remove('hidden');
            openSettings();
            const input = document.getElementById('api-key-input');
            if (input) input.focus();
        }, 550);
    }

    // Enter key triggers generation
    document.getElementById('ai-vibe').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') generateMix();
    });

    // Live prompt suggestions
    document.getElementById('ai-vibe').addEventListener('input', updatePromptSuggestions);
    populatePromptDatalist();

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        const extModal = document.getElementById('external-link-modal');
        if (extModal && !extModal.classList.contains('hidden')) {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (typeof closeExternalLinkModal === 'function') closeExternalLinkModal();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                if (typeof confirmExternalLinkAction === 'function') confirmExternalLinkAction();
                return;
            }
        }

        if (e.key === 'Escape') {
            closeSettings();
            closeStats();
            if (typeof closeDigDeeperModal === 'function') closeDigDeeperModal();
            if (typeof closeStashDrawer === 'function') closeStashDrawer();
            if (typeof exitAllSelectionModes === 'function') exitAllSelectionModes();
            if (typeof closeExternalLinkModal === 'function') closeExternalLinkModal();
        }
        if (e.ctrlKey && e.key === 'k') { e.preventDefault(); document.getElementById('ai-vibe').focus(); }
    });

    // Initialize PWA Installation & Service Worker
    initPwa();
});

// ── PWA Installation & Service Worker ──
let deferredPwaPrompt = null;

function initPwa() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const headerBtn = document.getElementById('pwa-install-btn');
    const settingsBtn = document.getElementById('settings-pwa-install-btn');
    const statusText = document.getElementById('pwa-status-text');

    if (isStandalone) {
        if (headerBtn) headerBtn.classList.add('hidden');
        if (settingsBtn) {
            settingsBtn.textContent = 'Installed ✓';
            settingsBtn.disabled = true;
            settingsBtn.classList.replace('text-[#39ff14]', 'text-[#888]');
            settingsBtn.classList.replace('border-[#1a7b1a]', 'border-[#333]');
            settingsBtn.classList.replace('bg-[#0a2a0a]', 'bg-[#111]');
        }
        if (statusText) statusText.textContent = 'Running in dedicated standalone mode';
        return;
    }

    // Capture install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPwaPrompt = e;
        if (headerBtn) headerBtn.classList.remove('hidden');
        if (settingsBtn) {
            settingsBtn.textContent = 'Install App';
            settingsBtn.disabled = false;
        }
        if (statusText) statusText.textContent = 'Ready to install on desktop or home screen';
    });

    // App installed handler
    window.addEventListener('appinstalled', () => {
        deferredPwaPrompt = null;
        if (headerBtn) headerBtn.classList.add('hidden');
        if (settingsBtn) {
            settingsBtn.textContent = 'Installed ✓';
            settingsBtn.disabled = true;
        }
        if (statusText) statusText.textContent = 'SoundHunt is installed!';
    });

    // Register Service Worker on HTTPS or localhost
    if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch((err) => {
                console.log('SoundHunt SW note:', err);
            });
        });
    }
}

function triggerPwaInstall() {
    if (deferredPwaPrompt) {
        deferredPwaPrompt.prompt();
        deferredPwaPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User installed SoundHunt PWA');
            }
            deferredPwaPrompt = null;
        });
    } else {
        alert('To install SoundHunt:\n\n• In Chrome/Edge: Click the install icon (⊕) in the right side of the address bar.\n• In Safari on Mac/iOS: Click Share → "Add to Dock" or "Add to Home Screen".');
    }
}

