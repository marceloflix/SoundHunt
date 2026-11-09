// What an armed delete cap shows (storage.js provides CONFIRM_HTML).
function confirmGlyph() {
    return typeof CONFIRM_HTML !== 'undefined' ? CONFIRM_HTML : '<i class="fas fa-question"></i>';
}
function confirmTimeout() {
    return typeof DEFAULT_CONFIRM_TIMEOUT_MS !== 'undefined' ? DEFAULT_CONFIRM_TIMEOUT_MS : 8000;
}

// Track-count readout on a card ("05 TRK").
function setCardTrackCount(card, n) {
    const countEl = card.querySelector('.diag-track-count');
    if (countEl) countEl.textContent = String(n).padStart(2, '0');
}

// ── Remove Individual Track from Curated Playlist (Pruning) ──
function removeTrackFromMix(ts, trackIndex, btn) {
    if (btn && typeof armConfirmButton === 'function') {
        if (armConfirmButton(btn, confirmGlyph(), 'Click again to remove this track', confirmTimeout())) {
            return;
        }
    }

    const history = typeof getHistory === 'function' ? getHistory() : [];
    const mixIndex = history.findIndex(m => String(m._timestamp) === String(ts));

    // Animate DOM row removal
    const row = btn ? btn.closest('.track-row') : document.getElementById(`track-${ts}-${trackIndex}`);
    if (row) row.classList.add('is-removing');

    // Close player if this playing track is being deleted
    if (typeof closeAudioPlayer === 'function' && typeof currentPreviewBtn !== 'undefined' && currentPreviewBtn && row && row.contains(currentPreviewBtn)) {
        closeAudioPlayer();
    }

    setTimeout(() => {
        if (mixIndex !== -1) {
            const mix = history[mixIndex];
            if (Array.isArray(mix.tracks) && trackIndex >= 0 && trackIndex < mix.tracks.length) {
                mix.tracks.splice(trackIndex, 1);

                if (typeof adjustSelectionAfterRemoval === 'function') {
                    adjustSelectionAfterRemoval(ts, trackIndex);
                }

                if (mix.tracks.length === 0) {
                    history.splice(mixIndex, 1);
                }
                saveHistory(history);
                if (typeof rebuildFeed === 'function') rebuildFeed();
            }
        } else {
            // For demo card or transient card not yet in history
            if (row) row.remove();
            if (typeof adjustSelectionAfterRemoval === 'function') {
                adjustSelectionAfterRemoval(ts, trackIndex);
            }
            const card = document.querySelector(`[data-ts="${ts}"]`);
            if (card) {
                const remaining = card.querySelectorAll('.track-row').length;
                setCardTrackCount(card, remaining);
                if (remaining === 0) card.remove();
            }
        }
    }, 200);
}

// ── Copy Single Track ──
// `el` carries the raw "Artist - Title" in data-track; it flashes a COPIED tag.
async function copyTrackName(el) {
    const track = el.getAttribute('data-track') || '';
    try { await navigator.clipboard.writeText(track); }
    catch {
        const ta = document.createElement('textarea');
        ta.value = track;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }
    el.classList.add('is-copied');
    clearTimeout(el._copiedTimer);
    el._copiedTimer = setTimeout(() => el.classList.remove('is-copied'), 1200);
}

// ── Delete Individual Playlist ──
function deleteMix(btn, ts) {
    if (btn && typeof armConfirmButton === 'function') {
        if (armConfirmButton(btn, confirmGlyph(), 'Click again to eject (delete) this program', confirmTimeout())) {
            return;
        }
    }

    const card = (btn && btn.closest('[data-ts]')) || document.querySelector(`[data-ts="${ts}"]`);
    if (!card) return;

    card.classList.add('is-ejecting');

    // Close player if playing track is within this deleted mix
    if (typeof closeAudioPlayer === 'function' && typeof currentPreviewBtn !== 'undefined' && currentPreviewBtn && card.contains(currentPreviewBtn)) {
        closeAudioPlayer();
    }

    setTimeout(() => {
        card.remove();
        if (ts) {
            const history = getHistory().filter(m => String(m._timestamp) !== String(ts));
            saveHistory(history);
        }
        updateHistoryControls();

        const container = document.getElementById('mixes-container');
        if (container && container.children.length === 0) {
            container.innerHTML = feedEmptyHTML();
        }
    }, 200);
}

