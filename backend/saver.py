import sqlite3
import sys
import json
import os
import re
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone
from urllib.parse import urlparse

DB_PATH = "secondmind.db"
OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_EMBED_URL = "http://localhost:11434/api/embeddings"
OLLAMA_MODEL = "llama3.2:latest"
OLLAMA_VISION_MODEL = "moondream"  # run: ollama pull moondream
OLLAMA_EMBED_MODEL = "nomic-embed-text"  # run: ollama pull nomic-embed-text
IMAGES_DIR = "images"


def detect_type_from_url(url):
    """Fast type detection using only the URL — no HTTP request."""
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower().replace("www.", "")
    except Exception:
        return "Article"
    if "instagram.com" in domain:
        path = urlparse(url).path
        if "/reel/" in path or "/tv/" in path:
            return "InstagramVideo"
        return "Instagram"
    domain_types = {
        "youtube.com": "YouTube", "youtu.be": "YouTube",
        "tiktok.com": "TikTok",
        "pinterest.com": "Pinterest", "pinterest.pt": "Pinterest",
        "twitter.com": "Twitter", "x.com": "Twitter",
        "reddit.com": "Reddit",
        "spotify.com": "Spotify",
        "github.com": "GitHub",
        "vimeo.com": "Video", "twitch.tv": "Video",
        "amazon.com": "Product", "amazon.co.uk": "Product",
        "etsy.com": "Product",
        "zara.com": "Product", "zarahome.com": "Product",
        "hm.com": "Product", "hmhome.com": "Product",
        "ikea.com": "Product", "zazzle.com": "Product",
    }
    for d, t in domain_types.items():
        if d in domain:
            return t
    return "Article"


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS saves (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT UNIQUE NOT NULL,
            title TEXT,
            description TEXT,
            image TEXT,
            tags TEXT,
            notes TEXT,
            content TEXT,
            type TEXT,
            created_at TEXT
        )
    """)
    for col in ("content TEXT", "type TEXT", "images TEXT", "price TEXT", "embedding TEXT",
                 "summary TEXT", "topics TEXT", "entities TEXT"):
        try:
            conn.execute(f"ALTER TABLE saves ADD COLUMN {col}")
        except Exception:
            pass
    conn.execute("""
        CREATE TABLE IF NOT EXISTS clusters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            item_ids TEXT NOT NULL,
            generated_at TEXT NOT NULL
        )
    """)
    # backfill type for existing saves that have none
    rows = conn.execute("SELECT id, url FROM saves WHERE type IS NULL").fetchall()
    for row in rows:
        t = detect_type_from_url(row[1])
        conn.execute("UPDATE saves SET type = ? WHERE id = ?", (t, row[0]))
    # migrate existing Instagram saves that are reels/tv to InstagramVideo
    ig_rows = conn.execute("SELECT id, url FROM saves WHERE type = 'Instagram'").fetchall()
    for row in ig_rows:
        path = urlparse(row[1]).path
        if "/reel/" in path or "/tv/" in path:
            conn.execute("UPDATE saves SET type = 'InstagramVideo' WHERE id = ?", (row[0],))
    conn.commit()
    return conn


def detect_type(url, soup):
    domain = urlparse(url).netloc.lower().replace("www.", "")

    if "instagram.com" in domain:
        path = urlparse(url).path
        if "/reel/" in path or "/tv/" in path:
            return "InstagramVideo"
        og_video = soup.find("meta", property="og:video")
        if og_video and og_video.get("content"):
            return "InstagramVideo"
        return "Instagram"

    domain_types = {
        "youtube.com": "YouTube", "youtu.be": "YouTube",
        "tiktok.com": "TikTok",
        "pinterest.com": "Pinterest", "pinterest.pt": "Pinterest",
        "twitter.com": "Twitter", "x.com": "Twitter",
        "reddit.com": "Reddit",
        "spotify.com": "Spotify",
        "github.com": "GitHub",
        "vimeo.com": "Video",
        "twitch.tv": "Video",
        "amazon.com": "Product", "amazon.co.uk": "Product",
        "etsy.com": "Product",
        "zara.com": "Product", "zarahome.com": "Product",
        "hm.com": "Product", "hmhome.com": "Product",
        "ikea.com": "Product", "zazzle.com": "Product",
    }
    for d, t in domain_types.items():
        if d in domain:
            return t

    # og:type hint
    og_type_tag = soup.find("meta", property="og:type")
    og_type = (og_type_tag.get("content", "") if og_type_tag else "").lower()
    if "video" in og_type:
        return "Video"
    if "product" in og_type:
        return "Product"

    # Open Graph product namespace (price tag = almost certainly a product page)
    if soup.find("meta", property=lambda p: p and p.startswith("product:price")):
        return "Product"

    # Schema.org microdata
    if soup.find(attrs={"itemtype": lambda x: x and "schema.org/Product" in x}):
        return "Product"
    if soup.find(attrs={"itemtype": lambda x: x and "Recipe" in x}):
        return "Recipe"

    # JSON-LD structured data
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        try:
            data = json.loads(script.string or "")
            items = data if isinstance(data, list) else [data]
            for item in items:
                schema_type = item.get("@type", "") if isinstance(item, dict) else ""
                if "Recipe" in schema_type:
                    return "Recipe"
                if "Product" in schema_type:
                    return "Product"
                if "VideoObject" in schema_type:
                    return "Video"
        except Exception:
            pass

    if "article" in og_type or "blog" in og_type:
        return "Article"

    return "Article"


def scrape(url):
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"}
    res = requests.get(url, headers=headers, timeout=10)

    # Site blocked the scraper (bot detection, auth wall, etc.) — return empty so
    # extension-provided metadata takes over in the caller
    if res.status_code >= 400:
        return {"title": "", "description": "", "image": "", "content": "", "type": detect_type_from_url(url), "price": ""}

    soup = BeautifulSoup(res.text, "html.parser")

    def meta(prop):
        tag = soup.find("meta", property=prop) or soup.find("meta", attrs={"name": prop})
        return tag["content"].strip() if tag and tag.get("content") else ""

    title = meta("og:title") or (soup.title.string.strip() if soup.title else "")
    description = meta("og:description") or meta("description")
    image = meta("og:image")
    content_type = detect_type(url, soup)

    # Price — Open Graph product namespace or JSON-LD offers
    price = meta("product:price:amount") or meta("og:price:amount")
    if not price:
        for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
            try:
                data = json.loads(script.string or "")
                items = data if isinstance(data, list) else [data]
                for item in items:
                    offers = item.get("offers") if isinstance(item, dict) else None
                    if isinstance(offers, dict):
                        price = str(offers.get("price", "") or "")
                        currency = offers.get("priceCurrency", "")
                        if price:
                            price = f"{currency}{price}" if currency else price
                            break
                    elif isinstance(offers, list) and offers:
                        o = offers[0]
                        price = str(o.get("price", "") or "")
                        currency = o.get("priceCurrency", "")
                        if price:
                            price = f"{currency}{price}" if currency else price
                            break
            except Exception:
                pass
            if price:
                break

    for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()
    raw_text = soup.get_text(separator=" ", strip=True)
    content = " ".join(raw_text.split())[:4000]

    return {"title": title, "description": description, "image": image, "content": content, "type": content_type, "price": price}


def get_tags(title, description):
    prompt = (
        f"Tags for: {title}. {description[:200]}\n"
        "Reply with ONLY a JSON array of 3-5 lowercase tags. Example: [\"food\",\"recipe\",\"italian\"]"
    )
    try:
        res = requests.post(OLLAMA_URL, json={
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False
        }, timeout=60)
        data = res.json()
        if "error" in data:
            print(f"Tagging error: {data['error']}")
            return []
        text = data.get("response", "").strip()
        start = text.find("[")
        end = text.rfind("]") + 1
        if start != -1 and end > start:
            return json.loads(text[start:end])
        return []
    except Exception as e:
        print(f"Tagging failed: {e}")
        return []


def extract_hashtags(text: str) -> list:
    """Pull #hashtags out of a caption and return them as clean lowercase tags."""
    tags = re.findall(r'#(\w+)', text or '')
    seen, result = set(), []
    for t in tags:
        t = t.lower()
        if 1 < len(t) <= 30 and t not in seen:
            seen.add(t)
            result.append(t)
    return result[:10]


