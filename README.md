# secondmind

A personal second brain app inspired by [mymind](https://mymind.com) and Obsidian. Save anything from the web — articles, Instagram posts, TikTok videos and slideshows, Pinterest boards, products, recipes — and have it automatically tagged and organized locally.

Everything runs on your machine. No subscriptions, no cloud, no tracking.

![secondmind screenshot](https://i.imgur.com/placeholder.png)

---

## Features

- **One-click saving** via a Chrome extension
- **Auto-tagging** powered by a local Ollama LLM
- **Smart extraction** for Instagram (photos, carousels, Reels) and TikTok (videos, slideshows)
- **Visual grid** with masonry layout, carousel support, and play indicators
- **Full-text search** across titles, descriptions, tags, and notes
- **Filter by type** — Instagram, TikTok, YouTube, Pinterest, Product, Recipe, Article, and more
- **100% local** — SQLite database, images cached on disk, no external services

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| [Python](https://python.org) | 3.10+ | For the backend |
| [Node.js](https://nodejs.org) | 18+ | For the frontend |
| [Ollama](https://ollama.com) | latest | For local AI tagging |
| Chrome, Brave, or any Chromium browser | any | For the extension |

---

## Installation

### 1. Get the files

**Option A — Download ZIP (no Git required):**

1. Click the green **Code** button at the top of this page
2. Click **Download ZIP**
3. Extract the ZIP file anywhere on your computer (e.g. Desktop or Documents)
4. Open the extracted folder — it should be called `secondmind-main` or similar

**Option B — Git (if you have it):**

```bash
git clone https://github.com/your-username/secondmind.git
cd secondmind
```

> All the steps below assume you're working inside this folder. When instructions say "open a terminal here", right-click the folder and choose **Open in Terminal** (Windows 11) or **Open PowerShell window here** (Windows 10).

### 2. Set up Ollama (AI tagging)

Download and install Ollama from [ollama.com](https://ollama.com), then pull the models:

```bash
# Text tagging and cluster naming (required)
ollama pull llama3.2

# Semantic embeddings — powers search and Universe clustering (required)
ollama pull nomic-embed-text

# Vision model for image tagging (optional but recommended)
ollama pull moondream
```

Ollama runs automatically in the background after installation. You can verify it's running at `http://localhost:11434`.

### 3. Set up the backend

```bash
cd backend
python -m venv venv
# Windows
venv\Scripts\pip install -r requirements.txt
# macOS / Linux
venv/bin/pip install -r requirements.txt
```

### 4. Install the Chrome extension

1. Open your browser and go to the extensions page:
   - Chrome: `chrome://extensions`
   - Brave: `brave://extensions`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select the `extension/` folder from this repo

The secondmind icon will appear in your toolbar. Pin it for easy access.

---

## Running the app

There are two ways to run secondmind. Pick whichever works best for you.

---

### Option A — Desktop app (Electron)

The app opens as a standalone window, no browser needed.

**Windows:**

1. Open the `secondmind` folder
2. Double-click **`SecondMind.vbs`**
3. A terminal window opens — the first launch may take a minute while it installs what it needs
4. Once you see the app window, you're done — you can close the terminal window if you want

> **Tip:** right-click `SecondMind.vbs` → Send to → Desktop (shortcut) so you can launch it from your desktop next time.

**macOS / Linux:**

Open a terminal in the folder and run:

```bash
chmod +x SecondMind.sh   # only needed the first time
./SecondMind.sh
```

---

### Option B — Browser (simpler, works everywhere)

Run the backend and frontend manually. The app opens in your browser at `http://localhost:5173`.

**Terminal 1 — backend:**

```bash
cd backend
# Windows
venv\Scripts\uvicorn main:app --reload
# macOS / Linux
venv/bin/uvicorn main:app --reload
```

**Terminal 2 — frontend:**

```bash
cd frontend
npm install   # first time only
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Usage

1. Browse to any page you want to save (article, Instagram post, TikTok video, product page, etc.)
2. Click the **secondmind** extension icon
3. Optionally add a note
4. Click **Save**

The item appears in your secondmind grid instantly. Tags are generated in the background by Ollama and appear within a few seconds.

### Tips

- **TikTok videos**: navigate to the individual video page (the URL should contain `/video/`) before saving for best results
- **Instagram carousels**: open the post first — the extension will automatically scroll through all slides
- **Instagram Reels**: the extension captures a video frame as the thumbnail

---

## Project structure

```
secondmind/
├── backend/
│   ├── main.py          # FastAPI server — save, list, search, delete endpoints
│   ├── saver.py         # Scraping, tagging, image caching logic
│   ├── requirements.txt
│   └── secondmind.db    # SQLite database (created on first run)
├── frontend/
│   └── src/
│       ├── App.jsx       # Main grid, search, type filters
│       ├── SaveCard.jsx  # Individual card in the grid
│       └── SaveDetail.jsx# Detail modal
├── extension/
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js         # Save button logic, metadata extraction per site
│   └── content.js       # Fallback metadata extraction (injected into pages)
└── README.md
```

---

## Troubleshooting

### Windows: `venv\Scripts\activate` fails with "execution policy" error

PowerShell blocks scripts by default. Either run this once to allow them:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Or just skip activating the venv entirely — call `venv\Scripts\pip` and `venv\Scripts\uvicorn` directly (as shown in Option B above).

### Windows: `npm` is not recognized

Node.js was installed but the terminal doesn't know about it yet. Close all terminal windows and open a new one — the PATH update only takes effect in new sessions.

### Double-clicking SecondMind.vbs does nothing at all

The `.vbs` script runs everything in a hidden window — if anything fails, there is no visible error. The two most common causes:

1. **`npm` not in PATH** — When launched from the desktop (via WScript), Windows uses a limited PATH that often doesn't include Node.js. Even if `npm` works fine in your terminal, it may not be found here.
2. **Root dependencies not installed** — The Electron app needs its own `npm install` at the repo root (not just inside `frontend/`). If you skipped that step, `concurrently`, `electron`, and `wait-on` won't exist and the command fails immediately.

**How to diagnose:** open a terminal (cmd or PowerShell), `cd` into the repo, and run:

```bat
SecondMind-debug.bat
```

This runs the same command but with a visible window, so you'll see the exact error. Fix it there, then the `.vbs` shortcut will work too.

**Quick fix for the PATH issue:** always launch via the terminal shortcut above rather than double-clicking the `.vbs`. Or use **Option B** (browser mode) — it doesn't have this problem.

### Desktop app opens but shows a blank page or no saves load

The Electron app auto-starts the Python backend by spawning `backend/venv/Scripts/python.exe` (Windows) or `backend/venv/bin/python` (macOS/Linux). If that file doesn't exist, the backend silently fails — Electron still opens the window after a short delay, but all API calls to `localhost:8000` return errors.

**Most common cause:** the backend venv hasn't been set up yet. Run the setup from step 3 of Installation first:

```bash
cd backend
python -m venv venv
venv\Scripts\pip install -r requirements.txt   # Windows
# venv/bin/pip install -r requirements.txt    # macOS / Linux
```

Once the venv exists, restart the desktop app. To confirm the backend is starting correctly, run `SecondMind-debug.bat` from a terminal — you'll see `[backend]` log lines if it launched successfully, or an error message if it failed.

> **Why does browser mode work but desktop mode doesn't?** In browser mode (Option B) you start uvicorn manually, so you see the error immediately if something is wrong. In desktop mode the backend is a hidden child process — failures are invisible unless you check the debug output.

### Windows: "Electron failed to install correctly" error

This happens on newer versions of Node.js (v18+, especially v22+). Node's built-in zip extraction is incompatible with the package Electron uses to unpack its binary — the download succeeds but the executable is never written to disk.

**Fix:** open a PowerShell window in the secondmind folder and run:

```powershell
.\fix-electron.ps1
```

This script finds the already-downloaded zip in the Electron cache and extracts it correctly using PowerShell's own `Expand-Archive`. It then writes the two metadata files (`path.txt` and `dist/version`) that Electron needs to confirm a successful install.

After it reports success, try running the app again.

> If PowerShell blocks the script with an "execution policy" error, run this first:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```

---

### The app loads but saves don't appear / backend errors

Make sure Ollama is running (`http://localhost:11434` should respond). The backend starts Ollama calls on every save — if Ollama is stopped, tagging will silently fail but the save itself will still be stored.

---

## Running without the vision model

The `moondream` vision model is optional. If it's not installed, image tagging is skipped gracefully and only text-based tagging runs. Everything else works normally.

---

## Supported sources

| Source | What's captured |
|--------|----------------|
| Instagram photos | Image, caption, carousel slides |
| Instagram Reels | Video thumbnail, caption |
| TikTok videos | Video frame, description, hashtags |
| TikTok slideshows | All slide images, description |
| YouTube | Thumbnail, title, description |
| Pinterest | Image, title |
| Reddit | Title, post content |
| Spotify | Cover art, title |
| Products (Zara, IKEA, Etsy…) | Image, title, price |
| Recipes | Image, title, description |
| Articles / anything else | OG image, title, description |
