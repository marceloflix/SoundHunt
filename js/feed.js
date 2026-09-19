// ── View & Filter State ──
let currentFilter = 'all';
let currentView   = 'normal';

// ── Expand compact card and scroll to it ──
function expandAndScrollTo(ts) {
    setView('normal');
    requestAnimationFrame(() => {
        const el = document.querySelector(`[data-ts="${ts}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

// ── Filter ──
function setFilter(mode) {
    currentFilter = mode;
    document.getElementById('btn-filter-all').className = mode === 'all'
        ? 'px-4 py-2 text-[12px] uppercase font-bold tracking-wider border transition-all bg-[#0a2a0a] border-[#1a7b1a] text-[#39ff14]'
        : 'px-4 py-2 text-[12px] uppercase font-bold tracking-wider border transition-all bg-[#0a0a0a] border-[#333] text-white';
    document.getElementById('btn-filter-fav').className = mode === 'favorites'
        ? 'px-4 py-2 text-[12px] uppercase font-bold tracking-wider border transition-all bg-[#2a2000] border-[#ffcc00] text-white'
        : 'px-4 py-2 text-[12px] uppercase font-bold tracking-wider border transition-all bg-[#0a0a0a] border-[#333] text-white';
    rebuildFeed();
}

// ── View ──
function setView(mode) {
    currentView = mode;
    document.getElementById('btn-view-normal').className = mode === 'normal'
        ? 'px-4 py-2 text-[12px] uppercase font-bold tracking-wider border transition-all bg-[#0a1a2a] border-[#3399ff] text-[#3399ff]'
        : 'px-4 py-2 text-[12px] uppercase font-bold tracking-wider border transition-all bg-[#0a0a0a] border-[#333] text-white';
    document.getElementById('btn-view-compact').className = mode === 'compact'
        ? 'px-4 py-2 text-[12px] uppercase font-bold tracking-wider border transition-all bg-[#0a1a2a] border-[#3399ff] text-[#3399ff]'
        : 'px-4 py-2 text-[12px] uppercase font-bold tracking-wider border transition-all bg-[#0a0a0a] border-[#333] text-white';
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
        history = history.filter(m => {
            const haystack = [m.title, m.genre, m._prompt, ...(m.tracks || [])].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(searchTerm);
        });
    }

    history.slice().reverse().forEach(mix => renderNewMix(mix, false));

    if (container.children.length === 0 && currentFilter === 'favorites') {
        container.innerHTML = '<div class="text-center text-[#555] text-[11px] py-8 uppercase tracking-widest"><i class="fas fa-star mr-2"></i>No favorites yet — star a playlist to save it here.</div>';
    } else if (container.children.length === 0 && searchTerm) {
        container.innerHTML = '<div class="text-center text-[#555] text-[11px] py-8 uppercase tracking-widest"><i class="fas fa-search mr-2"></i>No playlists match that search.</div>';
    }

    if (typeof mergeMode !== 'undefined' && mergeMode && typeof applyMergeHighlights === 'function') {
        applyMergeHighlights();
    }

    setTimeout(() => {
        if (typeof observeAllTrackRows === 'function') observeAllTrackRows();
    }, 50);
}

function filterHistory() { rebuildFeed(); }

// ── Favorite Toggle ──
function toggleFavorite(btn, ts) {
    const history = getHistory();
    const mix     = history.find(m => m._timestamp === ts);
    if (!mix) return;
    mix._favorite = !mix._favorite;
    saveHistory(history);
    const isFav  = mix._favorite;
    btn.innerHTML = isFav ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
    btn.title     = isFav ? 'Remove from favorites' : 'Add to favorites';
    btn.className = isFav
        ? 'text-[#ffcc00] hover:text-white text-[16px] transition-all px-2'
        : 'text-white hover:text-[#ffcc00] text-[16px] transition-all px-2 opacity-70 hover:opacity-100';
    if (currentFilter === 'favorites' && !isFav) rebuildFeed();
}

// ── Highlight Track ──
function highlightTrack(ts, index) {
    const el = document.getElementById(`track-${ts}-${index}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.backgroundColor = '#1a3a1a';
    setTimeout(() => { el.style.backgroundColor = 'transparent'; }, 1500);
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
            // Index stays unchanged
            newSet.add(idx);
        }
    });
    playlistSelectionState[ts] = newSet;
}