def get_vision_tags(image_source: str) -> list:
    """Describe an image with a local Ollama vision model and return tags.
    Accepts a local file path or any URL. Returns [] if the model is not
    installed or the call fails — install with: ollama pull moondream"""
    if not image_source:
        return []
    try:
        import base64 as _b64
        if os.path.exists(image_source):
            with open(image_source, 'rb') as f:
                img_data = f.read()
        elif image_source.startswith('http'):
            r = requests.get(image_source, timeout=10,
                             headers={"User-Agent": "Mozilla/5.0"})
            if r.status_code != 200:
                return []
            img_data = r.content
        else:
            return []

        res = requests.post(OLLAMA_URL, json={
            "model": OLLAMA_VISION_MODEL,
            "prompt": 'List 3-5 short descriptive tags for this image. Reply ONLY with a JSON array of lowercase tags. Example: ["fashion","nails","aesthetic"]',
            "images": [_b64.b64encode(img_data).decode()],
            "stream": False,
        }, timeout=60)

        if res.status_code != 200:
            return []
        text = res.json().get("response", "").strip()
        start, end = text.find("["), text.rfind("]") + 1
        if start != -1 and end > start:
            return [str(t).lower().strip() for t in json.loads(text[start:end])
                    if isinstance(t, str)][:5]
    except Exception as e:
        print(f"Vision tagging failed: {e}")
    return []


