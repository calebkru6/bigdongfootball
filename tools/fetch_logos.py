"""Download each season's team logos into public/img/logos/ and write public/img/logos/index.json.

ESPN logo URLs come from espn/team-logos.json (extracted locally from the raw capture with
extract_espn_logos.py); Sleeper team avatars come from raw/sleeper/<season>/users.json, which is
the league snapshot for that season, so a team's logo is the one it used that year.
Existing files are kept, so re-running only fetches what is new. Usage: python -I fetch_logos.py
"""
import json, pathlib, urllib.request, hashlib, mimetypes, sys

HERE = pathlib.Path(__file__).resolve().parent
SITE = HERE.parent
ESPN = SITE / "espn"
RAW = SITE / "raw" / "sleeper"
OUT = SITE / "public" / "img" / "logos"
IDENT = json.loads((HERE / "identity_map.json").read_text(encoding="utf-8"))
FR_BY_ESPN = {f["espn_team"]: f["id"] for f in IDENT["franchises"]}
FR_BY_USER = {m["sleeper_user_id"]: next(f["id"] for f in IDENT["franchises"] if f["sleeper_roster_id"] == m["sleeper_roster_id"])
              for m in IDENT["managers"] if m["sleeper_user_id"]}
EXT = {"image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/gif": ".gif", "image/svg+xml": ".svg", "image/webp": ".webp"}

def sniff(data):
    if data[:8] == bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]): return ".png"
    if data[:3] == bytes([0xFF, 0xD8, 0xFF]): return ".jpg"
    if data[:6] in (b"GIF87a", b"GIF89a"): return ".gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP": return ".webp"
    if b"<svg" in data[:600].lower(): return ".svg"
    return None

def fetch_any(url):
    """Try the live URL, then the Wayback Machine (the league's ESPN logos were hotlinked from hosts that have since died)."""
    try:
        return fetch(url)
    except Exception as e:
        err = e
    import re
    for stamp in ("2018", "2017", "2020", "2016"):
        try:
            return fetch(f"https://web.archive.org/web/{stamp}id_/{url}")
        except Exception:
            continue
    raise err

def fetch(url):
    if "upload.wikimedia.org" in url:
        import re
        m = re.match(r"(https?://upload\.wikimedia\.org/wikipedia/commons)/thumb/(.+?)/[^/]+$", url)
        if m:
            url = f"{m.group(1)}/{m.group(2)}"  # fetch the original file instead of a thumbnail size Wikimedia no longer serves
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (league-site logo fetch)", "Accept": "image/*,*/*;q=0.8"})
    with urllib.request.urlopen(req, timeout=25) as r:
        ctype = (r.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        data = r.read()
    ext = sniff(data) or (EXT.get(ctype) if ctype.startswith("image/") else None)
    if not ext or len(data) < 200:
        raise ValueError(f"not an image ({ctype}, {len(data)} bytes)")
    return data, ext

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    index_path = OUT / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {}
    wanted = []  # (season, franchise, url)
    espn = json.loads((ESPN / "team-logos.json").read_text(encoding="utf-8")) if (ESPN / "team-logos.json").exists() else {}
    for season, teams in espn.items():
        for tid, url in teams.items():
            if url:
                wanted.append((season, FR_BY_ESPN.get(f"team-{tid}"), url))
    for d in sorted(RAW.glob("20*")):
        users = json.loads((d / "users.json").read_text(encoding="utf-8"))
        for u in users:
            fr = FR_BY_USER.get(u["user_id"])
            url = (u.get("metadata") or {}).get("avatar") or (f"https://sleepercdn.com/avatars/{u['avatar']}" if u.get("avatar") else None)
            if fr and url:
                wanted.append((d.name, fr, url))
    ok = fail = kept = 0
    by_url = {v["url"]: v["file"] for v in index.values() if v.get("file")}
    for season, fr, url in wanted:
        if not fr:
            continue
        key = f"{season}:{fr}"
        cur = index.get(key)
        if cur and cur.get("url") == url and cur.get("file") and (OUT / cur["file"]).exists():
            kept += 1; continue
        if by_url.get(url) and (OUT / by_url[url]).exists():
            index[key] = {"url": url, "file": by_url[url]}; kept += 1; continue
        try:
            data, ext = fetch_any(url)
            h = hashlib.sha1(data).hexdigest()[:8]
            name = f"{season}-{fr}-{h}{ext}"
            (OUT / name).write_bytes(data)
            index[key] = {"url": url, "file": name}
            by_url[url] = name
            ok += 1
        except Exception as e:
            index[key] = {"url": url, "file": None, "error": str(e)[:120]}
            fail += 1
            print(f"  {season} {fr}: {e} <- {url[:80]}", file=sys.stderr)
    index_path.write_text(json.dumps(index, indent=1), encoding="utf-8")
    print(f"logos: {ok} fetched, {kept} kept, {fail} unavailable")

if __name__ == "__main__":
    main()
