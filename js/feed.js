// ── View & Filter State ──
let currentFilter = 'all';
let currentView   = (() => {
    try { return localStorage.getItem(STORAGE_KEYS.view) === 'compact' ? 'compact' : 'normal'; }
    catch (e) { return 'normal'; }
})();
// Compact cards the user has opened (by timestamp); survives feed rebuilds, not reloads.
const expandedCompact = new Set();

// Monochrome logo (inline so it can take currentColor).
const FEED_MONOCHROME_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="14.75 14.75 70.5 70.5" aria-hidden="true"><g fill="currentColor"><path d="M38.25 14.75H85.25V61.75H61.75V38.25H38.25ZM14.75 38.25H38.25V61.75H61.75V85.25H14.75Z"/></g></svg>';

// ── Compact view: open / close one card in place ──
function toggleCompactCard(ts) {
    const card = document.querySelector(`#mixes-container [data-ts="${CSS.escape(ts)}"]`);
    if (!card) return;
    const open = !expandedCompact.has(ts);
    if (open) expandedCompact.add(ts); else expandedCompact.delete(ts);
    animateUnitHeight(card, () => card.classList.toggle('is-expanded', open), open);
    if (open) analyzeMixCard(card);
}

// Smooth height change for a unit: measure, apply the change, glide between the two.
function animateUnitHeight(card, mutate, opening) {
    const from = card.getBoundingClientRect().height;
    mutate();
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !card.animate) return;
    const to = card.getBoundingClientRect().height;
    if (Math.abs(to - from) < 2) return;
    if (card._heightAnim) card._heightAnim.cancel();
    card.style.overflow = 'clip';
    const anim = card.animate([{ height: from + 'px' }, { height: to + 'px' }],
        { duration: opening ? 380 : 300, easing: 'cubic-bezier(0.22, 0.8, 0.28, 1)' });
    card._heightAnim = anim;
    const done = () => { if (card._heightAnim === anim) { card.style.overflow = ''; card._heightAnim = null; } };
    anim.onfinish = done;
    anim.oncancel = done;
    if (opening) {
        card.querySelectorAll(':scope > .mix-program, :scope > .tracks').forEach(el =>
            el.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }],
                { duration: 340, delay: 60, easing: 'ease-out', fill: 'backwards' }));
    }
}

// ── BPM/key analysis for what's on screen (runs only while the set is on) ──
function analyzeMixCard(card, tracks) {
    if (typeof dspQueue === 'undefined' || (typeof isPowered === 'function' && !isPowered())) return;
    if (!tracks) {
        const mix = getHistory().find(m => String(m._timestamp) === card.dataset.ts);
        tracks = mix && mix.tracks;
    }
    if (Array.isArray(tracks) && tracks.length) dspQueue.startPlaylist(card.dataset.ts, tracks, false);
}
function analyzeRenderedMixes() {
    document.querySelectorAll('#mixes-container [data-ts]').forEach(card => {
        if (card.classList.contains('mix-card-compact') && !card.classList.contains('is-expanded')) return;
        analyzeMixCard(card);
    });
}

// ── Filter (Source switch: up = all, down = favourites) ──
function setFilter(mode) {
    currentFilter = mode === 'favorites' ? 'favorites' : 'all';
    const sw = document.getElementById('filter-toggle');
    if (sw) sw.checked = currentFilter === 'favorites';
    rebuildFeed();
}

// ── View (View switch: up = full, down = compact) ──
function setView(mode) {
    currentView = mode === 'compact' ? 'compact' : 'normal';
    expandedCompact.clear();
    try { localStorage.setItem(STORAGE_KEYS.view, currentView); } catch (e) { /* private mode */ }
    const sw = document.getElementById('view-toggle');
    if (sw) sw.checked = currentView === 'compact';
    rebuildFeed();
}

// ── Rebuild Feed ──
function rebuildFeed() {
    const container = document.getElementById('mixes-container');
    if (!container) return;
    container.innerHTML = '';
    let history = getHistory();
    if (currentFilter === 'favorites') history = history.filter(m => m._favorite);

    const searchInput = document.getElementById('history-search');
    const searchTerm  = searchInput ? searchInput.value.trim().toLowerCase() : '';
    if (searchTerm) {
        const hit = (t, m) => [t.title, t.genre, m._prompt, ...(t.tracks || []).map(getTrackString)].filter(Boolean).join(' ').toLowerCase().includes(searchTerm);
        let switched = false;
        history = history.filter(m => {
            const takes = typeof listTakes === 'function' ? listTakes(m) : [m];
            const a = typeof activeTakeIndex === 'function' ? activeTakeIndex(m) : 0;
            if (hit(takes[a], m)) return true;
            const i = takes.findIndex(t => hit(t, m));
            if (i < 0) return false;
            loadTake(m, i); // show the take that matches
            switched = true;
            return true;
        });
        if (switched) {
            const all = getHistory();
            history.forEach(m => { const k = all.findIndex(x => x._timestamp === m._timestamp); if (k >= 0) all[k] = m; });
            saveHistory(all);
        }
    }

    history.slice().reverse().forEach(mix => renderNewMix(mix, false));

    if (container.children.length === 0) {
        if (currentFilter === 'favorites' && !searchTerm) {
            container.innerHTML = feedEmptyHTML('No favourites yet — light a program’s lamp to keep it here');
        } else if (searchTerm) {
            container.innerHTML = feedEmptyHTML('No programs match that search');
        } else {
            container.innerHTML = feedEmptyHTML();
        }
    }

    if (typeof mergeMode !== 'undefined' && mergeMode && typeof applyMergeHighlights === 'function') {
        applyMergeHighlights();
    }
}