def get_embedding(title: str, description: str, content: str = "") -> list[float]:
    """Generate a semantic embedding vector for an item via Ollama nomic-embed-text.
    Returns [] if the model is not installed or the call fails.
    Install with: ollama pull nomic-embed-text"""
    text = f"{title}. {description}. {content[:1000]}".strip()
    if not text:
        return []
    try:
        res = requests.post(OLLAMA_EMBED_URL, json={
            "model": OLLAMA_EMBED_MODEL,
            "prompt": text,
        }, timeout=30)
        if res.status_code != 200:
            return []
        return res.json().get("embedding", [])
    except Exception as e:
        print(f"Embedding failed: {e}")
        return []


def get_summary(title: str, description: str, content: str = "") -> str:
    """Generate a single concise sentence summarising the saved item."""
    context = f"Title: {title}\nDescription: {description[:300]}"
    if content:
        context += f"\nContent snippet: {content[:400]}"
    prompt = (
        f"{context}\n\n"
        "Write one concise sentence (under 20 words) describing what this item is. "
        "Reply with ONLY the sentence, no quotes."
    )
    try:
        res = requests.post(OLLAMA_URL, json={
            "model": OLLAMA_MODEL, "prompt": prompt, "stream": False,
        }, timeout=30)
        return res.json().get("response", "").strip().strip('"').strip("'")
    except Exception as e:
        print(f"Summary failed: {e}")
        return ""


