from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from datetime import datetime, timezone
import sqlite3
import json
import os
import hashlib
import requests as http_requests
from saver import init_db, scrape, get_all_tags, DB_PATH

IMAGES_DIR = "images"
IMAGE_BASE_URL = "http://localhost:8000"
os.makedirs(IMAGES_DIR, exist_ok=True)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/images", StaticFiles(directory=IMAGES_DIR), name="images")


class SaveRequest(BaseModel):
    url: str
    notes: str = ""
    provided_title: str = ""
    provided_description: str = ""
    provided_image: str = ""
    provided_images: list[str] = []
    is_video: bool = False


class UpdateRequest(BaseModel):
    tags: list[str] | None = None
    notes: str | None = None
    type: str | None = None


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@app.on_event("startup")
def startup():
    init_db()


@app.get("/saves")
def list_saves(q: str = "", type: str = ""):
    conn = get_conn()
    conditions = []
    params = []

    if q:
        conditions.append(
            "(lower(title) LIKE lower(?) OR lower(description) LIKE lower(?) OR lower(tags) LIKE lower(?) OR lower(notes) LIKE lower(?))"
        )
        params += [f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%"]

    if type:
        conditions.append("type = ?")
        params.append(type)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = conn.execute(f"SELECT * FROM saves {where} ORDER BY created_at DESC", params).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


@app.get("/types")
def list_types():
    conn = get_conn()
    rows = conn.execute(
        "SELECT type, COUNT(*) as count FROM saves WHERE type IS NOT NULL GROUP BY type ORDER BY count DESC"
    ).fetchall()
    conn.close()
    return [{"type": r["type"], "count": r["count"]} for r in rows]


@app.get("/saves/{save_id}")
def get_save(save_id: int):
    conn = get_conn()
    row = conn.execute("SELECT * FROM saves WHERE id = ?", (save_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return _row_to_dict(row)


@app.post("/saves", status_code=201)
def create_save(body: SaveRequest, background_tasks: BackgroundTasks):
    conn = get_conn()
    if conn.execute("SELECT id FROM saves WHERE url = ?", (body.url,)).fetchone():
        conn.close()
        raise HTTPException(status_code=409, detail="Already saved")

    try:
        meta = scrape(body.url)
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=422, detail=f"Could not scrape URL: {e}")

    # prefer browser-extracted values (work on login-gated sites like Instagram)
    title       = meta["title"]       or body.provided_title
    description = meta["description"] or body.provided_description
    raw_image   = meta["image"]       or body.provided_image
    if body.is_video and meta["type"] == "Instagram":
        meta["type"] = "InstagramVideo"
    # convert base64 screenshots to file immediately — don't store giant strings in SQLite
    image = _cache_image(raw_image) if raw_image.startswith('data:image/') else raw_image

    # Store raw carousel URLs immediately so the UI can show them; background task will cache them locally
    raw_images = body.provided_images if len(body.provided_images) > 1 else []

    conn.execute(
        "INSERT INTO saves (url, title, description, image, tags, notes, content, type, images, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (body.url, title, description, image,
         "[]", body.notes, meta["content"], meta["type"],
         json.dumps(raw_images), datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM saves WHERE url = ?", (body.url,)).fetchone()
    conn.close()

    background_tasks.add_task(_tag_and_update, dict(row)["id"], title, description, meta["type"], raw_images, body.url)

    return _row_to_dict(row)


TYPE_DEFAULT_TAGS = {
    "Instagram": ["instagram"],
    "TikTok": ["tiktok", "video"],
    "YouTube": ["youtube", "video"],
    "Pinterest": ["pinterest"],
    "Twitter": ["twitter"],
    "Reddit": ["reddit"],
    "Spotify": ["spotify", "music"],
    "GitHub": ["github", "code"],
    "Recipe": ["recipe"],
    "Product": ["product"],
    "Video": ["video"],
}

def _cache_image(url: str, referer: str = "") -> str:
    """Download an image to local storage and return its local URL.
    Falls back to the original URL if the download fails so the frontend
    always has a working URL rather than a broken local path."""
    if not url or url.startswith(IMAGE_BASE_URL):
        return url
    # base64 data URL (e.g. from tab screenshot)
    if url.startswith('data:image/'):
        try:
            import re as _re, base64 as _b64
            m = _re.match(r'data:image/(\w+);base64,(.+)', url, _re.DOTALL)
            if m:
                ext  = m.group(1)
                data = _b64.b64decode(m.group(2))
                filename = hashlib.md5(data).hexdigest() + '.' + ext
                filepath = os.path.join(IMAGES_DIR, filename)
                if not os.path.exists(filepath):
                    with open(filepath, 'wb') as f:
                        f.write(data)
                return f"{IMAGE_BASE_URL}/images/{filename}"
        except Exception as e:
            print(f"Base64 image save failed: {e}")
        return ''
    try:
        ext = url.split("?")[0].rsplit(".", 1)[-1][:4] or "jpg"
        filename = hashlib.md5(url.encode()).hexdigest() + "." + ext
        filepath = os.path.join(IMAGES_DIR, filename)
        if not os.path.exists(filepath):
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": referer or "https://www.instagram.com/",
            }
            res = http_requests.get(url, headers=headers, timeout=15, stream=True)
            if res.status_code == 200:
                with open(filepath, "wb") as f:
                    for chunk in res.iter_content(8192):
                        f.write(chunk)
            else:
                print(f"Image cache failed (HTTP {res.status_code}): {url[:80]}")
                return url  # keep original URL — don't return a path to a file that wasn't written
        return f"{IMAGE_BASE_URL}/images/{filename}"
    except Exception as e:
        print(f"Image cache failed: {e}")
        return url


def _tag_and_update(save_id: int, title: str, description: str, save_type: str = "", raw_images: list = [], post_url: str = ""):
    referer = post_url or "https://www.instagram.com/"
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute("SELECT image FROM saves WHERE id = ?", (save_id,)).fetchone()
    local_image = _cache_image(row[0] if row else "", referer)

    cached_images = [_cache_image(url, referer) for url in raw_images if url]
    cached_images = [u for u in cached_images if u]

    # Resolve local file path for vision analysis (use first carousel image, fall back to thumbnail)
    primary_url = (cached_images[0] if cached_images else local_image) or ""
    image_source = ""
    if primary_url.startswith(IMAGE_BASE_URL):
        fname = primary_url.rsplit("/", 1)[-1]
        fp = os.path.join(IMAGES_DIR, fname)
        if os.path.exists(fp):
            image_source = fp
    elif primary_url.startswith("http"):
        image_source = primary_url  # CDN URL — get_vision_tags will fetch it

    tags = get_all_tags(title, description, image_source)
    if not tags:
        tags = TYPE_DEFAULT_TAGS.get(save_type, ["saved"])
    # Always include the type default tags that aren't already present
    for t in TYPE_DEFAULT_TAGS.get(save_type, []):
        if t not in tags:
            tags.append(t)

    conn.execute(
        "UPDATE saves SET tags = ?, image = ?, images = ? WHERE id = ?",
        (json.dumps(tags), local_image, json.dumps(cached_images), save_id)
    )
    conn.commit()
    conn.close()


@app.patch("/saves/{save_id}")
def update_save(save_id: int, body: UpdateRequest):
    conn = get_conn()
    row = conn.execute("SELECT * FROM saves WHERE id = ?", (save_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Not found")

    tags  = json.dumps(body.tags) if body.tags is not None else row["tags"]
    notes = body.notes if body.notes is not None else row["notes"]
    type_ = body.type  if body.type is not None else row["type"]

    conn.execute("UPDATE saves SET tags = ?, notes = ?, type = ? WHERE id = ?", (tags, notes, type_, save_id))
    conn.commit()
    updated = conn.execute("SELECT * FROM saves WHERE id = ?", (save_id,)).fetchone()
    conn.close()
    return _row_to_dict(updated)


@app.delete("/saves/{save_id}", status_code=204)
def delete_save(save_id: int):
    conn = get_conn()
    conn.execute("DELETE FROM saves WHERE id = ?", (save_id,))
    conn.commit()
    conn.close()


@app.post("/import/instagram")
def import_instagram(data: dict):
    saved_media = data.get("saved_saved_media", [])
    conn = get_conn()
    inserted = 0
    for item in saved_media:
        media_map = item.get("string_map_data", {})
        href = media_map.get("Saved on", {}).get("href", "")
        title = media_map.get("Saved on", {}).get("value", "Instagram post")
        if not href:
            continue
        if conn.execute("SELECT id FROM saves WHERE url = ?", (href,)).fetchone():
            continue
        conn.execute(
            "INSERT INTO saves (url, title, description, image, tags, notes, content, type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (href, title, "", "", json.dumps(["instagram", "import"]), "", "", "Instagram", datetime.now(timezone.utc).isoformat()),
        )
        inserted += 1
    conn.commit()
    conn.close()
    return {"inserted": inserted}


def _row_to_dict(row):
    d = dict(row)
    try:
        d["tags"] = json.loads(d.get("tags") or "[]")
    except Exception:
        d["tags"] = []
    try:
        d["images"] = json.loads(d.get("images") or "[]")
    except Exception:
        d["images"] = []
    return d