function filterHistory() { rebuildFeed(); }

// ── Favorite Toggle (the bezel lamp in the card head) ──
function favoriteTitle(isFav) {
    return isFav ? 'Remove from favourites' : 'Add to favourites';
}

function toggleFavorite(btn, ts) {
    const history = getHistory();
    const mix     = history.find(m => m._timestamp === ts);
    if (!mix) return;
    mix._favorite = !mix._favorite;
    saveHistory(history);
    const isFav = mix._favorite;
    const lamp  = btn ? btn.querySelector('.lamp') : null;
    if (lamp) lamp.classList.toggle('is-on', isFav);
    if (btn) {
        btn.title = favoriteTitle(isFav);
        btn.setAttribute('aria-pressed', isFav ? 'true' : 'false');
    }
    if (currentFilter === 'favorites' && !isFav) rebuildFeed();
}

// ── Track string helper ──
function getTrackString(t) {
    if (!t) return '';
    return typeof t === 'string' ? t : `${t.artist} - ${t.title}`;
}

// ── Track Multi-Selection State (Per Playlist) ──
const playlistSelectionState = {}; // { [ts]: Set<number> }

function getPlaylistSelection(ts) {
    return playlistSelectionState[ts] || null;
}

function isPlaylistSelecting(ts) {
    return !!(playlistSelectionState[ts] && playlistSelectionState[ts] instanceof Set);
}

function handleTrackNumClick(ts, index) {
    if (!playlistSelectionState[ts]) {
        playlistSelectionState[ts] = new Set([index]);
    } else {
        if (playlistSelectionState[ts].has(index)) {
            playlistSelectionState[ts].delete(index);
        } else {
            playlistSelectionState[ts].add(index);
        }
    }
    updateSelectionUI(ts);
}

// SELECT cap: enter selection mode with nothing selected, or leave it.
function toggleSelectionMode(ts) {
    if (isPlaylistSelecting(ts)) {
        exitSelectionMode(ts);
    } else {
        playlistSelectionState[ts] = new Set();
        updateSelectionUI(ts);
    }
}

function selectAllTracks(ts) {
    const card = document.querySelector(`[data-ts="${ts}"]`);
    if (!card) return;
    const rows = card.querySelectorAll('.track-row');
    playlistSelectionState[ts] = new Set(Array.from({ length: rows.length }, (_, i) => i));
    updateSelectionUI(ts);
}

function deselectAllTracks(ts) {
    if (playlistSelectionState[ts]) {
        playlistSelectionState[ts].clear();
    }
    updateSelectionUI(ts);
}

function exitSelectionMode(ts) {
    if (playlistSelectionState[ts]) {
        delete playlistSelectionState[ts];
    }
    updateSelectionUI(ts);
}

function exitAllSelectionModes() {
    Object.keys(playlistSelectionState).forEach(ts => {
        exitSelectionMode(ts);
    });
}

function adjustSelectionAfterRemoval(ts, removedIndex) {
    if (!playlistSelectionState[ts] || !(playlistSelectionState[ts] instanceof Set)) return;
    const currentSet = playlistSelectionState[ts];
    const newSet = new Set();
    currentSet.forEach(idx => {
        if (idx === removedIndex) {
            // Track was deleted, remove from selection
        } else if (idx > removedIndex) {
            // Shift index down by 1 because preceding track was deleted
            newSet.add(idx - 1);
        } else {
            newSet.add(idx);
        }
    });
    playlistSelectionState[ts] = newSet;
}

const feedPad2 = n => String(n).padStart(2, '0');