def get_topics(title: str, description: str) -> list:
    """Generate up to 3 broad, high-level topics for the saved item."""
    prompt = (
        f"Title: {title}\nDescription: {description[:300]}\n\n"
        "List 1-3 broad, high-level topics for this item.\n"
        "Topics must be broad categories like 'Film Photography', 'Software Engineering', 'Street Fashion'.\n"
        "NOT specific tags like 'leica', 'python', 'hoodie'.\n"
        "Reply with ONLY a JSON array. Example: [\"Film Photography\", \"Camera Gear\"]"
    )
    try:
        res = requests.post(OLLAMA_URL, json={
            "model": OLLAMA_MODEL, "prompt": prompt, "stream": False,
        }, timeout=30)
        text = res.json().get("response", "").strip()
        start, end = text.find("["), text.rfind("]") + 1
        if start != -1 and end > start:
            return [str(t).strip() for t in json.loads(text[start:end]) if t][:3]
        return []
    except Exception as e:
        print(f"Topics failed: {e}")
        return []


def get_entities(title: str, description: str, content: str = "") -> list:
    """Extract named entities (products, people, places, brands) from the saved item."""
    context = f"Title: {title}\nDescription: {description[:300]}"
    prompt = (
        f"{context}\n\n"
        "Extract named entities explicitly mentioned: products, people, places, brands, or technologies.\n"
        "Return an empty array [] if none are clearly mentioned.\n"
        "Maximum 5 entities. No generic words.\n"
        "Reply with ONLY a JSON array. Example: [\"Leica M6\", \"Daido Moriyama\", \"Porto\"]"
    )
    try:
        res = requests.post(OLLAMA_URL, json={
            "model": OLLAMA_MODEL, "prompt": prompt, "stream": False,
        }, timeout=30)
        text = res.json().get("response", "").strip()
        start, end = text.find("["), text.rfind("]") + 1
        if start != -1 and end > start:
            return [str(e).strip() for e in json.loads(text[start:end]) if e][:5]
        return []
    except Exception as e:
        print(f"Entities failed: {e}")
        return []


def _cosine_sim(a: list, b: list) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = sum(x * x for x in a) ** 0.5
    mag_b = sum(x * x for x in b) ** 0.5
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def _kmeans(embeddings: list, k: int, max_iter: int = 20) -> list:
    import random
    n = len(embeddings)
    if n <= k:
        return list(range(n))

    # k-means++ initialization
    centroids = [list(embeddings[random.randrange(n)])]
    for _ in range(k - 1):
        dists = [max(0.0, 1 - max(_cosine_sim(e, c) for c in centroids)) for e in embeddings]
        total = sum(dists)
        if total == 0:
            centroids.append(list(embeddings[random.randrange(n)]))
            continue
        r, acc = random.random() * total, 0.0
        for i, d in enumerate(dists):
            acc += d
            if acc >= r:
                centroids.append(list(embeddings[i]))
                break

    labels = list(range(n))
    for _ in range(max_iter):
        new_labels = [max(range(k), key=lambda j: _cosine_sim(e, centroids[j])) for e in embeddings]
        if new_labels == labels:
            break
        labels = new_labels
        for j in range(k):
            members = [embeddings[i] for i, l in enumerate(labels) if l == j]
            if members:
                dim = len(members[0])
                centroids[j] = [sum(m[d] for m in members) / len(members) for d in range(dim)]

    return labels


def name_cluster(items: list) -> str:
    """Name a cluster using topic frequency first, Ollama fallback for sparse topics."""
    # Collect all topics across items; each item is (title, description, topics_list)
    from collections import Counter
    topic_counts = Counter()
    for entry in items:
        topics = entry[2] if len(entry) > 2 else []
        for t in topics:
            if t:
                topic_counts[t.strip()] += 1

    if topic_counts:
        top = topic_counts.most_common(1)[0][0]
        return top

    # Fallback: ask Ollama when no topics are available
    lines = '\n'.join(
        f'- "{t}"' + (f' — {d[:120]}' if d else '')
        for t, d, *_ in items[:5]
    )
    prompt = (
        f"A user saved these items together:\n{lines}\n\n"
        "What is the single broadest theme that ALL of these items share?\n"
        "Rules:\n"
        "- Focus on what every item has in common, not what makes one item unique\n"
        "- Use a broad category name, not a specific detail from one item\n"
        "- Good: 'Travel', 'Food & Cooking', 'Tech & Dev', 'Fashion'\n"
        "- Bad: 'Traveling in Lisbon' (too specific), 'Digital Detritus' (too vague)\n"
        "- 1-3 words maximum\n"
        "Reply with ONLY the name, no quotes, no punctuation."
    )
    try:
        res = requests.post(OLLAMA_URL, json={
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
        }, timeout=30)
        name = res.json().get("response", "").strip().strip('"').strip("'")
        return name or "Collection"
    except Exception as e:
        print(f"Cluster naming failed: {e}")
        return "Collection"