function renderSelectionBarHTML(ts) {
    const isSelecting = isPlaylistSelecting(ts);
    const count = isSelecting ? (playlistSelectionState[ts]?.size || 0) : 0;
    return `
        <div id="selection-bar-wrapper-${ts}" class="selection-bar-wrapper${isSelecting ? ' active' : ''}">
            <div class="selection-bar-inner">
                <div id="selection-bar-${ts}" class="selection-bar flex items-center justify-between flex-wrap gap-2 px-3 py-1.5 rounded text-xs">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="flex items-center gap-1.5 text-xs text-white font-bold">
                            <i class="fas fa-check-square text-[#39ff14]"></i>
                            <span id="selection-count-${ts}" class="text-[#39ff14] font-extrabold text-sm">${count}</span>
                            <span class="text-white text-[10.5px] uppercase font-semibold tracking-wider">selected</span>
                        </span>
                        <span class="w-[1px] h-3.5 bg-[#1a4a1a] mx-1"></span>
                        <button type="button" onclick="selectAllTracks('${ts}')" class="px-2.5 py-1 bg-[#141414] hover:bg-[#1a2a1a] text-white hover:text-[#39ff14] border border-[#444] hover:border-[#39ff14] text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer">
                            Select All
                        </button>
                        <button type="button" onclick="deselectAllTracks('${ts}')" class="px-2.5 py-1 bg-[#141414] hover:bg-[#222] text-white hover:text-[#ffcc00] border border-[#444] hover:border-[#ffcc00] text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer">
                            Deselect
                        </button>
                    </div>
                    <div class="flex items-center gap-2">
                        <button type="button" id="btn-delete-selected-${ts}" onclick="deleteSelectedTracks('${ts}', this)" class="px-3 py-1 bg-[#220000] hover:bg-[#330000] text-[#ff3333] border border-[#ff3333] hover:shadow-[0_0_8px_rgba(255,51,51,0.5)] text-[10.5px] font-extrabold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${count === 0 ? 'opacity-40 pointer-events-none' : ''}">
                            <i class="fas fa-trash-alt text-[9.5px]"></i> Delete Selected
                        </button>
                        <button type="button" onclick="exitSelectionMode('${ts}')" class="px-2.5 py-1 bg-[#141414] hover:bg-[#222] text-white hover:text-[#ff3333] border border-[#444] hover:border-[#ff3333] text-[10.5px] font-bold uppercase tracking-wider transition-colors cursor-pointer">
                            Cancel
                        </button>
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

    if (wrapper) {
        if (isSelecting) {
            wrapper.classList.add('active');
            const countSpan = document.getElementById(`selection-count-${ts}`);
            if (countSpan) countSpan.textContent = count;

            const deleteBtn = document.getElementById(`btn-delete-selected-${ts}`);
            if (deleteBtn) {
                // If button was currently armed for confirmation, disarm it so it displays fresh state
                if (deleteBtn.dataset.confirming && typeof disarmConfirmButton === 'function') {
                    disarmConfirmButton(deleteBtn);
                }

                if (count === 0) {
                    deleteBtn.classList.add('opacity-40', 'pointer-events-none');
                } else {
                    deleteBtn.classList.remove('opacity-40', 'pointer-events-none');
                }
            }
        } else {
            wrapper.classList.remove('active');
        }
    }

    const rows = card.querySelectorAll('.track-row');
    rows.forEach((row, index) => {
        const numBtn = row.querySelector('.track-num-btn');
        const isSelected = isSelecting && selectedIndices.has(index);
        const isDug = row.dataset.dug === 'true';

        if (isSelected) {
            row.classList.add('track-row-selected');
        } else {
            row.classList.remove('track-row-selected');
        }

        if (!numBtn) return;

        if (isSelecting) {
            if (isSelected) {
                const checkColor = isDug ? 'text-[#3399ff]' : 'text-[#39ff14]';
                const checkBg = isDug ? 'bg-[#001f3f] border-[#3399ff]' : 'bg-[#0a2a0a] border-[#39ff14]';
                const checkShadow = isDug ? 'shadow-[0_0_8px_rgba(51,153,255,0.6)]' : 'shadow-[0_0_8px_rgba(57,255,20,0.6)]';
                numBtn.className = `track-num-btn shrink-0 w-6 h-6 flex items-center justify-center ${checkBg} border ${checkColor} ${checkShadow} text-[10px] rounded-[2px] transition-all cursor-pointer`;
                numBtn.innerHTML = '<i class="fas fa-check"></i>';
                numBtn.title = 'Selected — Click to uncheck';
            } else {
                const emptyBorder = isDug ? 'border-[#004080] hover:border-[#3399ff]' : 'border-[#444] hover:border-[#39ff14]';
                const emptyBg = isDug ? 'bg-[#001428]' : 'bg-[#0a0a0a]';
                numBtn.className = `track-num-btn shrink-0 w-6 h-6 flex items-center justify-center ${emptyBg} border ${emptyBorder} text-[10px] rounded-[2px] transition-all cursor-pointer`;
                numBtn.innerHTML = `<span class="w-2.5 h-2.5 rounded-[1px] border ${emptyBorder}"></span>`;
                numBtn.title = 'Click to select';
            }
        } else {
            const num = index + 1;
            const numClass = isDug
                ? 'bg-[#001428] border border-[#003366] text-[#3399ff] group-hover:border-[#3399ff] group-hover:text-[#3399ff] shadow-[0_0_5px_rgba(51,153,255,0.35)]'
                : 'bg-[#111] border border-[#333] text-white group-hover:border-[#39ff14] group-hover:text-[#39ff14]';
            const numTitle = isDug ? 'Discovered via Dig Deeper — Click to select multiple tracks' : 'Click to select multiple tracks';
            numBtn.className = `track-num-btn shrink-0 w-6 h-6 flex items-center justify-center ${numClass} text-[10px] font-bold transition-all cursor-pointer`;
            numBtn.innerHTML = `${num}`;
            numBtn.title = numTitle;
        }
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
    const nameEl = document.getElementById('external-link-service-name');
    const trackEl = document.getElementById('external-link-track-name');
    const descEl = document.getElementById('external-link-description');
    const confirmBtn = document.getElementById('external-link-confirm-btn');

    if (!modal || !box) {
        // Fallback if modal DOM element is missing
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
        return false;
    }

    // Reset themes
    box.classList.remove('theme-youtube', 'theme-spotify', 'theme-monochrome');

    const sLower = (serviceName || '').toLowerCase();
    const action = sLower === 'monochrome' ? 'download lossless audio' : 'search track';

    if (sLower === 'youtube') {
        box.classList.add('theme-youtube');
        iconEl.innerHTML = '<i class="fab fa-youtube text-[#ff4444] text-sm"></i>';
        labelEl.textContent = 'Open YouTube';
    } else if (sLower === 'spotify') {
        box.classList.add('theme-spotify');
        iconEl.innerHTML = '<i class="fab fa-spotify text-[#1db954] text-sm"></i>';
        labelEl.textContent = 'Open Spotify';
    } else if (sLower === 'monochrome') {
        box.classList.add('theme-monochrome');
        iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="14.75 14.75 70.5 70.5" class="text-[#bb86fc]" aria-hidden="true"><g fill="currentColor"><path d="M38.25 14.75H85.25V61.75H61.75V38.25H38.25ZM14.75 38.25H38.25V61.75H61.75V85.25H14.75Z"/></g></svg>`;
        labelEl.textContent = 'Open Monochrome';
    } else {
        box.classList.add('theme-youtube');
        iconEl.innerHTML = '<i class="fas fa-external-link-alt text-sm"></i>';
        labelEl.textContent = `Open ${serviceName}`;
    }

    if (nameEl) nameEl.textContent = serviceName;
    if (trackEl) trackEl.textContent = trackName || 'Selected Track';
    if (descEl) descEl.innerHTML = `Opens <span class="font-bold text-white">${serviceName}</span> to ${action} in a new tab.`;

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

