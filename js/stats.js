// ── Meters panel (Stats modal) ──
function statsTop(counts) {
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || null;
}

// A 7-segment odometer window with its legend underneath.
function statsCounterHTML(value, legend, digits) {
    const n = Math.max(0, Math.min(Math.pow(10, digits) - 1, value | 0));
    const text = String(n).padStart(digits, '0');
    return `
        <div class="stat-counter">
            <span class="seg stat-seg${value ? '' : ' is-zero'}" data-ghost="${'8'.repeat(digits)}">${text}</span>
            <span class="engraved engraved-sm">${escapeHtml(legend)}</span>
        </div>`;
}

function statsRowHTML(label, value, note) {
    return `
        <div class="stat-row">
            <span class="silk stat-label">${escapeHtml(label)}</span>
            <span class="stat-value readout" title="${escapeHtml(value)}">${escapeHtml(value)}</span>
            ${note ? `<span class="stat-note">${escapeHtml(note)}</span>` : ''}
        </div>`;
}

function openStats() {
    const history      = getHistory();
    const totalMixes   = history.length;
    const totalTracks  = history.reduce((s, m) => s + (m.tracks?.length || 0), 0);
    const totalMinutes = totalTracks * 4;
    const favCount     = history.filter(m => m._favorite).length;
    const avgEnergyNum = totalMixes
        ? history.reduce((s, m) => s + (parseInt(m.energy) || 3), 0) / totalMixes
        : 0;

    const stashCount = typeof getStash === 'function' ? getStash().length : 0;

    const genreCounts = {};
    history.forEach(m => { if (m.genre) genreCounts[m.genre] = (genreCounts[m.genre] || 0) + 1; });
    const topGenre = statsTop(genreCounts);

    const promptCounts = {};
    history.forEach(m => { if (m._prompt) promptCounts[m._prompt] = (promptCounts[m._prompt] || 0) + 1; });
    const topPrompt = statsTop(promptCounts);

    const artistCounts = {};
    history.forEach(m => {
        (m.tracks || []).forEach(t => {
            let a = '';
            if (typeof t === 'object' && t && t.artist) a = t.artist.trim();
            else if (typeof t === 'string' && t.includes(' - ')) a = t.split(' - ')[0].trim();
            if (a) artistCounts[a] = (artistCounts[a] || 0) + 1;
        });
    });
    const topArtist = statsTop(artistCounts);

    const hours = Math.floor(totalMinutes / 60);
    const mins  = totalMinutes % 60;

    // Energy as a 5-lamp LED ladder
    const lit = Math.round(avgEnergyNum);
    const leds = [1, 2, 3, 4, 5].map(i =>
        `<span class="led${i >= 5 ? ' led-red' : i >= 4 ? ' led-amber' : ''}${i <= lit ? ' is-on' : ''}"></span>`
    ).join('');

    document.getElementById('stats-content').innerHTML = `
        <div class="stats-counters">
            ${statsCounterHTML(totalMixes, 'Programs', 3)}
            ${statsCounterHTML(totalTracks, 'Tracks', 4)}
            ${statsCounterHTML(favCount, 'Favourites', 3)}
            ${statsCounterHTML(stashCount, 'In crate', 3)}
        </div>
        <div class="stats-log">
            <span class="stats-log-title silk">Discovery log</span>
            <div class="stat-row">
                <span class="silk stat-label">Average energy</span>
                <span class="stat-value"><span class="leds" aria-hidden="true">${leds}</span><span class="readout">${avgEnergyNum.toFixed(1)} / 5</span></span>
            </div>
            ${statsRowHTML('Est. listening time', `${hours > 0 ? hours + 'h ' : ''}${mins}m`)}
            ${statsRowHTML('Top artist', topArtist ? topArtist[0] : '—', topArtist ? `${topArtist[1]} trk` : '')}
            ${statsRowHTML('Top genre', topGenre ? topGenre[0] : '—', topGenre ? `${topGenre[1]}×` : '')}
            ${statsRowHTML('Top program', topPrompt ? topPrompt[0] : '—', topPrompt ? `${topPrompt[1]}×` : '')}
        </div>
    `;
    document.getElementById('stats-modal').classList.remove('hidden');
}

function closeStats() {
    document.getElementById('stats-modal').classList.add('hidden');
}
