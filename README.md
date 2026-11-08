# SoundHunt

> **Hunt down songs you didn't know you needed.**

**SoundHunt** lets you explore and discover music using natural language. Type any vibe, era, or genre to uncover tracks, analyze BPM & harmonic keys on the fly, and download keepers instantly.

![SoundHunt Discovery Console](assets/screenshots/main_view.png)

<div align="center">

<h2>🔑 Free Gemini API Key Needed &bull; <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a></h2>

<a href="https://sound-hunt.vercel.app" target="_blank" rel="noopener noreferrer">
  <img src="https://img.shields.io/badge/▶_LAUNCH_LIVE_APP-SoundHunt_on_Vercel-1db954?style=for-the-badge&logo=vercel&logoColor=white&labelColor=0a0a0a" alt="Launch SoundHunt on Vercel">
</a>

<p><em>(Works on Windows, Mac, Linux &amp; mobile • 1-click install as a standalone desktop app)</em></p>

</div>

---

## What Can SoundHunt Do?

- **Natural Language Discovery**: Describe any era, subgenre, or mood in any language (e.g., *"90s underground progressive house"*, *"Wedding Dance Floor Classics"*). No rigid genre dropdowns or algorithmic echo chambers.

- **Discovery Focus (Underground, Balanced, or Hits)**: Flip between **Underground** (for rare vinyl B-sides), **Balanced**, or **Mainstream Hits**.

- **Merge**: Combine multiple generated playlists into a single unified playlist with intelligent duplicate filtering.

- **In-Browser BPM & Camelot Key Detection**: Detect tempo (BPM) and harmonic key with official Serato Camelot color-coded badges (`1A`–`12B`) directly in your browser.

- **Multi-Track Selection**: Click any track number badge to select multiple tracks at once and bulk delete unwanted ones.

- **Remove Tracks**: Click `✕` to quickly remove single tracks.

- **Dig Deeper**: Found a track you love? Click the magnifying glass (`🔍`) to find similar tracks that share that exact groove, era, and energy.

- **Direct Streaming Links**: Jump straight from any track to search and listen on **Spotify**, **YouTube**, or **Monochrome**.

- **Download Stash Drawer**: Star tracks (`★`) into a persistent drawer to save them for later and quickly search them on [Monochrome](https://monochrome.tf).

- **30s Preview Player**: Preview 30-second audio clips directly in your browser with a persistent bottom player bar.

- **PWA Standalone App**: 1-click install as a standalone desktop app on **Windows, macOS, Linux**, or mobile home screens with offline support.

---

## Quick Start

### Option A: Launch Instantly in Browser or Desktop
1. Open the live app: **[SoundHunt on Vercel](https://sound-hunt.vercel.app)**.
2. Press **INSTALL** on the receiver's top strip (or the ⊕ icon in your browser's address bar) to install SoundHunt as a standalone desktop app on **Windows, macOS, or Linux**.

---

### Option B: Run Locally with Python
If you prefer running SoundHunt completely offline or modifying the source locally:
```bash
git clone https://github.com/marceloflix/SoundHunt.git soundhunt
cd soundhunt
python3 server.py
```
Open **`http://localhost:8080`** in your browser.

---

### Setup: Grab Your Free Gemini Key
SoundHunt uses Google's Gemini API (`gemini-3.5-flash-lite`) to understand your musical prompts:
1. Head over to [Google AI Studio](https://aistudio.google.com/apikey).
2. Sign in and click **Create API Key**.
3. Press **REAR** to open the rear panel, plug the key into **Antenna in**, and you're ready to hunt!

*(Keys are saved strictly in your local browser storage—never sent anywhere else).*

![SoundHunt Settings](assets/screenshots/settings_view.png)

---

## License

Distributed under the **MIT License** — Made for music lovers.