// One source of truth for the track-number cell: a plain number normally, a
// check box in selection mode (lit when selected).
function trackNumState(index, isSelecting, isSelected, isDug) {
    if (isSelecting) {
        return {
            className: `track-num track-num-btn is-check${isSelected ? ' is-on' : ''}`,
            html: `<span class="track-check">${isSelected ? '<i class="fas fa-check"></i>' : ''}</span>`,
            title: isSelected ? 'Selected — click to deselect' : 'Click to select',
            pressed: isSelected ? 'true' : 'false'
        };
    }
    return {
        className: 'track-num track-num-btn',
        html: feedPad2(index + 1),
        title: isDug ? 'Found via Dig Deeper — click to select tracks' : 'Click to select tracks',
        pressed: 'false'
    };
}

function applyTrackNumState(btn, index, isSelecting, isSelected, isDug) {
    const s = trackNumState(index, isSelecting, isSelected, isDug);
    btn.className = s.className;
    btn.innerHTML = s.html;
    btn.title = s.title;
    btn.setAttribute('aria-pressed', s.pressed);
}

function renderSelectionBarHTML(ts) {
    const isSelecting = isPlaylistSelecting(ts);
    const count = isSelecting ? (playlistSelectionState[ts]?.size || 0) : 0;
    const t = escapeJsAttr(ts);
    return `
        <div id="selection-bar-wrapper-${escapeHtml(ts)}" class="selection-bar-wrapper${isSelecting ? ' active' : ''}">
            <div class="selection-bar-inner">
                <div id="selection-bar-${escapeHtml(ts)}" class="selection-bar">
                    <span class="readout selection-readout"><span id="selection-count-${escapeHtml(ts)}">${feedPad2(count)}</span> SELECTED</span>
                    <div class="selection-actions">
                        <div class="fn"><span class="fn-legend">All</span><button type="button" class="cap cap-sm" onclick="event.stopPropagation();selectAllTracks('${t}')" title="Select all tracks" aria-label="Select all tracks"><i class="fas fa-check-double"></i></button></div>
                        <div class="fn"><span class="fn-legend">None</span><button type="button" class="cap cap-sm" onclick="event.stopPropagation();deselectAllTracks('${t}')" title="Deselect all tracks" aria-label="Deselect all tracks"><i class="far fa-square"></i></button></div>
                        <div class="fn"><span class="fn-legend">Delete</span><button type="button" id="btn-delete-selected-${escapeHtml(ts)}" class="cap cap-sm cap-danger" onclick="event.stopPropagation();deleteSelectedTracks('${t}', this)" title="Delete selected tracks" aria-label="Delete selected tracks"${count === 0 ? ' disabled' : ''}><i class="fas fa-trash-can"></i></button></div>
                        <div class="fn"><span class="fn-legend">Done</span><button type="button" class="cap cap-sm" onclick="event.stopPropagation();exitSelectionMode('${t}')" title="Leave selection mode" aria-label="Leave selection mode"><i class="fas fa-xmark"></i></button></div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function updateSelectionUI(ts) {
    const card = document.querySelector(`[data-ts="${ts}"]`);
    if (!card) return;

    const wrapper = document.getElementById(`selection-bar-wrapper-${ts}`);
    const isSelecting = isPlaylistSelecting(ts);
    const selectedIndices = playlistSelectionState[ts] || new Set();
    const count = selectedIndices.size;

    card.classList.toggle('is-selecting', isSelecting);
    const selectBtn = card.querySelector('.btn-select-tracks');
    if (selectBtn) {
        selectBtn.classList.toggle('is-latched', isSelecting);
        selectBtn.setAttribute('aria-pressed', isSelecting ? 'true' : 'false');
    }

    if (wrapper) {
        wrapper.classList.toggle('active', isSelecting);
        if (isSelecting) {
            const countSpan = document.getElementById(`selection-count-${ts}`);
            if (countSpan) countSpan.textContent = feedPad2(count);

            const deleteBtn = document.getElementById(`btn-delete-selected-${ts}`);
            if (deleteBtn) {
                // If armed for confirmation, disarm so it shows the fresh state
                if (deleteBtn.dataset.confirming && typeof disarmConfirmButton === 'function') {
                    disarmConfirmButton(deleteBtn);
                }
                deleteBtn.disabled = count === 0;
            }
        }
    }

    card.querySelectorAll('.track-row').forEach((row, index) => {
        const isSelected = isSelecting && selectedIndices.has(index);
        row.classList.toggle('is-selected', isSelected);
        const numBtn = row.querySelector('.track-num-btn');
        if (numBtn) applyTrackNumState(numBtn, index, isSelecting, isSelected, row.dataset.dug === 'true');
    });
}

// ── In-App External Link Confirmation Dialog ──
let pendingExternalLinkUrl = null;

function openExternalLinkModal(event, url, serviceName, trackName) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    pendingExternalLinkUrl = url;

    const modal = document.getElementById('external-link-modal');
    const box = document.getElementById('external-link-box');
    const iconEl = document.getElementById('external-link-icon');
    const labelEl = document.getElementById('external-link-service-label');
    const trackEl = document.getElementById('external-link-track-name');
    const descEl = document.getElementById('external-link-description');
    const confirmBtn = document.getElementById('external-link-confirm-btn');

    if (!modal || !box) {
        // Fallback if modal DOM element is missing
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
        return false;
    }

    box.classList.remove('theme-youtube', 'theme-spotify', 'theme-monochrome');

    const service = serviceName || 'link';
    const sLower = service.toLowerCase();
    const action = sLower === 'monochrome' ? 'download lossless audio' : 'search this track';
    const themes = {
        youtube:    { theme: 'theme-youtube',    icon: '<i class="fab fa-youtube"></i>' },
        spotify:    { theme: 'theme-spotify',    icon: '<i class="fab fa-spotify"></i>' },
        monochrome: { theme: 'theme-monochrome', icon: FEED_MONOCHROME_SVG }
    };
    const t = themes[sLower] || { theme: 'theme-youtube', icon: '<i class="fas fa-arrow-up-right-from-square"></i>' };

    box.classList.add(t.theme);
    if (iconEl) iconEl.innerHTML = t.icon;
    if (labelEl) labelEl.textContent = `Open ${service}`;
    if (trackEl) trackEl.textContent = trackName || 'Selected track';
    if (descEl) {
        descEl.innerHTML = `Opens <span id="external-link-service-name">${escapeHtml(service)}</span> to ${action} in a new tab.`;
    } else {
        const nameEl = document.getElementById('external-link-service-name');
        if (nameEl) nameEl.textContent = service;
    }

    modal.classList.remove('hidden');

    // Auto-focus confirm button for rapid keyboard Enter confirmation
    setTimeout(() => {
        if (confirmBtn) confirmBtn.focus();
    }, 50);

    return false;
}

function closeExternalLinkModal() {
    const modal = document.getElementById('external-link-modal');
    if (modal) modal.classList.add('hidden');
    pendingExternalLinkUrl = null;
}

function confirmExternalLinkAction() {
    if (pendingExternalLinkUrl) {
        window.open(pendingExternalLinkUrl, '_blank', 'noopener,noreferrer');
    }
    closeExternalLinkModal();
}

// ── Build single track row HTML ──
function buildTrackHTML(track, index, ts, allTracks = []) {
    const isObj = typeof track === 'object' && track !== null;
    const trackStr = getTrackString(track);
    const hasDash = trackStr.includes(' - ');
    // Raw values (never pre-escaped): escape at the point of insertion only.
    const artist = isObj && track.artist ? String(track.artist) : (hasDash ? trackStr.split(' - ')[0] : '');
    const title  = isObj && track.title ? String(track.title) : (hasDash ? trackStr.split(' - ').slice(1).join(' - ') : trackStr);
    const stripParens = s => s.replace(/\s*[\(\[\{].*?[\)\]\}]/g, '').trim();
    const searchQ = encodeURIComponent(`${stripParens(artist)} ${stripParens(title)}`.trim() || trackStr);
    const q = encodeURIComponent(trackStr);

    const inStash = typeof isStashed === 'function' ? isStashed(artist, title) : false;
    const starTitle = inStash ? 'In Download Stash (click to remove)' : 'Save to Download Stash';

    const isDug = isObj && !!(track.isDigDeeper || track.dug || track._dug || track.source === 'dig-deeper');
    const isSelecting = isPlaylistSelecting(ts);
    const isSelected = isSelecting && playlistSelectionState[ts].has(index);
    const num = trackNumState(index, isSelecting, isSelected, isDug);

    const cachedAnalysis = typeof getCachedAnalysis === 'function' ? getCachedAnalysis(trackStr) : null;
    const badgeHTML = typeof getBadgeHTML === 'function' ? getBadgeHTML(cachedAnalysis) : '';

    // Escaped pieces
    const tsJ = escapeJsAttr(ts);
    const trackJ = escapeJsAttr(trackStr);
    const trackH = escapeHtml(trackStr);
    const artistJ = escapeJsAttr(artist);
    const titleJ = escapeJsAttr(title);
    const stashAttrs = `data-artist="${escapeHtml(artist)}" data-title="${escapeHtml(title)}"`;
    const stashClick = `event.stopPropagation();toggleStashTrack({ artist: '${artistJ}', title: '${titleJ}' }, this)`;
    const stashCls = inStash ? ' is-stashed' : '';
    const yt = `https://www.youtube.com/results?search_query=${q}`;
    const sp = `https://open.spotify.com/search/${searchQ}`;
    const mono = `https://monochrome.tf/search/${searchQ}`;
    const linkClick = service => `return openExternalLinkModal(event, this.href, '${service}', '${trackJ}')`;

    const rowCls = ['track-row', isDug && 'is-dug', isSelected && 'is-selected'].filter(Boolean).join(' ');

    return `<li id="track-${escapeHtml(ts)}-${index}" class="${rowCls}" data-index="${index}" data-dug="${isDug ? 'true' : 'false'}">
        <button type="button" class="${num.className}" onclick="event.stopPropagation();handleTrackNumClick('${tsJ}', ${index})" title="${num.title}" aria-pressed="${num.pressed}">${num.html}</button>
        <button type="button" class="track-play" onclick="event.stopPropagation();previewTrack('${trackJ}',this)" title="Preview 30s" aria-label="Preview ${trackH}"><i class="fas fa-play" aria-hidden="true"></i></button>
        <span class="track-text track-title-wrapper" data-track="${trackH}" title="Click to copy: ${trackH}">
            <span class="track-title track-name">${escapeHtml(title || trackStr)}</span>
            ${artist ? `<span class="track-artist">${escapeHtml(artist)}</span>` : ''}
        </span>
        <span class="track-side">
            <span class="track-badges">${badgeHTML}</span>
            <span class="track-actions">
                <a class="key key-youtube" href="${yt}" onclick="${linkClick('YouTube')}" target="_blank" rel="noopener noreferrer" title="Search YouTube" aria-label="Search ${trackH} on YouTube"><i class="fab fa-youtube" aria-hidden="true"></i></a>
                <a class="key key-spotify" href="${sp}" onclick="${linkClick('Spotify')}" target="_blank" rel="noopener noreferrer" title="Search Spotify" aria-label="Search ${trackH} on Spotify"><i class="fab fa-spotify" aria-hidden="true"></i></a>
                <a class="key key-mono" href="${mono}" onclick="${linkClick('Monochrome')}" target="_blank" rel="noopener noreferrer" title="Download on Monochrome" aria-label="Search ${trackH} on Monochrome">${FEED_MONOCHROME_SVG}</a>
                <button type="button" class="key key-dig" onclick="event.stopPropagation();openDigDeeperModal('${tsJ}', ${index}, '${artistJ}', '${titleJ}')" title="Dig deeper: find tracks like this" aria-label="Find tracks similar to ${trackH}"><i class="fas fa-magnifying-glass-plus" aria-hidden="true"></i></button>
                <button type="button" class="key key-prune" onclick="event.stopPropagation();removeTrackFromMix('${tsJ}', ${index}, this)" title="Remove track from program" aria-label="Remove ${trackH}"><i class="fas fa-xmark" aria-hidden="true"></i></button>
                <button type="button" class="key stash-star-btn${stashCls}" onclick="${stashClick}" ${stashAttrs} title="${starTitle}" aria-label="${starTitle}"><i class="fas fa-star" aria-hidden="true"></i></button>
            </span>
            <button type="button" class="key track-more" onclick="event.stopPropagation();toggleTrackTray(this)" aria-expanded="false" aria-label="More actions for ${trackH}"><i class="fas fa-chevron-down" aria-hidden="true"></i></button>
        </span>
        <div class="track-tray">
            <div class="fn"><span class="fn-legend">YouTube</span><a class="cap cap-sm key-youtube" href="${yt}" onclick="${linkClick('YouTube')}" target="_blank" rel="noopener noreferrer" aria-label="Search ${trackH} on YouTube"><i class="fab fa-youtube" aria-hidden="true"></i></a></div>
            <div class="fn"><span class="fn-legend">Spotify</span><a class="cap cap-sm key-spotify" href="${sp}" onclick="${linkClick('Spotify')}" target="_blank" rel="noopener noreferrer" aria-label="Search ${trackH} on Spotify"><i class="fab fa-spotify" aria-hidden="true"></i></a></div>
            <div class="fn"><span class="fn-legend">Mono</span><a class="cap cap-sm key-mono" href="${mono}" onclick="${linkClick('Monochrome')}" target="_blank" rel="noopener noreferrer" aria-label="Search ${trackH} on Monochrome">${FEED_MONOCHROME_SVG}</a></div>
            <div class="fn"><span class="fn-legend">Dig</span><button type="button" class="cap cap-sm key-dig" onclick="event.stopPropagation();openDigDeeperModal('${tsJ}', ${index}, '${artistJ}', '${titleJ}')" aria-label="Find tracks similar to ${trackH}"><i class="fas fa-magnifying-glass-plus" aria-hidden="true"></i></button></div>
            <div class="fn"><span class="fn-legend">Crate</span><button type="button" class="cap cap-sm stash-star-btn${stashCls}" onclick="${stashClick}" ${stashAttrs} title="${starTitle}" aria-label="${starTitle}"><i class="fas fa-star" aria-hidden="true"></i></button></div>
            <div class="fn"><span class="fn-legend">Prune</span><button type="button" class="cap cap-sm cap-danger" onclick="event.stopPropagation();removeTrackFromMix('${tsJ}', ${index}, this)" aria-label="Remove ${trackH}"><i class="fas fa-xmark" aria-hidden="true"></i></button></div>
        </div>
    </li>`;
}