// ── Batch Delete Selected Tracks from Playlist ──
function deleteSelectedTracks(ts, btn) {
    const selectedIndices = typeof getPlaylistSelection === 'function' ? getPlaylistSelection(ts) : null;
    if (!selectedIndices || selectedIndices.size === 0) return;

    const count = selectedIndices.size;
    if (btn && typeof armConfirmButton === 'function') {
        if (armConfirmButton(btn, confirmGlyph(), `Click again to delete ${count} selected track${count === 1 ? '' : 's'}`, confirmTimeout())) {
            return;
        }
    }

    // Close audio player if any playing track is among those selected for deletion
    if (typeof closeAudioPlayer === 'function' && typeof currentPreviewBtn !== 'undefined' && currentPreviewBtn) {
        selectedIndices.forEach(idx => {
            const row = document.getElementById(`track-${ts}-${idx}`);
            if (row && row.contains(currentPreviewBtn)) {
                closeAudioPlayer();
            }
        });
    }

    const history = typeof getHistory === 'function' ? getHistory() : [];
    const mixIndex = history.findIndex(m => String(m._timestamp) === String(ts));

    if (mixIndex !== -1) {
        const mix = history[mixIndex];
        if (Array.isArray(mix.tracks)) {
            mix.tracks = mix.tracks.filter((_, idx) => !selectedIndices.has(idx));

            if (typeof exitSelectionMode === 'function') exitSelectionMode(ts);

            if (mix.tracks.length === 0) {
                history.splice(mixIndex, 1);
                saveHistory(history);
                if (typeof rebuildFeed === 'function') rebuildFeed();
                if (typeof showNotice === 'function') showNotice('✓ Program ejected: all its tracks were removed.', 4000);
                return;
            }

            saveHistory(history);
            if (typeof rebuildFeed === 'function') rebuildFeed();
            if (typeof showNotice === 'function') showNotice(`✓ Removed ${count} track${count === 1 ? '' : 's'} from the program.`, 4000);
        }
    } else {
        // Fallback for transient or unpersisted demo card
        const card = document.querySelector(`[data-ts="${ts}"]`);
        if (card) {
            selectedIndices.forEach(idx => {
                const row = document.getElementById(`track-${ts}-${idx}`);
                if (row) row.remove();
            });
            const remaining = card.querySelectorAll('.track-row').length;
            setCardTrackCount(card, remaining);
            if (remaining === 0) card.remove();
        }
        if (typeof exitSelectionMode === 'function') exitSelectionMode(ts);
        if (typeof showNotice === 'function') showNotice(`✓ Removed ${count} track${count === 1 ? '' : 's'}.`, 4000);
    }
}

// ── Takes: RE-HUNT results recorded inside one card ──
// The active take lives in the mix's normal fields (title, tracks, …) so everything that
// edits a program keeps working, and an older SoundHunt still reads the card. `_takes`
// holds every take in order with `null` in the active take's slot; `_take` is its index.
const MAX_TAKES = 5;
const TAKE_FIELDS = ['title', 'description', 'tracks', 'energy', 'genre', '_focus'];

