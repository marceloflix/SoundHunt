// ── TRACKS knob ──
const STAGES = [10, 20, 30, 40];
let _tracksKnob = null;

function getTrackCount() {
    const wrap = document.getElementById('knob-tracks');
    const v = parseInt(wrap && wrap.dataset.value, 10);
    return STAGES.includes(v) ? v : STAGES[0];
}

// ── Power ──
// The receiver starts in standby (red LED, every display dark). POWER lights it up with
// the era warm-up sequence; nothing works until it's on. Within a browser session the
// power state survives reloads; a fresh visit starts in standby again.
const POWER_SESSION_KEY = 'soundhunt_powered';
let _powered = false;

function isPowered() { return _powered; }

function setPower(on, opts = {}) {
    _powered = on;
    const btn = document.getElementById('power-btn');
    const led = document.getElementById('power-led');
    btn.classList.toggle('is-latched', on);
    btn.setAttribute('aria-pressed', String(on));
    led.classList.toggle('lamp-red', !on);
    led.classList.toggle('lamp-green', on);
    document.getElementById('ai-vibe').disabled = !on;
    const seek = document.getElementById('history-search');
    if (seek) seek.disabled = !on;
    try { sessionStorage.setItem(POWER_SESSION_KEY, on ? '1' : '0'); } catch (e) { /* private mode */ }

    const meters = Array.from(document.querySelectorAll('.glass-meters .meter'));
    if (!on) {
        releasePresets();
        document.querySelectorAll('.track-row.is-open').forEach(r => r.classList.remove('is-open'));
        // everything that runs on the set's power closes; the rear panel stays reachable
        ['closeStashDrawer', 'closeDigDeeperModal', 'closeExternalLinkModal', 'closeStats'].forEach(fn => {
            if (typeof window[fn] === 'function') window[fn]();
        });
        closeAudioPlayer();
        document.getElementById('prompt-history-dropdown').classList.add('hidden');
        setDialMessage('');
        SHControls.power(false, { meters });
        return;
    }
    if (typeof analyzeRenderedMixes === 'function') analyzeRenderedMixes();
    if (opts.instant) {
        document.body.classList.remove('is-off');
        refreshDialIdle();
        afterPowerOn();
        return;
    }
    setDialMessage('WARMING UP…', 'loading');
    const zone = DEPTH_ZONES.find(z => z.value === getActiveDiscoveryChip()) || DEPTH_ZONES[1];
    SHControls.power(true, {
        dial: document.getElementById('dial'),
        meters,
        needleTo: zone.center,
        onReady: () => { refreshDialIdle(); afterPowerOn(); },
    });
}

// First power-on without a key: say so on the dial and open the rear panel.
function afterPowerOn() {
    if (getApiKey()) return;
    setDialMessage('NO ANTENNA · CONNECT YOUR GEMINI KEY ON THE REAR PANEL', 'error');
    const notice = document.getElementById('first-time-api-notice');
    if (notice) notice.classList.remove('hidden');
    openSettings();
    const input = document.getElementById('api-key-input');
    if (input) input.focus();
}

// Something was pressed while off: blink the standby LED.
function nudgePower() {
    const led = document.getElementById('power-led');
    led.classList.remove('is-blink');
    void led.offsetWidth;
    led.classList.add('is-blink');
    clearTimeout(nudgePower._t);
    nudgePower._t = setTimeout(() => led.classList.remove('is-blink'), 1800);
}

// While off, the faceplate is dead: every control except POWER, REAR (you plug the
// antenna in with the set off) and INSTALL just blinks the standby lamp. Capture-phase,
// so it runs before any inline onclick or control handler.
const POWER_FREE = '#power-btn, [data-power-free], .modal-overlay, #scroll-top';
const POWER_TURNABLE = '.knob, .flywheel';
function powerBlockedTarget(target) {
    if (_powered || !target || !target.closest) return null;
    const ctl = target.closest('button, a, input, select, textarea, label, .knob, .flywheel, .track-row, .mix-unit');
    if (!ctl || ctl.closest(POWER_FREE)) return null;
    return ctl;
}
function initPowerGate() {
    const stop = (e, nudge) => {
        e.preventDefault();
        e.stopPropagation();
        if (nudge) nudgePower();
    };
    document.addEventListener('click', e => { if (powerBlockedTarget(e.target)) stop(e, true); }, true);
    // knobs and the flywheel turn on drag / wheel / arrow keys, not just clicks
    document.addEventListener('pointerdown', e => {
        const ctl = powerBlockedTarget(e.target);
        if (ctl && ctl.closest(POWER_TURNABLE)) stop(e, false);
    }, true);
    document.addEventListener('wheel', e => {
        const ctl = powerBlockedTarget(e.target);
        if (ctl && ctl.closest(POWER_TURNABLE)) stop(e, true);
    }, { capture: true, passive: false });
    document.addEventListener('keydown', e => {
        if (!/^(Arrow|Home$|End$|Page)/.test(e.key)) return;
        const ctl = powerBlockedTarget(e.target);
        if (ctl && ctl.closest(POWER_TURNABLE)) stop(e, true);
    }, true);
}

