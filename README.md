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

### 1. Clone the repo

```bash
git clone https://github.com/your-username/secondmind.git
cd secondmind
```

### 2. Set up Ollama (AI tagging)

Download and install Ollama from [ollama.com](https://ollama.com), then pull the models:

```bash
# Text tagging model (required)
ollama pull llama3.2

# Vision model for image tagging (optional but recommended)
ollama pull moondream
```

Ollama runs automatically in the background after installation. You can verify it's running at `http://localhost:11434`.

### 3. Set up the backend

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv

# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the backend
uvicorn main:app --reload
```

The backend runs at `http://localhost:8000`. The SQLite database (`secondmind.db`) and cached images (`images/`) are created automatically on first run.

### 4. Set up the frontend

Open a new terminal:

```bash
cd frontend
npm install
npm run dev
```

The app opens at `http://localhost:5173`.

### 5. Install the Chrome extension

1. Open your browser and go to the extensions page:
   - Chrome: `chrome://extensions`
   - Brave: `brave://extensions`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select the `extension/` folder from this repo

The secondmind icon will appear in your toolbar. Pin it for easy access.

---

## Starting the app

Instead of opening terminals manually every time, you can double-click the start script at the root of the repo:

- **Windows**: double-click `start.bat`
- **macOS / Linux**: run `chmod +x start.sh` once, then double-click `start.sh`

This opens the backend and frontend in separate terminal windows and launches the app in your browser automatically. Ollama runs as a background service and starts on its own after installation.

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