// ── Render Tracklist in 2 Balanced Columns (First Half Left, Second Half Right) ──
function renderTracklistBlocks(tracks, ts) {
    if (!Array.isArray(tracks) || tracks.length === 0) return '';

    const half = Math.ceil(tracks.length / 2);
    const leftTracks = tracks.slice(0, half);
    const rightTracks = tracks.slice(half);

    return `
        <div class="tracklist-block">
            <ul class="tracklist-col">
                ${leftTracks.map((t, i) => buildTrackHTML(t, i, ts, tracks)).join('')}
            </ul>
            <ul class="tracklist-col">
                ${rightTracks.map((t, i) => buildTrackHTML(t, half + i, ts, tracks)).join('')}
            </ul>
        </div>
    `;
}

// ── Card-level click: merge selection, or expand a compact card ──
function handleMixCardClick(event, ts) {
    if (typeof mergeMode !== 'undefined' && mergeMode) {
        event.stopPropagation();
        if (typeof toggleMergeSelect === 'function') toggleMergeSelect(ts);
        return;
    }
    // compact: the card head opens / closes that one card
    const t = event.target;
    if (currentView === 'compact' && t.closest && t.closest('.mix-head') && !t.closest('button, a, input')) {
        toggleCompactCard(ts);
    }
}

