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