def _kmeans_score(embeddings: list, labels: list) -> float:
    """Average intra-cluster cosine similarity — higher is better."""
    from collections import defaultdict
    groups = defaultdict(list)
    for i, l in enumerate(labels):
        groups[l].append(embeddings[i])
    total, count = 0.0, 0
    for members in groups.values():
        if len(members) < 2:
            continue
        dim = len(members[0])
        centroid = [sum(m[d] for m in members) / len(members) for d in range(dim)]
        for m in members:
            total += _cosine_sim(m, centroid)
            count += 1
    return total / count if count else 0.0


def generate_clusters(conn) -> list:
    """Group saves by primary topic. Each unique topic is its own cluster.
    Only saves with no topics at all fall back to embedding-based assignment."""
    rows = conn.execute(
        "SELECT id, embedding, topics FROM saves WHERE embedding IS NOT NULL"
    ).fetchall()

    if len(rows) < 3:
        return []

    ids         = [r[0] for r in rows]
    embeddings  = [json.loads(r[1]) for r in rows]
    topics_list = [json.loads(r[2]) if r[2] else [] for r in rows]

    topic_groups: dict[str, list] = {}
    no_topic: list = []

    for i, topics in enumerate(topics_list):
        if topics:
            topic_groups.setdefault(topics[0], []).append(i)
        else:
            no_topic.append(i)

    # Only saves with truly missing topics fall back to embedding distance
    if no_topic and topic_groups:
        def _centroid(idxs):
            embs = [embeddings[i] for i in idxs]
            dim  = len(embs[0])
            return [sum(e[d] for e in embs) / len(embs) for d in range(dim)]
        centroids = {t: _centroid(idxs) for t, idxs in topic_groups.items()}
        for i in no_topic:
            best = max(centroids, key=lambda t: _cosine_sim(embeddings[i], centroids[t]))
            topic_groups[best].append(i)

    return [{"name": name, "item_ids": [ids[i] for i in idxs]}
            for name, idxs in topic_groups.items()]


def get_all_tags(title: str, description: str, image_source: str = "") -> list:
    """Combine hashtag extraction, LLM text tags, and optional vision tags."""
    seen, result = set(), []

    def add(tags):
        for t in tags:
            t = str(t).lower().strip()
            if t and t not in seen:
                seen.add(t)
                result.append(t)

    add(extract_hashtags(description))   # highest signal for social posts
    add(get_tags(title, description))    # LLM from title + caption
    if image_source:
        add(get_vision_tags(image_source))  # vision analysis
    return result[:12]


def save(url, notes=""):
    conn = init_db()
    print(f"Scraping {url}...")
    meta = scrape(url)
    print(f"  Title: {meta['title']}  Type: {meta['type']}")
    print("Getting tags from Ollama...")
    tags = get_tags(meta["title"], meta["description"])
    print(f"  Tags: {tags}")
    try:
        conn.execute(
            "INSERT INTO saves (url, title, description, image, tags, notes, content, type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (url, meta["title"], meta["description"], meta["image"],
             json.dumps(tags), notes, meta["content"], meta["type"], datetime.now(timezone.utc).isoformat())
        )
        conn.commit()
        print("Saved!")
    except sqlite3.IntegrityError:
        print("Already saved.")
    finally:
        conn.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python saver.py <url> [notes]")
        sys.exit(1)
    save(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "")