const FEED_FOCUS_LABELS = { 'deep-cuts': 'Underground', balanced: 'Balanced', mainstream: 'Mainstream' };

function formatMixDate(d) {
    if (isNaN(d.getTime())) return '';
    const mon = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    return `${feedPad2(d.getDate())} ${mon} ${feedPad2(d.getFullYear() % 100)} · ${feedPad2(d.getHours())}:${feedPad2(d.getMinutes())}`;
}

// ── Take controls (RE-HUNT results inside one card) ──
function takeControlsHTML(data, tsJ) {
    const n = typeof getTakeCount === 'function' ? getTakeCount(data) : 1;
    const canRehunt = typeof canRehuntMix === 'function' && canRehuntMix(data);
    const rehunt = canRehunt
        ? `<div class="fn mix-rehunt"><span class="fn-legend">Re-hunt</span><button type="button" class="cap cap-sm btn-rehunt" onclick="event.stopPropagation();rehuntMix('${tsJ}', this)" title="Re-hunt this program at the current depth and TRACKS setting · adds a take to this card" aria-label="Re-hunt: add a take at the current depth"><i class="fas fa-rotate-right"></i></button></div>`
        : '';
    if (n === 1) return { rehunt, stepper: '', meta: '' };
    const a = activeTakeIndex(data) + 1;
    const label = `Take ${a} of ${n}`;
    const stepper = `<div class="fn mix-take"><span class="fn-legend">Take</span><span class="take-ctl">
        <button type="button" class="cap cap-sm take-prev" onclick="event.stopPropagation();stepTake('${tsJ}', -1)" title="Previous take" aria-label="Previous take"><i class="fas fa-caret-left"></i></button>
        <span class="take-readout readout" role="status" aria-label="${label}">${a}/${n}</span>
        <button type="button" class="cap cap-sm take-next" onclick="event.stopPropagation();stepTake('${tsJ}', 1)" title="Next take" aria-label="Next take"><i class="fas fa-caret-right"></i></button>
    </span></div>`;
    const meta = `<button type="button" class="readout take-step" onclick="event.stopPropagation();stepTake('${tsJ}', 1)" title="${label} · tap for the next take" aria-label="${label}, show the next take">TAKE ${a}/${n} <i class="fas fa-caret-right" aria-hidden="true"></i></button>`;
    return { rehunt, stepper, meta };
}

