// ── Merge ("Tape dub") State ──
let mergeMode      = false;
let mergeSelection = [];

// The TAPE DUB bat switch (#btn-merge, a checkbox) calls this from onchange; other
// code calls it to flip the mode. Either way the switch, lamp and DUB cap follow.
function toggleMergeMode() {
    const sw = document.getElementById('btn-merge');
    const ev = typeof window !== 'undefined' ? window.event : null;
    const fromSwitch = !!(sw && ev && ev.type === 'change' && ev.target === sw);
    setMergeMode(fromSwitch ? sw.checked : !mergeMode);
}

function setMergeMode(on) {
    mergeMode = !!on;
    if (!mergeMode) mergeSelection = [];

    const sw = document.getElementById('btn-merge');
    if (sw) sw.checked = mergeMode;
    const lamp = document.getElementById('dub-lamp');
    if (lamp) lamp.classList.toggle('is-on', mergeMode);
    const go = document.getElementById('merge-go');
    if (go) go.classList.toggle('hidden', !mergeMode);
    document.body.classList.toggle('merge-active', mergeMode);

    if (mergeMode && typeof exitAllSelectionModes === 'function') exitAllSelectionModes();
    applyMergeHighlights();
    showMergeHint(mergeMode);
}

// One short line under the TAPE DUB switch while it's on (the dial may be scrolled away).
// Cards with takes dub the take they show (step it first); their other takes stay on the card.
const MERGE_HINT = 'PICK 2+ PROGRAMS, THEN DUB · THEY BECOME ONE';
const MERGE_HINT_TAKES = 'PICK 2+ PROGRAMS, THEN DUB · CARDS WITH TAKES DUB THE ONE THEY SHOW';
function showMergeHint(on) {
    const el = document.getElementById('dub-hint');
    if (!el) return;
    const anyTakes = on && typeof getTakeCount === 'function' && getHistory().some(m => getTakeCount(m) > 1);
    el.textContent = on ? (anyTakes ? MERGE_HINT_TAKES : MERGE_HINT) : '';
    el.classList.toggle('hidden', !on);
}

function toggleMergeSelect(ts) {
    if (mergeSelection.includes(ts)) mergeSelection = mergeSelection.filter(t => t !== ts);
    else mergeSelection.push(ts);
    applyMergeHighlights();
}

function applyMergeHighlights() {
    document.querySelectorAll('[data-ts]').forEach(card => {
        const isSelected = mergeMode && mergeSelection.includes(card.getAttribute('data-ts'));
        card.classList.toggle('is-dub-selected', isSelected);
        card.classList.toggle('is-dub-candidate', mergeMode && !isSelected);
    });
}

function executeMerge() {
    if (mergeSelection.length < 2) {
        if (typeof showNotice === 'function') showNotice('Select at least 2 programs to dub together.', 4000);
        else alert('Select at least 2 playlists to merge.');
        return;
    }
    let history    = getHistory();
    const selected = mergeSelection.map(ts => history.find(m => m._timestamp === ts)).filter(Boolean);
    const allTracks = [];
    const seen     = new Set();
    selected.forEach(m => (m.tracks || []).forEach(t => {
        const key = (typeof t === 'string' ? t : `${t.artist} - ${t.title}`).toLowerCase().trim();
        if (!seen.has(key)) {
            seen.add(key);
            allTracks.push(t);
        }
    }));

    const merged = {
        title:       selected.map(m => m.title).join(' + '),
        description: `Merged playlist from ${selected.length} playlists (${allTracks.length} unique tracks).`,
        tracks:      allTracks,
        energy:      Math.round(selected.reduce((s, m) => s + (parseInt(m.energy) || 3), 0) / selected.length),
        genre:       [...new Set(selected.map(m => m.genre).filter(Boolean))].join(', '),
        _prompt:     'Merged: ' + selected.map(m => m._prompt || m.title).join(' + '),
        _focus:      'balanced',
        _merged:     true
    };
    // Sources: a one-take card goes into the dub; a card with takes gives only the take it
    // shows and keeps the rest.
    const kept = [];
    history = history.filter(m => {
        if (!mergeSelection.includes(m._timestamp)) return true;
        if (typeof getTakeCount === 'function' && getTakeCount(m) > 1) { removeActiveTake(m); kept.push(m._timestamp); return true; }
        return false;
    });
    saveHistory(history);
    mergeSelection.forEach(ts => {
        if (kept.includes(ts)) return;
        const card = document.querySelector(`[data-ts="${ts}"]`);
        if (card) card.remove();
    });
    kept.forEach(ts => refreshMixCard(ts));
    renderNewMix(merged, true);
    setMergeMode(false);
    if (typeof showNotice === 'function') {
        showNotice(kept.length ? `DUBBED · ${allTracks.length} TRACKS · OTHER TAKES STAY ON THEIR CARDS` : `DUBBED · ${allTracks.length} TRACKS IN ONE PROGRAM`, 6000);
    }
}

// Browsers may restore the switch's checked state on reload; start in step.
document.addEventListener('DOMContentLoaded', () => {
    const sw = document.getElementById('btn-merge');
    if (sw) sw.checked = mergeMode;
});