// Backward-compatible alias
function confirmExternalLink(event, serviceName, trackName) {
    const target = event && event.currentTarget ? event.currentTarget.href : null;
    return openExternalLinkModal(event, target, serviceName, trackName);
}

// ── Build single track row HTML ──
function buildTrackHTML(track, index, ts, allTracks = []) {
    const isObj = typeof track === 'object' && track !== null;
    const trackStr = getTrackString(track);
    const cleanA = (isObj && track.artist ? track.artist : '').replace(/\s*[\(\[\{].*?[\)\]\}]/g, '').trim();
    const cleanT = (isObj && track.title ? track.title : (trackStr.includes(' - ') ? trackStr.split(' - ').slice(1).join(' - ') : trackStr)).replace(/\s*[\(\[\{].*?[\)\]\}]/g, '').trim();
    const searchQ = encodeURIComponent(`${cleanA} ${cleanT}`.trim() || trackStr);
    const q = encodeURIComponent(trackStr);
    const num = index + 1;
    const trackEscaped = trackStr.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const artistEscaped = (isObj && track.artist ? track.artist : (trackStr.includes(' - ') ? trackStr.split(' - ')[0] : '')).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const titleEscaped = (isObj && track.title ? track.title : (trackStr.includes(' - ') ? trackStr.split(' - ').slice(1).join(' - ') : trackStr)).replace(/'/g, "\\'").replace(/"/g, '&quot;');

    const inStash = typeof isStashed === 'function' ? isStashed(artistEscaped, titleEscaped) : false;
    const starClass = inStash ? 'is-stashed' : '';
    const starTitle = inStash ? 'In Download Stash (Click to remove)' : 'Save to Download Stash';

    const isDug = isObj && !!(track.isDigDeeper || track.dug || track._dug || track.source === 'dig-deeper');
    const isSelecting = isPlaylistSelecting(ts);
    const isSelected = isSelecting && playlistSelectionState[ts].has(index);

    let numButtonHTML = '';
    if (isSelecting) {
        if (isSelected) {
            const checkColor = isDug ? 'text-[#3399ff]' : 'text-[#39ff14]';
            const checkBg = isDug ? 'bg-[#001f3f] border-[#3399ff]' : 'bg-[#0a2a0a] border-[#39ff14]';
            const checkShadow = isDug ? 'shadow-[0_0_8px_rgba(51,153,255,0.6)]' : 'shadow-[0_0_8px_rgba(57,255,20,0.6)]';
            numButtonHTML = `<button type="button" onclick="event.stopPropagation();handleTrackNumClick('${ts}', ${index})" class="track-num-btn shrink-0 w-6 h-6 flex items-center justify-center ${checkBg} border ${checkColor} ${checkShadow} text-[10px] rounded-[2px] transition-all cursor-pointer" title="Selected — Click to uncheck"><i class="fas fa-check"></i></button>`;
        } else {
            const emptyBorder = isDug ? 'border-[#004080] hover:border-[#3399ff]' : 'border-[#444] hover:border-[#39ff14]';
            const emptyBg = isDug ? 'bg-[#001428]' : 'bg-[#0a0a0a]';
            numButtonHTML = `<button type="button" onclick="event.stopPropagation();handleTrackNumClick('${ts}', ${index})" class="track-num-btn shrink-0 w-6 h-6 flex items-center justify-center ${emptyBg} border ${emptyBorder} text-[10px] rounded-[2px] transition-all cursor-pointer" title="Click to select"><span class="w-2.5 h-2.5 rounded-[1px] border ${emptyBorder}"></span></button>`;
        }
    } else {
        const numClass = isDug
            ? 'bg-[#001428] border border-[#003366] text-[#3399ff] group-hover:border-[#3399ff] group-hover:text-[#3399ff] shadow-[0_0_5px_rgba(51,153,255,0.35)]'
            : 'bg-[#111] border border-[#333] text-white group-hover:border-[#39ff14] group-hover:text-[#39ff14]';
        const numTitle = isDug ? 'Discovered via Dig Deeper — Click to select multiple tracks' : 'Click to select multiple tracks';
        numButtonHTML = `<button type="button" onclick="event.stopPropagation();handleTrackNumClick('${ts}', ${index})" class="track-num-btn shrink-0 w-6 h-6 flex items-center justify-center ${numClass} text-[10px] font-bold transition-all cursor-pointer" title="${numTitle}">${num}</button>`;
    }

    const rowSelectedClass = isSelected ? ` track-row-selected${isDug ? ' track-row-dug' : ''}` : (isDug ? ' track-row-dug' : '');
    const rowClickAction = `onclick="if(isPlaylistSelecting('${ts}')){handleTrackNumClick('${ts}', ${index});}"`;

    const cachedAnalysis = typeof getCachedAnalysis === 'function' ? getCachedAnalysis(trackStr) : null;
    const badgeHTML = typeof getBadgeHTML === 'function' ? getBadgeHTML(cachedAnalysis) : '';

    return `<li id="track-${ts}-${index}" data-dug="${isDug ? 'true' : 'false'}" class="track-row last:border-0 group transition-colors duration-500${rowSelectedClass}" ${rowClickAction}>
        <!-- Row 1: Left Container (Prune, Number, Title) -->
        <div class="track-left flex items-center gap-1.5 min-w-0">
            <!-- Track Prune Button -->
            <button onclick="event.stopPropagation();removeTrackFromMix('${ts}', ${index}, this)" title="Remove track from list" aria-label="Remove track" class="shrink-0 w-6 h-6 flex items-center justify-center bg-[#111] border border-[#333] text-[#aaa] hover:border-[#ff3333] hover:text-[#ff3333] hover:bg-[#220000] text-[9px] font-bold transition-all cursor-pointer">
                <i class="fas fa-times"></i>
            </button>

            ${numButtonHTML}

            <!-- Track Title -->
            <span onclick="copyTrackName(this)" data-track="${trackEscaped}" title="Click to copy: ${trackEscaped}" class="track-title-wrapper text-white text-[15px] leading-tight cursor-pointer select-none flex items-center min-w-0 flex-1 overflow-hidden mr-1">
                <span class="track-name truncate group-hover/track:text-[#ccc] transition-colors">${trackStr}</span>
                <i class="fas fa-clipboard text-[#333] text-[9px] opacity-0 group-hover/track:opacity-100 transition-opacity shrink-0 ml-1" aria-hidden="true"></i>
            </span>
        </div>

        <!-- Row 2 / Right Container (Badges + Actions) -->
        <div class="track-right flex items-center gap-1.5 shrink-0">
            <!-- BPM & Serato Camelot Key Badge Container -->
            <span class="track-badges">${badgeHTML}</span>

            <!-- Track Actions Line -->
            <div class="track-actions flex gap-1 shrink-0 items-center">
                <!-- 1. Preview 30s (First) -->
                <button onclick="event.stopPropagation();previewTrack('${trackEscaped}',this)" title="Preview 30s" aria-label="Preview ${trackStr}" class="flex items-center justify-center w-6 h-6 bg-[#001a00] border border-[#005500] text-[#39ff14] text-[13px] opacity-75 group-hover:opacity-100 hover:border-[#39ff14] hover:bg-[#0a2a0a] hover:shadow-[0_0_5px_rgba(57,255,20,0.4)] transition-all cursor-pointer"><i class="fas fa-play" aria-hidden="true" style="font-size:9px"></i></button>

                <!-- 2. Streaming & Download Links -->
                <a href="https://www.youtube.com/results?search_query=${q}" onclick="return openExternalLinkModal(event, this.href, 'YouTube', '${trackEscaped}')" target="_blank" rel="noopener noreferrer" title="Search YouTube" aria-label="Search ${trackStr} on YouTube" class="flex items-center justify-center w-6 h-6 bg-[#1a0000] border border-[#550000] text-[#ff4444] text-[13px] opacity-75 group-hover:opacity-100 hover:border-[#ff4444] hover:bg-[#330000] hover:shadow-[0_0_5px_rgba(255,68,68,0.4)] transition-all cursor-pointer"><i class="fab fa-youtube" aria-hidden="true"></i></a>
                <a href="https://open.spotify.com/search/${searchQ}" onclick="return openExternalLinkModal(event, this.href, 'Spotify', '${trackEscaped}')" target="_blank" rel="noopener noreferrer" title="Search Spotify" aria-label="Search ${trackStr} on Spotify" class="flex items-center justify-center w-6 h-6 bg-[#001a00] border border-[#005500] text-[#1db954] text-[13px] opacity-75 group-hover:opacity-100 hover:border-[#1db954] hover:bg-[#003300] hover:shadow-[0_0_5px_rgba(29,185,84,0.4)] transition-all cursor-pointer"><i class="fab fa-spotify" aria-hidden="true"></i></a>
                <a href="https://monochrome.tf/search/${searchQ}" onclick="return openExternalLinkModal(event, this.href, 'Monochrome', '${trackEscaped}')" target="_blank" rel="noopener noreferrer" title="Download on Monochrome" aria-label="Search ${trackStr} on Monochrome" class="flex items-center justify-center w-6 h-6 bg-[#0d001a] border border-[#2a0055] text-[#bb86fc] opacity-75 group-hover:opacity-100 hover:border-[#bb86fc] hover:bg-[#1a0033] hover:shadow-[0_0_5px_rgba(187,134,252,0.4)] transition-all cursor-pointer"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="14.75 14.75 70.5 70.5" aria-hidden="true"><g fill="currentColor"><path d="M38.25 14.75H85.25V61.75H61.75V38.25H38.25ZM14.75 38.25H38.25V61.75H61.75V85.25H14.75Z"/></g></svg></a>

                <!-- Spacing divider -->
                <span class="w-[1px] h-3.5 bg-[#222] mx-1 shrink-0"></span>

                <!-- 3. Dig Deeper (Magnifying Glass) -->
                <button onclick="event.stopPropagation();openDigDeeperModal('${ts}', ${index}, '${artistEscaped}','${titleEscaped}')" title="Dig Deeper: Find tracks similar to ${trackStr}" aria-label="Find tracks similar to ${trackStr}" class="shrink-0 flex items-center justify-center w-6 h-6 bg-[#001428] border border-[#003366] text-[#3399ff] hover:border-[#3399ff] hover:bg-[#002244] hover:shadow-[0_0_6px_rgba(51,153,255,0.4)] text-[10px] transition-all cursor-pointer">
                    <i class="fas fa-search"></i>
                </button>

                <!-- 4. Save to Download Stash (End) -->
                <button onclick="event.stopPropagation();toggleStashTrack({ artist: '${artistEscaped}', title: '${titleEscaped}' }, this)" data-artist="${artistEscaped}" data-title="${titleEscaped}" title="${starTitle}" aria-label="${starTitle}" class="stash-star-btn shrink-0 flex items-center justify-center w-6 h-6 border ${starClass} text-[11px] transition-all cursor-pointer">
                    <i class="fas fa-star"></i>
                </button>
            </div>
        </div>
    </li>`;
}