function ejectBarHTML(data, tsJ, tsH) {
    const n = typeof getTakeCount === 'function' ? getTakeCount(data) : 1;
    if (n === 1) return '';
    const a = activeTakeIndex(data) + 1;
    return `
        <div class="selection-bar-wrapper eject-bar-wrapper">
            <div class="selection-bar-inner">
                <div class="selection-bar eject-bar">
                    <span class="readout selection-readout">EJECT TAKE ${a} OR ALL ${n}?</span>
                    <div class="selection-actions">
                        <div class="fn"><span class="fn-legend">Take ${a}</span><button type="button" class="cap cap-sm cap-danger" onclick="event.stopPropagation();ejectTake('${tsJ}')" title="Eject only take ${a}" aria-label="Eject take ${a} only"><i class="fas fa-eject"></i></button></div>
                        <div class="fn"><span class="fn-legend">All</span><button type="button" class="cap cap-sm cap-danger" onclick="event.stopPropagation();ejectAllTakes('${tsJ}')" title="Eject the whole program, all ${n} takes" aria-label="Eject the whole program"><i class="fas fa-trash-can"></i></button></div>
                        <div class="fn"><span class="fn-legend">Cancel</span><button type="button" class="cap cap-sm" onclick="event.stopPropagation();toggleEjectChoice('${tsJ}', false)" title="Keep everything" aria-label="Cancel eject"><i class="fas fa-xmark"></i></button></div>
                    </div>
                </div>
            </div>
        </div>`;
}

