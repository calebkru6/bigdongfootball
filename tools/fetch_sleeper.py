"""Fetch the full BigDongFootball Sleeper league chain into site/raw/sleeper/.
Public read-only API, no auth. Usage: python fetch_sleeper.py <newest_league_id>
"""
import json, sys, time, urllib.request, pathlib, hashlib

ROOT = pathlib.Path(__file__).resolve().parents[1] / "raw" / "sleeper"
BASE = "https://api.sleeper.app/v1"

def get(path):
    url = BASE + path
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa
            if attempt == 3:
                print("FAIL", url, e); return None
            time.sleep(1.5 * (attempt + 1))

def save(rel, obj):
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, indent=1), encoding="utf-8")

def main(newest):
    ROOT.mkdir(parents=True, exist_ok=True)
    manifest = {"fetched_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "leagues": []}
    state = get("/state/nfl"); save("state.json", state)
    lid = newest
    while lid and lid != "0":
        lg = get(f"/league/{lid}")
        if not lg: break
        season = lg["season"]; d = f"{season}"
        print("league", season, lid, lg["name"], lg["status"])
        save(f"{d}/league.json", lg)
        save(f"{d}/users.json", get(f"/league/{lid}/users"))
        save(f"{d}/rosters.json", get(f"/league/{lid}/rosters"))
        save(f"{d}/winners_bracket.json", get(f"/league/{lid}/winners_bracket"))
        save(f"{d}/losers_bracket.json", get(f"/league/{lid}/losers_bracket"))
        save(f"{d}/traded_picks.json", get(f"/league/{lid}/traded_picks"))
        drafts = get(f"/league/{lid}/drafts") or []
        save(f"{d}/drafts.json", drafts)
        for dr in drafts:
            save(f"{d}/draft-{dr['draft_id']}.json", get(f"/draft/{dr['draft_id']}"))
            save(f"{d}/draft-{dr['draft_id']}-picks.json", get(f"/draft/{dr['draft_id']}/picks"))
            save(f"{d}/draft-{dr['draft_id']}-traded.json", get(f"/draft/{dr['draft_id']}/traded_picks"))
        last_week = 18
        if lg["status"] == "in_season" and state and str(state.get("season")) == str(season):
            last_week = int(state.get("week") or 18)
        for w in range(1, last_week + 1):
            save(f"{d}/matchups-{w:02d}.json", get(f"/league/{lid}/matchups/{w}"))
            save(f"{d}/transactions-{w:02d}.json", get(f"/league/{lid}/transactions/{w}"))
        manifest["leagues"].append({"season": season, "league_id": lid, "status": lg["status"], "weeks_fetched": last_week})
        lid = lg.get("previous_league_id")
    players = get("/players/nfl")
    save("players.json", players)
    manifest["players_count"] = len(players or {})
    save("manifest.json", manifest)
    print("done", json.dumps(manifest, indent=1))

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "1319022882948403200")