// ── Scroll-to-Top ──
function initScrollToTop() {
    const btn = document.getElementById('scroll-top');
    window.addEventListener('scroll', () => btn.classList.toggle('is-visible', window.scrollY > 300), { passive: true });
}

// ── Receiver controls ──
function initReceiver() {
    SHControls.initMeters();

    _tracksKnob = SHControls.initKnob(document.getElementById('knob-tracks'), () => {
        if (isPowered()) refreshDialIdle();
    });

    _depthDial = SHControls.initDepthDial(document.getElementById('dial'), document.getElementById('flywheel'), DEPTH_ZONES, mode => {
        localStorage.setItem('soundhunt_discovery_chip', mode);
        if (isPowered()) refreshDialIdle();
    });
    _depthDial.set(localStorage.getItem('soundhunt_discovery_chip') || 'balanced');

    renderPresets();

    const input = document.getElementById('ai-vibe');
    SHControls.typePlaceholder(input, [
        'dark disco for a 3am drive',
        'brazilian jazz-funk from 1974',
        'songs that sound like a rainy tokyo night',
        'uplifting house for a sunrise set',
        'sunday morning soul with vinyl crackle',
    ]);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') generateMix(); });
    // Editing the text means it's no longer the latched preset's program.
    input.addEventListener('input', () => {
        const latched = document.querySelector('#preset-bank .cap.is-latched');
        if (latched && latched.dataset.prompt !== input.value) latched.classList.remove('is-latched');
    });

    document.getElementById('power-btn').addEventListener('click', () => setPower(!isPowered()));
    initPowerGate();
}

// ── App Initialisation ──
window.addEventListener('DOMContentLoaded', () => {
    initScrollToTop();
    applyTextSize(getTextSize());
    initReceiver();

    const history = getHistory();
    if (history.length > 0) {
        history.slice().reverse().forEach(mix => renderNewMix(mix, false));
    } else {
        document.getElementById('mixes-container').innerHTML = feedEmptyHTML();
    }
    updateHistoryControls();

    let resume = false;
    try { resume = sessionStorage.getItem(POWER_SESSION_KEY) === '1'; } catch (e) { /* private mode */ }
    if (location.hash === '#on') setPower(true);
    else if (resume) setPower(true, { instant: true });

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        const extModal = document.getElementById('external-link-modal');
        if (extModal && !extModal.classList.contains('hidden')) {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeExternalLinkModal();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmExternalLinkAction();
                return;
            }
        }

        if (e.key === 'Escape') {
            closeSettings();
            closeStats();
            closeDigDeeperModal();
            closeStashDrawer();
            exitAllSelectionModes();
            closeExternalLinkModal();
            document.getElementById('prompt-history-dropdown').classList.add('hidden');
        }
        if (e.ctrlKey && e.key === 'k') { e.preventDefault(); document.getElementById('ai-vibe').focus(); }
    });

    initPwa();
});

// ── PWA Installation & Service Worker ──
let deferredPwaPrompt = null;

function setPwaInstalled(text) {
    const headerBtn = document.getElementById('pwa-install-btn');
    const settingsBtn = document.getElementById('settings-pwa-install-btn');
    const statusText = document.getElementById('pwa-status-text');
    if (headerBtn) headerBtn.classList.add('hidden');
    if (settingsBtn) {
        settingsBtn.disabled = true;
        settingsBtn.innerHTML = '<i class="fas fa-check"></i>';
    }
    if (statusText) statusText.textContent = text;
}

function initPwa() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const headerBtn = document.getElementById('pwa-install-btn');
    const settingsBtn = document.getElementById('settings-pwa-install-btn');
    const statusText = document.getElementById('pwa-status-text');

    if (isStandalone) {
        setPwaInstalled('Running as a standalone app');
        return;
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPwaPrompt = e;
        if (headerBtn) headerBtn.classList.remove('hidden');
        if (settingsBtn) settingsBtn.disabled = false;
        if (statusText) statusText.textContent = 'Ready to install on desktop or home screen';
    });

    window.addEventListener('appinstalled', () => {
        deferredPwaPrompt = null;
        setPwaInstalled('SoundHunt is installed');
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
        deferredPwaPrompt.userChoice.then(() => { deferredPwaPrompt = null; });
    } else {
        alert('To install SoundHunt:\n\n• In Chrome/Edge: Click the install icon (⊕) in the right side of the address bar.\n• In Safari on Mac/iOS: Click Share → "Add to Dock" or "Add to Home Screen".');
    }
}