// ── Render a Mix Card ──
function renderNewMix(data, persist = false) {
    const container  = document.getElementById('mixes-container');
    if (!container) return;
    const card = buildMixCard(data);
    const empty = container.querySelector('.feed-empty');
    if (empty) empty.remove();
    container.insertBefore(card, container.firstChild);
    afterMixCardInsert(card, data);

    if (persist) {
        const history    = getHistory();
        history.unshift(data);
        if (history.length > 50) history.length = 50;
        saveHistory(history);
    }
}

// Redraw one card in place from history (a take changed); no entry animation.
function refreshMixCard(ts) {
    const old = document.querySelector(`#mixes-container [data-ts="${CSS.escape(ts)}"]`);
    const mix = getHistory().find(m => String(m._timestamp) === String(ts));
    if (!old || !mix) { rebuildFeed(); return; }
    if (isPlaylistSelecting(ts)) delete playlistSelectionState[ts]; // row indices belong to the old take
    const card = buildMixCard(mix);
    card.classList.add('is-redrawn');
    old.replaceWith(card);
    if (typeof mergeMode !== 'undefined' && mergeMode && typeof applyMergeHighlights === 'function') applyMergeHighlights();
    const tracks = card.querySelector('.tracks');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (tracks && tracks.animate && !reduce) tracks.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    afterMixCardInsert(card, mix);
}

function afterMixCardInsert(card, data) {
    const ts = card.dataset.ts;
    if (isPlaylistSelecting(ts)) updateSelectionUI(ts);
    const open = !card.classList.contains('mix-card-compact') || card.classList.contains('is-expanded');
    const tracks = Array.isArray(data.tracks) ? data.tracks : [];
    // Background BPM/key analysis (only while the set is on)
    setTimeout(() => { if (open && card.isConnected) analyzeMixCard(card, tracks); }, 40);
}

