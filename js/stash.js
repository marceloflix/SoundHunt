// ── SoundHunt: Download Stash (the CRATE drawer) ──
// Stores keeper tracks for one-tap downloading via Monochrome.

const STASH_KEY = 'soundhunt_download_stash';

function getStash() {
    try {
        const raw = localStorage.getItem(STASH_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveStash(items) {
    try {
        localStorage.setItem(STASH_KEY, JSON.stringify(items));
    } catch (e) {
        console.error('Error saving stash to localStorage:', e);
    }
    updateStashBadge();
}

function cleanQuery(str) {
    return (str || '').replace(/\s*[\(\[\{].*?[\)\]\}]/g, '').trim() || (str || '').trim();
}

function isStashed(artist, title) {
    const cleanA = (artist || '').trim().toLowerCase();
    const cleanT = (title || '').trim().toLowerCase();
    const stash = getStash();
    return stash.some(item => 
        (item.artist || '').trim().toLowerCase() === cleanA &&
        (item.title || '').trim().toLowerCase() === cleanT
    );
}

function toggleStashTrack(track, btn) {
    if (!track) return;
    const artist = typeof track === 'object' ? (track.artist || '') : '';
    const title = typeof track === 'object' ? (track.title || '') : (track || '');
    if (!title && !artist) return;

    let stash = getStash();
    const alreadyStashed = isStashed(artist, title);

    // Trigger pop micro-animation for tactile feedback
    if (btn) {
        btn.classList.remove('star-pop-animate');
        void btn.offsetWidth; // Force reflow
        btn.classList.add('star-pop-animate');
        setTimeout(() => btn.classList.remove('star-pop-animate'), 400);
    }

    if (alreadyStashed) {
        stash = stash.filter(item => !(
            (item.artist || '').trim().toLowerCase() === artist.trim().toLowerCase() &&
            (item.title || '').trim().toLowerCase() === title.trim().toLowerCase()
        ));
        saveStash(stash);
        if (btn) updateStarButtonUI(btn, false);
    } else {
        const newItem = {
            artist: artist.trim(),
            title: title.trim(),
            addedAt: Date.now()
        };
        stash.unshift(newItem);
        saveStash(stash);
        if (btn) updateStarButtonUI(btn, true);
    }

    // Update all matching star buttons currently rendered on screen
    updateAllMatchingStarButtons(artist, title, !alreadyStashed);

    // If the crate is open, re-render immediately
    if (isStashDrawerOpen()) renderStash();
}

function updateStarButtonUI(btn, active) {
    if (!btn) return;
    // is-stashed for feed styling, is-active lights a .key cap
    btn.classList.toggle('is-stashed', !!active);
    btn.classList.toggle('is-active', !!active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.title = active ? 'In the crate (click to remove)' : 'Save to crate';
}

function updateAllMatchingStarButtons(artist, title, active) {
    const cleanA = (artist || '').trim().toLowerCase();
    const cleanT = (title || '').trim().toLowerCase();
    document.querySelectorAll('.stash-star-btn').forEach(btn => {
        const bArtist = (btn.dataset.artist || '').trim().toLowerCase();
        const bTitle = (btn.dataset.title || '').trim().toLowerCase();
        if (bArtist === cleanA && bTitle === cleanT) {
            updateStarButtonUI(btn, active);
        }
    });
}

// Top-strip SAVED window: two 7-segment digits ("03"), dim when the crate is empty.
function updateStashBadge() {
    const count = getStash().length;
    const badge = document.getElementById('stash-count-badge');
    if (!badge) return;
    badge.textContent = String(Math.min(99, count)).padStart(2, '0');
    badge.classList.toggle('is-zero', count === 0);
    badge.title = count === 1 ? '1 track in the crate' : `${count} tracks in the crate`;
}

function isStashDrawerOpen() {
    const drawer = document.getElementById('stash-drawer');
    return !!(drawer && drawer.classList.contains('is-open'));
}

function openStashDrawer() {
    const drawer = document.getElementById('stash-drawer');
    const overlay = document.getElementById('stash-overlay');
    if (!drawer) return;
    renderStash();
    drawer.classList.add('is-open');
    if (overlay) overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeStashDrawer() {
    const drawer = document.getElementById('stash-drawer');
    const overlay = document.getElementById('stash-overlay');
    if (!drawer) return;
    drawer.classList.remove('is-open');
    if (overlay) overlay.classList.add('hidden');
    document.body.style.overflow = '';
}

function stashSearchUrl(item) {
    const queryTerm = `${cleanQuery(item.artist)} ${cleanQuery(item.title)}`.trim();
    return 'https://monochrome.tf/search/' + encodeURIComponent(queryTerm).replace(/'/g, '%27');
}

const CRATE_MONOCHROME_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="14.75 14.75 70.5 70.5" aria-hidden="true"><path fill="currentColor" d="M38.25 14.75H85.25V61.75H61.75V38.25H38.25ZM14.75 38.25H38.25V61.75H61.75V85.25H14.75Z"/></svg>';

function renderStash() {
    const container = document.getElementById('stash-content');
    if (!container) return;

    const stash = getStash();
    if (stash.length === 0) {
        container.innerHTML = `
            <div class="crate-empty">
                <span class="readout">CRATE EMPTY</span>
                <p>Press the <i class="fas fa-star" aria-hidden="true"></i> key on any track to drop it in the crate, then pull it out on <b>Monochrome</b> in one tap.</p>
            </div>`;
        return;
    }

    const count = Math.min(99, stash.length);
    let html = `
        <div class="crate-bar">
            <div class="fn">
                <span class="fn-legend">In crate</span>
                <span class="seg" data-ghost="88">${String(count).padStart(2, '0')}</span>
            </div>
            <span class="engraved engraved-sm crate-bar-note">${stash.length === 1 ? '1 record' : `${stash.length} records`}</span>
            <div class="fn">
                <span class="fn-legend">Clear crate</span>
                <button type="button" class="cap cap-sq cap-danger" onclick="clearStash(this)" title="Clear crate" aria-label="Clear crate"><i class="fas fa-trash-can"></i></button>
            </div>
        </div>
        <ol class="crate-list">
    `;

    stash.forEach((item, idx) => {
        const url = stashSearchUrl(item);
        const artistJs = escapeJsAttr(item.artist || '');
        const titleJs = escapeJsAttr(item.title || '');
        const full = item.artist ? `${item.artist} - ${item.title}` : item.title;

        html += `
            <li class="crate-item">
                <span class="crate-num">${String(idx + 1).padStart(2, '0')}</span>
                <a class="crate-label" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="Find ${escapeHtml(full)} on Monochrome">
                    <span class="crate-title-text">${escapeHtml(item.title || '—')}</span>
                    <span class="crate-artist">${escapeHtml(item.artist || 'Unknown artist')}</span>
                </a>
                <a class="key key-mono" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="Open on Monochrome" aria-label="Open ${escapeHtml(full)} on Monochrome">${CRATE_MONOCHROME_SVG}</a>
                <button type="button" class="key key-remove" onclick="removeStashTrackFromDrawer('${artistJs}', '${titleJs}', this)" title="Remove from crate" aria-label="Remove ${escapeHtml(full)} from crate"><i class="fas fa-xmark"></i></button>
            </li>
        `;
    });

    html += `</ol>`;
    container.innerHTML = html;
}

// ── Remove Individual Track from Stash Drawer with Confirmation ──
function removeStashTrackFromDrawer(artist, title, btn) {
    if (btn) {
        if (typeof armConfirmButton === 'function') {
            if (armConfirmButton(btn, CONFIRM_HTML, 'Click again to remove from crate')) {
                return;
            }
        }
    }

    let stash = getStash();
    const cleanA = (artist || '').trim().toLowerCase();
    const cleanT = (title || '').trim().toLowerCase();
    stash = stash.filter(item => !(
        (item.artist || '').trim().toLowerCase() === cleanA &&
        (item.title || '').trim().toLowerCase() === cleanT
    ));
    saveStash(stash);
    updateAllMatchingStarButtons(artist, title, false);
    renderStash();
}

function clearStash(btn) {
    if (btn) {
        if (typeof armConfirmButton === 'function') {
            if (armConfirmButton(btn, CONFIRM_HTML, 'Click again to clear the crate')) {
                return;
            }
        }
    } else if (typeof confirm === 'function') {
        if (!confirm('Clear all tracks from the crate?')) return;
    }

    saveStash([]);
    renderStash();
    // Reset star icons in DOM
    document.querySelectorAll('.stash-star-btn').forEach(btn => {
        updateStarButtonUI(btn, false);
    });
}

function showStashToast(msg) {
    // Disabled: Toast notifications removed as requested (previously rendered behind bottom player)
    const existing = document.getElementById('soundhunt-toast');
    if (existing) existing.remove();
}

// Initial badge update on load
document.addEventListener('DOMContentLoaded', () => {
    updateStashBadge();
});