// ── Render Tracklist in 2 Balanced Columns (First Half Left, Second Half Right) ──
function renderTracklistBlocks(tracks, ts) {
    if (!Array.isArray(tracks) || tracks.length === 0) return '';

    // Balanced 2-column split across entire tracklist
    const half = Math.ceil(tracks.length / 2);
    const leftTracks = tracks.slice(0, half);
    const rightTracks = tracks.slice(half);

    return `
        <div class="tracklist-block grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-0">
            <ul class="tracklist-col flex flex-col list-none p-0 m-0">
                ${leftTracks.map((t, i) => buildTrackHTML(t, i, ts, tracks)).join('')}
            </ul>
            <ul class="tracklist-col flex flex-col list-none p-0 m-0">
                ${rightTracks.map((t, i) => buildTrackHTML(t, half + i, ts, tracks)).join('')}
            </ul>
        </div>
    `;
}

// ── Render a Mix Card ──
function renderNewMix(data, persist = false) {
    const container  = document.getElementById('mixes-container');
    if (!container) return;
    const ts         = data._timestamp || new Date().toISOString();
    data._timestamp  = ts;

    const d          = new Date(ts);
    const currentDate = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
    const currentTime = d.toLocaleTimeString('en-US', { hour12: false });
    const isFav      = !!data._favorite;
    const isCompact  = currentView === 'compact';
    const starIcon   = isFav ? 'fas fa-star'  : 'far fa-star';
    const starColor  = isFav ? 'text-[#ffcc00] hover:text-white text-[16px] transition-all px-2' : 'text-white hover:text-[#ffcc00] text-[16px] transition-all px-2 opacity-70 hover:opacity-100';
    const starTitle  = isFav ? 'Remove from favorites' : 'Add to favorites';

    // Energy dots (1–5)
    const energyLevel = Math.min(5, Math.max(1, parseInt(data.energy) || 3));
    const dotColors   = ['#39ff14', '#39ff14', '#ffcc00', '#ff9900', '#ff3333'];
    const energyDots  = Array.from({ length: 5 }, (_, i) => {
        const color = i < energyLevel ? dotColors[Math.min(i, energyLevel - 1)] : '#2a2a2a';
        return `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${color};margin-right:2px;vertical-align:middle"></span>`;
    }).join('');

    const bodyHTML = isCompact ? '' : `
        <div class="mix-datebar bg-[#050f05] text-right px-2 py-[2px] mix-title-date border-b border-[#1a4a1a] text-[#39ff14] uppercase tracking-wider">
            ${currentDate} @ ${currentTime}
        </div>
        <div class="mix-body panel-content flex flex-col gap-4">
            <div class="details-box">
                <div class="details-box-row flex items-center justify-between flex-wrap gap-x-3 gap-y-2">
                    <span class="details-stats flex items-center gap-2 sm:gap-3 flex-nowrap py-0.5 whitespace-nowrap min-w-0 flex-1">
                        <span class="shrink-0"><span class="text-[#39ff14] text-[10px] font-semibold mr-1">Tracks</span><span class="text-white font-bold text-[11px] diag-track-count">${data.tracks.length}</span></span>
                        <span class="shrink-0"><span class="text-[#39ff14] text-[10px] font-semibold mr-1">Energy</span><span>${energyDots}</span></span>
                        <span class="flex items-center min-w-0 overflow-hidden"><span class="text-[#39ff14] text-[10px] font-semibold mr-1 shrink-0">Genre</span><span class="text-white text-[11px] truncate inline-block align-middle" title="${data.genre || 'Music Discovery'}">${data.genre || 'Music Discovery'}</span></span>
                    </span>
                    <button id="btn-analyze-${ts}" onclick="event.stopPropagation();triggerPlaylistAnalysis('${ts}', this, this.classList.contains('has-analyzed'))" class="btn-analyze-playlist shrink-0" title="Analyze or re-analyze BPM tempo and Serato Camelot keys">
                        <i class="fas fa-redo text-[#39ff14]"></i>
                        <span>BPM & KEY</span>
                    </button>
                </div>
            </div>
            <div class="flex flex-col gap-4">
                <div class="flex-1 flex flex-col justify-between">
                    <div class="text-[#b0b0b0] text-[12px]">
                        ${data._prompt ? `<p class="mb-2 flex items-start gap-2 text-[11px]"><span class="shrink-0 text-[#39ff14] uppercase font-bold tracking-wider mt-[1px]">Prompt</span><span class="text-white">${data._prompt}</span></p>` : ''}
                        ${data.description ? `<p class="mb-3 text-[11px] text-white italic border-l-2 border-[#1a4a1a] pl-2">${data.description}</p>` : ''}
                        <div class="bg-[#050505] border border-[#1a4a1a] p-2">
                            ${renderSelectionBarHTML(ts)}
                            <div id="tracklist-container-${ts}">
                                ${renderTracklistBlocks(data.tracks, ts)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

    // Discovery Focus Header Icon strictly matching selector buttons:
    // Balanced: Green Vinyl (fa-compact-disc text-[#39ff14])
    // Underground: Lightning Bolt (fa-bolt text-[#ffcc00])
    // Mainstream Hits: Fire (fa-fire text-[#ff4444])
    let focusIconHTML = '<i class="fas fa-compact-disc text-[#39ff14] shrink-0" title="Balanced Discovery"></i>';
    const focusMode = data._focus || data.focus || 'balanced';
    if (focusMode === 'deep-cuts') {
        focusIconHTML = '<i class="fas fa-bolt text-[#ffcc00] shrink-0" title="Underground"></i>';
    } else if (focusMode === 'mainstream') {
        focusIconHTML = '<i class="fas fa-fire text-[#ff4444] shrink-0" title="Mainstream Hits"></i>';
    }

    const mixHTML = `
        <div class="panel group/card border border-[#39ff14] shadow-[0_0_10px_rgba(57,255,20,0.2)] transition-all duration-300 animate-fade-in-down${isCompact ? ' mix-card-compact' : ''}" data-ts="${ts}" onclick="if(typeof mergeMode !== 'undefined' && mergeMode){event.stopPropagation();toggleMergeSelect('${ts}')}">
            <div class="panel-header bg-gradient-to-b from-[#1a4a1a] to-[#0a2a0a] border-[#1a7b1a] flex items-center justify-between${isCompact ? ' cursor-pointer' : ''}" ${isCompact && (typeof mergeMode === 'undefined' || !mergeMode) ? `onclick="expandAndScrollTo('${ts}')" title="Click to expand"` : ''}>
                <div class="text-sm flex items-center gap-2 min-w-0">
                    ${focusIconHTML}
                    <span class="truncate font-bold">${data.title}</span>
                    ${isCompact ? `<span class="text-white text-[10px] shrink-0">${data.tracks.length} tracks &bull; ${currentDate}</span>` : ''}
                </div>
                <div class="flex items-center gap-1 shrink-0">
                    <button onclick="event.stopPropagation();toggleFavorite(this, '${ts}')" title="${starTitle}"
                            class="${starColor} text-[13px] transition-colors px-1 shrink-0">
                        <i class="${starIcon}"></i>
                    </button>
                    <button onclick="event.stopPropagation();deleteMix(this, '${ts}')" title="Delete this playlist"
                            class="text-white hover:text-[#ff3333] text-[11px] transition-all px-1.5 py-0.5 shrink-0 hover:drop-shadow-[0_0_4px_rgba(255,51,51,0.5)] cursor-pointer">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            ${bodyHTML}
        </div>
    `;

    const template = document.createElement('template');
    template.innerHTML = mixHTML.trim();
    container.insertBefore(template.content.firstChild, container.firstChild);

    // Observe newly rendered track rows and start sequential background analysis
    setTimeout(() => {
        const card = container.querySelector(`[data-ts="${ts}"]`);
        if (card) {
            const rows = card.querySelectorAll('.track-row');
            rows.forEach(r => {
                if (typeof observeTrackRow === 'function') observeTrackRow(r);
            });
        }
        if (!isCompact && typeof dspQueue !== 'undefined' && Array.isArray(data.tracks) && data.tracks.length > 0) {
            dspQueue.startPlaylist(ts, data.tracks, false);
        }
    }, 40);

    if (persist) {
        const history    = getHistory();
        data._timestamp  = ts;
        history.unshift(data);
        if (history.length > 50) history.length = 50;
        saveHistory(history);
    }
}