function buildMixCard(data) {
    const ts         = data._timestamp || new Date().toISOString();
    data._timestamp  = ts;
    const tracks     = Array.isArray(data.tracks) ? data.tracks : [];

    const isFav      = !!data._favorite;
    const isCompact  = currentView === 'compact';
    const isExpanded = isCompact && expandedCompact.has(ts);
    const tsJ        = escapeJsAttr(ts);
    const tsH        = escapeHtml(ts);

    // Energy ladder (1–5): green, green, amber, amber, red
    const energyLevel = Math.min(5, Math.max(1, parseInt(data.energy) || 3));
    const ledColors   = ['', '', ' led-amber', ' led-amber', ' led-red'];
    const energyLeds  = ledColors.map((c, i) => `<i class="led${c}${i < energyLevel ? ' is-on' : ''}"></i>`).join('');

    const focusMode  = data._focus || data.focus || 'balanced';
    const focusLabel = FEED_FOCUS_LABELS[focusMode] || '';
    const genre      = data.genre || 'Music discovery';
    const dateStr    = formatMixDate(new Date(ts));
    const prompt     = data._prompt ? `<span class="engraved engraved-sm">Program</span><p class="readout selectable">“${escapeHtml(data._prompt)}”</p>` : '';
    const notes      = data.description ? `<span class="engraved engraved-sm">Notes</span><p class="selectable">${escapeHtml(data.description)}</p>` : '';
    const take       = takeControlsHTML(data, tsJ);

    const mixHTML = `
        <article class="unit mix-unit${isCompact ? ' mix-card-compact' : ''}${isExpanded ? ' is-expanded' : ''}" data-ts="${tsH}" onclick="handleMixCardClick(event, '${tsJ}')">
            <div class="mix-head">
                <button type="button" class="mix-fav" onclick="event.stopPropagation();toggleFavorite(this, '${tsJ}')" title="${favoriteTitle(isFav)}" aria-label="Favourite" aria-pressed="${isFav}"><span class="lamp-bezel"><span class="lamp lamp-yellow${isFav ? ' is-on' : ''}"></span></span></button>
                <div class="mix-title-block"${isCompact ? ' title="Click to open or close"' : ''}>
                    <h3 class="mix-title selectable" title="${escapeHtml(data.title || '')}">${escapeHtml(data.title || 'Untitled program')}</h3>
                    <div class="mix-meta">
                        ${dateStr ? `<span class="readout">${dateStr}</span>` : ''}
                        <span class="engraved engraved-sm mix-genre" title="${escapeHtml(genre)}">${escapeHtml(genre)}</span>
                        ${focusLabel ? `<span class="engraved engraved-sm mix-focus">${focusLabel}</span>` : ''}
                        <span class="readout"><span class="diag-track-count">${feedPad2(tracks.length)}</span> TRK</span>
                        ${take.meta}
                    </div>
                </div>
                <div class="mix-head-right">
                    <div class="fn mix-energy" title="Energy ${energyLevel}/5">
                        <span class="fn-legend">Energy</span>
                        <span class="leds" role="img" aria-label="Energy ${energyLevel} of 5">${energyLeds}</span>
                    </div>
                    <div class="group">
                        <span class="bracket engraved engraved-sm">Program control</span>
                        <div class="mix-buttons">
                            <div class="fn mix-analyze"><span class="fn-legend"><span class="lamp"></span><span class="fn-text">BPM · Key</span></span><button type="button" id="btn-analyze-${tsH}" class="cap cap-sm btn-analyze-playlist" onclick="event.stopPropagation();triggerPlaylistAnalysis('${tsJ}')" title="Analyze BPM and Camelot keys · press again to retry tracks that came back empty" aria-label="Analyze BPM and key"><i class="fas fa-wave-square"></i></button></div>
                            <div class="fn mix-select"><span class="fn-legend">Select</span><button type="button" class="cap cap-sm btn-select-tracks" onclick="event.stopPropagation();toggleSelectionMode('${tsJ}')" title="Select tracks" aria-label="Select tracks" aria-pressed="false"><i class="fas fa-list-check"></i></button></div>
                            ${take.rehunt}
                            ${take.stepper}
                            <div class="fn mix-eject"><span class="fn-legend">Eject</span><button type="button" class="cap cap-sm cap-danger" onclick="event.stopPropagation();ejectPressed(this, '${tsJ}')" title="${take.meta ? 'Eject this take or the whole program' : 'Delete this program'}" aria-label="${take.meta ? 'Eject: choose this take or the whole program' : 'Eject (delete program)'}"${take.meta ? ' aria-expanded="false"' : ''}><i class="fas fa-eject"></i></button></div>
                        </div>
                    </div>
                </div>
            </div>
            ${ejectBarHTML(data, tsJ, tsH)}
            ${prompt || notes ? `<div class="mix-program">${prompt}${notes}</div>` : ''}
            ${renderSelectionBarHTML(ts)}
            <div class="tracks">
                <div id="tracklist-container-${tsH}">
                    ${renderTracklistBlocks(tracks, ts)}
                </div>
            </div>
        </article>
    `;

    const template = document.createElement('template');
    template.innerHTML = mixHTML.trim();
    return template.content.firstElementChild;
}

// ── Phone action tray: the fold-out key at the end of the row ──
function toggleTrackTray(btn) {
    const row = btn.closest('.track-row');
    if (!row) return;
    const open = !row.classList.contains('is-open');
    document.querySelectorAll('.track-row.is-open').forEach(r => {
        r.classList.remove('is-open');
        const k = r.querySelector('.track-more');
        if (k) k.setAttribute('aria-expanded', 'false');
    });
    row.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
}

// ── Row clicks (delegated) ──
// In selection mode a row click toggles that track. Otherwise a click / tap on the
// title copies "Artist - Title" (phone opens the tray from the row's fold-out key).
document.addEventListener('click', (e) => {
    const target = e.target;
    if (!target || !target.closest) return;
    const row = target.closest('.track-row');
    if (!row || target.closest('button, a, input, .track-tray')) return;
    const sel = window.getSelection ? String(window.getSelection()) : '';
    if (sel) return; // user is selecting text

    const card = row.closest('[data-ts]');
    const ts = card ? card.getAttribute('data-ts') : null;
    const index = parseInt(row.dataset.index, 10);
    if (ts && !isNaN(index) && isPlaylistSelecting(ts)) {
        handleTrackNumClick(ts, index);
        return;
    }

    const wrapper = target.closest('.track-title-wrapper');
    if (wrapper && typeof copyTrackName === 'function') copyTrackName(wrapper);
});

// Browsers may restore checkbox state on reload; keep the switches in step with state.
document.addEventListener('DOMContentLoaded', () => {
    const f = document.getElementById('filter-toggle');
    const v = document.getElementById('view-toggle');
    if (f) f.checked = currentFilter === 'favorites';
    if (v) v.checked = currentView === 'compact';
});
