import sqlite3
conn = sqlite3.connect("secondmind.db")
conn.execute("DELETE FROM saves WHERE id = 100")
conn.commit()
print("Deleted save id=100 (broken carousel)")
rows = conn.execute("SELECT id, url FROM saves WHERE url LIKE '%DXwf4AHEtYG%'").fetchall()
print(f"Remaining saves for that post: {rows}")
conn.close()
