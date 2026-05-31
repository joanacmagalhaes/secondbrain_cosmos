import sqlite3, json
conn = sqlite3.connect("secondmind.db")
rows = conn.execute("SELECT id, url, type, image, images, created_at FROM saves ORDER BY created_at DESC LIMIT 10").fetchall()
for r in rows:
    imgs = json.loads(r[4]) if r[4] else []
    img_preview = r[3][:60] if r[3] else "EMPTY"
    print(f"id={r[0]} type={r[2]} created={r[5][:19]}")
    print(f"  url={r[1][:70]}")
    print(f"  image={img_preview}")
    print(f"  images_count={len(imgs)}")
    if imgs:
        print(f"  images[0]={imgs[0][:80]}")
    print()
conn.close()