function getTakeCount(mix) {
    return Array.isArray(mix._takes) && mix._takes.length > 1 ? mix._takes.length : 1;
}
function activeTakeIndex(mix) {
    const i = parseInt(mix._take, 10);
    return getTakeCount(mix) > 1 && i >= 0 && i < mix._takes.length ? i : 0;
}
function snapshotTake(mix) {
    const t = {};
    TAKE_FIELDS.forEach(k => { if (mix[k] !== undefined) t[k] = mix[k]; });
    return t;
}
function applyTake(mix, take) {
    TAKE_FIELDS.forEach(k => { if (take && take[k] !== undefined) mix[k] = take[k]; else delete mix[k]; });
}
// Every take as plain data, the active one included.
function listTakes(mix) {
    if (getTakeCount(mix) === 1) return [snapshotTake(mix)];
    const a = activeTakeIndex(mix);
    return mix._takes.map((t, i) => i === a ? snapshotTake(mix) : t);
}
function allTakeTracks(mix) {
    return listTakes(mix).flatMap(t => Array.isArray(t.tracks) ? t.tracks : []);
}
// Make take i the active one (mutates mix; caller saves).
function loadTake(mix, i) {
    const n = getTakeCount(mix);
    if (n === 1 || i < 0 || i >= n) return;
    const a = activeTakeIndex(mix);
    if (i === a) return;
    mix._takes[a] = snapshotTake(mix);
    applyTake(mix, mix._takes[i]);
    mix._takes[i] = null;
    mix._take = i;
}
// Append a take and make it active; returns its 1-based number.
function addTake(mix, take) {
    if (getTakeCount(mix) === 1) { mix._takes = [null]; mix._take = 0; }
    mix._takes.push(take);
    loadTake(mix, mix._takes.length - 1);
    return mix._takes.length;
}
// Drop the active take; its neighbour (the one before, or the next) becomes active.
function removeActiveTake(mix) {
    const n = getTakeCount(mix);
    if (n === 1) return;
    const a = activeTakeIndex(mix);
    const next = a > 0 ? a - 1 : 1;
    applyTake(mix, mix._takes[next]);
    mix._takes.splice(a, 1);
    const newActive = next > a ? next - 1 : next;
    mix._takes[newActive] = null;
    mix._take = newActive;
    if (mix._takes.length === 1) { delete mix._takes; delete mix._take; }
}

// Cards made from one song ("Hunted from: …") re-hunt that song; merged cards can't re-hunt.
function mixSeed(mix) {
    if (mix._seed && mix._seed.title) return mix._seed;
    const m = typeof mix._prompt === 'string' && mix._prompt.match(/^Hunted from: (.+)$/);
    if (!m) return null;
    const label = m[1];
    const cut = label.indexOf(' - ');
    return cut > 0 ? { artist: label.slice(0, cut), title: label.slice(cut + 3) } : { artist: '', title: label };
}
function isMergedMix(mix) {
    return !!mix._merged || (typeof mix._prompt === 'string' && mix._prompt.startsWith('Merged: '));
}
function canRehuntMix(mix) {
    return !isMergedMix(mix) && (!!mixSeed(mix) || !!(mix._prompt && String(mix._prompt).trim()));
}

// ◀ / ▶ / the take readout: step through a card's takes (wraps around).
function stepTake(ts, delta) {
    const history = getHistory();
    const mix = history.find(m => String(m._timestamp) === String(ts));
    if (!mix) return;
    const n = getTakeCount(mix);
    if (n === 1) return;
    loadTake(mix, (activeTakeIndex(mix) + delta + n) % n);
    saveHistory(history);
    refreshMixCard(ts);
}

// EJECT: one take → the program goes; several → a strip asks: this take or all of them.
function ejectPressed(btn, ts) {
    const mix = getHistory().find(m => String(m._timestamp) === String(ts));
    if (!mix || getTakeCount(mix) === 1) { deleteMix(btn, ts); return; }
    toggleEjectChoice(ts);
}
function toggleEjectChoice(ts, open) {
    const card = document.querySelector(`#mixes-container [data-ts="${CSS.escape(ts)}"]`);
    const wrap = card && card.querySelector('.eject-bar-wrapper');
    if (!wrap) return;
    const on = open === undefined ? !wrap.classList.contains('active') : !!open;
    wrap.classList.toggle('active', on);
    const cap = card.querySelector('.mix-eject .cap');
    if (cap) { cap.classList.toggle('is-latched', on); cap.setAttribute('aria-expanded', String(on)); }
}
function ejectTake(ts) {
    const history = getHistory();
    const mix = history.find(m => String(m._timestamp) === String(ts));
    if (!mix) return;
    const card = document.querySelector(`#mixes-container [data-ts="${CSS.escape(ts)}"]`);
    if (card && typeof closeAudioPlayer === 'function' && typeof currentPreviewBtn !== 'undefined' && currentPreviewBtn && card.contains(currentPreviewBtn)) closeAudioPlayer();
    const gone = activeTakeIndex(mix) + 1;
    removeActiveTake(mix);
    saveHistory(history);
    refreshMixCard(ts);
    if (typeof showNotice === 'function') showNotice(`TAKE ${gone} EJECTED · ${getTakeCount(mix)} LEFT`, 4000);
}
function ejectAllTakes(ts) {
    deleteMix(null, ts);
}
