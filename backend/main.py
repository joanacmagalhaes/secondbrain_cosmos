from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from datetime import datetime, timezone
import sqlite3
import json
import os
import hashlib
import uuid
import requests as http_requests
from saver import (init_db, scrape, get_all_tags, get_embedding,
                   get_summary, get_topics, get_entities,
                   generate_clusters, DB_PATH)

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
    provided_type: str = ""
    provided_price: str = ""
    is_video: bool = False


class NoteRequest(BaseModel):
    title: str = ""
    content: str = ""


class UpdateRequest(BaseModel):
    tags: list[str] | None = None
    notes: str | None = None
    type: str | None = None


class CollectionRequest(BaseModel):
    name: str
    color: str = '#AFC8E8'


class CollectionUpdateRequest(BaseModel):
    name: str | None = None
    color: str | None = None


class AddItemsRequest(BaseModel):
    save_ids: list[int]


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@app.on_event("startup")
def startup():
    init_db()
    conn = get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS collections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#AFC8E8',
            created_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS collection_items (
            collection_id INTEGER NOT NULL,
            save_id INTEGER NOT NULL,
            added_at TEXT NOT NULL,
            PRIMARY KEY (collection_id, save_id),
            FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
            FOREIGN KEY (save_id) REFERENCES saves(id) ON DELETE CASCADE
        )
    """)
    conn.commit()
    conn.close()


@app.get("/saves/count")
def count_saves():
    conn = get_conn()
    count = conn.execute("SELECT COUNT(*) FROM saves").fetchone()[0]
    conn.close()
    return {"count": count}


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

    # Extension data from the live rendered DOM takes priority — the backend scraper
    # often receives bot-detection or skeleton HTML for JS-heavy/login-gated sites
    title       = body.provided_title       or meta["title"]
    description = body.provided_description or meta["description"]
    _img_candidate = body.provided_image or meta["image"]
    raw_image = _img_candidate if _img_candidate and _img_candidate not in ("undefined", "null") else ""
    price       = body.provided_price       or meta.get("price", "")
    # Extension-detected type wins when scraper falls back to generic "Article"
    if meta["type"] == "Article" and body.provided_type:
        meta["type"] = body.provided_type
    # Allow extension to refine TikTok into a subtype (e.g. slideshow vs video)
    if body.provided_type == "TikTokSlideshow" and meta["type"] == "TikTok":
        meta["type"] = "TikTokSlideshow"
    if body.is_video and meta["type"] == "Instagram":
        meta["type"] = "InstagramVideo"
    # convert base64 screenshots to file immediately — don't store giant strings in SQLite
    image = _cache_image(raw_image) if raw_image.startswith('data:image/') else raw_image

    # Store raw carousel URLs immediately so the UI can show them; background task will cache them locally
    raw_images = body.provided_images if len(body.provided_images) > 1 else []

    conn.execute(
        "INSERT INTO saves (url, title, description, image, tags, notes, content, type, images, price, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (body.url, title, description, image,
         "[]", body.notes, meta["content"], meta["type"],
         json.dumps(raw_images), price, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM saves WHERE url = ?", (body.url,)).fetchone()
    conn.close()

    background_tasks.add_task(_tag_and_update, dict(row)["id"], title, description, meta["type"], raw_images, body.url)

    return _row_to_dict(row)


@app.post("/notes", status_code=201)
def create_note(body: NoteRequest, background_tasks: BackgroundTasks):
    title   = body.title.strip() or "Untitled note"
    content = body.content.strip()
    note_url = f"note://{uuid.uuid4()}"

    conn = get_conn()
    conn.execute(
        "INSERT INTO saves (url, title, description, image, tags, notes, content, type, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (note_url, title, content, "", "[]", "", content, "Note",
         datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM saves WHERE url = ?", (note_url,)).fetchone()
    conn.close()

    save_id = dict(row)["id"]
    # Pass content as description so the AI pipeline has full context
    background_tasks.add_task(_tag_and_update, save_id, title, content, "Note", [], "")

    return _row_to_dict(row)


@app.post("/uploads", status_code=201)
async def upload_image(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    if file.content_type not in ("image/png", "image/jpeg"):
        raise HTTPException(status_code=422, detail="Only PNG and JPG files are supported")

    data = await file.read()
    ext = "png" if file.content_type == "image/png" else "jpg"
    filename = hashlib.md5(data).hexdigest() + "." + ext
    filepath = os.path.join(IMAGES_DIR, filename)
    if not os.path.exists(filepath):
        with open(filepath, "wb") as f:
            f.write(data)

    local_url = f"{IMAGE_BASE_URL}/images/{filename}"
    upload_url = f"upload://{uuid.uuid4()}"
    title = file.filename or "Uploaded image"

    conn = get_conn()
    conn.execute(
        "INSERT INTO saves (url, title, description, image, tags, notes, content, type, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (upload_url, title, "", local_url, "[]", "", "", "Image",
         datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM saves WHERE url = ?", (upload_url,)).fetchone()
    conn.close()

    save_id = dict(row)["id"]
    background_tasks.add_task(_tag_and_update, save_id, title, "", "Image", [], "")

    return _row_to_dict(row)


TYPE_DEFAULT_TAGS = {
    "Instagram": ["instagram"],
    "TikTok": ["tiktok", "video"],
    "TikTokSlideshow": ["tiktok"],
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

    row = conn.execute("SELECT content FROM saves WHERE id = ?", (save_id,)).fetchone()
    content = row[0] if row else ""

    embedding = get_embedding(title, description, content or "")
    summary   = get_summary(title, description, content or "")
    topics    = get_topics(title, description)
    entities  = get_entities(title, description, content or "")

    conn.execute(
        "UPDATE saves SET tags = ?, image = ?, images = ?, embedding = ?, "
        "summary = ?, topics = ?, entities = ? WHERE id = ?",
        (json.dumps(tags), local_image, json.dumps(cached_images),
         json.dumps(embedding) if embedding else None,
         summary, json.dumps(topics), json.dumps(entities), save_id)
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


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = sum(x * x for x in a) ** 0.5
    mag_b = sum(x * x for x in b) ** 0.5
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


@app.get("/search")
def semantic_search(q: str = "", limit: int = 50):
    if not q.strip():
        return []

    query_embedding = get_embedding(q, "", "")

    conn = get_conn()

    if not query_embedding:
        # Ollama unavailable — fall back to plain text match
        rows = conn.execute(
            "SELECT * FROM saves WHERE lower(title) LIKE lower(?) OR lower(description) LIKE lower(?) OR lower(notes) LIKE lower(?)",
            [f"%{q}%", f"%{q}%", f"%{q}%"]
        ).fetchall()
        conn.close()
        return [_row_to_dict(r) for r in rows]

    rows = conn.execute("SELECT * FROM saves WHERE embedding IS NOT NULL").fetchall()
    conn.close()

    scored = []
    for row in rows:
        emb = json.loads(row["embedding"] or "[]")
        if emb:
            score = _cosine_similarity(query_embedding, emb)
            if score > 0.2:
                scored.append((score, row))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [_row_to_dict(row) for _, row in scored[:limit]]


@app.get("/saves/{save_id}/similar")
def similar_saves(save_id: int, limit: int = 10):
    conn = get_conn()
    target = conn.execute("SELECT * FROM saves WHERE id = ?", (save_id,)).fetchone()
    if not target:
        conn.close()
        raise HTTPException(status_code=404, detail="Not found")

    target_embedding = json.loads(target["embedding"] or "[]")
    if not target_embedding:
        conn.close()
        raise HTTPException(status_code=422, detail="This item has no embedding yet")

    rows = conn.execute(
        "SELECT * FROM saves WHERE id != ? AND embedding IS NOT NULL", (save_id,)
    ).fetchall()
    conn.close()

    scored = []
    for row in rows:
        emb = json.loads(row["embedding"] or "[]")
        if emb:
            scored.append((_cosine_similarity(target_embedding, emb), row))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [_row_to_dict(row) for _, row in scored[:limit]]


@app.get("/clusters")
def get_clusters():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM clusters ORDER BY id").fetchall()
    if not rows:
        conn.close()
        return []

    result = []
    for row in rows:
        item_ids = json.loads(row["item_ids"])
        placeholders = ",".join("?" * len(item_ids))
        saves = conn.execute(
            f"SELECT * FROM saves WHERE id IN ({placeholders})", item_ids
        ).fetchall()
        result.append({
            "id": row["id"],
            "name": row["name"],
            "item_ids": item_ids,
            "saves": [_row_to_dict(s) for s in saves],
            "generated_at": row["generated_at"],
        })
    conn.close()
    return result


@app.post("/clusters/generate")
def generate_clusters_endpoint(background_tasks: BackgroundTasks):
    conn = get_conn()
    n = conn.execute("SELECT COUNT(*) FROM saves WHERE embedding IS NOT NULL").fetchone()[0]
    conn.close()

    if n < 3:
        raise HTTPException(status_code=422, detail="Need at least 3 saves with embeddings to cluster")

    def _run():
        c = sqlite3.connect(DB_PATH)
        c.row_factory = sqlite3.Row
        clusters = generate_clusters(c)
        c.execute("DELETE FROM clusters")
        for cluster in clusters:
            c.execute(
                "INSERT INTO clusters (name, item_ids, generated_at) VALUES (?, ?, ?)",
                (cluster["name"], json.dumps(cluster["item_ids"]), datetime.now(timezone.utc).isoformat())
            )
        c.commit()
        c.close()
        print(f"Clusters generated: {len(clusters)}")

    background_tasks.add_task(_run)
    return {"queued": True, "embedded_saves": n}


@app.post("/embeddings/backfill")
def backfill_embeddings(background_tasks: BackgroundTasks, force: bool = False):
    """Generate embeddings for saves that don't have one yet.
    Pass ?force=true to re-embed ALL saves (fixes saves that had bad metadata when first embedded)."""
    conn = get_conn()
    query = "SELECT id, title, description, content FROM saves" if force else \
            "SELECT id, title, description, content FROM saves WHERE embedding IS NULL"
    rows = conn.execute(query).fetchall()
    conn.close()

    if not rows:
        return {"queued": 0}

    def _run():
        c = sqlite3.connect(DB_PATH)
        for row in rows:
            emb = get_embedding(row["title"] or "", row["description"] or "", row["content"] or "")
            if emb:
                c.execute("UPDATE saves SET embedding = ? WHERE id = ?", (json.dumps(emb), row["id"]))
                c.commit()
        c.close()

    background_tasks.add_task(_run)
    return {"queued": len(rows)}


@app.get("/collections")
def list_collections():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM collections ORDER BY created_at DESC").fetchall()
    result = []
    for c in rows:
        cid = c["id"]
        count = conn.execute(
            "SELECT COUNT(*) FROM collection_items WHERE collection_id = ?", (cid,)
        ).fetchone()[0]
        previews = conn.execute(
            "SELECT s.image FROM collection_items ci JOIN saves s ON s.id = ci.save_id "
            "WHERE ci.collection_id = ? AND s.image != '' AND s.image IS NOT NULL "
            "ORDER BY ci.added_at DESC LIMIT 3",
            (cid,)
        ).fetchall()
        result.append({
            "id": cid,
            "name": c["name"],
            "color": c["color"],
            "save_count": count,
            "preview_images": [p["image"] for p in previews],
            "created_at": c["created_at"],
        })
    conn.close()
    return result


@app.post("/collections", status_code=201)
def create_collection(body: CollectionRequest):
    conn = get_conn()
    conn.execute(
        "INSERT INTO collections (name, color, created_at) VALUES (?, ?, ?)",
        (body.name.strip(), body.color, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM collections ORDER BY id DESC LIMIT 1").fetchone()
    conn.close()
    return {
        "id": row["id"], "name": row["name"], "color": row["color"],
        "save_count": 0, "preview_images": [], "created_at": row["created_at"],
    }


@app.patch("/collections/{coll_id}")
def update_collection(coll_id: int, body: CollectionUpdateRequest):
    conn = get_conn()
    row = conn.execute("SELECT * FROM collections WHERE id = ?", (coll_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Not found")
    name  = body.name  if body.name  is not None else row["name"]
    color = body.color if body.color is not None else row["color"]
    conn.execute("UPDATE collections SET name = ?, color = ? WHERE id = ?", (name, color, coll_id))
    conn.commit()
    conn.close()
    return {"id": coll_id, "name": name, "color": color}


@app.delete("/collections/{coll_id}", status_code=204)
def delete_collection(coll_id: int):
    conn = get_conn()
    conn.execute("DELETE FROM collections WHERE id = ?", (coll_id,))
    conn.commit()
    conn.close()


@app.get("/collections/{coll_id}/saves")
def get_collection_saves(coll_id: int):
    conn = get_conn()
    rows = conn.execute(
        "SELECT s.* FROM collection_items ci JOIN saves s ON s.id = ci.save_id "
        "WHERE ci.collection_id = ? ORDER BY ci.added_at DESC",
        (coll_id,),
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


@app.post("/collections/{coll_id}/items", status_code=201)
def add_to_collection(coll_id: int, body: AddItemsRequest):
    conn = get_conn()
    now = datetime.now(timezone.utc).isoformat()
    added = 0
    for sid in body.save_ids:
        try:
            conn.execute(
                "INSERT OR IGNORE INTO collection_items (collection_id, save_id, added_at) VALUES (?, ?, ?)",
                (coll_id, sid, now),
            )
            added += 1
        except Exception:
            pass
    conn.commit()
    conn.close()
    return {"added": added}


@app.delete("/collections/{coll_id}/items/{save_id}", status_code=204)
def remove_from_collection(coll_id: int, save_id: int):
    conn = get_conn()
    conn.execute(
        "DELETE FROM collection_items WHERE collection_id = ? AND save_id = ?",
        (coll_id, save_id),
    )
    conn.commit()
    conn.close()


def _row_to_dict(row):
    d = dict(row)
    for key in ("tags", "images", "topics", "entities"):
        try:
            d[key] = json.loads(d.get(key) or "[]")
        except Exception:
            d[key] = []
    d.setdefault("price", "")
    d.setdefault("summary", "")
    d.pop("embedding", None)  # never send the raw vector to the frontend
    return d
